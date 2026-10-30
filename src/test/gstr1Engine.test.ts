import { describe, it, expect } from 'vitest';
import {
  classifyOutwardInvoices,
  parseAllInOneFlatRegister,
  generateGstr1PortalJson,
  normalizeUnitToUqc,
  analyzeDocumentSeries,
  resolvePlaceOfSupply,
  RawSalesRecord
} from '../lib/gstr1Engine';

describe('GSTR-1 Canonical Engine & TaxPower Normalizer (Plan 25-01)', () => {
  it('normalizes arbitrary Tally units to official GSTN UQC codes', () => {
    expect(normalizeUnitToUqc('PCS')).toBe('NOS-NUMBERS');
    expect(normalizeUnitToUqc('pieces')).toBe('NOS-NUMBERS');
    expect(normalizeUnitToUqc('BOX')).toBe('BOX-BOX');
    expect(normalizeUnitToUqc('KGS')).toBe('KGS-KILOGRAMS');
    expect(normalizeUnitToUqc('kg')).toBe('KGS-KILOGRAMS');
    expect(normalizeUnitToUqc('MTR')).toBe('MTR-METRES');
    expect(normalizeUnitToUqc('meters')).toBe('MTR-METRES');
    expect(normalizeUnitToUqc('DOZ')).toBe('DOZ-DOZENS');
    expect(normalizeUnitToUqc('BAG')).toBe('BAG-BAGS');
    expect(normalizeUnitToUqc('SQM')).toBe('SQM-SQUARE METRES');
    expect(normalizeUnitToUqc('unknown-unit')).toBe('OTH-OTHERS');
  });

  it('resolves Place of Supply (POS) with 3-tier fallback', () => {
    // 1. From explicit POS
    expect(resolvePlaceOfSupply({ pos: '24' })).toBe('24');
    // 2. From Buyer GSTIN
    expect(resolvePlaceOfSupply({ buyerGstin: '27AAGCD4105L1ZO' })).toBe('27');
    // 3. From State name
    expect(resolvePlaceOfSupply({ buyerState: 'Gujarat' })).toBe('24');
    expect(resolvePlaceOfSupply({ buyerState: 'Maharashtra' })).toBe('27');
    // 4. Fallback to supplier state
    expect(resolvePlaceOfSupply({ supplierGstin: '09AAACA1234A1Z5' })).toBe('09');
  });

  it('analyzes Table 13 document sequences and detects cancelled voucher gaps', () => {
    const vouchers = [
      { invoiceNo: 'INV/2026/001' },
      { invoiceNo: 'INV/2026/002' },
      { invoiceNo: 'INV/2026/003' },
      // Notice 004 and 005 are missing (cancelled in Tally/Books)
      { invoiceNo: 'INV/2026/006' },
      { invoiceNo: 'INV/2026/007' }
    ];

    const result = analyzeDocumentSeries(vouchers);
    expect(result.docs).toHaveLength(1);
    const doc = result.docs[0];
    expect(doc.from).toBe('INV/2026/001');
    expect(doc.to).toBe('INV/2026/007');
    expect(doc.totnum).toBe(7); // 1 to 7 = 7
    expect(doc.canc).toBe(2);   // 4 and 5 missing
    expect(doc.net_issue).toBe(5); // 7 - 2 = 5
  });

  it('correctly applies the August 2024 ₹1,00,000 B2CL threshold', () => {
    const rawInvoices: RawSalesRecord[] = [
      // Inter-state unregistered invoice of ₹1,50,000
      {
        invoiceNo: 'INV-001',
        invoiceDate: '15-09-2024',
        invoiceValue: 150000,
        pos: '24', // Gujarat (Supplier is 27 MH)
        taxRate: 18,
        taxableValue: 127118.64
      },
      // Inter-state unregistered invoice of ₹80,000 (below ₹1L)
      {
        invoiceNo: 'INV-002',
        invoiceDate: '16-09-2024',
        invoiceValue: 80000,
        pos: '24',
        taxRate: 18,
        taxableValue: 67796.61
      }
    ];

    // September 2024 (post-August 2024) -> threshold is ₹1,00,000
    const resPostAug = classifyOutwardInvoices(rawInvoices, '092024', '27AAGCD4105L1ZO');
    expect(resPostAug.b2cl).toHaveLength(1);
    expect(resPostAug.b2cl[0].inv[0].inum).toBe('INV-001');
    expect(resPostAug.b2cs).toHaveLength(1);
    expect(resPostAug.b2cs[0].txval).toBe(67796.61);

    // Pre-August 2024 (e.g. July 2024 "072024") -> threshold was ₹2,50,000
    const resPreAug = classifyOutwardInvoices(rawInvoices, '072024', '27AAGCD4105L1ZO');
    // Both ₹1.5L and ₹80K were below ₹2.5L, so both went to B2CS
    expect(resPreAug.b2cl).toHaveLength(0);
    expect(resPreAug.b2cs).toHaveLength(1);
    expect(resPreAug.b2cs[0].txval).toBe(Math.round((127118.64 + 67796.61) * 100) / 100);
  });

  it('bifurcates Table 12 HSN into hsn_b2b and hsn_b2c', () => {
    const rawInvoices: RawSalesRecord[] = [
      // Registered customer sale
      {
        gstin: '24AAGCD4105L1ZO',
        invoiceNo: 'INV-001',
        invoiceDate: '10-09-2026',
        invoiceValue: 118000,
        pos: '24',
        taxRate: 18,
        taxableValue: 100000,
        hsnCode: '847130',
        unit: 'PCS',
        quantity: 2
      },
      // Unregistered customer sale
      {
        invoiceNo: 'INV-002',
        invoiceDate: '12-09-2026',
        invoiceValue: 59000,
        pos: '27',
        taxRate: 18,
        taxableValue: 50000,
        hsnCode: '847130',
        unit: 'PCS',
        quantity: 1
      }
    ];

    const res = classifyOutwardInvoices(rawInvoices, '092026', '27AAGCD4105L1ZO');
    expect(res.hsn.hsn_b2b).toHaveLength(1);
    expect(res.hsn.hsn_b2b[0].hsn_sc).toBe('847130');
    expect(res.hsn.hsn_b2b[0].uqc).toBe('NOS-NUMBERS');
    expect(res.hsn.hsn_b2b[0].qty).toBe(2);

    expect(res.hsn.hsn_b2c).toHaveLength(1);
    expect(res.hsn.hsn_b2c[0].hsn_sc).toBe('847130');
    expect(res.hsn.hsn_b2c[0].qty).toBe(1);
  });

  it('parses All-In-One flat register (TaxPower format) and generates official JSON', () => {
    const salesRows = [
      {
        'Invoice Number': 'INV/26/101',
        'Invoice Date': '05-09-2026',
        'GSTIN/UIN of Recipient': '27AAGCD4105L1ZO',
        'Receiver Name': 'Alpha Traders',
        'Invoice Value': 118000,
        'Place Of Supply': '27',
        'Rate': 18,
        'Taxable Value': 100000,
        'Central Tax': 9000,
        'State/UT Tax': 9000,
        'HSN/SAC': '8471',
        'Quantity': 5,
        'Unit': 'NOS'
      }
    ];

    const cdnRows = [
      {
        'Note Number': 'CRN/26/01',
        'Note Date': '08-09-2026',
        'GSTIN/UIN of Recipient': '27AAGCD4105L1ZO',
        'Note Value': 11800,
        'Document Type': 'Credit',
        'Place Of Supply': '27',
        'Rate': 18,
        'Taxable Value': 10000,
        'Central Tax': 900,
        'State/UT Tax': 900
      }
    ];

    const records = parseAllInOneFlatRegister(salesRows, cdnRows);
    expect(records).toHaveLength(2);

    const returnData = classifyOutwardInvoices(records, '092026', '27AAGCD4105L1ZO');
    expect(returnData.b2b).toHaveLength(1);
    expect(returnData.cdnr).toHaveLength(1);
    expect(returnData.summary?.totalTaxable).toBe(110000);

    const jsonString = generateGstr1PortalJson(returnData);
    const parsed = JSON.parse(jsonString);
    expect(parsed.gstin).toBe('27AAGCD4105L1ZO');
    expect(parsed.fp).toBe('092026');
    expect(parsed.version).toBe('GSTR1_V3.2.4');
    expect(parsed.b2b).toBeDefined();
    expect(parsed.cdnr).toBeDefined();
    expect(parsed.hsn.hsn_b2b).toBeDefined();
    expect(parsed.doc_issue.doc_det).toBeDefined();
  });
});
