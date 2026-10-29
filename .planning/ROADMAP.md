# Roadmap: Vaswani Return Enterprise

## Overview

Vaswani Return Enterprise is evolving its reconciliation and compliance suite. Having established core modules for GST Inward reconciliation, 12-Month Autopilot, GSTR-3B working sheets, and Tally integration, the current milestone focuses on integrating the advanced 6-pass debit note reconciliation engine, consolidated 1-to-many batch solver, and 21-column schema from the newly ingested technical specification.

## Phases

- [x] **Phase 1: Debit Note Advanced Waterfall & Batch Solver Integration** - Implement the 6-pass waterfall, 1-to-many subset-sum solver, composite guardrail, and 21-column schema. (completed 2026-10-22)
- [x] **Phase 2: Spreadsheet Export Modularity & Memory Optimization** - Modularize `fileParser.ts` and optimize 12-month consolidated Excel generation. (completed 2026-10-22)
- [x] **Phase 3: Automated Scrutiny Tests & Audit Trail Hardening** - Add end-to-end unit tests for batch solvers and implement immutable force-match audit logging. (completed 2026-10-22)
- [x] **Phase 4: GSTR-2B Downloader (Autopilot) Deep Audit & Hardening** - Harden 1-login 12-month autonomous loop, zero data loss protection, 8-sheet consolidated Zero-Merge Excel generation, and comprehensive scrutiny tests. (completed 2026-10-22)
- [x] **Phase 5: Enterprise UI/UX Aesthetic Overhaul & Unified Persistent App Shell** - Implement a persistent collapsible sidebar navigation, top command bar with status HUD & module switcher, centralized obsidian theme tokens, and high-density financial table standards across all modules. (completed 2026-10-22)
- [x] **Phase 6: Core Compliance Modules UI/UX Overhaul & Financial Cockpit Elevation** - Modernize high-traffic modules (Returns Dashboard, Party-Wise Dispute Hub, Tally Direct Bridge, TDS, Income Tax Sandbox, Dropzone & KPI Cockpit) with Obsidian Glass styling, interactive charts, and high-density tables. (completed 2026-10-22)
- [x] **Phase 7: Browser Autopilot Chrome-First Architecture & Windows Client Hardening** - Prioritize Google Chrome over Microsoft Edge in Playwright automation cascades across GSTR-2B, GSTR-1, IMS, and GSTIN Search modules. (completed 2026-10-23)
- [x] **Phase 8: Autopilot Runtime Execution & Production Database Hardening** - Shield browser evaluation code from obfuscator scrambling and auto-seed master clients database in packaged Windows builds. (completed 2026-10-23)
- [x] **Phase 9: Suite 04 Returns Enterprise Fluid Dashboard Layout Overhaul** - Elevate and restructure Returns Preparation & Filing across all 5 tabs per the Stitch enterprise design package (`stitch_vaswani_audit_enterprise_dashboard`). (completed 2026-10-24)
- [x] **Phase 10: Enterprise Modernized Shell & Complete Returns Dashboard 1:1 Stitch Alignment** - Implement the smart collapsible left sidebar rail, standardized top header with Port 9000 & FY switcher, and rebuild all 5 Returns Dashboard tabs to 1:1 match Stitch templates. (completed 2026-10-24)
- [x] **Phase 11: Suite 04 Returns Complete Restructuring & Alignment with Newly Downloaded Stitch Assets** - Implement the refined layouts from the new Stitch assets directory (`GST RETURN MODULE UI ASSETS/...`): (1) Tab 1 Formal GSTR-3B Computation Sheet with 28-line table, GSTR-1 & 2B ingest cards, and Rule 88A set-off cascade; (2) Tab 2 FY360 Executive Cockpit with Electronic Credit Ledger horizontal header banner; (3) Tab 3 Nexus IMS Decision Hub with circular timer; (4) Tab 4 Inward ITC Autopilot Cockpit with speed telemetry and interactive captcha resolver; (5) Tab 5 Outward Autopilot Sales Console with horizontal hero and split 12M grid + captcha card; (6) Brand Favicons & PWA Icons. (completed 2026-10-24)
- [x] **Phase 12: GST Notices & Orders Autonomous Suite (Autopilot Downloader, Tracker & AI Reply Drafter)** - Autonomous multi-endpoint scraping across standard notices, additional scrutiny notices (ASMT-10, DRC-01), and Return Compliance (DRC-01B/C), with local SQLite tracking, deterministic multi-return cross-reconciliation, and dual-engine statutory legal reply generation.
- [x] **Phase 15: Returns Tracking Submodule (Tab 06) Integration** - Add 6th submodule `06. Returns Tracking` to Returns & Filing Suite with 12-month statutory filing status matrix (GSTR-1, GSTR-3B, GSTR-2B, GSTR-9), ARN/filing date tracking, deadline alerts, and Zero-Merge compliance export. (completed 2026-10-25)
- [x] **Phase 16: Returns Tracking 2-Step Architecture: Distinct Client Directory Gateway (Page 1) & Scoped 12-Month Compliance Matrix (Page 2)** - 2-step workflow with single-row client entity directory on Page 1, live search, multi-client checkboxes, and scoped 12-month return filing details on Page 2 with header back-switcher. (completed 2026-10-25)
- [x] **Phase 17: NOTICE-SHIELD AI (Automated GST Notice Intelligence, Zero-Trust PII Sanitization & Courtroom-Grade Legal Defense Engine)** (completed 2026-10-26)
- [x] **Phase 18: Suite 01 Work In Progress & Practice Hub - Module 1.6 Financial Statements Engine (Schedule III Corporate & Non-Corporate ICAI 2022 Suite)** (completed 2026-10-27)
- [x] **Phase 19: GSTR-3B Inward ITC Manual Allocation & Voucher-Level Audit Workbench (2B Drill-Down, Field Selection & Statutory Track Record)** - In-place 2B drill-down on Table 4 Inward ITC, bill-by-bill classification into statutory 3B fields (Eligible 4(A)(5), RCM 4(A)(3), Import 4(A)(1), Reversals 4(B), Ineligible Sec 17(5) 4(D)(1), Ineligible Sec 16(4)/POS 4(D)(2), Defer), real-time 3B recalculation, persistent SQLite audit allocations, and Zero-Merge Excel export. (completed 2026-10-28)
- [x] **Phase 20: Direct Client Directory Auto-Save Architecture (Zero-Download Prompt Workflow)** - Automatically save GSTR-3B Working Excel, PDF, JSON portal payload, and all supporting base schedules (R1 Base, 2B Base, Credit Notes Base, Reversal Base) directly into structured subfolders under the client's month directory (`gst_returns_data/<Client>/<FY>/<Month>/3B Working/`) upon clicking "Save Working Sheet" (and Ctrl+S) without triggering browser file picker/save prompts, while preserving explicit Download buttons. (completed 2026-10-28)
- [x] **Phase 21: GST Client Credentials Vault & Master Directory Multi-PC LAN Synchronization Engine** (completed 2026-10-29)
- [x] **Phase 22: Sourav — Universal Gemini AI Assistant & In-App Chatbot** - Integrated Google Gemini 2.0 Flash API copilot named "Sourav" with floating amber FAB, slide-in drawer panel, 1-click deep-link action pills, adaptive Hinglish/English statutory answers, SQLite app_config key storage, and Settings AI tab. (completed 2026-10-29)
- [x] **Phase 23: Central Office-Wise Gemini Cloud Distribution & Firebase License Sync** - Distribute Gemini API key centrally via Firebase Firestore (reco-vaswani-license) so all workstations in an office activate Sourav AI automatically without manual key entry. (completed 2026-10-29)

