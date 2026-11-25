# Vaswani Return Enterprise — Module-Wise & Function-Wise Codebase Architecture

> **Clean Architecture & File Guide:** This document provides a complete, granular map of all 12 functional modules, their respective UI components, calculation engines, backend routes, background automation scripts, and database models. The repository root has been cleanly organized with all temporary logs, test dumps, and scratch scripts segregated into their dedicated directories.

---

## 🗂️ Clean Folder Structure Overview

```
reco-with-vaswani-main/
│
├── 📂 gstr1/                  # GSTR-1 Playwright Automation & Full-Year Outward Consolidator
│   ├── autopilot.js           # Headless/Headed 12-month GSTR-1 automated scraper
│   └── fullYearExcel.js       # Consolidated full-year GSTR-1 Excel generator
│
├── 📂 gstr2b/                 # GSTR-2B Playwright Automation & Inward ITC Autopilot
│   ├── autopilot.js           # Headless/Headed single-login 12-month 2B scraper
│   └── fullYearExcel.js       # 8-sheet consolidated SectionWiseSummary 2B workbook generator
│
├── 📂 notices/                # GST Notices & Orders Autonomous Scraping Suite
│   └── autopilot.js           # Playwright scraper for Section 73/74 notices & orders
│
├── 📂 logs/                   # Segregated runtime logs & background debug outputs
│   ├── stderr.log             # Standard error log
│   ├── stdout.log             # Standard output log
│   ├── server_stderr.log      # Express server error logs
│   ├── server_stdout.log      # Express server output logs
│   ├── programmatic_err.log   # Automation error logs
│   └── programmatic_out.log   # Automation standard output logs
│
├── 📂 scratch/                # Developer scratchpad, XML debug dumps & testing scripts
│   ├── tally_debug_*.xml      # Tally large XML responses (20MB+ debug dumps)
│   ├── test_*.cjs / .py       # Verification and diagnostic scripts
│   └── sample_*.xlsx          # Test outputs & temporary validation sheets
│
├── 📂 src/                    # Frontend React 18 + Vite + TypeScript Application
│   ├── components/            # Reusable UI widgets, modals, and module-specific cards
│   ├── hooks/                 # Custom React hooks (toast, mobile detection, etc.)
│   ├── lib/                   # Pure calculation engines, parsers, and API clients
│   ├── pages/                 # Full-screen module dashboards and application views
│   ├── server_lib/            # Backend tax slab models and arithmetic utilities
│   ├── test/                  # Vitest unit & integration test suites
│   └── workers/               # Web workers for background non-blocking calculation
│
├── 📂 gst_returns_data/       # Central filesystem storage for GSTR-3B client bundles
├── 📂 dist/                   # Production-compiled frontend distribution bundle
├── 📂 node_modules/           # Node.js dependencies
│
├── 📄 server.js               # Central Express.js backend server (Port 3001 (Backend) & Port 9000 (TallyPrime))
├── 📄 START_APP.bat           # 1-Click launcher script for backend, frontend, and cloud tunnel
│
├── 📄 *_routes.js             # Modular Express route handlers:
│   ├── gstr1_routes.js        # GSTR-1 scraping & export APIs
│   ├── gstr2b_routes.js       # GSTR-2B scraping, export & portal login APIs
│   ├── ims_routes.js          # GST IMS package ingestion & decision endpoints
│   ├── returns_storage_routes.js # GSTR-3B central storage & client master APIs
│   ├── notices_routes.js      # GST Notices download & reply generator APIs
│   ├── tds_routes.js          # TDS reconciliation & ledger mapping APIs
│   ├── tax_routes.js          # Income Tax computation & Form 26AS parsing APIs
│   ├── gdrive_routes.js       # Google Drive sync & cloud backup APIs
│   └── audit_trail_routes.js  # Audit log logging & retrieval APIs
│
├── 📄 *.db / *.sqlite         # SQLite relational persistence databases:
│   ├── network_data.db        # Core multi-user database (Clients, batches, notices, vouchers)
│   └── database.sqlite        # Operational cache database
│
└── 📄 Config Files            # Build & toolchain configs (package.json, vite.config.ts, tsconfig.json)
```

---

## 🏛️ Master Module Directory (12 Core Modules)

