---
title: "GST Notices & Orders Autonomous Hub Architecture"
date: "2026-10-24"
context: "Exploration session for GST Notices & Orders module in Vaswani Return Enterprise"
status: "settled"
---

# GST Notices & Orders Autonomous Hub — Architecture Specification

## 1. Executive Overview

The **GST Notices & Orders Module** provides an end-to-end autonomous pipeline for Indian tax practitioners (CAs, tax advocates, and enterprise compliance teams) to:
1. **Autonomously scan and download** all notices, orders, intimations, and file attachments from the GST Portal across both standard and hidden portal locations in a single login session.
2. **Track statutory limitation dates and hearing schedules** (e.g. 7-day deadlines for DRC-01B/C and 30-day deadlines for ASMT-10 / DRC-01) with proactive risk badges to prevent ex-parte demands.
3. **Deterministically cross-reconcile** notice demands against existing local SQLite return databases (`gstr2b_invoices`, `gstr1_invoices`, `gstr3b_returns`, and Tally/Purchase Registers) to isolate the exact cause of difference (timing difference, delayed vendor GSTR-1, credit note timing, or clerical mismatch).
4. **Generate audit-grade legal replies** (Form GST ASMT-11, Form GST DRC-06, DRC-01B/C Part B) incorporating statutory provisions (CGST Act Sections 16, 61, 73, 74, 128A), relevant CBIC circulars (e.g. Circular 211/2024-GST on retrospective Section 16(5)/(6) ITC), and Zero-Merge analytical reconciliation annexures.

---

## 2. GST Portal Scraper & Navigation Paths

The scraper extends the established Playwright architecture (`launchAutopilotBrowser` from `gstr2b/browserLauncher.js`) with Chrome-first execution and vault auto-fill (`clients` table in SQLite).

### A. Portal Route Target Map
| Category | Portal Menu Path | Target URL / View | Key Forms Found |
|---|---|---|---|
| **View Notices & Orders** | `Services > User Services > View Notices and Orders` | `services.gst.gov.in/services/auth/viewnotices` | Registration orders (REG-03/REG-17), assessment orders (ASMT-13), routine demand intimations |
| **View Additional Notices & Orders** | `Services > User Services > View Additional Notices/Orders` | `services.gst.gov.in/services/auth/additionalnotices` | **Scrutiny notices (ASMT-10)**, **Show Cause Notices (DRC-01, DRC-01A)**, Summary Orders (DRC-07) |
| **Return Compliance Hub** | `Services > Returns > Return Compliance` | `return.gst.gov.in/returns/auth/returncompliance` | **DRC-01B** (GSTR-1 vs 3B Liability mismatch), **DRC-01C** (GSTR-2B vs 3B ITC mismatch) |

### B. Golden Navigation Rules
- **No Direct URL Pushing:** The GST Portal single sign-on (SSO) gateway blocks cross-subdomain GET requests with "Access Denied". Navigation strictly uses authentic in-page DOM menu clicks.
- **On-Screen Back Button:** Returns search screens must return to dashboard via official `<button>` elements with exact text `'BACK'`, strictly avoiding anchor tags (`<a>`) or browser history pops.
- **Attachment Ingestion:** Notices often contain multiple PDF attachments or ZIP annexures. The scraper downloads each attachment into `scratch/downloads/notices/{gstin}/{notice_ref_id}/` and hashes the files.

---

## 3. Database Schema (SQLite: `gst_notices.db` or master SQLite)

```sql
-- Table 1: Master Notices & Orders
CREATE TABLE IF NOT EXISTS gst_notices (
    id TEXT PRIMARY KEY,
    client_gstin TEXT NOT NULL,
    portal_source TEXT NOT NULL, -- 'VIEW_NOTICES' | 'ADDITIONAL_NOTICES' | 'RETURN_COMPLIANCE'
    notice_type TEXT NOT NULL,   -- 'ASMT-10' | 'DRC-01' | 'DRC-01A' | 'DRC-01B' | 'DRC-01C' | 'REG-17' | 'OTHER'
    form_description TEXT,
    reference_no TEXT NOT NULL,  -- Notice ARN or Ref Number
    din TEXT,                    -- Document Identification Number (if applicable)
    financial_year TEXT NOT NULL,
    tax_period TEXT,
    issue_date TEXT,             -- YYYY-MM-DD
    due_date TEXT,               -- YYYY-MM-DD (calculated: issue_date + 7d for DRC-01B/C, +30d for ASMT/DRC-01)
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

-- Table 2: Notice Attachments & Evidence Files
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

-- Table 3: Notice Replies & Legal Defense Drafts
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

## 4. Dual-Engine Architecture: Deterministic Reconciler + AI Legal Drafter

```
┌────────────────────────────────────────────────────────┐
│               NOTICE DISCREPANCY PARSER                │
│    Extracts: Notice Type, Taxable & Tax Demanded,       │
│    Return Periods, and specific vendor GSTINs          │
└──────────────────────────┬─────────────────────────────┘
                           │
       ┌───────────────────┴───────────────────┐
       ▼                                       ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│    ENGINE 1: DETERMINISTIC   │   │       ENGINE 2: AI LEGAL     │
