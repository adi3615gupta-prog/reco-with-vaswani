/**
 * gstrAutoIngest.ts — Full Auto-Mode Ingestion Engine for GSTR-1 and GSTR-2B
 * 
 * Supports:
 * - Official GSTR-1 Portal JSON & Excel files (.json, .xlsx)
 * - Official GSTR-2B Portal JSON, Excel & ZIP archives (.json, .xlsx, .zip)
 * - Smart auto-detection of file types
 * - Automatic mapping into GSTR-3B Table 3.1 (Outward) & Table 4 (Inward ITC / RCM)
 * - Rule 88A set-off cascade recalculation
 */

import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  GSTR3BMonthKey,
  GSTR3BMonthData,
  GSTR3BAnnualWorking,
  TaxBreakdown,
  createEmptyTaxBreakdown,
  recalculateAnnualWorking
} from './gstr3bEngine';

export interface Gstr1IngestSummary {
  gstin: string;
  period: string; // e.g. "042024" or "April 2024"
  monthKey?: GSTR3BMonthKey;
  fileType: 'JSON' | 'EXCEL';
  fileName: string;
  counts: {
    b2b: number;
    b2cl: number;
    b2cs: number;
    exp: number;
    nil: number;
    cdnr: number;
    at: number;
    totalDocs: number;
  };
  breakdowns: {
    b2b: TaxBreakdown;
    b2c: TaxBreakdown;
    zeroRated: TaxBreakdown;
    nilRated: TaxBreakdown;
    exempt: TaxBreakdown;
    creditNote: TaxBreakdown;
    advanceReceived: TaxBreakdown;
    advanceAdjusted: TaxBreakdown;
    rcmOutward: TaxBreakdown;
  };
  totalOutwardTaxable: number;
  totalOutwardTax: number;
}

export interface Gstr2bIngestSummary {
  gstin: string;
  period: string;
  monthKey?: GSTR3BMonthKey;
  fileType: 'JSON' | 'EXCEL' | 'ZIP';
  fileName: string;
  counts: {
    b2b: number;
    b2ba: number;
    cdnr: number;
    isd: number;
    impg: number;
    totalInvoices: number;
  };
  eligibleItc: TaxBreakdown;       // Table 4(A)(5) All other ITC (strictly non-RCM)
  rcmInward: TaxBreakdown;         // Table 3.1(d) & Table 4(A)(3) Inward Reverse Charge Supplies
  creditNotes: TaxBreakdown;       // 2B Supplier Credit Notes (Row 38 (-) Debit Notes which reduces ITC)
  debitNotes: TaxBreakdown;        // 2B Supplier Debit Notes (Row 36 (+) Credit Notes which increases ITC)
  importGoods: TaxBreakdown;       // Table 4(A)(1) Import of Goods
  isd: TaxBreakdown;               // Table 4(A)(4) ISD
  ineligibleItc: TaxBreakdown;     // Table 4(B) Ineligible ITC
  netEligibleTotal: number;        // Net available ITC for set-off
}

export interface IngestResult {
  gstr1?: Gstr1IngestSummary;
  gstr2b?: Gstr2bIngestSummary;
  error?: string;
}

// ─── UTILITY HELPERS ──────────────────────────────────────────────────────────

const cleanNum = (val: unknown): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const str = String(val).replace(/[₹,\s]/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.round((num + Number.EPSILON) * 100) / 100;
};

const cleanStr = (val: unknown): string => {
  if (val === undefined || val === null) return '';
  return String(val).trim();
};

const mapFpToMonthKey = (fp: string): GSTR3BMonthKey | undefined => {
  if (!fp) return undefined;
  // fp can be "042024" (MMYYYY), "42024", or text like "April 2024", "April"
  const cleaned = fp.replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
  if (cleaned.startsWith('apr') || cleaned.startsWith('04') || cleaned.startsWith('4')) return 'April';
  if (cleaned.startsWith('may') || cleaned.startsWith('05') || cleaned.startsWith('5')) return 'May';
  if (cleaned.startsWith('jun') || cleaned.startsWith('06') || cleaned.startsWith('6')) return 'June';
  if (cleaned.startsWith('jul') || cleaned.startsWith('07') || cleaned.startsWith('7')) return 'July';
  if (cleaned.startsWith('aug') || cleaned.startsWith('08') || cleaned.startsWith('8')) return 'August';
  if (cleaned.startsWith('sep') || cleaned.startsWith('09') || cleaned.startsWith('9')) return 'September';
  if (cleaned.startsWith('oct') || cleaned.startsWith('10')) return 'October';
  if (cleaned.startsWith('nov') || cleaned.startsWith('11')) return 'November';
  if (cleaned.startsWith('dec') || cleaned.startsWith('12')) return 'December';
  if (cleaned.startsWith('jan') || cleaned.startsWith('01') || cleaned.startsWith('1')) return 'January';
  if (cleaned.startsWith('feb') || cleaned.startsWith('02') || cleaned.startsWith('2')) return 'February';
  if (cleaned.startsWith('mar') || cleaned.startsWith('03') || cleaned.startsWith('3')) return 'March';
  return undefined;
};

// ─── GSTR-1 PARSER (JSON & EXCEL) ─────────────────────────────────────────────

