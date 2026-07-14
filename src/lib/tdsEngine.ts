import type { TdsSection } from '@/pages/TdsReconciliation';
import * as XLSX from 'xlsx-js-style';

export interface TallyTdsTransaction {
    date: Date;
    partyName: string;
    partyPan: string;
    ledgerName: string;
    amount: number;
    actualTdsDeducted: number;
    tdsLedgerName?: string;
    parentGroup?: string;
    parentGroupPath?: string;
}

export interface Form26QRecord {
    partyPan: string;
    partyName: string;
    section: string;
    amountPaid: number;
    tdsDeducted: number;
}

export interface TdsReconciliationResult {
    partyName: string;
    partyPan: string;
    panInBooks: string;
    panIn26Q: string;
    nameInBooks: string;
    nameIn26Q: string;
    section: string;
    booksSpend: number;
    booksTaxable: number;
    booksRequiredTds: number;
    booksActualTds: number;
    tracesTaxable: number;
    tracesTds: number;
    taxableVariance: number;
    tdsVariance: number;
    status: 'Matched' | 'Short Deducted' | 'Excess Deducted' | 'Missing in 26Q' | 'Missing in Books' | 'Under Threshold';
    ledgers?: string;
    tdsLedgers?: string;
    rateApplied?: number;
    reason?: string;
    closingBalance?: number;
}

// Statutory TDS Rates based on Entity Type
function getTdsRate(section: string, pan: string, sectionsMaster?: TdsSection[]): { rate: number; isMissingPan: boolean } {
    let rateIndividualHuf = 1.0;
    let rateCompanyOthers = 2.0;
    let rateMissingPan = 20.0;

    // 1. Try to find the section rule from master database list
    if (sectionsMaster) {
        const rule = sectionsMaster.find(s => s.old_section === section);
        if (rule) {
            rateIndividualHuf = rule.rate_individual_huf;
            rateCompanyOthers = rule.rate_company_others;
            rateMissingPan = rule.rate_missing_pan_206AA;
        }
    } else {
        // Fallback hardcoded defaults if master database list not supplied
        const fallbackRates: Record<string, { ind: number; comp: number; missing?: number }> = {
            '192A': { ind: 10, comp: 10, missing: 20 },
            '193': { ind: 10, comp: 10, missing: 20 },
            '194': { ind: 10, comp: 10, missing: 20 },
            '194A': { ind: 10, comp: 10, missing: 20 },
            '194C': { ind: 1, comp: 2, missing: 20 },
            '194D': { ind: 5, comp: 10, missing: 20 },
            '194DA': { ind: 2, comp: 2, missing: 20 },
            '194G': { ind: 2, comp: 2, missing: 20 },
            '194H': { ind: 2, comp: 2, missing: 20 },
            '194I(a)': { ind: 2, comp: 2, missing: 20 },
            '194I(b)': { ind: 10, comp: 10, missing: 20 },
            '194IA': { ind: 1, comp: 1, missing: 20 },
            '194IB': { ind: 2, comp: 2, missing: 20 },
            '194IC': { ind: 10, comp: 10, missing: 20 },
            '194J(a)': { ind: 2, comp: 2, missing: 20 },
            '194J(b)': { ind: 10, comp: 10, missing: 20 },
            '194LA': { ind: 10, comp: 10, missing: 20 },
            '194M': { ind: 2, comp: 2, missing: 20 },
            '194O': { ind: 0.1, comp: 0.1, missing: 5 },
            '194Q': { ind: 0.1, comp: 0.1, missing: 5 },
            '194R': { ind: 10, comp: 10, missing: 20 },
            '194S': { ind: 1, comp: 1, missing: 20 },
            '194T': { ind: 10, comp: 10, missing: 20 },
        };
        const info = fallbackRates[section];
        if (info) {
            rateIndividualHuf = info.ind;
            rateCompanyOthers = info.comp;
            rateMissingPan = info.missing !== undefined ? info.missing : 20.0;
        }
    }

    const isMissing = !pan || pan === 'PAN-MISSING' || pan === 'PAN MISSING' || pan === 'UNREGISTERED' || pan.trim().length !== 10;
    if (isMissing) {
        return { rate: rateMissingPan, isMissingPan: true };
    }

    // Determine entity type from 4th character of PAN (C=Company, P=Individual, etc.)
    const statusChar = pan.charAt(3).toUpperCase();
    const isIndividualOrHuf = ['P', 'H'].includes(statusChar);

    if (isIndividualOrHuf) {
        return { rate: rateIndividualHuf, isMissingPan: false };
    } else {
        return { rate: rateCompanyOthers, isMissingPan: false };
    }
}

/**
 * CORE LOGIC: Determines the taxability of transactions by tracking 
 * running annual totals and single-bill limits per party per section.
 */
