---
phase: 07-browser-autopilot-chrome-first-architecture
plan: 01
type: summary
status: complete
completed_at: "2026-10-23T14:48:30.000Z"
files_modified:
  - gstr2b/browserLauncher.js
  - gstr2b/autopilot.js
  - ims_routes.js
  - gstr1/autopilot.js
  - server.js
  - server.cjs
  - server.obfuscated.cjs
---

# Plan 07-01 Summary: Browser Autopilot Chrome-First Priority Architecture

## Overview
Resolved the issue where launching GSTR-2B or IMS automation on fresh client installations opened Microsoft Edge instead of Google Chrome. Established a centralized, Chrome-First browser launcher with standard Windows path inspection, anti-detection flags, and graceful fallback cascades.

## Implementation Details

### 1. Centralized Chrome-First Launcher (`gstr2b/browserLauncher.js`)
- Created `launchAutopilotBrowser(chromiumEngine, customOptions)` and `getChromeExecutablePath()`.
- Priority cascade:
  1. **Google Chrome** (`channel: 'chrome'` or detected binary path).
  2. **Bundled Chromium** (if installed in `%LOCALAPPDATA%\ms-playwright`).
  3. **Microsoft Edge** (`channel: 'msedge'`) — graceful fallback only if Chrome is missing.
- Configured standardized stealth and stability flags (`--start-maximized`, `--disable-blink-features=AutomationControlled`, `--no-sandbox`, `--no-first-run`, `--no-default-browser-check`, `--disable-infobars`, `--disable-extensions`).

### 2. GSTR-2B Autopilot & Login Helper Refactor (`gstr2b/autopilot.js`)
- Replaced inverted try/catch blocks in the main 12-month loop with `launchAutopilotBrowser`.
- Replaced hardcoded edge fallback in the login helper session with `launchAutopilotBrowser`.
- Maintained request abort hooks and process cleanup (`browserState.current = null`).

### 3. IMS, GSTR-1 & Server GSTIN Search Refactor
- Refactored `ims_routes.js` to utilize `launchAutopilotBrowser` for visible portal downloads.
- Refactored `gstr1/autopilot.js` to eliminate hardcoded chromium folder path and use `launchAutopilotBrowser`.
- Refactored `server.js` (`/api/portal/import-client`) to launch Google Chrome first for manual CAPTCHA solving.

## Verification & Test Results
- Ran `scratch/test_browser_launcher.cjs`:
  - **Test 1:** Successfully detected physical Chrome path at `C:\Program Files\Google\Chrome\Application\chrome.exe`.
  - **Test 2:** Successfully launched Google Chrome headlessly via `channel: 'chrome'` and loaded verification page content.
  - **Test 3:** Simulated missing Chrome and verified clean fallback to `channel: 'msedge'`.
  - **Test 4:** Verified diagnostic error logging when all browser channels fail.
- Re-bundled and re-obfuscated `server.obfuscated.cjs` (`npm run obfuscate`) with 0 errors.
- Verified that `server.obfuscated.cjs` launches without syntax errors and serves API and static files.
