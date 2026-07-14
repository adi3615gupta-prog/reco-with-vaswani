const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('network_data.db');

db.serialize(() => {
    db.all("SELECT * FROM Tally_Transactions WHERE party_name LIKE '%KABIN%'", [], (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        console.log("=== Transactions for KABIN ===");
        console.table(rows);
    });
});
db.close();
