# Roadmap: Vaswani Return Enterprise (Audit With Vaswani)

## Milestones

### **Milestone v2.9: Architectural Decoupling, Inter-Module Isolation & Scoped Tally Session Management** (Phases 40–41) — SHIPPED (2026-11-15)

- [x] **Phase 40: Comprehensive Inter-Module Decoupling, Standalone Self-Sufficiency & Scoped Tally Session Management (3 Plans: 40-01 .. 40-03)** (completed 2026-11-15)
  - Decouple GSTR-1 and GSTR-2B from GSTR-3B (eliminate "Push to 3B" buttons and endpoints), isolate GST Notices from background return database queries into explicit case attachments (`40-01`).
  - Decouple Consolidation Hub and Tally Direct Import from Reco (pure Excel downloads without memory push), convert GSTIN Scan into an autonomous standalone tool, and preserve Party-Wise Report as an internal sub-tab under Option A (`40-02`).
  - Build `useScopedTallySession` hook with automatic unmount teardown, per-module Port 9000 isolation (connected while in-view, immediately disconnected on leaving), Vitest verification gate, 0 TypeScript errors, and clean Vite production build (`40-03`).

- [x] **Phase 41: Suite 09 — GSTR-2B Direct Inward Entry to TallyPrime & Database Audit Ledger (1 Plan: 41-01)** (completed 2026-11-15)
  - Integrate GSTR-2B Inward supplies selection into Suite 09 Data Entry Studio as a 4th sub-tab (`GSTR-2B Direct Entry`).
  - Client, Financial Year, and Period (Month / Full Year 12 Months) live query against downloaded 2B batches.
  - Automatic conversion to Tally vouchers: B2B to Purchase Vouchers with rate-wise auto-ledgers (`Purchase @ 18%`, `12%`, `5%`, etc.) and CDNR to Debit Note Vouchers.
  - SQLite database tracking (`tally_2b_posted_entries`) at configured data path (`returns_data_path`) with invoice-level duplicate prevention and audit trail.
  - Triple action workflow: Direct Push to Tally (Port 9000 with 500-chunk batching), Download Tally XML, and Load into Universal Studio Grid (`41-01`).

### **Milestone v2.8: Module 12 — A-to-Z GST & VAT Notices & Orders Enterprise Suite** (Phase 39) — SHIPPED 2026-11-12

- [x] **Phase 39: GST & VAT Notices & Orders Enterprise Suite (3 Plans: 39-01 .. 39-03)** (completed 2026-11-12)
  - Tracer-first Case Schema v2 (`notices/db.js`), fixed statutory deadlines (`DRC-01A` 15d, `Sec 125 DRC-01` 7d, `REG-31` 30d, `Sec 74A` FY 2024-25+ 42m/48m, `Sec 169`), shared 64-form table-driven classifier (`notices/classifier.js`), zero-dependency offline folder/DOCX/XLSX/ZIP ingestion (`notices_routes.js`), and expanded `notices/autopilot.js` (`39-01`).
  - Parameter-level statutory calculators (`0070/0073/0074/0077/0078/0080/0103/0127/0219`, `Rule 88B` + `Sec 50(3)` ECrL shield, `Sec 16(5) 30.11.2021` & `SPL-03` traps, Head-wise Pre-deposit & `ASSORD` Refund, `Rule 37/42`, `Rule 89(4)/(5)`), 7-tab Zero-Merge Defense Workbook, data-driven 64-form reply & standardized Legal Kit templates, DOCX table rendering, and extended PII/AI grounding (`39-02`).
  - Integrated Case & Folder Import UI (`GstNoticesDashboard.tsx`, `NoticeReplyWorkbenchModal.tsx`, `NoticePipelineVisualizer.tsx`) and `noticeSuite.test.ts` Vitest + TypeScript + Vite build gates (`39-03`).

### **Milestone v2.7: Presentation-Ready Landing Page & Simplified Suite Explainer** (Phase 38) — SHIPPED 2026-11-12

- [x] **Phase 38: Presentation-Ready Landing Page Overhaul (2 Plans: 38-01 .. 38-02)** (completed 2026-11-12)
  - Remove unnecessary bloat/jargon (`CursorAura`, telemetry latency jitter, JSON payload boxes, ROI sliders, curved marquee, floating live toast, complex FAQ) from `src/pages/LandingPage.tsx`.
  - Introduce `src/data/landingModules.ts` + interactive step-by-step **Module Presenter** explaining Suites 01–07 + Notices & AI in plain business language matching the in-app Hub 1:1.
  - Add dedicated **Work In Progress (WIP) & Upcoming Future Updates** section at the end highlighting Suite 08 WIP modules and upcoming platform releases (`38-01`), and update `src/test/landingPage.test.tsx` + full verification gate (`38-02`).

### **Milestone v2.6: Enterprise Deep Audit Remediation & Full-Stack Hardening** (Phase 37) — SHIPPED 2026-11-11

