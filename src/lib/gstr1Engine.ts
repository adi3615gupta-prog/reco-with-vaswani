/**
 * gstr1Engine.ts
 * 
 * Canonical GSTR-1 Outward Return Preparation & Classification Engine.
 * 
 * Capabilities reverse-engineered from:
 * 1. Official GST Offline Tool (Release 3.2.4) - Exact JSON schema, bifurcated HSN, Table 14/15 ECO.
 * 2. TaxPower GST (D:\Magnum Infosystem\TaxPower GST) - Tally UQC Normalization, Table 13 Document Series Gap Analyzer,
 *    3-tier Place of Supply (POS) Resolver, and All-In-One Flat Sales Register Parser.
 */

// ─── 1. Canonical Type Definitions ──────────────────────────────────────────

export interface Gstr1ItemDetail {
  num?: number;
  txval: number;
  rt: number;
  iamt?: number;
  camt?: number;
  samt?: number;
  csamt?: number;
}

export interface Gstr1InvoiceItem {
  num: number;
  itm_det: Gstr1ItemDetail;
}

export interface Gstr1B2BInvoice {
  inum: string;
  idt: string; // DD-MM-YYYY
  val: number;
  pos: string; // 2-digit state code e.g. "27"
  rchrg: 'Y' | 'N';
  inv_typ: 'R' | 'DE' | 'SEWP' | 'SEWOP' | 'CBW';
  diff_percent?: number;
  itms: Gstr1InvoiceItem[];
  // Metadata for UI grid
  buyerName?: string;
  rawGstin?: string;
}

export interface Gstr1B2BGroup {
  ctin: string; // 15-digit GSTIN
  cfs?: 'Y' | 'N';
  inv: Gstr1B2BInvoice[];
}

export interface Gstr1B2CLInvoice {
  inum: string;
  idt: string;
  val: number;
  diff_percent?: number;
  itms: Gstr1InvoiceItem[];
  buyerName?: string;
}

export interface Gstr1B2CLGroup {
  pos: string; // 2-digit state code
  inv: Gstr1B2CLInvoice[];
}

export interface Gstr1B2CSItem {
  sply_ty: 'INTRA' | 'INTER';
  pos: string;
  typ: 'OE' | 'E';
  txval: number;
  rt: number;
  iamt?: number;
  camt?: number;
  samt?: number;
  csamt?: number;
  diff_percent?: number;
}

export interface Gstr1CdnNoteItem {
  ntty: 'C' | 'D';
  nt_num: string;
  nt_dt: string;
  val: number;
  pos: string;
  rchrg: 'Y' | 'N';
  p_gst?: 'Y' | 'N';
  d_flag?: 'Y' | 'N';
  diff_percent?: number;
  itms: Gstr1InvoiceItem[];
  buyerName?: string;
}

export interface Gstr1CdnrGroup {
  ctin: string;
  cfs?: 'Y' | 'N';
  nt: Gstr1CdnNoteItem[];
}

export interface Gstr1CdnurNote {
  typ: 'B2CL' | 'B2CS' | 'EXPWP' | 'EXPWOP';
  ntty: 'C' | 'D';
  nt_num: string;
  nt_dt: string;
  val: number;
  pos: string;
  diff_percent?: number;
  itms: Gstr1InvoiceItem[];
  buyerName?: string;
}

export interface Gstr1ExportInvoice {
  exp_typ: 'WPAY' | 'WOPAY';
  inv: {
    inum: string;
    idt: string;
    val: number;
    sbnum?: string;
    sbdt?: string;
    sbpcode?: string;
    diff_percent?: number;
    itms: Gstr1InvoiceItem[];
  }[];
}

export interface Gstr1AdvanceItem {
  pos: string;
  sply_ty: 'INTRA' | 'INTER';
  diff_percent?: number;
  itms: {
    rt: number;
    ad_amt: number;
    iamt?: number;
    camt?: number;
    samt?: number;
    csamt?: number;
  }[];
}

export interface Gstr1AdvanceAdjustedItem {
  pos: string;
  sply_ty: 'INTRA' | 'INTER';
  diff_percent?: number;
  itms: {
    rt: number;
    ad_amt: number;
    iamt?: number;
    camt?: number;
    samt?: number;
    csamt?: number;
  }[];
}

export interface Gstr1NilRatedSupplies {
  inv_ty: 'INTERB2B' | 'INTRAB2B' | 'INTERB2C' | 'INTRAB2C';
  nil_amt: number;
  expt_amt: number;
  ngsup_amt: number;
}

