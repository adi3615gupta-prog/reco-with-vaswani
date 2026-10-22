# Phase 3: Automated Scrutiny Tests & Audit Trail Hardening — Context

**Gathered:** 2026-10-22  
**Status:** In Planning  

<domain>
## Phase Boundary

Phase 3 focuses on comprehensive test coverage for the 6-pass debit note reconciliation engine and 1-to-many subset-sum batch solver, and hardening the system with an immutable, persistent audit logging architecture for user override actions (Manual Match, Force Match, Unlink Match, Party Auto-Match) requiring statutory practitioner justification and timestamping per requirement `AUDIT-01`.

</domain>

<decisions>
## Implementation Decisions

### Comprehensive Scrutiny Test Suite (Plan 03-01)
- **D-01 (Expanded Edge-Case Scrutiny Suite):** Build `src/test/debitNoteScrutiny.test.ts` to complement `src/test/debitNoteEngine.test.ts`, focusing rigorously on combinatorial and edge-case testing:
  - Bounded subset-sum solver combinations ($|S| \in [2, 15]$) with extraneous non-matching notes in candidate pools.
  - Value and tax tolerance boundary thresholds (within ₹25 value, within ₹15 tax, $> ₹25$ failure boundaries).
  - Multi-prefix stripping edge cases (complex GST series, slash/dash variations, fiscal year transitions).
  - Generic token permutations (`DN`, `CN`, `DEBITNOTE`, `BLANK`, `DN(BLANK)`, casing, and whitespace).
  - Accounting zero double-counting invariant ($\sum \text{Reconciled} = \sum \text{Raw Input}$) across extreme dataset distributions (50+ batches and mixed normal/debit invoices).
  — **Reversibility:** reversible — pure test suite, zero production code side effects.

### Immutable Audit Trail Storage & Schema (Plan 03-02)
- **D-02 (Persistent SQLite Audit Table):** Create a dedicated SQLite table `reconciliation_audit_log` in `network_data.db` (initialized in `server.js`):
  ```sql
  CREATE TABLE IF NOT EXISTS reconciliation_audit_log (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    iso_timestamp TEXT NOT NULL,
    practitioner_username TEXT NOT NULL,
    client_gstin TEXT,
    company_name TEXT,
    action_type TEXT NOT NULL, -- 'FORCE_MATCH' | 'MANUAL_MATCH' | 'UNLINK' | 'AUTO_MATCH_PARTY'
    invoice_no_pr TEXT,
    invoice_no_2b TEXT,
    original_status TEXT,
    new_status TEXT NOT NULL,
    taxable_diff REAL,
    gst_diff REAL,
    justification TEXT NOT NULL,
    metadata TEXT -- JSON string with before/after state snapshots
  );
  ```
  — **Reversibility:** costly — establishes statutory compliance schema.

- **D-03 (Audit API Endpoints with Validation):**
  - `POST /api/audit/reconciliation-override`: Records an override log. Strictly requires `justification` (minimum 5 characters) and valid `action_type`.
  - `GET /api/audit/reconciliation-override`: Retrieves audit records with optional `client_gstin` / `company_name` filtering.
  - `GET /api/audit/reconciliation-override/export`: Returns audit logs formatted for Excel export or tabular review.
  — **Reversibility:** reversible.

- **D-04 (Offline / Desktop Resilience):** Provide client-side fallback storage via `localStorage` / `IndexedDB` (`src/lib/auditTrailService.ts`) so override operations succeed even when running purely offline or without active backend connectivity, automatically syncing when the backend is reachable.
  — **Reversibility:** reversible.

### Practitioner Override UX & Mandatory Justification Modal (Plan 03-02)
- **D-05 (Audit Justification Dialog):** Replace silent instant status mutations in `PartyWiseReport.tsx` (and `ResultsTable.tsx`) with an interactive `AuditJustificationModal`:
  - Presents before/after invoice comparison (Invoice No, Dates, Amounts, Differences).
  - Requires selecting or entering a statutory justification.
  - Provides quick-select audit presets:
    - `"Vendor confirmed invoice typo in GSTR-1"`
    - `"Rounding difference under statutory tolerance accepted by recipient"`
    - `"Credit/Debit note adjusted against previous period invoice"`
    - `"Party legal name variation verified against PAN master"`
    - `"Custom practitioner note..."`
  - Records logged-in practitioner identity and exact local ISO timestamp.
  — **Reversibility:** reversible.

- **D-06 (Audit Trail in Excel Exports):** Update `src/lib/excel/builders/masterExport.ts` and `partyWiseExport.ts` to append an optional or automatic `Audit Trail` tab when overrides are present, ensuring zero merged cells (`ws['!merges'] = []`) and full statutory transparency.
  — **Reversibility:** reversible.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — Requirement `AUDIT-01`.
- `.planning/ROADMAP.md` — Phase 3 goals and success criteria.
- `.agents/AGENTS.md` — Section 1 & Section 2 (Reconciliation Engine & Vendor Party-Wise Report).
- `src/components/PartyWiseReport.tsx` — Override action handlers (`handleForceMatch`, `handleManualMatch`, `handleUnlinkMatch`).
- `src/lib/debitNoteEngine.ts` — Core 6-pass waterfall and subset-sum batch solver.
- `src/test/debitNoteEngine.test.ts` — Existing debit note test suite.
- `server.js` — Backend SQLite database and Express server.

</canonical_refs>

<code_context>
## Existing Code Insights

### Current Deficiencies in Overrides
- In `PartyWiseReport.tsx` (lines 209-233), `handleForceMatch` directly mutates `status` to `'Perfect Match'` and overwrites differences to 0 with a hardcoded remark `'Force Matched by User'`.
- No user justification is gathered or persisted.
- No history of prior values is preserved.
- No SQLite audit table exists for tracking reconciliations.

</code_context>
