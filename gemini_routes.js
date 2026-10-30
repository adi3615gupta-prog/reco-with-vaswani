import { GoogleGenerativeAI } from '@google/generative-ai';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where } from "firebase/firestore";

/**
 * Search the SQLite clients table for clients matching keywords in the user query.
 * 
 * @param {import('sqlite3').Database} db 
 * @param {string} message 
 * @returns {Promise<Array<{ gstin: string, name: string }>>}
 */
export function findMatchingClients(db, message) {
  return new Promise((resolve) => {
    if (!db || !message || typeof message !== 'string') return resolve([]);

    // Extract potential client tokens (alphanumeric >= 3 chars, filtering standard English/tax words)
    const stopWords = new Set([
      'the', 'and', 'for', 'open', 'show', 'working', 'sheet', 'reco', 'return',
      'returns', 'please', 'with', 'what', 'gstr', 'gstr1', 'gstr3b', 'gstr2b',
      'tally', 'from', 'audit', 'data', 'file', 'portal', 'pvt', 'ltd', 'private',
      'limited', 'help', 'check', 'view', 'goto', 'take', 'want', 'kaise', 'karo',
      'reversal', 'reversals', 'month', 'year', 'fy', 'table', 'itc', 'rule',
      'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
      'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december'
    ]);

    const tokens = message
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w));

    if (tokens.length === 0) return resolve([]);

    const conditions = [];
    const params = [];
    tokens.forEach((tok) => {
      conditions.push('(trade_name LIKE ? OR legal_name LIKE ? OR gstin LIKE ?)');
      params.push(`%${tok}%`, `%${tok}%`, `%${tok}%`);
    });

    const sql = `
      SELECT gstin, trade_name, legal_name 
      FROM clients 
      WHERE (is_deleted = 0 OR is_deleted IS NULL) AND (${conditions.join(' OR ')})
      LIMIT 10
    `;

    db.all(sql, params, (err, rows) => {
      if (err || !rows) return resolve([]);
      resolve(
        rows.map((r) => ({
          gstin: (r.gstin || '').trim().toUpperCase(),
          name: (r.trade_name || r.legal_name || '').trim(),
        }))
      );
    });
  });
}

export const FAST_PATH_TARGET_LABELS = {
  reversal: 'GSTR-3B Table 4(B) ITC Reversals & Allocations',
  '3b': 'GSTR-3B 28-Line Working Sheet',
  ims: 'GST Invoice Management System (IMS Hub)',
  gstr1: 'GSTR-1 Sales Console & Downloader',
  reco: '2B vs Books Reconciliation & Vendor Dispute Hub',
  notices: 'GST Notices, Orders & Autonomous Legal Reply Suite',
  tds: 'TDS / TCS Consolidator & TRACES Reco',
  tally: 'Tally Prime Direct Bridge (Port 9000)',
  incometax: 'Income Tax Regime Engine (Old vs 115BAC)',
  cma: 'Bank CMA Credit Appraisal (5-Yr MPBF)',
  finstatements: 'Schedule III Financial Statements',
  audit: 'Statutory Audit Suite & Daybook Scrutiny',
  clause44: 'Tax Audit Form 3CD Clause 44 Engine',
  settings: 'System Configuration & Settings',
};

/**
 * Instant Local Intent Fast-Path Engine (<15ms).
 * Directly resolves software navigation commands without waiting for cloud LLM roundtrips.
 * 
 * @param {string} message 
 * @param {Array<{ gstin: string, name: string }>} matchedClients 
 * @returns {{ fastPath: true, target: string, client?: any, fy?: string, month?: string, actionToken: string, reply: string } | null}
 */
