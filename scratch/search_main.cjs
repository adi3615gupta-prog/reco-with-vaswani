const fs = require('fs');
const content = fs.readFileSync('main.cjs', 'utf8').split('\n');

console.log("=== Load URL/File matches in main.cjs ===");
content.forEach((line, idx) => {
    if (line.includes('loadURL') || line.includes('loadFile') || line.includes('dist/index.html')) {
        console.log(`${idx + 1}: ${line.trim()}`);
    }
});
