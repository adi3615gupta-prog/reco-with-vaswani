# Roadmap: Vaswani Return Enterprise

## Overview

Vaswani Return Enterprise is evolving its reconciliation and compliance suite. Having established core modules for GST Inward reconciliation, 12-Month Autopilot, GSTR-3B working sheets, and Tally integration, the current milestone focuses on integrating the advanced 6-pass debit note reconciliation engine, consolidated 1-to-many batch solver, and 21-column schema from the newly ingested technical specification.

## Phases

- [x] **Phase 1: Debit Note Advanced Waterfall & Batch Solver Integration** - Implement the 6-pass waterfall, 1-to-many subset-sum solver, composite guardrail, and 21-column schema. (completed 2026-10-22)
- [x] **Phase 2: Spreadsheet Export Modularity & Memory Optimization** - Modularize `fileParser.ts` and optimize 12-month consolidated Excel generation. (completed 2026-10-22)
- [x] **Phase 3: Automated Scrutiny Tests & Audit Trail Hardening** - Add end-to-end unit tests for batch solvers and implement immutable force-match audit logging. (completed 2026-10-22)
- [x] **Phase 4: GSTR-2B Downloader (Autopilot) Deep Audit & Hardening** - Harden 1-login 12-month autonomous loop, zero data loss protection, 8-sheet consolidated Zero-Merge Excel generation, and comprehensive scrutiny tests. (completed 2026-10-22)
- [ ] **Phase 5: Enterprise UI/UX Aesthetic Overhaul & Unified Persistent App Shell** - Implement a persistent collapsible sidebar navigation, top command bar with status HUD & module switcher, centralized obsidian theme tokens, and high-density financial table standards across all modules.

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

**Plans**: 3/3 plans complete

Plans:
- [x] 01-01: Pre-processing pipeline, numeric parentheses parser, FY prefix stripper, and missing GSTIN supplier fallback
- [x] 01-02: 6-pass waterfall matching engine with composite guardrails and subset-sum 1-to-many solver
- [x] 01-03: 21-column UI table view, Zero-Merge Excel export, and invariant audit checks

### Phase 2: Spreadsheet Export Modularity & Memory Optimization

**Goal**: Refactor the monolithic `fileParser.ts` into maintainable sub-modules and streamline large 12-month consolidated workbook generation.
**Depends on**: Phase 1
**Requirements**: ARCH-01, ARCH-02
**Success Criteria** (what must be TRUE):
  1. `fileParser.ts` is divided into clean modular sub-packages under `src/lib/excel/`.
  2. 12-month 50,000+ row exports stream without exceeding browser memory limits.

**Plans**: 2/2 plans executed

Plans:
- [x] 02-01: Modularize `fileParser.ts` into isolated sheet builders
- [x] 02-02: Stream large dataset workbooks and benchmark memory footprint

### Phase 3: Automated Scrutiny Tests & Audit Trail Hardening

**Goal**: Build rigorous Vitest test suites for debit note edge cases and add persistent audit logging for manual force-matches.
**Depends on**: Phase 1
**Requirements**: AUDIT-01
**Success Criteria** (what must be TRUE):
  1. 100% test pass rate across all subset-sum batch combinations, tolerance thresholds, and prefix cleaning.
  2. Manual match and force-match actions persist practitioner timestamp and justification.

**Plans**: 2/2 plans complete

Plans:
- [x] 03-01: Comprehensive Vitest test suite for 6-pass debit note engine and batch solver
- [x] 03-02: Immutable audit trail logging for user override actions

### Phase 4: GSTR-2B Downloader (Autopilot) Deep Audit & Hardening

**Goal**: Deep audit and harden Tab 4 GSTR-2B Autopilot for production reliability: 12-month autonomous loop resilience, zero-data-loss protection, 8-sheet consolidated Zero-Merge Excel generation, and comprehensive scrutiny test coverage.
**Depends on**: Phase 1, Phase 2, Phase 3
**Requirements**: G2B-01, G2B-02, G2B-03, G2B-04, CORE-01, CORE-03
**Success Criteria** (what must be TRUE):
  1. 1-Login 12-Month Autopilot navigates all 12 periods gracefully, auto-recovering from portal dropdown timeouts and "Access Denied" screens without aborting the session.
  2. Golden Rule strictly enforced: existing GSTR-2B records are never deleted if a download attempt fails or encounters portal errors ("New data download nahi toh purana data remove nahi hoga").
  3. Consolidated 8-sheet 12-Month SectionWiseSummary Excel strictly enforces Zero-Merge architecture (`ws['!merges'] = []`) and provides side-by-side monthly & party-wise matrices.
  4. Comprehensive Vitest automated scrutiny tests validate GSTR-2B Excel/JSON parsing, batch metrics calculation, and zero-merge guarantees.

**Plans**: 2/2 plans complete

Plans:
- [x] 04-01: Autopilot 12M loop resilience, error recovery, and zero-data-loss protection
- [x] 04-02: Consolidated 8-sheet Zero-Merge Excel validation, UI sync hardening, and automated scrutiny tests

### Phase 5: Enterprise UI/UX Aesthetic Overhaul & Unified Persistent App Shell

**Goal**: Deliver a cohesive, premium, high-density financial workstation experience across all modules with a persistent collapsible sidebar, top command bar (active client, FY, status HUD, quick search), centralized obsidian glass styling, and high-density table aesthetics without modifying calculation logic or Excel exports.
**Depends on**: Phase 1, Phase 2, Phase 3, Phase 4
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. Persistent App Shell (collapsible sidebar + topbar) wraps all routes, enabling 1-click navigation between all modules without losing workspace state or relying on raw "back to hub" buttons.
  2. Centralized Obsidian Glass theme tokens in `src/index.css` elevate visual contrast, typography, and card aesthetics consistently across all modules.
  3. Live System Status HUD in the shell displays active database status, Tally connection state, and current client/FY context.
  4. High-density financial table styles (sticky headers, monospace tabular figures, compact padding, clear status chips) are standardized.

**Plans**: 0/2 plans complete

Plans:
- [ ] 05-01: Persistent App Shell component with collapsible sidebar, topbar HUD, and integrated routing in `Index.tsx`
- [ ] 05-02: Obsidian Glass theme tokens, high-density table styles, and module-wide visual elevation

---
*Roadmap defined: 2026-10-22*
*Last updated: 2026-10-22 after Phase 5 registration*
