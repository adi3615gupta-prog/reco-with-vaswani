---
last_mapped_commit: 2767eb1c5944b9af02382e532c64119f7847f32a
last_mapped_at: 2026-10-22
---
# Codebase Structure

**Analysis Date:** 2026-10-22

## Directory Layout

```
reco-with-vaswani-main/
├── gstr1/                     # GSTR-1 autonomous downloader, DB persistence, and Excel generators
├── gstr2b/                    # GSTR-2B autonomous downloader, DB persistence, and Excel generators
├── public/                    # Static assets, logos, templates, and icons
├── src/
│   ├── assets/                # Images, fonts, and SVG graphics
│   ├── components/            # UI widgets, modal dialogs, and feature views
│   │   ├── consolidation/     # Returns consolidation views and multi-year matrices
│   │   ├── finstatements/     # Financial statements, Balance Sheet, and P&L widgets
│   │   ├── tax/               # Income tax regime, deduction cards, and slab views
│   │   └── ui/                # Radix UI + shadcn/ui reusable component primitives
│   ├── hooks/                 # Custom React hooks (theme, toast, responsive sizing)
│   ├── lib/                   # Core business logic engines, tax calculators, and parsers
│   ├── pages/                 # Full-page routes (Reconciliation, TDS, CMA, Audit, Tally)
│   ├── types/                 # Shared TypeScript interfaces, types, and enums
│   └── workers/               # Background Web Workers for matching and file parsing
├── .planning/                 # Project documentation, codebase maps, and GSD workflows
├── dist/                      # Vite frontend production build output
├── dist-electron/             # Electron packaged NSIS installers and executables
├── main.cjs                   # Electron main application process
├── preload.js                 # Electron preload bridge
├── server.js                  # Primary Express backend API service
├── *_routes.js                # Domain-specific Express route handlers
├── package.json               # Dependencies, build scripts, and electron-builder metadata
├── vite.config.ts             # Vite bundler and dev server configuration
└── tsconfig.json              # TypeScript root configuration
```

## Directory Purposes

**`src/lib/`:**
- Purpose: Pure computational business logic, reconciliation algorithms, tax calculations, and file parsers
- Contains: TypeScript libraries free of direct DOM dependencies (portable to web workers and Node.js)
- Key files: `reconciliation.ts`, `partyWise.ts`, `fileParser.ts`, `tdsEngine.ts`, `tallyApi.ts`, `cmaEngine.ts`, `incomeTaxEngine.ts`

**`src/workers/`:**
- Purpose: Off-main-thread processing for massive datasets (50,000+ invoices)
- Contains: Web Worker scripts communicating via structured `postMessage` events
- Key files: `reconciliation.worker.ts`, `fileParser.worker.ts`

**`src/pages/`:**
- Purpose: Route-level page containers for all 10 core modules
- Contains: Page layout components, state providers, and filter controllers
- Key files: `Reconciliation.tsx`, `Index.tsx`, `TdsReconciliation.tsx`, `BankCmaAppraisal.tsx`, `AuditModule.tsx`, `TallyDirectImport.tsx`

**`src/components/`:**
- Purpose: Modular user interface elements, dialogs, forms, and tables
- Contains: React TSX components styling with Tailwind CSS and Radix UI
- Key files: `PartyWiseReport.tsx`, `Gstr1MasterDownloader.tsx`, `Gstr2bMasterDownloader.tsx`, `ImsMasterManager.tsx`, `ResultsCategoryTabs.tsx`

**`gstr1/` & `gstr2b/`:**
- Purpose: Autonomous portal synchronization and full-year consolidated report engines
- Contains: Playwright automation scripts, SQLite schema builders, Excel workbook synthesizers
- Key files: `autopilot.js`, `fullYearExcel.js`, `parsers.js`, `db.js`

**Root Route Modules (`*_routes.js`):**
- Purpose: Express backend domain route definitions mounted by `server.js`
- Contains: Route definitions, database queries, and external API handlers
- Key files: `gstr1_routes.js`, `gstr2b_routes.js`, `ims_routes.js`, `tds_routes.js`, `tax_routes.js`, `gdrive_routes.js`, `returns_storage_routes.js`

