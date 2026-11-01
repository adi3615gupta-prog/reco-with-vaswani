# Phase 18: Research & Technical Blueprint — Financial Statements Engine

## 1. Deep Analysis Findings from Black Horse Automation Tools

We analyzed two production-grade financial statement automation workbooks from Vipul Patel & Associates, PCMC:
1. `BS Automation Tool_1.0.5(2x).xlsb` (ICAI June 2022 Technical Guide for Non-Corporate Entities)
2. `Sch 3 Automation Tool_1.1.21.xlsb` (Companies Act 2013 Schedule III Division I/II)

---

## 2. 4-Digit Numeric Group Taxonomy (1001–4902)

The 4-digit code architecture from `Group Codes.pdf` provides an unambiguous, relational dictionary for mapping every trial balance account into statutory reporting categories:

### A. Equity & Liabilities (1000s)
* **1001–1002 (Share Capital):** 1001 Issued Equity Share Capital, 1002 Preference Share Capital.
* **1101–1116 (Reserves & Surplus):** 1101 Capital Reserves, 1102 Capital Reserve on Consolidation, 1103 Capital Redemption Reserve, 1104 Securities Premium, 1105 Debenture Redemption Reserve, 1106 General Reserve, 1107 Revaluation Reserve, 1108 Share Options Outstanding, 1109 MAT Credit Entitlement Reserve, 1110 P&L Opening Balance, 1111 Transfer to General Reserve, 1112 Dividend on Equity, 1113 Dividend on Preference, 1114 Other Appropriation 1, 1115 Other Appropriation 2, 1116 Other Reserves.
* **1201 (Share Warrants):** Money received against share warrants.
* **1251 (Share Application Money):** Pending allotment.
* **1301–1316 (Long-Term Borrowings):** 1301 Secured Debentures, 1302 Secured Bank Term Loans, 1303 Secured Other Term Loans, 1304 Secured Deferred Payment Liabilities, 1305 Secured Deposits, 1306 Secured Related Party Loans, 1307 Secured Finance Lease Obligations, 1308 Secured Other Loans, 1309–1316 Unsecured counterparts.
* **1401 (Deferred Tax Liabilities Net).**
* **1501–1502 (Other Long-Term Liabilities):** 1501 Long-term Trade Payables, 1502 Others.
* **1551–1552 (Long-Term Provisions):** 1551 Employee Benefits (Gratuity/Leave Encashment), 1552 Others.
* **1601–1610 (Short-Term Borrowings):** 1601 Bank OD/CC, 1602 Other Demand Loans, 1603 Related Party Demand Loans, 1604 Secured Deposits, 1605 Other Secured, 1606–1610 Unsecured counterparts.
* **1701–1702 (Trade Payables):** 1701 Dues to Micro and Small Enterprises (MSME), 1702 Dues to Others.
* **1801–1810 (Other Current Liabilities):** 1801 Current Maturities of Long-Term Debt, 1802 Current Lease Maturities, 1803 Interest Accrued Not Due, 1804 Interest Accrued and Due, 1805 Advance Income, 1806 Unpaid Dividends, 1807 Application Money for Allotment, 1808 Unpaid Matured Deposits, 1809 Unpaid Matured Debentures, 1810 Other Payables / Statutory Dues.
* **1901–1902 (Short-Term Provisions):** 1901 Provision for Employee Benefits, 1902 Others (Provision for Tax, etc.).

### B. Assets (2000s)
* **2001–2004 (Property, Plant & Equipment):** 2001 Tangible Assets (PPE), 2002 Intangible Assets, 2003 Capital Work-in-Progress (CWIP), 2004 Intangibles Under Development.
* **2101–2123 (Non-Current Investments):** 2101 Investment Property, 2102–2116 Quoted Investments, 2117–2121 Unquoted Investments, 2122 Partnership Firm Investments, 2123 Other Non-Current Investments.
* **2201 (Deferred Tax Assets Net).**
* **2301–2310 (Long-Term Loans & Advances):** 2301 Capital Advances, 2302 Security Deposits (re-classified to Other Non-Current Assets w.e.f 1-Apr-2021), 2303 Related Party Loans, 2304 Advance Tax (Net of provision), 2305 Balances with Govt Authorities, 2306–2308 Other Secured/Unsecured/Doubtful Advances, 2309 Provision for Doubtful Advances.
* **2401–2406 (Other Non-Current Assets):** 2401 Long-term Secured Receivables, 2402 Long-term Unsecured Receivables, 2403 Doubtful Receivables, 2404 Provision for Bad Debts, 2405 Bank Deposits > 12 Months maturity, 2406 Security Deposits.
* **2502–2523 (Current Investments):** Equity, Preference, Debt, Mutual Funds, etc.
* **2601 (Inventories):** Raw Materials, WIP, Finished Goods, Stock-in-trade, Stores & Spares, Loose tools.
* **2701–2707 (Trade Receivables):** 2701 Secured > 6 Months, 2702 Unsecured > 6 Months, 2703 Doubtful > 6 Months, 2704 Secured Others, 2705 Unsecured Others, 2706 Doubtful Others, 2707 Provision for Doubtful Debts.
* **2801–2807 (Cash & Cash Equivalents):** 2801 Cash on Hand, 2802 Cheques/Drafts on Hand, 2803 Current Accounts with Banks, 2804 Bank Deposits < 3 Months, 2805 Bank Deposits 3–12 Months, 2806 Bank Deposits > 12 Months, 2807 Others.
* **2901–2909 (Short-Term Loans & Advances):** Related Party, Security Deposits, Advance Tax/TDS, Govt Balances, Other Advances.
* **2951 (Other Current Assets):** Prepaid expenses, Accrued Interest, GST Input Tax Credit.

