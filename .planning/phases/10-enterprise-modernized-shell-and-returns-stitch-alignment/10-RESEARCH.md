# Phase 10: Enterprise Modernized Shell & Complete Returns Dashboard 1:1 Stitch Alignment - Research

## 1. Codebase Architecture & File Analysis

### A. Layout Shell & Global Navigation
- **File**: `src/components/AppShell.tsx`
- **Current State**: Contains standard manual collapsible sidebar, command dialog, and top header.
- **Stitch Blueprint**:
  - Sidebar: Smart hover rail `w-16 hover:w-64` with cubic-bezier transition, brand logo + "Enterprise Audit v4.8", 17 navigation items mapped across 7 suites with suite-specific accent markers (Amber, Emerald, Pink, Blue, Indigo), Ca Vaswani profile chip, and bottom-left settings trigger.
  - Header: Sticky blurred canvas `bg-[#F8FAFC]/85 backdrop-blur-md`, Omni-search with `⌘K`, Live Tally Port 9000 status pill (`Tally Port 9000 Connected` with pulsing dot), FY badge pill (`FY 2024-25`), notification bell with red badge, and client quick switcher (`Reliance Digital Logistics` / GSTIN / gradient avatar).

### B. Suite 04 Returns Preparation & Filing Components
1. **Tab 1: GSTR-3B Working Sheet**
   - **File**: `src/pages/ReturnsDashboard.tsx` (lines 1400–2495)
   - **Stitch Reference**: `stitch_specs/04-returns-preparation-filing/stitch_vaswani_audit_enterprise_dashboard/stitch_vaswani_audit_enterprise_dashboard/gstr_3b_working_sheet_fluid_rail_compact_tabs/code.html`
   - **Key Elements**:
     - Micro-pill tab deck (`01. GSTR-3B Working`, `02. 12-Month FY Matrix`, etc.)
     - Ingestion breathing bar with month pills & sync status
     - 4 high-density KPI pills (Turnover, Eligible ITC, Cash Paid, Net Closing Credit)
     - Table 3.1 Outward supplies breakdown & Table 4 ITC breakdown with monospaced tabular figures
     - Rule 88A set-off cascade card & cash payment settlement card

2. **Tab 2: 12-Month FY Comparative Matrix**
   - **File**: `src/pages/ReturnsDashboard.tsx` (lines 2540–3015)
   - **Stitch Reference**: `stitch_specs/04-returns-preparation-filing/stitch_vaswani_audit_enterprise_dashboard/stitch_vaswani_audit_enterprise_dashboard/12_month_fy_comparative_matrix_fluid_rail_compact_tabs/code.html`
   - **Status**: Completed and verified in commit `1bf104d`.

3. **Tab 3: GST IMS & 2B Manager**
   - **File**: `src/components/ImsMasterManager.tsx`
   - **Stitch Reference**: `stitch_specs/04-returns-preparation-filing/stitch_vaswani_audit_enterprise_dashboard/stitch_vaswani_audit_enterprise_dashboard/gst_ims_2b_manager_fluid_rail_compact_tabs/code.html`
   - **Key Elements**:
     - 300+ Client Selector with session timer countdown
     - 4-metric KPI bar (Total Invoices, Accepted, Rejected, Pending)
     - Batch action toolbar (Accept All, Reject, Reset)
     - Inward supplies action ledger table with action toggles

4. **Tab 4: GSTR-2B Autopilot Downloader**
   - **File**: `src/components/Gstr2bMasterDownloader.tsx`
   - **Stitch Reference**: `stitch_specs/04-returns-preparation-filing/stitch_vaswani_audit_enterprise_dashboard/stitch_vaswani_audit_enterprise_dashboard/gstr_2b_autopilot_downloader_fluid_rail_compact_tabs/code.html`
   - **Key Elements**:
     - Client telemetry header with Golden Rule pill
     - Side-by-side autonomous loop & CAPTCHA resolver card
     - Live progress bar & 12-month sync status matrix
     - Zero-Merge Excel export deck

5. **Tab 5: GSTR-1 Autopilot Downloader**
   - **File**: `src/components/Gstr1MasterDownloader.tsx`
   - **Stitch Reference**: `stitch_specs/04-returns-preparation-filing/stitch_vaswani_audit_enterprise_dashboard/stitch_vaswani_audit_enterprise_dashboard/gstr_1_autopilot_downloader_fluid_rail_compact_tabs/code.html`
   - **Key Elements**:
     - Turnover telemetry header & 12-month velocity bar
     - GSTR-1 Outward Tables Coverage Deck (Table 4, 5, 7, 9, 12, 13)
     - Multi-period outward sync grid & batch downloader

## 2. Invariance Checklist
- All computations (`recalculateAnnualWorking`, `formatCur`) remain intact.
- Tally Port 9000 ping & company detection remain active.
- Playwright Chromium automation in `gstr2b/autopilot.js` and `gstr1/autopilot.js` remains untouched.
- Strict Zero-Merge architecture in XLSX exports (`removeAllMergesFromWorkbook`) is preserved.
