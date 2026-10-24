# Plan 12-01 Summary: GST Notices SQLite Schema, Limitation Engine & Backend API

## Execution Overview
- **Phase:** 12 - GST Notices & Orders Autonomous Suite (Autopilot Downloader, Tracker & AI Reply Drafter)
- **Plan:** 01
- **Status:** Complete ✓
- **Requirements Satisfied:** NOTICES-02, NOTICES-03

## Key Deliverables Implemented
1. **SQLite Database Schema & Persistence (`notices/db.js`)**:
   - `gst_notices`: Table storing notice metadata, DIN, section cited, dates, demanded tax/interest/penalty/total, and status with `UNIQUE(client_gstin, reference_no)` preventing duplicate scans.
   - `gst_notice_attachments`: Table managing downloaded PDF and ZIP files with SHA256 hashes and `ON DELETE CASCADE`.
   - `gst_notice_replies`: Table saving draft legal replies, statutory citations, and zero-merge annexure paths.
   - Helpful indexes on `client_gstin`, `status`, `due_date`, and `notice_id`.
   - Parameterized SQLite queries preventing SQL injection (T-12-01).

2. **Limitation & Deadline Calculation Engine (`notices/db.js`)**:
   - `computeLimitationDueDate(noticeType, issueDate)`: Automatically calculates statutory offsets (+7 days for Rule 88C/88D DRC-01B/C, +30 days for Section 61/73/74 ASMT-10/DRC-01, +90 days for appealable orders ASMT-13/DRC-07).
   - `getNoticeAlertStatus(dueDate)`: Derives color-coded countdowns (`CRITICAL` $\le$ 3d in Red, `URGENT` $\le$ 7d in Amber, `NORMAL` in Emerald, `EXPIRED` in Crimson).

3. **Backend REST API (`notices_routes.js` & `server.js`)**:
   - `GET /api/notices/:gstin`: Fetch all client notices with computed countdown alerts.
   - `GET /api/notices/detail/:id`: Fetch complete notice payload with linked attachments and draft reply.
   - `GET /api/notices/summary/:gstin`: Fetch high-level summary KPIs (total notices, pending reply count, urgent count, disputed tax amount).
   - `POST /api/notices/reply/save`: Upsert draft statutory replies.
   - `POST /api/notices/status/update`: Update notice progress status.
   - `GET /api/notices/attachment/download/:id`: Secure local file download.
   - Mounted seamlessly in `server.js`.

4. **Automated Vitest Tests**:
   - `src/test/noticesSchema.test.ts`: 4/4 tests passing (table creation, upsert deduplication, attachment cascade, KPI aggregation).
   - `src/test/noticesLimitation.test.ts`: 4/4 tests passing (7d/30d offset verification, date parsing, urgency badge triggers).
