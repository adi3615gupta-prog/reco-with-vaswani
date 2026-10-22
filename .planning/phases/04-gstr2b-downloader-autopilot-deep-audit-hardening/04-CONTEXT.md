# Phase 4: GSTR-2B Downloader (Autopilot) Deep Audit & Hardening - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers production-grade hardening, zero-data-loss protection, 12-month autonomous loop resilience, 8-sheet consolidated Zero-Merge Excel generation, and comprehensive scrutiny tests for **Tab 4: GSTR-2B Downloader (Autopilot)**. It guarantees that existing GSTR-2B client data is never overwritten or purged on failed/timed-out downloads, enables non-blocking month recovery in 12M loops, and validates all parsing and metric aggregation logic with automated Vitest suites.
</domain>

<decisions>
## Implementation Decisions

### 1. 12-Month Autonomous Loop Resilience
- **D-01 (Non-Blocking Month Progression):** If any individual month in the 12-month loop encounters a portal delay or download failure, the autopilot MUST log a warning for that month, preserve any existing data in SQLite, and seamlessly continue downloading the remaining months (e.g. reporting "11/12 Synced"). The loop must NEVER abort midway due to a single-month glitch. — **Reversibility:** costly — affects Playwright loop state machine and batch summary metrics.
- **D-02 (Portal Dropdown & Access Denied Recovery):** Retain rapid auto-recovery from portal "Access Denied" or `/error/` pages via the Dashboard navbar link, and increase dropdown selector stability with explicit Angular event triggers.

### 2. Zero-Data-Loss & Nil Return Distinction
- **D-03 (Golden Rule Enforcement):** Under no circumstance should existing GSTR-2B invoices or batches be deleted if a download attempt fails, times out, or portal crashes ("New data download nahi toh purana data remove nahi hoga").
- **D-04 (Nil Return Explicit Verification):** The system must distinguish between a genuine Nil month and a failed download:
  - If the portal returns search results with confirmed 0 records (e.g. "No records available" or 0 invoices), record batch status as `NIL_SYNCED` with `total_invoices = 0`.
  - If the download times out without confirmation or file parsing fails, do NOT mark as Nil; keep existing records intact and set status to `PENDING` / `FAILED`.

### 3. Consolidated 8-Sheet SectionWiseSummary Excel
- **D-05 (Strict Zero-Merge Compliance):** Enforce `ws['!merges'] = []` across all 8 sheets (`B2B`, `CDNR`, `ECO`, `ISD`, `IMPG`, `IMPGSEZ`, `B2B(Rejected)`, `CDNR(Rejected)`). No cell merging is permitted.
- **D-06 (Side-by-Side Summary Matrices):** Maintain side-by-side Monthly summary matrix (Cols AA-AW) and Party-wise summary matrix (Cols AZ-BV) in both B2B and CDNR sheets for instant CA audit comparison.

### 4. Automated Vitest Scrutiny Suite
- **D-07 (Dedicated Test Coverage):** Create `src/test/gstr2bScrutiny.test.ts` to test:
  - Excel, JSON, and ZIP helper parsing.
  - Correct tax field mapping (taxable, IGST, CGST, SGST, Cess, Reverse Charge).
  - Batch metric recalculation (`recalculate2bBatchMetrics`) for RCM, CDNR, IMPG, ISD, and ineligible ITC.
  - Zero-merge integrity of generated workbooks (`generateGstr2bFullYearWorkbook`).
  - Database non-destructive upsert logic.

### 5. Official BACK Button Direct Navigation (Zero `<a>` Tags)
- **D-08 (Target Official `<button>` Exclusively):** On the GSTR-2B download screen, the official navigation element is a `<button>` or `<input type="button">` with exact text `'BACK'`. Anchor `<a>` tags (such as breadcrumb links or 'Back to Returns' hyperlinks) are strictly excluded because they divert the browser to `quicklinks/returns`.
- **D-09 (Direct Transition to Returns Search Dashboard):** Clicking the official `<button>` transitions the portal Angular scope directly to the Returns Search Dashboard (`return.gst.gov.in/returns/auth/dashboard`) with the `<select>` dropdowns ready for the next period, completely bypassing `quicklinks/returns`.
- **D-10 (Emergency Quick Links Fallback & Zero URL Push):** If an unexpected portal glitch causes the browser to land on `quicklinks/returns`, autopilot recovers via authentic in-page tile / navbar click with strictly zero URL push to prevent "Access Denied".

### Antigravity Builder's Discretion
- Fine-tuning timeout thresholds for portal download links (15s to 20s polling).
- Frontend badge color coding (`NIL_SYNCED` as neutral gray/blue badge vs `SYNCED` as emerald badge).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core Engine & Playwright Automation
- `gstr2b/autopilot.js` — Single-month & 12-month autonomous Playwright loop for GSTR-2B.
- `gstr2b/db.js` — Database schema (`gstr2b_batches`, `gstr2b_invoices`), batch metric recalculations, and bulk invoice upserts.
- `gstr2b/parsers.js` — Parsers for Excel, JSON, and ZIP downloads.
- `gstr2b_routes.js` — Express routes for sync, summaries, and full-year exports.

### Excel Export & Architectural Rules
- `gstr2b/fullYearExcel.js` — 8-sheet consolidated 12-month GSTR-2B Excel workbook generator.
- `src/lib/gstr2bFullYearExport.ts` — Frontend counterpart for 12-month consolidated export.
- `.agents/AGENTS.md` — Architectural rules (Module 4: GST IMS & 2B Autopilot).
</canonical_refs>
