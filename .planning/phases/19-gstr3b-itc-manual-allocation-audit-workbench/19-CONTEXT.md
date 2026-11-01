# Phase 19: GSTR-3B Inward ITC Manual Allocation & Voucher-Level Audit Workbench (2B Drill-Down, Field Selection & Statutory Track Record)

## Phase Goal
Build an in-place, voucher-level **GSTR-3B Inward ITC Allocation & Audit Workbench** integrated directly into Table 4 ("Inward Supplies & ITC") of the GSTR-3B Working Sheet (`src/pages/ReturnsDashboard.tsx`). 

When GSTR-2B data is injected (or at any time during return preparation), tax professionals and accountants will be able to click an interactive hyperlink on the "ITC as per GSTR 2B" row to toggle the in-place workbench on the same page. The workbench provides a complete, itemized audit track record of every GSTR-2B inward voucher, allowing users to classify each bill into its statutory destination:
- **Table 4(A)(5) — All Other ITC (Eligible)**
- **Table 4(A)(3) — Inward RCM Supplies**
- **Table 4(A)(1) — Import of Goods**
- **Table 4(B)(1) — ITC Reversal: Rule 38/42/43 & Sec 17(5)**
- **Table 4(B)(2) — ITC Reversal: Others**
- **Table 4(D)(1) — Ineligible ITC: Sec 17(5) Blocked Credit** (Motor vehicles, food/beverage, catering, club membership, etc.)
- **Table 4(D)(2) — Ineligible ITC: Sec 16(4) / POS Restricted** (Time-barred or recipient state mismatch)
- **Deferred / Hold** (Do not claim in current month's GSTR-3B; carry forward to subsequent month)

Applying allocations dynamically updates Table 4 line items, recalculates the Rule 88A set-off cascade and net cash liability, saves the mapping to SQLite `gstr3b_itc_allocations`, and exports a Zero-Merge (`ws['!merges'] = []`) audit annexure for GST department scrutiny defense.

---

## Architectural & Statutory Context

### 1. Statutory Grounding (CGST Act, 2017 & CGST Rules, 2017)
- **Section 16(2)(aa):** ITC is admissible to recipient only if supplier has uploaded the invoice in GSTR-1/IFF and it reflects in recipient's GSTR-2B.
- **Section 17(5) [Blocked Credits]:** Inward supplies of passenger motor vehicles, food and beverages, outdoor catering, beauty treatment, health services, membership of clubs/gyms, travel benefits to employees, goods lost/stolen/destroyed/written off, and personal consumption are strictly inadmissible.
- **Table 4(B)(1) vs Table 4(B)(2) vs Table 4(D)(1) Distinction:**
  - *Table 4(B)(1) [Permanent Reversals]:* Rule 38 (banking 50%), Rule 42 (inward inputs used for exempt supplies), Rule 43 (capital goods used for exempt supplies), and Section 17(5) permanent reversals. These amounts are non-reclaimable forever.
  - *Table 4(B)(2) [Temporary Reversals]:* Rule 37 (supplier invoice unpaid for >180 days), Section 16(2)(b) (invoice received but goods/services in transit/not received), and commercial invoice disputes. These credits are **RECLAIMABLE** in subsequent months under Table 4(A)(5) and reported in Table 4(D)(1) reclaim.
  - *Table 4(D)(1) & 4(D)(2) [Ineligible Credits]:* Informational disclosure of blocked credits u/s 17(5) and time-barred credits u/s 16(4) / POS restrictions.
  - The workbench provides dedicated, color-coded **Selection Tabs** with live counts and tax totals for each statutory category, allowing instant filtering, inspection, and 1-click reallocation.
- **Section 16(4) [Time Barred Credits]:** Invoices received past the 30th November cutoff for the previous financial year cannot be claimed in 4(A)(5) and must be isolated into Table 4(D)(2).
- **Rule 38 / 42 / 43 Reversals:** Common input tax credit attributable to exempt supplies or non-business purposes must be reversed in Table 4(B)(1) / 4(B)(2).

### 2. User Problem Statement
Tax accountants and CAs currently inject GSTR-2B into GSTR-3B Table 4 with a single lump-sum figure. However, in real-world compliance:
1. Not all 2B vouchers are eligible for claim — some belong to personal car repairs, meals, or exempt businesses.
2. Inward RCM supplies (`rchrg = 'Y'`) must go to Table 4(A)(3) and Table 3.1(d), not 4(A)(5).
3. Import invoices must go to 4(A)(1).
4. Clients frequently hold certain disputable vendor bills (`Deferred`) until the vendor clears commercial issues.
5. If the GST department issues a scrutiny notice (ASMT-10 or DRC-01) challenging Table 4 ITC, the taxpayer must provide a voucher-by-voucher reconciliation proving exactly which bills formed 4(A)(5), 4(B), and 4(D).

---

## Scope Fences

### In-Scope
1. **Interactive In-Place Drill-Down in `ReturnsDashboard.tsx`:**
   - Table 4 row "ITC as per GSTR 2B" receives an interactive hyperlink / button (`View & Allocate 2B Bills (N)`).
   - Toggles an in-place view on the same page replacing the 3B working table with `<Gstr3bItcAllocationWorkbench ... />`.
   - Sticky top navigation bar with `← Back to GSTR-3B Working Sheet` return button.
2. **Persistent Allocation Repository (`gstr3b_itc_allocations` in SQLite):**
   - Stores `(client_gstin, return_period, invoice_id)` with `target_table`, `notes`, `allocated_by`, timestamps.
   - Intelligent statutory defaults: `rchrg === 'Y'` $\to$ `4A3`, `IMPG`/`CBW` $\to$ `4A1`, `itc_available === 'N'` $\to$ `4D1`, default $\to$ `4A5`.
3. **Audit Workbench UI Component (`Gstr3bItcAllocationWorkbench.tsx`):**
   - KPI metrics deck: Total 2B Tax, Eligible 4(A)(5), Ineligible 17(5) / 16(4), Reversals 4(B), RCM 4(A)(3), Deferred.
   - 100% Reconciliation Verification Chip: Guarantees `Total 2B = Allocated Sum`.
   - Multi-select checkboxes with bulk classification bar: "Mark Selected as Ineligible 17(5)", "Mark Selected as Eligible 4(A)(5)", "Mark Selected as Reversals", "Defer Selected".
   - Search bar (by GSTIN, invoice number, supplier name) and quick filter tabs (`All`, `Eligible 4A5`, `Ineligible 4D1/4D2`, `Reversals 4B`, `RCM 4A3`, `Deferred`).
   - Individual voucher dropdown for destination table and inline audit note.
4. **Dynamic GSTR-3B Recalculation Engine:**
   - "Apply Allocations to 3B Working Sheet" recalculates `cur.inward.itc2b` (4A5), `cur.inward.rcmPaid` (4A3), `cur.inward.importGoods` (4A1), `cur.inward.itcReversed` (4B), and updates `cur.inward.ineligibleItc` (4D).
   - Recomputes Total ITC Available `(B)`, tax payable `(A-B)`, and Rule 88A set-off cascade across CGST, SGST, IGST.
   - Persists state to SQLite and shared server storage (`POST /api/returns/working-data`).
5. **Zero-Merge Excel Audit Annexure (`ws['!merges'] = []`):**
   - Generates a multi-sheet audit-grade workbook:
     - Sheet 1: `ITC Allocation Summary`
     - Sheet 2: `4(A)(5) Eligible ITC`
     - Sheet 3: `4(D) Ineligible Credit`
     - Sheet 4: `4(B) ITC Reversals`
     - Sheet 5: `Deferred Vouchers`
   - Strict defense-in-depth enforcement of zero merged cells for instant filtering and sorting.

### Out-of-Scope (Deferred)
- Automated AI scanning of vendor line items for Section 17(5) keyword detection (deferred to AI Phase).
- Automatic vendor communication via WhatsApp for deferred bills (covered in Party-Wise Report).

---

## Success Criteria & Verification Gates
1. Clicking "View & Allocate 2B Bills" in Table 4 opens the workbench in-place on the same page without navigating away.
2. All 2B invoices for the active client & return period are listed with correct statutory defaults.
3. User can bulk-select invoices and assign them to Ineligible 17(5) or Reversals with 1 click.
4. "Apply Allocations to 3B Working Sheet" updates Table 4 line items and recalculates Rule 88A set-off instantly.
5. All classifications are saved in SQLite `gstr3b_itc_allocations` and survive page reload.
6. Excel export generates a multi-sheet audit report with strictly zero merged cells.
7. TypeScript compilation passes with zero errors (`npx tsc --noEmit`).
