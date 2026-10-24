---
title: "Implement GST Notices & Orders Autonomous Hub"
date: "2026-10-24"
priority: "high"
status: "pending"
phase: "Phase 12"
---

# GST Notices & Orders Autonomous Hub — Implementation Todo

## Context
Provide complete automation for GST notices and orders: 1-click scraping of portal notices (`/viewnotices`, `/additionalnotices`, and DRC-01B/C), local SQLite tracking with limitation calendar alerts, automated multi-return cross-reconciliation (2B vs 3B, 1 vs 3B), and AI/Template dual-engine legal reply drafting.

---

## Task Breakdown

### 1. Database Schema & Migration (`notices/db.js`)
- [ ] Create `initGstNoticesDatabase(db)` in `notices/db.js` with tables:
  - `gst_notices`: Notice metadata, DIN, section, dates, amounts, status.
  - `gst_notice_attachments`: Attachment file paths, hashes, and download metadata.
  - `gst_notice_replies`: Draft legal replies, citations, and annexure file references.
- [ ] Implement query helper functions:
  - `saveNotice(...)`, `getNoticesByClient(gstin)`, `getNoticeById(id)`.
  - `saveAttachment(...)`, `saveNoticeReply(...)`, `updateNoticeStatus(...)`.
  - `getPendingLimitationAlerts(gstin)` (computes remaining days to due date).

### 2. Playwright Autopilot Scraper (`notices/autopilot.js`, `notices_routes.js`)
- [ ] Implement `runNoticesAutopilot({ db, gstin, portal_username, portal_password, req, res })`:
  - 1-Login session with CAPTCHA wait and Chrome-first launcher.
  - Section A: Navigate to `Services > User Services > View Notices and Orders` $\rightarrow$ parse table rows $\rightarrow$ download attached orders.
  - Section B: Navigate to `Services > User Services > View Additional Notices/Orders` $\rightarrow$ parse table rows (ASMT-10, DRC-01) $\rightarrow$ open detail modals $\rightarrow$ download all attachments.
  - Section C: Navigate to `Services > Returns > Return Compliance` $\rightarrow$ scan DRC-01B & DRC-01C pending reference records.
  - Follow Golden Rule: Use authentic on-screen BACK `<button>` (no URL push, no `<a>` tags) and preserve existing database records on failure.
- [ ] Expose backend endpoints in `notices_routes.js`:
  - `POST /api/notices/autopilot` (SSE stream)
  - `GET /api/notices/:gstin` (list notices for client)
  - `GET /api/notices/detail/:id` (notice details & attachments)
  - `POST /api/notices/cancel` (clean process termination)

### 3. Deterministic Discrepancy Cross-Check Engine (`src/lib/noticeReconciliation.ts`)
- [ ] Compare notice figures against local SQLite tables (`gstr2b_invoices`, `gstr1_invoices`, `gstr3b_returns`, Purchase Register):
  - For ASMT-10 / DRC-01C: Identify suppliers whose invoices were delayed, cancelled, or in subsequent FY.
  - For DRC-01B: Cross-reference GSTR-1 outward invoices vs GSTR-3B Table 3.1 liability.
  - Check Section 16(4) time-bar relief under newly inserted Subsections (5) and (6).
- [ ] Generate Zero-Merge analytical reconciliation Excel workbook (`generateNoticeAnnexureExcel(...)`) ensuring `ws['!merges'] = []`.

### 4. AI & Template Dual-Engine Legal Reply Drafter (`src/lib/noticeReplyGenerator.ts`)
- [ ] Standard statutory templates for:
  - Form GST ASMT-11 (Reply to Scrutiny Notice ASMT-10)
  - Form GST DRC-06 (Reply to SCN DRC-01 under Section 73/74)
  - DRC-01B / DRC-01C Part B responses
- [ ] AI prompt integration to synthesize factual rebuttal, statutory citations (Section 128A waiver, Circular 211/2024), and point-by-point tabular annexures into a structured draft.
- [ ] Export draft to clean printable HTML, PDF, or Word document.

### 5. Frontend Dashboard & Navigation (`src/pages/GstNoticesDashboard.tsx`)
- [ ] Build high-density Obsidian Glass UI matching Stitch enterprise aesthetic:
  - Top KPI strip: Total Notices, Pending Replies (< 7 days in Amber/Red), Disputed Demand (₹), Replied/Closed.
  - Limitation Calendar & Countdown HUD with sorting by urgent deadline.
  - Notice Detail Inspector: PDF preview pane, extracted data tables, and attachments list.
  - 1-Click "Reconcile with Books/2B" button rendering cause-of-difference breakdown.
  - "Draft Legal Reply" modal with live preview, editable legal clauses, and export buttons.
- [ ] Register `/gst-notices` route in `src/App.tsx` and add to persistent sidebar rail.
