# Module 4.2: 12-Month FY Comparative Matrix

> **Suite Accent Color:** Purple / Blue (`#a855f7` / `#3b82f6`)  
> **Route:** `/returns` (Tab: `matrix`)  
> **Source Component:** [`src/components/FyMatrixView.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/FyMatrixView.tsx)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** Poore Financial Year (April se March) ka comparative 12-month grid create karta hai, jisme GSTR-3B vs GSTR-2B vs GSTR-1 vs Books Purchase/Sales Registers side-by-side match hote hain.
- **Kyu karta hai:** GSTR-9 (Annual Return) aur GSTR-9C (Reconciliation Statement) filing ke liye annual turnover, tax liability, aur ITC claimed ka reconciliation mandatory hota hai.
- **Kaise karta hai:** SQLite database se 12 mahino ke batches aggregate karta hai, month-by-month tax discrepancies color-code karta hai (Green $\le$ ₹2, Amber = Timing diff, Red = Unpaid tax / Short ITC), aur Cross-Verify Tie-Out generate karta hai.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Annual Comparative Grid Layout (13 Columns)
Columns: `Metric / Particulars` | `Apr` | `May` | `Jun` | `Jul` | `Aug` | `Sep` | `Oct` | `Nov` | `Dec` | `Jan` | `Feb` | `Mar` | **FULL YEAR TOTAL**

### 2.2 Sections in the Matrix
1. **Outward Supply & Tax Liability:**
   - 3B Outward Taxable Value vs GSTR-1 Outward vs Books Sales
   - Tax Difference: Colored Green / Red
2. **Inward Supply & Input Tax Credit (ITC):**
   - 3B Table 4 ITC Claimed vs GSTR-2B Auto-Drafted ITC vs Books Purchase Register
   - Net Inward Discrepancy (Excess Claimed vs Under Claimed)
3. **Cash Tax Paid:**
   - Cash IGST, CGST, SGST paid via Table 6.1 vs Electronic Cash Ledger debits
4. **Closing Balances:**
   - Closing Electronic Credit Ledger (IGST, CGST, SGST) vs Tally Input Tax balances

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an enterprise 12-Month Financial Year GST Comparative Matrix.
- Layout: 13-column financial spreadsheet grid (April through March plus Annual Total column).
- Sections: Collapsible table groups for Outward Tax Liability (3B vs G1 vs Books), Inward ITC (3B vs 2B vs Books), and Cash Paid.
- Visuals: Pristine white elevated frosted card background, monospaced numbers, cell color badges for matched (green), timing delay (amber), and unpaid tax (red).
- Export: Sticky export toolbar for "Download FY Matrix Excel" and "Cross-Verify Tie-out Sheet".
```