## Phase Details

### Phase 1: Debit Note Advanced Waterfall & Batch Solver Integration

**Goal**: Integrate the 6-pass debit note waterfall reconciliation engine, 1-to-many subset-sum batch solver, and 21-column schema into the existing application.
**Depends on**: Nothing (first phase)
**Requirements**: DN-01, DN-02, DN-03, DN-04, DN-05, CORE-01, CORE-02, CORE-03
**Success Criteria** (what must be TRUE):
  1. Generic "DN" and placeholder vouchers are accurately paired with 2B notes using value/tax/date matching.
  2. Single lump-sum PR debit notes matching 2 to 15 GSTR-2B credit notes are resolved via the subset-sum batch solver.
  3. The accounting invariant $\sum \text{Reconciled Rows} = \sum \text{Raw Input Rows}$ holds across all numeric columns without double-counting.
  4. Composite invoice numbers (where 1 PR invoice number represents 2 consecutive 2B notes) are guarded and routed to the batch solver.
  5. Exported 21-column reconciled register enforces zero merged cells (`ws['!merges'] = []`).

**Plans**: 3/3 plans complete

Plans:
- [x] 01-01: Pre-processing pipeline, numeric parentheses parser, FY prefix stripper, and missing GSTIN supplier fallback
- [x] 01-02: 6-pass waterfall matching engine with composite guardrails and subset-sum 1-to-many solver
- [x] 01-03: 21-column UI table view, Zero-Merge Excel export, and invariant audit checks

### Phase 2: Spreadsheet Export Modularity & Memory Optimization

**Goal**: Refactor the monolithic `fileParser.ts` into maintainable sub-modules and streamline large 12-month consolidated workbook generation.
**Depends on**: Phase 1
**Requirements**: ARCH-01, ARCH-02
**Success Criteria** (what must be TRUE):
  1. `fileParser.ts` is divided into clean modular sub-packages under `src/lib/excel/`.
  2. 12-month 50,000+ row exports stream without exceeding browser memory limits.

**Plans**: 2/2 plans executed

Plans:
- [x] 02-01: Modularize `fileParser.ts` into isolated sheet builders
- [x] 02-02: Stream large dataset workbooks and benchmark memory footprint

### Phase 3: Automated Scrutiny Tests & Audit Trail Hardening

**Goal**: Build rigorous Vitest test suites for debit note edge cases and add persistent audit logging for manual force-matches.
**Depends on**: Phase 1
**Requirements**: AUDIT-01
**Success Criteria** (what must be TRUE):
  1. 100% test pass rate across all subset-sum batch combinations, tolerance thresholds, and prefix cleaning.
  2. Manual match and force-match actions persist practitioner timestamp and justification.

**Plans**: 2/2 plans complete

Plans:
- [x] 03-01: Comprehensive Vitest test suite for 6-pass debit note engine and batch solver
- [x] 03-02: Immutable audit trail logging for user override actions

### Phase 4: GSTR-2B Downloader (Autopilot) Deep Audit & Hardening

**Goal**: Deep audit and harden Tab 4 GSTR-2B Autopilot for production reliability: 12-month autonomous loop resilience, zero-data-loss protection, 8-sheet consolidated Zero-Merge Excel generation, and comprehensive scrutiny test coverage.
**Depends on**: Phase 1, Phase 2, Phase 3
**Requirements**: G2B-01, G2B-02, G2B-03, G2B-04, CORE-01, CORE-03
**Success Criteria** (what must be TRUE):
  1. 1-Login 12-Month Autopilot navigates all 12 periods gracefully, auto-recovering from portal dropdown timeouts and "Access Denied" screens without aborting the session.
  2. Golden Rule strictly enforced: existing GSTR-2B records are never deleted if a download attempt fails or encounters portal errors ("New data download nahi toh purana data remove nahi hoga").
  3. Consolidated 8-sheet 12-Month SectionWiseSummary Excel strictly enforces Zero-Merge architecture (`ws['!merges'] = []`) and provides side-by-side monthly & party-wise matrices.
  4. Comprehensive Vitest automated scrutiny tests validate GSTR-2B Excel/JSON parsing, batch metrics calculation, and zero-merge guarantees.

**Plans**: 2/2 plans complete

Plans:
- [x] 04-01: Autopilot 12M loop resilience, error recovery, and zero-data-loss protection
- [x] 04-02: Consolidated 8-sheet Zero-Merge Excel validation, UI sync hardening, and automated scrutiny tests

### Phase 5: Enterprise UI/UX Aesthetic Overhaul & Unified Persistent App Shell

