import XLSXStyle from 'xlsx-js-style';
const XLSX: any = (XLSXStyle as any).default || XLSXStyle;
import type { ReconciledDebitNoteRow } from '../../debitNoteEngine';
import { removeAllMergesFromWorkbook } from '../styles/zeroMergeGuard';

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
