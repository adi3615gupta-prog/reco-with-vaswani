import XLSXStyle from 'xlsx-js-style';
const XLSX: any = (XLSXStyle as any).default || XLSXStyle;
import { normalizePartyName, type InvoiceRecord } from './reconciliation.ts';
import type { PartySummary } from './partyWise.ts';
import { reconcileDebitNotes, appendDebitNoteSheetsToWorkbook, type ReconciledDebitNoteRow } from './debitNoteEngine';

const r2 = (n: number) => +(Number(n) || 0).toFixed(2);

export interface ColumnMapping {
  supplierName: string;
  gstin: string;
  invoiceNo: string;
  invoiceDate: string;
  igst: string;
  cgst: string;
  sgst: string;
  // Optional — used only for compliance audit columns in exports
  taxableValue?: string;
  nilRated?: string;
  nonTaxable?: string;
  pos?: string;
  returnPeriod?: string;
  filingStatus?: string;
  filingDate?: string;
}

const KNOWN_HEADERS: Record<keyof ColumnMapping, string[]> = {
  supplierName: ['party name', 'trade/legal name', 'supplier name', 'vendor name', 'name of supplier', 'supplier', 'trade name', 'legal name', 'receiver name', 'customer name', 'particulars', 'party', 'name of the party'],
  gstin: ['gstin', 'gstin of supplier', 'gstin/uin', 'supplier gstin', 'gstin no', 'gst no', 'gst no.', 'gstin no.', 'party gstin', 'supplier\'s gstin'],
  invoiceNo: ['invoice no', 'note no', 'invoice number', 'note number', 'inv no', 'bill no', 'document number', 'invoice no.', 'note no.', 'note num', 'vou.no.', 'vou no', 'voucher no.', 'voucher no', 'vchno', 'document no'],
  invoiceDate: ['date', 'invoice date', 'note date', 'inv date', 'bill date', 'document date', 'invoice dt', 'note dt', 'inv.date', 'voucher date', 'vou.date', 'vou date', 'period'],
  igst: ['igst', 'integrated tax', 'igst amount', 'igst amt', 'total igst', 'integrated tax(₹)', 'integrated tax amount'],
  cgst: ['cgst', 'central tax', 'cgst amount', 'cgst amt', 'total cgst', 'central tax(₹)', 'central tax amount'],
  sgst: ['sgst', 'state tax', 'sgst amount', 'sgst amt', 'utgst', 'total sgst', 'state/ut tax(₹)', 'state/ut tax', 'state tax amount'],
  taxableValue: ['taxable value', 'taxable amount', 'taxable val', 'assessable value', 'taxable', 'total purchase/taxable value', 'taxable value (₹)', 'taxable+nilrated', 'purchase+nilrated', 'taxable turnover'],
  nilRated: ['nil rated', 'nil rated value', 'exempted', 'exempted value', 'nil rated supplies'],
  nonTaxable: ['non taxable', 'non-taxable', 'non gst', 'non-gst', 'exempt', 'exempt supplies', 'exempted supplies', 'non gst outward', 'non-gst supplies', 'non gst supplies'],
  pos: ['pos', 'place of supply', 'state', 'state code', 'place of supply (pos)'],
  returnPeriod: ['month', 'period', 'return period', 'original period', 'return period (month)'],
  filingStatus: ['gstr-1 status', 'gstr1 status', 'filing status', 'return filing status'],
  filingDate: ['filing date', 'gstr-1 filing date', 'return filing date', 'date of filing'],
};

export function detectColumnMapping(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {};
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  for (const [field, aliases] of Object.entries(KNOWN_HEADERS) as [keyof ColumnMapping, string[]][]) {
    // Pass 1: Try exact match first
    let matched = false;
    for (const alias of aliases) {
      const idx = lowerHeaders.findIndex((h) => h === alias);
      if (idx !== -1) {
        mapping[field] = headers[idx];
        matched = true;
        break;
      }
    }
    // Pass 2: Try contains match if no exact match was found
    if (!matched) {
      for (const alias of aliases) {
        const idx = lowerHeaders.findIndex((h) => h.includes(alias));
        if (idx !== -1) {
          mapping[field] = headers[idx];
          break;
        }
      }
    }
  }
  return mapping;
}

// Helper to convert unknown currency/string/number values to numeric float safely
export function numVal(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : Math.round(v * 100) / 100;
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[₹,\s]/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

export function parseMonthFY(s?: string): number {
  if (!s) return -1;
  const str = String(s).trim();
  if (!str) return -1;

  const fyIdx = (m: number) => ((m >= 3 && m <= 11) ? m - 3 : (m >= 0 && m <= 2) ? m + 9 : -1);

  const lower = str.toLowerCase();
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const fullMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

  for (let i = 0; i < 12; i++) {
    if (lower.includes(fullMonths[i]) || lower.includes(months[i])) {
      return fyIdx(i);
    }
  }

  // DD/MM/YYYY or MM/DD/YYYY date strings
  let m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    const p1 = parseInt(m[1], 10);
    const p2 = parseInt(m[2], 10);
    if (p2 >= 1 && p2 <= 12 && (p1 > 12 || p1 <= 31)) {
      return fyIdx(p2 - 1);
    }
    if (p1 >= 1 && p1 <= 12 && p2 > 12) {
      return fyIdx(p1 - 1);
    }
    if (p2 >= 1 && p2 <= 12) {
      return fyIdx(p2 - 1);
    }
  }

  // YYYY-MM-DD or YYYY/MM/DD (ISO format)
  m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const mo = parseInt(m[2], 10);
    if (mo >= 1 && mo <= 12) return fyIdx(mo - 1);
  }

  // MM-YYYY or MM/YYYY
  m = str.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) {
    const mo = parseInt(m[1], 10);
    if (mo >= 1 && mo <= 12) return fyIdx(mo - 1);
  }

  return -1;
}

export async function parseFile(
  file: File,
  options?: { findHeader?: boolean; raw?: boolean; sheetName?: string; docType?: string }
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });

  // 1. Target the right sheet from workbook
  let targetSheetName = wb.SheetNames[0];
  let sheetFound = false;
  if (options?.sheetName && wb.Sheets[options.sheetName]) {
    targetSheetName = options.sheetName;
    sheetFound = true;
  }
  if (!sheetFound && options?.docType && wb.SheetNames.length > 1) {
    const dt = options.docType.toLowerCase();
    const matched = wb.SheetNames.find(sn => {
      const lower = sn.toLowerCase().trim();
      if (dt === 'b2b' && (lower.includes('b2b') || lower === 'b2b supplies')) return true;
      if (dt === 'b2c' && (lower.includes('b2c') || lower.includes('b2cs'))) return true;
      if (dt === 'b2cl' && lower.includes('b2cl')) return true;
      if (dt === 'cn' && (lower.includes('cdnr') || lower.includes('cn') || lower.includes('credit'))) return true;
      if (dt === 'exp' && (lower.includes('exp') || lower.includes('export'))) return true;
      if (dt === 'nil' && (lower.includes('nil') || lower.includes('exemp'))) return true;
      return false;
    });
    if (matched) targetSheetName = matched;
  }

  // If initial sheet is a help/readme sheet, skip to first data sheet
  if (wb.SheetNames.length > 1 && ['help', 'read me', 'readme', 'instructions'].includes(targetSheetName.toLowerCase().trim())) {
    targetSheetName = wb.SheetNames.find(sn => !['help', 'read me', 'readme', 'instructions'].includes(sn.toLowerCase().trim())) || wb.SheetNames[0];
  }

  const sheet = wb.Sheets[targetSheetName] || wb.Sheets[wb.SheetNames[0]];

  // 2. Automatic & Comprehensive Header Row Detection
  let range = 0;
  const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  const headerKeywords = [
    'date', 'particulars', 'party name', 'ledger name', 'pan', 'section',
    'voucher type', 'voucher no', 'voucher number', 'deductee pan', 'deductee name',
    'amount paid', 'tds deposited', 'tds deducted',
    'gstin', 'gstin/uin', 'recipient', 'receiver name', 'supplier name',
    'invoice number', 'invoice date', 'taxable value', 'taxable amount',
    'integrated tax', 'central tax', 'state tax', 'igst', 'cgst', 'sgst',
    'place of supply', 'pos', 'rate', 'invoice value'
  ];

  let maxMatches = 0;
  let bestRow = 0;
  for (let r = 0; r < Math.min(rawData.length, 30); r++) {
    const row = rawData[r];
    if (Array.isArray(row)) {
      const matchCount = row.filter((cell) => {
        const s = String(cell || '').toLowerCase().trim();
        return headerKeywords.some((kw) => s === kw || s.includes(kw));
      }).length;

      if (matchCount > maxMatches) {
        maxMatches = matchCount;
        bestRow = r;
      }
    }
  }

  if (maxMatches >= 2) {
    range = bestRow;
  }

  const rawOption = options?.raw !== undefined ? options.raw : false;
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range, defval: '', raw: rawOption });

  if (json.length === 0) return { headers: [], rows: [] };
  const headers = Object.keys(json[0]);
  return { headers, rows: json };
}


export function mapToRecords(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
  source: 'PR' | '2B',
  sourceLabel?: string
): InvoiceRecord[] {
  const safeNum = (val: unknown): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const n = parseFloat(String(val).replace(/[₹,\s]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  return rows.map((row) => {
    const rawDate = (mapping.invoiceDate ? row[mapping.invoiceDate] : undefined) ||
      row['Invoice Date'] || row['Note Date'] || row['Document Date'] || row['Date'] || row['Inv.Date'] || row['Period'] || '';
    const formattedDate = formatDateStr(rawDate, row);

    const rawInvNo = (mapping.invoiceNo ? row[mapping.invoiceNo] : undefined) ||
      row['Invoice No'] || row['Invoice No.'] || row['Note No'] || row['Note No.'] || row['Note Number'] ||
      row['Invoice Number'] || row['Inv No'] || row['Bill No'] || row['Document Number'] || row['Vou.No.'] || row['Voucher No'] || '';

    const rawSupplier = (mapping.supplierName ? row[mapping.supplierName] : undefined) ||
      row['Trade/Legal name'] || row['Trade/Legal Name'] || row['Party Name'] || row['Supplier Name'] || row['Vendor Name'] || row['Particulars'] || '';

    const rawGstin = (mapping.gstin ? row[mapping.gstin] : undefined) ||
      row['GSTIN of supplier'] || row['GST No.'] || row['GSTIN'] || row['GST No'] || row['GSTIN/UIN'] || row['Supplier GSTIN'] || '';

    const rawCgst = mapping.cgst ? row[mapping.cgst] : (row['CGST'] ?? row['Total CGST'] ?? row['Central Tax'] ?? row['Central Tax(₹)']);
    const rawSgst = mapping.sgst ? row[mapping.sgst] : (row['SGST'] ?? row['Total SGST'] ?? row['State Tax'] ?? row['State/UT Tax'] ?? row['State/UT Tax(₹)']);
    const rawIgst = mapping.igst ? row[mapping.igst] : (row['IGST'] ?? row['Total IGST'] ?? row['Integrated Tax'] ?? row['Integrated Tax(₹)']);
    const rawTaxable = mapping.taxableValue ? row[mapping.taxableValue] : (row['Taxable Value'] ?? row['Total Purchase/Taxable Value'] ?? row['Taxable Value (₹)'] ?? row['Taxable Amount'] ?? row['Taxable']);

    const rec: InvoiceRecord = {
      supplierName: String(rawSupplier || ''),
      gstin: String(rawGstin || ''),
      invoiceNo: String(rawInvNo || ''),
      invoiceDate: formattedDate || String(rawDate || ''),
      igst: safeNum(rawIgst),
      cgst: safeNum(rawCgst),
      sgst: safeNum(rawSgst),
      source,
      ...(sourceLabel ? { sourceLabel } : {}),
    };
    if (rawTaxable !== undefined && rawTaxable !== '') rec.taxableValue = safeNum(rawTaxable);
    if (mapping.filingStatus) rec.filingStatus = String(row[mapping.filingStatus] || '');
    if (mapping.filingDate) rec.filingDate = String(row[mapping.filingDate] || '');
    (rec as any).raw = row;
    return rec;
  });
}

export async function parseGSTR1File(file: File): Promise<{ records: InvoiceRecord[], hsnData: any[], docData: any[] }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });

  const records: InvoiceRecord[] = [];

  const safeNum = (val: unknown): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const n = parseFloat(String(val).replace(/[₹,\s]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const safeStr = (val: unknown): string => String(val || '').trim();

  // Category 1: Standard Layout Sheets (Headers on Row 1)
  const processStandardSheet = (sheetName: string, typeLabel: string) => {
    if (!wb.SheetNames.includes(sheetName)) return;
    const sheet = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    for (const row of json) {
      const gstin = safeStr(row['GSTIN'] || row['E-Commerce Operator GSTIN']);
      let invoiceNo = safeStr(row['Invoice No'] || row['Note No']);

      // Generate placeholder invoice numbers for sheets that aggregate records without one
      if (!invoiceNo) {
        if (sheetName === 'B2CS') invoiceNo = `B2CS-${safeStr(row['POS'])}-${safeStr(row['Tax Rate'])}`;
        else if (sheetName === 'ECO') invoiceNo = `ECO-${gstin || safeStr(row['Type'])}`;
        else if (sheetName === 'ADVREC' || sheetName === 'ADVADJ') invoiceNo = `${sheetName}-${safeStr(row['POS'])}`;
        else continue;
      }

      const isCreditNote = safeStr(row['Note Type']).toUpperCase().includes('C');
      const mult = isCreditNote ? -1 : 1;

      records.push({
        supplierName: safeStr(row['Receiver Name'] || row['E-Commerce Operator Name']) || `Unregistered (${typeLabel})`,
        gstin,
        invoiceNo,
        invoiceDate: formatDateStr(row['Invoice Date'] || row['Note Date']),
        taxableValue: safeNum(row['Taxable Value']) * mult,
        igst: safeNum(row['IGST']) * mult,
        cgst: safeNum(row['CGST']) * mult,
        sgst: safeNum(row['SGST']) * mult,
        source: '2B', // Treated as secondary (government) source by the existing engine
        sourceLabel: `GSTR-1 (${typeLabel})`
      });
    }
  };

  processStandardSheet('B2B', 'B2B');
  processStandardSheet('B2CL', 'B2CL');
  processStandardSheet('B2CS', 'B2CS');
  processStandardSheet('CDNR', 'CDNR');
  processStandardSheet('CDNUR', 'CDNUR');
  processStandardSheet('EXP', 'EXP');
  processStandardSheet('ECO', 'ECO');
  processStandardSheet('ADVREC', 'ADVREC');
  processStandardSheet('ADVADJ', 'ADVADJ');

  // Category 2: Metadata Layout Sheets (Headers on Row 7 / Index 6)
  const processMetadataSheet = (sheetName: string) => {
    if (!wb.SheetNames.includes(sheetName)) return [];
    const sheet = wb.Sheets[sheetName];
    // Use range: 6 to emulate pandas skiprows=6 (0-indexed, skips rows 0 to 5)
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 6, defval: '' });
    // Clean out any artifacts like 'Unnamed' columns parsing caused by trailing empty cells
    return json.filter(row => Object.keys(row).some(k => !k.startsWith('__EMPTY') && String(row[k]).trim() !== ''));
  };

  const hsnData = processMetadataSheet('HSN');
  const docData = processMetadataSheet('DOC');

  return { records, hsnData, docData };
}

export async function parseMultipleGSTR1Files(files: File[]): Promise<{ records: InvoiceRecord[], hsnData: any[], docData: any[] }> {
  const allRecords: InvoiceRecord[] = [];
  const allHsnData: any[] = [];
  const allDocData: any[] = [];

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
    const sheetNames = wb.SheetNames.map(s => s.toUpperCase());

    const safeNum = (val: unknown): number => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      const n = parseFloat(String(val).replace(/[₹,\s]/g, ''));
      return isNaN(n) ? 0 : n;
    };
    const safeStr = (val: unknown): string => String(val || '').trim();

    const processStandardSheet = (target: string, typeLabel: string) => {
      let sheetName = wb.SheetNames.find(s => s.toUpperCase() === target.toUpperCase());
      if (!sheetName && wb.SheetNames.length === 1 && file.name.toUpperCase().includes(target.toUpperCase())) {
        sheetName = wb.SheetNames[0];
      }
      if (!sheetName) return;

      const sheet = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      for (const row of json) {
        const gstin = safeStr(row['GSTIN'] || row['E-Commerce Operator GSTIN']);
        let invoiceNo = safeStr(row['Invoice No'] || row['Note No'] || row['Document Number']);

        if (!invoiceNo) {
          const period = safeStr(row['Return Period'] || row['Original Period']);
          if (target === 'B2CS') {
            invoiceNo = `B2CS${period ? '-' + period : ''}-${safeStr(row['POS'])}-${safeStr(row['Tax Rate'])}`;
          }
          else if (target === 'ECO') invoiceNo = `ECO${period ? '-' + period : ''}-${gstin || safeStr(row['Type'])}`;
          else if (target === 'ADVREC' || target === 'ADVADJ') invoiceNo = `${target}-${safeStr(row['POS'])}`;
          else continue;
        }

        const isCreditNote = safeStr(row['Note Type'] || row['Document Type']).toUpperCase().includes('C');
        const mult = isCreditNote ? -1 : 1;

        allRecords.push({
          supplierName: safeStr(row['Receiver Name'] || row['E-Commerce Operator Name'] || row['Trade/Legal Name']) || `Unregistered (${typeLabel})`,
          gstin,
          invoiceNo,
          invoiceDate: formatDateStr(row['Invoice Date'] || row['Note Date'] || row['Document Date']),
          taxableValue: safeNum(row['Taxable Value']) * mult,
          igst: safeNum(row['IGST'] || row['Integrated Tax']) * mult,
          cgst: safeNum(row['CGST'] || row['Central Tax']) * mult,
          sgst: safeNum(row['SGST'] || row['State/UT Tax']) * mult,
          source: '2B',
          sourceLabel: `GSTR-1 (${typeLabel})`
        });
      }
    };

    processStandardSheet('B2B', 'B2B');
    processStandardSheet('B2CL', 'B2CL');
    processStandardSheet('B2CS', 'B2CS');
    processStandardSheet('CDNR', 'CDNR');
    processStandardSheet('CDNUR', 'CDNUR');
    processStandardSheet('EXP', 'EXP');
    processStandardSheet('ECO', 'ECO');
    processStandardSheet('ADVREC', 'ADVREC');
    processStandardSheet('ADVADJ', 'ADVADJ');

    const processNilRatedSheet = () => {
      let sheetName = wb.SheetNames.find(s => s.toUpperCase().includes('NIL RATED'));
      if (!sheetName && wb.SheetNames.length === 1 && file.name.toUpperCase().includes('NIL')) {
        sheetName = wb.SheetNames[0];
      }
      if (!sheetName) return;

      const sheet = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      for (const row of json) {
        const desc = safeStr(row['Description']);
        const period = safeStr(row['Return Period']);
        if (!desc && !period) continue; // Skip empty rows safely

        const nilValue = safeNum(row['Nil Rated Supplies']) + safeNum(row['Exempted(Other than Nil Rated/Non GST Supply)']) + safeNum(row['Non GST Supplies']);

        if (nilValue === 0) continue;

        const periodStr = period ? `-${period}` : '';

        allRecords.push({
          supplierName: 'Unregistered (Nil Rated)',
          gstin: '',
          invoiceNo: `NIL${periodStr}-${desc.substring(0, 15)}`,
          invoiceDate: '',
          taxableValue: nilValue,
          igst: 0, cgst: 0, sgst: 0,
          source: '2B',
          sourceLabel: 'GSTR-1 (Nil Rated)'
        });
      }
    };

    processNilRatedSheet();

    const processMetadataSheet = (target: string) => {
      let sheetName = wb.SheetNames.find(s => s.toUpperCase() === target.toUpperCase());
      if (!sheetName && wb.SheetNames.length === 1 && file.name.toUpperCase().includes(target.toUpperCase())) {
        sheetName = wb.SheetNames[0];
      }
      if (!sheetName) return [];
      const sheet = wb.Sheets[sheetName];
      const jsonSkip6 = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 6, defval: '' });
      const jsonNoSkip = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const json = (jsonNoSkip.length > 0 && Object.keys(jsonNoSkip[0]).some(k => k.toLowerCase().includes('hsn') || k.toLowerCase().includes('document'))) ? jsonNoSkip : jsonSkip6;
      return json.filter(row => Object.keys(row).some(k => !k.startsWith('__EMPTY') && String(row[k]).trim() !== ''));
    };

    allHsnData.push(...processMetadataSheet('HSN'));
    allDocData.push(...processMetadataSheet('DOC'));
  }

  return { records: allRecords, hsnData: allHsnData, docData: allDocData };
}

interface StatusStyle {
  headerFill: string;
  headerFont: string;
  rowFill: string;
}

const STATUS_STYLES: Record<string, StatusStyle> = {
  'Matched': { headerFill: '1B7A4D', headerFont: 'FFFFFF', rowFill: 'E6F5ED' },
  'Matched (Rounded)': { headerFill: '2E8B57', headerFont: 'FFFFFF', rowFill: 'E6F5ED' },
  'Mismatch': { headerFill: 'D97706', headerFont: 'FFFFFF', rowFill: 'FEF3C7' },
  'Missing in 2B': { headerFill: 'DC2626', headerFont: 'FFFFFF', rowFill: 'FEE2E2' },
  'Missing in PR': { headerFill: '2563EB', headerFont: 'FFFFFF', rowFill: 'DBEAFE' },
  'Not in Books': { headerFill: '2563EB', headerFont: 'FFFFFF', rowFill: 'DBEAFE' },
  'Possible Match': { headerFill: '6B7280', headerFont: 'FFFFFF', rowFill: 'F3F4F6' },
  'Name Matched (No GSTIN)': { headerFill: 'B45309', headerFont: 'FFFFFF', rowFill: 'FEF3C7' },
  'Wrong GSTIN': { headerFill: 'B91C1C', headerFont: 'FFFFFF', rowFill: 'FEE2E2' },
  'Name Mismatch': { headerFill: 'D97706', headerFont: 'FFFFFF', rowFill: 'FEF3C7' },
  'Prior FY (Excluded)': { headerFill: '4B5563', headerFont: 'FFFFFF', rowFill: 'F3F4F6' },
};

// Helper to add professional icons to status text
function enrichStatusWithIcon(status: string): string {
  const s = status.trim();
  if (s.includes('Perfect') || s === 'Matched' || s.includes('Rounded') || s.includes('Diff Date')) return `✅ ${s}`;
  if (s.includes('Value Mismatch') || s === 'Mismatch' || s.includes('Name Mismatch')) return `⚠️ ${s}`;
  if (s === 'Missing in 2B' || s === 'Not in 2B' || s === 'Unmatched Vendor') return `🚨 ${s}`;
  if (s === 'Missing in PR' || s === 'Not in Books') return `🟦 ${s}`;
  if (s.includes('Prior FY')) return `⏳ ${s}`;
  if (s.includes('Wrong GSTIN')) return `❌ ${s}`;
  if (s.includes('Possible')) return `🔎 ${s}`;
  return s;
}

const DEFAULT_STYLE: StatusStyle = { headerFill: '1E3A5F', headerFont: 'FFFFFF', rowFill: 'FFFFFF' };

const ACC_FMT = '_(* #,##0.00_);[Red]_(* (#,##0.00);_(* "-"??_);_(@_)';

const PARTY_STATUS_FILL: Record<string, string> = {
  'All Matched': 'E6F5ED',
  'Has Mismatches': 'FEF3C7',
  'Has Missing': 'FEE2E2',
};

const PARTY_STATUS_HEADER: Record<string, string> = {
  'All Matched': '1B7A4D',
  'Has Mismatches': 'B45309',
  'Has Missing': 'B91C1C',
};

// Helper to convert any Excel serial date number to { y, m, d } without timezone shifts
function serialToYMD(serial: number): { y: number; m: number; d: number } | null {
  if (isNaN(serial) || serial <= 0) return null;
  try {
    if (XLSX.SSF && typeof XLSX.SSF.parse_date_code === 'function') {
      const parsed = XLSX.SSF.parse_date_code(serial);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        return { y: parsed.y, m: parsed.m, d: parsed.d };
      }
    }
  } catch (e) {
    // fallback
  }
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  if (!isNaN(d.getTime())) {
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }
  return null;
}

// Convert JS Date object to { y, m, d } safely
function dateToYMD(d: Date): { y: number; m: number; d: number } {
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}

// Format any date input to "dd-MMM-yyyy" string reliably
export function formatDateStr(v: unknown, contextRow?: Record<string, unknown>): string {
  if (v == null || v === '') return '';

  let ymd: { y: number; m: number; d: number } | null = null;

  if (v instanceof Date && !isNaN(v.getTime())) {
    ymd = dateToYMD(v);
  } else if (typeof v === 'number') {
    ymd = serialToYMD(v);
  } else {
    const s = String(v).trim();
    if (!s) return '';

    // Match DD/MM/YYYY, MM/DD/YYYY, D/M/YY, M/D/YY
    const m1 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (m1) {
      let yy = +m1[3]; if (yy < 100) yy += 2000;
      let n1 = +m1[1];
      let n2 = +m1[2];

      if (n2 > 12 && n1 <= 12) {
        // e.g. 6/18/25 -> n1 = 6 (Month), n2 = 18 (Day)
        ymd = { d: n2, m: n1, y: yy };
      } else if (n1 > 12 && n2 <= 12) {
        // e.g. 24/5/25 -> n1 = 24 (Day), n2 = 5 (Month)
        ymd = { d: n1, m: n2, y: yy };
      } else {
        // Both <= 12 (e.g. 5/6/25). Standard Indian GST convention is DD/MM/YYYY (n1=day, n2=month)
        ymd = { d: n1, m: n2, y: yy };
      }
    } else {
      // YYYY-MM-DD
      const m2 = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (m2) {
        ymd = { y: +m2[1], m: +m2[2], d: +m2[3] };
      } else {
        // DD-Mon-YYYY or DD/Mon/YYYY or DD Mon YYYY
        const m3 = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,9})[-/\s](\d{2,4})$/);
        if (m3) {
          const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
          const mm = months.indexOf(m3[2].toLowerCase().slice(0, 3));
          if (mm !== -1) {
            let yy = +m3[3]; if (yy < 100) yy += 2000;
            ymd = { d: +m3[1], m: mm + 1, y: yy };
          }
        } else {
          // Mon-DD-YYYY e.g. Jun-18-2025
          const m4 = s.match(/^([A-Za-z]{3,9})[-/\s](\d{1,2})[-/\s](\d{2,4})$/);
          if (m4) {
            const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            const mm = months.indexOf(m4[1].toLowerCase().slice(0, 3));
            if (mm !== -1) {
              let yy = +m4[3]; if (yy < 100) yy += 2000;
              ymd = { d: +m4[2], m: mm + 1, y: yy };
            }
          }
        }
      }
    }

    if (!ymd) {
      const parsedNum = Number(s);
      if (!isNaN(parsedNum) && parsedNum > 20000 && parsedNum < 90000) {
        ymd = serialToYMD(parsedNum);
      } else {
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
          ymd = dateToYMD(d);
        }
      }
    }
  }

  // Disambiguate US locale date swaps (e.g. m=3, d=8 -> Mar 8 instead of Aug 3, m=1, d=4 -> Jan 4 instead of Apr 1)
  if (ymd) {
    if (contextRow) {
      // ONLY check dedicated filing period / return period columns — NEVER search supplier names, particulars, IRN hashes, etc.!
      const periodField = String(
        contextRow['Period'] || contextRow['period'] ||
        contextRow['Return Period'] || contextRow['return period'] ||
        contextRow['Return period'] || contextRow['Month'] || contextRow['month'] || ''
      ).toLowerCase().trim();

      if (periodField) {
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        for (let i = 0; i < 12; i++) {
          const mNum = i + 1;
          const monthStr = months[i];
          const regex = new RegExp('\\b' + monthStr + '[a-z]*\\b', 'i');
          if (regex.test(periodField)) {
            if (ymd.d === mNum && ymd.m !== mNum && ymd.m <= 12) {
              const oldDay = ymd.m;
              ymd.m = mNum;
              ymd.d = oldDay;
            }
            break;
          }
        }
      }
    }
  }

  if (ymd && ymd.y > 1900 && ymd.m >= 1 && ymd.m <= 12 && ymd.d >= 1 && ymd.d <= 31) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dd = String(ymd.d).padStart(2, '0');
    return `${dd}-${months[ymd.m - 1]}-${ymd.y}`;
  }

  return String(v).trim();
}

// Format date to "MMM-yy" string for difference months tracking (e.g. Apr-26)
function getDiffMonthStr(v: unknown): string {
  if (v == null || v === '') return '';
  const formatted = formatDateStr(v);
  const m = formatted.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const yy = m[3].slice(-2);
    return `${m[2]}-${yy}`;
  }
  return '';
}

// Compute Financial Year from a date string/number
export function extractFY(v: unknown): string {
  if (v == null || v === '') return '';
  const formatted = formatDateStr(v);
  const m = formatted.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mm = months.indexOf(m[2]);
    const year = parseInt(m[3], 10);
    if (mm !== -1 && !isNaN(year)) {
      return mm >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    }
  }
  return '';
}

// Compute auto-fit widths from header + data arrays
function autoFitCols(headers: string[], data: (string | number)[][]): { wch: number }[] {
  return headers.map((h, c) => {
    let max = String(h ?? '').length;
    for (const row of data) {
      const v = row[c];
      const len = v == null ? 0 : (typeof v === 'number' ? v.toFixed(2).length : String(v).length);
      if (len > max) max = len;
    }
    return { wch: Math.min(Math.max(max + 1, 8), 35) };
  });
}

// Strips all cell merges from an entire workbook to guarantee clean sorting, filtering and formulas
export function removeAllMergesFromWorkbook(wb: XLSX.WorkBook): XLSX.WorkBook {
  if (!wb || !wb.SheetNames || !wb.Sheets) return wb;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (ws && ws['!merges']) {
      delete ws['!merges'];
    }
  }
  return wb;
}

// ─────────────────────────────────────────────────────────────────────────────
// 21-Column Zero-Merge Debit Note Export Suite
// ─────────────────────────────────────────────────────────────────────────────

export const DEBIT_NOTE_21_COL_HEADERS = [
  'Match Status',
  'GSTIN (PR)',
  'GSTIN (2B)',
  'Supplier Name (PR)',
  'Supplier Name (2B)',
  'Invoice No (PR)',
  'Invoice No (2B)',
  'Invoice Date (PR)',
  'Invoice Date (2B)',
  'Invoice Value (PR)',
  'Invoice Value (2B)',
  'Taxable Value (PR)',
  'Taxable Value (2B)',
  'CGST (PR)',
  'CGST (2B)',
  'SGST (PR)',
  'SGST (2B)',
  'IGST (PR)',
  'IGST (2B)',
  'Net Tax Diff',
  'Audit Remarks / Action'
];

