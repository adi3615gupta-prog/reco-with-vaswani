# Phase 2: Spreadsheet Export Modularity & Memory Optimization - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 focuses on refactoring the monolithic `src/lib/fileParser.ts` (>5,800 lines) into maintainable, single-responsibility sub-modules under `src/lib/excel/`, establishing an off-thread Web Worker architecture for multi-tab workbook generation, and optimizing memory consumption for 50,000+ row full-year exports using SheetJS Dense Mode while strictly preserving the Zero-Merge architecture (`ws['!merges'] = []`) and 100% backward compatibility for all existing consumer components.

</domain>

<decisions>
## Implementation Decisions

### Module Decomposition & Directory Structure
- **D-01:** Decompose `src/lib/fileParser.ts` into isolated domain sub-directories under `src/lib/excel/`:
  - `src/lib/excel/parsers/`: Inbound file ingestion, column mapping, GSTR-1, and 2B parsers (`parseFile.ts`, `gstr1Parser.ts`, `columnMapper.ts`).
  - `src/lib/excel/builders/`: Worksheet builders (`executiveSummary.ts`, `partyWiseExport.ts`, `monthlyComparisonExport.ts`, `monthlyDiffExport.ts`, `debitNotes21Col.ts`, `allInvoicesSheet.ts`, `timingRecoSheet.ts`).
  - `src/lib/excel/styles/`: Corporate styling, unmerged headers, cell formatters, and invariant guards (`corporateHeader.ts`, `zeroMergeGuard.ts`, `formatters.ts`).
  - `src/lib/excel/index.ts`: Central export facade.
  — **Reversibility:** costly — 14 consumer components import from `fileParser.ts`; clean domain sub-directories establish long-term architectural boundaries.
- **D-02:** Retain `src/lib/fileParser.ts` as a 100% backward-compatible re-export barrel. All 34 exported functions, types, and constants remain available from `@/lib/fileParser` so existing pages and components function without breaking changes.
  — **Reversibility:** reversible — Call sites can gradually migrate to `@/lib/excel` over time.

### Web Worker Offloading for Large Exports
- **D-03:** Create a dedicated Web Worker `src/workers/excelExport.worker.ts` for workbook generation and binary XLSX compilation.
  - Offloads SheetJS cell generation, column auto-sizing, and `XLSX.write()` binary packing off the main UI thread.
  - Emits real-time progress events (`{ type: 'PROGRESS', stage: string, currentSheet: number, totalSheets: number, percent: number }`).
  - Returns an `ArrayBuffer` or `Blob` URL for zero-friction background download via browser anchor download trigger.
  — **Reversibility:** reversible — Worker communicates via standard async postMessage interface wrapped by a helper service.
- **D-04:** Provide an asynchronous helper wrapper `exportWorkbookAsync()` in `src/lib/excel/asyncExportService.ts` that manages worker lifecycle, displays progress notifications/toasts, and falls back to synchronous export if Web Workers are unavailable in headless test environments.
  — **Reversibility:** reversible.

### 50,000+ Row Memory Strategy (Dense Mode)
- **D-05:** Enable SheetJS Dense Mode (`dense: true` in `XLSX.utils.book_new` and `XLSX.utils.aoa_to_sheet`) inside `excelExport.worker.ts`.
  - In Dense Mode, SheetJS represents worksheets as compact 2D arrays (`ws['!data'][r][c]`) instead of millions of distinct cell dictionary keys (`ws['A1']`, `ws['B1']`).
  - Reduces heap memory consumption by 60–75% for 50,000+ row 12-month consolidated workbooks, preventing V8 OOM crashes.
  - Implement chunked row batching (5,000 rows per slice) during matrix population to ensure smooth garbage collection cycles.
  — **Reversibility:** costly — Builders must construct rows using Array-of-Arrays (AOA) or dense cell matrices rather than assigning individual coordinate keys.

### Zero-Merge Enforcement Pipeline
- **D-06:** Implement a unified `buildCorporateWorkbook()` assembler pipeline in `src/lib/excel/styles/zeroMergeGuard.ts`.
  - Automatically prepends standard unmerged 2-row corporate headers (Title in A1, Subtitle in A2, navigation tabs starting at Column H).
  - Acts as a mandatory post-build verification hook: systematically executes `removeAllMergesFromWorkbook(wb)` and sanitizes `ws['!merges'] = []` across all sheets before serializing to binary XLSX.
  — **Reversibility:** reversible — Centralizes zero-merge enforcement so no individual sheet builder can ever introduce merged cells.

### Antigravity's Discretion
- Exact naming and organization of minor helper formatters (date, currency, GSTIN helpers) inside `src/lib/excel/styles/formatters.ts`.
- Selection of progress bar UI component or toast notification format for off-thread export feedback.
- Automated benchmark test harness in `src/test/excelMemoryBenchmark.test.ts` to simulate 50,000 row generation and verify memory/runtime bounds.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Standards & Architecture
- `.planning/REQUIREMENTS.md` — ARCH-01 (modularize fileParser.ts), ARCH-02 (stream/optimize large exports), CORE-01 (strict zero-merge architecture).
- `.agents/AGENTS.md` §3 — Master architecture reference for Excel Export Suite (Zero-Merge Architecture).
- `.planning/codebase/CONCERNS.md` §Monolithic Parser Module — Known pain points and extraction guidance for `fileParser.ts`.
- `src/lib/fileParser.ts` — Existing monolithic file to be modularized.
- `src/workers/fileParser.worker.ts` — Existing parser worker reference.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `removeAllMergesFromWorkbook(wb)`: [fileParser.ts:855-865](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/fileParser.ts#L855-L865) — Invariant cleaner to be extracted to `src/lib/excel/styles/zeroMergeGuard.ts`.
- `addCorporateHeader(...)`: [fileParser.ts:867-920](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/fileParser.ts#L867-L920) — Corporate header builder to be extracted to `src/lib/excel/styles/corporateHeader.ts`.
- `buildDebitNotes21ColSheet(...)`: [fileParser.ts:4610-4760](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/fileParser.ts#L4610-L4760) — 21-col debit note sheet builder to be extracted to `src/lib/excel/builders/debitNotes21Col.ts`.

### Established Patterns
- SheetJS (`xlsx`) is used for workbook operations across the client and worker layers.
- Strict Zero-Merge Architecture: Worksheets must never have `<mergeCell>` records (`ws['!merges'] = []`).
- Offline / Local execution: Large computations run off the main thread in Web Workers without uploading taxpayer data to third-party cloud services.

### Integration Points
- 14 consumer components importing `src/lib/fileParser.ts` (e.g. `PartyWiseReport.tsx`, `MonthlyBreakdown.tsx`, `ResultsCategoryTabs.tsx`, `Index.tsx`).
- `src/workers/reconciliation.worker.ts` and `src/workers/fileParser.worker.ts`.

</code_context>

<specifics>
## Specific Ideas
- Users must never see "Page Unresponsive" dialogs when clicking "Export to Excel" on massive datasets.
- The UI should display an unobtrusive progress indicator (e.g. "Generating Excel: Sheet 4 of 12 (35%)") during off-thread compilation.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed strictly within the boundary of Phase 2 (Spreadsheet Export Modularity & Memory Optimization).

</deferred>

---

*Phase: 02-Spreadsheet Export Modularity & Memory Optimization*
*Context gathered: 2026-10-22*
