# Phase 38 Research: Landing Page Simplification & Suite Mapping

**Date:** 2026-11-12
**Scope:** Audit existing `src/pages/LandingPage.tsx`, `src/pages/Index.tsx` Hub suites, `src/components/AppShell.tsx` routes, and `src/test/landingPage.test.tsx`.

---

## 1. Current State Diagnosis (`src/pages/LandingPage.tsx`)

- **Size & Complexity:** 3,280 lines in a single file with 15+ interactive states (`waterfallStep`, `heroViewMode`, `heroLatency`, `telemetryFilter`, `monthlyInvoices`, `annualTurnoverCr`, `faqCategory`, `openFaq`, `activityIndex`, `toastPaused`, `cursorMode`, `isWaveMenuOpen`, `showcaseIndex`).
- **Presentation Pain Points:**
  1. Hero displays simulated server telemetry (`Engine Active • Port 9000 Loopback • Latency: 1.8ms`, mock JSON rows, CSS frequency waveform) instead of explaining what the software actually does for a CA practice or client.
  2. References `"14 Engines"` and `"Module 01 & 04"` / `"Module 08 & 14"` with JSON payload boxes that do not match the actual post-login Suite Hub (`Suites 01–08`).
  3. Includes noisy distractions (custom cursor follower, infinite marquee ticker, floating toast popup, invoice ROI calculator slider) that pull audience attention away during a live screen-share demo.
  4. Has no clear **WIP & Upcoming Future Updates** roadmap section explaining Suite 08 WIP modules and future releases.

---

## 2. Exact Application Suite Inventory (Verified from `src/pages/Index.tsx` & `src/components/AppShell.tsx`)

| Suite | Hub Name (`Index.tsx`) | Included Modules | Output / Client Value |
|---|---|---|---|
| **Suite 01** | GST & TDS Reco Engine | GST Data Consolidator, GST Reco (PR vs 2B with ±₹2 tolerance), Party Dispute Center (WhatsApp/Email), TRACES Form 26Q TDS | Party-wise Excel reports + instant vendor follow-up notices |
| **Suite 02** | Tally Connectors & Bridge | Direct Port 9000 Link, Daybook & TB XML Parser, Tally Ledger Voucher Import, Auto-Detect Company | Zero manual export; live Tally data ready in seconds |
| **Suite 03** | Returns Prep & 12M Filing | GSTR-3B Working Sheet & Rule 88A Set-off, 12-Month FY Matrix, GST IMS Action Manager, GSTR-2B 12M Autopilot, GSTR-1 12M Autopilot, Returns Filing Tracker | 1-login 12-month portal download + accurate 3B working |
| **Suite 04** | Statutory & Tax Audit | SA 530 Monetary Sampling, Form 3CD Clause 44 (Reg vs Unreg GST spend), Dual Depreciation & DTA (Companies Act vs IT Act) | Audit-ready schedules & sampling sheets |
| **Suite 05** | Income Tax & Regime Engine | Section 115BAC Old vs New Regime Optimizer, 25% Surcharge Cap & 87A Rebate, Full Tax Computation Sheet | Clear regime comparison to save client tax |
| **Suite 06** | Monthly Audit Working Paper | 5 Standard Sections & 8 Checklists, Maker-Checker (Junior -> Senior Reviewer), Work Pending Continuity, PDF/Excel Export | Standardized firm-wide monthly audit files |
| **Suite 07** | Excel to Tally XML Enterprise Suite | Dual Entry, Multi-Entry, Quick Columnar & Ledger Masters XML, Debit/Credit Balance Validator, Direct Port 9000 Push or Offline XML | Bulk upload hundreds of Excel entries into Tally cleanly |
| **Notices & AI** | GST Notices Hub & Sourav AI | GST Notices Autopilot Downloader, ASMT-10/DRC-01 Draft Legal Replies, Sourav AI Assistant & Desktop Copilot | Track portal notices & draft replies faster |
| **Suite 08 (WIP)** | Practice & WIP Hub (Expanding) | Practice Dashboard, 12M Filing Tracker, GSTIN Smart Scanner, GSTR-2B & 3B Tracker, Schedule III Financials Engine, CMA Data & Project Report, Voucher Re-classifier, Bank CMA Credit & Ratios | Active WIP modules receiving continuous future updates |

---

## 3. Existing Contracts & Dependencies

- `src/pages/Login.tsx#L64` and `src/pages/Index.tsx#L1593` render `<LandingPage onNext={...} feedbackList={...} setFeedbackList={...} />`.
- `src/App.tsx#L147` exposes `/landing` route without `onNext`, handled by falling back to `navigate("/")`.
- `src/test/landingPage.test.tsx` tests static theme tokens (`bg-[#FBFBFD]`, `bg-white`, `border-slate-200`, no `./finance-bg.mp4`, no `<video`, no `bg-[#090d16]`), `onNext` click behavior, and theme toggle. Tests asserting removed mock telemetry tabs (`Approved` filter, `Port 9000 Loopback`, `AUTONOMOUS MODULE DIRECTORY`) will be updated cleanly alongside the new presentation interactive presenter tests.

