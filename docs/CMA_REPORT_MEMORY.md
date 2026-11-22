# Credit Monitoring Arrangement (CMA) Projections Memory File
This file serves as a persistent memory module for the Credit Monitoring Arrangement (CMA) Wizard, bank lending projections, and ratio compiler.

## Module Location
- **Primary Page/UI Controller:** `src/pages/CmaReport.tsx`
- **Data Ingestion API:** `src/lib/tallyApi.ts` u/s `fetchCompanyInfo` and direct syncing.

## Operating Wizards
1. **Existing Projects Wizard (5 Steps):**
   - **Step 1: Company Profile:** Gathers entity name, PAN, bank name, requested Working Capital Limit (CC/OD).
   - **Step 2: Balance Sheet Ingestion:** Synchronizes current year ledger balances from Tally or accepts manual figures. Calls `aggregateTallyToCMAPayload` to map ledgers into CMA payload assets/liabilities.
   - **Step 3: Drawing Power Audit:** Inputs stock/inventory value, sundry creditors, and receivables aged under/over 90 days. Applies standard banking margin caps (typically 25% on stock, 30% on debtors under 90 days) to compute bank drawing power u/s Tandon Committee rules.
   - **Step 4: Projections & Operating Parameters:** Sets expected annual growth percentage, net profit margins, raw materials holding periods, debtor collection periods, and creditor payment velocity.
   - **Step 5: Excel Generation:** Runs `executeGeneration` to build a dynamic, formulas-rich spreadsheet showing a 5-year CMA forecast.
2. **Greenfield Projects Wizard:**
   - Designed for new ventures. Adds inputs for **Project Cost** (land, building, plant & machinery) and **Means of Finance** (promoter equity, term loan, subsidies). Includes term loan repayment schedules (moratorium + payment frequency).

## Core Financial Calculations
- **Maximum Permissible Bank Finance (MPBF) Method I & II:**
  - **Method I:** CC limit capped at 75% of (Current Assets - Current Liabilities other than Bank Borrowings). Requires promoter margin of 25% of working capital gap.
  - **Method II:** CC limit capped at (75% of Current Assets) - Current Liabilities other than Bank Borrowings. Requires promoter margin of 25% of total Current Assets.
- **Ratios Monitored:** Current Ratio (minimum 1.33 u/s Method II), Debt-Equity Ratio, Debt Service Coverage Ratio (DSCR), Interest Coverage Ratio, Turnover-based limits (Nayak Committee Method for small businesses).
