# Phase 17: Research Document — NOTICE-SHIELD AI (Automated GST Notice Intelligence, Zero-Trust PII Sanitization & Courtroom-Grade Legal Defense Engine)

## Executive Summary
This document provides the research, architecture, technical design, and implementation analysis for **Phase 17: NOTICE-SHIELD AI** integrated directly into the **GST Notices & Orders Autonomous Suite** module.

---

## 1. Codebase Architecture & Gap Analysis

### Existing Architecture (Phase 12 Foundation)
- **Frontend:** [`src/pages/GstNoticesDashboard.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/GstNoticesDashboard.tsx)
  - 4-card KPI strip
  - Limitation countdown alert badges (`CRITICAL`, `URGENT`, `NORMAL`)
  - Filter tabs (`ALL`, `PENDING`, `ASMT`, `DRC`, `CLOSED`)
  - Cross-reconciler modal (`noticeReconciliation.ts`)
  - Template reply generator (`noticeReplyGenerator.ts`)
- **Backend:** [`notices_routes.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/notices_routes.js), [`notices/autopilot.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/notices/autopilot.js), [`notices/db.js`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/notices/db.js)
  - SQLite tables: `gst_notices`, `gst_notice_attachments`, `gst_notice_replies`
  - Playwright multi-destination crawler navigating without direct URL pushing (`notices/autopilot.js`)

### Phase 17 Capabilities (The Upgrades)
1. **Module 1 (UI & Telemetry):**
   - High-contrast corporate dark-mode fintech aesthetic (`#090D16` canvas, `#111827` surface cards).
   - Executive Telemetry Ribbon with live Privacy Shield Status pill: *"100% Local PII Masked"*.
   - 5-Stage Live Defense Pipeline Visualizer (`NoticePipelineVisualizer.tsx`) with animated stepper.
2. **Module 2 (Ingestion & Simulator):**
   - Playwright multi-path scraper + Drag-and-drop PDF uploader using `pdf-parse` (class `PDFParse`).
   - 1-Click Pre-Loaded Realistic Demo Suite (`src/lib/noticeDemoData.ts`) covering ASMT-10, DRC-01, and DRC-01B.
3. **Module 3 (Zero-Trust Privacy Vault):**
   - Deterministic two-way regex tokenization (`src/lib/piiSanitizer.ts`) scrubbing GSTINs, PANs, ARNs, names, and contact details into `{{TOKEN}}` variables with an in-memory session map.
   - Interactive Split-Screen Diff Viewer (`src/components/PrivacyVaultDiffViewer.tsx`) proving 0% cloud data transmission.
4. **Module 4 (Tax Intelligence Engine):**
   - Gemini API integration with Indian GST litigation system instructions (`src/lib/geminiTaxEngine.ts`).
   - High-precision deterministic statutory reasoning fallback for 100% offline reliability.
   - 5-Step Analytical Framework (DIN verification, Limitation check, Sec 74 fraud suppression challenge, Rule 88B net cash interest).
5. **Module 5 (Reply Workbench & Export):**
   - Split-pane interactive workbench (`src/components/NoticeReplyWorkbenchModal.tsx`).
   - Quick-Insert Defense Chips (`Sec 16(5)`, `Circular 183`, `Rule 88B`, `Sec 74 Challenge`, `Sec 75(4) Personal Hearing`).
   - Courtroom `.docx` export via `docx` library and formatted PDF export via `jspdf`.
   - Zero-Merge Excel Annexure export (`ws['!merges'] = []`).

---

## 2. Technical Validation & Invariants
- **Zero Client Identity Transmitted:** All GSTINs, PANs, ARNs, names, and phones are tokenized prior to calling Gemini. Real identities are re-hydrated locally before display or document export.
- **Statutory Preservations:** Sections, rules, financial years, dates, and ₹ amounts are preserved intact.
- **Section 75(4) Mandatory Hearing:** Every legal reply draft unequivocally includes a personal hearing prayer.
- **Zero-Merge Compliance:** Exported reconciliation annexures strictly enforce `ws['!merges'] = []`.
