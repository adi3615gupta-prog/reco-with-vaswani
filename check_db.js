import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('network_data.db');

db.all("SELECT username, role, is_active FROM network_users", [], (err, rows) => {
    if (err) {
        console.error("Error:", err);
    } else {
        console.log("Users in local DB:", rows);
    }
    db.close();
});