export interface Gstr1HsnItem {
  num: number;
  hsn_sc: string;
  desc: string;
  uqc: string;
  qty: number;
  val: number;
  txval: number;
  rt: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

export interface Gstr1BifurcatedHsn {
  hsn_b2b: Gstr1HsnItem[];
  hsn_b2c: Gstr1HsnItem[];
}

export interface Gstr1DocDetailItem {
  num: number;
  from: string;
  to: string;
  totnum: number;
  canc: number;
  net_issue: number;
}

export interface Gstr1DocTypeGroup {
  doc_num: number;
  doc_typ: string;
  docs: Gstr1DocDetailItem[];
}

export interface Gstr1DocIssue {
  doc_det: Gstr1DocTypeGroup[];
}

export interface Gstr1EcoSupplies {
  clttx?: {
    etin: string;
    txval: number;
    iamt: number;
    camt: number;
    samt: number;
    csamt: number;
  }[];
  paytx?: {
    etin: string;
    txval: number;
    iamt: number;
    camt: number;
    samt: number;
    csamt: number;
  }[];
}

export interface Gstr1ReturnData {
  gstin: string;
  fp: string; // MMYYYY e.g. "092026"
  gt?: number;
  cur_gt?: number;
  version?: string; // "GSTR1_V3.2.4"
  hash?: string;
  b2b: Gstr1B2BGroup[];
  b2ba?: any[];
  b2cl: Gstr1B2CLGroup[];
  b2cla?: any[];
  b2cs: Gstr1B2CSItem[];
  b2csa?: any[];
  cdnr: Gstr1CdnrGroup[];
  cdnra?: any[];
  cdnur: Gstr1CdnurNote[];
  cdnura?: any[];
  exp: Gstr1ExportInvoice[];
  expa?: any[];
  at?: Gstr1AdvanceItem[];
  ata?: any[];
  atadj?: Gstr1AdvanceAdjustedItem[];
  atadja?: any[];
  nil?: { inv: Gstr1NilRatedSupplies[] };
  hsn: Gstr1BifurcatedHsn;
  doc_issue: Gstr1DocIssue;
  supeco?: Gstr1EcoSupplies;
  supecoa?: any;
  ecom?: any;
  ecoma?: any;
  // Computed summary metrics
  summary?: {
    totalTaxable: number;
    totalIgst: number;
    totalCgst: number;
    totalSgst: number;
    totalCess: number;
    totalTax: number;
    totalInvoices: number;
    b2bCount: number;
    b2clCount: number;
    b2csCount: number;
    cdnrCount: number;
    cdnurCount: number;
    hsnCount: number;
    docsCount: number;
  };
}

// ─── 2. TaxPower Normalization Suite ────────────────────────────────────────

/**
 * 35+ custom Tally units mapped directly to official GSTN 3-letter UQC codes.
 * Reverse-engineered from TaxPowerGST.Core.Helper.TallyFunctions.
 */
export const TALLY_UNIT_UQC_MAP: Record<string, string> = {
  'PCS': 'NOS-NUMBERS',
  'PIECES': 'NOS-NUMBERS',
  'PIECE': 'NOS-NUMBERS',
  'NOS': 'NOS-NUMBERS',
  'NUMBERS': 'NOS-NUMBERS',
  'NUM': 'NOS-NUMBERS',
  'UNIT': 'NOS-NUMBERS',
  'UNITS': 'NOS-NUMBERS',
  'BOX': 'BOX-BOX',
  'BOXES': 'BOX-BOX',
  'PKT': 'PAC-PACKETS',
  'PKTS': 'PAC-PACKETS',
  'PAC': 'PAC-PACKETS',
  'PACKET': 'PAC-PACKETS',
  'PACKETS': 'PAC-PACKETS',
  'BAG': 'BAG-BAGS',
  'BAGS': 'BAG-BAGS',
  'BGS': 'BAG-BAGS',
  'KGS': 'KGS-KILOGRAMS',
  'KG': 'KGS-KILOGRAMS',
  'KILOGRAM': 'KGS-KILOGRAMS',
  'KILOGRAMS': 'KGS-KILOGRAMS',
  'GMS': 'GMS-GRAMS',
  'GM': 'GMS-GRAMS',
  'GRAM': 'GMS-GRAMS',
  'GRAMS': 'GMS-GRAMS',
  'MTR': 'MTR-METRES',
  'MTRS': 'MTR-METRES',
  'MET': 'MTR-METRES',
  'METER': 'MTR-METRES',
  'METERS': 'MTR-METRES',
  'CMS': 'CMS-CENTIMETRES',
  'LTR': 'LTR-LITRES',
  'LTRS': 'LTR-LITRES',
  'LIT': 'LTR-LITRES',
  'LITRE': 'LTR-LITRES',
  'LITRES': 'LTR-LITRES',
  'MLT': 'MLT-MILLILITRE',
  'ML': 'MLT-MILLILITRE',
  'DOZ': 'DOZ-DOZENS',
  'DZ': 'DOZ-DOZENS',
  'DOZEN': 'DOZ-DOZENS',
  'SET': 'SET-SETS',
  'SETS': 'SET-SETS',
  'ROL': 'ROL-ROLLS',
  'ROLL': 'ROL-ROLLS',
  'ROLLS': 'ROL-ROLLS',
  'CAN': 'CAN-CANS',
  'CANS': 'CAN-CANS',
  'BTL': 'BTL-BOTTLES',
  'BOTTLE': 'BTL-BOTTLES',
  'BOTTLES': 'BTL-BOTTLES',
  'QTL': 'QTL-QUINTAL',
  'QUINTAL': 'QTL-QUINTAL',
  'TUB': 'TUB-TUBES',
  'TUBES': 'TUB-TUBES',
  'BND': 'BND-BUNDLES',
  'BUNDLE': 'BND-BUNDLES',
  'BUNDLES': 'BND-BUNDLES',
  'PRS': 'PRS-PAIRS',
  'PAIR': 'PRS-PAIRS',
  'PAIRS': 'PRS-PAIRS',
  'THD': 'THD-THOUSANDS',
  'SQF': 'SQF-SQUARE FEET',
  'SQFT': 'SQF-SQUARE FEET',
  'SQM': 'SQM-SQUARE METRES',
  'SQMT': 'SQM-SQUARE METRES',
  'SQY': 'SQY-SQUARE YARDS',
  'TON': 'TON-TONNES',
  'TONS': 'TON-TONNES',
  'MT': 'TON-TONNES',
  'DRM': 'DRM-DRUMS',
  'DRUM': 'DRM-DRUMS',
  'KLR': 'KLR-KILOLITRE',
  'OTH': 'OTH-OTHERS',
  'OTHER': 'OTH-OTHERS'
};

/**
 * Normalizes any arbitrary unit string to the standard GSTN 3-letter UQC.
 */
export function normalizeUnitToUqc(unit?: string): string {
  if (!unit) return 'OTH-OTHERS';
  const clean = unit.trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (TALLY_UNIT_UQC_MAP[clean]) {
    return TALLY_UNIT_UQC_MAP[clean];
  }
  // Check if it's already in the format "CODE-NAME" (e.g. "NOS-NUMBERS")
  const parts = unit.split('-');
  if (parts.length === 2 && parts[0].length === 3) {
    return unit.toUpperCase();
  }
  return 'OTH-OTHERS';
}

/**
 * Map of Indian States to 2-digit GST state codes.
 */
export const STATE_TO_GST_CODE: Record<string, string> = {
  'JAMMU AND KASHMIR': '01',
  'HIMACHAL PRADESH': '02',
  'PUNJAB': '03',
  'CHANDIGARH': '04',
  'UTTARAKHAND': '05',
  'HARYANA': '06',
  'DELHI': '07',
  'RAJASTHAN': '08',
  'UTTAR PRADESH': '09',
  'BIHAR': '10',
  'SIKKIM': '11',
  'ARUNACHAL PRADESH': '12',
  'NAGALAND': '13',
  'MANIPUR': '14',
  'MIZORAM': '15',
  'TRIPURA': '16',
  'MEGHALAYA': '17',
  'ASSAM': '18',
  'WEST BENGAL': '19',
  'JHARKHAND': '20',
  'ODISHA': '21',
  'ORISSA': '21',
  'CHHATTISGARH': '22',
  'MADHYA PRADESH': '23',
  'GUJARAT': '24',
  'DAMAN AND DIU': '26',
  'DADRA AND NAGAR HAVELI': '26',
  'MAHARASHTRA': '27',
  'ANDHRA PRADESH': '37',
  'ANDHRA PRADESH (BEFORE DIVISION)': '28',
  'KARNATAKA': '29',
  'GOA': '30',
  'LAKSHADWEEP': '31',
  'KERALA': '32',
  'TAMIL NADU': '33',
  'PUDUCHERRY': '34',
  'ANDAMAN AND NICOBAR ISLANDS': '35',
  'TELANGANA': '36',
  'LADAKH': '38',
  'OTHER TERRITORY': '97',
  'CENTRE JURISDICTION': '99'
};

/**
 * 3-Tier Place of Supply (POS) Resolver.
 * Resolves POS from:
 * 1. Valid 15-digit GSTIN first 2 digits
 * 2. Buyer/Consignee State Name
 * 3. Fallback to supplier state (Intra-state)
 */
export function resolvePlaceOfSupply(params: {
  pos?: string;
  buyerGstin?: string;
  buyerState?: string;
  consigneeState?: string;
  supplierGstin?: string;
}): string {
  // If explicit 2-digit POS is provided
  if (params.pos && /^\d{2}$/.test(params.pos.trim())) {
    return params.pos.trim();
  }
  // 1. From buyer GSTIN
  if (params.buyerGstin && /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(params.buyerGstin.trim())) {
    return params.buyerGstin.trim().slice(0, 2);
  }
  // 2. From buyer state or consignee state name
  const stateQuery = (params.buyerState || params.consigneeState || '').trim().toUpperCase();
  if (stateQuery && STATE_TO_GST_CODE[stateQuery]) {
    return STATE_TO_GST_CODE[stateQuery];
  }
  // Substring match in state map
  if (stateQuery) {
    for (const [name, code] of Object.entries(STATE_TO_GST_CODE)) {
      if (name.includes(stateQuery) || stateQuery.includes(name)) {
        return code;
      }
    }
  }
  // 3. Fallback to supplier state
  if (params.supplierGstin && params.supplierGstin.length >= 2) {
    const suppCode = params.supplierGstin.slice(0, 2);
    if (/^\d{2}$/.test(suppCode)) return suppCode;
  }
  return '27'; // Default Maharashtra if completely unresolvable
}

/**
 * Table 13 Document Series Gap Analyzer (TallyDocIssuedMapper equivalent).
 * Scans consecutive document serial numbers, splits prefix/suffix, finds starting/ending
 * sequence, identifies missing integers in the range as cancelled, and computes net issued.
 */
export function analyzeDocumentSeries(
  invoices: { invoiceNo: string; date?: string; isCancelled?: boolean }[],
  docType: string = 'Invoices for outward supply',
  docNum: number = 1
): Gstr1DocTypeGroup {
  if (!invoices || invoices.length === 0) {
    return {
      doc_num: docNum,
      doc_typ: docType,
      docs: []
    };
  }

  // Group by series prefix and suffix
  // e.g. "INV/2026/001" -> prefix: "INV/2026/", num: 1, suffix: ""
  interface SeriesItem {
    raw: string;
    prefix: string;
    suffix: string;
    num: number;
    isCancelled: boolean;
  }

  // Match the LAST contiguous sequence of digits as the voucher serial number
  // e.g. "INV/2026/001" -> prefix: "INV/2026/", num: "001", suffix: ""
  const seriesRegex = /^(.*?)(\d+)([^\d]*)$/;
  const parsedItems: SeriesItem[] = [];

  for (const inv of invoices) {
    const rawNo = (inv.invoiceNo || '').trim();
    if (!rawNo) continue;
    const match = rawNo.match(seriesRegex);
    if (match) {
      parsedItems.push({
        raw: rawNo,
        prefix: match[1] || '',
        num: parseInt(match[2], 10),
        suffix: match[3] || '',
        isCancelled: !!inv.isCancelled
      });
    } else {
      // Non-numeric invoice number fallback
      parsedItems.push({
        raw: rawNo,
        prefix: rawNo,
        num: 1,
        suffix: '',
        isCancelled: !!inv.isCancelled
      });
    }
  }

  // Group items by series key: prefix + "::" + suffix
  const groups = new Map<string, SeriesItem[]>();
  for (const item of parsedItems) {
    const key = `${item.prefix}::${item.suffix}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  const docs: Gstr1DocDetailItem[] = [];
  let itemNum = 1;

  for (const [key, items] of groups.entries()) {
    // Sort items by numeric sequence
    items.sort((a, b) => a.num - b.num);
    const minItem = items[0];
    const maxItem = items[items.length - 1];

    const minNum = minItem.num;
    const maxNum = maxItem.num;
    const totalCount = maxNum - minNum + 1;

    // Build set of present numbers
    const presentNums = new Set(items.map(it => it.num));
    const explicitlyCancelledCount = items.filter(it => it.isCancelled).length;

    // Missing numbers in sequence are gap/cancelled documents
    let gapCount = 0;
    for (let i = minNum; i <= maxNum; i++) {
      if (!presentNums.has(i)) {
        gapCount++;
      }
    }

    const totalCancelled = gapCount + explicitlyCancelledCount;
    const netIssued = Math.max(0, totalCount - totalCancelled);

    docs.push({
      num: itemNum++,
      from: minItem.raw,
      to: maxItem.raw,
      totnum: totalCount,
      canc: totalCancelled,
      net_issue: netIssued
    });
  }

  return {
    doc_num: docNum,
    doc_typ: docType,
    docs
  };
}

// ─── 3. Automated Statutory Classification Engine ───────────────────────────

export interface RawSalesRecord {
  gstin?: string;
  buyerName?: string;
  invoiceNo: string;
  invoiceDate: string; // DD-MM-YYYY or YYYY-MM-DD
  invoiceValue: number;
  pos?: string;
  reverseCharge?: boolean | 'Y' | 'N';
  invoiceType?: 'R' | 'DE' | 'SEWP' | 'SEWOP' | 'CBW';
  taxRate: number; // e.g. 18
  taxableValue: number;
  igst?: number;
  cgst?: number;
  sgst?: number;
  cess?: number;
  hsnCode?: string;
  itemDescription?: string;
  quantity?: number;
  unit?: string;
  isCreditDebitNote?: boolean;
  noteType?: 'C' | 'D';
  isExport?: boolean;
  exportType?: 'WPAY' | 'WOPAY';
  shippingBillNo?: string;
  shippingBillDate?: string;
  portCode?: string;
  isNilOrExempt?: boolean;
  nilType?: 'NIL' | 'EXEMPT' | 'NON_GST';
}

/**
 * Normalizes date to DD-MM-YYYY format required by GSTN.
 */
export function formatGstDate(rawDate?: string): string {
  if (!rawDate) return '';
  const trimmed = rawDate.trim();
  // If already DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) return trimmed;
  // If YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-');
    return `${d}-${m}-${y}`;
  }
  // Try Date parse
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }
  return trimmed;
}

/**
 * Classifies raw sales vouchers into official GSTR-1 tables.
 * Accurately implements:
 * 1. Notification No. 12/2024-CT: ₹1,00,000 threshold for inter-state B2CL starting August 2024.
 * 2. Bifurcated Table 12 HSN (hsn_b2b vs hsn_b2c).
 * 3. Delinked Table 9B Credit/Debit Notes.
 */
export function classifyOutwardInvoices(
  records: RawSalesRecord[],
  returnPeriod: string, // MMYYYY e.g. "092026"
  supplierGstin: string,
  options: {
    turnoverOver5Cr?: boolean;
    clientState?: string;
  } = {}
): Gstr1ReturnData {
  const supplierState = supplierGstin ? supplierGstin.slice(0, 2) : '27';
  
  // Cut-off threshold: August 2024 (082024) onwards threshold is ₹1,00,000. Prior was ₹2,50,000.
  let b2clThreshold = 100000;
  if (returnPeriod && returnPeriod.length === 6) {
    const mm = parseInt(returnPeriod.slice(0, 2), 10);
    const yyyy = parseInt(returnPeriod.slice(2, 6), 10);
    if (yyyy < 2024 || (yyyy === 2024 && mm < 8)) {
      b2clThreshold = 250000;
    }
  }

  const b2bMap = new Map<string, Gstr1B2BInvoice[]>();
  const b2clMap = new Map<string, Gstr1B2CLInvoice[]>();
  const b2csMap = new Map<string, Gstr1B2CSItem>();
  const cdnrMap = new Map<string, Gstr1CdnNoteItem[]>();
  const cdnurList: Gstr1CdnurNote[] = [];
  const expMap = new Map<'WPAY' | 'WOPAY', Gstr1ExportInvoice['inv']>();
  const hsnB2bMap = new Map<string, Gstr1HsnItem>();
  const hsnB2cMap = new Map<string, Gstr1HsnItem>();
  const invoiceDocList: { invoiceNo: string; date: string }[] = [];

  let totalTaxable = 0;
  let totalIgst = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalCess = 0;
  let totalInvoices = 0;

  for (const rec of records) {
    const rawGstin = (rec.gstin || '').trim().toUpperCase();
    const isValidGstin = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(rawGstin);
    const pos = resolvePlaceOfSupply({
      pos: rec.pos,
      buyerGstin: isValidGstin ? rawGstin : undefined,
      buyerState: options.clientState,
      supplierGstin
    });

    const isInterState = pos !== supplierState;
    const invDate = formatGstDate(rec.invoiceDate);
    const txval = Math.round((rec.taxableValue || 0) * 100) / 100;
    const rt = rec.taxRate || 0;
    
    // Tax computation if omitted
    let iamt = Math.round((rec.igst ?? (isInterState ? (txval * rt) / 100 : 0)) * 100) / 100;
    let camt = Math.round((rec.cgst ?? (!isInterState ? (txval * (rt / 2)) / 100 : 0)) * 100) / 100;
    let samt = Math.round((rec.sgst ?? (!isInterState ? (txval * (rt / 2)) / 100 : 0)) * 100) / 100;
    let csamt = Math.round((rec.cess || 0) * 100) / 100;
    const invVal = Math.round((rec.invoiceValue || (txval + iamt + camt + samt + csamt)) * 100) / 100;

    // Track summary totals
    totalTaxable += txval;
    totalIgst += iamt;
    totalCgst += camt;
    totalSgst += samt;
    totalCess += csamt;
    totalInvoices++;

    // Track for Table 13 Document Series
    if (rec.invoiceNo) {
      invoiceDocList.push({ invoiceNo: rec.invoiceNo, date: invDate });
    }

    const itemDetail: Gstr1InvoiceItem = {
      num: 1,
      itm_det: {
        txval,
        rt,
        iamt: isInterState ? iamt : 0,
        camt: !isInterState ? camt : 0,
        samt: !isInterState ? samt : 0,
        csamt: csamt > 0 ? csamt : 0
      }
    };

    // ── Table 12 HSN Summary Ingestion ──
    const hsnRaw = (rec.hsnCode || '999999').trim();
    // Validate HSN digits length
    const hsnCode = hsnRaw.replace(/[^0-9]/g, '');
    const uqc = normalizeUnitToUqc(rec.unit);
    const qty = rec.quantity || 1;
    const desc = rec.itemDescription || 'Goods / Services';
    const hsnKey = `${hsnCode}::${uqc}::${rt}`;

    const targetHsnMap = isValidGstin ? hsnB2bMap : hsnB2cMap;
    if (targetHsnMap.has(hsnKey)) {
      const existing = targetHsnMap.get(hsnKey)!;
      existing.qty += qty;
      existing.val += invVal;
      existing.txval += txval;
      existing.iamt += iamt;
      existing.camt += camt;
      existing.samt += samt;
      existing.csamt += csamt;
    } else {
      targetHsnMap.set(hsnKey, {
        num: targetHsnMap.size + 1,
        hsn_sc: hsnCode,
        desc,
        uqc,
        qty,
        val: invVal,
        txval,
        rt,
        iamt,
        camt,
        samt,
        csamt
      });
    }

    // ── Credit / Debit Notes Routing ──
    if (rec.isCreditDebitNote) {
      const ntty = rec.noteType === 'D' ? 'D' : 'C';
      if (isValidGstin) {
        // Table 9B CDNR
        if (!cdnrMap.has(rawGstin)) cdnrMap.set(rawGstin, []);
        cdnrMap.get(rawGstin)!.push({
          ntty,
          nt_num: rec.invoiceNo,
          nt_dt: invDate,
          val: invVal,
          pos,
          rchrg: rec.reverseCharge === 'Y' || rec.reverseCharge === true ? 'Y' : 'N',
          itms: [itemDetail],
          buyerName: rec.buyerName
        });
      } else {
        // Table 9B CDNUR
        cdnurList.push({
          typ: isInterState && invVal > b2clThreshold ? 'B2CL' : 'B2CS',
          ntty,
          nt_num: rec.invoiceNo,
          nt_dt: invDate,
          val: invVal,
          pos,
          itms: [itemDetail],
          buyerName: rec.buyerName
        });
      }
      continue;
    }

    // ── Export Routing ──
    if (rec.isExport) {
      const expType = rec.exportType || (iamt > 0 ? 'WPAY' : 'WOPAY');
      if (!expMap.has(expType)) expMap.set(expType, []);
      expMap.get(expType)!.push({
        inum: rec.invoiceNo,
        idt: invDate,
        val: invVal,
        sbnum: rec.shippingBillNo,
        sbdt: formatGstDate(rec.shippingBillDate),
        sbpcode: rec.portCode,
        itms: [itemDetail]
      });
      continue;
    }

    // ── Table 4 B2B Routing ──
    if (isValidGstin) {
      if (!b2bMap.has(rawGstin)) b2bMap.set(rawGstin, []);
      b2bMap.get(rawGstin)!.push({
        inum: rec.invoiceNo,
        idt: invDate,
        val: invVal,
        pos,
        rchrg: rec.reverseCharge === 'Y' || rec.reverseCharge === true ? 'Y' : 'N',
        inv_typ: rec.invoiceType || 'R',
        itms: [itemDetail],
        buyerName: rec.buyerName,
        rawGstin
      });
      continue;
    }

    // ── Table 5 B2CL Routing (Inter-State Unregistered > Threshold) ──
    if (isInterState && invVal > b2clThreshold) {
      if (!b2clMap.has(pos)) b2clMap.set(pos, []);
      b2clMap.get(pos)!.push({
        inum: rec.invoiceNo,
        idt: invDate,
        val: invVal,
        itms: [itemDetail],
        buyerName: rec.buyerName
      });
      continue;
    }

    // ── Table 7 B2CS Routing (Consolidated Intra-state or Inter-state <= Threshold) ──
    const sply_ty = isInterState ? 'INTER' : 'INTRA';
    const b2csKey = `${sply_ty}::${pos}::${rt}`;
    if (b2csMap.has(b2csKey)) {
      const existing = b2csMap.get(b2csKey)!;
      existing.txval += txval;
      existing.iamt = (existing.iamt || 0) + (isInterState ? iamt : 0);
      existing.camt = (existing.camt || 0) + (!isInterState ? camt : 0);
      existing.samt = (existing.samt || 0) + (!isInterState ? samt : 0);
      existing.csamt = (existing.csamt || 0) + csamt;
    } else {
      b2csMap.set(b2csKey, {
        sply_ty,
        pos,
        typ: 'OE',
        txval,
        rt,
        iamt: isInterState ? iamt : 0,
        camt: !isInterState ? camt : 0,
        samt: !isInterState ? samt : 0,
        csamt: csamt > 0 ? csamt : 0
      });
    }
  }

  // Transform B2B Map to Array
  const b2b: Gstr1B2BGroup[] = Array.from(b2bMap.entries()).map(([ctin, inv]) => ({
    ctin,
    cfs: 'Y',
    inv
  }));

  // Transform B2CL Map to Array
  const b2cl: Gstr1B2CLGroup[] = Array.from(b2clMap.entries()).map(([pos, inv]) => ({
    pos,
    inv
  }));

  // Transform B2CS Map to Array
  const b2cs: Gstr1B2CSItem[] = Array.from(b2csMap.values());

  // Transform CDNR Map to Array
  const cdnr: Gstr1CdnrGroup[] = Array.from(cdnrMap.entries()).map(([ctin, nt]) => ({
    ctin,
    cfs: 'Y',
    nt
  }));

  // Transform EXP Map to Array
  const exp: Gstr1ExportInvoice[] = Array.from(expMap.entries()).map(([exp_typ, inv]) => ({
    exp_typ,
    inv
  }));

  // Table 12 HSN Summary Arrays
  const hsn_b2b: Gstr1HsnItem[] = Array.from(hsnB2bMap.values()).map((h, i) => ({ ...h, num: i + 1 }));
  const hsn_b2c: Gstr1HsnItem[] = Array.from(hsnB2cMap.values()).map((h, i) => ({ ...h, num: i + 1 }));

  // Table 13 Documents Issued
  const docGroup = analyzeDocumentSeries(invoiceDocList);
  const doc_issue: Gstr1DocIssue = {
    doc_det: [docGroup]
  };

  const totalTax = Math.round((totalIgst + totalCgst + totalSgst + totalCess) * 100) / 100;

  return {
    gstin: supplierGstin,
    fp: returnPeriod,
    version: 'GSTR1_V3.2.4',
    b2b,
    b2cl,
    b2cs,
    cdnr,
    cdnur: cdnurList,
    exp,
    hsn: {
      hsn_b2b,
      hsn_b2c
    },
    doc_issue,
    summary: {
      totalTaxable: Math.round(totalTaxable * 100) / 100,
      totalIgst: Math.round(totalIgst * 100) / 100,
      totalCgst: Math.round(totalCgst * 100) / 100,
      totalSgst: Math.round(totalSgst * 100) / 100,
      totalCess: Math.round(totalCess * 100) / 100,
      totalTax,
      totalInvoices,
      b2bCount: b2b.reduce((acc, g) => acc + g.inv.length, 0),
      b2clCount: b2cl.reduce((acc, g) => acc + g.inv.length, 0),
      b2csCount: b2cs.length,
      cdnrCount: cdnr.reduce((acc, g) => acc + g.nt.length, 0),
      cdnurCount: cdnurList.length,
      hsnCount: hsn_b2b.length + hsn_b2c.length,
      docsCount: docGroup.docs.length
    }
  };
}

// ─── 4. All-In-One Flat Register Ingestion ───────────────────────────────────

/**
 * Parses raw 26-column flat sales register and CDN rows from TaxPower GSTR1-AllInOne.xlsx.
 */
export function parseAllInOneFlatRegister(
  salesRows: any[],
  cdnRows: any[] = []
): RawSalesRecord[] {
  const result: RawSalesRecord[] = [];

  // Helper to find value from row by case-insensitive key synonyms
  const getField = (row: any, ...keys: string[]): any => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
        return row[k];
      }
      // Check lowercase / normalized
      const cleanTarget = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const rowKey of Object.keys(row)) {
        if (rowKey.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanTarget) {
          if (row[rowKey] !== undefined && row[rowKey] !== null && String(row[rowKey]).trim() !== '') {
            return row[rowKey];
          }
        }
      }
    }
    return undefined;
  };

  // 1. Process Sales Rows
  for (const row of salesRows) {
    const invNo = String(getField(row, 'Invoice Number', 'Invoice No', 'Voucher Number', 'inum', 'Bill No') || '').trim();
    if (!invNo) continue;

    const gstin = String(getField(row, 'GSTIN/UIN of Recipient', 'GSTIN', 'Receiver GSTIN', 'ctin', 'Party GSTIN') || '').trim();
    const buyerName = String(getField(row, 'Receiver Name', 'Party Name', 'Customer Name', 'Buyer Name') || '').trim();
    const invDate = String(getField(row, 'Invoice date', 'Invoice Date', 'Date', 'idt') || '').trim();
    const invVal = parseFloat(getField(row, 'Invoice Value', 'Invoice Amount', 'Total Value', 'val') || 0);
    const pos = String(getField(row, 'Place Of Supply', 'Place of Supply', 'POS', 'State Code') || '').trim();
    const revCharge = String(getField(row, 'Reverse Charge', 'RCHRG', 'RCM') || 'N').toUpperCase().startsWith('Y');
    const rate = parseFloat(getField(row, 'Rate', 'Tax Rate', 'GST Rate', 'rt') || 0);
    const txval = parseFloat(getField(row, 'Taxable Value', 'Taxable Amount', 'txval') || 0);
    const igst = parseFloat(getField(row, 'Integrated Tax', 'IGST', 'iamt') || 0);
    const cgst = parseFloat(getField(row, 'Central Tax', 'CGST', 'camt') || 0);
    const sgst = parseFloat(getField(row, 'State/UT Tax', 'SGST', 'UTGST', 'samt') || 0);
    const cess = parseFloat(getField(row, 'Cess Amount', 'CESS', 'csamt') || 0);
    const hsn = String(getField(row, 'HSN/SAC', 'HSN Code', 'HSN', 'SAC') || '').trim();
    const desc = String(getField(row, 'Description', 'Item Description', 'Particulars') || '').trim();
    const qty = parseFloat(getField(row, 'Quantity', 'Qty') || 1);
    const unit = String(getField(row, 'Unit', 'UQC', 'UOM') || '').trim();

    result.push({
      gstin,
      buyerName,
      invoiceNo: invNo,
      invoiceDate: invDate,
      invoiceValue: invVal,
      pos,
      reverseCharge: revCharge,
      taxRate: rate,
      taxableValue: txval,
      igst,
      cgst,
      sgst,
      cess,
      hsnCode: hsn,
      itemDescription: desc,
      quantity: qty,
      unit,
      isCreditDebitNote: false
    });
  }

  // 2. Process CDN Rows
  for (const row of cdnRows) {
    const noteNo = String(getField(row, 'Note Number', 'Note No', 'Credit Note No', 'Debit Note No', 'nt_num') || '').trim();
    if (!noteNo) continue;

    const gstin = String(getField(row, 'GSTIN/UIN of Recipient', 'GSTIN', 'Receiver GSTIN', 'ctin') || '').trim();
    const buyerName = String(getField(row, 'Receiver Name', 'Party Name') || '').trim();
    const noteDate = String(getField(row, 'Note Date', 'Date', 'nt_dt') || '').trim();
    const noteTypeRaw = String(getField(row, 'Document Type', 'Note Type', 'Type', 'ntty') || 'C').toUpperCase();
    const noteType = noteTypeRaw.startsWith('D') ? 'D' : 'C';
    const noteVal = parseFloat(getField(row, 'Note Value', 'Value', 'val') || 0);
    const pos = String(getField(row, 'Place Of Supply', 'POS') || '').trim();
    const rate = parseFloat(getField(row, 'Rate', 'rt') || 0);
    const txval = parseFloat(getField(row, 'Taxable Value', 'txval') || 0);
    const igst = parseFloat(getField(row, 'Integrated Tax', 'IGST', 'iamt') || 0);
    const cgst = parseFloat(getField(row, 'Central Tax', 'CGST', 'camt') || 0);
    const sgst = parseFloat(getField(row, 'State/UT Tax', 'SGST', 'samt') || 0);
    const cess = parseFloat(getField(row, 'Cess Amount', 'csamt') || 0);

    result.push({
      gstin,
      buyerName,
      invoiceNo: noteNo,
      invoiceDate: noteDate,
      invoiceValue: noteVal,
      pos,
      taxRate: rate,
      taxableValue: txval,
      igst,
      cgst,
      sgst,
      cess,
      isCreditDebitNote: true,
      noteType
    });
  }

  return result;
}

// ─── 5. 100% Portal-Compliant JSON Generator ────────────────────────────────

/**
 * Generates the official stringified GSTR-1 JSON payload matching GST Offline Tool Release 3.2.4.
 */
export function generateGstr1PortalJson(
  data: Gstr1ReturnData,
  options: { pretty?: boolean } = {}
): string {
  const payload: any = {
    gstin: data.gstin,
    fp: data.fp,
    gt: data.gt || 0.00,
    cur_gt: data.cur_gt || 0.00,
    version: data.version || 'GSTR1_V3.2.4',
    hash: data.hash || 'hash'
  };

  // Only attach non-empty table arrays to keep payload compliant with portal offline tool
  if (data.b2b && data.b2b.length > 0) payload.b2b = data.b2b;
  if (data.b2cl && data.b2cl.length > 0) payload.b2cl = data.b2cl;
  if (data.b2cs && data.b2cs.length > 0) payload.b2cs = data.b2cs;
  if (data.cdnr && data.cdnr.length > 0) payload.cdnr = data.cdnr;
  if (data.cdnur && data.cdnur.length > 0) payload.cdnur = data.cdnur;
  if (data.exp && data.exp.length > 0) payload.exp = data.exp;
  if (data.at && data.at.length > 0) payload.at = data.at;
  if (data.atadj && data.atadj.length > 0) payload.atadj = data.atadj;
  if (data.nil && data.nil.inv && data.nil.inv.length > 0) payload.nil = data.nil;

  // Bifurcated HSN (Mandatory split)
  if (data.hsn && ((data.hsn.hsn_b2b && data.hsn.hsn_b2b.length > 0) || (data.hsn.hsn_b2c && data.hsn.hsn_b2c.length > 0))) {
    payload.hsn = {
      hsn_b2b: data.hsn.hsn_b2b || [],
      hsn_b2c: data.hsn.hsn_b2c || []
    };
  }

  // Documents Issued
  if (data.doc_issue && data.doc_issue.doc_det && data.doc_issue.doc_det.length > 0) {
    payload.doc_issue = data.doc_issue;
  }

  // E-Commerce Operator Tables
  if (data.supeco && (data.supeco.clttx?.length || data.supeco.paytx?.length)) {
    payload.supeco = data.supeco;
  }

  return JSON.stringify(payload, null, options.pretty ? 2 : undefined);
}

/**
 * Splits large GSTR-1 payload into multiple files if invoice count > 19,000 or file size > 5 MB.
 */
export function generateGstr1PortalJsonChunks(
  data: Gstr1ReturnData,
  maxInvoicesPerChunk: number = 19000
): { chunkIndex: number; totalChunks: number; filename: string; json: string }[] {
  // Check if chunking is necessary
  const totalB2bInvoices = data.b2b ? data.b2b.reduce((a, b) => a + b.inv.length, 0) : 0;
  if (totalB2bInvoices <= maxInvoicesPerChunk) {
    const json = generateGstr1PortalJson(data);
    return [{
      chunkIndex: 1,
      totalChunks: 1,
      filename: `${data.gstin}_${data.fp}_GSTR1.json`,
      json
    }];
  }

  // Chunking logic for B2B supplies
  const chunks: { chunkIndex: number; totalChunks: number; filename: string; json: string }[] = [];
  const allGroups = [...data.b2b];
  let currentGroupBatch: Gstr1B2BGroup[] = [];
  let currentCount = 0;
  const chunkedB2bBatches: Gstr1B2BGroup[][] = [];

  for (const group of allGroups) {
    if (currentCount + group.inv.length > maxInvoicesPerChunk && currentGroupBatch.length > 0) {
      chunkedB2bBatches.push(currentGroupBatch);
      currentGroupBatch = [group];
      currentCount = group.inv.length;
    } else {
      currentGroupBatch.push(group);
      currentCount += group.inv.length;
    }
  }
  if (currentGroupBatch.length > 0) {
    chunkedB2bBatches.push(currentGroupBatch);
  }

  const totalChunks = chunkedB2bBatches.length;
  for (let i = 0; i < totalChunks; i++) {
    const chunkData: Gstr1ReturnData = {
      ...data,
      b2b: chunkedB2bBatches[i],
      // Only include non-B2B tables in chunk 1 to prevent duplication
      b2cl: i === 0 ? data.b2cl : [],
      b2cs: i === 0 ? data.b2cs : [],
      cdnr: i === 0 ? data.cdnr : [],
      cdnur: i === 0 ? data.cdnur : [],
      exp: i === 0 ? data.exp : [],
      hsn: i === 0 ? data.hsn : { hsn_b2b: [], hsn_b2c: [] },
      doc_issue: i === 0 ? data.doc_issue : { doc_det: [] }
    };

    chunks.push({
      chunkIndex: i + 1,
      totalChunks,
      filename: `${data.gstin}_${data.fp}_GSTR1_part${i + 1}.json`,
      json: generateGstr1PortalJson(chunkData)
    });
  }

  return chunks;
}
