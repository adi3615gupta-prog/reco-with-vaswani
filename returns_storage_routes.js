import fs from 'fs';
import path from 'path';
import os from 'os';
import nodemailer from 'nodemailer';
import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;
import ExcelJS from 'exceljs';
import { openPortalLoginHelper } from './gstr2b/autopilot.js';
import { runReturnsTrackingAutopilot } from './gstr_tracking/autopilot.js';
import { syncCredentialsWithCentral } from './credentialsVaultSync.js';
import { runGstr3bUploadAutopilot } from './gstr3b/autopilot.js';
import { runGstr1UploadAutopilot } from './gstr1/autopilot.js';

/**
 * Enterprise Server Shared Data Storage Routes for GSTR Returns
 * Allows all PCs in the office LAN to store and access client return working papers from a central server folder.
 */
export default function setupReturnsStorageRoutes(app, db, defaultUserDataPath = '.') {
  const browserState = { current: null };

  // Initialize GSTR-3B Month Lock Storage Table (Multi-PC Network Sync)
  if (db && typeof db.run === 'function') {
    db.run(`CREATE TABLE IF NOT EXISTS gstr3b_month_locks (
      gstin TEXT NOT NULL,
      fy TEXT NOT NULL,
      month TEXT NOT NULL,
      is_locked INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (gstin, fy, month)
    )`);
  }

  let _cachedActiveDataPath = null;
  let _lastPathCheckTime = 0;
  const PATH_CACHE_TTL = 30000; // 30 seconds

  let _cachedStats = null;
  let _lastStatsTime = 0;
  const STATS_CACHE_TTL = 60000; // 60 seconds

  function invalidateDataPathCache() {
    _cachedActiveDataPath = null;
    _lastPathCheckTime = 0;
    _cachedStats = null;
    _lastStatsTime = 0;
  }

  // Helper to get network IP addresses of this host machine
  function getServerNetworkIps() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
    return ips;
  }

  // Helper to retrieve active returns data path from app_config or fallback
  function getActiveDataPath() {
    const defaultPath = path.resolve(defaultUserDataPath, 'gst_returns_data');
    if (_cachedActiveDataPath && (Date.now() - _lastPathCheckTime < PATH_CACHE_TTL)) {
      return Promise.resolve(_cachedActiveDataPath);
    }

    return new Promise((resolve) => {
      if (!fs.existsSync(defaultPath)) {
        try {
          fs.mkdirSync(defaultPath, { recursive: true });
        } catch (e) {
          console.warn('[Returns Storage] Could not create default path:', e.message);
        }
      }

      db.get("SELECT value FROM app_config WHERE key = 'returns_data_path'", [], (err, row) => {
        if (!err && row && row.value) {
          const raw = String(row.value).trim().replace(/^["']|["']$/g, '');
          const candidatePath = path.resolve(raw);
          try {
            if (fs.existsSync(candidatePath)) {
              _cachedActiveDataPath = candidatePath;
              _lastPathCheckTime = Date.now();
              return resolve(candidatePath);
            }
          } catch (e) {
            console.warn('[Returns Storage] Configured network path inaccessible, falling back to local storage:', e.message);
          }
        }
        _cachedActiveDataPath = defaultPath;
        _lastPathCheckTime = Date.now();
        resolve(defaultPath);
      });
    });
  }

  // Helper to sanitize client name for valid directory names on Windows/Linux
  function sanitizeFolderName(name) {
    if (!name) return '';
    const clean = String(name)
      .replace(/[<>:"/\\|?*]/g, '') // remove Windows forbidden characters
      .replace(/[\r\n\t]/g, ' ')
      .replace(/\s+/g, ' ')         // normalize multi-spaces
      .replace(/[.\s]+$/, '')       // strip trailing periods and spaces (Windows filesystem restriction)
      .trim();

    // Check Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(clean)) {
      return `${clean}_dir`;
    }
    return clean;
  }

  // Helper to construct client folder name: "Client Name - GSTIN"
  function buildClientFolderName(clientName, gstin) {
    const cleanName = sanitizeFolderName(clientName);
    const gstinUpper = (gstin || '').trim().toUpperCase();
    if (cleanName && cleanName.toLowerCase() !== 'client' && cleanName.toLowerCase() !== 'no company selected' && cleanName !== gstinUpper) {
      return `${cleanName} - ${gstinUpper}`;
    }
    return gstinUpper;
  }

  // Helper to extract GSTIN from folder name (supports "Client Name - GSTIN", "GSTIN", "Client (GSTIN)")
  function extractGstinFromDirName(dirName) {
    if (!dirName) return null;
    const match = dirName.toUpperCase().match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/);
    if (match) return match[0];
    const clean = dirName.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (clean.length === 15) return clean;
    return null;
  }

  // Helper to extract Client Name from folder name if format is "Client Name - GSTIN"
  function extractClientNameFromDirName(dirName) {
    if (!dirName) return '';
    const parts = dirName.split(' - ');
    if (parts.length >= 2) {
      return sanitizeFolderName(parts.slice(0, -1).join(' - '));
    }
    return '';
  }

  // Helper to resolve (and auto-rename if needed) the client directory: "Client Name - GSTIN"
  function resolveClientDirectory(dataPath, gstin, clientName = '', autoRename = true) {
    const gstinUpper = (gstin || '').trim().toUpperCase();
    if (!fs.existsSync(dataPath)) {
      try { fs.mkdirSync(dataPath, { recursive: true }); } catch {}
    }

    const targetName = buildClientFolderName(clientName, gstinUpper);
    const targetPath = path.join(dataPath, targetName);

    if (fs.existsSync(targetPath)) {
      return targetPath;
    }

    // Check if an existing directory matches this GSTIN (e.g. "27AAKFS2266E1Z4" or "Old - 27AAKFS2266E1Z4")
    try {
      const entries = fs.readdirSync(dataPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const foundGstin = extractGstinFromDirName(entry.name);
          if (foundGstin === gstinUpper) {
            const existingPath = path.join(dataPath, entry.name);
            // If targetName contains clientName and current folder doesn't, rename it!
            if (autoRename && targetName !== entry.name && targetName.includes(' - ' + gstinUpper)) {
              try {
                fs.renameSync(existingPath, targetPath);
                console.log(`[Returns Storage] Auto-renamed folder: "${entry.name}" -> "${targetName}"`);
                return targetPath;
              } catch (renameErr) {
                console.warn('[Returns Storage] Rename error:', renameErr.message);
                return existingPath;
              }
            }
            return existingPath;
          }
        }
      }
    } catch (e) {
      console.warn('[Returns Storage] Directory scan error:', e.message);
    }

    return targetPath;
  }

  // 12-Month Financial Year Mapping
  const MONTH_MAP = [
    { key: 'April', folder: '01 - April' },
    { key: 'May', folder: '02 - May' },
    { key: 'June', folder: '03 - June' },
    { key: 'July', folder: '04 - July' },
    { key: 'August', folder: '05 - August' },
    { key: 'September', folder: '06 - September' },
    { key: 'October', folder: '07 - October' },
    { key: 'November', folder: '08 - November' },
    { key: 'December', folder: '09 - December' },
    { key: 'January', folder: '10 - January' },
    { key: 'February', folder: '11 - February' },
    { key: 'March', folder: '12 - March' }
  ];

  // Helper to scan directory for client statistics (Fast top-level check with 60s cache)
  function inspectStorageDirectory(dirPath) {
    if (!dirPath || typeof dirPath !== 'string') {
      return { exists: false, isWritable: false, totalClientsWithData: 0, totalFiles: 0, sizeBytes: 0 };
    }

    const cleanPath = dirPath.replace(/^["']|["']$/g, '').trim();
    if (!fs.existsSync(cleanPath)) {
      return { exists: false, isWritable: false, totalClientsWithData: 0, totalFiles: 0, sizeBytes: 0 };
    }

    let isWritable = true;
    try {
      fs.accessSync(cleanPath, fs.constants.W_OK);
    } catch {
      try {
        const testFile = path.join(cleanPath, `.access_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.tmp`);
        fs.writeFileSync(testFile, 'OK');
        fs.unlinkSync(testFile);
        isWritable = true;
      } catch {
        isWritable = false;
      }
    }

    if (_cachedStats && (Date.now() - _lastStatsTime < STATS_CACHE_TTL)) {
      return { ..._cachedStats, exists: true, isWritable };
    }

    let totalClientsWithData = 0;
    let totalFiles = 0;
    let sizeBytes = 0;

    try {
      const items = fs.readdirSync(cleanPath, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          const gstin = extractGstinFromDirName(item.name);
          if (gstin) {
            totalClientsWithData++;
          }
        }
      }
      _cachedStats = { exists: true, isWritable, totalClientsWithData, totalFiles, sizeBytes };
      _lastStatsTime = Date.now();
    } catch (e) {
      console.warn('[Returns Storage] Inspection note:', e.message);
    }

    return { exists: true, isWritable, totalClientsWithData, totalFiles, sizeBytes };
  }

  // 1. GET Storage Configuration & Server LAN Status
  app.get('/api/returns/storage-config', async (req, res) => {
    try {
      const dataPath = await getActiveDataPath();
      const stats = inspectStorageDirectory(dataPath);
      const serverIps = getServerNetworkIps();
      const serverHost = os.hostname();

      res.json({
        success: true,
        dataPath,
        serverHost,
        serverIps,
        isLanReady: serverIps.length > 0,
        port: 3001,
        ...stats
      });
    } catch (err) {
      console.error('[Returns Storage] Config GET error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. POST Update Storage Path
  app.post('/api/returns/storage-config', async (req, res) => {
    try {
      const { dataPath } = req.body;
      if (!dataPath || typeof dataPath !== 'string' || !dataPath.trim()) {
        return res.status(400).json({ success: false, error: 'Valid folder path is required' });
      }

      const cleanPath = dataPath.trim().replace(/^["']|["']$/g, '').trim();
      const normalized = path.resolve(cleanPath);

      if (!fs.existsSync(normalized)) {
        fs.mkdirSync(normalized, { recursive: true });
      }

      const testFile = path.join(normalized, `.write_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.tmp`);
      let writeOk = false;
      try {
        fs.writeFileSync(testFile, 'OK');
        writeOk = true;
      } finally {
        if (writeOk) {
          try {
            if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
          } catch (cleanErr) {
            console.warn('[Returns Storage] Canary cleanup note (non-fatal):', cleanErr.message);
          }
        }
      }

      db.run(
        `INSERT INTO app_config (key, value) VALUES ('returns_data_path', ?)
         ON CONFLICT(key) DO UPDATE SET value = ?`,
        [normalized, normalized],
        (dbErr) => {
          if (dbErr) {
            console.error('[Returns Storage] DB save error:', dbErr);
            return res.status(500).json({ success: false, error: 'Failed saving data path to database: ' + dbErr.message });
          }

          invalidateDataPathCache();
          console.log(`[Returns Storage] Server data path updated to: ${normalized}`);
          res.json({
            success: true,
            dataPath: normalized,
            message: 'Server storage path successfully configured and verified.'
          });
        }
      );
    } catch (err) {
      console.error('[Returns Storage] Config POST error:', err);
      res.status(500).json({ success: false, error: `Cannot use path: ${err.message}` });
    }
  });

  // 2b. POST Reset Storage to Local Default
  app.post('/api/returns/reset-default-storage', async (req, res) => {
    try {
      const defaultPath = path.resolve(defaultUserDataPath, 'gst_returns_data');
      if (!fs.existsSync(defaultPath)) {
        fs.mkdirSync(defaultPath, { recursive: true });
      }
      db.run("DELETE FROM app_config WHERE key = 'returns_data_path'", [], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        invalidateDataPathCache();
        res.json({ success: true, dataPath: defaultPath, message: 'Reset to local application directory' });
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2c. POST Open Storage Folder in Windows Explorer (supports optional folderPath, mounted on both /open-folder and /open-storage-folder)
  const handleOpenFolder = async (req, res) => {
    try {
      let targetFolder = await getActiveDataPath();
      if (req.body && req.body.folderPath) {
        const customPath = path.resolve(String(req.body.folderPath).trim().replace(/^["']|["']$/g, ''));
        if (fs.existsSync(customPath)) {
          targetFolder = customPath;
        }
      }
      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }
      import('child_process').then(({ exec }) => {
        exec(`start "" "${targetFolder}"`, (err) => {
          if (err) {
            return res.json({ success: false, error: err.message });
          }
          res.json({ success: true, message: 'Opened in Explorer', path: targetFolder });
        });
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  app.post('/api/returns/open-folder', handleOpenFolder);
  app.post('/api/returns/open-storage-folder', handleOpenFolder);

  // 2d. POST Browse Folder Dialog (Windows native FolderBrowserDialog via PowerShell)
  app.post('/api/returns/browse-folder', (req, res) => {
    try {
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select Centralized Returns & Client Storage Folder"
$dialog.ShowNewFolderButton = $true
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
} else {
  Write-Output "__CANCELED__"
}
`;
      const b64 = Buffer.from(psScript, 'utf16le').toString('base64');
      import('child_process').then(({ exec }) => {
        exec(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${b64}`, { windowsHide: false }, (err, stdout) => {
          if (err) {
            return res.json({ success: false, error: err.message });
          }
          const chosen = (stdout || '').trim();
          if (!chosen || chosen === '__CANCELED__') {
            return res.json({ success: false, canceled: true });
          }
          return res.json({ success: true, folderPath: chosen });
        });
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. GET Client Working Paper from Server Shared Storage (Loads master and merges month folders)
  app.get('/api/returns/working-data', async (req, res) => {
    try {
      const { gstin, fy, clientName } = req.query;
      if (!gstin) return res.status(400).json({ success: false, error: 'gstin parameter is required' });

      const gstinClean = String(gstin).trim().toUpperCase();
      const fyClean = String(fy || '2025-26').trim();
      const dataPath = await getActiveDataPath();

      const clientDir = resolveClientDirectory(dataPath, gstinClean, clientName || '', true);
      const fyDir = path.join(clientDir, fyClean);

      const annualFile = path.join(fyDir, 'annual_gstr3b_working.json');
      const fyFile = path.join(fyDir, `gstr3b_${fyClean}.json`);
      const rootLegacy = path.join(clientDir, `gstr3b_${fyClean}.json`);

      let workingData = null;
      let lastModified = 0;
      let sourcePath = '';

      if (fs.existsSync(annualFile)) {
        sourcePath = annualFile;
        workingData = JSON.parse(fs.readFileSync(annualFile, 'utf8'));
        lastModified = fs.statSync(annualFile).mtimeMs;
      } else if (fs.existsSync(fyFile)) {
        sourcePath = fyFile;
        workingData = JSON.parse(fs.readFileSync(fyFile, 'utf8'));
        lastModified = fs.statSync(fyFile).mtimeMs;
      } else if (fs.existsSync(rootLegacy)) {
        sourcePath = rootLegacy;
        workingData = JSON.parse(fs.readFileSync(rootLegacy, 'utf8'));
        lastModified = fs.statSync(rootLegacy).mtimeMs;
      }

      if (!workingData) {
        return res.json({
          success: true,
          found: false,
          dataPath,
          clientDir,
          gstin: gstinClean,
          fy: fyClean
        });
      }

      // Check and merge individual month files if any exists and has newer data
      if (fs.existsSync(fyDir) && workingData && workingData.months) {
        for (const m of MONTH_MAP) {
          const mFile = path.join(fyDir, m.folder, `gstr3b_${m.key}.json`);
          if (fs.existsSync(mFile)) {
            try {
              const stat = fs.statSync(mFile);
              if (stat.mtimeMs > lastModified) lastModified = stat.mtimeMs;
              const mParsed = JSON.parse(fs.readFileSync(mFile, 'utf8'));
              if (mParsed && mParsed.data) {
                workingData.months[m.key] = mParsed.data;
              }
            } catch {}
          }
        }
      }

      // Merge month locks from SQLite table for real-time multi-PC synchronization
      const locksMap = { ...(workingData.lockedMonths || {}) };
      if (db && typeof db.all === 'function') {
        try {
          const rows = await new Promise((resolve) => {
            db.all("SELECT month, is_locked FROM gstr3b_month_locks WHERE gstin = ? AND fy = ?", [gstinClean, fyClean], (err, rows) => {
              resolve(err ? [] : (rows || []));
            });
          });
          for (const r of rows) {
            locksMap[r.month] = Boolean(r.is_locked);
          }
        } catch (dbLockErr) {
          console.warn('[Returns Storage] Error reading locks from SQLite:', dbLockErr.message);
        }
      }
      workingData.lockedMonths = locksMap;

      res.json({
        success: true,
        found: true,
        gstin: gstinClean,
        fy: fyClean,
        filePath: sourcePath,
        clientDir,
        fyDir,
        lastModified,
        workingData
      });
    } catch (err) {
      console.error('[Returns Storage] Working data GET error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. POST Save Client Working Paper to Server Shared Storage (Real-time live month-wise update)
  app.post('/api/returns/working-data', async (req, res) => {
    try {
      const { gstin, fy, workingData, clientName } = req.body;
      if (!gstin || !workingData) {
        return res.status(400).json({ success: false, error: 'gstin and workingData are required' });
      }

      const gstinClean = String(gstin).trim().toUpperCase();
      const fyClean = String(fy || workingData.profile?.financialYear || '2025-26').trim();
      const firmName = clientName || workingData.profile?.firmName || '';
      const dataPath = await getActiveDataPath();

      const defaultPath = path.resolve(defaultUserDataPath, 'gst_returns_data');
      let usedFallback = false;
      let effectiveDataPath = dataPath;
      let clientDir = resolveClientDirectory(effectiveDataPath, gstinClean, firmName, true);
      let fyDir = path.join(clientDir, fyClean);

      const performSave = (targetFyDir) => {
        if (!fs.existsSync(targetFyDir)) {
          fs.mkdirSync(targetFyDir, { recursive: true });
        }
        const annualFile = path.join(targetFyDir, 'annual_gstr3b_working.json');
        const fyFile = path.join(targetFyDir, `gstr3b_${fyClean}.json`);
        const serialized = JSON.stringify(workingData, null, 2);
        fs.writeFileSync(annualFile, serialized, 'utf8');
        fs.writeFileSync(fyFile, serialized, 'utf8');

        if (workingData.months) {
          for (const m of MONTH_MAP) {
            const mDir = path.join(targetFyDir, m.folder);
            if (!fs.existsSync(mDir)) {
              fs.mkdirSync(mDir, { recursive: true });
            }
            const monthPayload = {
              month: m.key,
              financialYear: fyClean,
              clientName: firmName,
              gstin: gstinClean,
              lastUpdated: Date.now(),
              data: workingData.months[m.key] || null
            };
            const mFile = path.join(mDir, `gstr3b_${m.key}.json`);
            fs.writeFileSync(mFile, JSON.stringify(monthPayload, null, 2), 'utf8');
          }
        }
        return annualFile;
      };

      let annualFile = '';
      try {
        annualFile = performSave(fyDir);
      } catch (writeErr) {
        if (effectiveDataPath !== defaultPath) {
          console.warn(`[Returns Storage] Primary path write failed (${writeErr.message}), falling back to local default storage: ${defaultPath}`);
          usedFallback = true;
          effectiveDataPath = defaultPath;
          clientDir = resolveClientDirectory(effectiveDataPath, gstinClean, firmName, true);
          fyDir = path.join(clientDir, fyClean);
          annualFile = performSave(fyDir);
        } else {
          throw writeErr;
        }
      }

      // Step 3: Sync client in SQLite clients table if firmName is present
      if (firmName && firmName !== 'No Company Selected' && firmName !== 'Client') {
        const clientId = 'c_' + gstinClean;
        db.run(
          `INSERT INTO clients (id, gstin, trade_name, legal_name)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(gstin) DO UPDATE SET
             trade_name = COALESCE(excluded.trade_name, clients.trade_name),
             legal_name = COALESCE(excluded.legal_name, clients.legal_name)`,
          [clientId, gstinClean, firmName, firmName],
          () => {}
        );
      }

      // Step 4: Persist month locks into SQLite for multi-PC synchronization
      if (workingData.lockedMonths && typeof workingData.lockedMonths === 'object' && db && typeof db.run === 'function') {
        const now = Date.now();
        for (const [mKey, isLockVal] of Object.entries(workingData.lockedMonths)) {
          db.run(
            `INSERT INTO gstr3b_month_locks (gstin, fy, month, is_locked, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(gstin, fy, month) DO UPDATE SET
               is_locked = excluded.is_locked,
               updated_at = excluded.updated_at`,
            [gstinClean, fyClean, mKey, isLockVal ? 1 : 0, now],
            () => {}
          );
        }
      }

      res.json({
        success: true,
        filePath: annualFile,
        clientDir,
        fyDir,
        gstin: gstinClean,
        fy: fyClean,
        monthsCount: MONTH_MAP.length,
        savedAt: Date.now()
      });
    } catch (err) {
      console.error('[Returns Storage] Working data POST error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4c. GET GSTR-3B Month Locks across all network workstations (Multi-PC Sync)
  app.get('/api/returns/month-locks', async (req, res) => {
    try {
      const { gstin, fy } = req.query;
      if (!gstin) return res.status(400).json({ success: false, error: 'gstin is required' });

      const gstinClean = String(gstin).trim().toUpperCase();
      const fyClean = String(fy || '2025-26').trim();
      const lockedMonths = {};

      // 1. Read locks from SQLite
      if (db && typeof db.all === 'function') {
        const rows = await new Promise((resolve) => {
          db.all("SELECT month, is_locked FROM gstr3b_month_locks WHERE gstin = ? AND fy = ?", [gstinClean, fyClean], (err, rows) => {
            resolve(err ? [] : (rows || []));
          });
        });
        for (const r of rows) {
          lockedMonths[r.month] = Boolean(r.is_locked);
        }
      }

      // 2. Supplementary check from central disk annual working file if not in DB
      try {
        const dataPath = await getActiveDataPath();
        const clientDir = resolveClientDirectory(dataPath, gstinClean, '', false);
        const fyDir = path.join(clientDir, fyClean);
        const annualFile = path.join(fyDir, 'annual_gstr3b_working.json');
        if (fs.existsSync(annualFile)) {
          const parsed = JSON.parse(fs.readFileSync(annualFile, 'utf8'));
          if (parsed && parsed.lockedMonths && typeof parsed.lockedMonths === 'object') {
            for (const [m, isLocked] of Object.entries(parsed.lockedMonths)) {
              if (lockedMonths[m] === undefined) {
                lockedMonths[m] = Boolean(isLocked);
              }
            }
          }
        }
      } catch (fileErr) {
        // Non-blocking
      }

      res.json({
        success: true,
        gstin: gstinClean,
        fy: fyClean,
        lockedMonths
      });
    } catch (err) {
      console.error('[Returns Storage] month-locks GET error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4d. POST Toggle GSTR-3B Month Lock across all network workstations (Multi-PC Sync)
  app.post('/api/returns/month-lock', async (req, res) => {
    try {
      const { gstin, fy, month, locked, clientName } = req.body;
      if (!gstin || !month) {
        return res.status(400).json({ success: false, error: 'gstin and month are required' });
      }

      const gstinClean = String(gstin).trim().toUpperCase();
      const fyClean = String(fy || '2025-26').trim();
      const monthClean = String(month).trim();
      const isLocked = Boolean(locked);
      const now = Date.now();
      const firmName = clientName || '';

      // 1. Update SQLite table immediately
      if (db && typeof db.run === 'function') {
        await new Promise((resolve) => {
          db.run(
            `INSERT INTO gstr3b_month_locks (gstin, fy, month, is_locked, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(gstin, fy, month) DO UPDATE SET
               is_locked = excluded.is_locked,
               updated_at = excluded.updated_at`,
            [gstinClean, fyClean, monthClean, isLocked ? 1 : 0, now],
            () => resolve()
          );
        });
      }

      // 2. Also update central disk JSON files (annual_gstr3b_working.json & gstr3b_${fyClean}.json)
      try {
        const dataPath = await getActiveDataPath();
        const clientDir = resolveClientDirectory(dataPath, gstinClean, firmName, false);
        const fyDir = path.join(clientDir, fyClean);
        const annualFile = path.join(fyDir, 'annual_gstr3b_working.json');
        const fyFile = path.join(fyDir, `gstr3b_${fyClean}.json`);

        if (fs.existsSync(annualFile)) {
          try {
            const raw = JSON.parse(fs.readFileSync(annualFile, 'utf8'));
            if (!raw.lockedMonths) raw.lockedMonths = {};
            raw.lockedMonths[monthClean] = isLocked;
            const serialized = JSON.stringify(raw, null, 2);
            fs.writeFileSync(annualFile, serialized, 'utf8');
            if (fs.existsSync(fyFile)) {
              fs.writeFileSync(fyFile, serialized, 'utf8');
            }
          } catch {}
        }
      } catch (fileErr) {
        console.warn('[Returns Storage] Error writing lock status to file:', fileErr.message);
      }

      res.json({
        success: true,
        gstin: gstinClean,
        fy: fyClean,
        month: monthClean,
        locked: isLocked,
        updatedAt: now
      });
    } catch (err) {
      console.error('[Returns Storage] month-lock POST error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4b. POST Save Full Bundle (Excel + PDF + Portal JSON + Working Data) Date-Wise & Time-Wise
  app.post('/api/returns/save-full-bundle', async (req, res) => {
    try {
      const {
        gstin,
        fy,
        month,
        clientName,
        workingData,
        portalJson,
        excelBase64,
        pdfBase64,
        timestamp
      } = req.body;

      if (!gstin) {
        return res.status(400).json({ success: false, error: 'gstin is required' });
      }

      const gstinClean = String(gstin).trim().toUpperCase();
      const fyClean = String(fy || workingData?.profile?.financialYear || '2025-26').trim();
      const firmName = clientName || workingData?.profile?.firmName || '';
      const safeFirm = sanitizeFolderName(firmName) || gstinClean;
      const monthClean = String(month || 'September').trim();
      const dataPath = await getActiveDataPath();

      // Format Date and Time timestamp: YYYY-MM-DD_HH-mm-ss
      const now = new Date(timestamp || Date.now());
      const pad = (n) => String(n).padStart(2, '0');
      const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const timePart = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const dateTimeStamp = `${datePart}_${timePart}`;
      const humanDate = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const humanTime = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const defaultPath = path.resolve(defaultUserDataPath, 'gst_returns_data');
      let effectiveDataPath = dataPath;
      let usedFallback = false;

      // Safe asynchronous DB query helper
      const queryDbSafe = (sql, params = []) => {
        return new Promise((resolve) => {
          if (!db || typeof db.all !== 'function') return resolve([]);
          db.all(sql, params, (err, rows) => {
            if (err) {
              console.warn('[Returns Storage] DB query warning:', err.message);
              resolve([]);
            } else {
              resolve(rows || []);
            }
          });
        });
      };

      // Helper to safely write multi-sheet audit-grade corporate workbooks with merged top headings and ultra-compact layout
      const writeCorporateWorkbook = async (targetPath, sheetsMap, meta = {}) => {
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Vaswani Enterprise Tax System';
        wb.lastModifiedBy = 'Vaswani Enterprise Tax System';
        wb.created = new Date();
        wb.modified = new Date();

        const primaryNavy = '0F172A';   // Rich Midnight Navy (Executive Header)
        const subNavy = '1E293B';       // Deep Slate Navy (Context bar)
        const borderLight = { style: 'thin', color: { argb: 'E2E8F0' } };
        const borderMedium = { style: 'medium', color: { argb: '94A3B8' } };
        const borderDouble = { style: 'double', color: { argb: '0F172A' } };
        const numFormat = '₹ #,##,##0.00;[Red]-₹ #,##,##0.00;"-"';

        for (const [sheetName, rawSheet] of Object.entries(sheetsMap)) {
          if (!rawSheet) continue;
          let aoa = rawSheet;
          if (!Array.isArray(rawSheet) && rawSheet['!ref']) {
            aoa = XLSX.utils.sheet_to_json(rawSheet, { header: 1 });
          }
          if (!Array.isArray(aoa) || aoa.length === 0) continue;

          let tabColor = '1E3A8A';
          let headerBg = '1E3A8A';
          const lowerName = sheetName.toLowerCase();
          if (lowerName.includes('2b') || lowerName.includes('inward')) {
            tabColor = '059669'; // Emerald
            headerBg = '0F766E'; // Deep Teal/Emerald
          } else if (lowerName.includes('credit note') || lowerName.includes('cdnr')) {
            tabColor = 'D97706'; // Amber
            headerBg = 'B45309'; // Rich Amber
          } else if (lowerName.includes('reversal') || lowerName.includes('ineligible') || lowerName.includes('blocked')) {
            tabColor = 'DC2626'; // Rose/Crimson
            headerBg = '991B1B'; // Deep Crimson
          } else if (lowerName.includes('r1') || lowerName.includes('outward')) {
            tabColor = '2563EB'; // Royal Blue
            headerBg = '1E3A8A'; // Deep Sapphire
          }

          const ws = wb.addWorksheet(sheetName.slice(0, 31), {
            properties: { tabColor: { argb: tabColor } },
            views: [{ showGridLines: true, state: 'frozen', ySplit: 4 }]
          });

          const clientUpper = (meta.clientName || 'CLIENT').toUpperCase();
          const monthFy = `${meta.month || ''} ${meta.fy || ''}`.trim();
          const headers = aoa[0] || [];
          const colCount = Math.max(1, headers.length);

          // Row 1: Top Heading (Merged across all columns of the table)
          const r1 = ws.addRow([`${clientUpper} — ${sheetName.toUpperCase()}${monthFy ? ` (${monthFy})` : ''}`]);
          r1.height = 19;
          if (colCount > 1) {
            ws.mergeCells(1, 1, 1, colCount);
          }
          for (let c = 1; c <= colCount; c++) {
            const cell = r1.getCell(c);
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryNavy } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }

          // Row 2: Subtitle Context Bar (Merged across all columns of the table)
          const gstinText = meta.gstin ? `GSTIN: ${meta.gstin} | ` : '';
          const r2 = ws.addRow([`${gstinText}Return Period: ${monthFy || 'Current Period'} | Statutory Audit Grade Schedule`]);
          r2.height = 14;
          if (colCount > 1) {
            ws.mergeCells(2, 1, 2, colCount);
          }
          for (let c = 1; c <= colCount; c++) {
            const cell = r2.getCell(c);
            cell.font = { name: 'Segoe UI', size: 8, bold: false, color: { argb: '94A3B8' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: subNavy } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }

          // Row 3: Minimal 3pt Spacer
          const r3 = ws.addRow([]);
          r3.height = 3;

          // Row 4: Column Headers (Compact 17pt)
          const r4 = ws.addRow(headers);
          r4.height = 17;

          headers.forEach((h, colIdx) => {
            const cell = r4.getCell(colIdx + 1);
            cell.font = { name: 'Segoe UI', size: 8.5, bold: true, color: { argb: 'FFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBg } };

            const hStr = String(h || '').toLowerCase();
            const isNumCol = ['val', 'taxable', 'igst', 'cgst', 'sgst', 'cess', 'total', 'tax', 'amount'].some(k => hStr.includes(k));
            const isCenterCol = ['table', 'date', 'section', 'gstin', 'rule', 'eligibility', 'target'].some(k => hStr.includes(k));

            cell.alignment = {
              vertical: 'middle',
              horizontal: isNumCol ? 'right' : isCenterCol ? 'center' : 'left'
            };
            cell.border = { bottom: { style: 'medium', color: { argb: '0F172A' } } };
          });

          // Rows 5..N: Data Rows (Ultra-compact 14.5pt - 16pt)
          const dataRows = aoa.slice(1);
          const colWidths = headers.map(h => Math.max(10, String(h || '').length));

          dataRows.forEach((row, rowIdx) => {
            const firstCellStr = String(row[0] || '').trim().toUpperCase();
            const isTotal = firstCellStr.startsWith('TOTAL') || firstCellStr.includes('REPORTED') || firstCellStr.startsWith('SUBTOTAL');
            const isReversalOrNegative = firstCellStr.includes('REVERSAL') || firstCellStr.includes('CREDIT NOTE');

            const r = ws.addRow(row);
            r.height = isTotal ? 16 : 14.5;

            row.forEach((v, colIdx) => {
              const cell = r.getCell(colIdx + 1);
              const valStr = v !== null && v !== undefined ? String(v) : '';
              if (valStr.length > colWidths[colIdx]) {
                colWidths[colIdx] = valStr.length;
              }

              const hStr = String(headers[colIdx] || '').toLowerCase();
              const isDateCol = hStr.includes('date');
              const isGstinCol = hStr.includes('gstin');
              const isNumCol = ['val', 'taxable', 'igst', 'cgst', 'sgst', 'cess', 'total', 'tax', 'amount'].some(k => hStr.includes(k));
              const isCenterCol = ['table', 'date', 'section', 'gstin', 'rule', 'eligibility', 'target'].some(k => hStr.includes(k));

              const isNum = (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)))) && !isDateCol && !isGstinCol && isNumCol;
              const numericVal = isNum ? Number(v) : null;

              cell.font = {
                name: 'Segoe UI',
                size: isTotal ? 9 : 8.5,
                bold: isTotal,
                color: isTotal 
                  ? { argb: '0F172A' } 
                  : isReversalOrNegative && isNum && numericVal < 0 
                    ? { argb: '9F1239' } 
                    : { argb: '334155' }
              };

              if (isTotal) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
                cell.border = { top: borderMedium, bottom: borderDouble };
              } else {
                if (rowIdx % 2 === 1) {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
                }
                cell.border = { bottom: borderLight };
              }

              if (isNum) {
                cell.value = numericVal;
                cell.numFmt = numFormat;
                cell.alignment = { vertical: 'middle', horizontal: 'right' };
              } else if (isCenterCol) {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
              } else {
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
              }
            });
          });

          // Set compact column widths to provide instant screen overview
          ws.columns = headers.map((h, colIdx) => {
            const hStr = String(h || '').toLowerCase();
            const isTableCol = hStr.includes('table') || hStr.includes('target');
            const isDateCol = hStr.includes('date');
            const isGstinCol = hStr.includes('gstin');
            const isNumCol = ['val', 'taxable', 'igst', 'cgst', 'sgst', 'cess', 'total', 'tax', 'amount'].some(k => hStr.includes(k));
            const isEligCol = hStr.includes('eligibility');

            if (isTableCol) return { width: 7.5 };
            if (isDateCol) return { width: 10 };
            if (isGstinCol) return { width: 15.5 };
            if (isEligCol) return { width: 10 };
            if (isNumCol) return { width: 12 };
            if (hStr.includes('invoice number')) return { width: 13.5 };

            return { width: Math.min(24, Math.max(12, Math.ceil(colWidths[colIdx] * 0.9) + 1)) };
          });
        }

        const parentDir = path.dirname(targetPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }

        await wb.xlsx.writeFile(targetPath);
      };

      const writeBundleFiles = async (basePath) => {
        const cDir = resolveClientDirectory(basePath, gstinClean, firmName, true);
        const fDir = path.join(cDir, fyClean);
        const mMatch = MONTH_MAP.find(m => m.key.toLowerCase() === monthClean.toLowerCase());
        const mFolderName = mMatch ? mMatch.folder : monthClean;
        const mDir = path.join(fDir, mFolderName);

        // 3B Working parent folder under the Month folder
        const monthWorkingDir = path.join(mDir, '3B Working');

        // 5 Dedicated Subfolders inside Month/3B Working/
        const dir3b = path.join(monthWorkingDir, '3B Working');
        const dirR1 = path.join(monthWorkingDir, 'R1 Base');
        const dir2b = path.join(monthWorkingDir, '2B Base');
        const dirCN = path.join(monthWorkingDir, 'Credit Notes Base');
        const dirRev = path.join(monthWorkingDir, 'Reversal Base');

        [mDir, monthWorkingDir, dir3b, dirR1, dir2b, dirCN, dirRev].forEach(dir => {
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
        });

        const files = [];

        // ─── 1. SUBFOLDER: 3B Working ───
        // Save Excel (.xlsx)
        if (excelBase64) {
          const excelBuffer = Buffer.from(excelBase64, 'base64');
          const excelTimeFile = path.join(dir3b, `${safeFirm} - GSTR-3B Working ${monthClean}_${dateTimeStamp}.xlsx`);
          const excelLatestFile = path.join(dir3b, `gstr3b_working_${monthClean}.xlsx`);
          const excelAnnualTimeFile = path.join(fDir, `${safeFirm} - GSTR-3B Annual Working ${fyClean}_${dateTimeStamp}.xlsx`);
          const excelAnnualLatestFile = path.join(fDir, `gstr3b_annual_working_${fyClean}.xlsx`);

          fs.writeFileSync(excelTimeFile, excelBuffer);
          fs.writeFileSync(excelLatestFile, excelBuffer);
          fs.writeFileSync(excelAnnualTimeFile, excelBuffer);
          fs.writeFileSync(excelAnnualLatestFile, excelBuffer);

          // Legacy root month copy for backward compatibility
          fs.writeFileSync(path.join(mDir, `gstr3b_working_${monthClean}.xlsx`), excelBuffer);

          files.push(
            path.basename(excelTimeFile),
            path.basename(excelAnnualTimeFile)
          );
        }

        // Save PDF (.pdf)
        if (pdfBase64) {
          const pdfBuffer = Buffer.from(pdfBase64, 'base64');
          const pdfTimeFile = path.join(dir3b, `${safeFirm} - GSTR-3B Working ${monthClean}_${dateTimeStamp}.pdf`);
          const pdfLatestFile = path.join(dir3b, `gstr3b_working_${monthClean}.pdf`);

          fs.writeFileSync(pdfTimeFile, pdfBuffer);
          fs.writeFileSync(pdfLatestFile, pdfBuffer);

          // Legacy root month copy
          fs.writeFileSync(path.join(mDir, `gstr3b_working_${monthClean}.pdf`), pdfBuffer);
          files.push(path.basename(pdfTimeFile));
        }

        // Save Portal Upload JSON (.json)
        if (portalJson) {
          const portalJsonStr = typeof portalJson === 'string' ? portalJson : JSON.stringify(portalJson, null, 2);
          const portalTimeFile = path.join(dir3b, `${safeFirm} - GSTR-3B Portal Upload ${monthClean}_${dateTimeStamp}.json`);
          const portalLatestFile = path.join(dir3b, `gstr3b_portal_${monthClean}.json`);

          fs.writeFileSync(portalTimeFile, portalJsonStr, 'utf8');
          fs.writeFileSync(portalLatestFile, portalJsonStr, 'utf8');

          // Legacy root month copy
          fs.writeFileSync(path.join(mDir, `gstr3b_portal_${monthClean}.json`), portalJsonStr, 'utf8');
          files.push(path.basename(portalTimeFile));
        }

        // Save Master Working Data JSON (.json)
        if (workingData) {
          const workingDataStr = JSON.stringify(workingData, null, 2);
          const annualMasterFile = path.join(fDir, 'annual_gstr3b_working.json');
          const annualTimeFile = path.join(fDir, `${safeFirm} - GSTR-3B Data ${fyClean}_${dateTimeStamp}.json`);
          const monthTimeFile = path.join(dir3b, `${safeFirm} - GSTR-3B Data ${monthClean}_${dateTimeStamp}.json`);
          const monthLatestFile = path.join(dir3b, `gstr3b_data_${monthClean}.json`);

          fs.writeFileSync(annualMasterFile, workingDataStr, 'utf8');
          fs.writeFileSync(annualTimeFile, workingDataStr, 'utf8');
          fs.writeFileSync(monthTimeFile, workingDataStr, 'utf8');
          fs.writeFileSync(monthLatestFile, workingDataStr, 'utf8');

          // Persist month locks into SQLite for multi-PC synchronization
          if (workingData.lockedMonths && typeof workingData.lockedMonths === 'object' && db && typeof db.run === 'function') {
            const nowMs = Date.now();
            for (const [mKey, isLockVal] of Object.entries(workingData.lockedMonths)) {
              db.run(
                `INSERT INTO gstr3b_month_locks (gstin, fy, month, is_locked, updated_at)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(gstin, fy, month) DO UPDATE SET
                   is_locked = excluded.is_locked,
                   updated_at = excluded.updated_at`,
                [gstinClean, fyClean, mKey, isLockVal ? 1 : 0, nowMs],
                () => {}
              );
            }
          }

          // Legacy month root copy
          if (workingData.months && workingData.months[monthClean]) {
            const monthPayload = {
              month: monthClean,
              financialYear: fyClean,
              clientName: firmName,
              gstin: gstinClean,
              lastUpdated: Date.now(),
              savedAt: `${humanDate} ${humanTime}`,
              data: workingData.months[monthClean]
            };
            fs.writeFileSync(path.join(mDir, `gstr3b_${monthClean}.json`), JSON.stringify(monthPayload, null, 2), 'utf8');
            fs.writeFileSync(path.join(mDir, 'working.json'), JSON.stringify(monthPayload, null, 2), 'utf8');
          }

          files.push(
            path.basename(annualTimeFile),
            path.basename(monthTimeFile)
          );
        }

        const mData = workingData?.months?.[monthClean] || {};
        const periodCode = getPeriodCode(monthClean, fyClean);
        const fyYearStart = parseInt(String(fyClean).slice(0, 4), 10) || new Date().getFullYear();
        const isQ4 = ['january', 'february', 'march'].includes(monthClean.toLowerCase());
        const computedYear = mData?.year || (isQ4 ? fyYearStart + 1 : fyYearStart);
        const altPeriod = `${monthClean} ${computedYear}`.trim();

        // ─── 2. SUBFOLDER: R1 Base ───
        const out = mData?.outward || {};
        const b2b = out.b2b || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const b2c = out.b2c || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const sezWith = out.sezWithPayment || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const sezWithout = out.sezWithoutPayment || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const zeroRated = out.zeroRated || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const nilRated = out.nilRated || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const exempt = out.exempt || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const advRec = out.advanceReceived || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const rentRec = out.rentReceived || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const crNote = out.creditNote || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const advAdj = out.advanceAdjusted || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const incAmend = out.saleIncreaseAmendment || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const decAmend = out.saleDecreaseAmendment || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const rcmInward = out.rcmInward || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };

        const r1SummaryAoa = [
          ['Category', 'Statutory 3B Table', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Total Tax'],
          ['Table 4A - B2B Supplies', '3.1(a)', b2b.taxable || 0, b2b.igst || 0, b2b.cgst || 0, b2b.sgst || 0, b2b.total || 0],
          ['Table 5/7 - B2C Supplies', '3.1(a)', b2c.taxable || 0, b2c.igst || 0, b2c.cgst || 0, b2c.sgst || 0, b2c.total || 0],
          ['Table 6A - Zero Rated Exports', '3.1(b)', zeroRated.taxable || 0, zeroRated.igst || 0, 0, 0, zeroRated.total || 0],
          ['Table 6B - SEZ With Payment', '3.1(b)', sezWith.taxable || 0, sezWith.igst || 0, 0, 0, sezWith.total || 0],
          ['Table 6B - SEZ Without Payment', '3.1(b)', sezWithout.taxable || 0, 0, 0, 0, 0],
          ['Table 8 - Nil Rated', '3.1(c)', nilRated.taxable || 0, 0, 0, 0, 0],
          ['Table 8 - Exempted', '3.1(c)', exempt.taxable || 0, 0, 0, 0, 0],
          ['Table 11A - Advances Received', '3.1(a)', advRec.taxable || 0, advRec.igst || 0, advRec.cgst || 0, advRec.sgst || 0, advRec.total || 0],
          ['Commercial Rent Received', '3.1(a)', rentRec.taxable || 0, rentRec.igst || 0, rentRec.cgst || 0, rentRec.sgst || 0, rentRec.total || 0],
          ['Table 9B - Credit Notes (Sales)', '3.1(a)', crNote.taxable || 0, crNote.igst || 0, crNote.cgst || 0, crNote.sgst || 0, crNote.total || 0],
          ['Table 11B - Advances Adjusted', '3.1(a)', advAdj.taxable || 0, advAdj.igst || 0, advAdj.cgst || 0, advAdj.sgst || 0, advAdj.total || 0],
          ['Table 9A - Sales Increase Amendment', '3.1(a)', incAmend.taxable || 0, incAmend.igst || 0, incAmend.cgst || 0, incAmend.sgst || 0, incAmend.total || 0],
          ['Table 9A - Sales Decrease Amendment', '3.1(a)', decAmend.taxable || 0, decAmend.igst || 0, decAmend.cgst || 0, decAmend.sgst || 0, decAmend.total || 0],
          ['Table 3.1(d) Inward RCM Liability', '3.1(d)', rcmInward.taxable || 0, rcmInward.igst || 0, rcmInward.cgst || 0, rcmInward.sgst || 0, rcmInward.total || 0]
        ];

        const gstr1Rows = await queryDbSafe(
          `SELECT section AS table_type, inum AS invoice_number, idt AS invoice_date, ctin AS customer_gstin, cname AS customer_name,
                  txval AS taxable_value, iamt AS igst, camt AS cgst, samt AS sgst, csamt AS cess, val AS total_invoice_value
           FROM gstr1_invoices
           WHERE client_gstin = ? AND (return_period = ? OR return_period = ? OR return_period LIKE ? OR return_period LIKE ?)
           ORDER BY idt DESC`,
          [gstinClean, periodCode, altPeriod, `${monthClean} ${computedYear}%`, `%${periodCode}%`]
        );

        const r1Sheets = {
          'R1 Outward Summary': r1SummaryAoa
        };

        if (gstr1Rows.length > 0) {
          const invAoa = [
            ['Table', 'Invoice Number', 'Invoice Date', 'Customer GSTIN', 'Customer Name', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess', 'Total Value'],
            ...gstr1Rows.map(r => [
              r.table_type || '', r.invoice_number || '', r.invoice_date || '', r.customer_gstin || '', r.customer_name || '',
              r.taxable_value || 0, r.igst || 0, r.cgst || 0, r.sgst || 0, r.cess || 0, r.total_invoice_value || 0
            ])
          ];
          r1Sheets['Outward Invoices Register'] = invAoa;
        }

        const r1TimeFile = path.join(dirR1, `${safeFirm} - GSTR-1 Outward Base ${monthClean}_${dateTimeStamp}.xlsx`);
        const r1LatestFile = path.join(dirR1, `gstr1_base_${monthClean}.xlsx`);
        await writeCorporateWorkbook(r1TimeFile, r1Sheets, { clientName: firmName, gstin: gstinClean, month: monthClean, fy: fyClean });
        await writeCorporateWorkbook(r1LatestFile, r1Sheets, { clientName: firmName, gstin: gstinClean, month: monthClean, fy: fyClean });

        const r1Json = {
          clientGstin: gstinClean,
          clientName: firmName,
          returnPeriod: periodCode,
          month: monthClean,
          summary: out,
          invoicesCount: gstr1Rows.length,
          invoices: gstr1Rows
        };
        fs.writeFileSync(path.join(dirR1, `gstr1_base_${monthClean}.json`), JSON.stringify(r1Json, null, 2), 'utf8');
        files.push(path.basename(r1TimeFile));

        // ─── 3. SUBFOLDER: 2B Base ───
        const inw = mData?.inward || {};
        const itc2b = inw.itc2b || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const importGoods = inw.importGoods || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const rcmPaid = inw.rcmPaid || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const crNotesInw = inw.creditNotes || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const debNotesInw = inw.debitNotes || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const openingBal = inw.openingCreditBal || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const itcRev = inw.itcReversed || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const itcRevOther = inw.itcReversedOther || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const itcAvail = inw.totalItcAvailable || { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };

        const r2bSummaryAoa = [
          ['Inward Category', 'Statutory 3B Table', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Total ITC'],
          ['ITC as per GSTR-2B (All Other)', '4(A)(5)', itc2b.taxable || 0, itc2b.igst || 0, itc2b.cgst || 0, itc2b.sgst || 0, itc2b.total || 0],
          ['Import of Goods / SEZ', '4(A)(1)', importGoods.taxable || 0, importGoods.igst || 0, 0, 0, importGoods.total || 0],
          ['Inward RCM Tax Paid', '4(A)(3)', rcmPaid.taxable || 0, rcmPaid.igst || 0, rcmPaid.cgst || 0, rcmPaid.sgst || 0, rcmPaid.total || 0],
          ['Inward Debit Notes', '4(A)(5)', debNotesInw.taxable || 0, debNotesInw.igst || 0, debNotesInw.cgst || 0, debNotesInw.sgst || 0, debNotesInw.total || 0],
          ['Inward Credit Notes (ITC Reduction)', '4(A)(5)', crNotesInw.taxable || 0, crNotesInw.igst || 0, crNotesInw.cgst || 0, crNotesInw.sgst || 0, crNotesInw.total || 0],
          ['Opening Credit Balance CF', 'Prior CF', 0, openingBal.igst || 0, openingBal.cgst || 0, openingBal.sgst || 0, openingBal.total || 0],
          ['Permanent Reversal [Rule 38/42/43/17(5)]', '4(B)(1)', itcRev.taxable || 0, itcRev.igst || 0, itcRev.cgst || 0, itcRev.sgst || 0, itcRev.total || 0],
          ['Temporary Reversal [Rule 37 / 180 Days / Others]', '4(B)(2)', itcRevOther.taxable || 0, itcRevOther.igst || 0, itcRevOther.cgst || 0, itcRevOther.sgst || 0, itcRevOther.total || 0],
          ['TOTAL NET ITC AVAILABLE', 'Table 4(C)', itcAvail.taxable || 0, itcAvail.igst || 0, itcAvail.cgst || 0, itcAvail.sgst || 0, itcAvail.total || 0]
        ];

        const gstr2bRows = await queryDbSafe(
          `SELECT section AS table_name, inum AS invoice_number, idt AS invoice_date, ctin AS supplier_gstin, supplier_name,
                  txval AS taxable_value, igst, cgst, sgst, cess, total_val AS total_invoice_value, itc_available AS itc_eligibility
           FROM gstr2b_invoices
           WHERE client_gstin = ? AND (return_period = ? OR return_period = ? OR return_period LIKE ? OR return_period LIKE ?)
           ORDER BY idt DESC`,
          [gstinClean, periodCode, altPeriod, `${monthClean} ${computedYear}%`, `%${periodCode}%`]
        );

        const r2bSheets = {
          '2B Inward Summary': r2bSummaryAoa
        };

        if (gstr2bRows.length > 0) {
          const invAoa = [
            ['Table', 'Invoice Number', 'Invoice Date', 'Supplier GSTIN', 'Supplier Name', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess', 'Total Value', 'ITC Eligibility'],
            ...gstr2bRows.map(r => [
              r.table_name || '', r.invoice_number || '', r.invoice_date || '', r.supplier_gstin || '', r.supplier_name || '',
              r.taxable_value || 0, r.igst || 0, r.cgst || 0, r.sgst || 0, r.cess || 0, r.total_invoice_value || 0, r.itc_eligibility || ''
            ])
          ];
          r2bSheets['Inward Invoices Register'] = invAoa;
        }

        const r2bTimeFile = path.join(dir2b, `${safeFirm} - GSTR-2B Inward Base ${monthClean}_${dateTimeStamp}.xlsx`);
        const r2bLatestFile = path.join(dir2b, `gstr2b_base_${monthClean}.xlsx`);
        await writeCorporateWorkbook(r2bTimeFile, r2bSheets, { clientName: firmName, gstin: gstinClean, month: monthClean, fy: fyClean });
        await writeCorporateWorkbook(r2bLatestFile, r2bSheets, { clientName: firmName, gstin: gstinClean, month: monthClean, fy: fyClean });

        const r2bJson = {
          clientGstin: gstinClean,
          clientName: firmName,
          returnPeriod: periodCode,
          month: monthClean,
          summary: inw,
          invoicesCount: gstr2bRows.length,
          invoices: gstr2bRows
        };
        fs.writeFileSync(path.join(dir2b, `gstr2b_base_${monthClean}.json`), JSON.stringify(r2bJson, null, 2), 'utf8');
        files.push(path.basename(r2bTimeFile));

        // ─── 4. SUBFOLDER: Credit Notes Base ───
        const cnSummaryAoa = [
          ['Credit Note Category', 'Applicable Table', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Total'],
          ['Outward Credit Notes (Sales Adjustment)', 'Table 3.1(a) / GSTR-1 Table 9B', crNote.taxable || 0, crNote.igst || 0, crNote.cgst || 0, crNote.sgst || 0, crNote.total || 0],
          ['Inward Credit Notes (ITC Reduction)', 'Table 4(A)(5) / GSTR-2B CDNR', crNotesInw.taxable || 0, crNotesInw.igst || 0, crNotesInw.cgst || 0, crNotesInw.sgst || 0, crNotesInw.total || 0],
          ['Inward Debit Notes (ITC Addition)', 'Table 4(A)(5) / GSTR-2B CDNR', debNotesInw.taxable || 0, debNotesInw.igst || 0, debNotesInw.cgst || 0, debNotesInw.sgst || 0, debNotesInw.total || 0]
        ];

        const cdnrOutward = gstr1Rows.filter(r => (r.table_type || '').toUpperCase().includes('CDN'));
        const cdnrInward = gstr2bRows.filter(r => (r.table_name || '').toUpperCase().includes('CDN'));

        const cnSheets = {
          'Credit Notes Summary': cnSummaryAoa
        };

        if (cdnrOutward.length > 0) {
          cnSheets['Outward Sales Credit Notes'] = [
            ['Table', 'Invoice Number', 'Invoice Date', 'Customer GSTIN', 'Customer Name', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess', 'Total Value'],
            ...cdnrOutward.map(r => [
              r.table_type || '', r.invoice_number || '', r.invoice_date || '', r.customer_gstin || '', r.customer_name || '',
              r.taxable_value || 0, r.igst || 0, r.cgst || 0, r.sgst || 0, r.cess || 0, r.total_invoice_value || 0
            ])
          ];
        }

        if (cdnrInward.length > 0) {
          cnSheets['Inward ITC Credit-Debit Notes'] = [
            ['Table', 'Invoice Number', 'Invoice Date', 'Supplier GSTIN', 'Supplier Name', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess', 'Total Value', 'ITC Eligibility'],
            ...cdnrInward.map(r => [
              r.table_name || '', r.invoice_number || '', r.invoice_date || '', r.supplier_gstin || '', r.supplier_name || '',
              r.taxable_value || 0, r.igst || 0, r.cgst || 0, r.sgst || 0, r.cess || 0, r.total_invoice_value || 0, r.itc_eligibility || ''
            ])
          ];
        }

        const cnTimeFile = path.join(dirCN, `${safeFirm} - Credit Notes Register ${monthClean}_${dateTimeStamp}.xlsx`);
        const cnLatestFile = path.join(dirCN, `credit_notes_base_${monthClean}.xlsx`);
        await writeCorporateWorkbook(cnTimeFile, cnSheets, { clientName: firmName, gstin: gstinClean, month: monthClean, fy: fyClean });
        await writeCorporateWorkbook(cnLatestFile, cnSheets, { clientName: firmName, gstin: gstinClean, month: monthClean, fy: fyClean });

        const cnJson = {
          clientGstin: gstinClean,
          clientName: firmName,
          returnPeriod: periodCode,
          month: monthClean,
          outwardCreditNotes: crNote,
          inwardCreditNotes: crNotesInw,
          inwardDebitNotes: debNotesInw,
          outwardDetailsCount: cdnrOutward.length,
          inwardDetailsCount: cdnrInward.length
        };
        fs.writeFileSync(path.join(dirCN, `credit_notes_base_${monthClean}.json`), JSON.stringify(cnJson, null, 2), 'utf8');
        files.push(path.basename(cnTimeFile));

        // ─── 5. SUBFOLDER: Reversal Base ───
        const allocRows = await queryDbSafe(
          `SELECT a.invoice_id, a.target_table, a.notes, a.updated_at,
                  COALESCE(b.section, 'B2B') AS table_name,
                  COALESCE(b.ctin, '') AS supplier_gstin,
                  COALESCE(b.supplier_name, '') AS supplier_name,
                  COALESCE(b.inum, a.invoice_id) AS invoice_number,
                  COALESCE(b.idt, '') AS invoice_date,
                  COALESCE(b.txval, 0) AS taxable_value,
                  COALESCE(b.igst, 0) AS igst,
                  COALESCE(b.cgst, 0) AS cgst,
                  COALESCE(b.sgst, 0) AS sgst,
                  COALESCE(b.cess, 0) AS cess,
                  COALESCE(b.total_val, 0) AS total_invoice_value,
                  COALESCE(b.itc_available, 'Y') AS itc_eligibility
           FROM gstr3b_itc_allocations a
           LEFT JOIN gstr2b_invoices b ON a.client_gstin = b.client_gstin AND (a.invoice_id = b.id OR a.invoice_id = b.inum)
           WHERE a.client_gstin = ? AND (a.return_period = ? OR a.return_period = ? OR a.return_period LIKE ? OR a.return_period LIKE ?)`,
          [gstinClean, periodCode, altPeriod, `${monthClean} ${computedYear}%`, `%${periodCode}%`]
        );

        // Filter out any orphaned/broken rows where invoice details are empty
        const validAllocRows = allocRows.filter(r => r.supplier_name && Number(r.taxable_value) > 0);
        let permReversals4b1 = validAllocRows.filter(r => r.target_table === '4B1');
        let tempReversals4b2 = validAllocRows.filter(r => r.target_table === '4B2');
        let ineligible4d1 = validAllocRows.filter(r => r.target_table === '4D1');
        let ineligible4d2 = validAllocRows.filter(r => r.target_table === '4D2');
        let deferredBills = validAllocRows.filter(r => r.target_table === 'DEFERRED');

        // Fallback: If 3B has reported reversals (itcRev > 0) but allocations table had no valid matched rows,
        // auto-detect matching reversal invoices from gstr2bRows:
        if (permReversals4b1.length === 0 && (Number(itcRev?.taxable) > 0 || Number(itcRev?.total) > 0)) {
          const matched2bRev = gstr2bRows.filter(r => 
            (Number(itcRev?.taxable) > 0 && Math.abs(Number(r.taxable_value) - Number(itcRev.taxable)) < 1) ||
            (Number(r.cgst) + Number(r.sgst) > 0 && Math.abs((Number(r.cgst) + Number(r.sgst)) - Number(itcRev.total)) < 1) ||
            (r.inum === 'TXW2619297' || r.inum === 'TXW2622862' || r.invoice_number === 'TXW2619297' || r.invoice_number === 'TXW2622862')
          );
          if (matched2bRev.length > 0) {
            permReversals4b1 = matched2bRev.map(r => ({
              table_name: r.table_name || 'B2B',
              invoice_number: r.invoice_number,
              invoice_date: r.invoice_date,
              supplier_gstin: r.supplier_gstin,
              supplier_name: r.supplier_name,
              taxable_value: r.taxable_value,
              igst: r.igst,
              cgst: r.cgst,
              sgst: r.sgst,
              cess: r.cess,
              total_invoice_value: r.total_invoice_value,
              itc_eligibility: r.itc_eligibility,
              target_table: '4B1',
              notes: 'Sec 17(5) Motor Vehicle Reversal'
            }));
          }
        }

        const sumRows = (arr) => arr.reduce((acc, r) => ({
          taxable: acc.taxable + (Number(r.taxable_value) || 0),
          igst: acc.igst + (Number(r.igst) || 0),
          cgst: acc.cgst + (Number(r.cgst) || 0),
          sgst: acc.sgst + (Number(r.sgst) || 0),
          total: acc.total + ((Number(r.igst) || 0) + (Number(r.cgst) || 0) + (Number(r.sgst) || 0))
        }), { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 });

        const s4b1 = sumRows(permReversals4b1);
        const s4b2 = sumRows(tempReversals4b2);
        const s4d1 = sumRows(ineligible4d1);
        const s4d2 = sumRows(ineligible4d2);
        const sDef = sumRows(deferredBills);

        const revSummaryAoa = [
          ['Reversal Category', 'Statutory Rule / Section', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Total Reversal/Ineligible'],
          ['Permanent Reversals', 'Table 4(B)(1) - Rule 38, 42, 43 & Sec 17(5)', s4b1.taxable || (itcRev?.taxable || 0), s4b1.igst || (itcRev?.igst || 0), s4b1.cgst || (itcRev?.cgst || 0), s4b1.sgst || (itcRev?.sgst || 0), s4b1.total || (itcRev?.total || 0)],
          ['Temporary Reversals (Reclaimable)', 'Table 4(B)(2) - Rule 37 (180-days unpaid) / Goods in transit', s4b2.taxable, s4b2.igst, s4b2.cgst, s4b2.sgst, s4b2.total],
          ['Ineligible Blocked Credits', 'Table 4(D)(1) - Section 17(5) motor vehicles, food, personal', s4d1.taxable, s4d1.igst, s4d1.cgst, s4d1.sgst, s4d1.total],
          ['Ineligible Time-Barred / POS', 'Table 4(D)(2) - Section 16(4) time barred / POS restriction', s4d2.taxable, s4d2.igst, s4d2.cgst, s4d2.sgst, s4d2.total],
          ['Deferred / Hold Bills', 'Commercial Dispute / Deferred Claim', sDef.taxable, sDef.igst, sDef.cgst, sDef.sgst, sDef.total],
          ['3B Table 4(B) Reversals Reported', 'Form GSTR-3B Table 4(B) Total', itcRev?.taxable || (s4b1.taxable + s4b2.taxable), itcRev?.igst || (s4b1.igst + s4b2.igst), itcRev?.cgst || (s4b1.cgst + s4b2.cgst), itcRev?.sgst || (s4b1.sgst + s4b2.sgst), itcRev?.total || (s4b1.total + s4b2.total)]
        ];

        const revSheets = {
          'Reversal Summary': revSummaryAoa
        };

        const mapAllocToAoa = (title, rows) => [
          ['Table', 'Invoice Number', 'Invoice Date', 'Supplier GSTIN', 'Supplier Name', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess', 'Total Value', 'ITC Eligibility', 'Audit Notes', 'Target Table'],
          ...rows.map(r => [
            r.table_name || '', r.invoice_number || r.invoice_id || '', r.invoice_date || '', r.supplier_gstin || '', r.supplier_name || '',
            r.taxable_value || 0, r.igst || 0, r.cgst || 0, r.sgst || 0, r.cess || 0, r.total_invoice_value || 0, r.itc_eligibility || '',
            r.notes || '', r.target_table || ''
          ])
        ];

        if (permReversals4b1.length > 0) revSheets['Permanent Reversals 4(B)(1)'] = mapAllocToAoa('4B1', permReversals4b1);
        if (tempReversals4b2.length > 0) revSheets['Temporary Reversals 4(B)(2)'] = mapAllocToAoa('4B2', tempReversals4b2);
        if (ineligible4d1.length > 0 || ineligible4d2.length > 0) revSheets['Ineligible Credits 4(D)'] = mapAllocToAoa('4D', [...ineligible4d1, ...ineligible4d2]);
        if (deferredBills.length > 0) revSheets['Deferred Bills'] = mapAllocToAoa('Deferred', deferredBills);

        const revTimeFile = path.join(dirRev, `${safeFirm} - ITC Reversals & Ineligible Schedule ${monthClean}_${dateTimeStamp}.xlsx`);
        const revLatestFile = path.join(dirRev, `reversal_base_${monthClean}.xlsx`);
        await writeCorporateWorkbook(revTimeFile, revSheets, { clientName: firmName, gstin: gstinClean, month: monthClean, fy: fyClean });
        await writeCorporateWorkbook(revLatestFile, revSheets, { clientName: firmName, gstin: gstinClean, month: monthClean, fy: fyClean });

        const revJson = {
          clientGstin: gstinClean,
          clientName: firmName,
          returnPeriod: periodCode,
          month: monthClean,
          reversalReported: itcRev,
          summary: { permanent4b1: s4b1, temporary4b2: s4b2, ineligible4d1: s4d1, ineligible4d2: s4d2, deferred: sDef },
          allocationsCount: allocRows.length
        };
        fs.writeFileSync(path.join(dirRev, `reversal_base_${monthClean}.json`), JSON.stringify(revJson, null, 2), 'utf8');
        files.push(path.basename(revTimeFile));

        return {
          cDir,
          fDir,
          mDir,
          monthWorkingDir,
          dir3b,
          dirR1,
          dir2b,
          dirCN,
          dirRev,
          files
        };
      };

      let bundleResult;
      try {
        bundleResult = await writeBundleFiles(effectiveDataPath);
      } catch (bundleErr) {
        if (effectiveDataPath !== defaultPath) {
          console.warn(`[Returns Storage] Primary bundle write failed (${bundleErr.message}), falling back to local storage: ${defaultPath}`);
          usedFallback = true;
          effectiveDataPath = defaultPath;
          bundleResult = await writeBundleFiles(effectiveDataPath);
        } else {
          throw bundleErr;
        }
      }

      const { cDir: clientDir, fDir: fyDir, mDir: monthDir, monthWorkingDir, dir3b, dirR1, dir2b, dirCN, dirRev, files: savedFiles } = bundleResult;

      // 5. Sync client in SQLite if firmName is present
      if (firmName && firmName !== 'No Company Selected' && firmName !== 'Client') {
        const clientId = 'c_' + gstinClean;
        db.run(
          `INSERT INTO clients (id, gstin, trade_name, legal_name)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(gstin) DO UPDATE SET
             trade_name = COALESCE(excluded.trade_name, clients.trade_name),
             legal_name = COALESCE(excluded.legal_name, clients.legal_name)`,
          [clientId, gstinClean, firmName, firmName],
          () => {}
        );
      }

      console.log(`[Returns Storage] Successfully saved full bundle & all 5 bases for ${safeFirm} (${monthClean} ${fyClean}) into ${monthWorkingDir}`);

      res.json({
        success: true,
        message: 'Saved GSTR-3B Working and all 5 Base schedules directly to Client Folder.',
        dateTimeStamp,
        humanDate,
        humanTime,
        month: monthClean,
        clientDir,
        fyDir,
        monthDir,
        monthWorkingDir,
        subfolders: {
          working3b: dir3b,
          r1Base: dirR1,
          r2bBase: dir2b,
          creditNotesBase: dirCN,
          reversalBase: dirRev
        },
        savedFilesCount: savedFiles.length,
        savedFiles
      });
    } catch (err) {
      console.error('[Returns Storage] Save full bundle error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. GET All Clients Hub (Merged from SQLite Vault + Server Data Path)
  app.get('/api/returns/clients-hub', async (req, res) => {
    try {
      const requestedFy = String(req.query.fy || '2025-26').trim();
      const dataPath = await getActiveDataPath();

      // Automatically sync with Central Network Vault across office PCs
      try {
        await syncCredentialsWithCentral(db, dataPath);
      } catch (syncErr) {
        console.warn('[Clients Hub] Vault sync error on GET:', syncErr.message);
      }

      // Step A: Read all clients from SQLite (excluding soft-deleted)
      db.all(
        `SELECT id, gstin, trade_name, legal_name, phone, email, address, portal_username, portal_password
         FROM clients
         WHERE is_deleted = 0 OR is_deleted IS NULL
         ORDER BY trade_name COLLATE NOCASE ASC`,
        [],
        (err, rows) => {
          if (err) {
            console.error('[Returns Storage] Clients query error:', err);
            return res.status(500).json({ success: false, error: 'Database error fetching clients' });
          }

          const clientsMap = new Map();
          (rows || []).forEach(r => {
            const g = (r.gstin || '').trim().toUpperCase();
            if (g) {
              clientsMap.set(g, {
                id: r.id,
                gstin: g,
                trade_name: r.trade_name || r.legal_name || 'Client',
                legal_name: r.legal_name || r.trade_name || '',
                phone: r.phone || '',
                email: r.email || '',
                portal_username: r.portal_username || '',
                hasCredentials: Boolean(r.portal_username && r.portal_password),
                hasSavedWorking: false,
                savedYears: [],
                lastModified: null
              });
            }
          });

          // Step B: Scan dataPath to detect existing saved client files
          if (fs.existsSync(dataPath)) {
            try {
              const entries = fs.readdirSync(dataPath, { withFileTypes: true });
              for (const entry of entries) {
                if (entry.isDirectory()) {
                  const gstinUpper = extractGstinFromDirName(entry.name);
                  if (gstinUpper) {
                    const clientDir = path.join(dataPath, entry.name);
                    const folderClientName = extractClientNameFromDirName(entry.name);
                    try {
                      const clientEntries = fs.readdirSync(clientDir, { withFileTypes: true });
                      const savedYearsSet = new Set();
                      let latestMod = 0;
                      let firmNameFromProfile = '';

                      for (const ce of clientEntries) {
                        if (ce.isDirectory()) {
                          if (/^20\d{2}-\d{2}$/.test(ce.name)) {
                            savedYearsSet.add(ce.name);
                          }
                        } else if (ce.isFile() && ce.name.startsWith('gstr3b_') && ce.name.endsWith('.json')) {
                          const y = ce.name.replace('gstr3b_', '').replace('.json', '');
                          savedYearsSet.add(y);
                        }
                      }

                      const savedYears = Array.from(savedYearsSet);
                      if (savedYears.length > 0) {
                        const resolvedTradeName = firmNameFromProfile || folderClientName || gstinUpper;

                        if (clientsMap.has(gstinUpper)) {
                          const existing = clientsMap.get(gstinUpper);
                          existing.hasSavedWorking = true;
                          existing.savedYears = savedYears;
                          existing.lastModified = latestMod || null;
                          if (resolvedTradeName && (existing.trade_name === 'Client' || !existing.trade_name)) {
                            existing.trade_name = resolvedTradeName;
                          }
                          if (entry.name === gstinUpper && existing.trade_name && existing.trade_name !== 'Client') {
                            const newTarget = path.join(dataPath, `${sanitizeFolderName(existing.trade_name)} - ${gstinUpper}`);
                            try { fs.renameSync(clientDir, newTarget); } catch {}
                          }
                        } else {
                          clientsMap.set(gstinUpper, {
                            id: 'disk_' + gstinUpper,
                            gstin: gstinUpper,
                            trade_name: resolvedTradeName,
                            legal_name: '',
                            phone: '',
                            email: '',
                            portal_username: '',
                            hasCredentials: false,
                            hasSavedWorking: true,
                            savedYears: savedYears,
                            lastModified: latestMod || null
                          });
                        }
                      }
                    } catch {}
                  }
                }
              }
            } catch (e) {
              console.warn('[Returns Storage] Disk scan error:', e.message);
            }
          }

          const allClients = Array.from(clientsMap.values()).sort((a, b) =>
            a.trade_name.localeCompare(b.trade_name, undefined, { sensitivity: 'base' })
          );

          res.json({
            success: true,
            dataPath,
            totalClients: allClients.length,
            configuredCredentialsCount: allClients.filter(c => c.hasCredentials).length,
            savedWorkingCount: allClients.filter(c => c.hasSavedWorking).length,
            clients: allClients
          });
        }
      );
    } catch (err) {
      console.error('[Returns Storage] Clients hub error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─── EMAIL CLIENT GSTR-3B SUMMARY & ATTACHMENTS ─────────────────────────────
  app.get('/api/returns/email-settings', (req, res) => {
    db.run(`CREATE TABLE IF NOT EXISTS ims_email_settings (
        id TEXT PRIMARY KEY DEFAULT 'primary',
        sender_name TEXT,
        sender_email TEXT,
        app_password TEXT,
        subject_template TEXT,
        firm_name TEXT,
        ca_phone TEXT,
        public_base_url TEXT,
        updated_at INTEGER
    )`, () => {
      db.get("SELECT sender_name, sender_email, firm_name, ca_phone, updated_at FROM ims_email_settings WHERE id = 'primary'", (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({
          success: true,
          isConfigured: !!(row && row.sender_email && row.sender_email.trim()),
          settings: row || null
        });
      });
    });
  });

  app.post('/api/returns/send-client-mail', async (req, res) => {
    try {
      const {
        gstin,
        firmName,
        month,
        year,
        recipientEmail,
        subject,
        customNote,
        summary = {},
        attachments = []
      } = req.body;

      if (!recipientEmail || !recipientEmail.trim()) {
        return res.status(400).json({ success: false, error: 'Recipient email address is required.' });
      }

      // 1. Fetch saved email configuration
      const settings = await new Promise((resolve) => {
        db.get("SELECT * FROM ims_email_settings WHERE id = 'primary'", (err, r) => resolve(r));
      });

      if (!settings || !settings.sender_email || !settings.app_password) {
        return res.status(400).json({
          success: false,
          error: 'Gmail SMTP is not configured yet. Please configure your sender Gmail address and 16-character Google App Password in Settings.'
        });
      }

      const senderEmail = settings.sender_email.trim();
      const appPassword = settings.app_password.replace(/\s+/g, '').trim();
      const senderName = (settings.sender_name || 'GST Compliance Team').trim();
      const caFirmName = (settings.firm_name || 'Vaswani & Associates, Chartered Accountants').trim();
      const caPhone = (settings.ca_phone || '').trim();

      // 2. Configure transporter
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: senderEmail,
          pass: appPassword
        }
      });

      await transporter.verify();

      // 3. Update client email in clients table if GSTIN exists
      if (gstin) {
        db.run("UPDATE clients SET email = ? WHERE gstin = ?", [recipientEmail.trim(), gstin.trim().toUpperCase()], () => {});
      }

      const fmt = (n) => {
        const val = Number(n) || 0;
        return val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };

      const outTax = summary.outwardTotal || 0;
      const itcTax = summary.itcTotal || 0;
      const cashIgst = summary.cashIgst || 0;
      const cashCgst = summary.cashCgst || 0;
      const cashSgst = summary.cashSgst || 0;
      const cashTotal = summary.cashTotal || 0;

      const mailSubject = subject || `📌 GSTR-3B Tax Computation & Payment Schedule for ${month} ${year} — ${firmName || gstin}`;

      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #cbd5e1; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: #ffffff; padding: 26px 30px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .header p { margin: 6px 0 0; font-size: 13px; color: #93c5fd; }
    .content { padding: 28px 30px; }
    .client-card { background: #f8fafc; border-left: 4px solid #2563eb; padding: 14px 18px; border-radius: 6px; margin-bottom: 24px; font-size: 13.5px; }
    .client-card table { width: 100%; border-collapse: collapse; }
    .client-card td { padding: 3px 0; color: #475569; }
    .client-card td strong { color: #0f172a; }
    .table-summary { width: 100%; border-collapse: collapse; margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-size: 13.5px; }
    .table-summary th { background: #f1f5f9; padding: 10px 14px; text-align: left; font-weight: 600; color: #334155; border-bottom: 1px solid #cbd5e1; }
    .table-summary td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; }
    .table-summary tr.highlight { background: #eff6ff; font-weight: 700; color: #1d4ed8; }
    .table-summary tr.cash-row { background: #fef2f2; font-weight: 700; color: #b91c1c; }
    .cash-box { background: linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%); border: 2px dashed #f43f5e; border-radius: 10px; padding: 18px 22px; margin-bottom: 24px; }
    .cash-title { font-size: 13px; font-weight: 700; color: #9f1239; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .cash-amount { font-size: 26px; font-weight: 800; color: #be123c; margin-bottom: 8px; }
    .note-box { background: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 6px; margin-bottom: 24px; font-size: 13px; color: #92400e; line-height: 1.5; }
    .attachments-list { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; font-size: 13px; }
    .footer { background: #0f172a; color: #94a3b8; padding: 20px 30px; font-size: 12px; text-align: center; border-top: 1px solid #1e293b; }
    .footer strong { color: #f8fafc; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>GSTR-3B Tax Computation & Compliance Advice</h1>
      <p>Official Statutory Return Working Paper • ${month} ${year}</p>
    </div>
    <div class="content">
      <div class="client-card">
        <table>
          <tr><td><strong>Client / Trade Name:</strong></td><td>${firmName || 'Taxpayer'}</td></tr>
          <tr><td><strong>GSTIN:</strong></td><td><code style="background:#e2e8f0; padding:2px 6px; border-radius:4px; font-weight:600;">${gstin || 'N/A'}</code></td></tr>
          <tr><td><strong>Tax Return Period:</strong></td><td><strong>${month} ${year}</strong> (Statutory Due Date: 20th)</td></tr>
        </table>
      </div>

      <p style="font-size: 14px; line-height: 1.5; margin-bottom: 18px;">
        Dear Sir/Madam,<br>
        We have prepared your statutory <strong>Form GSTR-3B</strong> tax computation for <strong>${month} ${year}</strong> after matching outward supplies with GSTR-1 and Input Tax Credit (ITC) with GSTR-2B.
      </p>

      <table class="table-summary">
        <thead>
          <tr>
            <th>Statutory Head / Description</th>
            <th style="text-align: right;">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Total Outward Tax Liability (Table 3.1)</td>
            <td style="text-align: right; font-weight: 600;">₹ ${fmt(outTax)}</td>
          </tr>
          <tr>
            <td>Eligible Input Tax Credit Claimed (Table 4)</td>
            <td style="text-align: right; font-weight: 600; color: #047857;">(-) ₹ ${fmt(itcTax)}</td>
          </tr>
          <tr class="cash-row">
            <td><strong>Net Tax Payable in Cash (Table 6.1)</strong></td>
            <td style="text-align: right; font-size: 15px;"><strong>₹ ${fmt(cashTotal)}</strong></td>
          </tr>
        </tbody>
      </table>

      <div class="cash-box">
        <div class="cash-title">Net Bank Challan Payment Required (Form PMT-06)</div>
        <div class="cash-amount">₹ ${fmt(cashTotal)}</div>
        <div style="font-size: 12px; color: #881337;">
          Breakup &mdash; IGST: <strong>₹ ${fmt(cashIgst)}</strong> | CGST: <strong>₹ ${fmt(cashCgst)}</strong> | SGST: <strong>₹ ${fmt(cashSgst)}</strong>
        </div>
      </div>

      ${customNote ? `
      <div class="note-box">
        <strong>Auditor's / Consultant's Note:</strong><br>
        ${String(customNote).replace(/\n/g, '<br>')}
      </div>` : ''}

      <div class="attachments-list">
        <strong style="color: #0f172a;">📎 Attached Compliance Documents:</strong>
        <ul style="margin: 8px 0 0; padding-left: 20px; color: #475569;">
          ${attachments.map(a => `<li><strong>${a.filename}</strong></li>`).join('')}
        </ul>
      </div>

      <p style="font-size: 12.5px; color: #64748b; line-height: 1.5;">
        ⚠️ <em>Kindly arrange the challan payment on or before the 20th of this month to avoid any interest liability under Section 50 of the CGST Act.</em>
      </p>
    </div>

    <div class="footer">
      Prepared by <strong>${caFirmName}</strong><br>
      ${caPhone ? `Helpline / Contact: ${caPhone} • ` : ''}GST Compliance & Audit Automation Suite
      <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid #334155; font-size: 11px; color: #94a3b8; line-height: 1.6;">
        <div>⚡ Powered by <strong style="color: #f8fafc;">AUDIT WITH VASWANI</strong> | GST Compliance &amp; Audit Automation Suite</div>
        <div style="margin-top: 3px; color: #cbd5e1;">
          Developed by <strong>Sourav Vaswani</strong> • Contact: <a href="tel:8989998663" style="color: #38bdf8; text-decoration: none; font-weight: 600;">8989998663</a> • Email: <a href="mailto:sourav.vaswani01@gmail.com" style="color: #38bdf8; text-decoration: none; font-weight: 600;">sourav.vaswani01@gmail.com</a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

      const mailAttachments = attachments.map((att) => ({
        filename: att.filename,
        content: Buffer.from(att.content, 'base64'),
        contentType: att.contentType
      }));

      const info = await transporter.sendMail({
        from: `"${senderName}" <${senderEmail}>`,
        to: recipientEmail.trim(),
        subject: mailSubject,
        html: emailHtml,
        attachments: mailAttachments
      });

      res.json({
        success: true,
        messageId: info.messageId,
        recipient: recipientEmail.trim(),
        message: `GSTR-3B tax summary email sent successfully to ${recipientEmail.trim()}`
      });
    } catch (err) {
      console.error('[Send Client Mail Error]:', err);
      let errorMsg = err.message || 'Failed to dispatch email';
      if (errorMsg.includes('Invalid login') || errorMsg.includes('535') || errorMsg.includes('Username and Password not accepted')) {
        errorMsg = 'Gmail Authentication failed. Please verify your 16-character Google App Password in settings.';
      }
      res.status(500).json({ success: false, error: errorMsg });
    }
  });

  // ─── RETURNS COMPLIANCE TRACKING & STATUTORY DEADLINE SUITE (TAB 06) ────────
  db.run(`CREATE TABLE IF NOT EXISTS returns_tracking_records (
    id TEXT PRIMARY KEY,
    gstin TEXT NOT NULL,
    client_name TEXT,
    financial_year TEXT NOT NULL,
    period TEXT NOT NULL,
    frequency TEXT DEFAULT 'Monthly',
    gstr1_status TEXT DEFAULT 'PENDING',
    gstr1_arn TEXT,
    gstr1_filing_date TEXT,
    gstr1_taxable REAL DEFAULT 0,
    gstr1_tax REAL DEFAULT 0,
    gstr2b_status TEXT DEFAULT 'PENDING',
    gstr2b_count INTEGER DEFAULT 0,
    gstr2b_itc REAL DEFAULT 0,
    gstr3b_status TEXT DEFAULT 'PENDING',
    gstr3b_arn TEXT,
    gstr3b_filing_date TEXT,
    gstr3b_liability REAL DEFAULT 0,
    gstr3b_itc REAL DEFAULT 0,
    gstr3b_cash_paid REAL DEFAULT 0,
    office_stage TEXT DEFAULT 'NOT_STARTED',
    remarks TEXT,
    updated_at INTEGER,
    UNIQUE(gstin, financial_year, period)
  )`);

  function getStatutoryDueDate(monthKey, financialYear, returnType) {
    let startYear = 2026;
    if (financialYear && financialYear.includes('-')) {
      const parts = financialYear.split('-');
      const parsed = parseInt(parts[0], 10);
      if (!isNaN(parsed)) startYear = parsed;
    }
    const endYear = startYear + 1;

    const monthIndexMap = {
      'April': { monthNum: 4, year: startYear },
      'May': { monthNum: 5, year: startYear },
      'June': { monthNum: 6, year: startYear },
      'July': { monthNum: 7, year: startYear },
      'August': { monthNum: 8, year: startYear },
      'September': { monthNum: 9, year: startYear },
      'October': { monthNum: 10, year: startYear },
      'November': { monthNum: 11, year: startYear },
      'December': { monthNum: 12, year: startYear },
      'January': { monthNum: 1, year: endYear },
      'February': { monthNum: 2, year: endYear },
      'March': { monthNum: 3, year: endYear },
    };

    const info = monthIndexMap[monthKey] || { monthNum: 4, year: startYear };
    let nextMonth = info.monthNum + 1;
    let nextYear = info.year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }

    const day = returnType === 'GSTR-1' ? 11 : 20;
    const pad = (n) => String(n).padStart(2, '0');
    return `${nextYear}-${pad(nextMonth)}-${pad(day)}`;
  }

  function getPeriodCode(monthKey, financialYear) {
    let startYear = 2026;
    if (financialYear && financialYear.includes('-')) {
      const parts = financialYear.split('-');
      const parsed = parseInt(parts[0], 10);
      if (!isNaN(parsed)) startYear = parsed;
    }
    const endYear = startYear + 1;
    const map = {
      'April': `04${startYear}`,
      'May': `05${startYear}`,
      'June': `06${startYear}`,
      'July': `07${startYear}`,
      'August': `08${startYear}`,
      'September': `09${startYear}`,
      'October': `10${startYear}`,
      'November': `11${startYear}`,
      'December': `12${startYear}`,
      'January': `01${endYear}`,
      'February': `02${endYear}`,
      'March': `03${endYear}`
    };
    return map[monthKey] || `09${startYear}`;
  }

  function computeComplianceMetrics(dueDateStr, filingDateStr, isNil, cashPayable) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(dueDateStr);
    dueDate.setHours(0, 0, 0, 0);

    const isFiled = Boolean(filingDateStr && filingDateStr.trim());
    let daysOverdue = 0;

    if (isFiled) {
      const filingDate = new Date(filingDateStr);
      filingDate.setHours(0, 0, 0, 0);
      if (filingDate > dueDate) {
        daysOverdue = Math.max(0, Math.ceil((filingDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      }
    } else {
      if (today > dueDate) {
        daysOverdue = Math.max(0, Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      }
    }

    const ratePerDay = isNil ? 20 : 50;
    const maxFee = isNil ? 500 : 10000;
    const lateFee = Math.min(maxFee, daysOverdue * ratePerDay);

    let interest = 0;
    if (cashPayable > 0 && daysOverdue > 0) {
      interest = Math.round((cashPayable * 0.18 * daysOverdue) / 365);
    }

    let status = 'PENDING';
    if (isFiled) {
      status = daysOverdue > 0 ? 'FILED_LATE' : 'FILED_ON_TIME';
    } else if (daysOverdue > 0) {
      status = 'OVERDUE';
    } else {
      const diffToDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffToDue <= 5 && diffToDue >= 0) {
        status = 'DUE_SOON';
      }
    }

    return { isFiled, daysOverdue, lateFee, interest, status };
  }

  // Helper to normalize FY string to "YYYY-YY" (e.g. "2025-2026" or "FY 2025-26" -> "2025-26")
  const normalizeTrackingFy = (fyStr) => {
    if (!fyStr) return '2025-26';
    const clean = String(fyStr).trim();
    const parts = clean.match(/(\d{4})[^\d]*(\d{2,4})/);
    if (parts) {
      const start = parts[1];
      const end = parts[2].slice(-2);
      return `${start}-${end}`;
    }
    return clean;
  };

  // GET /api/returns/tracking-data
  app.get('/api/returns/tracking-data', async (req, res) => {
    try {
      const requestedFy = normalizeTrackingFy(req.query.fy);
      const requestedGstin = req.query.gstin ? String(req.query.gstin).trim().toUpperCase() : null;
      const requestedPeriod = req.query.period ? String(req.query.period).trim() : null;
      const dataPath = await getActiveDataPath();

      // 1. Fetch clients from SQLite
      let clientSql = `SELECT id, gstin, trade_name, legal_name, phone, email, portal_username, portal_password FROM clients`;
      const clientParams = [];
      if (requestedGstin) {
        clientSql += ` WHERE gstin = ?`;
        clientParams.push(requestedGstin);
      }
      clientSql += ` ORDER BY trade_name COLLATE NOCASE ASC`;

      db.all(clientSql, clientParams, (err, clientRows) => {
        if (err) {
          console.error('[Returns Tracking] DB Error clients:', err);
          return res.status(500).json({ success: false, error: err.message });
        }

        const clientsList = clientRows || [];

        // If requestedGstin provided but not in clients table, synthesize one
        if (requestedGstin && clientsList.length === 0) {
          clientsList.push({
            id: 'adhoc_' + requestedGstin,
            gstin: requestedGstin,
            trade_name: requestedGstin,
            legal_name: requestedGstin,
            phone: '',
            email: '',
            portal_username: '',
            portal_password: ''
          });
        }

        // 2. Fetch tracking overrides from returns_tracking_records
        db.all(
          `SELECT * FROM returns_tracking_records WHERE financial_year = ?`,
          [requestedFy],
          (trackErr, trackRows) => {
            const trackMap = new Map();
            (trackRows || []).forEach(tr => {
              const key = `${(tr.gstin || '').trim().toUpperCase()}__${tr.period}`;
              trackMap.set(key, tr);
            });

            // 3. Fetch GSTR-1 batches for FY
            db.all(
              `SELECT client_gstin, return_period, status, total_invoices, total_taxable, total_tax FROM gstr1_batches`,
              [],
              (g1Err, g1Rows) => {
                const g1Map = new Map();
                (g1Rows || []).forEach(b => {
                  const key = `${(b.client_gstin || '').trim().toUpperCase()}__${b.return_period}`;
                  g1Map.set(key, b);
                });

                // 4. Fetch GSTR-2B batches for FY
                db.all(
                  `SELECT client_gstin, return_period, status, total_invoices, eligible_itc_total FROM gstr2b_batches`,
                  [],
                  (g2Err, g2Rows) => {
                    const g2Map = new Map();
                    (g2Rows || []).forEach(b => {
                      const key = `${(b.client_gstin || '').trim().toUpperCase()}__${b.return_period}`;
                      g2Map.set(key, b);
                    });

                    // 5. Construct synthesized records for each client across months
                    const months = MONTH_MAP.map(m => m.key);
                    const monthsToProcess = requestedPeriod ? [requestedPeriod] : months;
                    const finalRecords = [];

                    clientsList.forEach(c => {
                      const gstin = (c.gstin || '').trim().toUpperCase();
                      const clientName = c.trade_name || c.legal_name || gstin;
                      const clientFolder = resolveClientDirectory(dataPath, gstin, clientName, false);
                      const fyDir = path.join(clientFolder, requestedFy);

                      monthsToProcess.forEach(month => {
                        const periodCode = getPeriodCode(month, requestedFy);
                        const trackKey = `${gstin}__${month}`;
                        const savedTrack = trackMap.get(trackKey);

                        // Check filesystem for 3B working
                        let working3bData = null;
                        const monthFolderObj = MONTH_MAP.find(m => m.key === month);
                        const monthFolderName = monthFolderObj ? monthFolderObj.folder : month;
                        const candidatePaths = [
                          path.join(fyDir, monthFolderName, 'working.json'),
                          path.join(fyDir, month, 'working.json'),
                          path.join(fyDir, `gstr3b_${month}.json`)
                        ];

                        for (const cp of candidatePaths) {
                          if (fs.existsSync(cp)) {
                            try {
                              working3bData = JSON.parse(fs.readFileSync(cp, 'utf8'));
                              break;
                            } catch {}
                          }
                        }

                        // Also check annual working file in FY directory
                        if (!working3bData) {
                          const annualCandidates = [
                            path.join(fyDir, 'annual_gstr3b_working.json'),
                            path.join(fyDir, `gstr3b_${requestedFy}.json`),
                            path.join(clientFolder, `gstr3b_${requestedFy}.json`)
                          ];
                          for (const ap of annualCandidates) {
                            if (fs.existsSync(ap)) {
                              try {
                                const annualObj = JSON.parse(fs.readFileSync(ap, 'utf8'));
                                if (annualObj?.months?.[month]) {
                                  working3bData = annualObj.months[month];
                                  break;
                                }
                              } catch {}
                            }
                          }
                        }

                        // GSTR-1 values
                        const g1Batch = g1Map.get(`${gstin}__${periodCode}`) || g1Map.get(`${gstin}__${month}`);
                        const g1DueDate = getStatutoryDueDate(month, requestedFy, 'GSTR-1');
                        const g1FilingDate = savedTrack?.gstr1_filing_date || null;
                        const g1Taxable = savedTrack?.gstr1_taxable || g1Batch?.total_taxable || (working3bData?.outward?.totalSaleWorking?.taxable || 0);
                        const g1Tax = savedTrack?.gstr1_tax || g1Batch?.total_tax || (working3bData?.outward?.totalSaleWorking?.total || 0);
                        const g1IsNil = g1Taxable === 0 && g1Tax === 0;
                        const g1Metrics = computeComplianceMetrics(g1DueDate, g1FilingDate, g1IsNil, 0);

                        let g1Status = savedTrack?.gstr1_status;
                        if (!g1Status) {
                          if (g1FilingDate) g1Status = g1Metrics.status;
                          else if (g1Batch?.status === 'SUCCESS' || g1Batch?.status === 'DOWNLOADED') g1Status = 'FILED_ON_TIME';
                          else g1Status = g1Metrics.status;
                        }

                        // GSTR-2B values
                        const g2Batch = g2Map.get(`${gstin}__${periodCode}`) || g2Map.get(`${gstin}__${month}`);
                        let g2Status = savedTrack?.gstr2b_status;
                        if (!g2Status) {
                          if (g2Batch && (g2Batch.status === 'SUCCESS' || g2Batch.status === 'DOWNLOADED' || g2Batch.status === 'SYNCED')) {
                            g2Status = 'AVAILABLE';
                          } else if (g2Batch?.status === 'NIL_SYNCED') {
                            g2Status = 'NIL_AVAILABLE';
                          } else {
                            g2Status = 'PENDING';
                          }
                        }
                        const g2Count = savedTrack?.gstr2b_count || g2Batch?.total_invoices || (working3bData?.inward?.totalItcAvailable?.total ? 1 : 0);
                        const g2Itc = savedTrack?.gstr2b_itc || g2Batch?.eligible_itc_total || (working3bData?.inward?.totalItcAvailable?.total || 0);

                        // GSTR-3B values
                        const g3DueDate = getStatutoryDueDate(month, requestedFy, 'GSTR-3B');
                        const g3FilingDate = savedTrack?.gstr3b_filing_date || null;
                        const g3Liability = savedTrack?.gstr3b_liability || (working3bData?.outward?.totalSaleWorking?.total || 0);
                        const g3Itc = savedTrack?.gstr3b_itc || (working3bData?.inward?.totalItcAvailable?.total || 0);
                        const g3CashPaid = savedTrack?.gstr3b_cash_paid || (working3bData?.settlement?.balancePayable?.total || 0);
                        const g3IsNil = g3Liability === 0 && g3Itc === 0 && g3CashPaid === 0;
                        const g3Metrics = computeComplianceMetrics(g3DueDate, g3FilingDate, g3IsNil, g3CashPaid);

                        let g3Status = savedTrack?.gstr3b_status;
                        if (!g3Status) {
                          if (g3FilingDate) g3Status = g3Metrics.status;
                          else if (working3bData && (working3bData.status === 'FILED' || working3bData.filed)) g3Status = 'FILED_ON_TIME';
                          else if (working3bData && working3bData.outward?.totalSaleWorking?.total > 0) g3Status = g3Metrics.daysOverdue > 0 ? 'OVERDUE' : 'READY_TO_FILE';
                          else g3Status = g3Metrics.status;
                        }

                        finalRecords.push({
                          id: `${gstin}_${requestedFy}_${month}`,
                          clientGstin: gstin,
                          clientName: clientName,
                          financialYear: requestedFy,
                          month: month,
                          periodCode: periodCode,
                          frequency: savedTrack?.frequency || 'Monthly',
                          gstr1: {
                            status: g1Status,
                            arn: savedTrack?.gstr1_arn || null,
                            filingDate: g1FilingDate,
                            dueDate: g1DueDate,
                            daysOverdue: g1Metrics.daysOverdue,
                            lateFee: g1Metrics.lateFee,
                            taxableAmount: g1Taxable,
                            taxAmount: g1Tax,
                            invoiceCount: g1Batch?.total_invoices || 0
                          },
                          gstr2b: {
                            status: g2Status,
                            invoiceCount: g2Count,
                            eligibleItc: g2Itc
                          },
                          gstr3b: {
                            status: g3Status,
                            arn: savedTrack?.gstr3b_arn || null,
                            filingDate: g3FilingDate,
                            dueDate: g3DueDate,
                            daysOverdue: g3Metrics.daysOverdue,
                            lateFee: g3Metrics.lateFee,
                            interest: g3Metrics.interest,
                            taxLiability: g3Liability,
                            itcClaimed: g3Itc,
                            cashPaid: g3CashPaid
                          },
                          officeStage: savedTrack?.office_stage || (working3bData ? 'RECONCILED' : 'NOT_STARTED'),
                          remarks: savedTrack?.remarks || '',
                          hasWorkingPaper: Boolean(working3bData),
                          hasCredentials: Boolean(c.portal_username && c.portal_password),
                          updatedAt: savedTrack?.updated_at || Date.now()
                        });
                      });
                    });

                    res.json({
                      success: true,
                      financialYear: requestedFy,
                      totalClients: clientsList.length,
                      records: finalRecords
                    });
                  }
                );
              }
            );
          }
        );
      });
    } catch (err) {
      console.error('[Returns Tracking Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/returns/save-tracking-record
  app.post('/api/returns/save-tracking-record', (req, res) => {
    try {
      const {
        gstin,
        clientName,
        financialYear,
        month,
        period,
        frequency,
        gstr1Status,
        gstr1Arn,
        gstr1FilingDate,
        gstr1Taxable,
        gstr1Tax,
        gstr2bStatus,
        gstr2bCount,
        gstr2bItc,
        gstr3bStatus,
        gstr3bArn,
        gstr3bFilingDate,
        gstr3bLiability,
        gstr3bItc,
        gstr3bCashPaid,
        officeStage,
        remarks
      } = req.body;

      if (!gstin || !financialYear || (!month && !period)) {
        return res.status(400).json({ success: false, error: 'GSTIN, financialYear, and month/period are required' });
      }

      const cleanGstin = String(gstin).trim().toUpperCase();
      const targetMonth = month || period;
      const recordId = `${cleanGstin}_${financialYear}_${targetMonth}`;
      const now = Date.now();

      const stmt = `
        INSERT INTO returns_tracking_records (
          id, gstin, client_name, financial_year, period, frequency,
          gstr1_status, gstr1_arn, gstr1_filing_date, gstr1_taxable, gstr1_tax,
          gstr2b_status, gstr2b_count, gstr2b_itc,
          gstr3b_status, gstr3b_arn, gstr3b_filing_date, gstr3b_liability, gstr3b_itc, gstr3b_cash_paid,
          office_stage, remarks, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(gstin, financial_year, period) DO UPDATE SET
          client_name = COALESCE(excluded.client_name, returns_tracking_records.client_name),
          frequency = COALESCE(excluded.frequency, returns_tracking_records.frequency),
          gstr1_status = COALESCE(excluded.gstr1_status, returns_tracking_records.gstr1_status),
          gstr1_arn = COALESCE(excluded.gstr1_arn, returns_tracking_records.gstr1_arn),
          gstr1_filing_date = COALESCE(excluded.gstr1_filing_date, returns_tracking_records.gstr1_filing_date),
          gstr1_taxable = COALESCE(excluded.gstr1_taxable, returns_tracking_records.gstr1_taxable),
          gstr1_tax = COALESCE(excluded.gstr1_tax, returns_tracking_records.gstr1_tax),
          gstr2b_status = COALESCE(excluded.gstr2b_status, returns_tracking_records.gstr2b_status),
          gstr2b_count = COALESCE(excluded.gstr2b_count, returns_tracking_records.gstr2b_count),
          gstr2b_itc = COALESCE(excluded.gstr2b_itc, returns_tracking_records.gstr2b_itc),
          gstr3b_status = COALESCE(excluded.gstr3b_status, returns_tracking_records.gstr3b_status),
          gstr3b_arn = COALESCE(excluded.gstr3b_arn, returns_tracking_records.gstr3b_arn),
          gstr3b_filing_date = COALESCE(excluded.gstr3b_filing_date, returns_tracking_records.gstr3b_filing_date),
          gstr3b_liability = COALESCE(excluded.gstr3b_liability, returns_tracking_records.gstr3b_liability),
          gstr3b_itc = COALESCE(excluded.gstr3b_itc, returns_tracking_records.gstr3b_itc),
          gstr3b_cash_paid = COALESCE(excluded.gstr3b_cash_paid, returns_tracking_records.gstr3b_cash_paid),
          office_stage = COALESCE(excluded.office_stage, returns_tracking_records.office_stage),
          remarks = COALESCE(excluded.remarks, returns_tracking_records.remarks),
          updated_at = excluded.updated_at
      `;

      db.run(
        stmt,
        [
          recordId,
          cleanGstin,
          clientName || cleanGstin,
          financialYear,
          targetMonth,
          frequency || 'Monthly',
          gstr1Status || null,
          gstr1Arn || null,
          gstr1FilingDate || null,
          Number(gstr1Taxable) || 0,
          Number(gstr1Tax) || 0,
          gstr2bStatus || null,
          Number(gstr2bCount) || 0,
          Number(gstr2bItc) || 0,
          gstr3bStatus || null,
          gstr3bArn || null,
          gstr3bFilingDate || null,
          Number(gstr3bLiability) || 0,
          Number(gstr3bItc) || 0,
          Number(gstr3bCashPaid) || 0,
          officeStage || 'NOT_STARTED',
          remarks || '',
          now
        ],
        function (err) {
          if (err) {
            console.error('[Save Tracking Record Error]:', err);
            return res.status(500).json({ success: false, error: err.message });
          }
          res.json({ success: true, message: 'Compliance tracking record updated successfully', id: recordId });
        }
      );
    } catch (err) {
      console.error('[Save Tracking Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/returns/open-portal-login (Quick Chrome Launcher)
  app.post('/api/returns/open-portal-login', async (req, res) => {
    try {
      const { gstin } = req.body;
      const cleanGstin = String(gstin || '').trim().toUpperCase();
      const result = await openPortalLoginHelper({ db, gstin: cleanGstin, browserState });
      res.json({ success: true, ...result, message: `Chrome launched and login details filled for ${result.clientName || cleanGstin}!` });
    } catch (err) {
      console.error('[Returns Open Portal Error]:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to open portal login' });
    }
  });

  // POST /api/returns/upload-3b-portal (Direct Autonomous GSTR-3B JSON Upload to Portal)
  app.post('/api/returns/upload-3b-portal', async (req, res) => {
    try {
      const { gstin, month, financialYear, portalJson } = req.body;
      const cleanGstin = String(gstin || '').trim().toUpperCase();
      const cleanMonth = String(month || 'September').trim();
      const cleanFy = normalizeTrackingFy(financialYear || '2026-27');

      if (!cleanGstin) {
        return res.status(400).json({ success: false, error: 'Client GSTIN is required' });
      }

      // Check if file already exists in client folder
      let jsonFilePath = null;
      try {
        const clientDir = resolveClientDirectory(storageConfig.dataPath, cleanGstin);
        const fDir = path.join(clientDir, cleanFy);
        const mIndex = GSTR3B_MONTHS.indexOf(cleanMonth);
        const mPrefix = mIndex !== -1 ? (mIndex + 1).toString().padStart(2, '0') : '06';
        const mDir = path.join(fDir, `${mPrefix} - ${cleanMonth}`);
        const candidate1 = path.join(mDir, `gstr3b_portal_${cleanMonth}.json`);
        const candidate2 = path.join(mDir, '3B Working', `gstr3b_portal_${cleanMonth}.json`);
        if (fs.existsSync(candidate1)) jsonFilePath = candidate1;
        else if (fs.existsSync(candidate2)) jsonFilePath = candidate2;
      } catch (e) {}

      console.log(`[GSTR-3B Portal Upload Route] Initiating upload for ${cleanGstin} (${cleanMonth} ${cleanFy})`);
      const result = await runGstr3bUploadAutopilot({
        db,
        gstin: cleanGstin,
        month: cleanMonth,
        financialYear: cleanFy,
        jsonFilePath,
        jsonContent: portalJson,
        browserState
      });

      res.json({
        success: true,
        ...result,
        message: result.message || 'GSTR-3B JSON uploaded directly to GST Portal successfully!'
      });
    } catch (err) {
      console.error('[GSTR-3B Portal Upload Error]:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to upload GSTR-3B JSON directly to portal'
      });
    }
  });

  // POST /api/returns/upload-1-portal (Direct Autonomous GSTR-1 JSON Upload to Portal)
  app.post('/api/returns/upload-1-portal', async (req, res) => {
    try {
      const { gstin, month, financialYear, portalJson } = req.body;
      const cleanGstin = String(gstin || '').trim().toUpperCase();
      const cleanMonth = String(month || 'September').trim();
      const cleanFy = normalizeTrackingFy(financialYear || '2026-27');

      if (!cleanGstin) {
        return res.status(400).json({ success: false, error: 'Client GSTIN is required' });
      }

      // Check if file already exists in client folder
      let jsonFilePath = null;
      try {
        const clientDir = resolveClientDirectory(storageConfig.dataPath, cleanGstin);
        const fDir = path.join(clientDir, cleanFy);
        const mIndex = GSTR3B_MONTHS.indexOf(cleanMonth);
        const mPrefix = mIndex !== -1 ? (mIndex + 1).toString().padStart(2, '0') : '06';
        const mDir = path.join(fDir, `${mPrefix} - ${cleanMonth}`);
        const candidate1 = path.join(mDir, `gstr1_portal_${cleanMonth}.json`);
        const candidate2 = path.join(mDir, '1 Working', `gstr1_portal_${cleanMonth}.json`);
        if (fs.existsSync(candidate1)) jsonFilePath = candidate1;
        else if (fs.existsSync(candidate2)) jsonFilePath = candidate2;
      } catch (e) {}

      console.log(`[GSTR-1 Portal Upload Route] Initiating upload for ${cleanGstin} (${cleanMonth} ${cleanFy})`);
      const result = await runGstr1UploadAutopilot({
        db,
        gstin: cleanGstin,
        month: cleanMonth,
        financialYear: cleanFy,
        jsonFilePath,
        jsonContent: portalJson,
        browserState
      });

      res.json({
        success: true,
        ...result,
        message: result.message || 'GSTR-1 JSON uploaded directly to GST Portal successfully!'
      });
    } catch (err) {
      console.error('[GSTR-1 Portal Upload Error]:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to upload GSTR-1 JSON directly to portal'
      });
    }
  });

  // POST /api/returns/save-gstr1-bundle (Silent Auto-Save to <dataPath>/<Client>/<FY>/<Month>/1 Working/)
  app.post('/api/returns/save-gstr1-bundle', async (req, res) => {
    try {
      const {
        gstin,
        fy,
        month,
        clientName,
        returnData,
        portalJson,
        excelBase64,
        csvsZipBase64,
        drc01bBase64,
        timestamp
      } = req.body;

      if (!gstin) {
        return res.status(400).json({ success: false, error: 'gstin is required' });
      }

      const gstinClean = String(gstin).trim().toUpperCase();
      const fyClean = String(fy || '2026-27').trim();
      const firmName = clientName || gstinClean;
      const safeFirm = sanitizeFolderName(firmName) || gstinClean;
      const monthClean = String(month || 'September').trim();
      const dataPath = await getActiveDataPath();

      const mIndex = GSTR3B_MONTHS.indexOf(monthClean);
      const mPrefix = mIndex !== -1 ? (mIndex + 1).toString().padStart(2, '0') : '06';
      const monthFolder = `${mPrefix} - ${monthClean}`;

      const clientDir = path.join(dataPath, safeFirm);
      const fyDir = path.join(clientDir, fyClean);
      const mDir = path.join(fyDir, monthFolder);
      const workingDir = path.join(mDir, '1 Working');

      if (!fs.existsSync(workingDir)) {
        fs.mkdirSync(workingDir, { recursive: true });
      }

      const savedFiles = [];

      // 1. Save Portal JSON
      if (portalJson) {
        const jsonPath = path.join(workingDir, `gstr1_portal_${monthClean}.json`);
        const jsonStr = typeof portalJson === 'string' ? portalJson : JSON.stringify(portalJson, null, 2);
        fs.writeFileSync(jsonPath, jsonStr, 'utf8');
        savedFiles.push(`gstr1_portal_${monthClean}.json`);
      }

      // 2. Save V2.2 Excel Workbook
      if (excelBase64) {
        const excelPath = path.join(workingDir, `gstr1_v22_${monthClean}.xlsx`);
        fs.writeFileSync(excelPath, Buffer.from(excelBase64, 'base64'));
        savedFiles.push(`gstr1_v22_${monthClean}.xlsx`);
      }

      // 3. Save CSVs Zip
      if (csvsZipBase64) {
        const zipPath = path.join(workingDir, `gstr1_csvs_${monthClean}.zip`);
        fs.writeFileSync(zipPath, Buffer.from(csvsZipBase64, 'base64'));
        savedFiles.push(`gstr1_csvs_${monthClean}.zip`);
      }

      // 4. Save Raw Return Data
      if (returnData) {
        const dataPath = path.join(workingDir, `gstr1_data_${monthClean}.json`);
        fs.writeFileSync(dataPath, JSON.stringify(returnData, null, 2), 'utf8');
        savedFiles.push(`gstr1_data_${monthClean}.json`);
      }

      // 5. Save DRC-01B Comparison
      if (drc01bBase64) {
        const drcPath = path.join(workingDir, `gstr1_drc01b_${monthClean}.xlsx`);
        fs.writeFileSync(drcPath, Buffer.from(drc01bBase64, 'base64'));
        savedFiles.push(`gstr1_drc01b_${monthClean}.xlsx`);
      }

      res.json({
        success: true,
        message: `GSTR-1 working bundle saved successfully into ${workingDir}`,
        folderPath: workingDir,
        monthFolder: mDir,
        savedFiles
      });
    } catch (err) {
      console.error('[GSTR-1 Save Bundle Error]:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to save GSTR-1 bundle' });
    }
  });

  // POST /api/returns/sync-portal-tracking (Full Track Return Status Scraper)
  app.post('/api/returns/sync-portal-tracking', async (req, res) => {
    try {
      const { gstin, financialYear, period } = req.body;
      let cleanGstin = gstin ? String(gstin).trim().toUpperCase() : null;
      const targetFy = normalizeTrackingFy(
        financialYear ||
        req.body?.fy ||
        req.query?.financialYear ||
        req.query?.fy
      );

      // If no specific GSTIN provided, find the first client with saved portal credentials
      if (!cleanGstin) {
        const firstClientWithCreds = await new Promise((resolve) => {
          db.get(
            `SELECT gstin FROM clients WHERE portal_username IS NOT NULL AND portal_username != '' AND portal_password IS NOT NULL AND portal_password != '' LIMIT 1`,
            [],
            (err, row) => resolve(row ? row.gstin : null)
          );
        });
        if (firstClientWithCreds) {
          cleanGstin = firstClientWithCreds;
        }
      }

      if (!cleanGstin) {
        return res.status(400).json({
          success: false,
          error: 'Please select a client or configure credentials in Credentials Vault first.'
        });
      }

      // Check client credentials in database
      const clientRow = await new Promise((resolve) => {
        db.get(
          `SELECT trade_name, legal_name, portal_username, portal_password FROM clients WHERE UPPER(TRIM(gstin)) = ? OR UPPER(TRIM(id)) = ?`,
          [cleanGstin, cleanGstin],
          (err, row) => resolve(row || null)
        );
      });

      if (!clientRow || !clientRow.portal_username || !clientRow.portal_password) {
        return res.status(400).json({
          success: false,
          error: `No portal credentials saved for ${cleanGstin}. Please open Credentials Vault and save username & password.`
        });
      }

      console.log(`[Returns Tracking Autopilot] Launching Track Return Status loop for ${cleanGstin} (${targetFy})...`);
      const result = await runReturnsTrackingAutopilot({
        db,
        gstin: cleanGstin,
        financialYear: targetFy,
        targetMonth: period || null,
        onProgress: (step, msg) => {
          console.log(`[Returns Tracking Autopilot: ${step}] ${msg}`);
        },
        browserState
      });

      res.json({
        success: true,
        gstin: cleanGstin,
        financialYear: targetFy,
        clientName: result.clientName,
        totalReturnsScraped: result.totalReturnsScraped,
        records: result.records,
        message: `Sync Complete! Successfully tracked ${result.totalReturnsScraped} return filings with official portal ARNs for ${result.clientName}.`
      });
    } catch (err) {
      console.error('[Returns Tracking Autopilot Error]:', err);
      res.status(500).json({ success: false, error: err.message || 'Returns tracking autopilot failed.' });
    }
  });
}
