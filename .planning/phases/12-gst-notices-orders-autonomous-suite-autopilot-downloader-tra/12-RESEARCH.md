# Phase 12 Research: GST Notices & Orders Autonomous Suite (Autopilot Downloader, Tracker & AI Reply Drafter)

## 1. Domain Overview & Problem Statement

Taxpayers and Chartered Accountants across India face immense compliance pressure managing GST notices, intimations, and orders:
- Notices are scattered across **three distinct portal destinations**: routine notices under `View Notices and Orders`, critical scrutiny/demand notices (ASMT-10, DRC-01) under `View Additional Notices/Orders`, and automated return discrepancy intimations (DRC-01B, DRC-01C) under `Return Compliance`.
- Missing a notice leads to severe consequences: ex-parte assessment orders under Section 62/63/73/74, bank account attachments under Section 83, and cancellation of GST registration.
- Once a notice is received, manually cross-referencing demand amounts against GSTR-1, GSTR-2B, GSTR-3B, and Purchase Registers takes days of tedious spreadsheet work.
- In Vaswani Return Enterprise, we already have complete local multi-period datasets (`gstr2b_invoices`, `gstr1_invoices`, `gstr3b_returns`, clients credentials vault, and Tally/PR data). Phase 12 closes the loop by connecting portal notice ingestion directly to local mathematical proofs and statutory legal replies.

---

## 2. GST Portal Architecture & Navigation Paths

### A. Portal Route Target Map
| Category | Portal Menu Path | Target URL / View | Key Forms Found | Typical Deadlines |
|---|---|---|---|---|
| **View Notices & Orders** | `Services > User Services > View Notices and Orders` | `services.gst.gov.in/services/auth/viewnotices` | Registration orders (REG-03/REG-17), assessment orders (ASMT-13), routine demand intimations | 7 to 15 days |
| **View Additional Notices & Orders** | `Services > User Services > View Additional Notices/Orders` | `services.gst.gov.in/services/auth/additionalnotices` | **Scrutiny notices (ASMT-10)**, **Show Cause Notices (DRC-01, DRC-01A)**, Summary Orders (DRC-07) | 30 days |
| **Return Compliance Hub** | `Services > Returns > Return Compliance` | `return.gst.gov.in/returns/auth/returncompliance` | **DRC-01B** (GSTR-1 vs 3B Liability mismatch), **DRC-01C** (GSTR-2B vs 3B ITC mismatch) | **7 days** (Rule 88C/88D) |

### B. Golden Navigation Protocols
1. **SSO Session Preservation (No Direct URL Pushing):** Direct navigation (`page.goto`) to internal dashboard endpoints throws "Access Denied" due to GSTN's SSO token verification. Navigation must execute via authentic DOM clicks (`Services` $\rightarrow$ `User Services` $\rightarrow$ target submenu).
2. **On-Screen Back Button Protocol:** When navigating back from detail modals or search tables to main dashboards, click the official on-screen `<button>` containing exact text `'BACK'`. Strictly avoid anchor tags (`<a>`), breadcrumb clicks, or browser history back (`page.goBack()`).
3. **Multi-Attachment File Downloader:** Notices in `View Additional Notices` often feature separate tabs ("Notices", "Replies", "Orders") and file download links. The downloader must click each attachment link, wait for Playwright download events, save files to `scratch/downloads/notices/{gstin}/{notice_id}/`, and record file hashes and paths in SQLite.

---

## 3. Database Schema & Persistence Architecture

The engine stores all notice records in the local SQLite database (`database.sqlite` / `network_data.db`):

