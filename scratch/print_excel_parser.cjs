const fs = require('fs');
const content = fs.readFileSync('src/pages/TdsReconciliation.tsx', 'utf8');
const lines = content.split('\n');

console.log("=== Excel parser lines 730 to 860 ===");
console.log(lines.slice(729, 860).join('\n'));
