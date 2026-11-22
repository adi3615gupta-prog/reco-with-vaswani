# CLAUDE.md — Vaswani Return Enterprise Memory & Context

> **Project Identity:** Vaswani Return Enterprise / Audit with Vaswani  
> **Core Value:** High-precision, audit-grade GST & Tax reconciliation, statutory compliance, CMA financial appraisal, and native bidirectional TallyPrime XML automation running 100% locally with zero external telemetry.

---

## 1. Quick Start Commands

| Command | Action |
|---|---|
| `npm run dev` | Launch Vite frontend dev server (port 8080/5173) |
| `node server.js` | Launch Express API backend (handles DB, Tally proxy, Autopilot, SQLite) |
| `npm start` | Concurrently runs both `node server.js` and `vite --host` |
| `npm test` | Run Vitest unit & integration test suite (`vitest run`) |
| `npm run test:watch` | Run Vitest in interactive watch mode |
| `npm run build` | Production Vite build to `dist/` |
| `npm run build:dev` | Development mode build with sourcemaps |
| `npm run lint` | Run ESLint check across repo |
| `npm run electron:dev` | Launch Electron desktop application in dev mode |
| `npm run build:exe` | Obfuscate, build Vite, sign integrity, package Windows `.exe` |

---

## 2. Tech Stack & Architecture

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Shadcn UI / Radix UI, Lucide Icons, Canvas-Confetti, Recharts / Chart.js.
- **Backend / Services:** Node.js Express (`server.js`), SQLite3 (`sqlite3` / `better-sqlite3`), Web Workers for intensive calculations (`src/workers/`).
- **Automation / Scraping:** Playwright Chromium headless engine (`gstr2b/autopilot.js`, `gstr1/autopilot.js`, `notices/autopilot.js`, `ims/`).
- **External Integrations:**
  - **TallyPrime:** Native XML HTTP Interface via local loopback port `9000` (`http://localhost:9000`).
  - **GST Portal:** 1-login 12-month automated download loop (April to March) with CAPTCHA assistance and non-blocking resilience.
  - **TRACES / Income Tax:** Form 26AS, AIS/TIS parsing, IT computation engines.
- **Desktop Packaging:** Electron (`main.cjs`), electron-builder.
- **Data Persistence:** Local SQLite database tables (`clients`, `gstr2b_batches`, `gstr2b_invoices`, `gstr1_batches`, `ims_batches`, `monthly_audits`, `gst_notices`, `tally_ledgers`, `tally_vouchers`). Zero cloud telemetry.

---

## 3. Master Module Directory (14 Core Suites)

1. **GST Reco Engine (2B vs Books):** Multi-pass waterfall matching (Exact $\to$ Tolerance $\le$ ₹2 $\to$ Date Diff $\to$ Cleaned/Fuzzy $\to$ Core Serial $\to$ Rounding $\le$ ₹1 $\to$ PAN Cross-State $\to$ Unmatched). [`src/lib/reconciliation.ts`](src/lib/reconciliation.ts).
2. **Vendor Party-Wise Report & Dispute Hub:** Party-level netting, 4-pass debit note pairing, communication notices. [`src/lib/partyWise.ts`](src/lib/partyWise.ts), [`src/components/PartyWiseReport.tsx`](src/components/PartyWiseReport.tsx).
3. **Excel Export Suite:** Multi-tab audit-grade workbooks (`XLSX.writeFile`). **STRICT ZERO MERGE RULE**. [`src/lib/fileParser.ts`](src/lib/fileParser.ts).
4. **GST IMS & 2B Autopilot (12M Consolidator):** 1-login 12-month loop, 8-sheet consolidated SectionWiseSummary. [`gstr2b/autopilot.js`](gstr2b/autopilot.js), [`gstr2b/fullYearExcel.js`](gstr2b/fullYearExcel.js).
5. **GSTR-1 Downloader:** Autopilot & 12M Outward supplies consolidator. [`gstr1/autopilot.js`](gstr1/autopilot.js).
6. **GSTR-3B Working Sheet & 12M FY Matrix:** Table 4 ITC breakdown, auto-save, PDF & Excel export. [`src/lib/gstr3bEngine.ts`](src/lib/gstr3bEngine.ts).
7. **TDS Consolidator & TRACES Reconciliation:** Form 26AS/AIS vs Books TDS, section 194C/J/H mapping. [`src/lib/tdsEngine.ts`](src/lib/tdsEngine.ts).
8. **Tally Prime Direct XML Integration:** Real-time port 9000 bidirectional ledger & voucher import/export. [`src/lib/tallyApi.ts`](src/lib/tallyApi.ts).
9. **Income Tax Liability & Regime Engine:** Old vs New tax regime calculator with deductions & rebate. [`src/lib/incomeTaxEngine.ts`](src/lib/incomeTaxEngine.ts).
10. **Bank CMA Appraisal & Financial Statements:** 5-year MPBF loan appraisal, ratio analysis, Tally P&L import. [`src/lib/cmaEngine.ts`](src/lib/cmaEngine.ts).
11. **Statutory Audit & Tax Audit Clause 44:** Daybook sampling, GST registered vs unregistered vendor breakups. [`src/lib/auditEngine.ts`](src/lib/auditEngine.ts).
12. **GST Notices & Orders Autonomous Suite:** ASMT-10, DRC-01/01A, DRC-07 notice tracking, auto-reconciliation, legal reply generator. [`src/lib/noticeReconciliation.ts`](src/lib/noticeReconciliation.ts), [`src/pages/GstNoticesDashboard.tsx`](src/pages/GstNoticesDashboard.tsx).
13. **Suite 08 — Monthly Audit Working Paper Suite:** Audit checklists, observation log, client pending points tracker, Excel working papers. [`src/lib/monthlyAuditEngine.ts`](src/lib/monthlyAuditEngine.ts).
14. **Suite 09 — Tally Entries Maker (Excel to Tally XML):** Sales, Purchase, Receipt, Payment, Contra, Journal, GSTR-2B Direct Inward XML generator. [`src/lib/tallyXmlEngine.ts`](src/lib/tallyXmlEngine.ts).

