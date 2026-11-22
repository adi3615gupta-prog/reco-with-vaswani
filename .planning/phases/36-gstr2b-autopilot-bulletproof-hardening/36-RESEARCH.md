# Phase 36: GSTR-2B Inward ITC Autopilot Bulletproof Hardening — Technical Research

**Researched:** 2026-11-10  
**Scope:** Suite 04 → Module 04 (`Gstr2bMasterDownloader.tsx`, `ReturnsAutoIngestDeck.tsx`, `ReturnsDashboard.tsx`) & Backend Engine (`gstr2b_routes.js`, `gstr2b/autopilot.js`, `gstr2b/db.js`, `gstr2b/parsers.js`, `gstr2b/browserLauncher.js`)  
**Requirements Covered:** `G2B-BP-01` through `G2B-BP-10`  
**Prior Constraints Preserved:** Phase 4 Golden Rule (`D-03`), `NIL_SYNCED` vs `PENDING` distinction (`D-04`), Official `<button>` `BACK` navigation / zero `<a>` tags / zero URL push (`D-08`–`D-10`), Zero-Merge Excel (`D-05`–`D-06`), Visible Chrome + 1-time human CAPTCHA (`D-01`–`D-02`).

---

## 1. Executive Summary: Current Implementation vs Gaps (`G2B-BP-01` .. `G2B-BP-10`)

The existing GSTR-2B Autopilot has solid Phase 4 foundations (Chrome-first visible launcher in `gstr2b/browserLauncher.js`, official `<button>BACK</button>` navigation in `gstr2b/autopilot.js`, Golden Rule non-destructive upsert in `gstr2b/db.js`, and 8-sheet Zero-Merge Excel in `gstr2b/fullYearExcel.js`), **but breaks down under real CA production workloads** due to UI state bugs, synchronous HTTP blocking, flat download folders, missing GSTN error/session checks, and inconsistent period formats.

| Req ID | Current State (Observed) | Production Gap / Bug | Required Upgrade |
|---|---|---|---|
| **G2B-BP-01** | `Gstr2bMasterDownloader.tsx:133` initializes `viewMode` as `'MONTH' \| 'FULL_YEAR'`, while buttons at `L825,836` call `setViewMode('SINGLE')` / `setViewMode('12M')`. `L130` computes `activePeriod = "${selectedMonth} ${startYear}"` even for Jan–Mar. `L1171` & `L1299` call `setActiveClientDetail(...)` directly instead of `handleOpenClientDetails(...)`. | Clicking **Full FY 12 Months** sets `'12M'`, so `viewMode === 'FULL_YEAR'` is always `false` (`L197,345,418,484,614`). Jan–Mar selects wrong year (`January 2025` instead of `January 2026` for FY `2025-26`). `Inspect Invoices` opens an empty modal (`detailInvoices` never fetched). | Unify `viewMode` to `'MONTH' \| 'FULL_YEAR'`; fix Q4 (`Jan`/`Feb`/`Mar`) year to `endYear`; wire `Inspect Invoices` & table `Inspect` to `handleOpenClientDetails(client)`. |
| **G2B-BP-02** | `Gstr2bMasterDownloader.tsx:702-733` falls back to `'Siddha Edibles Pvt Ltd'` (`702` invs); `L1088` renders `Math.round((stats?.totalInvoices \|\| 700) / 7)`; `L1130-1137` fallback to `540/18/62/4/48/26/12`; `L1178` `Re-Run Failed Months` invokes `handleRunAutopilot(activeCockpitClient)` with no filter. `/api/gstr2b/fy-summary` (`gstr2b_routes.js:139-259`) returns only `syncedMonths: string[]` & `nilMonths: string[]`. | All synced months show the same fake `totalInvoices / 7` count; S2/S4/S5/S6/S7 chips show mock counts in 12M mode; `Re-Run Failed Months` re-downloads already-synced months from April. | Return `monthDetails` (per-month `status`, `totalInvoices`, `eligibleItcTotal`, `verifyStatus`, `updatedAt`) + full section totals in `/api/gstr2b/fy-summary`; remove demo fallback numbers; pass `onlyPeriods` + `skipSynced: true` from `Re-Run Failed Months`. |
| **G2B-BP-03** | `Gstr2bMasterDownloader.tsx:949-1017` displays a static hardcoded `Portal CAPTCHA Resolver` (`849275`, `OCT 24 CHALLENGE`) card that is unconnected to Playwright. | Misleads operators into typing a fake CAPTCHA in React instead of solving the real CAPTCHA inside the launched Chrome window; gives zero live step/log feedback during 12M loops. | Replace right-hand card with a **Live Autopilot Console** driven by job SSE/polling state (`WAITING_CAPTCHA`, current month `X/12`, scrollable log feed, `"Bring Browser to Front"`, `"Cancel Task"`, session-expired resume guidance). |
| **G2B-BP-04** | `POST /api/gstr2b/portal-sync-browser` (`gstr2b_routes.js:457-495`) holds a single HTTP connection open for the entire Playwright run (2–5+ min for 12 months). `gstr2b_routes.js:468,509,726` read `browserState.current`, which is `null` because `portal-sync-browser` passes `clientBrowserState` (`L476`). | Long 12M runs risk Vite/localtunnel/browser request timeouts, lose progress on tab switches (`COCKPIT` ↔ `ALL_CLIENTS`), and `Bring Browser to Front` / no-body `/cancel` fail to find the active browser PID. | Introduce async Job Manager (`gstr2b/jobs.js`) + `POST /api/gstr2b/jobs/start` + `GET /api/gstr2b/job-stream/:jobId` (authenticated `fetch` SSE) + `GET /api/gstr2b/job/:jobId` (snapshot), while keeping `POST /api/gstr2b/portal-sync-browser` compatible for `ReturnsAutoIngestDeck.tsx` and `ReturnsDashboard.tsx`. |
| **G2B-BP-05** | `gstr2b/autopilot.js:340-366` intercepts only GSTR-1 APIs; `clickDownloadLinks` (`L941-984`) clicks Excel before JSON and never clicks `GENERATE JSON`; polling waits only `15s` (`L994`) with no refresh retry; `activeGstr2bDownloadPromises` is only awaited in the single-month branch (`L1277`), not inside the 12M loop. | Fails or times out prematurely when GSTN takes >15s to compile GSTR-2B; misses JSON/API payloads; 12M loop can move to month `i+1` before `download.saveAs` completes. | Add GSTR-2B `page.on('response')` JSON interception; reorder `clickDownloadLinks` to **JSON-first** (ready JSON link → `GENERATE JSON` → ready Excel link → `GENERATE EXCEL`); add 45–60s portal generation poll with periodic in-page refresh; await active download promises inside `downloadAndProcess2b`. |
| **G2B-BP-06** | `gstr2b/autopilot.js:68` writes all files into flat `scratch/downloads/gstr2b/${gstinUpper}`; `L1046-1089` scans `os.homedir()/Downloads` with `f.time >= actionStartTime - 6000`; parsed GSTIN/period are never verified before `bulkSaveGstr2bInvoices` (`L1132`). | Cross-month or cross-client contamination if a stale download from `~/Downloads` or a lagging month finishes inside the 6s window. | Isolate automated downloads to `scratch/downloads/gstr2b/${gstinUpper}/${jobId}/${periodSlug}` via `download.saveAs`; disable `~/Downloads` scanning during automated runs; enforce strict parsed GSTIN + `normalizeReturnPeriod` match before DB persistence. |
| **G2B-BP-07** | Login wait (`gstr2b/autopilot.js:315-322`) waits 180s blindly without detecting invalid CAPTCHA / wrong password / locked messages; mid-loop expiry isn't detected. `runBatchQueue` (`Gstr2bMasterDownloader.tsx:396-446`) never checks `batchAbortRef.current.signal`. `POST /api/gstr2b/cancel` (`gstr2b_routes.js:518-531`) uses `%${m}%` `LIKE` wildcard and overwrites synced batches to `'CANCELLED'`. | Operators sit waiting on invalid credentials; session expiry corrupts remaining months as generic errors; batch cancel fails to stop queue; `April` cancel wildcard clobbers `April 2024/2025/2026` even if already `SYNCED`. | Add login error & mid-loop `SESSION_EXPIRED` DOM/URL detectors; check `batchAbortRef.current?.signal.aborted` and pass `signal` in `runBatchQueue`; refactor `POST /api/gstr2b/cancel` to use `buildStrictPeriodFilter(p)` and guard `status NOT IN ('SYNCED','PUSHED_TO_3B','NIL_SYNCED')`. |
| **G2B-BP-08** | `parseGstr2bJsonHelper` (`gstr2b/parsers.js:206`) returns raw `fp` (`"042025"`); `parseGstr2bExcelHelper` (`L154`) only strips commas; `gstr2b/db.js:379-442` stores raw `returnPeriod` / `inv.return_period` verbatim; `gstr2b_routes.js:71,168,582,642,671` compare raw strings. | `"042025"`, `"April, 2025"`, `"Apr 2025"`, and `"April 2025"` create duplicate batch rows, orphan invoices across `gstr2b_batches` & `gstr2b_invoices`, and break `/summary` + `/fy-summary` joins. | Create shared canonical `normalizeReturnPeriod(periodStr, idt)` producing `"Month YYYY"` (e.g., `"April 2025"`) and enforce it at every write/query boundary in `gstr2b/db.js`, `gstr2b/parsers.js`, and `gstr2b_routes.js`. |
| **G2B-BP-09** | `autopilot.js` & `db.js` save whatever invoices are parsed with `status = 'SYNCED'` without cross-checking portal card summary or JSON `itcsumm`/`cpsumm` totals. | Truncated downloads or partial parses appear silently `SYNCED` with missing ITC. | Extract portal summary metrics (DOM GSTR-2B card/summary table + intercepted JSON `itcsumm`/`cpsumm`); store `verify_status` (`VERIFIED` / `PARTIAL_VERIFY` / `UNVERIFIED`), `verify_warning`, and `portal_summary_json` on `gstr2b_batches` without violating Golden Rule or breaking `SYNCED` readers. |
| **G2B-BP-10** | `src/test/gstr2bScrutiny.test.ts` (11 tests) and `src/test/gstr2bAutopilotScrutiny.test.ts` (2 tests) pass, but do not cover canonical period normalization, `skipSynced`/`onlyPeriods` filtering, strict cancel period isolation, job manager SSE/state machine, checksum verification, or `Gstr2bMasterDownloader` UI state. | Regressions in UI state, job streaming, or DB period canonicalization go undetected. | Add dedicated Vitest tests covering all backend invariants (`gstr2b/jobs.js`, `normalizeReturnPeriod`, `buildStrictPeriodFilter`, `verifyBatchChecksum`) and component tests for `Gstr2bMasterDownloader.tsx`. |

