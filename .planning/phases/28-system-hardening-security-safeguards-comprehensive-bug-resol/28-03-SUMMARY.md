# Plan 28-03 Summary: Statutory Reco, GSTR-3B Cash Rollover & Autopilot Concurrency

**Plan:** 28-03  
**Phase:** 28 — System Hardening, Security Safeguards & Comprehensive Bug Resolution  
**Status:** Completed  
**Execution Date:** 2026-11-01  

---

## 1. Key Accomplishments

1. **Multi-User Playwright Browser Concurrency Isolation (`gstr2b_routes.js`, `gstr1_routes.js`):**
   - Replaced module-level singleton `browserState = { current: null }` with isolated `Map<string, Browser>()` keyed by client GSTIN (`activeBrowsers`).
   - Mapped `POST /api/gstr2b/portal-sync-browser` and `POST /api/gstr1/portal-sync-browser` to register browsers per normalized uppercase GSTIN.
   - Updated `POST /api/gstr2b/cancel` and `POST /api/gstr1/cancel` to close only the browser session matching `req.body.gstin`, preventing cross-client abort collisions across multiple workstations.
   - Guaranteed automatic cleanup via `activeBrowsers.delete(gstin)` in `finally` handlers and cancel blocks.

2. **Accurate Tax Type Error Classification (`src/lib/reconciliation.ts`):**
   - Enhanced cross-head interstate vs. intrastate mismatch detection in Pass 7.
   - When Books records IGST and 2B records CGST/SGST (or vice-versa), records are accurately categorized as `Tax Type Error` instead of misleading generic `Value Mismatch`.
   - Populated descriptive remarks clarifying which party filed IGST vs CGST/SGST.

3. **GSTR-3B Surplus TDS/TCS Cash Balance Rollover (`src/lib/gstr3bEngine.ts`):**
   - Extended `CashAndFinalSettlement` type definition to include `surplusTdsCashCfNextMonth?: TaxBreakdown`.
   - Updated `recalculateMonthData` to compute unutilized cash balance: `Math.max(0, round2(tdsCash - rawTaxAfterAdj))`.
   - In `recalculateAnnualWorking`, chained `surplusTdsCashCfNextMonth` from month $N$ into month $N+1$'s `tdsTcsOpeningCash` whenever opening cash has not been manually overridden by the user.

---

## 2. Verification

- `src/test/reconciliationEngine.test.ts`: 5/5 passed.
- `src/test/gstr3bPortalJson.test.ts`: 2/2 passed.
- Node module import validation for `gstr2b_routes.js` and `gstr1_routes.js` passed with zero syntax or runtime import errors.
