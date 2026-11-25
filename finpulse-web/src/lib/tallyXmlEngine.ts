/**
 * tallyXmlEngine.ts — High-Performance, Audit-Grade Tally XML Generation & Validation Suite.
 * 
 * Replaces macro-dependent, insecure Excel tools (EasyTally) with a local-first,
 * zero-telemetry TypeScript engine that converts tabular vouchers (Dual Entry,
 * Multi Entry, Quick Entry) and Master Ledgers into official Tally Prime / Tally.ERP 9
 * compliant XML import packages.
 */

// ============================================================================
// 1. DATA MODELS & INTERFACES
// ============================================================================

export type TallyVoucherType =
  | 'Receipt'
  | 'Payment'
  | 'Contra'
  | 'Journal'
  | 'Sales'
  | 'Purchase'
  | 'Debit Note'
  | 'Credit Note'
  | string;

export interface DualEntryVoucher {
  id?: string;
  guid?: string;
  originalVoucherNumber?: string;
  originalDate?: string;
  date: string; // YYYY-MM-DD or DD/MM/YYYY or YYYYMMDD
  voucherType: TallyVoucherType;
  voucherNumber?: string;
  referenceNumber?: string;
  referenceDate?: string;
  debitLedger: string;
  creditLedger: string;
  amount: number;
  narration?: string;
  allEntries?: Array<{ ledgerName: string; amount: number; isDebit: boolean }>;
  legs?: MultiEntryLeg[];
}

export interface MultiEntryLeg {
  ledgerName: string;
  amount: number; // Negative for Debit, Positive for Credit
}

export interface MultiEntryVoucher {
  id?: string;
  date: string;
  voucherType: TallyVoucherType;
  voucherNumber?: string;
  referenceNumber?: string;
  referenceDate?: string;
  narration?: string;
  legs: MultiEntryLeg[];
  checkTotal?: number; // Sum of legs (should be 0)
}

export interface QuickEntryColumn {
  key: string;
  ledgerName: string;
  isDebit?: boolean; // Default false (Credit leg e.g. Tax/Sales/Roundoff)
}

export interface QuickEntryRow {
  id?: string;
  date: string;
  voucherNumber?: string;
  referenceNumber?: string;
  referenceDate?: string;
  narration?: string;
  partyLedger: string; // Variable Party Ledger (Debit/Credit opposite of columns)
  amounts: Record<string, number>; // columnKey -> numeric amount
}

export interface QuickEntryTemplate {
  voucherType: TallyVoucherType;
  columns: QuickEntryColumn[];
  rows: QuickEntryRow[];
}

export interface MasterLedger {
  id?: string;
  ledgerName: string;
  parentGroup: string; // e.g. 'Sundry Creditors', 'Sundry Debtors', 'Bank Accounts'
  openingBalance?: number;
  alias?: string;
  addressLine1?: string;
  addressLine2?: string;
  country?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  registrationType?: 'Regular' | 'Composition' | 'Unregistered' | 'Consumer' | string;
}

export interface ImpactSummaryRow {
  ledgerName: string;
  count: number;
  totalDebit: number;
  totalCredit: number;
  netImpact: number; // totalDebit - totalCredit
}

export interface ValidationIssue {
  rowIndex: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

// ============================================================================
// 2. MASTER REFERENCE LISTS
// ============================================================================

export const STANDARD_VOUCHER_TYPES: readonly string[] = [
  'Receipt',
  'Payment',
  'Purchase',
  'Sales',
  'Journal',
  'Contra',
  'Debit Note',
  'Credit Note',
];

export const STANDARD_MASTER_GROUPS: readonly string[] = [
  'Bank Accounts',
  'Bank OCC A/c',
  'Bank OD A/c',
  'Branch / Divisions',
  'Capital Account',
  'Cash-in-Hand',
  'Current Assets',
  'Current Liabilities',
  'Deposits (Asset)',
  'Direct Expenses',
  'Direct Incomes',
  'Duties & Taxes',
  'Fixed Assets',
  'Indirect Expenses',
  'Indirect Incomes',
  'Investments',
  'Loans & Advances (Asset)',
  'Loans (Liability)',
  'Misc. Expenses (ASSET)',
  'Provisions',
  'Purchase Accounts',
  'Reserves & Surplus',
  'Retained Earnings',
  'Sales Accounts',
  'Secured Loans',
  'Stock-in-Hand',
  'Sundry Creditors',
  'Sundry Debtors',
  'Suspense A/c',
  'Unsecured Loans',
];

// ============================================================================
// 3. SANITIZATION & NORMALIZATION UTILITIES
// ============================================================================

/**
 * Escapes characters that are reserved or illegal in XML.
 * Prevents XML injection and XML parse failures in Tally.
 */
export function escapeXml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return '';
  const s = String(str).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function unescapeXml(safe: string | null | undefined): string {
  if (!safe) return '';
  return String(safe)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Parses and formats dates into Tally's official YYYYMMDD format.
 * Supports ISO strings (YYYY-MM-DD), Indian formats (DD/MM/YYYY, DD-MM-YYYY),
 * raw YYYYMMDD, and Date objects.
 */
export function formatTallyDate(input: string | Date | null | undefined): string {
  if (!input) return '';
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return '';
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, '0');
    const d = String(input.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  const s = String(input).trim();
  if (/^\d{8}$/.test(s)) return s; // already YYYYMMDD

  // Format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}${m}${d}`;
  }

  // Format: DD-MM-YYYY or DD/MM/YYYY
  const indMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (indMatch) {
    const d = indMatch[1].padStart(2, '0');
    const m = indMatch[2].padStart(2, '0');
    const y = indMatch[3];
    return `${y}${m}${d}`;
  }

  // Fallback try standard Date parse
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  return '';
}

/**
 * Cleans user-pasted amount values, stripping currency symbols, commas, quotes,
 * and handling parenthesized negative values like `(5,000.00)` -> `-5000`.
 */
export function cleanNumericAmount(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val * 100) / 100;