---

## 2. Code-Verified Inventory & Schemas

### 2.1 Backend Express Routes (`gstr2b_routes.js`)

`setupGstr2bRoutes(app, db, authenticateToken)` (`gstr2b_routes.js:21`, re-exported as `registerGstr2bRoutes` & `default` at `L858-859`):
- **Auth middleware (`L22-25`):** Mounts `auth` (`authenticateToken` from `server.js:120-129`) on `/api/gstr2b`, `/api/gstr3b/itc-allocations`, and `/api/gstr3b/export-itc-allocations`.
- **Important Auth Detail (`server.js:120-129`):** `authenticateToken` **only** checks `req.headers['authorization']` (`Bearer <jwt>`). It does **not** accept `?token=` query params. Therefore native browser `EventSource` (which cannot set custom `Authorization` headers) will receive `401`. Frontend SSE must use `safeApiFetch()` + `response.body.getReader()` (identical to `src/pages/GstNoticesDashboard.tsx:431-462`), or polling fallback.
- **Registered Routes:**
  - `GET /api/gstr2b/summary` (`L34-136`): Queries `clients` `LEFT JOIN gstr2b_batches` on `c.gstin = b.client_gstin AND b.return_period = ?`.
  - `GET /api/gstr2b/fy-summary` (`L139-259`): Queries `clients` `LEFT JOIN gstr2b_batches` on `b.return_period IN (12 months)`. Returns `syncedMonths`, `nilMonths`, `pendingMonths`, and aggregate `stats` (`totalInvoices`, `b2bCount`, `cdnrCount`, `eligibleItc.total`). Missing per-month map and missing `b2baCount`/`cdnraCount`/`isdCount`/`impgCount`/`ineligibleTotal`.
  - `GET /api/gstr2b/export-full-year/:gstin` (`L262-315`): Exports 8-sheet workbook via `generateGstr2bFullYearWorkbook`.
  - `buildStrictPeriodFilter(period)` (`L317-347`): Inline helper inside `setupGstr2bRoutes` (not exported). Builds `return_period IN (...)` candidates (`April 2025`, `April, 2025`, `042025`, `04-2025`, `04/2025`) when `[a-zA-Z]+` & `\d{4}` match; otherwise falls back to `LIKE` (`L344-345`).
  - `GET /api/gstr2b/invoices/:gstin` (`L350-436`): Single-period uses `buildStrictPeriodFilter(period)` and returns `{ success, gstin, period, financialYear, count, batch, invoices }`; full-year queries 12 months + `%startYear%` / `%endYear%`.
  - `DELETE /api/gstr2b/clear/:gstin` (`L439-454`): Uses `buildStrictPeriodFilter(period)`. **Observed anomaly at `L448`:** executes `DELETE FROM gstr2b_summaries ...` even though no `gstr2b_summaries` table exists in `gstr2b/db.js` (fails silently in callback-less `db.run`).
  - `POST /api/gstr2b/portal-sync-browser` (`L457-495`): Creates per-GSTIN `clientBrowserState = { current: null }`, sets in `activeBrowsers` (`L477`), listens on `req.on('close')` (checking wrong `browserState.current` at `L468`), and awaits `runGstr2bAutopilot(...)`.
  - `POST /api/gstr2b/cancel` (`L498-538`): Closes `activeBrowsers.get(g)` if `gstin` passed (else checks `browserState.current` which is `null`), then runs `UPDATE gstr2b_batches SET status = 'CANCELLED'` using wildcard `LIKE '%${m}%'` (`L519-525`) without protecting `SYNCED` batches.
  - `POST /api/gstr2b/scan-downloads` (`L541-609`): Scans `~/Downloads`, `scratch/downloads`, `scratch/downloads/gstr2b` for files containing `2b`/`gstr2b`/`gstr-2b`.
  - `POST /api/gstr2b/ingest` (`L612-662`): Parses base64 `.xlsx`/`.xls`/`.json`/`.zip` via `os.tmpdir()` and calls `bulkSaveGstr2bInvoices`.
  - `POST /api/gstr2b/push-to-3b` (`L665-721`): Updates `status = 'PUSHED_TO_3B'` on exact `client_gstin = ? AND return_period = ?` (`L671,676`).
  - `POST /api/gstr2b/bring-to-front` (`L724-747`): Reads `browserState.current` (missing `activeBrowsers`), runs PowerShell `AppActivate` + `scratch/bring_to_front.ps1`.
  - `POST /api/gstr2b/open-portal-login` (`L750-765`): Calls `openPortalLoginHelper`.
  - `GET/POST /api/gstr3b/itc-allocations` & `GET /api/gstr3b/export-itc-allocations` (`L770-855`).

