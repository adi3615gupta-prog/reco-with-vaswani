# Phase 18: Suite 01 Work In Progress & Practice Hub — Module 1.6 Financial Statements Engine (Schedule III Corporate & Non-Corporate ICAI 2022 Suite)

## Phase Goal
Transform Module 1.6 Financial Statements Engine (`src/pages/FinancialStatements.tsx`) under Suite 01 (`Work In Progress & Practice Hub`) into an enterprise dual-mode financial statement compilation suite. The engine will ingest Tally/Excel Trial Balances and compile complete, audit-grade financial statements compliant with:
1. **Companies Act 2013 Schedule III Division I & II** (Corporate mode) with all 17 MCA March 2021 regulatory disclosures and 11 financial ratios.
2. **ICAI June 2022 Technical Guide for Non-Corporate Entities** (Non-Corporate mode) with automated Level I–IV classification, disclosure exemptions, Partners' Capital accounts, and Horizontal T-Format layouts.

---

## Architectural & Business Context

### Upstream Inspiration & Deep Technical Analysis
The design directly adapts the verified architecture, grouping taxonomy, and calculation engines of two industry-standard tools analyzed in `D:\SCHEDULE 3 FINANCIALS TOOL (BLACK HORSE)\Vipul Patel & Associates, PCMC`:
1. **Schedule 3 Automation Tool (`Sch 3 Automation Tool_1.1.21.xlsb`)**:
   - 4-Digit Structured Numerical Code System (1001–4902) mapping Equity & Liabilities (1000s), Assets (2000s), Revenue (3000s), and Expenses (4000s).
   - 17 MCA Regulatory Disclosures (`R_Disc`) including 11 Core Financial Ratios with automated >25% variance alerts and explanations.
   - AS-3 / Ind AS 7 Indirect Method Cash Flow Statement (`CFS` & `CFS(W)`) with tax reconciliation and working capital shifts.
   - Corporate Tax & Deferred Tax engine (Sec 115BAA 22%, 115BAB 15%, regular 25%/30%, MAT u/s 115JB).
   - Over 35 Internal Financial Control (IFC) preventive validation checks (`Checks`).
2. **Balance Sheet Automation Tool (`BS Automation Tool_1.0.5(2x).xlsb`)**:
   - ICAI June 2022 Technical Guide for Non-Corporate Entities.
   - Level I to Level IV AS applicability evaluator based on Turnover and Borrowing thresholds.
   - Dual presentation layouts: Both Vertical (Modern Schedule III-aligned) and Horizontal (Traditional T-Format).
   - Multi-Partner Capital Accounts (2 to 50 partners with capital movement, interest on capital, partner remuneration, drawings, profit sharing).
   - Dual Depreciation: Companies Act Schedule II vs Income Tax Act Section 32 block-wise WDV.

---

## Scope Fences

### In-Scope
1. **Data Ingestion & Grouping Pipeline (`src/lib/finStatements.*`)**:
   - Support 4-digit code mapping (1001–4902) alongside parent/note grouping.
   - Tally XML/ODBC direct ingestion (port 9000) or CSV/Excel upload with confidence-scored auto-mapping suggestions based on Tally primary groups.
   - Real-time Trial Balance debits vs credits check with auto zero-balance suppression.
2. **Dual-Mode Financial Engine**:
   - **Mode A: Corporate (Schedule III Division I/II)**
     - Balance Sheet (Vertical format with Note references, CY, and PY comparatives).
     - Statement of Profit and Loss (Revenue from operations, expenses by nature, tax expense).
     - Cash Flow Statement (AS-3 Indirect Method with automated Operating, Investing, Financing activities).
     - 17 MCA 2021 Regulatory Disclosures (`R_Disc`) with 11 Ratios and aging schedules (CWIP, Intangibles, MSME Trade Payables, Trade Receivables).
     - Tax computation (PGBP adjustments, Sec 115BAA/25%, MAT u/s 115JB, Deferred Tax).
   - **Mode B: Non-Corporate (ICAI June 2022 Technical Guide)**
     - Level I–IV AS classification evaluator (`AS` sheet logic).
     - Layout switcher: Vertical vs Horizontal (Traditional T-Format).
     - Partners' Capital Account schedule (Opening, Additions, Withdrawals, Interest, Salary, Profit/Loss, Closing).
     - Dual Depreciation Register (Companies Act Schedule II vs IT Act Section 32).
3. **Internal Financial Controls (IFC) Preventive Checks Dashboard**:
   - 35+ real-time checks validating balance sheet tie-up, trial balance zero-diff, grouping completeness, abnormal/negative balances, and CFS cash reconciliation.
4. **Practice Hub & Navigation Integration**:
   - Wire `/fin-statements` into `src/pages/Hub.tsx` under Suite 01 (Work In Progress & Practice Hub) as Module 1.6.
   - Update sidebar navigation in `AppShell.tsx`.
5. **Zero-Merge Excel & PDF Export**:
   - Export multi-tab audit workbooks strictly enforcing Zero Merged Cells (`ws['!merges'] = []`).

### Out-of-Scope (Deferred)
- XBRL taxonomy generation (can be added as an extension in a subsequent phase).
- Multi-currency forex transaction revaluation beyond standard AS-11 disclosures.

---

## Success Criteria & Verification Gates
1. Module 1.6 is reachable from Suite 01 on `Hub.tsx` and loads `/fin-statements` cleanly.
2. Entity type switcher enables toggling between Corporate (Schedule III) and Non-Corporate (ICAI 2022 TG).
3. Ingesting a Trial Balance auto-maps accounts using the 4-digit taxonomy and computes Balance Sheet, P&L, and Cash Flow Statement in under 2 seconds.
4. All 11 MCA financial ratios calculate accurately with variance alerts on >25% shifts.
5. In Non-Corporate mode, selecting entity turnover and borrowings auto-determines Level I–IV AS applicability and generates Partners' Capital schedules.
6. The IFC Checks Dashboard displays real-time `OK` / `FLAG` status across all 35 audit rules.
7. Excel export generates a valid multi-sheet workbook with zero `<mergeCell>` entries.
