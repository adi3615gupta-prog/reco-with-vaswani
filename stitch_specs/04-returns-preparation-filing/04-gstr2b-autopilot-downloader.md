# Module 4.4: GSTR-2B Autopilot Downloader (12-Month Autonomous Loop)

> **Suite Accent Color:** Purple / Cyan (`#a855f7` / `#06b6d4`)  
> **Route:** `/returns` (Tab: `gstr2b_downloader`)  
> **Source Component:** [`src/components/Gstr2bMasterDownloader.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/Gstr2bMasterDownloader.tsx)  
> **Automation Engine:** [`gstr2b/autopilot.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr2b/autopilot.js)  
> **Export Engine:** [`gstr2b/fullYearExcel.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr2b/fullYearExcel.js)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** Single login/CAPTCHA session me GST portal me navigate karke poore 12 mahino (April se March) ka GSTR-2B data automatically loop me download karta hai, local SQLite me store karta hai, aur 8-sheet consolidated SectionWiseSummary Excel workbook generate karta hai.
- **Kyu karta hai:** 12 alag-alag mahino ke liye baar-baar portal par login karne aur 12 baar CAPTCHA bharne ki pareshani ko 100% khatam karta hai.
- **Critical Business & Safety Rules:**
  - **Golden Rule Data Preservation:** "New data download nahi toh purana data remove nahi hoga" — kisi month me failure ya timeout par purana data delete nahi hota.
  - **Non-Blocking Resilience:** Ek month glitch kare toh autopilot bache huye mahine continue karta hai (e.g. `11/12 Synced`).
  - **Nil Return Distinction:** Portal-confirmed 0 records par hi batch ko `NIL_SYNCED` mark karta hai.
  - **Official On-Screen Back Button:** Returns Search dashboard par aane ke liye sirf official on-screen `<button>` target karta hai; direct URL pushing 100% banned hai (Access Denied prevention).

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Mode Selector & Client Profile Deck
- Mode Switcher: Segmented Toggle:
  - `Single Month Download`
  - `Full FY 12 Months Autopilot Loop` (Default Recommended)
- Active Client Credentials Card:
  - Client Legal Name, GSTIN, Portal Username, Saved Password Indicator, Financial Year (`2024-25`).
- Primary Trigger Button:
  - `🚀 Launch 1-Click 12-Month Autopilot` (Large Purple Gradient Button).

### 2.2 Live Autopilot Progress & CAPTCHA Modal
- **In-Page CAPTCHA Dialog:**
  - Displays high-resolution portal CAPTCHA image with reload button.
  - Clean numeric input box with auto-focus.
  - "Submit & Start Autopilot" button.
- **Progress Bar & Month Tracker:**
  - Live animated progress bar: `Progress: 8 / 12 Months Synced (66%)`
  - Horizontal monthly badges:
    - April: `✓ Synced (142 Invoices)`
    - May: `✓ Synced (98 Invoices)`
    - June: `✓ NIL Synced (0 Invoices)`
    - July: `⏳ Fetching from Portal...` (Pulsing)
    - Aug - Mar: `Pending`

### 2.3 8-Sheet Consolidated Excel Export Deck
- Once download finishes, provides 1-Click Export:
  - `📥 Download Full-Year Consolidated 2B (8 Sheets)`
  - Sheet 1: `B2B` (Regular Invoices)
  - Sheet 2: `B2BA` (B2B Amendments)
  - Sheet 3: `CDNR` (Credit / Debit Notes Registered)
  - Sheet 4: `CDNRA` (CDNR Amendments)
  - Sheet 5: `ISD` (Input Service Distributor)
  - Sheet 6: `IMPG` (Import of Goods from SEZ/Overseas)
  - Sheet 7: `IMPS` (Import of Services)
  - Sheet 8: `ECO` (E-Commerce Operators)
  - **Side-by-Side Monthly & Party-Wise Matrices:** Embedded in Cols AA-AW & AZ-BV without merges.

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an autonomous 12-Month GSTR-2B Downloader & Ingestion Cockpit.
- Header: Client credentials banner, Financial Year selector, and Single-Month vs 12-Month Autopilot segmented toggle.
- Center Hero: Big "Launch 1-Click 12-Month Autopilot" action button with live Chromium status badge.
- Live Progress Tracker: Month-by-month visual sync badges (April through March) showing real-time synced invoice counts and Nil return pills.
- Modal: Clean embedded Portal CAPTCHA solver modal.
- Export Section: 1-Click "Download 8-Sheet Consolidated Excel" with zero-merge architecture guarantee.
```
