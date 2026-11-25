import {
  type ReconciliationResult,
  type MatchStatus,
  cleanInvoiceNumber,
  extractCoreInvoiceNumber,
  parseDate,
} from './reconciliation';
import type { PartySummary, PartyInvoiceRow } from './partyWise';

export interface SmartMatchCandidate {
  id: string;
  partyKey: string;
  partyName: string;
  gstin: string;
  prRow: PartyInvoiceRow;
  twoBRow: PartyInvoiceRow;
  confidence: number; // 50 to 99
  matchGrade: 'HIGH' | 'PROBABLE' | 'MODERATE';
  reasons: string[];
  explanation: string;
  explanationHinglish: string;
  metrics: {
    prInvoiceNo: string;
    twoBInvoiceNo: string;
    corePrInvoiceNo: string;
    coreTwoBInvoiceNo: string;
    cleanPrInvoiceNo: string;
    cleanTwoBInvoiceNo: string;
    invNumberMatch: boolean;
    prTaxable: number;
    twoBTaxable: number;
    taxableDiff: number;
    prTax: number;
    twoBTax: number;
    taxDiff: number;
    prDate: string;
    twoBDate: string;
    dayDiff: number | null;
  };
}

/**
 * Standard Levenshtein distance for string typo detection.
 */
function computeLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    d[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return d[a.length][b.length];
}

/**
 * Evaluates Invoice Number Similarity (Max 35 points).
 * Handles Indian invoice nuances: FY prefixes (24-25/), INV- prefix, leading zeros, and delimiters.
 */
function scoreInvoiceNumber(prInvRaw: string, tbInvRaw: string): { score: number; matched: boolean; reason: string; corePR: string; coreTB: string; cleanPR: string; cleanTB: string } {
  const prNo = String(prInvRaw || '').trim();
  const tbNo = String(tbInvRaw || '').trim();

  const corePR = extractCoreInvoiceNumber(prNo);
  const coreTB = extractCoreInvoiceNumber(tbNo);
  const cleanPR = cleanInvoiceNumber(prNo);
  const cleanTB = cleanInvoiceNumber(tbNo);

  if (!prNo || !tbNo) {
    return { score: 0, matched: false, reason: 'Invoice number missing', corePR, coreTB, cleanPR, cleanTB };
  }

  // 1. Exact Core Number Match (e.g. 'INV-045' vs '45/24-25' -> core '45' == '45')
  if (corePR.length > 0 && coreTB.length > 0 && corePR === coreTB) {
    return {
      score: 35,
      matched: true,
      reason: `Core invoice serial #${corePR} matches exactly`,
      corePR,
      coreTB,
      cleanPR,
      cleanTB,
    };
  }

  // 2. Exact Alphanumeric Cleaned Match (e.g. 'INV/045' vs 'INV-45')
  if (cleanPR.length > 0 && cleanTB.length > 0 && cleanPR === cleanTB) {
    return {
      score: 35,
      matched: true,
      reason: `Normalized invoice number (${cleanPR}) matches exactly`,
      corePR,
      coreTB,
      cleanPR,
      cleanTB,
    };
  }

  // 3. Substring Containment (e.g. Tally has '045' and 2B has 'GST/24-25/045')
  if (corePR.length >= 2 && coreTB.length >= 2 && (corePR.includes(coreTB) || coreTB.includes(corePR))) {
    return {
      score: 30,
      matched: true,
      reason: `Core invoice sequence (${corePR} ↔ ${coreTB}) is contained within each other`,
      corePR,
      coreTB,
      cleanPR,
      cleanTB,
    };
  }

  if (cleanPR.length >= 3 && cleanTB.length >= 3 && (cleanPR.includes(cleanTB) || cleanTB.includes(cleanPR))) {
    return {
      score: 28,
      matched: true,
      reason: `Invoice series (${cleanPR} ↔ ${cleanTB}) is contained within each other`,
      corePR,
      coreTB,
      cleanPR,
      cleanTB,
    };
  }

  // 4. Fuzzy Levenshtein Distance on cleaned strings
  const maxLen = Math.max(cleanPR.length, cleanTB.length);
  if (maxLen > 0) {
    const lev = computeLevenshtein(cleanPR, cleanTB);
    const similarity = 1 - lev / maxLen;
    if (similarity >= 0.8) {
      return {
        score: 25,
        matched: true,
        reason: `Invoice number matches with minor typo (${Math.round(similarity * 100)}% similarity)`,
        corePR,
        coreTB,
        cleanPR,
        cleanTB,
      };
    }
    if (similarity >= 0.6) {
      return {
        score: 16,
        matched: false,
        reason: `Partial invoice series similarity (${Math.round(similarity * 100)}%)`,
        corePR,
        coreTB,
        cleanPR,
        cleanTB,
      };
    }
  }

  return { score: 0, matched: false, reason: 'Invoice numbers differ', corePR, coreTB, cleanPR, cleanTB };
}

