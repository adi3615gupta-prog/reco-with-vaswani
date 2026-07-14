import * as XLSX from 'xlsx-js-style';
import { appendExecutiveSummary } from './fileParser';

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

/**
 * Standardizes diverse date/month formats to 'MMM-YY' (e.g., 'Apr-23').
 */
function parseMonth(val: any, dateFallback?: any, globalYear?: string): string {
  let strVal = val ? String(val).trim() : '';
  if (!strVal || strVal.toLowerCase() === 'unknown') {
    if (dateFallback) {
      strVal = String(dateFallback).trim();
    } else {
      return 'Unknown';
    }
  }
  let str = strVal.toLowerCase();

  // If Excel serial date
  if (/^\d{5}$/.test(str)) {
    const serial = parseInt(str, 10);
    const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      const m = d.toLocaleString('default', { month: 'short' });
      // Return ONLY the 3-letter month (e.g. "Apr") to match the FY_MONTH_ORDER
      return m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
    }
  }

  let fallbackYear = '';
  if (dateFallback) {
    const dStr = String(dateFallback).trim();
    const yMatch4 = dStr.match(/\d{4}/);
    const yMatch2 = dStr.match(/[-/](\d{2})$/);
    if (yMatch4) fallbackYear = yMatch4[0].slice(-2);
    else if (yMatch2) fallbackYear = yMatch2[1];
  }

  // Validate fallback year (GST started in 2017)
  if (fallbackYear) {
    const fNum = parseInt(fallbackYear, 10);
    if (isNaN(fNum) || fNum < 17 || fNum > 35) {
      fallbackYear = '';
    }
  }

  let monthPart = str;
  let yearPart = '';

  // Match full dates DD-MMM-YYYY or DD/MM/YYYY
  const fullDate1 = str.match(/^(\d{1,2})[-/.\s]([a-z]+|\d{1,2})[-/.\s](\d{2,4})$/);
  const fullDate2 = str.match(/^(\d{4})[-/.\s]([a-z]+|\d{1,2})[-/.\s](\d{1,2})$/);

  if (fullDate1) {
    monthPart = fullDate1[2];
    yearPart = fullDate1[3];
  } else if (fullDate2) {
    yearPart = fullDate2[1];
    monthPart = fullDate2[2];
  } else {
    // Match Month-Year like Oct-23, 10-2023, 10/23
    const match = str.match(/^([a-z]+|\d{1,2})[-/.\s,]+(\d{2,4})$/);
    if (match) {
      monthPart = match[1];
      yearPart = match[2];
      if (yearPart.length === 4) yearPart = yearPart.slice(-2);

      const yNum = parseInt(yearPart, 10);
      // If the extracted "year" is < 17 or > 35, it's definitely a DAY, not a year.
      if (!isNaN(yNum) && (yNum < 17 || yNum > 35)) {
        yearPart = ''; // Discard the fake year (it's a day)
      }
    } else if (/^\d{6}$/.test(str)) {
      monthPart = str.slice(0, 2);
      yearPart = str.slice(2, 4); // Only take last 2 digits of YYYY
    }
  }

  if (yearPart.length === 4) yearPart = yearPart.slice(-2);

  // Normalize month name
  const normalizedMonth = MONTH_MAP[monthPart] || MONTH_MAP[monthPart.slice(0, 3)] || monthPart;

  // Return ONLY the 3-letter Capitalized month (e.g. "Apr", "Aug")
  // because we are compiling exactly 12 months for the FY (April to March)
  const finalMonth = normalizedMonth.charAt(0).toUpperCase() + normalizedMonth.slice(1).toLowerCase();

  // Ensure it's max 3 letters for standard months to avoid "August" vs "Aug"
  if (finalMonth.length > 3 && MONTH_MAP[finalMonth.toLowerCase()]) {
    const mapped = MONTH_MAP[finalMonth.toLowerCase()];
    return mapped.charAt(0).toUpperCase() + mapped.slice(1).toLowerCase();
  }

  return finalMonth.slice(0, 3);
}

