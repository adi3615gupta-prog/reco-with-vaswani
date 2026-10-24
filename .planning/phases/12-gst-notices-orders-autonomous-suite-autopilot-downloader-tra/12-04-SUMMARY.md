# Plan 12-04 Summary: AI & Template Statutory Legal Reply Drafter & Obsidian Glass UI Dashboard

## Execution Overview
- **Phase:** 12 - GST Notices & Orders Autonomous Suite (Autopilot Downloader, Tracker & AI Reply Drafter)
- **Plan:** 04
- **Status:** Complete ✓
- **Requirements Satisfied:** NOTICES-03, NOTICES-05

## Key Deliverables Implemented
1. **Statutory Legal Reply Generator (`src/lib/noticeReplyGenerator.ts`)**:
   - `generateAsmt11Reply(notice, recoResult, options)`: Form GST ASMT-11 written submissions under Rule 99(2) replying to ASMT-10 scrutiny notices, citing verified filing dates and praying for ASMT-12 closure and personal hearing under Section 75(4).
   - `generateDrc06Reply(notice, recoResult, options)`: Form GST DRC-06 defense under Rule 142(4) replying to DRC-01 SCNs under Section 73/74. Incorporates:
     - Parliamentary retrospective Section 16(5)/(6) ITC extension (Finance (No. 2) Act 2024 / Circular 211/2024-GST).
     - Section 128A Amnesty waiver prayer for complete waiver of interest and penalty for FY 2017-18 to 2019-20 demands.
     - Judicial citations (*Suncraft Energy*, *D.Y. Beathel Enterprises* on supplier recovery precedence).
   - `escapeHtml(str)`: Rigorous HTML character escaping preventing XSS vulnerabilities (T-12-06).

2. **Enterprise Obsidian Glass Dashboard (`src/pages/GstNoticesDashboard.tsx`)**:
   - **4-Card KPI Strip**: Total Notices Scanned, Action Required (< 7 Days in Amber/Red), Total Disputed Demand (₹ in monospace), Replied & Closed.
   - **Toolbar**: 1-Click "Scan Portal Notices" trigger with live SSE status updates, and filter micro-pills (`All`, `Pending Reply`, `ASMT-10`, `DRC-01`, `DRC-01B/C`, `Closed`).
   - **Limitation Calendar Table**: Sticky header, monospace DIN with 1-click copy, color-coded countdown chips (Red: $\le 3$d, Amber: $\le 7$d, Emerald: $> 7$d), and action buttons.
   - **Slide-Over Inspector Drawer**: Comprehensive notice metadata, tax breakdown, and local PDF/ZIP attachment list with 1-click downloads.
   - **1-Click Cross-Reconcile Modal**: Instant variance decomposition showing identified reasons vs residual.
   - **Reply Studio Modal**: Dual-mode statutory drafter (Form ASMT-11 vs Form DRC-06) with live preview, plain text copy, print/PDF, and database save.

3. **Application Shell & Route Integration**:
   - Registered `/gst-notices` route in `src/App.tsx`.
   - Added `'notices'` route to `AppRoute` and `CONSOLIDATED_SUITES` in `src/components/AppShell.tsx` under Compliance Suite with `ShieldAlert` icon and `Phase 12` badge.
   - Linked in `src/pages/Index.tsx` for seamless 1-click sidebar navigation.

4. **Automated Vitest Tests**:
   - `src/test/noticesReplyGenerator.test.ts`: Verifies XSS sanitization, ASMT-11 Rule 99(2) compliance, DRC-06 Section 16(5) retrospective grounds, and Section 128A waiver prayer.
