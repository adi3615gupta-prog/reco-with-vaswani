# Phase 5: Enterprise UI/UX Aesthetic Overhaul & Unified Persistent App Shell — Context

## Purpose & Goal
Transform the entire Vaswani Return Enterprise suite into a premium, world-class financial workstation (inspired by Linear, Vercel, and high-density financial analytics tools). 

Ensure the user can effortlessly switch between all 11 compliance modules without jarring full-screen route shifts, without losing ongoing workspace state or uploaded records, and with a standardized, sleek "Obsidian Glass" dark aesthetic.

## Core Decisions (Ponytail Senior Dev Mode)
1. **Persistent App Shell Wrapper (`AppShell.tsx`)**:
   - Rather than refactoring 25+ individual module pages from scratch, wrap the active module in a unified, collapsible sidebar + top command bar inside `src/pages/Index.tsx`.
   - Collapsible left sidebar groups modules logically into 5 suites:
     - **GST Reco & Audit**: Reco Inward (`reco`), Vendor Party Hub (`party-hub`), Output Reco (`output-reco`), GSTR-2B Tracker (`tracker`).
     - **Returns & Autopilot**: Returns Mission Control (`returns`), GSTR-3B Working Sheet, FY Matrix.
     - **Tally & Integrations**: Tally Direct Port 9000 (`tally-direct`), Tally Ledger Import (`ledger-import`), Tally Converter (`tally`).
     - **TDS, Tax & Statements**: TDS Reco (`tds-reco`), Income Tax Sandbox (`income-tax`), Financial Statements (`fin-statements`).
     - **Bank Appraisal & Auditing**: Bank CMA (`cma` / `bank-cma`), Clause 44 Audit (`clause44`), Statutory Audit (`audit`), Depreciation (`depreciation`).
   - Top Command Bar displays: Active Client name, current Financial Year badge, System Status HUD (Local SQLite DB status, Tally connection ping indicator, GST portal status), and quick Command Palette trigger (`Ctrl+K`).
2. **Centralized Obsidian Glass Styling (`src/index.css`)**:
   - Deep obsidian background (`#090d16`), refined borders (`#1e293b`), subtle ambient card glows.
   - Standardized table classes: sticky headers, monospace tabular numbers (`font-mono tracking-tight`), compact padding (`py-2 px-3`), zero-wrap status chips.
3. **Safety & Zero Disruption**:
   - Zero modifications to calculation logic, reconciliation algorithms, or the strict Zero-Merge architecture (`ws['!merges'] = []`).
   - Keep all existing props and callbacks passed to module components intact.