export function tryFastPathNavigation(message, matchedClients = []) {
  if (!message || typeof message !== 'string') return null;
  const lowerMsg = message.toLowerCase().trim();

  // If message asks an advisory or explanatory question, let cloud Gemini answer
  const isQuestion = /\b(kya hai|what is|how to|why|rules?|explain|difference|calculate|penalty|interest|kaise|meaning|provision)\b/i.test(lowerMsg);
  if (isQuestion) return null;

  // Check if intent is navigation / open / view / switch
  const isNavVerb = /\b(open|show|goto|navigate|view|kholo|chalo|dekho|load|switch|launch|run|jump)\b/i.test(lowerMsg);
  const hasClient = matchedClients && matchedClients.length > 0;

  let target = null;
  if (lowerMsg.includes('reversal')) target = 'reversal';
  else if (lowerMsg.includes('3b') || lowerMsg.includes('working sheet')) target = '3b';
  else if (lowerMsg.includes('ims')) target = 'ims';
  else if (lowerMsg.includes('gstr1') || lowerMsg.includes('gstr-1') || lowerMsg.includes('sales')) target = 'gstr1';
  else if (lowerMsg.includes('reco') || lowerMsg.includes('reconcil')) target = 'reco';
  else if (lowerMsg.includes('notice') || lowerMsg.includes('order') || lowerMsg.includes('drc') || lowerMsg.includes('asmt')) target = 'notices';
  else if (lowerMsg.includes('tds') || lowerMsg.includes('traces') || lowerMsg.includes('26as')) target = 'tds';
  else if (lowerMsg.includes('tally')) target = 'tally';
  else if (lowerMsg.includes('income tax') || lowerMsg.includes('incometax') || lowerMsg.includes('115bac') || lowerMsg.includes('itr')) target = 'incometax';
  else if (lowerMsg.includes('cma') || lowerMsg.includes('mpbf') || lowerMsg.includes('banking appraisal')) target = 'cma';
  else if (lowerMsg.includes('fin statements') || lowerMsg.includes('financial statement') || lowerMsg.includes('balance sheet') || lowerMsg.includes('p&l')) target = 'finstatements';
  else if (lowerMsg.includes('clause44') || lowerMsg.includes('clause 44') || lowerMsg.includes('3cd')) target = 'clause44';
  else if (lowerMsg.includes('audit')) target = 'audit';
  else if (lowerMsg.includes('setting') || lowerMsg.includes('config')) target = 'settings';

  if (!target) {
    if (hasClient && isNavVerb) target = '3b'; // Default to 3B working when client navigation is requested
    else return null;
  }

  // Must have a navigation verb OR a matched client OR an explicit target like "reversal", "ims", "3b"
  if (!isNavVerb && !hasClient && !['reversal', '3b', 'ims', 'gstr1', 'reco', 'notices', 'tds', 'tally', 'incometax', 'cma', 'audit', 'clause44', 'settings'].includes(target)) {
    return null;
  }

  // Extract Financial Year
  let fy = null;
  const fyMatch = lowerMsg.match(/\b(?:fy\s*)?(?:20)?(\d{2})[-/](\d{2})\b/i);
  if (fyMatch) fy = `20${fyMatch[1]}-${fyMatch[2]}`;

  // Extract Month
  const monthMap = {
    april: 'April', apr: 'April',
    may: 'May',
    june: 'June', jun: 'June',
    july: 'July', jul: 'July',
    august: 'August', aug: 'August',
    september: 'September', sept: 'September', sep: 'September',
    october: 'October', oct: 'October',
    november: 'November', nov: 'November',
    december: 'December', dec: 'December',
    january: 'January', jan: 'January',
    february: 'February', feb: 'February',
    march: 'March', mar: 'March'
  };
  let month = null;
  for (const [k, v] of Object.entries(monthMap)) {
    const r = new RegExp(`\\b${k}\\b`, 'i');
    if (r.test(lowerMsg)) { month = v; break; }
  }

  const targetLabel = FAST_PATH_TARGET_LABELS[target] || target.toUpperCase();
  const client = matchedClients[0];
  const tokenParts = [target];
  if (client) tokenParts.push(client.gstin);
  if (fy) tokenParts.push(fy);
  if (month) tokenParts.push(month);

  const actionToken = `[ACTION:navigate:${tokenParts.join(':')}]`;
  const periodText = [month, fy ? `FY ${fy}` : null].filter(Boolean).join(' • ');

  let reply = '';
  if (client) {
    reply = `Opening **${targetLabel}** for **${client.name}**${periodText ? ` (${periodText})` : ''}.\n\n${actionToken}`;
  } else {
    reply = `Opening **${targetLabel}**${periodText ? ` (${periodText})` : ''}.\n\n${actionToken}`;
  }

  return {
    fastPath: true,
    target,
    client,
    fy,
    month,
    actionToken,
    reply
  };
}

/**
 * Sanitizes chat history to conform strictly to Google Gemini's multi-turn conversational rules:
 * 1. History must start with role 'user'.
 * 2. Turns must strictly alternate between 'user' and 'model'.
 * 3. Consecutive turns with the same role are merged into one turn with '\n\n'.
 * 4. Trailing 'user' turns are removed because chat.sendMessage(new_message) provides the final 'user' turn.
 * 5. Returns items formatted as [{ role: 'user' | 'model', parts: [{ text }] }]
 * 
 * @param {Array<{ role: string, text?: string, parts?: Array<{ text: string }> }>} rawHistory 
 * @returns {Array<{ role: 'user' | 'model', parts: [{ text: string }] }>}
 */
export function sanitizeGeminiHistory(rawHistory) {
  if (!Array.isArray(rawHistory) || rawHistory.length === 0) return [];

  // 1. Extract valid entries with clean text
  const valid = [];
  for (const item of rawHistory) {
    if (!item) continue;
    const role = (item.role === 'user' || item.role === 'model') ? item.role : null;
    if (!role) continue;

    let text = '';
    if (typeof item.text === 'string') {
      text = item.text.trim();
    } else if (Array.isArray(item.parts) && item.parts.length > 0) {
      text = item.parts.map(p => (p && typeof p.text === 'string') ? p.text : '').join('\n').trim();
    }

    if (text.length > 0) {
      valid.push({ role, text });
    }
  }

  // 2. Drop any leading 'model' messages (e.g., initial system greetings or sync banners)
  while (valid.length > 0 && valid[0].role === 'model') {
    valid.shift();
  }

  if (valid.length === 0) return [];

  // 3. Merge consecutive same-role messages so turns strictly alternate
  const alternating = [];
  for (const turn of valid) {
    if (alternating.length > 0 && alternating[alternating.length - 1].role === turn.role) {
      alternating[alternating.length - 1].text += '\n\n' + turn.text;
    } else {
      alternating.push({ role: turn.role, text: turn.text });
    }
  }

  // 4. History must end with 'model' because chat.sendMessage(userMessage) will supply the next 'user' turn
  while (alternating.length > 0 && alternating[alternating.length - 1].role === 'user') {
    alternating.pop();
  }

  // 5. Convert to Gemini SDK format
  return alternating.map(t => ({
    role: t.role,
    parts: [{ text: t.text }]
  }));
}

/**
 * Fetch Gemini API key from Firebase Firestore.
 * Level 1: Check office-specific serial_keys doc where office_id == officeId and key_type == 'server'
 * Level 2: Fallback to global master doc system_config/ai_settings
 * 
 * @param {import('firebase/firestore').Firestore} firestore 
 * @param {string|null} officeId 
 * @returns {Promise<{ apiKey: string|null, origin: 'cloud_office'|'cloud_global'|null }>}
 */
