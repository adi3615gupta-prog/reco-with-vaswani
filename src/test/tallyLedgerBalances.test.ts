import { describe, it, expect, vi, afterEach } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import {
  parseTallySignedBalance,
  fetchLedgerBalances,
  type LedgerBalanceSummary,
  type LedgerVoucherEntry,
} from '@/lib/tallyApi';
import {
  buildLedgerImportWorkbook,
  formatSignedBalanceText,
} from '@/lib/tallyLedgerExport';

describe('Tally Ledger Opening & Closing Balances', () => {
  afterEach(() => {
    if (typeof window !== 'undefined') {
      delete (window as any).electronAPI;
    }
    vi.restoreAllMocks();
  });

  it('parseTallySignedBalance handles Tally XML numbers and explicit Dr/Cr suffixes', () => {
    // Raw Tally XML: negative = Debit (+), positive = Credit (-)
    expect(parseTallySignedBalance('-8592620.04')).toBe(8592620.04);
    expect(parseTallySignedBalance('636840.00')).toBe(-636840);
    expect(parseTallySignedBalance('0.00')).toBe(0);
    expect(parseTallySignedBalance('-0.00')).toBe(0);
    expect(parseTallySignedBalance('')).toBe(0);
    expect(parseTallySignedBalance(null)).toBe(0);

    // Explicit Dr / Cr suffixes
    expect(parseTallySignedBalance('50,000.00 Dr')).toBe(50000);
    expect(parseTallySignedBalance('₹ 1,25,000.50 Cr')).toBe(-125000.5);
    expect(parseTallySignedBalance('-12,345.00 Dr')).toBe(12345);
    expect(parseTallySignedBalance('-12,345.00 Cr')).toBe(-12345);
  });

  it('fetchLedgerBalances resolves exact mid-year Opening Balance from prevDayClosing and Closing Balance from period end', async () => {
    const mockFetch = vi.fn(async (_port: number, xml: string) => {
      if (xml.includes('LedgerPeriodBalances')) {
        // Period: 2026-10-01 to 2026-12-31; BooksFrom: 2026-04-01
        // Master opening (1-Apr) = 10,000 Dr (-10000)
        // Transactions Apr-Sep = +15,000 Dr net -> Opening on 1-Oct = 25,000 Dr
        // Transactions Oct-Dec = 30,000 Dr / 5,000 Cr -> Closing on 31-Dec = 50,000 Dr (-50000)
        return `<ENVELOPE><BODY><DATA><COLLECTION>
          <LEDGER NAME="ABC Traders">
            <PARENT>Sundry Debtors</PARENT>
            <OPENINGBALANCE>-10000.00</OPENINGBALANCE>
            <CLOSINGBALANCE>-50000.00</CLOSINGBALANCE>
            <DEBITTOTALS>-30000.00</DEBITTOTALS>
            <CREDITTOTALS>5000.00</CREDITTOTALS>
          </LEDGER>
          <LEDGER NAME="XYZ &amp; Co">
            <PARENT>Sundry Creditors</PARENT>
            <OPENINGBALANCE>5000.00</OPENINGBALANCE>
            <CLOSINGBALANCE>12000.00</CLOSINGBALANCE>
            <DEBITTOTALS>-3000.00</DEBITTOTALS>
            <CREDITTOTALS>8000.00</CREDITTOTALS>
          </LEDGER>
        </COLLECTION></DATA></BODY></ENVELOPE>`;
      }
      if (xml.includes('LedgerPrevDayClosing')) {
        expect(xml).toContain('<SVTODATE>20260930</SVTODATE>');
        return `<ENVELOPE><BODY><DATA><COLLECTION>
          <LEDGER NAME="ABC Traders">
            <CLOSINGBALANCE>-25000.00</CLOSINGBALANCE>
          </LEDGER>
          <LEDGER NAME="XYZ &amp; Co">
            <CLOSINGBALANCE>7000.00</CLOSINGBALANCE>
          </LEDGER>
        </COLLECTION></DATA></BODY></ENVELOPE>`;
      }
      return '';
    });

    (window as any).electronAPI = { fetchTallyData: mockFetch };

    const result = await fetchLedgerBalances(
      ['ABC Traders', 'XYZ & Co'],
      '2026-10-01',
      '2026-12-31',
      { host: 'localhost', port: 9000 },
      '20260401'
    );

    const abc = result.get('ABC Traders')!;
    expect(abc.openingBalance).toBe(25000); // 25,000 Dr
    expect(abc.closingBalance).toBe(50000); // 50,000 Dr
    expect(abc.tallyDebitTotal).toBe(30000);
    expect(abc.tallyCreditTotal).toBe(5000);

    const xyz = result.get('XYZ & Co')!;
    expect(xyz.openingBalance).toBe(-7000); // 7,000 Cr
    expect(xyz.closingBalance).toBe(-12000); // 12,000 Cr
  });

  it('fetchLedgerBalances uses masterOpening when fromDate is on or before BooksFrom', async () => {
    const mockFetch = vi.fn(async (_port: number, xml: string) => {
      if (xml.includes('LedgerPeriodBalances')) {
        return `<ENVELOPE><BODY><DATA><COLLECTION>
          <LEDGER NAME="HDFC Bank">
            <PARENT>Bank Accounts</PARENT>
            <OPENINGBALANCE>-150000.00</OPENINGBALANCE>
            <CLOSINGBALANCE>-180000.00</CLOSINGBALANCE>
            <DEBITTOTALS>-50000.00</DEBITTOTALS>
            <CREDITTOTALS>20000.00</CREDITTOTALS>
          </LEDGER>
        </COLLECTION></DATA></BODY></ENVELOPE>`;
      }
      // Simulate Tally ignoring SVTODATE < BooksFrom and returning year-end balance
      return `<ENVELOPE><BODY><DATA><COLLECTION>
        <LEDGER NAME="HDFC Bank">
          <CLOSINGBALANCE>-180000.00</CLOSINGBALANCE>
        </LEDGER>
      </COLLECTION></DATA></BODY></ENVELOPE>`;
    });

    (window as any).electronAPI = { fetchTallyData: mockFetch };

    const result = await fetchLedgerBalances(
      ['HDFC Bank'],
      '2026-04-01',
      '2027-03-31',
      { host: 'localhost', port: 9000 },
      '20260401'
    );

    const hdfc = result.get('HDFC Bank')!;
    expect(hdfc.openingBalance).toBe(150000); // Master opening 1,50,000 Dr
    expect(hdfc.closingBalance).toBe(180000); // Closing 1,80,000 Dr
  });

  it('buildLedgerImportWorkbook enters Opening Balance, Current Total, and Closing Balance with zero merges', () => {
    const balances = new Map<string, LedgerBalanceSummary>([
      [
        'HDFC Bank',
        {
          ledgerName: 'HDFC Bank',
          parent: 'Bank Accounts',
          openingBalance: 150000, // 1,50,000 Dr
          closingBalance: 180000, // 1,80,000 Dr
          tallyDebitTotal: 50000,
          tallyCreditTotal: 20000,
        },
      ],
      [
        'Dormant Creditor',
        {
          ledgerName: 'Dormant Creditor',
          parent: 'Sundry Creditors',
          openingBalance: -40000, // 40,000 Cr
          closingBalance: -40000, // 40,000 Cr
          tallyDebitTotal: 0,
          tallyCreditTotal: 0,
        },
      ],
    ]);

    const entries: LedgerVoucherEntry[] = [
      {
        date: '2026-05-10',
        voucherNumber: 'REC-01',
        voucherType: 'Receipt',
        partyName: 'Client A',
        debit: 50000,
        credit: 0,
        narration: 'Payment received',
        ledgerName: 'HDFC Bank',
      },
      {
        date: '2026-06-15',
        voucherNumber: 'PAY-02',
        voucherType: 'Payment',
        partyName: 'Vendor B',
        debit: 0,
        credit: 20000,
        narration: 'Vendor paid',
        ledgerName: 'HDFC Bank',
      },
    ];

    const wb = buildLedgerImportWorkbook({
      companyName: 'Test Co Pvt Ltd',
      fromDate: '2026-04-01',
      toDate: '2027-03-31',
      selectedLedgerNames: ['HDFC Bank', 'Dormant Creditor'],
      entries,
      balances,
    });

    expect(wb.SheetNames).toEqual([
      'Ledger Vouchers',
      'Balances Summary',
      'HDFC Bank',
      'Dormant Creditor',
    ]);

    // Zero merges rule across every sheet
    for (const name of wb.SheetNames) {
      expect(wb.Sheets[name]['!merges']).toBeUndefined();
    }

    // Per-ledger sheet: HDFC Bank
    const hdfcRows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets['HDFC Bank'], { header: 1 });
    expect(hdfcRows[4]).toEqual([
      '2026-04-01',
      '',
      'Opening Balance',
      'Opening Balance',
      150000,
      '',
      'Opening balance as on 2026-04-01',
    ]);
    expect(hdfcRows[7]).toEqual([
      '',
      '',
      '',
      'Current Total (Period Vouchers)',
      50000,
      20000,
      '',
    ]);
    expect(hdfcRows[8]).toEqual([
      '',
      '',
      '',
      'Closing Balance (Dr)',
      180000,
      '',
      'Closing balance as on 2027-03-31',
    ]);

    // Dormant ledger with 0 vouchers still exports Opening & Closing Balance
    const dormantRows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets['Dormant Creditor'], { header: 1 });
    expect(dormantRows[4][5]).toBe(40000); // Opening Cr
    expect(dormantRows[6][3]).toBe('Closing Balance (Cr)');
    expect(dormantRows[6][5]).toBe(40000); // Closing Cr

    // Balances Summary sheet
    const sumRows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets['Balances Summary'], { header: 1 });
    expect(sumRows[4][0]).toBe('HDFC Bank');
    expect(sumRows[4][2]).toBe(150000); // Opening Dr
    expect(sumRows[4][6]).toBe(180000); // Closing Dr
    expect(sumRows[6][8]).toBe(formatSignedBalanceText(140000)); // Net 180k Dr - 40k Cr = 140k Dr
  });
});
