# Phase 6: UI Design Contract (UI-SPEC.md)

## 1. Design System & Visual Contract

### A. Color Palette & Surfaces
- **Background**: Canvas `#090D16` (Deep Obsidian).
- **Cards & Panels (`.obsidian-card`)**: Surface `rgba(15, 23, 42, 0.65)`, backdrop blur `20px`, hairline border `rgba(255, 255, 255, 0.07)`, subtle box-shadow `0 10px 30px -10px rgba(0,0,0,0.5)`.
- **Accents**:
  - Sky/Cobalt `#4A9EE8`: Primary actions, active navigation, focus rings.
  - Emerald `#10B981`: Matched records, verified status, SQLite/Tally connected.
  - Amber `#F59E0B`: Debit notes, partial syncs, warnings, pending portal items.
  - Crimson `#EF4444`: Tax variance, missing invoices, wrong GSTINs.
  - Purple/Violet `#8B5CF6`: Batch solved notes, consolidation suites.

### B. Typography & Numerals
- **Headings**: `font-sans font-black tracking-tight text-white`.
- **Subtitles & Metadata**: `text-xs text-slate-400 font-medium`.
- **Financial Figures**: `font-mono tabular-nums tracking-tight` (strictly aligned to right).
- **Status Tags (`.badge-chip`)**: Micro pills (`0.625rem`) with 1.5px pulsing or solid dot indicators.

### C. High-Density Table Standards (`.table-dense`, `.np-table`)
- **Headers**: Sticky `top: 0`, background `#0c1220` with border-bottom `#1e293b`, uppercase `0.65rem font-mono font-bold tracking-wider text-slate-400`.
- **Cells**: Padding `0.45rem 0.75rem`, border-bottom `rgba(30, 41, 59, 0.6)`, text `0.75rem text-slate-300`.
- **Hover**: Subtle row highlight `rgba(59, 130, 246, 0.05)`.

---

## 2. Module Specifications

### A. Vendor Party-Wise Report & Dispute Hub (`src/components/PartyWiseReport.tsx`)
- **Top Summary KPIs**: 3-card cockpit (Total Vendors Reconciled, Net Tax Variance, Actionable Discrepancy Amount).
- **Vendor Cards**:
  - Obsidian glass container with trade name, GSTIN, and net difference badge.
  - Collapsible invoice & debit note breakdown with side-by-side Books vs 2B columns.
  - Quick action buttons: WhatsApp Notice, Email Notice, Force Match, and Auto-Match Party.

### B. Returns Mission Control & Autopilot (`src/components/Gstr2bMasterDownloader.tsx` & `src/pages/ReturnsDashboard.tsx`)
- **12-Month Telemetry Stepper Grid**:
  - 12 period tiles (Apr to Mar) with live glowing status rings (`SYNCED`, `NIL`, `IN_PROGRESS`, `PENDING`).
  - Single-click month selection or "Download All 12 Months" master button.
- **Live Event Drawer**:
  - Collapsible terminal drawer with monospace logs for Playwright portal events and network recovery status.
- **Export Dock**:
  - Direct 1-click download of the 8-sheet consolidated SectionWiseSummary Excel.

### C. Tally Prime Direct Integration (`src/pages/TallyDirectImport.tsx` & `src/pages/TallyLedgerImport.tsx`)
- **Bridge Status HUD**:
  - Live port 9000 connection indicator with animated ping dot and Tally company badge.
- **Ledger Ingestion Grid**:
  - High-density table with sticky headers for Purchase, Sales, and Debit Note vouchers.

### D. Income Tax Sandbox (`src/pages/IncomeTaxDashboard.tsx`)
- **Regime Comparison Split Cockpit**:
  - Dual columns: Old Regime vs New Regime (Sec 115BAC).
  - Reactive deduction cards (80C, 80D, 80G, Standard Deduction) with visual savings delta badge.

---

## 3. Strict Non-Functional Guarantees
1. **Zero-Merge Compliance**: Spreadsheets generated from any module strictly preserve `ws['!merges'] = []`.
2. **State & Calculation Integrity**: No changes to tax math, rounding tolerance logic, or SQLite storage schemas.
3. **AppShell Conformance**: All views render cleanly inside `<AppShell>` without layout breakage or double scrollbars.
