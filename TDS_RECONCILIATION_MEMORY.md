# TDS Reconciliation & 26AS Matching Memory File
This file serves as a persistent memory module for TDS Reconciliation (Books vs Form 26AS / TRACES), PAN checking, and rate variance verification.

## Module Location
- **Engine Path:** `src/lib/tdsEngine.ts`
- **Dashboard / UI Controllers:** `src/pages/TdsReconciliation.tsx`

## Key Functions & Flow
1. **`computeBooksTdsLiability(booksEntries)`**
   - Processes internal general ledgers (expense bills) to identify potential TDS applicability.
   - Groups book expenses by vendor TAN/PAN and section code (e.g. 194C, 194J).
   - Computes expected TDS deduction based on statutory rates (e.g. 1% or 2% for 194C, 10% for 194J) and checks if the single bill or annual aggregate threshold limits are breached.
2. **`reconcileTds(booksLiability, tracesData, confirmedMatches)`**
   - Matches internal books records against external Form 26AS / TRACES filed data.
   - **Grouping Key:** Performs comparisons using a compounded key of `PAN_Section` (e.g. `ABCDE1234F_194C`).
   - **Matching Cascades:**
     - **Stage 1 (Exact PAN Match):** Links ledger to 26AS if PANs match exactly.
     - **Stage 2 (Name Matching):** If PAN is invalid or missing, applies fuzzy name normalization (`normalizePartyName`) to match transactions.
   - Segregates reconciliations into matches, discrepancies, shortages, or complete non-deductions.
3. **`exportTdsReport(results, companyName)`**
   - Generates an Excel sheet with sheets for:
     - **Applicable:** Verified transactions with accurate PAN/Section matches.
     - **PAN Required / Missing:** Highlights records where PAN is absent, triggering flat 20% penalty deductions u/s Section 206AA.
     - **Under-deduction:** Flags items where the rate applied was less than the statutory rate.

## Statutory Rules & Finance Act 2025 Updates
- **Threshold Alerts:** Tracks annual payments u/s 194C (₹1L aggregate), 194J (₹50k aggregate), 194I (₹2.4L aggregate) to flag when TDS liability was triggered but books failed to deduct.
- **PAN Penalty (Section 206AA):** Enforces a mandatory flat 20% rate check (or 5% u/s 194Q) if the deductee fails to furnish a valid PAN.
- **Section mappings:** Automatically redirects old section labels (e.g. 194C) to new simplified tax codes introduced in Budget/Finance Acts (e.g. `393(1)_Sl_6i` u/s 2025).
