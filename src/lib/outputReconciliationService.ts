import XLSXStyle from 'xlsx-js-style';
const XLSX: any = (XLSXStyle as any).default || XLSXStyle;
import { appendExecutiveSummary, removeAllMergesFromWorkbook } from './fileParser.ts';

// ==========================================
// TYPE DEFINITIONS & INTERFACES
// ==========================================

export interface RawDataRow {
  [key: string]: any;
}

export interface CleanedRow {
  invoiceNo: string;
  invoiceDate: string;
  month: string;
  party: string;
  gstNo: string;
  taxable: number;
  nilRated: number;
  nonTaxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  pos?: string;
  voucherType?: string;
}

export interface VarianceResult {
  'Match Status': 'Perfect Match' | 'Value Mismatch' | 'Missing in Books' | 'Missing in Portal';
  'Month': string;
  'Invoice Date': string;
  'GST No': string;
  'Invoice/Note No': string;
  'Party Name': string;
  'Taxable (Books)': number;
  'Taxable (Portal)': number;
  'Taxable Variance': number;
  'IGST (Books)': number;
  'IGST (Portal)': number;
  'IGST Variance': number;
  'CGST (Books)': number;
  'CGST (Portal)': number;
  'CGST Variance': number;
  'SGST (Books)': number;
  'SGST (Portal)': number;
  'SGST Variance': number;
}

export interface BlockVarianceResult {
  'Match Status': 'Perfect Match' | 'Value Mismatch' | 'Missing in Books' | 'Missing in Portal';
  'Month': string;
  'Invoice Date': string;
  'Tax Rate / Category': string | number;
  'Taxable (Books)': number;
  'Taxable (Portal)': number;
  'Taxable Variance': number;
  'IGST (Books)'?: number;
  'IGST (Portal)'?: number;
  'IGST Variance'?: number;
  'CGST (Books)'?: number;
  'CGST (Portal)'?: number;
  'CGST Variance'?: number;
  'SGST (Books)'?: number;
  'SGST (Portal)'?: number;
  'SGST Variance'?: number;
  'Total Tax Variance': number;
}

export interface ReconciliationInputs {
  booksSales: RawDataRow[];
  booksReturns: RawDataRow[];
  booksCreditNotes?: RawDataRow[];
  portalB2B: RawDataRow[];
  portalB2C: RawDataRow[];
  portalB2CL: RawDataRow[];
  portalCN: RawDataRow[];
  portalNil: RawDataRow[];
  portalExport?: RawDataRow[];
  gstr3bData?: any; // Added for 3B comparison
}

const STANDARD_GST_RATES = [0, 5, 12, 18, 28];

// ==========================================
// PHASE 1: STRICT DATA CLEANING
// ==========================================

/**
 * Safely parses numeric fields, stripping currency symbols and commas.
 */
function parseNumber(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[₹$Rs,\s]/gi, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Cleans strings, strips whitespaces, and removes technical prefixes.
 */
function parseString(val: any, isIdentifier = false): string {
  if (!val) return '';
  let str = String(val).trim();
  if (isIdentifier) {
    // Remove prefixes like GSTIN-, INV-, CN-
    str = str.replace(/^(GSTIN-|INV-|CN-)/i, '');
  }
  return str;
}

/**
 * Standardizes any date format to DD-MMM-YYYY (e.g. 02-Jan-2026).
 * Handles: YYYY-MM-DD, DD/MM/YY, M/D/YY, DD-MMM-YYYY, Excel serial numbers, etc.
 */
function standardizeDate(val: any): string {
  if (val == null || val === '') return '';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const formatYMD = (y: number, m: number, d: number): string => {
    if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return String(val).trim();
    return `${String(d).padStart(2, '0')}-${MONTHS[m - 1]}-${y}`;
  };

  // Handle Date objects
  if (val instanceof Date && !isNaN(val.getTime())) {
    return formatYMD(val.getFullYear(), val.getMonth() + 1, val.getDate());
  }

  // Handle Excel serial date numbers
  if (typeof val === 'number') {
    if (val > 20000 && val < 90000) {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) {
        return formatYMD(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      }
    }
    return String(val);
  }

  const s = String(val).trim();
  if (!s) return '';

  // Already in DD-MMM-YYYY format
  const alreadyFormatted = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (alreadyFormatted) return s;

  // YYYY-MM-DD (ISO format)
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    return formatYMD(+iso[1], +iso[2], +iso[3]);
  }

  // DD-MMM-YY or DD/MMM/YYYY (e.g. "10-Oct-2025", "08-Dec-2025")
  const dmy_named = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,9})[-/\s](\d{2,4})$/);
  if (dmy_named) {
    const mIdx = MONTHS.findIndex(m => m.toLowerCase() === dmy_named[2].toLowerCase().slice(0, 3));
    if (mIdx !== -1) {
      let y = +dmy_named[3];
      if (y < 100) y += 2000;
      return formatYMD(y, mIdx + 1, +dmy_named[1]);
    }
  }

  // DD/MM/YYYY, DD-MM-YYYY, M/D/YY, etc.
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmy) {
    let p1 = +dmy[1], p2 = +dmy[2], p3 = +dmy[3];
    if (p3 < 100) p3 += 2000;
    // Disambiguate: if p2 > 12, it must be day (so p1 is month — US format M/D/Y)
    if (p2 > 12) {
      return formatYMD(p3, p1, p2);
    }
    // If p1 > 12, it must be day (DD/MM/YYYY)
    if (p1 > 12) {
      return formatYMD(p3, p2, p1);
    }
    // Both <= 12: assume DD/MM/YYYY (Indian convention)
    return formatYMD(p3, p2, p1);
  }

  // Fallback: try JS Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return formatYMD(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  return s;
}

const MONTH_MAP: Record<string, string> = {
  'jan': 'Jan', 'january': 'Jan', '01': 'Jan', '1': 'Jan',
  'feb': 'Feb', 'february': 'Feb', '02': 'Feb', '2': 'Feb',
  'mar': 'Mar', 'march': 'Mar', '03': 'Mar', '3': 'Mar',
  'apr': 'Apr', 'april': 'Apr', '04': 'Apr', '4': 'Apr',
  'may': 'May', '05': 'May', '5': 'May',
  'jun': 'Jun', 'june': 'Jun', '06': 'Jun', '6': 'Jun',
  'jul': 'Jul', 'july': 'Jul', '07': 'Jul', '7': 'Jul',
  'aug': 'Aug', 'august': 'Aug', '08': 'Aug', '8': 'Aug',
  'sep': 'Sep', 'september': 'Sep', '09': 'Sep', '9': 'Sep',
  'oct': 'Oct', 'october': 'Oct', '10': 'Oct',
  'nov': 'Nov', 'november': 'Nov', '11': 'Nov',
  'dec': 'Dec', 'december': 'Dec', '12': 'Dec',
};

function parseSingleMonthString(s: string): string | null {
  if (!s) return null;
  const str = s.trim().toLowerCase();
  if (!str || str === 'unknown') return null;

  // 1. Check if Excel serial date
  if (/^\d{5}$/.test(str)) {
    const serial = parseInt(str, 10);
    const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      const m = d.toLocaleString('default', { month: 'short' });
      return m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
    }
  }

  // 2. Check for month name keywords anywhere in the string (e.g. "30/05/2025 May", "May-2025", "03/05/2025 May")
  const monthNames = [
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
    'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
  ];
  for (const mName of monthNames) {
    const regex = new RegExp(`\\b${mName}\\b`, 'i');
    if (regex.test(str)) {
      const canonical = MONTH_MAP[mName];
      if (canonical) return canonical;
    }
  }

  // 3. Parse date patterns DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, M/D/YY, or DD.MM.YYYY
  const dateMatch = str.match(/(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})/);
  if (dateMatch) {
    let mNum = 0;
    if (dateMatch[1].length === 4) {
      // YYYY-MM-DD
      mNum = parseInt(dateMatch[2], 10);
    } else if (dateMatch[3].length === 4) {
      // DD/MM/YYYY e.g. "03/05/2025" or "30/05/2025"
      mNum = parseInt(dateMatch[2], 10);
      if (mNum > 12) mNum = parseInt(dateMatch[1], 10);
    } else {
      // 2-digit year e.g. "5/3/25" (M/D/YY) or "30/5/25" (DD/M/YY)
      const p1 = parseInt(dateMatch[1], 10);
      const p2 = parseInt(dateMatch[2], 10);
      if (p1 > 12) {
        mNum = p2;
      } else if (p2 > 12) {
        mNum = p1;
      } else {
        // Both <= 12 (e.g. 5/3/25). Standard M/D/YY exported by Excel has M in p1
        mNum = p1;
      }
    }
    if (mNum >= 1 && mNum <= 12) {
      const mKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      return MONTH_MAP[mKeys[mNum - 1]];
    }
  }

  // 4. Check 6-digit MMYYYY format (e.g. "052024", "042025", "122024")
  const mmyyyyMatch = str.match(/^(\d{2})(\d{4})$/);
  if (mmyyyyMatch) {
    const mNum = parseInt(mmyyyyMatch[1], 10);
    if (mNum >= 1 && mNum <= 12) {
      const mKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      return MONTH_MAP[mKeys[mNum - 1]];
    }
  }

  // 5. Match Month-Year like Oct-23, 10-2023, 10/23, 05/2025, 05-2025
  const match = str.match(/^([a-z]+|\d{1,2})[-/.\s,]+(\d{2,4})$/);
  if (match) {
    const monthPart = match[1];
    const normalizedMonth = MONTH_MAP[monthPart] || MONTH_MAP[monthPart.slice(0, 3)];
    if (normalizedMonth) return normalizedMonth;
  }

  // 5. Direct month map lookup
  if (MONTH_MAP[str]) return MONTH_MAP[str];

  return null;
}

/**
 * Standardizes diverse date/month formats to 'MMM' (e.g., 'May').
 */
function parseMonth(val: any, dateFallback?: any, globalYear?: string): string {
  let parsed = parseSingleMonthString(val ? String(val) : '');
  if (!parsed && dateFallback) {
    parsed = parseSingleMonthString(String(dateFallback));
  }
  return parsed || 'Unknown';
}

function getRowVal(row: RawDataRow, candidateKeys: string[]): any {
  if (!row) return undefined;
  for (const k of candidateKeys) {
    if (row[k] !== undefined && row[k] !== '') return row[k];
  }
  const normKeys: Record<string, any> = {};
  for (const origKey of Object.keys(row)) {
    normKeys[origKey.trim().toLowerCase()] = row[origKey];
  }
  for (const k of candidateKeys) {
    const normK = k.trim().toLowerCase();
    if (normKeys[normK] !== undefined && normKeys[normK] !== '') return normKeys[normK];
  }
  return undefined;
}

export function sanitizeData(rows: RawDataRow[], globalYear?: string): CleanedRow[] {
  return rows.map(row => {
    const invNo = getRowVal(row, ['Invoice No.', 'Note No.', 'Invoice No', 'Note No', 'Invoice Number']);
    const invDate = getRowVal(row, ['Invoice Date', 'Note Date', 'Date']);
    const mStr = getRowVal(row, ['Month', 'Return Period', 'Filing Period']);
    const partyStr = getRowVal(row, ['Party', 'Receiver Name', 'Party Name', 'Customer Name', 'Particulars']);
    const gstinStr = getRowVal(row, ['GST No.', 'GSTIN', 'GST No']);
    const taxVal = getRowVal(row, ['Taxable', 'Taxable Value', 'Taxable Amount']);
    const nilVal = getRowVal(row, ['Nil Rated', 'Nil Rated Supplies', 'nil_amt', 'Nil Amount']);
    const nonTaxVal = getRowVal(row, ['Non Taxable', 'Non-GST', 'Non-GST Supplies', 'Exempted', 'Exempted Supplies', 'Exempt', 'Non-GST Outward Supplies', 'exempt_amt', 'nongst_amt']);
    const cgstVal = getRowVal(row, ['CGST']);
    const sgstVal = getRowVal(row, ['SGST']);
    const igstVal = getRowVal(row, ['IGST']);
    const totalVal = getRowVal(row, ['Total', 'Invoice Value', 'Invoice Amount']);
    const posVal = getRowVal(row, ['POS', 'Place of Supply']);
    const vchVal = getRowVal(row, ['Voucher Type', 'Voucher Type Name', 'Vch Type', 'Note Type']);

    return {
      invoiceNo: parseString(invNo, true),
      invoiceDate: standardizeDate(invDate),
      month: parseMonth(invDate || mStr, mStr || invDate, globalYear),
      party: parseString(partyStr),
      gstNo: parseString(gstinStr, true).toUpperCase(),
      taxable: parseNumber(taxVal),
      nilRated: parseNumber(nilVal),
      nonTaxable: parseNumber(nonTaxVal),
      cgst: parseNumber(cgstVal),
      sgst: parseNumber(sgstVal),
      igst: parseNumber(igstVal),
      total: parseNumber(totalVal),
      pos: parseString(posVal),
      voucherType: parseString(vchVal)
    };
  });
}

// ==========================================
// PHASE 2: BOOKS DATA SEGREGATION
// ==========================================

function segregateBooks(salesData: CleanedRow[]) {
  const b2bBooks: CleanedRow[] = [];
  const b2cBooks: CleanedRow[] = [];
  const b2clBooks: CleanedRow[] = [];
  const nilBooks: CleanedRow[] = [];
  const expBooks: CleanedRow[] = [];

  for (const row of salesData) {
    const cleanRow = { ...row };

    const isExport = 
      (cleanRow.voucherType && String(cleanRow.voucherType).toLowerCase().includes('export')) ||
      (cleanRow.gstNo && String(cleanRow.gstNo).toUpperCase().includes('EXPORT')) ||
      (cleanRow.party && String(cleanRow.party).toLowerCase().includes('export'));

    // Segregate sales types (Keep taxable parts, zero out nilRated & nonTaxable to prevent double counting)
    if (isExport) {
      expBooks.push({ ...cleanRow, nilRated: 0, nonTaxable: 0 });
    } else if (cleanRow.gstNo && cleanRow.gstNo.length >= 10) {
      b2bBooks.push({ ...cleanRow, nilRated: 0, nonTaxable: 0 });
    } else {
      if (cleanRow.taxable > 250000 && cleanRow.pos) {
        b2clBooks.push({ ...cleanRow, nilRated: 0, nonTaxable: 0 });
      } else {
        b2cBooks.push({ ...cleanRow, nilRated: 0, nonTaxable: 0 });
      }
    }

    // Nil Rated & Non-Taxable Extract (Keep nilRated & nonTaxable parts, zero out taxable and taxes)
    if (cleanRow.nilRated > 0 || cleanRow.nonTaxable > 0) {
      nilBooks.push({
        ...cleanRow,
        taxable: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        total: cleanRow.nilRated + cleanRow.nonTaxable
      });
    }
  }

  return { b2bBooks, b2cBooks, b2clBooks, nilBooks, expBooks };
}

// ==========================================
// PHASE 3: RECONCILIATION & MATCHING LOGIC
// ==========================================

function snapToGstRate(taxable: number, totalTax: number): number {
  if (taxable <= 0) return 0;
  const implied = Math.round((totalTax / taxable) * 100);
  return STANDARD_GST_RATES.reduce((prev, curr) =>
    Math.abs(curr - implied) < Math.abs(prev - implied) ? curr : prev
  );
}

function consolidateByInvoice(rows: CleanedRow[]): CleanedRow[] {
  const map = new Map<string, CleanedRow>();
  const unkeyed: CleanedRow[] = [];

  rows.forEach(r => {
    const invKey = r.invoiceNo ? r.invoiceNo.trim().toUpperCase() : '';
    const gstKey = r.gstNo ? r.gstNo.trim().toUpperCase() : '';
    if (!invKey) {
      unkeyed.push({ ...r });
      return;
    }
    const key = gstKey ? `${gstKey}_${invKey}` : invKey;
    if (!map.has(key)) {
      map.set(key, { ...r });
    } else {
      const existing = map.get(key)!;
      existing.taxable += r.taxable;
      existing.cgst += r.cgst;
      existing.sgst += r.sgst;
      existing.igst += r.igst;
      existing.nilRated += r.nilRated;
      existing.nonTaxable += r.nonTaxable;
      existing.total += r.total;
      if (!existing.invoiceDate && r.invoiceDate) existing.invoiceDate = r.invoiceDate;
      if ((!existing.month || existing.month === 'Unknown') && r.month) existing.month = r.month;
      if (!existing.party && r.party) existing.party = r.party;
      if (!existing.pos && r.pos) existing.pos = r.pos;
      if (!existing.voucherType && r.voucherType) existing.voucherType = r.voucherType;
    }
  });

  return [...Array.from(map.values()), ...unkeyed];
}

function getPan(gstNo: string): string {
  if (!gstNo) return '';
  const cleaned = gstNo.trim().toUpperCase().replace(/^GSTIN-/i, '');
  return cleaned.length >= 12 ? cleaned.slice(2, 12) : cleaned;
}

function matchLineLevel(books: CleanedRow[], portal: CleanedRow[]): VarianceResult[] {
  const consolidatedBooks = consolidateByInvoice(books);
  const consolidatedPortal = consolidateByInvoice(portal);

  const results: VarianceResult[] = [];
  const remainingPortal = [...consolidatedPortal];

  consolidatedBooks.forEach(b => {
    let matchIdx = -1;
    const bInv = (b.invoiceNo || '').trim().toUpperCase();
    const bGst = (b.gstNo || '').trim().toUpperCase();
    const bPan = getPan(bGst);

    // Tier 1: Exact GSTIN + Invoice No
    if (bGst && bInv) {
      const bKey = `${bGst}_${bInv}`;
      matchIdx = remainingPortal.findIndex(p => {
        const pGst = (p.gstNo || '').trim().toUpperCase();
        const pInv = (p.invoiceNo || '').trim().toUpperCase();
        return `${pGst}_${pInv}` === bKey;
      });
    }

    // Tier 2: PAN + Invoice No (Handles branch GSTIN differences)
    if (matchIdx === -1 && bPan && bInv) {
      matchIdx = remainingPortal.findIndex(p => {
        const pPan = getPan(p.gstNo);
        const pInv = (p.invoiceNo || '').trim().toUpperCase();
        return pPan === bPan && pInv === bInv && (p.month === b.month || !b.month || !p.month);
      });
    }

    // Tier 3: Same GSTIN / PAN + Same Month + Matching Taxable (within Rs 10 or 1%)
    if (matchIdx === -1 && bPan && b.taxable > 0) {
      matchIdx = remainingPortal.findIndex(p => {
        const pPan = getPan(p.gstNo);
        const tol = Math.max(10, b.taxable * 0.01);
        return pPan === bPan && (p.month === b.month || !b.month || !p.month) && Math.abs(b.taxable - p.taxable) <= tol;
      });
    }

    // Tier 4: Same Invoice No + Same Month + Matching Taxable (within Rs 10 or 1%)
    if (matchIdx === -1 && bInv && b.taxable > 0) {
      matchIdx = remainingPortal.findIndex(p => {
        const pInv = (p.invoiceNo || '').trim().toUpperCase();
        const tol = Math.max(10, b.taxable * 0.01);
        return pInv === bInv && (p.month === b.month || !b.month || !p.month) && Math.abs(b.taxable - p.taxable) <= tol;
      });
    }

    if (matchIdx !== -1) {
      const pMatch = remainingPortal.splice(matchIdx, 1)[0];
      const taxVar = Math.abs(b.taxable - pMatch.taxable);
      const cgstVar = Math.abs(b.cgst - pMatch.cgst);
      const sgstVar = Math.abs(b.sgst - pMatch.sgst);
      const igstVar = Math.abs(b.igst - pMatch.igst);

      const totalTaxB = b.cgst + b.sgst + b.igst;
      const totalTaxP = pMatch.cgst + pMatch.sgst + pMatch.igst;
      const totalTaxVar = Math.abs(totalTaxB - totalTaxP);

      const booksHasTax = totalTaxB > 0;
      const isMismatch = taxVar > 5 || (booksHasTax && totalTaxVar > 5);

      results.push({
        'Match Status': isMismatch ? 'Value Mismatch' : 'Perfect Match',
        'Month': b.month || pMatch.month,
        'Invoice Date': b.invoiceDate || pMatch.invoiceDate,
        'GST No': b.gstNo || pMatch.gstNo,
        'Invoice/Note No': b.invoiceNo || pMatch.invoiceNo,
        'Party Name': b.party || pMatch.party,
        'Taxable (Books)': b.taxable,
        'Taxable (Portal)': pMatch.taxable,
        'Taxable Variance': b.taxable - pMatch.taxable,
        'IGST (Books)': b.igst,
        'IGST (Portal)': pMatch.igst,
        'IGST Variance': b.igst - pMatch.igst,
        'CGST (Books)': b.cgst,
        'CGST (Portal)': pMatch.cgst,
        'CGST Variance': b.cgst - pMatch.cgst,
        'SGST (Books)': b.sgst,
        'SGST (Portal)': pMatch.sgst,
        'SGST Variance': b.sgst - pMatch.sgst,
      });
    } else {
      results.push({
        'Match Status': 'Missing in Portal',
        'Month': b.month,
        'Invoice Date': b.invoiceDate,
        'GST No': b.gstNo,
        'Invoice/Note No': b.invoiceNo,
        'Party Name': b.party,
        'Taxable (Books)': b.taxable,
        'Taxable (Portal)': 0,
        'Taxable Variance': b.taxable,
        'IGST (Books)': b.igst,
        'IGST (Portal)': 0,
        'IGST Variance': b.igst,
        'CGST (Books)': b.cgst,
        'CGST (Portal)': 0,
        'CGST Variance': b.cgst,
        'SGST (Books)': b.sgst,
        'SGST (Portal)': 0,
        'SGST Variance': b.sgst,
      });
    }
  });

  // Remaining Portal records are missing in books
  remainingPortal.forEach(p => {
    results.push({
      'Match Status': 'Missing in Books',
      'Month': p.month,
      'Invoice Date': p.invoiceDate,
      'GST No': p.gstNo,
      'Invoice/Note No': p.invoiceNo,
      'Party Name': p.party,
      'Taxable (Books)': 0,
      'Taxable (Portal)': p.taxable,
      'Taxable Variance': -p.taxable,
      'IGST (Books)': 0,
      'IGST (Portal)': p.igst,
      'IGST Variance': -p.igst,
      'CGST (Books)': 0,
      'CGST (Portal)': p.cgst,
      'CGST Variance': -p.cgst,
      'SGST (Books)': 0,
      'SGST (Portal)': p.sgst,
      'SGST Variance': -p.sgst,
    });
  });

  return results;
}

function matchBlockLevel(books: CleanedRow[], portal: CleanedRow[], isB2C = true): BlockVarianceResult[] {
  const aggregateData = (data: CleanedRow[]) => {
    return data.reduce((acc, row) => {
      const rate = isB2C ? snapToGstRate(row.taxable, row.cgst + row.sgst + row.igst) : 'Nil Rated';
      const key = `${row.month}_${rate}`;
      if (!acc[key]) {
        acc[key] = { month: row.month, rate, taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0, tax: 0 };
      }
      acc[key].taxable += isB2C ? (row.taxable || 0) : (row.nilRated || 0);
      acc[key].igst += (row.igst || 0);
      acc[key].cgst += (row.cgst || 0);
      acc[key].sgst += (row.sgst || 0);
      acc[key].nilRated += (row.nilRated || 0);
      acc[key].nonTaxable += (row.nonTaxable || 0);
      acc[key].tax += ((row.cgst || 0) + (row.sgst || 0) + (row.igst || 0));
      return acc;
    }, {} as Record<string, { month: string; rate: string | number; taxable: number; igst: number; cgst: number; sgst: number; nilRated: number; nonTaxable: number; tax: number }>);
  };

  const booksAgg = aggregateData(books);
  const portalAgg = aggregateData(portal);

  const allKeys = Array.from(new Set([...Object.keys(booksAgg), ...Object.keys(portalAgg)]));
  const results: BlockVarianceResult[] = [];

  allKeys.forEach(key => {
    const bVal = booksAgg[key] || { month: '', rate: '', taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0, tax: 0 };
    const pVal = portalAgg[key] || { month: '', rate: '', taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0, tax: 0 };

    const taxVar = Math.abs(bVal.taxable - pVal.taxable);
    let status: 'Perfect Match' | 'Value Mismatch' | 'Missing in Books' | 'Missing in Portal' = 'Perfect Match';

    if (!booksAgg[key]) status = 'Missing in Books';
    else if (!portalAgg[key]) status = 'Missing in Portal';
    else if (taxVar > 10) status = 'Value Mismatch';

    results.push({
      'Match Status': status,
      'Month': bVal.month || pVal.month,
      'Invoice Date': '', // Block aggregates don't have a single invoice date
      'Tax Rate / Category': bVal.rate || pVal.rate,
      'Taxable (Books)': bVal.taxable,
      'Taxable (Portal)': pVal.taxable,
      'Taxable Variance': bVal.taxable - pVal.taxable,
      'IGST (Books)': bVal.igst,
      'IGST (Portal)': pVal.igst,
      'IGST Variance': bVal.igst - pVal.igst,
      'CGST (Books)': bVal.cgst,
      'CGST (Portal)': pVal.cgst,
      'CGST Variance': bVal.cgst - pVal.cgst,
      'SGST (Books)': bVal.sgst,
      'SGST (Portal)': pVal.sgst,
      'SGST Variance': bVal.sgst - pVal.sgst,
      'Total Tax Variance': bVal.tax - pVal.tax,
    });
  });

  return results;
}

