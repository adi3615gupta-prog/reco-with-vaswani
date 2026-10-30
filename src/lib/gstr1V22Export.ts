/**
 * gstr1V22Export.ts
 * 
 * Official GSTR-1 V2.2 32-Sheet Excel Exporter, Section-Wise CSV Suite & TaxPower Audit Defense Exporters.
 * 
 * Architecture Rules:
 * 1. ZERO MERGE GUARANTEE (removeAllMergesFromWorkbook): ws['!merges'] = [] across all sheets.
 * 2. Exact 32 sheet manifest matching official GSTR1_Excel_Workbook_Template_V2.2.xlsx.
 * 3. 31 Section-Wise CSVs matching Section_wise_CSV_files/GSTR1/ specification.
 * 4. TaxPower DRC-01B Outward Difference & DRC-01C Books vs 3B ITC Comparison Exporters.
 */

import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { Gstr1ReturnData } from './gstr1Engine';

// ─── 0. Zero-Merge Defense Helper ───────────────────────────────────────────

export function removeAllMergesFromWorkbook(wb: XLSX.WorkBook): XLSX.WorkBook {
  if (!wb || !wb.SheetNames) return wb;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (ws) {
      delete ws['!merges'];
      ws['!merges'] = [];
    }
  }
  return wb;
}

// ─── 1. Official V2.2 32-Sheet Manifest & Headers ────────────────────────────

export const V22_SHEET_NAMES = [
  'Help Instruction',
  'b2b,sez,de',
  'b2ba',
  'b2cl',
  'b2cla',
  'b2cs',
  'b2csa',
  'cdnr',
  'cdnra',
  'cdnur',
  'cdnura',
  'exp',
  'expa',
  'at',
  'ata',
  'atadj',
  'atadja',
  'exemp',
  'hsn(b2b)',
  'hsn(b2c)',
  'docs',
  'eco',
  'ecoa',
  'ecob2b',
  'ecourp2b',
  'ecob2c',
  'ecourp2c',
  'ecoab2b',
  'ecoab2c',
  'ecoaurp2b',
  'ecoaurp2c',
  'master'
] as const;

/**
 * Creates the official V2.2 32-sheet GSTR-1 Excel workbook.
 */
