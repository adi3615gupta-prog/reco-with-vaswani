# Tax Engine Architecture & Memory File
This file serves as a persistent memory module for the CA Final Direct Tax (DT) integration. It outlines the core architecture, key functions, and already implemented tax rules in the `reco-with-vaswani` project so that future interactions do not require re-analyzing the entire codebase.

## Core Engine Location
- **Path:** `src/lib/incomeTaxEngine.ts`
- **Purpose:** Handles the 7-step computation sequence for income tax, rebates, surcharges, and cess.

## Key Functions & Flow
1. **`aggregateIncome(incomeRecords, regime)`**
   - Segregates normal income from special rate incomes (STCG 111A, LTCG 112A/112, Casual Income, Crypto VDA, Agricultural Income, Deemed Income 115BBE).
   - Resolves set-off caps (e.g., House property loss capped at ₹2L).
2. **`applyDeductions(filteredDeductions, grossNormalIncome, regime)`**
   - Handles Chapter VI-A deductions (80C, 80D, etc.).
   - Disallows deductions if the New Regime (115BAC) is opted.
3. **`calculateIndividualTax`**
   - Main entry point for Individuals, HUFs, and AOP/BOIs.
   - Calculates base tax using slab rates and partial integration for agricultural income.
   - Computes tax on special incomes.
4. **`calculateNonIndividualTax`**
   - Main entry point for Domestic Companies, Foreign Companies, Firms, and LLPs.
   - Handles flat corporate tax rates (e.g., 15%, 22%, 25%, 30%, 35%).
5. **`applyRebate87A`**
   - Applies Rebate u/s 87A for individuals.
   - Fully implements Marginal Relief logic (e.g., tax capped to the amount exceeding ₹12L threshold in the new regime).
6. **`applySurcharge`**
   - Determines surcharge brackets based on total net taxable income.
   - Computes surcharge on normal tax and special tax (capped at 15% for 111A/112A).
   - Applies Marginal Relief on Surcharge thresholds.
   - **Important:** Includes specific logic for a fixed 25% surcharge on Deemed Income (115BBE) with no marginal relief.

## CA Final DT Rules Already Implemented
### Chapter 1: Basics & Rates
- **Foreign Companies:** Flat 35% tax rate, with 2% surcharge (>₹1Cr) and 5% surcharge (>₹10Cr).
- **Deemed Income u/s 115BBE:** Flat 60% tax + 25% mandatory surcharge = 78% effective rate.
- **Agricultural Income:** Partial integration implemented. If Agri Income > ₹5,000 and Normal Income > Basic Exemption Limit, tax is computed using the two-step formula.
- **Marginal Reliefs:** Built-in for Surcharge brackets (all entities) and Rebate 87A (New Regime individuals).

### Chapter 2: Residential Status (Section 5)
- **IncomeRecord Augmented:** Contains `is_foreign_income` and `is_business_controlled_in_india`.
- **Filtering Logic:** `aggregateIncome` drops foreign income dynamically depending on the profile's `residential_status`:
  - **ROR:** Taxed globally.
  - **RNOR:** Foreign income exempt *unless* it's derived from a business controlled in India.
  - **NR:** Foreign income explicitly ignored.

### Chapter 3: Salaries (Computation Sub-Engine)
- **Salary Sub-Engine Location:** `src/lib/salaryEngine.ts` and `src/lib/salaryTypes.ts`
- **Data Models:** Uses `RawSalaryComponents` which takes unformatted payroll data (Basic, DA, Rent Paid, Gratuity, etc.) and outputs `ComputedSalaryDetails`.
- **Exemptions (Section 10):**
  - **HRA (10(13A)):** Computes Metro vs Non-Metro limits automatically. Disallowed in New Regime.
  - **Gratuity (10(10)) & Leave (10(10AA)):** Includes formulas for POGA/Non-POGA, Government/Non-Government, utilizing months of service and average 10-month salary.
  - **Pension (10(10A)):** Commuted pension 1/3rd vs 1/2 rule based on gratuity receipt.
- **Perquisites (Section 17):**
  - **Rent Free Accommodation (RFA):** Dynamically applies 15%/10%/7.5% depending on population and employer ownership.
  - **Motor Car:** Standard ₹1800/₹2400 calculations for mixed-use cars.
- **Deductions (Section 16):** Standard Deduction, Professional Tax, and Entertainment Allowance correctly layered.

### Chapter 4: Income from House Property (Computation Sub-Engine)
- **House Property Sub-Engine Location:** `src/lib/housePropertyEngine.ts` and `src/lib/housePropertyTypes.ts`
- **Data Models:** Uses `HousePropertyRecord` representing individual properties and outputs `TotalHousePropertyResult`.
- **Classification & Caps:** Automatically enforces a maximum of 2 Self-Occupied Properties (SOP). Converts 3rd+ SOPs to Deemed Let-Out (DLOP).
- **GAV & NAV Calculation:** Implements strict 3-step Expected Rent vs Actual Rent formula for LOP/DLOP. Keeps SOP NAV at zero.
- **Section 24 Deductions:**
  - **24(a):** Flat 30% of NAV.
  - **24(b) Interest:** LOP gets unlimited deduction. SOP gets capped at ₹2L (post-1999) or ₹30k.
  - **New Regime Impact:** Interest on SOP is explicitly forced to 0 under Section 115BAC.
