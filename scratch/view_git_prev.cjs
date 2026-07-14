const { execSync } = require('child_process');

try {
    const prevFile = execSync('git show HEAD~1:src/lib/tallyApi.ts', { encoding: 'utf8' });
    const lines = prevFile.split('\n');
    console.log("=== Exports in previous tallyApi.ts ===");
    lines.forEach((line, idx) => {
        if (line.trim().startsWith('export ')) {
            console.log(`${idx + 1}: ${line.trim()}`);
        }
    });
} catch (e) {
    console.error("Error running git show:", e.message);
}
