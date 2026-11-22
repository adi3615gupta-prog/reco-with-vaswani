import { describe, it, expect } from 'vitest';
import {
  deriveGstRate,
  derivePurchaseLedgerName,
  convert2bInvoicesToTallyVouchers,
  Gstr2bInvoiceRow,
  parseTallyResponse,
  isPriorFyInvoice,
} from '../lib/gstr2bTallyEngine';
import { cleanNumericAmount } from '../lib/tallyXmlEngine';

describe('GSTR-2B to Tally Transformation Engine', () => {
  it('correctly derives canonical GST rates from amounts', () => {
    // 18% IGST
    expect(deriveGstRate(10000, 1800, 0, 0)).toBe(18);
    // 12% (6% CGST + 6% SGST)
    expect(deriveGstRate(5000, 0, 300, 300)).toBe(12);
    // 5% (2.5% + 2.5%)
    expect(deriveGstRate(2000, 0, 50, 50)).toBe(5);
    // 28% IGST
    expect(deriveGstRate(1000, 280, 0, 0)).toBe(28);
    // Exempt / 0%
    expect(deriveGstRate(1000, 0, 0, 0)).toBe(0);
  });

  it('generates rate-wise purchase ledger names', () => {
    expect(derivePurchaseLedgerName(18)).toBe('Purchase @ 18%');
    expect(derivePurchaseLedgerName(12)).toBe('Purchase @ 12%');
    expect(derivePurchaseLedgerName(5)).toBe('Purchase @ 5%');
    expect(derivePurchaseLedgerName(0)).toBe('Purchase Exempted');
  });

  it('transforms B2B invoice into mathematically balanced Tally Purchase Voucher', () => {
    const invoices: Gstr2bInvoiceRow[] = [
      {
        ctin: '27AABCU9603R1ZM',
        supplier_name: 'MAHARASHTRA TRADERS PVT LTD',
        inum: 'INV/24-25/088',
        idt: '15/04/2024',
        section: 'B2B',
        txval: 10000,
        igst: 0,
        cgst: 900,
        sgst: 900,
        total_val: 11800,
      },
    ];

    const result = convert2bInvoicesToTallyVouchers(invoices, {
      voucherPrefix: 'PUR-',
      startingVoucherNumber: 1,
    });

    expect(result.vouchers.length).toBe(1);
    const vch = result.vouchers[0];

    expect(vch.voucherType).toBe('Purchase');
    expect(vch.voucherNumber).toBe('PUR-0001');
    expect(vch.referenceNumber).toBe('INV/24-25/088');
    expect(vch.date).toBe('20240415');

    // Legs check
    // Credit Party = +11800
    // Debit Purchase = -10000
    // Debit CGST = -900
    // Debit SGST = -900
    let sum = 0;
    vch.legs.forEach((l) => (sum += cleanNumericAmount(l.amount)));
    expect(Math.abs(Math.round(sum * 100) / 100)).toBeLessThanOrEqual(0.005);

    // Master ledgers check (includes supplier master + standard system ledgers)
    const supplierMaster = result.masters.find((m) => m.ledgerName === 'MAHARASHTRA TRADERS PVT LTD');
    expect(supplierMaster).toBeDefined();
    expect(supplierMaster?.parentGroup).toBe('Sundry Creditors');
    expect(supplierMaster?.gstin).toBe('27AABCU9603R1ZM');
    expect(supplierMaster?.state).toBe('Maharashtra');
  });

  it('transforms CDNR (Credit Note) into mathematically balanced Tally Debit Note Voucher', () => {
    const invoices: Gstr2bInvoiceRow[] = [
      {
        ctin: '24AABCS1429B1Z2',
        supplier_name: 'GUJARAT CHEMICALS LTD',
        inum: 'CN-102',
        idt: '2024-05-10',
        section: 'CDNR',
        inv_typ: 'Credit Note',
        txval: 2000,
        igst: 360,
        cgst: 0,
        sgst: 0,
        total_val: 2360,
      },
    ];

    const result = convert2bInvoicesToTallyVouchers(invoices);
    expect(result.vouchers.length).toBe(1);
    const vch = result.vouchers[0];

    expect(vch.voucherType).toBe('Debit Note');
    expect(vch.referenceNumber).toBe('CN-102');

    // In Debit note: Party is Debited (-2360), Purchase is Credited (+2000), Tax is Credited (+360)
    let sum = 0;
    vch.legs.forEach((l) => (sum += cleanNumericAmount(l.amount)));
    expect(Math.abs(Math.round(sum * 100) / 100)).toBeLessThanOrEqual(0.005);
  });

  it('adds Round Off leg automatically when fractional paise rounding exists', () => {
    const invoices: Gstr2bInvoiceRow[] = [
      {
        ctin: '27AABCU9603R1ZM',
        supplier_name: 'ROUND OFF TEST CORP',
        inum: 'RO-001',
        idt: '01/06/2024',
        section: 'B2B',
        txval: 100.33,
        igst: 18.06,
        cgst: 0,
        sgst: 0,
        total_val: 118.0, // 0.39 round off difference
      },
    ];

    const result = convert2bInvoicesToTallyVouchers(invoices);
    const vch = result.vouchers[0];

    let sum = 0;
    vch.legs.forEach((l) => (sum += cleanNumericAmount(l.amount)));
    expect(Math.abs(Math.round(sum * 100) / 100)).toBeLessThanOrEqual(0.005);

    const hasRoundOff = vch.legs.some((l) => l.ledgerName === 'Round Off');
    expect(hasRoundOff).toBe(true);
  });

  it('snaps dates to 1st of month when snapToEduDates is true', () => {
    const invoices: Gstr2bInvoiceRow[] = [
      {
        ctin: '27AABCU9603R1ZM',
        supplier_name: 'TEST SUPPLIER',
        inum: 'INV-18',
        idt: '18/04/2026',
        section: 'B2B',
        txval: 1000,
        igst: 180,
        cgst: 0,
        sgst: 0,
        total_val: 1180,
      },
    ];

    const result = convert2bInvoicesToTallyVouchers(invoices, { snapToEduDates: true });
    const vch = result.vouchers[0];
    expect(vch.date).toBe('20260401');
    expect(vch.referenceDate).toBe('20260418');
  });

  it('parses Tally XML response and identifies Educational Mode date rejection', () => {
    const successXml = `
      <RESPONSE>
        <CREATED>10</CREATED>
        <ALTERED>0</ALTERED>
        <ERRORS>0</ERRORS>
      </RESPONSE>
    `;
    const parsedSuccess = parseTallyResponse(successXml);
    expect(parsedSuccess.created).toBe(10);
    expect(parsedSuccess.errors).toBe(0);
    expect(parsedSuccess.isEduDateBlocked).toBe(false);

    const errorXml = `
      <RESPONSE>
        <CREATED>0</CREATED>
        <ERRORS>1</ERRORS>
        <LINEERROR>Voucher date is missing for: 'Purchase' voucher PUR-0001</LINEERROR>
      </RESPONSE>
    `;
    const parsedError = parseTallyResponse(errorXml);
    expect(parsedError.created).toBe(0);
    expect(parsedError.errors).toBe(1);
    expect(parsedError.isEduDateBlocked).toBe(true);
  });

  it('detects prior FY invoices accurately', () => {
    // FY 2026-27 starts on 01-Apr-2026
    expect(isPriorFyInvoice({ idt: '24-03-2026' }, '2026-27')).toBe(true);
    expect(isPriorFyInvoice({ idt: '05-03-2026' }, '2026-27')).toBe(true);
    expect(isPriorFyInvoice({ idt: '31-12-2025' }, '2026-27')).toBe(true);
    expect(isPriorFyInvoice({ idt: '01-04-2026' }, '2026-27')).toBe(false);
    expect(isPriorFyInvoice({ idt: '15-08-2026' }, '2026-27')).toBe(false);
    expect(isPriorFyInvoice({ idt: '15-02-2027' }, '2026-27')).toBe(false);
  });

  it('snaps prior FY invoice to 01-Apr when snapPriorFyDates is true, preserving real date in reference', () => {
    const priorInv: Gstr2bInvoiceRow[] = [
      {
        ctin: '27AABCU9603R1ZM',
        supplier_name: 'TEST VENDOR',
        inum: 'INV-MARCH-01',
        idt: '24-03-2026',
        section: 'B2B',
        txval: 5000,
        igst: 900,
        cgst: 0,
        sgst: 0,
        total_val: 5900,
      },
    ];

    const withSnap = convert2bInvoicesToTallyVouchers(priorInv, {
      financialYear: '2026-27',
      snapPriorFyDates: true,
    });
    expect(withSnap.vouchers[0].date).toBe('20260401');
    expect(withSnap.vouchers[0].referenceDate).toBe('20260324');

    const withoutSnap = convert2bInvoicesToTallyVouchers(priorInv, {
      financialYear: '2026-27',
      snapPriorFyDates: false,
    });
    expect(withoutSnap.vouchers[0].date).toBe('20260324');
    expect(withoutSnap.vouchers[0].referenceDate).toBe('20260324');
  });
});

