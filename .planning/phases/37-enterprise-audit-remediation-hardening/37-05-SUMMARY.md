# Phase 37 — Wave 3: Plan 37-05 Execution Summary

## Executive Overview
Plan 37-05 resolved critical autopilot crashes, concurrency collisions, Windows process leaks, and SQLite transaction overwrite issues across IMS, GSTR-1, GSTR-2B, and Notices suites; eliminated synthetic 70% timing data in GST notices in favor of factual cross-reconciliation with limitation verification; fixed GSTR-1 SEZ mandatory IGST, multi-rate invoice item grouping, and Table 6C Deemed Exports PDF parsing; and hardened Tally XML control character escaping and multi-leg DayBook voucher parsing.

All 11 test files (87 tests) passed cleanly (100% green).

---

## Key Achievements & Modifications

### 1. Task 37-05-T1: IMS, GSTR-1 & GSTR-2B Autopilot & SQLite Integrity
- **IMS (`ims_routes.js`)**:
  - Declared `gstinKey = String(gstin || '').trim().toUpperCase()` in `/api/ims/portal-sync-browser`.
  - Replaced undeclared `activeBrowserInstance` reference with per-client `activeBrowsers.get(gstinKey)` to eliminate `ReferenceError`.
  - Replaced prohibited `page.goto('https://return.gst.gov.in/imsweb/auth/imsDashboard')` WAF recovery with authentic top-navbar DOM clicks (`Services -> Returns -> Invoice Management System`).
  - Added reconciliation delete on full-period IMS JSON/Excel ingestion to purge ghost invoices deleted or cancelled on the portal.
- **GSTR-1 (`gstr1_routes.js`, `gstr1/db.js`, `gstr1/fullYearExcel.js`)**:
  - Enforced per-client browser session isolation in `activeBrowsers` map; returns HTTP 409 if a sync session is already active for the same GSTIN; cleanly removes entry in `finally`.
  - In `gstr1/db.js`: chained `recalculateGstr1Batch` and `resolve()` strictly inside `db.run('COMMIT')` callback to eliminate transaction read race conditions.
  - Added unique surrogate key differentiator (`${sec}_${pos}_${rt}_${idx}`) for B2CS, ADVREC, and DOC rows so multi-rate rows never overwrite on conflict.
  - Added `removeAllMergesFromWorkbook(wb)` in `gstr1/fullYearExcel.js` prior to workbook serialization to enforce strict Zero-Merge architecture.
- **GSTR-2B (`gstr2b_routes.js`, `gstr2b/db.js`, `gstr2b/autopilot.js`, `src/lib/gstr2bFullYearExport.ts`)**:
  - Scoped `DELETE FROM gstr2b_invoices` in `bulkSaveGstr2bInvoices` strictly to target `returnPeriod`, protecting prior periods seen in amendment rows (`B2BA`, `CDNRA`).
  - Added `requested_at INTEGER` schema column to `gstr2b_batches` and exported `markGstr2bMonthRequested`.
  - In `gstr2b/autopilot.js`, integrated 20-minute generation window detection setting `REQUESTED` batch state.
  - Upgraded `getMonthNameFromPeriod` in `gstr2bFullYearExport.ts` to parse 6-digit `MMYYYY` numeric periods before falling back to invoice dates.
- **UI & Process Cleanups (`Gstr1MasterDownloader.tsx`, `Gstr2bMasterDownloader.tsx`)**:
  - Fixed TypeScript `viewMode` state mismatch (`'MONTH' | 'FULL_YEAR'`) across both master downloaders.
  - Updated UI cancel handlers to pass `{ gstin: activeAutopilotClient.gstin }`.
  - In backend `/cancel` endpoints, added global cleanup across all active browsers and process PID termination via `taskkill /F /T /PID` on Windows.

### 2. Task 37-05-T2: GST Notices Scraping, Cross-Reconciliation & Limitation Checks
- **`notices/db.js`**:
  - Added `gst_notice_invoices` table to store itemized alleged invoices.
  - Added `saveNoticeInvoices` and `getNoticeInvoices` helpers.
  - Implemented `checkNoticeLimitation(fy, section, issueDate)` verifying statutory limitation deadlines under Section 73(10) / 74(10) and CBIC Notifications 09/2023 & 56/2023.
