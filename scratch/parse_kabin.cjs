const fs = require('fs');
const txns = JSON.parse(fs.readFileSync('scratch_all_txns.json', 'utf8'));
const kabin = txns.filter(t => (t.partyName || '').toUpperCase().includes('KABIN'));
console.log("=== KABIN TXNS IN PAYLOAD ===");
console.log(JSON.stringify(kabin, null, 2));
