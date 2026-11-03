# Phase 29: UI Design Contract (UI-SPEC.md)

> **Design Direction:** Executive Enterprise White Theme (Minimalism & Swiss Style) powered by **UI/UX Pro Max** local design intelligence.

---

## 1. Design System & Visual Contract

### A. Surfaces & Color Palette
- **Canvas Base (`--color-background`)**: `#F8FAFC` (`bg-slate-50`). Crisp, non-reflective executive background.
- **Card Surfaces (`--color-card`)**: `#FFFFFF` (`bg-white`). Elevated white containers with subtle layered shadows.
- **Card Borders (`--color-border`)**: `#E2E8F0` (`border-slate-200/80`) with hover highlight to `#93C5FD` (`hover:border-blue-300`).
- **Surface Elevation**:
  - Base: `shadow-xs` (`0 1px 2px 0 rgba(0, 0, 0, 0.05)`)
  - Elevated Card: `shadow-md` (`0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)`)
  - Hover Pop: `shadow-xl` (`0 20px 25px -5px rgba(0, 0, 0, 0.07), 0 8px 10px -6px rgba(0, 0, 0, 0.04)`)

### B. Typography & Contrast (WCAG 2.2 AAA / AA Compliant)
- **Primary Typography (`--color-foreground`)**: `#0F172A` (`text-slate-900`). Contrast ratio: **16.8:1** (Exceeds WCAG AAA).
- **Secondary Headings & Subtitles**: `#1E293B` (`text-slate-800`) / `#334155` (`text-slate-700`).
- **Body & Explanatory Copy**: `#475569` (`text-slate-600`) / `#64748B` (`text-slate-500`). Contrast ratio: **6.2:1** (Exceeds WCAG AA).
- **Financial Monospace Figures**: `font-mono tabular-nums tracking-tight font-bold text-slate-900`.
- **Accent Palette**:
  - Primary Action / Trust: `#1E3A8A` (Deep Trust Navy) & `#2563EB` (Enterprise Blue)
  - Success / Match / Online: `#059669` (Compliance Emerald)
  - Warning / Debit Note: `#D97706` (Amber 600)
  - Variance / Critical: `#DC2626` (Red 600)
  - AI & Intelligence: `#7C3AED` (Purple 600)

---

## 2. Component Specifications

### A. Frosted Sticky Navigation Bar
- **Placement**: `sticky top-0 z-50 backdrop-blur-md bg-white/90 border-b border-slate-200/80`.
- **Left**: Official Vaswani Enterprise logo with gold/navy shield emblem and suite title.
- **Center**: Smooth scroll navigation anchor links (`#suites`, `#architecture`, `#testimonials`, `#contact`).
- **Right**:
  - Feedback Trigger: `text-xs font-semibold text-slate-600 hover:text-blue-600 flex items-center gap-1.5`.
  - Global Desktop Copilot Hotkey Badge: `kbd` element showing `Ctrl + Alt + S` in monospace font.
  - Primary CTA: High-contrast `Get Started →` button with subtle hover elevation (`hover:scale-[1.02] active:scale-[0.98]`).

### B. High-Impact Hero Section & Interactive Financial Cockpit
- **Hero Left**:
  - Trust Badge: `🛡️ Industrial-Grade On-Premise CA Suite · Zero Cloud Exposure` in emerald/blue soft pill.
  - Headline: "Enterprise Statutory Audit & GST Intelligence", high-contrast gradient text accent (`from-blue-700 via-indigo-600 to-emerald-600`).
  - Subtitle: Clear value proposition emphasizing local air-gapped security, sub-500ms processing speed, and zero merged cells.
  - Action Row: Primary `Get Started` button and secondary `Explore All 8 Suites` outline button.
  - Trust Strip: 4 badges for SQLite on-premise, zero merged cells, sub-500ms engine, and 12-month autopilot.
