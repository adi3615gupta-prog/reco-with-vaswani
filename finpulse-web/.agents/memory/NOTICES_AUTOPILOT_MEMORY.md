# GST Notices Autopilot — Architecture & Granular Memory Manual

> **Module Identity:** GST Notices & Orders Autonomous Downloader & Document Classifier  
> **Source Files:**
> - Core Autopilot: `notices/autopilot.js` (Lines 1–496)
> - Database Layer: `notices/db.js`
> - Document Classifier: `notices/classifier.js`
> - API Routes: `notices_routes.js`
> - Autopilot Config: `notices/autopilot_config.json`

---

## 1. Line-by-Line Code Map (`notices/autopilot.js`)

| Line Range | Function / Phase | Kya Karta Hai | Kaise Karta Hai |
|---|---|---|---|
| **Lines 1–28** | `extractNoticeFinancialYear()` | Extracts FY from notice description, refNo, or issue date | Regex match for `YYYY-YY` with fallback to calendar date calculation. |
| **Lines 39–95** | `runNoticesAutopilot()` — Auth & SSE | Authenticates and sets up SSE stream | Fetches portal credentials from vault, launches browser, streams progress via SSE. |
| **Lines 96–190** | Portal Login & CAPTCHA | Auto-fills credentials, awaits manual CAPTCHA | Injects username/password, waits for user to solve CAPTCHA and reach dashboard. |
| **Lines 191–320** | View Notices & Orders | Scrapes notices from User Services | Navigates to `View Notices and Orders`, reads table rows, downloads attachments. |
| **Lines 321–450** | Additional Notices | Scrapes DRC-01, SCN, Orders | Navigates to `View Additional Notices`, reads table, extracts proceedings and case files. |
| **Lines 451–496** | Classification & Storage | Saves notices and attachments to DB | Runs `classifyNoticeDocument()`, calls `upsertNotice()`, `saveAttachment()`. |

