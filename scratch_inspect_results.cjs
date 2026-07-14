const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('network_data.db');

db.serialize(() => {
    db.all("SELECT * FROM Recon_Results LIMIT 30", [], (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        console.log("=== Recon Results (Sample 30) ===");
        console.table(rows);
    });
});
db.close();
