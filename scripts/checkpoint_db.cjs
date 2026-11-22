const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'network_data.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('[-] Could not open network_data.db:', err.message);
        process.exit(1);
    }
});

db.run('PRAGMA wal_checkpoint(FULL);', (err) => {
    if (err) {
        console.error('[-] Checkpoint error:', err.message);
        process.exit(1);
    } else {
        console.log('[+] SQLite WAL checkpoint successful: all pending writes merged into network_data.db');
        db.close(() => {
            process.exit(0);
        });
    }
});
