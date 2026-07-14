const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('network_data.db');

db.serialize(() => {
    db.all("SELECT Recon_Results.*, Party_Masters.party_name FROM Recon_Results JOIN Party_Masters ON Recon_Results.party_id = Party_Masters.id WHERE Recon_Results.section_code = '194Q'", [], (err, rows) => {
        console.log("=== All 194Q Recon Results ===");
        console.log(rows);
    });

    db.all("SELECT * FROM Recon_Results WHERE party_id IS NULL", [], (err, rows) => {
        console.log("=== Recon Results with NULL party_id ===");
        console.log(rows);
    });
});
db.close();
