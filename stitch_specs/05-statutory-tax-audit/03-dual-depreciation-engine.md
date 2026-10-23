# Module 5.3: Dual Depreciation Engine (Schedule II vs Sec 32)

> **Suite Accent Color:** Indigo / Cyan (`#6366f1` / `#06b6d4`)  
> **Route:** `/depreciation`  
> **Source Component:** [`src/pages/DepreciationModule.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/DepreciationModule.tsx)  
> **Core Engine:** [`src/lib/auditEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/auditEngine.ts)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** Har fixed asset par do alag-alag statutory laws ke tehat parallel depreciation compute karta hai:
  1. **Stream A (Companies Act 2013 - Schedule II):** Useful Life method (SLM ya WDV) component-wise.
  2. **Stream B (Income Tax Act 1961 - Section 32):** Block of Assets method at statutory rates (e.g. Plant 15%, Computers 40%, Buildings 10%).
- **Kyu karta hai:** Financial statements aur ITR calculation me dono alag calculate karne hote hain, aur inka difference **Deferred Tax Asset / Liability (DTA/DTL)** generate karta hai under AS 22 / Ind AS 12.
- **Kaise karta hai:** Asset additions $\le$ 180 days (half rate for IT) aur > 180 days (full rate) automatically split karta hai.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Fixed Asset Master & Addition Drawer
- **Asset Registration Form:**
  - Asset Name, Block of Asset (Plant, Furniture, Vehicles, Computers).
  - Date of Purchase / Put to Use (auto-evaluates 180-day rule).
  - Purchase Cost, Residual Value (5% as per Schedule II), Useful life in years.

### 2.2 Dual Comparative Depreciation Schedule
- **Side-by-Side Financial Columns:**
  | Asset Description | Opening WDV | Additions > 180D | Additions < 180D | Deletions | Co. Act Dep (Sch II) | Co. Act Closing WDV | IT Act Dep (Sec 32) | IT Act Closing WDV | Timing Diff (Sch II vs Sec 32) |
  |---|---|---|---|---|---|---|---|---|---|
  | CNC Milling Machine | 45,00,000 | 10,00,000 | 0 | 0 | 5,50,000 | 49,50,000 | 8,25,000 (15%) | 46,75,000 | -₹2,75,000 |
  | Office Laptops | 6,00,000 | 0 | 2,00,000 | 0 | 2,00,000 | 6,00,000 | 2,80,000 (40%/20%)| 5,20,000 | -₹80,000 |

### 2.3 Deferred Tax Calculator (AS-22 / Ind AS 12)
- Computes Net Timing Difference: e.g. `Depreciation as per Tax Act higher by ₹3,55,000`.
- Corporate Tax Rate: `25.17% (Sec 115BAA)`.
- **Deferred Tax Liability (DTL) to be created in P&L:** `₹89,353.50`.

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an enterprise Dual Depreciation (Companies Act Schedule II vs Income Tax Sec 32) & Deferred Tax Schedule.
- Top: Asset Addition & Fixed Asset Block register drawer with auto 180-day put-to-use rule detector.
- Main Table: Side-by-side comparative table showing Companies Act Depreciation vs Income Tax Act Depreciation with Closing WDV.
- Bottom Panel: AS-22 / Ind AS 12 Deferred Tax Asset/Liability (DTA/DTL) computation box with corporate tax rate selector.
```
