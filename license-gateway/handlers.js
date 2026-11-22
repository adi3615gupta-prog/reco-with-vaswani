const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

function getDb() {
  if (!admin.apps.length) {
    const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (rawSa) {
      const parsed = typeof rawSa === 'string' ? JSON.parse(rawSa) : rawSa;
      if (parsed.private_key && parsed.private_key.includes('\\n')) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      admin.initializeApp({ credential: admin.credential.cert(parsed) });
    } else {
      admin.initializeApp();
    }
  }
  return admin.firestore();
}

function assertAuthorizedClient(req, res) {
  const sharedToken = process.env.LICENSE_GATEWAY_TOKEN;
  if (!sharedToken) {
    res.status(503).json({ error: 'Licensing gateway token is not configured on the server' });
    return false;
  }
  const provided = Buffer.from(String(req.headers['x-license-token'] || ''));
  const expected = Buffer.from(sharedToken);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    res.status(401).json({ error: 'Unauthorized licensing gateway request' });
    return false;
  }
  return true;
}

function getSafeUser(docId, data = {}) {
  const { password_hash: _ph, password: _pw, ...safe } = data;
  return { id: docId, ...safe };
}

async function activateKey(req, res) {
  const db = getDb();
  const { serialKey, deviceId, pcName, osUser, clientIp, boundMac } = req.body || {};
  const normKey = String(serialKey || '').trim().toUpperCase();
  const normDevice = String(deviceId || '').trim();
  if (!normKey || !normDevice || normDevice === 'legacy_device') {
    return res.status(400).json({ error: 'Valid serialKey and deviceId are required' });
  }

  const keyRef = db.collection('serial_keys').doc(normKey);
  const snap = await keyRef.get();
  if (!snap.exists) return res.status(404).json({ error: 'Invalid Serial Key' });

  const row = snap.data() || {};
  if (row.is_active === 0) return res.status(403).json({ error: 'This key has been revoked' });

  const maxDevices = Number(row.max_devices) || 1;
  const boundDevices = Array.isArray(row.bound_devices)
    ? [...row.bound_devices]
    : (row.device_id ? [row.device_id] : []);

  const devMeta = row.devices_info?.[normDevice];
  if (devMeta && (devMeta.is_restricted === true || devMeta.status === 'RESTRICTED')) {
    return res.status(403).json({ error: 'This PC has been restricted by Super Admin.' });
  }

  if (!boundDevices.includes(normDevice)) {
    if (boundDevices.length >= maxDevices) {
      return res.status(403).json({ error: `License limit reached (${boundDevices.length}/${maxDevices} PCs active).` });
    }
    boundDevices.push(normDevice);
  }

  const devicesInfo = (row.devices_info && typeof row.devices_info === 'object') ? { ...row.devices_info } : {};
  for (const id of Object.keys(devicesInfo)) {
    if (!boundDevices.includes(id)) delete devicesInfo[id];
  }

  const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  devicesInfo[normDevice] = {
    ...(devicesInfo[normDevice] || {}),
    device_id: normDevice,
    pc_name: pcName || `PC-${normDevice.slice(-4)}`,
    os_user: osUser || 'User',
    ip: clientIp || 'LAN',
    activated_at: devicesInfo[normDevice]?.activated_at || nowStr,
    last_seen: nowStr,
    last_seen_ms: Date.now(),
    status: 'ACTIVE',
    is_restricted: false,
    force_offline_at: null
  };

  const devicesList = Object.values(devicesInfo);
  const updatePayload = {
    device_id: boundDevices[0] || null,
    bound_devices: boundDevices,
    max_devices: maxDevices,
    devices_info: devicesInfo,
    devices_list: devicesList,
    active_pc_count: boundDevices.length
  };
  if (row.key_type === 'server' && boundMac) {
    updatePayload.bound_mac = boundMac;
  }

  await keyRef.update(updatePayload);
  return res.json({
    success: true,
    isMaster: row.key_type === 'server',
    officeId: row.office_id || null,
    maxDevices,
    activeDevices: boundDevices.length,
    devicesList,
    geminiApiKey: row.gemini_api_key || null
  });
}

