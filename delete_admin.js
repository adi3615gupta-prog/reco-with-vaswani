import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('network_data.db');

db.run(`DELETE FROM network_users WHERE username = 'admin'`, [], function(err) {
    if (err) {
        console.error("Error deleting admin from local DB:", err);
    } else {
        console.log("Admin user successfully deleted from local DB.");
    }
    db.close();
});