  let s = String(val).trim();
  // Strip single quotes often prepended by Excel
  s = s.replace(/^'/, '');
  // Parentheses indicate negative in accounting
  const isParenNeg = /^\(.*\)$/.test(s);
  // Remove commas, currency symbols, whitespace
  s = s.replace(/[₹$€£,\s()]/g, '');

  let num = parseFloat(s);
  if (isNaN(num)) return 0;
  if (isParenNeg && num > 0) num = -num;
  return Math.round(num * 100) / 100;
}

// ============================================================================
// 4. PRE-IMPORT VALIDATION ENGINES
// ============================================================================

/**
 * Validates Dual Entry Vouchers.
 */
export function validateDualEntryVouchers(
  vouchers: DualEntryVoucher[],
  validTypes: readonly string[] = STANDARD_VOUCHER_TYPES
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  vouchers.forEach((v, idx) => {
    const row = idx + 1;

    // Date validation
    const dateFormatted = formatTallyDate(v.date);
    if (!v.date || !dateFormatted) {
      issues.push({
        rowIndex: row,
        field: 'date',
        message: `Row ${row}: Invalid or missing Voucher Date.`,
        severity: 'error',
      });
    }

    // Voucher Type validation
    if (!v.voucherType) {
      issues.push({
        rowIndex: row,
        field: 'voucherType',
        message: `Row ${row}: Missing Voucher Type.`,
        severity: 'error',
      });
    } else if (!validTypes.some((t) => t.toLowerCase() === v.voucherType.toLowerCase())) {
      issues.push({
        rowIndex: row,
        field: 'voucherType',
        message: `Row ${row}: '${v.voucherType}' is not in the standard Voucher Type list.`,
        severity: 'warning',
      });
    }

    // Ref Date check
    if (v.referenceDate) {
      const refFormatted = formatTallyDate(v.referenceDate);
      if (!refFormatted) {
        issues.push({
          rowIndex: row,
          field: 'referenceDate',
          message: `Row ${row}: Invalid Reference Date format.`,
          severity: 'error',
        });
      } else if (dateFormatted && refFormatted > dateFormatted) {
        issues.push({
          rowIndex: row,
          field: 'referenceDate',
          message: `Row ${row}: Reference Date (${v.referenceDate}) is greater than Voucher Date (${v.date}).`,
          severity: 'warning',
        });
      }
    }

    // Ledger checks
    if (!v.debitLedger || !v.debitLedger.trim()) {
      issues.push({
        rowIndex: row,
        field: 'debitLedger',
        message: `Row ${row}: Debit ledger name is missing.`,
        severity: 'error',
      });
    }

    if (!v.creditLedger || !v.creditLedger.trim()) {
      issues.push({
        rowIndex: row,
        field: 'creditLedger',
        message: `Row ${row}: Credit ledger name is missing.`,
        severity: 'error',
      });
    }

    if (
      v.debitLedger &&
      v.creditLedger &&
      v.debitLedger.trim().toLowerCase() === v.creditLedger.trim().toLowerCase()
    ) {
      issues.push({
        rowIndex: row,
        field: 'debitLedger',
        message: `Row ${row}: Debit and Credit ledgers cannot be identical (${v.debitLedger}).`,
        severity: 'error',
      });
    }

    // Amount check
    const amt = cleanNumericAmount(v.amount);
    if (amt <= 0) {
      issues.push({
        rowIndex: row,
        field: 'amount',
        message: `Row ${row}: Voucher amount must be a positive number greater than zero.`,
        severity: 'error',
      });
    }
  });

  return issues;
}

/**
 * Validates Multi Entry Vouchers with zero-balance verification.
 */
export function validateMultiEntryVouchers(
  vouchers: MultiEntryVoucher[],
  validTypes: readonly string[] = STANDARD_VOUCHER_TYPES
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  vouchers.forEach((v, idx) => {
    const row = idx + 1;

    // Date
    const dateFormatted = formatTallyDate(v.date);
    if (!v.date || !dateFormatted) {
      issues.push({
        rowIndex: row,
        field: 'date',
        message: `Row ${row}: Invalid or missing Voucher Date.`,
        severity: 'error',
      });
    }

    // Voucher Type
    if (!v.voucherType) {
      issues.push({
        rowIndex: row,
        field: 'voucherType',
        message: `Row ${row}: Missing Voucher Type.`,
        severity: 'error',
      });
    }

    // Legs count
    const validLegs = (v.legs || []).filter(
      (l) => l.ledgerName && l.ledgerName.trim() && Math.abs(cleanNumericAmount(l.amount)) > 0.0001
    );

    if (validLegs.length < 2) {
      issues.push({
        rowIndex: row,
        field: 'legs',
        message: `Row ${row}: Multi-entry voucher must contain at least 2 complete ledger legs.`,
        severity: 'error',
      });
    }

    // Sum check (Debits negative, Credits positive => Sum must be 0)
    let sum = 0;
    validLegs.forEach((leg) => {
      sum += cleanNumericAmount(leg.amount);
    });
    sum = Math.round(sum * 100) / 100;

    if (Math.abs(sum) > 0.01) {
      issues.push({
        rowIndex: row,
        field: 'checkTotal',
        message: `Row ${row}: Voucher is unbalanced! Net difference: ₹${sum.toFixed(
          2
        )} (Debits must be negative, Credits positive, sum must be 0).`,
        severity: 'error',
      });
    }
  });

  return issues;
}

/**
 * Validates Master Ledgers.
 */
export function validateMasterLedgers(
  ledgers: MasterLedger[],
  validGroups: readonly string[] = STANDARD_MASTER_GROUPS
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  ledgers.forEach((l, idx) => {
    const row = idx + 1;

    if (!l.ledgerName || !l.ledgerName.trim()) {
      issues.push({
        rowIndex: row,
        field: 'ledgerName',
        message: `Row ${row}: Ledger name is required.`,
        severity: 'error',
      });
    }

    if (!l.parentGroup || !l.parentGroup.trim()) {
      issues.push({
        rowIndex: row,
        field: 'parentGroup',
        message: `Row ${row}: Master parent group is required.`,
        severity: 'error',
      });
    } else if (!validGroups.some((g) => g.toLowerCase() === l.parentGroup.toLowerCase())) {
      issues.push({
        rowIndex: row,
        field: 'parentGroup',
        message: `Row ${row}: Group '${l.parentGroup}' is not a standard Tally group. Ensure it exists in your Tally company.`,
        severity: 'warning',
      });
    }

    // GSTIN format check
    if (l.gstin && l.gstin.trim()) {
      const gstinTrimmed = l.gstin.trim().toUpperCase();
      if (!/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstinTrimmed)) {
        issues.push({
          rowIndex: row,
          field: 'gstin',
          message: `Row ${row}: GSTIN '${l.gstin}' does not match standard 15-character GSTIN format.`,
          severity: 'warning',
        });
      }
    }

    // PIN code check
    if (l.pincode && l.pincode.trim()) {
      if (!/^\d{6}$/.test(l.pincode.trim())) {
        issues.push({
          rowIndex: row,
          field: 'pincode',
          message: `Row ${row}: PIN code '${l.pincode}' should be a 6-digit numeric code.`,
          severity: 'warning',
        });
      }
    }
  });

  return issues;
}

// ============================================================================
// 5. AUTO-BALANCE & SCRUTINY ALGORITHMS
// ============================================================================

/**
 * Automatically adjusts residual rounding or allocation differences in a multi-entry voucher.
 * If difference is non-zero, it adjusts or adds a roundoff leg so that the algebraic sum is 0.
 */
export function autoBalanceMultiEntry(
  voucher: MultiEntryVoucher,
  roundoffLedger: string = 'Round Off'
): MultiEntryVoucher {
  const clonedLegs = (voucher.legs || []).map((l) => ({
    ledgerName: l.ledgerName,
    amount: cleanNumericAmount(l.amount),
  }));

  let sum = 0;
  clonedLegs.forEach((l) => (sum += l.amount));
  sum = Math.round(sum * 100) / 100;

  if (Math.abs(sum) <= 0.005) {
    return { ...voucher, legs: clonedLegs, checkTotal: 0 };
  }

  // To balance: we need an offsetting amount of -sum
  const diff = -sum;
  const existingRoundoffIdx = clonedLegs.findIndex(
    (l) => l.ledgerName.trim().toLowerCase() === roundoffLedger.trim().toLowerCase()
  );

  if (existingRoundoffIdx >= 0) {
    clonedLegs[existingRoundoffIdx].amount =
      Math.round((clonedLegs[existingRoundoffIdx].amount + diff) * 100) / 100;
  } else {
    clonedLegs.push({
      ledgerName: roundoffLedger,
      amount: Math.round(diff * 100) / 100,
    });
  }

  return {
    ...voucher,
    legs: clonedLegs,
    checkTotal: 0,
  };
}

/**
 * Scans across Dual Entry, Multi Entry, and Quick Entry vouchers to extract all unique
 * ledger names, deduplicating them and merging into a MasterLedger list.
 */
