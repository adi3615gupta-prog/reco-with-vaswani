---
phase: 37-enterprise-audit-remediation-hardening
plan: 06
subsystem: frontend-stability-and-build-gate
tags: [indexeddb, virtualization, pagination, xss-prevention, type-safety, vitest, vite-build]

requires:
  - 37-01
  - 37-02
  - 37-03
  - 37-04
  - 37-05
provides:
  - Runtime crash fixes in ResultsTable, GstNoticesDashboard, RecoHistoryModal, FileUploadZone, ColumnMapper
  - High-contrast executive text fix in OutputDashboard and CSS chart ID/color sanitization in chart.tsx
  - Manual GSTIN override edit preservation in GSTVerification -> Reconciliation/Index
  - Asynchronous IndexedDB persistence (idbStorage.ts) replacing 5MB-capped sessionStorage serialization
  - Removed global window.console monkey-patching in TallyDirectImport.tsx; 100-row table pagination in OutputDashboard and TallyLedgerImport
  - Heartbeat throttling from 2s to 30s in Index.tsx
  - Scoped diagnostic error stack disclosure with local path redaction in App.tsx GlobalErrorBoundary
  - Zero TypeScript compiler errors across entire app and test suite (`tsc -p tsconfig.app.json --noEmit`)
  - 100% passing Vitest test suite (53/53 test files, 404/404 tests passed)
  - Clean Vite production bundle build (3,527 modules transformed)
affects: []

actuals:
  tasks: 3
  test_suites_passed: 53
  total_tests_passed: 404

key-files:
  created:
    - src/lib/idbStorage.ts
  modified:
    - src/App.tsx
    - src/vite-env.d.ts
    - src/lib/api.ts
    - src/lib/gdrive.ts
    - src/lib/reconciliation.ts
    - src/lib/partyWise.ts
    - src/lib/imsEngine.ts
    - src/lib/gstr3bEngine.ts
    - src/lib/auditEngine.ts
    - src/lib/finStatements.types.ts
    - src/lib/ifcChecksEngine.ts
    - src/lib/incomeTaxTypes.ts
    - src/lib/incomeTaxEngine.ts
    - src/lib/monthlyAuditEngine.ts
    - src/lib/tallyApi.ts
    - src/lib/firebaseAuditSync.ts
    - src/lib/excel/builders/partyWiseExport.ts
    - src/lib/excel/builders/templates.ts
    - src/lib/excel/parsers/gstr1Parser.ts
    - src/lib/excel/parsers/parseFile.ts
    - src/components/AppShell.tsx
    - src/components/ResultsTable.tsx
    - src/components/OutputDashboard.tsx
    - src/components/ui/chart.tsx
    - src/components/FileUploadZone.tsx
    - src/components/ColumnMapper.tsx
    - src/components/ImsMasterManager.tsx
    - src/components/MonthlyBreakdown.tsx
    - src/components/PartyWiseReport.tsx
    - src/components/SettingsModal.tsx
    - src/components/StatusBadge.tsx
    - src/components/RecoHistoryModal.tsx
    - src/components/tax/SalaryDetailForm.tsx
    - src/pages/Index.tsx
    - src/pages/Reconciliation.tsx
    - src/pages/TallyDirectImport.tsx
    - src/pages/TallyLedgerImport.tsx
    - src/pages/Hub.tsx
    - src/pages/Login.tsx
    - src/pages/BankCmaAppraisal.tsx
    - src/pages/DepreciationAuditor.tsx
    - src/pages/DepreciationModule.tsx
    - src/pages/ForensicAudit.tsx
    - src/pages/PipelineWizard.tsx
    - src/pages/ReturnsDashboard.tsx
    - src/pages/TaxAuditClause44.tsx
    - src/pages/GstNoticesDashboard.tsx
    - src/pages/MonthlyAuditSuite.tsx
    - src/test/landingPage.test.tsx
    - src/test/auditTrail.test.ts
    - src/test/cmaAndAuditCompliance.test.ts
    - src/test/monthlyAuditExcel.test.ts
    - src/test/monthlyAuditPdf.test.ts

key-decisions:
  - "Migrated heavy reconciliation caches from 5MB sessionStorage to async IndexedDB (`np_reco_db` / `reco_cache` via `src/lib/idbStorage.ts`) to prevent QuotaExceededError and UI serialization freezes"
  - "Eliminated global `window.console` overriding in `TallyDirectImport.tsx` in favor of scoped `appendLog` state callback"
  - "Unified `AppRoute` definition between `AppShell.tsx` and `Index.tsx` including `'tally-xml'` and `'notices'` routes"
  - "Restored complete `handleDirectTallyImport` handler body in `Index.tsx`"
  - "Eliminated duplicate symbol exports (`PARTY_STATUS_FILL`, `PARTY_STATUS_HEADER`) by importing directly from `src/lib/excel/styles/palette.ts`"
  - "Added `parseJsonSafe` checking `res.ok` before `.json()` across `GstNoticesDashboard.tsx` and `RecoHistoryModal.tsx`"

requirements-completed:
  - BUG-01
  - FE-08
  - FE-09
  - FE-10
  - FE-11
  - FE-12
  - FE-13
  - FE-15
  - FE-17
  - FE-18
  - FE-19
  - FE-20
  - TS-BUILD-GATE
---

