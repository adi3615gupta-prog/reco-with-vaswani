# Phase 1: Debit Note Advanced Waterfall & Batch Solver Integration - Research

**Researched:** 2026-10-22
**Domain:** GST Purchase Register (PR) vs GSTR-2B Credit/Debit Note Multi-Pass Waterfall Reconciliation & Batch Subset-Sum Engine
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Implement and harden the 6-pass waterfall, normalization helpers, and batch solver in the dedicated pure TypeScript module: `src/lib/debitNoteEngine.ts`.
- **D-02:** Import `debitNoteEngine.ts` inside `src/lib/partyWise.ts` and `src/workers/reconciliation.worker.ts` while keeping `partyWise.ts` focused on vendor party card aggregation and UI action handling.
- **D-03:** Run the 1-to-many subset-sum search off the main thread in `src/workers/reconciliation.worker.ts`.
- **D-04:** Use a bounded heuristic approach: candidates sorted by date proximity ($\pm 45$ days) and amount relevance, exhaustive search for small subsets ($2 \le |S| \le 6$), greedy sliding-window for larger batches ($7 \le |S| \le 15$), with a hard 500ms safety timeout per voucher to guarantee zero UI stutter.
- **D-05:** Add a dedicated `Debit Notes Reconciled` tab formatted to the 21-column schema within the master multi-tab workbook in `src/lib/fileParser.ts`.
- **D-06:** Provide a dedicated 1-click **"Export 21-Col Debit Notes"** standalone Excel download button in `src/components/PartyWiseReport.tsx`.
- **D-07:** Strictly enforce Zero Merged Cells (`ws['!merges'] = []`) on all debit note worksheets, preserving column sorting, AutoFilters, and lookup formulas.
- **D-08:** In `src/components/PartyWiseReport.tsx`, display 1-to-many batch results as sequential side-by-side rows matching the 21-column schema: Row 1 carries a visual badge `[Batch Lead: m notes]` with full PR amounts; Rows $2 \dots m$ display an indented indicator `↳ [Grouped Sub-Row]` with muted PR numbers (`₹0.00`).
- **D-09:** Apply a subtle left-border color accent across all rows of the same batch to visually link them without breaking table sortability.

### the agent's Discretion
- Exact Tailwind CSS color classes for the batch lead badge and sub-row border accents.
- Currency and remark formatting helpers in `src/lib/utils.ts`.

### Deferred Ideas (OUT OF SCOPE)
- Cloud-hosted database synchronization — strictly local filesystem execution.
- Direct GSTN portal filing without practitioner review.
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Normalization Pipeline (`parseAccountingFloat`, `normalizeInvoiceNo`) | Pure Library (`src/lib/debitNoteEngine.ts`) | Worker (`src/workers/reconciliation.worker.ts`) | Fast CPU operations portable to both worker and unit tests |
| 6-Pass Waterfall Matching | Pure Library (`src/lib/debitNoteEngine.ts`) | Worker (`src/workers/reconciliation.worker.ts`) | Multi-pass algorithm operating on clean in-memory collections |
| 1-to-Many Subset-Sum Solver ($2 \le |S| \le 15$) | Web Worker (`src/workers/reconciliation.worker.ts`) | Pure Library (`src/lib/debitNoteEngine.ts`) | Offloads combinatorial math from React main thread |
| Zero-Merge 21-Col Excel Export | Library (`src/lib/fileParser.ts`) | UI Component (`PartyWiseReport.tsx`) | XLSX streaming with zero merges (`ws['!merges'] = []`) |
| Batch Visual Badges & Group Rows | Presentation Layer (`src/components/PartyWiseReport.tsx`) | Badge Primitive (`StatusBadge.tsx`) | Interactive UI rendering of lead vs sub-rows |
</architectural_responsibility_map>

<research_summary>
## Summary