export function fetchLedgersFromVouchers(options: {
  dualVouchers?: DualEntryVoucher[];
  multiVouchers?: MultiEntryVoucher[];
  quickTemplates?: QuickEntryTemplate[];
  existingLedgers?: MasterLedger[];
}): MasterLedger[] {
  const existing = options.existingLedgers || [];
  const existingNames = new Set(existing.map((l) => l.ledgerName.trim().toLowerCase()));
  const newMasters: MasterLedger[] = [...existing];

  const candidateNames = new Set<string>();

  // From Dual
  (options.dualVouchers || []).forEach((v) => {
    if (v.debitLedger && v.debitLedger.trim()) candidateNames.add(v.debitLedger.trim());
    if (v.creditLedger && v.creditLedger.trim()) candidateNames.add(v.creditLedger.trim());
  });

  // From Multi
  (options.multiVouchers || []).forEach((v) => {
    (v.legs || []).forEach((l) => {
      if (l.ledgerName && l.ledgerName.trim()) candidateNames.add(l.ledgerName.trim());
    });
  });

  // From Quick
  (options.quickTemplates || []).forEach((t) => {
    (t.columns || []).forEach((c) => {
      if (c.ledgerName && c.ledgerName.trim()) candidateNames.add(c.ledgerName.trim());
    });
    (t.rows || []).forEach((r) => {
      if (r.partyLedger && r.partyLedger.trim()) candidateNames.add(r.partyLedger.trim());
    });
  });

  candidateNames.forEach((name) => {
    const lower = name.toLowerCase();
    if (!existingNames.has(lower)) {
      existingNames.add(lower);

      // Intelligent Group Inference
      let guessedGroup = 'Sundry Creditors';
      if (/bank|hdfc|icici|sbi|idfc|axis|kotak|pnb|cbin/i.test(name)) {
        guessedGroup = 'Bank Accounts';
      } else if (/cash/i.test(name)) {
        guessedGroup = 'Cash-in-Hand';
      } else if (/gst|cgst|sgst|igst|tax|tds|cess/i.test(name)) {
        guessedGroup = 'Duties & Taxes';
      } else if (/sales|revenue|turnover/i.test(name)) {
        guessedGroup = 'Sales Accounts';
      } else if (/purchase/i.test(name)) {
        guessedGroup = 'Purchase Accounts';
      } else if (/round\s*off/i.test(name)) {
        guessedGroup = 'Indirect Expenses';
      } else if (/rent|salary|wages|interest|freight|audit|legal/i.test(name)) {
        guessedGroup = 'Indirect Expenses';
      }

      newMasters.push({
        ledgerName: name,
        parentGroup: guessedGroup,
        country: 'India',
        openingBalance: 0,
      });
    }
  });

  return newMasters;
}

/**
 * Pre-Import Impact Scrutiny Engine.
 * Aggregates debit, credit, and net balance impact per ledger across all vouchers.
 */
export function computePreImportImpact(options: {
  dualVouchers?: DualEntryVoucher[];
  multiVouchers?: MultiEntryVoucher[];
  quickTemplates?: QuickEntryTemplate[];
}): ImpactSummaryRow[] {
  const ledgerMap = new Map<
    string,
    { count: number; totalDebit: number; totalCredit: number }
  >();

  function record(name: string, drAmt: number, crAmt: number) {
    if (!name || !name.trim()) return;
    const cleanName = name.trim();
    const existing = ledgerMap.get(cleanName) || { count: 0, totalDebit: 0, totalCredit: 0 };
    existing.count += 1;
    existing.totalDebit += drAmt;
    existing.totalCredit += crAmt;
    ledgerMap.set(cleanName, existing);
  }

  // 1. Dual Vouchers
  (options.dualVouchers || []).forEach((v) => {
    const amt = cleanNumericAmount(v.amount);
    if (amt > 0) {
      record(v.debitLedger, amt, 0);
      record(v.creditLedger, 0, amt);
    }
  });

  // 2. Multi Vouchers
  (options.multiVouchers || []).forEach((v) => {
    (v.legs || []).forEach((l) => {
      const amt = cleanNumericAmount(l.amount);
      if (amt < 0) {
        // Debit
        record(l.ledgerName, Math.abs(amt), 0);
      } else if (amt > 0) {
        // Credit
        record(l.ledgerName, 0, amt);
      }
    });
  });

  // 3. Quick Vouchers
  (options.quickTemplates || []).forEach((t) => {
    const isSalesOrReceipt = /sales|receipt/i.test(t.voucherType);

    (t.rows || []).forEach((r) => {
      let partyTotal = 0;

      (t.columns || []).forEach((c) => {
        const colAmt = cleanNumericAmount(r.amounts[c.key]);
        if (colAmt !== 0) {
          partyTotal += colAmt;
          if (c.isDebit) {
            record(c.ledgerName, Math.abs(colAmt), 0);
          } else {
            record(c.ledgerName, 0, Math.abs(colAmt));
          }
        }
      });

      if (partyTotal !== 0) {
        if (isSalesOrReceipt) {
          // Party is Debited
          record(r.partyLedger, Math.abs(partyTotal), 0);
        } else {
          // Party is Credited
          record(r.partyLedger, 0, Math.abs(partyTotal));
        }
      }
    });
  });

  const results: ImpactSummaryRow[] = [];
  ledgerMap.forEach((val, ledgerName) => {
    const dr = Math.round(val.totalDebit * 100) / 100;
    const cr = Math.round(val.totalCredit * 100) / 100;
    results.push({
      ledgerName,
      count: val.count,
      totalDebit: dr,
      totalCredit: cr,
      netImpact: Math.round((dr - cr) * 100) / 100,
    });
  });

  // Sort by count desc, then ledgerName asc
  results.sort((a, b) => b.count - a.count || a.ledgerName.localeCompare(b.ledgerName));
  return results;
}

// ============================================================================
// 6. TALLY XML GENERATION ENGINE
// ============================================================================

