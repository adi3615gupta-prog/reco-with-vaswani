# Discussion Log: Phase 22 — Sourav Universal Gemini AI Assistant & In-App Chatbot

**Date:** 2026-10-29  
**Phase:** 22  
**Command:** `/gsd-discuss-phase`  
**Participants:** User (Founder/Visionary) & Antigravity (Builder)  

---

## Areas Discussed & Locked Decisions

### Area 1: Task Action Handling in Software
- **Question:** How should Sourav handle tasks when instructed to do something in the software?
- **Options Presented:**
  1. *(Recommended)* Deep-link action buttons in chat (e.g. `[Open IMS]`, `[Switch to Client]`, `[Download 2B]`) plus step-by-step guidance
  2. Guided step-by-step guidance only (explains which tab/button to click without triggering navigation)
  3. Direct autonomous action execution (Sourav triggers backend actions directly when confirmed)
- **User Selection:** Option 1 — **Deep-link action buttons in chat plus step-by-step guidance**
- **Decision:** Sourav emits action tokens `[ACTION:navigate:<target>]` which the frontend renders as interactive buttons allowing 1-click navigation to any of the 12 software modules.

---

### Area 2: Communication Tone & Language
- **Question:** What communication tone and language should Sourav use?
- **Options Presented:**
  1. *(Recommended)* Adaptive Hinglish/English (detects how you ask — replies in Hindi/Hinglish or professional English with GST sections)
  2. Strict Professional English (formal CA style, cites exact CGST Act sections)
  3. Conversational Hindi/Hinglish by default
- **User Selection:** Option 1 — **Adaptive Hinglish/English**
- **Decision:** Sourav matches the user's prompt language. If the user asks in Hindi/Hinglish, Sourav responds in clear, natural Hinglish while retaining technical and statutory accuracy. Always cites exact CGST Act section numbers (e.g., Sec 16(2)(aa), Sec 17(5), Sec 50).

---

### Area 3: Google Gemini API Key Configuration
- **Question:** Where would you like the Google Gemini API key to be configured?
- **Options Presented:**
  1. *(Recommended)* Both — configure in Settings → AI Assistant tab AND show a quick setup prompt inside the chat panel if missing
  2. Settings Modal only (under new "AI Assistant" tab)
- **User Selection:** Option 1 — **Both**
- **Decision:** Two entry points:
  1. Settings Modal → new **"🤖 AI Assistant"** tab with full test connection and AI Studio link.
  2. In-Chat banner: When user clicks the Sourav bubble for the first time without an API key, an inline setup banner appears directly inside the drawer allowing instant key entry.

---

### Area 4: Floating Chatbot UI & Presentation
- **Question:** How should the Sourav chatbot UI appear on screen?
- **Options Presented:**
  1. *(Recommended)* Persistent floating bubble at bottom-right ("✨ Sourav") that slides open a right-side drawer panel (384px wide)
  2. Full-height slide-over sidebar panel on the right side
  3. Center modal dialog popup (like Settings/Vault modal)
- **User Selection:** Option 1 — **Persistent floating bubble at bottom-right ("✨ Sourav") that slides open a right-side drawer panel (384px wide)**
- **Decision:** Fixed at `bottom-6 right-6`, 56×56px gold/amber gradient circle with sparkle badge. Slides open a 384px wide, 560px tall obsidian dark drawer panel.

---

## Action Items for Downstream Execution
1. **Plan 22-01 (Backend):**
   - Install `@google/generative-ai`
   - Implement `setupGeminiRoutes(app, db)` with `/api/gemini/chat`, `/api/gemini/config`, `/api/gemini/status`
   - Store API key in SQLite `app_config` table
   - Construct dynamic system prompt with adaptive Hinglish/English rules and `[ACTION:navigate:xxx]` tags
2. **Plan 22-02 (Frontend):**
   - Create `src/lib/geminiApi.ts`
   - Create `src/components/SouravChatbot.tsx` with floating FAB, slide-in drawer, action pill buttons, and in-chat setup banner
   - Mount globally in `src/components/AppShell.tsx`
   - Add "🤖 AI Assistant" tab to `src/components/SettingsModal.tsx`