export async function parseGstr1JsonContent(rawJson: any, fileName: string = 'GSTR-1.json'): Promise<Gstr1IngestSummary> {
  const gstin = cleanStr(
    rawJson.gstin ||
    rawJson.data?.gstin ||
    fileName.match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/i)?.[0] ||
    ''
  );
  const fp = cleanStr(
    rawJson.fp ||
    rawJson.data?.fp ||
    rawJson.rtnprd ||
    rawJson.data?.rtnprd ||
    fileName.match(/(?:^|_|R1_)(\d{6})(?:_|\.|$)/)?.[1] ||
    fileName.match(/(?:^|_|R1_)(\d{2}\d{4})(?:_|\.|$)/)?.[1] ||
    ''
  );
  const monthKey = mapFpToMonthKey(fp) || mapFpToMonthKey(fileName);
  let period = fp;
  if (monthKey) {
    const yrMatch = fp.match(/\d{4}$/) || fileName.match(/20\d{2}/);
    period = yrMatch ? `${monthKey} ${yrMatch[0]}` : monthKey;
  }

  const root = rawJson.data || rawJson;

  const b2b = createEmptyTaxBreakdown();
  const b2c = createEmptyTaxBreakdown();
  const zeroRated = createEmptyTaxBreakdown();
  const nilRated = createEmptyTaxBreakdown();
  const exempt = createEmptyTaxBreakdown();
  const creditNote = createEmptyTaxBreakdown();
  const advanceReceived = createEmptyTaxBreakdown();
  const advanceAdjusted = createEmptyTaxBreakdown();
  const rcmOutward = createEmptyTaxBreakdown();

  let b2bCount = 0;
  let b2clCount = 0;
  let b2csCount = 0;
  let expCount = 0;
  let nilCount = 0;
  let cdnrCount = 0;
  let atCount = 0;

  // 1. B2B Invoices
  const b2bList = root.b2b || [];
  for (const group of b2bList) {
    for (const inv of (group.inv || [])) {
      b2bCount++;
      const isRcm = cleanStr(inv.rchrg).toUpperCase() === 'Y';
      for (const itm of (inv.itms || inv.items || [])) {
        const d = itm.itm_det || itm;
        const txval = cleanNum(d.txval);
        const igst = cleanNum(d.iamt || d.igst);
        const cgst = cleanNum(d.camt || d.cgst);
        const sgst = cleanNum(d.samt || d.sgst);

        b2b.taxable += txval;
        b2b.igst += igst;
        b2b.cgst += cgst;
        b2b.sgst += sgst;

        if (isRcm) {
          rcmOutward.taxable += txval;
          rcmOutward.igst += igst;
          rcmOutward.cgst += cgst;
          rcmOutward.sgst += sgst;
        }
      }
    }
  }

  // 2. B2CL (Interstate large)
  const b2clList = root.b2cl || [];
  for (const group of b2clList) {
    for (const inv of (group.inv || [])) {
      b2clCount++;
      for (const itm of (inv.itms || inv.items || [])) {
        const d = itm.itm_det || itm;
        const txval = cleanNum(d.txval);
        const igst = cleanNum(d.iamt || d.igst);
        b2c.taxable += txval;
        b2c.igst += igst;
      }
    }
  }

  // 3. B2CS (Intrastate & Interstate small)
  const b2csList = root.b2cs || [];
  for (const row of b2csList) {
    b2csCount++;
    const txval = cleanNum(row.txval);
    const igst = cleanNum(row.iamt || row.igst);
    const cgst = cleanNum(row.camt || row.cgst);
    const sgst = cleanNum(row.samt || row.sgst);
    b2c.taxable += txval;
    b2c.igst += igst;
    b2c.cgst += cgst;
    b2c.sgst += sgst;
  }

  // 4. EXP (Exports / Zero rated)
  const expList = root.exp || [];
  for (const group of expList) {
    for (const inv of (group.inv || [])) {
      expCount++;
      for (const itm of (inv.itms || inv.items || [])) {
        const d = itm.itm_det || itm;
        zeroRated.taxable += cleanNum(d.txval);
        zeroRated.igst += cleanNum(d.iamt || d.igst);
      }
    }
  }

  // 5. NIL / EXEMPT
  const nilInv = root.nil?.inv || [];
  for (const n of nilInv) {
    nilCount++;
    nilRated.taxable += cleanNum(n.nil_amt);
    exempt.taxable += cleanNum(n.expt_amt) + cleanNum(n.ngsup_amt);
  }

  // 6. CDNR & CDNUR (Credit & Debit Notes)
  const cdnrList = [...(root.cdnr || []), ...(root.cdnur || [])];
  for (const group of cdnrList) {
    const notes = group.nt || [group];
    for (const nt of notes) {
      if (!nt.nt_num && !nt.inum) continue;
      cdnrCount++;
      const isCredit = cleanStr(nt.ntty).toUpperCase().startsWith('C');
      const factor = isCredit ? 1 : -1; // In 3B, credit notes are subtracted, so positive in creditNote row

      for (const itm of (nt.itms || nt.items || [])) {
        const d = itm.itm_det || itm;
        creditNote.taxable += cleanNum(d.txval) * factor;
        creditNote.igst += cleanNum(d.iamt || d.igst) * factor;
        creditNote.cgst += cleanNum(d.camt || d.cgst) * factor;
        creditNote.sgst += cleanNum(d.samt || d.sgst) * factor;
      }
    }
  }

  // 7. AT (Advances Received) & ATADJ (Advances Adjusted)
  const atList = root.at || [];
  for (const row of atList) {
    atCount++;
    for (const itm of (row.itms || row.items || [])) {
      const d = itm.itm_det || itm;
      advanceReceived.taxable += cleanNum(d.ad_amt || d.txval);
      advanceReceived.igst += cleanNum(d.iamt || d.igst);
      advanceReceived.cgst += cleanNum(d.camt || d.cgst);
      advanceReceived.sgst += cleanNum(d.samt || d.sgst);
    }
  }

  const atadjList = root.atadj || [];
  for (const row of atadjList) {
    for (const itm of (row.itms || row.items || [])) {
      const d = itm.itm_det || itm;
      advanceAdjusted.taxable += cleanNum(d.ad_amt || d.txval);
      advanceAdjusted.igst += cleanNum(d.iamt || d.igst);
      advanceAdjusted.cgst += cleanNum(d.camt || d.cgst);
      advanceAdjusted.sgst += cleanNum(d.samt || d.sgst);
    }
  }

  // Compute sub-totals
  [b2b, b2c, zeroRated, nilRated, exempt, creditNote, advanceReceived, advanceAdjusted, rcmOutward].forEach(tb => {
    tb.taxable = Math.round(tb.taxable * 100) / 100;
    tb.igst = Math.round(tb.igst * 100) / 100;
    tb.cgst = Math.round(tb.cgst * 100) / 100;
    tb.sgst = Math.round(tb.sgst * 100) / 100;
    tb.total = Math.round((tb.igst + tb.cgst + tb.sgst) * 100) / 100;
  });

  const totalTaxable = Math.round((b2b.taxable + b2c.taxable + zeroRated.taxable + nilRated.taxable + exempt.taxable - creditNote.taxable) * 100) / 100;
  const totalTax = Math.round((b2b.total + b2c.total + zeroRated.total - creditNote.total) * 100) / 100;

  return {
    gstin,
    period: fp,
    monthKey,
    fileType: 'JSON',
    fileName,
    counts: {
      b2b: b2bCount,
      b2cl: b2clCount,
      b2cs: b2csCount,
      exp: expCount,
      nil: nilCount,
      cdnr: cdnrCount,
      at: atCount,
      totalDocs: b2bCount + b2clCount + b2csCount + expCount + nilCount + cdnrCount + atCount
    },
    breakdowns: {
      b2b,
      b2c,
      zeroRated,
      nilRated,
      exempt,
      creditNote,
      advanceReceived,
      advanceAdjusted,
      rcmOutward
    },
    totalOutwardTaxable: totalTaxable,
    totalOutwardTax: totalTax
  };
}

