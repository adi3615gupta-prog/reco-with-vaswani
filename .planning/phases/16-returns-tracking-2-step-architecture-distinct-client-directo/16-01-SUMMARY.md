# Plan 16-01 Summary: Returns Tracking 2-Step Architecture (Distinct Client Directory Gateway & Scoped Detail Workspace)

## Execution Overview
- **Phase:** 16 - Returns Tracking 2-Step Architecture: Distinct Client Directory Gateway (Page 1) & Scoped 12-Month Compliance Matrix (Page 2)
- **Plan:** 01
- **Status:** Complete ✓
- **Requirements Satisfied:** RET-STEP-01, RET-STEP-02, RET-STEP-03

---

## Key Deliverables Implemented

### 1. Step 1 (Page 1) — Distinct Client Directory Gateway (`ReturnsTrackingMaster.tsx`)
- **Single-Row Entity Representation:**
  - Grouped all raw return filing rows into distinct, single-entity client entries in `uniqueClients` (1 row per client, NOT repeated 12 times for April..March).
  - Reduced initial DOM nodes by ~92% (962 distinct rows instead of 11,544), eliminating initial-render lag.
- **Client Master Data & Compliance Progress:**
  - Displays Client Trade Name, Legal Name, GSTIN, and State Code with 1-click clipboard copy.
  - Statutory Filing Frequency badge (`Monthly` vs `QRMP`).
  - Annual Compliance Health progress pills: `{filedCount} / {totalDue} Filed` (emerald) and `{pendingCount} Pending` (amber/rose).
  - Total PMT-06 Net Cash Tax Paid (₹) in FY.
  - Dedicated **`Track Client →`** action button on each row to jump directly into detailed single-client tracking.
- **Interactive Multi-Client Selection:**
  - Column 1 features an explicit `SELECT` column header with master checkbox and `w-16` container width.
  - Clicking anywhere on a client row toggles its checkbox; selected rows highlight with a solid purple left-border (`border-l-4 border-l-purple-600`) and purple background (`bg-purple-50/80`).
- **Live Search & Category Filters:**
  - Real-time search across Trade Name, Legal Name, and GSTIN.
  - Filter chips: `All Clients (962)`, `Selected (N)`, `Pending Filings`, `Monthly Filers`, `QRMP Filers`.
  - Bulk actions: `Select Visible`, `Clear All`, `Track All Practice Clients (962)`.
- **Sticky Bottom Action Bar:**
  - Displays live count: `N Clients Selected (N × 12 Return Obligations Scoped)`.
  - Secondary button: `Clear Selection`.
  - Primary CTA: **`Proceed to Compliance Dashboard (N) →`**.

---

### 2. Step 2 (Page 2) — Scoped Compliance Workspace & Cockpit
- **Scoped Data Presentation:**
  - Table rows and timeline records only render for clients present in `checkedGstins` (or all if `ALL` was selected).
- **Dynamically Scoped Top KPI Cards:**
  - **Card 1 (Total Returns Due):** Displays return obligations strictly for selected clients (e.g. **`48`** for 4 selected clients instead of `11,544`).
  - **Card 1 Subtitle:** Explicitly labels active scope: e.g. `4 Selected Clients • FY 2026-27`.
  - **Cards 2, 3 & 4 (Filed, Overdue/Pending, Next Deadline):** Recomputed strictly over the selected client subset.
- **Top Header Switcher Back to Step 1:**
  - Obsidian Glass Header contains a prominent button:
    **`← Select Clients ({checkedGstins.size} Checked)`**
  - Seamlessly returns to Step 1 to add or remove clients without losing filters or application state.
- **Active Scope Notification Banner:**
  - Displayed above Cockpit table:
    `🎯 N Clients Active (N Return Rows Scoped) • [Modify in Step 1] [Clear (Show All)]`.
- **Enhanced Master Cockpit Table:**
  - Column 1 updated to `w-16` with explicit `SELECT` header label and row checkboxes.

---

### 3. Locked Discussion Decisions Enforced (Option A)
1. **Clean Slate Initial Load:** Step 1 initializes with empty `checkedGstins`, letting the practitioner start clean without unchecking unwanted rows.
2. **Session Memory:** Selections persist across tab jumps into GSTR-3B Working, 2B Autopilot, and GSTR-1.
3. **Dual Action Row:** Row click toggles checkbox; `Track Client →` button immediately opens Page 2 for that client.
4. **Scoped Zero-Merge Excel Export:** The compliance audit workbook strictly packages the active selected clients without cell merges (`ws['!merges'] = []`).

---

## Verification & Quality Gates
- **TypeScript Type Safety:** `npx tsc --noEmit` executed clean with **0 errors**.
- **Integration Stability:** Step 1 and Step 2 navigation transitions verified seamless with zero state leakage.
