# Phase 12: UI Design Contract (12-UI-SPEC.md)

## 1. Visual Design System & Tokens

### A. Surfaces & Palette
- **Canvas / Background**: `#090D16` (Obsidian Base).
- **Cards & Containers (`.obsidian-card`)**: Surface `rgba(15, 23, 42, 0.65)`, backdrop-blur `20px`, border `1px solid rgba(255, 255, 255, 0.07)`, shadow `0 10px 30px -10px rgba(0, 0, 0, 0.5)`.
- **Accent Hierarchy**:
  - Sky/Cobalt `#4A9EE8`: Primary actions, active tabs, PDF highlight controls.
  - Emerald `#10B981`: Matched records, replied/closed notices, safe deadlines (> 7 days).
  - Amber `#F59E0B`: Approaching deadlines (4–7 days), DRC-01B/C pending, draft replies.
  - Crimson `#EF4444`: Urgent deadlines (< 3 days), high-risk demand notices (DRC-01 SCN, DRC-07 order).
  - Purple/Violet `#8B5CF6`: AI Legal Drafter actions, statutory circular citations.

### B. Typography & Monospace Numeral Standards
- **Headings**: `font-sans font-black tracking-tight text-white`.
- **Subtitles & Badges**: `text-xs text-slate-400 font-medium tracking-wide`.
- **Financial & Statutory Figures**: `font-mono tabular-nums tracking-tight` (strictly right-aligned for amounts, centered for DINs, dates, and ARNs).
- **Status Pills (`.badge-chip`)**: Micro-pills (`0.625rem`) with solid or animated dot indicators.

---

## 2. Component Blueprint: `src/pages/GstNoticesDashboard.tsx`

### A. Top Metric Strip (4-Card HUD)
1. **Total Notices Scanned**: Count across `View Notices`, `Additional Notices`, and `Return Compliance`.
2. **Urgent Action (< 7 Days)**: Glowing Amber/Red badge showing notices with immediate response deadlines.
3. **Total Disputed Demand**: Monospace aggregate in ₹ with broken-down Tax, Interest, and Penalty tooltips.
4. **Replied & Closed**: Total notices resolved or dropped with percentage resolution rate.

### B. Primary Action & Filter Toolbar
- **Portal Autopilot Action Deck**: "Scan Portal Notices" button triggering Playwright 1-login scraper with live progress spinner and status log drawer.
- **Client & FY Selector**: Synced with persistent top header state (`clients` table dropdown).
- **Filter Micro-Pills**:
  - `All Notices`
  - `Action Required (Pending Reply)`
  - `Scrutiny (ASMT-10)`
  - `Show Cause (DRC-01 / DRC-01A)`
  - `Return Compliance (DRC-01B / DRC-01C)`
  - `Orders Passed (DRC-07 / ASMT-13)`
  - `Closed / Replied`

### C. Limitation Calendar & Notices Ledger Table (`.table-dense`)
- **Headers**: Sticky `top: 0`, background `#0c1220`, border-bottom `#1e293b`.
- **Columns**:
  1. `Notice / Form` (e.g. `ASMT-10`, `DRC-01`, `DRC-01C` with form icon & source badge)
  2. `Reference No. / DIN` (Monospace DIN with 1-click copy)
  3. `FY / Period` (e.g. `2023-24 (Q3)`)
  4. `Issue Date`
  5. `Due Date & Countdown` (Badge: Red `2 Days Left`, Amber `6 Days Left`, Emerald `24 Days Left`)
  6. `Tax Demanded (₹)` (Monospace right-aligned)
  7. `Status` (`PENDING_REPLY`, `DRAFT_READY`, `REPLIED`, `CLOSED`)
  8. `Actions` (Split button: "Inspect", "Reconcile", "Draft Reply")

### D. Slide-Over Notice Inspector & PDF Viewer Drawer
- Slides in from right (`w-1/2` or `w-[640px]`) with smooth backdrop blur.
- Dual-tab header: "Notice Overview" and "PDF & Attachments".
- **Attachment Viewer**: Lists all downloaded PDF orders and ZIP annexures with download / open buttons and embedded PDF viewer iframe.
- **Metadata Card**: Issuing Officer name, designation, jurisdiction, DIN verification status.

### E. 1-Click Multi-Return Cross-Reconciler Modal
- Directly compares notice demand line-items against local SQLite tables:
  - Table: `Period | Notice ITC Claimed | GSTR-2B Available | GSTR-3B Availed | Identified Variance | Root Cause`
  - Root cause tags: `Timing Difference (Supplier Q4)`, `Section 16(5) Retrospective Eligible`, `Credit Note Mismatch`.
  - Export Button: "Export Reconciled Annexure (Excel)" — enforces Zero-Merge (`ws['!merges'] = []`).

### F. Dual-Engine Legal Reply Drafter Studio
- Full modal with split screen:
  - **Left (Config & Grounds)**:
    - Select Form (`Form GST ASMT-11`, `Form GST DRC-06`, `DRC-01B Part B`, `DRC-01C Part B`).
    - Preliminary Objections checkboxes (DIN mandatory check, lack of jurisdiction, time-barred under Sec 73).
    - Statutory Grounds toggles: Section 16(5)/(6) retrospective relief, Section 128A Amnesty waiver prayer, Circular 211/2024 citation.
    - Attached Annexure selection.
  - **Right (Live Draft Preview)**:
    - Formatted legal submission document with letterhead, subject line, paragraph numbers, and prayer clause.
    - Export tools: "Copy Clean Text", "Export Word (.docx)", "Print / Export PDF".

---

## 3. Strict Non-Functional Guarantees
1. **Zero-Merge Rule**: Every reconciliation spreadsheet exported from this module must strictly enforce `ws['!merges'] = []`.
2. **Local Security**: All notices, attachments, and generated replies remain strictly local in SQLite; zero cloud leaks.
3. **Persistent Shell Alignment**: Route `/gst-notices` integrates directly into the persistent collapsible sidebar navigation under the Compliance Suite with custom icon badge.
