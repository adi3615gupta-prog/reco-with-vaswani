/**
 * gstr2bTallyEngine.ts — Suite 09: GSTR-2B Inward Supplies to TallyPrime Transformation Engine.
 * 
 * Converts downloaded GSTR-2B invoices (B2B, B2BA, CDNR, CDNRA) into audit-ready,
 * mathematically balanced Tally MultiEntryVoucher and MasterLedger structures.
 * 
 * Rules:
 * 1. B2B / B2BA: Purchase Voucher. Party Cr (+Total), Purchase Dr (-Taxable), Input Taxes Dr (-Tax).
 * 2. CDNR / CDNRA: Debit Note Voucher. Party Dr (-Total), Purchase Return Cr (+Taxable), Input Tax Reversal Cr (+Tax).
 * 3. Rate-Wise Auto-Ledgers: Purchase @ 18%, Purchase @ 12%, Purchase @ 5%, Purchase @ 28%, Purchase Exempted.
 * 4. Automatic Round-Off balancing for fractional paise discrepancies.
 * 5. Sequential internal Voucher Numbers (e.g. PUR-0001), with Supplier Bill No in Reference.
 * 6. Educational Mode Compatibility: Optional date snapping to 1st of month to allow test ingestion.
 */

import { MultiEntryVoucher, MasterLedger, cleanNumericAmount } from './tallyXmlEngine';

export interface Gstr2bInvoiceRow {
  id?: string;
  client_gstin?: string;
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
  cess?: number;
  total_val: number;
  filing_date?: string;
  source_period?: string;
}

export interface Convert2bOptions {
  voucherPrefix?: string;
  startingVoucherNumber?: number;
  useExactInvoiceDate?: boolean;
  bulkDate?: string;
  snapToEduDates?: boolean; // Snaps to 1st of month for Tally Educational Mode
  financialYear?: string; // e.g. "2026-27"
  snapPriorFyDates?: boolean; // Whether to snap prior FY invoice dates to 01-Apr (default: true)
  defaultPurchaseLedgerPrefix?: string; // e.g. "Purchase @"
  inputCgstLedger?: string;
  inputSgstLedger?: string;
  inputIgstLedger?: string;
  inputCessLedger?: string;
  roundOffLedger?: string;
  narrationTemplate?: string;
}

export interface Convert2bStats {
  totalProcessed: number;
  purchaseCount: number;
  debitNoteCount: number;
  totalTaxable: number;
  totalTax: number;
  totalAmount: number;
  uniqueSuppliers: number;
}

export interface Convert2bResult {
  vouchers: MultiEntryVoucher[];
  masters: MasterLedger[];
  stats: Convert2bStats;
}

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const STATE_CODE_MAP: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
  '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
  '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '28': 'Andhra Pradesh',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
  '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};

/**
 * Derive effective GST tax percentage from amounts
 */
export function deriveGstRate(txval: number, igst: number, cgst: number, sgst: number): number {
  const taxable = Math.abs(cleanNumericAmount(txval));
  if (taxable <= 0.005) return 0;

  const totalTax = Math.abs(cleanNumericAmount(igst)) + Math.abs(cleanNumericAmount(cgst)) + Math.abs(cleanNumericAmount(sgst));
  if (totalTax <= 0.005) return 0;

  const rawPercent = (totalTax / taxable) * 100;

  // Snap to canonical Indian GST rates: 0, 0.1, 0.25, 1.5, 3, 5, 6, 12, 18, 28
  const standardRates = [0, 0.1, 0.25, 1.5, 3, 5, 6, 12, 18, 28];
  let closest = standardRates[0];
  let minDiff = Math.abs(rawPercent - closest);

  for (const r of standardRates) {
    const diff = Math.abs(rawPercent - r);
    if (diff < minDiff) {
      minDiff = diff;
      closest = r;
    }
  }

  return closest;
}

/**
 * Generate rate-wise purchase ledger name
 */
