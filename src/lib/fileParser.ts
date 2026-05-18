import * as XLSX from 'xlsx-js-style';
import type { InvoiceRecord } from './reconciliation';

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
  filingStatus?: string;
  filingDate?: string;
}

const KNOWN_HEADERS: Record<keyof ColumnMapping, string[]> = {
  supplierName: ['supplier name', 'party name', 'vendor name', 'name of supplier', 'supplier', 'trade name', 'legal name'],
  gstin: ['gstin', 'gstin of supplier', 'gstin/uin', 'supplier gstin', 'gstin no', 'gst no'],
  invoiceNo: ['invoice no', 'invoice number', 'inv no', 'bill no', 'document number', 'invoice no.'],
  invoiceDate: ['invoice date', 'inv date', 'bill date', 'document date', 'invoice dt'],
  igst: ['igst', 'integrated tax', 'igst amount', 'igst amt'],
  cgst: ['cgst', 'central tax', 'cgst amount', 'cgst amt'],
  sgst: ['sgst', 'state tax', 'sgst amount', 'sgst amt', 'utgst'],
  taxableValue: ['taxable value', 'taxable amount', 'taxable val', 'assessable value'],
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

export async function parseFile(file: File): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

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

interface StatusStyle {
  headerFill: string;
  headerFont: string;
  rowFill: string;
}

const STATUS_STYLES: Record<string, StatusStyle> = {
  'Matched':                { headerFill: '1B7A4D', headerFont: 'FFFFFF', rowFill: 'E6F5ED' },
  'Matched (Rounded)':      { headerFill: '2E8B57', headerFont: 'FFFFFF', rowFill: 'E6F5ED' },
  'Mismatch':               { headerFill: 'D97706', headerFont: 'FFFFFF', rowFill: 'FEF3C7' },
  'Missing in 2B':          { headerFill: 'DC2626', headerFont: 'FFFFFF', rowFill: 'FEE2E2' },
  'Missing in PR':          { headerFill: '2563EB', headerFont: 'FFFFFF', rowFill: 'DBEAFE' },
  'Not in Books':           { headerFill: '2563EB', headerFont: 'FFFFFF', rowFill: 'DBEAFE' },
  'Possible Match':         { headerFill: '6B7280', headerFont: 'FFFFFF', rowFill: 'F3F4F6' },
  'Name Matched (No GSTIN)':{ headerFill: 'B45309', headerFont: 'FFFFFF', rowFill: 'FEF3C7' },
  'Wrong GSTIN':            { headerFill: 'B91C1C', headerFont: 'FFFFFF', rowFill: 'FEE2E2' },
  'Name Mismatch':          { headerFill: 'D97706', headerFont: 'FFFFFF', rowFill: 'FEF3C7' },
};

const DEFAULT_STYLE: StatusStyle = { headerFill: '1E3A5F', headerFont: 'FFFFFF', rowFill: 'FFFFFF' };

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
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dd = String(d.getDate()).padStart(2, '0');
  return `${dd}-${months[d.getMonth()]}-${d.getFullYear()}`;
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
    return { wch: Math.min(Math.max(max + 2, 10), 45) };
  });
}

// Inserts a high-end corporate header into the first two rows of any worksheet
function addCorporateHeader(ws: XLSX.WorkSheet, colCount: number, companyName: string | undefined, reportName: string) {
  const comp = (companyName || 'GST Reconciliation').toUpperCase();
  const title = `${comp} - ${reportName.toUpperCase()}`;
  const subtitle = `Report Generated on: ${new Date().toLocaleString('en-IN')} | Powered by Vaswani Return`;

  XLSX.utils.sheet_add_aoa(ws, [[title], [subtitle]], { origin: 'A1' });

  if (!ws['!merges']) ws['!merges'] = [];
  ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } });
  ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } });

  if (!ws['!rows']) ws['!rows'] = [];
  ws['!rows'][0] = { hpt: 30 };
  ws['!rows'][1] = { hpt: 18 };

  const tAddr = XLSX.utils.encode_cell({ r: 0, c: 0 });
  if (ws[tAddr]) {
    ws[tAddr].s = { fill: { fgColor: { rgb: '0F172A' } }, font: { sz: 14, color: { rgb: 'F8FAFC' }, bold: true }, alignment: { horizontal: 'center', vertical: 'center' } };
  }
  const sAddr = XLSX.utils.encode_cell({ r: 1, c: 0 });
  if (ws[sAddr]) {
    ws[sAddr].s = { fill: { fgColor: { rgb: '1E293B' } }, font: { sz: 10, color: { rgb: '94A3B8' }, italic: true }, alignment: { horizontal: 'center', vertical: 'center' } };
  }
}

function appendExecutiveSummary(
  wb: XLSX.WorkBook,
  companyName: string | undefined,
  reportName: string,
  stats: { label: string; value: string | number }[],
  breakdown?: { label: string; value: string | number }[]
) {
  const wsCover = XLSX.utils.aoa_to_sheet([]);
  addCorporateHeader(wsCover, 5, companyName, reportName);
  
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
  wsCover['!cols'] = [{ wch: 5 }, { wch: 35 }, { wch: 15 }, { wch: 20 }, { wch: 5 }];
  
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
          sz: isSection ? 12 : 11
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
      wsCover['!rows'][r] = { hpt: isSection ? 24 : 20 };
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

  if (!wsCover['!views']) wsCover['!views'] = [];
  wsCover['!views'].push({ showGridLines: false });

  XLSX.utils.book_append_sheet(wb, wsCover, 'Executive Summary');
}

function applySheetStyles(
  ws: XLSX.WorkSheet,
  style: StatusStyle,
  rowCount: number,
  opts?: { dateCols?: number[]; numberCols?: number[]; colWidths?: { wch: number }[]; startRow?: number }
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
  ws['!rows'][startRow] = { hpt: 24 };

  // Header row
  for (let c = 0; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: startRow, c });
    if (!ws[addr]) continue;
    ws[addr].s = {
      fill: { fgColor: { rgb: style.headerFill } },
      font: { bold: true, color: { rgb: style.headerFont }, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
    };
  }

  // Data rows
  for (let r = 1; r <= rowCount; r++) {
    const isEven = r % 2 === 0;
    ws['!rows'][startRow + r] = { hpt: 20 };
    for (let c = 0; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: startRow + r, c });
      if (!ws[addr]) continue;

      // Reformat dates as standardized string
      if (dateCols.has(c) && ws[addr].v != null && ws[addr].v !== '') {
        const formatted = formatDateStr(ws[addr].v);
        ws[addr].v = formatted;
        ws[addr].t = 's';
      }
      // Coerce number columns to numeric with 2-decimal format
      if (numberCols.has(c)) {
        const n = numVal(ws[addr].v);
        ws[addr].v = n;
        ws[addr].t = 'n';
        ws[addr].z = '0.00';
      }

      ws[addr].s = {
        fill: { fgColor: { rgb: isEven ? style.rowFill : 'FFFFFF' } },
        font: { sz: 10 },
        alignment: { vertical: 'center', horizontal: numberCols.has(c) ? 'right' : 'left' },
        border: { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
        numFmt: numberCols.has(c) ? '0.00' : undefined,
      };
    }
  }
}

