# Finpulse (`finpulse.co.in`) — Option 2 Cloud Migration Handoff

## 1. Goal & Constraints
- **Domain:** `finpulse.co.in` (registered on Hostinger; DNS moving to Cloudflare Free).
- **Budget / Payment Constraint:** Strictly **₹0 / Free tier only, NO credit or debit card** (rules out Oracle Cloud, AWS, GCP, Azure, Cloudflare R2).
- **Chosen Stack (Option 2):**
  - **Frontend (`finpulse.co.in`):** Cloudflare Pages (static Vite React bundle in `dist/`).
  - **Backend (`api.finpulse.co.in` / Render subdomain):** Render Free (512 MB RAM, ephemeral disk, 15-min idle sleep) running `server.js`.
  - **Database (replaces local `network_data.db`):** Turso Free (`@libsql/client`, 5 GB, SQLite-compatible, no card).
  - **File Persistence (replaces ephemeral disk writes):** Turso `cloud_files` table for JSON working files + optional Supabase Storage (1 GB free, no card) for `.xlsx`, `.pdf`, and `.zip` binaries.
- **Desktop Compatibility Requirement:** Must NOT break local Electron or Windows desktop mode — keep local `sqlite3` and local disk storage active whenever `TURSO_DATABASE_URL` and `PUBLIC_WEB_MODE` are not set.

---

## 2. Verified Codebase Findings

### A. Database Surface (~592 SQLite calls across 16 backend files)
- `server.js` (line 416) opens a single `sqlite3.Database` instance (`db`) and passes it into:
  - `gstr2b/db.js`, `gstr1/db.js`, `notices/db.js`
  - `ims_routes.js`, `monthly_audit_routes.js`, `returns_storage_routes.js`, `tds_routes.js`, `tax_routes.js`, `audit_storage_routes.js`, `audit_trail_routes.js`, `gemini_routes.js`, `gstr2b_routes.js`, `gstr1_routes.js`, `notices_routes.js`, `credentialsVaultSync.js`
  - Note: `audit_storage_routes.js` (line 114) only opens `new sqlite3.Database(dbPath)` if `db` is falsy.
- Any Turso `sqlite3`-compatible wrapper (`cloudDbAdapter.js`) MUST preserve:
  - `db.run`, `db.get`, `db.all`, `db.exec`, `db.serialize`
  - **28 `db.prepare(sql)` loops** (`stmt.run`, `stmt.finalize` across `gstr2b/db.js`, `gstr1/db.js`, `notices/db.js`, `ims_routes.js`, `monthly_audit_routes.js`, `returns_storage_routes.js`, `tds_routes.js`, `gstr2b_routes.js`) — batch operations inside `stmt.finalize()` via Turso `client.batch()` to prevent HTTP timeouts on bulk invoice inserts.
  - **`this.changes` and `this.lastID`** bound on `db.run` / `stmt.run` callbacks (16 locations across `audit_storage_routes.js`, `gstr2b_routes.js`, `ims_routes.js`, `monthly_audit_routes.js`, `notices_routes.js`, `tds_routes.js`, `gstr2b/db.js`).
  - **`BEGIN TRANSACTION`, `COMMIT`, and `ROLLBACK`** inside `db.serialize()` (`ims_routes.js`, `monthly_audit_routes.js`, etc.) — map to `@libsql/client` interactive `client.transaction('write')` instead of raw HTTP `BEGIN` statements.
  - Parameter & PRAGMA safety: convert `undefined` params to `null` (required by `@libsql/client`) and gracefully no-op local PRAGMAs (`journal_mode = WAL`, `busy_timeout`, `synchronous`).

### B. Ephemeral Local Disk Writes (~181 file operations across 14 files)
- `returns_storage_routes.js` (75 ops): `gst_returns_data/`, `annual_gstr3b_working.json`, `gstr3b_<month>.json`, `save-full-bundle`, `save-gstr1-bundle`, `clients-hub`, `reco_history/`.
- `monthly_audit_routes.js` (34 ops): `monthly_audits/`, `release-client`, `save-directory`.
- `server.js`: `server_config.json` (`JWT_SECRET`), `audit_logs.json`, `banned_users.json`.
- `cryptoVault.js`: `.vault_key` (already prioritizes `process.env.VAULT_MASTER_KEY`).
- `gdrive_routes.js`: `gdrive_admin_config.json`.
- `credentialsVaultSync.js`: `central_clients_vault.json`.

