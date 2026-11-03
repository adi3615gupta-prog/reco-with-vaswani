# Vaswani Return Enterprise (Audit With Vaswani)

## What This Is

Vaswani Return Enterprise is an enterprise-grade desktop and LAN-enabled tax compliance, audit scrutiny, and reconciliation platform designed for Chartered Accountants, Tax Consultants, and Corporate Accounts Teams. It automates high-volume GST reconciliation (Purchase Register vs GSTR-2B), autonomous 12-month return consolidation, Invoice Management System (IMS) action management, GSTR-1 preparation & offline JSON generation, TRACES TDS matching, TallyPrime direct XML synchronization, Schedule III Financial Statements, Bank CMA Appraisal, Form 3CD Clause 44 Tax Audit, Suite 08 Monthly Audit with multi-user Maker-Checker cloud review, and universal background desktop AI companionship (Sourav AI / PC Loco Pilot).

## Core Value

Audit-grade, high-precision reconciliation and statutory tax computation that eliminates double-counting, strictly guarantees zero merged cells in analytical workbooks, and runs completely locally and securely.

## Business Context

- **Customer**: Chartered Accountants, Tax Practitioners, Corporate Finance Heads, and Enterprise Accounting Teams
- **Value Proposition**: Replaces tedious manual spreadsheet matching with multi-pass waterfall matching, autonomous portal downloading, unified SQLite persistence, multi-user maker-checker reviews, and instant vendor dispute communication
- **Success Metric**: 100% mathematical reconciliation parity between books and statutory portals with zero manual cell alignment and zero circular dependencies
- **Distribution**: Packaged Electron Windows Desktop Application and Local Office LAN Server

## Requirements

### Validated

- ✓ Multi-pass GST Inward Reconciliation (Pass 1 Exact to Pass 8 Unmatched) — v1.0
- ✓ 6-Pass Waterfall Reconciliation Pipeline for Debit/Credit Notes (DN-01 to DN-05) — v2.0
- ✓ 1-to-Many Consolidated Batch Solver (Subset-Sum $2 \le |S| \le 15$) — v2.0
- ✓ Vendor Party-Wise Aggregation & Dispute Hub (WhatsApp/Email notices) — v1.0
- ✓ Strict Zero-Merge Excel Export Suite (`ws['!merges'] = []`) — v1.0 / v2.0
- ✓ Autonomous 12-Month GSTR-1 & GSTR-2B Autopilot Loops (Single-login Playwright session) — v2.0
- ✓ Oct 2024 GST IMS (Invoice Management System) Ingestion & Action Manager — v2.1
- ✓ GSTR-3B Working Papers, Table 4 ITC Allocation Workbench, and Auto-Save Architecture — v2.1
- ✓ TDS Consolidator & TRACES / Form 26AS Scrutiny Engine — v2.0
- ✓ TallyPrime Direct XML HTTP Integration (Port 9000) — v1.0
- ✓ Dual-Regime Income Tax Liability Calculator (Old vs New Regime) — v2.0
- ✓ CMA Bank Appraisal & Financial Statement Projections — v2.0
- ✓ Schedule III Financial Statements Engine (Corporate & Non-Corporate ICAI 2022) — v2.1
- ✓ Form 3CD Tax Audit Clause 44 Expenditure Classification — v2.1
- ✓ GST Notices & Orders Autonomous Suite (NOTICE-SHIELD AI & Courtroom Reply Drafter) — v2.1
- ✓ Multi-PC LAN Credentials Synchronization Engine (Central Clients Vault) — v2.1
- ✓ Sourav — Universal Gemini AI Assistant & Windows Background Loco Pilot (`Ctrl+Alt+S`) — v2.2
- ✓ Central Office-Wise Gemini Cloud Distribution & Firebase License Sync — v2.2
- ✓ Suite 08 Monthly Audit Format & Working Paper Verification Suite — v2.2
- ✓ Executive Enterprise Light Theme Harmonization across all modules — v2.2
- ✓ System Hardening, SQLite WAL Mode, and Concurrency Architecture — v2.2
- ✓ Executive White Theme Landing Page Transformation with UI/UX Pro Max (LAND-01 to LAND-06) — v2.3
- ✓ Monthly Audit Multi-User Maker-Checker Review & Approval Workflow (AUDIT-MC-01 to AUDIT-MC-05) — v2.3
- ✓ Enterprise Unified Database Persistence Suite across all suites (DB-SCHEMA-01 to DB-TESTS-01) — v2.3
- ✓ Codebase Audit Remediation: Syntax, Transaction Rollback, Credential Privacy & SSRF Prevention — v2.3
- ✓ Route-Level Code Splitting (`React.lazy`), Zero Circular Dependencies, and UI Review Polish — v2.3

