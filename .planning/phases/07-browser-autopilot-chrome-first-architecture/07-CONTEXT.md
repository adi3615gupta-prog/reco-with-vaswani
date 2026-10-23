# Phase 7 Context: Browser Autopilot Chrome-First Architecture & Windows Client Hardening

## User Decision & Objective
- **User Request:** "maine pc me setup install kia uske baad 2b download krne ko gya toh microsoft edge open hua chrome nahi usko sahi krna hai"
- **Decision:** Prioritize Google Chrome (`channel: 'chrome'`) as the primary browser for all Playwright automation tasks (GSTR-2B, GSTR-1, IMS, GSTIN search). Fall back to bundled Chromium and finally to Microsoft Edge (`channel: 'msedge'`) only if Google Chrome is not installed on the system.

## Scope Boundaries
- **In Scope:**
  - Create centralized browser launch module `gstr2b/browserLauncher.js` (or `server_lib/browserLauncher.js`).
  - Update `gstr2b/autopilot.js` (both main loop and login helper) to use Chrome-first launcher.
  - Update `ims_routes.js` to use Chrome-first launcher.
  - Update `gstr1/autopilot.js` to use Chrome-first launcher.
  - Update `server.js` GSTIN lookup endpoint to use Chrome-first launcher.
  - Ensure all existing anti-automation flags (`--disable-blink-features=AutomationControlled`, `--start-maximized`, `--no-sandbox`) are preserved.
  - Verify that process termination on modal close / abort (`browserState.current = null`) works seamlessly.
- **Out of Scope:**
  - Changes to reconciliation matching algorithms or Excel export formats.
  - Modifying portal scraping selectors or navigation sequences.

## Success Criteria
1. When GSTR-2B or IMS download is initiated on any Windows machine with Google Chrome installed, Google Chrome opens visibly on screen (NOT Microsoft Edge).
2. If Google Chrome is not installed on the host PC, the automation does not fail or crash, but cleanly falls back to Microsoft Edge.
3. Clean process termination continues to function on user cancellation.