**Goal**: Deliver a cohesive, premium, high-density financial workstation experience across all modules with a persistent collapsible sidebar, top command bar (active client, FY, status HUD, quick search), centralized obsidian glass styling, and high-density table aesthetics without modifying calculation logic or Excel exports.
**Depends on**: Phase 1, Phase 2, Phase 3, Phase 4
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. Persistent App Shell (collapsible sidebar + topbar) wraps all routes, enabling 1-click navigation between all modules without losing workspace state or relying on raw "back to hub" buttons.
  2. Centralized Obsidian Glass theme tokens in `src/index.css` elevate visual contrast, typography, and card aesthetics consistently across all modules.
  3. Live System Status HUD in the shell displays active database status, Tally connection state, and current client/FY context.
  4. High-density financial table styles (sticky headers, monospace tabular figures, compact padding, clear status chips) are standardized.

**Plans**: 2/2 plans complete

Plans:
- [x] 05-01: Persistent App Shell component with collapsible sidebar, topbar HUD, and integrated routing in `Index.tsx`
- [x] 05-02: Obsidian Glass theme tokens, high-density table styles, and module-wide visual elevation

### Phase 6: Core Compliance Modules UI/UX Overhaul & Financial Cockpit Elevation

**Goal**: Transform high-traffic compliance modules (Returns Dashboard, Party-Wise Dispute Hub, Tally Direct Bridge, TDS Reconciliation, and Income Tax Sandbox) into sleek, obsidian financial cockpits with micro-interactions, responsive high-density tables, and clear visual hierarchy without touching core calculation engines or Zero-Merge exports.
**Depends on**: Phase 5
**Requirements**: UI-05, UI-06, UI-07
**Success Criteria** (what must be TRUE):
  1. `PartyWiseReport.tsx` displays high-density vendor summary cards, interactive dispute breakdown, and split-screen note comparison.
  2. `ReturnsDashboard.tsx` & `Gstr2bMasterDownloader.tsx` feature telemetry timeline steppers, period status grid badges, and collapsible Playwright event logs.
  3. `TallyDirectImport.tsx`, `TdsReconciliation.tsx`, and `IncomeTaxDashboard.tsx` adopt `.obsidian-card`, `.table-dense`, and `.cell-mono` classes consistently.

**Plans**: 8/8 plans complete

Plans:
- [x] 06-01: Returns Mission Control & Party-Wise Dispute Hub UI elevation
- [x] 06-02: Tally Direct Bridge, TDS & Income Tax Sandbox UI elevation
- [x] 06-03: Modern Frosted Dropzone & File Metadata Preview (`FileUploadZone.tsx`)
- [x] 06-04: Interactive KPI Cockpit with Match Rate Hero & Click-to-Filter (`SummaryCards.tsx`)
- [x] 06-05: Scroll Architecture Polish & Shimmer Loading Skeletons
- [x] 06-06: Returns Preparation & Filing (`ReturnsDashboard.tsx`) Header & Layout Re-architecture
- [x] 06-07: Split Returns Autopilot & Ingestion Deck (Independent GSTR-1 & GSTR-2B Sync & Table 3.1 / Table 4 Injection)
- [x] 06-08: GSTR-3B Official GSTN Offline JSON Schema Compliance (RT-SCVU101 Remediation)

### Phase 7: Browser Autopilot Chrome-First Architecture & Windows Client Hardening

**Goal**: Ensure all Playwright portal automation tasks (GSTR-2B, GSTR-1, IMS, GSTIN Lookup) prioritize Google Chrome (`channel: 'chrome'`) above all other browsers on client PCs, eliminating unexpected Microsoft Edge launches while maintaining robust fallbacks.
**Depends on**: Phase 4
**Requirements**: AUTOPILOT-CHROME-01
**Success Criteria** (what must be TRUE):
  1. Google Chrome visibly launches for GSTR-2B, GSTR-1, IMS, and GSTIN search whenever Google Chrome is present on the client Windows PC.
  2. If Google Chrome is missing, the automation safely falls back to bundled Chromium or Microsoft Edge without throwing unhandled exceptions.
  3. All stealth anti-detection flags (`--disable-blink-features=AutomationControlled`, `--start-maximized`, `--no-sandbox`) and window management remain intact.
  4. Process cancellation hooks (`req.on('close')`, `browserState.current = null`) cleanly terminate the browser process on Windows.

**Plans**: 1/1 plan complete

Plans:
- [x] 07-01: Centralized Chrome-first browser launcher, multi-module refactoring (GSTR-2B, GSTR-1, IMS, GSTIN Lookup), and launch verification

### Phase 8: Autopilot Runtime Execution & Production Database Hardening

**Goal**: Resolve the two production execution bugs in packaged `.exe` builds: (1) prevent `ReferenceError: _0x... is not defined` inside Chrome by shielding browser evaluations from `javascript-obfuscator`, and (2) auto-seed `network_data.db` with master clients & credentials in `app.getPath('userData')`.
**Depends on**: Phase 7
**Requirements**: AUTOPILOT-PROD-01
**Success Criteria** (what must be TRUE):
  1. `server.obfuscated.cjs` leaves `page.evaluate` and `page.waitForFunction` code clean without Node scope lookup tokens (`_0x...`), preventing browser runtime exceptions.
  2. Assistive banner and DOM injections in `gstr2b/autopilot.js` are wrapped in try/catch to ensure UI decoration errors never halt the autopilot loop.
  3. Fresh installations in packaged mode automatically seed `network_data.db` from the bundled master database in `resources/` so all 400+ clients and credentials are fully loaded.
  4. GSTR-2B autopilot successfully autofills `#username` and `#user_pass` and advances to portal period selection.

**Plans**: 1/1 plan complete

Plans:
- [x] 08-01: Shield Playwright automation from obfuscation, bundle and auto-seed `network_data.db`, and verify end-to-end execution

### Phase 9: Suite 04 Returns Enterprise Fluid Dashboard Layout Overhaul

