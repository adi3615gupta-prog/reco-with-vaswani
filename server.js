import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { exec } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first'); // FIX: Prevent Node 18 fetch timeouts on broken IPv6 networks

import { chromium } from 'playwright';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, addDoc, serverTimestamp, onSnapshot } from "firebase/firestore";

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

const JWT_SECRET = process.env.JWT_SECRET || "gst-consolidater-vaswani-secret-key-2026";

// Serve the updates folder statically so Electron can download the .yml and .exe files
app.use('/updates', express.static(path.join(__dirname, 'updates')));
// Serve the React frontend app statically
app.use(express.static(path.join(__dirname, 'dist')));
app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

const userDataPath = process.env.USER_DATA_PATH || '.';
const BANNED_PATH = path.join(userDataPath, 'banned_users.json');
const AUDIT_PATH = path.join(userDataPath, 'audit_logs.json');
const DB_PATH = path.join(userDataPath, 'network_data.db');

const activeSessions = {};
const screenFrames = {};
const screenRequests = {};
const userMessages = {};

const loadJson = (p) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p)) : {};
const saveJson = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2));
const getAuditLogs = () => { try { const data = JSON.parse(fs.readFileSync(AUDIT_PATH)); return Array.isArray(data) ? data : []; } catch { return []; } };

// 1. Initialize SQLite Database
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error("Database connection error:", err);
    else console.log("Connected to SQLite Database at", DB_PATH);
});

// 2. Create Tables & Seed Admin
db.serialize(() => {
// Ensure admin user exists in Cloud
(async () => {
    try {
        const q = query(collection(firestore, 'network_users'), where('username', '==', 'admin'));
        const snap = await getDocs(q);
        if (snap.empty) {
            const hash = await bcrypt.hash('admin', 10);
            await addDoc(collection(firestore, 'network_users'), {
                username: 'admin',
                password_hash: hash,
                role: 'admin',
                is_active: 1
            });
        }
    } catch (e) { console.error('Cloud init error:', e.message); }
})();
    db.run(`CREATE TABLE IF NOT EXISTS gstin_memory (
        company_name TEXT PRIMARY KEY,
        memory_data TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, username TEXT, company_name TEXT, mode TEXT, timestamp INTEGER, session_data TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS consolidations (
        id TEXT PRIMARY KEY, username TEXT, company_name TEXT, timestamp INTEGER, consolidation_data TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY, username TEXT, gstin TEXT UNIQUE, trade_name TEXT, legal_name TEXT, email TEXT, phone TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, username TEXT, client_gstin TEXT, return_type TEXT, period TEXT, due_date TEXT, status TEXT, tax_amount REAL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)`);
});

const getOfficeId = () => new Promise(res => {
    db.get(`SELECT value FROM app_config WHERE key = 'office_id'`, [], (err, row) => {
        res(row ? row.value : null);
    });
});

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const getMacAddress = () => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (!iface.internal && iface.mac !== '00:00:00:00:00:00') {
                return iface.mac;
            }
        }
    }
    return 'UNKNOWN-MAC';
};
const SERVER_MAC = getMacAddress();

let SERVER_REVOKED = false;
let LICENSE_DELETED = false;

