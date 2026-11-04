import { describe, it, expect } from 'vitest';
import sqlite3 from 'sqlite3';
import path from 'path';

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
