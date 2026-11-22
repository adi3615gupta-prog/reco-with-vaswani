import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import {
  encryptSecret,
  decryptSecret,
  isEncryptedSecret,
  deriveOfficeKey,
  setMasterKey,
  getMasterKey
} from '../../cryptoVault.js';
import {
  syncCredentialsWithCentral,
  pushSingleClientToVault,
  readCentralVault
} from '../../credentialsVaultSync.js';

describe('AES-256-GCM Vault Encryption & Credentials Security Suite', () => {
  const testKey = crypto.randomBytes(32);

  beforeEach(() => {
    setMasterKey(testKey);
  });

  afterEach(() => {
    setMasterKey(null);
  });

  // ── 1. AES-256-GCM Round-trip & Format ──────────────────────────────
  it('encrypts plaintext to authenticated enc:v1 format and decrypts back accurately', () => {
    const secret = 'PortalPassword#2026!@$';
    const encrypted = encryptSecret(secret);

    expect(encrypted).not.toBe(secret);
    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(isEncryptedSecret(encrypted)).toBe(true);

    const parts = encrypted.split(':');
    expect(parts.length).toBe(5);
    expect(parts[0]).toBe('enc');
    expect(parts[1]).toBe('v1');
    expect(Buffer.from(parts[2], 'base64').length).toBe(12); // 96-bit IV
    expect(Buffer.from(parts[3], 'base64').length).toBe(16); // 128-bit GCM Auth Tag
    expect(Buffer.from(parts[4], 'base64').length).toBeGreaterThan(0); // Ciphertext

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(secret);
  });

  // ── 2. Tamper Detection & Integrity Verification ────────────────────
  it('throws an error and rejects tampered ciphertext or altered auth tag', () => {
    const secret = 'ConfidentialGSTNToken';
    const encrypted = encryptSecret(secret);
    const parts = encrypted.split(':');

    // 1. Tamper with ciphertext bytes
    const ctBytes = Buffer.from(parts[4], 'base64');
    ctBytes[0] ^= 0xff; // Flip bits
    const tamperedCt = `enc:v1:${parts[2]}:${parts[3]}:${ctBytes.toString('base64')}`;
    expect(() => decryptSecret(tamperedCt)).toThrow();

    // 2. Tamper with Auth Tag bytes
    const tagBytes = Buffer.from(parts[3], 'base64');
    tagBytes[0] ^= 0xff;
    const tamperedTag = `enc:v1:${parts[2]}:${tagBytes.toString('base64')}:${parts[4]}`;
    expect(() => decryptSecret(tamperedTag)).toThrow();
  });

  // ── 3. Transparent Legacy Plaintext Backward Compatibility ─────────
  it('decrypts legacy plaintext passwords transparently without error', () => {
    const legacyPlaintext = 'PlaintextPass99';
    expect(isEncryptedSecret(legacyPlaintext)).toBe(false);
    expect(decryptSecret(legacyPlaintext)).toBe(legacyPlaintext);
  });

  // ── 4. Idempotent Encryption & Edge Cases ───────────────────────────
  it('is idempotent and handles empty, null, and undefined values cleanly', () => {
    const raw = 'SimpleSecret1';
    const enc1 = encryptSecret(raw);
    const enc2 = encryptSecret(enc1); // Attempt to double-encrypt
    expect(enc2).toBe(enc1);

    expect(encryptSecret('')).toBe('');
    expect(encryptSecret(null as any)).toBe('');
    expect(encryptSecret(undefined as any)).toBe('');

    expect(decryptSecret('')).toBe('');
    expect(decryptSecret(null as any)).toBe('');
    expect(decryptSecret(undefined as any)).toBe('');
  });

  // ── 5. Multi-PC Office Key Derivation ───────────────────────────────
  it('derives deterministic 32-byte keys for multi-PC LAN office clusters', () => {
    const secret = 'VASWANI_SECRET_SHARED_OFFICE_KEY';
    const office1 = 'vaswani_mumbai_hq';
    const office2 = 'vaswani_pune_branch';

    const key1 = deriveOfficeKey(secret, office1);
    const key1Repeat = deriveOfficeKey(secret, office1);
    const key2 = deriveOfficeKey(secret, office2);

    expect(Buffer.isBuffer(key1)).toBe(true);
    expect(key1.length).toBe(32);
    expect(key1.equals(key1Repeat)).toBe(true);
    expect(key1.equals(key2)).toBe(false);
  });

  // ── 6. Central Vault Synchronization Auto-Encryption ────────────────
  it('auto-encrypts legacy plaintext passwords when synchronizing with central vault', async () => {
    const tempDir = path.resolve('./scratch/temp_vault_encryption_test');
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });

    const db = new sqlite3.Database(':memory:');
    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        db.run(`
          CREATE TABLE clients (
            id TEXT PRIMARY KEY,
            username TEXT,
            gstin TEXT UNIQUE,
            trade_name TEXT,
            legal_name TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            portal_username TEXT,
            portal_password TEXT,
            last_updated INTEGER DEFAULT 0,
            is_deleted INTEGER DEFAULT 0
          )
        `, (err) => (err ? reject(err) : resolve()));
      });
    });

    // Insert client with plaintext password
    await new Promise<void>((resolve) => {
      db.run(`
        INSERT INTO clients (id, gstin, trade_name, portal_username, portal_password, last_updated)
        VALUES ('c_1', '27AABCV1234F1Z5', 'Vaswani Traders', 'vaswani_portal', 'PlaintextPass#2026', ?)
      `, [Date.now()], () => resolve());
    });

    // Run sync with central vault
    await syncCredentialsWithCentral(db, tempDir);

    // Verify local DB was upgraded to encrypted
    const localRow: any = await new Promise((resolve) => {
      db.get(`SELECT portal_password FROM clients WHERE gstin = '27AABCV1234F1Z5'`, [], (e, r) => resolve(r));
    });

    expect(isEncryptedSecret(localRow.portal_password)).toBe(true);
    expect(decryptSecret(localRow.portal_password)).toBe('PlaintextPass#2026');

    // Verify central vault was also written encrypted
    const centralVault = readCentralVault(tempDir);
    const centralClient = centralVault.clients['27AABCV1234F1Z5'];
    expect(centralClient).toBeDefined();
    expect(isEncryptedSecret(centralClient.portal_password)).toBe(true);
    expect(decryptSecret(centralClient.portal_password)).toBe('PlaintextPass#2026');

    // Test pushSingleClientToVault auto-encrypts
    pushSingleClientToVault(tempDir, {
      id: 'c_2',
      gstin: '24AAACT9999K1Z2',
      trade_name: 'Gujarat Traders',
      portal_username: 'guj_user',
      portal_password: 'AnotherPlaintext#123'
    });

    const updatedCentral = readCentralVault(tempDir);
    const singlePushed = updatedCentral.clients['24AAACT9999K1Z2'];
    expect(isEncryptedSecret(singlePushed.portal_password)).toBe(true);
    expect(decryptSecret(singlePushed.portal_password)).toBe('AnotherPlaintext#123');

    db.close();
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ── 7. Masked Credential Projection (has_password) ─────────────────
  it('masks portal passwords and projects has_password boolean for API clients', async () => {
    const db = new sqlite3.Database(':memory:');
    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        db.run(`
          CREATE TABLE clients (
            id TEXT PRIMARY KEY,
            gstin TEXT UNIQUE,
            trade_name TEXT,
            portal_username TEXT,
            portal_password TEXT,
            is_deleted INTEGER DEFAULT 0
          )
        `, (err) => (err ? reject(err) : resolve()));
      });
    });

    const enc = encryptSecret('SecretPass');
    await new Promise<void>((resolve) => {
      db.run(`
        INSERT INTO clients (id, gstin, trade_name, portal_username, portal_password)
        VALUES ('1', '27AABCV1234F1Z5', 'Client With Pass', 'user1', ?)
      `, [enc], () => resolve());
    });

    await new Promise<void>((resolve) => {
      db.run(`
        INSERT INTO clients (id, gstin, trade_name, portal_username, portal_password)
        VALUES ('2', '27AABCV5678F1Z9', 'Client Without Pass', 'user2', '')
      `, [], () => resolve());
    });

    // Query mimicking the safe GET /api/ims/credentials & GET /api/clients projection
    const rows: any[] = await new Promise((resolve) => {
      db.all(`
        SELECT id, gstin, trade_name, portal_username,
               (CASE WHEN portal_password IS NOT NULL AND LENGTH(portal_password) > 0 THEN 1 ELSE 0 END) AS has_password
        FROM clients
        ORDER BY id ASC
      `, [], (e, r) => resolve(r));
    });

    expect(rows.length).toBe(2);
    // Raw password string is NOT in the selected columns
    expect(rows[0]).not.toHaveProperty('portal_password');
    expect(rows[0].has_password).toBe(1);
    expect(Boolean(rows[0].has_password)).toBe(true);

    expect(rows[1]).not.toHaveProperty('portal_password');
    expect(rows[1].has_password).toBe(0);
    expect(Boolean(rows[1].has_password)).toBe(false);

    db.close();
  });
});

