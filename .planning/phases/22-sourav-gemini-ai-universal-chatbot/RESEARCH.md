# Gemini API Integration Research — Node.js/Express Backend (Electron App)

> **Target codebase:** `server.js` (ES Modules, `import`), Express on port 3001, SQLite `app_config` table, routes follow `export default function setupXxxRoutes(app, db)` pattern.

---

## 1. Package Installation

### Option A — `@google/generative-ai` (Legacy, widely documented, stable)
```bash
npm install @google/generative-ai
```
**Use this** — all existing examples, Google docs, and StackOverflow answers use this package. It is battle-tested and has no breaking changes in the `GoogleGenerativeAI` class API since 2024.

### Option B — `@google/genai` (Newer unified SDK, 2025)
```bash
npm install @google/genai
```
Uses `GoogleGenAI` class instead of `GoogleGenerativeAI`. Different method signatures (`ai.models.generateContent` vs `model.generateContent`). Avoid until the codebase needs Gemini Live (audio/video streaming) — adds unnecessary migration risk.

**Decision: Use `@google/generative-ai` for this project.**

---

## 2. Model Selection

| Model | Context Window | Free Tier RPM | Free Tier RPD | Best For |
|---|---|---|---|---|
| `gemini-2.0-flash` | 1M tokens | 15 | 1,500 | ✅ **Recommended** — faster, smarter, better function calling |
| `gemini-1.5-flash` | 1M tokens | 15 | 1,500 | Legacy; same limits, older reasoning |
| `gemini-1.5-pro` | 2M tokens | 2 | 50 | Heavy analysis only; too restrictive for chat |

**Use `gemini-2.0-flash`** for the assistant chat. Same free tier cost ($0), better latency, superior reasoning for Indian tax/GST domain queries.

**Free tier caveats:**
- 15 RPM (requests per minute) — safe for interactive chat
- 1,500 RPD (requests per day) — ~125 conversations/day at 12 turns each
- Input/output data **may be used for model training** by Google on the free tier
- `429 RESOURCE_EXHAUSTED` fires on any of RPM/TPM/RPD being exceeded independently

---

## 3. Basic Initialization & `getGenerativeModel`

```javascript
// gemini_routes.js (new file — follow existing route pattern)
import { GoogleGenerativeAI } from '@google/generative-ai';

export default function setupGeminiRoutes(app, db) {
  // Lazy-init so missing key doesn't crash the whole server on startup
  let genAI = null;

  function getClient() {
    if (genAI) return genAI;
    const key = process.env.GEMINI_API_KEY || getKeyFromDb(); // see §6
    if (!key) throw new Error('GEMINI_API_KEY not configured');
    genAI = new GoogleGenerativeAI(key);
    return genAI;
  }

  function getModel(systemInstruction) {
    return getClient().getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction,               // string — see §4
      generationConfig: {
        temperature: 0.4,              // lower = more deterministic for GST domain
        maxOutputTokens: 2048,
      },
    });
  }

  // Routes go here...
}
```

---

## 4. System Prompts (`systemInstruction`)

`systemInstruction` is passed to `getGenerativeModel()` — **not** into chat history.

```javascript
// Static base persona (define once per route module)
const BASE_SYSTEM_PROMPT = `You are a GST and Indian taxation expert assistant embedded inside
"Audit With Vaswani" — a CA firm's desktop reconciliation application.

Rules:
- Answer only questions related to GST, income tax, TDS, reconciliation, or the app's modules.
- Be concise; the user is a CA or accountant. No generic AI disclaimers.
- When referencing amounts, always use Indian numbering (₹ lakhs/crores).
- If asked about data you cannot see, instruct the user to check the relevant module.
- Never fabricate GSTIN, invoice numbers, or portal data.`;
```

**Dynamic context injection** is done by appending a `[RUNTIME_CONTEXT]` block to this base string — see §9.

---

## 5. Multi-Turn Chat (`startChat` / `sendMessage`)