async function checkServerLicense(req, res) {
  const db = getDb();
  const { officeId, activeUsernames = [], publicUrl = null } = req.body || {};
  if (!officeId) return res.status(400).json({ error: 'officeId is required' });

  const snap = await db.collection('serial_keys')
    .where('office_id', '==', String(officeId))
    .where('key_type', '==', 'server')
    .get();

  if (snap.empty) return res.json({ exists: false, revoked: true, deleted: true });

  const docSnap = snap.docs[0];
  const data = docSnap.data() || {};
  const revoked = data.is_active === 0;

  const patch = { status: 'online', last_seen: Date.now() };
  if (publicUrl) {
    patch.public_url = String(publicUrl);
    patch.is_global = true;
  }
  await docSnap.ref.update(patch);

  const activeSet = new Set((activeUsernames || []).map(u => String(u).toLowerCase().trim()));
  const now = Date.now();
  const usersSnap = await db.collection('network_users').where('office_id', '==', String(officeId)).get();
  for (const uDoc of usersSnap.docs) {
    const u = uDoc.data() || {};
    const uname = String(u.username || '').toLowerCase().trim();
    const recentHb = Number(u.last_active_at || 0) > 0 && (now - Number(u.last_active_at) < 180000);
    if ((u.status || 'offline') === 'online' && !activeSet.has(uname) && !recentHb) {
      await uDoc.ref.update({ status: 'offline', current_device_id: null });
    }
  }

  return res.json({
    exists: true,
    revoked,
    deleted: false,
    geminiApiKey: (!revoked && typeof data.gemini_api_key === 'string' && data.gemini_api_key.trim().length > 5)
      ? data.gemini_api_key.trim()
      : null
  });
}

async function heartbeatSync(req, res) {
  const db = getDb();
  const { officeId, serialKey, deviceId, pcName, osUser, clientIp, username, eventType } = req.body || {};
  if (!officeId || !deviceId || deviceId === 'legacy_device') {
    return res.status(400).json({ allowed: false, code: 'DEVICE_ID_REQUIRED', error: 'Valid officeId and deviceId required' });
  }

  const keysSnap = await db.collection('serial_keys').where('office_id', '==', String(officeId)).get();
  const normKey = String(serialKey || '').trim().toUpperCase();

  if (eventType !== 'logout') {
    for (const docSnap of keysSnap.docs) {
      const kd = docSnap.data() || {};
      const devEntry = kd.devices_info?.[deviceId];
      if (devEntry && (devEntry.is_restricted === true || devEntry.status === 'RESTRICTED')) {
        return res.status(403).json({
          allowed: false,
          code: 'DEVICE_RESTRICTED',
          error: `Workstation "${devEntry.pc_name || deviceId}" has been restricted by Super Admin.`
        });
      }
    }
  }

  let targetDocs = [];
  if (normKey) {
    const matched = keysSnap.docs.find(d => d.id.toUpperCase() === normKey || String(d.data().key || '').toUpperCase() === normKey);
    if (matched) {
      const kd = matched.data() || {};
      if (eventType !== 'logout') {
        if (kd.is_active === 0) {
          return res.status(403).json({ allowed: false, code: 'KEY_REVOKED', error: 'This Serial Key has been revoked by Super Admin.' });
        }
        const bound = Array.isArray(kd.bound_devices) ? kd.bound_devices : (kd.device_id ? [kd.device_id] : []);
        if (!bound.includes(deviceId)) {
          return res.status(403).json({
            allowed: false,
            code: 'DEVICE_REMOVED',
            deviceRemoved: true,
            error: 'This PC was removed from the Serial Key by Super Admin. Please activate again.'
          });
        }
      }
      targetDocs = [matched];
    }
  }

  if (targetDocs.length === 0) {
    targetDocs = keysSnap.docs.filter(d => {
      const kd = d.data() || {};
      const bound = Array.isArray(kd.bound_devices) ? kd.bound_devices : (kd.device_id ? [kd.device_id] : []);
      return bound.includes(deviceId) || Boolean(kd.devices_info?.[deviceId]);
    });
  }

  if (eventType === 'heartbeat') {
    for (const docSnap of targetDocs) {
      const devEntry = docSnap.data()?.devices_info?.[deviceId];
      if (devEntry && devEntry.status === 'OFFLINE' && devEntry.force_offline_at) {
        return res.status(403).json({
          allowed: false,
          code: 'DEVICE_OFFLINE',
          error: `Session on "${devEntry.pc_name || deviceId}" was made offline by Super Admin.`
        });
      }
    }

    if (username && String(username).toLowerCase().trim() !== 'admin') {
      const uSnap = await db.collection('network_users').where('office_id', '==', String(officeId)).get();
      const uDoc = uSnap.docs.find(d => String(d.data().username || '').toLowerCase().trim() === String(username).toLowerCase().trim());
      if (uDoc) {
        const ud = uDoc.data() || {};
        if (ud.is_active === 0) return res.status(403).json({ allowed: false, code: 'USER_RESTRICTED', error: 'User restricted' });
        if (ud.status === 'offline' && !ud.current_device_id) {
          return res.status(403).json({ allowed: false, code: 'DEVICE_OFFLINE', error: 'Session terminated by Administrator.' });
        }
        await uDoc.ref.update({ last_active_at: Date.now() });
      }
    }
  }

  const nowMs = Date.now();
  const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  for (const docSnap of targetDocs) {
    const kd = docSnap.data() || {};
    const boundDevices = Array.isArray(kd.bound_devices) ? [...kd.bound_devices] : (kd.device_id ? [kd.device_id] : []);
    const devicesInfo = (kd.devices_info && typeof kd.devices_info === 'object') ? { ...kd.devices_info } : {};
    const existing = devicesInfo[deviceId] || {};

    devicesInfo[deviceId] = {
      ...existing,
      device_id: deviceId,
      pc_name: pcName || existing.pc_name || `PC-${deviceId.slice(-4)}`,
      os_user: osUser || existing.os_user || 'User',
      ip: clientIp || existing.ip || 'LAN',
      activated_at: existing.activated_at || nowStr,
      last_seen: nowStr,
      last_seen_ms: nowMs,
      status: eventType === 'logout' ? (existing.is_restricted ? 'RESTRICTED' : 'OFFLINE') : 'ONLINE',
      is_restricted: Boolean(existing.is_restricted),
      current_user: eventType === 'logout' ? null : (username || existing.current_user || null),
      force_offline_at: eventType === 'login' ? null : (existing.force_offline_at || null)
    };

    await docSnap.ref.update({
      devices_info: devicesInfo,
      devices_list: Object.values(devicesInfo),
      active_pc_count: boundDevices.length
    });
  }

  return res.json({ allowed: true });
}

