# Financial Statements & Trial Balance Mapping Memory File
This file serves as a persistent memory module for the Trial Balance Ingestion, mapping, and Schedule III reporting structures.

## Module Location
- **Storage / Logic Path:** `src/lib/finStatements.storage.ts`, `src/lib/finStatements.types.ts`, `src/lib/finStatements.seed.ts`
- **UI Components:** `src/components/finstatements/TBImportMapping.tsx`, `src/components/finstatements/FinancialReports.tsx`, `src/components/finstatements/FixedAssetsRegister.tsx`
- **Primary Pages:** `src/pages/FinancialStatements.tsx`

## Key Functions & Flow
1. **Trial Balance Mapping:**
   - Ingests standard Excel files with Ledger names, opening balances, transaction debits/credits, and closing balances.
   - Maps each ledger to a Schedule III group code (e.g. 2001 Share Capital, 1101 Inventory).
   - Functions like `countUnmappedEntries()` highlight items needing manual grouping.
2. **`computeBalanceCheck()`**
   - Validates that the entire Trial Balance debits equal credits (`debitCount` vs `creditCount`).
   - Flag discrepancies if the TB fails to balance.
3. **`aggregateNotes(suppressZeros)`**
   - Combines individual ledger balances into grouped Note References (e.g. Note 1 for Share Capital, Note 2 for reserves) forming the basis for Schedule III notes.
4. **`validateMappings()`**
   - Analyzes mapping logic to flag warnings, such as asset accounts having credit balances, or unmapped ledger entries.
5. **`yearEndRollForward()`**
   - Rotates current year closing balances to next year's opening balances, clears P&L ledger accounts, and moves Net Profit/Loss to Reserves & Surplus.

## Schedule III Data Schemas
- **Liabilities & Equity:** Shareholder Funds (Share Capital, Reserves & Surplus), Non-Current Liabilities (Long-term borrowings), Current Liabilities (Trade payables, short-term provisions).
- **Assets:** Non-Current Assets (Property, Plant & Equipment, Non-current investments), Current Assets (Inventories, Trade receivables, Cash & cash equivalents, short-term loans & advances).
- **P&L Headings:** Revenue from Operations, Other Income, Expenses (Cost of materials, employee benefit expenses, finance costs, depreciation, other expenses).