| # | Module Name | Primary UI Component | Core Engine / Lib | Backend API / Scripts | Primary DB / Storage |
|---|---|---|---|---|---|
| **1** | **GST Reco Engine (2B vs Books)** | [`Reconciliation.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/Reconciliation.tsx), [`Index.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/Index.tsx) | [`reconciliation.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts), [`reconciliation.worker.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/workers/reconciliation.worker.ts) | [`server.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/server.js) | Local cache / IndexedDB / SQLite |
| **2** | **Vendor Party-Wise Report & Dispute Hub** | [`PartyWiseReport.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/PartyWiseReport.tsx) | [`partyWise.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/partyWise.ts) | [`server.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/server.js) | In-memory aggregation |
| **3** | **Zero-Merge Excel Export Suite** | Global Export Deck | [`fileParser.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/fileParser.ts), [`fileParser.worker.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/workers/fileParser.worker.ts) | Node client streams | XLSX Workbooks (`XLSX.writeFile`) |
| **4** | **GST IMS & 2B Autopilot (12M Consolidator)** | [`ImsMasterManager.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/ImsMasterManager.tsx), [`Gstr2bMasterDownloader.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/Gstr2bMasterDownloader.tsx) | [`imsEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/imsEngine.ts), [`gstr2b/autopilot.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr2b/autopilot.js) | [`ims_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/ims_routes.js), [`gstr2b_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr2b_routes.js) | SQLite: `ims_batches`, `gstr2b_batches` |
| **5** | **GSTR-1 Downloader (Autopilot & 12M Outward)** | [`Gstr1MasterDownloader.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/Gstr1MasterDownloader.tsx) | [`gstr1/autopilot.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr1/autopilot.js), [`gstr1/fullYearExcel.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr1/fullYearExcel.js) | [`gstr1_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr1_routes.js) | SQLite: `gstr1_batches`, `gstr1_invoices` |
| **6** | **GSTR-3B Working Sheet & 12-Month FY Matrix** | [`ReturnsDashboard.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/ReturnsDashboard.tsx) | [`gstr3bEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/gstr3bEngine.ts), [`gstr3bPdf.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/gstr3bPdf.ts) | [`returns_storage_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/returns_storage_routes.js) | SQLite: `clients`, `gstr3b_returns`, `gst_returns_data/` |
| **7** | **TDS Consolidator & TRACES Reconciliation** | [`TdsReconciliation.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/TdsReconciliation.tsx) | [`tdsEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tdsEngine.ts), [`tallyApi.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tallyApi.ts) | [`tds_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/tds_routes.js) | SQLite: `tally_ledgers`, `tally_vouchers`, `tds_party_master` |
| **8** | **Tally Prime Direct XML Integration Engine** | [`TallyDirectImport.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/TallyDirectImport.tsx), [`TallyLedgerImport.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/TallyLedgerImport.tsx) | [`tallyApi.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tallyApi.ts), [`tallyXmlParser.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tallyXmlParser.ts) | Direct HTTP Port `9000` | TallyPrime Native XML Server |
| **9** | **Income Tax Liability & Regime Engine** | [`IncomeTaxDashboard.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/IncomeTaxDashboard.tsx) | [`incomeTaxEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/incomeTaxEngine.ts), [`server_lib/incomeTaxEngine.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/server_lib/incomeTaxEngine.js) | [`tax_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/tax_routes.js) | SQLite: `Taxpayer_Profiles`, `Tax_Computations` |
| **10**| **Bank CMA Appraisal & Financial Statements** | [`BankCmaAppraisal.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/BankCmaAppraisal.tsx), [`CmaReport.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/CmaReport.tsx) | [`cmaEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/cmaEngine.ts), [`tallyCmaApi.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tallyCmaApi.ts) | [`server.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/server.js) | Tally Balance Sheet / P&L XML |
| **11**| **Statutory Audit & Tax Audit Clause 44** | [`AuditModule.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/AuditModule.tsx), [`TaxAuditClause44.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/TaxAuditClause44.tsx) | [`auditEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/auditEngine.ts) | [`audit_trail_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/audit_trail_routes.js) | Tally Daybook / Clause 44 Ledgers |
| **12**| **GST Notices & Orders Autonomous Suite** | [`GstNoticesDashboard.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/GstNoticesDashboard.tsx) | [`noticeReconciliation.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/noticeReconciliation.ts), [`noticeReplyGenerator.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/noticeReplyGenerator.ts) | [`notices_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/notices_routes.js), [`notices/autopilot.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/notices/autopilot.js) | SQLite: `gst_notices`, `gst_notice_attachments` |

---

## 🔬 Detailed Module Breakdown & Function Maps

