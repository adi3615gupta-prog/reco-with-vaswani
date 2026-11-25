/**
 * IndexedDB Key-Value Storage Layer
 * =================================
 * Provides persistent asynchronous storage for large reconciliation datasets (> 5MB)
 * that exceed browser sessionStorage / localStorage quotas and avoid freezing the main thread.
 */

const DB_NAME = 'np_reco_db';
const DB_VERSION = 1;
const STORE_NAME = 'reco_cache';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'));
  }

  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error('Failed to open IndexedDB'));
      };

      request.onblocked = () => {
        console.warn('[idbStorage] Database open blocked by another tab');
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });

  return dbPromise;
}

/**
 * Store a key-value pair in IndexedDB.
 */
export async function idbSet<T = any>(key: string, value: T): Promise<void> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error(`Failed to store key "${key}"`));
      tx.onerror = () => reject(tx.error || new Error(`Transaction error on key "${key}"`));
    });
  } catch (err) {
    console.warn(`[idbStorage] idbSet failed for key "${key}":`, err);
  }
}

/**
 * Retrieve a value by key from IndexedDB.
 */
export async function idbGet<T = any>(key: string): Promise<T | null> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        resolve(req.result !== undefined ? (req.result as T) : null);
      };
      req.onerror = () => reject(req.error || new Error(`Failed to read key "${key}"`));
      tx.onerror = () => reject(tx.error || new Error(`Transaction error on read "${key}"`));
    });
  } catch (err) {
    console.warn(`[idbStorage] idbGet failed for key "${key}":`, err);
    return null;
  }
}

/**
 * Remove a specific key from IndexedDB.
 */
export async function idbRemove(key: string): Promise<void> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error(`Failed to delete key "${key}"`));
      tx.onerror = () => reject(tx.error || new Error(`Transaction error on delete "${key}"`));
    });
  } catch (err) {
    console.warn(`[idbStorage] idbRemove failed for key "${key}":`, err);
  }
}

/**
 * Clear all records in the reco cache store.
 */
export async function idbClear(): Promise<void> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to clear store'));
      tx.onerror = () => reject(tx.error || new Error('Transaction error on clear'));
    });
  } catch (err) {
    console.warn('[idbStorage] idbClear failed:', err);
  }
}

