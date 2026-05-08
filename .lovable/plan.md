
## Party-wise Reconciliation Report

Add a new export + on-screen view that groups all reconciliation results by Party (Vendor), so the user can see each supplier's totals and invoice-level breakdown in one place.

### What gets built

**1. New aggregation utility** (`src/lib/partyWise.ts`)
- Group results by party key: prefer GSTIN, fallback to normalized supplier name.
- Per party compute:
  - Party Name, GSTIN
  - Invoice counts: Total, Perfect Match, Value Mismatch, Invoice Missing, Missing in PR
  - Totals: PR IGST/CGST/SGST, 2B IGST/CGST/SGST
  - Differences: IGST Diff, CGST Diff, SGST Diff, Total GST Diff
  - Overall party status: "All Matched" / "Has Mismatches" / "Has Missing"

**2. New UI component** (`src/components/PartyWiseReport.tsx`)
- Collapsible card per party (accordion) showing:
  - Header row: Party name, GSTIN, totals, diff badge, status pill
  - Expanded: mini-table of that party's invoices (Invoice No, Date, PR vs 2B IGST/CGST/SGST, Status)
- Search box to filter parties by name/GSTIN
- Sort toggle: by name / by total diff (desc)

**3. Index page integration** (`src/pages/Index.tsx`)
- Add a new tab "Party-wise" alongside existing Results / Monthly tabs (or a new section button if no tabs exist — will check actual layout).
- Add **"Export Party-wise Report"** button next to the existing "Export Monthly Comparison Report" button.

**4. Excel export** (extend `src/lib/fileParser.ts` with `exportPartyWise`)
- **Sheet 1 — Party Summary**: one row per party with totals & diffs, color-coded by status (green/amber/red).
- **Sheet 2 — Party Details**: every invoice grouped under its party header row, side-by-side PR vs 2B columns matching the existing styling convention from `mem://reporting/excel-export-format`.
- Bold totals row at the bottom of each sheet.

### Visual direction
Follows existing glass-card + semantic color palette (Green=match, Amber=mismatch, Red=missing, Blue=missing-in-PR). Party header uses gradient strip per status, consistent with current `MonthlyBreakdown` and `ResultsCategoryTabs`.

### Files to change
- ➕ `src/lib/partyWise.ts` (new)
- ➕ `src/components/PartyWiseReport.tsx` (new)
- ✏️ `src/lib/fileParser.ts` — add `exportPartyWise`
- ✏️ `src/pages/Index.tsx` — add button + render component/tab
