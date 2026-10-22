import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Enterprise Server Shared Data Storage Routes for GSTR Returns
 * Allows all PCs in the office LAN to store and access client return working papers from a central server folder.
 */
export default function setupReturnsStorageRoutes(app, db, defaultUserDataPath = '.') {
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
    return new Promise((resolve) => {
      const defaultPath = path.resolve(defaultUserDataPath, 'gst_returns_data');
      if (!fs.existsSync(defaultPath)) {
        try {
          fs.mkdirSync(defaultPath, { recursive: true });
        } catch (e) {
          console.warn('[Returns Storage] Could not create default path:', e.message);
        }
      }

      db.get("SELECT value FROM app_config WHERE key = 'returns_data_path'", [], (err, row) => {
        if (!err && row && row.value) {
          const candidatePath = path.resolve(row.value);
          try {
            if (fs.existsSync(candidatePath)) {
              // Canary test write & verify active writeability
              const testFile = path.join(candidatePath, `.access_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.tmp`);
              let writeOk = false;
              try {
                fs.writeFileSync(testFile, 'OK');
                writeOk = true;
              } finally {
                if (writeOk) {
                  try { if (fs.existsSync(testFile)) fs.unlinkSync(testFile); } catch {}
                }
              }
              if (writeOk) {
                return resolve(candidatePath);
              }
            }
          } catch (e) {
            console.warn('[Returns Storage] Configured network path inaccessible or read-only, falling back to local storage:', e.message);
          }
        }
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

  // Helper to scan directory for client statistics
  function inspectStorageDirectory(dirPath) {
    let totalClientsWithData = 0;
    let totalFiles = 0;
    let sizeBytes = 0;

    if (!fs.existsSync(dirPath)) {
      return { exists: false, isWritable: false, totalClientsWithData: 0, totalFiles: 0, sizeBytes: 0 };
    }

    let isWritable = false;
    try {
      const testFile = path.join(dirPath, `.write_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.tmp`);
      try {
        fs.writeFileSync(testFile, 'OK');
        isWritable = true;
      } finally {
        if (isWritable) {
          try { if (fs.existsSync(testFile)) fs.unlinkSync(testFile); } catch {}
        }
      }
    } catch {
      isWritable = false;
    }

    try {
      const items = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          const gstin = extractGstinFromDirName(item.name);
          if (gstin) {
            const clientDir = path.join(dirPath, item.name);
            let clientHasData = false;

            const scanDirRecursive = (dir) => {
              try {
                const subEntries = fs.readdirSync(dir, { withFileTypes: true });
                for (const sub of subEntries) {
                  const subPath = path.join(dir, sub.name);
                  if (sub.isDirectory()) {
                    scanDirRecursive(subPath);
                  } else if (sub.name.endsWith('.json') && (sub.name.startsWith('gstr') || sub.name.includes('working'))) {
                    clientHasData = true;
                    totalFiles++;
                    try {
                      sizeBytes += fs.statSync(subPath).size;
                    } catch {}
                  }
                }
              } catch {}
            };

            scanDirRecursive(clientDir);
            if (clientHasData) totalClientsWithData++;
          }
        }
      }
    } catch (e) {
      console.warn('[Returns Storage] Inspection error:', e.message);
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

      const normalized = path.resolve(dataPath.trim());

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
            return res.status(500).json({ success: false, error: 'Failed saving data path to database' });
          }

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

  // 2b. POST Open Storage Folder in Windows Explorer (supports optional folderPath)
  app.post('/api/returns/open-folder', async (req, res) => {
    try {
      const dataPath = await getActiveDataPath();
      let targetFolder = dataPath;
      if (req.body && req.body.folderPath) {
        const customPath = path.resolve(req.body.folderPath);
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

      const writeBundleFiles = (basePath) => {
        const cDir = resolveClientDirectory(basePath, gstinClean, firmName, true);
        const fDir = path.join(cDir, fyClean);
        const mMatch = MONTH_MAP.find(m => m.key.toLowerCase() === monthClean.toLowerCase());
        const mFolderName = mMatch ? mMatch.folder : monthClean;
        const mDir = path.join(fDir, mFolderName);

        if (!fs.existsSync(mDir)) {
          fs.mkdirSync(mDir, { recursive: true });
        }

        const files = [];

        // 1. SAVE EXCEL (.xlsx) - Date-wise & Time-wise
        if (excelBase64) {
          const excelBuffer = Buffer.from(excelBase64, 'base64');
          const excelTimeFile = path.join(mDir, `${safeFirm} - GSTR-3B Working ${monthClean}_${dateTimeStamp}.xlsx`);
          const excelLatestFile = path.join(mDir, `gstr3b_working_${monthClean}.xlsx`);
          const excelAnnualTimeFile = path.join(fDir, `${safeFirm} - GSTR-3B Annual Working ${fyClean}_${dateTimeStamp}.xlsx`);
          const excelAnnualLatestFile = path.join(fDir, `gstr3b_annual_working_${fyClean}.xlsx`);

          fs.writeFileSync(excelTimeFile, excelBuffer);
          fs.writeFileSync(excelLatestFile, excelBuffer);
          fs.writeFileSync(excelAnnualTimeFile, excelBuffer);
          fs.writeFileSync(excelAnnualLatestFile, excelBuffer);
          files.push(
            path.basename(excelTimeFile),
            path.basename(excelAnnualTimeFile)
          );
        }

        // 2. SAVE PDF (.pdf) - Date-wise & Time-wise
        if (pdfBase64) {
          const pdfBuffer = Buffer.from(pdfBase64, 'base64');
          const pdfTimeFile = path.join(mDir, `${safeFirm} - GSTR-3B Working ${monthClean}_${dateTimeStamp}.pdf`);
          const pdfLatestFile = path.join(mDir, `gstr3b_working_${monthClean}.pdf`);

          fs.writeFileSync(pdfTimeFile, pdfBuffer);
          fs.writeFileSync(pdfLatestFile, pdfBuffer);
          files.push(path.basename(pdfTimeFile));
        }

        // 3. SAVE PORTAL JSON (.json) - Date-wise & Time-wise
        if (portalJson) {
          const portalJsonStr = typeof portalJson === 'string' ? portalJson : JSON.stringify(portalJson, null, 2);
          const portalTimeFile = path.join(mDir, `${safeFirm} - GSTR-3B Portal Upload ${monthClean}_${dateTimeStamp}.json`);
          const portalLatestFile = path.join(mDir, `gstr3b_portal_${monthClean}.json`);

          fs.writeFileSync(portalTimeFile, portalJsonStr, 'utf8');
          fs.writeFileSync(portalLatestFile, portalJsonStr, 'utf8');
          files.push(path.basename(portalTimeFile));
        }

        // 4. SAVE WORKING DATA JSON (.json) - Date-wise & Time-wise
        if (workingData) {
          const workingDataStr = JSON.stringify(workingData, null, 2);
          const annualMasterFile = path.join(fDir, 'annual_gstr3b_working.json');
          const annualTimeFile = path.join(fDir, `${safeFirm} - GSTR-3B Data ${fyClean}_${dateTimeStamp}.json`);
          const monthTimeFile = path.join(mDir, `${safeFirm} - GSTR-3B Data ${monthClean}_${dateTimeStamp}.json`);
          const monthLatestFile = path.join(mDir, `gstr3b_${monthClean}.json`);

          fs.writeFileSync(annualMasterFile, workingDataStr, 'utf8');
          fs.writeFileSync(annualTimeFile, workingDataStr, 'utf8');
          fs.writeFileSync(monthTimeFile, workingDataStr, 'utf8');

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
            fs.writeFileSync(monthLatestFile, JSON.stringify(monthPayload, null, 2), 'utf8');
          }

          files.push(
            path.basename(annualTimeFile),
            path.basename(monthTimeFile)
          );
        }

        return { cDir, fDir, mDir, files };
      };

      let bundleResult;
      try {
        bundleResult = writeBundleFiles(effectiveDataPath);
      } catch (bundleErr) {
        if (effectiveDataPath !== defaultPath) {
          console.warn(`[Returns Storage] Primary bundle write failed (${bundleErr.message}), falling back to local storage: ${defaultPath}`);
          usedFallback = true;
          effectiveDataPath = defaultPath;
          bundleResult = writeBundleFiles(effectiveDataPath);
        } else {
          throw bundleErr;
        }
      }

      const { cDir: clientDir, fDir: fyDir, mDir: monthDir, files: savedFiles } = bundleResult;

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

      console.log(`[Returns Storage] Successfully saved full bundle for ${safeFirm} (${monthClean} ${fyClean}) date-wise & time-wise: ${dateTimeStamp}`);

      res.json({
        success: true,
        message: 'Saved Excel, PDF, JSON date-wise and time-wise to Central Server Storage.',
        dateTimeStamp,
        humanDate,
        humanTime,
        month: monthClean,
        clientDir,
        fyDir,
        monthDir,
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

      // Step A: Read all clients from SQLite
      db.all(
        `SELECT id, gstin, trade_name, legal_name, phone, email, portal_username, portal_password
         FROM clients
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
                            const fyDir = path.join(clientDir, ce.name);
                            try {
                              const fyItems = fs.readdirSync(fyDir, { withFileTypes: true });
                              for (const fi of fyItems) {
                                const fPath = path.join(fyDir, fi.name);
                                if (fi.isFile() && fi.name.endsWith('.json')) {
                                  const stat = fs.statSync(fPath);
                                  if (stat.mtimeMs > latestMod) latestMod = stat.mtimeMs;
                                  if (!firmNameFromProfile && fi.name.includes('working')) {
                                    try {
                                      const p = JSON.parse(fs.readFileSync(fPath, 'utf8'));
                                      if (p?.profile?.firmName) firmNameFromProfile = p.profile.firmName;
                                    } catch {}
                                  }
                                } else if (fi.isDirectory()) {
                                  try {
                                    const mFiles = fs.readdirSync(fPath);
                                    for (const mf of mFiles) {
                                      const mfPath = path.join(fPath, mf);
                                      const stat = fs.statSync(mfPath);
                                      if (stat.mtimeMs > latestMod) latestMod = stat.mtimeMs;
                                    }
                                  } catch {}
                                }
                              }
                            } catch {}
                          }
                        } else if (ce.isFile() && ce.name.startsWith('gstr3b_') && ce.name.endsWith('.json')) {
                          const y = ce.name.replace('gstr3b_', '').replace('.json', '');
                          savedYearsSet.add(y);
                          try {
                            const stat = fs.statSync(path.join(clientDir, ce.name));
                            if (stat.mtimeMs > latestMod) latestMod = stat.mtimeMs;
                          } catch {}
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
}