### 2.2 SQLite Schema & Exports (`gstr2b/db.js`)

Initialized in `initGstr2bDatabase(db)` (`gstr2b/db.js:4-116`):
- **`gstr2b_batches` (`L7-31`, migrations `L94-115`):**
  - Core columns: `id TEXT PRIMARY KEY`, `client_gstin TEXT NOT NULL`, `return_period TEXT NOT NULL`, `status TEXT DEFAULT 'PENDING'`, `total_invoices`, `b2b_count`, `b2ba_count`, `cdnr_count`, `cdnra_count`, `isd_count`, `impg_count`, `eligible_itc_igst`, `eligible_itc_cgst`, `eligible_itc_sgst`, `eligible_itc_cess`, `eligible_itc_total`, `ineligible_itc_total`, `excel_path`, `json_path`, `downloaded_at`, `created_at`, `updated_at`, `UNIQUE(client_gstin, return_period)`.
  - Migrated columns (`L97-114`): `rcm_igst`, `rcm_cgst`, `rcm_sgst`, `rcm_total`, `cdnr_igst`, `cdnr_cgst`, `cdnr_sgst`, `cdnr_total`, `impg_igst`, `isd_total`, `eligible_itc_txval`, `rcm_txval`, `cdnr_txval`, `ineligible_itc_txval`, `ineligible_itc_igst`, `ineligible_itc_cgst`, `ineligible_itc_sgst`, `ineligible_itc_cess`.
- **`gstr2b_invoices` (`L34-59`):**
  - `id TEXT PRIMARY KEY`, `batch_id TEXT`, `client_gstin TEXT NOT NULL`, `return_period TEXT NOT NULL`, `section TEXT DEFAULT 'B2B'`, `ctin TEXT NOT NULL`, `supplier_name TEXT`, `inum TEXT NOT NULL`, `idt TEXT NOT NULL`, `inv_typ TEXT DEFAULT 'Regular'`, `pos TEXT`, `rchrg TEXT DEFAULT 'N'`, `itc_available TEXT DEFAULT 'Y'`, `itc_reason TEXT`, `txval REAL`, `igst REAL`, `cgst REAL`, `sgst REAL`, `cess REAL`, `total_val REAL`, `source_period TEXT`, `filing_date TEXT`, `created_at INTEGER`, `UNIQUE(client_gstin, return_period, section, ctin, inum, idt)`.
- **Indexes (`L73-76`):** `idx_gstr2b_batches_period`, `idx_gstr2b_invoices_batch`, `idx_gstr2b_invoices_client`, `idx_gstr1_summaries_client`.
- **Exported Functions:**
  - `initGstr2bDatabase(db)` (`L4`)
  - `recalculate2bBatchMetrics(db, clientGstin, returnPeriod)` (`L119-367`): Aggregates `gstr2b_invoices`, keeps `NIL_SYNCED` if `total_invoices === 0` and existing status is `'NIL_SYNCED'`, otherwise defaults 0-invoice months to `'PENDING'` (`L218-220`).
  - `bulkSaveGstr2bInvoices(db, clientGstin, returnPeriod, invoices, excelPath, jsonPath)` (`L370-486`): Short-circuits `if (!invoices || invoices.length === 0) return resolve({ count: 0 })` (Golden Rule). Deletes only `affectedPeriods` inside `BEGIN TRANSACTION`, inserts with MD5 `id` + ISO→`DD-MM-YYYY` date normalization (`L428-439`), calls `recalculate2bBatchMetrics`. **Return shape (`L479`):** `{ count, metrics: lastMetrics, ...lastMetrics }` (note: callers reading `saveRes.metrics` work cleanly).
  - `saveGstr1Summary(db, clientGstin, returnPeriod, summary)` (`L489-512`)
  - `markGstr2bMonthNilSynced(db, clientGstin, returnPeriod, excelPath, jsonPath)` (`L519-571`)
  - `getInvoicesWithAllocations(db, clientGstin, returnPeriod)` (`L598-796`)
  - `bulkSaveItcAllocations(db, clientGstin, returnPeriod, allocations)` (`L798-856`)
- **Downstream Consumer Caveat (`returns_storage_routes.js:2517-2540, 2663, 2744-2754`):**
  - `returns_storage_routes.js:2663` selects `client_gstin, return_period, status, total_invoices, eligible_itc_total` from `gstr2b_batches` and looks up `g2Map.get('${gstin}__${periodCode}') || g2Map.get('${gstin}__${month}')` (`periodCode` = `'042025'`, `month` = `'April'`), checking `g2Batch.status === 'SYNCED'` or `'NIL_SYNCED'`. **Implication:** Keeping `gstr2b_batches.status` as `'SYNCED'` (with checksum warnings in a dedicated `verify_status` column) prevents breaking downstream status checks, and `returns_storage_routes.js` can optionally also check `${gstin}__${altPeriod}` (`April 2025`).