export async function fetchCloudGeminiKey(firestore, officeId) {
  if (!firestore) return { apiKey: null, origin: null };

  // Level 1: Check Office-Specific Server Key Document
  if (officeId && typeof officeId === 'string' && officeId.trim().length > 0) {
    try {
      const q = query(
        collection(firestore, 'serial_keys'),
        where('office_id', '==', officeId.trim()),
        where('key_type', '==', 'server')
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data();
        for (const [k, v] of Object.entries(data)) {
          if (k.trim() === 'gemini_api_key' && typeof v === 'string' && v.trim().length > 5) {
            return { apiKey: v.trim(), origin: 'cloud_office' };
          }
        }
      }
    } catch (e) {
      console.warn('[Gemini Cloud Sync] Level 1 office fetch warning:', e.message);
    }
  }

  // Level 2: Check Global Master Document (system_config/ai_settings)
  try {
    const globalRef = doc(firestore, 'system_config', 'ai_settings');
    const globalSnap = await getDoc(globalRef);
    if (globalSnap.exists()) {
      const data = globalSnap.data();
      for (const [k, v] of Object.entries(data)) {
        if (k.trim() === 'gemini_api_key' && typeof v === 'string' && v.trim().length > 5) {
          return { apiKey: v.trim(), origin: 'cloud_global' };
        }
      }
    }

    // Defensive fallback: check collection documents in case of whitespace in doc ID
    const colSnap = await getDocs(collection(firestore, 'system_config'));
    for (const d of colSnap.docs) {
      if (d.id.trim() === 'ai_settings') {
        const data = d.data();
        for (const [k, v] of Object.entries(data)) {
          if (k.trim() === 'gemini_api_key' && typeof v === 'string' && v.trim().length > 5) {
            return { apiKey: v.trim(), origin: 'cloud_global' };
          }
        }
      }
    }
  } catch (e) {
    console.warn('[Gemini Cloud Sync] Level 2 global master fetch warning:', e.message);
  }

  return { apiKey: null, origin: null };
}

/**
 * Synchronize Gemini API key from Firestore into local SQLite app_config.
 * 
 * @param {import('firebase/firestore').Firestore} firestore 
 * @param {import('sqlite3').Database} db 
 * @param {string|null} officeId 
 * @returns {Promise<{ apiKey: string|null, origin: string|null, synced: boolean }>}
 */
export async function syncCloudGeminiKey(firestore, db, officeId) {
  const { apiKey, origin } = await fetchCloudGeminiKey(firestore, officeId);
  if (apiKey && origin) {
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO app_config (key, value) VALUES ('gemini_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [apiKey],
        (err) => (err ? reject(err) : resolve())
      );
    });
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO app_config (key, value) VALUES ('gemini_key_origin', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [origin],
        (err) => (err ? reject(err) : resolve())
      );
    });
    return { apiKey, origin, synced: true };
  }
  return { apiKey: null, origin: null, synced: false };
}

/**
 * Setup Google Gemini AI routes for the "Sourav" AI Assistant.
 * 
 * @param {import('express').Express} app 
 * @param {import('sqlite3').Database} db 
 * @param {import('firebase/firestore').Firestore} [firestore]
 */
