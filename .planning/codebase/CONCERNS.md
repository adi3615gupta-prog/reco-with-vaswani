---
last_mapped_commit: 2767eb1c5944b9af02382e532c64119f7847f32a
last_mapped_at: 2026-10-22
---
# Codebase Concerns

**Analysis Date:** 2026-10-22

## Tech Debt

**Monolithic Parser Module (`src/lib/fileParser.ts`):**
- Issue: File contains >6,000 lines of code handling both input spreadsheet parsing and complex multi-tab Zero-Merge export workbook generation
- Files: `src/lib/fileParser.ts`
- Impact: Difficult to maintain, test, and isolate individual sheet formats; high cognitive load during refactoring
- Fix approach: Split into separate modules under `src/lib/excel/`: `parser.ts`, `corporateHeader.ts`, `executiveSummary.ts`, `partyWiseExport.ts`, and `monthlyComparisonExport.ts`

**Large Route Handlers (`ims_routes.js`, `tds_routes.js`, `gstr2b_routes.js`):**
- Issue: Complex database queries, Playwright orchestration, and file transformations are tightly coupled inside Express route controller functions
- Files: `ims_routes.js`, `tds_routes.js`, `gstr2b_routes.js`
- Impact: Duplicated database connection boilerplate and hard-to-test side effects
- Fix approach: Extract database repository layers and domain service classes from route handlers

**Bundled Static Benchmark Data (`src/lib/gtcBenchmarkData.ts`):**
- Issue: 703 KB TypeScript file containing embedded JSON benchmarks bundled into the frontend application bundle
- Files: `src/lib/gtcBenchmarkData.ts`
- Impact: Inflates initial bundle size and parse time
- Fix approach: Lazy load or fetch dynamically via local backend API endpoint on demand

## Known Bugs

**Playwright IPC Channel Unbound Disconnection:**
- Symptoms: Background headless browser crash when portal target page closes unexpectedly during 12-month autopilot download
- Files: `server.js` (lines 19-32)
- Trigger: User manually closes the automated browser window during CAPTCHA entry or portal navigation
- Workaround: Suppressed globally via `process.on('uncaughtException')` in `server.js`, but requires graceful job status termination in SQLite batch table

## Security Considerations

**Hardcoded Firebase Config & Client Keys:**
- Risk: Firebase web configuration parameters are hardcoded in source code
- Files: `server.js` (lines 53-61)
- Current mitigation: Firestore database security rules restrict write operations; client key is an API identifier, not an admin credential
- Recommendations: Ensure strict server-side Firestore rules and move project metadata to runtime environment configuration

**Unauthenticated Local Tally API Proxy:**
- Risk: TallyPrime XML server on port 9000 does not employ authentication; any local network request can query company ledgers
- Files: `src/lib/tallyApi.ts`, `server.js`
- Current mitigation: Restricted to `localhost:9000` by default
- Recommendations: Validate origin and bind proxy endpoints behind the authenticated local Express session

## Performance Bottlenecks

**Large Excel Workbook Memory Footprint:**
- Problem: Generating 12-month consolidated 8-sheet workbooks with >50,000 invoices can cause high client-side V8 memory spikes
- Files: `src/lib/fileParser.ts`, `gstr2b/fullYearExcel.js`, `gstr1/fullYearExcel.js`
- Cause: Building full in-memory cell tree objects before serialization with `xlsx.write`
- Improvement path: Stream large monthly sheets using `exceljs` streaming writer or chunk rows into Web Worker buffers

**Synchronous Subprocess Calls:**
- Problem: Certain system probes use `execSync`
- Files: `server.js`
- Cause: Synchronous child process execution blocking the Node.js event loop
- Improvement path: Replace with asynchronous `exec` or `spawn` promises

## Fragile Areas

**GST Portal UI DOM Selectors:**
- Files: `gstr1/autopilot.js`, `gstr2b/autopilot.js`, `ims_routes.js`
- Why fragile: Playwright automation depends on portal DOM selectors (e.g. `Click here to download - File 1`, return period dropdowns). Any GSTN portal frontend update breaks selector targeting
- Safe modification: Encapsulate portal DOM selectors in a centralized selector registry with fallback heuristics
- Test coverage: End-to-end portal testing requires live credentials and cannot run in automated CI

**Strict Zero-Merge Workbook Requirement:**
- Files: `src/lib/fileParser.ts`, `gstr2b/fullYearExcel.js`, `gstr1/fullYearExcel.js`
- Why fragile: If a future developer accidentally introduces `ws['!merges'] = [...]` for visual headers, it silently breaks Excel column sorting, AutoFilters, and `XLOOKUP` across client audit workbooks
- Safe modification: Always ensure `removeAllMergesFromWorkbook(wb)` is executed prior to `XLSX.writeFile()`

## Scaling Limits

**Browser Tab In-Memory Reconciliation:**
- Current capacity: ~100,000 invoice line items handled smoothly via `reconciliation.worker.ts`
- Limit: Datasets >250,000 line items exceed Web Worker message transfer thresholds and cause browser tab crashes
- Scaling path: Offload multi-lakh reconciliations to SQLite database indexing on the Node backend (`server.js`) rather than transferring raw records to browser memory

## Dependencies at Risk

**`xlsx` (SheetJS Community Edition 0.18.5):**
- Risk: Community edition on NPM is pinned to 0.18.5 (SheetJS moved official package releases off the public npm registry to `cdn.sheetjs.com`)
- Impact: Missing latest performance optimizations and security patches
- Migration plan: Gradually migrate export routines to modern maintained alternatives (`exceljs`)

**`localtunnel` (2.0.2):**
- Risk: Public localtunnel endpoints occasionally experience network downtime or rate limiting
- Impact: Multi-device remote testing can disconnect unexpectedly
- Migration plan: Consider Cloudflare Tunnels (`cloudflared`) or ngrok for production office tunnels

## Missing Critical Features

**Audit Trail for Manual Force-Matches:**
- Problem: When users manually force-match two disparate invoices (`Manual Match (Forced)`), the rationale and timestamp are only stored in local memory / ephemeral state
- Blocks: Statutory auditors verifying why an unmatched invoice was manually reconciled

## Test Coverage Gaps

**Playwright Portal Autopilot:**
- What's not tested: Live portal navigation, 20-minute waiting window, and file download flows
- Files: `gstr1/autopilot.js`, `gstr2b/autopilot.js`
- Risk: Portal selector regressions detected only at runtime by end users
- Priority: High

**Excel Export Cell Integrity:**
- What's not tested: Automated unit test verifying `ws['!merges']` length equals 0 on all generated workbooks
- Files: `src/lib/fileParser.ts`
- Risk: Accidental merge introduction breaking accountant workflows
- Priority: Medium

---

*Concerns audit: 2026-10-22*
