import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import {
    removeAllMergesFromWorkbook,
    generateMonthlyAuditWorkbook,
    generateMonthlyAuditBase64,
    type MonthlyAuditExportBundle
} from '../lib/monthlyAuditExcel';
import { autoPopulateMonthlyAudit } from '../lib/monthlyAuditEngine';

describe('Suite 08: Monthly Audit Excel Working Paper Exporter', () => {

    it('Sanitizer: removeAllMergesFromWorkbook strictly strips all merged cells', () => {
        const wb = XLSX.utils.book_new();
        const ws1 = XLSX.utils.aoa_to_sheet([
            ['Header A', 'Header B'],
            ['Val 1', 'Val 2']
        ]);
        ws1['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }
        ];

        const ws2 = XLSX.utils.aoa_to_sheet([['Single Cell']]);
        ws2['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }
        ];

        XLSX.utils.book_append_sheet(wb, ws1, 'Sheet1');
        XLSX.utils.book_append_sheet(wb, ws2, 'Sheet2');

        expect(ws1['!merges'].length).toBe(1);
        expect(ws2['!merges'].length).toBe(1);

        const sanitized = removeAllMergesFromWorkbook(wb);

        for (const sheetName of sanitized.SheetNames) {
            const sheet = sanitized.Sheets[sheetName];
            expect(sheet['!merges']).toBeDefined();
            expect(sheet['!merges']!.length).toBe(0);
        }
    });

    it('Sheets: generates all 8 standardized audit sheets with Zero Merges', async () => {
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
                preparedBy: 'Junior Auditor',
                reviewedBy: 'Senior Partner, CA',
                signOffDate: '2025-11-15'
            },
            checklists: autoResult.checklists,
            verification: {
                ...autoResult.verification,
                sales: {
                    ...autoResult.verification.sales,
                    excelAttachment: {
                        fileName: 'Client_Sales_Register_Oct25.xlsx',
                        fileSize: 45000
                    }
                },
                purchase: {
                    ...autoResult.verification.purchase,
                    excelAttachment: {
                        fileName: 'Detailed_GSTR2B_Working_Oct25.xlsx',
                        fileSize: 62000
                    }
                }
            },
            observations: [
                {
                    id: 1,
                    auditId: 101,
                    pointNumber: 'OBS-01',
                    section: 'Sales (Reco R1)',
                    riskSeverity: 'Critical',
                    riskCategory: 'GST Discrepancy',
                    amountInvolved: 90000,
                    voucherRef: 'GSTR-1 vs 3B Oct-2025',
                    title: 'DRC-01B Notice Risk on Sales Tax Mismatch',
                    description: 'R1 outward tax exceeds 3B outward tax by ₹90,000.',
                    implication: 'DRC-01B automated system scrutiny with portal interest demand.',
                    suggestedAction: 'Pay variance via DRC-03 or rectify in November 3B.',
                    managementResponse: 'Will be paid in next 3B return.',
                    status: 'Open'
                }
            ],
            pendingPoints: [
                {
                    id: 1,
                    auditId: 101,
                    pointNumber: 'PEND-01',
                    originMonth: 'September',
                    originFy: '2025-26',
                    category: 'TDS Pending',
                    severity: 'High',
                    title: 'Form 26Q Challan Verification Pending',
                    description: 'Pending BSR code verification for Q2 challan deposit.',
                    actionRequired: 'Verify challan in TRACES portal.',
                    assignedTo: 'Rahul Accountant',
                    targetDate: '2025-11-20',
                    status: 'Pending'
                }
            ]
        };

        const wb = generateMonthlyAuditWorkbook(bundle);

        const expectedSheets = [
            'Audit_Cover_&_Scope',
            'Profitability_Statement',
            'Verification_Checklist',
            'Sales_&_GST_Reco',
            'Purchase_&_2B_Reco',
            'Cash_&_Statutory_Check',
            'Current_Year_Observations',
            'Previous_Pending_Points',
            'Fixed_Assets_&_ROC'
        ];

        expect(wb.SheetNames).toEqual(expectedSheets);

        // Assert strictly zero merges across ALL 9 sheets
        for (const sheetName of wb.SheetNames) {
            const ws = wb.Sheets[sheetName];
            expect(ws).toBeDefined();
            const merges = ws['!merges'] || [];
            expect(merges.length, `Sheet "${sheetName}" must have 0 merges`).toBe(0);
        }

        // Verify Sheet 1 content (Cover & Scope)
        const coverWs = wb.Sheets['Audit_Cover_&_Scope'];
        expect(coverWs['A1'].v).toContain('MONTHLY AUDIT WORKING PAPER');
        expect(coverWs['A2'].v).toContain('DYP INFRAPROJECTS PRIVATE LIMITED');
        expect(coverWs['B6'].v).toBe('27AAGCD4105L1ZO');

        // Verify Sheet 2 content (Profitability Statement)
        const profWs = wb.Sheets['Profitability_Statement'];
        expect(profWs['A1'].v).toContain('DYP INFRAPROJECTS PRIVATE LIMITED');
        expect(profWs['A4'].v).toContain('Statement of Profit and loss');

        // Verify Sheet 3 content (Checklist)
        const chkWs = wb.Sheets['Verification_Checklist'];
        expect(chkWs['A1'].v).toContain('STANDARDIZED MONTHLY AUDIT VERIFICATION CHECKLIST');
        expect(chkWs['A4'].v).toBe('SR. NO.');

        // Verify Sheet 4 content (Sales & GST Reco - 12-Month Matrix)
        const salesWs = wb.Sheets['Sales_&_GST_Reco'];
        expect(salesWs['A1'].v).toContain('SALES REGISTER VS GST RETURNS RECONCILIATION');
        expect(salesWs['B8'].v).toContain('1. AS PER BOOKS (SALES REGISTER)');
        expect(salesWs['H8'].v).toContain('2. AS PER GSTR-1 (PORTAL OUTWARD)');
        expect(salesWs['N8'].v).toContain('3. BOOKS VS GSTR-1 (DIFFERENCE)');
        expect(salesWs['T8'].v).toContain('4. AS PER GSTR-3B (SUMMARY RETURN)');
        expect(salesWs['Z8'].v).toContain('5. BOOKS VS GSTR-3B (DIFFERENCE)');
        expect(salesWs['A10'].v).toBe('April');
        expect(salesWs['A21'].v).toBe('March');
        expect(salesWs['A22'].v).toBe('FULL FY TOTAL (APR - MAR)');

        // Verify Sheet 5 content (Purchase & 2B Reco - 12-Month Matrix without Taxable)
        const purchWs = wb.Sheets['Purchase_&_2B_Reco'];
        expect(purchWs['A1'].v).toContain('PURCHASE REGISTER VS GSTR-2B');
        expect(purchWs['B8'].v).toContain('1. AS PER BOOKS (PURCHASE REGISTER)');
        expect(purchWs['H8'].v).toContain('2. AS PER GSTR-2B (PORTAL INWARD SUPPLIES)');
        expect(purchWs['N8'].v).toContain('3. BOOKS VS GSTR-2B (DIFFERENCE)');
        expect(purchWs['T8'].v).toContain('4. AS PER GSTR-3B (ITC CLAIMED)');
        expect(purchWs['Z8'].v).toContain('5. BOOKS VS GSTR-3B (DIFFERENCE)');
        expect(purchWs['A10'].v).toBe('April');
        expect(purchWs['A21'].v).toBe('March');
        expect(purchWs['A22'].v).toBe('FULL FY TOTAL (APR - MAR)');

        // Verify Sheet 6 content (Cash & Statutory Check)
        const cashWs = wb.Sheets['Cash_&_Statutory_Check'];
        expect(cashWs['A1'].v).toContain('CASH COMPLIANCE (SEC 40A(3)) & LABOR STATUTORY COMPLIANCES');

        // Verify Sheet 7 content (Observations)
        const obsWs = wb.Sheets['Current_Year_Observations'];
        expect(obsWs['A1'].v).toContain('CURRENT YEAR AUDIT OBSERVATIONS');
        expect(obsWs['B5'].v).toContain('SALES');
        expect(obsWs['C5'].v).toBe('Critical');

        // Verify Sheet 8 content (Pending Points)
        const pendWs = wb.Sheets['Previous_Pending_Points'];
        expect(pendWs['A1'].v).toContain('PREVIOUS AUDIT PENDING POINTS TRACKER');
        expect(pendWs['E5'].v).toBe('TDS Pending');

        // Verify Sheet 9 content (Fixed Assets & ROC + Section 3.5 ROC Charges Mapping + Section 3.4 Banking & Borrowings)
        const faWs = wb.Sheets['Fixed_Assets_&_ROC'];
        expect(faWs['A1'].v).toContain('FIXED ASSETS ITC INELIGIBILITY & ROC COMPLIANCE');
        expect(faWs['A4'].v).toContain('ROC CHARGES & BORROWINGS MAPPING');
        expect(faWs['A5'].v).toBe('LENDER / FACILITY NAME');
        expect(faWs['D5'].v).toBe('CHARGE STATUS (CHG-1 / CHG-4)');
        expect(faWs['A6'].v).toContain('HDFC Bank');
        expect(faWs['D6'].v).toContain('Charge Created');
        expect(faWs['A17'].v).toContain('BANKING, BORROWINGS & INVESTMENTS RECONCILIATION');
        expect(faWs['A18'].v).toBe('TYPE');
        expect(faWs['B18'].v).toBe('ACCOUNT / FACILITY NAME');
        expect(faWs['C18'].v).toBe('BALANCE (₹)');
        expect(faWs['D18'].v).toBe('STATUS & AUDITOR COMMENT');
        expect(faWs['A19'].v).toBe('Bank Account');
        expect(faWs['B19'].v).toBe('Primary Current Account');
    });

    it('Base64 Serializer: exports a valid Base64 string for direct client auto-save', async () => {
        const autoResult = await autoPopulateMonthlyAudit({
            clientGstin: '27AAGCD4105L1ZO',
            clientName: 'DYP INFRAPROJECTS PRIVATE LIMITED',
            fy: '2025-26',
            month: 'October'
        });

        const bundle: MonthlyAuditExportBundle = {
            header: autoResult.header,
            checklists: autoResult.checklists,
            verification: {
                ...autoResult.verification,
                sales: {
                    ...autoResult.verification.sales,
                    excelAttachment: {
                        fileName: 'Client_Sales_Register_Oct25.xlsx',
                        fileSize: 45000
                    }
                },
                purchase: {
                    ...autoResult.verification.purchase,
                    excelAttachment: {
                        fileName: 'Detailed_GSTR2B_Working_Oct25.xlsx',
                        fileSize: 62000
                    }
                }
            },
            observations: [],
            pendingPoints: []
        };

        const result = generateMonthlyAuditBase64(bundle);

        expect(result.clientName).toBe('DYP INFRAPROJECTS PRIVATE LIMITED');
        expect(result.gstin).toBe('27AAGCD4105L1ZO');
        expect(result.fy).toBe('2025-26');
        expect(result.month).toBe('October');
        expect(result.filename).toContain('Monthly_Audit_Working_Paper_DYP_INFRAPROJECTS_PRIVATE_LIMITED_October_2025-26.xlsx');
        expect(result.workbookBase64).toBeDefined();
        expect(typeof result.workbookBase64).toBe('string');
        expect(result.workbookBase64.length).toBeGreaterThan(100);
    });

});
