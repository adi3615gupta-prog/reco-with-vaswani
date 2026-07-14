const fs = require('fs');
const content = fs.readFileSync('src/pages/TdsReconciliation.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
    if (line.includes('const runReconciliation =')) {
        console.log(`=== runReconciliation at line ${idx + 1} ===`);
        console.log(lines.slice(idx, idx + 40).join('\n'));
    }
});