**Goal**: Transform and align the visual architecture and component hierarchy of Suite 04 (Returns Preparation & Filing) with the Google Stitch enterprise dashboard design package (`stitch_vaswani_audit_enterprise_dashboard`), elevating all 5 tabs (GSTR-3B Working Sheet, 12-Month Matrix, GST IMS Manager, GSTR-2B Autopilot, GSTR-1 Autopilot) while guaranteeing 100% functional invariance of all calculation algorithms, set-off cascades, SQLite queries, and Playwright automation routines.
**Depends on**: Phase 6, Phase 7, Phase 8
**Requirements**: UI-STITCH-01, UI-STITCH-02, UI-STITCH-03, UI-STITCH-04, UI-STITCH-05
**Success Criteria** (what must be TRUE):
  1. Tab 1 (GSTR-3B Working): Implements the sleek micro-pill tab deck, combined period track & ingestion breathing bar (Apr-Mar pills, sync triggers, reco match percentage), Table 3.1 & Table 4 high-density financial tables, and Rule 88A waterfall card.
  2. Tab 2 (12-Month Matrix): Implements the high-density annual comparative grid with compact vs detailed view toggles and monthly tax breakdown columns.
  3. Tab 3 (GST IMS Manager): Implements the 300+ client selector with session timer countdown, 4-metric compact KPI bar (Total Invoices, Accepted, Rejected, Pending), batch action toolbar, and ledger table.
  4. Tab 4 (GSTR-2B Downloader): Implements client telemetry header, Golden Rule mini pill, side-by-side autonomous loop & CAPTCHA resolver card, live progress bar, and 12-month sync status matrix.
  5. Tab 5 (GSTR-1 Downloader): Implements turnover telemetry header, 12-month batch velocity progress bar, Outward Tables Coverage Deck (Table 4, 5, 7, 9, 12, 13 chips), and multi-period outward sync grid.
  6. Functional Invariance: Strictly 0 regressions in Rule 88A tax computations, Table 4 ITC claims, Excel zero-merge exports, SQLite persistence, and Playwright Chromium automation.

**Plans**: 3/3 plans complete

Plans:
- [x] 09-01: Tab 1 GSTR-3B Working Sheet & Tab 2 12-Month Matrix Stitch Fluid Layout Overhaul
- [x] 09-02: Tab 3 GST IMS Manager 300+ Client Hub & Action Ledger Stitch Fluid Layout Overhaul
- [x] 09-03: Tab 4 GSTR-2B & Tab 5 GSTR-1 Autopilot 12M Sync Matrix Stitch Fluid Layout Overhaul

### Phase 10: Enterprise Modernized Shell & Complete Returns Dashboard 1:1 Stitch Alignment

**Goal**: Implement the modernized layout architecture for "Vaswani Return Enterprise" matching Stitch screens: (1) smart collapsible left sidebar rail (64px to 256px on hover/pin) with 17-module route mapping & bottom-left settings trigger, (2) standardized top header with Omni-search (⌘K), live Tally Port 9000 status, FY switcher, and company context chip, and (3) complete 1:1 visual parity across all 5 Returns Dashboard tabs with strict calculation and API invariance.
**Depends on**: Phase 9
**Requirements**: UI-MODERN-01, UI-MODERN-02, UI-MODERN-03, UI-MODERN-04
**Success Criteria** (what must be TRUE):
  1. Collapsible left sidebar rail expands smoothly on hover (64px to 256px) or pin toggle, housing 17 modules categorized by suites with distinct color accents and bottom-left System Settings modal trigger.
  2. Standardized top header displays Port 9000 connection status HUD, FY switcher, Omni-search with ⌘K shortcut, and active company context.
  3. Returns Dashboard Tab 1 (GSTR-3B Working Sheet & Rule 88A Matrix) matches `gstr_3b_working_sheet_fluid_rail_compact_tabs/code.html` 1:1.
  4. Returns Dashboard Tab 3 (GST IMS & 2B Manager) matches `gst_ims_2b_manager_fluid_rail_compact_tabs/code.html` 1:1.
  5. Returns Dashboard Tab 4 (GSTR-2B Autopilot) and Tab 5 (GSTR-1 Autopilot) match their respective Stitch blueprints 1:1.
  6. Strict Functional Invariance: 0 changes to Rule 88A set-off, SA 530 sampling, Tandon MPBF II, Form 3CD Clause 44, 115BAC formulas, SQLite queries, or Playwright automation.

**Plans**: 4/4 plans complete

Plans:
- [x] 10-01: Modernized App Shell — Smart Collapsible Sidebar Rail & Standardized Header
- [x] 10-02: Returns Dashboard Tab 1 — GSTR-3B Working Sheet & Rule 88A Matrix 1:1 Stitch Alignment
- [x] 10-03: Returns Dashboard Tab 3 — GST IMS & 2B Manager 1:1 Stitch Alignment
- [x] 10-04: Returns Dashboard Tab 4 & 5 — GSTR-2B & GSTR-1 Autopilot 1:1 Stitch Alignment

### Phase 11: Suite 04 Returns Complete Restructuring & Alignment with Newly Downloaded Stitch Assets

**Goal**: Implement the newly downloaded Stitch assets (`stitch_vaswani_audit_enterprise_dashboard (1)/stitch_vaswani_audit_enterprise_dashboard/`) across the entire Returns Dashboard suite with 100% visual fidelity and zero functional regressions:
1. Tab 1: Formal GSTR-3B Computation Sheet (`gstr_3b_working_sheet_rule_88a_matrix`) with the 28-line CA computation table, dual ingestion action cards (GSTR-1 & GSTR-2B), 3 insight cards, and Rule 88A set-off cascade.
2. Tab 2: FY360° Reconciliation Matrix Split Executive Layout (`fy360_reconciliation_matrix_split_executive_layout`) with 4-column metric strip and Electronic Credit Ledger horizontal header banner.
3. Tab 3: Nexus IMS Decision Hub Updated Header (`nexus_ims_decision_hub_updated_header`) with 20-minute circular countdown ring and recipient action toggles.
4. Tab 4: Inward ITC Autopilot Cockpit Updated Header (`inward_itc_autopilot_cockpit_updated_header`) with telemetry pulse cards and distorted security badge CAPTCHA resolver.
5. Tab 5: Outward Autopilot Sales Console Restructured Layout (`outward_autopilot_sales_console_restructured_layout`) with full horizontal launch deck, 12M small tabs (8 cols) + portal captcha resolver (4 cols).
6. Web favicon & PWA app icons alignment.

**Depends on**: Phase 10
**Requirements**: UI-STITCH-NEW-01, UI-STITCH-NEW-02, UI-STITCH-NEW-03, UI-STITCH-NEW-04, UI-STITCH-NEW-05

**Plans**: 5/5 plans complete

