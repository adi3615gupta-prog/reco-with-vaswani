# Phase 9: Suite 04 Returns Enterprise Fluid Dashboard Layout Overhaul - Research & Mapping

## 1. Design Tokens & Styling Primitives
From `luminous_fluid_enterprise/DESIGN.md`:
- **Canvas Background**: `#F8FAFC` (`bg-slate-50`)
- **Card Surfaces**: `#FFFFFF` with `backdrop-blur-xl`, `border border-slate-200/80`, subtle ambient shadow `shadow-xs` or `shadow-sm`
- **Typography**: 
  - Standard text: `Inter`, `text-slate-900` (headings), `text-slate-600` (body), `text-slate-400` (labels/subtitles)
  - Financial numbers: `JetBrains Mono` / `font-mono tabular-nums font-semibold`
- **Module Accent Palette**:
  - Emerald (`#059669` / `text-emerald-700 bg-emerald-50 border-emerald-200/60`): GST status, reconciliation matches, net ITC
  - Amber (`#D97706` / `text-amber-700 bg-amber-50 border-amber-200/60`): Practice management, pending actions, timing differences
  - Indigo/Blue (`#4F46E5` / `text-indigo-700 bg-indigo-50 border-indigo-200/60`): Audit, Rule 88A set-off, cash liability
  - Pink/Rose (`#DB2777` / `text-pink-600 bg-pink-50 border-pink-200/60`): Tally integration, live multi-threading, reversed credit

## 2. Component Mapping Breakdown

### Tab 1: GSTR-3B Working Sheet (`ReturnsDashboard.tsx`)
- **Suite Micro-Pill Tab Bar**:
  Container: `flex items-center justify-between gap-3 overflow-x-auto pb-1 border-b border-slate-200/80`
  Pill track: `flex items-center gap-1.5 p-1 bg-slate-200/50 rounded-xl backdrop-blur-md`
  Active tab: `bg-slate-900 text-white shadow-xs ring-1 ring-slate-900`
  Inactive tab: `text-slate-600 hover:text-slate-900 hover:bg-white/80`
- **Breathing Bar (Period Selector + Ingestion Action Dock)**:
  Container: `grid grid-cols-1 xl:grid-cols-12 gap-3 items-center bg-surface p-3 rounded-2xl border border-slate-200/80 shadow-xs`
  Left (cols 7): Apr–Mar segmented month pills with active highlighted pill
  Right (cols 5): Fetch 2B, Fetch 1, Sync Tally, and Reco Match % mini progress bar
- **Table 3.1 Outward & Table 4 ITC (Left 8 Cols)**:
  Clean card headers with badge pills (`3.1`, `4`, `6.1`), tabular numeric rows, zebra subtle hovers, clear total rows with distinct accent borders.
- **Rule 88A Cascade & Credit Ledger (Right 4 Cols)**:
  Step-by-step set-off cards (IGST -> CGST -> SGST waterfall) and cash settlement card.

### Tab 2: 12-Month FY Comparative Matrix (`ReturnsDashboard.tsx`)
- Header with FY selector & Density controls (`Compact` vs `Relaxed`)
- High-density 4-metric KPI summary pills:
  1. Turnover (Outward): ₹18.42 Cr (Diff vs 3B: ₹0.00)
  2. Eligible ITC (Table 4): ₹3.48 Cr
  3. Cash Tax Paid (6.1): ₹1.82 Cr
  4. Scrutiny Risk Score: 0 Flagged Items
- 13-Column annual matrix table spanning April to March + Full Year FY Total column.

### Tab 3: GST IMS & 2B Manager (`ImsMasterManager.tsx`)
- Streamlined client banner & live session countdown timer
- 4-metric KPI summary bar (Total Inward Invoices, Accepted, Rejected, Pending Action)
- Batch Action Toolbar: Accept All Eligible, Reject Invalid, Reset, Export IMS JSON, Excel
- Inward invoices ledger table with action toggles and status pills.

### Tab 4: GSTR-2B Autopilot (12M) (`Gstr2bMasterDownloader.tsx`)
- Client credentials strip with Golden Rule pill ("New data download nahi toh purana data remove nahi hoga")
- Side-by-side cockpit: 12-Month Autonomous Loop execution tracker + In-Page CAPTCHA resolver
- 12-month sync matrix grid with status badges.

### Tab 5: GSTR-1 Autopilot (12M) (`Gstr1MasterDownloader.tsx`)
- Autopilot velocity tracker with gradient progress bar
- Outward Tables Coverage Deck (Table 4 B2B, Table 5 B2C Large, Table 7 B2C Small, Table 9 Amendments, Table 12 HSN, Table 13 Documents)
- Month-by-month harvesting grid with action buttons.