### History array format (EXACT — Gemini uses `"model"` not `"assistant"`)
```javascript
const history = [
  { role: 'user',  parts: [{ text: 'What is my ITC eligibility?' }] },
  { role: 'model', parts: [{ text: 'ITC under Section 16 requires...' }] },
  // NEVER role: "system" or role: "assistant" — invalid for Gemini API
];
```

### Creating a chat session
```javascript
const model = getModel(buildSystemPrompt(ctx)); // ctx = { gstin, module, fy }

const chat = model.startChat({
  history,                  // [] for new session, prior turns for continuation
  generationConfig: {       // can also override per-chat
    temperature: 0.4,
  },
});
```

### Sending a message (non-streaming)
```javascript
const result = await chat.sendMessage(userMessage);
const text = result.response.text();
```

### Sending a message (streaming)
```javascript
const result = await chat.sendMessageStream(userMessage);
for await (const chunk of result.stream) {
  const text = chunk.text(); // write to SSE here
}
```

### `sendMessage` vs `generateContent`
| | `chat.sendMessage` | `model.generateContent` |
|---|---|---|
| History | Automatically maintained in chat object | Stateless — you manage history manually |
| Multi-turn | ✅ Natural | ❌ Requires full `contents` array each call |
| Use when | Chat assistant | One-off single queries |

**Use `chat.sendMessageStream` for the assistant endpoint.**

---

## 6. Streaming SSE — Express Route (Complete)

```javascript
// In setupGeminiRoutes(app, db):

// In-process session store: sessionId → { chat, history[] }
// For Electron desktop app (single user), this is sufficient.
// For multi-user network mode, prefix sessionId with username from JWT.
const sessions = new Map();

app.post('/api/gemini/chat', async (req, res) => {
  const { message, sessionId, context } = req.body;
  // context = { gstin, module, fy } — injected by frontend without polluting history

  if (!message?.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  // ── SSE headers ──────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Prevent nginx buffering in tunnel mode
  res.flushHeaders();

  const sendChunk = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    // ── Get or create chat session ────────────────────────────────────────
    let session = sessions.get(sessionId);

    if (!session) {
      const systemPrompt = buildSystemPrompt(context); // §9
      const model = getModel(systemPrompt);
      const chat = model.startChat({ history: [] });
      session = { chat, history: [] };
      sessions.set(sessionId, session);

      // Auto-cleanup session after 30 minutes idle
      setTimeout(() => sessions.delete(sessionId), 30 * 60 * 1000);
    } else if (context) {
      // Context changed (user switched client/module) — rebuild system prompt
      // by replacing the model on the session (startChat is cheap)
      const systemPrompt = buildSystemPrompt(context);
      const model = getModel(systemPrompt);
      session.chat = model.startChat({ history: session.history });
    }

    // ── Stream response ───────────────────────────────────────────────────
    const result = await session.chat.sendMessageStream(message);
    let fullText = '';

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        fullText += text;
        sendChunk({ text });
      }
    }

    // Save clean turn to session history (without context wrapper)
    session.history.push(
      { role: 'user',  parts: [{ text: message }] },
      { role: 'model', parts: [{ text: fullText }] },
    );

    sendChunk({ done: true });
    res.end();

  } catch (err) {
    console.error('[Gemini] Error:', err.message);

    if (!res.writableEnded) {
      const isRateLimit = err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED');
      sendChunk({
        error: isRateLimit
          ? 'API rate limit reached. Please wait a moment and try again.'
          : 'Gemini API error: ' + (err.message || 'Unknown error'),
      });
      res.end();
    }
  }
});

// Clear a session (user clicks "New Chat")
app.delete('/api/gemini/session/:sessionId', (req, res) => {
  sessions.delete(req.params.sessionId);
  res.json({ ok: true });
});
```

---

## 7. API Key Security

### Primary: Environment Variable (recommended for Electron)
```bash
# .env (add to .gitignore — already done if following existing pattern)
GEMINI_API_KEY=AIza...your_key_here
```

