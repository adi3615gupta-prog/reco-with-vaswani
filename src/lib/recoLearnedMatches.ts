/**
 * Auto-Match Learning & Dis-match Rejection Store
 * ================================================
 * Remembers pairs rejected or dis-matched by the user during Auto-Match Review,
 * ensuring the matching engine never repeats the same mistake in future runs.
 */

export interface DismatchRule {
  key: string;
  gstin: string;
  partyName?: string;
  prInvoiceNo: string;
  twoBInvoiceNo: string;
  prTaxable?: number;
  twoBTaxable?: number;
  reason?: string;
  createdAt: string;
}

const STORAGE_KEY = 'vaswani_reco_learned_dismatches';

let memoryCache: Record<string, DismatchRule> | null = null;

export function makeDismatchKey(gstin: string | undefined, prInvoiceNo: string | undefined, twoBInvoiceNo: string | undefined): string {
  const cleanGstin = (gstin || 'ANY').trim().toUpperCase();
  const cleanPr = (prInvoiceNo || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const clean2B = (twoBInvoiceNo || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${cleanGstin}__${cleanPr}__${clean2B}`;
}

function getStore(): Record<string, DismatchRule> {
  if (memoryCache !== null) return memoryCache;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      memoryCache = raw ? JSON.parse(raw) : {};
      return memoryCache!;
    } catch {}
  }
  memoryCache = {};
  return memoryCache;
}

function persistStore(store: Record<string, DismatchRule>): void {
  memoryCache = store;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {}
  }
}

export function getLearnedDismatches(): Record<string, DismatchRule> {
  return { ...getStore() };
}

export function getLearnedDismatchesCount(): number {
  return Object.keys(getStore()).length;
}

export function isPairDismatched(
  gstin: string | undefined,
  prInvoiceNo: string | undefined,
  twoBInvoiceNo: string | undefined
): boolean {
  if (!prInvoiceNo || !twoBInvoiceNo) return false;
  const store = getStore();
  
  const cleanGstin = (gstin || 'ANY').trim().toUpperCase();
  const cleanPr = (prInvoiceNo || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const clean2B = (twoBInvoiceNo || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (!cleanPr || !clean2B) return false;

  // Check specific GSTIN rule or fallback ANY rule
  const specificKey = `${cleanGstin}__${cleanPr}__${clean2B}`;
  const anyKey = `ANY__${cleanPr}__${clean2B}`;

  return !!(store[specificKey] || store[anyKey]);
}

export function saveLearnedDismatch(
  gstin: string | undefined,
  prInvoiceNo: string,
  twoBInvoiceNo: string,
  extra?: { partyName?: string; prTaxable?: number; twoBTaxable?: number; reason?: string }
): void {
  const key = makeDismatchKey(gstin, prInvoiceNo, twoBInvoiceNo);
  const current = getStore();
  current[key] = {
    key,
    gstin: (gstin || 'ANY').trim().toUpperCase(),
    partyName: extra?.partyName,
    prInvoiceNo,
    twoBInvoiceNo,
    prTaxable: extra?.prTaxable,
    twoBTaxable: extra?.twoBTaxable,
    reason: extra?.reason || 'Dis-matched during Auto-Match Review',
    createdAt: new Date().toISOString(),
  };
  persistStore(current);
}

export function saveBatchLearnedDismatches(
  items: Array<{
    gstin?: string;
    prInvoiceNo: string;
    twoBInvoiceNo: string;
    partyName?: string;
    prTaxable?: number;
    twoBTaxable?: number;
    reason?: string;
  }>
): void {
  if (items.length === 0) return;
  const current = getStore();
  const now = new Date().toISOString();

  for (const item of items) {
    const key = makeDismatchKey(item.gstin, item.prInvoiceNo, item.twoBInvoiceNo);
    current[key] = {
      key,
      gstin: (item.gstin || 'ANY').trim().toUpperCase(),
      partyName: item.partyName,
      prInvoiceNo: item.prInvoiceNo,
      twoBInvoiceNo: item.twoBInvoiceNo,
      prTaxable: item.prTaxable,
      twoBTaxable: item.twoBTaxable,
      reason: item.reason || 'Dis-matched during Auto-Match Review',
      createdAt: now,
    };
  }

  persistStore(current);
}

export function removeLearnedDismatch(key: string): void {
  const current = getStore();
  delete current[key];
  persistStore(current);
}

export function clearLearnedDismatches(): void {
  memoryCache = {};
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
}