---

## 4. Strict Non-Negotiable Architectural Rules

### Rule 1: Zero Merged Cells in All Excel Exports (`ws['!merges'] = []`)
- **NEVER MERGE CELLS IN ANY EXCEL EXPORT.**
- Merged cells break Excel filtering, sorting, column selection, and formulas (`VLOOKUP`, `XLOOKUP`).
- Always run `removeAllMergesFromWorkbook(wb)` prior to writing any XLSX file. Title, subtitles, and headers must occupy single cells (e.g. Col A) without spanning merges.

### Rule 2: Playwright GST Portal Navigation — Official On-Screen BACK Button Only
- In GST portal autopilot routines, **NEVER use `page.goto()` or push URLs directly to `return.gst.gov.in`**. GST Portal's SSO gateway intercepts direct navigation and throws "Access Denied".
- Navigate strictly via the authentic on-screen `<button>` or `<input type="button">` with text `'BACK'`.
- If an unexpected glitch lands on Returns Quick Links (`/services/auth/quicklinks/returns`), click the in-page DOM tile to safely return to Returns Dashboard.

### Rule 3: Golden Rule of Data Preservation
- Download failures, network disconnects, or cancellations must **NEVER DELETE OR TRUNCATE EXISTING DATA**.
- Preserve existing invoices and batches in SQLite.
- Only mark a month `NIL_SYNCED` if portal explicitly confirms 0 records; otherwise leave as `PENDING` or `FAILED`.

### Rule 4: Tally XML Compatibility
- Target TallyPrime XML standard: `<ENVELOPE>`, `<HEADER>`, `<BODY>`, `<DATA>`, `<TALLYMESSAGE>`.
- Dates must be formatted as `YYYYMMDD` (e.g. `20240401`).
- Numerical values: Debits are positive, Credits are negative (or matched with `<ISDEEMEDPOSITIVE>`).

---

## 5. Installed Skills & Capabilities

Each skill is a slash command in `.claude/commands/<name>.md`, so `/<name>` runs it. The command tells Claude to read the skill's `SKILL.md` and follow it.

### A. Local Workspace Skills (`.agents/skills/`)