│       SQLITE RECONCILER      │   │        DEFENSE DRAFTER       │
│                              │   │                              │
│ • Cross-queries GSTR-2B, 1,  │   │ • Ingests mathematical proof │
│   3B, and PR tables          │   │ • Injects legal grounds:     │
│ • Computes exact difference  │   │   - Sec 16(5)/(6) retrospect.│
│ • Flags: timing differences, │   │   - Sec 128A waiver scheme   │
│   supplier late filings,     │   │   - Rule 88C / 88D safe paths│
│   credit note adjustments    │   │ • Generates formal ASMT-11   │
│ • Builds Zero-Merge Excel    │   │   or DRC-06 response ready   │
│   annexure                   │   │   for submission             │
└──────────────┬───────────────┘   └──────────────┬───────────────┘
               │                                  │
               └─────────────────┬────────────────┘
                                 ▼
               ┌───────────────────────────────────┐
               │     FINAL STATUTORY SUBMISSION    │
               │   • Formal Written Submissions    │
               │   • Certified Excel Annexures     │
               │   • DRC-03 Payment Citations      │
               └───────────────────────────────────┘
```

---

## 5. Standard Form & Statutory Defense Mapping

| Notice Form | Section & Rule | Reply Form | Typical Allegation | Automated Defense Grounds |
|---|---|---|---|---|
| **Form GST ASMT-10** | Sec. 61 read with Rule 99 | **Form GST ASMT-11** | Discrepancy between GSTR-3B ITC and GSTR-2A/2B | 1. Supplier filed in subsequent quarter (timing diff)<br/>2. Invoices legitimately held with tax paid under Sec 16(2)<br/>3. Section 16(5)/(6) retrospective relief for FY 17-18 to 20-21 |
| **Form GST DRC-01A** | Rule 142(1A) | **DRC-01A Part B** | Pre-Show Cause Intimation of unpaid tax / excess ITC | 1. Reconciliation statement annexed<br/>2. Partial discharge via DRC-03 if accepted<br/>3. Rebuttal on liability |
| **Form GST DRC-01** | Sec. 73/74 read with Rule 142(1) | **Form GST DRC-06** | Formal Show Cause Notice proposing tax, interest & penalty | 1. Preliminary objection on jurisdiction & DIN validity<br/>2. Rebuttal on absence of fraud/suppression (barring Sec 74)<br/>3. Section 128A waiver of interest/penalty for FY 17-18, 18-19, 19-20 demands |
| **Form GST DRC-01B** | Rule 88C | **DRC-01B Part B** | GSTR-1 liability > GSTR-3B liability by > threshold | 1. Clerical error in GSTR-1 rectified in next month<br/>2. Advance received reported in GSTR-1 but adjusted later |
| **Form GST DRC-01C** | Rule 88D | **DRC-01C Part B** | GSTR-3B ITC > GSTR-2B ITC by > threshold | 1. Previous period ITC reversed and reclaimed under Rule 37A<br/>2. Import of goods (IMPG) or ISD ITC not appearing in 2B |

---

## 6. Strict Compliance Guarantees
1. **Zero-Merge Rule on Analytical Spreadsheets:** All reconciliation annexures exported for departmental submission must strictly enforce `ws['!merges'] = []` using `removeAllMergesFromWorkbook(wb)`.
2. **Local Data Security:** All notice PDFs, extracted text, and taxpayer records reside strictly on the local machine in SQLite. No client financial data is transmitted to unauthorized external clouds.
