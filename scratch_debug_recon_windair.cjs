const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('network_data.db');

db.serialize(() => {
    db.all("SELECT COUNT(*) as count FROM Recon_Results", [], (err, rows) => {
        console.log("Total Recon Results Count:", rows[0].count);
    });

    db.all("SELECT Recon_Results.*, Party_Masters.party_name FROM Recon_Results LEFT JOIN Party_Masters ON Recon_Results.party_id = Party_Masters.id", [], (err, rows) => {
        console.log("=== All Recon Results (with Party Name) ===");
        console.log("Number of rows:", rows.length);
        const windairRows = rows.filter(r => r.party_name && r.party_name.includes("WINDAIR"));
        console.log("WINDAIR rows:", windairRows);
        const nullPartyRows = rows.filter(r => !r.party_id);
        console.log("Null Party ID rows count:", nullPartyRows.length);
        if (nullPartyRows.length > 0) {
            console.log("Sample null party rows:", nullPartyRows.slice(0, 5));
        }
    });
});
db.close();

