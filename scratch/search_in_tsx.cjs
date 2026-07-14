const fs = require('fs');
const content = fs.readFileSync('src/pages/TdsReconciliation.tsx', 'utf8');

const lines = content.split('\n');
console.log("=== Matches in TdsReconciliation.tsx ===");
lines.forEach((line, idx) => {
    if (line.toLowerCase().includes('tally') || line.toLowerCase().includes('fetch')) {
        console.log(`${idx + 1}: ${line.trim()}`);
    }
});
