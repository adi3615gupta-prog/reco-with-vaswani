# Module 4.3: GST IMS & 2B Manager (300+ Clients)

> **Suite Accent Color:** Purple / Emerald (`#a855f7` / `#10b981`)  
> **Route:** `/returns` (Tab: `ims2b`)  
> **Source Component:** [`src/components/ImsMasterManager.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/ImsMasterManager.tsx)  
> **API Routes:** [`ims_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/ims_routes.js)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** GSTN ke naye **Invoice Management System (IMS)** ke tehat recipient taxpayer ke portal par aane wale inward invoices (B2B, CDNR) ko ingest karta hai, multi-client pending actions list karta hai, aur bulk actions (`ACCEPT`, `REJECT`, `PENDING`) lene ke baad export JSON generate karta hai.
- **Kyu karta hai:** October 2024 se GSTN ne IMS mandatory kiya hai — agar supplier ne wrong invoice upload kiya ho aur recipient usko `REJECT` ya `PENDING` na kare, toh wo automatically accept hoke recipient ki liability/ITC me add ho jata hai.
- **Kaise karta hai:**
  - 20-minute waiting countdown timer manage karta hai jab portal par request place hoti hai.
  - Recipient Decision Deck: 1-click bulk action selectors.
  - Playwright Phase 2: strictly targets the ready download link without re-triggering generate.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Multi-Client Inward Action Roster
- Search bar across 300+ clients with pending action counters:
  | Client Legal Name | GSTIN | Inward Invoices | Pending Action | Accepted | Rejected | Portal Status | Action |
  |---|---|---|---|---|---|---|---|
  | Siddha Edibles Pvt Ltd | 27AABCS... | 142 | 18 Pending | 120 | 4 | `Ready to File` | `Open Decision Hub` |
  | Vaswani Steels LLP | 24AAGFV... | 89 | 89 Pending | 0 | 0 | `Needs Review` | `Open Decision Hub` |

### 2.2 Client IMS Decisioning Board
- **Filter Toolbar:** `All (142)`, `No Action Taken (18)`, `Accepted (120)`, `Rejected (4)`, `Pending (0)`.
- **Bulk Action Bar:** Checkbox All $\rightarrow$ Buttons: `Mark Selected ACCEPT` (Green), `Mark Selected REJECT` (Red), `Mark Selected PENDING` (Amber).
- **Invoice Cards / Grid:**
  - Supplier GSTIN, Supplier Legal Name, Invoice No, Invoice Date, Invoice Value, Taxable Amount, IGST, CGST, SGST, Action Taken Badge.
- **Export Toolbar:**
  - `Export IMS Action JSON for GST Portal Upload`
  - `Download IMS Decision Sheet (Excel)`

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an enterprise GST Invoice Management System (IMS) Decision Hub.
- Header: Client Switcher and 20-minute portal sync countdown timer widget.
- Action Toolbar: Bulk action selector with high-contrast buttons for ACCEPT (Emerald), REJECT (Rose), and PENDING (Amber).
- Core Table: Detailed Inward supplies grid showing Supplier Legal Name, Invoice Details, Taxable & Tax amounts, and Action Taken pill.
- Footer: Sticky bar with "Export IMS Action JSON" and "Download Excel Sheet" buttons.
```
