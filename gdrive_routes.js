import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filenameVal = typeof import.meta !== 'undefined' && import.meta.url ? fileURLToPath(import.meta.url) : (typeof __filename !== 'undefined' ? __filename : '');
const __dirnameVal = typeof __dirname !== 'undefined' ? __dirname : path.dirname(__filenameVal || '.');

// Admin GDrive config stored in a local JSON file (never exposed to clients)
const GDRIVE_CONFIG_FILE = path.join(process.env.USER_DATA_PATH || '.', 'gdrive_admin_config.json');
const FOLDER_NAME = 'Audit With Vaswani - Reco History';

function loadGDriveConfig() {
    try {
        if (fs.existsSync(GDRIVE_CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(GDRIVE_CONFIG_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Failed to load GDrive config:', e.message);
    }
    return {};
}

function saveGDriveConfig(config) {
    try {
        const dir = path.dirname(GDRIVE_CONFIG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(GDRIVE_CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (e) {
        console.error('Failed to save GDrive config:', e.message);
    }
}

/** Use admin refresh token to get a fresh access token */
async function getAdminAccessToken() {
    const config = loadGDriveConfig();
    if (!config.client_id || !config.client_secret || !config.refresh_token) {
        throw new Error('ADMIN_NOT_CONFIGURED');
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: config.client_id,
            client_secret: config.client_secret,
            refresh_token: config.refresh_token,
            grant_type: 'refresh_token',
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        console.error('Google token refresh failed:', err);
        throw new Error('TOKEN_REFRESH_FAILED');
    }

    const data = await res.json();
    return data.access_token;
}

/** Get or create the app folder in admin's Google Drive */
async function getOrCreateAppFolder(token) {
    const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`);
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!searchRes.ok) throw new Error('Failed to search Drive');

    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id;
    }

    // Create folder
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
        }),
    });
    if (!createRes.ok) throw new Error('Failed to create Drive folder');
    const folderData = await createRes.json();
    return folderData.id;
}

export default function setupGDriveRoutes(app) {

    // =========================================================================
    // POST /api/gdrive/admin-setup
    // One-time admin setup: exchange authorization code for refresh token
    // Body: { client_id, client_secret, auth_code, redirect_uri }
    // =========================================================================
    app.post('/api/gdrive/admin-setup', async (req, res) => {
        try {
            const { client_id, client_secret, auth_code, redirect_uri } = req.body;
            if (!client_id || !client_secret || !auth_code) {
                return res.status(400).json({ error: 'Missing client_id, client_secret, or auth_code' });
            }

            // Exchange auth code for tokens
            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code: auth_code,
                    client_id,
                    client_secret,
                    redirect_uri: redirect_uri || 'http://localhost:8080',
                    grant_type: 'authorization_code',
                }),
            });

            if (!tokenRes.ok) {
                const errText = await tokenRes.text();
                console.error('Token exchange failed:', errText);
                return res.status(400).json({ error: 'Failed to exchange auth code', details: errText });
            }

            const tokenData = await tokenRes.json();
            if (!tokenData.refresh_token) {
                return res.status(400).json({ error: 'No refresh token received. Make sure to request offline access and force re-consent.' });
            }

            // Save admin config
            saveGDriveConfig({
                client_id,
                client_secret,
                refresh_token: tokenData.refresh_token,
                admin_email: tokenData.id_token ? 'configured' : 'admin',
                configured_at: new Date().toISOString(),
            });

            res.json({ success: true, message: 'Google Drive admin connection saved! All users can now auto-backup.' });
        } catch (err) {
            console.error('GDrive admin setup error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // =========================================================================
    // GET /api/gdrive/status
    // Check if admin GDrive is configured
    // =========================================================================
    app.get('/api/gdrive/status', (req, res) => {
        const config = loadGDriveConfig();
        const isConfigured = !!(config.client_id && config.client_secret && config.refresh_token);
        res.json({
            configured: isConfigured,
            configured_at: config.configured_at || null,
        });
    });

    // =========================================================================
    // POST /api/gdrive/upload
    // Upload reconciliation snapshot to admin's Google Drive
    // Body: { payload } (the full RecoSnapshotPayload)
    // =========================================================================
    app.post('/api/gdrive/upload', async (req, res) => {
        try {
            const { payload } = req.body;
            if (!payload) return res.status(400).json({ error: 'Missing payload' });

            const token = await getAdminAccessToken();
            const folderId = await getOrCreateAppFolder(token);

            const cleanCompany = (payload.companyName || 'Company').replace(/[^a-zA-Z0-9_-]/g, '_');
            const cleanFY = (payload.financialYear || 'FY').replace(/[^a-zA-Z0-9_-]/g, '_');
            const userName = (payload.userName || 'User').replace(/[^a-zA-Z0-9_-]/g, '_');
            const dateStr = new Date().toISOString().slice(0, 10);
            const timeStr = new Date().toISOString().slice(11, 19).replace(/:/g, '');
            const fileName = `RECO_${cleanCompany}_${cleanFY}_${userName}_${dateStr}_${timeStr}.reco.json`;

            const fileMetadata = {
                name: fileName,
                parents: [folderId],
                mimeType: 'application/json',
                description: JSON.stringify({
                    companyName: payload.companyName,
                    financialYear: payload.financialYear,
                    mode: payload.mode,
                    invoiceCount: payload.summary?.total || 0,
                    totalVariance: payload.summary?.totalDiff || 0,
                    userName: payload.userName || 'Unknown',
                    machineName: payload.machineName || os.hostname(),
                }),
            };

            const fileContent = JSON.stringify(payload, null, 2);
            const boundary = 'reco_drive_boundary_' + Date.now();
            const delimiter = `\r\n--${boundary}\r\n`;
            const closeDelimiter = `\r\n--${boundary}--`;

            const multipartBody =
                delimiter +
                'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                JSON.stringify(fileMetadata) +
                delimiter +
                'Content-Type: application/json\r\n\r\n' +
                fileContent +
                closeDelimiter;

            const uploadRes = await fetch(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,modifiedTime,description,size',
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': `multipart/related; boundary=${boundary}`,
                    },
                    body: multipartBody,
                }
            );

            if (!uploadRes.ok) {
                const errText = await uploadRes.text();
                console.error('Drive upload failed:', errText);
                return res.status(500).json({ error: 'Upload failed', details: errText });
            }

            const uploaded = await uploadRes.json();
            let descMeta = {};
            try { descMeta = JSON.parse(uploaded.description || '{}'); } catch (e) { descMeta = {}; }

            res.json({
                success: true,
                file: {
                    id: uploaded.id,
                    name: uploaded.name,
                    companyName: descMeta.companyName || payload.companyName,
                    financialYear: descMeta.financialYear || payload.financialYear,
                    mode: descMeta.mode || payload.mode,
                    invoiceCount: descMeta.invoiceCount ?? 0,
                    totalVariance: descMeta.totalVariance ?? 0,
                    createdTime: uploaded.createdTime,
                    modifiedTime: uploaded.modifiedTime,
                    fileSize: uploaded.size ? `${(parseInt(uploaded.size, 10) / 1024).toFixed(1)} KB` : 'N/A',
                },
            });
        } catch (err) {
            if (err.message === 'ADMIN_NOT_CONFIGURED') {
                return res.status(503).json({ error: 'Google Drive admin not configured. Ask the admin to set up cloud backup.' });
            }
            if (err.message === 'TOKEN_REFRESH_FAILED') {
                return res.status(401).json({ error: 'Admin Google Drive token expired. Admin needs to re-authorize.' });
            }
            console.error('GDrive upload error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // =========================================================================
    // GET /api/gdrive/list
    // List all reco snapshots from admin's Google Drive
    // =========================================================================
    app.get('/api/gdrive/list', async (req, res) => {
        try {
            const token = await getAdminAccessToken();
            const folderId = await getOrCreateAppFolder(token);
            const query = encodeURIComponent(`'${folderId}' in parents and name contains '.reco.json' and trashed=false`);
            const listRes = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime desc&fields=files(id,name,createdTime,modifiedTime,description,size)&pageSize=100`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!listRes.ok) throw new Error('Failed to list Drive files');

            const data = await listRes.json();
            const files = (data.files || []).map(f => {
                let meta = {};
                try { meta = JSON.parse(f.description || '{}'); } catch (e) { meta = {}; }
                return {
                    id: f.id,
                    name: f.name,
                    companyName: meta.companyName || f.name.split('_')[1] || 'Company',
                    financialYear: meta.financialYear || 'FY',
                    mode: meta.mode || 'input',
                    invoiceCount: meta.invoiceCount ?? 0,
                    totalVariance: meta.totalVariance ?? 0,
                    userName: meta.userName || 'Unknown',
                    createdTime: f.createdTime,
                    modifiedTime: f.modifiedTime,
                    fileSize: f.size ? `${(parseInt(f.size, 10) / 1024).toFixed(1)} KB` : 'N/A',
                };
            });

            res.json({ success: true, files });
        } catch (err) {
            if (err.message === 'ADMIN_NOT_CONFIGURED') {
                return res.status(503).json({ error: 'Google Drive admin not configured.' });
            }
            console.error('GDrive list error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // =========================================================================
    // GET /api/gdrive/download/:fileId
    // Download a specific snapshot from admin's Google Drive
    // =========================================================================
    app.get('/api/gdrive/download/:fileId', async (req, res) => {
        try {
            const token = await getAdminAccessToken();
            const fileRes = await fetch(
                `https://www.googleapis.com/drive/v3/files/${req.params.fileId}?alt=media`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!fileRes.ok) throw new Error('Failed to download snapshot');

            const payload = await fileRes.json();
            res.json({ success: true, payload });
        } catch (err) {
            if (err.message === 'ADMIN_NOT_CONFIGURED') {
                return res.status(503).json({ error: 'Google Drive admin not configured.' });
            }
            console.error('GDrive download error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // =========================================================================
    // DELETE /api/gdrive/delete/:fileId
    // Delete a snapshot from admin's Google Drive
    // =========================================================================
    app.delete('/api/gdrive/delete/:fileId', async (req, res) => {
        try {
            const token = await getAdminAccessToken();
            await fetch(`https://www.googleapis.com/drive/v3/files/${req.params.fileId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            res.json({ success: true });
        } catch (err) {
            console.error('GDrive delete error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // =========================================================================
    // POST /api/gdrive/disconnect
    // Remove admin's GDrive config
    // =========================================================================
    app.post('/api/gdrive/disconnect', (req, res) => {
        try {
            if (fs.existsSync(GDRIVE_CONFIG_FILE)) {
                fs.unlinkSync(GDRIVE_CONFIG_FILE);
            }
            res.json({ success: true, message: 'Google Drive admin disconnected.' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    console.log('  ☁️  Google Drive Cloud Backup routes initialized');
}
