# Phase 36: GSTR-2B Inward ITC Autopilot Bulletproof Hardening - Codebase Patterns

**Mapped:** 2026-11-10
**Scope:** `.planning/phases/36-gstr2b-autopilot-bulletproof-hardening/36-CONTEXT.md` (D-01 through D-12)
**Status:** Pattern reference for Phase 36 planning

---

## 1. Cross-Cutting Architecture & Auth Constraints

### 1.1 JWT Auth Middleware vs. Browser `EventSource` (CRITICAL)
- **`server.js:120-129` (`authenticateToken`)**: Reads the JWT exclusively from the HTTP `Authorization` header (`req.headers['authorization']?.split(' ')[1]`). It returns `401` if the header is missing, `'null'`, `'undefined'`, or fails `jwt.verify`. It does **not** read `req.query.token` or cookies.
- **`server.js:360` & `gstr2b_routes.js:21-25`**: `setupGstr2bRoutes(app, db, authenticateToken)` mounts `app.use('/api/gstr2b', auth)`. Every `/api/gstr2b/*` endpoint requires `Authorization: Bearer <token>`.
  - Contrast with `notices_routes.js`: `server.js:370` calls `setupNoticesRoutes(app, db)` **without** `authenticateToken`, which is why notices routes work without an auth header.
- **Why `new EventSource(...)` Will Fail (`401`):** Browser-native `EventSource` cannot send custom HTTP request headers such as `Authorization: Bearer <token>`. Pointing `new EventSource('/api/gstr2b/job-stream/:jobId')` at an auth-protected route will immediately return `401 Unauthorized`.
- **Required Pattern — `safeApiFetch` + `ReadableStream` (`getReader()`) + Polling Fallback:**
  - `src/lib/api.ts:67-108` (`safeApiFetch`), `113-121` (`getToken`), `126-137` (`authHeaders`), `53-62` (`getApiBase`), `199` (`getAuthToken`): `safeApiFetch` automatically attaches `Authorization: Bearer ${token}` (when `np_token` exists in `sessionStorage`/`localStorage`) and `bypass-tunnel-reminder: true`, tries `${getApiBase()}${path}`, and falls back to relative Vite proxy path then `http://localhost:3001${relPath}`.
  - Frontend SSE stream consumer analog: `src/pages/GstNoticesDashboard.tsx:431-463` uses `fetch` + `response.body.getReader()` + `new TextDecoder()` to parse SSE `event:` / `data:` frames line-by-line. Phase 36 should use `safeApiFetch('/api/gstr2b/job-stream/' + jobId)` with `getReader()` so Bearer auth and LAN/Electron URL fallback work identically to all other `/api/gstr2b` requests, paired with `GET /api/gstr2b/job/:jobId` polling via `safeApiFetch`.
  - **Existing Auth Gap to Note (`Gstr2bMasterDownloader.tsx:370-374`):** `handleDownload12mExcelDirect` calls `window.open(\`${getApiBase()}/api/gstr2b/export-full-year/...\`, '_blank')`, which omits the `Authorization` header. Converting binary downloads to `safeApiFetch` + `res.blob()` + `URL.createObjectURL` prevents `401` when auth tokens are enforced.

### 1.2 Vite Dev Proxy Timeout Hazard
- **`vite.config.ts:5-28, 54-63`**: `/api` is proxied to `http://127.0.0.1:3001` via `silenceProxyErrors('http://127.0.0.1:3001')` **without** extended `timeout` / `proxyTimeout` (unlike `/tally-api` at line 9, which explicitly sets `timeout: 180000, proxyTimeout: 180000`).
- Long-running synchronous `POST /api/gstr2b/portal-sync-browser` calls (2–5+ minutes for 12-month loops) therefore risk proxy/browser disconnects, making D-06 (async job start + SSE stream + polling snapshot) essential.

### 1.3 Production Bundle & Playwright `page.evaluate()` Obfuscation Guard
- **`package.json:19-20` & `obfuscate.cjs:6-86`**: `npm run obfuscate` bundles `server.js` into `server.cjs` via `esbuild` and runs `javascript-obfuscator` (string arrays, hex identifiers, object key transformation).
- **`gstr2b/autopilot.js:1, 1545` & `gstr1/autopilot.js:1`**: Both wrap Playwright modules with `/*! javascript-obfuscator:disable */` at the top and `/*! javascript-obfuscator:enable */` at the bottom because functions passed to `page.evaluate(...)` are serialized via `.toString()` into the browser context and break if obfuscated.
- Any new Playwright browser evaluation helpers in `gstr2b/autopilot.js` (or `gstr2b/jobs.js` if it touches Playwright) must keep `/*! javascript-obfuscator:disable */` protection intact.