/**
 * Evaluates Amount Similarity (Max 40 points).
 * Checks Total Tax (IGST + CGST + SGST) and Taxable Value.
 */
function scoreAmount(prRow: PartyInvoiceRow, tbRow: PartyInvoiceRow): { score: number; taxDiff: number; taxableDiff: number; prTax: number; tbTax: number; reason: string } {
  const prTax = Math.round(((prRow.cgstPR || 0) + (prRow.sgstPR || 0) + (prRow.igstPR || 0)) * 100) / 100;
  const tbTax = Math.round(((tbRow.cgst2B || 0) + (tbRow.sgst2B || 0) + (tbRow.igst2B || 0)) * 100) / 100;
  const taxDiff = Math.abs(Math.round((prTax - tbTax) * 100) / 100);

  const prTaxable = Math.round((prRow.taxablePR || 0) * 100) / 100;
  const tbTaxable = Math.round((tbRow.taxable2B || 0) * 100) / 100;
  const taxableDiff = Math.abs(Math.round((prTaxable - tbTaxable) * 100) / 100);

  // Exact match
  if (taxDiff === 0 && taxableDiff === 0) {
    return { score: 40, taxDiff, taxableDiff, prTax, tbTax, reason: 'Tax and Taxable values match 100% exactly' };
  }

  // Statutory rounding tolerance <= ₹2
  if (taxDiff <= 2.0 && taxableDiff <= 5.0) {
    return {
      score: 38,
      taxDiff,
      taxableDiff,
      prTax,
      tbTax,
      reason: `Tax matches within statutory rounding tolerance (Diff: ₹${taxDiff.toFixed(2)})`,
    };
  }

  // Taxable exact, minor tax difference
  if (taxableDiff === 0 && taxDiff <= 5.0) {
    return {
      score: 35,
      taxDiff,
      taxableDiff,
      prTax,
      tbTax,
      reason: `Taxable value matches exactly with ₹${taxDiff.toFixed(2)} tax rounding`,
    };
  }

  // Small tax difference <= ₹10
  if (taxDiff <= 10.0) {
    return { score: 26, taxDiff, taxableDiff, prTax, tbTax, reason: `Tax difference under ₹10 (Diff: ₹${taxDiff.toFixed(2)})` };
  }

  // Percentage variance within 1%
  if (prTax > 0 && taxDiff / prTax <= 0.01) {
    return { score: 22, taxDiff, taxableDiff, prTax, tbTax, reason: `Tax variance within 1% tolerance` };
  }

  return { score: 0, taxDiff, taxableDiff, prTax, tbTax, reason: `Values differ significantly (Tax diff: ₹${taxDiff.toFixed(2)})` };
}

/**
 * Evaluates Date Proximity (Max 15 points).
 */
