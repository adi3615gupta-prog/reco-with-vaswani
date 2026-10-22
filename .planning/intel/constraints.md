# Technical Constraints

**Source Document:** `gst_debit_note_reconciliation_engine_spec.md`

## 1. Zero Double-Counting Accounting Invariant
- **Type:** accounting-invariant / core-contract
- **Source:** `gst_debit_note_reconciliation_engine_spec.md` (lines 44-53)
- **Constraint:** Every input PR record ($N_{\text{PR}}$) and every 2B record ($N_{\text{2B}}$) must be accounted for exactly once in the numeric column totals:
  $$\sum_{\text{Reconciled Rows}} \text{Col}_k = \sum_{\text{Raw Input Rows}} \text{Col}_k \quad \forall k \in \{10 \dots 20\}$$
- **Lead Row + Grouped Sub-Rows Pattern:** When 1 Books (PR) entry matches $m$ GSTR-2B notes ($m \ge 2$), Row 1 contains the full PR values alongside 2B note 1. Rows 2 through $m$ set `Invoice No (PR)` to `"<Ref> (Grouped)"` and set all 5 numeric PR values to `0.00` to prevent grand-total double counting while maintaining individual 2B row traceability.

## 2. 21-Column Reconciled Register Schema
- **Type:** schema-contract
- **Source:** `gst_debit_note_reconciliation_engine_spec.md` (lines 16-43)
- **Constraint:** Both input and reconciled registers must conform to the 21-column layout:
  1. `Match Status`
  2. `GSTIN (PR)`
  3. `GSTIN (2B)`
  4. `Supplier Name (PR)`
  5. `Supplier Name (2B)`
  6. `Invoice No (PR)`
  7. `Invoice No (2B)`
  8. `Invoice Date (PR)`
  9. `Invoice Date (2B)`
  10. `Invoice Value (PR)`
  11. `Invoice Value (2B)`
  12. `Taxable Value (PR)`
  13. `Taxable Value (2B)`
  14. `CGST (PR)`
  15. `CGST (2B)`
  16. `SGST (PR)`
  17. `SGST (2B)`
  18. `IGST (PR)`
  19. `IGST (2B)`
  20. `Net Tax Diff`
  21. `Audit Remarks / Action`

## 3. Numeric Normalization and Cleaning
- **Type:** data-normalization
- **Source:** `gst_debit_note_reconciliation_engine_spec.md` (lines 58-70)
- **Constraint:**
  - Strip spaces and commas (including Indian numbering commas).
  - Handle parenthesized values `(45,04,490.90)` as negative floats.
  - Convert `""`, `"-"`, `"--"`, `"N/A"` to `0.00`.
  - Strip known regional/fiscal-year prefixes (e.g. `MH-2526/`, `MH-CN-2526-`, `MH/25-26/`).
  - Identify generic placeholder voucher tokens (`""`, `"DN"`, `"DEBITNOTE"`, `"CN"`, `"CREDITNOTE"`).
  - Ignore corrupted GSTINs containing date strings (e.g. `"01/07/2017"` in `GSTIN (PR)` treated as missing GSTIN with supplier name fallback).

## 4. Subset-Sum Batch Solver Bounds
- **Type:** algorithmic-bound
- **Source:** `gst_debit_note_reconciliation_engine_spec.md` (lines 101-115)
- **Constraint:**
  - Subset-sum search bounded to subsets $S$ of size $2 \le |S| \le 15$.
  - Invoice value sum tolerance within ₹25.00; total tax sum tolerance within ₹15.00.
  - Candidate 2B rows prioritized within $\pm 45$ days of PR date or contiguous note number sequences.
