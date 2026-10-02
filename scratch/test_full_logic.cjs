const fs = require('fs');

// Load panMap from metadata or mock
const data = JSON.parse(fs.readFileSync('scratch_all_txns.json', 'utf8'));

// Build panMap from all txns
const panMap = new Map();
data.forEach(t => {
  if (t.partyName && t.partyPan) {
    const u = t.partyName.toUpperCase().trim();
    panMap.set(u, t.partyPan.trim());
    panMap.set(u.replace(/\s*\([^)]*\)/g, '').trim(), t.partyPan.trim());
  }
});

console.log(`Built panMap with ${panMap.size} entries.`);
console.log('PRAMOD MALI PAN:', panMap.get('MH14FG9419- PRAMOD MALI ( DRIVER)'));

// Filter raw txns for Pramod Mali PAN: BPCPM4049H
const pramodTxns = data.filter(t => t.partyPan === 'BPCPM4049H' || (t.ledgerName && t.ledgerName.includes('PRAMOD MALI')));

console.log('Pramod raw txns count:', pramodTxns.length);
