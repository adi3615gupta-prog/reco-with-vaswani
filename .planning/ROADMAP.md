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
- [ ] **Phase 10: Enterprise Modernized Shell & Complete Returns Dashboard 1:1 Stitch Alignment** - Implement the smart collapsible left sidebar rail, standardized top header with Port 9000 & FY switcher, and rebuild all 5 Returns Dashboard tabs to 1:1 match Stitch templates.

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

**Plans**: 1/4 plans complete

Plans:
- [x] 10-01: Modernized App Shell — Smart Collapsible Sidebar Rail & Standardized Header
- [ ] 10-02: Returns Dashboard Tab 1 — GSTR-3B Working Sheet & Rule 88A Matrix 1:1 Stitch Alignment
- [ ] 10-03: Returns Dashboard Tab 3 — GST IMS & 2B Manager 1:1 Stitch Alignment
- [ ] 10-04: Returns Dashboard Tab 4 & 5 — GSTR-2B & GSTR-1 Autopilot 1:1 Stitch Alignment

---
*Roadmap defined: 2026-10-22*
*Last updated: 2026-10-24 after Phase 10 planning*