### Active

(None currently active — milestone v2.3 complete. Next milestone goals to be defined via `/gsd-new-milestone`.)

### Out of Scope

- Cloud SaaS hosting of raw financial ledgers — Client financial data must remain strictly on local machines or local LAN storage.
- Auto-filing tax returns directly without taxpayer verification — The system prepares audit-ready working papers; filing submission requires authorized practitioner sign-off.
- Merged cells in analytical spreadsheets — Merged cells permanently break column sorting, AutoFilters, and lookup formulas.

## Context

- **Codebase Health**: 47 test suites, 319 / 319 tests green, clean production build in 46.92s with zero circular dependency warnings.
- **Technical Stack**: React 18, TypeScript, Vite, Tailwind CSS, Radix UI, Express, SQLite3 (WAL mode), Electron, Playwright, Firebase Firestore.
- **Accounting Invariant**: Every input PR and 2B record must be accounted for exactly once in column sums ($\sum \text{Reconciled} = \sum \text{Raw Input}$).
- **Spreadsheet Usability**: Strict Zero-Merge rule (`ws['!merges'] = []`) across all exported Excel files to ensure column sorting, filtering, and `XLOOKUP` formulas never fail.

## Constraints

- **Architecture**: Strict Zero-Merge Architecture (`ws['!merges'] = []` across all sheets).
- **Security**: Local-first processing with zero external leakage of sensitive corporate accounting ledgers; parameterized SQL; SSRF protection.
- **Tolerance**: Matching tolerance strictly bounded to $\le$ ₹2 for rounding differences; larger variances tagged as `Value Mismatch`.
- **Portal Autopilot**: Autonomous 12-month downloading must maintain authenticated browser session without prompting repeatedly for CAPTCHA.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Strict Zero-Merge Architecture | Merged cells permanently break Excel sorting, filtering, and formula lookups | ✓ Good |
| Web Worker Offloading | Reconciling 50,000+ invoices on the React main thread locks the UI | ✓ Good |
| Embedded SQLite Persistence (WAL) | Serverless, portable, zero-configuration local database for multi-year batches with concurrency | ✓ Good |
| Lead Row + Grouped Sub-Rows Pattern | Ensures 1-to-many batch matches display all 2B rows while preventing grand-total double counting | ✓ Good |
| Localhost Tally XML Integration (Port 9000) | Direct socket communication with TallyPrime without cloud middleware | ✓ Good |
| Executive Light Theme Standard | Replaces dark obsidian styling with high-contrast slate typography and crisp white cards | ✓ Good |
| Maker-Checker Cloud Review via Firestore | Real-time Junior/Senior CA audit review pipeline with digital sign-off and revision drawers | ✓ Good |
| Unified `network_data.db` Persistence | Eliminates ephemeral state across Clause 44, CMA, Schedule III, and Reco history | ✓ Good |
| Route-Level Code Splitting (`React.lazy`) | Breaks down monolithic bundle into on-demand route chunks with styled Suspense skeletons | ✓ Good |

---
*Last updated: 2026-11-03 after v2.3 milestone completion*
