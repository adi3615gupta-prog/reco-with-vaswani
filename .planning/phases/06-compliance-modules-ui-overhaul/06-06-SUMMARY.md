# Plan 06-06 Summary: Returns Preparation Layout & Line-Item Inspector Filters (Party & Month)

## Executive Summary
1. **Line-Item Inspector Filters (`Gstr2bMasterDownloader.tsx`):**
   - **Month-Wise Filter Dropdown:** Added a dedicated return period dropdown selector (`All Months (N)`, `April 2026 (12)`, etc.) sorted chronologically (April to March).
   - **Party-Wise Filter Dropdown:** Added a dedicated supplier dropdown selector (`All Parties (N)`, `Supplier Name (Count)`).
   - **Live Dynamic ITC Recalculation:** All 4 top KPI cards (Eligible IGST, CGST+SGST, Total 2B ITC, and Ineligible ITC) and invoice count badges immediately recompute according to the active month and party filters.
   - **Enriched Date/Period Cell:** The table displays the invoice date and filing month together in high-density monospace format.
2. **Single-Row 5-Column Tab Bar (`ReturnsDashboard.tsx`):**
   - Converted the main tab strip to a locked `grid grid-cols-5 gap-1.5` with compact typography and `w-3.5 h-3.5` icons, guaranteeing all 5 buttons stay on a single row without wrapping.
3. **Top Spacing & Cockpit Compacting:**
   - Eliminated over 200px of wasted vertical height by streamlining `AppShell` `<main>` padding and consolidating server storage, client selection, and FY save controls.

## Verification
- `npx tsc --noEmit`: 0 errors.
- Production build verified.
