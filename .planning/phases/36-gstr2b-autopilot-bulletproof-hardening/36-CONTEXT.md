# Phase 36: GSTR-2B Inward ITC Autopilot Bulletproof Hardening - Context

**Gathered:** 2026-11-10
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase upgrades **Suite 04 → Module 04 (`04. Inward 2B Autopilot` in `src/components/Gstr2bMasterDownloader.tsx` and its shared backend engine `gstr2b_routes.js`, `gstr2b/autopilot.js`, `gstr2b/db.js`, `gstr2b/parsers.js`)** from a fragile single-POST synchronous browser script with UI state mismatches into a resilient, observable, failure-proof production autopilot for both Single-Month and 12-Month Full FY GSTR-2B consolidation. It also guarantees that `ReturnsAutoIngestDeck.tsx` (`Sync GSTR-2B Autopilot` inside Module 01) benefits cleanly from backend hardening without breaking existing contracts.
</domain>

<decisions>
## Implementation Decisions

### 1. Execution Model: Visible Chrome + Human CAPTCHA (Never Headless, Never Script-Proxied CAPTCHA)
- **D-01 (Visible Browser Execution Only):** Retain Playwright `headless: false` (`--start-maximized`, `--disable-blink-features=AutomationControlled`). GSTN Akamai/WAF telemetry reliably permits interactive visible Chromium windows and lets CAs/operators watch live portal execution or minimize Chrome while the 12-month loop proceeds.
- **D-02 (1-Time Human CAPTCHA Directly in GST Portal Browser):** Vault credentials (`portal_username`, `portal_password`) auto-fill and `#captcha` receives focus, while the human operator types CAPTCHA and clicks Login directly inside the visible Chrome window. We explicitly do NOT extract/solve/proxy CAPTCHAs via OCR, AI, or external scripts.
- **D-03 (Live Autopilot Console Replacing Static `849275` Mock Box):** Replace the misleading right-hand static `Portal CAPTCHA Resolver` (`849275`, `OCT 24 CHALLENGE`) card in `Gstr2bMasterDownloader.tsx` with a real-time **Live Autopilot Console** displaying live phase telemetry (`Waiting for CAPTCHA in Chrome`, `Month X/12: Downloading...`, `Re-login Required`), scrollable event log, `"Bring Browser to Front"` button, and `"Cancel"` control.

### 2. UI State Bug Fixes & True Per-Month Telemetry
- **D-04 (ViewMode State Unification):** Align `viewMode` state across `Gstr2bMasterDownloader.tsx` (`'MONTH' | 'FULL_YEAR'`, matching `fetchSummary`, `handleRunAutopilot`, `runBatchQueue`, and `handleOpenClientDetails`). Remove `'SINGLE'` / `'12M'` mismatch so clicking Full FY 12 Months actually sets `isFullYear: true`.
- **D-05 (`Inspect Invoices`, True Monthly Counts & `Re-Run Failed Months`):**
  - Wire `Inspect Invoices` footer button to `handleOpenClientDetails(activeCockpitClient)` rather than raw `setActiveClientDetail`.
  - Expose per-month breakdown (`monthStats`) in `GET /api/gstr2b/fy-summary` so 12-month timeline badges show real per-month invoice counts & eligible ITC instead of `Math.round(totalInvoices / 7)`.
  - Pass `onlyPeriods` / `skipSynced: true` from `Re-Run Failed Months` so already `SYNCED` / `NIL_SYNCED` months are skipped.
  - Fix `runBatchQueue` to respect `batchAbortRef.current.signal` cleanly when cancelling multi-client sync.