export async function parseGstr1ExcelContent(buffer: ArrayBuffer, fileName: string = 'GSTR-1.xlsx'): Promise<Gstr1IngestSummary> {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetNames = wb.SheetNames.map(s => s.toUpperCase());

  const b2b = createEmptyTaxBreakdown();
  const b2c = createEmptyTaxBreakdown();
  const zeroRated = createEmptyTaxBreakdown();
  const nilRated = createEmptyTaxBreakdown();
  const exempt = createEmptyTaxBreakdown();
  const creditNote = createEmptyTaxBreakdown();
  const advanceReceived = createEmptyTaxBreakdown();
  const advanceAdjusted = createEmptyTaxBreakdown();
  const rcmOutward = createEmptyTaxBreakdown();

  let b2bCount = 0;
  let b2clCount = 0;
  let b2csCount = 0;
  let expCount = 0;
  let nilCount = 0;
  let cdnrCount = 0;
  let atCount = 0;
  let detectedGstin = '';
  let detectedPeriod = '';

  const scanSheet = (targetPattern: string, cb: (row: Record<string, any>) => void) => {
    const sName = wb.SheetNames.find(n => n.toUpperCase().includes(targetPattern));
    if (!sName) return;
    const sheet = wb.Sheets[sName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
    for (const r of rows) {
      if (!detectedGstin) {
        const g = cleanStr(r['GSTIN/UIN'] || r['GSTIN'] || r['Supplier GSTIN'] || r['ctin']);
        if (g && g.length === 15) detectedGstin = g;
      }
      cb(r);
    }
  };

  // 1. B2B Sheet
  scanSheet('B2B', row => {
    const txval = cleanNum(row['Taxable Value'] || row['taxable_value'] || row['txval']);
    if (txval === 0 && !row['Invoice Number'] && !row['inum']) return;
    b2bCount++;
    const igst = cleanNum(row['Integrated Tax'] || row['IGST'] || row['iamt']);
    const cgst = cleanNum(row['Central Tax'] || row['CGST'] || row['camt']);
    const sgst = cleanNum(row['State/UT Tax'] || row['SGST'] || row['samt']);
    b2b.taxable += txval;
    b2b.igst += igst;
    b2b.cgst += cgst;
    b2b.sgst += sgst;

    const isRcm = cleanStr(row['Reverse Charge'] || row['rchrg']).toLowerCase().startsWith('y');
    if (isRcm) {
      rcmOutward.taxable += txval;
      rcmOutward.igst += igst;
      rcmOutward.cgst += cgst;
      rcmOutward.sgst += sgst;
    }
  });

  // 2. B2CL Sheet
  scanSheet('B2CL', row => {
    const txval = cleanNum(row['Taxable Value'] || row['txval']);
    if (txval === 0) return;
    b2clCount++;
    const igst = cleanNum(row['Integrated Tax'] || row['IGST'] || row['iamt']);
    b2c.taxable += txval;
    b2c.igst += igst;
  });

  // 3. B2CS Sheet
  scanSheet('B2CS', row => {
    const txval = cleanNum(row['Taxable Value'] || row['txval']);
    if (txval === 0) return;
    b2csCount++;
    const igst = cleanNum(row['Integrated Tax'] || row['IGST'] || row['iamt']);
    const cgst = cleanNum(row['Central Tax'] || row['CGST'] || row['camt']);
    const sgst = cleanNum(row['State/UT Tax'] || row['SGST'] || row['samt']);
    b2c.taxable += txval;
    b2c.igst += igst;
    b2c.cgst += cgst;
    b2c.sgst += sgst;
  });

  // 4. EXP Sheet
  scanSheet('EXP', row => {
    const txval = cleanNum(row['Taxable Value'] || row['txval']);
    if (txval === 0) return;
    expCount++;
    const igst = cleanNum(row['Integrated Tax'] || row['IGST'] || row['iamt']);
    zeroRated.taxable += txval;
    zeroRated.igst += igst;
  });

  // 5. CDNR / CDNUR Sheet
  const handleCdnr = (row: Record<string, any>) => {
    const txval = cleanNum(row['Taxable Value'] || row['txval']);
    if (txval === 0) return;
    cdnrCount++;
    const isCredit = cleanStr(row['Note Type'] || row['Document Type'] || row['ntty']).toLowerCase().includes('c');
    const factor = isCredit ? 1 : -1;
    creditNote.taxable += txval * factor;
    creditNote.igst += cleanNum(row['Integrated Tax'] || row['IGST'] || row['iamt']) * factor;
    creditNote.cgst += cleanNum(row['Central Tax'] || row['CGST'] || row['camt']) * factor;
    creditNote.sgst += cleanNum(row['State/UT Tax'] || row['SGST'] || row['samt']) * factor;
  };
  scanSheet('CDNR', handleCdnr);
  scanSheet('CDNUR', handleCdnr);

  // 6. NIL / EXEMPT Sheet
  scanSheet('EXEMP', row => {
    nilCount++;
    nilRated.taxable += cleanNum(row['Nil Rated Supplies'] || row['nil_amt']);
    exempt.taxable += cleanNum(row['Exempted Supplies'] || row['expt_amt']) + cleanNum(row['Non-GST Supplies'] || row['ngsup_amt']);
  });

  // Round sub-totals
  [b2b, b2c, zeroRated, nilRated, exempt, creditNote, advanceReceived, advanceAdjusted, rcmOutward].forEach(tb => {
    tb.taxable = Math.round(tb.taxable * 100) / 100;
    tb.igst = Math.round(tb.igst * 100) / 100;
    tb.cgst = Math.round(tb.cgst * 100) / 100;
    tb.sgst = Math.round(tb.sgst * 100) / 100;
    tb.total = Math.round((tb.igst + tb.cgst + tb.sgst) * 100) / 100;
  });

  const totalTaxable = Math.round((b2b.taxable + b2c.taxable + zeroRated.taxable + nilRated.taxable + exempt.taxable - creditNote.taxable) * 100) / 100;
  const totalTax = Math.round((b2b.total + b2c.total + zeroRated.total - creditNote.total) * 100) / 100;

  return {
    gstin: detectedGstin,
    period: detectedPeriod,
    monthKey: mapFpToMonthKey(detectedPeriod),
    fileType: 'EXCEL',
    fileName,
    counts: {
      b2b: b2bCount,
      b2cl: b2clCount,
      b2cs: b2csCount,
      exp: expCount,
      nil: nilCount,
      cdnr: cdnrCount,
      at: atCount,
      totalDocs: b2bCount + b2clCount + b2csCount + expCount + nilCount + cdnrCount + atCount
    },
    breakdowns: {
      b2b,
      b2c,
      zeroRated,
      nilRated,
      exempt,
      creditNote,
      advanceReceived,
      advanceAdjusted,
      rcmOutward
    },
    totalOutwardTaxable: totalTaxable,
    totalOutwardTax: totalTax
  };
}

// ─── GSTR-2B PARSER (JSON, EXCEL & ZIP) ────────────────────────────────────────

export async function parseGstr2bJsonContent(rawJson: any, fileName: string = 'GSTR-2B.json'): Promise<Gstr2bIngestSummary> {
  const gstin = cleanStr(
    rawJson.gstin ||
    rawJson.data?.gstin ||
    fileName.match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/i)?.[0] ||
    ''
  );
  const fp = cleanStr(
    rawJson.fp ||
    rawJson.data?.fp ||
    rawJson.rtnprd ||
    rawJson.data?.rtnprd ||
    fileName.match(/(?:^|_|R2B_)(\d{6})(?:_|\.|$)/)?.[1] ||
    fileName.match(/(?:^|_|R2B_)(\d{2}\d{4})(?:_|\.|$)/)?.[1] ||
    ''
  );
  const monthKey = mapFpToMonthKey(fp) || mapFpToMonthKey(fileName);
  let period = fp;
  if (monthKey) {
    const yrMatch = fp.match(/\d{4}$/) || fileName.match(/20\d{2}/);
    period = yrMatch ? `${monthKey} ${yrMatch[0]}` : monthKey;
  }

  const docData = rawJson.data?.docdata || rawJson.docdata || rawJson.data || rawJson;
  const itcSumm = rawJson.data?.itcsumm || rawJson.itcsumm;

  const eligibleItc = createEmptyTaxBreakdown();
  const rcmInward = createEmptyTaxBreakdown();
  const creditNotes = createEmptyTaxBreakdown();
  const debitNotes = createEmptyTaxBreakdown();
  const importGoods = createEmptyTaxBreakdown();
  const isd = createEmptyTaxBreakdown();
  const ineligibleItc = createEmptyTaxBreakdown();

  let b2bCount = 0;
  let b2baCount = 0;
  let cdnrCount = 0;
  let isdCount = 0;
  let impgCount = 0;

  const extractDocAmounts = (obj: any) => {
    let txval = 0, igst = 0, cgst = 0, sgst = 0, cess = 0;
    const items = obj.items || obj.itms;
    if (Array.isArray(items) && items.length > 0) {
      for (const itm of items) {
        const d = itm.itm_det || itm;
        txval += cleanNum(d.txval ?? itm.txval);
        igst += cleanNum(d.iamt ?? d.igst ?? itm.iamt ?? itm.igst);
        cgst += cleanNum(d.camt ?? d.cgst ?? itm.camt ?? itm.cgst);
        sgst += cleanNum(d.samt ?? d.sgst ?? itm.samt ?? itm.sgst);
        cess += cleanNum(d.csamt ?? d.cess ?? itm.csamt ?? itm.cess);
      }
    } else {
      txval = cleanNum(obj.txval);
      igst = cleanNum(obj.igst ?? obj.iamt);
      cgst = cleanNum(obj.cgst ?? obj.camt);
      sgst = cleanNum(obj.sgst ?? obj.samt);
      cess = cleanNum(obj.cess ?? obj.csamt);
    }
    return { txval, igst, cgst, sgst, cess };
  };

  // 1. Process B2B & B2BA
  const processB2bGroup = (list: any[], isAmend: boolean = false) => {
    for (const group of (list || [])) {
      for (const inv of (group.inv || [])) {
        if (isAmend) b2baCount++; else b2bCount++;
        const itcAvl = cleanStr(inv.itcavl || 'Y').toUpperCase() !== 'N';
        const isRcm = cleanStr(inv.rev || inv.rchrg || 'N').toUpperCase() === 'Y';
        const { txval, igst, cgst, sgst, cess } = extractDocAmounts(inv);

        if (isRcm) {
          rcmInward.taxable += txval;
          rcmInward.igst += igst;
          rcmInward.cgst += cgst;
          rcmInward.sgst += sgst;
          rcmInward.cess += cess;
        } else if (itcAvl) {
          eligibleItc.taxable += txval;
          eligibleItc.igst += igst;
          eligibleItc.cgst += cgst;
          eligibleItc.sgst += sgst;
          eligibleItc.cess += cess;
        } else {
          ineligibleItc.taxable += txval;
          ineligibleItc.igst += igst;
          ineligibleItc.cgst += cgst;
          ineligibleItc.sgst += sgst;
          ineligibleItc.cess += cess;
        }
      }
    }
  };
  processB2bGroup(docData.b2b, false);
  processB2bGroup(docData.b2ba, true);

  // 2. Process CDNR & CDNRA
  const processCdnrGroup = (list: any[]) => {
    for (const group of (list || [])) {
      for (const nt of (group.nt || [])) {
        cdnrCount++;
        const itcAvl = cleanStr(nt.itcavl || 'Y').toUpperCase() !== 'N';
        const isCredit = cleanStr(nt.typ || nt.ntty || 'C').toUpperCase().startsWith('C');
        const { txval, igst, cgst, sgst, cess } = extractDocAmounts(nt);

        if (isCredit) {
          if (itcAvl) {
            creditNotes.taxable += txval;
            creditNotes.igst += igst;
            creditNotes.cgst += cgst;
            creditNotes.sgst += sgst;
            creditNotes.cess += cess;
          } else {
            ineligibleItc.taxable += txval;
            ineligibleItc.igst += igst;
            ineligibleItc.cgst += cgst;
            ineligibleItc.sgst += sgst;
            ineligibleItc.cess += cess;
          }
        } else {
          if (itcAvl) {
            debitNotes.taxable += txval;
            debitNotes.igst += igst;
            debitNotes.cgst += cgst;
            debitNotes.sgst += sgst;
            debitNotes.cess += cess;
          }
        }
      }
    }
  };
  processCdnrGroup(docData.cdnr);
  processCdnrGroup(docData.cdnra);

  // 3. Process ISD
  for (const group of (docData.isd || [])) {
    for (const doc of (group.doclist || [])) {
      isdCount++;
      const { igst, cgst, sgst } = extractDocAmounts(doc);
      isd.igst += igst;
      isd.cgst += cgst;
      isd.sgst += sgst;
    }
  }

  // 4. Process IMPG & IMPGSEZ
  for (const doc of [...(docData.impg || []), ...(docData.impgsez || [])]) {
    impgCount++;
    const { igst, cess } = extractDocAmounts(doc);
    importGoods.igst += igst;
    importGoods.cess += cess;
  }

  // Authoritative reconciliation with itcsumm if present in JSON
  if (itcSumm?.itcavl) {
    const itc = itcSumm.itcavl;
    if (itc.nonrevsup) {
      eligibleItc.igst = cleanNum(itc.nonrevsup.igst);
      eligibleItc.cgst = cleanNum(itc.nonrevsup.cgst);
      eligibleItc.sgst = cleanNum(itc.nonrevsup.sgst);
      eligibleItc.cess = cleanNum(itc.nonrevsup.cess);
      if (itc.nonrevsup.txval) eligibleItc.taxable = cleanNum(itc.nonrevsup.txval);
    }
    if (itc.revsup) {
      rcmInward.igst = cleanNum(itc.revsup.igst);
      rcmInward.cgst = cleanNum(itc.revsup.cgst);
      rcmInward.sgst = cleanNum(itc.revsup.sgst);
      rcmInward.cess = cleanNum(itc.revsup.cess);
      if (itc.revsup.txval) rcmInward.taxable = cleanNum(itc.revsup.txval);
    }
    const cdnr = itc.othersup?.cdnr || itc.othersup;
    if (cdnr) {
      creditNotes.igst = cleanNum(cdnr.igst);
      creditNotes.cgst = cleanNum(cdnr.cgst);
      creditNotes.sgst = cleanNum(cdnr.sgst);
      creditNotes.cess = cleanNum(cdnr.cess);
      if (cdnr.txval) creditNotes.taxable = cleanNum(cdnr.txval);
    }
    if (itc.impg) {
      importGoods.igst = cleanNum(itc.impg.igst);
      importGoods.cess = cleanNum(itc.impg.cess);
    }
    if (itc.isd) {
      isd.igst = cleanNum(itc.isd.igst);
      isd.cgst = cleanNum(itc.isd.cgst);
      isd.sgst = cleanNum(itc.isd.sgst);
    }
  }

  [eligibleItc, rcmInward, creditNotes, debitNotes, importGoods, isd, ineligibleItc].forEach(tb => {
    tb.taxable = Math.round(tb.taxable * 100) / 100;
    tb.igst = Math.round(tb.igst * 100) / 100;
    tb.cgst = Math.round(tb.cgst * 100) / 100;
    tb.sgst = Math.round(tb.sgst * 100) / 100;
    tb.cess = Math.round(tb.cess * 100) / 100;
    tb.total = Math.round((tb.igst + tb.cgst + tb.sgst) * 100) / 100;
  });

  const totalInvoices = b2bCount + b2baCount + cdnrCount + isdCount + impgCount;
  const netEligibleTotal = Math.round(
    (eligibleItc.total + rcmInward.total + importGoods.total + isd.total + debitNotes.total - creditNotes.total - ineligibleItc.total) * 100
  ) / 100;

  return {
    gstin,
    period: fp,
    monthKey,
    fileType: 'JSON',
    fileName,
    counts: {
      b2b: b2bCount,
      b2ba: b2baCount,
      cdnr: cdnrCount,
      isd: isdCount,
      impg: impgCount,
      totalInvoices
    },
    eligibleItc,
    rcmInward,
    creditNotes,
    debitNotes,
    importGoods,
    isd,
    ineligibleItc,
    netEligibleTotal
  };
}

