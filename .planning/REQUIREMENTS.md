# Requirements: Vaswani Return Enterprise — v2.10 Public Website & Web Build

**Milestone:** v2.10 — Public Website & Web Build (`finpulse.co.in`)
**Defined:** 2026-11-26
**Core Value:** Audit-grade reconciliation and tax computation that runs locally and securely. The web build must keep this promise: no client data leaves the browser, and no server stores it.
**Previous requirements (v2.4–v2.9):** archived in [milestones/v2.4-v2.9-REQUIREMENTS.md](milestones/v2.4-v2.9-REQUIREMENTS.md)

---

## v1 Requirements (v2.10)

### Web Build Foundation

- [ ] **WEB-01**: A web build can be produced from the existing frontend, switched on by a build-time flag (for example `VITE_WEB_BUILD=true`).
- [ ] **WEB-02**: In the web build, every button or page that needs the local server, Tally, or Playwright shows "Desktop app mein available" instead of failing.
- [ ] **WEB-03**: In the web build, the login and license screens are skipped.
- [ ] **WEB-04**: Desktop build behaviour is unchanged: with the flag off, the app works exactly as it does today.

### Browser-Only Suites

- [ ] **WEB-05**: GST Reconciliation runs in the browser on uploaded files and exports the zero-merge Excel. Its "save run" step is hidden in the web build.
- [ ] **WEB-06**: TDS Reconciliation runs in the browser on uploaded files. Any step that needs the server (for example ledger mapping from `/api/tds/ledgers`) is hidden or replaced by a manual upload in the web build.
- [ ] **WEB-07**: Income Tax calculator (old vs new regime) runs in the browser. Form 26AS upload and AIS import, which call the server, are hidden in the web build.

### Website and Download

- [ ] **WEB-08**: Landing page at `finpulse.co.in` describes the product and the three web tools in plain business language.
- [ ] **WEB-09**: Download page links to the latest desktop `.exe` and explains what the desktop app adds (Tally, GST portal automation, saved data).

### Hosting

- [ ] **WEB-10**: Web build and download page are deployed to Cloudflare Pages on the free tier, with no card required.
- [ ] **WEB-11**: DNS for `finpulse.co.in` points to Cloudflare Pages.

### Compliance with Project Rules

- [ ] **WEB-12**: Every Excel export in the web build has zero merged cells (`ws['!merges'] = []`).
- [ ] **WEB-13**: The web build never deletes or overwrites data it does not own. It stores nothing on any server.
- [ ] **WEB-14**: Existing Vitest suite stays green, including `src/test/securityHardening.test.ts`, and the production build has zero TypeScript errors.

---

## v2 Requirements (deferred)

- **WEB-V2-01**: Cloud backend (Render + Turso) for online login and saved data.
- **WEB-V2-02**: Web version of Tally, GST portal automation, CMA generator, and Notices suite.
- **WEB-V2-03**: Windows Electron packaging & multi-office LAN deployment (earlier candidate).

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Turso / Render backend | Needs data-privacy review first (CLAUDE.md: zero external telemetry). Not in v2.10. |
| Client data sent to any cloud | Conflicts with the "runs completely locally" core value. |
| Tally, GST portal automation, Python CMA in web | These need a local machine, so they stay desktop-only. |
| Payment or subscription on the website | Not needed for the free tier launch. |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| WEB-01 | Phase 42 | Pending |
| WEB-02 | Phase 42 | Pending |
| WEB-03 | Phase 42 | Pending |
| WEB-04 | Phase 42 | Pending |
| WEB-05 | Phase 43 | Pending |
| WEB-06 | Phase 45 | Pending |
| WEB-07 | Phase 43 | Pending |
| WEB-08 | Phase 44 | Pending |
| WEB-09 | Phase 44 | Pending |
| WEB-10 | Phase 46 | Pending |
| WEB-11 | Phase 46 | Pending |
| WEB-12 | Phase 43 | Pending |
| WEB-13 | Phase 42 | Pending |
| WEB-14 | Phase 46 | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-11-26*
*Last updated: 2026-11-26 after v2.10 scoping*
