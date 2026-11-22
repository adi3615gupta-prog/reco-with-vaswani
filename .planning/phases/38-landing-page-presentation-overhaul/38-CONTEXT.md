# Phase 38 Context: Presentation-Ready Landing Page Overhaul

**Gathered:** 2026-11-12
**Status:** Ready for planning & execution

<domain>
## Phase Boundary

Transform `src/pages/LandingPage.tsx` from a bloated 3,280-line technical/marketing showcase into a clean, intuitive, presentation-first walkthrough of **AUDIT WITH VASWANI** tailored for live demos to CA partners, audit staff, and business clients.

Every module must be explained in simple, jargon-free business language matching the exact Suite numbering and naming inside the application (`Suites 01–08`, GST Notices Suite, and Sourav AI Assistant), ending with a dedicated **Work In Progress (WIP) & Upcoming Future Updates** section.

</domain>

<decisions>
## Key Design & Content Decisions

1. **Eliminate Unnecessary Clutter & Dev Jargon:**
   - Remove custom cursor physics (`CursorAura`), 3D `TiltCard`, `MagneticButton` distractions, and floating live-activity toast notifications (`toastDismissed` / `liveActivities`).
   - Remove fake/complex technical widgets: hero latency jitter (`heroLatency`), fake Telemetry/Topology/Audit tabs, JSON payload copy boxes, waterfall algorithm step-simulators, ROI invoice/turnover sliders, curved-lens duplicate carousel, infinite marquee strip, and complex accordion FAQs.
   - Replace technical buzzwords ("loopback telemetry", "daemon", "JSON payload", "14 Engines") with clear user-friendly explanations.

2. **Live Presentation Flow + Visual Diagrams & Mini-Widgets:**
   - **Clean Sticky Header:** Brand logo, 4 jump links (`Overview`, `Module Presenter`, `All Suites`, `WIP & Updates`), Light/Dark theme toggle, and primary `Enter Software` button (`⌘K`).
   - **Clear Hero + System Architecture Flow Diagram:** Simple headline explaining what the software does ("GST, Tally, Tax & Audit Automation — Safe on Your Own PC"), primary `Enter Software` + `Walk Through Modules` CTAs, and a clean **Visual Data-Flow Diagram** (`TallyPrime + Excel + GST Portal` ➔ `Local Office PC Engine (100% Private)` ➔ `Clean Excel, Returns, Audit & Tally XML`) plus simple key figures (`8 Suites`, `1-Login 12M Sync`, `±₹2 Smart Match`, `Zero-Merge Excel`).
   - **Interactive Suite Presenter with Tailored Visual Widgets (`#presenter`):**
     - Interactive slide/step presenter allowing the presenter to step through **Suite 01 → Suite 02 → Suite 03 → Suite 04 → Suite 05 → Suite 06 → Suite 07 → Notices & AI** with `Previous` / `Next` buttons, simple **Input → Software Action → Final Output** flow model, AND a **Suite-Specific Visual Widget / Diagram** (e.g., Reco Match Breakdown Bars for Suite 01, Port 9000 Two-Way Bridge Diagram for Suite 02, 12-Month Autopilot Calendar Grid & Rule 88A Flow for Suite 03, Clause 44 & Dual Depreciation Split Model for Suite 04, Old vs New Regime Comparison Widget for Suite 05, Maker-Checker Approval Diagram for Suite 06, Dr=Cr XML Validator Preview for Suite 07, Notice-to-Reply Diagram for Notices & AI).
   - **Final Highlight Section: Suite 08 (WIP) & Upcoming Updates Roadmap Model:**
     - Clearly separates active WIP modules (`Practice Dashboard`, `12M Filing Tracker`, `GSTIN Smart Scanner`, `GSTR-2B & 3B Tracker`, `Financial Statements Engine`, `CMA Data & Project Report`, `Voucher Re-classifier`, `Bank CMA Credit & Ratios`) with visual progress/stage indicators (`Usable Beta` / `Active WIP`) and a clear **Future Updates Pipeline Diagram** showing upcoming enhancements.
   - **Clean Final CTA & Honest Footer:** Simple "Ready to Launch?" callout with `Enter Software` action.

3. **Preserved Application Contracts:**
   - Preserve `LandingPageProps` (`onNext`, `feedbackList`, `setFeedbackList`), `/landing` route compatibility, Light (`bg-[#FBFBFD]`) / Dark (`dark:`) theme support (`localStorage` `np_landing_theme`), and `⌘K` keyboard shortcut to launch the app.

</decisions>

<specifics>
## Target Files
- `src/data/landingModules.ts` (New: structured, plain-language presentation catalog for all suites, submodules, and WIP/upcoming roadmap items)
- `src/pages/LandingPage.tsx` (Refactored presentation-ready landing page)
- `src/test/landingPage.test.tsx` (Updated tests matching simplified presentation UI & interactive suite presenter)
</specifics>