Plans:
- [x] 11-01: Tab 1 GSTR-3B Formal Computation Sheet & Dual Ingestion Deck 1:1 Alignment
- [x] 11-02: Tab 2 FY360° Executive Cockpit & Electronic Credit Ledger Banner Alignment
- [x] 11-03: Tab 3 Nexus IMS Decision Hub Circular Timer & Action Deck Alignment
- [x] 11-04: Tab 4 Inward ITC Autopilot Cockpit & Distorted CAPTCHA Resolver Alignment
- [x] 11-05: Tab 5 Outward Autopilot Restructured Layout (Split 12M Tabs + CAPTCHA) Alignment

### Phase 12: GST Notices & Orders Autonomous Suite (Autopilot Downloader, Tracker & AI Reply Drafter)

**Goal**: Deliver a comprehensive GST notices and orders management suite for enterprise compliance:
1. Autonomous Playwright scraper across (a) `View Notices and Orders`, (b) `View Additional Notices/Orders`, and (c) `Return Compliance` (DRC-01B & DRC-01C), safely downloading all notice PDFs and annexures into local encrypted storage without breaking SSO session.
2. Local SQLite persistence (`gst_notices`, `gst_notice_attachments`, `gst_notice_replies`) maintaining DIN, issuing officers, hearing dates, and demanded amounts.
3. Limitation & Hearing Calendar HUD alerting 7-day deadlines (DRC-01B/C) and 30-day deadlines (ASMT-10, DRC-01) with urgent priority chips.
4. Deterministic Multi-Return Cross-Reconciliation comparing notice figures against local GSTR-1, GSTR-2B, GSTR-3B, and Purchase Register tables to calculate the exact cause of difference (timing difference, late vendor filing, RCM, or clerical error) and generate Zero-Merge analytical Excel annexures (`ws['!merges'] = []`).
5. Dual-Engine Legal Reply Drafter producing audit-grade written submissions in Form GST ASMT-11, Form GST DRC-06, and DRC-01B/C Part B with statutory citations (Sections 16(5)/(6), 61, 73, 74, 128A, and Circular 211/2024).

**Depends on**: Phase 11, Phase 8
**Requirements**: NOTICES-01, NOTICES-02, NOTICES-03, NOTICES-04, NOTICES-05
**Success Criteria** (what must be TRUE):
  1. 1-Login Playwright Autopilot safely navigates to all 3 portal notice destinations and downloads notice PDFs and annexures without hitting "Access Denied" or losing SSO session.
  2. Notices and evidence files are catalogued in SQLite with limitation date countdowns calculated from issue dates.
  3. Notice discrepancies cross-reference local return tables and isolate causes of difference without double-counting.
  4. Legal reply drafts populate correct statutory formats (ASMT-11 / DRC-06) with relevant statutory defenses and zero-merge reconciliation sheets.
  5. UI dashboard adheres to Obsidian Glass aesthetic and integrates into the persistent sidebar navigation.

**Plans**: 4/4 plans complete

Plans:
**Wave 1**
- [x] 12-01: SQLite Schema & Backend API (`notices/db.js`, `notices_routes.js`, `server.js`)
- [x] 12-02: Playwright Portal Autopilot Scraper (`notices/autopilot.js`) across 3 notice destinations

**Wave 3** *(blocked on Wave 1 completion)*
- [x] 12-03: Deterministic Discrepancy Cross-Reconciler & Zero-Merge Excel Annexure Engine (`src/lib/noticeReconciliation.ts`)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 12-04: AI / Template Legal Reply Drafter & Frontend Dashboard (`src/pages/GstNoticesDashboard.tsx`)

### Phase 15: Returns Tracking Submodule (Tab 06) Integration

**Goal**: Implement submodule `06. Returns Tracking` (`returns_tracking`) inside Suite 04 (Returns Preparation & Filing) across AppShell sidebar, ReturnsDashboard tabs, and Central Compliance Hub, with 12-month statutory return filing matrix (GSTR-1, GSTR-3B, GSTR-2B, GSTR-9), ARN/filing date tracking, deadline countdowns, and Zero-Merge Excel compliance export.
**Depends on**: Phase 11
**Requirements**: RET-01, RET-02, RET-03
**Success Criteria**:
  1. Tab `06. Returns Tracking` appears in `RETURNS_SUBMODULES` in `src/components/AppShell.tsx` and can be switched smoothly.
  2. `ReturnsDashboard.tsx` mounts `<ReturnsTrackingMaster />` under `activeTab === 'returns_tracking'`.
  3. 12-month compliance grid dynamically reflects filed GSTR-1, GSTR-2B, and GSTR-3B data for the active client and financial year.
  4. Users can manually record or update ARN and filing dates with persistence.
  5. 1-click Zero-Merge Excel compliance audit export runs cleanly without `<mergeCell>` entries.

**Plans**: 1/1 plan complete
- [x] 15-01: Returns Tracking UI Component, Navigation Extension & Backend API

### Phase 16: Returns Tracking 2-Step Architecture: Distinct Client Directory Gateway (Page 1) & Scoped 12-Month Compliance Matrix (Page 2)

**Goal:** Establish a 2-step workflow for Submodule `06. Returns Tracking` (`ReturnsTrackingMaster.tsx`):
1. **Page 1 (Step 1):** Distinct client directory where every firm client is listed as a single distinct row (NOT repeated for every month) with search, status filters, multi-select checkboxes, and compliance progress pills.
2. **Page 2 (Step 2):** Scoped compliance cockpit displaying detailed month-by-month return filings, ARNs, and statutory KPIs strictly for the clients selected on Page 1, with a 1-click return button (`← Select Clients`) to adjust scope at any time.

**Depends on:** Phase 15
**Requirements**: RET-STEP-01, RET-STEP-02, RET-STEP-03
**Success Criteria**:
  1. Front Page (Step 1) lists every registered client exactly once (1 row per client, NOT 12 rows per month) with trade name, GSTIN, filing frequency, and FY compliance progress pills.
  2. Multi-client checkbox column with `SELECT` header enables checking single or multiple clients, with real-time live search across client name and GSTIN.
  3. Clicking "Proceed to Dashboard" opens Page 2 (Step 2) scoped strictly to selected clients, recalculating Top 4 KPI cards (Total Returns Due, Filed, Overdue, Next Deadline) exclusively for the chosen clients.
  4. Top Obsidian Header on Page 2 provides an immediate `← Select Clients` back-switcher to return to Step 1 and modify client scope without losing state.
  5. Single-client quick button `Track Client →` allows 1-click direct entry from directory into detailed 12-month compliance tracking.