### 1.4 Playwright Transient IPC Exception Guard
- **`server.js:45-58`**: Global `uncaughtException` and `unhandledRejection` handlers suppress transient Playwright IPC errors (`'was not bound in the connection'`, `'Target page, context or browser has been closed'`). Job runners should still wrap every `page.*` / `browser.close()` in defensive `.catch(() => {})` and treat closed-page errors as user cancellation or terminal state rather than crashing Express.

---

## 2. Target Artifact Pattern Mappings

### Target 1: `gstr2b/jobs.js` (New Module — Job Registry & SSE Stream Emitter)
- **Primary Analogs:**
  - `notices/autopilot.js:29-42` — SSE HTTP response headers and framing:
    ```js
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    // Frame format: `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    ```
  - `gstr2b_routes.js:27-28, 475-494` & `notices_routes.js:21, 32-41` — `activeBrowsers = new Map()` keyed by normalized `gstinUpper` with `{ current: browser }` wrapper for cancel/focus lookup.
- **Conventions to Follow:**
  - Pure ES Module (`import { randomUUID } from 'crypto'` — matching `gstr2b/db.js:1` and `package.json:8` `"type": "module"`).
  - **Job Registry State Shape:** Store jobs in an in-memory `Map<jobId, JobRecord>` (plus an active index by `gstinUpper` so concurrent runs for the same GSTIN supersede or cancel cleanly and `POST /api/gstr2b/cancel` can locate the job by either `jobId` or `gstin`).
  - **Event Replay + Snapshot:** Because the frontend starts a job with `POST` and subscribes to `GET /api/gstr2b/job-stream/:jobId` afterward (or reconnects mid-run), `subscribeToJobStream(jobId, req, res)` should immediately emit a `SNAPSHOT` (or replay buffered events/logs) upon SSE connect, stream live events (`JOB_STARTED`, `PHASE_CHANGE`, `WAITING_CAPTCHA`, `LOGIN_SUCCESS`, `LOGIN_ERROR`, `MONTH_START`, `MONTH_DONE`, `LOG`, `SESSION_EXPIRED`, `COMPLETED`, `FAILED`, `CANCELLED`), emit periodic SSE heartbeat comments (`: keepalive\n\n`) so localtunnel/proxies do not drop idle connections while waiting up to 180s for CAPTCHA, and clean up `res` from `job.subscribers` on `req.on('close', ...)`.
  - **Bounded Log Buffer & TTL Cleanup:** Cap `job.logs` (e.g., last 200 entries) and retain completed job snapshots in memory with a TTL cleanup timer so `GET /api/gstr2b/job/:jobId` polling continues returning final status after the stream ends.

---

### Target 2: `gstr2b/autopilot.js` (Playwright Automation Hardening)
- **Current File:** `gstr2b/autopilot.js:1-1547`.
- **Analogs & Required Patterns:**
  1. **Browser Launcher (`gstr2b/browserLauncher.js:39-132`):**
     - Keep `launchAutopilotBrowser(chromiumModule.chromium, browserLaunchOptions)` with `headless: false`, `--start-maximized`, `--disable-blink-features=AutomationControlled`, `--no-sandbox`, `--no-first-run`, `--no-default-browser-check` (D-01).
     - Keep `focusDesktopWindow` PowerShell `WScript.Shell` + `scratch/bring_to_front.ps1` pattern (`gstr2b/autopilot.js:121-143`).
  2. **Vault Lookup & Login Auto-Fill (`gstr2b/autopilot.js:32-50, 224-279`):**
     - Retain SQLite `clients` vault lookup (`SELECT trade_name, legal_name, portal_username, portal_password FROM clients WHERE gstin = ?`), Angular input/change/blur event dispatch, 800ms post-username wait, `#captcha` focus, and assistive top banner (`#antigravity-2b-banner`) (D-02).
  3. **Live API Response Interception (`page.on('response')`):**
     - Analogs: `gstr2b/autopilot.js:340-366` (already intercepts GSTR-1 JSON XHRs checking `response.status() === 200` and `content-type`) and `ims_routes.js:1695-1712` (checks `resourceType() === 'xhr' || 'fetch'` and `ct.includes('application/json')`).
     - Apply this pattern for live GSTR-2B API JSON payloads: capture `200` XHR/fetch JSON responses matching GSTR-2B API endpoints (e.g., containing `docdata` / `b2b` / `cdnr` / `itcsumm`), tag with `{ gstin, fp }`, and verify against the active client GSTIN and active period before accepting (D-07, D-08).
  4. **JSON-First Download & 45–60s Generation Polling (D-07):**
     - Current `gstr2b/autopilot.js:941-984` (`clickDownloadLinks`) checks Excel download links before JSON links and clicks `GENERATE EXCEL`. Reverse priority to:
       1) Live intercepted GSTR-2B API JSON payload (matching current GSTIN & period),
       2) Ready JSON download link (`download` / `click here` + `json`, or table link),
       3) `"GENERATE JSON FILE"` button + active 45–60s poll with in-page refresh (analogous to `gstr1/autopilot.js:866-938` & `ims_routes.js:2376-2408` polling loop checking ready link vs `"in progress"` / `"processed"` / `"no records"`),
       4) Excel / ZIP download fallback.
  5. **Isolated Per-Job/Period Download Directory (D-08):**
     - Analogs: `notices/autopilot.js:54` (`scratch/downloads/notices/${gstinUpper}`), `gstr1/autopilot.js:52` (`scratch/downloads/gstr1/${gstinUpper}`).
     - Current `gstr2b/autopilot.js:68-69, 1045-1089` writes to `scratch/downloads/gstr2b/${gstinUpper}` and scans `path.join(os.homedir(), 'Downloads')`.
     - Pattern for Phase 36: write downloads strictly to `path.join(process.cwd(), 'scratch', 'downloads', 'gstr2b', gstinUpper, jobId, periodSlug)` via `download.saveAs(savePath)` and **remove** global `os.homedir()/Downloads` scanning from automated runs so concurrent or stale user files never cross-contaminate a month.
  6. **Explicit Login Error & Mid-Loop Session Expiry Detection (D-09):**
     - Current `gstr2b/autopilot.js:315-322` waits up to 180s for URL/DOM to leave `/login` without checking visible login errors.
     - Poll login page alert containers (`.err`, `.alert-danger`, `.error`, `[ng-show*="err"]`, visible error text for invalid CAPTCHA, invalid credentials, locked account) while waiting for login, emitting structured `LOGIN_ERROR` / `CAPTCHA_RETRY` telemetry without crashing immediately if user can re-enter CAPTCHA, or failing cleanly on locked/bad credentials.
     - Inside the 12-month loop (`gstr2b/autopilot.js:1171-1215`), check before and after `selectPeriodAndSearch` whether `page.url().includes('/login')` or body text indicates session timeout/logout; if expired, emit `SESSION_EXPIRED`, mark remaining unstarted months cleanly as `SESSION_EXPIRED` without overwriting previously synced months, and close cleanly.
  7. **Preserved Navigation & Golden Rule Guardrails (D-10 & Phase 4):**
     - Keep `ensureReturnsSearchScreen` (`gstr2b/autopilot.js:477-561`), `clickReturnsDashboardInPage` (`439-474`), and `clickBackImmediately` (`1096-1128`): target official on-screen `<button>` / `<input type="button">` `'BACK'` excluding `.navbar, .breadcrumb, nav, header` (zero `<a>` tags, zero `page.goto` to `return.gst.gov.in`).
     - Support optional `onlyPeriods` / `skipSynced` (D-05) and `onEvent` / `abortSignal` hooks when invoked from `gstr2b/jobs.js` while keeping compatibility when called directly.
  8. **Portal Summary Card Extraction for Checksum (D-12):**
     - While on the GSTR-2B summary / download page, scrape visible GSTR-2B ITC summary table/card numbers (`IGST`, `CGST`, `SGST`, `Cess`, document counts if shown) and pass to `db.js` verification helper alongside parsed invoices.

