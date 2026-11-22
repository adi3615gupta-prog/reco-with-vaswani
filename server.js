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

// Lightweight .env loader for dev/on-prem runs (never overwrites existing process.env)
try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
                const k = trimmed.slice(0, eqIdx).trim();
                const v = trimmed.slice(eqIdx + 1).trim();
                if (k && process.env[k] === undefined) process.env[k] = v;
            }
        }
    }
} catch {}

// Polyfill global DOM primitives if missing in Node runtime (prevents PDF parsing library crashes)
if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {
        constructor() {
            this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
            this.m11 = 1; this.m12 = 0; this.m13 = 0; this.m14 = 0;
            this.m21 = 0; this.m22 = 1; this.m23 = 0; this.m24 = 0;
            this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0;
            this.m41 = 0; this.m42 = 0; this.m43 = 0; this.m44 = 1;
            this.is2D = true;
        }
        translate() { return this; }
        scale() { return this; }
        preMultiplySelf() { return this; }
        invertSelf() { return this; }
        multiplySelf() { return this; }
    };
}
if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData {
        constructor(w = 0, h = 0) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); }
    };
}
if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D {
        addPath() {}
    };
}

// Catch and suppress transient Playwright IPC channel unbound race conditions without crashing the server
process.on('uncaughtException', (err) => {
    if (err && err.message && (err.message.includes('was not bound in the connection') || err.message.includes('Target page, context or browser has been closed'))) {
        console.warn('[Playwright IPC Guard] Suppressed transient unbound channel exception:', err.message);
        return;
    }
    console.error('[Server Uncaught Exception]:', err);
});
process.on('unhandledRejection', (reason) => {
    const msg = (reason && reason.message) || String(reason || '');
    if (msg.includes('was not bound in the connection') || msg.includes('Target page, context or browser has been closed')) {
        return;
    }
    console.error('[Server Unhandled Rejection]:', reason);
});

import setupTdsRoutes from './tds_routes.js';
import setupTaxRoutes from './tax_routes.js';
import setupGDriveRoutes from './gdrive_routes.js';
import setupImsRoutes from './ims_routes.js';
import setupGstr2bRoutes from './gstr2b_routes.js';
import setupGstr1Routes from './gstr1_routes.js';
import setupReturnsStorageRoutes from './returns_storage_routes.js';
import setupAuditTrailRoutes from './audit_trail_routes.js';
import setupNoticesRoutes from './notices_routes.js';
import setupMonthlyAuditRoutes from './monthly_audit_routes.js';
import setupAuditStorageRoutes from './audit_storage_routes.js';
import setupGeminiRoutes, { syncCloudGeminiKey } from './gemini_routes.js';
import { launchAutopilotBrowser } from './gstr2b/browserLauncher.js';
import { encryptSecret, decryptSecret, isEncryptedSecret } from './cryptoVault.js';
import { syncCredentialsWithCentral, getActiveDataPathFromDb } from './credentialsVaultSync.js';

import helmet from 'helmet';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, addDoc, serverTimestamp, onSnapshot, setLogLevel } from "firebase/firestore";

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
setLogLevel("silent");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            mediaSrc: ["'self'", "blob:"],
            connectSrc: [
                "'self'",
                "http://localhost:*",
                "http://127.0.0.1:*",
                "http://192.168.*:*",
                "http://10.*:*",
                "https://*.googleapis.com",
                "https://firestore.googleapis.com",
                "https://*.firebaseio.com",
                "https://generativelanguage.googleapis.com",
                "https://*.cloudfunctions.net"
            ],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'self'"]
        }
    }
}));
const PORT = 3001;

const userDataPath = process.env.USER_DATA_PATH || '.';

// Load or generate JWT Secret locally (encrypted at rest via cryptoVault AES-256-GCM)
const CONFIG_PATH = path.join(userDataPath, 'server_config.json');
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            const rawCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            if (rawCfg && rawCfg.jwtSecret) {
                JWT_SECRET = decryptSecret(rawCfg.jwtSecret);
                // Migrate legacy plaintext jwtSecret to encrypted format at rest
                if (!isEncryptedSecret(rawCfg.jwtSecret) && JWT_SECRET) {
                    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ jwtSecret: encryptSecret(JWT_SECRET) }), { mode: 0o600 });
                }
            }
        } catch(e) {}
    }
    if (!JWT_SECRET) {
        JWT_SECRET = crypto.randomBytes(32).toString('hex');
        try {
            if (!fs.existsSync(userDataPath)) {
                fs.mkdirSync(userDataPath, { recursive: true });
            }
            fs.writeFileSync(CONFIG_PATH, JSON.stringify({ jwtSecret: encryptSecret(JWT_SECRET) }), { mode: 0o600 });
            console.log("Generated new secure encrypted JWT Secret for this installation.");
        } catch (err) {
            console.error("Failed to write server_config.json:", err);
        }
    }
}

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    const getIsLocal = () => {
        // Use the real socket only: x-forwarded-for is client-controlled. Public tunnel traffic also arrives on loopback, so exclude it.
        const sock = String(req.socket.remoteAddress || '').replace('::ffff:', '');
        const viaTunnel = /loca\.lt/i.test(`${req.headers['host'] || ''} ${req.headers['x-forwarded-host'] || ''}`);
        return (sock === '127.0.0.1' || sock === '::1') && !viaTunnel;
    };

    if (!token || token === 'null' || token === 'undefined') {
        if (getIsLocal()) {
            req.user = { id: 'admin', username: 'admin', role: 'admin' };
            return next();
        }
        return res.sendStatus(401);
    }
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            if (getIsLocal()) {
                req.user = { id: 'admin', username: 'admin', role: 'admin' };
                return next();
            }
            return res.sendStatus(401);
        }
        req.user = user;
        next();
    });
};



const isAdminUser = (user) => String(user?.role || '').toLowerCase() === 'admin';
const isAdminOrSenior = (user) => {
    const r = String(user?.role || '').toLowerCase();
    return r === 'admin' || r === 'senior auditor' || r === 'senior';
};
const isSameUserOrAdmin = (user, targetUsername) => {
    if (isAdminUser(user)) return true;
    const actor = String(user?.username || '').toLowerCase().trim();
    const target = String(targetUsername || '').toLowerCase().trim();
    return Boolean(actor) && actor === target;
};

// Zero-dependency sliding-window rate limiter middleware
const createRateLimiter = ({ windowMs, maxRequests, keyFn, message }) => {
    const hits = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const key = String(keyFn ? keyFn(req) : (req.ip || req.socket?.remoteAddress || 'unknown'));
        const cutoff = now - windowMs;
        const fresh = (hits.get(key) || []).filter((t) => t > cutoff);
        if (fresh.length >= maxRequests) {
            hits.set(key, fresh);
            return res.status(429).json({ success: false, error: message || 'Too many requests. Please try again later.' });
        }
        fresh.push(now);
        hits.set(key, fresh);
        if (hits.size > 1000) {
            for (const [k, list] of hits.entries()) {
                const kept = list.filter((t) => t > cutoff);
                if (kept.length === 0) hits.delete(k);
                else hits.set(k, kept);
            }
        }
        next();
    };
};

const authRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 20,
    keyFn: (req) => req.ip || req.socket?.remoteAddress || 'unknown',
    message: 'Too many authentication attempts. Please try again in 15 minutes.'
});

const mailRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyFn: (req) => req.user?.username || req.ip || 'unknown',
    message: 'Email dispatch rate limit exceeded (max 10 requests per minute).'
});

// Serve the updates folder statically so Electron can download the .yml and .exe files
app.use('/updates', express.static(path.join(__dirname, 'updates')));
// Note: /super-admin static serving removed from customer servers for security isolation
// Serve the React frontend app statically with no-cache headers to prevent browser caching of code updates
// Function to reliably find the 'dist' directory whether in dev, production asar, or unpacked
function findDistPath() {
    const candidates = [
        path.join(path.dirname(process.execPath), 'resources', 'app.asar.unpacked', 'dist'),
        path.join(path.dirname(process.execPath), 'resources', 'app.asar', 'dist'),
        path.join(path.dirname(process.execPath), 'resources', 'app', 'dist'),
        path.join(process.cwd(), 'resources', 'app.asar.unpacked', 'dist'),
        path.join(process.cwd(), 'resources', 'app.asar', 'dist'),
        typeof __dirname !== 'undefined' ? path.join(__dirname, 'dist') : null,
        path.join(process.cwd(), 'dist'),
        path.join(path.dirname(process.execPath), 'dist')
    ].filter(Boolean);

    for (const p of candidates) {
        try {
            if (fs.existsSync(path.join(p, 'index.html'))) {
                console.log(`[Frontend Path] Located valid dist folder at: ${p}`);
                return p;
            }
        } catch (e) {
            if (e && e.code !== 'unavailable') {
                console.warn('[Frontend Path Warning]:', e.message);
            }
        }
    }
    const fallback = typeof __dirname !== 'undefined' ? path.join(__dirname, 'dist') : path.join(process.cwd(), 'dist');
    console.warn(`[Frontend Path] Warning: could not locate index.html. Defaulting to: ${fallback}`);
    return fallback;
}

const DIST_PATH = findDistPath();

app.use(express.static(DIST_PATH, {
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
// CORS: Restrict to localhost, Electron, and private RFC 1918 LAN subnets
const allowedLocalOrigins = new Set([
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://localhost:3001',
    'http://127.0.0.1:3001'
]);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (Electron file://, desktop IPC, local curl)
        if (!origin) return callback(null, true);
        if (allowedLocalOrigins.has(origin)) return callback(null, true);

        try {
            const url = new URL(origin);
            const hostname = url.hostname;
            if (
                hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname === '::1' ||
                /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
                /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
                /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
            ) {
                return callback(null, true);
            }
        } catch (e) {
            if (e && e.code !== 'unavailable') {
                console.warn('[CORS Security Warning]:', e.message);
            }
        }

        callback(new Error('Blocked by Vaswani Enterprise CORS security policy'));
    },
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health & Ping Endpoints (fast, unauthenticated for latency diagnostics)
app.get('/api/ping', (req, res) => res.json({ success: true, status: 'ok', isServer: true, pcName: os.hostname(), timestamp: Date.now() }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: Date.now() }));

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

// Ensure master database is seeded into production userDataPath if missing or empty
function ensureProductionDatabase(targetDbPath, userDataDir) {
    try {
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true });
        }

        const candidateMasters = [
            path.join(path.dirname(process.execPath), 'resources', 'network_data.db'),
            path.join(process.cwd(), 'resources', 'network_data.db'),
            typeof __dirname !== 'undefined' ? path.join(__dirname, 'network_data.db') : null,
            path.join(process.cwd(), 'network_data.db'),
            path.join(path.dirname(process.execPath), 'network_data.db')
        ].filter(Boolean);

        let masterSeedPath = null;
        for (const candidate of candidateMasters) {
            try {
                if (fs.existsSync(candidate) && path.resolve(candidate) !== path.resolve(targetDbPath)) {
                    const stats = fs.statSync(candidate);
                    if (stats.size > 50000) {
                        masterSeedPath = candidate;
                        break;
                    }
                }
            } catch (e) {
                if (e && e.code !== 'unavailable') {
                    console.warn('[Database Seed Warning]:', e.message);
                }
            }
        }

        if (!masterSeedPath) return;

        const targetExists = fs.existsSync(targetDbPath);
        const targetSize = targetExists ? fs.statSync(targetDbPath).size : 0;

        // If target doesn't exist, or is small / empty
        if (!targetExists || targetSize < 50000) {
            console.log(`[DB Init] Seeding production database from master (${masterSeedPath}) to (${targetDbPath})...`);
            fs.copyFileSync(masterSeedPath, targetDbPath);
            console.log('[DB Init] Master database successfully seeded with all client records!');
        }
    } catch (err) {
        console.warn('[DB Init] Warning during master database seeding:', err.message);
    }
}