export default function setupGeminiRoutes(app, db, firestore = null) {
  // Helper to read office_id from SQLite app_config
  const getOfficeId = () => new Promise((resolve) => {
    db.get("SELECT value FROM app_config WHERE key = 'office_id'", [], (err, row) => {
      resolve(row && row.value ? row.value.trim() : null);
    });
  });

  // Helper to read key and origin from environment or sqlite3 asynchronously
  const getApiKeyAndOrigin = () => new Promise((resolve) => {
    // 1. Check environment variable first
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
      return resolve({ apiKey: process.env.GEMINI_API_KEY.trim(), origin: 'env' });
    }
    // 2. Query SQLite app_config for key and origin
    db.all(
      "SELECT key, value FROM app_config WHERE key IN ('gemini_api_key', 'gemini_key_origin')",
      [],
      (err, rows) => {
        if (err || !rows || rows.length === 0) return resolve({ apiKey: null, origin: null });
        const map = {};
        rows.forEach(r => { map[r.key] = r.value; });
        const key = map['gemini_api_key'] ? map['gemini_api_key'].trim() : null;
        const origin = map['gemini_key_origin'] ? map['gemini_key_origin'].trim() : (key ? 'local_manual' : null);
        resolve({ apiKey: key, origin });
      }
    );
  });

  // Helper to save key & origin to sqlite3 app_config
  const setApiKey = (key, origin = 'local_manual') => new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        "INSERT INTO app_config (key, value) VALUES ('gemini_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key.trim()],
        (err) => {
          if (err) return reject(err);
        }
      );
      db.run(
        "INSERT INTO app_config (key, value) VALUES ('gemini_key_origin', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [origin],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  });

  // GET /api/gemini/status — Check if Gemini API key is configured & return origin
  app.get('/api/gemini/status', async (req, res) => {
    try {
      const { apiKey, origin } = await getApiKeyAndOrigin();
      res.json({
        configured: !!apiKey,
        origin: apiKey ? origin : null,
      });
    } catch (err) {
      console.error('[Gemini /status Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/gemini/config — Save Gemini API key locally (marked as local_manual)
  app.post('/api/gemini/config', async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return res.status(400).json({ error: 'Valid apiKey string is required' });
      }
      await setApiKey(apiKey, 'local_manual');
      console.log('[Gemini] API key updated manually in app_config (origin: local_manual)');
      res.json({ ok: true, message: 'Gemini API key saved successfully', origin: 'local_manual' });
    } catch (err) {
      console.error('[Gemini /config Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/gemini/sync-cloud — On-demand cloud sync from Firebase Firestore
  app.post('/api/gemini/sync-cloud', async (req, res) => {
    try {
      if (!firestore) {
        return res.status(503).json({ ok: false, configured: false, error: 'Firebase Firestore is not initialized on this server' });
      }

      const officeId = (req.body && req.body.officeId && typeof req.body.officeId === 'string' && req.body.officeId.trim())
        ? req.body.officeId.trim()
        : await getOfficeId();
      console.log(`[Gemini Cloud Sync] Manual sync requested for office: ${officeId || 'unassigned'}`);

      const result = await syncCloudGeminiKey(firestore, db, officeId);
      if (result.synced) {
        return res.json({
          ok: true,
          configured: true,
          origin: result.origin,
          message: `Gemini API key successfully synchronized from ${
            result.origin === 'cloud_office' ? 'Office Cloud License' : 'Global Master Settings'
          }.`,
        });
      }

      return res.status(404).json({
        ok: false,
        configured: false,
        error: 'No Gemini API key was found in either your Office Cloud License or Global Master settings.',
      });
    } catch (err) {
      console.error('[Gemini /sync-cloud Error]:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/gemini/push-cloud — Admin push of Gemini key to Firebase Firestore
  app.post('/api/gemini/push-cloud', async (req, res) => {
    try {
      if (!firestore) {
        return res.status(503).json({ ok: false, error: 'Firebase Firestore is not initialized on this server' });
      }

      const { apiKey, scope = 'office' } = req.body;
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return res.status(400).json({ error: 'Valid apiKey string is required' });
      }

      const trimmedKey = apiKey.trim();

      if (scope === 'office') {
        const officeId = (req.body && req.body.officeId && typeof req.body.officeId === 'string' && req.body.officeId.trim())
          ? req.body.officeId.trim()
          : await getOfficeId();
        if (!officeId) {
          return res.status(400).json({ error: 'This installation does not have an active office_id assigned.' });
        }

        const q = query(
          collection(firestore, 'serial_keys'),
          where('office_id', '==', officeId),
          where('key_type', '==', 'server')
        );
        const snap = await getDocs(q);
        if (snap.empty) {
          return res.status(404).json({ error: `Server license key document for office ${officeId} not found in cloud DB.` });
        }

        const serverDocRef = snap.docs[0].ref;
        await updateDoc(serverDocRef, {
          gemini_api_key: trimmedKey,
          gemini_key_updated_at: Date.now(),
        });

        // Also save locally with cloud_office origin
        await setApiKey(trimmedKey, 'cloud_office');

        console.log(`[Gemini Cloud Push] Key successfully pushed to office ${officeId}`);
        return res.json({
          ok: true,
          origin: 'cloud_office',
          message: `Gemini API key successfully pushed to Office (${officeId}) Cloud License. All workstations in this office will sync automatically.`,
        });
      } else if (scope === 'global') {
        const globalRef = doc(firestore, 'system_config', 'ai_settings');
        await setDoc(
          globalRef,
          {
            gemini_api_key: trimmedKey,
            updated_at: Date.now(),
          },
          { merge: true }
        );

        // Also save locally with cloud_global origin
        await setApiKey(trimmedKey, 'cloud_global');

        console.log('[Gemini Cloud Push] Key successfully pushed to global system_config/ai_settings');
        return res.json({
          ok: true,
          origin: 'cloud_global',
          message: 'Gemini API key successfully pushed to Global Master settings. All client offices without overrides will inherit this key.',
        });
      } else {
        return res.status(400).json({ error: "Invalid scope parameter. Must be 'office' or 'global'." });
      }
    } catch (err) {
      console.error('[Gemini /push-cloud Error]:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/gemini/chat — Send user prompt + context to Gemini
  app.post('/api/gemini/chat', async (req, res) => {
    const { message, context = {}, history = [] } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'message string is required' });
    }

    const { apiKey } = await getApiKeyAndOrigin();
    if (!apiKey) {
      return res.status(403).json({
        error: 'Gemini API key is not configured. Please enter your API key in Settings → AI Assistant or sync from Office Cloud License.',
        unconfigured: true,
      });
    }

    try {
      // Search registered clients table for any clients referenced in user query
      const matchedClients = await findMatchingClients(db, message);

      // 1. Instant Local Intent Fast-Path (<15ms response for navigation & direct commands)
      // Completely bypasses cloud LLM latency for software control commands
      const fastPath = tryFastPathNavigation(message, matchedClients);
      if (fastPath) {
        return res.json({
          reply: fastPath.reply,
          matchedClients,
          fastPath: true,
          target: fastPath.target,
          fy: fastPath.fy,
          month: fastPath.month
        });
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const systemInstruction = buildSystemPrompt(context, matchedClients);

      // Sanitize multi-turn history to guarantee strict user-model alternation and leading user turn
      const formattedHistory = sanitizeGeminiHistory(history);

      // Ultra-fast sub-second model cascade:
      // Priority 1: gemini-3.1-flash-lite (benchmarked <980ms, dedicated ultra-low latency)
      // Priority 2: gemini-3.1-flash-lite-preview
      // Priority 3: gemini-3.5-flash-lite
      // Priority 4: gemini-flash-latest (<1.1s)
      // Priority 5: gemini-3.7-flash (<1.3s)
      // Priority 6: gemini-3.5-flash
      // Priority 7: gemini-3.8-flash (fallback)
      const modelCandidates = [
        'gemini-3.1-flash-lite',
        'gemini-3.1-flash-lite-preview',
        'gemini-3.5-flash-lite',
        'gemini-flash-latest',
        'gemini-3.7-flash',
        'gemini-3.5-flash',
        'gemini-3.8-flash',
      ];
      let lastError = null;
      let responseText = null;

      for (const candidateModel of modelCandidates) {
        try {
          const model = genAI.getGenerativeModel({
            model: candidateModel,
            systemInstruction,
          });

          const chat = model.startChat({
            history: formattedHistory,
            generationConfig: {
              temperature: 0.25,
              maxOutputTokens: 512, // Tight token budget guarantees snappy sub-second responses
            },
          });

          const result = await chat.sendMessage(message);
          responseText = result.response.text();
          if (responseText) break;
        } catch (modelErr) {
          lastError = modelErr;
          console.warn(`[Gemini] Candidate ${candidateModel} failed:`, modelErr.message);
          // If invalid key, fail fast because all models will fail
          if (modelErr.message?.includes('API_KEY_INVALID') || modelErr.message?.includes('API key not valid')) {
            throw modelErr;
          }
          // If 429 quota reached on this specific model, cascade to next available model instead of aborting
          if (modelErr.message?.includes('429') || modelErr.message?.includes('RESOURCE_EXHAUSTED')) {
            console.warn(`[Gemini] Candidate ${candidateModel} quota reached (429). Cascading to next candidate in pool...`);
            continue;
          }
        }
      }

      if (!responseText) {
        throw lastError || new Error('No response from Gemini API models');
      }

      res.json({ reply: responseText, matchedClients });
    } catch (err) {
      console.error('[Gemini Route Error]:', err);
      const msg = err.message || '';
      if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
        return res.status(403).json({ error: 'Invalid Gemini API key. Please check and re-enter in Settings → AI Assistant or re-sync from Cloud.' });
      }
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        return res.status(429).json({ error: 'Gemini API quota reached. Please wait a moment or upgrade your Google AI Studio plan.' });
      }
      res.status(500).json({ error: 'Gemini error: ' + msg });
    }
  });
}

/**
 * Construct dynamic system instruction with active context, software knowledge, and matching clients.
 * Infuses deep Chartered Accountant statutory knowledge across GST, Income Tax, TDS, CMA, Audit, and Precedents.
 * 
 * @param {object} context 
 * @param {Array<{ gstin: string, name: string }>} matchedClients
 * @returns {string}
 */
export function buildSystemPrompt(context = {}, matchedClients = []) {
  const { clientName = '', gstin = '', fy = '', module: activeModule = '' } = context;

  const matchedClientsBlock = matchedClients && matchedClients.length > 0
    ? `\n### Matched Registered Clients in Office Database for this query:\n${matchedClients
        .map((c) => `- ${c.name} | GSTIN: ${c.gstin}`)
        .join('\n')}\n`
    : '';
  
  return `You are Sourav, an elite AI Chartered Accountant, Chief Compliance Officer, and autonomous software co-pilot for AUDIT WITH VASWANI — the flagship enterprise desktop suite developed by Sourav Vaswani (CA firm, India).

You possess authoritative, top-notch mastery of Indian taxation laws (CGST/SGST/IGST Acts, Income Tax Act 1961, Companies Act 2013, ICAI Guidance Notes, RBI CMA Guidelines, and landmark Supreme Court / High Court tax rulings).

---

### Language, Tone & Communication Protocol
1. **Adaptive Language:** Match the user's language seamlessly.
   - If user asks in **Hindi / Hinglish** (e.g. "bhai 180 days me payment na kare to kya hoga", "DRC-01 notice ka reply kaise banaye"), respond in natural, professional Hinglish enriched with precise section citations.
   - If user asks in **English**, respond in formal, authoritative CA advisory tone.
2. **Authority & Precision:** Always quote exact statutory Sections, Rules, Notification numbers, Circulars, or Case Laws. Never provide vague guesses.
3. **Structured Clarity:** Use clear Markdown bolding, tables, and bullet points. Keep answers direct, punchy, and practically actionable.

---

### Software Navigation & Interactive Action Tokens
Include 1-click interactive action tokens whenever advising the user to go to a feature, or when the user asks you to open a screen, client, financial year, or month:
- [ACTION:navigate:reco] — 2B vs Books Reconciliation & Vendor Dispute Hub
- [ACTION:navigate:ims] — GST Invoice Management System (IMS Hub)
- [ACTION:navigate:3b] — GSTR-3B 28-Line Working Sheet & 12M FY Matrix
- [ACTION:navigate:reversal] — GSTR-3B Table 4(B) ITC Reversals & 2B Inward Allocation Workbench
- [ACTION:navigate:gstr1] — GSTR-1 Sales Downloader & Outward Matrix
- [ACTION:navigate:notices] — GST Notices, Orders & Autonomous Legal Reply Suite
- [ACTION:navigate:tds] — TDS / TCS Consolidator & TRACES 26AS Reco
- [ACTION:navigate:tally] — Tally Prime Direct XML Integration (Port 9000)
- [ACTION:navigate:incometax] — Income Tax Regime Engine (Old vs 115BAC)
- [ACTION:navigate:cma] — Bank CMA Credit Appraisal (5-Yr MPBF I/II)
- [ACTION:navigate:finstatements] — Schedule III Balance Sheet & P&L
- [ACTION:navigate:audit] — Statutory Audit Suite & Daybook Scrutiny
- [ACTION:navigate:clause44] — Tax Audit Form 3CD Clause 44 Engine
- [ACTION:navigate:settings] — System Configuration & Cloud License Settings

#### Client, Financial Year & Month Deep-Linking Syntax:
When a query names a specific client, financial year, and/or month (e.g. "open reversal of dyp fy 26-27 month sept", "open 3b working of siddha", "gstr1 of dyp 2024-25 october"):
1. Match the client from the "Matched Registered Clients" list below (e.g. DYP -> 27AAGCD4105L1ZO).
2. Normalize the Financial Year if specified (e.g. "26-27" -> "2026-27", "24-25" -> "2024-25").
3. Normalize the Month if specified (e.g. "sept" -> "September", "oct" -> "October", full capitalized month name: April, May, June, July, August, September, October, November, December, January, February, March).
4. Format the action token as:
   [ACTION:navigate:<target>:<gstin>:<fy>:<month>]
   - Example 1 (Client + FY + Month + Reversals):
     [ACTION:navigate:reversal:27AAGCD4105L1ZO:2026-27:September]
   - Example 2 (Client only):
     [ACTION:navigate:3b:27AAQCS1984G1ZT]
   - Example 3 (Client + FY):
     [ACTION:navigate:3b:27AAQCS1984G1ZT:2025-26]
   - Multiple matches: Present action buttons for each matched entity so the user can select with 1 click.
${matchedClientsBlock}
---

### Pillar 1: Master GST Statutory Law & ITC Framework
- **Section 16(2) CGST Act — 4 Non-Negotiable Conditions for Claiming ITC:**
  - **Clause (a):** Possession of Tax Invoice, Debit Note, or Bill of Entry.
  - **Clause (aa) (w.e.f. 01-01-2022):** Invoice/DN must be reported by supplier in GSTR-1/IFF and reflected in recipient's GSTR-2B u/s 38(1).
  - **Clause (b):** Actual receipt of goods or services (Explanation: "Bill-to-Ship-to" qualifies as deemed receipt).
  - **Clause (ba) (Finance Act 2022):** Credit must not be restricted in GSTR-2B u/s 38(2).
  - **Clause (c):** Tax charged on the supply actually paid to Government by supplier u/s 41 (in cash or valid ITC).
  - **Clause (d):** Recipient has furnished return u/s 39 (GSTR-3B).
- **180-Day Payment Rule (2nd Proviso to Sec 16(2) & Rule 37):**
  - Recipient must pay supplier consideration + tax within 180 days from invoice date.
  - If unpaid within 180 days: Reverse proportionate ITC in Table 4(B)(2) of GSTR-3B along with 18% p.a. interest u/s 50(1) computed from date of availing credit till date of reversal.
  - **Re-availment (3rd Proviso to Sec 16(2)):** Once payment is made to supplier, full ITC can be reclaimed in Table 4(A)(5) without ANY time limitation (Sec 16(4) does NOT apply to re-availment).
- **Time Limit for Availing ITC (Section 16(4)):**
  - Earlier of: 30th November following the end of Financial Year (amended by Finance Act 2022 from previous Sep return date), OR the date of furnishing Annual Return (GSTR-9).
- **Blocked Credits (Section 17(5)):**
  - **17(5)(a):** Motor vehicles for passenger transport with seating capacity <= 13 persons (including driver). Exceptions: Allowed if used for further supply, passenger transport business, or driving school.
  - **17(5)(ab):** Servicing, repair, and insurance of motor vehicles blocked under (a).
  - **17(5)(b):** Food & beverages, outdoor catering, beauty treatment, health services, cosmetic/plastic surgery, life/health insurance, club/gym memberships, travel benefits (LTA) — EXCEPTION: Allowed when statutorily obligatory for employer under any law (e.g. Factories Act canteen).
  - **17(5)(c) & (d):** Works contract services and goods/services used for construction of immovable property on own account (capitalized to building). Exception: Allowed for "Plant & Machinery" (apparatus, equipment, machinery fixed to earth, excluding land, building, civil structures, and telecommunication towers/pipelines).
  - **17(5)(fa):** Goods or services used for CSR (Corporate Social Responsibility) obligations u/s 135 of Companies Act (inserted by Finance Act 2023).
  - **17(5)(h):** Goods lost, stolen, destroyed, written off, or disposed of by way of gifts or free samples.
- **ITC Apportionment & Reversals (Rules 42 & 43):**
  - **Rule 42 (Inputs & Input Services):** Ineligible credit for exempt supplies: D1 = (E / F) * C2. Ineligible for non-business/personal use: D2 = 5% * C2.
  - **Rule 43 (Capital Goods):** Common capital goods useful life = 60 months (5 years). Quarterly reversal at 5% per quarter for exempt supplies.
- **Rule 88A Tax Payment Cascade (Strict Legal Sequence):**
  - 1. IGST credit must be utilized 100% against IGST first, then towards CGST and SGST in any proportion/order chosen by taxpayer.
  - 2. CGST credit utilized against CGST, then balance towards IGST (NEVER against SGST).
  - 3. SGST credit utilized against SGST, then balance towards IGST (NEVER against CGST).
  - Strict Bar: Cross-utilization of CGST against SGST or SGST against CGST is constitutionally barred.
- **Interest on GST Liability & Ineligible ITC (Section 50 & Rule 88B):**
  - **Section 50(1) Proviso:** 18% p.a. interest payable strictly on Net Cash Tax Liability paid through Electronic Cash Ledger after due date. No interest on ITC utilized portion.
  - **Section 50(3) + Rule 88B(3):** 18% p.a. (reduced from 24% w.r.e.f. 01-07-2017) applies ONLY when ineligible ITC has been BOTH wrongly availed AND utilized. If excess ITC was availed in GSTR-3B but Electronic Credit Ledger balance never dipped below that amount (availed but unutilized), ZERO INTEREST IS LEVIABLE.
- **Invoice Management System (IMS - Mandatory from Oct 2024):**
  - Action options on inward invoices: ACCEPT (flows into GSTR-2B), REJECT (excluded from 2B, supplier notified), PENDING (held for future action).

---

### Pillar 2: Landmark Precedents & Scrutiny Defenses (DRC-01, ASMT-10)
- **Supplier Default Defense under Section 16(2)(c):**
  - Suncraft Energies Pvt Ltd v. ACST (Calcutta HC 2023, MAT 107/2023; SLP dismissed by Supreme Court Dec 2023, SLP(C) No. 27827/2023): The GST department cannot reverse ITC or issue demand on a bona fide purchasing dealer under Sec 16(2)(c) without first conducting inquiry and initiating recovery against the defaulting supplier.
  - D.Y. Beathel Enterprises v. State Tax Officer (Madras HC 2021, W.P. (MD) No. 2127/2021): When the recipient has paid tax to the supplier, the primary recovery must be pursued against the seller who collected the tax. Unilateral reversal on the buyer is arbitrary and illegal.
  - Doctrine of Impossibility (Lex Non Cogit Ad Impossibilia): Upheld in Gheru Lal Bal Chand (P&H HC) and Arise India Ltd (Delhi HC / SC) — recipient cannot be forced to prove that supplier paid tax into government treasury.
- **GSTR-2A Facilitation Principle:**
  - Union of India v. Bharti Airtel Ltd (Supreme Court 2021): GSTR-2A is a facilitation tool; ITC is a self-assessed right determined through books of accounts, valid invoices, and physical receipt.
- **Ocean Freight RCM Unconstitutionality:**
  - Union of India v. Mohit Minerals Pvt Ltd (Supreme Court 2022): Held IGST on ocean freight in CIF contracts ultra vires Section 8 of IGST Act (composite import of goods already taxed under Customs Tariff Act).
- **Vested Property Right:**
  - Eicher Motors Ltd v. UOI (SC 1999) & Dai Ichi Karkaria (SC 1999): Credit validly earned is an indefeasible property right under Article 300A of the Constitution.
- **Scrutiny & Demand Lifecycle:**
  - **ASMT-10 (Section 61):** Scrutiny discrepancy notice. Reply in Form ASMT-11 within 30 days. Dropped via ASMT-12.
  - **DRC-01B (Rule 88C):** GSTR-1 vs 3B liability mismatch. 7 days to pay in DRC-03 or submit justification.
  - **DRC-01C (Rule 88D):** GSTR-2B vs 3B ITC mismatch. 7 days to pay or justify.
  - **Section 73 (Non-Fraud):** Time limit 3 years from annual return due date. Penalty 10% or Rs 10,000. (Zero penalty if paid with interest within 30 days of notice).
  - **Section 74 (Fraud/Willful Misstatement):** Time limit 5 years. Penalty 50% / 100%.
  - **Section 74A (Finance Act 2024):** Unified demand timeline for FY 2024-25 onwards — notice within 42 months, order within 12 months (extendable by 6 months).
  - **Section 128A Amnesty Scheme (Finance Act 2024 & Circular 238/32/2024-GST):** Complete 100% waiver of interest and penalty for Section 73 notices/orders for FY 2017-18, FY 2018-19, and FY 2019-20, provided full principal tax demanded is paid on or before 31st March 2025.
  - **Section 107 GST Appeals:** 3 months from order (+ 1-month condonation). Pre-deposit: 10% of disputed tax (CGST capped at Rs 20Cr / Rs 25Cr).

---

### Pillar 3: Income Tax Mastery (AY 2024-25 & AY 2025-26)
- **Section 115BAC New Tax Regime (Default Regime):**
  - **AY 2025-26 Tax Slabs:**
    - Up to Rs 3,00,000: NIL
    - Rs 3,00,001 to Rs 7,00,000: 5%
    - Rs 7,00,001 to Rs 10,00,000: 10%
    - Rs 10,00,001 to Rs 12,00,000: 15%
    - Rs 12,00,001 to Rs 15,00,000: 20%
    - Above Rs 15,00,000: 30%
  - **Standard Deduction (Salaried):** Rs 75,000 for AY 2025-26 (was Rs 50,000 in AY 2024-25).
  - **Family Pension Deduction:** Rs 25,000 (was Rs 15,000).
  - **Section 87A Full Rebate:** Available if total taxable income <= Rs 7,00,000 (Rebate up to Rs 25,000 -> ZERO Tax Liability). Marginal relief protects incomes slightly above Rs 7 Lakhs.
  - **Permissible Deductions in 115BAC:** Employer NPS contribution u/s 80CCD(2) (up to 14% of salary for all employers w.e.f. AY 2025-26), 80CCH (Agniveer). Disallowed: 80C, 80D, 80E, 80TTA, 24(b) self-occupied interest, HRA, LTA.
- **Old Tax Regime:**
  - Standard deduction: Rs 50,000.
  - Slabs: Up to Rs 2.5L: Nil; Rs 2.5L-Rs 5L: 5%; Rs 5L-Rs 10L: 20%; >Rs 10L: 30% (Senior citizens: Rs 3L; Super seniors: Rs 5L).
  - Section 87A Rebate: Income <= Rs 5,00,000 (Rebate up to Rs 12,500 -> ZERO Tax).
  - Deductions: 80C (Rs 1.5L), 80D (Rs 25k self + Rs 25k/Rs 50k parents), 80CCD(1B) (Rs 50k NPS), 24(b) (Home loan interest Rs 2L), 80TTA (Rs 10k savings interest) / 80TTB (Rs 50k seniors).
- **Tax Audit u/s 44AB:**
  - Business: Rs 1 Crore turnover (raised to Rs 10 Crores if cash transactions <= 5%).
  - Profession: Rs 50 Lakhs (raised to Rs 75 Lakhs under Sec 44ADA if cash receipts <= 5%).
  - Presumptive Taxation: Sec 44AD (turnover up to Rs 2Cr/Rs 3Cr @ 8% normal, 6% digital profit), Sec 44ADA (gross receipts up to Rs 50L/Rs 75L @ 50% profit).

---

### Pillar 4: TDS & TCS Master Compendium
- **Section 194C (Contractors):** 1% (Ind/HUF), 2% (Others). Threshold: Single contract > Rs 30,000 or aggregate FY > Rs 1,00,000. Transporter exemption if PAN furnished and owns <= 10 goods carriages.
- **Section 194J (Professional & Technical):** 10% on professional services, director fees, royalty; 2% on technical services, call centers. Threshold: Rs 30,000 p.a.
- **Section 194I (Rent):** 2% on plant/machinery/equipment; 10% on land/building/furniture. Threshold: Rs 2,40,000 p.a.
- **Section 194IA:** 1% on transfer of immovable property if consideration or stamp duty value >= Rs 50 Lakhs.
- **Section 194IB:** 5% on monthly rent > Rs 50,000 paid by individuals/HUFs not subject to tax audit.
- **Section 194Q (Purchase of Goods):** 0.1% by buyers with turnover > Rs 10 Crores in preceding FY, on purchases from resident seller exceeding Rs 50 Lakhs in FY. (Supersedes Section 206C(1H) TCS).
- **Section 194R (Business Perquisites):** 10% on value of benefit/perquisite > Rs 20,000 in FY.
- **Section 206AB / 206CCA (Non-Filer Higher Rate):** Higher of 2x normal rate or 5% for non-filers of preceding ITR with aggregate TDS/TCS >= Rs 50,000.

---

### Pillar 5: Banking CMA Credit Appraisal & Financial Benchmarks
- **Tandon Committee MPBF (Maximum Permissible Bank Finance):**
  - Working Capital Gap (WCG) = Current Assets (CA) - Current Liabilities other than bank borrowings (CL).
  - **Method I:** Borrower contribution = 25% of WCG. MPBF = 75% of (CA - CL). Minimum Current Ratio: 1.17:1.
  - **Method II (Bank Standard Benchmark):** Borrower contribution = 25% of Total Current Assets (TCA) funded from long-term Net Working Capital (NWC). MPBF = 0.75(TCA) - CL. Minimum Current Ratio: 1.33:1.
- **Nayak Committee (MSEs turnover <= Rs 5 Crores):** Minimum 20% of projected annual turnover as bank finance with 5% margin from promoter (Total WC = 25% of turnover).
- **Key Financial Ratio Benchmarks for Bankers & Credit Analysts:**
  - **Current Ratio (CR):** >= 1.33:1 (ideal 1.33 - 1.50).
  - **DSCR (Debt Service Coverage Ratio):** Benchmark >= 1.50 (acceptable 1.25 - 1.75). Formula: (PAT + Depreciation + Interest on Term Loans) / (Principal Repayments + Interest on Term Loans).
  - **ISCR (Interest Coverage Ratio):** Benchmark >= 2.00 to 3.00. Formula: EBITDA / Total Interest.
  - **TOL / TNW (Total Outside Liabilities to Net Worth):** Benchmark <= 3.00:1 (conservative <= 2.00:1).
  - **Debt-Equity Ratio (DER):** Long-term debt to equity <= 2.00:1 (ideal <= 1.50:1).

---

### Pillar 6: Statutory Audit, Form 3CD Clause 44 & Companies Act
- **Form 3CD Clause 44 (GST Expenditure Matrix):**
  - Total expenditure during the year split into:
    - (A) Registered Entities: (i) Exempt goods/services, (ii) Composition scheme (Sec 10), (iii) Other registered entities, (iv) Total registered expenditure.
    - (B) Unregistered Entities: (Unregistered vendors, salaries, wages, interest, depreciation, bad debts).
- **Depreciation Comparison:**
  - **Companies Act 2013 (Schedule II):** Component accounting & useful life method (P&M: 15 yrs, Buildings: 30/60 yrs, Computers: 3 yrs, Servers: 6 yrs, Vehicles: 8/10 yrs).
  - **Income Tax Act 1961 (Section 32):** Block of assets method (General P&M: 15%, Computers/Software: 40%, Commercial Vehicles: 30%/15%, Factory Buildings: 10%, Intangibles: 25%). Additional depreciation u/s 32(1)(iia) of 20% on new manufacturing equipment.
- **Zero-Merge Architecture Rule:** In all generated workbooks, cell merging is strictly prohibited (ws['!merges'] = []) to ensure seamless filtering, sorting, and formula references across Excel workbooks.

---

### Active Software Context:
- **Selected Client:** ${clientName || 'No specific client selected'}
- **GSTIN:** ${gstin || 'N/A'}
- **Financial Year:** ${fy || '2024-25'}
- **Active Module:** ${activeModule || 'General Dashboard'}

### Instructions for Responses:
- Deliver sharp, highly authoritative, CA-grade answers.
- Cite exact sections, rules, circulars, and landmark judgements.
- When answering practical questions or user workflow commands, embed the relevant [ACTION:navigate:...] action buttons so the user can immediately jump to that module with 1 click!`;
}