---

### Target 3: `gstr2b/db.js` (Canonical Period Keys & Audit Checksum)
- **Current File:** `gstr2b/db.js:1-856`.
- **Analogs & Required Patterns:**
  1. **Canonical Period Normalization (D-11):**
     - Backend analog: `gstr1/parsers.js:20-31, 44-52` (`normalizePeriod` normalizing `"April, 2025"` and `"042025"` -> `"April 2025"`).
     - Frontend analog: `src/components/Gstr2bMasterDownloader.tsx:97-121` (`normalizeReturnPeriod` handling `"042025"`, `"April, 2025"`, and `idt` fallback).
     - Export `normalizeReturnPeriod(periodStr, fallbackDate)` from `gstr2b/db.js` handling `"042025"`, `"04-2025"`, `"04/2025"`, `"Apr 2025"`, `"April, 2025"`, `"APRIL 2025"` -> canonical `"April 2025"`. Apply inside `recalculate2bBatchMetrics`, `bulkSaveGstr2bInvoices`, `markGstr2bMonthNilSynced`, `getInvoicesWithAllocations`, `bulkSaveItcAllocations`, and `saveGstr1Summary`.
  2. **Idempotent Schema Migrations (`gstr2b/db.js:94-115`):**
     - `initGstr2bDatabase(db)` uses `const addCol = (colDef) => { db.run(\`ALTER TABLE gstr2b_batches ADD COLUMN ${colDef}\`, () => {}); };`.
     - Add checksum/verification columns to `gstr2b_batches` using the exact same `addCol(...)` pattern (e.g., `verify_status TEXT`, `portal_summary_json TEXT`, `verify_diff_json TEXT`, `last_error TEXT`, `job_id TEXT`) so existing SQLite databases self-migrate without breaking `initGstr2bDatabase`.
  3. **Golden Rule Non-Destructive Persistence (`gstr2b/db.js:217-220, 370-486, 519-571`):**
     - `bulkSaveGstr2bInvoices`: keep `if (!invoices || invoices.length === 0) return resolve({ count: 0 });` early return, `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK`, deterministic MD5 ID (`createHash('md5').update(invKey).digest('hex')`), and `recalculate2bBatchMetrics` fallback to `'PENDING'` (preserving `'NIL_SYNCED'`) when `totalInvs === 0`.
     - If D-12 portal summary vs parsed SQLite checksum mismatches, record `verify_status = 'VERIFY_MISMATCH'` and mismatch diff details **without** deleting or wiping previously validated invoices.

