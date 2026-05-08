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
}

const KNOWN_HEADERS: Record<keyof ColumnMapping, string[]> = {
  supplierName: ['supplier name', 'party name', 'vendor name', 'name of supplier', 'supplier'],
  gstin: ['gstin', 'gstin of supplier', 'gstin/uin', 'supplier gstin', 'gstin no'],
  invoiceNo: ['invoice no', 'invoice number', 'inv no', 'bill no', 'document number', 'invoice no.'],
  invoiceDate: ['invoice date', 'inv date', 'bill date', 'document date', 'invoice dt'],
  igst: ['igst', 'integrated tax', 'igst amount', 'igst amt'],
  cgst: ['cgst', 'central tax', 'cgst amount', 'cgst amt'],
  sgst: ['sgst', 'state tax', 'sgst amount', 'sgst amt', 'utgst'],
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
  source: 'PR' | '2B'
): InvoiceRecord[] {
  return rows.map((row) => ({
    supplierName: String(row[mapping.supplierName] || ''),
    gstin: String(row[mapping.gstin] || ''),
    invoiceNo: String(row[mapping.invoiceNo] || ''),
    invoiceDate: String(row[mapping.invoiceDate] || ''),
    igst: Number(row[mapping.igst]) || 0,
    cgst: Number(row[mapping.cgst]) || 0,
    sgst: Number(row[mapping.sgst]) || 0,
    source,
  }));
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

function applySheetStyles(
  ws: XLSX.WorkSheet,
  style: StatusStyle,
  rowCount: number,
  opts?: { dateCols?: number[]; numberCols?: number[]; colWidths?: { wch: number }[] }
) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const colCount = range.e.c + 1;

  ws['!cols'] = opts?.colWidths ?? Array.from({ length: colCount }, (_, i) => ({
    wch: i === 0 ? 14 : i <= 2 ? 20 : 18,
  }));

  const dateCols = new Set(opts?.dateCols ?? []);
  const numberCols = new Set(opts?.numberCols ?? []);

  // Header row
  for (let c = 0; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
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
    for (let c = 0; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
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
    'Status', 'GSTIN', 'Supplier Name',
    'Invoice No (PR)', 'Invoice No (2B)',
    'Invoice Date (PR)', 'Invoice Date (2B)',
    'IGST (PR)', 'IGST (2B)',
    'CGST (PR)', 'CGST (2B)',
    'SGST (PR)', 'SGST (2B)',
    'GST Diff', 'Remark',
  ];
  return { cols, data: records.map((r) => cols.map((c) => r[c] ?? '')) };
}

export function exportToXlsx(results: Record<string, unknown>[], filename: string) {
  const wb = XLSX.utils.book_new();

  // 1. "All Records" summary sheet
  const allWs = XLSX.utils.json_to_sheet(results);
  applySheetStyles(allWs, DEFAULT_STYLE, results.length, {
    colWidths: autoFitCols(
      Object.keys(results[0] ?? {}),
      results.map((r) => Object.values(r) as (string | number)[])
    ),
  });
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
    const g = String(r['GSTIN'] || '').toUpperCase().trim();
    const n = String(r['Supplier Name'] || '').trim().toUpperCase();
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
    if (status === 'Missing in 2B' || status === 'Missing in PR') {
      rows = rows.filter(partyHasNetDiff);
      if (rows.length === 0) continue;
    }
    const { cols, data } = buildSheetRows(rows);
    const ws = XLSX.utils.aoa_to_sheet([cols, ...data]);
    const style = STATUS_STYLES[status] || DEFAULT_STYLE;
    applySheetStyles(ws, style, rows.length, {
      dateCols: [5, 6],
      numberCols: [7, 8, 9, 10, 11, 12, 13],
      colWidths: autoFitCols(cols, data as (string | number)[][]),
    });
    const sheetName = status.length > 31 ? status.slice(0, 31) : status;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  // 3. Party-wise sheets ('Party Summary' + 'Party Details') with internal hyperlinks
  appendPartyWiseSheets(wb, results);

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
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }
  return 0;
};

function deriveOverallStatus(statuses: Set<string>): string {
  if (statuses.has('Missing in 2B') || statuses.has('Missing in PR') || statuses.has('Wrong GSTIN')) return 'Has Missing';
  if (statuses.has('Mismatch') || statuses.has('Name Mismatch') || statuses.has('Possible Match') || statuses.has('Name Matched (No GSTIN)')) return 'Has Mismatches';
  return 'All Matched';
}

