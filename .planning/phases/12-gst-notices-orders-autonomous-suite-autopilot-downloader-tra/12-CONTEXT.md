# Phase 12: GST Notices & Orders Autonomous Suite (Autopilot Downloader, Tracker & AI Reply Drafter) - Context

## 1. Executive Summary & Intent
Deliver a comprehensive, audit-grade GST notices and orders management suite for Indian tax practitioners and corporate accounts teams:
- **1-Login Autonomous Portal Scraping**: Automatically navigate to all 3 portal locations:
  1. `Services > User Services > View Notices and Orders` (Registration, cancellation, assessment orders)
  2. `Services > User Services > View Additional Notices/Orders` (ASMT-10 scrutiny notices, DRC-01/01A show cause notices, DRC-07 summary orders)
  3. `Services > Returns > Return Compliance` (DRC-01B liability mismatch & DRC-01C ITC mismatch)
  Download all notice metadata, PDF files, and zip attachments into local storage.
- **Limitation & Hearing Calendar HUD**: Automatic countdown tracking 7-day deadlines (DRC-01B/C) and 30-day statutory deadlines (ASMT-10, DRC-01) with urgent priority color badges (Red < 3 days, Amber < 7 days, Emerald > 7 days) to prevent ex-parte orders.
- **Deterministic Multi-Return Cross-Reconciler**: Cross-query existing local SQLite tables (`gstr2b_invoices`, `gstr1_invoices`, `gstr3b_returns`, Purchase Register) against notice demand figures to isolate the exact reason for variance:
  - Timing difference (supplier filed in subsequent tax period)
  - Section 16(4) time-bar relief under newly enacted retrospective Subsections (5) and (6) (Finance (No. 2) Act 2024 / Circular 211/2024-GST)
  - Credit note adjustments / RCM liability misclassifications
  - Produce certified Zero-Merge analytical reconciliation Excel annexures (`ws['!merges'] = []`).
- **Dual-Engine Legal Reply Drafter**:
  - Structured statutory templates for Form GST ASMT-11 (reply to ASMT-10), Form GST DRC-06 (reply to DRC-01 SCN), DRC-01A Part B, and DRC-01B/C Part B.
  - AI prompt integration combining factual mathematical proof with statutory provisions (Sections 16, 61, 73, 74, 128A Amnesty waiver) and case law citations.
  - Export to clean printable HTML, PDF, or Word documents ready for portal submission.
- **Enterprise Obsidian Glass Dashboard**: High-density UI matching the app shell with notice inspection drawer, PDF viewer, countdown calendar, and 1-click legal reply workflow.

## 2. Invariance & Non-Negotiable Core Rules
1. **Zero-Merge Architecture**: Any exported reconciliation workbooks or notice annexures must strictly strip all cell merges (`ws['!merges'] = []`) via `removeAllMergesFromWorkbook(wb)`.
2. **Golden Rule Data Safety**: Downloading new notices must never overwrite, truncate, or delete previously downloaded notices or manual notes upon portal timeout or error.
3. **No URL Pushing on Portal**: Avoid `page.goto` to internal return/notice dashboard URLs to prevent portal SSO "Access Denied" errors. Navigation must strictly use authentic in-page DOM menu clicks.
4. **On-Screen Back Button**: Returns search screens must return to dashboard via official `<button>` elements with exact text `'BACK'`, strictly avoiding anchor tags (`<a>`) or browser history pops.
5. **Local Data Security**: All downloaded notice PDFs, extracted text, and taxpayer records reside strictly on the local machine in SQLite. No client financial data is transmitted to unauthorized external clouds.
6. **Tabular Monospace Standard**: Tabular monospaced figures (`font-mono`) for all financial amounts, GSTINs, DINs, and notice reference numbers.
