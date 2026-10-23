# Module 2.1: GST 2B vs Books Multi-Pass Reconciliation Engine

> **Suite Accent Color:** Emerald 500 (`#10b981`)  
> **Glow / Glass Border:** `rgba(16, 185, 129, 0.25)`  
> **Route:** `/reco`  
> **Primary Components:** [`src/pages/Reconciliation.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/Reconciliation.tsx), [`src/components/ResultsCategoryTabs.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/ResultsCategoryTabs.tsx)  
> **Core Engine:** [`src/lib/reconciliation.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts), [`src/workers/reconciliation.worker.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/workers/reconciliation.worker.ts)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** Purchase Register (Books/Tally) aur GSTR-2B (GST Portal) ke hazaron invoices ko 8-pass hierarchical waterfall algorithm se match karta hai, exact differences nikalta hai, aur match category derive karta hai.
- **Kyu karta hai:** Section 16(2)(aa) CGST Act compliance — taxpayer sirf wahi ITC claim kar sakta hai jo supplier ne GSTR-1 me file kiya ho aur recipient ke GSTR-2B me reflect ho raha ho. Excess ITC par 18% interest + 100% penalty lagti hai.
- **Kaise karta hai:** Web Worker me multi-pass engine:
  - **Pass 1:** Exact GSTIN + Exact Inv No + Exact Amounts (`Perfect Match`).
  - **Pass 2:** Exact GSTIN + Exact Inv No + Diff $\le$ ₹2 (`Matched Rounded` / `Value Mismatch`).
  - **Pass 3:** Exact GSTIN + Exact Inv No + Same Amounts, Dates Differ (`Matched Diff Date`).
  - **Pass 4:** Alphanumeric cleaned invoice numbers (leading zeros, `/`, `-` stripped).
  - **Pass 5:** Core invoice serial match (`23-24/INV/0045` $\rightarrow$ `45`).
  - **Pass 6:** Decimal rounding mismatch $\le$ ₹1.
  - **Pass 7:** Vendor PAN cross-state fallback (`Wrong GSTIN` e.g. State 27 vs 24).
  - **Pass 8:** Leftovers (`Not in 2B`, `Not in Books`, `Prior FY Excluded`).

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Ingestion Deck (File Dropzones & Mapping Drawer)
- **3 File Upload Zones:**
  1. Books Purchase Register (`PR.xlsx` / `.csv` / Tally XML)
  2. GSTR-2B Portal File (`GSTR2B.xlsx` / `.json`)
  3. Standalone Purchase Return / Debit Note File (`DN.xlsx`)
- **Column Mapping Drawer:**
  - Auto-detected column mappings with manual override selectors for: `Invoice Number`, `Invoice Date`, `Vendor GSTIN`, `Taxable Value`, `IGST`, `CGST`, `SGST`, `Cess`.
- **Tolerance & Strictness Controls:**
  - Tolerance Slider: `± ₹0.00`, `± ₹1.00`, `± ₹2.00` (Default), `± ₹5.00`.
  - Fuzzy Clean Switch: Strip slashes, hyphens, and leading zeros.

### 2.2 Category Results Filter Bar (Segmented Tab Deck)
The top filter deck consists of high-visibility category tabs with live counts:
1. `All Records` (Total count, e.g. `14,890`)
2. `Perfect Match` (Emerald badge, e.g. `12,410`)
3. `Matched (Diff Date)` (Blue badge, e.g. `840`)
4. `Value Mismatch` (Amber badge, e.g. `312`)
5. `Missing in 2B` (Rose red badge, e.g. `780` — ITC risk in Books)
6. `Missing in Books` (Purple badge, e.g. `420` — Unclaimed ITC)
7. `Debit Notes` (Amber receipt badge, e.g. `118` — CDNR / PR Debit Notes)
8. `Prior FY (Excluded)` (Slate badge, e.g. `10` — Prior year timing entries)

### 2.3 Dense Financial Matching Grid (Side-by-Side Zero-Merge Layout)
- **Sticky Header (Two Halves):**
  - Left Half: **BOOKS PURCHASE REGISTER**
  - Middle: **STATUS & AUDIT ACTION**
  - Right Half: **GSTR-2B PORTAL SUPPLIES**
- **Columns:**
  | Books Inv No | Books Date | Books Taxable | Books IGST | Books CGST | Books SGST | Match Status | Portal Inv No | Portal Date | Portal Taxable | Portal IGST | Portal CGST | Portal SGST | Tax Diff | Actions |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | INV/2024/041 | 14-May-24 | 1,00,000 | 18,000 | 0 | 0 | `Perfect Match` | INV/2024/041 | 14-May-24 | 1,00,000 | 18,000 | 0 | 0 | ₹0.00 | `View` |
  | 8912 | 20-May-24 | 50,000 | 0 | 4,500 | 4,500 | `Value Mismatch` | 8912 | 20-May-24 | 50,000 | 0 | 4,550 | 4,550 | +₹100.00 | `Force Match` |
  | PO-9982 | 02-Jun-24 | 75,000 | 13,500 | 0 | 0 | `Not in 2B` | — | — | — | — | — | — | -₹13,500 | `Notice` |

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an enterprise-grade Luminous Fluid Corporate (Light Mode) screen for "GST Reconciliation Engine (2B vs Books)".
- Top Section: 3 Drag-and-drop file upload zones with Column Mapping Drawer and Tolerance Slider (± ₹2.00 default).
- Filter Deck: 8 Category tabs (All, Perfect Match, Matched Diff Date, Value Mismatch, Missing in 2B, Missing in Books, Debit Notes, Prior FY).
- Core Table: Side-by-side comparative financial grid displaying Books Invoice Data on the left, Status Badge in the center, and Portal 2B Data on the right.
- Visuals: Luminous Fluid Corporate palette (#F8FAFC background), JetBrains Mono for monetary values, sticky header, and hover row highlighting.
```