---

### Target 4: `gstr2b/parsers.js` (Verification & Period Canonicalization)
- **Current File:** `gstr2b/parsers.js:1-665` (GSTR-2B helpers at lines 1-395).
- **Observations & Patterns:**
  - `parseGstr2bExcelHelper(filePath, fallbackGstin, fallbackPeriod)` (`lines 42-190`) returns `{ dealerName, gstin, finYear, period, invoices }`. Line 154 currently only strips commas (`rawPeriod.replace(/,/g, '').trim()`).
  - `parseGstr2bJsonHelper(jsonData, fallbackGstin, fallbackPeriod)` (`lines 194-365`) returns `{ gstin, period, invoices }`. Line 206 uses `raw.fp || raw.data?.fp || fallbackPeriod` (so `"042025"` stays `"042025"` unless normalized). Also check whether `raw.data?.itcsumm` or `raw.itcsumm` is present in portal JSON so parser can optionally expose `portalSummary` without breaking existing `{ gstin, period, invoices }` return keys tested by `src/test/gstr2bScrutiny.test.ts:175-208`.
  - `parseGstr2bZipHelper(zipPath, fallbackGstin, fallbackPeriod)` (`lines 369-395`) extracts `.xlsx`/`.xls` or `.json` via `JSZip`.
  - **Verification Helper (D-08):** Add/export a payload verification helper (e.g., `verifyParsedGstr2bPayload(parsed, expectedGstin, expectedPeriod)`) checking uppercase GSTIN match and canonicalized `normalizeReturnPeriod` match (when present in the file) before `bulkSaveGstr2bInvoices` persists rows, while preserving backward compatibility for callers and existing tests in `src/test/gstr2bScrutiny.test.ts`.

---

