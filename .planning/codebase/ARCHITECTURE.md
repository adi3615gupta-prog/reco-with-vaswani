---
last_mapped_commit: 2767eb1c5944b9af02382e532c64119f7847f32a
last_mapped_at: 2026-10-22
---
<!-- refreshed: 2026-10-22 -->

# Architecture

**Analysis Date:** 2026-10-22

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                        Electron Desktop Shell                           │
│                       `main.cjs` / `preload.js`                         │
├────────────────────────────────────┬────────────────────────────────────┤
│           Frontend UI Layer        │         Web Worker Threads         │
│          React 18 + Vite + TS      │  `src/workers/reconciliation.worker`│
│   `src/pages/` & `src/components/` │  `src/workers/fileParser.worker`   │
└──────────────────┬─────────────────┴──────────────────┬─────────────────┘
                   │                                    │
                   ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Core Business Engine Layer                          │
│     `src/lib/reconciliation.ts`        `src/lib/partyWise.ts`           │
│     `src/lib/fileParser.ts`            `src/lib/imsEngine.ts`           │
│     `src/lib/tdsEngine.ts`             `src/lib/incomeTaxEngine.ts`     │
│     `src/lib/tallyApi.ts`              `src/lib/cmaEngine.ts`           │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ HTTP / REST / IPC
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Express Backend Server (`server.js`)                 │
│      Port 3001 (or proxied via Vite/Localtunnel on Port 8080)           │
│                                                                         │
│  `gstr1_routes.js`     `gstr2b_routes.js`       `ims_routes.js`         │
│  `tds_routes.js`       `tax_routes.js`          `gdrive_routes.js`      │
│  `returns_storage_routes.js`                                            │
└───────────┬───────────────────────┬──────────────────────┬──────────────┘
            │                       │                      │
            ▼                       ▼                      ▼
┌────────────────────────┐  ┌────────────────┐  ┌─────────────────────────┐
│   Local SQLite DBs     │  │  Tally XML API │  │ GST Portal Autopilot    │
│ `returns.db`, `gstr1.db`│  │ (Port 9000)    │  │ Playwright Headless     │
│ `gstr2b.db`            │  │ `tallyApi.ts`  │  │ `gstr1/` & `gstr2b/`    │
└────────────────────────┘  └────────────────┘  └─────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Electron Main Process | App lifecycle, native menus, window creation, background node server spawn | `main.cjs` |
| Express App & Dispatcher | Central REST API server routing modules and database initialization | `server.js` |
| GST Reco Multi-Pass Engine | 8-pass waterfall invoice matching between Books (PR) and Portal (2B) | `src/lib/reconciliation.ts` |
| Reconciliation Web Worker | Off-thread multi-pass reconciliation avoiding UI freezes on 100k+ rows | `src/workers/reconciliation.worker.ts` |
| Vendor Party-Wise Aggregator | Vendor dispute consolidation, 4-pass debit note pairing, communication notices | `src/lib/partyWise.ts` |
| Zero-Merge Excel Generator | Audit-grade spreadsheet generator strictly enforcing 0 merged cells | `src/lib/fileParser.ts` |
| GSTR-1 Autopilot & Consolidator | Automated 12-month GSTR-1 downloading, SQLite ingestion, and 8-sheet export | `gstr1/autopilot.js`, `gstr1_routes.js` |
| GSTR-2B Autopilot & Consolidator | Autonomous 12-month GSTR-2B download and consolidated matrix generator | `gstr2b/autopilot.js`, `gstr2b_routes.js` |
| Invoice Management System (IMS) | Oct 2024 IMS inward supply action tracking (`ACCEPT`, `REJECT`, `PENDING`) | `src/lib/imsEngine.ts`, `ims_routes.js` |
| GSTR-3B Working Paper Engine | Tax offset matrix computation, FY comparison, and client PDF report generator | `src/lib/gstr3bEngine.ts`, `src/lib/gstr3bPdf.ts` |
| TDS TRACES Reconciler | Form 26AS / AIS / TRACES vs Tally ledger comparison and rate auditing | `src/lib/tdsEngine.ts`, `tds_routes.js` |
| Tally Direct XML Communicator | Native HTTP XML request builder connecting to TallyPrime port 9000 | `src/lib/tallyApi.ts`, `src/lib/tallyCmaApi.ts` |
| CMA Bank Appraisal Engine | Balance Sheet restructuring, ratio computation, MPBF working capital | `src/lib/cmaEngine.ts` |
| Tax Audit Clause 44 Engine | Tax audit expenditure breakdown into registered vs unregistered GST suppliers | `src/lib/auditEngine.ts` |