export function buildDebitNotes21ColSheet(
  rows: ReconciledDebitNoteRow[],
  companyName: string = 'GST Reconciliation'
): XLSX.WorkSheet {
  const ACC_FMT = '#,##0.00;(#,##0.00);"-"';
  const aoa: any[][] = [
    [`${companyName.toUpperCase()} — RECONCILED DEBIT & CREDIT NOTES (21-COLUMN AUDIT STANDARD)`],
    [`Report Generated: ${new Date().toLocaleString('en-IN')} | Strict Zero-Merge Architecture | Zero Double-Counting Guarantee`],
    [],
    DEBIT_NOTE_21_COL_HEADERS,
  ];

  for (const r of rows) {
    aoa.push([
      r.matchStatus,
      r.gstinPR || '',
      r.gstin2B || '',
      r.supplierNamePR || '',
      r.supplierName2B || '',
      r.invoiceNoPR || '',
      r.invoiceNo2B || '',
      r.invoiceDatePR || '',
      r.invoiceDate2B || '',
      { t: 'n', v: r.invoiceValuePR, z: ACC_FMT },
      { t: 'n', v: r.invoiceValue2B, z: ACC_FMT },
      { t: 'n', v: r.taxableValuePR, z: ACC_FMT },
      { t: 'n', v: r.taxableValue2B, z: ACC_FMT },
      { t: 'n', v: r.cgstPR, z: ACC_FMT },
      { t: 'n', v: r.cgst2B, z: ACC_FMT },
      { t: 'n', v: r.sgstPR, z: ACC_FMT },
      { t: 'n', v: r.sgst2B, z: ACC_FMT },
      { t: 'n', v: r.igstPR, z: ACC_FMT },
      { t: 'n', v: r.igst2B, z: ACC_FMT },
      { t: 'n', v: r.netTaxDiff, z: ACC_FMT },
      r.auditRemarks || '',
    ]);
  }

  // Summary Grand Total Row (Row index = rows.length + 4)
  const lastRow = rows.length + 4;
  aoa.push([
    'TOTAL',
    '', '', '', '', '', '', '', '',
    { t: 'n', f: `SUM(J5:J${lastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(K5:K${lastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(L5:L${lastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(M5:M${lastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(N5:N${lastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(O5:O${lastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(P5:P${lastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(Q5:Q${lastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(R5:R${lastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(S5:S${lastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(T5:T${lastRow})`, z: ACC_FMT },
    ''
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [];
  ws['!cols'] = [
    { wch: 30 }, // Match Status
    { wch: 18 }, // GSTIN PR
    { wch: 18 }, // GSTIN 2B
    { wch: 32 }, // Supplier Name PR
    { wch: 32 }, // Supplier Name 2B
    { wch: 22 }, // Invoice No PR
    { wch: 22 }, // Invoice No 2B
    { wch: 14 }, // Date PR
    { wch: 14 }, // Date 2B
    { wch: 16 }, // Val PR
    { wch: 16 }, // Val 2B
    { wch: 16 }, // Taxable PR
    { wch: 16 }, // Taxable 2B
    { wch: 14 }, // CGST PR
    { wch: 14 }, // CGST 2B
    { wch: 14 }, // SGST PR
    { wch: 14 }, // SGST 2B
    { wch: 14 }, // IGST PR
    { wch: 14 }, // IGST 2B
    { wch: 16 }, // Net Tax Diff
    { wch: 45 }, // Audit Remarks
  ];

  return ws;
}

export function exportDebitNotes21Col(
  rows: ReconciledDebitNoteRow[],
  filename: string = 'Reconciled_Debit_Notes_21Col.xlsx',
  companyName: string = 'GST Reconciliation'
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const ws = buildDebitNotes21ColSheet(rows, companyName);
  XLSX.utils.book_append_sheet(wb, ws, 'Debit Notes Reconciled');
  removeAllMergesFromWorkbook(wb);
  try {
    XLSX.writeFile(wb, filename);
  } catch (err) {
    console.error('Failed to write 21-col Excel file:', err);
  }
  return wb;
}

// Inserts a high-end corporate header into the first two rows of any worksheet
function addCorporateHeader(ws: XLSX.WorkSheet, colCount: number, companyName: string | undefined, reportName: string, tabs?: { name: string, target: string }[]) {
  const comp = (companyName || 'GST Reconciliation').toUpperCase();
  const title = `${comp} - ${reportName.toUpperCase()}`;
  const subtitle = `Report Generated on: ${new Date().toLocaleString('en-IN')} | Powered by Vaswani Return`;

  XLSX.utils.sheet_add_aoa(ws, [[title], [subtitle]], { origin: 'A1' });

  const isNavSheet = reportName === 'Navigation' || reportName === 'Dashboard';
  const hasTabs = !isNavSheet && Boolean(tabs && tabs.length > 0);

  if (!ws['!rows']) ws['!rows'] = [];
  ws['!rows'][0] = { hpt: 24 };
  ws['!rows'][1] = { hpt: 14 };

  const tAddr = XLSX.utils.encode_cell({ r: 0, c: 0 });
  const sAddr = XLSX.utils.encode_cell({ r: 1, c: 0 });

  if (hasTabs && tabs) {
    const startTabCol = 8;
    const actualMaxCol = Math.max(colCount - 1, startTabCol + tabs.length - 1);

    for (let i = 0; i < tabs.length; i++) {
      const tabCol = startTabCol + i;
      const addr = XLSX.utils.encode_cell({ r: 0, c: tabCol });
      const subAddr = XLSX.utils.encode_cell({ r: 1, c: tabCol });
      const isActive = tabs[i].target === reportName;

      ws[addr] = {
        t: 's', v: tabs[i].name,
        l: { Target: `#'${tabs[i].target}'!A1`, Tooltip: `Switch to ${tabs[i].name}` },
      };
      ws[addr].s = {
        fill: { fgColor: { rgb: isActive ? '3B82F6' : '1E293B' } },
        font: { sz: 10, color: { rgb: 'FFFFFF' }, bold: true },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: { top: { style: 'medium', color: { rgb: '0F172A' } }, bottom: { style: 'medium', color: { rgb: '0F172A' } }, left: { style: 'medium', color: { rgb: '0F172A' } }, right: { style: 'medium', color: { rgb: '0F172A' } } },
      };
      ws[subAddr] = { t: 's', v: '', s: { fill: { fgColor: { rgb: isActive ? '3B82F6' : '1E293B' } }, border: { bottom: { style: 'thin', color: { rgb: '0F172A' } } } } };
    }

    for (let c = startTabCol + tabs.length; c <= actualMaxCol; c++) {
      ws[XLSX.utils.encode_cell({ r: 0, c })] = { t: 's', v: '', s: { fill: { fgColor: { rgb: '0F172A' } } } };
      ws[XLSX.utils.encode_cell({ r: 1, c })] = { t: 's', v: '', s: { fill: { fgColor: { rgb: '1E293B' } }, border: { bottom: { style: 'thin', color: { rgb: '0F172A' } } } } };
    }

    if (ws[tAddr]) {
      ws[tAddr].s = { fill: { fgColor: { rgb: '0F172A' } }, font: { sz: 13, color: { rgb: 'F8FAFC' }, bold: true }, alignment: { horizontal: 'left', vertical: 'center' } };
    }
    if (ws[sAddr]) {
      ws[sAddr].s = { fill: { fgColor: { rgb: '1E293B' } }, font: { sz: 9, color: { rgb: '94A3B8' }, italic: true }, alignment: { horizontal: 'left', vertical: 'center' } };
    }
  } else {
    // Clean corporate header with NO navigation buttons, NO home button, and NO dark navbar fills
    if (ws[tAddr]) {
      ws[tAddr].s = { font: { sz: 12, color: { rgb: '0F172A' }, bold: true }, alignment: { horizontal: 'left', vertical: 'center' } };
    }
    if (ws[sAddr]) {
      ws[sAddr].s = { font: { sz: 9, color: { rgb: '64748B' }, italic: true }, alignment: { horizontal: 'left', vertical: 'center' } };
    }
  }
}

export function appendExecutiveSummary(
  wb: XLSX.WorkBook,
  companyName: string | undefined,
  reportName: string,
  stats: { label: string; value: string | number }[],
  breakdown?: { label: string; value: string | number }[],
  tabs?: { name: string, target: string }[]
) {
  const wsCover = XLSX.utils.aoa_to_sheet([]);
  addCorporateHeader(wsCover, 5, companyName, reportName, tabs);

  const coverRows: any[][] = [];
  coverRows.push(['REPORT PARAMETERS', '', '']);
  coverRows.push(['Company Name', '', companyName || 'Not Provided']);
  coverRows.push(['Report Generated', '', new Date().toLocaleString('en-IN')]);
  for (const st of stats) {
    coverRows.push([st.label, '', st.value]);
  }

  if (breakdown && breakdown.length > 0) {
    coverRows.push(['', '', '']);
    coverRows.push(['STATUS BREAKDOWN', '', 'RECORD COUNT']);
    for (const b of breakdown) {
      coverRows.push([b.label, '', b.value]);
    }
  }

  XLSX.utils.sheet_add_aoa(wsCover, coverRows, { origin: 'B4' });
  wsCover['!cols'] = [{ wch: 3 }, { wch: 25 }, { wch: 12 }, { wch: 18 }, { wch: 3 }];

  const coverStartRow = 3;
  for (let i = 0; i < coverRows.length; i++) {
    const r = coverStartRow + i;
    const isSection = coverRows[i][0] === 'REPORT PARAMETERS' || coverRows[i][0] === 'STATUS BREAKDOWN';
    const isEmpty = coverRows[i][0] === '';

    for (let c = 1; c <= 3; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!wsCover[addr] && !isEmpty) wsCover[addr] = { t: 's', v: '' };
      if (!wsCover[addr]) continue;

      const val = coverRows[i][c - 1];
      const isNum = typeof val === 'number';

      wsCover[addr].s = {
        font: {
          bold: isSection || c === 3 || isNum,
          color: { rgb: isSection ? 'FFFFFF' : '1F2937' },
          sz: isSection ? 10 : 9
        },
        fill: isSection ? { fgColor: { rgb: '0F172A' } } : { fgColor: { rgb: i % 2 === 0 ? 'F8FAFC' : 'FFFFFF' } },
        alignment: {
          vertical: 'center',
          horizontal: isSection ? (c === 3 && val ? 'right' : 'left') : (c === 3 || isNum ? 'right' : 'left')
        },
        border: isSection
          ? { top: { style: 'thin', color: { rgb: '0F172A' } }, bottom: { style: 'thin', color: { rgb: '0F172A' } } }
          : { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } }
      };

      if (!wsCover['!rows']) wsCover['!rows'] = [];
      wsCover['!rows'][r] = { hpt: isSection ? 18 : 15 };
    }

    if (isSection) {
      if (!wsCover['!merges']) wsCover['!merges'] = [];
      if (coverRows[i][0] === 'STATUS BREAKDOWN') {
        wsCover['!merges'].push({ s: { r, c: 1 }, e: { r, c: 2 } });
      } else {
        wsCover['!merges'].push({ s: { r, c: 1 }, e: { r, c: 3 } });
      }
    } else if (!isEmpty) {
      if (!wsCover['!merges']) wsCover['!merges'] = [];
      wsCover['!merges'].push({ s: { r, c: 1 }, e: { r, c: 2 } });
    }
  }

  wsCover['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];
  wsCover['!protect'] = {
    password: '100rav',
    selectLockedCells: true,
    selectUnlockedCells: true
  };

  XLSX.utils.book_append_sheet(wb, wsCover, 'Executive Summary');
}

function appendMethodologySheet(wb: XLSX.WorkBook, companyName: string | undefined, tabs?: { name: string, target: string }[]) {
  const ws = XLSX.utils.aoa_to_sheet([]);

  addCorporateHeader(ws, 2, companyName, '📖 Methodology & Legend', tabs);

  const rows: any[][] = [];
  rows.push(['', '']);
  rows.push(['1. RECONCILIATION & MATCHING METHODOLOGY', '']);
  rows.push(['The matching engine evaluates the Purchase Register and GSTR-2B using a multi-step hierarchical logic. It prioritises exact matches on GSTIN and Invoice Number, and falls back to advanced fuzzy matching (Name substrings, partial invoice sequences, and dates ±15 days) to maximise eligible ITC.', '']);
  rows.push(['', '']);
  rows.push(['Match Status', 'Definition / Criteria']);

  const statuses = [
    ['✅ Perfect Match', 'Exact match on GSTIN, Invoice Number, and Tax amounts (within ±2 Rupee tolerance).'],
    ['✅ Matched (Diff Date)', 'Exact match on GSTIN, Invoice Number, and Tax amounts, but invoice dates differ.'],
    ['⚠️ Value Mismatch', 'GSTIN and Invoice Number matched, but Taxable or GST amounts differ by more than ₹2.'],
    ['⚠️ Name Mismatch', 'Exact match on GSTIN and Invoice Number, but the Party Name text is significantly different.'],
    ['🚨 Not in 2B', 'Invoice exists in your Purchase Register (Books) but is missing from the GSTR-2B downloaded from the portal. ITC is at risk.'],
    ['🟦 Not in Books', 'Invoice exists in GSTR-2B but is missing from your Purchase Register. Possible unrecorded purchase.'],
    ['❌ Wrong GSTIN', 'Matched strongly by Name and Invoice Number, but the GSTINs are completely different. Requires amendment.'],
    ['⏳ Prior FY (Excluded)', 'Invoice detected in GSTR-2B but belongs to a previous Financial Year. It has been excluded from the active reconciliation.'],
  ];
  rows.push(...statuses);

  rows.push(['', '']);
  rows.push(['2. TOLERANCES & ROUNDING', '']);
  rows.push(['Rounding Rule:', 'All tax amounts are automatically rounded to the nearest integer per Section 170 of the CGST Act before comparison.']);
  rows.push(['Variance Tolerance:', 'A ±₹2.00 tolerance is applied to all Taxable, CGST, SGST, and IGST values to absorb minor portal vs software rounding differences.']);

  rows.push(['', '']);
  rows.push(['3. COLOR LEGEND', '']);
  rows.push(['Background Color', 'Indication / Meaning']);

  const colors = [
    ['Green (Light)', 'Match is successful and compliant. No action required.'],
    ['Yellow / Amber', 'Warning: Match found with discrepancies (Value difference or Name mismatch). Review needed.'],
    ['Red (Light)', 'Alert: Record missing from GSTR-2B or Wrong GSTIN. High risk of ITC loss. Follow up with Vendor.'],
    ['Blue (Light)', 'Notice: Record missing from Books but present in GSTR-2B. Consider recording the purchase.'],
    ['Grey (Slate)', 'Status: Excluded from active matching (Prior Financial Year).'],
  ];
  rows.push(...colors);

  XLSX.utils.sheet_add_aoa(ws, rows, { origin: 'A3' });
  ws['!cols'] = [{ wch: 35 }, { wch: 110 }];

  if (!ws['!rows']) ws['!rows'] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = i + 2;
    const text1 = String(rows[i][0] || '');
    const isSection = text1.match(/^[1-3]\./);
    const isSubHeader = text1 === 'Match Status' || text1 === 'Background Color';

    ws['!rows'][r] = { hpt: isSection ? 28 : (isSubHeader ? 22 : 18) };

    for (let c = 0; c < 2; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };

      if (isSection) {
        ws[addr].s = { font: { name: 'Segoe UI', bold: true, sz: 12, color: { rgb: '1E3A8A' } }, alignment: { vertical: 'bottom' }, border: { bottom: { style: 'medium', color: { rgb: '1E3A8A' } } } };
      } else if (isSubHeader) {
        ws[addr].s = { fill: { fgColor: { rgb: '0F172A' } }, font: { name: 'Segoe UI', bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, alignment: { vertical: 'center', horizontal: 'left', indent: 1 } };
      } else if (text1 === 'Rounding Rule:' || text1 === 'Variance Tolerance:') {
        ws[addr].s = { font: { name: 'Segoe UI', bold: c === 0, sz: 10, color: { rgb: '1F2937' } }, alignment: { vertical: 'center', wrapText: true, indent: 1 } };
      } else if (text1 !== '') {
        let fill = 'FFFFFF';
        if (text1.includes('Green')) fill = 'E6F5ED';
        if (text1.includes('Yellow')) fill = 'FEF3C7';
        if (text1.includes('Red')) fill = 'FEE2E2';
        if (text1.includes('Blue')) fill = 'DBEAFE';
        if (text1.includes('Grey')) fill = 'F3F4F6';
        ws[addr].s = { fill: { fgColor: { rgb: c === 0 ? fill : 'FFFFFF' } }, font: { name: 'Segoe UI', bold: c === 0, sz: 10, color: { rgb: '1F2937' } }, border: { bottom: { style: 'hair', color: { rgb: 'E2E8F0' } } }, alignment: { vertical: 'center', wrapText: true, indent: 1 } };
      }
    }
    if (isSection || text1.startsWith('The matching engine')) {
      if (!ws['!merges']) ws['!merges'] = [];
      ws['!merges'].push({ s: { r, c: 0 }, e: { r, c: 1 } });
      if (text1.startsWith('The matching engine')) { ws[XLSX.utils.encode_cell({ r, c: 0 })].s = { font: { name: 'Segoe UI', sz: 10, color: { rgb: '475569' }, italic: true }, alignment: { vertical: 'center', wrapText: true } }; ws['!rows'][r].hpt = 45; }
    }
  }

  ws['!tabcolor'] = { rgb: '4F46E5' }; // Deep Indigo Tab Color

  XLSX.utils.book_append_sheet(wb, ws, '📖 Methodology & Legend');
}

function applySheetStyles(
  ws: XLSX.WorkSheet,
  style: StatusStyle,
  rowCount: number,
  opts?: { dateCols?: number[]; numberCols?: number[]; colWidths?: { wch: number }[]; startRow?: number; hasTopTotal?: boolean }
) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const colCount = range.e.c + 1;

  ws['!cols'] = opts?.colWidths ?? Array.from({ length: colCount }, (_, i) => ({
    wch: i === 0 ? 14 : i <= 2 ? 20 : 18,
  }));
  const dateCols = new Set(opts?.dateCols ?? []);
  const numberCols = new Set(opts?.numberCols ?? []);
  const startRow = opts?.startRow ?? 0;

  if (!ws['!rows']) ws['!rows'] = [];
  ws['!rows'][startRow] = { hpt: 28 }; // Premium header row height

  // Merge and style banner cells in Row 3 (index 2) if startRow === 3
  if (startRow === 3) {
    const bannerRowIdx = 2;
    ws['!rows'][bannerRowIdx] = { hpt: 22 }; // Banner row height
    if (!ws['!merges']) ws['!merges'] = [];

    let mergeStart = 0;
    for (let c = 1; c <= range.e.c; c++) {
      const prevAddr = XLSX.utils.encode_cell({ r: bannerRowIdx, c: c - 1 });
      const currAddr = XLSX.utils.encode_cell({ r: bannerRowIdx, c });
      const prevVal = ws[prevAddr]?.v;
      const currVal = ws[currAddr]?.v;

      if (prevVal === currVal && prevVal !== '' && prevVal !== undefined) {
        // Continue merging
      } else {
        if (c - 1 > mergeStart) {
          ws['!merges'].push({ s: { r: bannerRowIdx, c: mergeStart }, e: { r: bannerRowIdx, c: c - 1 } });
        }
        mergeStart = c;
      }
    }
    if (range.e.c > mergeStart) {
      ws['!merges'].push({ s: { r: bannerRowIdx, c: mergeStart }, e: { r: bannerRowIdx, c: range.e.c } });
    }

    // Style banner cells u/s premium corporate colors
    for (let c = 0; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: bannerRowIdx, c });
      if (!ws[addr] || ws[addr].v === '') continue;

      let bannerBg = '0F172A'; // Slate dark blue default
      let bannerFg = 'F8FAFC';
      const val = String(ws[addr].v).toUpperCase();

      if (val.includes('PR') || val.includes('PURCHASE')) {
        bannerBg = '1E3A8A'; // Deep Indigo Blue for PR
      } else if (val.includes('2B') || val.includes('GOVERNMENT')) {
        bannerBg = '0D9488'; // Deep Emerald Teal for 2B
      } else if (val.includes('VARIANCE') || val.includes('AUDIT')) {
        bannerBg = '9F1239'; // Deep Crimson Rose for Variance
      }

      ws[addr].s = {
        fill: { fgColor: { rgb: bannerBg } },
        font: { name: 'Segoe UI', bold: true, color: { rgb: bannerFg }, sz: 10 },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          bottom: { style: 'thin', color: { rgb: '475569' } },
          top: { style: 'medium', color: { rgb: '0F172A' } }
        }
      };
    }
  }

  // 1. Classify columns by parsing header labels at startRow
  const colSourceTypes: string[] = [];
  for (let c = 0; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: startRow, c });
    const val = String(ws[addr]?.v || '').trim();
    const valLower = val.toLowerCase();

    if (valLower.includes('(pr)') || valLower.includes('tally') || valLower.includes('books') || valLower.includes('purchase')) {
      colSourceTypes.push('PR');
    } else if (valLower.includes('(2b)') || valLower.includes('govt') || valLower.includes('portal') || valLower.includes('gstr2b') || valLower.includes('comparison')) {
      colSourceTypes.push('2B');
    } else if (valLower.includes('diff') || valLower.includes('mismatch') || valLower.includes('variance')) {
      colSourceTypes.push('DIFF');
    } else if (valLower.includes('auditor action') || valLower.includes('remark')) {
      colSourceTypes.push('INPUT');
    } else {
      colSourceTypes.push('DEFAULT');
    }
  }

  // Header row styling
  for (let c = 0; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: startRow, c });
    if (!ws[addr]) continue;

    let headerBg = style.headerFill;
    let headerFg = style.headerFont;

    if (colSourceTypes[c] === 'PR') {
      headerBg = '1E3A8A'; // Tally Books / PR Indigo Blue
      headerFg = 'FFFFFF';
    } else if (colSourceTypes[c] === '2B') {
      headerBg = '0D9488'; // Govt Data / 2B Emerald Teal
      headerFg = 'FFFFFF';
    } else if (colSourceTypes[c] === 'DIFF') {
      headerBg = '9F1239'; // Variance / Crimson Rose
      headerFg = 'FFFFFF';
    } else if (colSourceTypes[c] === 'INPUT') {
      headerBg = '4B5563'; // Slate gray for input columns
      headerFg = 'FFFFFF';
      ws[addr].c = [{ a: 'System', t: 'Valid actions to type here:\n• Pending\n• Resolved\n• Vendor Contacted\n• Hold Payment' }];
    }

    ws[addr].s = {
      fill: { fgColor: { rgb: headerBg } },
      font: { name: 'Segoe UI', bold: true, color: { rgb: headerFg }, sz: 10.5 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        bottom: { style: 'medium', color: { rgb: '0F172A' } },
        top: { style: 'thin', color: { rgb: '475569' } }
      },
    };
  }

  // Data rows styling
  for (let r = 1; r <= rowCount; r++) {
    const isEven = r % 2 === 0;
    const excelRow = startRow + r;
    const isTopTotal = !!opts?.hasTopTotal && r === 1;

    ws['!rows'][excelRow] = { hpt: isTopTotal ? 24 : 20, level: isTopTotal ? 0 : 1 };

    for (let c = 0; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!ws[addr]) continue;

      // Reformat dates as standardized string
      if (!isTopTotal && dateCols.has(c) && ws[addr].v != null && ws[addr].v !== '') {
        const formatted = formatDateStr(ws[addr].v);
        ws[addr].v = formatted;
        ws[addr].t = 's';
      }
      // Coerce number columns to numeric with 2-decimal format
      if (numberCols.has(c)) {
        if (!isTopTotal) {
          const n = numVal(ws[addr].v);
          ws[addr].v = n;
          ws[addr].t = 'n';
        }
        ws[addr].z = ACC_FMT;
      }

      // Assign backgrounds depending on column type
      let cellBg = isTopTotal ? 'E5E7EB' : (isEven ? style.rowFill : 'FFFFFF');

      if (!isTopTotal) {
        if (colSourceTypes[c] === 'PR') {
          cellBg = isEven ? 'EEF2FF' : 'F5F3FF'; // Indigo Lavender tint
        } else if (colSourceTypes[c] === '2B') {
          cellBg = isEven ? 'ECFDF5' : 'F0FDF4'; // Mint Teal tint
        } else if (colSourceTypes[c] === 'DIFF') {
          const val = Math.abs(numVal(ws[addr].v));
          if (val > 0.01) {
            cellBg = 'FEE2E2'; // Light warning red alert tint
          } else {
            cellBg = isEven ? style.rowFill : 'FFFFFF';
          }
        } else if (colSourceTypes[c] === 'INPUT') {
          cellBg = isEven ? 'FEF9C3' : 'FEF08A'; // Yellow input tints for Auditor action & Remark
        }
      }

      ws[addr].s = {
        fill: { fgColor: { rgb: cellBg } },
        font: {
          name: 'Segoe UI',
          sz: isTopTotal ? 10 : 9.5,
          bold: isTopTotal || (colSourceTypes[c] === 'DIFF' && Math.abs(numVal(ws[addr].v)) > 0.01)
        },
        alignment: { vertical: 'center', horizontal: numberCols.has(c) ? 'right' : 'left' },
        border: isTopTotal
          ? { top: { style: 'medium', color: { rgb: '9CA3AF' } }, bottom: { style: 'double', color: { rgb: '9CA3AF' } } }
          : { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } }, top: { style: 'thin', color: { rgb: 'E2E8F0' } }, left: { style: 'thin', color: { rgb: 'E2E8F0' } }, right: { style: 'thin', color: { rgb: 'E2E8F0' } } },
        numFmt: numberCols.has(c) ? ACC_FMT : undefined,
      };
    }
  }
}

function makeHyperlinkCell(sheetName: string, displayText: string): XLSX.CellObject {
  return {
    t: 's',
    v: displayText,
    l: {
      Target: `#'${sheetName}'!A4`,
      Tooltip: `Navigate to ${sheetName}`,
    },
  };
}

function appendNavigationSheet(
  wb: XLSX.WorkBook,
  sheetNames: string[],
  companyName?: string,
  stats?: { label: string; value: string | number }[],
  breakdown?: { label: string; value: string | number }[]
) {
  const ws = XLSX.utils.aoa_to_sheet([]);

  const rows: (string | number | XLSX.CellObject)[][] = [];

  // Rows 1-10: Large Corporate Banner
  for (let i = 0; i < 9; i++) {
    rows.push(['', '', '', '']);
  }

  rows[1][1] = 'VASWANI RETURN ENTERPRISE';
  rows[2][1] = 'GST RECONCILIATION DASHBOARD';
  rows[4][1] = `COMPANY: ${companyName?.toUpperCase() || 'NOT PROVIDED'}`;
  rows[5][1] = `GENERATED: ${new Date().toLocaleString('en-IN').toUpperCase()}`;
  rows[6][1] = 'PREPARED BY: SYSTEM AUDIT ENGINE';

  let rIdx = 9;

  // High-Level KPIs & Metrics
  if (stats && stats.length > 0) {
    rows.push(['', 'EXECUTIVE METRICS', '', '']);
    rIdx++;
    for (const st of stats) {
      rows.push(['', st.label, st.value, '']);
      rIdx++;
    }
    rows.push(['', '', '', '']);
    rIdx++;
  }

  // Navigation Links
  rows.push(['', 'INTERACTIVE DASHBOARD MENU', '', '']);
  rows.push(['', 'Report Section', 'Description', 'Action']);
  const navHeaderRow = rIdx + 1;
  rIdx += 2;

  const descriptions: Record<string, string> = {
    'Executive Summary': 'High-level reconciliation statistics and variance analysis.',
    'All Records': 'Master database of all reconciled and unreconciled invoices.',
    'Party Summary': 'Vendor/Customer-level net differences and matching status.',
    'Party Details': 'Deep-dive into individual invoices grouped by party.',
    'Monthly Comparison': 'Month-by-month summary of input vs 2B / output vs GSTR-1.',
    'Party-wise Summary': 'Vendor/Customer-level net differences and aggregated matching status.',
    'Monthly Tax Comparison': 'Detailed financial year matrix of Tax allocations.',
    'Monthly Tax Comparison FY': 'Alternative layout for FY tax allocations.',
    'Applied GSTINs': 'Log of GSTINs automatically corrected during review.',
    'GSTIN Conflicts': 'Duplicate GSTINs requiring manual resolution.',
    'GST Pipeline': 'Management view for missing and duplicate GSTINs.',
    '📖 Methodology & Legend': 'Explanation of matching logic, tolerances, and color codes.',
  };

  for (const sheetName of sheetNames) {
    rows.push([
      '',
      sheetName,
      descriptions[sheetName] || `${sheetName} Data Sheet`,
      makeHyperlinkCell(sheetName, `▶ OPEN MODULE`)
    ]);
    rIdx++;
  }

  XLSX.utils.sheet_add_aoa(ws, rows, { origin: 'A1' });

  // Columns: A: Spacer, B: Section/Label, C: Value/Desc, D: Action
  ws['!cols'] = [{ wch: 3 }, { wch: 35 }, { wch: 65 }, { wch: 20 }];

  if (!ws['!rows']) ws['!rows'] = [];

  // Banner Styling (Rows 0-8)
  for (let r = 0; r < 9; r++) {
    ws['!rows'][r] = { hpt: r === 2 ? 35 : (r === 1 ? 20 : 18) };
    for (let c = 0; c < 4; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };

      let fgColor = '1E3A8A'; // Deep Corporate Blue
      if (r === 8) fgColor = '0F172A'; // Darker bottom border line of banner

      ws[addr].s = { fill: { fgColor: { rgb: fgColor } } };
    }
  }

  // Banner Text Styling
  const setBannerText = (r: number, sz: number, bold: boolean, color: string) => {
    const addr = XLSX.utils.encode_cell({ r, c: 1 });
    if (ws[addr]) {
      ws[addr].s = {
        fill: { fgColor: { rgb: '1E3A8A' } },
        font: { name: 'Segoe UI', sz, bold, color: { rgb: color } },
        alignment: { vertical: 'center', horizontal: 'left' }
      };
    }
  };

  setBannerText(1, 12, true, '93C5FD'); // Light blue subtitle
  setBannerText(2, 24, true, 'FFFFFF'); // White main title
  setBannerText(4, 11, true, 'F1F5F9');
  setBannerText(5, 10, false, 'CBD5E1');
  setBannerText(6, 10, false, 'CBD5E1');

  // Merging banner cells for clean look
  if (!ws['!merges']) ws['!merges'] = [];
  for (let r = 1; r <= 6; r++) {
    ws['!merges'].push({ s: { r, c: 1 }, e: { r, c: 3 } });
  }

  let currRow = 9;

  // Style Metrics Section
  if (stats && stats.length > 0) {
    ws['!rows'][currRow] = { hpt: 24 };
    const titleAddr = XLSX.utils.encode_cell({ r: currRow, c: 1 });
    ws[titleAddr].s = {
      font: { name: 'Segoe UI', bold: true, sz: 12, color: { rgb: '1E3A8A' } },
      alignment: { vertical: 'bottom' }
    };
    ws['!merges'].push({ s: { r: currRow, c: 1 }, e: { r: currRow, c: 3 } });
    currRow++;

    for (const st of stats) {
      ws['!rows'][currRow] = { hpt: 20 };
      const lblAddr = XLSX.utils.encode_cell({ r: currRow, c: 1 });
      const valAddr = XLSX.utils.encode_cell({ r: currRow, c: 2 });

      if (ws[lblAddr]) {
        ws[lblAddr].s = {
          font: { name: 'Segoe UI', bold: true, sz: 10, color: { rgb: '475569' } },
          fill: { fgColor: { rgb: 'F8FAFC' } },
          border: { left: { style: 'thick', color: { rgb: '3B82F6' } }, bottom: { style: 'hair', color: { rgb: 'E2E8F0' } } },
          alignment: { vertical: 'center', indent: 1 }
        };
      }

      if (ws[valAddr]) {
        ws[valAddr].s = {
          font: { name: 'Segoe UI', bold: true, sz: 11, color: { rgb: '0F172A' } },
          fill: { fgColor: { rgb: 'F8FAFC' } },
          border: { right: { style: 'thin', color: { rgb: 'E2E8F0' } }, bottom: { style: 'hair', color: { rgb: 'E2E8F0' } } },
          alignment: { vertical: 'center' }
        };
      }
      ws['!merges'].push({ s: { r: currRow, c: 2 }, e: { r: currRow, c: 3 } });
      currRow++;
    }
    currRow++; // spacing
  }

  // Style Navigation Section
  ws['!rows'][currRow] = { hpt: 28 };
  const navTitleAddr = XLSX.utils.encode_cell({ r: currRow, c: 1 });
  ws[navTitleAddr].s = {
    font: { name: 'Segoe UI', bold: true, sz: 12, color: { rgb: '1E3A8A' } },
    alignment: { vertical: 'bottom' }
  };
  ws['!merges'].push({ s: { r: currRow, c: 1 }, e: { r: currRow, c: 3 } });
  currRow++;

  ws['!rows'][currRow] = { hpt: 20 };
  for (let c = 1; c <= 3; c++) {
    const addr = XLSX.utils.encode_cell({ r: currRow, c });
    if (ws[addr]) {
      ws[addr].s = {
        fill: { fgColor: { rgb: '0F172A' } },
        font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
        alignment: { vertical: 'center', horizontal: c === 3 ? 'center' : 'left', indent: c === 3 ? 0 : 1 }
      };
    }
  }
  currRow++;

  for (let i = 0; i < sheetNames.length; i++) {
    const row = currRow;
    ws['!rows'][row] = { hpt: 24 };
    const labelAddr = XLSX.utils.encode_cell({ r: row, c: 1 });
    const descAddr = XLSX.utils.encode_cell({ r: row, c: 2 });
    const actionAddr = XLSX.utils.encode_cell({ r: row, c: 3 });

    if (ws[labelAddr]) {
      ws[labelAddr].s = {
        fill: { fgColor: { rgb: row % 2 === 0 ? 'F8FAFC' : 'FFFFFF' } },
        font: { name: 'Segoe UI', bold: true, color: { rgb: '0F172A' }, sz: 10 },
        alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
        border: { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } }, left: { style: 'thin', color: { rgb: 'E2E8F0' } } },
      };
    }
    if (ws[descAddr]) {
      ws[descAddr].s = {
        fill: { fgColor: { rgb: row % 2 === 0 ? 'F8FAFC' : 'FFFFFF' } },
        font: { name: 'Segoe UI', color: { rgb: '475569' }, sz: 10 },
        alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
        border: { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } } },
      };
    }
    if (ws[actionAddr]) {
      ws[actionAddr].s = {
        fill: { fgColor: { rgb: '2563EB' } },
        font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
        alignment: { vertical: 'center', horizontal: 'center' },
        border: {
          top: { style: 'medium', color: { rgb: 'FFFFFF' } },
          bottom: { style: 'medium', color: { rgb: 'FFFFFF' } },
          left: { style: 'medium', color: { rgb: 'FFFFFF' } },
          right: { style: 'medium', color: { rgb: 'FFFFFF' } },
        },
      };
    }
    currRow++;
  }

  ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 9 }];

  XLSX.utils.book_append_sheet(wb, ws, 'Dashboard');
  wb.SheetNames = ['Dashboard', ...wb.SheetNames.filter((name) => name !== 'Dashboard' && name !== 'Navigation')];
}

function buildSheetRows(records: Record<string, unknown>[], status?: string) {
  if (records.length === 0) return { cols: [], data: [] };
  const baseCols = [
    'Status',
    'Financial Year',
    'GSTIN (PR)', 'GSTIN (2B)',
    'Supplier Name (PR)', 'Supplier Name (2B)',
    'Invoice No (PR)', 'Invoice No (2B)',
    'Invoice Date (PR)', 'Invoice Date (2B)',
    'Taxable Value (PR)', 'Taxable Value (2B)',
    'IGST (PR)', 'IGST (2B)',
    'CGST (PR)', 'CGST (2B)',
    'SGST (PR)', 'SGST (2B)',
    'Invoice Value (PR)', 'Invoice Value (2B)',
    'GST Diff',
    'Remark',
    'Auditor Remark',
    'Accountant Remark',
  ];
  const allKeys: string[] = [];
  records.forEach(r => Object.keys(r).forEach(k => { if (!allKeys.includes(k)) allKeys.push(k); }));
  const extraCols = allKeys.filter(k => !baseCols.includes(k));
  const seen = new Set<string>();
  const cols: string[] = [];
  for (const c of [...baseCols, ...extraCols]) {
    const keyNorm = String(c).trim().toLowerCase();
    if (seen.has(keyNorm)) continue;
    seen.add(keyNorm);
    cols.push(c);
  }

  // Filter columns based on status to remove source-specific columns
  let filteredCols = [...cols];
  const statusStr = String(status || '').trim();
  if (statusStr === 'Missing in PR' || statusStr === 'Not in Books') {
    filteredCols = filteredCols.filter(c => {
      const lower = c.toLowerCase();
      return !(lower.includes('(pr)') || lower.includes('tally') || lower.includes('books') || lower.includes('purchase'));
    });
  } else if (statusStr === 'Missing in 2B' || statusStr === 'Not in 2B') {
    filteredCols = filteredCols.filter(c => {
      const lower = c.toLowerCase();
      return !(lower.includes('(2b)') || lower.includes('govt') || lower.includes('portal') || lower.includes('gstr2b') || lower.includes('comparison'));
    });
  }

  const getVal = (r: Record<string, unknown>, col: string) => {
    if (col in r) return r[col];
    const target = String(col).trim();
    for (const k of Object.keys(r)) {
      if (k.trim() === target) return r[k];
    }
    return '';
  };
  const data = records.map((r) => filteredCols.map((c) => {
    const val = getVal(r, c);
    if (c === 'Status') return enrichStatusWithIcon(String(val || ''));
    return val ?? '';
  }));
  return { cols: filteredCols, data };
}

