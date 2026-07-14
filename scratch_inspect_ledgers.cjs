const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('network_data.db');

db.serialize(() => {
    db.all("SELECT * FROM Tally_Ledgers", [], (err, rows) => {
        console.log("=== All Tally Ledgers ===");
        console.log(rows);
    });
});
db.close();

