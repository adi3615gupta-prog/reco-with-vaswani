# Phase 15 Context: Returns Tracking Submodule (Tab 06)

## 🎯 Phase Objective
Add submodule **`06. Returns Tracking`** (`returns_tracking`) to Suite 04 (Returns Preparation & Filing), providing a high-density, dual-mode compliance tracking cockpit with statutory due date monitoring, late fee estimation, 1-click jump into working sheets, and on-demand portal sync.

---

## 🔒 Locked Implementation Decisions

### 1. Dual-Mode UI Architecture
- **Mode A: All-Clients Master Compliance Cockpit**
  - Filter by Period (e.g. *September 2026*) and Status (*All*, *Only Pending*, *Overdue*, *Filed*).
  - High-density table displaying all firm clients.
  - Balanced financial & status columns:
    - `Client / Firm Name`
    - `GSTIN`
    - `Frequency` (Monthly / QRMP)
    - `GSTR-1 Status` (Badge + Filing Date + ARN)
    - `GSTR-2B Availability` (Sync status in DB + Record count + Eligible ITC)
    - `GSTR-3B Status` (Badge + Filing Date + Cash Paid ₹ via PMT-06)
    - `Total Tax Liability` (₹)
    - `Quick Action` (Direct Jump into Working)
- **Mode B: Single-Client 12-Month Timeline Matrix**
  - Select any taxpayer (e.g. *DYP INFRAPROJECTS PRIVATE LIMITED*).
  - 12 rows (April to March) mapping statutory deadlines vs actual filing dates across GSTR-1, GSTR-3B, GSTR-2B, and GSTR-9.
  - Color-coded compliance badges:
    - 🟢 `Filed On Time`
    - 🟡 `Filed with Delay`
    - 🔵 `Due Soon`
    - 🔴 `Overdue`

### 2. Statutory Due Dates & Penalty Logic
- **GSTR-1 Due Date**: 11th of succeeding month (Rule 59).
- **GSTR-3B Due Date**: 20th of succeeding month (Rule 61).
- **Late Fee Calculation**: ₹50/day standard (₹25 CGST + ₹25 SGST) or ₹20/day (₹10 CGST + ₹10 SGST) for NIL return, starting from day after due date.
- **Interest Estimation**: 18% per annum calculated on net cash tax payable for overdue periods.

### 3. Action Workflow (Direct Jump into Working)
- Clicking on a pending or filed return cell (or clicking the "Open Working" button):
  1. Automatically updates the active client (`targetGstin`, `workingData.profile`).
  2. Sets the selected month (`selectedMonth`).
  3. Seamlessly routes to the target module:
     - GSTR-3B cell $\to$ **`01. GSTR-3B Working`**
     - GSTR-2B cell $\to$ **`04. Inward 2B Autopilot`**
     - GSTR-1 cell $\to$ **`05. Outward GSTR-1`**
  4. No manual re-selection required.

### 4. Hybrid Sync & Storage Protocol
- **On-Demand 1-Click Portal Sync**:
  - Toolbar button `"Sync Portal Status"` triggers official GSTN return filing inquiry.
  - Supports single-client sync and batch-sync for pending clients without portal rate-limiting.
- **Local Persistence & Office Collaboration**:
  - SQLite tables (`network_data.db` / `clients`, `gstr1_batches`, `gstr2b_batches`, `gstr3b_returns`) and filesystem (`gst_returns_data/`) serve as primary offline storage.
  - Allows CA team to manually enter or override ARN, Filing Date, and internal progress flags (`Work in Progress`, `Challan Generated`, `Approved`).
- **Export Standards**:
  - 1-Click Zero-Merge Excel Compliance Audit Sheet (`removeAllMergesFromWorkbook(wb)` enforced).

---

## 🏛️ Codebase Integration Points
- **`src/components/AppShell.tsx`**: Add `'returns_tracking'` to `ReturnsTabKey` and append `{ id: 'returns_tracking', num: '06', label: 'Returns Tracking', icon: CalendarClock }` to `RETURNS_SUBMODULES`.
- **`src/pages/ReturnsDashboard.tsx`**: Add `activeTab === 'returns_tracking'` view mounting `<ReturnsTrackingMaster />`.
- **`src/pages/Index.tsx`**: Support `'returns_tracking'` in `returnsInitialTab` state and add Hub launch card.
- **`src/components/ReturnsTrackingMaster.tsx`**: The main tracking component.
- **`returns_storage_routes.js`**: Backend endpoints `GET /api/returns/tracking-data` and `POST /api/returns/save-tracking-record`.