**Plans:** 1/1 plan complete
- [x] 16-01: Returns Tracking 2-Step Architecture (Distinct Client Directory Gateway & Scoped Detail Workspace)

---
*Roadmap defined: 2026-10-22*
*Last updated: 2026-10-24 after Phase 15 Returns Tracking addition*


### Phase 17: NOTICE-SHIELD AI (Automated GST Notice Intelligence, Zero-Trust PII Sanitization & Courtroom-Grade Legal Defense Engine)

**Goal:** Deliver an enterprise-grade, zero-data-leakage GST Notice Intelligence, Zero-Trust PII Sanitization, and Courtroom Reply Drafting platform inside Module 12 (GST Notices & Orders Autonomous Suite):
1. **Zero-Trust PII Sanitizer & Re-Hydrator (src/lib/piiSanitizer.ts):** Deterministic two-way regex & dictionary tokenization layer scrubbing GSTINs, PANs, ARNs, DINs, names, and contact details with temporary in-memory session mapping before sending payloads to Gemini. Re-hydrates actual client details locally before UI display or document export.
2. **Interactive Privacy Vault Split-Screen Diff Viewer (src/components/PrivacyVaultDiffViewer.tsx):** Side-by-side inspection of Raw Notice text (red sensitive tags) vs Sanitized payload (emerald tokens) proving 0% client data leakage to the cloud.
3. **Autonomous 5-Stage Live Defense Pipeline (src/components/NoticePipelineVisualizer.tsx):** Framer-motion animated stepper (Ingest -> OCR -> PII Masking -> Gemini -> Re-Hydration).
4. **Gemini Tax Intelligence & Statutory Defense Engine (src/lib/geminiTaxEngine.ts):** Applies 5-step analytical framework (DIN check, limitation check, Sec 74 fraud suppression challenge, Rule 88B net cash interest rule) and generates structured JSON analysis with high-precision offline fallback.
5. **Interactive Reply Workbench & Document Exporter (src/components/NoticeReplyWorkbenchModal.tsx, src/lib/noticeDocxExporter.ts):** Split-pane workspace with defense quick-insert chips, form switcher (ASMT-11, DRC-06, DRC-01B Part B), court-grade Word (.docx) and PDF export, Zero-Merge Excel Annexure export, and SQLite draft persistence.
6. **Pre-Loaded Realistic Demo Suite (src/lib/noticeDemoData.ts):** Instant 1-click test scenarios (ASMT-10 with Section 16(5) relief, DRC-01 SCN with Rule 88B, and DRC-01B Rule 88C intimation).

**Depends on:** Phase 12
**Requirements**: NOTICES-SHIELD-01, NOTICES-SHIELD-02, NOTICES-SHIELD-03, NOTICES-SHIELD-04, NOTICES-SHIELD-05
**Success Criteria**:
  1. Zero client PII leaves the host machine; real client details are tokenized deterministically prior to Gemini and re-hydrated locally.
  2. Privacy Vault Diff Viewer visually contrasts raw notice text against sanitized payload with in-memory token mapping.
  3. 5-Stage animated pipeline visualizer updates dynamically during notice processing.
  4. Courtroom written reply generator formulates 6-block statutory defense including mandatory Section 75(4) personal hearing prayer.
  5. 1-click demo suite executes out of the box with zero configuration alongside PDF upload and Playwright crawler.
  6. Formatted .docx and .pdf files export cleanly with zero errors.

**Plans**: 3/3 plans complete
- [x] 17-01: Zero-Trust PII Sanitization Engine & Ingestion Pipeline
- [x] 17-02: Gemini Tax Intelligence & Legal Reasoning Core
- [x] 17-03: Corporate UI, Privacy Vault Diff Viewer & Interactive Reply Workbench

### Phase 18: Suite 01 Work In Progress & Practice Hub — Module 1.6 Financial Statements Engine (Schedule III Corporate & Non-Corporate ICAI 2022 Suite)

**Goal:** Overhaul and upgrade Module 1.6 Financial Statements Engine (`src/pages/FinancialStatements.tsx`) under Suite 01 (`Work In Progress & Practice Hub`) into an enterprise dual-mode financial preparation suite incorporating the full architecture of the two deep-analyzed tools:
1. **Schedule III Corporate Engine (Companies Act 2013 Division I/II):**
   - Full 4-digit numeric group taxonomy (1001-4902) mapping Equity & Liabilities (1000s), Assets (2000s), Revenue (3000s), and Expenses (4000s).
   - 17 MCA 2021/2022 Regulatory Disclosures (`R_Disc`) including 11 Financial Ratios with >25% variance analysis, CWIP aging, Intangibles aging, MSME Trade Payables aging, and Trade Receivables aging.
   - Automated AS-3 / Ind AS 7 Indirect Cash Flow Statement Engine (`CFS` & `CFS(W)`) with tax reconciliation and working capital derivation.
   - Corporate Tax & Deferred Tax Engine (Sec 115BAA 22%, Sec 115BAB 15%, regular 25%/30%, MAT u/s 115JB, timing differences).
2. **Non-Corporate Financial Engine (ICAI June 2022 Technical Guide):**
   - Automated Level I–IV entity classification engine (Turnover & Borrowing criteria) with AS-1 to AS-29 applicability and disclosure exemptions matrix.
   - Dual presentation formats: Both Vertical (Modern Schedule III-style) and Horizontal (Traditional T-Format for bank & tax filings).
   - Multi-Partner Capital Account Schedule (2 to 50 partners with capital movement, interest, salary, drawings, profit sharing).
   - Dual Depreciation Calculator: Schedule II Companies Act (Useful life, SLM/WDV) vs Income Tax Act Section 32 block-wise WDV.
3. **Practice Hub & Navigation Integration:**
   - Seamless wiring into `src/pages/Hub.tsx` under Suite 01 (Work In Progress & Practice Hub) as Module 1.6 Financial Statements Engine.
   - 35+ Internal Financial Control (IFC) preventive checks dashboard (`Checks`) catching untallied TB, unmapped ledgers, abnormal balances, and CFS cash variances.
   - Multi-branch consolidation with inter-unit contra elimination (`Elim_Report`).
   - Zero-Merge Excel Export Suite & 1-click CA software bridge format.

