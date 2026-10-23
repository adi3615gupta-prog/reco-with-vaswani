# Phase 8 Context: Autopilot Runtime Execution & Production Database Hardening

## User Decision & Objective
The user selected **Option A** across all architectural areas:
1. **Database Seeding Strategy (Option A - Defense in Depth):**
   - Ship master `network_data.db` in `resources/` via `extraResources` in `package.json`.
   - On server startup, if `userDataPath/network_data.db` does not exist or has 0 clients, automatically seed/copy the 400+ clients and credentials from the bundled master database.
   - Additionally, pass `portal_username` and `portal_password` directly from the frontend UI payload in `POST /api/gstr2b/portal-sync-browser` as a defense-in-depth fallback.
2. **Obfuscator Shielding (Option A - Direct Shielding + Defensive Banner):**
   - Wrap `gstr2b/autopilot.js`, `gstr1/autopilot.js`, and `ims_routes.js` with `/* javascript-obfuscator:disable */` and `/* javascript-obfuscator:enable */`.
   - This ensures all browser evaluations (`page.evaluate`, `page.waitForFunction`) remain clean, native JavaScript, eliminating `ReferenceError: _0x505e80 is not defined` inside Chrome.
   - Wrap DOM injections and banner operations in resilient try/catch blocks so visual styling errors never halt the autopilot sequence.
3. **User Experience on Launch (Option A - Full Assistive Focus):**
   - Visible Chrome opens with `--start-maximized`.
   - `#username` and `#user_pass` are automatically populated.
   - Focus is automatically set to the `#captcha` field so the practitioner only types the CAPTCHA code and presses Enter/Login.
   - Blue assistive top banner indicates client identity and confirms credentials have been filled.
   - As soon as the URL leaves `/login`, autopilot detects authentication and navigates directly to Returns Dashboard.

## Scope Boundaries
- **In Scope:**
  - `gstr2b/autopilot.js`: Obfuscator disable markers, try/catch around banner, fallback credentials from `req.body`.
  - `gstr1/autopilot.js`: Obfuscator disable markers.
  - `ims_routes.js`: Obfuscator disable markers.
  - `gstr2b_routes.js`: Extract `portal_username` and `portal_password` from `req.body` and pass to `runGstr2bAutopilot`.
  - `src/components/Gstr2bMasterDownloader.tsx`: Pass client's `portalUsername` and vault credentials in `POST /api/gstr2b/portal-sync-browser`.
  - `server.js`: Implement `ensureProductionDatabase()` to seed `network_data.db` into `userDataPath` on startup.
  - `package.json`: Add `network_data.db` to `build.extraResources`.
  - Obfuscation and build verification.

## Success Criteria
1. Packaged Electron app has all 400+ clients with usernames/passwords loaded in `userDataPath`.
2. Chrome window opens, auto-fills username and password, and focuses on CAPTCHA.
3. Zero `ReferenceError: _0x...` in `backend.log`.
4. Autopilot advances seamlessly to period selection and downloads 2B.
