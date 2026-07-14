import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('network_data.db');

db.all("SELECT * FROM app_config", [], (err, rows) => {
    if (err) {
        console.error("Error:", err);
    } else {
        console.log("App config:", rows);
    }
    db.close();
});
