# Vaswani Return Enterprise — Codebase Architecture & Granular Memory Manual

> **Permanent Developer & Assistant Memory:** This manual maps all 10 core modules in the application with exact file paths, line number ranges, logic flows (*Kya karta hai, Kyu karta hai, Kaise karta hai*), schemas, and critical business rules. Refer directly to this manual to execute changes instantly without re-reading entire source files.

---

## Master Architecture & Module Directory

| # | Module Name | Primary UI Component | Core Engine / Lib | Backend API / Scripts | Primary DB / Storage |
|---|---|---|---|---|---|
| **1** | **GST Reco Engine (2B vs Books)** | `src/pages/Reconciliation.tsx`, `src/pages/Index.tsx` | `src/lib/reconciliation.ts`, `src/workers/reconciliation.worker.ts` | `server.js` | Local cache / IndexedDB / SQLite |
| **2** | **Vendor Party-Wise Report & Dispute Hub** | `src/components/PartyWiseReport.tsx` | `src/lib/partyWise.ts` | `server.js` | Aggregated in-memory state |
| **3** | **Excel Export Suite (Zero-Merge Architecture)** | Global Export Deck | `src/lib/fileParser.ts`, `src/workers/fileParser.worker.ts` | Node client-side streams | XLSX Workbooks (`XLSX.writeFile`) |
| **4** | **GST IMS & 2B Autopilot (12M Consolidator)** | `src/components/ImsMasterManager.tsx`, `src/components/Gstr2bMasterDownloader.tsx` | `src/lib/imsEngine.ts`, `gstr2b/autopilot.js` | `ims_routes.js`, `gstr2b_routes.js` | SQLite: `ims_batches`, `gstr2b_batches` |
| **5** | **GSTR-1 Downloader (Autopilot & 12M Outward)** | `src/components/Gstr1MasterDownloader.tsx` | `gstr1/autopilot.js`, `gstr1/fullYearExcel.js` | `gstr1_routes.js` | SQLite: `gstr1_batches`, `gstr1_invoices` |
| **6** | **GSTR-3B Working Sheet & 12-Month FY Matrix** | `src/components/Gstr3bWorkingSheet.tsx`, `src/components/FyMatrixView.tsx` | `src/lib/gstr3bEngine.ts`, `src/lib/gstr3bPdf.ts` | `server.js`, `returns_storage_routes.js` | SQLite: `clients`, `gstr3b_returns` |
| **7** | **TDS Consolidator & TRACES Reconciliation** | `src/pages/TdsReconciliation.tsx` | `src/lib/tdsEngine.ts`, `src/lib/tallyApi.ts` | `tds_routes.js` | SQLite: `tally_ledgers`, `tally_vouchers`, `tds_party_master` |
| **8** | **Tally Prime Direct XML Integration Engine** | `src/pages/TallyDirectImport.tsx`, `src/pages/TallyLedgerImport.tsx` | `src/lib/tallyApi.ts` | Direct HTTP Port `9000` | TallyPrime Native XML Server |
| **9** | **Income Tax Liability & Regime Engine** | `src/pages/IncomeTaxDashboard.tsx` | `src/lib/incomeTaxEngine.ts`, `src/server_lib/incomeTaxEngine.js` | `tax_routes.js` | SQLite: `Taxpayer_Profiles`, `Tax_Computations` |
| **10**| **Bank CMA Appraisal & Financial Statements** | `src/pages/BankCmaAppraisal.tsx`, `src/pages/CmaReport.tsx` | `src/lib/cmaEngine.ts`, `src/lib/tallyCmaApi.ts` | `server.js` | Tally Balance Sheet / P&L XML |
| **11**| **Statutory Audit & Tax Audit Clause 44** | `src/pages/AuditModule.tsx`, `src/pages/TaxAuditClause44.tsx` | `src/lib/auditEngine.ts` | `server.js` | Tally Daybook / Clause 44 Ledgers |

---

## 1. GST Reconciliation Engine (2B vs Books / PR)

### A. Purpose & Rationale
- **Kya karta hai:** Purchase Register (`PR` / Tally) aur GSTR-2B portal inward supplies ko match karta hai, discrepancies identify karta hai, aur taxable/tax difference derive karta hai.
- **Kyu karta hai:** Section 16(2)(aa) CGST Act ke compliance ke liye — taxpayer sirf wahi ITC claim kar sakta hai jo supplier ne GSTR-1 me file kiya ho aur 2B me reflect ho raha ho. Discrepancies audit notices aur interest liability prevent karti hain.
- **Kaise karta hai:** Multi-tier waterfall matching engine: exact match se shuru karke tolerance ($\le$ ₹2), fuzzy invoice cleaning, core invoice stripping, cross-state PAN fallback, aur standalone debit notes ko side-by-side reconcile karta hai.