| Command | Trigger / Keywords | Source | Purpose |
|---|---|---|---|
| `/ponytail` | "ponytail", "be lazy", "simplest solution", "yagni", "don't overengineer" | [SKILL.md](.agents/skills/ponytail/SKILL.md) | Smallest complete change, no bloat. |
| `/ui-ux-pro-max` | "ui", "ux", "design review", "palette", "typography", "layout" | [SKILL.md](.agents/skills/ui-ux-pro-max/SKILL.md) | 50 styles, 192 palettes, 74 font pairings, 119 UX guidelines, 25 chart types. |
| `/ui-styling` | "shadcn", "tailwind", "radix", "component styling" | [SKILL.md](.agents/skills/ui-styling/SKILL.md) | Accessible UI with shadcn/ui, Radix UI and Tailwind, dark mode. |
| `/cinematic-film` | "cinematic video", "documentary", "explainer video", "launch film" | [SKILL.md](.agents/skills/cinematic-film/SKILL.md) | Code-driven narrated films (Skia, beat tables, timed TTS). |
| `/design` | "design logo", "create CIP", "mockups", "brand identity", "icon design" | [SKILL.md](.agents/skills/design/SKILL.md) | Logos (55 styles), CIP deliverables, SVG icons, HTML presentations. |
| `/design-system` | "design tokens", "token architecture", "component specs" | [SKILL.md](.agents/skills/design-system/SKILL.md) | 3-layer tokens (primitive, semantic, component), CSS variables. |
| `/slides` | "slides", "presentation", "html slides", "pitch deck" | [SKILL.md](.agents/skills/slides/SKILL.md) | HTML slide decks with Chart.js and copy formulas. |
| `/banner-design` | "banner", "social banner", "ad banner", "hero banner" | [SKILL.md](.agents/skills/banner-design/SKILL.md) | Banners for social, web, display and print across 22 styles. |
| `/brand` | "brand voice", "brand style guide", "messaging framework" | [SKILL.md](.agents/skills/brand/SKILL.md) | Brand voice, identity guidelines, marketing compliance. |
| `/stitch` | "stitch", "design md", "stitch screens" | [SKILL.md](.agents/skills/stitch/SKILL.md) | Google Stitch: codebase to designs, screen generation, DESIGN.md sync. |
| `/coderabbit-review` | "coderabbit", "run coderabbit", "cr review" | [SKILL.md](.agents/skills/coderabbit-review/SKILL.md) | CodeRabbit CLI review of local changes (from `coderabbitai/skills`; needs `coderabbit` CLI + login). |
| `/coderabbit-autofix` | "coderabbit fix", "cr autofix" | [SKILL.md](.agents/skills/coderabbit-autofix/SKILL.md) | Apply unresolved CodeRabbit PR review threads via `gh`, one approved fix at a time. |
| `/coderabbit-config` | ".coderabbit.yaml", "coderabbit config" | [SKILL.md](.agents/skills/coderabbit-config/SKILL.md) | Create/validate `.coderabbit.yaml` through the CodeRabbit CLI. |

Also present: `/ui-ux` (reads ui-ux-pro-max and ui-styling together) and `/cinematic` (short alias for `/cinematic-film`).

### B. Workflow Skills (`~/.gemini/config/`, outside this repo)

These live on the developer's machine, so the commands only work where that folder exists.

| Command | Trigger / Keywords | Source | Purpose |
|---|---|---|---|
| `/gsd-plan-phase` | "plan phase", "phase plan" | `~/.gemini/config/skills/gsd-plan-phase/SKILL.md` | Goal-backward phase planning into PLAN.md with a verification loop. |
| `/gsd-execute-phase` | "execute phase" | `~/.gemini/config/skills/gsd-execute-phase/SKILL.md` | Wave-parallel plan execution with atomic commits. |
| `/gsd-debug` | "debug", "root cause", "scientific debugging" | `~/.gemini/config/skills/gsd-debug/SKILL.md` | Hypothesis-driven debugging; minimal fix verified with `npm test`. |
| `/gsd-code-review` | "code review", "security review", "regression" | `~/.gemini/config/skills/gsd-code-review/SKILL.md` | Review for bugs, security holes and regressions. |
| `/gsd-ui-review` | "ui review", "visual audit" | `~/.gemini/config/skills/gsd-ui-review/SKILL.md` | Six-pillar visual audit of frontend work. |
| `/gsd-*` (all others) | see each command | `~/.gemini/config/skills/gsd-*/SKILL.md` | Every GSD skill in that folder has a matching `.claude/commands/gsd-*.md` (72 total). Start with `/gsd-help` or `/gsd-next`. Common: `/gsd-progress`, `/gsd-quick`, `/gsd-fast`, `/gsd-discuss-phase`, `/gsd-verify-work`, `/gsd-ship`, `/gsd-map-codebase`, `/gsd-pause-work`, `/gsd-resume-work`. |
| `/ponytail-audit` | "audit", "bloat", "dead code" | `~/.gemini/config/config/plugins/ponytail/.openclaw/skills/ponytail-audit/SKILL.md` | Bugs, security risks, slow paths and dead code. |
| `/ponytail-review` | "review PR", "review changes" | `~/.gemini/config/config/plugins/ponytail/.openclaw/skills/ponytail-review/SKILL.md` | Focused review of pull requests and recent changes. |

---

## 6. Current Project Status & Recent Milestones

- **Active Milestone:** Milestone v2.9 — Phase 41 Complete
- **Latest Work:**
  - Completed Phase 41: *GSTR-2B Direct Inward Entry to TallyPrime & Database Audit Ledger*.
  - Added sticky table headers, responsive mobile selector stacking grid, and touch-friendly mobile pagination in `Gstr2bDirectEntryTab.tsx`.
  - 100% tests green (34/34 Vitest), 0 TypeScript errors, clean production bundle.
- **Detailed Architectural Reference:**
  - Deep line-by-line function manual: `.agents/AGENTS.md`
  - Milestone roadmap & state: `.planning/STATE.md`, `.planning/PROJECT.md`, `.planning/ROADMAP.md`

