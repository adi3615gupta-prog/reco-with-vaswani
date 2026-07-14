const express = require('express');
const sqlite3 = require('sqlite3');
const setupTaxRoutes = require('../tax_routes.js').default;

const app = express();
app.use(express.json());

const db = new sqlite3.Database(':memory:');

setupTaxRoutes(app, db);

const server = app.listen(3005, async () => {
  console.log('Test server listening on port 3005');
  try {
    const res = await fetch('http://localhost:3005/api/tax/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id: 'CURRENT_USER',
        name: 'Demo User',
        pan: 'ABCDE1234F',
        age: 35,
        opted_for_new_regime: true,
        financial_year: 'FY2025-26',
        assessment_year: 'AY2026-27',
        residential_status: 'ROR'
      })
    });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Data:', data);
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    server.close();
  }
});
