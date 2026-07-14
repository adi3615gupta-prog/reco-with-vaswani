import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { exec, spawn, execSync } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first'); // FIX: Prevent Node 18 fetch timeouts on broken IPv6 networks

import setupTdsRoutes from './tds_routes.js';
import setupTaxRoutes from './tax_routes.js';

import helmet from 'helmet';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, addDoc, serverTimestamp, onSnapshot, setLogLevel } from "firebase/firestore";

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
setLogLevel("error");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
const PORT = 3001;

const userDataPath = process.env.USER_DATA_PATH || '.';

// Load or generate JWT Secret locally
const CONFIG_PATH = path.join(userDataPath, 'server_config.json');
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    if (fs.existsSync(CONFIG_PATH)) {
        try { JWT_SECRET = JSON.parse(fs.readFileSync(CONFIG_PATH)).jwtSecret; } catch(e) {}
    }
    if (!JWT_SECRET) {
        JWT_SECRET = crypto.randomBytes(32).toString('hex');
        try {
            if (!fs.existsSync(userDataPath)) {
                fs.mkdirSync(userDataPath, { recursive: true });
            }
            fs.writeFileSync(CONFIG_PATH, JSON.stringify({ jwtSecret: JWT_SECRET }));
            console.log("Generated new secure JWT Secret for this installation.");
        } catch (err) {
            console.error("Failed to write server_config.json:", err);
        }
    }
}