## Pattern Overview

**Overall:** Hybrid Electron Desktop + Local Client-Server Architecture with Domain Engine Libraries and Web Workers.

**Key Characteristics:**
- **Zero-Merge Rule in Spreadsheets:** Strict ban on `<mergeCell>` entries across all generated workbooks to maintain formula references (`VLOOKUP`, `XLOOKUP`), column filters, and sorting.
- **Off-Thread Heavy Processing:** Large purchase registers and 2B datasets (>50,000 invoices) are delegated to Web Workers (`reconciliation.worker.ts`), providing progressive progress reporting without UI locking.
- **Idempotent Multi-Pass Waterfall Matching:** Matching progresses from exact string & amount matches to fuzzy alphanumeric invoice cleaning, FY prefix removal, decimal tolerance ($\le$ ₹2), and cross-state PAN fallbacks.
- **Embedded Relational Persistence:** Node server leverages local SQLite database files per domain (`returns.db`, `gstr1.db`, `gstr2b.db`) with LAN file-share capabilities for office multi-workstation setups.

## Layers

**Presentation Layer (UI):**
- Purpose: Render dashboards, reconciliation tables, category tabs, filter decks, and import wizards
- Location: `src/pages/`, `src/components/`
- Contains: React components, Lucide icons, Tailwind styling, Radix dialogs
- Depends on: `src/lib/`, `@tanstack/react-query`, Web Workers

**Worker & Engine Layer (Client-Side Logic):**
- Purpose: Execute heavy business computations (matching algorithms, tax computations, file exports)
- Location: `src/lib/`, `src/workers/`
- Contains: TypeScript algorithms, numerical sanitizers, regex cleaners, Excel builders
- Depends on: `xlsx`, `exceljs`, `jspdf`, `date-fns`

**API & Server Layer (Backend):**
- Purpose: Handle file uploads, SQLite database queries, Playwright portal sync, and Tally proxy
- Location: `server.js`, `gstr1_routes.js`, `gstr2b_routes.js`, `ims_routes.js`, `tds_routes.js`, `tax_routes.js`
- Contains: Express route handlers, SQLite connection pools, child process managers
- Depends on: `sqlite3`, `bcryptjs`, `jsonwebtoken`, `googleapis`, `playwright`

**External Interop Layer:**
- Purpose: Communicate with external environments (TallyPrime XML on port 9000, GST Portal via Playwright, Firebase Firestore)
- Location: `src/lib/tallyApi.ts`, `gstr1/autopilot.js`, `gstr2b/autopilot.js`

## Data Flow

### Primary Reconciliation Flow

1. **Import Stage:** User uploads Excel/JSON PR and GSTR-2B or syncs from TallyPrime (`src/pages/Index.tsx`)
2. **Worker Dispatch:** File buffers/rows are transferred to `src/workers/reconciliation.worker.ts`
3. **Multi-Pass Matching:** `reconcile()` in `src/lib/reconciliation.ts` performs 8 matching passes:
   - Pass 1: Exact GSTIN + Invoice Number + Tax/Taxable
   - Pass 2: Exact GSTIN + Invoice Number + Value difference $\le$ ₹2
   - Pass 3: Exact GSTIN + Invoice Number + Date discrepancy
   - Pass 4: Cleaned Invoice Number (stripped slashes, hyphens, leading zeros)
   - Pass 5: Core Invoice Number (stripped FY prefixes like `23-24/`)
   - Pass 6: Rounding tolerance $\le$ ₹1
   - Pass 7: Vendor PAN cross-state fallback
   - Pass 8: Leftover PR tagged `Not in 2B`, leftover 2B tagged `Not in Books`, and `Prior FY (Excluded)`
4. **Party-Wise Aggregation:** `aggregateByParty()` in `src/lib/partyWise.ts` aggregates line items into vendor cards and runs the 4-pass debit note pairing engine
5. **Presentation & Action:** Results rendered in `src/pages/Reconciliation.tsx` with filter tabs and manual pairing overrides
6. **Export:** User generates Zero-Merge Excel report via `exportToXlsx()` in `src/lib/fileParser.ts`

### GSTR-1 / 2B Autopilot 12-Month Sync Flow