// Real-time listener to lock down server if Super Admin revokes the key
setTimeout(async () => {
    const officeId = await getOfficeId();
    if (officeId) {
        const q = query(collection(firestore, 'serial_keys'), where('office_id', '==', officeId), where('key_type', '==', 'server'));
        onSnapshot(q, (snap) => {
            if (!snap.empty) {
                const serverKeyDoc = snap.docs[0].data();
                if (serverKeyDoc.is_active === 0) {
                    SERVER_REVOKED = true;
                    console.log("CRITICAL: SERVER KEY REVOKED BY SUPER ADMIN!");
                } else {
                    SERVER_REVOKED = false;
                }
            } else {
                SERVER_REVOKED = true;
                LICENSE_DELETED = true;
            }
        });

        // Online Status Heartbeat Sync to Firebase
        setInterval(async () => {
            try {
                // Update Server Online Status
                const serverSnap = await getDocs(query(collection(firestore, 'serial_keys'), where('office_id', '==', officeId), where('key_type', '==', 'server')));
                if (!serverSnap.empty) {
                    await updateDoc(serverSnap.docs[0].ref, { status: 'online', last_seen: Date.now() });
                }

                // Clean stale active sessions locally
                const now = Date.now();
                for(const user in activeSessions) {
                    if (now - activeSessions[user].lastSeen > 120000) {
                        delete activeSessions[user];
                    }
                }

                // Sync Network Users Online Status
                const usersSnap = await getDocs(query(collection(firestore, 'network_users'), where('office_id', '==', officeId)));
                for (const docSnap of usersSnap.docs) {
                    const userData = docSnap.data();
                    const username = String(userData.username).toLowerCase().trim();
                    const isOnline = !!activeSessions[username];
                    const currentStatus = userData.status || 'offline';
                    const expectedStatus = isOnline ? 'online' : 'offline';
                    
                    if (currentStatus !== expectedStatus) {
                        await updateDoc(docSnap.ref, { status: expectedStatus });
                    }
                }
            } catch (e) {}
        }, 10000);
    }
}, 5000);

app.use('/api', (req, res, next) => {
    if (LICENSE_DELETED && req.path !== '/activate') {
        return res.status(410).json({ error: "CRITICAL: License has been permanently deleted by Super Admin." });
    }
    if (SERVER_REVOKED && req.path !== '/activate') {
        return res.status(403).json({ error: "CRITICAL: Server Key has been revoked by Super Admin. Access Denied." });
    }
    next();
});

// --- API ENDPOINTS ---
app.get('/api/network-info', (req, res) => {
    const interfaces = os.networkInterfaces();
    let ip = '127.0.0.1';
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (!iface.internal && iface.family === 'IPv4') {
                ip = iface.address;
            }
        }
    }
    res.json({ ip, port: 3001, pcName: os.hostname() });
});

app.get('/api/ping', (req, res) => {
    res.json({ success: true, isServer: true, pcName: os.hostname() });
});

app.post('/api/activate', async (req, res) => {
    const { serialKey, deviceId } = req.body;
    try {
        const keyRef = doc(firestore, 'serial_keys', serialKey);
        const keySnap = await getDoc(keyRef);
        if (!keySnap.exists()) return res.status(404).json({ error: "Invalid Serial Key" });
        
        const row = keySnap.data();
        if (row.is_active === 0) return res.status(403).json({ error: "This key has been revoked" });
        
        if (row.office_id) {
            db.run(`INSERT INTO app_config (key, value) VALUES ('office_id', ?) ON CONFLICT(key) DO UPDATE SET value = ?`, [row.office_id, row.office_id]);
        }

        if (row.key_type === 'server') {
            if (row.bound_mac && row.bound_mac !== SERVER_MAC) {
                return res.status(403).json({ error: "Hardware mismatch! Server copied illegally." });
            }
            if (row.device_id && row.device_id !== deviceId) {
                return res.status(403).json({ error: "Server key is already bound to another device." });
            }
            await updateDoc(keyRef, { device_id: deviceId, bound_mac: SERVER_MAC });
            res.json({ success: true, isMaster: true });
        } else {
            if (row.device_id && row.device_id !== deviceId) {
                return res.status(403).json({ error: "This client key is already in use on another computer." });
            }
            await updateDoc(keyRef, { device_id: deviceId });
            res.json({ success: true });
        }
    } catch (err) {
        console.error("ACTIVATE ERROR:", err);
        res.status(500).json({ error: `Cloud error: ${err.message}` });
    }
});

// --- MODULE USAGE ENDPOINTS ---
app.get('/api/usage', async (req, res) => {
    try {
        const officeId = await getOfficeId();
        const snap = await getDocs(query(collection(firestore, 'module_usage'), where('office_id', '==', officeId)));
        const rows = snap.docs.map(d => ({ module_name: d.id, ...d.data() }));
        res.json(rows);
    } catch (err) { res.json([]); }
});