```sql
-- Master Notices & Orders
CREATE TABLE IF NOT EXISTS gst_notices (
    id TEXT PRIMARY KEY,
    client_gstin TEXT NOT NULL,
    portal_source TEXT NOT NULL, -- 'VIEW_NOTICES' | 'ADDITIONAL_NOTICES' | 'RETURN_COMPLIANCE'
    notice_type TEXT NOT NULL,   -- 'ASMT-10' | 'DRC-01' | 'DRC-01A' | 'DRC-01B' | 'DRC-01C' | 'REG-17' | 'OTHER'
    form_description TEXT,
    reference_no TEXT NOT NULL,  -- Notice ARN or Ref Number
    din TEXT,                    -- Document Identification Number
    financial_year TEXT NOT NULL,
    tax_period TEXT,
    issue_date TEXT,             -- YYYY-MM-DD
    due_date TEXT,               -- YYYY-MM-DD (calculated based on form type)
    issuing_officer TEXT,
    issuing_jurisdiction TEXT,
    section_cited TEXT,          -- 'Section 61', 'Section 73', 'Section 74', 'Rule 88C', 'Rule 88D'
    tax_demanded REAL DEFAULT 0,
    interest_demanded REAL DEFAULT 0,
    penalty_demanded REAL DEFAULT 0,
    total_demanded REAL DEFAULT 0,
    status TEXT DEFAULT 'PENDING_REPLY', -- 'PENDING_REPLY' | 'REPLIED' | 'DROPPED' | 'ORDER_PASSED' | 'APPEAL_FILED'
    raw_notice_text TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    UNIQUE(client_gstin, reference_no)
);

-- Notice Attachments & Evidence Files
CREATE TABLE IF NOT EXISTS gst_notice_attachments (
    id TEXT PRIMARY KEY,
    notice_id TEXT NOT NULL,
    client_gstin TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT, -- 'PDF' | 'ZIP' | 'XLSX'
    file_path TEXT NOT NULL,
    file_hash TEXT,
    downloaded_at INTEGER,
    FOREIGN KEY(notice_id) REFERENCES gst_notices(id) ON DELETE CASCADE
);

-- Draft Legal Replies & Statutory Submissions
CREATE TABLE IF NOT EXISTS gst_notice_replies (
    id TEXT PRIMARY KEY,
    notice_id TEXT NOT NULL,
    client_gstin TEXT NOT NULL,
    reply_form TEXT NOT NULL, -- 'ASMT-11' | 'DRC-06' | 'DRC-01B_PART_B' | 'DRC-01C_PART_B'
    reply_subject TEXT,
    preliminary_objections TEXT,
    factual_rebuttal TEXT,
    legal_grounds TEXT,
    statutory_citations TEXT, -- JSON array of cited sections and circulars
    annexure_path TEXT,       -- Zero-Merge Excel reconciliation file path
    full_draft_html TEXT,
    status TEXT DEFAULT 'DRAFT', -- 'DRAFT' | 'READY_FOR_FILING' | 'FILED_ON_PORTAL'
    filed_arn TEXT,
    filed_date TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY(notice_id) REFERENCES gst_notices(id) ON DELETE CASCADE
);
```

---

## 4. Deterministic Multi-Return Cross-Reconciler

When a notice cites a discrepancy (e.g., ITC claimed in 3B vs 2B or Outward declared in 1 vs 3B), the cross-reconciler automatically queries local SQLite tables to determine the root cause:

```
                  ┌──────────────────────────────────────────────┐
                  │            NOTICE DEMAND FIGURES             │
                  │   (Tax Period, Alleged Excess ITC/Tax)       │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │         MULTI-RETURN RECO ENGINE             │
                  └──────────────┬────────────────┬──────────────┘
                                 │                │
            ┌────────────────────┴───┐        ┌───┴────────────────────┐
            ▼                        ▼        ▼                        ▼
     ┌──────────────┐         ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │ GSTR-2B DB   │         │ GSTR-1 DB    │ │ GSTR-3B DB   │ │ Purchase Reg │
     │ (Invoices)   │         │ (Outward)    │ │ (Table 3 & 4)│ │ (Tally Vouchers)
     └──────────────┘         └──────────────┘ └──────────────┘ └──────────────┘
```

