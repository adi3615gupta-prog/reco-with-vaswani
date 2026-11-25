import { describe, it, expect } from 'vitest';
import { reconcile, InvoiceRecord } from '../lib/reconciliation';
import { optimizeRule88ASetOff } from '../lib/rule88aOptimizer';
import { reconcileEwbWithGstr1, EwbRecord } from '../lib/ewbRecoEngine';

describe('TaxPower GST Capabilities Integration (Plan 25-04)', () => {
  describe('Configurable Reconciliation Settings Knobs', () => {
    const prRecords: InvoiceRecord[] = [
      {
        supplierName: 'Alpha Tech',
        gstin: '27AAGCD4105L1ZO',
        invoiceNo: 'INV/2026/001',
        invoiceDate: '15/09/2026',
        igst: 0,
        cgst: 9000,
        sgst: 9000,
        source: 'PR'
      }
    ];

    it('respects configurable tolerance knob', () => {
      // Difference of ₹4 (exceeds default tolerance 2, but within tolerance 5)
      const twoBRecords: InvoiceRecord[] = [
        {
          supplierName: 'Alpha Tech',
          gstin: '27AAGCD4105L1ZO',
          invoiceNo: 'INV/2026/001',
          invoiceDate: '15/09/2026',
          igst: 0,
          cgst: 9004, // diff ₹4
          sgst: 9004, // diff ₹4
          source: '2B'
        }
      ];

      // Default tolerance ₹2 -> should NOT match as Perfect Match, but Value Mismatch
      const resDefault = reconcile(prRecords, twoBRecords, { tolerance: 2 });
      expect(resDefault[0].status).toBe('Value Mismatch');

      // Increased tolerance ₹5 -> should match as within tolerance
      const resRelaxed = reconcile(prRecords, twoBRecords, { tolerance: 5 });
      expect(resRelaxed[0].status).toBe('Perfect Match');
    });

    it('toggles inclusion of prior FY invoices via considerPreviousYearInvoices', () => {
      const currentYearPr: InvoiceRecord[] = [
        {
          supplierName: 'Beta Corp',
          gstin: '27AAGCD4105L1ZO',
          invoiceNo: 'INV-100',
          invoiceDate: '10/05/2026', // FY 2026-27
          igst: 1000,
          cgst: 0,
          sgst: 0,
          source: 'PR'
        }
      ];

      const priorYear2B: InvoiceRecord[] = [
        {
          supplierName: 'Beta Corp',
          gstin: '27AAGCD4105L1ZO',
          invoiceNo: 'INV-100',
          invoiceDate: '10/02/2025', // FY 2024-25 (Prior Year)
          igst: 1000,
          cgst: 0,
          sgst: 0,
          source: '2B'
        }
      ];

      // Default: considerPreviousYearInvoices = false -> Prior FY is isolated
      const resDefault = reconcile(currentYearPr, priorYear2B, { considerPreviousYearInvoices: false });
      const priorResult = resDefault.find(r => r.status === 'Prior FY (Excluded)');
      expect(priorResult).toBeDefined();

      // Enabled: considerPreviousYearInvoices = true -> Matches across FY
      const resIncluded = reconcile(currentYearPr, priorYear2B, { considerPreviousYearInvoices: true });
      const matchedResult = resIncluded.find(r => r.status.includes('Matched') || r.status === 'Perfect Match');
      expect(matchedResult).toBeDefined();
    });

    it('respects documentNoMatchType exact setting', () => {
      const pr: InvoiceRecord[] = [
        {
          supplierName: 'Gamma Supplies',
          gstin: '27AAGCD4105L1ZO',
          invoiceNo: 'INV/0045',
          invoiceDate: '10/09/2026',
          igst: 500,
          cgst: 0,
          sgst: 0,
          source: 'PR'
        }
      ];

      // In 2B without prefix and without leading zero: "45"
      const twoB: InvoiceRecord[] = [
        {
          supplierName: 'Gamma Supplies',
          gstin: '27AAGCD4105L1ZO',
          invoiceNo: '45',
          invoiceDate: '10/09/2026',
          igst: 500,
          cgst: 0,
          sgst: 0,
          source: '2B'
        }
      ];

      // When documentNoMatchType is 'exact', coreSerial matching is disabled
      const resExact = reconcile(pr, twoB, { documentNoMatchType: 'exact' });
      expect(resExact.find(r => r.status === 'Not in 2B')).toBeDefined();

      // Default coreSerial -> resolves match
      const resFuzzy = reconcile(pr, twoB, { documentNoMatchType: 'coreSerial' });
      expect(resFuzzy.find(r => r.status.includes('Matched') || r.status === 'Perfect Match')).toBeDefined();
    });
  });

  describe('Rule 88A Mathematical Cash Liability Set-Off Optimizer', () => {
    it('exhausts IGST credit fully per statutory proviso and minimizes cash payout', () => {
      // Scenario:
      // IGST Liability: ₹10,000, CGST Liability: ₹8,000, SGST Liability: ₹8,000
      // IGST Credit: ₹20,000, CGST Credit: ₹2,000, SGST Credit: ₹6,000
      // Total Cash should be 0, and IGST credit MUST be fully utilized (balIgst = 0).
      const liability = { igst: 10000, cgst: 8000, sgst: 8000, cess: 0 };
      const itc = { igst: 20000, cgst: 2000, sgst: 6000, cess: 0 };

      const result = optimizeRule88ASetOff(liability, itc);

      expect(result.utilization.igst_igst_amt).toBe(10000);
      // IGST credit fully utilized across CGST and SGST
      expect(result.utilization.igst_cgst_amt + result.utilization.igst_sgst_amt).toBe(10000);
      expect(result.closingItc.igst).toBe(0); // Proviso: IGST credit must be 0

      // Total Cash Tax Payable MUST be 0
      expect(result.cashPayable.totalCash).toBe(0);
      expect(result.closingItc.totalClosing).toBe(2000);
    });

    it('correctly calculates net cash payable when credits are insufficient', () => {
      const liability = { igst: 5000, cgst: 10000, sgst: 10000, cess: 0 };
      const itc = { igst: 2000, cgst: 3000, sgst: 3000, cess: 0 };

      const result = optimizeRule88ASetOff(liability, itc);
      // Total liability = 25000, Total ITC = 8000 -> Total Cash = 17000
      expect(result.cashPayable.totalCash).toBe(17000);
      expect(result.cashPayable.igst).toBe(3000); // 5000 - 2000
      expect(result.cashPayable.cgst).toBe(7000); // 10000 - 3000
      expect(result.cashPayable.sgst).toBe(7000); // 10000 - 3000
    });
  });

  describe('E-Way Bill vs GSTR-1 Outward Supply Cross-Checker', () => {
    const gstr1Invoices = [
      { inum: 'INV-101', idt: '05-09-2026', val: 120000, pos: '27', ctin: '27AAGCD4105L1ZO' }, // Over 50k -> EWB required
      { inum: 'INV-102', idt: '06-09-2026', val: 30000, pos: '27', ctin: '27AAGCD4105L1ZO' },  // Under 50k -> EWB not mandatory
      { inum: 'INV-103', idt: '07-09-2026', val: 80000, pos: '24', ctin: '24AAGCD4105L1ZO' }   // Value mismatch
    ];

    const ewbRecords: EwbRecord[] = [
      {
        ewbNo: '111222333444',
        docNo: 'INV-101',
        totalValue: 120000,
        status: 'ACT'
      },
      {
        ewbNo: '555666777888',
        docNo: 'INV-103',
        totalValue: 75000, // Diff of 5000 vs GSTR-1
        status: 'ACT'
      },
      {
        ewbNo: '999000111222',
        docNo: 'INV-999', // EWB exists on portal, but missing from GSTR-1
        totalValue: 95000,
        status: 'ACT'
      }
    ];

    it('matches valid EWBs and flags missing EWBs, un-reported sales, and value mismatches', () => {
      const { results, summary } = reconcileEwbWithGstr1(ewbRecords, gstr1Invoices);

      expect(summary.totalEwbCount).toBe(3);
      expect(summary.totalGstr1Count).toBe(3);

      // 1. INV-101 perfectly matched
      const matched = results.find(r => r.ewbRecord?.docNo === 'INV-101');
      expect(matched?.status).toBe('Matched');

      // 2. INV-103 value mismatch
      const mismatch = results.find(r => r.ewbRecord?.docNo === 'INV-103');
      expect(mismatch?.status).toBe('Value Mismatch');
      expect(mismatch?.diffValue).toBe(5000);

      // 3. INV-999 missing in GSTR-1
      const missingInR1 = results.find(r => r.ewbRecord?.docNo === 'INV-999');
      expect(missingInR1?.status).toBe('Missing in GSTR-1 (Suppression Risk)');

      // 4. INV-102 under ₹50k is not flagged as missing EWB
      const underThreshold = results.find(r => r.gstr1Invoice?.inum === 'INV-102');
      expect(underThreshold?.status).toBe('Matched');
    });
  });
});
