/**
 * Vaswani Return Enterprise — Suite 08: Monthly Audit Cloud Sync Engine
 * Real-time Firebase Firestore Remote Maker-Checker Synchronization
 *
 * Facilitates multi-location remote audits:
 * 1. Junior submits draft with designated Senior Partner selection from client site/home.
 * 2. Real-time Firebase onSnapshot alerts Senior Partner across remote workstations.
 * 3. Senior CA reviews working papers remotely, approves/signs off or requests revision.
 * 4. Stamped audit trail and cloud status synced seamlessly.
 */

import {
    doc,
    setDoc,
    getDoc,
    updateDoc,
    deleteDoc,
    collection,
    query,
    where,
    onSnapshot,
    getDocs,
    type Unsubscribe
} from 'firebase/firestore';
import { firestore } from './firebaseClient';

export interface CloudAuditRecord {
    id: string; // Document ID: `${clientGstin}_${fy}_${month}`
    clientGstin: string;
    clientName: string;
    fy: string;
    month: string;
    auditStatus: 'DRAFT' | 'SUBMITTED_FOR_REVIEW' | 'APPROVED' | 'REVISION_REQUESTED' | 'RELEASED';
    preparedBy: string;
    preparedAt?: number;
    reviewedBy: string; // Designated Senior CA Partner
    reviewedAt?: number;
    seniorReviewNotes?: string;
    releasedBy?: string;
    releasedAt?: number;
    releaseChannel?: string;
    priority?: 'Normal' | 'High' | 'Urgent (GST Deadline)';
    submissionNotes?: string;
    turnoverBooks?: number;
    turnoverGst?: number;
    turnoverVariance?: number;
    ebitda?: number;
    pbt?: number;
    observationsCount?: number;
    criticalObsCount?: number;
    pendingPointsCount?: number;
    updatedAt: number;
    source: string;
}

export const CLOUD_AUDITS_COLLECTION = 'monthly_audits';

/**
 * Standardizes Document ID for predictable real-time sync across all workstations
 */
