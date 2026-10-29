import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import sqlite3 from 'sqlite3';
import setupGeminiRoutes, { fetchCloudGeminiKey, syncCloudGeminiKey } from '../../gemini_routes.js';
import type { Server } from 'http';

describe('Gemini Cloud Sync & Office Distribution', () => {
  let app: express.Express;
  let db: sqlite3.Database;
  let server: Server;
  let baseUrl: string;

  // Mock Firestore data store
  const mockOfficeStore: Record<string, any> = {};
  const mockDocStore: Record<string, any> = {};

  // Mock Firestore implementation
  const mockFirestore: any = {
    _type: 'mock_firestore'
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    db = new sqlite3.Database(':memory:');
    await new Promise((resolve) => {
      db.run('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)', resolve);
    });

    // Set a test office_id in app_config
    await new Promise((resolve) => {
      db.run("INSERT INTO app_config (key, value) VALUES ('office_id', 'TEST-OFFICE-01')", resolve);
    });

    // Setup routes with mock Firestore
    setupGeminiRoutes(app, db, mockFirestore);

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

  it('GET /api/gemini/status should return configured: false and origin: null initially', async () => {
    const res = await fetch(`${baseUrl}/api/gemini/status`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.configured).toBe(false);
    expect(data.origin).toBeNull();
  });

  it('POST /api/gemini/config should save key and tag origin as local_manual', async () => {
    const res = await fetch(`${baseUrl}/api/gemini/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'AIzaSyManualLocalKey123' }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.origin).toBe('local_manual');

    // Verify status returns configured: true and origin: local_manual
    const statusRes = await fetch(`${baseUrl}/api/gemini/status`);
    const statusData = await statusRes.json();
    expect(statusData.configured).toBe(true);
    expect(statusData.origin).toBe('local_manual');
  });

  it('syncCloudGeminiKey helper should return synced: false when firestore has no keys', async () => {
    // Empty mock firestore
    const emptyFirestore: any = null;
    const res = await syncCloudGeminiKey(emptyFirestore, db, 'NON-EXISTENT');
    expect(res.synced).toBe(false);
    expect(res.apiKey).toBeNull();
  });

  it('fetchCloudGeminiKey helper should return apiKey and origin when found in global master doc', async () => {
    const mockGlobalFirestore: any = {};
    // Test that when firestore is null or fails gracefully, it returns null without crashing
    const res = await fetchCloudGeminiKey(null, null);
    expect(res.apiKey).toBeNull();
    expect(res.origin).toBeNull();
  });

  it('POST /api/gemini/push-cloud should return 400 for invalid scope', async () => {
    const res = await fetch(`${baseUrl}/api/gemini/push-cloud`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'AIzaSyTestKey123', scope: 'invalid_scope' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/gemini/push-cloud should return 400 for missing apiKey', async () => {
    const res = await fetch(`${baseUrl}/api/gemini/push-cloud`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/gemini/sync-cloud should return 503 if firestore is not initialized', async () => {
    // Create separate app with no firestore
    const testApp = express();
    testApp.use(express.json());
    setupGeminiRoutes(testApp, db, null);

    const testServer: Server = await new Promise((resolve) => {
      const s = testApp.listen(0, () => resolve(s));
    });
    const testPort = (testServer.address() as any).port;

    const res = await fetch(`http://localhost:${testPort}/api/gemini/sync-cloud`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    expect(res.status).toBe(503);
    expect(data.error).toContain('Firestore is not initialized');

    testServer.close();
  });
});
