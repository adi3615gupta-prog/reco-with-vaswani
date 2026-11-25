/*! javascript-obfuscator:disable */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Enterprise Credential Vault Encryption Engine
 * Uses AES-256-GCM for authenticated encryption at rest.
 * 
 * Ciphertext format: enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
 */

let cachedMasterKey = null;

/**
 * Resolves the path to the local machine vault key file.
 * Stored strictly on local machine (e.g. process.env.USER_DATA_PATH or app root),
 * NEVER on shared network SMB paths.
 */
export function getLocalKeyFilePath() {
  const baseDir = process.env.USER_DATA_PATH
    ? path.resolve(process.env.USER_DATA_PATH)
    : process.cwd();
  return path.join(baseDir, '.vault_key');
}

/**
 * Derives a deterministic 32-byte master key from an office secret and office ID.
 */
export function deriveOfficeKey(secret, officeId = 'vaswani_office') {
  if (!secret) throw new Error('Cannot derive key from empty secret');
  return crypto.scryptSync(String(secret), String(officeId), 32);
}

/**
 * Retrieves or generates the 32-byte AES-256 master key.
 */
export function getMasterKey() {
  if (cachedMasterKey && Buffer.isBuffer(cachedMasterKey) && cachedMasterKey.length === 32) {
    return cachedMasterKey;
  }

  // 1. Explicit env var (hex, base64, or 32-byte string)
  if (process.env.VAULT_MASTER_KEY) {
    const raw = process.env.VAULT_MASTER_KEY.trim();
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      cachedMasterKey = Buffer.from(raw, 'hex');
      return cachedMasterKey;
    }
    const b64Buf = Buffer.from(raw, 'base64');
    if (b64Buf.length === 32) {
      cachedMasterKey = b64Buf;
      return cachedMasterKey;
    }
    // Hash arbitrary length string to 32 bytes
    cachedMasterKey = crypto.createHash('sha256').update(raw).digest();
    return cachedMasterKey;
  }

  // 2. Office secret derivation for multi-PC setups sharing central_clients_vault.json
  if (process.env.OFFICE_VAULT_SECRET) {
    cachedMasterKey = deriveOfficeKey(process.env.OFFICE_VAULT_SECRET, process.env.OFFICE_ID || 'vaswani_office');
    return cachedMasterKey;
  }

  // 3. Persistent local key file on local disk
  const keyPath = getLocalKeyFilePath();
  try {
    if (fs.existsSync(keyPath)) {
      const data = fs.readFileSync(keyPath);
      if (data.length === 32) {
        cachedMasterKey = data;
        return cachedMasterKey;
      }
      if (data.length === 64) {
        // Hex encoded
        cachedMasterKey = Buffer.from(data.toString('utf8').trim(), 'hex');
        if (cachedMasterKey.length === 32) return cachedMasterKey;
      }
    }
  } catch (err) {
    console.warn('[CryptoVault] Could not read .vault_key:', err.message);
  }

  // 4. Generate fresh 32-byte key and store with restricted permissions (0o600)
  const freshKey = crypto.randomBytes(32);
  try {
    const dir = path.dirname(keyPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(keyPath, freshKey, { mode: 0o600 });
  } catch (err) {
    console.warn('[CryptoVault] Could not persist .vault_key to disk, using in-memory key:', err.message);
  }

  cachedMasterKey = freshKey;
  return cachedMasterKey;
}

/**
 * Manually sets the master key (primarily for unit tests and key rotation).
 */
export function setMasterKey(key) {
  if (!key) {
    cachedMasterKey = null;
    return;
  }
  if (Buffer.isBuffer(key) && key.length === 32) {
    cachedMasterKey = key;
    return;
  }
  if (typeof key === 'string') {
    if (/^[0-9a-fA-F]{64}$/.test(key.trim())) {
      cachedMasterKey = Buffer.from(key.trim(), 'hex');
      return;
    }
    cachedMasterKey = crypto.createHash('sha256').update(key).digest();
    return;
  }
  throw new Error('Invalid master key: must be 32-byte Buffer or hex/string');
}

/**
 * Checks if a value is an encrypted secret string.
 */
export function isEncryptedSecret(value) {
  return typeof value === 'string' && value.startsWith('enc:v1:');
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * If already encrypted (`enc:v1:...`) or empty, returns as-is.
 */
export function encryptSecret(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') {
    return '';
  }
  if (typeof plaintext !== 'string') {
    plaintext = String(plaintext);
  }
  if (plaintext.startsWith('enc:v1:')) {
    return plaintext;
  }

  const key = getMasterKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return `enc:v1:${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Decrypts an encrypted secret string.
 * If not encrypted (`enc:v1:` prefix missing), returns raw value (legacy plaintext compatibility).
 */
export function decryptSecret(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (typeof value !== 'string') {
    return value;
  }
  if (!value.startsWith('enc:v1:')) {
    // Transparent legacy plaintext support
    return value;
  }

  const parts = value.split(':');
  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    throw new Error('Malformed encrypted secret payload');
  }

  const iv = Buffer.from(parts[2], 'base64');
  const authTag = Buffer.from(parts[3], 'base64');
  const ciphertext = Buffer.from(parts[4], 'base64');

  if (iv.length !== 12 || authTag.length !== 16) {
    throw new Error('Invalid IV or auth tag length in encrypted secret');
  }

  const key = getMasterKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

