const fs = require('fs');
const txns = JSON.parse(fs.readFileSync('scratch_all_txns.json', 'utf8'));

console.log("=== Checking for negative amounts ===");
const negatives = txns.filter(t => t.amount < 0);
console.log("Negatives count:", negatives.length);
if (negatives.length > 0) {
    console.log(JSON.stringify(negatives.slice(0, 10), null, 2));
}

console.log("=== Checking for dates 2025-12-04 or 2026-03-04 ===");
const dates = txns.filter(t => t.date.startsWith('2025-12-04') || t.date.startsWith('2026-03-04'));
console.log("Target dates count:", dates.length);
if (dates.length > 0) {
    console.log(JSON.stringify(dates.slice(0, 10), null, 2));
}
