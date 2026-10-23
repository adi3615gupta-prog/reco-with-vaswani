# Module 1.4: Financial Statements Engine

> **Suite Accent Color:** Cyan 500 (`#06b6d4`)  
> **Route:** `/fin-statements`  
> **Source Component:** [`src/pages/FinancialStatements.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/FinancialStatements.tsx)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** Tally Trial Balance se automated Balance Sheet, Profit & Loss Account, aur Cash Flow Statement generate karta hai compliant with Schedule III of the Companies Act 2013.
- **Kyu karta hai:** Manual financial formatting me round-off errors aur Schedule III grouping mistakes ko zero karna.
- **Kaise karta hai:** Standard Schedule III grouping engine: Equity & Liabilities (Shareholders' funds, Non-current liabilities, Current liabilities) aur Assets (Non-current assets, Current assets) automatically map karta hai.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Tab Navigation
- Tab 1: **Balance Sheet** (Schedule III Part I)
- Tab 2: **Profit & Loss Statement** (Schedule III Part II)
- Tab 3: **Cash Flow Statement** (Indirect Method AS-3 / Ind AS 7)
- Tab 4: **Schedules & Notes to Accounts**

### 2.2 Financial Statement Layout
- **Statement Header:**
  - Company Legal Name, CIN, Registered Office Address.
  - "Balance Sheet as at 31st March 2025" (in ₹ Lakhs / Crores).
- **Two-Column Comparative Grid:**
  - Columns: `Particulars` | `Note No.` | `Figures as at 31-Mar-2025 (Current Year)` | `Figures as at 31-Mar-2024 (Previous Year)`.
- **Zero-Merge Export Bar:**
  - `Export Schedule III Excel`, `Export Signed Audit PDF`, `Print Financial Statements`.

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an enterprise Schedule III Financial Statements viewer screen.
- Layout: Top statement switcher tabs (Balance Sheet, P&L, Cash Flow, Notes).
- Grid: Classical 4-column accounting table with Notes reference, Current Year, and Previous Year comparative numbers in JetBrains Mono.
- Visuals: Pristine white elevated frosted card background, crisp hierarchy for Headings (Roman Numerals), Sub-headings, and Totals with double accounting underlines.
```
