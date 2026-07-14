const fs = require('fs');
const txns = JSON.parse(fs.readFileSync('scratch_all_txns.json', 'utf8'));

const matching = txns.filter(t => 
    Math.abs(t.amount) === 8319 || 
    Math.abs(t.amount) === 10083
);
console.log("=== Transactions with amount 8319 or 10083 ===");
console.log("Count:", matching.length);
if (matching.length > 0) {
    console.log(JSON.stringify(matching, null, 2));
}