- **Hero Right (Interactive Live Financial Cockpit)**:
  - Replaces broken `./finance-bg.mp4` video with a live simulated interactive compliance widget:
    - Live ITC Reconciliation Meter: Purchase Register vs GSTR-2B (₹4.82 Cr matched, 99.8% precision, ₹0 double-counting).
    - Tally Prime Port 9000 Status Indicator: Green pulsing ping dot with `Connected · Port 9000`.
    - 12-Month Inward Ingest Ring: `12 / 12 Months Synced`.
    - PC Loco Pilot Desktop summon pill: `Ctrl + Alt + S Active`.

### C. Live Statutory Metric Strip
- 4-column high-contrast KPI cards:
  1. `50,000+` Invoices/sec Reconciled (Multi-core Web Worker engine).
  2. `₹0` Double-Counting Invariant ($\sum \text{Reconciled} = \sum \text{Raw}$).
  3. `8+` Comprehensive Statutory Suites (Audit, Reco, Tally, Returns, CMA, Income Tax, Notices, Monthly Audit).
  4. `100%` Air-Gapped Local SQLite Execution (Zero third-party cloud leakage).

### D. Comprehensive 8-Suite Showcase & Interactive Navigator
- **Interactive Category Filter Tabs**:
  - `All Modules` (9)
  - `Audit & Reco` (Suite 01, Suite 05, Suite 08)
  - `Returns & Compliance` (Suite 02, Suite 04, GSTR-2B Autopilot)
  - `Tally & Integration` (Suite 03, Direct XML Import)
  - `Financial & Tax` (Suite 06, Suite 07)
  - `AI & Autopilot` (Notice Shield AI, PC Loco Pilot)
- **Elevated Suite Cards**:
  - Suite 01: GST Multi-Tier Waterfall Reconciliation & 6-Pass Debit Note Solver.
  - Suite 02: GSTR-1 Outward Return Preparation & V2.2 32-Sheet Excel Exporter.
  - Suite 03: Tally Prime Direct Integration (Live Port 9000 & Two-Way Ledger Bridge).
  - Suite 04: GSTR-3B Working Sheet & 12-Month FY Tax Matrix.
  - Suite 05: Statutory Audit & Tax Audit Clause 44 Scrutiny.
  - Suite 06: Income Tax Liability & Slab Regime Sandbox.
  - Suite 07: Bank CMA Appraisal & Multi-Year Financial Projections.
  - Suite 08: Monthly Audit Working Paper Verification Suite.
  - Autopilot & AI Suite: 12-Month 2B Consolidator, IMS Manager, Notice Shield AI & PC Loco Pilot.
- **Card Content Structure**:
  - Suite Number Pill + Status Tag + Icon.
  - Title and Comprehensive Technical Description.
  - 3-column breakdown: Key Capabilities, Problems Eliminated, and Vaswani Resolution Guarantee.
  - High-contrast `Launch Suite →` button (triggers `onNext()`).

### E. Architectural Principles & Zero-Merge Deep Dive
- Side-by-side comparison illustrating why merged cells break Excel filters, sorting, and `XLOOKUP`, contrasted with Vaswani Enterprise's guaranteed zero-merge architecture (`ws['!merges'] = []`).
- Explanation of air-gapped local SQLite privacy and mathematical zero double-counting invariants.

### F. Executive Feedback Modal & Testimonial Grid
- White theme feedback dialog (`bg-white border border-slate-200 rounded-3xl p-8 shadow-2xl`).
- Star rating selector with hover preview and high-contrast yellow stars.
- Testimonial grid featuring verified CA practitioner feedback and firm quotes.

---

## 3. Strict Non-Functional Guarantees
1. **Zero Merged Cells**: Maintains the global architectural rule across any exportable or referenced structures.
2. **WCAG 2.2 AA Compliance**: Text contrast $\ge$ 4.5:1, visible keyboard focus indicators, screen-reader accessible attributes.
3. **Reduced Motion Respect**: Honors `prefers-reduced-motion` for all canvas and card animations.
4. **Zero Compilation Regressions**: Clean production build (`npm run build`) and 100% Vitest pass rate across all test suites.
