/*! javascript-obfuscator:disable */
import fs from 'fs';
import path from 'path';
import { encryptSecret, decryptSecret, isEncryptedSecret } from './cryptoVault.js';

/**
 * Centralized Multi-PC GST Client Credentials Vault Synchronization Engine
 * 
 * Ensures that GST portal User IDs, passwords, client names, and contact information
 * are persistently synced across all office workstations via the shared network data path
 * (<dataPath>/central_clients_vault.json).
 */

const VAULT_FILENAME = 'central_clients_vault.json';

/**
 * Resolves the absolute path to the central clients vault file.
 */
export function getCentralVaultPath(dataPath) {
  if (!dataPath) return null;
  return path.join(path.resolve(dataPath), VAULT_FILENAME);
}

/**
 * Helper to safely query active data path from app_config or fallback.
 */
export function getActiveDataPathFromDb(db, defaultUserDataPath = '.') {
  const defaultPath = path.resolve(defaultUserDataPath, 'gst_returns_data');
  return new Promise((resolve) => {
    if (!db || typeof db.get !== 'function') return resolve(defaultPath);

    db.get("SELECT value FROM app_config WHERE key = 'returns_data_path'", [], (err, row) => {
      if (!err && row && row.value) {
        const raw = String(row.value).trim().replace(/^["']|["']$/g, '');
        const candidate = path.resolve(raw);
        try {
          if (fs.existsSync(candidate)) {
            return resolve(candidate);
          }
        } catch {}
      }
      if (!fs.existsSync(defaultPath)) {
        try { fs.mkdirSync(defaultPath, { recursive: true }); } catch {}
      }
      resolve(defaultPath);
    });
  });
}

/**
 * Safely reads the central clients vault from network disk.
 */
export function readCentralVault(dataPath) {
  const vaultPath = getCentralVaultPath(dataPath);
  if (!vaultPath || !fs.existsSync(vaultPath)) {
    return {
      version: 1,
      last_synced_at: 0,
      clients: {}
    };
  }

  try {
    const raw = fs.readFileSync(vaultPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.clients === 'object' && parsed.clients !== null) {
      return parsed;
    }
    return { version: 1, last_synced_at: 0, clients: {} };
  } catch (err) {
    console.warn(`[Vault Sync] Error reading ${vaultPath}, returning empty fallback:`, err.message);
    return { version: 1, last_synced_at: 0, clients: {} };
  }
}

/**
 * Atomically writes the central clients vault to network disk.
 */
export function writeCentralVault(dataPath, vaultData) {
  if (!dataPath) return false;
  const targetDir = path.resolve(dataPath);
  if (!fs.existsSync(targetDir)) {
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch (e) {
      console.warn(`[Vault Sync] Could not create target directory ${targetDir}:`, e.message);
      return false;
    }
  }

  const vaultPath = path.join(targetDir, VAULT_FILENAME);
  const tempPath = `${vaultPath}.tmp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const serialized = JSON.stringify(vaultData, null, 2);

  try {
    // 1. Write to temporary file first for atomic replacement
    fs.writeFileSync(tempPath, serialized, 'utf8');
    try {
      // 2. Rename over original (atomic on most Windows SMB & NTFS filesystems)
      fs.renameSync(tempPath, vaultPath);
    } catch (renameErr) {
      // Direct write fallback if network share locks prevent atomic rename
      fs.writeFileSync(vaultPath, serialized, 'utf8');
      try { fs.unlinkSync(tempPath); } catch {}
    }
    return true;
  } catch (err) {
    console.error(`[Vault Sync] Error writing ${vaultPath}:`, err.message);
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
    return false;
  }
}

/**
 * Reconciles local SQLite clients table bidirectionally with central_clients_vault.json
 * using Last-Write-Wins (timestamp) conflict resolution.
 */
export async function syncCredentialsWithCentral(db, dataPath) {
  if (!db || typeof db.all !== 'function') {
    return { success: false, error: 'Database connection unavailable' };
  }
  if (!dataPath) {
    return { success: false, error: 'Target data path is not configured' };
  }

  const centralVault = readCentralVault(dataPath);
  const centralClients = centralVault.clients || {};

  // 1. Fetch all local records (active and soft-deleted)
  const localRows = await new Promise((resolve, reject) => {
    db.all(`
      SELECT id, username, gstin, trade_name, legal_name, email, phone, address,
             portal_username, portal_password, last_updated, is_deleted
      FROM clients
    `, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

  const localMap = new Map();
  for (const r of localRows) {
    const cleanGstin = String(r.gstin || '').trim().toUpperCase();
    if (cleanGstin) {
      // Migrate local plaintext passwords transparently
      if (r.portal_password && !isEncryptedSecret(r.portal_password)) {
        const encrypted = encryptSecret(r.portal_password);
        db.run('UPDATE clients SET portal_password = ? WHERE id = ?', [encrypted, r.id], () => {});
        r.portal_password = encrypted;
      }
      localMap.set(cleanGstin, r);
    }
  }

  let pulledCount = 0;
  let pushedCount = 0;
  const now = Date.now();

  // 2. Process Central -> Local (incoming updates from other PCs)
  for (const [gstin, cClient] of Object.entries(centralClients)) {
    const cleanGstin = String(gstin).trim().toUpperCase();
    const cUpdated = Number(cClient.last_updated) || 0;
    const lClient = localMap.get(cleanGstin);

    // Transparently encrypt plaintext passwords in central vault
    if (cClient.portal_password && !isEncryptedSecret(cClient.portal_password)) {
      cClient.portal_password = encryptSecret(cClient.portal_password);
      pushedCount++;
    }

    if (!lClient) {
      // Brand new client created on another PC
      const encPassword = encryptSecret(cClient.portal_password || '');
      await new Promise((resolve) => {
        db.run(`
          INSERT INTO clients (
            id, username, gstin, trade_name, legal_name, email, phone, address,
            portal_username, portal_password, last_updated, is_deleted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(gstin) DO UPDATE SET
            trade_name = excluded.trade_name,
            legal_name = excluded.legal_name,
            email = excluded.email,
            phone = excluded.phone,
            address = excluded.address,
            portal_username = excluded.portal_username,
            portal_password = excluded.portal_password,
            last_updated = excluded.last_updated,
            is_deleted = excluded.is_deleted
        `, [
          cClient.id || `c_${cleanGstin}`,
          cClient.username || '',
          cleanGstin,
          cClient.trade_name || cleanGstin,
          cClient.legal_name || cClient.trade_name || cleanGstin,
          cClient.email || '',
          cClient.phone || '',
          cClient.address || '',
          cClient.portal_username || '',
          encPassword,
          cUpdated || now,
          cClient.is_deleted ? 1 : 0
        ], () => resolve());
      });
      pulledCount++;
    } else {
      const lUpdated = Number(lClient.last_updated) || 0;
      if (cUpdated > lUpdated) {
        // Central is newer (another PC updated this client's credentials)
        const encPassword = encryptSecret(cClient.portal_password !== undefined ? cClient.portal_password : lClient.portal_password);
        await new Promise((resolve) => {
          db.run(`
            UPDATE clients SET
              trade_name = ?,
              legal_name = ?,
              email = ?,
              phone = ?,
              address = ?,
              portal_username = ?,
              portal_password = ?,
              last_updated = ?,
              is_deleted = ?
            WHERE gstin = ?
          `, [
            cClient.trade_name || lClient.trade_name || cleanGstin,
            cClient.legal_name || cClient.trade_name || lClient.legal_name || cleanGstin,
            cClient.email !== undefined ? cClient.email : lClient.email,
            cClient.phone !== undefined ? cClient.phone : lClient.phone,
            cClient.address !== undefined ? cClient.address : lClient.address,
            cClient.portal_username !== undefined ? cClient.portal_username : lClient.portal_username,
            encPassword,
            cUpdated,
            cClient.is_deleted ? 1 : 0,
            cleanGstin
          ], () => resolve());
        });
        pulledCount++;
      } else if (lUpdated > cUpdated) {
        // Local is newer (this PC made recent changes), push to central
        const encPassword = encryptSecret(lClient.portal_password || '');
        centralClients[cleanGstin] = {
          id: lClient.id || `c_${cleanGstin}`,
          username: lClient.username || '',
          gstin: cleanGstin,
          trade_name: lClient.trade_name || cleanGstin,
          legal_name: lClient.legal_name || lClient.trade_name || cleanGstin,
          email: lClient.email || '',
          phone: lClient.phone || '',
          address: lClient.address || '',
          portal_username: lClient.portal_username || '',
          portal_password: encPassword,
          last_updated: lUpdated,
          is_deleted: lClient.is_deleted ? 1 : 0
        };
        pushedCount++;
      }
    }
  }

  // 3. Process Local -> Central (clients that exist locally but not yet in central vault)
  for (const [cleanGstin, lClient] of localMap.entries()) {
    if (!centralClients[cleanGstin]) {
      const lUpdated = Number(lClient.last_updated) || now;
      const encPassword = encryptSecret(lClient.portal_password || '');
      centralClients[cleanGstin] = {
        id: lClient.id || `c_${cleanGstin}`,
        username: lClient.username || '',
        gstin: cleanGstin,
        trade_name: lClient.trade_name || cleanGstin,
        legal_name: lClient.legal_name || lClient.trade_name || cleanGstin,
        email: lClient.email || '',
        phone: lClient.phone || '',
        address: lClient.address || '',
        portal_username: lClient.portal_username || '',
        portal_password: encPassword,
        last_updated: lUpdated,
        is_deleted: lClient.is_deleted ? 1 : 0
      };
      pushedCount++;
    }
  }

  // 4. Save central vault if local pushed any updates or if file didn't exist
  if (pushedCount > 0 || !fs.existsSync(getCentralVaultPath(dataPath))) {
    centralVault.last_synced_at = now;
    centralVault.clients = centralClients;
    writeCentralVault(dataPath, centralVault);
  }

  const activeCount = Object.values(centralClients).filter(c => !c.is_deleted).length;

  return {
    success: true,
    pulledCount,
    pushedCount,
    totalClients: activeCount,
    lastSyncTime: now,
    dataPath
  };
}

/**
 * Pushes a single client update or deletion directly to central_clients_vault.json
 */
export function pushSingleClientToVault(dataPath, clientPayload) {
  if (!dataPath || !clientPayload?.gstin) return false;
  const cleanGstin = String(clientPayload.gstin).trim().toUpperCase();
  const vault = readCentralVault(dataPath);
  if (!vault.clients) vault.clients = {};

  const existing = vault.clients[cleanGstin] || {};
  const updatedTs = clientPayload.last_updated || Date.now();

  const payloadCopy = { ...clientPayload };
  if (payloadCopy.portal_password !== undefined && payloadCopy.portal_password !== '') {
    payloadCopy.portal_password = encryptSecret(payloadCopy.portal_password);
  }

  vault.clients[cleanGstin] = {
    ...existing,
    ...payloadCopy,
    gstin: cleanGstin,
    last_updated: updatedTs
  };
  vault.last_synced_at = Date.now();

  return writeCentralVault(dataPath, vault);
}