### 1. GST Reconciliation Engine (2B vs Books)
- **Primary Files:**
  - UI: [`src/pages/Reconciliation.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/Reconciliation.tsx), [`src/components/ReconciliationTable.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/ReconciliationTable.tsx), [`src/components/ResultsCategoryTabs.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/ResultsCategoryTabs.tsx)
  - Engine: [`src/lib/reconciliation.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts)
  - Background Worker: [`src/workers/reconciliation.worker.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/workers/reconciliation.worker.ts)
- **Core Functions:**
  - `cleanInvoiceNumber(inv)`: Strips non-alphanumeric noise and leading zeros.
  - `extractCoreInvoiceNumber(inv)`: Strips financial year prefixes (`24-25/`, `INV/`).
  - `normalizeGstin(gstin)`: Normalizes casing and eliminates whitespace.
  - `reconcile(...)`: Hierarchical 8-pass waterfall matching (Exact Match $\to$ Tolerance $\le$ ₹2 $\to$ Date Diff $\to$ Fuzzy Cleaned $\to$ Core Serial $\to$ Rounding $\le$ ₹1 $\to$ Cross-State PAN $\to$ Remainder).
  - `detectGstinIssues(results)`: Pinpoints vendor GSTIN mismatches and legal entity conflicts.

### 2. Vendor Party-Wise Report & Dispute Engine
- **Primary Files:**
  - UI: [`src/components/PartyWiseReport.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/PartyWiseReport.tsx)
  - Engine: [`src/lib/partyWise.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/partyWise.ts)
- **Core Functions:**
  - `aggregateByParty(results, debitNotes, groupBy)`: Consolidates transactions by GSTIN / Normalized Name and computes net tax difference.
  - 4-Pass Debit Note Reconciler: Matches debit notes by Note Number, Tax Amount ($\le$ ₹2 tolerance), and flags un-paired notes.
  - `handleAutoMatchParty(p)`: 1-click automatic reconciler for individual vendor ledgers.
  - `handleSendNotice(p, channel)`: Dispatches WhatsApp/Email communication notices for discrepancies.

### 3. Zero-Merge Excel Export Suite
- **Primary Files:**
  - Engine: [`src/lib/fileParser.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/fileParser.ts)
  - Workers: [`src/workers/fileParser.worker.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/workers/fileParser.worker.ts), [`src/workers/excelExport.worker.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/workers/excelExport.worker.ts)
- **Core Functions:**
  - `removeAllMergesFromWorkbook(wb)`: Strips any merged cells across all sheets (`ws['!merges'] = []`) to guarantee sorting, filtering, and XLOOKUP compatibility.
  - `exportToXlsx(...)`: Generates master 12-tab corporate reconciliation workbook.
  - `exportMonthlyDiffSheets(...)`: Exports 12 separate monthly difference sheets.
  - `exportMonthlyComparison(...)`: Generates side-by-side 6-table FY tax matrix.

### 4. GST IMS & GSTR-2B Autopilot (12M Consolidator)
- **Primary Files:**
  - UI: [`src/components/ImsMasterManager.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/ImsMasterManager.tsx), [`src/components/Gstr2bMasterDownloader.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/Gstr2bMasterDownloader.tsx)
  - Engine & Autopilot: [`src/lib/imsEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/imsEngine.ts), [`gstr2b/autopilot.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr2b/autopilot.js), [`gstr2b/fullYearExcel.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr2b/fullYearExcel.js)
  - Routes: [`ims_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/ims_routes.js), [`gstr2b_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr2b_routes.js)
- **Core Functions:**
  - `runGstr2bAutopilot`: 1-login 12-month automated download loop using Playwright with error tolerance.
  - `openPortalLoginHelper`: Opens portal browser session and auto-fills username and password with 800ms Angular-safe event delays.
  - `generateGstr2bFullYearWorkbook`: Compiles 8-sheet consolidated SectionWiseSummary workbook.

### 5. GSTR-1 Downloader (Autopilot & 12M Outward)
- **Primary Files:**
  - UI: [`src/components/Gstr1MasterDownloader.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/Gstr1MasterDownloader.tsx), [`src/components/OutputReconciliation.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/OutputReconciliation.tsx)
  - Automation & Export: [`gstr1/autopilot.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr1/autopilot.js), [`gstr1/fullYearExcel.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr1/fullYearExcel.js)
  - Routes: [`gstr1_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr1_routes.js)
- **Core Functions:**
  - `runGstr1Autopilot`: Automates 12-month GSTR-1 downloads from GST portal.
  - `executeOutputReconciliation`: Reconciles Sales Daybook against GSTR-1 outward filing.

