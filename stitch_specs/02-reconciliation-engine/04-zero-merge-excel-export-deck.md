# Module 2.4: Zero-Merge Architecture Excel Export Suite

> **Suite Accent Color:** Emerald / Slate (`#10b981` / `#64748b`)  
> **Export Engine:** [`src/lib/fileParser.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/fileParser.ts) (`removeAllMergesFromWorkbook`)

---

## 1. Architectural Philosophy & Zero-Merge Mandate
- **Strict Architectural Rule:** Exported workbooks me **KAHI BHI CELL MERGE NAHI HONA CHAIYE** (`ws['!merges'] = []`).
- **Kyu:** In Excel, merged cells break column sorting, auto-filters, pivot tables, and formula lookup (`XLOOKUP`, `VLOOKUP`). When a CA attempts to sort an Excel sheet with merged cells, Excel displays the fatal error: *"To do this, all the merged cells need to be the same size."*
- **Kaise karta hai:** Titles and corporate metadata are placed cleanly in single cells (A1, A2) without merging across columns; multi-column headers and subtotals use native row styling.

---

## 2. Screen Layout & Export Control Deck

### 2.1 Export Options Deck (Interactive Modal / Bar)
The export deck provides 1-click access to audit-grade Excel models:
1. **Master 12-Tab Corporate Workbook (`Reco_Report_Corporate.xlsx`):**
   - Tab 1: `Dashboard` (Executive KPIs)
   - Tab 2: `Executive Summary`
   - Tab 3: `Monthly Tax Comparison`
   - Tab 4: `All Invoices Working`
   - Tab 5: `Partywise Monthly Working`
   - Tab 6: `Partywise Mismatch Invoices`
   - Tab 7: `Party Mismatch Breakdown`
   - Tab 8: `3B vs 2B vs Books`
   - Tab 9: `Timing Reconciliation`
   - Tab 10: `Party Summary`
   - Tab 11: `Party Details`
   - Tab 12: `📖 Methodology & Legend`
2. **Monthly Difference Sheets (`Monthly_Difference_Sheets.xlsx`):**
   - 12 separate monthly tabs (`April_Diff` through `March_Diff`).
3. **Monthly Comparison Matrix (`Monthly_Comparison.xlsx`):**
   - 6-table FY tax matrix (5 cols wide per table, clean `DIFFERENCE` tables).
4. **Standalone Party-Wise Report (`Party_Wise_Report.xlsx`):**
   - Consolidated vendor totals and paired debit notes.

### 2.2 UI Export Badge
The UI displays an authoritative compliance badge:
`✓ STRICT ZERO-MERGE ARCHITECTURE • 100% SORTABLE & XLOOKUP-SAFE`

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an Export Center Modal & Toolbar for Financial Excel Workbooks.
- Banner: Prominent "Zero-Merge Certified" badge ensuring 100% Excel sorting and filtering compatibility.
- Grid: 4 Action cards for Master Corporate Workbook (12 Tabs), Monthly Difference Sheets (12 Tabs), FY Comparative Matrix, and Party-Wise Report.
- Metadata: File size preview, sheet count indicator, and 1-Click "Download XLSX" button.
```
