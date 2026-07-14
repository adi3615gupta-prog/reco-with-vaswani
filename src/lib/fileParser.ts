import * as XLSX from 'xlsx-js-style';
import { normalizePartyName, type InvoiceRecord } from './reconciliation';
import type { PartySummary } from './partyWise';

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
  supplierName: ['supplier name', 'party name', 'vendor name', 'name of supplier', 'supplier', 'trade name', 'legal name', 'receiver name', 'customer name'],
  gstin: ['gstin', 'gstin of supplier', 'gstin/uin', 'supplier gstin', 'gstin no', 'gst no'],
  invoiceNo: ['invoice no', 'invoice number', 'inv no', 'bill no', 'document number', 'invoice no.', 'note no', 'note number'],
  invoiceDate: ['invoice date', 'inv date', 'bill date', 'document date', 'invoice dt', 'note date'],
  igst: ['igst', 'integrated tax', 'igst amount', 'igst amt'],
  cgst: ['cgst', 'central tax', 'cgst amount', 'cgst amt'],
  sgst: ['sgst', 'state tax', 'sgst amount', 'sgst amt', 'utgst'],
  taxableValue: ['taxable value', 'taxable amount', 'taxable val', 'assessable value'],
  nilRated: ['nil rated', 'nil rated value', 'exempted', 'exempted value', 'nil rated supplies'],
  nonTaxable: ['non taxable', 'non-taxable', 'non gst', 'non-gst', 'exempt', 'exempt supplies', 'exempted supplies', 'non gst outward', 'non-gst supplies', 'non gst supplies'],
  pos: ['pos', 'place of supply', 'state', 'state code', 'place of supply (pos)'],
  returnPeriod: ['return period', 'month', 'period', 'original period', 'return period (month)'],
  filingStatus: ['gstr-1 status', 'gstr1 status', 'filing status', 'return filing status'],
  filingDate: ['filing date', 'gstr-1 filing date', 'return filing date', 'date of filing'],
};

export function detectColumnMapping(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {};
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  for (const [field, aliases] of Object.entries(KNOWN_HEADERS) as [keyof ColumnMapping, string[]][]) {
    for (const alias of aliases) {
      const idx = lowerHeaders.findIndex((h) => h === alias || h.includes(alias));
      if (idx !== -1) {
        mapping[field] = headers[idx];
        break;
      }
    }
  }
  return mapping;
}

export async function parseFile(
  file: File,
  options?: { findHeader?: boolean; raw?: boolean }
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];

  let range = 0;
  if (options?.findHeader) {
    const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    const headerKeywords = [
      'date',
      'particulars',
      'party name',
      'ledger name',
      'pan',
      'section',
      'voucher type',
      'voucher no',
      'voucher number',
      'deductee pan',
      'deductee name',
      'amount paid',
      'tds deposited',
      'tds deducted'
    ];

    for (let r = 0; r < Math.min(rawData.length, 30); r++) {
      const row = rawData[r];
      if (Array.isArray(row)) {
        const matchCount = row.filter((cell) => {
          const s = String(cell || '').toLowerCase().trim();
          return headerKeywords.some((kw) => s === kw || s.includes(kw));
        }).length;

        if (matchCount >= 2) {
          range = r;
          break;
        }
      }
    }
  }

  const rawOption = options?.raw !== undefined ? options.raw : true;
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
    const rec: InvoiceRecord = {
      supplierName: String(row[mapping.supplierName] || ''),
      gstin: String(row[mapping.gstin] || ''),
      invoiceNo: String(row[mapping.invoiceNo] || ''),
      invoiceDate: String(row[mapping.invoiceDate] || ''),
      igst: safeNum(row[mapping.igst]),
      cgst: safeNum(row[mapping.cgst]),
      sgst: safeNum(row[mapping.sgst]),
      source,
      ...(sourceLabel ? { sourceLabel } : {}),
    };
    if (mapping.taxableValue) rec.taxableValue = safeNum(row[mapping.taxableValue]);
    if (mapping.filingStatus) rec.filingStatus = String(row[mapping.filingStatus] || '');
    if (mapping.filingDate) rec.filingDate = String(row[mapping.filingDate] || '');
    return rec;
  });
}

export async function parseGSTR1File(file: File): Promise<{ records: InvoiceRecord[], hsnData: any[], docData: any[] }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

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
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
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