export function computeBooksTdsLiability(
    transactions: TallyTdsTransaction[],
    mappings: { ledgerName: string; sectionCode: string }[],
    sectionsMaster: TdsSection[]
) {
    // 1. Group transactions by Party PAN, then by Section
    const partySectionTotals: Record<string, {
        partyName: string,
        annualSpend: number,
        grossSpend: number,
        reversalAmount: number,
        taxableAmount: number,
        requiredTds: number,
        actualTds: number,
        ledgers: Set<string>,
        tdsLedgers: Set<string>,
        maxSingleBill: number,
        rateApplied?: number,
        reason?: string
    }> = {};

    // Map ledger names to their statutory section configuration
    const ledgerToSectionMap = new Map(mappings.map(m => [m.ledgerName.toLowerCase().trim(), m.sectionCode]));
    const sectionLimits = new Map(sectionsMaster.map(s => [s.old_section, s]));

    // Pre-scan to build a map of party name to its resolved section codes
    const partySectionMap = new Map<string, Set<string>>();
    for (const txn of transactions) {
        const sectionCode = ledgerToSectionMap.get(txn.ledgerName.toLowerCase().trim());
        if (sectionCode) {
            const key = txn.partyName.toUpperCase().trim();
            if (!partySectionMap.has(key)) {
                partySectionMap.set(key, new Set());
            }
            partySectionMap.get(key)!.add(sectionCode);
        }
    }

    // Sort transactions chronologically to accurately simulate the running threshold
    const sortedTxns = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());

    for (const txn of sortedTxns) {
        const cleanLedger = (txn.ledgerName || '').toLowerCase().trim();
        const isTdsTax = cleanLedger.includes('tds') || cleanLedger.includes('tax deducted') || cleanLedger.includes('tax payable') || cleanLedger.includes('tax liability');

        let resolvedSection = ledgerToSectionMap.get(cleanLedger);
        if (!resolvedSection) {
            // For separate TDS adjustment entry records that have ledgerName like "TDS 194C" or "194C TDS",
            // resolve section by parsing the ledgerName string directly.
            const cleanName = cleanLedger.toUpperCase();
            if (isTdsTax) {
                let extractedSec = '';
                if (cleanName.includes('194C') || cleanName.includes('194-C')) {
                    extractedSec = '194C';
                } else if (cleanName.includes('194IA') || cleanName.includes('194-IA')) {
                    extractedSec = '194IA';
                } else if (cleanName.includes('194IB') || cleanName.includes('194-IB')) {
                    extractedSec = '194IB';
                } else if (cleanName.includes('194I') || cleanName.includes('194-I')) {
                    if (cleanName.includes('MACHINERY') || cleanName.includes('HIRE') || cleanName.includes('PLANT')) {
                        extractedSec = '194I(a)';
                    } else {
                        extractedSec = '194I(b)';
                    }
                } else if (cleanName.includes('194J') || cleanName.includes('194-J')) {
                    if (cleanName.includes('PROF') || cleanName.includes('SERVICE') || cleanName.includes('FEES')) {
                        extractedSec = '194J(b)';
                    } else {
                        extractedSec = '194J(a)';
                    }
                } else if (cleanName.includes('194H') || cleanName.includes('194-H')) {
                    extractedSec = '194H';
                } else if (cleanName.includes('194M') || cleanName.includes('194-M')) {
                    extractedSec = '194M';
                } else if (cleanName.includes('194Q') || cleanName.includes('194-Q')) {
                    extractedSec = '194Q';
                } else if (cleanName.includes('194R') || cleanName.includes('194-R')) {
                    extractedSec = '194R';
                } else if (cleanName.includes('194T') || cleanName.includes('194-T')) {
                    extractedSec = '194T';
                } else if (cleanName.includes('194A') || cleanName.includes('194-A')) {
                    extractedSec = '194A';
                } else if (cleanName.includes('194O') || cleanName.includes('194-O')) {
                    extractedSec = '194O';
                }

                if (extractedSec) {
                    resolvedSection = extractedSec;
                } else {
                    const partySections = partySectionMap.get(txn.partyName.toUpperCase().trim());
                    if (partySections && partySections.size > 0) {
                        resolvedSection = Array.from(partySections)[0];
                    }
                }
            }
        }

        if (!resolvedSection) continue; // Ledger is not mapped for TDS and could not be resolved

        const limits = sectionLimits.get(resolvedSection);
        if (!limits) continue;

        let rawPan = (txn.partyPan || '').toUpperCase().trim();
        const isMissing = !rawPan || rawPan === 'PAN-MISSING' || rawPan === 'PAN MISSING' || rawPan === 'UNREGISTERED';
        if (isMissing) {
            rawPan = '';
        } else {
            rawPan = rawPan.replace(/\s+/g, '');
        }
        const groupKey = isMissing
            ? `NOPAN-${txn.partyName.toUpperCase().trim()}_${resolvedSection}`
            : `${rawPan}_${resolvedSection}`;

        if (!partySectionTotals[groupKey]) {
            partySectionTotals[groupKey] = {
                partyName: txn.partyName,
                annualSpend: 0,
                grossSpend: 0,
                reversalAmount: 0,
                taxableAmount: 0,
                requiredTds: 0,
                actualTds: 0,
                ledgers: new Set(),
                tdsLedgers: new Set(),
                maxSingleBill: 0
            };
        }

        const group = partySectionTotals[groupKey];
        group.annualSpend += txn.amount;
        if (txn.amount > 0) {
            group.grossSpend += txn.amount;
        } else {
            group.reversalAmount += Math.abs(txn.amount);
        }
        group.actualTds += txn.actualTdsDeducted;
        if (txn.tdsLedgerName) {
            group.tdsLedgers.add(txn.tdsLedgerName);
        }
        if (!isTdsTax) {
            group.ledgers.add(txn.ledgerName);
        } else {
            group.tdsLedgers.add(txn.ledgerName);
        }
        if (txn.amount > group.maxSingleBill) {
            group.maxSingleBill = txn.amount;
        }

        // Setup rateApplied on the group (even if not yet taxable, it indicates the target rate)
        const { rate: currentRate } = getTdsRate(resolvedSection, rawPan, sectionsMaster);
        group.rateApplied = currentRate;

        // THRESHOLD CHECK LOGIC
        let isTaxable = false;
        if (limits.single_bill_threshold !== null && txn.amount > limits.single_bill_threshold) {
            isTaxable = true; // Breached single bill limit
        } else if (group.annualSpend > limits.annual_aggregate_threshold) {
            isTaxable = true; // Breached aggregate annual limit
        }

        if (isTaxable) {
            group.taxableAmount += txn.amount;
            // Note: If annual limit is breached mid-year, previous non-taxed amounts might also become taxable. 
            // For V1 of this engine, we calculate TDS forward from the breaching transaction.
            const { rate } = getTdsRate(resolvedSection, rawPan, sectionsMaster);
            group.requiredTds += (txn.amount * rate) / 100;
        }
    }

    for (const groupKey of Object.keys(partySectionTotals)) {
        const group = partySectionTotals[groupKey];
        const [pan, section] = groupKey.split('_');
        const limits = sectionLimits.get(section);
        let reason = '';
        if (group.taxableAmount > 0) {
            const breachType = [];
            if (limits) {
                if (limits.single_bill_threshold && group.maxSingleBill >= limits.single_bill_threshold) {
                    breachType.push(`Bill ₹${group.maxSingleBill.toLocaleString('en-IN')} > single limit ₹${limits.single_bill_threshold.toLocaleString('en-IN')}`);
                }
                if (group.annualSpend >= limits.annual_aggregate_threshold) {
                    breachType.push(`Annual Spend ₹${group.annualSpend.toLocaleString('en-IN')} > annual limit ₹${limits.annual_aggregate_threshold.toLocaleString('en-IN')}`);
                }
            }
            reason = `TDS Status: Applicable (${breachType.join(' or ')})`;
            if (group.actualTds > 0) {
                reason += ` | Book TDS: ₹${group.actualTds.toLocaleString('en-IN')}`;
            }
        } else {
            reason = `TDS Status: Not Applicable (Below threshold)`;
            if (group.actualTds > 0) {
                reason += ` | Voluntary Book TDS: ₹${group.actualTds.toLocaleString('en-IN')}`;
            }
        }

        const { rate, isMissingPan } = getTdsRate(section, pan.startsWith('NOPAN-') ? '' : pan, sectionsMaster);
        if (isMissingPan && limits) {
            reason += ` | PAN: Missing (${rate}% rate)`;
        }

        if (group.reversalAmount > 0) {
            reason += ` | Spend: ₹${group.annualSpend.toLocaleString('en-IN')} (Gross: ₹${group.grossSpend.toLocaleString('en-IN')} | Reversals: ₹${group.reversalAmount.toLocaleString('en-IN')})`;
        } else {
            reason += ` | Spend: ₹${group.annualSpend.toLocaleString('en-IN')}`;
        }

        if (limits) {
            const limitParts = [`Annual limit ₹${limits.annual_aggregate_threshold.toLocaleString('en-IN')}`];
            if (limits.single_bill_threshold) {
                limitParts.push(`Single limit ₹${limits.single_bill_threshold.toLocaleString('en-IN')}`);
            }
            reason += ` | Limits: ${limitParts.join(' / ')}`;
        }

        group.reason = reason;
    }

    return partySectionTotals;
}

