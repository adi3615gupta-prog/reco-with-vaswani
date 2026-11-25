import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { initializeApp } from "firebase/app";
import { getFirestore, updateDoc, collection, getDocs, query, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyDfE2DBpfE5Oj5nwtErub8X0tvBfMsi9QA",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "reco-vaswani-license.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "reco-vaswani-license",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "reco-vaswani-license.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "594471668759",
  appId: process.env.FIREBASE_APP_ID || "1:594471668759:web:fb9f997aa87bd7e866e052"
};

const firebaseApp = initializeApp(firebaseConfig);
const firestore = getFirestore(firebaseApp);

const db = new sqlite3.Database('network_data.db');

async function resetPassword() {
    try {
        const randomTempPassword = crypto.randomBytes(8).toString('hex');
        const hash = await bcrypt.hash(randomTempPassword, 10);
        
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
        console.log("Local SQLite DB admin password updated successfully.");

        // 3. Update Firebase
        if (officeId) {
            const q = query(collection(firestore, 'network_users'), where('office_id', '==', officeId), where('username', '==', 'admin'));
            const snap = await getDocs(q);
            
            if (!snap.empty) {
                for (const d of snap.docs) {
                    await updateDoc(d.ref, { password_hash: hash });
                }
                console.log("Firebase DB admin password updated successfully.");
            } else {
                console.log("Admin user not found in Firebase for office_id: " + officeId);
            }
        }

        console.log(`\n======================================================`);
        console.log(`[ADMIN PASSWORD RESET SUCCESSFUL]`);
        console.log(`New Temporary Admin Password: ${randomTempPassword}`);
        console.log(`Please change this password immediately after logging in.`);
        console.log(`======================================================\n`);
    } catch (e) {
        console.error("Error resetting password:", e);
    } finally {
        db.close();
        process.exit(0);
    }
}

resetPassword();