function scoreDate(prDateStr: string, tbDateStr: string): { score: number; dayDiff: number | null; reason: string } {
  const d1 = parseDate(prDateStr);
  const d2 = parseDate(tbDateStr);

  if (!d1 || !d2) {
    return { score: 8, dayDiff: null, reason: 'Date not specified' };
  }

  const diffMs = Math.abs(d1.getTime() - d2.getTime());
  const diffDays = Math.round(diffMs / (1000 * 3600 * 24));

  if (diffDays === 0) {
    return { score: 15, dayDiff: 0, reason: 'Invoice date is identical' };
  }
  if (diffDays <= 3) {
    return { score: 14, dayDiff: diffDays, reason: `Dates are only ${diffDays} day(s) apart` };
  }
  if (diffDays <= 7) {
    return { score: 12, dayDiff: diffDays, reason: `Dates are within 1 week (${diffDays} days)` };
  }
  if (diffDays <= 15) {
    return { score: 9, dayDiff: diffDays, reason: `Dates are within 15 days (${diffDays} days)` };
  }
  if (diffDays <= 31) {
    return { score: 6, dayDiff: diffDays, reason: `Dates are in adjacent monthly period (${diffDays} days)` };
  }
  if (diffDays <= 90) {
    return { score: 3, dayDiff: diffDays, reason: `Dates are in same quarter (${diffDays} days)` };
  }

  return { score: 0, dayDiff: diffDays, reason: `Invoice dates are ${diffDays} days apart` };
}

/**
 * Helper to check whether a PartyInvoiceRow is unmatched in Books (PR).
 */
export function isUnmatchedPrRow(row: PartyInvoiceRow): boolean {
  const st = String(row.status || '');
  return (
    (st === 'Not in 2B' ||
      st === 'Missing in 2B' ||
      st === 'Unmatched Vendor' ||
      st === 'Debit Note (Books)' ||
      st === 'In Books Only (Not in GSTR-2B)' ||
      st === 'In Books Only - Taxable (Not in 2B)') &&
    !!row.rawResult?.prRecord
  );
}

/**
 * Helper to check whether a PartyInvoiceRow is unmatched in Portal (2B).
 */
export function isUnmatchedTwoBRow(row: PartyInvoiceRow): boolean {
  const st = String(row.status || '');
  return (
    (st === 'Not in Books' ||
      st === 'Missing in PR' ||
      st === 'Debit Note (Portal)' ||
      st === 'In GSTR-2B Only (Not in Books)' ||
      st === 'In 2B Credit Notes Only (Not in Books)') &&
    !!row.rawResult?.twoBRecord
  );
}

/**
 * Computes match suitability between one PR row and one 2B row.
 */
