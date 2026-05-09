import Fuse from 'fuse.js';

export interface InvoiceRecord {
  supplierName: string;
  gstin: string;
  invoiceNo: string;
  invoiceDate: string;
  igst: number;
  cgst: number;
  sgst: number;
  source: 'PR' | '2B';
  sourceLabel?: string;
  cleanedInvoice?: string;
  normalizedDate?: Date;
  financialYear?: string;
  // Optional compliance fields (for audit columns only)
  taxableValue?: number;
  filingStatus?: string;
  filingDate?: string;
}

export type MatchStatus =
  | 'Perfect Match'
  | 'Matched (Diff Date)'
  | 'Value Mismatch'
  | 'Invoice Missing'
  | 'Unmatched Vendor'
  // Legacy / sub-case statuses (kept for compatibility with existing UI tabs):
  | 'Matched'
  | 'Matched (Rounded)'
  | 'Mismatch'
  | 'Missing in 2B'
  | 'Missing in PR'
  | 'Possible Match'
  | 'Name Matched (No GSTIN)'
  | 'Wrong GSTIN'
  | 'Name Mismatch';

export interface ReconciliationResult {
  prRecord?: InvoiceRecord;
  twoBRecord?: InvoiceRecord;
  status: MatchStatus;
  gstDiff?: number;
  cgstDiff?: number;
  sgstDiff?: number;
  igstDiff?: number;
  taxableDiff?: number;
  remark?: string;
  matchMethod?: 'GSTIN' | 'Name (Fuzzy)';
}

export interface ReconciliationSummary {
  total: number;
  perfectMatch: number;
  valueMismatch: number;
  invoiceMissing: number;
  unmatchedVendor: number;
  missingInPR: number;
  // Back-compat aliases used by existing UI:
  matched: number;
  matchedRounded: number;
  mismatch: number;
  missingIn2B: number;
  possibleMatch: number;
  nameMatched: number;
  wrongGstin: number;
  nameMismatch: number;
}

// --- Cleaning helpers ---

export function cleanInvoiceNumber(inv: string): string {
  if (!inv) return '';
  return inv
    .replace(/[\/\-\_\s\.]/g, '')
    .replace(/^0+/, '')
    .toUpperCase();
}

export function normalizeGstin(gstin: string): string {
  // Strip whitespace, zero-width and hidden chars, uppercase.
  return (gstin || '')
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '')
    .toUpperCase();
}

