# Module 6.1: Income Tax Liability & Regime Optimizer

> **Suite Accent Color:** Blue 500 (`#3b82f6`)  
> **Glow / Glass Border:** `rgba(59, 130, 246, 0.25)`  
> **Route:** `/income-tax`  
> **Source Component:** [`src/pages/IncomeTaxDashboard.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/IncomeTaxDashboard.tsx)  
> **Core Engine:** [`src/lib/incomeTaxEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/incomeTaxEngine.ts), [`tax_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/tax_routes.js)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** Individual, HUF, Partnership Firm/LLP aur Domestic Companies ke liye **Old Tax Regime vs New Tax Regime (Section 115BAC)** ka side-by-side comparative tax liability calculation karta hai, rebates (Sec 87A), surcharges, marginal relief, aur corporate taxes compute karta hai for **FY 2024-25 (AY 2025-26)** aur **FY 2025-26 (AY 2026-27)**.
- **Kyu karta hai:** Taxpayer ko ITR filing ke waqt optimal tax regime choose karna hota hai; manual calculation me marginal relief aur surcharge slab boundaries par sudden tax jumps miscalculate ho jate hain.
- **Kaise karta hai:**
  - New Regime: Standard deduction ₹75,000, Section 87A rebate up to ₹7,00,000 taxable income.
  - Old Regime: Slabs by age category (<60, 60-80 Senior, 80+ Super Senior), Chapter VI-A deductions (80C, 80D, 80G, etc.), Section 24(b) Home Loan interest.
  - Surcharge & Marginal Relief exact mathematical formula (resolves boundary jumps at ₹50L, ₹1Cr, ₹2Cr, ₹5Cr).
  - 4% Health & Education Cess.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Taxpayer Profile & Input Drawer
- **Taxpayer Entity Type:** Segmented radio buttons (`Individual`, `HUF`, `Firm / LLP`, `Domestic Company u/s 115BAA (22%)`, `Foreign Company`).
- **Assessment Year:** Toggle: `AY 2025-26 (FY 2024-25)` vs `AY 2026-27 (FY 2025-26)`.
- **Income Heads Accordion:**
  - Income from Salary (Gross Salary, Allowances)
  - Income from House Property (Rental income, Home loan interest)
  - Profits & Gains from Business or Profession (PGBP)
  - Capital Gains (STCG 111A @ 20%, LTCG 112A @ 12.5% above ₹1.25L)
  - Income from Other Sources (Interest, Dividends)
- **Chapter VI-A Deductions Deck (Old Regime Only):**
  - Section 80C (EPF, PPF, ELSS up to ₹1,50,000)
  - Section 80D (Health Insurance self & parents)
  - Section 80CCD(1B) (NPS additional ₹50,000)
  - Section 80G (Donations)

### 2.2 Side-by-Side Regime Comparison Board
Two high-contrast side-by-side cards:

| Dimension | OLD TAX REGIME | NEW TAX REGIME (Sec 115BAC) | Difference / Savings |
|---|---|---|---|
| **Gross Total Income** | ₹28,50,000 | ₹28,50,000 | — |
| **Total Deductions / Exemptions** | (₹3,75,000) | (₹75,000 Standard Dep) | ₹3,00,000 extra in Old |
| **Total Taxable Income** | **₹24,75,000** | **₹27,75,000** | +₹3,00,000 |
| **Base Income Tax** | ₹5,55,000 | ₹4,72,500 | -₹82,500 |
| **Rebate u/s 87A** | ₹0.00 | ₹0.00 | — |
| **Surcharge & Marginal Relief** | ₹0.00 | ₹0.00 | — |
| **Health & Education Cess (4%)** | ₹22,200 | ₹18,900 | -₹3,300 |
| **TOTAL TAX LIABILITY** | **₹5,77,200** | **₹4,91,400** | **₹85,800 SAVINGS** |
| **FINAL RECOMMENDATION** | `Higher Tax` | `OPTIMAL CHOICE (SAVE ₹85,800)` (Emerald Badge) | |

### 2.3 Marginal Relief Visualizer
- Curve displaying taxable income near surcharge boundaries (₹50,00,000 to ₹52,00,000) showing how marginal relief restricts incremental tax to the incremental income above the threshold.

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an enterprise Income Tax Regime Optimizer (Old vs New Regime Section 115BAC) calculator.
- Left Panel: Structured income input drawer (Salary, House Property, PGBP, Capital Gains, Chapter VI-A deductions).
- Right Panel: Prominent side-by-side Regime Comparison Board (Old Regime vs New Regime) with an authoritative "Optimal Choice" recommendation badge.
- Interactive: Surcharge & Marginal Relief visualizer chart showing boundary relief at ₹50 Lakhs / ₹1 Crore.
- Bottom: 1-Click "Export Tax Computation Sheet (PDF & Excel)" button.
```
