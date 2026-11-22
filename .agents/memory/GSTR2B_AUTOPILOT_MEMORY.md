# GSTR-2B Autopilot — Dedicated Architecture & Granular Memory Manual

> **Module Identity:** GSTR-2B Inward Auto Downloader & Full-Year 12M Consolidator  
> **Source Files:**
> - Core Autopilot: `gstr2b/autopilot.js` (Lines 1–1560)
> - Database Layer: `gstr2b/db.js`
> - Parsers (JSON, Excel, ZIP): `gstr2b/parsers.js`
> - Full Year Excel: `gstr2b/fullYearExcel.js`
> - API Routes: `gstr2b_routes.js`
> - Autopilot Config: `gstr2b/autopilot_config.json`

---

## 1. Exact Line-by-Line Code Map (`gstr2b/autopilot.js`)

| Line Range | Function / Phase | Kya Karta Hai | Kaise Karta Hai |
|---|---|---|---|
| **Lines 460–560** | `ensureReturnsSearchScreen()` | Returns Search Dashboard validation | Polling loop for `>= 2` select dropdowns. Clicks official `BACK` button. |
| **Lines 570–833** | `selectPeriodAndSearch()` | Period selection for 12 months | Selects FY, Quarter, Month in sequence, submits `SEARCH`, waits for returns cards. |
| **Lines 838–970** | `downloadAndProcess2b()` | Locates GSTR-2B Card & downloads files | Targets GSTR-2B card (strictly excluding GSTR-1 & Outward Supplies), clicks `DOWNLOAD`, captures Excel & JSON streams. |
| **Lines 975–1120** | Line-item Ingestion & DB Persistence | Extracts B2B, B2BA, CDNR, CDNRA | Saves line-item invoices to SQLite `gstr2b_invoices` with `is_reversal`, `itc_available`. |
| **Lines 1125–1240** | 12-Month Autonomous FY Loop | Iterates April through March in 1 single login | Seamless non-blocking loop across 12 months without repeating CAPTCHA. |
| **Lines 1250–1560** | Nil Return & Summary Persistence | Nil return handling | Confirmed 0 records tagged `NIL_SYNCED`. Generates 8-sheet consolidated Excel without cell merges. |

---

## 2. Critical Rules for GSTR-2B Autopilot

1. **1-LOGIN 12-MONTH RESILIENCE:** Single CAPTCHA authentication processes all 12 months (April to March). Single month failure logs `FAILED` and preserves existing data.
2. **GOLDEN RULE DATA PRESERVATION:** Existing 2B batches and invoices are NEVER deleted or overwritten on failure.
3. **NIL RETURN EXPLICIT DISTINCTION:** Portal confirmed 0 records set to `NIL_SYNCED` (total_invoices = 0).
4. **ZERO MERGE RULE ON EXCEL EXPORTS (`ws['!merges'] = []`):** Multi-sheet consolidated Excel strictly prohibits merged cells to ensure filtering and XLOOKUP compatibility.

