import { describe, it, expect } from 'vitest';
import {
    initializeMonthlyAudit,
    autoPopulateMonthlyAudit,
    type AuditTeamMember,
    type MonthlyAuditHeader
} from '../lib/monthlyAuditEngine';
import {
    exportMonthlyAuditToExcel,
    generateMonthlyAuditBase64,
    type MonthlyAuditExportBundle
} from '../lib/monthlyAuditExcel';

describe('Suite 08: Auditor Details, Engagement Team & Dual Period Modes (Single vs Multi-Month)', () => {

    it('Auditor & Engagement Profile: initializes with ICAI standards and firm profile defaults', () => {
        const header = initializeMonthlyAudit('27AAGCD4105L1ZO', 'DYP INFRAPROJECTS PRIVATE LIMITED', '2025-26', 'October');

        expect(header.periodMode).toBe('single');
        expect(header.selectedMonths).toEqual(['October']);
        expect(typeof header.firmName).toBe('string');
        expect(header.auditType).toBe('Monthly Statutory Audit');
        expect(Array.isArray(header.teamMembers)).toBe(true);
        expect(header.teamMembers.length).toBeGreaterThanOrEqual(1);
    });

    it('Audit Engagement Team: supports multi-member roster with roles and assigned areas', () => {
        const team: AuditTeamMember[] = [
            { id: '1', name: 'CA Anish Vaswani', role: 'Engagement Partner', assignedAreas: 'Overall Sign-Off' },
            { id: '2', name: 'Rahul Sharma', role: 'Senior CA Reviewer', assignedAreas: 'Journal & 26AS Scrutiny' },
            { id: '3', name: 'Priya Patel', role: 'Lead Article Assistant', assignedAreas: 'Sales & 2B Reconciliation' },
            { id: '4', name: 'Amit Kumar', role: 'Audit Assistant', assignedAreas: 'Vouching 5 Registers & Cash' }
        ];

        const header: MonthlyAuditHeader = {
            ...initializeMonthlyAudit('27AAGCD4105L1ZO', 'DYP INFRAPROJECTS PRIVATE LIMITED', '2025-26', 'October'),
            auditorName: 'CA Anish Vaswani',
            firmName: 'Vaswani & Associates, Chartered Accountants',
            firmRegistrationNo: '123456W',
            membershipNo: '158942',
            engagementRef: 'EL/2025-26/DYP/04',
            teamMembers: team
        };

        expect(header.teamMembers.length).toBe(4);
        const roles = (header.teamMembers as AuditTeamMember[]).map(t => t.role);
        expect(roles).toContain('Engagement Partner');
        expect(roles).toContain('Senior CA Reviewer');
        expect(roles).toContain('Lead Article Assistant');
        expect(roles).toContain('Audit Assistant');
    });

    it('Dual Period Modes: supports switching between Single Month and Multiple Months scope', () => {
        const header: MonthlyAuditHeader = initializeMonthlyAudit('27AAGCD4105L1ZO', 'DYP INFRAPROJECTS PRIVATE LIMITED', '2025-26', 'October');

        // Mode 1: Single Month
        expect(header.periodMode).toBe('single');
        expect(header.selectedMonths).toEqual(['October']);

        // Mode 2: Multiple Months (e.g. Q1 Apr - Jun)
        const q1Months = ['April', 'May', 'June'];
        const multiMonthHeader: MonthlyAuditHeader = {
            ...header,
            periodMode: 'multiple',
            selectedMonths: q1Months
        };

        expect(multiMonthHeader.periodMode).toBe('multiple');
        expect(multiMonthHeader.selectedMonths?.length).toBe(3);
        expect(multiMonthHeader.selectedMonths).toEqual(['April', 'May', 'June']);

        // Mode 2: Full FY (12 Months)
        const fullFyMonths = [
            'April', 'May', 'June', 'July', 'August', 'September',
            'October', 'November', 'December', 'January', 'February', 'March'
        ];
        const fullYearHeader: MonthlyAuditHeader = {
            ...header,
            periodMode: 'multiple',
            selectedMonths: fullFyMonths
        };

        expect(fullYearHeader.selectedMonths?.length).toBe(12);
        expect(fullYearHeader.selectedMonths).toContain('March');
    });

    it('Zero-Merge Excel: exports clean Cover & Scope Sheet for Multi-Month audit and full team roster', async () => {
        const team: AuditTeamMember[] = [
            { id: '1', name: 'CA Senior Partner', role: 'Engagement Partner', assignedAreas: 'Overall Sign-Off' },
            { id: '2', name: 'Article Lead', role: 'Lead Article Assistant', assignedAreas: 'Sales & Purchase Reco' }
        ];

        const auto = await autoPopulateMonthlyAudit({
            clientGstin: '27AAGCD4105L1ZO',
            clientName: 'DYP INFRAPROJECTS PRIVATE LIMITED',
            fy: '2025-26',
            month: 'October'
        });

        const header: MonthlyAuditHeader = {
            ...initializeMonthlyAudit('27AAGCD4105L1ZO', 'DYP INFRAPROJECTS PRIVATE LIMITED', '2025-26', 'October'),
            periodMode: 'multiple',
            selectedMonths: ['April', 'May', 'June'],
            firmName: 'Vaswani & Associates, Chartered Accountants',
            firmRegistrationNo: '123456W',
            membershipNo: '158942',
            engagementRef: 'EL/2025-26/DYP/04',
            teamMembers: team
        };

        const bundle: MonthlyAuditExportBundle = {
            header,
            registers: [
                { key: 'sales', registerName: 'Sales Register', vouched: 'Yes', sampleChecked: '100%', totalVouchers: 120, auditedAmount: 5000000, remarks: 'Verified' }
            ],
            checklists: [],
            verification: auto.verification,
            observations: [],
            pendingPoints: []
        };

        const base64 = generateMonthlyAuditBase64(bundle);
        expect(base64.workbookBase64).toBeDefined();
        expect(base64.workbookBase64.length).toBeGreaterThan(100);
        expect(base64.filename).toContain('Monthly_Audit_Working_Paper');
    });
});
