# Module 2.3: TDS Consolidator & TRACES Form 26Q Reconciler

> **Suite Accent Color:** Indigo / Emerald (`#6366f1` / `#10b981`)  
> **Route:** `/tds-reco`  
> **Source Component:** [`src/pages/TdsReconciliation.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/TdsReconciliation.tsx)  
> **Core Engine:** [`src/lib/tdsEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tdsEngine.ts), [`tds_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/tds_routes.js)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** Tally Books ke expense aur payment vouchers ko TRACES Form 26Q returns se reconcile karta hai, short-deduction aur wrong-section errors detect karta hai, aur multi-ledger vendor PAN consolidation karta hai.
- **Kyu karta hai:** Income Tax Section 40(a)(ia) ke tehat agar TDS deduct ya deposit nahi hua toh 30% expenditure disallow ho jati hai, plus Section 201(1A) 1%/1.5% monthly penal interest lagti hai.
- **Kaise karta hai:**
  - 7-Priority Section Resolution Fallback (Mapped Section Code $\rightarrow$ TDS Ledger Regex $\rightarrow$ Expense Ledger Regex $\rightarrow$ Party Section Map $\rightarrow$ Party Master DB $\rightarrow$ Form 26Q Reported Section $\rightarrow$ Default 194C).
  - Matches by Vendor PAN + Section Code + Tax Amount ($\le$ ₹5 tolerance).
  - Multi-Ledger PAN detector flags vendors splitting bills across accounts to evade ₹30k/₹100k thresholds.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Top Audit Summary Cards (4 Cards)
1. **Total TDS Liability (Books):** e.g. `₹18,45,210`
2. **Total TDS Deposited (TRACES 26Q):** e.g. `₹18,12,450`
3. **Net Short Deduction / Disallowance:** e.g. `₹32,760 Disallowed` (Red alert)
4. **Multi-Ledger PANs Detected:** e.g. `6 Split PAN Entities` (Amber alert)

### 2.2 Section-Wise Breakdown Deck
Horizontal cards or tabs for major Income Tax TDS sections:
- `194C (Contractors / Sub-contractors @ 1% / 2%)`
- `194J (Professional & Technical Fees @ 2% / 10%)`
- `194I (Rent on Land & Building @ 10% / Machinery @ 2%)`
- `194H (Commission & Brokerage @ 5%)`
- `194Q (Purchase of Goods > ₹50 Lakhs @ 0.1%)`

### 2.3 Reconciliation Grid
- **Columns:**
  | Deductee PAN | Vendor Name in Books | Mapped Section | Books Spend | Books TDS | 26Q Section | 26Q Tax Deposited | Diff | Audit Status Badge | Action |
  |---|---|---|---|---|---|---|---|---|---|
  | AAACD1234F | Delta Logistics | 194C | 5,00,000 | 10,000 | 194C | 10,000 | ₹0.00 | `Perfect Match` | `View` |
  | AABCS5678K | Tech Systems | 194J | 1,00,000 | 2,000 | 194J | 10,000 | -₹8,000 | `Rate Mismatch (2% vs 10%)` | `Audit Flag` |
  | AAFCE9981M | Star Traders | 194C | 1,20,000 | 0 | — | 0 | -₹2,400 | `Missing TDS (Threshold Crossed)` | `Disallow 40(a)(ia)`|

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an enterprise TRACES Form 26Q TDS Reconciliation & Section 40(a)(ia) Audit screen.
- Top: 4 Metric cards for Total Books TDS, TRACES Deposited, Net Short Deduction, and Split PAN alerts.
- Mid-Section: Section-Wise tabs (194C, 194J, 194I, 194H, 194Q) with active section totals.
- Grid: Side-by-side comparison of Books expense vouchers vs TRACES 26Q challans with Audit Status pills (Perfect Match, Rate Mismatch, Missing Deduction).
- Theme: Luminous crisp Slate-50 (#F8FAFC) canvas with elevated white frosted cards with Indigo and Emerald accents, monospaced tabular currency figures.
```
