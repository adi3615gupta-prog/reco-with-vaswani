---
last_mapped_commit: 2767eb1c5944b9af02382e532c64119f7847f32a
last_mapped_at: 2026-10-22
---
# External Integrations

**Analysis Date:** 2026-10-22

## APIs & External Services

**GST Portal Automation (Inward & Outward Returns):**
- Government GST Portal (`services.gst.gov.in`) - Autonomous 12-month return downloading for GSTR-1, GSTR-2B, and Invoice Management System (IMS)
  - Engine: Playwright headless browser automation
  - Implementation: `gstr1/autopilot.js`, `gstr2b/autopilot.js`, `ims_routes.js`
  - Auth: Interactive single-login CAPTCHA session maintained per run

**Accounting Software (TallyPrime Direct XML):**
- TallyPrime Native XML Server - Bidirectional ledger, daybook, balance sheet, and voucher synchronization
  - Endpoint: `http://localhost:9000` (configurable)
  - SDK/Client: Native HTTP XML request builder
  - Implementation: `src/lib/tallyApi.ts`, `src/lib/tallyCmaApi.ts`
  - Format: Tally XML Definition (TDL / XML request envelopes)

**Cloud Backup & Storage:**
- Google Drive API - Automated backup and sharing of reconciliation working papers
  - SDK: `googleapis` (OAuth2 client)
  - Implementation: `gdrive_routes.js`
  - Auth: Client ID, Client Secret, and Refresh Token stored locally in `gdrive_admin_config.json`

**Cloud Licensing & Telemetry:**
- Firebase Firestore - Remote license verification and feature gating
  - SDK: `firebase/app` and `firebase/firestore` (Web SDK 12.14.0)
  - Project ID: `reco-vaswani-license`
  - Implementation: `server.js`

**Vendor Dispute & Communication:**
- SMTP Email Gateway - Transmitting missing invoice notices and difference statements to vendors
  - Client: `nodemailer`
  - Config: Local SMTP configuration via `server_config.json`
- WhatsApp Web - Instant party discrepancy notices via URI dispatch
  - Implementation: `src/components/PartyWiseReport.tsx`

**Tunneling & Remote LAN Access:**
- LocalTunnel - Exposing local port 8080 for multi-device office LAN testing
  - Client: `localtunnel` CLI

## Data Storage

**Databases:**
- SQLite3 (Embedded Serverless Relational DB)
  - Driver: `sqlite3`
  - DB Files: Managed under `process.env.USER_DATA_PATH` (e.g. `reco.db`, `gstr1.db`, `gstr2b.db`)
  - Key Schemas:
    - `gstr1_batches`, `gstr1_invoices`, `gstr1_summaries`
    - `gstr2b_batches`, `gstr2b_invoices`
    - `ims_batches`, `ims_invoices`
    - `tally_ledgers`, `tally_vouchers`, `tds_party_master`
    - `clients`, `gstr3b_returns`, `app_config`

**File Storage:**
- Local filesystem only (`gst_returns_data/` directory or centralized shared LAN path)
- Stores generated Excel workbooks (`.xlsx`), client templates, and audit exports

**Caching:**
- In-memory React Query cache (`@tanstack/react-query`) for frontend views
- SQLite database tables acting as persistent local query caches for portal downloads

## Authentication & Identity

**Auth Provider:**
- Custom JWT + Remote Firestore Verification
  - Admin login: Local JWT token verification via `jsonwebtoken` with bcrypt-hashed passwords in `server.js` (`POST /api/login`)
  - Enterprise License verification: Periodic sync with Firebase Firestore `licenses` collection

## Monitoring & Observability

**Error Tracking:**
- Local uncaught exception handling and Playwright IPC disconnect suppression in `server.js`
- `electron-log` for Electron application logging in production

**Logs:**
- Local audit log tracking written to `audit_logs.json`
- Console-based structured request logging in Express

## CI/CD & Deployment

**Hosting:**
- Self-hosted desktop packaging (Electron NSIS 64-bit installer) or local Node.js server service

**CI Pipeline:**
- GitHub Actions / Releases configured in `package.json` (`owner: adi3615gupta-prog, repo: reco-with-vaswani`)

## Environment Configuration

**Required env vars:**
- `USER_DATA_PATH` - Base directory for SQLite databases and config files
- `JWT_SECRET` - Secret key for signing admin authentication tokens (fallback stored in `server_config.json`)
- `PORT` - Backend API port (defaults to 3001)

**Secrets location:**
- Stored locally in `server_config.json` and `gdrive_admin_config.json` in user data directory. Never committed to source control.

## Webhooks & Callbacks

**Incoming:**
- None (Direct REST and local HTTP endpoints)

**Outgoing:**
- None (Scheduled node-cron tasks and interactive user-triggered API requests)

---

*Integration audit: 2026-10-22*
