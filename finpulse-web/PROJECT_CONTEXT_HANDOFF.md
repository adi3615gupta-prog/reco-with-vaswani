# PROJECT_CONTEXT_HANDOFF.md — Conversation & Development History

> **Target Audience:** Claude Code / AI Assistant  
> **Source:** Antigravity / Gemini Chat Sessions  
> **Repository:** Vaswani Return Enterprise (`reco-with-vaswani-main`)  
> **Date:** November 2026

---

## 1. Executive Summary & Evolution History

This software has evolved through extensive engineering sessions from a simple GST 2B reconciliation tool into **Vaswani Return Enterprise / Audit with Vaswani** — an all-in-one local offline ERP, Tax, GST, and Audit workstation used by Chartered Accountants and Tax Professionals.

### Key Milestones Completed Across Chat Sessions:
- **Milestone v2.0 - v2.2:**
  - 8-pass waterfall reconciliation between Purchase Register (PR / Books) and GSTR-2B.
  - Vendor Party-Wise Consolidation with 4-pass debit note pairing.
  - Strict **Zero-Merge Architecture** for Excel exports (`removeAllMergesFromWorkbook`).
  - GSTR-3B Table 4 ITC computation and 12-month FY matrix.
  - Statutory Audit & Tax Audit Clause 44 sampling.
  - Bank CMA Appraisal (5-year MPBF loan forecasting with Tally XML import).
- **Milestone v2.3 - v2.4:**
  - Executive White Landing Page & UI redesign.
  - Security hardening (SSRF prevention, local file traversal defense, strict loopback bindings).
  - Suite 09: Excel to Tally XML Enterprise Suite (Sales, Purchase, Journal, Receipt, Payment, Contra vouchers).
- **Milestone v2.5 - v2.6:**
  - Bulletproof GSTR-2B Inward ITC Autopilot (1-login 12-month automated download loop via Playwright).
  - Single-session CAPTCHA handling, non-blocking resilience (`11/12 Synced` support).
  - Enterprise deep audit remediation & full-stack hardening.
- **Milestone v2.8:**
  - Suite 12: GST Notices & Orders Autonomous Suite (DRC-01, DRC-01A, DRC-07, ASMT-10 notice tracking, auto-reconciliation, legal reply generator).
- **Milestone v2.9 (Current Active Milestone):**
  - Phase 40: Architectural decoupling, inter-module isolation, and scoped Tally session management.
  - Phase 41: GSTR-2B Direct Inward Entry to TallyPrime & Database Audit Ledger (100% test pass, UI review completed).

---

## 2. Core Modules Breakdown & Where Things Live

| Suite # | Module Description | Key Source Files |
|---|---|---|
| **01** | **GST Reco Engine (2B vs Books)** | `src/lib/reconciliation.ts`, `src/workers/reconciliation.worker.ts`, `src/pages/Reconciliation.tsx` |
| **02** | **Party-Wise Report & Dispute Engine** | `src/lib/partyWise.ts`, `src/components/PartyWiseReport.tsx` |
| **03** | **Zero-Merge Excel Export Engine** | `src/lib/fileParser.ts`, `src/lib/gstr2bFullYearExport.ts` |
| **04** | **GST IMS & 2B Autopilot (12 Months)** | `gstr2b/autopilot.js`, `gstr2b/fullYearExcel.js`, `gstr2b_routes.js`, `src/components/Gstr2bMasterDownloader.tsx` |
| **05** | **GSTR-1 Downloader (Autopilot)** | `gstr1/autopilot.js`, `gstr1/fullYearExcel.js`, `gstr1_routes.js` |
| **06** | **GSTR-3B Working Sheet & FY Matrix** | `src/lib/gstr3bEngine.ts`, `src/components/Gstr3bWorkingSheet.tsx`, `returns_storage_routes.js` |
| **07** | **TDS Consolidator & TRACES Reco** | `src/lib/tdsEngine.ts`, `src/pages/TdsReconciliation.tsx`, `tds_routes.js` |
| **08** | **Tally Prime Direct XML Integration** | `src/lib/tallyApi.ts`, `src/pages/TallyDirectImport.tsx`, `src/pages/TallyLedgerImport.tsx` |
| **09** | **Income Tax Engine (Old vs New Regime)**| `src/lib/incomeTaxEngine.ts`, `src/pages/IncomeTaxDashboard.tsx`, `tax_routes.js` |
| **10** | **Bank CMA Loan Appraisal (MPBF)** | `src/lib/cmaEngine.ts`, `src/pages/BankCmaAppraisal.tsx`, `src/pages/CmaReport.tsx` |
| **11** | **Statutory & Tax Audit Clause 44** | `src/lib/auditEngine.ts`, `src/pages/AuditModule.tsx`, `src/pages/TaxAuditClause44.tsx` |
| **12** | **GST Notices & Orders Autonomous Suite** | `src/lib/noticeReconciliation.ts`, `src/lib/noticeReplyGenerator.ts`, `notices_routes.js` |
| **13** | **Monthly Audit Working Paper Suite** | `src/lib/monthlyAuditEngine.ts`, `src/lib/monthlyAuditExcel.ts`, `monthly_audit_routes.js` |
| **14** | **Suite 09: Tally XML Voucher Maker** | `src/lib/tallyXmlEngine.ts`, `src/pages/TallyXmlSuite.tsx` |

