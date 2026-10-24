---
phase: "12"
slug: "gst-notices-orders-autonomous-suite-autopilot-downloader-tra"
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-10-24"
---

# Phase 12 — Validation Strategy: GST Notices & Orders Autonomous Suite

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npx vitest run tests/notices/` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/notices/`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | NOTICES-02 | T-12-01 | SQL injection prevention via parameterized queries | unit | `npx vitest run tests/notices/schema.test.ts` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | NOTICES-03 | T-12-02 | Accurate 7d and 30d limitation date calculations | unit | `npx vitest run tests/notices/limitation.test.ts` | ❌ W0 | ⬜ pending |
| 12-02-01 | 02 | 2 | NOTICES-01 | T-12-03 | Safe DOM back-navigation without session loss | unit | `npx vitest run tests/notices/scraper.test.ts` | ❌ W0 | ⬜ pending |
| 12-03-01 | 03 | 3 | NOTICES-04 | T-12-04 | Mathematical variance decomposition without double-counting | unit | `npx vitest run tests/notices/crossReconciler.test.ts` | ❌ W0 | ⬜ pending |
| 12-03-02 | 03 | 3 | NOTICES-04 | T-12-05 | Strict zero-merge architecture (`ws['!merges'] = []`) | unit | `npx vitest run tests/notices/zeroMergeExport.test.ts` | ❌ W0 | ⬜ pending |
| 12-04-01 | 04 | 4 | NOTICES-05 | T-12-06 | XSS sanitation in rendered HTML legal drafts | unit | `npx vitest run tests/notices/replyGenerator.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/notices/schema.test.ts` — stubs for NOTICES-02 (SQLite DDL & cascades)
- [ ] `tests/notices/limitation.test.ts` — stubs for NOTICES-03 (deadline calculations)
- [ ] `tests/notices/crossReconciler.test.ts` — stubs for NOTICES-04 (multi-return discrepancy engine)
- [ ] `tests/notices/zeroMergeExport.test.ts` — stubs for NOTICES-04 (Zero-Merge Excel assertion)
- [ ] `tests/notices/replyGenerator.test.ts` — stubs for NOTICES-05 (ASMT-11, DRC-06 legal draft generation)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real GST Portal Live Login & CAPTCHA resolution | NOTICES-01 | Requires human optical CAPTCHA input on live portal | Trigger Autopilot in UI with live test GSTIN, enter CAPTCHA in browser, observe automatic navigation to `/viewnotices` and `/additionalnotices`. |
| Visual UI Shell Integration & Drawer Animations | NOTICES-03 | Visual layout and Tailwind transition checks | Open `/gst-notices` in browser, verify sidebar highlights compliance suite, test slide-over inspector drawer. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
