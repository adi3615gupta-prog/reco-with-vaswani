# Requirements: Vaswani Return Enterprise

**Defined:** 2026-10-22
**Core Value:** Audit-grade, high-precision reconciliation and statutory tax computation that eliminates double-counting, strictly guarantees zero merged cells in analytical workbooks, and runs completely locally and securely.

## v1 Requirements

### Debit Note Advanced Reconciliation (Ingested from SPEC)

- [x] **DN-01**: Implement 6-pass waterfall reconciliation pipeline for debit/credit notes
  - Pass 1: 1-to-1 exact & normalized invoice match with composite guardrail
  - Pass 2: 1-to-1 exact/near amount match for generic `DN` placeholder vouchers
  - Pass 3: 1-to-many consolidated batch solver (date-cluster & subset-sum solver)
  - Pass 4: 1-to-1 fuzzy value (5% tolerance) & date proximity match
  - Pass 5: Unmatched 2B classification (`In GSTR-2B Only`)
  - Pass 6: Unmatched PR classification (`In Books Only` / `Zero-Value Seed Entry`)
- [x] **DN-02**: Implement 1-to-many consolidated batch solver
  - Exact date-cluster sum matching within ₹25 value and ₹15 tax tolerance
  - Bounded subset-sum solver ($2 \le |S| \le 15$) for split same-day batches
  - Lead row + grouped sub-row formatting with ₹0 PR values on sub-rows
- [x] **DN-03**: Composite invoice number detection guardrail
  - Detect when single PR invoice number covers multiple consecutive 2B notes
  - Defer Pass 1 match to Pass 3 batch solver
- [x] **DN-04**: Robust accounting pre-processing pipeline
  - Parse parenthesized negative numbers `(45,04,490.90)` to negative floats
  - Clean commas, spaces, dashes, and strip regional/FY prefixes
  - Identify generic placeholder voucher tokens (`DN`, `CN`, `DEBITNOTE`)
  - Supplier name phonetic/normalization fallback for missing PR GSTINs
- [x] **DN-05**: Standardized 21-column reconciled register output
  - Full side-by-side PR vs 2B column layout
  - Mathematical zero double-counting accounting invariant validation ($\sum \text{Reconciled} = \sum \text{Raw Input}$)
  - Detailed audit remarks and recommended actions per line item

### Core Platform Standards

- [x] **CORE-01**: Maintain strict Zero-Merge architecture (`ws['!merges'] = []`) across all Excel exports
- [x] **CORE-02**: Ensure all CPU-intensive reconciliation passes run in Web Workers off UI thread
- [x] **CORE-03**: Preserve single-login 12-month autonomous Playwright portal sync capability

## v2 Requirements

### Advanced Refactoring & Performance

- **ARCH-01**: Modularize monolithic `src/lib/fileParser.ts` into isolated export components
- **ARCH-02**: Stream 12-month consolidated Excel generation via `exceljs` to optimize memory usage
- **AUDIT-01**: Persist immutable audit log with timestamp and justification for manual force-matches

### GSTR-2B Autopilot & Consolidated Downloader (Phase 4)

- [x] **G2B-01**: 1-Login 12-Month Autonomous Loop resilience with portal dropdown auto-retry, navbar Access Denied recovery, and non-blocking month failures
- [x] **G2B-02**: Golden Rule data safety: existing GSTR-2B data preserved on failed/aborted downloads, with clean separation between Nil returns and failed syncs
- [x] **G2B-03**: Consolidated 8-Sheet SectionWiseSummary workbook strictly enforces Zero-Merge (`ws['!merges'] = []`) with complete side-by-side Monthly and Party-wise matrices
- [x] **G2B-04**: Automated scrutiny Vitest test suite for GSTR-2B parsers, batch metric aggregations, and zero-merge guarantees

### Enterprise UI/UX Design System & Persistent Shell (Phase 5)

