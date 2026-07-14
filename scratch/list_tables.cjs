const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('network_data.db');

db.serialize(() => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
        if (err) {
            console.error(err);
            return;
        }
        console.log("=== Tables in DB ===");
        console.log(tables);
        
        tables.forEach(t => {
            db.all(`PRAGMA table_info(${t.name})`, [], (err, info) => {
                console.log(`Schema for ${t.name}:`);
                console.log(info.map(c => `${c.name} (${c.type})`));
            });
        });
    });
});
db.close();
