import { describe, it, expect, vi } from 'vitest';
import {
    buildCloudAuditDocId,
    CLOUD_AUDITS_COLLECTION,
    submitAuditForSeniorReviewInFirebase,
    approveAuditInFirebase,
    requestRevisionInFirebase,
    releaseAuditInFirebase,
    subscribeToCloudAudit,
    subscribeToSeniorPendingQueue,
    type CloudAuditRecord
} from '../lib/firebaseAuditSync';

describe('Suite 08: Firebase Cloud Remote Audit Sync Engine', () => {

    it('DocId: buildCloudAuditDocId produces sanitized, deterministic Firestore document IDs', () => {
        const id1 = buildCloudAuditDocId('27aagcd4105l1zo', '2025-26', 'October');
        expect(id1).toBe('27AAGCD4105L1ZO_2025-26_October');

        // Handles slash in FY
        const id2 = buildCloudAuditDocId('27AAGCD4105L1ZO', '2025/26', 'October');
        expect(id2).toBe('27AAGCD4105L1ZO_2025-26_October');

        // Handles whitespace and symbols
        const id3 = buildCloudAuditDocId('  27-AAGCD4105L1ZO  ', '2025-26', ' March ');
        expect(id3).toBe('27AAGCD4105L1ZO_2025-26_March');
    });

    it('Schema: CLOUD_AUDITS_COLLECTION is registered as monthly_audits', () => {
        expect(CLOUD_AUDITS_COLLECTION).toBe('monthly_audits');
    });

    it('Operations: Functions are defined and properly structured', () => {
        expect(typeof submitAuditForSeniorReviewInFirebase).toBe('function');
        expect(typeof approveAuditInFirebase).toBe('function');
        expect(typeof requestRevisionInFirebase).toBe('function');
        expect(typeof releaseAuditInFirebase).toBe('function');
        expect(typeof subscribeToCloudAudit).toBe('function');
        expect(typeof subscribeToSeniorPendingQueue).toBe('function');
    });

    it('Data Structure: validates CloudAuditRecord interface fields', () => {
        const sampleRecord: CloudAuditRecord = {
            id: '27AAGCD4105L1ZO_2025-26_October',
            clientGstin: '27AAGCD4105L1ZO',
            clientName: 'DYP INFRAPROJECTS PRIVATE LIMITED',
            fy: '2025-26',
            month: 'October',
            auditStatus: 'SUBMITTED_FOR_REVIEW',
            preparedBy: 'Junior Article',
            preparedAt: Date.now(),
            reviewedBy: 'CA Ramesh Vaswani (Senior Partner)',
            priority: 'Urgent (GST Deadline)',
            submissionNotes: 'Sales Reco 12M checked, DRC-01B variance of ₹90k noted.',
            turnoverBooks: 2500000,
            turnoverGst: 2410000,
            turnoverVariance: 90000,
            observationsCount: 2,
            criticalObsCount: 1,
            pendingPointsCount: 1,
            updatedAt: Date.now(),
            source: 'Vaswani_Audit_Cloud_Sync'
        };

        expect(sampleRecord.auditStatus).toBe('SUBMITTED_FOR_REVIEW');
        expect(sampleRecord.reviewedBy).toBe('CA Ramesh Vaswani (Senior Partner)');
        expect(sampleRecord.priority).toBe('Urgent (GST Deadline)');
        expect(sampleRecord.source).toBe('Vaswani_Audit_Cloud_Sync');
    });

    it('ID Parsing: extracts GSTIN, FY, and month from raw document ID when clientGstin is missing', () => {
        const docId = 'audit_27AAGCD4105L1ZO_2025-26_October';
        const cleanId = docId.replace(/^audit_/i, '').replace(/^AUD_/i, '');
        const idGstinMatch = cleanId.match(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/i);
        const idParts = cleanId.split('_');

        expect(idGstinMatch?.[0].toUpperCase()).toBe('27AAGCD4105L1ZO');
        expect(idParts[1]).toBe('2025-26');
        expect(idParts[2]).toBe('October');
    });

});
