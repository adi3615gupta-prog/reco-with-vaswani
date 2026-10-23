# Phase 9: Suite 04 Returns Enterprise Fluid Dashboard Layout Overhaul - Context

## 1. Executive Summary & Intent
Transform and align the visual architecture and component hierarchy of Suite 04 (Returns Preparation & Filing) with the Google Stitch enterprise dashboard design package (`stitch_vaswani_audit_enterprise_dashboard`), elevating all 5 tabs:
1. **Tab 1: GSTR-3B Working Sheet** (`gstr_3b_working_sheet_fluid_rail_compact_tabs/code.html`)
2. **Tab 2: 12-Month FY Comparative Matrix** (`12_month_fy_comparative_matrix_fluid_rail_compact_tabs/code.html`)
3. **Tab 3: GST IMS & 2B Manager** (`gst_ims_2b_manager_fluid_rail_compact_tabs/code.html`)
4. **Tab 4: GSTR-2B Autopilot Downloader (12M)** (`gstr_2b_autopilot_downloader_fluid_rail_compact_tabs/code.html`)
5. **Tab 5: GSTR-1 Autopilot Downloader (12M)** (`gstr_1_autopilot_downloader_fluid_rail_compact_tabs/code.html`)

## 2. Invariance & Non-Negotiable Core Rules
- **Strict Functional Invariance**: ZERO changes to business logic, Rule 88A calculation cascades, SQLite persistence schemas, Playwright Chromium headless/headful automation routines, Tally XML queries, or zero-merge Excel exports.
- **Strict Visual Token Alignment**: Adopt the Luminous Fluid Enterprise tokens (`#F8FAFC` canvas, crisp `#FFFFFF` surfaces with `backdrop-blur-xl`, `border-slate-200/80`, `font-mono tabular-nums`, and semantic color chips for Amber practice, Emerald GST, Pink Tally, Indigo audit).
- **Zero-Merge Architecture**: Any Excel downloads generated must preserve `removeAllMergesFromWorkbook(wb)` and zero cell merges.

## 3. Scope of Changes
- `src/pages/ReturnsDashboard.tsx`: Suite 04 master navigation bar (sleek micro-pill tabs deck), streamlined period track & ingestion breathing bar, Table 3.1 Outward & Table 4 ITC grid, Rule 88A set-off cascade card, and 12-Month Matrix comparative ledger.
- `src/components/ImsMasterManager.tsx`: Streamlined client banner & timer strip, 4-metric high-density KPI bar, batch action toolbar, and inward invoices ledger table styling.
- `src/components/Gstr2bMasterDownloader.tsx`: Client credentials & Golden Rule strip, autonomous loop execution timeline & CAPTCHA resolver side-by-side cockpit, and zero-merge export deck.
- `src/components/Gstr1MasterDownloader.tsx`: Autopilot velocity tracker with progress bar, GSTR-1 Outward Tables Coverage Deck (Table 4, 5, 7, 9, 12, 13), and month-by-month harvesting grid.