async function verifyUserLogin(req, res) {
  const db = getDb();
  const { officeId, username, password, deviceId, pcName, clientIp } = req.body || {};
  const userKey = String(username || '').toLowerCase().trim();
  if (!officeId || !userKey || !password || !deviceId || deviceId === 'legacy_device') {
    return res.status(400).json({ error: 'Missing required authentication parameters' });
  }

  const snap = await db.collection('network_users').where('office_id', '==', String(officeId)).get();
  const foundDoc = snap.docs.find(d => String(d.data().username || '').toLowerCase().trim() === userKey);
  if (!foundDoc) return res.status(404).json({ error: 'User not found' });

  const user = foundDoc.data() || {};
  if (user.is_active === 0) return res.status(403).json({ error: 'Account restricted.' });

  const storedHash = user.password_hash || '';
  const match = storedHash.startsWith('$2') ? await bcrypt.compare(password, storedHash) : false;
  if (!match) return res.status(401).json({ error: 'Invalid password.' });

  const ACTIVE_SESSION_THRESHOLD_MS = 3 * 60 * 1000;
  const isSessionRecent = (Date.now() - (Number(user.last_active_at) || 0)) < ACTIVE_SESSION_THRESHOLD_MS;
  const currentActiveDevice = user.current_device_id || user.device_id;

  if (user.role !== 'admin' && user.status === 'online' && isSessionRecent && currentActiveDevice && currentActiveDevice !== deviceId) {
    return res.status(403).json({
      error: `Account "${user.username}" is currently active on another PC. Please log out from that PC first before logging in here.`
    });
  }

  await foundDoc.ref.update({
    current_device_id: deviceId,
    device_id: deviceId,
    last_active_at: Date.now(),
    status: 'online'
  });

  await db.collection('audit_logs').add({
    username: user.username,
    ip: clientIp || '127.0.0.1',
    system: pcName || 'Workstation',
    time: new Date().toLocaleString(),
    action: 'Logged In',
    office_id: String(officeId)
  });

  return res.json({ success: true, user: getSafeUser(foundDoc.id, user) });
}