```javascript
// server.js already uses dotenv-style env vars via process.env
// In gemini_routes.js:
const apiKey = process.env.GEMINI_API_KEY;
```

**In Electron**, set via `process.env` in `main.cjs` before the server starts:
```javascript
// main.cjs (Electron main process)
process.env.GEMINI_API_KEY = app.getPath('userData'); // NOT this
// Instead: store in electron-store or read from a local config file
```

### Secondary: SQLite `app_config` Table (for user-configurable key via Settings UI)

The `app_config` table already exists (`key TEXT PRIMARY KEY, value TEXT`).

```javascript
// In gemini_routes.js — reading key from DB
function getKeyFromDb() {
  return new Promise((resolve, reject) => {
    db.get(`SELECT value FROM app_config WHERE key = 'gemini_api_key'`, [], (err, row) => {
      if (err) reject(err);
      else resolve(row?.value || null);
    });
  });
}

// API to save key from Settings UI
app.post('/api/gemini/config/key', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey?.startsWith('AIza')) {
    return res.status(400).json({ error: 'Invalid API key format' });
  }
  db.run(
    `INSERT INTO app_config (key, value) VALUES ('gemini_api_key', ?)
     ON CONFLICT(key) DO UPDATE SET value = ?`,
    [apiKey, apiKey],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      genAI = null; // Reset client to pick up new key
      res.json({ ok: true });
    }
  );
});

// API to check if key is configured (returns boolean, never the key itself)
app.get('/api/gemini/config/status', (req, res) => {
  db.get(`SELECT value FROM app_config WHERE key = 'gemini_api_key'`, [], (err, row) => {
    const hasEnvKey = !!process.env.GEMINI_API_KEY;
    const hasDbKey  = !!row?.value;
    res.json({ configured: hasEnvKey || hasDbKey, source: hasEnvKey ? 'env' : hasDbKey ? 'db' : 'none' });
  });
});
```

### Security Rules
- ✅ Key lives only in `process.env` or SQLite — **never** sent to frontend
- ✅ `/api/gemini/config/status` returns `{ configured: true }` only — no key value
- ✅ Add `.env` and `*.db` to `.gitignore` (already done in this project)
- ❌ Never use `VITE_GEMINI_API_KEY` — Vite bakes it into the frontend bundle

---

## 8. Error Handling

```javascript
// Wrap the stream call with structured error classification:
function classifyGeminiError(err) {
  const msg = err.message || '';

  if (msg.includes('API_KEY') || msg.includes('API key') || err.status === 400) {
    return { code: 'INVALID_KEY', userMessage: 'Gemini API key is invalid or missing. Go to Settings → AI Assistant to configure it.' };
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return { code: 'RATE_LIMIT', userMessage: 'API rate limit reached (15 req/min or 1,500/day on free tier). Wait 60 seconds or check your quota at aistudio.google.com.' };
  }
  if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
    return { code: 'SERVICE_DOWN', userMessage: 'Gemini API is temporarily unavailable. Try again in a moment.' };
  }
  if (msg.includes('SAFETY') || msg.includes('blocked')) {
    return { code: 'SAFETY_BLOCK', userMessage: 'Response blocked by safety filter. Rephrase your question.' };
  }
  return { code: 'UNKNOWN', userMessage: 'AI assistant error: ' + msg };
}
```

**Rate limit retry** (only for non-streaming pre-flight checks):
```javascript
async function withRetry(fn, maxRetries = 2) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      const isRate = err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED');
      if (isRate && i < maxRetries) {
        await new Promise(r => setTimeout(r, 2000 * Math.pow(2, i)));
        continue;
      }
      throw err;
    }
  }
}
```

---

## 9. Context Injection Pattern (Dynamic, Non-Polluting)

**Pattern:** Build a fresh `systemInstruction` string per request that includes a `[RUNTIME_CONTEXT]` block. This keeps conversation `history` clean — only real user/model turns are stored.