### 2.3 Parsers (`gstr2b/parsers.js`)

Exported GSTR-2B symbols & return schemas:
- `cleanStr(val)` (`L10`), `cleanNum(val)` (`L12-16`), `parseExcelDate(val)` (`L18-38`).
- `parseGstr2bExcelHelper(filePath, fallbackGstin = '', fallbackPeriod = '')` (`L42-190`):
  - Returns `null` on read error; otherwise `{ dealerName, gstin, finYear, period, invoices }`.
  - Metadata extracted from top 6 rows (`dealer name`, `gstin` regex, `finyear`, `period`).
  - Each invoice: `{ section, return_period, ctin, supplier_name, inum, idt, inv_typ, pos, rchrg, txval, igst, cgst, sgst, cess, total_val, filing_date, source_period, itc_available, itc_reason }`.
  - **Gap:** `L154` only runs `rawPeriod.replace(/,/g, '').trim()` (can leave `"042025"` or `"Apr 2025"`).
- `parseGstr2bJsonHelper(jsonData, fallbackGstin = '', fallbackPeriod = '')` (`L194-365`):
  - Accepts parsed object or file path string. Reads `gstin = raw.gstin || raw.data?.gstin || fallbackGstin`, `fp = raw.fp || raw.data?.fp || fallbackPeriod`, `docData = raw.data?.docdata || raw.docdata || raw`.
  - Parses `b2b`, `b2ba`, `cdnr`, `cdnra`, `isd`, `impg`, `impgsez`.
  - Returns `{ gstin, period: fp, invoices }`.
  - **Gaps:** Does not normalize `fp` (`"042025"` stays `"042025"`); does not attach `return_period` on invoice rows; does not extract `raw.data?.itcsumm` / `raw.itcsumm` / `raw.data?.cpsumm` summary checksum metadata if present.
- `parseGstr2bZipHelper(zipPath, fallbackGstin = '', fallbackPeriod = '')` (`L369-395`):
  - Unzips via `JSZip`, checks `.xlsx`/`.xls` first (via temp file in `os.tmpdir()`), else `.json`. Returns `parseGstr2bExcelHelper` or `parseGstr2bJsonHelper` output, or `null`.

### 2.4 Playwright Autopilot (`gstr2b/autopilot.js` & `gstr2b/browserLauncher.js`)

- `launchAutopilotBrowser(chromiumEngine, customOptions)` (`gstr2b/browserLauncher.js:39-132`): Launches visible Chrome (`channel: 'chrome'` → physical `chrome.exe` → bundled Chromium → `msedge`), `headless: false`, `--start-maximized`, `--disable-blink-features=AutomationControlled`.
- `runGstr2bAutopilot({ db, gstin, returnPeriod, financialYear, portal_username, portal_password, req, res, browserState, isFullYear })` (`gstr2b/autopilot.js:29-1351`):
  - Vault lookup (`L38-47`), launch (`L88-110`), `page.on('download')` (`L147-216`), login auto-fill + `#captcha` focus + assistive banner (`L220-310`), 180s login wait (`L314-335`).
  - `ensureReturnsSearchScreen` (`L477-561`): Preserves Phase 4 official `<button>`/`<input>` `BACK` navigation (`L497-516`) and Quick Links tile fallback (`L439-474`, zero URL push).
  - `selectPeriodAndSearch` (`L567-832`): Selects FY, Quarter, Month (with Angular `$apply()`), clicks `SEARCH`, waits 12s for returns cards.
  - `downloadAndProcess2b` (`L837-1147`): Checks Nil card text (`L849-871`), clicks GSTR-2B card `DOWNLOAD` (`L876-936`), clicks Excel/Table/JSON/Generate Excel (`L941-984`), polls 15s across `scratch/downloads/gstr2b/${gstinUpper}` and `~/Downloads` (`L993-1093`), clicks `BACK` (`L1096-1128`), persists via `bulkSaveGstr2bInvoices` or `markGstr2bMonthNilSynced`.
  - 12-month loop (`L1150-1267`): Iterates `fyMonths` (`April startYr` .. `March endYr`), builds consolidated 8-sheet Excel via `generateGstr2bFullYearWorkbook`.
- `openPortalLoginHelper({ db, gstin, portal_username, portal_password, browserState })` (`gstr2b/autopilot.js:1357-1544`).

### 2.5 Frontend Consumers & `normalizeReturnPeriod`

- `src/components/Gstr2bMasterDownloader.tsx`:
  - Existing `normalizeReturnPeriod` (`L97-121`) only converts `MMYYYY` and `DD-MM-YYYY` `idt`; does not handle `MM-YYYY`, `Apr 2025`, `2025-04`, or `Jan/Feb/Mar` FY offset (`L130` `activePeriod`).
  - `fetchSummary` (`L194-240`), `handleRunAutopilot` (`L331-367`), `handleStartBatchSync` (`L377-394`), `runBatchQueue` (`L396-446`), `handleOpenClientDetails` (`L476-502`), `handleCancelTask` (`L318-329`).
- `src/components/ReturnsAutoIngestDeck.tsx:830-1005`:
  - `handleGstr2bAutopilotSync` (`L830`) calls `POST /api/gstr2b/portal-sync-browser` (`L845`), checks `res.ok && data.success`, then re-hydrates via `GET /api/gstr2b/invoices/${gstin}?period=${targetPeriod}` (`L865`).
  - `handleCancelGstr2b` (`L753-778`) calls `POST /api/gstr2b/cancel` with `{ gstin, returnPeriod, month, financialYear }`.
  - `handleSyncBothAutopilot` (`L1008-1020`) awaits `handleGstr1AutopilotSync()` then `handleGstr2bAutopilotSync()`.
- `src/pages/ReturnsDashboard.tsx:1630-1664`:
  - Calls `POST /api/gstr2b/portal-sync-browser` (`L1644`) and re-hydrates via `GET /api/gstr2b/invoices/...` (`L1662`).
- `src/lib/api.ts:67-108` (`safeApiFetch`) & `L113-137` (`getToken`, `authHeaders`).

---

## 3. Recommended Technical Design

### 3.1 Async Job Manager (`gstr2b/jobs.js`) + Authenticated SSE & Backward Compatibility

Create a dedicated ES module `gstr2b/jobs.js` (bundled cleanly by `esbuild` in `obfuscate.cjs:6` without needing `package.json` changes):