### C. Revenue & Profit/Loss (3000s & 4000s)
* **3001–3004 (Revenue from Operations):** 3001 Sale of Products, 3002 Sale of Services, 3003 Other Operating Revenues, 3004 Others.
* **3101–3105 (Other Income):** 3101 Interest Income, 3102 Dividend Income, 3103 Net Gain on Sale of Investments, 3104 Other Non-Operating Income, 3105 Others.
* **4001 (Cost of Materials Consumed).**
* **4101 (Purchases of Stock-in-Trade).**
* **4201 (Changes in Inventories of WIP, Finished Goods & Stock-in-Trade).**
* **4301–4304 (Employee Benefit Expenses):** 4301 Salaries & Wages, 4302 Contribution to PF & Other Funds, 4303 ESOP/ESPP, 4304 Staff Welfare.
* **4401–4403 (Finance Costs):** 4401 Interest Expense, 4402 Other Borrowing Costs, 4403 Net Gain/Loss on Foreign Currency Borrowings.
* **4501 (Depreciation & Amortization Expense).**
* **4601–4615 (Other Expenses):** 4601 Auditors' Remuneration, 4602 Manufacturing Expenses, 4603 Stores & Spares, 4604 Power & Fuel, 4605 Rent, 4606 Building Repairs, 4607 Machinery Repairs, 4608 Other Repairs, 4609 Insurance, 4610 Rates & Taxes, 4611 Selling & Distribution, 4612 Admin Expenses, 4613 Travelling, 4614 Misc Expenses, 4615 Other Expenses.
* **4701 (Exceptional Items) & 4751 (Extraordinary Items).**
* **4801–4804 (Tax Expense):** 4801 Current Tax, 4802 Deferred Tax, 4803 Prior Period Tax, 4804 Excess/Short Provision written back.
* **4901–4902 (Discontinuing Operations):** Profit/Loss before tax & Tax expense.

---

## 3. MCA 2021 Notification (G.S.R. 207(E)) Regulatory Disclosures & Ratios

The tool implements all 17 mandatory disclosures from MCA notification dated 24th March 2021:

### The 11 Statutory Financial Ratios & Formulas:
1. **Current Ratio:**
   $$\text{Current Assets} \div \text{Current Liabilities}$$