// Format any date-ish input to "dd-MMM-yyyy" string. Falls back to original string.
function formatDateStr(v: unknown): string {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) return fmtDate(v);
  if (typeof v === 'number') {
    // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return fmtDate(d);
  }
  const s = String(v).trim();
  if (!s) return '';
  // Already in dd-mm-yyyy or dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    const dd = +m[1], mm = +m[2];
    let yy = +m[3]; if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    if (!isNaN(d.getTime())) return fmtDate(d);
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return fmtDate(d);
  return s;
}
function fmtDate(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dd = String(d.getDate()).padStart(2, '0');
  return `${dd}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

// Format date to "MMM-yy" string for difference months tracking (e.g. Apr-26)
function getDiffMonthStr(v: unknown): string {
  if (v == null || v === '') return '';
  let d: Date | null = null;
  if (v instanceof Date && !isNaN(v.getTime())) d = v;
  else if (typeof v === 'number') d = new Date(Math.round((v - 25569) * 86400 * 1000));
  else {
    const s = String(v).trim();
    if (!s) return '';
    const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (m) {
      const dd = +m[1], mm = +m[2];
      let yy = +m[3]; if (yy < 100) yy += 2000;
      const parsed = new Date(yy, mm - 1, dd);
      if (!isNaN(parsed.getTime())) d = parsed;
    } else {
      const parsed = new Date(s);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
  }
  if (d && !isNaN(d.getTime())) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const yy = String(d.getFullYear()).slice(-2);
    return `${months[d.getMonth()]}-${yy}`;
  }
  return '';
}


// Compute Financial Year from a date string/number
export function extractFY(v: unknown): string {
  if (v == null || v === '') return '';
  let d: Date | null = null;
  if (v instanceof Date && !isNaN(v.getTime())) d = v;
  else if (typeof v === 'number') d = new Date(Math.round((v - 25569) * 86400 * 1000));
  else {
    const s = String(v).trim();
    const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (m) {
      let yy = +m[3]; if (yy < 100) yy += 2000;
      d = new Date(yy, +m[2] - 1, +m[1]);
    } else {
      d = new Date(s);
    }
  }
  if (d && !isNaN(d.getTime())) {
    const year = d.getFullYear();
    return d.getMonth() >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
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

// Inserts a high-end corporate header into the first two rows of any worksheet
function addCorporateHeader(ws: XLSX.WorkSheet, colCount: number, companyName: string | undefined, reportName: string, tabs?: { name: string, target: string }[]) {
  const comp = (companyName || 'GST Reconciliation').toUpperCase();
  const title = `${comp} - ${reportName.toUpperCase()}`;
  const subtitle = `Report Generated on: ${new Date().toLocaleString('en-IN')} | Powered by Vaswani Return`;

  XLSX.utils.sheet_add_aoa(ws, [[title], [subtitle]], { origin: 'A1' });

  const isNavSheet = reportName === 'Navigation' || reportName === 'Dashboard';
  const hasTabs = !isNavSheet && tabs && tabs.length > 0;
  const hasHomeBtn = !isNavSheet && !hasTabs;

  // Force tabs to start further out so title doesn't cut off
  const startTabCol = 8;
  const actualMaxCol = Math.max(colCount - 1, startTabCol + (hasTabs ? tabs.length : 1) - 1);
  const titleSpan = startTabCol - 1;

  if (!ws['!merges']) ws['!merges'] = [];
  if (titleSpan > 0) {
    ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: titleSpan } });
    ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: titleSpan } });
  }

  if (hasTabs) {
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
  } else if (hasHomeBtn) {
    const homeAddr = XLSX.utils.encode_cell({ r: 0, c: startTabCol });
    const homeSubAddr = XLSX.utils.encode_cell({ r: 1, c: startTabCol });
    ws[homeAddr] = {
      t: 's', v: '🏠 RETURN TO MENU',
      l: { Target: `#'Dashboard'!A1`, Tooltip: 'Click to go back to Main Dashboard Menu' },
    } as any;
    ws[homeAddr].s = {
      fill: { fgColor: { rgb: '2563EB' } },
      font: { sz: 10, color: { rgb: 'FFFFFF' }, bold: true },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { top: { style: 'medium', color: { rgb: '1E3A8A' } }, bottom: { style: 'medium', color: { rgb: '1E3A8A' } }, left: { style: 'medium', color: { rgb: '1E3A8A' } }, right: { style: 'medium', color: { rgb: '1E3A8A' } } },
    };
    ws[homeSubAddr] = { t: 's', v: '' };
    ws[homeSubAddr].s = { fill: { fgColor: { rgb: '1E293B' } }, border: { bottom: { style: 'thin', color: { rgb: '0F172A' } } } };
  }

  // Fill remaining columns if any
  const filledCols = hasTabs ? tabs.length : (hasHomeBtn ? 1 : 0);
  for (let c = startTabCol + filledCols; c <= actualMaxCol; c++) {
    ws[XLSX.utils.encode_cell({ r: 0, c })] = { t: 's', v: '', s: { fill: { fgColor: { rgb: '0F172A' } } } };
    ws[XLSX.utils.encode_cell({ r: 1, c })] = { t: 's', v: '', s: { fill: { fgColor: { rgb: '1E293B' } }, border: { bottom: { style: 'thin', color: { rgb: '0F172A' } } } } };
  }

  if (!ws['!rows']) ws['!rows'] = [];
  ws['!rows'][0] = { hpt: 26 };
  ws['!rows'][1] = { hpt: 14 };

  const tAddr = XLSX.utils.encode_cell({ r: 0, c: 0 });
  if (ws[tAddr]) {
    ws[tAddr].s = { fill: { fgColor: { rgb: '0F172A' } }, font: { sz: 13, color: { rgb: 'F8FAFC' }, bold: true }, alignment: { horizontal: 'center', vertical: 'center' } };
  }
  const sAddr = XLSX.utils.encode_cell({ r: 1, c: 0 });
  if (ws[sAddr]) {
    ws[sAddr].s = { fill: { fgColor: { rgb: '1E293B' } }, font: { sz: 9, color: { rgb: '94A3B8' }, italic: true }, alignment: { horizontal: 'center', vertical: 'center' } };
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
    'GSTIN (PR)', 'Supplier Name (PR)', 'Invoice No (PR)', 'Invoice Date (PR)', 'Taxable Value (PR)', 'Invoice Value (PR)', 'IGST (PR)', 'CGST (PR)', 'SGST (PR)',
    'GSTIN (2B)', 'Supplier Name (2B)', 'Invoice No (2B)', 'Invoice Date (2B)', 'Taxable Value (2B)', 'Invoice Value (2B)', 'IGST (2B)', 'CGST (2B)', 'SGST (2B)',
    'GST Diff',
    'Remark',
    'Auditor Action',
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
    applySheetStyles(wsConflict, { headerFill: 'DC2626', headerFont: 'FFFFFF', rowFill: 'FFFFFF' }, resolvedConflicts.length, {
      startRow: 2,
      colWidths: [{ wch: 24 }, { wch: 45 }, { wch: 60 }, { wch: 60 }]
    });
    wsConflict['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];
    XLSX.utils.book_append_sheet(wb, wsConflict, 'GSTIN Conflicts');
    sheetNames.push('GSTIN Conflicts');
  }
}