export function derivePurchaseLedgerName(rate: number, prefix: string = 'Purchase @'): string {
  if (rate <= 0) {
    return 'Purchase Exempted';
  }
  return `${prefix} ${rate}%`;
}

/**
 * Format date to Tally YYYYMMDD string, with optional snapToFirstDay for Educational Mode
 */
export function formatToTallyDate(rawDate: string, snapToFirstDay = false): string {
  if (!rawDate) {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }

  const clean = String(rawDate).trim();
  let y = '';
  let m = '';
  let d = '';

  // 1. If already YYYYMMDD
  if (/^\d{8}$/.test(clean)) {
    y = clean.slice(0, 4);
    m = clean.slice(4, 6);
    d = snapToFirstDay ? '01' : clean.slice(6, 8);
    return `${y}${m}${d}`;
  }

  // 2. DD-MM-YYYY or DD/MM/YYYY
  const dmy = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    d = snapToFirstDay ? '01' : dmy[1].padStart(2, '0');
    m = dmy[2].padStart(2, '0');
    y = dmy[3];
    return `${y}${m}${d}`;
  }

  // 3. DD-MMM-YYYY or DD-MMM-YY (e.g. 15-Apr-2026 or 15-Apr-26)
  const dMmmY = clean.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,9})[-/\s](\d{2,4})$/);
  if (dMmmY) {
    d = snapToFirstDay ? '01' : dMmmY[1].padStart(2, '0');
    const monthStr = dMmmY[2].slice(0, 3).toLowerCase();
    m = MONTH_MAP[monthStr] || '04';
    let yr = dMmmY[3];
    if (yr.length === 2) yr = `20${yr}`;
    y = yr;
    return `${y}${m}${d}`;
  }

  // 4. YYYY-MM-DD or YYYY/MM/DD
  const ymd = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymd) {
    y = ymd[1];
    m = ymd[2].padStart(2, '0');
    d = snapToFirstDay ? '01' : ymd[3].padStart(2, '0');
    return `${y}${m}${d}`;
  }

  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Check if an invoice bill date belongs to a prior Financial Year before 01-Apr of the given FY.
 */
export function isPriorFyInvoice(inv: { idt?: string }, financialYear?: string): boolean {
  if (!inv.idt || !financialYear) return false;
  const fyStartYear = parseInt(financialYear.slice(0, 4), 10);
  if (isNaN(fyStartYear)) return false;

  const clean = String(inv.idt).trim();
  let y = 0;
  let m = 0;

  const dmy = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) {
    m = parseInt(dmy[2], 10);
    y = parseInt(dmy[3], 10);
  } else {
    const ymd = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (ymd) {
      y = parseInt(ymd[1], 10);
      m = parseInt(ymd[2], 10);
    }
  }

  if (y > 0 && m > 0) {
    // In India, Financial Year starts on April 1 (Month 4).
    // Any date with year < fyStartYear, or same year with month < 4 (Jan, Feb, Mar) is prior FY.
    if (y < fyStartYear || (y === fyStartYear && m < 4)) {
      return true;
    }
  }
  return false;
}

/**
 * Convert GSTR-2B invoices to Tally Multi-Entry Vouchers and Supplier Master Ledgers
 */