/**
 * RECONCILIATION ENGINE: Compares Books liability against Form 26Q Traces
 */
export function reconcileTds(
    booksLiability: Record<string, {
        partyName: string;
        annualSpend: number;
        grossSpend?: number;
        reversalAmount?: number;
        taxableAmount: number;
        requiredTds: number;
        actualTds: number;
        ledgers: Set<string>;
        tdsLedgers?: Set<string>;
        maxSingleBill?: number;
        closingBalance?: number;
        rateApplied?: number;
        reason?: string;
    }>,
    tracesData: Form26QRecord[],
    confirmedMatches?: { booksName: string; tracesName: string }[]
): TdsReconciliationResult[] {
    const results: TdsReconciliationResult[] = [];

    // Aggregate TRACES (Form 26Q) Data
    interface AggregatedTrace {
        partyPan: string;
        partyName: string;
        section: string;
        tracesTaxable: number;
        tracesTds: number;
    }
    const tracesLiability = new Map<string, AggregatedTrace>();
    for (const row of tracesData) {
        let cleanPan = row.partyPan.toUpperCase().trim();
        if (cleanPan === 'PAN-MISSING' || cleanPan === 'PAN MISSING' || cleanPan === 'UNREGISTERED') {
            cleanPan = '';
        }
        cleanPan = cleanPan.replace(/\s+/g, '');
        const cleanSection = row.section.trim();
        const groupKey = `${cleanPan}_${cleanSection}`;

        if (!tracesLiability.has(groupKey)) {
            tracesLiability.set(groupKey, {
                partyPan: cleanPan,
                partyName: row.partyName,
                section: cleanSection,
                tracesTaxable: 0,
                tracesTds: 0
            });
        }
        const existing = tracesLiability.get(groupKey)!;
        existing.tracesTaxable += row.amountPaid;
        existing.tracesTds += row.tdsDeducted;
    }

    const matchedBooks = new Map<string, AggregatedTrace>();
    const matchedTraces = new Map<string, any>();
    const matchMethods = new Map<string, string>();
    const unmatchedBooks = new Set(Object.keys(booksLiability));
    const unmatchedTraces = new Set(tracesLiability.keys());

    const LOCAL_PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i;
    const isLocalPanValid = (p: string) => p && LOCAL_PAN_REGEX.test(p);

    const normalizePartyName = (name: string) => {
        if (!name) return '';
        let n = name.toUpperCase()
            .replace(/[-\s\(\)]+(CR|DR)\b$/g, '')
            .replace(/\b(M\/S\.?|MS\.?|MR\.?|MRS\.?|SHREE|SHRI)\b/g, '')
            .replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY|CORP|CORPORATION|ENTERPRISES?|TRADERS?|INDUSTRIES|AGENC(?:Y|IES)|BROTHERS|BROS|SONS|ASSOCIATES|AND|&)\b/g, '')
            .replace(/[^A-Z0-9]/g, '')
            .trim();
        if (n.endsWith('S')) n = n.slice(0, -1);
        return n;
    };

    function levenshteinDistance(s1: string, s2: string): number {
        const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
        for (let i = 0; i <= s1.length; i += 1) {
            track[0][i] = i;
        }
        for (let j = 0; j <= s2.length; j += 1) {
            track[j][0] = j;
        }
        for (let j = 1; j <= s2.length; j += 1) {
            for (let i = 1; i <= s1.length; i += 1) {
                const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
                track[j][i] = Math.min(
                    track[j][i - 1] + 1, // deletion
                    track[j - 1][i] + 1, // insertion
                    track[j - 1][i - 1] + indicator // substitution
                );
            }
        }
        return track[s2.length][s1.length];
    }

    // 1. Match by PAN
    for (const bKey of unmatchedBooks) {
        const books = booksLiability[bKey];
        const lastUnderscore = bKey.lastIndexOf('_');
        const pan = bKey.substring(0, lastUnderscore);
        const section = bKey.substring(lastUnderscore + 1);

        if (isLocalPanValid(pan)) {
            // First try: exact PAN + exact Section
            const tKeyExact = `${pan}_${section}`;
            if (unmatchedTraces.has(tKeyExact)) {
                const trace = tracesLiability.get(tKeyExact)!;
                matchedBooks.set(bKey, trace);
                matchedTraces.set(tKeyExact, books);
                matchMethods.set(bKey, 'PAN');
                unmatchedBooks.delete(bKey);
                unmatchedTraces.delete(tKeyExact);
                continue;
            }

            // Second try: PAN + empty/dash Section
            const tKeyEmpty = `${pan}_`;
            if (unmatchedTraces.has(tKeyEmpty)) {
                const trace = tracesLiability.get(tKeyEmpty)!;
                trace.section = section;
                const newTKey = `${pan}_${section}`;
                tracesLiability.set(newTKey, trace);
                tracesLiability.delete(tKeyEmpty);

                matchedBooks.set(bKey, trace);
                matchedTraces.set(newTKey, books);
                matchMethods.set(bKey, 'PAN');
                unmatchedBooks.delete(bKey);
                unmatchedTraces.delete(tKeyEmpty);
                continue;
            }

            // Third try: PAN + any section (fallback)
            let foundTKey: string | null = null;
            for (const tKey of unmatchedTraces) {
                const lastUnderscoreT = tKey.lastIndexOf('_');
                const tPan = tKey.substring(0, lastUnderscoreT);
                if (tPan === pan) {
                    foundTKey = tKey;
                    break;
                }
            }
            if (foundTKey) {
                const trace = tracesLiability.get(foundTKey)!;
                if (!trace.section || trace.section === '—' || trace.section === '') {
                    trace.section = section;
                }
                matchedBooks.set(bKey, trace);
                matchedTraces.set(foundTKey, books);
                matchMethods.set(bKey, 'PAN');
                unmatchedBooks.delete(bKey);
                unmatchedTraces.delete(foundTKey);
            }
        }
    }

    // 2. Match by Exact Name
    for (const bKey of unmatchedBooks) {
        const books = booksLiability[bKey];
        const lastUnderscore = bKey.lastIndexOf('_');
        const section = bKey.substring(lastUnderscore + 1);
        const booksNormName = normalizePartyName(books.partyName);

        if (booksNormName) {
            let foundTKey: string | null = null;
            // First try: exact Name + exact Section
            for (const tKey of unmatchedTraces) {
                const traces = tracesLiability.get(tKey)!;
                if (traces.section === section) {
                    const tracesNormName = normalizePartyName(traces.partyName);
                    if (booksNormName === tracesNormName) {
                        let allowed = true;
                        if (confirmedMatches) {
                            allowed = confirmedMatches.some(cm => 
                                cm.booksName.toUpperCase().trim() === books.partyName.toUpperCase().trim() &&
                                cm.tracesName.toUpperCase().trim() === traces.partyName.toUpperCase().trim()
                            );
                        }
                        if (allowed) {
                            foundTKey = tKey;
                            break;
                        }
                    }
                }
            }
            // Second try: exact Name + empty/dash Section
            if (!foundTKey) {
                for (const tKey of unmatchedTraces) {
                    const traces = tracesLiability.get(tKey)!;
                    if (!traces.section || traces.section === '—' || traces.section === '') {
                        const tracesNormName = normalizePartyName(traces.partyName);
                        if (booksNormName === tracesNormName) {
                            let allowed = true;
                            if (confirmedMatches) {
                                allowed = confirmedMatches.some(cm => 
                                    cm.booksName.toUpperCase().trim() === books.partyName.toUpperCase().trim() &&
                                    cm.tracesName.toUpperCase().trim() === traces.partyName.toUpperCase().trim()
                                );
                            }
                            if (allowed) {
                                foundTKey = tKey;
                                break;
                            }
                        }
                    }
                }
            }
            // Third try: exact Name + any other Section
            if (!foundTKey) {
                for (const tKey of unmatchedTraces) {
                    const traces = tracesLiability.get(tKey)!;
                    const tracesNormName = normalizePartyName(traces.partyName);
                    if (booksNormName === tracesNormName) {
                        let allowed = true;
                        if (confirmedMatches) {
                            allowed = confirmedMatches.some(cm => 
                                cm.booksName.toUpperCase().trim() === books.partyName.toUpperCase().trim() &&
                                cm.tracesName.toUpperCase().trim() === traces.partyName.toUpperCase().trim()
                            );
                        }
                        if (allowed) {
                            foundTKey = tKey;
                            break;
                        }
                    }
                }
            }

            if (foundTKey) {
                const trace = tracesLiability.get(foundTKey)!;
                if (!trace.section || trace.section === '—' || trace.section === '') {
                    trace.section = section;
                }
                matchedBooks.set(bKey, trace);
                matchedTraces.set(foundTKey, books);
                matchMethods.set(bKey, 'Name (Exact)');
                unmatchedBooks.delete(bKey);
                unmatchedTraces.delete(foundTKey);
            }
        }
    }

    // 3. Match by Fuzzy Name
    for (const bKey of unmatchedBooks) {
        const books = booksLiability[bKey];
        const lastUnderscore = bKey.lastIndexOf('_');
        const section = bKey.substring(lastUnderscore + 1);
        const booksNormName = normalizePartyName(books.partyName);

        if (booksNormName) {
            let bestTKey: string | null = null;
            let highestSim = 0.7;

            // First pass: try fuzzy name with same section
            for (const tKey of unmatchedTraces) {
                const traces = tracesLiability.get(tKey)!;
                if (traces.section === section) {
                    const tracesNormName = normalizePartyName(traces.partyName);
                    if (tracesNormName) {
                        let sim = 0;
                        if (booksNormName.length >= 5 && tracesNormName.length >= 5 && 
                            (booksNormName.includes(tracesNormName) || tracesNormName.includes(booksNormName))) {
                            sim = 0.9;
                        } else {
                            const maxLen = Math.max(booksNormName.length, tracesNormName.length);
                            if (maxLen >= 4) {
                                const dist = levenshteinDistance(booksNormName, tracesNormName);
                                sim = 1 - dist / maxLen;
                            }
                        }

                        if (sim >= highestSim) {
                            let allowed = true;
                            if (confirmedMatches) {
                                allowed = confirmedMatches.some(cm => 
                                    cm.booksName.toUpperCase().trim() === books.partyName.toUpperCase().trim() &&
                                    cm.tracesName.toUpperCase().trim() === traces.partyName.toUpperCase().trim()
                                );
                            }
                            if (allowed) {
                                highestSim = sim;
                                bestTKey = tKey;
                            }
                        }
                    }
                }
            }

            // Second pass: if no match, try fuzzy name with any section (fallback)
            if (!bestTKey) {
                for (const tKey of unmatchedTraces) {
                    const traces = tracesLiability.get(tKey)!;
                    const tracesNormName = normalizePartyName(traces.partyName);
                    if (tracesNormName) {
                        let sim = 0;
                        if (booksNormName.length >= 5 && tracesNormName.length >= 5 && 
                            (booksNormName.includes(tracesNormName) || tracesNormName.includes(booksNormName))) {
                            sim = 0.9;
                        } else {
                            const maxLen = Math.max(booksNormName.length, tracesNormName.length);
                            if (maxLen >= 4) {
                                const dist = levenshteinDistance(booksNormName, tracesNormName);
                                sim = 1 - dist / maxLen;
                            }
                        }

                        if (sim >= highestSim) {
                            let allowed = true;
                            if (confirmedMatches) {
                                allowed = confirmedMatches.some(cm => 
                                    cm.booksName.toUpperCase().trim() === books.partyName.toUpperCase().trim() &&
                                    cm.tracesName.toUpperCase().trim() === traces.partyName.toUpperCase().trim()
                                );
                            }
                            if (allowed) {
                                highestSim = sim;
                                bestTKey = tKey;
                            }
                        }
                    }
                }
            }

            if (bestTKey) {
                const trace = tracesLiability.get(bestTKey)!;
                if (!trace.section || trace.section === '—' || trace.section === '') {
                    trace.section = section;
                }
                matchedBooks.set(bKey, trace);
                matchedTraces.set(bestTKey, books);
                matchMethods.set(bKey, 'Name (Fuzzy)');
                unmatchedBooks.delete(bKey);
                unmatchedTraces.delete(bestTKey);
            }
        }
    }

    // Construct results for all Books entries
    for (const bKey of Object.keys(booksLiability)) {
        const books = booksLiability[bKey];
        const lastUnderscore = bKey.lastIndexOf('_');
        const pan = bKey.substring(0, lastUnderscore);
        const section = bKey.substring(lastUnderscore + 1);

        const matchedTrace = matchedBooks.get(bKey);

        let panInBooks = pan.startsWith('NOPAN-') ? 'PAN-MISSING' : pan;
        let panIn26Q = (matchedTrace && matchedTrace.partyPan) ? matchedTrace.partyPan : '—';

        // Rate Determination Hierarchy:
        // 1. Use 26Q rate if present (and taxable amount > 0)
        // 2. Else use Book PAN if valid
        // 3. Else (Book PAN missing/invalid) use individual category rate
        let rate = books.rateApplied !== undefined ? books.rateApplied : 20.0;
        let rateText = "";

        const fallbackRates: Record<string, { ind: number; comp: number }> = {
            '192A': { ind: 10, comp: 10 },
            '193': { ind: 10, comp: 10 },
            '194': { ind: 10, comp: 10 },
            '194A': { ind: 10, comp: 10 },
            '194C': { ind: 1, comp: 2 },
            '194D': { ind: 5, comp: 10 },
            '194DA': { ind: 2, comp: 2 },
            '194G': { ind: 2, comp: 2 },
            '194H': { ind: 2, comp: 2 },
            '194I(a)': { ind: 2, comp: 2 },
            '194I(b)': { ind: 10, comp: 10 },
            '194IA': { ind: 1, comp: 1 },
            '194IB': { ind: 2, comp: 2 },
            '194IC': { ind: 10, comp: 10 },
            '194J(a)': { ind: 2, comp: 2 },
            '194J(b)': { ind: 10, comp: 10 },
            '194LA': { ind: 10, comp: 10 },
            '194M': { ind: 2, comp: 2 },
            '194O': { ind: 0.1, comp: 0.1 },
            '194Q': { ind: 0.1, comp: 0.1 },
            '194R': { ind: 10, comp: 10 },
            '194S': { ind: 1, comp: 1 },
            '194T': { ind: 10, comp: 10 },
        };
        const sectionInfo = fallbackRates[section];
        const rateIndividualHuf = sectionInfo ? sectionInfo.ind : 1.0;
        const rateCompanyOthers = sectionInfo ? sectionInfo.comp : 2.0;

        if (matchedTrace && matchedTrace.tracesTaxable > 0) {
            rate = Math.round((matchedTrace.tracesTds / matchedTrace.tracesTaxable) * 10000) / 100;
            rateText = `Form 26Q`;
        } else if (panInBooks && panInBooks !== 'PAN-MISSING' && /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(panInBooks)) {
            const entityChar = panInBooks.charAt(3).toUpperCase();
            const isIndividualOrHuf = (entityChar === 'P' || entityChar === 'H');
            rate = isIndividualOrHuf ? rateIndividualHuf : rateCompanyOthers;
            rateText = `Books PAN`;
        } else {
            rate = rateIndividualHuf;
            rateText = `Individual fallback`;
        }

        // Apply the resolved rate
        books.rateApplied = rate;
        books.requiredTds = (books.taxableAmount * rate) / 100;

        // Clean up explanation message if books PAN was missing
        if (panInBooks === 'PAN-MISSING') {
            if (books.reason && books.reason.includes('PAN: Missing')) {
                books.reason = books.reason.replace(/\| PAN: Missing \([^)]+\)/g,
                    `| PAN: Missing (${rate}% rate applied: ${rateText})`);
            } else {
                books.reason = (books.reason || '') + ` | PAN: Missing (${rate}% rate applied: ${rateText})`;
            }
        }

        let nameInBooks = books.partyName;
        let nameIn26Q = matchedTrace ? matchedTrace.partyName : '—';

        let tracesTaxable = matchedTrace ? matchedTrace.tracesTaxable : 0;
        let tracesTds = matchedTrace ? matchedTrace.tracesTds : 0;

        let taxableVariance = books.taxableAmount - tracesTaxable;
        let tdsVariance = books.requiredTds - tracesTds;

        let status: TdsReconciliationResult['status'] = 'Matched';
        // Under Threshold: no taxable amount was computed (below annual/single-bill limits)
        // This applies even if voluntary TDS was deducted in books
        if (books.taxableAmount === 0 && tracesTaxable === 0 && tracesTds === 0) {
            status = 'Under Threshold';
        } else if (!matchedTrace && books.requiredTds > 0) {
            status = 'Missing in 26Q';
        } else if (tdsVariance > 5) {
            status = 'Short Deducted';
        } else if (tdsVariance < -5) {
            status = 'Excess Deducted';
        }

        const remark = matchedTrace ? (matchMethods.get(bKey) === 'Name (Exact)' ? "[Name Match] " : matchMethods.get(bKey) === 'Name (Fuzzy)' ? "[Fuzzy Name Match] " : "") : "";
        const reason = remark + (books.reason || '');

        results.push({
            partyName: nameInBooks !== '—' ? nameInBooks : nameIn26Q,
            partyPan: panInBooks !== '—' ? panInBooks : panIn26Q,
            panInBooks,
            panIn26Q,
            nameInBooks,
            nameIn26Q,
            section,
            booksSpend: books.annualSpend,
            booksTaxable: books.taxableAmount,
            rateApplied: rate,
            booksRequiredTds: Math.round(books.requiredTds),
            booksActualTds: books.actualTds,
            tracesTaxable,
            tracesTds,
            taxableVariance,
            tdsVariance: Math.round(tdsVariance),
            status,
            ledgers: Array.from(books.ledgers).join(', '),
            tdsLedgers: Array.from(books.tdsLedgers || []).join(', '),
            reason
        });
    }

    // Construct results for unmatched traces
    for (const tKey of unmatchedTraces) {
        const trace = tracesLiability.get(tKey)!;
        const { rate } = getTdsRate(trace.section, trace.partyPan);

        let panInBooks = '—';
        let panIn26Q = trace.partyPan;
        let nameInBooks = '—';
        let nameIn26Q = trace.partyName;

        results.push({
            partyName: nameIn26Q,
            partyPan: panIn26Q,
            panInBooks,
            panIn26Q,
            nameInBooks,
            nameIn26Q,
            section: trace.section,
            booksSpend: 0,
            booksTaxable: 0,
            rateApplied: rate,
            booksRequiredTds: 0,
            booksActualTds: 0,
            tracesTaxable: trace.tracesTaxable,
            tracesTds: trace.tracesTds,
            taxableVariance: -trace.tracesTaxable,
            tdsVariance: -trace.tracesTds,
            status: 'Missing in Books',
            ledgers: '',
            tdsLedgers: '',
            reason: 'No expense entries found in Books (Directly reported in Form 26Q)'
        });
    }

    return results;
}