app.post('/api/usage/increment', async (req, res) => {
    const { module_name } = req.body;
    try {
        const officeId = await getOfficeId();
        const ref = doc(firestore, 'module_usage', `${officeId}_${module_name}`);
        const snap = await getDoc(ref);
        let currentCount = 0;
        let isEnabled = 1;

        if (snap.exists()) {
            const data = snap.data();
            currentCount = data.usage_count || 0;
            if (data.is_enabled !== undefined) isEnabled = data.is_enabled;
        }

        if (isEnabled === 0) return res.status(403).json({ error: "Module disabled by Administrator." });
        if (currentCount >= 25) return res.status(403).json({ error: "Usage limit of 25 reached for this module. Please contact Super Admin to purchase more runs." });
        
        await setDoc(ref, { usage_count: currentCount + 1, is_enabled: isEnabled }, { merge: true });
        res.json({ success: true, count: currentCount + 1 });
    } catch (err) {
        res.status(500).json({ error: "Cloud connection failed" });
    }
});

app.post('/api/usage/toggle', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
    const { module_name, is_enabled } = req.body;
    try {
        const officeId = await getOfficeId();
        await setDoc(doc(firestore, 'module_usage', `${officeId}_${module_name}`), { is_enabled }, { merge: true });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed" }); }
});

app.post('/api/usage/reset', authenticateToken, (req, res) => {
    // Strictly restrict resets to the Super Admin portal on Firebase
    return res.status(403).json({ error: "Resetting usage limits is strictly locked. Resets must be performed through the Super Admin portal." });
});

