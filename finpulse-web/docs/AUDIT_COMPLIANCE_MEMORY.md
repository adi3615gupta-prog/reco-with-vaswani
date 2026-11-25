# Audit & Cash Compliance Memory File
This file serves as a persistent memory module for Debtors & Creditors Ageing calculations, Cash Ledger Compliance Audits, SA 520 Analytical Procedures, Forensic Auditing, Direct Expense Auditing, and SA 530 Audit Sampling.

## Module Locations
- **Engine Path:** `src/lib/auditEngine.ts`
- **Primary Pages:** `src/pages/AuditModule.tsx`

---

## 1. SA 530 Audit Sampling & Voucher Verification Hub

Allows CAs to extract representative transaction samples from the Tally database population and compile audit working papers.

### Data Structures & Types
```typescript
export interface SampleItem {
  id: string; // unique transaction key
  date: string;
  voucherType: string;
  voucherNumber: string;
  ledgerName: string;
  amount: number;
  isDebit: boolean;
  stratum?: string; // High / Medium / Low
}

export interface SamplingConfig {
  method: 'high-value' | 'random' | 'systematic' | 'stratified';
  highValueThreshold?: number;
  randomCount?: number;
  systematicInterval?: number;
  stratifiedPercentHigh?: number; // e.g. 50%
  stratifiedPercentMedium?: number; // e.g. 15%
  stratifiedPercentLow?: number; // e.g. 5%
}

export interface AuditVoucherWorkingPaper {
  sampleId: string;
  verificationStatus: 'Unverified' | 'Verified' | 'Document Missing' | 'Query Raised';
  auditorRemarks: string;
  verifiedBy?: string;
  verificationDate?: string;
}
```

### Sampling Algorithms (`runAuditSampling`)
1. **High-Value Focus**: Filters the pool to extract transactions where `amount >= config.highValueThreshold` (default ₹1,00,000).
2. **Random Sampling**: Sorts transactions by id and systematically steps through the population using a pseudo-random multiplier to ensure deterministic selection (repeatable audits).
3. **Systematic / Interval Selection**: Sorts the list chronologically and picks every $N$-th transaction starting from a set start index.
4. **Stratified Sampling**: Segregates vouchers into three value-based strata:
   - High Strata: `amount >= 100000`
   - Medium Strata: `amount >= 20000 && amount < 100000`
   - Low Strata: `amount < 20000`
   Applies customized sample percentages (e.g. 50% High, 15% Medium, 5% Low) to select representative samples from each bucket.

### UI States & Auto-Persistence
- **Selected Sub-module**: `selectedSubModule === 'audit-sampling'`
- **Persistence**: Verification statuses and notes auto-save to `localStorage` under `reco_audit_sampling_${companyName}_${fromDate}_${evaluationDate}` on input changes.
- **Excel Exporter (`exportSamplingToExcel`)**: Exports a styled 2-tab report detailing a Summary dashboard of sample sizes/compliance ratios, and the Detailed Working Paper verification log.

---

## 2. Direct Expense Auditor Module

Detects direct expense payments (debited to Direct/Indirect expenses and credited directly to Cash/Bank) that bypass Sundry Creditor accounts.

### Auditing Logic & Rules
1. **Voucher Reconstruction**: Groups flat ledger entry lines in `allVouchersList` using compound keys (`date + "_" + voucherType + "_" + voucherNumber`).
2. **Bypass Flagging Rules**: A voucher is flagged as a direct payment bypass if it contains:
   - At least one debit to an **Expense** ledger.
   - At least one credit to a **Cash/Bank** ledger.
   - **Zero** debits or credits to **Sundry Creditor** ledgers.
3. **Statutory Compliance Risk Categories**:
   - **High Risk**: Cash payments > ₹10,000 (disallowed u/s 40A(3) of IT Act), or bank payments > ₹50,000 bypassing standard ledger control (MSME disclosure gaps/TDS auditing risks).
   - **Medium Risk**: Payments between ₹10,000 and ₹50,000.
   - **Low Risk**: Payments under ₹10,000.

---

## 3. Cash Ledger Compliance Auditor

### Core Rules
- **Section 40A(3)**: Cash payments > ₹10,000.
- **Section 269SS & 269T**: Cash loan receipts or repayments > ₹20,000.
- **Negative Cash**: Walk transactions chronologically by date to check if running cash balance goes below zero.

---

## 4. Debtors & Creditors Ageing Auditor

### FIFO Ageing Algorithm
Outstanding balances are matched u/s FIFO rules and grouped into ageing buckets: `0-30`, `31-60`, `61-90`, `91-120`, and `120+` days.
