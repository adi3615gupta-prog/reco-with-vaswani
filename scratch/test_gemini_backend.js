import express from 'express';
import sqlite3 from 'sqlite3';
import setupGeminiRoutes from '../gemini_routes.js';

async function runTest() {
  console.log('--- Testing Gemini Backend Routes ---');

  const app = express();
  app.use(express.json());

  // Use in-memory SQLite database
  const db = new sqlite3.Database(':memory:');
  
  await new Promise((resolve) => {
    db.run('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)', resolve);
  });

  // Mount gemini routes
  setupGeminiRoutes(app, db);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  console.log(`Test server running on port ${port}`);

  try {
    // Test 1: GET /api/gemini/status before key is set
    const res1 = await fetch(`${baseUrl}/api/gemini/status`);
    const data1 = await res1.json();
    console.log('1. Status check (empty):', data1);
    if (data1.configured !== false) throw new Error('Expected configured: false');

    // Test 2: POST /api/gemini/chat before key is set -> should return 403
    const res2 = await fetch(`${baseUrl}/api/gemini/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello' })
    });
    const data2 = await res2.json();
    console.log('2. Chat without key (should 403):', res2.status, data2);
    if (res2.status !== 403 || !data2.unconfigured) throw new Error('Expected 403 unconfigured');

    // Test 3: POST /api/gemini/config -> save key
    const testKey = 'AIzaSyFakeTestKeyForValidation1234567890';
    const res3 = await fetch(`${baseUrl}/api/gemini/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: testKey })
    });
    const data3 = await res3.json();
    console.log('3. Save config result:', data3);
    if (!data3.ok) throw new Error('Failed to save config');

    // Test 4: GET /api/gemini/status after key is set -> should return configured: true
    const res4 = await fetch(`${baseUrl}/api/gemini/status`);
    const data4 = await res4.json();
    console.log('4. Status check (configured):', data4);
    if (data4.configured !== true) throw new Error('Expected configured: true');

    // Test 5: Verify key stored in SQLite
    const row = await new Promise((resolve) => {
      db.get("SELECT value FROM app_config WHERE key = 'gemini_api_key'", [], (err, r) => resolve(r));
    });
    console.log('5. Key in DB verified:', row.value === testKey ? 'MATCH' : 'MISMATCH');
    if (row.value !== testKey) throw new Error('Key in DB does not match');

    // Test 6: POST /api/gemini/chat with missing message -> should return 400
    const res6 = await fetch(`${baseUrl}/api/gemini/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '' })
    });
    console.log('6. Empty message check (should 400):', res6.status);
    if (res6.status !== 400) throw new Error('Expected 400 for empty message');

    console.log('\n ALL 6 BACKEND TESTS PASSED SUCCESSFULLY! \n');
  } finally {
    server.close();
    db.close();
  }
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
