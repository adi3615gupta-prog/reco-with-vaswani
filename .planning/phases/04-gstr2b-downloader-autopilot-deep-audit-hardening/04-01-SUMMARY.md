# Phase 4 Plan 01: GSTR-2B Autopilot 12M Loop Resilience, Zero-Data-Loss Protection & Nil Return Distinction — Summary

**Execution Date:** 2026-10-22  
**Phase:** 04-gstr2b-downloader-autopilot-deep-audit-hardening  
**Plan:** 01  
**Status:** Completed & Verified  

---

## 1. Summary of Completed Objectives

Plan 04-01 delivered production-grade hardening, zero-data-loss protection, 12-month autonomous loop resilience, clean browser lifecycle management, and Nil-return tracking across Tab 4: GSTR-2B Downloader (Autopilot).

### Key Architectural Invariants Enforced:
1. **The Golden Rule ("New data download nahi toh purana data remove nahi hoga"):**
   - Download timeouts, portal access denied errors, or aborts strictly NEVER delete or truncate existing invoices or batches in SQLite.
   - `bulkSaveGstr2bInvoices` explicitly guards against empty payloads (`if (!invoices || invoices.length === 0) return resolve({ count: 0 });`).
2. **12-Month Loop Non-Blocking Resilience (D-01):**
   - Each month in `runGstr2bAutopilot` executes inside an isolated `try { ... } catch (monthErr) { ... }` block.
   - If an individual month encounters portal latency or download failure, the error is caught, amber warning banner is displayed (`#f59e0b`), the failure is logged and recorded in `syncedResults`, and the loop smoothly proceeds to the remaining months (yielding e.g. "11/12 Synced").
   - Inter-month navigation resets (`ensureReturnsSearchScreen()`) are guarded with error recovery.
   - Angular digest cycle stability enhanced with retry checks for month select elements (D-02).
   - Consolidated full-year 8-sheet Excel is generated and returned even if only a subset of months succeeded.
3. **Confirmed Nil Return Distinction (`NIL_SYNCED` vs `PENDING`, D-04):**
   - Implemented and exported `markGstr2bMonthNilSynced(db, clientGstin, returnPeriod, excelPath, jsonPath)`.
   - Explicitly records genuine Nil returns (portal card confirms 0 records OR valid file contains 0 invoices) with `total_invoices = 0` and `status = 'NIL_SYNCED'`.
   - `recalculate2bBatchMetrics` preserves `NIL_SYNCED` status and sets unconfirmed 0-invoice periods to `PENDING` rather than falsely marking them as `SYNCED`.
4. **Clean Windows Browser Cancellation & Route Hardening:**
   - Added `POST /api/gstr2b/cancel` to cleanly close Playwright Chromium instances on Windows and release memory without leaving orphan processes.
   - In `POST /api/gstr2b/portal-sync-browser`, registered `req.on('close')` hook to abort sessions if client drops the HTTP connection.
   - In `GET /api/gstr2b/fy-summary`, included `NIL_SYNCED` in completion metrics (`syncedMonths`, `syncedCount`), and provided `nilMonths: []` array.
   - Exported `setupGstr2bRoutes` both as default and named `registerGstr2bRoutes` / `setupGstr2bRoutes`.
   - Ran `npm run obfuscate` to update `server.cjs` and `server.obfuscated.cjs`.

---

## 2. Modified Files

| File | Changes Made |
|---|---|
| `gstr2b/autopilot.js` | Per-month `try/catch` error isolation in 12M loop; safe `ensureReturnsSearchScreen()` transitions; month selector retry logic; confirmed Nil return detection (`markGstr2bMonthNilSynced`); granular status return (`SYNCED`, `NIL_SYNCED`, `FAILED`, `PENDING`); resilient consolidated Excel generation. |
| `gstr2b/db.js` | Implemented and exported `markGstr2bMonthNilSynced`; updated `recalculate2bBatchMetrics` to preserve `NIL_SYNCED` and avoid blindly marking empty batches as `SYNCED`; maintained zero-delete guard in `bulkSaveGstr2bInvoices`. |
| `gstr2b_routes.js` | Mounted `POST /api/gstr2b/cancel`; added `req.on('close')` abort listener in `/api/gstr2b/portal-sync-browser`; updated `GET /api/gstr2b/fy-summary` to aggregate `NIL_SYNCED` batches and add `nilMonths` array; exported named `registerGstr2bRoutes` alongside default `setupGstr2bRoutes`. |
| `server.cjs` | Re-bundled and synchronized via `npm run obfuscate`. |

---

## 3. Verification & Automated Tests

All verification commands defined in PLAN 04-01 passed successfully:

```bash
# Verify autopilot.js export
node -e "import('./gstr2b/autopilot.js').then(m => { if (typeof m.runGstr2bAutopilot !== 'function') process.exit(1); console.log('runGstr2bAutopilot OK'); })"
# Output: runGstr2bAutopilot OK

# Verify db.js markGstr2bMonthNilSynced export
node -e "import('./gstr2b/db.js').then(m => { if (typeof m.markGstr2bMonthNilSynced !== 'function') process.exit(1); console.log('markGstr2bMonthNilSynced OK'); })"
# Output: markGstr2bMonthNilSynced OK

# Verify gstr2b_routes.js named and default exports
node -e "import('./gstr2b_routes.js').then(m => { if (typeof m.registerGstr2bRoutes !== 'function' && typeof m.default !== 'function') process.exit(1); console.log('routes OK'); })"
# Output: routes OK

# Verify default export in gstr2b_routes.js
node -e "import('./gstr2b_routes.js').then(m => { if (typeof m.default !== 'function') process.exit(1); console.log('default export OK'); })"
# Output: default export OK

# Verify existing GSTR-2B autopilot scrutiny tests
npx vitest run src/test/gstr2bAutopilotScrutiny.test.ts
# Output: ✓ src/test/gstr2bAutopilotScrutiny.test.ts (2 tests) Passed
```

---

## 4. Git Commit Reference

- **Commit:** `7d59349` — `feat(gstr2b): harden 12m loop resilience, zero-data-loss protection and nil return distinction`
