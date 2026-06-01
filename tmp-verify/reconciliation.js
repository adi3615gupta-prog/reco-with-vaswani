"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanInvoiceNumber = cleanInvoiceNumber;
exports.normalizeGstin = normalizeGstin;
exports.parseDate = parseDate;
exports.getFinancialYear = getFinancialYear;
exports.normalizePartyName = normalizePartyName;
exports.reconcile = reconcile;
exports.getSummary = getSummary;
const fuse_js_1 = require("fuse.js");
// --- Cleaning helpers ---
function cleanInvoiceNumber(inv) {
    if (!inv)
        return '';
    let cleaned = String(inv).toUpperCase();
    // 1. Normalize financial years: 2025-26, 25-26, 2025-2026 -> 2526
    cleaned = cleaned.replace(/(?:20)?(\d{2})[\/\-\\]+(?:20)?(\d{2})(?!\d)/g, '$1$2');
    // 2. Strip leading zeros from any numeric sequence (e.g. INV/0045 -> INV/45, INV0045 -> INV45)
    cleaned = cleaned.replace(/(^|[^\d])0+(?=\d)/g, '$1');
    // 3. Remove all non-alphanumeric characters
    return cleaned.replace(/[^A-Z0-9]/g, '');
}
function normalizeGstin(gstin) {
    // Strip whitespace, zero-width and hidden chars, uppercase.
    return (gstin || '')
        .replace(/[\s\u200B-\u200D\uFEFF]/g, '')
        .toUpperCase();
}
function parseDate(dateStr) {
    if (!dateStr)
        return null;
    const s = String(dateStr).trim();
    const dmy = s.match(/^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})$/);
    if (dmy)
        return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
    const ymd = s.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})$/);
    if (ymd)
        return new Date(+ymd[1], +ymd[2] - 1, +ymd[3]);
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}
function getFinancialYear(date) {
    if (!date)
        return 'UNKNOWN';
    const year = date.getFullYear();
    const month = date.getMonth();
    if (month >= 3)
        return `${year}-${year + 1}`;
    return `${year - 1}-${year}`;
}
function parseNum(val) {
    if (typeof val === 'number')
        return val;
    if (!val)
        return 0;
    const n = parseFloat(String(val).replace(/[₹,\s]/g, ''));
    return isNaN(n) ? 0 : n;
}
function prepareRecord(rec) {
    const r = { ...rec };
    r.gstin = normalizeGstin(r.gstin);
    r.cleanedInvoice = cleanInvoiceNumber(r.invoiceNo);
    r.normalizedDate = parseDate(r.invoiceDate) || undefined;
    r.financialYear = getFinancialYear(r.normalizedDate || null);
    // Round off all values to the nearest rupee per Section 170 of CGST Act
    r.igst = Math.round(parseNum(r.igst));
    r.cgst = Math.round(parseNum(r.cgst));
    r.sgst = Math.round(parseNum(r.sgst));
    if (r.taxableValue !== undefined)
        r.taxableValue = Math.round(parseNum(r.taxableValue));
    return r;
}
function normalizePartyName(name) {
    if (!name)
        return '';
    let n = name
        .toUpperCase()
        .replace(/\b(M\/S\.?|MS\.?|MR\.?|MRS\.?|SHREE|SHRI)\b/g, '')
        .replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY|CORP|CORPORATION|ENTERPRISES?|TRADERS?|INDUSTRIES|AGENC(?:Y|IES)|BROTHERS|BROS|SONS|ASSOCIATES|AND|&)\b/g, '')
        .replace(/[^A-Z0-9]/g, '')
        .trim();
    if (n.endsWith('S'))
        n = n.slice(0, -1);
    return n;
}
// --- Hierarchical reconciliation engine ---
function reconcile(prRecords, twoBRecords, mode = 'input', tolerance = 2, partyTolerance = 5) {
    const pr = prRecords.map(prepareRecord);
    const twoB = twoBRecords.map(prepareRecord);
    // Group 2B records by GSTIN for Step-1 lookup
    const twoBByGstin = new Map();
    // Group 2B records by Exact Normalized Name for Step-2 lookup
    const twoBByNormName = new Map();
    for (let j = 0; j < twoB.length; j++) {
        const g = twoB[j].gstin;
        if (!g)
            continue;
        if (!twoBByGstin.has(g))
            twoBByGstin.set(g, []);
        twoBByGstin.get(g).push(j);
        const norm = normalizePartyName(twoB[j].supplierName);
        if (norm) {
            if (!twoBByNormName.has(norm))
                twoBByNormName.set(norm, []);
            twoBByNormName.get(norm).push(j);
        }
    }
    // Build a unique vendor index (by normalized name) for fuzzy fallback (Step-3)
    const vendorIndex = [];
    const vendorMap = new Map();
    for (let j = 0; j < twoB.length; j++) {
        const norm = normalizePartyName(twoB[j].supplierName);
        if (!norm)
            continue;
        let pos = vendorMap.get(norm);
        if (pos === undefined) {
            pos = vendorIndex.length;
            vendorMap.set(norm, pos);
            vendorIndex.push({ name: twoB[j].supplierName, normName: norm, indices: [] });
        }
        vendorIndex[pos].indices.push(j);
    }
    const fuse = new fuse_js_1.default(vendorIndex, {
        keys: ['normName'],
        threshold: 0.4,
        includeScore: true,
    });
    const results = [];
    const matched2B = new Set();
    for (let i = 0; i < pr.length; i++) {
        const p = pr[i];
        // ---- Step 1: Identify the party ----
        let candidateIdxs = null;
        let matchMethod;
        let vendorRemark;
        const isOut = mode === 'output';
        const partyType = isOut ? 'Customer' : 'Vendor';
        const govtName = isOut ? 'GSTR-1' : '2B';
        const bookName = isOut ? 'Sales' : 'PR';
        const pNorm = normalizePartyName(p.supplierName);
        if (p.gstin && twoBByGstin.has(p.gstin)) {
            candidateIdxs = twoBByGstin.get(p.gstin);
            matchMethod = 'GSTIN';
        }
        else if (pNorm && twoBByNormName.has(pNorm)) {
            candidateIdxs = twoBByNormName.get(pNorm);
            matchMethod = 'Name (Exact)';
            vendorRemark = `${partyType} matched by exact name (GSTIN missing/mismatch). ${bookName} GSTIN: "${p.gstin || '—'}"`;
        }
        else {
            if (pNorm) {
                const hits = fuse.search(pNorm).filter((h) => (h.score ?? 1) <= 0.4);
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
                status: 'Unmatched Vendor',
                cgstDiff: p.cgst, sgstDiff: p.sgst, igstDiff: p.igst, gstDiff: p.cgst + p.sgst + p.igst,
                taxableDiff: p.taxableValue,
            });
            continue;
        }
        // ---- Step 2: Match invoice number within candidates ----
        const availableCandidates = candidateIdxs.filter((j) => !matched2B.has(j));
        let invoiceMatchIdx = availableCandidates.find((j) => twoB[j].cleanedInvoice === p.cleanedInvoice && p.cleanedInvoice !== '');
        if (invoiceMatchIdx === undefined && p.cleanedInvoice) {
            // Fallback: Partial Invoice Match (e.g., "93" vs "932526", "GST/93" vs "93")
            // Applies if exact value match and one ends/starts with the other, or purely numeric parts match
            const fallbackIdx = availableCandidates.find((j) => {
                const t = twoB[j];
                const pInv = p.cleanedInvoice;
                const tInv = t.cleanedInvoice;
                if (!tInv)
                    return false;
                const pNum = pInv.replace(/\D/g, '');
                const tNum = tInv.replace(/\D/g, '');
                const isPartial = pInv.startsWith(tInv) || pInv.endsWith(tInv) ||
                    tInv.startsWith(pInv) || tInv.endsWith(pInv) ||
                    (pNum && tNum && (pNum === tNum || pNum.startsWith(tNum) || pNum.endsWith(tNum) || tNum.startsWith(pNum) || tNum.endsWith(pNum)));
                if (!isPartial)
                    return false;
                return Math.abs(p.igst - t.igst) <= tolerance &&
                    Math.abs(p.cgst - t.cgst) <= tolerance &&
                    Math.abs(p.sgst - t.sgst) <= tolerance;
            });
            if (fallbackIdx !== undefined) {
                invoiceMatchIdx = fallbackIdx;
                vendorRemark = vendorRemark ? `${vendorRemark} | Matched by partial invoice` : 'Matched by partial invoice no.';
            }
        }
        if (invoiceMatchIdx === undefined) {
            // Fallback: Aggressive Date + Value Match (even if invoice numbers are completely missing or different)
            // This handles cases where invoice numbers are entered differently or missing entirely.
            const fuzzyIdx = availableCandidates.find((j) => {
                const t = twoB[j];
                // Must match values closely (already rounded to nearest integer)
                const valMatch = Math.abs(p.igst - t.igst) <= tolerance &&
                    Math.abs(p.cgst - t.cgst) <= tolerance &&
                    Math.abs(p.sgst - t.sgst) <= tolerance &&
                    (p.igst > 0 || p.cgst > 0 || p.sgst > 0); // avoid matching zero-value records
                if (!valMatch)
                    return false;
                // Match dates within a 15-day window (as per user request for "around same date")
                if (p.normalizedDate && t.normalizedDate) {
                    const diffDays = Math.abs(p.normalizedDate.getTime() - t.normalizedDate.getTime()) / (1000 * 60 * 60 * 24);
                    if (diffDays <= 15)
                        return true;
                }
                // If invoice numbers are empty/missing for both, and values match, it's a match.
                if (!p.cleanedInvoice && !t.cleanedInvoice)
                    return true;
                // If values match perfectly and it's the same month/year
                if (p.financialYear === t.financialYear && p.normalizedDate && t.normalizedDate &&
                    p.normalizedDate.getMonth() === t.normalizedDate.getMonth()) {
                    return true;
                }
                return false;
            });
            if (fuzzyIdx !== undefined) {
                invoiceMatchIdx = fuzzyIdx;
                vendorRemark = vendorRemark ? `${vendorRemark} | Matched by value and approx date` : 'Matched by value and approx date';
            }
        }
        if (invoiceMatchIdx === undefined) {
            results.push({
                prRecord: p,
                status: 'Not in 2B',
                remark: vendorRemark || `${partyType} found in ${govtName} but invoice "${p.invoiceNo}" not present`,
                matchMethod,
                cgstDiff: p.cgst, sgstDiff: p.sgst, igstDiff: p.igst, gstDiff: p.cgst + p.sgst + p.igst,
                taxableDiff: p.taxableValue,
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
        const taxableDiff = hasTaxable ? +((p.taxableValue - t.taxableValue)).toFixed(2) : undefined;
        const within = Math.abs(cgstDiff) <= tolerance &&
            Math.abs(sgstDiff) <= tolerance &&
            Math.abs(igstDiff) <= tolerance &&
            (taxableDiff === undefined || Math.abs(taxableDiff) <= tolerance);
        let status = within ? 'Perfect Match' : 'Value Mismatch';
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
        if ((matchMethod === 'Name (Fuzzy)' || matchMethod === 'Name (Exact)') && p.gstin && t.gstin && p.gstin !== t.gstin) {
            extraRemark = `Wrong GSTIN — ${bookName}: "${p.gstin}" vs ${govtName}: "${t.gstin}"`;
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
        matched2B.add(invoiceMatchIdx);
    }
    // 2B records with no PR counterpart
    for (let j = 0; j < twoB.length; j++) {
        if (!matched2B.has(j)) {
            const t = twoB[j];
            results.push({
                twoBRecord: t,
                status: 'Not in Books',
                cgstDiff: -t.cgst, sgstDiff: -t.sgst, igstDiff: -t.igst, gstDiff: -(t.cgst + t.sgst + t.igst),
                taxableDiff: t.taxableValue !== undefined ? -t.taxableValue : undefined,
            });
        }
    }
    // ---- Post-process: Auto-clear records if Party Net Balance is Nil ----
    const partyMap = new Map();
    const nameIndex = new Map();
    let unknownIndex = 0;
    for (const r of results) {
        const pr = r.prRecord;
        const tb = r.twoBRecord;
        const gstin = pr?.gstin || tb?.gstin || '';
        const name = pr?.supplierName || tb?.supplierName || '';
        const normName = normalizePartyName(name);
        let key = gstin ? gstin : (normName ? `NAME::${normName}` : `UNKNOWN::${++unknownIndex}`);
        if (!gstin && normName && nameIndex.has(normName)) {
            key = nameIndex.get(normName);
        }
        if (gstin && normName && nameIndex.has(normName) && nameIndex.get(normName) !== gstin) {
            const existingKey = nameIndex.get(normName);
            if (existingKey.startsWith('NAME::') || existingKey.startsWith('UNKNOWN::')) {
                const existing = partyMap.get(existingKey);
                if (existing) {
                    let pAgg = partyMap.get(gstin);
                    if (!pAgg) {
                        pAgg = { records: [], prIgst: 0, prCgst: 0, prSgst: 0, tbIgst: 0, tbCgst: 0, tbSgst: 0 };
                        partyMap.set(gstin, pAgg);
                    }
                    pAgg.records.push(...existing.records);
                    pAgg.prIgst += existing.prIgst;
                    pAgg.prCgst += existing.prCgst;
                    pAgg.prSgst += existing.prSgst;
                    pAgg.tbIgst += existing.tbIgst;
                    pAgg.tbCgst += existing.tbCgst;
                    pAgg.tbSgst += existing.tbSgst;
                    partyMap.delete(existingKey);
                }
                nameIndex.set(normName, gstin);
            }
            key = gstin;
        }
        let pAgg = partyMap.get(key);
        if (!pAgg) {
            pAgg = { records: [], prIgst: 0, prCgst: 0, prSgst: 0, tbIgst: 0, tbCgst: 0, tbSgst: 0 };
            partyMap.set(key, pAgg);
            if (normName && (!nameIndex.has(normName) || nameIndex.get(normName).startsWith('NAME::'))) {
                nameIndex.set(normName, key);
            }
        }
        pAgg.records.push(r);
        if (pr) {
            pAgg.prIgst += pr.igst;
            pAgg.prCgst += pr.cgst;
            pAgg.prSgst += pr.sgst;
        }
        if (tb) {
            pAgg.tbIgst += tb.igst;
            pAgg.tbCgst += tb.cgst;
            pAgg.tbSgst += tb.sgst;
        }
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
function getSummary(results) {
    const count = (s) => results.filter((r) => r.status === s).length;
    const perfectMatch = count('Perfect Match') + count('Matched (Diff Date)');
    const valueMismatch = count('Value Mismatch');
    const invoiceMissing = count('Not in 2B');
    const unmatchedVendor = count('Unmatched Vendor');
    const missingInPR = count('Not in Books') + count('Missing in PR');
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
        nameMatched: results.filter((r) => r.matchMethod === 'Name (Fuzzy)' || r.matchMethod === 'Name (Exact)').length,
        wrongGstin: results.filter((r) => r.remark?.startsWith('Wrong GSTIN')).length,
        nameMismatch: 0,
    };
}
