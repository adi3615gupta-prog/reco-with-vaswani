import * as XLSX from 'xlsx';

export interface Gstr2bExportInvoice {
  return_period?: string;
  section?: string;
  ctin: string;
  supplier_name?: string;
  inum: string;
  idt: string;
  inv_typ?: string;
  pos?: string;
  rchrg?: string;
  itc_available?: string;
  itc_reason?: string;
  txval: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  total_val: number;
  source_period?: string;
  filing_date?: string;
}

const MONTH_ORDER = [
  'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March'
];

function round2(num: any): number {
  return Math.round((Number(num) || 0) * 100) / 100;
}

export function formatGeneratedTimestamp(): string {
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

/**
 * removeAllMergesFromWorkbook — Defense-in-depth zero-merge enforcement.
 * Strips all '!merges' arrays from every worksheet in the workbook
 * to guarantee 100% filterable and sortable spreadsheets for CAs.
 */
export function removeAllMergesFromWorkbook(wb: XLSX.WorkBook): XLSX.WorkBook {
  if (!wb || !wb.SheetNames) return wb;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (ws) {
      ws['!merges'] = [];
      delete ws['!merges'];
    }
  }
  return wb;
}

export function generateGstr2bFullYearWorkbook({
  clientInfo = {},
  financialYear = '2025-2026',
  invoices = []
}: {
  clientInfo: { trade_name?: string; legal_name?: string; gstin?: string };
  financialYear: string;
  invoices: Gstr2bExportInvoice[];
}): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const dealerName = clientInfo.trade_name || clientInfo.legal_name || 'DEALER';
  const gstin = (clientInfo.gstin || '').toUpperCase();
  const timestampStr = formatGeneratedTimestamp();

  // 1. Group Invoices by Section
  const b2bInvoices: Gstr2bExportInvoice[] = [];
  const cdnrInvoices: Gstr2bExportInvoice[] = [];
  const ecoInvoices: Gstr2bExportInvoice[] = [];
  const isdInvoices: Gstr2bExportInvoice[] = [];
  const impgInvoices: Gstr2bExportInvoice[] = [];
  const impgSezInvoices: Gstr2bExportInvoice[] = [];
  const b2bRejected: Gstr2bExportInvoice[] = [];
  const cdnrRejected: Gstr2bExportInvoice[] = [];

  for (const inv of invoices) {
    const sec = (inv.section || 'B2B').toUpperCase();
    const isEligible = inv.itc_available !== 'N';

    if (sec.includes('REJECTED') || !isEligible) {
      if (sec.includes('CDNR')) {
        cdnrRejected.push(inv);
      } else {
        b2bRejected.push(inv);
      }
    } else if (sec.includes('CDNR')) {
      cdnrInvoices.push(inv);
    } else if (sec.includes('ISD')) {
      isdInvoices.push(inv);
    } else if (sec.includes('IMPGSEZ') || sec.includes('IMPG-SEZ')) {
      impgSezInvoices.push(inv);
    } else if (sec.includes('IMPG')) {
      impgInvoices.push(inv);
    } else if (sec.includes('ECO')) {
      ecoInvoices.push(inv);
    } else {
      b2bInvoices.push(inv);
    }
  }

  // 2. Month-wise & Party-wise Calculation
  const monthStats: Record<string, { b2b: any; cdnr: any }> = {};
  MONTH_ORDER.forEach(m => {
    monthStats[m.toUpperCase()] = {
      b2b: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
      cdnr: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 }
    };
  });

  const partyStats: Record<string, { b2b: any; cdnr: any }> = {};

  const getMonthNameFromPeriod = (periodStr?: string, idt?: string): string => {
    const p = (periodStr || '').toLowerCase();
    for (const m of MONTH_ORDER) {
      if (p.includes(m.toLowerCase())) return m.toUpperCase();
    }
    if (idt) {
      const parts = idt.split(/[\/\-]/);
      if (parts.length >= 2) {
        const mNum = parseInt(parts[1], 10);
        if (mNum >= 1 && mNum <= 12) {
          const calendarOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          return calendarOrder[mNum - 1].toUpperCase();
        }
      }
    }
    return 'APRIL';
  };

  b2bInvoices.forEach(inv => {
    const mKey = getMonthNameFromPeriod(inv.return_period, inv.idt);
    if (monthStats[mKey]) {
      monthStats[mKey].b2b.taxable += Number(inv.txval) || 0;
      monthStats[mKey].b2b.cgst += Number(inv.cgst) || 0;
      monthStats[mKey].b2b.sgst += Number(inv.sgst) || 0;
      monthStats[mKey].b2b.igst += Number(inv.igst) || 0;
      monthStats[mKey].b2b.cess += Number(inv.cess) || 0;
    }

    const partyName = (inv.supplier_name || inv.ctin || 'UNKNOWN').trim().toUpperCase();
    if (!partyStats[partyName]) {
      partyStats[partyName] = {
        b2b: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
        cdnr: { taxable: 0, cgst: 0, sgst: 0, igst: 0 }
      };
    }
    partyStats[partyName].b2b.taxable += Number(inv.txval) || 0;
    partyStats[partyName].b2b.cgst += Number(inv.cgst) || 0;
    partyStats[partyName].b2b.sgst += Number(inv.sgst) || 0;
    partyStats[partyName].b2b.igst += Number(inv.igst) || 0;
  });

  cdnrInvoices.forEach(inv => {
    const mKey = getMonthNameFromPeriod(inv.return_period, inv.idt);
    if (monthStats[mKey]) {
      monthStats[mKey].cdnr.taxable += Number(inv.txval) || 0;
      monthStats[mKey].cdnr.cgst += Number(inv.cgst) || 0;
      monthStats[mKey].cdnr.sgst += Number(inv.sgst) || 0;
      monthStats[mKey].cdnr.igst += Number(inv.igst) || 0;
      monthStats[mKey].cdnr.cess += Number(inv.cess) || 0;
    }

    const partyName = (inv.supplier_name || inv.ctin || 'UNKNOWN').trim().toUpperCase();
    if (!partyStats[partyName]) {
      partyStats[partyName] = {
        b2b: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
        cdnr: { taxable: 0, cgst: 0, sgst: 0, igst: 0 }
      };
    }
    partyStats[partyName].cdnr.taxable += Number(inv.txval) || 0;
    partyStats[partyName].cdnr.cgst += Number(inv.cgst) || 0;
    partyStats[partyName].cdnr.sgst += Number(inv.sgst) || 0;
    partyStats[partyName].cdnr.igst += Number(inv.igst) || 0;
  });

  const sortedParties = Object.keys(partyStats).sort((a, b) => {
    const totA = partyStats[a].b2b.taxable + partyStats[a].cdnr.taxable;
    const totB = partyStats[b].b2b.taxable + partyStats[b].cdnr.taxable;
    return totB - totA;
  });

  // 3. Sheet B2B
  const b2bSheetData: any[][] = [];
  b2bSheetData.push(['GSTR-2B - B2B Invoices']);
  b2bSheetData.push(['Dealer Name:', null, dealerName]);
  b2bSheetData.push(['GSTIN:', null, gstin]);
  b2bSheetData.push(['FinYear:', null, financialYear]);

  const row5 = new Array(75).fill(null);
  row5[57] = 'B2B';
  row5[63] = 'CREDIT NOTE';
  row5[69] = 'NET';
  b2bSheetData.push(row5);

  const row6 = new Array(75).fill(null);
  row6[0] = `GENERATED DATE & TIME :- ${timestampStr}`;
  row6[33] = 'B2B';
  row6[39] = 'CREDIT NOTE';
  row6[45] = 'NET';
  b2bSheetData.push(row6);
  b2bSheetData.push([]);

  const b2bRow8 = [
    'Period', 'Trade/Legal name', 'GSTIN of supplier', 'POS', 'Invoice Type', 'Reverse Charge',
    'Invoice No', 'Invoice Date', 'Invoice Value', 'Taxable Value', 'Tax Rate', 'IGST', 'CGST', 'SGST', 'Cess',
    'GSTR-1/5 Filling Period', 'GSTR-1/5 Filling Date', 'ITC Availibility', 'Reason', 'Source Type',
    'E-Invoice Applicable', 'IRN', 'IRN Generated Date', 'ITC Claim Status', 'ITC Claim Period',
    null,
    'MONTHS', 'TAXABLE', 'CGST', 'SGST', 'IGST',
    null,
    'MONTHS', 'TAXABLE', 'CGST', 'SGST', 'IGST',
    null,
    'MONTHS', 'TAXABLE', 'CGST', 'SGST', 'IGST',
    null,
    'MONTHS', 'TAXABLE', 'CGST', 'SGST', 'IGST',
    null, null,
    'PARTY NAME', 'TAXABLE', 'CGST', 'SGST', 'IGST',
    null,
    'PARTY NAME', 'TAXABLE', 'CGST', 'SGST', 'IGST',
    null,
    'PARTY NAME', 'TAXABLE', 'CGST', 'SGST', 'IGST',
    null,
    'PARTY NAME', 'TAXABLE', 'CGST', 'SGST', 'IGST'
  ];
  b2bSheetData.push(b2bRow8);

  const maxDataRows = Math.max(b2bInvoices.length, MONTH_ORDER.length, sortedParties.length);

  for (let r = 0; r < maxDataRows; r++) {
    const row = new Array(75).fill(null);

    if (r < b2bInvoices.length) {
      const inv = b2bInvoices[r];
      row[0] = inv.return_period || '';
      row[1] = inv.supplier_name || '';
      row[2] = (inv.ctin || '').toUpperCase();
      row[3] = inv.pos || '';
      row[4] = inv.inv_typ || 'Regular';
      row[5] = inv.rchrg === 'Y' ? 'Yes' : 'No';
      row[6] = inv.inum || '';
      row[7] = inv.idt || '';
      row[8] = round2(inv.total_val || (inv.txval + inv.igst + inv.cgst + inv.sgst + inv.cess));
      row[9] = round2(inv.txval);
      row[10] = 0;
      row[11] = round2(inv.igst);
      row[12] = round2(inv.cgst);
      row[13] = round2(inv.sgst);
      row[14] = round2(inv.cess);
      row[15] = inv.source_period || '';
      row[16] = inv.filing_date || '';
      row[17] = inv.itc_available === 'Y' ? 'Yes' : 'No';
      row[18] = inv.itc_reason || '';
      row[19] = ''; row[20] = ''; row[21] = ''; row[22] = ''; row[23] = ''; row[24] = '';

      const mText = getMonthNameFromPeriod(inv.return_period, inv.idt);
      row[26] = mText;
      row[27] = round2(inv.txval);
      row[28] = round2(inv.cgst);
      row[29] = round2(inv.sgst);
      row[30] = round2(inv.igst);

      row[51] = inv.supplier_name || inv.ctin || '';
      row[52] = round2(inv.txval);
      row[53] = round2(inv.cgst);
      row[54] = round2(inv.sgst);
      row[55] = round2(inv.igst);
    }

    if (r < MONTH_ORDER.length) {
      const mName = MONTH_ORDER[r].toUpperCase();
      const s = monthStats[mName] || { b2b: {}, cdnr: {} };
      row[32] = mName;
      row[33] = round2(s.b2b.taxable);
      row[34] = round2(s.b2b.cgst);
      row[35] = round2(s.b2b.sgst);
      row[36] = round2(s.b2b.igst);

      row[38] = mName;
      row[39] = round2(s.cdnr.taxable);
      row[40] = round2(s.cdnr.cgst);
      row[41] = round2(s.cdnr.sgst);
      row[42] = round2(s.cdnr.igst);

      row[44] = mName;
      row[45] = round2(s.b2b.taxable - s.cdnr.taxable);
      row[46] = round2(s.b2b.cgst - s.cdnr.cgst);
      row[47] = round2(s.b2b.sgst - s.cdnr.sgst);
      row[48] = round2(s.b2b.igst - s.cdnr.igst);
    }

    if (r < sortedParties.length) {
      const pName = sortedParties[r];
      const ps = partyStats[pName] || { b2b: {}, cdnr: {} };
      row[57] = pName;
      row[58] = round2(ps.b2b.taxable);
      row[59] = round2(ps.b2b.cgst);
      row[60] = round2(ps.b2b.sgst);
      row[61] = round2(ps.b2b.igst);

      row[63] = pName;
      row[64] = round2(ps.cdnr.taxable);
      row[65] = round2(ps.cdnr.cgst);
      row[66] = round2(ps.cdnr.sgst);
      row[67] = round2(ps.cdnr.igst);

      row[69] = pName;
      row[70] = round2(ps.b2b.taxable - ps.cdnr.taxable);
      row[71] = round2(ps.b2b.cgst - ps.cdnr.cgst);
      row[72] = round2(ps.b2b.sgst - ps.cdnr.sgst);
      row[73] = round2(ps.b2b.igst - ps.cdnr.igst);
    }

    b2bSheetData.push(row);
  }

  const b2bWs = XLSX.utils.aoa_to_sheet(b2bSheetData);
  b2bWs['!merges'] = [];
  XLSX.utils.book_append_sheet(wb, b2bWs, 'B2B');

  // 4. Sheet CDNR
  const cdnrSheetData: any[][] = [
    ['GSTR-2B - CDNR Invoices'],
    ['Dealer Name:', null, dealerName],
    ['GSTIN:', null, gstin],
    ['FinYear:', null, financialYear],
    new Array(51).fill(null)
  ];
  const cdnrRow6 = new Array(51).fill(null);
  cdnrRow6[0] = `GENERATED DATE & TIME :- ${timestampStr}`;
  cdnrSheetData.push(cdnrRow6);
  cdnrSheetData.push([]);

  const cdnrRow8 = [
    'Period', 'Trade/Legal name', 'GSTIN of supplier', 'POS', 'Invoice Type', 'Reverse Charge',
    'Note Type', 'Note No', 'Note Date', 'Invoice Value', 'Taxable Value', 'Tax Rate', 'IGST', 'CGST', 'SGST', 'Cess',
    'GSTR-1/5 Filling Period', 'GSTR-1/5 Filling Date', 'ITC Availibility', 'Reason', 'Source Type',
    'E-Invoice Applicable', 'IRN', 'IRN Generated Date', 'ITC Claim Status', 'ITC Claim Period',
    null,
    'MONTHS', 'TAXABLE', 'CGST', 'SGST', 'IGST',
    null,
    'MONTHS', 'TAXABLE', 'CGST', 'SGST', 'IGST',
    null,
    'PARTY NAME', 'TAXABLE', 'CGST', 'SGST', 'IGST',
    null,
    'PARTY NAME', 'TAXABLE', 'CGST', 'SGST', 'IGST'
  ];
  cdnrSheetData.push(cdnrRow8);

  const cdnrMaxRows = Math.max(cdnrInvoices.length, MONTH_ORDER.length, sortedParties.length);

  for (let r = 0; r < cdnrMaxRows; r++) {
    const row = new Array(51).fill(null);

    if (r < cdnrInvoices.length) {
      const inv = cdnrInvoices[r];
      row[0] = inv.return_period || '';
      row[1] = inv.supplier_name || '';
      row[2] = (inv.ctin || '').toUpperCase();
      row[3] = inv.pos || '';
      row[4] = inv.inv_typ || 'Credit Note';
      row[5] = inv.rchrg === 'Y' ? 'Yes' : 'No';
      row[6] = 'Credit';
      row[7] = inv.inum || '';
      row[8] = inv.idt || '';
      row[9] = round2(inv.total_val || (inv.txval + inv.igst + inv.cgst + inv.sgst + inv.cess));
      row[10] = round2(inv.txval);
      row[11] = 0;
      row[12] = round2(inv.igst);
      row[13] = round2(inv.cgst);
      row[14] = round2(inv.sgst);
      row[15] = round2(inv.cess);
      row[16] = inv.source_period || '';
      row[17] = inv.filing_date || '';
      row[18] = inv.itc_available === 'Y' ? 'Yes' : 'No';
      row[19] = inv.itc_reason || '';

      const mText = getMonthNameFromPeriod(inv.return_period, inv.idt);
      row[27] = mText;
      row[28] = round2(inv.txval);
      row[29] = round2(inv.cgst);
      row[30] = round2(inv.sgst);
      row[31] = round2(inv.igst);

      row[39] = inv.supplier_name || inv.ctin || '';
      row[40] = round2(inv.txval);
      row[41] = round2(inv.cgst);
      row[42] = round2(inv.sgst);
      row[43] = round2(inv.igst);
    }

    if (r < MONTH_ORDER.length) {
      const mName = MONTH_ORDER[r].toUpperCase();
      const s = monthStats[mName] || { cdnr: {} };
      row[33] = mName;
      row[34] = round2(s.cdnr.taxable);
      row[35] = round2(s.cdnr.cgst);
      row[36] = round2(s.cdnr.sgst);
      row[37] = round2(s.cdnr.igst);
    }

    if (r < sortedParties.length) {
      const pName = sortedParties[r];
      const ps = partyStats[pName] || { cdnr: {} };
      row[45] = pName;
      row[46] = round2(ps.cdnr.taxable);
      row[47] = round2(ps.cdnr.cgst);
      row[48] = round2(ps.cdnr.sgst);
      row[49] = round2(ps.cdnr.igst);
    }

    cdnrSheetData.push(row);
  }

  const cdnrWs = XLSX.utils.aoa_to_sheet(cdnrSheetData);
  cdnrWs['!merges'] = [];
  XLSX.utils.book_append_sheet(wb, cdnrWs, 'CDNR');

  // 5. Append Other Section Sheets
  const addStandardSheet = (name: string, title: string, items: Gstr2bExportInvoice[], headers: string[]) => {
    const sData: any[][] = [
      [title],
      ['Dealer Name:', null, dealerName],
      ['GSTIN:', null, gstin],
      ['FinYear:', null, financialYear],
      [],
      [`GENERATED DATE & TIME :- ${timestampStr}`],
      [],
      headers
    ];
    items.forEach(inv => {
      if (name === 'ISD') {
        sData.push([
          inv.return_period || '', inv.supplier_name || '', (inv.ctin || '').toUpperCase(),
          'ISD Invoice', inv.inum || '', inv.idt || '', '', '', round2(inv.igst),
          round2(inv.cgst), round2(inv.sgst), round2(inv.cess), inv.source_period || '',
          inv.filing_date || '', inv.itc_available === 'Y' ? 'Yes' : 'No', '', ''
        ]);
      } else if (name === 'IMPG') {
        sData.push([
          inv.return_period || '', '', inv.pos || '', inv.inum || '', inv.idt || '',
          round2(inv.txval), round2(inv.igst), round2(inv.cess), '', '', ''
        ]);
      } else if (name === 'IMPGSEZ') {
        sData.push([
          inv.return_period || '', inv.supplier_name || '', (inv.ctin || '').toUpperCase(),
          '', inv.pos || '', inv.inum || '', inv.idt || '', round2(inv.txval),
          round2(inv.igst), round2(inv.cess), '', '', ''
        ]);
      } else if (name === 'B2B(Rejected)') {
        sData.push([
          inv.return_period || '', inv.supplier_name || '', (inv.ctin || '').toUpperCase(),
          inv.pos || '', inv.inv_typ || 'Regular', inv.rchrg === 'Y' ? 'Yes' : 'No',
          inv.inum || '', inv.idt || '', round2(inv.total_val), round2(inv.txval), 0,
          round2(inv.igst), round2(inv.cgst), round2(inv.sgst), round2(inv.cess),
          inv.source_period || '', inv.filing_date || '', 'No', inv.itc_reason || 'Ineligible ITC',
          '', '', '', ''
        ]);
      } else if (name === 'CDNR(Rejected)') {
        sData.push([
          inv.return_period || '', inv.supplier_name || '', (inv.ctin || '').toUpperCase(),
          inv.pos || '', inv.inv_typ || 'Credit Note', inv.rchrg === 'Y' ? 'Yes' : 'No',
          'Credit', inv.inum || '', inv.idt || '', round2(inv.total_val), round2(inv.txval),
          0, round2(inv.igst), round2(inv.cgst), round2(inv.sgst), round2(inv.cess),
          inv.source_period || '', inv.filing_date || '', 'No', inv.itc_reason || 'Ineligible ITC',
          '', '', '', ''
        ]);
      } else {
        sData.push([
          inv.return_period || '', inv.supplier_name || '', (inv.ctin || '').toUpperCase(),
          inv.pos || '', inv.inv_typ || 'Regular', inv.inum || '', inv.idt || '',
          round2(inv.total_val), round2(inv.txval), 0, round2(inv.igst), round2(inv.cgst),
          round2(inv.sgst), round2(inv.cess), inv.source_period || '', inv.filing_date || '',
          inv.itc_available === 'Y' ? 'Yes' : 'No', inv.itc_reason || '', '', '', '', '', '', ''
        ]);
      }
    });
    const ws = XLSX.utils.aoa_to_sheet(sData);
    ws['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  addStandardSheet('ECO', 'GSTR-2B - ECO Invoices', ecoInvoices, [
    'Period', 'Trade/Legal name', 'GSTIN of supplier', 'POS', 'Invoice Type', 'Invoice No', 'Invoice Date',
    'Invoice Value', 'Taxable Value', 'Tax Rate', 'IGST', 'CGST', 'SGST', 'Cess', 'GSTR-1/5 Filling Period',
    'GSTR-1/5 Filling Date', 'ITC Availibility', 'Reason', 'Source Type', 'E-Invoice Applicable', 'IRN',
    'IRN Generated Date', 'ITC Claim Status', 'ITC Claim Period'
  ]);

  addStandardSheet('ISD', 'GSTR-2B - ISD Invoices', isdInvoices, [
    'Period', 'Trade/Legal name', 'GSTIN of ISD', 'ISD Document type', 'ISD Document number', 'ISD Document date',
    'Original Invoice Number', 'Original Invoice date', 'IGST', 'CGST', 'SGST', 'Cess', 'ISD GSTR-6 Period',
    'ISD GSTR-6 Filing Date', 'Eligibility of ITC', 'ITC Claim Status', 'ITC Claim Period'
  ]);

  addStandardSheet('IMPG', 'GSTR-2B - IMPG Invoices', impgInvoices, [
    'Period', 'Icegate Reference Date', 'Port Code', 'Bill Number', 'Bill Date', 'Taxable Value',
    'IGST', 'Cess', 'Amended (Yes)', 'ITC Claim Status', 'ITC Claim Period'
  ]);

  addStandardSheet('IMPGSEZ', 'GSTR-2B - IMPGSEZ Invoices', impgSezInvoices, [
    'Period', 'Trade/Legal name', 'GSTIN of supplier', 'Icegate Reference Date', 'Port Code', 'Bill Number',
    'Bill Date', 'Taxable Value', 'IGST', 'Cess', 'Amended (Yes)', 'ITC Claim Status', 'ITC Claim Period'
  ]);

  addStandardSheet('B2B(Rejected)', 'GSTR-2B - B2B Invoices (Rejected)', b2bRejected, [
    'Period', 'Trade/Legal name', 'GSTIN of supplier', 'POS', 'Invoice Type', 'Reverse Charge',
    'Invoice No', 'Invoice Date', 'Invoice Value', 'Taxable Value', 'Tax Rate', 'IGST', 'CGST', 'SGST', 'Cess',
    'GSTR-1/5 Filling Period', 'GSTR-1/5 Filling Date', 'ITC Availibility', 'Reason', 'Source Type',
    'E-Invoice Applicable', 'IRN', 'IRN Generated Date'
  ]);

  addStandardSheet('CDNR(Rejected)', 'GSTR-2B - CDNR Invoices (Rejected)', cdnrRejected, [
    'Period', 'Trade/Legal name', 'GSTIN of supplier', 'POS', 'Invoice Type', 'Reverse Charge',
    'Note Type', 'Note No', 'Note Date', 'Invoice Value', 'Taxable Value', 'Tax Rate', 'IGST', 'CGST', 'SGST', 'Cess',
    'GSTR-1/5 Filling Period', 'GSTR-1/5 Filling Date', 'ITC Availibility', 'Reason', 'Source Type',
    'E-Invoice Applicable', 'IRN', 'IRN Generated Date'
  ]);

  // Final Zero-Merge Defense-in-Depth Guardrail
  removeAllMergesFromWorkbook(wb);

  return wb;
}

export function exportGstr2bFullYearExcel({
  clientInfo,
  financialYear,
  invoices,
  filename
}: {
  clientInfo: { trade_name?: string; legal_name?: string; gstin?: string };
  financialYear: string;
  invoices: Gstr2bExportInvoice[];
  filename?: string;
}) {
  const wb = generateGstr2bFullYearWorkbook({ clientInfo, financialYear, invoices });
  const fname = filename || `GSTR2B_SectionWiseSummary_${clientInfo.gstin || 'Client'}_${financialYear.replace(/[^0-9]/g, '')}.xlsx`;
  XLSX.writeFile(wb, fname);
}