export async function parseGstr2bExcelContent(buffer: ArrayBuffer, fileName: string = 'GSTR-2B.xlsx'): Promise<Gstr2bIngestSummary> {
  const wb = XLSX.read(buffer, { type: 'array' });

  const eligibleItc = createEmptyTaxBreakdown();
  const rcmInward = createEmptyTaxBreakdown();
  const creditNotes = createEmptyTaxBreakdown();
  const debitNotes = createEmptyTaxBreakdown();
  const importGoods = createEmptyTaxBreakdown();
  const isd = createEmptyTaxBreakdown();
  const ineligibleItc = createEmptyTaxBreakdown();

  let b2bCount = 0;
  let b2baCount = 0;
  let cdnrCount = 0;
  let isdCount = 0;
  let impgCount = 0;
  let detectedGstin = fileName.match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/i)?.[0] || '';
  let detectedPeriod = '';

  // 1. Authoritative metadata from 'Read me' sheet
  const wsReadMe = wb.Sheets['Read me'] || wb.Sheets['read me'] || wb.Sheets['README'] || wb.Sheets['Read Me'];
  if (wsReadMe) {
    const rRows = XLSX.utils.sheet_to_json<any[]>(wsReadMe, { header: 1 });
    let rPeriod = '', rYear = '';
    for (const r of rRows) {
      if (!Array.isArray(r)) continue;
      const k = cleanStr(r[0]).toLowerCase();
      if (k.includes('gstin') && !detectedGstin) {
        detectedGstin = cleanStr(r[2] || r[1]);
      } else if (k.includes('tax period')) {
        rPeriod = cleanStr(r[2] || r[1]);
      } else if (k.includes('financial year')) {
        rYear = cleanStr(r[2] || r[1]);
      }
    }
    if (rPeriod) {
      const yr = rYear ? rYear.match(/20\d{2}/)?.[0] : '';
      detectedPeriod = yr ? `${rPeriod} ${yr}` : rPeriod;
    }
  }

  // Fallback period from filename: e.g. 092026_27AAGCD4105L1ZO_GSTR2B_23102026.xlsx -> "September 2026"
  if (!detectedPeriod) {
    const fnMatch = fileName.match(/(?:^|_)(\d{2})(\d{4})(?:_|\.|$)/);
    if (fnMatch) {
      const mKey = mapFpToMonthKey(fnMatch[1]);
      if (mKey) detectedPeriod = `${mKey} ${fnMatch[2]}`;
    }
  }

  // 2. Authoritative check: Sheet 'ITC Available'
  const wsAvail = wb.Sheets['ITC Available'] || wb.Sheets['itc available'] || wb.Sheets['ITC_AVAILABLE'];
  if (wsAvail) {
    const rows = XLSX.utils.sheet_to_json<any[]>(wsAvail, { header: 1 });
    let isPartB = false;
    for (const r of rows) {
      if (!Array.isArray(r)) continue;
      const text = r.map(c => cleanStr(c)).join(' ');
      if (text.includes('Part B')) {
        isPartB = true;
        continue;
      }

      if (!isPartB) {
        if (text.includes('4(A)(5)')) {
          eligibleItc.igst = cleanNum(r[3]);
          eligibleItc.cgst = cleanNum(r[4]);
          eligibleItc.sgst = cleanNum(r[5]);
          eligibleItc.cess = cleanNum(r[6]);
        } else if (text.includes('3.1(d)') || text.includes('4(A)(3)')) {
          rcmInward.igst = cleanNum(r[3]);
          rcmInward.cgst = cleanNum(r[4]);
          rcmInward.sgst = cleanNum(r[5]);
          rcmInward.cess = cleanNum(r[6]);
        } else if (text.includes('4(A)(1)')) {
          importGoods.igst = cleanNum(r[3]);
        } else if (text.includes('4(A)(4)')) {
          isd.igst = cleanNum(r[3]);
          isd.cgst = cleanNum(r[4]);
          isd.sgst = cleanNum(r[5]);
        }
      } else {
        // Part B: The summary row is Row 'I' / 'Others'
        if ((cleanStr(r[0]) === 'I' || cleanStr(r[1]).toLowerCase() === 'others') && text.includes('4(A)')) {
          creditNotes.igst = cleanNum(r[3]);
          creditNotes.cgst = cleanNum(r[4]);
          creditNotes.sgst = cleanNum(r[5]);
          creditNotes.cess = cleanNum(r[6]);
        }
      }
    }
  }

  const hasAuthoritativeSummary = Boolean(
    wsAvail && (eligibleItc.igst > 0 || eligibleItc.cgst > 0 || rcmInward.cgst > 0 || creditNotes.cgst > 0)
  );
  if (hasAuthoritativeSummary) {
    eligibleItc.total = Math.round((eligibleItc.igst + eligibleItc.cgst + eligibleItc.sgst) * 100) / 100;
    rcmInward.total = Math.round((rcmInward.igst + rcmInward.cgst + rcmInward.sgst) * 100) / 100;
    creditNotes.total = Math.round((creditNotes.igst + creditNotes.cgst + creditNotes.sgst) * 100) / 100;
  }

  // 3. Scan line item sheets for metadata, counts, and taxable values
  for (const sName of wb.SheetNames) {
    const upper = sName.toUpperCase();
    if (
      upper.includes('READ ME') ||
      upper.includes('ITC AVAILABLE') ||
      upper.includes('ITC NOT AVAILABLE') ||
      upper.includes('ITC REVERSAL')
    ) {
      continue;
    }

    const ws = wb.Sheets[sName];
    if (!ws) continue;
    const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
    if (!rawRows || rawRows.length < 5) continue;

    // Detect metadata from top rows
    for (let r = 0; r < Math.min(6, rawRows.length); r++) {
      const row = rawRows[r] || [];
      const r0 = cleanStr(row[0]).toLowerCase();
      if (r0.includes('gstin') && !detectedGstin) {
        const matched = (row[2] || row[1] || '').toString().match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/i);
        if (matched) detectedGstin = matched[0].toUpperCase();
      }
      if (r0.includes('period') && !detectedPeriod) {
        detectedPeriod = cleanStr(row[2] || row[1]);
      }
    }

    // Detect header index: look strictly for row containing 'GSTIN of supplier' or 'Supplier GSTIN'
    let headerRowIdx = -1;
    for (let r = 0; r < Math.min(10, rawRows.length); r++) {
      const joined = (rawRows[r] || []).map(c => cleanStr(c).toLowerCase()).join(' ');
      if (joined.includes('gstin of supplier') || joined.includes('supplier gstin')) {
        headerRowIdx = r;
        break;
      }
    }
    if (headerRowIdx === -1) continue;

    const r0 = rawRows[headerRowIdx] || [];
    const r1 = rawRows[headerRowIdx + 1] || [];
    const colMap: Record<string, number> = {};

    const maxCols = Math.max(r0.length, r1.length);
    for (let c = 0; c < maxCols; c++) {
      const combined = (cleanStr(r0[c]) + ' ' + cleanStr(r1[c])).toLowerCase();
      if (colMap.ctin === undefined && (combined.includes('gstin of supplier') || combined.includes('supplier gstin'))) colMap.ctin = c;
      if (colMap.inum === undefined && (combined.includes('invoice number') || combined.includes('note number') || combined.includes('doc no') || combined.includes('invoice no'))) colMap.inum = c;
      if (colMap.txval === undefined && combined.includes('taxable value')) colMap.txval = c;
      if (colMap.igst === undefined && (combined.includes('integrated tax') || combined === 'igst')) colMap.igst = c;
      if (colMap.cgst === undefined && (combined.includes('central tax') || combined === 'cgst')) colMap.cgst = c;
      if (colMap.sgst === undefined && (combined.includes('state/ut tax') || combined.includes('state tax') || combined === 'sgst')) colMap.sgst = c;
      if (colMap.cess === undefined && combined.includes('cess')) colMap.cess = c;
      if (colMap.rchrg === undefined && combined.includes('reverse charge')) colMap.rchrg = c;
      if (colMap.itcavl === undefined && (combined.includes('itc availability') || combined.includes('itc eligible'))) colMap.itcavl = c;
      if (colMap.ntty === undefined && (combined.includes('note type') || combined.includes('document type'))) colMap.ntty = c;
    }

    const dataStartIdx = (r1.some(x => {
      const s = cleanStr(x).toLowerCase();
      return s.includes('invoice') || s.includes('tax') || s.includes('note') || s.includes('date');
    })) ? headerRowIdx + 2 : headerRowIdx + 1;

    const isRejected = upper.includes('REJECTED');
    const isCdnr = upper.includes('CDNR');
    const isAmend = upper.includes('B2BA') || upper.includes('CDNRA');

    for (let r = dataStartIdx; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row) continue;
      const ctin = cleanStr(row[colMap.ctin]);
      if (!ctin || ctin.length < 10) continue;

      const txval = cleanNum(row[colMap.txval]);
      const igst = cleanNum(row[colMap.igst]);
      const cgst = cleanNum(row[colMap.cgst]);
      const sgst = cleanNum(row[colMap.sgst]);
      const cess = cleanNum(row[colMap.cess]);
      const isRcm = cleanStr(row[colMap.rchrg]).toLowerCase().startsWith('y');
      const itcAvl = !isRejected && cleanStr(row[colMap.itcavl]).toLowerCase() !== 'no';

      if (isCdnr) {
        cdnrCount++;
        const isCredit = cleanStr(row[colMap.ntty]).toLowerCase().includes('credit') || !cleanStr(row[colMap.ntty]).toLowerCase().includes('debit');
        if (isCredit) {
          if (itcAvl) {
            creditNotes.taxable += txval;
            if (creditNotes.total === 0) {
              creditNotes.igst += igst;
              creditNotes.cgst += cgst;
              creditNotes.sgst += sgst;
              creditNotes.cess += cess;
            }
          } else {
            ineligibleItc.taxable += txval;
          }
        } else {
          if (itcAvl) {
            debitNotes.taxable += txval;
            debitNotes.igst += igst;
            debitNotes.cgst += cgst;
            debitNotes.sgst += sgst;
            debitNotes.cess += cess;
          }
        }
      } else if (upper.includes('B2B')) {
        if (isAmend) b2baCount++; else b2bCount++;
        if (isRcm) {
          rcmInward.taxable += txval;
          if (rcmInward.total === 0) {
            rcmInward.igst += igst;
            rcmInward.cgst += cgst;
            rcmInward.sgst += sgst;
            rcmInward.cess += cess;
          }
        } else if (itcAvl) {
          eligibleItc.taxable += txval;
          if (eligibleItc.total === 0) {
            eligibleItc.igst += igst;
            eligibleItc.cgst += cgst;
            eligibleItc.sgst += sgst;
            eligibleItc.cess += cess;
          }
        } else {
          ineligibleItc.taxable += txval;
        }
      } else if (upper.includes('ISD')) {
        isdCount++;
        if (isd.total === 0) {
          isd.igst += igst;
          isd.cgst += cgst;
          isd.sgst += sgst;
        }
      } else if (upper.includes('IMPG')) {
        impgCount++;
        if (importGoods.total === 0) {
          importGoods.igst += igst;
          importGoods.cess += cess;
        }
      }
    }
  }

  [eligibleItc, rcmInward, creditNotes, debitNotes, importGoods, isd, ineligibleItc].forEach(tb => {
    tb.taxable = Math.round(tb.taxable * 100) / 100;
    tb.igst = Math.round(tb.igst * 100) / 100;
    tb.cgst = Math.round(tb.cgst * 100) / 100;
    tb.sgst = Math.round(tb.sgst * 100) / 100;
    tb.cess = Math.round(tb.cess * 100) / 100;
    tb.total = Math.round((tb.igst + tb.cgst + tb.sgst) * 100) / 100;
  });

  const totalInvoices = b2bCount + b2baCount + cdnrCount + isdCount + impgCount;
  const netEligibleTotal = Math.round(
    (eligibleItc.total + rcmInward.total + importGoods.total + isd.total + debitNotes.total - creditNotes.total - ineligibleItc.total) * 100
  ) / 100;

  return {
    gstin: detectedGstin,
    period: detectedPeriod,
    monthKey: mapFpToMonthKey(detectedPeriod),
    fileType: 'EXCEL',
    fileName,
    counts: {
      b2b: b2bCount,
      b2ba: b2baCount,
      cdnr: cdnrCount,
      isd: isdCount,
      impg: impgCount,
      totalInvoices
    },
    eligibleItc,
    rcmInward,
    creditNotes,
    debitNotes,
    importGoods,
    isd,
    ineligibleItc,
    netEligibleTotal
  };
}

