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
  | 'Not in 2B'
  | 'Unmatched Vendor'
  | 'Not in Books'
  | 'Tax Type Error'
  | 'Prior FY (Excluded)'
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
  matchMethod?: 'GSTIN' | 'PAN' | 'Name (Exact)' | 'Name (Fuzzy)';
}

export interface GstinIssue {
  id: string;
  supplierName: string;
  source: 'PR' | '2B';
  originalGstin: string;
  currentGstin: string;
  suggestedGstin?: string;
  suggestedName?: string;
  issueType: string;
  relatedParties?: string[];
}

export interface ReconciliationSummary {
  total: number;
  perfectMatch: number;
  valueMismatch: number;
  invoiceMissing: number;
  unmatchedVendor: number;
  missingInPR: number;
  taxTypeError: number;
  priorFyExcluded: number;
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

export function extractCoreInvoiceNumber(inv: string): string {
  if (!inv) return '';
  let s = String(inv).toUpperCase().trim();
  
  // 1. Remove financial year tokens (e.g. 2024-25, 2024-2025, 24-25, FY24-25) where y2 - y1 = 1
  s = s.replace(/(?:FY\s*)?20(\d{2})[-/\\]+(?:20)?(\d{2})/gi, (match, y1, y2) => {
    const diff = (parseInt(y2, 10) - parseInt(y1, 10) + 100) % 100;
    return diff === 1 ? '' : match;
  });
  s = s.replace(/(?:FY\s*)?(\d{2})[-/\\]+(\d{2})/gi, (match, y1, y2) => {
    const diff = (parseInt(y2, 10) - parseInt(y1, 10) + 100) % 100;
    return diff === 1 ? '' : match;
  });
  
  // 2. Remove standalone 4-digit years (e.g. 2024, 2025)
  s = s.replace(/(?:^|[^0-9])(?:20\d{2}|19\d{2})(?=[^0-9]|$)/g, '');
  
  // 3. Extract numeric sequences and strip leading zeros
  const digitMatches = s.match(/\d+/g);
  if (digitMatches && digitMatches.length > 0) {
    const lastSeq = digitMatches[digitMatches.length - 1];
    const stripped = lastSeq.replace(/^0+/, '');
    if (stripped) return stripped;
  }
  
  // 4. Fallback to cleaned alphanumeric string stripped of leading zeros
  return s.replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
}

export function cleanInvoiceNumber(inv: string): string {
  if (!inv) return '';
  let cleaned = String(inv).toUpperCase();
  
  // 1. Normalize financial years: 2025-26, 25-26, 2025-2026 -> 2526
  cleaned = cleaned.replace(/(?:20)?(\d{2})[\/\-\\]+(?:20)?(\d{2})(?!\d)/g, '$1$2');
  
  // 2. Strip leading zeros from any numeric sequence (e.g. INV/0045 -> INV/45, INV0045 -> INV45)
  cleaned = cleaned.replace(/(^|[^\d])0+(?=\d)/g, '$1');
  
  // 3. Remove all non-alphanumeric characters
  return cleaned.replace(/[^A-Z0-9]/g, '');
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

  const dmyText = s.match(/^(\d{1,2})[\-\/\s]([A-Za-z]{3})[\-\/\s](\d{2,4})$/);
  if (dmyText) {
    const dd = +dmyText[1];
    const monthStr = dmyText[2].toLowerCase();
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mm = months.indexOf(monthStr);
    if (mm !== -1) {
      let yy = +dmyText[3]; if (yy < 100) yy += 2000;
      return new Date(yy, mm, dd);
    }
  }

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
  // Round off all values to the nearest rupee per Section 170 of CGST Act
  r.igst = Math.round(parseNum(r.igst));
  r.cgst = Math.round(parseNum(r.cgst));
  r.sgst = Math.round(parseNum(r.sgst));
  if (r.taxableValue !== undefined) r.taxableValue = Math.round(parseNum(r.taxableValue));
  return r;
}

export function normalizePartyName(name: string): string {
  if (!name) return '';
  let n = name.toUpperCase()
    .replace(/[-\s\(\)]+(CR|DR)\b$/g, '')
    .replace(/\b(M\/S\.?|MS\.?|MR\.?|MRS\.?|SHREE|SHRI)\b/g, '')
    .replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY|CORP|CORPORATION|ENTERPRISES?|TRADERS?|INDUSTRIES|AGENC(?:Y|IES)|BROTHERS|BROS|SONS|ASSOCIATES|AND|&)\b/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim();
  if (n.endsWith('S')) n = n.slice(0, -1);
  return n;
}

