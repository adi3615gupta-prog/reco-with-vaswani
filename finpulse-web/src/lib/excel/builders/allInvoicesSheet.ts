import * as XLSX from 'xlsx-js-style';
import type { MonthlyComparisonRow, DebitNoteRecord } from '../types';
import { type StatusStyle, ACC_FMT, enrichStatusWithIcon } from '../styles/palette';
import { formatDateStr, numVal, parseMonthFY, r2 } from '../styles/formatters';
import { addCorporateHeader } from '../styles/corporateHeader';

export function makeHyperlinkCell(sheetName: string, displayText: string): XLSX.CellObject {
  return {
    t: 's',
    v: displayText,
    l: {
      Target: `#'${sheetName}'!A4`,
      Tooltip: `Navigate to ${sheetName}`,
    },
  };
}

export function applySheetStyles(
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

export function buildSheetRows(records: Record<string, unknown>[], status?: string) {
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

export function appendAllInvoicesSheet(
  wb: XLSX.WorkBook,
  rows: MonthlyComparisonRow[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] },
  companyName?: string,
  tabs?: { name: string; target: string }[]
) {
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