### B. File Map & Exact Line Reference
- **Engine File:** [`src/lib/reconciliation.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts)
  - `cleanInvoiceNumber(inv)`: [Lines 137–150](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts#L137-L150) — Strips non-alphanumeric chars (`/[^A-Z0-9]/g`) aur leading zeros.
  - `extractCoreInvoiceNumber(inv)`: [Lines 108–136](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts#L108-L136) — Removes FY prefixes (`23-24/`, `2425-`), common series (`INV/`, `GST-`), returning bare serial number.
  - `normalizeGstin(gstin)`: [Lines 151–157](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts#L151-L157) — Uppercases and trims GSTIN.
  - `normalizePartyName(name)`: [Lines 212–273](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts#L212-L273) — Strips `PVT LTD`, `LIMITED`, `LLP`, brackets `(Cr)`, punctuation.
  - `reconcile(...)`: [Lines 276–780](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts#L276-L780) — Main hierarchical reconciliation engine.
    - **Step 0 (Prior FY Excluded Detection):** [Lines 308–343](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts#L308-L343) — Separates previous FY invoices into `priorTwoB` array.
    - **Inverted Index Construction:** [Lines 345–385](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts#L345-L385) — Maps `twoBByGstin`, `twoBByNormName`, and `twoBByPan`.
    - **Pass 1 (Exact Match):** [Lines 386–440](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts#L386-L440) — Same GSTIN + Exact Invoice No + Exact CGST/SGST/IGST/Taxable. Status: `Perfect Match`.
    - **Pass 2 (Tolerance Match $\le$ ₹2):** [Lines 441–485](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts#L441-L485) — Same GSTIN + Exact Inv No + Tax difference $\le$ tolerance. Status: `Matched (Rounded)` / `Value Mismatch`.
    - **Pass 3 (Date Diff Match):** [Lines 486–530](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts#L486-L530) — Same GSTIN + Exact Inv No + Same amounts, invoice dates differ. Status: `Matched (Diff Date)`.
    - **Pass 4 (Cleaned / Fuzzy Invoice No):** [Lines 531–590](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts#L531-L590) — Slashes, hyphens, and leading zeros stripped.
    - **Pass 5 (Core Invoice Serial Match):** [Lines 591–645](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts#L591-L645) — FY prefix stripped matching.
    - **Pass 6 (Rounding Mismatch $\le$ ₹1):** [Lines 646–680](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts#L646-L680) — Decimal round-off handling.
    - **Pass 7 (PAN / Multi-GSTIN Cross-State):** [Lines 681–720](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts#L681-L720) — Same vendor PAN with wrong state code (e.g. `27` vs `24`). Status: `Wrong GSTIN`.
    - **Pass 8 (Unmatched Remainder):** [Lines 721–780](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts#L721-L780) — Leftover PR tagged `Not in 2B`, leftover 2B tagged `Not in Books`, and `Prior FY (Excluded)`.
  - `getSummary(results)`: [Lines 781–810](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts#L781-L810) — Counts and tax totals per category.
  - `detectGstinIssues(results)`: [Lines 811–940](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/reconciliation.ts#L811-L940) — Identifies wrong GSTINs and party conflicts.

- **Web Worker:** [`src/workers/reconciliation.worker.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/workers/reconciliation.worker.ts)
  - Executes `reconcile()` off the main UI thread with `postMessage` progress updates.

