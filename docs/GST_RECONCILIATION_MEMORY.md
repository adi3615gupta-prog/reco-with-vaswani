# GST Purchase Reconciliation & ITC Matching Memory File
This file serves as a persistent memory module for the GST Input Tax Credit (ITC) matching engine, rules, and structures.

---

## 1. Core Matching Engine

- **Path:** `src/lib/reconciliation.ts`
- **Primary Pages:** `src/pages/Reconciliation.tsx`, `src/pages/GSTR2BTracker.tsx`

### Data Structures & Types
```typescript
export interface InvoiceRecord {
  gstin: string;
  invoiceNumber: string;
  invoiceDate: string;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  taxableValue: number;
  partyName: string;
  source: 'books' | 'gstr2b';
  section?: 'B2B' | 'CDNR' | 'B2BA' | 'CDNRA';
  filingDate?: string;
  filingStatus?: 'Yes' | 'No';
  itcEligibility?: 'Eligible' | 'Ineligible';
  itcBlockedReason?: string;
}

export interface MatchingResult {
  booksRecord?: InvoiceRecord;
  gstr2bRecord?: InvoiceRecord;
  status: 'Matched' | 'Missing in GSTR-2B' | 'Missing in Books' | 'Mismatch' | 'Date Mismatch';
  variance: {
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    cess: number;
    totalTax: number;
  };
  notes: string[];
}
```

### Reconciliation Pipeline & Matching Steps
1. **Normalization**:
   - GSTINs normalized to uppercase and trimmed using `normalizeGstin(gstin)`.
   - Invoice numbers cleaned using `cleanInvoiceNumber(invNum)`.
     - *Cleaning rules*: Removes leading zeros, symbols (slashes, hyphens, spaces), and normalizes prefixes. For example, `INV/2024-25/0099` is cleaned to `20242599` or standardized formats.
2. **Matching Stages**:
   - **Stage 1: Perfect Match**: exact GSTIN + exact cleaned Invoice Number + exact Amount.
   - **Stage 2: Tolerance Match**: exact GSTIN + exact cleaned Invoice Number + Amount difference within threshold tolerance (e.g. ₹1.00 or custom value).
   - **Stage 3: Date Mismatch**: exact GSTIN + exact cleaned Invoice Number + amount matched, but date differences fall outside the window.
   - **Stage 4: Residual Categorization**: Unmatched records are flagged as `Missing in GSTR-2B` (present in Books only) or `Missing in Books` (present in Portal GSTR-2B only).
3. **GSTIN Conflicts Check (`detectGstinIssues`)**:
   - Scans records for instances where the same supplier name is mapped to multiple GSTINs or where different names represent the same GSTIN, flagging exceptions.

---

## 2. Statutory Compliance Rules & Logic

### Section 16(4) Time Limit Compliance
- Checks if prior financial year invoices are claimed within the statutory time limit u/s Section 16(4) of the CGST Act (the earlier of November 30th of the following financial year, or the date of filing the relevant Annual Return).
- Flags potential disallowance warnings on invoices dated in the prior FY that are uploaded/claimed after the deadline.

### Threshold Tolerance Settings
- Implements custom round-off/variance filters (default ₹1.00 or user-configured up to ₹10.00). If the difference in CGST/SGST/IGST is within this limit, the matching status is marked as `Matched` with variance details, preventing unnecessary reconciliation exceptions.

### Supplier GSTR-3B Filing Compliance
- cross-references portal GSTR-2B records to verify if the supplier has filed their GSTR-3B (Filing Status: `'Yes'` / `'No'`).
- Flags ITC on invoices from non-compliant suppliers (where GSTR-3B filing is pending for consecutive months) as **Restricted / Blocked** to comply with Section 16(2)(c) provisions.