async function manageUsers(req, res) {
  const db = getDb();
  const { action, officeId, username, password, name, designation, department, role } = req.body || {};
  if (!officeId) return res.status(400).json({ error: 'officeId is required' });

  const usersCol = db.collection('network_users');
  const snap = await usersCol.where('office_id', '==', String(officeId)).get();

  if (action === 'list') {
    return res.json({ users: snap.docs.map(d => getSafeUser(d.id, d.data())) });
  }

  const userKey = String(username || '').toLowerCase().trim();
  const targetDoc = snap.docs.find(d => String(d.data().username || '').toLowerCase().trim() === userKey);

  if (action === 'verifyAdminPassword') {
    if (!targetDoc || String(targetDoc.data().role || '').toLowerCase() !== 'admin') {
      return res.status(401).json({ valid: false, error: 'Admin account not found.' });
    }
    const hash = targetDoc.data().password_hash || '';
    const valid = hash.startsWith('$2') ? await bcrypt.compare(String(password || ''), hash) : false;
    return res.status(valid ? 200 : 401).json({ valid });
  }

  if (action === 'create') {
    if (!userKey || !password) return res.status(400).json({ error: 'username and password required' });
    if (targetDoc) return res.status(400).json({ error: 'User already exists' });
    const hash = await bcrypt.hash(String(password), 10);
    const docRef = await usersCol.add({
      name: name || username,
      designation: designation || '',
      department: department || '',
      username: userKey,
      password_hash: hash,
      role: role || 'user',
      is_active: 1,
      office_id: String(officeId),
      current_device_id: null,
      status: 'offline'
    });
    return res.json({ success: true, id: docRef.id, passwordHash: hash });
  }

  if (action === 'releaseSession' || action === 'logout') {
    if (targetDoc) await targetDoc.ref.update({ status: 'offline', current_device_id: null, last_active_at: null });
    return res.json({ success: true });
  }

  if (action === 'deactivate') {
    if (targetDoc && userKey !== 'admin') await targetDoc.ref.update({ is_active: 0 });
    return res.json({ success: true });
  }

  return res.status(400).json({ error: 'Unknown manageUsers action' });
}