- [x] **UI-01**: Implement Persistent App Shell with collapsible sidebar, active client & FY indicators, and status HUD
- [x] **UI-02**: Modernize centralized Obsidian Glass design tokens in `src/index.css` (high contrast, crisp borders, dark palette)
- [x] **UI-03**: Standardize high-density financial table components with sticky headers and monospace tabular figures
- [x] **UI-04**: Global Quick Command palette (`Ctrl+K`) for instantaneous module navigation without state loss

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cloud-hosted financial database | Violates client privacy and statutory local data security mandates |
| Direct filing to GSTN without review | Statutory tax liability requires qualified practitioner verification before submission |
| Cell merging in analytical spreadsheets | Permanently disables column sorting, AutoFilters, and lookup formulas |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DN-01 | Phase 1 | Complete |
| DN-02 | Phase 1 | Complete |
| DN-03 | Phase 1 | Complete |
| DN-04 | Phase 1 | Complete |
| DN-05 | Phase 1 | Complete |
| CORE-01 | Phase 1 | Complete |
| CORE-02 | Phase 1 | Complete |
| CORE-03 | Phase 1 | Complete |
| ARCH-01 | Phase 2 | Complete |
| ARCH-02 | Phase 2 | Complete |
| AUDIT-01 | Phase 3 | Complete |
| G2B-01 | Phase 4 | Complete |
| G2B-02 | Phase 4 | Complete |
| G2B-03 | Phase 4 | Complete |
| G2B-04 | Phase 4 | Complete |
| UI-01 | Phase 5 | Complete |
| UI-02 | Phase 5 | Complete |
| UI-03 | Phase 5 | Complete |
| UI-04 | Phase 5 | Complete |
| AUTOPILOT-CHROME-01 | Phase 7 | Complete |
| AUTOPILOT-PROD-01 | Phase 8 | Complete |
| UI-STITCH-01 | Phase 9 | Complete |
| UI-STITCH-02 | Phase 9 | Complete |
| UI-STITCH-03 | Phase 9 | Complete |
| UI-STITCH-04 | Phase 9 | Complete |
| UI-STITCH-05 | Phase 9 | Complete |
| NOTICES-01 | Phase 12 | Complete |
| NOTICES-02 | Phase 12 | Complete |
| NOTICES-03 | Phase 12 | Complete |
| NOTICES-04 | Phase 12 | Complete |
| NOTICES-05 | Phase 12 | Complete |

### GST Notices & Orders Autonomous Hub (Phase 12)

- [x] **NOTICES-01**: Multi-Endpoint Portal Autopilot Scraper — autonomous 1-login scraping across `View Notices and Orders`, `View Additional Notices/Orders`, and `Return Compliance` (DRC-01B/C) with attachment downloads.
- [x] **NOTICES-02**: Persistent SQLite Repository (`gst_notices`, `gst_notice_attachments`, `gst_notice_replies`) storing metadata, DIN, limitation dates, and extracted demand amounts.
- [x] **NOTICES-03**: Limitation & Hearing Calendar HUD — automated countdowns alerting 7-day deadlines (DRC-01B/C) and 30-day deadlines (ASMT-10, DRC-01) with urgent risk badges.
- [x] **NOTICES-04**: Deterministic Multi-Return Cross-Reconciler — automated mathematical verification of notice demands against local GSTR-1, 2B, 3B, and PR tables, generating Zero-Merge analytical annexures.
- [x] **NOTICES-05**: Dual-Engine Legal Reply Drafter — structured generator for ASMT-11, DRC-06, and Part B replies incorporating statutory citations (Sections 16, 61, 73, 74, 128A, and CBIC Circular 211/2024).

### Suite 04 Returns Enterprise Fluid Dashboard Layout Overhaul (Phase 9)

- [x] **UI-STITCH-01**: Tab 1 (GSTR-3B Working Sheet) fluid rail layout — animated micro-pill suite tabs, combined period track (Apr-Mar) & live ingestion dock (Fetch 2B, Fetch 1, Sync Tally, Reco Match % pill), Table 3.1 & Table 4 high-density financial tables, and Rule 88A waterfall card.
- [x] **UI-STITCH-02**: Tab 2 (12-Month Matrix) fluid layout — 13-column comparative annual matrix grid with compact vs detailed view toggles and monthly tax breakdown columns.
- [x] **UI-STITCH-03**: Tab 3 (GST IMS Manager) fluid layout — 300+ client selector with session timer countdown, 4-metric compact KPI bar (Total Invoices, Accepted, Rejected, Pending), batch action toolbar, and ledger table.
- [x] **UI-STITCH-04**: Tab 4 (GSTR-2B Autopilot) fluid layout — client telemetry header, Golden Rule mini pill, side-by-side autonomous loop & CAPTCHA resolver card, live progress bar, and 12-month sync status matrix.
- [x] **UI-STITCH-05**: Tab 5 (GSTR-1 Autopilot) fluid layout — turnover telemetry header, 12-month batch velocity progress bar, Outward Tables Coverage Deck (Table 4, 5, 7, 9, 12, 13 chips), and multi-period outward sync grid.

