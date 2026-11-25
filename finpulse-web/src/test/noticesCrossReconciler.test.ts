import { describe, it, expect } from 'vitest';
import { reconcileNoticeDiscrepancy } from '../../src/lib/noticeReconciliation';

describe('GST Notices Deterministic Multi-Return Cross-Reconciler (NOTICES-04, T-12-04)', () => {
    it('should identify timing difference when supplier reports in subsequent 2B period', () => {
        const input = {
            noticeId: 'N-101',
            referenceNo: 'ZA270324001',
            gstin: '27AABCS1429B1Z1',
            financialYear: '2023-24',
            taxPeriod: 'Q2',
            totalDemanded: 25000,
            allegedInvoices: [
                {
                    invoiceNo: 'INV/2023/889',
                    invoiceDate: '2023-08-15',
                    supplierGstin: '27AABCU9603R1ZM',
                    supplierName: 'ABC Steel Ltd',
                    taxableValue: 138888,
                    totalTax: 25000
                }
            ]
        };

        const localReturnsData = {
            twoBInvoices: [
                {
                    ctin: '27AABCU9603R1ZM',
                    supplier_name: 'ABC Steel Ltd',
                    inum: 'INV/2023/889',
                    txval: 138888,
                    igst: 25000,
                    return_period: 'November 2023'
                }
            ]
        };

        const result = reconcileNoticeDiscrepancy(input, localReturnsData);

        expect(result.explainedAmount).toBe(25000);
        expect(result.unexplainedResidual).toBe(0);
        expect(result.explanations.length).toBe(1);
        expect(result.explanations[0].category).toBe('TIMING_DIFFERENCE');
        expect(result.invoiceLedger[0].twoBPeriod).toBe('November 2023');

        // Mathematical invariant: explained + residual === totalDemanded
        expect(result.explainedAmount + result.unexplainedResidual).toBe(input.totalDemanded);
    });

    it('should apply Section 16(5) retrospective protection for FY 2017-18 to 2020-21', () => {
        const input = {
            noticeId: 'N-102',
            referenceNo: 'DRC01-1819',
            gstin: '27AABCS1429B1Z1',
            financialYear: '2018-19',
            taxPeriod: 'Annual',
            totalDemanded: 40000,
            allegedInvoices: [
                {
                    invoiceNo: 'TAX-0045',
                    invoiceDate: '2018-11-20',
                    supplierGstin: '27XYZU1234A1Z9',
                    supplierName: 'XYZ Enterprise',
                    taxableValue: 222222,
                    totalTax: 40000
                }
            ]
        };

        const result = reconcileNoticeDiscrepancy(input, { twoBInvoices: [] });

        expect(result.explainedAmount).toBe(40000);
        expect(result.unexplainedResidual).toBe(0);
        expect(result.explanations[0].category).toBe('SECTION_16_5_RELIEF');
        expect(result.explanations[0].statutoryGround).toContain('Section 16(5)');

        // Mathematical invariant: explained + residual === totalDemanded
        expect(result.explainedAmount + result.unexplainedResidual).toBe(input.totalDemanded);
    });

    it('should accurately partition explained vs unexplained variance without double-counting', () => {
        const input = {
            noticeId: 'N-103',
            referenceNo: 'DRC01-PARTIAL',
            gstin: '27AABCS1429B1Z1',
            financialYear: '2023-24',
            totalDemanded: 100000,
            allegedInvoices: [
                {
                    invoiceNo: 'MATCHED-1',
                    invoiceDate: '2023-05-10',
                    supplierGstin: '27SUPPLIER1A1Z1',
                    totalTax: 60000
                },
                {
                    invoiceNo: 'UNMATCHED-2',
                    invoiceDate: '2023-06-12',
                    supplierGstin: '27SUPPLIER2B2Z2',
                    totalTax: 40000
                }
            ]
        };

        const localReturnsData = {
            twoBInvoices: [
                {
                    ctin: '27SUPPLIER1A1Z1',
                    inum: 'MATCHED-1',
                    igst: 60000,
                    return_period: 'July 2023'
                }
            ]
        };

        const result = reconcileNoticeDiscrepancy(input, localReturnsData);

        expect(result.explainedAmount).toBe(60000);
        expect(result.unexplainedResidual).toBe(40000);
        expect(result.explainedAmount + result.unexplainedResidual).toBe(100000);
    });
});
