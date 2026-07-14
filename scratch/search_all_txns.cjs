const fs = require('fs');
const txns = JSON.parse(fs.readFileSync('scratch_all_txns.json', 'utf8'));
const matching = txns.filter(t => (t.partyName || '').toUpperCase().includes('LABOUR') || (t.ledgerName || '').toUpperCase().includes('LABOUR'));
console.log("=== Transactions with 'Labour' ===");
console.log(JSON.stringify(matching, null, 2));
