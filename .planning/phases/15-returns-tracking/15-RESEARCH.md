# Phase 15 Research: Returns Tracking Submodule (Tab 06)

## 1. Domain & Statutory Framework

### Statutory Due Dates (CGST Act & Rules):
1. **GSTR-1 (Outward Supplies)**:
   - Normal Taxpayers (Monthly): **11th of succeeding month** (Rule 59).
   - QRMP Taxpayers (IFF / Quarterly): **13th of month following the quarter** / month.
2. **GSTR-3B (Summary Return & Tax Settlement)**:
   - Category 1 States (Maharashtra, Gujarat, etc. turnover > 5 Cr or Monthly): **20th of succeeding month** (Rule 61).
   - QRMP Category 1: **22nd of succeeding month**; QRMP Category 2: **24th of succeeding month**.
3. **GSTR-2B (Static Auto-Drafted Inward ITC)**:
   - Portal generation date: **14th of succeeding month**.
4. **GSTR-9 & 9C (Annual Return & Reconciliation Statement)**:
   - Statutory Due Date: **31st December following the end of financial year**.

### Statutory Status Categorization:
- **`FILED (On Time)`**: Return filed on or before due date (Status: Green).
- **`FILED (Delayed)`**: Return filed after due date (Status: Amber with late fee note).
- **`DUE SOON`**: Return pending, due date within next 7 days (Status: Blue pulse).
- **`OVERDUE`**: Return pending past statutory due date (Status: Red with late fee calculation: ₹50/day or ₹20/day for NIL).
- **`NOT GENERATED / FUTURE`**: Future month not yet due (Status: Slate muted).

---

## 2. Codebase Integration Architecture

### A. Navigation & Shell Layout:
- **`src/components/AppShell.tsx`**:
  ```typescript
  export type ReturnsTabKey =
    | 'working3b'
    | 'matrix'
    | 'ims2b'
    | 'gstr2b_downloader'
    | 'gstr1_downloader'
    | 'returns_tracking';

  const RETURNS_SUBMODULES = [
    { id: 'working3b', num: '01', label: 'GSTR-3B Working', icon: Calculator },
    { id: 'matrix', num: '02', label: '12M FY Matrix', icon: Table },
    { id: 'ims2b', num: '03', label: 'Nexus IMS Hub', icon: Sparkles },
    { id: 'gstr2b_downloader', num: '04', label: 'Inward 2B Autopilot', icon: CloudDownload },
    { id: 'gstr1_downloader', num: '05', label: 'Outward GSTR-1', icon: ArrowUpRight },
    { id: 'returns_tracking', num: '06', label: 'Returns Tracking', icon: CalendarClock },
  ];
  ```

### B. Data Sources for Returns Tracking:
1. **Local Filesystem Storage (`gst_returns_data/<Client>/<FY>/`)**:
   - Inspects monthly folders (`01 - April` to `12 - March`) for existing `gstr3b_*.json`, `gstr3b_portal_*.json`, extracting filing dates, ARN numbers, and tax paid totals.
2. **Local SQLite Database (`network_data.db`)**:
   - `gstr1_batches`: Contains batch download status, period, invoice count for GSTR-1.
   - `gstr2b_batches`: Contains inward 2B batch generation status and invoice count.
   - `gstr3b_returns`: Contains 3B returns filing records.
3. **Manual Entry & Override Capability**:
   - Allows user to update ARN number, filing date, and mode if filing was done externally or offline.

---

## 3. UI/UX Specifications (Obsidian Design System)

1. **Header & KPI Strip**:
   - 4-card summary:
     - Total Returns Due in FY (e.g. 24 returns: 12 GSTR-1 + 12 GSTR-3B)
     - Successfully Filed (Count & Percentage)
     - Pending / In Progress
     - Next Upcoming Statutory Deadline Countdown
2. **12-Month Compliance Matrix Table**:
   - Columns:
     - `Month / Period` (April to March)
     - `GSTR-1 Status` (Badge + Filing Date + ARN + Action)
     - `GSTR-2B Available` (Badge + Total ITC + Record Count)
     - `GSTR-3B Status` (Badge + Filing Date + ARN + Cash Tax Paid)
     - `Overall Compliance` (On Time / Delayed / Due)
3. **Actions Toolbar**:
   - Search & Month filter
   - Quick "Check Portal Status" button
   - "Export Compliance Report" (Zero-Merge Excel)
   - "Refresh Local Sync"