function appendPartyWiseSheets(wb: XLSX.WorkBook, results: Record<string, unknown>[]) {
  // Group by GSTIN (fallback to Supplier Name)
  const map = new Map<string, PartyAccum>();
  for (const r of results) {
    const gstin = String(r['GSTIN'] || '').toUpperCase().trim();
    const party = String(r['Supplier Name'] || '').trim();
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
    'Party / Invoice', 'GSTIN',
    'Inv No (PR)', 'Inv No (2B)',
    'Date (PR)', 'Date (2B)',
    'CGST (PR)', 'CGST (2B)',
    'SGST (PR)', 'SGST (2B)',
    'IGST (PR)', 'IGST (2B)',
    'Status',
  ];
  const detailRows: (string | number)[][] = [];
  const partyAnchorRow: number[] = []; // 1-indexed Excel row of each party's header

  for (const p of parties) {
    const overall = deriveOverallStatus(p.statuses);
    // +2: header row is row 1, plus length so far gives next row index
    partyAnchorRow.push(detailRows.length + 2);
    detailRows.push([
      p.party || '— No name —', p.gstin || '',
      '', '', '', '', '', '', '', '', '', '', overall,
    ]);
    for (const inv of p.invoices) {
      detailRows.push([
        '', '',
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
    detailRows.push([
      'Subtotal', '', '', '', '', '',
      +p.prCgst.toFixed(2), +p.cgst2B.toFixed(2),
      +p.prSgst.toFixed(2), +p.sgst2B.toFixed(2),
      +p.prIgst.toFixed(2), +p.igst2B.toFixed(2),
      '',
    ]);
  }

  const wsDetails = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]);
  wsDetails['!cols'] = autoFitCols(detailHeaders, detailRows);
  // Style header
  for (let c = 0; c < detailHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (!wsDetails[addr]) continue;
    wsDetails[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
    };
  }
  // Style party header rows + invoice/subtotal rows
  const anchorSet = new Set(partyAnchorRow.map((r) => r - 1)); // 0-indexed within detailRows
  for (let r = 0; r < detailRows.length; r++) {
    const excelRow = r + 1; // header occupies row 0
    const isPartyHeader = anchorSet.has(r);
    const isSubtotal = detailRows[r][0] === 'Subtotal';
    const overall = isPartyHeader ? String(detailRows[r][12] || '') : '';
    const headerFill = PARTY_STATUS_HEADER[overall] || '1E3A5F';
    for (let c = 0; c < detailHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!wsDetails[addr]) continue;
      const isNumCol = c >= 6 && c <= 11;
      if (isNumCol && !isPartyHeader) {
        wsDetails[addr].t = 'n';
        wsDetails[addr].z = '0.00';
      }
      if (isPartyHeader) {
        wsDetails[addr].s = {
          fill: { fgColor: { rgb: headerFill } },
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
          alignment: { vertical: 'center', horizontal: c >= 6 && c <= 11 ? 'right' : 'left' },
        };
      } else if (isSubtotal) {
        wsDetails[addr].s = {
          fill: { fgColor: { rgb: 'F3F4F6' } },
          font: { sz: 10, bold: true },
          alignment: { vertical: 'center', horizontal: c >= 6 && c <= 11 ? 'right' : 'left' },
          border: { top: { style: 'thin', color: { rgb: 'D1D5DB' } } },
          numFmt: isNumCol ? '0.00' : undefined,
        };
      } else {
        wsDetails[addr].s = {
          fill: { fgColor: { rgb: 'FFFFFF' } },
          font: { sz: 10 },
          alignment: { vertical: 'center', horizontal: c >= 6 && c <= 11 ? 'right' : 'left' },
          border: { bottom: { style: 'hair', color: { rgb: 'E5E7EB' } } },
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
  const wsSummary = XLSX.utils.aoa_to_sheet([sumHeaders, ...sumData]);
  wsSummary['!cols'] = autoFitCols(sumHeaders, sumData as (string | number)[][]);

  // Header style
  for (let c = 0; c < sumHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
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
    const excelRow = i + 1;
    const anchor = partyAnchorRow[i]; // 1-indexed Excel row in Party Details
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
        border: { bottom: { style: 'hair', color: { rgb: 'E5E7EB' } } },
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
        border: { bottom: { style: 'hair', color: { rgb: 'E5E7EB' } } },
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
}

export function exportMonthlyComparison(rows: MonthlyComparisonRow[], filename: string) {
  const wb = XLSX.utils.book_new();
  const headers = [
    'Party Name (Tally)', 'GST No (Tally)', 'Invoice No (Tally)',
    'CGST (Tally)', 'SGST (Tally)', 'IGST (Tally)',
    'Party Name (Comparison)', 'GST No (Comparison)', 'Invoice No (Comparison)',
    'CGST (Comparison)', 'SGST (Comparison)', 'IGST (Comparison)',
    'Match Status', 'Total Difference',
  ];
  const data = rows.map((r) => [
    r.partyTally, r.gstinTally, r.invoiceTally, r.cgstTally, r.sgstTally, r.igstTally,
    r.partyCmp, r.gstinCmp, r.invoiceCmp, r.cgstCmp, r.sgstCmp, r.igstCmp,
    r.status, r.totalDiff,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

  // Column widths
  ws['!cols'] = [
    { wch: 28 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 28 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 18 }, { wch: 16 },
  ];

  // Header style: split Tally (blue) and Comparison (teal)
  const headerStyle = (fill: string) => ({
    fill: { fgColor: { rgb: fill } },
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
  });
  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[addr]) continue;
    let fill = '1E3A5F';
    if (c >= 6 && c < 12) fill = '0D7A5F';
    else if (c === 12) fill = '4B5563';
    else if (c === 13) fill = 'B45309';
    ws[addr].s = headerStyle(fill);
  }

  // Per-row tint by status
  const statusFill: Record<string, string> = {
    'Perfect Match': 'E6F5ED',
    'Value Mismatch': 'FEF3C7',
    'Invoice Missing': 'FEE2E2',
    'Unmatched Vendor': 'FEE2E2',
    'Missing in PR': 'DBEAFE',
  };

  for (let r = 1; r <= rows.length; r++) {
    const status = rows[r - 1].status;
    const tint = statusFill[status] || (r % 2 === 0 ? 'F9FAFB' : 'FFFFFF');
    for (let c = 0; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
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

  const pwWs = XLSX.utils.aoa_to_sheet([pwHeaders, ...pwData]);
  pwWs['!cols'] = [
    { wch: 18 }, { wch: 32 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 16 }, { wch: 16 }, { wch: 16 },
  ];
  for (let c = 0; c < pwHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
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
    for (let c = 0; c < pwHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
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

export function exportPartyWise(parties: PartySummary[], filename: string) {
  const wb = XLSX.utils.book_new();

  // ---- Sheet 1: Party Summary ----
  const summaryHeaders = [
    'Party Name', 'GSTIN', 'Invoices',
    'Perfect', 'Mismatch', 'Inv Missing', 'Unmatched Vendor', 'Missing in PR',
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

  const ws1 = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryData, totalsRow]);
  ws1['!cols'] = [
    { wch: 30 }, { wch: 18 }, { wch: 9 },
    { wch: 9 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 16 },
  ];

  // Header style
  for (let c = 0; c < summaryHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
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
    for (let c = 0; c < summaryHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
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
  const totalsRowIdx = parties.length + 1;
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
    'Party / Invoice', 'GSTIN',
    'Inv No (PR)', 'Inv No (2B)',
    'Date (PR)', 'Date (2B)',
    'IGST (PR)', 'IGST (2B)',
    'CGST (PR)', 'CGST (2B)',
    'SGST (PR)', 'SGST (2B)',
    'Status', 'Remark',
  ];
  const detailRows: (string | number)[][] = [];
  const partyHeaderRowIdxs: { idx: number; status: string }[] = [];

  for (const p of parties) {
    partyHeaderRowIdxs.push({ idx: detailRows.length + 1, status: p.overall });
    detailRows.push([
      p.partyName || '— No name —', p.gstin || '',
      '', '', '', '', '', '', '', '', '', '', p.overall, `${p.totals.count} invoices`,
    ]);
    for (const inv of p.invoices) {
      detailRows.push([
        '', '',
        inv.invoiceNoPR, inv.invoiceNo2B,
        inv.invoiceDatePR, inv.invoiceDate2B,
        inv.igstPR, inv.igst2B,
        inv.cgstPR, inv.cgst2B,
        inv.sgstPR, inv.sgst2B,
        inv.status, inv.remark || '',
      ]);
    }
    // per-party totals row
    detailRows.push([
      'Subtotal', '', '', '', '', '',
      p.totals.igstPR, p.totals.igst2B,
      p.totals.cgstPR, p.totals.cgst2B,
      p.totals.sgstPR, p.totals.sgst2B,
      '', `Diff ₹${p.totals.totalDiff.toFixed(2)}`,
    ]);
  }

  const ws2 = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]);
  ws2['!cols'] = [
    { wch: 28 }, { wch: 18 },
    { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 18 }, { wch: 28 },
  ];
  for (let c = 0; c < detailHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
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
        alignment: { vertical: 'center', horizontal: c >= 6 && c <= 11 ? 'right' : 'left' },
      };
    }
  }
  // style remaining cells (invoice + subtotal rows)
  const headerRowSet = new Set(partyHeaderRowIdxs.map((x) => x.idx));
  for (let r = 1; r <= detailRows.length; r++) {
    if (headerRowSet.has(r)) continue;
    const isSubtotal = detailRows[r - 1][0] === 'Subtotal';
    for (let c = 0; c < detailHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws2[addr]) continue;
      ws2[addr].s = {
        fill: { fgColor: { rgb: isSubtotal ? 'F3F4F6' : 'FFFFFF' } },
        font: { sz: 10, bold: isSubtotal },
        alignment: { vertical: 'center', horizontal: c >= 6 && c <= 11 ? 'right' : 'left' },
        border: { bottom: { style: 'hair', color: { rgb: 'E5E7EB' } } },
      };
    }
  }

  XLSX.utils.book_append_sheet(wb, ws2, 'Party Details');
  XLSX.writeFile(wb, filename);
}

