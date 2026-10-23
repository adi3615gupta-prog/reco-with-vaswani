import * as XLSX from 'xlsx';

export interface Gstr1ExportInvoice {
  return_period?: string;
  original_period?: string;
  section?: string;
  ctin?: string;
  cname?: string;
  inum?: string;
  idt?: string;
  val?: number;
  pos?: string;
  rchrg?: string;
  inv_typ?: string;
  rt?: number;
  txval?: number;
  iamt?: number;
  camt?: number;
  samt?: number;
  csamt?: number;
  hsn_sc?: string;
  item_desc?: string;
  uqc?: string;
  qty?: number;
  source_type?: string;
  irn?: string;
  irn_date?: string;
  einvoice_status?: string;
  data_source?: string;
  exempt_amt?: number;
  nongst_amt?: number;
  sb_num?: string;
  sb_dt?: string;
  port_code?: string;
  from_num?: string;
  to_num?: string;
  tot_num?: number;
  cancelled?: number;
  net_issued?: number;
}

export const MONTH_ORDER = [
  'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March'
];

export const MONTH_NAMES_UPPER = [
  'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER',
  'OCTOBER', 'NOVEMBER', 'DECEMBER', 'JANUARY', 'FEBRUARY', 'MARCH'
];

function cleanVal(v: any): any {
  return v === null || v === undefined ? '' : v;
}

function round2(num: any): number {
  return Math.round((Number(num) || 0) * 100) / 100;
}

function formatGeneratedTimestamp(): string {
  const d = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(d.getDate()).padStart(2, '0');
  const mon = months[d.getMonth()];
  const yr = d.getFullYear();
  const hrs = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  const secs = String(d.getSeconds()).padStart(2, '0');
  return `${day}-${mon}-${yr} ${hrs}:${mins}:${secs}`;
}

export function getInvoiceMonthIndex(inv: Gstr1ExportInvoice): number {
  const periodStr = String(inv.return_period || '').toLowerCase();
  for (let i = 0; i < MONTH_ORDER.length; i++) {
    if (periodStr.includes(MONTH_ORDER[i].toLowerCase())) return i;
  }
  const origStr = String(inv.original_period || '').toLowerCase();
  for (let i = 0; i < MONTH_ORDER.length; i++) {
    if (origStr.includes(MONTH_ORDER[i].toLowerCase())) return i;
  }
  if (inv.idt) {
    const str = String(inv.idt);
    const dmy = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmy) {
      const m = parseInt(dmy[2], 10);
      return (m >= 4) ? (m - 4) : (m + 8);
    }
    const ymd = str.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymd) {
      const m = parseInt(ymd[2], 10);
      return (m >= 4) ? (m - 4) : (m + 8);
    }
  }
  return 0;
}

function setCell(ws: any, r: number, c: number, val: any, formula: string | null = null) {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell: any = {};
  if (formula) {
    cell.f = formula;
  }
  if (typeof val === 'number') {
    cell.t = 'n';
    cell.v = round2(val);
  } else if (typeof val === 'boolean') {
    cell.t = 'b';
    cell.v = val;
  } else {
    cell.t = 's';
    cell.v = val === null || val === undefined ? '' : String(val);
  }
  ws[addr] = cell;
}

function applyStandardMetadata(ws: any, sectionTitle: string, dealerName: string, gstin: string, finYear: string, timestampStr: string) {
  setCell(ws, 0, 0, `GSTR-1 - ${sectionTitle}`);
  setCell(ws, 1, 0, 'Dealer Name:');
  setCell(ws, 1, 2, dealerName);
  setCell(ws, 2, 0, 'GSTIN:');
  setCell(ws, 2, 2, gstin);
  setCell(ws, 3, 0, 'FinYear:');
  setCell(ws, 3, 2, finYear);
  setCell(ws, 5, 0, `GENERATED DATE & TIME :- ${timestampStr}`);
}

/**
 * generateGstr1FullYearWorkbook
 * Produces the exact 12-sheet GSTR1SectionWiseSummary Excel format matching
 * official benchmark E:\GOYAL\WORKINGS\GST WORKING\GSTR1SectionWiseSummary_Amendment_152552.xlsx
 */
