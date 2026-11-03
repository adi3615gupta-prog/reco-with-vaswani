# Plan 32-02 Summary: Database Privacy & Credential Security, Reset Endpoint Auth & SSRF Prevention

**Completed Date:** 2026-11-03  
**Status:** Complete  
**Wave:** 2  

## 1. What was built and secured

1. **Untracked Sensitive Database and Credential Files from Git:**
   - Ran `git rm --cached` on `network_data.db`, `network_data.db.bak`, `network_users.json`, `audit_logs.json`, and `banned_users.json`.
   - Verified that `git ls-files` reports zero tracked instances.
   - Updated `.gitignore` to include `*.bak`.

2. **Removed Database from Installer ExtraResources:**
   - Removed `network_data.db` from `build.extraResources` in `package.json` to prevent packaging real client records and passwords into public installer executables.

3. **Guarded Destructive TDS Reset Endpoint:**
   - Updated `POST /api/tds/reset` in `tds_routes.js` to enforce `authenticateToken` middleware, admin role verification, and mandatory payload confirmation `{ confirm: 'RESET_ALL_TDS_DATA' }`.

4. **Eliminated Localhost SSRF Proxy Vector:**
   - Secured `POST /api/tally-proxy` in `server.js` with `authenticateToken`.
   - Constrained target port parsing strictly between `9000` and `9010`, rejecting arbitrary port targeting.

5. **Guarded Explorer Folder Launch Endpoint:**
   - Secured `POST /api/returns/open-folder` and `/open-storage-folder` in `returns_storage_routes.js` with `authenticateToken`.
   - Confined folder resolution strictly within authorized application and data directories.

## 2. Verification
- `git ls-files network_data.db network_users.json` confirmed 100% untracked.
- `npx tsc --noEmit` passed cleanly.