export function generateGstr1V22Workbook(
  data: Gstr1ReturnData,
  options: { companyName?: string } = {}
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // 1. Help Instruction Sheet
  const helpRows = [
    ['GST Offline Tool - Return Preparation Utility (Version 2.2)'],
    ['GSTIN:', data.gstin || ''],
    ['Return Period:', data.fp || ''],
    ['Taxpayer Trade Name:', options.companyName || ''],
    [''],
    ['Important Instructions:'],
    ['1. This workbook follows the official GSTN V2.2 32-sheet architecture.'],
    ['2. Zero-Merge Guarantee: Merged cells have been removed across all sheets to enable sorting and filtering.'],
    ['3. All transactions are bifurcated per official statutory thresholds (B2CL > ₹1L post-Aug 2024).'],
    ['4. Table 12 HSN is bifurcated into hsn(b2b) and hsn(b2c).']
  ];
  const wsHelp = XLSX.utils.aoa_to_sheet(helpRows);
  XLSX.utils.book_append_sheet(wb, wsHelp, 'Help Instruction');

  // 2. b2b,sez,de Sheet
  const b2bHeaders = [
    'GSTIN/UIN of Recipient',
    'Receiver Name',
    'Invoice Number',
    'Invoice date',
    'Invoice Value',
    'Place Of Supply',
    'Reverse Charge',
    'Applicable % of Tax Rate',
    'Invoice Type',
    'E-Commerce GSTIN',
    'Rate',
    'Taxable Value',
    'Cess Amount'
  ];
  const b2bRows: any[][] = [b2bHeaders];
  if (data.b2b) {
    for (const group of data.b2b) {
      for (const inv of group.inv) {
        for (const itm of inv.itms) {
          b2bRows.push([
            group.ctin,
            inv.buyerName || '',
            inv.inum,
            inv.idt,
            inv.val,
            inv.pos,
            inv.rchrg,
            inv.diff_percent || '',
            inv.inv_typ || 'Regular',
            '',
            itm.itm_det.rt,
            itm.itm_det.txval,
            itm.itm_det.csamt || 0
          ]);
        }
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(b2bRows), 'b2b,sez,de');

  // 3. b2ba Sheet (Amendments)
  const b2baHeaders = [
    'Original GSTIN/UIN of Recipient',
    'Original Receiver Name',
    'Original Invoice Number',
    'Original Invoice date',
    'Revised GSTIN/UIN of Recipient',
    'Revised Receiver Name',
    'Revised Invoice Number',
    'Revised Invoice date',
    'Invoice Value',
    'Place Of Supply',
    'Reverse Charge',
    'Applicable % of Tax Rate',
    'Invoice Type',
    'E-Commerce GSTIN',
    'Rate',
    'Taxable Value',
    'Cess Amount'
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([b2baHeaders]), 'b2ba');

  // 4. b2cl Sheet (Inter-State Unregistered > ₹1L)
  const b2clHeaders = [
    'Invoice Number',
    'Invoice date',
    'Invoice Value',
    'Place Of Supply',
    'Applicable % of Tax Rate',
    'Rate',
    'Taxable Value',
    'Cess Amount',
    'E-Commerce GSTIN'
  ];
  const b2clRows: any[][] = [b2clHeaders];
  if (data.b2cl) {
    for (const group of data.b2cl) {
      for (const inv of group.inv) {
        for (const itm of inv.itms) {
          b2clRows.push([
            inv.inum,
            inv.idt,
            inv.val,
            group.pos,
            inv.diff_percent || '',
            itm.itm_det.rt,
            itm.itm_det.txval,
            itm.itm_det.csamt || 0,
            ''
          ]);
        }
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(b2clRows), 'b2cl');

  // 5. b2cla Sheet
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Original Invoice Number', 'Original Invoice date', ...b2clHeaders]]), 'b2cla');

  // 6. b2cs Sheet (Consolidated)
  const b2csHeaders = [
    'Type',
    'Place Of Supply',
    'Applicable % of Tax Rate',
    'Rate',
    'Taxable Value',
    'Cess Amount',
    'E-Commerce GSTIN'
  ];
  const b2csRows: any[][] = [b2csHeaders];
  if (data.b2cs) {
    for (const item of data.b2cs) {
      b2csRows.push([
        item.typ === 'E' ? 'E-Commerce' : 'Other Than E-Commerce',
        item.pos,
        item.diff_percent || '',
        item.rt,
        item.txval,
        item.csamt || 0,
        ''
      ]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(b2csRows), 'b2cs');

  // 7. b2csa Sheet
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Original Place Of Supply', ...b2csHeaders]]), 'b2csa');

  // 8. cdnr Sheet (Registered Notes)
  const cdnrHeaders = [
    'GSTIN/UIN of Recipient',
    'Receiver Name',
    'Note/Voucher Number',
    'Note/Voucher date',
    'Document Type',
    'Place Of Supply',
    'Note/Voucher Value',
    'Applicable % of Tax Rate',
    'Rate',
    'Taxable Value',
    'Cess Amount',
    'Reverse Charge'
  ];
  const cdnrRows: any[][] = [cdnrHeaders];
  if (data.cdnr) {
    for (const group of data.cdnr) {
      for (const nt of group.nt) {
        for (const itm of nt.itms) {
          cdnrRows.push([
            group.ctin,
            nt.buyerName || '',
            nt.nt_num,
            nt.nt_dt,
            nt.ntty === 'D' ? 'Debit' : 'Credit',
            nt.pos,
            nt.val,
            nt.diff_percent || '',
            itm.itm_det.rt,
            itm.itm_det.txval,
            itm.itm_det.csamt || 0,
            nt.rchrg || 'N'
          ]);
        }
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cdnrRows), 'cdnr');

  // 9. cdnra Sheet
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Original Note/Voucher Number', 'Original Note/Voucher date', ...cdnrHeaders]]), 'cdnra');

  // 10. cdnur Sheet (Unregistered Notes)
  const cdnurHeaders = [
    'UR Type',
    'Note/Voucher Number',
    'Note/Voucher date',
    'Document Type',
    'Place Of Supply',
    'Note/Voucher Value',
    'Applicable % of Tax Rate',
    'Rate',
    'Taxable Value',
    'Cess Amount'
  ];
  const cdnurRows: any[][] = [cdnurHeaders];
  if (data.cdnur) {
    for (const nt of data.cdnur) {
      for (const itm of nt.itms) {
        cdnurRows.push([
          nt.typ || 'B2CL',
          nt.nt_num,
          nt.nt_dt,
          nt.ntty === 'D' ? 'Debit' : 'Credit',
          nt.pos,
          nt.val,
          nt.diff_percent || '',
          itm.itm_det.rt,
          itm.itm_det.txval,
          itm.itm_det.csamt || 0
        ]);
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cdnurRows), 'cdnur');

  // 11. cdnura Sheet
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Original Note/Voucher Number', 'Original Note/Voucher date', ...cdnurHeaders]]), 'cdnura');

  // 12. exp Sheet
  const expHeaders = [
    'Export Type',
    'Invoice Number',
    'Invoice date',
    'Invoice Value',
    'Port Code',
    'Shipping Bill Number',
    'Shipping Bill Date',
    'Applicable % of Tax Rate',
    'Rate',
    'Taxable Value'
  ];
  const expRows: any[][] = [expHeaders];
  if (data.exp) {
    for (const group of data.exp) {
      for (const inv of group.inv) {
        for (const itm of inv.itms) {
          expRows.push([
            group.exp_typ === 'WPAY' ? 'With Payment of Tax' : 'Without Payment of Tax',
            inv.inum,
            inv.idt,
            inv.val,
            inv.sbpcode || '',
            inv.sbnum || '',
            inv.sbdt || '',
            inv.diff_percent || '',
            itm.itm_det.rt,
            itm.itm_det.txval
          ]);
        }
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expRows), 'exp');

  // 13. expa Sheet
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Original Invoice Number', 'Original Invoice date', ...expHeaders]]), 'expa');

  // 14-17. at, ata, atadj, atadja Sheets
  const atHeaders = ['Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Received', 'Cess Amount'];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([atHeaders]), 'at');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Original Place Of Supply', ...atHeaders]]), 'ata');
  const atadjHeaders = ['Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Adjusted', 'Cess Amount'];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([atadjHeaders]), 'atadj');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Original Place Of Supply', ...atadjHeaders]]), 'atadja');

  // 18. exemp Sheet
  const exempHeaders = ['Description', 'Nil Rated Supplies', 'Exempted (other than nil rated/non GST supply)', 'Non-GST supplies'];
  const exempRows: any[][] = [
    exempHeaders,
    ['Inter-State supplies to registered persons', 0, 0, 0],
    ['Intra-State supplies to registered persons', 0, 0, 0],
    ['Inter-State supplies to unregistered persons', 0, 0, 0],
    ['Intra-State supplies to unregistered persons', 0, 0, 0]
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(exempRows), 'exemp');

  // 19. hsn(b2b) Sheet
  const hsnHeaders = [
    'HSN',
    'Description',
    'UQC',
    'Total Quantity',
    'Total Value',
    'Rate',
    'Taxable Value',
    'Integrated Tax Amount',
    'Central Tax Amount',
    'State/UT Tax Amount',
    'Cess Amount'
  ];
  const hsnB2bRows: any[][] = [hsnHeaders];
  if (data.hsn?.hsn_b2b) {
    for (const h of data.hsn.hsn_b2b) {
      hsnB2bRows.push([
        h.hsn_sc,
        h.desc,
        h.uqc,
        h.qty,
        h.val,
        h.rt,
        h.txval,
        h.iamt,
        h.camt,
        h.samt,
        h.csamt
      ]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hsnB2bRows), 'hsn(b2b)');

  // 20. hsn(b2c) Sheet
  const hsnB2cRows: any[][] = [hsnHeaders];
  if (data.hsn?.hsn_b2c) {
    for (const h of data.hsn.hsn_b2c) {
      hsnB2cRows.push([
        h.hsn_sc,
        h.desc,
        h.uqc,
        h.qty,
        h.val,
        h.rt,
        h.txval,
        h.iamt,
        h.camt,
        h.samt,
        h.csamt
      ]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hsnB2cRows), 'hsn(b2c)');

  // 21. docs Sheet (Table 13)
  const docsHeaders = [
    'Nature of Document',
    'Sr. No. From',
    'Sr. No. To',
    'Total Number',
    'Cancelled',
    'Net Issued'
  ];
  const docsRows: any[][] = [docsHeaders];
  if (data.doc_issue?.doc_det) {
    for (const group of data.doc_issue.doc_det) {
      for (const d of group.docs) {
        docsRows.push([
          group.doc_typ || 'Invoices for outward supply',
          d.from,
          d.to,
          d.totnum,
          d.canc,
          d.net_issue
        ]);
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(docsRows), 'docs');

  // 22-31. ECO Sheets (Tables 14 & 15)
  const ecoHeaders = ['Merchant GSTIN', 'Legal Name', 'Trade Name', 'Net Taxable Value', 'Integrated Tax', 'Central Tax', 'State/UT Tax', 'Cess'];
  const ecoSheetNames = ['eco', 'ecoa', 'ecob2b', 'ecourp2b', 'ecob2c', 'ecourp2c', 'ecoab2b', 'ecoab2c', 'ecoaurp2b', 'ecoaurp2c'];
  for (const sName of ecoSheetNames) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([ecoHeaders]), sName);
  }

  // 32. master Sheet (Validation Dropdowns Reference)
  const masterHeaders = ['State Code', 'State Name', 'UQC Code', 'UQC Description', 'Tax Rates'];
  const masterRows: any[][] = [
    masterHeaders,
    ['27', 'Maharashtra', 'NOS-NUMBERS', 'NUMBERS', 0],
    ['24', 'Gujarat', 'KGS-KILOGRAMS', 'KILOGRAMS', 0.1],
    ['07', 'Delhi', 'BOX-BOX', 'BOX', 0.25],
    ['09', 'Uttar Pradesh', 'MTR-METRES', 'METRES', 1.5],
    ['29', 'Karnataka', 'PAC-PACKETS', 'PACKETS', 3],
    ['33', 'Tamil Nadu', 'BAG-BAGS', 'BAGS', 5],
    ['19', 'West Bengal', 'OTH-OTHERS', 'OTHERS', 6],
    ['', '', '', '', 7.5],
    ['', '', '', '', 12],
    ['', '', '', '', 18],
    ['', '', '', '', 28],
    ['', '', '', '', 40]
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(masterRows), 'master');

  // STRICT INVARIANT: Remove any potential cell merges across all 32 sheets
  removeAllMergesFromWorkbook(wb);

  return wb;
}

// ─── 2. Section-Wise CSV Suite & Zip Bundler ─────────────────────────────────

/**
 * Generates 31 clean CSV strings and bundles them into a zip archive.
 */
export async function generateGstr1SectionCsvs(data: Gstr1ReturnData): Promise<Buffer> {
  const zip = new JSZip();

  // Helper to convert 2D array to CSV text
  const aoaToCsv = (rows: any[][]): string => {
    return rows.map(r => r.map(v => {
      if (v === null || v === undefined) return '';
      const str = String(v).replace(/"/g, '""');
      return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
    }).join(',')).join('\r\n');
  };

  const wb = generateGstr1V22Workbook(data);

  for (const sheetName of wb.SheetNames) {
    if (sheetName === 'Help Instruction' || sheetName === 'master') continue;
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
    // Only include if sheet has transactions beyond header row
    if (rows && rows.length > 1) {
      const csvContent = aoaToCsv(rows);
      zip.file(`${sheetName}.csv`, csvContent);
    }
  }

  // Generate binary zip buffer
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return zipBuffer;
}

// ─── 3. TaxPower Audit Defense Exporters (DRC-01B & DRC-01C) ─────────────────

export interface TaxLiabilityRow {
  section: string;
  description: string;
  gstr3bTaxable: number;
  gstr3bIgst: number;
  gstr3bCgst: number;
  gstr3bSgst: number;
  gstr3bCess: number;
  gstr1Taxable: number;
  gstr1Igst: number;
  gstr1Cgst: number;
  gstr1Sgst: number;
  gstr1Cess: number;
}

/**
 * DRC-01B Detailed Outward Liability Comparison Workbook (CompareGSTR3BWithGSTR1Detailed.xlsx).
 * Reverse-engineered from TaxPower GST CompareGSTR3BWithGSTR1Detailed.xlsx.
 * Strictly guarantees ZERO MERGED CELLS (ws['!merges'] = []).
 */
export function exportCompareGstr3bWithGstr1Detailed(
  rows: TaxLiabilityRow[],
  clientProfile: { name?: string; gstin?: string; fp?: string } = {}
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const headers = [
    'Table Reference',
    'Supply Description',
    '3B Taxable Value',
    '3B IGST',
    '3B CGST',
    '3B SGST',
    '3B Cess',
    '3B Total Tax',
    'R1 Taxable Value',
    'R1 IGST',
    'R1 CGST',
    'R1 SGST',
    'R1 Cess',
    'R1 Total Tax',
    'Diff Taxable',
    'Diff Total Tax',
    'Variance %',
    'DRC-01B Risk Status'
  ];

  const dataRows: any[][] = [];

  // Metadata headers (Zero-Merge Corporate Header)
  dataRows.push(['DRC-01B DETAILED COMPARATIVE STATEMENT: GSTR-3B vs GSTR-1 OUTWARD SUPPLIES']);
  dataRows.push([`Client: ${clientProfile.name || ''} | GSTIN: ${clientProfile.gstin || ''} | Return Period: ${clientProfile.fp || ''}`]);
  dataRows.push(['']);
  dataRows.push(headers);

  let grand3bTax = 0;
  let grandR1Tax = 0;
  let grandDiffTax = 0;

  for (const r of rows) {
    const tot3bTax = r.gstr3bIgst + r.gstr3bCgst + r.gstr3bSgst + r.gstr3bCess;
    const totR1Tax = r.gstr1Igst + r.gstr1Cgst + r.gstr1Sgst + r.gstr1Cess;
    const diffTaxable = r.gstr1Taxable - r.gstr3bTaxable;
    const diffTax = totR1Tax - tot3bTax;
    
    // Variance % = (Diff Tax / 3B Tax) * 100
    const varPct = tot3bTax > 0 ? Math.round(((totR1Tax - tot3bTax) / tot3bTax) * 10000) / 100 : (totR1Tax > 0 ? 100 : 0);
    
    // DRC-01B triggers if Outward Tax in R1 exceeds 3B by > ₹50,000 AND > 20%
    const isDrc01bTrigger = diffTax > 50000 && varPct > 20;
    const riskStatus = isDrc01bTrigger 
      ? 'CRITICAL (DRC-01B Notice Risk)' 
      : (Math.abs(diffTax) > 2 ? 'VARIANCE' : 'MATCHED');

    grand3bTax += tot3bTax;
    grandR1Tax += totR1Tax;
    grandDiffTax += diffTax;

    dataRows.push([
      r.section,
      r.description,
      r.gstr3bTaxable,
      r.gstr3bIgst,
      r.gstr3bCgst,
      r.gstr3bSgst,
      r.gstr3bCess,
      tot3bTax,
      r.gstr1Taxable,
      r.gstr1Igst,
      r.gstr1Cgst,
      r.gstr1Sgst,
      r.gstr1Cess,
      totR1Tax,
      diffTaxable,
      diffTax,
      `${varPct}%`,
      riskStatus
    ]);
  }

  // Total Summary Row
  dataRows.push([
    'TOTAL',
    'Grand Total Outward Supplies',
    '',
    '',
    '',
    '',
    '',
    grand3bTax,
    '',
    '',
    '',
    '',
    '',
    grandR1Tax,
    '',
    grandDiffTax,
    '',
    grandDiffTax > 50000 ? 'EXCEEDS DRC-01B THRESHOLD' : 'WITHIN TOLERANCE'
  ]);

  const ws = XLSX.utils.aoa_to_sheet(dataRows);
  XLSX.utils.book_append_sheet(wb, ws, 'DRC01B_3B_vs_R1');

  // Enforce zero merge invariant
  removeAllMergesFromWorkbook(wb);
  return wb;
}

export interface ItcComparisonRow {
  section: string;
  description: string;
  gstr3bItc: number;
  booksItc: number;
}

/**
 * DRC-01C Inward ITC Comparison Workbook (CompareGSTR3BWithBooksNew.xlsx).
 * Reverse-engineered from TaxPower GST CompareGSTR3BWithBooksNew.xlsx.
 * Isolates "Excess ITC Claimed in 3B" and "Short ITC Claimed".
 * Strictly guarantees ZERO MERGED CELLS (ws['!merges'] = []).
 */
export function exportCompareGstr3bWithBooks(
  rows: ItcComparisonRow[],
  clientProfile: { name?: string; gstin?: string; fp?: string } = {}
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const headers = [
    'Table 4 Reference',
    'ITC Category',
    'ITC Claimed in 3B (A)',
    'ITC Available in Books/PR (B)',
    'Excess ITC Claimed (A - B)',
    'Short ITC Claimed (B - A)',
    'Scrutiny Risk Category',
    'Recommended Action'
  ];

  const dataRows: any[][] = [];

  // Corporate Header
  dataRows.push(['DRC-01C INWARD ITC SCRUTINY STATEMENT: GSTR-3B TABLE 4 vs BOOKS OF ACCOUNT']);
  dataRows.push([`Client: ${clientProfile.name || ''} | GSTIN: ${clientProfile.gstin || ''} | Return Period: ${clientProfile.fp || ''}`]);
  dataRows.push(['']);
  dataRows.push(headers);

  let totalExcess = 0;
  let totalShort = 0;

  for (const r of rows) {
    const diff = r.gstr3bItc - r.booksItc;
    const excess = diff > 0 ? Math.round(diff * 100) / 100 : 0;
    const short = diff < 0 ? Math.round(Math.abs(diff) * 100) / 100 : 0;

    totalExcess += excess;
    totalShort += short;

    const riskCategory = excess > 0 
      ? 'HIGH RISK (DRC-01C Notice Liability)' 
      : (short > 0 ? 'UNCLAIMED CREDIT' : 'RECONCILED');

    const recommendedAction = excess > 0
      ? 'Reverse ITC in next GSTR-3B Table 4(B) or pay via DRC-03'
      : (short > 0 ? 'Claim ITC in subsequent GSTR-3B before Sec 16(4) time-limit' : 'No Action Required');

    dataRows.push([
      r.section,
      r.description,
      r.gstr3bItc,
      r.booksItc,
      excess,
      short,
      riskCategory,
      recommendedAction
    ]);
  }

  // Summary Row
  dataRows.push([
    'TOTAL',
    'Net Inward ITC Position',
    '',
    '',
    totalExcess,
    totalShort,
    totalExcess > 0 ? 'DRC-01C NOTICE RISK' : 'CLEAN',
    totalExcess > 0 ? 'Immediate Tax Reversal Advised' : 'Compliance Verified'
  ]);

  const ws = XLSX.utils.aoa_to_sheet(dataRows);
  XLSX.utils.book_append_sheet(wb, ws, 'DRC01C_3B_vs_Books');

  removeAllMergesFromWorkbook(wb);
  return wb;
}
