# Forensic Auditing & Fraud Detection Memory File
This file serves as a persistent memory module for forensic audits, Benford's Law tests, voucher sequence gap detectors, and journal anomalies.

## Module Location
- **Forensic Engine:** `src/lib/auditEngine.ts`
- **Dashboard / UI Controllers:** `src/pages/ForensicAudit.tsx`

## Core Algorithms & Functions
1. **Benford's Law Analysis (`applyBenfordsLaw(vouchers)`)**
   - Implements Benford's first-digit statistical distribution check.
   - Extracts the leading digit (1-9) of voucher transaction amounts.
   - Computes actual vs expected distribution percentages.
   - Flags anomalies where specific digits (e.g. 5 or 9) deviate significantly from Benford's distribution curve, which suggests artificial transaction creation or split bills.
2. **Voucher Number Gap Detector (`detectVoucherNumberGaps(vouchers)`)**
   - Scans alphanumeric voucher numbers sequentially.
   - Segregates the numeric components from prefix/suffix strings.
   - Flags gaps or jumps in sequence, suggesting deleted vouchers or unrecorded transactions.
3. **Journal Anomaly Analyzer (`analyzeJournalEntries(vouchers)`)**
   - Scrutinizes journal ledgers for high-risk transactional patterns:
     - **Round Sum Transactions:** Detects large round sums (e.g. ₹5,00,000, ₹10,00,000) that lack penny variance, which frequently indicate unverified capital withdrawals, provisions, or adjustments.
     - **Off-hour or Non-Business Day Entries:** Identifies journal entry dates falling on Sundays or national holidays.
     - **Debits to Cash / Credits to Equity:** Flags abnormal account pairings (e.g. direct cash debits matched against equity reserves) bypassing normal bank routes.
     - **Dormant Vendor Activity:** Flags high-value payments or purchases made to vendors with no transaction history for the preceding 180+ days.
