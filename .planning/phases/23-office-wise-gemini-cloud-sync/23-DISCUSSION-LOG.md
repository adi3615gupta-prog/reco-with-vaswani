# Discussion Log: Phase 23 — Central Office-Wise Gemini API Key Distribution & Firebase License Sync

**Date:** 2026-10-29  
**Phase:** 23  
**Command:** `/gsd-discuss-phase`  
**Participants:** User (Founder/Visionary) & Antigravity (Builder)  

---

## Areas Discussed & Locked Decisions

### Area 1: Firebase Storage Architecture
- **Question:** How would you like the Gemini API Key stored in Firebase Firestore?
- **Options Presented:**
  1. *(Recommended)* Hybrid — Global master key in Firebase with optional per-office override in `serial_keys`
  2. Global master key only in Firebase (one key for all offices and clients)
  3. Per-Office key inside each office's `serial_keys` document
- **User Selection:** Option 1 — **Hybrid (Global master key with optional per-office override)**
- **Decision:** The cloud sync engine first checks `serial_keys/{office_id}` for a customized key; if not found, falls back to `system_config/ai_settings`. This gives the admin maximum flexibility to set 1 key globally or customize per client office.

---

### Area 2: Admin Entry Point & Key Management
- **Question:** Where in the admin flow do you want to enter/manage the cloud Gemini API key?
- **Options Presented:**
  1. *(Recommended)* Both — In your Firebase Web Portal (serial key generator) AND in the desktop app's Admin/Settings panel
  2. In the Firebase Web Admin Portal only (when generating/editing serial keys)
  3. In the desktop app Admin Panel only (pushed up to Firebase)
- **User Selection:** Option 1 — **Both**
- **Decision:** Admins can manage the key directly from the desktop Settings UI (with a "Push to Cloud" button) AND through their Firebase Web Portal when generating/editing serial keys.

---

### Area 3: Caching & Offline Resilience
- **Question:** How should the client machines cache the cloud Gemini API key?
- **Options Presented:**
  1. *(Recommended)* Auto-cache locally in SQLite — once fetched from Firebase, users can use it even when offline or behind a firewall
  2. Always fetch live from Firebase on app launch
- **User Selection:** Option 1 — **Auto-cache locally in SQLite**
- **Decision:** Whenever a key is retrieved from Firestore, it is saved into SQLite `app_config (key = 'gemini_api_key')`. Workstations will continue functioning without requiring constant online access to Firebase.

---

### Area 4: Super Admin Web Portal Integration
- **Question:** Where is your Firebase Super Admin Web Portal codebase hosted?
- **Options Presented:**
  1. *(Recommended)* Add Desktop Admin UI with "Sync from Cloud / Push to Cloud" + provide exact Firestore schema/snippet for your Web Portal
  2. Provide the Firestore document schema & field instructions only
- **User Selection:** Option 1 — **Desktop Admin UI + Web Portal Schema & Code Snippet**
- **Decision:** We implement full two-way sync APIs (`/api/gemini/sync-cloud` and `/api/gemini/push-cloud`) in the desktop application, and provide a ready-to-copy code snippet for the user's web license generator.

---

## Action Items for Downstream Execution
1. Update `server.js` Firestore license monitor to automatically ingest `gemini_api_key` from `serial_keys` and `system_config/ai_settings`.
2. Update `gemini_routes.js` with `POST /api/gemini/sync-cloud` and `POST /api/gemini/push-cloud`.
3. Enhance `src/lib/geminiApi.ts` and `src/components/SettingsModal.tsx` to support cloud sync status telemetry (`cloud_office`, `cloud_global`, `local_manual`) and 1-click cloud sync/push actions.
4. Provide the exact Firestore schema documentation and web code snippet in `FIREBASE_AI_PORTAL_GUIDE.md`.