- **`notices_routes.js`**:
  - In `/api/notices/upload-pdf`: eliminated dummy `'27AAFCV1234A1Z5'` / ₹5,00,000 fallback; now returns HTTP 422 `{ success: false, requiresManualConfirmation: true, extractedText, partialFields }` when GSTIN regex extraction fails.
  - In `/api/notices/reconcile/:noticeId` & `/export/:noticeId`: queried `gst_notice_invoices` and `gstr3b_returns` and passed `allegedInvoices` and `threeBReturns` to `reconcileNoticeDiscrepancy()`.
  - In `/api/notices/attachment/download/:id`: enforced strict path containment (`path.resolve(filePath).startsWith(path.resolve(ALLOWED_NOTICES_DIR) + path.sep)`).
- **`src/lib/noticeReconciliation.ts` & `src/lib/noticeReplyGenerator.ts`**:
  - Deleted synthetic 70% timing-difference fallback; allocates unexplained demand to `UNEXPLAINED`.
  - Implemented Section 16(5) verification: validates GSTR-3B filing date `<= 2021-11-30`; if `> 2021-11-30`, rejects relief; if absent, flags as conditional with `requiresFilingDateVerification: true`.
  - Populated `statutoryGround` on every ledger invoice row for Excel annexure Column 14.
  - Injected time-barred preliminary objections into Form GST ASMT-11 and Form GST DRC-06 replies when notice exceeds statutory limitation.

### 3. Task 37-05-T3: GSTR-1 SEZ/Multi-Rate/PDF & Tally XML Hardening
- **GSTR-1 (`src/lib/gstr1Engine.ts`, `gstr1PdfParser.js`, `src/components/Gstr1WorkingSheet.tsx`)**:
  - Enforced mandatory IGST for SEZ supplies (`SEWP`, `SEWOP`) per Sec 7(5)(b) IGST Act (`isInterState = pos !== supplierState || isSezSupply`).
  - Grouped B2B, CDNR, and EXP multi-rate line items under the same invoice number into a single invoice object with multiple `itms[]` items (`num: 1, 2, ...`).
  - Fixed off-by-one indices in `gstr1PdfParser.js#L175-181` Table 6C Deemed Exports extraction (`taxable = cleanNum(deMatch[2])`, `igst = cleanNum(deMatch[3])`, `cgst = cleanNum(deMatch[4])`, `sgst = cleanNum(deMatch[5])`, `cess = cleanNum(deMatch[6])`).
  - In `Gstr1WorkingSheet.tsx`, accepted explicit GSTR-3B tax head components (`gstr3bOutwardIgst`, `cgst`, `sgst`, `cess`) instead of 50/25/25 split.
- **Tally XML (`src/lib/tallyXmlEngine.ts`, `src/pages/TallyXmlSuite.tsx`)**:
  - Updated `escapeXml()` to strip illegal XML 1.0 control characters (`/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g`) prior to entity escaping.
  - Upgraded `parseTallyDayBookXml()` to preserve ALL debit and credit ledger legs in `allEntries` and `legs` arrays without dropping CGST/SGST/Round-Off.
  - Added `parseTallyDayBookMultiXml()` returning `MultiEntryVoucher[]`.
  - In `TallyXmlSuite.tsx`, defaulted missing legs to `'Suspense'` on Excel paste to prevent silent voucher loss on XML generation.

---

## Verification Results
- `src/test/autopilotConcurrency.test.ts`: 4 passed
- `src/test/gstr2bAutopilotScrutiny.test.ts`: 2 passed
- `src/test/imsScrutiny.test.ts`: 13 passed
- `src/test/noticesCrossReconciler.test.ts`: 3 passed
- `src/test/noticesLimitation.test.ts`: 4 passed
- `src/test/noticesReplyGenerator.test.ts`: 3 passed
- `src/test/noticesScraper.test.ts`: 2 passed
- `src/test/gstr1Engine.test.ts`: 8 passed
- `src/test/gstr1V22Export.test.ts`: 6 passed
- `src/test/tallyXmlEngine.test.ts`: 29 passed
- `src/test/tallyXmlSuiteUi.test.tsx`: 13 passed
- **Total:** 11 test files, 87 passed, 0 failed.