// --- Hierarchical reconciliation engine ---

export function reconcile(
  prRecords: InvoiceRecord[],
  twoBRecords: InvoiceRecord[],
  mode: 'input' | 'output' = 'input',
  tolerance: number = 2,
  partyTolerance: number = 5
): ReconciliationResult[] {
  const pr = prRecords.map(prepareRecord);

  // Determine current FY from PR records to identify the active reconciliation period
  let currentFY = 'UNKNOWN';
  let currentStartYear = 0;
  if (pr.length > 0) {
    const fyCounts = new Map<string, number>();
    let maxCount = 0;
    for (const p of pr) {
      if (p.financialYear && p.financialYear !== 'UNKNOWN') {
        const count = (fyCounts.get(p.financialYear) || 0) + 1;
        fyCounts.set(p.financialYear, count);
        if (count > maxCount) {
          maxCount = count;
          currentFY = p.financialYear;
        }
      }
    }
    if (currentFY !== 'UNKNOWN') {
      currentStartYear = parseInt(currentFY.split('-')[0], 10);
    }
  }

  const validTwoB: InvoiceRecord[] = [];
  const priorTwoB: InvoiceRecord[] = [];
  for (const t of twoBRecords) {
    const prepared = prepareRecord(t);
    let isPrior = false;
    if (currentStartYear > 0 && prepared.financialYear && prepared.financialYear !== 'UNKNOWN') {
      const tStartYear = parseInt(prepared.financialYear.split('-')[0], 10);
      if (tStartYear < currentStartYear) {
        isPrior = true;
      }
    }
    if (isPrior) priorTwoB.push(prepared);
    else validTwoB.push(prepared);
  }
  const twoB = validTwoB;

  // Group 2B records by GSTIN for Step-1 lookup
  const twoBByGstin = new Map<string, number[]>();
  // Group 2B records by Exact Normalized Name for Step-2 lookup
  const twoBByNormName = new Map<string, number[]>();
  // Group 2B records by PAN (Middle 10 chars of GSTIN) for cross-state matching
  const twoBByPan = new Map<string, number[]>();
  
  for (let j = 0; j < twoB.length; j++) {
    const g = twoB[j].gstin;
    if (!g) continue;
    if (!twoBByGstin.has(g)) twoBByGstin.set(g, []);
    twoBByGstin.get(g)!.push(j);
    
    if (g.length >= 14) {
      const pan = g.slice(2, 12);
      if (!twoBByPan.has(pan)) twoBByPan.set(pan, []);
      twoBByPan.get(pan)!.push(j);
    }

    const norm = normalizePartyName(twoB[j].supplierName);
    if (norm) {
      if (!twoBByNormName.has(norm)) twoBByNormName.set(norm, []);
      twoBByNormName.get(norm)!.push(j);
    }
  }

  // Build a unique vendor index (by normalized name) for fuzzy fallback (Step-3)
  const vendorIndex: { name: string; normName: string; indices: number[] }[] = [];
  const vendorMap = new Map<string, number>();
  for (let j = 0; j < twoB.length; j++) {
    const norm = normalizePartyName(twoB[j].supplierName);
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

  type MatchCandidate = {
    pIndex: number;
    pRecord: InvoiceRecord;
    candidateIdxs: number[];
    invoiceMatchIdx?: number;
    matchMethod?: 'GSTIN' | 'PAN' | 'Name (Exact)' | 'Name (Fuzzy)';
    vendorRemark?: string;
  };

  const pendingPR: MatchCandidate[] = [];

  // Pass 1: Strict & Fuzzy Invoice / Value Matching
  for (let i = 0; i < pr.length; i++) {
    const p = pr[i];

    let candidateIdxs: number[] | null = null;
    let matchMethod: 'GSTIN' | 'PAN' | 'Name (Exact)' | 'Name (Fuzzy)' | undefined;
    let vendorRemark: string | undefined;
    
    const isOut = mode === 'output';
    const partyType = isOut ? 'Customer' : 'Vendor';
    const govtName = isOut ? 'GSTR-1' : '2B';
    const bookName = isOut ? 'Sales' : 'PR';

    const pNorm = normalizePartyName(p.supplierName);
    const pPan = p.gstin && p.gstin.length >= 14 ? p.gstin.slice(2, 12) : null;

    if (p.gstin && twoBByGstin.has(p.gstin)) {
      candidateIdxs = twoBByGstin.get(p.gstin)!;
      matchMethod = 'GSTIN';
    } else if (pPan && twoBByPan.has(pPan)) {
      candidateIdxs = twoBByPan.get(pPan)!;
      matchMethod = 'PAN';
      vendorRemark = `Cross-State / PAN Match. ${bookName} GSTIN: "${p.gstin}" vs ${govtName} GSTIN: "${twoB[candidateIdxs[0]].gstin}"`;
    } else if (pNorm && twoBByNormName.has(pNorm)) {
      candidateIdxs = twoBByNormName.get(pNorm)!;
      matchMethod = 'Name (Exact)';
      vendorRemark = `${partyType} matched by exact name (GSTIN missing/mismatch). ${bookName} GSTIN: "${p.gstin || '—'}"`;
    } else {
      let foundSubstring = false;
      if (pNorm && pNorm.length >= 5) {
        const tempCandidates: number[] = [];
        for (let j = 0; j < twoB.length; j++) {
          const tNorm = normalizePartyName(twoB[j].supplierName);
          if (tNorm && tNorm.length >= 5 && (pNorm.includes(tNorm) || tNorm.includes(pNorm))) {
            tempCandidates.push(j);
            foundSubstring = true;
          }
        }
        if (foundSubstring && tempCandidates.length > 0) {
          candidateIdxs = Array.from(new Set(tempCandidates));
          matchMethod = 'Name (Fuzzy)';
          vendorRemark = `${partyType} matched by name substring fallback (GSTIN missing/mismatch). ${bookName} GSTIN: "${p.gstin || '—'}"`;
        }
      }

      if (!foundSubstring && pNorm && pNorm.length >= 4) {
        const hits = fuse.search(pNorm).filter((h) => (h.score ?? 1) <= 0.25);
        if (hits.length > 0) {
          candidateIdxs = hits.flatMap((h) => h.item.indices);
          matchMethod = 'Name (Fuzzy)';
          vendorRemark = `${partyType} matched by fuzzy name (GSTIN missing/mismatch). ${bookName} GSTIN: "${p.gstin || '—'}"`;
        }
      }
    }

    if (!candidateIdxs || candidateIdxs.length === 0) {
      results.push({
        prRecord: p,
        status: 'Not in 2B',
        cgstDiff: p.cgst, sgstDiff: p.sgst, igstDiff: p.igst, gstDiff: p.cgst + p.sgst + p.igst,
        taxableDiff: p.taxableValue,
        remark: `${partyType} "${p.supplierName}" not found in ${govtName}`,
      });
      continue;
    }

    const availableCandidates = candidateIdxs.filter((j) => !matched2B.has(j));
    let invoiceMatchIdx = availableCandidates.find(
      (j) => twoB[j].cleanedInvoice === p.cleanedInvoice && p.cleanedInvoice !== ''
    );

    if (invoiceMatchIdx === undefined && p.invoiceNo) {
      const pCore = extractCoreInvoiceNumber(p.invoiceNo);
      if (pCore) {
        const coreMatchIdx = availableCandidates.find((j) => {
          const tCore = extractCoreInvoiceNumber(twoB[j].invoiceNo);
          return tCore !== '' && tCore === pCore;
        });
        if (coreMatchIdx !== undefined) {
          invoiceMatchIdx = coreMatchIdx;
          vendorRemark = vendorRemark ? `${vendorRemark} | Matched by core invoice number` : 'Matched by core invoice number';
        }
      }
    }

    if (invoiceMatchIdx === undefined && p.cleanedInvoice) {
      const fallbackIdx = availableCandidates.find((j) => {
        const t = twoB[j];
        const pInv = p.cleanedInvoice!;
        const tInv = t.cleanedInvoice!;
        if (!tInv) return false;
        
        const pRaw = (p.invoiceNo || '').trim().toUpperCase();
        const tRaw = (t.invoiceNo || '').trim().toUpperCase();

        const pNum = pRaw.replace(/\D/g, '');
        const tNum = tRaw.replace(/\D/g, '');
        
        // Exact numeric match (e.g. "0012" vs "12" -> pNum = "12", tNum = "12")
        if (pNum && tNum && pNum === tNum) {
          return true;
        }

        // Bounded string prefix/suffix match for strings with length >= 3 (e.g., "INV-2024-0012" vs "0012")
        if (pRaw.length >= 3 && tRaw.length >= 3) {
          if (pRaw.startsWith(tRaw) || pRaw.endsWith(tRaw) || tRaw.startsWith(pRaw) || tRaw.endsWith(pRaw)) {
            return true;
          }
        }
        
        return false;
      });
      if (fallbackIdx !== undefined) {
        invoiceMatchIdx = fallbackIdx;
        vendorRemark = vendorRemark ? `${vendorRemark} | Matched by partial invoice` : 'Matched by partial invoice no.';
      }
    }

    if (invoiceMatchIdx === undefined) {
      const fuzzyIdx = availableCandidates.find((j) => {
        const t = twoB[j];
        
        // If BOTH records have explicit non-matching invoice numbers, do NOT pair them
        if (p.cleanedInvoice && t.cleanedInvoice && p.cleanedInvoice !== t.cleanedInvoice) {
          return false;
        }

        const valMatch = 
               Math.abs(p.igst - t.igst) <= tolerance && 
               Math.abs(p.cgst - t.cgst) <= tolerance && 
               Math.abs(p.sgst - t.sgst) <= tolerance &&
               (p.igst > 0 || p.cgst > 0 || p.sgst > 0);
        
        if (!valMatch) return false;

        if (p.normalizedDate && t.normalizedDate) {
          const diffDays = Math.abs(p.normalizedDate.getTime() - t.normalizedDate.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays <= 15) return true;
        }
        
        if (!p.cleanedInvoice && !t.cleanedInvoice) return true;

        return false;
      });
      
      if (fuzzyIdx !== undefined) {
        invoiceMatchIdx = fuzzyIdx;
        vendorRemark = vendorRemark ? `${vendorRemark} | Matched by value and approx date` : 'Matched by value and approx date';
      }
    }

    if (invoiceMatchIdx !== undefined) {
      matched2B.add(invoiceMatchIdx);
      processMatchedPair(p, twoB[invoiceMatchIdx], matchMethod, vendorRemark);
    } else {
      results.push({
        prRecord: p,
        status: 'Not in 2B',
        remark: vendorRemark || `${partyType} found in ${govtName} but invoice "${p.invoiceNo}" not present`,
        matchMethod,
        cgstDiff: p.cgst, sgstDiff: p.sgst, igstDiff: p.igst, gstDiff: p.cgst + p.sgst + p.igst,
        taxableDiff: p.taxableValue,
      });
    }
  }

  function processMatchedPair(
    p: InvoiceRecord,
    t: InvoiceRecord,
    matchMethod?: 'GSTIN' | 'PAN' | 'Name (Exact)' | 'Name (Fuzzy)',
    vendorRemark?: string
  ) {
    const isOut = mode === 'output';
    const govtName = isOut ? 'GSTR-1' : '2B';
    const bookName = isOut ? 'Sales' : 'PR';

    const cgstDiff = +(p.cgst - t.cgst).toFixed(2);
    const sgstDiff = +(p.sgst - t.sgst).toFixed(2);
    const igstDiff = +(p.igst - t.igst).toFixed(2);
    const gstDiff = +(Math.abs(cgstDiff) + Math.abs(sgstDiff) + Math.abs(igstDiff)).toFixed(2);
    const hasTaxable = typeof p.taxableValue === 'number' && typeof t.taxableValue === 'number';
    const taxableDiff = hasTaxable ? +((p.taxableValue! - t.taxableValue!)).toFixed(2) : undefined;

    const within =
      Math.abs(cgstDiff) <= tolerance &&
      Math.abs(sgstDiff) <= tolerance &&
      Math.abs(igstDiff) <= tolerance;

    let status: MatchStatus = within ? 'Perfect Match' : 'Value Mismatch';

    if ((p.igst > 0 && (p.cgst > 0 || p.sgst > 0)) || (t.igst > 0 && (t.cgst > 0 || t.sgst > 0))) {
      status = 'Tax Type Error';
    }

    if (status === 'Perfect Match') {
      const pDate = p.normalizedDate ? p.normalizedDate.getTime() : null;
      const tDate = t.normalizedDate ? t.normalizedDate.getTime() : null;
      if (pDate !== null && tDate !== null && pDate !== tDate) {
        status = 'Matched (Diff Date)';
      }
    }

    let extraRemark = vendorRemark;
    if ((matchMethod === 'Name (Fuzzy)' || matchMethod === 'Name (Exact)') && p.gstin && t.gstin && p.gstin !== t.gstin) {
      extraRemark = `Wrong GSTIN — ${bookName}: "${p.gstin}" vs ${govtName}: "${t.gstin}"`;
    }

    if (within && taxableDiff !== undefined && Math.abs(taxableDiff) > tolerance) {
      extraRemark = extraRemark ? `${extraRemark} | Taxable Value differs by ₹${taxableDiff}` : `Taxable Value differs by ₹${taxableDiff}`;
    }

    results.push({
      prRecord: p,
      twoBRecord: t,
      status,
      gstDiff,
      cgstDiff,
      sgstDiff,
      igstDiff,
      taxableDiff,
      remark: extraRemark,
      matchMethod,
    });
  }

  // 2B records with no PR counterpart — build descriptive remark mirroring "Not in 2B" style
  // Build reverse-lookup indexes for PR records
  const prGstinSet = new Set<string>();
  const prNormNameSet = new Set<string>();
  for (const p of pr) {
    if (p.gstin) prGstinSet.add(p.gstin);
    const pn = normalizePartyName(p.supplierName);
    if (pn) prNormNameSet.add(pn);
  }

  const isOut = mode === 'output';
  const partyTypeRev = isOut ? 'Customer' : 'Vendor';
  const bookNameRev = isOut ? 'Sales' : 'Books';

  for (let j = 0; j < twoB.length; j++) {
    if (!matched2B.has(j)) {
      const t = twoB[j];
      let notInBooksRemark = '';
      const tNorm = normalizePartyName(t.supplierName);
      if (t.gstin && prGstinSet.has(t.gstin)) {
        notInBooksRemark = `${partyTypeRev} found in ${bookNameRev} but invoice "${t.invoiceNo}" not present`;
      } else if (tNorm && prNormNameSet.has(tNorm)) {
        notInBooksRemark = `${partyTypeRev} matched by exact name (GSTIN missing/mismatch). Invoice "${t.invoiceNo}" not in ${bookNameRev}`;
      } else {
        notInBooksRemark = `${partyTypeRev} not found in ${bookNameRev}. Invoice "${t.invoiceNo}"`;
      }

      results.push({
        twoBRecord: t,
        status: 'Not in Books',
        remark: notInBooksRemark,
        cgstDiff: -t.cgst, sgstDiff: -t.sgst, igstDiff: -t.igst, gstDiff: -(t.cgst + t.sgst + t.igst),
        taxableDiff: t.taxableValue !== undefined ? -t.taxableValue : undefined,
      });
    }
  }

  for (const t of priorTwoB) {
    results.push({
      twoBRecord: t,
      status: 'Prior FY (Excluded)',
      remark: `Excluded: Invoice belongs to previous FY (${t.financialYear})`,
      cgstDiff: 0, sgstDiff: 0, igstDiff: 0, gstDiff: 0,
      taxableDiff: 0,
    });
  }

  // ---- Post-process: Auto-clear records if Party Net Balance is Nil ----
  const gstinToName = new Map<string, string>();
  const panToName = new Map<string, string>();
  
  for (const r of results) {
    if (r.status === 'Prior FY (Excluded)') continue;
    const pr = r.prRecord;
    const tb = r.twoBRecord;
    const name = pr?.supplierName || tb?.supplierName || '';
    const normName = normalizePartyName(name);
    if (!normName) continue;
    
    const gstin = pr?.gstin || tb?.gstin || '';
    if (gstin) {
      gstinToName.set(gstin, normName);
      if (gstin.length >= 12) {
        panToName.set(gstin.slice(2, 12), normName);
      }
    }
  }

  const partyMap = new Map<string, { records: ReconciliationResult[]; prIgst: number; prCgst: number; prSgst: number; tbIgst: number; tbCgst: number; tbSgst: number; }>();
  let unknownIndex = 0;

  for (const r of results) {
    if (r.status === 'Prior FY (Excluded)') continue;
    const pr = r.prRecord;
    const tb = r.twoBRecord;
    const name = pr?.supplierName || tb?.supplierName || '';
    const normName = normalizePartyName(name);
    const gstin = pr?.gstin || tb?.gstin || '';
    
    let key = '';
    if (normName) {
      key = normName;
    } else if (gstin) {
      if (gstinToName.has(gstin)) {
        key = gstinToName.get(gstin)!;
      } else if (gstin.length >= 12 && panToName.has(gstin.slice(2, 12))) {
        key = panToName.get(gstin.slice(2, 12))!;
      } else {
        key = gstin;
      }
    } else {
      key = `UNKNOWN::${++unknownIndex}`;
    }

    let pAgg = partyMap.get(key);
    if (!pAgg) {
      pAgg = { records: [], prIgst: 0, prCgst: 0, prSgst: 0, tbIgst: 0, tbCgst: 0, tbSgst: 0 };
      partyMap.set(key, pAgg);
    }
    pAgg.records.push(r);
    if (pr) { pAgg.prIgst += pr.igst; pAgg.prCgst += pr.cgst; pAgg.prSgst += pr.sgst; }
    if (tb) { pAgg.tbIgst += tb.igst; pAgg.tbCgst += tb.cgst; pAgg.tbSgst += tb.sgst; }
  }

  for (const pAgg of partyMap.values()) {
    const igstDiff = Math.abs(pAgg.prIgst - pAgg.tbIgst);
    const cgstDiff = Math.abs(pAgg.prCgst - pAgg.tbCgst);
    const sgstDiff = Math.abs(pAgg.prSgst - pAgg.tbSgst);

    if (igstDiff <= partyTolerance && cgstDiff <= partyTolerance && sgstDiff <= partyTolerance) {
      for (const r of pAgg.records) {
        if (r.status === 'Not in 2B' || r.status === 'Not in Books' || r.status === 'Missing in PR' || r.status === 'Unmatched Vendor' || r.status === 'Value Mismatch') {
          // Note: Instead of artificially marking mismatched invoices as "Perfect Match",
          // we only append a remark, preserving the actual invoice discrepancy for the UI.
          r.remark = r.remark ? `${r.remark} | Note: Party Net Balance is Nil` : 'Note: Party Net Balance is Nil';
        }
      }
    }
  }

  return results;
}

export function getSummary(results: ReconciliationResult[]): ReconciliationSummary {
  const count = (s: MatchStatus) => results.filter((r) => r.status === s).length;
  const perfectMatch = count('Perfect Match') + count('Matched (Diff Date)');
  const valueMismatch = count('Value Mismatch');
  const invoiceMissing = count('Not in 2B');
  const unmatchedVendor = count('Unmatched Vendor');
  const missingInPR = count('Not in Books') + count('Missing in PR');
  const priorFyExcluded = count('Prior FY (Excluded)');

  return {
    total: results.length,
    perfectMatch,
    valueMismatch: results.filter((r) => r.status === 'Value Mismatch').length,
    invoiceMissing: results.filter((r) => r.status === 'Not in 2B').length,
    unmatchedVendor: results.filter((r) => r.status === 'Unmatched Vendor').length,
    missingInPR: results.filter((r) => r.status === 'Missing in PR' || r.status === 'Not in Books').length,
    taxTypeError: results.filter((r) => r.status === 'Tax Type Error').length,
    priorFyExcluded,
    // Back-compat aliases for existing UI tabs / cards
    matched: perfectMatch,
    matchedRounded: 0,
    mismatch: valueMismatch,
    missingIn2B: invoiceMissing + unmatchedVendor,
    possibleMatch: 0,
    nameMatched: results.filter((r) => r.matchMethod === 'Name (Fuzzy)' || r.matchMethod === 'Name (Exact)').length,
    wrongGstin: results.filter((r) => r.remark?.startsWith('Wrong GSTIN')).length,
    nameMismatch: 0,
  };
}

export function detectGstinIssues(results: ReconciliationResult[]): { suggested: GstinIssue[]; conflicts: GstinIssue[] } {
  const suggested: GstinIssue[] = [];
  const conflicts: GstinIssue[] = [];
  const seenSugg = new Set<string>();

  // 1. Group records by normalized party name to catch missing/wrong GSTINs across unmatched invoices
  const partyRecords = new Map<string, { prGstins: Set<string>; tbGstins: Set<string>; prNames: Set<string>; tbNames: Set<string>; }>();
  for (const r of results) {
    if (r.status === 'Prior FY (Excluded)') continue;
    const pr = r.prRecord;
    const tb = r.twoBRecord;
    const prName = pr?.supplierName || '';
    const tbName = tb?.supplierName || '';
    const name = prName || tbName;
    if (!name) continue;
    const norm = normalizePartyName(name);
    if (!partyRecords.has(norm)) {
      partyRecords.set(norm, { prGstins: new Set(), tbGstins: new Set(), prNames: new Set(), tbNames: new Set() });
    }
    const grp = partyRecords.get(norm)!;
    if (pr) {
      if (pr.gstin) grp.prGstins.add(pr.gstin);
      if (prName) grp.prNames.add(prName);
    }
    if (tb) {
      if (tb.gstin) grp.tbGstins.add(tb.gstin);
      if (tbName) grp.tbNames.add(tbName);
    }
  }

  for (const [norm, grp] of partyRecords.entries()) {
    const partyNameBooks = [...grp.prNames][0] || [...grp.tbNames][0] || '';
    const partyNameGovt = [...grp.tbNames][0] || [...grp.prNames][0] || '';

    if (grp.tbGstins.size > 0) {
      // If there are no GSTINs in books, it's missing
      if (grp.prGstins.size === 0) {
        for (const gstin2B of grp.tbGstins) {
          const key = `${partyNameBooks}::${gstin2B}`;
          if (!seenSugg.has(key)) {
            seenSugg.add(key);
            suggested.push({
              id: key,
              supplierName: partyNameBooks,
              source: 'PR',
              originalGstin: '',
              currentGstin: '',
              suggestedGstin: gstin2B,
              suggestedName: partyNameGovt,
              issueType: 'Missing GSTIN',
            });
          }
        }
      } else {
        // A GSTIN in Books is only wrong if it is NOT present in the GSTR-2B GSTINs for this party
        for (const gstinPR of grp.prGstins) {
          if (!grp.tbGstins.has(gstinPR)) {
            // Find the best GSTR-2B GSTIN to suggest: preferably one with the same PAN
            const panPR = gstinPR.length >= 12 ? gstinPR.slice(2, 12) : '';
            let bestGstin = [...grp.tbGstins][0];
            if (panPR) {
              const matchingPan = [...grp.tbGstins].find((g) => g.length >= 12 && g.slice(2, 12) === panPR);
              if (matchingPan) {
                bestGstin = matchingPan;
              }
            }

            const key = `${partyNameBooks}::${bestGstin}::from::${gstinPR}`;
            if (!seenSugg.has(key)) {
              seenSugg.add(key);
              suggested.push({
                id: key,
                supplierName: partyNameBooks,
                source: 'PR',
                originalGstin: gstinPR,
                currentGstin: gstinPR,
                suggestedGstin: bestGstin,
                suggestedName: partyNameGovt,
                issueType: 'Wrong GSTIN',
              });
            }
          }
        }
      }
    }
  }

  // Conflicts: Same GSTIN mapped to multiple party names
  const gstinMap = new Map<string, { prNames: Set<string>; tbNames: Set<string>; }>();
  for (const r of results) {
    if (r.status === 'Prior FY (Excluded)') continue;
    const pr = r.prRecord;
    const tb = r.twoBRecord;
    const gstinPR = pr?.gstin || '';
    const gstin2B = tb?.gstin || '';
    const prName = pr?.supplierName || '';
    const tbName = tb?.supplierName || '';

    const addTo = (gst: string, src: 'pr' | 'tb', name: string) => {
      if (!gst) return;
      if (!gstinMap.has(gst)) gstinMap.set(gst, { prNames: new Set(), tbNames: new Set() });
      if (name) gstinMap.get(gst)![`${src}Names`].add(name);
    };

    addTo(gstinPR, 'pr', prName);
    addTo(gstin2B, 'tb', tbName);
  }

  const setsEqual = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x));

  for (const [gstin, info] of gstinMap.entries()) {
    const prCount = info.prNames.size;
    // Strictly define duplicate: Same GSTIN under multiple parties in books
    const needsReview = prCount > 1;
    
    if (needsReview) {
      conflicts.push({
        id: `conflict::${gstin}`,
        supplierName: [...info.prNames].join(' | '),
        source: 'PR',
        originalGstin: gstin,
        currentGstin: gstin,
        issueType: 'Duplicate GSTIN',
        relatedParties: [...info.prNames],
      });
    }
  }

  return { suggested, conflicts };
}
