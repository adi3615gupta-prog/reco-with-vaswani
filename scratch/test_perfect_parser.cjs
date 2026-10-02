const fs = require('fs');

// Test the perfect parser logic on scratch_all_txns.json

const data = JSON.parse(fs.readFileSync('scratch_all_txns.json', 'utf8'));

// Build panMap
const panMap = new Map();
data.forEach(t => {
  if (t.partyName && t.partyPan) {
    const u = t.partyName.toUpperCase().trim();
    panMap.set(u, t.partyPan.trim());
    panMap.set(u.replace(/\s*\([^)]*\)/g, '').trim(), t.partyPan.trim());
  }
});

// Let's inspect Accutax transactions in scratch_all_txns.json
const accutaxTxns = data.filter(t => (t.partyName && t.partyName.includes('ACCUTAX')) || (t.partyPan && t.partyPan === 'BUEPK5759F'));
console.log(`Accutax raw txns in scratch_all_txns.json: ${accutaxTxns.length}`);

let accutaxSpend = 0;
let accutaxTds = 0;

accutaxTxns.forEach(t => {
  if (t.isPayment) return;
  accutaxSpend += (t.amount || 0);
  accutaxTds += (t.actualTdsDeducted || 0);
});

console.log(`Accutax in current dataset -> Spend: ${accutaxSpend}, TDS: ${accutaxTds}`);

// Let's inspect Pramod Mali transactions for exact name "MH14FG9419- PRAMOD MALI ( DRIVER)"
const pramodExact = data.filter(t => t.partyName === 'MH14FG9419- PRAMOD MALI ( DRIVER)' || t.partyPan === 'BPCPM4049H');
console.log(`\nPramod exact party txns count: ${pramodExact.length}`);

let pSpend = 0;
let pTds = 0;
pramodExact.forEach(t => {
  if (t.isPayment) return;
  pSpend += (t.amount || 0);
  pTds += (t.actualTdsDeducted || 0);
});

console.log(`Pramod exact in current dataset -> Spend: ${pSpend}, TDS: ${pTds}`);
