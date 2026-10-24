# Phase 10: Enterprise Modernized Shell & Complete Returns Dashboard 1:1 Stitch Alignment - Context

## 1. Executive Summary & Intent
Implement the redesigned layout architecture and component suite for "Vaswani Return Enterprise" based on the Stitch templates generated in `stitch_specs/04-returns-preparation-filing/stitch_vaswani_audit_enterprise_dashboard/stitch_vaswani_audit_enterprise_dashboard/`:
- **Smart Collapsible Left Sidebar Rail**: Compact 64px width rail expanding smoothly to 256px on hover or toggle pin, with brand logo, "Enterprise Audit v4.8" badge, 17-module navigation mapped to suites with custom accent markers, and bottom-left settings trigger.
- **Standardized Top Header**: Sticky header with Omni-search input (`⌘K`), Live Tally Port 9000 bridge status pill, FY badge switcher (`FY 2024-25`), notification bell, and active company context chip with gradient avatar.
- **Suite 04 Returns Preparation & Filing (All 5 Screens 1:1 with Stitch)**:
  1. `gstr_3b_working_sheet_fluid_rail_compact_tabs/code.html` — Micro-pill tab deck, combined period track & breathing bar, 4-card KPI summary, Table 3.1 Outward & Table 4 ITC high-density financial tables, and Rule 88A waterfall card.
  2. `12_month_fy_comparative_matrix_fluid_rail_compact_tabs/code.html` — 4-metric KPI bar, matrix toolbar with view mode & tie-out toggle, 13-column comparative ledger, closing credit cards, and audit sign-off footer.
  3. `gst_ims_2b_manager_fluid_rail_compact_tabs/code.html` — 300+ client selector with session timer countdown, 4-metric compact KPI bar, batch action toolbar, and inward supplies action ledger.
  4. `gstr_2b_autopilot_downloader_fluid_rail_compact_tabs/code.html` — Client telemetry header, Golden Rule mini pill, side-by-side autonomous loop & CAPTCHA resolver card, live progress bar, and 12-month sync status matrix.
  5. `gstr_1_autopilot_downloader_fluid_rail_compact_tabs/code.html` — Turnover telemetry header, 12-month batch velocity progress bar, Outward Tables Coverage Deck (Table 4, 5, 7, 9, 12, 13 chips), and multi-period outward sync grid.

## 2. Invariance & Non-Negotiable Core Rules
1. **Zero Logic Changes**: Do NOT change or break any existing business logic, calculations (Rule 88A set-off, SA 530 sampling, Tandon MPBF II, Form 3CD Clause 44, or Income Tax 115BAC formulas), or API/Playwright integration functions.
2. **Strict Zero-Merge Architecture**: Any Excel downloads generated must preserve `removeAllMergesFromWorkbook(wb)` and zero cell merges.
3. **Data Preservation (Golden Rule)**: Download failure or timeouts must never delete or truncate existing invoices and batches.
4. **Tabular Monospace Standard**: Tabular monospaced figures (`font-mono` / `JetBrains Mono`) for all financial amounts, GSTINs, and voucher numbers.
5. **17-Module Route Mapping**: Preserve all 17 routes and module IDs in `AppShell.tsx` and `Index.tsx`.
