# Phase 31: Enterprise Unified Database Persistence Suite — Context

## User Intent & Requirements
- **Goal:** Create robust, audit-grade SQLite database persistence for all suites/modules that currently lack permanent backend storage (similar to the enterprise SQLite architecture used in GST & TDS Engine, Returns Dashboard, and Monthly Audit Suite).
- **Core Problem Solved:** Previously, Form 3CD Clause 44 Spend, Dual Depreciation Schedules, SA 530 Monetary Unit Sampling, Bank CMA Projections, and GST Reco Runs were ephemeral in React memory or capped by 5MB browser `localStorage`. Refreshing or switching clients caused data loss and required re-uploading files.
- **Architectural Directives:**
  1. **Single Unified SQLite Database (`network_data.db`):** All new audit working paper tables reside in the central `network_data.db` managed by Express backend, enabling LAN multi-user sharing, automated WAL journaling, and single-file backup.
  2. **Explicit 'Save Working Paper / Computation' Action:** User explicitly commits data via clear, high-contrast action buttons ("Save Clause 44 Working Paper", "Save Depreciation Schedule", "Save CMA Projections", "Save Reco Run").
  3. **Auto-Load & History:** Selecting a Client and Financial Year instantly retrieves saved working papers with timestamps, revision metadata, and restore capabilities.

## Architecture & Existing Database Analysis

### Existing Persistent Modules
- **Suite 02 (TDS Consolidator):** Fully persistent in SQLite via `tds_routes.js` (`TDS_Rules`, `Tally_Ledgers`, `Party_Masters`, `Tally_Transactions`, `Recon_Results`).
- **Suite 04 (Returns Suite):** Fully persistent in SQLite via `ims_routes.js`, `gstr2b/db.js`, `gstr1/db.js`, `returns_storage_routes.js` (`ims_batches`, `gstr2b_invoices`, `gstr1_batches`, `gstr3b_month_locks`, etc.).
- **Suite 08 (Monthly Audit Suite):** Fully persistent in SQLite via `monthly_audit_routes.js` (`monthly_audits`, `audit_checklists`, `audit_observations`, `audit_pending_points`, `audit_verification_data`) with Firebase Firestore cloud mirroring.
- **GST Notices Autonomous Suite:** Fully persistent in SQLite via `notices/db.js` (`gst_notices`, `gst_notice_attachments`, `gst_notice_replies`).

### Modules Requiring Database Persistence in Phase 31
1. **Suite 05: Form 3CD Clause 44 Spend Breakdown** (`src/pages/TaxAuditClause44.tsx`)
   - Needs table: `audit_clause44_records`
2. **Suite 05: Dual Depreciation & DTA/DTL Schedule** (`src/pages/DepreciationModule.tsx`)
   - Needs table: `audit_depreciation_assets`
3. **Suite 05: SA 530 Monetary Unit Sampling** (`src/pages/AuditModule.tsx`)
   - Needs table: `audit_sa530_samples`
4. **Suite 06: Bank CMA Appraisal & MPBF Method II** (`src/pages/BankCmaAppraisal.tsx`)
   - Needs table: `cma_appraisals`
5. **Suite 06: Schedule III & Non-Corporate Financial Statements** (`src/lib/finStatements.storage.ts` & `src/pages/FinancialStatements.tsx`)
   - Needs table: `financial_statements_workspaces` (Migrate from 5MB `localStorage` to SQLite)
6. **Suite 02: Core GST Reconciliation History (PR vs 2B)** (`src/pages/Reconciliation.tsx`)
   - Needs table: `gst_reconciliation_runs`