function buildSheetRows(records: Record<string, unknown>[]) {
  const cols = [
    'Status', 'GSTIN (PR)', 'GSTIN (2B)', 'Supplier Name (PR)', 'Supplier Name (2B)',
    'Invoice No (PR)', 'Invoice No (2B)',
    'Invoice Date (PR)', 'Invoice Date (2B)',
    'IGST (PR)', 'IGST (2B)',
    'CGST (PR)', 'CGST (2B)',
    'SGST (PR)', 'SGST (2B)',
    'GST Diff',
    'ITC Eligibility', 'GSTR-1 Status', 'Filing Date',
    'Days Old', 'Tax Rate %', 'POS Compliance', 'Rule 37 Warning',
    'Remark',
  ];
  return { cols, data: records.map((r) => cols.map((c) => r[c] ?? '')) };
}

export function exportToXlsx(results: Record<string, unknown>[], filename: string, companyName?: string) {
  const wb = XLSX.utils.book_new();

  // Add Executive Summary
  const counts: Record<string, number> = {};
  let totalGSTDiff = 0;
  for (const r of results) {
    const st = String(r['Status'] || 'Unknown');
    counts[st] = (counts[st] || 0) + 1;
    totalGSTDiff += numVal(r['GST Diff']);
  }
  const breakdown = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([st, c]) => ({ label: st, value: c }));
    
  appendExecutiveSummary(wb, companyName, 'Reconciliation Summary', [
    { label: 'Total Records Analysed', value: results.length },
    { label: 'Net GST Difference', value: `₹${totalGSTDiff.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ], breakdown);

  // 1. "All Records" summary sheet
  const allWs = XLSX.utils.json_to_sheet(results, { origin: 'A3' });
  addCorporateHeader(allWs, Object.keys(results[0] ?? {}).length, companyName, 'All Records');
  applySheetStyles(allWs, DEFAULT_STYLE, results.length, {
    startRow: 2,
    colWidths: autoFitCols(
      Object.keys(results[0] ?? {}),
      results.map((r) => Object.values(r) as (string | number)[])
    ),
  });
  allWs['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4' }];
  XLSX.utils.book_append_sheet(wb, allWs, 'All Records');

  // 2. One sheet per status category
  const grouped: Record<string, Record<string, unknown>[]> = {};
  for (const r of results) {
    const status = String(r['Status'] || 'Other');
    if (!grouped[status]) grouped[status] = [];
    grouped[status].push(r);
  }

  // --- Party-balance filter: only include a party's missing invoices in
  // 'Missing in 2B' / 'Missing in PR' sheets if that party has a NET tax diff. ---
  const partyTotals = new Map<string, { d: number }>();
  const keyFor = (r: Record<string, unknown>): string => {
    const g = String(r['GSTIN (PR)'] || r['GSTIN (2B)'] || '').toUpperCase().trim();
    const n = String(r['Supplier Name (PR)'] || r['Supplier Name (2B)'] || '').trim().toUpperCase();
    return g || `NAME::${n}`;
  };
  for (const r of results) {
    const k = keyFor(r);
    if (!k) continue;
    const diff =
      (numVal(r['CGST (PR)']) - numVal(r['CGST (2B)'])) +
      (numVal(r['SGST (PR)']) - numVal(r['SGST (2B)'])) +
      (numVal(r['IGST (PR)']) - numVal(r['IGST (2B)']));
    const cur = partyTotals.get(k) || { d: 0 };
    cur.d += diff;
    partyTotals.set(k, cur);
  }
  const partyHasNetDiff = (r: Record<string, unknown>): boolean => {
    const t = partyTotals.get(keyFor(r));
    return !!t && Math.abs(t.d) > 0.01;
  };

  for (const status of Object.keys(grouped)) {
    let rows = grouped[status];
    if (status === 'Missing in 2B' || status === 'Not in 2B' || status === 'Missing in PR' || status === 'Not in Books') {
      rows = rows.filter(partyHasNetDiff);
      if (rows.length === 0) continue;
    }
    const { cols, data } = buildSheetRows(rows);
    const ws = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.sheet_add_aoa(ws, [cols, ...data], { origin: 'A3' });
    addCorporateHeader(ws, cols.length, companyName, `${status} Records`);
    const style = STATUS_STYLES[status] || DEFAULT_STYLE;
    applySheetStyles(ws, style, rows.length, {
      startRow: 2,
      dateCols: [7, 8],
      numberCols: [9, 10, 11, 12, 13, 14, 15],
      colWidths: autoFitCols(cols, data as (string | number)[][]),
    });
    ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4' }];
    const sheetName = status.length > 31 ? status.slice(0, 31) : status;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  // 4. Suggested GSTINs Sheet
  const suggested: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    const gstinPR = String(r['GSTIN (PR)'] || '').trim();
    const gstin2B = String(r['GSTIN (2B)'] || '').trim();
    const partyPR = String(r['Supplier Name (PR)'] || '').trim();
    const party2B = String(r['Supplier Name (2B)'] || '').trim();

    if (gstin2B && gstinPR !== gstin2B && r['Status'] !== 'Unmatched Vendor' && r['Status'] !== 'Missing in PR') {
      const key = `${partyPR}::${gstin2B}`;
      if (!seen.has(key)) {
        seen.add(key);
        suggested.push({
          'Party Name in Books': partyPR,
          'Current GSTIN in Books': gstinPR || 'Missing',
          'Suggested GSTIN (from Govt Data)': gstin2B,
          'Party Name in Govt Data': party2B,
          'Latest Match Status': r['Status'],
          'Remark': r['Remark']
        });
      }
    }
  }

  if (suggested.length > 0) {
    const wsSugg = XLSX.utils.json_to_sheet(suggested, { origin: 'A3' });
    addCorporateHeader(wsSugg, 6, companyName, 'Suggested GSTINs');
    applySheetStyles(wsSugg, { headerFill: '6D28D9', headerFont: 'FFFFFF', rowFill: 'FFFFFF' }, suggested.length, {
      startRow: 2,
      colWidths: [{ wch: 35 }, { wch: 25 }, { wch: 30 }, { wch: 35 }, { wch: 20 }, { wch: 45 }]
    });
    wsSugg['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4' }];
    XLSX.utils.book_append_sheet(wb, wsSugg, 'Suggested GSTINs');
  }

  // 3. Party-wise sheets ('Party Summary' + 'Party Details') with internal hyperlinks
  appendPartyWiseSheets(wb, results, companyName);

  XLSX.writeFile(wb, filename);
}

// --- Party-wise sheets builder (used by exportToXlsx) ---
type PartyAccum = {
  gstin: string;
  party: string;
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
  if (statuses.has('Missing in 2B') || statuses.has('Missing in PR') || statuses.has('Wrong GSTIN')) return 'Has Missing';
  if (statuses.has('Mismatch') || statuses.has('Name Mismatch') || statuses.has('Possible Match') || statuses.has('Name Matched (No GSTIN)')) return 'Has Mismatches';
  return 'All Matched';
}

function appendPartyWiseSheets(wb: XLSX.WorkBook, results: Record<string, unknown>[], companyName?: string) {
  // Group by GSTIN (fallback to Supplier Name)
  const map = new Map<string, PartyAccum>();
  for (const r of results) {
    const gstin = String(r['GSTIN (PR)'] || r['GSTIN (2B)'] || '').toUpperCase().trim();
    const party = String(r['Supplier Name (PR)'] || r['Supplier Name (2B)'] || '').trim();
    const key = gstin || `NAME::${party.toUpperCase()}`;
    if (!key) continue;
    let p = map.get(key);
    if (!p) {
      p = {
        gstin, party, invoices: [],
        prCgst: 0, prSgst: 0, prIgst: 0,
        cgst2B: 0, sgst2B: 0, igst2B: 0,
        statuses: new Set<string>(),
      };
      map.set(key, p);
    }
    if (!p.party && party) p.party = party;
    if (!p.gstin && gstin) p.gstin = gstin;
    p.invoices.push(r);
    p.prCgst += numVal(r['CGST (PR)']);
    p.prSgst += numVal(r['SGST (PR)']);
    p.prIgst += numVal(r['IGST (PR)']);
    p.cgst2B += numVal(r['CGST (2B)']);
    p.sgst2B += numVal(r['SGST (2B)']);
    p.igst2B += numVal(r['IGST (2B)']);
    p.statuses.add(String(r['Status'] || ''));
  }

  const parties = Array.from(map.values()).sort((a, b) =>
    (a.party || a.gstin).localeCompare(b.party || b.gstin)
  );

  // ---- Build 'Party Details' first so we know each party's anchor row ----
  const detailHeaders = [
    'Inv No (PR)', 'Inv No (2B)',
    'Date (PR)', 'Date (2B)',
    'CGST (PR)', 'CGST (2B)',
    'SGST (PR)', 'SGST (2B)',
    'IGST (PR)', 'IGST (2B)',
    'Status',
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
    headerRow[0] = `SUPPLIER: ${p.party || '— No name —'}   |   GSTIN: ${p.gstin || '—'}`;
    headerRow[detailHeaders.length - 2] = overall;
    headerRow[detailHeaders.length - 1] = `${p.invoices.length} invoices`;
    
    merges.push({ s: { r: startRowIdx, c: 0 }, e: { r: startRowIdx, c: detailHeaders.length - 3 } });
    detailRows.push(headerRow);

    for (const inv of p.invoices) {
      detailRows.push([
        String(inv['Invoice No (PR)'] ?? ''),
        String(inv['Invoice No (2B)'] ?? ''),
        formatDateStr(inv['Invoice Date (PR)']),
        formatDateStr(inv['Invoice Date (2B)']),
        numVal(inv['CGST (PR)']), numVal(inv['CGST (2B)']),
        numVal(inv['SGST (PR)']), numVal(inv['SGST (2B)']),
        numVal(inv['IGST (PR)']), numVal(inv['IGST (2B)']),
        String(inv['Status'] ?? ''),
      ]);
    }

    const subRow = Array(detailHeaders.length).fill('');
    subRow[0] = 'SUBTOTAL';
    subRow[4] = numVal(p.prCgst);
    subRow[5] = numVal(p.cgst2B);
    subRow[6] = numVal(p.prSgst);
    subRow[7] = numVal(p.sgst2B);
    subRow[8] = numVal(p.prIgst);
    subRow[9] = numVal(p.igst2B);
    
    const totalDiff = (p.prCgst - p.cgst2B) + (p.prSgst - p.sgst2B) + (p.prIgst - p.igst2B);
    subRow[10] = `Diff: ₹${Math.abs(totalDiff).toFixed(2)}`;
    
    const subRowIdx = detailRows.length + 3;
    merges.push({ s: { r: subRowIdx, c: 0 }, e: { r: subRowIdx, c: 3 } });
    subtotalRowIdxs.add(subRowIdx);
    detailRows.push(subRow);
    
    emptyRowIdxs.add(detailRows.length + 3);
    detailRows.push(Array(detailHeaders.length).fill(''));
  }
  if (detailRows.length > 0) detailRows.pop();

  const wsDetails = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(wsDetails, [detailHeaders, ...detailRows], { origin: 'A3' });
  addCorporateHeader(wsDetails, detailHeaders.length, companyName, 'Party Details');
  if (!wsDetails['!merges']) wsDetails['!merges'] = [];
  wsDetails['!merges'].push(...merges);
  wsDetails['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4' }];
  wsDetails['!cols'] = [
    { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 18 },
  ];
  
  if (!wsDetails['!rows']) wsDetails['!rows'] = [];
  wsDetails['!rows'][2] = { hpt: 24 };
  
  // Style header
  for (let c = 0; c < detailHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!wsDetails[addr]) continue;
    wsDetails[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
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
    wsDetails['!rows'][excelRow] = { hpt: isPartyHeader || isSubtotal ? 22 : 20 };

    const overall = isPartyHeader ? String(detailRows[r][detailHeaders.length - 2] || '') : '';
    const headerFill = PARTY_STATUS_HEADER[overall] || '1E3A5F';
    
    for (let c = 0; c < detailHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!wsDetails[addr]) continue;
      
      const isNumCol = c >= 4 && c <= 9;
      if (isNumCol && !isPartyHeader) {
        wsDetails[addr].t = 'n';
        wsDetails[addr].z = '0.00';
      }
      
      if (isPartyHeader) {
        wsDetails[addr].s = {
          fill: { fgColor: { rgb: headerFill } },
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
          alignment: { vertical: 'center', horizontal: c >= detailHeaders.length - 2 ? 'right' : 'left' },
        };
      } else if (isSubtotal) {
        wsDetails[addr].s = {
          fill: { fgColor: { rgb: 'F3F4F6' } },
          font: { sz: 10, bold: true },
          alignment: { vertical: 'center', horizontal: isNumCol ? 'right' : 'left' },
          border: { top: { style: 'thin', color: { rgb: 'D1D5DB' } }, bottom: { style: 'thin', color: { rgb: 'D1D5DB' } } },
          numFmt: isNumCol ? '0.00' : undefined,
        };
      } else {
        wsDetails[addr].s = {
          fill: { fgColor: { rgb: 'FFFFFF' } },
          font: { sz: 10 },
          alignment: { vertical: 'center', horizontal: isNumCol ? 'right' : 'left' },
          border: { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
          numFmt: isNumCol ? '0.00' : undefined,
        };
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, wsDetails, 'Party Details');

  // ---- Build 'Party Summary' with hyperlinks to anchor rows in 'Party Details' ----
  const sumHeaders = ['GSTIN', 'Party Name', 'Diff CGST (PR-2B)', 'Diff SGST (PR-2B)', 'Diff IGST (PR-2B)'];
  const sumData = parties.map((p) => [
    p.gstin || '',
    p.party || '',
    +(p.prCgst - p.cgst2B).toFixed(2),
    +(p.prSgst - p.sgst2B).toFixed(2),
    +(p.prIgst - p.igst2B).toFixed(2),
  ]);
  const wsSummary = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(wsSummary, [sumHeaders, ...sumData], { origin: 'A3' });
  addCorporateHeader(wsSummary, sumHeaders.length, companyName, 'Party Summary');
  wsSummary['!cols'] = autoFitCols(sumHeaders, sumData as (string | number)[][]);
  wsSummary['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4' }];

  if (!wsSummary['!rows']) wsSummary['!rows'] = [];
  wsSummary['!rows'][2] = { hpt: 24 };

  // Header style
  for (let c = 0; c < sumHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!wsSummary[addr]) continue;
    wsSummary[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
    };
  }

  // Data rows + hyperlinks on the Party Name cell
  for (let i = 0; i < parties.length; i++) {
    const excelRow = i + 3;
    const anchor = partyAnchorRow[i]; // 1-indexed Excel row in Party Details
    wsSummary['!rows'][excelRow] = { hpt: 20 };
    
    for (let c = 0; c < sumHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!wsSummary[addr]) continue;
      if (c >= 2) {
        wsSummary[addr].t = 'n';
        wsSummary[addr].z = '0.00';
      }
      const baseStyle: Record<string, unknown> = {
        fill: { fgColor: { rgb: excelRow % 2 === 0 ? 'F9FAFB' : 'FFFFFF' } },
        font: { sz: 10 },
        alignment: { vertical: 'center', horizontal: c >= 2 ? 'right' : 'left' },
        border: { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
        numFmt: c >= 2 ? '0.00' : undefined,
      };
      wsSummary[addr].s = baseStyle;
    }
    // Apply hyperlink to Party Name (column B = index 1)
    const linkAddr = XLSX.utils.encode_cell({ r: excelRow, c: 1 });
    if (wsSummary[linkAddr]) {
      wsSummary[linkAddr].l = {
        Target: `#'Party Details'!A${anchor}`,
        Tooltip: `Jump to ${parties[i].party || parties[i].gstin} in Party Details`,
      };
      wsSummary[linkAddr].s = {
        fill: { fgColor: { rgb: excelRow % 2 === 0 ? 'F9FAFB' : 'FFFFFF' } },
        font: { sz: 10, color: { rgb: '1D4ED8' }, underline: true },
        alignment: { vertical: 'center', horizontal: 'left' },
        border: { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
      };
    }
  }

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Party Summary');
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
}