**Depends on:** Phase 5, Phase 6
**Requirements**: FIN-01, FIN-02, FIN-03, FIN-04, FIN-05
**Success Criteria**:
  1. Module 1.6 Financial Statements Engine is accessible from Hub.tsx Suite 01 and sidebar navigation with route `/fin-statements`.
  2. Entity Type Switcher toggles seamlessly between "Company (Schedule III Division I/II)" and "Non-Corporate Entity (ICAI 2022 Technical Guide)".
  3. Trial Balance import ingests Tally/Excel ledgers and auto-maps using the 4-digit taxonomy (1001-4902) with high-confidence suggestions.
  4. Balance Sheet, Statement of Profit and Loss, and Cash Flow Statement (Indirect Method) calculate automatically with real-time balance validation.
  5. MCA 2021 Regulatory Disclosures render 11 financial ratios with automatic variance triggers (>25%) and statutory aging schedules.
  6. Non-Corporate mode evaluates Level I-IV AS applicability and produces Partners' Capital Accounts and Horizontal T-Format layouts.
  7. Preventive IFC Check Dashboard validates 35+ financial integrity rules in real time.

**Plans**: 0/3 plans complete
- [ ] 18-01: 4-Digit Taxonomy (1001-4902), Dual-Mode Storage Engine, Level I-IV AS Matrix & Tally/Excel Ingestion
- [ ] 18-02: Statements Generation (BS, P&L, AS-3 Indirect CFS), Corporate Tax & Deferred Tax Engine
- [ ] 18-03: MCA 2021 Regulatory Disclosures (11 Ratios & Aging), Non-Corporate Partner Schedules, IFC Checks & Zero-Merge Excel Suite

### Phase 19: GSTR-3B Inward ITC Manual Allocation & Voucher-Level Audit Workbench (2B Drill-Down, Field Selection & Statutory Track Record)

**Goal:** Overhaul the GSTR-3B Working Sheet Table 4 Inward ITC under Returns Preparation & Filing (`src/pages/ReturnsDashboard.tsx`) with an in-place, voucher-level allocation workbench. Enable tax practitioners to drill down from Table 4 into underlying GSTR-2B inward bills on the same page, classify each voucher into statutory 3B fields (Eligible 4(A)(5), RCM 4(A)(3), Import 4(A)(1), Reversals 4(B), Ineligible Sec 17(5) 4(D)(1), Ineligible Sec 16(4) 4(D)(2), Defer), dynamically recalculate Table 4 and Rule 88A cross set-off, persist audit classifications in SQLite `gstr3b_itc_allocations`, and export Zero-Merge (`ws['!merges'] = []`) audit workbooks for GST scrutiny defense.

**Depends on:** Phase 4, Phase 6
**Requirements**: ITC-ALLOC-01, ITC-ALLOC-02, ITC-ALLOC-03, ITC-ALLOC-04, ITC-ALLOC-05
**Success Criteria**:
  1. In `ReturnsDashboard.tsx` Tab 1 (GSTR-3B Working Sheet), Table 4 row "ITC as per GSTR 2B" displays an interactive clickable hyperlink/button (`View & Allocate 2B Bills (N)`).
  2. Clicking the hyperlink seamlessly replaces the 3B computation table on the same page with `<Gstr3bItcAllocationWorkbench ... />` and a sticky `← Back to GSTR-3B Working Sheet` switcher.
  3. Lists all GSTR-2B inward invoices from SQLite for the active client & return period with statutory fallback defaults.
  4. Each bill provides a statutory destination selector dropdown (`4A5`, `4A3`, `4A1`, `4B1`, `4B2`, `4D1`, `4D2`, `DEFERRED`) and audit note field.
  5. Multi-select toolbar allows 1-click bulk classification (e.g., mark 15 bills as Ineligible 17(5) or Reversals).
  6. Applying allocations dynamically recalculates Table 4 (`itc2b`, `rcmPaid`, `importGoods`, `itcReversed`, `ineligibleItc`), Total ITC Available `(B)`, Rule 88A set-off cascade, and net tax payable.
  7. Classifications are persistently stored in SQLite `gstr3b_itc_allocations` and survive page reload.
  8. Zero-Merge Excel Exporter (`ws['!merges'] = []`) creates a 5-sheet statutory audit workbook for GST audit defense.

**Plans**: 3/3 plans complete
- [x] 19-01: SQLite Allocation Repository, Backend APIs & Zero-Merge Excel Audit Exporter
- [x] 19-02: In-Place GSTR-3B Inward ITC Allocation & Audit Workbench UI Component
- [x] 19-03: In-Place GSTR-3B Table 4 Integration, Dynamic Recalculation & Statutory Set-off Cascade

### Phase 20: Direct Client Directory Auto-Save Architecture (Zero-Download Prompt Workflow)

**Goal:** Eliminate browser "Save As / Where to save" file picker dialogs when clicking "Save Working Sheet" (or pressing Ctrl+S) in GSTR-3B Working Sheet and Returns Dashboard. Ensure all generated artifacts and supporting statutory bases are structured and written directly into the client's designated storage folders under `<dataPath>/<Client>/<FY>/<Month>/3B Working/` via backend filesystem storage:
  1. `3B Working/` — Date-wise & canonical latest GSTR-3B Excel workbook, official PDF statement, GSTN portal JSON payload, and master working state.
  2. `R1 Base/` — GSTR-1 Outward sales base schedules (B2B, B2C, SEZ, Advances, Nil/Exempt) feeding Table 3.1.
  3. `2B Base/` — GSTR-2B Inward supplies base schedules (B2B, B2BA, Inward RCM) feeding Table 4 ITC.
  4. `Credit Notes Base/` — Outward & Inward CDNR credit notes schedule adjusting sales and ITC.
  5. `Reversal Base/` — ITC Reversals & Ineligible schedule (Table 4B1, 4B2 Rule 37/38/42/43, Sec 17(5) blocked, Sec 16(4) time-barred, Deferred bills).
Retain explicit manual download actions ("Download GSTR-3B Working Excel", "Print Official PDF", "Generate GSTN Portal JSON") for users who specifically request a local browser download.