export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  const dmy = s.match(/^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})$/);
  if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
  const ymd = s.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})$/);
  if (ymd) return new Date(+ymd[1], +ymd[2] - 1, +ymd[3]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function getFinancialYear(date: Date | null): string {
  if (!date) return 'UNKNOWN';
  const year = date.getFullYear();
  const month = date.getMonth();
  if (month >= 3) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

function parseNum(val: unknown): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const n = parseFloat(String(val).replace(/[₹,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

function prepareRecord(rec: InvoiceRecord): InvoiceRecord {
  const r = { ...rec };
  r.gstin = normalizeGstin(r.gstin);
  r.cleanedInvoice = cleanInvoiceNumber(r.invoiceNo);
  r.normalizedDate = parseDate(r.invoiceDate) || undefined;
  r.financialYear = getFinancialYear(r.normalizedDate || null);
  r.igst = parseNum(r.igst);
  r.cgst = parseNum(r.cgst);
  r.sgst = parseNum(r.sgst);
  return r;
}

function normalizeSupplierName(name: string): string {
  if (!name) return '';
  return name
    .toUpperCase()
    .replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY|ENTERPRISES?|TRADERS?|INDUSTRIES|AND|&)\b/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

const TOLERANCE = 1; // ±₹1

// --- Hierarchical reconciliation engine ---

export function reconcile(
  prRecords: InvoiceRecord[],
  twoBRecords: InvoiceRecord[]
): ReconciliationResult[] {
  const pr = prRecords.map(prepareRecord);
  const twoB = twoBRecords.map(prepareRecord);

  // Group 2B records by GSTIN for Step-1 lookup
  const twoBByGstin = new Map<string, number[]>();
  for (let j = 0; j < twoB.length; j++) {
    const g = twoB[j].gstin;
    if (!g) continue;
    if (!twoBByGstin.has(g)) twoBByGstin.set(g, []);
    twoBByGstin.get(g)!.push(j);
  }

  // Build a unique vendor index (by normalized name) for fuzzy fallback
  const vendorIndex: { name: string; normName: string; indices: number[] }[] = [];
  const vendorMap = new Map<string, number>();
  for (let j = 0; j < twoB.length; j++) {
    const norm = normalizeSupplierName(twoB[j].supplierName);
    if (!norm) continue;
    let pos = vendorMap.get(norm);
    if (pos === undefined) {
      pos = vendorIndex.length;
      vendorMap.set(norm, pos);
      vendorIndex.push({ name: twoB[j].supplierName, normName: norm, indices: [] });
    }
    vendorIndex[pos].indices.push(j);
  }
  const fuse = new Fuse(vendorIndex, {
    keys: ['normName'],
    threshold: 0.4,
    includeScore: true,
  });

  const results: ReconciliationResult[] = [];
  const matched2B = new Set<number>();

  for (let i = 0; i < pr.length; i++) {
    const p = pr[i];

    // ---- Step 1: Identify the party ----
    let candidateIdxs: number[] | null = null;
    let matchMethod: 'GSTIN' | 'Name (Fuzzy)' | undefined;
    let vendorRemark: string | undefined;

    if (p.gstin && twoBByGstin.has(p.gstin)) {
      candidateIdxs = twoBByGstin.get(p.gstin)!;
      matchMethod = 'GSTIN';
    } else {
      const pNorm = normalizeSupplierName(p.supplierName);
      if (pNorm) {
        const hits = fuse.search(pNorm).filter((h) => (h.score ?? 1) <= 0.4);
        if (hits.length > 0) {
          candidateIdxs = hits.flatMap((h) => h.item.indices);
          matchMethod = 'Name (Fuzzy)';
          vendorRemark = `Vendor matched by name (no GSTIN match). PR GSTIN: "${p.gstin || '—'}"`;
        }
      }
    }

    if (!candidateIdxs || candidateIdxs.length === 0) {
      results.push({ prRecord: p, status: 'Unmatched Vendor' });
      continue;
    }

    // ---- Step 2: Match invoice number within candidates ----
    const availableCandidates = candidateIdxs.filter((j) => !matched2B.has(j));
    const invoiceMatchIdx = availableCandidates.find(
      (j) => twoB[j].cleanedInvoice === p.cleanedInvoice && p.cleanedInvoice !== ''
    );

    if (invoiceMatchIdx === undefined) {
      results.push({
        prRecord: p,
        status: 'Invoice Missing',
        remark: vendorRemark || `Vendor found in 2B but invoice "${p.invoiceNo}" not present`,
        matchMethod,
      });
      continue;
    }

    const t = twoB[invoiceMatchIdx];

    // ---- Step 3: Verify GST values ----
    const cgstDiff = +(p.cgst - t.cgst).toFixed(2);
    const sgstDiff = +(p.sgst - t.sgst).toFixed(2);
    const igstDiff = +(p.igst - t.igst).toFixed(2);
    const gstDiff = +(Math.abs(cgstDiff) + Math.abs(sgstDiff) + Math.abs(igstDiff)).toFixed(2);
    const hasTaxable = typeof p.taxableValue === 'number' && typeof t.taxableValue === 'number';
    const taxableDiff = hasTaxable ? +((p.taxableValue! - t.taxableValue!)).toFixed(2) : undefined;

    const within =
      Math.abs(cgstDiff) <= TOLERANCE &&
      Math.abs(sgstDiff) <= TOLERANCE &&
      Math.abs(igstDiff) <= TOLERANCE &&
      (taxableDiff === undefined || Math.abs(taxableDiff) <= TOLERANCE);

    let status: MatchStatus = within ? 'Perfect Match' : 'Value Mismatch';

    // Date-bypass: if amounts/invoice/GSTIN are a perfect match but invoice
    // dates differ, mark as 'Matched (Diff Date)' instead of splitting.
    if (status === 'Perfect Match') {
      const pDate = p.normalizedDate ? p.normalizedDate.getTime() : null;
      const tDate = t.normalizedDate ? t.normalizedDate.getTime() : null;
      if (pDate !== null && tDate !== null && pDate !== tDate) {
        status = 'Matched (Diff Date)';
      }
    }

    // Cross-flag wrong GSTIN if matched by name but GSTINs differ
    let extraRemark = vendorRemark;
    if (matchMethod === 'Name (Fuzzy)' && p.gstin && t.gstin && p.gstin !== t.gstin) {
      extraRemark = `Wrong GSTIN — PR: "${p.gstin}" vs 2B: "${t.gstin}"`;
    }

    results.push({
      prRecord: p,
      twoBRecord: t,
      status,
      gstDiff,
      cgstDiff,
      sgstDiff,
      igstDiff,
      remark: extraRemark,
      matchMethod,
    });
    matched2B.add(invoiceMatchIdx);
  }

  // 2B records with no PR counterpart
  for (let j = 0; j < twoB.length; j++) {
    if (!matched2B.has(j)) {
      results.push({ twoBRecord: twoB[j], status: 'Missing in PR' });
    }
  }

  return results;
}

export function getSummary(results: ReconciliationResult[]): ReconciliationSummary {
  const count = (s: MatchStatus) => results.filter((r) => r.status === s).length;
  const perfectMatch = count('Perfect Match');
  const valueMismatch = count('Value Mismatch');
  const invoiceMissing = count('Invoice Missing');
  const unmatchedVendor = count('Unmatched Vendor');
  const missingInPR = count('Missing in PR');

  return {
    total: results.length,
    perfectMatch,
    valueMismatch,
    invoiceMissing,
    unmatchedVendor,
    missingInPR,
    // Back-compat aliases for existing UI tabs / cards
    matched: perfectMatch,
    matchedRounded: 0,
    mismatch: valueMismatch,
    missingIn2B: invoiceMissing + unmatchedVendor,
    possibleMatch: 0,
    nameMatched: results.filter((r) => r.matchMethod === 'Name (Fuzzy)').length,
    wrongGstin: results.filter((r) => r.remark?.startsWith('Wrong GSTIN')).length,
    nameMismatch: 0,
  };
}
