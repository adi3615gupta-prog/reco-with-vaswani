# Module 1.5: CMA Project Report & Feasibility Hub

> **Suite Accent Color:** Blue 500 (`#3b82f6`)  
> **Route:** `/cma`  
> **Source Component:** [`src/pages/CmaReport.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/CmaReport.tsx)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** Bank term loans aur project finance applications ke liye 5-year to 7-year financial feasibility reports, project cost schedules, aur loan amortization tables compute karta hai.
- **Kyu karta hai:** Commercial banks (SBI, HDFC, PNB, BOB) ko credit sanction ke liye detailed Project Appraisal & Techno-Economic Feasibility Report (TEFR) submit karni hoti hai.
- **Kaise karta hai:** Capital expenditure, promoter contribution, debt-equity ratio, DSCR, break-even capacity, aur cash flow projections calculate karta hai.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Project Appraisal Summary Deck
- **Project Cost:** Total CapEx (Land, Building, Plant & Machinery, Pre-operative expenses, Working capital margin).
- **Means of Finance:** Promoter Equity vs Bank Term Loan vs Unsecured Loans.
- **Average DSCR:** e.g. `1.84x` (Target $\ge$ 1.50x — Bank Approved).
- **Project IRR / Payback Period:** e.g. `19.2% IRR • Payback 4.2 Years`.

### 2.2 Feasibility Schedules
1. Schedule 1: Cost of Project & Means of Finance
2. Schedule 2: Term Loan Amortization Schedule (Principal repayment + Monthly EMI + Reducing interest)
3. Schedule 3: Projected Profitability Statement (Year 1 to Year 5)
4. Schedule 4: Projected Balance Sheet & Cash Flow Statement
5. Schedule 5: Sensitivity Analysis (Turnover -10%, Raw material cost +5%)

---

## 3. Stitch UI Prompt Snippet
```markdown
Design a Bank Project Feasibility & Loan Appraisal Dashboard.
- Top: 4 Key metrics (Total Project Cost, Term Loan Requested, Debt-Equity Ratio, Average DSCR).
- Main Body: 5-Year Financial Projection table with expandable schedules (CapEx, Debt Amortization, Profitability, Sensitivity Analysis).
- Interactive: Input sliders to tweak Term Loan Interest Rate and Capacity Utilization.
```
