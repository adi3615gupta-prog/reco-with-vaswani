# Synthesized Requirements

**Source Document:** `gst_debit_note_reconciliation_engine_spec.md`

## REQ-DN-01: 6-Pass Waterfall Reconciliation Pipeline
- **Source:** `gst_debit_note_reconciliation_engine_spec.md`
- **Scope:** Debit Note and Credit Note matching
- **Description:** Implement a 6-pass sequential matching waterfall for pairing Purchase Register (PR) debit notes against GSTR-2B credit/debit notes.
- **Pass Sequence:**
  1. **Pass 1:** 1-to-1 exact & normalized invoice number matching with composite batch guardrail
  2. **Pass 2:** 1-to-1 exact/near amount ($\le$ ₹10 value, $\le$ ₹2 tax) match for generic `DN` placeholder vouchers
  3. **Pass 3:** 1-to-many consolidated batch solver (date-cluster & subset-sum solver)
  4. **Pass 4:** 1-to-1 fuzzy value (5% variance) & date proximity match ($\le$ 30 days)
  5. **Pass 5:** Unmatched GSTR-2B classification (`In GSTR-2B Only (Not in Books)`)
  6. **Pass 6:** Unmatched Books classification (`In Books Only (Not in GSTR-2B)` / `Zero-Value Seed Entry`)

## REQ-DN-02: 1-to-Many Consolidated Batch Solver
- **Source:** `gst_debit_note_reconciliation_engine_spec.md`
- **Scope:** Lump-sum debit notes vs product-wise 2B credit notes
- **Description:** Identify buyers' single lump-sum debit note entries that equal the sum of 2 to 15 GSTR-2B credit notes issued by the same supplier on the same date or billing cycle.
- **Acceptance Criteria:**
  - Support exact date-cluster matching within ₹25 value and ₹15 tax tolerance.
  - Support bounded subset-sum solver for split same-day batches ($2 \le |S| \le 15$).
  - Emit lead row with original PR values and grouped sub-rows with ₹0 PR values to maintain zero double-counting invariant.

## REQ-DN-03: Composite Invoice Number Detection
- **Source:** `gst_debit_note_reconciliation_engine_spec.md`
- **Scope:** Guardrail against partial matches
- **Description:** When an exact invoice number matches a 2B note but the Books value is significantly larger (`Val_PR > Val_2B + 10.00`), check if Books value equals the sum of consecutive 2B notes (e.g. `1466468745 + 1466468746`).
- **Acceptance Criteria:**
  - Defer Pass 1 matching and route composite candidate to Pass 3 Consolidated Batch Solver.

## REQ-DN-04: Robust Pre-Processing & Supplier Name Resolution
- **Source:** `gst_debit_note_reconciliation_engine_spec.md`
- **Scope:** Data normalization
- **Description:** Automatically clean numerical strings, strip regional FY prefixes (`MH-2526/`), identify generic voucher labels (`DN`), and resolve missing GSTINs via normalized supplier name lookup against unique 2B vendors.
- **Acceptance Criteria:**
  - Correctly parse negative accounting numbers in parentheses.
  - Map unvalued seed/agricultural returns (`₹0.00`) to exempt 2B notes.

## REQ-DN-05: 21-Column Reconciled Register Output
- **Source:** `gst_debit_note_reconciliation_engine_spec.md`
- **Scope:** Export and display schema
- **Description:** Format reconciled records into the standardized 21-column layout with explicit status classifications and action remarks.
- **Acceptance Criteria:**
  - Net tax difference calculated as `(CGST_PR + SGST_PR + IGST_PR) - (CGST_2B + SGST_2B + IGST_2B)`.
  - Detailed audit remarks explaining match mechanism or required taxpayer follow-up.