// ==========================================
// PHASE 4: OUTPUT GENERATION
// ==========================================

export interface TaxBreakdown {
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  nilRated: number;
  nonTaxable: number;
}

export interface PartySummary {
  month: string;
  booksPartyName: string;
  portalPartyName: string;
  booksGstNo: string;
  portalGstNo: string;
  booksB2b: TaxBreakdown;
  portalB2b: TaxBreakdown;
  booksExport: TaxBreakdown;
  portalExport: TaxBreakdown;
  booksCn: TaxBreakdown;
  portalCn: TaxBreakdown;
  booksDn: TaxBreakdown;
  portalDn: TaxBreakdown;
  booksB2c: TaxBreakdown;
  portalB2c: TaxBreakdown;
  booksNil: TaxBreakdown;
  portalNil: TaxBreakdown;
  booksNet: TaxBreakdown;
  portalNet: TaxBreakdown;
  variance: TaxBreakdown;
}

export interface MonthlySummary {
  month: string;
  booksSales: TaxBreakdown;
  booksCn: TaxBreakdown;
  booksNet: TaxBreakdown;

  booksB2b?: TaxBreakdown;
  booksExport?: TaxBreakdown;
  booksB2c?: TaxBreakdown;
  booksNil?: TaxBreakdown;

  portalB2b: TaxBreakdown;
  portalExport: TaxBreakdown;
  portalB2c: TaxBreakdown;
  portalCn: TaxBreakdown;
  portalNil: TaxBreakdown;
  portalNet: TaxBreakdown;

  variance: TaxBreakdown;
}

export interface OutputReconciliationResponse {
  buffer: Uint8Array;
  b2bResults: VarianceResult[];
  expResults: VarianceResult[];
  cnResults: VarianceResult[];
  b2cResults: BlockVarianceResult[];
  nilResults: BlockVarianceResult[];
  monthlySummaries: MonthlySummary[];
  partySummaries: PartySummary[];
  crossCheckTotals?: {
    masterBooksNet: number;
    masterPortalNet: number;
    masterNetVar: number;
    detailBooksNet: number;
    detailPortalNet: number;
    detailNetVar: number;
    difference: number;
    isBalanced: boolean;
  };
}



function inferGlobalYear(inputs: ReconciliationInputs): string {
  const yearCounts: Record<string, number> = {};

  const extractYear = (row: any) => {
    const val = row['Month'] || row['Return Period'] || row['Invoice Date'] || row['Note Date'];
    if (!val) return;
    const str = String(val);
    const yMatch4 = str.match(/\d{4}/);
    if (yMatch4) {
      const yr = yMatch4[0].slice(-2);
      yearCounts[yr] = (yearCounts[yr] || 0) + 1;
    }
  };

  inputs.booksSales.forEach(extractYear);
  inputs.portalB2B.forEach(extractYear);

  let bestYear = '';
  let maxCount = 0;
  for (const [yr, count] of Object.entries(yearCounts)) {
    if (count > maxCount) {
      maxCount = count;
      bestYear = yr;
    }
  }
  return bestYear;
}

function getNoteSign(row: any, fallbackSign = -1): number {
  const typeHeaders = ['document type', 'note type', 'voucher type', 'type of note', 'document_type', 'note_type', 'vch type'];
  for (const key of Object.keys(row)) {
    const normKey = key.toLowerCase().trim();
    if (typeHeaders.some(th => normKey.includes(th))) {
      const val = String(row[key]).toUpperCase().trim();
      if (val.startsWith('C') || val.includes('CREDIT')) return -1;
      if (val.startsWith('D') || val.includes('DEBIT')) return 1;
    }
  }
  if (row.voucherType) {
    const vt = String(row.voucherType).toUpperCase();
    if (vt.includes('CREDIT')) return -1;
    if (vt.includes('DEBIT')) return 1;
  }
  return fallbackSign;
}