### Target 5: `gstr2b_routes.js` (Async Jobs, Per-Month FY Stats, Strict Period Filter)
- **Current File:** `gstr2b_routes.js:1-859`.
- **Analogs & Required Patterns:**
  1. **`buildStrictPeriodFilter(period)` (`gstr2b_routes.js:317-347` & `gstr1_routes.js:334-364`):**
     - Already exists in `gstr2b_routes.js:317` and is used in `/invoices/:gstin` (line 391) and `DELETE /clear/:gstin` (line 445).
     - `POST /api/gstr2b/cancel` (`lines 517-532`) currently runs an unsafe wildcard query `return_period LIKE ?` with `monthPattern = %${m}%`. Replace with `buildStrictPeriodFilter(p)` (D-10) so cancelling `"May 2025"` never hits unrelated periods. Also ensure `/cancel` accepts optional `jobId` as well as `gstin` and aborts via `gstr2b/jobs.js`.
  2. **Per-Month Breakdown in `GET /api/gstr2b/fy-summary` (D-05):**
     - Exact analog: `gstr1_routes.js:192-331` (`GET /api/gstr1/fy-summary`), which builds a `clientObj.months[p]` map over all 12 `fyMonths` with `{ status, invoices, ... }` per month!
     - `gstr2b_routes.js:139-259` currently aggregates totals across rows and returns `syncedMonths`, `nilMonths`, `pendingMonths`, but **omits** per-month counts/ITC. Note also line 168 joins `b.return_period IN (${placeholders})` — normalizing periods on write + optionally querying normalized/variant periods ensures legacy DB rows match cleanly.
     - Add `monthStats` (keyed by month period e.g. `"April 2025"` or month key) containing `{ status, totalInvoices, b2bCount, cdnrCount, eligibleItcTotal, verifyStatus, lastError }` so `Gstr2bMasterDownloader.tsx` renders real counts instead of `Math.round(totalInvoices / 7)`. Note: keep existing fields (`syncedMonths`, `nilMonths`, `pendingMonths`, `syncedCount`, `status`, `stats`) unchanged so no consumer breaks.
     - Also check overview field naming discrepancy: `gstr2b_routes.js:253-254` returns `overview.totalEligibleItc` and `overview.totalInvoices`, whereas `Gstr2bMasterDownloader.tsx:216-217` reads `data.overview.total12mEligibleItc || 0` and `data.overview.total12mInvoices || 0` (which currently evaluate to `0`!). Aligning/returning both or matching keys fixes that KPI discrepancy too.
  3. **Job Endpoints & Backward Compatibility (D-06):**
     - Add `GET /api/gstr2b/job-stream/:jobId` (SSE stream via `gstr2b/jobs.js`) and `GET /api/gstr2b/job/:jobId` (JSON polling snapshot).
     - **Important Consumer Compatibility Note:** `POST /api/gstr2b/portal-sync-browser` is currently called synchronously (`await res.json()` expecting `{ success, message, status, invoiceCount }`) by:
       - `src/components/ReturnsAutoIngestDeck.tsx:845-859`
       - `src/pages/ReturnsDashboard.tsx:1644-1658`
       - Therefore, either keep `POST /api/gstr2b/portal-sync-browser` supporting async mode via `{ async: true }` (or add `POST /api/gstr2b/portal-sync-job` / update both callers to use a shared job-runner helper that starts the job + awaits completion via SSE/poll). Updating `ReturnsAutoIngestDeck.tsx` (explicitly in Phase 36 target list) and checking `ReturnsDashboard.tsx:1644` guarantees neither breaks.
  4. **Period Canonicalization Across Ingestion Endpoints (D-11):**
     - Apply `normalizeReturnPeriod` in `/scan-downloads` (`line 582`), `/ingest` (`line 642`), `/push-to-3b` (`line 671`), and `/summary` (`line 71`) / `DELETE /clear/:gstin` (`line 445`).

---

