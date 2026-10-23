# Module 5.1: SA 530 Analytical Audit Sampling Hub

> **Suite Accent Color:** Indigo 500 (`#6366f1`)  
> **Route:** `/audit`  
> **Source Component:** [`src/pages/AuditModule.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/AuditModule.tsx)  
> **Core Engine:** [`src/lib/auditEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/auditEngine.ts)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** ICAI ke Standards on Auditing (SA 530 - Audit Sampling) ke compliance ke liye statistical aur non-statistical sample selection run karta hai, materiality threshold calculate karta hai, high-value outliers ko 100% testing ke liye isolate karta hai, aur audit working paper generate karta hai.
- **Kyu karta hai:** Lakhon transactions ko manually check karna impossible hota hai; statutory auditors ko peer review aur NFRA audit defense ke liye robust sampling methodology dikhani hoti hai.
- **Kaise karta hai:**
  - Materiality Benchmark: Turnover ka % ya PBT ka % set karta hai.
  - Outlier Isolation: Har transaction jo Tolerable Misstatement se upar hai, auto-flag hoti hai.
  - Stratified & Monetary Unit Sampling (MUS): Value-weighted sampling distribution.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Sampling Parameters Control Panel
- **Materiality Benchmark Input:**
  - Benchmark Base: Dropdown (`Turnover`, `Profit Before Tax`, `Total Assets`, `Gross Expenditure`).
  - Overall Materiality Percentage: Slider / input (e.g., `0.5% of Turnover = ₹12,50,000`).
  - Performance Materiality: e.g., `75% of OM = ₹9,37,500`.
  - Tolerable Misstatement (TM): e.g., `₹5,00,000`.
- **Sampling Methodology Selector:**
  - `Monetary Unit Sampling (MUS / Value-Weighted)` (Recommended)
  - `Stratified Random Sampling`
  - `Systematic Interval Sampling`
  - `Haphazard Sampling`

### 2.2 Population & Sample Metrics Deck (4 Cards)
1. **Total Population:** e.g. `18,420 Vouchers • ₹48.2 Crores`
2. **High-Value Items (100% Testing):** e.g. `24 Vouchers • ₹18.6 Crores (38.5% of Population)` (Red)
3. **Selected Sample Size:** e.g. `85 Vouchers Sampled • ₹12.4 Crores` (Indigo)
4. **Audit Coverage Achieved:** e.g. `64.3% Total Population Covered` (Emerald)

### 2.3 Sample Working Paper Data Table
- **Columns:**
  | Sample # | Voucher Date | Voucher No | Account Head | Party Name | Voucher Amount | Sampling Stratum | Audit Verification Checkbox | Auditor Observations / Query |
  |---|---|---|---|---|---|---|---|---|
  | S-01 | 14-May-24 | PV-102 | Machinery Repairs | Apex Heavy Eng | 12,50,000 | 100% High-Value | `[✓ Verified]` | Bill and PO inspected. Approved. |
  | S-02 | 19-Jul-24 | JV-881 | Legal & Professional | Sharma & Co | 6,50,000 | MUS Sample | `[✓ Verified]` | TDS u/s 194J verified. |

### 2.4 Export Action
- `Export SA 530 Audit Working Paper (Excel & PDF with Auditor Sign-off Stamp)`

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an enterprise SA 530 Analytical Audit Sampling & Working Paper generator.
- Top Panel: Audit Materiality Threshold configuration (Turnover %, Performance Materiality, Tolerable Error) and Sampling Technique selector.
- Metric Deck: 4 Cards showing Total Population, 100% High-Value Outliers, Sample Size, and % Audit Coverage.
- Data Table: Audit sample working paper with auditor verification checkboxes, stratum tags, and query notes.
- Footer: Action buttons to export formal audit working paper with firm stamp and signature block.
```