---

## 3. Critical Business Rules & "Gotchas" Discovered in Chats

1. **Excel Zero-Merge Rule:**
   - Tax auditors filter and sort tables in Excel. Any merged cell causes `To do this, all the merged cells need to be the same size` errors.
   - All Excel generators (`fileParser.ts`, `fullYearExcel.js`, `monthlyAuditExcel.ts`) must strictly call `removeAllMergesFromWorkbook(wb)` before writing.
2. **GST Portal Navigation (Access Denied Prevention):**
   - Never use direct URL redirection (`page.goto`) to `return.gst.gov.in`. The portal SSO gateway blocks it with "Access Denied".
   - Autopilot must click the authentic on-screen `<button>BACK</button>`.
3. **Data Preservation Golden Rule:**
   - If a download or network call fails, existing records in SQLite tables must never be wiped or overwritten.
4. **Tally Local Port 9000:**
   - TallyPrime communicates via native XML over `http://localhost:9000`. `server.js` proxies requests to prevent browser CORS issues.
5. **No External Telemetry:**
   - Tax data and financial numbers must remain completely local. No cloud telemetry or third-party tracking.

---

## 4. Installed Custom Skills & Agent Tooling

The workspace contains specialized agent skills installed under `.agents/skills/`. Claude Code can read their respective `SKILL.md` whenever triggered:

1. **`ponytail`** (`.agents/skills/ponytail/SKILL.md`): Senior dev minimal-diff mindset. Activated by saying "ponytail", "yagni", or "simplest solution". Produces smallest clean changes without over-engineering.
2. **`ui-ux-pro-max`** (`.agents/skills/ui-ux-pro-max/SKILL.md`): Comprehensive UI/UX intelligence system with 50 active styles, 192 product palettes, 74 font pairings, 119 UX guidelines, and 25 chart types.
3. **`ui-styling`** (`.agents/skills/ui-styling/SKILL.md`): Production shadcn/ui, Radix UI, and Tailwind CSS design patterns and accessible component specifications.
4. **`cinematic-film`** (`.agents/skills/cinematic-film/SKILL.md`): Code-driven documentary & explainer video production (Python Skia / Remotion), continuous-camera glides over evidence boards with word-timed narration.
5. **`design` & `design-system`** (`.agents/skills/design/SKILL.md`, `design-system/SKILL.md`): 3-tier design tokens, brand identity systems, 55 logo styles, CIP packages.
6. **`slides` & `banner-design`** (`.agents/skills/slides/SKILL.md`, `banner-design/SKILL.md`): Chart.js presentation decks and multi-platform promotional banners.
7. **`brand`** (`.agents/skills/brand/SKILL.md`): Messaging frameworks, voice & tone compliance, and brand consistency rules.
8. **`stitch`** (`.agents/skills/stitch/SKILL.md`): Design system sync and screen generation with Google Stitch.

---

## 5. Current State & Pending Roadmap

- **Active Milestone:** Milestone v2.9
- **Last Completed Phase:** Phase 41 (GSTR-2B Direct Inward Entry to TallyPrime & Database Audit Ledger).
- **Verification Status:** 100% tests green (Vitest), 0 TypeScript errors, clean Vite build.
- **Reference Docs:**
  - Full granular architecture manual: `.agents/AGENTS.md`
  - Project state & roadmap: `.planning/STATE.md`, `.planning/PROJECT.md`

