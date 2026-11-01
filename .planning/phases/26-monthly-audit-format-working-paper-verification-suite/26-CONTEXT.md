# Phase 26 Context: Monthly Audit Format & Working Paper Verification Suite

## Overview
Phase 26 implements an enterprise-grade **Suite 08 - Monthly Audit Working Paper & Verification Suite** for CA firms, corporate finance teams, and statutory auditors. This module digitizes and automates the monthly statutory and internal audit verification process formalized in the standardized firm audit checklist (`\\new_server\D\3. 2025-2026\DYP Infraprojects Private Limited\Monthly Audit Format.docx`).

---

## 1. Core Requirements & Specification

### Section 1: Basic Audit Details & Engagement Metadata
- **1.1 Auditor & Engagement Profile:**
  - Client Name (`client_name`, linked to client selector)
  - Auditor Name (`auditor_name`)
  - Audit Team Members (`team_members` tag list)
  - Type of Audit (Monthly Statutory Audit / Internal Audit / Tax Audit Pre-Scrutiny / Management Review)
  - Month and FY of Audit (e.g. October 2025, FY 2025-26)
  - Audit Duration: Start Date (`audit_start_date`) & End Date (`audit_end_date`)
  - Overall Turnover including GST (`turnover_inc_gst`)
  - Auto-fill capabilities from active client profile, Tally company information, and SQLite client master.

### Section 2: Financial Details & Engagement Scope
- Overall engagement parameters and financial snapshot:
  - Total Turnover (Books) vs GST Turnover (GSTR-1 / 3B)
  - Vouching and verification scope checklist
  - Auto-computation of turnover variance and statutory thresholds.

### Section 3: Sample Data & Verification Engine (Core Workings)
- **3.1 Sales (Reco R1 & 3B):**
  - Cross-reconcile Sales Register vs GSTR-1 and GSTR-3B for the audit month.
  - Identification of turnover mismatches, tax rate discrepancies, and un-reported supplies.
- **3.2 Purchase (Reco with 2B):**
  - Cross-reconcile Purchase Register vs GSTR-2B.
  - Real-time detection of missing invoices, timing variances, and ineligible ITC u/s 16(4) / 17(5).
- **3.3 Journal Vouchers, Debit & Credit Notes:**
  - Journal Register scrutiny for unusual provisions, year-end adjustments, or capital-to-revenue reclassifications.
  - Pairing of Debit Notes and Credit Notes against portal CDNR supplies.
  - TDS Working & Mismatch Scrutiny: TDS Annual Working, TDS Consolidated Working, and reconciliation with Form 24Q (Salary) & Form 26Q (Non-Salary).
- **3.4 Bank Statements & Loan Statements (Including 26AS & AIS Reco):**
  - Bank and loan account statement verification, interest servicing check, and EMI schedule scrutiny.
  - Cross-reconciliation of Books of Accounts against Form 26AS (TDS credit) and Annual Information Statement (AIS) / TIS.
- **3.5 New Loans Taken & ROC Compliance:**
  - Tracking of new unsecured and secured borrowings taken during the month.
  - For Private Limited Companies and LLPs: verification of charges created or satisfied with ROC records (Form CHG-1 / CHG-4).
- **3.6 Cash Register & Compliance (Sec 40A(3)):**
  - Verification of Cash Daybook for single-day payments exceeding ₹10,000 to a single person (disallowed u/s 40A(3)).
  - Negative cash balance check on any day of the month.
  - Verification of closing provisions created and opening provisions reversed.
  - Ineligible ITC verification on Fixed Asset additions (capital goods under Sec 17(5)(c)/(d)).

### Section 4: General Comments & Statutory Compliances
- **4.1 PF, ESIC & Professional Tax (PT):**
  - PF, PT, and ESIC monthly calculation sheets cross-verified against the payroll salary sheet.
  - Verification of timely statutory deposit dates (due dates under respective labor and tax acts).
- **4.2 Current Year Audit Comments:**
  - Categorized auditor observations (Low / Medium / High / Critical Risk).
  - Internal control deficiencies and documentation gaps.

### Section 5: Previous Audit Pending Points
- **5.1 Action Item & Pending Point Tracker:**
  - Persistent tracking of observations from previous months.
  - Status tracking: `Pending` | `In Progress` | `Cleared` / `Resolved`.
  - Resolution audit trail with remarks, resolution date, and verifying auditor name.

### Section 6: Maker-Checker Review Lifecycle & Client Release Engine
- **6.1 Role-Based Workflow Pipeline (4-Eye Principle):**
  - **Step 1: Data Entry & Vouching (Junior / Article Assistant):**
    - Junior populates data from Tally & GST, records sample observations, fills checklist responses.
    - Audit status: `DRAFT`.
    - Once draft complete, Junior clicks `"Submit for Senior Review"`. Audit status becomes `SUBMITTED_FOR_REVIEW` (locks draft inputs to prevent unintended edits).
  - **Step 2: Scrutiny & Sign-Off (Senior Auditor / Partner / Manager):**
    - Senior inspects all 5 sections, observations, and reconciliations.
    - Action A: `"Approve & Sign-Off"` $\rightarrow$ Records senior signature, review date, sign-off remarks; audit status becomes `APPROVED`.
    - Action B: `"Request Revision"` $\rightarrow$ Prompts for senior review queries/remarks; audit status returns to `REVISION_REQUESTED` so Junior can address queries.
  - **Step 3: Client Release & Report Delivery (Junior / Senior):**
    - Unlocked only when audit status is `APPROVED`.
    - Action: `"Release Report to Client"`.
    - Generates client-facing Zero-Merge Excel package, auto-saves to `gst_returns_data/<Client>/<FY>/<Month>/Released to Client/`, and enables 1-click WhatsApp / Email delivery notice.
    - Audit status becomes `RELEASED`.

---

## 2. Technical Architecture & Constraints
1. **Strict Zero-Merge Architecture:** Multi-tab audit report export (`Monthly_Audit_Working_Paper_{Client}_{Month}.xlsx`) must follow zero cell merges (`ws['!merges'] = []`) to preserve Excel sorting, filtering, and XLOOKUP formulas.
2. **Persistent Storage:** Store monthly audit sheets, checklists, sample vouchers, and pending points in SQLite (`monthly_audits`, `audit_checklists`, `audit_observations`, `audit_pending_points`).
3. **Integration with Existing Modules:**
   - Reuse `src/lib/tallyApi.ts` for Tally live data fetching (Sales, Purchase, Journal, Bank, Cash, Daybook).
   - Link with GST Reco Engine (`src/lib/reconciliation.ts`), GSTR-1 (`src/lib/gstr1Engine.ts`), GSTR-3B (`src/lib/gstr3bEngine.ts`), and TDS Consolidator (`src/lib/tdsEngine.ts`).
   - Seamless navigation from Audit Module (`src/pages/AuditModule.tsx`).
