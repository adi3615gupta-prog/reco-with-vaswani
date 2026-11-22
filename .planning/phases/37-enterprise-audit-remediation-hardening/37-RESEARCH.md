# Phase 37 Research: Enterprise Deep Audit Remediation & Hardening

**Date:** 2026-11-10
**Source Basis:** Live source verification + 6 domain audit reports in [EVAL-REVIEW.md](file:///C:/Users/vaswa/.gemini/antigravity/brain/90920374-c84d-4c94-9f5f-47d5a1f62511/EVAL-REVIEW.md)
**Baseline Verification Executed:**
- `node ./node_modules/vitest/vitest.mjs run`: 49 passed, 1 failed (`src/test/landingPage.test.tsx`: 11 failures due to `useNavigate()` without `<MemoryRouter>` and stale Phase 29 string assertions).
- `node ./node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit`: Exits non-zero with multiple pre-existing TypeScript errors (Note: root `tsc --noEmit` silently skipped checking because root `tsconfig.json` has `"files": []` with project references).

---

## Critical Architectural Landmines Verified in Live Code

1. **Auth Middleware Deployment Order (`server.js` + `src/lib/api.ts`)**:
   - Many UI files (`GstNoticesDashboard.tsx`, `BankCmaAppraisal.tsx`, `AuditModule.tsx`, `DepreciationModule.tsx`, `Gstr1WorkingSheet.tsx`, `RecoHistoryModal.tsx`, `Reconciliation.tsx`, `finStatements.storage.ts`, `tallyApi.ts`, `gdrive.ts`, `ClientDashboard.tsx`, `MonthlyAuditSuite.tsx`) still call raw `fetch('/api/...')` without Bearer tokens.
   - **Rule:** Wave 1 (`37-01`) MUST migrate all authenticated frontend calls to `safeApiFetch` / `authHeaders()` BEFORE/WITH enforcing `authenticateToken` across route modules, while preserving public endpoints (`/api/ping`, `/api/health`, `/api/network-info`, `/api/login`, `/api/logout`, `/api/activate`, `/api/admin-exists`, `/api/setup-admin`, `/ims-review/:token`, `/api/ims/public/review/:token`, `/api/ims/public/submit/:token`).

2. **Encrypted Credentials Vault Compatibility (`ims_routes.js`, `credentialsVaultSync.js`, `gstr1/`, `gstr2b/`, `notices/`)**:
   - All 3 autopilots (`ims_routes.js#L1579`, `gstr1/autopilot.js#L65`, `gstr2b/autopilot.js#L39`) already read `portal_password` directly from SQLite `clients`.
   - Frontend `ImsMasterManager.tsx`, `CredentialsVaultModal.tsx`, and `SettingsModal.tsx` currently check `Boolean(c.portal_password)` as a configured badge and send `portal_password` back on metadata edits.
   - **Rule:** Return `has_password: Boolean(row.portal_password)` and omit raw `portal_password` on `GET /api/ims/credentials` & `GET /api/clients`. Frontend must check `Boolean(c.has_password || c.has_credentials)` and only send `portal_password` when user explicitly enters a new password (preserving existing SQLite secret via `COALESCE`). Backend uses AES-256-GCM (`enc:v1:...`) with graceful legacy plaintext read + re-encryption on sync/write.

3. **Firebase Client SDK Dependency (`server.js`, `firebaseAuditSync.ts`, `firestore.rules`)**:
   - Both `server.js` and `src/lib/firebaseAuditSync.ts` use `firebase/firestore` client SDK directly without Firebase Auth sign-in.
   - **Rule:** Proxy client Firestore queries (`firebaseClient.ts` `serial_keys`) through authenticated `server.js` routes first, and establish Firebase Auth / Admin SDK access in `server.js` BEFORE tightening `firestore.rules` (gated by `checkpoint:decision`).

4. **Test Coupling Traps Verified**:
   - `src/test/debitNoteEngine.test.ts#L159` explicitly asserts the Biostadt alias `24AACCB1830G1Z9 -> 27AACCB1830G1Z3` in `resolveEffectiveGstin`. Update test + replace global hardcode with opt-in `customGstinAliases` map.
   - `src/test/reconciliationEngine.test.ts#L47-L80` explicitly asserts `'PUR-101'` (₹5000) ↔ `'XYZ/2024/101'` (₹5200) matches as `'Value Mismatch'`. Core invoice refinement in `reconciliation.ts` must NOT break valid prefix+serial `Value Mismatch` pairs — protect via date proximity + multi-segment extraction + tax-closeness ranking rather than a flat `tolerance` rejection.
   - `src/test/clientAdditionTemplateAndSettings.test.ts#L61` tests `parseClientsExcel` parsing `portal_password` from uploaded templates. Keep upload parsing supporting `portal_password`, while ensuring `generateCredentialsTemplateExcel` NEVER exports stored passwords from live clients.

5. **Real-World Path & Variable Facts Verified**:
   - `ResultsTable.tsx#L110`: `visibleCount` is truly undefined (`ReferenceError` at runtime).
   - `server.js#L1461`: `POST /api/tally-proxy` truly omits `authenticateToken` despite port clamping (`9000–9010`).
   - `monthly_audit_routes.js#L845-L849`: uses undefined `userDataPath` (param is `defaultUserDataPath`) AND lacks `path.sep` boundary + allows `cwdPath`.
   - `returns_storage_routes.js#L2975, L3026`: uses undefined `storageConfig.dataPath`.
   - `ims_routes.js#L1632-L1638, L1658, L1665, L2715, L2779`: uses undeclared `activeBrowserInstance` & `gstinKey`.
   - `src/lib/excel/styles/cellUtils.ts`: actual path (not `utils/cellUtils.ts`).
   - Windows test/build execution: PowerShell blocks `npx.ps1`; invoke `node ./node_modules/vitest/vitest.mjs run` and `node ./node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit`.
