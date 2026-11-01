# Phase 16 Research: Returns Tracking 2-Step Architecture (Client Directory Gateway & Scoped Detail Workspace)

## 1. Domain & Workflow Requirements

### User Problem & Need:
In standard accounting and CA audit practices, a firm manages hundreds of clients (e.g., 962 clients).
Under a flat 12-month return structure, rendering all months immediately results in **11,544 return rows** (`962 clients × 12 months`).
Presenting this entire mass of 11,544 rows on the initial screen causes two major problems:
1. **Cognitive Overload:** Practitioners cannot quickly identify which clients they need to review or file returns for.
2. **Practitioner Need for Scoped Tracking:** Practitioners almost always work on a specific set of clients (e.g. 5 priority clients, all overdue filers, or a single corporate group). They want to:
   - **Step 1 (Page 1):** View every client as a **single, distinct row** (1 row per client with high-level compliance health), search and check off the clients they want to monitor.
   - **Step 2 (Page 2):** Proceed into the detailed workspace where only the chosen clients' monthly filings, ARNs, challans, and 12-month matrices are loaded and calculated.

---

## 2. Technical Architecture & State Machine

### A. 2-Step State Transition:
```
+-------------------------------------------------------------+
| Step 1: Client Selection Directory Gateway                  |
| - 1 distinct row per client (962 rows, NOT 11,544)          |
| - High-contrast checkbox per row + Select All in header     |
| - Live search across Name, Legal Entity, GSTIN, State       |
| - Quick status pills: '11/12 Filed', '1 Overdue'            |
| - Sticky bottom bar: 'Proceed to Dashboard (N Selected) ->' |
+-------------------------------------------------------------+
                              |
                     [Proceed / Track]
                              |
                              v
+-------------------------------------------------------------+
| Step 2: Scoped Compliance Dashboard & Detailed Cockpit      |
| - Top Obsidian Header: '<- Select Clients (N Checked)'      |
| - Top 4 KPI Cards: Scoped STRICTLY to selected clients      |
|   (e.g., 48 returns due for 4 clients instead of 11,544)    |
| - Mode A (Cockpit): Month-by-month filings of chosen clients|
| - Mode B (Matrix): 12M timeline for chosen client           |
| - Direct jump to 3B Working, 2B Autopilot, GSTR-1           |
+-------------------------------------------------------------+
```

### B. In-Memory Aggregation vs Flat Month Expansion:
- **Directory Mode (Step 1):** Uses `uniqueClients` aggregation `Map<string, UniqueClientSummary>`:
  - Keys: Normalized GSTIN.
  - Aggregations: `filedCount`, `pendingCount`, `overdueCount`, `totalDue`, `totalCashPaid`, `frequency`.
  - Rendering 962 distinct rows instead of 11,544 reduces DOM nodes by ~92% and guarantees 60fps scrolling.
- **Detailed Mode (Step 2):** Uses `scopeFilteredRecords`:
  - When `checkedGstins.size > 0`, filters `records` to `checkedGstins.has(r.clientGstin.toUpperCase())`.
  - Computes `kpiMetrics` dynamically over the filtered subset so KPIs, overdue penalties, and late fee estimations reflect only the selected client(s).

---

## 3. Implementation Guardrails & Zero-Regression Standards

1. **Zero-Merge Architecture Preservation:**
   - All Excel compliance exports must continue calling `removeAllMergesFromWorkbook(wb)` prior to saving (`ws['!merges'] = []`).
2. **Preservation of Autopilot Integration:**
   - Autopilot login and return scraping (`/api/returns/sync-portal-tracking`, `gstr_tracking/autopilot.js`) must receive the correct active GSTIN whether selected as a single client or from multi-client scope.
3. **Seamless State Persistence:**
   - Navigating between Step 1 and Step 2 must never clear `checkedGstins` or active search filters.
   - Returning to Step 1 via `← Select Clients` allows modifying selection effortlessly.
