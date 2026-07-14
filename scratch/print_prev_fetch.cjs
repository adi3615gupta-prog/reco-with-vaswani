const { execSync } = require('child_process');

try {
    const prevFile = execSync('git show HEAD~1:src/lib/tallyApi.ts', { encoding: 'utf8' });
    const lines = prevFile.split('\n');
    console.log("=== Previous fetchVouchers definition ===");
    lines.forEach((line, idx) => {
        if (line.includes('async function fetchVouchers') || line.includes('export async function fetchVouchers')) {
            console.log(lines.slice(idx, idx + 70).join('\n'));
        }
    });
} catch (e) {
    console.error("Error:", e.message);
}
