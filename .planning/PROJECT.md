# Vaswani Return Enterprise (Audit With Vaswani)

## What This Is

Vaswani Return Enterprise is an enterprise-grade desktop and LAN-enabled tax compliance, audit scrutiny, and reconciliation platform designed for Chartered Accountants, Tax Consultants, and Corporate Accounts Teams. It automates high-volume GST reconciliation (Purchase Register vs GSTR-2B), autonomous 12-month return consolidation, Invoice Management System (IMS) action management, TRACES TDS matching, TallyPrime direct XML synchronization, and statutory audit reporting.

## Core Value

Audit-grade, high-precision reconciliation and statutory tax computation that eliminates double-counting, strictly guarantees zero merged cells in analytical workbooks, and runs completely locally and securely.

## Business Context

- **Customer**: Chartered Accountants, Tax Practitioners, Corporate Finance Heads, and Enterprise Accounting Teams
- **Value Proposition**: Replaces tedious manual spreadsheet matching with multi-pass waterfall matching, autonomous portal downloading, and instant vendor dispute communication
- **Success Metric**: 100% mathematical reconciliation parity between books and statutory portals with zero manual cell alignment
- **Distribution**: Packaged Electron Windows Desktop Application and Local Office LAN Server

## Requirements

### Validated

- [x] Multi-pass GST Inward Reconciliation (Pass 1 Exact to Pass 8 Unmatched)
- [x] Vendor Party-Wise Aggregation & Communication Hub (WhatsApp/Email notices)
- [x] Audit-Grade Zero-Merge Excel Export Suite (`ws['!merges'] = []`)
- [x] Autonomous 12-Month GSTR-1 & GSTR-2B Autopilot Loops (Single-login Playwright session)
- [x] Oct 2024 GST IMS (Invoice Management System) Ingestion & Action Manager
- [x] GSTR-3B Working Papers, Tax Offset Engine, and Client PDF Summary Generator
- [x] TDS Consolidator & TRACES / Form 26AS Scrutiny Engine
- [x] TallyPrime Direct XML HTTP Integration (Port 9000)
- [x] Dual-Regime Income Tax Liability Calculator (Old vs New Regime)
- [x] CMA Bank Appraisal & Financial Statement Projections
- [x] Tax Audit Clause 44 Expenditure Classification

### Active (Ingested from Technical Specification)

- [ ] **DN-01**: 6-Pass Waterfall Reconciliation Pipeline for Debit/Credit Notes
- [ ] **DN-02**: 1-to-Many Consolidated Batch Solver (Date-Cluster & Subset-Sum Solver $2 \le |S| \le 15$)
- [ ] **DN-03**: Composite Invoice Number Detection Guardrail
- [ ] **DN-04**: Robust Normalization, Negative Accounting Parentheses, & Supplier Name Resolution
- [ ] **DN-05**: Standardized 21-Column Reconciled Register with Zero Double-Counting Lead/Grouped Rows

### Out of Scope

- Cloud SaaS hosting of financial ledgers — Client financial data must remain strictly on local machines or local LAN storage.
- Auto-filing tax returns directly without taxpayer verification — The system prepares audit-ready working papers; filing submission requires authorized practitioner sign-off.

## Context

- **Technical Environment**: React 18, TypeScript, Vite, Tailwind CSS, Radix UI, Express, SQLite3, Electron, Playwright.
- **Accounting Invariant**: Every input PR and 2B record must be accounted for exactly once in column sums ($\sum \text{Reconciled} = \sum \text{Raw Input}$).
- **Spreadsheet Usability**: Strict Zero-Merge rule across all exported Excel files to ensure column sorting, filtering, and `XLOOKUP` formulas never fail.

## Constraints

- **Architecture**: Strict Zero-Merge Architecture (`ws['!merges'] = []` across all sheets).
- **Security**: Local-first processing with zero external leakage of sensitive corporate accounting ledgers.
- **Tolerance**: Matching tolerance strictly bounded to $\le$ ₹2 for rounding differences; larger variances tagged as `Value Mismatch`.
- **Portal Autopilot**: Autonomous 12-month downloading must maintain authenticated browser session without prompting repeatedly for CAPTCHA.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Strict Zero-Merge Architecture | Merged cells permanently break Excel sorting, filtering, and formula lookups | ✓ Good |
| Web Worker Offloading | Reconciling 50,000+ invoices on the React main thread locks the UI | ✓ Good |
| Embedded SQLite Persistence | Serverless, portable, and zero-configuration local database for multi-year batches | ✓ Good |
| Lead Row + Grouped Sub-Rows Pattern | Ensures 1-to-many batch matches display all 2B rows while preventing grand-total double counting | ✓ Good |
| Localhost Tally XML Integration | Direct socket communication with TallyPrime without cloud middleware | ✓ Good |

---
*Last updated: 2026-10-22 after doc ingest of gst_debit_note_reconciliation_engine_spec.md*
