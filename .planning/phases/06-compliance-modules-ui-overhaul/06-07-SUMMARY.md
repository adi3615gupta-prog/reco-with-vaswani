# Plan 06-07 Summary: Split Returns Autopilot & Ingestion Deck

## Execution Overview
- **Completed:** 2026-10-23
- **Commit:** `f17b752`
- **Scope Completed:** Split the unified Returns Auto-Pilot & Ingestion Deck into two distinct, side-by-side operational cockpits with dedicated GSTR-1 Outward Sales and GSTR-2B Inward ITC controls, dedicated drag-and-drop dropzones, live metrics breakdowns, and pre-injection confirmation dialogs (User Decision D-02).

---

## 1. Key Deliverables & Changes

### A. Side-by-Side 2-Column Cockpit Layout
- **Left Cockpit (Blue/Indigo styling): GSTR-1 Outward Sales Deck**
  - Targets statutory **GSTR-3B Table 3.1**
  - Independent **"🚀 Sync GSTR-1 Autopilot"** button calling `POST /api/gstr1/portal-sync-browser`
  - Dedicated GSTR-1 Drag & Drop file dropzone (`.json`, `.xlsx`, `.zip`)
  - Live Breakdown Card: B2B Sales, B2C Sales, Total Outward Taxable, Total Outward Tax
  - Dedicated **"Inject into Table 3.1"** action trigger
- **Right Cockpit (Emerald/Teal styling): GSTR-2B Inward ITC Deck**
  - Targets statutory **GSTR-3B Table 4**
  - Independent **"🚀 Sync GSTR-2B Autopilot"** button calling `POST /api/gstr2b/portal-sync-browser`
  - Dedicated GSTR-2B Drag & Drop file dropzone (`.json`, `.xlsx`, `.zip`)
  - Live Breakdown Card: 4(A)(5) All Other ITC, Inward RCM Paid, Credit Note Reversals, Net Available ITC (Row 41)
  - Dedicated **"Inject into Table 4"** action trigger
- **Global Toolbar**:
  - Financial Year selector pills (`2025-26`, `2026-27`)
  - Optional **"Sync Both Autopilot"** sequential batch action
  - **"Save 3B Working"**, **"Inspect Ledger"**, and **"Clear Month"** shortcuts

### B. Pre-Injection Confirmation Protocol (User Decision D-02)
- Added modal dialog triggered whenever an injection into Table 3.1 or Table 4 is requested.
- Displays filing period, target client GSTIN, and comprehensive tabular summary of figures (Taxable, CGST, SGST, IGST, Total) before updating working state.
- Informs the user that existing table entries will be updated and Rule 88A set-off cascade will automatically recalculate.

### C. Database Hydration Bug Fix
- Enhanced `GET /api/gstr1/invoices/:gstin?period=...` in `gstr1_routes.js` to return `batch: batchRow`.
- Enhanced `GET /api/gstr2b/invoices/:gstin?period=...` in `gstr2b_routes.js` to return `batch: batchRow`.
- Automatically hydrates both GSTR-1 and GSTR-2B deck states from local SQLite DB on client or period change, solving the previous issue where only GSTR-2B was checked.

---

## 2. Verification & Validation
- **Sample Tie-Out:** Tested with reference sample `D:\My software\full and final\6. September-2026` (`DYP INFRAPROJECTS PRIVATE LIMITED` - `27AAGCD4105L1ZO`):
  - GSTR-1: B2B Taxable ₹20,018,168.60, B2C Taxable ₹491,948.00 $\rightarrow$ Total Outward: ₹20,510,116.60 (Exact tie-out with Row 22).
  - GSTR-2B: Eligible ITC: ₹961,184.83, RCM Inward: ₹10,367.52, CDNR: ₹1,728.00 $\rightarrow$ Net Available ITC: ₹969,824.35 (Exact tie-out with Row 41).
  - Independent injection verified: Injecting GSTR-1 does not alter Table 4; injecting GSTR-2B does not alter Table 3.1.
- **Build Checks:**
  - `npx tsc --noEmit`: 0 errors.
  - `npm run build`: Production bundle built successfully (32.05s).
