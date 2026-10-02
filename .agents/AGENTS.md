# TDS Consolidator & Reconciliation Engine — Workspace Memory & Architecture Rules

## Module Overview & File Locations

- **`src/pages/TdsReconciliation.tsx`**: Main React UI component for the TDS Reconciliation module. Handles step navigation (0: Tally Data Ingestion & Ledger Mapping, 1: 26Q Ingestion, 2: Party Master Review, 3: Reconciliation Results), FY selection, live Tally connection, and manual entry fallbacks.
- **`src/lib/tallyApi.ts`**: Standalone XML HTTP API connector for TallyPrime (port 9000). Queries company info, ledger masters (GSTIN, PAN, parent group hierarchy), voucher entries (Journal, Purchase, Payment, Debit/Credit Note), and closing/opening balances across all groups.
- **`src/lib/tdsEngine.ts`**: Core client-side calculation engine for Advance TDS Audit, Form 26Q vs Books reconciliation, threshold gatekeeping, statutory rate applied logic, and styled Excel exports (`exceljs`).
- **`tds_routes.js`**: Express backend API routes (`/api/tds/reconcile`, `/api/tds/ledgers`, `/api/tds/remove-unmapped`, `/api/tds/parties`, etc.) executing server-side chronological reconciliation and SQLite DB persistence.
- **`server.cjs`**: Bundled backend server entry containing production route definitions synced with `tds_routes.js`.

---

## Critical Execution & Business Rules

### 1. TDS Section Resolution Hierarchy (No Discard Rule)
To prevent Tally transactions from being mistakenly dropped and vendors being incorrectly marked as "Missing in Books":
- **Priority 1**: Direct mapping in `Tally_Ledgers` DB (`mapped_section_code`).
- **Priority 2**: Extract section code from `tdsLedgerName` (e.g., `194C TDS @1%`, `TDS u/s 194J`).
- **Priority 3**: Extract section code from `ledgerName` (e.g., `Vehicle Hire 194C`).
- **Priority 4**: Party Section Map (sections used by other vouchers of the same party).
- **Priority 5**: Party Master DB mapped section code.
- **Priority 6**: Match section reported in Form 26Q (TRACES) for that party/PAN.
- **Priority 7**: Default fallback to `'194C'` for any transaction with spend or actual TDS in Books.

### 2. Tally XML Ingestion Rules
- `buildVoucherQueryXml` must query vouchers using `NOT $IsCancelled AND NOT $IsOptional` rather than strict `$VoucherTypeName = "Payment"` to avoid missing custom user voucher types (`Bank Payment`, `TDS Journal`, `Purchase GST`).
- `isPartyLedger` detection uses `<PARTYLEDGERNAME>` / `<PARTYNAME>` tags from Tally XML directly, with fallbacks to credit entries in Journal/Purchase vouchers and hierarchy group matching (`CREDITOR`, `DEBTOR`, `VENDOR`, `PARTY`, `SUPPLIER`).

### 3. Closing Balance & Party Lookup Rules
- Party closing balance map uses multi-key lookup:
  1. Exact candidate name
  2. Clean name (stripping bracketed text like `(Vcr...)` or `(Cr)`)
  3. Alphanumeric string (`/[^A-Z0-9]/g`)

### 4. Code Maintenance Guidelines
- Whenever updating section resolution or matching algorithms in `tds_routes.js`, **always sync the corresponding logic in `server.cjs` and `src/lib/tdsEngine.ts`**.
- Keep responses concise and focused directly on the TDS module.
- Always run `npx tsc --noEmit` after code changes to verify type safety.