export function generateGstr1FullYearWorkbook({
  clientInfo = {},
  financialYear = '2025-2026',
  invoices = [],
  summaries = []
}: {
  clientInfo?: { trade_name?: string; legal_name?: string; gstin?: string };
  financialYear?: string;
  invoices?: Gstr1ExportInvoice[];
  summaries?: any[];
}): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const dealerName = clientInfo.trade_name || clientInfo.legal_name || 'DEALER';
  const gstin = (clientInfo.gstin || '').toUpperCase();
  const cleanFy = financialYear.length === 7 ? financialYear : (financialYear.includes('-') ? financialYear : '2025-2026');
  const timestampStr = formatGeneratedTimestamp();

  // ─── 1. BUCKET INVOICES BY SECTION ──────────────────────────────────────────
  const secBuckets: Record<string, Gstr1ExportInvoice[]> = {
    B2B: [],
    B2CL: [],
    B2CS: [],
    NIL: [],
    CDNR: [],
    ECO: [],
    CDNUR: [],
    EXP: [],
    ADVREC: [],
    ADVADJ: [],
    HSN: [],
    DOC: []
  };

  for (const inv of invoices) {
    const sec = (inv.section || 'B2B').toUpperCase().replace(/\s+/g, '');
    if (sec.includes('B2CL') || sec === '5A') secBuckets.B2CL.push(inv);
    else if (sec.includes('B2CS') || sec === '7') secBuckets.B2CS.push(inv);
    else if (sec.includes('NIL') || sec.includes('EXEMPT') || sec === '8') secBuckets.NIL.push(inv);
    else if (sec.includes('CDNUR') || sec === '9B_UR') secBuckets.CDNUR.push(inv);
    else if (sec.includes('CDNR') || sec === '9B') secBuckets.CDNR.push(inv);
    else if (sec.includes('ECO') || sec === '14') secBuckets.ECO.push(inv);
    else if (sec.includes('EXP') || sec === '6A') secBuckets.EXP.push(inv);
    else if (sec.includes('ADVADJ') || sec.includes('TXPD') || sec === '11B') secBuckets.ADVADJ.push(inv);
    else if (sec.includes('ADVREC') || sec.includes('AT') || sec === '11A') secBuckets.ADVREC.push(inv);
    else if (sec.includes('HSN') || sec === '12') secBuckets.HSN.push(inv);
    else if (sec.includes('DOC') || sec === '13') secBuckets.DOC.push(inv);
    else secBuckets.B2B.push(inv);
  }

  // ─── 2. CALCULATE 12-MONTH TOTALS PER SECTION FOR LIVE MATRICES ────────────
  const b2bMonthly = MONTH_ORDER.map(() => ({ txval: 0, camt: 0, samt: 0, iamt: 0, csamt: 0 }));
  const b2csMonthly = MONTH_ORDER.map(() => ({ txval: 0, camt: 0, samt: 0, iamt: 0, csamt: 0 }));
  const nilMonthly = MONTH_ORDER.map(() => ({ txval: 0 }));
  const cdnrMonthly = MONTH_ORDER.map(() => ({ txval: 0, camt: 0, samt: 0, iamt: 0, csamt: 0 }));

  for (const inv of secBuckets.B2B) {
    const mIdx = getInvoiceMonthIndex(inv);
    b2bMonthly[mIdx].txval += round2(inv.txval);
    b2bMonthly[mIdx].camt += round2(inv.camt);
    b2bMonthly[mIdx].samt += round2(inv.samt);
    b2bMonthly[mIdx].iamt += round2(inv.iamt);
    b2bMonthly[mIdx].csamt += round2(inv.csamt);
  }

  for (const inv of secBuckets.B2CS) {
    const mIdx = getInvoiceMonthIndex(inv);
    b2csMonthly[mIdx].txval += round2(inv.txval);
    b2csMonthly[mIdx].camt += round2(inv.camt);
    b2csMonthly[mIdx].samt += round2(inv.samt);
    b2csMonthly[mIdx].iamt += round2(inv.iamt);
    b2csMonthly[mIdx].csamt += round2(inv.csamt);
  }

  for (const inv of secBuckets.NIL) {
    const mIdx = getInvoiceMonthIndex(inv);
    nilMonthly[mIdx].txval += round2((inv.txval || 0) + (inv.exempt_amt || inv.camt || 0));
  }

  for (const inv of secBuckets.CDNR) {
    const mIdx = getInvoiceMonthIndex(inv);
    cdnrMonthly[mIdx].txval += round2(inv.txval);
    cdnrMonthly[mIdx].camt += round2(inv.camt);
    cdnrMonthly[mIdx].samt += round2(inv.samt);
    cdnrMonthly[mIdx].iamt += round2(inv.iamt);
    cdnrMonthly[mIdx].csamt += round2(inv.csamt);
  }

  // Merge in summaries if line-item was missing
  for (const sumObj of summaries) {
    const mIdx = getInvoiceMonthIndex({ return_period: sumObj.return_period });
    const b = sumObj.breakdowns || (sumObj.raw_summary ? JSON.parse(sumObj.raw_summary).breakdowns : null);
    if (b) {
      if (b2bMonthly[mIdx].txval === 0 && b.b2b) {
        b2bMonthly[mIdx].txval = round2(b.b2b.taxable);
        b2bMonthly[mIdx].camt = round2(b.b2b.cgst);
        b2bMonthly[mIdx].samt = round2(b.b2b.sgst);
        b2bMonthly[mIdx].iamt = round2(b.b2b.igst);
      }
      if (b2csMonthly[mIdx].txval === 0 && b.b2cs) {
        b2csMonthly[mIdx].txval = round2(b.b2cs.taxable);
        b2csMonthly[mIdx].camt = round2(b.b2cs.cgst);
        b2csMonthly[mIdx].samt = round2(b.b2cs.sgst);
        b2csMonthly[mIdx].iamt = round2(b.b2cs.igst);
      }
      if (nilMonthly[mIdx].txval === 0 && (b.nilRated || b.exempt)) {
        nilMonthly[mIdx].txval = round2((b.nilRated?.taxable || 0) + (b.exempt?.taxable || 0));
      }
      if (cdnrMonthly[mIdx].txval === 0 && b.creditNote) {
        cdnrMonthly[mIdx].txval = round2(b.creditNote.taxable);
        cdnrMonthly[mIdx].camt = round2(b.creditNote.cgst);
        cdnrMonthly[mIdx].samt = round2(b.creditNote.sgst);
        cdnrMonthly[mIdx].iamt = round2(b.creditNote.igst);
      }
    }
  }

  // ─── SHEET 1: B2B ──────────────────────────────────────────────────────────
  {
    const ws: any = {};
    applyStandardMetadata(ws, 'B2B Invoices', dealerName, gstin, cleanFy, timestampStr);

    // Row 5 Section Markers
    setCell(ws, 4, 33, 'B2B');         // AH5
    setCell(ws, 4, 39, 'B2C');         // AN5
    setCell(ws, 4, 43, 'NIL RATED');   // AR5
    setCell(ws, 4, 47, 'CREDIT NOTE'); // AV5
    setCell(ws, 4, 53, 'NET');         // BB5

    // Row 8 Headers (Data Cols A to X)
    const b2bHeaders = [
      'Return Period', 'Receiver Name', 'GSTIN', 'POS', 'Invoice Type',
      'Invoice No', 'Invoice Date', 'Reverse Charge', 'Invoice Value', 'HSN/SAC',
      'Item Description', 'UQC', 'Qty', 'Taxable Value', 'Tax Rate',
      'IGST', 'CGST', 'SGST', 'Cess', 'Source Type',
      'IRN', 'IRN Generate Date', 'E-Invoice Status', 'Data Source'
    ];
    b2bHeaders.forEach((h, c) => setCell(ws, 7, c, h));

    // Helper Headers Z to AD
    setCell(ws, 7, 25, 'MONTHS');  // Z8
    setCell(ws, 7, 26, 'TAXABLE'); // AA8
    setCell(ws, 7, 27, 'CGST');    // AB8
    setCell(ws, 7, 28, 'SGST');    // AC8
    setCell(ws, 7, 29, 'IGST');    // AD8

    // Matrix 1 Headers AF to AJ (B2B)
    setCell(ws, 7, 31, 'MONTHS');  // AF8
    setCell(ws, 7, 32, 'TAXABLE'); // AG8
    setCell(ws, 7, 33, 'CGST');    // AH8
    setCell(ws, 7, 34, 'SGST');    // AI8
    setCell(ws, 7, 35, 'IGST');    // AJ8

    // Matrix 2 Headers AL to AP (B2C)
    setCell(ws, 7, 37, 'MONTHS');  // AL8
    setCell(ws, 7, 38, 'TAXABLE'); // AM8
    setCell(ws, 7, 39, 'CGST');    // AN8
    setCell(ws, 7, 40, 'SGST');    // AO8
    setCell(ws, 7, 41, 'IGST');    // AP8

    // Matrix 3 Headers AR to AS (NIL RATED)
    setCell(ws, 7, 43, 'MONTHS');  // AR8
    setCell(ws, 7, 44, 'TAXABLE'); // AS8

    // Matrix 4 Headers AU to AY (CREDIT NOTE)
    setCell(ws, 7, 46, 'MONTHS');  // AU8
    setCell(ws, 7, 47, 'TAXABLE'); // AV8
    setCell(ws, 7, 48, 'CGST');    // AW8
    setCell(ws, 7, 49, 'SGST');    // AX8
    setCell(ws, 7, 50, 'IGST');    // AY8

    // Matrix 5 Headers BA to BE (NET)
    setCell(ws, 7, 52, 'MONTHS');  // BA8
    setCell(ws, 7, 53, 'TAXABLE'); // BB8
    setCell(ws, 7, 54, 'CGST');    // BC8
    setCell(ws, 7, 55, 'SGST');    // BD8
    setCell(ws, 7, 56, 'IGST');    // BE8

    let maxRow = 7;
    const b2bList = secBuckets.B2B;

    for (let i = 0; i < b2bList.length; i++) {
      const r = 8 + i;
      const inv = b2bList[i];
      const mName = MONTH_ORDER[getInvoiceMonthIndex(inv)];

      setCell(ws, r, 0, cleanVal(inv.return_period));
      setCell(ws, r, 1, cleanVal(inv.cname));
      setCell(ws, r, 2, cleanVal(inv.ctin));
      setCell(ws, r, 3, cleanVal(inv.pos));
      setCell(ws, r, 4, cleanVal(inv.inv_typ || 'Regular'));
      setCell(ws, r, 5, cleanVal(inv.inum));
      setCell(ws, r, 6, cleanVal(inv.idt));
      setCell(ws, r, 7, cleanVal(inv.rchrg || 'No'));
      setCell(ws, r, 8, round2(inv.val));
      setCell(ws, r, 9, cleanVal(inv.hsn_sc));
      setCell(ws, r, 10, cleanVal(inv.item_desc));
      setCell(ws, r, 11, cleanVal(inv.uqc));
      setCell(ws, r, 12, round2(inv.qty || 0));
      setCell(ws, r, 13, round2(inv.txval));
      setCell(ws, r, 14, round2(inv.rt));
      setCell(ws, r, 15, round2(inv.iamt));
      setCell(ws, r, 16, round2(inv.camt));
      setCell(ws, r, 17, round2(inv.samt));
      setCell(ws, r, 18, round2(inv.csamt));
      setCell(ws, r, 19, cleanVal(inv.source_type || 'E-Invoice'));
      setCell(ws, r, 20, cleanVal(inv.irn));
      setCell(ws, r, 21, cleanVal(inv.irn_date));
      setCell(ws, r, 22, cleanVal(inv.einvoice_status));
      setCell(ws, r, 23, cleanVal(inv.data_source || 'GSTR1'));

      const rNum = r + 1;
      setCell(ws, r, 25, mName, `TEXT(G${rNum},"MMMM")`); // Z
      setCell(ws, r, 26, round2(inv.txval), `N${rNum}`);   // AA
      setCell(ws, r, 27, round2(inv.camt), `Q${rNum}`);    // AB
      setCell(ws, r, 28, round2(inv.samt), `R${rNum}`);    // AC
      setCell(ws, r, 29, round2(inv.iamt), `P${rNum}`);    // AD

      if (r > maxRow) maxRow = r;
    }

    // Side Matrices (Rows 9 to 20)
    for (let m = 0; m < 12; m++) {
      const r = 8 + m;
      const rNum = r + 1;
      const mUpper = MONTH_NAMES_UPPER[m];

      const b2bM = b2bMonthly[m];
      const b2csM = b2csMonthly[m];
      const nilM = nilMonthly[m];
      const cdnrM = cdnrMonthly[m];

      // 1. B2B (AF to AJ)
      setCell(ws, r, 31, mUpper); // AF
      setCell(ws, r, 32, round2(b2bM.txval), `SUMIFS(AA:AA,Z:Z,AF${rNum})`);
      setCell(ws, r, 33, round2(b2bM.camt), `SUMIFS(AB:AB,Z:Z,AF${rNum})`);
      setCell(ws, r, 34, round2(b2bM.samt), `SUMIFS(AC:AC,Z:Z,AF${rNum})`);
      setCell(ws, r, 35, round2(b2bM.iamt), `SUMIFS(AD:AD,Z:Z,AF${rNum})`);

      // 2. B2C (AL to AP)
      setCell(ws, r, 37, mUpper); // AL
      setCell(ws, r, 38, round2(b2csM.txval), `B2CS!W${rNum}`);
      setCell(ws, r, 39, round2(b2csM.camt), `B2CS!X${rNum}`);
      setCell(ws, r, 40, round2(b2csM.samt), `B2CS!Y${rNum}`);
      setCell(ws, r, 41, round2(b2csM.iamt), `B2CS!Z${rNum}`);

      // 3. NIL RATED (AR to AS)
      setCell(ws, r, 43, mUpper); // AR
      setCell(ws, r, 44, round2(nilM.txval), `'Nil Rated'!L${rNum}`);

      // 4. CREDIT NOTE (AU to AY)
      setCell(ws, r, 46, mUpper); // AU
      setCell(ws, r, 47, round2(cdnrM.txval), `CDNR!AH${rNum}`);
      setCell(ws, r, 48, round2(cdnrM.camt), `CDNR!AI${rNum}`);
      setCell(ws, r, 49, round2(cdnrM.samt), `CDNR!AJ${rNum}`);
      setCell(ws, r, 50, round2(cdnrM.iamt), `CDNR!AK${rNum}`);

      // 5. NET OUTWARD LIABILITY (BA to BE)
      const netTx = round2(b2bM.txval + b2csM.txval + nilM.txval - cdnrM.txval);
      const netCg = round2(b2bM.camt + b2csM.camt - cdnrM.camt);
      const netSg = round2(b2bM.samt + b2csM.samt - cdnrM.samt);
      const netIg = round2(b2bM.iamt + b2csM.iamt - cdnrM.iamt);

      setCell(ws, r, 52, mUpper); // BA
      setCell(ws, r, 53, netTx, `AG${rNum}+AM${rNum}+AS${rNum}-AV${rNum}`);
      setCell(ws, r, 54, netCg, `AH${rNum}+AN${rNum}-AW${rNum}`);
      setCell(ws, r, 55, netSg, `AI${rNum}+AO${rNum}-AX${rNum}`);
      setCell(ws, r, 56, netIg, `AJ${rNum}+AP${rNum}-AY${rNum}`);

      if (r > maxRow) maxRow = r;
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(19, maxRow), c: 56 } });
    ws['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, ws, 'B2B');
  }

  // ─── SHEET 2: B2CL ─────────────────────────────────────────────────────────
  {
    const ws: any = {};
    applyStandardMetadata(ws, 'B2CL Invoices', dealerName, gstin, cleanFy, timestampStr);
    const headers = [
      'Return Period', 'POS', 'Invoice No', 'Invoice Date', 'Invoice Value',
      'HSN/SAC', 'Item Description', 'UQC', 'Qty', 'Taxable Value',
      'Tax Rate', 'IGST', 'Cess', 'Data Source'
    ];
    headers.forEach((h, c) => setCell(ws, 7, c, h));

    let maxRow = 7;
    const list = secBuckets.B2CL;
    for (let i = 0; i < list.length; i++) {
      const r = 8 + i;
      const inv = list[i];
      setCell(ws, r, 0, cleanVal(inv.return_period));
      setCell(ws, r, 1, cleanVal(inv.pos));
      setCell(ws, r, 2, cleanVal(inv.inum));
      setCell(ws, r, 3, cleanVal(inv.idt));
      setCell(ws, r, 4, round2(inv.val));
      setCell(ws, r, 5, cleanVal(inv.hsn_sc));
      setCell(ws, r, 6, cleanVal(inv.item_desc));
      setCell(ws, r, 7, cleanVal(inv.uqc));
      setCell(ws, r, 8, round2(inv.qty || 0));
      setCell(ws, r, 9, round2(inv.txval));
      setCell(ws, r, 10, round2(inv.rt));
      setCell(ws, r, 11, round2(inv.iamt));
      setCell(ws, r, 12, round2(inv.csamt));
      setCell(ws, r, 13, cleanVal(inv.data_source || 'GSTR1'));
      if (r > maxRow) maxRow = r;
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: headers.length - 1 } });
    ws['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, ws, 'B2CL');
  }

  // ─── SHEET 3: B2CS ─────────────────────────────────────────────────────────
  {
    const ws: any = {};
    applyStandardMetadata(ws, 'B2CS Invoices', dealerName, gstin, cleanFy, timestampStr);
    const headers = [
      'Return Period', 'Original Period', 'POS', 'HSN/SAC', 'Item Description',
      'UQC', 'Qty', 'Taxable Value', 'Tax Rate', 'IGST',
      'CGST', 'SGST', 'Cess', 'Data Source'
    ];
    headers.forEach((h, c) => setCell(ws, 7, c, h));

    // Helper Headers P to T
    setCell(ws, 7, 15, 'MONTHS');  // P8
    setCell(ws, 7, 16, 'TAXABLE'); // Q8
    setCell(ws, 7, 17, 'CGST');    // R8
    setCell(ws, 7, 18, 'SGST');    // S8
    setCell(ws, 7, 19, 'IGST');    // T8

    // Side Matrix Headers V to Z
    setCell(ws, 7, 21, 'MONTHS');  // V8
    setCell(ws, 7, 22, 'TAXABLE'); // W8
    setCell(ws, 7, 23, 'CGST');    // X8
    setCell(ws, 7, 24, 'SGST');    // Y8
    setCell(ws, 7, 25, 'IGST');    // Z8

    let maxRow = 7;
    const list = secBuckets.B2CS;
    for (let i = 0; i < list.length; i++) {
      const r = 8 + i;
      const rNum = r + 1;
      const inv = list[i];
      const mName = MONTH_ORDER[getInvoiceMonthIndex(inv)];

      setCell(ws, r, 0, cleanVal(inv.return_period));
      setCell(ws, r, 1, cleanVal(inv.original_period || mName));
      setCell(ws, r, 2, cleanVal(inv.pos));
      setCell(ws, r, 3, cleanVal(inv.hsn_sc));
      setCell(ws, r, 4, cleanVal(inv.item_desc));
      setCell(ws, r, 5, cleanVal(inv.uqc));
      setCell(ws, r, 6, round2(inv.qty || 0));
      setCell(ws, r, 7, round2(inv.txval));
      setCell(ws, r, 8, round2(inv.rt));
      setCell(ws, r, 9, round2(inv.iamt));
      setCell(ws, r, 10, round2(inv.camt));
      setCell(ws, r, 11, round2(inv.samt));
      setCell(ws, r, 12, round2(inv.csamt));
      setCell(ws, r, 13, cleanVal(inv.data_source || 'GSTR1'));

      setCell(ws, r, 15, mName, `TEXT(B${rNum},"MMMM")`); // P
      setCell(ws, r, 16, round2(inv.txval), `H${rNum}`);   // Q
      setCell(ws, r, 17, round2(inv.camt), `K${rNum}`);    // R
      setCell(ws, r, 18, round2(inv.samt), `L${rNum}`);    // S
      setCell(ws, r, 19, round2(inv.iamt), `J${rNum}`);    // T

      if (r > maxRow) maxRow = r;
    }

    // Side Matrix V to Z (Rows 9 to 20)
    for (let m = 0; m < 12; m++) {
      const r = 8 + m;
      const rNum = r + 1;
      const mUpper = MONTH_NAMES_UPPER[m];
      const b2csM = b2csMonthly[m];

      setCell(ws, r, 21, mUpper); // V
      setCell(ws, r, 22, round2(b2csM.txval), `SUMIFS(Q:Q,P:P,V${rNum})`);
      setCell(ws, r, 23, round2(b2csM.camt), `SUMIFS(R:R,P:P,V${rNum})`);
      setCell(ws, r, 24, round2(b2csM.samt), `SUMIFS(S:S,P:P,V${rNum})`);
      setCell(ws, r, 25, round2(b2csM.iamt), `SUMIFS(T:T,P:P,V${rNum})`);

      if (r > maxRow) maxRow = r;
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(19, maxRow), c: 25 } });
    ws['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, ws, 'B2CS');
  }

  // ─── SHEET 4: NIL RATED ────────────────────────────────────────────────────
  {
    const ws: any = {};
    applyStandardMetadata(ws, 'Nil Rated', dealerName, gstin, cleanFy, timestampStr);
    const headers = [
      'Return Period', 'Description', 'Nil Rated Supplies',
      'Exempted(Other than Nil Rated/Non GST Supply)', 'Non GST Supplies'
    ];
    headers.forEach((h, c) => setCell(ws, 7, c, h));

    setCell(ws, 7, 7, 'MONTHS');  // H8
    setCell(ws, 7, 8, 'TAXABLE'); // I8

    setCell(ws, 7, 10, 'MONTHS');  // K8
    setCell(ws, 7, 11, 'TAXABLE'); // L8

    let maxRow = 7;
    const list = secBuckets.NIL;
    for (let i = 0; i < list.length; i++) {
      const r = 8 + i;
      const rNum = r + 1;
      const inv = list[i];
      const mName = MONTH_ORDER[getInvoiceMonthIndex(inv)];

      setCell(ws, r, 0, cleanVal(inv.return_period || mName));
      setCell(ws, r, 1, cleanVal(inv.item_desc || inv.cname || 'Intra-state supplies to registered person'));
      setCell(ws, r, 2, round2(inv.txval || 0));
      setCell(ws, r, 3, round2(inv.exempt_amt || inv.camt || 0));
      setCell(ws, r, 4, round2(inv.nongst_amt || inv.samt || 0));

      setCell(ws, r, 7, mName, `TEXT(A${rNum},"MMMM")`); // H
      setCell(ws, r, 8, round2((inv.txval || 0) + (inv.exempt_amt || inv.camt || 0)), `C${rNum}+D${rNum}`); // I

      if (r > maxRow) maxRow = r;
    }

    // Side Matrix K to L (Rows 9 to 20)
    for (let m = 0; m < 12; m++) {
      const r = 8 + m;
      const rNum = r + 1;
      const mUpper = MONTH_NAMES_UPPER[m];
      const nilM = nilMonthly[m];

      setCell(ws, r, 10, mUpper); // K
      setCell(ws, r, 11, round2(nilM.txval), `SUMIFS(I:I,H:H,K${rNum})`);

      if (r > maxRow) maxRow = r;
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(19, maxRow), c: 11 } });
    ws['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, ws, 'Nil Rated');
  }

  // ─── SHEET 5: CDNR ─────────────────────────────────────────────────────────
  {
    const ws: any = {};
    applyStandardMetadata(ws, 'CDNR Invoices', dealerName, gstin, cleanFy, timestampStr);
    const headers = [
      'Return Period', 'Receiver Name', 'GSTIN', 'POS', 'Note Type',
      'Note No', 'Note Date', 'Invoice Type', 'Reverse Charge', 'Invoice Value',
      'HSN/SAC', 'Item Description', 'UQC', 'Qty', 'Taxable Value',
      'Tax Rate', 'IGST', 'CGST', 'SGST', 'Cess',
      'Source Type', 'IRN', 'IRN Generate Date', 'E-Invoice Status', 'Data Source'
    ];
    headers.forEach((h, c) => setCell(ws, 7, c, h));

    setCell(ws, 7, 26, 'MONTHS');  // AA8
    setCell(ws, 7, 27, 'TAXABLE'); // AB8
    setCell(ws, 7, 28, 'CGST');    // AC8
    setCell(ws, 7, 29, 'SGST');    // AD8
    setCell(ws, 7, 30, 'IGST');    // AE8

    setCell(ws, 7, 32, 'MONTHS');  // AG8
    setCell(ws, 7, 33, 'TAXABLE'); // AH8
    setCell(ws, 7, 34, 'CGST');    // AI8
    setCell(ws, 7, 35, 'SGST');    // AJ8
    setCell(ws, 7, 36, 'IGST');    // AK8

    let maxRow = 7;
    const list = secBuckets.CDNR;
    for (let i = 0; i < list.length; i++) {
      const r = 8 + i;
      const rNum = r + 1;
      const inv = list[i];
      const mName = MONTH_ORDER[getInvoiceMonthIndex(inv)];

      setCell(ws, r, 0, cleanVal(inv.return_period));
      setCell(ws, r, 1, cleanVal(inv.cname));
      setCell(ws, r, 2, cleanVal(inv.ctin));
      setCell(ws, r, 3, cleanVal(inv.pos));
      setCell(ws, r, 4, cleanVal(inv.inv_typ?.includes('Debit') ? 'Debit' : 'Credit'));
      setCell(ws, r, 5, cleanVal(inv.inum));
      setCell(ws, r, 6, cleanVal(inv.idt));
      setCell(ws, r, 7, cleanVal(inv.inv_typ || 'Regular'));
      setCell(ws, r, 8, cleanVal(inv.rchrg || 'No'));
      setCell(ws, r, 9, round2(inv.val));
      setCell(ws, r, 10, cleanVal(inv.hsn_sc));
      setCell(ws, r, 11, cleanVal(inv.item_desc));
      setCell(ws, r, 12, cleanVal(inv.uqc));
      setCell(ws, r, 13, round2(inv.qty || 0));
      setCell(ws, r, 14, round2(inv.txval));
      setCell(ws, r, 15, round2(inv.rt));
      setCell(ws, r, 16, round2(inv.iamt));
      setCell(ws, r, 17, round2(inv.camt));
      setCell(ws, r, 18, round2(inv.samt));
      setCell(ws, r, 19, round2(inv.csamt));
      setCell(ws, r, 20, cleanVal(inv.source_type || 'E-Invoice'));
      setCell(ws, r, 21, cleanVal(inv.irn));
      setCell(ws, r, 22, cleanVal(inv.irn_date));
      setCell(ws, r, 23, cleanVal(inv.einvoice_status));
      setCell(ws, r, 24, cleanVal(inv.data_source || 'GSTR1'));

      setCell(ws, r, 26, mName, `TEXT(G${rNum},"MMMM")`); // AA
      setCell(ws, r, 27, round2(inv.txval), `O${rNum}`);   // AB
      setCell(ws, r, 28, round2(inv.camt), `R${rNum}`);    // AC
      setCell(ws, r, 29, round2(inv.samt), `S${rNum}`);    // AD
      setCell(ws, r, 30, round2(inv.iamt), `Q${rNum}`);    // AE

      if (r > maxRow) maxRow = r;
    }

    // Side Matrix AG to AK (Rows 9 to 20)
    for (let m = 0; m < 12; m++) {
      const r = 8 + m;
      const rNum = r + 1;
      const mUpper = MONTH_NAMES_UPPER[m];
      const cdnrM = cdnrMonthly[m];

      setCell(ws, r, 32, mUpper); // AG
      setCell(ws, r, 33, round2(cdnrM.txval), `SUMIFS(AB:AB,AA:AA,AG${rNum})`);
      setCell(ws, r, 34, round2(cdnrM.camt), `SUMIFS(AC:AC,AA:AA,AG${rNum})`);
      setCell(ws, r, 35, round2(cdnrM.samt), `SUMIFS(AD:AD,AA:AA,AG${rNum})`);
      setCell(ws, r, 36, round2(cdnrM.iamt), `SUMIFS(AE:AE,AA:AA,AG${rNum})`);

      if (r > maxRow) maxRow = r;
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(19, maxRow), c: 36 } });
    ws['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, ws, 'CDNR');
  }

  // ─── SHEET 6: ECO ──────────────────────────────────────────────────────────
  {
    const ws: any = {};
    applyStandardMetadata(ws, 'ECO Invoices', dealerName, gstin, cleanFy, timestampStr);
    const headers = [
      'Return Period', 'Type', 'E-Commerce Operator Name', 'E-Commerce Operator GSTIN',
      'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess', 'Data Source'
    ];
    headers.forEach((h, c) => setCell(ws, 7, c, h));

    let maxRow = 7;
    const list = secBuckets.ECO;
    for (let i = 0; i < list.length; i++) {
      const r = 8 + i;
      const inv = list[i];
      setCell(ws, r, 0, cleanVal(inv.return_period));
      setCell(ws, r, 1, cleanVal(inv.inv_typ || 'ECOM'));
      setCell(ws, r, 2, cleanVal(inv.cname));
      setCell(ws, r, 3, cleanVal(inv.ctin));
      setCell(ws, r, 4, round2(inv.txval));
      setCell(ws, r, 5, round2(inv.iamt));
      setCell(ws, r, 6, round2(inv.camt));
      setCell(ws, r, 7, round2(inv.samt));
      setCell(ws, r, 8, round2(inv.csamt));
      setCell(ws, r, 9, cleanVal(inv.data_source || 'GSTR1'));
      if (r > maxRow) maxRow = r;
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: headers.length - 1 } });
    ws['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, ws, 'ECO');
  }

  // ─── SHEET 7: CDNUR ────────────────────────────────────────────────────────
  {
    const ws: any = {};
    applyStandardMetadata(ws, 'CDNUR Invoices', dealerName, gstin, cleanFy, timestampStr);
    const headers = [
      'Return Period', 'POS', 'Note Type', 'Note No', 'Note Date',
      'Invoice Value', 'HSN/SAC', 'Item Description', 'UQC', 'Qty',
      'Taxable Value', 'Tax Rate', 'IGST', 'CGST', 'SGST', 'Cess', 'Data Source'
    ];
    headers.forEach((h, c) => setCell(ws, 7, c, h));

    let maxRow = 7;
    const list = secBuckets.CDNUR;
    for (let i = 0; i < list.length; i++) {
      const r = 8 + i;
      const inv = list[i];
      setCell(ws, r, 0, cleanVal(inv.return_period));
      setCell(ws, r, 1, cleanVal(inv.pos));
      setCell(ws, r, 2, cleanVal(inv.inv_typ?.includes('Debit') ? 'Debit' : 'Credit'));
      setCell(ws, r, 3, cleanVal(inv.inum));
      setCell(ws, r, 4, cleanVal(inv.idt));
      setCell(ws, r, 5, round2(inv.val));
      setCell(ws, r, 6, cleanVal(inv.hsn_sc));
      setCell(ws, r, 7, cleanVal(inv.item_desc));
      setCell(ws, r, 8, cleanVal(inv.uqc));
      setCell(ws, r, 9, round2(inv.qty || 0));
      setCell(ws, r, 10, round2(inv.txval));
      setCell(ws, r, 11, round2(inv.rt));
      setCell(ws, r, 12, round2(inv.iamt));
      setCell(ws, r, 13, round2(inv.camt));
      setCell(ws, r, 14, round2(inv.samt));
      setCell(ws, r, 15, round2(inv.csamt));
      setCell(ws, r, 16, cleanVal(inv.data_source || 'GSTR1'));
      if (r > maxRow) maxRow = r;
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: headers.length - 1 } });
    ws['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, ws, 'CDNUR');
  }

  // ─── SHEET 8: EXP ──────────────────────────────────────────────────────────
  {
    const ws: any = {};
    applyStandardMetadata(ws, 'EXP Invoices', dealerName, gstin, cleanFy, timestampStr);
    const headers = [
      'Return Period', 'Export Type', 'Invoice No', 'Invoice Date',
      'Shipping Bill No', 'Shipping Bill Date', 'Port Code', 'Invoice Value',
      'HSN/SAC', 'Item Description', 'UQC', 'Qty', 'Taxable Value',
      'Tax Rate', 'IGST', 'Cess', 'IRN', 'IRN Generate Date', 'E-Invoice Status', 'Data Source'
    ];
    headers.forEach((h, c) => setCell(ws, 7, c, h));

    let maxRow = 7;
    const list = secBuckets.EXP;
    for (let i = 0; i < list.length; i++) {
      const r = 8 + i;
      const inv = list[i];
      setCell(ws, r, 0, cleanVal(inv.return_period));
      setCell(ws, r, 1, cleanVal(inv.inv_typ || 'WOPAY'));
      setCell(ws, r, 2, cleanVal(inv.inum));
      setCell(ws, r, 3, cleanVal(inv.idt));
      setCell(ws, r, 4, cleanVal(inv.sb_num));
      setCell(ws, r, 5, cleanVal(inv.sb_dt));
      setCell(ws, r, 6, cleanVal(inv.port_code));
      setCell(ws, r, 7, round2(inv.val));
      setCell(ws, r, 8, cleanVal(inv.hsn_sc));
      setCell(ws, r, 9, cleanVal(inv.item_desc));
      setCell(ws, r, 10, cleanVal(inv.uqc));
      setCell(ws, r, 11, round2(inv.qty || 0));
      setCell(ws, r, 12, round2(inv.txval));
      setCell(ws, r, 13, round2(inv.rt));
      setCell(ws, r, 14, round2(inv.iamt));
      setCell(ws, r, 15, round2(inv.csamt));
      setCell(ws, r, 16, cleanVal(inv.irn));
      setCell(ws, r, 17, cleanVal(inv.irn_date));
      setCell(ws, r, 18, cleanVal(inv.einvoice_status));
      setCell(ws, r, 19, cleanVal(inv.data_source || 'GSTR1'));
      if (r > maxRow) maxRow = r;
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: headers.length - 1 } });
    ws['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, ws, 'EXP');
  }

  // ─── SHEET 9: ADVREC ───────────────────────────────────────────────────────
  {
    const ws: any = {};
    applyStandardMetadata(ws, 'Advance Received', dealerName, gstin, cleanFy, timestampStr);
    const headers = [
      'Return Period', 'POS', 'HSN/SAC', 'Item Description', 'UQC',
      'Qty', 'Taxable Value', 'Tax Rate', 'IGST', 'CGST', 'SGST', 'Cess', 'Data Source'
    ];
    headers.forEach((h, c) => setCell(ws, 7, c, h));

    let maxRow = 7;
    const list = secBuckets.ADVREC;
    for (let i = 0; i < list.length; i++) {
      const r = 8 + i;
      const inv = list[i];
      setCell(ws, r, 0, cleanVal(inv.return_period));
      setCell(ws, r, 1, cleanVal(inv.pos));
      setCell(ws, r, 2, cleanVal(inv.hsn_sc));
      setCell(ws, r, 3, cleanVal(inv.item_desc));
      setCell(ws, r, 4, cleanVal(inv.uqc));
      setCell(ws, r, 5, round2(inv.qty || 0));
      setCell(ws, r, 6, round2(inv.txval));
      setCell(ws, r, 7, round2(inv.rt));
      setCell(ws, r, 8, round2(inv.iamt));
      setCell(ws, r, 9, round2(inv.camt));
      setCell(ws, r, 10, round2(inv.samt));
      setCell(ws, r, 11, round2(inv.csamt));
      setCell(ws, r, 12, cleanVal(inv.data_source || 'GSTR1'));
      if (r > maxRow) maxRow = r;
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: headers.length - 1 } });
    ws['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, ws, 'ADVREC');
  }

  // ─── SHEET 10: ADVADJ ──────────────────────────────────────────────────────
  {
    const ws: any = {};
    applyStandardMetadata(ws, 'Advance Adjusted Invoices', dealerName, gstin, cleanFy, timestampStr);
    const headers = [
      'Return Period', 'POS', 'HSN/SAC', 'Item Description', 'UQC',
      'Qty', 'Taxable Value', 'Tax Rate', 'IGST', 'CGST', 'SGST', 'Cess', 'Data Source'
    ];
    headers.forEach((h, c) => setCell(ws, 7, c, h));

    let maxRow = 7;
    const list = secBuckets.ADVADJ;
    for (let i = 0; i < list.length; i++) {
      const r = 8 + i;
      const inv = list[i];
      setCell(ws, r, 0, cleanVal(inv.return_period));
      setCell(ws, r, 1, cleanVal(inv.pos));
      setCell(ws, r, 2, cleanVal(inv.hsn_sc));
      setCell(ws, r, 3, cleanVal(inv.item_desc));
      setCell(ws, r, 4, cleanVal(inv.uqc));
      setCell(ws, r, 5, round2(inv.qty || 0));
      setCell(ws, r, 6, round2(inv.txval));
      setCell(ws, r, 7, round2(inv.rt));
      setCell(ws, r, 8, round2(inv.iamt));
      setCell(ws, r, 9, round2(inv.camt));
      setCell(ws, r, 10, round2(inv.samt));
      setCell(ws, r, 11, round2(inv.csamt));
      setCell(ws, r, 12, cleanVal(inv.data_source || 'GSTR1'));
      if (r > maxRow) maxRow = r;
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: headers.length - 1 } });
    ws['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, ws, 'ADVADJ');
  }

  // ─── SHEET 11: HSN ─────────────────────────────────────────────────────────
  {
    const ws: any = {};
    applyStandardMetadata(ws, 'HSN Summary', dealerName, gstin, cleanFy, timestampStr);
    const headers = [
      'Return Period', 'HSNType', 'HSN/SAC Code', 'Item Description', 'Item Description',
      'UQC', 'Total Quantity', 'Total Value', 'Taxable Value', 'Tax Rate (%)',
      'IGST', 'CGST', 'SGST', 'Cess', 'Data Source'
    ];
    headers.forEach((h, c) => setCell(ws, 7, c, h));

    let maxRow = 7;
    const list = secBuckets.HSN;
    for (let i = 0; i < list.length; i++) {
      const r = 8 + i;
      const item = list[i];
      setCell(ws, r, 0, cleanVal(item.return_period));
      setCell(ws, r, 1, cleanVal(item.inv_typ || 'B2B'));
      setCell(ws, r, 2, cleanVal(item.hsn_sc));
      setCell(ws, r, 3, cleanVal(item.item_desc));
      setCell(ws, r, 4, cleanVal(item.item_desc));
      setCell(ws, r, 5, cleanVal(item.uqc));
      setCell(ws, r, 6, round2(item.qty || 0));
      setCell(ws, r, 7, round2(item.val || 0));
      setCell(ws, r, 8, round2(item.txval || 0));
      setCell(ws, r, 9, round2(item.rt || 0));
      setCell(ws, r, 10, round2(item.iamt || 0));
      setCell(ws, r, 11, round2(item.camt || 0));
      setCell(ws, r, 12, round2(item.samt || 0));
      setCell(ws, r, 13, round2(item.csamt || 0));
      setCell(ws, r, 14, cleanVal(item.data_source || 'GSTR1'));
      if (r > maxRow) maxRow = r;
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: headers.length - 1 } });
    ws['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, ws, 'HSN');
  }

  // ─── SHEET 12: DOC ─────────────────────────────────────────────────────────
  {
    const ws: any = {};
    applyStandardMetadata(ws, 'Document Issued Summary', dealerName, gstin, cleanFy, timestampStr);
    const headers = [
      'Return Period', 'Document Type', 'From Serial No.', 'To Serial No.',
      'Total No.', 'Cancelled Invoices', 'Net Invoices Issued', 'Data Source'
    ];
    headers.forEach((h, c) => setCell(ws, 7, c, h));

    let maxRow = 7;
    const list = secBuckets.DOC;
    for (let i = 0; i < list.length; i++) {
      const r = 8 + i;
      const doc = list[i];
      setCell(ws, r, 0, cleanVal(doc.return_period));
      setCell(ws, r, 1, cleanVal(doc.inv_typ || 'Invoices for outward supply'));
      setCell(ws, r, 2, cleanVal(doc.from_num || doc.inum));
      setCell(ws, r, 3, cleanVal(doc.to_num));
      setCell(ws, r, 4, round2(doc.tot_num || doc.qty || 0));
      setCell(ws, r, 5, round2(doc.cancelled || 0));
      setCell(ws, r, 6, round2(doc.net_issued || doc.qty || 0));
      setCell(ws, r, 7, cleanVal(doc.data_source || 'GSTR1'));
      if (r > maxRow) maxRow = r;
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: headers.length - 1 } });
    ws['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, ws, 'DOC');
  }

  return wb;
}

export function exportGstr1FullYearExcel({
  clientInfo,
  financialYear,
  invoices,
  summaries,
  filename
}: {
  clientInfo: { trade_name?: string; legal_name?: string; gstin?: string };
  financialYear: string;
  invoices: Gstr1ExportInvoice[];
  summaries?: any[];
  filename?: string;
}) {
  const wb = generateGstr1FullYearWorkbook({ clientInfo, financialYear, invoices, summaries });
  const fname = filename || `GSTR1_SectionWiseSummary_${clientInfo.gstin || 'Client'}_${financialYear.replace(/[^0-9]/g, '')}.xlsx`;
  XLSX.writeFile(wb, fname);
}
