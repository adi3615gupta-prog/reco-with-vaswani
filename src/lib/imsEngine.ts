/**
 * imsEngine.ts — Core Data Engine, Parsers, Excel Generator & 3B Bridge for GST IMS
 * 
 * Specifically optimized for high-volume CA practice (300+ clients):
 * - Inward invoice parsing from official GSTN IMS JSON exports
 * - Multi-client batch processing
 * - Interactive Client Review Excel generator (with ExcelJS data-validated dropdowns)
 * - Returned Client Excel parser
 * - Official GSTN IMS Action JSON payload generation
 * - Direct Bridge to GSTR-3B Table 4 (Eligible ITC)
 */

import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx-js-style';

/**
 * Standardizes invoice dates (ISO YYYY-MM-DD or DD/MM/YYYY) to standard DD-MM-YYYY
 */
export function normalizeImsDate(d: any): string {
  if (!d) return '';
  const s = String(d).trim();
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[3].padStart(2, '0')}-${isoMatch[2].padStart(2, '0')}-${isoMatch[1]}`;
  }
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    return `${dmyMatch[1].padStart(2, '0')}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[3]}`;
  }
  return s.replace(/\//g, '-');
}

// ─── 1. TYPES & DATA CONTRACTS ──────────────────────────────────────────────────

export type ImsAction = 'ACCEPT' | 'REJECT' | 'PENDING' | 'NO_ACTION';

export interface ImsInvoice {
  id: string;
  batch_id?: string;
  client_gstin: string;
  return_period: string;
  ctin: string;           // Supplier GSTIN
  supplier_name: string;  // Trade/Legal name
  inum: string;           // Invoice No
  idt: string;            // Invoice Date (DD-MM-YYYY or YYYY-MM-DD)
  inv_typ?: string;       // 'R' Regular, 'SEZWP', 'SEZWOP', 'DE', etc.
  pos?: string;           // Place of supply
  rchrg?: string;         // 'Y' or 'N'
  txval: number;          // Taxable value
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  total_val: number;
  source?: string;        // 'GSTR-1' | 'IFF' | 'GSTR-1A'
  source_period?: string;
  action: ImsAction;
  client_remarks?: string;
  reviewed_at?: number;
  reviewed_by?: 'CLIENT' | 'CA';
}

export interface ImsBatchSummary {
  client_id?: string;
  gstin: string;
  trade_name: string;
  legal_name?: string;
  email?: string;
  phone?: string;
  batch_id?: string;
  status: 'NOT_SYNCED' | 'SYNCED' | 'DISPATCHED' | 'PARTIALLY_REVIEWED' | 'REVIEWED' | 'PUSHED_TO_3B' | 'REQUESTED_WAITING';
  total_invoices: number;
  accepted_count: number;
  rejected_count: number;
  pending_count: number;
  no_action_count: number;
  eligible_itc_igst: number;
  eligible_itc_cgst: number;
  eligible_itc_sgst: number;
  eligible_itc_cess: number;
  eligible_itc_total: number;
  updated_at?: number;
  generation_status?: 'NOT_REQUESTED' | 'REQUESTED' | 'READY' | 'DOWNLOADED';
  generation_requested_at?: number;
  active_token?: string;
  token_expires_at?: number;
}

export interface ImsOverallStats {
  totalClients: number;
  syncedClients: number;
  reviewedClients: number;
  pendingClients: number;
  pushedClients: number;
  totalEligibleItc: number;
}

// ─── 2. GSTN IMS JSON PARSER ───────────────────────────────────────────────────

/**
 * Parses raw GST Portal IMS inward JSON data into standardized ImsInvoice array.
 * Robustly parses both nested GSTN official structure (b2b, cdnr, b2ba) and flat exports.
 */
export function parseGstnImsJson(rawJson: any, clientGstin: string, returnPeriod: string): ImsInvoice[] {
  const invoices: ImsInvoice[] = [];

  if (!rawJson) return invoices;

  // Case 1: Already flat array of invoices
  if (Array.isArray(rawJson)) {
    return rawJson.map((item, idx) => normalizeInvoiceRecord(item, clientGstin, returnPeriod, idx));
  }

  // Case 2: Object with "invoices" or "data" array
  if (Array.isArray(rawJson.invoices)) {
    return rawJson.invoices.map((item: any, idx: number) => normalizeInvoiceRecord(item, clientGstin, returnPeriod, idx));
  }
  if (Array.isArray(rawJson.data)) {
    return rawJson.data.map((item: any, idx: number) => normalizeInvoiceRecord(item, clientGstin, returnPeriod, idx));
  }

  // Case 3: Official GSTN IMS JSON with sections (sec_list / b2b / cdnr)
  const gstinFromPayload = rawJson.gstin || clientGstin;

  // Process B2B section
  const b2bList = rawJson.b2b || (rawJson.sec_list && rawJson.sec_list.b2b) || [];
  if (Array.isArray(b2bList)) {
    for (const supplier of b2bList) {
      const ctin = supplier.ctin || '';
      const cname = supplier.cname || supplier.trade_name || '';
      const invList = supplier.inv || [];

      for (const inv of invList) {
        const inum = inv.inum || '';
        const idt = inv.idt || '';
        const val = Number(inv.val) || 0;
        const pos = inv.pos || '';
        const rchrg = inv.rchrg || 'N';
        const inv_typ = inv.inv_typ || 'R';
        const source = inv.srctyp || 'GSTR-1';
        const source_period = inv.fp || returnPeriod;

        // Sum items
        let txval = 0;
        let igst = 0;
        let cgst = 0;
        let sgst = 0;
        let cess = 0;

        if (Array.isArray(inv.itms)) {
          for (const itm of inv.itms) {
            const itmDet = itm.itm_det || itm;
            txval += Number(itmDet.txval) || 0;
            igst += Number(itmDet.iamt) || 0;
            cgst += Number(itmDet.camt) || 0;
            sgst += Number(itmDet.samt) || 0;
            cess += Number(itmDet.csamt) || 0;
          }
        } else {
          txval = Number(inv.txval) || 0;
          igst = Number(inv.iamt) || 0;
          cgst = Number(inv.camt) || 0;
          sgst = Number(inv.samt) || 0;
          cess = Number(inv.csamt) || 0;
        }

        invoices.push({
          id: `ims_${ctin}_${inum}_${idt}`.replace(/[^a-zA-Z0-9_]/g, '_'),
          client_gstin: gstinFromPayload,
          return_period: returnPeriod,
          ctin,
          supplier_name: cname,
          inum,
          idt,
          inv_typ,
          pos,
          rchrg,
          txval: Math.round(txval * 100) / 100,
          igst: Math.round(igst * 100) / 100,
          cgst: Math.round(cgst * 100) / 100,
          sgst: Math.round(sgst * 100) / 100,
          cess: Math.round(cess * 100) / 100,
          total_val: val || Math.round((txval + igst + cgst + sgst + cess) * 100) / 100,
          source,
          source_period,
          action: 'NO_ACTION'
        });
      }
    }
  }

  // Process CDNR (Credit/Debit Notes) section
  const cdnrList = rawJson.cdnr || (rawJson.sec_list && rawJson.sec_list.cdnr) || [];
  if (Array.isArray(cdnrList)) {
    for (const supplier of cdnrList) {
      const ctin = supplier.ctin || '';
      const cname = supplier.cname || supplier.trade_name || '';
      const ntList = supplier.nt || [];

      for (const nt of ntList) {
        const inum = nt.nt_num || nt.inum || '';
        const idt = nt.nt_dt || nt.idt || '';
        const val = Number(nt.val) || 0;
        const pos = nt.pos || '';
        const rchrg = nt.rchrg || 'N';
        const inv_typ = nt.ntty || 'C'; // C or D

        let txval = 0, igst = 0, cgst = 0, sgst = 0, cess = 0;
        if (Array.isArray(nt.itms)) {
          for (const itm of nt.itms) {
            const itmDet = itm.itm_det || itm;
            txval += Number(itmDet.txval) || 0;
            igst += Number(itmDet.iamt) || 0;
            cgst += Number(itmDet.camt) || 0;
            sgst += Number(itmDet.samt) || 0;
            cess += Number(itmDet.csamt) || 0;
          }
        }

        invoices.push({
          id: `ims_cdn_${ctin}_${inum}_${idt}`.replace(/[^a-zA-Z0-9_]/g, '_'),
          client_gstin: gstinFromPayload,
          return_period: returnPeriod,
          ctin,
          supplier_name: cname,
          inum,
          idt,
          inv_typ,
          pos,
          rchrg,
          txval: Math.round(txval * 100) / 100,
          igst: Math.round(igst * 100) / 100,
          cgst: Math.round(cgst * 100) / 100,
          sgst: Math.round(sgst * 100) / 100,
          cess: Math.round(cess * 100) / 100,
          total_val: val || Math.round((txval + igst + cgst + sgst + cess) * 100) / 100,
          source: 'CDNR',
          source_period: nt.fp || returnPeriod,
          action: 'NO_ACTION'
        });
      }
    }
  }

  return invoices;
}

function normalizeInvoiceRecord(item: any, clientGstin: string, returnPeriod: string, idx: number): ImsInvoice {
  const ctin = item.ctin || item.supplier_gstin || item['Supplier GSTIN'] || '';
  const inum = item.inum || item.invoice_number || item['Invoice Number'] || item['Invoice No'] || `INV_${idx + 1}`;
  const rawIdt = item.idt || item.invoice_date || item['Invoice Date'] || '';
  const idt = normalizeImsDate(rawIdt);
  const txval = Number(item.txval || item.taxable_value || item['Taxable Value']) || 0;
  const igst = Number(item.igst || item['IGST']) || 0;
  const cgst = Number(item.cgst || item['CGST']) || 0;
  const sgst = Number(item.sgst || item['SGST']) || 0;
  const cess = Number(item.cess || item['Cess']) || 0;
  const total_val = Number(item.total_val || item.val || item['Total Value']) || Math.round((txval + igst + cgst + sgst + cess) * 100) / 100;

  let rawAction = item.action || item['Action'] || 'NO_ACTION';
  rawAction = String(rawAction).toUpperCase().trim();
  const validAction: ImsAction = (['ACCEPT', 'REJECT', 'PENDING'].includes(rawAction)) ? (rawAction as ImsAction) : 'NO_ACTION';

  return {
    id: item.id || `ims_${ctin}_${inum}_${idt}`.replace(/[^a-zA-Z0-9_]/g, '_') || `inv_${idx}`,
    client_gstin: item.client_gstin || clientGstin,
    return_period: item.return_period || returnPeriod,
    ctin,
    supplier_name: item.supplier_name || item.cname || item['Supplier Name'] || item['Trade Name'] || '',
    inum: String(inum),
    idt: String(idt),
    inv_typ: item.inv_typ || item['Invoice Type'] || 'R',
    pos: item.pos || item['POS'] || '',
    rchrg: item.rchrg || item['Reverse Charge'] || 'N',
    txval,
    igst,
    cgst,
    sgst,
    cess,
    total_val,
    source: item.source || 'GSTR-1',
    source_period: item.source_period || returnPeriod,
    action: validAction,
    client_remarks: item.client_remarks || item['Client Remarks'] || item['Remarks'] || '',
    reviewed_at: item.reviewed_at,
    reviewed_by: item.reviewed_by
  };
}

// ─── 3. INTERACTIVE CLIENT REVIEW EXCEL GENERATOR (ExcelJS) ───────────────────

/**
 * Generates a protected, styled Excel file for client review with native
 * Excel dropdown data validation on the Action column (ACCEPT, REJECT, PENDING).
 */
export function buildImsClientReviewWorkbook(
  client: { gstin: string; tradeName: string; period: string },
  invoices: ImsInvoice[]
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AUDIT WITH VASWANI — GST IMS System';
  wb.created = new Date();

  const ws = wb.addWorksheet('IMS Inward Review', {
    views: [{ showGridLines: true, state: 'frozen', ySplit: 6 }]
  });

  // Title Banner (Unmerged zero-merge architecture)
  const titleCell = ws.getCell('A1');
  titleCell.value = 'AUDIT WITH VASWANI — INVOICE MANAGEMENT SYSTEM (IMS) CLIENT REVIEW';
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Slate-900
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(1).height = 32;

  // Metadata Subheader
  ws.getCell('A2').value = `Client Name: ${client.tradeName.toUpperCase()} | GSTIN: ${client.gstin} | Return Period: ${client.period} | Total Invoices: ${invoices.length}`;
  ws.getCell('A2').font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
  ws.getRow(2).height = 20;

  // Instructions Banner
  const noteCell = ws.getCell('A3');
  noteCell.value = 'INSTRUCTIONS FOR CLIENT: 1. Select decision in Column K (Action): ACCEPT / REJECT / PENDING. 2. Write remarks in Column L. Save & return to CA.';
  noteCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF0369A1' } };
  noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } }; // Light Sky Blue
  noteCell.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(3).height = 22;

  // Column Headers
  const headers = [
    'S.No',
    'Supplier GSTIN',
    'Supplier Name',
    'Invoice No',
    'Invoice Date',
    'Type',
    'Taxable Value (₹)',
    'IGST (₹)',
    'CGST (₹)',
    'SGST (₹)',
    'ACTION (SELECT FROM DROPDOWN)',
    'Client Remarks / Reason'
  ];

  const headerRow = ws.getRow(6);
  headerRow.height = 28;
  headers.forEach((h, colIdx) => {
    const cell = headerRow.getCell(colIdx + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    // Highlight Action column with distinct Violet color
    if (colIdx === 10) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } }; // Indigo-500
    } else {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; // Slate-700
    }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });

  // Set Column Widths
  ws.columns = [
    { key: 'sno', width: 6 },
    { key: 'ctin', width: 18 },
    { key: 'supplier', width: 30 },
    { key: 'inum', width: 16 },
    { key: 'idt', width: 13 },
    { key: 'type', width: 8 },
    { key: 'txval', width: 17 },
    { key: 'igst', width: 14 },
    { key: 'cgst', width: 14 },
    { key: 'sgst', width: 14 },
    { key: 'action', width: 28 },
    { key: 'remarks', width: 35 }
  ];

  // Populate Invoices
  invoices.forEach((inv, i) => {
    const rowNum = 7 + i;
    const row = ws.getRow(rowNum);
    row.height = 22;

    const actionVal = inv.action && inv.action !== 'NO_ACTION' ? inv.action : '';

    row.getCell(1).value = i + 1;
    row.getCell(2).value = inv.ctin;
    row.getCell(3).value = inv.supplier_name;
    row.getCell(4).value = inv.inum;
    row.getCell(5).value = inv.idt;
    row.getCell(6).value = inv.inv_typ || 'R';
    row.getCell(7).value = inv.txval;
    row.getCell(8).value = inv.igst;
    row.getCell(9).value = inv.cgst;
    row.getCell(10).value = inv.sgst;
    row.getCell(11).value = actionVal;
    row.getCell(12).value = inv.client_remarks || '';

    // Alignments & Number formats
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };

    [7, 8, 9, 10].forEach(col => {
      const c = row.getCell(col);
      c.numFmt = '#,##0.00';
      c.alignment = { horizontal: 'right', vertical: 'middle' };
    });

    const actionCell = row.getCell(11);
    actionCell.alignment = { horizontal: 'center', vertical: 'middle' };
    actionCell.font = { name: 'Calibri', size: 10, bold: true };

    // Excel Native Data Validation (Dropdown on Action cell)
    actionCell.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"ACCEPT,REJECT,PENDING"'],
      showErrorMessage: true,
      errorTitle: 'Invalid IMS Action',
      error: 'Please choose ACCEPT, REJECT, or PENDING from the dropdown list.'
    };

    // Soft zebra striping for data rows
    const isEven = i % 2 === 0;
    const bgArgb = isEven ? 'FFFFFFFF' : 'FFF8FAFC';
    for (let c = 1; c <= 12; c++) {
      const cell = row.getCell(c);
      if (c !== 11) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
      } else {
        // Distinct subtle highlight on Action column
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } }; // Light indigo
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    }
  });

  // Total Summary Footer Row
  const totalRowNum = 7 + invoices.length;
  const totalRow = ws.getRow(totalRowNum);
  totalRow.height = 24;
  totalRow.getCell(6).value = 'TOTAL';
  totalRow.getCell(6).font = { bold: true };
  totalRow.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };

  [7, 8, 9, 10].forEach((col, idx) => {
    const colLetter = ['G', 'H', 'I', 'J'][idx];
    const c = totalRow.getCell(col);
    c.value = { formula: `SUM(${colLetter}7:${colLetter}${totalRowNum - 1})` };
    c.numFmt = '#,##0.00';
    c.font = { bold: true };
    c.alignment = { horizontal: 'right', vertical: 'middle' };
  });

  for (let c = 1; c <= 12; c++) {
    const cell = totalRow.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0F172A' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } }
    };
  }

  return wb;
}

export async function generateImsClientReviewExcel(
  client: { gstin: string; tradeName: string; period: string },
  invoices: ImsInvoice[]
): Promise<Blob> {
  const wb = buildImsClientReviewWorkbook(client, invoices);
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ─── 4. PARSE RETURNED CLIENT REVIEW EXCEL ────────────────────────────────────

export interface ParsedClientExcelDecision {
  ctin: string;
  inum: string;
  idt: string;
  action: ImsAction;
  remarks: string;
}

/**
 * Reads an Excel file returned by a client and extracts their marked actions
 * (ACCEPT / REJECT / PENDING) and remarks by locating the corresponding columns.
 */
export async function parseReturnedClientExcel(file: File): Promise<ParsedClientExcelDecision[]> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const decisions: ParsedClientExcelDecision[] = [];

  // Find header row (usually contains "Supplier GSTIN" or "Invoice No" or "Action")
  let headerRowIdx = -1;
  let ctinCol = -1;
  let inumCol = -1;
  let idtCol = -1;
  let actionCol = -1;
  let remarksCol = -1;

  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').toUpperCase().trim();
      if (val.includes('SUPPLIER GSTIN') || val === 'CTIN') ctinCol = c;
      if (val.includes('INVOICE NO') || val === 'INUM') inumCol = c;
      if (val.includes('INVOICE DATE') || val === 'IDT') idtCol = c;
      if (val.includes('ACTION')) actionCol = c;
      if (val.includes('REMARK')) remarksCol = c;
    }
    if (inumCol !== -1 && actionCol !== -1) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1 || actionCol === -1) {
    throw new Error('Could not find Action or Invoice columns in this Excel file. Please ensure it matches the generated template.');
  }

  // Iterate over data rows
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const inum = inumCol !== -1 ? String(row[inumCol] || '').trim() : '';
    if (!inum || inum.toUpperCase() === 'TOTAL') continue;

    const ctin = ctinCol !== -1 ? String(row[ctinCol] || '').trim().toUpperCase() : '';
    const idt = idtCol !== -1 ? String(row[idtCol] || '').trim() : '';
    const rawAction = String(row[actionCol] || '').trim().toUpperCase();
    const remarks = remarksCol !== -1 ? String(row[remarksCol] || '').trim() : '';

    let action: ImsAction = 'NO_ACTION';
    if (rawAction.includes('ACCEPT')) action = 'ACCEPT';
    else if (rawAction.includes('REJECT')) action = 'REJECT';
    else if (rawAction.includes('PEND')) action = 'PENDING';

    decisions.push({
      ctin,
      inum,
      idt,
      action,
      remarks
    });
  }

  return decisions;
}

// ─── 5. CALCULATE GSTR-3B TABLE 4 VALUES FROM IMS ─────────────────────────────

export interface Ims3BTable4Result {
  itc2b: {
    taxable: number;
    igst: number;
    cgst: number;
    sgst: number;
    cess: number;
    total: number;
  };
  rcmInward?: {
    taxable: number;
    igst: number;
    cgst: number;
    sgst: number;
    total: number;
  };
  creditNotes?: {
    taxable: number;
    igst: number;
    cgst: number;
    sgst: number;
    total: number;
  };
  importGoods?: {
    taxable: number;
    igst: number;
    total: number;
  };
  metrics: {
    totalInvoices: number;
    acceptedCount: number;
    rejectedCount: number;
    pendingCount: number;
    noActionCount: number;
    eligibleItcTotal: number;
  };
}

/**
 * Calculates net eligible GSTR-2B Input Tax Credit strictly from ACCEPTED invoices
 * in IMS for feeding into GSTR-3B Table 4(A)(5), separating RCM and Credit Notes.
 */
export function calculate3BTable4FromIms(invoices: ImsInvoice[]): Ims3BTable4Result {
  let itcTx = 0, itcIgst = 0, itcCgst = 0, itcSgst = 0, itcCess = 0;
  let rcmTx = 0, rcmIgst = 0, rcmCgst = 0, rcmSgst = 0;
  let cdnTx = 0, cdnIgst = 0, cdnCgst = 0, cdnSgst = 0;
  let impgIgst = 0;

  let acceptedCount = 0;
  let rejectedCount = 0;
  let pendingCount = 0;
  let noActionCount = 0;

  for (const inv of invoices) {
    const act = (inv.action || 'NO_ACTION').toUpperCase();
    if (act === 'ACCEPT') {
      acceptedCount++;
      const isRcm = (inv.rchrg || '').toUpperCase() === 'Y';
      const isCdn = (inv.inv_typ || '').toUpperCase() === 'C' || (inv.inv_typ || '').toUpperCase() === 'CR' || (inv.source || '').toUpperCase().includes('CDNR');
      const isImpg = (inv.inv_typ || '').toUpperCase() === 'IMPG' || (inv.source || '').toUpperCase().includes('IMPG');

      if (isRcm) {
        rcmTx += inv.txval || 0;
        rcmIgst += inv.igst || 0;
        rcmCgst += inv.cgst || 0;
        rcmSgst += inv.sgst || 0;
      } else if (isCdn) {
        cdnTx += inv.txval || 0;
        cdnIgst += inv.igst || 0;
        cdnCgst += inv.cgst || 0;
        cdnSgst += inv.sgst || 0;
      } else if (isImpg) {
        impgIgst += inv.igst || 0;
      } else {
        itcTx += inv.txval || 0;
        itcIgst += inv.igst || 0;
        itcCgst += inv.cgst || 0;
        itcSgst += inv.sgst || 0;
        itcCess += inv.cess || 0;
      }
    } else if (act === 'REJECT') {
      rejectedCount++;
    } else if (act === 'PENDING') {
      pendingCount++;
    } else {
      noActionCount++;
    }
  }

  const itcTotal = Math.round((itcIgst + itcCgst + itcSgst + itcCess) * 100) / 100;
  const rcmTotal = Math.round((rcmIgst + rcmCgst + rcmSgst) * 100) / 100;
  const cdnTotal = Math.round((cdnIgst + cdnCgst + cdnSgst) * 100) / 100;

  return {
    itc2b: {
      taxable: Math.round(itcTx * 100) / 100,
      igst: Math.round(itcIgst * 100) / 100,
      cgst: Math.round(itcCgst * 100) / 100,
      sgst: Math.round(itcSgst * 100) / 100,
      cess: Math.round(itcCess * 100) / 100,
      total: itcTotal
    },
    rcmInward: {
      taxable: Math.round(rcmTx * 100) / 100,
      igst: Math.round(rcmIgst * 100) / 100,
      cgst: Math.round(rcmCgst * 100) / 100,
      sgst: Math.round(rcmSgst * 100) / 100,
      total: rcmTotal
    },
    creditNotes: {
      taxable: Math.round(cdnTx * 100) / 100,
      igst: Math.round(cdnIgst * 100) / 100,
      cgst: Math.round(cdnCgst * 100) / 100,
      sgst: Math.round(cdnSgst * 100) / 100,
      total: cdnTotal
    },
    importGoods: {
      taxable: 0,
      igst: Math.round(impgIgst * 100) / 100,
      total: Math.round(impgIgst * 100) / 100
    },
    metrics: {
      totalInvoices: invoices.length,
      acceptedCount,
      rejectedCount,
      pendingCount,
      noActionCount,
      eligibleItcTotal: itcTotal
    }
  };
}

// ─── 6. CLIENT CREDENTIALS VAULT EXCEL TEMPLATE & PARSER ──────────────────────

export interface ClientCredentialRecord {
  id?: string;
  gstin: string;
  trade_name: string;
  legal_name?: string;
  phone?: string;
  email?: string;
  portal_username?: string;
  portal_password?: string;
}

/**
 * Generates an Excel template pre-populated with existing clients so the CA
 * can easily fill/paste GST Portal usernames and passwords for 300+ clients.
 */
export function buildCredentialsTemplateWorkbook(
  clients: ClientCredentialRecord[]
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AUDIT WITH VASWANI — Credentials Vault';
  wb.created = new Date();

  const ws = wb.addWorksheet('GST Credentials', {
    views: [{ showGridLines: true, state: 'frozen', ySplit: 5 }]
  });

  // Title Banner (Unmerged zero-merge architecture)
  const titleCell = ws.getCell('A1');
  titleCell.value = 'AUDIT WITH VASWANI — 300+ CLIENTS GST PORTAL CREDENTIALS VAULT';
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(1).height = 30;

  // Instructions
  const noteCell = ws.getCell('A2');
  noteCell.value = 'INSTRUCTIONS FOR CA OFFICE: 1. Fill or paste "GST Portal Username" and "GST Portal Password" columns. 2. Upload file via "Import Credentials Excel".';
  noteCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF0369A1' } };
  noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } };
  noteCell.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(2).height = 22;

  // Headers
  const headers = [
    'S.No',
    'GSTIN (15 Digits)',
    'Trade / Business Name',
    'GST Portal Username (REQUIRED)',
    'GST Portal Password (REQUIRED)',
    'WhatsApp / Mobile',
    'Email Address'
  ];

  const headerRow = ws.getRow(5);
  headerRow.height = 28;
  headers.forEach((h, colIdx) => {
    const cell = headerRow.getCell(colIdx + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    if (colIdx === 3 || colIdx === 4) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } }; // Amber highlight
    } else {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });

  ws.columns = [
    { key: 'sno', width: 6 },
    { key: 'gstin', width: 20 },
    { key: 'trade', width: 32 },
    { key: 'user', width: 28 },
    { key: 'pass', width: 28 },
    { key: 'phone', width: 18 },
    { key: 'email', width: 28 }
  ];

  const rowsToPopulate = clients && clients.length > 0 ? clients : [
    { gstin: '27AAACS1234A1Z1', trade_name: 'Sample Client Enterprises', portal_username: '', portal_password: '', phone: '9820011111', email: 'client@example.com' }
  ];

  rowsToPopulate.forEach((c, i) => {
    const rowNum = 6 + i;
    const row = ws.getRow(rowNum);
    row.height = 22;

    row.getCell(1).value = i + 1;
    row.getCell(2).value = c.gstin;
    row.getCell(3).value = c.trade_name;
    row.getCell(4).value = c.portal_username || '';
    row.getCell(5).value = c.portal_password || '';
    row.getCell(6).value = c.phone || '';
    row.getCell(7).value = c.email || '';

    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell(5).alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(7).alignment = { horizontal: 'left', vertical: 'middle' };

    for (let col = 1; col <= 7; col++) {
      const cell = row.getCell(col);
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
      if (col === 4 || col === 5) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } }; // Soft amber
      }
    }
  });

  return wb;
}

export async function generateCredentialsTemplateExcel(
  clients: ClientCredentialRecord[]
): Promise<Blob> {
  const wb = buildCredentialsTemplateWorkbook(clients);
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Parses uploaded credentials Excel file into ClientCredentialRecord array.
 */
export async function parseCredentialsImportExcel(file: File): Promise<ClientCredentialRecord[]> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  
  // Pick best sheet: search for sheet named credentials/client/vault/gst, fallback to sheet 0
  let targetSheet = wb.Sheets[wb.SheetNames[0]];
  for (const name of wb.SheetNames) {
    if (/credential|client|vault|gst/i.test(name)) {
      targetSheet = wb.Sheets[name];
      break;
    }
  }

  const rows: any[][] = XLSX.utils.sheet_to_json(targetSheet, { header: 1, defval: '' });
  const records: ClientCredentialRecord[] = [];

  let headerRowIdx = -1;
  let gstinCol = -1;
  let tradeCol = -1;
  let userCol = -1;
  let passCol = -1;
  let phoneCol = -1;
  let emailCol = -1;

  // Scan up to first 25 rows for header row
  for (let r = 0; r < Math.min(25, rows.length); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    let r_gstin = -1;
    let r_trade = -1;
    let r_user = -1;
    let r_pass = -1;
    let r_phone = -1;
    let r_email = -1;

    for (let c = 0; c < row.length; c++) {
      const raw = String(row[c] || '').trim();
      // Skip instructions, empty cells, or long paragraphs
      if (!raw || raw.length > 60 || raw.includes('\n')) continue;
      const val = raw.toUpperCase();

      if (val.includes('GSTIN') || val === 'GST' || val === 'GST NO' || val === 'GST NUMBER' || val.includes('UIN')) {
        r_gstin = c;
      }
      if ((val.includes('TRADE') || val.includes('BUSINESS') || val.includes('CLIENT') || val.includes('FIRM') || val.includes('PARTY') || val.includes('COMPANY') || val.includes('NAME')) && !val.includes('USER')) {
        r_trade = c;
      }
      if (val.includes('USER') || val.includes('LOGIN') || val.includes('PORTAL ID')) {
        r_user = c;
      }
      if (val.includes('PASS') || val.includes('PWD')) {
        r_pass = c;
      }
      if (val.includes('PHONE') || val.includes('MOBILE') || val.includes('WHATSAPP') || val.includes('CONTACT') || val.includes('TEL')) {
        r_phone = c;
      }
      if (val.includes('EMAIL') || val.includes('MAIL')) {
        r_email = c;
      }
    }

    if (r_gstin !== -1 && (r_user !== -1 || r_pass !== -1 || r_trade !== -1 || r_phone !== -1 || r_email !== -1)) {
      headerRowIdx = r;
      gstinCol = r_gstin;
      tradeCol = r_trade;
      userCol = r_user;
      passCol = r_pass;
      phoneCol = r_phone;
      emailCol = r_email;
      break;
    }
  }

  // Fallback: If no named header found, scan for a column containing valid 15-character GSTINs
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[0-9A-Z]{2}$/;
  if (gstinCol === -1) {
    for (let c = 0; c < 15; c++) {
      let gstinMatches = 0;
      for (let r = 0; r < Math.min(20, rows.length); r++) {
        const val = String(rows[r]?.[c] || '').trim().toUpperCase().replace(/[\s-]/g, '');
        if (gstinRegex.test(val)) gstinMatches++;
      }
      if (gstinMatches >= 2) {
        gstinCol = c;
        headerRowIdx = 0; // Assume data starts right away
        break;
      }
    }
  }

  if (gstinCol === -1) {
    throw new Error('Could not identify GSTIN column in this Excel file. Please use the downloaded template.');
  }

  const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;
  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    let gstin = String(row[gstinCol] || '').trim().toUpperCase().replace(/[\s-]/g, '');
    let trade = tradeCol !== -1 ? String(row[tradeCol] || '').trim() : '';

    // Check if gstin and trade are swapped (e.g. gstin is in trade column or vice versa)
    if (!gstinRegex.test(gstin) && gstinRegex.test(trade.replace(/[\s-]/g, '').toUpperCase())) {
      const realGstin = trade.replace(/[\s-]/g, '').toUpperCase();
      trade = String(row[gstinCol] || '').trim();
      gstin = realGstin;
    }

    if (!gstin || gstin.length < 10) continue;

    const user = userCol !== -1 ? String(row[userCol] || '').trim() : '';
    const pass = passCol !== -1 ? String(row[passCol] || '').trim() : '';
    const phone = phoneCol !== -1 ? String(row[phoneCol] || '').trim().replace(/\.0$/, '') : '';
    const email = emailCol !== -1 ? String(row[emailCol] || '').trim() : '';

    records.push({
      gstin,
      trade_name: trade,
      portal_username: user,
      portal_password: pass,
      phone,
      email
    });
  }

  return records;
}

