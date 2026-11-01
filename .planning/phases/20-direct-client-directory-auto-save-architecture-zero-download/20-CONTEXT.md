# Phase 20: Direct Client Directory Auto-Save Architecture (Zero-Download Prompt Workflow)

## Phase Goal
Eliminate intrusive browser "Save As / Where to save" file picker dialogs when clicking "Save Working Sheet" (or pressing `Ctrl+S`) in GSTR-3B Working Sheet and Returns Dashboard (`src/pages/ReturnsDashboard.tsx`). 

Ensure that all generated artifacts and supporting statutory bases:
1. **3B Working**: Date/time-stamped snapshot + canonical latest monthly & annual GSTR-3B Excel workbook, official PDF statement, GSTN portal JSON payload, and master working state.
2. **R1 Base**: GSTR-1 Outward sales base schedules (B2B, B2C, SEZ, Advances, Nil/Exempt) feeding Table 3.1.
3. **2B Base**: GSTR-2B Inward supplies base schedules (B2B, B2BA, Inward RCM) feeding Table 4 ITC.
4. **Credit Notes Base**: Outward & Inward CDNR credit notes schedule adjusting sales and ITC.
5. **Reversal Base**: ITC Reversals & Ineligible schedule (Table 4B1, 4B2 Rule 37/38/42/43, Sec 17(5) blocked, Sec 16(4) time-barred, Deferred bills).

are persistently and silently written directly into structured subfolders under the client's respective directory structure on the local disk/server:
```
gst_returns_data / <Client_Folder> / <FY> / <Month> / 3B Working /
   ├── 3B Working /
   │     ├── <Client> - GSTR-3B Working <Month>_<Timestamp>.xlsx
   │     ├── gstr3b_working_<Month>.xlsx
   │     ├── <Client> - GSTR-3B Working <Month>_<Timestamp>.pdf
   │     ├── gstr3b_working_<Month>.pdf
   │     ├── <Client> - GSTR-3B Portal Upload <Month>_<Timestamp>.json
   │     ├── gstr3b_portal_<Month>.json
   │     ├── <Client> - GSTR-3B Data <Month>_<Timestamp>.json
   │     └── gstr3b_data_<Month>.json
   ├── R1 Base /
   │     ├── <Client> - GSTR-1 Outward Base <Month>_<Timestamp>.xlsx
   │     ├── gstr1_base_<Month>.xlsx
   │     └── gstr1_base_<Month>.json
   ├── 2B Base /
   │     ├── <Client> - GSTR-2B Inward Base <Month>_<Timestamp>.xlsx
   │     ├── gstr2b_base_<Month>.xlsx
   │     └── gstr2b_base_<Month>.json
   ├── Credit Notes Base /
   │     ├── <Client> - Credit Notes Register <Month>_<Timestamp>.xlsx
   │     ├── credit_notes_base_<Month>.xlsx
   │     └── credit_notes_base_<Month>.json
   └── Reversal Base /
         ├── <Client> - ITC Reversals & Ineligible Schedule <Month>_<Timestamp>.xlsx
         ├── reversal_base_<Month>.xlsx
         └── reversal_base_<Month>.json
```
via the existing `/api/returns/save-full-bundle` backend pipeline, while retaining explicit manual download actions ("Download GSTR-3B Working Excel", "Print Official PDF", "Generate GSTN Portal JSON") for users who explicitly choose to save an ad-hoc local copy in their browser's download folder.

---

## Architectural & User Context

