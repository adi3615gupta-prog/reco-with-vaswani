import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    canJuniorEdit,
    canSubmitForReview,
    canSeniorReview,
    canReleaseToClient,
    initializeMonthlyAudit,
    autoPopulateMonthlyAudit
} from '../lib/monthlyAuditEngine';

describe('Suite 08: Monthly Audit UI & Navigation Registration', () => {

    it('Navigation: AppShell registers Suite 08 in CONSOLIDATED_SUITES and AppRoute', () => {
        const appShellPath = path.resolve(__dirname, '../components/AppShell.tsx');
        const content = fs.readFileSync(appShellPath, 'utf8');

        expect(content).toContain("'monthly-audit'");
        expect(content).toContain("badge: 'Suite 08'");
        expect(content).toContain("label: 'Monthly Audit'");
        expect(content).toContain("routes: ['monthly-audit']");
    });

    it('Navigation: Index.tsx registers monthly-audit route and Hub Suite 08 card', () => {
        const indexPath = path.resolve(__dirname, '../pages/Index.tsx');
        const content = fs.readFileSync(indexPath, 'utf8');

        expect(content).toContain("import MonthlyAuditSuite from './MonthlyAuditSuite'");
        expect(content).toContain("appRoute === 'monthly-audit'");
        expect(content).toContain("<MonthlyAuditSuite onBack={() => setAppRoute('hub')} />");
        expect(content).toContain('SUITE 08');
        expect(content).toContain('Monthly Audit Working Paper');
    });

    it('Navigation: AuditModule.tsx provides cross-navigation to Suite 08 MonthlyAuditSuite', () => {
        const auditPath = path.resolve(__dirname, '../pages/AuditModule.tsx');
        const content = fs.readFileSync(auditPath, 'utf8');

        expect(content).toContain("import MonthlyAuditSuite from './MonthlyAuditSuite'");
        expect(content).toContain("selectedSubModule === 'monthly-audit'");
        expect(content).toContain("<MonthlyAuditSuite onBack={() => setSelectedSubModule('menu')} />");
        expect(content).toContain('Launch Monthly Audit Suite');
    });

    it('UI Component: MonthlyAuditSuite.tsx implements all 5 core sections and Maker-Checker flow', () => {
        const suitePath = path.resolve(__dirname, '../pages/MonthlyAuditSuite.tsx');
        const content = fs.readFileSync(suitePath, 'utf8');

        // Check top control bar
        expect(content).toContain('selectedClientGstin');
        expect(content).toContain('selectedFy');
        expect(content).toContain('selectedMonth');
        expect(content).toContain('Tally Port 9000');
        expect(content).toContain('Auto-Populate');
        expect(content).toContain('Zero-Merge Excel');

        // Check Maker-Checker stepper
        expect(content).toContain('1. Draft');
        expect(content).toContain('2. Senior Review');
        expect(content).toContain('3. Approved');
        expect(content).toContain('4. Released to Client');
        expect(content).toContain('Junior Article');
        expect(content).toContain('Senior CA Partner');
        expect(content).toContain('Submit for Senior Review');
        expect(content).toContain('Approve &amp; Sign-Off');
        expect(content).toContain('Request Revision');
        expect(content).toContain('Release Report to Client');

        // Check Primary Ribbon Tabs (Adjusted Serials with Profitability Status)
        expect(content).toContain('1. Basic Details &amp; Scope');
        expect(content).toContain('2. Profitability Status');
        expect(content).toContain('3. Core Verification Workings (3.1–3.7)');
        expect(content).toContain('4. Current Period Observations');
        expect(content).toContain('5. Previous Audit Pending Points');

        // Check Tab 2 Profitability Status elements modeled on E:\Book1.xlsx
        expect(content).toContain('Schedule III Part II Statement of Profit and Loss');
        expect(content).toContain('Book1.xlsx');
        expect(content).toContain('Revenue from Operations');
        expect(content).toContain('Profit / (Loss) Before Tax');
        expect(content).toContain('EBITDA (Operating Profit)');

        // Check Section 3 sub-tabs
        expect(content).toContain('3.1 Sales (Reco R1)');
        expect(content).toContain('3.2 Purchase (Reco 2B)');
        expect(content).toContain('3.3 Journal & TDS');
        expect(content).toContain('3.4 Bank, Loans & 26AS');
        expect(content).toContain('3.5 ROC Charges');
        expect(content).toContain('3.6 Cash 40A(3) & FA');
        expect(content).toContain('3.7 Labor Compliances');

        // Check statutory rules in UI
        expect(content).toContain('DRC-01B Notice Risk');
        expect(content).toContain('Sec 16(4) Time-Barred Risk');
        expect(content).toContain('Sec 17(5) Blocked ITC');
        expect(content).toContain('Sec 269SS Cash Loans Violation');
        expect(content).toContain('Sec 36(1)(va) Permanent Disallowance');
    });

    it('Workflow Stepper & Permissions: validates complete audit lifecycle', () => {
        // Step 1: Draft
        expect(canJuniorEdit('DRAFT')).toBe(true);
        expect(canSubmitForReview('DRAFT')).toBe(true);
        expect(canSeniorReview('DRAFT')).toBe(false);
        expect(canReleaseToClient('DRAFT')).toBe(false);

        // Step 2: Submitted for Senior Review
        expect(canJuniorEdit('SUBMITTED_FOR_REVIEW')).toBe(false);
        expect(canSubmitForReview('SUBMITTED_FOR_REVIEW')).toBe(false);
        expect(canSeniorReview('SUBMITTED_FOR_REVIEW')).toBe(true);
        expect(canReleaseToClient('SUBMITTED_FOR_REVIEW')).toBe(false);

        // Step 3a: Revision Requested
        expect(canJuniorEdit('REVISION_REQUESTED')).toBe(true);
        expect(canSubmitForReview('REVISION_REQUESTED')).toBe(true);
        expect(canSeniorReview('REVISION_REQUESTED')).toBe(false);

        // Step 3b: Approved
        expect(canJuniorEdit('APPROVED')).toBe(false);
        expect(canSeniorReview('APPROVED')).toBe(false);
        expect(canReleaseToClient('APPROVED')).toBe(true);

        // Step 4: Released
        expect(canJuniorEdit('RELEASED')).toBe(false);
        expect(canSubmitForReview('RELEASED')).toBe(false);
        expect(canSeniorReview('RELEASED')).toBe(false);
        expect(canReleaseToClient('RELEASED')).toBe(false);
    });

    it('State Models: initializes header and auto-populates verification evidence', async () => {
        const header = initializeMonthlyAudit('27AAGCD4105L1ZO', 'DYP INFRAPROJECTS PRIVATE LIMITED', '2025-26', 'October');
        expect(header.auditStatus).toBe('DRAFT');
        expect(header.turnoverIncGst).toBe(0);

        const autoResult = await autoPopulateMonthlyAudit({
            clientGstin: '27AAGCD4105L1ZO',
            clientName: 'DYP INFRAPROJECTS PRIVATE LIMITED',
            fy: '2025-26',
            month: 'October',
            existingGstData: {
                r1Turnover: 5000000,
                gstr3bTurnover: 4000000
            }
        });

        expect(autoResult.verification.sales.isDrc01bTriggered).toBe(true);
        expect(autoResult.checklists.length).toBe(16);
    });

    it('Section 3.1: 12-Month Sales Register vs GSTR-1 vs GSTR-3B 3-Way Reconciliation Matrix', () => {
        const suitePath = path.resolve(__dirname, '../pages/MonthlyAuditSuite.tsx');
        const content = fs.readFileSync(suitePath, 'utf8');

        // Check Table & Section Headers
        expect(content).toContain('3.1 Sales Register vs GSTR-1 vs GSTR-3B Reconciliation');
        expect(content).toContain('12-Month Outward Supplies &amp; Tax Liability 3-Way Reconciliation Matrix');
        expect(content).toContain('1. As Per Books (Sales Register)');
        expect(content).toContain('2. As Per GSTR-1 (Portal Outward Supplies)');
        expect(content).toContain('3. Comparison: Books vs GSTR-1 (Books - R1)');
        expect(content).toContain('4. As Per GSTR-3B (Summary Return Filed)');
        expect(content).toContain('5. Comparison: Books vs GSTR-3B (Books - 3B)');

        // Check Sub-column headers for Books, R1, 3B and differences
        expect(content).toContain('Taxable');
        expect(content).toContain('CGST');
        expect(content).toContain('SGST');
        expect(content).toContain('IGST');
        expect(content).toContain('Nil/Exempt');
        expect(content).toContain('Export');
        expect(content).toContain('Diff Taxable');
        expect(content).toContain('Diff CGST');
        expect(content).toContain('Diff SGST');
        expect(content).toContain('Diff IGST');
        expect(content).toContain('Diff Nil');
        expect(content).toContain('Diff Export');

        // Check 12-month FY Total and quick action tools
        expect(content).toContain('FULL FY TOTAL (APR - MAR)');
        expect(content).toContain('Auto-Fill Active Month');
        expect(content).toContain('Reset Matrix');
        expect(content).toContain('All 5 Blocks (Comprehensive)');
        expect(content).toContain('Books vs GSTR-1');
        expect(content).toContain('Books vs GSTR-3B');
        expect(content).toContain('DRC-01B Scrutiny (R1 vs 3B)');
        expect(content).toContain('E-Invoicing Applicability u/Rule 48(4)');
        expect(content).toContain('Tax Audit u/s 44AB Applicability');
    });

    it('Section 3.2: 12-Month Purchase Register vs GSTR-2B Inward ITC Reconciliation Matrix (No Taxable Column)', () => {
        const suitePath = path.resolve(__dirname, '../pages/MonthlyAuditSuite.tsx');
        const content = fs.readFileSync(suitePath, 'utf8');

        // Check Table & Section Headers
        expect(content).toContain('3.2 Purchase Register vs GSTR-2B Inward ITC Reconciliation');
        expect(content).toContain('12-Month Inward Supplies &amp; Tax Credit (ITC) 3-Way Reconciliation Matrix');
        expect(content).toContain('1. As Per Books (Purchase Register)');
        expect(content).toContain('2. As Per GSTR-2B (Portal Inward Supplies)');
        expect(content).toContain('3. Comparison: Books vs GSTR-2B (Books - 2B)');
        expect(content).toContain('4. As Per GSTR-3B (ITC Availed)');
        expect(content).toContain('5. Comparison: Books vs GSTR-3B (Books - 3B)');
        expect(content).toContain('Rule 88D / DRC-01C Diff: GSTR-3B vs GSTR-2B');

        // Check Sub-columns: CGST, SGST, IGST, Cess, Nil/Exempt, Total ITC
        expect(content).toContain('Cess');
        expect(content).toContain('Total ITC');
        expect(content).toContain('Diff Cess');
        expect(content).toContain('Diff Total');

        // Check 12-month FY Total and quick action tools
        expect(content).toContain('Books vs GSTR-2B');
        expect(content).toContain('DRC-01C Scrutiny (2B vs 3B)');
        expect(content).toContain('Sec 16(4) Time-Barred Risk');
        expect(content).toContain('Sec 17(5) Blocked ITC');
        expect(content).toContain('Rule 88D / Form DRC-01C Notice Risk');
    });

    it('Section 3.4: 4-Column Bank, Borrowings & Investments Reconciliation (Type, Name, Balance, Status & Comment)', () => {
        const suitePath = path.resolve(__dirname, '../pages/MonthlyAuditSuite.tsx');
        const content = fs.readFileSync(suitePath, 'utf8');

        // Check Section 3.4 Title
        expect(content).toContain('3.4 Bank Statements, Loan Interest &amp; Form 26AS / AIS Reco');

        // Check 4 Columns
        expect(content).toContain('1. Type');
        expect(content).toContain('2. Account / Facility Name');
        expect(content).toContain('3. Balance (₹)');
        expect(content).toContain('4. Status (Match / Not Matched / Self Comment) &amp; Comment');

        // Check Type options
        expect(content).toContain('BANK_FACILITY_TYPES');
        expect(content).toContain('Bank Account');

        const enginePath = path.resolve(__dirname, '../lib/monthlyAuditEngine.ts');
        const engineContent = fs.readFileSync(enginePath, 'utf8');
        expect(engineContent).toContain('Cash Credit (CC)');
        expect(engineContent).toContain('Overdraft (OD)');
        expect(engineContent).toContain('Term Loan');
        expect(engineContent).toContain('Fixed Deposit (FD)');

        // Check Status dropdown & comments
        expect(content).toContain('Match');
        expect(content).toContain('Not Matched');
        expect(content).toContain('Self Comment');
        expect(content).toContain('STANDARD_BANK_AUDIT_COMMENTS');
        expect(content).toContain('BRS verified - Zero discrepancy');

        // Check action buttons and totals
        expect(content).toContain('Add Bank / Facility');
        expect(content).toContain('Reset Defaults');
        expect(content).toContain('FULL TOTAL');
    });

    it('Sections 3.1 & 3.2: Excel sheet attachments for Sales GST Working & Purchase Reco tabs', () => {
        const suitePath = path.resolve(__dirname, '../pages/MonthlyAuditSuite.tsx');
        const content = fs.readFileSync(suitePath, 'utf8');

        // Check Sales Excel attachment UI elements
        expect(content).toContain('Attach Sales GST Working Excel (Audit Evidence)');
        expect(content).toContain('Sales Working Paper Attached');
        expect(content).toContain('handleSalesFileUpload');
        expect(content).toContain('handleLinkSalesLocalPath');
        expect(content).toContain('handleRemoveSalesAttachment');
        expect(content).toContain('handleDownloadSalesAttachment');

        // Check Purchase Excel attachment UI elements
        expect(content).toContain('Attach Purchase &amp; 2B Inward ITC Working Excel (Audit Evidence)');
        expect(content).toContain('Purchase Working Paper Attached');
        expect(content).toContain('handlePurchaseFileUpload');
        expect(content).toContain('handleLinkPurchaseLocalPath');
        expect(content).toContain('handleRemovePurchaseAttachment');
        expect(content).toContain('handleDownloadPurchaseAttachment');
    });

    it('Section 3.5: ROC Charges & Loan Borrowing Mapping Table (Whether Charges Created or Not)', () => {
        const suitePath = path.resolve(__dirname, '../pages/MonthlyAuditSuite.tsx');
        const content = fs.readFileSync(suitePath, 'utf8');

        // Check Section 3.5 Title
        expect(content).toContain('3.5 New Borrowings &amp; ROC Charge Creation / Satisfaction (CHG-1 / CHG-4)');

        // Check Table Columns
        expect(content).toContain('1. Lender / Facility Name');
        expect(content).toContain('2. Category');
        expect(content).toContain('3. Loan Amount (₹)');
        expect(content).toContain('4. Charge Created Status (CHG-1 / 4)');
        expect(content).toContain('5. MCA SRN / Ref');
        expect(content).toContain('6. Sec 269SS');
        expect(content).toContain('7. Remarks');

        // Check Charge Status Options
        expect(content).toContain('ROC_CHARGE_STATUSES');
        expect(content).toContain('Charge Created');

        // Check Loan Categories
        expect(content).toContain('ROC_LOAN_CATEGORIES');

        const enginePath = path.resolve(__dirname, '../lib/monthlyAuditEngine.ts');
        const engineContent = fs.readFileSync(enginePath, 'utf8');
        expect(engineContent).toContain('Secured Term Loan');
        expect(engineContent).toContain('Working Capital / Cash Credit');
        expect(engineContent).toContain('Charge Created (CHG-1 Filed)');
        expect(engineContent).toContain('Overdue > 30 Days (MCA Violation)');

        // Check action tools
        expect(content).toContain('Add Loan / Borrowing');
        expect(content).toContain('handleAddRocLoan');
        expect(content).toContain('handleUpdateRocLoan');
        expect(content).toContain('handleDeleteRocLoan');
        expect(content).toContain('handleResetRocLoans');
    });

    it('UI & Firebase: MonthlyAuditSuite.tsx integrates Firebase Cloud Remote Sync and Senior Selection modal', () => {
        const suitePath = path.resolve(__dirname, '../pages/MonthlyAuditSuite.tsx');
        const content = fs.readFileSync(suitePath, 'utf8');

        // Check Firebase imports and live indicators
        expect(content).toContain('submitAuditForSeniorReviewInFirebase');
        expect(content).toContain('approveAuditInFirebase');
        expect(content).toContain('requestRevisionInFirebase');
        expect(content).toContain('subscribeToCloudAudit');
        expect(content).toContain('Firebase Live');

        // Check Senior Selection Modal
        expect(content).toContain('submitReviewModalOpen');
        expect(content).toContain('handleOpenSubmitReviewModal');
        expect(content).toContain('handleConfirmSubmitForReview');
        expect(content).toContain('Submit for Senior Partner Review');
        expect(content).toContain('Select Senior CA Reviewer / Partner:');
        expect(content).toContain('availableSeniorOptions');
        expect(content).toContain('Handover Notes &amp; Specific Areas for Partner Attention:');

        // Check Senior Review Alert Card
        expect(content).toContain('Cloud Review Assignment Pending Your Sign-Off');
        expect(content).toContain('Junior Handover Note:');
    });

});
