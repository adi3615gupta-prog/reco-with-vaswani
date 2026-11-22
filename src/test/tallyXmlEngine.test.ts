import { describe, it, expect } from 'vitest';
import {
  escapeXml,
  formatTallyDate,
  cleanNumericAmount,
  validateDualEntryVouchers,
  validateMultiEntryVouchers,
  validateMasterLedgers,
  autoBalanceMultiEntry,
  fetchLedgersFromVouchers,
  computePreImportImpact,
  generateDualEntryXml,
  generateMultiEntryXml,
  generateQuickEntryXml,
  generateMasterLedgersXml,
  generateVoucherAlterationXml,
  buildTallyDayBookExportXml,
  parseTallyDayBookXml,
  parseTallyDayBookMultiXml,
  DualEntryVoucher,
  MultiEntryVoucher,
  QuickEntryTemplate,
  MasterLedger,
} from '@/lib/tallyXmlEngine';

describe('tallyXmlEngine Unit & Scrutiny Test Suite', () => {
  // ==========================================================================
  // 1. SANITIZATION & NORMALIZATION UTILITIES
  // ==========================================================================
  describe('escapeXml', () => {
    it('escapes reserved XML characters properly', () => {
      const raw = `Marks & Spencer <Ltd> "Premium's"`;
      const escaped = escapeXml(raw);
      expect(escaped).toBe('Marks &amp; Spencer &lt;Ltd&gt; &quot;Premium&apos;s&quot;');
    });

    it('handles null, undefined, and numeric values gracefully', () => {
      expect(escapeXml(null)).toBe('');
      expect(escapeXml(undefined)).toBe('');
      expect(escapeXml(12345)).toBe('12345');
    });
  });

  describe('formatTallyDate', () => {
    it('formats ISO dates (YYYY-MM-DD) to YYYYMMDD', () => {
      expect(formatTallyDate('2026-04-06')).toBe('20260406');
    });

    it('formats Indian standard dates (DD/MM/YYYY and DD-MM-YYYY) to YYYYMMDD', () => {
      expect(formatTallyDate('06/04/2026')).toBe('20260406');
      expect(formatTallyDate('25-12-2025')).toBe('20251225');
    });

    it('handles JS Date objects properly', () => {
      const d = new Date(2026, 3, 6); // Month 3 = April in JS
      expect(formatTallyDate(d)).toBe('20260406');
    });

    it('preserves already formatted 8-digit date strings', () => {
      expect(formatTallyDate('20260406')).toBe('20260406');
    });

    it('returns empty string for invalid inputs', () => {
      expect(formatTallyDate('')).toBe('');
      expect(formatTallyDate('invalid-date')).toBe('');
    });
  });

  describe('cleanNumericAmount', () => {
    it('strips commas, single quotes, and currency symbols from numbers', () => {
      expect(cleanNumericAmount("'5,00,000.00")).toBe(500000);
      expect(cleanNumericAmount('₹ 1,23,456.78')).toBe(123456.78);
      expect(cleanNumericAmount(25000)).toBe(25000);
    });

    it('converts accounting parenthesized negative numbers to signed negatives', () => {
      expect(cleanNumericAmount('(4,500.50)')).toBe(-4500.5);
      expect(cleanNumericAmount('-3357')).toBe(-3357);
    });

    it('returns 0 for null or empty string', () => {
      expect(cleanNumericAmount(null)).toBe(0);
      expect(cleanNumericAmount('')).toBe(0);
    });
  });

  // ==========================================================================
  // 2. VALIDATION ENGINES
  // ==========================================================================
  describe('validateDualEntryVouchers', () => {
    it('passes completely valid dual entry vouchers', () => {
      const vouchers: DualEntryVoucher[] = [
        {
          date: '2026-04-06',
          voucherType: 'Receipt',
          voucherNumber: 'RCT-001',
          debitLedger: 'IDFC FIRST Bank 8928',
          creditLedger: 'SUSPENSE',
          amount: 17400,
        },
      ];
      const issues = validateDualEntryVouchers(vouchers);
      expect(issues.length).toBe(0);
    });

    it('flags missing dates, identical ledgers, and zero amounts', () => {
      const invalidVouchers: DualEntryVoucher[] = [
        {
          date: '',
          voucherType: 'Receipt',
          debitLedger: 'SUSPENSE',
          creditLedger: 'SUSPENSE', // Identical
          amount: 0, // Zero amount
        },
      ];
      const issues = validateDualEntryVouchers(invalidVouchers);
      expect(issues.some((i) => i.field === 'date')).toBe(true);
      expect(issues.some((i) => i.field === 'debitLedger')).toBe(true);
      expect(issues.some((i) => i.field === 'amount')).toBe(true);
    });
  });

  describe('validateMultiEntryVouchers', () => {
    it('passes balanced multi entry vouchers with algebraic sum = 0', () => {
      const vouchers: MultiEntryVoucher[] = [
        {
          date: '2026-09-22',
          voucherType: 'Sales',
          voucherNumber: 'INV-101',
          legs: [
            { ledgerName: 'Sundry Debtors - ABC Corp', amount: -21240 }, // Debit
            { ledgerName: 'Sales 18%', amount: 18000 }, // Credit
            { ledgerName: 'Output CGST 9%', amount: 1620 }, // Credit
            { ledgerName: 'Output SGST 9%', amount: 1620 }, // Credit
          ],
        },
      ];
      const issues = validateMultiEntryVouchers(vouchers);
      expect(issues.length).toBe(0);
    });

    it('flags unbalanced multi entry vouchers with exact discrepancy amount', () => {
      const vouchers: MultiEntryVoucher[] = [
        {
          date: '2026-09-22',
          voucherType: 'Sales',
          legs: [
            { ledgerName: 'Sundry Debtors - ABC Corp', amount: -20000 },
            { ledgerName: 'Sales 18%', amount: 18000 },
          ], // Missing 2000 credit
        },
      ];
      const issues = validateMultiEntryVouchers(vouchers);
      const sumIssue = issues.find((i) => i.field === 'checkTotal');
      expect(sumIssue).toBeDefined();
      expect(sumIssue?.message).toContain('₹-2000.00');
    });
  });

  describe('validateMasterLedgers', () => {
    it('validates master ledgers and checks GSTIN format', () => {
      const ledgers: MasterLedger[] = [
        {
          ledgerName: 'J. M. K. TRADERS',
          parentGroup: 'Sundry Creditors',
          gstin: '08EXLPK2002J1ZI',
          pincode: '302001',
        },
        {
          ledgerName: 'INVALID VENDOR',
          parentGroup: 'Sundry Creditors',
          gstin: 'INVALID_GSTIN_123',
          pincode: 'ABC',
        },
      ];
      const issues = validateMasterLedgers(ledgers);
      expect(issues.some((i) => i.field === 'gstin')).toBe(true);
      expect(issues.some((i) => i.field === 'pincode')).toBe(true);
    });
  });

  // ==========================================================================
  // 3. AUTO-BALANCE & SCRUTINY ALGORITHMS
  // ==========================================================================
  describe('autoBalanceMultiEntry', () => {
    it('adds a Round Off leg to balance an unbalanced voucher', () => {
      const voucher: MultiEntryVoucher = {
        date: '2026-04-01',
        voucherType: 'Purchase',
        legs: [
          { ledgerName: 'Axflo Pump Solution', amount: 3357 }, // Credit
          { ledgerName: 'Purchase 18%', amount: -2844.91 }, // Debit
          { ledgerName: 'Input CGST 9%', amount: -256.04 }, // Debit
          { ledgerName: 'Input SGST 9%', amount: -256.04 }, // Debit
        ], // Sum = 3357 - 3356.99 = +0.01
      };

      const balanced = autoBalanceMultiEntry(voucher, 'Round Off');
      expect(balanced.legs.length).toBe(5);
      const roundoffLeg = balanced.legs.find((l) => l.ledgerName === 'Round Off');
      expect(roundoffLeg).toBeDefined();
      expect(roundoffLeg?.amount).toBe(-0.01);

      // Verify total sum is now zero
      let sum = 0;
      balanced.legs.forEach((l) => (sum += l.amount));
      expect(Math.round(sum * 100) / 100).toBe(0);
    });

    it('adjusts existing Round Off leg if one is already present', () => {
      const voucher: MultiEntryVoucher = {
        date: '2026-04-01',
        voucherType: 'Journal',
        legs: [
          { ledgerName: 'Bank A/c', amount: -100 },
          { ledgerName: 'Expense', amount: 99.5 },
          { ledgerName: 'Round Off', amount: 0.1 }, // Current sum = -0.4
        ],
      };

      const balanced = autoBalanceMultiEntry(voucher, 'Round Off');
      const roundoffLeg = balanced.legs.find((l) => l.ledgerName === 'Round Off');
      expect(roundoffLeg?.amount).toBe(0.5); // 0.1 + 0.4 = 0.5
    });
  });

  describe('fetchLedgersFromVouchers', () => {
    it('extracts unique ledgers across dual, multi, and quick vouchers and assigns smart groups', () => {
      const dualVouchers: DualEntryVoucher[] = [
        {
          date: '2026-04-06',
          voucherType: 'Receipt',
          debitLedger: 'IDFC FIRST Bank 8928',
          creditLedger: 'SUSPENSE',
          amount: 1000,
        },
      ];
      const multiVouchers: MultiEntryVoucher[] = [
        {
          date: '2026-04-06',
          voucherType: 'Sales',
          legs: [
            { ledgerName: 'KARTIK INDUSTRIES', amount: -1180 },
            { ledgerName: 'Output CGST 9%', amount: 90 },
            { ledgerName: 'Output SGST 9%', amount: 90 },
            { ledgerName: 'Sales 18%', amount: 1000 },
          ],
        },
      ];

      const existingMasters: MasterLedger[] = [
        { ledgerName: 'SUSPENSE', parentGroup: 'Suspense A/c' },
      ];

      const fetched = fetchLedgersFromVouchers({
        dualVouchers,
        multiVouchers,
        existingLedgers: existingMasters,
      });

      // Suspense should not be duplicated
      const suspenseCount = fetched.filter(
        (l) => l.ledgerName.toLowerCase() === 'suspense'
      ).length;
      expect(suspenseCount).toBe(1);

      // Verify smart groups
      const bank = fetched.find((l) => l.ledgerName === 'IDFC FIRST Bank 8928');
      expect(bank?.parentGroup).toBe('Bank Accounts');

      const cgst = fetched.find((l) => l.ledgerName === 'Output CGST 9%');
      expect(cgst?.parentGroup).toBe('Duties & Taxes');

      const sales = fetched.find((l) => l.ledgerName === 'Sales 18%');
      expect(sales?.parentGroup).toBe('Sales Accounts');

      const vendor = fetched.find((l) => l.ledgerName === 'KARTIK INDUSTRIES');
      expect(vendor?.parentGroup).toBe('Sundry Creditors');
    });
  });

  describe('computePreImportImpact', () => {
    it('aggregates debit, credit, count, and proves net impact sum is zero for complete books', () => {
      const dualVouchers: DualEntryVoucher[] = [
        {
          date: '2026-04-01',
          voucherType: 'Receipt',
          debitLedger: 'IDFC Bank',
          creditLedger: 'Customer A',
          amount: 15000,
        },
        {
          date: '2026-04-02',
          voucherType: 'Payment',
          debitLedger: 'Vendor B',
          creditLedger: 'IDFC Bank',
          amount: 5000,
        },
      ];

      const impact = computePreImportImpact({ dualVouchers });
      expect(impact.length).toBe(3);

      const idfc = impact.find((i) => i.ledgerName === 'IDFC Bank');
      expect(idfc).toBeDefined();
      expect(idfc?.count).toBe(2);
      expect(idfc?.totalDebit).toBe(15000);
      expect(idfc?.totalCredit).toBe(5000);
      expect(idfc?.netImpact).toBe(10000); // Dr 15000 - Cr 5000 = +10000

      // Invariant: sum of all net impacts across balanced entries MUST be 0
      let netSum = 0;
      impact.forEach((i) => (netSum += i.netImpact));
      expect(Math.round(netSum * 100) / 100).toBe(0);
    });
  });

  // ==========================================================================
  // 4. TALLY XML GENERATION
  // ==========================================================================
  describe('generateDualEntryXml', () => {
    it('generates standard Tally XML envelope with correct deemed positive tags', () => {
      const vouchers: DualEntryVoucher[] = [
        {
          date: '2026-04-06',
          voucherType: 'Receipt',
          voucherNumber: 'RCT-001',
          referenceNumber: 'REF-889',
          referenceDate: '2026-04-05',
          debitLedger: 'IDFC FIRST Bank & Co',
          creditLedger: 'SUSPENSE <A/C>',
          amount: 17400,
          narration: 'Rent received via UPI & Cash',
        },
      ];

      const xml = generateDualEntryXml(vouchers, 'Vaswani Enterprise');

      // Check Envelope tags
      expect(xml).toContain('<ENVELOPE>');
      expect(xml).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>');
      expect(xml).toContain('<SVCURRENTCOMPANY>Vaswani Enterprise</SVCURRENTCOMPANY>');

      // Check Voucher details
      expect(xml).toContain('<VOUCHER VCHTYPE="Receipt" ACTION="Create">');
      expect(xml).toContain('<DATE>20260406</DATE>');
      expect(xml).toContain('<REFERENCEDATE>20260405</REFERENCEDATE>');
      expect(xml).toContain('<REFERENCE>REF-889</REFERENCE>');
      expect(xml).toContain('<VOUCHERNUMBER>RCT-001</VOUCHERNUMBER>');

      // Check XML escaping
      expect(xml).toContain('IDFC FIRST Bank &amp; Co');
      expect(xml).toContain('SUSPENSE &lt;A/C&gt;');
      expect(xml).toContain('Rent received via UPI &amp; Cash');

      // Check deemed positive for Receipt:
      // Credit Ledger (SUSPENSE) -> ISDEEMEDPOSITIVE = No, AMOUNT = 17400.00
      // Debit Ledger (IDFC) -> ISDEEMEDPOSITIVE = Yes, AMOUNT = -17400.00
      expect(xml).toContain('<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>');
      expect(xml).toContain('<AMOUNT>17400.00</AMOUNT>');
      expect(xml).toContain('<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>');
      expect(xml).toContain('<AMOUNT>-17400.00</AMOUNT>');
    });
  });

  describe('generateMultiEntryXml', () => {
    it('generates multi-ledger voucher XML with all ledger lines correctly assigned', () => {
      const vouchers: MultiEntryVoucher[] = [
        {
          date: '2026-09-22',
          voucherType: 'Sales',
          voucherNumber: 'I20221992',
          narration: 'Tax invoice sale',
          legs: [
            { ledgerName: 'HDFC BANK-3801', amount: -21240 }, // Debit
            { ledgerName: 'Sales Account', amount: 18000 }, // Credit
            { ledgerName: 'Output Cgst 2.5%', amount: 1620 }, // Credit
            { ledgerName: 'Output Sgst 2.5%', amount: 1620 }, // Credit
          ],
        },
      ];

      const xml = generateMultiEntryXml(vouchers);
      expect(xml).toContain('<VOUCHER VCHTYPE="Sales" ACTION="Create">');
      expect(xml).toContain('<DATE>20260922</DATE>');
      expect(xml).toContain('<VOUCHERNUMBER>I20221992</VOUCHERNUMBER>');

      // 4 ledger entries
      const count = (xml.match(/<ALLLEDGERENTRIES\.LIST>/g) || []).length;
      expect(count).toBe(4);

      // Debit line
      expect(xml).toContain('<LEDGERNAME>HDFC BANK-3801</LEDGERNAME>');
      expect(xml).toContain('<AMOUNT>-21240.00</AMOUNT>');

      // Credit lines
      expect(xml).toContain('<LEDGERNAME>Sales Account</LEDGERNAME>');
      expect(xml).toContain('<AMOUNT>18000.00</AMOUNT>');
    });
  });

  describe('generateQuickEntryXml', () => {
    it('transforms columnar quick entry template into balanced multi-entry XML', () => {
      const template: QuickEntryTemplate = {
        voucherType: 'Purchase',
        columns: [
          { key: 'pur', ledgerName: 'PURCHASE 18%' },
          { key: 'cgst', ledgerName: 'INPUT CGST 9%' },
          { key: 'sgst', ledgerName: 'INPUT SGST 9%' },
          { key: 'round', ledgerName: 'ROUND OFF' },
        ],
        rows: [
          {
            date: '2026-04-03',
            voucherNumber: 'PUR-001',
            referenceNumber: 'BILL-88',
            partyLedger: 'Axflo Pump Solution',
            narration: 'Office equipment purchase',
            amounts: {
              pur: 2844.91,
              cgst: 256.04,
              sgst: 256.04,
              round: 0.01,
            },
          },
        ],
      };

      const xml = generateQuickEntryXml(template);
      expect(xml).toContain('<VOUCHER VCHTYPE="Purchase" ACTION="Create">');
      expect(xml).toContain('<DATE>20260403</DATE>');

      // Party Ledger (Axflo) should be Credited with total: 2844.91 + 256.04 + 256.04 + 0.01 = 3357.00
      expect(xml).toContain('<LEDGERNAME>Axflo Pump Solution</LEDGERNAME>');
      expect(xml).toContain('<AMOUNT>3357.00</AMOUNT>');

      // Columns should be Debited (Negative amounts in XML)
      expect(xml).toContain('<LEDGERNAME>PURCHASE 18%</LEDGERNAME>');
      expect(xml).toContain('<AMOUNT>-2844.91</AMOUNT>');
      expect(xml).toContain('<LEDGERNAME>ROUND OFF</LEDGERNAME>');
      expect(xml).toContain('<AMOUNT>-0.01</AMOUNT>');
    });
  });

  describe('generateMasterLedgersXml', () => {
    it('generates standard Tally Ledger Master XML with all statutory fields', () => {
      const ledgers: MasterLedger[] = [
        {
          ledgerName: 'KARTIK INDUSTRIES & SONS',
          parentGroup: 'Sundry Creditors',
          openingBalance: 15400.5,
          alias: 'KARTIK-IND',
          addressLine1: 'Plot 42, Industrial Area',
          addressLine2: 'Phase II',
          state: 'Maharashtra',
          pincode: '411044',
          gstin: '22ALCPV8874E1ZT',
          registrationType: 'Regular',
        },
      ];

      const xml = generateMasterLedgersXml(ledgers, 'Vaswani Enterprise');
      expect(xml).toContain('<LEDGER RESERVEDNAME="" NAME="KARTIK INDUSTRIES &amp; SONS">');
      expect(xml).toContain('<PARENT>Sundry Creditors</PARENT>');
      expect(xml).toContain('<OPENINGBALANCE>15400.50</OPENINGBALANCE>');
      expect(xml).toContain('<NAME>KARTIK-IND</NAME>');
      expect(xml).toContain('<ADDRESS>Plot 42, Industrial Area</ADDRESS>');
      expect(xml).toContain('<LEDSTATENAME>Maharashtra</LEDSTATENAME>');
      expect(xml).toContain('<PINCODE>411044</PINCODE>');
      expect(xml).toContain('<PARTYGSTIN>22ALCPV8874E1ZT</PARTYGSTIN>');
      expect(xml).toContain('<GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>');
    });
  });

  describe('generateVoucherAlterationXml', () => {
    it('generates Tally XML with ACTION="Alter" and preserves voucher keys', () => {
      const vouchers: DualEntryVoucher[] = [
        {
          date: '2026-04-15',
          voucherType: 'Payment',
          voucherNumber: 'PV-2026-001',
          debitLedger: 'Office Rent A/c',
          creditLedger: 'HDFC Bank A/c',
          amount: 25000,
          narration: 'Rent for April 2026 altered',
          guid: 'test-guid-12345',
        },
      ];

      const xml = generateVoucherAlterationXml(vouchers, 'FINPULSE');
      expect(xml).toContain('<VOUCHER DATE="20260415" TAGNAME="Voucher Number" TAGVALUE="PV-2026-001" VCHTYPE="Payment" ACTION="Alter">');
      expect(xml).toContain('<GUID>test-guid-12345</GUID>');
      expect(xml).toContain('<VOUCHERNUMBER>PV-2026-001</VOUCHERNUMBER>');
      expect(xml).toContain('<DATE>20260415</DATE>');
      expect(xml).toContain('<NARRATION>Rent for April 2026 altered</NARRATION>');
      expect(xml).toContain('<LEDGERNAME>Office Rent A/c</LEDGERNAME>');
      expect(xml).toContain('<AMOUNT>-25000.00</AMOUNT>');
      expect(xml).toContain('<LEDGERNAME>HDFC Bank A/c</LEDGERNAME>');
      expect(xml).toContain('<AMOUNT>25000.00</AMOUNT>');
    });
  });

  describe('buildTallyDayBookExportXml & parseTallyDayBookXml', () => {
    it('builds daybook collection export XML', () => {
      const queryXml = buildTallyDayBookExportXml('2026-04-01', '2026-04-30');
      expect(queryXml).toContain('<ID>DayBookVouchers</ID>');
      expect(queryXml).toContain('<SVFROMDATE>20260401</SVFROMDATE>');
      expect(queryXml).toContain('<SVTODATE>20260430</SVTODATE>');
      expect(queryXml).toContain('ActiveVouchersOnly');
    });

    it('parses raw Tally XML vouchers into DualEntryVoucher array', () => {
      const rawXml = `
      <ENVELOPE>
        <BODY>
          <DATA>
            <COLLECTION>
              <VOUCHER>
                <DATE>20260420</DATE>
                <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
                <VOUCHERNUMBER>PAY-101</VOUCHERNUMBER>
                <NARRATION>Electricity Bill payment</NARRATION>
                <GUID>g-9988</GUID>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Electricity Expense</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-4200.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>State Bank of India</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>4200.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>
            </COLLECTION>
          </DATA>
        </BODY>
      </ENVELOPE>`;

      const parsed = parseTallyDayBookXml(rawXml);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].date).toBe('2026-04-20');
      expect(parsed[0].voucherType).toBe('Payment');
      expect(parsed[0].voucherNumber).toBe('PAY-101');
      expect(parsed[0].debitLedger).toBe('Electricity Expense');
      expect(parsed[0].creditLedger).toBe('State Bank of India');
      expect(parsed[0].amount).toBe(4200);
      expect(parsed[0].guid).toBe('g-9988');
      expect(parsed[0].narration).toBe('Electricity Bill payment');
    });

    it('parses real TallyPrime XML with TYPE attributes and XML entities', () => {
      const realTallyXml = `
      <ENVELOPE>
        <BODY>
          <DATA>
            <COLLECTION>
              <VOUCHER REMOTEID="4d93ea8f-001" VCHTYPE="Payment">
                <DATE TYPE="Date">20260401</DATE>
                <GUID>4d93ea8f-001</GUID>
                <NARRATION TYPE="String">Rent payment &amp; maintenance</NARRATION>
                <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
                <VOUCHERNUMBER>1</VOUCHERNUMBER>
                <REFERENCE TYPE="String">INV-9021</REFERENCE>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME TYPE="String">Office Rent A/c</LEDGERNAME>
                  <ISDEEMEDPOSITIVE TYPE="Logical">Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT TYPE="Amount">-25000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME TYPE="String">State Bank of India</LEDGERNAME>
                  <ISDEEMEDPOSITIVE TYPE="Logical">No</ISDEEMEDPOSITIVE>
                  <AMOUNT TYPE="Amount">25000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>
            </COLLECTION>
          </DATA>
        </BODY>
      </ENVELOPE>`;

      const parsed = parseTallyDayBookXml(realTallyXml);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].date).toBe('2026-04-01');
      expect(parsed[0].voucherType).toBe('Payment');
      expect(parsed[0].voucherNumber).toBe('1');
      expect(parsed[0].referenceNumber).toBe('INV-9021');
      expect(parsed[0].debitLedger).toBe('Office Rent A/c');
      expect(parsed[0].creditLedger).toBe('State Bank of India');
      expect(parsed[0].amount).toBe(25000);
      expect(parsed[0].narration).toBe('Rent payment & maintenance');
    });
      it('strips illegal XML 1.0 control characters in escapeXml (TXML-FIX-01)', () => {
      const dirty = 'Invoice\x00 with\x08 control\x0B chars\x0C and\x1F entities & < >';
      const clean = escapeXml(dirty);
      expect(clean).toBe('Invoice with control chars and entities &amp; &lt; &gt;');
      expect(clean).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F]/);
    });

    it('preserves all multi-leg entries in DayBook vouchers without dropping CGST/SGST/Round-Off', () => {
      const multiLegXml = `
      <ENVELOPE>
        <BODY>
          <DATA>
            <COLLECTION>
              <VOUCHER VCHTYPE="Purchase">
                <DATE>20260405</DATE>
                <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
                <VOUCHERNUMBER>PUR-001</VOUCHERNUMBER>
                <NARRATION>Purchase of raw materials with taxes</NARRATION>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Raw Material Purchase</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-100000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Input CGST 9%</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-9000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Input SGST 9%</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-9000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Round Off</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>0.50</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>ABC Suppliers Ltd</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>117999.50</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>
            </COLLECTION>
          </DATA>
        </BODY>
      </ENVELOPE>`;

      const parsed = parseTallyDayBookXml(multiLegXml);
      expect(parsed).toHaveLength(1);
      const vch = parsed[0];
      // All 5 legs preserved in allEntries and legs
      expect(vch.allEntries).toHaveLength(5);
      expect(vch.legs).toHaveLength(5);
      expect(vch.allEntries?.map(e => e.ledgerName)).toEqual([
        'Raw Material Purchase',
        'Input CGST 9%',
        'Input SGST 9%',
        'Round Off',
        'ABC Suppliers Ltd'
      ]);

      // parseTallyDayBookMultiXml also parses all legs
      const multi = parseTallyDayBookMultiXml(multiLegXml);
      expect(multi).toHaveLength(1);
      expect(multi[0].legs).toHaveLength(5);
      expect(multi[0].legs[1].ledgerName).toBe('Input CGST 9%');
      expect(multi[0].legs[1].amount).toBe(-9000);
    });
  });
});