- **Job Record Shape:**
  ```js
  {
    jobId,            // crypto.randomUUID()
    gstin,            // sanitized 15-char uppercase
    mode,             // 'MONTH' | 'FULL_YEAR'
    financialYear,
    returnPeriod,     // canonical "Month YYYY"
    onlyPeriods,      // string[] | null
    skipSynced,       // boolean
    phase,            // 'QUEUED' | 'LAUNCHING_BROWSER' | 'WAITING_CAPTCHA' | 'LOGIN_ERROR'
                      // | 'NAVIGATING' | 'SYNCING_MONTH' | 'AWAITING_PORTAL_GENERATION'
                      // | 'SESSION_EXPIRED' | 'COMPLETED' | 'PARTIAL' | 'CANCELLED' | 'FAILED'
    status,           // 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED' | 'SESSION_EXPIRED'
    currentPeriod,
    currentMonthIndex, // 1-based
    totalTargetMonths,
    events: [],       // bounded ring buffer (max 200 log entries { ts, level, phase, period, message })
    months: [],       // per-period status array ({ period, status, count, verifyStatus, error })
    result: null,     // final summary payload identical to portal-sync-browser JSON
    error: null,
    browserRef: { current: null }, // holds Playwright Browser instance
    abortController: new AbortController(),
    listeners: new Set(), // SSE res writers
    createdAt, updatedAt, completedAt
  }
  ```
- **Lifecycle & Concurrency Guard:**
  - Only **one active job per GSTIN** (`activeJobsByGstin.get(gstin)`). Starting a new job for the same GSTIN either rejects with `409 Conflict` (if `forceRestart !== true`) or cleanly cancels & awaits closure of the prior browser before launching.
  - Retain completed jobs in an in-memory `Map` for **30 minutes** (pruned by `setInterval(...).unref()` or on new job creation) so late-joining polls/SSE clients can read the final `result`.
- **Express Endpoints (`gstr2b_routes.js`):**
  1. `POST /api/gstr2b/jobs/start` (returns `202` immediately):
     - Validates `gstin` and `returnPeriod`/`isFullYear`, normalizes periods via `normalizeReturnPeriod`, creates job, starts `runGstr2bAutopilot` detached, returns `{ success: true, jobId, gstin, mode, streamUrl: '/api/gstr2b/job-stream/' + jobId, pollUrl: '/api/gstr2b/job/' + jobId }`.
  2. `GET /api/gstr2b/job-stream/:jobId`:
     - Protected by `authenticateToken` (since `app.use('/api/gstr2b', auth)` applies).
     - Sets SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`) matching `notices/autopilot.js:30-33`.
     - Immediately emits `SNAPSHOT` event with current job state (`phase`, `months`, `events`), streams incremental `STEP` / `MONTH_DONE` / `LOGIN_ERROR` / `SESSION_EXPIRED` / `COMPLETE` events, emits `: heartbeat\n\n` every `15s` to keep Vite proxy / localtunnel alive, and calls `res.end()` on terminal state.
     - Cleans up `listeners.delete(res)` and heartbeat `clearInterval` on `req.on('close')` / `res.on('close')`.
  3. `GET /api/gstr2b/job/:jobId`:
     - Returns JSON snapshot `{ success: true, job: sanitizeJobSnapshot(job) }` for polling fallback (`1500ms` interval if SSE stream drops or `ReadableStream` is unavailable).
  4. **Backward-Compatible `POST /api/gstr2b/portal-sync-browser`:**
     - If `req.body.async === true`, behaves identically to `POST /api/gstr2b/jobs/start` and returns `{ success: true, async: true, jobId, ... }`.
     - Otherwise (preserving `ReturnsAutoIngestDeck.tsx:845` and `ReturnsDashboard.tsx:1644`), executes through the **exact same `createAndRunAutopilotJob(...)`** engine, attaches `X-Autopilot-Job-Id` header, awaits the job completion promise, and returns the exact legacy response payload (`success`, `gstin`, `period`, `status`, `invoiceCount`, `excelPath`, `jsonPath`, `metrics`, `isFullYear`, `months`, `consolidatedExcelPath`).
     - **Important Node/Express Fix:** Use `res.on('close', () => { if (!res.writableEnded) ... })` instead of `req.on('close')` inside synchronous `portal-sync-browser` so reading the POST body never falsely triggers browser termination.
- **Frontend SSE Hook / Helper (in `Gstr2bMasterDownloader.tsx` or `src/lib/gstr2bJobClient.ts`):**
  - Uses `safeApiFetch('/api/gstr2b/job-stream/' + jobId, { signal })` so `Authorization: Bearer <token>` and `bypass-tunnel-reminder: true` headers are sent automatically (`src/lib/api.ts:67-84`).
  - Reads `res.body.getReader()` with a **line buffer** (`buffer += decoder.decode(value, { stream: true })`, splitting on `\n\n` event blocks instead of naive per-chunk `split('\n')`).
  - If `res.body` is unavailable or stream throws prematurely while job is still active, seamlessly switches to `GET /api/gstr2b/job/:jobId` polling every `1500ms` until terminal status.

### 3.2 Playwright Engine Hardening (`gstr2b/autopilot.js`)

1. **Visible Chrome + 1-Time Human CAPTCHA (Never Headless, Never Solved/Proxied):**
   - Keep `launchAutopilotBrowser(chromiumModule.chromium, { headless: false, slowMo: 50, ... })`.
   - Auto-fill `#username` and `#user_pass` from `clients` vault, focus `#captcha`, bring window to front, and emit `emitJobEvent('WAITING_CAPTCHA', ...)` so the React Live Console prompts the CA to type the CAPTCHA directly in Chrome.
2. **Explicit Login Error Detection (`G2B-BP-07`):**
   - Replace passive `page.waitForFunction(...)` with a `500ms` polling loop (max `180s`) that checks:
     a) `signal.aborted` / `page.isClosed()` → clean cancel.
     b) Success condition (URL `/auth/`, `/dashboard`, `/quicklinks/`, `/returns/` and `!url.includes('/login')`, or logout button visible).
     c) Visible portal error text inside `.err`, `.alert-danger`, `.error-msg`, `[ng-show*="err"]`, or body text matching `/invalid\s*captcha|incorrect\s*captcha|valid\s*captcha|invalid\s*username|invalid\s*password|wrong\s*password|account\s*(is\s*)?locked|too\s*many\s*attempts/i`.
     - If locked: abort immediately with `{ phase: 'LOGIN_ERROR', fatal: true }`.
     - If invalid CAPTCHA / credentials: emit `LOGIN_ERROR` telemetry event to the Live Console (with extracted portal message), keep Chrome open so operator can correct CAPTCHA/password without losing the browser window (deduplicate repeated identical error messages).
