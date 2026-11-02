import { describe, it, expect } from 'vitest';
import {
    verifySalesVsGst,
    verifyPurchaseVs2B,
    verifyJournalAndTds,
    verifyBankAndLoans,
    verifyRocAndNewLoans,
    verifyCashComplianceAndProvisions,
    verifyLaborCompliances,
    canJuniorEdit,
    canSubmitForReview,
    canSeniorReview,
    canReleaseToClient,
    autoPopulateMonthlyAudit
} from '../lib/monthlyAuditEngine';

describe('Monthly Audit Engine Verification Algorithms (Suite 08)', () => {

    it('Sales Verification: correctly identifies DRC-01B triggers and statutory thresholds', () => {
        // Case 1: Within normal variance
        const normal = verifySalesVsGst(1000000, 1000000, 1000000, 180000, 180000, 180000);
        expect(normal.turnoverDifference).toBe(0);
        expect(normal.isDrc01bTriggered).toBe(false);
        expect(normal.eInvoicingApplicable).toBe(false);

        // Case 2: DRC-01B triggered (R1 tax > 3B tax by > 25,000)
        const drcTrigger = verifySalesVsGst(2000000, 2000000, 1500000, 360000, 360000, 270000);
        expect(drcTrigger.isDrc01bTriggered).toBe(true);
        expect(drcTrigger.taxDifference).toBe(90000);
        expect(drcTrigger.drc01bReason).toContain('DRC-01B scrutiny notice risk');

        // Case 3: E-Invoicing (> 5 Cr) & Tax Audit (> 10 Cr)
        const large = verifySalesVsGst(120000000, 120000000, 120000000);
        expect(large.eInvoicingApplicable).toBe(true);
        expect(large.taxAuditApplicable).toBe(true);
    });

    it('Purchase Verification: detects missing 2B invoices, 16(4) time-limits, and 17(5) blocked credit', () => {
        const dummyInvoices = [
            { invoiceDate: '2023-05-10', tax: 18000, isBlocked17_5: false }, // Past Nov 2024 deadline -> 16(4)
            { invoiceDate: '2025-08-15', tax: 25000, isBlocked17_5: true }   // Blocked u/s 17(5)
        ];

        const reco = verifyPurchaseVs2B(500000, 90000, 457000, 47000, dummyInvoices);
        expect(reco.missingIn2BCount).toBe(2);
        expect(reco.sec17_5_BlockedItcAmount).toBe(25000);
        expect(reco.sec16_4_RiskCount).toBeGreaterThanOrEqual(1);
        expect(reco.eligibleItcClaimable).toBe(22000); // 47,000 - 25,000 blocked
    });

    it('Journal & TDS Scrutiny: flags suspense accounts, transporter missing PAN, and 194Q purchases', () => {
        const vouchers = [
            { voucherNumber: 'JV-01', ledgerName: 'Suspense Account', amount: 45000, narration: 'Unidentified deposit' },
            { voucherNumber: 'JV-02', ledgerName: 'Shri Ram Transport', amount: 80000, narration: 'Freight paid, no PAN declaration' },
            { voucherNumber: 'JV-03', ledgerName: 'Tata Steel Vendor', amount: 6500000, narration: 'Raw material purchase' }
        ];

        const result = verifyJournalAndTds(vouchers, 1200000, 1150000);
        expect(result.suspenseEntriesCount).toBe(1);
        expect(result.suspenseAmount).toBe(45000);
        expect(result.tds194C_MissingPanCount).toBe(1);
        expect(result.tds194Q_HighVolumeCount).toBe(1);
        expect(result.salaryVariance).toBe(50000);
        expect(result.remarks).toContain('WARNING: 1 Suspense entries');
    });

    it('Bank & Loan Statements: tracks stale cheques, overdue interest, and Form 26AS variance', () => {
        const banks = [
            { accountName: 'HDFC Current A/c', balance: 500000, unreconciledCount: 3, staleCount: 1 }
        ];
        const loans = [
            { loanName: 'SBI Term Loan', principalOutstanding: 4500000, isOverdue: true }
        ];

        const result = verifyBankAndLoans(banks, loans, 185000, 160000, 2);
        expect(result.staleChequesCount).toBe(1);
        expect(result.interestServicingCheck).toBe('Interest Overdue / Default Risk');
        expect(result.form26AS_MismatchAmount).toBe(25000);
        expect(result.aisSftHighValueMismatches).toBe(2);
        expect(result.facilities).toBeDefined();
        expect(result.facilities?.length).toBeGreaterThanOrEqual(2);
    });

    it('Bank Statements & Borrowings: supports 4-column facility reconciliation (Type, Name, Balance, Status & Comments)', () => {
        const customFacilities = [
            { id: 'bf_1', facilityType: 'Bank Account' as const, name: 'HDFC Current A/c', balance: 1250000, status: 'Match' as const, comment: 'BRS verified' },
            { id: 'bf_2', facilityType: 'Cash Credit (CC)' as const, name: 'SBI CC Limit', balance: -4500000, status: 'Not Matched' as const, comment: 'Interest variance' },
            { id: 'bf_3', facilityType: 'Term Loan' as const, name: 'Kotak Term Loan', balance: 8000000, status: 'Match' as const, comment: 'EMI verified' },
            { id: 'bf_4', facilityType: 'Fixed Deposit (FD)' as const, name: 'ICICI FD 9912', balance: 2500000, status: 'Self Comment' as const, comment: 'Accrued interest pending' }
        ];

        const result = verifyBankAndLoans([], [], 0, 0, 0, customFacilities);
        expect(result.facilities?.length).toBe(4);
        expect(result.facilities?.[0].facilityType).toBe('Bank Account');
        expect(result.facilities?.[1].facilityType).toBe('Cash Credit (CC)');
        expect(result.facilities?.[1].status).toBe('Not Matched');
        expect(result.facilities?.[3].facilityType).toBe('Fixed Deposit (FD)');
        expect(result.facilities?.[3].status).toBe('Self Comment');
    });

    it('ROC Compliance & New Loans: flags Section 269SS cash loans and overdue Form CHG-1', () => {
        const loans = [
            { lenderName: 'Director Loan', amount: 50000, isCash: true, daysSinceCreation: 10 }, // Violates 269SS
            { lenderName: 'HDFC Bank Term Loan', amount: 2500000, isCash: false, daysSinceCreation: 45 }
        ];
        const charges = [
            { chargeId: 'CHG_001', type: 'creation' as const, daysPending: 40 } // Pending > 30 days
        ];

        const result = verifyRocAndNewLoans(loans, charges);
        expect(result.cashLoansSec269SS_Count).toBe(1);
        expect(result.formCHG1_PendingCount).toBe(1);
        expect(result.remarks).toContain('CRITICAL: 1 cash loan(s) >= ₹20,000 detected');
    });

    it('Cash Compliance u/s 40A(3): groups single-day cash payments to the same person > 10k', () => {
        const cashVouchers = [
            { date: '2025-10-10', partyName: 'Goyal Hardware', amount: 6000, isExpense: true },
            { date: '2025-10-10', partyName: 'Goyal Hardware', amount: 7000, isExpense: true }, // Sum = 13,000 -> Exceeds 10k
            { date: '2025-10-11', partyName: 'Sharma Traders', amount: 9000, isExpense: true }   // Below 10k
        ];
        const balances = [
            { date: '2025-10-10', closingBalance: 45000 },
            { date: '2025-10-11', closingBalance: -2500 } // Negative cash
        ];
        const faAdditions = [
            { assetName: 'Factory Boundary Wall', cost: 200000, itcClaimed: 36000, isConstructionOrImmovable: true }
        ];

        const result = verifyCashComplianceAndProvisions(cashVouchers, balances, { closingDone: true, closingAmount: 50000, openingReversed: true }, faAdditions);
        expect(result.singleDayPaymentsOver10kCount).toBe(1);
        expect(result.singleDayPaymentsOver10kAmount).toBe(13000);
        expect(result.negativeCashDaysCount).toBe(1);
        expect(result.ineligibleFaItcAmount).toBe(36000);
        expect(result.remarks).toContain('ALERT: 1 Cash payment(s) > ₹10,000');
    });

    it('Labor Compliances: enforces Section 36(1)(va) 15th deposit deadline with permanent disallowance', () => {
        // October salary deposited on 20th November -> past 15th Nov deadline
        const delayed = verifyLaborCompliances(
            500000,
            60000, // Employee PF
            60000, // Employer PF
            3750,  // Employee ESIC
            16250, // Employer ESIC
            2500,  // PT
            '2025-11-20', // Delayed deposit date
            '2025-11-20',
            10, // Month 10 (October)
            2025
        );

        expect(delayed.isPfDelayedSec36_1_va).toBe(true);
        expect(delayed.isEsicDelayedSec36_1_va).toBe(true);
        expect(delayed.permanentDisallowanceExposure).toBe(63750); // 60,000 + 3,750
        expect(delayed.remarks).toContain('Permanent tax disallowance of ₹63,750 u/s 36(1)(va)');

        // On-time deposit (e.g. 10th November)
        const onTime = verifyLaborCompliances(500000, 60000, 60000, 3750, 16250, 2500, '2025-11-10', '2025-11-10', 10, 2025);
        expect(onTime.isPfDelayedSec36_1_va).toBe(false);
        expect(onTime.permanentDisallowanceExposure).toBe(0);
    });

    it('Maker-Checker Permission Rules: validates transitions and action locks', () => {
        expect(canJuniorEdit('DRAFT')).toBe(true);
        expect(canJuniorEdit('REVISION_REQUESTED')).toBe(true);
        expect(canJuniorEdit('SUBMITTED_FOR_REVIEW')).toBe(false);
        expect(canJuniorEdit('APPROVED')).toBe(false);

        expect(canSubmitForReview('DRAFT')).toBe(true);
        expect(canSubmitForReview('REVISION_REQUESTED')).toBe(true);
        expect(canSubmitForReview('APPROVED')).toBe(false);

        expect(canSeniorReview('SUBMITTED_FOR_REVIEW')).toBe(true);
        expect(canSeniorReview('DRAFT')).toBe(false);
        expect(canSeniorReview('APPROVED')).toBe(false);

        expect(canReleaseToClient('APPROVED')).toBe(true);
        expect(canReleaseToClient('DRAFT')).toBe(false);
        expect(canReleaseToClient('SUBMITTED_FOR_REVIEW')).toBe(false);
    });

    it('Auto-Populator Orchestrator: produces full snapshot and standard checklists', async () => {
        const result = await autoPopulateMonthlyAudit({
            clientGstin: '27AAGCD4105L1ZO',
            clientName: 'DYP INFRAPROJECTS PRIVATE LIMITED',
            fy: '2025-26',
            month: 'October',
            existingGstData: {
                r1Turnover: 2500000,
                gstr3bTurnover: 2000000, // triggers DRC-01B (> 25k tax diff)
                twoBPurchases: 1800000,
                twoBTax: 324000
            }
        });

        expect(result.header).toBeDefined();
        expect(result.header.clientName).toBe('DYP INFRAPROJECTS PRIVATE LIMITED');
        expect(result.header.auditStatus).toBe('DRAFT');
        expect(result.checklists.length).toBe(16);
        expect(result.verification.sales.isDrc01bTriggered).toBe(true);
        expect(result.suggestedObservations.length).toBeGreaterThanOrEqual(1);
        expect(result.suggestedObservations[0].title).toBe('DRC-01B Tax Variance Alert');
    });
});
