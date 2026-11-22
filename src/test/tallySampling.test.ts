import { describe, it, expect } from 'vitest';
import { getTallyPeriodDates, pullAndSampleFromTally, TALLY_REGISTER_MAPPING } from '../lib/tallySampling';
import { type VouchingScopeRegister } from '../lib/monthlyAuditEngine';

describe('Tally SA 530 Sampling & Vouching Scope Tests', () => {
    it('Date Period Helper: calculates correct Tally dates for standard and leap years', () => {
        // Standard April
        const apr = getTallyPeriodDates('2026-27', 'April');
        expect(apr.fromDate).toBe('20260401');
        expect(apr.toDate).toBe('20260430');
        expect(apr.displayPeriod).toContain('01-Apr-2026');

        // Leap Year February 2028
        const feb28 = getTallyPeriodDates('2027-28', 'February');
        expect(feb28.fromDate).toBe('20280201');
        expect(feb28.toDate).toBe('20280229');

        // Non-Leap Year February 2027
        const feb27 = getTallyPeriodDates('2026-27', 'February');
        expect(feb27.fromDate).toBe('20270201');
        expect(feb27.toDate).toBe('20270228');

        // Full year fallback
        const fy = getTallyPeriodDates('2026-27', 'All Months');
        expect(fy.fromDate).toBe('20260401');
        expect(fy.toDate).toBe('20270331');
    });

    it('Tally Register Mapping: contains all 5 core audit registers', () => {
        expect(TALLY_REGISTER_MAPPING.sales.baseType).toBe('Sales');
        expect(TALLY_REGISTER_MAPPING.purchase.baseType).toBe('Purchase');
        expect(TALLY_REGISTER_MAPPING.journal.baseType).toBe('Journal');
        expect(TALLY_REGISTER_MAPPING.debit_credit_notes.baseType).toBe('Credit Note');
        expect(TALLY_REGISTER_MAPPING.bank_loans.baseType).toBe('Payment');
    });

    it('Pull and Sample Engine: generates stratified samples across all 5 registers and updates totals', async () => {
        const initialRegisters: VouchingScopeRegister[] = [
            { key: 'sales', registerName: 'Sales Register', samplingTechnique: 'Stratified Sampling', vouched: 'Partial', sampleChecked: '0%', totalVouchers: 0, auditedAmount: 0, remarks: '' },
            { key: 'purchase', registerName: 'Purchase Register', samplingTechnique: 'Stratified Sampling', vouched: 'Partial', sampleChecked: '0%', totalVouchers: 0, auditedAmount: 0, remarks: '' },
            { key: 'journal', registerName: 'Journal Register', samplingTechnique: '100% Comprehensive Examination', vouched: 'Yes', sampleChecked: '0%', totalVouchers: 0, auditedAmount: 0, remarks: '' },
            { key: 'debit_credit_notes', registerName: 'Debit & Credit Notes', samplingTechnique: '100% Comprehensive Examination', vouched: 'Yes', sampleChecked: '0%', totalVouchers: 0, auditedAmount: 0, remarks: '' },
            { key: 'bank_loans', registerName: 'Bank & Loan Statements', samplingTechnique: 'Systematic Selection (Interval Sampling)', vouched: 'Yes', sampleChecked: '0%', totalVouchers: 0, auditedAmount: 0, remarks: '' }
        ];

        const result = await pullAndSampleFromTally({
            auditId: 'audit_test_101',
            clientGstin: '27AAGCD4105L1ZO',
            clientName: 'DYP INFRAPROJECTS PVT LTD',
            fy: '2026-27',
            month: 'April',
            existingRegisters: initialRegisters
        });

        expect(result).toBeDefined();
        expect(result.samples.length).toBeGreaterThan(0);
        expect(result.updatedRegisters.length).toBe(5);

        // Sales Register verification
        const salesReg = result.updatedRegisters.find(r => r.key === 'sales');
        expect(salesReg).toBeDefined();
        expect(salesReg!.totalVouchers).toBeGreaterThan(0);
        expect(salesReg!.auditedAmount).toBeGreaterThan(0);
        expect(salesReg!.sampleChecked).toContain('%');

        // Check sample records structure
        const sample1 = result.samples[0];
        expect(sample1.id).toBeDefined();
        expect(sample1.auditId).toBe('audit_test_101');
        expect(sample1.status).toBe('Pending');
        expect(sample1.voucherNumber).toBeDefined();
        expect(sample1.partyName).toBeDefined();
        expect(sample1.amount).toBeGreaterThan(0);
        expect(sample1.stratum).toBeDefined();
    });
});