- **Set-Off Capping:** Inter-head loss set-off for House Property is hard-capped at ₹2,00,000.

### Chapter 5: PGBP (Profit & Gain from Business or Profession)
- **PGBP Sub-Engine Location:** `src/lib/pgbpEngine.ts` and `src/lib/pgbpTypes.ts`
- **Data Models:** Uses `PresumptiveBusinessRecord` and `RegularBusinessRecord` linked to `AssetBlock`.
- **Presumptive Taxation (44AD, 44ADA, 44AE):**
  - **44AD:** Automatically splits into 6% (digital) and 8% (cash) minimums.
  - **44ADA:** Applies flat 50% floor.
  - **44AE:** Computes monthly haulage per ton for heavy goods, flat rate for others.
- **Regular Business (Indirect Method):**
  - Starts with **Net Profit as per Books**.
  - **Additions:** Automatically adds back Book Dep, 40A(3) cash disallowances, 43B (unpaid taxes/PF/MSME), capital/personal expenses.
  - **Subtractions:** Removes Dividend, IFHP, Capital Gains credited to P&L.
- **Section 32 Tax Depreciation:**
  - Implements the strict **<180 Days Rule** for half-depreciation.
  - Computes 20% Additional Depreciation for eligible assets, explicitly restricting it under the **New Regime (115BAC)**.

### Chapter 6: Capital Gains
- **Capital Gains Sub-Engine Location:** `src/lib/capitalGainsEngine.ts` and `src/lib/capitalGainsTypes.ts`
- **Data Models:** Uses `CapitalAssetRecord` mapping to `TotalCapitalGainsResult`.
- **Finance Act 2024 Integration:**
  - **Date Sensitivity:** Actively checks `transferDate` against July 23, 2024.
  - **Indexation:** Abolished explicitly for all transfers on/after 23-Jul-2024.
- **FVOC Overrides:**
  - **Section 50C:** Replaces Sale Price with SDV if SDV > 110%.
  - **Buy-Backs:** From 1-Oct-2024, forces FVOC to NIL (generating a clean capital loss) as proceeds are deemed dividend.
- **Exemptions (Section 54 series):**
  - Section 54 / 54F mathematically capped at the new strict maximum of ₹10 Crores.
  - Section 54EC capped at ₹50 Lakhs.
- **Rate Bucketing:** Outputs clean, segregated totals for `111A`, `112A`, `112`, and `STCG_NORMAL` so the main slab engine applies exact rates.

### Chapter 7: Income From Other Sources (IFOS)
- **IFOS Sub-Engine Location:** `src/lib/ifosEngine.ts` and `src/lib/ifosTypes.ts`
- **Data Models:** Uses `IfosRecord` combining Gifts, LIPs, and General Incomes.
- **Gift Taxation (Sec 56(2)(x)):**
  - **Monetary & Movable:** Aggregates separately. Taxes fully if aggregate > ₹50,000.
  - **Immovable:** Per-property checking. Taxes if SDV exceeds consideration by > ₹50,000 AND > 110% of consideration.
  - **Exemptions:** Marriage, relative, inheritance explicitly ignored.
- **Deductions (Sec 57):**
  - **Family Pension:** 1/3rd deduction rule explicitly dynamically capped at ₹15,000 (Old Regime) vs ₹25,000 (New Regime).
  - **Compulsory Acquisition Interest:** Flat 50% deduction.
- **Life Insurance Policies (Sec 56(2)(xiii)):**
  - Active date check: For policies issued >= 1-Apr-2023, if Annual Premium > ₹5L, maturity is forced into taxable IFOS.

### Chapter 8: Clubbing of Income
- **Clubbing Sub-Engine Location:** `src/lib/clubbingEngine.ts` and `src/lib/clubbingTypes.ts`
- **Data Models:** Uses `ClubbingRecord` to track third-party income attribution.
- **Minor Child (Sec 64(1A)):**
  - Actively checks for Skill/Talent, Manual Work, and Disability to completely ignore clubbing.
  - Automatically grants Sec 10(32) exemption up to ₹1,500 per minor child per annum.
- **Spouse (Sec 64(1)(ii)):**
  - Checks for technical/professional qualifications before clubbing remuneration from a concern where the taxpayer has a substantial interest.
- **Head Preservation:** The engine outputs clubbed totals meticulously segregated by original Head of Income (e.g., `totalHousePropertyClubbed`, `totalCapitalGainsClubbed`) to feed directly into the taxpayer's respective heads before set-off and carry forward rules apply.

## How to use this memory
When adding new rules (e.g., PGBP disallowances, set-off/carry-forward of losses, MAT/AMT), refer to this file to understand where the data should intercept the computation engine:
- If it's a rule that affects gross income amounts, modify `aggregateIncome`.
- If it's an allowance or deduction, modify `applyDeductions`.
- If it's a tax computation rate change, modify `calculateIndividualTax` or `calculateNonIndividualTax`.
- If it's an exception to surcharge/rebate, modify `applySurcharge` or `applyRebate87A`.
