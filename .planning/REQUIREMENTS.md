# Requirements: Vaswani Return Enterprise

**Defined:** 2026-10-22
**Core Value:** Audit-grade, high-precision reconciliation and statutory tax computation that eliminates double-counting, strictly guarantees zero merged cells in analytical workbooks, and runs completely locally and securely.

## v1 Requirements

### Debit Note Advanced Reconciliation (Ingested from SPEC)

- [x] **DN-01**: Implement 6-pass waterfall reconciliation pipeline for debit/credit notes
  - Pass 1: 1-to-1 exact & normalized invoice match with composite guardrail
  - Pass 2: 1-to-1 exact/near amount match for generic `DN` placeholder vouchers
  - Pass 3: 1-to-many consolidated batch solver (date-cluster & subset-sum solver)
  - Pass 4: 1-to-1 fuzzy value (5% tolerance) & date proximity match
  - Pass 5: Unmatched 2B classification (`In GSTR-2B Only`)
  - Pass 6: Unmatched PR classification (`In Books Only` / `Zero-Value Seed Entry`)
- [x] **DN-02**: Implement 1-to-many consolidated batch solver
  - Exact date-cluster sum matching within ₹25 value and ₹15 tax tolerance
  - Bounded subset-sum solver ($2 \le |S| \le 15$) for split same-day batches
  - Lead row + grouped sub-row formatting with ₹0 PR values on sub-rows
- [x] **DN-03**: Composite invoice number detection guardrail
  - Detect when single PR invoice number covers multiple consecutive 2B notes
  - Defer Pass 1 match to Pass 3 batch solver
- [x] **DN-04**: Robust accounting pre-processing pipeline
  - Parse parenthesized negative numbers `(45,04,490.90)` to negative floats
  - Clean commas, spaces, dashes, and strip regional/FY prefixes
  - Identify generic placeholder voucher tokens (`DN`, `CN`, `DEBITNOTE`)
  - Supplier name phonetic/normalization fallback for missing PR GSTINs
- [x] **DN-05**: Standardized 21-column reconciled register output
  - Full side-by-side PR vs 2B column layout
  - Mathematical zero double-counting accounting invariant validation ($\sum \text{Reconciled} = \sum \text{Raw Input}$)
  - Detailed audit remarks and recommended actions per line item

### Core Platform Standards

- [x] **CORE-01**: Maintain strict Zero-Merge architecture (`ws['!merges'] = []`) across all Excel exports
- [x] **CORE-02**: Ensure all CPU-intensive reconciliation passes run in Web Workers off UI thread
- [x] **CORE-03**: Preserve single-login 12-month autonomous Playwright portal sync capability

## v2 Requirements

### Advanced Refactoring & Performance

- **ARCH-01**: Modularize monolithic `src/lib/fileParser.ts` into isolated export components
- **ARCH-02**: Stream 12-month consolidated Excel generation via `exceljs` to optimize memory usage
- **AUDIT-01**: Persist immutable audit log with timestamp and justification for manual force-matches

### GSTR-2B Autopilot & Consolidated Downloader (Phase 4)

- [x] **G2B-01**: 1-Login 12-Month Autonomous Loop resilience with portal dropdown auto-retry, navbar Access Denied recovery, and non-blocking month failures
- [x] **G2B-02**: Golden Rule data safety: existing GSTR-2B data preserved on failed/aborted downloads, with clean separation between Nil returns and failed syncs
- [x] **G2B-03**: Consolidated 8-Sheet SectionWiseSummary workbook strictly enforces Zero-Merge (`ws['!merges'] = []`) with complete side-by-side Monthly and Party-wise matrices
- [x] **G2B-04**: Automated scrutiny Vitest test suite for GSTR-2B parsers, batch metric aggregations, and zero-merge guarantees

### Enterprise UI/UX Design System & Persistent Shell (Phase 5)

- [x] **UI-01**: Implement Persistent App Shell with collapsible sidebar, active client & FY indicators, and status HUD
- [x] **UI-02**: Modernize centralized Obsidian Glass design tokens in `src/index.css` (high contrast, crisp borders, dark palette)
- [x] **UI-03**: Standardize high-density financial table components with sticky headers and monospace tabular figures
- [x] **UI-04**: Global Quick Command palette (`Ctrl+K`) for instantaneous module navigation without state loss

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cloud-hosted financial database | Violates client privacy and statutory local data security mandates |
| Direct filing to GSTN without review | Statutory tax liability requires qualified practitioner verification before submission |
| Cell merging in analytical spreadsheets | Permanently disables column sorting, AutoFilters, and lookup formulas |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DN-01 | Phase 1 | Complete |
| DN-02 | Phase 1 | Complete |
| DN-03 | Phase 1 | Complete |
| DN-04 | Phase 1 | Complete |
| DN-05 | Phase 1 | Complete |
| CORE-01 | Phase 1 | Complete |
| CORE-02 | Phase 1 | Complete |
| CORE-03 | Phase 1 | Complete |
| ARCH-01 | Phase 2 | Complete |
| ARCH-02 | Phase 2 | Complete |
| AUDIT-01 | Phase 3 | Complete |
| G2B-01 | Phase 4 | Complete |
| G2B-02 | Phase 4 | Complete |
| G2B-03 | Phase 4 | Complete |
| G2B-04 | Phase 4 | Complete |
| UI-01 | Phase 5 | Complete |
| UI-02 | Phase 5 | Complete |
| UI-03 | Phase 5 | Complete |
| UI-04 | Phase 5 | Complete |
| AUTOPILOT-CHROME-01 | Phase 7 | Complete |

### Browser Autopilot & Client Automation (Phase 7)

- [x] **AUTOPILOT-CHROME-01**: Prioritize Google Chrome over Microsoft Edge in Playwright browser launch cascades across all portal automation tasks (GSTR-2B, GSTR-1, IMS, GSTIN Lookup).

**Coverage:**
- v1 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-22*
*Last updated: 2026-10-23 after Phase 7 registration*