3. **Mid-Loop Session Expiry Detection (`G2B-BP-07`):**
   - Extract `detectPortalSessionExpired(page)` helper checking:
     - `url.includes('/services/login')` or `url.includes('sessionExpired')` after login completed, OR
     - visible modal/body text matching `/session\s*(has\s*)?expired|please\s*login\s*again|logged\s*out\s*due\s*to\s*inactivity|unauthorized\s*access/i`.
   - Call `detectPortalSessionExpired(page)` before `selectPeriodAndSearch`, after `SEARCH`, and before `clickDownloadLinks`.
   - On expiry: mark remaining unprocessed months `SESSION_EXPIRED`, emit `SESSION_EXPIRED` event, leave all prior `SYNCED` / `NIL_SYNCED` months untouched in SQLite, close browser cleanly, and terminate loop with crisp user guidance (`"Re-run failed/remaining months to resume from Month X"`).
4. **JSON-First Priority + Live GSTR-2B API Interception + 45–60s Generation Poll (`G2B-BP-05`):**
   - **Live API Interception (`page.on('response')`):**
     - Alongside existing GSTR-1 listener (keep or scope cleanly), inspect HTTP `200` JSON responses whose URL matches `/gstr2b|r2b|2b\/|ret2b/i` or whose parsed body contains `data?.docdata` / `docdata` / `itcsumm` / `cpsumm`.
     - Verify payload GSTIN (`raw.gstin || raw.data?.gstin`) matches `gstinUpper` (if present) and `fp` normalizes to `activeSyncPeriod` before accepting into `intercepted2bPayload`.
     - Also capture `raw.data?.itcsumm || raw.itcsumm` and `raw.data?.cpsumm || raw.cpsumm` as authoritative `portalSummary` for `G2B-BP-09` checksum!
   - **JSON-First `clickDownloadLinks` Priority:**
     1. Ready JSON download link (`download` / `click here` + `json`, or table link ending/labeled `.json`).
     2. Ready Excel download link (`download` / `click here` + `excel`, or `table tr td a`).
     3. `GENERATE JSON FILE` / `GENERATE JSON` button (if no ready download link is visible yet).
     4. `GENERATE EXCEL` button (fallback).
   - **45–60s Portal Generation Retry Loop:**
     - If `GENERATE JSON` or `GENERATE EXCEL` was clicked (or portal shows `request has been received` / `in progress` / `generating`), enter a `55000ms` wait loop checking every `1000ms` for new files / `intercepted2bPayload`, and every `10000ms` click any ready download link or in-page `REFRESH` / `Refresh` `<button>` (excluding header/nav) until a file arrives or 55s expires.
     - If 55s expires without confirmed Nil return: preserve existing DB records, return `{ status: 'PENDING', count: 0 }`.
     - **Critical Race Fix:** Always `await Promise.race([Promise.all(Array.from(activeGstr2bDownloadPromises)), sleep(10000)])` inside `downloadAndProcess2b` itself before checking files or clicking `BACK`, so 12M loops never race ahead of `download.saveAs`.
5. **Isolated Per-Job/Period Download Directory & Strict Verification (`G2B-BP-06`):**
   - Compute `sessionRoot = path.resolve(process.cwd(), 'scratch', 'downloads', 'gstr2b')`.
   - Build safe path segments (`sanitizePathSegment`):
     - `safeGstin = gstinUpper.replace(/[^A-Z0-9]/g, '')` (must match `/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/` or fallback sanitized alphanumeric).
     - `safeJobId = String(jobId).replace(/[^a-zA-Z0-9_-]/g, '')`.
     - `periodSlug = normalizeReturnPeriod(currentPeriodStr).replace(/[^a-zA-Z0-9]+/g, '_')` (e.g. `April_2025`).
   - Verify `targetDir.startsWith(sessionRoot + path.sep)` before `fs.mkdirSync(..., { recursive: true })`.
   - Point `activePeriodDirRef.current = targetDir` before initiating downloads; `page.on('download')` saves strictly into `activePeriodDirRef.current`.
   - Remove `os.homedir()/Downloads` scanning from `runGstr2bAutopilot` completely (`downloadAndProcess2b` checks ONLY `targetDir` + `intercepted2bPayload`).
   - **Strict Payload Verification before Persistence:**
     - Require `(parseResult.gstin ? parseResult.gstin.toUpperCase() === gstinUpper : true)` — if `parseResult.gstin` is present and mismatches `gstinUpper`, **reject** ingestion (`MISMATCH_GSTIN`)!
     - Require `(parseResult.period ? normalizeReturnPeriod(parseResult.period) === normalizeReturnPeriod(currentPeriodStr) : true)` — if parsed period is present and mismatches `currentPeriodStr`, **reject** ingestion (`MISMATCH_PERIOD`)!
6. **`onlyPeriods` & `skipSynced` Support (`G2B-BP-02`):**
   - Normalize `onlyPeriods` (if array provided) via `normalizeReturnPeriod`.
   - In `isFullYear` mode: if `skipSynced` is true, query `gstr2b_batches` for `(UPPER(client_gstin) = ? AND return_period IN (...))` where `status IN ('SYNCED', 'PUSHED_TO_3B', 'NIL_SYNCED') AND COALESCE(verify_status, 'UNVERIFIED') != 'PARTIAL_VERIFY'`.
   - Skip already clean months (`emitJobEvent('MONTH_SKIPPED', ...)`), loop only remaining target months, then consolidate all 12 months from SQLite into `GSTR2B_SectionWiseSummary_${safeGstin}_${cleanFy}.xlsx` (saved inside `scratch/downloads/gstr2b/${safeGstin}/${safeJobId}/`).

### 3.3 Database Normalization, Audit Checksum & `fy-summary` Telemetry

1. **Canonical Period Helper (`gstr2b/db.js` / `gstr2b/periods.js`):**
   Export `normalizeReturnPeriod(periodStr, idtFallback = '')` and `buildStrictPeriodFilter(period)` from `gstr2b/db.js` (and share exact logic in `src/lib/gstr2bPeriods.ts` or `Gstr2bMasterDownloader.tsx`):
   - Supported inputs → Canonical `"Month YYYY"`:
     - `"042025"`, `"04-2025"`, `"04/2025"` → `"April 2025"`
     - `"2025-04"`, `"2025/04"` → `"April 2025"`
     - `"April, 2025"`, `"Apr 2025"`, `"APR-2025"`, `"april   2025"` → `"April 2025"`
     - Fallback to `idtFallback` (`DD-MM-YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`) when `periodStr` is empty.
   - Update `buildStrictPeriodFilter(period)`: first normalize via `normalizeReturnPeriod(period)` so `"042025"` or `"Apr 2025"` always produces exact `IN ('April 2025', 'April, 2025', '042025', '04-2025', '04/2025', 'Apr 2025')` candidates with **zero** `%Month%` wildcard `LIKE` clauses.
   - Enforce `normalizeReturnPeriod` at write boundaries in:
     - `parseGstr2bExcelHelper` (`L154` & `L187`)
     - `parseGstr2bJsonHelper` (`L206`, `L362`, and attach `return_period: normalizedPeriod` on pushed invoices)
     - `recalculate2bBatchMetrics`, `bulkSaveGstr2bInvoices`, `markGstr2bMonthNilSynced` in `gstr2b/db.js`
     - `/summary`, `/invoices`, `/clear`, `/cancel`, `/scan-downloads`, `/ingest`, `/push-to-3b`, `/jobs/start`, `/portal-sync-browser` in `gstr2b_routes.js` (keeping `buildStrictPeriodFilter` on reads/deletes so any legacy rows stored pre-upgrade as `"042025"` or `"April, 2025"` still match seamlessly!).
