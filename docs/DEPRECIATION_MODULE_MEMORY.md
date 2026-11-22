# Depreciation & Fixed Assets Register Memory File
This file serves as a persistent memory module for Fixed Assets depreciation schedules u/s Companies Act, 2013 and Section 32 of the Income Tax Act, 1961.

## Module Location
- **Engine Path:** `src/lib/depreciationEngine.ts`
- **Primary Pages:** `src/pages/DepreciationModule.tsx`, `src/pages/DepreciationAuditor.tsx`

## Core Schedulers & Logic
1. **Companies Act, 2013 (Schedule II) Schedule:**
   - **`calculateCompaniesAct(data)`**
   - Applies depreciation based on the **Useful Life** of assets (e.g. Buildings = 30 years, Computers = 3 years, Office Equipment = 5 years).
   - Computes both **Straight Line Method (SLM)** and **Written Down Value (WDV)** formulations.
   - Restricts maximum cumulative depreciation to **95%** of historical cost (preserving a mandatory 5% scrap residual value).
2. **Income Tax Act, 1961 (Section 32) Block Schedule:**
   - **`calculateIncomeTax(data)`**
   - Segregates assets into statutory blocks of assets (e.g. Plant & Machinery 15%, Computers 40%, Buildings 10%).
   - Computes opening block WDV + additions - deletions.
   - **180-Days Rule:**
     - Additions put to use for **>= 180 days** (purchased before October 4th in standard fiscal year) get full rate depreciation.
     - Additions put to use for **< 180 days** (purchased on or after October 4th) are capped at half rate (e.g. 7.5% instead of 15%).
   - **Disposals & Block Ceasing:**
     - If deletions/sale values exceed the entire block value, generates Short-Term Capital Gains (STCG) u/s Section 50.
     - If all assets in a block are sold but there is a remaining balance, generates a Short-Term Capital Loss (STCL) and marks the block as ceased.
   - **Additional Depreciation:** Handles 20% additional depreciation for manufacturing/production setups, also subject to the < 180 days half-rate limit.
3. **Depreciation Reconciliation (Deferred Tax):**
   - Maps Companies Act categories to Income Tax blocks to calculate the depreciation variance.
   - Variance (Companies Act Dep vs Tax Dep) is multiplied by the corporate tax rate (e.g. 30%) to compute **Deferred Tax Assets (DTA) / Liabilities (DTL)** u/s Accounting Standard 22 / Ind AS 12.
