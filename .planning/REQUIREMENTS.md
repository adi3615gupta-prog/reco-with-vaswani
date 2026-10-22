# Requirements: Vaswani Return Enterprise

**Defined:** 2026-10-22
**Core Value:** Audit-grade, high-precision reconciliation and statutory tax computation that eliminates double-counting, strictly guarantees zero merged cells in analytical workbooks, and runs completely locally and securely.

## v1 Requirements

### Debit Note Advanced Reconciliation (Ingested from SPEC)

- [ ] **DN-01**: Implement 6-pass waterfall reconciliation pipeline for debit/credit notes
  - Pass 1: 1-to-1 exact & normalized invoice match with composite guardrail
  - Pass 2: 1-to-1 exact/near amount match for generic `DN` placeholder vouchers
  - Pass 3: 1-to-many consolidated batch solver (date-cluster & subset-sum solver)
  - Pass 4: 1-to-1 fuzzy value (5% tolerance) & date proximity match
  - Pass 5: Unmatched 2B classification (`In GSTR-2B Only`)
  - Pass 6: Unmatched PR classification (`In Books Only` / `Zero-Value Seed Entry`)
- [ ] **DN-02**: Implement 1-to-many consolidated batch solver
  - Exact date-cluster sum matching within ₹25 value and ₹15 tax tolerance
  - Bounded subset-sum solver ($2 \le |S| \le 15$) for split same-day batches
  - Lead row + grouped sub-row formatting with ₹0 PR values on sub-rows
- [ ] **DN-03**: Composite invoice number detection guardrail
  - Detect when single PR invoice number covers multiple consecutive 2B notes
  - Defer Pass 1 match to Pass 3 batch solver
- [ ] **DN-04**: Robust accounting pre-processing pipeline
  - Parse parenthesized negative numbers `(45,04,490.90)` to negative floats
  - Clean commas, spaces, dashes, and strip regional/FY prefixes
  - Identify generic placeholder voucher tokens (`DN`, `CN`, `DEBITNOTE`)
  - Supplier name phonetic/normalization fallback for missing PR GSTINs
- [ ] **DN-05**: Standardized 21-column reconciled register output
  - Full side-by-side PR vs 2B column layout
  - Mathematical zero double-counting accounting invariant validation ($\sum \text{Reconciled} = \sum \text{Raw Input}$)
  - Detailed audit remarks and recommended actions per line item

### Core Platform Standards

- [ ] **CORE-01**: Maintain strict Zero-Merge architecture (`ws['!merges'] = []`) across all Excel exports
- [ ] **CORE-02**: Ensure all CPU-intensive reconciliation passes run in Web Workers off UI thread
- [ ] **CORE-03**: Preserve single-login 12-month autonomous Playwright portal sync capability

## v2 Requirements

### Advanced Refactoring & Performance

- **ARCH-01**: Modularize monolithic `src/lib/fileParser.ts` into isolated export components
- **ARCH-02**: Stream 12-month consolidated Excel generation via `exceljs` to optimize memory usage
- **AUDIT-01**: Persist immutable audit log with timestamp and justification for manual force-matches

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cloud-hosted financial database | Violates client privacy and statutory local data security mandates |
| Direct filing to GSTN without review | Statutory tax liability requires qualified practitioner verification before submission |
| Cell merging in analytical spreadsheets | Permanently disables column sorting, AutoFilters, and lookup formulas |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DN-01 | Phase 1 | Pending |
| DN-02 | Phase 1 | Pending |
| DN-03 | Phase 1 | Pending |
| DN-04 | Phase 1 | Pending |
| DN-05 | Phase 1 | Pending |
| CORE-01 | Phase 1 | Pending |
| CORE-02 | Phase 1 | Pending |
| CORE-03 | Phase 1 | Pending |
| ARCH-01 | Phase 2 | Pending |
| ARCH-02 | Phase 2 | Pending |
| AUDIT-01 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-22*
*Last updated: 2026-10-22 after doc ingest*
