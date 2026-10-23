# Module 7.1: Bank CMA Credit Appraisal & Ratio Engine

> **Suite Accent Color:** Cyan 500 (`#06b6d4`)  
> **Glow / Glass Border:** `rgba(6, 182, 212, 0.25)`  
> **Route:** `/bank-cma`  
> **Source Component:** [`src/pages/BankCmaAppraisal.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/BankCmaAppraisal.tsx)  
> **Core Engine:** [`src/lib/cmaEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/cmaEngine.ts)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** Tally Balance Sheet aur P&L ko Credit Monitoring Arrangement (CMA) standard heads me normalize karta hai, RBI ke Tandon Committee Method I & Method II MPBF (Maximum Permissible Bank Finance) calculate karta hai, 10 key underwriting ratios evaluate karta hai, aur qualitative credit warnings generate karta hai.
- **Kyu karta hai:** Commercial banks (SBI, Bank of Baroda, HDFC, ICICI, PNB) working capital cash credit (CC) limit renewal aur enhancement ke liye CMA data aur MPBF assessment mandatory mangte hain.
- **Kaise karta hai:**
  - Tally XML Trial Balance ingest karke 5 CMA categories me map karta hai: Current Assets (TCA), Current Liabilities (TCL), Net Working Capital (NWC), Term Liabilities, Net Worth (TNW).
  - **Tandon Committee Method I:** MPBF = 75% of Working Capital Gap (WCG = TCA - TCL).
  - **Tandon Committee Method II (RBI Standard):** MPBF = Working Capital Gap minus 25% of Total Current Assets. Borrower must fund 25% of TCA from long-term funds.
  - **Nayak Committee Method (MSMEs):** Working Capital Limit = 20% of Projected Annual Turnover.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Bank Working Capital MPBF Assessment Deck
1. **Total Current Assets (TCA):** e.g. `₹8,40,00,000` (Inventories, Debtors, Cash, Advances)
2. **Current Liabilities (Other than Bank Borrowings) (TCL):** e.g. `₹3,10,00,000` (Sundry Creditors, Expenses)
3. **Working Capital Gap (WCG = TCA - TCL):** e.g. `₹5,30,00,000`
4. **Minimum Stipulated Net Working Capital (25% of TCA u/s Method II):** e.g. `₹2,10,00,000`
5. **Maximum Permissible Bank Finance (MPBF Method II):** **`₹3,20,00,000 (Recommended Bank Limit)`** (Cyan Highlight)
6. **Nayak Committee Method Limit (20% of Turnover):** e.g. `₹3,60,00,000`

### 2.2 10 Key Financial Ratio Cards (Underwriter View)
A 5x2 card grid comparing Company Figures with RBI & Bank Benchmarks:
1. **Current Ratio:** `1.42x` (Benchmark: $\ge$ 1.33x) — `✓ Healthy` (Green)
2. **Quick / Acid Test Ratio:** `0.88x` (Benchmark: $\ge$ 0.80x) — `✓ Healthy` (Green)
3. **Debt-to-Equity Ratio (TOL/TNW):** `1.85x` (Benchmark: $\le$ 2.50x) — `✓ Acceptable` (Green)
4. **Debt Service Coverage Ratio (DSCR):** `1.72x` (Benchmark: $\ge$ 1.50x) — `✓ Strong Repayment` (Green)
5. **Interest Coverage Ratio (ISCR):** `3.45x` (Benchmark: $\ge$ 2.0x) — `✓ Comfortable` (Green)
6. **Debtor Collection Period:** `64 Days` (Target: $\le$ 75 Days) — `✓ Normal`
7. **Inventory Holding Period:** `82 Days` (Target: $\le$ 90 Days) — `✓ Optimal`
8. **Creditor Velocity:** `48 Days` — `✓ Timely Settlement`
9. **Net Profit Margin (%):** `6.4%` (Target: $\ge$ 4.0%) — `✓ Profitable`
10. **Return on Capital Employed (ROCE):** `18.2%` — `✓ High Efficiency`

### 2.3 Qualitative Underwriting Warning Banners
- Visual banner displaying automated credit alerts:
  - `⚠️ Caution: Inventory holding increased by 14 days compared to previous FY.`
  - `✓ Positive: Net Working Capital is positive (₹2.45 Cr) meeting RBI Method II guidelines.`
  - `✓ Positive: DSCR is above 1.50x indicating robust term loan debt-servicing ability.`

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an enterprise Bank CMA Credit Appraisal & MPBF Underwriting Cockpit.
- Top: Working Capital Gap and Tandon Committee Method II MPBF assessment card with recommended bank limit.
- Center Grid: 10 Key financial ratio cards with live gauge/status pills (Current Ratio, Quick Ratio, Debt-Equity, DSCR, ISCR, Holding Days).
- Bottom: Qualitative underwriter warning pills and 1-Click "Export 5-Year CMA Data Report (Excel & PDF)" button.
- Theme: Luminous crisp Slate-50 (#F8FAFC) canvas with elevated white frosted cards with glowing Cyan and Emerald accents.
```
