# Phase 1: Debit Note Advanced Waterfall & Batch Solver Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-22
**Phase:** 1-debit-note-advanced-waterfall-batch-solver-integration
**Areas discussed:** Engine Placement & Architecture, Batch Solver Performance & Execution Strategy, Export Suite Integration & 21-Column Layout, UI Row Presentation for Consolidated Batches

---

## Engine Placement & Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated Module: `src/lib/debitNoteEngine.ts` | Dedicated pure TypeScript engine module imported by worker and UI | ✓ |
| Inline Expansion in `src/lib/partyWise.ts` | Expand existing partyWise.ts directly | |
| Core Engine Merger in `src/lib/reconciliation.ts` | Merge into primary invoice waterfall matching pipeline | |

**User's choice:** Option 1 — Dedicated Module (`src/lib/debitNoteEngine.ts`)
**Notes:** Keeps partyWise.ts focused on UI card aggregation while isolating the 6-pass waterfall, pre-processing utilities, and batch solver in a testable pure library.

---

## Batch Solver Performance & Execution Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Bounded Heuristic Subset-Sum in Web Worker | Sort by date proximity, exhaustive for small batches, greedy for large batches, 500ms safety timeout | ✓ |
| Full Combinatorial Search ($2 \le |S| \le 15$) | Mathematical combinations yielded in chunks to Web Worker event loop | |
| Date-Cluster Matching Only | Group notes by exact date and prefix only, skipping split subset-sum | |

**User's choice:** Option 1 — Bounded Heuristic Subset-Sum in Web Worker
**Notes:** Guarantees zero UI lag on large vendor ledgers by bounding combinations and applying a 500ms per-voucher cutoff.

---

## Export Suite Integration & 21-Column Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Both: Tab in Master Workbook + Standalone Export | Dedicated tab in master workbook plus 1-click standalone 21-col export button | ✓ |
| Standalone 21-Column File Only | Keep master workbook unchanged, only provide separate button | |
| Master Workbook Tab Only | Add tab inside master multi-sheet export only | |

**User's choice:** Option 1 — Both: Tab in Master Workbook + Standalone Export
**Notes:** Accountants can review the 21-column sheet within the complete audit file or export a standalone file directly for vendor dispute submissions. Strict Zero-Merge rule (`ws['!merges'] = []`) applies to both.

---

## UI Row Presentation for Consolidated Batches

| Option | Description | Selected |
|--------|-------------|----------|
| Side-by-Side Rows with Visual Badges & Group Accent | Display sequential rows matching Excel 21-col layout with `[Batch Lead]` and `↳ [Grouped Sub-Row]` badges | ✓ |
| Collapsible Accordion Groups | Collapse sub-rows behind an expand/collapse toggle on the lead row | |
| Plain Flat Rows (No Group Accents) | Standard table rows without badges | |

**User's choice:** Option 1 — Side-by-Side Rows with Visual Badges & Group Accent
**Notes:** Preserves instant 1-to-1 visual correspondence with the 21-column Excel layout while clearly distinguishing the Lead Row from the zeroed sub-rows.

---

## the agent's Discretion

- Tailwind CSS color shades for badges and border highlights.
- Formatting helpers for currency and audit remarks.

## Deferred Ideas

None.