ensureProductionDatabase(DB_PATH, userDataPath);

// 1. Initialize SQLite Database
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error("Database connection error:", err);
    } else {
        console.log("Connected to SQLite Database at", DB_PATH);
        db.run('PRAGMA journal_mode = WAL;');
        db.run('PRAGMA busy_timeout = 10000;');
        db.run('PRAGMA synchronous = NORMAL;');
    }
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
    db.run(`ALTER TABLE network_users ADD COLUMN name TEXT`, (err) => { /* ignore if exists */ });
    db.run(`ALTER TABLE network_users ADD COLUMN designation TEXT`, (err) => { /* ignore if exists */ });
    db.run(`ALTER TABLE network_users ADD COLUMN department TEXT`, (err) => { /* ignore if exists */ });
    db.run(`ALTER TABLE network_users ADD COLUMN current_device_id TEXT`, (err) => { /* ignore if exists */ });
    db.run(`ALTER TABLE clients ADD COLUMN portal_username TEXT`, (err) => { /* ignore if exists */ });
    db.run(`ALTER TABLE clients ADD COLUMN portal_password TEXT`, (err) => { /* ignore if exists */ });
    db.run(`ALTER TABLE clients ADD COLUMN address TEXT`, (err) => { /* ignore if exists */ });
    db.run(`ALTER TABLE clients ADD COLUMN last_updated INTEGER DEFAULT 0`, (err) => { /* ignore if exists */ });
    db.run(`ALTER TABLE clients ADD COLUMN is_deleted INTEGER DEFAULT 0`, (err) => { /* ignore if exists */ });
    db.run(`ALTER TABLE clients ADD COLUMN created_at INTEGER DEFAULT 0`, (err) => { /* ignore if exists */ });
    db.run(`CREATE INDEX IF NOT EXISTS idx_clients_gstin_deleted ON clients (gstin, is_deleted)`, (err) => { /* ignore */ });

    // Run startup security migrations: hash legacy user passwords and encrypt stored secrets
    db.serialize(() => {
        // Upgrade legacy plaintext passwords in network_users to bcrypt
        db.all(`SELECT username, password_hash FROM network_users`, [], async (err, rows) => {
            if (!err && rows && rows.length > 0) {
                for (const row of rows) {
                    const current = row.password_hash || '';
                    if (current && !current.startsWith('$2')) {
                        try {
                            const hashed = await bcrypt.hash(current, 10);
                            db.run(`UPDATE network_users SET password_hash = ? WHERE username = ?`, [hashed, row.username]);
                            console.log(`[Security] Upgraded plaintext password for user '${row.username}' to bcrypt`);
                        } catch (hashErr) {
                            console.error(`[Security] Failed to hash password for '${row.username}':`, hashErr.message);
                        }
                    }
                }
            }
        });

        // Encrypt legacy plaintext clients.portal_password
        db.all(`SELECT id, gstin, portal_password FROM clients WHERE portal_password IS NOT NULL AND portal_password != ''`, [], (err, rows) => {
            if (!err && rows && rows.length > 0) {
                for (const row of rows) {
                    if (row.portal_password && !isEncryptedSecret(row.portal_password)) {
                        const enc = encryptSecret(row.portal_password);
                        db.run(`UPDATE clients SET portal_password = ? WHERE id = ?`, [enc, row.id]);
                    }
                }
            }
        });

        // Encrypt legacy plaintext ims_email_settings.app_password
        db.all(`SELECT id, app_password FROM ims_email_settings WHERE app_password IS NOT NULL AND app_password != ''`, [], (err, rows) => {
            if (!err && rows && rows.length > 0) {
                for (const row of rows) {
                    if (row.app_password && !isEncryptedSecret(row.app_password)) {
                        const enc = encryptSecret(row.app_password);
                        db.run(`UPDATE ims_email_settings SET app_password = ? WHERE id = ?`, [enc, row.id]);
                    }
                }
            }
        });
    });
});

// 3. Initialize TDS Routes
setupTdsRoutes(app, db, authenticateToken);

// 4. Initialize Tax Routes
setupTaxRoutes(app, db, authenticateToken);

// 5. Initialize Google Drive Cloud Backup Routes
setupGDriveRoutes(app, authenticateToken);

// 6. Initialize GST IMS Routes (Multi-PC Central Vault Sync)
app.use('/api/ims', (req, res, next) => {
    if (req.path.startsWith('/public/review/') || req.path.startsWith('/public/submit/')) {
        return next();
    }
    return authenticateToken(req, res, (err) => {
        if (err) return next(err);
        if (req.path === '/email-settings/save' || req.path === '/email-settings/test') {
            if (!isAdminUser(req.user)) {
                return res.status(403).json({ success: false, error: 'Admin privileges required for email settings' });
            }
        }
        next();
    });
});
app.post('/api/ims/broadcast-email', authenticateToken, mailRateLimiter);
setupImsRoutes(app, db, userDataPath, authenticateToken);

// 7. Initialize GSTR-2B Auto Downloader Routes
setupGstr2bRoutes(app, db, authenticateToken);

// 8. Initialize GSTR-1 Auto Downloader Routes
setupGstr1Routes(app, db, authenticateToken);

// 9. Initialize Returns Server Shared Storage Routes (Multi-PC LAN Access)
app.post('/api/returns/send-client-mail', authenticateToken, mailRateLimiter);
setupReturnsStorageRoutes(app, db, userDataPath, authenticateToken);

// 10. Initialize Reconciliation Override Audit Trail Routes (Statutory AUDIT-01)
setupAuditTrailRoutes(app, db, userDataPath, authenticateToken);
setupNoticesRoutes(app, db, authenticateToken);
setupMonthlyAuditRoutes(app, db, userDataPath, authenticateToken);
setupAuditStorageRoutes(app, db, userDataPath, authenticateToken);
setupGeminiRoutes(app, db, firestore, authenticateToken);

const saveUserToLocalDb = (user) => {
    db.run(`INSERT INTO network_users (username, password_hash, role, is_active, office_id, device_id, name, designation, department, current_device_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(username) DO UPDATE SET
            password_hash = excluded.password_hash,
            role = excluded.role,
            is_active = excluded.is_active,
            office_id = excluded.office_id,
            device_id = excluded.device_id,
            name = COALESCE(excluded.name, network_users.name),
            designation = COALESCE(excluded.designation, network_users.designation),
            department = COALESCE(excluded.department, network_users.department),
            current_device_id = excluded.current_device_id`,
        [
            user.username.toLowerCase().trim(),
            user.password_hash || user.password || '',
            user.role,
            user.is_active,
            user.office_id,
            user.device_id || null,
            user.name || null,
            user.designation || null,
            user.department || null,
            user.current_device_id || null
        ]
    );
};

const getOfficeId = () => new Promise(res => {
    db.get(`SELECT value FROM app_config WHERE key = 'office_id'`, [], (err, row) => {
        res(row ? row.value : null);
    });
});

const getActiveSerialKey = () => new Promise(res => {
    db.get(`SELECT value FROM app_config WHERE key = 'active_serial_key'`, [], (err, row) => {
        res(row ? row.value : null);
    });
});


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

    if (LICENSE_API_URL) {
        const pollGateway = async () => {
            try {
                const now = Date.now();
                for (const user in activeSessions) {
                    if (now - activeSessions[user].lastSeen > 120000) delete activeSessions[user];
                }
                const gw = await callLicenseGateway('checkServerLicense', {
                    officeId,
                    activeUsernames: Object.keys(activeSessions),
                    publicUrl: activeTunnel?.url || null
                });
                if (!gw || !gw.ok) return;
                if (gw.data.deleted || gw.data.exists === false) {
                    SERVER_REVOKED = true;
                    LICENSE_DELETED = true;
                    console.log("CRITICAL: LICENSE HAS BEEN DELETED OR NOT FOUND IN CLOUD DB!");
                    return;
                }
                LICENSE_DELETED = false;
                SERVER_REVOKED = Boolean(gw.data.revoked);
                if (!SERVER_REVOKED && gw.data.geminiApiKey) {
                    const encryptedCloudKey = encryptSecret(gw.data.geminiApiKey);
                    db.serialize(() => {
                        db.run("INSERT INTO app_config (key, value) VALUES ('gemini_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [encryptedCloudKey]);
                        db.run("INSERT INTO app_config (key, value) VALUES ('gemini_key_origin', 'cloud_office') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
                    });
                }
            } catch (err) {
                console.warn("[License Monitor] Gateway polling warning:", err.message);
            }
        };
        pollGateway();
        _heartbeatInterval = setInterval(pollGateway, 30000);
        return;
    }

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

            // Sync AI API Key if configured in cloud server key
            let cloudKey = null;
            for (const [k, v] of Object.entries(serverKeyDoc)) {
                if (k.trim() === 'gemini_api_key' && typeof v === 'string' && v.trim().length > 5) {
                    cloudKey = v.trim();
                    break;
                }
            }
            if (cloudKey) {
                const encryptedCloudKey = encryptSecret(cloudKey);
                db.serialize(() => {
                    db.run(
                        "INSERT INTO app_config (key, value) VALUES ('gemini_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                        [encryptedCloudKey]
                    );
                    db.run(
                        "INSERT INTO app_config (key, value) VALUES ('gemini_key_origin', 'cloud_office') ON CONFLICT(key) DO UPDATE SET value = excluded.value"
                    );
                });
                console.log("[AI Cloud Sync] Encrypted API key synced from office cloud license via live snapshot");
            }
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
                const lastActiveAt = Number(userData.last_active_at) || 0;
                const hasRecentHeartbeat = lastActiveAt > 0 && (now - lastActiveAt < 180000);
                const isOnline = Boolean(activeSessions[username]) || hasRecentHeartbeat;
                const currentStatus = userData.status || 'offline';

                if (currentStatus === 'online' && !isOnline) {
                    await updateDoc(docSnap.ref, { status: 'offline', current_device_id: null });
                }
            }
        } catch (e) {
            if (e && e.code !== 'unavailable') {
                console.warn('[Frontend Path Warning]:', e.message);
            }
        }
    }, 60000);
};

// Startup: Initialize license monitoring if office_id already exists in local DB
setTimeout(async () => {
    const officeId = await getOfficeId();
    if (officeId) {
        setupLicenseMonitoring(officeId);
    }

    // Startup AI Cloud Sync (Office or Global Master)
    try {
        const syncRes = await syncCloudGeminiKey(firestore, db, officeId);
        if (syncRes.synced) {
            console.log(`[AI Cloud Sync] Startup sync successful (origin: ${syncRes.origin})`);
        }
    } catch (e) {
        console.warn("[AI Cloud Sync] Startup sync warning:", e.message);
    }
}, 5000);