### C. Security, Runtime & Cloud Blockers in `server.js`
- **Critical Admin Auto-Login Bypass (`server.js` lines 178–198, 1659, 2030):**
  `getIsLocal()` and `isLocalConn` auto-authenticate loopback (`127.0.0.1` / `::1`) as `admin` unless `activeTunnel` is active. Behind Render / Cloudflare proxy, the socket IP is loopback — **must disable loopback auto-login** when `PUBLIC_WEB_MODE === 'true'`, `RENDER`, `TURSO_DATABASE_URL`, or proxy headers (`x-forwarded-for`, `cf-connecting-ip`, `x-forwarded-host`) are present. Also set `app.set('trust proxy', 1)` for rate limiters.
- **CORS & Helmet CSP (`server.js` lines 113–139, 307–342):**
  Allow `https://finpulse.co.in`, `https://www.finpulse.co.in`, `https://app.finpulse.co.in`, and `process.env.ALLOWED_ORIGINS` (plus `*.pages.dev` previews if configured).
- **Dynamic Port & Route Order (`server.js` lines 140, 2665–2670):**
  Change `const PORT = 3001` to `Number(process.env.PORT) || 3001`. Move `app.get(/(.*)/, ...)` catch-all **after** `/api/network/servers` and handle missing `dist/index.html` cleanly when Render deploys backend-only.
- **512 MB RAM & Desktop-Only Guardrails:**
  - Do **not** auto-spawn Python `LevitateExtract/main.py` (`server.js` lines 2735–2774) in cloud mode (high OOM risk in 512 MB RAM).
  - `scripts/cma/cma_generator.py` (`/api/cma/generate` at `server.js` line 2589): add JS (`exceljs`, already in `package.json`) fallback or graceful `503` in Node-only cloud mode.
  - Guard Playwright routes (`/api/portal/import-client`, `gstr2b`, `gstr1`, `ims`, `notices`, `gstr_tracking`) and Tally proxy routes (`/api/tally-proxy`, `/api/tally/test-connection` hitting `127.0.0.1:9000`) with a clear `503` message in `PUBLIC_WEB_MODE` ("Available in Desktop App").
  - Note `package.json`: `npm start` runs dev `concurrently`; Render must install with `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install` and start `node server.js`.

### D. Frontend (`src/`)
- `src/lib/api.ts` already reads `import.meta.env.VITE_PROD_API_URL`, but should strip trailing slashes and handle Render cold-start `502`/`503` wakeup retries.
- `src/pages/Index.tsx` (lines 1653–1880) displays `LandingPage` first (`!visitedLanding`), then enforces License Activation (`appMode === 'server' && !isActivated`) and Login (`!isAuthenticated`) via `server.js` (lines 470–474 default `appMode` to `'server'` on web).

### E. Existing Test Invariants (`src/test/securityHardening.test.ts` — MUST KEEP PASSING)
- `authenticateToken` in `server.js` must NOT contain `'local_admin'` or `"host.startsWith('localhost')"`.
- `returns_storage_routes.js` must NOT contain `'storageConfig.dataPath'`.
- `monthly_audit_routes.js` must NOT contain `'path.resolve(userDataPath'` or `'process.cwd()'`.
- Preserve all existing `server.js` security assertions (`TUNNEL_BLOCKED_PREFIXES`, `encryptSecret(JWT_SECRET)`, etc.).

---

## 3. Implementation Tasks
1. Install `@libsql/client` and create `cloudDbAdapter.js` implementing full `sqlite3`-compatible API (`run`, `get`, `all`, `exec`, `serialize`, `prepare`/`finalize` batching, `this.changes`/`this.lastID`, transactions), tested against local `:memory:`/`file:` libSQL in Vitest.
2. Create `cloudStorage.js` (storing JSON/working files in Turso `cloud_files` table + optional Supabase Storage REST API for binaries) and wire it into `returns_storage_routes.js`, `monthly_audit_routes.js`, `server.js` (`audit_logs`, `banned_users`), `gdrive_routes.js`, and `credentialsVaultSync.js`.
3. Harden `server.js` for Render + Cloudflare Pages (`PUBLIC_WEB_MODE`, `PORT`, `trust proxy`, `getIsLocal()`/`isLocalConn`, CORS/CSP for `finpulse.co.in`, route order, disabling `LevitateExtract` spawn & Playwright/Tally desktop-only endpoints in cloud mode).
4. Update `src/lib/api.ts` (normalize `VITE_PROD_API_URL`, Render cold-start retry UX) and optionally implement JS `exceljs` fallback for `/api/cma/generate`.
5. Add `render.yaml`, update `.env.example`, and create `scripts/migrate_sqlite_to_turso.mjs` to upload existing `network_data.db` and `gst_returns_data/` into Turso.
6. Run `npm run build` and `npx vitest run src/test/securityHardening.test.ts` plus new adapter tests to verify zero regressions.