# Phase 37 Plan 06 Summary: Frontend Hardening, Memory Persistence & Build Gate

## Executive Overview
Plan 37-06 completed the final wave of Phase 37 remediation, fixing critical frontend crashes, security hygiene gaps, UX contrast/overwrite bugs, main-thread serialization freezes, and all TypeScript & test failures across the entire repository.

## Key Modifications & Remediations
1. **Runtime Crashes & UX Fixes (Task 37-06-T1)**:
   - Removed undefined `visibleCount` reference in [`src/components/ResultsTable.tsx`](file:///e:/backup/full%20and%20final/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/ResultsTable.tsx).
   - Fixed invisible `text-white` table cells on light executive backgrounds (`text-slate-900`, `group-hover:bg-slate-100`) in [`src/components/OutputDashboard.tsx`](file:///e:/backup/full%20and%20final/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/OutputDashboard.tsx).
   - Updated `onApplyAll` in [`src/pages/Reconciliation.tsx`](file:///e:/backup/full%20and%20final/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/Reconciliation.tsx) to preserve user-edited GSTIN values from `GSTVerification.tsx`.
   - Sanitized dynamic CSS IDs and colors in [`src/components/ui/chart.tsx`](file:///e:/backup/full%20and%20final/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/ui/chart.tsx).
   - Added 50MB file size guard, extension validation, and `title`/`subtitle`/`onUpload` prop compatibility in [`src/components/FileUploadZone.tsx`](file:///e:/backup/full%20and%20final/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/FileUploadZone.tsx).
   - Disambiguated empty/duplicate column headers in [`src/components/ColumnMapper.tsx`](file:///e:/backup/full%20and%20final/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/ColumnMapper.tsx).
   - Added `parseJsonSafe` (`res.ok` verification before JSON parsing) in [`src/lib/api.ts`](file:///e:/backup/full%20and%20final/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/api.ts) and wired it into [`src/pages/GstNoticesDashboard.tsx`](file:///e:/backup/full%20and%20final/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/GstNoticesDashboard.tsx) and [`src/components/RecoHistoryModal.tsx`](file:///e:/backup/full%20and%20final/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/RecoHistoryModal.tsx).
   - Updated `GlobalErrorBoundary` in [`src/App.tsx`](file:///e:/backup/full%20and%20final/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/App.tsx) to redact local user paths and collapse full stack traces behind a diagnostic toggle.

2. **Memory & Performance Hardening (Task 37-06-T2)**:
   - Created [`src/lib/idbStorage.ts`](file:///e:/backup/full%20and%20final/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/idbStorage.ts) (`idbSet`, `idbGet`, `idbRemove`, `idbClear`) and migrated large reconciliation state storage out of 5MB `sessionStorage`.
   - Removed global `window.console` hijacking in [`src/pages/TallyDirectImport.tsx`](file:///e:/backup/full%20and%20final/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/TallyDirectImport.tsx).
   - Added 100-row table pagination in [`src/pages/TallyLedgerImport.tsx`](file:///e:/backup/full%20and%20final/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/TallyLedgerImport.tsx) and [`src/components/OutputDashboard.tsx`](file:///e:/backup/full%20and%20final/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/OutputDashboard.tsx).
   - Reduced heartbeat polling from `2000ms` to `30000ms` in [`src/pages/Index.tsx`](file:///e:/backup/full%20and%20final/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/Index.tsx).

3. **TypeScript Zero-Error Gate, DOM Tests & Production Build (Task 37-06-T3)**:
   - Fixed all 401 baseline TypeScript diagnostics across components, engines, Excel modules, and test fixtures (`src/vite-env.d.ts`, `ImsMasterManager.tsx`, `MonthlyBreakdown.tsx`, `PartyWiseReport.tsx`, `SettingsModal.tsx`, `StatusBadge.tsx`, `SalaryDetailForm.tsx`, `Hub.tsx`, `Index.tsx`, `Login.tsx`, `BankCmaAppraisal.tsx`, `DepreciationAuditor.tsx`, `DepreciationModule.tsx`, `ForensicAudit.tsx`, `PipelineWizard.tsx`, `ReturnsDashboard.tsx`, `TaxAuditClause44.tsx`, `MonthlyAuditSuite.tsx`, `auditEngine.ts`, `partyWise.ts`, `monthlyAuditEngine.ts`, `incomeTaxEngine.ts`, `incomeTaxTypes.ts`, `finStatements.types.ts`, `ifcChecksEngine.ts`, `gstr3bEngine.ts`, `firebaseAuditSync.ts`, `excel/builders/partyWiseExport.ts`, `excel/builders/templates.ts`, `excel/parsers/gstr1Parser.ts`, `excel/parsers/parseFile.ts`).
   - Updated [`src/test/landingPage.test.tsx`](file:///e:/backup/full%20and%20final/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/test/landingPage.test.tsx) (`<MemoryRouter>`, mocks, executive theme assertions): 12/12 passing.

## Verification Gate Results
- **TypeScript (`node ./node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit`)**: Exit code `0` (0 errors)
- **Full Vitest Suite (`node ./node_modules/vitest/vitest.mjs run`)**: **53 test files passed (53), 404 tests passed (404)**
- **Production Build (`node ./node_modules/vite/bin/vite.js build`)**: **Clean build succeeded (`3527 modules transformed`, built in `3m 10s`)**

