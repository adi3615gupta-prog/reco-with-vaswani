# Roadmap: Vaswani Return Enterprise

## Overview

Vaswani Return Enterprise is evolving its reconciliation and compliance suite. Having established core modules for GST Inward reconciliation, 12-Month Autopilot, GSTR-3B working sheets, and Tally integration, the current milestone focuses on integrating the advanced 6-pass debit note reconciliation engine, consolidated 1-to-many batch solver, and 21-column schema from the newly ingested technical specification.

## Phases

- [ ] **Phase 1: Debit Note Advanced Waterfall & Batch Solver Integration** - Implement the 6-pass waterfall, 1-to-many subset-sum solver, composite guardrail, and 21-column schema.
- [ ] **Phase 2: Spreadsheet Export Modularity & Memory Optimization** - Modularize `fileParser.ts` and optimize 12-month consolidated Excel generation.
- [ ] **Phase 3: Automated Scrutiny Tests & Audit Trail Hardening** - Add end-to-end unit tests for batch solvers and implement immutable force-match audit logging.

## Phase Details

### Phase 1: Debit Note Advanced Waterfall & Batch Solver Integration
**Goal**: Integrate the 6-pass debit note waterfall reconciliation engine, 1-to-many subset-sum batch solver, and 21-column schema into the existing application.
**Depends on**: Nothing (first phase)
**Requirements**: DN-01, DN-02, DN-03, DN-04, DN-05, CORE-01, CORE-02, CORE-03
**Success Criteria** (what must be TRUE):
  1. Generic "DN" and placeholder vouchers are accurately paired with 2B notes using value/tax/date matching.
  2. Single lump-sum PR debit notes matching 2 to 15 GSTR-2B credit notes are resolved via the subset-sum batch solver.
  3. The accounting invariant $\sum \text{Reconciled Rows} = \sum \text{Raw Input Rows}$ holds across all numeric columns without double-counting.
  4. Composite invoice numbers (where 1 PR invoice number represents 2 consecutive 2B notes) are guarded and routed to the batch solver.
  5. Exported 21-column reconciled register enforces zero merged cells (`ws['!merges'] = []`).
**Plans**: 3 plans

Plans:
- [ ] 01-01: Pre-processing pipeline, numeric parentheses parser, FY prefix stripper, and missing GSTIN supplier fallback
- [ ] 01-02: 6-pass waterfall matching engine with composite guardrails and subset-sum 1-to-many solver
- [ ] 01-03: 21-column UI table view, Zero-Merge Excel export, and invariant audit checks

### Phase 2: Spreadsheet Export Modularity & Memory Optimization
**Goal**: Refactor the monolithic `fileParser.ts` into maintainable sub-modules and streamline large 12-month consolidated workbook generation.
**Depends on**: Phase 1
**Requirements**: ARCH-01, ARCH-02
**Success Criteria** (what must be TRUE):
  1. `fileParser.ts` is divided into clean modular sub-packages under `src/lib/excel/`.
  2. 12-month 50,000+ row exports stream without exceeding browser memory limits.
**Plans**: 2 plans

Plans:
- [ ] 02-01: Modularize `fileParser.ts` into isolated sheet builders
- [ ] 02-02: Stream large dataset workbooks and benchmark memory footprint

### Phase 3: Automated Scrutiny Tests & Audit Trail Hardening
**Goal**: Build rigorous Vitest test suites for debit note edge cases and add persistent audit logging for manual force-matches.
**Depends on**: Phase 1
**Requirements**: AUDIT-01
**Success Criteria** (what must be TRUE):
  1. 100% test pass rate across all subset-sum batch combinations, tolerance thresholds, and prefix cleaning.
  2. Manual match and force-match actions persist practitioner timestamp and justification.
**Plans**: 2 plans

Plans:
- [ ] 03-01: Comprehensive Vitest test suite for 6-pass debit note engine and batch solver
- [ ] 03-02: Immutable audit trail logging for user override actions

---
*Roadmap defined: 2026-10-22*
*Last updated: 2026-10-22 after doc ingest*
