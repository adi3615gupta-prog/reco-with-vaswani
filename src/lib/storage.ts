import { type ReconciliationResult, type ReconciliationSummary, type InvoiceRecord, type GstinIssue } from './reconciliation';
import { type DebitNoteRecord } from './fileParser';
import { type ReconciliationMode } from './mode';

const DB_NAME = 'NovaPayRecoDB';
const STORE_NAME = 'CompanySessions';

export interface SavedSession {
  id: string;
  companyName: string;
  mode: ReconciliationMode;
  timestamp: number;
  prRecords: InvoiceRecord[];
  twoBRecords: InvoiceRecord[];
  parsedDebitNotes: { pr: DebitNoteRecord[]; twoB: DebitNoteRecord[] };
  results: ReconciliationResult[];
  summary: ReconciliationSummary;
  gstinIssues: GstinIssue[];
}

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSession(session: SavedSession): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllSessions(): Promise<SavedSession[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const results = request.result as SavedSession[];
      resolve(results.sort((a, b) => b.timestamp - a.timestamp));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteSession(id: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}