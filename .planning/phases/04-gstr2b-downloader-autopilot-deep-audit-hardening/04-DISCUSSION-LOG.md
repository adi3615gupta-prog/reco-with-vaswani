# Phase 4: GSTR-2B Downloader (Autopilot) Deep Audit & Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-22
**Phase:** 04-gstr2b-downloader-autopilot-deep-audit-hardening
**Areas discussed:** 12-Month Loop Resilience, Zero-Data-Loss Safety, 8-Sheet Zero-Merge Excel, Automated Scrutiny Tests

---

## 1. 12-Month Loop Resilience & Failed Month Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Skip with warning & continue | Skip failed month with a warning, preserve old data, and continue remaining months (e.g. 11/12 Synced) | ✓ |
| Abort immediately | Abort the entire 12-month loop immediately if any month fails | |

**User's choice:** Skip failed month with a warning, preserve old data, and continue remaining months.
**Notes:** Taxpayers should not lose their entire 12-month session if one single month suffers a portal delay or temporary glitch.

---

## 2. Nil Month (0 Invoices) vs Failed Download

| Option | Description | Selected |
|--------|-------------|----------|
| Verified 0 records -> NIL_SYNCED | Portal par '0 records' verify hone par hi batch ko 'NIL_SYNCED' (0 invoices) mark kare; agar download timeout/fail ho toh purana data preserve rakhe | ✓ |
| Always prompt | Agar 0 invoices milein toh hamesha purana data delete na kare aur prompt dikhaye | |

**User's choice:** Portal par '0 records' verify hone par hi batch ko 'NIL_SYNCED' (0 invoices) mark kare; agar download timeout/fail ho toh purana data preserve rakhe.
**Notes:** Strictly prevents accidental data loss while correctly handling legitimate Nil filers.

---

## 3. Scope of Phase 4

| Option | Description | Selected |
|--------|-------------|----------|
| All 4 Focus Areas | All 4 Focus Areas: Loop Resilience, Zero-Data-Loss Safety, 8-Sheet Zero-Merge Excel, & Vitest Scrutiny Tests | ✓ |
| Partial focus | Subset of areas | |

**User's choice:** All 4 Focus Areas.

---

## 4. Post-BACK Returns Quick Links Navigation (Access Denied Prevention)

| Option | Description | Selected |
|--------|-------------|----------|
| Direct in-page tile click on 'Returns Dashboard' + Navbar fallback | Zero URL push. Download hone ke baad BACK click karne par portal 'Returns Quick Links' me jata hai; wahan screen par 'Returns Dashboard' tile par in-page click karo. Backup me Navbar (Services -> Returns -> Returns Dashboard) use karo. | ✓ |
| Hard URL push / `page.goto` | Push browser to `https://return.gst.gov.in/returns/auth/dashboard` | ✗ (Throws 'Access Denied') |

**User's choice:** Direct in-page tile click on 'Returns Dashboard' + Navbar fallback. URL push is completely disabled because GST portal SSO gateway rejects direct cross-subdomain GET with "Access Denied".
**Notes:** Real-world testing revealed that direct URL push causes Access Denied. Navigation must strictly be driven by authentic user-initiated in-page clicks.

---

## the agent's Discretion

- Fine-tuning timeout thresholds for portal download links (15s to 20s polling).
- Frontend badge color coding (`NIL_SYNCED` as neutral gray/blue badge vs `SYNCED` as emerald badge).

## Deferred Ideas

- None.
