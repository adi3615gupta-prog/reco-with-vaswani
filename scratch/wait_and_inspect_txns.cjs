const fs = require('fs');

console.log("Waiting for scratch_all_txns.json to be updated...");

let attempts = 0;
function check() {
    attempts++;
    if (fs.existsSync('scratch_all_txns.json')) {
        const stats = fs.statSync('scratch_all_txns.json');
        const now = Date.now();
        const diffMs = now - stats.mtimeMs;
        if (diffMs < 60000) { // Updated in the last 60 seconds
            console.log("Found updated scratch_all_txns.json!");
            try {
                const txns = JSON.parse(fs.readFileSync('scratch_all_txns.json', 'utf8'));
                const kabinTxns = txns.filter(t => (t.partyName || '').toUpperCase().includes('KABIN'));
                console.log("=== Transactions found for KABIN in request payload ===");
                console.log(JSON.stringify(kabinTxns, null, 2));
            } catch (e) {
                console.error("Error reading JSON file:", e.message);
            }
            process.exit(0);
        }
    }
    if (attempts > 120) {
        console.log("Timeout waiting for updates.");
        process.exit(0);
    }
    setTimeout(check, 1000);
}
check();