- **Dashboard UI & Filter Tabs:**
  - [`src/pages/Reconciliation.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/Reconciliation.tsx#L850-L890) — Container holding Category Tabs, Results Table, and Party-Wise Report.
  - [`src/components/ResultsCategoryTabs.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/ResultsCategoryTabs.tsx) — Top category tab filter:
    - `all`: All records.
    - `perfect`: `Perfect Match` & `Matched (Diff Date)`.
    - `valueMismatch`: `Value Mismatch` (> ₹2 difference).
    - `missingIn2B`: Present in Books, absent in Portal.
    - `missingInPr`: Present in Portal, absent in Books.
    - `debitNotes`: Dedicated tab with `Receipt` icon, filtering main CDNR records + standalone PR/2B debit notes.
    - `excluded`: Prior FY records.
  - [`src/components/StatusBadge.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/StatusBadge.tsx) — Color badges for all match statuses including Amber badges for Debit Notes.

---

## 2. Vendor Party-Wise Report & Dispute Engine

### A. Purpose & Rationale
- **Kya karta hai:** Transaction-level reconciliation results ko vendor-wise consolidate karta hai, vendor-level net tax discrepancy nikalta hai, debit notes aapas me pair karta hai, aur communication notices create karta hai.
- **Kyu karta hai:** CAs aur Accountants invoices ko individually nahi balki vendor-wise handle karte hain — vendor payment hold karne ya GSTR-1 amendment maangne ke liye party-wise net position chahiye hoti hai.
- **Kaise karta hai:** GSTIN aur Normalized Legal Name ke basis par parties aggregate karta hai, 4-pass debit note engine execute karta hai, manual/force match actions support karta hai, aur WhatsApp/Email notices generate karta hai.

### B. File Map & Exact Line Reference
- **Logic Lib:** [`src/lib/partyWise.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/partyWise.ts)
  - `PartyInvoiceRow` & `PartySummary`: [Lines 6–98](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/partyWise.ts#L6-L98) — Type definitions.
  - `aggregateByParty(results, debitNotes, groupBy)`: [Lines 99–520](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/partyWise.ts#L99-L520)
    - **Party Key Resolution:** [Lines 120–170](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/partyWise.ts#L120-L170) — GSTIN as primary key with fallback to `NAME::normalizedName`. Merges temporary name-based party when GSTIN is later discovered.
    - **Standalone Debit Note Reconciler:** [Lines 231–445](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/partyWise.ts#L231-L445)
      - **Pass 1 (Note Number Matching):** [Lines 290–380](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/partyWise.ts#L290-L380) — Matches `p.invoiceNo` vs `t.invoiceNo` using exact, alphanumeric cleaned, and core serial comparison. Pairs Books and Portal DN side-by-side with `status: Perfect Match / Value Mismatch`.
      - **Pass 2 (Tax Amount Match within ₹2 + Date Proximity):** [Lines 381–420](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/partyWise.ts#L381-L420) — If note numbers differ, matches identical tax within ₹2 tolerance, breaking ties using closest invoice dates.
      - **Pass 3 & 4 (Unmatched Debit Notes):** [Lines 421–445](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/partyWise.ts#L421-L445) — Unpaired Books DN attached with `Debit Note (Books)` and unpaired 2B DN attached with `Debit Note (Portal)`. Attaches `rawResult` to allow UI manual matching.
    - **Party Totals & Status:** [Lines 446–520](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/partyWise.ts#L446-L520) — Computes `totals.igstDiff`, `cgstDiff`, `sgstDiff`, `totalDiff`, and derives `overall: 'Has Missing' | 'Has Mismatches' | 'All Matched'`.

- **UI Component:** [`src/components/PartyWiseReport.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/PartyWiseReport.tsx)
  - `PartyStatusFilter`: [Lines 40–50](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/PartyWiseReport.tsx#L40-L50) — Dropdown filter options: `all`, `allMatched`, `hasMissing`, `hasMismatches`, `debitNotes` (`Has Debit Notes`).
  - `handleManualMatch(inv)`: [Lines 320–365](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/PartyWiseReport.tsx#L320-L365) — Pairs selected Books row with 2B row across differences, appending synthetic result if index not in original array.
  - `handleForceMatch(inv)`: [Lines 366–410](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/PartyWiseReport.tsx#L366-L410) — Forces unmatched Books or Portal row into `Manual Match (Forced)`.
  - `handleAutoMatchParty(p)`: [Lines 411–460](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/PartyWiseReport.tsx#L411-L460) — Greedy 1-click automatic reconciler for a single party across invoices and debit notes.
  - `handleMergeParties()`: [Lines 570–620](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/PartyWiseReport.tsx#L570-L620) — Multi-ledger vendor consolidation into a single master party.
  - `handleSendNotice(p, channel)`: [Lines 621–700](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/PartyWiseReport.tsx#L621-L700) — Dispatches WhatsApp / Email notice listing missing invoices and mismatch amounts.

---

## 3. Excel Export Suite (Zero-Merge Architecture)

### A. Purpose & Rationale
- **Kya karta hai:** Reconciliation data ko multi-tab, audit-grade Excel workbooks me export karta hai (`Party_Wise_Report.xlsx`, `Monthly_Comparison.xlsx`, `Monthly_Difference_Sheets.xlsx`, etc.).
- **Kyu karta hai:** GST audit defense, management reporting, aur vendor communication ke liye.
- **CRITICAL ARCHITECTURAL RULE — STRICT ZERO MERGES (`ws['!merges'] = []`):**
  - Exports me **KAHI BHI CELL MERGE NAHI HONA CHAIYE**.
  - Merged cells Excel me Column Sorting, Filtering, formula reference (`VLOOKUP`, `XLOOKUP`), aur single-column selection ko completely block kar dete hain ("To do this, all the merged cells need to be the same size").
  - `removeAllMergesFromWorkbook(wb)` ensures zero `<mergeCell>` entries across all sheets.

### B. File Map & Exact Line Reference
- **Export Module:** [`src/lib/fileParser.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/fileParser.ts)
  - `removeAllMergesFromWorkbook(wb)`: [Lines 855–865](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/fileParser.ts#L855-L865) — Iterates all sheets and removes `ws['!merges']`.
  - `addCorporateHeader(ws, colCount, companyName, reportName, tabs)`: [Lines 867–920](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/fileParser.ts#L867-L920) — Injects 2-row header (Title in A1, Subtitle in A2, Navigation tabs from Col 8) without cell merges.
  - `appendExecutiveSummary(wb, ...)`: [Lines 943–1550](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/fileParser.ts#L943-L1550) — Metric cards and summary KPI tables without merges.
  - `exportToXlsx(...)`: [Lines 1697–1980](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/fileParser.ts#L1697-L1980) — Master multi-tab Excel generator:
    - Tab 1: `Dashboard`, Tab 2: `Executive Summary`, Tab 3: `Monthly Tax Comparison`, Tab 4: `All Invoices Working`, Tab 5: `Partywise Monthly Working`, Tab 6: `Partywise Mismatch Invoices`, Tab 7: `Party Mismatch Breakdown`, Tab 8: `3B vs 2B vs Books`, Tab 9: `Timing Reconciliation`, Tab 10: `Party Summary`, Tab 11: `Party Details`, Tab 12: `📖 Methodology & Legend`.
    - Line 1973: Calls `removeAllMergesFromWorkbook(wb)` before `XLSX.writeFile(wb, filename)`.
  - `appendPartyWiseSheets(wb, results, companyName, tabs, debitNotes)`: [Lines 2002–2420](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/fileParser.ts#L2002-L2420) — Party details generator:
    - Header Row: `PR: <Party> (<GSTIN>) | 2B: <Party> (<GSTIN>)` stored in Col A without merge.
    - Subtotal Row: `SUBTOTAL` in Col A, formulas in Cols F to K, without merge.
  - `exportMonthlyDiffSheets(...)`: [Lines 4708–4780](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/fileParser.ts#L4708-L4780) — 12 separate monthly tabs (`April_Diff` to `March_Diff`). Calls `removeAllMergesFromWorkbook(wb)` at line 4774.
  - `exportMonthlyComparison(...)`: [Lines 4784–5630](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/fileParser.ts#L4784-L5630) — 6-table FY tax matrix:
    - Table width: `TABLE_W = 5`, `COLS = 17` (Table 1: 5 cols, Gap: 1, Table 2: 5 cols, Gap: 1, Table 3: 5 cols).
    - Cols R & S (`Audit Remarks` & `Action Recommended`) permanently removed.
    - Title cleaned to `DIFFERENCE`.
    - Calls `removeAllMergesFromWorkbook(wb)` at line 5621.
  - `exportPartyWise(parties, filename, ...)`: [Lines 5631–6030](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/fileParser.ts#L5631-L6030) — Standalone party report. Calls `removeAllMergesFromWorkbook(wb)` at line 6024.
  - `exportClientTemplate()` & `export3BTemplate()`: [Lines 6034–6085](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/fileParser.ts#L6034-L6085) — Sanitized templates.

---

## 4. GST IMS (Invoice Management System) & GSTR-2B Autopilot (Full-Year 12M Consolidator)

### A. Purpose & Rationale
- **Kya karta hai:** 
  1. **GST IMS:** GST Portal se Inward Supplies JSON (B2B, CDNR) request karta hai, 20-minute waiting window manage karta hai, ready packages ingest karta hai, aur client decisions portal generate karta hai.
  2. **GSTR-2B Autopilot (Monthly & Full-Year 12 Months):** Ek single login/CAPTCHA me portal par navigate karke pooray 12 maheenon (April to March) ka GSTR-2B automatically loop me download karta hai, local SQLite DB me save karta hai, aur 8-sheet consolidated SectionWiseSummary Excel workbook generate karta hai.
- **Kyu karta hai:** 
  - Oct 2024 se GSTN ne IMS mandatory kiya hai — recipient taxpayer ko inward invoices par Action lena padta hai (`ACCEPT`, `REJECT`, `PENDING`).
  - Annual returns (GSTR-9/9C) aur yearly reconciliation ke liye CAs/Tax consultants ko poore saal ka consolidated 2B data chahiye hota hai jisme month-wise aur party-wise summary side-by-side matrices ke sath ho.
- **CRITICAL RULES:**
  - **STRICT PROHIBITION (PHASE 2 NEVER CLICKS GENERATE):** IMS Phase 2 me Playwright ko download link target karna hai; dubara `GENERATE JSON FILE` click nahi karna.
  - **ZERO MERGE RULE ON CONSOLIDATED EXCEL (`ws['!merges'] = []`):** Poori 8 sheets me kahin bhi cell merge nahi hona chahiye taaki sorting, filtering aur XLOOKUP break na ho. Defense-in-depth helper `removeAllMergesFromWorkbook(wb)` strictly strips any residual merges prior to serialization.
  - **1-LOGIN 12-MONTH AUTOPILOT WITH NON-BLOCKING RESILIENCE:** Taxpayer ko 12 alag alag CAPTCHA fill nahi karne padte; ek hi baar login hone ke baad portal session me April se March tak ka period select karke download karta hai. Agar kisi single month me portal delay ya glitch aaye, autopilot us month ko `FAILED` log karta hai, purana data preserve rakhta hai, aur remaining months continue karta hai (e.g. `11/12 Synced`).
  - **GOLDEN RULE DATA PRESERVATION ("New data download nahi toh purana data remove nahi hoga"):** Download failure ya timeout par existing 2B invoices aur batches kabhi delete ya truncate nahi hote.
  - **NIL RETURN EXPLICIT DISTINCTION:** Portal confirmed 0 records par hi batch ko `NIL_SYNCED` (total_invoices = 0) mark karta hai via `markGstr2bMonthNilSynced`; unconfirmed timeouts `PENDING` rehte hain.
  - **STRICT ON-SCREEN BACK BUTTON NAVIGATION:** Download screen se return search dashboard par wapas aane ke liye autopilot sirf aur sirf on-screen official `BACK` button target karta hai; breadcrumbs ya browser back navigation use nahi karta taaki portal session state intact rahe.
  - **UNIVERSAL DASHBOARD REDIRECT PROTOCOL:** Download screen ke alawa agar browser kisi bhi aise URL par detect hota hai jo `https://return.gst.gov.in/returns/auth/dashboard` nahi hai (jaise `quicklinks/returns`, `accessdenied`, `/error/`, services menu, ya home page), toh autopilot turant high-speed commit navigation se use `https://return.gst.gov.in/returns/auth/dashboard` par redirect karega aur dropdowns verify karega.
  - **CLEAN PROCESS CANCELLATION:** Modal close ya cancellation par `POST /api/gstr2b/cancel` Playwright Chromium instances ko Windows par cleanly kill karta hai.

### B. File Map & Exact Line Reference
- **Full-Year Consolidated Excel Engines:**
  - Backend: [`gstr2b/fullYearExcel.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr2b/fullYearExcel.js) — 8-sheet consolidated generator with Side-by-Side Monthly and Party-wise summary matrices (Cols AA-AW & AZ-BV).
  - Frontend: [`src/lib/gstr2bFullYearExport.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/gstr2bFullYearExport.ts) — TypeScript module with `generateGstr2bFullYearWorkbook` and `exportGstr2bFullYearExcel`.

- **Autopilot Automation:**
  - [`gstr2b/autopilot.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr2b/autopilot.js) — Single-month & 12-month autonomous loop (`isFullYear: true`). Auto-selects financial year and return period in portal dropdowns, downloads Excel, and generates `GSTR2B_SectionWiseSummary_{gstin}_{fy}.xlsx`.

- **Multi-Period Ingestion & DB Storage:**
  - [`gstr2b/parsers.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr2b/parsers.js) — Normalizes row-level Period column (`April, 2025` $\rightarrow$ `April 2025`).
  - [`gstr2b/db.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr2b/db.js) — `bulkSaveGstr2bInvoices` saves multi-period records and recalculates batch totals per period.

- **Backend Endpoints:**
  - [`gstr2b_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr2b_routes.js)
    - `GET /api/gstr2b/fy-summary?financialYear=...`: Cross-client 12-month sync matrix (`syncedCount`, `pendingMonths`, `total12mInvoices`).
    - `GET /api/gstr2b/export-full-year/:gstin?financialYear=...`: Streams consolidated 8-sheet workbook directly.
    - `GET /api/gstr2b/invoices/:gstin?financialYear=...`: Fetches all invoices across 12 months for drilldown.
    - `POST /api/gstr2b/portal-sync-browser`: Runs Playwright autopilot supporting `{ isFullYear: true }`.
  - [`ims_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/ims_routes.js) — IMS Phase 1 & Phase 2 portal sync, token review, and batch routes.

- **Frontend UI Components:**
  - [`src/components/Gstr2bMasterDownloader.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/Gstr2bMasterDownloader.tsx) — Segmented toggle (`Monthly` vs `Full FY 12 Months`), multi-file drag-and-drop, 12M sync progress badges (`12/12 Months`), and 1-Click `12M Excel` download button.
  - [`src/components/ImsMasterManager.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/ImsMasterManager.tsx) — IMS 20-min countdown timer and actions manager.

---

## 4.1 GSTR-1 Downloader (Autopilot) & 12-Month Outward Consolidator

### A. Purpose & Rationale
- **Kya karta hai:** 
  1. GSTR-1 outward supplies (B2B, B2CL, B2CS, CDNR, EXP) ko single filing period ya full 12-month FY consolidation loop me portal se autonomously request aur download karta hai.
  2. Single CAPTCHA entry ke baad background me 12 months ka generation queue request karta hai (`20-minute timer`), file ready hone par `Click here to download - File 1` target karke JSON/ZIP/Excel ingest karta hai.
  3. Outward line-item invoices ko SQLite DB (`gstr1_invoices`, `gstr1_batches`, `gstr1_summaries`) me persist karta hai aur 8-sheet consolidated SectionWiseSummary Excel workbook generate karta hai.
- **Kyu karta hai:** 
  - Annual return (GSTR-9/9C) reconciliation aur monthly GSTR-3B Table 3.1 liability verification ke liye official outward supplies ka complete data record hona zaroori hai.
- **CRITICAL RULES & PROTOCOLS:**
  - **2-STEP GENERATE & DOWNLOAD LIFECYCLE:**
    - **Step 1 (Check Download Link First):** Jab bhi GSTR-1 offline page open hota hai, Autopilot sabse pehle `Click here to download - File 1` link dhundta hai. Agar link mil jaye toh turant download initiate karta hai aur invoices persist karke batch ko `SYNCED` mark karta hai.
    - **Step 2 (Generate if Link Absent):** Agar `Click here to download - File 1` link present nahi hai, toh Autopilot `GENERATE JSON FILE TO DOWNLOAD` button ko double-time click karta hai, 20-minute countdown timer start karta hai, aur safe exit karta hai.
  - **ZERO MERGE RULE ON EXCEL EXPORTS (`ws['!merges'] = []`):**
    - Full-year GSTR-1 workbooks me kisi bhi sheet me cell merge allow nahi hai taaki column sorting, filtering aur XLOOKUP smooth rahein.
  - **NIL RETURN SUPPORT:**
    - Zero invoices wale files ingest hone par `markGstr1MonthSyncedEmpty` batch ko `SYNCED` mark karta hai taaki infinite loop na ho.

### B. File Map & Exact Line Reference
- **Core Engine & Routes:**
  - Playwright Autopilot: [`gstr1/autopilot.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr1/autopilot.js)
  - DB Layer: [`gstr1/db.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr1/db.js)
  - Parsers (JSON, Excel, ZIP): [`gstr1/parsers.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr1/parsers.js)
  - Full-Year Excel Generator: [`gstr1/fullYearExcel.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr1/fullYearExcel.js)
  - Backend Endpoints: [`gstr1_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/gstr1_routes.js)
- **Frontend Components:**
  - UI Downloader: [`src/components/Gstr1MasterDownloader.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/Gstr1MasterDownloader.tsx)
  - Hub Integration: [`src/pages/ReturnsDashboard.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/ReturnsDashboard.tsx) (Tab `gstr1_downloader`)

---

## 5. GSTR-3B Working Sheet & 12-Month FY Matrix

### A. Purpose & Rationale
- **Kya karta hai:** Monthly GSTR-3B tax computation karta hai (Outward 3.1, Inward ITC 4, Nil 5, Set-off 6) aur annual 12-month FY comparison matrix generate karta hai.
- **Kyu karta hai:** Accurate monthly return filing and payment of tax compliance under Section 49 & Rule 88A CGST Rules.
- **Kaise karta hai:** IMS/2B inward supplies se Table 4 populate karta hai, Rule 88A set-off hierarchy se credit consume karta hai, aur cash liability derive karta hai.

### B. File Map & Exact Line Reference
- **Core Engine:** [`src/lib/gstr3bEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/gstr3bEngine.ts)
  - `TaxBreakdown`, `OutwardSupplies`, `InwardSupplies`: [Lines 38–133](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/gstr3bEngine.ts#L38-L133)
  - `createEmptyMonthData(month, fy)`: [Lines 134–201](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/gstr3bEngine.ts#L134-L201)
  - `recalculateMonthData(data, settings)`: [Lines 229–656](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/gstr3bEngine.ts#L229-L656)
    - **Table 3.1 Outward & RCM Calculation:** [Lines 250–310](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/gstr3bEngine.ts#L250-L310) — Computes taxable value and tax on 3.1(a), 3.1(b), 3.1(c), 3.1(d) RCM, 3.1(e).
    - **Table 4 Net ITC:** [Lines 311–390](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/gstr3bEngine.ts#L311-L390) — Table 4(A) total minus Table 4(B) reversals equals 4(C) Net ITC.
    - **Table 6 Rule 88A Set-off Waterfall:** [Lines 400–560](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/gstr3bEngine.ts#L400-L560)
      1. IGST Credit exhausted first against IGST liability.
      2. Remaining IGST Credit allocated between CGST and SGST liability in optimal proportion.
      3. CGST Credit set off against remaining CGST liability, then IGST liability (never SGST).
      4. SGST Credit set off against remaining SGST liability, then IGST liability (never CGST).
      5. Remaining unpaid balance transfers to Table 6.1 Cash Payment.
  - `recalculateAnnualWorking(annual)`: [Lines 657–705](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/gstr3bEngine.ts#L657-L705) — Sums 12 months for FY Matrix.
  - `generateGstr3bPortalJson(...)`: [Lines 1477–1520](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/gstr3bEngine.ts#L1477-L1520) — Formats official GSTN filing payload.

- **Frontend Components:**
  - [`src/components/Gstr3bWorkingSheet.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/Gstr3bWorkingSheet.tsx) — Monthly working sheet UI with live tax set-off calculations.
  - [`src/components/FyMatrixView.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/FyMatrixView.tsx) — 12-month FY Matrix view.
  - [`src/pages/ReturnsDashboard.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/ReturnsDashboard.tsx) — Hub with 4 Tabs (`gstr3b_sheet`, `fy_matrix`, `ims_manager`, `2b_downloader`).

---

## 6. TDS Consolidator & TRACES Reconciliation

### A. Purpose & Rationale
- **Kya karta hai:** Tally Books expense transactions ko Form 26Q TRACES quarterly returns se reconcile karta hai, short deductions aur multi-ledger PAN discrepancies detect karta hai.
- **Kyu karta hai:** Income Tax Section 200(3), 201(1A) interest, aur 40(a)(ia) 30% expenditure disallowance ko prevent karne ke liye.
- **CRITICAL SECTION RESOLUTION HIERARCHY (NO DISCARD RULE):**
  - Tally transactions ko mistakenly drop hone se bachane ke liye 7-priority fallback hierarchy use hoti hai:
    1. **Priority 1:** Direct mapping in `Tally_Ledgers` DB (`mapped_section_code`).
    2. **Priority 2:** Regex extract section code from `tdsLedgerName` (e.g. `TDS 194C @1%`).
    3. **Priority 3:** Regex extract section code from `ledgerName` (e.g. `Contractor 194C`).
    4. **Priority 4:** Party Section Map (sections used by other vouchers of same party).
    5. **Priority 5:** Party Master DB mapped section code.
    6. **Priority 6:** Form 26Q (TRACES) section code reported for that party PAN.
    7. **Priority 7:** Default fallback to `'194C'` for any voucher with spend or actual TDS in Books.

### B. File Map & Exact Line Reference
- **Engine Logic:** [`src/lib/tdsEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tdsEngine.ts)
  - `computeBooksTdsLiability(...)`: [Lines 138–370](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tdsEngine.ts#L138-L370) — Evaluates voucher amounts against section thresholds (e.g. 194C ₹30,000 single / ₹1,00,000 aggregate, 194J ₹30,000).
  - `computeAdvanceTdsAudit(...)`: [Lines 409–580](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tdsEngine.ts#L409-L580) — Audits payment vouchers where advance payment exceeded expense voucher before quarter close.
  - `reconcileTds(...)`: [Lines 582–1475](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tdsEngine.ts#L582-L1475) — Matches Books vs 26Q by PAN + Section + Amount ($\le$ ₹5 tolerance). Categorizes into `Perfect Match`, `Value Mismatch`, `Missing in 26Q`, `Missing in Books`, `Section Mismatch`.
  - `exportTdsReport(...)`: [Lines 1478–1508](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tdsEngine.ts#L1478-L1508) — Excel export with zero merges (`delete ws['!merges']`).
  - `computeMultiLedgerPans(...)` & `exportMultiLedgerPanWorkbook(...)`: [Lines 1510–1700](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tdsEngine.ts#L1510-L1700) — Identifies vendors operating multiple ledger accounts under one PAN.

- **Backend Endpoints:** [`tds_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/tds_routes.js)
  - `POST /api/tds/parse-26q`: Parses TRACES 26Q Excel / text returns.
  - `POST /api/tds/fetch-tally-vouchers`: Connects to Tally port 9000 and fetches TDS transactions.
  - `GET /api/tds/ledgers`: Returns classified Tally expense and TDS ledgers.

- **UI Dashboard:** [`src/pages/TdsReconciliation.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/TdsReconciliation.tsx)

---

## 7. Tally Prime Direct Integration Engine

### A. Purpose & Rationale
- **Kya karta hai:** TallyPrime ke XML port (`http://localhost:9000`) se directly communicate karta hai, vouchers, ledgers, party groups, fixed assets, aur forensic daybook data fetch karta hai.
- **Kyu karta hai:** Manual Excel export/import ko eliminate karke 100% automated real-time data synchronization achieve karta hai.
- **Kaise karta hai:** XML queries build karta hai (`NOT $IsCancelled AND NOT $IsOptional`), Tally envelope me wrap karta hai, `fetch` via HTTP post dispatch karta hai, aur recursive XML parser se JavaScript objects banata hai.

### B. File Map & Exact Line Reference
- **API Lib:** [`src/lib/tallyApi.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tallyApi.ts)
  - `sendTallyRequest(xml, config)`: [Lines 419–479](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tallyApi.ts#L419-L479) — Dispatches HTTP POST to Tally port 9000 with timeout handling.
  - `pingTally(config)`: [Lines 480–490](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tallyApi.ts#L480-L490) — Tests connection liveness.
  - `fetchCompanyInfo(config)`: [Lines 491–526](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tallyApi.ts#L491-L526) — Returns active company name, GUID, and FY dates.
  - `fetchLedgerClassifications(...)`: [Lines 745–790](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tallyApi.ts#L745-L790) — Classifies ledgers into `Sundry Creditors`, `Sundry Debtors`, `Direct Expenses`, `Indirect Expenses`, `Duties & Taxes`.
  - `fetchVouchers(...)` & `parseTallyVouchers(...)`: [Lines 1004–1388](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tallyApi.ts#L1004-L1388) — Extracts voucher numbers, dates, party GSTIN, taxable amount, and tax breakdowns.
  - `fetchTdsTransactions(...)`: [Lines 1389–1703](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tallyApi.ts#L1389-L1703) — Filters payment and journal vouchers containing TDS ledgers.
  - `fetchPartyBalances(...)`: [Lines 1792–1942](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tallyApi.ts#L1792-L1942) — Vendor and customer closing balances for debtor/creditor ageing.
  - `fetchClause44Data(...)`: [Lines 2380–2450](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tallyApi.ts#L2380-L2450) — Extracts total spend classified into GST registered vs non-registered entities.

---

## 8. Income Tax Liability & Regime Engine

### A. Purpose & Rationale
- **Kya karta hai:** Old Regime vs New Regime (Section 115BAC) ka comparative tax liability calculation karta hai, rebates (Sec 87A), surcharges, marginal relief, aur corporate taxes compute karta hai.
- **Kyu karta hai:** ITR filing selection and tax planning under Finance Act amendments.
- **Fast Startup & Smart Cache Rule (`tax_routes.js`):** `incomeTaxEngine.ts` ko har server restart par recompile nahi karta. Sirf tab compile karta hai jab `src/server_lib/incomeTaxEngine.js` missing ho ya `incomeTaxEngine.ts` edit hua ho, with `{ stdio: 'ignore' }` to eliminate terminal noise.

### B. File Map & Exact Line Reference
- **Core Lib:** [`src/lib/incomeTaxEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/incomeTaxEngine.ts)
  - `calculateNonIndividualTax(...)`: [Lines 852–1138](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/incomeTaxEngine.ts#L852-L1138) — Computes tax for Domestic Companies (22% u/s 115BAA / 25% / 30%), Foreign Companies (40%), Partnership Firms/LLPs (30%), Co-operative Societies.
  - `calculateTaxLiability(...)`: [Lines 1139–1627](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/incomeTaxEngine.ts#L1139-L1627)
    - **New Regime Slabs (Sec 115BAC):** Standard deduction ₹75,000, Sec 87A rebate up to ₹7,00,000.
    - **Old Regime Slabs:** Slabs for Normal (<60), Senior (60-80), Super Senior (80+), Chapter VI-A deductions (80C, 80D, 80G, etc.).
    - **Surcharge & Marginal Relief:** Exact formula resolving sudden tax spikes near threshold boundaries (₹50L, ₹1Cr, ₹2Cr, ₹5Cr).
    - **Health & Education Cess:** 4% on (Tax + Surcharge - Relief).
  - `compareRegimes(...)`: [Lines 1628–1750](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/incomeTaxEngine.ts#L1628-L1750) — Side-by-side comparison recommending optimal regime.

- **Backend Route:** [`tax_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/tax_routes.js#L7-L25)
  - Conditional compile using file mtime check.
  - SQLite Tables: `Taxpayer_Profiles`, `Tax_Computations`.

---

## 9. Bank CMA Appraisal & Financial Statements

### A. Purpose & Rationale
- **Kya karta hai:** Tally P&L and Balance Sheet data se Credit Monitoring Arrangement (CMA) report, Maximum Permissible Bank Finance (MPBF), DSCR, aur 5-year projections generate karta hai.
- **Kyu karta hai:** Commercial bank working capital limit renewals, term loan approvals, aur project finance sanctions ke liye.

### B. File Map & Exact Line Reference
- **Core Lib:** [`src/lib/cmaEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/cmaEngine.ts)
  - `normalizeTallyToCma(...)`: [Lines 226–756](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/cmaEngine.ts#L226-L756) — Maps ledger balances to standard CMA heads (Current Assets, Current Liabilities, Net Working Capital, Term Liabilities, Net Worth).
  - `calculateCmaRatios(...)`: [Lines 757–1165](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/cmaEngine.ts#L757-L1165)
    - Current Ratio (Target $\ge$ 1.33:1)
    - Quick / Acid Test Ratio
    - Debt-Equity Ratio
    - Debt Service Coverage Ratio (DSCR Target $\ge$ 1.50)
    - Interest Coverage Ratio (ISCR)
    - MPBF Method I (75% of Working Capital Gap) & Method II (Working Capital Gap minus 25% of Current Assets)
    - Nayak Committee Turnover Method for MSMEs (20% of projected turnover as bank finance)
  - `generateCmaAppraisalReport(...)`: [Lines 1266–1350](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/cmaEngine.ts#L1266-L1350)

- **UI Pages:** [`src/pages/BankCmaAppraisal.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/BankCmaAppraisal.tsx), [`src/pages/CmaReport.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/CmaReport.tsx)

---

## 10. Statutory Audit & Tax Audit Clause 44

### A. Purpose & Rationale
- **Kya karta hai:** Standards on Auditing (SA 520, SA 530), Cash compliance audits, FIFO debtor/creditor ageing, aur Tax Audit Form 3CD Clause 44 spend analytics run karta hai.
- **Kyu karta hai:** Companies Act 2013 statutory audit reporting and Section 44AB Tax Audit compliance.

### B. File Map & Exact Line Reference
- **Core Lib:** [`src/lib/auditEngine.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/auditEngine.ts)
  - `computeFifoAgeing(...)`: [Lines 128–283](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/auditEngine.ts#L128-L283) — FIFO bill-wise settlement ageing (< 30 days, 30–60, 60–90, 90–180, > 180 days, > 3 years MSME default risk).
  - `runCashComplianceAudit(...)`: [Lines 719–830](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/auditEngine.ts#L719-L830)
    - Section 269ST: Single-day cash receipts $\ge$ ₹2,00,000.
    - Section 40A(3): Single-day cash expense payments > ₹10,000 (₹35,000 for transport).
  - `applyBenfordsLaw(...)`: [Lines 943–1012](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/auditEngine.ts#L943-L1012) — Forensic first-digit distribution check.
  - `runAuditSampling(...)`: [Lines 3240–3319](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/auditEngine.ts#L3240-L3319) — SA 530 statistical sample selection (Random, Systematic, Value-Weighted MUS).
  - `exportAuditToExcel(...)`: [Lines 1162–1955](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/auditEngine.ts#L1162-L1955)

- **UI Pages:** [`src/pages/AuditModule.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/AuditModule.tsx), [`src/pages/TaxAuditClause44.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/TaxAuditClause44.tsx)

---

## 11. Quick Reference Development & Build Rules

1. **Backend Routing Synchronization:**
   - Development entry: `server.js`.
   - Production bundled entry: `server.cjs` and `server.obfuscated.cjs`.
   - **MANDATORY RULE:** Whenever modifying `server.js`, `tax_routes.js`, `tds_routes.js`, `ims_routes.js`, or `gstr2b_routes.js`, **ALWAYS run `npm run obfuscate`** immediately to keep `server.cjs` synchronized.
2. **Type Safety:**
   - Always verify type safety using `npx tsc --noEmit`. Zero TypeScript errors allowed.
3. **Frontend Production Build:**
   - Build verified using `npm run build` (Vite production bundle).
4. **Port Allocation:**
   - Backend Express Server: `3001`
   - Frontend Vite Dev Server: `8080`
   - TallyPrime Native XML Port: `9000`