function createSheet(results: TdsReconciliationResult[], title: string, companyName: string) {
    const headers = [
        'Party Name',
        'PAN (Books)',
        'Section',
        'Status',
        'Total Spend (Books)',
        'Taxable (Books)',
        'TDS Rate (%)',
        'Req. TDS (Books)',
        'Actual TDS (Books)',
        'Taxable (26Q)',
        'TDS (26Q)',
        'Taxable Variance',
        'TDS Variance',
        'Closing Balance',
        'PAN in 26Q',
        'Name in 26Q',
        'Expense Ledgers',
        'TDS Ledgers',
        'Applicability Reason'
    ];

    const data = results.map((r, i) => {
        const rowNum = 5 + i; // 1-based index in Excel, starts at row 5
        return [
            r.partyName || r.nameInBooks || r.nameIn26Q || '',
            r.panInBooks || '',
            r.section || '',
            r.status || '',
            r.booksSpend || 0,
            r.booksTaxable || 0,
            r.rateApplied || 0,
            { t: 'n', f: `ROUND(F${rowNum}*G${rowNum}/100, 0)`, v: r.booksRequiredTds },
            r.booksActualTds || 0,
            r.tracesTaxable || 0,
            r.tracesTds || 0,
            { t: 'n', f: `F${rowNum}-J${rowNum}`, v: r.taxableVariance },
            { t: 'n', f: `H${rowNum}-K${rowNum}`, v: r.tdsVariance },
            r.closingBalance || 0,
            r.panIn26Q || '',
            r.nameIn26Q || '',
            r.ledgers || '',
            r.tdsLedgers || '',
            r.reason || ''
        ];
    });

    const startRow = 5;
    const endRow = 4 + results.length;
    const totals = [
        'GRAND TOTAL', '', '', '',
        results.length > 0 ? { t: 'n', f: `SUM(E${startRow}:E${endRow})`, v: results.reduce((sum, r) => sum + r.booksSpend, 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(F${startRow}:F${endRow})`, v: results.reduce((sum, r) => sum + r.booksTaxable, 0) } : 0,
        '', // Rate is empty for GRAND TOTAL row
        results.length > 0 ? { t: 'n', f: `SUM(H${startRow}:H${endRow})`, v: results.reduce((sum, r) => sum + r.booksRequiredTds, 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(I${startRow}:I${endRow})`, v: results.reduce((sum, r) => sum + r.booksActualTds, 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(J${startRow}:J${endRow})`, v: results.reduce((sum, r) => sum + r.tracesTaxable, 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(K${startRow}:K${endRow})`, v: results.reduce((sum, r) => sum + r.tracesTds, 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(L${startRow}:L${endRow})`, v: results.reduce((sum, r) => sum + r.taxableVariance, 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(M${startRow}:M${endRow})`, v: results.reduce((sum, r) => sum + r.tdsVariance, 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(N${startRow}:N${endRow})`, v: results.reduce((sum, r) => sum + (r.closingBalance || 0), 0) } : 0,
        '', '', '', '', ''
    ];

    const aoa = [
        [`${title.toUpperCase()} - ${companyName.toUpperCase()}`],
        [`Generated on: ${new Date().toLocaleString('en-IN')} | Powered by Vaswani Return`],
        [],
        headers,
        ...data,
        totals
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Apply Merges & Column Widths
    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } }
    ];

    ws['!cols'] = [
        { wch: 32 }, // Col A: Party Name
        { wch: 16 }, // Col B: PAN (Books)
        { wch: 12 }, // Col C: Section
        { wch: 20 }, // Col D: Status
        { wch: 20 }, // Col E: Total Spend
        { wch: 18 }, // Col F: Taxable (Books)
        { wch: 14 }, // Col G: TDS Rate
        { wch: 18 }, // Col H: Req. TDS
        { wch: 18 }, // Col I: Actual TDS
        { wch: 18 }, // Col J: Taxable (26Q)
        { wch: 18 }, // Col K: TDS (26Q)
        { wch: 18 }, // Col L: Taxable Variance
        { wch: 18 }, // Col M: TDS Variance
        { wch: 18 }, // Col N: Closing Balance
        { wch: 16 }, // Col O: PAN in 26Q
        { wch: 30 }, // Col P: Name in 26Q
        { wch: 25 }, // Col Q: Expense Ledgers
        { wch: 25 }, // Col R: TDS Ledgers
        { wch: 60 }  // Col S: Reason
    ];

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:S10');

    for (let R = 0; R <= range.e.r; R++) {
        for (let C = 0; C <= range.e.c; C++) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' };

            const isNumCol = (C >= 4 && C <= 13);
            const isRateCol = C === 6;
            const isTotalRow = R === range.e.r;

            if (R === 0) {
                // Main Header Banner
                ws[cellAddress].s = {
                    font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } },
                    fill: { fgColor: { rgb: '0F172A' } },
                    alignment: { horizontal: 'center', vertical: 'center' }
                };
            } else if (R === 1) {
                // Subtitle
                ws[cellAddress].s = {
                    font: { italic: true, sz: 10, color: { rgb: '94A3B8' } },
                    fill: { fgColor: { rgb: '1E293B' } },
                    alignment: { horizontal: 'center', vertical: 'center' }
                };
            } else if (R === 3) {
                // Table Header Row - Category Group Banding
                let fill = '1E293B'; // Identifiers (Slate)
                if (C >= 4 && C <= 8) fill = '1E3A8A';   // Books Liability (Ocean Blue)
                if (C >= 9 && C <= 10) fill = '065F46';  // 26Q Traces (Forest Green)
                if (C >= 11 && C <= 12) fill = '92400E'; // Variances (Warm Amber)
                if (C >= 13 && C <= 17) fill = '3730A3'; // Ledgers & References (Indigo)

                ws[cellAddress].s = {
                    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
                    fill: { fgColor: { rgb: fill } },
                    alignment: { horizontal: 'center', vertical: 'center' },
                    border: {
                        top: { style: 'medium', color: { rgb: '0F172A' } },
                        bottom: { style: 'medium', color: { rgb: '0F172A' } }
                    }
                };
            } else if (R > 3) {
                if (isNumCol && (ws[cellAddress].v !== '' || ws[cellAddress].f)) {
                    ws[cellAddress].t = 'n';
                    if (isRateCol) {
                        ws[cellAddress].z = '0.0"%"';
                    } else {
                        ws[cellAddress].z = '#,##0.00';
                    }
                }

                if (isTotalRow) {
                    ws[cellAddress].s = {
                        font: { sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
                        fill: { fgColor: { rgb: '0F172A' } },
                        alignment: { horizontal: isNumCol && !isRateCol ? 'right' : 'left', vertical: 'center' },
                        border: {
                            top: { style: 'medium', color: { rgb: 'FFFFFF' } },
                            bottom: { style: 'double', color: { rgb: 'FFFFFF' } }
                        }
                    };
                } else {
                    // Regular Data Row Styling
                    ws[cellAddress].s = {
                        font: { sz: 9, color: { rgb: '0F172A' } },
                        fill: { fgColor: { rgb: R % 2 === 0 ? 'F8FAFC' : 'FFFFFF' } },
                        alignment: { horizontal: isNumCol && !isRateCol ? 'right' : (isRateCol || C === 2 ? 'center' : 'left'), vertical: 'center' },
                        border: { bottom: { style: 'hair', color: { rgb: 'E2E8F0' } } }
                    };

                    // Rich Colorful Badge Pill Fills for Status Column (Col D, Index 3)
                    if (C === 3) {
                        const status = String(ws[cellAddress].v);
                        if (status === 'Matched') {
                            ws[cellAddress].s.fill = { fgColor: { rgb: 'D1FAE5' } };
                            ws[cellAddress].s.font = { sz: 9, bold: true, color: { rgb: '065F46' } };
                        } else if (status === 'Short Deducted') {
                            ws[cellAddress].s.fill = { fgColor: { rgb: 'FEF3C7' } };
                            ws[cellAddress].s.font = { sz: 9, bold: true, color: { rgb: '92400E' } };
                        } else if (status === 'Excess Deducted') {
                            ws[cellAddress].s.fill = { fgColor: { rgb: 'E0F2FE' } };
                            ws[cellAddress].s.font = { sz: 9, bold: true, color: { rgb: '075985' } };
                        } else if (status === 'Missing in 26Q') {
                            ws[cellAddress].s.fill = { fgColor: { rgb: 'FEE2E2' } };
                            ws[cellAddress].s.font = { sz: 9, bold: true, color: { rgb: '991B1B' } };
                        } else if (status === 'Missing in Books') {
                            ws[cellAddress].s.fill = { fgColor: { rgb: 'E0E7FF' } };
                            ws[cellAddress].s.font = { sz: 9, bold: true, color: { rgb: '3730A3' } };
                        } else if (status === 'Under Threshold') {
                            ws[cellAddress].s.fill = { fgColor: { rgb: 'F1F5F9' } };
                            ws[cellAddress].s.font = { sz: 9, bold: true, color: { rgb: '475569' } };
                        }
                        ws[cellAddress].s.alignment = { horizontal: 'center', vertical: 'center' };
                    }
                }
            }
        }
    }
    return ws;
}

const isPanMissing = (pan?: string) => {
    const p = (pan || '').trim().toUpperCase();
    return !p || p === 'PAN-MISSING' || p === 'PAN MISSING' || p === 'UNREGISTERED';
};

/**
 * EXPORT SERVICE: Generates a styled Excel workbook with three sheets for Applicable, Not Applicable, and PAN Required results
 */
export function exportTdsReport(results: TdsReconciliationResult[], companyName: string = 'Company') {
    const wb = XLSX.utils.book_new();

    const panMissingResults = results.filter(r => isPanMissing(r.partyPan));
    const applicableResults = results.filter(r => r.status !== 'Under Threshold');
    const notApplicableResults = results.filter(r => r.status === 'Under Threshold');

    const wsApp = createSheet(applicableResults, 'TDS Applicable Summary', companyName);
    const wsNotApp = createSheet(notApplicableResults, 'TDS Not Applicable Summary', companyName);
    const wsPanReq = createSheet(panMissingResults, 'PAN Required Summary', companyName);

    XLSX.utils.book_append_sheet(wb, wsApp, 'TDS Applicable');
    XLSX.utils.book_append_sheet(wb, wsNotApp, 'TDS Not Applicable');
    XLSX.utils.book_append_sheet(wb, wsPanReq, 'PAN Required');

    XLSX.writeFile(wb, `TDS_Reconciliation_${new Date().getTime()}.xlsx`);
}