// ─── MASTER FILE INGESTER (HANDLES JSON, XLSX, ZIP WITH AUTO-DETECTION) ───────

export async function parseAnyReturnsFile(file: File): Promise<IngestResult> {
  const nameLower = file.name.toLowerCase();

  try {
    // 1. JSON Files
    if (nameLower.endsWith('.json')) {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Check if GSTR-2B or GSTR-1
      const is2B = Boolean(
        parsed.data?.docdata?.b2b ||
        parsed.docdata?.b2b ||
        nameLower.includes('2b') ||
        nameLower.includes('gstr2b')
      );

      if (is2B) {
        const gstr2b = await parseGstr2bJsonContent(parsed, file.name);
        return { gstr2b };
      } else {
        const gstr1 = await parseGstr1JsonContent(parsed, file.name);
        return { gstr1 };
      }
    }

    // 2. ZIP Archives (e.g. GSTR-2B or GSTR-1 zip from portal)
    if (nameLower.endsWith('.zip')) {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const fileNames = Object.keys(zip.files);

      // Search for JSON inside zip
      const jsonEntryName = fileNames.find(n => n.toLowerCase().endsWith('.json'));
      if (jsonEntryName) {
        const contentStr = await zip.files[jsonEntryName].async('text');
        const parsed = JSON.parse(contentStr);
        const is2B = Boolean(
          parsed.data?.docdata?.b2b ||
          parsed.docdata?.b2b ||
          parsed.data?.itcsumm ||
          parsed.itcsumm ||
          jsonEntryName.toLowerCase().includes('2b') ||
          nameLower.includes('2b')
        );
        if (is2B) {
          const gstr2b = await parseGstr2bJsonContent(parsed, file.name);
          return { gstr2b };
        } else {
          const gstr1 = await parseGstr1JsonContent(parsed, file.name);
          return { gstr1 };
        }
      }

      // Search for XLSX inside zip
      const xlsxEntryName = fileNames.find(n => n.toLowerCase().endsWith('.xlsx'));
      if (xlsxEntryName) {
        const buf = await zip.files[xlsxEntryName].async('arraybuffer');
        if (xlsxEntryName.toLowerCase().includes('2b') || nameLower.includes('2b')) {
          const gstr2b = await parseGstr2bExcelContent(buf, file.name);
          return { gstr2b };
        } else {
          const gstr1 = await parseGstr1ExcelContent(buf, file.name);
          return { gstr1 };
        }
      }

      return { error: 'Zip archive did not contain any valid .json or .xlsx return files.' };
    }

    // 3. Excel Files (.xlsx, .xls)
    if (nameLower.endsWith('.xlsx') || nameLower.endsWith('.xls')) {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const upperSheets = wb.SheetNames.map(s => s.toUpperCase());

      // Auto-detect GSTR-2B vs GSTR-1 by Sheet Names
      const is2B = upperSheets.some(s => s.includes('ITC AVAILABLE') || s.includes('GSTR-2B') || s.includes('GSTR2B')) || nameLower.includes('2b');

      if (is2B) {
        const gstr2b = await parseGstr2bExcelContent(arrayBuffer, file.name);
        return { gstr2b };
      } else {
        const gstr1 = await parseGstr1ExcelContent(arrayBuffer, file.name);
        return { gstr1 };
      }
    }

    return { error: `Unsupported file type: ${file.name}. Please upload .json, .xlsx, or .zip return files.` };
  } catch (err: any) {
    return { error: `Failed to parse ${file.name}: ${err?.message || 'Invalid format'}` };
  }
}