### 3. Non-Blocking Async Job Engine & Playwright Hardening
- **D-06 (Job Registry + Real-Time SSE Progress Stream):** Introduce an in-memory Autopilot Job Manager (`startAutopilotJob`, `GET /api/gstr2b/job-stream/:jobId` SSE + `GET /api/gstr2b/job/:jobId` polling snapshot) while preserving backward-compatible behavior or seamless frontend cutover so 12-month runs (2–5+ minutes) never hit HTTP request/proxy timeouts or lose UI progress on state re-renders.
- **D-07 (JSON-First + Live API Interception + 45s Portal Generation Poll):** Check JSON download links & `"GENERATE JSON FILE"` first (and intercept live GSTR-2B API JSON payloads via `page.on('response')` just like GSTR-1), with Excel/ZIP fallback, and extend async portal generation retry polling to 45–60s with in-page refresh before falling back to `PENDING`.
- **D-08 (Isolated Session/Period Download Directory + Strict Payload Verification):** Save Playwright downloads exclusively to `scratch/downloads/gstr2b/${gstinUpper}/${jobId}/${periodSlug}` via `download.saveAs(...)` (no reading user's global `Downloads` folder during automated runs), and validate parsed GSTIN + `return_period` before calling `bulkSaveGstr2bInvoices`.
- **D-09 (Explicit Login Error & Mid-Loop Session Expiry Detection):** Detect portal invalid CAPTCHA / invalid password / locked account messages cleanly, and detect GSTN session expiry mid-loop so remaining months report crisp `SESSION_EXPIRED` status without corrupting prior synced data.
- **D-10 (Strict Period Filter on Cancel + Phase 4 Navigation Guardrails):** Update `POST /api/gstr2b/cancel` in `gstr2b_routes.js` to use `buildStrictPeriodFilter(p)` instead of `%Month%` `LIKE` wildcard; strictly preserve Phase 4 official `<button>`/`<input>` `BACK` navigation (zero `<a>` tags, zero `page.goto` URL push) and Golden Rule data preservation.

### 4. Canonical Database Keys & Audit Checksum
- **D-11 (Canonical Period Normalization):** Enforce `normalizeReturnPeriod()` (`"Month YYYY"`, e.g. `"April 2025"`) in `gstr2b/db.js` and ingestion endpoints so `"042025"` and `"April 2025"` never collide or create duplicate rows.
- **D-12 (Portal Summary vs Parsed Invoice Checksum):** Extract portal card summary metrics (when rendered on GSTR-2B dashboard) and cross-verify against parsed SQLite batch metrics; mark batch with `VERIFY_MISMATCH` metadata or warning notice if truncated without deleting existing validated records.

### Antigravity Builder's Discretion
- Specific CSS polish inside the Live Autopilot Console card to maintain Suite 04 Executive Enterprise Light aesthetics.
- Choosing SSE with lightweight polling fallback or dual-mode subscription hook for client reliability behind local dev proxies.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Frontend Cockpit & Consumers
- `src/components/Gstr2bMasterDownloader.tsx` — Module 04 UI cockpit, 12M timeline, 8-sheet chips, 300+ client table, batch queue.
- `src/components/ReturnsAutoIngestDeck.tsx` — Module 01 Card 2 GSTR-2B sync consumer (`handleGstr2bAutopilotSync`).
- `src/pages/ReturnsDashboard.tsx` — Suite 04 host component.

### Backend Engine & Persistence
- `gstr2b_routes.js` — Express endpoints (`/summary`, `/fy-summary`, `/invoices`, `/clear`, `/cancel`, `/portal-sync-browser`, `/scan-downloads`, `/ingest`, `/push-to-3b`).
- `gstr2b/autopilot.js` — Playwright automation loop (`runGstr2bAutopilot`, `ensureReturnsSearchScreen`, `selectPeriodAndSearch`, `downloadAndProcess2b`).
- `gstr2b/db.js` — SQLite schema (`gstr2b_batches`, `gstr2b_invoices`), `recalculate2bBatchMetrics`, `bulkSaveGstr2bInvoices`, `markGstr2bMonthNilSynced`.
- `gstr2b/parsers.js` — GSTR-2B Excel/JSON/ZIP parsers.

### Prior Phase History & Rules
- `.planning/phases/04-gstr2b-downloader-autopilot-deep-audit-hardening/04-CONTEXT.md` — Preserved Golden Rule, NIL return, and official `<button>` BACK constraints.
- `.agents/AGENTS.md` — Module 4 & Zero-Merge Excel architecture rules.
</canonical_refs>