function wrapTallyEnvelope(innerXml: string, companyName?: string): string {
  const companyTag = companyName
    ? `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`
    : `<SVCURRENTCOMPANY>All Masters</SVCURRENTCOMPANY>`;

  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<ENVELOPE>`,
    `  <HEADER>`,
    `    <TALLYREQUEST>Import Data</TALLYREQUEST>`,
    `  </HEADER>`,
    `  <BODY>`,
    `    <IMPORTDATA>`,
    `      <REQUESTDESC>`,
    `        <REPORTNAME>All Masters</REPORTNAME>`,
    `        <STATICVARIABLES>`,
    `          ${companyTag}`,
    `        </STATICVARIABLES>`,
    `      </REQUESTDESC>`,
    `      <REQUESTDATA>`,
    innerXml,
    `      </REQUESTDATA>`,
    `    </IMPORTDATA>`,
    `  </BODY>`,
    `</ENVELOPE>`,
  ].join('\n');
}

/**
 * Generates official Tally XML for Dual Entry Vouchers.
 */
export function generateDualEntryXml(
  vouchers: DualEntryVoucher[],
  companyName?: string
): string {
  const messages: string[] = [];

  vouchers.forEach((v) => {
    const amt = cleanNumericAmount(v.amount);
    const dateStr = formatTallyDate(v.date);
    if (!dateStr || amt <= 0 || !v.debitLedger || !v.creditLedger) return;

    const vchType = escapeXml(v.voucherType || 'Receipt');
    const vchNumber = escapeXml(v.voucherNumber || '');
    const refNumber = escapeXml(v.referenceNumber || '');
    const refDate = formatTallyDate(v.referenceDate) || dateStr;
    const narration = escapeXml(v.narration || '');
    const debitLedger = escapeXml(v.debitLedger);
    const creditLedger = escapeXml(v.creditLedger);
    const formattedAmt = amt.toFixed(2);

    const isCreditFirstType =
      /receipt|purchase|contra|credit\s*note/i.test(v.voucherType);

    let ledgerEntriesXml = '';

    if (isCreditFirstType) {
      // Credit Ledger First (ISDEEMEDPOSITIVE = No, positive amount)
      // Debit Ledger Second (ISDEEMEDPOSITIVE = Yes, negative amount)
      ledgerEntriesXml = [
        `        <ALLLEDGERENTRIES.LIST>`,
        `          <REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>`,
        `          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>`,
        `          <LEDGERFROMITEM>No</LEDGERFROMITEM>`,
        `          <LEDGERNAME>${creditLedger}</LEDGERNAME>`,
        `          <AMOUNT>${formattedAmt}</AMOUNT>`,
        `        </ALLLEDGERENTRIES.LIST>`,
        `        <ALLLEDGERENTRIES.LIST>`,
        `          <REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>`,
        `          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>`,
        `          <LEDGERFROMITEM>No</LEDGERFROMITEM>`,
        `          <LEDGERNAME>${debitLedger}</LEDGERNAME>`,
        `          <AMOUNT>-${formattedAmt}</AMOUNT>`,
        `        </ALLLEDGERENTRIES.LIST>`,
      ].join('\n');
    } else {
      // Debit Ledger First (ISDEEMEDPOSITIVE = Yes, negative amount)
      // Credit Ledger Second (ISDEEMEDPOSITIVE = No, positive amount)
      ledgerEntriesXml = [
        `        <ALLLEDGERENTRIES.LIST>`,
        `          <REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>`,
        `          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>`,
        `          <LEDGERFROMITEM>No</LEDGERFROMITEM>`,
        `          <LEDGERNAME>${debitLedger}</LEDGERNAME>`,
        `          <AMOUNT>-${formattedAmt}</AMOUNT>`,
        `        </ALLLEDGERENTRIES.LIST>`,
        `        <ALLLEDGERENTRIES.LIST>`,
        `          <REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>`,
        `          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>`,
        `          <LEDGERFROMITEM>No</LEDGERFROMITEM>`,
        `          <LEDGERNAME>${creditLedger}</LEDGERNAME>`,
        `          <AMOUNT>${formattedAmt}</AMOUNT>`,
        `        </ALLLEDGERENTRIES.LIST>`,
      ].join('\n');
    }

    const vchXml = [
      `    <TALLYMESSAGE xmlns:UDF="TallyUDF">`,
      `      <VOUCHER VCHTYPE="${vchType}" ACTION="Create">`,
      `        <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>`,
      `        <DATE>${dateStr}</DATE>`,
      `        <EFFECTIVEDATE>${dateStr}</EFFECTIVEDATE>`,
      refDate ? `        <REFERENCEDATE>${refDate}</REFERENCEDATE>` : '',
      refNumber ? `        <REFERENCE>${refNumber}</REFERENCE>` : '',
      vchNumber ? `        <VOUCHERNUMBER>${vchNumber}</VOUCHERNUMBER>` : '',
      narration ? `        <NARRATION>${narration}</NARRATION>` : '',
      ledgerEntriesXml,
      `      </VOUCHER>`,
      `    </TALLYMESSAGE>`,
    ]
      .filter(Boolean)
      .join('\n');

    messages.push(vchXml);
  });

  return wrapTallyEnvelope(messages.join('\n'), companyName);
}

/**
 * Generates official Tally XML for Voucher Alteration / Modification (ACTION="Alter").
 * Matches existing vouchers in Tally by Date, Voucher Number, and Voucher Type, updating ledgers, amounts, and narrations.
 */
export function generateVoucherAlterationXml(
  vouchers: DualEntryVoucher[],
  companyName?: string
): string {
  const messages: string[] = [];

  vouchers.forEach((v) => {
    const amt = cleanNumericAmount(v.amount);
    const dateStr = formatTallyDate(v.date);
    if (!dateStr || amt <= 0 || !v.debitLedger || !v.creditLedger) return;

    const vchType = escapeXml(v.voucherType || 'Payment');
    const vchNumber = escapeXml(v.voucherNumber || '');
    const refNumber = escapeXml(v.referenceNumber || '');
    const refDate = formatTallyDate(v.referenceDate) || dateStr;
    const narration = escapeXml(v.narration || '');
    const debitLedger = escapeXml(v.debitLedger);
    const creditLedger = escapeXml(v.creditLedger);
    const formattedAmt = amt.toFixed(2);

    const isCreditFirstType =
      /receipt|purchase|contra|credit\s*note/i.test(v.voucherType);

    let ledgerEntriesXml = '';

    if (isCreditFirstType) {
      ledgerEntriesXml = [
        `        <ALLLEDGERENTRIES.LIST>`,
        `          <REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>`,
        `          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>`,
        `          <LEDGERFROMITEM>No</LEDGERFROMITEM>`,
        `          <LEDGERNAME>${creditLedger}</LEDGERNAME>`,
        `          <AMOUNT>${formattedAmt}</AMOUNT>`,
        `        </ALLLEDGERENTRIES.LIST>`,
        `        <ALLLEDGERENTRIES.LIST>`,
        `          <REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>`,
        `          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>`,
        `          <LEDGERFROMITEM>No</LEDGERFROMITEM>`,
        `          <LEDGERNAME>${debitLedger}</LEDGERNAME>`,
        `          <AMOUNT>-${formattedAmt}</AMOUNT>`,
        `        </ALLLEDGERENTRIES.LIST>`,
      ].join('\n');
    } else {
      ledgerEntriesXml = [
        `        <ALLLEDGERENTRIES.LIST>`,
        `          <REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>`,
        `          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>`,
        `          <LEDGERFROMITEM>No</LEDGERFROMITEM>`,
        `          <LEDGERNAME>${debitLedger}</LEDGERNAME>`,
        `          <AMOUNT>-${formattedAmt}</AMOUNT>`,
        `        </ALLLEDGERENTRIES.LIST>`,
        `        <ALLLEDGERENTRIES.LIST>`,
        `          <REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>`,
        `          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>`,
        `          <LEDGERFROMITEM>No</LEDGERFROMITEM>`,
        `          <LEDGERNAME>${creditLedger}</LEDGERNAME>`,
        `          <AMOUNT>${formattedAmt}</AMOUNT>`,
        `        </ALLLEDGERENTRIES.LIST>`,
      ].join('\n');
    }

    const matchDateStr = formatTallyDate(v.originalDate || v.date) || dateStr;
    const matchVchNumber = escapeXml((v.originalVoucherNumber || v.voucherNumber || '').trim());

    // Tally matches existing vouchers for in-place alteration using DATE, TAGNAME="Voucher Number", and TAGVALUE="..."
    const voucherOpenTag = matchVchNumber
      ? `<VOUCHER DATE="${matchDateStr}" TAGNAME="Voucher Number" TAGVALUE="${matchVchNumber}" VCHTYPE="${vchType}" ACTION="Alter">`
      : `<VOUCHER DATE="${matchDateStr}" VCHTYPE="${vchType}" ACTION="Alter">`;

    const vchXml = [
      `    <TALLYMESSAGE xmlns:UDF="TallyUDF">`,
      `      ${voucherOpenTag}`,
      v.guid ? `        <GUID>${escapeXml(v.guid)}</GUID>` : '',
      `        <DATE>${dateStr}</DATE>`,
      `        <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>`,
      `        <EFFECTIVEDATE>${dateStr}</EFFECTIVEDATE>`,
      refDate ? `        <REFERENCEDATE>${refDate}</REFERENCEDATE>` : '',
      refNumber ? `        <REFERENCE>${refNumber}</REFERENCE>` : '',
      vchNumber ? `        <VOUCHERNUMBER>${vchNumber}</VOUCHERNUMBER>` : '',
      narration ? `        <NARRATION>${narration}</NARRATION>` : '',
      ledgerEntriesXml,
      `      </VOUCHER>`,
      `    </TALLYMESSAGE>`,
    ]
      .filter(Boolean)
      .join('\n');

    messages.push(vchXml);
  });

  return wrapTallyEnvelope(messages.join('\n'), companyName);
}

/**
 * Builds TDL Collection XML to export existing DayBook vouchers from TallyPrime.
 */
export function buildTallyDayBookExportXml(fromDate?: string, toDate?: string): string {
  const from = fromDate ? formatTallyDate(fromDate) : '';
  const to = toDate ? formatTallyDate(toDate) : '';

  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>DayBookVouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        ${from ? `<SVFROMDATE>${from}</SVFROMDATE>` : ''}
        ${to ? `<SVTODATE>${to}</SVTODATE>` : ''}
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="DayBookVouchers">
            <TYPE>Voucher</TYPE>
            <FETCH>GUID,DATE,VOUCHERTYPENAME,VOUCHERNUMBER,REFERENCE,NARRATION,ALLLEDGERENTRIES.LIST</FETCH>
            <FILTER>ActiveVouchersOnly</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="ActiveVouchersOnly">NOT $IsCancelled AND NOT $IsOptional</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

/**
 * Parses raw Tally XML containing <VOUCHER> tags into standard DualEntryVoucher objects for modification.
 */
export function parseTallyDayBookXml(xmlString: string): DualEntryVoucher[] {
  if (!xmlString) return [];
  const vouchers: DualEntryVoucher[] = [];
  const voucherRegex = /<VOUCHER\b[^>]*>([\s\S]*?)<\/VOUCHER>/gi;
  let vchMatch: RegExpExecArray | null;

  while ((vchMatch = voucherRegex.exec(xmlString)) !== null) {
    const vchBody = vchMatch[1];

    const dateRaw = (/<DATE\b[^>]*>([^<]+)<\/DATE>/i.exec(vchBody)?.[1] || '').trim();
    const vchTypeRaw = (/<VOUCHERTYPENAME\b[^>]*>([^<]+)<\/VOUCHERTYPENAME>/i.exec(vchBody)?.[1] || 'Payment').trim();
    const vchNoRaw = (/<VOUCHERNUMBER\b[^>]*>([^<]+)<\/VOUCHERNUMBER>/i.exec(vchBody)?.[1] || '').trim();
    const narrationRaw = (/<NARRATION\b[^>]*>([^<]+)<\/NARRATION>/i.exec(vchBody)?.[1] || '').trim();
    const guidRaw = (/<GUID\b[^>]*>([^<]+)<\/GUID>/i.exec(vchBody)?.[1] || '').trim();
    const refNoRaw = (/<REFERENCE\b[^>]*>([^<]+)<\/REFERENCE>/i.exec(vchBody)?.[1] || '').trim();

    const vchType = unescapeXml(vchTypeRaw);
    const vchNo = unescapeXml(vchNoRaw);
    const narration = unescapeXml(narrationRaw);
    const guid = unescapeXml(guidRaw);
    const refNo = unescapeXml(refNoRaw);

    // Convert date YYYYMMDD to YYYY-MM-DD
    let formattedDate = dateRaw;
    if (dateRaw.length === 8 && /^\d{8}$/.test(dateRaw)) {
      formattedDate = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
    }

    const ledgerEntryRegex = /<ALLLEDGERENTRIES\.LIST\b[^>]*>([\s\S]*?)<\/ALLLEDGERENTRIES\.LIST>/gi;
    let entryMatch: RegExpExecArray | null;
    let debitLedger = '';
    let creditLedger = '';
    let debitAmt = 0;
    let creditAmt = 0;
    const allEntries: Array<{ ledgerName: string; amount: number; isDebit: boolean }> = [];
    const legs: MultiEntryLeg[] = [];

    while ((entryMatch = ledgerEntryRegex.exec(vchBody)) !== null) {
      const entryBody = entryMatch[1];
      const ledgerNameRaw = (/<LEDGERNAME\b[^>]*>([^<]+)<\/LEDGERNAME>/i.exec(entryBody)?.[1] || '').trim();
      const deemedPos = (/<ISDEEMEDPOSITIVE\b[^>]*>([^<]+)<\/ISDEEMEDPOSITIVE>/i.exec(entryBody)?.[1] || '').trim().toUpperCase();
      const amtStr = (/<AMOUNT\b[^>]*>([^<]+)<\/AMOUNT>/i.exec(entryBody)?.[1] || '').replace(/[^\d.-]/g, '').trim();
      const numAmt = parseFloat(amtStr) || 0;

      const ledgerName = unescapeXml(ledgerNameRaw);
      if (!ledgerName) continue;

      const isDebit = deemedPos === 'YES' || deemedPos === 'TRUE' || numAmt < 0;
      const absAmt = Math.abs(numAmt);
      allEntries.push({ ledgerName, amount: absAmt, isDebit });
      legs.push({ ledgerName, amount: isDebit ? -absAmt : absAmt });

      if (isDebit && !debitLedger) {
        debitLedger = ledgerName;
        debitAmt = absAmt;
      } else if (!isDebit && !creditLedger) {
        creditLedger = ledgerName;
        creditAmt = absAmt;
      }
    }

    const finalAmt = debitAmt || creditAmt;
    if (formattedDate && (debitLedger || creditLedger || vchNo)) {
      vouchers.push({
        id: `mod-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        guid: guid || undefined,
        originalVoucherNumber: vchNo || undefined,
        originalDate: formattedDate,
        date: formattedDate,
        voucherType: vchType,
        voucherNumber: vchNo,
        referenceNumber: refNo || undefined,
        debitLedger: debitLedger || 'Suspense',
        creditLedger: creditLedger || 'Suspense',
        amount: finalAmt,
        narration: narration || '',
        allEntries,
        legs
      });
    }
  }

  return vouchers;
}