Investigation of the codebase reveals that `src/lib/debitNoteEngine.ts` (1,095 lines) already contains the initial scaffolding for `reconcileDebitNotes` and is imported by `src/lib/partyWise.ts`. However, key technical specification requirements and guardrails from `01-SPEC.md` must be hardened:
1. **Pass 1 Composite Invoice Guardrail**: When an exact invoice number matches a 2B note but the Books value is significantly larger (`Val_PR > Val_2B + 10.00`), check whether `Val_PR` matches consecutive 2B notes (e.g. `1466468745 + 1466468746`). If so, defer Pass 1 and route to Pass 3 Batch Solver.
2. **Pass 3 Combinatorial Solver Bounding**: Ensure the subset-sum algorithm enforces the bounded heuristic ($2 \le |S| \le 6$ exhaustive, $7 \le |S| \le 15$ greedy sliding window, $\pm 45$ days proximity, 500ms safety timeout) so large vendor datasets never exceed worker execution limits.
3. **21-Column Reconciled Register Export**: Implement dedicated export functions in `src/lib/fileParser.ts` adhering strictly to the 21-column layout and the Zero-Merge rule (`ws['!merges'] = []`).
4. **UI Integration**: Update `src/components/PartyWiseReport.tsx` to display `[Batch Lead: m notes]` badges and indented `↳ [Grouped Sub-Row]` indicators with subtle group border styling.

**Primary recommendation:** Divide Phase 1 execution into 3 atomic plans:
- **Plan 01-01**: Harden `src/lib/debitNoteEngine.ts` with composite guardrails, bounded subset-sum heuristics, and accounting float normalization, backed by comprehensive Vitest unit tests in `src/test/debitNoteEngine.test.ts`.
- **Plan 01-02**: Integrate `debitNoteEngine.ts` into `src/workers/reconciliation.worker.ts` and `src/lib/partyWise.ts`, verifying mathematical invariant preservation ($\sum \text{Reconciled} = \sum \text{Raw}$).
- **Plan 01-03**: Implement the 21-column Zero-Merge Excel export in `src/lib/fileParser.ts` and update `src/components/PartyWiseReport.tsx` with visual batch lead/sub-row indicators and export actions.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `xlsx` & `xlsx-js-style` | 0.18.5 / 1.2.0 | Excel workbook generation | Zero-merge spreadsheet styling across office workstations |
| `vitest` | 1.x / 2.x | Unit and invariant testing | Fast in-memory execution verifying mathematical sum parity |
| `date-fns` | 3.6.0 | Date parsing & proximity math | Handles Indian date formats (`DD/MM/YYYY`) and day difference calculations |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | 0.462.0 | Iconography | Visual icons for batch leads, download buttons, and status badges |
| `tailwindcss` | 3.4.17 | Styling | Subtle left-border group accents and badge coloring |

### Don't Hand-Roll
- **Do not hand-roll Excel cell mergers**: Merged cells are strictly forbidden (`ws['!merges'] = []`).
- **Do not hand-roll date arithmetic**: Use `date-fns` `differenceInDays` or normalized timestamps for date proximity.
- **Do not run unconstrained $2^n$ power set searches**: Unbounded subset-sum on $n=50$ candidates takes $10^{15}$ operations. Strictly bound candidate pools to $\le 15$ items with 500ms timeouts.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Lead Row + Grouped Sub-Rows Pattern (Zero Double-Counting)
When 1 Books entry matches $m$ GSTR-2B notes ($m \ge 2$):
```text
Row 1 (Lead Row):
  PR: [Invoice Value = -20,24,678.22, Taxable = -17,15,829.00, CGST = -1,54,424.61, SGST = -1,54,424.61]
  2B: [Inv No = 7705153273, Value = -1,84,061.65, Taxable = -1,55,984.45, ...]
  Status: Reconciled (Consolidated Batch)
  Remark: "Consolidated Batch 1-to-11 Match: Books DN matches 11 GSTR-2B Credit Notes"

Rows 2 to 11 (Grouped Sub-Rows):
  PR: [Invoice No = "DN (Grouped)", Invoice Value = 0.00, Taxable = 0.00, CGST = 0.00, SGST = 0.00, IGST = 0.00]
  2B: [Inv No = 7705153274 ... 7705153283, Value = ..., Taxable = ...]
  Status: Reconciled (Consolidated Batch)
  Remark: "Batch Sub-Row 2 of 11 (Voucher Ref ...)"
```
This guarantees:
$$\sum \text{Reconciled Column}_k = \sum \text{Input Column}_k \quad \forall k \in \{10 \dots 20\}$$

