# Phase 31: Enterprise Unified Database Persistence Suite — Research & Schema Design

## 1. Schema Specifications (Stored in `network_data.db`)

### Table 1: `audit_clause44_records`
```sql
CREATE TABLE IF NOT EXISTS audit_clause44_records (
  id TEXT PRIMARY KEY,
  client_gstin TEXT NOT NULL,
  client_name TEXT NOT NULL,
  fy TEXT NOT NULL,
  total_spend REAL DEFAULT 0,
  registered_spend REAL DEFAULT 0,
  unregistered_spend REAL DEFAULT 0,
  exempt_spend REAL DEFAULT 0,
  composition_spend REAL DEFAULT 0,
  vouchers_json TEXT NOT NULL, -- Compressed / full voucher breakdown
  summary_json TEXT,           -- Group-level spend analysis
  saved_by TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(client_gstin, fy)
);
CREATE INDEX IF NOT EXISTS idx_clause44_client_fy ON audit_clause44_records(client_gstin, fy);
```

### Table 2: `audit_depreciation_assets`
```sql
CREATE TABLE IF NOT EXISTS audit_depreciation_assets (
  id TEXT PRIMARY KEY,
  client_gstin TEXT NOT NULL,
  client_name TEXT NOT NULL,
  fy TEXT NOT NULL,
  asset_blocks_json TEXT NOT NULL, -- Asset blocks with opening, additions >180d, additions <180d, deletions, rates
  total_it_depreciation REAL DEFAULT 0,
  total_co_depreciation REAL DEFAULT 0,
  timing_difference REAL DEFAULT 0,
  dta_dtl_balance REAL DEFAULT 0,
  saved_by TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(client_gstin, fy)
);
CREATE INDEX IF NOT EXISTS idx_depr_client_fy ON audit_depreciation_assets(client_gstin, fy);
```

### Table 3: `audit_sa530_samples`
```sql
CREATE TABLE IF NOT EXISTS audit_sa530_samples (
  id TEXT PRIMARY KEY,
  client_gstin TEXT NOT NULL,
  client_name TEXT NOT NULL,
  fy TEXT NOT NULL,
  audit_area TEXT NOT NULL,       -- e.g. "Purchases", "Expenses", "Debtors"
  population_count INTEGER DEFAULT 0,
  population_value REAL DEFAULT 0,
  sampling_interval REAL DEFAULT 0,
  tolerable_misstatement REAL DEFAULT 0,
  sample_count INTEGER DEFAULT 0,
  sample_vouchers_json TEXT NOT NULL,
  auditor_remarks TEXT,
  saved_by TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sa530_client_fy ON audit_sa530_samples(client_gstin, fy);
```

### Table 4: `cma_appraisals`
```sql
CREATE TABLE IF NOT EXISTS cma_appraisals (
  id TEXT PRIMARY KEY,
  client_gstin TEXT NOT NULL,
  client_name TEXT NOT NULL,
  fy TEXT NOT NULL,
  projection_years_json TEXT NOT NULL, -- List of years e.g. ['2023-24', '2024-25', '2025-26']
  pnl_data_json TEXT NOT NULL,         -- Sales, Raw Material, Operating Cost, PBT, PAT
  balance_sheet_json TEXT NOT NULL,    -- Current Assets, Current Liab, Net Worth, Debt
  mpbf_method1 REAL DEFAULT 0,
  mpbf_method2 REAL DEFAULT 0,
  ratios_json TEXT NOT NULL,           -- Current ratio, DSCR, TOL/TNW, etc.
  qualitative_notes TEXT,
  saved_by TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(client_gstin, fy)
);
CREATE INDEX IF NOT EXISTS idx_cma_client_fy ON cma_appraisals(client_gstin, fy);
```

### Table 5: `financial_statements_workspaces`
```sql
CREATE TABLE IF NOT EXISTS financial_statements_workspaces (
  id TEXT PRIMARY KEY,
  client_gstin TEXT NOT NULL,
  client_name TEXT NOT NULL,
  fy TEXT NOT NULL,
  taxonomy_type TEXT NOT NULL, -- 'SCHEDULE_III_CORPORATE' | 'ICAI_NON_CORPORATE'
  tb_entries_json TEXT NOT NULL,
  note_aggregates_json TEXT,
  fixed_assets_json TEXT,
  partners_capital_json TEXT,
  disclosures_json TEXT,
  saved_by TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(client_gstin, fy, taxonomy_type)
);
CREATE INDEX IF NOT EXISTS idx_fs_client_fy ON financial_statements_workspaces(client_gstin, fy);
```

### Table 6: `gst_reconciliation_runs`
```sql
CREATE TABLE IF NOT EXISTS gst_reconciliation_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT UNIQUE NOT NULL,
  client_gstin TEXT NOT NULL,
  client_name TEXT NOT NULL,
  fy TEXT NOT NULL,
  return_period TEXT NOT NULL, -- e.g. "Full Year 2025-26" or "October 2025"
  books_records_count INTEGER DEFAULT 0,
  twob_records_count INTEGER DEFAULT 0,
  matched_count INTEGER DEFAULT 0,
  mismatch_count INTEGER DEFAULT 0,
  missing_in_2b_count INTEGER DEFAULT 0,
  missing_in_books_count INTEGER DEFAULT 0,
  tolerance REAL DEFAULT 2.0,
  summary_json TEXT NOT NULL,
  matched_records_json TEXT NOT NULL,
  vendor_disputes_json TEXT,
  saved_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reco_client_fy ON gst_reconciliation_runs(client_gstin, fy);
```

---

## 2. API Routes Architecture (`audit_storage_routes.js`)
Dedicated Express router mounted at `/api/audit-storage` in `server.js` and `server.cjs`:
- `POST /api/audit-storage/clause44/save`
- `GET  /api/audit-storage/clause44/:gstin/:fy`
- `POST /api/audit-storage/depreciation/save`
- `GET  /api/audit-storage/depreciation/:gstin/:fy`
- `POST /api/audit-storage/sa530/save`
- `GET  /api/audit-storage/sa530/:gstin/:fy`
- `POST /api/audit-storage/cma/save`
- `GET  /api/audit-storage/cma/:gstin/:fy`
- `POST /api/audit-storage/fin-statements/save`
- `GET  /api/audit-storage/fin-statements/:gstin/:fy`
- `POST /api/audit-storage/reco-runs/save`
- `GET  /api/audit-storage/reco-runs/:gstin/:fy`
- `GET  /api/audit-storage/reco-runs/detail/:runId`
- `DELETE /api/audit-storage/reco-runs/:runId`
