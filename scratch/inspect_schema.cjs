const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('network_data.db');

db.serialize(() => {
    db.all("SELECT * FROM Tally_Transactions LIMIT 1", [], (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        console.log("=== Columns/Keys in Tally_Transactions ===");
        if (rows.length > 0) {
            console.log(Object.keys(rows[0]));
        } else {
            console.log("No rows in table.");
        }
    });
});
db.close();