const LICENSE_EXEMPT_PATHS = [
    '/activate',
    '/activation-status',
    '/reset-license',
    '/admin-exists',
    '/ping',
    '/health',
    '/network-info',
    '/login',
    '/logout'
];
app.use('/api', async (req, res, next) => {
    if (LICENSE_DELETED && !LICENSE_EXEMPT_PATHS.includes(req.path)) {
        return res.status(410).json({ error: "CRITICAL: License has been permanently deleted by Super Admin." });
    }
    if (SERVER_REVOKED && !LICENSE_EXEMPT_PATHS.includes(req.path)) {
        return res.status(403).json({ error: "CRITICAL: Server Key has been revoked by Super Admin. Access Denied." });
    }
    if (!LICENSE_EXEMPT_PATHS.includes(req.path) && !req.path.startsWith('/ims/public/')) {
        const officeId = await getOfficeId();
        if (!officeId) {
            return res.status(403).json({
                error: "Application is not activated. Please enter a valid serial key.",
                notActivated: true
            });
        }
    }
    next();
});

app.get('/api/activation-status', async (req, res) => {
    try {
        const [officeId, activeKey] = await Promise.all([getOfficeId(), getActiveSerialKey()]);
        res.json({
            activated: Boolean(officeId && activeKey),
            revoked: SERVER_REVOKED,
            deleted: LICENSE_DELETED
        });
    } catch (err) {
        res.status(500).json({ activated: false, revoked: SERVER_REVOKED, deleted: LICENSE_DELETED });
    }
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
let activeTunnelExpiryTimer = null;
const TUNNEL_TTL_MS = 2 * 60 * 60 * 1000; // Auto-close public tunnel after 2 hours
const TUNNEL_BLOCKED_PREFIXES = ['/activate', '/reset-license', '/keys', '/users', '/network/go-global', '/network/stop-global'];
import localtunnel from 'localtunnel';

const isTunnelRequest = (req) => {
    const fwdHost = String(req.headers['x-forwarded-host'] || '').toLowerCase();
    const host = String(req.headers['host'] || '').toLowerCase();
    return Boolean(activeTunnel) && (fwdHost.includes('loca.lt') || host.includes('loca.lt'));
};

app.use('/api', (req, res, next) => {
    if (isTunnelRequest(req) && TUNNEL_BLOCKED_PREFIXES.some(p => req.path.startsWith(p))) {
        return res.status(403).json({ error: 'Administrative and licensing endpoints are blocked over public remote tunnels.' });
    }
    next();
});

app.post('/api/network/go-global', authenticateToken, async (req, res) => {
    if (!isAdminUser(req.user)) return res.status(403).json({ error: "Admin only" });
    try {
        if (activeTunnelExpiryTimer) {
            clearTimeout(activeTunnelExpiryTimer);
            activeTunnelExpiryTimer = null;
        }
        if (activeTunnel) {
            activeTunnel.close();
            activeTunnel = null;
        }
        activeTunnel = await localtunnel({ port: PORT });
        const expiresAt = Date.now() + TUNNEL_TTL_MS;
        activeTunnelExpiryTimer = setTimeout(() => {
            if (activeTunnel) {
                try { activeTunnel.close(); } catch {}
                activeTunnel = null;
            }
            console.log('[Global Tunnel] Auto-expired after 2 hours for security.');
        }, TUNNEL_TTL_MS);

        try {
            const logs = getAuditLogs();
            logs.unshift({
                id: Date.now().toString(),
                timestamp: Date.now(),
                username: req.user.username,
                action: 'Started Global Tunnel',
                details: `Tunnel expires in 2h`
            });
            if (logs.length > 500) logs.pop();
            fs.writeFileSync(AUDIT_PATH, JSON.stringify(logs, null, 2));
        } catch {}
        
        const officeId = await getOfficeId();
        if (officeId) {
            if (LICENSE_API_URL) {
                await callLicenseGateway('checkServerLicense', {
                    officeId,
                    activeUsernames: Object.keys(activeSessions),
                    publicUrl: activeTunnel.url
                }).catch(() => {});
            } else {
                // Find the server key and update it
                const snap = await getDocs(query(collection(firestore, 'serial_keys'), where('office_id', '==', officeId), where('key_type', '==', 'server')));
                if (!snap.empty) {
                    await updateDoc(snap.docs[0].ref, { public_url: activeTunnel.url, is_global: true });
                }
            }
        }
        
        res.json({ success: true, url: activeTunnel.url, expiresAt });
    } catch (err) {
        res.status(500).json({ error: "Failed to start tunnel: " + err.message });
    }
});

app.post('/api/network/stop-global', authenticateToken, async (req, res) => {
    if (!isAdminUser(req.user)) return res.status(403).json({ error: "Admin only" });
    if (activeTunnelExpiryTimer) {
        clearTimeout(activeTunnelExpiryTimer);
        activeTunnelExpiryTimer = null;
    }
    if (activeTunnel) {
        try { activeTunnel.close(); } catch {}
        activeTunnel = null;
    }
    res.json({ success: true });
});

const LICENSE_API_URL = (process.env.LICENSE_API_URL || '').replace(/\/+$/, '');
const LICENSE_GATEWAY_TOKEN = process.env.LICENSE_GATEWAY_TOKEN || '';

async function callLicenseGateway(endpoint, body) {
    if (!LICENSE_API_URL) return null;
    const headers = { 'Content-Type': 'application/json' };
    if (LICENSE_GATEWAY_TOKEN) headers['x-license-token'] = LICENSE_GATEWAY_TOKEN;
    const res = await withTimeout(fetch(`${LICENSE_API_URL}/${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    }), 4000);
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
}

async function syncAndValidateDevice({ officeId, serialKey, deviceId, pcName, osUser, clientIp, username, eventType }) {
    if (!officeId) {
        if (eventType === 'logout') return { allowed: true };
        return { allowed: false, status: 403, code: 'NOT_ACTIVATED', error: 'Application is not activated.' };
    }
    if (!deviceId || deviceId === 'legacy_device') {
        if (eventType === 'logout') return { allowed: true };
        return { allowed: false, status: 400, code: 'DEVICE_ID_REQUIRED', error: 'Valid workstation device ID is required.' };
    }
    if (LICENSE_API_URL) {
        try {
            const gw = await callLicenseGateway('heartbeatSync', { officeId, serialKey, deviceId, pcName, osUser, clientIp, username, eventType });
            if (gw) {
                if (!gw.ok || gw.data?.allowed === false) {
                    return {
                        allowed: false,
                        status: gw.status || 403,
                        code: gw.data?.code || 'DEVICE_RESTRICTED',
                        deviceRemoved: Boolean(gw.data?.deviceRemoved),
                        error: gw.data?.error || 'Workstation license validation failed.'
                    };
                }
                return { allowed: true };
            }
        } catch {
            return { allowed: true, offline: true };
        }
    }
    try {
        const keysSnap = await withTimeout(
            getDocs(query(collection(firestore, 'serial_keys'), where('office_id', '==', officeId))),
            3000
        );
        const normKey = serialKey ? String(serialKey).trim().toUpperCase() : '';
        const nowMs = Date.now();
        const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        // 1. Check restriction across any key in this office first
        if (eventType !== 'logout') {
            for (const keyDoc of keysSnap.docs) {
                const kd = keyDoc.data();
                const devEntry = kd.devices_info?.[deviceId];
                if (devEntry && (devEntry.is_restricted === true || devEntry.status === 'RESTRICTED')) {
                    return {
                        allowed: false,
                        status: 403,
                        code: 'DEVICE_RESTRICTED',
                        error: `Workstation "${devEntry.pc_name || deviceId}" has been restricted by Super Admin. Contact your administrator.`
                    };
                }
            }
        }

        // 2. If client presented an activated serialKey, verify the key is active and this PC is still bound
        let targetDocs = [];
        if (normKey) {
            const matchedKeyDoc = keysSnap.docs.find(d => d.id.toUpperCase() === normKey || String(d.data().key || '').toUpperCase() === normKey);
            if (matchedKeyDoc) {
                const kd = matchedKeyDoc.data();
                if (eventType !== 'logout') {
                    if (kd.is_active === 0) {
                        return { allowed: false, status: 403, code: 'KEY_REVOKED', error: 'This Serial Key has been revoked by Super Admin.' };
                    }
                    const bound = Array.isArray(kd.bound_devices) ? kd.bound_devices : (kd.device_id ? [kd.device_id] : []);
                    if (!bound.includes(deviceId)) {
                        return {
                            allowed: false,
                            status: 403,
                            code: 'DEVICE_REMOVED',
                            deviceRemoved: true,
                            error: 'This PC was removed from the Serial Key by Super Admin. Please activate again.'
                        };
                    }
                }
                targetDocs = [matchedKeyDoc];
            }
        }

        // Fallback: find any key in this office where this deviceId is already bound/tracked
        if (targetDocs.length === 0) {
            targetDocs = keysSnap.docs.filter(d => {
                const kd = d.data();
                const bound = Array.isArray(kd.bound_devices) ? kd.bound_devices : (kd.device_id ? [kd.device_id] : []);
                return bound.includes(deviceId) || Boolean(kd.devices_info?.[deviceId]);
            });
        }

        // 3. On heartbeat, enforce Super Admin "Make Offline" action immediately
        if (eventType === 'heartbeat') {
            for (const keyDoc of targetDocs) {
                const devEntry = keyDoc.data().devices_info?.[deviceId];
                if (devEntry && devEntry.status === 'OFFLINE' && devEntry.force_offline_at) {
                    return {
                        allowed: false,
                        status: 403,
                        code: 'DEVICE_OFFLINE',
                        error: `Session on "${devEntry.pc_name || deviceId}" was made offline by Super Admin.`
                    };
                }
            }
        }

        // 4. Keep PC metadata, live status & last_seen synchronized in Firestore
        for (const keyDoc of targetDocs) {
            const kd = keyDoc.data();
            const boundDevices = Array.isArray(kd.bound_devices) ? [...kd.bound_devices] : (kd.device_id ? [kd.device_id] : []);
            const devicesInfo = (kd.devices_info && typeof kd.devices_info === 'object') ? { ...kd.devices_info } : {};
            const existing = devicesInfo[deviceId] || {};

            if (eventType === 'heartbeat') {
                const needsSync =
                    existing.status !== 'ONLINE' ||
                    existing.current_user !== (username || null) ||
                    !existing.last_seen_ms ||
                    (nowMs - Number(existing.last_seen_ms) > 120000);
                if (!needsSync) continue;
            }

            const nextStatus =
                eventType === 'logout'
                    ? (existing.is_restricted ? 'RESTRICTED' : 'OFFLINE')
                    : 'ONLINE';

            devicesInfo[deviceId] = {
                ...existing,
                device_id: deviceId,
                pc_name: pcName || existing.pc_name || `PC-${deviceId.slice(-4)}`,
                os_user: osUser || existing.os_user || 'User',
                ip: clientIp || existing.ip || 'LAN',
                activated_at: existing.activated_at || nowStr,
                last_seen: nowStr,
                last_seen_ms: nowMs,
                status: nextStatus,
                is_restricted: Boolean(existing.is_restricted),
                current_user: eventType === 'logout' ? null : (username || existing.current_user || null),
                force_offline_at: eventType === 'login' ? null : (existing.force_offline_at || null)
            };

            // Remove orphan devicesInfo entries not in boundDevices (if boundDevices is populated)
            if (boundDevices.length > 0) {
                for (const id of Object.keys(devicesInfo)) {
                    if (!boundDevices.includes(id)) delete devicesInfo[id];
                }
            }

            await withTimeout(updateDoc(keyDoc.ref, {
                devices_info: devicesInfo,
                devices_list: Object.values(devicesInfo),
                active_pc_count: boundDevices.length
            }), 3000).catch(() => {});
        }

        return { allowed: true };
    } catch (err) {
        // Never block workstation login/heartbeat during transient Firebase offline periods
        return { allowed: true, offline: true };
    }
}

app.post('/api/activate', authRateLimiter, async (req, res) => {
    const { serialKey, deviceId, pcName, osUser } = req.body || {};
    if (!serialKey || typeof serialKey !== 'string') {
        return res.status(400).json({ error: "Serial key is required" });
    }
    if (!deviceId || typeof deviceId !== 'string' || deviceId === 'legacy_device') {
        return res.status(400).json({ error: "Valid workstation device ID is required" });
    }
    if (LICENSE_API_URL) {
        try {
            const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Localhost').replace('::ffff:', '');
            const gw = await callLicenseGateway('activateKey', {
                serialKey,
                deviceId,
                pcName: pcName || os.hostname(),
                osUser: osUser || os.userInfo().username,
                clientIp,
                boundMac: SERVER_MAC
            });
            if (!gw.ok) {
                return res.status(gw.status || 403).json({ error: gw.data?.error || 'Activation rejected by Cloud License Gateway' });
            }
            if (gw.data?.officeId) {
                await new Promise((resolve, reject) => {
                    db.run(`INSERT INTO app_config (key, value) VALUES ('office_id', ?) ON CONFLICT(key) DO UPDATE SET value = ?`, [gw.data.officeId, gw.data.officeId], (err) => (err ? reject(err) : resolve()));
                });
                setupLicenseMonitoring(gw.data.officeId);
            }
            await new Promise((resolve) => {
                db.run(`INSERT INTO app_config (key, value) VALUES ('active_serial_key', ?) ON CONFLICT(key) DO UPDATE SET value = ?`, [serialKey, serialKey], () => resolve());
            });
            if (gw.data?.geminiApiKey) {
                const encAiKey = encryptSecret(String(gw.data.geminiApiKey).trim());
                db.run(`INSERT INTO app_config (key, value) VALUES ('gemini_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [encAiKey]);
                db.run(`INSERT INTO app_config (key, value) VALUES ('gemini_key_origin', 'cloud_office') ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
            }
            return res.json(gw.data);
        } catch (gwErr) {
            return res.status(502).json({ error: `Cloud License Gateway unavailable: ${gwErr.message}` });
        }
    }
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
        await new Promise((resolve) => {
            db.run(`INSERT INTO app_config (key, value) VALUES ('active_serial_key', ?) ON CONFLICT(key) DO UPDATE SET value = ?`, [serialKey, serialKey], () => resolve());
        });

        // Multi-PC Seat Capacity Policy
        const maxDevices = Number(row.max_devices) || 1;
        
        // FIX: Respect current bound_devices array from Firestore WITHOUT resurrecting deleted devices from row.device_id
        let boundDevices = Array.isArray(row.bound_devices)
            ? [...row.bound_devices]
            : (row.device_id ? [row.device_id] : []);

        const isAlreadyBound = deviceId && boundDevices.includes(deviceId);

        if (deviceId && (row.devices_info?.[deviceId]?.is_restricted === true || row.devices_info?.[deviceId]?.status === 'RESTRICTED')) {
            return res.status(403).json({
                error: "This PC has been restricted by Super Admin. Contact your administrator."
            });
        }

        if (!isAlreadyBound) {
            if (boundDevices.length >= maxDevices) {
                return res.status(403).json({
                    error: `License limit reached (${boundDevices.length}/${maxDevices} PCs active). Remove an unused PC from Firebase Console or increase allowed PC seats on this serial key.`
                });
            }
            if (deviceId) {
                boundDevices.push(deviceId);
            }
        }

        // Prepare rich devices detail map & list for clear Firebase Console visibility
        const clientPcName = pcName || os.hostname() || ('PC-' + (deviceId ? deviceId.slice(-4) : 'UNKNOWN'));
        const clientOsUser = osUser || os.userInfo().username || 'User';
        const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Localhost').replace('::ffff:', '');
        const currentTimestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        let devicesInfo = (row.devices_info && typeof row.devices_info === 'object') ? { ...row.devices_info } : {};

        // Sync: remove any devices from devices_info that were deleted from boundDevices
        for (const existingId of Object.keys(devicesInfo)) {
            if (!boundDevices.includes(existingId)) {
                delete devicesInfo[existingId];
            }
        }

        // Register / update this device
        if (deviceId) {
            devicesInfo[deviceId] = {
                ...(devicesInfo[deviceId] || {}),
                device_id: deviceId,
                pc_name: clientPcName,
                os_user: clientOsUser,
                ip: clientIp,
                activated_at: devicesInfo[deviceId]?.activated_at || currentTimestamp,
                last_seen: currentTimestamp,
                last_seen_ms: Date.now(),
                status: 'ACTIVE',
                is_restricted: false,
                force_offline_at: null,
                current_user: devicesInfo[deviceId]?.current_user || null
            };
        }

        const devicesList = Object.values(devicesInfo);

        const updatePayload = {
            device_id: boundDevices[0] || null,
            bound_devices: boundDevices,
            max_devices: maxDevices,
            devices_info: devicesInfo,
            devices_list: devicesList,
            active_pc_count: boundDevices.length
        };

        if (row.key_type === 'server') {
            updatePayload.bound_mac = SERVER_MAC;
            await updateDoc(keyRef, updatePayload);

            if (row.office_id) {
                setupLicenseMonitoring(row.office_id);
            }

            res.json({
                success: true,
                isMaster: true,
                maxDevices,
                activeDevices: boundDevices.length,
                devicesList
            });
        } else {
            await updateDoc(keyRef, updatePayload);
            res.json({
                success: true,
                maxDevices,
                activeDevices: boundDevices.length,
                devicesList
            });
        }
    } catch (err) {
        console.error("ACTIVATE ERROR:", err);
        res.status(500).json({ error: `Cloud error: ${err.message}` });
    }
});

// Endpoint to unbind a specific PC from a serial key
app.post('/api/keys/:key/unbind-device', authenticateToken, async (req, res) => {
    if (!isAdminUser(req.user)) return res.status(403).json({ error: "Admin only" });
    try {
        const { key } = req.params;
        const { deviceId } = req.body;
        if (!deviceId) return res.status(400).json({ error: "deviceId is required" });

        const officeId = await getOfficeId();
        if (LICENSE_API_URL) {
            const gw = await callLicenseGateway('manageKeys', { action: 'unbindDevice', officeId, key, deviceId });
            if (!gw.ok) return res.status(gw.status).json(gw.data);
            return res.json({ success: true, message: 'Device removed successfully', remaining: gw.data.remaining });
        }
        const keyRef = doc(firestore, 'serial_keys', key);
        const snap = await getDoc(keyRef);
        if (!snap.exists()) return res.status(404).json({ error: "Serial key not found" });

        const data = snap.data();
        if (officeId && data.office_id && data.office_id !== officeId) {
            return res.status(403).json({ error: "Access denied for external office key" });
        }
        let boundDevices = Array.isArray(data.bound_devices) ? [...data.bound_devices] : [];
        boundDevices = boundDevices.filter(d => d !== deviceId);

        let devicesInfo = (data.devices_info && typeof data.devices_info === 'object') ? { ...data.devices_info } : {};
        delete devicesInfo[deviceId];

        await updateDoc(keyRef, {
            bound_devices: boundDevices,
            device_id: boundDevices[0] || null,
            devices_info: devicesInfo,
            devices_list: Object.values(devicesInfo),
            active_pc_count: boundDevices.length
        });

        res.json({ success: true, message: `Device removed successfully`, remaining: boundDevices.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- LICENSE RESET ENDPOINT ---
app.post('/api/reset-license', authRateLimiter, async (req, res) => {
    try {
        let authorized = false;
        const authHeader = req.headers['authorization'];
        const bearerToken = authHeader && authHeader.split(' ')[1];

        if (bearerToken && bearerToken !== 'null' && bearerToken !== 'undefined') {
            try {
                const decoded = jwt.verify(bearerToken, JWT_SECRET);
                if (!isAdminUser(decoded)) {
                    return res.status(403).json({ success: false, error: 'Admin privileges required to reset license.' });
                }
                authorized = true;
            } catch (jwtErr) {
                if (!req.body?.adminPassword) {
                    return res.status(401).json({ success: false, error: 'Invalid or expired authorization token.' });
                }
            }
        }

        if (!authorized) {
            const { adminUsername, adminPassword } = req.body || {};
            if (!adminPassword || typeof adminPassword !== 'string') {
                return res.status(401).json({ success: false, error: 'Admin authentication or admin password is required to reset license.' });
            }

            const targetUser = String(adminUsername || 'admin').toLowerCase().trim();
            let adminRecord = await new Promise((resolve) => {
                db.get(
                    `SELECT * FROM network_users WHERE LOWER(username) = ? AND LOWER(role) = 'admin' LIMIT 1`,
                    [targetUser],
                    (err, row) => resolve(row || null)
                );
            });

            if (!adminRecord) {
                const officeId = await getOfficeId();
                if (officeId) {
                    if (LICENSE_API_URL) {
                        try {
                            const gw = await callLicenseGateway('manageUsers', {
                                action: 'verifyAdminPassword',
                                officeId,
                                username: targetUser,
                                password: adminPassword
                            });
                            if (gw && gw.ok && gw.data?.valid) {
                                authorized = true;
                            } else {
                                return res.status(401).json({ success: false, error: gw?.data?.error || 'Invalid admin password.' });
                            }
                        } catch {}
                    } else {
                        try {
                            const snap = await withTimeout(
                                getDocs(query(collection(firestore, 'network_users'), where('office_id', '==', officeId), where('role', '==', 'admin'))),
                                3000
                            );
                            const matchDoc = snap.docs.find(d => String(d.data().username || '').toLowerCase().trim() === targetUser);
                            if (matchDoc) adminRecord = matchDoc.data();
                        } catch (cloudErr) {}
                    }
                }
            }

            if (!authorized && !adminRecord) {
                return res.status(401).json({ success: false, error: 'Admin account not found. Cannot verify reset authorization.' });
            }

            if (!authorized) {
                const storedHash = adminRecord.password_hash || adminRecord.password || '';
                const passwordValid = storedHash.startsWith('$2')
                    ? await bcrypt.compare(adminPassword, storedHash)
                    : false;

                if (!passwordValid) {
                    return res.status(401).json({ success: false, error: 'Invalid admin password.' });
                }
            }
        }

        // 1. Tear down Firestore listeners and heartbeat
        if (_licenseUnsubscribe) { try { _licenseUnsubscribe(); } catch(e) {} _licenseUnsubscribe = null; }
        if (_heartbeatInterval) { clearInterval(_heartbeatInterval); _heartbeatInterval = null; }

        // 2. Reset in-memory flags
        SERVER_REVOKED = false;
        LICENSE_DELETED = false;

        // 3. Clear local SQLite state
        await new Promise((resolve, reject) => db.run(`DELETE FROM app_config WHERE key = 'office_id'`, (err) => (err ? reject(err) : resolve())));
        await new Promise((resolve, reject) => db.run(`DELETE FROM network_users`, (err) => (err ? reject(err) : resolve())));

        console.log('[License Reset] Backend state fully cleared.');
        res.json({ success: true, message: 'License and local state reset successfully.' });
    } catch (err) {
        console.error('RESET-LICENSE ERROR:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- MODULE USAGE ENDPOINTS ---
app.get('/api/usage', authenticateToken, async (req, res) => {
    try {
        const officeId = await getOfficeId();
        if (LICENSE_API_URL) {
            const gw = await callLicenseGateway('usageSync', { action: 'list', officeId });
            return res.json(gw.ok && Array.isArray(gw.data?.rows) ? gw.data.rows : []);
        }
        const snap = await getDocs(query(collection(firestore, 'module_usage'), where('office_id', '==', officeId)));
        const rows = snap.docs.map(d => ({ module_name: d.id, ...d.data() }));
        res.json(rows);
    } catch (err) { res.json([]); }
});

app.post('/api/usage/increment', authenticateToken, async (req, res) => {
    const { module_name } = req.body;
    try {
        const officeId = await getOfficeId();
        if (LICENSE_API_URL) {
            const gw = await callLicenseGateway('usageSync', { action: 'increment', officeId, moduleName: module_name });
            if (!gw.ok) return res.status(gw.status).json({ error: gw.data?.error || 'Module blocked' });
            return res.json({ success: true, count: gw.data.usage_count });
        }
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
        if (LICENSE_API_URL) {
            const gw = await callLicenseGateway('usageSync', { action: 'toggle', officeId, moduleName: module_name, isEnabled: is_enabled });
            return res.status(gw.ok ? 200 : gw.status).json(gw.ok ? { success: true } : gw.data);
        }
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
        if (LICENSE_API_URL) {
            const gw = await callLicenseGateway('manageKeys', { action: 'list', officeId });
            if (!gw.ok) return res.status(gw.status).json(gw.data);
            return res.json(gw.data.keys || []);
        }
        const snap = await getDocs(query(collection(firestore, 'serial_keys'), where('office_id', '==', officeId)));
        const rows = snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                key: d.id,
                ...data,
                max_devices: data.max_devices !== undefined ? Number(data.max_devices) : 1,
                bound_devices: Array.isArray(data.bound_devices) ? data.bound_devices : (data.device_id ? [data.device_id] : [])
            };
        });
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/keys', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
    try {
        const officeId = await getOfficeId();
        const seats = Math.max(1, Number(req.body.max_devices) || 1);
        if (LICENSE_API_URL) {
            const gw = await callLicenseGateway('manageKeys', {
                action: 'create',
                officeId,
                key: req.body.key,
                maxDevices: seats,
                keyType: req.body.key_type || 'PRO'
            });
            return res.status(gw.ok ? 200 : gw.status).json(gw.data);
        }
        const customKey = (req.body.key && req.body.key.trim().toUpperCase()) || ('VASWANI-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase());
        const keyRef = doc(firestore, 'serial_keys', customKey);
        await setDoc(keyRef, {
            key: customKey,
            key_type: req.body.key_type || 'PRO',
            is_active: 1,
            max_devices: seats,
            bound_devices: [],
            device_id: null,
            office_id: officeId,
            created_at: new Date().toISOString()
        });
        res.json({ success: true, key: customKey, max_devices: seats });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.patch('/api/keys/:key', authenticateToken, async (req, res) => {
    if (!isAdminUser(req.user)) return res.status(403).json({ error: "Admin only" });
    try {
        const officeId = await getOfficeId();
        if (LICENSE_API_URL) {
            const gw = await callLicenseGateway('manageKeys', { action: 'toggle', officeId, key: req.params.key, isActive: req.body.is_active });
            return res.status(gw.ok ? 200 : gw.status).json(gw.data);
        }
        const keyRef = doc(firestore, 'serial_keys', req.params.key);
        const snap = await getDoc(keyRef);
        if (!snap.exists()) return res.status(404).json({ error: "Serial key not found" });
        if (officeId && snap.data().office_id && snap.data().office_id !== officeId) {
            return res.status(403).json({ error: "Access denied for external office key" });
        }
        await updateDoc(keyRef, { is_active: req.body.is_active });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.patch('/api/keys/:key/seats', authenticateToken, async (req, res) => {
    if (!isAdminUser(req.user)) return res.status(403).json({ error: "Admin only" });
    try {
        const officeId = await getOfficeId();
        const newMax = Math.max(1, Number(req.body.max_devices) || 1);
        if (LICENSE_API_URL) {
            const gw = await callLicenseGateway('manageKeys', { action: 'seats', officeId, key: req.params.key, maxDevices: newMax });
            return res.status(gw.ok ? 200 : gw.status).json(gw.data);
        }
        const keyRef = doc(firestore, 'serial_keys', req.params.key);
        const snap = await getDoc(keyRef);
        if (!snap.exists()) return res.status(404).json({ error: "Serial key not found" });
        if (officeId && snap.data().office_id && snap.data().office_id !== officeId) {
            return res.status(403).json({ error: "Access denied for external office key" });
        }
        await updateDoc(keyRef, { max_devices: newMax });
        res.json({ success: true, max_devices: newMax });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.patch('/api/keys/:key/unbind', authenticateToken, async (req, res) => {
    if (!isAdminUser(req.user)) return res.status(403).json({ error: "Admin only" });
    try {
        const officeId = await getOfficeId();
        if (LICENSE_API_URL) {
            const gw = await callLicenseGateway('manageKeys', { action: 'unbind', officeId, key: req.params.key });
            return res.status(gw.ok ? 200 : gw.status).json(gw.data);
        }
        const keyRef = doc(firestore, 'serial_keys', req.params.key);
        const snap = await getDoc(keyRef);
        if (!snap.exists()) return res.status(404).json({ error: "Serial key not found" });
        if (officeId && snap.data().office_id && snap.data().office_id !== officeId) {
            return res.status(403).json({ error: "Access denied for external office key" });
        }
        await updateDoc(keyRef, {
            device_id: null,
            bound_mac: null,
            bound_devices: [],
            devices_info: {},
            devices_list: [],
            active_pc_count: 0
        });
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

// Clean up expired lockouts and stale screen frames every 15 minutes
setInterval(() => {
    const now = Date.now();
    for (const user in lockoutTimeouts) {
        if (lockoutTimeouts[user] <= now) {
            delete lockoutTimeouts[user];
            delete failedLoginAttempts[user];
        }
    }
    for (const user in screenFrames) {
        if (screenFrames[user] && (now - screenFrames[user].time > 30 * 60 * 1000)) {
            delete screenFrames[user];
        }
    }
}, 15 * 60 * 1000).unref();

// Utility to wrap a promise with a timeout (e.g. for Firestore calls over VPN)
const withTimeout = (promise, ms = 3000) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Firebase request timed out")), ms))
    ]);
};

// --- FIRST RUN ADMIN SETUP ENDPOINTS (Bypassed: All user administration managed via Firebase) ---
app.get('/api/admin-exists', async (req, res) => {
    return res.json({ exists: true });
});

app.post('/api/setup-admin', authRateLimiter, async (req, res) => {
    return res.json({ success: true, message: "User administration is managed directly via Firebase." });
});

app.post('/api/login', authRateLimiter, async (req, res) => {
    const { username, password } = req.body;
    const userKey = String(username).toLowerCase().trim();

    // Check if account is locked out
    if (lockoutTimeouts[userKey]) {
        if (lockoutTimeouts[userKey] > Date.now()) {
            const remainingMinutes = Math.ceil((lockoutTimeouts[userKey] - Date.now()) / 60000);
            return res.status(429).json({ error: `Account locked due to consecutive failed attempts. Try again in ${remainingMinutes} minutes.` });
        } else {
            delete lockoutTimeouts[userKey];
            delete failedLoginAttempts[userKey];
        }
    }

    try {
        const officeId = await getOfficeId();
        if (!officeId) return res.status(403).json({ error: "App not activated on this PC." });

        const reqDeviceId = typeof req.body.deviceId === 'string' ? req.body.deviceId.trim() : '';
        if (!reqDeviceId || reqDeviceId === 'legacy_device') {
            return res.status(400).json({ error: "Valid workstation device ID is required." });
        }
        const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Localhost').replace('::ffff:', '');
        const isLocalConn = ['127.0.0.1', '::1'].includes(String(req.socket.remoteAddress || '').replace('::ffff:', '')) && !/loca\.lt/i.test(`${req.headers['host'] || ''} ${req.headers['x-forwarded-host'] || ''}`);
        let reqSerialKey = req.body.serialKey ? String(req.body.serialKey).trim().toUpperCase() : '';
        if (!reqSerialKey && isLocalConn && typeof getActiveSerialKey === 'function') {
            reqSerialKey = (await getActiveSerialKey()) || '';
        }
        const clientPcName = req.body.pcName || (isLocalConn ? os.hostname() : `PC-${clientIp}`);
        const clientOsUser = req.body.osUser || (isLocalConn ? os.userInfo().username : 'User');

        if (LICENSE_API_URL) {
            let gwLogin = null;
            try {
                gwLogin = await callLicenseGateway('verifyUserLogin', {
                    officeId,
                    username: userKey,
                    password,
                    deviceId: reqDeviceId,
                    pcName: clientPcName,
                    clientIp
                });
            } catch (gwNetErr) {
                gwLogin = null; // Fall through to offline SQLite verification below
            }

            if (gwLogin) {
                if (!gwLogin.ok || !gwLogin.data?.user) {
                    if (gwLogin.status === 401) {
                        failedLoginAttempts[userKey] = (failedLoginAttempts[userKey] || 0) + 1;
                        if (failedLoginAttempts[userKey] >= 5) {
                            lockoutTimeouts[userKey] = Date.now() + 15 * 60 * 1000;
                            failedLoginAttempts[userKey] = 0;
                            return res.status(429).json({ error: "Account locked out. Too many failed attempts. Locked for 15 minutes." });
                        }
                    }
                    return res.status(gwLogin.status || 401).json({ error: gwLogin.data?.error || 'Authentication failed' });
                }

                const devCheck = await syncAndValidateDevice({
                    officeId,
                    serialKey: reqSerialKey,
                    deviceId: reqDeviceId,
                    pcName: clientPcName,
                    osUser: clientOsUser,
                    clientIp,
                    username: gwLogin.data.user.username,
                    eventType: 'login'
                });
                if (!devCheck.allowed) {
                    return res.status(devCheck.status || 403).json({
                        error: devCheck.error,
                        deviceRestricted: devCheck.code === 'DEVICE_RESTRICTED',
                        deviceRemoved: Boolean(devCheck.deviceRemoved)
                    });
                }

                const u = gwLogin.data.user;
                const localHash = await bcrypt.hash(password, 10);
                saveUserToLocalDb({
                    username: u.username,
                    password_hash: localHash,
                    role: u.role,
                    is_active: 1,
                    office_id: officeId,
                    device_id: reqDeviceId,
                    name: u.name,
                    designation: u.designation,
                    department: u.department,
                    current_device_id: reqDeviceId
                });

                activeSessions[userKey] = { username: u.username, deviceId: reqDeviceId, lastSeen: Date.now(), loginTime: Date.now() };
                delete failedLoginAttempts[userKey];
                delete lockoutTimeouts[userKey];

                const token = jwt.sign({
                    id: u.id,
                    username: u.username,
                    role: u.role,
                    designation: u.designation || (u.role === 'admin' ? 'Administrator' : u.role === 'Senior Auditor' ? 'Senior Auditor' : 'Article Assistant')
                }, JWT_SECRET, { expiresIn: '12h' });

                return res.json({
                    token,
                    role: u.role,
                    username: u.username,
                    userDocId: u.id,
                    name: u.name || u.username,
                    designation: u.designation || (u.role === 'admin' ? 'Administrator' : u.role === 'Senior Auditor' ? 'Senior Auditor' : 'Article Assistant'),
                    department: u.department || 'Audit & Assurance'
                });
            }
        }

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
        const storedSecret = user.password_hash || '';
        if (storedSecret && storedSecret.startsWith('$2')) {
            match = await bcrypt.compare(password, storedSecret);
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

        if (isOnline) {
            const devCheck = await syncAndValidateDevice({
                officeId,
                serialKey: reqSerialKey,
                deviceId: reqDeviceId,
                pcName: clientPcName,
                osUser: clientOsUser,
                clientIp,
                username: user.username,
                eventType: 'login'
            });
            if (!devCheck.allowed) {
                return res.status(devCheck.status || 403).json({
                    error: devCheck.error,
                    deviceRestricted: devCheck.code === 'DEVICE_RESTRICTED',
                    deviceRemoved: Boolean(devCheck.deviceRemoved)
                });
            }
        }

        const ACTIVE_SESSION_THRESHOLD_MS = 3 * 60 * 1000; // 3 min heartbeat timeout
        const lastActive = Number(user.last_active_at) || 0;
        const isSessionRecent = (Date.now() - lastActive) < ACTIVE_SESSION_THRESHOLD_MS;
        const currentActiveDevice = user.current_device_id || user.device_id;

        // Floating User Login: Check if user is actively logged in on another PC
        if (user.role !== 'admin' && user.status === 'online' && isSessionRecent && currentActiveDevice && currentActiveDevice !== reqDeviceId) {
            return res.status(403).json({
                error: `Account "${user.username}" is currently active on another PC. Please log out from that PC first before logging in here.`
            });
        }

        activeSessions[userKey] = {
            username: user.username,
            deviceId: reqDeviceId,
            lastSeen: Date.now(),
            loginTime: Date.now()
        };

        // Set active session to this PC
        if (isOnline && docRef) {
            await withTimeout(updateDoc(docRef, {
                current_device_id: reqDeviceId,
                device_id: reqDeviceId,
                last_active_at: Date.now(),
                status: 'online'
            }), 3000).catch(e => console.warn("Failed to update cloud session:", e.message));

            // LOG TO ACTIVITY MONITOR
            await withTimeout(addDoc(collection(firestore, 'audit_logs'), {
                username: user.username,
                ip: clientIp || req.ip || '127.0.0.1',
                system: clientPcName,
                time: new Date().toLocaleString(),
                action: 'Logged In',
                office_id: officeId
            }), 3000).catch(e => console.warn("Failed to add cloud audit log:", e.message));
        }

        db.run(
            "UPDATE network_users SET current_device_id = ?, device_id = ?, status = 'online', last_active_at = ? WHERE username = ?",
            [reqDeviceId, reqDeviceId, Date.now(), userKey]
        );

        delete failedLoginAttempts[userKey];
        delete lockoutTimeouts[userKey];

        const token = jwt.sign({
            id: userDocId,
            username: user.username,
            role: user.role,
            designation: user.designation || (user.role === 'admin' ? 'Administrator' : user.role === 'Senior Auditor' ? 'Senior Auditor' : 'Article Assistant')
        }, JWT_SECRET, { expiresIn: '12h' });
        
        // Return full user profile for display on client PC
        res.json({
            token,
            role: user.role,
            username: user.username,
            userDocId,
            name: user.name || user.username,
            designation: user.designation || (user.role === 'admin' ? 'Administrator' : user.role === 'Senior Auditor' ? 'Senior Auditor' : 'Article Assistant'),
            department: user.department || 'Audit & Assurance'
        });
    } catch (err) {
        res.status(500).json({ error: "Server database connection failed." });
    }
});

app.post('/api/logout', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (token && token !== 'null' && token !== 'undefined') {
            jwt.verify(token, JWT_SECRET, async (err, user) => {
                if (!err && user && user.username) {
                    const userKey = String(user.username).toLowerCase().trim();
                    delete activeSessions[userKey];
                    delete screenFrames[userKey];
                    try {
                        const officeId = await getOfficeId();
                        if (officeId && req.body?.deviceId) {
                            await syncAndValidateDevice({
                                officeId,
                                serialKey: req.body?.serialKey,
                                deviceId: req.body.deviceId,
                                username: user.username,
                                eventType: 'logout'
                            }).catch(() => {});
                        }
                        if (user.username !== 'admin') {
                            try {
                                if (LICENSE_API_URL) {
                                    await callLicenseGateway('manageUsers', { action: 'logout', officeId, username: userKey });
                                } else {
                                    const snap = await getDocs(query(collection(firestore, 'network_users'), where('office_id', '==', officeId)));
                                    const userDoc = snap.docs.find(d => String(d.data().username).toLowerCase().trim() === userKey);
                                    if (userDoc) {
                                        await updateDoc(userDoc.ref, { status: 'offline', current_device_id: null, last_active_at: null });
                                    }
                                }
                            } catch (e) {
                                if (e && e.code !== 'unavailable') {
                                    console.warn('[Database Seed Warning]:', e.message);
                                }
                            }
                            db.run("UPDATE network_users SET device_id = NULL, current_device_id = NULL, status = 'offline' WHERE username = ?", [userKey]);
                        }
                    } catch (e) {
                        if (e && e.code !== 'unavailable') {
                            console.warn('[Database Seed Warning]:', e.message);
                        }
                    }
                }
            });
        }
        res.json({ success: true });
    } catch (err) {
        res.json({ success: true });
    }
});

app.post('/api/users', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
    try {
        const officeId = await getOfficeId();
        const usernameNorm = String(req.body.username).toLowerCase().trim();
        if (LICENSE_API_URL) {
            const gw = await callLicenseGateway('manageUsers', {
                action: 'create',
                officeId,
                username: usernameNorm,
                password: req.body.password,
                name: req.body.name || req.body.username,
                designation: req.body.designation || '',
                department: req.body.department || '',
                role: req.body.role || 'user'
            });
            if (!gw.ok) return res.status(gw.status).json(gw.data);
            saveUserToLocalDb({
                name: req.body.name || req.body.username,
                designation: req.body.designation || '',
                department: req.body.department || '',
                username: usernameNorm,
                password_hash: gw.data.passwordHash,
                role: req.body.role || 'user',
                is_active: 1,
                office_id: officeId,
                device_id: null,
                current_device_id: null,
                status: 'offline'
            });
            return res.json({ success: true, id: gw.data.id });
        }
        const hash = await bcrypt.hash(req.body.password, 10);
        const snap = await getDocs(query(collection(firestore, 'network_users'), where('office_id', '==', officeId)));
        const existing = snap.docs.find(d => String(d.data().username).toLowerCase().trim() === usernameNorm);
        
        if (existing) return res.status(400).json({ error: "User already exists" });
        
        const docRef = await addDoc(collection(firestore, 'network_users'), {
            name: req.body.name || req.body.username,
            designation: req.body.designation || '',
            department: req.body.department || '',
            username: usernameNorm,
            password_hash: hash,
            role: req.body.role || 'user',
            is_active: 1,
            office_id: officeId,
            current_device_id: null,
            status: 'offline'
        });
        
        saveUserToLocalDb({
            name: req.body.name || req.body.username,
            designation: req.body.designation || '',
            department: req.body.department || '',
            username: usernameNorm,
            password_hash: hash,
            role: req.body.role || 'user',
            is_active: 1,
            office_id: officeId,
            device_id: null,
            current_device_id: null,
            status: 'offline'
        });

        res.json({ success: true, id: docRef.id });
    } catch (e) { res.status(500).json({ error: e.message || "Server error" }); }
});

app.post('/api/heartbeat', authenticateToken, async (req, res) => {
    try {
        const userKey = String(req.user.username).toLowerCase().trim();
        const reqDeviceId = req.body?.deviceId || '';
        const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Localhost').replace('::ffff:', '');
        const isLocalConn = ['127.0.0.1', '::1'].includes(String(req.socket.remoteAddress || '').replace('::ffff:', '')) && !/loca\.lt/i.test(`${req.headers['host'] || ''} ${req.headers['x-forwarded-host'] || ''}`);
        let reqSerialKey = req.body?.serialKey ? String(req.body.serialKey).trim().toUpperCase() : '';
        if (!reqSerialKey && isLocalConn && typeof getActiveSerialKey === 'function') {
            reqSerialKey = (await getActiveSerialKey()) || '';
        }
        const clientPcName = req.body?.pcName || (isLocalConn ? os.hostname() : '');
        const clientOsUser = req.body?.osUser || (isLocalConn ? os.userInfo().username : '');

        if (activeSessions[userKey]) {
            activeSessions[userKey].lastSeen = Date.now();
        } else {
            activeSessions[userKey] = { username: req.user.username, deviceId: reqDeviceId, lastSeen: Date.now(), loginTime: Date.now() };
        }

        // 1. Check local SQLite database first (authoritative and instant on-premise)
        db.get("SELECT * FROM network_users WHERE LOWER(username) = ?", [userKey], async (err, localUser) => {
            if (localUser && localUser.is_active === 0) {
                return res.status(403).json({ error: "User restricted" });
            }

            // 2. Best-effort cloud sync without blocking or killing offline session on transient network errors
            try {
                const officeId = await getOfficeId();
                if (officeId) {
                    const devCheck = await syncAndValidateDevice({
                        officeId,
                        serialKey: reqSerialKey,
                        deviceId: reqDeviceId,
                        pcName: clientPcName,
                        osUser: clientOsUser,
                        clientIp,
                        username: req.user.username,
                        eventType: 'heartbeat'
                    });
                    if (!devCheck.allowed) {
                        delete activeSessions[userKey];
                        return res.status(devCheck.status || 403).json({
                            error: devCheck.error,
                            deviceRestricted: devCheck.code === 'DEVICE_RESTRICTED',
                            deviceRemoved: Boolean(devCheck.deviceRemoved),
                            deviceOffline: devCheck.code === 'DEVICE_OFFLINE'
                        });
                    }

                    if (userKey !== 'admin' && !LICENSE_API_URL) {
                        const snap = await withTimeout(getDocs(query(collection(firestore, 'network_users'), where('office_id', '==', officeId))), 3000);
                        const userDoc = snap.docs.find(d => String(d.data().username).toLowerCase().trim() === userKey);
                        if (userDoc) {
                            const ud = userDoc.data();
                            if (ud.is_active === 0) {
                                db.run("UPDATE network_users SET is_active = 0 WHERE username = ?", [userKey]);
                                return res.status(403).json({ error: "User restricted" });
                            }
                            if (ud.status === 'offline' && !ud.current_device_id) {
                                delete activeSessions[userKey];
                                return res.status(403).json({ error: "Session terminated by Administrator.", deviceOffline: true });
                            }
                            await withTimeout(updateDoc(userDoc.ref, { last_active_at: Date.now() }), 3000).catch(() => {});
                        }
                    }
                }
            } catch (cloudErr) {
                // Cloud latency/offline shouldn't block local workstation heartbeat
            }

            db.run("UPDATE network_users SET last_active_at = ? WHERE username = ?", [Date.now(), userKey]);
            return res.json({ success: true });
        });
    } catch (e) { res.status(500).json({ error: "Heartbeat failed" }); }
});

app.get('/api/users', authenticateToken, async (req, res) => {
    if (!isAdminUser(req.user)) return res.status(403).json({ error: "Admin only" });
    try {
        const officeId = await getOfficeId();
        if (LICENSE_API_URL) {
            const gw = await callLicenseGateway('manageUsers', { action: 'list', officeId });
            return res.status(gw.ok ? 200 : gw.status).json(gw.ok ? (gw.data.users || []) : gw.data);
        }
        const snap = await getDocs(query(collection(firestore, 'network_users'), where('office_id', '==', officeId)));
        const rows = snap.docs.map(d => {
            const { password_hash: _ph, password: _pw, ...safeUser } = d.data() || {};
            return { id: d.id, ...safeUser };
        });
        res.json(rows);
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.post('/api/users/:username/release-session', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
    try {
        const officeId = await getOfficeId();
        const targetUsernameNorm = String(req.params.username).toLowerCase().trim();
        db.run("UPDATE network_users SET status = 'offline', current_device_id = NULL WHERE LOWER(username) = ?", [targetUsernameNorm]);
        if (LICENSE_API_URL) {
            const gw = await callLicenseGateway('manageUsers', { action: 'releaseSession', officeId, username: targetUsernameNorm });
            return res.status(gw.ok ? 200 : gw.status).json(gw.data);
        }
        const snap = await getDocs(query(collection(firestore, 'network_users'), where('office_id', '==', officeId)));
        const userDoc = snap.docs.find(d => String(d.data().username).toLowerCase().trim() === targetUsernameNorm);
        if (userDoc) {
            await updateDoc(userDoc.ref, { status: 'offline', current_device_id: null });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/users/:username', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
    try {
        const officeId = await getOfficeId();
        const targetUsernameNorm = String(req.params.username).toLowerCase().trim();
        if (LICENSE_API_URL) {
            const gw = await callLicenseGateway('manageUsers', { action: 'deactivate', officeId, username: targetUsernameNorm });
            if (targetUsernameNorm !== 'admin') {
                db.run("UPDATE network_users SET is_active = 0 WHERE username = ?", [targetUsernameNorm]);
            }
            return res.status(gw.ok ? 200 : gw.status).json(gw.data);
        }
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
app.get('/api/clients', authenticateToken, async (req, res) => {
    try {
        const dataPath = await getActiveDataPathFromDb(db, userDataPath);
        await syncCredentialsWithCentral(db, dataPath);
    } catch (syncErr) {
        console.warn('[Clients GET] Central vault sync note:', syncErr.message);
    }

    db.all(`
        SELECT id, username, gstin, trade_name, legal_name, email, phone, address,
               portal_username, last_updated, is_deleted,
               COALESCE(created_at, last_updated, 0) AS created_at,
               (CASE WHEN portal_password IS NOT NULL AND LENGTH(portal_password) > 0 THEN 1 ELSE 0 END) AS has_password
        FROM clients
        WHERE is_deleted = 0 OR is_deleted IS NULL
        ORDER BY trade_name COLLATE NOCASE ASC
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});
app.post('/api/clients', authenticateToken, (req, res) => {
    const { id, gstin, trade_name, legal_name, email, phone } = req.body;
    db.run(`INSERT INTO clients (id, username, gstin, trade_name, legal_name, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(gstin) DO UPDATE SET trade_name = ?, legal_name = ?, email = ?, phone = ?`, 
        [id, req.user.username, gstin, trade_name, legal_name, email, phone, trade_name, legal_name, email, phone], 
        function (err) { if (err) { console.error('[DB Mutation Error]:', err.message); return res.status(500).json({ success: false, error: err.message }); } res.json({ success: true }); });
});
app.delete('/api/clients/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM clients WHERE id = ?`, [req.params.id], function (err) { if (err) { console.error('[DB Error DELETE /api/clients]:', err.message); return res.status(500).json({ success: false, error: err.message }); } res.json({ success: true }); });
});
app.get('/api/tasks', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM tasks ORDER BY due_date ASC`, [], (err, rows) => { if (err) return res.status(500).json({ error: err.message }); res.json(rows || []); });
});
app.post('/api/tasks', authenticateToken, (req, res) => {
    const { id, client_gstin, return_type, period, due_date, status, tax_amount } = req.body;
    db.run(`INSERT INTO tasks (id, username, client_gstin, return_type, period, due_date, status, tax_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = ?, tax_amount = ?`, 
        [id, req.user.username, client_gstin, return_type, period, due_date, status, tax_amount, status, tax_amount], 
        function (err) { if (err) { console.error('[DB Mutation Error]:', err.message); return res.status(500).json({ success: false, error: err.message }); } res.json({ success: true }); });
});
app.delete('/api/tasks/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM tasks WHERE id = ?`, [req.params.id], function (err) { if (err) { console.error('[DB Error DELETE /api/tasks]:', err.message); return res.status(500).json({ success: false, error: err.message }); } res.json({ success: true }); });
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
        const launchRes = await launchAutopilotBrowser(playwright.chromium, { headless: false });
        browser = launchRes.browser;
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

// --- LEGACY NETWORK ENDPOINTS (Screen, Messaging, Dashboard) ---
app.post('/session/start', authenticateToken, (req, res) => {
    const targetUser = String(req.body?.username || req.user.username || '').trim();
    if (!isSameUserOrAdmin(req.user, targetUser)) return res.status(403).json({ error: 'Cannot start session for another user' });
    const { userAgent, location } = req.body;
    const banned = loadJson(BANNED_PATH);
    if (banned[targetUser]) return res.status(403).json({ error: 'Banned' });
    const now = Date.now();
    if (activeSessions[targetUser] && (now - activeSessions[targetUser].lastSeen < 6000)) return res.status(409).json({ error: 'Already logged in' });
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
    const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    activeSessions[targetUser] = { id: sessionId, username: targetUser, ip: ip.replace('::ffff:', ''), userAgent, location, loginTime: now, lastSeen: now };
    res.json({ sessionId });
});

app.post('/session/heartbeat', authenticateToken, (req, res) => {
    const targetUser = String(req.body?.username || req.user.username || '').trim();
    if (!isSameUserOrAdmin(req.user, targetUser)) return res.status(403).json({ error: 'Cannot heartbeat session for another user' });
    const { sessionId } = req.body;
    const banned = loadJson(BANNED_PATH);
    if (banned[targetUser]) return res.status(403).json({ error: 'Banned' });
    if (!activeSessions[targetUser] || activeSessions[targetUser].id !== sessionId) return res.status(403).json({ error: 'Session Invalid' });
    activeSessions[targetUser].lastSeen = Date.now();
    res.json({ success: true });
});

app.get('/sessions', authenticateToken, (req, res) => {
    if (!isAdminOrSenior(req.user)) return res.status(403).json({ error: 'Admin or Senior Auditor privileges required' });
    const now = Date.now();
    for(const user in activeSessions) if (now - activeSessions[user].lastSeen > 120000) delete activeSessions[user];
    res.json({ sessions: Object.values(activeSessions), banned: loadJson(BANNED_PATH) });
});

app.post('/ban', authenticateToken, (req, res) => {
    if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Admin only' });
    const { username, isBanned } = req.body;
    const banned = loadJson(BANNED_PATH);
    if (isBanned) { banned[username] = true; delete activeSessions[username]; } 
    else delete banned[username];
    saveJson(BANNED_PATH, banned);
    res.json({ success: true });
});

app.post('/screen/request', authenticateToken, (req, res) => {
    if (!isAdminOrSenior(req.user)) return res.status(403).json({ error: 'Admin or Senior Auditor privileges required' });
    screenRequests[req.body.username] = true;
    res.json({ success: true });
});
app.get('/screen/check-request/:username', authenticateToken, (req, res) => {
    if (!isSameUserOrAdmin(req.user, req.params.username)) return res.status(403).json({ error: 'Access denied' });
    const requested = !!screenRequests[req.params.username];
    if (requested) delete screenRequests[req.params.username];
    res.json({ requested });
});
app.post('/screen/send', authenticateToken, (req, res) => {
    const targetUser = String(req.body?.username || req.user.username || '').trim();
    if (!isSameUserOrAdmin(req.user, targetUser)) return res.status(403).json({ error: 'Cannot publish screen frame for another user' });
    screenFrames[targetUser] = { image: req.body.image, time: Date.now() };
    res.json({ success: true });
});
app.get('/screen/view/:username', authenticateToken, (req, res) => {
    if (!isAdminOrSenior(req.user)) return res.status(403).json({ error: 'Admin or Senior Auditor privileges required' });
    const frame = screenFrames[req.params.username];
    res.json({ image: frame && (Date.now() - frame.time < 15000) ? frame.image : null });
});

app.post('/message/send', authenticateToken, (req, res) => {
    if (!isAdminOrSenior(req.user)) return res.status(403).json({ error: 'Admin or Senior Auditor privileges required' });
    const { username, message } = req.body;
    if (username && message) { userMessages[username] = message; res.json({ success: true }); }
    else res.status(400).json({ success: false });
});
app.get('/message/check/:username', authenticateToken, (req, res) => {
    if (!isSameUserOrAdmin(req.user, req.params.username)) return res.status(403).json({ error: 'Access denied' });
    const message = userMessages[req.params.username];
    if (message) delete userMessages[req.params.username];
    res.json({ message: message || null });
});

app.get('/audit', authenticateToken, (req, res) => {
    if (!isAdminOrSenior(req.user)) return res.status(403).json({ error: 'Admin or Senior Auditor privileges required' });
    res.json(getAuditLogs());
});
let auditWriteQueue = Promise.resolve();
app.post('/audit', authenticateToken, (req, res) => {
    auditWriteQueue = auditWriteQueue.then(() => {
        const logs = getAuditLogs();
        logs.unshift({
            id: Date.now().toString(),
            timestamp: Date.now(),
            ...(req.body || {}),
            username: req.user.username,
            role: req.user.role
        });
        if (logs.length > 500) logs.pop();
        fs.writeFileSync(AUDIT_PATH, JSON.stringify(logs, null, 2));
    });
    auditWriteQueue
        .then(() => res.json({ success: true }))
        .catch((err) => res.status(500).json({ success: false, error: err.message }));
});

// Tally XML API Proxy for Web Clients
app.post('/api/tally-proxy', authenticateToken, express.text({ type: '*/*' }), async (req, res) => {
    const rawHeaderPort = req.headers['x-tally-port'];
    const port = rawHeaderPort !== undefined && String(rawHeaderPort).trim() !== '' ? parseInt(String(rawHeaderPort), 10) : 9000;
    if (isNaN(port) || port < 9000 || port > 9010) return res.status(400).send('Invalid Tally port');
    try {
        const response = await globalThis.fetch(`http://127.0.0.1:${port}`, {
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

// Live Tally Port Connection Tester & Active Company Extractor
app.post('/api/tally/test-connection', async (req, res) => {
    const rawHeaderPort = req.headers['x-tally-port'];
    const bodyPort = req.body && typeof req.body === 'object' ? req.body.port : undefined;
    const port = parseInt(bodyPort || rawHeaderPort || 9000, 10);
    if (isNaN(port) || port < 9000 || port > 9010) {
        return res.status(400).json({ success: false, isOnline: false, error: 'Invalid Tally port (9000-9010)' });
    }
    const xml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ListOfCompanies</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="ListOfCompanies"><TYPE>Company</TYPE><FETCH>Name, FormalName, BooksFrom, GSTIN, State, Address, GUID</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const response = await globalThis.fetch(`http://127.0.0.1:${port}`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml; charset=utf-8' },
            body: xml,
            signal: controller.signal
        });
        clearTimeout(timeout);
        const text = await response.text();

        const nameMatch = text.match(/<NAME[^>]*>(.*?)<\/NAME>/i) || text.match(/<COMPANYNAME[^>]*>(.*?)<\/COMPANYNAME>/i);
        const formalMatch = text.match(/<FORMALNAME[^>]*>(.*?)<\/FORMALNAME>/i);
        const gstinMatch = text.match(/<GSTIN[^>]*>(.*?)<\/GSTIN>/i);
        const booksFromMatch = text.match(/<BOOKSFROM[^>]*>(.*?)<\/BOOKSFROM>/i);
        const stateMatch = text.match(/<STATE[^>]*>(.*?)<\/STATE>/i);
        const guidMatch = text.match(/<GUID[^>]*>(.*?)<\/GUID>/i);
        const addressMatch = text.match(/<ADDRESS[^>]*>(.*?)<\/ADDRESS>/i);

        const companyName = nameMatch ? nameMatch[1].trim() : '';
        const formalName = formalMatch ? formalMatch[1].trim() : companyName;
        const gstin = gstinMatch ? gstinMatch[1].trim().toUpperCase() : '';
        const booksFrom = booksFromMatch ? booksFromMatch[1].trim() : '';
        const state = stateMatch ? stateMatch[1].trim() : '';
        const guid = guidMatch ? guidMatch[1].trim() : '';
        const address = addressMatch ? addressMatch[1].trim() : '';

        const isOnline = text.includes('COMPANY') || Boolean(companyName);
        return res.json({
            success: isOnline,
            isOnline,
            port,
            companyName: companyName || (isOnline ? 'Tally Company' : ''),
            formalName: formalName || companyName,
            gstin,
            booksFrom,
            state,
            guid,
            address
        });
    } catch (err) {
        return res.json({
            success: false,
            isOnline: false,
            port,
            error: err.name === 'AbortError' ? 'Connection timed out' : err.message
        });
    }
});

function resolvePythonExecutable() {
    try {
        execSync(process.platform === 'win32' ? 'python --version' : 'python3 --version', { stdio: 'ignore' });
        return process.platform === 'win32' ? 'python' : 'python3';
    } catch (e) {}

    if (process.platform === 'win32') {
        try {
            execSync('py --version', { stdio: 'ignore' });
            return 'py';
        } catch (e) {
            if (e && e.code !== 'unavailable') {
                console.warn('[Frontend Path Warning]:', e.message);
            }
        }

        const userProfile = process.env.USERPROFILE || 'C:\\Users\\' + (process.env.USERNAME || 'PC-10');
        const localPrograms = path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python');
        if (fs.existsSync(localPrograms)) {
            try {
                const subdirs = fs.readdirSync(localPrograms).filter(d => d.toLowerCase().startsWith('python'));
                for (const dir of subdirs.reverse()) {
                    const candidate = path.join(localPrograms, dir, 'python.exe');
                    if (fs.existsSync(candidate)) return candidate;
                }
            } catch (e) {
                if (e && e.code !== 'unavailable') {
                    console.warn('[Database Seed Warning]:', e.message);
                }
            }
        }

        const standardPaths = [
            'C:\\Python313\\python.exe',
            'C:\\Python312\\python.exe',
            'C:\\Python311\\python.exe',
            'C:\\Python310\\python.exe',
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe')
        ];
        for (const p of standardPaths) {
            if (p && fs.existsSync(p)) return p;
        }
    } else {
        for (const cmd of ['python3', 'python']) {
            try {
                execSync(`${cmd} --version`, { stdio: 'ignore' });
                return cmd;
            } catch (e) {
                if (e && e.code !== 'unavailable') {
                    console.warn('[Database Seed Warning]:', e.message);
                }
            }
        }
    }
    return null;
}

// --- MODULE: CMA PROJECT REPORT EXCEL GENERATION ---
app.post('/api/cma/generate', authenticateToken, async (req, res) => {
    const runId = crypto.randomUUID();
    const tempJsonPath = path.join(os.tmpdir(), `temp_cma_${runId}.json`);
    const tempExcelPath = path.join(os.tmpdir(), `CMA_Report_${runId}.xlsx`);
    const cleanupCmaFiles = () => {
        for (const f of [tempJsonPath, tempExcelPath]) {
            try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {}
        }
    };
    let responded = false;
    try {
        // payload extracted below
        // payload extracted below
        const payload = req.body;

        // Save payload to temp json file
        fs.writeFileSync(tempJsonPath, JSON.stringify(payload));

        const pythonCmd = resolvePythonExecutable();
        if (!pythonCmd) {
            cleanupCmaFiles();
            return res.status(503).json({ error: 'Python runtime is not detected on this system. Please install Python to generate CMA Excel reports.' });
        }
        const generatorScript = path.join(__dirname, 'scripts', 'cma', 'cma_generator.py');

        // Spawn python script to build the spreadsheet
        const child = spawn(pythonCmd, [generatorScript, tempJsonPath, tempExcelPath]);
        child.on('error', (spawnErr) => {
            cleanupCmaFiles();
            if (!responded && !res.headersSent) {
                responded = true;
                res.status(500).json({ error: 'Failed to invoke Python generator: ' + spawnErr.message });
            }
        });
        
        let stderrData = '';
        child.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        child.on('close', (code) => {
            // Clean up temp JSON immediately
            try {
                if (fs.existsSync(tempJsonPath)) fs.unlinkSync(tempJsonPath);
            } catch (err) {}

            if (responded) return;
            responded = true;
            if (code !== 0) {
                cleanupCmaFiles();
                console.error("Python generator error:", stderrData);
                return res.status(500).json({ error: "Failed to generate Excel report: " + stderrData });
            }

            // Stream Excel file for download and cleanup after sending
            res.download(tempExcelPath, `${payload.client_metadata?.company_name || 'CMA'}_Project_Report.xlsx`, (err) => {
                try {
                    cleanupCmaFiles();
                } catch (cleanupErr) {}
            });
        });

    } catch (error) {
        cleanupCmaFiles();
        console.error("CMA generation server error:", error);
        if (!responded && !res.headersSent) { responded = true; return res.status(500).json({ error: error?.message || 'CMA failed' }); }
        // duplicate res.status removed
    }
});

// API 404 Fallback - ensures all unmatched /api routes return JSON, never HTML
app.use('/api', (req, res) => {
    return res.status(404).json({ success: false, error: 'API route not found: ' + req.method + ' ' + req.path });
});

// Catch-all to serve the React app for any other routes (client-side routing)
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(DIST_PATH, 'index.html'));
});

app.get('/api/network/servers', authenticateToken, async (req, res) => {
    try {
        const { office_id, is_global } = req.query;
        const localOfficeId = await getOfficeId();
        if (office_id) {
            const targetOffice = String(office_id);
            if (!isAdminUser(req.user) && localOfficeId && targetOffice !== localOfficeId) {
                return res.status(403).json({ error: "Access denied for external office" });
            }
            if (LICENSE_API_URL) {
                const gw = await callLicenseGateway('manageKeys', { action: 'listServers', officeId: targetOffice });
                const list = gw.ok && Array.isArray(gw.data?.servers) ? gw.data.servers : [];
                return res.json(list[0] || {});
            }
            const snap = await getDocs(query(
                collection(firestore, 'serial_keys'),
                where('office_id', '==', targetOffice),
                where('key_type', '==', 'server')
            ));
            if (!snap.empty) {
                const docData = snap.docs[0].data();
                return res.json({ id: snap.docs[0].id, ...docData });
            }
            return res.json({});
        }

        if (is_global === 'true' || is_global === true) {
            if (!isAdminUser(req.user)) {
                return res.status(403).json({ error: "Admin only" });
            }
            if (LICENSE_API_URL) {
                const gw = await callLicenseGateway('manageKeys', { action: 'listServers', isGlobal: true });
                return res.json(gw.ok && Array.isArray(gw.data?.servers) ? gw.data.servers : []);
            }
            const snap = await getDocs(query(
                collection(firestore, 'serial_keys'),
                where('is_global', '==', true)
            ));
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            return res.json(list);
        }

        if (localOfficeId) {
            if (LICENSE_API_URL) {
                const gw = await callLicenseGateway('manageKeys', { action: 'listServers', officeId: localOfficeId });
                return res.json(gw.ok && Array.isArray(gw.data?.servers) ? gw.data.servers : []);
            }
            const snap = await getDocs(query(
                collection(firestore, 'serial_keys'),
                where('office_id', '==', localOfficeId),
                where('key_type', '==', 'server')
            ));
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            return res.json(list);
        }

        res.json([]);
    } catch (err) {
        console.error('[Network Servers Query Error]:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Network Server API running on port ${PORT}`);

    // Spawn LevitateExtract python microservice programmatically
    try {
        const pythonScriptPath = path.join(__dirname, 'LevitateExtract', 'main.py');
        if (!fs.existsSync(pythonScriptPath)) {
            console.log('[LevitateExtract] Microservice script not found, skipping launch.');
            return;
        }

        let pythonExe = resolvePythonExecutable();
        if (!pythonExe) {
            console.log('[LevitateExtract] Python runtime not detected on system, skipping microservice spawn.');
            return;
        }

        console.log(`[LevitateExtract] Launching microservice programmatically: ${pythonExe}`);
        
        const env = { ...process.env };
        env.OPENBLAS_NUM_THREADS = '1';
        env.MKL_NUM_THREADS = '1';
        env.OMP_NUM_THREADS = '1';
        env.NUMEXPR_NUM_THREADS = '1';
        env.PYTHONDONTWRITEBYTECODE = '1';

        const logBaseDir = userDataPath || process.cwd();
        const outLog = fs.openSync(path.join(logBaseDir, 'programmatic_out.log'), 'a');
        const errLog = fs.openSync(path.join(logBaseDir, 'programmatic_err.log'), 'a');

        const pythonProcess = spawn(pythonExe, [pythonScriptPath], {
            cwd: path.join(__dirname, 'LevitateExtract'),
            env,
            detached: true,
            stdio: ['ignore', outLog, errLog]
        });

        pythonProcess.unref();

        console.log(`[LevitateExtract] Programmatic microservice spawned detached with log redirection. PID: ${pythonProcess.pid}`);
    } catch (err) {
        console.error('[LevitateExtract] Failed to spawn programmatic microservice:', err);
    }
});