### Target 6: `src/components/Gstr2bMasterDownloader.tsx`
- **Current File:** `src/components/Gstr2bMasterDownloader.tsx:1-1804`.
- **Analogs:** `src/components/Gstr1MasterDownloader.tsx` (12-month cockpit layout & polling) and `src/pages/GstNoticesDashboard.tsx:422-476` (SSE `getReader()` live progress consumer).
- **Concrete Bugs & Fixes Mapped:**
  1. **`viewMode` Unification (D-04):**
     - State at `line 133` is `useState<'MONTH' | 'FULL_YEAR'>('MONTH')`, and lines `197, 211, 345, 418, 484, 614, 1336, 1349, 1771` check `viewMode === 'FULL_YEAR'`.
     - Segmented buttons at `lines 825-839` call `setViewMode('SINGLE')` / `setViewMode('12M')` and compare `viewMode === 'SINGLE'` / `'12M'`. (Same pattern bug exists in `Gstr1MasterDownloader.tsx:770-785`.)
     - Fix: change lines `825-839` to `'MONTH'` and `'FULL_YEAR'` with strict TypeScript union type `'MONTH' | 'FULL_YEAR'` (no `as any`). Also update the cockpit action button label dynamically when in `'MONTH'` vs `'FULL_YEAR'` mode.
  2. **Replace Static `849275` Mock Box with Live Autopilot Console (D-03):**
     - Replace `lines 950-1017` (`Portal CAPTCHA Resolver`, `849275`, `OCT 24 CHALLENGE`) with a **Live Autopilot Console** showing:
       - Active job phase badge (`IDLE` | `LAUNCHING` | `WAITING_CAPTCHA` | `AUTHENTICATED` | `DOWNLOADING` | `SESSION_EXPIRED` | `COMPLETED` | `FAILED` | `CANCELLED`)
       - Live current month (`Month X/12: Downloading...`) & explicit login/CAPTCHA error alert if portal rejects input
       - Scrollable event log list (from SSE/polling `job.logs`)
       - `"Bring Browser to Front"` (`POST /api/gstr2b/bring-to-front`) and `"Cancel"` (`POST /api/gstr2b/cancel`) controls.
     - Note: `lines 1725-1801` also render a legacy HUD modal (`activeAutopilotClient`) — unify or keep HUD modal synced with the live job state so single-client runs from the `300+ Clients Overview` table also show live telemetry without duplicate abort race conditions.
  3. **Real `monthStats`, `Inspect Invoices`, `Re-Run Failed Months`, and `runBatchQueue` Abort (D-05):**
     - Remove fake demo fallback counts (`|| 702`, `|| 7`, `|| 6`, `|| 1`, `|| 540`, etc. at lines `702-733, 908, 940, 943, 1034-1043, 1088, 1130-1137`) when real `clients` data exists or render explicit `0` / empty state when no client is loaded.
     - Render per-month invoice count & eligible ITC from `activeCockpitClient.monthStats?.[period]` in the 12-month timeline grid (`lines 1049-1095`), including `FAILED` / `SESSION_EXPIRED` / `VERIFY_MISMATCH` badges.
     - Wire footer `Inspect Invoices` (`line 1171`) and table `Inspect` (`line 1299`) to `handleOpenClientDetails(...)` (`line 476`) instead of raw `setActiveClientDetail(...)`.
     - Wire `Re-Run Failed Months` (`line 1178`) to pass `onlyPeriods` (pending/failed/session-expired months) and `skipSynced: true` so `SYNCED` and `NIL_SYNCED` months are skipped.
     - Fix `runBatchQueue` (`lines 396-446`): instantiate `batchAbortRef.current = new AbortController()`, pass `signal: batchAbortRef.current.signal` to `safeApiFetch`, and check `if (batchAbortRef.current?.signal.aborted)` before starting each client and before recursing to `index + 1` (and when closing the Batch modal at lines `1555, 1607`, also trigger `handleCancelTask` / abort).
  4. **SSE + Polling Subscription Pattern:**
     - Subscribe to `GET /api/gstr2b/job-stream/${jobId}` via `safeApiFetch` + `response.body.getReader()` + `TextDecoder` (analog: `GstNoticesDashboard.tsx:431-463`). If stream errors or closes unexpectedly before terminal status, fall back to polling `GET /api/gstr2b/job/${jobId}` every 2s via `safeApiFetch` until terminal state (`COMPLETED` | `FAILED` | `CANCELLED` | `SESSION_EXPIRED`), then refresh `fetchSummary()`.

---

### Target 7: `src/components/ReturnsAutoIngestDeck.tsx` (Module 01 Card 2 Consumer)
- **Current File:** `src/components/ReturnsAutoIngestDeck.tsx:753-778` (`handleCancelGstr2b`), `830-1005` (`handleGstr2bAutopilotSync`), `1008-1020` (`handleSyncBothAutopilot`).
- **Integration Pattern:**
  - Currently calls `safeApiFetch('/api/gstr2b/portal-sync-browser', { method: 'POST', ... })` (`line 845`), expects completion, then fetches `/api/gstr2b/invoices/${gstin}?period=${targetPeriod}` (`line 865`) and calls `onApplyIngestedReturns(null, newlyFound2b)` (`line 985`).
  - `handleSyncBothAutopilot` (`lines 1008-1020`) sequentially `await`s `handleGstr1AutopilotSync()` and `handleGstr2bAutopilotSync()`.
  - To benefit cleanly from Phase 36 backend hardening without breaking `handleSyncBothAutopilot` or `ReturnsDashboard.tsx:1644`:
    - Either share a frontend async job-runner utility (e.g., `src/lib/gstr2bAutopilotClient.ts` used by both `Gstr2bMasterDownloader.tsx` and `ReturnsAutoIngestDeck.tsx`) that calls the async endpoint, streams SSE progress into `setGstr2bAutopilotStep(event.message)` (giving live step telemetry in the Card 2 button!), and resolves only on terminal job completion; AND/OR keep `POST /api/gstr2b/portal-sync-browser` backward-compatible when `async` flag is omitted so `ReturnsDashboard.tsx:1644` continues working unmodified.
    - Store `activeGstr2bJobId` / `AbortController` ref so `handleCancelGstr2b` (`line 753`) aborts the stream and sends `{ gstin, returnPeriod: targetPeriod, jobId }` to `POST /api/gstr2b/cancel`.

