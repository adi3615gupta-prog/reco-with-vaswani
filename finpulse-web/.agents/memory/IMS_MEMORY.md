# GST IMS (Invoice Management System) — Architecture & Memory Manual

> **Module Identity:** GST IMS (Invoice Management System) Engine & Workflow  
> **Source Files:**
> - Frontend UI: `src/components/ImsMasterManager.tsx`
> - Core Engine: `src/lib/imsEngine.ts`
> - Backend Routes: `ims_routes.js` (Lines 1–4167)
> - Database Tables: `ims_batches`, `ims_invoices`, `ims_actions`
> - Autopilot Config: `ims/autopilot_config.json`

---

## 1. Line-by-Line Code Map (`ims_routes.js`)

| Line Range | Feature / Route | Kya Karta Hai | Kaise Karta Hai |
|---|---|---|---|
| **Lines 100–350** | DB Schema Initialization | Creates `ims_batches`, `ims_invoices`, `ims_actions` tables | SQLite DDL with indices on `(client_gstin, return_period)`. |
| **Lines 400–750** | JSON & Excel Ingestion | Ingests IMS Inward files (B2B, CDNR) | Standardizes dates, deduplicates invoices, updates totals. |
| **Lines 800–1200**| Client Portal & Review Links | Generates secure public tokenized review links | JWT tokenized link allowing client to view and accept/reject invoices. |
| **Lines 1300–1650**| Decision Submission | Records Accept / Reject / Pending decisions | Updates `ims_invoices.status`, recalculates eligible ITC for GSTR-3B Table 4. |
| **Lines 1700–2200**| Official Action Payload | Generates official GSTN IMS Action payload JSON | Formats actions according to GSTN specifications for upload. |