```javascript
// gemini_routes.js

const BASE_SYSTEM_PROMPT = `You are a GST and Indian taxation expert assistant embedded inside
"Audit With Vaswani". Answer only GST, income tax, TDS, and reconciliation questions.
Be concise. Use Indian numbering format (₹, lakhs, crores). No AI disclaimers.`;

function buildSystemPrompt(ctx = {}) {
  const { gstin, clientName, module: activeModule, fy } = ctx;

  const contextBlock = `
[RUNTIME_CONTEXT — updated each session, not part of conversation history]
- Active Client  : ${clientName || 'None selected'}
- Active GSTIN   : ${gstin || 'None selected'}
- Active Module  : ${activeModule || 'General'}
- Financial Year : ${fy || 'Not specified'}
- Timestamp      : ${new Date().toISOString()}
[/RUNTIME_CONTEXT]

When the user refers to "my client", "current GSTIN", or "this filing", use the above context.
If no GSTIN is selected and the question requires one, ask the user to select a client first.`;

  return BASE_SYSTEM_PROMPT + contextBlock;
}
```

### Frontend sends context with each message (never stored as a chat turn):
```javascript
// React — POST body
{
  message: "What is my ITC for April?",
  sessionId: "user-abc-123",
  context: {
    gstin: "27AABCT1332L1ZS",
    clientName: "ABC Traders Pvt Ltd",
    module: "GST Reconciliation",
    fy: "2024-25"
  }
}
```

### What goes into session `history` (clean — no context):
```javascript
// Only this gets saved:
{ role: 'user',  parts: [{ text: "What is my ITC for April?" }] }
{ role: 'model', parts: [{ text: "Based on your GSTR-2B for April 2024..." }] }
// Context block is NOT saved to history
```

**Why rebuild the model on context change?** `startChat` is cheap (no API call). When the user switches client/GSTIN, the context in `systemInstruction` must update. The history of the conversation is replayed with the new system prompt by calling `model.startChat({ history: session.history })`.

---

## 10. Frontend Integration (React)

### Hook: `useGeminiChat.ts`
```typescript
// src/hooks/useGeminiChat.ts
import { useState, useCallback, useRef } from 'react';

const API_BASE = 'http://localhost:3001'; // server.js port

interface ChatContext {
  gstin?: string;
  clientName?: string;
  module?: string;
  fy?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function useGeminiChat(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (text: string, context: ChatContext) => {
    if (!text.trim() || streaming) return;

    setError(null);
    setStreaming(true);

    // Optimistically add user message
    setMessages(prev => [...prev, { role: 'user', content: text }]);

    // Placeholder for streaming assistant reply
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${API_BASE}/api/gemini/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId, context }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Server error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            if (data.error) throw new Error(data.error);

            if (data.text) {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + data.text,
                };
                return updated;
              });
            }
          } catch (parseErr) {
            // Non-JSON chunk — ignore
          }
        }
      }

    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message);
      // Remove the empty assistant placeholder on error
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [sessionId, streaming]);

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearChat = useCallback(async () => {
    setMessages([]);
    setError(null);
    await fetch(`${API_BASE}/api/gemini/session/${sessionId}`, { method: 'DELETE' });
  }, [sessionId]);

  return { messages, streaming, error, sendMessage, stopStream, clearChat };
}
```

### Context sourcing in a component:
```typescript
// In any page component — pull active client/module from existing app state
import { useGeminiChat } from '@/hooks/useGeminiChat';

const sessionId = useMemo(() => crypto.randomUUID(), []); // stable per component mount

const context = {
  gstin: activeClient?.gstin,
  clientName: activeClient?.name,
  module: 'GST Reconciliation',
  fy: selectedFY,     // e.g. "2024-25"
};

const { messages, streaming, sendMessage, stopStream, clearChat } = useGeminiChat(sessionId);

// On user submit:
await sendMessage(inputText, context);
```

---

## 11. Registration in `server.js`

```javascript
// server.js — add alongside existing route imports
import setupGeminiRoutes from './gemini_routes.js';

// In the routes registration block (after db is initialized):
setupGeminiRoutes(app, db);
```

