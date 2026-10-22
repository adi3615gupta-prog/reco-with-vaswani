/**
 * Audit Trail Service
 * Manages persistent recording and offline synchronization of reconciliation overrides.
 * Complies with requirement AUDIT-01 and statutory audit trail mandates.
 */

export type AuditActionType =
  | 'FORCE_MATCH'
  | 'MANUAL_MATCH'
  | 'BATCH_MATCH'
  | 'UNLINK'
  | 'AUTO_MATCH_PARTY';

export interface AuditOverrideRecord {
  id: string;
  timestamp: number;
  iso_timestamp: string;
  practitioner_username: string;
  client_gstin?: string | null;
  company_name?: string | null;
  action_type: AuditActionType;
  invoice_no_pr?: string | null;
  invoice_no_2b?: string | null;
  original_status?: string | null;
  new_status: string;
  taxable_diff?: number;
  gst_diff?: number;
  justification: string;
  metadata?: any;
  is_synced?: boolean;
}

export interface AuditOverrideInput {
  action_type: AuditActionType;
  new_status: string;
  justification: string;
  client_gstin?: string | null;
  company_name?: string | null;
  invoice_no_pr?: string | null;
  invoice_no_2b?: string | null;
  original_status?: string | null;
  taxable_diff?: number;
  gst_diff?: number;
  practitioner_username?: string;
  metadata?: any;
}

const AUDIT_QUEUE_KEY = 'np_audit_override_queue';

let memoryQueue: AuditOverrideRecord[] = [];

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore
  }
  return null;
}

/**
 * Retrieves the currently logged-in practitioner's name, or returns a default.
 */
export function getActivePractitioner(): string {
  try {
    const storage = getStorage();
    if (storage) {
      const stored =
        storage.getItem('np_user') ||
        (typeof window !== 'undefined' ? window.sessionStorage?.getItem('np_user') : null) ||
        storage.getItem('login_user');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (typeof parsed === 'string') return parsed;
          if (parsed && typeof parsed === 'object') {
            return parsed.username || parsed.name || parsed.id || 'Practitioner';
          }
        } catch {
          return stored;
        }
      }
    }
  } catch {
    // Fall through
  }
  return 'Practitioner';
}

function getLocalQueue(): AuditOverrideRecord[] {
  try {
    const storage = getStorage();
    if (storage) {
      const raw = storage.getItem(AUDIT_QUEUE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch {
    // Ignore read errors
  }
  return [...memoryQueue];
}

function saveLocalQueue(queue: AuditOverrideRecord[]): void {
  memoryQueue = [...queue];
  try {
    const storage = getStorage();
    if (storage) {
      storage.setItem(AUDIT_QUEUE_KEY, JSON.stringify(queue));
    }
  } catch {
    // Ignore storage quota / write errors
  }
}

/**
 * Records a practitioner reconciliation override action.
 * Writes immediately to the local offline queue, then dispatches an async POST to the server.
 */
export async function recordOverrideLog(input: AuditOverrideInput): Promise<AuditOverrideRecord> {
  const justification = (input.justification || '').trim();
  if (justification.length < 5) {
    throw new Error('Statutory justification requires minimum 5 characters');
  }

  const recordId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const now = Date.now();
  const record: AuditOverrideRecord = {
    id: recordId,
    timestamp: now,
    iso_timestamp: new Date(now).toISOString(),
    practitioner_username: input.practitioner_username || getActivePractitioner(),
    client_gstin: input.client_gstin || null,
    company_name: input.company_name || null,
    action_type: input.action_type,
    invoice_no_pr: input.invoice_no_pr || null,
    invoice_no_2b: input.invoice_no_2b || null,
    original_status: input.original_status || null,
    new_status: input.new_status,
    taxable_diff: input.taxable_diff !== undefined ? Number(input.taxable_diff) : 0,
    gst_diff: input.gst_diff !== undefined ? Number(input.gst_diff) : 0,
    justification,
    metadata: input.metadata || null,
    is_synced: false,
  };

  // 1. Append to local queue for offline durability
  const queue = getLocalQueue();
  queue.unshift(record);
  saveLocalQueue(queue);

  // 2. Attempt async sync to backend if online
  if (typeof fetch !== 'undefined') {
    try {
      const response = await fetch('/api/audit/reconciliation-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });

      if (response && response.ok) {
        record.is_synced = true;
        const currentQueue = getLocalQueue();
        const idx = currentQueue.findIndex((q) => q.id === recordId);
        if (idx !== -1) {
          currentQueue[idx].is_synced = true;
          saveLocalQueue(currentQueue);
        }
      }
    } catch {
      // Retain as unsynced in queue; syncPendingAuditLogs will retry when connectivity resumes
    }
  }

  return record;
}

/**
 * Synchronizes any pending unsynced audit logs to the backend.
 * Returns the count of successfully synced records.
 */
export async function syncPendingAuditLogs(): Promise<number> {
  const queue = getLocalQueue();
  const unsynced = queue.filter((r) => !r.is_synced);
  if (unsynced.length === 0 || typeof fetch === 'undefined') return 0;

  let syncedCount = 0;
  for (const item of unsynced) {
    try {
      const res = await fetch('/api/audit/reconciliation-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (res && res.ok) {
        item.is_synced = true;
        syncedCount++;
      }
    } catch {
      // Cease attempting if connection is down
      break;
    }
  }

  if (syncedCount > 0) {
    saveLocalQueue(queue);
  }
  return syncedCount;
}

/**
 * Retrieves audit records matching the optional company name and gstin,
 * combining remote backend records with any pending local unsynced records.
 */
export async function getOverrideLogs(
  companyName?: string,
  clientGstin?: string
): Promise<AuditOverrideRecord[]> {
  const localItems = getLocalQueue().filter((r) => {
    if (companyName && r.company_name && r.company_name !== companyName) return false;
    if (clientGstin && r.client_gstin && r.client_gstin !== clientGstin) return false;
    return true;
  });

  if (typeof fetch === 'undefined') return localItems;

  try {
    const params = new URLSearchParams();
    if (companyName) params.append('company_name', companyName);
    if (clientGstin) params.append('client_gstin', clientGstin);

    const res = await fetch(`/api/audit/reconciliation-override?${params.toString()}`);
    if (res && res.ok) {
      const serverLogs: AuditOverrideRecord[] = await res.json();
      const map = new Map<string, AuditOverrideRecord>();

      // Server records take baseline
      for (const s of serverLogs) {
        map.set(s.id, { ...s, is_synced: true });
      }

      // Local unsynced records take precedence or append
      for (const l of localItems) {
        if (!map.has(l.id)) {
          map.set(l.id, l);
        }
      }

      return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
    }
  } catch {
    // Network unavailable, fall back to local items
  }

  return localItems.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Helper to clear local queue (useful in unit testing).
 */
export function clearLocalAuditQueue(): void {
  memoryQueue = [];
  try {
    const storage = getStorage();
    if (storage) {
      storage.removeItem(AUDIT_QUEUE_KEY);
    }
  } catch {
    // Ignore
  }
}

// Auto-register online listener in browser environment
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncPendingAuditLogs().catch(() => {});
  });
}
