import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import sqlite3 from 'sqlite3';
import setupGeminiRoutes from '../../gemini_routes.js';
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
});