2. **Debt-Equity Ratio:**
   $$\text{Total Debt (Long-term + Short-term Borrowings)} \div \text{Shareholder's Equity}$$
3. **Debt Service Coverage Ratio (DSCR):**
   $$\frac{\text{Net Profit After Tax} + \text{Depreciation} + \text{Interest} + \text{Loss on Sale}}{\text{Interest} + \text{Principal Repayments of Long-term Debt}}$$
4. **Return on Equity (ROE):**
   $$\text{Net Profit After Tax} \div \text{Average Shareholder's Equity} \times 100$$
5. **Inventory Turnover Ratio:**
   $$\text{Cost of Goods Sold} \div \text{Average Inventory}$$
6. **Trade Receivables Turnover Ratio:**
   $$\text{Net Credit Sales (Revenue from Operations)} \div \text{Average Trade Receivables}$$
7. **Trade Payables Turnover Ratio:**
   $$\text{Net Credit Purchases} \div \text{Average Trade Payables}$$
8. **Net Capital Turnover Ratio:**
   $$\text{Revenue from Operations} \div \text{Working Capital (Current Assets} - \text{Current Liabilities)}$$
9. **Net Profit Ratio:**
   $$\text{Net Profit After Tax} \div \text{Revenue from Operations} \times 100$$
10. **Return on Capital Employed (ROCE):**
    $$\text{EBIT (Earnings Before Interest and Tax)} \div \text{Capital Employed (Net Worth} + \text{Total Debt} + \text{Deferred Tax Liabilities)}$$
11. **Return on Investment (ROI):**
    $$\text{Income from Investments} \div \text{Carrying Value of Investments} \times 100$$

*Variance Engine Rule:* If any ratio varies by **more than 25%** compared to the preceding financial year, the tool flags the ratio in amber/red and requires an explanation.

### Statutory Aging Schedules
* **Trade Payables Aging Schedule:**
  * Buckets: $<1$ year, $1–2$ years, $2–3$ years, $>3$ years, Unbilled.
  * Categories: (i) MSME, (ii) Others, (iii) Disputed dues - MSME, (iv) Disputed dues - Others.
* **Trade Receivables Aging Schedule:**
  * Buckets: $<6$ months, $6$ months – $1$ year, $1–2$ years, $2–3$ years, $>3$ years, Not Due.
  * Categories: (i) Undisputed - Considered good, (ii) Undisputed - Considered doubtful, (iii) Disputed - Considered good, (iv) Disputed - Considered doubtful.
* **CWIP & Intangible Assets Under Development Aging:**
  * Projects in progress vs Projects temporarily suspended.
  * Projects overdue or whose cost has exceeded original plan.

---

## 4. ICAI June 2022 Technical Guide for Non-Corporate Entities

The Technical Guide establishes 4 levels of non-corporate entities (Sole proprietorships, Partnership firms, LLPs, Trusts):

### Level Classification Thresholds:
* **Level I Entities (Large):** Turnover $> ₹250$ Cr OR Borrowings $> ₹50$ Cr at any time in preceding year.
* **Level II Entities (Medium):** Turnover $> ₹50$ Cr but $\le ₹250$ Cr OR Borrowings $> ₹10$ Cr but $\le ₹50$ Cr.
* **Level III Entities (Small):** Turnover $> ₹10$ Cr but $\le ₹50$ Cr OR Borrowings $> ₹2$ Cr but $\le ₹10$ Cr.
* **Level IV Entities (Micro):** Turnover $\le ₹10$ Cr AND Borrowings $\le ₹2$ Cr.

### Accounting Standards (AS) Applicability Matrix:
* **AS 3 (Cash Flow Statement):** Mandatory **only** for Level I entities; exempt for Levels II, III, IV.
* **AS 17 (Segment Reporting):** Mandatory only for Level I; exempt for Levels II, III, IV.
* **AS 18 (Related Party Disclosures):** Applicable to Levels I and II; exempt for Levels III and IV.
* **Disclosure Exemptions:** Level II, III, and IV entities are granted substantial disclosure relaxations under AS 10 (PPE), AS 11 (Forex), AS 13 (Investments), AS 15 (Employee Benefits - actuarial valuation exempt for small entities), AS 19 (Leases), AS 22 (Taxes on Income - Level IV exempt from Deferred Tax), and AS 26 (Intangibles).

### Partners' Capital Account Schedule Structure:
Horizontal and Vertical presentation:
$$\text{Closing Capital} = \text{Opening Capital} + \text{Additions} - \text{Withdrawals/Drawings} + \text{Interest on Capital} + \text{Partner Salary/Remuneration} \pm \text{Share of Profit/Loss}$$

---

## 5. Cash Flow Statement Engine (AS-3 Indirect Method)

$$\text{Net Cash from Operating Activities} = \text{PBT} + \text{Non-Cash/Non-Operating Items} \pm \text{Working Capital Changes} - \text{Direct Taxes Paid}$$

1. **Non-Cash Adjustments:**
   * $+$ Depreciation and Amortization (4501)
   * $+$ Finance Costs (4401)
   * $+$ Loss on Sale of Fixed Assets / Investments
   * $-$ Interest Income (3101) & Dividend Income (3102)
   * $-$ Net Gain on Sale of Investments (3103)
   * $\pm$ Unrealised Foreign Exchange Gain/Loss
2. **Working Capital Movement:**
   * $\Delta \text{Inventories} = \text{Opening} - \text{Closing}$
   * $\Delta \text{Trade Receivables} = \text{Opening} - \text{Closing}$
   * $\Delta \text{Trade Payables} = \text{Closing} - \text{Opening}$
   * $\Delta \text{Other Current Assets} = \text{Opening} - \text{Closing}$
   * $\Delta \text{Other Current Liabilities} = \text{Closing} - \text{Opening}$
3. **Net Taxes Paid Derivation:**
   $$\text{Tax Paid} = \text{Opening Provision} + \text{P\&L Tax Expense} - \text{Closing Provision} + \text{Opening Advance Tax} - \text{Closing Advance Tax}$$

---

## 6. Preventive IFC Checks Matrix (35+ Rules)

The `Checks` engine validates:
1. `BS_TOTAL_CHECK`: Assets == Liabilities (Delta == 0).
2. `TB_TOTAL_CHECK`: Debits == Credits (Delta == 0).
3. `GROUPING_COMPLETE`: Face Grouping, Note Grouping, Sub-Note Grouping, Annexure Grouping count unmapped == 0.
4. `CFS_RECONCILIATION`: Net Cash Flow + Opening Cash == Closing Cash on Balance Sheet.
5. `DEPRECIATION_TIE_UP`: P&L Depreciation == Fixed Asset Register Depreciation for the year.
6. `PPE_FACE_VS_SCHEDULE`: Balance Sheet PPE == Gross Block - Accumulated Depreciation on FAR.
7. `NEGATIVE_BALANCE_CHECKS`: Detects debit balances in liability groups (Creditors with Dr, Share Capital with Dr) and credit balances in asset groups (Bank OD in Current Bank, Debtors with Cr) and prompts regrouping.
8. `PROMOTER_DISCLOSURE_CHECK`: In corporate mode, verifies promoter shareholding disclosure is complete.
9. `ELIMINATION_CHECK`: In multi-branch mode, ensures inter-branch debits == inter-branch credits.