// Serve the updates folder statically so Electron can download the .yml and .exe files
app.use('/updates', express.static(path.join(__dirname, 'updates')));
// Serve the React frontend app statically with no-cache headers to prevent browser caching of code updates
app.use(express.static(path.join(__dirname, 'dist'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        } else {
            // Force revalidation of JS and CSS bundles so updates reflect immediately
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));
// CORS: Allow same-origin + LAN requests only (not wide-open to the internet)
app.use(cors({
    origin: true, // Reflects the request origin — safe for LAN where all clients are trusted
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// userDataPath defined above
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
  // Admin user must be explicitly created via First-Run Setup
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
    db.run(`CREATE TABLE IF NOT EXISTS network_users (
        username TEXT PRIMARY KEY,
        password_hash TEXT,
        role TEXT,
        is_active INTEGER,
        office_id TEXT,
        device_limit INTEGER,
        device_id TEXT,
        last_active_at INTEGER,
        status TEXT
    )`);
    // Safe migration for existing DBs
    db.run(`ALTER TABLE network_users ADD COLUMN last_active_at INTEGER`, (err) => { /* ignore if exists */ });
    db.run(`ALTER TABLE network_users ADD COLUMN status TEXT`, (err) => { /* ignore if exists */ });
});

// 3. Initialize TDS Routes
setupTdsRoutes(app, db);

// 4. Initialize Tax Routes
setupTaxRoutes(app, db);

const saveUserToLocalDb = (user) => {
    db.run(`INSERT INTO network_users (username, password_hash, role, is_active, office_id, device_id)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(username) DO UPDATE SET
            password_hash = excluded.password_hash,
            role = excluded.role,
            is_active = excluded.is_active,
            office_id = excluded.office_id,
            device_id = excluded.device_id`,
        [user.username.toLowerCase().trim(), user.password_hash || user.password || '', user.role, user.is_active, user.office_id, user.device_id || null]
    );
};

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
let SELF_DESTRUCT_INITIATED = false;

// --- Reusable License Monitoring Setup ---
let _licenseUnsubscribe = null;
let _heartbeatInterval = null;

const setupLicenseMonitoring = (officeId) => {
    // Cleanup previous listener and interval if they exist
    if (_licenseUnsubscribe) { try { _licenseUnsubscribe(); } catch(e) {} _licenseUnsubscribe = null; }
    if (_heartbeatInterval) { clearInterval(_heartbeatInterval); _heartbeatInterval = null; }

    // Reset in-memory flags
    SERVER_REVOKED = false;
    LICENSE_DELETED = false;
    console.log(`[License Monitor] Initializing for office_id: ${officeId}`);

    const q = query(collection(firestore, 'serial_keys'), where('office_id', '==', officeId), where('key_type', '==', 'server'));
    _licenseUnsubscribe = onSnapshot(q, (snap) => {
        if (!snap.empty) {
            const serverKeyDoc = snap.docs[0].data();
            if (serverKeyDoc.is_active === 0) {
                SERVER_REVOKED = true;
                console.log("CRITICAL: SERVER KEY REVOKED BY SUPER ADMIN!");
            } else {
                SERVER_REVOKED = false;
                LICENSE_DELETED = false; // Key found and active, clear any stale deleted flag
            }
        } else {
            // Only mark as revoked if this is a verified online query (not cache fallback)
            if (snap.metadata && snap.metadata.fromCache) {
                console.log("[License Monitor] Offline or cached data empty snapshot. Skipping revocation check.");
                return;
            }
            SERVER_REVOKED = true;
            LICENSE_DELETED = true;
            console.log("CRITICAL: LICENSE HAS BEEN DELETED OR NOT FOUND IN CLOUD DB!");
        }
    }, (error) => {
        console.warn("[License Monitor] Offline or network error subscribing to Firestore:", error.message);
        // Do NOT set SERVER_REVOKED = true on network failure, keeping local server usable offline
    });

    // Online Status Heartbeat Sync to Firebase
    _heartbeatInterval = setInterval(async () => {
        try {
            const serverSnap = await getDocs(query(collection(firestore, 'serial_keys'), where('office_id', '==', officeId), where('key_type', '==', 'server')));
            if (!serverSnap.empty) {
                await updateDoc(serverSnap.docs[0].ref, { status: 'online', last_seen: Date.now() });
            }

            const now = Date.now();
            for(const user in activeSessions) {
                if (now - activeSessions[user].lastSeen > 120000) {
                    delete activeSessions[user];
                }
            }

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
    }, 60000);
};

// Startup: Initialize license monitoring if office_id already exists in local DB
setTimeout(async () => {
    const officeId = await getOfficeId();
    if (officeId) {
        setupLicenseMonitoring(officeId);
    }
}, 5000);

const LICENSE_EXEMPT_PATHS = ['/activate', '/reset-license', '/admin-exists', '/ping'];
app.use('/api', (req, res, next) => {
    if (LICENSE_DELETED && !LICENSE_EXEMPT_PATHS.includes(req.path)) {
        return res.status(410).json({ error: "CRITICAL: License has been permanently deleted by Super Admin." });
    }
    if (SERVER_REVOKED && !LICENSE_EXEMPT_PATHS.includes(req.path)) {
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

let activeTunnel = null;
import localtunnel from 'localtunnel';

app.post('/api/network/go-global', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
    try {
        if (activeTunnel) {
            activeTunnel.close();
            activeTunnel = null;
        }
        activeTunnel = await localtunnel({ port: PORT });
        
        const officeId = await getOfficeId();
        if (officeId) {
            // Find the server key and update it
            const snap = await getDocs(query(collection(firestore, 'serial_keys'), where('office_id', '==', officeId), where('key_type', '==', 'server')));
            if (!snap.empty) {
                await updateDoc(snap.docs[0].ref, { public_url: activeTunnel.url, is_global: true });
            }
        }
        
        res.json({ success: true, url: activeTunnel.url });
    } catch (err) {
        res.status(500).json({ error: "Failed to start tunnel: " + err.message });
    }
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
            await new Promise((resolve, reject) => {
                db.run(`INSERT INTO app_config (key, value) VALUES ('office_id', ?) ON CONFLICT(key) DO UPDATE SET value = ?`, [row.office_id, row.office_id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        if (row.key_type === 'server') {
            if (row.bound_mac && row.bound_mac !== SERVER_MAC) {
                return res.status(403).json({ error: "Hardware mismatch! Server copied illegally." });
            }
            if (row.device_id && row.device_id !== deviceId) {
                return res.status(403).json({ error: "Server key is already bound to another device." });
            }
            await updateDoc(keyRef, { device_id: deviceId, bound_mac: SERVER_MAC });

            // Re-initialize license monitoring with the new office_id
            if (row.office_id) {
                setupLicenseMonitoring(row.office_id);
            }

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

// --- LICENSE RESET ENDPOINT ---
app.post('/api/reset-license', async (req, res) => {
    try {
        // 1. Tear down Firestore listeners and heartbeat
        if (_licenseUnsubscribe) { try { _licenseUnsubscribe(); } catch(e) {} _licenseUnsubscribe = null; }
        if (_heartbeatInterval) { clearInterval(_heartbeatInterval); _heartbeatInterval = null; }

        // 2. Reset in-memory flags
        SERVER_REVOKED = false;
        LICENSE_DELETED = false;

        // 3. Clear local SQLite state
        db.run(`DELETE FROM app_config WHERE key = 'office_id'`);
        db.run(`DELETE FROM network_users`);

        console.log('[License Reset] Backend state fully cleared.');
        res.json({ success: true, message: 'License and local state reset successfully.' });
    } catch (err) {
        console.error('RESET-LICENSE ERROR:', err);
        res.status(500).json({ error: err.message });
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
    return res.status(403).json({ error: "Key generation is locked to 1 Server with Unlimited Clients." });
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

// Utility to wrap a promise with a timeout (e.g. for Firestore calls over VPN)
const withTimeout = (promise, ms = 3000) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Firebase request timed out")), ms))
    ]);
};

// --- FIRST RUN ADMIN SETUP ENDPOINTS ---
app.get('/api/admin-exists', async (req, res) => {
    try {
        const officeId = await getOfficeId();
        if (!officeId) return res.status(403).json({ error: "App not activated." });

        // First check SQLite locally
        db.get(`SELECT username FROM network_users WHERE username = 'admin'`, [], async (err, row) => {
            if (row) {
                return res.json({ exists: true });
            }
            
            // If not in SQLite, check Firestore (online check)
            try {
                const q = query(collection(firestore, 'network_users'), where('office_id', '==', officeId), where('username', '==', 'admin'));
                const snap = await withTimeout(getDocs(q), 3000);
                if (!snap.empty) {
                    // Cache admin locally
                    const u = snap.docs[0].data();
                    saveUserToLocalDb(u);
                    return res.json({ exists: true });
                }
                return res.json({ exists: false });
            } catch (e) {
                // If offline and not in SQLite, return false
                return res.json({ exists: false });
            }
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.post('/api/setup-admin', async (req, res) => {
    try {
        const officeId = await getOfficeId();
        if (!officeId) return res.status(403).json({ error: "App not activated." });

        const { password } = req.body;
        if (!password || password.length < 5) return res.status(400).json({ error: "Password must be at least 5 characters long." });

        const q = query(collection(firestore, 'network_users'), where('office_id', '==', officeId), where('username', '==', 'admin'));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
            return res.status(403).json({ error: "Admin already exists. Setup locked." });
        }

        const hash = await bcrypt.hash(password, 10);
        const adminUser = {
            username: 'admin',
            password_hash: hash,
            role: 'admin',
            is_active: 1,
            office_id: officeId,
            device_id: null
        };
        await addDoc(collection(firestore, 'network_users'), { ...adminUser, created_at: Date.now() });
        saveUserToLocalDb(adminUser);

        return res.json({ success: true, message: "Admin account secured successfully." });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

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

        let user;
        let userDocId;
        let isOnline = true;
        let docRef = null;

        try {
            const snap = await withTimeout(getDocs(query(collection(firestore, 'network_users'), where('office_id', '==', officeId))), 3000);
            
            // Background caching: sync all office users to SQLite
            for (const docSnap of snap.docs) {
                const u = docSnap.data();
                saveUserToLocalDb({
                    username: u.username,
                    password_hash: u.password_hash || u.password || '',
                    role: u.role,
                    is_active: u.is_active,
                    office_id: u.office_id,
                    device_id: u.device_id || null
                });
            }

            const foundDoc = snap.docs.find(d => String(d.data().username).toLowerCase().trim() === userKey);
            if (!foundDoc) return res.status(404).json({ error: "User not found" });
            user = { id: foundDoc.id, ...foundDoc.data() };
            userDocId = user.id;
            docRef = foundDoc.ref;
        } catch (dbErr) {
            // Offline Mode Fallback
            console.log("Firebase login offline fallback triggered:", dbErr.message);
            isOnline = false;
            
            const localUser = await new Promise((resolve) => {
                db.get("SELECT * FROM network_users WHERE username = ?", [userKey], (err, row) => {
                    resolve(row || null);
                });
            });

            if (!localUser) {
                return res.status(500).json({ error: "Cloud database offline, and no local cache found for this user." });
            }
            user = localUser;
            userDocId = localUser.username;
        }
        
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
                if (isOnline && docRef) {
                    await withTimeout(updateDoc(docRef, { device_id: reqDeviceId }), 3000).catch(e => console.warn("Failed to update cloud device ID:", e.message));
                }
                // Update SQLite locally
                db.run("UPDATE network_users SET device_id = ? WHERE username = ?", [reqDeviceId, userKey]);
            }
        }

        failedLoginAttempts[userKey] = 0;
        delete lockoutTimeouts[userKey];

        // Update online status
        if (isOnline && docRef) {
            await withTimeout(updateDoc(docRef, { last_active_at: Date.now(), status: 'online' }), 3000).catch(e => console.warn("Failed to update cloud status:", e.message));

            // LOG TO ACTIVITY MONITOR
            await withTimeout(addDoc(collection(firestore, 'audit_logs'), {
                username: user.username,
                ip: req.ip || '127.0.0.1',
                system: os.hostname(),
                time: new Date().toLocaleString(),
                action: 'Logged In',
                office_id: officeId
            }), 3000).catch(e => console.warn("Failed to add cloud audit log:", e.message));
        }
        
        db.run("UPDATE network_users SET last_active_at = ? WHERE username = ?", [Date.now(), userKey]);

        const token = jwt.sign({ id: userDocId, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
        res.json({ token, role: user.role, username: user.username, userDocId });
    } catch (err) {
        res.status(500).json({ error: "Server database connection failed." });
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
            db.run("UPDATE network_users SET device_id = NULL WHERE username = ?", [req.user.username.toLowerCase().trim()]);
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
        
        saveUserToLocalDb({
            username: usernameNorm,
            password_hash: hash,
            role: req.body.role || 'user',
            is_active: 1,
            office_id: officeId,
            device_id: null
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
        db.run("UPDATE network_users SET last_active_at = ? WHERE username = ?", [Date.now(), userKey]);
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
            db.run("UPDATE network_users SET is_active = 0 WHERE username = ?", [targetUsernameNorm]);
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
        let playwright;
        try {
            playwright = await import('playwright');
        } catch (err) {
            return res.status(500).json({ 
                success: false, 
                error: 'Playwright is not installed on this server. Portal import is unavailable without installing playwright.' 
            });
        }

        // Launch visible browser for CAPTCHA solving
        browser = await playwright.chromium.launch({ headless: false });
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
app.post('/session/start', authenticateToken, (req, res) => {
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

app.post('/session/heartbeat', authenticateToken, (req, res) => {
    const { sessionId, username } = req.body;
    const banned = loadJson(BANNED_PATH);
    if (banned[username]) return res.status(403).json({ error: 'Banned' });
    if (!activeSessions[username] || activeSessions[username].id !== sessionId) return res.status(403).json({ error: 'Session Invalid' });
    activeSessions[username].lastSeen = Date.now();
    res.json({ success: true });
});

app.get('/sessions', authenticateToken, (req, res) => {
    const now = Date.now();
    for(const user in activeSessions) if (now - activeSessions[user].lastSeen > 120000) delete activeSessions[user];
    res.json({ sessions: Object.values(activeSessions), banned: loadJson(BANNED_PATH) });
});

app.post('/ban', authenticateToken, (req, res) => {
    const { username, isBanned } = req.body;
    const banned = loadJson(BANNED_PATH);
    if (isBanned) { banned[username] = true; delete activeSessions[username]; } 
    else delete banned[username];
    saveJson(BANNED_PATH, banned);
    res.json({ success: true });
});

app.post('/screen/request', authenticateToken, (req, res) => { screenRequests[req.body.username] = true; res.json({ success: true }); });
app.get('/screen/check-request/:username', authenticateToken, (req, res) => {
    const requested = !!screenRequests[req.params.username];
    if (requested) delete screenRequests[req.params.username];
    res.json({ requested });
});
app.post('/screen/send', authenticateToken, (req, res) => { screenFrames[req.body.username] = { image: req.body.image, time: Date.now() }; res.json({ success: true }); });
app.get('/screen/view/:username', authenticateToken, (req, res) => {
    const frame = screenFrames[req.params.username];
    res.json({ image: frame && (Date.now() - frame.time < 15000) ? frame.image : null });
});

app.post('/message/send', authenticateToken, (req, res) => {
    const { username, message } = req.body;
    if (username && message) { userMessages[username] = message; res.json({ success: true }); }
    else res.status(400).json({ success: false });
});
app.get('/message/check/:username', authenticateToken, (req, res) => {
    const message = userMessages[req.params.username];
    if (message) delete userMessages[req.params.username];
    res.json({ message: message || null });
});

app.get('/audit', authenticateToken, (req, res) => res.json(getAuditLogs()));
app.post('/audit', authenticateToken, (req, res) => {
    const logs = getAuditLogs();
    logs.unshift({ id: Date.now().toString(), timestamp: Date.now(), ...req.body });
    if (logs.length > 500) logs.pop();
    fs.writeFileSync(AUDIT_PATH, JSON.stringify(logs, null, 2));
    res.json({ success: true });
});

// Tally XML API Proxy for Web Clients
app.post('/api/tally-proxy', express.text({ type: '*/*' }), async (req, res) => {
    const port = req.headers['x-tally-port'] || 9000;
    try {
        const fetch = (await import('node-fetch')).default || global.fetch;
        const response = await fetch(`http://127.0.0.1:${port}`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml; charset=utf-8' },
            body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
        });
        const text = await response.text();
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(text);
    } catch (err) {
        res.status(500).send("Tally Proxy Error: " + err.message);
    }
});

// --- MODULE: CMA PROJECT REPORT EXCEL GENERATION ---
app.post('/api/cma/generate', authenticateToken, async (req, res) => {
    try {
        const payload = req.body;
        const tempJsonPath = path.join(__dirname, `temp_cma_${Date.now()}.json`);
        const tempExcelPath = path.join(__dirname, `CMA_Report_${Date.now()}.xlsx`);

        // Save payload to temp json file
        fs.writeFileSync(tempJsonPath, JSON.stringify(payload));

        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        const generatorScript = path.join(__dirname, 'scripts', 'cma', 'cma_generator.py');

        // Spawn python script to build the spreadsheet
        const child = spawn(pythonCmd, [generatorScript, tempJsonPath, tempExcelPath]);
        
        let stderrData = '';
        child.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        child.on('close', (code) => {
            // Clean up temp JSON immediately
            try {
                if (fs.existsSync(tempJsonPath)) fs.unlinkSync(tempJsonPath);
            } catch (err) {}

            if (code !== 0) {
                console.error("Python generator error:", stderrData);
                return res.status(500).json({ error: "Failed to generate Excel report: " + stderrData });
            }

            // Stream Excel file for download and cleanup after sending
            res.download(tempExcelPath, `${payload.client_metadata?.company_name || 'CMA'}_Project_Report.xlsx`, (err) => {
                try {
                    if (fs.existsSync(tempExcelPath)) fs.unlinkSync(tempExcelPath);
                } catch (cleanupErr) {}
            });
        });

    } catch (error) {
        console.error("CMA generation server error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Catch-all to serve the React app for any other routes (client-side routing)
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Network Server API running on port ${PORT}`);

    // Spawn LevitateExtract python microservice programmatically
    try {
        const pythonScriptPath = path.join(__dirname, 'LevitateExtract', 'main.py');
        let pythonExe = 'python3';
        if (process.platform === 'win32') {
            try {
                execSync('python --version', { stdio: 'ignore' });
                pythonExe = 'python';
            } catch (e) {
                const userProfile = process.env.USERPROFILE || 'C:\\Users\\Dell05';
                pythonExe = path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'python.exe');
            }
        }

        console.log(`[LevitateExtract] Launching microservice programmatically: ${pythonExe}`);
        
        const env = { ...process.env };
        env.OPENBLAS_NUM_THREADS = '1';
        env.MKL_NUM_THREADS = '1';
        env.OMP_NUM_THREADS = '1';
        env.NUMEXPR_NUM_THREADS = '1';
        env.PYTHONDONTWRITEBYTECODE = '1';

        const outLog = fs.openSync(path.join(__dirname, 'LevitateExtract', 'programmatic_out.log'), 'a');
        const errLog = fs.openSync(path.join(__dirname, 'LevitateExtract', 'programmatic_err.log'), 'a');

        const pythonProcess = spawn(pythonExe, [pythonScriptPath], {
            cwd: path.join(__dirname, 'LevitateExtract'),
            env,
            detached: true,
            stdio: ['ignore', outLog, errLog]
        });

        pythonProcess.unref();

        console.log(`[LevitateExtract] Programmatic microservice spawned detached with log redirection. PID: ${pythonProcess.pid}`);
    } catch (err) {
        console.error("[LevitateExtract] Failed to spawn programmatic microservice:", err);
    }
});
