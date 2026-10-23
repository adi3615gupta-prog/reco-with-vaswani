# Phase 7 Research: Browser Autopilot Chrome-First Architecture & Windows Client Hardening

## 1. Problem Investigation & Root Cause

### Reported Behavior
On installing the packaged Windows application on a client machine (e.g. PC-14), initiating GSTR-2B or IMS download opens Microsoft Edge rather than Google Chrome, despite Google Chrome being installed on the user's computer.

### Source Code Audit

#### A. Inverted Cascade in `gstr2b/autopilot.js` (Lines 98–109)
```javascript
try {
    browser = await chromiumModule.chromium.launch(browserLaunchOptions);
    console.log('[GSTR-2B Autopilot] Launched dedicated bundled Chromium');
} catch (e) {
    try {
        browser = await chromiumModule.chromium.launch({ ...browserLaunchOptions, channel: 'msedge' });
        console.log('[GSTR-2B Autopilot] Launched system Microsoft Edge');
    } catch (edgeErr) {
        browser = await chromiumModule.chromium.launch({ ...browserLaunchOptions, channel: 'chrome' });
        console.log('[GSTR-2B Autopilot] Launched system Google Chrome');
    }
}
```

#### B. Missing Chrome Fallback in `gstr2b/autopilot.js` (Lines 1351–1355)
```javascript
try {
    browser = await chromiumModule.chromium.launch(browserLaunchOptions);
} catch(e) {
    browser = await chromiumModule.chromium.launch({ ...browserLaunchOptions, channel: 'msedge' });
}
```

#### C. Inverted Cascade in `ims_routes.js` (Lines 1522–1533)
```javascript
try {
    browser = await playwright.chromium.launch(browserLaunchOptions);
} catch (e) {
    try {
        browser = await playwright.chromium.launch({ ...browserLaunchOptions, channel: 'msedge' });
    } catch (edgeErr) {
        browser = await playwright.chromium.launch({ ...browserLaunchOptions, channel: 'chrome' });
    }
}
```

#### D. Root Cause Mechanics
1. **Absence of Bundled Chromium on Client Machines:** The Electron installer does not package the ~300 MB Playwright Chromium binary in `%LOCALAPPDATA%\ms-playwright`. Therefore, `chromium.launch(browserLaunchOptions)` throws `Executable doesn't exist at ... Run "npx playwright install"`.
2. **Edge Pre-installed by Windows:** Microsoft Edge is installed out-of-the-box on every Windows 10 and Windows 11 operating system.
3. **Execution Trap:** When `chromium.launch()` fails, the code enters the `catch` block and immediately attempts `channel: 'msedge'`. Because Edge is guaranteed to exist on Windows, this attempt **always succeeds**. The secondary catch block containing `channel: 'chrome'` is **never executed**.
4. **Login session ignores Chrome entirely:** In `gstr2b/autopilot.js:1354`, `channel: 'chrome'` was omitted entirely.

---

## 2. Technical Solution: Chrome-First Priority Cascade

### Playwright Browser Discovery Strategy
Playwright supports launching installed browsers via the `channel` parameter:
- `channel: 'chrome'`: Searches Windows registry and standard paths:
  - `C:\Program Files\Google\Chrome\Application\chrome.exe`
  - `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`
  - `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`
- Direct Path Detection: To provide resilience against non-standard registry registrations, detect whether `chrome.exe` physically exists in standard candidate directories and supply `executablePath` as an option if channel search fails.

### Revised Launch Hierarchy
```
┌─────────────────────────────────────────────────────────────┐
│ 1. PRIORITY 1: Google Chrome (channel: 'chrome' / path)    │
│    -> Matches user familiarity and CA portal standard      │
└──────────────────────────┬──────────────────────────────────┘
                           │ (If Chrome not installed)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. PRIORITY 2: Bundled Playwright Chromium                  │
│    -> Used in development environments with ms-playwright   │
└──────────────────────────┬──────────────────────────────────┘
                           │ (If bundled Chromium absent)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. PRIORITY 3: Microsoft Edge (channel: 'msedge')           │
│    -> Graceful safety net: prevents crashes on Edge-only PC│
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Architecture & Modularization Plan

### A. Shared Helper: `gstr2b/browserLauncher.js`
Create an exported helper function `launchAutopilotBrowser`:
```javascript
export async function launchAutopilotBrowser(chromiumEngine, options = {}) {
    // 1. Prepare base options
    // 2. Try Google Chrome
    // 3. Try Bundled Chromium
    // 4. Try Microsoft Edge
    // Returns { browser, engineType: 'chrome' | 'chromium' | 'msedge' }
}
```

### B. Standardized Chromium Flags
Ensure all browser launches continue using established stealth and anti-bot flags:
- `--start-maximized`
- `--disable-blink-features=AutomationControlled`
- `--no-sandbox`
- `--no-first-run`
- `--no-default-browser-check`
- `--disable-infobars`
- `--disable-extensions`

### C. Affected Modules
1. `gstr2b/autopilot.js` — Main 12-Month / Single Month visible loop (line 98) & login helper (line 1351)
2. `ims_routes.js` — Inward IMS batch request & download (line 1522)
3. `gstr1/autopilot.js` — GSTR-1 visible loop (line 112)
4. `server.js` — Portal GSTIN Search CAPTCHA solver (line 1010)

---

## 4. Verification & Testing Strategy
1. **Mock Test / Switch Test:** Execute Node script verifying that when Chrome is present, `launchAutopilotBrowser` launches Google Chrome (`channel: 'chrome'`) and records `engineType: 'chrome'`.
2. **Fallback Simulation:** Simulate missing Chrome by pointing to non-existent executable to verify that it gracefully falls back to Edge without crashing.
3. **End-to-End Build Verification:** Rebuild obfuscated bundle and check that all autopilot routes invoke the new helper.
