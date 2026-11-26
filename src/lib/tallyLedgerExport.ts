/**
 * tallyLedgerExport.ts — Zero-Merge Audit-Grade Excel Export for Tally Ledger Voucher Import
 *
 * Generates multi-sheet XLSX workbooks matching TallyPrime's Ledger Vouchers report:
 *  - Sheet 1: Ledger Vouchers (combined view with Opening Balance, Vouchers, Current Total, Closing Balance)
 *  - Sheet 2: Balances Summary (per-ledger Opening Dr/Cr, Period Dr/Cr, Closing Dr/Cr)
 *  - Sheet 3..N: Individual per-ledger statements with Opening Balance, Vouchers, Current Total, Closing Balance
 */

import * as XLSX from 'xlsx-js-style';
import type { LedgerBalanceSummary, LedgerVoucherEntry } from './tallyApi';

export interface LedgerExportOptions {
  companyName: string;
  fromDate: string;
  toDate: string;
  selectedLedgerNames: string[];
  entries: LedgerVoucherEntry[];
  balances: Map<string, LedgerBalanceSummary>;
  isFilteredBySearchOrType?: boolean;
}

export function formatSignedBalanceText(amount: number): string {
  if (Math.abs(amount) < 0.005) return '₹ 0.00';
  const abs = Math.abs(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `₹ ${abs} ${amount > 0 ? 'Dr' : 'Cr'}`;
}

export function lookupLedgerBalance(
  balances: Map<string, LedgerBalanceSummary>,
  ledgerName: string
): LedgerBalanceSummary | undefined {
  const direct = balances.get(ledgerName);
  if (direct) return direct;
  const target = ledgerName.replace(/\s+/g, ' ').trim().toUpperCase();
  for (const [k, v] of balances.entries()) {
    if (k.replace(/\s+/g, ' ').trim().toUpperCase() === target) {
      return v;
    }
  }
  return undefined;
}

function makeUniqueSheetName(rawName: string, usedNames: Set<string>): string {
  const cleaned = rawName.replace(/[\\/*?[\]:]/g, '').trim() || 'Ledger';
  let candidate = cleaned.substring(0, 31);
  let counter = 2;
  while (usedNames.has(candidate.toUpperCase())) {
    const suffix = `_${counter}`;
    candidate = cleaned.substring(0, 31 - suffix.length) + suffix;
    counter++;
  }
  usedNames.add(candidate.toUpperCase());
  return candidate;
}

export function buildLedgerImportWorkbook(options: LedgerExportOptions): XLSX.WorkBook {
  const {
    companyName,
    fromDate,
    toDate,
    selectedLedgerNames,
    entries,
    balances,
    isFilteredBySearchOrType = false,
  } = options;

  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();

  const headerStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
    fill: { fgColor: { rgb: '1E3A5F' } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    border: {
      top: { style: 'thin' as const, color: { rgb: '999999' } },
      bottom: { style: 'thin' as const, color: { rgb: '999999' } },
      left: { style: 'thin' as const, color: { rgb: '999999' } },
      right: { style: 'thin' as const, color: { rgb: '999999' } },
    },
  };

  const cellBorder = {
    top: { style: 'thin' as const, color: { rgb: 'DDDDDD' } },
    bottom: { style: 'thin' as const, color: { rgb: 'DDDDDD' } },
    left: { style: 'thin' as const, color: { rgb: 'DDDDDD' } },
    right: { style: 'thin' as const, color: { rgb: 'DDDDDD' } },
  };

  const numFmt = '#,##0.00';

  const applyRowStyle = (
    ws: XLSX.WorkSheet,
    rowIdx: number,
    colCount: number,
    numericCols: number[],
    variant: 'normal' | 'opening' | 'total' | 'closing'
  ) => {
    for (let ci = 0; ci < colCount; ci++) {
      const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: ci });
      if (!ws[cellRef]) continue;
      const style: any = { border: cellBorder };
      if (variant === 'opening') {
        style.font = { bold: true, sz: 10, color: { rgb: '1E40AF' } };
        style.fill = { fgColor: { rgb: 'EFF6FF' } };
      } else if (variant === 'total') {
        style.font = { bold: true, sz: 10, color: { rgb: '0F172A' } };
        style.fill = { fgColor: { rgb: 'F1F5F9' } };
      } else if (variant === 'closing') {
        style.font = { bold: true, sz: 11, color: { rgb: '065F46' } };
        style.fill = { fgColor: { rgb: 'ECFDF5' } };
      }
      if (numericCols.includes(ci)) {
        style.numFmt = numFmt;
        if (typeof ws[cellRef].v === 'number') {
          style.alignment = { horizontal: 'right' };
        }
      }
      ws[cellRef].s = { ...ws[cellRef].s, ...style };
    }
  };

  // Determine active ledgers (preserve selected order, plus any present in entries)
  const ledgerList: string[] = [];
  const seenLedgers = new Set<string>();
  for (const ln of selectedLedgerNames) {
    const key = ln.toUpperCase();
    if (!seenLedgers.has(key)) {
      seenLedgers.add(key);
      ledgerList.push(ln);
    }
  }
  for (const e of entries) {
    const key = e.ledgerName.toUpperCase();
    if (!seenLedgers.has(key)) {
      seenLedgers.add(key);
      ledgerList.push(e.ledgerName);
    }
  }

  const isSingleLedger = ledgerList.length === 1;
  const periodDebitTotal = entries.reduce((s, e) => s + e.debit, 0);
  const periodCreditTotal = entries.reduce((s, e) => s + e.credit, 0);

  let totalOpeningDebit = 0;
  let totalOpeningCredit = 0;
  let netOpeningSigned = 0;
  let netClosingSigned = 0;

  for (const ln of ledgerList) {
    const bal = lookupLedgerBalance(balances, ln);
    const op = bal?.openingBalance ?? 0;
    const cl = bal?.closingBalance ?? 0;
    netOpeningSigned += op;
    netClosingSigned += cl;
    if (op > 0) totalOpeningDebit += op;
    else if (op < 0) totalOpeningCredit += Math.abs(op);
  }

  // ─── Sheet 1: Combined Ledger Vouchers ─────────────────────
  const headers = [
    'Date',
    'Voucher No.',
    'Voucher Type',
    'Ledger Name',
    'Party Name',
    'Debit (₹)',
    'Credit (₹)',
    'Narration',
  ];

  type RowMeta = { row: (string | number)[]; variant: 'normal' | 'opening' | 'total' | 'closing' };
  const combinedRows: RowMeta[] = [];

  if (!isFilteredBySearchOrType) {
    for (const ln of ledgerList) {
      const bal = lookupLedgerBalance(balances, ln);
      const op = bal?.openingBalance ?? 0;
      if (isSingleLedger || Math.abs(op) >= 0.005) {
        combinedRows.push({
          variant: 'opening',
          row: [
            fromDate,
            '',
            'Opening Balance',
            ln,
            'Opening Balance',
            op > 0 ? op : op === 0 && isSingleLedger ? 0 : '',
            op < 0 ? Math.abs(op) : '',
            `Opening balance as on ${fromDate}`,
          ],
        });
      }
    }
  }

  for (const e of entries) {
    combinedRows.push({
      variant: 'normal',
      row: [
        e.date,
        e.voucherNumber,
        e.voucherType,
        e.ledgerName,
        e.partyName,
        e.debit || '',
        e.credit || '',
        e.narration,
      ],
    });
  }

  if (!isFilteredBySearchOrType) {
    combinedRows.push({
      variant: 'total',
      row: [
        '',
        '',
        '',
        '',
        'Current Total (Period Vouchers)',
        periodDebitTotal,
        periodCreditTotal,
        '',
      ],
    });

    if (isSingleLedger) {
      const cl = netClosingSigned;
      const clLabel = `Closing Balance (${cl > 0 ? 'Dr' : cl < 0 ? 'Cr' : 'Nil'})`;
      combinedRows.push({
        variant: 'closing',
        row: [
          '',
          '',
          '',
          ledgerList[0],
          clLabel,
          cl > 0 ? cl : cl === 0 ? 0 : '',
          cl < 0 ? Math.abs(cl) : '',
          `Closing balance as on ${toDate}`,
        ],
      });
    } else {
      combinedRows.push({
        variant: 'opening',
        row: [
          '',
          '',
          '',
          '',
          'Opening Balance Total',
          totalOpeningDebit || '',
          totalOpeningCredit || '',
          '',
        ],
      });
      const netCl = netClosingSigned;
      const netClLabel = `Net Closing Balance (${netCl > 0 ? 'Dr' : netCl < 0 ? 'Cr' : 'Nil'})`;
      combinedRows.push({
        variant: 'closing',
        row: [
          '',
          '',
          '',
          '',
          netClLabel,
          netCl > 0 ? netCl : netCl === 0 ? 0 : '',
          netCl < 0 ? Math.abs(netCl) : '',
          `Closing balance as on ${toDate}`,
        ],
      });
    }
  } else {
    combinedRows.push({
      variant: 'total',
      row: ['', '', '', '', 'TOTAL (Filtered)', periodDebitTotal, periodCreditTotal, ''],
    });
  }

  const ws = XLSX.utils.aoa_to_sheet([
    [`Ledger Voucher Import — ${companyName || 'Tally Company'}`],
    [`Period: ${fromDate} to ${toDate} | Ledgers: ${ledgerList.join(', ')}`],
    [],
    headers,
    ...combinedRows.map(r => r.row),
  ]);

  if (ws['A1']) ws['A1'].s = { font: { bold: true, sz: 14, color: { rgb: '1E3A5F' } } };
  if (ws['A2']) ws['A2'].s = { font: { sz: 10, color: { rgb: '666666' } } };

  const headerRowIdx = 3;
  headers.forEach((_, ci) => {
    const cellRef = XLSX.utils.encode_cell({ r: headerRowIdx, c: ci });
    if (ws[cellRef]) ws[cellRef].s = headerStyle;
  });

  combinedRows.forEach((meta, ri) => {
    applyRowStyle(ws, headerRowIdx + 1 + ri, headers.length, [5, 6], meta.variant);
  });

  ws['!cols'] = [
    { wch: 12 }, // Date
    { wch: 16 }, // Voucher No
    { wch: 18 }, // Voucher Type
    { wch: 30 }, // Ledger Name
    { wch: 32 }, // Party Name
    { wch: 16 }, // Debit
    { wch: 16 }, // Credit
    { wch: 40 }, // Narration
  ];

  XLSX.utils.book_append_sheet(wb, ws, makeUniqueSheetName('Ledger Vouchers', usedSheetNames));

  // ─── Sheet 2: Balances Summary ─────────────────────────────
  if (ledgerList.length > 0 && !isFilteredBySearchOrType) {
    const sumHeaders = [
      'Ledger Name',
      'Parent Group',
      'Opening Debit (₹)',
      'Opening Credit (₹)',
      'Period Debit (₹)',
      'Period Credit (₹)',
      'Closing Debit (₹)',
      'Closing Credit (₹)',
      'Closing Balance (Dr/Cr)',
    ];

    const sumRows: (string | number)[][] = [];
    let totOpDr = 0;
    let totOpCr = 0;
    let totPerDr = 0;
    let totPerCr = 0;
    let totClDr = 0;
    let totClCr = 0;

    for (const ln of ledgerList) {
      const bal = lookupLedgerBalance(balances, ln);
      const op = bal?.openingBalance ?? 0;
      const cl = bal?.closingBalance ?? 0;
      const lEntries = entries.filter(e => e.ledgerName.toUpperCase() === ln.toUpperCase());
      const pDr = lEntries.reduce((s, e) => s + e.debit, 0);
      const pCr = lEntries.reduce((s, e) => s + e.credit, 0);

      const opDr = op > 0 ? op : 0;
      const opCr = op < 0 ? Math.abs(op) : 0;
      const clDr = cl > 0 ? cl : 0;
      const clCr = cl < 0 ? Math.abs(cl) : 0;

      totOpDr += opDr;
      totOpCr += opCr;
      totPerDr += pDr;
      totPerCr += pCr;
      totClDr += clDr;
      totClCr += clCr;

      sumRows.push([
        ln,
        bal?.parent || '',
        opDr || '',
        opCr || '',
        pDr || '',
        pCr || '',
        clDr || '',
        clCr || '',
        formatSignedBalanceText(cl),
      ]);
    }

    sumRows.push([
      'TOTAL',
      '',
      totOpDr,
      totOpCr,
      totPerDr,
      totPerCr,
      totClDr,
      totClCr,
      formatSignedBalanceText(netClosingSigned),
    ]);

    const sws = XLSX.utils.aoa_to_sheet([
      [`Ledger Balances Summary — ${companyName || 'Tally Company'}`],
      [`Period: ${fromDate} to ${toDate} | Ledgers: ${ledgerList.length}`],
      [],
      sumHeaders,
      ...sumRows,
    ]);

    if (sws['A1']) sws['A1'].s = { font: { bold: true, sz: 14, color: { rgb: '1E3A5F' } } };
    if (sws['A2']) sws['A2'].s = { font: { sz: 10, color: { rgb: '666666' } } };

    sumHeaders.forEach((_, ci) => {
      const cellRef = XLSX.utils.encode_cell({ r: 3, c: ci });
      if (sws[cellRef]) sws[cellRef].s = headerStyle;
    });

    sumRows.forEach((_, ri) => {
      const isTotal = ri === sumRows.length - 1;
      applyRowStyle(sws, 4 + ri, sumHeaders.length, [2, 3, 4, 5, 6, 7], isTotal ? 'closing' : 'normal');
    });

    sws['!cols'] = [
      { wch: 32 },
      { wch: 24 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 20 },
    ];

    XLSX.utils.book_append_sheet(wb, sws, makeUniqueSheetName('Balances Summary', usedSheetNames));
  }

  // ─── Sheet 3..N: Per-Ledger Sheets ─────────────────────────
  for (const ln of ledgerList) {
    const lEntries = entries.filter(e => e.ledgerName.toUpperCase() === ln.toUpperCase());
    const bal = lookupLedgerBalance(balances, ln);
    const op = bal?.openingBalance ?? 0;
    const cl = bal?.closingBalance ?? 0;

    if (lEntries.length === 0 && !bal) continue;

    const lHeaders = [
      'Date',
      'Voucher No.',
      'Voucher Type',
      'Party Name',
      'Debit (₹)',
      'Credit (₹)',
      'Narration',
    ];

    const lRowsMeta: RowMeta[] = [];

    if (!isFilteredBySearchOrType) {
      lRowsMeta.push({
        variant: 'opening',
        row: [
          fromDate,
          '',
          'Opening Balance',
          'Opening Balance',
          op > 0 ? op : op === 0 ? 0 : '',
          op < 0 ? Math.abs(op) : '',
          `Opening balance as on ${fromDate}`,
        ],
      });
    }

    for (const e of lEntries) {
      lRowsMeta.push({
        variant: 'normal',
        row: [
          e.date,
          e.voucherNumber,
          e.voucherType,
          e.partyName,
          e.debit || '',
          e.credit || '',
          e.narration,
        ],
      });
    }

    const lTotalDebit = lEntries.reduce((s, e) => s + e.debit, 0);
    const lTotalCredit = lEntries.reduce((s, e) => s + e.credit, 0);

    if (!isFilteredBySearchOrType) {
      lRowsMeta.push({
        variant: 'total',
        row: ['', '', '', 'Current Total (Period Vouchers)', lTotalDebit, lTotalCredit, ''],
      });
      lRowsMeta.push({
        variant: 'closing',
        row: [
          '',
          '',
          '',
          `Closing Balance (${cl > 0 ? 'Dr' : cl < 0 ? 'Cr' : 'Nil'})`,
          cl > 0 ? cl : cl === 0 ? 0 : '',
          cl < 0 ? Math.abs(cl) : '',
          `Closing balance as on ${toDate}`,
        ],
      });
    } else {
      lRowsMeta.push({
        variant: 'total',
        row: ['', '', '', 'TOTAL (Filtered)', lTotalDebit, lTotalCredit, ''],
      });
    }

    const lws = XLSX.utils.aoa_to_sheet([
      [`${ln} — Ledger Vouchers (${companyName || 'Tally Company'})`],
      [
        `Period: ${fromDate} to ${toDate} | Opening: ${formatSignedBalanceText(op)} | Closing: ${formatSignedBalanceText(cl)}`,
      ],
      [],
      lHeaders,
      ...lRowsMeta.map(r => r.row),
    ]);

    if (lws['A1']) lws['A1'].s = { font: { bold: true, sz: 13, color: { rgb: '1E3A5F' } } };
    if (lws['A2']) lws['A2'].s = { font: { sz: 10, color: { rgb: '666666' } } };

    const lHeaderRowIdx = 3;
    lHeaders.forEach((_, ci) => {
      const cellRef = XLSX.utils.encode_cell({ r: lHeaderRowIdx, c: ci });
      if (lws[cellRef]) lws[cellRef].s = headerStyle;
    });

    lRowsMeta.forEach((meta, ri) => {
      applyRowStyle(lws, lHeaderRowIdx + 1 + ri, lHeaders.length, [4, 5], meta.variant);
    });

    lws['!cols'] = [
      { wch: 12 },
      { wch: 16 },
      { wch: 18 },
      { wch: 32 },
      { wch: 16 },
      { wch: 16 },
      { wch: 40 },
    ];

    XLSX.utils.book_append_sheet(wb, lws, makeUniqueSheetName(ln, usedSheetNames));
  }

  return wb;
}