2. **Portal Summary vs Parsed Checksum (`G2B-BP-09`):**
   - Add idempotent columns to `gstr2b_batches` inside `initGstr2bDatabase(db)` (`gstr2b/db.js:94`):
     - `verify_status TEXT DEFAULT 'UNVERIFIED'`
     - `verify_warning TEXT`
     - `portal_summary_json TEXT`
   - Capture `portalSummary` in `autopilot.js` from two non-intrusive sources:
     a) GSTR-2B JSON `data.itcsumm` / `data.cpsumm` (available in GSTN GSTR-2B JSON structure: `itcsumm.itcavl.nonrevsup`, `itcsumm.itcavl.revsup`, `itcsumm.itcavl.isd`, `itcsumm.itcavl.impg`, `cpsumm` counts).
     b) Visible GSTR-2B dashboard card / summary table DOM metrics (if portal displays invoice counts or ITC totals before/during download).
   - Export pure helper `verifyGstr2bBatchChecksum(parsedMetrics, portalSummary)` in `gstr2b/db.js`:
     - If `portalSummary` is absent/incomplete → `{ verifyStatus: 'UNVERIFIED', warning: null }`.
     - If `portalSummary.totalInvoices` is known and differs from `parsedMetrics.totalInvoices`, OR `Math.abs(portalSummary.eligibleItcTotal - parsedMetrics.eligibleItcTotal) > 2.0` → `{ verifyStatus: 'PARTIAL_VERIFY', warning: 'Portal reported X invoices / ₹Y ITC vs parsed A invoices / ₹B ITC' }`.
     - Else → `{ verifyStatus: 'VERIFIED', warning: null }`.
   - **Golden Rule Preservation:**
     - If portal summary reports `totalInvoices > 0` while parsed file produced `0` invoices (corrupt/truncated download), **abort persistence** and keep prior SQLite data intact!
     - If parsed invoices > 0 but count/ITC differs (`PARTIAL_VERIFY`), persist verification metadata (`verify_status = 'PARTIAL_VERIFY'`, `verify_warning`, `portal_summary_json`), keep `status = 'SYNCED'` (preserving downstream `returns_storage_routes.js:2747` & `push-to-3b` compatibility), and surface the `PARTIAL_VERIFY` badge prominently in the UI!
3. **`GET /api/gstr2b/fy-summary` Per-Month Breakdown (`G2B-BP-02`):**
   - Expand SQL query in `gstr2b_routes.js:151-170` to select: `b.b2ba_count, b.cdnra_count, b.isd_count, b.impg_count, b.eligible_itc_igst, b.eligible_itc_cgst, b.eligible_itc_sgst, b.eligible_itc_cess, b.ineligible_itc_total, b.verify_status, b.verify_warning, b.updated_at`.
   - Add `monthDetails` map to each client in `/api/gstr2b/fy-summary` keyed by canonical period (`"April 2025"` ... `"March 2026"`):
     ```json
     "monthDetails": {
       "April 2025": {
         "period": "April 2025",
         "month": "April",
         "status": "SYNCED",
         "totalInvoices": 94,
         "b2bCount": 82,
         "cdnrCount": 12,
         "eligibleItcTotal": 412800.5,
         "ineligibleTotal": 14200,
         "verifyStatus": "VERIFIED",
         "verifyWarning": null,
         "updatedAt": 1762770000000
       }
     }
     ```
   - Accumulate `b2baCount`, `cdnraCount`, `isdCount`, `impgCount`, `ineligibleTotal`, and `eligibleItc.{igst,cgst,sgst,cess,total}` in `c.stats` so the 8-chip grid renders real database totals.
   - Normalize `c.gstin` joins with `UPPER(TRIM(c.gstin)) = UPPER(TRIM(b.client_gstin))` in `/summary` and `/fy-summary` (and handle legacy period aliases if present via `normalizeReturnPeriod(r.return_period)`).

---

## 4. Security & Anti-Footgun Analysis

1. **Golden Rule Zero-Data-Loss Invariant:**
   - Never call `DELETE FROM gstr2b_invoices` unless `invoices.length > 0` AND parsed GSTIN/period match AND (if portal summary indicates non-empty) parsed rows > 0.
   - Never mark a timed-out download as `NIL_SYNCED`; only explicit portal confirmation ("No records available" / valid parsed 0-record file) triggers `markGstr2bMonthNilSynced`.
   - `POST /api/gstr2b/cancel` MUST NOT overwrite `SYNCED`, `PUSHED_TO_3B`, or `NIL_SYNCED` batch statuses to `'CANCELLED'`, and MUST use `buildStrictPeriodFilter(p)` rather than `%Month%` wildcards (`gstr2b_routes.js:519`).
2. **No CAPTCHA Bypass / Solving:**
   - Strictly forbidden per project rules & Phase 36 D-02: never OCR, extract, proxy, or auto-solve `#captcha`. Always launch visible Chrome (`headless: false`), auto-fill vault username/password, focus `#captcha`, and let the human operator enter CAPTCHA in Chrome.
3. **Path Traversal & File Isolation (`jobId` / `gstin` / `periodSlug`):**
   - `jobId`, `gstin`, and `returnPeriod` enter from HTTP requests or parsed files. Always sanitize via strict whitelist (`/[^A-Z0-9_-]/g`) and assert `path.resolve(targetDir).startsWith(path.resolve(baseDir) + path.sep)` before `fs.mkdirSync` or `download.saveAs`.
   - Reject `parseResult.gstin !== gstinUpper` or mismatched `parseResult.period` before DB writes so crafted/wrong files cannot poison another client's or period's ledger.