---

## 12. Minimal Working `gemini_routes.js` Skeleton

```javascript
// gemini_routes.js
import { GoogleGenerativeAI } from '@google/generative-ai';

const BASE_PROMPT = `You are a GST/tax expert assistant inside "Audit With Vaswani".
Answer only taxation and reconciliation questions. Be concise. Use ₹ and Indian numbering.`;

function buildSystemPrompt(ctx = {}) {
  return BASE_PROMPT + `\n\n[RUNTIME_CONTEXT]\nGSTIN: ${ctx.gstin || 'None'}\nModule: ${ctx.module || 'General'}\nFY: ${ctx.fy || 'N/A'}\n[/RUNTIME_CONTEXT]`;
}

export default function setupGeminiRoutes(app, db) {
  let _genAI = null;

  function getGenAI() {
    if (_genAI) return _genAI;
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not set');
    _genAI = new GoogleGenerativeAI(key);
    return _genAI;
  }

  const sessions = new Map();

  app.post('/api/gemini/chat', async (req, res) => {
    const { message, sessionId = 'default', context = {} } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message required' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (d) => res.write(`data: ${JSON.stringify(d)}\n\n`);

    try {
      let session = sessions.get(sessionId);
      if (!session) {
        const model = getGenAI().getGenerativeModel({
          model: 'gemini-2.0-flash',
          systemInstruction: buildSystemPrompt(context),
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
        });
        session = { chat: model.startChat({ history: [] }), history: [] };
        sessions.set(sessionId, session);
        setTimeout(() => sessions.delete(sessionId), 30 * 60 * 1000);
      }

      const result = await session.chat.sendMessageStream(message);
      let fullText = '';

      for await (const chunk of result.stream) {
        const t = chunk.text();
        if (t) { fullText += t; send({ text: t }); }
      }

      session.history.push(
        { role: 'user',  parts: [{ text: message }] },
        { role: 'model', parts: [{ text: fullText }] },
      );

      send({ done: true });
      res.end();
    } catch (err) {
      const isRate = /429|RESOURCE_EXHAUSTED/.test(err.message || '');
      send({ error: isRate ? 'Rate limit hit — wait 60s' : err.message });
      res.end();
    }
  });

  app.delete('/api/gemini/session/:id', (req, res) => {
    sessions.delete(req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/gemini/config/status', (req, res) => {
    const hasEnv = !!process.env.GEMINI_API_KEY;
    db.get(`SELECT value FROM app_config WHERE key = 'gemini_api_key'`, [], (err, row) => {
      res.json({ configured: hasEnv || !!row?.value });
    });
  });

  app.post('/api/gemini/config/key', (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'apiKey required' });
    db.run(
      `INSERT INTO app_config (key, value) VALUES ('gemini_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = ?`,
      [apiKey, apiKey],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        _genAI = null; // Reset so new key is picked up
        res.json({ ok: true });
      }
    );
  });
}
```

---

## Summary Checklist

| # | Item | Decision |
|---|---|---|
| 1 | npm package | `@google/generative-ai` (not `@google/genai`) |
| 2 | Model | `gemini-2.0-flash` |
| 3 | System prompt | `getGenerativeModel({ systemInstruction })` — string |
| 4 | Multi-turn | `model.startChat({ history })` → `chat.sendMessageStream()` |
| 5 | Streaming | SSE via `text/event-stream`, `res.write("data: ...\n\n")` |
| 6 | API key | `process.env.GEMINI_API_KEY` primary, `app_config` SQLite secondary |
| 7 | Key exposure | Never in frontend; `/api/gemini/config/status` returns boolean only |
| 8 | Error handling | Classify 429/RESOURCE_EXHAUSTED → user-readable message |
| 9 | Context injection | `buildSystemPrompt(ctx)` → `systemInstruction`; history stays clean |
| 10 | Frontend | `useGeminiChat` hook with `fetch` + `ReadableStream` getReader |
| 11 | Registration | `setupGeminiRoutes(app, db)` in `server.js` |