### 1. User Problem Statement
Currently, when a tax professional clicks the **"Save Working Sheet"** button (or presses `Ctrl+S`) in the GSTR-3B Working Sheet:
1. The frontend executes synthetic anchor tag clicks (`excelA.click()`, `jsonA.click()`) and invokes `exportGstr3bMonthPdf(..., { autoDownload: true })`.
2. This immediately triggers 3 browser download prompts. In Chrome, Edge, and other browsers configured to "Ask where to save each file before downloading", 3 successive Windows file dialogs pop up asking "Where to save?". If the browser is configured to download automatically, 3 loose files get dumped into the generic `C:\Users\<User>\Downloads\` folder.
3. This creates friction, annoyance, and confusion because the user clicked "Save", expecting the application to manage the filing records and all supporting bases (R1 base, 2B base, credit notes base, reversal base) organized in their respective client folders (`gst_returns_data/<Client>/<FY>/<Month>/3B Working/`) rather than downloading loose files to their personal downloads folder.
4. Meanwhile, the backend (`returns_storage_routes.js` via `/api/returns/save-full-bundle`) already has the complete logic to save directly into the client directory. Expanding it to build the structured subfolder hierarchy (`3B Working/`, `R1 Base/`, `2B Base/`, `Credit Notes Base/`, `Reversal Base/`) provides a complete, self-contained audit package for every month.

### 2. Required Behavior
1. **Decoupled "Save" Action:**
   - Clicking "Save Working Sheet" or pressing `Ctrl+S` will:
     - Generate 3B Excel buffer (Base64)
     - Generate PDF buffer (Base64) with `autoDownload: false`
     - Generate GSTN Portal JSON payload
     - Package R1 base, 2B base, Credit Notes base, and Reversal base data
     - Post the full bundle to `/api/returns/save-full-bundle`
     - Persist local working state to SQLite & `localStorage`
     - **NEVER** trigger browser anchor downloads (`a.click()`) or PDF file prompts.
2. **Structured Month Base Folders:**
   - The backend creates and populates:
     - `<Month>/3B Working/3B Working/`
     - `<Month>/3B Working/R1 Base/`
     - `<Month>/3B Working/2B Base/`
     - `<Month>/3B Working/Credit Notes Base/`
     - `<Month>/3B Working/Reversal Base/`
3. **Instant Toast with Native OS Explorer Folder Launch:**
   - On save success, display a clean, non-intrusive toast notification:
     - Title: `Saved directly to Client Folder!`
     - Description: `Saved to: gst_returns_data/<Client>/<FY>/<Month>/3B Working/`
     - Action button: `Open Folder` (calls `/api/returns/open-folder` to reveal the folder in Windows Explorer).
4. **Preserved Explicit Download Actions:**
   - The dedicated buttons:
     - "Download GSTR-3B Working Excel" (`handleExportExcel`)
     - "Print Official PDF" (`handleExportPdf`)
     - "Generate GSTN Portal JSON" (`handleDownloadJson`)
     will continue to trigger browser downloads as intended when an accountant specifically needs a standalone copy outside the client archive.

---

## Scope Fences

### In-Scope
- Update `handleManualSave()` in [`src/pages/ReturnsDashboard.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/ReturnsDashboard.tsx): remove synthetic `excelA.click()`, set `autoDownload: false` in `exportGstr3bMonthPdf`, remove synthetic `jsonA.click()`.
- Update `exportGstr3bMonthPdf` in [`src/lib/gstr3bPdf.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/gstr3bPdf.ts) to support silent PDF buffer/base64 generation when `autoDownload: false`.
- Update `/api/returns/save-full-bundle` in [`returns_storage_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/returns_storage_routes.js):
  - Create `<dataPath>/<client>/<fy>/<month>/3B Working/`
  - Build subfolders: `3B Working/`, `R1 Base/`, `2B Base/`, `Credit Notes Base/`, `Reversal Base/`
  - Write respective workbooks, PDFs, JSON files, and supporting schedules into each subfolder
  - Maintain root backward compatibility files for legacy lookups
- Verify toast feedback displays exact directory path and working "Open Folder" action.
- Verify end-to-end build (`npm run build`) and test execution.

### Out-of-Scope
- Changing the underlying 12-month FY matrix or Rule 88A calculation logic.
- Altering the dedicated "Download GSTR-3B Working Excel" or "Print Official PDF" buttons (they remain as manual download options).
- Changing database schema or non-returns modules.