4. **Windows Chromium Cleanup & Process Leak Prevention:**
   - Track both `job.browserRef.current` AND `browser.process()?.pid`.
   - On `cancel`, `abortController.abort()`, `SIGTERM`/`SIGINT`, or `browser.on('disconnected')`: call `await browser.close().catch(() => {})`; if `process.platform === 'win32'` and the PID is still alive after 1500ms fallback, invoke `taskkill /PID <pid> /T /F` (wrapped safely with numeric-only PID validation `Number.isInteger(pid) && pid > 0`) so orphaned `chrome.exe` processes never leak or hold file locks in `scratch/downloads/gstr2b`.
5. **SSE Connection & Memory Leak Prevention:**
   - In `GET /api/gstr2b/job-stream/:jobId`, attach cleanup to BOTH `req.on('close')` and `res.on('close')` to `clearInterval(heartbeatTimer)` and `job.listeners.delete(res)`.
   - Guard `res.write(...)` with `!res.writableEnded && !res.destroyed`.
   - Cap `job.events` to max 200 entries and expire finished jobs after 30 minutes.
   - In React (`Gstr2bMasterDownloader.tsx`), abort `AbortController` and clear polling timers inside `useEffect` cleanup on unmount so background SSE/poll loops never update unmounted state (while keeping the backend job running safely if the user navigates or cancels explicitly).
6. **Batch Queue Abort Race (`Gstr2bMasterDownloader.tsx`):**
   - Initialize `batchAbortRef.current = new AbortController()` at the start of `handleStartBatchSync`, pass `signal: batchAbortRef.current.signal` to `safeApiFetch`, check `if (signal.aborted) break;` before AND after each client in `runBatchQueue`, and call `handleCancelTask` when the batch modal X / Close button is clicked while running.
7. **Official `<button>` BACK Navigation & Zero URL Push:**
   - Retain `gstr2b/autopilot.js:497-516` & `1096-1128` rules intact (`button, input[type="button"]` exact `'BACK'`, excluding nav/header/breadcrumb `<a>` tags, and never calling `page.goto('https://return.gst.gov.in/...')`).

---

## 5. Validation / Nyquist Architecture

Vitest (`vitest.config.ts`) runs under `jsdom` with globals enabled via:
```powershell
node ./node_modules/vitest/vitest.mjs run src/test/gstr2bScrutiny.test.ts src/test/gstr2bAutopilotScrutiny.test.ts src/test/gstr2bBulletproof.test.ts
```
*(Note: on this Windows machine `npx.ps1` can be blocked by PowerShell ExecutionPolicy; invoking `node ./node_modules/vitest/vitest.mjs run ...` executes cleanly in ~4s.)*

### Exact Verification Suite (`src/test/gstr2bBulletproof.test.ts` + existing `gstr2bScrutiny.test.ts` & `gstr2bAutopilotScrutiny.test.ts`)

1. **Canonical Period Normalization (`G2B-BP-08`):**
   - `normalizeReturnPeriod('042025') === 'April 2025'`, `'01-2026' === 'January 2026'`, `'April, 2025' === 'April 2025'`, `'Apr 2025' === 'April 2025'`, `'2025-11' === 'November 2025'`, and fallback from `idt` (`'15-05-2025' → 'May 2025'`, `'2025-05-15' → 'May 2025'`).
   - `parseGstr2bJsonHelper` with `fp: '042025'` returns canonical `period: 'April 2025'` and sets `return_period: 'April 2025'` on all extracted invoices.
   - `bulkSaveGstr2bInvoices(db, gstin, '042025', ...)` followed by `'April, 2025'` updates the single canonical `'April 2025'` batch row without duplicates.
2. **Strict Period Filter & Cancel Isolation (`G2B-BP-07`):**
   - `buildStrictPeriodFilter('April 2025')` returns exact `IN (...)` candidates matching `April 2025`, `April, 2025`, `042025`, `04-2025`, `04/2025` and **does not match** `April 2024` or `April 2026` in SQLite.
   - Cancelling `April 2025` never modifies `April 2024` batches AND never overwrites an existing `SYNCED` or `NIL_SYNCED` batch to `CANCELLED`.
3. **Path Isolation & Payload Verification (`G2B-BP-06`):**
   - Path builder rejects traversal (`../`, `..\\`) in `jobId`/`gstin`/`periodSlug` and always resolves inside `scratch/downloads/gstr2b/`.
   - Payload verification rejects parsed GSTIN mismatch or parsed period mismatch while leaving prior DB invoices untouched (Golden Rule).
4. **Checksum Audit (`G2B-BP-09`):**
   - `verifyGstr2bBatchChecksum` returns `VERIFIED` within ₹2 tolerance & equal invoice count, `PARTIAL_VERIFY` when invoice count or ITC differs > ₹2, and `UNVERIFIED` when no portal summary is available.
   - Simulated truncated 0-invoice download against non-zero portal summary preserves existing SQLite rows.
5. **Async Job Registry & `skipSynced` / `onlyPeriods` Filtering (`G2B-BP-02`, `G2B-BP-04`):**
   - `gstr2b/jobs.js` job lifecycle transitions (`QUEUED` → `WAITING_CAPTCHA` → `SYNCING_MONTH` → `COMPLETED` / `SESSION_EXPIRED` / `CANCELLED`), single active job per GSTIN, listener subscription & cleanup on disconnect.
   - `filterTargetPeriods` with `skipSynced: true` skips `SYNCED`/`NIL_SYNCED` months in SQLite and retains `PENDING`/`FAILED`/`PARTIAL_VERIFY` months.
6. **Frontend Cockpit Component & `fy-summary` Contract (`G2B-BP-01` .. `G2B-BP-03`):**
   - Rendering `Gstr2bMasterDownloader` with mocked `safeApiFetch`:
     - Clicking **Full FY 12 Months Autopilot Loop** updates `viewMode` to `'FULL_YEAR'` and fetches `/api/gstr2b/fy-summary` + launches job with `isFullYear: true`.
     - Switching `selectedMonth` to `'January'` under FY `'2025-26'` targets `'January 2026'` (not `'January 2025'`).
     - Timeline badges render exact per-month counts from `monthDetails` (not `totalInvoices / 7`) and zero hardcoded `849275` / `'Siddha Edibles Pvt Ltd'` demo data when API returns empty clients.
     - Clicking **Inspect Invoices** invokes `/api/gstr2b/invoices/...` and populates the modal.
     - Clicking **Re-Run Failed Months** passes `skipSynced: true` and `onlyPeriods` excluding `SYNCED`/`NIL_SYNCED` months.
     - Aborting batch sync stops `runBatchQueue` immediately after the aborted client.
7. **Zero-Merge & Regression Gate:**
   - Re-run existing `src/test/gstr2bScrutiny.test.ts` (11 tests) and `src/test/gstr2bAutopilotScrutiny.test.ts` (2 tests) to confirm 100% pass rate with zero regressions.