export function sanitizeData(rows: RawDataRow[], globalYear?: string): CleanedRow[] {
  return rows.map(row => ({
    invoiceNo: parseString(row['Invoice No.'] || row['Note No.'] || row['Invoice No'] || row['Note No'], true),
    invoiceDate: parseString(row['Invoice Date'] || row['Note Date']),
    month: parseMonth(row['Month'] || row['Return Period'], row['Invoice Date'] || row['Note Date'], globalYear),
    party: parseString(row['Party'] || row['Receiver Name']),
    gstNo: parseString(row['GST No.'] || row['GSTIN'], true).toUpperCase(),
    taxable: parseNumber(row['Taxable'] || row['Taxable Value']),
    nilRated: parseNumber(row['Nil Rated'] || row['Nil Rated Supplies']),
    nonTaxable: parseNumber(row['Non Taxable'] || row['Non-GST'] || row['Non-GST Supplies'] || row['Exempted'] || row['Exempted Supplies'] || row['Exempt'] || row['Non-GST Outward Supplies'] || row['Non GST Outward Supplies']),
    cgst: parseNumber(row['CGST']),
    sgst: parseNumber(row['SGST']),
    igst: parseNumber(row['IGST']),
    total: parseNumber(row['Total'] || row['Invoice Value']),
    pos: parseString(row['POS']),
    voucherType: parseString(row['Voucher Type'] || row['Voucher Type Name'] || row['Vch Type'])
  }));
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

function matchLineLevel(books: CleanedRow[], portal: CleanedRow[]): VarianceResult[] {
  const results: VarianceResult[] = [];
  const portalMap = new Map<string, CleanedRow>();

  // Index portal data by composite key
  portal.forEach(p => {
    const key = `${p.gstNo}_${p.invoiceNo}`.toUpperCase();
    portalMap.set(key, p);
  });

  // Match Books against Portal
  books.forEach(b => {
    const key = `${b.gstNo}_${b.invoiceNo}`.toUpperCase();
    const pMatch = portalMap.get(key);

    if (pMatch) {
      const taxVar = Math.abs(b.taxable - pMatch.taxable);
      const cgstVar = Math.abs(b.cgst - pMatch.cgst);
      const sgstVar = Math.abs(b.sgst - pMatch.sgst);
      const igstVar = Math.abs(b.igst - pMatch.igst);

      const isMismatch = taxVar > 2 || cgstVar > 2 || sgstVar > 2 || igstVar > 2;

      results.push({
        'Match Status': isMismatch ? 'Value Mismatch' : 'Perfect Match',
        'Month': b.month,
        'Invoice Date': b.invoiceDate,
        'GST No': b.gstNo,
        'Invoice/Note No': b.invoiceNo,
        'Party Name': b.party,
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
      portalMap.delete(key); // Remove matched record
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
  portalMap.forEach(p => {
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
        acc[key] = { month: row.month, rate, taxable: 0, tax: 0 };
      }
      acc[key].taxable += isB2C ? row.taxable : row.nilRated;
      acc[key].tax += (row.cgst + row.sgst + row.igst);
      return acc;
    }, {} as Record<string, { month: string; rate: string | number; taxable: number; tax: number }>);
  };

  const booksAgg = aggregateData(books);
  const portalAgg = aggregateData(portal);

  const allKeys = Array.from(new Set([...Object.keys(booksAgg), ...Object.keys(portalAgg)]));
  const results: BlockVarianceResult[] = [];

  allKeys.forEach(key => {
    const bVal = booksAgg[key] || { month: '', rate: '', taxable: 0, tax: 0 };
    const pVal = portalAgg[key] || { month: '', rate: '', taxable: 0, tax: 0 };

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

  // 2. Segregate Books Data
  const { b2bBooks, b2cBooks, b2clBooks, nilBooks, expBooks } = segregateBooks(cleanBooksSales);

  // 3. Execute Matches (portalCN has CN & DN, treated as unified returns block)
  const b2bResults = matchLineLevel([...b2bBooks, ...b2clBooks], [...cleanPortalB2B, ...cleanPortalB2CL]);
  const expResults = matchLineLevel(expBooks, cleanPortalExport);
  const cnResults = matchLineLevel(cleanBooksCreditNotes, cleanPortalCN);
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

    const bSales = calcBreakdown([b2bBooks, b2cBooks, b2clBooks, nilBooks, expBooks]);
    const bCn = calcBreakdown([cleanBooksCreditNotes]);

    // Net Books is: Sales - CN
    const bNet: TaxBreakdown = {
      taxable: bSales.taxable - bCn.taxable,
      igst: bSales.igst - bCn.igst,
      cgst: bSales.cgst - bCn.cgst,
      sgst: bSales.sgst - bCn.sgst,
      nilRated: bSales.nilRated - bCn.nilRated,
      nonTaxable: bSales.nonTaxable - bCn.nonTaxable,
    };

    const pB2b = calcBreakdown([cleanPortalB2B]);
    const pExport = calcBreakdown([cleanPortalExport]);
    const pB2c = calcBreakdown([cleanPortalB2C, cleanPortalB2CL]);
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
    if (!row.gstNo || row.gstNo.length < 10) return;
    const key = row.gstNo;

    if (!partyMap[row.month]) partyMap[row.month] = {};
    if (!partyMap[row.month][key]) {
      partyMap[row.month][key] = { bB2b: [], pB2b: [], bExport: [], pExport: [], bCn: [], pCn: [], bB2c: [], pB2c: [], bNil: [], pNil: [], bName: '', pName: '', bGst: '', pGst: '' };
    }

    partyMap[row.month][key][type].push(row);

    if (type.startsWith('b')) {
      if (row.party && !partyMap[row.month][key].bName) partyMap[row.month][key].bName = row.party;
      if (row.gstNo && !partyMap[row.month][key].bGst) partyMap[row.month][key].bGst = row.gstNo;
    } else {
      if (row.party && !partyMap[row.month][key].pName) partyMap[row.month][key].pName = row.party;
      if (row.gstNo && !partyMap[row.month][key].pGst) partyMap[row.month][key].pGst = row.gstNo;
    }
  };

  b2bBooks.forEach(r => addPartyRow(r, 'bB2b'));
  cleanPortalB2B.forEach(r => addPartyRow(r, 'pB2b'));
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
          b2bSums.bNilTaxable += booksNil.taxable; b2bSums.bNilIgst += booksNil.igst; b2bSums.bNilCgst += booksNil.cgst; b2bSums.bNilSgst += booksNil.sgst; b2bSums.bNilNil += booksNil.nilRated; b2bSums.bNilNonTaxable += booksNil.nonTaxable;
          b2bSums.pNilTaxable += portalNil.taxable; b2bSums.pNilIgst += portalNil.igst; b2bSums.pNilCgst += portalNil.cgst; b2bSums.pNilSgst += portalNil.sgst; b2bSums.pNilNil += portalNil.nilRated; b2bSums.pNilNonTaxable += portalNil.nonTaxable;

          const booksNet: TaxBreakdown = {
            taxable: booksB2b.taxable + booksExport.taxable + booksB2c.taxable + booksNil.taxable - booksCn.taxable,
            igst: booksB2b.igst + booksExport.igst + booksB2c.igst + booksNil.igst - booksCn.igst,
            cgst: booksB2b.cgst + booksExport.cgst + booksB2c.cgst + booksNil.cgst - booksCn.cgst,
            sgst: booksB2b.sgst + booksExport.sgst + booksB2c.sgst + booksNil.sgst - booksCn.sgst,
            nilRated: booksB2b.nilRated + booksExport.nilRated + booksB2c.nilRated + booksNil.nilRated - booksCn.nilRated,
            nonTaxable: booksB2b.nonTaxable + booksExport.nonTaxable + booksB2c.nonTaxable + booksNil.nonTaxable - booksCn.nonTaxable,
          };
          const portalNet: TaxBreakdown = {
            taxable: portalB2b.taxable + portalExport.taxable + portalB2c.taxable + portalNil.taxable - portalCn.taxable,
            igst: portalB2b.igst + portalExport.igst + portalB2c.igst + portalNil.igst - portalCn.igst,
            cgst: portalB2b.cgst + portalExport.cgst + portalB2c.cgst + portalNil.cgst - portalCn.cgst,
            sgst: portalB2b.sgst + portalExport.sgst + portalB2c.sgst + portalNil.sgst - portalCn.sgst,
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
        const booksB2b: TaxBreakdown = {
          taxable: monthSum.booksSales.taxable - b2bSums.bB2bTaxable - b2bSums.bExportTaxable,
          igst: monthSum.booksSales.igst - b2bSums.bB2bIgst - b2bSums.bExportIgst,
          cgst: monthSum.booksSales.cgst - b2bSums.bB2bCgst - b2bSums.bExportCgst,
          sgst: monthSum.booksSales.sgst - b2bSums.bB2bSgst - b2bSums.bExportSgst,
          nilRated: monthSum.booksSales.nilRated - b2bSums.bB2bNil - b2bSums.bExportNil,
          nonTaxable: monthSum.booksSales.nonTaxable - b2bSums.bB2bNonTaxable - b2bSums.bExportNonTaxable,
        };
        const portalB2b: TaxBreakdown = {
          taxable: (monthSum.portalB2b.taxable - b2bSums.pB2bTaxable) + (monthSum.portalExport.taxable - b2bSums.pExportTaxable) + monthSum.portalB2c.taxable + monthSum.portalNil.taxable,
          igst: (monthSum.portalB2b.igst - b2bSums.pB2bIgst) + (monthSum.portalExport.igst - b2bSums.pExportIgst) + monthSum.portalB2c.igst + monthSum.portalNil.igst,
          cgst: (monthSum.portalB2b.cgst - b2bSums.pB2bCgst) + (monthSum.portalExport.cgst - b2bSums.pExportCgst) + monthSum.portalB2c.cgst + monthSum.portalNil.cgst,
          sgst: (monthSum.portalB2b.sgst - b2bSums.pB2bSgst) + (monthSum.portalExport.sgst - b2bSums.pExportSgst) + monthSum.portalB2c.sgst + monthSum.portalNil.sgst,
          nilRated: (monthSum.portalB2b.nilRated - b2bSums.pB2bNil) + (monthSum.portalExport.nilRated - b2bSums.pExportNil) + monthSum.portalB2c.nilRated + monthSum.portalNil.nilRated,
          nonTaxable: (monthSum.portalB2b.nonTaxable - b2bSums.pB2bNonTaxable) + (monthSum.portalExport.nonTaxable - b2bSums.pExportNonTaxable) + monthSum.portalB2c.nonTaxable + monthSum.portalNil.nonTaxable,
        };
        const booksCn: TaxBreakdown = {
          taxable: monthSum.booksCn.taxable - b2bSums.bCnTaxable,
          igst: monthSum.booksCn.igst - b2bSums.bCnIgst,
          cgst: monthSum.booksCn.cgst - b2bSums.bCnCgst,
          sgst: monthSum.booksCn.sgst - b2bSums.bCnSgst,
          nilRated: monthSum.booksCn.nilRated - b2bSums.bCnNil,
          nonTaxable: monthSum.booksCn.nonTaxable - b2bSums.bCnNonTaxable,
        };
        const portalCn: TaxBreakdown = {
          taxable: monthSum.portalCn.taxable - b2bSums.pCnTaxable,
          igst: monthSum.portalCn.igst - b2bSums.pCnIgst,
          cgst: monthSum.portalCn.cgst - b2bSums.pCnCgst,
          sgst: monthSum.portalCn.sgst - b2bSums.pCnSgst,
          nilRated: monthSum.portalCn.nilRated - b2bSums.pCnNil,
          nonTaxable: monthSum.portalCn.nonTaxable - b2bSums.pCnNonTaxable,
        };
        const booksDn: TaxBreakdown = { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 };
        const portalDn: TaxBreakdown = { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 };
        const booksB2c: TaxBreakdown = { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 };
        const portalB2c: TaxBreakdown = { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 };
        const booksNil: TaxBreakdown = { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 };
        const portalNil: TaxBreakdown = { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 };

        if (Object.values(booksB2b).some(v => v !== 0) || Object.values(portalB2b).some(v => v !== 0) || Object.values(booksCn).some(v => v !== 0) || Object.values(portalCn).some(v => v !== 0)) {
          const booksNet: TaxBreakdown = {
            taxable: booksB2b.taxable + booksB2c.taxable + booksNil.taxable - booksCn.taxable - booksDn.taxable,
            igst: booksB2b.igst + booksB2c.igst + booksNil.igst - booksCn.igst - booksDn.igst,
            cgst: booksB2b.cgst + booksB2c.cgst + booksNil.cgst - booksCn.cgst - booksDn.cgst,
            sgst: booksB2b.sgst + booksB2c.sgst + booksNil.sgst - booksCn.sgst - booksDn.sgst,
            nilRated: booksB2b.nilRated + booksB2c.nilRated + booksNil.nilRated - booksCn.nilRated - booksDn.nilRated,
            nonTaxable: booksB2b.nonTaxable + booksB2c.nonTaxable + booksNil.nonTaxable - booksCn.nonTaxable - booksDn.nonTaxable,
          };
          const portalNet: TaxBreakdown = {
            taxable: portalB2b.taxable + portalB2c.taxable + portalNil.taxable - portalCn.taxable - portalDn.taxable,
            igst: portalB2b.igst + portalB2c.igst + portalNil.igst - portalCn.igst - portalDn.igst,
            cgst: portalB2b.cgst + portalB2c.cgst + portalNil.cgst - portalCn.cgst - portalDn.cgst,
            sgst: portalB2b.sgst + portalB2c.sgst + portalNil.sgst - portalCn.sgst - portalDn.sgst,
            nilRated: portalB2b.nilRated + portalB2c.nilRated + portalNil.nilRated - portalCn.nilRated - portalDn.nilRated,
            nonTaxable: portalB2b.nonTaxable + portalB2c.nonTaxable + portalNil.nonTaxable - portalCn.nonTaxable - portalDn.nonTaxable,
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
      { t: 'n', f: `B${rowNum}-H${rowNum}` },
      { t: 'n', f: `C${rowNum}-I${rowNum}` },
      { t: 'n', f: `D${rowNum}-J${rowNum}` },
      { t: 'n', f: `E${rowNum}-K${rowNum}` },
      { t: 'n', f: `F${rowNum}-L${rowNum}` },
      { t: 'n', f: `G${rowNum}-M${rowNum}` }
    ]);
  });
  const sec1TotalRow: any[] = ['TOTAL'];
  for (let c = 1; c <= 18; c++) sec1TotalRow.push({ t: 'n', f: `SUM(${C(c)}${sec1Row + 3}:${C(c)}${sec1Row + 2 + monthlySummaries.length})` });
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
      { t: 'n', f: `B${rowNum}-H${rowNum}` },
      { t: 'n', f: `C${rowNum}-I${rowNum}` },
      { t: 'n', f: `D${rowNum}-J${rowNum}` },
      { t: 'n', f: `E${rowNum}-K${rowNum}` },
      { t: 'n', f: `F${rowNum}-L${rowNum}` },
      { t: 'n', f: `G${rowNum}-M${rowNum}` }
    ]);
  });
  const sec2TotalRow: any[] = ['TOTAL'];
  for (let c = 1; c <= 18; c++) sec2TotalRow.push({ t: 'n', f: `SUM(${C(c)}${sec2Row + 3}:${C(c)}${sec2Row + 2 + monthlySummaries.length})` });
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
      { t: 'n', f: `B${rowNum}+H${rowNum}+N${rowNum}+T${rowNum}-Z${rowNum}` },
      { t: 'n', f: `C${rowNum}+I${rowNum}+O${rowNum}+U${rowNum}-AA${rowNum}` },
      { t: 'n', f: `D${rowNum}+J${rowNum}+P${rowNum}+V${rowNum}-AB${rowNum}` },
      { t: 'n', f: `E${rowNum}+K${rowNum}+Q${rowNum}+W${rowNum}-AC${rowNum}` },
      { t: 'n', f: `F${rowNum}+L${rowNum}+R${rowNum}+X${rowNum}-AD${rowNum}` },
      { t: 'n', f: `G${rowNum}+M${rowNum}+S${rowNum}+Y${rowNum}-AE${rowNum}` }
    ]);
  });
  const sec3TotalRow: any[] = ['TOTAL'];
  for (let c = 1; c <= 36; c++) sec3TotalRow.push({ t: 'n', f: `SUM(${C(c)}${sec3Row + 3}:${C(c)}${sec3Row + 2 + monthlySummaries.length})` });
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
      { t: 'n', f: `B${rowNum}-B${bRow}` }, { t: 'n', f: `C${rowNum}-C${bRow}` }, { t: 'n', f: `D${rowNum}-D${bRow}` }, { t: 'n', f: `E${rowNum}-E${bRow}` }, { t: 'n', f: `F${rowNum}-F${bRow}` }, { t: 'n', f: `G${rowNum}-G${bRow}` },
      { t: 'n', f: `B${rowNum}-H${pRow}` }, { t: 'n', f: `C${rowNum}-I${pRow}` }, { t: 'n', f: `D${rowNum}-J${pRow}` }, { t: 'n', f: `E${rowNum}-J${pRow}` }, { t: 'n', f: `F${rowNum}-K${pRow}` }, { t: 'n', f: `G${rowNum}-L${pRow}` }
    ]);
  });

  const sec4TotalRow: any[] = ['TOTAL'];
  for (let c = 1; c <= 18; c++) sec4TotalRow.push({ t: 'n', f: `SUM(${C(c)}${sec4Row + 3}:${C(c)}${sec4Row + 2 + monthlySummaries.length})` });
  if (monthlySummaries.length > 0) masterAoA.push(sec4TotalRow);
  const sec4EndRow = masterAoA.length - 1;

  const wsMaster = XLSX.utils.aoa_to_sheet(masterAoA);
  wsMaster['!merges'] = merges;

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
      if (isSec3) fgColorHeader = '0F766E';
      if (isSec4) fgColorHeader = '334155';
      if (isSec1 && C_idx >= 11) fgColorHeader = '334155';

      if (isHeader1) {
        wsMaster[cellRef].s = {
          font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
          fill: { fgColor: { rgb: fgColorHeader } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: { top: { style: 'medium', color: { rgb: '0F172A' } }, bottom: { style: 'medium', color: { rgb: '0F172A' } }, left: { style: 'thin', color: { rgb: '334155' } }, right: { style: 'thin', color: { rgb: '334155' } } }
        };
      } else if (isHeader2) {
        wsMaster[cellRef].s = {
          font: { name: 'Segoe UI', bold: true, color: { rgb: '1F2937' }, sz: 10 },
          fill: { fgColor: { rgb: 'F1F5F9' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: { bottom: { style: 'medium', color: { rgb: '0F172A' } }, left: { style: 'hair', color: { rgb: 'CBD5E1' } }, right: { style: 'hair', color: { rgb: 'CBD5E1' } } }
        };
      } else if (isTotal) {
        wsMaster[cellRef].s = {
          font: { name: 'Segoe UI', bold: true, color: { rgb: '1F2937' }, sz: 10 },
          fill: { fgColor: { rgb: 'F8FAFC' } },
          alignment: { horizontal: C_idx > 0 ? 'right' : 'left' },
          border: { top: { style: 'medium', color: { rgb: '0F172A' } }, bottom: { style: 'double', color: { rgb: '0F172A' } } },
          numFmt: C_idx > 0 ? '#,##0.00' : undefined
        };
      } else {
        wsMaster[cellRef].s = {
          font: { name: 'Segoe UI', sz: 10, color: { rgb: isSec4 ? '0F172A' : '334155' }, bold: isSec4 },
          fill: { fgColor: { rgb: isSec4 ? 'F8FAFC' : 'FFFFFF' } },
          alignment: { horizontal: C_idx > 0 ? 'right' : 'left' },
          border: { bottom: { style: 'hair', color: { rgb: 'CBD5E1' } }, right: { style: 'hair', color: { rgb: 'E2E8F0' } } },
          numFmt: C_idx > 0 ? '#,##0.00' : undefined
        };
      }
    }
  }
  wsMaster['!cols'] = [{ wch: 12 }];
  for (let i = 1; i <= 37; i++) wsMaster['!cols'].push({ wch: 15 });

  // Create Party Working Sheet
  const partyAoA: any[][] = [];
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
  partyAoA.push(partyHeaders);

  const partyRowsConfig: any[] = [];
  const months = Array.from(new Set(partySummaries.map(s => s.month)));

  months.forEach(m => {
    const monthRows = partySummaries.filter(s => s.month === m);
    const monthStartRow = partyAoA.length;
    const firstChildIdx = monthStartRow + 2;
    const lastChildIdx = monthStartRow + 1 + monthRows.length;
    const monthStartRowIdx = monthStartRow + 1;

    partyAoA.push([
      m, 'MONTH TOTAL', '', '', '',
      { t: 'n', f: `SUM(F${firstChildIdx}:F${lastChildIdx})` },
      { t: 'n', f: `SUM(G${firstChildIdx}:G${lastChildIdx})` },
      { t: 'n', f: `F${monthStartRowIdx}-G${monthStartRowIdx}` },

      { t: 'n', f: `SUM(I${firstChildIdx}:I${lastChildIdx})` },
      { t: 'n', f: `SUM(J${firstChildIdx}:J${lastChildIdx})` },
      { t: 'n', f: `I${monthStartRowIdx}-J${monthStartRowIdx}` },

      { t: 'n', f: `SUM(L${firstChildIdx}:L${lastChildIdx})` },
      { t: 'n', f: `SUM(M${firstChildIdx}:M${lastChildIdx})` },
      { t: 'n', f: `L${monthStartRowIdx}-M${monthStartRowIdx}` },

      { t: 'n', f: `F${monthStartRowIdx}+I${monthStartRowIdx}+R${monthStartRowIdx}+U${monthStartRowIdx}+X${monthStartRowIdx}-L${monthStartRowIdx}` },
      { t: 'n', f: `G${monthStartRowIdx}+J${monthStartRowIdx}+S${monthStartRowIdx}+V${monthStartRowIdx}+Y${monthStartRowIdx}-M${monthStartRowIdx}` },
      { t: 'n', f: `O${monthStartRowIdx}-P${monthStartRowIdx}` },

      { t: 'n', f: `SUM(R${firstChildIdx}:R${lastChildIdx})` },
      { t: 'n', f: `SUM(S${firstChildIdx}:S${lastChildIdx})` },
      { t: 'n', f: `R${monthStartRowIdx}-S${monthStartRowIdx}` },

      { t: 'n', f: `SUM(U${firstChildIdx}:U${lastChildIdx})` },
      { t: 'n', f: `SUM(V${firstChildIdx}:V${lastChildIdx})` },
      { t: 'n', f: `U${monthStartRowIdx}-V${monthStartRowIdx}` },

      { t: 'n', f: `SUM(X${firstChildIdx}:X${lastChildIdx})` },
      { t: 'n', f: `SUM(Y${firstChildIdx}:Y${lastChildIdx})` },
      { t: 'n', f: `X${monthStartRowIdx}-Y${monthStartRowIdx}` },

      { t: 'n', f: `SUM(AA${firstChildIdx}:AA${lastChildIdx})` },
      { t: 'n', f: `SUM(AB${firstChildIdx}:AB${lastChildIdx})` },
      { t: 'n', f: `AA${monthStartRowIdx}-AB${monthStartRowIdx}` },

      { t: 'n', f: `SUM(AD${firstChildIdx}:AD${lastChildIdx})` },
      { t: 'n', f: `SUM(AE${firstChildIdx}:AE${lastChildIdx})` },
      { t: 'n', f: `AD${monthStartRowIdx}-AE${monthStartRowIdx}` },

      { t: 'n', f: `SUM(AG${firstChildIdx}:AG${lastChildIdx})` },
      { t: 'n', f: `SUM(AH${firstChildIdx}:AH${lastChildIdx})` },
      { t: 'n', f: `AG${monthStartRowIdx}-AH${monthStartRowIdx}` }
    ]);
    partyRowsConfig.push({ level: 0 });

    monthRows.forEach(s => {
      const rIdx = partyAoA.length + 1;
      partyAoA.push([
        s.month, s.booksPartyName, s.portalPartyName, s.booksGstNo, s.portalGstNo,
        // B2B
        { t: 'n', f: `SUMIFS(B2B_Details!G:G, B2B_Details!D:D, D${rIdx}, B2B_Details!B:B, A${rIdx})` },
        { t: 'n', f: `SUMIFS(B2B_Details!H:H, B2B_Details!D:D, D${rIdx}, B2B_Details!B:B, A${rIdx})` },
        { t: 'n', f: `F${rIdx}-G${rIdx}` },
        // Export
        { t: 'n', f: `SUMIFS(Export_Details!G:G, Export_Details!D:D, D${rIdx}, Export_Details!B:B, A${rIdx})` },
        { t: 'n', f: `SUMIFS(Export_Details!H:H, Export_Details!D:D, D${rIdx}, Export_Details!B:B, A${rIdx})` },
        { t: 'n', f: `I${rIdx}-J${rIdx}` },
        // CN
        { t: 'n', f: `SUMIFS(CN_Details!G:G, CN_Details!D:D, D${rIdx}, CN_Details!B:B, A${rIdx})` },
        { t: 'n', f: `SUMIFS(CN_Details!H:H, CN_Details!D:D, D${rIdx}, CN_Details!B:B, A${rIdx})` },
        { t: 'n', f: `L${rIdx}-M${rIdx}` },
        // Net
        { t: 'n', f: `F${rIdx}+I${rIdx}+R${rIdx}+U${rIdx}+X${rIdx}-L${rIdx}` },
        { t: 'n', f: `G${rIdx}+J${rIdx}+S${rIdx}+V${rIdx}+Y${rIdx}-M${rIdx}` },
        { t: 'n', f: `O${rIdx}-P${rIdx}` },
        // B2C
        { t: 'n', f: `SUMIFS(B2C_Details!I:I, B2C_Details!C:C, D${rIdx}, B2C_Details!B:B, A${rIdx})` },
        { t: 'n', f: `SUMIFS(B2C_Details!J:J, B2C_Details!C:C, D${rIdx}, B2C_Details!B:B, A${rIdx})` },
        { t: 'n', f: `R${rIdx}-S${rIdx}` },
        // Nil
        { t: 'n', f: `SUMIFS(Nil_Rated_Details!E:E, Nil_Rated_Details!C:C, D${rIdx}, Nil_Rated_Details!B:B, A${rIdx})` },
        { t: 'n', f: `SUMIFS(Nil_Rated_Details!G:G, Nil_Rated_Details!C:C, D${rIdx}, Nil_Rated_Details!B:B, A${rIdx})` },
        { t: 'n', f: `U${rIdx}-V${rIdx}` },
        // Non Taxable
        { t: 'n', f: `SUMIFS(Nil_Rated_Details!F:F, Nil_Rated_Details!C:C, D${rIdx}, Nil_Rated_Details!B:B, A${rIdx})` },
        { t: 'n', f: `SUMIFS(Nil_Rated_Details!H:H, Nil_Rated_Details!C:C, D${rIdx}, Nil_Rated_Details!B:B, A${rIdx})` },
        { t: 'n', f: `X${rIdx}-Y${rIdx}` },
        // IGST
        { t: 'n', f: `SUMIFS(B2B_Details!J:J, B2B_Details!D:D, D${rIdx}, B2B_Details!B:B, A${rIdx}) + SUMIFS(Export_Details!J:J, Export_Details!D:D, D${rIdx}, Export_Details!B:B, A${rIdx}) + SUMIFS(B2C_Details!L:L, B2C_Details!C:C, D${rIdx}, B2C_Details!B:B, A${rIdx}) - SUMIFS(CN_Details!J:J, CN_Details!D:D, D${rIdx}, CN_Details!B:B, A${rIdx})` },
        { t: 'n', f: `SUMIFS(B2B_Details!K:K, B2B_Details!D:D, D${rIdx}, B2B_Details!B:B, A${rIdx}) + SUMIFS(Export_Details!K:K, Export_Details!D:D, D${rIdx}, Export_Details!B:B, A${rIdx}) + SUMIFS(B2C_Details!M:M, B2C_Details!C:C, D${rIdx}, B2C_Details!B:B, A${rIdx}) - SUMIFS(CN_Details!K:K, CN_Details!D:D, D${rIdx}, CN_Details!B:B, A${rIdx})` },
        { t: 'n', f: `AA${rIdx}-AB${rIdx}` },
        // CGST
        { t: 'n', f: `SUMIFS(B2B_Details!M:M, B2B_Details!D:D, D${rIdx}, B2B_Details!B:B, A${rIdx}) + SUMIFS(B2C_Details!O:O, B2C_Details!C:C, D${rIdx}, B2C_Details!B:B, A${rIdx}) - SUMIFS(CN_Details!M:M, CN_Details!D:D, D${rIdx}, CN_Details!B:B, A${rIdx})` },
        { t: 'n', f: `SUMIFS(B2B_Details!N:N, B2B_Details!D:D, D${rIdx}, B2B_Details!B:B, A${rIdx}) + SUMIFS(B2C_Details!P:P, B2C_Details!C:C, D${rIdx}, B2C_Details!B:B, A${rIdx}) - SUMIFS(CN_Details!N:N, CN_Details!D:D, D${rIdx}, CN_Details!B:B, A${rIdx})` },
        { t: 'n', f: `AD${rIdx}-AE${rIdx}` },
        // SGST
        { t: 'n', f: `SUMIFS(B2B_Details!P:P, B2B_Details!D:D, D${rIdx}, B2B_Details!B:B, A${rIdx}) + SUMIFS(B2C_Details!R:R, B2C_Details!C:C, D${rIdx}, B2C_Details!B:B, A${rIdx}) - SUMIFS(CN_Details!P:P, CN_Details!D:D, D${rIdx}, CN_Details!B:B, A${rIdx})` },
        { t: 'n', f: `SUMIFS(B2B_Details!Q:Q, B2B_Details!D:D, D${rIdx}, B2B_Details!B:B, A${rIdx}) + SUMIFS(B2C_Details!S:S, B2C_Details!C:C, D${rIdx}, B2C_Details!B:B, A${rIdx}) - SUMIFS(CN_Details!Q:Q, CN_Details!D:D, D${rIdx}, CN_Details!B:B, A${rIdx})` },
        { t: 'n', f: `AG${rIdx}-AH${rIdx}` }
      ]);
      partyRowsConfig.push({ level: 1, hidden: true });
    });
  });

  const grandTotalRowIdx = partyAoA.length + 1;
  partyAoA.push([
    'GRAND TOTAL', '', '', '', '',
    { t: 'n', f: `SUMIFS(F2:F${grandTotalRowIdx - 1}, B2:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', f: `SUMIFS(G2:G${grandTotalRowIdx - 1}, B2:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', f: `F${grandTotalRowIdx}-G${grandTotalRowIdx}` },

    { t: 'n', f: `SUMIFS(I2:I${grandTotalRowIdx - 1}, B2:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', f: `SUMIFS(J2:J${grandTotalRowIdx - 1}, B2:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', f: `I${grandTotalRowIdx}-J${grandTotalRowIdx}` },

    { t: 'n', f: `SUMIFS(L2:L${grandTotalRowIdx - 1}, B2:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', f: `SUMIFS(M2:M${grandTotalRowIdx - 1}, B2:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', f: `L${grandTotalRowIdx}-M${grandTotalRowIdx}` },

    { t: 'n', f: `F${grandTotalRowIdx}+I${grandTotalRowIdx}+R${grandTotalRowIdx}+U${grandTotalRowIdx}+X${grandTotalRowIdx}-L${grandTotalRowIdx}` },
    { t: 'n', f: `G${grandTotalRowIdx}+J${grandTotalRowIdx}+S${grandTotalRowIdx}+V${grandTotalRowIdx}+Y${grandTotalRowIdx}-M${grandTotalRowIdx}` },
    { t: 'n', f: `O${grandTotalRowIdx}-P${grandTotalRowIdx}` },

    { t: 'n', f: `SUMIFS(R2:R${grandTotalRowIdx - 1}, B2:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', f: `SUMIFS(S2:S${grandTotalRowIdx - 1}, B2:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', f: `R${grandTotalRowIdx}-S${grandTotalRowIdx}` },

    { t: 'n', f: `SUMIFS(U2:U${grandTotalRowIdx - 1}, B2:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', f: `SUMIFS(V2:V${grandTotalRowIdx - 1}, B2:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', f: `U${grandTotalRowIdx}-V${grandTotalRowIdx}` },

    { t: 'n', f: `SUMIFS(X2:X${grandTotalRowIdx - 1}, B2:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', f: `SUMIFS(Y2:Y${grandTotalRowIdx - 1}, B2:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', f: `X${grandTotalRowIdx}-Y${grandTotalRowIdx}` },

    { t: 'n', f: `SUMIFS(AA2:AA${grandTotalRowIdx - 1}, B2:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', f: `SUMIFS(AB2:AB${grandTotalRowIdx - 1}, B2:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', f: `AA${grandTotalRowIdx}-AB${grandTotalRowIdx}` },

    { t: 'n', f: `SUMIFS(AD2:AD${grandTotalRowIdx - 1}, B2:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', f: `SUMIFS(AE2:AE${grandTotalRowIdx - 1}, B2:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', f: `AD${grandTotalRowIdx}-AE${grandTotalRowIdx}` },

    { t: 'n', f: `SUMIFS(AG2:AG${grandTotalRowIdx - 1}, B2:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', f: `SUMIFS(AH2:AH${grandTotalRowIdx - 1}, B2:B${grandTotalRowIdx - 1}, "MONTH TOTAL")` },
    { t: 'n', f: `AG${grandTotalRowIdx}-AH${grandTotalRowIdx}` }
  ]);
  partyRowsConfig.push({ level: 0, hpt: 30 });

  const wsParty = XLSX.utils.aoa_to_sheet(partyAoA);
  wsParty['!rows'] = [{ hpt: 24 }, ...partyRowsConfig];
  wsParty['!outline'] = { above: true, summaryBelow: false };

  // Style Party Working Sheet
  const partyRange = XLSX.utils.decode_range(wsParty['!ref'] || "A1:AI1");
  for (let R = partyRange.s.r; R <= partyRange.e.r; R++) {
    for (let C_idx = partyRange.s.c; C_idx <= partyRange.e.c; C_idx++) {
      const cellRef = XLSX.utils.encode_cell({ c: C_idx, r: R });
      if (!wsParty[cellRef]) wsParty[cellRef] = { t: 's', v: '' };

      const isHeader = R === 0;
      const isMonthTotal = partyAoA[R][1] === 'MONTH TOTAL';
      const isGrandTotal = partyAoA[R][0] === 'GRAND TOTAL';

      let bgHeader = '1E3A8A';
      if (C_idx === 6 || C_idx === 9 || C_idx === 12 || C_idx === 15 || C_idx === 18 || C_idx === 21 || C_idx === 24 || C_idx === 27 || C_idx === 30 || C_idx === 33) {
        bgHeader = '0F766E';
      } else if (C_idx === 7 || C_idx === 10 || C_idx === 13 || C_idx === 16 || C_idx === 19 || C_idx === 22 || C_idx === 25 || C_idx === 28 || C_idx === 31 || C_idx === 34) {
        bgHeader = '334155';
      }

      if (isHeader) {
        wsParty[cellRef].s = {
          font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
          fill: { fgColor: { rgb: bgHeader } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: { top: { style: 'medium', color: { rgb: '0F172A' } }, bottom: { style: 'medium', color: { rgb: '0F172A' } }, left: { style: 'thin', color: { rgb: '334155' } }, right: { style: 'thin', color: { rgb: '334155' } } }
        };
      } else if (isMonthTotal || isGrandTotal) {
        wsParty[cellRef].s = {
          font: { name: 'Segoe UI', bold: true, sz: isGrandTotal ? 11 : 10, color: { rgb: isGrandTotal ? 'FFFFFF' : '0F172A' } },
          fill: { fgColor: { rgb: isGrandTotal ? '1E293B' : 'F1F5F9' } },
          alignment: { horizontal: typeof wsParty[cellRef].v === 'number' || wsParty[cellRef].f ? 'right' : 'left' },
          border: { top: { style: 'thin', color: { rgb: '94A3B8' } }, bottom: { style: 'thin', color: { rgb: '94A3B8' } } },
          numFmt: '#,##0.00'
        };
      } else {
        wsParty[cellRef].s = {
          font: { name: 'Segoe UI', sz: 10, color: { rgb: '334155' }, bold: wsParty[cellRef].v === 'B2C Consumers & Nil Rated' },
          fill: { fgColor: { rgb: wsParty[cellRef].v === 'B2C Consumers & Nil Rated' ? 'F8FAFC' : 'FFFFFF' } },
          alignment: { horizontal: typeof wsParty[cellRef].v === 'number' || wsParty[cellRef].f ? 'right' : 'left' },
          border: { bottom: { style: 'hair', color: { rgb: 'E2E8F0' } }, right: { style: 'hair', color: { rgb: 'F1F5F9' } } },
          numFmt: typeof wsParty[cellRef].v === 'number' || wsParty[cellRef].f ? '#,##0.00' : undefined
        };
      }
    }
  }

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
    resultsList.forEach(r => {
      aoa.push([
        r['Match Status'], r['Month'], r['Invoice Date'], r['GST No'], r['Invoice/Note No'], r['Party Name'],
        r['Taxable (Books)'], r['Taxable (Portal)'], r['Taxable Variance'],
        r['IGST (Books)'], r['IGST (Portal)'], r['IGST Variance'],
        r['CGST (Books)'], r['CGST (Portal)'], r['CGST Variance'],
        r['SGST (Books)'], r['SGST (Portal)'], r['SGST Variance']
      ]);
    });

    const gtRow = aoa.length + 1;
    aoa.push([
      'GRAND TOTAL', '', '', '', '', '',
      { t: 'n', f: `SUM(G2:G${gtRow - 1})` }, { t: 'n', f: `SUM(H2:H${gtRow - 1})` }, { t: 'n', f: `SUM(I2:I${gtRow - 1})` },
      { t: 'n', f: `SUM(J2:J${gtRow - 1})` }, { t: 'n', f: `SUM(K2:K${gtRow - 1})` }, { t: 'n', f: `SUM(L2:L${gtRow - 1})` },
      { t: 'n', f: `SUM(M2:M${gtRow - 1})` }, { t: 'n', f: `SUM(N2:N${gtRow - 1})` }, { t: 'n', f: `SUM(O2:O${gtRow - 1})` },
      { t: 'n', f: `SUM(P2:P${gtRow - 1})` }, { t: 'n', f: `SUM(Q2:Q${gtRow - 1})` }, { t: 'n', f: `SUM(R2:R${gtRow - 1})` }
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
    return ws;
  };

  const wsB2B = buildDetailSheet(b2bResults, '1E3A8A');
  const wsCN = buildDetailSheet(cnResults, '0F766E');

  // Build B2C details sheet
  const buildB2CDetailSheet = () => {
    const b2cDetailHeaders = [
      'Match Status', 'Month', 'GST No', 'Party Name', 'Invoice No', 'Invoice Date', 'POS', 'Tax Rate',
      'Taxable (Books)', 'Taxable (Portal)', 'Taxable Variance',
      'IGST (Books)', 'IGST (Portal)', 'IGST Variance',
      'CGST (Books)', 'CGST (Portal)', 'CGST Variance',
      'SGST (Books)', 'SGST (Portal)', 'SGST Variance'
    ];
    const aoa: any[][] = [b2cDetailHeaders];
    b2cBooks.forEach(row => {
      const rate = snapToGstRate(row.taxable, row.cgst + row.sgst + row.igst);
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
      aoa.push([
        'Portal Only', row.month, row.gstNo || 'UNREGISTERED', row.party || 'B2C Customer', row.invoiceNo, row.invoiceDate, row.pos, rate + '%',
        0, row.taxable, -row.taxable,
        0, row.igst, -row.igst,
        0, row.cgst, -row.cgst,
        0, row.sgst, -row.sgst
      ]);
    });
    cleanPortalB2CL.forEach(row => {
      const rate = snapToGstRate(row.taxable, row.cgst + row.sgst + row.igst);
      aoa.push([
        'Portal Only', row.month, row.gstNo || 'UNREGISTERED', row.party || 'B2C Customer', row.invoiceNo, row.invoiceDate, row.pos, rate + '%',
        0, row.taxable, -row.taxable,
        0, row.igst, -row.igst,
        0, row.cgst, -row.cgst,
        0, row.sgst, -row.sgst
      ]);
    });

    const gtRow = aoa.length + 1;
    aoa.push([
      'GRAND TOTAL', '', '', '', '', '', '', '',
      { t: 'n', f: `SUM(I2:I${gtRow - 1})` }, { t: 'n', f: `SUM(J2:J${gtRow - 1})` }, { t: 'n', f: `SUM(K2:K${gtRow - 1})` },
      { t: 'n', f: `SUM(L2:L${gtRow - 1})` }, { t: 'n', f: `SUM(M2:M${gtRow - 1})` }, { t: 'n', f: `SUM(N2:N${gtRow - 1})` },
      { t: 'n', f: `SUM(O2:O${gtRow - 1})` }, { t: 'n', f: `SUM(P2:P${gtRow - 1})` }, { t: 'n', f: `SUM(Q2:Q${gtRow - 1})` },
      { t: 'n', f: `SUM(R2:R${gtRow - 1})` }, { t: 'n', f: `SUM(S2:S${gtRow - 1})` }, { t: 'n', f: `SUM(T2:T${gtRow - 1})` }
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
    return ws;
  };

  const wsB2C = buildB2CDetailSheet();

  // Build Nil Rated details sheet
  const buildNilDetailSheet = () => {
    const nilDetailHeaders = [
      'Match Status', 'Month', 'GST No', 'Party Name',
      'Nil Rated (Books)', 'Non Taxable (Books)', 'Nil Rated (Portal)', 'Non Taxable (Portal)',
      'Nil Rated Variance', 'Non Taxable Variance'
    ];
    const aoa: any[][] = [nilDetailHeaders];
    nilBooks.forEach(row => {
      aoa.push([
        'Books Only', row.month, row.gstNo || 'UNREGISTERED', row.party || 'Nil/Non-GST Customer',
        row.nilRated, row.nonTaxable, 0, 0,
        row.nilRated, row.nonTaxable
      ]);
    });
    cleanPortalNil.forEach(row => {
      aoa.push([
        'Portal Only', row.month, row.gstNo || 'UNREGISTERED', row.party || 'Nil/Non-GST Customer',
        0, 0, row.nilRated, row.nonTaxable,
        -row.nilRated, -row.nonTaxable
      ]);
    });

    const gtRow = aoa.length + 1;
    aoa.push([
      'GRAND TOTAL', '', '', '',
      { t: 'n', f: `SUM(E2:E${gtRow - 1})` }, { t: 'n', f: `SUM(F2:F${gtRow - 1})` },
      { t: 'n', f: `SUM(G2:G${gtRow - 1})` }, { t: 'n', f: `SUM(H2:H${gtRow - 1})` },
      { t: 'n', f: `SUM(I2:I${gtRow - 1})` }, { t: 'n', f: `SUM(J2:J${gtRow - 1})` }
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
    return ws;
  };

  const wsNil = buildNilDetailSheet();
  const wsExport = buildDetailSheet(expResults, '0F766E');

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
    { name: '🏢 Party Working', target: 'Party_Working' },
    { name: '📁 B2B Details', target: 'B2B_Details' },
    { name: '📁 Export Details', target: 'Export_Details' },
    { name: '📁 CN Details', target: 'CN_Details' },
    { name: '📁 B2C Details', target: 'B2C_Details' },
    { name: '📁 Nil Rated Details', target: 'Nil_Rated_Details' }
  ];

  appendExecutiveSummary(wb, "VASWANI RETURN ENTERPRISE", 'GST RECONCILIATION DASHBOARD', stats, breakdown, tabs);

  XLSX.utils.book_append_sheet(wb, wsMaster, 'Master_Dashboard');
  XLSX.utils.book_append_sheet(wb, wsParty, 'Party_Working');
  XLSX.utils.book_append_sheet(wb, wsB2B, 'B2B_Details');
  XLSX.utils.book_append_sheet(wb, wsExport, 'Export_Details');
  XLSX.utils.book_append_sheet(wb, wsCN, 'CN_Details');
  XLSX.utils.book_append_sheet(wb, wsB2C, 'B2C_Details');
  XLSX.utils.book_append_sheet(wb, wsNil, 'Nil_Rated_Details');

  const excelBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

  return {
    buffer: new Uint8Array(excelBuffer),
    b2bResults,
    expResults,
    cnResults,
    b2cResults,
    nilResults,
    monthlySummaries,
    partySummaries
  };
}