const fs = require('fs');
const txns = JSON.parse(fs.readFileSync('scratch_all_txns.json', 'utf8'));
const matching = txns.filter(t => t.date.startsWith('2025-10-18'));
console.log("=== Transactions on 2025-10-18 ===");
console.log("Count:", matching.length);
if (matching.length > 0) {
    console.log(JSON.stringify(matching.slice(0, 5), null, 2));
}
