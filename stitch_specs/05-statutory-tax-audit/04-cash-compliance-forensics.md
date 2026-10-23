# Module 5.4: Cash Compliance & Forensic Auditor (269ST, 40A(3), Benford)

> **Suite Accent Color:** Indigo / Amber (`#6366f1` / `#f59e0b`)  
> **Route:** `/audit` (Tab: `forensics`)  
> **Core Engine:** [`src/lib/auditEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/auditEngine.ts)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** High-risk cash transactions ko audit karta hai, Section 269ST (₹2 Lakh cash receipt penalty), Section 40A(3) (₹10,000 cash expense disallowance), aur Benford's Law forensic distribution scanner run karta hai.
- **Kyu karta hai:** Income Tax audits me cash violations par 100% penalty lagti hai u/s 271DA aur expenditure disallow ho jata hai.
- **Kaise karta hai:** Tally Cash Book aur Daybook ko day-wise group karke single-day aggregate receipts/payments evaluate karta hai.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Cash Violation Audit Cards (3 Cards)
1. **Section 269ST Audit (Cash Receipts $\ge$ ₹2,00,000):**
   - Alert: e.g. `2 Flagged Violations (Potential Penalty: ₹4,50,000 u/s 271DA)`.
2. **Section 40A(3) Audit (Cash Payments > ₹10,000 / ₹35,000):**
   - Alert: e.g. `14 Inadmissible Vouchers (Disallowance: ₹2,10,000)`.
3. **Benford's Law Forensic Conformance:**
   - Score: `94.1% Natural Distribution (Low Risk of Fabricated Numbers)`.

### 2.2 Forensic Benford's Law Distribution Chart
- Bar chart comparing First-Digit Distribution (Digits 1 to 9):
  - Blue Bars: **Actual Ledger Occurrence**
  - Gray Dotted Curve: **Theoretical Benford Standard (Digit 1 = 30.1%, Digit 2 = 17.6% ... Digit 9 = 4.6%)**
  - Flags any digits with abnormal spikes (potential round-sum fraud).

### 2.3 Violation Details Grid
- Columns: Voucher Date | Voucher No | Party Name | Cash Amount | Nature of Transaction | Violation Type | Recommended Audit Qualification Note.

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an enterprise Cash Audit Compliance & Forensic Anomaly Detection screen.
- Top: 3 Critical violation alert cards (Section 269ST Cash Receipts, Section 40A(3) Disallowances, Benford's Law Conformance Score).
- Center: Benford's Law first-digit distribution bar chart comparing actual ledger data with theoretical standards.
- Bottom: Flagged cash transactions data grid with auditor qualification notes and 1-click audit working paper export.
```
