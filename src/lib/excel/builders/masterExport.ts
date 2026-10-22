import * as XLSX from 'xlsx-js-style';
import type { DebitNoteRecord } from '../types';
import { STATUS_STYLES, DEFAULT_STYLE, autoFitCols, ACC_FMT } from '../styles/palette';
import { numVal, extractFY, formatDateStr } from '../styles/formatters';
import { addCorporateHeader } from '../styles/corporateHeader';
import { removeAllMergesFromWorkbook } from '../styles/zeroMergeGuard';
import { appendExecutiveSummary, appendMethodologySheet } from './executiveSummary';
import { appendNavigationSheet } from './navigationSheet';
import { appendGstinReports, applySheetStyles, buildSheetRows } from './allInvoicesSheet';
import { appendPartyWiseSheets } from './partyWiseExport';
import { buildDebitNotes21ColSheet } from './debitNotes21Col';
import { reconcileDebitNotes } from '@/lib/debitNoteEngine';

export function appendRawDataInputSheets(
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

  for (const r of results) {
    if (!r['Financial Year']) {
      const fyPR = extractFY(r['Invoice Date (PR)'] as string);
      const fy2B = extractFY(r['Invoice Date (2B)'] as string);
      r['Financial Year'] = fyPR || fy2B || 'UNKNOWN';
    }
  }

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
    for (let R = 5; R <= range.e.r; R++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: gstDiffColIdx });
      const rowNum = R + 1;
      if (igstPrIdx >= 0 && igst2bIdx >= 0 && cgstPrIdx >= 0 && cgst2bIdx >= 0 && sgstPrIdx >= 0 && sgst2bIdx >= 0) {
        allWs[addr] = { t: 'n', f: `ABS(${getL(igstPrIdx)}${rowNum}-${getL(igst2bIdx)}${rowNum})+ABS(${getL(cgstPrIdx)}${rowNum}-${getL(cgst2bIdx)}${rowNum})+ABS(${getL(sgstPrIdx)}${rowNum}-${getL(sgst2bIdx)}${rowNum})`, z: ACC_FMT };
      }
    }
  }

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
    if (status === 'Unmatched Vendor') continue;

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

    ws['!views'] = [{ state: 'frozen', xSplit: 2, ySplit: 5 }];
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: rows.length + 3, c: cols.length - 1 } }) };

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

  // 3. Party-wise sheets
  appendPartyWiseSheets(wb, results, companyName, tabs, debitNotes);
  sheetNames.push('Party Summary', 'Party Details');

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
    if (idxA === -1) idxA = 999;
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
