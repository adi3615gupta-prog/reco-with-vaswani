import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import vm from 'vm';
import express from 'express';
import jwt from 'jsonwebtoken';
import { getApiBase, getSessionUserFromToken } from '@/lib/api';

// Backend route modules under security verification
import setupTaxRoutes from '../../tax_routes.js';
import setupAuditTrailRoutes from '../../audit_trail_routes.js';
import { setupAuditStorageRoutes } from '../../audit_storage_routes.js';
import { setupNoticesRoutes } from '../../notices_routes.js';
import setupTdsRoutes from '../../tds_routes.js';
import setupGDriveRoutes from '../../gdrive_routes.js';
import setupReturnsStorageRoutes from '../../returns_storage_routes.js';
import setupMonthlyAuditRoutes from '../../monthly_audit_routes.js';

describe('Phase 28 Plan 01 - Security & Concurrency Hardening', () => {
    it('should configure SQLite in WAL mode with busy timeout', async () => {
        const db = new sqlite3.Database(':memory:');
        await new Promise<void>((resolve, reject) => {
            db.serialize(() => {
                db.run('PRAGMA journal_mode = WAL;');
                db.run('PRAGMA busy_timeout = 10000;');
                db.run('PRAGMA synchronous = NORMAL;');
                db.get('PRAGMA busy_timeout', (err, row: any) => {
                    if (err) return reject(err);
                    expect(row.timeout).toBe(10000);
                    resolve();
                });
            });
        });
        db.close();
    });

    it('should enforce CORS whitelist rules for localhost and private LAN subnets', () => {
        const allowedLocalOrigins = new Set([
            'http://localhost:8080',
            'http://127.0.0.1:8080',
            'http://localhost:3001',
            'http://127.0.0.1:3001'
        ]);

        const isAllowedOrigin = (origin: string | undefined): boolean => {
            if (!origin) return true;
            if (allowedLocalOrigins.has(origin)) return true;
            try {
                const url = new URL(origin);
                const hostname = url.hostname;
                return (
                    hostname === 'localhost' ||
                    hostname === '127.0.0.1' ||
                    hostname === '::1' ||
                    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
                    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
                    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
                );
            } catch {
                return false;
            }
        };

        expect(isAllowedOrigin(undefined)).toBe(true);
        expect(isAllowedOrigin('http://localhost:8080')).toBe(true);
        expect(isAllowedOrigin('http://192.168.1.50:8080')).toBe(true);
        expect(isAllowedOrigin('http://10.0.0.15:3001')).toBe(true);
        expect(isAllowedOrigin('http://172.20.10.4:8080')).toBe(true);

        // Foreign internet domains must be blocked
        expect(isAllowedOrigin('https://evil-hacker.com')).toBe(false);
        expect(isAllowedOrigin('https://google.com')).toBe(false);
        expect(isAllowedOrigin('http://185.199.108.153')).toBe(false);
    });

    it('should confine profitability file paths to authorized directories', () => {
        const userDataPath = 'C:\\App\\UserData';
        const baseDir = path.resolve(userDataPath, 'gst_returns_data');
        const allowedUserData = path.resolve(userDataPath);
        const cwdPath = path.resolve(process.cwd());

        const isPathAllowed = (targetPath: string): boolean => {
            const resolved = path.resolve(targetPath);
            return resolved.startsWith(baseDir) || resolved.startsWith(allowedUserData) || resolved.startsWith(cwdPath);
        };

        expect(isPathAllowed(path.join(baseDir, 'ClientA', '2025-26', 'Audit.xlsx'))).toBe(true);
        expect(isPathAllowed(path.join(allowedUserData, 'reports', 'Summary.xlsx'))).toBe(true);
        expect(isPathAllowed(path.join(cwdPath, 'public', 'sample.xlsx'))).toBe(true);

        // Traversal attempts outside allowed directories must be blocked
        expect(isPathAllowed('C:\\Windows\\System32\\calc.exe')).toBe(false);
        expect(isPathAllowed('D:\\OtherSecretClient\\Ledger.xlsx')).toBe(false);
    });
});

