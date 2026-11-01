# Phase 20: Research & Technical Architecture

## 1. Problem Diagnosis
In [`src/pages/ReturnsDashboard.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/ReturnsDashboard.tsx), when a user clicks the **"Save Working Sheet"** button (or triggers the global `Ctrl+S` shortcut) via `handleManualSave()`:
- Lines 398–406: Synthetically creates an `<a>` element with the generated Excel blob and calls `.click()`.
- Lines 414–417: Calls `exportGstr3bMonthPdf` with `autoDownload: true`, which internally calls `doc.save(...)`.
- Lines 430–436: Synthetically creates another `<a>` element with the Portal JSON blob and calls `.click()`.

### Why does this ask "Where to save?"
Whenever a browser executes anchor click download or `doc.save(...)`:
1. If the user's browser (Chrome, Edge, Brave, etc.) has the setting *"Ask where to save each file before downloading"* enabled, the browser intercepts every programmatic download and opens the OS Native File Picker Dialog ("Save As").
2. Because 3 files are triggered concurrently, 3 successive modal dialogs open, interrupting the user and demanding file destinations.
3. If the browser setting is disabled, the files are silently downloaded into the generic `Downloads` folder, cluttering the user's personal drive rather than being placed in the client's official accounting folder.

## 2. Server-Side Direct File Pipeline & Folder Taxonomy
The backend writer at `POST /api/returns/save-full-bundle` in [`returns_storage_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/returns_storage_routes.js) can resolve the month folder and construct the structured subfolder hierarchy:
- Root Month Path: `<dataPath>/<safeFirm>/<fyClean>/<monthFolder>/`
- Parent Working Path: `<dataPath>/<safeFirm>/<fyClean>/<monthFolder>/3B Working/`
- Subfolders:
  1. `3B Working/`
     - `<safeFirm> - GSTR-3B Working <monthClean>_<dateTimeStamp>.xlsx`
     - `gstr3b_working_<monthClean>.xlsx`
     - `<safeFirm> - GSTR-3B Working <monthClean>_<dateTimeStamp>.pdf`
     - `gstr3b_working_<monthClean>.pdf`
     - `<safeFirm> - GSTR-3B Portal Upload <monthClean>_<dateTimeStamp>.json`
     - `gstr3b_portal_<monthClean>.json`
     - `<safeFirm> - GSTR-3B Data <monthClean>_<dateTimeStamp>.json`
     - `gstr3b_data_<monthClean>.json`
  2. `R1 Base/`
     - Table 3.1 sales supporting schedules (B2B, B2C, SEZ, Advances, Nil/Exempt, Outward amendments).
     - Generated from `workingData.months[m].outward` and SQLite `gstr1_invoices`.
     - Saved as `<safeFirm> - GSTR-1 Outward Base <monthClean>_<dateTimeStamp>.xlsx` and `gstr1_base_<monthClean>.json`.
  3. `2B Base/`
     - Table 4 ITC inward supporting bills from SQLite `gstr2b_invoices` (B2B, B2BA, Inward RCM).
     - Saved as `<safeFirm> - GSTR-2B Inward Base <monthClean>_<dateTimeStamp>.xlsx` and `gstr2b_base_<monthClean>.json`.
  4. `Credit Notes Base/`
     - CDNR outward credit notes (reducing sales) and inward debit/credit notes (adjusting ITC).
     - Saved as `<safeFirm> - Credit Notes Register <monthClean>_<dateTimeStamp>.xlsx` and `credit_notes_base_<monthClean>.json`.
  5. `Reversal Base/`
     - ITC Reversals & Ineligible schedule generated from SQLite `gstr3b_itc_allocations` & `workingData.months[m].inward` (Rule 37 180-days [4(B)(2)], Rule 38/42/43 [4(B)(1)], Section 17(5) blocked [4(D)(1)], Section 16(4) time-barred [4(D)(2)], and Deferred bills).
     - Saved as `<safeFirm> - ITC Reversals & Ineligible Schedule <monthClean>_<dateTimeStamp>.xlsx` and `reversal_base_<monthClean>.json`.

## 3. Backward Compatibility
To prevent any disruption to existing readers (such as `ReturnsTrackingMaster` or `ReturnsDashboard` when loading saved working papers):
- In addition to writing into `3B Working/3B Working/`, canonical files (`working.json`, `gstr3b_working_<monthClean>.xlsx`, `gstr3b_<monthClean>.json`) will continue to be maintained at the month folder level `<dataPath>/<safeFirm>/<fyClean>/<monthFolder>/`, ensuring seamless lookups across the entire application.

## 4. Toast Notification & Folder Launcher
- When the save completes, the API returns the path to the newly populated `3B Working` folder (`monthWorkingDir`).
- The frontend toast displays:
  - Title: `"Saved directly to Client Folder!"`
  - Description: `"Saved to: gst_returns_data/<Client>/<FY>/<Month>/3B Working/ (All 5 Bases)"`
  - Action button: `"Open Folder"` calling `POST /api/returns/open-folder` with `folderPath: monthWorkingDir`, which executes `explorer.exe` on Windows to immediately reveal all 5 subfolders.