// ─── APPLY RETURNS TO GSTR-3B WORKING SHEET ───────────────────────────────────

export function applyReturnsToAnnualWorking(
  workingData: GSTR3BAnnualWorking,
  targetMonth: GSTR3BMonthKey,
  gstr1?: Gstr1IngestSummary | null,
  gstr2b?: Gstr2bIngestSummary | null
): GSTR3BAnnualWorking {
  const cloned = JSON.parse(JSON.stringify(workingData)) as GSTR3BAnnualWorking;
  // If return summary has an explicit monthKey detected from data/period, use that month
  const effectiveMonth: GSTR3BMonthKey = gstr2b?.monthKey || gstr1?.monthKey || targetMonth;
  const month = cloned.months[effectiveMonth];

  if (!month) return workingData;

  // Reset manual adjustment flag so newly ingested returns trigger fresh automatic statutory set-off
  month.setoff.isManualAdjustment = false;

  // 1. Apply GSTR-1 Outward Supplies
  if (gstr1) {
    const { breakdowns } = gstr1;
    month.outward.b2b = { ...breakdowns.b2b };
    month.outward.b2c = { ...breakdowns.b2c };
    month.outward.zeroRated = { ...breakdowns.zeroRated };
    month.outward.nilRated = { ...breakdowns.nilRated };
    month.outward.exempt = { ...breakdowns.exempt };
    month.outward.creditNote = { ...breakdowns.creditNote };
    month.outward.advanceReceived = { ...breakdowns.advanceReceived };
    month.outward.advanceAdjusted = { ...breakdowns.advanceAdjusted };

    // If GSTR-1 had client GSTIN and firm profile has none, adopt it
    if (gstr1.gstin && (!cloned.profile.gstin || cloned.profile.gstin === 'Not Specified')) {
      cloned.profile.gstin = gstr1.gstin;
    }
  }

  // 2. Apply GSTR-2B Inward Supplies & ITC
  if (gstr2b) {
    // Table 4(A)(5) All other ITC (strictly non-RCM)
    month.inward.itc2b = {
      taxable: Number(gstr2b.eligibleItc.taxable || 0),
      cgst: Number(gstr2b.eligibleItc.cgst || 0),
      sgst: Number(gstr2b.eligibleItc.sgst || 0),
      igst: Number(gstr2b.eligibleItc.igst || 0),
      total: Number(gstr2b.eligibleItc.total || 0) || (Number(gstr2b.eligibleItc.cgst || 0) + Number(gstr2b.eligibleItc.sgst || 0) + Number(gstr2b.eligibleItc.igst || 0))
    };

    // Inward RCM liability Table 3.1(d) & Table 4(A)(3) (kept strictly separate!)
    if (gstr2b.rcmInward && (gstr2b.rcmInward.total > 0 || gstr2b.rcmInward.taxable > 0 || gstr2b.rcmInward.cgst > 0)) {
      month.outward.rcmTransport = { ...gstr2b.rcmInward };
      month.outward.rcmInward = { ...gstr2b.rcmInward };
      month.inward.rcmPaid = { ...gstr2b.rcmInward };
    }

    // 2B Supplier Credit Notes -> Row 38 `(-) Debit Notes` (reduces ITC)
    if (gstr2b.creditNotes && (gstr2b.creditNotes.total > 0 || gstr2b.creditNotes.taxable > 0 || gstr2b.creditNotes.cgst > 0)) {
      month.inward.debitNotes = { ...gstr2b.creditNotes };
    }

    // 2B Supplier Debit Notes -> Row 36 `(+) Credit Notes` (increases ITC)
    if (gstr2b.debitNotes && (gstr2b.debitNotes.total > 0 || gstr2b.debitNotes.taxable > 0 || gstr2b.debitNotes.cgst > 0)) {
      month.inward.creditNotes = { ...gstr2b.debitNotes };
    }

    // Table 4(A)(1) Import Purchase -> Row 34 `(+) Import Purchase`
    if (gstr2b.importGoods && (gstr2b.importGoods.total > 0 || gstr2b.importGoods.igst > 0)) {
      month.inward.importGoods = { ...gstr2b.importGoods };
    }

    // Ineligible ITC Table 4(B)
    if (gstr2b.ineligibleItc && (gstr2b.ineligibleItc.total > 0 || gstr2b.ineligibleItc.taxable > 0)) {
      month.inward.itcReversed = { ...gstr2b.ineligibleItc };
    }

    // Adopt GSTIN if empty
    if (gstr2b.gstin && (!cloned.profile.gstin || cloned.profile.gstin === 'Not Specified')) {
      cloned.profile.gstin = gstr2b.gstin;
    }
  }

  // 3. Recalculate complete annual chain with Rule 88A set-off cascade!
  return recalculateAnnualWorking(cloned);
}
