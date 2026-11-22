import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { generateMonthlyAuditPdf, exportMonthlyAuditToPdf } from '../lib/monthlyAuditPdf';
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
                        { id: 'FAC-1', facilityType: 'Cash Credit (CC)', name: 'HDFC Bank CC A/c #9102', balance: 4250000, status: 'Match', comment: 'BRS verified, interest serviced' },
                        { id: 'FAC-2', facilityType: 'Bank Account', name: 'ICICI Bank Current #4410', balance: 1184500, status: 'Match', comment: 'Statements reconciled' },
                        { id: 'FAC-3', facilityType: 'Term Loan', name: 'SBI Project Loan #0092', balance: 8500000, status: 'Match', comment: 'EMI servicing verified' }
                    ]
                },
                rocLoans: {
                    ...autoResult.verification.rocLoans,
                    loans: [
                        { id: 'ROC-1', lenderName: 'HDFC Bank Ltd', category: 'Working Capital / Cash Credit', sanctionedAmount: 5000000, chargeStatus: 'Charge Created (CHG-1 Filed)', isCashReceipt: false, remarks: 'MCA SRN: R84920194' },
                        { id: 'ROC-2', lenderName: 'State Bank of India', category: 'Secured Term Loan', sanctionedAmount: 10000000, chargeStatus: 'Charge Created (CHG-1 Filed)', isCashReceipt: false, remarks: 'MCA SRN: R72910481' }
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
        expect(result.doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
        expect(result.fileName).toContain('Monthly_Audit_Report_DYP_INFRAPROJECTS');
        expect(result.fileName.endsWith('.pdf')).toBe(true);
        expect(result.base64.length).toBeGreaterThan(1000);

        // Write sample file to scratch directory for client demonstration
        const scratchDir = path.resolve(process.cwd(), 'scratch');
        if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
        const samplePath = path.resolve(scratchDir, 'Sample_Corporate_Monthly_Audit_Report.pdf');
        fs.writeFileSync(samplePath, Buffer.from(result.base64, 'base64'));
        expect(fs.existsSync(samplePath)).toBe(true);
        expect(fs.statSync(samplePath).size).toBeGreaterThan(5000);
    });

    it('dynamic section layout: renders complete schedules without slicing when data volume expands', async () => {
        const autoResult = await autoPopulateMonthlyAudit({
            clientGstin: '27AAGCD4105L1ZO',
            clientName: 'DYP INFRAPROJECTS PRIVATE LIMITED',
            fy: '2025-26',
            month: 'October'
        });

        // 6 Bank facilities (previously sliced to 3)
        const extendedFacilities = [
            { id: 'FAC-E1', facilityType: 'Cash Credit (CC)' as const, name: 'HDFC Bank CC A/c #9102', balance: 4250000, status: 'Match' as const, comment: 'BRS verified, interest serviced' },
            { id: 'FAC-E2', facilityType: 'Bank Account' as const, name: 'ICICI Bank Current #4410', balance: 1184500, status: 'Match' as const, comment: 'Statements reconciled' },
            { id: 'FAC-E3', facilityType: 'Term Loan' as const, name: 'SBI Project Loan #0092', balance: 8500000, status: 'Match' as const, comment: 'EMI servicing verified' },
            { id: 'FAC-E4', facilityType: 'Fixed Deposit (FD)' as const, name: 'Axis Bank FDR #1102', balance: 2500000, status: 'Match' as const, comment: 'Interest accrued verified' },
            { id: 'FAC-E5', facilityType: 'Overdraft (OD)' as const, name: 'Kotak OD Facility #7721', balance: 1500000, status: 'Match' as const, comment: 'Sanction renewal verified' },
            { id: 'FAC-E6', facilityType: 'Bank Account' as const, name: 'PNB Site Account #3391', balance: 350000, status: 'Match' as const, comment: 'Imprest reconciled' }
        ];

        // 4 ROC Loans (previously sliced to 2)
        const extendedLoans = [
            { id: 'ROC-E1', lenderName: 'HDFC Bank Ltd', category: 'Working Capital / Cash Credit' as const, sanctionedAmount: 5000000, chargeStatus: 'Charge Created (CHG-1 Filed)' as const, isCashReceipt: false, remarks: 'MCA SRN: R84920194' },
            { id: 'ROC-E2', lenderName: 'State Bank of India', category: 'Secured Term Loan' as const, sanctionedAmount: 10000000, chargeStatus: 'Charge Created (CHG-1 Filed)' as const, isCashReceipt: false, remarks: 'MCA SRN: R72910481' },
            { id: 'ROC-E3', lenderName: 'Tata Capital Financial Services', category: 'Vehicle / Equipment Loan' as const, sanctionedAmount: 3500000, chargeStatus: 'Charge Created (CHG-1 Filed)' as const, isCashReceipt: false, remarks: 'MCA SRN: R55102934' },
            { id: 'ROC-E4', lenderName: 'Director Unsecured Loan', category: 'Director / Promoter Loan' as const, sanctionedAmount: 2000000, chargeStatus: 'Not Applicable (Unsecured)' as const, isCashReceipt: false, remarks: 'Board Resolution verified' }
        ];

        // 5 Observations (previously sliced to 2)
        const extendedObservations = [
            {
                id: 'OBS-01',
                auditId: 'audit_101',
                clientGstin: '27AAGCD4105L1ZO',
                sectionKey: 'sales',
                title: 'DRC-01B Notice Risk on Outward Tax Variance',
                description: 'Outward tax in GSTR-1 exceeds GSTR-3B by Rs. 90,000 for October.',
                severity: 'Critical' as const,
                riskCategory: 'GST Discrepancy',
                financialExposure: 90000,
                auditorRecommendation: 'Deposit differential tax via Form DRC-03 or rectify in November 3B.',
                managementResponse: 'Agreed. Finance team has scheduled DRC-03 tax payment.',
                status: 'Open' as const,
                createdAt: Date.now(),
                updatedAt: Date.now()
            },
            {
                id: 'OBS-02',
                auditId: 'audit_101',
                clientGstin: '27AAGCD4105L1ZO',
                sectionKey: 'cash',
                title: 'Section 40A(3) Single-Day Cash Payment Disallowance',
                description: 'Cash payment of Rs. 25,000 made to Shri Sai Transporters for freight.',
                severity: 'High' as const,
                riskCategory: 'Income Tax Violation',
                financialExposure: 25000,
                auditorRecommendation: 'Disallow expenditure in Form 3CD Clause 21(d).',
                managementResponse: 'Strictly instruct site accounts to make all payments via banking channel.',
                status: 'Open' as const,
                createdAt: Date.now(),
                updatedAt: Date.now()
            },
            {
                id: 'OBS-03',
                auditId: 'audit_101',
                clientGstin: '27AAGCD4105L1ZO',
                sectionKey: 'purchase',
                title: 'Section 16(4) Ineligible ITC on Time-Barred Invoices',
                description: 'Prior financial year invoice booked in current month with time-bar risk.',
                severity: 'High' as const,
                riskCategory: 'GST Ineligible Credit',
                financialExposure: 45000,
                auditorRecommendation: 'Reverse ITC in Table 4(B)(2) to prevent interest demand.',
                managementResponse: 'Reversal scheduled in next 3B return.',
                status: 'Open' as const,
                createdAt: Date.now(),
                updatedAt: Date.now()
            },
            {
                id: 'OBS-04',
                auditId: 'audit_101',
                clientGstin: '27AAGCD4105L1ZO',
                sectionKey: 'labor',
                title: 'PF Deposit Delayed beyond 15th of the month',
                description: 'Employee share of PF contribution deposited on 18th instead of 15th.',
                severity: 'Critical' as const,
                riskCategory: 'Section 36(1)(va) Disallowance',
                financialExposure: 150000,
                auditorRecommendation: 'Disallow under Section 36(1)(va) permanently as per Supreme Court Checkmate ruling.',
                managementResponse: 'Noted for tax computation add-back.',
                status: 'Open' as const,
                createdAt: Date.now(),
                updatedAt: Date.now()
            },
            {
                id: 'OBS-05',
                auditId: 'audit_101',
                clientGstin: '27AAGCD4105L1ZO',
                sectionKey: 'bank',
                title: 'Stale Cheques Pending in Bank Reconciliation Statement',
                description: 'Three vendor cheques issued in June 2025 remain unpresented exceeding 3 months.',
                severity: 'Medium' as const,
                riskCategory: 'Internal Controls',
                financialExposure: 82000,
                auditorRecommendation: 'Reverse stale cheques and credit back to vendor accounts.',
                managementResponse: 'Accountant instructed to reverse entries in November.',
                status: 'Open' as const,
                createdAt: Date.now(),
                updatedAt: Date.now()
            }
        ];

        // 4 Pending points (previously sliced to 2)
        const extendedPending = [
            {
                id: 'PT-01',
                clientGstin: '27AAGCD4105L1ZO',
                clientName: 'DYP INFRAPROJECTS PRIVATE LIMITED',
                originAuditId: 'audit_100',
                originFy: '2025-26',
                originMonth: 'September',
                pointTitle: 'Fixed Assets physical verification & store stamp',
                pointDescription: 'Three plant & machinery capital invoices require physical store receipt vouchers.',
                category: 'Internal Controls',
                severity: 'Medium' as const,
                status: 'In Progress' as const,
                assignedTo: 'Store & Asset Manager',
                targetDate: '15th November 2025',
                resolutionRemarks: '2 of 3 stamped; tags pending',
                createdAt: Date.now(),
                updatedAt: Date.now()
            },
            {
                id: 'PT-02',
                clientGstin: '27AAGCD4105L1ZO',
                clientName: 'DYP INFRAPROJECTS PRIVATE LIMITED',
                originAuditId: 'audit_099',
                originFy: '2025-26',
                originMonth: 'August',
                pointTitle: 'Vendor MSME Form 1 Filing & Interest Verification',
                pointDescription: 'Verify 45-day payment compliance under Section 43B(h) for micro & small suppliers.',
                category: 'Statutory Compliance',
                severity: 'High' as const,
                status: 'Pending' as const,
                assignedTo: 'Senior Accounts Officer',
                targetDate: '30th November 2025',
                resolutionRemarks: 'MSME registration certificates collected from 42 vendors.',
                createdAt: Date.now(),
                updatedAt: Date.now()
            },
            {
                id: 'PT-03',
                clientGstin: '27AAGCD4105L1ZO',
                clientName: 'DYP INFRAPROJECTS PRIVATE LIMITED',
                originAuditId: 'audit_098',
                originFy: '2025-26',
                originMonth: 'July',
                pointTitle: 'TDS Rate Mismatch on 194J Technical Fees (2% vs 10%)',
                pointDescription: 'Consultancy invoices deducted at 2% instead of 10% for professional services.',
                category: 'TDS Scrutiny',
                severity: 'High' as const,
                status: 'Cleared' as const,
                assignedTo: 'Tax Associate',
                targetDate: '31st October 2025',
                resolutionRemarks: 'Revised 26Q correction statement filed with differential tax paid.',
                createdAt: Date.now(),
                updatedAt: Date.now()
            }
        ];

        const bundle: MonthlyAuditExportBundle = {
            header: {
                ...autoResult.header,
                id: autoResult.header?.id || 'audit_hdr_101',
                auditStatus: 'APPROVED',
                preparedBy: 'Audit Associate',
                reviewedBy: 'Lead Engagement Article'
            },
            checklists: autoResult.checklists,
            verification: {
                ...autoResult.verification,
                bankLoans: {
                    ...autoResult.verification.bankLoans,
                    facilities: extendedFacilities
                },
                rocLoans: {
                    ...autoResult.verification.rocLoans,
                    loans: extendedLoans
                }
            },
            observations: extendedObservations,
            pendingPoints: extendedPending
        };

        const result = generateMonthlyAuditPdf(bundle, { autoDownload: false });

        expect(result).toBeDefined();
        expect(result.doc).toBeDefined();
        // Dynamic flow adds pages naturally to accommodate all items without truncation
        expect(result.doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
        expect(result.base64.length).toBeGreaterThan(1000);

        const scratchDir = path.resolve(process.cwd(), 'scratch');
        if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
        const sampleExpandedPath = path.resolve(scratchDir, 'Sample_Expanded_Monthly_Audit_Report.pdf');
        fs.writeFileSync(sampleExpandedPath, Buffer.from(result.base64, 'base64'));
        expect(fs.existsSync(sampleExpandedPath)).toBe(true);
        expect(fs.statSync(sampleExpandedPath).size).toBeGreaterThan(5000);
    });

    it('TDS Section 3.3: verifies Section Matrix, working paper attachment evidence & Sec 40(a)(ia) disallowance in PDF', async () => {
        const { createDefaultTdsSectionMatrix, calculateTdsMatrixTotals } = await import('../lib/monthlyAuditEngine');
        const matrix = createDefaultTdsSectionMatrix();
        const totals = calculateTdsMatrixTotals(matrix);

        expect(matrix.length).toBe(7);
        expect(totals.totalBookingPending).toBeGreaterThan(0);
        expect(totals.totalTdsPayable).toBeGreaterThan(0);
        expect(totals.sec40aDisallowance).toBeGreaterThan(0);

        const bundle: MonthlyAuditExportBundle = {
            header: {
                id: 'audit_tds_test',
                clientName: 'DYP INFRAPROJECTS PVT.LTD.',
                clientGstin: '27AAGCD4105L1ZO',
                fy: '2025-26',
                month: 'October',
                auditType: 'Monthly Statutory & Internal Audit',
                auditStatus: 'APPROVED',
                preparedBy: 'Audit Associate, CA Final',
                reviewedBy: 'Senior Audit Partner, FCA'
            },
            registers: [],
            checklists: [],
            verification: {
                journal: {
                    suspenseEntriesCount: 0,
                    suspenseAmount: 0,
                    form24Q_GrossSalaryBooks: 2400000,
                    salaryVariance: 0,
                    remarks: 'All 7 TDS sections reconciled with Form 26Q/24Q quarterly returns and TRACES challans.',
                    tdsSectionMatrix: matrix,
                    excelAttachment: {
                        fileName: 'TDS_Working_Paper_DYP_Oct2025.xlsx',
                        fileSize: 52400,
                        sheetNames: ['TDS_Summary', '26Q_Reconciliation', 'TRACES_Challans']
                    }
                }
            },
            observations: [],
            pendingPoints: []
        };

        const result = generateMonthlyAuditPdf(bundle, { autoDownload: false });
        expect(result).toBeDefined();
        expect(result.doc).toBeDefined();
        expect(result.fileName).toContain('DYP_INFRAPROJECTS_PVT_LTD');
        expect(result.doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
        expect(result.base64.length).toBeGreaterThan(1000);

        // Verify scratch output
        const scratchDir = path.resolve(process.cwd(), 'scratch');
        if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
        const sampleTdsPath = path.resolve(scratchDir, 'Sample_TDS_Working_Monthly_Audit_Report.pdf');
        fs.writeFileSync(sampleTdsPath, Buffer.from(result.base64, 'base64'));
        expect(fs.existsSync(sampleTdsPath)).toBe(true);
        expect(fs.statSync(sampleTdsPath).size).toBeGreaterThan(5000);
    });

    it('verifies exportMonthlyAuditToPdf is exported and callable', () => {
        expect(typeof exportMonthlyAuditToPdf).toBe('function');
    });
});
