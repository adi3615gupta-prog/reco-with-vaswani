# Module 1.6: Voucher Reclassifier & Rectifier

> **Suite Accent Color:** Amber / Violet (`#f59e0b` / `#8b5cf6`)  
> **Route:** `/voucher-reclass`  
> **Source Component:** [`src/pages/VoucherReclassifier.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/VoucherReclassifier.tsx)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** Tally imports ya manual accounting me galat ledgers me post huye vouchers ko bulk me re-classify aur re-map karta hai.
- **Kyu karta hai:** Audit ya tax filing se pehle wrong account groupings (e.g. Repairs treated as Capital Asset, or Purchase recorded under Office Expense) ko single click me fix karne ke liye.
- **Kaise karta hai:** Vouchers filter karta hai by current ledger, target replacement ledger select karta hai, aur bulk migration execute karta hai.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Reclassification Control Panel
- **Source Ledger Selector:** Dropdown of all Tally ledgers with voucher counts.
- **Target Replacement Ledger:** Searchable dropdown with automatic group classification.
- **Filter Criteria:** Date range, voucher type (Payment, Journal, Purchase), amount range.

### 2.2 Vouchers Staging Table
- **Columns:** Select Checkbox | Voucher Date | Voucher No | Current Ledger | Party / Narration | Debit Amount | Credit Amount | New Target Ledger.
- **Batch Action Footer:** `Select All (142 Vouchers)`, `Preview Ledger Impact`, `Apply Reclassification`.

---

## 3. Stitch UI Prompt Snippet
```markdown
Design a Bulk Accounting Voucher Reclassification Screen.
- Top Panel: Source Ledger dropdown with count, Target Ledger selector, and Date/Amount filters.
- Data Table: List of affected vouchers with checkboxes, narration preview, and side-by-side Before/After ledger badges.
- Bottom Bar: Sticky confirmation bar with "Reclassify Selected Vouchers" primary action button.
```