### Browser Autopilot & Production Hardening (Phase 8)

- [x] **AUTOPILOT-PROD-01**: Shield Playwright browser evaluations (`page.evaluate`, `page.waitForFunction`) from obfuscation variable mangling and auto-seed master clients database (`network_data.db`) in packaged Electron environments.

### Browser Autopilot & Client Automation (Phase 7)

- [x] **AUTOPILOT-CHROME-01**: Prioritize Google Chrome over Microsoft Edge in Playwright browser launch cascades across all portal automation tasks (GSTR-2B, GSTR-1, IMS, GSTIN Lookup).

**Coverage:**
- v1 requirements: 8 total
- Phase 12 requirements: 5 total (NOTICES-01 to NOTICES-05)
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-22*
*Last updated: 2026-10-24 after Phase 12 GST Notices registration*

### Financial Statements Engine (Phase 18)

- [ ] **FIN-01**: Comprehensive 4-digit numeric group taxonomy (1001 to 4902) mapping Schedule III Division I/II (1000s Equity/Liabilities, 2000s Assets, 3000s Revenue, 4000s Expenses) with automated Tally/Excel ingestion and grouping confidence scoring.
- [ ] **FIN-02**: Core financial statements generation: Schedule III Balance Sheet, Statement of Profit & Loss, and AS-3 / Ind AS 7 Indirect Method Cash Flow Statement with dynamic working capital and net tax paid derivation.
- [ ] **FIN-03**: MCA Notification 2021/2022 Regulatory Disclosures (`R_Disc`) featuring 11 statutory financial ratios with >25% variance triggers, CWIP aging, Intangibles under development aging, MSME Trade Payables aging, and Trade Receivables aging.
- [ ] **FIN-04**: Non-Corporate Entity Financial Engine as per ICAI June 2022 Technical Guide featuring automated Level I–IV eligibility matrix, AS-1 to AS-29 applicability with disclosure exemptions, Multi-Partner Capital Account schedule, and Horizontal (T-format) presentation.
- [ ] **FIN-05**: 35+ Rule Preventive Internal Financial Control (IFC) Check Dashboard (`Checks`), Corporate Tax/MAT computation (Sec 115BAA/25%), and Zero-Merge Excel export suite.


### GSTR-3B Inward ITC Manual Allocation & Audit Workbench (Phase 19)

- [x] **ITC-ALLOC-01**: Persistent SQLite Allocation Repository (gstr3b_itc_allocations) storing client GSTIN, return period, invoice ID, supplier details, amounts, target 3B field (4A5, 4A3, 4A1, 4B1, 4B2, 4D1, 4D2, DEFERRED), user remarks, and timestamps.
- [x] **ITC-ALLOC-02**: Backend APIs for querying allocated bills by month, bulk updating target 3B tables, and fetching real-time aggregated Table 4 field totals.
- [x] **ITC-ALLOC-03**: In-Place 2B Allocation & Audit Workbench UI Component (Gstr3bItcAllocationWorkbench.tsx) with search, filter tabs, multi-select checkboxes, individual row selectors, and bulk classification actions.
- [x] **ITC-ALLOC-04**: Interactive Drill-Down Hyperlink on Table 4 "ITC as per GSTR 2B" in ReturnsDashboard.tsx enabling seamless toggle between 3B computation table and 2B invoice allocation register with sticky header navigation.
- [x] **ITC-ALLOC-05**: Dynamic GSTR-3B Table 4 Recalculation (updating 4(A)(5), 4(A)(3), 4(B), 4(D) and Rule 88A settlement) alongside Zero-Merge (ws['!merges'] = []) Statutory Excel Export.