### 6. GSTR-3B Working Sheet, 12-Month FY Matrix & Returns Compliance Tracker
- **Primary Files:**
  - UI: [`src/pages/ReturnsDashboard.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/ReturnsDashboard.tsx), [`src/components/ReturnsTrackingMaster.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/ReturnsTrackingMaster.tsx), [`src/components/Gstr3bWorkingSheet.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/Gstr3bWorkingSheet.tsx), [`src/components/FyMatrixView.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/FyMatrixView.tsx)
  - Engine: [`src/lib/gstr3bEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/gstr3bEngine.ts), [`src/lib/gstr3bPdf.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/gstr3bPdf.ts)
  - Routes: [`returns_storage_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/returns_storage_routes.js) (with endpoints `GET /api/returns/tracking-data`, `POST /api/returns/save-tracking-record`, `POST /api/returns/sync-portal-tracking`)
- **Core Functions:**
  - `calculateGstr3bMonth`: Implements Section 49(5) automatic ITC utilization rules (IGST $\to$ CGST $\to$ SGST).
  - `exportGstr3bMonthPdf`: Generates official GSTN audit-grade statement PDF.
  - `saveFullBundle`: Bundles Excel, PDF, and JSON directly to centralized shared storage.
  - `ReturnsTrackingMaster`: Dual-mode compliance cockpit (Mode A: All-Clients Cockpit + Mode B: Single-Client 12M Matrix), live statutory deadline alerts (Rule 59 11th, Rule 61 20th), ₹50/day late fee & 18% interest estimation, manual ARN/date override, and Zero-Merge Excel audit export.

### 7. TDS Consolidator & TRACES Reconciliation
- **Primary Files:**
  - UI: [`src/pages/TdsReconciliation.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/TdsReconciliation.tsx)
  - Engine: [`src/lib/tdsEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tdsEngine.ts)
  - Routes: [`tds_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/tds_routes.js)
- **Core Functions:**
  - `reconcileTdsRecords`: Reconciles Form 26AS/AIS against Tally books.
  - `evaluateTdsCompliance`: Verifies compliance across sections 194C, 194J, 194Q, and 194I with threshold limits.

### 8. Tally Prime Direct XML Integration Engine
- **Primary Files:**
  - UI: [`src/pages/TallyDirectImport.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/TallyDirectImport.tsx), [`src/pages/TallyLedgerImport.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/TallyLedgerImport.tsx), [`src/pages/TallyConverter.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/TallyConverter.tsx)
  - Engine: [`src/lib/tallyApi.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tallyApi.ts), [`src/lib/tallyXmlParser.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tallyXmlParser.ts)
- **Core Functions:**
  - `fetchTallyVouchers`: Dispatches XML envelope requests to TallyPrime port 9000.
  - `parseTallyXml`: Decodes native UTF-16/UTF-8 XML payloads into structured voucher arrays.

### 9. Income Tax Liability & Regime Engine
- **Primary Files:**
  - UI: [`src/pages/IncomeTaxDashboard.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/IncomeTaxDashboard.tsx)
  - Engine: [`src/lib/incomeTaxEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/incomeTaxEngine.ts), [`src/server_lib/incomeTaxEngine.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/server_lib/incomeTaxEngine.js)
  - Routes: [`tax_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/tax_routes.js)
- **Core Functions:**
  - `computeTaxLiability`: Evaluates Old Regime vs New Regime (Section 115BAC) with Rebate 87A and marginal relief.
  - `generateTaxComputationExcel`: Live formula-based spreadsheet export.

### 10. Bank CMA Appraisal & Financial Statements
- **Primary Files:**
  - UI: [`src/pages/BankCmaAppraisal.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/BankCmaAppraisal.tsx), [`src/pages/CmaReport.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/CmaReport.tsx)
  - Engine: [`src/lib/cmaEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/cmaEngine.ts), [`src/lib/tallyCmaApi.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tallyCmaApi.ts)
- **Core Functions:**
  - `calculateCmaMetrics`: Evaluates Working Capital limits (MPBF Method I & II), DSCR, Current Ratio, and Fund Flow statement.
  - `exportCmaWorkbook`: Generates bank-format credit appraisal workbook.

### 11. Statutory Audit & Tax Audit Clause 44
- **Primary Files:**
  - UI: [`src/pages/AuditModule.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/AuditModule.tsx), [`src/pages/TaxAuditClause44.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/TaxAuditClause44.tsx)
  - Engine: [`src/lib/auditEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/auditEngine.ts)
  - Routes: [`audit_trail_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/audit_trail_routes.js)
- **Core Functions:**
  - `computeClause44Breakdown`: Categorizes business expenditures into Registered Entities, Unregistered Entities, and Composite Entities for Form 3CD reporting.

### 12. GST Notices & Orders Autonomous Suite
- **Primary Files:**
  - UI: [`src/pages/GstNoticesDashboard.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/GstNoticesDashboard.tsx)
  - Engine: [`src/lib/noticeReconciliation.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/noticeReconciliation.ts), [`src/lib/noticeReplyGenerator.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/noticeReplyGenerator.ts)
  - Scraper & Routes: [`notices/autopilot.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/notices/autopilot.js), [`notices_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/notices_routes.js)
- **Core Functions:**
  - `reconcileNoticeDiscrepancies`: Cross-checks DRC-01 / ASMT-10 demands against GSTR-1, GSTR-2B, and GSTR-3B filings.
  - `generateAutonomousNoticeReply`: Drafts legal replies with statutory citations and annexures.
  - `runNoticesAutopilot`: Automated Playwright scraper downloading notice documents and attachments.