/**
 * Generates official Tally XML for Multi Entry Vouchers.
 */
export function generateMultiEntryXml(
  vouchers: MultiEntryVoucher[],
  companyName?: string
): string {
  const messages: string[] = [];

  vouchers.forEach((v) => {
    const dateStr = formatTallyDate(v.date);
    if (!dateStr || !v.legs || v.legs.length < 2) return;

    const vchType = escapeXml(v.voucherType || 'Journal');
    const vchNumber = escapeXml(v.voucherNumber || '');
    const refNumber = escapeXml(v.referenceNumber || '');
    const refDate = formatTallyDate(v.referenceDate) || dateStr;
    const narration = escapeXml(v.narration || '');

    const validLegs = v.legs.filter(
      (l) => l.ledgerName && l.ledgerName.trim() && Math.abs(cleanNumericAmount(l.amount)) > 0.0001
    );

    const legEntriesXml = validLegs
      .map((leg) => {
        const amt = cleanNumericAmount(leg.amount);
        const ledgerName = escapeXml(leg.ledgerName.trim());
        // In Tally:
        // Debit: amt is negative in our convention => ISDEEMEDPOSITIVE = Yes, AMOUNT = -abs(amt)
        // Credit: amt is positive => ISDEEMEDPOSITIVE = No, AMOUNT = abs(amt)
        const isDebit = amt < 0;
        const deemedPositive = isDebit ? 'Yes' : 'No';
        const formattedAmt = isDebit ? `-${Math.abs(amt).toFixed(2)}` : Math.abs(amt).toFixed(2);

        return [
          `        <ALLLEDGERENTRIES.LIST>`,
          `          <REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>`,
          `          <ISDEEMEDPOSITIVE>${deemedPositive}</ISDEEMEDPOSITIVE>`,
          `          <LEDGERFROMITEM>No</LEDGERFROMITEM>`,
          `          <LEDGERNAME>${ledgerName}</LEDGERNAME>`,
          `          <AMOUNT>${formattedAmt}</AMOUNT>`,
          `        </ALLLEDGERENTRIES.LIST>`,
        ].join('\n');
      })
      .join('\n');

    const vchXml = [
      `    <TALLYMESSAGE xmlns:UDF="TallyUDF">`,
      `      <VOUCHER VCHTYPE="${vchType}" ACTION="Create">`,
      `        <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>`,
      `        <DATE>${dateStr}</DATE>`,
      `        <EFFECTIVEDATE>${dateStr}</EFFECTIVEDATE>`,
      refDate ? `        <REFERENCEDATE>${refDate}</REFERENCEDATE>` : '',
      refNumber ? `        <REFERENCE>${refNumber}</REFERENCE>` : '',
      vchNumber ? `        <VOUCHERNUMBER>${vchNumber}</VOUCHERNUMBER>` : '',
      narration ? `        <NARRATION>${narration}</NARRATION>` : '',
      legEntriesXml,
      `      </VOUCHER>`,
      `    </TALLYMESSAGE>`,
    ]
      .filter(Boolean)
      .join('\n');

    messages.push(vchXml);
  });

  return wrapTallyEnvelope(messages.join('\n'), companyName);
}

