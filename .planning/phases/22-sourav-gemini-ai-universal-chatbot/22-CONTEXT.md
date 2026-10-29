# Phase 22 Context: Sourav — Universal Gemini AI Assistant & In-App Chatbot

**Captured:** 2026-10-29 (Updated via `/gsd-discuss-phase`)  
**Phase:** 22  
**Status:** Locked & Ready for Execution  

---

## 1. Executive Summary & Vision

Integrate Google Gemini API as an intelligent, in-app assistant named **"Sourav"** directly inside the "AUDIT WITH VASWANI" desktop suite:
- **Assistant Persona:** Named **Sourav** — high-level CA compliance expert and software co-pilot.
- **Engine:** Google Gemini API (`gemini-2.0-flash` with 1M context window, high speed, and zero cost on Google AI Studio free tier).
- **Embedded UI:** Persistent amber/gold floating action bubble (FAB) in the bottom-right corner that slides open a 384px obsidian drawer panel.
- **Deep-Link Actions:** When guided through tasks, Sourav renders interactive action buttons (e.g., `[Open IMS Hub]`, `[Go to 3B Working]`, `[Open Reconciliation]`, `[Switch to Client]`) directly in chat bubbles for 1-click execution.
- **Language & Tone:** Adaptive Hinglish/English — detects the user's language, responds in natural Hindi/Hinglish or professional CA English, citing exact CGST Act sections and circulars.

---

## 2. Locked Implementation Decisions (From User Discussion)

### A. Floating Chatbot UI & Presentation
- **Placement:** Fixed bottom-right corner (`bottom-6 right-6`), gold/amber gradient circle with `✨` and "Sourav" badge.
- **Drawer Panel:** 384px wide, 560px tall, slides in smoothly from the bottom-right above the FAB.
- **Visual Style:** Obsidian Dark theme (`bg-[#0d1117]`, border `border-slate-800`), matching the app's executive styling.
- **Header:** "✨ Sourav · AI Assistant", real-time status pill (🟢 Connected / 🟡 Key Required), and active context chips (`Client`, `FY`, `Module`).
- **Bubbles:** User messages = amber-tinted right-aligned; Sourav messages = dark slate left-aligned with "S" avatar.

### B. In-App Task & Action Capabilities
- **Deep-Link Navigation Buttons:** When the user asks how to do something or instructs Sourav to navigate, Sourav emits structured action tags in the response:
  - `[ACTION:navigate:reco]` → Renders `<button>` "Open 2B vs Books Reco"
  - `[ACTION:navigate:ims]` → Renders `<button>` "Open IMS Hub"
  - `[ACTION:navigate:3b]` → Renders `<button>` "Open GSTR-3B Working"
  - `[ACTION:navigate:gstr1]` → Renders `<button>` "Open GSTR-1 Console"
  - `[ACTION:navigate:notices]` → Renders `<button>` "Open GST Notices"
  - `[ACTION:navigate:tds]` → Renders `<button>` "Open TDS Reco"
  - `[ACTION:navigate:finstatements]` → Renders `<button>` "Open Financial Statements"
- **Click Handling:** Clicking any action button triggers the global route/tab switch in `AppShell` / `Index.tsx`.

### C. Language & Tone Behavior
- **Adaptive Detection:** If the user speaks in Hindi/Hinglish (e.g. *"2B ka ITC match nahi ho raha kya karein"*), Sourav answers in conversational Hindi/Hinglish with technical precision (*"Aap Table 4 me Section 16(2)(aa) check karein..."*).
- **Statutory Authority:** Always cites exact statutory provisions:
  - ITC Eligibility: Section 16(2)(aa) CGST Act
  - Ineligible / Blocked ITC: Section 17(5)
  - Reversals: Rule 37, 37A, 42, 43
  - Time-barring: Section 16(4)
  - Interest: Section 50

### D. Gemini API Key Configuration
- **Dual Setup Experience:**
  1. **Settings Modal → 🤖 AI Assistant Tab:** Enter API key, view connection status (🟢 Active / 🔴 Missing), test connection with 1 click, and deep-link to Google AI Studio (`https://aistudio.google.com/app/apikey`).
  2. **In-Chat Quick Setup Banner:** If no key is configured when opening the chat drawer, Sourav shows a friendly banner directly inside the chat panel with an input field to paste the key immediately.
- **Security:** Key stored server-side in SQLite `app_config` table (key `'gemini_api_key'`). Never exposed in frontend JavaScript bundles.

---

## 3. Dynamic Context Injection Architecture

Each chat request to `POST /api/gemini/chat` passes:
```json
{
  "message": "User query",
  "context": {
    "clientName": "Shree Radhe Textiles",
    "gstin": "24AAACG1234F1Z8",
    "fy": "2024-25",
    "module": "gstr-3b"
  },
  "history": [
    { "role": "user", "text": "..." },
    { "role": "model", "text": "..." }
  ]
}
```

The backend constructs an ephemeral `systemInstruction` per request incorporating the active client, FY, module, and available deep-link action tokens, keeping the multi-turn `history` array pure and free from metadata clutter.

---

## 4. Canonical References

- Central Server & SQLite Storage: [`server.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/server.js)
- App Shell & Navigation Dispatcher: [`src/components/AppShell.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/AppShell.tsx)
- Settings Configuration Hub: [`src/components/SettingsModal.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/SettingsModal.tsx)
- Research Reference: [RESEARCH.md](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/.planning/phases/22-sourav-gemini-ai-universal-chatbot/RESEARCH.md)

---

## 5. Next Steps

1. Execute **Plan 22-01**: Backend Gemini API engine, `setupGeminiRoutes(app, db)`, `/api/gemini/chat`, `/api/gemini/config`, `/api/gemini/status`, and system prompt with action tokens.
2. Execute **Plan 22-02**: Frontend `SouravChatbot.tsx` with floating FAB, drawer panel, deep-link buttons, in-chat quick key setup, and Settings modal tab.
