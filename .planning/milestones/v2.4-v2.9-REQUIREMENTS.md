# Requirements: Vaswani Return Enterprise (v2.4 – v2.9)

**Milestones covered:** v2.4 (Phases 33–35) through v2.9 (Phases 40–41). All shipped.  
**Defined:** 2026-11-04 · **Last updated:** 2026-11-17 (v2.9 closed)  
**Core Value:** Audit-grade, high-precision reconciliation, statutory tax computation, and native Excel-to-Tally XML automation that eliminates manual voucher punching, strictly guarantees zero external telemetry, and runs completely locally and securely.

---

## Suite 09 Requirements (TXML)

### Tally XML Generation & Pre-Import Validator (Phase 33)

- [x] **TXML-01**: **Dual Entry Vouchers XML Generator**
  - Generates `<ENVELOPE><HEADER><TALLYREQUEST>Import Data...` compliant XML.
  - Generates `<ALLLEDGERENTRIES.LIST>` for Debit and Credit legs with proper `<ISDEEMEDPOSITIVE>`:
    - Receipt, Purchase, Contra, Credit Note: Credit leg has `<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>`, Debit leg has `<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>` and negative amount.
    - Payment, Sales, Debit Note, Journal: Debit leg has `<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>` and negative amount, Credit leg has `<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>`.
  - Date normalization to `YYYYMMDD` with reference date check (`refDate <= voucherDate`).
  - Strict XML character entity escaping for `&`, `<`, `>`, `"`, and `'`.

- [x] **TXML-02**: **Multi Entry Vouchers XML Generator with Zero-Balance Scrutiny**
  - Supports up to 150 ledger legs per voucher.
  - Enforces algebraic debit-credit balance: Debits as negative (`-`), Credits as positive (`+`).
  - Calculates live `checkTotal` per row: flags any row where $\sum \text{Ledger Amounts} \neq 0.00$.
  - 1-Click `autoBalance(row, targetLedger)` algorithm to allocate rounding or residual discrepancies to a selected round-off ledger.

- [x] **TXML-03**: **Quick Entry Columnar Vouchers XML Generator**
  - Supports columnar templates where fixed ledger names are declared once in the header row (e.g. `Party`, `Purchase 18%`, `Input CGST 9%`, `Input SGST 9%`, `Round Off`).
  - Dynamically builds multi-line XML vouchers from row-wise columnar amounts.

- [x] **TXML-04**: **Masters Ledgers XML Generator**
  - Generates `<LEDGER>` XML with `NAME`, `PARENT` group, `OPENINGBALANCE`, `ADDRESS`, `COUNTRYNAME`, `STATENAME`, `PINCODE`, `PARTYGSTIN`, and `GSTREGISTRATIONTYPE`.
  - Validates parent groups against Tally standard master groups.

- [x] **TXML-05**: **Automated Ledger Extraction (`fetchLedgersFromVouchers`)**
  - Scans across all voucher tables (Dual, Multi, Quick), extracts all unique ledger names.
  - Automatically populates the `Masters-Ledgers` table with duplicate deduplication.
  - Preserves existing user configurations when appending newly discovered ledgers.

- [x] **TXML-06**: **Pre-Import Impact Analyzer**
  - Computes pre-import financial audit metrics: Transaction count, Total Debit amount, Total Credit amount, and Net Balance impact per ledger before XML generation or Tally push.
  - Guarantees $\sum \text{Net Impact} = 0$ for complete double-entry sets.

---

### Suite 09 Frontend Studio, Copy-Paste Grids & Action Controls (Phase 34)

- [x] **TXML-07**: **High-Density Clipboard Data Grid with Excel/CSV Paste Support**
  - High-performance data grid supporting standard Excel clipboard paste (`Ctrl+V`) for tab-separated data.
  - Real-time cell-level error validation with soft-red highlighting (`RGB(255, 208, 219)`) for invalid dates, missing ledgers, non-numeric values, or unbalanced rows.
  - Tab navigation across `Dual Entry`, `Multi Entry`, `Quick Entry`, `Masters (Ledgers)`, and `Impact Report`.
  - Keyboard shortcuts matching accounting muscle memory (`Ctrl+Shift+V` Validate, `Ctrl+Shift+G` Generate XML, `Ctrl+Shift+T` Fetch Ledgers, `Ctrl+Shift+I` Impact Report).