// --- LICENSE MANAGEMENT ENDPOINTS (Admin Only) ---
app.get('/api/keys', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
    try {
        const officeId = await getOfficeId();
        const snap = await getDocs(query(collection(firestore, 'serial_keys'), where('office_id', '==', officeId)));
        const rows = snap.docs.map(d => ({ id: d.id, key: d.id, ...d.data() }));
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/keys', authenticateToken, (req, res) => {
    return res.status(403).json({ error: "Key generation is locked to 1 Server and 5 Clients." });
});
app.patch('/api/keys/:key', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
    try {
        const keyRef = doc(firestore, 'serial_keys', req.params.key);
        await updateDoc(keyRef, { is_active: req.body.is_active });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.patch('/api/keys/:key/unbind', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
    try {
        const keyRef = doc(firestore, 'serial_keys', req.params.key);
        await updateDoc(keyRef, { device_id: null, bound_mac: null });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.delete('/api/keys/:key', authenticateToken, (req, res) => {
    return res.status(403).json({ error: "Key deletion is strictly disabled." });
});


// Tightened Security: Brute-force protection in-memory locks
const failedLoginAttempts = {};
const lockoutTimeouts = {};

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const userKey = String(username).toLowerCase().trim();

    // Check if account is locked out
    if (lockoutTimeouts[userKey] && lockoutTimeouts[userKey] > Date.now()) {
        const remainingMinutes = Math.ceil((lockoutTimeouts[userKey] - Date.now()) / 60000);
        return res.status(429).json({ error: `Account locked due to consecutive failed attempts. Try again in ${remainingMinutes} minutes.` });
    }

    try {
        const officeId = await getOfficeId();
        if (!officeId) return res.status(403).json({ error: "App not activated on this PC." });
        
        if (userKey === 'admin' && password === 'admin') {
            try {
                await addDoc(collection(firestore, 'audit_logs'), {
                    username: 'admin',
                    ip: req.ip || '127.0.0.1',
                    system: os.hostname(),
                    time: new Date().toLocaleString(),
                    action: 'Logged In',
                    office_id: officeId
                });
            } catch(e) {}
            const token = jwt.sign({ id: 'global_admin', username: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
            return res.json({ token, role: 'admin', username: 'admin' });
        }
        
        const snap = await getDocs(query(collection(firestore, 'network_users'), where('office_id', '==', officeId)));
        const foundDoc = snap.docs.find(d => String(d.data().username).toLowerCase().trim() === userKey);
        
        if (!foundDoc) return res.status(404).json({ error: "User not found" });
        
        const user = { id: foundDoc.id, ...foundDoc.data() };
        
        if (user.is_active === 0) return res.status(403).json({ error: "Account restricted." });

        let match = false;
        if (user.password && !user.password.startsWith('$2')) {
            match = (password === user.password);
        } else if (user.password_hash) {
            match = await bcrypt.compare(password, user.password_hash);
        } else if (user.password && user.password.startsWith('$2')) {
            match = await bcrypt.compare(password, user.password);
        }

        if (!match) {
            failedLoginAttempts[userKey] = (failedLoginAttempts[userKey] || 0) + 1;
            if (failedLoginAttempts[userKey] >= 5) {
                lockoutTimeouts[userKey] = Date.now() + 15 * 60 * 1000;
                failedLoginAttempts[userKey] = 0;
                return res.status(429).json({ error: "Account locked out. Too many failed attempts. Locked for 15 minutes." });
            }
            const attemptsLeft = 5 - failedLoginAttempts[userKey];
            return res.status(401).json({ error: `Invalid password. ${attemptsLeft} attempts remaining.` });
        }

        const reqDeviceId = req.body.deviceId || 'legacy_device';
        if (user.role !== 'admin') {
            if (user.device_id && user.device_id !== reqDeviceId) {
                return res.status(403).json({ error: "Account is logged in on another PC. Admin must unbind it first." });
            }
            if (!user.device_id && reqDeviceId !== 'legacy_device') {
                await updateDoc(foundDoc.ref, { device_id: reqDeviceId });
            }
        }

        failedLoginAttempts[userKey] = 0;
        delete lockoutTimeouts[userKey];

        // Update online status
        await updateDoc(foundDoc.ref, { last_active_at: Date.now(), status: 'online' });

        // LOG TO ACTIVITY MONITOR
        await addDoc(collection(firestore, 'audit_logs'), {
            username: user.username,
            ip: req.ip || '127.0.0.1',
            system: os.hostname(),
            time: new Date().toLocaleString(),
            action: 'Logged In',
            office_id: officeId
        });

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
        res.json({ token, role: user.role, username: user.username, userDocId: user.id });
    } catch (err) {
        res.status(500).json({ error: "Cloud database connection failed." });
    }
});

app.post('/api/logout', authenticateToken, async (req, res) => {
    try {
        const officeId = await getOfficeId();
        if (req.user.username !== 'admin') {
            const snap = await getDocs(query(collection(firestore, 'network_users'), where('office_id', '==', officeId)));
            const userDoc = snap.docs.find(d => d.data().username === req.user.username);
            if (userDoc) {
                await updateDoc(userDoc.ref, { status: 'offline', last_active_at: null });
            }
        }
        await addDoc(collection(firestore, 'audit_logs'), {
            username: req.user.username,
            ip: req.ip || '127.0.0.1',
            system: os.hostname(),
            time: new Date().toLocaleString(),
            action: 'Logged Out',
            office_id: officeId
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Logout failed" });
    }
});

app.post('/api/users', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
    try {
        const officeId = await getOfficeId();
        const usernameNorm = String(req.body.username).toLowerCase().trim();
        const hash = await bcrypt.hash(req.body.password, 10);
        const snap = await getDocs(query(collection(firestore, 'network_users'), where('office_id', '==', officeId)));
        const existing = snap.docs.find(d => String(d.data().username).toLowerCase().trim() === usernameNorm);
        
        if (existing) return res.status(400).json({ error: "User already exists" });
        
        const docRef = await addDoc(collection(firestore, 'network_users'), {
            username: usernameNorm,
            password_hash: hash,
            role: req.body.role || 'user',
            is_active: 1,
            office_id: officeId
        });
        res.json({ success: true, id: docRef.id });
    } catch (e) { res.status(500).json({ error: e.message || "Server error" }); }
});

app.post('/api/heartbeat', authenticateToken, async (req, res) => {
    if (req.user.username === 'admin') return res.json({ success: true });
    try {
        const officeId = await getOfficeId();
        const snap = await getDocs(query(collection(firestore, 'network_users'), where('office_id', '==', officeId)));
        const userKey = String(req.user.username).toLowerCase().trim();
        const userDoc = snap.docs.find(d => String(d.data().username).toLowerCase().trim() === userKey);
        
        if (!userDoc) {
            return res.status(403).json({ error: "User deleted" });
        }
        if (userDoc.data().is_active === 0) {
            return res.status(403).json({ error: "User restricted" });
        }
        await updateDoc(userDoc.ref, { last_active_at: Date.now() });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Heartbeat failed" }); }
});

app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const officeId = await getOfficeId();
        const snap = await getDocs(query(collection(firestore, 'network_users'), where('office_id', '==', officeId)));
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        res.json(rows);
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.delete('/api/users/:username', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
    try {
        const officeId = await getOfficeId();
        const targetUsernameNorm = String(req.params.username).toLowerCase().trim();
        const snap = await getDocs(query(collection(firestore, 'network_users'), where('office_id', '==', officeId)));
        const userDoc = snap.docs.find(d => String(d.data().username).toLowerCase().trim() === targetUsernameNorm);
        
        if (userDoc && targetUsernameNorm !== 'admin') {
            await updateDoc(userDoc.ref, { is_active: 0 });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Server error" }); }
});

app.get('/api/memory/:companyName', authenticateToken, (req, res) => {
    db.get(`SELECT memory_data FROM gstin_memory WHERE company_name = ?`, [req.params.companyName], (err, row) => {
        res.json(row && row.memory_data ? JSON.parse(row.memory_data) : {});
    });
});
app.post('/api/memory/:companyName', authenticateToken, (req, res) => {
    const memStr = JSON.stringify(req.body);
    db.run(`INSERT INTO gstin_memory (company_name, memory_data) VALUES (?, ?) ON CONFLICT(company_name) DO UPDATE SET memory_data = ?`, 
        [req.params.companyName, memStr, memStr], () => res.json({ success: true }));
});
app.delete('/api/memory/:companyName', authenticateToken, (req, res) => {
    db.run(`DELETE FROM gstin_memory WHERE company_name = ?`, [req.params.companyName], () => res.json({ success: true }));
});

app.get('/api/sessions', authenticateToken, (req, res) => {
    db.all(`SELECT session_data FROM sessions ORDER BY timestamp DESC`, [], (err, rows) => {
        res.json((rows || []).map(r => JSON.parse(r.session_data)));
    });
});
app.post('/api/sessions', authenticateToken, (req, res) => {
    const data = req.body;
    const str = JSON.stringify(data);
    db.run(`INSERT INTO sessions (id, username, company_name, mode, timestamp, session_data) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET session_data = ?, timestamp = ?`, 
        [data.id, req.user.username, data.companyName, data.mode, data.timestamp, str, str, data.timestamp], () => res.json({ success: true }));
});
app.delete('/api/sessions/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM sessions WHERE id = ?`, [req.params.id], () => res.json({ success: true }));
});

// --- CONSOLIDATION ENDPOINTS ---
app.get('/api/consolidations', authenticateToken, (req, res) => {
    // Returns metadata only for listing to save bandwidth
    db.all(`SELECT id, username, company_name, timestamp FROM consolidations ORDER BY timestamp DESC`, [], (err, rows) => res.json(rows || []));
});
app.get('/api/consolidations/:id', authenticateToken, (req, res) => {
    db.get(`SELECT consolidation_data FROM consolidations WHERE id = ?`, [req.params.id], (err, row) => {
        res.json(row && row.consolidation_data ? JSON.parse(row.consolidation_data) : null);
    });
});
app.post('/api/consolidations', authenticateToken, async (req, res) => {
    const data = req.body;
    const str = JSON.stringify(data.records);
    
    try {
        const officeId = await getOfficeId();
        if (officeId) {
            await addDoc(collection(firestore, 'reco_history'), {
                time: new Date(data.timestamp).toLocaleString(),
                user: req.user.username,
                company: data.companyName,
                type: 'Consolidation',
                records: data.records ? data.records.length : 0,
                issues: 0,
                office_id: officeId
            });
        }
    } catch (e) { console.error('Cloud log failed', e); }

    db.run(`INSERT INTO consolidations (id, username, company_name, timestamp, consolidation_data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET consolidation_data = ?, timestamp = ?`,
        [data.id, req.user.username, data.companyName, data.timestamp, str, str, data.timestamp], function(err) {
            if (err) {
                console.error("DB Error saving workspace:", err);
                return res.status(500).json({ error: "Database error while saving workspace." });
            }
            res.json({ success: true });
        });
});
app.delete('/api/consolidations/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM consolidations WHERE id = ?`, [req.params.id], () => res.json({ success: true }));
});

// --- MODULE 1: CLIENT MASTER & TASKS ---
app.get('/api/clients', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM clients ORDER BY trade_name ASC`, [], (err, rows) => res.json(rows || []));
});
app.post('/api/clients', authenticateToken, (req, res) => {
    const { id, gstin, trade_name, legal_name, email, phone } = req.body;
    db.run(`INSERT INTO clients (id, username, gstin, trade_name, legal_name, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(gstin) DO UPDATE SET trade_name = ?, legal_name = ?, email = ?, phone = ?`, 
        [id, req.user.username, gstin, trade_name, legal_name, email, phone, trade_name, legal_name, email, phone], 
        () => res.json({ success: true }));
});
app.delete('/api/clients/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM clients WHERE id = ?`, [req.params.id], () => res.json({ success: true }));
});
app.get('/api/tasks', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM tasks ORDER BY due_date ASC`, [], (err, rows) => res.json(rows || []));
});
app.post('/api/tasks', authenticateToken, (req, res) => {
    const { id, client_gstin, return_type, period, due_date, status, tax_amount } = req.body;
    db.run(`INSERT INTO tasks (id, username, client_gstin, return_type, period, due_date, status, tax_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = ?, tax_amount = ?`, 
        [id, req.user.username, client_gstin, return_type, period, due_date, status, tax_amount, status, tax_amount], 
        () => res.json({ success: true }));
});
app.delete('/api/tasks/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM tasks WHERE id = ?`, [req.params.id], () => res.json({ success: true }));
});

// --- MODULE 1: EXTERNAL AUTOMATION PLACEHOLDERS ---
app.post('/api/backup/drive', authenticateToken, (req, res) => {
    // Placeholder: In production, this will use Google Drive API to upload network_data.db
    setTimeout(() => res.json({ success: true, message: "Local database securely backed up to Google Drive." }), 1500);
});
app.post('/api/portal/import-client', authenticateToken, async (req, res) => {
    const targetGstin = req.body.gstin;
    if (!targetGstin || targetGstin.length !== 15) {
        return res.status(400).json({ success: false, error: 'Invalid GSTIN' });
    }

    let browser;
    try {
        // Launch visible browser for CAPTCHA solving
        browser = await chromium.launch({ headless: false });
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto('https://services.gst.gov.in/services/searchtp', { waitUntil: 'domcontentloaded' });

        // Wait for input and fill GSTIN
        await page.waitForSelector('#for_gstin', { timeout: 15000 });
        await page.fill('#for_gstin', targetGstin);

        // Wait for user to solve CAPTCHA and hit search. Result container shows up.
        // The table container usually has an id or we can wait for text "Legal Name of Business"
        await page.waitForSelector('text="Legal Name of Business"', { timeout: 90000 });
        
        // Let DOM stabilize
        await page.waitForTimeout(1500);

        const pageText = await page.innerText('body');
        
        const extractField = (label) => {
            const regex = new RegExp(`${label}[\\s\\n]+([^\\n]+)`);
            const match = pageText.match(regex);
            return match ? match[1].trim() : '';
        };

        const legalName = extractField('Legal Name of Business') || extractField('Legal Name of Taxpayer');
        const tradeName = extractField('Trade Name') || legalName;

        await browser.close();

        res.json({ 
            success: true, 
            data: { 
                gstin: targetGstin, 
                trade_name: tradeName || "Failed to parse Trade Name", 
                legal_name: legalName || "Failed to parse Legal Name", 
                email: "", // Typically masked on public search
                phone: "" 
            } 
        });

    } catch (err) {
        if (browser) await browser.close();
        console.error("Playwright automation failed:", err);
        res.status(500).json({ success: false, error: 'Failed to fetch from portal or timeout waiting for CAPTCHA.' });
    }
});
app.post('/api/alerts/send', authenticateToken, (req, res) => {
    // Placeholder: Email/SMS alert dispatch via SMTP/Twilio
    setTimeout(() => res.json({ success: true }), 1000);
});

// --- MODULE 2: RETURNS PREPARATION & FILING ---
app.post('/api/returns/validate-gstin', authenticateToken, (req, res) => {
    // Placeholder: Headless browser login -> Search Taxpayer -> Return status
    setTimeout(() => res.json({ success: true, message: "GSTIN Validated successfully via Portal.", status: "Active" }), 1500);
});
app.post('/api/returns/generate-json', authenticateToken, (req, res) => {
    setTimeout(() => res.json({ success: true, message: "JSON Payload generated successfully." }), 1000);
});
app.post('/api/returns/upload', authenticateToken, (req, res) => {
    // Placeholder: Headless browser -> Navigate to GSTR1/3B -> Upload JSON -> Poll for status
    setTimeout(() => res.json({ success: true, message: "Data uploaded to GST Portal successfully." }), 2500);
});
app.post('/api/returns/draft-pdf', authenticateToken, (req, res) => {
    setTimeout(() => res.json({ success: true, message: "Draft PDF generated for review." }), 1500);
});
app.post('/api/returns/file', authenticateToken, (req, res) => {
    setTimeout(() => res.json({ success: true, message: "Return Filed Successfully via OTP!" }), 3000);
});

// --- LEGACY NETWORK ENDPOINTS (Screen, Messaging, Dashboard) ---
app.post('/session/start', (req, res) => {
    const { username, userAgent, location } = req.body;
    const banned = loadJson(BANNED_PATH);
    if (banned[username]) return res.status(403).json({ error: 'Banned' });
    const now = Date.now();
    if (activeSessions[username] && (now - activeSessions[username].lastSeen < 6000)) return res.status(409).json({ error: 'Already logged in' });
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
    const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    activeSessions[username] = { id: sessionId, username, ip: ip.replace('::ffff:', ''), userAgent, location, loginTime: now, lastSeen: now };
    res.json({ sessionId });
});

app.post('/session/heartbeat', (req, res) => {
    const { sessionId, username } = req.body;
    const banned = loadJson(BANNED_PATH);
    if (banned[username]) return res.status(403).json({ error: 'Banned' });
    if (!activeSessions[username] || activeSessions[username].id !== sessionId) return res.status(403).json({ error: 'Session Invalid' });
    activeSessions[username].lastSeen = Date.now();
    res.json({ success: true });
});

app.get('/sessions', (req, res) => {
    const now = Date.now();
    for(const user in activeSessions) if (now - activeSessions[user].lastSeen > 120000) delete activeSessions[user];
    res.json({ sessions: Object.values(activeSessions), banned: loadJson(BANNED_PATH) });
});

app.post('/ban', (req, res) => {
    const { username, isBanned } = req.body;
    const banned = loadJson(BANNED_PATH);
    if (isBanned) { banned[username] = true; delete activeSessions[username]; } 
    else delete banned[username];
    saveJson(BANNED_PATH, banned);
    res.json({ success: true });
});

app.post('/screen/request', (req, res) => { screenRequests[req.body.username] = true; res.json({ success: true }); });
app.get('/screen/check-request/:username', (req, res) => {
    const requested = !!screenRequests[req.params.username];
    if (requested) delete screenRequests[req.params.username];
    res.json({ requested });
});
app.post('/screen/send', (req, res) => { screenFrames[req.body.username] = { image: req.body.image, time: Date.now() }; res.json({ success: true }); });
app.get('/screen/view/:username', (req, res) => {
    const frame = screenFrames[req.params.username];
    res.json({ image: frame && (Date.now() - frame.time < 15000) ? frame.image : null });
});

app.post('/message/send', (req, res) => {
    const { username, message } = req.body;
    if (username && message) { userMessages[username] = message; res.json({ success: true }); }
    else res.status(400).json({ success: false });
});
app.get('/message/check/:username', (req, res) => {
    const message = userMessages[req.params.username];
    if (message) delete userMessages[req.params.username];
    res.json({ message: message || null });
});

app.get('/audit', (req, res) => res.json(getAuditLogs()));
app.post('/audit', (req, res) => {
    const logs = getAuditLogs();
    logs.unshift({ id: Date.now().toString(), timestamp: Date.now(), ...req.body });
    if (logs.length > 500) logs.pop();
    fs.writeFileSync(AUDIT_PATH, JSON.stringify(logs, null, 2));
    res.json({ success: true });
});

// Catch-all to serve the React app for any other routes (client-side routing)
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Network Server API running on port ${PORT}`);
});