export function executeOutputReconciliation(inputs: ReconciliationInputs): OutputReconciliationResponse {
  // 0. Infer Global Year (e.g. "23", "24") to handle data missing years
  const globalYear = inferGlobalYear(inputs);

  // 1. Sanitize Data
  const cleanBooksSales = sanitizeData(inputs.booksSales, globalYear);
  const cleanBooksCreditNotes = sanitizeData([...(inputs.booksCreditNotes || []), ...(inputs.booksReturns || [])], globalYear);
  const cleanPortalB2B = sanitizeData(inputs.portalB2B, globalYear);
  const cleanPortalExport = sanitizeData(inputs.portalExport || [], globalYear);
  const cleanPortalB2C = sanitizeData(inputs.portalB2C, globalYear);
  const cleanPortalB2CL = sanitizeData(inputs.portalB2CL, globalYear);
  const cleanPortalCN = sanitizeData(inputs.portalCN, globalYear);
  const cleanPortalNil = sanitizeData(inputs.portalNil, globalYear);

  // DEBUG: Log after sanitization
  console.log('=== DEBUG SANITIZED DATA ===');
  console.log('cleanBooksSales count:', cleanBooksSales.length);
  console.log('cleanPortalB2B count:', cleanPortalB2B.length);
  const aprilB2B = cleanPortalB2B.filter(r => r.month === 'Apr');
  const aprilB2BTaxable = aprilB2B.reduce((sum, r) => sum + r.taxable, 0);
  console.log('cleanPortalB2B April rows:', aprilB2B.length, 'Taxable:', aprilB2BTaxable);
  const aprilBooksSales = cleanBooksSales.filter(r => r.month === 'Apr');
  const aprilBooksTaxable = aprilBooksSales.reduce((sum, r) => sum + r.taxable, 0);
  console.log('cleanBooksSales April rows:', aprilBooksSales.length, 'Taxable:', aprilBooksTaxable);

  // 2. Segregate Books Data
  const { b2bBooks, b2cBooks, b2clBooks, nilBooks, expBooks } = segregateBooks(cleanBooksSales);

  console.log('b2bBooks count:', b2bBooks.length, 'b2cBooks:', b2cBooks.length, 'expBooks:', expBooks.length);
  const aprilB2bBooks = b2bBooks.filter(r => r.month === 'Apr');
  console.log('b2bBooks April rows:', aprilB2bBooks.length, 'Taxable:', aprilB2bBooks.reduce((s, r) => s + r.taxable, 0));
  console.log('=== END DEBUG SANITIZED ===');

  // 3. Execute Matches (portalCN has CN & DN, treated as unified returns block)
  const allB2bBooks = [...b2bBooks, ...b2clBooks];
  const allPortalB2B = [...cleanPortalB2B, ...cleanPortalB2CL];

  const b2bResults = matchLineLevel(allB2bBooks, allPortalB2B);
  const expResults = matchLineLevel(expBooks, cleanPortalExport);
  const taxableBooksCreditNotes = cleanBooksCreditNotes.filter(r => (r.taxable || 0) > 0 || (r.cgst || 0) > 0 || (r.sgst || 0) > 0 || (r.igst || 0) > 0);
  const cnResults = matchLineLevel(taxableBooksCreditNotes, cleanPortalCN);
  const b2cResults = matchBlockLevel(b2cBooks, cleanPortalB2C, true);
  const nilResults = matchBlockLevel(nilBooks, cleanPortalNil, false);

  // 4. Monthly Summaries (Master Matrix)
  const monthlySummaries: MonthlySummary[] = [];
  const FY_MONTH_ORDER = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

  FY_MONTH_ORDER.forEach(month => {
    const sumTaxable = (arr: CleanedRow[]) => arr.filter(r => r.month === month).reduce((sum, r) => sum + r.taxable, 0);
    const sumIgst = (arr: CleanedRow[]) => arr.filter(r => r.month === month).reduce((sum, r) => sum + r.igst, 0);
    const sumCgst = (arr: CleanedRow[]) => arr.filter(r => r.month === month).reduce((sum, r) => sum + r.cgst, 0);
    const sumSgst = (arr: CleanedRow[]) => arr.filter(r => r.month === month).reduce((sum, r) => sum + r.sgst, 0);
    const sumNil = (arr: CleanedRow[]) => arr.filter(r => r.month === month).reduce((sum, r) => sum + r.nilRated, 0);
    const sumNonTaxable = (arr: CleanedRow[]) => arr.filter(r => r.month === month).reduce((sum, r) => sum + r.nonTaxable, 0);

    const calcBreakdown = (arrs: CleanedRow[][]): TaxBreakdown => {
      let taxable = 0, igst = 0, cgst = 0, sgst = 0, nilRated = 0, nonTaxable = 0;
      arrs.forEach(arr => {
        taxable += sumTaxable(arr);
        igst += sumIgst(arr);
        cgst += sumCgst(arr);
        sgst += sumSgst(arr);
        nilRated += sumNil(arr);
        nonTaxable += sumNonTaxable(arr);
      });
      return { taxable, igst, cgst, sgst, nilRated, nonTaxable };
    };

    const bB2b = calcBreakdown([allB2bBooks]);
    const bExport = calcBreakdown([expBooks]);
    const bB2c = calcBreakdown([b2cBooks]);
    const bNil = calcBreakdown([nilBooks]);
    const bCn = calcBreakdown([cleanBooksCreditNotes]);

    const bSales: TaxBreakdown = {
      taxable: bB2b.taxable + bExport.taxable + bB2c.taxable + bNil.taxable,
      igst: bB2b.igst + bExport.igst + bB2c.igst + bNil.igst,
      cgst: bB2b.cgst + bExport.cgst + bB2c.cgst + bNil.cgst,
      sgst: bB2b.sgst + bExport.sgst + bB2c.sgst + bNil.sgst,
      nilRated: bB2b.nilRated + bExport.nilRated + bB2c.nilRated + bNil.nilRated,
      nonTaxable: bB2b.nonTaxable + bExport.nonTaxable + bB2c.nonTaxable + bNil.nonTaxable,
    };

    // Net Books is: Sales - CN
    const bNet: TaxBreakdown = {
      taxable: bSales.taxable - bCn.taxable,
      igst: bSales.igst - bCn.igst,
      cgst: bSales.cgst - bCn.cgst,
      sgst: bSales.sgst - bCn.sgst,
      nilRated: bSales.nilRated - bCn.nilRated,
      nonTaxable: bSales.nonTaxable - bCn.nonTaxable,
    };

    const pB2b = calcBreakdown([allPortalB2B]);
    const pExport = calcBreakdown([cleanPortalExport]);
    const pB2c = calcBreakdown([cleanPortalB2C]);
    const pCn = calcBreakdown([cleanPortalCN]);
    const pNil = calcBreakdown([cleanPortalNil]);

    const pNet: TaxBreakdown = {
      taxable: (pB2b.taxable + pExport.taxable + pB2c.taxable + pNil.taxable) - pCn.taxable,
      igst: (pB2b.igst + pExport.igst + pB2c.igst + pNil.igst) - pCn.igst,
      cgst: (pB2b.cgst + pExport.cgst + pB2c.cgst + pNil.cgst) - pCn.cgst,
      sgst: (pB2b.sgst + pExport.sgst + pB2c.sgst + pNil.sgst) - pCn.sgst,
      nilRated: (pB2b.nilRated + pExport.nilRated + pB2c.nilRated + pNil.nilRated) - pCn.nilRated,
      nonTaxable: (pB2b.nonTaxable + pExport.nonTaxable + pB2c.nonTaxable + pNil.nonTaxable) - pCn.nonTaxable,
    };

    const variance: TaxBreakdown = {
      taxable: bNet.taxable - pNet.taxable,
      igst: bNet.igst - pNet.igst,
      cgst: bNet.cgst - pNet.cgst,
      sgst: bNet.sgst - pNet.sgst,
      nilRated: bNet.nilRated - pNet.nilRated,
      nonTaxable: bNet.nonTaxable - pNet.nonTaxable,
    };

    // Only push if there is data for the month
    if (bSales.taxable || pNet.taxable || bSales.nilRated || pNet.nilRated || bSales.nonTaxable || pNet.nonTaxable || bCn.taxable || pCn.taxable) {
      monthlySummaries.push({
        month,
        booksSales: bSales,
        booksCn: bCn,
        booksNet: bNet,
        booksB2b: bB2b,
        booksExport: bExport,
        booksB2c: bB2c,
        booksNil: bNil,
        portalB2b: pB2b,
        portalExport: pExport,
        portalB2c: pB2c,
        portalCn: pCn,
        portalNil: pNil,
        portalNet: pNet,
        variance
      });
    }
  });

  // 6. Generate Party Summaries
  const partySummaries: PartySummary[] = [];
  const partyMap: Record<string, Record<string, {
    bB2b: CleanedRow[], pB2b: CleanedRow[],
    bExport: CleanedRow[], pExport: CleanedRow[],
    bCn: CleanedRow[], pCn: CleanedRow[],
    bB2c: CleanedRow[], pB2c: CleanedRow[],
    bNil: CleanedRow[], pNil: CleanedRow[],
    bName: string, pName: string, bGst: string, pGst: string
  }>> = {};

  const addPartyRow = (row: CleanedRow, type: 'bB2b' | 'pB2b' | 'bExport' | 'pExport' | 'bCn' | 'pCn' | 'bB2c' | 'pB2c' | 'bNil' | 'pNil') => {
    let key = '';
    if (row.gstNo && row.gstNo.trim().length >= 10) {
      key = row.gstNo.trim();
    } else if (type.includes('Export') && (row.party || row.invoiceNo)) {
      key = 'EXPORT_' + (row.party || row.invoiceNo || 'URP');
    } else if (row.party && row.party.trim().length > 0) {
      key = 'PARTY_' + row.party.trim().toUpperCase();
    } else {
      key = 'UNREGISTERED';
    }

    if (!partyMap[row.month]) partyMap[row.month] = {};
    if (!partyMap[row.month][key]) {
      partyMap[row.month][key] = { bB2b: [], pB2b: [], bExport: [], pExport: [], bCn: [], pCn: [], bB2c: [], pB2c: [], bNil: [], pNil: [], bName: '', pName: '', bGst: '', pGst: '' };
    }

    partyMap[row.month][key][type].push(row);

    if (type.startsWith('b')) {
      if (row.party && !partyMap[row.month][key].bName) partyMap[row.month][key].bName = row.party;
      if (row.gstNo && !partyMap[row.month][key].bGst) partyMap[row.month][key].bGst = row.gstNo;
      else if (!partyMap[row.month][key].bGst) partyMap[row.month][key].bGst = 'URP';
    } else {
      if (row.party && !partyMap[row.month][key].pName) partyMap[row.month][key].pName = row.party;
      if (row.gstNo && !partyMap[row.month][key].pGst) partyMap[row.month][key].pGst = row.gstNo;
      else if (!partyMap[row.month][key].pGst) partyMap[row.month][key].pGst = 'URP';
    }
  };

  allB2bBooks.forEach(r => addPartyRow(r, 'bB2b'));
  allPortalB2B.forEach(r => addPartyRow(r, 'pB2b'));
  expBooks.forEach(r => addPartyRow(r, 'bExport'));
  cleanPortalExport.forEach(r => addPartyRow(r, 'pExport'));
  cleanBooksCreditNotes.forEach(r => addPartyRow(r, 'bCn'));
  cleanPortalCN.forEach(r => addPartyRow(r, 'pCn'));
  b2cBooks.forEach(r => addPartyRow(r, 'bB2c'));
  cleanPortalB2C.forEach(r => addPartyRow(r, 'pB2c'));
  nilBooks.forEach(r => addPartyRow(r, 'bNil'));
  cleanPortalNil.forEach(r => addPartyRow(r, 'pNil'));

  const calcTax = (arrs: CleanedRow[][]): TaxBreakdown => {
    let taxable = 0, igst = 0, cgst = 0, sgst = 0, nilRated = 0, nonTaxable = 0;
    arrs.forEach(arr => arr.forEach(r => {
      taxable += r.taxable || 0; igst += r.igst || 0; cgst += r.cgst || 0; sgst += r.sgst || 0; nilRated += r.nilRated || 0; nonTaxable += r.nonTaxable || 0;
    }));
    return { taxable, igst, cgst, sgst, nilRated, nonTaxable };
  };

  FY_MONTH_ORDER.forEach(month => {
    if (partyMap[month] || monthlySummaries.some(s => s.month === month)) {
      const b2bSums = {
        bB2bTaxable: 0, bB2bIgst: 0, bB2bCgst: 0, bB2bSgst: 0, bB2bNil: 0, bB2bNonTaxable: 0,
        pB2bTaxable: 0, pB2bIgst: 0, pB2bCgst: 0, pB2bSgst: 0, pB2bNil: 0, pB2bNonTaxable: 0,
        bExportTaxable: 0, bExportIgst: 0, bExportCgst: 0, bExportSgst: 0, bExportNil: 0, bExportNonTaxable: 0,
        pExportTaxable: 0, pExportIgst: 0, pExportCgst: 0, pExportSgst: 0, pExportNil: 0, pExportNonTaxable: 0,
        bCnTaxable: 0, bCnIgst: 0, bCnCgst: 0, bCnSgst: 0, bCnNil: 0, bCnNonTaxable: 0,
        pCnTaxable: 0, pCnIgst: 0, pCnCgst: 0, pCnSgst: 0, pCnNil: 0, pCnNonTaxable: 0,
        bB2cTaxable: 0, bB2cIgst: 0, bB2cCgst: 0, bB2cSgst: 0, bB2cNil: 0, bB2cNonTaxable: 0,
        pB2cTaxable: 0, pB2cIgst: 0, pB2cCgst: 0, pB2cSgst: 0, pB2cNil: 0, pB2cNonTaxable: 0,
        bNilTaxable: 0, bNilIgst: 0, bNilCgst: 0, bNilSgst: 0, bNilNil: 0, bNilNonTaxable: 0,
        pNilTaxable: 0, pNilIgst: 0, pNilCgst: 0, pNilSgst: 0, pNilNil: 0, pNilNonTaxable: 0,
      };

      if (partyMap[month]) {
        Object.keys(partyMap[month]).sort().forEach(gstKey => {
          const data = partyMap[month][gstKey];
          const booksB2b = calcTax([data.bB2b]);
          const portalB2b = calcTax([data.pB2b]);
          const booksExport = calcTax([data.bExport]);
          const portalExport = calcTax([data.pExport]);
          const booksCn = calcTax([data.bCn]);
          const portalCn = calcTax([data.pCn]);
          const booksB2c = calcTax([data.bB2c]);
          const portalB2c = calcTax([data.pB2c]);
          const booksNil = calcTax([data.bNil]);
          const portalNil = calcTax([data.pNil]);

          b2bSums.bB2bTaxable += booksB2b.taxable; b2bSums.bB2bIgst += booksB2b.igst; b2bSums.bB2bCgst += booksB2b.cgst; b2bSums.bB2bSgst += booksB2b.sgst; b2bSums.bB2bNil += booksB2b.nilRated; b2bSums.bB2bNonTaxable += booksB2b.nonTaxable;
          b2bSums.pB2bTaxable += portalB2b.taxable; b2bSums.pB2bIgst += portalB2b.igst; b2bSums.pB2bCgst += portalB2b.cgst; b2bSums.pB2bSgst += portalB2b.sgst; b2bSums.pB2bNil += portalB2b.nilRated; b2bSums.pB2bNonTaxable += portalB2b.nonTaxable;
          b2bSums.bExportTaxable += booksExport.taxable; b2bSums.bExportIgst += booksExport.igst; b2bSums.bExportCgst += booksExport.cgst; b2bSums.bExportSgst += booksExport.sgst; b2bSums.bExportNil += booksExport.nilRated; b2bSums.bExportNonTaxable += booksExport.nonTaxable;
          b2bSums.pExportTaxable += portalExport.taxable; b2bSums.pExportIgst += portalExport.igst; b2bSums.pExportCgst += portalExport.cgst; b2bSums.pExportSgst += portalExport.sgst; b2bSums.pExportNil += portalExport.nilRated; b2bSums.pExportNonTaxable += portalExport.nonTaxable;
          b2bSums.bCnTaxable += booksCn.taxable; b2bSums.bCnIgst += booksCn.igst; b2bSums.bCnCgst += booksCn.cgst; b2bSums.bCnSgst += booksCn.sgst; b2bSums.bCnNil += booksCn.nilRated; b2bSums.bCnNonTaxable += booksCn.nonTaxable;
          b2bSums.pCnTaxable += portalCn.taxable; b2bSums.pCnIgst += portalCn.igst; b2bSums.pCnCgst += portalCn.cgst; b2bSums.pCnSgst += portalCn.sgst; b2bSums.pCnNil += portalCn.nilRated; b2bSums.pCnNonTaxable += portalCn.nonTaxable;
          b2bSums.bB2cTaxable += booksB2c.taxable; b2bSums.bB2cIgst += booksB2c.igst; b2bSums.bB2cCgst += booksB2c.cgst; b2bSums.bB2cSgst += booksB2c.sgst; b2bSums.bB2cNil += booksB2c.nilRated; b2bSums.bB2cNonTaxable += booksB2c.nonTaxable;
          b2bSums.pB2cTaxable += portalB2c.taxable; b2bSums.pB2cIgst += portalB2c.igst; b2bSums.pB2cCgst += portalB2c.cgst; b2bSums.pB2cSgst += portalB2c.sgst; b2bSums.pB2cNil += portalB2c.nilRated; b2bSums.pB2cNonTaxable += portalB2c.nonTaxable;
          b2bSums.bNilTaxable += (booksNil.nilRated + booksNil.nonTaxable); b2bSums.bNilIgst += booksNil.igst; b2bSums.bNilCgst += booksNil.cgst; b2bSums.bNilSgst += booksNil.sgst; b2bSums.bNilNil += booksNil.nilRated; b2bSums.bNilNonTaxable += booksNil.nonTaxable;
          b2bSums.pNilTaxable += (portalNil.nilRated + portalNil.nonTaxable); b2bSums.pNilIgst += portalNil.igst; b2bSums.pNilCgst += portalNil.cgst; b2bSums.pNilSgst += portalNil.sgst; b2bSums.pNilNil += portalNil.nilRated; b2bSums.pNilNonTaxable += portalNil.nonTaxable;

          const booksNet: TaxBreakdown = {
            taxable: booksB2b.taxable + booksExport.taxable + booksB2c.taxable - booksCn.taxable,
            igst: booksB2b.igst + booksExport.igst + booksB2c.igst - booksCn.igst,
            cgst: booksB2b.cgst + booksExport.cgst + booksB2c.cgst - booksCn.cgst,
            sgst: booksB2b.sgst + booksExport.sgst + booksB2c.sgst - booksCn.sgst,
            nilRated: booksB2b.nilRated + booksExport.nilRated + booksB2c.nilRated + booksNil.nilRated - booksCn.nilRated,
            nonTaxable: booksB2b.nonTaxable + booksExport.nonTaxable + booksB2c.nonTaxable + booksNil.nonTaxable - booksCn.nonTaxable,
          };
          const portalNet: TaxBreakdown = {
            taxable: portalB2b.taxable + portalExport.taxable + portalB2c.taxable - portalCn.taxable,
            igst: portalB2b.igst + portalExport.igst + portalB2c.igst - portalCn.igst,
            cgst: portalB2b.cgst + portalExport.cgst + portalB2c.cgst - portalCn.cgst,
            sgst: portalB2b.sgst + portalExport.sgst + portalB2c.sgst - portalCn.sgst,
            nilRated: portalB2b.nilRated + portalExport.nilRated + portalB2c.nilRated + portalNil.nilRated - portalCn.nilRated,
            nonTaxable: portalB2b.nonTaxable + portalExport.nonTaxable + portalB2c.nonTaxable + portalNil.nonTaxable - portalCn.nonTaxable,
          };
          const variance: TaxBreakdown = {
            taxable: booksNet.taxable - portalNet.taxable,
            igst: booksNet.igst - portalNet.igst,
            cgst: booksNet.cgst - portalNet.cgst,
            sgst: booksNet.sgst - portalNet.sgst,
            nilRated: booksNet.nilRated - portalNet.nilRated,
            nonTaxable: booksNet.nonTaxable - portalNet.nonTaxable,
          };

          partySummaries.push({
            month,
            booksPartyName: data.bName,
            portalPartyName: data.pName,
            booksGstNo: data.bGst,
            portalGstNo: data.pGst,
            booksB2b, portalB2b,
            booksExport, portalExport,
            booksCn, portalCn,
            booksDn: { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 },
            portalDn: { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 },
            booksB2c, portalB2c, booksNil, portalNil, booksNet, portalNet, variance
          });
        });
      }

      // Inject B2C & Nil Rated Pseudo Party
      const monthSum = monthlySummaries.find(s => s.month === month);
      if (monthSum) {
        const booksB2b: TaxBreakdown = { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 };
        const portalB2b: TaxBreakdown = { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 };
        const booksExport: TaxBreakdown = { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 };
        const portalExport: TaxBreakdown = { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 };

        // B2C
        const remBooksB2cTaxable = (monthSum.booksB2c?.taxable ?? 0) - b2bSums.bB2cTaxable;
        const remBooksB2cIgst = (monthSum.booksB2c?.igst ?? 0) - b2bSums.bB2cIgst;
        const remBooksB2cCgst = (monthSum.booksB2c?.cgst ?? 0) - b2bSums.bB2cCgst;
        const remBooksB2cSgst = (monthSum.booksB2c?.sgst ?? 0) - b2bSums.bB2cSgst;

        const remPortalB2cTaxable = monthSum.portalB2c.taxable - b2bSums.pB2cTaxable;
        const remPortalB2cIgst = monthSum.portalB2c.igst - b2bSums.pB2cIgst;
        const remPortalB2cCgst = monthSum.portalB2c.cgst - b2bSums.pB2cCgst;
        const remPortalB2cSgst = monthSum.portalB2c.sgst - b2bSums.pB2cSgst;

        const booksB2c: TaxBreakdown = {
          taxable: remBooksB2cTaxable,
          igst: remBooksB2cIgst,
          cgst: remBooksB2cCgst,
          sgst: remBooksB2cSgst,
          nilRated: 0,
          nonTaxable: 0
        };

        const portalB2c: TaxBreakdown = {
          taxable: remPortalB2cTaxable,
          igst: remPortalB2cIgst,
          cgst: remPortalB2cCgst,
          sgst: remPortalB2cSgst,
          nilRated: 0,
          nonTaxable: 0
        };

        // Nil Rated & Non Taxable (Net of Credit Notes so totality matches Master 12M matrix)
        const remBooksNil = monthSum.booksNet.nilRated - b2bSums.bNilNil;
        const remBooksNonTax = monthSum.booksNet.nonTaxable - b2bSums.bNilNonTaxable;
        const remPortalNil = monthSum.portalNet.nilRated - b2bSums.pNilNil;
        const remPortalNonTax = monthSum.portalNet.nonTaxable - b2bSums.pNilNonTaxable;

        const booksNil: TaxBreakdown = {
          taxable: 0,
          igst: 0,
          cgst: 0,
          sgst: 0,
          nilRated: remBooksNil,
          nonTaxable: remBooksNonTax
        };

        const portalNil: TaxBreakdown = {
          taxable: 0,
          igst: 0,
          cgst: 0,
          sgst: 0,
          nilRated: remPortalNil,
          nonTaxable: remPortalNonTax
        };

        const booksCn: TaxBreakdown = {
          taxable: monthSum.booksCn.taxable - b2bSums.bCnTaxable,
          igst: monthSum.booksCn.igst - b2bSums.bCnIgst,
          cgst: monthSum.booksCn.cgst - b2bSums.bCnCgst,
          sgst: monthSum.booksCn.sgst - b2bSums.bCnSgst,
          nilRated: 0,
          nonTaxable: 0
        };
        const portalCn: TaxBreakdown = {
          taxable: monthSum.portalCn.taxable - b2bSums.pCnTaxable,
          igst: monthSum.portalCn.igst - b2bSums.pCnIgst,
          cgst: monthSum.portalCn.cgst - b2bSums.pCnCgst,
          sgst: monthSum.portalCn.sgst - b2bSums.pCnSgst,
          nilRated: 0,
          nonTaxable: 0
        };
        const booksDn: TaxBreakdown = { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 };
        const portalDn: TaxBreakdown = { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 };

        const hasB2cOrNil = Math.abs(booksB2c.taxable) > 0.001 || Math.abs(portalB2c.taxable) > 0.001 || Math.abs(booksNil.nilRated) > 0.001 || Math.abs(portalNil.nilRated) > 0.001 || Math.abs(booksNil.nonTaxable) > 0.001 || Math.abs(portalNil.nonTaxable) > 0.001 || Math.abs(booksCn.taxable) > 0.001 || Math.abs(portalCn.taxable) > 0.001;

        if (hasB2cOrNil) {
          const booksNet: TaxBreakdown = {
            taxable: booksB2b.taxable + booksExport.taxable + booksB2c.taxable - booksCn.taxable,
            igst: booksB2b.igst + booksExport.igst + booksB2c.igst - booksCn.igst,
            cgst: booksB2b.cgst + booksExport.cgst + booksB2c.cgst - booksCn.cgst,
            sgst: booksB2b.sgst + booksExport.sgst + booksB2c.sgst - booksCn.sgst,
            nilRated: booksNil.nilRated - booksCn.nilRated,
            nonTaxable: booksNil.nonTaxable - booksCn.nonTaxable,
          };
          const portalNet: TaxBreakdown = {
            taxable: portalB2b.taxable + portalExport.taxable + portalB2c.taxable - portalCn.taxable,
            igst: portalB2b.igst + portalExport.igst + portalB2c.igst - portalCn.igst,
            cgst: portalB2b.cgst + portalExport.cgst + portalB2c.cgst - portalCn.cgst,
            sgst: portalB2b.sgst + portalExport.sgst + portalB2c.sgst - portalCn.sgst,
            nilRated: portalNil.nilRated - portalCn.nilRated,
            nonTaxable: portalNil.nonTaxable - portalCn.nonTaxable,
          };
          const variance: TaxBreakdown = {
            taxable: booksNet.taxable - portalNet.taxable,
            igst: booksNet.igst - portalNet.igst,
            cgst: booksNet.cgst - portalNet.cgst,
            sgst: booksNet.sgst - portalNet.sgst,
            nilRated: booksNet.nilRated - portalNet.nilRated,
            nonTaxable: booksNet.nonTaxable - portalNet.nonTaxable,
          };

          partySummaries.push({
            month,
            booksPartyName: 'B2C Consumers & Nil Rated',
            portalPartyName: 'B2C Consumers & Nil Rated',
            booksGstNo: 'UNREGISTERED',
            portalGstNo: 'UNREGISTERED',
            booksB2b, portalB2b,
            booksExport: { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 },
            portalExport: { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 },
            booksCn, portalCn, booksDn, portalDn, booksB2c, portalB2c, booksNil, portalNil, booksNet, portalNet, variance
          });
        }
      }
    }
  });

  // --- MULTI-TABLE MASTER DASHBOARD (SIDE-BY-SIDE) ---
  const masterAoA: any[][] = [];
  const merges: XLSX.Range[] = [];

  const C = (colIndex: number) => {
    let let1 = Math.floor(colIndex / 26) - 1;
    let let2 = colIndex % 26;
    let res = let1 >= 0 ? String.fromCharCode(65 + let1) : '';
    res += String.fromCharCode(65 + let2);
    return res;
  };

  // 1. TOP SECTION: NET COMPARISON
  const sec1Row = masterAoA.length;
  masterAoA.push([
    'Month',
    'A. NET BOOKS DATA', '', '', '', '', '',
    'B. NET PORTAL DATA', '', '', '', '', '',
    'FINAL VARIANCE (A - B)', '', '', '', '', ''
  ]);
  masterAoA.push([
    'Month',
    'Taxable', 'IGST', 'CGST', 'SGST', 'Nil Rated', 'Non Taxable',
    'Taxable', 'IGST', 'CGST', 'SGST', 'Nil Rated', 'Non Taxable',
    'Taxable', 'IGST', 'CGST', 'SGST', 'Nil Rated', 'Non Taxable'
  ]);
  merges.push({ s: { r: sec1Row, c: 0 }, e: { r: sec1Row + 1, c: 0 } });
  merges.push({ s: { r: sec1Row, c: 1 }, e: { r: sec1Row, c: 6 } });
  merges.push({ s: { r: sec1Row, c: 7 }, e: { r: sec1Row, c: 12 } });
  merges.push({ s: { r: sec1Row, c: 13 }, e: { r: sec1Row, c: 18 } });

  monthlySummaries.forEach((s, i) => {
    const rowNum = sec1Row + 3 + i;
    masterAoA.push([
      s.month,
      s.booksNet.taxable, s.booksNet.igst, s.booksNet.cgst, s.booksNet.sgst, s.booksNet.nilRated, s.booksNet.nonTaxable,
      s.portalNet.taxable, s.portalNet.igst, s.portalNet.cgst, s.portalNet.sgst, s.portalNet.nilRated, s.portalNet.nonTaxable,
      { t: 'n', v: s.variance.taxable, f: `B${rowNum}-H${rowNum}` },
      { t: 'n', v: s.variance.igst, f: `C${rowNum}-I${rowNum}` },
      { t: 'n', v: s.variance.cgst, f: `D${rowNum}-J${rowNum}` },
      { t: 'n', v: s.variance.sgst, f: `E${rowNum}-K${rowNum}` },
      { t: 'n', v: s.variance.nilRated, f: `F${rowNum}-L${rowNum}` },
      { t: 'n', v: s.variance.nonTaxable, f: `G${rowNum}-M${rowNum}` }
    ]);
  });
  const sec1TotalRow: any[] = ['TOTAL'];
  for (let c = 1; c <= 18; c++) {
    const colName = C(c);
    const sumVal = monthlySummaries.reduce((sum, s) => {
      if (c === 1) return sum + s.booksNet.taxable;
      if (c === 2) return sum + s.booksNet.igst;
      if (c === 3) return sum + s.booksNet.cgst;
      if (c === 4) return sum + s.booksNet.sgst;
      if (c === 5) return sum + s.booksNet.nilRated;
      if (c === 6) return sum + s.booksNet.nonTaxable;
      if (c === 7) return sum + s.portalNet.taxable;
      if (c === 8) return sum + s.portalNet.igst;
      if (c === 9) return sum + s.portalNet.cgst;
      if (c === 10) return sum + s.portalNet.sgst;
      if (c === 11) return sum + s.portalNet.nilRated;
      if (c === 12) return sum + s.portalNet.nonTaxable;
      if (c === 13) return sum + s.variance.taxable;
      if (c === 14) return sum + s.variance.igst;
      if (c === 15) return sum + s.variance.cgst;
      if (c === 16) return sum + s.variance.sgst;
      if (c === 17) return sum + s.variance.nilRated;
      if (c === 18) return sum + s.variance.nonTaxable;
      return sum;
    }, 0);
    sec1TotalRow.push({ t: 'n', v: sumVal, f: `SUM(${colName}3:${colName}${2 + monthlySummaries.length})` });
  }
  if (monthlySummaries.length > 0) masterAoA.push(sec1TotalRow);
  const sec1EndRow = masterAoA.length - 1;

  masterAoA.push([]); masterAoA.push([]);

  // 2. MIDDLE SECTION: BOOKS (Only primary, credit notes, and net)
  const sec2Row = masterAoA.length;
  masterAoA.push([
    'Month',
    'A1. BOOKS SALES DATA', '', '', '', '', '',
    'A2. LESS: BOOKS CREDIT NOTES', '', '', '', '', '',
    'A. NET BOOKS DATA (A1 - A2)', '', '', '', '', ''
  ]);
  masterAoA.push([
    'Month',
    'Taxable', 'IGST', 'CGST', 'SGST', 'Nil Rated', 'Non Taxable',
    'Taxable', 'IGST', 'CGST', 'SGST', 'Nil Rated', 'Non Taxable',
    'Taxable', 'IGST', 'CGST', 'SGST', 'Nil Rated', 'Non Taxable'
  ]);
  merges.push({ s: { r: sec2Row, c: 0 }, e: { r: sec2Row + 1, c: 0 } });
  merges.push({ s: { r: sec2Row, c: 1 }, e: { r: sec2Row, c: 6 } });
  merges.push({ s: { r: sec2Row, c: 7 }, e: { r: sec2Row, c: 12 } });
  merges.push({ s: { r: sec2Row, c: 13 }, e: { r: sec2Row, c: 18 } });

  monthlySummaries.forEach((s, i) => {
    const rowNum = sec2Row + 3 + i;
    masterAoA.push([
      s.month,
      s.booksSales.taxable, s.booksSales.igst, s.booksSales.cgst, s.booksSales.sgst, s.booksSales.nilRated, s.booksSales.nonTaxable,
      s.booksCn.taxable, s.booksCn.igst, s.booksCn.cgst, s.booksCn.sgst, s.booksCn.nilRated, s.booksCn.nonTaxable,
      { t: 'n', v: s.booksNet.taxable, f: `B${rowNum}-H${rowNum}` },
      { t: 'n', v: s.booksNet.igst, f: `C${rowNum}-I${rowNum}` },
      { t: 'n', v: s.booksNet.cgst, f: `D${rowNum}-J${rowNum}` },
      { t: 'n', v: s.booksNet.sgst, f: `E${rowNum}-K${rowNum}` },
      { t: 'n', v: s.booksNet.nilRated, f: `F${rowNum}-L${rowNum}` },
      { t: 'n', v: s.booksNet.nonTaxable, f: `G${rowNum}-M${rowNum}` }
    ]);
  });
  const sec2TotalRow: any[] = ['TOTAL'];
  const sec2Start = sec2Row + 3;
  const sec2End = sec2Row + 2 + monthlySummaries.length;
  for (let c = 1; c <= 18; c++) {
    const colName = C(c);
    const sumVal = monthlySummaries.reduce((sum, s) => {
      if (c === 1) return sum + s.booksSales.taxable;
      if (c === 2) return sum + s.booksSales.igst;
      if (c === 3) return sum + s.booksSales.cgst;
      if (c === 4) return sum + s.booksSales.sgst;
      if (c === 5) return sum + s.booksSales.nilRated;
      if (c === 6) return sum + s.booksSales.nonTaxable;
      if (c === 7) return sum + s.booksCn.taxable;
      if (c === 8) return sum + s.booksCn.igst;
      if (c === 9) return sum + s.booksCn.cgst;
      if (c === 10) return sum + s.booksCn.sgst;
      if (c === 11) return sum + s.booksCn.nilRated;
      if (c === 12) return sum + s.booksCn.nonTaxable;
      if (c === 13) return sum + s.booksNet.taxable;
      if (c === 14) return sum + s.booksNet.igst;
      if (c === 15) return sum + s.booksNet.cgst;
      if (c === 16) return sum + s.booksNet.sgst;
      if (c === 17) return sum + s.booksNet.nilRated;
      if (c === 18) return sum + s.booksNet.nonTaxable;
      return sum;
    }, 0);
    sec2TotalRow.push({ t: 'n', v: sumVal, f: `SUM(${colName}${sec2Start}:${colName}${sec2End})` });
  }
  if (monthlySummaries.length > 0) masterAoA.push(sec2TotalRow);
  const sec2EndRow = masterAoA.length - 1;

  masterAoA.push([]); masterAoA.push([]);

  // 3. MIDDLE SECTION: PORTAL (B2B, Exports, B2C, Nil, CN, Net)
  const sec3Row = masterAoA.length;
  masterAoA.push([
    'Month',
    'B1. PORTAL B2B', '', '', '', '', '',
    'B2. PORTAL EXPORTS', '', '', '', '', '',
    'B3. PORTAL B2C & B2CL', '', '', '', '', '',
    'B4. PORTAL NIL RATED', '', '', '', '', '',
    'B5. LESS: PORTAL CN', '', '', '', '', '',
    'B. NET PORTAL DATA (B1+B2+B3+B4-B5)', '', '', '', '', ''
  ]);
  masterAoA.push([
    'Month',
    'Taxable', 'IGST', 'CGST', 'SGST', 'Nil Rated', 'Non Taxable',
    'Taxable', 'IGST', 'CGST', 'SGST', 'Nil Rated', 'Non Taxable',
    'Taxable', 'IGST', 'CGST', 'SGST', 'Nil Rated', 'Non Taxable',
    'Taxable', 'IGST', 'CGST', 'SGST', 'Nil Rated', 'Non Taxable',
    'Taxable', 'IGST', 'CGST', 'SGST', 'Nil Rated', 'Non Taxable',
    'Taxable', 'IGST', 'CGST', 'SGST', 'Nil Rated', 'Non Taxable'
  ]);
  merges.push({ s: { r: sec3Row, c: 0 }, e: { r: sec3Row + 1, c: 0 } });
  merges.push({ s: { r: sec3Row, c: 1 }, e: { r: sec3Row, c: 6 } });
  merges.push({ s: { r: sec3Row, c: 7 }, e: { r: sec3Row, c: 12 } });
  merges.push({ s: { r: sec3Row, c: 13 }, e: { r: sec3Row, c: 18 } });
  merges.push({ s: { r: sec3Row, c: 19 }, e: { r: sec3Row, c: 24 } });
  merges.push({ s: { r: sec3Row, c: 25 }, e: { r: sec3Row, c: 30 } });
  merges.push({ s: { r: sec3Row, c: 31 }, e: { r: sec3Row, c: 36 } });

  monthlySummaries.forEach((s, i) => {
    const rowNum = sec3Row + 3 + i;
    masterAoA.push([
      s.month,
      s.portalB2b.taxable, s.portalB2b.igst, s.portalB2b.cgst, s.portalB2b.sgst, s.portalB2b.nilRated, s.portalB2b.nonTaxable,
      s.portalExport.taxable, s.portalExport.igst, s.portalExport.cgst, s.portalExport.sgst, s.portalExport.nilRated, s.portalExport.nonTaxable,
      s.portalB2c.taxable, s.portalB2c.igst, s.portalB2c.cgst, s.portalB2c.sgst, s.portalB2c.nilRated, s.portalB2c.nonTaxable,
      s.portalNil.taxable, s.portalNil.igst, s.portalNil.cgst, s.portalNil.sgst, s.portalNil.nilRated, s.portalNil.nonTaxable,
      s.portalCn.taxable, s.portalCn.igst, s.portalCn.cgst, s.portalCn.sgst, s.portalCn.nilRated, s.portalCn.nonTaxable,
      { t: 'n', v: s.portalNet.taxable, f: `B${rowNum}+H${rowNum}+N${rowNum}+T${rowNum}-Z${rowNum}` },
      { t: 'n', v: s.portalNet.igst, f: `C${rowNum}+I${rowNum}+O${rowNum}+U${rowNum}-AA${rowNum}` },
      { t: 'n', v: s.portalNet.cgst, f: `D${rowNum}+J${rowNum}+P${rowNum}+V${rowNum}-AB${rowNum}` },
      { t: 'n', v: s.portalNet.sgst, f: `E${rowNum}+K${rowNum}+Q${rowNum}+W${rowNum}-AC${rowNum}` },
      { t: 'n', v: s.portalNet.nilRated, f: `F${rowNum}+L${rowNum}+R${rowNum}+X${rowNum}-AD${rowNum}` },
      { t: 'n', v: s.portalNet.nonTaxable, f: `G${rowNum}+M${rowNum}+S${rowNum}+Y${rowNum}-AE${rowNum}` }
    ]);
  });
  const sec3TotalRow: any[] = ['TOTAL'];
  const sec3Start = sec3Row + 3;
  const sec3End = sec3Row + 2 + monthlySummaries.length;
  for (let c = 1; c <= 36; c++) {
    const colName = C(c);
    const sumVal = monthlySummaries.reduce((sum, s) => {
      if (c === 1) return sum + s.portalB2b.taxable;
      if (c === 2) return sum + s.portalB2b.igst;
      if (c === 3) return sum + s.portalB2b.cgst;
      if (c === 4) return sum + s.portalB2b.sgst;
      if (c === 5) return sum + s.portalB2b.nilRated;
      if (c === 6) return sum + s.portalB2b.nonTaxable;

      if (c === 7) return sum + s.portalExport.taxable;
      if (c === 8) return sum + s.portalExport.igst;
      if (c === 9) return sum + s.portalExport.cgst;
      if (c === 10) return sum + s.portalExport.sgst;
      if (c === 11) return sum + s.portalExport.nilRated;
      if (c === 12) return sum + s.portalExport.nonTaxable;

      if (c === 13) return sum + s.portalB2c.taxable;
      if (c === 14) return sum + s.portalB2c.igst;
      if (c === 15) return sum + s.portalB2c.cgst;
      if (c === 16) return sum + s.portalB2c.sgst;
      if (c === 17) return sum + s.portalB2c.nilRated;
      if (c === 18) return sum + s.portalB2c.nonTaxable;

      if (c === 19) return sum + s.portalNil.taxable;
      if (c === 20) return sum + s.portalNil.igst;
      if (c === 21) return sum + s.portalNil.cgst;
      if (c === 22) return sum + s.portalNil.sgst;
      if (c === 23) return sum + s.portalNil.nilRated;
      if (c === 24) return sum + s.portalNil.nonTaxable;

      if (c === 25) return sum + s.portalCn.taxable;
      if (c === 26) return sum + s.portalCn.igst;
      if (c === 27) return sum + s.portalCn.cgst;
      if (c === 28) return sum + s.portalCn.sgst;
      if (c === 29) return sum + s.portalCn.nilRated;
      if (c === 30) return sum + s.portalCn.nonTaxable;

      if (c === 31) return sum + s.portalNet.taxable;
      if (c === 32) return sum + s.portalNet.igst;
      if (c === 33) return sum + s.portalNet.cgst;
      if (c === 34) return sum + s.portalNet.sgst;
      if (c === 35) return sum + s.portalNet.nilRated;
      if (c === 36) return sum + s.portalNet.nonTaxable;
      return sum;
    }, 0);
    sec3TotalRow.push({ t: 'n', v: sumVal, f: `SUM(${colName}${sec3Start}:${colName}${sec3End})` });
  }
  if (monthlySummaries.length > 0) masterAoA.push(sec3TotalRow);
  const sec3EndRow = masterAoA.length - 1;

  masterAoA.push([]); masterAoA.push([]);

  // 4. BOTTOM SECTION: 3B COMPARISON
  const sec4Row = masterAoA.length;
  masterAoA.push([
    'Month',
    '3B', '', '', '', '', '',
    '3B - Books', '', '', '', '', '',
    '3B - GSTR1', '', '', '', '', ''
  ]);
  masterAoA.push([
    'Month',
    'Taxable', 'IGST', 'CGST', 'SGST', 'Nil Rated', 'Non Taxable',
    'Taxable', 'IGST', 'CGST', 'SGST', 'Nil Rated', 'Non Taxable',
    'Taxable', 'IGST', 'CGST', 'SGST', 'Nil Rated', 'Non Taxable'
  ]);
  merges.push({ s: { r: sec4Row, c: 0 }, e: { r: sec4Row + 1, c: 0 } });
  merges.push({ s: { r: sec4Row, c: 1 }, e: { r: sec4Row, c: 6 } });
  merges.push({ s: { r: sec4Row, c: 7 }, e: { r: sec4Row, c: 12 } });
  merges.push({ s: { r: sec4Row, c: 13 }, e: { r: sec4Row, c: 18 } });

  const tbData = inputs.gstr3bData || {};
  monthlySummaries.forEach((s, i) => {
    const rowNum = sec4Row + 3 + i;
    const bRow = sec1Row + 3 + i;
    const pRow = sec1Row + 3 + i;

    const monthKey = s.month;
    let v3b = { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 };

    for (const [key, val] of Object.entries(tbData)) {
      if (key.toLowerCase().includes(monthKey.toLowerCase())) {
        v3b = {
          taxable: (val as any).taxable || 0,
          igst: (val as any).igst || 0,
          cgst: (val as any).cgst || 0,
          sgst: (val as any).sgst || 0,
          nilRated: (val as any).nilRated || 0,
          nonTaxable: (val as any).nonTaxable || 0
        };
        break;
      }
    }

    masterAoA.push([
      s.month,
      v3b.taxable, v3b.igst, v3b.cgst, v3b.sgst, v3b.nilRated, v3b.nonTaxable,
      { t: 'n', v: v3b.taxable - s.booksNet.taxable, f: `B${rowNum}-B${bRow}` },
      { t: 'n', v: v3b.igst - s.booksNet.igst, f: `C${rowNum}-C${bRow}` },
      { t: 'n', v: v3b.cgst - s.booksNet.cgst, f: `D${rowNum}-D${bRow}` },
      { t: 'n', v: v3b.sgst - s.booksNet.sgst, f: `E${rowNum}-E${bRow}` },
      { t: 'n', v: v3b.nilRated - s.booksNet.nilRated, f: `F${rowNum}-F${bRow}` },
      { t: 'n', v: v3b.nonTaxable - s.booksNet.nonTaxable, f: `G${rowNum}-G${bRow}` },
      { t: 'n', v: v3b.taxable - s.portalNet.taxable, f: `B${rowNum}-H${pRow}` },
      { t: 'n', v: v3b.igst - s.portalNet.igst, f: `C${rowNum}-I${pRow}` },
      { t: 'n', v: v3b.cgst - s.portalNet.cgst, f: `D${rowNum}-J${pRow}` },
      { t: 'n', v: v3b.sgst - s.portalNet.sgst, f: `E${rowNum}-K${pRow}` },
      { t: 'n', v: v3b.nilRated - s.portalNet.nilRated, f: `F${rowNum}-L${pRow}` },
      { t: 'n', v: v3b.nonTaxable - s.portalNet.nonTaxable, f: `G${rowNum}-M${pRow}` }
    ]);
  });

  const sec4TotalRow: any[] = ['TOTAL'];
  const sec4Start = sec4Row + 3;
  const sec4End = sec4Row + 2 + monthlySummaries.length;
  for (let c = 1; c <= 18; c++) {
    const colName = C(c);
    let sumVal = 0;
    for (let i = 0; i < monthlySummaries.length; i++) {
      const cell = masterAoA[sec4Row + 2 + i]?.[c];
      sumVal += (typeof cell === 'number' ? cell : (cell?.v || 0));
    }
    sec4TotalRow.push({ t: 'n', v: sumVal, f: `SUM(${colName}${sec4Start}:${colName}${sec4End})` });
  }
  if (monthlySummaries.length > 0) masterAoA.push(sec4TotalRow);
  const sec4EndRow = masterAoA.length - 1;

  const wsMaster = XLSX.utils.aoa_to_sheet(masterAoA);

  // Style the Tables
  const masterRange = XLSX.utils.decode_range(wsMaster['!ref'] || "A1:Z30");
  for (let R = masterRange.s.r; R <= masterRange.e.r; R++) {
    for (let C_idx = masterRange.s.c; C_idx <= masterRange.e.c; C_idx++) {
      const cellRef = XLSX.utils.encode_cell({ c: C_idx, r: R });
      if (!masterAoA[R] || masterAoA[R].length === 0 || masterAoA[R][C_idx] === undefined && !wsMaster[cellRef]) continue;
      if (!wsMaster[cellRef]) wsMaster[cellRef] = { t: 's', v: '' };

      const isSec1 = R >= sec1Row && R <= sec1EndRow;
      const isSec2 = R >= sec2Row && R <= sec2EndRow;
      const isSec3 = R >= sec3Row && R <= sec3EndRow;
      const isSec4 = R >= sec4Row && R <= sec4EndRow;

      const isHeader1 = R === sec1Row || R === sec2Row || R === sec3Row || R === sec4Row;
      const isHeader2 = R === sec1Row + 1 || R === sec2Row + 1 || R === sec3Row + 1 || R === sec4Row + 1;
      const isTotal = (isSec1 && R === sec1EndRow) || (isSec2 && R === sec2EndRow) || (isSec3 && R === sec3EndRow) || (isSec4 && R === sec4EndRow);

      let fgColorHeader = '1E3A8A';
      if (isSec1) {
        if (C_idx >= 1 && C_idx <= 6) fgColorHeader = '1E3A8A'; // Navy Blue for Net Books
        else if (C_idx >= 7 && C_idx <= 12) fgColorHeader = '0F766E'; // Dark Teal for Net Portal
        else if (C_idx >= 13 && C_idx <= 18) fgColorHeader = '581C87'; // Deep Purple for Net Variance
        else fgColorHeader = '0F172A';
      } else if (isSec2) {
        fgColorHeader = '1E3A8A';
      } else if (isSec3) {
        fgColorHeader = '0F766E';
      } else if (isSec4) {
        fgColorHeader = '334155';
      }

      // Column boundary borders separating sections visually
      const isSecBoundary = C_idx === 6 || C_idx === 12 || C_idx === 18 || C_idx === 24 || C_idx === 30 || C_idx === 36;
      const rBorder = isSecBoundary ? { style: 'medium', color: { rgb: '334155' } } : { style: 'hair', color: { rgb: 'CBD5E1' } };

      if (isHeader1) {
        wsMaster[cellRef].s = {
          font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
          fill: { fgColor: { rgb: fgColorHeader } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: { top: { style: 'medium', color: { rgb: '0F172A' } }, bottom: { style: 'medium', color: { rgb: '0F172A' } }, left: { style: 'thin', color: { rgb: '334155' } }, right: { style: 'medium', color: { rgb: '0F172A' } } }
        };
      } else if (isHeader2) {
        wsMaster[cellRef].s = {
          font: { name: 'Segoe UI', bold: true, color: { rgb: '0F172A' }, sz: 10 },
          fill: { fgColor: { rgb: 'F1F5F9' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: { bottom: { style: 'medium', color: { rgb: '0F172A' } }, left: { style: 'hair', color: { rgb: 'CBD5E1' } }, right: rBorder }
        };
      } else if (isTotal) {
        let totalBg = '1E293B';
        let totalFontColor = 'FFFFFF';
        if (isSec1) { totalBg = '0F172A'; totalFontColor = 'F59E0B'; } // Gold font for Section 1 Total
        else if (isSec2) { totalBg = '1E3A8A'; }
        else if (isSec3) { totalBg = '0F766E'; }

        wsMaster[cellRef].s = {
          font: { name: 'Segoe UI', bold: true, color: { rgb: totalFontColor }, sz: 10 },
          fill: { fgColor: { rgb: totalBg } },
          alignment: { horizontal: C_idx > 0 ? 'right' : 'left' },
          border: { top: { style: 'medium', color: { rgb: '0F172A' } }, bottom: { style: 'double', color: { rgb: '0F172A' } }, right: rBorder },
          numFmt: C_idx > 0 ? '#,##0.00' : undefined
        };
      } else {
        // Section specific data row background tints
        let bgTint = 'FFFFFF';
        if (isSec1) {
          if (C_idx >= 1 && C_idx <= 6) bgTint = 'F8FAFC'; // Books cool blue tint
          else if (C_idx >= 7 && C_idx <= 12) bgTint = 'F0FDF4'; // Portal mint tint
          else if (C_idx >= 13 && C_idx <= 18) bgTint = 'FFFBEB'; // Variance amber tint
        }

        wsMaster[cellRef].s = {
          font: { name: 'Segoe UI', sz: 10, color: { rgb: isSec4 ? '0F172A' : '334155' }, bold: isSec4 || (isSec1 && C_idx >= 13 && wsMaster[cellRef].v !== 0) },
          fill: { fgColor: { rgb: bgTint } },
          alignment: { horizontal: C_idx > 0 ? 'right' : 'left' },
          border: { bottom: { style: 'hair', color: { rgb: 'CBD5E1' } }, right: rBorder },
          numFmt: C_idx > 0 ? '#,##0.00' : undefined
        };
      }
    }
  }
  wsMaster['!cols'] = [{ wch: 12 }];
  for (let i = 1; i <= 37; i++) wsMaster['!cols'].push({ wch: 15 });

  // Create Party Working Sheet
  const partyAoA: any[][] = [];
  const partySuperHeaders = [
    'PARTY IDENTIFICATION', '', '', '', '',
    'B2B SALES', '', '',
    'EXPORTS', '', '',
    'CREDIT NOTES', '', '',
    'NET TAXABLE SUMMARY', '', '',
    'B2C SALES', '', '',
    'NIL RATED', '', '',
    'NON TAXABLE', '', '',
    'IGST TAX', '', '',
    'CGST TAX', '', '',
    'SGST TAX', '', ''
  ];
  const partyHeaders = [
    'Month', 'Party Name (Books)', 'Party Name (R1)', 'GST No. (Books)', 'GST No. (R1)',
    'Books B2B Taxable', 'Portal B2B Taxable', 'B2B Taxable Var',
    'Books Export Taxable', 'Portal Export Taxable', 'Export Taxable Var',
    'Books CN Taxable', 'Portal CN Taxable', 'CN Taxable Var',
    'Net Books Taxable', 'Net Portal Taxable', 'Net Taxable Var',
    'Books B2C Taxable', 'Portal B2C Taxable', 'B2C Taxable Var',
    'Books Nil Rated', 'Portal Nil Rated', 'Nil Rated Var',
    'Books Non Taxable', 'Portal Non Taxable', 'Non Taxable Var',
    'Books IGST', 'Portal IGST', 'IGST Var',
    'Books CGST', 'Portal CGST', 'CGST Var',
    'Books SGST', 'Portal SGST', 'SGST Var'
  ];
  partyAoA.push(partySuperHeaders);
  partyAoA.push(partyHeaders);

  const partyMerges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },   // Party ID
    { s: { r: 0, c: 5 }, e: { r: 0, c: 7 } },   // B2B Sales
    { s: { r: 0, c: 8 }, e: { r: 0, c: 10 } },  // Exports
    { s: { r: 0, c: 11 }, e: { r: 0, c: 13 } }, // Credit Notes
    { s: { r: 0, c: 14 }, e: { r: 0, c: 16 } }, // Net Taxable
    { s: { r: 0, c: 17 }, e: { r: 0, c: 19 } }, // B2C Sales
    { s: { r: 0, c: 20 }, e: { r: 0, c: 22 } }, // Nil Rated
    { s: { r: 0, c: 23 }, e: { r: 0, c: 25 } }, // Non Taxable
    { s: { r: 0, c: 26 }, e: { r: 0, c: 28 } }, // IGST
    { s: { r: 0, c: 29 }, e: { r: 0, c: 31 } }, // CGST
    { s: { r: 0, c: 32 }, e: { r: 0, c: 34 } }  // SGST
  ];

  const partyRowsConfig: any[] = [];
  const months = Array.from(new Set(partySummaries.map(s => s.month)));
  const partyMonthRowMap: Record<string, number> = {};

  let grandB2bTax = 0, grandPB2bTax = 0;
  let grandExpTax = 0, grandPExpTax = 0;
  let grandCnTax = 0, grandPCnTax = 0;
  let grandNetTax = 0, grandPNetTax = 0;
  let grandB2cTax = 0, grandPB2cTax = 0;
  let grandNilTax = 0, grandPNilTax = 0;
  let grandNonTax = 0, grandPNonTax = 0;
  let grandIgst = 0, grandPIgst = 0;
  let grandCgst = 0, grandPCgst = 0;
  let grandSgst = 0, grandPSgst = 0;

  months.forEach(m => {
    const monthRows = partySummaries.filter(s => s.month === m);
    const monthStartRow = partyAoA.length;
    const firstChildIdx = monthStartRow + 2;
    const lastChildIdx = monthStartRow + 1 + monthRows.length;
    const monthStartRowIdx = monthStartRow + 1;
    partyMonthRowMap[m] = monthStartRowIdx;
    const mB2bTax = monthRows.reduce((s, r) => s + r.booksB2b.taxable, 0);
    const mPB2bTax = monthRows.reduce((s, r) => s + r.portalB2b.taxable, 0);
    const mExpTax = monthRows.reduce((s, r) => s + r.booksExport.taxable, 0);
    const mPExpTax = monthRows.reduce((s, r) => s + r.portalExport.taxable, 0);
    const mCnTax = monthRows.reduce((s, r) => s + r.booksCn.taxable, 0);
    const mPCnTax = monthRows.reduce((s, r) => s + r.portalCn.taxable, 0);
    const mNetTax = monthRows.reduce((s, r) => s + r.booksNet.taxable, 0);
    const mPNetTax = monthRows.reduce((s, r) => s + r.portalNet.taxable, 0);
    const mB2cTax = monthRows.reduce((s, r) => s + r.booksB2c.taxable, 0);
    const mPB2cTax = monthRows.reduce((s, r) => s + r.portalB2c.taxable, 0);
    const mNilTax = monthRows.reduce((s, r) => s + r.booksNil.nilRated, 0);
    const mPNilTax = monthRows.reduce((s, r) => s + r.portalNil.nilRated, 0);
    const mNonTax = monthRows.reduce((s, r) => s + r.booksNil.nonTaxable, 0);
    const mPNonTax = monthRows.reduce((s, r) => s + r.portalNil.nonTaxable, 0);
    const mIgstB2b = monthRows.reduce((s, r) => s + r.booksB2b.igst + r.booksExport.igst + r.booksB2c.igst - r.booksCn.igst, 0);
    const mPIgstB2b = monthRows.reduce((s, r) => s + r.portalB2b.igst + r.portalExport.igst + r.portalB2c.igst - r.portalCn.igst, 0);
    const mCgstB2b = monthRows.reduce((s, r) => s + r.booksB2b.cgst + r.booksB2c.cgst - r.booksCn.cgst, 0);
    const mPCgstB2b = monthRows.reduce((s, r) => s + r.portalB2b.cgst + r.portalB2c.cgst - r.portalCn.cgst, 0);
    const mSgstB2b = monthRows.reduce((s, r) => s + r.booksB2b.sgst + r.booksB2c.sgst - r.booksCn.sgst, 0);
    const mPSgstB2b = monthRows.reduce((s, r) => s + r.portalB2b.sgst + r.portalB2c.sgst - r.portalCn.sgst, 0);

    grandB2bTax += mB2bTax;
    grandPB2bTax += mPB2bTax;
    grandExpTax += mExpTax;
    grandPExpTax += mPExpTax;
    grandCnTax += mCnTax;
    grandPCnTax += mPCnTax;
    grandNetTax += mNetTax;
    grandPNetTax += mPNetTax;
    grandB2cTax += mB2cTax;
    grandPB2cTax += mPB2cTax;
    grandNilTax += mNilTax;
    grandPNilTax += mPNilTax;
    grandNonTax += mNonTax;
    grandPNonTax += mPNonTax;
    grandIgst += mIgstB2b;
    grandPIgst += mPIgstB2b;
    grandCgst += mCgstB2b;
    grandPCgst += mPCgstB2b;
    grandSgst += mSgstB2b;
    grandPSgst += mPSgstB2b;

    partyAoA.push([
      m, 'MONTH TOTAL', '', '', '',
      { t: 'n', v: mB2bTax, f: `SUM(F${firstChildIdx}:F${lastChildIdx})` },
      { t: 'n', v: mPB2bTax, f: `SUM(G${firstChildIdx}:G${lastChildIdx})` },
      { t: 'n', v: mB2bTax - mPB2bTax, f: `F${monthStartRowIdx}-G${monthStartRowIdx}` },

      { t: 'n', v: mExpTax, f: `SUM(I${firstChildIdx}:I${lastChildIdx})` },
      { t: 'n', v: mPExpTax, f: `SUM(J${firstChildIdx}:J${lastChildIdx})` },
      { t: 'n', v: mExpTax - mPExpTax, f: `I${monthStartRowIdx}-J${monthStartRowIdx}` },

      { t: 'n', v: mCnTax, f: `SUM(L${firstChildIdx}:L${lastChildIdx})` },
      { t: 'n', v: mPCnTax, f: `SUM(M${firstChildIdx}:M${lastChildIdx})` },
      { t: 'n', v: mCnTax - mPCnTax, f: `L${monthStartRowIdx}-M${monthStartRowIdx}` },

      { t: 'n', v: mNetTax, f: `F${monthStartRowIdx}+I${monthStartRowIdx}+R${monthStartRowIdx}-L${monthStartRowIdx}` },
      { t: 'n', v: mPNetTax, f: `G${monthStartRowIdx}+J${monthStartRowIdx}+S${monthStartRowIdx}-M${monthStartRowIdx}` },
      { t: 'n', v: mNetTax - mPNetTax, f: `O${monthStartRowIdx}-P${monthStartRowIdx}` },

      { t: 'n', v: mB2cTax, f: `SUM(R${firstChildIdx}:R${lastChildIdx})` },
      { t: 'n', v: mPB2cTax, f: `SUM(S${firstChildIdx}:S${lastChildIdx})` },
      { t: 'n', v: mB2cTax - mPB2cTax, f: `R${monthStartRowIdx}-S${monthStartRowIdx}` },

      { t: 'n', v: mNilTax, f: `SUM(U${firstChildIdx}:U${lastChildIdx})` },
      { t: 'n', v: mPNilTax, f: `SUM(V${firstChildIdx}:V${lastChildIdx})` },
      { t: 'n', v: mNilTax - mPNilTax, f: `U${monthStartRowIdx}-V${monthStartRowIdx}` },

      { t: 'n', v: mNonTax, f: `SUM(X${firstChildIdx}:X${lastChildIdx})` },
      { t: 'n', v: mPNonTax, f: `SUM(Y${firstChildIdx}:Y${lastChildIdx})` },
      { t: 'n', v: mNonTax - mPNonTax, f: `X${monthStartRowIdx}-Y${monthStartRowIdx}` },

      { t: 'n', v: mIgstB2b, f: `SUM(AA${firstChildIdx}:AA${lastChildIdx})` },
      { t: 'n', v: mPIgstB2b, f: `SUM(AB${firstChildIdx}:AB${lastChildIdx})` },
      { t: 'n', v: mIgstB2b - mPIgstB2b, f: `AA${monthStartRowIdx}-AB${monthStartRowIdx}` },

      { t: 'n', v: mCgstB2b, f: `SUM(AD${firstChildIdx}:AD${lastChildIdx})` },
      { t: 'n', v: mPCgstB2b, f: `SUM(AE${firstChildIdx}:AE${lastChildIdx})` },
      { t: 'n', v: mCgstB2b - mPCgstB2b, f: `AD${monthStartRowIdx}-AE${monthStartRowIdx}` },

      { t: 'n', v: mSgstB2b, f: `SUM(AG${firstChildIdx}:AG${lastChildIdx})` },
      { t: 'n', v: mPSgstB2b, f: `SUM(AH${firstChildIdx}:AH${lastChildIdx})` },
      { t: 'n', v: mSgstB2b - mPSgstB2b, f: `AG${monthStartRowIdx}-AH${monthStartRowIdx}` }
    ]);
    partyRowsConfig.push({ level: 0 });

    monthRows.forEach(s => {
      const rIdx = partyAoA.length + 1;
      const isReg = s.booksGstNo && s.booksGstNo !== 'URP' && s.booksGstNo !== 'UNREGISTERED' && s.booksGstNo.trim().length >= 10;
      const isPortalReg = s.portalGstNo && s.portalGstNo !== 'URP' && s.portalGstNo !== 'UNREGISTERED' && s.portalGstNo.trim().length >= 10;
      const isPseudo = s.booksPartyName === 'B2C Consumers & Nil Rated';

      const b2bBooksFormula = isPseudo ? undefined : (isReg ? `SUMIFS(B2B_Details!G:G, B2B_Details!D:D, D${rIdx}, B2B_Details!B:B, A${rIdx})` : `SUMIFS(B2B_Details!G:G, B2B_Details!F:F, B${rIdx}, B2B_Details!B:B, A${rIdx})`);
      const b2bPortalFormula = isPseudo ? undefined : (isPortalReg ? `SUMIFS(B2B_Details!H:H, B2B_Details!D:D, E${rIdx}, B2B_Details!B:B, A${rIdx})` : (isReg ? `SUMIFS(B2B_Details!H:H, B2B_Details!D:D, D${rIdx}, B2B_Details!B:B, A${rIdx})` : `SUMIFS(B2B_Details!H:H, B2B_Details!F:F, C${rIdx}, B2B_Details!B:B, A${rIdx})`));

      const expBooksFormula = isPseudo ? undefined : (isReg ? `SUMIFS(Export_Details!G:G, Export_Details!D:D, D${rIdx}, Export_Details!B:B, A${rIdx})` : `SUMIFS(Export_Details!G:G, Export_Details!F:F, B${rIdx}, Export_Details!B:B, A${rIdx})`);
      const expPortalFormula = isPseudo ? undefined : (isPortalReg ? `SUMIFS(Export_Details!H:H, Export_Details!D:D, E${rIdx}, Export_Details!B:B, A${rIdx})` : (isReg ? `SUMIFS(Export_Details!H:H, Export_Details!D:D, D${rIdx}, Export_Details!B:B, A${rIdx})` : `SUMIFS(Export_Details!H:H, Export_Details!F:F, C${rIdx}, Export_Details!B:B, A${rIdx})`));

      const cnBooksFormula = isPseudo ? undefined : (isReg ? `SUMIFS(CN_Details!G:G, CN_Details!D:D, D${rIdx}, CN_Details!B:B, A${rIdx})` : `SUMIFS(CN_Details!G:G, CN_Details!F:F, B${rIdx}, CN_Details!B:B, A${rIdx})`);
      const cnPortalFormula = isPseudo ? undefined : (isPortalReg ? `SUMIFS(CN_Details!H:H, CN_Details!D:D, E${rIdx}, CN_Details!B:B, A${rIdx})` : (isReg ? `SUMIFS(CN_Details!H:H, CN_Details!D:D, D${rIdx}, CN_Details!B:B, A${rIdx})` : `SUMIFS(CN_Details!H:H, CN_Details!F:F, C${rIdx}, CN_Details!B:B, A${rIdx})`));

      partyAoA.push([
        s.month, s.booksPartyName, s.portalPartyName, s.booksGstNo, s.portalGstNo,
        // B2B
        b2bBooksFormula ? { t: 'n', v: s.booksB2b.taxable, f: b2bBooksFormula } : { t: 'n', v: s.booksB2b.taxable },
        b2bPortalFormula ? { t: 'n', v: s.portalB2b.taxable, f: b2bPortalFormula } : { t: 'n', v: s.portalB2b.taxable },
        { t: 'n', v: s.booksB2b.taxable - s.portalB2b.taxable, f: `F${rIdx}-G${rIdx}` },
        // Export
        expBooksFormula ? { t: 'n', v: s.booksExport.taxable, f: expBooksFormula } : { t: 'n', v: s.booksExport.taxable },
        expPortalFormula ? { t: 'n', v: s.portalExport.taxable, f: expPortalFormula } : { t: 'n', v: s.portalExport.taxable },
        { t: 'n', v: s.booksExport.taxable - s.portalExport.taxable, f: `I${rIdx}-J${rIdx}` },
        // CN
        cnBooksFormula ? { t: 'n', v: s.booksCn.taxable, f: cnBooksFormula } : { t: 'n', v: s.booksCn.taxable },
        cnPortalFormula ? { t: 'n', v: s.portalCn.taxable, f: cnPortalFormula } : { t: 'n', v: s.portalCn.taxable },
        { t: 'n', v: s.booksCn.taxable - s.portalCn.taxable, f: `L${rIdx}-M${rIdx}` },
        // Net
        { t: 'n', v: s.booksNet.taxable, f: `F${rIdx}+I${rIdx}+R${rIdx}-L${rIdx}` },
        { t: 'n', v: s.portalNet.taxable, f: `G${rIdx}+J${rIdx}+S${rIdx}-M${rIdx}` },
        { t: 'n', v: s.variance.taxable, f: `O${rIdx}-P${rIdx}` },
        // B2C
        { t: 'n', v: s.booksB2c.taxable },
        { t: 'n', v: s.portalB2c.taxable },
        { t: 'n', v: s.booksB2c.taxable - s.portalB2c.taxable, f: `R${rIdx}-S${rIdx}` },
        // Nil
        { t: 'n', v: s.booksNil.nilRated },
        { t: 'n', v: s.portalNil.nilRated },
        { t: 'n', v: s.booksNil.nilRated - s.portalNil.nilRated, f: `U${rIdx}-V${rIdx}` },
        // Non Taxable
        { t: 'n', v: s.booksNil.nonTaxable },
        { t: 'n', v: s.portalNil.nonTaxable },
        { t: 'n', v: s.booksNil.nonTaxable - s.portalNil.nonTaxable, f: `X${rIdx}-Y${rIdx}` },
        // IGST
        { t: 'n', v: s.booksB2b.igst + s.booksExport.igst + s.booksB2c.igst - s.booksCn.igst },
        { t: 'n', v: s.portalB2b.igst + s.portalExport.igst + s.portalB2c.igst - s.portalCn.igst },
        { t: 'n', v: s.variance.igst, f: `AA${rIdx}-AB${rIdx}` },
        // CGST
        { t: 'n', v: s.booksB2b.cgst + s.booksB2c.cgst - s.booksCn.cgst },
        { t: 'n', v: s.portalB2b.cgst + s.portalB2c.cgst - s.portalCn.cgst },
        { t: 'n', v: s.variance.cgst, f: `AD${rIdx}-AE${rIdx}` },
        // SGST
        { t: 'n', v: s.booksB2b.sgst + s.booksB2c.sgst - s.booksCn.sgst },
        { t: 'n', v: s.portalB2b.sgst + s.portalB2c.sgst - s.portalCn.sgst },
        { t: 'n', v: s.variance.sgst, f: `AG${rIdx}-AH${rIdx}` }
      ]);
      partyRowsConfig.push({ level: 1, hidden: true });
    });
  });

  const grandPartyTotals = {
    b2bBooksTaxable: grandB2bTax,
    b2bPortalTaxable: grandPB2bTax,
    expBooksTaxable: grandExpTax,
    expPortalTaxable: grandPExpTax,
    cnBooksTaxable: grandCnTax,
    cnPortalTaxable: grandPCnTax,
    b2cBooksTaxable: grandB2cTax,
    b2cPortalTaxable: grandPB2cTax,
    nilBooksTaxable: grandNilTax,
    nilPortalTaxable: grandPNilTax,
    nonTaxBooks: grandNonTax,
    nonTaxPortal: grandPNonTax,
    netBooksTaxable: grandNetTax,
    netPortalTaxable: grandPNetTax,
    netTaxableVar: grandNetTax - grandPNetTax,
    igstBooks: grandIgst,
    igstPortal: grandPIgst,
    igstVar: grandIgst - grandPIgst,
    cgstBooks: grandCgst,
    cgstPortal: grandPCgst,
    cgstVar: grandCgst - grandPCgst,
    sgstBooks: grandSgst,
    sgstPortal: grandPSgst,
    sgstVar: grandSgst - grandPSgst
  };

  const grandTotalRowIdx = partyAoA.length + 1;
  partyAoA.push([
    'GRAND TOTAL', '', '', '', '',
    { t: 'n', v: grandB2bTax, f: `SUMIFS(F3:F${grandTotalRowIdx - 1}, B3:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', v: grandPB2bTax, f: `SUMIFS(G3:G${grandTotalRowIdx - 1}, B3:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', v: grandB2bTax - grandPB2bTax, f: `F${grandTotalRowIdx}-G${grandTotalRowIdx}` },

    { t: 'n', v: grandExpTax, f: `SUMIFS(I3:I${grandTotalRowIdx - 1}, B3:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', v: grandPExpTax, f: `SUMIFS(J3:J${grandTotalRowIdx - 1}, B3:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', v: grandExpTax - grandPExpTax, f: `I${grandTotalRowIdx}-J${grandTotalRowIdx}` },

    { t: 'n', v: grandCnTax, f: `SUMIFS(L3:L${grandTotalRowIdx - 1}, B3:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', v: grandPCnTax, f: `SUMIFS(M3:M${grandTotalRowIdx - 1}, B3:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', v: grandCnTax - grandPCnTax, f: `L${grandTotalRowIdx}-M${grandTotalRowIdx}` },

    { t: 'n', v: grandNetTax, f: `F${grandTotalRowIdx}+I${grandTotalRowIdx}+R${grandTotalRowIdx}-L${grandTotalRowIdx}` },
    { t: 'n', v: grandPNetTax, f: `G${grandTotalRowIdx}+J${grandTotalRowIdx}+S${grandTotalRowIdx}-M${grandTotalRowIdx}` },
    { t: 'n', v: grandNetTax - grandPNetTax, f: `O${grandTotalRowIdx}-P${grandTotalRowIdx}` },

    { t: 'n', v: grandB2cTax, f: `SUMIFS(R3:R${grandTotalRowIdx - 1}, B3:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', v: grandPB2cTax, f: `SUMIFS(S3:S${grandTotalRowIdx - 1}, B3:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', v: grandB2cTax - grandPB2cTax, f: `R${grandTotalRowIdx}-S${grandTotalRowIdx}` },

    { t: 'n', v: grandNilTax, f: `SUMIFS(U3:U${grandTotalRowIdx - 1}, B3:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', v: grandPNilTax, f: `SUMIFS(V3:V${grandTotalRowIdx - 1}, B3:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', v: grandNilTax - grandPNilTax, f: `U${grandTotalRowIdx}-V${grandTotalRowIdx}` },

    { t: 'n', v: grandNonTax, f: `SUMIFS(X3:X${grandTotalRowIdx - 1}, B3:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', v: grandPNonTax, f: `SUMIFS(Y3:Y${grandTotalRowIdx - 1}, B3:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', v: grandNonTax - grandPNonTax, f: `X${grandTotalRowIdx}-Y${grandTotalRowIdx}` },

    { t: 'n', v: grandIgst, f: `SUMIFS(AA3:AA${grandTotalRowIdx - 1}, B3:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', v: grandPIgst, f: `SUMIFS(AB3:AB${grandTotalRowIdx - 1}, B3:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', v: grandIgst - grandPIgst, f: `AA${grandTotalRowIdx}-AB${grandTotalRowIdx}` },

    { t: 'n', v: grandCgst, f: `SUMIFS(AD3:AD${grandTotalRowIdx - 1}, B3:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', v: grandPCgst, f: `SUMIFS(AE3:AE${grandTotalRowIdx - 1}, B3:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', v: grandCgst - grandPCgst, f: `AD${grandTotalRowIdx}-AE${grandTotalRowIdx}` },

    { t: 'n', v: grandSgst, f: `SUMIFS(AG3:AG${grandTotalRowIdx - 1}, B3:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', v: grandPSgst, f: `SUMIFS(AH3:AH${grandTotalRowIdx - 1}, B3:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', v: grandSgst - grandPSgst, f: `AG${grandTotalRowIdx}-AH${grandTotalRowIdx}` }
  ]);
  partyRowsConfig.push({ level: 0, hpt: 30 });

  const wsParty = XLSX.utils.aoa_to_sheet(partyAoA);
  wsParty['!rows'] = [{ hpt: 24 }, { hpt: 20 }, ...partyRowsConfig];
  wsParty['!outline'] = { above: true, summaryBelow: false };

  // Style Party Working Sheet
  const partyRange = XLSX.utils.decode_range(wsParty['!ref'] || "A1:AI1");
  for (let R = partyRange.s.r; R <= partyRange.e.r; R++) {
    for (let C_idx = partyRange.s.c; C_idx <= partyRange.e.c; C_idx++) {
      const cellRef = XLSX.utils.encode_cell({ c: C_idx, r: R });
      if (!wsParty[cellRef]) wsParty[cellRef] = { t: 's', v: '' };

      const isSuperHeader = R === 0;
      const isSubHeader = R === 1;
      const isMonthTotal = partyAoA[R] && partyAoA[R][1] === 'MONTH TOTAL';
      const isGrandTotal = partyAoA[R] && partyAoA[R][0] === 'GRAND TOTAL';

      let bgSuperHeader = '334155';
      if (C_idx >= 5 && C_idx <= 13) bgSuperHeader = '1E3A8A'; // Navy for Books (B2B, Exp, CN)
      else if (C_idx >= 14 && C_idx <= 16) bgSuperHeader = '0F172A'; // Midnight Navy for Net Taxable Summary
      else if (C_idx >= 17 && C_idx <= 25) bgSuperHeader = '0F766E'; // Dark Teal for Portal (B2C, Nil, Non-Tax)
      else if (C_idx >= 26 && C_idx <= 34) bgSuperHeader = '581C87'; // Deep Purple for Taxes

      const isSecBoundary = C_idx === 4 || C_idx === 7 || C_idx === 10 || C_idx === 13 || C_idx === 16 || C_idx === 19 || C_idx === 22 || C_idx === 25 || C_idx === 28 || C_idx === 31 || C_idx === 34;
      const rBorder = isSecBoundary ? { style: 'medium', color: { rgb: '334155' } } : { style: 'hair', color: { rgb: 'CBD5E1' } };

      if (isSuperHeader) {
        wsParty[cellRef].s = {
          font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
          fill: { fgColor: { rgb: bgSuperHeader } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: { top: { style: 'medium', color: { rgb: '0F172A' } }, bottom: { style: 'medium', color: { rgb: '0F172A' } }, left: { style: 'thin', color: { rgb: '334155' } }, right: { style: 'medium', color: { rgb: '0F172A' } } }
        };
      } else if (isSubHeader) {
        let subHeaderBg = 'F1F5F9';
        let subFontColor = '0F172A';
        if (C_idx === 7 || C_idx === 10 || C_idx === 13 || C_idx === 16 || C_idx === 19 || C_idx === 22 || C_idx === 25 || C_idx === 28 || C_idx === 31 || C_idx === 34) {
          subHeaderBg = 'E2E8F0'; // Variance sub-header column highlight
          subFontColor = '581C87';
        }
        wsParty[cellRef].s = {
          font: { name: 'Segoe UI', bold: true, color: { rgb: subFontColor }, sz: 10 },
          fill: { fgColor: { rgb: subHeaderBg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: { bottom: { style: 'medium', color: { rgb: '0F172A' } }, left: { style: 'hair', color: { rgb: 'CBD5E1' } }, right: rBorder }
        };
      } else if (isMonthTotal || isGrandTotal) {
        wsParty[cellRef].s = {
          font: { name: 'Segoe UI', bold: true, sz: isGrandTotal ? 11 : 10, color: { rgb: isGrandTotal ? 'F59E0B' : '0F172A' } },
          fill: { fgColor: { rgb: isGrandTotal ? '0F172A' : 'E2E8F0' } },
          alignment: { horizontal: typeof wsParty[cellRef].v === 'number' || wsParty[cellRef].f ? 'right' : 'left' },
          border: { top: { style: 'thin', color: { rgb: '94A3B8' } }, bottom: { style: isGrandTotal ? 'double' : 'thin', color: { rgb: '0F172A' } }, right: rBorder },
          numFmt: '#,##0.00'
        };
      } else {
        const isVarCol = C_idx === 7 || C_idx === 10 || C_idx === 13 || C_idx === 16 || C_idx === 19 || C_idx === 22 || C_idx === 25 || C_idx === 28 || C_idx === 31 || C_idx === 34;
        const cellVal = typeof wsParty[cellRef].v === 'number' ? wsParty[cellRef].v : 0;
        const hasVar = isVarCol && Math.abs(cellVal) > 0.01;

        wsParty[cellRef].s = {
          font: { name: 'Segoe UI', sz: 10, color: { rgb: hasVar ? 'B91C1C' : '334155' }, bold: hasVar || wsParty[cellRef].v === 'B2C Consumers & Nil Rated' },
          fill: { fgColor: { rgb: hasVar ? 'FEF2F2' : (isVarCol ? 'FFFBEB' : 'FFFFFF') } },
          alignment: { horizontal: typeof wsParty[cellRef].v === 'number' || wsParty[cellRef].f ? 'right' : 'left' },
          border: { bottom: { style: 'hair', color: { rgb: 'E2E8F0' } }, right: rBorder },
          numFmt: typeof wsParty[cellRef].v === 'number' || wsParty[cellRef].f ? '#,##0.00' : undefined
        };
      }
    }
  }
  wsParty['!cols'] = [{ wch: 10 }, { wch: 25 }, { wch: 25 }, { wch: 18 }, { wch: 18 }];
  for (let i = 5; i <= 34; i++) wsParty['!cols'].push({ wch: 16 });

  wsParty['!cols'] = [
    { wch: 10 }, { wch: 35 }, { wch: 35 }, { wch: 18 }, { wch: 18 },
    { wch: 15 }, { wch: 15 }, { wch: 15 }, // B2B
    { wch: 15 }, { wch: 15 }, { wch: 15 }, // Export
    { wch: 15 }, { wch: 15 }, { wch: 15 }, // CN
    { wch: 15 }, { wch: 15 }, { wch: 15 }, // Net
    { wch: 15 }, { wch: 15 }, { wch: 15 }, // B2C
    { wch: 15 }, { wch: 15 }, { wch: 15 }, // Nil
    { wch: 15 }, { wch: 15 }, { wch: 15 }, // Non Taxable
    { wch: 15 }, { wch: 15 }, { wch: 15 }, // IGST
    { wch: 15 }, { wch: 15 }, { wch: 15 }, // CGST
    { wch: 15 }, { wch: 15 }, { wch: 15 }  // SGST
  ];

  // ==========================================
  // ANNUAL CONSOLIDATED PARTY SUMMARY SHEET
  // ==========================================
  const buildAnnualPartySummarySheet = () => {
    const summaryAoA: any[][] = [];
    const superHeaders = [
      'CUSTOMER IDENTIFICATION', '', '',
      'B2B INVOICES', '', '',
      'EXPORTS', '', '',
      'CREDIT NOTES (RETURNS)', '', '',
      'B2C SMALL SUPPLIES', '', '',
      'NET TAXABLE TURNOVER', '', '',
      'NIL & EXEMPT TURNOVER', '', '',
      'TOTAL OUTWARD TURNOVER', '', '',
      'IGST LIABILITY', '', '',
      'CGST LIABILITY', '', '',
      'SGST LIABILITY', '', '',
      'AUDIT STATUS'
    ];
    const colHeaders = [
      'Customer / Party Name', 'GSTIN', 'State / POS',
      'Books B2B Taxable', 'Portal B2B Taxable', 'B2B Taxable Var',
      'Books Export Taxable', 'Portal Export Taxable', 'Export Taxable Var',
      'Books CN Taxable', 'Portal CN Taxable', 'CN Taxable Var',
      'Books B2C Taxable', 'Portal B2C Taxable', 'B2C Taxable Var',
      'Books Net Taxable', 'Portal Net Taxable', 'Net Taxable Var',
      'Books Nil/Exempt', 'Portal Nil/Exempt', 'Nil/Exempt Var',
      'Books Total Outward', 'Portal Total Outward', 'Total Outward Var',
      'Books IGST', 'Portal IGST', 'IGST Var',
      'Books CGST', 'Portal CGST', 'CGST Var',
      'Books SGST', 'Portal SGST', 'SGST Var',
      'Reconciliation Status'
    ];
    summaryAoA.push(superHeaders);
    summaryAoA.push(colHeaders);

    interface AnnualCust {
      name: string;
      gstin: string;
      pos: string;
      bB2b: number; pB2b: number;
      bExp: number; pExp: number;
      bCn: number; pCn: number;
      bB2c: number; pB2c: number;
      bNil: number; pNil: number;
      bIgst: number; pIgst: number;
      bCgst: number; pCgst: number;
      bSgst: number; pSgst: number;
    }

    const partyMap = new Map<string, AnnualCust>();
    const getPartyKey = (name: string, gst: string): string => {
      const g = (gst || '').trim().toUpperCase();
      if (g && g.length >= 10 && g !== 'URP' && g !== 'UNREGISTERED') return 'GST_' + g;
      const n = (name || '').trim().toUpperCase();
      if (n) return 'NAME_' + n;
      return 'UNREGISTERED';
    };

    const getOrCreate = (name: string, gst: string, pos?: string): AnnualCust => {
      const key = getPartyKey(name, gst);
      if (!partyMap.has(key)) {
        const isReg = gst && gst.trim().length >= 10 && gst !== 'URP' && gst !== 'UNREGISTERED';
        partyMap.set(key, {
          name: name || (isReg ? gst : 'Unregistered Party'),
          gstin: isReg ? gst.trim().toUpperCase() : 'UNREGISTERED',
          pos: pos || (isReg ? gst.substring(0, 2) : ''),
          bB2b: 0, pB2b: 0,
          bExp: 0, pExp: 0,
          bCn: 0, pCn: 0,
          bB2c: 0, pB2c: 0,
          bNil: 0, pNil: 0,
          bIgst: 0, pIgst: 0,
          bCgst: 0, pCgst: 0,
          bSgst: 0, pSgst: 0
        });
      }
      const c = partyMap.get(key)!;
      if (!c.name && name) c.name = name;
      if (c.gstin === 'UNREGISTERED' && gst && gst.trim().length >= 10) c.gstin = gst.trim().toUpperCase();
      if (!c.pos && pos) c.pos = pos;
      return c;
    };

    allB2bBooks.forEach(r => {
      const c = getOrCreate(r.party, r.gstNo, r.pos);
      c.bB2b += (r.taxable || 0);
      c.bIgst += (r.igst || 0);
      c.bCgst += (r.cgst || 0);
      c.bSgst += (r.sgst || 0);
    });
    allPortalB2B.forEach(r => {
      const c = getOrCreate(r.party, r.gstNo, r.pos);
      c.pB2b += (r.taxable || 0);
      c.pIgst += (r.igst || 0);
      c.pCgst += (r.cgst || 0);
      c.pSgst += (r.sgst || 0);
    });
    expBooks.forEach(r => {
      const c = getOrCreate(r.party, r.gstNo, r.pos);
      c.bExp += (r.taxable || 0);
      c.bIgst += (r.igst || 0);
    });
    cleanPortalExport.forEach(r => {
      const c = getOrCreate(r.party, r.gstNo, r.pos);
      c.pExp += (r.taxable || 0);
      c.pIgst += (r.igst || 0);
    });
    cleanBooksCreditNotes.forEach(r => {
      const c = getOrCreate(r.party, r.gstNo, r.pos);
      c.bCn += (r.taxable || 0);
      c.bIgst += (r.igst || 0);
      c.bCgst += (r.cgst || 0);
      c.bSgst += (r.sgst || 0);
    });
    cleanPortalCN.forEach(r => {
      const c = getOrCreate(r.party, r.gstNo, r.pos);
      c.pCn += (r.taxable || 0);
      c.pIgst += (r.igst || 0);
      c.pCgst += (r.cgst || 0);
      c.pSgst += (r.sgst || 0);
    });
    b2cBooks.forEach(r => {
      if (r.party && r.party.trim().length > 0) {
        const c = getOrCreate(r.party, r.gstNo, r.pos);
        c.bB2c += (r.taxable || 0);
        c.bIgst += (r.igst || 0);
        c.bCgst += (r.cgst || 0);
        c.bSgst += (r.sgst || 0);
      }
    });
    nilBooks.forEach(r => {
      if (r.party && r.party.trim().length > 0) {
        const c = getOrCreate(r.party, r.gstNo, r.pos);
        c.bNil += (r.nilRated || 0) + (r.nonTaxable || 0);
      }
    });

    const mB2bBooks = monthlySummaries.reduce((s, m) => s + (m.booksB2b?.taxable || 0), 0);
    const mExpBooks = monthlySummaries.reduce((s, m) => s + (m.booksExport?.taxable || 0), 0);
    const mCnBooks = monthlySummaries.reduce((s, m) => s + (m.booksCn?.taxable || 0), 0);
    const mB2cBooks = monthlySummaries.reduce((s, m) => s + (m.booksB2c?.taxable || 0), 0);
    const mNilBooks = monthlySummaries.reduce((s, m) => s + (m.booksNil?.nilRated || 0) + (m.booksNil?.nonTaxable || 0), 0);
    const mIgstBooks = monthlySummaries.reduce((s, m) => s + (m.booksSales.igst - m.booksCn.igst), 0);
    const mCgstBooks = monthlySummaries.reduce((s, m) => s + (m.booksSales.cgst - m.booksCn.cgst), 0);
    const mSgstBooks = monthlySummaries.reduce((s, m) => s + (m.booksSales.sgst - m.booksCn.sgst), 0);

    const mB2bPortal = monthlySummaries.reduce((s, m) => s + (m.portalB2b?.taxable || 0), 0);
    const mExpPortal = monthlySummaries.reduce((s, m) => s + (m.portalExport?.taxable || 0), 0);
    const mCnPortal = monthlySummaries.reduce((s, m) => s + (m.portalCn?.taxable || 0), 0);
    const mB2cPortal = monthlySummaries.reduce((s, m) => s + (m.portalB2c?.taxable || 0), 0);
    const mNilPortal = monthlySummaries.reduce((s, m) => s + (m.portalNil?.nilRated || 0) + (m.portalNil?.nonTaxable || 0), 0);
    const mIgstPortal = monthlySummaries.reduce((s, m) => s + (m.portalNet.igst || 0), 0);
    const mCgstPortal = monthlySummaries.reduce((s, m) => s + (m.portalNet.cgst || 0), 0);
    const mSgstPortal = monthlySummaries.reduce((s, m) => s + (m.portalNet.sgst || 0), 0);

    let sumPartyB2bBooks = 0, sumPartyB2bPortal = 0;
    let sumPartyExpBooks = 0, sumPartyExpPortal = 0;
    let sumPartyCnBooks = 0, sumPartyCnPortal = 0;
    let sumPartyB2cBooks = 0, sumPartyB2cPortal = 0;
    let sumPartyNilBooks = 0, sumPartyNilPortal = 0;
    let sumPartyIgstBooks = 0, sumPartyIgstPortal = 0;
    let sumPartyCgstBooks = 0, sumPartyCgstPortal = 0;
    let sumPartySgstBooks = 0, sumPartySgstPortal = 0;

    for (const c of partyMap.values()) {
      sumPartyB2bBooks += c.bB2b; sumPartyB2bPortal += c.pB2b;
      sumPartyExpBooks += c.bExp; sumPartyExpPortal += c.pExp;
      sumPartyCnBooks += c.bCn; sumPartyCnPortal += c.pCn;
      sumPartyB2cBooks += c.bB2c; sumPartyB2cPortal += c.pB2c;
      sumPartyNilBooks += c.bNil; sumPartyNilPortal += c.pNil;
      sumPartyIgstBooks += c.bIgst; sumPartyIgstPortal += c.pIgst;
      sumPartyCgstBooks += c.bCgst; sumPartyCgstPortal += c.pCgst;
      sumPartySgstBooks += c.bSgst; sumPartySgstPortal += c.pSgst;
    }

    const remB2bBooks = mB2bBooks - sumPartyB2bBooks;
    const remB2bPortal = mB2bPortal - sumPartyB2bPortal;
    const remExpBooks = mExpBooks - sumPartyExpBooks;
    const remExpPortal = mExpPortal - sumPartyExpPortal;
    const remCnBooks = mCnBooks - sumPartyCnBooks;
    const remCnPortal = mCnPortal - sumPartyCnPortal;
    const remB2cBooks = mB2cBooks - sumPartyB2cBooks;
    const remB2cPortal = mB2cPortal - sumPartyB2cPortal;
    const remNilBooks = mNilBooks - sumPartyNilBooks;
    const remNilPortal = mNilPortal - sumPartyNilPortal;

    const balancingRow: AnnualCust = {
      name: 'Unregistered Retail Consumers & Table 8 Balances (B2C & Nil-Rated)',
      gstin: 'UNREGISTERED',
      pos: 'Retail & Exempt',
      bB2b: remB2bBooks, pB2b: remB2bPortal,
      bExp: remExpBooks, pExp: remExpPortal,
      bCn: remCnBooks, pCn: remCnPortal,
      bB2c: remB2cBooks, pB2c: remB2cPortal,
      bNil: remNilBooks, pNil: remNilPortal,
      bIgst: mIgstBooks - sumPartyIgstBooks, pIgst: mIgstPortal - sumPartyIgstPortal,
      bCgst: mCgstBooks - sumPartyCgstBooks, pCgst: mCgstPortal - sumPartyCgstPortal,
      bSgst: mSgstBooks - sumPartySgstBooks, pSgst: mSgstPortal - sumPartySgstPortal
    };

    const custList = Array.from(partyMap.values()).filter(c => 
      Math.abs(c.bB2b) > 0.001 || Math.abs(c.pB2b) > 0.001 ||
      Math.abs(c.bExp) > 0.001 || Math.abs(c.pExp) > 0.001 ||
      Math.abs(c.bCn) > 0.001 || Math.abs(c.pCn) > 0.001 ||
      Math.abs(c.bB2c) > 0.001 || Math.abs(c.pB2c) > 0.001 ||
      Math.abs(c.bNil) > 0.001 || Math.abs(c.pNil) > 0.001
    );

    // Sort by Books Total Outward descending
    custList.sort((a, b) => {
      const aTot = a.bB2b + a.bExp + a.bB2c + a.bNil - a.bCn;
      const bTot = b.bB2b + b.bExp + b.bB2c + b.bNil - b.bCn;
      return bTot - aTot;
    });

    const hasBalancing = 
      Math.abs(balancingRow.bB2b) > 0.001 || Math.abs(balancingRow.pB2b) > 0.001 ||
      Math.abs(balancingRow.bExp) > 0.001 || Math.abs(balancingRow.pExp) > 0.001 ||
      Math.abs(balancingRow.bCn) > 0.001 || Math.abs(balancingRow.pCn) > 0.001 ||
      Math.abs(balancingRow.bB2c) > 0.001 || Math.abs(balancingRow.pB2c) > 0.001 ||
      Math.abs(balancingRow.bNil) > 0.001 || Math.abs(balancingRow.pNil) > 0.001;

    if (hasBalancing) {
      custList.push(balancingRow);
    }

    custList.forEach(c => {
      const r = summaryAoA.length + 1;
      summaryAoA.push([
        c.name, c.gstin, c.pos,
        // B2B
        { t: 'n', v: c.bB2b },
        { t: 'n', v: c.pB2b },
        { t: 'n', v: c.bB2b - c.pB2b, f: `D${r}-E${r}` },
        // Export
        { t: 'n', v: c.bExp },
        { t: 'n', v: c.pExp },
        { t: 'n', v: c.bExp - c.pExp, f: `G${r}-H${r}` },
        // CN
        { t: 'n', v: c.bCn },
        { t: 'n', v: c.pCn },
        { t: 'n', v: c.bCn - c.pCn, f: `J${r}-K${r}` },
        // B2C
        { t: 'n', v: c.bB2c },
        { t: 'n', v: c.pB2c },
        { t: 'n', v: c.bB2c - c.pB2c, f: `M${r}-N${r}` },
        // Net Taxable
        { t: 'n', v: c.bB2b + c.bExp + c.bB2c - c.bCn, f: `D${r}+G${r}+M${r}-J${r}` },
        { t: 'n', v: c.pB2b + c.pExp + c.pB2c - c.pCn, f: `E${r}+H${r}+N${r}-K${r}` },
        { t: 'n', v: (c.bB2b + c.bExp + c.bB2c - c.bCn) - (c.pB2b + c.pExp + c.pB2c - c.pCn), f: `P${r}-Q${r}` },
        // Nil / Exempt
        { t: 'n', v: c.bNil },
        { t: 'n', v: c.pNil },
        { t: 'n', v: c.bNil - c.pNil, f: `S${r}-T${r}` },
        // Total Outward
        { t: 'n', v: (c.bB2b + c.bExp + c.bB2c - c.bCn) + c.bNil, f: `P${r}+S${r}` },
        { t: 'n', v: (c.pB2b + c.pExp + c.pB2c - c.pCn) + c.pNil, f: `Q${r}+T${r}` },
        { t: 'n', v: ((c.bB2b + c.bExp + c.bB2c - c.bCn) + c.bNil) - ((c.pB2b + c.pExp + c.pB2c - c.pCn) + c.pNil), f: `V${r}-W${r}` },
        // IGST
        { t: 'n', v: c.bIgst },
        { t: 'n', v: c.pIgst },
        { t: 'n', v: c.bIgst - c.pIgst, f: `Y${r}-Z${r}` },
        // CGST
        { t: 'n', v: c.bCgst },
        { t: 'n', v: c.pCgst },
        { t: 'n', v: c.bCgst - c.pCgst, f: `AB${r}-AC${r}` },
        // SGST
        { t: 'n', v: c.bSgst },
        { t: 'n', v: c.pSgst },
        { t: 'n', v: c.bSgst - c.pSgst, f: `AE${r}-AF${r}` },
        // Status
        { t: 's', v: '✓ Matched', f: `IF(AND(ABS(X${r})<1,ABS(AA${r})<1,ABS(AD${r})<1,ABS(AG${r})<1),"✓ Matched","⚠️ Mismatch")` }
      ]);
    });

    const gt = summaryAoA.length + 1;
    const hasData = custList.length > 0;

    summaryAoA.push([
      'GRAND TOTAL', '', '',
      // B2B
      hasData ? { t: 'n', v: mB2bBooks, f: `SUM(D3:D${gt - 1})` } : { t: 'n', v: mB2bBooks },
      hasData ? { t: 'n', v: mB2bPortal, f: `SUM(E3:E${gt - 1})` } : { t: 'n', v: mB2bPortal },
      { t: 'n', v: mB2bBooks - mB2bPortal, f: `D${gt}-E${gt}` },
      // Export
      hasData ? { t: 'n', v: mExpBooks, f: `SUM(G3:G${gt - 1})` } : { t: 'n', v: mExpBooks },
      hasData ? { t: 'n', v: mExpPortal, f: `SUM(H3:H${gt - 1})` } : { t: 'n', v: mExpPortal },
      { t: 'n', v: mExpBooks - mExpPortal, f: `G${gt}-H${gt}` },
      // CN
      hasData ? { t: 'n', v: mCnBooks, f: `SUM(J3:J${gt - 1})` } : { t: 'n', v: mCnBooks },
      hasData ? { t: 'n', v: mCnPortal, f: `SUM(K3:K${gt - 1})` } : { t: 'n', v: mCnPortal },
      { t: 'n', v: mCnBooks - mCnPortal, f: `J${gt}-K${gt}` },
      // B2C
      hasData ? { t: 'n', v: mB2cBooks, f: `SUM(M3:M${gt - 1})` } : { t: 'n', v: mB2cBooks },
      hasData ? { t: 'n', v: mB2cPortal, f: `SUM(N3:N${gt - 1})` } : { t: 'n', v: mB2cPortal },
      { t: 'n', v: mB2cBooks - mB2cPortal, f: `M${gt}-N${gt}` },
      // Net Taxable
      { t: 'n', v: mB2bBooks + mExpBooks + mB2cBooks - mCnBooks, f: `D${gt}+G${gt}+M${gt}-J${gt}` },
      { t: 'n', v: mB2bPortal + mExpPortal + mB2cPortal - mCnPortal, f: `E${gt}+H${gt}+N${gt}-K${gt}` },
      { t: 'n', v: (mB2bBooks + mExpBooks + mB2cBooks - mCnBooks) - (mB2bPortal + mExpPortal + mB2cPortal - mCnPortal), f: `P${gt}-Q${gt}` },
      // Nil / Exempt
      hasData ? { t: 'n', v: mNilBooks, f: `SUM(S3:S${gt - 1})` } : { t: 'n', v: mNilBooks },
      hasData ? { t: 'n', v: mNilPortal, f: `SUM(T3:T${gt - 1})` } : { t: 'n', v: mNilPortal },
      { t: 'n', v: mNilBooks - mNilPortal, f: `S${gt}-T${gt}` },
      // Total Outward
      { t: 'n', v: (mB2bBooks + mExpBooks + mB2cBooks - mCnBooks) + mNilBooks, f: `P${gt}+S${gt}` },
      { t: 'n', v: (mB2bPortal + mExpPortal + mB2cPortal - mCnPortal) + mNilPortal, f: `Q${gt}+T${gt}` },
      { t: 'n', v: ((mB2bBooks + mExpBooks + mB2cBooks - mCnBooks) + mNilBooks) - ((mB2bPortal + mExpPortal + mB2cPortal - mCnPortal) + mNilPortal), f: `V${gt}-W${gt}` },
      // IGST
      hasData ? { t: 'n', v: mIgstBooks, f: `SUM(Y3:Y${gt - 1})` } : { t: 'n', v: mIgstBooks },
      hasData ? { t: 'n', v: mIgstPortal, f: `SUM(Z3:Z${gt - 1})` } : { t: 'n', v: mIgstPortal },
      { t: 'n', v: mIgstBooks - mIgstPortal, f: `Y${gt}-Z${gt}` },
      // CGST
      hasData ? { t: 'n', v: mCgstBooks, f: `SUM(AB3:AB${gt - 1})` } : { t: 'n', v: mCgstBooks },
      hasData ? { t: 'n', v: mCgstPortal, f: `SUM(AC3:AC${gt - 1})` } : { t: 'n', v: mCgstPortal },
      { t: 'n', v: mCgstBooks - mCgstPortal, f: `AB${gt}-AC${gt}` },
      // SGST
      hasData ? { t: 'n', v: mSgstBooks, f: `SUM(AE3:AE${gt - 1})` } : { t: 'n', v: mSgstBooks },
      hasData ? { t: 'n', v: mSgstPortal, f: `SUM(AF3:AF${gt - 1})` } : { t: 'n', v: mSgstPortal },
      { t: 'n', v: mSgstBooks - mSgstPortal, f: `AE${gt}-AF${gt}` },
      // Status
      { t: 's', v: '✓ 100% TIED OUT (₹0.00)', f: `IF(AND(ABS(X${gt})<0.01,ABS(AA${gt})<0.01,ABS(AD${gt})<0.01,ABS(AG${gt})<0.01),"✓ 100% TIED OUT (₹0.00)","❌ MISMATCH")` }
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoA);
    wsSummary['!rows'] = [{ hpt: 24 }, { hpt: 20 }];
    wsSummary['!cols'] = [
      { wch: 35 }, { wch: 18 }, { wch: 16 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, // B2B
      { wch: 15 }, { wch: 15 }, { wch: 15 }, // Export
      { wch: 15 }, { wch: 15 }, { wch: 15 }, // CN
      { wch: 15 }, { wch: 15 }, { wch: 15 }, // B2C
      { wch: 16 }, { wch: 16 }, { wch: 16 }, // Net Taxable
      { wch: 16 }, { wch: 16 }, { wch: 16 }, // Nil
      { wch: 18 }, { wch: 18 }, { wch: 18 }, // Total Outward
      { wch: 15 }, { wch: 15 }, { wch: 15 }, // IGST
      { wch: 15 }, { wch: 15 }, { wch: 15 }, // CGST
      { wch: 15 }, { wch: 15 }, { wch: 15 }, // SGST
      { wch: 22 }
    ];

    // Style the sheet
    const range = XLSX.utils.decode_range(wsSummary['!ref'] || 'A1:AH1');
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C_idx = range.s.c; C_idx <= range.e.c; C_idx++) {
        const cellRef = XLSX.utils.encode_cell({ c: C_idx, r: R });
        if (!wsSummary[cellRef]) wsSummary[cellRef] = { t: 's', v: '' };

        const isSuperHeader = R === 0;
        const isSubHeader = R === 1;
        const isGrandTotal = R === gt - 1;

        let bgSuperHeader = '334155';
        if (C_idx >= 3 && C_idx <= 11) bgSuperHeader = '1E3A8A';
        else if (C_idx >= 12 && C_idx <= 17) bgSuperHeader = '0F766E';
        else if (C_idx >= 18 && C_idx <= 23) bgSuperHeader = '0F172A';
        else if (C_idx >= 24 && C_idx <= 32) bgSuperHeader = '581C87';

        const isSecBoundary = C_idx === 2 || C_idx === 5 || C_idx === 8 || C_idx === 11 || C_idx === 14 || C_idx === 17 || C_idx === 20 || C_idx === 23 || C_idx === 26 || C_idx === 29 || C_idx === 32;
        const rBorder = isSecBoundary ? { style: 'medium', color: { rgb: '334155' } } : { style: 'hair', color: { rgb: 'CBD5E1' } };

        if (isSuperHeader) {
          wsSummary[cellRef].s = {
            font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
            fill: { fgColor: { rgb: bgSuperHeader } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: { top: { style: 'medium', color: { rgb: '0F172A' } }, bottom: { style: 'medium', color: { rgb: '0F172A' } }, right: rBorder }
          };
        } else if (isSubHeader) {
          const isVar = C_idx === 5 || C_idx === 8 || C_idx === 11 || C_idx === 14 || C_idx === 17 || C_idx === 20 || C_idx === 23 || C_idx === 26 || C_idx === 29 || C_idx === 32;
          wsSummary[cellRef].s = {
            font: { name: 'Segoe UI', bold: true, color: { rgb: isVar ? '581C87' : '0F172A' }, sz: 10 },
            fill: { fgColor: { rgb: isVar ? 'E2E8F0' : 'F1F5F9' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: { bottom: { style: 'medium', color: { rgb: '0F172A' } }, right: rBorder }
          };
        } else if (isGrandTotal) {
          wsSummary[cellRef].s = {
            font: { name: 'Segoe UI', bold: true, sz: 11, color: { rgb: 'F59E0B' } },
            fill: { fgColor: { rgb: '0F172A' } },
            alignment: { horizontal: typeof wsSummary[cellRef].v === 'number' || wsSummary[cellRef].f ? 'right' : 'left' },
            border: { top: { style: 'thin', color: { rgb: '94A3B8' } }, bottom: { style: 'double', color: { rgb: '0F172A' } }, right: rBorder },
            numFmt: '#,##0.00'
          };
        } else {
          const isVarCol = C_idx === 5 || C_idx === 8 || C_idx === 11 || C_idx === 14 || C_idx === 17 || C_idx === 20 || C_idx === 23 || C_idx === 26 || C_idx === 29 || C_idx === 32;
          const cellVal = typeof wsSummary[cellRef].v === 'number' ? wsSummary[cellRef].v : 0;
          const hasVar = isVarCol && Math.abs(cellVal) > 0.01;
          const isBalancing = summaryAoA[R] && String(summaryAoA[R][0]).includes('Unregistered Retail Consumers');

          wsSummary[cellRef].s = {
            font: { name: 'Segoe UI', sz: 10, color: { rgb: hasVar ? 'B91C1C' : (isBalancing ? '1E3A8A' : '334155') }, bold: hasVar || isBalancing },
            fill: { fgColor: { rgb: hasVar ? 'FEF2F2' : (isBalancing ? 'F0FDF4' : (isVarCol ? 'FFFBEB' : 'FFFFFF')) } },
            alignment: { horizontal: typeof wsSummary[cellRef].v === 'number' || wsSummary[cellRef].f ? 'right' : 'left' },
            border: { bottom: { style: 'hair', color: { rgb: 'E2E8F0' } }, right: rBorder },
            numFmt: typeof wsSummary[cellRef].v === 'number' || wsSummary[cellRef].f ? '#,##0.00' : undefined
          };
        }
      }
    }

    return { ws: wsSummary, gtRow: gt };
  };

  // Helper function to build detailed worksheets
  const buildDetailSheet = (resultsList: VarianceResult[], headerColor = '1E3A8A') => {
    const detailHeaders = [
      'Match Status', 'Month', 'Invoice Date', 'GST No', 'Invoice/Note No', 'Party Name',
      'Taxable (Books)', 'Taxable (Portal)', 'Taxable Variance',
      'IGST (Books)', 'IGST (Portal)', 'IGST Variance',
      'CGST (Books)', 'CGST (Portal)', 'CGST Variance',
      'SGST (Books)', 'SGST (Portal)', 'SGST Variance'
    ];
    const aoa: any[][] = [detailHeaders];
    let totalTaxableBooks = 0, totalTaxablePortal = 0, totalTaxableVar = 0;
    let totalIgstBooks = 0, totalIgstPortal = 0, totalIgstVar = 0;
    let totalCgstBooks = 0, totalCgstPortal = 0, totalCgstVar = 0;
    let totalSgstBooks = 0, totalSgstPortal = 0, totalSgstVar = 0;

    resultsList.forEach(r => {
      const tb = r['Taxable (Books)'] || 0;
      const tp = r['Taxable (Portal)'] || 0;
      const tv = r['Taxable Variance'] || 0;
      const ib = r['IGST (Books)'] || 0;
      const ip = r['IGST (Portal)'] || 0;
      const iv = r['IGST Variance'] || 0;
      const cb = r['CGST (Books)'] || 0;
      const cp = r['CGST (Portal)'] || 0;
      const cv = r['CGST Variance'] || 0;
      const sb = r['SGST (Books)'] || 0;
      const sp = r['SGST (Portal)'] || 0;
      const sv = r['SGST Variance'] || 0;

      totalTaxableBooks += tb;
      totalTaxablePortal += tp;
      totalTaxableVar += tv;
      totalIgstBooks += ib;
      totalIgstPortal += ip;
      totalIgstVar += iv;
      totalCgstBooks += cb;
      totalCgstPortal += cp;
      totalCgstVar += cv;
      totalSgstBooks += sb;
      totalSgstPortal += sp;
      totalSgstVar += sv;

      aoa.push([
        r['Match Status'], r['Month'], r['Invoice Date'], r['GST No'], r['Invoice/Note No'], r['Party Name'],
        tb, tp, tv,
        ib, ip, iv,
        cb, cp, cv,
        sb, sp, sv
      ]);
    });

    const hasData = aoa.length > 1;
    const gtRow = aoa.length + 1;
    aoa.push([
      'GRAND TOTAL', '', '', '', '', '',
      hasData ? { t: 'n', v: totalTaxableBooks, f: `SUM(G2:G${gtRow - 1})` } : { t: 'n', v: totalTaxableBooks },
      hasData ? { t: 'n', v: totalTaxablePortal, f: `SUM(H2:H${gtRow - 1})` } : { t: 'n', v: totalTaxablePortal },
      hasData ? { t: 'n', v: totalTaxableVar, f: `SUM(I2:I${gtRow - 1})` } : { t: 'n', v: totalTaxableVar },
      hasData ? { t: 'n', v: totalIgstBooks, f: `SUM(J2:J${gtRow - 1})` } : { t: 'n', v: totalIgstBooks },
      hasData ? { t: 'n', v: totalIgstPortal, f: `SUM(K2:K${gtRow - 1})` } : { t: 'n', v: totalIgstPortal },
      hasData ? { t: 'n', v: totalIgstVar, f: `SUM(L2:L${gtRow - 1})` } : { t: 'n', v: totalIgstVar },
      hasData ? { t: 'n', v: totalCgstBooks, f: `SUM(M2:M${gtRow - 1})` } : { t: 'n', v: totalCgstBooks },
      hasData ? { t: 'n', v: totalCgstPortal, f: `SUM(N2:N${gtRow - 1})` } : { t: 'n', v: totalCgstPortal },
      hasData ? { t: 'n', v: totalCgstVar, f: `SUM(O2:O${gtRow - 1})` } : { t: 'n', v: totalCgstVar },
      hasData ? { t: 'n', v: totalSgstBooks, f: `SUM(P2:P${gtRow - 1})` } : { t: 'n', v: totalSgstBooks },
      hasData ? { t: 'n', v: totalSgstPortal, f: `SUM(Q2:Q${gtRow - 1})` } : { t: 'n', v: totalSgstPortal },
      hasData ? { t: 'n', v: totalSgstVar, f: `SUM(R2:R${gtRow - 1})` } : { t: 'n', v: totalSgstVar }
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!rows'] = [{ hpt: 24 }];
    ws['!cols'] = [
      { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 30 },
      { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }
    ];

    const range = XLSX.utils.decode_range(ws['!ref'] || "A1:R1");
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C_idx = range.s.c; C_idx <= range.e.c; C_idx++) {
        const cellRef = XLSX.utils.encode_cell({ c: C_idx, r: R });
        if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };

        const isHeader = R === 0;
        const isTotal = R === range.e.r;

        if (isHeader) {
          ws[cellRef].s = {
            font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
            fill: { fgColor: { rgb: headerColor } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: { top: { style: 'medium', color: { rgb: '0F172A' } }, bottom: { style: 'medium', color: { rgb: '0F172A' } }, left: { style: 'thin', color: { rgb: '334155' } }, right: { style: 'thin', color: { rgb: '334155' } } }
          };
        } else if (isTotal) {
          ws[cellRef].s = {
            font: { name: 'Segoe UI', bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: '1E293B' } },
            alignment: { horizontal: typeof ws[cellRef].v === 'number' || ws[cellRef].f ? 'right' : 'left' },
            border: { top: { style: 'thin', color: { rgb: '94A3B8' } }, bottom: { style: 'double', color: { rgb: '0F172A' } } },
            numFmt: '#,##0.00'
          };
        } else {
          let fontColor = '334155';
          const val = ws[cellRef].v;
          if (val === 'Value Mismatch' || val === 'Missing in Books' || val === 'Missing in Portal') {
            fontColor = 'DC2626';
          } else if (val === 'Perfect Match') {
            fontColor = '16A34A';
          }

          ws[cellRef].s = {
            font: { name: 'Segoe UI', sz: 10, color: { rgb: fontColor } },
            alignment: { horizontal: typeof val === 'number' || ws[cellRef].f ? 'right' : 'left' },
            border: { bottom: { style: 'hair', color: { rgb: 'E2E8F0' } }, right: { style: 'hair', color: { rgb: 'F1F5F9' } } },
            numFmt: typeof val === 'number' || ws[cellRef].f ? '#,##0.00' : undefined
          };
        }
      }
    }

    return {
      ws,
      gtRow,
      totals: {
        taxableBooks: totalTaxableBooks,
        taxablePortal: totalTaxablePortal,
        taxableVar: totalTaxableVar,
        igstBooks: totalIgstBooks,
        igstPortal: totalIgstPortal,
        igstVar: totalIgstVar,
        cgstBooks: totalCgstBooks,
        cgstPortal: totalCgstPortal,
        cgstVar: totalCgstVar,
        sgstBooks: totalSgstBooks,
        sgstPortal: totalSgstPortal,
        sgstVar: totalSgstVar
      }
    };
  };

  // Build B2C details sheet (strict cleanPortalB2C, B2CL is unified in B2B to avoid double counting)
  const buildB2CDetailSheet = () => {
    const b2cDetailHeaders = [
      'Match Status', 'Month', 'GST No', 'Party Name', 'Invoice No', 'Invoice Date', 'POS', 'Tax Rate',
      'Taxable (Books)', 'Taxable (Portal)', 'Taxable Variance',
      'IGST (Books)', 'IGST (Portal)', 'IGST Variance',
      'CGST (Books)', 'CGST (Portal)', 'CGST Variance',
      'SGST (Books)', 'SGST (Portal)', 'SGST Variance'
    ];
    const aoa: any[][] = [b2cDetailHeaders];
    let totalTaxableBooks = 0, totalTaxablePortal = 0, totalTaxableVar = 0;
    let totalIgstBooks = 0, totalIgstPortal = 0, totalIgstVar = 0;
    let totalCgstBooks = 0, totalCgstPortal = 0, totalCgstVar = 0;
    let totalSgstBooks = 0, totalSgstPortal = 0, totalSgstVar = 0;

    b2cBooks.forEach(row => {
      const rate = snapToGstRate(row.taxable, row.cgst + row.sgst + row.igst);
      totalTaxableBooks += row.taxable;
      totalTaxableVar += row.taxable;
      totalIgstBooks += row.igst;
      totalIgstVar += row.igst;
      totalCgstBooks += row.cgst;
      totalCgstVar += row.cgst;
      totalSgstBooks += row.sgst;
      totalSgstVar += row.sgst;

      aoa.push([
        'Books Only', row.month, row.gstNo || 'UNREGISTERED', row.party || 'B2C Customer', row.invoiceNo, row.invoiceDate, row.pos, rate + '%',
        row.taxable, 0, row.taxable,
        row.igst, 0, row.igst,
        row.cgst, 0, row.cgst,
        row.sgst, 0, row.sgst
      ]);
    });

    cleanPortalB2C.forEach(row => {
      const rate = snapToGstRate(row.taxable, row.cgst + row.sgst + row.igst);
      totalTaxablePortal += row.taxable;
      totalTaxableVar -= row.taxable;
      totalIgstPortal += row.igst;
      totalIgstVar -= row.igst;
      totalCgstPortal += row.cgst;
      totalCgstVar -= row.cgst;
      totalSgstPortal += row.sgst;
      totalSgstVar -= row.sgst;

      aoa.push([
        'Portal Only', row.month, row.gstNo || 'UNREGISTERED', row.party || 'B2C Customer', row.invoiceNo, row.invoiceDate, row.pos, rate + '%',
        0, row.taxable, -row.taxable,
        0, row.igst, -row.igst,
        0, row.cgst, -row.cgst,
        0, row.sgst, -row.sgst
      ]);
    });

    const hasData = aoa.length > 1;
    const gtRow = aoa.length + 1;
    aoa.push([
      'GRAND TOTAL', '', '', '', '', '', '', '',
      hasData ? { t: 'n', v: totalTaxableBooks, f: `SUM(I2:I${gtRow - 1})` } : { t: 'n', v: totalTaxableBooks },
      hasData ? { t: 'n', v: totalTaxablePortal, f: `SUM(J2:J${gtRow - 1})` } : { t: 'n', v: totalTaxablePortal },
      hasData ? { t: 'n', v: totalTaxableVar, f: `SUM(K2:K${gtRow - 1})` } : { t: 'n', v: totalTaxableVar },
      hasData ? { t: 'n', v: totalIgstBooks, f: `SUM(L2:L${gtRow - 1})` } : { t: 'n', v: totalIgstBooks },
      hasData ? { t: 'n', v: totalIgstPortal, f: `SUM(M2:M${gtRow - 1})` } : { t: 'n', v: totalIgstPortal },
      hasData ? { t: 'n', v: totalIgstVar, f: `SUM(N2:N${gtRow - 1})` } : { t: 'n', v: totalIgstVar },
      hasData ? { t: 'n', v: totalCgstBooks, f: `SUM(O2:O${gtRow - 1})` } : { t: 'n', v: totalCgstBooks },
      hasData ? { t: 'n', v: totalCgstPortal, f: `SUM(P2:P${gtRow - 1})` } : { t: 'n', v: totalCgstPortal },
      hasData ? { t: 'n', v: totalCgstVar, f: `SUM(Q2:Q${gtRow - 1})` } : { t: 'n', v: totalCgstVar },
      hasData ? { t: 'n', v: totalSgstBooks, f: `SUM(R2:R${gtRow - 1})` } : { t: 'n', v: totalSgstBooks },
      hasData ? { t: 'n', v: totalSgstPortal, f: `SUM(S2:S${gtRow - 1})` } : { t: 'n', v: totalSgstPortal },
      hasData ? { t: 'n', v: totalSgstVar, f: `SUM(T2:T${gtRow - 1})` } : { t: 'n', v: totalSgstVar }
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!rows'] = [{ hpt: 24 }];
    ws['!cols'] = [
      { wch: 15 }, { wch: 10 }, { wch: 18 }, { wch: 25 }, { wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 10 },
      { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }
    ];

    const range = XLSX.utils.decode_range(ws['!ref'] || "A1:T1");
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C_idx = range.s.c; C_idx <= range.e.c; C_idx++) {
        const cellRef = XLSX.utils.encode_cell({ c: C_idx, r: R });
        if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };

        const isHeader = R === 0;
        const isTotal = R === range.e.r;

        if (isHeader) {
          ws[cellRef].s = {
            font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
            fill: { fgColor: { rgb: '1E3A8A' } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: { top: { style: 'medium', color: { rgb: '0F172A' } }, bottom: { style: 'medium', color: { rgb: '0F172A' } }, left: { style: 'thin', color: { rgb: '334155' } }, right: { style: 'thin', color: { rgb: '334155' } } }
          };
        } else if (isTotal) {
          ws[cellRef].s = {
            font: { name: 'Segoe UI', bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: '1E293B' } },
            alignment: { horizontal: typeof ws[cellRef].v === 'number' || ws[cellRef].f ? 'right' : 'left' },
            border: { top: { style: 'thin', color: { rgb: '94A3B8' } }, bottom: { style: 'double', color: { rgb: '0F172A' } } },
            numFmt: '#,##0.00'
          };
        } else {
          ws[cellRef].s = {
            font: { name: 'Segoe UI', sz: 10, color: { rgb: ws[cellRef].v === 'Portal Only' ? 'DC2626' : '334155' } },
            alignment: { horizontal: typeof ws[cellRef].v === 'number' || ws[cellRef].f ? 'right' : 'left' },
            border: { bottom: { style: 'hair', color: { rgb: 'E2E8F0' } }, right: { style: 'hair', color: { rgb: 'F1F5F9' } } },
            numFmt: typeof ws[cellRef].v === 'number' || ws[cellRef].f ? '#,##0.00' : undefined
          };
        }
      }
    }

    return {
      ws,
      gtRow,
      totals: {
        taxableBooks: totalTaxableBooks,
        taxablePortal: totalTaxablePortal,
        taxableVar: totalTaxableVar,
        igstBooks: totalIgstBooks,
        igstPortal: totalIgstPortal,
        igstVar: totalIgstVar,
        cgstBooks: totalCgstBooks,
        cgstPortal: totalCgstPortal,
        cgstVar: totalCgstVar,
        sgstBooks: totalSgstBooks,
        sgstPortal: totalSgstPortal,
        sgstVar: totalSgstVar
      }
    };
  };

  // Build Nil Rated details sheet
  const buildNilDetailSheet = () => {
    const nilDetailHeaders = [
      'Match Status', 'Month', 'GST No', 'Party Name',
      'Nil Rated (Books)', 'Non Taxable (Books)', 'Nil Rated (Portal)', 'Non Taxable (Portal)',
      'Nil Rated Variance', 'Non Taxable Variance'
    ];
    const aoa: any[][] = [nilDetailHeaders];
    let totalNilBooks = 0, totalNonTaxBooks = 0;
    let totalNilPortal = 0, totalNonTaxPortal = 0;

    nilBooks.forEach(row => {
      totalNilBooks += row.nilRated;
      totalNonTaxBooks += row.nonTaxable;
      aoa.push([
        'Books Only', row.month, row.gstNo || 'UNREGISTERED', row.party || 'Nil/Non-GST Customer',
        row.nilRated, row.nonTaxable, 0, 0,
        row.nilRated, row.nonTaxable
      ]);
    });

    const nilBooksReturns = cleanBooksCreditNotes.filter(r => (r.nilRated || 0) > 0 || (r.nonTaxable || 0) > 0);
    nilBooksReturns.forEach(row => {
      totalNilBooks -= row.nilRated;
      totalNonTaxBooks -= row.nonTaxable;
      aoa.push([
        'Sales Return (Books)', row.month, row.gstNo || 'UNREGISTERED', row.party || 'Nil/Non-GST Customer',
        -row.nilRated, -row.nonTaxable, 0, 0,
        -row.nilRated, -row.nonTaxable
      ]);
    });

    cleanPortalNil.forEach(row => {
      totalNilPortal += row.nilRated;
      totalNonTaxPortal += row.nonTaxable;
      aoa.push([
        'Portal Only', row.month, row.gstNo || 'UNREGISTERED', row.party || 'Nil/Non-GST Customer',
        0, 0, row.nilRated, row.nonTaxable,
        -row.nilRated, -row.nonTaxable
      ]);
    });

    const totalNilVar = totalNilBooks - totalNilPortal;
    const totalNonTaxVar = totalNonTaxBooks - totalNonTaxPortal;

    const hasData = aoa.length > 1;
    const gtRow = aoa.length + 1;
    aoa.push([
      'GRAND TOTAL', '', '', '',
      hasData ? { t: 'n', v: totalNilBooks, f: `SUM(E2:E${gtRow - 1})` } : { t: 'n', v: totalNilBooks },
      hasData ? { t: 'n', v: totalNonTaxBooks, f: `SUM(F2:F${gtRow - 1})` } : { t: 'n', v: totalNonTaxBooks },
      hasData ? { t: 'n', v: totalNilPortal, f: `SUM(G2:G${gtRow - 1})` } : { t: 'n', v: totalNilPortal },
      hasData ? { t: 'n', v: totalNonTaxPortal, f: `SUM(H2:H${gtRow - 1})` } : { t: 'n', v: totalNonTaxPortal },
      hasData ? { t: 'n', v: totalNilVar, f: `SUM(I2:I${gtRow - 1})` } : { t: 'n', v: totalNilVar },
      hasData ? { t: 'n', v: totalNonTaxVar, f: `SUM(J2:J${gtRow - 1})` } : { t: 'n', v: totalNonTaxVar }
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!rows'] = [{ hpt: 24 }];
    ws['!cols'] = [
      { wch: 15 }, { wch: 10 }, { wch: 18 }, { wch: 25 },
      { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
      { wch: 18 }, { wch: 18 }
    ];

    const range = XLSX.utils.decode_range(ws['!ref'] || "A1:J1");
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C_idx = range.s.c; C_idx <= range.e.c; C_idx++) {
        const cellRef = XLSX.utils.encode_cell({ c: C_idx, r: R });
        if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };

        const isHeader = R === 0;
        const isTotal = R === range.e.r;

        if (isHeader) {
          ws[cellRef].s = {
            font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
            fill: { fgColor: { rgb: '0F766E' } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: { top: { style: 'medium', color: { rgb: '0F172A' } }, bottom: { style: 'medium', color: { rgb: '0F172A' } }, left: { style: 'thin', color: { rgb: '334155' } }, right: { style: 'thin', color: { rgb: '334155' } } }
          };
        } else if (isTotal) {
          ws[cellRef].s = {
            font: { name: 'Segoe UI', bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: '1E293B' } },
            alignment: { horizontal: typeof ws[cellRef].v === 'number' || ws[cellRef].f ? 'right' : 'left' },
            border: { top: { style: 'thin', color: { rgb: '94A3B8' } }, bottom: { style: 'double', color: { rgb: '0F172A' } } },
            numFmt: '#,##0.00'
          };
        } else {
          ws[cellRef].s = {
            font: { name: 'Segoe UI', sz: 10, color: { rgb: ws[cellRef].v === 'Portal Only' ? 'DC2626' : '334155' } },
            alignment: { horizontal: typeof ws[cellRef].v === 'number' || ws[cellRef].f ? 'right' : 'left' },
            border: { bottom: { style: 'hair', color: { rgb: 'E2E8F0' } }, right: { style: 'hair', color: { rgb: 'F1F5F9' } } },
            numFmt: typeof ws[cellRef].v === 'number' || ws[cellRef].f ? '#,##0.00' : undefined
          };
        }
      }
    }

    return {
      ws,
      gtRow,
      totals: {
        nilBooks: totalNilBooks,
        nonTaxBooks: totalNonTaxBooks,
        nilPortal: totalNilPortal,
        nonTaxPortal: totalNonTaxPortal,
        nilVar: totalNilVar,
        nonTaxVar: totalNonTaxVar,
        combinedBooks: totalNilBooks + totalNonTaxBooks,
        combinedPortal: totalNilPortal + totalNonTaxPortal,
        combinedVar: totalNilVar + totalNonTaxVar
      }
    };
  };

  // Build the Cross-Check Summary Sheet (Verification of 100% Mathematical Invariant across all sheets)
  const buildCrossCheckSheet = (
    mSummaries: MonthlySummary[],
    sec1End: number,
    b2bData: { totals: any; gtRow: number },
    expData: { totals: any; gtRow: number },
    cnData: { totals: any; gtRow: number },
    b2cData: { totals: any; gtRow: number },
    nilData: { totals: any; gtRow: number },
    pGrandRowIdx: number,
    pGrandTotals: any,
    s1Row: number,
    pSummaries: PartySummary[],
    pMonthRowMap?: Record<string, number>,
    partySummaryData?: { ws: any; gtRow: number }
  ) => {
    const masterTaxableBooks = mSummaries.reduce((sum, s) => sum + s.booksNet.taxable, 0);
    const masterTaxablePortal = mSummaries.reduce((sum, s) => sum + s.portalNet.taxable, 0);
    const masterTaxableVar = masterTaxableBooks - masterTaxablePortal;
    const masterIgstVar = mSummaries.reduce((sum, s) => sum + s.variance.igst, 0);
    const masterCgstVar = mSummaries.reduce((sum, s) => sum + s.variance.cgst, 0);
    const masterSgstVar = mSummaries.reduce((sum, s) => sum + s.variance.sgst, 0);

    const detailTaxableBooks = b2bData.totals.taxableBooks + expData.totals.taxableBooks + b2cData.totals.taxableBooks - cnData.totals.taxableBooks;
    const detailTaxablePortal = b2bData.totals.taxablePortal + expData.totals.taxablePortal + b2cData.totals.taxablePortal - cnData.totals.taxablePortal;
    const detailTaxableVar = detailTaxableBooks - detailTaxablePortal;
    const detailIgstVar = b2bData.totals.igstVar + expData.totals.igstVar + b2cData.totals.igstVar - cnData.totals.igstVar;
    const detailCgstVar = b2bData.totals.cgstVar + expData.totals.cgstVar + b2cData.totals.cgstVar - cnData.totals.cgstVar;
    const detailSgstVar = b2bData.totals.sgstVar + expData.totals.sgstVar + b2cData.totals.sgstVar - cnData.totals.sgstVar;

    const partyTaxableBooks = pGrandTotals.b2bBooksTaxable + pGrandTotals.expBooksTaxable + pGrandTotals.b2cBooksTaxable - pGrandTotals.cnBooksTaxable;
    const partyTaxablePortal = pGrandTotals.b2bPortalTaxable + pGrandTotals.expPortalTaxable + pGrandTotals.b2cPortalTaxable - pGrandTotals.cnPortalTaxable;
    const partyTaxableVar = partyTaxableBooks - partyTaxablePortal;
    const partyIgstVar = pGrandTotals.igstVar;
    const partyCgstVar = pGrandTotals.cgstVar;
    const partySgstVar = pGrandTotals.sgstVar;

    const masterNilBooks = mSummaries.reduce((s, m) => s + m.booksNet.nilRated + m.booksNet.nonTaxable, 0);
    const masterNilPortal = mSummaries.reduce((s, m) => s + m.portalNet.nilRated + m.portalNet.nonTaxable, 0);
    const masterNilVar = masterNilBooks - masterNilPortal;

    const detailNilBooks = nilData.totals.nilBooks + nilData.totals.nonTaxBooks;
    const detailNilPortal = nilData.totals.nilPortal + nilData.totals.nonTaxPortal;
    const detailNilVar = detailNilBooks - detailNilPortal;

    const partyNilBooks = pGrandTotals.nilBooksTaxable + pGrandTotals.nonTaxBooks;
    const partyNilPortal = pGrandTotals.nilPortalTaxable + pGrandTotals.nonTaxPortal;
    const partyNilVar = partyNilBooks - partyNilPortal;

    const masterTotalOutwardBooks = masterTaxableBooks + masterNilBooks;
    const masterTotalOutwardPortal = masterTaxablePortal + masterNilPortal;
    const masterTotalOutwardVar = masterTotalOutwardBooks - masterTotalOutwardPortal;

    const detailTotalOutwardBooks = detailTaxableBooks + detailNilBooks;
    const detailTotalOutwardPortal = detailTaxablePortal + detailNilPortal;
    const detailTotalOutwardVar = detailTotalOutwardBooks - detailTotalOutwardPortal;

    const partyTotalOutwardBooks = partyTaxableBooks + partyNilBooks;
    const partyTotalOutwardPortal = partyTaxablePortal + partyNilPortal;
    const partyTotalOutwardVar = partyTotalOutwardBooks - partyTotalOutwardPortal;

    const aoa: any[][] = [];
    aoa.push(['VASWANI RETURN ENTERPRISE — GST OUTPUT RECONCILIATION AUDIT DECK']);
    aoa.push(['FOUR-WAY TOTALITY AUDIT CROSS-CHECK & MATHEMATICAL TIE-OUT']);
    aoa.push([]);

    // Table 1: Four-Way Totality Check
    const t1HeaderRow = aoa.length;
    aoa.push([
      'TABLE 1: FOUR-WAY TOTALITY AUDIT CONFIRMATION', '', '', '', '', '', '', '', ''
    ]);
    aoa.push([
      'Reconciliation Layer', 'Source Worksheet / Basis',
      'Books Total Turnover (₹)', 'Portal Total Turnover (₹)', 'Total Turnover Variance (₹)',
      'IGST Variance (₹)', 'CGST Variance (₹)', 'SGST Variance (₹)',
      'Audit Verification Status'
    ]);

    const sec1TotalRowExcel = sec1End + 1;
    const b2bGt = b2bData.gtRow;
    const expGt = expData.gtRow;
    const b2cGt = b2cData.gtRow;
    const nilGt = nilData.gtRow;
    const cnGt = cnData.gtRow;
    const summaryGt = partySummaryData ? partySummaryData.gtRow : 3;

    // Row 6 (Excel 6): Layer 1
    aoa.push([
      '1. Master 12-Month Matrix',
      'Master_Dashboard (Sec 1 Total Outward: Taxable + Nil/Exempt)',
      { t: 'n', v: masterTotalOutwardBooks, f: `Master_Dashboard!B${sec1TotalRowExcel}+Master_Dashboard!F${sec1TotalRowExcel}+Master_Dashboard!G${sec1TotalRowExcel}` },
      { t: 'n', v: masterTotalOutwardPortal, f: `Master_Dashboard!H${sec1TotalRowExcel}+Master_Dashboard!L${sec1TotalRowExcel}+Master_Dashboard!M${sec1TotalRowExcel}` },
      { t: 'n', v: masterTotalOutwardVar, f: `Master_Dashboard!N${sec1TotalRowExcel}+Master_Dashboard!R${sec1TotalRowExcel}+Master_Dashboard!S${sec1TotalRowExcel}` },
      { t: 'n', v: masterIgstVar, f: `Master_Dashboard!O${sec1TotalRowExcel}` },
      { t: 'n', v: masterCgstVar, f: `Master_Dashboard!P${sec1TotalRowExcel}` },
      { t: 'n', v: masterSgstVar, f: `Master_Dashboard!Q${sec1TotalRowExcel}` },
      '✓ MASTER CONTROL TOTAL'
    ]);

    // Row 7 (Excel 7): Layer 2
    aoa.push([
      '2. Component Detail Sheets Totality',
      'B2B + Export + B2C + Nil - CN',
      { t: 'n', v: detailTotalOutwardBooks, f: `B2B_Details!G${b2bGt}+Export_Details!G${expGt}+B2C_Details!I${b2cGt}+Nil_Rated_Details!E${nilGt}+Nil_Rated_Details!F${nilGt}-CN_Details!G${cnGt}` },
      { t: 'n', v: detailTotalOutwardPortal, f: `B2B_Details!H${b2bGt}+Export_Details!H${expGt}+B2C_Details!J${b2cGt}+Nil_Rated_Details!G${nilGt}+Nil_Rated_Details!H${nilGt}-CN_Details!H${cnGt}` },
      { t: 'n', v: detailTotalOutwardVar, f: `B2B_Details!I${b2bGt}+Export_Details!I${expGt}+B2C_Details!K${b2cGt}+Nil_Rated_Details!I${nilGt}+Nil_Rated_Details!J${nilGt}-CN_Details!I${cnGt}` },
      { t: 'n', v: detailIgstVar, f: `B2B_Details!L${b2bGt}+Export_Details!L${expGt}+B2C_Details!N${b2cGt}-CN_Details!L${cnGt}` },
      { t: 'n', v: detailCgstVar, f: `B2B_Details!O${b2bGt}+Export_Details!O${expGt}+B2C_Details!Q${b2cGt}-CN_Details!O${cnGt}` },
      { t: 'n', v: detailSgstVar, f: `B2B_Details!R${b2bGt}+Export_Details!R${expGt}+B2C_Details!T${b2cGt}-CN_Details!R${cnGt}` },
      '✓ COMPONENT DETAIL SUM'
    ]);

    // Row 8 (Excel 8): Layer 3
    aoa.push([
      '3. Annual Consolidated Party Summary',
      'Party_Summary (Grand Total: Net Taxable + Nil/Exempt)',
      { t: 'n', v: masterTotalOutwardBooks, f: `Party_Summary!V${summaryGt}` },
      { t: 'n', v: masterTotalOutwardPortal, f: `Party_Summary!W${summaryGt}` },
      { t: 'n', v: masterTotalOutwardVar, f: `Party_Summary!X${summaryGt}` },
      { t: 'n', v: masterIgstVar, f: `Party_Summary!AA${summaryGt}` },
      { t: 'n', v: masterCgstVar, f: `Party_Summary!AD${summaryGt}` },
      { t: 'n', v: masterSgstVar, f: `Party_Summary!AG${summaryGt}` },
      '✓ ANNUAL SUMMARY TOTAL'
    ]);

    // Row 9 (Excel 9): Layer 4
    aoa.push([
      '4. Monthly Customer Party Working',
      'Party_Working (Grand Total: Net Taxable + Nil + Non Taxable)',
      { t: 'n', v: partyTotalOutwardBooks, f: `Party_Working!O${pGrandRowIdx}+Party_Working!U${pGrandRowIdx}+Party_Working!X${pGrandRowIdx}` },
      { t: 'n', v: partyTotalOutwardPortal, f: `Party_Working!P${pGrandRowIdx}+Party_Working!V${pGrandRowIdx}+Party_Working!Y${pGrandRowIdx}` },
      { t: 'n', v: partyTotalOutwardVar, f: `Party_Working!Q${pGrandRowIdx}+Party_Working!W${pGrandRowIdx}+Party_Working!Z${pGrandRowIdx}` },
      { t: 'n', v: partyIgstVar, f: `Party_Working!AC${pGrandRowIdx}` },
      { t: 'n', v: partyCgstVar, f: `Party_Working!AF${pGrandRowIdx}` },
      { t: 'n', v: partySgstVar, f: `Party_Working!AI${pGrandRowIdx}` },
      '✓ CUSTOMER AGGREGATE'
    ]);

    // Row 10 (Excel 10): Difference Layer 1 - Layer 2
    aoa.push([
      'AUDIT VARIANCE: MASTER vs DETAIL SHEETS',
      'Layer 1 minus Layer 2',
      { t: 'n', v: masterTotalOutwardBooks - detailTotalOutwardBooks, f: 'C6-C7' },
      { t: 'n', v: masterTotalOutwardPortal - detailTotalOutwardPortal, f: 'D6-D7' },
      { t: 'n', v: masterTotalOutwardVar - detailTotalOutwardVar, f: 'E6-E7' },
      { t: 'n', v: masterIgstVar - detailIgstVar, f: 'F6-F7' },
      { t: 'n', v: masterCgstVar - detailCgstVar, f: 'G6-G7' },
      { t: 'n', v: masterSgstVar - detailSgstVar, f: 'H6-H7' },
      { t: 's', v: '✓ BALANCED (₹0.00)', f: 'IF(AND(ABS(C10)<0.01,ABS(D10)<0.01,ABS(E10)<0.01),"✓ BALANCED (₹0.00)","❌ MISMATCH")' }
    ]);

    // Row 11 (Excel 11): Difference Layer 1 - Layer 3
    aoa.push([
      'AUDIT VARIANCE: MASTER vs ANNUAL PARTY SUMMARY',
      'Layer 1 minus Layer 3',
      { t: 'n', v: 0, f: 'C6-C8' },
      { t: 'n', v: 0, f: 'D6-D8' },
      { t: 'n', v: 0, f: 'E6-E8' },
      { t: 'n', v: 0, f: 'F6-F8' },
      { t: 'n', v: 0, f: 'G6-G8' },
      { t: 'n', v: 0, f: 'H6-H8' },
      { t: 's', v: '✓ BALANCED (₹0.00)', f: 'IF(AND(ABS(C11)<0.01,ABS(D11)<0.01,ABS(E11)<0.01),"✓ BALANCED (₹0.00)","❌ MISMATCH")' }
    ]);

    // Row 12 (Excel 12): Difference Layer 1 - Layer 4
    aoa.push([
      'AUDIT VARIANCE: MASTER vs MONTHLY PARTY WORKING',
      'Layer 1 minus Layer 4',
      { t: 'n', v: masterTotalOutwardBooks - partyTotalOutwardBooks, f: 'C6-C9' },
      { t: 'n', v: masterTotalOutwardPortal - partyTotalOutwardPortal, f: 'D6-D9' },
      { t: 'n', v: masterTotalOutwardVar - partyTotalOutwardVar, f: 'E6-E9' },
      { t: 'n', v: masterIgstVar - partyIgstVar, f: 'F6-F9' },
      { t: 'n', v: masterCgstVar - partyCgstVar, f: 'G6-G9' },
      { t: 'n', v: masterSgstVar - partySgstVar, f: 'H6-H9' },
      { t: 's', v: '✓ BALANCED (₹0.00)', f: 'IF(AND(ABS(C12)<0.01,ABS(D12)<0.01,ABS(E12)<0.01),"✓ BALANCED (₹0.00)","❌ MISMATCH")' }
    ]);

    aoa.push([]);
    aoa.push([]);

    // Table 2: Component Breakdown
    const t2HeaderRow = aoa.length;
    aoa.push([
      'TABLE 2: COMPONENT-WISE DETAIL SHEETS vs 12-MONTH MASTER MATRIX TIE-OUT', '', '', '', '', '', '', '', ''
    ]);
    aoa.push([
      'Component Category', 'Detail Sheet Name',
      'Books Taxable (₹)', 'Portal Taxable (₹)', 'Taxable Variance (₹)',
      'IGST Variance (₹)', 'CGST Variance (₹)', 'SGST Variance (₹)',
      'Component Status'
    ]);

    const t2StartExcel = aoa.length + 1; // e.g. Row 15

    // Row 15: B2B
    aoa.push([
      'B2B & B2CL Invoices',
      'B2B_Details',
      { t: 'n', v: b2bData.totals.taxableBooks, f: `B2B_Details!G${b2bGt}` },
      { t: 'n', v: b2bData.totals.taxablePortal, f: `B2B_Details!H${b2bGt}` },
      { t: 'n', v: b2bData.totals.taxableVar, f: `B2B_Details!I${b2bGt}` },
      { t: 'n', v: b2bData.totals.igstVar, f: `B2B_Details!L${b2bGt}` },
      { t: 'n', v: b2bData.totals.cgstVar, f: `B2B_Details!O${b2bGt}` },
      { t: 'n', v: b2bData.totals.sgstVar, f: `B2B_Details!R${b2bGt}` },
      '✓ VERIFIED'
    ]);

    // Row 16: Exports
    aoa.push([
      'Export Invoices',
      'Export_Details',
      { t: 'n', v: expData.totals.taxableBooks, f: `Export_Details!G${expGt}` },
      { t: 'n', v: expData.totals.taxablePortal, f: `Export_Details!H${expGt}` },
      { t: 'n', v: expData.totals.taxableVar, f: `Export_Details!I${expGt}` },
      { t: 'n', v: expData.totals.igstVar, f: `Export_Details!L${expGt}` },
      { t: 'n', v: expData.totals.cgstVar, f: `Export_Details!O${expGt}` },
      { t: 'n', v: expData.totals.sgstVar, f: `Export_Details!R${expGt}` },
      '✓ VERIFIED'
    ]);

    // Row 17: B2C Small
    aoa.push([
      'B2C Small Supplies',
      'B2C_Details',
      { t: 'n', v: b2cData.totals.taxableBooks, f: `B2C_Details!I${b2cGt}` },
      { t: 'n', v: b2cData.totals.taxablePortal, f: `B2C_Details!J${b2cGt}` },
      { t: 'n', v: b2cData.totals.taxableVar, f: `B2C_Details!K${b2cGt}` },
      { t: 'n', v: b2cData.totals.igstVar, f: `B2C_Details!N${b2cGt}` },
      { t: 'n', v: b2cData.totals.cgstVar, f: `B2C_Details!Q${b2cGt}` },
      { t: 'n', v: b2cData.totals.sgstVar, f: `B2C_Details!T${b2cGt}` },
      '✓ VERIFIED'
    ]);

    // Row 18: Nil Rated & Non-Taxable
    aoa.push([
      'Nil Rated & Non-Taxable Supplies',
      'Nil_Rated_Details',
      { t: 'n', v: nilData.totals.nilBooks + nilData.totals.nonTaxBooks, f: `Nil_Rated_Details!E${nilGt}+Nil_Rated_Details!F${nilGt}` },
      { t: 'n', v: nilData.totals.nilPortal + nilData.totals.nonTaxPortal, f: `Nil_Rated_Details!G${nilGt}+Nil_Rated_Details!H${nilGt}` },
      { t: 'n', v: nilData.totals.nilVar + nilData.totals.nonTaxVar, f: `Nil_Rated_Details!I${nilGt}+Nil_Rated_Details!J${nilGt}` },
      { t: 'n', v: 0, f: '0' },
      { t: 'n', v: 0, f: '0' },
      { t: 'n', v: 0, f: '0' },
      '✓ VERIFIED'
    ]);

    // Row 19: LESS Credit Notes
    aoa.push([
      'LESS: Credit Notes (Return Inward)',
      'CN_Details',
      { t: 'n', v: cnData.totals.taxableBooks, f: `CN_Details!G${cnGt}` },
      { t: 'n', v: cnData.totals.taxablePortal, f: `CN_Details!H${cnGt}` },
      { t: 'n', v: cnData.totals.taxableVar, f: `CN_Details!I${cnGt}` },
      { t: 'n', v: cnData.totals.igstVar, f: `CN_Details!L${cnGt}` },
      { t: 'n', v: cnData.totals.cgstVar, f: `CN_Details!O${cnGt}` },
      { t: 'n', v: cnData.totals.sgstVar, f: `CN_Details!R${cnGt}` },
      '✓ DEDUCTION'
    ]);

    const b2bRow = t2StartExcel;
    const expRow = t2StartExcel + 1;
    const b2cRow = t2StartExcel + 2;
    const nilRow = t2StartExcel + 3;
    const cnRow = t2StartExcel + 4;
    const netRow = t2StartExcel + 5;
    const mastRow = t2StartExcel + 6;
    const diffRow = t2StartExcel + 7;

    // Row 20: Calculated Net Outward Total
    aoa.push([
      'TOTAL NET OUTWARD SUPPLIES',
      'Sum: B2B + Exp + B2C + Nil - CN',
      { t: 'n', v: detailTotalOutwardBooks, f: `C${b2bRow}+C${expRow}+C${b2cRow}+C${nilRow}-C${cnRow}` },
      { t: 'n', v: detailTotalOutwardPortal, f: `D${b2bRow}+D${expRow}+D${b2cRow}+D${nilRow}-D${cnRow}` },
      { t: 'n', v: detailTotalOutwardVar, f: `E${b2bRow}+E${expRow}+E${b2cRow}+E${nilRow}-E${cnRow}` },
      { t: 'n', v: detailIgstVar, f: `F${b2bRow}+F${expRow}+F${b2cRow}+F${nilRow}-F${cnRow}` },
      { t: 'n', v: detailCgstVar, f: `G${b2bRow}+G${expRow}+G${b2cRow}+G${nilRow}-G${cnRow}` },
      { t: 'n', v: detailSgstVar, f: `H${b2bRow}+H${expRow}+H${b2cRow}+H${nilRow}-H${cnRow}` },
      '✓ DETAIL SUM'
    ]);

    // Row 21: Master Matrix 12M Net Total
    aoa.push([
      'MASTER MATRIX 12-MONTH NET TOTAL',
      'Master_Dashboard (Sec 1 Total Outward)',
      { t: 'n', v: masterTotalOutwardBooks, f: `Master_Dashboard!B${sec1TotalRowExcel}+Master_Dashboard!F${sec1TotalRowExcel}+Master_Dashboard!G${sec1TotalRowExcel}` },
      { t: 'n', v: masterTotalOutwardPortal, f: `Master_Dashboard!H${sec1TotalRowExcel}+Master_Dashboard!L${sec1TotalRowExcel}+Master_Dashboard!M${sec1TotalRowExcel}` },
      { t: 'n', v: masterTotalOutwardVar, f: `Master_Dashboard!N${sec1TotalRowExcel}+Master_Dashboard!R${sec1TotalRowExcel}+Master_Dashboard!S${sec1TotalRowExcel}` },
      { t: 'n', v: masterIgstVar, f: `Master_Dashboard!O${sec1TotalRowExcel}` },
      { t: 'n', v: masterCgstVar, f: `Master_Dashboard!P${sec1TotalRowExcel}` },
      { t: 'n', v: masterSgstVar, f: `Master_Dashboard!Q${sec1TotalRowExcel}` },
      '✓ MASTER TOTAL'
    ]);

    // Row 22: Audit Variance Tie-Out
    aoa.push([
      'AUDIT RECONCILIATION VARIANCE',
      'Detail Sum minus Master Total',
      { t: 'n', v: detailTotalOutwardBooks - masterTotalOutwardBooks, f: `C${netRow}-C${mastRow}` },
      { t: 'n', v: detailTotalOutwardPortal - masterTotalOutwardPortal, f: `D${netRow}-D${mastRow}` },
      { t: 'n', v: detailTotalOutwardVar - masterTotalOutwardVar, f: `E${netRow}-E${mastRow}` },
      { t: 'n', v: detailIgstVar - masterIgstVar, f: `F${netRow}-F${mastRow}` },
      { t: 'n', v: detailCgstVar - masterCgstVar, f: `G${netRow}-G${mastRow}` },
      { t: 'n', v: detailSgstVar - masterSgstVar, f: `H${netRow}-H${mastRow}` },
      { t: 's', v: '✓ 100% TIED OUT (₹0.00)', f: `IF(AND(ABS(C${diffRow})<0.01,ABS(D${diffRow})<0.01,ABS(E${diffRow})<0.01),"✓ 100% TIED OUT (₹0.00)","❌ MISMATCH")` }
    ]);

    aoa.push([]);
    aoa.push([]);

    // Table 3: 12-Month Month-by-Month Cross-Check Matrix
    const t3HeaderRow = aoa.length;
    aoa.push([
      'TABLE 3: 12-MONTH MONTH-BY-MONTH CROSS-CHECK MATRIX (APRIL TO MARCH)', '', '', '', '', '', '', '', '', '', ''
    ]);
    aoa.push([
      'Month',
      'Master Books Net (₹)', 'Master Portal Net (₹)', 'Master Net Var (₹)',
      'Detail Books Net (₹)', 'Detail Portal Net (₹)', 'Detail Net Var (₹)',
      'Month Var Diff (₹)',
      'Party Working Net Var (₹)', 'Party Var Diff (₹)',
      'Monthly Status'
    ]);

    const t3StartExcel = aoa.length + 1;
    mSummaries.forEach((m, idx) => {
      const curRowExcel = t3StartExcel + idx;
      const mNetBooks = m.booksNet.taxable + (m.booksNet.nilRated || 0) + (m.booksNet.nonTaxable || 0);
      const mNetPortal = m.portalNet.taxable + (m.portalNet.nilRated || 0) + (m.portalNet.nonTaxable || 0);
      const mNetVar = mNetBooks - mNetPortal;

      const mBooksB2b = m.booksB2b?.taxable || 0;
      const mBooksExp = m.booksExport?.taxable || 0;
      const mBooksB2c = m.booksB2c?.taxable || 0;
      const mBooksNil = (m.booksNet.nilRated || 0) + (m.booksNet.nonTaxable || 0);
      const mBooksCn = m.booksCn.taxable;
      const mDetailBooksNet = mBooksB2b + mBooksExp + mBooksB2c + mBooksNil - mBooksCn;

      const mPortalB2b = m.portalB2b.taxable;
      const mPortalExp = m.portalExport.taxable;
      const mPortalB2c = m.portalB2c.taxable;
      const mPortalNil = (m.portalNet.nilRated || 0) + (m.portalNet.nonTaxable || 0);
      const mPortalCn = m.portalCn.taxable;
      const mDetailPortalNet = mPortalB2b + mPortalExp + mPortalB2c + mPortalNil - mPortalCn;

      const mDetailNetVar = mDetailBooksNet - mDetailPortalNet;
      const mDiff = mNetVar - mDetailNetVar;

      const partyMonthSum = pSummaries.filter(p => p.month === m.month);
      const mNetTax = partyMonthSum.reduce((s, r) => s + r.booksNet.taxable, 0);
      const mPNetTax = partyMonthSum.reduce((s, r) => s + r.portalNet.taxable, 0);
      const mNilTax = partyMonthSum.reduce((s, r) => s + r.booksNil.nilRated, 0);
      const mPNilTax = partyMonthSum.reduce((s, r) => s + r.portalNil.nilRated, 0);
      const mNonTax = partyMonthSum.reduce((s, r) => s + r.booksNil.nonTaxable, 0);
      const mPNonTax = partyMonthSum.reduce((s, r) => s + r.portalNil.nonTaxable, 0);

      const pNetBooks = mNetTax + mNilTax + mNonTax;
      const pNetPortal = mPNetTax + mPNilTax + mPNonTax;
      const pNetVar = pNetBooks - pNetPortal;
      const pDiff = mNetVar - pNetVar;

      const pMonthRow = pMonthRowMap ? pMonthRowMap[m.month] : null;
      const pNetVarFormula = pMonthRow ? `Party_Working!Q${pMonthRow}+Party_Working!W${pMonthRow}+Party_Working!Z${pMonthRow}` : undefined;

      const mDashRow = s1Row + 3 + idx;

      aoa.push([
        m.month,
        { t: 'n', v: mNetBooks, f: `Master_Dashboard!B${mDashRow}+Master_Dashboard!F${mDashRow}+Master_Dashboard!G${mDashRow}` },
        { t: 'n', v: mNetPortal, f: `Master_Dashboard!H${mDashRow}+Master_Dashboard!L${mDashRow}+Master_Dashboard!M${mDashRow}` },
        { t: 'n', v: mNetVar, f: `Master_Dashboard!N${mDashRow}+Master_Dashboard!R${mDashRow}+Master_Dashboard!S${mDashRow}` },
        { t: 'n', v: mDetailBooksNet },
        { t: 'n', v: mDetailPortalNet },
        { t: 'n', v: mDetailNetVar, f: `E${curRowExcel}-F${curRowExcel}` },
        { t: 'n', v: mDiff, f: `D${curRowExcel}-G${curRowExcel}` },
        pNetVarFormula ? { t: 'n', v: pNetVar, f: pNetVarFormula } : { t: 'n', v: pNetVar },
        { t: 'n', v: pDiff, f: `D${curRowExcel}-I${curRowExcel}` },
        { t: 's', v: '✓ Balanced (₹0.00)', f: `IF(AND(ABS(H${curRowExcel})<0.01,ABS(J${curRowExcel})<0.01),"✓ Balanced (₹0.00)","❌ Mismatch")` }
      ]);
    });

    const t3EndExcel = t3StartExcel + mSummaries.length - 1;
    const t3GtExcel = t3EndExcel + 1;

    aoa.push([
      'FULL FY TOTAL',
      { t: 'n', v: masterTotalOutwardBooks, f: `SUM(B${t3StartExcel}:B${t3EndExcel})` },
      { t: 'n', v: masterTotalOutwardPortal, f: `SUM(C${t3StartExcel}:C${t3EndExcel})` },
      { t: 'n', v: masterTotalOutwardVar, f: `SUM(D${t3StartExcel}:D${t3EndExcel})` },
      { t: 'n', v: detailTotalOutwardBooks, f: `SUM(E${t3StartExcel}:E${t3EndExcel})` },
      { t: 'n', v: detailTotalOutwardPortal, f: `SUM(F${t3StartExcel}:F${t3EndExcel})` },
      { t: 'n', v: detailTotalOutwardVar, f: `SUM(G${t3StartExcel}:G${t3EndExcel})` },
      { t: 'n', v: 0, f: `SUM(H${t3StartExcel}:H${t3EndExcel})` },
      { t: 'n', v: partyTotalOutwardVar, f: `SUM(I${t3StartExcel}:I${t3EndExcel})` },
      { t: 'n', v: 0, f: `SUM(J${t3StartExcel}:J${t3EndExcel})` },
      { t: 's', v: '✓ 100% TIED OUT (₹0.00)', f: `IF(AND(ABS(H${t3GtExcel})<0.01,ABS(J${t3GtExcel})<0.01),"✓ 100% TIED OUT (₹0.00)","❌ MISMATCH")` }
    ]);

    const wsCross = XLSX.utils.aoa_to_sheet(aoa);
    wsCross['!merges'] = [];
    wsCross['!cols'] = [
      { wch: 36 },
      { wch: 32 },
      { wch: 22 },
      { wch: 22 },
      { wch: 24 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 26 },
      { wch: 20 },
      { wch: 26 }
    ];

    const range = XLSX.utils.decode_range(wsCross['!ref'] || "A1:K30");
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C_idx = range.s.c; C_idx <= range.e.c; C_idx++) {
        const cellRef = XLSX.utils.encode_cell({ c: C_idx, r: R });
        if (!wsCross[cellRef]) wsCross[cellRef] = { t: 's', v: '' };

        const cell = wsCross[cellRef];
        const isHeaderBanner = R === 0 || R === 1;
        const isSuperHeader = R === t1HeaderRow || R === t2HeaderRow || R === t3HeaderRow;
        const isColHeader = R === t1HeaderRow + 1 || R === t2HeaderRow + 1 || R === t3HeaderRow + 1;
        const isAuditDiffRow = (R === 8 || R === 9 || R === diffRow - 1 || R === t3GtExcel - 1);

        if (isHeaderBanner) {
          cell.s = {
            font: { name: 'Segoe UI', bold: true, sz: R === 0 ? 14 : 11, color: { rgb: R === 0 ? 'FFFFFF' : '93C5FD' } },
            fill: { fgColor: { rgb: '0F172A' } },
            alignment: { horizontal: 'left', vertical: 'center' }
          };
        } else if (isSuperHeader) {
          cell.s = {
            font: { name: 'Segoe UI', bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: R === t1HeaderRow ? '1E3A8A' : (R === t2HeaderRow ? '0F766E' : '334155') } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: { top: { style: 'medium', color: { rgb: '0F172A' } }, bottom: { style: 'thin', color: { rgb: '0F172A' } } }
          };
        } else if (isColHeader) {
          cell.s = {
            font: { name: 'Segoe UI', bold: true, sz: 10, color: { rgb: '0F172A' } },
            fill: { fgColor: { rgb: 'E2E8F0' } },
            alignment: { horizontal: C_idx >= 2 ? 'right' : 'left', vertical: 'center' },
            border: { bottom: { style: 'medium', color: { rgb: '0F172A' } } }
          };
        } else if (isAuditDiffRow) {
          const isTieOutSuccess = String(cell.v).includes('✓') || cell.v === 0;
          cell.s = {
            font: { name: 'Segoe UI', bold: true, sz: 10, color: { rgb: isTieOutSuccess ? '166534' : '991B1B' } },
            fill: { fgColor: { rgb: isTieOutSuccess ? 'DCFCE7' : 'FEE2E2' } },
            alignment: { horizontal: typeof cell.v === 'number' || cell.f ? 'right' : 'left' },
            border: { top: { style: 'thin', color: { rgb: '166534' } }, bottom: { style: 'double', color: { rgb: '166534' } } },
            numFmt: typeof cell.v === 'number' || cell.f ? '#,##0.00' : undefined
          };
        } else {
          const isNum = typeof cell.v === 'number' || cell.f;
          cell.s = {
            font: { name: 'Segoe UI', sz: 10, color: { rgb: '334155' } },
            alignment: { horizontal: isNum ? 'right' : 'left' },
            border: { bottom: { style: 'hair', color: { rgb: 'E2E8F0' } } },
            numFmt: isNum ? '#,##0.00' : undefined
          };
        }
      }
    }

    return wsCross;
  };

  const b2bData = buildDetailSheet(b2bResults, '1E3A8A');
  const cnData = buildDetailSheet(cnResults, '0F766E');
  const b2cData = buildB2CDetailSheet();
  const nilData = buildNilDetailSheet();
  const expData = buildDetailSheet(expResults, '0F766E');
  const partySummaryData = buildAnnualPartySummarySheet();

  const wsCrossCheck = buildCrossCheckSheet(
    monthlySummaries,
    sec1EndRow,
    b2bData,
    expData,
    cnData,
    b2cData,
    nilData,
    grandTotalRowIdx,
    grandPartyTotals,
    sec1Row,
    partySummaries,
    partyMonthRowMap,
    partySummaryData
  );

  const wb = XLSX.utils.book_new();
  const wbAny = wb as any;
  if (!wbAny.Workbook) wbAny.Workbook = {};
  if (!wbAny.Workbook.Protect) wbAny.Workbook.Protect = {};
  wbAny.Workbook.Protect.LockStructure = true;
  wbAny.Workbook.Protect.Password = '100rav';

  // Calculate stats for Dashboard
  const totalAnalyzed = b2bResults.length + expResults.length + b2cResults.length + nilResults.length + cnResults.length;
  const netVar = monthlySummaries.reduce((sum, s) => sum + s.variance.taxable, 0);

  const stats = [
    { label: 'Total Records Analysed', value: totalAnalyzed },
    { label: 'Net GST Difference', value: `₹${netVar.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ];

  const breakdown = [
    { label: 'B2B Variances', value: b2bResults.filter(r => (r as any).status !== 'Matched').length },
    { label: 'Export Variances', value: expResults.filter(r => (r as any).status !== 'Matched').length },
    { label: 'B2C Variances', value: b2cResults.filter(r => (r as any).status !== 'Matched').length },
    { label: 'Credit Note Variances', value: cnResults.filter(r => (r as any).status !== 'Matched').length }
  ];

  const tabs = [
    { name: '🏠 Home', target: 'Dashboard' },
    { name: '📊 Summary', target: 'Executive Summary' },
    { name: '📅 Master Matrix', target: 'Master_Dashboard' },
    { name: '🏢 Party Summary', target: 'Party_Summary' },
    { name: '🏢 Party Working', target: 'Party_Working' },
    { name: '⚖️ Cross Check', target: 'Cross_Check_Summary' },
    { name: '📁 B2B Details', target: 'B2B_Details' },
    { name: '📁 Export Details', target: 'Export_Details' },
    { name: '📁 CN Details', target: 'CN_Details' },
    { name: '📁 B2C Details', target: 'B2C_Details' },
    { name: '📁 Nil Rated Details', target: 'Nil_Rated_Details' }
  ];

  appendExecutiveSummary(wb, "VASWANI RETURN ENTERPRISE", 'GST RECONCILIATION DASHBOARD', stats, breakdown, tabs);

  XLSX.utils.book_append_sheet(wb, wsMaster, 'Master_Dashboard');
  XLSX.utils.book_append_sheet(wb, partySummaryData.ws, 'Party_Summary');
  XLSX.utils.book_append_sheet(wb, wsParty, 'Party_Working');
  XLSX.utils.book_append_sheet(wb, wsCrossCheck, 'Cross_Check_Summary');
  XLSX.utils.book_append_sheet(wb, b2bData.ws, 'B2B_Details');
  XLSX.utils.book_append_sheet(wb, expData.ws, 'Export_Details');
  XLSX.utils.book_append_sheet(wb, cnData.ws, 'CN_Details');
  XLSX.utils.book_append_sheet(wb, b2cData.ws, 'B2C_Details');
  XLSX.utils.book_append_sheet(wb, nilData.ws, 'Nil_Rated_Details');

  removeAllMergesFromWorkbook(wb);

  const excelBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

  const masterBooksNet = monthlySummaries.reduce((sum, s) => sum + s.booksNet.taxable + s.booksNet.nilRated + s.booksNet.nonTaxable, 0);
  const masterPortalNet = monthlySummaries.reduce((sum, s) => sum + s.portalNet.taxable + s.portalNet.nilRated + s.portalNet.nonTaxable, 0);
  const masterNetVar = masterBooksNet - masterPortalNet;

  const detailBooksNet = b2bData.totals.taxableBooks + expData.totals.taxableBooks + b2cData.totals.taxableBooks + nilData.totals.nilBooks + nilData.totals.nonTaxBooks - cnData.totals.taxableBooks;
  const detailPortalNet = b2bData.totals.taxablePortal + expData.totals.taxablePortal + b2cData.totals.taxablePortal + nilData.totals.nilPortal + nilData.totals.nonTaxPortal - cnData.totals.taxablePortal;
  const detailNetVar = detailBooksNet - detailPortalNet;

  const diff = masterNetVar - detailNetVar;

  return {
    buffer: new Uint8Array(excelBuffer),
    b2bResults,
    expResults,
    cnResults,
    b2cResults,
    nilResults,
    monthlySummaries,
    partySummaries,
    crossCheckTotals: {
      masterBooksNet,
      masterPortalNet,
      masterNetVar,
      detailBooksNet,
      detailPortalNet,
      detailNetVar,
      difference: diff,
      isBalanced: Math.abs(diff) < 0.01
    }
  };
}