---
phase: "03"
slug: "automated-scrutiny-tests-audit-trail-hardening"
status: complete
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-22"
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x / TypeScript / Vite / Node Express |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npx vitest run src/test/debitNoteScrutiny.test.ts src/test/auditTrail.test.ts` |
| **Full suite command** | `npx vitest run src/test/debitNoteEngine.test.ts src/test/debitNoteScrutiny.test.ts src/test/excelModularity.test.ts src/test/excelMemoryBenchmark.test.ts src/test/auditTrail.test.ts && npx tsc --noEmit` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command (`npx vitest run src/test/debitNoteScrutiny.test.ts` or `src/test/auditTrail.test.ts`)
- **After every plan wave:** Run full suite command + `npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite green + `npx vite build` clean
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | DN-01, DN-02, DN-03 | — | Bounded subset-sum solver combinations ($k \in [2, 15]$ with decoys) & tolerance boundary thresholds | unit / scrutiny | `npx vitest run src/test/debitNoteScrutiny.test.ts` | ✅ | ✅ green |
| 03-01-02 | 01 | 1 | DN-04, DN-05, CORE-01 | — | Multi-prefix stripping, generic voucher guardrails & 50+ batch zero double-counting accounting invariant | unit / invariant | `npx vitest run src/test/debitNoteScrutiny.test.ts && npx tsc --noEmit` | ✅ | ✅ green |
| 03-02-01 | 02 | 2 | AUDIT-01 | — | SQLite table `reconciliation_audit_log` schema & Express routes in `audit_trail_routes.js` | backend / syntax | `node -e "import('./audit_trail_routes.js').then(() => console.log('Syntax OK'))"` | ✅ | ✅ green |
| 03-02-02 | 02 | 2 | AUDIT-01 | — | Client offline sync service (`auditTrailService.ts`) & justification modal (`AuditJustificationModal.tsx`) | unit / typecheck | `npx tsc --noEmit` | ✅ | ✅ green |
| 03-02-03 | 02 | 2 | AUDIT-01, CORE-01 | — | Zero-Merge Excel audit sheet integration (`masterExport.ts`, `partyWiseExport.ts`) and audit trail test suite | integration | `npx vitest run src/test/auditTrail.test.ts && npx tsc --noEmit` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/test/debitNoteScrutiny.test.ts` — Comprehensive scrutiny test suite covering combinatorial subset-sum edge cases, tolerance boundaries, prefix cleaning, generic token permutations, and 50+ batch zero double-counting invariant.
- [x] `src/test/auditTrail.test.ts` — Integration test suite verifying SQLite audit validation rules, offline queue persistence, and Zero-Merge Excel audit worksheet generation.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Practitioner Override UX & Justification Modal | AUDIT-01 | Verifies accessible Radix UI dialog interaction, preset pill selection, and character counter responsiveness | In Party-Wise Report or Results Table, trigger "Force Match" on a mismatched invoice; verify modal opens, before/after diffs display accurately, confirm button is disabled until >= 5 characters entered, and success toast displays upon confirmation |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-22
