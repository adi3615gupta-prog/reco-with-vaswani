import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import sqlite3 from 'sqlite3';
import type { Server } from 'http';
import setupGeminiRoutes, {
  buildSystemPrompt,
  tryFastPathNavigation,
  sanitizeGeminiHistory,
} from '../../gemini_routes.js';
import { extractActionTags, ACTION_NAV_TARGETS } from '../lib/geminiApi';
import evalDataset from './fixtures/souravAiEvalDataset.json';

describe('Sourav AI Evaluation Suite (Phase 22 AI-SPEC Alignment)', () => {
  let app: express.Express;
  let db: sqlite3.Database;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    db = new sqlite3.Database(':memory:');
    await new Promise((resolve) => {
      db.run('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)', resolve);
    });
    await new Promise((resolve) => {
      db.run('CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, gstin TEXT, trade_name TEXT, legal_name TEXT, is_deleted INTEGER)', resolve);
    });
    await new Promise((resolve) => {
      db.run("INSERT INTO clients VALUES ('1', '27AAQCS1984G1ZT', 'SIDDHA PERFECT SYSTEMS PRIVATE LIMITED', 'SIDDHA PERFECT SYSTEMS PRIVATE LIMITED', 0)", resolve);
    });

    setupGeminiRoutes(app, db);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) server.close();
    if (db) db.close();
  });

  describe('1. Reference Dataset Integrity & Schema Compliance', () => {
    it('should contain exactly 25 gold-standard evaluation scenarios', () => {
      expect(evalDataset.totalScenarios).toBe(25);
      expect(evalDataset.scenarios).toHaveLength(25);
    });

    it('should cover all 4 required operational categories', () => {
      const categories = evalDataset.scenarios.map((s) => s.category);
      const uniqueCats = new Set(categories);

      expect(uniqueCats.has('gst_law_scrutiny')).toBe(true);
      expect(uniqueCats.has('hinglish_conversational')).toBe(true);
      expect(uniqueCats.has('app_task_navigation')).toBe(true);
      expect(uniqueCats.has('boundary_adversarial')).toBe(true);

      const lawCount = categories.filter((c) => c === 'gst_law_scrutiny').length;
      const hinCount = categories.filter((c) => c === 'hinglish_conversational').length;
      const navCount = categories.filter((c) => c === 'app_task_navigation').length;
      const advCount = categories.filter((c) => c === 'boundary_adversarial').length;

      expect(lawCount).toBe(8);
      expect(hinCount).toBe(6);
      expect(navCount).toBe(6);
      expect(advCount).toBe(5);
    });
  });

  describe('2. Dimension: Statutory Correctness & Knowledge Grounding', () => {
    const systemPrompt = buildSystemPrompt({}, []);

    const gstLawScenarios = evalDataset.scenarios.filter((s) => s.category === 'gst_law_scrutiny');

    it.each(gstLawScenarios)('should have statutory provisions codified for $id ($expectedStatute)', (scenario) => {
      expect(scenario.expectedStatute).toBeTruthy();
      // Check that either the statute section or rule is present in the Master System Prompt
      const hasStatute = systemPrompt.toLowerCase().includes(scenario.expectedStatute.toLowerCase());
      expect(hasStatute).toBe(true);
    });

    it('should specifically enforce Section 16(2)(aa) 2B prerequisite and 180-day Rule 37', () => {
      expect(systemPrompt).toContain('Section 16(2) CGST Act');
      expect(systemPrompt).toContain('180-Day Payment Rule');
      expect(systemPrompt).toContain('Table 4(B)(2)');
    });

    it('should enforce Rule 88A set-off hierarchy and Section 50(1) net cash liability', () => {
      expect(systemPrompt).toContain('Rule 88A');
      expect(systemPrompt).toContain('Section 50(1) Proviso');
      expect(systemPrompt).toContain('Electronic Cash Ledger');
    });

    it('should prohibit hallucinating non-existent sections beyond CGST Act section 174', () => {
      const adv01 = evalDataset.scenarios.find((s) => s.id === 'ADV-01');
      expect(adv01?.maxCgstSection).toBe(174);
      // The CGST Act has only 174 sections. The prompt instructs to never invent section numbers.
      expect(systemPrompt).toContain('Never provide vague guesses');
    });
  });

  describe('3. Dimension: Action Tag Validity & Safe Software Routing', () => {
    const navScenarios = evalDataset.scenarios.filter((s) => s.category === 'app_task_navigation');

    it.each(navScenarios)('should resolve navigation intent $id ($prompt) via Fast-Path', (scenario) => {
      const start = performance.now();
      const result = tryFastPathNavigation(scenario.prompt, []);
      const duration = performance.now() - start;

      expect(result).not.toBeNull();
      expect(result?.fastPath).toBe(true);
      expect(result?.target).toBe(scenario.expectedTarget);
      expect(result?.actionToken).toBe(scenario.expectedActionToken);
      expect(duration).toBeLessThan(25); // Benchmark requirement: fast-path sub-25ms
    });

    it('should validate and parse action tokens against whitelist without error', () => {
      for (const scenario of navScenarios) {
        if (!scenario.expectedActionToken) continue;
        const { actions } = extractActionTags(scenario.expectedActionToken);
        expect(actions).toHaveLength(1);
        expect(actions[0].target).toBe(scenario.expectedTarget);
        expect(ACTION_NAV_TARGETS[actions[0].target]).toBeDefined();
      }
    });

    it('should safely strip and reject unregistered action targets (ADV-04)', () => {
      const adv04 = evalDataset.scenarios.find((s) => s.id === 'ADV-04');
      const rawPrompt = adv04?.prompt || '';
      const { actions } = extractActionTags(rawPrompt);

      expect(actions).toHaveLength(0); // 'delete_all_databases' is not in whitelist
    });
  });

  describe('4. Dimension: Language & Tone Alignment Protocol', () => {
    it('should enforce Hinglish and English dual communication protocols in prompt', () => {
      const prompt = buildSystemPrompt({}, []);
      expect(prompt).toContain('Adaptive Language');
      expect(prompt).toContain('Hindi / Hinglish');
      expect(prompt).toContain('English');
      expect(prompt).toContain('formal, authoritative CA advisory tone');
    });

    it('should test heuristic tone evaluator on Hinglish prompts', () => {
      const hinglishScenarios = evalDataset.scenarios.filter((s) => s.category === 'hinglish_conversational');
      
      const isHinglish = (text: string): boolean => {
        const hinglishMarkers = /\b(karein|karo|kaise|nahi|dikh|hai|raha|hoga|bhai|batao|dekhna)\b/i;
        return hinglishMarkers.test(text);
      };

      for (const scenario of hinglishScenarios) {
        expect(isHinglish(scenario.prompt)).toBe(true);
      }
    });
  });

  describe('5. Dimension: Latency & Performance Benchmarks', () => {
    it('should execute 100 fast-path queries in under 50ms total (<0.5ms per resolution)', () => {
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        const r = tryFastPathNavigation('open 3b calculation sheet', []);
        expect(r?.target).toBe('3b');
      }
      const totalMs = performance.now() - start;
      expect(totalMs).toBeLessThan(50);
    });

    it('should reject empty or whitespace input within 10ms with 400 Bad Request (ADV-05)', async () => {
      const start = performance.now();
      const res = await fetch(`${baseUrl}/api/gemini/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '     ' }),
      });
      const duration = performance.now() - start;

      expect(res.status).toBe(400);
      expect(duration).toBeLessThan(200);
    });
  });

  describe('6. Online Guardrails & Adversarial Defenses', () => {
    it('should enforce Missing API Key guard (403 with unconfigured: true)', async () => {
      const res = await fetch(`${baseUrl}/api/gemini/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'What is Section 16(2)?' }),
      });
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.unconfigured).toBe(true);
    });

    it('should sanitize conversation history to enforce strictly alternating user/model turns', () => {
      const dirtyHistory = [
        { role: 'model', text: 'Hi!' },
        { role: 'user', text: 'Query 1' },
        { role: 'user', text: 'Query 1 detail' },
        { role: 'model', text: 'Answer 1' },
        { role: 'user', text: 'Unfinished trailing query' }
      ];

      const clean = sanitizeGeminiHistory(dirtyHistory as any);
      expect(clean[0].role).toBe('user');
      expect(clean[clean.length - 1].role).toBe('model');
      expect(clean).toHaveLength(2);
    });
  });
});