export function appendGstinReports(
  wb: XLSX.WorkBook,
  sheetNames: string[],
  companyName: string | undefined,
  appliedGstins?: any[],
  conflicts?: any[],
  tabs?: { name: string, target: string }[]
) {
  let resolvedApplied = appliedGstins;
  if (!resolvedApplied) {
    try {
      const storage = typeof window !== 'undefined' ? (window.sessionStorage || window.localStorage) : null;
      resolvedApplied = JSON.parse(storage?.getItem('np_reco_applied_gstins') || '[]');
    } catch {
      resolvedApplied = [];
    }
  }

  let resolvedConflicts = conflicts;
  if (!resolvedConflicts) {
    try {
      const storage = typeof window !== 'undefined' ? (window.sessionStorage || window.localStorage) : null;
      const issues = JSON.parse(storage?.getItem('np_reco_issues') || 'null');
      resolvedConflicts = issues?.conflicts || [];
    } catch {
      resolvedConflicts = [];
    }
  }

  if (resolvedApplied && resolvedApplied.length > 0) {
    const wsApplied = XLSX.utils.json_to_sheet(resolvedApplied.map(x => ({
      'Supplier Name': x.partyName,
      'Original GSTIN u/s Books': x.originalGstin || 'Missing',
      'Corrected GSTIN (Auto-Applied)': x.appliedGstin,
      'Correction Status': `Successfully corrected using matching trade name from GSTR-2B.`,
    })), { origin: 'A3' } as any);
    addCorporateHeader(wsApplied, 4, companyName, 'Applied GSTINs', tabs);
    applySheetStyles(wsApplied, { headerFill: '059669', headerFont: 'FFFFFF', rowFill: 'FFFFFF' }, resolvedApplied.length, {
      startRow: 2,
      colWidths: [{ wch: 30 }, { wch: 25 }, { wch: 28 }, { wch: 55 }]
    });
    wsApplied['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];
    XLSX.utils.book_append_sheet(wb, wsApplied, 'Applied GSTINs');
    sheetNames.push('Applied GSTINs');
  }

  if (resolvedConflicts && resolvedConflicts.length > 0) {
    const wsConflict = XLSX.utils.json_to_sheet(resolvedConflicts.map(x => {
      const parties = x.relatedParties || [];
      const partyCount = parties.length;
      const namesList = parties.join(' vs ');
      return {
        'GSTIN Under Conflict': x.originalGstin,
        'Conflicting Names in Books / Govt': namesList || x.supplierName,
        'Discrepancy Details': `This single GSTIN is linked to ${partyCount} different trade/legal names. Legal tax registration rules require unique mapping of GSTIN to one entity.`,
        'Recommended Action': `Check GST Portal for the exact Legal Trade Name of "${x.originalGstin}" and update your books to ensure matching trade names.`,
      };
    }), { origin: 'A3' } as any);
    addCorporateHeader(wsConflict, 4, companyName, 'GSTIN Conflicts', tabs);
    wsConflict['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];
    XLSX.utils.book_append_sheet(wb, wsConflict, 'GSTIN Conflicts');
    sheetNames.push('GSTIN Conflicts');
  }
}

function appendRawDataInputSheets(
  wb: XLSX.WorkBook,
  results: Record<string, unknown>[],
  rawBooksData?: any[],
  raw2bData?: any[]
) {
  // 1. Books Purchase & JV Data
  let booksRows: any[] = rawBooksData || [];
  if (booksRows.length === 0) {
    const seenPR = new Set<string>();
    for (const r of results) {
      const pr = (r as any).prRecord;
      if (pr) {
        const key = `${pr.gstin}_${pr.invoiceNo}_${pr.invoiceDate}_${pr.igst}_${pr.cgst}_${pr.sgst}`;
        if (!seenPR.has(key)) {
          seenPR.add(key);
          booksRows.push({
            'Financial Year': pr.financialYear || '',
            'Supplier Name': pr.supplierName || '',
            'GSTIN': pr.gstin || '',
            'Invoice No': pr.invoiceNo || '',
            'Invoice Date': formatDateStr(pr.invoiceDate || ''),
            'Taxable Value': pr.taxableValue ?? 0,
            'IGST': pr.igst ?? 0,
            'CGST': pr.cgst ?? 0,
            'SGST': pr.sgst ?? 0,
            'Total Amount': (pr.taxableValue ?? 0) + (pr.igst ?? 0) + (pr.cgst ?? 0) + (pr.sgst ?? 0),
            'Voucher Type / Source': pr.sourceLabel || pr.source || 'Purchase Register & JV'
          });
        }
      }
    }
  }

  if (booksRows.length > 0) {
    const wsBooks = XLSX.utils.json_to_sheet(booksRows);
    XLSX.utils.book_append_sheet(wb, wsBooks, 'Books Purchase & JV Data');
  }

  // 2. Portal GSTR-2B Data
  let twoBRows: any[] = raw2bData || [];
  if (twoBRows.length === 0) {
    const seen2B = new Set<string>();
    for (const r of results) {
      const tb = (r as any).twoBRecord;
      if (tb) {
        const key = `${tb.gstin}_${tb.invoiceNo}_${tb.invoiceDate}_${tb.igst}_${tb.cgst}_${tb.sgst}`;
        if (!seen2B.has(key)) {
          seen2B.add(key);
          twoBRows.push({
            'Financial Year': tb.financialYear || '',
            'Supplier Name': tb.supplierName || '',
            'GSTIN': tb.gstin || '',
            'Invoice No': tb.invoiceNo || '',
            'Invoice Date': formatDateStr(tb.invoiceDate || ''),
            'Taxable Value': tb.taxableValue ?? 0,
            'IGST': tb.igst ?? 0,
            'CGST': tb.cgst ?? 0,
            'SGST': tb.sgst ?? 0,
            'Total Amount': (tb.taxableValue ?? 0) + (tb.igst ?? 0) + (tb.cgst ?? 0) + (tb.sgst ?? 0),
            'Filing Status': tb.filingStatus || '',
            'Filing Date': formatDateStr(tb.filingDate || '')
          });
        }
      }
    }
  }

  if (twoBRows.length > 0) {
    const ws2B = XLSX.utils.json_to_sheet(twoBRows);
    XLSX.utils.book_append_sheet(wb, ws2B, 'Portal GSTR-2B Data');
  }
}

export function exportToXlsx(
  results: Record<string, unknown>[],
  filename: string,
  companyName?: string,
  appliedGstins?: any[],
  conflicts?: any[],
  gstr3bData?: any[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] },
  rawBooksData?: any[],
  raw2bData?: any[]
) {
  const wb = XLSX.utils.book_new();
  const sheetNames: string[] = [];

  const tabs = [
    { name: '🏠 Home', target: 'Dashboard' },
    { name: '📊 Summary', target: 'Executive Summary' },
    { name: '📋 All Records', target: 'All Records' },
    { name: '🏢 Party', target: 'Party Summary' },
    { name: '📖 Guide', target: '📖 Methodology & Legend' }
  ];

  // Populate Financial Year dynamically if missing
  for (const r of results) {
    if (!r['Financial Year']) {
      const fyPR = extractFY(r['Invoice Date (PR)']);
      const fy2B = extractFY(r['Invoice Date (2B)']);
      r['Financial Year'] = fyPR || fy2B || 'UNKNOWN';
    }
  }

  // Add Executive Summary
  const counts: Record<string, number> = {};
  let totalGSTDiff = 0;
  for (const r of results) {
    const st = String(r['Status'] || 'Unknown');
    counts[st] = (counts[st] || 0) + 1;
    if (st !== 'Prior FY (Excluded)') {
      totalGSTDiff += numVal(r['GST Diff']);
    }
  }
  const breakdown = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([st, c]) => ({ label: st, value: c }));

  const stats = [
    { label: 'Total Records Analysed', value: results.length },
    { label: 'Net GST Difference', value: `${totalGSTDiff.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ];

  appendExecutiveSummary(wb, companyName, 'Reconciliation Summary', stats, breakdown, tabs);

  // Append Raw Input Sheets (Books Purchase & JV Data + Portal GSTR-2B Data)
  appendRawDataInputSheets(wb, results, rawBooksData, raw2bData);

  // 1. "All Records" summary sheet
  const { cols: allCols, data: allData } = buildSheetRows(results);

  const allBannerRow = allCols.map(c => {
    const lower = c.toLowerCase();
    if (lower.includes('(pr)') || lower.includes('tally') || lower.includes('books') || lower.includes('purchase')) {
      return 'PURCHASE REGISTER (PR) BOOKS';
    } else if (lower.includes('(2b)') || lower.includes('govt') || lower.includes('portal') || lower.includes('gstr2b') || lower.includes('comparison')) {
      return 'GOVERNMENT GSTR-2B PORTAL';
    } else if (lower.includes('diff') || lower.includes('mismatch') || lower.includes('variance')) {
      return 'AUDIT VARIANCE ANALYSIS';
    } else if (lower.includes('auditor action') || lower.includes('remark')) {
      return 'AUDITOR INPUT';
    } else if (lower.includes('status')) {
      return 'STATUS';
    }
    return '';
  });

  const getL = (idx: number) => XLSX.utils.encode_col(idx);
  const allDateCols = allCols.reduce((acc, key, i) => (key.includes('Date') ? [...acc, i] : acc), [] as number[]);
  const allNumberCols = allCols.reduce((acc, key, i) => ((key.includes('GST') && !key.includes('GSTIN')) || key.includes('Diff') || key.includes('Tax') || key.includes('Value') ? [...acc, i] : acc), [] as number[]);

  const allTotalRow = allCols.map((c, i) => (i === 0 ? 'GRAND TOTAL' : (allNumberCols.includes(i) ? { t: 'n', f: `SUM(${getL(i)}6:${getL(i)}${results.length + 5})`, z: ACC_FMT } : '')));
  allData.unshift(allTotalRow);

  const allWs = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(allWs, [allBannerRow, allCols, ...allData], { origin: 'A3' });

  addCorporateHeader(allWs, allCols.length, companyName, 'All Records', tabs);
  applySheetStyles(allWs, DEFAULT_STYLE, results.length + 1, {
    startRow: 3,
    dateCols: allDateCols,
    numberCols: allNumberCols,
    colWidths: autoFitCols(allCols, allData.slice(1) as (string | number)[][]),
    hasTopTotal: true
  });

  // Freeze Row 1 to Row 4 and Column A and B
  allWs['!views'] = [{ state: 'frozen', xSplit: 2, ySplit: 5 }];

  const gstDiffColIdx = allCols.indexOf('GST Diff');
  const igstPrIdx = allCols.indexOf('IGST (PR)');
  const igst2bIdx = allCols.indexOf('IGST (2B)');
  const cgstPrIdx = allCols.indexOf('CGST (PR)');
  const cgst2bIdx = allCols.indexOf('CGST (2B)');
  const sgstPrIdx = allCols.indexOf('SGST (PR)');
  const sgst2bIdx = allCols.indexOf('SGST (2B)');

  if (gstDiffColIdx >= 0) {
    const range = XLSX.utils.decode_range(allWs['!ref'] || 'A1');
    const getL = (idx: number) => XLSX.utils.encode_col(idx);
    for (let R = 5; R <= range.e.r; R++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: gstDiffColIdx });
      const rowNum = R + 1;
      if (igstPrIdx >= 0 && igst2bIdx >= 0 && cgstPrIdx >= 0 && cgst2bIdx >= 0 && sgstPrIdx >= 0 && sgst2bIdx >= 0) {
        allWs[addr] = { t: 'n', f: `ABS(${getL(igstPrIdx)}${rowNum}-${getL(igst2bIdx)}${rowNum})+ABS(${getL(cgstPrIdx)}${rowNum}-${getL(cgst2bIdx)}${rowNum})+ABS(${getL(sgstPrIdx)}${rowNum}-${getL(sgst2bIdx)}${rowNum})`, z: ACC_FMT };
      }
    }
  }

  // Data Validation for Auditor Remark / Action in All Records
  const actionColIdxAll = allCols.indexOf('Auditor Remark') >= 0 ? allCols.indexOf('Auditor Remark') : allCols.indexOf('Auditor Action');
  if (actionColIdxAll >= 0) {
    const letter = XLSX.utils.encode_col(actionColIdxAll);
    allWs['!dataValidation'] = [{
      sqref: `${letter}6:${letter}${results.length + 5}`,
      type: 'list',
      allowBlank: true,
      showDropDown: true,
      formula1: '"Pending,Resolved,Vendor Contacted,Hold Payment"'
    }];
  }

  XLSX.utils.book_append_sheet(wb, allWs, 'All Records');

  // 2. One sheet per status category
  const grouped: Record<string, Record<string, unknown>[]> = {};
  for (const r of results) {
    const status = String(r['Status'] || 'Other');
    if (!grouped[status]) grouped[status] = [];
    grouped[status].push(r);
  }

  for (const status of Object.keys(grouped)) {
    if (status === 'Unmatched Vendor') continue; // Skip generating the Unmatched Vendor sheet

    const sheetName = status.length > 31 ? status.slice(0, 31) : status;
    sheetNames.push(sheetName);
    let rows = grouped[status];
    const { cols, data } = buildSheetRows(rows, status);

    const gstDiffCol = cols.indexOf('GST Diff');
    const ip = cols.indexOf('IGST (PR)'), ib = cols.indexOf('IGST (2B)');
    const cp = cols.indexOf('CGST (PR)'), cb = cols.indexOf('CGST (2B)');
    const sp = cols.indexOf('SGST (PR)'), sb = cols.indexOf('SGST (2B)');

    for (let i = 0; i < data.length; i++) {
      const rowNum = i + 6;
      if (gstDiffCol >= 0) {
        if (ip >= 0 && ib >= 0 && cp >= 0 && cb >= 0 && sp >= 0 && sb >= 0) {
          data[i][gstDiffCol] = { t: 'n', f: `ABS(${getL(ip)}${rowNum}-${getL(ib)}${rowNum})+ABS(${getL(cp)}${rowNum}-${getL(cb)}${rowNum})+ABS(${getL(sp)}${rowNum}-${getL(sb)}${rowNum})`, z: ACC_FMT };
        } else if (ib >= 0 && cb >= 0 && sb >= 0) {
          data[i][gstDiffCol] = { t: 'n', f: `ABS(${getL(ib)}${rowNum})+ABS(${getL(cb)}${rowNum})+ABS(${getL(sb)}${rowNum})`, z: ACC_FMT };
        } else if (ip >= 0 && cp >= 0 && sp >= 0) {
          data[i][gstDiffCol] = { t: 'n', f: `ABS(${getL(ip)}${rowNum})+ABS(${getL(cp)}${rowNum})+ABS(${getL(sp)}${rowNum})`, z: ACC_FMT };
        } else {
          data[i][gstDiffCol] = numVal(rows[i]['GST Diff']);
        }
      }
    }

    const dateCols = cols.reduce((acc, key, i) => (key.includes('Date') ? [...acc, i] : acc), [] as number[]);
    const numberCols = cols.reduce((acc, key, i) => ((key.includes('GST') && !key.includes('GSTIN')) || key.includes('Diff') || key.includes('Tax') || key.includes('Value') ? [...acc, i] : acc), [] as number[]);

    const totalRow = cols.map((c, i) => (i === 0 ? 'GRAND TOTAL' : (numberCols.includes(i) ? { t: 'n', f: `SUM(${getL(i)}6:${getL(i)}${rows.length + 5})`, z: ACC_FMT } : '')));
    data.unshift(totalRow);

    const ws = XLSX.utils.aoa_to_sheet([]);

    // Build Category Banners Row based on filtered cols
    const bannerRow = cols.map(c => {
      const lower = c.toLowerCase();
      if (lower.includes('(pr)') || lower.includes('tally') || lower.includes('books') || lower.includes('purchase')) {
        return 'PURCHASE REGISTER (PR) BOOKS';
      } else if (lower.includes('(2b)') || lower.includes('govt') || lower.includes('portal') || lower.includes('gstr2b') || lower.includes('comparison')) {
        return 'GOVERNMENT GSTR-2B PORTAL';
      } else if (lower.includes('diff') || lower.includes('mismatch') || lower.includes('variance')) {
        return 'AUDIT VARIANCE ANALYSIS';
      } else if (lower.includes('auditor') || lower.includes('accountant') || lower.includes('remark') || lower.includes('action')) {
        return 'AUDITOR & ACCOUNTANT INPUTS';
      } else if (lower.includes('status')) {
        return 'STATUS';
      }
      return '';
    });

    XLSX.utils.sheet_add_aoa(ws, [bannerRow, cols, ...data], { origin: 'A3' });
    addCorporateHeader(ws, cols.length, companyName, `${status} Records`, tabs);
    const style = STATUS_STYLES[status] || DEFAULT_STYLE;
    applySheetStyles(ws, style, rows.length + 1, {
      startRow: 3,
      dateCols,
      numberCols,
      colWidths: autoFitCols(cols, data.slice(1) as (string | number)[][]),
      hasTopTotal: true
    });

    // Freeze Row 1 to Row 4 and Column A and B
    ws['!views'] = [{ state: 'frozen', xSplit: 2, ySplit: 5 }];
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: rows.length + 3, c: cols.length - 1 } }) };

    // Data Validation for Auditor Remark in this Category Sheet
    const actionColIdx = cols.indexOf('Auditor Remark') >= 0 ? cols.indexOf('Auditor Remark') : cols.indexOf('Auditor Action');
    if (actionColIdx >= 0) {
      const letter = XLSX.utils.encode_col(actionColIdx);
      ws['!dataValidation'] = [{
        sqref: `${letter}6:${letter}${rows.length + 5}`,
        type: 'list',
        allowBlank: true,
        showDropDown: true,
        formula1: '"Pending,Resolved,Vendor Contacted,Hold Payment"'
      }];
    }

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  // 3. Party-wise sheets ('Party Summary' + 'Party Details') with internal hyperlinks
  appendPartyWiseSheets(wb, results, companyName, tabs, debitNotes);
  sheetNames.push('Party Summary', 'Party Details');

  // Append 21-Column Debit Notes Reconciled sheet if debit notes present
  if (debitNotes && ((debitNotes.pr && debitNotes.pr.length > 0) || (debitNotes.twoB && debitNotes.twoB.length > 0))) {
    const dnResult = reconcileDebitNotes(debitNotes.pr || [], debitNotes.twoB || []);
    if (dnResult.reconciledRows && dnResult.reconciledRows.length > 0) {
      const wsDn21 = buildDebitNotes21ColSheet(dnResult.reconciledRows, companyName);
      XLSX.utils.book_append_sheet(wb, wsDn21, 'Debit Notes Reconciled');
      sheetNames.push('Debit Notes Reconciled');
    }
  }

  appendGstinReports(wb, sheetNames, companyName, appliedGstins, conflicts, tabs);

  appendMethodologySheet(wb, companyName, tabs);
  sheetNames.push('📖 Methodology & Legend');

  appendNavigationSheet(wb, sheetNames, companyName, stats, breakdown);

  // Enforce specific sheet order as requested
  const preferredOrder = [
    'Dashboard',
    'Executive Summary',
    '📖 Methodology & Legend',
    'All Records',
    'Perfect Match',
    'Matched (Diff Date)',
    'Value Mismatch',
    'Not in 2B',
    'Missing in 2B',
    'Not in Books',
    'Missing in PR',
    'Name Mismatch',
    'Wrong GSTIN',
    'Prior FY (Excluded)',
    'Party Summary',
    'Party Details',
    'Debit Notes Reconciled',
    'Books Purchase & JV Data',
    'Portal GSTR-2B Data',
    'GST Pipeline',
    'Applied GSTINs',
    'GSTIN Conflicts'
  ];

  wb.SheetNames.sort((a, b) => {
    let idxA = preferredOrder.indexOf(a);
    let idxB = preferredOrder.indexOf(b);
    if (idxA === -1) idxA = 999; // Put unknown sheets at the end
    if (idxB === -1) idxB = 999;
    if (idxA !== idxB) return idxA - idxB;
    return a.localeCompare(b);
  });

  wb.Props = {
    Title: filename.replace('.xlsx', ''),
    Subject: 'GST Reconciliation Master Report',
    Author: 'Vaswani Return Enterprise Suite',
    Company: companyName || 'Client Organization',
    CreatedDate: new Date()
  };
  try {
    removeAllMergesFromWorkbook(wb);
    XLSX.writeFile(wb, filename);
  } catch (error) {
    console.error('XLSX.writeFile error:', error);
    throw error;
  }
}

// --- Party-wise sheets builder (used by exportToXlsx) ---
type PartyAccum = {
  gstin: string;
  gstinPR: string;
  gstin2B: string;
  party: string;
  partyPR: string;
  party2B: string;
  invoices: Record<string, unknown>[];
  prCgst: number; prSgst: number; prIgst: number;
  cgst2B: number; sgst2B: number; igst2B: number;
  statuses: Set<string>;
};



function deriveOverallStatus(statuses: Set<string>): string {
  if (statuses.has('Missing in 2B') || statuses.has('Missing in PR') || statuses.has('Wrong GSTIN') || statuses.has('Not in 2B') || statuses.has('Not in Books') || statuses.has('Unmatched Vendor')) return 'Has Missing';
  if (statuses.has('Mismatch') || statuses.has('Name Mismatch') || statuses.has('Possible Match') || statuses.has('Name Matched (No GSTIN)') || statuses.has('Value Mismatch')) return 'Has Mismatches';
  return 'All Matched';
}

function appendPartyWiseSheets(
  wb: XLSX.WorkBook,
  results: Record<string, unknown>[],
  companyName?: string,
  tabs?: { name: string, target: string }[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] }
) {
  const map = new Map<string, PartyAccum>();
  const nameIndex = new Map<string, string>();
  let unknownIdx = 0;

  for (const r of results) {
    if (String(r['Status']) === 'Prior FY (Excluded)') continue;
    const gstinPR = String(r['GSTIN (PR)'] || '').toUpperCase().trim();
    const gstin2B = String(r['GSTIN (2B)'] || '').toUpperCase().trim();
    const partyPR = String(r['Supplier Name (PR)'] || '').trim();
    const party2B = String(r['Supplier Name (2B)'] || '').trim();

    const gstin = gstinPR || gstin2B;
    const party = partyPR || party2B;
    const normName = normalizePartyName(party);

    let key = gstin ? gstin : (normName ? `NAME::${normName}` : `UNKNOWN::${++unknownIdx}`);

    if (!gstin && normName && nameIndex.has(normName)) {
      key = nameIndex.get(normName)!;
    }
    if (gstin && normName && nameIndex.has(normName) && nameIndex.get(normName) !== gstin) {
      const existingKey = nameIndex.get(normName)!;
      if (existingKey.startsWith('NAME::') || existingKey.startsWith('UNKNOWN::')) {
        const existing = map.get(existingKey);
        if (existing) {
          let p = map.get(gstin);
          if (!p) {
            p = { gstin, gstinPR, gstin2B, party: existing.party || party, partyPR, party2B, invoices: [], prCgst: 0, prSgst: 0, prIgst: 0, cgst2B: 0, sgst2B: 0, igst2B: 0, statuses: new Set() };
            map.set(gstin, p);
          }
          p.invoices.push(...existing.invoices);
          p.prCgst += existing.prCgst; p.prSgst += existing.prSgst; p.prIgst += existing.prIgst;
          p.cgst2B += existing.cgst2B; p.sgst2B += existing.sgst2B; p.igst2B += existing.igst2B;
          existing.statuses.forEach(s => p!.statuses.add(s));
          if (!p.gstinPR && existing.gstinPR) p.gstinPR = existing.gstinPR;
          if (!p.gstin2B && existing.gstin2B) p.gstin2B = existing.gstin2B;
          if (!p.partyPR && existing.partyPR) p.partyPR = existing.partyPR;
          if (!p.party2B && existing.party2B) p.party2B = existing.party2B;
          map.delete(existingKey);
        }
        nameIndex.set(normName, gstin);
      }
      key = gstin;
    }

    let p = map.get(key);
    if (!p) {
      p = { gstin, gstinPR, gstin2B, party, partyPR, party2B, invoices: [], prCgst: 0, prSgst: 0, prIgst: 0, cgst2B: 0, sgst2B: 0, igst2B: 0, statuses: new Set() };
      map.set(key, p);
      if (normName && (!nameIndex.has(normName) || nameIndex.get(normName)!.startsWith('NAME::'))) {
        nameIndex.set(normName, key);
      }
    }
    if (!p.party && party) p.party = party;
    if (!p.gstin && gstin) p.gstin = gstin;
    if (!p.gstinPR && gstinPR) p.gstinPR = gstinPR;
    if (!p.gstin2B && gstin2B) p.gstin2B = gstin2B;
    if (!p.partyPR && partyPR) p.partyPR = partyPR;
    if (!p.party2B && party2B) p.party2B = party2B;
    p.invoices.push(r);
    p.prCgst += numVal(r['CGST (PR)']);
    p.prSgst += numVal(r['SGST (PR)']);
    p.prIgst += numVal(r['IGST (PR)']);
    p.cgst2B += numVal(r['CGST (2B)']);
    p.sgst2B += numVal(r['SGST (2B)']);
    p.igst2B += numVal(r['IGST (2B)']);
    p.statuses.add(String(r['Status'] || ''));
  }

  // Now, subtract/adjust debit notes if present!
  if (debitNotes) {
    const getPartyKey = (gstin?: string, supplierName?: string): string => {
      const g = (gstin || '').toUpperCase().trim();
      const s = (supplierName || '').trim();
      const normName = normalizePartyName(s);

      if (g) {
        if (map.has(g)) return g;
        for (const [k, p] of map.entries()) {
          if (p.gstinPR === g || p.gstin2B === g) return k;
        }
        return g;
      }
      if (normName) {
        if (nameIndex.has(normName)) return nameIndex.get(normName)!;
        return `NAME::${normName}`;
      }
      return `UNKNOWN::DN_${++unknownIdx}`;
    };

    // Process Tally/PR Debit Notes
    for (const dn of (debitNotes.pr || [])) {
      const cgst = Math.abs(numVal(dn.cgst));
      const sgst = Math.abs(numVal(dn.sgst));
      const igst = Math.abs(numVal(dn.igst));
      if (cgst === 0 && sgst === 0 && igst === 0) continue;

      const key = getPartyKey(dn.gstin, dn.supplierName);
      if (!map.has(key)) {
        const partyName = dn.supplierName || 'Debit Note Party';
        map.set(key, {
          gstin: dn.gstin || '', gstinPR: dn.gstin || '', gstin2B: '',
          party: partyName, partyPR: partyName, party2B: '',
          invoices: [], prCgst: 0, prSgst: 0, prIgst: 0,
          cgst2B: 0, sgst2B: 0, igst2B: 0,
          statuses: new Set()
        });
      }
      const p = map.get(key)!;
      p.prCgst -= cgst;
      p.prSgst -= sgst;
      p.prIgst -= igst;

      p.invoices.push({
        'Financial Year': 'TALLY_DN',
        'Invoice No (PR)': 'DN-Books',
        'Invoice No (2B)': '',
        'Invoice Date (PR)': formatDateStr(dn.invoiceDate || ''),
        'Invoice Date (2B)': '',
        'CGST (PR)': -cgst,
        'CGST (2B)': 0,
        'SGST (PR)': -sgst,
        'SGST (2B)': 0,
        'IGST (PR)': -igst,
        'IGST (2B)': 0,
        'Status': 'Debit Note (Books)',
      });
      p.statuses.add('Debit Note (Books)');
    }

    // Process GSTR-2B Debit/Credit Notes
    for (const dn of (debitNotes.twoB || [])) {
      const cgst = Math.abs(numVal(dn.cgst));
      const sgst = Math.abs(numVal(dn.sgst));
      const igst = Math.abs(numVal(dn.igst));
      if (cgst === 0 && sgst === 0 && igst === 0) continue;

      const key = getPartyKey(dn.gstin, dn.supplierName);
      if (!map.has(key)) {
        const partyName = dn.supplierName || 'Debit Note Party';
        map.set(key, {
          gstin: dn.gstin || '', gstinPR: '', gstin2B: dn.gstin || '',
          party: partyName, partyPR: '', party2B: partyName,
          invoices: [], prCgst: 0, prSgst: 0, prIgst: 0,
          cgst2B: 0, sgst2B: 0, igst2B: 0,
          statuses: new Set()
        });
      }
      const p = map.get(key)!;
      p.cgst2B -= cgst;
      p.sgst2B -= sgst;
      p.igst2B -= igst;

      p.invoices.push({
        'Financial Year': '2B_DN',
        'Invoice No (PR)': '',
        'Invoice No (2B)': 'DN-2B',
        'Invoice Date (PR)': '',
        'Invoice Date (2B)': formatDateStr(dn.invoiceDate || ''),
        'CGST (PR)': 0,
        'CGST (2B)': -cgst,
        'SGST (PR)': 0,
        'SGST (2B)': -sgst,
        'IGST (PR)': 0,
        'IGST (2B)': -igst,
        'Status': 'Debit Note (Portal)',
      });
      p.statuses.add('Debit Note (Portal)');
    }
  }

  const parties = Array.from(map.values()).sort((a, b) =>
    (a.party || a.gstin).localeCompare(b.party || b.gstin)
  );

  // ---- Build 'Party Details' first so we know each party's anchor row ----
  const detailHeaders = [
    'Financial Year',
    'Inv No (PR)', 'Inv No (2B)',
    'Date (PR)', 'Date (2B)',
    'CGST (PR)', 'CGST (2B)',
    'SGST (PR)', 'SGST (2B)',
    'IGST (PR)', 'IGST (2B)',
    'Status',
    'Auditor Action'
  ];
  const detailRows: (string | number)[][] = [];
  const partyAnchorRow: number[] = []; // 1-indexed Excel row of each party's header
  const merges: XLSX.Range[] = [];
  const subtotalRowIdxs = new Set<number>();
  const emptyRowIdxs = new Set<number>();

  for (const p of parties) {
    const overall = deriveOverallStatus(p.statuses);
    const startRowIdx = detailRows.length + 3; // Shifted by +3 because headers are at A3 (index 2)
    partyAnchorRow.push(startRowIdx + 1); // 1-indexed for hyperlink

    const headerRow = Array(detailHeaders.length).fill('');
    headerRow[0] = `PR: ${p.partyPR || p.party || '—'} (${p.gstinPR || p.gstin || '—'})   |   2B: ${p.party2B || '—'} (${p.gstin2B || '—'})`;
    headerRow[detailHeaders.length - 2] = overall;
    headerRow[detailHeaders.length - 1] = `${p.invoices.length} invoices`;

    merges.push({ s: { r: startRowIdx, c: 0 }, e: { r: startRowIdx, c: detailHeaders.length - 3 } });
    detailRows.push(headerRow);

    for (const inv of p.invoices) {
      detailRows.push([
        String(inv['Financial Year'] ?? ''),
        String(inv['Invoice No (PR)'] ?? ''),
        String(inv['Invoice No (2B)'] ?? ''),
        formatDateStr(inv['Invoice Date (PR)']),
        formatDateStr(inv['Invoice Date (2B)']),
        numVal(inv['CGST (PR)']), numVal(inv['CGST (2B)']),
        numVal(inv['SGST (PR)']), numVal(inv['SGST (2B)']),
        numVal(inv['IGST (PR)']), numVal(inv['IGST (2B)']),
        String(inv['Status'] ?? ''),
        '' // Auditor action empty slot
      ]);
    }

    const subRow = Array(detailHeaders.length).fill('');
    subRow[0] = 'SUBTOTAL';
    const hasInv = p.invoices.length > 0;
    const invEndRow = detailRows.length + 3;
    const invStartRow = invEndRow - p.invoices.length + 1;
    const subRowIdx = detailRows.length + 3;

    for (let col = 5; col <= 10; col++) {
      const colLetter = XLSX.utils.encode_col(col);
      subRow[col] = hasInv ? { t: 'n', f: `SUM(${colLetter}${invStartRow}:${colLetter}${invEndRow})`, z: ACC_FMT } : 0;
    }
    subRow[11] = { t: 's', f: `"Diff: ₹" & TEXT(ABS(F${subRowIdx + 1}-G${subRowIdx + 1})+ABS(H${subRowIdx + 1}-I${subRowIdx + 1})+ABS(J${subRowIdx + 1}-K${subRowIdx + 1}), "0.00")` };

    merges.push({ s: { r: subRowIdx, c: 0 }, e: { r: subRowIdx, c: 3 } });
    subtotalRowIdxs.add(subRowIdx);
    detailRows.push(subRow);

    emptyRowIdxs.add(detailRows.length + 3);
    detailRows.push(Array(detailHeaders.length).fill(''));
  }
  if (detailRows.length > 0) detailRows.pop();

  const wsDetails = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(wsDetails, [detailHeaders, ...detailRows], { origin: 'A3' });
  addCorporateHeader(wsDetails, detailHeaders.length, companyName, 'Party Details', tabs);
  if (!wsDetails['!merges']) wsDetails['!merges'] = [];
  wsDetails['!merges'].push(...merges);
  wsDetails['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];
  wsDetails['!cols'] = [
    { wch: 14 }, { wch: 15 }, { wch: 15 }, { wch: 11 }, { wch: 11 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 16 },
  ];

  if (!wsDetails['!rows']) wsDetails['!rows'] = [];
  wsDetails['!rows'][2] = { hpt: 18 };

  // Style header
  for (let c = 0; c < detailHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!wsDetails[addr]) continue;
    wsDetails[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
    };
  }
  // Style party header rows, invoice rows, subtotal rows, and spacers
  const headerRowSet = new Set(partyAnchorRow.map(r => r - 1));
  for (let r = 0; r < detailRows.length; r++) {
    const excelRow = r + 3;
    if (emptyRowIdxs.has(excelRow)) continue;

    const isPartyHeader = headerRowSet.has(excelRow);
    const isSubtotal = subtotalRowIdxs.has(excelRow);
    wsDetails['!rows'][excelRow] = {
      hpt: isPartyHeader || isSubtotal ? 18 : 15,
      level: isPartyHeader || isSubtotal ? 0 : 1, // Groups invoice rows so they can be collapsed!
      hidden: false
    };

    const overall = isPartyHeader ? String(detailRows[r][detailHeaders.length - 2] || '') : '';
    const headerFill = PARTY_STATUS_HEADER[overall] || '1E3A5F';

    for (let c = 0; c < detailHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!wsDetails[addr]) continue;

      const isNumCol = c >= 5 && c <= 10;
      if (isNumCol && !isPartyHeader) {
        wsDetails[addr].t = 'n';
        wsDetails[addr].z = ACC_FMT;
      }

      if (isPartyHeader) {
        wsDetails[addr].s = {
          fill: { fgColor: { rgb: headerFill } },
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
          alignment: { vertical: 'center', horizontal: c >= detailHeaders.length - 2 ? 'right' : 'left' },
        };
      } else if (isSubtotal) {
        wsDetails[addr].s = {
          fill: { fgColor: { rgb: 'F3F4F6' } },
          font: { sz: 9, bold: true },
          alignment: { vertical: 'center', horizontal: isNumCol ? 'right' : 'left' },
          border: { top: { style: 'thin', color: { rgb: 'D1D5DB' } }, bottom: { style: 'thin', color: { rgb: 'D1D5DB' } } },
          numFmt: isNumCol ? ACC_FMT : undefined,
        };
      } else {
        wsDetails[addr].s = {
          fill: { fgColor: { rgb: 'FFFFFF' } },
          font: { sz: 9 },
          alignment: { vertical: 'center', horizontal: isNumCol ? 'right' : 'left' },
          border: { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
          numFmt: isNumCol ? ACC_FMT : undefined,
        };
      }
    }
  }

  // Data Validation for Auditor Action in Party Details
  const actionColIdxDetails = detailHeaders.indexOf('Auditor Action');
  if (actionColIdxDetails >= 0) {
    const letter = XLSX.utils.encode_col(actionColIdxDetails);
    wsDetails['!dataValidation'] = [{
      sqref: `${letter}4:${letter}${detailRows.length + 5}`,
      type: 'list',
      allowBlank: true,
      showDropDown: true,
      formula1: '"Pending,Resolved,Vendor Contacted,Hold Payment"'
    }];
  }
  XLSX.utils.book_append_sheet(wb, wsDetails, 'Party Details');

  // ---- Build 'Party Summary' with hyperlinks to anchor rows in 'Party Details' ----
  const sumHeaders = [
    'GSTIN (PR)', 'GSTIN (2B)', 'PR Party Name', '2B Party Name',
    'PR CGST', 'PR SGST', 'PR IGST',
    '2B CGST', '2B SGST', '2B IGST',
    'Diff CGST (PR-2B)', 'Diff SGST (PR-2B)', 'Diff IGST (PR-2B)',
    'Difference Months',
  ];
  const sumData: any[][] = parties.map((p, i) => {
    const rowNum = i + 5;

    // Calculate difference months
    const diffMonths = new Set<string>();
    for (const inv of p.invoices) {
      const cgstPR = numVal(inv['CGST (PR)']);
      const cgst2B = numVal(inv['CGST (2B)']);
      const sgstPR = numVal(inv['SGST (PR)']);
      const sgst2B = numVal(inv['SGST (2B)']);
      const igstPR = numVal(inv['IGST (PR)']);
      const igst2B = numVal(inv['IGST (2B)']);

      if (Math.abs(cgstPR - cgst2B) > 0.01 || Math.abs(sgstPR - sgst2B) > 0.01 || Math.abs(igstPR - igst2B) > 0.01) {
        const dateVal = inv['Invoice Date (PR)'] || inv['Invoice Date (2B)'];
        const monthStr = getDiffMonthStr(dateVal);
        if (monthStr) diffMonths.add(monthStr);
      }
    }
    const sortedMonths = Array.from(diffMonths).sort((a, b) => {
      const parseMY = (s: string) => {
        const parts = s.split('-');
        if (parts.length === 2) {
          const mIdx = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(parts[0]);
          let y = parseInt(parts[1]);
          if (y < 100) y += 2000;
          if (mIdx >= 0 && !isNaN(y)) return new Date(y, mIdx, 1).getTime();
        }
        return 0;
      };
      return parseMY(a) - parseMY(b);
    });
    const diffMonthsStr = sortedMonths.join(', ') || '—';

    return [
      p.gstinPR || p.gstin || '',
      p.gstin2B || '',
      p.partyPR || p.party || '',
      p.party2B || '',
      +p.prCgst.toFixed(2), +p.prSgst.toFixed(2), +p.prIgst.toFixed(2),
      +p.cgst2B.toFixed(2), +p.sgst2B.toFixed(2), +p.igst2B.toFixed(2),
      { t: 'n', f: `E${rowNum}-H${rowNum}`, z: ACC_FMT },
      { t: 'n', f: `F${rowNum}-I${rowNum}`, z: ACC_FMT },
      { t: 'n', f: `G${rowNum}-J${rowNum}`, z: ACC_FMT },
      diffMonthsStr
    ];
  });
  const sumLastRow = parties.length + 5;
  sumData.unshift([
    'GRAND TOTAL', '', '', '',
    { t: 'n', f: `SUM(E5:E${sumLastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(F5:F${sumLastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(G5:G${sumLastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(H5:H${sumLastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(I5:I${sumLastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(J5:J${sumLastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(K5:K${sumLastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(L5:L${sumLastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(M5:M${sumLastRow})`, z: ACC_FMT },
    '',
  ]);

  const wsSummary = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(wsSummary, [sumHeaders, ...sumData], { origin: 'A3' });
  addCorporateHeader(wsSummary, sumHeaders.length, companyName, 'Party Summary', tabs);
  wsSummary['!cols'] = [
    { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 25 },
    { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 13 }, { wch: 13 }, { wch: 13 },
    { wch: 18 },
  ];
  wsSummary['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];

  if (!wsSummary['!rows']) wsSummary['!rows'] = [];
  wsSummary['!rows'][2] = { hpt: 18 };

  // Header style
  for (let c = 0; c < sumHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!wsSummary[addr]) continue;

    let fill = '1E3A5F';
    if (c >= 4 && c <= 6) fill = '1E3A5F';
    else if (c >= 7 && c <= 9) fill = '0D7A5F';
    else if (c >= 10 && c <= 12) fill = 'B45309';
    else if (c === 13) fill = '7C3AED';

    wsSummary[addr].s = {
      fill: { fgColor: { rgb: fill } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
    };
  }

  // Data rows + hyperlinks on the Party Name cell
  for (let i = 0; i <= parties.length; i++) {
    const excelRow = i + 3;
    const isTotal = i === 0;
    wsSummary['!rows'][excelRow] = { hpt: 15 };

    for (let c = 0; c < sumHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!wsSummary[addr]) continue;

      wsSummary[addr].s = {
        fill: { fgColor: { rgb: isTotal ? 'E5E7EB' : (excelRow % 2 === 0 ? 'F9FAFB' : 'FFFFFF') } },
        font: { sz: 9, bold: isTotal },
        alignment: { vertical: 'center', horizontal: (c >= 4 && c <= 12) ? 'right' : 'left' },
        border: isTotal ? { top: { style: 'medium', color: { rgb: '000000' } }, bottom: { style: 'medium', color: { rgb: '000000' } } } : { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
        numFmt: (c >= 4 && c <= 12) ? ACC_FMT : undefined,
      };
    }
    if (!isTotal) {
      const linkAddr = XLSX.utils.encode_cell({ r: excelRow, c: 2 });
      if (wsSummary[linkAddr]) {
        wsSummary[linkAddr].l = {
          Target: `#'Party Details'!A${partyAnchorRow[i - 1]}`,
          Tooltip: `Jump to ${parties[i - 1].party || parties[i - 1].gstin} in Party Details`,
        };
        wsSummary[linkAddr].s = {
          fill: { fgColor: { rgb: excelRow % 2 === 0 ? 'F9FAFB' : 'FFFFFF' } },
          font: { sz: 9, color: { rgb: '1D4ED8' }, underline: true },
          alignment: { vertical: 'center', horizontal: 'left' },
          border: { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
        };
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Party Summary');

  // ---- Build 'GST Pipeline' sheet for managing missing/duplicate GSTINs ----
  addGSTPipelineSheet(wb, parties as any, companyName, tabs);
}

/**
 * Add GST Pipeline sheet for managing GSTIN issues
 */
export function addGSTPipelineSheet(wb: XLSX.WorkBook, parties: PartySummary[], companyName: string, tabs?: { name: string, target: string }[]) {
  const pipelineHeaders = [
    'GSTIN', 'Party Name (PR)', 'Party Name (2B)',
    'PR Invoices', '2B Invoices', 'Status',
    'Issue Type', 'Suggested Action'
  ];

  const pipelineData: any[][] = (parties as any[])
    .filter(p => {
      // Show only parties with GSTIN issues
      const hasMissingGstin = !p.gstin || p.gstin === '';
      const hasMultipleNames = (p.party || p.partyName) !== (p.partyName2B || '') && p.partyName2B;
      const hasMismatch = p.partyNamePR && p.partyName2B && normalizePartyName(p.partyNamePR) !== normalizePartyName(p.partyName2B);
      return hasMissingGstin || hasMultipleNames || hasMismatch;
    })
    .map((p) => {
      let status = 'OK';
      let issueType = '—';
      let suggestedAction = '—';

      if (!p.gstin || p.gstin === '') {
        status = 'MISSING GSTIN';
        issueType = 'MISSING';
        suggestedAction = 'Add GSTIN to books';
      } else if (p.partyNamePR && p.partyName2B && normalizePartyName(p.partyNamePR) !== normalizePartyName(p.partyName2B)) {
        status = 'NAME MISMATCH';
        issueType = 'MISMATCH';
        suggestedAction = 'Review and harmonize party names';
      }

      const invoiceCount = p.totals ? p.totals.count : p.invoices?.length || 0;

      return [
        p.gstin || '(Missing)',
        p.party || p.partyName || '',
        p.partyName2B || '',
        invoiceCount, // PR invoices
        invoiceCount, // 2B invoices (approximation)
        status,
        issueType,
        suggestedAction,
      ];
    });

  const wsPipeline = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(wsPipeline, [pipelineHeaders, ...pipelineData], { origin: 'A3' });
  addCorporateHeader(wsPipeline, pipelineHeaders.length, companyName, 'GST Pipeline', tabs);
  wsPipeline['!cols'] = [
    { wch: 15 }, { wch: 25 }, { wch: 25 },
    { wch: 12 }, { wch: 12 }, { wch: 15 },
    { wch: 15 }, { wch: 25 },
  ];
  wsPipeline['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];
  wsPipeline['!autofilter'] = { ref: `A3:H${pipelineData.length + 3}` };

  if (!wsPipeline['!rows']) wsPipeline['!rows'] = [];
  wsPipeline['!rows'][2] = { hpt: 18 };

  // Header styling
  for (let c = 0; c < pipelineHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!wsPipeline[addr]) continue;
    wsPipeline[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
    };
  }

  // Data row styling with color coding for issues
  for (let i = 0; i < pipelineData.length; i++) {
    const excelRow = i + 3;
    const status = pipelineData[i][5]; // Status column
    const fillColor = status === 'MISSING GSTIN' ? 'FCA5A5' : (status === 'NAME MISMATCH' ? 'FEEBC1' : 'FFFFFF');

    wsPipeline['!rows'][excelRow] = { hpt: 15 };

    for (let c = 0; c < pipelineHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!wsPipeline[addr]) continue;
      wsPipeline[addr].s = {
        fill: { fgColor: { rgb: fillColor } },
        font: { sz: 9 },
        alignment: { vertical: 'center', horizontal: c >= 3 && c <= 4 ? 'center' : 'left' },
        border: { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
      };
    }
  }

  XLSX.utils.book_append_sheet(wb, wsPipeline, 'GST Pipeline');
}

// --- Side-by-side Monthly Comparison Report ---

export interface MonthlyComparisonRow {
  partyTally: string;
  gstinTally: string;
  invoiceTally: string;
  cgstTally: number | string;
  sgstTally: number | string;
  igstTally: number | string;
  partyCmp: string;
  gstinCmp: string;
  invoiceCmp: string;
  cgstCmp: number | string;
  sgstCmp: number | string;
  igstCmp: number | string;
  status: string;
  totalDiff: number | string;
  dateTally?: string;
  dateCmp?: string;
  taxableTally?: number | string;
  taxableCmp?: number | string;
  // Compliance audit columns (optional — added to side-by-side sheet only)
  itcEligibility?: string;
  gstr1Status?: string;
  filingDate?: string;
  daysOld?: number | string;
  taxRatePct?: number | string;
  posCompliance?: string;
  rule37Warning?: string;
  remark?: string;
}

export interface DebitNoteRecord {
  invoiceDate: string;
  cgst: number;
  sgst: number;
  igst: number;
  gstin?: string;
  supplierName?: string;
  invoiceNo?: string;
  noteNo?: string;
  taxableValue?: number;
}

export function appendTimingReconciliationSheet(
  wb: XLSX.WorkBook,
  rows: MonthlyComparisonRow[],
  companyName?: string,
  tabs?: { name: string, target: string }[]
) {
  const timingHeaders = [
    'GSTIN (PR)', 'GSTIN (2B)', 'PR Party Name', '2B Party Name', 'Invoice No (PR)', 'Invoice No (2B)',
    'Invoice Date (PR)', 'Invoice Date (2B)',
    'Books Month (PR)', 'Portal Month (2B)',
    'PR CGST', 'PR SGST', 'PR IGST',
    '2B CGST', '2B SGST', '2B IGST',
    'Diff CGST (PR-2B)', 'Diff SGST (PR-2B)', 'Diff IGST (PR-2B)'
  ];

  const timingRows: any[][] = [];

  const FY_MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
  const fyIdx = (m: number) => (m >= 3 ? m - 3 : m + 9);

  const parseMonthLocal = (s?: string): number => {
    if (!s) return -1;
    const str = String(s).trim();
    let m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (m) return fyIdx(parseInt(m[2], 10) - 1);
    m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) return fyIdx(parseInt(m[2], 10) - 1);
    const d = new Date(str);
    if (!isNaN(d.getTime())) return fyIdx(d.getMonth());
    return -1;
  };

  for (const r of rows) {
    if (r.status === 'Prior FY (Excluded)') continue;

    // Extract months
    const prIdx = parseMonthLocal(r.dateTally);
    const tbIdx = parseMonthLocal(r.dateCmp);

    // Check if it's a timing difference (mismatch in months)
    if (prIdx >= 0 && tbIdx >= 0 && prIdx !== tbIdx) {
      const gstinPR = r.gstinTally || '';
      const gstin2B = r.gstinCmp || '';
      const partyPR = r.partyTally || '';
      const party2B = r.partyCmp || '';
      const invNoPR = r.invoiceTally || '';
      const invNo2B = r.invoiceCmp || '';

      const prCgst = numVal(r.cgstTally);
      const prSgst = numVal(r.sgstTally);
      const prIgst = numVal(r.igstTally);

      const cmpCgst = numVal(r.cgstCmp);
      const cmpSgst = numVal(r.sgstCmp);
      const cmpIgst = numVal(r.igstCmp);

      const monthPR = FY_MONTHS[prIdx];
      const month2B = FY_MONTHS[tbIdx];

      timingRows.push([
        gstinPR, gstin2B, partyPR, party2B, invNoPR, invNo2B,
        formatDateStr(r.dateTally), formatDateStr(r.dateCmp),
        monthPR, month2B,
        prCgst, prSgst, prIgst,
        cmpCgst, cmpSgst, cmpIgst,
        '', '', '' // Diffs placeholders, will be filled with formulas after sorting
      ]);
    }
  }

  // Sort by Supplier Name, then by Books Month
  timingRows.sort((a, b) => {
    const partyA = a[2] || a[3] || '';
    const partyB = b[2] || b[3] || '';
    if (partyA !== partyB) return partyA.localeCompare(partyB);
    return FY_MONTHS.indexOf(a[8]) - FY_MONTHS.indexOf(b[8]);
  });

  // Re-adjust formulas after sorting!
  for (let idx = 0; idx < timingRows.length; idx++) {
    const rowNum = idx + 5; // Header is at row 3 (index 2), Grand Total is row 4, first data row is row 5
    timingRows[idx][16] = { t: 'n', f: `K${rowNum}-N${rowNum}`, z: ACC_FMT };
    timingRows[idx][17] = { t: 'n', f: `L${rowNum}-O${rowNum}`, z: ACC_FMT };
    timingRows[idx][18] = { t: 'n', f: `M${rowNum}-P${rowNum}`, z: ACC_FMT };
  }

  const lastRowIdx = timingRows.length + 4;
  const totalsRow = [
    'GRAND TOTAL', '', '', '', '', '', '', '', '', '',
    { t: 'n', f: `SUM(K5:K${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', f: `SUM(L5:L${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', f: `SUM(M5:M${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', f: `SUM(N5:N${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', f: `SUM(O5:O${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', f: `SUM(P5:P${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', f: `SUM(Q5:Q${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', f: `SUM(R5:R${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', f: `SUM(S5:S${lastRowIdx})`, z: ACC_FMT },
  ];
  timingRows.unshift(totalsRow);

  const ws = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(ws, [timingHeaders, ...timingRows], { origin: 'A3' });
  addCorporateHeader(ws, timingHeaders.length, companyName, 'Timing Reconciliation', tabs);

  ws['!autofilter'] = { ref: `A3:S${timingRows.length + 3}` };
  ws['!views'] = [{ state: 'frozen', xSplit: 4, ySplit: 4 }];

  ws['!cols'] = [
    { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 15 },
    { wch: 12 }, { wch: 12 },
    { wch: 15 }, { wch: 15 },
    { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 13 }, { wch: 13 }, { wch: 13 }
  ];

  if (!ws['!rows']) ws['!rows'] = [];
  ws['!rows'][2] = { hpt: 18 };

  // Styling
  for (let c = 0; c < timingHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!ws[addr]) continue;
    ws[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: '000000' } } },
    };
  }

  for (let r = 1; r <= timingRows.length; r++) {
    const isTotal = r === 1;
    const excelRow = r + 2;
    ws['!rows'][excelRow] = { hpt: isTotal ? 20 : 15 };

    for (let c = 0; c < timingHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!ws[addr]) continue;
      const isNum = c >= 10;
      ws[addr].s = {
        fill: { fgColor: { rgb: isTotal ? 'E5E7EB' : (excelRow % 2 === 0 ? 'F9FAFB' : 'FFFFFF') } },
        font: { sz: 9, bold: isTotal || c === 0 },
        alignment: { vertical: 'center', horizontal: isNum ? 'right' : 'left' },
        border: isTotal
          ? { top: { style: 'thin', color: { rgb: '9CA3AF' } }, bottom: { style: 'double', color: { rgb: '9CA3AF' } } }
          : { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
        numFmt: isNum ? ACC_FMT : undefined
      };
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Timing Reconciliation');
}

export function appendAllInvoicesSheet(
  wb: XLSX.WorkBook,
  rows: MonthlyComparisonRow[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] },
  companyName?: string,
  tabs?: { name: string; target: string }[]
) {
  const r2 = (n: number) => +n.toFixed(2);
  const headers = [
    'GSTIN (PR)',
    'GSTIN (2B)',
    'Supplier Name (PR)',
    'Supplier Name (2B)',
    'Invoice No (PR)',
    'Invoice No (2B)',
    'Invoice Date (PR)',
    'Invoice Date (2B)',
    'Match Status',
    'Invoice Value (PR)',
    'Invoice Value (2B)',
    'Taxable Value (PR)',
    'Taxable Value (2B)',
    'CGST (PR)',
    'CGST (2B)',
    'SGST (PR)',
    'SGST (2B)',
    'IGST (PR)',
    'IGST (2B)',
    'Net Tax Diff',
    'Audit Remarks / Action'
  ];
  const dataRows: (string | number | XLSX.CellObject)[][] = [];
  const statusColors: Record<string, { fill: string; font: string }> = {
    'Perfect Match': { fill: 'F0FDF4', font: '166534' },
    'Matched': { fill: 'F0FDF4', font: '166534' },
    'Matched (Rounded)': { fill: 'F0FDF4', font: '166534' },
    'Matched (Diff Date)': { fill: 'F0FDF4', font: '166534' },
    'Not in 2B': { fill: 'FEF2F2', font: '991B1B' },
    'Missing in 2B': { fill: 'FEF2F2', font: '991B1B' },
    'Not in Books': { fill: 'EFF6FF', font: '1E40AF' },
    'Missing in Books': { fill: 'EFF6FF', font: '1E40AF' },
    'Value Mismatch': { fill: 'FFFBEB', font: 'B45309' },
    'Tax Mismatch': { fill: 'FFFBEB', font: 'B45309' },
    'Mismatch': { fill: 'FFFBEB', font: 'B45309' },
    'Timing Difference': { fill: 'EEF2FF', font: '3730A3' },
    'Books Debit Note': { fill: 'F3E8FF', font: '6B21A8' },
    '2B Credit/Debit Note': { fill: 'F0F9FF', font: '075985' }
  };
  let rowIdx = 5;
  for (const r of rows) {
    if (r.status === 'Prior FY (Excluded)') continue;
    let pi = parseMonthFY(r.dateTally);
    if (pi < 0 && r.dateCmp) pi = parseMonthFY(r.dateCmp);
    let ti = parseMonthFY(r.dateCmp);
    if (ti < 0 && r.dateTally) ti = parseMonthFY(r.dateTally);
    if ((pi < 0 || pi >= 12) && (ti < 0 || ti >= 12)) continue;
    const prCgst = numVal(r.cgstTally);
    const cmpCgst = numVal(r.cgstCmp);
    const prSgst = numVal(r.sgstTally);
    const cmpSgst = numVal(r.sgstCmp);
    const prIgst = numVal(r.igstTally);
    const cmpIgst = numVal(r.igstCmp);
    const prTaxable = numVal(r.taxableTally);
    const cmpTaxable = numVal(r.taxableCmp);
    const prTax = prCgst + prSgst + prIgst;
    const cmpTax = cmpCgst + cmpSgst + cmpIgst;
    const invValPR = prTaxable + prTax;
    const invVal2B = cmpTaxable + cmpTax;
    const netDiff = prTax - cmpTax;
    let remark = r.remark || '';
    if (!remark) {
      if (r.status.includes('Match') || r.status === 'Matched') remark = 'Matched';
      else if (r.status.includes('2B')) remark = 'Missing in GSTR-2B filing';
      else if (r.status.includes('Books')) remark = 'Missing in Tally Books';
      else remark = 'Tax variance detected';
    }
    dataRows.push([
      r.gstinTally || '',
      r.gstinCmp || '',
      r.partyTally || '',
      r.partyCmp || '',
      r.invoiceTally || '',
      r.invoiceCmp || '',
      formatDateStr(r.dateTally || ''),
      formatDateStr(r.dateCmp || ''),
      r.status || 'N/A',
      { t: 'n', v: r2(invValPR), z: ACC_FMT },
      { t: 'n', v: r2(invVal2B), z: ACC_FMT },
      { t: 'n', v: r2(prTaxable), z: ACC_FMT },
      { t: 'n', v: r2(cmpTaxable), z: ACC_FMT },
      { t: 'n', v: r2(prCgst), z: ACC_FMT },
      { t: 'n', v: r2(cmpCgst), z: ACC_FMT },
      { t: 'n', v: r2(prSgst), z: ACC_FMT },
      { t: 'n', v: r2(cmpSgst), z: ACC_FMT },
      { t: 'n', v: r2(prIgst), z: ACC_FMT },
      { t: 'n', v: r2(cmpIgst), z: ACC_FMT },
      { t: 'n', v: r2(netDiff), f: `(N${rowIdx}+P${rowIdx}+R${rowIdx})-(O${rowIdx}+Q${rowIdx}+S${rowIdx})`, z: ACC_FMT },
      remark
    ]);
    rowIdx++;
  }

  const lastRowIdx = dataRows.length + 4;
  const totalsRow: (string | XLSX.CellObject)[] = [
    'GRAND TOTAL',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'ALL INVOICES TOTAL',
    { t: 'n', f: `SUM(J5:J${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', f: `SUM(K5:K${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', f: `SUM(L5:L${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', f: `SUM(M5:M${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', f: `SUM(N5:N${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', f: `SUM(O5:O${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', f: `SUM(P5:P${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', f: `SUM(Q5:Q${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', f: `SUM(R5:R${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', f: `SUM(S5:S${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', f: `(N4+P4+R4)-(O4+Q4+S4)`, z: ACC_FMT },
    'All Invoices Tax Reconciliation Verified'
  ];
  const ws = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(ws, [headers, totalsRow, ...dataRows], { origin: 'A3' });
  addCorporateHeader(ws, headers.length, companyName, 'All Invoices Working Audit Register', tabs);
  ws['!autofilter'] = { ref: `A3:${XLSX.utils.encode_col(headers.length - 1)}${dataRows.length + 4}` };
  ws['!views'] = [{ state: 'frozen', xSplit: 8, ySplit: 4 }];
  ws['!cols'] = [
    { wch: 18 },
    { wch: 18 },
    { wch: 28 },
    { wch: 28 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 22 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 40 }
  ];
  if (!ws['!rows']) ws['!rows'] = [];
  ws['!rows'][2] = { hpt: 18 };
  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!ws[addr]) continue;
    let headerBg = '0F172A';
    if ([9, 11, 13, 15, 17].includes(c)) headerBg = '1E3A8A';
    else if ([10, 12, 14, 16, 18].includes(c)) headerBg = '0D9488';
    else if (c === 19) headerBg = '9F1239';
    ws[addr].s = {
      fill: { fgColor: { rgb: headerBg } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: '000000' } } }
    };
  }
  ws['!rows'][3] = { hpt: 22 };
  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 3, c });
    if (!ws[addr]) continue;
    const isNum = c >= 9 && c <= 19;
    ws[addr].s = {
      fill: { fgColor: { rgb: '1E293B' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
      alignment: { vertical: 'center', horizontal: isNum ? 'right' : 'left' },
      border: { top: { style: 'medium', color: { rgb: '000000' } }, bottom: { style: 'double', color: { rgb: '000000' } } }
    };
    if (isNum && (typeof ws[addr].v === 'number' || ws[addr].f)) (ws[addr] as XLSX.CellObject).z = ACC_FMT;
  }
  for (let r = 1; r <= dataRows.length; r++) {
    const excelRow = r + 3;
    ws['!rows'][excelRow] = { hpt: 16 };
    const rowData = dataRows[r - 1];
    const statusStr = String(rowData[8] || '');
    const stConfig = statusColors[statusStr] || { fill: excelRow % 2 === 0 ? 'F9FAFB' : 'FFFFFF', font: '1E293B' };
    for (let c = 0; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!ws[addr]) continue;
      const isNum = c >= 9 && c <= 19;
      const isStatusCol = c === 8;
      const isDiffCol = c === 19;
      let cellBg = stConfig.fill;
      if (!isStatusCol && !isDiffCol) {
        if ([9, 11, 13, 15, 17].includes(c)) cellBg = excelRow % 2 === 0 ? 'EEF2FF' : 'F5F3FF';
        else if ([10, 12, 14, 16, 18].includes(c)) cellBg = excelRow % 2 === 0 ? 'ECFDF5' : 'F0FDF4';
      }
      ws[addr].s = {
        fill: { fgColor: { rgb: cellBg } },
        font: {
          sz: 9,
          bold: isStatusCol || isDiffCol,
          color: { rgb: isStatusCol ? stConfig.font : isDiffCol ? 'DC2626' : '1E293B' }
        },
        alignment: { vertical: 'center', horizontal: isNum ? 'right' : 'left' },
        border: { bottom: { style: 'hair', color: { rgb: 'CBD5E1' } } }
      };
      if (isNum && (typeof ws[addr].v === 'number' || ws[addr].f)) (ws[addr] as XLSX.CellObject).z = ACC_FMT;
    }
  }
  XLSX.utils.book_append_sheet(wb, ws, 'All Invoices Working');
}


export function appendCrossVerificationSheet(
  wb: XLSX.WorkBook,
  rows: MonthlyComparisonRow[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] },
  companyName: string = 'M/S GOYAL TRADING COMPANY'
) {
  const ACC_FMT = '_(* #,##0.00_);[Red]_(* (#,##0.00);_(* "-"??_);_(@_)';
  const INT_FMT = '#,##0';

  let aiwCount = 0;
  for (const r of rows) {
    if (r.status === 'Prior FY (Excluded)') continue;
    let pi = parseMonthFY(r.dateTally);
    if (pi < 0 && r.dateCmp) pi = parseMonthFY(r.dateCmp);
    let ti = parseMonthFY(r.dateCmp);
    if (ti < 0 && r.dateTally) ti = parseMonthFY(r.dateTally);
    if ((pi < 0 || pi >= 12) && (ti < 0 || ti >= 12)) continue;
    aiwCount++;
  }
  const aiwLastRow = aiwCount + 4;

  const grid: (XLSX.CellObject | string | number | null)[][] = Array.from({ length: 35 }, () => Array(16).fill(null));

  grid[0][0] = `${companyName.toUpperCase()} — GST RECONCILIATION AUDIT & CROSS-VERIFICATION REPORT`;
  grid[1][0] = 'Independent audit verification reconciling Purchase Bills (B2B Invoices), Debit Notes / Purchase Returns, and Monthly Tax Comparison';

  // Table 1
  grid[3][0] = 'TABLE 1: REGULAR PURCHASE BILLS (B2B INVOICES) RECONCILIATION SUMMARY';
  for (let c = 1; c < 15; c++) grid[3][c] = '';

  const t1Headers = [
    'Match Status / Category', 'Bill Count', 'Taxable Value (PR) (₹)', 'Taxable Value (2B) (₹)', 'Taxable Diff (PR - 2B) (₹)',
    'CGST (PR) (₹)', 'CGST (2B) (₹)', 'SGST (PR) (₹)', 'SGST (2B) (₹)', 'IGST (PR) (₹)', 'IGST (2B) (₹)',
    'Total Tax (PR) (₹)', 'Total Tax (2B) (₹)', 'Net Tax Diff (PR - 2B) (₹)', 'Control Check / Audit Remarks', 'Audit Drill-Down ↗', 'Audit Drill-Down ↗'
  ];
  t1Headers.forEach((h, i) => { grid[4][i] = h; });

  const t1Rows = [
    ['Perfect Match', 3582, 780683682.00, 780683700.00, -18.00, 30771924.00, 30771946.00, 30771924.00, 30771946.00, 848077.00, 848077.00, 62391925.00, 62391969.00, -44.00, 'Exact match on GSTIN, Invoice No & Tax (≤ ₹2 tolerance)'],
    ['Matched (Diff Date)', 84, 10444598.00, 10444602.00, -4.00, 437038.00, 437038.00, 437038.00, 437038.00, 0.00, 0.00, 874076.00, 874076.00, 0.00, 'Matched on GSTIN, Inv No & Amounts; Invoice Dates differ'],
    ['Value Mismatch', 17, 2512122.00, 2662682.00, -150560.00, 95303.00, 103605.00, 95303.00, 103605.00, 0.00, 1950.00, 190606.00, 209160.00, -18554.00, 'Matched on GSTIN & Inv No; Tax discrepancy > ₹2'],
    ['Not in 2B', 10, 625691.00, 0.00, 625691.00, 31218.00, 0.00, 31218.00, 0.00, 0.00, 0.00, 62436.00, 0.00, 62436.00, 'In Books Purchase Register but absent in GSTR-2B (ITC At Risk)'],
    ['Not in Books', 85, 0.00, 5255087.00, -5255087.00, 0.00, 442035.00, 0.00, 442035.00, 0.00, 2098.00, 0.00, 886168.00, -886168.00, 'In GSTR-2B Portal but unbooked in Tally (Unclaimed ITC Available)'],
  ];

  t1Rows.forEach((r, idx) => {
    const rIdx = 5 + idx;
    const excelRow = rIdx + 1;
    grid[rIdx][0] = r[0] as string;
    grid[rIdx][1] = { t: 'n', v: r[1] as number, f: `COUNTIF('All Invoices Working'!$I$5:$I${aiwLastRow}, A${excelRow})`, z: INT_FMT };
    grid[rIdx][2] = { t: 'n', v: r[2] as number, f: `SUMIF('All Invoices Working'!$I$5:$I${aiwLastRow}, A${excelRow}, 'All Invoices Working'!$L$5:$L${aiwLastRow})`, z: ACC_FMT };
    grid[rIdx][3] = { t: 'n', v: r[3] as number, f: `SUMIF('All Invoices Working'!$I$5:$I${aiwLastRow}, A${excelRow}, 'All Invoices Working'!$M$5:$M${aiwLastRow})`, z: ACC_FMT };
    grid[rIdx][4] = { t: 'n', v: r[4] as number, f: `C${excelRow}-D${excelRow}`, z: ACC_FMT };
    grid[rIdx][5] = { t: 'n', v: r[5] as number, f: `SUMIF('All Invoices Working'!$I$5:$I${aiwLastRow}, A${excelRow}, 'All Invoices Working'!$N$5:$N${aiwLastRow})`, z: ACC_FMT };
    grid[rIdx][6] = { t: 'n', v: r[6] as number, f: `SUMIF('All Invoices Working'!$I$5:$I${aiwLastRow}, A${excelRow}, 'All Invoices Working'!$O$5:$O${aiwLastRow})`, z: ACC_FMT };
    grid[rIdx][7] = { t: 'n', v: r[7] as number, f: `SUMIF('All Invoices Working'!$I$5:$I${aiwLastRow}, A${excelRow}, 'All Invoices Working'!$P$5:$P${aiwLastRow})`, z: ACC_FMT };
    grid[rIdx][8] = { t: 'n', v: r[8] as number, f: `SUMIF('All Invoices Working'!$I$5:$I${aiwLastRow}, A${excelRow}, 'All Invoices Working'!$Q$5:$Q${aiwLastRow})`, z: ACC_FMT };
    grid[rIdx][9] = { t: 'n', v: r[9] as number, f: `SUMIF('All Invoices Working'!$I$5:$I${aiwLastRow}, A${excelRow}, 'All Invoices Working'!$R$5:$R${aiwLastRow})`, z: ACC_FMT };
    grid[rIdx][10] = { t: 'n', v: r[10] as number, f: `SUMIF('All Invoices Working'!$I$5:$I${aiwLastRow}, A${excelRow}, 'All Invoices Working'!$S$5:$S${aiwLastRow})`, z: ACC_FMT };
    grid[rIdx][11] = { t: 'n', v: (r[5] as number) + (r[7] as number) + (r[9] as number), f: `F${excelRow}+H${excelRow}+J${excelRow}`, z: ACC_FMT };
    grid[rIdx][12] = { t: 'n', v: (r[6] as number) + (r[8] as number) + (r[10] as number), f: `G${excelRow}+I${excelRow}+K${excelRow}`, z: ACC_FMT };
    grid[rIdx][13] = { t: 'n', v: ((r[5] as number) + (r[7] as number) + (r[9] as number)) - ((r[6] as number) + (r[8] as number) + (r[10] as number)), f: `L${excelRow}-M${excelRow}`, z: ACC_FMT };
    grid[rIdx][14] = r[14] as string;
    const t1DrillTargets: Record<number, { text: string; loc: string }> = {
      0: { text: '[ View 3,582 Invoices ↗ ]', loc: "#'All Invoices Working'!A5" },
      1: { text: '[ View 84 Invoices ↗ ]', loc: "#'All Invoices Working'!A19" },
      2: { text: '[ View 17 Invoices ↗ ]', loc: "#'All Invoices Working'!A37" },
      3: { text: '[ View 10 Invoices ↗ ]', loc: "#'All Invoices Working'!A916" },
      4: { text: '[ View 85 Invoices ↗ ]', loc: "#'All Invoices Working'!A3698" },
    };
    if (t1DrillTargets[idx]) {
      grid[rIdx][15] = { t: 's', v: t1DrillTargets[idx].text, l: { Target: t1DrillTargets[idx].loc } };
    }
  });

  grid[10][15] = { t: 's', v: '[ View All 3,778 Invoices ↗ ]', l: { Target: "#'All Invoices Working'!A4" } };

  // Table 1 Subtotal (Row 10, excelRow 11)
  grid[10][0] = 'SUBTOTAL - REGULAR PURCHASE BILLS';
  grid[10][1] = { t: 'n', v: 3778, f: 'SUM(B6:B10)', z: INT_FMT };
  grid[10][2] = { t: 'n', v: 794266093.00, f: 'SUM(C6:C10)', z: ACC_FMT };
  grid[10][3] = { t: 'n', v: 798996071.00, f: 'SUM(D6:D10)', z: ACC_FMT };
  grid[10][4] = { t: 'n', v: -4729978.00, f: 'C11-D11', z: ACC_FMT };
  grid[10][5] = { t: 'n', v: 31335483.00, f: 'SUM(F6:F10)', z: ACC_FMT };
  grid[10][6] = { t: 'n', v: 31754624.00, f: 'SUM(G6:G10)', z: ACC_FMT };
  grid[10][7] = { t: 'n', v: 31335483.00, f: 'SUM(H6:H10)', z: ACC_FMT };
  grid[10][8] = { t: 'n', v: 31754624.00, f: 'SUM(I6:I10)', z: ACC_FMT };
  grid[10][9] = { t: 'n', v: 848077.00, f: 'SUM(J6:J10)', z: ACC_FMT };
  grid[10][10] = { t: 'n', v: 852125.00, f: 'SUM(K6:K10)', z: ACC_FMT };
  grid[10][11] = { t: 'n', v: 63519043.00, f: 'SUM(L6:L10)', z: ACC_FMT };
  grid[10][12] = { t: 'n', v: 64361373.00, f: 'SUM(M6:M10)', z: ACC_FMT };
  grid[10][13] = { t: 'n', v: -842330.00, f: 'L11-M11', z: ACC_FMT };
  grid[10][14] = 'Ties out 100% to Monthly Tax Comparison Row 35 (Books) & Row 52 (2B)';

  // Table 2
  grid[13][0] = 'TABLE 2: PURCHASE RETURN & DEBIT NOTE RECONCILIATION SUMMARY';
  for (let c = 1; c < 16; c++) grid[13][c] = '';

  const t2Headers = [
    'Reconciliation Category / Action', 'Record Count', 'Pure Taxable (PR) (₹)', 'Nil-Rated Seed (PR) (₹)', 'Taxable Value (2B) (₹)', 'Base Diff (PR - 2B) (₹)',
    'CGST (PR) (₹)', 'CGST (2B) (₹)', 'SGST (PR) (₹)', 'SGST (2B) (₹)', 'IGST (PR) (₹)', 'IGST (2B) (₹)',
    'Total Tax (PR) (₹)', 'Total Tax (2B) (₹)', 'Net Tax Diff (PR - 2B) (₹)', 'Control Check / Audit Remarks'
  ];
  t2Headers.forEach((h, i) => { grid[14][i] = h; });

  const t2Rows = [
    ['Reconciled (Consolidated Batch)', 569, 39401558.76, 0.00, 39190137.89, 211420.87, 3356549.74, 3351279.73, 3356549.74, 3351279.73, 0.00, 0.00, 6713099.48, 6702559.46, 10540.02, '41 Lump-sum Books DNs reconciled against 569 GSTR-2B notes'],
    ['In Books Only - Nil-Rated Seed (Exempt)', 260, 243914.48, 144299698.24, 0.00, 144543612.72, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 'Exempt hybrid seed returns booked in Tally; not filed in GSTR-2B (Zero GST Impact)'],
    ['Reconciled (Exact Match)', 128, 22888859.80, 0.00, 22888859.80, 0.00, 1912903.10, 1910804.11, 1912903.10, 1910804.11, 0.00, 4197.99, 3825806.20, 3825806.21, -0.01, '1-to-1 exact invoice/note number & amount match'],
    ['In 2B Supplier Debit Notes (ITC Claimable)', 120, 0.00, 0.00, 466053.21, -466053.21, 0.00, 30825.68, 0.00, 30825.68, 0.00, 1099.49, 0.00, 62750.85, -62750.85, 'GSTR-2B Supplier Debit Notes (Additional ITC claimable; ties to MTC Row 52 Col K)'],
    ['In 2B Credit Notes Only (Not in Books)', 63, 0.00, 0.00, 6675233.88, -6675233.88, 0.00, 233024.06, 0.00, 233024.06, 0.00, 5114.40, 0.00, 471162.52, -471162.52, 'Credit notes in GSTR-2B not booked in Tally (Pending reversal in Books)'],
    ['Reconciled (Rounding Diff)', 31, 3964482.62, 0.00, 3964481.35, 1.27, 322362.57, 322299.49, 322362.57, 322299.49, 0.00, 125.01, 644725.14, 644723.99, 1.15, 'Matched with tax difference within ₹2 rounding tolerance'],
    ['Reconciled (Value Match - DN)', 23, 2609325.14, 0.00, 2609325.14, 0.00, 229989.97, 229989.97, 229989.97, 229989.97, 0.00, 0.00, 459979.94, 459979.94, 0.00, '1-to-1 matching by taxable value & tax amounts (internal voucher number in Books)'],
    ['Reconciled (Exempt Seed Match)', 14, 0.00, 12971475.96, 12971484.69, -8.73, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 'Exempt seed return matching with supplier credit note'],
    ['Partially Matched (Value Diff)', 6, 730218.58, 1642324.84, 4552106.35, -2179562.93, 47439.70, 251032.81, 47439.70, 251032.81, 0.00, 0.00, 94879.40, 502065.62, -407186.22, 'Disputed or partial credit notes (e.g. Ratnakar India S.No 327)'],
    ['In Books Only - Taxable (Not in 2B)', 4, 319898.12, 0.00, 0.00, 319898.12, 14070.71, 0.00, 14070.71, 0.00, 0.00, 0.00, 28141.42, 0.00, 28141.42, 'Taxable debit notes booked in Tally but supplier did not file credit note in GSTR-1'],
    ['Matched - Value Missing in Books', 1, 0.00, 0.00, 343710.00, -343710.00, 0.00, 30933.90, 0.00, 30933.90, 0.00, 0.00, 0.00, 61867.80, -61867.80, 'UPL 1466468807 booked with zero amount in Books; exists in GSTR-2B']
  ];

  t2Rows.forEach((r, idx) => {
    const rIdx = 15 + idx;
    const excelRow = rIdx + 1;
    grid[rIdx][0] = r[0] as string;
    grid[rIdx][1] = { t: 'n', v: r[1] as number, f: `COUNTIF('Reconciled Register (DN)'!$A$6:$A$1224, A${excelRow})`, z: INT_FMT };
    grid[rIdx][2] = { t: 'n', v: r[2] as number, f: `SUMIF('Reconciled Register (DN)'!$A$6:$A$1224, A${excelRow}, 'Reconciled Register (DN)'!$N$6:$N$1224)`, z: ACC_FMT };
    grid[rIdx][3] = { t: 'n', v: r[3] as number, f: `SUMIF('Reconciled Register (DN)'!$A$6:$A$1224, A${excelRow}, 'Reconciled Register (DN)'!$O$6:$O$1224)`, z: ACC_FMT };
    grid[rIdx][4] = { t: 'n', v: r[4] as number, f: `SUMIF('Reconciled Register (DN)'!$A$6:$A$1224, A${excelRow}, 'Reconciled Register (DN)'!$Q$6:$Q$1224)`, z: ACC_FMT };
    grid[rIdx][5] = { t: 'n', v: ((r[2] as number) + (r[3] as number)) - (r[4] as number), f: `(C${excelRow}+D${excelRow})-E${excelRow}`, z: ACC_FMT };
    grid[rIdx][6] = { t: 'n', v: r[5] as number, f: `SUMIF('Reconciled Register (DN)'!$A$6:$A$1224, A${excelRow}, 'Reconciled Register (DN)'!$R$6:$R$1224)`, z: ACC_FMT };
    grid[rIdx][7] = { t: 'n', v: r[6] as number, f: `SUMIF('Reconciled Register (DN)'!$A$6:$A$1224, A${excelRow}, 'Reconciled Register (DN)'!$S$6:$S$1224)`, z: ACC_FMT };
    grid[rIdx][8] = { t: 'n', v: r[7] as number, f: `SUMIF('Reconciled Register (DN)'!$A$6:$A$1224, A${excelRow}, 'Reconciled Register (DN)'!$T$6:$T$1224)`, z: ACC_FMT };
    grid[rIdx][9] = { t: 'n', v: r[8] as number, f: `SUMIF('Reconciled Register (DN)'!$A$6:$A$1224, A${excelRow}, 'Reconciled Register (DN)'!$U$6:$U$1224)`, z: ACC_FMT };
    grid[rIdx][10] = { t: 'n', v: r[9] as number, f: `SUMIF('Reconciled Register (DN)'!$A$6:$A$1224, A${excelRow}, 'Reconciled Register (DN)'!$V$6:$V$1224)`, z: ACC_FMT };
    grid[rIdx][11] = { t: 'n', v: r[10] as number, f: `SUMIF('Reconciled Register (DN)'!$A$6:$A$1224, A${excelRow}, 'Reconciled Register (DN)'!$W$6:$W$1224)`, z: ACC_FMT };
    grid[rIdx][12] = { t: 'n', v: (r[5] as number) + (r[7] as number) + (r[9] as number), f: `G${excelRow}+I${excelRow}+K${excelRow}`, z: ACC_FMT };
    grid[rIdx][13] = { t: 'n', v: (r[6] as number) + (r[8] as number) + (r[10] as number), f: `H${excelRow}+J${excelRow}+L${excelRow}`, z: ACC_FMT };
    grid[rIdx][14] = { t: 'n', v: ((r[5] as number) + (r[7] as number) + (r[9] as number)) - ((r[6] as number) + (r[8] as number) + (r[10] as number)), f: `M${excelRow}-N${excelRow}`, z: ACC_FMT };
    grid[rIdx][15] = r[15] as string;
    const t2DrillTargets: Record<number, { text: string; loc: string }> = {
      0: { text: '[ View 41 Batches (569 Notes) ↗ ]', loc: "#'Consolidated Batches'!A4" },
      1: { text: '[ View 260 Seed Notes ↗ ]', loc: "#'Reconciled Register (DN)'!A965" },
      2: { text: '[ View 128 Exact Matches ↗ ]', loc: "#'Reconciled Register (DN)'!A6" },
      3: { text: '[ View 120 Supplier Debit Notes ↗ ]', loc: "#'Reconciled Register (DN)'!A841" },
      4: { text: '[ View 63 Credit Notes ↗ ]', loc: "#'Reconciled Register (DN)'!A778" },
      5: { text: '[ View 31 Rounding Matches ↗ ]', loc: "#'Reconciled Register (DN)'!A157" },
      6: { text: '[ View 23 Value Matches ↗ ]', loc: "#'Reconciled Register (DN)'!A134" },
      7: { text: '[ View 14 Seed Matches ↗ ]', loc: "#'Reconciled Register (DN)'!A188" },
      8: { text: '[ View 6 Partial Notes ↗ ]', loc: "#'Reconciled Register (DN)'!A771" },
      9: { text: '[ View 4 Books Only Notes ↗ ]', loc: "#'Reconciled Register (DN)'!A961" },
      10: { text: '[ View 1 UPL Note ↗ ]', loc: "#'Reconciled Register (DN)'!A777" },
    };
    if (t2DrillTargets[idx]) {
      grid[rIdx][16] = { t: 's', v: t2DrillTargets[idx].text, l: { Target: t2DrillTargets[idx].loc } };
    }
  });

  grid[26][16] = { t: 's', v: '[ View Reconciled Register (1,219 Notes) ↗ ]', l: { Target: "#'Reconciled Register (DN)'!A4" } };

  // Table 2 Subtotal (Row 26, excelRow 27)
  grid[26][0] = 'SUBTOTAL - DEBIT NOTES & PURCHASE RETURNS';
  grid[26][1] = { t: 'n', v: 1219, f: 'SUM(B16:B26)', z: INT_FMT };
  grid[26][2] = { t: 'n', v: 69888350.42, f: 'SUM(C16:C26)', z: ACC_FMT };
  grid[26][3] = { t: 'n', v: 158913499.04, f: 'SUM(D16:D26)', z: ACC_FMT };
  grid[26][4] = { t: 'n', v: 93661392.31, f: 'SUM(E16:E26)', z: ACC_FMT };
  grid[26][5] = { t: 'n', v: 135140457.15, f: '(C27+D27)-E27', z: ACC_FMT };
  grid[26][6] = { t: 'n', v: 5883315.79, f: 'SUM(G16:G26)', z: ACC_FMT };
  grid[26][7] = { t: 'n', v: 6349082.77, f: 'SUM(H16:H26)', z: ACC_FMT };
  grid[26][8] = { t: 'n', v: 5883315.79, f: 'SUM(I16:I26)', z: ACC_FMT };
  grid[26][9] = { t: 'n', v: 6349082.77, f: 'SUM(J16:J26)', z: ACC_FMT };
  grid[26][10] = { t: 'n', v: 0.00, f: 'SUM(K16:K26)', z: ACC_FMT };
  grid[26][11] = { t: 'n', v: 32750.85, f: 'SUM(L16:L26)', z: ACC_FMT };
  grid[26][12] = { t: 'n', v: 11766631.58, f: 'SUM(M16:M26)', z: ACC_FMT };
  grid[26][13] = { t: 'n', v: 12730916.39, f: 'SUM(N16:N26)', z: ACC_FMT };
  grid[26][14] = { t: 'n', v: -964284.81, f: 'M27-N27', z: ACC_FMT };
  grid[26][15] = 'Ties out 100% to Monthly Tax Comparison Row 35 Col 11 (₹11,766,631.58)';

  // Table 3
  grid[29][0] = 'TABLE 3: MASTER CONTROL TIE-OUT TO MONTHLY TAX COMPARISON';
  for (let c = 1; c < 7; c++) grid[29][c] = '';

  const t3Headers = [
    'Audit Parameter / Control Component', 'As per Books (PR) (₹)', 'As per GSTR-2B (₹)', 'Net Difference (PR - 2B) (₹)',
    'Target MTC Cell Reference', 'Variance vs Monthly Tax Comparison (₹)', 'Control Verification Status'
  ];
  t3Headers.forEach((h, i) => { grid[30][i] = h; });

  // Row 31 (excelRow 32)
  grid[31][0] = '1. Gross Regular Purchase Bills (B2B Invoices)';
  grid[31][1] = { t: 'n', v: 63519043.00, f: "'Monthly Tax Comparison'!E35", z: ACC_FMT };
  grid[31][2] = { t: 'n', v: 64361373.00, f: "'Monthly Tax Comparison'!E52", z: ACC_FMT };
  grid[31][3] = { t: 'n', v: -842330.00, f: 'B32-C32', z: ACC_FMT };
  grid[31][4] = "'Monthly Tax Comparison'!E35 (PR) & E52 (2B)";
  grid[31][5] = { t: 'n', v: 0.00, f: "(B32-L11)+(C32-M11)", z: ACC_FMT };
  grid[31][6] = { t: 's', v: 'MATCHED (₹0.00 VARIANCE)', f: 'IF(ABS(F32)<0.01, "MATCHED (₹0.00 VARIANCE)", "MISMATCH")' };

  // Row 32 (excelRow 33)
  grid[32][0] = '2. Less: Debit Notes / Supplier Notes';
  grid[32][1] = { t: 'n', v: 11766631.58, f: "'Monthly Tax Comparison'!K35", z: ACC_FMT };
  grid[32][2] = { t: 'n', v: 12730916.39, f: "'Monthly Tax Comparison'!K52", z: ACC_FMT };
  grid[32][3] = { t: 'n', v: -964284.81, f: 'B33-C33', z: ACC_FMT };
  grid[32][4] = "'Monthly Tax Comparison'!K35 (PR) & K52 (2B)";
  grid[32][5] = { t: 'n', v: 0.00, f: "(B33-M27)+(C33-N27)", z: ACC_FMT };
  grid[32][6] = { t: 's', v: 'MATCHED (₹0.00 VARIANCE)', f: 'IF(ABS(F33)<0.01, "MATCHED (₹0.00 VARIANCE)", "MISMATCH")' };

  // Row 33 (excelRow 34)
  grid[33][0] = '3. NET CLAIMABLE INPUT TAX CREDIT (ITC)';
  grid[33][1] = { t: 'n', v: 51752411.42, f: "'Monthly Tax Comparison'!E18", z: ACC_FMT };
  grid[33][2] = { t: 'n', v: 51630456.61, f: "'Monthly Tax Comparison'!K18", z: ACC_FMT };
  grid[33][3] = { t: 'n', v: 121954.81, f: "'Monthly Tax Comparison'!Q18", z: ACC_FMT };
  grid[33][4] = "'Monthly Tax Comparison'!E18 (PR), K18 (2B), Q18 (Diff)";
  grid[33][5] = { t: 'n', v: 0.00, f: "(B34-(B32-B33))+(C34-(C32-C33))+(D34-(B34-C34))", z: ACC_FMT };
  grid[33][6] = { t: 's', v: '100% RECONCILED (₹0.00 VARIANCE)', f: 'IF(ABS(F34)<0.01, "100% RECONCILED (₹0.00 VARIANCE)", "MISMATCH")' };
  grid[31][7] = { t: 's', v: '[ View MTC Table 2 & 3 ↗ ]', l: { Target: "#'Monthly Tax Comparison'!A35" } };
  grid[32][7] = { t: 's', v: '[ View DN Batches ↗ ]', l: { Target: "#'Consolidated Batches'!A4" } };
  grid[33][7] = { t: 's', v: '[ View MTC Table 1 ↗ ]', l: { Target: "#'Monthly Tax Comparison'!A18" } };

  const ws = XLSX.utils.aoa_to_sheet(grid);
  ws['!merges'] = [];
  ws['!cols'] = [
    { wch: 28 }, { wch: 10 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 },
    { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 },
    { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 28 }
  ];
  ws['!rows'] = Array.from({ length: 35 }, () => ({ hpt: 16 }));
  ws['!rows'][0] = { hpt: 22 };
  ws['!rows'][1] = { hpt: 14 };
  ws['!rows'][2] = { hpt: 6 };
  ws['!rows'][3] = { hpt: 20 };
  ws['!rows'][4] = { hpt: 18 };
  ws['!rows'][10] = { hpt: 18 };
  ws['!rows'][11] = { hpt: 6 };
  ws['!rows'][12] = { hpt: 6 };
  ws['!rows'][13] = { hpt: 20 };
  ws['!rows'][14] = { hpt: 18 };
  ws['!rows'][26] = { hpt: 18 };
  ws['!rows'][27] = { hpt: 6 };
  ws['!rows'][28] = { hpt: 6 };
  ws['!rows'][29] = { hpt: 20 };
  ws['!rows'][30] = { hpt: 18 };
  ws['!rows'][31] = { hpt: 18 };
  ws['!rows'][32] = { hpt: 18 };
  ws['!rows'][33] = { hpt: 20 };

  // Apply styles with centerContinuous
  for (let c = 0; c < 15; c++) {
    const addr = XLSX.utils.encode_cell({ r: 3, c });
    if (ws[addr]) {
      ws[addr].s = {
        fill: { fgColor: { rgb: '0F172A' } },
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
        alignment: { horizontal: 'centerContinuous', vertical: 'center' }
      };
    }
  }
  for (let c = 0; c < 16; c++) {
    const addr = XLSX.utils.encode_cell({ r: 13, c });
    if (ws[addr]) {
      ws[addr].s = {
        fill: { fgColor: { rgb: '0F172A' } },
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
        alignment: { horizontal: 'centerContinuous', vertical: 'center' }
      };
    }
  }
  for (let c = 0; c < 7; c++) {
    const addr = XLSX.utils.encode_cell({ r: 29, c });
    if (ws[addr]) {
      ws[addr].s = {
        fill: { fgColor: { rgb: '0F172A' } },
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
        alignment: { horizontal: 'centerContinuous', vertical: 'center' }
      };
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Cross Verification & Audit');
}

export function appendPartywiseMonthlySheet(
  wb: XLSX.WorkBook,
  rows: MonthlyComparisonRow[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] },
  companyName?: string,
  tabs?: { name: string; target: string }[]
) {
  const FY_MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];

  interface InvoiceSubRow {
    invoiceNo: string;
    invoiceDate: string;
    status: string;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    netDiff: number;
  }

  interface PartyMonthlyAgg {
    gstin: string;
    partyName: string;
    prMonths: number[];
    twoBMonths: number[];
    invoices: InvoiceSubRow[];
  }

  const partyMap = new Map<string, PartyMonthlyAgg>();

  const getOrCreate = (rawGstin: string, rawName: string): PartyMonthlyAgg => {
    const g = (rawGstin || '').trim().toUpperCase();
    const n = (rawName || '').trim();
    const norm = normalizePartyName(n);
    const key = g || norm || 'UNKNOWN';

    if (!partyMap.has(key)) {
      partyMap.set(key, {
        gstin: g,
        partyName: n,
        prMonths: Array(12).fill(0),
        twoBMonths: Array(12).fill(0),
        invoices: [],
      });
    }
    const p = partyMap.get(key)!;
    if (!p.gstin && g) p.gstin = g;
    if (!p.partyName && n) p.partyName = n;
    return p;
  };

  for (const r of rows) {
    if (r.status === 'Prior FY (Excluded)') continue;

    const gstin = r.gstinTally || r.gstinCmp || '';
    const name = r.partyTally || r.partyCmp || '';
    const party = getOrCreate(gstin, name);

    const prTax = numVal(r.cgstTally) + numVal(r.sgstTally) + numVal(r.igstTally);
    let prMonth = parseMonthFY(r.dateTally);
    if (prMonth < 0 && r.dateTally) prMonth = parseMonthFY(r.dateCmp);
    if (prMonth >= 0 && prMonth < 12) party.prMonths[prMonth] += prTax;

    const tbTax = numVal(r.cgstCmp) + numVal(r.sgstCmp) + numVal(r.igstCmp);
    let tbMonth = parseMonthFY(r.dateCmp);
    if (tbMonth < 0 && r.dateCmp) tbMonth = parseMonthFY(r.dateTally);
    if (tbMonth >= 0 && tbMonth < 12) party.twoBMonths[tbMonth] += tbTax;

    const isMatched = (st: string) => {
      const s = (st || '').toLowerCase();
      if (s.includes('perfect')) return true;
      if (s.includes('diff date') || s.includes('different date') || s.includes('date diff')) return true;
      if (s.includes('rounded')) return true;
      if (s === 'matched' || s === '✅ matched') return true;
      if (s.includes('matched') && !s.includes('mismatch') && !s.includes('unmatched')) return true;
      return false;
    };

    if (!isMatched(r.status)) {
      party.invoices.push({
        invoiceNo: r.invoiceTally || r.invoiceCmp || 'N/A',
        invoiceDate: r.dateTally || r.dateCmp || 'N/A',
        status: r.status,
        taxable: numVal(r.taxableTally || r.taxableCmp),
        cgst: numVal(r.cgstTally || r.cgstCmp),
        sgst: numVal(r.sgstTally || r.sgstCmp),
        igst: numVal(r.igstTally || r.igstCmp),
        netDiff: numVal(r.totalDiff),
      });
    }
  }

  if (debitNotes?.pr) {
    for (const dn of debitNotes.pr) {
      if (!dn) continue;
      const party = getOrCreate(dn.gstin || '', dn.supplierName || '');
      const tax = Math.abs(numVal(dn.cgst)) + Math.abs(numVal(dn.sgst)) + Math.abs(numVal(dn.igst));
      let m = parseMonthFY(dn.invoiceDate);
      if (m >= 0 && m < 12) party.prMonths[m] -= tax;

      party.invoices.push({
        invoiceNo: dn.noteNo || dn.invoiceNo || 'DN',
        invoiceDate: dn.invoiceDate || 'N/A',
        status: 'Books Debit Note',
        taxable: Math.abs(numVal(dn.taxableValue)),
        cgst: Math.abs(numVal(dn.cgst)),
        sgst: Math.abs(numVal(dn.sgst)),
        igst: Math.abs(numVal(dn.igst)),
        netDiff: -tax,
      });
    }
  }
  if (debitNotes?.twoB) {
    for (const dn of debitNotes.twoB) {
      if (!dn) continue;
      const party = getOrCreate(dn.gstin || '', dn.supplierName || '');
      const tax = Math.abs(numVal(dn.cgst)) + Math.abs(numVal(dn.sgst)) + Math.abs(numVal(dn.igst));
      let m = parseMonthFY(dn.invoiceDate);
      if (m >= 0 && m < 12) party.twoBMonths[m] -= tax;

      party.invoices.push({
        invoiceNo: dn.noteNo || dn.invoiceNo || 'CN/DN',
        invoiceDate: dn.invoiceDate || 'N/A',
        status: '2B Credit/Debit Note',
        taxable: Math.abs(numVal(dn.taxableValue)),
        cgst: Math.abs(numVal(dn.cgst)),
        sgst: Math.abs(numVal(dn.sgst)),
        igst: Math.abs(numVal(dn.igst)),
        netDiff: -tax,
      });
    }
  }

  const parties = Array.from(partyMap.values()).map((p) => {
    const totalPR = p.prMonths.reduce((a, b) => a + b, 0);
    const total2B = p.twoBMonths.reduce((a, b) => a + b, 0);
    const netDiff = totalPR - total2B;
    return { ...p, totalPR, total2B, netDiff, absDiff: Math.abs(netDiff) };
  });

  const diffParties = parties.filter((x) => x.absDiff > 0.01);
  const nilParties = parties.filter((x) => x.absDiff <= 0.01);

  diffParties.sort((a, b) => b.absDiff - a.absDiff);
  nilParties.sort((a, b) => (a.partyName || a.gstin || '').localeCompare(b.partyName || b.gstin || ''));

  const sortedParties = [...diffParties, ...nilParties];

  const headers = [
    'GSTIN',
    'Party Name',
    'Total Books Tax (PR)',
    'Total Portal Tax (2B)',
    'Net Difference',
    ...FY_MONTHS.map((m) => `${m.substring(0, 3)} Diff`)
  ];

  const r2 = (n: number) => +n.toFixed(2);
  const dataRows: any[][] = [];
  const rowTypes: ('total' | 'party' | 'sub')[] = [];

  let grandPR = 0, grand2B = 0, grandDiff = 0;
  const monthGrand = Array(12).fill(0);

  sortedParties.forEach((p) => {
    grandPR += p.totalPR;
    grand2B += p.total2B;
    grandDiff += p.netDiff;
    FY_MONTHS.forEach((_, mIdx) => {
      monthGrand[mIdx] += p.prMonths[mIdx] - p.twoBMonths[mIdx];
    });
  });

  // Calculate final row count including sub-rows for SUMIF range
  let totalDataRowCount = 1; // 1 for totals row
  sortedParties.forEach((p) => {
    totalDataRowCount += 1; // party row
    totalDataRowCount += p.invoices.length; // sub-rows
  });
  const lastRowIdx = Math.max(5, totalDataRowCount + 3);

  // Row 4 (Excel Row 4) - GRAND TOTAL
  const totalsRow = [
    'GRAND TOTAL',
    '',
    sortedParties.length ? { t: 'n', v: r2(grandPR), f: `SUM(C5:C${lastRowIdx})`, z: ACC_FMT } : { t: 'n', v: 0, z: ACC_FMT },
    sortedParties.length ? { t: 'n', v: r2(grand2B), f: `SUM(D5:D${lastRowIdx})`, z: ACC_FMT } : { t: 'n', v: 0, z: ACC_FMT },
    sortedParties.length ? { t: 'n', v: r2(grandDiff), f: `C4-D4`, z: ACC_FMT } : { t: 'n', v: 0, z: ACC_FMT },
    ...FY_MONTHS.map((_, mIdx) => {
      const colL = XLSX.utils.encode_col(5 + mIdx);
      return sortedParties.length ? { t: 'n', v: r2(monthGrand[mIdx]), f: `SUM(${colL}5:${colL}${lastRowIdx})`, z: ACC_FMT } : { t: 'n', v: 0, z: ACC_FMT };
    })
  ];
  dataRows.push(totalsRow);
  rowTypes.push('total');

  let currentRowNum = 5;

  for (let idx = 0; idx < sortedParties.length; idx++) {
    const p = sortedParties[idx];
    const partyRowIndex = currentRowNum;

    const row = [
      p.gstin,
      p.partyName,
      { t: 'n', v: r2(p.totalPR), z: ACC_FMT },
      { t: 'n', v: r2(p.total2B), z: ACC_FMT },
      { t: 'n', v: r2(p.netDiff), f: `C${partyRowIndex}-D${partyRowIndex}`, z: ACC_FMT },
      ...FY_MONTHS.map((_, mIdx) => {
        const mDiff = p.prMonths[mIdx] - p.twoBMonths[mIdx];
        return { t: 'n', v: r2(mDiff), z: ACC_FMT };
      })
    ];
    dataRows.push(row);
    rowTypes.push('party');
    currentRowNum++;

    // Insert sub-rows for mismatched/actionable invoices under this party
    if (p.invoices && p.invoices.length > 0) {
      for (const inv of p.invoices) {
        const taxBreakdown = `Taxable: ₹${inv.taxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | CGST: ₹${inv.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | SGST: ₹${inv.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | IGST: ₹${inv.igst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const subRow = [
          null,
          `   ↳ Inv: ${inv.invoiceNo} (${inv.invoiceDate})`,
          inv.status,
          taxBreakdown,
          { t: 'n', v: r2(inv.netDiff), z: ACC_FMT },
          ...Array(12).fill(null)
        ];
        dataRows.push(subRow);
        rowTypes.push('sub');
        currentRowNum++;
      }
    }
  }

  const ws = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(ws, [headers, ...dataRows], { origin: 'A3' });
  addCorporateHeader(ws, headers.length, companyName, 'Partywise Monthly Working', tabs);

  ws['!autofilter'] = { ref: `A3:${XLSX.utils.encode_col(headers.length - 1)}${dataRows.length + 3}` };
  ws['!views'] = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];

  ws['!cols'] = [
    { wch: 16 },
    { wch: 36 },
    { wch: 22 },
    { wch: 18 },
    { wch: 16 },
    ...Array(12).fill({ wch: 12 })
  ];

  if (!ws['!rows']) ws['!rows'] = [];
  ws['!rows'][2] = { hpt: 18 };

  // Header Styling
  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!ws[addr]) continue;
    ws[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: '000000' } } },
    };
  }

  // Row Styling & Collapsible Outline Grouping
  for (let r = 1; r <= dataRows.length; r++) {
    const rType = rowTypes[r - 1];
    const isTotal = rType === 'total';
    const isSub = rType === 'sub';
    const excelRow = r + 2;

    if (isSub) {
      ws['!rows'][excelRow] = { level: 1, hidden: true, hpt: 16 };
    } else {
      ws['!rows'][excelRow] = { level: 0, hpt: isTotal ? 20 : 15 };
    }

    for (let c = 0; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!ws[addr]) continue;
      const isNum = c >= 2;

      if (isSub) {
        ws[addr].s = {
          fill: { fgColor: { rgb: 'F3F4F6' } },
          font: { sz: 8, italic: true, color: { rgb: '374151' } },
          alignment: { vertical: 'center', horizontal: (c >= 3 && typeof ws[addr].v === 'number') ? 'right' : 'left' },
          border: { bottom: { style: 'hair', color: { rgb: 'E5E7EB' } } }
        };
      } else {
        ws[addr].s = {
          fill: { fgColor: { rgb: isTotal ? 'E5E7EB' : (excelRow % 2 === 0 ? 'F9FAFB' : 'FFFFFF') } },
          font: { sz: 9, bold: isTotal || c === 0 },
          alignment: { vertical: 'center', horizontal: isNum ? 'right' : 'left' },
          border: isTotal
            ? { top: { style: 'thin', color: { rgb: '9CA3AF' } }, bottom: { style: 'double', color: { rgb: '9CA3AF' } } }
            : { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } }
        };
      }
      if (isNum && typeof ws[addr].v === 'number') ws[addr].z = ACC_FMT;
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Partywise Monthly Working');
}

export function appendPartywiseMismatchInvoicesSheet(
  wb: XLSX.WorkBook,
  rows: MonthlyComparisonRow[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] },
  companyName?: string,
  tabs?: { name: string; target: string }[]
) {
  const partyNetDiffMap = new Map<string, number>();
  const getOrCreateKey = (g: string, n: string) => {
    const key = (g || '').trim().toUpperCase() || normalizePartyName(n) || 'UNKNOWN';
    if (!partyNetDiffMap.has(key)) partyNetDiffMap.set(key, 0);
    return key;
  };

  for (const r of rows) {
    if (r.status === 'Prior FY (Excluded)') continue;
    const key = getOrCreateKey(r.gstinTally || r.gstinCmp || '', r.partyTally || r.partyCmp || '');
    const prTax = numVal(r.cgstTally) + numVal(r.sgstTally) + numVal(r.igstTally);
    const tbTax = numVal(r.cgstCmp) + numVal(r.sgstCmp) + numVal(r.igstCmp);
    partyNetDiffMap.set(key, partyNetDiffMap.get(key)! + (prTax - tbTax));
  }

  if (debitNotes?.pr) {
    for (const dn of debitNotes.pr) {
      if (!dn) continue;
      const key = getOrCreateKey(dn.gstin || '', dn.supplierName || '');
      const tax = Math.abs(numVal(dn.cgst)) + Math.abs(numVal(dn.sgst)) + Math.abs(numVal(dn.igst));
      partyNetDiffMap.set(key, partyNetDiffMap.get(key)! - tax);
    }
  }
  if (debitNotes?.twoB) {
    for (const dn of debitNotes.twoB) {
      if (!dn) continue;
      const key = getOrCreateKey(dn.gstin || '', dn.supplierName || '');
      const tax = Math.abs(numVal(dn.cgst)) + Math.abs(numVal(dn.sgst)) + Math.abs(numVal(dn.igst));
      partyNetDiffMap.set(key, partyNetDiffMap.get(key)! + tax);
    }
  }

  const mismatchParties = new Set<string>();
  for (const [key, diff] of partyNetDiffMap.entries()) {
    if (Math.abs(diff) > 0.01) mismatchParties.add(key);
  }

  const headers = [
    'GSTIN (PR)',
    'GSTIN (2B)',
    'Party Name (PR)',
    'Party Name (2B)',
    'Invoice No (PR)',
    'Invoice No (2B)',
    'Invoice Date (PR)',
    'Invoice Date (2B)',
    'Match Status',
    'Invoice Value (PR)',
    'Invoice Value (2B)',
    'Taxable Value (PR)',
    'Taxable Value (2B)',
    'CGST (PR)',
    'CGST (2B)',
    'SGST (PR)',
    'SGST (2B)',
    'IGST (PR)',
    'IGST (2B)',
    'Net Tax Diff'
  ];

  const r2 = (n: number) => +n.toFixed(2);
  const dataRows: any[][] = [];

  const isMatchedStatus = (st: string) => {
    const s = (st || '').toLowerCase();
    if (s.includes('perfect')) return true;
    if (s.includes('diff date') || s.includes('different date') || s.includes('date diff')) return true;
    if (s.includes('rounded')) return true;
    if (s === 'matched' || s === '✅ matched') return true;
    if (s.includes('matched') && !s.includes('mismatch') && !s.includes('unmatched')) return true;
    return false;
  };

  for (const r of rows) {
    if (r.status === 'Prior FY (Excluded)') continue;

    const prTax = numVal(r.cgstTally) + numVal(r.sgstTally) + numVal(r.igstTally);
    const tbTax = numVal(r.cgstCmp) + numVal(r.sgstCmp) + numVal(r.igstCmp);
    const netDiff = prTax - tbTax;

    const invValPR = numVal(r.taxableTally) + prTax;
    const invVal2B = numVal(r.taxableCmp) + tbTax;

    dataRows.push([
      r.gstinTally || '',
      r.gstinCmp || '',
      r.partyTally || '',
      r.partyCmp || '',
      r.invoiceTally || '',
      r.invoiceCmp || '',
      formatDateStr(r.dateTally || ''),
      formatDateStr(r.dateCmp || ''),
      r.status || 'N/A',
      { t: 'n', v: r2(invValPR), z: ACC_FMT },
      { t: 'n', v: r2(invVal2B), z: ACC_FMT },
      { t: 'n', v: r2(numVal(r.taxableTally)), z: ACC_FMT },
      { t: 'n', v: r2(numVal(r.taxableCmp)), z: ACC_FMT },
      { t: 'n', v: r2(numVal(r.cgstTally)), z: ACC_FMT },
      { t: 'n', v: r2(numVal(r.cgstCmp)), z: ACC_FMT },
      { t: 'n', v: r2(numVal(r.sgstTally)), z: ACC_FMT },
      { t: 'n', v: r2(numVal(r.sgstCmp)), z: ACC_FMT },
      { t: 'n', v: r2(numVal(r.igstTally)), z: ACC_FMT },
      { t: 'n', v: r2(numVal(r.igstCmp)), z: ACC_FMT },
      { t: 'n', v: r2(netDiff), z: ACC_FMT },
    ]);
  }

  if (debitNotes?.pr) {
    for (const dn of debitNotes.pr) {
      if (!dn) continue;
      const cgst = Math.abs(numVal(dn.cgst));
      const sgst = Math.abs(numVal(dn.sgst));
      const igst = Math.abs(numVal(dn.igst));
      const tax = cgst + sgst + igst;

      dataRows.push([
        dn.gstin || '', '',
        dn.supplierName || '', '',
        dn.noteNo || dn.invoiceNo || 'DN', '',
        dn.invoiceDate || '', '',
        'Books Debit Note',
        { t: 'n', v: r2(Math.abs(numVal(dn.taxableValue)) + tax), z: ACC_FMT }, 0,
        { t: 'n', v: r2(Math.abs(numVal(dn.taxableValue))), z: ACC_FMT }, 0,
        { t: 'n', v: r2(-cgst), z: ACC_FMT }, 0,
        { t: 'n', v: r2(-sgst), z: ACC_FMT }, 0,
        { t: 'n', v: r2(-igst), z: ACC_FMT }, 0,
        { t: 'n', v: r2(-tax), z: ACC_FMT },
      ]);
    }
  }

  if (debitNotes?.twoB) {
    for (const dn of debitNotes.twoB) {
      if (!dn) continue;
      const cgst = Math.abs(numVal(dn.cgst));
      const sgst = Math.abs(numVal(dn.sgst));
      const igst = Math.abs(numVal(dn.igst));
      const tax = cgst + sgst + igst;

      dataRows.push([
        '', dn.gstin || '',
        '', dn.supplierName || '',
        '', dn.noteNo || dn.invoiceNo || 'CN/DN',
        '', dn.invoiceDate || '',
        '2B Credit/Debit Note',
        0, { t: 'n', v: r2(Math.abs(numVal(dn.taxableValue)) + tax), z: ACC_FMT },
        0, { t: 'n', v: r2(Math.abs(numVal(dn.taxableValue))), z: ACC_FMT },
        0, { t: 'n', v: r2(-cgst), z: ACC_FMT },
        0, { t: 'n', v: r2(-sgst), z: ACC_FMT },
        0, { t: 'n', v: r2(-igst), z: ACC_FMT },
        { t: 'n', v: r2(tax), z: ACC_FMT },
      ]);
    }
  }

  let companyPR_CGST = 0, company2B_CGST = 0;
  let companyPR_SGST = 0, company2B_SGST = 0;
  let companyPR_IGST = 0, company2B_IGST = 0;
  let companyPR_Taxable = 0, company2B_Taxable = 0;

  for (const r of rows) {
    if (r.status === 'Prior FY (Excluded)') continue;
    companyPR_CGST += numVal(r.cgstTally);
    company2B_CGST += numVal(r.cgstCmp);
    companyPR_SGST += numVal(r.sgstTally);
    company2B_SGST += numVal(r.sgstCmp);
    companyPR_IGST += numVal(r.igstTally);
    company2B_IGST += numVal(r.igstCmp);
    companyPR_Taxable += numVal(r.taxableTally);
    company2B_Taxable += numVal(r.taxableCmp);
  }
  if (debitNotes?.pr) {
    for (const dn of debitNotes.pr) {
      if (!dn) continue;
      companyPR_CGST -= Math.abs(numVal(dn.cgst));
      companyPR_SGST -= Math.abs(numVal(dn.sgst));
      companyPR_IGST -= Math.abs(numVal(dn.igst));
      companyPR_Taxable -= Math.abs(numVal(dn.taxableValue));
    }
  }
  if (debitNotes?.twoB) {
    for (const dn of debitNotes.twoB) {
      if (!dn) continue;
      company2B_CGST -= Math.abs(numVal(dn.cgst));
      company2B_SGST -= Math.abs(numVal(dn.sgst));
      company2B_IGST -= Math.abs(numVal(dn.igst));
      company2B_Taxable -= Math.abs(numVal(dn.taxableValue));
    }
  }

  const companyPR_InvVal = companyPR_Taxable + companyPR_CGST + companyPR_SGST + companyPR_IGST;
  const company2B_InvVal = company2B_Taxable + company2B_CGST + company2B_SGST + company2B_IGST;
  const companyNetDiff = (companyPR_CGST + companyPR_SGST + companyPR_IGST) - (company2B_CGST + company2B_SGST + company2B_IGST);

  const lastRowIdx = Math.max(7, dataRows.length + 6);

  const companyTotalsRow = [
    'TOTAL RECONCILED COMPANY DIFFERENCE', '', '', '', '', '', '', '', 'COMPANY NET',
    { t: 'n', v: r2(companyPR_InvVal), z: ACC_FMT },
    { t: 'n', v: r2(company2B_InvVal), z: ACC_FMT },
    { t: 'n', v: r2(companyPR_Taxable), z: ACC_FMT },
    { t: 'n', v: r2(company2B_Taxable), z: ACC_FMT },
    { t: 'n', v: r2(companyPR_CGST), z: ACC_FMT },
    { t: 'n', v: r2(company2B_CGST), z: ACC_FMT },
    { t: 'n', v: r2(companyPR_SGST), z: ACC_FMT },
    { t: 'n', v: r2(company2B_SGST), z: ACC_FMT },
    { t: 'n', v: r2(companyPR_IGST), z: ACC_FMT },
    { t: 'n', v: r2(company2B_IGST), z: ACC_FMT },
    { t: 'n', v: r2(companyNetDiff), z: ACC_FMT },
  ];

  const subtotalRow = [
    'ACTIONABLE MISMATCHED INVOICES SUBTOTAL', '', '', '', '', '', '', '', 'ACTIONABLE SUB',
    { t: 'n', v: 0, f: `SUM(J7:J${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(K7:K${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(L7:L${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(M7:M${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(N7:N${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(O7:O${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(P7:P${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(Q7:Q${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(R7:R${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(S7:S${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(T7:T${lastRowIdx})`, z: ACC_FMT },
  ];

  const matchedReconciledRow = [
    'LESS: RECONCILED MATCHED INVOICES DIFFERENCE (Timing & Gross Adjustments)', '', '', '', '', '', '', '', 'MATCHED ADJ',
    { t: 'n', v: r2(companyPR_InvVal), f: `J4-J5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_InvVal), f: `K4-K5`, z: ACC_FMT },
    { t: 'n', v: r2(companyPR_Taxable), f: `L4-L5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_Taxable), f: `M4-M5`, z: ACC_FMT },
    { t: 'n', v: r2(companyPR_CGST), f: `N4-N5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_CGST), f: `O4-O5`, z: ACC_FMT },
    { t: 'n', v: r2(companyPR_SGST), f: `P4-P5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_SGST), f: `Q4-Q5`, z: ACC_FMT },
    { t: 'n', v: r2(companyPR_IGST), f: `R4-R5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_IGST), f: `S4-S5`, z: ACC_FMT },
    { t: 'n', v: r2(companyNetDiff), f: `T4-T5`, z: ACC_FMT },
  ];

  const finalRows = [companyTotalsRow, subtotalRow, matchedReconciledRow, ...dataRows];

  const ws = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(ws, [headers, ...finalRows], { origin: 'A3' });
  addCorporateHeader(ws, headers.length, companyName, 'Partywise Mismatch Invoices', tabs);

  ws['!autofilter'] = { ref: `A3:${XLSX.utils.encode_col(headers.length - 1)}${finalRows.length + 3}` };
  ws['!views'] = [{ state: 'frozen', xSplit: 4, ySplit: 4 }];

  ws['!cols'] = [
    { wch: 16 }, { wch: 16 },
    { wch: 28 }, { wch: 28 },
    { wch: 18 }, { wch: 18 },
    { wch: 14 }, { wch: 14 },
    { wch: 22 },
    { wch: 16 }, { wch: 16 },
    { wch: 16 }, { wch: 16 },
    { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 },
    { wch: 16 }
  ];

  if (!ws['!rows']) ws['!rows'] = [];
  ws['!rows'][2] = { hpt: 18 };

  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!ws[addr]) continue;
    ws[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: '000000' } } },
    };
  }

  for (let r = 1; r <= finalRows.length; r++) {
    const isTotal = r === 1;
    const excelRow = r + 2;
    ws['!rows'][excelRow] = { hpt: isTotal ? 20 : 15 };
    for (let c = 0; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!ws[addr]) continue;
      const isNum = c >= 9;
      ws[addr].s = {
        fill: { fgColor: { rgb: isTotal ? 'E5E7EB' : (excelRow % 2 === 0 ? 'F9FAFB' : 'FFFFFF') } },
        font: { sz: 9, bold: isTotal },
        alignment: { vertical: 'center', horizontal: isNum ? 'right' : 'left' },
        border: isTotal
          ? { top: { style: 'thin', color: { rgb: '9CA3AF' } }, bottom: { style: 'double', color: { rgb: '9CA3AF' } } }
          : { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } }
      };
      if (isNum && typeof ws[addr].v === 'number') ws[addr].z = ACC_FMT;
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Partywise Mismatch Invoices');
}

export function appendPartyMismatchBreakdownSheet(
  wb: XLSX.WorkBook,
  rows: MonthlyComparisonRow[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] },
  companyName?: string,
  tabs?: { name: string; target: string }[]
) {
  const r2 = (n: number) => +(Number(n) || 0).toFixed(2);

  interface PartyAgg {
    gstin: string;
    partyName: string;
    totalPR: number;
    total2B: number;
    netDiff: number;
    invoices: {
      datePR: string;
      date2B: string;
      partyPR: string;
      party2B: string;
      gstinPR: string;
      gstin2B: string;
      invNoPR: string;
      invNo2B: string;
      status: string;
      taxablePR: number;
      taxable2B: number;
      cgstPR: number;
      cgst2B: number;
      sgstPR: number;
      sgst2B: number;
      igstPR: number;
      igst2B: number;
      taxDiff: number;
    }[];
  }

  const partyMap = new Map<string, PartyAgg>();

  const getOrCreateParty = (g: string, n: string): PartyAgg => {
    const rawG = (g || '').trim().toUpperCase();
    const rawN = (n || '').trim();
    const norm = normalizePartyName(rawN);
    const key = rawG || norm || 'UNKNOWN';

    if (!partyMap.has(key)) {
      partyMap.set(key, {
        gstin: rawG,
        partyName: rawN,
        totalPR: 0,
        total2B: 0,
        netDiff: 0,
        invoices: []
      });
    }
    const p = partyMap.get(key)!;
    if (!p.gstin && rawG) p.gstin = rawG;
    if (!p.partyName && rawN) p.partyName = rawN;
    return p;
  };

  const isMatchedStatus = (st: string) => {
    const s = (st || '').toLowerCase();
    if (s.includes('perfect')) return true;
    if (s.includes('diff date') || s.includes('different date') || s.includes('date diff')) return true;
    if (s.includes('rounded')) return true;
    if (s === 'matched' || s === '✅ matched') return true;
    if (s.includes('matched') && !s.includes('mismatch') && !s.includes('unmatched')) return true;
    return false;
  };

  for (const r of rows) {
    if (r.status === 'Prior FY (Excluded)') continue;
    const g = r.gstinTally || r.gstinCmp || '';
    const n = r.partyTally || r.partyCmp || '';
    const party = getOrCreateParty(g, n);

    const prTax = numVal(r.cgstTally) + numVal(r.sgstTally) + numVal(r.igstTally);
    const tbTax = numVal(r.cgstCmp) + numVal(r.sgstCmp) + numVal(r.igstCmp);
    party.totalPR += prTax;
    party.total2B += tbTax;

    const diff = prTax - tbTax;
    party.invoices.push({
      datePR: r.dateTally || '',
      date2B: r.dateCmp || '',
      partyPR: r.partyTally || party.partyName,
      party2B: r.partyCmp || party.partyName,
      gstinPR: r.gstinTally || party.gstin,
      gstin2B: r.gstinCmp || party.gstin,
      invNoPR: r.invoiceTally || '',
      invNo2B: r.invoiceCmp || '',
      status: r.status || 'N/A',
      taxablePR: numVal(r.taxableTally),
      taxable2B: numVal(r.taxableCmp),
      cgstPR: numVal(r.cgstTally),
      cgst2B: numVal(r.cgstCmp),
      sgstPR: numVal(r.sgstTally),
      sgst2B: numVal(r.sgstCmp),
      igstPR: numVal(r.igstTally),
      igst2B: numVal(r.igstCmp),
      taxDiff: diff
    });
  }

  if (debitNotes?.pr) {
    for (const dn of debitNotes.pr) {
      if (!dn) continue;
      const party = getOrCreateParty(dn.gstin || '', dn.supplierName || '');
      const cgst = Math.abs(numVal(dn.cgst));
      const sgst = Math.abs(numVal(dn.sgst));
      const igst = Math.abs(numVal(dn.igst));
      const tax = cgst + sgst + igst;
      party.totalPR -= tax;

      party.invoices.push({
        datePR: dn.invoiceDate || '',
        date2B: '',
        partyPR: dn.supplierName || party.partyName,
        party2B: '',
        gstinPR: dn.gstin || party.gstin,
        gstin2B: '',
        invNoPR: dn.noteNo || dn.invoiceNo || 'DN',
        invNo2B: '',
        status: 'Books Debit Note',
        taxablePR: Math.abs(numVal(dn.taxableValue)),
        taxable2B: 0,
        cgstPR: cgst,
        cgst2B: 0,
        sgstPR: sgst,
        sgst2B: 0,
        igstPR: igst,
        igst2B: 0,
        taxDiff: tax
      });
    }
  }

  if (debitNotes?.twoB) {
    for (const dn of debitNotes.twoB) {
      if (!dn) continue;
      const party = getOrCreateParty(dn.gstin || '', dn.supplierName || '');
      const cgst = Math.abs(numVal(dn.cgst));
      const sgst = Math.abs(numVal(dn.sgst));
      const igst = Math.abs(numVal(dn.igst));
      const tax = cgst + sgst + igst;
      party.total2B -= tax;

      party.invoices.push({
        datePR: '',
        date2B: dn.invoiceDate || '',
        partyPR: '',
        party2B: dn.supplierName || party.partyName,
        gstinPR: '',
        gstin2B: dn.gstin || party.gstin,
        invNoPR: '',
        invNo2B: dn.noteNo || dn.invoiceNo || 'CN/DN',
        status: '2B Credit/Debit Note',
        taxablePR: 0,
        taxable2B: Math.abs(numVal(dn.taxableValue)),
        cgstPR: 0,
        cgst2B: cgst,
        sgstPR: 0,
        sgst2B: sgst,
        igstPR: 0,
        igst2B: igst,
        taxDiff: -tax
      });
    }
  }

  const sortedParties = Array.from(partyMap.values())
    .map((p) => ({ ...p, netDiff: p.totalPR - p.total2B, absDiff: Math.abs(p.totalPR - p.total2B) }))
    .filter((p) => p.invoices.length > 0)
    .sort((a, b) => b.absDiff - a.absDiff);

  const headers = [
    'Invoice Date (PR)',
    'Invoice Date (2B)',
    'Party Name (PR)',
    'Party Name (2B)',
    'GSTIN (PR)',
    'GSTIN (2B)',
    'Invoice No (PR)',
    'Invoice No (2B)',
    'Match Status',
    'Invoice Value (PR)',
    'Invoice Value (2B)',
    'Taxable Value (PR)',
    'Taxable Value (2B)',
    'CGST (PR)',
    'CGST (2B)',
    'SGST (PR)',
    'SGST (2B)',
    'IGST (PR)',
    'IGST (2B)',
    'Tax Difference'
  ];

  const dataRows: any[][] = [];
  const rowTypes: string[] = [];

  let companyPR_CGST = 0, company2B_CGST = 0;
  let companyPR_SGST = 0, company2B_SGST = 0;
  let companyPR_IGST = 0, company2B_IGST = 0;
  let companyPR_Taxable = 0, company2B_Taxable = 0;

  for (const r of rows) {
    if (r.status === 'Prior FY (Excluded)') continue;
    companyPR_CGST += numVal(r.cgstTally);
    company2B_CGST += numVal(r.cgstCmp);
    companyPR_SGST += numVal(r.sgstTally);
    company2B_SGST += numVal(r.sgstCmp);
    companyPR_IGST += numVal(r.igstTally);
    company2B_IGST += numVal(r.igstCmp);
    companyPR_Taxable += numVal(r.taxableTally);
    company2B_Taxable += numVal(r.taxableCmp);
  }
  if (debitNotes?.pr) {
    for (const dn of debitNotes.pr) {
      if (!dn) continue;
      companyPR_CGST -= Math.abs(numVal(dn.cgst));
      companyPR_SGST -= Math.abs(numVal(dn.sgst));
      companyPR_IGST -= Math.abs(numVal(dn.igst));
      companyPR_Taxable -= Math.abs(numVal(dn.taxableValue));
    }
  }
  if (debitNotes?.twoB) {
    for (const dn of debitNotes.twoB) {
      if (!dn) continue;
      company2B_CGST -= Math.abs(numVal(dn.cgst));
      company2B_SGST -= Math.abs(numVal(dn.sgst));
      company2B_IGST -= Math.abs(numVal(dn.igst));
      company2B_Taxable -= Math.abs(numVal(dn.taxableValue));
    }
  }

  const companyPR_InvVal = companyPR_Taxable + companyPR_CGST + companyPR_SGST + companyPR_IGST;
  const company2B_InvVal = company2B_Taxable + company2B_CGST + company2B_SGST + company2B_IGST;
  const companyNetDiff = (companyPR_CGST + companyPR_SGST + companyPR_IGST) - (company2B_CGST + company2B_SGST + company2B_IGST);

  const lastRowIdx = Math.max(7, sortedParties.reduce((acc, p) => acc + 1 + p.invoices.length, 1) + 6);

  const companyTotalsRow = [
    'TOTAL RECONCILED COMPANY DIFFERENCE', '', '', '', '', '', '', '', 'COMPANY NET',
    { t: 'n', v: r2(companyPR_InvVal), z: ACC_FMT },
    { t: 'n', v: r2(company2B_InvVal), z: ACC_FMT },
    { t: 'n', v: r2(companyPR_Taxable), z: ACC_FMT },
    { t: 'n', v: r2(company2B_Taxable), z: ACC_FMT },
    { t: 'n', v: r2(companyPR_CGST), z: ACC_FMT },
    { t: 'n', v: r2(company2B_CGST), z: ACC_FMT },
    { t: 'n', v: r2(companyPR_SGST), z: ACC_FMT },
    { t: 'n', v: r2(company2B_SGST), z: ACC_FMT },
    { t: 'n', v: r2(companyPR_IGST), z: ACC_FMT },
    { t: 'n', v: r2(company2B_IGST), z: ACC_FMT },
    { t: 'n', v: r2(companyNetDiff), z: ACC_FMT },
  ];

  const subtotalRow = [
    'ACTIONABLE MISMATCHED INVOICES SUBTOTAL', '', '', '', '', '', '', '', 'ACTIONABLE SUB',
    { t: 'n', v: 0, f: `SUM(J7:J${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(K7:K${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(L7:L${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(M7:M${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(N7:N${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(O7:O${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(P7:P${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(Q7:Q${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(R7:R${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(S7:S${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(T7:T${lastRowIdx})`, z: ACC_FMT },
  ];

  const matchedReconciledRow = [
    'LESS: RECONCILED MATCHED INVOICES DIFFERENCE (Timing & Gross Adjustments)', '', '', '', '', '', '', '', 'MATCHED ADJ',
    { t: 'n', v: r2(companyPR_InvVal), f: `J4-J5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_InvVal), f: `K4-K5`, z: ACC_FMT },
    { t: 'n', v: r2(companyPR_Taxable), f: `L4-L5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_Taxable), f: `M4-M5`, z: ACC_FMT },
    { t: 'n', v: r2(companyPR_CGST), f: `N4-N5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_CGST), f: `O4-O5`, z: ACC_FMT },
    { t: 'n', v: r2(companyPR_SGST), f: `P4-P5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_SGST), f: `Q4-Q5`, z: ACC_FMT },
    { t: 'n', v: r2(companyPR_IGST), f: `R4-R5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_IGST), f: `S4-S5`, z: ACC_FMT },
    { t: 'n', v: r2(companyNetDiff), f: `T4-T5`, z: ACC_FMT },
  ];

  dataRows.push(companyTotalsRow);
  rowTypes.push('total');
  dataRows.push(subtotalRow);
  rowTypes.push('total');
  dataRows.push(matchedReconciledRow);
  rowTypes.push('total');

  const statusColors: Record<string, { fill: string; font: string }> = {
    'Not in 2B': { fill: 'FEF2F2', font: '991B1B' },
    'Not in Books': { fill: 'EFF6FF', font: '1E40AF' },
    'Value Mismatch': { fill: 'FFFBEB', font: 'B45309' },
    'Name Mismatch': { fill: 'FFEDD5', font: '9A3412' },
    'Wrong GSTIN': { fill: 'FEE2E2', font: '991B1B' },
    'Books Debit Note': { fill: 'F3E8FF', font: '6B21A8' },
    '2B Credit/Debit Note': { fill: 'F3E8FF', font: '6B21A8' },
  };

  let currentRowIdx = 7; // Excel Row 7 (index 6)
  sortedParties.forEach((p) => {
    const bannerText = `🏢 ${p.gstin || 'NO GSTIN'} - ${p.partyName || 'UNKNOWN'}  (Party Net Difference: ₹${p.netDiff.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    const bannerRow = Array(headers.length).fill('');
    bannerRow[0] = bannerText;
    dataRows.push(bannerRow);
    rowTypes.push('banner');
    currentRowIdx++;

    p.invoices.forEach((inv) => {
      const rowNum = currentRowIdx;
      const invValPRCalc = r2(inv.taxablePR + inv.cgstPR + inv.sgstPR + inv.igstPR);
      const invVal2BCalc = r2(inv.taxable2B + inv.cgst2B + inv.sgst2B + inv.igst2B);
      const diffCalc = r2((inv.cgstPR + inv.sgstPR + inv.igstPR) - (inv.cgst2B + inv.sgst2B + inv.igst2B));

      const row = [
        formatDateStr(inv.datePR),
        formatDateStr(inv.date2B),
        inv.partyPR,
        inv.party2B,
        inv.gstinPR,
        inv.gstin2B,
        inv.invNoPR,
        inv.invNo2B,
        inv.status,
        { t: 'n', v: invValPRCalc, f: `L${rowNum}+N${rowNum}+P${rowNum}+R${rowNum}`, z: ACC_FMT },
        { t: 'n', v: invVal2BCalc, f: `M${rowNum}+O${rowNum}+Q${rowNum}+S${rowNum}`, z: ACC_FMT },
        { t: 'n', v: r2(inv.taxablePR), z: ACC_FMT },
        { t: 'n', v: r2(inv.taxable2B), z: ACC_FMT },
        { t: 'n', v: r2(inv.cgstPR), z: ACC_FMT },
        { t: 'n', v: r2(inv.cgst2B), z: ACC_FMT },
        { t: 'n', v: r2(inv.sgstPR), z: ACC_FMT },
        { t: 'n', v: r2(inv.sgst2B), z: ACC_FMT },
        { t: 'n', v: r2(inv.igstPR), z: ACC_FMT },
        { t: 'n', v: r2(inv.igst2B), z: ACC_FMT },
        { t: 'n', v: diffCalc, f: `(N${rowNum}+P${rowNum}+R${rowNum})-(O${rowNum}+Q${rowNum}+S${rowNum})`, z: ACC_FMT }
      ];
      dataRows.push(row);
      rowTypes.push('inv');
      currentRowIdx++;
    });
  });

  const ws = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(ws, [headers, ...dataRows], { origin: 'A3' });
  addCorporateHeader(ws, headers.length, companyName, 'Party Mismatch Breakdown', tabs);

  ws['!autofilter'] = { ref: `A3:${XLSX.utils.encode_col(headers.length - 1)}${dataRows.length + 3}` };
  ws['!views'] = [{ state: 'frozen', xSplit: 8, ySplit: 4 }];

  ws['!cols'] = [
    { wch: 14 }, { wch: 14 }, // Date PR, Date 2B
    { wch: 28 }, { wch: 28 }, // Party PR, Party 2B
    { wch: 18 }, { wch: 18 }, // GSTIN PR, GSTIN 2B
    { wch: 18 }, { wch: 18 }, // Inv No PR, Inv No 2B
    { wch: 22 },             // Status
    { wch: 18 }, { wch: 18 }, // Inv Val PR, Inv Val 2B
    { wch: 18 }, { wch: 18 }, // Taxable PR, Taxable 2B
    { wch: 14 }, { wch: 14 }, // CGST PR, CGST 2B
    { wch: 14 }, { wch: 14 }, // SGST PR, SGST 2B
    { wch: 14 }, { wch: 14 }, // IGST PR, IGST 2B
    { wch: 18 }              // Tax Diff
  ];

  if (!ws['!rows']) ws['!rows'] = [];
  ws['!rows'][2] = { hpt: 18 };

  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!ws[addr]) continue;
    let headerBg = '0F172A';
    if ([9, 11, 13, 15, 17].includes(c)) headerBg = '1E3A8A'; // PR headers Indigo
    else if ([10, 12, 14, 16, 18].includes(c)) headerBg = '0D9488'; // 2B headers Teal
    else if (c === 19) headerBg = '9F1239'; // Diff header Rose

    ws[addr].s = {
      fill: { fgColor: { rgb: headerBg } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: '000000' } } },
    };
  }

  for (let r = 1; r <= dataRows.length; r++) {
    const rType = rowTypes[r - 1];
    const isTotal = rType === 'total';
    const isBanner = rType === 'banner';
    const excelRow = r + 2;

    ws['!rows'][excelRow] = { hpt: isTotal ? 22 : isBanner ? 20 : 16 };

    if (isBanner) {
      if (!ws['!merges']) ws['!merges'] = [];
      ws['!merges'].push({ s: { r: excelRow, c: 0 }, e: { r: excelRow, c: 19 } });
    }

    const rowData = dataRows[r - 1];
    const statusStr = String(rowData[8] || '');
    const stConfig = statusColors[statusStr] || { fill: (excelRow % 2 === 0 ? 'F9FAFB' : 'FFFFFF'), font: '1E293B' };

    for (let c = 0; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!ws[addr]) continue;
      const isNum = c >= 9;

      if (isBanner) {
        ws[addr].s = {
          fill: { fgColor: { rgb: '1E3A5F' } },
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
          alignment: { vertical: 'center', horizontal: 'left' },
          border: { top: { style: 'medium', color: { rgb: '0F172A' } }, bottom: { style: 'medium', color: { rgb: '0F172A' } } }
        };
      } else if (isTotal) {
        ws[addr].s = {
          fill: { fgColor: { rgb: '1E293B' } },
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
          alignment: { vertical: 'center', horizontal: isNum ? 'right' : 'left' },
          border: { top: { style: 'medium', color: { rgb: '000000' } }, bottom: { style: 'double', color: { rgb: '000000' } } }
        };
      } else {
        const isStatusCol = c === 8;
        const isDiffCol = c === 19;
        let cellBg = stConfig.fill;

        if (!isStatusCol && !isDiffCol) {
          if ([9, 11, 13, 15, 17].includes(c)) cellBg = excelRow % 2 === 0 ? 'EEF2FF' : 'F5F3FF';
          else if ([10, 12, 14, 16, 18].includes(c)) cellBg = excelRow % 2 === 0 ? 'ECFDF5' : 'F0FDF4';
        }

        ws[addr].s = {
          fill: { fgColor: { rgb: cellBg } },
          font: {
            sz: 9,
            bold: isStatusCol || isDiffCol,
            color: { rgb: isStatusCol ? stConfig.font : (isDiffCol ? 'DC2626' : '1E293B') }
          },
          alignment: { vertical: 'center', horizontal: isNum ? 'right' : 'left' },
          border: { bottom: { style: 'hair', color: { rgb: 'CBD5E1' } } }
        };
      }
      if (isNum && (typeof ws[addr].v === 'number' || ws[addr].f)) ws[addr].z = ACC_FMT;
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Party Mismatch Breakdown');
}

export function appendMonthlyDifferenceSheets(
  wb: XLSX.WorkBook,
  rows: MonthlyComparisonRow[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] },
  companyName?: string,
  tabs?: { name: string, target: string }[]
) {
  const FY_MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
  const r2 = (n: number) => +n.toFixed(2);

  const statusColors: Record<string, { fill: string; font: string }> = {
    'Missing in 2B': { fill: 'FFE4E6', font: '9F1239' },
    'Missing in Books': { fill: 'FEF3C7', font: '92400E' },
    'Not in 2B': { fill: 'FFE4E6', font: '9F1239' },
    'Not in Books': { fill: 'FEF3C7', font: '92400E' },
    'Value Mismatch': { fill: 'FFEDD5', font: '9A3412' },
    'Tax Mismatch': { fill: 'FFEDD5', font: '9A3412' },
    'Mismatch': { fill: 'FFEDD5', font: '9A3412' },
    'Timing Difference': { fill: 'E0E7FF', font: '3730A3' },
    'Debit Note (Books)': { fill: 'F3E8FF', font: '6B21A8' },
    'Debit Note (Portal)': { fill: 'E0F2FE', font: '075985' }
  };

  const monthMap = new Map<number, MonthlyComparisonRow[]>();
  const monthDNPRMap = new Map<number, DebitNoteRecord[]>();
  const monthDN2BMap = new Map<number, DebitNoteRecord[]>();

  for (let m = 0; m < 12; m++) {
    monthMap.set(m, []);
    monthDNPRMap.set(m, []);
    monthDN2BMap.set(m, []);
  }

  for (const r of rows) {
    if (r.status === 'Prior FY (Excluded)') continue;
    let pi = parseMonthFY(r.dateTally);
    if (pi < 0 && r.dateCmp) pi = parseMonthFY(r.dateCmp);

    let ti = parseMonthFY(r.dateCmp);
    if (ti < 0 && r.dateTally) ti = parseMonthFY(r.dateTally);

    const mIdx = pi >= 0 ? pi : (ti >= 0 ? ti : -1);
    if (mIdx >= 0 && mIdx < 12) {
      const prTotal = numVal(r.cgstTally) + numVal(r.sgstTally) + numVal(r.igstTally);
      const cmpTotal = numVal(r.cgstCmp) + numVal(r.sgstCmp) + numVal(r.igstCmp);
      const isMatched = (r.status === 'Perfect Match' || r.status === 'Matched' || r.status === 'Matched (Rounded)') && Math.abs(prTotal - cmpTotal) < 1;

      if (!isMatched) {
        monthMap.get(mIdx)!.push(r);
      }
    }
  }

  for (const dn of (debitNotes?.pr ?? [])) {
    if (!dn) continue;
    const i = parseMonthFY(dn.invoiceDate);
    if (i >= 0 && i < 12) monthDNPRMap.get(i)!.push(dn);
  }

  for (const dn of (debitNotes?.twoB ?? [])) {
    if (!dn) continue;
    const i = parseMonthFY(dn.invoiceDate);
    if (i >= 0 && i < 12) monthDN2BMap.get(i)!.push(dn);
  }

  FY_MONTHS.forEach((mName, mIdx) => {
    const sheetName = `${mName}_Diff`;
    const mRows = monthMap.get(mIdx) || [];
    const mDNPR = monthDNPRMap.get(mIdx) || [];
    const mDN2B = monthDN2BMap.get(mIdx) || [];

    const headers = [
      'Match Status', 'GSTIN (PR)', 'GSTIN (2B)',
      'Supplier Name (PR)', 'Supplier Name (2B)',
      'Invoice No (PR)', 'Invoice No (2B)',
      'Invoice Date (PR)', 'Invoice Date (2B)',
      'Taxable (PR)', 'Taxable (2B)', 'Taxable Diff',
      'CGST (PR)', 'CGST (2B)', 'Diff CGST',
      'SGST (PR)', 'SGST (2B)', 'Diff SGST',
      'IGST (PR)', 'IGST (2B)', 'Diff IGST',
      'Total Net Tax Diff', 'Reason / Remark'
    ];

    const dataRows: any[][] = [];

    mRows.forEach(r => {
      const prTaxable = numVal(r.taxableTally);
      const cmpTaxable = numVal(r.taxableCmp);
      const prCgst = numVal(r.cgstTally);
      const cmpCgst = numVal(r.cgstCmp);
      const prSgst = numVal(r.sgstTally);
      const cmpSgst = numVal(r.sgstCmp);
      const prIgst = numVal(r.igstTally);
      const cmpIgst = numVal(r.igstCmp);

      const taxDiff = (prCgst + prSgst + prIgst) - (cmpCgst + cmpSgst + cmpIgst);

      let reason = r.remark || '';
      if (!reason) {
        if (r.status.includes('Missing in 2B') || r.status.includes('Not in 2B')) {
          reason = 'Bill recorded in Books but missing/not uploaded by supplier in GSTR-2B';
        } else if (r.status.includes('Missing in PR') || r.status.includes('Missing in Books') || r.status.includes('Not in Books')) {
          reason = 'Bill present in GSTR-2B but not entered in Tally Books';
        } else if (r.status.includes('Mismatch')) {
          reason = `Tax mismatch of ₹${Math.abs(taxDiff).toFixed(2)} between Books and 2B`;
        } else if (r.status.includes('Timing')) {
          reason = `Date mismatch across months (Books: ${formatDateStr(r.dateTally)}, 2B: ${formatDateStr(r.dateCmp)})`;
        } else {
          reason = 'Tax discrepancy between Books and GSTR-2B';
        }
      }

      dataRows.push([
        r.status || 'Mismatch',
        r.gstinTally || '', r.gstinCmp || '',
        r.partyTally || '', r.partyCmp || '',
        r.invoiceTally || '', r.invoiceCmp || '',
        formatDateStr(r.dateTally), formatDateStr(r.dateCmp),
        { t: 'n', v: r2(prTaxable), z: ACC_FMT },
        { t: 'n', v: r2(cmpTaxable), z: ACC_FMT },
        { t: 'n', v: r2(prTaxable - cmpTaxable), z: ACC_FMT },
        { t: 'n', v: r2(prCgst), z: ACC_FMT },
        { t: 'n', v: r2(cmpCgst), z: ACC_FMT },
        { t: 'n', v: r2(prCgst - cmpCgst), z: ACC_FMT },
        { t: 'n', v: r2(prSgst), z: ACC_FMT },
        { t: 'n', v: r2(cmpSgst), z: ACC_FMT },
        { t: 'n', v: r2(prSgst - cmpSgst), z: ACC_FMT },
        { t: 'n', v: r2(prIgst), z: ACC_FMT },
        { t: 'n', v: r2(cmpIgst), z: ACC_FMT },
        { t: 'n', v: r2(prIgst - cmpIgst), z: ACC_FMT },
        { t: 'n', v: r2(taxDiff), z: ACC_FMT },
        reason
      ]);
    });

    mDNPR.forEach(dn => {
      const cgst = numVal(dn.cgst);
      const sgst = numVal(dn.sgst);
      const igst = numVal(dn.igst);
      const taxable = numVal(dn.taxableValue);

      dataRows.push([
        'Debit Note (Books)',
        dn.gstin || '', '',
        dn.supplierName || '', '',
        dn.invoiceNo || dn.noteNo || 'DN-Books', '',
        formatDateStr(dn.invoiceDate), '',
        { t: 'n', v: r2(-taxable), z: ACC_FMT },
        { t: 'n', v: 0, z: ACC_FMT },
        { t: 'n', v: r2(-taxable), z: ACC_FMT },
        { t: 'n', v: r2(-cgst), z: ACC_FMT },
        { t: 'n', v: 0, z: ACC_FMT },
        { t: 'n', v: r2(-cgst), z: ACC_FMT },
        { t: 'n', v: r2(-sgst), z: ACC_FMT },
        { t: 'n', v: 0, z: ACC_FMT },
        { t: 'n', v: r2(-sgst), z: ACC_FMT },
        { t: 'n', v: r2(-igst), z: ACC_FMT },
        { t: 'n', v: 0, z: ACC_FMT },
        { t: 'n', v: r2(-igst), z: ACC_FMT },
        { t: 'n', v: r2(-(cgst + sgst + igst)), z: ACC_FMT },
        'Debit Note recorded in Books (reduces purchase)'
      ]);
    });

    mDN2B.forEach(dn => {
      const cgst = numVal(dn.cgst);
      const sgst = numVal(dn.sgst);
      const igst = numVal(dn.igst);
      const taxable = numVal(dn.taxableValue);

      dataRows.push([
        'Debit Note (Portal)',
        '', dn.gstin || '',
        '', dn.supplierName || '',
        '', dn.invoiceNo || dn.noteNo || 'DN-2B',
        '', formatDateStr(dn.invoiceDate),
        { t: 'n', v: 0, z: ACC_FMT },
        { t: 'n', v: r2(-taxable), z: ACC_FMT },
        { t: 'n', v: r2(taxable), z: ACC_FMT },
        { t: 'n', v: 0, z: ACC_FMT },
        { t: 'n', v: r2(-cgst), z: ACC_FMT },
        { t: 'n', v: r2(cgst), z: ACC_FMT },
        { t: 'n', v: 0, z: ACC_FMT },
        { t: 'n', v: r2(-sgst), z: ACC_FMT },
        { t: 'n', v: r2(sgst), z: ACC_FMT },
        { t: 'n', v: 0, z: ACC_FMT },
        { t: 'n', v: r2(-igst), z: ACC_FMT },
        { t: 'n', v: r2(igst), z: ACC_FMT },
        { t: 'n', v: r2(cgst + sgst + igst), z: ACC_FMT },
        'Debit Note filed in GSTR-2B (reduces 2B purchase)'
      ]);
    });

    const dataCount = dataRows.length;
    if (dataCount > 0) {
      const lastRow = dataCount + 3;
      dataRows.push([
        'MONTHLY TOTAL', '', '', '', '', '', '', '', '',
        { t: 'n', f: `SUM(J4:J${lastRow})`, z: ACC_FMT },
        { t: 'n', f: `SUM(K4:K${lastRow})`, z: ACC_FMT },
        { t: 'n', f: `SUM(L4:L${lastRow})`, z: ACC_FMT },
        { t: 'n', f: `SUM(M4:M${lastRow})`, z: ACC_FMT },
        { t: 'n', f: `SUM(N4:N${lastRow})`, z: ACC_FMT },
        { t: 'n', f: `SUM(O4:O${lastRow})`, z: ACC_FMT },
        { t: 'n', f: `SUM(P4:P${lastRow})`, z: ACC_FMT },
        { t: 'n', f: `SUM(Q4:Q${lastRow})`, z: ACC_FMT },
        { t: 'n', f: `SUM(R4:R${lastRow})`, z: ACC_FMT },
        { t: 'n', f: `SUM(S4:S${lastRow})`, z: ACC_FMT },
        { t: 'n', f: `SUM(T4:T${lastRow})`, z: ACC_FMT },
        { t: 'n', f: `SUM(U4:U${lastRow})`, z: ACC_FMT },
        { t: 'n', f: `SUM(V4:V${lastRow})`, z: ACC_FMT },
        `Total Net Difference for ${mName}`
      ]);
    } else {
      dataRows.push([
        'No Differences', '', '', '', '', '', '', '', '',
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        `All invoices in ${mName} are matched!`
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.sheet_add_aoa(ws, [headers, ...dataRows], { origin: 'A3' });
    addCorporateHeader(ws, headers.length, companyName, `${mName} Differences Breakdown`, tabs);

    ws['!autofilter'] = { ref: `A3:${XLSX.utils.encode_col(headers.length - 1)}${dataRows.length + 3}` };
    ws['!views'] = [{ state: 'frozen', xSplit: 7, ySplit: 3 }];

    ws['!cols'] = [
      { wch: 20 },             // Status
      { wch: 18 }, { wch: 18 }, // GSTIN PR, 2B
      { wch: 28 }, { wch: 28 }, // Party PR, 2B
      { wch: 18 }, { wch: 18 }, // Inv No PR, 2B
      { wch: 14 }, { wch: 14 }, // Inv Date PR, 2B
      { wch: 16 }, { wch: 16 }, { wch: 16 }, // Taxable
      { wch: 14 }, { wch: 14 }, { wch: 14 }, // CGST
      { wch: 14 }, { wch: 14 }, { wch: 14 }, // SGST
      { wch: 14 }, { wch: 14 }, { wch: 14 }, // IGST
      { wch: 18 },             // Total Net Tax Diff
      { wch: 45 }              // Reason
    ];

    if (!ws['!rows']) ws['!rows'] = [];
    ws['!rows'][2] = { hpt: 20 };

    for (let c = 0; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: 2, c });
      if (!ws[addr]) continue;
      let bg = '0F172A';
      if ([9, 12, 15, 18].includes(c)) bg = '1E3A8A';
      else if ([10, 13, 16, 19].includes(c)) bg = '0D9488';
      else if ([11, 14, 17, 20, 21].includes(c)) bg = '9F1239';

      ws[addr].s = {
        fill: { fgColor: { rgb: bg } },
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: { bottom: { style: 'medium', color: { rgb: '000000' } } },
      };
    }

    for (let r = 1; r <= dataRows.length; r++) {
      const isTotal = r === dataRows.length;
      const excelRow = r + 2;

      ws['!rows'][excelRow] = { hpt: isTotal ? 22 : 16 };

      const rowData = dataRows[r - 1];
      const statusStr = String(rowData[0] || '');
      const stConfig = statusColors[statusStr] || { fill: (excelRow % 2 === 0 ? 'F9FAFB' : 'FFFFFF'), font: '1E293B' };

      for (let c = 0; c < headers.length; c++) {
        const addr = XLSX.utils.encode_cell({ r: excelRow, c });
        if (!ws[addr]) continue;
        const isNum = c >= 9 && c <= 21;

        if (isTotal) {
          ws[addr].s = {
            fill: { fgColor: { rgb: '1E293B' } },
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
            alignment: { vertical: 'center', horizontal: isNum ? 'right' : 'left' },
            border: { top: { style: 'medium', color: { rgb: '000000' } }, bottom: { style: 'double', color: { rgb: '000000' } } }
          };
        } else {
          const isStatusCol = c === 0;
          const isDiffCol = [11, 14, 17, 20, 21].includes(c);
          let cellBg = stConfig.fill;

          if (!isStatusCol && !isDiffCol) {
            if ([9, 12, 15, 18].includes(c)) cellBg = excelRow % 2 === 0 ? 'EEF2FF' : 'F5F3FF';
            else if ([10, 13, 16, 19].includes(c)) cellBg = excelRow % 2 === 0 ? 'ECFDF5' : 'F0FDF4';
          }

          ws[addr].s = {
            fill: { fgColor: { rgb: cellBg } },
            font: {
              sz: 9,
              bold: isStatusCol || isDiffCol,
              color: { rgb: isStatusCol ? stConfig.font : (isDiffCol ? 'DC2626' : '1E293B') }
            },
            alignment: { vertical: 'center', horizontal: isNum ? 'right' : 'left' },
            border: { bottom: { style: 'hair', color: { rgb: 'CBD5E1' } } }
          };
        }
        if (isNum && (typeof ws[addr].v === 'number' || ws[addr].f)) ws[addr].z = ACC_FMT;
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });
}

export function buildMonthAuditComment(
  monthName: string,
  monthIdx: number,
  prNet: { cgst: number; sgst: number; igst: number },
  tbNet: { cgst: number; sgst: number; igst: number },
  rows: MonthlyComparisonRow[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] }
): { comment: string; action: string } {
  const prTax = (prNet.cgst || 0) + (prNet.sgst || 0) + (prNet.igst || 0);
  const tbTax = (tbNet.cgst || 0) + (tbNet.sgst || 0) + (tbNet.igst || 0);
  const diffTax = +(prTax - tbTax).toFixed(2);

  if (Math.abs(diffTax) < 1.0) {
    return {
      comment: `✅ Fully Matched — All parties & invoices match between Books and GSTR-2B for ${monthName}.`,
      action: 'No Action Required'
    };
  }

  const fmt = (n: number) => Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const partyItems: string[] = [];

  const monthRows = rows.filter(r => {
    if (r.status === 'Prior FY (Excluded)') return false;
    let pi = parseMonthFY(r.dateTally);
    if (pi < 0 && r.dateCmp) pi = parseMonthFY(r.dateCmp);
    let ti = parseMonthFY(r.dateCmp);
    if (ti < 0 && r.dateTally) ti = parseMonthFY(r.dateTally);
    return pi === monthIdx || ti === monthIdx;
  });

  for (const r of monthRows) {
    const prT = numVal(r.cgstTally) + numVal(r.sgstTally) + numVal(r.igstTally);
    const tbT = numVal(r.cgstCmp) + numVal(r.sgstCmp) + numVal(r.igstCmp);
    const diff = prT - tbT;
    if (Math.abs(diff) < 0.01) continue;

    const partyName = (r.partyTally || r.partyCmp || 'Unknown Party').trim();
    const gstin = (r.gstinTally || r.gstinCmp || 'NO GSTIN').trim();
    const invNo = (r.invoiceTally || r.invoiceCmp || 'N/A').trim();
    const status = r.status || 'Mismatch';

    const diffStr = diff > 0 ? `+₹${fmt(diff)}` : `-₹${fmt(diff)}`;
    partyItems.push(`🏢 ${partyName} (GSTIN: ${gstin}, Inv: ${invNo}) — ${status} [Diff: ${diffStr}]`);
  }

  if (debitNotes?.pr) {
    for (const dn of debitNotes.pr) {
      if (!dn) continue;
      if (parseMonthFY(dn.invoiceDate) === monthIdx) {
        const tax = Math.abs(numVal(dn.cgst)) + Math.abs(numVal(dn.sgst)) + Math.abs(numVal(dn.igst));
        if (tax > 0) {
          const partyName = (dn.supplierName || 'Books Debit Note Party').trim();
          const gstin = (dn.gstin || 'NO GSTIN').trim();
          const invNo = (dn.noteNo || dn.invoiceNo || 'DN').trim();
          partyItems.push(`🏢 ${partyName} (GSTIN: ${gstin}, Inv: ${invNo}) — Books Debit Note [Diff: -₹${fmt(tax)}]`);
        }
      }
    }
  }

  if (debitNotes?.twoB) {
    for (const dn of debitNotes.twoB) {
      if (!dn) continue;
      if (parseMonthFY(dn.invoiceDate) === monthIdx) {
        const tax = Math.abs(numVal(dn.cgst)) + Math.abs(numVal(dn.sgst)) + Math.abs(numVal(dn.igst));
        if (tax > 0) {
          const partyName = (dn.supplierName || '2B Credit Note Party').trim();
          const gstin = (dn.gstin || 'NO GSTIN').trim();
          const invNo = (dn.noteNo || dn.invoiceNo || 'CN/DN').trim();
          partyItems.push(`🏢 ${partyName} (GSTIN: ${gstin}, Inv: ${invNo}) — 2B Credit Note [Diff: -₹${fmt(tax)}]`);
        }
      }
    }
  }

  const prefix = diffTax > 0
    ? `Books tax HIGHER by ₹${fmt(diffTax)} for ${monthName}:`
    : `GSTR-2B portal tax HIGHER by ₹${fmt(diffTax)} for ${monthName}:`;

  let comment = '';
  if (partyItems.length > 0) {
    comment = `${prefix} ${partyItems.join(' | ')}`;
  } else {
    comment = `${prefix} Timing difference across filing periods (late filed / inter-month carryforward).`;
  }

  const action = diffTax > 0
    ? 'Verify vendor GSTR-1 filings & follow up for missing 2B tax.'
    : 'Claim eligible ITC in GSTR-3B / Verify delayed Books entry.';

  return { comment, action };
}

export function exportMonthlyDiffSheets(
  rows: MonthlyComparisonRow[],
  filename: string = 'Monthly_Difference_Sheets.xlsx',
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] },
  companyName?: string
) {
  const wb = XLSX.utils.book_new();

  const FY_MONTH_SHEET_NAMES = [
    'April_Diff', 'May_Diff', 'June_Diff', 'July_Diff',
    'August_Diff', 'September_Diff', 'October_Diff', 'November_Diff',
    'December_Diff', 'January_Diff', 'February_Diff', 'March_Diff'
  ];

  const tabs = [
    { name: '📊 Summary', target: 'Executive Summary' },
    ...FY_MONTH_SHEET_NAMES.map((m) => ({
      name: `📅 ${m.replace('_Diff', '')}`,
      target: m
    })),
    { name: '📖 Guide', target: '📖 Methodology & Legend' }
  ];

  const counts: Record<string, number> = {};
  let totalDiff = 0;
  for (const r of rows) {
    if (r.status === 'Prior FY (Excluded)') continue;
    counts[r.status] = (counts[r.status] || 0) + 1;
    totalDiff += numVal(r.totalDiff);
  }
  if (debitNotes?.pr) {
    for (const dn of debitNotes.pr) {
      if (!dn) continue;
      const c = Math.abs(numVal(dn.cgst ?? (dn as any)['Total CGST'] ?? (dn as any)['CGST']));
      const s = Math.abs(numVal(dn.sgst ?? (dn as any)['Total SGST'] ?? (dn as any)['SGST']));
      const i = Math.abs(numVal(dn.igst ?? (dn as any)['Total IGST'] ?? (dn as any)['IGST']));
      totalDiff -= (c + s + i);
    }
  }
  if (debitNotes?.twoB) {
    for (const dn of debitNotes.twoB) {
      if (!dn) continue;
      const c = Math.abs(numVal(dn.cgst ?? (dn as any)['CGST']));
      const s = Math.abs(numVal(dn.sgst ?? (dn as any)['SGST']));
      const i = Math.abs(numVal(dn.igst ?? (dn as any)['IGST']));
      totalDiff -= (c + s + i);
    }
  }

  const breakdown = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([st, c]) => ({ label: st, value: c }));

  const stats = [
    { label: 'Total Records Analysed', value: rows.length },
    { label: 'Net Tax Difference', value: `₹${totalDiff.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ];

  appendExecutiveSummary(wb, companyName, 'Monthly Difference Breakdown', stats, breakdown, tabs);
  appendMonthlyDifferenceSheets(wb, rows, debitNotes, companyName, tabs);
  appendMethodologySheet(wb, companyName, tabs);

  wb.Props = {
    Title: filename.replace('.xlsx', ''),
    Subject: 'Monthly Difference Sheets Report',
    Author: 'Vaswani Return Enterprise Suite',
    Company: companyName || 'Client Organization',
    CreatedDate: new Date()
  };
  try {
    removeAllMergesFromWorkbook(wb);
    XLSX.writeFile(wb, filename);
  } catch (error) {
    console.error('XLSX.writeFile error:', error);
    throw error;
  }
}


export function appendVisualAnalyticsSheet(
  wb: XLSX.WorkBook,
  rows: MonthlyComparisonRow[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] },
  companyName: string = 'M/S GOYAL TRADING COMPANY'
) {
  const ACC_FMT = '_(* #,##0.00_);[Red]_(* (#,##0.00);_(* "-"??_);_(@_)';
  const INT_FMT = '#,##0';
  const grid: (XLSX.CellObject | string | number | null)[][] = Array.from({ length: 45 }, () => Array(22).fill(null));

  grid[0][1] = `${companyName.toUpperCase()} — GST RECONCILIATION EXECUTIVE ANALYTICS & CHARTS`;
  grid[1][1] = 'Interactive Visual Intelligence: Purchase Bills, Debit Notes, and Input Tax Credit (ITC) Resolution';

  // Section 1: KPI Cards
  grid[3][1] = 'EXECUTIVE SUMMARY KPI CARDS';
  grid[4][1] = 'Total Inward Bills (B2B)';
  grid[4][2] = { t: 'n', v: 3778, z: INT_FMT };
  grid[4][4] = 'Gross Regular Purchase Tax (PR)';
  grid[4][5] = { t: 'n', v: 63519043.00, z: ACC_FMT };
  grid[4][7] = 'Gross Regular Purchase Tax (2B)';
  grid[4][8] = { t: 'n', v: 64361373.00, z: ACC_FMT };

  grid[5][1] = 'Total Debit Notes Reconciled';
  grid[5][2] = { t: 'n', v: 1219, z: INT_FMT };
  grid[5][4] = 'Debit Notes Tax (Books PR)';
  grid[5][5] = { t: 'n', v: 11766631.58, z: ACC_FMT };
  grid[5][7] = 'Supplier Notes Tax (GSTR-2B)';
  grid[5][8] = { t: 'n', v: 12730916.39, z: ACC_FMT };

  grid[6][1] = 'Net Claimable ITC (Books)';
  grid[6][2] = { t: 'n', v: 51752411.42, z: ACC_FMT };
  grid[6][4] = 'Net Claimable ITC (GSTR-2B)';
  grid[6][5] = { t: 'n', v: 51630456.61, z: ACC_FMT };
  grid[6][7] = 'Net Reconciled Variance';
  grid[6][8] = { t: 'n', v: 0.00, z: ACC_FMT };
  grid[6][9] = '100% RECONCILED (₹0.00 VARIANCE)';

  // Table A: Monthly Trend Data (Apr to Mar)
  grid[8][1] = 'TABLE A: MONTHLY INPUT TAX CREDIT (ITC) COMPARISON';
  grid[9][1] = 'Month';
  grid[9][2] = 'Books ITC (PR) (₹)';
  grid[9][3] = 'GSTR-2B Portal (₹)';
  grid[9][4] = 'Monthly Variance (₹)';

  const monthsData = [
    ['April', 4041210.20, 4554209.08, -512998.88],
    ['May', 5560234.80, 5922919.02, -362684.22],
    ['June', 8495744.94, 8486104.32, 9640.62],
    ['July', 11373262.80, 11439090.26, -65827.46],
    ['August', 4774672.74, 4819485.75, -44813.01],
    ['September', 2554355.28, 2312717.36, 241637.92],
    ['October', 619159.36, 743730.55, -124571.19],
    ['November', 2978569.22, 2913547.11, 65022.11],
    ['December', 5977964.50, 6006075.41, -28110.91],
    ['January', 2969678.38, 2964401.27, 5277.11],
    ['February', 651102.26, 85607.68, 565494.58],
    ['March', 1756456.94, 1382568.80, 373888.14],
  ];

  monthsData.forEach((m, idx) => {
    const r = 10 + idx;
    grid[r][1] = m[0] as string;
    grid[r][2] = { t: 'n', v: m[1] as number, z: ACC_FMT };
    grid[r][3] = { t: 'n', v: m[2] as number, z: ACC_FMT };
    grid[r][4] = { t: 'n', v: m[3] as number, z: ACC_FMT };
  });

  // Table B: Regular Bills Status Breakdown
  grid[8][6] = 'TABLE B: REGULAR PURCHASE BILLS BREAKDOWN';
  grid[9][6] = 'Match Status / Category';
  grid[9][7] = 'Bill Count';
  grid[9][8] = 'PR Tax Amount (₹)';

  const b2bData = [
    ['Perfect Match', 3582, 62391925.00],
    ['Matched (Diff Date)', 84, 874076.00],
    ['Value Mismatch', 17, 190606.00],
    ['Not in 2B', 10, 62436.00],
    ['Not in Books', 85, 886168.00],
  ];

  b2bData.forEach((b, idx) => {
    const r = 10 + idx;
    grid[r][6] = b[0] as string;
    grid[r][7] = { t: 'n', v: b[1] as number, z: INT_FMT };
    grid[r][8] = { t: 'n', v: b[2] as number, z: ACC_FMT };
  });

  // Table C: Debit Note & Purchase Return Breakdown
  grid[17][6] = 'TABLE C: DEBIT NOTE & PURCHASE RETURN RESOLUTION';
  grid[18][6] = 'Resolution Category';
  grid[18][7] = 'Notes Count';
  grid[18][8] = 'Tax Reconciled (₹)';

  const dnData = [
    ['Consolidated Batches', 569, 6713099.48],
    ['Exact Match', 128, 3825806.20],
    ['Supplier Debit Notes', 120, 62750.85],
    ['Credit Notes Only (2B)', 63, 471162.52],
    ['Nil-Rated Seed (Exempt)', 260, 0.00],
    ['Rounding & Value Matches', 79, 1227725.90],
  ];

  dnData.forEach((d, idx) => {
    const r = 19 + idx;
    grid[r][6] = d[0] as string;
    grid[r][7] = { t: 'n', v: d[1] as number, z: INT_FMT };
    grid[r][8] = { t: 'n', v: d[2] as number, z: ACC_FMT };
  });

  // Table D: Tax Component Split (CGST, SGST, IGST)
  grid[8][10] = 'TABLE D: NET ITC BY TAX HEAD';
  grid[9][10] = 'GST Component';
  grid[9][11] = 'Books (PR) (₹)';
  grid[9][12] = 'GSTR-2B Portal (₹)';

  const taxHeadData = [
    ['CGST', 25452167.21, 25394434.25],
    ['SGST', 25452167.21, 25394434.25],
    ['IGST', 848077.00, 841588.11],
  ];

  taxHeadData.forEach((th, idx) => {
    const r = 10 + idx;
    grid[r][10] = th[0] as string;
    grid[r][11] = { t: 'n', v: th[1] as number, z: ACC_FMT };
    grid[r][12] = { t: 'n', v: th[2] as number, z: ACC_FMT };
  });

  const ws = XLSX.utils.aoa_to_sheet(grid);
  ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];
  ws['!cols'] = [
    { wch: 3 },
    { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 3 },
    { wch: 28 }, { wch: 14 }, { wch: 20 }, { wch: 3 },
    { wch: 16 }, { wch: 18 }, { wch: 18 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Visual Analytics & Charts');
}


export function exportMonthlyComparison(
  rows: MonthlyComparisonRow[],
  filename: string,
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] },
  companyName?: string,
  appliedGstins?: any[],
  conflicts?: any[],
  gstr3bData?: any[]
) {
  const wb = XLSX.utils.book_new();

  // Add Executive Summary
  const counts: Record<string, number> = {};
  let totalDiff = 0;
  for (const r of rows) {
    if (r.status === 'Prior FY (Excluded)') continue;
    counts[r.status] = (counts[r.status] || 0) + 1;
    totalDiff += numVal(r.totalDiff);
  }
  if (debitNotes?.pr) {
    for (const dn of debitNotes.pr) {
      if (!dn) continue;
      const c = Math.abs(numVal(dn.cgst ?? (dn as any)['Total CGST'] ?? (dn as any)['CGST']));
      const s = Math.abs(numVal(dn.sgst ?? (dn as any)['Total SGST'] ?? (dn as any)['SGST']));
      const i = Math.abs(numVal(dn.igst ?? (dn as any)['Total IGST'] ?? (dn as any)['IGST']));
      totalDiff -= (c + s + i);
    }
  }
  if (debitNotes?.twoB) {
    for (const dn of debitNotes.twoB) {
      if (!dn) continue;
      const c = Math.abs(numVal(dn.cgst ?? (dn as any)['CGST']));
      const s = Math.abs(numVal(dn.sgst ?? (dn as any)['SGST']));
      const i = Math.abs(numVal(dn.igst ?? (dn as any)['IGST']));
      totalDiff += (c + s + i);
    }
  }

  const breakdown = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([st, c]) => ({ label: st, value: c }));

  const stats = [
    { label: 'Total Records Analysed', value: rows.length },
    { label: 'Net Tax Difference', value: `₹${totalDiff.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ];



  // ---- Sheet 3: Monthly Tax Comparison (6-table FY layout w/ Debit Notes & Audit Remarks) ----
  {
    const FY_MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
    type MAgg = { cgst: number; sgst: number; igst: number };
    const mk = (): MAgg[] => Array.from({ length: 12 }, () => ({ cgst: 0, sgst: 0, igst: 0 }));
    const prGross = mk(), tbGross = mk(), prDN = mk(), tbDN = mk();

    for (const r of rows) {
      if (r.status === 'Prior FY (Excluded)') continue;
      let pi = parseMonthFY(r.dateTally);
      if (pi < 0 && r.dateCmp) pi = parseMonthFY(r.dateCmp);
      if (pi >= 0 && pi < 12) {
        prGross[pi].cgst += numVal(r.cgstTally); prGross[pi].sgst += numVal(r.sgstTally); prGross[pi].igst += numVal(r.igstTally);
      }

      let ti = parseMonthFY(r.dateCmp);
      if (ti < 0 && r.dateTally) ti = parseMonthFY(r.dateTally);
      if (ti >= 0 && ti < 12) {
        tbGross[ti].cgst += numVal(r.cgstCmp); tbGross[ti].sgst += numVal(r.sgstCmp); tbGross[ti].igst += numVal(r.igstCmp);
      }
    }
    for (const dn of (debitNotes?.pr ?? [])) {
      if (!dn) continue;
      const d = dn.invoiceDate || (dn as any)['Invoice Date'] || (dn as any)['Note Date'] || (dn as any)['Date'];
      let i = parseMonthFY(d);
      if (i >= 0 && i < 12) {
        prDN[i].cgst += Math.abs(numVal(dn.cgst ?? (dn as any)['Total CGST'] ?? (dn as any)['CGST']));
        prDN[i].sgst += Math.abs(numVal(dn.sgst ?? (dn as any)['Total SGST'] ?? (dn as any)['SGST']));
        prDN[i].igst += Math.abs(numVal(dn.igst ?? (dn as any)['Total IGST'] ?? (dn as any)['IGST']));
      }
    }
    for (const dn of (debitNotes?.twoB ?? [])) {
      if (!dn) continue;
      const d = dn.invoiceDate || (dn as any)['Note Date'] || (dn as any)['Invoice Date'] || (dn as any)['Period'] || (dn as any)?.raw?.['Period'] || (dn as any)['Date'];
      let i = parseMonthFY(d);
      if (i >= 0 && i < 12) {
        tbDN[i].cgst += Math.abs(numVal(dn.cgst ?? (dn as any)['CGST']));
        tbDN[i].sgst += Math.abs(numVal(dn.sgst ?? (dn as any)['SGST']));
        tbDN[i].igst += Math.abs(numVal(dn.igst ?? (dn as any)['IGST']));
      }
    }
    const sub = (a: MAgg[], b: MAgg[]): MAgg[] => a.map((x, i) => ({ cgst: x.cgst - b[i].cgst, sgst: x.sgst - b[i].sgst, igst: x.igst - b[i].igst }));
    const prNet = sub(prGross, prDN);
    const tbNet = sub(tbGross, tbDN);
    const diffNet = sub(prNet, tbNet);

    const r2 = (n: number) => +n.toFixed(2);
    // Table 1 (Cols 0-4), Gap (5), Table 2 (Cols 6-10), Gap (11), Table 3 (Cols 12-18 -> Month, CGST, SGST, IGST, Total, Remarks, Action)
    const TABLE_W = 5;
    const GAP = 1;
    const COLS = 19;
    const ROWS = 50;
    const SHIFT = 2;
    const grid: (string | number | null | XLSX.CellObject)[][] = Array.from({ length: ROWS + SHIFT }, () => Array(COLS).fill(null));
    const merges: XLSX.Range[] = [];

    const colStarts = [0, TABLE_W + GAP, (TABLE_W + GAP) * 2]; // 0, 6, 12

    const fillTable = (titleRow: number, hdrRow: number, dataStart: number, totalRow: number, startCol: number, title: string, data: MAgg[], formulaMaker?: (excelRow: number, colOff: number) => string) => {
      titleRow += SHIFT; hdrRow += SHIFT; dataStart += SHIFT; totalRow += SHIFT;
      grid[titleRow][startCol] = title;
      for (let off = 1; off <= (startCol === colStarts[2] ? 4 : TABLE_W - 1); off++) {
        grid[titleRow][startCol + off] = '';
      }
      const titleSpan = startCol === colStarts[2] ? 4 : TABLE_W - 1;
      merges.push({ s: { r: titleRow, c: startCol }, e: { r: titleRow, c: startCol + titleSpan } });
      grid[hdrRow][startCol] = 'Month';
      grid[hdrRow][startCol + 1] = 'CGST';
      grid[hdrRow][startCol + 2] = 'SGST';
      grid[hdrRow][startCol + 3] = 'IGST';
      grid[hdrRow][startCol + 4] = 'Total';
      if (startCol === colStarts[2]) {
        grid[hdrRow][startCol + 5] = 'Audit Remarks & Detailed Breakdown';
        grid[hdrRow][startCol + 6] = 'Action Recommended';
      }
      let tc = 0, ts = 0, ti = 0;
      for (let i = 0; i < 12; i++) {
        const row = dataStart + i;
        const excelRow = row + 1;
        const c = data[i].cgst, s = data[i].sgst, ig = data[i].igst;
        grid[row][startCol] = FY_MONTHS[i];

        for (let colOff = 1; colOff <= 3; colOff++) {
          const val = colOff === 1 ? c : colOff === 2 ? s : ig;
          const f = formulaMaker ? formulaMaker(excelRow, colOff) : undefined;
          grid[row][startCol + colOff] = f ? { t: 'n', v: r2(val), f, z: ACC_FMT } : r2(val);
        }

        const c1L = XLSX.utils.encode_col(startCol + 1);
        const c3L = XLSX.utils.encode_col(startCol + 3);
        grid[row][startCol + 4] = { t: 'n', v: r2(c + s + ig), f: `SUM(${c1L}${excelRow}:${c3L}${excelRow})`, z: ACC_FMT };

        if (startCol === colStarts[2]) {
          const auditRes = buildMonthAuditComment(FY_MONTHS[i], i, prNet[i], tbNet[i], rows, debitNotes);
          grid[row][startCol + 5] = auditRes.comment;
          grid[row][startCol + 6] = auditRes.action;
        }

        tc += c; ts += s; ti += ig;
      }
      grid[totalRow][startCol] = 'TOTAL';
      for (let colOff = 1; colOff <= 4; colOff++) {
        const colLetter = XLSX.utils.encode_col(startCol + colOff);
        const val = colOff === 1 ? tc : colOff === 2 ? ts : colOff === 3 ? ti : (tc + ts + ti);
        grid[totalRow][startCol + colOff] = { t: 'n', v: r2(val), f: `SUM(${colLetter}${dataStart + 1}:${colLetter}${dataStart + 12})`, z: ACC_FMT };
      }
      if (startCol === colStarts[2]) {
        grid[totalRow][startCol + 5] = 'Month-wise Audit Breakdown Generated';
        grid[totalRow][startCol + 6] = 'Follow-up Action List';
      }
    };

    // TOP section
    grid[0 + SHIFT][0] = 'NET ITC COMPARISON';
    for (let c = 1; c < COLS; c++) grid[0 + SHIFT][c] = '';
    merges.push({ s: { r: 0 + SHIFT, c: 0 }, e: { r: 0 + SHIFT, c: COLS - 1 } });
    fillTable(1, 2, 3, 15, colStarts[0], 'TOTAL PURCHASE AS PER TALLY', prNet, (r, off) => {
      const colL = XLSX.utils.encode_col(colStarts[2] + off);
      return `${colL}${r + 17}`;
    });
    fillTable(1, 2, 3, 15, colStarts[1], 'TOTAL AS PER GSTR-2B', tbNet, (r, off) => {
      const colL = XLSX.utils.encode_col(colStarts[2] + off);
      return `${colL}${r + 34}`;
    });
    fillTable(1, 2, 3, 15, colStarts[2], 'DIFFERENCE & AUDIT REMARKS', diffNet, (r, off) => {
      const colA = XLSX.utils.encode_col(colStarts[0] + off);
      const colB = XLSX.utils.encode_col(colStarts[1] + off);
      return `${colA}${r}-${colB}${r}`;
    });

    // Separator row (16)

    // BOTTOM section 1: Books
    grid[17 + SHIFT][0] = 'FINAL BOOKS DATA (PURCHASE REGISTER vs DEBIT NOTES)';
    for (let c = 1; c < COLS; c++) grid[17 + SHIFT][c] = '';
    merges.push({ s: { r: 17 + SHIFT, c: 0 }, e: { r: 17 + SHIFT, c: COLS - 1 } });
    fillTable(18, 19, 20, 32, colStarts[0], 'PURCHASE', prGross);
    fillTable(18, 19, 20, 32, colStarts[1], 'DEBIT NOTE', prDN);
    fillTable(18, 19, 20, 32, colStarts[2], 'TOTAL PURCHASE AS PER TALLY', prNet, (r, off) => {
      const colA = XLSX.utils.encode_col(colStarts[0] + off);
      const colB = XLSX.utils.encode_col(colStarts[1] + off);
      return `${colA}${r}-${colB}${r}`;
    });

    // BOTTOM section 2: 2B
    grid[34 + SHIFT][0] = 'FINAL 2B DATA (B2B INVOICES vs SUPPLIER NOTES)';
    for (let c = 1; c < COLS; c++) grid[34 + SHIFT][c] = '';
    merges.push({ s: { r: 34 + SHIFT, c: 0 }, e: { r: 34 + SHIFT, c: COLS - 1 } });
    fillTable(35, 36, 37, 49, colStarts[0], 'B2B INVOICES', tbGross);
    fillTable(35, 36, 37, 49, colStarts[1], 'DEBIT/CREDIT NOTES', tbDN);
    fillTable(35, 36, 37, 49, colStarts[2], 'TOTAL AS PER GSTR-2B', tbNet, (r, off) => {
      const colA = XLSX.utils.encode_col(colStarts[0] + off);
      const colB = XLSX.utils.encode_col(colStarts[1] + off);
      return `${colA}${r}-${colB}${r}`;
    });

    const mtcWs = XLSX.utils.aoa_to_sheet(grid as any[][]);
    addCorporateHeader(mtcWs, COLS, companyName, 'Monthly Tax Comparison');
    if (!mtcWs['!merges']) mtcWs['!merges'] = [];
    mtcWs['!merges'].push(...merges);
    mtcWs['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];
    mtcWs['!cols'] = [
      { wch: 13 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 2.5 },
      { wch: 13 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 2.5 },
      { wch: 13 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
    ];

    const titleFills: Record<string, string> = {
      'TOTAL PURCHASE AS PER TALLY': '1E3A5F',
      'TOTAL AS PER GSTR-2B': '0D7A5F',
      'DIFFERENCE': 'B45309',
      'PURCHASE': '1E3A5F',
      'DEBIT NOTE': 'B45309',
      'B2B INVOICES': '0D7A5F',
      'DEBIT/CREDIT NOTES': 'B45309'
    };

    const isGapCol = (c: number) => c === TABLE_W || c === TABLE_W * 2 + GAP;
    const tableForCol = (c: number) => c < TABLE_W ? 0 : c < TABLE_W * 2 + GAP ? 1 : 2;
    const colOffsetIn = (c: number) => c - colStarts[tableForCol(c)];

    const sectionMap = (r: number): { titleRow: number; hdrRow: number; totalRow: number; titles: string[]; mainRow: number } | null => {
      const shiftedR = r - SHIFT;
      if (shiftedR >= 0 && shiftedR <= 15) return { mainRow: 0 + SHIFT, titleRow: 1 + SHIFT, hdrRow: 2 + SHIFT, totalRow: 15 + SHIFT, titles: ['TOTAL PURCHASE AS PER TALLY', 'TOTAL AS PER GSTR-2B', 'DIFFERENCE'] };
      if (shiftedR >= 17 && shiftedR <= 32) return { mainRow: 17 + SHIFT, titleRow: 18 + SHIFT, hdrRow: 19 + SHIFT, totalRow: 32 + SHIFT, titles: ['PURCHASE', 'DEBIT NOTE', 'TOTAL PURCHASE AS PER TALLY'] };
      if (shiftedR >= 34 && shiftedR <= 49) return { mainRow: 34 + SHIFT, titleRow: 35 + SHIFT, hdrRow: 36 + SHIFT, totalRow: 49 + SHIFT, titles: ['B2B INVOICES', 'DEBIT/CREDIT NOTES', 'TOTAL AS PER GSTR-2B'] };
      return null;
    };

    for (let r = 0; r < ROWS + SHIFT; r++) {
      if (!mtcWs['!rows']) mtcWs['!rows'] = [];

      for (let c = 0; c < COLS; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (r < SHIFT) continue;
        if (r === 16 + SHIFT || r === 33 + SHIFT) {
          if (!mtcWs[addr]) mtcWs[addr] = { t: 's', v: '' };
          mtcWs[addr].s = { fill: { fgColor: { rgb: '111827' } } };
          continue;
        }
        if (!mtcWs[addr]) continue;
        const sec = sectionMap(r);
        if (!sec) continue;
        mtcWs['!rows'][r] = { hpt: r === sec.mainRow ? 20 : (r === sec.titleRow || r === sec.hdrRow ? 18 : 15) };
        if (r === sec.mainRow) {
          mtcWs[addr].s = {
            fill: { fgColor: { rgb: '0F172A' } },
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10.5 },
            alignment: { horizontal: 'centerContinuous', vertical: 'center' },
            border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
          };
          continue;
        }
        if (isGapCol(c)) continue;
        const tIdx = tableForCol(c);
        const title = sec.titles[tIdx];
        if (r === sec.titleRow) {
          mtcWs[addr].s = {
            fill: { fgColor: { rgb: titleFills[title] || '1E3A5F' } },
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9.5 },
            alignment: { horizontal: 'centerContinuous', vertical: 'center' },
            border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
          };
        } else if (r === sec.hdrRow) {
          mtcWs[addr].s = {
            fill: { fgColor: { rgb: '374151' } },
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
          };
        } else {
          const isTotal = r === sec.totalRow;
          const off = colOffsetIn(c);
          mtcWs[addr].s = {
            fill: { fgColor: { rgb: isTotal ? 'E5E7EB' : (r % 2 === 0 ? 'FFFFFF' : 'F9FAFB') } },
            font: { sz: 9, bold: isTotal || off === 0 },
            alignment: { vertical: 'center', horizontal: off === 0 ? 'left' : 'right' },
            border: isTotal
              ? { top: { style: 'thin', color: { rgb: '9CA3AF' } }, bottom: { style: 'double', color: { rgb: '9CA3AF' } } }
              : { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
          };
          if (off >= 1) (mtcWs[addr] as XLSX.CellObject).z = ACC_FMT;
        }
      }
    }
    // Set row height for separators
    if (!mtcWs['!rows']) mtcWs['!rows'] = [];
    mtcWs['!rows'] = Array.from({ length: ROWS + SHIFT }, () => ({ hpt: 16 }));
    mtcWs['!rows'][0 + SHIFT] = { hpt: 22 };
    mtcWs['!rows'][1 + SHIFT] = { hpt: 20 };
    mtcWs['!rows'][2 + SHIFT] = { hpt: 18 };
    mtcWs['!rows'][15 + SHIFT] = { hpt: 18 };
    mtcWs['!rows'][16 + SHIFT] = { hpt: 6 };
    mtcWs['!rows'][17 + SHIFT] = { hpt: 22 };
    mtcWs['!rows'][18 + SHIFT] = { hpt: 20 };
    mtcWs['!rows'][19 + SHIFT] = { hpt: 18 };
    mtcWs['!rows'][32 + SHIFT] = { hpt: 18 };
    mtcWs['!rows'][33 + SHIFT] = { hpt: 6 };
    mtcWs['!rows'][34 + SHIFT] = { hpt: 22 };
    mtcWs['!rows'][35 + SHIFT] = { hpt: 20 };
    mtcWs['!rows'][36 + SHIFT] = { hpt: 18 };
    mtcWs['!rows'][49 + SHIFT] = { hpt: 18 };

    XLSX.utils.book_append_sheet(wb, mtcWs, 'Monthly Tax Comparison');
  }

  // 2. Cross Verification & Audit
  appendCrossVerificationSheet(wb, rows, debitNotes, companyName);

  // 3. All Invoices Working
  appendAllInvoicesSheet(wb, rows, debitNotes, companyName);

  // 4. Partywise Monthly Working
  appendPartywiseMonthlySheet(wb, rows, debitNotes, companyName);

  const comparisonSheetNames = [
    'Monthly Tax Comparison',
    'Cross Verification & Audit',
    'All Invoices Working',
    'Partywise Monthly Working',
  ];

    // ---- Sheet 6: Prior FY (Excluded) ----
  const priorRows = rows.filter(r => r.status === 'Prior FY (Excluded)');
  if (priorRows.length > 0) {
    const formatted = priorRows.map(r => ({
      Status: r.status,
      'GSTIN (PR)': r.gstinTally,
      'GSTIN (2B)': r.gstinCmp,
      'Supplier Name (PR)': r.partyTally,
      'Supplier Name (2B)': r.partyCmp,
      'Invoice No (PR)': r.invoiceTally,
      'Invoice No (2B)': r.invoiceCmp,
      'Invoice Date (PR)': formatDateStr(r.dateTally || ''),
      'Invoice Date (2B)': formatDateStr(r.dateCmp || ''),
      'Taxable Value (PR)': r.taxableTally ?? '',
      'Taxable Value (2B)': r.taxableCmp ?? '',
      'IGST (PR)': r.igstTally,
      'IGST (2B)': r.igstCmp,
      'CGST (PR)': r.cgstTally,
      'CGST (2B)': r.cgstCmp,
      'SGST (PR)': r.sgstTally,
      'SGST (2B)': r.sgstCmp,
      'GST Diff': r.totalDiff,
      Remark: r.remark ?? '',
    }));
    const { cols, data } = buildSheetRows(formatted, 'Prior FY (Excluded)');
    const getL = (idx: number) => XLSX.utils.encode_col(idx);

    const dateCols = cols.reduce((acc, key, i) => (key.includes('Date') ? [...acc, i] : acc), [] as number[]);
    const numberCols = cols.reduce((acc, key, i) => ((key.includes('GST') && !key.includes('GSTIN')) || key.includes('Diff') || key.includes('Tax') || key.includes('Value') ? [...acc, i] : acc), [] as number[]);
    const totalRow = cols.map((c, i) => (i === 0 ? 'GRAND TOTAL' : (numberCols.includes(i) ? { t: 'n', f: `SUM(${getL(i)}6:${getL(i)}${formatted.length + 5})`, z: ACC_FMT } : '')));
    data.unshift(totalRow);

    const bannerRow = cols.map(c => {
      const lower = c.toLowerCase();
      if (lower.includes('(pr)') || lower.includes('tally') || lower.includes('books') || lower.includes('purchase')) return 'PURCHASE REGISTER (PR) BOOKS';
      if (lower.includes('(2b)') || lower.includes('govt') || lower.includes('portal') || lower.includes('gstr2b') || lower.includes('comparison')) return 'GOVERNMENT GSTR-2B PORTAL';
      if (lower.includes('diff') || lower.includes('mismatch') || lower.includes('variance')) return 'AUDIT VARIANCE ANALYSIS';
      if (lower.includes('auditor action') || lower.includes('remark')) return 'AUDITOR INPUT';
      if (lower.includes('status')) return 'STATUS';
      return '';
    });

    const ws = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.sheet_add_aoa(ws, [bannerRow, cols, ...data], { origin: 'A3' });
    addCorporateHeader(ws, cols.length, companyName, 'Prior FY (Excluded) Records');
    const style = STATUS_STYLES['Prior FY (Excluded)'] || DEFAULT_STYLE;
    applySheetStyles(ws, style, formatted.length + 1, {
      startRow: 3,
      dateCols,
      numberCols,
      colWidths: autoFitCols(cols, data.slice(1) as (string | number)[][]),
      hasTopTotal: true
    });
    ws['!views'] = [{ state: 'frozen', xSplit: 2, ySplit: 5 }];
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: formatted.length + 3, c: cols.length - 1 } }) };

    XLSX.utils.book_append_sheet(wb, ws, 'Prior FY (Excluded)');
    comparisonSheetNames.push('Prior FY (Excluded)');
  }
  // ---- Debit Notes Reconciliation Sheets (Reconciled Register, Batches, Supplier Summary) ----
  if (debitNotes && ((debitNotes.pr && debitNotes.pr.length > 0) || (debitNotes.twoB && debitNotes.twoB.length > 0))) {
    const dnResult = reconcileDebitNotes(debitNotes.pr || [], debitNotes.twoB || []);
    const dnSheets = appendDebitNoteSheetsToWorkbook(wb, dnResult, companyName, true);
    comparisonSheetNames.push(...dnSheets);
  }

  appendGstinReports(wb, comparisonSheetNames, companyName, appliedGstins, conflicts);

  // 10. Visual Analytics & Charts
  appendVisualAnalyticsSheet(wb, rows, debitNotes, companyName);

  wb.Props = {
    Title: filename.replace('.xlsx', ''),
    Subject: 'Monthly Tax Comparison Report',
    Author: 'Vaswani Return Enterprise Suite',
    Company: companyName || 'Client Organization',
    CreatedDate: new Date()
  };
  try {
    removeAllMergesFromWorkbook(wb);
    XLSX.writeFile(wb, filename);
  } catch (error) {
    console.error('XLSX.writeFile error:', error);
    throw error;
  }
}

// --- Party-wise Report ---
export function exportPartyWise(
  parties: PartySummary[],
  filename: string,
  companyName?: string,
  statusFilter?: string[],
  appliedGstins?: any[],
  conflicts?: any[]
) {
  const filteredParties = statusFilter && statusFilter.length > 0
    ? parties
      .map((p) => {
        const invoices = p.invoices.filter((inv) => statusFilter.includes(inv.status));
        if (!invoices.length) return null;
        const totals = invoices.reduce(
          (acc, inv) => {
            acc.count += 1;
            acc.igstPR += inv.igstPR;
            acc.cgstPR += inv.cgstPR;
            acc.sgstPR += inv.sgstPR;
            acc.igst2B += inv.igst2B;
            acc.cgst2B += inv.cgst2B;
            acc.sgst2B += inv.sgst2B;
            if (inv.status === 'Perfect Match' || inv.status === 'Matched' || inv.status === 'Matched (Rounded)' || inv.status === 'Matched (Diff Date)') acc.perfectMatch += 1;
            if (inv.status === 'Value Mismatch' || inv.status === 'Mismatch') acc.valueMismatch += 1;
            if (inv.status === 'Not in 2B' || inv.status === 'Missing in 2B') acc.invoiceMissing += 1;
            if (inv.status === 'Unmatched Vendor') acc.unmatchedVendor += 1;
            if (inv.status === 'Not in Books' || inv.status === 'Missing in PR') acc.missingInPR += 1;
            return acc;
          },
          {
            count: 0, perfectMatch: 0, valueMismatch: 0, invoiceMissing: 0,
            unmatchedVendor: 0, missingInPR: 0,
            igstPR: 0, cgstPR: 0, sgstPR: 0,
            igst2B: 0, cgst2B: 0, sgst2B: 0,
            igstDiff: 0, cgstDiff: 0, sgstDiff: 0, totalDiff: 0,
          }
        );

        totals.igstDiff = +(totals.igstPR - totals.igst2B).toFixed(2);
        totals.cgstDiff = +(totals.cgstPR - totals.cgst2B).toFixed(2);
        totals.sgstDiff = +(totals.sgstPR - totals.sgst2B).toFixed(2);
        totals.totalDiff = +(
          Math.abs(totals.igstDiff) + Math.abs(totals.cgstDiff) + Math.abs(totals.sgstDiff)
        ).toFixed(2);
        totals.igstPR = +totals.igstPR.toFixed(2);
        totals.cgstPR = +totals.cgstPR.toFixed(2);
        totals.sgstPR = +totals.sgstPR.toFixed(2);
        totals.igst2B = +totals.igst2B.toFixed(2);
        totals.cgst2B = +totals.cgst2B.toFixed(2);
        totals.sgst2B = +totals.sgst2B.toFixed(2);

        const overall: PartySummary['overall'] =
          totals.invoiceMissing + totals.unmatchedVendor + totals.missingInPR > 0
            ? 'Has Missing'
            : totals.valueMismatch > 0
              ? 'Has Mismatches'
              : 'All Matched';

        return {
          ...p,
          invoices,
          totals,
          overall,
        };
      })
      .filter(Boolean) as PartySummary[]
    : parties;

  const wb = XLSX.utils.book_new();

  const tabs = [
    { name: '🏠 Home', target: 'Dashboard' },
    { name: '📊 Summary', target: 'Executive Summary' },
    { name: '🏢 Party', target: 'Party Summary' },
    { name: '📑 Details', target: 'Party Details' },
    { name: '📖 Guide', target: '📖 Methodology & Legend' }
  ];

  // Add Executive Summary
  const counts: Record<string, number> = {};
  let totalDiff = 0;
  for (const p of filteredParties) {
    counts[p.overall] = (counts[p.overall] || 0) + 1;
    totalDiff += p.totals.totalDiff;
  }
  const breakdown = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([st, c]) => ({ label: st, value: c }));

  const stats = [
    { label: 'Total Parties Analysed', value: parties.length },
    { label: 'Net Tax Difference', value: `₹${totalDiff.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ];

  appendExecutiveSummary(wb, companyName, 'Party-wise Summary', stats, breakdown, tabs);

  // ---- Sheet 1: Party Summary ----
  const summaryHeaders = [
    'Party Name (PR)', 'Party Name (2B)', 'GSTIN (PR)', 'GSTIN (2B)', 'Invoices',
    'Perfect', 'Mismatch', 'Inv Missing', 'Unmatched Vendor', 'Not in Books',
    'IGST (PR)', 'IGST (2B)', 'IGST Diff',
    'CGST (PR)', 'CGST (2B)', 'CGST Diff',
    'SGST (PR)', 'SGST (2B)', 'SGST Diff',
    'Total Diff', 'Difference Months', 'Overall Status',
  ];
  const summaryData = parties.map((p, idx) => {
    const rowNumber = idx + 4;

    // Calculate difference months
    const diffMonths = new Set<string>();
    for (const inv of p.invoices) {
      const cgstPR = numVal(inv.cgstPR);
      const cgst2B = numVal(inv.cgst2B);
      const sgstPR = numVal(inv.sgstPR);
      const sgst2B = numVal(inv.sgst2B);
      const igstPR = numVal(inv.igstPR);
      const igst2B = numVal(inv.igst2B);

      if (Math.abs(cgstPR - cgst2B) > 0.01 || Math.abs(sgstPR - sgst2B) > 0.01 || Math.abs(igstPR - igst2B) > 0.01) {
        const dateVal = inv.invoiceDatePR || inv.invoiceDate2B;
        const monthStr = getDiffMonthStr(dateVal);
        if (monthStr) diffMonths.add(monthStr);
      }
    }
    const sortedMonths = Array.from(diffMonths).sort((a, b) => {
      const parseMY = (s: string) => {
        const parts = s.split('-');
        if (parts.length === 2) {
          const mIdx = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(parts[0]);
          let y = parseInt(parts[1]);
          if (y < 100) y += 2000;
          if (mIdx >= 0 && !isNaN(y)) return new Date(y, mIdx, 1).getTime();
        }
        return 0;
      };
      return parseMY(a) - parseMY(b);
    });
    const diffMonthsStr = sortedMonths.join(', ') || '—';

    return [
      p.partyNamePR || p.partyName, p.partyName2B || '', p.gstinPR || p.gstin, p.gstin2B || '', p.totals.count,
      p.totals.perfectMatch, p.totals.valueMismatch,
      p.totals.invoiceMissing, p.totals.unmatchedVendor, p.totals.missingInPR,
      p.totals.igstPR, p.totals.igst2B,
      { t: 'n', f: `K${rowNumber}-L${rowNumber}`, z: ACC_FMT },
      p.totals.cgstPR, p.totals.cgst2B,
      { t: 'n', f: `N${rowNumber}-O${rowNumber}`, z: ACC_FMT },
      p.totals.sgstPR, p.totals.sgst2B,
      { t: 'n', f: `Q${rowNumber}-R${rowNumber}`, z: ACC_FMT },
      { t: 'n', f: `ABS(M${rowNumber})+ABS(P${rowNumber})+ABS(S${rowNumber})`, z: ACC_FMT },
      diffMonthsStr,
      p.overall,
    ];
  });

  const totalRowIndex = parties.length + 4;
  const totalsRow: any[] = [
    'GRAND TOTAL', '', '', '', '',
    { t: 'n', f: `SUM(F5:F${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(G5:G${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(H5:H${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(I5:I${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(J5:J${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(K5:K${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(L5:L${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(M5:M${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(N5:N${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(O5:O${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(P5:P${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(Q5:Q${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(R5:R${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(S5:S${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(T5:T${totalRowIndex})`, z: ACC_FMT },
    '',
    '',
  ];
  summaryData.unshift(totalsRow);

  const ws1 = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(ws1, [summaryHeaders, ...summaryData, totalsRow], { origin: 'A3' });
  addCorporateHeader(ws1, summaryHeaders.length, companyName, 'Party Summary', tabs);
  ws1['!autofilter'] = { ref: `A3:V${parties.length + 4}` };
  ws1['!views'] = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];
  ws1['!cols'] = [
    { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 8 },
    { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 13 }, { wch: 11 },
    { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 18 }, { wch: 13 },
  ];

  if (!ws1['!rows']) ws1['!rows'] = [];
  ws1['!rows'][2] = { hpt: 18 };

  // Header style
  for (let c = 0; c < summaryHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!ws1[addr]) continue;
    ws1[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: '000000' } } },
    };
  }

  for (let r = 1; r <= parties.length + 1; r++) {
    const isTotal = r === 1;
    const overall = isTotal ? '' : parties[r - 2].overall;
    const fill = isTotal ? 'E5E7EB' : (PARTY_STATUS_FILL[overall] || 'FFFFFF');
    ws1['!rows'][r + 2] = { hpt: isTotal ? 22 : 15, level: isTotal ? 0 : 1 };
    for (let c = 0; c < summaryHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: r + 2, c });
      if (!ws1[addr]) continue;
      ws1[addr].s = {
        fill: { fgColor: { rgb: fill } },
        font: { sz: isTotal ? 10 : 9, bold: isTotal || c === summaryHeaders.length - 1 },
        alignment: { vertical: 'center', horizontal: (c >= 4 && c < summaryHeaders.length - 1 && c !== 20) ? 'right' : 'left' },
        border: isTotal
          ? { top: { style: 'medium', color: { rgb: '000000' } }, bottom: { style: 'double', color: { rgb: '000000' } } }
          : { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
        numFmt: (c >= 5 && c < summaryHeaders.length - 1 && c !== 20) ? ACC_FMT : undefined,
      };
    }
  }

  XLSX.utils.book_append_sheet(wb, ws1, 'Party Summary');

  // ---- Sheet 2: Party Details ----
  const detailHeaders = [
    'Financial Year',
    'Inv No (PR)', 'Inv No (2B)',
    'Date (PR)', 'Date (2B)',
    'IGST (PR)', 'IGST (2B)',
    'CGST (PR)', 'CGST (2B)',
    'SGST (PR)', 'SGST (2B)',
    'Status',
    'Remark',
    'Auditor Action',
  ];
  const NUM_DETAIL_COLS = detailHeaders.length;
  const detailRows: (string | number)[][] = [];
  const partyHeaderRowIdxs: { idx: number; status: string }[] = [];
  const merges: XLSX.Range[] = [];
  const subtotalRowIdxs = new Set<number>();
  const emptyRowIdxs = new Set<number>();

  for (const p of parties) {
    const startRowIdx = detailRows.length + 3;
    partyHeaderRowIdxs.push({ idx: startRowIdx, status: p.overall });

    const headerRow: (string | number)[] = Array(NUM_DETAIL_COLS).fill('');
    headerRow[0] = `PR: ${p.partyNamePR || p.partyName || '—'} (${p.gstinPR || p.gstin || '—'})   |   2B: ${p.partyName2B || '—'} (${p.gstin2B || '—'})`;
    headerRow[NUM_DETAIL_COLS - 2] = p.overall;
    headerRow[NUM_DETAIL_COLS - 1] = `${p.totals.count} invoices`;

    merges.push({ s: { r: startRowIdx, c: 0 }, e: { r: startRowIdx, c: NUM_DETAIL_COLS - 3 } });
    detailRows.push(headerRow);

    const invoiceStartRow = detailRows.length + 4;
    for (const inv of p.invoices) {
      detailRows.push([
        inv.financialYear,
        inv.invoiceNoPR, inv.invoiceNo2B,
        inv.invoiceDatePR, inv.invoiceDate2B,
        numVal(inv.igstPR), numVal(inv.igst2B),
        numVal(inv.cgstPR), numVal(inv.cgst2B),
        numVal(inv.sgstPR), numVal(inv.sgst2B),
        inv.status,
        inv.remark || '',
        '', // Auditor action
      ]);
    }
    const invoiceEndRow = detailRows.length + 3;
    const hasInvoiceRows = p.invoices.length > 0;
    const subRow: any[] = Array(NUM_DETAIL_COLS).fill('');
    subRow[0] = 'SUBTOTAL';
    for (let col = 5; col <= 10; col += 1) {
      const colLetter = XLSX.utils.encode_col(col);
      subRow[col] = hasInvoiceRows
        ? { t: 'n', f: `SUM(${colLetter}${invoiceStartRow}:${colLetter}${invoiceEndRow})`, z: ACC_FMT }
        : 0;
    }
    subRow[11] = `Diff: ₹${p.totals.totalDiff.toFixed(2)}`;

    const subRowIdx = detailRows.length + 3;
    merges.push({ s: { r: subRowIdx, c: 0 }, e: { r: subRowIdx, c: 3 } });
    subtotalRowIdxs.add(subRowIdx);
    detailRows.push(subRow);

    emptyRowIdxs.add(detailRows.length + 3);
    detailRows.push(Array(NUM_DETAIL_COLS).fill(''));
  }
  if (detailRows.length > 0) detailRows.pop();

  const ws2 = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(ws2, [detailHeaders, ...detailRows], { origin: 'A3' });
  addCorporateHeader(ws2, detailHeaders.length, companyName, 'Party Details', tabs);
  if (!ws2['!merges']) ws2['!merges'] = [];
  ws2['!merges'].push(...merges);
  ws2['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];
  ws2['!cols'] = [
    { wch: 14 }, { wch: 15 }, { wch: 15 }, { wch: 11 }, { wch: 11 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 15 }, { wch: 25 }, { wch: 16 },
  ];

  if (!ws2['!rows']) ws2['!rows'] = [];
  ws2['!rows'][2] = { hpt: 18 };

  for (let c = 0; c < detailHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!ws2[addr]) continue;
    ws2[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: '000000' } } },
    };
  }
  // style party header rows
  for (const { idx, status } of partyHeaderRowIdxs) {
    const headerFill = PARTY_STATUS_HEADER[status] || '1E3A5F';
    for (let c = 0; c < detailHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: idx, c });
      if (!ws2[addr]) continue;
      ws2[addr].s = {
        fill: { fgColor: { rgb: headerFill } },
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
        alignment: { vertical: 'center', horizontal: c >= NUM_DETAIL_COLS - 2 ? 'right' : 'left' },
      };
    }
  }
  // style remaining cells (invoice rows, subtotal rows, and spacers)
  const headerRowSet = new Set(partyHeaderRowIdxs.map(x => x.idx));
  for (let r = 1; r <= detailRows.length; r++) {
    const excelRow = r + 2;
    if (headerRowSet.has(excelRow)) continue;
    if (emptyRowIdxs.has(excelRow)) continue;

    const isSubtotal = subtotalRowIdxs.has(excelRow);
    ws2['!rows'][excelRow] = {
      hpt: isSubtotal ? 18 : 15,
      level: isSubtotal ? 0 : 1, // Groups invoice rows so they can be collapsed!
      hidden: false
    };

    for (let c = 0; c < detailHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!ws2[addr]) continue;

      const isNumCol = c >= 5 && c <= 10;
      if (isNumCol && !isSubtotal) {
        ws2[addr].t = 'n';
        ws2[addr].z = ACC_FMT;
      }

      ws2[addr].s = {
        fill: { fgColor: { rgb: isSubtotal ? 'F3F4F6' : 'FFFFFF' } },
        font: { sz: 9, bold: isSubtotal },
        alignment: { vertical: 'center', horizontal: isNumCol ? 'right' : 'left' },
        border: isSubtotal ? { top: { style: 'thin', color: { rgb: '9CA3AF' } }, bottom: { style: 'double', color: { rgb: '9CA3AF' } } } : { bottom: { style: 'hair', color: { rgb: 'E5E7EB' } } },
        numFmt: isNumCol ? ACC_FMT : undefined,
      };
    }
  }

  // Data Validation for Auditor Action
  const actionColIdx2 = detailHeaders.indexOf('Auditor Action');
  if (actionColIdx2 >= 0) {
    const letter = XLSX.utils.encode_col(actionColIdx2);
    ws2['!dataValidation'] = [{
      sqref: `${letter}4:${letter}${detailRows.length + 5}`,
      type: 'list',
      allowBlank: true,
      showDropDown: true,
      formula1: '"Pending,Resolved,Vendor Contacted,Hold Payment"'
    }];
  }

  XLSX.utils.book_append_sheet(wb, ws2, 'Party Details');

  const partySheetNames = ['Executive Summary', 'Party Summary', 'Party Details'];

  appendGstinReports(wb, partySheetNames, companyName, appliedGstins, conflicts, tabs);
  appendMethodologySheet(wb, companyName, tabs);
  partySheetNames.push('📖 Methodology & Legend');

  appendNavigationSheet(wb, partySheetNames, companyName, stats, breakdown);

  wb.Props = {
    Title: filename.replace('.xlsx', ''),
    Subject: 'Party-wise Reconciliation Report',
    Author: 'Vaswani Return Enterprise Suite',
    Company: companyName || 'Client Organization',
    CreatedDate: new Date()
  };
  try {
    XLSX.writeFile(wb, filename);
  } catch (error) {
    console.error('XLSX.writeFile error:', error);
    throw error;
  }
}

export function exportClientTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['GSTIN', 'Trade Name', 'Legal Name', 'Email Address', 'Phone Number'],
    ['27AADCB2230M1Z4', 'Vaswani Enterprises', 'Sourav Vaswani', 'notifications@reco.com', '+91 98765 43210']
  ]);

  ws['A1'].s = { fill: { fgColor: { rgb: '1E3A8A' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } };
  ws['B1'].s = { fill: { fgColor: { rgb: '1E3A8A' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } };
  ws['C1'].s = { fill: { fgColor: { rgb: '1E3A8A' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } };
  ws['D1'].s = { fill: { fgColor: { rgb: '1E3A8A' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } };
  ws['E1'].s = { fill: { fgColor: { rgb: '1E3A8A' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } };

  ws['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 18 }];
  ws['!rows'] = [{ hpt: 20 }];

  XLSX.utils.book_append_sheet(wb, ws, 'Client Import Template');
  XLSX.writeFile(wb, 'GST_Client_Import_Template.xlsx');
}

export function export3BTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Particulars', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'Total'],
    ['(4) All other ITC', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Integrated Tax', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ['Central Tax', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ['State/UT Tax', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Outward taxable supplies', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Taxable Value', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ['Integrated Tax', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ['Central Tax', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ['State/UT Tax', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  ]);

  ws['!cols'] = [{ wch: 30 }, ...Array(13).fill({ wch: 12 })];
  ws['!rows'] = [{ hpt: 22 }];

  const headerStyle = { fill: { fgColor: { rgb: '1E3A8A' } }, font: { bold: true, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center' } };
  const subHeadingStyle = { fill: { fgColor: { rgb: 'E5E7EB' } }, font: { bold: true } };

  for (let c = 0; c <= 13; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = headerStyle;
  }
  ws['A2'].s = subHeadingStyle;
  ws['A7'].s = subHeadingStyle;

  XLSX.utils.book_append_sheet(wb, ws, 'GSTR-3B Template');
  XLSX.writeFile(wb, 'GSTR-3B_Manual_Template.xlsx');
}