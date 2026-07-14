const fs = require('fs');
const content = fs.readFileSync('src/lib/tallyApi.ts', 'utf8').split('\n');

console.log("=== buildVoucherQueryXml definition ===");
content.forEach((line, idx) => {
    if (line.includes('function buildVoucherQueryXml')) {
        console.log(content.slice(idx, idx + 40).join('\n'));
    }
});
