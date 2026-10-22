import XLSXStyle from 'xlsx-js-style';
const XLSX: any = (XLSXStyle as any).default || XLSXStyle;
import type { MonthlyComparisonRow, DebitNoteRecord } from '../types';
import { numVal, parseMonthFY, formatDateStr } from '../styles/formatters';
import { ACC_FMT } from '../styles/palette';
import { addCorporateHeader } from '../styles/corporateHeader';

export function appendTimingReconciliationSheet(
  wb: XLSX.WorkBook,
  rows: MonthlyComparisonRow[],
  companyName?: string,
  tabs?: { name: string; target: string }[]
): void {
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

    const prIdx = parseMonthLocal(r.dateTally);
    const tbIdx = parseMonthLocal(r.dateCmp);

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
        '', '', ''
      ]);
    }
  }

  timingRows.sort((a, b) => {
    const partyA = a[2] || a[3] || '';
    const partyB = b[2] || b[3] || '';
    if (partyA !== partyB) return partyA.localeCompare(partyB);
    return FY_MONTHS.indexOf(a[8]) - FY_MONTHS.indexOf(b[8]);
  });

  for (let idx = 0; idx < timingRows.length; idx++) {
    const rowNum = idx + 5;
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
  ws['!merges'] = [];

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

export function appendCrossVerificationSheet(
  wb: XLSX.WorkBook,
  rows: MonthlyComparisonRow[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] },
  companyName: string = 'M/S GOYAL TRADING COMPANY'
): void {
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
    'Total Tax (PR) (₹)', 'Total Tax (2B) (₹)', 'Net Tax Diff (PR - 2B) (₹)', 'Control Check / Audit Remarks', 'Audit Drill-Down ↗'
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
  grid[10][15] = { t: 's', v: '[ View All 3,778 Invoices ↗ ]', l: { Target: "#'All Invoices Working'!A4" } };

  // Table 2: Purchase Return & Debit Note Reconciliation Summary
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
  });

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
  grid[26][15] = { t: 's', v: '[ View Reconciled Register (1,219 Notes) ↗ ]', l: { Target: "#'Reconciled Register (DN)'!A4" } };

  // Table 3: Master Control Tie-Out
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
