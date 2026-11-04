import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { generateMonthlyAuditPdf } from '../lib/monthlyAuditPdf';
import { autoPopulateMonthlyAudit } from '../lib/monthlyAuditEngine';
import type { MonthlyAuditExportBundle } from '../lib/monthlyAuditExcel';

describe('Suite 08: Monthly Audit Executive Client PDF Generator', () => {

    it('generates a multi-page audit-grade corporate PDF with 5 pages and valid base64 output', async () => {
        const autoResult = await autoPopulateMonthlyAudit({
            clientGstin: '27AAGCD4105L1ZO',
            clientName: 'DYP INFRAPROJECTS PRIVATE LIMITED',
            fy: '2025-26',
            month: 'October',
            existingGstData: {
                r1Turnover: 2500000,
                gstr3bTurnover: 2000000,
                twoBPurchases: 1800000,
                twoBTax: 324000
            }
        });

        const bundle: MonthlyAuditExportBundle = {
            header: {
                ...autoResult.header,
                auditStatus: 'APPROVED',
                preparedBy: 'Audit Associate',
                reviewedBy: 'Lead Engagement Article',
                turnoverVariance: 500000,
                firmName: '',
                membershipNo: '',
                firmRegistrationNo: '',
                engagementRef: 'AUD/2025-26/OCT-01',
                auditType: 'Monthly Statutory & Internal Audit',
                auditStartDate: '2025-11-01',
                auditEndDate: '2025-11-05'
            },
            checklists: autoResult.checklists,
            verification: {
                ...autoResult.verification,
                sales: {
                    ...autoResult.verification.sales,
                    booksTurnover: 2500000,
                    r1Turnover: 2500000,
                    gstr3bTurnover: 2000000,
                    taxBooks: 450000,
                    taxR1: 450000,
                    tax3b: 360000,
                    turnoverDifference: 500000,
                    taxDifference: 90000,
                    isDrc01bTriggered: true
                },
                purchase: {
                    ...autoResult.verification.purchase,
                    booksTax: 324000,
                    twoBTax: 324000,
                    tax3b: 324000,
                    eligibleItcClaimable: 279000,
                    isDrc01cTriggered: false,
                    sec16_4_RiskCount: 2,
                    sec17_5_BlockedItcAmount: 45000
                },
                cashCompliance: {
                    ...autoResult.verification.cashCompliance,
                    cashDaybookTotal: 485000,
                    singleDayPaymentsOver10kCount: 1,
                    singleDayPaymentsOver10kAmount: 25000,
                    negativeCashDaysCount: 0,
                    closingProvisionsDone: true,
                    openingProvisionsReversed: true
                },
                labor: {
                    ...autoResult.verification.labor,
                    grossWages: 1250000,
                    pfEmployeesDeduction: 150000,
                    pfEmployersContribution: 150000,
                    esicEmployeesDeduction: 9375,
                    esicEmployersContribution: 40625,
                    isPfDelayedSec36_1_va: false,
                    isEsicDelayedSec36_1_va: false,
                    permanentDisallowanceExposure: 0
                },
                bankLoans: {
                    ...autoResult.verification.bankLoans,
                    facilities: [
                        { facilityType: 'Cash Credit / OD', name: 'HDFC Bank CC A/c #9102', balance: 4250000, status: 'Match', comment: 'BRS verified, interest serviced' },
                        { facilityType: 'Current Account', name: 'ICICI Bank Current #4410', balance: 1184500, status: 'Match', comment: 'Statements reconciled' },
                        { facilityType: 'Term Loan', name: 'SBI Project Loan #0092', balance: 8500000, status: 'Match', comment: 'EMI servicing verified' }
                    ]
                },
                rocLoans: {
                    ...autoResult.verification.rocLoans,
                    loans: [
                        { lenderName: 'HDFC Bank Ltd', category: 'Working Capital / CC', sanctionedAmount: 5000000, chargeStatus: 'Charge Created [CHG-1 Filed]', isCashReceipt: false, remarks: 'MCA SRN: R84920194' },
                        { lenderName: 'State Bank of India', category: 'Secured Term Loan', sanctionedAmount: 10000000, chargeStatus: 'Charge Created [CHG-1 Filed]', isCashReceipt: false, remarks: 'MCA SRN: R72910481' }
                    ]
                }
            },
            observations: [
                {
                    id: 'OBS-01',
                    auditId: 'audit_101',
                    clientGstin: '27AAGCD4105L1ZO',
                    sectionKey: 'sales',
                    title: 'DRC-01B Notice Risk on Outward Tax Variance',
                    description: 'Outward tax in GSTR-1 (₹4,50,000) exceeds GSTR-3B (₹3,60,000) by ₹90,000 for October.',
                    severity: 'Critical',
                    riskCategory: 'GST Discrepancy',
                    financialExposure: 90000,
                    auditorRecommendation: 'Deposit differential tax via Form DRC-03 or file rectification in November GSTR-3B return to prevent portal DRC-01B lock.',
                    managementResponse: 'Agreed. Finance team has scheduled DRC-03 tax payment before 20th November.',
                    status: 'Open',
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                },
                {
                    id: 'OBS-02',
                    auditId: 'audit_101',
                    clientGstin: '27AAGCD4105L1ZO',
                    sectionKey: 'cash',
                    title: 'Section 40A(3) Single-Day Cash Payment Disallowance',
                    description: 'Cash payment of ₹25,000 made to Shri Sai Transporters for freight on 14-Oct-2025 exceeding ₹10,000 statutory limit.',
                    severity: 'High',
                    riskCategory: 'Income Tax Violation',
                    financialExposure: 25000,
                    auditorRecommendation: 'Disallow expenditure in Tax Audit Form 3CD Clause 21(d) and add back to total taxable income.',
                    managementResponse: 'Noted. Strictly instruct site accounts to make all transporter payments via banking channel.',
                    status: 'Open',
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                }
            ],
            pendingPoints: [
                {
                    id: 'PT-01',
                    clientGstin: '27AAGCD4105L1ZO',
                    clientName: 'DYP INFRAPROJECTS PRIVATE LIMITED',
                    originAuditId: 'audit_100',
                    originFy: '2025-26',
                    originMonth: 'September',
                    pointTitle: 'Fixed Assets Invoices physical verification & store stamp',
                    pointDescription: 'Three plant & machinery capital invoices require physical store receipt vouchers and serial tag verification.',
                    category: 'Internal Controls',
                    severity: 'Medium',
                    status: 'In Progress',
                    assignedTo: 'Store & Asset Manager',
                    targetDate: '15th November 2025',
                    resolutionRemarks: '2 of 3 invoices stamped; awaiting final equipment tag from site.',
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                }
            ]
        };

        const result = generateMonthlyAuditPdf(bundle, { autoDownload: false });

        expect(result).toBeDefined();
        expect(result.doc).toBeDefined();
        expect(result.doc.getNumberOfPages()).toBe(3);
        expect(result.fileName).toContain('Monthly_Audit_Report_DYP_INFRAPROJECTS');
        expect(result.fileName.endsWith('.pdf')).toBe(true);
        expect(result.base64.length).toBeGreaterThan(1000);

        // Write sample file to scratch directory for client demonstration
        const samplePath = path.resolve(process.cwd(), 'scratch', 'Sample_Corporate_Monthly_Audit_Report.pdf');
        fs.writeFileSync(samplePath, Buffer.from(result.base64, 'base64'));
        expect(fs.existsSync(samplePath)).toBe(true);
        expect(fs.statSync(samplePath).size).toBeGreaterThan(5000);
    });
});
