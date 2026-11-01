# Phase 16 Context: Returns Tracking 2-Step Architecture (Distinct Client Directory Gateway & Scoped Detail Workspace)

## 🎯 Phase Objective
Establish a clean, high-performance **2-Step Workflow** in Submodule `06. Returns Tracking` (`ReturnsTrackingMaster.tsx`):
- **Page 1 (Step 1):** Distinct, single-row client entity directory (1 row per registered client, NOT repeated for every month) with search, status filtering, multi-client checkboxes, and compliance health summaries.
- **Page 2 (Step 2):** Scoped compliance cockpit displaying month-by-month return filings, ARNs, challans, and statutory KPIs strictly for the clients selected on Page 1, with a 1-click return button (`← Select Clients`) to adjust scope at any time.

---

## 🔒 Locked Implementation Decisions

### 1. Page 1 (Step 1) — Distinct Client Directory Gateway
- **Single-Row Entity Display:** Every client appears exactly once (1 row per client), preventing the 11,544-row flood on initial load.
- **Client Metadata & Health:**
  - Client Trade Name & Legal Name
  - GSTIN & State Code (with 1-click copy)
  - Statutory Filing Frequency badge (`Monthly` vs `QRMP`)
  - Compliance Health Progress pill: `{filedCount} / {totalDue} Filed` (emerald) and `{pendingCount} Pending` (amber/rose)
  - Net Cash Tax Paid (PMT-06 ₹)
  - 1-Click `Track Client →` button to jump straight into detailed tracking for that individual client.
- **Multi-Client Checkbox Selection:**
  - Header with master `SELECT` checkbox and label.
  - Interactive row checkboxes (`w-4 h-4 accent-purple-600 cursor-pointer`).
  - Clicking anywhere on a client row toggles selection.
  - Selected rows highlight with a purple background (`bg-purple-50/80`) and solid purple left-accent border (`border-l-4 border-l-purple-600`).
- **Real-Time Search & Category Tabs:**
  - Live search input matching trade name, legal entity, and GSTIN.
  - Category tabs: `All Clients ({total})`, `Selected ({checked})`, `Pending Filings ({count})`, `Monthly Filers`, `QRMP Filers`.
  - Bulk action buttons: `Select Visible`, `Clear All`, `Track All Practice Clients ({total})`.
- **Sticky Bottom Action Bar:**
  - Fixed at the bottom of the viewport:
    - `{checkedGstins.size} Client(s) Selected • {checkedGstins.size * 12} Return Obligations Scoped`
    - `Clear Selection` button
    - Primary CTA: `Proceed to Compliance Dashboard (N) →`

### 2. Page 2 (Step 2) — Scoped Compliance Workspace & Cockpit
- **Scoped Data Presentation:**
  - Table rows and timeline records only render for clients present in `checkedGstins` (or all if `ALL` was chosen).
- **Strictly Scoped Top KPI Calculations:**
  - **Card 1 (Total Returns Due):** Displays return obligations for selected clients (e.g. `48` for 4 clients instead of `11,544`).
  - **Card 1 Subtitle:** Explicitly labels active scope: e.g. `4 Selected Clients • FY 2026-27`.
  - **Cards 2, 3 & 4 (Filed, Overdue/Pending, Next Deadline):** Recomputed strictly over the selected client subset.
- **Header Switcher Back to Step 1:**
  - Obsidian Glass Header contains a prominent button:
    `← Select Clients ({checkedGstins.size} Checked)`
  - Seamlessly returns to Step 1 to add or remove clients without losing filters or application state.
- **Prominent Cockpit Table Checkbox Column & Active Banner:**
  - First column in Mode A Master Cockpit table is `w-16` with explicit `SELECT` header label and checkboxes.
  - Active notification banner above table:
    `🎯 {checkedGstins.size} Clients Active ({rows} Return Rows Scoped) • [Modify in Step 1] [Clear (Show All)]`

### 3. Action Workflow & Autopilot Integration
- 1-Click direct jump into target working sheets (`onJumpToWorking`):
  - GSTR-3B $\to$ Tab 01 (`working3b`)
  - GSTR-2B $\to$ Tab 04 (`gstr2b_downloader`)
  - GSTR-1 $\to$ Tab 05 (`gstr1_downloader`)
- Manual ARN & filing date override modal (`isEditModalOpen`) persisted in SQLite (`returns_tracking_records`).
- Zero-Merge Excel audit certificate export (`removeAllMergesFromWorkbook(wb)` strictly enforced).

---

## 🔒 Locked User Decisions from Phase Discussion (Option A Confirmed)
1. **Initial Selection on First Load (Step 1): Clean Slate**
   - The directory starts with no clients pre-checked by default (`checkedGstins` is empty).
   - The practitioner directly uses search, category tabs, or clicks "Track All" to define their scope without unchecking unwanted rows.
2. **Selection Memory & Persistence: Session-Level Memory**
   - Checked client scope is preserved in session state as the user jumps between working sheets (`01. GSTR-3B Working`, `04. 2B Autopilot`, `05. GSTR-1`) and returns tracking.
3. **Row Click Interaction: Intuitive Dual Action**
   - Clicking anywhere on a client row toggles its checkbox and purple highlight.
   - Clicking the dedicated `Track Client →` action button immediately enters Page 2 detailed tracking for that single client.
4. **Zero-Merge Excel Compliance Audit Certificate Scope: Scoped to Selection**
   - Export Compliance Excel strictly packages the currently selected clients and their 12-month return obligations into the audit workbook. Zero merged cells (`ws['!merges'] = []`) enforced.

---

## 🏛️ Codebase Integration Points
- **`src/components/ReturnsTrackingMaster.tsx`**: Core 2-step component.
- **`src/pages/ReturnsDashboard.tsx`**: Mounts `<ReturnsTrackingMaster />`.
- **`returns_storage_routes.js`**: Backend API `GET /api/returns/tracking-data` & `POST /api/returns/save-tracking-record`.
