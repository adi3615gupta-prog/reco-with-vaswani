import { describe, it, expect } from 'vitest';
import { generateCmaAppraisalReport } from '@/lib/cmaEngine';
import type { TallyCmaExtractionResult } from '@/lib/tallyCmaApi';
import { runCashComplianceAudit, runCreditorFinalisationScrutiny, type TallyVoucherEntry } from '@/lib/auditEngine';
import { computeBooksTdsLiability, type TallyTdsTransaction } from '@/lib/tdsEngine';
import { createEmptyMonthData, recalculateMonthData } from '@/lib/gstr3bEngine';

describe('CMA & Audit Statutory Compliance Suite', () => {

  // ── 1. Tandon Committee Method II MPBF: OCL Exclusion ───────────────
  it('CMA: Tandon Method II excludes Bank Borrowings from Current Liabilities to compute Working Capital Gap', () => {
    const mockExtraction: TallyCmaExtractionResult = {
      companyInfo: {
        name: 'VASWANI ENTERPRISES LTD',
        financialYear: '2025-26',
        address: '',
        gstin: '',
        state: '',
      },
      ledgers: [
        // Current Assets: ₹1,00,00,000
        {
          name: 'Stock in Trade',
          parentGroup: 'Stock-in-hand',
          primaryGroup: 'Current Assets',
          closingBalance: 5000000,
          openingBalance: 5000000,
          debitTotal: 5000000,
          creditTotal: 0,
          agedOver180Days: 0,
        },
        {
          name: 'Trade Debtors',
          parentGroup: 'Sundry Debtors',
          primaryGroup: 'Current Assets',
          closingBalance: 4000000,
          openingBalance: 4000000,
          debitTotal: 4000000,
          creditTotal: 0,
          agedOver180Days: 0,
        },
        {
          name: 'Cash and Bank',
          parentGroup: 'Bank Accounts',
          primaryGroup: 'Current Assets',
          closingBalance: 1000000,
          openingBalance: 1000000,
          debitTotal: 1000000,
          creditTotal: 0,
          agedOver180Days: 0,
        },
        // Current Liabilities: Total ₹40,00,000 (Trade Creditors ₹15L + CC Limit ₹25L)
        {
          name: 'Sundry Creditors for Goods',
          parentGroup: 'Sundry Creditors',
          primaryGroup: 'Current Liabilities',
          closingBalance: -1500000,
          openingBalance: -1500000,
          debitTotal: 0,
          creditTotal: 1500000,
          agedOver180Days: 0,
        },
        {
          name: 'HDFC Bank CC Account',
          parentGroup: 'Bank OD A/c',
          primaryGroup: 'Current Liabilities',
          closingBalance: -2500000,
          openingBalance: -2500000,
          debitTotal: 0,
          creditTotal: 2500000,
          agedOver180Days: 0,
        },
        // Net Worth
        {
          name: 'Share Capital',
          parentGroup: 'Capital Account',
          primaryGroup: 'Capital Account',
          closingBalance: -6000000,
          openingBalance: -6000000,
          debitTotal: 0,
          creditTotal: 6000000,
          agedOver180Days: 0,
        },
      ],
      groupTotals: new Map(),
      fetchedAt: new Date().toISOString(),
    };

    const report = generateCmaAppraisalReport(mockExtraction);

    // Current Assets = ₹1,00,00,000
    expect(report.mpbfMethodII.currentAssets).toBe(10000000);
    // Total Current Liabilities = ₹40,00,000
    expect(report.mpbfMethodII.currentLiabilities).toBe(4000000);
    // Working Capital Bank Borrowings (CC) = ₹25,00,000
    expect(report.mpbfMethodII.workingCapitalBankBorrowings).toBe(2500000);
    // Other Current Liabilities (OCL) = ₹40,00,000 - ₹25,00,000 = ₹15,00,000
    expect(report.mpbfMethodII.otherCurrentLiabilities).toBe(1500000);
    // Working Capital Gap = CA - OCL = ₹1,00,00,000 - ₹15,00,000 = ₹85,00,000
    expect(report.mpbfMethodII.workingCapitalGap).toBe(8500000);
    // Minimum Stipulated NWC = 25% of CA = ₹25,00,000
    expect(report.mpbfMethodII.minimumStipulatedNWC).toBe(2500000);
    // MPBF = Working Capital Gap - Min NWC = ₹85,00,000 - ₹25,00,000 = ₹60,00,000
    expect(report.mpbfMethodII.maxPermissibleBankFinance).toBe(6000000);
  });

  // ── 2. Section 16(4) FY Boundary Deadline Check ────────────────────
  it('Monthly Audit: Section 16(4) Q4 (Jan-Mar) deadline falls on 30 Nov of the SAME calendar year', () => {
    // Helper replicating the fixed monthly audit 16(4) logic
    const computeSec16_4Deadline = (invoiceDateStr: string): Date => {
      const d = new Date(invoiceDateStr);
      const fyEndYear = d.getMonth() <= 2 ? d.getFullYear() : d.getFullYear() + 1;
      return new Date(fyEndYear, 10, 30, 23, 59, 59);
    };

    // Invoice from Q4 of FY 2023-24: 15 Jan 2024
    // FY ends on 31 Mar 2024 -> following 30th Nov is 30 Nov 2024
    const q4Deadline = computeSec16_4Deadline('2024-01-15');
    expect(q4Deadline.getFullYear()).toBe(2024);
    expect(q4Deadline.getMonth()).toBe(10); // November (0-indexed)
    expect(q4Deadline.getDate()).toBe(30);

    // Invoice from Q1 of FY 2023-24: 15 May 2023
    // FY ends on 31 Mar 2024 -> following 30th Nov is 30 Nov 2024
    const q1Deadline = computeSec16_4Deadline('2023-05-15');
    expect(q1Deadline.getFullYear()).toBe(2024);
    expect(q1Deadline.getMonth()).toBe(10);

    // Invoice from Q1 of FY 2024-25: 15 May 2024
    // FY ends on 31 Mar 2025 -> following 30th Nov is 30 Nov 2025
    const nextFyDeadline = computeSec16_4Deadline('2024-05-15');
    expect(nextFyDeadline.getFullYear()).toBe(2025);
    expect(nextFyDeadline.getMonth()).toBe(10);
  });

  // ── 3. Section 40A(3) Split Cash Payments Aggregation ──────────────
  it('Audit: Sec 40A(3) detects split cash payments exceeding ₹10,000 to same party on same date', () => {
    const vouchers: TallyVoucherEntry[] = [
      {
        date: '2025-05-10',
        voucherType: 'Payment',
        voucherNumber: 'PAY-001',
        amount: 6000,
        isDebit: false, // Cash credited (payment made)
        partyName: 'RAMESH TRADERS',
      },
      {
        date: '2025-05-10',
        voucherType: 'Payment',
        voucherNumber: 'PAY-002',
        amount: 6500,
        isDebit: false, // Cash credited (payment made)
        partyName: 'RAMESH TRADERS',
      },
      {
        date: '2025-05-11',
        voucherType: 'Payment',
        voucherNumber: 'PAY-003',
        amount: 8000,
        isDebit: false, // Single payment under ₹10,000
        partyName: 'RAMESH TRADERS',
      },
    ];

    const observations = runCashComplianceAudit(vouchers, [], 100000, '2025-05-31');

    // Should flag the split payment on 2025-05-10 (₹6,000 + ₹6,500 = ₹12,500 > ₹10,000)
    const violation = observations.find(o => o.type === 'Disallowed Payment (40A(3))' && o.date === '2025-05-10');
    expect(violation).toBeDefined();
    expect(violation?.amount).toBe(12500);
    expect(violation?.partyName).toBe('RAMESH TRADERS');

    // Should NOT flag 2025-05-11 (₹8,000 <= ₹10,000)
    const nonViolation = observations.find(o => o.type === 'Disallowed Payment (40A(3))' && o.date === '2025-05-11');
    expect(nonViolation).toBeUndefined();
  });

  // ── 4. Section 194Q Gating Removal ────────────────────────────────
  it('Audit: Sec 194Q evaluates all Purchase/Expense ledgers > ₹50 Lakhs regardless of name keywords', () => {
    const mockTallyData = {
      parties: new Map([
        [
          'ABC CONSULTANCY & ALLIED SUPPLIES',
          {
            partyName: 'ABC CONSULTANCY & ALLIED SUPPLIES',
            parentGroup: 'Sundry Creditors',
            closingBalance: -6000000,
            vouchers: [
              {
                date: '2025-06-15',
                voucherNumber: 'PUR-101',
                voucherType: 'Purchase',
                amount: 6000000,
                isDebit: false,
                counterpartyLedger: 'Purchase Account',
              },
            ],
          },
        ],
      ]),
      allVouchers: [],
    };

    const observations = runCreditorFinalisationScrutiny(mockTallyData as any);

    // Must be flagged for Sec 194Q because purchase exceeds ₹50 Lakhs, even though name has no 'STEEL' or 'TRADER'
    const sec194QObs = observations.find(o => o.category === 'Purchase Sec 194Q (0.1% TDS)');
    expect(sec194QObs).toBeDefined();
    expect(sec194QObs?.partyName).toBe('ABC CONSULTANCY & ALLIED SUPPLIES');
    expect(sec194QObs?.amount).toBe(6000000);
  });

  // ── 5. Section 194C(5) Cumulative Threshold Catch-up ───────────────
  it('TDS: Sec 194C(5) retroactively taxes all prior untaxed bills upon breaching ₹1,00,000 aggregate', () => {
    const transactions: TallyTdsTransaction[] = [
      {
        date: new Date('2025-04-10'),
        partyName: 'SHIV LOGISTICS',
        partyPan: 'AAAPS1234K',
        ledgerName: 'Freight Charges',
        amount: 25000, // < 30,000 single bill threshold
        actualTdsDeducted: 0,
      },
      {
        date: new Date('2025-06-12'),
        partyName: 'SHIV LOGISTICS',
        partyPan: 'AAAPS1234K',
        ledgerName: 'Freight Charges',
        amount: 28000, // < 30,000, cumulative = 53,000
        actualTdsDeducted: 0,
      },
      {
        date: new Date('2025-08-20'),
        partyName: 'SHIV LOGISTICS',
        partyPan: 'AAAPS1234K',
        ledgerName: 'Freight Charges',
        amount: 29000, // < 30,000, cumulative = 82,000
        actualTdsDeducted: 0,
      },
      {
        date: new Date('2025-10-15'),
        partyName: 'SHIV LOGISTICS',
        partyPan: 'AAAPS1234K',
        ledgerName: 'Freight Charges',
        amount: 25000, // cumulative = 1,07,000 -> BREACHES ₹1,00,000!
        actualTdsDeducted: 0,
      },
    ];

    const mappings = [{ ledgerName: 'Freight Charges', sectionCode: '194C' }];
    const sectionsMaster: any[] = [
      {
        old_section: '194C',
        rate_individual_huf: 1.0,
        rate_company_others: 2.0,
        rate_missing_pan_206AA: 20.0,
        single_bill_threshold: 30000,
        annual_aggregate_threshold: 100000,
      },
    ];

    const liabilities = computeBooksTdsLiability(transactions, mappings, sectionsMaster);

    // Group should catch up all ₹1,07,000 across all 4 transactions
    const group = liabilities['AAAPS1234K_194C'];
    expect(group).toBeDefined();
    expect(group.taxableAmount).toBe(107000);
    // Firm/Company 4th char 'P' is individual/proprietor -> 1% statutory rate = ₹1,070
    expect(group.requiredTds).toBe(1070);
  });

  // ── 6. GSTR-3B Rule 88A: Surplus IGST Carried Forward as IGST ──────
  it('GSTR-3B: Surplus unutilized IGST credit is carried forward strictly as IGST credit (never converted to CGST)', () => {
    const monthDataSurplus = createEmptyMonthData('June', '2025-26');
    monthDataSurplus.outward.b2b.igst = 10000;
    monthDataSurplus.outward.b2b.cgst = 10000;
    monthDataSurplus.outward.b2b.sgst = 10000;
    // Huge IGST ITC available in 2B
    monthDataSurplus.inward.itc2b.igst = 100000;
    monthDataSurplus.inward.itc2b.cgst = 0;
    monthDataSurplus.inward.itc2b.sgst = 0;

    const result = recalculateMonthData(monthDataSurplus);

    // IGST Liability: ₹10,000. CGST: ₹10,000. SGST: ₹10,000. Total liability: ₹30,000.
    // IGST ITC available: ₹100,000.
    // Offset IGST: ₹10,000. Offset CGST: ₹10,000. Offset SGST: ₹10,000.
    // Surplus IGST: ₹70,000.
    // It must be carried forward strictly in balanceCfNextMonth.igst, NOT in cgst!
    expect(result.setoff.balanceCfNextMonth.igst).toBe(70000);
    expect(result.setoff.balanceCfNextMonth.cgst).toBe(0);
    expect(result.setoff.balanceCfNextMonth.sgst).toBe(0);
  });
});
