import * as XLSX from 'xlsx-js-style';
import type { MonthlyComparisonRow, DebitNoteRecord } from '../types';
import { STATUS_STYLES, DEFAULT_STYLE, autoFitCols, ACC_FMT } from '../styles/palette';
import { numVal, parseMonthFY, formatDateStr } from '../styles/formatters';
import { addCorporateHeader } from '../styles/corporateHeader';
import { removeAllMergesFromWorkbook } from '../styles/zeroMergeGuard';
import { buildMonthAuditComment } from './monthlyDiffExport';
import { appendCrossVerificationSheet } from './timingRecoSheet';
import { appendAllInvoicesSheet, appendGstinReports, applySheetStyles, buildSheetRows } from './allInvoicesSheet';
import { appendPartywiseMonthlySheet } from './partyWiseExport';
import { appendVisualAnalyticsSheet } from './executiveSummary';
import { reconcileDebitNotes, appendDebitNoteSheetsToWorkbook } from '@/lib/debitNoteEngine';

export function buildMonthlyComparisonWorkbook(
  rows: MonthlyComparisonRow[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] },
  companyName?: string,
  appliedGstins?: any[],
  conflicts?: any[],
  gstr3bData?: any[]
): XLSX.WorkBook {
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

  // Prior FY (Excluded)
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

  // Debit Notes Reconciliation Sheets
  if (debitNotes && ((debitNotes.pr && debitNotes.pr.length > 0) || (debitNotes.twoB && debitNotes.twoB.length > 0))) {
    const dnResult = reconcileDebitNotes(debitNotes.pr || [], debitNotes.twoB || []);
    const dnSheets = appendDebitNoteSheetsToWorkbook(wb, dnResult, companyName, true);
    comparisonSheetNames.push(...dnSheets);
  }

  appendGstinReports(wb, comparisonSheetNames, companyName, appliedGstins, conflicts);

  // Visual Analytics & Charts
  appendVisualAnalyticsSheet(wb, rows, debitNotes, companyName);

  removeAllMergesFromWorkbook(wb);
  return wb;
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
  const wb = buildMonthlyComparisonWorkbook(rows, debitNotes, companyName, appliedGstins, conflicts, gstr3bData);
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
