# Phase 23 Context: Central Office-Wise Gemini API Key Distribution & Firebase License Sync

**Captured:** 2026-10-29 (via `/gsd-discuss-phase`)  
**Phase:** 23  
**Status:** Locked & Ready for Execution  

---

## 1. Executive Summary & Vision

Eliminate the need for individual office staff, article assistants, or workstation users to manually obtain and paste a Google Gemini API key. Instead, the firm admin/developer configures the Gemini API Key **once** in the Firebase module (`reco-vaswani-license` Firestore project):
- Every client workstation belonging to that office (`office_id`) automatically synchronizes and caches the Gemini API Key from Firebase Firestore upon application launch or license heartbeat.
- The assistant "Sourav" activates out-of-the-box for all users in the office with zero configuration needed by the end-user.
- Admins can manage the key centrally: either via a global master key in Firebase (`system_config/ai_settings`), or per-office override in `serial_keys`, or push/sync directly from the desktop Admin/Settings panel.

---

## 2. Locked Implementation Decisions (From User Discussion)

### A. Firebase Firestore Storage Schema (Hybrid Architecture)
1. **Level 1 — Per-Office Override (`serial_keys` collection):**
   - Document: `serial_keys/{serialKey}` where `office_id == currentOfficeId`
   - Field: `gemini_api_key: string`
   - Use case: Allows granting special AI tiers or customized API keys to specific branch offices.
2. **Level 2 — Global Master Fallback (`system_config/ai_settings`):**
   - Document: `system_config/ai_settings`
   - Field: `gemini_api_key: string`
   - Use case: Master key shared by all licensed offices that do not have an explicit per-office override.
3. **Level 3 — Local SQLite Cache & Persistence:**
   - Table: SQLite `app_config (key = 'gemini_api_key')`
   - Behavior: Once synchronized from Firestore, the key is saved locally in SQLite so client workstations continue working seamlessly even when offline or behind restrictive firewalls.
   - Origin Tracking: Track origin in `app_config (key = 'gemini_key_origin', value = 'cloud_office' | 'cloud_global' | 'local_manual')`.

### B. Admin Flow & Key Management
- **Desktop Admin/Settings UI:**
  - In `SettingsModal.tsx` (under the Sourav AI tab):
    - Shows badge: `🟢 Active (Synced from Office Cloud License)` or `🟢 Active (Custom Local Key)` or `🟡 Key Required`.
    - Action: **"Sync from Cloud"** button — immediately fetches latest key from Firestore and re-tests connection.
    - Action: **"Push to Cloud as Office Key"** (for admins) — pushes the locally entered key to the office's Firestore document.
- **Firebase Web Super Admin Portal Integration:**
  - Export structured Firestore schema and React/HTML snippet for the web serial key generator portal so the admin can set/update `gemini_api_key` while issuing or editing serial keys.

### C. Automatic Sync Triggers in Backend (`server.js`)
1. **On Startup:** Call `syncGeminiKeyFromCloud()` during server initialization.
2. **On License Snapshot (`onSnapshot`):** When the `serial_keys` Firestore document updates, check if `gemini_api_key` changed and update SQLite `app_config`.
3. **Manual Trigger API:** `POST /api/gemini/sync-cloud` allowing the frontend to trigger an on-demand re-sync anytime.
4. **Push API:** `POST /api/gemini/push-cloud` allowing an admin to write the key to Firebase Firestore.

---

## 3. Canonical References

- Central Server & Firestore Integration: [`server.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/server.js#L44-L60) (Firestore client initialization & license heartbeat)
- Gemini Route Handler: [`gemini_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gemini_routes.js) (key retrieval & AI call cascade)
- Settings & AI Tab UI: [`src/components/SettingsModal.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/SettingsModal.tsx#L1325)
- Frontend API Client: [`src/lib/geminiApi.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/geminiApi.ts)

---

## 4. Next Steps

1. Create execution plan `23-01-PLAN.md` covering:
   - Cloud sync engine in `server.js` and `gemini_routes.js`
   - `/api/gemini/sync-cloud` and `/api/gemini/push-cloud` endpoints
   - Firestore schema helpers for `serial_keys` and `system_config`
   - Frontend UI in `SettingsModal.tsx` and `SouravChatbot.tsx` with "Sync from Cloud" button and license sync status badges
2. Execute the plan, test with Vitest, and verify build.