export function evaluateInvoicePairMatch(
  prRow: PartyInvoiceRow,
  tbRow: PartyInvoiceRow,
  party: PartySummary
): SmartMatchCandidate | null {
  const prInvNo = prRow.invoiceNoPR || prRow.rawResult?.prRecord?.invoiceNo || '';
  const tbInvNo = tbRow.invoiceNo2B || tbRow.rawResult?.twoBRecord?.invoiceNo || '';

  const invRes = scoreInvoiceNumber(prInvNo, tbInvNo);
  const amtRes = scoreAmount(prRow, tbRow);
  const prDate = prRow.invoiceDatePR || prRow.rawResult?.prRecord?.invoiceDate || '';
  const tbDate = tbRow.invoiceDate2B || tbRow.rawResult?.twoBRecord?.invoiceDate || '';
  const dateRes = scoreDate(prDate, tbDate);

  // Party Score: Same party master guarantees 10 points
  const partyScore = 10;

  // Strict Quality Gate:
  // Must have: Either (Amounts match within tolerance) OR (Core invoice number matches)
  if (amtRes.score < 22 && !invRes.matched) {
    return null;
  }

  const rawScore = invRes.score + amtRes.score + dateRes.score + partyScore;
  const confidence = Math.min(99, Math.max(50, Math.round(rawScore)));

  // Minimum 70% threshold to prevent noisy suggestions
  if (confidence < 70) {
    return null;
  }

  const matchGrade: 'HIGH' | 'PROBABLE' | 'MODERATE' =
    confidence >= 90 ? 'HIGH' : confidence >= 78 ? 'PROBABLE' : 'MODERATE';

  const reasons: string[] = [amtRes.reason, invRes.reason, dateRes.reason].filter(Boolean);

  // Friendly English and Hinglish explanations
  const formattedTax = amtRes.prTax.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const explanation = `AI confidence is ${confidence}%. Amounts match (₹${formattedTax} tax, Diff: ₹${amtRes.taxDiff.toFixed(
    2
  )}). Invoice numbers '${prInvNo}' and '${tbInvNo}' share serial #${invRes.corePR || invRes.cleanPR}${
    dateRes.dayDiff !== null ? `, dates are ${dateRes.dayDiff} day(s) apart` : ''
  }.`;

  const explanationHinglish = `Ye ${confidence}% wahi bill hai! Tax amount barabar match ho raha hai (₹${formattedTax}), aur bill no '${prInvNo}' aur '${tbInvNo}' ka core number #${invRes.corePR || invRes.cleanPR} identical hai${
    dateRes.dayDiff !== null ? ` (dates sirf ${dateRes.dayDiff} din aage-peeche hain)` : ''
  }.`;

  return {
    id: `${party.key}_${prInvNo}_${tbInvNo}_${confidence}`,
    partyKey: party.key,
    partyName: party.partyName,
    gstin: party.gstin,
    prRow,
    twoBRow: tbRow,
    confidence,
    matchGrade,
    reasons,
    explanation,
    explanationHinglish,
    metrics: {
      prInvoiceNo: prInvNo,
      twoBInvoiceNo: tbInvNo,
      corePrInvoiceNo: invRes.corePR,
      coreTwoBInvoiceNo: invRes.coreTB,
      cleanPrInvoiceNo: invRes.cleanPR,
      cleanTwoBInvoiceNo: invRes.cleanTB,
      invNumberMatch: invRes.matched,
      prTaxable: prRow.taxablePR || 0,
      twoBTaxable: tbRow.taxable2B || 0,
      taxableDiff: amtRes.taxableDiff,
      prTax: amtRes.prTax,
      twoBTax: amtRes.tbTax,
      taxDiff: amtRes.taxDiff,
      prDate,
      twoBDate: tbDate,
      dayDiff: dateRes.dayDiff,
    },
  };
}

/**
 * Finds all smart match candidates for a single counterparty.
 * Resolves optimal conflict-free pairs (bipartite greedy matching).
 */
export function findSmartMatchesForParty(party: PartySummary): SmartMatchCandidate[] {
  const unmatchedPR = party.invoices.filter(isUnmatchedPrRow);
  const unmatched2B = party.invoices.filter(isUnmatchedTwoBRow);

  if (unmatchedPR.length === 0 || unmatched2B.length === 0) {
    return [];
  }

  // 1. Gather all potential pairwise matches
  const allPairs: SmartMatchCandidate[] = [];
  for (const pr of unmatchedPR) {
    for (const tb of unmatched2B) {
      const candidate = evaluateInvoicePairMatch(pr, tb, party);
      if (candidate) {
        allPairs.push(candidate);
      }
    }
  }

  // 2. Sort by confidence descending, then smallest taxDiff
  allPairs.sort((a, b) => b.confidence - a.confidence || a.metrics.taxDiff - b.metrics.taxDiff);

  // 3. Conflict resolution: A PR row or 2B row can only be matched once per batch
  const selected: SmartMatchCandidate[] = [];
  const usedPR = new Set<PartyInvoiceRow>();
  const used2B = new Set<PartyInvoiceRow>();

  for (const pair of allPairs) {
    if (usedPR.has(pair.prRow) || used2B.has(pair.twoBRow)) {
      continue;
    }
    usedPR.add(pair.prRow);
    used2B.add(pair.twoBRow);
    selected.push(pair);
  }

  return selected;
}

/**
 * Finds candidates for a specific selected invoice (when user clicks ✨ on a row).
 */
