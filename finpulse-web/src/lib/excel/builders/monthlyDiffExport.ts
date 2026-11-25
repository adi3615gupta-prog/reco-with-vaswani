import XLSXStyle from 'xlsx-js-style';
const XLSX: any = (XLSXStyle as any).default || XLSXStyle;
import type { MonthlyComparisonRow, DebitNoteRecord } from '../types';
import { numVal, parseMonthFY, formatDateStr, r2 } from '../styles/formatters';
import { ACC_FMT } from '../styles/palette';
import { addCorporateHeader } from '../styles/corporateHeader';
import { removeAllMergesFromWorkbook } from '../styles/zeroMergeGuard';
import { appendExecutiveSummary, appendMethodologySheet } from './executiveSummary';

export function appendMonthlyDifferenceSheets(
  wb: XLSX.WorkBook,
  rows: MonthlyComparisonRow[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] },
  companyName?: string,
  tabs?: { name: string; target: string }[]
): void {
  const FY_MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];

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

    ws['!merges'] = [];
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
): XLSX.WorkBook {
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

  removeAllMergesFromWorkbook(wb);
  try {
    XLSX.writeFile(wb, filename);
  } catch (error) {
    console.error('XLSX.writeFile error:', error);
    throw error;
  }
  return wb;
}