**Depends on:** Phase 19
**Requirements**: AUTOSAVE-01, AUTOSAVE-02, AUTOSAVE-03, AUTOSAVE-04
**Success Criteria**:
  1. Clicking "Save Working Sheet" or pressing `Ctrl+S` does NOT trigger browser download popups (`excelA.click()`, `pdfResult.autoDownload`, `jsonA.click()`) or "Save As" prompts.
  2. The backend creates `<dataPath>/<Client>/<FY>/<Month>/3B Working/` with dedicated subfolders: `3B Working/`, `R1 Base/`, `2B Base/`, `Credit Notes Base/`, and `Reversal Base/`.
  3. All 5 bases (Excel workbooks + canonical JSON/snapshots) are generated and saved directly into their respective subfolders.
  4. UI displays a clean success toast with the exact destination folder path and an interactive "Open Folder" button that launches the OS file explorer directly to the client's month directory via `/api/returns/open-folder`.
  5. Explicit download buttons ("Download GSTR-3B Working Excel", "Print Official PDF", "Generate GSTN Portal JSON") continue to trigger standard browser file downloads when clicked by the user.

**Plans**: 1/1 plan complete
- [x] 20-01: Direct Client Folder Silent Auto-Save & Structured Subfolder Hierarchy Base Pipeline

### Phase 21: GST Client Credentials Vault & Master Directory Multi-PC LAN Synchronization Engine

**Goal:** Enable seamless multi-PC synchronization of GST Portal credentials (User ID, Password, Authorized Signatory, Contact Info) and Client Master Directory across all workstations connected to the office network storage path (`dataPath` / `\\SERVER\gst_returns_data`).
Ensure that any client added, updated, or imported on one PC is immediately available across all other PCs without manual re-entry or separate Excel imports.

**Depends on:** Phase 20
**Requirements**: VAULT-SYNC-01, VAULT-SYNC-02, VAULT-SYNC-03, VAULT-SYNC-04, VAULT-SYNC-05
**Success Criteria**:
  1. Adding, editing, or updating GST portal User ID and password for a client on PC 1 instantly writes to both local SQLite and central shared storage (`central_clients_vault.json`).
  2. Opening the application, Client Hub, or Credentials Vault Modal on PC 2 automatically detects and syncs updated credentials from the shared network storage.
  3. Bulk Excel import of credentials on any workstation reconciles and updates the central vault with conflict resolution (`last_modified` timestamp tracking).
  4. Deleting a client or clearing credentials on one PC propagates cleanly to the central vault so other PCs do not resurrect deleted credentials.
  5. All 5 Autopilot modules (GSTR-1, GSTR-2B, IMS, Notices, Returns Tracking) automatically access synced credentials on any connected PC.

**Plans**: 2/2 plans complete
- [x] 21-01: Central Vault Storage Engine, Bidirectional Sync APIs & SQLite Schema Hardening
- [x] 21-02: Credentials Vault Modal Multi-PC UI Telemetry, Auto-Sync & Real-Time Sync Triggers

### Phase 22: Sourav — Universal Gemini AI Assistant & In-App Chatbot

**Goal:** Integrate Google Gemini API as an in-app AI agent named "Sourav" — a context-aware, conversational assistant embedded in the desktop application. Sourav knows all GST law (CGST/SGST/IGST Acts, return types, ITC, reconciliation rules, notices), all 12 software modules, the active client, active FY, and active module. User can ask questions, get guidance, and give instructions — Sourav responds via a floating chat panel (bottom-right FAB → slide-in chat panel) powered by `gemini-2.0-flash`.

**Depends on:** Phase 21  
**Requirements**: AI-AGENT-01, AI-AGENT-02, AI-AGENT-03, AI-AGENT-04, AI-AGENT-05  
**Success Criteria**:
  1. A floating amber/gold "✨ Sourav" FAB renders at bottom-right of every screen in the app.
  2. Clicking FAB opens a chat panel where the user can type any GST or software question and receive a Gemini-powered answer within 5 seconds.
  3. Active client name, GSTIN, FY, and current module are automatically injected as context with every message.
  4. Gemini API key can be configured and tested from Settings → AI Assistant tab (stored securely in backend SQLite, never in frontend).
  5. If no API key is configured, Sourav displays a friendly prompt directing user to Settings.
  6. All TypeScript compiles with zero errors.

**Plans**: 2/2 plans complete
- [x] 22-01: Gemini API Backend Engine — `/api/gemini/chat`, `/api/gemini/config`, system prompt, `app_config` key storage
- [x] 22-02: Sourav Frontend Chat UI — Floating FAB, slide-in chat panel, context chips, Settings AI tab

### Phase 23: Central Office-Wise Gemini Cloud Distribution & Firebase License Sync

**Goal:** Eliminate manual per-user Gemini API key entry by synchronizing the API key centrally from Firebase Firestore (`reco-vaswani-license` project) down to all client workstations in an office automatically upon launch or license heartbeat. Support a hybrid model: global master key in `system_config/ai_settings` with per-office overrides in `serial_keys`, local SQLite caching for offline resilience, and bidirectional sync (fetch/push) from desktop Admin UI and web serial key generator.

**Depends on:** Phase 22  
**Requirements**: CLOUD-AI-01, CLOUD-AI-02, CLOUD-AI-03, CLOUD-AI-04, CLOUD-AI-05  
**Success Criteria**:
  1. Workstations in an office automatically fetch and activate the Gemini API key from Firebase Firestore without manual user entry.
  2. The cloud sync engine supports both per-office keys in `serial_keys` and a global fallback key in `system_config/ai_settings`.
  3. Synced keys are cached locally in SQLite `app_config` so Sourav AI works seamlessly offline.
  4. Desktop Settings UI displays cloud origin badge (`🟢 Active (Synced from Office Cloud License)`) and provides a "Sync from Cloud" button.
  5. Admins can push local keys to the cloud as an office or global default directly from the app.
  6. Ready-to-copy code snippet and schema guide provided for the web serial key generator portal.

**Plans**: 1/1 plan complete
- [x] 23-01: Firestore Cloud Key Resolver, Two-Way Sync APIs, SQLite Caching, and Desktop Admin UI (completed 2026-10-29)