- [x] **Phase 37: Enterprise Deep Audit Remediation & Hardening (6 Plans: 37-01 .. 37-06)** (completed 2026-11-11)
  - Resolved all 110 findings from `EVAL-REVIEW.md` across authentication & JWT enforcement (`37-01`), AES-256-GCM encrypted credentials vault & proxy security (`37-02`), reconciliation engine accuracy & strict Zero-Merge Excel (`37-03`), statutory/tax engines Rule 88A/194C/40A(3)/16(4)/Tandon II (`37-04`), IMS/GSTR-1/GSTR-2B/Notices/Tally XML stability (`37-05`), and frontend runtime crashes, IndexedDB persistence, table pagination, TypeScript zero-error gate, 53/53 Vitest green (`404/404` tests), and clean Vite production build (`37-06`).

### **Milestone v2.5: Suite 04 — GSTR-2B Inward ITC Autopilot Bulletproof Hardening** (Phase 36) — SHIPPED 2026-11-14

Full milestone details: [REQUIREMENTS.md](.planning/REQUIREMENTS.md)

- [x] **Phase 36: GSTR-2B Inward ITC Autopilot — Bulletproof Runtime, Live Job Streaming & Cockpit Hardening** (completed 2026-11-14)
  - Unified `viewMode` (`'MONTH' | 'FULL_YEAR'`), removed mock data fallbacks, hooked live database inspection, per-month timeline indicators, and real-time step streaming.
  - Replaced blocking synchronous requests with honest **Live Autopilot Job Manager** driven by real-time async `jobId` + SSE (`GET /api/gstr2b/job-stream/:jobId`) telemetry and polling fallback while preserving visible Chromium (`headless: false`) 1-time human CAPTCHA flow.
  - Hardened backend engine across `gstr2b/autopilot.js`, `gstr2b_routes.js`, `gstr2b/db.js`, `gstr2b/parsers.js`, and `gstr2b/jobs.js`: isolated per-session download directories with path-traversal rejection, GSTIN/period validation, JSON-first download with portal summary verification, mid-loop session expiry detection, strict cancel filter (`buildStrictPeriodFilter`), canonical `"Month YYYY"` normalization (`normalizeReturnPeriod`), and portal-vs-parsed checksum guardrails (`verifyGstr2bBatchChecksum`).
  - Implemented `src/lib/gstr2bAutopilotClient.ts` with authenticated SSE reader, polling fallback, and authenticated 12-month Excel blob downloads (`downloadGstr2bFullYearExcelAuthenticated`).
  - Unit & contract test suite in `src/test/gstr2bBulletproof.test.ts` (18/18 tests green; 31/31 across all GSTR-2B suites), 0 TypeScript errors (`tsc --noEmit`), and clean production build.
  - Requirements: `G2B-BP-01` .. `G2B-BP-10`.

<details>
<summary><b>Milestone v2.4: Suite 09 — Excel to Tally XML Enterprise Suite & Automation Engine</b> (Phases 33-35) — SHIPPED 2026-11-04</summary>

Full milestone details: [REQUIREMENTS.md](.planning/REQUIREMENTS.md)

- [x] **Phase 33: Core Tally XML Generation Engine & Pre-Import Scrutiny Validator** (completed 2026-11-04)
  - Implements `src/lib/tallyXmlEngine.ts` with Dual Entry, Multi Entry (up to 150 ledgers), Quick Entry (columnar), and Masters (Ledgers) XML generator.
  - Mathematical debit/credit zero-balance check, 1-click auto-balance algorithm, and automated `fetchLedgersFromVouchers()`.
  - Comprehensive unit test suite in `src/test/tallyXmlEngine.test.ts` (23/23 tests green).
  - Requirements: `TXML-01`, `TXML-02`, `TXML-03`, `TXML-04`, `TXML-05`, `TXML-06`, `TXML-10`.

- [x] **Phase 34: Suite 09 Frontend Studio, Copy-Paste Data Grids & Action Controls** (completed 2026-11-04)
  - High-density data grid in `src/pages/TallyXmlSuite.tsx` with Excel/CSV clipboard paste parser and real-time soft-red validation.
  - Pre-import Impact Report preview table / slide-over drawer with net balance verification.
  - Dual action buttons: Offline XML download (`Vouchers.xml` / `Masters.xml`) and 1-Click direct HTTP Port 9000 push to TallyPrime with connection status HUD.
  - Unit test suite in `src/test/tallyXmlSuiteUi.test.tsx` (6/6 tests green).
  - Requirements: `TXML-07`, `TXML-08`.

- [x] **Phase 35: Enterprise App Shell Integration, Hub Navigation Card & Automated Scrutiny Tests** (completed 2026-11-04)
  - Official **SUITE 09: Excel to Tally XML Enterprise Suite** card added to `src/pages/Hub.tsx` and `src/pages/Index.tsx`.
  - Route `/tally-xml` registered in `src/App.tsx` and `Index.tsx` with `React.lazy` code-splitting and styled Suspense skeleton.
  - Production build compiled in 28.3s with `TallyXmlSuite` isolated chunk (49.67 kB).
  - 50 test files, 361 / 361 tests passing across entire codebase (100% green).
  - Requirements: `TXML-09`, `TXML-10`.

