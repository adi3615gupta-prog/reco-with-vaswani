import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import sqlite3 from 'sqlite3';
import setupGeminiRoutes, { sanitizeGeminiHistory, findMatchingClients, buildSystemPrompt } from '../../gemini_routes.js';
import type { Server } from 'http';

describe('Gemini Backend Routes (/api/gemini)', () => {
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

  it('GET /api/gemini/status should return configured: false initially', async () => {
    const res = await fetch(`${baseUrl}/api/gemini/status`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.configured).toBe(false);
  });

  it('POST /api/gemini/chat should return 403 unconfigured when key is missing', async () => {
    const res = await fetch(`${baseUrl}/api/gemini/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello' }),
    });
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.unconfigured).toBe(true);
  });

  it('POST /api/gemini/config should save API key to app_config', async () => {
    const res = await fetch(`${baseUrl}/api/gemini/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'AIzaSyTestKey987654321' }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);

    // Verify status is now true
    const statusRes = await fetch(`${baseUrl}/api/gemini/status`);
    const statusData = await statusRes.json();
    expect(statusData.configured).toBe(true);
  });

  it('POST /api/gemini/chat should return 400 for empty message', async () => {
    const res = await fetch(`${baseUrl}/api/gemini/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    });
    expect(res.status).toBe(400);
  });

  describe('sanitizeGeminiHistory Invariant Enforcer', () => {
    it('should drop leading model messages to ensure conversation starts with user', () => {
      const raw = [
        { role: 'model', text: 'Welcome to Sourav AI!' },
        { role: 'model', text: 'License synced successfully.' },
        { role: 'user', text: 'Hello Sourav' },
        { role: 'model', text: 'Hi! How can I assist?' },
      ];
      const sanitized = sanitizeGeminiHistory(raw as any);

      expect(sanitized[0].role).toBe('user');
      expect(sanitized[0].parts[0].text).toBe('Hello Sourav');
      expect(sanitized[1].role).toBe('model');
      expect(sanitized[1].parts[0].text).toBe('Hi! How can I assist?');
      expect(sanitized).toHaveLength(2);
    });

    it('should merge consecutive same-role turns into a single alternating turn', () => {
      const raw = [
        { role: 'user', text: 'Question 1' },
        { role: 'user', text: 'Also consider this detail' },
        { role: 'model', text: 'Answer 1 part A' },
        { role: 'model', text: 'Answer 1 part B' },
      ];
      const sanitized = sanitizeGeminiHistory(raw as any);

      expect(sanitized).toHaveLength(2);
      expect(sanitized[0].role).toBe('user');
      expect(sanitized[0].parts[0].text).toBe('Question 1\n\nAlso consider this detail');
      expect(sanitized[1].role).toBe('model');
      expect(sanitized[1].parts[0].text).toBe('Answer 1 part A\n\nAnswer 1 part B');
    });

    it('should strip trailing user messages so chat.sendMessage(new_message) alternates cleanly', () => {
      const raw = [
        { role: 'user', text: 'First query' },
        { role: 'model', text: 'First answer' },
        { role: 'user', text: 'Unanswered trailing query' },
      ];
      const sanitized = sanitizeGeminiHistory(raw as any);

      expect(sanitized).toHaveLength(2);
      expect(sanitized[sanitized.length - 1].role).toBe('model');
      expect(sanitized[sanitized.length - 1].parts[0].text).toBe('First answer');
    });

    it('should handle empty or malformed inputs without throwing', () => {
      expect(sanitizeGeminiHistory(null as any)).toEqual([]);
      expect(sanitizeGeminiHistory([] as any)).toEqual([]);
      expect(sanitizeGeminiHistory([{ role: 'unknown', text: 'test' }] as any)).toEqual([]);
      expect(sanitizeGeminiHistory([{ role: 'user', text: '   ' }] as any)).toEqual([]);
    });
  });

  describe('findMatchingClients Query Engine', () => {
    it('should match client from database when user asks by keyword', async () => {
      const matches = await findMatchingClients(db, 'open 3b working of siddha');
      expect(matches).toHaveLength(1);
      expect(matches[0].gstin).toBe('27AAQCS1984G1ZT');
      expect(matches[0].name).toBe('SIDDHA PERFECT SYSTEMS PRIVATE LIMITED');
    });

    it('should return empty array when query has no matching keywords', async () => {
      const matches = await findMatchingClients(db, 'what is the deadline for GSTR-3B?');
      expect(matches).toHaveLength(0);
    });
  });

  describe('buildSystemPrompt Master Knowledge Base', () => {
    it('should infuse GST statutory rules (Sec 16(2), 180-day rule, 16(4), 17(5), Rule 88A, Sec 50)', () => {
      const prompt = buildSystemPrompt({}, []);
      expect(prompt).toContain('Section 16(2) CGST Act');
      expect(prompt).toContain('180-Day Payment Rule');
      expect(prompt).toContain('Table 4(B)(2)');
      expect(prompt).toContain('Section 16(4)');
      expect(prompt).toContain('Section 17(5)');
      expect(prompt).toContain('Rule 88A');
      expect(prompt).toContain('Section 50(1) Proviso');
      expect(prompt).toContain('Rule 88B(3)');
      expect(prompt).toContain('Invoice Management System');
    });

    it('should infuse landmark precedents and scrutiny procedures (Suncraft Energies, D.Y. Beathel, DRC-01, Sec 128A)', () => {
      const prompt = buildSystemPrompt({}, []);
      expect(prompt).toContain('Suncraft Energies Pvt Ltd');
      expect(prompt).toContain('D.Y. Beathel Enterprises');
      expect(prompt).toContain('Bharti Airtel Ltd');
      expect(prompt).toContain('Mohit Minerals');
      expect(prompt).toContain('Eicher Motors');
      expect(prompt).toContain('ASMT-10');
      expect(prompt).toContain('DRC-01B');
      expect(prompt).toContain('DRC-01C');
      expect(prompt).toContain('Section 74A');
      expect(prompt).toContain('Section 128A Amnesty Scheme');
      expect(prompt).toContain('31st March 2025');
    });

    it('should infuse Income Tax AY 2025-26 slabs, 115BAC, TDS, CMA, and Clause 44 knowledge', () => {
      const prompt = buildSystemPrompt({}, []);
      expect(prompt).toContain('Section 115BAC');
      expect(prompt).toContain('Rs 75,000 for AY 2025-26');
      expect(prompt).toContain('Section 87A Full Rebate');
      expect(prompt).toContain('Section 194C');
      expect(prompt).toContain('Section 194J');
      expect(prompt).toContain('Section 194Q');
      expect(prompt).toContain('Tandon Committee MPBF');
      expect(prompt).toContain('Method II (Bank Standard Benchmark)');
      expect(prompt).toContain('Current Ratio: 1.33:1');
      expect(prompt).toContain('Form 3CD Clause 44');
      expect(prompt).toContain('Zero-Merge Architecture');
    });

    it('should dynamically include matched clients with GSTINs for 1-click action buttons', () => {
      const matched = [
        { name: 'SIDDHA PERFECT SYSTEMS PRIVATE LIMITED', gstin: '27AAQCS1984G1ZT' }
      ];
      const prompt = buildSystemPrompt({ clientName: 'SIDDHA PERFECT SYSTEMS', gstin: '27AAQCS1984G1ZT' }, matched);
      expect(prompt).toContain('SIDDHA PERFECT SYSTEMS PRIVATE LIMITED');
      expect(prompt).toContain('27AAQCS1984G1ZT');
      expect(prompt).toContain('[ACTION:navigate:<target>:<gstin>]');
    });
  });
});
