const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function assertAuthorizedClient(req, res) {
  const sharedToken = process.env.LICENSE_GATEWAY_TOKEN;
  if (sharedToken) {
    const provided = String(req.headers['x-license-token'] || '');
    if (provided !== sharedToken) {
      res.status(401).json({ error: 'Unauthorized licensing gateway request' });
      return false;
    }
  }
  return true;
}

function getSafeUser(docId, data = {}) {
  const { password_hash: _ph, password: _pw, ...safe } = data;
  return { id: docId, ...safe };
}

/**
 * POST /activateKey
 * Validates serial key, enforces seat limit, binds deviceId, and returns office/AI metadata.
 */
exports.activateKey = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!assertAuthorizedClient(req, res)) return;

  try {
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
        return res.status(403).json({
          error: `License limit reached (${boundDevices.length}/${maxDevices} PCs active).`
        });
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
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /checkServerLicense
 * Polls server key validity, marks server online, cleans stale sessions, and returns office Gemini key.
 */
exports.checkServerLicense = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!assertAuthorizedClient(req, res)) return;

  try {
    const { officeId, activeUsernames = [], publicUrl = null } = req.body || {};
    if (!officeId) return res.status(400).json({ error: 'officeId is required' });

    const snap = await db.collection('serial_keys')
      .where('office_id', '==', String(officeId))
      .where('key_type', '==', 'server')
      .get();

    if (snap.empty) {
      return res.json({ exists: false, revoked: true, deleted: true });
    }

    const docSnap = snap.docs[0];
    const data = docSnap.data() || {};
    const revoked = data.is_active === 0;

    const patch = { status: 'online', last_seen: Date.now() };
    if (publicUrl) {
      patch.public_url = String(publicUrl);
      patch.is_global = true;
    }
    await docSnap.ref.update(patch);

    // Clean up stale online users for this office
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
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /heartbeatSync
 * Validates device restriction, seat membership, forced offline, user status, and updates telemetry.
 */
exports.heartbeatSync = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!assertAuthorizedClient(req, res)) return;

  try {
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
          if (ud.is_active === 0) {
            return res.status(403).json({ allowed: false, code: 'USER_RESTRICTED', error: 'User restricted' });
          }
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
  } catch (err) {
    return res.status(500).json({ allowed: true, offline: true, error: err.message });
  }
});

/**
 * POST /verifyUserLogin
 * Authenticates office user via bcrypt inside Cloud Functions, checks floating sessions, and logs login.
 */
exports.verifyUserLogin = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!assertAuthorizedClient(req, res)) return;

  try {
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

    return res.json({
      success: true,
      user: getSafeUser(foundDoc.id, user)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /manageUsers
 * Actions: list, create, releaseSession, deactivate, logout, verifyAdminPassword
 */
exports.manageUsers = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!assertAuthorizedClient(req, res)) return;

  try {
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
      if (targetDoc) {
        await targetDoc.ref.update({ status: 'offline', current_device_id: null, last_active_at: null });
      }
      return res.json({ success: true });
    }

    if (action === 'deactivate') {
      if (targetDoc && userKey !== 'admin') {
        await targetDoc.ref.update({ is_active: 0 });
      }
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown manageUsers action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /manageKeys
 * Actions: list, create, toggle, seats, unbind, unbindDevice, listServers
 */
exports.manageKeys = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!assertAuthorizedClient(req, res)) return;

  try {
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
      await keyRef.update({
        device_id: null,
        bound_mac: null,
        bound_devices: [],
        devices_info: {},
        devices_list: [],
        active_pc_count: 0
      });
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
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /usageSync
 * Actions: list, increment, toggle
 */
exports.usageSync = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!assertAuthorizedClient(req, res)) return;

  try {
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
        if (enabled === 0) {
          return res.status(403).json({ error: 'Module disabled by Super Admin.' });
        }
      }
      await ref.set({ office_id: String(officeId), usage_count: currentCount + 1, is_enabled: enabled }, { merge: true });
      return res.json({ success: true, usage_count: currentCount + 1 });
    }

    if (action === 'toggle') {
      await ref.set({ office_id: String(officeId), is_enabled: isEnabled }, { merge: true });
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown usageSync action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /geminiKeySync
 * Actions: fetch, push
 */
exports.geminiKeySync = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!assertAuthorizedClient(req, res)) return;

  try {
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
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