async function manageKeys(req, res) {
  const db = getDb();
  const { action, officeId, key, maxDevices, keyType, isActive, deviceId, isGlobal } = req.body || {};

  if (action === 'listServers') {
    if (isGlobal) {
      const snap = await db.collection('serial_keys').where('is_global', '==', true).get();
      return res.json({ servers: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    }
    if (!officeId) return res.json({ servers: [] });
    const snap = await db.collection('serial_keys')
      .where('office_id', '==', String(officeId))
      .where('key_type', '==', 'server')
      .get();
    return res.json({ servers: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  }

  if (!officeId) return res.status(400).json({ error: 'officeId is required' });

  if (action === 'list') {
    const snap = await db.collection('serial_keys').where('office_id', '==', String(officeId)).get();
    const rows = snap.docs.map(d => {
      const data = d.data() || {};
      return {
        id: d.id,
        key: d.id,
        ...data,
        max_devices: data.max_devices !== undefined ? Number(data.max_devices) : 1,
        bound_devices: Array.isArray(data.bound_devices) ? data.bound_devices : (data.device_id ? [data.device_id] : [])
      };
    });
    return res.json({ keys: rows });
  }

  if (action === 'create') {
    const seats = Math.max(1, Number(maxDevices) || 1);
    const customKey = (key && String(key).trim().toUpperCase()) ||
      ('VASWANI-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' +
        Math.random().toString(36).substring(2, 6).toUpperCase() + '-' +
        Math.random().toString(36).substring(2, 6).toUpperCase());
    await db.collection('serial_keys').doc(customKey).set({
      key: customKey,
      key_type: keyType || 'PRO',
      is_active: 1,
      max_devices: seats,
      bound_devices: [],
      device_id: null,
      office_id: String(officeId),
      created_at: new Date().toISOString()
    });
    return res.json({ success: true, key: customKey, max_devices: seats });
  }

  if (!key) return res.status(400).json({ error: 'key is required' });
  const keyRef = db.collection('serial_keys').doc(String(key));
  const snap = await keyRef.get();
  if (!snap.exists) return res.status(404).json({ error: 'Serial key not found' });
  if (snap.data().office_id && snap.data().office_id !== String(officeId)) {
    return res.status(403).json({ error: 'Access denied for external office key' });
  }

  if (action === 'toggle') {
    await keyRef.update({ is_active: isActive });
    return res.json({ success: true });
  }
  if (action === 'seats') {
    const newMax = Math.max(1, Number(maxDevices) || 1);
    await keyRef.update({ max_devices: newMax });
    return res.json({ success: true, max_devices: newMax });
  }
  if (action === 'unbind') {
    await keyRef.update({ device_id: null, bound_mac: null, bound_devices: [], devices_info: {}, devices_list: [], active_pc_count: 0 });
    return res.json({ success: true });
  }
  if (action === 'unbindDevice') {
    if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
    const data = snap.data() || {};
    const boundDevices = (Array.isArray(data.bound_devices) ? data.bound_devices : []).filter(d => d !== deviceId);
    const devicesInfo = (data.devices_info && typeof data.devices_info === 'object') ? { ...data.devices_info } : {};
    delete devicesInfo[deviceId];
    await keyRef.update({
      bound_devices: boundDevices,
      device_id: boundDevices[0] || null,
      devices_info: devicesInfo,
      devices_list: Object.values(devicesInfo),
      active_pc_count: boundDevices.length
    });
    return res.json({ success: true, remaining: boundDevices.length });
  }

  return res.status(400).json({ error: 'Unknown manageKeys action' });
}

async function usageSync(req, res) {
  const db = getDb();
  const { action, officeId, moduleName, isEnabled } = req.body || {};
  if (!officeId) return res.status(400).json({ error: 'officeId is required' });

  if (action === 'list') {
    const snap = await db.collection('module_usage').where('office_id', '==', String(officeId)).get();
    return res.json({ rows: snap.docs.map(d => ({ module_name: d.id, ...d.data() })) });
  }

  if (!moduleName) return res.status(400).json({ error: 'moduleName is required' });
  const ref = db.collection('module_usage').doc(`${officeId}_${moduleName}`);

  if (action === 'increment') {
    const snap = await ref.get();
    let currentCount = 0;
    let enabled = 1;
    if (snap.exists) {
      const data = snap.data() || {};
      currentCount = data.usage_count || 0;
      enabled = data.is_enabled !== undefined ? data.is_enabled : 1;
      if (enabled === 0) return res.status(403).json({ error: 'Module disabled by Super Admin.' });
    }
    await ref.set({ office_id: String(officeId), usage_count: currentCount + 1, is_enabled: enabled }, { merge: true });
    return res.json({ success: true, usage_count: currentCount + 1 });
  }

  if (action === 'toggle') {
    await ref.set({ office_id: String(officeId), is_enabled: isEnabled }, { merge: true });
    return res.json({ success: true });
  }

  return res.status(400).json({ error: 'Unknown usageSync action' });
}

async function geminiKeySync(req, res) {
  const db = getDb();
  const { action, officeId, apiKey, scope = 'office', updatedBy } = req.body || {};

  if (action === 'fetch') {
    if (officeId) {
      const snap = await db.collection('serial_keys')
        .where('office_id', '==', String(officeId))
        .where('key_type', '==', 'server')
        .get();
      if (!snap.empty) {
        const data = snap.docs[0].data() || {};
        for (const [k, v] of Object.entries(data)) {
          if (k.trim() === 'gemini_api_key' && typeof v === 'string' && v.trim().length > 5) {
            return res.json({ apiKey: v.trim(), origin: 'cloud_office' });
          }
        }
      }
    }
    const globalSnap = await db.collection('system_config').doc('ai_settings').get();
    if (globalSnap.exists) {
      const data = globalSnap.data() || {};
      for (const [k, v] of Object.entries(data)) {
        if (k.trim() === 'gemini_api_key' && typeof v === 'string' && v.trim().length > 5) {
          return res.json({ apiKey: v.trim(), origin: 'cloud_global' });
        }
      }
    }
    return res.json({ apiKey: null, origin: null });
  }

  if (action === 'push') {
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(400).json({ error: 'Valid apiKey string is required' });
    }
    const trimmed = apiKey.trim();
    if (scope === 'office') {
      if (!officeId) return res.status(400).json({ error: 'officeId is required for office scope' });
      const snap = await db.collection('serial_keys')
        .where('office_id', '==', String(officeId))
        .where('key_type', '==', 'server')
        .get();
      if (snap.empty) return res.status(404).json({ error: `Server key not found for office ${officeId}` });
      await snap.docs[0].ref.update({ gemini_api_key: trimmed, gemini_key_updated_at: Date.now() });
      return res.json({ ok: true, origin: 'cloud_office' });
    }
    await db.collection('system_config').doc('ai_settings').set({
      gemini_api_key: trimmed,
      updated_at: Date.now(),
      updated_by: updatedBy || 'admin'
    }, { merge: true });
    return res.json({ ok: true, origin: 'cloud_global' });
  }

  return res.status(400).json({ error: 'Unknown geminiKeySync action' });
}

const HANDLERS = {
  activateKey,
  checkServerLicense,
  heartbeatSync,
  verifyUserLogin,
  manageUsers,
  manageKeys,
  usageSync,
  geminiKeySync
};

const SUPER_ADMIN_ALLOWED_ORIGINS = new Set([
  'https://reco-vaswani-license.web.app',
  'https://reco-vaswani-license.firebaseapp.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
]);

function applySuperAdminCors(req, res) {
  const origin = req.headers?.origin;
  if (origin && SUPER_ADMIN_ALLOWED_ORIGINS.has(origin) && typeof res.setHeader === 'function') {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-super-admin-token');
    res.setHeader('Vary', 'Origin');
  }
}

function getSuperAdminSigningKey() {
  const secret = process.env.SUPER_ADMIN_PASSWORD || '';
  const salt = process.env.LICENSE_GATEWAY_TOKEN || 'vaswani-superadmin';
  return crypto.createHmac('sha256', salt).update(secret).digest('hex');
}

function issueSuperAdminToken() {
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${exp}.${nonce}`;
  const sig = crypto.createHmac('sha256', getSuperAdminSigningKey()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifySuperAdminToken(token) {
  if (!token || typeof token !== 'string' || !process.env.SUPER_ADMIN_PASSWORD) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expStr, nonce, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = crypto.createHmac('sha256', getSuperAdminSigningKey()).update(`${expStr}.${nonce}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

const DEFAULT_MODULES = ['TallyConverter', 'Consolidator', 'RecoEngine', 'OCR', 'Returns', 'Dashboard', 'TallyDirect', 'Tracker', 'FinStatements', 'Forensic'];

async function handleSuperAdminRequest(req, res) {
  applySuperAdminCors(req, res);
  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function' && typeof res.end === 'function') return res.status(204).end();
    return res.status(204).json({});
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { subAction } = req.body || {};
  const expectedPw = process.env.SUPER_ADMIN_PASSWORD || '';
  if (!expectedPw) return res.status(503).json({ error: 'SUPER_ADMIN_PASSWORD not configured on gateway' });

  if (subAction === 'login') {
    const provided = String(req.body?.password || '');
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expectedPw, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Invalid Admin Password' });
    }
    return res.json({ ok: true, token: issueSuperAdminToken() });
  }

  const token = String(req.headers?.['x-super-admin-token'] || '');
  if (!verifySuperAdminToken(token)) {
    return res.status(401).json({ error: 'Super Admin session expired or unauthorized' });
  }

  const db = getDb();

  if (subAction === 'listOffices') {
    const snap = await db.collection('offices').get();
    return res.json({ offices: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  }

  if (subAction === 'createOffice') {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Office name required' });
    const officeId = name.toUpperCase().replace(/\s+/g, '_');
    await db.collection('offices').doc(officeId).set({
      name: name.toUpperCase(),
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    const serverKey = `${officeId}-${Math.random().toString(36).substring(2, 8).toUpperCase()}-SRV`;
    await db.collection('serial_keys').doc(serverKey).set({
      key: serverKey, is_active: 1, key_type: 'server', device_id: null, office_id: officeId
    });
    for (const mod of DEFAULT_MODULES) {
      await db.collection('module_usage').doc(`${officeId}_${mod}`).set({
        name: mod, is_enabled: 1, usage_count: 0, office_id: officeId, module_name: mod
      });
    }
    return res.json({ ok: true, officeId, serverKey });
  }

  const officeId = String(req.body?.officeId || '').trim();

  if (subAction === 'getOfficeData') {
    if (!officeId) return res.status(400).json({ error: 'officeId required' });
    const [modSnap, keySnap, userSnap, logSnap, recoSnap] = await Promise.all([
      db.collection('module_usage').where('office_id', '==', officeId).get(),
      db.collection('serial_keys').where('office_id', '==', officeId).get(),
      db.collection('network_users').where('office_id', '==', officeId).get(),
      db.collection('audit_logs').where('office_id', '==', officeId).get(),
      db.collection('reco_history').where('office_id', '==', officeId).get()
    ]);

    const modules = modSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const fetchedNames = new Set(modules.map(m => m.name || m.module_name || String(m.id).split('_')[1]));
    for (const mod of DEFAULT_MODULES) {
      if (!fetchedNames.has(mod)) {
        const docData = { name: mod, is_enabled: 1, usage_count: 0, office_id: officeId, module_name: mod };
        await db.collection('module_usage').doc(`${officeId}_${mod}`).set(docData);
        modules.push({ id: `${officeId}_${mod}`, ...docData });
      }
    }

    return res.json({
      modules,
      keys: keySnap.docs.map(d => ({ id: d.id, ...d.data() })),
      networkUsers: userSnap.docs.map(d => getSafeUser(d.id, d.data())),
      activityLogs: logSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      recoHistory: recoSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    });
  }

  if (subAction === 'deleteOffice') {
    if (!officeId) return res.status(400).json({ error: 'officeId required' });
    for (const col of ['serial_keys', 'network_users', 'module_usage']) {
      const s = await db.collection(col).where('office_id', '==', officeId).get();
      await Promise.all(s.docs.map(d => d.ref.delete()));
    }
    await db.collection('offices').doc(officeId).delete();
    return res.json({ ok: true });
  }

  if (subAction === 'triggerKillSwitch') {
    const snap = await db.collection('serial_keys').where('office_id', '==', officeId).where('key_type', '==', 'server').get();
    if (snap.empty) return res.status(404).json({ error: 'No server key found for this office' });
    await snap.docs[0].ref.update({ kill_switch: true });
    return res.json({ ok: true });
  }

  if (subAction === 'createUser') {
    const cleanUsername = String(req.body?.username || '').toLowerCase().trim();
    const rawPw = String(req.body?.password || '');
    if (!officeId || !cleanUsername || !rawPw) return res.status(400).json({ error: 'Missing required fields' });
    const existing = await db.collection('network_users').where('office_id', '==', officeId).get();
    if (existing.docs.some(d => String(d.data().username || '').toLowerCase().trim() === cleanUsername)) {
      return res.status(400).json({ error: `User ID "@${cleanUsername}" already exists in ${officeId}.` });
    }
    const role = String(req.body?.role || 'user');
    const passwordHash = await bcrypt.hash(rawPw, 10);
    await db.collection('network_users').add({
      name: String(req.body?.name || '').trim() || cleanUsername,
      designation: String(req.body?.designation || '').trim() || (role === 'Senior Auditor' ? 'Senior Auditor' : role === 'Admin' ? 'Administrator' : 'Article Assistant'),
      department: String(req.body?.department || '').trim() || 'Audit & Assurance',
      username: cleanUsername,
      password_hash: passwordHash,
      role,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      is_active: 1,
      office_id: officeId,
      device_id: null,
      current_device_id: null,
      status: 'offline'
    });
    return res.json({ ok: true });
  }

  if (subAction === 'toggleUser') {
    const userId = String(req.body?.userId || '');
    const currentStatus = Number(req.body?.currentStatus);
    await db.collection('network_users').doc(userId).update({ is_active: currentStatus === 1 ? 0 : 1 });
    return res.json({ ok: true });
  }

  if (subAction === 'unbindUser') {
    await db.collection('network_users').doc(String(req.body?.userId || '')).update({
      device_id: null, current_device_id: null, status: 'offline'
    });
    return res.json({ ok: true });
  }

  if (subAction === 'deleteUser') {
    await db.collection('network_users').doc(String(req.body?.userId || '')).delete();
    return res.json({ ok: true });
  }

  if (subAction === 'createMultiPcKey') {
    const seats = Math.max(1, parseInt(String(req.body?.seats || '5'), 10) || 5);
    const newKey = `${officeId}-${Math.random().toString(36).substring(2, 8).toUpperCase()}-MULTI`;
    await db.collection('serial_keys').doc(newKey).set({
      key: newKey,
      is_active: 1,
      key_type: 'client',
      device_id: null,
      bound_devices: [],
      max_devices: seats,
      office_id: officeId,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ ok: true, key: newKey, seats });
  }

  if (subAction === 'updateKeySeats') {
    const updated = Math.max(1, Number(req.body?.maxDevices) || 1);
    await db.collection('serial_keys').doc(String(req.body?.keyId || '')).update({ max_devices: updated });
    return res.json({ ok: true });
  }

  if (subAction === 'toggleKey') {
    const currentStatus = Number(req.body?.currentStatus);
    await db.collection('serial_keys').doc(String(req.body?.keyId || '')).update({ is_active: currentStatus === 1 ? 0 : 1 });
    return res.json({ ok: true });
  }

  const releaseUsersOnDevice = async (devId) => {
    if (!officeId || !devId) return;
    const uSnap = await db.collection('network_users').where('office_id', '==', officeId).get();
    await Promise.all(uSnap.docs
      .filter(d => d.data().current_device_id === devId || d.data().device_id === devId)
      .map(d => d.ref.update({ status: 'offline', device_id: null, current_device_id: null, last_active_at: null }))
    );
  };

  if (subAction === 'unbindKey') {
    const keyId = String(req.body?.keyId || '');
    const keyRef = db.collection('serial_keys').doc(keyId);
    const snap = await keyRef.get();
    const kd = snap.data() || {};
    const existingIds = Array.isArray(kd.bound_devices) ? kd.bound_devices : (kd.device_id ? [kd.device_id] : []);
    await keyRef.update({ device_id: null, bound_mac: null, bound_devices: [], devices_info: {}, devices_list: [], active_pc_count: 0 });
    await Promise.all(existingIds.map(id => releaseUsersOnDevice(id)));
    return res.json({ ok: true });
  }

  if (subAction === 'removeDeviceFromKey') {
    const keyRef = db.collection('serial_keys').doc(String(req.body?.keyId || ''));
    const devId = String(req.body?.deviceId || '');
    const snap = await keyRef.get();
    const kd = snap.data() || {};
    const bound = (Array.isArray(kd.bound_devices) ? kd.bound_devices : (kd.device_id ? [kd.device_id] : [])).filter(d => d !== devId);
    const info = (kd.devices_info && typeof kd.devices_info === 'object') ? { ...kd.devices_info } : {};
    delete info[devId];
    await keyRef.update({ bound_devices: bound, device_id: bound[0] || null, devices_info: info, devices_list: Object.values(info), active_pc_count: bound.length });
    await releaseUsersOnDevice(devId);
    return res.json({ ok: true });
  }

  if (subAction === 'toggleRestrictDevice') {
    const keyRef = db.collection('serial_keys').doc(String(req.body?.keyId || ''));
    const devId = String(req.body?.deviceId || '');
    const nextRestricted = Boolean(req.body?.nextRestricted);
    const snap = await keyRef.get();
    const kd = snap.data() || {};
    const info = (kd.devices_info && typeof kd.devices_info === 'object') ? { ...kd.devices_info } : {};
    const prev = info[devId] || { device_id: devId, pc_name: devId };
    info[devId] = {
      ...prev,
      device_id: devId,
      is_restricted: nextRestricted,
      status: nextRestricted ? 'RESTRICTED' : 'ACTIVE',
      restricted_at: nextRestricted ? new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : null,
      current_user: nextRestricted ? null : (prev.current_user || null)
    };
    await keyRef.update({ devices_info: info, devices_list: Object.values(info) });
    if (nextRestricted) await releaseUsersOnDevice(devId);
    return res.json({ ok: true });
  }

  if (subAction === 'makeDeviceOffline') {
    const keyRef = db.collection('serial_keys').doc(String(req.body?.keyId || ''));
    const devId = String(req.body?.deviceId || '');
    const snap = await keyRef.get();
    const kd = snap.data() || {};
    const info = (kd.devices_info && typeof kd.devices_info === 'object') ? { ...kd.devices_info } : {};
    const prev = info[devId] || { device_id: devId, pc_name: devId };
    info[devId] = {
      ...prev,
      device_id: devId,
      status: prev.is_restricted ? 'RESTRICTED' : 'OFFLINE',
      current_user: null,
      force_offline_at: Date.now(),
      last_seen: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    };
    await keyRef.update({ devices_info: info, devices_list: Object.values(info) });
    await releaseUsersOnDevice(devId);
    return res.json({ ok: true });
  }

  if (subAction === 'toggleModule') {
    const currentStatus = Number(req.body?.currentStatus);
    await db.collection('module_usage').doc(String(req.body?.moduleId || '')).update({ is_enabled: currentStatus === 1 ? 0 : 1 });
    return res.json({ ok: true });
  }

  if (subAction === 'resetModule') {
    await db.collection('module_usage').doc(String(req.body?.moduleId || '')).update({ usage_count: 0 });
    return res.json({ ok: true });
  }

  if (subAction === 'clearActivityLogs') {
    const snap = await db.collection('audit_logs').where('office_id', '==', officeId).get();
    await Promise.all(snap.docs.map(d => d.ref.delete()));
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: `Unknown superAdmin subAction: ${subAction}` });
}

async function dispatchLicenseRequest(action, req, res) {
  if (action === 'superAdmin') {
    try {
      return await handleSuperAdminRequest(req, res);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!assertAuthorizedClient(req, res)) return;
  const handler = HANDLERS[action];
  if (!handler) return res.status(404).json({ error: `Unknown license gateway endpoint: ${action}` });
  try {
    return await handler(req, res);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  HANDLERS,
  dispatchLicenseRequest,
  assertAuthorizedClient
};