export function convert2bInvoicesToTallyVouchers(
  invoices: Gstr2bInvoiceRow[],
  options?: Convert2bOptions
): Convert2bResult {
  const opt: Convert2bOptions = {
    voucherPrefix: 'PUR-',
    startingVoucherNumber: 1,
    useExactInvoiceDate: true,
    snapToEduDates: false,
    defaultPurchaseLedgerPrefix: 'Purchase @',
    inputCgstLedger: 'Input CGST',
    inputSgstLedger: 'Input SGST',
    inputIgstLedger: 'Input IGST',
    inputCessLedger: 'Input Cess',
    roundOffLedger: 'Round Off',
    ...options,
  };

  const vouchers: MultiEntryVoucher[] = [];
  const mastersMap = new Map<string, MasterLedger>();

  // 1. Register standard system purchase, tax, and round-off ledgers in masters
  const standardSystemLedgers: MasterLedger[] = [
    { id: 'm-sys-pur-18', ledgerName: 'Purchase @ 18%', parentGroup: 'Purchase Accounts', country: 'India', openingBalance: 0 },
    { id: 'm-sys-pur-12', ledgerName: 'Purchase @ 12%', parentGroup: 'Purchase Accounts', country: 'India', openingBalance: 0 },
    { id: 'm-sys-pur-5', ledgerName: 'Purchase @ 5%', parentGroup: 'Purchase Accounts', country: 'India', openingBalance: 0 },
    { id: 'm-sys-pur-28', ledgerName: 'Purchase @ 28%', parentGroup: 'Purchase Accounts', country: 'India', openingBalance: 0 },
    { id: 'm-sys-pur-ex', ledgerName: 'Purchase Exempted', parentGroup: 'Purchase Accounts', country: 'India', openingBalance: 0 },
    { id: 'm-sys-cgst', ledgerName: opt.inputCgstLedger || 'Input CGST', parentGroup: 'Duties & Taxes', country: 'India', openingBalance: 0 },
    { id: 'm-sys-sgst', ledgerName: opt.inputSgstLedger || 'Input SGST', parentGroup: 'Duties & Taxes', country: 'India', openingBalance: 0 },
    { id: 'm-sys-igst', ledgerName: opt.inputIgstLedger || 'Input IGST', parentGroup: 'Duties & Taxes', country: 'India', openingBalance: 0 },
    { id: 'm-sys-cess', ledgerName: opt.inputCessLedger || 'Input Cess', parentGroup: 'Duties & Taxes', country: 'India', openingBalance: 0 },
    { id: 'm-sys-ro', ledgerName: opt.roundOffLedger || 'Round Off', parentGroup: 'Indirect Expenses', country: 'India', openingBalance: 0 },
  ];

  standardSystemLedgers.forEach((m) => {
    mastersMap.set(m.ledgerName.toLowerCase().trim(), m);
  });

  let vchSeq = opt.startingVoucherNumber || 1;
  let purchaseCount = 0;
  let debitNoteCount = 0;
  let totalTaxable = 0;
  let totalTax = 0;
  let totalAmount = 0;
  let supplierCount = 0;

  for (const inv of invoices) {
    const ctin = String(inv.ctin || '').trim().toUpperCase();
    const inum = String(inv.inum || '').trim();
    if (!ctin || !inum) continue;

    const supplierName = (inv.supplier_name && inv.supplier_name.trim()) || ctin;
    const isCdnr = Boolean(
      (inv.section && inv.section.toUpperCase().includes('CDNR')) ||
      (inv.inv_typ && inv.inv_typ.toLowerCase().includes('credit'))
    );

    const txval = Math.round(cleanNumericAmount(inv.txval) * 100) / 100;
    const igst = Math.round(cleanNumericAmount(inv.igst) * 100) / 100;
    const cgst = Math.round(cleanNumericAmount(inv.cgst) * 100) / 100;
    const sgst = Math.round(cleanNumericAmount(inv.sgst) * 100) / 100;
    const cess = Math.round(cleanNumericAmount(inv.cess || 0) * 100) / 100;
    const totalVal = Math.round(cleanNumericAmount(inv.total_val || (txval + igst + cgst + sgst + cess)) * 100) / 100;

    const rate = deriveGstRate(txval, igst, cgst, sgst);
    const purchaseLedger = derivePurchaseLedgerName(rate, opt.defaultPurchaseLedgerPrefix);

    // Register rate-wise purchase ledger in Masters map
    const purKey = purchaseLedger.toLowerCase().trim();
    if (!mastersMap.has(purKey)) {
      mastersMap.set(purKey, {
        id: `m-pur-${rate}`,
        ledgerName: purchaseLedger,
        parentGroup: 'Purchase Accounts',
        country: 'India',
        openingBalance: 0,
      });
    }

    // Register supplier in Masters map
    const supKey = supplierName.toLowerCase().trim();
    if (!mastersMap.has(supKey)) {
      supplierCount++;
      const ctinState = ctin.length >= 2 ? STATE_CODE_MAP[ctin.substring(0, 2)] : '';
      const stateName = ctinState || STATE_CODE_MAP[inv.pos || ''] || inv.pos || '';

      mastersMap.set(supKey, {
        id: `m-sup-${ctin}`,
        ledgerName: supplierName,
        parentGroup: 'Sundry Creditors',
        gstin: ctin,
        state: stateName,
        country: 'India',
        openingBalance: 0,
      });
    }

    // Determine voucher date (with Educational Mode snap option)
    let vchDate = '';
    if (!opt.useExactInvoiceDate && opt.bulkDate) {
      vchDate = formatToTallyDate(opt.bulkDate, false);
    } else {
      vchDate = formatToTallyDate(inv.idt, Boolean(opt.snapToEduDates));
    }

    // Prior-period guard: If an invoice bill date belongs to a prior FY (e.g. March bill in April/May return),
    // snap its voucher date to the FY start (e.g. 01-Apr-2026) so Tally does not reject it as "Out of Range".
    // The authentic invoice date is safely preserved in referenceDate and narration.
    if (opt.financialYear && opt.snapPriorFyDates !== false) {
      const fyStartYear = parseInt(opt.financialYear.slice(0, 4), 10);
      if (!isNaN(fyStartYear)) {
        const minFyDate = `${fyStartYear}0401`;
        if (vchDate < minFyDate) {
          vchDate = minFyDate;
        }
      }
    }

    const vchNumber = `${opt.voucherPrefix || 'PUR-'}${String(vchSeq).padStart(4, '0')}`;
    vchSeq++;

    const refDateFormatted = inv.idt ? formatToTallyDate(inv.idt, false) : undefined;
    const narration = opt.narrationTemplate
      ? opt.narrationTemplate
          .replace('{inum}', inum)
          .replace('{idt}', inv.idt || '')
          .replace('{supplier}', supplierName)
      : `Being ${isCdnr ? 'Credit Note from supplier' : 'purchase of goods/services'} vide bill no ${inum} dt ${inv.idt || ''} from ${supplierName}`;

    if (!isCdnr) {
      // ─── PURCHASE VOUCHER ───
      purchaseCount++;
      const legs: { ledgerName: string; amount: number }[] = [];

      // Party Leg: Credit (Positive Amount)
      legs.push({ ledgerName: supplierName, amount: totalVal });

      // Purchase Leg: Debit (Negative Amount)
      legs.push({ ledgerName: purchaseLedger, amount: -txval });

      // Tax Legs: Debit (Negative Amount)
      if (igst > 0) legs.push({ ledgerName: opt.inputIgstLedger || 'Input IGST', amount: -igst });
      if (cgst > 0) legs.push({ ledgerName: opt.inputCgstLedger || 'Input CGST', amount: -cgst });
      if (sgst > 0) legs.push({ ledgerName: opt.inputSgstLedger || 'Input SGST', amount: -sgst });
      if (cess > 0) legs.push({ ledgerName: opt.inputCessLedger || 'Input Cess', amount: -cess });

      // Check sum for fractional paise round-off
      let currentSum = 0;
      legs.forEach(l => currentSum += l.amount);
      const roundedSum = Math.round(currentSum * 100) / 100;

      if (Math.abs(roundedSum) > 0.005) {
        legs.push({
          ledgerName: opt.roundOffLedger || 'Round Off',
          amount: -roundedSum, // balancing leg
        });
      }

      vouchers.push({
        id: `vch-2b-${inv.id || ctin + '-' + inum}`,
        voucherType: 'Purchase',
        voucherNumber: vchNumber,
        referenceNumber: inum,
        referenceDate: refDateFormatted,
        date: vchDate,
        narration,
        legs,
      });
    } else {
      // ─── DEBIT NOTE VOUCHER ───
      debitNoteCount++;
      const legs: { ledgerName: string; amount: number }[] = [];

      // Party Leg: Debit (Negative Amount)
      legs.push({ ledgerName: supplierName, amount: -totalVal });

      // Purchase Return Leg: Credit (Positive Amount)
      legs.push({ ledgerName: purchaseLedger, amount: txval });

      // Tax Legs Reversal: Credit (Positive Amount)
      if (igst > 0) legs.push({ ledgerName: opt.inputIgstLedger || 'Input IGST', amount: igst });
      if (cgst > 0) legs.push({ ledgerName: opt.inputCgstLedger || 'Input CGST', amount: cgst });
      if (sgst > 0) legs.push({ ledgerName: opt.inputSgstLedger || 'Input SGST', amount: sgst });
      if (cess > 0) legs.push({ ledgerName: opt.inputCessLedger || 'Input Cess', amount: cess });

      // Check sum for fractional paise round-off
      let currentSum = 0;
      legs.forEach(l => currentSum += l.amount);
      const roundedSum = Math.round(currentSum * 100) / 100;

      if (Math.abs(roundedSum) > 0.005) {
        legs.push({
          ledgerName: opt.roundOffLedger || 'Round Off',
          amount: -roundedSum,
        });
      }

      vouchers.push({
        id: `vch-2b-${inv.id || ctin + '-' + inum}`,
        voucherType: 'Debit Note',
        voucherNumber: `DN-${String(debitNoteCount).padStart(4, '0')}`,
        referenceNumber: inum,
        referenceDate: refDateFormatted,
        date: vchDate,
        narration,
        legs,
      });
    }

    totalTaxable += txval;
    totalTax += (igst + cgst + sgst + cess);
    totalAmount += totalVal;
  }

  return {
    vouchers,
    masters: Array.from(mastersMap.values()),
    stats: {
      totalProcessed: vouchers.length,
      purchaseCount,
      debitNoteCount,
      totalTaxable: Math.round(totalTaxable * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
      uniqueSuppliers: supplierCount,
    },
  };
}

/**
 * Parses Tally Import XML response into structured counts and error messages.
 */
export function parseTallyResponse(xmlResponse: string): {
  created: number;
  altered: number;
  errors: number;
  exceptions: number;
  lineErrors: string[];
  isEduDateBlocked: boolean;
  raw: string;
} {
  const createdMatch = xmlResponse.match(/<CREATED[^>]*>(\d+)<\/CREATED>/i);
  const alteredMatch = xmlResponse.match(/<ALTERED[^>]*>(\d+)<\/ALTERED>/i);
  const errorsMatch = xmlResponse.match(/<ERRORS[^>]*>(\d+)<\/ERRORS>/i);
  const exceptionsMatch = xmlResponse.match(/<EXCEPTIONS[^>]*>(\d+)<\/EXCEPTIONS>/i);

  const created = createdMatch ? parseInt(createdMatch[1], 10) : 0;
  const altered = alteredMatch ? parseInt(alteredMatch[1], 10) : 0;
  const errors = errorsMatch ? parseInt(errorsMatch[1], 10) : 0;
  const exceptions = exceptionsMatch ? parseInt(exceptionsMatch[1], 10) : 0;

  const lineErrors: string[] = [];
  const lineErrRegex = /<LINEERROR[^>]*>([\s\S]*?)<\/LINEERROR>/gi;
  let m: RegExpExecArray | null;
  while ((m = lineErrRegex.exec(xmlResponse)) !== null) {
    const errText = m[1].replace(/<[^>]+>/g, '').trim();
    if (errText && !lineErrors.includes(errText)) {
      lineErrors.push(errText);
    }
  }

  const isEduDateBlocked = lineErrors.some(
    (e) => /voucher date is missing/i.test(e) || /outside current period/i.test(e)
  );

  return { created, altered, errors, exceptions, lineErrors, isEduDateBlocked, raw: xmlResponse };
}
