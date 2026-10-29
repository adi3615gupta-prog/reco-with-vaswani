import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Setup Google Gemini AI routes for the "Sourav" AI Assistant.
 * 
 * @param {import('express').Express} app 
 * @param {import('sqlite3').Database} db 
 */
export default function setupGeminiRoutes(app, db) {
  // Helper to read key from environment or sqlite3 asynchronously
  const getApiKey = () => new Promise((resolve) => {
    // 1. Check environment variable first
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
      return resolve(process.env.GEMINI_API_KEY.trim());
    }
    // 2. Query SQLite app_config
    db.get("SELECT value FROM app_config WHERE key = 'gemini_api_key'", [], (err, row) => {
      if (err || !row || !row.value) return resolve(null);
      resolve(row.value.trim());
    });
  });

  // Helper to save key to sqlite3 app_config
  const setApiKey = (key) => new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO app_config (key, value) VALUES ('gemini_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = ?",
      [key.trim()],
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });

  // GET /api/gemini/status — Check if Gemini API key is configured
  app.get('/api/gemini/status', async (req, res) => {
    try {
      const key = await getApiKey();
      res.json({ configured: !!key });
    } catch (err) {
      console.error('[Gemini /status Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/gemini/config — Save Gemini API key
  app.post('/api/gemini/config', async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return res.status(400).json({ error: 'Valid apiKey string is required' });
      }
      await setApiKey(apiKey);
      console.log('[Gemini] API key updated successfully in app_config');
      res.json({ ok: true, message: 'Gemini API key saved successfully' });
    } catch (err) {
      console.error('[Gemini /config Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/gemini/chat — Send user prompt + context to Gemini
  app.post('/api/gemini/chat', async (req, res) => {
    const { message, context = {}, history = [] } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'message string is required' });
    }

    const apiKey = await getApiKey();
    if (!apiKey) {
      return res.status(403).json({
        error: 'Gemini API key is not configured. Please enter your API key in Settings → AI Assistant.',
        unconfigured: true,
      });
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: buildSystemPrompt(context),
      });

      // Filter and format history strictly to { role: 'user' | 'model', parts: [{ text }] }
      const formattedHistory = Array.isArray(history)
        ? history
            .filter(h => h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string' && h.text.trim().length > 0)
            .map(h => ({
              role: h.role,
              parts: [{ text: h.text }],
            }))
        : [];

      const chat = model.startChat({
        history: formattedHistory,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      });

      const result = await chat.sendMessage(message);
      const responseText = result.response.text();

      res.json({ reply: responseText });
    } catch (err) {
      console.error('[Gemini Route Error]:', err);
      const msg = err.message || '';
      if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
        return res.status(403).json({ error: 'Invalid Gemini API key. Please check and re-enter in Settings → AI Assistant.' });
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