/**
 * Generates official Tally XML for Quick Entry (Columnar) Vouchers.
 */
export function generateQuickEntryXml(
  template: QuickEntryTemplate,
  companyName?: string
): string {
  const multiVouchers: MultiEntryVoucher[] = [];
  const isSalesOrReceipt = /sales|receipt/i.test(template.voucherType);

  (template.rows || []).forEach((r) => {
    const legs: MultiEntryLeg[] = [];
    let partyTotal = 0;

    (template.columns || []).forEach((c) => {
      const colAmt = cleanNumericAmount(r.amounts[c.key]);
      if (colAmt !== 0) {
        partyTotal += colAmt;
        // In Purchase/Payment: Column items (Purchase, Tax) are Debits => Negative amount
        // In Sales/Receipt: Column items (Sales, Tax) are Credits => Positive amount
        if (isSalesOrReceipt) {
          legs.push({
            ledgerName: c.ledgerName,
            amount: Math.abs(colAmt), // Credit leg
          });
        } else {
          legs.push({
            ledgerName: c.ledgerName,
            amount: -Math.abs(colAmt), // Debit leg
          });
        }
      }
    });

    if (partyTotal !== 0 && r.partyLedger && r.partyLedger.trim()) {
      if (isSalesOrReceipt) {
        // Party is Debited => Negative amount
        legs.unshift({
          ledgerName: r.partyLedger.trim(),
          amount: -Math.abs(partyTotal),
        });
      } else {
        // Party is Credited => Positive amount
        legs.unshift({
          ledgerName: r.partyLedger.trim(),
          amount: Math.abs(partyTotal),
        });
      }

      multiVouchers.push({
        date: r.date,
        voucherType: template.voucherType,
        voucherNumber: r.voucherNumber,
        referenceNumber: r.referenceNumber,
        referenceDate: r.referenceDate,
        narration: r.narration,
        legs,
      });
    }
  });

  return generateMultiEntryXml(multiVouchers, companyName);
}

/**
 * Generates official Tally XML for Master Ledgers.
 */
export function generateMasterLedgersXml(
  ledgers: MasterLedger[],
  companyName?: string
): string {
  const messages: string[] = [];

  ledgers.forEach((l) => {
    if (!l.ledgerName || !l.ledgerName.trim()) return;

    const ledgerName = escapeXml(l.ledgerName.trim());
    const parentGroup = escapeXml(l.parentGroup || 'Sundry Creditors');
    const openingBal = cleanNumericAmount(l.openingBalance);
    const formattedOb = openingBal !== 0 ? openingBal.toFixed(2) : '0.00';
    const alias = escapeXml(l.alias || '');
    const addr1 = escapeXml(l.addressLine1 || '');
    const addr2 = escapeXml(l.addressLine2 || '');
    const country = escapeXml(l.country || 'India');
    const state = escapeXml(l.state || '');
    const pincode = escapeXml(l.pincode || '');
    const gstin = escapeXml(l.gstin?.trim() || '');
    const pan = gstin && gstin.length >= 12 ? gstin.substring(2, 12) : '';
    const regType = escapeXml(l.registrationType || (gstin ? 'Regular' : 'Unregistered'));
    const isSundry = /sundry\s*(creditor|debtor)/i.test(l.parentGroup || '');

    const ledgerXml = [
      `    <TALLYMESSAGE xmlns:UDF="TallyUDF">`,
      `      <LEDGER RESERVEDNAME="" NAME="${ledgerName}">`,
      `        <NAME.LIST TYPE="String">`,
      `          <NAME>${ledgerName}</NAME>`,
      alias ? `          <NAME>${alias}</NAME>` : '',
      `        </NAME.LIST>`,
      `        <PARENT>${parentGroup}</PARENT>`,
      `        <OPENINGBALANCE>${formattedOb}</OPENINGBALANCE>`,
      `        <TAXTYPE>Others</TAXTYPE>`,
      country ? `        <COUNTRYNAME>${country}</COUNTRYNAME>` : '',
      country ? `        <COUNTRYOFRESIDENCE>${country}</COUNTRYOFRESIDENCE>` : '',
      state ? `        <LEDSTATENAME>${state}</LEDSTATENAME>` : '',
      state ? `        <STATENAME>${state}</STATENAME>` : '',
      pincode ? `        <PINCODE>${pincode}</PINCODE>` : '',
      pan ? `        <INCOMETAXNUMBER>${pan}</INCOMETAXNUMBER>` : '',
      gstin ? `        <PARTYGSTIN>${gstin}</PARTYGSTIN>` : '',
      regType ? `        <GSTREGISTRATIONTYPE>${regType}</GSTREGISTRATIONTYPE>` : '',
      isSundry ? `        <ISBILLWISEON>Yes</ISBILLWISEON>` : '',
      gstin
        ? `        <LEDGSTREGDETAILS.LIST>
          <APPLICABLEFROM>20200401</APPLICABLEFROM>
          <GSTREGISTRATIONTYPE>${regType}</GSTREGISTRATIONTYPE>
          ${state ? `<STATE>${state}</STATE>` : ''}
          <PLACEOFSUPPLY>${state || 'Not Applicable'}</PLACEOFSUPPLY>
          <GSTIN>${gstin}</GSTIN>
        </LEDGSTREGDETAILS.LIST>`
        : '',
      `        <ADDRESS.LIST TYPE="String">`,
      addr1 ? `          <ADDRESS>${addr1}</ADDRESS>` : '',
      addr2 ? `          <ADDRESS>${addr2}</ADDRESS>` : '',
      `        </ADDRESS.LIST>`,
      `        <MAILINGNAME.LIST TYPE="String">`,
      `          <MAILINGNAME>${ledgerName}</MAILINGNAME>`,
      `        </MAILINGNAME.LIST>`,
      `        <LEDMAILINGDETAILS.LIST>
          <APPLICABLEFROM>20200401</APPLICABLEFROM>
          <MAILINGNAME>${ledgerName}</MAILINGNAME>
          ${state ? `<STATE>${state}</STATE>` : ''}
          <COUNTRY>${country}</COUNTRY>
          ${pincode ? `<PINCODE>${pincode}</PINCODE>` : ''}
        </LEDMAILINGDETAILS.LIST>`,
      `      </LEDGER>`,
      `    </TALLYMESSAGE>`,
    ]
      .filter(Boolean)
      .join('\n');

    messages.push(ledgerXml);
  });

  return wrapTallyEnvelope(messages.join('\n'), companyName);
}


/**
 * Parses raw Tally XML DayBook directly into MultiEntryVoucher objects preserving all debit & credit legs.
 */
