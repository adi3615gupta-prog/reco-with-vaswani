# Phase 25 Context: GSTR-1 Outward Return Preparation, V2.2 Excel Export, Direct Portal JSON Engine, Autonomous Uploader & TaxPower Scrutiny Suite

## Phase Overview
- **Phase Number:** 25
- **Slug:** `gstr-1-outward-return-preparation-v2-2-excel-export-direct-p`
- **Goal:** Enable end-to-end outward supply preparation, automated statutory bifurcation (B2B vs B2CL vs B2CS, bifurcated HSN B2B/B2C, Table 14/15 ECO), official 32-sheet V2.2 Excel export, 100% portal-compliant GSTR-1 JSON generation directly from books/Tally, 1-click autonomous Playwright upload into the GST Portal offline utility section, and integrate advanced enterprise capabilities reverse-engineered from **TaxPower GST** (All-In-One flat register ingestion, Tally UQC dictionary mapping, Table 13 document series gap analyzer, DRC-01B/DRC-01C detailed comparative audit exporters, configurable reconciliation settings knobs, Rule 88A mathematical cash liability set-off optimizer, and E-Way Bill vs GSTR-1 cross-checker).

---

## Locked Architectural & User Experience Decisions

### 1. Data Ingestion & Source Priority
- **Primary Automated Sources:**
  - **Tally Direct Bridge (Port 9000):** 1-Click extraction of Sales Vouchers, Credit Notes, and Debit Notes directly from active Tally company via zero-TDL HTTP XML API.
  - **Tally UQC / Unit Normalization Dictionary (`tallyUnitUqcMap`):** Automated translation of arbitrary Tally custom units (`PCS`, `NOS`, `BOX`, `KGS`, `MTR`, `DOZ`, `BAG`, `SET`, `ROLL`, `CAN`, `BTL`, `PAC`, `QTL`, `TUB`, `BND`, etc.) into official GSTN 3-letter UQC codes (`NOS-NUMBERS`, `KGS-KILOGRAMS`, `BOX-BOX`, etc.) to prevent Table 12 portal validation rejection.
  - **Tally Document Series Gap Analyzer (`TallyDocIssuedMapper`):** Automated extraction of prefix/suffix series, starting serial, ending serial, and gap count (flagged as cancelled vouchers) for Table 13.
  - **All-In-One Flat Sales Register Dropzone (`GSTR1-AllInOne.xlsx`):** Ingestion of 26-column flat sales register (`Sales` sheet) and Credit/Debit notes (`CDN` sheet) from any ERP/Excel, auto-bifurcating transactions into B2B, B2CL, B2CS, EXP, Nil, and Table 12 HSN without requiring users to fill 32 separate sheets manually.
- **In-App Editable Grid:** Accountants can edit values, adjust rounding differences, or add ad-hoc line items directly on screen prior to JSON export.

