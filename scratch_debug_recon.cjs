const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('network_data.db');

db.serialize(() => {
    db.all("SELECT Recon_Results.*, Party_Masters.party_name FROM Recon_Results JOIN Party_Masters ON Recon_Results.party_id = Party_Masters.id", [], (err, rows) => {
        console.log("=== All Recon Results ===");
        console.log(rows);
    });
});
db.close();