- [x] **TXML-08**: **Dual Export: Offline XML Download & Direct Tally Port 9000 HTTP Push**
  - 1-Click download of `Vouchers.xml` and `Masters.xml` for offline file import.
  - 1-Click direct HTTP POST to TallyPrime port 9000 (via local proxy or native bridge) with live connection status ping ("Tally Connected" vs "Tally Offline").
  - Live display of Tally import response / error log.

---

### Enterprise App Shell Integration & Automated Scrutiny Tests (Phase 35)

- [x] **TXML-09**: **Hub Navigation, Persistent Shell & Code Splitting**
  - Official **SUITE 09: Excel to Tally XML Enterprise Suite** card added to `src/pages/Hub.tsx`.
  - Lazy-loaded route `/tally-xml` registered in `src/App.tsx` with styled Suspense skeleton.
  - Global Command Palette (`Ctrl+K`) integration.

- [x] **TXML-10**: **Automated Scrutiny Vitest Test Suite**
  - 100% green Vitest test suite (`src/lib/__tests__/tallyXmlEngine.test.ts`) covering all XML generation formats, amount polarity rules, XML escaping, auto-balance logic, and impact calculations.

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cloud telemetry or hardware tracking | EasyTally.xlsm's hardware profiling is removed; client accounting data remains strictly local. |
| VBA macro execution | The engine is rewritten purely in TypeScript for web & desktop performance without Excel dependencies. |
| Automatic Tally company creation | Tally company must be created and open in TallyPrime before importing transactions. |

---

## Traceability Matrix

| Requirement | Phase | Status |
|-------------|-------|--------|
| TXML-01 | Phase 33 | Complete |
| TXML-02 | Phase 33 | Complete |
| TXML-03 | Phase 33 | Complete |
| TXML-04 | Phase 33 | Complete |
| TXML-05 | Phase 33 | Complete |
| TXML-06 | Phase 33 | Complete |
| TXML-07 | Phase 34 | Complete |
| TXML-08 | Phase 34 | Complete |
| TXML-09 | Phase 35 | Complete |
| TXML-10 | Phase 35 | Complete |

---

## Milestone v2.5 Requirements — Suite 04: GSTR-2B Inward ITC Autopilot Bulletproof Hardening (Phase 36)

### Cockpit UI & State Consistency (`G2B-BP-01` .. `G2B-BP-03`)

- [x] **G2B-BP-01**: **Unified View Mode & `12M` Loop Trigger Fix**
  - Normalize `viewMode` state cleanly (`'MONTH' | 'FULL_YEAR'`) across segmented controls and API queries (`/api/gstr2b/summary` vs `/api/gstr2b/fy-summary` and `isFullYear: true`).
  - Fix `Inspect Invoices` footer button to invoke `handleOpenClientDetails(activeCockpitClient)` so SQLite invoices populate the modal.
- [x] **G2B-BP-02**: **Real Per-Month Timeline Metrics & `Re-Run Failed Months` Filter**
  - Replace hardcoded `totalInvoices / 7` approximation and demo fallback clutter with real per-month status, invoice counts, and eligible ITC returned by `/api/gstr2b/fy-summary`.
  - Send `onlyPeriods` / `skipSynced` when clicking `Re-Run Failed Months` so already `SYNCED` and `NIL_SYNCED` months are skipped.
- [x] **G2B-BP-03**: **Honest Live Autopilot Console Card (Replacing Static `849275` Placeholder)**
  - Replace static `849275` / `OCT 24 CHALLENGE` box with a real-time **Live Autopilot Console** showing credential auto-fill state, human CAPTCHA prompt in Chrome, current month loop progress, live SSE event feed, `"Bring Browser to Front"`, and session-expired resume guidance.

### Async Job Architecture & Playwright Portal Hardening (`G2B-BP-04` .. `G2B-BP-07`)

- [x] **G2B-BP-04**: **Non-Blocking Async Job Orchestration & SSE Step Streaming**
  - Introduce in-memory/SQLite-backed Autopilot Job Manager (`POST /api/gstr2b/portal-sync-browser` or `/api/gstr2b/jobs/start`, `GET /api/gstr2b/job-stream/:jobId`, `GET /api/gstr2b/job/:jobId`) so long 12-month loops never fail on HTTP client/proxy timeouts and survive UI navigation.
