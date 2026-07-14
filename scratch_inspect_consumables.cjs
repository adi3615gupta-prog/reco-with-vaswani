const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('network_data.db');

db.serialize(() => {
    db.all("SELECT * FROM Tally_Ledgers WHERE ledger_name LIKE '%CONSUMABLES%'", [], (err, rows) => {
        console.log("=== Tally Ledgers (CONSUMABLES) ===");
        console.log(rows);
    });

    db.all("SELECT * FROM Tally_Transactions LIMIT 5", [], (err, rows) => {
        console.log("=== Transactions Sample ===");
        console.log(rows);
    });
});
db.close();
