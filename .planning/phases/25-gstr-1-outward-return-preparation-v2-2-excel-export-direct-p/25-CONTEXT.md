# Phase 25 Context: GSTR-1 Outward Return Preparation, V2.2 Excel Export, Direct Portal JSON Engine & Autonomous Uploader

## Phase Overview
- **Phase Number:** 25
- **Slug:** `gstr-1-outward-return-preparation-v2-2-excel-export-direct-p`
- **Goal:** Enable end-to-end outward supply preparation, automated statutory bifurcation (B2B vs B2CL vs B2CS, bifurcated HSN B2B/B2C, Table 14/15 ECO), official 32-sheet V2.2 Excel export, 100% portal-compliant GSTR-1 JSON generation directly from books/Tally, and 1-click autonomous Playwright upload into the GST Portal offline utility section without opening the official desktop tool.

---

## Locked Architectural & User Experience Decisions

### 1. Data Ingestion & Source Priority
- **Primary Automated Sources:**
  - **Tally Direct Bridge (Port 9000):** 1-Click extraction of Sales Vouchers, Credit Notes, and Debit Notes directly from active Tally company.
  - **Sales Register Excel Dropzone:** Ingestion of multi-column client sales registers with auto-mapping for GSTIN, Invoice No, Invoice Date, Value, POS, Tax Rate, and HSN.
- **In-App Editable Grid:** Accountants can edit values, adjust rounding differences, or add ad-hoc line items directly on screen prior to JSON export.

### 2. UI Placement: Dual-Mode Outward Cockpit (Tab 05)
- Tab `05. GSTR-1 Outward` in [`ReturnsDashboard.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/ReturnsDashboard.tsx) is upgraded to a unified dual-mode cockpit:
  - **Mode 1: Outward 12M Downloader & Matrix** (Existing portal downloader for historic/annual sales).
  - **Mode 2: Monthly GSTR-1 Working Sheet & Offline Preparation Workbench** (New high-density workbench for filing).
- Sticky sub-header switcher allows seamless toggling between downloading past returns and preparing current month's return.

### 3. Table 13 Document Series & Bifurcated Table 12 HSN
- **Table 13 (Documents Issued):** Auto-analyzes numeric sequences in invoice numbers, identifies starting serial, ending serial, and gap count (flagged as cancelled), while offering manual row adjustments.
- **Table 12 (HSN Summary):** Strictly bifurcates items into `hsn_b2b` (supplies to registered buyers) and `hsn_b2c` (unregistered buyers). Enforces 6-digit HSN requirement for businesses with turnover > ₹5 Cr and 4-digit for $\le$ ₹5 Cr.
- **Table 5 vs Table 7:** Automatically enforces the ₹1,00,000 threshold for return periods post-August 2024 (Notification No. 12/2024-CT) for inter-state unregistered sales.

### 4. Autonomous Portal Upload & Silent Auto-Save Pipeline
- **1-Click Upload Button:** Styled with an Emerald/Teal gradient (`UploadCloud` icon) in the GSTR-1 action bar, identical to GSTR-3B.
- **Playwright Autopilot:**
  - Auto-fills credentials from SQLite Vault.
  - Displays top assistive banner for interactive CAPTCHA solving.
  - Uses authentic in-page DOM navigation to avoid SSO "Access Denied" errors.
  - Selects Financial Year & Month, clicks `SEARCH`.
  - Targets GSTR-1 / IFF card, clicks **`PREPARE OFFLINE`**, attaches `gstr1_portal_<month>.json`, and captures portal reference acknowledgment.
- **Silent Multi-Asset Storage:** Clicking *Save Working Sheet (Ctrl+S)* writes `gstr1_portal_<month>.json`, `gstr1_v22_<month>.xlsx`, and `gstr1_data_<month>.json` directly to `<dataPath>/<Client>/<FY>/<Month>/1 Working/` with zero browser download prompts.

---

## Technical Context & Discoveries from `gst_offline_tool` Reverse Engineering
1. **Reverse-Engineered Official Payload:**
   - Binary reverse-engineering of `GST Offline Tool.exe` (Release 3.2.4) revealed that the official offline tool is an NW.js/Express.js (Port 3010) application.
   - Exact stringified JSON schema:
     - Top-level: `gstin`, `fp`, `gt`, `cur_gt`, `version: "GSTR1_V3.2.4"`, `hash`.
     - Core Tables: `b2b`, `b2ba`, `b2cl`, `b2cla`, `b2cs`, `b2csa`, `nil`, `exp`, `expa`, `cdnr`, `cdnra`, `cdnur`, `cdnura`, `at`, `ata`, `atadj`, `atadja`, `doc_issue`.
     - Bifurcated HSN (Release 3.2.2+): `"hsn": { "hsn_b2b": [ ... ], "hsn_b2c": [ ... ] }`.
     - E-Commerce Operator Tables (w.e.f Jan 2024):
       - Table 14 / 14A: `"supeco": { "clttx": [ ... ], "paytx": [ ... ] }` & `"supecoa": ...`
       - Table 15 / 15A: `"ecom": { "b2b": [ ... ], "b2c": [ ... ], "urp2b": [ ... ], "urp2c": [ ... ] }` & `"ecoma": ...`

2. **Statutory Threshold & Classification Rules:**
   - **B2CL vs B2CS (Notification No. 12/2024-CT):**
     - Return periods starting August 2024: Inter-state unregistered supply invoice value threshold dropped from ₹2,50,000 to **₹1,00,000**.
     - Invoices > ₹1,00,000 inter-state unregistered must be reported in **Table 5 (B2CL)** invoice-wise.
     - Invoices $\le$ ₹1,00,000 inter-state or any intra-state unregistered supplies must be reported in **Table 7 (B2CS)** consolidated by POS and tax rate.
   - **Bifurcated HSN Rules:**
     - Mandatory split: B2B supplies (`hsn_b2b`) and B2C supplies (`hsn_b2c`).
     - AATO > ₹5 Cr: Mandatory 6-digit HSN.
     - AATO $\le$ ₹5 Cr: Mandatory 4-digit HSN.
   - **Delinked Credit/Debit Notes (Rel 2.4+):**
     - Note number, Note date, Note type (`C`/`D`), Note value, POS, Reverse charge, and differential tax rate percentage without linking original invoice number/date.
   - **40% Tax Rate (Rel 3.2.3):**
     - Added for online money gaming and specified supplies.

3. **Multi-Asset Storage & Direct Upload Architecture:**
   - Store generated GSTR-1 artifacts directly under `<dataPath>/<Client>/<FY>/<Month>/1 Working/`:
     - `gstr1_portal_<month>.json`
     - `gstr1_v22_<month>.xlsx` (Official V2.2 32-sheet workbook)
     - `gstr1_csvs_<month>.zip` (31 section-wise CSVs)
     - `gstr1_data_<month>.json`
   - Autonomous Playwright uploader navigates to Returns Dashboard, selects period, navigates to GSTR-1 `PREPARE OFFLINE`, and attaches the JSON file.

---

## Invariant Fences
1. **Zero-Merge Rule:** Exported workbooks must have zero `<mergeCell>` entries (`ws['!merges'] = []`).
2. **SSO Access Denied Prevention:** Never navigate to `return.gst.gov.in` via `page.goto`; always use in-page DOM button clicks from `services.gst.gov.in`.
3. **Data Preservation Rule:** Download/upload failures must never delete or overwrite existing client working data.