---

### Target 8: `src/test/gstr2bBulletproof.test.ts` (New Vitest Suite)
- **Test Runner & Environment:**
  - `package.json:17`: `"test": "vitest run"` (`vitest` `^3.2.4`).
  - `vitest.config.ts:5-16`: `environment: "jsdom"`, `globals: true`, `setupFiles: ["./src/test/setup.ts"]`, `include: ["src/**/*.{test,spec}.{ts,tsx}"]`, alias `@` -> `./src`.
- **Exact Analogs:**
  - `src/test/gstr2bScrutiny.test.ts:1-678`: Uses `sqlite3.Database(':memory:')`, calls `initGstr2bDatabase(db)`, `bulkSaveGstr2bInvoices`, `markGstr2bMonthNilSynced`, `recalculate2bBatchMetrics`, and `parseGstr2bJsonHelper` directly via relative ESM imports (`../../gstr2b/db.js`, `../../gstr2b/parsers.js`).
  - `src/test/noticesScraper.test.ts:1-58`: Tests SSE emission with mock Express `req` / `res` (`setHeader: vi.fn()`, `flushHeaders: vi.fn()`, `write: vi.fn(...)`, `end: vi.fn()`).
  - `src/test/tallyXmlSuiteUi.test.tsx:1-150`: React component testing using `@testing-library/react` (`render`, `screen`, `fireEvent`, `waitFor`, `act`) + `vi.mock(...)`.
  - `src/test/monthlyAuditBackend.test.ts:1-250`: SQLite schema, index, constraint, and status-transition assertions.
- **Test Patterns to Include in `gstr2bBulletproof.test.ts`:**
  1. **Period Canonicalization (`gstr2b/db.js` & `gstr2b/parsers.js`):** Assert `"042025"`, `"04-2025"`, `"April, 2025"`, `"Apr 2025"`, and `"April 2025"` all resolve to `"April 2025"` without duplicate rows or collisions in `gstr2b_batches` / `gstr2b_invoices`.
  2. **Golden Rule + Checksum (`VERIFY_MISMATCH`):** Verify failed/empty saves preserve existing rows, `NIL_SYNCED` stays explicit, and mismatched portal summary metadata flags `VERIFY_MISMATCH` without deleting validated invoices.
  3. **Job Registry & SSE Framing (`gstr2b/jobs.js`):** Verify job creation, event buffering & replay for late subscribers, cancellation propagation, and `res.write` SSE frame formatting (`event: ...\ndata: {...}\n\n`).
  4. **Routes & Strict Period Filter (`gstr2b_routes.js`):** Register routes against a lightweight Express-style mock `app` (`get`/`post`/`delete` handler map) with in-memory `sqlite3` DB + mock `authenticateToken` to test:
     - `401` enforcement when unauthenticated
     - `GET /api/gstr2b/fy-summary` returns real per-month `monthStats`
     - `POST /api/gstr2b/cancel` updates only the strict target period (does not match `"May 2025"` against unintended months)
     - `GET /api/gstr2b/job/:jobId` and `GET /api/gstr2b/job-stream/:jobId`
  5. **UI Behavior (`Gstr2bMasterDownloader.tsx`):** Mock `safeApiFetch` (`vi.mock('@/lib/api', ...)`), verify `viewMode` toggles `'MONTH'` <-> `'FULL_YEAR'`, static `849275` mock is gone and Live Autopilot Console renders SSE/job telemetry, timeline badges display per-month `monthStats` counts, and `Inspect Invoices` invokes `/api/gstr2b/invoices/:gstin`.