export function parseTallyDayBookMultiXml(xmlString: string): MultiEntryVoucher[] {
  if (!xmlString) return [];
  const vouchers: MultiEntryVoucher[] = [];
  const voucherRegex = /<VOUCHER\b[^>]*>([\s\S]*?)<\/VOUCHER>/gi;
  let vchMatch: RegExpExecArray | null;

  while ((vchMatch = voucherRegex.exec(xmlString)) !== null) {
    const vchBody = vchMatch[1];
    const dateRaw = (/<DATE\b[^>]*>([^<]+)<\/DATE>/i.exec(vchBody)?.[1] || '').trim();
    const vchTypeRaw = (/<VOUCHERTYPENAME\b[^>]*>([^<]+)<\/VOUCHERTYPENAME>/i.exec(vchBody)?.[1] || 'Payment').trim();
    const vchNoRaw = (/<VOUCHERNUMBER\b[^>]*>([^<]+)<\/VOUCHERNUMBER>/i.exec(vchBody)?.[1] || '').trim();
    const narrationRaw = (/<NARRATION\b[^>]*>([^<]+)<\/NARRATION>/i.exec(vchBody)?.[1] || '').trim();
    const refNoRaw = (/<REFERENCE\b[^>]*>([^<]+)<\/REFERENCE>/i.exec(vchBody)?.[1] || '').trim();

    let formattedDate = dateRaw;
    if (dateRaw.length === 8 && /^\d{8}$/.test(dateRaw)) {
      formattedDate = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
    }

    const ledgerEntryRegex = /<ALLLEDGERENTRIES\.LIST\b[^>]*>([\s\S]*?)<\/ALLLEDGERENTRIES\.LIST>/gi;
    let entryMatch: RegExpExecArray | null;
    const legs: MultiEntryLeg[] = [];

    while ((entryMatch = ledgerEntryRegex.exec(vchBody)) !== null) {
      const entryBody = entryMatch[1];
      const ledgerNameRaw = (/<LEDGERNAME\b[^>]*>([^<]+)<\/LEDGERNAME>/i.exec(entryBody)?.[1] || '').trim();
      const deemedPos = (/<ISDEEMEDPOSITIVE\b[^>]*>([^<]+)<\/ISDEEMEDPOSITIVE>/i.exec(entryBody)?.[1] || '').trim().toUpperCase();
      const amtStr = (/<AMOUNT\b[^>]*>([^<]+)<\/AMOUNT>/i.exec(entryBody)?.[1] || '').replace(/[^\d.-]/g, '').trim();
      const numAmt = parseFloat(amtStr) || 0;
      const ledgerName = unescapeXml(ledgerNameRaw);
      if (!ledgerName) continue;
      const isDebit = deemedPos === 'YES' || deemedPos === 'TRUE' || numAmt < 0;
      const absAmt = Math.abs(numAmt);
      legs.push({ ledgerName, amount: isDebit ? -absAmt : absAmt });
    }

    if (formattedDate && legs.length > 0) {
      vouchers.push({
        id: `multi-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        date: formattedDate,
        voucherType: unescapeXml(vchTypeRaw),
        voucherNumber: unescapeXml(vchNoRaw),
        referenceNumber: unescapeXml(refNoRaw) || undefined,
        narration: unescapeXml(narrationRaw),
        legs
      });
    }
  }
  return vouchers;
}

/**
 * Generates official Tally XML for Voucher Alteration of Multi-Entry Vouchers (ACTION="Alter").
 * Matches existing vouchers in Tally by Date, Voucher Number, and Voucher Type, updating all ledger legs.
 */
export function generateVoucherAlterationMultiXml(
  vouchers: MultiEntryVoucher[],
  companyName?: string
): string {
  const messages: string[] = [];

  vouchers.forEach((v) => {
    const dateStr = formatTallyDate(v.date);
    if (!dateStr || !v.legs || v.legs.length < 2) return;

    const vchType = escapeXml(v.voucherType || 'Journal');
    const vchNumber = escapeXml(v.voucherNumber || '');
    const refNumber = escapeXml(v.referenceNumber || '');
    const refDate = formatTallyDate(v.referenceDate) || dateStr;
    const narration = escapeXml(v.narration || '');

    const validLegs = v.legs.filter(
      (l) => l.ledgerName && l.ledgerName.trim() && Math.abs(cleanNumericAmount(l.amount)) > 0.0001
    );

    const legEntriesXml = validLegs
      .map((leg) => {
        const amt = cleanNumericAmount(leg.amount);
        const ledgerName = escapeXml(leg.ledgerName.trim());
        const isDebit = amt < 0;
        const deemedPositive = isDebit ? 'Yes' : 'No';
        const formattedAmt = isDebit ? `-${Math.abs(amt).toFixed(2)}` : Math.abs(amt).toFixed(2);

        return [
          `        <ALLLEDGERENTRIES.LIST>`,
          `          <REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>`,
          `          <ISDEEMEDPOSITIVE>${deemedPositive}</ISDEEMEDPOSITIVE>`,
          `          <LEDGERFROMITEM>No</LEDGERFROMITEM>`,
          `          <LEDGERNAME>${ledgerName}</LEDGERNAME>`,
          `          <AMOUNT>${formattedAmt}</AMOUNT>`,
          `        </ALLLEDGERENTRIES.LIST>`,
        ].join('\n');
      })
      .join('\n');

    const voucherOpenTag = vchNumber
      ? `<VOUCHER DATE="${dateStr}" TAGNAME="Voucher Number" TAGVALUE="${vchNumber}" VCHTYPE="${vchType}" ACTION="Alter">`
      : `<VOUCHER DATE="${dateStr}" VCHTYPE="${vchType}" ACTION="Alter">`;

    const vchXml = [
      `    <TALLYMESSAGE xmlns:UDF="TallyUDF">`,
      `      ${voucherOpenTag}`,
      `        <DATE>${dateStr}</DATE>`,
      `        <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>`,
      `        <EFFECTIVEDATE>${dateStr}</EFFECTIVEDATE>`,
      refDate ? `        <REFERENCEDATE>${refDate}</REFERENCEDATE>` : '',
      refNumber ? `        <REFERENCE>${refNumber}</REFERENCE>` : '',
      vchNumber ? `        <VOUCHERNUMBER>${vchNumber}</VOUCHERNUMBER>` : '',
      narration ? `        <NARRATION>${narration}</NARRATION>` : '',
      legEntriesXml,
      `      </VOUCHER>`,
      `    </TALLYMESSAGE>`,
    ]
      .filter(Boolean)
      .join('\n');

    messages.push(vchXml);
  });

  return wrapTallyEnvelope(messages.join('\n'), companyName);
}

/**
 * Universal Parser for Excel / JSON rows.
 * Seamlessly parses either:
 *  1) Flat 2-Leg format (Date, Type, VchNo, Debit Ledger, Credit Ledger, Amount, Narration)
 *  2) Multi-Line Grouped format (Date, Type, VchNo, Ledger Name, Dr / Cr, Amount, Narration)
 *  3) Columnar Tax format (Date, Type, VchNo, Party Name, Purchase/Sales, CGST, SGST, IGST, Round Off)
 */
export function parseUniversalVouchersFromRows(rawJson: any[]): MultiEntryVoucher[] {
  if (!rawJson || rawJson.length === 0) return [];

  // Helper to extract value by regex pattern from row object
  const getVal = (row: any, patterns: string[]): string => {
    const keys = Object.keys(row);
    for (const p of patterns) {
      const matchedKey = keys.find((k) => new RegExp(p, 'i').test(k.trim()));
      if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== '') {
        return String(row[matchedKey]).trim();
      }
    }
    return '';
  };

  // Helper to clean dates into YYYY-MM-DD
  const normalizeDate = (raw: string): string => {
    if (!raw) return '';
    const s = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{8}$/.test(s)) {
      return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    }
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
    return s;
  };

  // Check if first row has BOTH separate Debit Ledger and Credit Ledger
  const firstRow = rawJson[0] || {};
  const firstKeys = Object.keys(firstRow);
  const hasDebitCol = firstKeys.some((k) => /debit\s*ledger|^debit$|^dr\s*ledger/i.test(k.trim()));
  const hasCreditCol = firstKeys.some((k) => /credit\s*ledger|^credit$|^cr\s*ledger/i.test(k.trim()));

  if (hasDebitCol && hasCreditCol) {
    // Mode A: Flat 2-Leg Rows (Bank statements, cash books, simple vouchers)
    const vouchers: MultiEntryVoucher[] = [];
    rawJson.forEach((row, idx) => {
      const rawDate = getVal(row, ['^date', 'voucher\\s*date', 'vch\\s*date']);
      const vchType = getVal(row, ['^type', 'voucher\\s*type', 'vch\\s*type']) || 'Payment';
      const vchNo = getVal(row, ['voucher\\s*no', 'vch\\s*no', '^number', '^no']);
      const refNo = getVal(row, ['reference', 'ref\\s*no', 'invoice\\s*no']);
      const debitLedger = getVal(row, ['debit\\s*ledger', '^debit$', '^dr\\b', 'dr\\s*ledger', 'particulars']);
      const creditLedger = getVal(row, ['credit\\s*ledger', '^credit$', '^cr\\b', 'cr\\s*ledger', 'account']);
      const amountRaw = getVal(row, ['amount', 'debit\\s*amount', 'credit\\s*amount', 'value', 'total']);
      const narration = getVal(row, ['narration', 'remarks', 'description', 'notes']);

      const amt = cleanNumericAmount(amountRaw);
      const cleanDate = normalizeDate(rawDate);

      if (cleanDate && (debitLedger || creditLedger) && amt > 0) {
        vouchers.push({
          id: `univ-${Date.now()}-${idx}`,
          date: cleanDate,
          voucherType: vchType,
          voucherNumber: vchNo || undefined,
          referenceNumber: refNo || undefined,
          narration: narration || '',
          legs: [
            { ledgerName: debitLedger || 'Suspense', amount: -amt }, // Debit is negative
            { ledgerName: creditLedger || 'Suspense', amount: amt },   // Credit is positive
          ],
          checkTotal: 0,
        });
      }
    });
    return vouchers;
  }

  // Mode B: Multi-Line Grouped Rows (Rows grouped by Voucher Number or consecutive rows)
  const vouchers: MultiEntryVoucher[] = [];
  let currentVoucher: MultiEntryVoucher | null = null;

  rawJson.forEach((row, idx) => {
    const rawDate = getVal(row, ['^date', 'voucher\\s*date', 'vch\\s*date']);
    const vchType = getVal(row, ['^type', 'voucher\\s*type', 'vch\\s*type']);
    const vchNo = getVal(row, ['voucher\\s*no', 'vch\\s*no', '^number', '^no']);
    const refNo = getVal(row, ['reference', 'ref\\s*no', 'invoice\\s*no']);
    const ledgerName = getVal(row, ['ledger', 'account', 'particulars', 'party', 'head']);
    const drCrType = getVal(row, ['dr\\s*\\/\\s*cr', 'dr_cr', 'type', 'drcr']).toUpperCase();
    const drAmtRaw = getVal(row, ['debit\\s*amount', 'dr\\s*amount', '^dr$', '^debit$']);
    const crAmtRaw = getVal(row, ['credit\\s*amount', 'cr\\s*amount', '^cr$', '^credit$']);
    const genericAmtRaw = getVal(row, ['amount', 'value', 'total']);
    const narration = getVal(row, ['narration', 'remarks', 'description', 'notes']);

    let legAmt = 0;
    if (drAmtRaw && cleanNumericAmount(drAmtRaw) > 0) {
      legAmt = -Math.abs(cleanNumericAmount(drAmtRaw)); // Debit
    } else if (crAmtRaw && cleanNumericAmount(crAmtRaw) > 0) {
      legAmt = Math.abs(cleanNumericAmount(crAmtRaw)); // Credit
    } else if (genericAmtRaw) {
      const num = cleanNumericAmount(genericAmtRaw);
      if (drCrType.includes('DR') || drCrType === 'D') {
        legAmt = -Math.abs(num);
      } else if (drCrType.includes('CR') || drCrType === 'C') {
        legAmt = Math.abs(num);
      } else {
        legAmt = num;
      }
    }

    const cleanDate = normalizeDate(rawDate);

    // If new date or new voucher number and current voucher has legs, push it!
    const isNewVoucherHeader =
      cleanDate &&
      ((vchNo && currentVoucher && currentVoucher.voucherNumber && currentVoucher.voucherNumber !== vchNo) ||
        (currentVoucher && cleanDate !== currentVoucher.date && vchNo));

    if (isNewVoucherHeader && currentVoucher && currentVoucher.legs.length > 0) {
      let sum = 0;
      currentVoucher.legs.forEach((l) => (sum += l.amount));
      currentVoucher.checkTotal = Math.round(sum * 100) / 100;
      vouchers.push(currentVoucher);
      currentVoucher = null;
    }

    if (!currentVoucher) {
      currentVoucher = {
        id: `univ-${Date.now()}-${idx}`,
        date: cleanDate || new Date().toISOString().slice(0, 10),
        voucherType: vchType || 'Journal',
        voucherNumber: vchNo || undefined,
        referenceNumber: refNo || undefined,
        narration: narration || '',
        legs: [],
      };
    } else {
      if (narration && !currentVoucher.narration) {
        currentVoucher.narration = narration;
      }
      if (refNo && !currentVoucher.referenceNumber) {
        currentVoucher.referenceNumber = refNo;
      }
      if (vchType && !currentVoucher.voucherType) {
        currentVoucher.voucherType = vchType;
      }
    }

    if (ledgerName && Math.abs(legAmt) > 0.0001) {
      currentVoucher.legs.push({
        ledgerName,
        amount: legAmt,
      });
    }
  });

  if (currentVoucher && currentVoucher.legs.length > 0) {
    let sum = 0;
    currentVoucher.legs.forEach((l) => (sum += l.amount));
    currentVoucher.checkTotal = Math.round(sum * 100) / 100;
    vouchers.push(currentVoucher);
  }

  return vouchers;
}

/**
 * Universal Clipboard Parser.
 */
export function parseUniversalVouchersFromClipboard(text: string): MultiEntryVoucher[] {
  if (!text || !text.trim()) return [];

  const lines = text.trim().split(/\r?\n/).map((l) => l.split('\t'));
  if (lines.length === 0) return [];

  const header = lines[0];
  const isHeader = header.some((h) => /date|type|voucher|debit|credit|amount|ledger/i.test(h));
  const dataLines = isHeader ? lines.slice(1) : lines;

  const keys = isHeader ? header.map((h) => h.trim()) : [];
  if (keys.length > 0) {
    const rawJson = dataLines.map((row) => {
      const obj: any = {};
      keys.forEach((k, i) => {
        obj[k] = row[i] || '';
      });
      return obj;
    });
    return parseUniversalVouchersFromRows(rawJson);
  }

  // Fallback: positional parsing
  const vouchers: MultiEntryVoucher[] = [];
  dataLines.forEach((cols, idx) => {
    if (cols.length >= 4) {
      const date = cols[0] || '';
      const vchType = cols[1] || 'Payment';
      let vchNo = '';
      let debit = '';
      let credit = '';
      let amt = 0;
      let narration = '';

      if (cols.length >= 7) {
        vchNo = cols[2] || '';
        debit = cols[3] || '';
        credit = cols[4] || '';
        amt = cleanNumericAmount(cols[5]);
        narration = cols[6] || '';
      } else {
        debit = cols[2] || '';
        credit = cols[3] || '';
        amt = cleanNumericAmount(cols[4]);
        narration = cols[5] || '';
      }

      if (date && (debit || credit) && amt > 0) {
        vouchers.push({
          id: `clip-${Date.now()}-${idx}`,
          date,
          voucherType: vchType,
          voucherNumber: vchNo || undefined,
          narration,
          legs: [
            { ledgerName: debit || 'Suspense', amount: -amt },
            { ledgerName: credit || 'Suspense', amount: amt },
          ],
          checkTotal: 0,
        });
      }
    }
  });

  return vouchers;
}
