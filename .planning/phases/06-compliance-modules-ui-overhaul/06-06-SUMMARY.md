# Plan 06-06 Summary: Returns Preparation & Filing Layout & Header Re-Architecture

## Executive Summary
Reorganized the top header and control hierarchy of `ReturnsDashboard.tsx` (`04. Returns Preparation & Filing`) to match practitioner workflow ergonomic requirements, right-shifting the module title with refined typography, positioning server storage and client selection on the top-left, featuring the selected client prominently below, placing the FY selector and primary Save button side-by-side, and positioning the main tab bar directly underneath.

## Key Changes
1. **Top Header Bar:**
   - Moved "04. Returns Preparation & Filing" to the **top-right** with refined typography (`text-base sm:text-lg font-bold`) and a purple `GSTR-3B v2.0` badge.
   - Positioned the Server Storage path pill (with copy, open folder, and change path triggers) and LAN active indicator on the **top-left**.

2. **Client Command Deck:**
   - **Row B:** Placed `Switch Client` button on the top-left with search popover, along with Vault, Launch Login, and Upload .xlsx buttons.
   - **Row C:** Selected Client Name (`workingData.profile.firmName`) and GSTIN badge displayed prominently below client selection.
   - **Row D:** Placed Financial Year selector (`2025-26`, `2026-27`) to the left, and mounted the primary **Save Working** button right **beside it** (with emerald styling and saving indicator).
   - Positioned secondary actions (Export Excel, Export PDF, Portal JSON, Reset Sheet) on the right.

3. **Tabs & Productivity:**
   - Main 5-tab strip positioned directly below the command card.
   - Added global `Ctrl+S` / `Cmd+S` keyboard shortcut to save working paper instantly.
   - Reduced redundant top padding (`pt-10 md:pt-14` -> `pt-3 md:pt-4`) to eliminate wasted vertical scroll space.

## Verification
- `npx tsc --noEmit`: 0 errors.
- All client selection, financial year toggles, server storage handlers, and export routines fully preserved.