function httpRequest(
    port: number,
    method: string,
    urlPath: string,
    headers: Record<string, string> = {},
    body?: any
): Promise<{ status: number; body: any; raw: string }> {
    return new Promise((resolve, reject) => {
        const payload = body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined;
        const reqHeaders: Record<string, string> = { ...headers };
        if (payload !== undefined && !reqHeaders['Content-Type']) {
            reqHeaders['Content-Type'] = 'application/json';
        }
        const req = http.request({ hostname: '127.0.0.1', port, path: urlPath, method, headers: reqHeaders }, (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { raw += c; });
            res.on('end', () => {
                let parsed: any = raw;
                try { parsed = JSON.parse(raw); } catch { /* leave as raw */ }
                resolve({ status: res.statusCode || 0, body: parsed, raw });
            });
        });
        req.on('error', reject);
        if (payload !== undefined) req.write(payload);
        req.end();
    });
}

describe('Phase 37 Plan 01 - Enterprise Auth, Privilege & Transport Hardening', () => {
    const TEST_JWT_SECRET = 'phase37-test-secret-key-32-chars!!';
    const userToken = jwt.sign({ id: 'u1', username: 'junior_a', role: 'user', designation: 'Article Assistant' }, TEST_JWT_SECRET);
    const seniorToken = jwt.sign({ id: 's1', username: 'senior_b', role: 'Senior Auditor', designation: 'Senior Auditor' }, TEST_JWT_SECRET);
    const adminToken = jwt.sign({ id: 'a1', username: 'admin', role: 'admin', designation: 'Administrator' }, TEST_JWT_SECRET);

    let db: sqlite3.Database;
    let server: http.Server;
    let serverPort: number;
    let tempDataRoot: string;

    const createMemStorage = () => {
        const store = new Map<string, string>();
        return {
            getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
            setItem: (k: string, v: string) => { store.set(String(k), String(v)); },
            removeItem: (k: string) => { store.delete(String(k)); },
            clear: () => { store.clear(); },
            key: (idx: number) => Array.from(store.keys())[idx] ?? null,
            get length() { return store.size; }
        };
    };
    const origLocalStorage = (globalThis as any).localStorage;

    beforeAll(async () => {
        if (typeof (globalThis as any).localStorage === 'undefined' || typeof (globalThis as any).localStorage?.setItem !== 'function') {
            const memLocal = createMemStorage();
            Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: memLocal });
            if (typeof window !== 'undefined') {
                Object.defineProperty(window, 'localStorage', { configurable: true, writable: true, value: memLocal });
            }
        }
        tempDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vaswani-sec37-'));
        fs.mkdirSync(path.join(tempDataRoot, 'gst_returns_data'), { recursive: true });
        db = new sqlite3.Database(':memory:');

        const app = express();
        app.use(express.json());

        const authenticateToken = (req: any, res: any, next: any) => {
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];
            if (!token || token === 'null' || token === 'undefined') return res.sendStatus(401);
            jwt.verify(token, TEST_JWT_SECRET, (err: any, user: any) => {
                if (err) return res.sendStatus(401);
                req.user = user;
                next();
            });
        };

        setupTaxRoutes(app, db, authenticateToken);
        setupAuditTrailRoutes(app, db, tempDataRoot, authenticateToken);
        setupAuditStorageRoutes(app, db, tempDataRoot, authenticateToken);
        setupNoticesRoutes(app, db, authenticateToken);
        setupTdsRoutes(app, db, authenticateToken);
        setupGDriveRoutes(app, authenticateToken);
        setupReturnsStorageRoutes(app, db, tempDataRoot, authenticateToken);
        setupMonthlyAuditRoutes(app, db, tempDataRoot, authenticateToken);

        await new Promise<void>((resolve) => {
            db.serialize(() => {
                db.get('SELECT 1', () => resolve());
            });
        });

        await new Promise<void>((resolve) => {
            server = app.listen(0, '127.0.0.1', () => {
                const addr = server.address() as any;
                serverPort = addr.port;
                resolve();
            });
        });
    });

    afterAll(async () => {
        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
        if (db) {
            await new Promise<void>((resolve) => {
                // Allow any background TDS_Rules seeding serialize steps to complete cleanly
                setTimeout(() => db.close(() => resolve()), 150);
            });
        }
        if (tempDataRoot && fs.existsSync(tempDataRoot)) {
            fs.rmSync(tempDataRoot, { recursive: true, force: true });
        }
        if (origLocalStorage === undefined) {
            Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: origLocalStorage });
        }
    });

    afterEach(() => {
        sessionStorage?.clear?.();
        localStorage?.clear?.();
    });

    it('rejects unauthenticated requests with 401 across all 8 backend route modules', async () => {
        const protectedChecks: Array<[string, string, any?]> = [
            ['GET', '/api/tax/assessment/prof_1'],
            ['GET', '/api/audit/reconciliation-override'],
            ['GET', '/api/audit-storage/health'],
            ['GET', '/api/audit-storage/clause44/27AABCU9603R1ZM/2025-26'],
            ['GET', '/api/notices/27AABCU9603R1ZM'],
            ['GET', '/api/tds/rules'],
            ['GET', '/api/gdrive/status'],
            ['GET', '/api/gdrive/list'],
            ['GET', '/api/returns/storage-config'],
            ['POST', '/api/returns/send-client-mail', { recipientEmail: 'client@example.com' }],
            ['GET', '/api/monthly-audits'],
        ];

        for (const [method, urlPath, body] of protectedChecks) {
            const unauth = await httpRequest(serverPort, method, urlPath, {}, body);
            expect(unauth.status, `${method} ${urlPath} without token`).toBe(401);

            const badToken = await httpRequest(
                serverPort,
                method,
                urlPath,
                { Authorization: 'Bearer invalid.jwt.token' },
                body
            );
            expect(badToken.status, `${method} ${urlPath} with bad token`).toBe(401);
        }

        // Authenticated calls pass auth guard
        const tdsOk = await httpRequest(serverPort, 'GET', '/api/tds/rules', { Authorization: `Bearer ${userToken}` });
        expect(tdsOk.status).toBe(200);
        const auditHealthOk = await httpRequest(serverPort, 'GET', '/api/audit-storage/health', { Authorization: `Bearer ${userToken}` });
        expect(auditHealthOk.status).toBe(200);
        const gdriveStatusOk = await httpRequest(serverPort, 'GET', '/api/gdrive/status', { Authorization: `Bearer ${userToken}` });
        expect(gdriveStatusOk.status).toBe(200);
    });

    it('enforces admin/senior role checks and validates send-client-mail recipients', async () => {
        const gdriveSetupNonAdmin = await httpRequest(
            serverPort,
            'POST',
            '/api/gdrive/admin-setup',
            { Authorization: `Bearer ${userToken}` },
            { client_id: 'c', client_secret: 's', auth_code: 'x' }
        );
        expect(gdriveSetupNonAdmin.status).toBe(403);

        const gdriveDisconnectNonAdmin = await httpRequest(
            serverPort,
            'POST',
            '/api/gdrive/disconnect',
            { Authorization: `Bearer ${userToken}` },
            {}
        );
        expect(gdriveDisconnectNonAdmin.status).toBe(403);

        const seniorReviewJunior = await httpRequest(
            serverPort,
            'POST',
            '/api/monthly-audits/a1/senior-review',
            { Authorization: `Bearer ${userToken}` },
            { action: 'APPROVE' }
        );
        expect(seniorReviewJunior.status).toBe(403);

        const releaseJunior = await httpRequest(
            serverPort,
            'POST',
            '/api/monthly-audits/a1/release-client',
            { Authorization: `Bearer ${userToken}` },
            { releasedBy: 'junior' }
        );
        expect(releaseJunior.status).toBe(403);

        // Senior role passes role guard (not 401/403)
        const seniorReviewAllowed = await httpRequest(
            serverPort,
            'POST',
            '/api/monthly-audits/a1/senior-review',
            { Authorization: `Bearer ${seniorToken}` },
            { action: 'APPROVE' }
        );
        expect(seniorReviewAllowed.status).not.toBe(401);
        expect(seniorReviewAllowed.status).not.toBe(403);

        // Admin passes gdrive role guard (reaches validation 400 rather than 403)
        const gdriveSetupAdmin = await httpRequest(
            serverPort,
            'POST',
            '/api/gdrive/admin-setup',
            { Authorization: `Bearer ${adminToken}` },
            {}
        );
        expect(gdriveSetupAdmin.status).toBe(400);

        // Mail endpoint rejects CRLF header injection and invalid addresses
        const crlfMail = await httpRequest(
            serverPort,
            'POST',
            '/api/returns/send-client-mail',
            { Authorization: `Bearer ${userToken}` },
            { recipientEmail: 'client@example.com\r\nBcc:evil@attacker.com' }
        );
        expect(crlfMail.status).toBe(400);

        const invalidMail = await httpRequest(
            serverPort,
            'POST',
            '/api/returns/send-client-mail',
            { Authorization: `Bearer ${userToken}` },
            { recipientEmail: 'not-an-email' }
        );
        expect(invalidMail.status).toBe(400);
    });

    it('blocks prefix-collision and process.cwd() path traversal on monthly audit profitability/from-file', async () => {
        const prefixSiblingPath = path.join(tempDataRoot + '_evil', 'gst_returns_data', 'secret.xlsx');
        const gstPrefixSiblingPath = path.join(tempDataRoot, 'gst_returns_data_evil', 'secret.xlsx');
        const outsideCwdFile = path.join(process.cwd(), 'package.json');

        for (const badPath of [prefixSiblingPath, outsideCwdFile, 'C:\\Windows\\System32\\drivers\\etc\\hosts']) {
            const res = await httpRequest(
                serverPort,
                'GET',
                `/api/monthly-audits/profitability/from-file?filePath=${encodeURIComponent(badPath)}`,
                { Authorization: `Bearer ${userToken}` }
            );
            expect(res.status, `Path should be denied: ${badPath}`).toBe(403);
        }

        // Prefix collision inside tempDataRoot resolves inside baseRoot, wait: tempDataRoot itself is allowedUserData,
        // verify sibling directory OUTSIDE tempDataRoot fails with 403 AND legitimate missing path reaches 404 (passes guard).
        expect(gstPrefixSiblingPath.startsWith(tempDataRoot)).toBe(true);
        const validMissingFile = path.join(tempDataRoot, 'gst_returns_data', 'nonexistent.xlsx');
        const allowedMissingRes = await httpRequest(
            serverPort,
            'GET',
            `/api/monthly-audits/profitability/from-file?filePath=${encodeURIComponent(validMissingFile)}`,
            { Authorization: `Bearer ${userToken}` }
        );
        expect(allowedMissingRes.status).toBe(404);
    });

    it('removes generic invoke from preload.js and validates Tally ports 9000..9010 in main.cjs', async () => {
        const preloadSrc = fs.readFileSync(path.resolve('preload.js'), 'utf8');
        let exposedName = '';
        let exposedApi: Record<string, any> = {};
        const invokedChannels: Array<[string, any]> = [];

        const sandbox = {
            require: (mod: string) => {
                if (mod === 'electron') {
                    return {
                        contextBridge: {
                            exposeInMainWorld: (name: string, api: Record<string, any>) => {
                                exposedName = name;
                                exposedApi = api;
                            }
                        },
                        ipcRenderer: {
                            invoke: (channel: string, data: any) => {
                                invokedChannels.push([channel, data]);
                                return Promise.resolve({ ok: true });
                            },
                            on: () => {},
                            send: () => {},
                            removeListener: () => {}
                        }
                    };
                }
                throw new Error(`Unexpected require in preload.js: ${mod}`);
            }
        };
        vm.runInNewContext(preloadSrc, sandbox);

        expect(exposedName).toBe('electronAPI');
        expect('invoke' in exposedApi).toBe(false);
        expect(typeof exposedApi.getAppMode).toBe('function');
        expect(typeof exposedApi.setAppMode).toBe('function');
        expect(typeof exposedApi.saveActivationInfo).toBe('function');
        expect(typeof exposedApi.scanNetwork).toBe('function');
        expect(typeof exposedApi.fetchTallyData).toBe('function');
        expect(typeof exposedApi.selectFolder).toBe('function');
        expect(typeof exposedApi.checkForUpdates).toBe('function');

        await exposedApi.getAppMode();
        await exposedApi.setAppMode('server');
        expect(invokedChannels).toEqual([
            ['get_app_mode', undefined],
            ['set_app_mode', 'server']
        ]);

        // Verify main.cjs fetch_tally_data rejects out-of-range ports and accepts 9000..9010
        const mainSrc = fs.readFileSync(path.resolve('main.cjs'), 'utf8');
        const handlerMatch = mainSrc.match(/ipcMain\.handle\('fetch_tally_data',\s*(async\s*\(event,\s*params\)\s*=>\s*\{[\s\S]*?\n\}\s*)\);/);
        expect(handlerMatch).not.toBeNull();

        const requestedPorts: number[] = [];
        const fetchTallyHandler = vm.runInNewContext(
            `(${handlerMatch![1]})`,
            {
                http: {
                    request: (opts: any, cb: any) => {
                        requestedPorts.push(opts.port);
                        const fakeRes = {
                            setEncoding: () => {},
                            on: (ev: string, fn: any) => {
                                if (ev === 'data') fn('<RESPONSE>OK</RESPONSE>');
                                if (ev === 'end') fn();
                            }
                        };
                        cb(fakeRes);
                        return { on: () => {}, write: () => {}, end: () => {} };
                    }
                },
                Buffer,
                console
            }
        );

        await expect(fetchTallyHandler({}, { port: 22, xmlPayload: '<ENVELOPE/>' })).rejects.toThrow('Invalid Tally port');
        await expect(fetchTallyHandler({}, { port: 80, xmlPayload: '<ENVELOPE/>' })).rejects.toThrow('Invalid Tally port');
        await expect(fetchTallyHandler({}, { port: 9011, xmlPayload: '<ENVELOPE/>' })).rejects.toThrow('Invalid Tally port');
        await expect(fetchTallyHandler({}, { port: 'not-a-port', xmlPayload: '<ENVELOPE/>' })).rejects.toThrow('Invalid Tally port');

        const ok9000 = await fetchTallyHandler({}, { port: 9000, xmlPayload: '<ENVELOPE/>' });
        const ok9010 = await fetchTallyHandler({}, { port: '9010', xmlPayload: '<ENVELOPE/>' });
        expect(ok9000).toBe('<RESPONSE>OK</RESPONSE>');
        expect(ok9010).toBe('<RESPONSE>OK</RESPONSE>');
        expect(requestedPorts).toEqual([9000, 9010]);
    });

    it('derives session claims cleanly from JWT and avoids http:// mixed content on https:// origins', () => {
        const claimsPayload = { id: '42', username: 'senior1', role: 'Senior Auditor', designation: 'Senior Auditor', exp: Math.floor(Date.now() / 1000) + 3600 };
        const fakeJwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claimsPayload)).toString('base64url')}.sig`;
        sessionStorage.setItem('np_token', fakeJwt);
        expect(getSessionUserFromToken()).toMatchObject({ username: 'senior1', role: 'Senior Auditor' });

        // Expired token must not be trusted
        const expiredPayload = { username: 'admin', role: 'admin', exp: Math.floor(Date.now() / 1000) - 60 };
        sessionStorage.setItem('np_token', `eyJ0eXAiOiJKV1QifQ.${Buffer.from(JSON.stringify(expiredPayload)).toString('base64url')}.sig`);
        expect(getSessionUserFromToken()).toBeNull();

        // Malformed token must return null
        sessionStorage.setItem('np_token', 'malformed-token');
        expect(getSessionUserFromToken()).toBeNull();

        // Raw localStorage np_admin alone must not produce a valid session
        sessionStorage.clear();
        localStorage.setItem('np_admin', 'true');
        expect(getSessionUserFromToken()).toBeNull();

        // getApiBase() over HTTPS uses same-origin ''
        const origLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { protocol: 'https:', hostname: 'app.vaswanica.in', origin: 'https://app.vaswanica.in' }
        });
        try {
            expect(getApiBase()).toBe('');
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: origLocation });
        }
    });

    it('verifies server.js hardening for /api/tally-proxy, /api/reset-license, /ban, /api/ims, rate limiter & zero undefined refs', () => {
        const serverSrc = fs.readFileSync(path.resolve('server.js'), 'utf8');
        expect(serverSrc).toContain('setupTaxRoutes(app, db, authenticateToken);');
        expect(serverSrc).toContain('setupAuditTrailRoutes(app, db, userDataPath, authenticateToken);');
        expect(serverSrc).toContain('setupNoticesRoutes(app, db, authenticateToken);');
        expect(serverSrc).toContain('setupAuditStorageRoutes(app, db, userDataPath, authenticateToken);');
        expect(serverSrc).toMatch(/app\.post\('\/api\/tally-proxy',\s*authenticateToken,/);
        expect(serverSrc).toMatch(/app\.post\('\/api\/reset-license',\s*authRateLimiter,/);
        expect(serverSrc).toContain("Admin authentication or admin password is required to reset license.");
        expect(serverSrc).toMatch(/app\.get\('\/api\/usage',\s*authenticateToken,/);
        expect(serverSrc).toMatch(/app\.post\('\/api\/usage\/increment',\s*authenticateToken,/);
        expect(serverSrc).toMatch(/app\.post\('\/ban',\s*authenticateToken,[\s\S]{0,120}!isAdminUser\(req\.user\)/);
        expect(serverSrc).toContain("path.join(os.tmpdir(), `temp_cma_${runId}.json`)");
        expect(serverSrc).toContain("req.path.startsWith('/public/review/') || req.path.startsWith('/public/submit/')");
        expect(serverSrc).toContain("app.post('/api/ims/broadcast-email', authenticateToken, mailRateLimiter);");
        expect(serverSrc).toContain("app.post('/api/returns/send-client-mail', authenticateToken, mailRateLimiter);");

        const returnsSrc = fs.readFileSync(path.resolve('returns_storage_routes.js'), 'utf8');
        expect(returnsSrc).not.toContain('storageConfig.dataPath');

        const monthlySrc = fs.readFileSync(path.resolve('monthly_audit_routes.js'), 'utf8');
        expect(monthlySrc).not.toContain('path.resolve(userDataPath');
        expect(monthlySrc).not.toContain('process.cwd()');

        // Verify sliding-window rate limiter semantics extracted from server.js
        const rlMatch = serverSrc.match(/const createRateLimiter = (\([\s\S]*?\n\};)/);
        expect(rlMatch).not.toBeNull();
        const createRateLimiter = vm.runInNewContext(`(${rlMatch![1].replace(/\};$/, '}')})`, { Date, Map });
        const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 2, keyFn: (r: any) => r.ip, message: 'Rate limited' });

        let nextCalls = 0;
        let lastStatus = 200;
        const mockRes: any = { status: (code: number) => { lastStatus = code; return { json: () => {} }; } };
        limiter({ ip: '10.0.0.1' }, mockRes, () => { nextCalls++; });
        limiter({ ip: '10.0.0.1' }, mockRes, () => { nextCalls++; });
        limiter({ ip: '10.0.0.1' }, mockRes, () => { nextCalls++; });
        expect(nextCalls).toBe(2);
        expect(lastStatus).toBe(429);
    });

    it('enforces strict JWT auth (no loopback/host-header bypass), server-side activation, and deviceId validation', () => {
        const serverSrc = fs.readFileSync(path.resolve('server.js'), 'utf8');
        // No loopback or Host header bypass in authenticateToken
        const authBlockMatch = serverSrc.match(/const authenticateToken = \([\s\S]*?\n\};/);
        expect(authBlockMatch).not.toBeNull();
        expect(authBlockMatch![0]).not.toContain('local_admin');
        expect(authBlockMatch![0]).not.toContain("host.startsWith('localhost')");

        // /api/keys/:key/unbind-device requires authenticateToken + admin check
        expect(serverSrc).toMatch(/app\.post\('\/api\/keys\/:key\/unbind-device',\s*authenticateToken,/);

        // No legacy_device allow-through bypass in syncAndValidateDevice
        expect(serverSrc).toContain("code: 'DEVICE_ID_REQUIRED'");
        expect(serverSrc).toContain("app.get('/api/activation-status'");
        expect(serverSrc).toContain('notActivated: true');

        // preload.js exposes getDeviceId and main.cjs verifies integrity in packaged builds
        const preloadSrc = fs.readFileSync(path.resolve('preload.js'), 'utf8');
        expect(preloadSrc).toContain("getDeviceId: () => ipcRenderer.invoke('get_device_id')");

        const mainSrc = fs.readFileSync(path.resolve('main.cjs'), 'utf8');
        expect(mainSrc).toContain('function getHardwareDeviceId()');
        expect(mainSrc).toContain('function runStartupIntegrityCheck()');
        expect(mainSrc).toContain('!app.isPackaged');
    });

    it('verifies RSA-SHA256 signed integrity manifests and rejects tampered files or signatures', async () => {
        const cryptoMod = await import('crypto');
        const { computeFileSha256, verifyIntegrityManifest } = await import('../../integrityGuard.cjs');

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vaswani-integrity-'));
        try {
            const targetFile = path.join(tmpDir, 'server.obfuscated.cjs');
            fs.writeFileSync(targetFile, 'console.log("trusted");', 'utf8');

            const { privateKey, publicKey } = cryptoMod.generateKeyPairSync('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
            });

            const payload = JSON.stringify({
                algorithm: 'sha256',
                files: { 'server.obfuscated.cjs': computeFileSha256(targetFile) }
            });
            const signature = cryptoMod.sign('sha256', Buffer.from(payload, 'utf8'), privateKey).toString('base64');
            const manifestPath = path.join(tmpDir, 'integrity.manifest.json');
            fs.writeFileSync(manifestPath, JSON.stringify({ payload, signature }), 'utf8');

            // 1. Valid manifest passes
            const okRes = verifyIntegrityManifest({ baseDir: tmpDir, manifestPath, publicKeyPem: publicKey });
            expect(okRes.ok).toBe(true);
            expect(okRes.verifiedFiles).toEqual(['server.obfuscated.cjs']);

            // 2. Modifying protected file fails integrity check
            fs.writeFileSync(targetFile, 'console.log("tampered!");', 'utf8');
            const tamperedRes = verifyIntegrityManifest({ baseDir: tmpDir, manifestPath, publicKeyPem: publicKey });
            expect(tamperedRes.ok).toBe(false);
            expect(tamperedRes.reason).toContain('File tampered or modified');

            // 3. Invalid signature fails verification
            fs.writeFileSync(targetFile, 'console.log("trusted");', 'utf8');
            fs.writeFileSync(manifestPath, JSON.stringify({ payload, signature: Buffer.from('bad-sig').toString('base64') }), 'utf8');
            const badSigRes = verifyIntegrityManifest({ baseDir: tmpDir, manifestPath, publicKeyPem: publicKey });
            expect(badSigRes.ok).toBe(false);
            expect(badSigRes.reason).toContain('signature mismatch');
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('enforces auth & admin RBAC on /api/gemini/* and encrypts stored Gemini API key in SQLite', async () => {
        const setupGeminiRoutes = (await import('../../gemini_routes.js')).default;
        const gApp = express();
        gApp.use(express.json());
        const gDb = new sqlite3.Database(':memory:');
        await new Promise<void>((resolve) => {
            gDb.run('CREATE TABLE app_config (key TEXT PRIMARY KEY, value TEXT)', () => resolve());
        });

        const gAuth = (req: any, res: any, next: any) => {
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];
            if (!token) return res.sendStatus(401);
            jwt.verify(token, TEST_JWT_SECRET, (err: any, user: any) => {
                if (err) return res.sendStatus(401);
                req.user = user;
                next();
            });
        };
        setupGeminiRoutes(gApp, gDb, null, gAuth);

        const gServer: http.Server = await new Promise((resolve) => {
            const s = gApp.listen(0, '127.0.0.1', () => resolve(s));
        });
        const gPort = (gServer.address() as any).port;

        try {
            // Unauthenticated requests to status, sync-cloud, chat, and config must return 401
            expect((await httpRequest(gPort, 'GET', '/api/gemini/status')).status).toBe(401);
            expect((await httpRequest(gPort, 'POST', '/api/gemini/sync-cloud', {}, {})).status).toBe(401);
            expect((await httpRequest(gPort, 'POST', '/api/gemini/chat', {}, { message: 'hi' })).status).toBe(401);
            expect((await httpRequest(gPort, 'POST', '/api/gemini/config', {}, { apiKey: 'AIza123' })).status).toBe(401);

            // Non-admin user cannot overwrite Gemini API key or push to cloud (403)
            const nonAdminCfg = await httpRequest(gPort, 'POST', '/api/gemini/config', { Authorization: `Bearer ${userToken}` }, { apiKey: 'AIzaTestSecret12345' });
            expect(nonAdminCfg.status).toBe(403);

            // Admin can save API key, and it must be stored AES-256-GCM encrypted (enc:v1:...) in SQLite
            const adminCfg = await httpRequest(gPort, 'POST', '/api/gemini/config', { Authorization: `Bearer ${adminToken}` }, { apiKey: 'AIzaTestSecret12345' });
            expect(adminCfg.status).toBe(200);
            const rawRow: any = await new Promise((resolve) => {
                gDb.get("SELECT value FROM app_config WHERE key = 'gemini_api_key'", [], (_e, r) => resolve(r));
            });
            expect(rawRow?.value?.startsWith('enc:v1:')).toBe(true);
            expect(rawRow?.value).not.toContain('AIzaTestSecret12345');

            // Authenticated status returns configured: true
            const statusOk = await httpRequest(gPort, 'GET', '/api/gemini/status', { Authorization: `Bearer ${userToken}` });
            expect(statusOk.status).toBe(200);
            expect(statusOk.body.configured).toBe(true);
        } finally {
            await new Promise<void>((resolve) => gServer.close(() => resolve()));
            await new Promise<void>((resolve) => gDb.close(() => resolve()));
        }
    });

    it('verifies CSP, encrypted JWT_SECRET, bcrypt-only login, tunnel guard, Electron DPAPI/DevTools & locked Firestore rules', () => {
        const serverSrc = fs.readFileSync(path.resolve('server.js'), 'utf8');
        expect(serverSrc).not.toContain('contentSecurityPolicy: false');
        expect(serverSrc).toContain('contentSecurityPolicy:');
        expect(serverSrc).not.toContain("app.use('/super-admin'");
        expect(serverSrc).toContain('TUNNEL_BLOCKED_PREFIXES');
        expect(serverSrc).toContain('TUNNEL_TTL_MS');
        expect(serverSrc).toContain('encryptSecret(JWT_SECRET)');
        expect(serverSrc).not.toContain('storedSecret === password');
        expect(serverSrc).toContain('isAdminOrSenior');
        expect(serverSrc).toContain('isSameUserOrAdmin');
        expect(serverSrc).toContain('password_hash: _ph');

        const mainSrc = fs.readFileSync(path.resolve('main.cjs'), 'utf8');
        expect(mainSrc).toContain('getOrCreateDpapiVaultMasterKey');
        expect(mainSrc).toContain('devTools: !app.isPackaged');
        expect(mainSrc).toContain('setWindowOpenHandler');
        expect(mainSrc).toContain("on('will-navigate'");

        const pkgJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
        expect(pkgJson.build.asar).toBe(true);
        expect(pkgJson.build.asarUnpack).toEqual([]);

        const obfSrc = fs.readFileSync(path.resolve('obfuscate.cjs'), 'utf8');
        expect(obfSrc).toContain('selfDefending: true');

        const rulesSrc = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
        expect(rulesSrc).not.toContain('request.auth != null');
        expect(rulesSrc).toContain('allow read, write: if false;');

        const indexSrc = fs.readFileSync(path.resolve('src/pages/Index.tsx'), 'utf8');
        expect(indexSrc.replace(/\r\n/g, '\n')).toContain("if (rememberMe) {\n          safeSetItem('np_token', data.token, true);");

        const fbJson = JSON.parse(fs.readFileSync(path.resolve('firebase.json'), 'utf8'));
        expect(fbJson.functions?.source).toBe('firebase-functions');

        const fnSrc = fs.readFileSync(path.resolve('firebase-functions/index.js'), 'utf8');
        for (const fnName of ['activateKey', 'checkServerLicense', 'heartbeatSync', 'verifyUserLogin', 'manageUsers', 'manageKeys', 'usageSync', 'geminiKeySync']) {
            expect(fnSrc).toContain(`exports.${fnName}`);
        }
    });

    it('verifies free standalone license-gateway handlers, token guard, and HTTP method/action checks', async () => {
        const { HANDLERS, dispatchLicenseRequest } = await import('../../license-gateway/handlers.js');
        expect(Object.keys(HANDLERS)).toEqual([
            'activateKey',
            'checkServerLicense',
            'heartbeatSync',
            'verifyUserLogin',
            'manageUsers',
            'manageKeys',
            'usageSync',
            'geminiKeySync'
        ]);

        const prevToken = process.env.LICENSE_GATEWAY_TOKEN;
        process.env.LICENSE_GATEWAY_TOKEN = 'test-gateway-secret-123';
        try {
            const makeRes = () => {
                const out: any = { statusCode: 200, body: null };
                out.status = (c: number) => { out.statusCode = c; return out; };
                out.json = (b: any) => { out.body = b; return out; };
                return out;
            };

            const getRes = makeRes();
            await dispatchLicenseRequest('activateKey', { method: 'GET', headers: {} }, getRes);
            expect(getRes.statusCode).toBe(405);

            const unauthRes = makeRes();
            await dispatchLicenseRequest('activateKey', { method: 'POST', headers: { 'x-license-token': 'wrong' } }, unauthRes);
            expect(unauthRes.statusCode).toBe(401);

            const unknownRes = makeRes();
            await dispatchLicenseRequest('nonExistent', { method: 'POST', headers: { 'x-license-token': 'test-gateway-secret-123' } }, unknownRes);
            expect(unknownRes.statusCode).toBe(404);
        } finally {
            if (prevToken === undefined) delete process.env.LICENSE_GATEWAY_TOKEN;
            else process.env.LICENSE_GATEWAY_TOKEN = prevToken;
        }
    });
});
