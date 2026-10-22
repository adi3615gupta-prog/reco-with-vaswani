---
phase: "02"
slug: "spreadsheet-export-modularity-memory-optimization"
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-10-22"
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x / TypeScript / Vite |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npx vitest run src/test/excelModularity.test.ts` |
| **Full suite command** | `npx vitest run src/test/debitNoteEngine.test.ts src/test/excelModularity.test.ts && npx tsc --noEmit` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/test/excelModularity.test.ts`
- **After every plan wave:** Run `npx vitest run && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite green + `npx vite build` clean
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | ARCH-01 | — | Clean separation of styles, formatters, and Zero-Merge invariant guard | unit | `npx vitest run src/test/excelModularity.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | ARCH-01 | — | Modularization of parsers and builders under `src/lib/excel/` | unit | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | ARCH-01 | — | Backward-compatible barrel `src/lib/fileParser.ts` re-exporting all 34 exports with zero breakages | unit / typecheck | `npx tsc --noEmit && npx vitest run` | ✅ | ⬜ pending |
| 02-02-01 | 02 | 2 | ARCH-02, CORE-02 | — | Dedicated `excelExport.worker.ts` with dense mode and progress events | unit / worker | `npx vitest run src/test/excelModularity.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 2 | ARCH-02, CORE-01 | — | 50,000-row memory benchmark verifying <180MB heap delta and zero merges | benchmark | `npx vitest run src/test/excelMemoryBenchmark.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/test/excelModularity.test.ts` — Tests asserting module exports, zero-merge guard, and barrel backward compatibility.
- [ ] `src/test/excelMemoryBenchmark.test.ts` — 50,000-row synthetic benchmark asserting peak memory and execution runtime.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser UI Progress Toast & File Download | CORE-02 | Verifies that clicking Export does not freeze browser tab and triggers download prompt | Open Reconciliation tab in browser, click "Export to Excel", observe progress toast and verify downloaded file opens without warning |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-22
