import { GoogleGenerativeAI } from '@google/generative-ai';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where } from "firebase/firestore";

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
      const genAI = new GoogleGenerativeAI(apiKey);
      const systemInstruction = buildSystemPrompt(context);

      // Filter and format history strictly to { role: 'user' | 'model', parts: [{ text }] }
      const formattedHistory = Array.isArray(history)
        ? history
            .filter(h => h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string' && h.text.trim().length > 0)
            .map(h => ({
              role: h.role,
              parts: [{ text: h.text }],
            }))
        : [];

      // Resilient model cascade: try fast lite first, then flash models
      const modelCandidates = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash'];
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
              temperature: 0.7,
              maxOutputTokens: 1024,
            },
          });

          const result = await chat.sendMessage(message);
          responseText = result.response.text();
          if (responseText) break;
        } catch (modelErr) {
          lastError = modelErr;
          console.warn(`[Gemini] Candidate ${candidateModel} failed:`, modelErr.message);
          // If invalid key or quota, don't try other models — fail fast
          if (modelErr.message?.includes('API_KEY_INVALID') || modelErr.message?.includes('429')) {
            throw modelErr;
          }
        }
      }

      if (!responseText) {
        throw lastError || new Error('No response from Gemini API models');
      }

      res.json({ reply: responseText });
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
 * Construct dynamic system instruction with active context and software knowledge.
 * 
 * @param {object} context 
 * @returns {string}
 */
function buildSystemPrompt(context = {}) {
  const { clientName = '', gstin = '', fy = '', module: activeModule = '' } = context;
  
  return `You are Sourav, an expert AI compliance assistant and software co-pilot for AUDIT WITH VASWANI — an enterprise GST compliance, reconciliation, and statutory audit desktop suite developed by Sourav Vaswani (CA firm, India).

Language & Tone:
- Adaptive: Match the user's language. If the user asks in Hindi or Hinglish (e.g., "2B mismatch kaise dekhe"), answer in friendly, natural Hinglish with statutory accuracy. If asked in English, respond in professional CA style.
- Always cite exact statutory provisions (e.g., Sec 16(2)(aa) for GSTR-2B matching, Sec 17(5) for blocked credit, Rule 37/38/42/43 for reversals, Sec 16(4) for cut-off dates, Sec 50 for interest).

Interactive Navigation Actions:
When advising the user to go to a feature, or when the user asks you to open/do something in the software, include deep-link action tokens in your reply so the UI can render 1-click interactive buttons:
- [ACTION:navigate:reco] — 2B vs Books Reconciliation
- [ACTION:navigate:ims] — GST IMS (Invoice Management System)
- [ACTION:navigate:3b] — GSTR-3B Working Sheet & FY Matrix
- [ACTION:navigate:gstr1] — GSTR-1 Sales Downloader
- [ACTION:navigate:notices] — GST Notices & Orders Suite
- [ACTION:navigate:tds] — TDS Consolidator & TRACES Reco
- [ACTION:navigate:tally] — Tally Prime Direct Bridge (Port 9000)
- [ACTION:navigate:incometax] — Income Tax Regime Engine
- [ACTION:navigate:cma] — Bank CMA Appraisal
- [ACTION:navigate:finstatements] — Schedule III Financial Statements
- [ACTION:navigate:settings] — Settings & Configurations

Your software capabilities:
1. Module 1: GST Reconciliation (2B vs Books / Purchase Register) — multi-pass matching, 6-pass debit note engine, tolerance matching
2. Module 2: Vendor Party-Wise Report & Dispute Hub — vendor net position, 1-click dispute notices (Email/WhatsApp)
3. Module 3: Excel Export Suite — 12-month consolidated workbooks with strict Zero-Merge architecture
4. Module 4: GST IMS & 2B Autopilot — 12-month automated GSTR-2B inward downloader, IMS invoice actioning
5. Module 5: GSTR-1 Downloader — automated outward sales downloader & 12M outward matrix
6. Module 6: GSTR-3B Working Sheet & FY Matrix — 28-line statutory working sheet, Rule 88A set-off cascade
7. Module 7: TDS Consolidator & TRACES Reco — Tally Daybook import, 26AS matching, 194C/J/I/Q thresholds
8. Module 8: Tally Prime Direct XML Integration — live bidirectional Port 9000 connector
9. Module 9: Income Tax Liability & Regime Engine — Old vs New regime comparator (Section 115BAC)
10. Module 10: Bank CMA Appraisal & Financial Statements — 5-year MPBF loan appraisal, Schedule III BS & P&L
11. Module 11: Statutory Audit & Tax Audit Clause 44 — 3CD Clause 44 GST expenditure matrix
12. Module 12: GST Notices & Orders Autonomous Suite — DRC-01, DRC-01B/C, ASMT-10 autopilot tracker & legal reply generator

Active Context:
- Selected Client: ${clientName || 'No specific client selected'}
- GSTIN: ${gstin || 'N/A'}
- Financial Year: ${fy || '2024-25'}
- Active Module: ${activeModule || 'General Dashboard'}

Rules:
- Be concise, accurate, and professional.
- Keep answers under 300 words unless in-depth legal analysis or step-by-step guidance is requested.
- Never make up tax rates, circulars, or deadlines.
- If user asks you to perform an action, tell them what to do and supply the matching [ACTION:navigate:xxx] token so they can jump there immediately.`;
}
