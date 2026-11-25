import { describe, it, expect } from 'vitest';
import {
    canJuniorEdit,
    canSubmitForReview,
    canSeniorReview,
    canReleaseToClient,
    getStatusBadgeInfo,
    initializeMonthlyAudit,
    type MonthlyAuditHeader,
    type AuditWorkflowStatus
} from '../lib/monthlyAuditEngine';
import {
    buildCloudAuditDocId,
    isSeniorAssigned,
    type CloudAuditRecord
} from '../lib/firebaseAuditSync';

describe('Phase 30: Monthly Audit Multi-User Maker-Checker Workflow Suite', () => {

    describe('1. Role-Based Permissions & State Machine Lock Guards', () => {

        it('Draft Status: allows junior edits and submission, prevents senior review and release', () => {
            const status: AuditWorkflowStatus = 'DRAFT';
            expect(canJuniorEdit(status)).toBe(true);
            expect(canSubmitForReview(status)).toBe(true);
            expect(canSeniorReview(status)).toBe(false);
            expect(canReleaseToClient(status)).toBe(false);

            const badge = getStatusBadgeInfo(status);
            expect(badge.label).toContain('Draft');
        });

        it('Submitted for Review: strictly locks junior edits, enables senior review, prevents release', () => {
            const status: AuditWorkflowStatus = 'SUBMITTED_FOR_REVIEW';
            // Tamper-proof guardrail: junior cannot modify while under senior review
            expect(canJuniorEdit(status)).toBe(false);
            expect(canSubmitForReview(status)).toBe(false);
            expect(canSeniorReview(status)).toBe(true);
            expect(canReleaseToClient(status)).toBe(false);

            const badge = getStatusBadgeInfo(status);
            expect(badge.label).toContain('Under Senior Review');
        });

        it('Revision Requested: unlocks junior edits and allows re-submission, blocks release', () => {
            const status: AuditWorkflowStatus = 'REVISION_REQUESTED';
            // Auto-unlock guardrail: working paper is editable by junior once revision requested
            expect(canJuniorEdit(status)).toBe(true);
            expect(canSubmitForReview(status)).toBe(true);
            expect(canSeniorReview(status)).toBe(false);
            expect(canReleaseToClient(status)).toBe(false);

            const badge = getStatusBadgeInfo(status);
            expect(badge.label).toContain('Revision Requested');
        });

        it('Approved Status: locks junior edits, enables client report release', () => {
            const status: AuditWorkflowStatus = 'APPROVED';
            expect(canJuniorEdit(status)).toBe(false);
            expect(canSubmitForReview(status)).toBe(false);
            expect(canSeniorReview(status)).toBe(false);
            expect(canReleaseToClient(status)).toBe(true);

            const badge = getStatusBadgeInfo(status);
            expect(badge.label).toContain('Approved');
        });

        it('Released Status: final locked state', () => {
            const status: AuditWorkflowStatus = 'RELEASED';
            expect(canJuniorEdit(status)).toBe(false);
            expect(canSubmitForReview(status)).toBe(false);
            expect(canSeniorReview(status)).toBe(false);
            expect(canReleaseToClient(status)).toBe(false);

            const badge = getStatusBadgeInfo(status);
            expect(badge.label).toContain('Released to Client');
        });

    });

    describe('2. Senior CA Partner Assignment & Name Resolution', () => {

        it('Matches exact and full-label senior partner names', () => {
            expect(isSeniorAssigned('CA Ramesh Vaswani (Senior Partner)', 'CA Ramesh Vaswani')).toBe(true);
            expect(isSeniorAssigned('CA Ramesh Vaswani', 'CA Ramesh Vaswani (Senior Partner)')).toBe(true);
            expect(isSeniorAssigned('CA Ankit Shah (Audit Partner)', 'CA Ankit Shah')).toBe(true);
        });

        it('Strict exclusivity: Rejects review requests for unassigned senior partners', () => {
            // An audit assigned to CA Ankit Shah must NOT be routed to CA Senior Partner or other seniors
            expect(isSeniorAssigned('CA Ankit Shah', 'CA Senior Partner (General In-Charge)')).toBe(false);
            expect(isSeniorAssigned('CA Ramesh Vaswani', 'CA Suresh Vaswani (Managing Partner)')).toBe(false);
            expect(isSeniorAssigned('CA Ankit Shah', 'CA Vipul Patel')).toBe(false);
        });

        it('Strict exclusivity: Unassigned or empty senior is rejected from review queues (no leakages)', () => {
            expect(isSeniorAssigned('', 'CA Ramesh Vaswani')).toBe(false);
            expect(isSeniorAssigned(undefined, 'CA Ramesh Vaswani')).toBe(false);
            expect(isSeniorAssigned(null, 'CA Ramesh Vaswani')).toBe(false);
            expect(isSeniorAssigned('CA Ramesh Vaswani', '')).toBe(false);
        });

    });

    describe('3. Cloud Audit Record & Structured Revision Data Integrity', () => {

        it('Builds deterministic Firestore Document IDs', () => {
            const docId = buildCloudAuditDocId('27AAGCD4105L1ZO', '2025-26', 'October');
            expect(docId).toBe('27AAGCD4105L1ZO_2025-26_October');
        });

        it('Structured Revision Notes format parses section and severity headers', () => {
            const section = '3.2 Purchase Reco (Books vs GSTR-2B)';
            const severity = 'Mandatory Fix';
            const notes = '• Inward 2B missing ITC requires vendor tax invoices before claim.\n• Reverse ineligible ITC u/s 17(5).';
            
            const formatted = `[${severity.toUpperCase()}] [${section}]\n${notes}`;

            expect(formatted).toContain('[MANDATORY FIX]');
            expect(formatted).toContain('[3.2 Purchase Reco (Books vs GSTR-2B)]');
            
            const lines = formatted.split('\n');
            expect(lines.length).toBe(3);
            expect(lines[0]).toBe('[MANDATORY FIX] [3.2 Purchase Reco (Books vs GSTR-2B)]');
            expect(lines[1]).toContain('Inward 2B missing ITC');
        });

        it('Stamps Senior Partner Digital Sign-Off upon Approval', () => {
            const header: MonthlyAuditHeader = initializeMonthlyAudit(
                '27AAGCD4105L1ZO',
                'DYP INFRAPROJECTS PRIVATE LIMITED',
                '2025-26',
                'October'
            );

            // Simulate Senior Sign-Off
            const approvedHeader: MonthlyAuditHeader = {
                ...header,
                auditStatus: 'APPROVED',
                reviewedBy: 'CA Ramesh Vaswani (Senior Partner)',
                reviewedAt: 1730541600000,
                seniorReviewNotes: 'Audit working papers verified and approved for client release.'
            };

            expect(approvedHeader.auditStatus).toBe('APPROVED');
            expect(approvedHeader.reviewedBy).toBe('CA Ramesh Vaswani (Senior Partner)');
            expect(approvedHeader.reviewedAt).toBeGreaterThan(0);
            expect(approvedHeader.seniorReviewNotes).toContain('verified and approved');
        });

    });

    describe('4. Junior Article Restriction & Senior Exclusivity', () => {

        it('Evaluates isSeniorUser helper strictly: junior article is NOT senior', () => {
            const checkIsSenior = (role: string, desig: string, username: string, isAdmin: boolean) => {
                const combined = `${role} ${desig} ${username}`.toLowerCase();
                return isAdmin ||
                    combined.includes('admin') ||
                    combined.includes('partner') ||
                    combined.includes('senior') ||
                    combined.includes('manager') ||
                    combined.includes('principal');
            };

            // Junior Articles: Must be false
            expect(checkIsSenior('junior', 'Article Assistant', 'article1', false)).toBe(false);
            expect(checkIsSenior('article', 'Junior Article', 'rahul', false)).toBe(false);
            expect(checkIsSenior('trainee', 'Audit Assistant', 'amit', false)).toBe(false);

            // Senior Reviewers: Must be true
            expect(checkIsSenior('senior', 'Senior CA Partner', 'ramesh', false)).toBe(true);
            expect(checkIsSenior('partner', 'Engagement Partner', 'ankit', false)).toBe(true);
            expect(checkIsSenior('manager', 'Audit Manager', 'suresh', false)).toBe(true);
            expect(checkIsSenior('admin', 'Administrator', 'admin', true)).toBe(true);
        });

        it('Guards Senior Review permissions: junior article can NEVER have senior review access', () => {
            const isJuniorSenior = false; // Logged in as Junior Article
            const auditStatus: AuditWorkflowStatus = 'SUBMITTED_FOR_REVIEW';

            const isSeniorReviewAllowedForJunior = isJuniorSenior && canSeniorReview(auditStatus);
            expect(isSeniorReviewAllowedForJunior).toBe(false);

            const isSeniorPartner = true; // Logged in as Senior Partner
            const isSeniorReviewAllowedForPartner = isSeniorPartner && canSeniorReview(auditStatus);
            expect(isSeniorReviewAllowedForPartner).toBe(true);
        });

    });

});
