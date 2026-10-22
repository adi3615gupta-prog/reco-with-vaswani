# Phase 2: Spreadsheet Export Modularity & Memory Optimization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-22
**Phase:** 02-spreadsheet-export-modularity-memory-optimization
**Areas discussed:** Module Decomposition Architecture, Web Worker Offloading, 50,000+ Row Memory Strategy, Zero-Merge Enforcement Pipeline

---

## Module Decomposition Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Domain sub-directories with backward-compatible barrel | Split into `src/lib/excel/parsers/`, `src/lib/excel/builders/`, and `src/lib/excel/styles/` while keeping `src/lib/fileParser.ts` as a re-export barrel so 14 existing components never break. | ✓ |
| Flat directory split with barrel | Place all extracted files directly in `src/lib/excel/` (e.g. `parsers.ts`, `executiveSummary.ts`, `partyWiseExport.ts`) with `src/lib/fileParser.ts` as a re-export barrel. | |
| Aggressive migration | Split into `src/lib/excel/` and immediately update all 14 importing components to use direct paths, deprecating `fileParser.ts` entirely. | |

**User's choice:** Domain sub-directories with backward-compatible barrel.
**Notes:** Prevents regressions in 14 consumer components while cleanly isolating ~300-600 line files.

---

## Web Worker Offloading for Large Exports

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated excelExport.worker.ts | Offload SheetJS tree creation and binary XLSX compilation to a dedicated export worker, dispatching real-time progress callbacks and returning an ArrayBuffer/Blob for instant background download. | ✓ |
| Extend fileParser.worker.ts | Add export actions to the existing parser worker so all Excel worker tasks stay in a single file. | |
| Main-thread chunking with setTimeout | Keep generation on the main thread but slice row generation in chunks with setTimeout(0) to prevent browser lockup. | |

**User's choice:** Dedicated `excelExport.worker.ts`.
**Notes:** Prevents browser freeze and "Page Unresponsive" popups when exporting large datasets.

---

## 50,000+ Row Memory Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| SheetJS Dense Mode (dense: true) + Worker Memory Management | Enable SheetJS dense mode (storing sheets as compact 2D arrays ws['!data'][r][c] instead of millions of cell objects) in `excelExport.worker.ts`, combined with chunked garbage-collection-friendly generation to keep peak browser heap < 180MB. | ✓ |
| Hybrid Client/Backend | Use SheetJS in-worker for datasets up to 25k rows, and automatically redirect 25k+ row full-year consolidations to backend Node.js streaming endpoints (`/api/gstr2b/export-full-year`). | |
| Pure Backend Streaming | Move all multi-tab Excel creation exclusively to the Express Node.js backend using streams and exceljs/xlsx, having frontend only trigger downloads. | |

**User's choice:** SheetJS Dense Mode (`dense: true`) + Worker Memory Management.
**Notes:** Reduces memory by 60–75% without requiring round-trips to the server for local reconciliation data.

---

## Zero-Merge Enforcement Pipeline

| Option | Description | Selected |
|--------|-------------|----------|
| Central Workbook Assembler Pipeline | Create a unified `buildCorporateWorkbook()` wrapper in `src/lib/excel/styles/zeroMergeGuard.ts` that automatically applies unmerged corporate headers, standardizes tab colors/widths, and strips all !merges as a mandatory post-build hook before serialization. | ✓ |
| Builder-Level Guardrail | Have each individual sheet builder function invoke a local zero-merge sanitizer on its own worksheet before returning. | |
| Test-Only Enforcement | Keep the existing `removeAllMergesFromWorkbook` utility and rely solely on Vitest unit test suites to assert !merges is undefined across all sheets. | |

**User's choice:** Central Workbook Assembler Pipeline (`buildCorporateWorkbook()`).
**Notes:** Hardens the system against regressions so developer error can never leak merged cells into output workbooks.

---

## Antigravity's Discretion

- Progress toast UI component formatting.
- Minor cell formatting helper organization under `src/lib/excel/styles/formatters.ts`.
- Memory benchmark test harness structure in `src/test/excelMemoryBenchmark.test.ts`.

## Deferred Ideas

- None — discussion stayed strictly within the boundary of Phase 2.
