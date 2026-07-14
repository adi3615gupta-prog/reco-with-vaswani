const fs = require('fs');
const content = fs.readFileSync('src/pages/TdsReconciliation.tsx', 'utf8');

const matches = content.match(/useEffect\([\s\S]*?\)/g) || [];
console.log("=== useEffect blocks found ===");
matches.forEach((m, idx) => {
    console.log(`--- useEffect #${idx + 1} ---`);
    console.log(m.slice(0, 300) + (m.length > 300 ? '...' : ''));
});