### Key Automated Discrepancy Defenses:
1. **Timing Difference (Supplier Late Filing):** Inward supply invoice was reported by supplier in a later GSTR-1 (e.g. Q4 or subsequent FY). The engine locates the invoice in subsequent periods and prepares an invoice-by-invoice reconciliation statement.
2. **Retrospective Section 16(5)/(6) ITC Relief:** Under the Finance (No. 2) Act 2024 and CBIC Circular 211/2024-GST, ITC for FY 2017-18, 2018-19, 2019-20, and 2020-21 availed up to 30th November 2021 is deemed valid. The engine identifies any Section 16(4) time-bar allegations and generates the statutory retrospective defense.
3. **Credit Note Offsets:** Difference caused by supplier credit notes reflecting in 2B that were already adjusted in books.
4. **Zero-Merge Excel Annexure:** Generates a structured multi-column spreadsheet (`ws['!merges'] = []`) detailing Invoice No, Invoice Date, Supplier GSTIN, Trade Name, Taxable Value, CGST, SGST, IGST, 2B Period, 3B Filing Period, and Auditor Remarks.

---

## 5. AI / Template Legal Reply Drafter

### Supported Statutory Reply Forms:
- **Form GST ASMT-11:** Formal written reply under Rule 99(2) responding to ASMT-10 scrutiny notice.
- **Form GST DRC-06:** Formal written submission under Rule 142(4) responding to DRC-01 Show Cause Notice under Section 73/74.
- **Form GST DRC-01A Part B:** Submissions in response to pre-SCN intimation.
- **DRC-01B / DRC-01C Part B:** Standardized point-by-point reasons (e.g., Reason 1: Difference in timing, Reason 2: Clerical error corrected in later month, Reason 3: Rule 37A reversal/reclaim).

### Defense Argument Ingestion:
- **Section 128A Amnesty Waiver:** For demand notices under Section 73 pertaining to FY 2017-18, 2018-19, and 2019-20, the engine automatically drafts the Section 128A prayer requesting waiver of entire interest and penalty upon payment of basic tax.
- **Judicial Precedents Library:** Pre-seeded with leading High Court and Supreme Court rulings on ITC eligibility, lack of supplier tax deposit (e.g. *Suncraft Energy*, *D.Y. Beathel*), and requirement of speaking orders with DIN.

---

## 6. Frontend UI Architecture & Stitch Alignment

- Page route: `src/pages/GstNoticesDashboard.tsx`
- Registered in `src/App.tsx` and mapped in persistent sidebar `AppShell.tsx` under Compliance Suite.
- Layout elements:
  - **Metric Strip (4 KPI cards):** Total Notices Scanned, Action Required (< 7 Days), Total Disputed Demand (₹), Closed/Replied.
  - **Limitation Calendar HUD:** Sortable countdown table highlighting urgent deadlines with color badges (Red: $\le 3$ days, Amber: $\le 7$ days, Emerald: $> 7$ days).
  - **Notice Detail Drawer:** Split inspector with PDF attachment viewer, metadata pills (DIN, Officer, Jurisdiction), and extracted line-item table.
  - **1-Click "Cross-Reconcile" Action:** Triggers local SQLite matching and displays the variance tie-out card.
  - **"Draft Legal Reply" Modal:** Rich text draft editor with dynamic statutory clauses, annexure table toggle, and export to Word / PDF / HTML.

---

## 7. Validation Architecture

To guarantee audit-grade precision and prevent regressions:
- **Automated Vitest Test Suites:**
  - `tests/notices/schema.test.ts`: Validates SQLite DDL, foreign key cascades, and unique constraints.
  - `tests/notices/limitation.test.ts`: Verifies deadline calculation rules (+7d for DRC-01B/C, +30d for ASMT/DRC-01) and urgent badge triggers.
  - `tests/notices/crossReconciler.test.ts`: Tests mathematical variance decomposition against mocked 2B and 3B datasets.
  - `tests/notices/zeroMergeExport.test.ts`: Asserts that exported notice reconciliation workbooks have zero merged cells (`ws['!merges'] = []`).
- **Nyquist Sampling Points:**
  - Edge Case 1: DRC-01B notice where GSTR-1 liability exceeds 3B due to amendment in Table 9.
  - Edge Case 2: ASMT-10 notice where ITC was availed in FY 18-19 beyond Sept 2019 but protected by Section 16(5) retrospective amendment.
  - Edge Case 3: Notice with multiple PDF attachments and ZIP archives.
  - Edge Case 4: Nil notice state (client has zero notices).
