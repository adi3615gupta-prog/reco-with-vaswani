# Module 4.1: GSTR-3B Working Sheet & Rule 88A Set-off Engine

> **Suite Accent Color:** Purple 500 (`#a855f7`)  
> **Route:** `/returns` (Tab: `working3b`)  
> **Source Component:** [`src/components/Gstr3bWorkingSheet.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/Gstr3bWorkingSheet.tsx)  
> **Core Engine:** [`src/lib/gstr3bEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/gstr3bEngine.ts)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** Monthly GSTR-3B tax computation karta hai, Outward supplies (Table 3.1) aur Eligible Inward ITC (Table 4) calculate karta hai, Section 49 & Rule 88A ke tehat Electronic Credit Ledger ka optimal set-off cascade execute karta hai, aur official GSTN JSON generate karta hai.
- **Kyu karta hai:** Rule 88A set-off hierarchy me agar galti ho jaye, toh taxpayer ko unnecessary cash pay karna padta hai jabki credit ledger me balance pada rehta hai.
- **Kaise karta hai:**
  - Table 4(A)(5) All Other ITC me **Credit Notes deduct karke aur Debit Notes add karke** net figure derive karta hai.
  - **Rule 88A Cascade Waterfall:**
    1. IGST Credit pehle 100% IGST liability ke against exhaust hota hai.
    2. Remaining IGST Credit ko CGST aur SGST liability me optimally divide karta hai.
    3. CGST Credit sirf CGST aur IGST liability ke against use hota hai (never SGST).
    4. SGST Credit sirf SGST aur IGST liability ke against use hota hai (never CGST).
    5. Remaining balance Table 6.1 Net Cash Payable me transfer hota hai.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Month Selector & Autopilot Ingestion Bar
- 12 Monthly Pills: `April`, `May`, `June`, `July`, `August`, `September`, `October`, `November`, `December`, `January`, `February`, `March`.
- **Autopilot Quick Ingestion Buttons:**
  - `⚡ Ingest GSTR-2B Inward` (Auto-populates Table 4 ITC)
  - `⚡ Ingest GSTR-1 Outward` (Auto-populates Table 3.1 Outward)
  - `⚡ Ingest Tally Books` (Auto-populates PR & Sales Register)

### 2.2 Table 3.1: Details of Outward Supplies & RCM
- **Grid Layout:**
  | Table 3.1 Category | Taxable Value | Integrated Tax (IGST) | Central Tax (CGST) | State Tax (SGST) | Cess |
  |---|---|---|---|---|---|
  | 3.1(a) Outward Taxable Supplies | 1,25,00,000 | 18,50,000 | 2,00,000 | 2,00,000 | 0 |
  | 3.1(b) Outward Zero-Rated (Exports/SEZ)| 25,00,000 | 0 | 0 | 0 | 0 |
  | 3.1(c) Other Outward (Nil/Exempt) | 5,00,000 | 0 | 0 | 0 | 0 |
  | 3.1(d) Inward Supplies (Reverse Charge)| 2,50,000 | 0 | 22,500 | 22,500 | 0 |
  | 3.1(e) Non-GST Outward Supplies | 0 | 0 | 0 | 0 | 0 |
  | **TOTAL OUTWARD TAX LIABILITY** | **1,57,50,000**| **18,50,000** | **2,22,500** | **2,22,500** | **0** |

### 2.3 Table 4: Eligible Input Tax Credit (ITC)
- **Grid Layout:**
  - 4(A)(1) Import of Goods
  - 4(A)(2) Import of Services
  - 4(A)(3) Inward Supplies liable to Reverse Charge (RCM)
  - 4(A)(4) Inward Supplies from ISD
  - 4(A)(5) **All Other ITC (Net of CDNR: Inward - CN + DN)**
  - 4(B)(1) Reversals as per Rule 38, 42 & 43 and Section 17(5)
  - 4(B)(2) Others (Rule 37 180-day reversal, timing diff)
  - **4(C) NET ITC AVAILABLE = 4(A) minus 4(B)**

### 2.4 Table 6: Rule 88A Tax Set-off Cascade Matrix
- **Waterfall Set-off Grid:**
  | Tax Liability Head | Gross Liability | Paid by IGST Credit | Paid by CGST Credit | Paid by SGST Credit | Paid by Cess Credit | Net Cash Payable (Table 6.1) |
  |---|---|---|---|---|---|---|
  | Integrated Tax (IGST) | 18,50,000 | 18,50,000 | 0 | 0 | 0 | **₹0.00** |
  | Central Tax (CGST) | 2,22,500 | 1,50,000 | 72,500 | [LOCKED] | 0 | **₹0.00** |
  | State Tax (SGST) | 2,22,500 | 1,50,000 | [LOCKED] | 72,500 | 0 | **₹0.00** |
  | Reverse Charge (RCM) | 45,000 | [NOT ALLOWED] | [NOT ALLOWED] | [NOT ALLOWED] | 0 | **₹45,000.00 (Cash Only)** |
  | Cess | 0 | 0 | 0 | 0 | 0 | **₹0.00** |
  | **TOTAL CASH PAYABLE** | | | | | | **₹45,000.00** |

### 2.5 Action Bar
- `Download Official GSTN Portal JSON (v1.0)`
- `Print Official Working Sheet (PDF)`
- `Export 12-Month Excel`

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an enterprise GSTR-3B Tax Working Sheet & Rule 88A Set-off Calculator.
- Top: Month selector tabs (April to March) with 1-click Ingestion pills for 2B, GSTR-1, and Tally Books.
- Section 1: Table 3.1 Outward supplies breakdown (Taxable, IGST, CGST, SGST, Cess, RCM).
- Section 2: Table 4 Eligible ITC grid featuring Table 4(A)(5) All Other ITC automatically net of CDNR.
- Section 3: Interactive Rule 88A Set-off Waterfall Matrix showing credit allocation from Electronic Credit Ledger to Cash Ledger.
- Bottom Bar: Sticky action bar with "Download Portal JSON" and "Print Working Sheet" buttons.
```
