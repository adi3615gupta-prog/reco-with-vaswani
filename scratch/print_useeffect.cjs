const fs = require('fs');
const content = fs.readFileSync('src/pages/TdsReconciliation.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
    if (line.includes('useEffect')) {
        console.log(`=== useEffect at line ${idx + 1} ===`);
        console.log(lines.slice(idx, idx + 15).join('\n'));
    }
});
