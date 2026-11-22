# Phase 40: Architectural Decoupling, Inter-Module Isolation & Scoped Tally Session Management — Research & Specification

## Executive Summary
This phase systematically untangles inter-module coupling across Vaswani Return Enterprise while strictly guaranteeing that **no module's standalone business workflow is compromised or broken**. Each module becomes an autonomous, self-sufficient unit with clean standalone input mechanisms (Excel/JSON drop zones or scoped direct connectors), while cross-module automatic state push bridges and unsolicited background table queries are permanently eliminated.

---

## The 4 Core Architectural Principles of Phase 40

1. **Zero Unsolicited Cross-Module Push:**
   - Modules do not automatically inject state into or trigger operations in other modules (e.g. GSTR-1/GSTR-2B "Push to 3B" buttons and `/push-to-3b` endpoints are removed).
   - Inward GSTR-3B retains its own dedicated manual file drop zone and worksheet entry without relying on external push triggers.

2. **Case-Isolated Legal Scrutiny (Notices Decoupling):**
   - The GST & VAT Notices Suite (Module 12) must not silently scan other modules' SQLite tables (`gstr2b_invoices`, `gstr3b_monthly_returns`).
   - Notice reconciliation operates strictly against evidence files explicitly uploaded or attached to that specific notice case in the Legal Defense Workbench.

3. **Isolated Utility & Hub Output Boundaries:**
   - Consolidation Hub and Tally Direct Import must not force redirect or inject in-memory file objects directly into the Reconciliation Engine.
   - Instead, both provide clean, audit-grade **Excel Workbooks (`.xlsx`)** for download. Users can inspect, save, and independently drop those files into Reconciliation or any other module as desired.
   - GSTIN Scan operates as an autonomous scanner tool with its own paste and upload input, rather than receiving reconciliation internal state as props.

4. **Scoped Tally Port 9000 Lifecycle Management (User Mandate):**
   - *"Har ek module ke alag Tally port 9000 ho; module me rahe toh connected rahe, waha se koi dusre module me jaate hai disconnect ho jaaye."*
   - Tally Port 9000 is **NOT** globally persistent across the entire application shell.
   - Each module (`TdsReconciliation`, `BankCmaAppraisal`, `TaxAuditClause44`, `FinancialStatements`, `TallyXmlSuite`, `AuditModule`) manages its own scoped Tally connection lifecycle via a clean hook (`useScopedTallySession`).
   - When a user enters/mounts a module, its connection HUD activates; when navigating away / unmounting (or switching `appRoute`), the connection state and metadata caches are **immediately reset and disconnected**.
   - Suite 09 (Tally XML Suite) maintains its dual actions: offline XML generation (`Download Vouchers.xml`, `Download Masters.xml`) as primary, plus scoped direct HTTP push while active.

5. **Option A Confirmation for Module 1 & Module 2:**
   - Module 2 (Vendor Party-Wise Report) remains an **internal natural sub-tab** inside Module 1 (`Reconciliation.tsx`), mirroring how an Excel workbook contains an "All Invoices Working" sheet alongside a "Party Summary" sheet. No external coupling is involved.

---

## Detailed File and Code Mapping

### Wave 1: Returns & Notices Pipeline Decoupling
* **Files Modified:**
  - `src/pages/ReturnsDashboard.tsx`
    - Remove `POST /api/gstr1/push-to-3b` and `POST /api/gstr2b/push-to-3b` calls (Lines ~1629, ~1813).
    - Remove UI "Push to 3B" buttons and badges from GSTR-1 and GSTR-2B download decks.
    - Ensure Table 4 and Table 3.1 retain standalone JSON/Excel file drop capability.
  - `gstr1_routes.js`
    - Deprecate / remove `/api/gstr1/push-to-3b` endpoint.
  - `gstr2b_routes.js`
    - Deprecate / remove `/api/gstr2b/push-to-3b` endpoint.
  - `notices_routes.js`
    - Lines 222–249 and 272–299: Remove cross-table SQLite queries `SELECT * FROM gstr2b_invoices` and `threeBReturns` from returns storage.
    - Reconcile notice discrepancies strictly using `notice_attachments` or files attached to the active case in `gst_case_events` / `gst_cases`.
  - `src/lib/noticeReconciliation.ts`
    - Update `reconcileNoticeDiscrepancy` signature and callers so that `localReturnsData` is sourced only from user-provided case annexures.

### Wave 2: Reco Hub, Consolidation & Utility Decoupling
* **Files Modified:**
  - `src/pages/TallyDirectImport.tsx`
    - Remove "Send to Reconciliation" button / `onImportToReconciliation` trigger.
    - Add clear, prominent "Download Purchase Register (Excel)" button.
  - `src/pages/Consolidation.tsx`
    - In `DataPreview.tsx` (Step 3), remove `"Send to Reco"` button.
    - Ensure "Export Consolidated Excel" is the sole primary action.
  - `src/pages/Index.tsx`
    - Remove `handleDirectTallyImport` memory bridge.
    - Remove `handleSendToReco` callback.
    - Render `<Consolidation onBack={() => setAppRoute('hub')} />` and `<TallyDirectImport onBack={() => setAppRoute('hub')} />` without reco injection.
    - Update `<GstinScan />` rendering to be standalone without requiring `gstIssues` prop from active reco runs.
  - `src/pages/GstinScan.tsx`
    - Add standalone input: Paste GSTINs (textarea) or Upload Excel/CSV containing a GSTIN column.

### Wave 3: Scoped Tally Session Hook & Clean Component Teardown
* **Files Created/Modified:**
  - `src/hooks/useScopedTallySession.ts` (New Hook)
    - Manages `isConnected`, `isConnecting`, `companyInfo`, `tallyPort`, `error`, `ping()`, `connect()`, `disconnect()`.
    - Automatically executes `disconnect()` and clears module-specific metadata on `useEffect` cleanup (unmount).
  - `src/pages/TdsReconciliation.tsx`
    - Adopt `useScopedTallySession('tds', tallyPort)`.
    - Unmount clears Tally connection.
  - `src/pages/BankCmaAppraisal.tsx` & `src/pages/CmaReport.tsx`
    - Adopt `useScopedTallySession('cma', tallyPort)`.
    - Leaving CMA resets connection.
  - `src/pages/TaxAuditClause44.tsx`
    - Adopt `useScopedTallySession('clause44', tallyPort)`.
    - Leaving Clause 44 resets connection.
  - `src/pages/FinancialStatements.tsx` / `src/components/finstatements/TBImportMapping.tsx`
    - Adopt `useScopedTallySession('fin-statements', tallyPort)`.
  - `src/pages/AuditModule.tsx`
    - Adopt `useScopedTallySession('audit', tallyPort)`.
  - `src/pages/TallyXmlSuite.tsx`
    - Adopt `useScopedTallySession('tally-xml', tallyPort)`.
    - Ensure offline XML download is primary, and direct HTTP push disengages cleanly upon leaving the suite.

---

## Verification & Quality Gates
1. **0 TypeScript Errors:** `npm.cmd run typecheck` or `npx.cmd tsc --noEmit`.
2. **Vitest Suite Green:** All existing tests continue passing without regression.
3. **Clean Vite Production Build:** `npm.cmd run build` finishes with exit code 0.