export function exportToXlsx(
  results: Record<string, unknown>[],
  filename: string,
  companyName?: string,
  appliedGstins?: any[],
  conflicts?: any[],
  gstr3bData?: any[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] }
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
    for (let R = 4; R <= range.e.r; R++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: gstDiffColIdx });
      const rowNum = R + 1;
      if (igstPrIdx >= 0 && igst2bIdx >= 0 && cgstPrIdx >= 0 && cgst2bIdx >= 0 && sgstPrIdx >= 0 && sgst2bIdx >= 0) {
        allWs[addr] = { t: 'n', f: `ABS(${getL(igstPrIdx)}${rowNum}-${getL(igst2bIdx)}${rowNum})+ABS(${getL(cgstPrIdx)}${rowNum}-${getL(cgst2bIdx)}${rowNum})+ABS(${getL(sgstPrIdx)}${rowNum}-${getL(sgst2bIdx)}${rowNum})`, z: ACC_FMT };
      }
    }
  }

  // Data Validation for Auditor Action in All Records
  const actionColIdxAll = allCols.indexOf('Auditor Action');
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
      const rowNum = i + 5;
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
      } else if (lower.includes('auditor action') || lower.includes('remark')) {
        return 'AUDITOR INPUT';
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

    // Data Validation for Auditor Action in this Category Sheet
    const actionColIdx = cols.indexOf('Auditor Action');
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

const numVal = (v: unknown): number => {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/,/g, ''));
    return isNaN(n) ? 0 : Math.round(n * 100) / 100;
  }
  return 0;
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
      const cgst = numVal(dn.cgst);
      const sgst = numVal(dn.sgst);
      const igst = numVal(dn.igst);
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
        'Invoice Date (PR)': dn.invoiceDate || '',
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
      const cgst = numVal(dn.cgst);
      const sgst = numVal(dn.sgst);
      const igst = numVal(dn.igst);
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
        'Invoice Date (2B)': dn.invoiceDate || '',
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

  const tabs = [
    { name: '🏠 Home', target: 'Dashboard' },
    { name: '📊 Summary', target: 'Executive Summary' },
    { name: '📅 Tax Comp', target: 'Monthly Tax Comparison' },
    { name: '🗓️ Tax Comp FY', target: 'Monthly Tax Comparison FY' },
    { name: '📋 3B Comp', target: '3B vs 2B vs Books' },
    { name: '⏱️ Timing Rec', target: 'Timing Reconciliation' },
    { name: '📖 Guide', target: '📖 Methodology & Legend' }
  ];

  // Add Executive Summary
  const counts: Record<string, number> = {};
  let totalDiff = 0;
  for (const r of rows) {
    counts[r.status] = (counts[r.status] || 0) + 1;
    totalDiff += numVal(r.totalDiff);
  }
  const breakdown = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([st, c]) => ({ label: st, value: c }));

  const stats = [
    { label: 'Total Records Analysed', value: rows.length },
    { label: 'Net Tax Difference', value: `₹${totalDiff.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ];

  appendExecutiveSummary(wb, companyName, 'Monthly Comparison', stats, breakdown, tabs);

  // ---- Sheet 3: Monthly Tax Comparison (6-table FY layout w/ Debit Notes) ----
  {
    const FY_MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
    const fyIdx = (m: number) => (m >= 3 ? m - 3 : m + 9);
    const parseMonthFY = (s?: string): number => {
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
    type MAgg = { cgst: number; sgst: number; igst: number };
    const mk = (): MAgg[] => Array.from({ length: 12 }, () => ({ cgst: 0, sgst: 0, igst: 0 }));
    const prGross = mk(), tbGross = mk(), prDN = mk(), tbDN = mk();

    for (const r of rows) {
      if (r.status === 'Prior FY (Excluded)') continue;
      const pi = parseMonthFY(r.dateTally);
      if (pi >= 0) {
        prGross[pi].cgst += numVal(r.cgstTally); prGross[pi].sgst += numVal(r.sgstTally); prGross[pi].igst += numVal(r.igstTally);
      }
      const ti = parseMonthFY(r.dateCmp);
      if (ti >= 0) {
        tbGross[ti].cgst += numVal(r.cgstCmp); tbGross[ti].sgst += numVal(r.sgstCmp); tbGross[ti].igst += numVal(r.igstCmp);
      }
    }
    for (const dn of (debitNotes?.pr ?? [])) {
      const i = parseMonthFY(dn.invoiceDate);
      if (i >= 0) { prDN[i].cgst += dn.cgst; prDN[i].sgst += dn.sgst; prDN[i].igst += dn.igst; }
    }
    for (const dn of (debitNotes?.twoB ?? [])) {
      const i = parseMonthFY(dn.invoiceDate);
      if (i >= 0) { tbDN[i].cgst += dn.cgst; tbDN[i].sgst += dn.sgst; tbDN[i].igst += dn.igst; }
    }
    const sub = (a: MAgg[], b: MAgg[]): MAgg[] => a.map((x, i) => ({ cgst: x.cgst - b[i].cgst, sgst: x.sgst - b[i].sgst, igst: x.igst - b[i].igst }));
    const prNet = sub(prGross, prDN);
    const tbNet = sub(tbGross, tbDN);
    const diffNet = sub(prNet, tbNet);

    const r2 = (n: number) => +n.toFixed(2);
    // Each table = 5 cols (Month, CGST, SGST, IGST, Total). 3 tables side-by-side, gap col between.
    const TABLE_W = 5;
    const GAP = 1;
    const COLS = TABLE_W * 3 + GAP * 2; // 17
    // Row plan:
    // 0: top main header "NET ITC COMPARISON" merged across all
    // 1: per-table titles (TOTAL PURCHASE AS PER TALLY / TOTAL AS PER GSTR-2B / DIFFERENCE)
    // 2: column headers
    // 3..14: 12 months
    // 15: TOTAL
    // 16: visual separator (colored row, blank)
    // 17: bottom main header "BOOKS RECONCILIATION" merged
    // 18: per-table titles (PURCHASE / DEBIT NOTE / TOTAL PURCHASE AS PER TALLY)
    // 19: column headers
    // 20..31: 12 months
    // 32: TOTAL
    // 33: visual separator
    // 34: 2B RECONCILIATION header
    // 35: per-table titles
    // 36: column headers
    // 37..48: 12 months
    // 49: TOTAL
    const ROWS = 50;
    const SHIFT = 2;
    const grid: (string | number | null | XLSX.CellObject)[][] = Array.from({ length: ROWS + SHIFT }, () => Array(COLS).fill(null));
    const merges: XLSX.Range[] = [];

    const colStarts = [0, TABLE_W + GAP, (TABLE_W + GAP) * 2]; // 0, 6, 12

    const fillTable = (titleRow: number, hdrRow: number, dataStart: number, totalRow: number, startCol: number, title: string, data: MAgg[], formulaMaker?: (excelRow: number, colOff: number) => string) => {
      titleRow += SHIFT; hdrRow += SHIFT; dataStart += SHIFT; totalRow += SHIFT;
      grid[titleRow][startCol] = title;
      merges.push({ s: { r: titleRow, c: startCol }, e: { r: titleRow, c: startCol + TABLE_W - 1 } });
      grid[hdrRow][startCol] = 'Month';
      grid[hdrRow][startCol + 1] = 'CGST';
      grid[hdrRow][startCol + 2] = 'SGST';
      grid[hdrRow][startCol + 3] = 'IGST';
      grid[hdrRow][startCol + 4] = 'Total';
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

        tc += c; ts += s; ti += ig;
      }
      grid[totalRow][startCol] = 'TOTAL';
      for (let colOff = 1; colOff <= 4; colOff++) {
        const colLetter = XLSX.utils.encode_col(startCol + colOff);
        const val = colOff === 1 ? tc : colOff === 2 ? ts : colOff === 3 ? ti : (tc + ts + ti);
        grid[totalRow][startCol + colOff] = { t: 'n', v: r2(val), f: `SUM(${colLetter}${dataStart + 1}:${colLetter}${dataStart + 12})`, z: ACC_FMT };
      }
    };

    // TOP section
    grid[0 + SHIFT][0] = 'NET ITC COMPARISON';
    merges.push({ s: { r: 0 + SHIFT, c: 0 }, e: { r: 0 + SHIFT, c: COLS - 1 } });
    fillTable(1, 2, 3, 15, colStarts[0], 'TOTAL PURCHASE AS PER TALLY', prNet, (r, off) => {
      const colL = XLSX.utils.encode_col(colStarts[2] + off);
      return `${colL}${r + 17}`;
    });
    fillTable(1, 2, 3, 15, colStarts[1], 'TOTAL AS PER GSTR-2B', tbNet, (r, off) => {
      const colL = XLSX.utils.encode_col(colStarts[2] + off);
      return `${colL}${r + 34}`;
    });
    fillTable(1, 2, 3, 15, colStarts[2], 'DIFFERENCE', diffNet, (r, off) => {
      const colA = XLSX.utils.encode_col(colStarts[0] + off);
      const colB = XLSX.utils.encode_col(colStarts[1] + off);
      return `${colA}${r}-${colB}${r}`;
    });

    // Separator row (16)

    // BOTTOM section 1: Books
    grid[17 + SHIFT][0] = 'FINAL BOOKS DATA';
    merges.push({ s: { r: 17 + SHIFT, c: 0 }, e: { r: 17 + SHIFT, c: COLS - 1 } });
    fillTable(18, 19, 20, 32, colStarts[0], 'PURCHASE', prGross);
    fillTable(18, 19, 20, 32, colStarts[1], 'DEBIT NOTE', prDN);
    fillTable(18, 19, 20, 32, colStarts[2], 'TOTAL PURCHASE AS PER TALLY', prNet, (r, off) => {
      const colA = XLSX.utils.encode_col(colStarts[0] + off);
      const colB = XLSX.utils.encode_col(colStarts[1] + off);
      return `${colA}${r}-${colB}${r}`;
    });

    // BOTTOM section 2: 2B
    grid[34 + SHIFT][0] = 'FINAL 2B DATA';
    merges.push({ s: { r: 34 + SHIFT, c: 0 }, e: { r: 34 + SHIFT, c: COLS - 1 } });
    fillTable(35, 36, 37, 49, colStarts[0], 'B2B INVOICES', tbGross);
    fillTable(35, 36, 37, 49, colStarts[1], 'DEBIT/CREDIT NOTES', tbDN);
    fillTable(35, 36, 37, 49, colStarts[2], 'TOTAL AS PER GSTR-2B', tbNet, (r, off) => {
      const colA = XLSX.utils.encode_col(colStarts[0] + off);
      const colB = XLSX.utils.encode_col(colStarts[1] + off);
      return `${colA}${r}-${colB}${r}`;
    });

    const mtcWs = XLSX.utils.aoa_to_sheet(grid as any[][]);
    addCorporateHeader(mtcWs, COLS, companyName, 'Monthly Tax Comparison', tabs);
    if (!mtcWs['!merges']) mtcWs['!merges'] = [];
    mtcWs['!merges'].push(...merges);
    mtcWs['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];
    mtcWs['!cols'] = Array.from({ length: COLS }, (_, c) => {
      if (c === TABLE_W || c === TABLE_W * 2 + GAP) return { wch: 3 };
      const off = c < TABLE_W ? c : c < TABLE_W * 2 + GAP ? c - TABLE_W - GAP : c - TABLE_W * 2 - GAP * 2;
      return { wch: off === 0 ? 12 : 10 };
    });

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
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
            alignment: { horizontal: 'center', vertical: 'center' },
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
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
            alignment: { horizontal: 'center', vertical: 'center' },
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
    mtcWs['!rows'][16 + SHIFT] = { hpt: 8 };
    mtcWs['!rows'][33 + SHIFT] = { hpt: 8 };

    XLSX.utils.book_append_sheet(wb, mtcWs, 'Monthly Tax Comparison');
  }

  // ---- Sheet 4: Monthly Tax Comparison (FY layout: 2B | JV+Purchase | Difference) ----
  {
    const FY_MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
    // monthIdx for Indian FY (April=0 ... March=11)
    const fyIdx = (m: number) => (m >= 3 ? m - 3 : m + 9);

    const parseMonth = (s?: string): number => {
      if (!s) return -1;
      const str = String(s).trim();
      // Try DD-MM-YYYY / DD/MM/YYYY
      let m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
      if (m) return fyIdx(parseInt(m[2], 10) - 1);
      // Try YYYY-MM-DD
      m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (m) return fyIdx(parseInt(m[2], 10) - 1);
      const d = new Date(str);
      if (!isNaN(d.getTime())) return fyIdx(d.getMonth());
      return -1;
    };

    type MAgg = { cgst: number; sgst: number; igst: number };
    const mk = (): MAgg[] => Array.from({ length: 12 }, () => ({ cgst: 0, sgst: 0, igst: 0 }));
    const tb = mk(), pr = mk();

    for (const r of rows) {
      if (r.status === 'Prior FY (Excluded)') continue;
      const prIdx = parseMonth(r.dateTally);
      if (prIdx >= 0) {
        pr[prIdx].cgst += numVal(r.cgstTally);
        pr[prIdx].sgst += numVal(r.sgstTally);
        pr[prIdx].igst += numVal(r.igstTally);
      }
      const tbIdx = parseMonth(r.dateCmp);
      if (tbIdx >= 0) {
        tb[tbIdx].cgst += numVal(r.cgstCmp);
        tb[tbIdx].sgst += numVal(r.sgstCmp);
        tb[tbIdx].igst += numVal(r.igstCmp);
      }
    }

    const r2 = (n: number) => +n.toFixed(2);

    // Build AOA grid: 3 tables of 4 cols each, separated by 1 blank col -> 14 cols
    const COLS = 4 * 3 + 2; // 14
    const rowsCount = 1 + 1 + 12 + 1; // title, header, 12 months, total
    const SHIFT = 2;

    // Reconciliation table starts after an empty row from the total row
    // Row 17 (index 16) is TOTAL
    // Row 18 (index 17) is blank spacer
    // Row 19 (index 18) is Reconciliation Section Title
    // Row 20 (index 19) is blank spacer
    // Row 21 (index 20) is Reconciliation Table Headers
    // Rows 22 to 57 (index 21 to 56) are month rows (12 months * 3 tax types)
    // Row 58 (index 57) is Reconciliation Table Totals
    const RECON_START_ROW = 20;
    const gridExpandedLength = RECON_START_ROW + 2 + 36 + 1;
    const grid: (string | number | null | XLSX.CellObject)[][] = Array.from({ length: gridExpandedLength }, () => Array(COLS).fill(null));

    const tables: { startCol: number; title: string; monthHdr: string; data: MAgg[] }[] = [
      { startCol: 0, title: '2B', monthHdr: 'MONTHS', data: tb },
      { startCol: 5, title: 'JV+Purchase', monthHdr: 'Month', data: pr },
      { startCol: 10, title: 'Difference', monthHdr: 'MONTHS', data: pr.map((p, i) => ({ cgst: p.cgst - tb[i].cgst, sgst: p.sgst - tb[i].sgst, igst: p.igst - tb[i].igst })) },
    ];

    const merges: XLSX.Range[] = [];
    for (const t of tables) {
      grid[0 + SHIFT][t.startCol] = t.title;
      merges.push({ s: { r: 0 + SHIFT, c: t.startCol }, e: { r: 0 + SHIFT, c: t.startCol + 3 } });
      grid[1 + SHIFT][t.startCol] = t.monthHdr;
      grid[1 + SHIFT][t.startCol + 1] = 'CGST';
      grid[1 + SHIFT][t.startCol + 2] = 'SGST';
      grid[1 + SHIFT][t.startCol + 3] = 'IGST';
      let tc = 0, ts = 0, ti = 0;
      for (let i = 0; i < 12; i++) {
        const row = 2 + SHIFT + i;
        const excelRow = row + 1;
        grid[row][t.startCol] = FY_MONTHS[i];

        for (let colOff = 1; colOff <= 3; colOff++) {
          const val = colOff === 1 ? t.data[i].cgst : colOff === 2 ? t.data[i].sgst : t.data[i].igst;
          let f: string | undefined;

          if (t.title === 'Difference') {
            const colL_PR = XLSX.utils.encode_col(5 + colOff);
            const colL_2B = XLSX.utils.encode_col(0 + colOff);
            f = `${colL_PR}${excelRow}-${colL_2B}${excelRow}`;
          }
          grid[row][t.startCol + colOff] = f ? { t: 'n', v: r2(val), f, z: ACC_FMT } : r2(val);
        }
        tc += t.data[i].cgst; ts += t.data[i].sgst; ti += t.data[i].igst;
      }
      const totalRow = 2 + 12 + SHIFT;
      grid[totalRow][t.startCol] = 'TOTAL';
      for (let colOff = 1; colOff <= 3; colOff++) {
        const colLetter = XLSX.utils.encode_col(t.startCol + colOff);
        const val = colOff === 1 ? tc : colOff === 2 ? ts : ti;
        grid[totalRow][t.startCol + colOff] = { t: 'n', v: r2(val), f: `SUM(${colLetter}5:${colLetter}16)`, z: ACC_FMT };
      }
    }

    // Populate Reconciliation Table Data
    type RecAgg = { timingOutCGST: number; timingOutSGST: number; timingOutIGST: number; timingInCGST: number; timingInSGST: number; timingInIGST: number };
    const recData: RecAgg[] = Array.from({ length: 12 }, () => ({
      timingOutCGST: 0, timingOutSGST: 0, timingOutIGST: 0,
      timingInCGST: 0, timingInSGST: 0, timingInIGST: 0
    }));

    for (const r of rows) {
      if (r.status === 'Prior FY (Excluded)') continue;
      const prIdx = parseMonth(r.dateTally);
      const tbIdx = parseMonth(r.dateCmp);
      if (prIdx >= 0 && tbIdx >= 0 && prIdx !== tbIdx) {
        recData[prIdx].timingOutCGST += numVal(r.cgstTally);
        recData[prIdx].timingOutSGST += numVal(r.sgstTally);
        recData[prIdx].timingOutIGST += numVal(r.igstTally);

        recData[tbIdx].timingInCGST += numVal(r.cgstCmp);
        recData[tbIdx].timingInSGST += numVal(r.sgstCmp);
        recData[tbIdx].timingInIGST += numVal(r.igstCmp);
      }
    }

    grid[RECON_START_ROW][0] = 'MONTHLY RECONCILIATION TO PARTY SUMMARY (TIMING DIFFERENCES ANALYSIS)';
    merges.push({ s: { r: RECON_START_ROW, c: 0 }, e: { r: RECON_START_ROW, c: 13 } });
    
    const reconHeaders = [
      'Month', 'Tax Type', 'Month-wise Difference', 'Less: Timing Out (Books here, Portal later)', 'Add: Timing In (Portal here, Books earlier)', 'Reconciled Party Difference'
    ];
    for (let c = 0; c < reconHeaders.length; c++) {
      grid[RECON_START_ROW + 1][c] = reconHeaders[c];
    }

    let rIdx = RECON_START_ROW + 2;
    const taxTypes = ['CGST', 'SGST', 'IGST'];
    for (let i = 0; i < 12; i++) {
      const monthName = FY_MONTHS[i];
      const monthExcelRow = 4 + i + 1; // row 5 to 16 in Excel (corresponds to grid row 4 to 15)

      for (let t = 0; t < 3; t++) {
        const taxType = taxTypes[t];
        const currentGridRow = rIdx;
        const excelRowNum = currentGridRow + 1;

        grid[currentGridRow][0] = monthName;
        grid[currentGridRow][1] = taxType;

        const diffColLetter = XLSX.utils.encode_col(11 + t); // L, M, or N
        grid[currentGridRow][2] = { t: 'n', f: `${diffColLetter}${monthExcelRow}`, z: ACC_FMT };

        const outVal = t === 0 ? recData[i].timingOutCGST : t === 1 ? recData[i].timingOutSGST : recData[i].timingOutIGST;
        const inVal = t === 0 ? recData[i].timingInCGST : t === 1 ? recData[i].timingInSGST : recData[i].timingInIGST;

        grid[currentGridRow][3] = r2(outVal);
        grid[currentGridRow][4] = r2(inVal);
        grid[currentGridRow][5] = { t: 'n', f: `C${excelRowNum}-D${excelRowNum}+E${excelRowNum}`, z: ACC_FMT };

        rIdx++;
      }
    }

    const reconTotalRow = rIdx;
    grid[reconTotalRow][0] = 'TOTAL';
    grid[reconTotalRow][1] = '';
    for (let c = 2; c <= 5; c++) {
      const colLetter = XLSX.utils.encode_col(c);
      grid[reconTotalRow][c] = { t: 'n', f: `SUM(${colLetter}${RECON_START_ROW + 3}:${colLetter}${reconTotalRow})`, z: ACC_FMT };
    }

    const mWs = XLSX.utils.aoa_to_sheet(grid as any[][]);
    addCorporateHeader(mWs, COLS, companyName, 'Monthly Tax Comparison FY', tabs);
    if (!mWs['!merges']) mWs['!merges'] = [];
    mWs['!merges'].push(...merges);
    mWs['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];
    mWs['!cols'] = Array.from({ length: COLS }, (_, c) => ({ wch: (c === 4 || c === 9) ? 3 : (c % 5 === 0 ? 12 : 10) }));

    const titleFills: Record<string, string> = { '2B': '0D7A5F', 'JV+Purchase': '1E3A5F', 'Difference': 'B45309' };
    const totalRowIdx = 2 + 12 + SHIFT;

    for (let r = 0; r < gridExpandedLength; r++) {
      if (!mWs['!rows']) mWs['!rows'] = [];
      
      let hpt = 15;
      if (r === 0 + SHIFT) hpt = 20;
      else if (r === 1 + SHIFT) hpt = 18;
      else if (r === RECON_START_ROW) hpt = 22;
      else if (r === RECON_START_ROW + 1) hpt = 18;
      else if (r === reconTotalRow) hpt = 20;
      
      mWs['!rows'][r] = { hpt };

      for (let c = 0; c < COLS; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!mWs[addr]) continue;
        
        if (r >= RECON_START_ROW) {
          const isHeader = r === RECON_START_ROW + 1;
          const isTitle = r === RECON_START_ROW;
          const isTotal = r === reconTotalRow;
          
          if (isTitle) {
            mWs[addr].s = {
              fill: { fgColor: { rgb: '1E3A5F' } },
              font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
              alignment: { horizontal: 'center', vertical: 'center' }
            };
          } else if (isHeader) {
            mWs[addr].s = {
              fill: { fgColor: { rgb: '374151' } },
              font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
              alignment: { horizontal: 'center', vertical: 'center' },
              border: { bottom: { style: 'thin', color: { rgb: '000000' } } }
            };
          } else {
            const isNum = c >= 2;
            mWs[addr].s = {
              fill: { fgColor: { rgb: isTotal ? 'E5E7EB' : (r % 2 === 0 ? 'FFFFFF' : 'F9FAFB') } },
              font: { sz: 9, bold: isTotal || c <= 1 },
              alignment: { vertical: 'center', horizontal: isNum ? 'right' : 'left' },
              border: isTotal
                ? { top: { style: 'thin', color: { rgb: '9CA3AF' } }, bottom: { style: 'double', color: { rgb: '9CA3AF' } } }
                : { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
              numFmt: isNum ? ACC_FMT : undefined
            };
          }
          continue;
        }

        if (r < SHIFT) continue;
        const inGap = (c === 4 || c === 9);
        if (inGap) continue;
        const tableIdx = c < 4 ? 0 : c < 9 ? 1 : 2;
        const table = tables[tableIdx];
        if (r === 0 + SHIFT) {
          mWs[addr].s = {
            fill: { fgColor: { rgb: titleFills[table.title] } },
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
          };
        } else if (r === 1 + SHIFT) {
          mWs[addr].s = {
            fill: { fgColor: { rgb: '374151' } },
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
          };
        } else {
          const isTotal = r === totalRowIdx;
          const colOffset = c - table.startCol;
          mWs[addr].s = {
            fill: { fgColor: { rgb: isTotal ? 'E5E7EB' : (r % 2 === 0 ? 'FFFFFF' : 'F9FAFB') } },
            font: { sz: 9, bold: isTotal || colOffset === 0 },
            alignment: { vertical: 'center', horizontal: colOffset === 0 ? 'left' : 'right' },
            border: isTotal
              ? { top: { style: 'thin', color: { rgb: '9CA3AF' } }, bottom: { style: 'double', color: { rgb: '9CA3AF' } } }
              : { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
          };
          if (colOffset >= 1) (mWs[addr] as XLSX.CellObject).z = ACC_FMT;
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, mWs, 'Monthly Tax Comparison FY');
  }

  const comparisonSheetNames = [
    'Executive Summary',
    'Monthly Tax Comparison',
    'Monthly Tax Comparison FY',
    '3B vs 2B vs Books',
  ];

  // ---- Sheet 5: GSTR-3B vs 2B vs Books ----
  {
    const FY_MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
    const fyIdx = (m: number) => (m >= 3 ? m - 3 : m + 9);
    const parseMonth = (s?: string): number => {
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

    let resolved3bData = gstr3bData;
    if (!resolved3bData) {
      try {
        const storage = typeof window !== 'undefined' ? (window.sessionStorage || window.localStorage) : null;
        resolved3bData = JSON.parse(storage?.getItem('np_gstr3b_data') || 'null');
      } catch {
        resolved3bData = null;
      }
    }

    type MAgg = { taxable: number; cgst: number; sgst: number; igst: number };
    const mk = (): MAgg[] => Array.from({ length: 12 }, () => ({ taxable: 0, cgst: 0, sgst: 0, igst: 0 }));
    const prData = mk(), tb2bData = mk(), tb3bData = mk();

    for (const r of rows) {
      if (r.status === 'Prior FY (Excluded)') continue;
      const prIdx = parseMonth(r.dateTally);
      if (prIdx >= 0) {
        prData[prIdx].taxable += numVal(r.taxableTally);
        prData[prIdx].cgst += numVal(r.cgstTally);
        prData[prIdx].sgst += numVal(r.sgstTally);
        prData[prIdx].igst += numVal(r.igstTally);
      }
      const tbIdx = parseMonth(r.dateCmp);
      if (tbIdx >= 0) {
        tb2bData[tbIdx].taxable += numVal(r.taxableCmp);
        tb2bData[tbIdx].cgst += numVal(r.cgstCmp);
        tb2bData[tbIdx].sgst += numVal(r.sgstCmp);
        tb2bData[tbIdx].igst += numVal(r.igstCmp);
      }
    }

    if (resolved3bData && Array.isArray(resolved3bData)) {
      for (const b of resolved3bData) {
        const mStr = String(b.period || b.month || '').toLowerCase();
        let mIdx = -1;
        for (let i = 0; i < 12; i++) {
          if (mStr.includes(FY_MONTHS[i].toLowerCase())) {
            mIdx = i; break;
          }
        }
        if (mIdx >= 0) {
          tb3bData[mIdx].taxable += numVal(b.taxable ?? b.Taxable ?? 0);
          tb3bData[mIdx].cgst += numVal(b.cgst ?? b.CGST ?? 0);
          tb3bData[mIdx].sgst += numVal(b.sgst ?? b.SGST ?? 0);
          tb3bData[mIdx].igst += numVal(b.igst ?? b.IGST ?? 0);
        }
      }
    }

    const diffData = mk();
    let hasTaxable = false;
    for (let i = 0; i < 12; i++) {
      diffData[i].taxable = tb2bData[i].taxable - tb3bData[i].taxable;
      diffData[i].cgst = tb2bData[i].cgst - tb3bData[i].cgst;
      diffData[i].sgst = tb2bData[i].sgst - tb3bData[i].sgst;
      diffData[i].igst = tb2bData[i].igst - tb3bData[i].igst;
      if (prData[i].taxable > 0 || tb2bData[i].taxable > 0 || tb3bData[i].taxable > 0) hasTaxable = true;
    }

    const r2 = (n: number) => +n.toFixed(2);
    const colPerBlock = hasTaxable ? 4 : 3;
    const COLS = 1 + (colPerBlock * 4);
    const SHIFT = 2;
    const ROWS = 1 + 1 + 12 + 1;
    const grid: (string | number | null | XLSX.CellObject)[][] = Array.from({ length: ROWS + SHIFT }, () => Array(COLS).fill(null));

    const blockNames = ['Books (PR / Sales)', 'Portal (2B / 1)', 'GSTR-3B (Claimed / Paid)', 'Difference'];
    grid[0 + SHIFT][0] = '';
    for (let b = 0; b < 4; b++) {
      grid[0 + SHIFT][1 + b * colPerBlock] = blockNames[b];
    }

    grid[1 + SHIFT][0] = 'Month';
    for (let b = 0; b < 4; b++) {
      const start = 1 + b * colPerBlock;
      if (hasTaxable) {
        grid[1 + SHIFT][start] = 'Taxable';
        grid[1 + SHIFT][start + 1] = 'CGST';
        grid[1 + SHIFT][start + 2] = 'SGST';
        grid[1 + SHIFT][start + 3] = 'IGST';
      } else {
        grid[1 + SHIFT][start] = 'CGST';
        grid[1 + SHIFT][start + 1] = 'SGST';
        grid[1 + SHIFT][start + 2] = 'IGST';
      }
    }

    const merges: XLSX.Range[] = [];
    for (let b = 0; b < 4; b++) {
      const start = 1 + b * colPerBlock;
      merges.push({ s: { r: 0 + SHIFT, c: start }, e: { r: 0 + SHIFT, c: start + colPerBlock - 1 } });
    }

    const blockTotals = [
      { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
      { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
      { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
      { taxable: 0, cgst: 0, sgst: 0, igst: 0 }
    ];

    for (let i = 0; i < 12; i++) {
      const row = 2 + SHIFT + i;
      const excelRow = row + 1;
      grid[row][0] = FY_MONTHS[i];
      const blocks = [prData[i], tb2bData[i], tb3bData[i], diffData[i]];
      for (let b = 0; b < 4; b++) {
        const start = 1 + b * colPerBlock;
        const data = blocks[b];

        for (let colOff = 0; colOff < colPerBlock; colOff++) {
          let val = 0;
          if (hasTaxable) {
            val = colOff === 0 ? data.taxable : colOff === 1 ? data.cgst : colOff === 2 ? data.sgst : data.igst;
          } else {
            val = colOff === 0 ? data.cgst : colOff === 1 ? data.sgst : data.igst;
          }

          let f: string | undefined;
          if (b === 3) {
            const colL_2B = XLSX.utils.encode_col(1 + 1 * colPerBlock + colOff);
            const colL_3B = XLSX.utils.encode_col(1 + 2 * colPerBlock + colOff);
            f = `${colL_2B}${excelRow}-${colL_3B}${excelRow}`;
          }

          grid[row][start + colOff] = f ? { t: 'n', v: r2(val), f, z: ACC_FMT } : r2(val);
        }

        blockTotals[b].taxable += data.taxable;
        blockTotals[b].cgst += data.cgst;
        blockTotals[b].sgst += data.sgst;
        blockTotals[b].igst += data.igst;
      }
    }

    const totalRow = 2 + SHIFT + 12;
    grid[totalRow][0] = 'TOTAL';
    for (let b = 0; b < 4; b++) {
      const start = 1 + b * colPerBlock;
      const data = blockTotals[b];

      for (let colOff = 0; colOff < colPerBlock; colOff++) {
        let val = 0;
        if (hasTaxable) {
          val = colOff === 0 ? data.taxable : colOff === 1 ? data.cgst : colOff === 2 ? data.sgst : data.igst;
        } else {
          val = colOff === 0 ? data.cgst : colOff === 1 ? data.sgst : data.igst;
        }

        const colLetter = XLSX.utils.encode_col(start + colOff);
        grid[totalRow][start + colOff] = { t: 'n', v: r2(val), f: `SUM(${colLetter}5:${colLetter}16)`, z: ACC_FMT };
      }
    }

    const mWs = XLSX.utils.aoa_to_sheet(grid as any[][]);
    addCorporateHeader(mWs, COLS, companyName, 'GSTR-3B vs 2B vs Books', tabs);
    if (!mWs['!merges']) mWs['!merges'] = [];
    mWs['!merges'].push(...merges);
    mWs['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];
    mWs['!cols'] = [{ wch: 14 }, ...Array(colPerBlock * 4).fill({ wch: 12 })];

    const titleFills = ['1E3A5F', '0D7A5F', '6D28D9', 'B45309'];

    for (let r = 0; r < ROWS + SHIFT; r++) {
      if (!mWs['!rows']) mWs['!rows'] = [];
      mWs['!rows'][r] = { hpt: r === 0 + SHIFT ? 24 : (r === 1 + SHIFT ? 20 : 18) };

      for (let c = 0; c < COLS; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!mWs[addr]) continue;
        if (r < SHIFT) continue;

        const isTitle = r === 0 + SHIFT;
        const isHeader = r === 1 + SHIFT;
        const isTotal = r === totalRow;

        let blockIdx = -1;
        if (c >= 1) blockIdx = Math.floor((c - 1) / colPerBlock);

        if (isTitle) {
          mWs[addr].s = {
            fill: { fgColor: { rgb: blockIdx >= 0 ? titleFills[blockIdx] : '0F172A' } },
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: { bottom: { style: 'thin', color: { rgb: '000000' } }, top: { style: 'medium', color: { rgb: '0F172A' } } },
          };
        } else if (isHeader) {
          mWs[addr].s = {
            fill: { fgColor: { rgb: '374151' } },
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: { bottom: { style: 'medium', color: { rgb: '000000' } } },
          };
        } else {
          mWs[addr].s = {
            fill: { fgColor: { rgb: isTotal ? 'E5E7EB' : (r % 2 === 0 ? 'FFFFFF' : 'F9FAFB') } },
            font: { sz: 9.5, bold: isTotal || c === 0 },
            alignment: { vertical: 'center', horizontal: c === 0 ? 'left' : 'right' },
            border: isTotal
              ? { top: { style: 'medium', color: { rgb: '9CA3AF' } }, bottom: { style: 'double', color: { rgb: '9CA3AF' } } }
              : { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } }, left: { style: 'hair', color: { rgb: 'E5E7EB' } }, right: { style: 'hair', color: { rgb: 'E5E7EB' } } },
          };
          if (c >= 1) {
            (mWs[addr] as XLSX.CellObject).z = ACC_FMT;
            if (blockIdx === 3 && typeof mWs[addr].v === 'number' && Math.abs(mWs[addr].v as number) > 0.01) {
              mWs[addr].s.font.color = { rgb: 'DC2626' };
            }
          }
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, mWs, '3B vs 2B vs Books');
  }

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
      'Invoice Date (PR)': r.dateTally || '',
      'Invoice Date (2B)': r.dateCmp || '',
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
    addCorporateHeader(ws, cols.length, companyName, 'Prior FY (Excluded) Records', tabs);
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
  // ---- Sheet 6: Timing Reconciliation ----
  appendTimingReconciliationSheet(wb, rows, companyName, tabs);
  comparisonSheetNames.push('Timing Reconciliation');

  appendGstinReports(wb, comparisonSheetNames, companyName, appliedGstins, conflicts, tabs);

  appendMethodologySheet(wb, companyName, tabs);
  comparisonSheetNames.push('📖 Methodology & Legend');
  appendNavigationSheet(wb, comparisonSheetNames, companyName, stats, breakdown);

  wb.Props = {
    Title: filename.replace('.xlsx', ''),
    Subject: 'Monthly Tax Comparison Report',
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