</details>

---

<details>
<summary><b>Milestone v2.3: Vaswani Return Enterprise V2.3</b> (Phases 29-32) — SHIPPED 2026-11-03</summary>

Full milestone details: [.planning/milestones/v2.3-ROADMAP.md](.planning/milestones/v2.3-ROADMAP.md)  
Requirements archive: [.planning/milestones/v2.3-REQUIREMENTS.md](.planning/milestones/v2.3-REQUIREMENTS.md)  
Milestone audit: [.planning/milestones/v2.3-MILESTONE-AUDIT.md](.planning/milestones/v2.3-MILESTONE-AUDIT.md)

- [x] **Phase 29: Landing Page Layout Transformation & Executive White Theme Modernization with UI/UX Pro Max** (completed 2026-11-01)
- [x] **Phase 30: Monthly Audit Multi-User Maker-Checker Review & Approval Workflow (Senior/Junior Firebase Collaboration)** (completed 2026-11-02)
- [x] **Phase 31: Enterprise Unified Database Persistence Suite (Suite 05 Tax Audit, Suite 06 Bank CMA & Schedule III, Suite 02 GST Reco Working Papers)** (completed 2026-11-03)
- [x] **Phase 32: Codebase Audit Remediation: Syntax, Database Security, SSRF Prevention & Lean Optimization** (completed 2026-11-03)

</details>

<details>
<summary><b>Milestone v2.2: Vaswani Return Enterprise V2.2</b> (Phases 1-28) — SHIPPED 2026-11-01</summary>

Milestone audit: [.planning/v2.2-MILESTONE-AUDIT.md](.planning/v2.2-MILESTONE-AUDIT.md)

- [x] **Phase 1: Debit Note Advanced Waterfall & Batch Solver Integration**
- [x] **Phase 2: Spreadsheet Export Modularity & Memory Optimization**
- [x] **Phase 3: Automated Scrutiny Tests & Audit Trail Hardening**
- [x] **Phase 4: GSTR-2B Downloader (Autopilot) Deep Audit & Hardening**
- [x] **Phase 5: Enterprise UI/UX Aesthetic Overhaul & Unified Persistent App Shell**
- [x] **Phase 6: Core Compliance Modules UI/UX Overhaul & Financial Cockpit Elevation**
- [x] **Phase 7: Browser Autopilot Chrome-First Architecture & Windows Client Hardening**
- [x] **Phase 8: Autopilot Runtime Execution & Production Database Hardening**
- [x] **Phase 9: Suite 04 Returns Enterprise Fluid Dashboard Layout Overhaul**
- [x] **Phase 10: Enterprise Modernized Shell & Complete Returns Dashboard 1:1 Stitch Alignment**
- [x] **Phase 11: Suite 04 Returns Complete Restructuring & Alignment with Newly Downloaded Stitch Assets**
- [x] **Phase 12: GST Notices & Orders Autonomous Suite (Autopilot Downloader, Tracker & AI Reply Drafter)**
- [x] **Phase 15: Returns Tracking Submodule (Tab 06) Integration**
- [x] **Phase 16: Returns Tracking 2-Step Architecture: Distinct Client Directory Gateway & Scoped 12M Compliance Matrix**
- [x] **Phase 17: NOTICE-SHIELD AI (Automated GST Notice Intelligence, Zero-Trust PII Sanitization & Courtroom Legal Reply Engine)**
- [x] **Phase 18: Suite 01 Practice Hub — Module 1.6 Financial Statements Engine (Schedule III Corporate & Non-Corporate ICAI 2022)**
- [x] **Phase 19: GSTR-3B Inward ITC Manual Allocation & Voucher-Level Audit Workbench**
- [x] **Phase 20: Direct Client Directory Auto-Save Architecture (Zero-Download Prompt Workflow)**
- [x] **Phase 21: GST Client Credentials Vault & Master Directory Multi-PC LAN Synchronization Engine**
- [x] **Phase 22: Sourav — Universal Gemini AI Assistant & In-App Chatbot**
- [x] **Phase 23: Central Office-Wise Gemini Cloud Distribution & Firebase License Sync**
- [x] **Phase 24: Windows Background Auto-Start & Universal Desktop AI Copilot (PC Loco Pilot)**
- [x] **Phase 25: GSTR-1 Outward Return Preparation, V2.2 Excel Export, Direct Portal JSON Engine & TaxPower Scrutiny Suite**
- [x] **Phase 26: Suite 08 — Monthly Audit Format & Working Paper Verification Suite**
- [x] **Phase 27: Executive Enterprise Light Theme Harmonization for Suites 03, 05, 06, 07 & GST Notices Suite**
- [x] **Phase 28: System Hardening, Security Safeguards & Comprehensive Bug Resolution**

</details>

## Next Milestone

Run `/gsd-new-milestone` to define the next milestone cycle.
