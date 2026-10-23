# Module 4.5: GSTR-1 Autopilot Downloader (12-Month Outward Loop)

> **Suite Accent Color:** Purple / Rose (`#a855f7` / `#f43f5e`)  
> **Route:** `/returns` (Tab: `gstr1_downloader`)  
> **Source Component:** [`src/components/Gstr1MasterDownloader.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/Gstr1MasterDownloader.tsx)  
> **Automation Engine:** [`gstr1/autopilot.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr1/autopilot.js)  
> **Export Engine:** [`gstr1/fullYearExcel.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr1/fullYearExcel.js)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** GST portal par filed GSTR-1 outward return ka poora 12-month data automatically loop me fetch karta hai (B2B, B2CL, B2CS, CDNR, Export, Nil, HSN Summary), local SQLite DB me store karta hai, aur consolidated outward sales workbook banata hai.
- **Kyu karta hai:** Annual reconciliation (GSTR-9 Table 4 & Table 5) aur Books Sales Register vs GSTR-1 turnover matching ke liye.
- **Kaise karta hai:** Playwright session me portal login karke har month ka GSTR-1 view/download page navigate karta hai aur complete multi-table dataset extract karta hai.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Outward Tables Coverage Deck
Visual badge chips highlighting all GSTR-1 sections synced:
- `4A, 4B, 6B, 6C - B2B Invoices`
- `5A, 5B - B2C (Large) Invoices`
- `7 - B2C (Small) Net Supplies`
- `9B - Credit / Debit Notes (Registered)`
- `9B - Credit / Debit Notes (Unregistered)`
- `6A - Export Invoices (EXP)`
- `8 - Nil Rated, Exempted & Non-GST Supplies`
- `12 - HSN-wise Summary of Outward Supplies`
- `13 - Documents Issued Summary`

### 2.2 Live Autopilot Progress & Monthly Badges
- Month-by-month progress tracker (April through March):
  - April: `✓ Synced (182 Invoices • ₹2.4 Cr Turnover)`
  - May: `✓ Synced (160 Invoices • ₹1.9 Cr Turnover)`
  - June: `⏳ Syncing Table 12 HSN...`
  - July - March: `Queued`

### 2.3 Consolidated Outward Matrix Export
- `📥 Download Full-Year GSTR-1 Consolidated Workbook`
- `📊 Send Outward Figures to GSTR-3B Table 3.1`
- `🔍 Reconcile with Books Sales Register`

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an autonomous GSTR-1 Outward Supply Downloader & Sales Matrix Dashboard.
- Header: Client credentials banner, FY picker, and Outward Tables coverage chips (B2B, B2CL, B2CS, CDNR, HSN).
- Hero: "Launch GSTR-1 12-Month Outward Autopilot" button with live progress indicator.
- Monthly Progress Grid: Horizontal cards from April to March showing Invoices count, Taxable turnover, and Net Tax.
- Export Section: 1-Click "Download Consolidated Outward Sales Excel" button with zero-merge architecture.
```
