# Phase 8 Research: Autopilot Runtime Execution & Production Database Hardening

## 1. Problem Statement & Root Cause Evidence

### User Symptom
> "exe file install karne ke baad run ho rahi hai but jo chrome window popu ho raha hai but vo autopilot nahi ho raha hai na userid na passwrod auto fill up ho rahe na vo aage ja rha hai but jab mai local host pe chala raha hu toh sab chal rahi hai"
> *(The .exe file runs after installation, but the Chrome window that pops up does not execute autopilot: neither username nor password is auto-filled, nor does it move forward. However, on localhost, everything works.)*

### Forensic Evidence from `backend.log` (`AppData\Roaming\vite_react_shadcn_ts\backend.log`)
```
[STDOUT] ======================================================
[STDOUT] [GSTR-2B Autopilot] Starting session for 27AAKCC8195M1ZT (April 2025)
[STDOUT] [GSTR-2B Autopilot] Vault Username: (NOT CONFIGURED)
[STDOUT] ======================================================
[STDOUT] [GSTR-2B Autopilot] Launching visible browser for GSTIN 27AAKCC8195M1ZT...
[STDOUT] [Browser Launcher] Successfully launched Google Chrome (channel: chrome)
[STDOUT] [GSTR-2B Autopilot] Navigating to GST login...
[STDERR] [GSTR-2B Autopilot] Execution error: page.evaluate: ReferenceError: _0x505e80 is not defined
    at eval (eval at evaluate (:302:30), <anonymous>:1:314)
    at UtilityScript.evaluate (<anonymous>:304:16)
    at runGstr2bAutopilot (D:\RECO WITH VASWANI\AUDIT WITH VASWANI\resources\app.asar\server.obfuscated.cjs:1:14629292)
```

### Detailed Root Cause Breakdown

#### Issue A: Obfuscation-Induced Browser Execution Crash (`ReferenceError: _0x...`)
1. **The Conflict:** Node.js executes backend automation, but Playwright's `page.evaluate(() => { ... })` and `page.waitForFunction(() => { ... })` serialize functions (`.toString()`) and send them over Chrome DevTools Protocol (CDP) to run inside the Google Chrome browser window.
2. **The Obfuscator Transformation:** In `obfuscate.cjs`, `JavaScriptObfuscator` transforms `server.cjs` with `stringArray: true` and `stringArrayCallsTransform: true`. The obfuscator replaces string literals inside the browser-bound function with Node-level helper calls (e.g., `_0x505e80(0x123)`).
3. **The Crash:** When Chrome executes the serialized code inside the web page, `_0x505e80` does not exist in the browser's global `window` object. Chrome throws `ReferenceError: _0x505e80 is not defined`.
4. **Fatal Abortion:** In `gstr2b/autopilot.js` line 235, the banner injection `page.evaluate(...)` is executed without a try-catch block. The `ReferenceError` crashes the entire `runGstr2bAutopilot` function, aborting the process immediately before login is completed or period selection can start.
5. **Why it worked on Localhost:** In local development, `server.js` runs directly with Node.js without obfuscation. Strings are normal plain-text literals, so Chrome executes `page.evaluate()` without any `ReferenceError`.

#### Issue B: Database Partitioning in Packaged Electron (`Vault Username: (NOT CONFIGURED)`)
1. **Localhost:** `server.js` defaults `userDataPath = process.env.USER_DATA_PATH || '.'`. In development, `DB_PATH = './network_data.db'`, which contains 400+ clients with pre-configured portal credentials.
2. **Packaged App:** `main.cjs` sets `USER_DATA_PATH: app.getPath('userData')` (`AppData\Roaming\vite_react_shadcn_ts`). `server.js` connects to `AppData\Roaming\vite_react_shadcn_ts\network_data.db`.
3. **Missing Seed:** `network_data.db` was not configured in `package.json`'s `extraResources` or `build.files`. On a fresh installation, SQLite creates a brand-new, empty `network_data.db`.
4. **Empty Credentials:** `SELECT trade_name, legal_name, portal_username, portal_password FROM clients WHERE gstin = ?` returns `null` or records with `portal_username: null`.
5. **No Autofill:** `portalUser` is empty, so `if (portalUser)` does not fill `#username` or `#user_pass`.

---

## 2. Technical Architecture & Fix Plan

### Strategy 1: Protect Browser Evaluations from Obfuscation
1. Add `/* javascript-obfuscator:disable */` at the top and `/* javascript-obfuscator:enable */` at the bottom of:
   - `gstr2b/autopilot.js`
   - `gstr1/autopilot.js`
   - `ims_routes.js`
2. Wrap all assistive DOM injections (e.g. `antigravity-2b-banner`) in resilient try/catch blocks so that UI decoration errors never halt the compliance automation loop.
3. Replace complex object closures in `page.evaluate()` with safe JSON string passing.

### Strategy 2: Master Database Packaging & Auto-Seeding
1. In `package.json`, add `network_data.db` to `extraResources`:
   ```json
   "extraResources": [
     {
       "from": "network_data.db",
       "to": "network_data.db"
     }
   ]
   ```
2. In `server.js`: When initializing `DB_PATH = path.join(userDataPath, 'network_data.db')`:
   - If `DB_PATH` does not exist, or if the `clients` table contains 0 records:
   - Check candidate master DB locations:
     - `path.join(path.dirname(process.execPath), 'resources', 'network_data.db')`
     - `path.join(process.cwd(), 'network_data.db')`
     - `path.join(__dirname, 'network_data.db')`
   - If a master database is found, copy or seed `network_data.db` into `userDataPath`.
3. In `gstr2b/autopilot.js`: Allow `req.body.portal_username` and `req.body.portal_password` to be passed directly from the frontend request as an immediate fallback.

---

## 3. Verification Plan
1. Obfuscate `server.js` with the disable comments and verify via Node script that functions inside `page.evaluate()` contain ZERO `_0x...` identifiers.
2. Verify that `server.js` correctly seeds `network_data.db` in `userDataPath` when given an empty directory.
3. Test `gstr2b/autopilot.js` banner and login evaluation inside Playwright headless Chrome to verify 0 ReferenceErrors.