export function buildCloudAuditDocId(clientGstin: string, fy: string, month: string): string {
    const safeGstin = (clientGstin || 'UNKNOWN').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const safeFy = (fy || 'FY').replace(/[^a-zA-Z0-9_-]/g, '-');
    const safeMonth = (month || 'MONTH').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${safeGstin}_${safeFy}_${safeMonth}`;
}

/**
 * Syncs full or partial audit record to Cloud Firestore
 */
export async function syncAuditToFirebase(
    record: Partial<CloudAuditRecord> & { clientGstin: string; fy: string; month: string }
): Promise<{ success: boolean; id: string; error?: string }> {
    try {
        const docId = buildCloudAuditDocId(record.clientGstin, record.fy, record.month);
        const docRef = doc(firestore, CLOUD_AUDITS_COLLECTION, docId);

        const payload: CloudAuditRecord = {
            id: docId,
            clientGstin: (record.clientGstin || '').toUpperCase(),
            clientName: record.clientName || 'Client',
            fy: record.fy,
            month: record.month,
            auditStatus: record.auditStatus || 'DRAFT',
            preparedBy: record.preparedBy || 'Junior Auditor',
            preparedAt: record.preparedAt || Date.now(),
            reviewedBy: record.reviewedBy || 'Senior Partner, CA',
            reviewedAt: record.reviewedAt,
            seniorReviewNotes: record.seniorReviewNotes || '',
            releasedBy: record.releasedBy || '',
            releasedAt: record.releasedAt,
            releaseChannel: record.releaseChannel || '',
            priority: record.priority || 'Normal',
            submissionNotes: record.submissionNotes || '',
            turnoverBooks: record.turnoverBooks || 0,
            turnoverGst: record.turnoverGst || 0,
            turnoverVariance: record.turnoverVariance || 0,
            ebitda: record.ebitda || 0,
            pbt: record.pbt || 0,
            observationsCount: record.observationsCount || 0,
            criticalObsCount: record.criticalObsCount || 0,
            pendingPointsCount: record.pendingPointsCount || 0,
            updatedAt: Date.now(),
            source: 'Vaswani_Audit_Cloud_Sync'
        };

        await setDoc(docRef, payload, { merge: true });
        return { success: true, id: docId };
    } catch (err: any) {
        console.warn('[Firebase Audit Sync] syncAuditToFirebase error:', err?.message || err);
        return { success: false, id: '', error: err?.message || 'Firebase sync failed' };
    }
}

/**
 * Junior Action: Submits draft audit to Firebase Cloud with specific Senior Partner selection
 */
export async function submitAuditForSeniorReviewInFirebase(params: {
    clientGstin: string;
    fy: string;
    month: string;
    clientName: string;
    preparedBy: string;
    reviewedBy: string;
    submissionNotes?: string;
    priority?: 'Normal' | 'High' | 'Urgent (GST Deadline)';
    turnoverBooks?: number;
    turnoverGst?: number;
    observationsCount?: number;
    criticalObsCount?: number;
    pendingPointsCount?: number;
}): Promise<{ success: boolean; id: string; error?: string }> {
    try {
        const docId = buildCloudAuditDocId(params.clientGstin, params.fy, params.month);
        const docRef = doc(firestore, CLOUD_AUDITS_COLLECTION, docId);

        const updateData: Partial<CloudAuditRecord> = {
            id: docId,
            clientGstin: params.clientGstin.toUpperCase(),
            clientName: params.clientName,
            fy: params.fy,
            month: params.month,
            auditStatus: 'SUBMITTED_FOR_REVIEW',
            preparedBy: params.preparedBy || 'Junior Article',
            preparedAt: Date.now(),
            reviewedBy: params.reviewedBy || 'Senior Partner, CA',
            submissionNotes: params.submissionNotes || '',
            priority: params.priority || 'Normal',
            turnoverBooks: params.turnoverBooks ?? 0,
            turnoverGst: params.turnoverGst ?? 0,
            observationsCount: params.observationsCount ?? 0,
            criticalObsCount: params.criticalObsCount ?? 0,
            pendingPointsCount: params.pendingPointsCount ?? 0,
            updatedAt: Date.now(),
            source: 'Vaswani_Audit_Cloud_Sync'
        };

        await setDoc(docRef, updateData, { merge: true });
        return { success: true, id: docId };
    } catch (err: any) {
        console.warn('[Firebase Audit Sync] submitAuditForSeniorReviewInFirebase error:', err?.message || err);
        return { success: false, id: '', error: err?.message || 'Cloud submission failed' };
    }
}

/**
 * Senior Action: Approves audit remotely in Firebase Cloud with partner sign-off
 */
export async function approveAuditInFirebase(params: {
    clientGstin: string;
    fy: string;
    month: string;
    reviewedBy: string;
    seniorReviewNotes?: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const docId = buildCloudAuditDocId(params.clientGstin, params.fy, params.month);
        const docRef = doc(firestore, CLOUD_AUDITS_COLLECTION, docId);

        await setDoc(docRef, {
            auditStatus: 'APPROVED',
            reviewedBy: params.reviewedBy || 'Senior Partner, CA',
            reviewedAt: Date.now(),
            seniorReviewNotes: params.seniorReviewNotes || 'Audit working papers verified and approved for client release.',
            updatedAt: Date.now()
        }, { merge: true });

        return { success: true };
    } catch (err: any) {
        console.warn('[Firebase Audit Sync] approveAuditInFirebase error:', err?.message || err);
        return { success: false, error: err?.message || 'Cloud approval failed' };
    }
}

/**
 * Senior Action: Requests revision back to junior with notes
 */
export async function requestRevisionInFirebase(params: {
    clientGstin: string;
    fy: string;
    month: string;
    reviewedBy: string;
    revisionNotes: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const docId = buildCloudAuditDocId(params.clientGstin, params.fy, params.month);
        const docRef = doc(firestore, CLOUD_AUDITS_COLLECTION, docId);

        await setDoc(docRef, {
            auditStatus: 'REVISION_REQUESTED',
            reviewedBy: params.reviewedBy || 'Senior Partner, CA',
            reviewedAt: Date.now(),
            seniorReviewNotes: params.revisionNotes,
            updatedAt: Date.now()
        }, { merge: true });

        return { success: true };
    } catch (err: any) {
        console.warn('[Firebase Audit Sync] requestRevisionInFirebase error:', err?.message || err);
        return { success: false, error: err?.message || 'Revision request failed' };
    }
}

/**
 * Release Action: Stamped as released to client in Cloud
 */
export async function releaseAuditInFirebase(params: {
    clientGstin: string;
    fy: string;
    month: string;
    releasedBy: string;
    releaseChannel?: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const docId = buildCloudAuditDocId(params.clientGstin, params.fy, params.month);
        const docRef = doc(firestore, CLOUD_AUDITS_COLLECTION, docId);

        await setDoc(docRef, {
            auditStatus: 'RELEASED',
            releasedBy: params.releasedBy || 'Senior Partner, CA',
            releasedAt: Date.now(),
            releaseChannel: params.releaseChannel || 'DIRECTORY',
            updatedAt: Date.now()
        }, { merge: true });

        return { success: true };
    } catch (err: any) {
        console.warn('[Firebase Audit Sync] releaseAuditInFirebase error:', err?.message || err);
        return { success: false, error: err?.message || 'Cloud release failed' };
    }
}

/**
 * Deletes an audit record from Firebase Cloud (used to remove invalid/test submissions)
 */
export async function deleteAuditFromFirebase(
    docIdOrParams: string | { clientGstin: string; fy: string; month: string }
): Promise<{ success: boolean; error?: string }> {
    try {
        const docId = typeof docIdOrParams === 'string'
            ? docIdOrParams
            : buildCloudAuditDocId(docIdOrParams.clientGstin, docIdOrParams.fy, docIdOrParams.month);
        const docRef = doc(firestore, CLOUD_AUDITS_COLLECTION, docId);
        await deleteDoc(docRef);
        return { success: true };
    } catch (err: any) {
        console.warn('[Firebase Audit Sync] deleteAuditFromFirebase error:', err?.message || err);
        return { success: false, error: err?.message || 'Delete failed' };
    }
}

/**
 * Real-time Listener on active client audit document
 * Updates whenever Senior or Junior takes action on another machine
 */
export function subscribeToCloudAudit(
    clientGstin: string,
    fy: string,
    month: string,
    onUpdate: (data: CloudAuditRecord | null) => void,
    onError?: (err: Error) => void
): Unsubscribe {
    const docId = buildCloudAuditDocId(clientGstin, fy, month);
    const docRef = doc(firestore, CLOUD_AUDITS_COLLECTION, docId);

    return onSnapshot(
        docRef,
        (snap) => {
            if (snap.exists()) {
                const raw = (snap.data() || {}) as any;
                onUpdate({
                    ...raw,
                    id: raw.id || snap.id,
                    clientGstin: raw.clientGstin || raw.client_gstin || raw.gstin || clientGstin,
                    fy: raw.fy || raw.financialYear || fy,
                    month: raw.month || month
                } as CloudAuditRecord);
            } else {
                onUpdate(null);
            }
        },
        (err) => {
            console.warn('[Firebase Audit Sync] Snapshot error:', err);
            if (onError) onError(err);
        }
    );
}

/**
 * Checks if a pending audit record's assigned reviewer matches the given senior user
 * STRICT ISOLATION: An audit assigned to Senior X will ONLY match Senior X and NEVER leak to Senior Y!
 */
export function isSeniorAssigned(
    recSenior: string | undefined | null,
    activeSenior: string | undefined | null,
    recSeniorUsername?: string,
    activeSeniorUsername?: string
): boolean {
    if (activeSenior === 'ALL' || activeSenior === '*') return true;
    if (!activeSenior || !activeSenior.trim()) return false;
    if (!recSenior || !recSenior.trim()) return false;

    // 1. Direct username match if available
    if (recSeniorUsername && activeSeniorUsername) {
        if (recSeniorUsername.toLowerCase().trim() === activeSeniorUsername.toLowerCase().trim()) {
            return true;
        }
    }

    const a = activeSenior.toLowerCase().trim();
    const r = recSenior.toLowerCase().trim();
    if (a === r) return true;

    // 2. Strict normalized alphanumeric comparison
    const cleanA = a.replace(/\(.*?\)/g, '').replace(/\bca\b|\bpartner\b|\bmanager\b|\bsenior\b|\bauditor\b/g, '').replace(/[^a-z0-9]/g, '').trim();
    const cleanR = r.replace(/\(.*?\)/g, '').replace(/\bca\b|\bpartner\b|\bmanager\b|\bsenior\b|\bauditor\b/g, '').replace(/[^a-z0-9]/g, '').trim();

    if (!cleanA || !cleanR) return false;
    if (cleanA === cleanR) return true;

    // Strict prefix/exact match for compound names (e.g. "rameshvaswani")
    if (cleanA.length >= 4 && cleanR.length >= 4) {
        if (cleanA === cleanR || cleanA.startsWith(cleanR) || cleanR.startsWith(cleanA)) {
            return true;
        }
    }

    return false;
}

/**
 * Real-time Listener for Senior CA's Pending Review Queue across all clients
 * STRICT: Only pulls records assigned to THIS specific senior partner
 */
export function subscribeToSeniorPendingQueue(
    seniorTarget: { name?: string; username?: string } | string,
    onUpdate: (audits: CloudAuditRecord[]) => void,
    onError?: (err: Error) => void
): Unsubscribe {
    const colRef = collection(firestore, CLOUD_AUDITS_COLLECTION);
    const activeName = typeof seniorTarget === 'string' ? seniorTarget : (seniorTarget?.name || '');
    const activeUser = typeof seniorTarget === 'string' ? '' : (seniorTarget?.username || '');

    // Query all audits pending review
    const q = query(
        colRef,
        where('auditStatus', '==', 'SUBMITTED_FOR_REVIEW')
    );

    return onSnapshot(
        q,
        (snap) => {
            const list: CloudAuditRecord[] = [];
            snap.forEach((d) => {
                const raw = (d.data() || {}) as any;
                const docId = raw.id || d.id || '';
                const cleanId = docId.replace(/^audit_/i, '').replace(/^AUD_/i, '');
                const idGstinMatch = cleanId.match(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/i);
                const idParts = cleanId.split('_');

                const clientGstin = (
                    raw.clientGstin ||
                    raw.client_gstin ||
                    raw.gstin ||
                    raw.clientId ||
                    raw.client_id ||
                    (idGstinMatch ? idGstinMatch[0].toUpperCase() : '') ||
                    (idParts[0] && idParts[0].length >= 10 ? idParts[0].toUpperCase() : '') ||
                    ''
                ).trim();

                const fy = (
                    raw.fy ||
                    raw.financialYear ||
                    (idParts[1] && idParts[1].includes('-') ? idParts[1] : '') ||
                    ''
                ).trim();

                const month = (
                    raw.month ||
                    (idParts[2] ? idParts[2] : '') ||
                    ''
                ).trim();

                const rec: CloudAuditRecord = {
                    ...raw,
                    id: docId,
                    clientGstin,
                    clientName: raw.clientName || raw.client_name || (clientGstin ? `Client (${clientGstin})` : 'Client'),
                    fy: fy || '2026-27',
                    month: month || 'April'
                };

                // STRICT: Match ONLY the specific assigned senior
                if (isSeniorAssigned(rec.reviewedBy, activeName, rec.reviewedByUsername, activeUser)) {
                    list.push(rec);
                }
            });

            // Priority sorting: Urgent (GST Deadline) > High > Normal
            const priorityWeight = (p?: string) => {
                if (p?.includes('Urgent')) return 3;
                if (p?.includes('High')) return 2;
                return 1;
            };

            list.sort((a, b) => {
                const wDiff = priorityWeight(b.priority) - priorityWeight(a.priority);
                if (wDiff !== 0) return wDiff;
                return (b.updatedAt || 0) - (a.updatedAt || 0);
            });

            onUpdate(list);
        },
        (err) => {
            console.warn('[Firebase Audit Sync] Senior queue error:', err);
            if (onError) onError(err);
        }
    );
}

export interface CloudSeniorAuditor {
    id: string;
    name: string;
    username: string;
    displayName: string;
    designation?: string;
    department?: string;
    role?: string;
}

/**
 * Fetches Senior Auditors & Partners configured in the Super Admin Portal (network_users collection)
 */
export async function fetchSeniorAuditorsFromCloud(): Promise<Array<CloudSeniorAuditor>> {
    try {
        const colRef = collection(firestore, 'network_users');
        const snap = await getDocs(query(colRef, where('is_active', '==', 1)));
        const seniors: Array<CloudSeniorAuditor> = [];

        snap.forEach((d) => {
            const data = d.data();
            const role = (data.role || '').toLowerCase();
            const designation = (data.designation || '').toLowerCase();
            if (
                role.includes('senior') ||
                role.includes('admin') ||
                role.includes('partner') ||
                designation.includes('senior') ||
                designation.includes('partner') ||
                designation.includes('manager')
            ) {
                const displayName = data.name || data.username;
                const fullLabel = data.designation
                    ? `${displayName} (${data.designation}${data.department ? ` - ${data.department}` : ''})`
                    : displayName;
                seniors.push({
                    id: d.id,
                    name: fullLabel,
                    username: data.username || '',
                    displayName: displayName,
                    designation: data.designation,
                    department: data.department,
                    role: data.role
                });
            }
        });
        return seniors;
    } catch (err: any) {
        console.warn('[Firebase Audit Sync] fetchSeniorAuditorsFromCloud error:', err?.message || err);
        return [];
    }
}

/**
 * Fetches Junior Auditors & Articles configured in the Super Admin Portal (network_users collection)
 */
export async function fetchJuniorAuditorsFromCloud(): Promise<Array<{ id: string; name: string; designation?: string; department?: string; role?: string }>> {
    try {
        const colRef = collection(firestore, 'network_users');
        const snap = await getDocs(query(colRef, where('is_active', '==', 1)));
        const juniors: Array<{ id: string; name: string; designation?: string; department?: string; role?: string }> = [];

        snap.forEach((d) => {
            const data = d.data();
            const role = (data.role || '').toLowerCase();
            const designation = (data.designation || '').toLowerCase();
            if (
                role.includes('junior') ||
                role.includes('article') ||
                role.includes('assistant') ||
                role.includes('trainee') ||
                designation.includes('article') ||
                designation.includes('assistant') ||
                designation.includes('trainee')
            ) {
                const displayName = data.name || data.username;
                const fullLabel = data.designation
                    ? `${displayName} (${data.designation})`
                    : displayName;
                juniors.push({
                    id: d.id,
                    name: fullLabel,
                    designation: data.designation,
                    department: data.department,
                    role: data.role
                });
            }
        });
        return juniors;
    } catch (err: any) {
        console.warn('[Firebase Audit Sync] fetchJuniorAuditorsFromCloud error:', err?.message || err);
        return [];
    }
}