### Composite Invoice Number Guardrail Flow
```text
Pass 1 Candidate Evaluation:
  Is Invoice No PR == Invoice No 2B?
    YES:
      Is abs(Val_PR) > abs(Val_2B) + 10.00?
        YES:
          Check if Val_PR matches sum of (2B_candidate + adjacent 2B_consecutive_notes) within ₹10.00:
            MATCHES:
              -> SKIP Pass 1 for this row
              -> Route to Pass 3 (Consolidated Batch Solver)
            DOES NOT MATCH:
              -> Classify as Partially Matched (Value Diff)
        NO:
          -> Pair 1-to-1 (Exact Match, Rounding Diff, or Nil Rated)
```
</architecture_patterns>

<common_pitfalls>
## Common Pitfalls

1. **Floating Point Arithmetic Drift**: JavaScript IEEE 754 precision issues (e.g. `0.1 + 0.2 !== 0.3`). Always use `Math.round((num + Number.EPSILON) * 100) / 100` before comparing values or calculating `netTaxDiff`.
2. **Accidental Cell Merges in Excel Exports**: Adding merged headers breaks column AutoFilter and `XLOOKUP`. Always call `removeAllMergesFromWorkbook(wb)` before writing workbook.
3. **Corrupted GSTIN Dates**: Certain accounting exports place document dates (`01/07/2017`) into the GSTIN column. Validate GSTIN against the 15-character regex `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$` before using it as a party key; fallback to normalized supplier name if invalid.
4. **Parenthesized Accounting Negative Floats**: Strings like `(45,04,490.90)` must be converted to negative floats `-4504490.90`.
</common_pitfalls>

<code_examples>
## Code Examples

### Normalizing Accounting Numbers
```typescript
export function parseAccountingFloat(val: any): number {
  if (val === null || val === undefined) return 0.0;
  if (typeof val === 'number') return isNaN(val) ? 0.0 : val;
  const s = String(val).trim().replace(/,/g, '');
  if (s === '' || s === '-' || s === '--' || s === 'N/A' || s === 'Nil') return 0.0;
  let isNeg = false;
  let clean = s;
  if (clean.startsWith('(') && clean.endsWith(')')) {
    isNeg = true;
    clean = clean.slice(1, -1).trim();
  } else if (clean.startsWith('-')) {
    isNeg = true;
    clean = clean.slice(1).trim();
  }
  const n = parseFloat(clean);
  if (isNaN(n)) return 0.0;
  return isNeg ? -n : n;
}
```

### Bounded Subset-Sum Heuristic ($2 \le |S| \le 15$)
```typescript
export function findSubsetSumMatch(
  targetVal: number,
  targetTax: number,
  candidates: CandidateItem[],
  valTol: number = 25.0,
  taxTol: number = 15.0,
  timeoutMs: number = 500
): CandidateItem[] | null {
  const startTime = Date.now();
  // Sort candidates by closeness to target and date distance
  const sorted = [...candidates].sort((a, b) => Math.abs(b.val) - Math.abs(a.val));
  const pool = sorted.slice(0, 15);

  // 1. Check exact date-clusters first
  const dateMap = new Map<string, CandidateItem[]>();
  for (const c of pool) {
    const list = dateMap.get(c.dateStr) || [];
    list.push(c);
    dateMap.set(c.dateStr, list);
  }
  for (const group of dateMap.values()) {
    if (group.length >= 2) {
      const sumVal = group.reduce((acc, x) => acc + x.val, 0);
      const sumTax = group.reduce((acc, x) => acc + x.tax, 0);
      if (Math.abs(sumVal - targetVal) <= valTol && Math.abs(sumTax - targetTax) <= taxTol) {
        return group;
      }
    }
  }

  // 2. Combinatorial search for small subsets k=2..6
  for (let k = 2; k <= Math.min(6, pool.length); k++) {
    if (Date.now() - startTime > timeoutMs) break;
    const match = searchCombinations(pool, k, targetVal, targetTax, valTol, taxTol, startTime, timeoutMs);
    if (match) return match;
  }

  return null;
}
```
</code_examples>

---
*Phase: 1-Debit Note Advanced Waterfall & Batch Solver Integration*
*Research completed: 2026-10-22*