- [x] **G2B-BP-05**: **JSON-First Priority, Live API Interception & 45s Generation Retry**
  - Prioritize GSTR-2B JSON download & live network API interception (`page.on('response')`) with Excel/ZIP fallback.
  - Poll portal `"GENERATE EXCEL"` / `"GENERATE JSON"` async compilation up to 45–60s with auto-refresh before falling back cleanly to `PENDING`.
- [x] **G2B-BP-06**: **Isolated Per-Session/Period Downloads & GSTIN/Period Validation**
  - Save Playwright downloads into `scratch/downloads/gstr2b/${gstin}/${jobId}/${periodSlug}` exclusively (`download.saveAs`) with strict parsed GSTIN + `rtnprd` verification so prior months or external user `Downloads` files can never contaminate another period/client.
- [x] **G2B-BP-07**: **Explicit Login Error / Session Expiry Detection & Batch Abort Propagation**
  - Detect GST portal login errors (`Invalid Captcha`, `Invalid Username or Password`, `Account Locked`) and mid-loop `Session Expired` modals immediately.
  - Propagate `batchAbortRef.current.signal` in `runBatchQueue` and enforce strict `buildStrictPeriodFilter` inside `POST /api/gstr2b/cancel`.

### Database Normalization, Checksum & Verification (`G2B-BP-08` .. `G2B-BP-10`)

- [x] **G2B-BP-08**: **Canonical `"Month YYYY"` Period Normalization Across DB & Parsers**
  - Normalize all `return_period` values (`"042025"`, `"April, 2025"`, `"Apr 2025"`) to canonical `"Month YYYY"` before SQLite writes in `gstr2b/db.js`, `gstr2b/parsers.js`, and `gstr2b_routes.js`.
- [x] **G2B-BP-09**: **Portal Dashboard Summary vs Parsed File Audit Checksum**
  - Cross-check parsed invoice counts/ITC totals against GST portal card summary metrics when available and flag `PARTIAL_VERIFY` instead of silently trusting truncated downloads, preserving Golden Rule zero-data-loss protection.
- [x] **G2B-BP-10**: **Automated Nyquist Vitest Scrutiny Suite**
  - Add thorough automated unit & integration tests covering canonical period normalization, `skipSynced` month filtering, strict cancel period isolation, job status state machine, checksum verification, and `Gstr2bMasterDownloader` view/retry state wiring.

| Requirement | Phase | Status |
|-------------|-------|--------|
| G2B-BP-01..10 | Phase 36 | Complete |

---

## Milestones v2.6 – v2.9 (Phases 37–41)

These phases were planned directly from the roadmap without formal requirement IDs. Each is recorded here as one requirement so traceability is complete. Details are in [ROADMAP.md](ROADMAP.md) and the phase plan folders.

- [x] **HARD-37**: Resolve all 110 `EVAL-REVIEW.md` audit findings: JWT auth, encrypted credentials vault, engine accuracy, statutory engines, autopilot stability, frontend runtime and TypeScript zero-error gate (v2.6).
- [x] **LAND-38**: Presentation-ready landing page. Remove bloat, add the `landingModules.ts` Module Presenter and the WIP / upcoming section (v2.7).
- [x] **NOTICE-39**: GST & VAT Notices & Orders suite. Case schema v2, 64-form classifier, statutory calculators, Zero-Merge defense workbook, reply templates and import UI (v2.8).
- [x] **DECOUPLE-40**: Inter-module decoupling. Remove GSTR-1/2B → 3B push, standalone Consolidation Hub / Tally import / GSTIN scan, and `useScopedTallySession` per-module Port 9000 isolation (v2.9).
- [x] **TALLY-2B-41**: GSTR-2B Direct Entry tab in Suite 09. B2B → Purchase and CDNR → Debit Note vouchers, `tally_2b_posted_entries` duplicate prevention, Port 9000 push / XML download / studio load (v2.9).

| Requirement | Phase | Status |
|-------------|-------|--------|
| HARD-37 | Phase 37 | Complete |
| LAND-38 | Phase 38 | Complete |
| NOTICE-39 | Phase 39 | Complete |
| DECOUPLE-40 | Phase 40 | Complete |
| TALLY-2B-41 | Phase 41 | Complete |