export function findSmartMatchesForInvoice(
  targetRow: PartyInvoiceRow,
  party: PartySummary
): SmartMatchCandidate[] {
  const isPr = isUnmatchedPrRow(targetRow);
  const is2B = isUnmatchedTwoBRow(targetRow);

  if (!isPr && !is2B) return [];

  const candidates: SmartMatchCandidate[] = [];

  if (isPr) {
    const unmatched2B = party.invoices.filter(isUnmatchedTwoBRow);
    for (const tb of unmatched2B) {
      const match = evaluateInvoicePairMatch(targetRow, tb, party);
      if (match) candidates.push(match);
    }
  } else {
    const unmatchedPR = party.invoices.filter(isUnmatchedPrRow);
    for (const pr of unmatchedPR) {
      const match = evaluateInvoicePairMatch(pr, targetRow, party);
      if (match) candidates.push(match);
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Scans all parties across the software and returns all smart match candidates.
 */
export function findAllSmartMatches(parties: PartySummary[]): SmartMatchCandidate[] {
  const results: SmartMatchCandidate[] = [];
  for (const party of parties) {
    const partyMatches = findSmartMatchesForParty(party);
    results.push(...partyMatches);
  }
  return results.sort((a, b) => b.confidence - a.confidence || a.metrics.taxDiff - b.metrics.taxDiff);
}

/**
 * Applies a Smart Match Candidate into the master reconciliation results array.
 */
export function applySmartMatch(
  results: ReconciliationResult[],
  candidate: SmartMatchCandidate
): ReconciliationResult[] {
  const prRaw = candidate.prRow.rawResult;
  const twoBRaw = candidate.twoBRow.rawResult;

  if (!prRaw || !twoBRaw) return results;

  // Filter out the separate 2B record
  let newResults = results.filter((r) => r !== twoBRaw);
  const prIndex = newResults.findIndex((r) => r === prRaw);

  const prRec = prRaw.prRecord;
  const tbRec = twoBRaw.twoBRecord;

  const igstDiff = +((prRec?.igst ?? 0) - (tbRec?.igst ?? 0)).toFixed(2);
  const cgstDiff = +((prRec?.cgst ?? 0) - (tbRec?.cgst ?? 0)).toFixed(2);
  const sgstDiff = +((prRec?.sgst ?? 0) - (tbRec?.sgst ?? 0)).toFixed(2);
  const gstDiff = +(Math.abs(igstDiff) + Math.abs(cgstDiff) + Math.abs(sgstDiff)).toFixed(2);
  const taxableDiff = +((prRec?.taxableValue ?? 0) - (tbRec?.taxableValue ?? 0)).toFixed(2);

  // Status assignment: if diff == 0 -> Perfect Match; if diff <= 2 -> Matched (Rounded); else Value Mismatch
  const status: MatchStatus =
    gstDiff === 0 && taxableDiff === 0
      ? 'Perfect Match'
      : gstDiff <= 2.0
      ? 'Matched (Rounded)'
      : 'Value Mismatch';

  const mergedRecord: ReconciliationResult = {
    ...prRaw,
    prRecord: prRec,
    twoBRecord: tbRec,
    status,
    igstDiff,
    cgstDiff,
    sgstDiff,
    gstDiff,
    taxableDiff,
    matchMethod: 'Name (Exact)',
    remark: `AI Smart Match (${candidate.confidence}% Confidence): ${candidate.reasons[0] || 'Matched by AI Solver'}`,
  };

  if (prIndex !== -1) {
    newResults[prIndex] = mergedRecord;
  } else {
    newResults.push(mergedRecord);
  }

  return newResults;
}

/**
 * Applies multiple smart match candidates in bulk.
 */
export function applyBatchSmartMatches(
  results: ReconciliationResult[],
  candidates: SmartMatchCandidate[]
): { newResults: ReconciliationResult[]; appliedCount: number } {
  let currentResults = [...results];
  let appliedCount = 0;

  for (const cand of candidates) {
    const updated = applySmartMatch(currentResults, cand);
    if (updated !== currentResults) {
      currentResults = updated;
      appliedCount++;
    }
  }

  return { newResults: currentResults, appliedCount };
}