### Direct Client Directory Auto-Save Architecture (Phase 20)

- [x] **AUTOSAVE-01**: Decouple browser downloads from manual save (`handleManualSave` & `Ctrl+S`), eliminating synthetic anchor tag clicks (`excelA.click()`, `jsonA.click()`) and PDF `autoDownload: true` so the browser never prompts "where to save".
- [x] **AUTOSAVE-02**: Direct filesystem bundle persistence writing to `<dataPath>/<client>/<fy>/<month>/3B Working/` with structured subfolders:
  - `3B Working/` (3B Working Excel, PDF, JSON, and data state)
  - `R1 Base/` (GSTR-1 outward sales base schedule Excel & JSON)
  - `2B Base/` (GSTR-2B inward supplies base schedule Excel & JSON)
  - `Credit Notes Base/` (CDNR outward & inward credit/debit notes base schedule Excel & JSON)
  - `Reversal Base/` (Table 4B reversals, Rule 37/38/42/43, Sec 17(5) blocked, Sec 16(4) ineligible schedule Excel & JSON)
- [x] **AUTOSAVE-03**: Non-intrusive interactive toast feedback displaying clean saved folder destination with an instant 1-click "Open Folder" action launching the native OS file explorer directly to the directory.
- [x] **AUTOSAVE-04**: Dedicated explicit download buttons ("Download GSTR-3B Working Excel", "Print Official PDF", "Generate GSTN Portal JSON") preserved for explicit user-requested browser downloads.

### GST Client Credentials Vault & Master Directory Multi-PC LAN Synchronization (Phase 21)

- [x] **VAULT-SYNC-01**: Centralized Network Storage Vault (`central_clients_vault.json` in `<dataPath>` and SQLite `clients` table) with bidirectional synchronization across all PCs on the office LAN.
- [x] **VAULT-SYNC-02**: Automatic Two-Way Synchronization on App Launch, Hub Fetch, and Vault Modal Open — if another PC adds, edits, or imports client credentials, all connected PCs reflect the change seamlessly without manual refresh or re-entry.
- [x] **VAULT-SYNC-03**: Single & Bulk Credentials Update Sync (`/api/ims/credentials/update` & `/api/ims/credentials/bulk-import`) ensuring edits or Excel imports on any workstation immediately broadcast and update both local SQLite DB and central shared network storage with `last_modified` timestamp conflict resolution.
- [x] **VAULT-SYNC-04**: Client Deletion & Archival Sync across LAN — when a client is removed or updated from one workstation, the deletion/update is mirrored to central vault so orphaned records do not reappear on other PCs.
- [x] **VAULT-SYNC-05**: Universal Portal Autopilot & Login Auto-Fill Integration across all 5 autonomous suites (GSTR-1, GSTR-2B, GST IMS, GST Notices, and Returns Tracking) consuming synced credentials on every workstation.

### Sourav — Universal Gemini AI Assistant (Phase 22)

- [x] **AI-AGENT-01**: Google Gemini API backend integration — `POST /api/gemini/chat` endpoint that accepts `{ message, context, history }`, calls `@google/generative-ai` with `gemini-2.0-flash` model, and returns `{ reply }`. API key stored in SQLite `app_config` table (never exposed to frontend).
- [x] **AI-AGENT-02**: Sourav system prompt with GST domain anchoring — persona as "Sourav, AI assistant for AUDIT WITH VASWANI", full GST Act knowledge, all 12 software module descriptions, and dynamic context injection (client name, GSTIN, FY, active module) per request.
- [ ] **AI-AGENT-03**: Sourav floating chat UI — amber/gold FAB at bottom-right (`position: fixed`), click to toggle slide-in chat panel (384px wide, 520px tall), Obsidian dark theme, message bubbles (user = amber right; Sourav = slate left), typing indicator, auto-scroll, Enter-to-send, welcome message on first open.
- [ ] **AI-AGENT-04**: Context awareness — active client name, GSTIN, FY, and current module automatically passed as context with every message. Displayed as info chips in chat panel header.
- [ ] **AI-AGENT-05**: Settings → AI Assistant tab — Gemini API key input (password field with show/hide), save & test connection buttons, "Active/Not Configured" status badge, deep-link to Google AI Studio for key generation.
