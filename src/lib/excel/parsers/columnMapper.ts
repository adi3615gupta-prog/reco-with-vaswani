import type { ColumnMapping } from '../types';
import type { InvoiceRecord } from '../../reconciliation';
import { formatDateStr } from '../styles/formatters';

export const KNOWN_HEADERS: Record<keyof ColumnMapping, string[]> = {
  supplierName: ['party name', 'trade/legal name', 'supplier name', 'vendor name', 'name of supplier', 'supplier', 'trade name', 'legal name', 'receiver name', 'customer name', 'particulars', 'party', 'name of the party'],
  gstin: ['gstin', 'gstin of supplier', 'gstin/uin', 'supplier gstin', 'gstin no', 'gst no', 'gst no.', 'gstin no.', 'party gstin', 'supplier\'s gstin'],
  invoiceNo: ['invoice no', 'note no', 'invoice number', 'note number', 'inv no', 'bill no', 'document number', 'invoice no.', 'note no.', 'note num', 'vou.no.', 'vou no', 'voucher no.', 'voucher no', 'vchno', 'document no'],
  invoiceDate: ['date', 'invoice date', 'note date', 'inv date', 'bill date', 'document date', 'invoice dt', 'note dt', 'inv.date', 'voucher date', 'vou.date', 'vou date', 'period'],
  igst: ['igst', 'integrated tax', 'igst amount', 'igst amt', 'total igst', 'integrated tax(₹)', 'integrated tax amount'],
  cgst: ['cgst', 'central tax', 'cgst amount', 'cgst amt', 'total cgst', 'central tax(₹)', 'central tax amount'],
  sgst: ['sgst', 'state tax', 'sgst amount', 'sgst amt', 'utgst', 'total sgst', 'state/ut tax(₹)', 'state/ut tax', 'state tax amount'],
  taxableValue: ['taxable value', 'taxable amount', 'taxable val', 'assessable value', 'taxable', 'total purchase/taxable value', 'taxable value (₹)', 'taxable+nilrated', 'purchase+nilrated', 'taxable turnover'],
  nilRated: ['nil rated', 'nil rated value', 'exempted', 'exempted value', 'nil rated supplies'],
  nonTaxable: ['non taxable', 'non-taxable', 'non gst', 'non-gst', 'exempt', 'exempt supplies', 'exempted supplies', 'non gst outward', 'non-gst supplies', 'non gst supplies'],
  pos: ['pos', 'place of supply', 'state', 'state code', 'place of supply (pos)'],
  returnPeriod: ['month', 'period', 'return period', 'original period', 'return period (month)'],
  filingStatus: ['gstr-1 status', 'gstr1 status', 'filing status', 'return filing status'],
  filingDate: ['filing date', 'gstr-1 filing date', 'return filing date', 'date of filing'],
};

export function detectColumnMapping(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {};
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  for (const [field, aliases] of Object.entries(KNOWN_HEADERS) as [keyof ColumnMapping, string[]][]) {
    // Pass 1: Try exact match first
    let matched = false;
    for (const alias of aliases) {
      const idx = lowerHeaders.findIndex((h) => h === alias);
      if (idx !== -1) {
        mapping[field] = headers[idx];
        matched = true;
        break;
      }
    }
    // Pass 2: Try contains match if no exact match was found
    if (!matched) {
      for (const alias of aliases) {
        const idx = lowerHeaders.findIndex((h) => h.includes(alias));
        if (idx !== -1) {
          mapping[field] = headers[idx];
          break;
        }
      }
    }
  }
  return mapping;
}

export function mapToRecords(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
  source: 'PR' | '2B',
  sourceLabel?: string
): InvoiceRecord[] {
  const safeNum = (val: unknown): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const n = parseFloat(String(val).replace(/[₹,\s]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  return rows.map((row) => {
    const rawDate = (mapping.invoiceDate ? row[mapping.invoiceDate] : undefined) ||
      row['Invoice Date'] || row['Note Date'] || row['Document Date'] || row['Date'] || row['Inv.Date'] || row['Period'] || '';
    const formattedDate = formatDateStr(rawDate, row);

    const rawInvNo = (mapping.invoiceNo ? row[mapping.invoiceNo] : undefined) ||
      row['Invoice No'] || row['Invoice No.'] || row['Note No'] || row['Note No.'] || row['Note Number'] ||
      row['Invoice Number'] || row['Inv No'] || row['Bill No'] || row['Document Number'] || row['Vou.No.'] || row['Voucher No'] || '';

    const rawSupplier = (mapping.supplierName ? row[mapping.supplierName] : undefined) ||
      row['Trade/Legal name'] || row['Trade/Legal Name'] || row['Party Name'] || row['Supplier Name'] || row['Vendor Name'] || row['Particulars'] || '';

    const rawGstin = (mapping.gstin ? row[mapping.gstin] : undefined) ||
      row['GSTIN of supplier'] || row['GST No.'] || row['GSTIN'] || row['GST No'] || row['GSTIN/UIN'] || row['Supplier GSTIN'] || '';

    const rawCgst = mapping.cgst ? row[mapping.cgst] : (row['CGST'] ?? row['Total CGST'] ?? row['Central Tax'] ?? row['Central Tax(₹)']);
    const rawSgst = mapping.sgst ? row[mapping.sgst] : (row['SGST'] ?? row['Total SGST'] ?? row['State Tax'] ?? row['State/UT Tax'] ?? row['State/UT Tax(₹)']);
    const rawIgst = mapping.igst ? row[mapping.igst] : (row['IGST'] ?? row['Total IGST'] ?? row['Integrated Tax'] ?? row['Integrated Tax(₹)']);
    const rawTaxable = mapping.taxableValue ? row[mapping.taxableValue] : (row['Taxable Value'] ?? row['Total Purchase/Taxable Value'] ?? row['Taxable Value (₹)'] ?? row['Taxable Amount'] ?? row['Taxable']);

    const rec: InvoiceRecord = {
      supplierName: String(rawSupplier || ''),
      gstin: String(rawGstin || ''),
      invoiceNo: String(rawInvNo || ''),
      invoiceDate: formattedDate || String(rawDate || ''),
      igst: safeNum(rawIgst),
      cgst: safeNum(rawCgst),
      sgst: safeNum(rawSgst),
      source,
      ...(sourceLabel ? { sourceLabel } : {}),
    };
    if (rawTaxable !== undefined && rawTaxable !== '') rec.taxableValue = safeNum(rawTaxable);
    if (mapping.filingStatus) rec.filingStatus = String(row[mapping.filingStatus] || '');
    if (mapping.filingDate) rec.filingDate = String(row[mapping.filingDate] || '');
    (rec as any).raw = row;
    return rec;
  });
}