## Key File Locations

**Entry Points:**
- `main.cjs`: Electron desktop application entry point
- `src/main.tsx`: React frontend application entry point
- `server.js`: Node.js Express API server entry point

**Configuration:**
- `package.json`: Dependencies, NPM scripts, electron-builder NSIS settings
- `vite.config.ts`: Vite bundling, port 8080 setup, `@` path aliasing
- `tsconfig.json`: TypeScript compiler options and module resolution
- `tailwind.config.ts`: Tailwind CSS theme customization and design tokens
- `components.json`: shadcn/ui configuration

**Core Engines:**
- `src/lib/reconciliation.ts`: 8-pass PR vs 2B reconciliation algorithm
- `src/lib/partyWise.ts`: Vendor-level aggregation and 4-pass debit note reconciler
- `src/lib/fileParser.ts`: Excel import parser and Zero-Merge export suite
- `src/lib/tallyApi.ts`: TallyPrime native XML HTTP connector
- `src/lib/tdsEngine.ts`: Form 26AS / AIS / TRACES tax audit engine
- `src/lib/incomeTaxEngine.ts`: Dual-regime income tax computation engine
- `src/lib/cmaEngine.ts`: Bank CMA credit appraisal and balance sheet restructuring

## Naming Conventions

**Files:**
- React Components & Pages: PascalCase (e.g. `Reconciliation.tsx`, `PartyWiseReport.tsx`)
- Logic Libraries & Utilities: camelCase (e.g. `reconciliation.ts`, `fileParser.ts`, `partyWise.ts`)
- Backend Routes & Scripts: snake_case / camelCase (e.g. `gstr1_routes.js`, `fullYearExcel.js`)
- Type Definition Files: camelCase with `.ts` or `*Types.ts` (e.g. `capitalGainsTypes.ts`)

**Directories:**
- Frontend components and domains: lowercase (e.g. `ui`, `consolidation`, `finstatements`, `tax`)
- Backend domain modules: lowercase alphanumeric (e.g. `gstr1`, `gstr2b`)

## Where to Add New Code

**New Reconciliation Pass or Rule:**
- Primary code: Extend waterfall sequence in `src/lib/reconciliation.ts`
- Worker integration: Update `src/workers/reconciliation.worker.ts`
- UI status badge: Add status color styling in `src/components/StatusBadge.tsx`

**New Vendor / Party Feature:**
- Logic: Add aggregation or pairing logic in `src/lib/partyWise.ts`
- UI: Extend party cards, filters, or action menus in `src/components/PartyWiseReport.tsx`

**New Excel Export or Sheet:**
- Implementation: Add worksheet builder in `src/lib/fileParser.ts` (strictly following Zero-Merge architecture: `ws['!merges'] = []`)
- Full-Year Consolidators: Extend `gstr1/fullYearExcel.js` or `gstr2b/fullYearExcel.js`

**New Backend API Service:**
- Route handler: Create `[feature]_routes.js` in root directory
- Mount route: Import and mount in `server.js`
- Frontend service caller: Add API call functions in `src/lib/api.ts`

**New Reusable UI Primitive:**
- shadcn/Radix components: Add under `src/components/ui/[component-name].tsx`

## Special Directories

**`.planning/`:**
- Purpose: Project documentation, codebase analysis maps, and GSD planning artifacts
- Generated: Maintained by GSD workflows
- Committed: Yes

**`dist/` & `dist-electron/`:**
- Purpose: Compiled web bundles and packaged Windows `.exe` installers
- Generated: Yes (via `npm run build` / `npm run build:exe`)
- Committed: No (in `.gitignore`)

**`gst_returns_data/`:**
- Purpose: Local storage for client return working papers and SQLite database files
- Generated: Yes at runtime
- Committed: No

---

*Structure analysis: 2026-10-22*