export function exportMonthlyComparison(
  rows: MonthlyComparisonRow[],
  filename: string,
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] },
  companyName?: string
) {
  const wb = XLSX.utils.book_new();

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
    
  appendExecutiveSummary(wb, companyName, 'Monthly Comparison', [
    { label: 'Total Records Analysed', value: rows.length },
    { label: 'Net Tax Difference', value: `₹${totalDiff.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ], breakdown);

  const headers = [
    'Party Name (Tally)', 'GST No (Tally)', 'Invoice No (Tally)',
    'CGST (Tally)', 'SGST (Tally)', 'IGST (Tally)',
    'Party Name (Comparison)', 'GST No (Comparison)', 'Invoice No (Comparison)',
    'CGST (Comparison)', 'SGST (Comparison)', 'IGST (Comparison)',
    'Match Status', 'Total Difference',
    'ITC Eligibility', 'GSTR-1 Status', 'Filing Date',
    'Days Old', 'Tax Rate %', 'POS Compliance', 'Rule 37 Warning', 'Remark',
  ];
  const data = rows.map((r) => [
    r.partyTally, r.gstinTally, r.invoiceTally, r.cgstTally, r.sgstTally, r.igstTally,
    r.partyCmp, r.gstinCmp, r.invoiceCmp, r.cgstCmp, r.sgstCmp, r.igstCmp,
    r.status, r.totalDiff,
    r.itcEligibility ?? '', r.gstr1Status ?? '', r.filingDate ?? '',
    r.daysOld ?? '', r.taxRatePct ?? '', r.posCompliance ?? '', r.rule37Warning ?? '', r.remark ?? '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(ws, [headers, ...data], { origin: 'A3' });
  addCorporateHeader(ws, headers.length, companyName, 'Monthly Comparison');

  // Column widths
  ws['!cols'] = [
    { wch: 28 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 28 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 18 }, { wch: 16 },
    { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 11 }, { wch: 22 }, { wch: 30 }, { wch: 36 },
  ];
  ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4' }];

  if (!ws['!rows']) ws['!rows'] = [];
  ws['!rows'][2] = { hpt: 24 };

  // Header style: split Tally (blue) and Comparison (teal)
  const headerStyle = (fill: string) => ({
    fill: { fgColor: { rgb: fill } },
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
  });
  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!ws[addr]) continue;
    let fill = '1E3A5F';
    if (c >= 6 && c < 12) fill = '0D7A5F';
    else if (c === 12) fill = '4B5563';
    else if (c === 13) fill = 'B45309';
    else if (c >= 14) fill = '6D28D9';
    ws[addr].s = headerStyle(fill);
  }

  // Per-row tint by status
  const statusFill: Record<string, string> = {
    'Perfect Match': 'E6F5ED',
    'Value Mismatch': 'FEF3C7',
    'Not in 2B': 'FEE2E2',
    'Unmatched Vendor': 'FEE2E2',
    'Missing in PR': 'DBEAFE',
    'Not in Books': 'DBEAFE',
  };

  for (let r = 1; r <= rows.length; r++) {
    const status = rows[r - 1].status;
    const tint = statusFill[status] || (r % 2 === 0 ? 'F9FAFB' : 'FFFFFF');
    ws['!rows'][r + 2] = { hpt: 20 };
    for (let c = 0; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: r + 2, c });
      if (!ws[addr]) continue;
      ws[addr].s = {
        fill: { fgColor: { rgb: tint } },
        font: { sz: 10, bold: c === 12 },
        alignment: { vertical: 'center', horizontal: c >= 3 && c <= 5 || c >= 9 && c <= 11 || c === 13 ? 'right' : 'left' },
        border: { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
      };
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Monthly Comparison');

  // ---- Sheet 2: Party-wise Summary (grouped by GSTIN + Party Name) ----
  type PartyAgg = {
    gstin: string; party: string;
    prCgst: number; prSgst: number; prIgst: number;
    cgst2B: number; sgst2B: number; igst2B: number;
  };
  const partyMap = new Map<string, PartyAgg>();
  const num = (v: number | string) => (typeof v === 'number' ? v : 0);

  for (const r of rows) {
    // PR side
    const prKey = `${(r.gstinTally || '').toUpperCase().trim()}||${(r.partyTally || '').trim().toUpperCase()}`;
    if (r.partyTally || r.gstinTally) {
      let p = partyMap.get(prKey);
      if (!p) {
        p = { gstin: r.gstinTally || '', party: r.partyTally || '', prCgst: 0, prSgst: 0, prIgst: 0, cgst2B: 0, sgst2B: 0, igst2B: 0 };
        partyMap.set(prKey, p);
      }
      p.prCgst += num(r.cgstTally); p.prSgst += num(r.sgstTally); p.prIgst += num(r.igstTally);
    }
    // 2B side
    const cmpKey = `${(r.gstinCmp || '').toUpperCase().trim()}||${(r.partyCmp || '').trim().toUpperCase()}`;
    if (r.partyCmp || r.gstinCmp) {
      let p = partyMap.get(cmpKey);
      if (!p) {
        p = { gstin: r.gstinCmp || '', party: r.partyCmp || '', prCgst: 0, prSgst: 0, prIgst: 0, cgst2B: 0, sgst2B: 0, igst2B: 0 };
        partyMap.set(cmpKey, p);
      }
      if (!p.party && r.partyCmp) p.party = r.partyCmp;
      if (!p.gstin && r.gstinCmp) p.gstin = r.gstinCmp;
      p.cgst2B += num(r.cgstCmp); p.sgst2B += num(r.sgstCmp); p.igst2B += num(r.igstCmp);
    }
  }

  const pwHeaders = [
    'GST No.', 'Party Name',
    'PR CGST', 'PR SGST', 'PR IGST',
    '2B CGST', '2B SGST', '2B IGST',
    'Diff CGST (PR-2B)', 'Diff SGST (PR-2B)', 'Diff IGST (PR-2B)',
  ];
  const partyList = Array.from(partyMap.values()).sort((a, b) =>
    (a.party || a.gstin).localeCompare(b.party || b.gstin)
  );
  const pwData = partyList.map((p) => [
    p.gstin, p.party,
    +p.prCgst.toFixed(2), +p.prSgst.toFixed(2), +p.prIgst.toFixed(2),
    +p.cgst2B.toFixed(2), +p.sgst2B.toFixed(2), +p.igst2B.toFixed(2),
    +(p.prCgst - p.cgst2B).toFixed(2),
    +(p.prSgst - p.sgst2B).toFixed(2),
    +(p.prIgst - p.igst2B).toFixed(2),
  ]);
  // Grand total row
  const gt = partyList.reduce(
    (a, p) => {
      a.prCgst += p.prCgst; a.prSgst += p.prSgst; a.prIgst += p.prIgst;
      a.cgst2B += p.cgst2B; a.sgst2B += p.sgst2B; a.igst2B += p.igst2B;
      return a;
    },
    { prCgst: 0, prSgst: 0, prIgst: 0, cgst2B: 0, sgst2B: 0, igst2B: 0 }
  );
  pwData.push([
    '', 'GRAND TOTAL',
    +gt.prCgst.toFixed(2), +gt.prSgst.toFixed(2), +gt.prIgst.toFixed(2),
    +gt.cgst2B.toFixed(2), +gt.sgst2B.toFixed(2), +gt.igst2B.toFixed(2),
    +(gt.prCgst - gt.cgst2B).toFixed(2),
    +(gt.prSgst - gt.sgst2B).toFixed(2),
    +(gt.prIgst - gt.igst2B).toFixed(2),
  ]);

  const pwWs = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(pwWs, [pwHeaders, ...pwData], { origin: 'A3' });
  addCorporateHeader(pwWs, pwHeaders.length, companyName, 'Party-wise Summary');
  pwWs['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4' }];
  pwWs['!cols'] = [
    { wch: 18 }, { wch: 32 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 16 }, { wch: 16 }, { wch: 16 },
  ];
  
  if (!pwWs['!rows']) pwWs['!rows'] = [];
  pwWs['!rows'][2] = { hpt: 24 };
  
  for (let c = 0; c < pwHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!pwWs[addr]) continue;
    let fill = '1E3A5F';
    if (c >= 2 && c <= 4) fill = '1E3A5F';
    else if (c >= 5 && c <= 7) fill = '0D7A5F';
    else if (c >= 8) fill = 'B45309';
    pwWs[addr].s = {
      fill: { fgColor: { rgb: fill } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
    };
  }
  const lastRow = pwData.length;
  for (let r = 1; r <= lastRow; r++) {
    const isTotal = r === lastRow;
    pwWs['!rows'][r + 2] = { hpt: 20 };
    for (let c = 0; c < pwHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: r + 2, c });
      if (!pwWs[addr]) continue;
      pwWs[addr].s = {
        fill: { fgColor: { rgb: isTotal ? 'E5E7EB' : (r % 2 === 0 ? 'F9FAFB' : 'FFFFFF') } },
        font: { sz: 10, bold: isTotal },
        alignment: { vertical: 'center', horizontal: c >= 2 ? 'right' : 'left' },
        border: { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
      };
    }
  }
  XLSX.utils.book_append_sheet(wb, pwWs, 'Party-wise Summary');

  // ---- Sheet 3: Monthly Tax Comparison (6-table FY layout w/ Debit Notes) ----
  {
    const FY_MONTHS = ['April','May','June','July','August','September','October','November','December','January','February','March'];
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
    // 0: top main header "INPUT TAX CREDIT" merged across all
    // 1: per-table titles (Purchase / AS PER GSTR-2B / DIFFERENCE)
    // 2: column headers
    // 3..14: 12 months
    // 15: TOTAL
    // 16: visual separator (colored row, blank)
    // 17: bottom main header "BOOKS RECONCILIATION" merged
    // 18: per-table titles (PURCHASE / DEBIT NOTE / TOTAL PURCHASE AS PER TALLY)
    // 19: column headers
    // 20..31: 12 months
    // 32: TOTAL
    const ROWS = 33;
    const SHIFT = 2;
    const grid: (string | number | null)[][] = Array.from({ length: ROWS + SHIFT }, () => Array(COLS).fill(null));
    const merges: XLSX.Range[] = [];

    const colStarts = [0, TABLE_W + GAP, (TABLE_W + GAP) * 2]; // 0, 6, 12

    const fillTable = (titleRow: number, hdrRow: number, dataStart: number, totalRow: number, startCol: number, title: string, data: MAgg[]) => {
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
        const c = data[i].cgst, s = data[i].sgst, ig = data[i].igst;
        grid[row][startCol] = FY_MONTHS[i];
        grid[row][startCol + 1] = r2(c);
        grid[row][startCol + 2] = r2(s);
        grid[row][startCol + 3] = r2(ig);
        grid[row][startCol + 4] = r2(c + s + ig);
        tc += c; ts += s; ti += ig;
      }
      grid[totalRow][startCol] = 'TOTAL';
      grid[totalRow][startCol + 1] = r2(tc);
      grid[totalRow][startCol + 2] = r2(ts);
      grid[totalRow][startCol + 3] = r2(ti);
      grid[totalRow][startCol + 4] = r2(tc + ts + ti);
    };

    // TOP section
    grid[0][0] = 'INPUT TAX CREDIT';
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 1 } });
    fillTable(1, 2, 3, 15, colStarts[0], 'Purchase', prNet);
    fillTable(1, 2, 3, 15, colStarts[1], 'AS PER GSTR-2B', tbNet);
    fillTable(1, 2, 3, 15, colStarts[2], 'DIFFERENCE', diffNet);

    // Separator row (16) - leave blank, styled below

    // BOTTOM section
    grid[17][0] = 'BOOKS RECONCILIATION';
    merges.push({ s: { r: 17, c: 0 }, e: { r: 17, c: COLS - 1 } });
    fillTable(18, 19, 20, 32, colStarts[0], 'PURCHASE', prGross);
    fillTable(18, 19, 20, 32, colStarts[1], 'DEBIT NOTE', prDN);
    fillTable(18, 19, 20, 32, colStarts[2], 'TOTAL PURCHASE AS PER TALLY', prNet);

    const mtcWs = XLSX.utils.aoa_to_sheet(grid as (string | number)[][]);
    addCorporateHeader(mtcWs, COLS, companyName, 'Monthly Tax Comparison');
    if (!mtcWs['!merges']) mtcWs['!merges'] = [];
    mtcWs['!merges'].push(...merges);
    mtcWs['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 4, topLeftCell: 'A5' }];
    mtcWs['!cols'] = Array.from({ length: COLS }, (_, c) => {
      // gap cols
      if (c === TABLE_W || c === TABLE_W * 2 + GAP) return { wch: 3 };
      const off = c < TABLE_W ? c : c < TABLE_W * 2 + GAP ? c - TABLE_W - GAP : c - TABLE_W * 2 - GAP * 2;
      return { wch: off === 0 ? 14 : 13 };
    });

    const titleFillsTop: Record<string, string> = { 'Purchase': '1E3A5F', 'AS PER GSTR-2B': '0D7A5F', 'DIFFERENCE': 'B45309' };
    const titleFillsBot: Record<string, string> = { 'PURCHASE': '1E3A5F', 'DEBIT NOTE': 'B45309', 'TOTAL PURCHASE AS PER TALLY': '0D7A5F' };

    const isGapCol = (c: number) => c === TABLE_W || c === TABLE_W * 2 + GAP;
    const tableForCol = (c: number) => c < TABLE_W ? 0 : c < TABLE_W * 2 + GAP ? 1 : 2;
    const colOffsetIn = (c: number) => c - colStarts[tableForCol(c)];

    const sectionMap = (r: number): { titleRow: number; hdrRow: number; totalRow: number; titles: string[]; mainRow: number } | null => {
      const shiftedR = r - SHIFT;
      if (shiftedR >= 0 && shiftedR <= 15) return { mainRow: 0+SHIFT, titleRow: 1+SHIFT, hdrRow: 2+SHIFT, totalRow: 15+SHIFT, titles: ['Purchase','AS PER GSTR-2B','DIFFERENCE'] };
      if (shiftedR >= 17 && shiftedR <= 32) return { mainRow: 17+SHIFT, titleRow: 18+SHIFT, hdrRow: 19+SHIFT, totalRow: 32+SHIFT, titles: ['PURCHASE','DEBIT NOTE','TOTAL PURCHASE AS PER TALLY'] };
      return null;
    };

    for (let r = 0; r < ROWS + SHIFT; r++) {
      if (!mtcWs['!rows']) mtcWs['!rows'] = [];
      
      for (let c = 0; c < COLS; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (r < SHIFT) continue; // corporate header rows
        // Separator row 16+SHIFT: paint all cells
        if (r === 16 + SHIFT) {
          if (!mtcWs[addr]) mtcWs[addr] = { t: 's', v: '' };
          mtcWs[addr].s = { fill: { fgColor: { rgb: '111827' } } };
          continue;
        }
        if (!mtcWs[addr]) continue;
        const sec = sectionMap(r);
        if (!sec) continue;
        mtcWs['!rows'][r] = { hpt: r === sec.mainRow ? 26 : (r === sec.titleRow || r === sec.hdrRow ? 24 : 20) };
        if (r === sec.mainRow) {
          mtcWs[addr].s = {
            fill: { fgColor: { rgb: '0F172A' } },
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 13 },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
          };
          continue;
        }
        if (isGapCol(c)) continue;
        const tIdx = tableForCol(c);
        const title = sec.titles[tIdx];
        if (r === sec.titleRow) {
          const fillMap = sec.mainRow === 0 ? titleFillsTop : titleFillsBot;
          mtcWs[addr].s = {
            fill: { fgColor: { rgb: fillMap[title] || '1E3A5F' } },
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
          };
        } else if (r === sec.hdrRow) {
          mtcWs[addr].s = {
            fill: { fgColor: { rgb: '374151' } },
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
          };
        } else {
          const isTotal = r === sec.totalRow;
          const off = colOffsetIn(c);
          mtcWs[addr].s = {
            fill: { fgColor: { rgb: isTotal ? 'E5E7EB' : (r % 2 === 0 ? 'FFFFFF' : 'F9FAFB') } },
            font: { sz: 10, bold: isTotal || off === 0 },
            alignment: { vertical: 'center', horizontal: off === 0 ? 'left' : 'right' },
            border: { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
          };
          if (off >= 1) (mtcWs[addr] as XLSX.CellObject).z = '#,##0.00';
        }
      }
    }
    // Set row height for separator
    if (!mtcWs['!rows']) mtcWs['!rows'] = [];
    mtcWs['!rows'][16 + SHIFT] = { hpt: 8 };

    XLSX.utils.book_append_sheet(wb, mtcWs, 'Monthly Tax Comparison');
  }

  // ---- Sheet 4: Monthly Tax Comparison (FY layout: 2B | JV+Purchase | Difference) ----
  {
    const FY_MONTHS = ['April','May','June','July','August','September','October','November','December','January','February','March'];
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
    const totalRows = 12 + 2; // header (incl merged title) + 12 months + total => actually 1 title + 1 header + 12 + 1 total = 15

    // Build AOA grid: 3 tables of 4 cols each, separated by 1 blank col -> 14 cols
    const COLS = 4 * 3 + 2; // 14
    const rowsCount = 1 + 1 + 12 + 1; // title, header, 12 months, total
    const SHIFT = 2;
    const grid: (string | number | null)[][] = Array.from({ length: rowsCount + SHIFT }, () => Array(COLS).fill(null));

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
        grid[row][t.startCol] = FY_MONTHS[i];
        grid[row][t.startCol + 1] = r2(t.data[i].cgst);
        grid[row][t.startCol + 2] = r2(t.data[i].sgst);
        grid[row][t.startCol + 3] = r2(t.data[i].igst);
        tc += t.data[i].cgst; ts += t.data[i].sgst; ti += t.data[i].igst;
      }
      const totalRow = 2 + 12 + SHIFT;
      grid[totalRow][t.startCol] = 'TOTAL';
      grid[totalRow][t.startCol + 1] = r2(tc);
      grid[totalRow][t.startCol + 2] = r2(ts);
      grid[totalRow][t.startCol + 3] = r2(ti);
    }

    const mWs = XLSX.utils.aoa_to_sheet(grid as (string | number)[][]);
    addCorporateHeader(mWs, COLS, companyName, 'Monthly Tax Comparison FY');
    if (!mWs['!merges']) mWs['!merges'] = [];
    mWs['!merges'].push(...merges);
    mWs['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 4, topLeftCell: 'A5' }];
    mWs['!cols'] = Array.from({ length: COLS }, (_, c) => ({ wch: (c === 4 || c === 9) ? 3 : (c % 5 === 0 ? 14 : 13) }));

    const titleFills: Record<string, string> = { '2B': '0D7A5F', 'JV+Purchase': '1E3A5F', 'Difference': 'B45309' };
    const totalRowIdx = 2 + 12 + SHIFT;

    for (let r = 0; r < rowsCount + SHIFT; r++) {
      if (!mWs['!rows']) mWs['!rows'] = [];
      mWs['!rows'][r] = { hpt: r === 0 + SHIFT ? 26 : (r === 1 + SHIFT ? 24 : 20) };
      
      for (let c = 0; c < COLS; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!mWs[addr]) continue;
        if (r < SHIFT) continue;
        const inGap = (c === 4 || c === 9);
        if (inGap) continue;
        const tableIdx = c < 4 ? 0 : c < 9 ? 1 : 2;
        const table = tables[tableIdx];
        if (r === 0 + SHIFT) {
          mWs[addr].s = {
            fill: { fgColor: { rgb: titleFills[table.title] } },
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
          };
        } else if (r === 1 + SHIFT) {
          mWs[addr].s = {
            fill: { fgColor: { rgb: '374151' } },
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
          };
        } else {
          const isTotal = r === totalRowIdx;
          const colOffset = c - table.startCol;
          mWs[addr].s = {
            fill: { fgColor: { rgb: isTotal ? 'E5E7EB' : (r % 2 === 0 ? 'FFFFFF' : 'F9FAFB') } },
            font: { sz: 10, bold: isTotal || colOffset === 0 },
            alignment: { vertical: 'center', horizontal: colOffset === 0 ? 'left' : 'right' },
            border: { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
          };
          if (colOffset >= 1) (mWs[addr] as XLSX.CellObject).z = '#,##0.00';
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, mWs, 'Monthly Tax Comparison FY');
  }

  XLSX.writeFile(wb, filename);
}

// --- Party-wise Report ---
import type { PartySummary } from './partyWise';

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

export function exportPartyWise(parties: PartySummary[], filename: string, companyName?: string) {
  const wb = XLSX.utils.book_new();

  // Add Executive Summary
  const counts: Record<string, number> = {};
  let totalDiff = 0;
  for (const p of parties) {
    counts[p.overall] = (counts[p.overall] || 0) + 1;
    totalDiff += p.totals.totalDiff;
  }
  const breakdown = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([st, c]) => ({ label: st, value: c }));
    
  appendExecutiveSummary(wb, companyName, 'Party-wise Summary', [
    { label: 'Total Parties Analysed', value: parties.length },
    { label: 'Net Tax Difference', value: `₹${totalDiff.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ], breakdown);

  // ---- Sheet 1: Party Summary ----
  const summaryHeaders = [
    'Party Name', 'GSTIN', 'Invoices',
    'Perfect', 'Mismatch', 'Inv Missing', 'Unmatched Vendor', 'Not in Books',
    'IGST (PR)', 'IGST (2B)', 'IGST Diff',
    'CGST (PR)', 'CGST (2B)', 'CGST Diff',
    'SGST (PR)', 'SGST (2B)', 'SGST Diff',
    'Total Diff', 'Overall Status',
  ];
  const summaryData = parties.map((p) => [
    p.partyName, p.gstin, p.totals.count,
    p.totals.perfectMatch, p.totals.valueMismatch,
    p.totals.invoiceMissing, p.totals.unmatchedVendor, p.totals.missingInPR,
    p.totals.igstPR, p.totals.igst2B, p.totals.igstDiff,
    p.totals.cgstPR, p.totals.cgst2B, p.totals.cgstDiff,
    p.totals.sgstPR, p.totals.sgst2B, p.totals.sgstDiff,
    p.totals.totalDiff, p.overall,
  ]);

  // Bold totals row
  const grand = parties.reduce(
    (acc, p) => {
      acc.count += p.totals.count;
      acc.igstPR += p.totals.igstPR; acc.igst2B += p.totals.igst2B; acc.igstDiff += p.totals.igstDiff;
      acc.cgstPR += p.totals.cgstPR; acc.cgst2B += p.totals.cgst2B; acc.cgstDiff += p.totals.cgstDiff;
      acc.sgstPR += p.totals.sgstPR; acc.sgst2B += p.totals.sgst2B; acc.sgstDiff += p.totals.sgstDiff;
      acc.totalDiff += p.totals.totalDiff;
      return acc;
    },
    { count: 0, igstPR: 0, igst2B: 0, igstDiff: 0, cgstPR: 0, cgst2B: 0, cgstDiff: 0, sgstPR: 0, sgst2B: 0, sgstDiff: 0, totalDiff: 0 }
  );
  const totalsRow = [
    'GRAND TOTAL', '', grand.count, '', '', '', '', '',
    +grand.igstPR.toFixed(2), +grand.igst2B.toFixed(2), +grand.igstDiff.toFixed(2),
    +grand.cgstPR.toFixed(2), +grand.cgst2B.toFixed(2), +grand.cgstDiff.toFixed(2),
    +grand.sgstPR.toFixed(2), +grand.sgst2B.toFixed(2), +grand.sgstDiff.toFixed(2),
    +grand.totalDiff.toFixed(2), '',
  ];

  const ws1 = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(ws1, [summaryHeaders, ...summaryData, totalsRow], { origin: 'A3' });
  addCorporateHeader(ws1, summaryHeaders.length, companyName, 'Party Summary');
  ws1['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4' }];
  ws1['!cols'] = [
    { wch: 30 }, { wch: 18 }, { wch: 9 },
    { wch: 9 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 16 },
  ];

  if (!ws1['!rows']) ws1['!rows'] = [];
  ws1['!rows'][2] = { hpt: 24 };

  // Header style
  for (let c = 0; c < summaryHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!ws1[addr]) continue;
    ws1[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
    };
  }

  // Data rows colored by overall status
  for (let r = 1; r <= parties.length; r++) {
    const overall = parties[r - 1].overall;
    const fill = PARTY_STATUS_FILL[overall] || 'FFFFFF';
    ws1['!rows'][r + 2] = { hpt: 20 };
    for (let c = 0; c < summaryHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: r + 2, c });
      if (!ws1[addr]) continue;
      ws1[addr].s = {
        fill: { fgColor: { rgb: fill } },
        font: { sz: 10, bold: c === summaryHeaders.length - 1 },
        alignment: { vertical: 'center', horizontal: c >= 2 && c < summaryHeaders.length - 1 ? 'right' : 'left' },
        border: { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
      };
    }
  }

  // Grand total row
  const totalsRowIdx = parties.length + 3;
  for (let c = 0; c < summaryHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: totalsRowIdx, c });
    if (!ws1[addr]) continue;
    ws1[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      alignment: { vertical: 'center', horizontal: c >= 2 ? 'right' : 'left' },
      border: { top: { style: 'thin', color: { rgb: '000000' } } },
    };
  }

  XLSX.utils.book_append_sheet(wb, ws1, 'Party Summary');

  // ---- Sheet 2: Party Details ----
  const detailHeaders = [
    'Inv No (PR)', 'Inv No (2B)',
    'Date (PR)', 'Date (2B)',
    'IGST (PR)', 'IGST (2B)',
    'CGST (PR)', 'CGST (2B)',
    'SGST (PR)', 'SGST (2B)',
    'Status',
    'ITC Eligibility', 'GSTR-1 Status', 'Filing Date',
    'Days Old', 'Tax Rate %', 'POS Compliance', 'Rule 37 Warning',
    'Remark',
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
    headerRow[0] = `SUPPLIER: ${p.partyName || '— No name —'}   |   GSTIN: ${p.gstin || '—'}`;
    headerRow[NUM_DETAIL_COLS - 2] = p.overall;
    headerRow[NUM_DETAIL_COLS - 1] = `${p.totals.count} invoices`;
    
    merges.push({ s: { r: startRowIdx, c: 0 }, e: { r: startRowIdx, c: NUM_DETAIL_COLS - 3 } });
    detailRows.push(headerRow);
    
    for (const inv of p.invoices) {
      detailRows.push([
        inv.invoiceNoPR, inv.invoiceNo2B,
        inv.invoiceDatePR, inv.invoiceDate2B,
        numVal(inv.igstPR), numVal(inv.igst2B),
        numVal(inv.cgstPR), numVal(inv.cgst2B),
        numVal(inv.sgstPR), numVal(inv.sgst2B),
        inv.status,
        inv.itcEligibility ?? '', inv.gstr1Status ?? '', inv.filingDate ?? '',
        (inv.daysOld ?? '') as string | number,
        (inv.taxRatePct ?? '') as string | number,
        inv.posCompliance ?? '', inv.rule37Warning ?? '',
        inv.remark || '',
      ]);
    }
    
    const subRow: (string | number)[] = Array(NUM_DETAIL_COLS).fill('');
    subRow[0] = 'SUBTOTAL';
    subRow[4] = numVal(p.totals.igstPR);
    subRow[5] = numVal(p.totals.igst2B);
    subRow[6] = numVal(p.totals.cgstPR);
    subRow[7] = numVal(p.totals.cgst2B);
    subRow[8] = numVal(p.totals.sgstPR);
    subRow[9] = numVal(p.totals.sgst2B);
    subRow[10] = `Diff: ₹${p.totals.totalDiff.toFixed(2)}`;
    
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
  addCorporateHeader(ws2, detailHeaders.length, companyName, 'Party Details');
  if (!ws2['!merges']) ws2['!merges'] = [];
  ws2['!merges'].push(...merges);
  ws2['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4' }];
  ws2['!cols'] = [
    { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 18 },
    { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 11 }, { wch: 22 }, { wch: 30 },
    { wch: 36 },
  ];
  
  if (!ws2['!rows']) ws2['!rows'] = [];
  ws2['!rows'][2] = { hpt: 24 };
  
  for (let c = 0; c < detailHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!ws2[addr]) continue;
    ws2[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
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
    ws2['!rows'][excelRow] = { hpt: isSubtotal ? 22 : 20 };

    for (let c = 0; c < detailHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!ws2[addr]) continue;
      
      const isNumCol = c >= 4 && c <= 9;
      if (isNumCol && !isSubtotal) {
        ws2[addr].t = 'n';
        ws2[addr].z = '0.00';
      }
      
      ws2[addr].s = {
        fill: { fgColor: { rgb: isSubtotal ? 'F3F4F6' : 'FFFFFF' } },
        font: { sz: 10, bold: isSubtotal },
        alignment: { vertical: 'center', horizontal: isNumCol ? 'right' : 'left' },
        border: { bottom: { style: 'hair', color: { rgb: 'E5E7EB' } }, top: isSubtotal ? { style: 'thin', color: { rgb: 'D1D5DB' } } : undefined },
        numFmt: isNumCol ? '0.00' : undefined,
      };
    }
  }

  XLSX.utils.book_append_sheet(wb, ws2, 'Party Details');
  XLSX.writeFile(wb, filename);
}