### 2. UI Placement: Dual-Mode Outward Cockpit (Tab 05)
- Tab `05. GSTR-1 Outward` in [`ReturnsDashboard.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/ReturnsDashboard.tsx) is upgraded to a unified dual-mode cockpit:
  - **Mode 1: Outward 12M Downloader & Matrix** (Existing portal downloader for historic/annual sales).
  - **Mode 2: Monthly GSTR-1 Working Sheet & Offline Preparation Workbench** (New high-density workbench for filing).
- Sticky sub-header switcher allows seamless toggling between downloading past returns and preparing current month's return.

### 3. Statutory Classifications & Compliance Defenses
- **Table 13 (Documents Issued):** Auto-analyzes numeric sequences in invoice numbers, identifies starting serial, ending serial, and gap count (flagged as cancelled), while offering manual row adjustments.
- **Table 12 (HSN Summary):** Strictly bifurcates items into `hsn_b2b` (supplies to registered buyers) and `hsn_b2c` (unregistered buyers). Enforces 6-digit HSN requirement for businesses with turnover > ₹5 Cr and 4-digit for $\le$ ₹5 Cr.
- **Table 5 vs Table 7:** Automatically enforces the ₹1,00,000 threshold for return periods post-August 2024 (Notification No. 12/2024-CT) for inter-state unregistered sales.
- **DRC-01B Real-Time Difference Guard:** In-app warning strip comparing GSTR-3B Table 3.1 vs GSTR-1 outward taxable supplies, alerting users to variances exceeding ₹50,000 / 20% to prevent automated DRC-01B notices.
- **Detailed Audit Comparison Exporters:**
  - `CompareGSTR3BWithGSTR1Detailed.xlsx`: Multi-period line-by-line comparison of Table 3.1 vs GSTR-1 outward liability.
  - `CompareGSTR3BWithBooksNew.xlsx`: Books vs 3B inward ITC comparison isolating "Excess ITC Claimed in 3B" (DRC-01C risk) and "Short ITC Claimed".

### 4. Autonomous Portal Upload & Silent Auto-Save Pipeline
- **1-Click Upload Button:** Styled with an Emerald/Teal gradient (`UploadCloud` icon) in the GSTR-1 action bar, identical to GSTR-3B.
- **Playwright Autopilot:**
  - Auto-fills credentials from SQLite Vault.
  - Displays top assistive banner for interactive CAPTCHA solving.
  - Uses authentic in-page DOM navigation to avoid SSO "Access Denied" errors.
  - Selects Financial Year & Month, clicks `SEARCH`.
  - Targets GSTR-1 / IFF card, clicks **`PREPARE OFFLINE`**, attaches `gstr1_portal_<month>.json`, and captures portal reference acknowledgment.
- **Silent Multi-Asset Storage:** Clicking *Save Working Sheet (Ctrl+S)* writes `gstr1_portal_<month>.json`, `gstr1_v22_<month>.xlsx`, and `gstr1_data_<month>.json` directly to `<dataPath>/<Client>/<FY>/<Month>/1 Working/` with zero browser download prompts.

### 5. Advanced Reconciliation Settings & Rule 88A Mathematical Optimizer
- **Configurable Reconciliation Knobs (from TaxPower `Options` model):**
  - Tolerance selection (₹1, ₹2, ₹5, ₹10).
  - Prior FY invoice inclusion/exclusion toggle.
  - Next period invoice timing difference toggle.
  - Filter out invoices where ITC Available = "N".
  - Invoice matching mode: Exact vs Fuzzy vs Core Serial.
  - RCM invoice inclusion toggle.
- **Rule 88A Mathematical Set-Off Optimizer:**
  - Exhausts IGST credit across IGST, then CGST, then SGST to minimize cash liability.
  - Optimizes cash payout and ledger balances according to Section 49 / Rule 88A legal sequence.
- **E-Way Bill vs GSTR-1 Cross-Checker:**
  - Cross-verifies GSTR-1 outward invoices against generated E-Way Bills to flag missing EWBs or omitted invoices.

---

## Technical Context & Discoveries from Forensic Analysis

### 1. Official GST Offline Tool (`GST Offline Tool.exe` v3.2.4)
- Runtime: NW.js / Express.js (Port 3010).
- Stringified JSON schema:
  - Top-level: `gstin`, `fp`, `gt`, `cur_gt`, `version: "GSTR1_V3.2.4"`, `hash`.
  - Core Tables: `b2b`, `b2ba`, `b2cl`, `b2cla`, `b2cs`, `b2csa`, `nil`, `exp`, `expa`, `cdnr`, `cdnra`, `cdnur`, `cdnura`, `at`, `ata`, `atadj`, `atadja`, `doc_issue`.
  - Bifurcated HSN: `"hsn": { "hsn_b2b": [ ... ], "hsn_b2c": [ ... ] }`.
  - ECO Tables: `"supeco": { "clttx": [], "paytx": [] }` and `"ecom": { "b2b": [], "b2c": [], "urp2b": [], "urp2c": [] }`.
- Official 32-sheet Excel template: `GSTR1_Excel_Workbook_Template_V2.2.xlsx`.

### 2. TaxPower GST (`D:\Magnum Infosystem\TaxPower GST`)
- **Tally Connector (`TaxPowerGSTTallyConnector.dll`):**
  - Communicates via `http://localhost:9000` (`application/x-www-form-urlencoded`).
  - Unit-to-UQC mapping table maps custom Tally units (`PCS`, `NOS`, `BOX`, `KGS`, etc.) to GSTN UQC codes.
  - Document series analyzer extracts prefix, starting/ending numbers, and sequence gaps for Table 13.
  - State resolver detects Place of Supply (POS) from party ledgers when blank.
- **Audit Comparison Templates:**
  - `CompareGSTR3BWithGSTR1Detailed.xlsx` (DRC-01B outward liability difference comparison).
  - `CompareGSTR3BWithBooksNew.xlsx` (DRC-01C inward excess vs short ITC comparison).
  - `GSTR1-AllInOne.xlsx` (Flat 2-sheet outward entry register).
- **Rule 88A API Schema (`GSTR3BOffSetLiabilityGSTNRequest`):**
  - Models `UtilITCReqVO`, `OpLiab2` (`igst_igst_amt`, `igst_cgst_amt`, `igst_sgst_amt`, `cgst_cgst_amt`, `cgst_igst_amt`, `sgst_sgst_amt`, `sgst_igst_amt`, `cess_cess_amt`), and `UtilCsshReqVO`.
- **Reconciliation Engine Configuration (`TaxPowerGST.dbo.Options`):**
  - Knobs for tolerance, prior FY, next period timing difference, ITC availability, document matching mode, and RCM.

---

## Invariant Fences
1. **Zero-Merge Rule:** Exported workbooks must have zero `<mergeCell>` entries (`ws['!merges'] = []`).
2. **SSO Access Denied Prevention:** Never navigate to `return.gst.gov.in` via `page.goto`; always use in-page DOM button clicks from `services.gst.gov.in`.
3. **Data Preservation Rule:** Download/upload failures must never delete or overwrite existing client working data.
4. **Zero-TDL Tally Requirement:** Never mandate installing `.tcp` or custom TDL files in Tally; keep all Tally communications over standard HTTP XML requests.
