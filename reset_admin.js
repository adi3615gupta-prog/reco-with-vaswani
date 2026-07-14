import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, updateDoc, collection, getDocs, query, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDfE2DBpfE5Oj5nwtErub8X0tvBfMsi9QA",
  authDomain: "reco-vaswani-license.firebaseapp.com",
  projectId: "reco-vaswani-license",
  storageBucket: "reco-vaswani-license.appspot.com",
  messagingSenderId: "594471668759",
  appId: "1:594471668759:web:fb9f997aa87bd7e866e052"
};

const firebaseApp = initializeApp(firebaseConfig);
const firestore = getFirestore(firebaseApp);

const db = new sqlite3.Database('network_data.db');

async function resetPassword() {
    try {
        const hash = await bcrypt.hash('admin', 10);
        
        // 1. Get office_id
        const officeId = await new Promise((resolve) => {
            db.get(`SELECT value FROM app_config WHERE key = 'office_id'`, [], (err, row) => {
                resolve(row ? row.value : null);
            });
        });

        if (!officeId) {
            console.log("No office_id found in local db. App might not be activated properly.");
        }

        // 2. Update local DB
        await new Promise((resolve, reject) => {
            db.run(`UPDATE network_users SET password_hash = ? WHERE username = 'admin'`, [hash], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log("Local SQLite DB admin password updated successfully to 'admin'.");

        // 3. Update Firebase
        if (officeId) {
            const q = query(collection(firestore, 'network_users'), where('office_id', '==', officeId), where('username', '==', 'admin'));
            const snap = await getDocs(q);
            
            if (!snap.empty) {
                for (const d of snap.docs) {
                    await updateDoc(d.ref, { password_hash: hash });
                }
                console.log("Firebase DB admin password updated successfully to 'admin'.");
            } else {
                console.log("Admin user not found in Firebase for office_id: " + officeId);
            }
        }
    } catch (e) {
        console.error("Error resetting password:", e);
    } finally {
        db.close();
        process.exit(0);
    }
}

resetPassword();
