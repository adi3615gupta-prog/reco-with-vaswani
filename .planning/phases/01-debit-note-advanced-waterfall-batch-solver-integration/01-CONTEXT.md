# Phase 1: Debit Note Advanced Waterfall & Batch Solver Integration - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Integrating the 6-pass debit note reconciliation algorithm, 1-to-many subset-sum batch solver ($2 \le |S| \le 15$), composite invoice number guardrails, pre-processing numeric/prefix sanitizers, and 21-column reconciled register schema into the application (`src/lib/debitNoteEngine.ts`, `src/lib/partyWise.ts`, `src/workers/reconciliation.worker.ts`, `src/components/PartyWiseReport.tsx`, and `src/lib/fileParser.ts`).
</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**5 requirements are locked.** See `01-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `01-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- 6-Pass Waterfall Reconciliation Pipeline (Pass 1 Exact to Pass 6 Unmatched Books)
- 1-to-Many Consolidated Batch Solver (Tier 3A Date-Cluster and Tier 3B Bounded Subset-Sum Solver $2 \le |S| \le 15$)
- Composite Invoice Number Guardrail (detecting 1 Books Invoice matching 2 consecutive 2B notes)
- Pre-processing pipeline for accounting floats (parenthesized negative numbers, comma stripping, FY prefix removal)
- Standardized 21-Column Reconciled Register schema with Zero Double-Counting invariant ($\sum \text{Reconciled} = \sum \text{Raw}$)

**Out of scope (from SPEC.md):**
- Filing tax returns directly to the GSTN portal
- Modifying standard B2B invoice matching passes outside debit/credit note transactions
</spec_lock>

<decisions>
## Implementation Decisions

### Engine Placement & Architecture
- **D-01:** Implement the 6-pass waterfall, normalization helpers, and batch solver in a new dedicated pure TypeScript module: `src/lib/debitNoteEngine.ts`. — **Reversibility:** costly — creates public domain API imported by worker and UI.
- **D-02:** Import `debitNoteEngine.ts` inside `src/lib/partyWise.ts` and `src/workers/reconciliation.worker.ts` while keeping `partyWise.ts` focused on vendor party card aggregation and UI action handling.

### Batch Solver Performance & Execution Strategy
- **D-03:** Run the 1-to-many subset-sum search off the main thread in `src/workers/reconciliation.worker.ts`.
- **D-04:** Use a bounded heuristic approach: candidates sorted by date proximity ($\pm 45$ days) and amount relevance, exhaustive search for small subsets ($2 \le |S| \le 6$), greedy sliding-window for larger batches ($7 \le |S| \le 15$), with a hard 500ms safety timeout per voucher to guarantee zero UI stutter.

### Export Suite Integration & 21-Column Layout
- **D-05:** Add a dedicated `Debit Notes Reconciled` tab formatted to the 21-column schema within the master multi-tab workbook in `src/lib/fileParser.ts`.
- **D-06:** Provide a dedicated 1-click **"Export 21-Col Debit Notes"** standalone Excel download button in `src/components/PartyWiseReport.tsx`.
- **D-07:** Strictly enforce Zero Merged Cells (`ws['!merges'] = []`) on all debit note worksheets, preserving column sorting, AutoFilters, and lookup formulas.

### UI Row Presentation
- **D-08:** In `src/components/PartyWiseReport.tsx`, display 1-to-many batch results as sequential side-by-side rows matching the 21-column schema: Row 1 carries a visual badge `[Batch Lead: m notes]` with full PR amounts; Rows $2 \dots m$ display an indented indicator `↳ [Grouped Sub-Row]` with muted PR numbers (`₹0.00`).
- **D-09:** Apply a subtle left-border color accent across all rows of the same batch to visually link them without breaking table sortability.

### the agent's Discretion
- Exact Tailwind CSS color classes for the batch lead badge and sub-row border accents.
- Selection of helper utilities in `src/lib/utils.ts` for currency formatting and status tooltips.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Reconciliation & Debit Note Specification
- `.planning/phases/01-debit-note-advanced-waterfall-batch-solver-integration/01-SPEC.md` — Authoritative specification defining the data models, 6 matching passes, subset-sum math, and 21-column schema.
- `gst_debit_note_reconciliation_engine_spec.md` — Root specification document.

### Codebase Architecture & Conventions
- `.planning/codebase/ARCHITECTURE.md` — System architecture, worker offloading, and component responsibilities.
- `.planning/codebase/STRUCTURE.md` — Code placement guidelines and module organization.
- `.planning/codebase/CONVENTIONS.md` — Code style, TypeScript interfaces, and error handling patterns.
- `.planning/codebase/CONCERNS.md` — Zero-Merge constraint and memory guidelines.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extractCoreInvoiceNumber` and `cleanInvoiceNumber` in `src/lib/reconciliation.ts`: Existing regex cleaners for invoice numbers.
- `normalizePartyName` in `src/lib/reconciliation.ts`: Reusable phonetic and legal-suffix stripper for supplier name fallbacks.
- `removeAllMergesFromWorkbook` in `src/lib/fileParser.ts`: Mandatory workbook sanitizer enforcing zero merged cells.
- `StatusBadge` in `src/components/StatusBadge.tsx`: Reusable badge component for match statuses.

### Established Patterns
- Multi-pass waterfall execution with `used_pr` and `used_2b` tracking sets.
- Web Worker asynchronous messaging with progress percentage reporting.
- Decimal rounding helpers using `Math.round((num + Number.EPSILON) * 100) / 100`.

### Integration Points
- `src/lib/debitNoteEngine.ts` (New): Core 6-pass engine & batch solver.
- `src/lib/partyWise.ts`: Replaces legacy debit note passes with `reconcileDebitNotes()` from `debitNoteEngine.ts`.
- `src/workers/reconciliation.worker.ts`: Offloads debit note batch execution.
- `src/components/PartyWiseReport.tsx`: Renders 21-column batch rows and export button.
- `src/lib/fileParser.ts`: Implements 21-column Zero-Merge worksheet export.
</code_context>

<specifics>
## Specific Ideas

- The user requested both export options: a dedicated tab inside the comprehensive master Excel workbook AND a standalone 1-click export button for quick audit submissions.
- For 1-to-many consolidated batches, visual badges should clearly indicate `[Batch Lead: m notes]` and `↳ [Grouped Sub-Row]` with zeroed PR values to preserve accounting total integrity.
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed strictly within the phase scope.
</deferred>

---

*Phase: 1-Debit Note Advanced Waterfall & Batch Solver Integration*
*Context gathered: 2026-10-22*