1. User triggers 12-Month Sync in `src/components/Gstr1MasterDownloader.tsx` or `src/components/Gstr2bMasterDownloader.tsx`
2. Frontend sends request to `POST /api/gstr1/portal-sync-browser` or `POST /api/gstr2b/portal-sync-browser`
3. Playwright browser spawns, taxpayer logs in with single CAPTCHA
4. Autonomous loop iterates April through March filing periods, downloads returns, and parses JSON/Excel
5. Records persisted into SQLite tables (`gstr1_invoices` / `gstr2b_invoices`)
6. Consolidated 8-sheet Excel generated via `fullYearExcel.js` with side-by-side monthly and party matrices

## Key Abstractions

**Reconciliation Engine Result (`ReconciliationResult`):**
- Purpose: Unified data structure representing paired or unpaired PR/2B line items with status, tax differences, and match pass identifiers
- Examples: `src/lib/reconciliation.ts`
- Pattern: Discriminated union / normalized record

**Party Summary & Debit Note Pairing (`PartySummary`):**
- Purpose: Aggregates vendor transactions, calculates party-level discrepancy, and pairs debit notes
- Examples: `src/lib/partyWise.ts`
- Pattern: Composite entity with nested child arrays (`PartyInvoiceRow`)

**Tally XML Envelope Builder:**
- Purpose: Serializes XML requests for Tally collection queries and parses XML response trees into JSON models
- Examples: `src/lib/tallyApi.ts`, `src/lib/tallyCmaApi.ts`
- Pattern: Builder / Adapter

## Entry Points

**Desktop Entry:**
- Location: `main.cjs`
- Triggers: Application executable launch
- Responsibilities: Creates Electron browser window, initializes local background server, handles native window events

**Frontend Web Entry:**
- Location: `src/main.tsx` & `src/App.tsx`
- Triggers: Browser document load
- Responsibilities: Mounts React tree, configures QueryClient, HashRouter, ThemeProvider, ErrorBoundary

**Backend API Entry:**
- Location: `server.js`
- Triggers: Node.js start script (`npm start`, `npm run dev`)
- Responsibilities: Initializes Express, binds route handlers, manages SQLite database connections

## Architectural Constraints

- **Strict Zero-Merge Excel Architecture:** Merged cells are strictly prohibited in all exported Excel sheets (`ws['!merges'] = []`). Column sorting, filtering, and lookup formulas must never be broken by cell merging.
- **Single CAPTCHA 12-Month Portal Sync:** Autopilot loops must preserve the authenticated browser session across all 12 monthly periods without requesting re-login.
- **Tolerance Limits:** Matching tolerance is strictly bounded to $\le$ ₹2 for rounding discrepancies; any higher discrepancy is classified as `Value Mismatch`.
- **Offline / Local Execution:** All core reconciliation, database operations, and accounting integrations run locally on the user machine or office LAN without transmitting financial data to external third parties.

## Anti-Patterns

### Cell Merging in Analytical Workbooks

**What happens:** Merging header cells (e.g. `A1:F1` for company title or table headings)
**Why it's wrong:** Excel users cannot sort columns, apply AutoFilter, or write `XLOOKUP`/`VLOOKUP` formulas across merged ranges ("All merged cells need to be the same size")
**Do this instead:** Put title in cell A1 unmerged, subtitles in A2, and apply `removeAllMergesFromWorkbook(wb)` as in `src/lib/fileParser.ts#L855`

### Running 50k+ Invoice Matching on React Main Thread

**What happens:** Calling heavy CPU reconciliation functions directly in React state handlers
**Why it's wrong:** Freezes the browser UI, causing non-responsive script warnings
**Do this instead:** Delegate processing to `src/workers/reconciliation.worker.ts` with progressive progress callbacks

## Error Handling

**Strategy:** Layered defensive error boundaries with granular status reporting.

**Patterns:**
- React Global Error Boundary (`src/App.tsx`) with crash diagnostics and session reset
- Uncaught exception suppression for transient Playwright IPC disconnections in `server.js`
- Database fallback queries with transaction rollbacks in SQLite route handlers

## Cross-Cutting Concerns

**Logging:** Structured console output in server routes; `electron-log` for desktop packaging.
**Validation:** Zod schemas (`zod`) for client form inputs; invoice cleaning and GSTIN checksum validation in `src/lib/reconciliation.ts`.
**Authentication:** Local JWT tokens for admin API access and Firebase Firestore subscription validation.

---

*Architecture analysis: 2026-10-22*
