const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('network_data.db');

db.serialize(() => {
    db.all("SELECT * FROM Party_Masters WHERE party_name LIKE '%WINDAIR%'", [], (err, rows) => {
        console.log("=== Party Masters (WINDAIR) ===");
        console.log(rows);
    });

    db.all("SELECT * FROM Party_Masters LIMIT 10", [], (err, rows) => {
        console.log("=== Party Masters (Sample 10) ===");
        console.log(rows);
    });

    db.all("SELECT Tally_Transactions.*, Party_Masters.party_name FROM Tally_Transactions JOIN Party_Masters ON Tally_Transactions.party_id = Party_Masters.id LIMIT 10", [], (err, rows) => {
        console.log("=== Tally Transactions (Sample 10) ===");
        console.log(rows);
    });

    db.all("SELECT count(*) as count, party_name FROM Party_Masters GROUP BY party_name ORDER BY count DESC LIMIT 20", [], (err, rows) => {
        console.log("=== Top Parties ===");
        console.log(rows);
    });
});
db.close();
