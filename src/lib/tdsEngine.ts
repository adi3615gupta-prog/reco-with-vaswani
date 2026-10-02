import type { TdsSection } from '@/pages/TdsReconciliation';
import * as XLSX from 'xlsx-js-style';
import { toast } from 'sonner';

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
    isPayment?: boolean;
    paymentAmount?: number;
}

export interface AdvanceTdsResult {
    partyName: string;
    partyPan: string;
    section: string;
    currentYearExpenses: number;
    currentYearPayments: number;
    advanceAmount: number;
    rateApplied: number;
    requiredTdsOnAdvance: number;
    actualTdsDeducted: number;
    tdsShortfallOnAdvance: number;
    status: 'Un-deducted Advance TDS' | 'Short Deducted' | 'Sufficiently Covered' | 'Unmapped Advance Payment';
    reason: string;
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
    taxableBasis?: string;
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
    isMultiLedgerPan?: boolean;
    multiLedgerCount?: number;
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

    const cleanLedgerStr = (s: string) => (s || '').replace(/\u00A0/g, ' ').replace(/["']/g, '').toLowerCase().trim();

    // Map ledger names to their statutory section configuration
    const ledgerToSectionMap = new Map(mappings.map(m => [cleanLedgerStr(m.ledgerName), m.sectionCode]));
    const sectionLimits = new Map(sectionsMaster.map(s => [s.old_section, s]));

    // Pre-scan to build a map of party name to its resolved section codes
    const partySectionMap = new Map<string, Set<string>>();
    for (const txn of transactions) {
        const sectionCode = ledgerToSectionMap.get(cleanLedgerStr(txn.ledgerName));
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

    const extractSectionFromStr = (str?: string) => {
        if (!str) return null;
        const u = str.toUpperCase();
        if (u.includes('194C') || u.includes('194-C')) return '194C';
        if (u.includes('194IA') || u.includes('194-IA')) return '194IA';
        if (u.includes('194IB') || u.includes('194-IB')) return '194IB';
        if (u.includes('194I') || u.includes('194-I')) {
            return (u.includes('MACHINERY') || u.includes('HIRE') || u.includes('PLANT')) ? '194I(a)' : '194I(b)';
        }
        if (u.includes('194J') || u.includes('194-J')) {
            return (u.includes('PROF') || u.includes('SERVICE') || u.includes('FEES')) ? '194J(b)' : '194J(a)';
        }
        if (u.includes('194H') || u.includes('194-H')) return '194H';
        if (u.includes('194Q') || u.includes('194-Q')) return '194Q';
        if (u.includes('194R') || u.includes('194-R')) return '194R';
        if (u.includes('194T') || u.includes('194-T')) return '194T';
        if (u.includes('194A') || u.includes('194-A')) return '194A';
        if (u.includes('194M') || u.includes('194-M')) return '194M';
        if (u.includes('194O') || u.includes('194-O')) return '194O';
        return null;
    };

    for (const txn of sortedTxns) {
        const cleanLedger = cleanLedgerStr(txn.ledgerName);
        const isTdsTax = cleanLedger.includes('tds') || cleanLedger.includes('tax deducted') || cleanLedger.includes('tax payable') || cleanLedger.includes('tax liability');

        let resolvedSection = ledgerToSectionMap.get(cleanLedger);
        if (!resolvedSection && txn.tdsLedgerName) {
            resolvedSection = extractSectionFromStr(txn.tdsLedgerName) || undefined;
        }
        if (!resolvedSection && txn.ledgerName) {
            resolvedSection = extractSectionFromStr(txn.ledgerName) || undefined;
        }
        if (!resolvedSection) {
            const partySections = partySectionMap.get(txn.partyName.toUpperCase().trim());
            if (partySections && partySections.size > 0) {
                resolvedSection = Array.from(partySections)[0];
            }
        }
        if (!resolvedSection) {
            resolvedSection = '194C';
        }

        const limits = sectionLimits.get(resolvedSection);
        if (!limits) continue;

        let rawPan = (txn.partyPan || '').toUpperCase().trim();
        const isMissing = !rawPan || rawPan === 'PAN-MISSING' || rawPan === 'PAN MISSING' || rawPan === 'UNREGISTERED';
        if (isMissing) {
            rawPan = '';
        } else {
            rawPan = rawPan.replace(/\s+/g, '');
        }
        const cleanName = txn.partyName.toUpperCase().trim();
        const groupKey = isMissing
            ? `NOPAN-${cleanName}_${resolvedSection}`
            : `${cleanName}_${rawPan}_${resolvedSection}`;

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
        if (resolvedSection !== '194Q') {
            let isTaxable = false;
            if (limits.single_bill_threshold !== null && txn.amount > limits.single_bill_threshold) {
                isTaxable = true; // Breached single bill limit
            } else if (group.annualSpend > limits.annual_aggregate_threshold) {
                isTaxable = true; // Breached aggregate annual limit
            }

            if (isTaxable) {
                group.taxableAmount += txn.amount;
                const { rate } = getTdsRate(resolvedSection, rawPan, sectionsMaster);
                group.requiredTds += (txn.amount * rate) / 100;
            }
        }
    }

    for (const groupKey of Object.keys(partySectionTotals)) {
        const group = partySectionTotals[groupKey];
        const lastUnderscore = groupKey.lastIndexOf('_');
        const section = groupKey.substring(lastUnderscore + 1);
        const prefix = groupKey.substring(0, lastUnderscore);
        const secondLastUnderscore = prefix.lastIndexOf('_');
        const pan = secondLastUnderscore !== -1 ? prefix.substring(secondLastUnderscore + 1) : prefix;
        const limits = sectionLimits.get(section);
        let reason = '';

        if (section === '194Q') {
            const threshold = limits ? limits.annual_aggregate_threshold : 5000000;
            group.taxableAmount = Math.max(0, group.annualSpend - threshold);
            const { rate, isMissingPan } = getTdsRate(section, pan.startsWith('NOPAN-') ? '' : pan, sectionsMaster);
            group.rateApplied = rate;
            group.requiredTds = Math.round((group.taxableAmount * rate) / 100);

            const isApp = group.taxableAmount > 0;
            let reasonStr = isApp
                ? `TDS Status: Applicable | Total Spend: ₹${group.annualSpend.toLocaleString('en-IN')} | Exempt Threshold: ₹${threshold.toLocaleString('en-IN')} | Taxable Base: ₹${group.taxableAmount.toLocaleString('en-IN')} | Book TDS: ₹${group.actualTds.toLocaleString('en-IN')}`
                : `TDS Status: Not Applicable (Below threshold) | Total Spend: ₹${group.annualSpend.toLocaleString('en-IN')} | Exempt Threshold: ₹${threshold.toLocaleString('en-IN')} | Taxable Base: ₹0 | Book TDS: ₹${group.actualTds.toLocaleString('en-IN')}`;

            if (isMissingPan) {
                reasonStr += ` | PAN: Missing (${rate}% rate)`;
            }
            if (group.reversalAmount > 0) {
                reasonStr += ` | Gross: ₹${group.grossSpend.toLocaleString('en-IN')} | Reversals: ₹${group.reversalAmount.toLocaleString('en-IN')}`;
            }

            group.reason = reasonStr;
        } else {
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
    }

    return partySectionTotals;
}

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
    isPayment?: boolean;
    paymentAmount?: number;
    openingBalanceCr?: number;
}

export interface AdvanceTdsResult {
    partyName: string;
    partyPan: string;
    section: string;
    currentYearExpenses: number;
    openingBalanceCr?: number;
    currentYearPayments: number;
    advanceAmount: number;
    rateApplied: number;
    requiredTdsOnAdvance: number;
    actualTdsDeducted: number;
    tdsShortfallOnAdvance: number;
    status: 'Un-deducted Advance TDS' | 'Short Deducted' | 'Sufficiently Covered' | 'Unmapped Advance Payment';
    reason: string;
}

/**
 * ADVANCE TDS AUDIT ENGINE (Section 199 / Rule 37BA Compliance)
 * Identifies instances where Payments > (Expenses + Opening Balance Cr)
 * and computes mandatory TDS liability under "Payment or Credit Whichever is Earlier" provision.
 */
export function computeAdvanceTdsAudit(
    transactions: TallyTdsTransaction[],
    mappings: { ledgerName: string; sectionCode: string }[],
    sectionsMaster: TdsSection[],
    partyMasterSectionMap?: Map<string, string>,
    partyOpeningBalances?: Map<string, number>
): AdvanceTdsResult[] {
    const cleanLedgerStr = (s: string) => (s || '').replace(/\u00A0/g, ' ').replace(/["']/g, '').toLowerCase().trim();
    const ledgerToSectionMap = new Map(mappings.map(m => [cleanLedgerStr(m.ledgerName), m.sectionCode]));
    const sectionLimits = new Map(sectionsMaster.map(s => [s.old_section, s]));

    interface PartySummary {
        partyName: string;
        partyPan: string;
        currentYearExpenses: number;
        currentYearPayments: number;
        actualTdsDeducted: number;
        maxSingleBill: number;
        openingBalanceCr: number;
        sectionsUsed: Set<string>;
    }

    const partySummaryMap = new Map<string, PartySummary>();

    for (const txn of transactions) {
        const partyKey = txn.partyName.toUpperCase().trim();
        if (!partySummaryMap.has(partyKey)) {
            let opCr = 0;
            if (txn.openingBalanceCr !== undefined && txn.openingBalanceCr !== null) {
                opCr = Math.max(0, txn.openingBalanceCr);
            } else if (partyOpeningBalances && partyOpeningBalances.has(partyKey)) {
                const bal = partyOpeningBalances.get(partyKey)!;
                opCr = bal < 0 ? Math.abs(bal) : (bal > 0 ? bal : 0);
            }

            partySummaryMap.set(partyKey, {
                partyName: txn.partyName,
                partyPan: txn.partyPan || '',
                currentYearExpenses: 0,
                currentYearPayments: 0,
                actualTdsDeducted: 0,
                maxSingleBill: 0,
                openingBalanceCr: opCr,
                sectionsUsed: new Set<string>()
            });
        }

        const summary = partySummaryMap.get(partyKey)!;
        if (!summary.partyPan && txn.partyPan) {
            summary.partyPan = txn.partyPan;
        }

        if (txn.openingBalanceCr !== undefined && txn.openingBalanceCr !== null && txn.openingBalanceCr > summary.openingBalanceCr) {
            summary.openingBalanceCr = Math.max(0, txn.openingBalanceCr);
        }

        const txnVal = Math.abs(txn.isPayment ? (txn.paymentAmount ?? txn.amount) : txn.amount);
        if (txnVal > summary.maxSingleBill) {
            summary.maxSingleBill = txnVal;
        }

        if (txn.isPayment) {
            summary.currentYearPayments += txn.paymentAmount ?? Math.abs(txn.amount);
            summary.actualTdsDeducted += txn.actualTdsDeducted || 0;
        } else {
            const cleanLedger = cleanLedgerStr(txn.ledgerName);
            const sectionCode = ledgerToSectionMap.get(cleanLedger);
            if (sectionCode) {
                summary.sectionsUsed.add(sectionCode);
            }
            if (txn.amount > 0) {
                summary.currentYearExpenses += txn.amount;
            }
            summary.actualTdsDeducted += txn.actualTdsDeducted || 0;
        }
    }

    const results: AdvanceTdsResult[] = [];

    for (const [, summary] of partySummaryMap.entries()) {
        if (summary.currentYearPayments === 0 && summary.currentYearExpenses === 0) continue;

        const openingCr = Math.max(0, summary.openingBalanceCr);
        // Advance Amount = MAX(0, Payments Made (FY) - (Expenses Credited (FY) + Opening Balance (Cr)))
        const advanceAmount = Math.max(0, summary.currentYearPayments - (summary.currentYearExpenses + openingCr));
        if (advanceAmount <= 0) continue; // Only process parties where Payments > (Expenses + Opening Balance Cr)

        // Resolve Section Code: Priority 1 (Expense Ledgers) -> Priority 2 (Party Master) -> Priority 3 (UNMAPPED)
        let resolvedSection = '';
        if (summary.sectionsUsed.size > 0) {
            resolvedSection = Array.from(summary.sectionsUsed)[0];
        } else if (partyMasterSectionMap && partyMasterSectionMap.has(summary.partyName.toUpperCase().trim())) {
            resolvedSection = partyMasterSectionMap.get(summary.partyName.toUpperCase().trim())!;
        } else {
            resolvedSection = 'UNMAPPED';
        }

        let rate = 0;
        let isMissingPan = false;

        if (resolvedSection !== 'UNMAPPED') {
            const tdsRateInfo = getTdsRate(resolvedSection, summary.partyPan, sectionsMaster);
            rate = tdsRateInfo.rate;
            isMissingPan = tdsRateInfo.isMissingPan;
        }

        const limits = sectionLimits.get(resolvedSection);
        let isTaxable = false;

        // THRESHOLD GATEKEEPER: Use MAX(Expenses, Payments) as Gross Transaction Value for annual limit, and maxSingleBill for single bill limit
        const grossTransactionValue = Math.max(summary.currentYearExpenses, summary.currentYearPayments);

        if (resolvedSection === 'UNMAPPED') {
            isTaxable = true;
        } else if (limits) {
            const breachesSingleBill = limits.single_bill_threshold !== null && summary.maxSingleBill >= limits.single_bill_threshold;
            const breachesAnnualAggregate = limits.annual_aggregate_threshold !== null && grossTransactionValue >= limits.annual_aggregate_threshold;
            if (breachesSingleBill || breachesAnnualAggregate) {
                isTaxable = true;
            }
        } else {
            isTaxable = true;
        }

        const requiredTdsOnAdvance = isTaxable ? Math.round((advanceAmount * rate) / 100) : 0;
        const tdsShortfallOnAdvance = isTaxable ? Math.max(0, requiredTdsOnAdvance - summary.actualTdsDeducted) : 0;

        let status: AdvanceTdsResult['status'] = 'Sufficiently Covered';
        if (resolvedSection === 'UNMAPPED') {
            status = 'Unmapped Advance Payment';
        } else if (!isTaxable) {
            status = 'Sufficiently Covered'; // Below threshold - no TDS needed
        } else if (tdsShortfallOnAdvance > 0 && summary.actualTdsDeducted === 0) {
            status = 'Un-deducted Advance TDS';
        } else if (tdsShortfallOnAdvance > 0) {
            status = 'Short Deducted';
        }

        const expPlusOpeningStr = openingCr > 0 ? `Expenses (₹${summary.currentYearExpenses.toLocaleString('en-IN')}) + Opening Cr (₹${openingCr.toLocaleString('en-IN')})` : `Expenses (₹${summary.currentYearExpenses.toLocaleString('en-IN')})`;
        let reason = `Payments (₹${summary.currentYearPayments.toLocaleString('en-IN')}) > ${expPlusOpeningStr} by ₹${advanceAmount.toLocaleString('en-IN')}.`;
        if (resolvedSection === 'UNMAPPED') {
            reason += ' Section unmapped — assign TDS section in Party Master.';
        } else if (!isTaxable) {
            const thresholdVal = limits ? limits.annual_aggregate_threshold : 0;
            reason += ` Not Applicable (Below Threshold). Gross Transaction Value ₹${grossTransactionValue.toLocaleString('en-IN')} < Annual Limit ₹${thresholdVal.toLocaleString('en-IN')} u/s ${resolvedSection}.`;
        } else {
            reason += ` TDS rate ${rate}% u/s ${resolvedSection}.`;
            if (isMissingPan) reason += ' PAN missing (20% rate applied u/s 206AA).';
        }

        results.push({
            partyName: summary.partyName,
            partyPan: summary.partyPan || 'PAN-MISSING',
            section: resolvedSection,
            currentYearExpenses: Math.round(summary.currentYearExpenses),
            openingBalanceCr: Math.round(openingCr),
            currentYearPayments: Math.round(summary.currentYearPayments),
            advanceAmount: Math.round(advanceAmount),
            rateApplied: isTaxable ? rate : 0,
            requiredTdsOnAdvance,
            actualTdsDeducted: Math.round(summary.actualTdsDeducted),
            tdsShortfallOnAdvance: Math.round(tdsShortfallOnAdvance),
            status,
            reason
        });
    }

    return results;
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
            .replace(/[A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,4}[-\s]?\d{1,4}/gi, '')
            .replace(/\(.*?\)/g, '')
            .replace(/\b(DRIVER|VEHICLE|LORRY|TRUCK|TANKER|CAB|AUTO|TRANSPORTER|TRANSPORT|TEMPO|BUS|TRAILER)\b/gi, '')
            .replace(/[-\s\(\)]+(CR|DR)\b$/gi, '')
            .replace(/\b(M\/S\.?|MS\.?|MR\.?|MRS\.?|SHREE|SHRI)\b/gi, '')
            .replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY|CORP|CORPORATION|ENTERPRISES?|TRADERS?|INDUSTRIES|AGENC(?:Y|IES)|BROTHERS|BROS|SONS|ASSOCIATES|AND|&)\b/gi, '')
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
        const section = bKey.substring(lastUnderscore + 1);
        const prefix = bKey.substring(0, lastUnderscore);
        const secondLastUnderscore = prefix.lastIndexOf('_');
        const pan = secondLastUnderscore !== -1 ? prefix.substring(secondLastUnderscore + 1) : prefix;

        if (isLocalPanValid(pan)) {
            // First try: exact PAN + exact Section
            const tKeyExact = `${pan}_${section}`;
            if (unmatchedTraces.has(tKeyExact)) {
                const trace = tracesLiability.get(tKeyExact)!;
                matchedBooks.set(bKey, trace);
                matchedTraces.set(tKeyExact, books);
                matchMethods.set(bKey, 'PAN');
                unmatchedBooks.delete(bKey);
                // Do not delete tKeyExact if other party names share the same PAN
                // unmatchedTraces.delete(tKeyExact);
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
                        if (confirmedMatches && confirmedMatches.length > 0) {
                            allowed = confirmedMatches.some(cm => 
                                normalizePartyName(cm.booksName) === normalizePartyName(books.partyName) &&
                                normalizePartyName(cm.tracesName) === normalizePartyName(traces.partyName)
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
                            if (confirmedMatches && confirmedMatches.length > 0) {
                                allowed = confirmedMatches.some(cm => 
                                    normalizePartyName(cm.booksName) === normalizePartyName(books.partyName) &&
                                    normalizePartyName(cm.tracesName) === normalizePartyName(traces.partyName)
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
                        if (confirmedMatches && confirmedMatches.length > 0) {
                            allowed = confirmedMatches.some(cm => 
                                normalizePartyName(cm.booksName) === normalizePartyName(books.partyName) &&
                                normalizePartyName(cm.tracesName) === normalizePartyName(traces.partyName)
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
                            if (confirmedMatches && confirmedMatches.length > 0) {
                                allowed = confirmedMatches.some(cm => 
                                    normalizePartyName(cm.booksName) === normalizePartyName(books.partyName) &&
                                    normalizePartyName(cm.tracesName) === normalizePartyName(traces.partyName)
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
                            if (confirmedMatches && confirmedMatches.length > 0) {
                                allowed = confirmedMatches.some(cm => 
                                    normalizePartyName(cm.booksName) === normalizePartyName(books.partyName) &&
                                    normalizePartyName(cm.tracesName) === normalizePartyName(traces.partyName)
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
        const section = bKey.substring(lastUnderscore + 1);
        const prefix = bKey.substring(0, lastUnderscore);
        const secondLastUnderscore = prefix.lastIndexOf('_');
        const pan = secondLastUnderscore !== -1 ? prefix.substring(secondLastUnderscore + 1) : prefix;

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

    // Identify multi-ledger PANs (where > 1 distinct party ledger shares the same valid PAN)
    const panToLedgerNamesMap = new Map<string, Set<string>>();
    for (const r of results) {
        const cleanPan = (r.partyPan || '').toUpperCase().trim();
        if (cleanPan && !cleanPan.startsWith('NOPAN-') && cleanPan !== 'PAN-MISSING' && cleanPan !== 'PAN MISSING' && cleanPan !== '—') {
            if (!panToLedgerNamesMap.has(cleanPan)) {
                panToLedgerNamesMap.set(cleanPan, new Set());
            }
            if (r.nameInBooks && r.nameInBooks !== '—') {
                panToLedgerNamesMap.get(cleanPan)!.add(r.nameInBooks.trim());
            }
        }
    }

    for (const r of results) {
        const cleanPan = (r.partyPan || '').toUpperCase().trim();
        if (cleanPan && panToLedgerNamesMap.has(cleanPan)) {
            const distinctNames = panToLedgerNamesMap.get(cleanPan)!;
            if (distinctNames.size > 1) {
                r.isMultiLedgerPan = true;
                r.multiLedgerCount = distinctNames.size;
            }
        }
    }

    return results;
}

function createSheet(results: TdsReconciliationResult[], title: string, companyName: string) {
    const headers = [
        'Party Name (Books)',
        'Party Name (26Q)',
        'PAN (Books)',
        'PAN (26Q)',
        'Section',
        'Total Spend (Books)',
        'Taxable (Books)',
        'Taxable Calculation Basis',
        'TDS Rate (%)',
        'Req. TDS (Books)',
        'Actual TDS (Books)',
        'Taxable (26Q)',
        'TDS (26Q)',
        'Books TDS Variance (Req - Actual)',
        '26Q TDS Variance (Req - 26Q)',
        'Taxable Variance',
        'Status',
        'Closing Balance',
        'Expense Ledgers',
        'TDS Ledgers',
        'Applicability Reason'
    ];

    const data = results.map((r, i) => {
        const rowNum = 5 + i; // 1-based index in Excel, starts at row 5
        const booksVariance = r.booksRequiredTds - r.booksActualTds;
        const returnVariance = r.booksRequiredTds - r.tracesTds;
        return [
            r.nameInBooks && r.nameInBooks !== '—' ? r.nameInBooks : '—',
            r.nameIn26Q || '',
            r.panInBooks || '',
            r.panIn26Q || '',
            r.section || '',
            r.booksSpend || 0,
            r.booksTaxable || 0,
            r.taxableBasis || '',
            r.rateApplied || 0,
            { t: 'n', f: `ROUND(G${rowNum}*I${rowNum}/100, 0)`, v: r.booksRequiredTds },
            r.booksActualTds || 0,
            r.tracesTaxable || 0,
            r.tracesTds || 0,
            { t: 'n', f: `J${rowNum}-K${rowNum}`, v: booksVariance },
            { t: 'n', f: `J${rowNum}-M${rowNum}`, v: returnVariance },
            { t: 'n', f: `G${rowNum}-L${rowNum}`, v: r.taxableVariance },
            r.status || '',
            r.closingBalance || 0,
            r.ledgers || '',
            r.tdsLedgers || '',
            r.reason || ''
        ];
    });

    const startRow = 5;
    const endRow = 4 + results.length;
    const totals = [
        'GRAND TOTAL', '', '', '', '',
        results.length > 0 ? { t: 'n', f: `SUM(F${startRow}:F${endRow})`, v: results.reduce((sum, r) => sum + r.booksSpend, 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(G${startRow}:G${endRow})`, v: results.reduce((sum, r) => sum + r.booksTaxable, 0) } : 0,
        '', '', // Basis & Rate empty
        results.length > 0 ? { t: 'n', f: `SUM(J${startRow}:J${endRow})`, v: results.reduce((sum, r) => sum + r.booksRequiredTds, 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(K${startRow}:K${endRow})`, v: results.reduce((sum, r) => sum + r.booksActualTds, 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(L${startRow}:L${endRow})`, v: results.reduce((sum, r) => sum + r.tracesTaxable, 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(M${startRow}:M${endRow})`, v: results.reduce((sum, r) => sum + r.tracesTds, 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(N${startRow}:N${endRow})`, v: results.reduce((sum, r) => sum + (r.booksRequiredTds - r.booksActualTds), 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(O${startRow}:O${endRow})`, v: results.reduce((sum, r) => sum + (r.booksRequiredTds - r.tracesTds), 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(P${startRow}:P${endRow})`, v: results.reduce((sum, r) => sum + r.taxableVariance, 0) } : 0,
        '', // Status empty
        results.length > 0 ? { t: 'n', f: `SUM(R${startRow}:R${endRow})`, v: results.reduce((sum, r) => sum + (r.closingBalance || 0), 0) } : 0,
        '', '', ''
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
        { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 10 },
        { wch: 18 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 16 },
        { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 24 }, { wch: 24 },
        { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 25 }, { wch: 20 },
        { wch: 45 }
    ];

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:U10');

    for (let R = 0; R <= range.e.r; R++) {
        for (let C = 0; C <= range.e.c; C++) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' };

            const isNumCol = (C === 5 || C === 6 || C === 9 || C === 10 || C === 11 || C === 12 || C === 13 || C === 14 || C === 15 || C === 17);
            const isRateCol = C === 8;
            const isTotalRow = R === range.e.r;

            if (R === 0) {
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
                let fill = '1E293B'; // Identifiers (A-E)
                if (C >= 5 && C <= 9) fill = '1E3A8A';   // Books Liability (F-J)
                if (C >= 10 && C <= 11) fill = '065F46'; // 26Q Traces (K-L)
                if (C >= 12 && C <= 14) fill = '92400E'; // Variances (M-O)
                if (C === 15) fill = '4C1D95';           // Status (P)
                if (C >= 16) fill = '3730A3';            // Closing Bal & Ledgers (Q-T)

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
                    const resItem = results[R - 4];
                    const isMultiPan = resItem && resItem.isMultiLedgerPan;
                    const fgColor = isMultiPan ? 'FEF3C7' : (R % 2 === 0 ? 'F8FAFC' : 'FFFFFF');
                    const fontColor = isMultiPan ? '92400E' : '0F172A';

                    ws[cellAddress].s = {
                        font: { sz: 9, color: { rgb: fontColor }, bold: isMultiPan ? true : false },
                        fill: { fgColor: { rgb: fgColor } },
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

function createAdvanceSheet(results: AdvanceTdsResult[], title: string, companyName: string): XLSX.WorkSheet {
    const headers = [
        'Party Name',
        'Party PAN',
        'Section',
        'Status',
        'Expenses Credited (FY)',
        'Opening Balance (Cr)',
        'Payments Made (FY)',
        'Advance Amount (Pay - Exp - OpBal)',
        'TDS Rate (%)',
        'Req. TDS on Advance',
        'Actual Book TDS',
        'Advance TDS Shortfall',
        'Audit Remarks'
    ];

    const data = results.map((r, i) => {
        const rowNum = 5 + i; // Excel 1-based row index starting at row 5
        return [
            r.partyName || '',
            r.partyPan || '',
            r.section || '',
            r.status || '',
            r.currentYearExpenses || 0,
            r.openingBalanceCr || 0,
            r.currentYearPayments || 0,
            { t: 'n', f: `MAX(0, G${rowNum}-(E${rowNum}+F${rowNum}))`, v: r.advanceAmount },
            r.rateApplied || 0,
            { t: 'n', f: `ROUND(H${rowNum}*I${rowNum}/100, 0)`, v: r.requiredTdsOnAdvance },
            r.actualTdsDeducted || 0,
            { t: 'n', f: `MAX(0, J${rowNum}-K${rowNum})`, v: r.tdsShortfallOnAdvance },
            r.reason || ''
        ];
    });

    const startRow = 5;
    const endRow = 4 + results.length;
    const totals = [
        'GRAND TOTAL', '', '', '',
        results.length > 0 ? { t: 'n', f: `SUM(E${startRow}:E${endRow})`, v: results.reduce((sum, r) => sum + r.currentYearExpenses, 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(F${startRow}:F${endRow})`, v: results.reduce((sum, r) => sum + (r.openingBalanceCr || 0), 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(G${startRow}:G${endRow})`, v: results.reduce((sum, r) => sum + r.currentYearPayments, 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(H${startRow}:H${endRow})`, v: results.reduce((sum, r) => sum + r.advanceAmount, 0) } : 0,
        '', // Rate empty
        results.length > 0 ? { t: 'n', f: `SUM(J${startRow}:J${endRow})`, v: results.reduce((sum, r) => sum + r.requiredTdsOnAdvance, 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(K${startRow}:K${endRow})`, v: results.reduce((sum, r) => sum + r.actualTdsDeducted, 0) } : 0,
        results.length > 0 ? { t: 'n', f: `SUM(L${startRow}:L${endRow})`, v: results.reduce((sum, r) => sum + r.tdsShortfallOnAdvance, 0) } : 0,
        ''
    ];

    const aoa = [
        [`${title.toUpperCase()} - ${companyName.toUpperCase()}`],
        [`Generated on: ${new Date().toLocaleString('en-IN')} | Compliance Rule: Payment or Credit Whichever is Earlier`],
        [],
        headers,
        ...data,
        totals
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } }
    ];

    ws['!cols'] = [
        { wch: 32 }, // Col A: Party Name
        { wch: 16 }, // Col B: PAN
        { wch: 12 }, // Col C: Section
        { wch: 25 }, // Col D: Status
        { wch: 22 }, // Col E: Expenses
        { wch: 22 }, // Col F: Opening Balance Cr
        { wch: 22 }, // Col G: Payments
        { wch: 28 }, // Col H: Advance Amount
        { wch: 14 }, // Col I: Rate
        { wch: 20 }, // Col J: Req TDS
        { wch: 18 }, // Col K: Actual TDS
        { wch: 22 }, // Col L: Shortfall
        { wch: 60 }  // Col M: Remarks
    ];

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:M10');

    for (let R = 0; R <= range.e.r; R++) {
        for (let C = 0; C <= range.e.c; C++) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' };

            const isNumCol = (C >= 4 && C <= 11 && C !== 8);
            const isRateCol = C === 8;
            const isTotalRow = R === range.e.r;

            if (R === 0) {
                ws[cellAddress].s = {
                    font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } },
                    fill: { fgColor: { rgb: '4338CA' } }, // Indigo Header Banner
                    alignment: { horizontal: 'center', vertical: 'center' }
                };
            } else if (R === 1) {
                ws[cellAddress].s = {
                    font: { italic: true, sz: 10, color: { rgb: 'E0E7FF' } },
                    fill: { fgColor: { rgb: '312E81' } },
                    alignment: { horizontal: 'center', vertical: 'center' }
                };
            } else if (R === 3) {
                ws[cellAddress].s = {
                    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
                    fill: { fgColor: { rgb: '1E1B4B' } },
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
                        fill: { fgColor: { rgb: '312E81' } },
                        alignment: { horizontal: isNumCol && !isRateCol ? 'right' : 'left', vertical: 'center' },
                        border: {
                            top: { style: 'medium', color: { rgb: 'FFFFFF' } },
                            bottom: { style: 'double', color: { rgb: 'FFFFFF' } }
                        }
                    };
                } else {
                    ws[cellAddress].s = {
                        font: { sz: 9, color: { rgb: '0F172A' } },
                        fill: { fgColor: { rgb: R % 2 === 0 ? 'F8FAFC' : 'FFFFFF' } },
                        alignment: { horizontal: isNumCol && !isRateCol ? 'right' : (isRateCol || C === 2 ? 'center' : 'left'), vertical: 'center' },
                        border: { bottom: { style: 'hair', color: { rgb: 'E2E8F0' } } }
                    };

                    if (C === 3) {
                        const status = String(ws[cellAddress].v);
                        if (status === 'Un-deducted Advance TDS' || status === 'Short Deducted') {
                            ws[cellAddress].s.fill = { fgColor: { rgb: 'FEE2E2' } };
                            ws[cellAddress].s.font = { sz: 9, bold: true, color: { rgb: '991B1B' } };
                        } else if (status === 'Unmapped Advance Payment') {
                            ws[cellAddress].s.fill = { fgColor: { rgb: 'FEF3C7' } };
                            ws[cellAddress].s.font = { sz: 9, bold: true, color: { rgb: '92400E' } };
                        } else if (status === 'Sufficiently Covered') {
                            ws[cellAddress].s.fill = { fgColor: { rgb: 'D1FAE5' } };
                            ws[cellAddress].s.font = { sz: 9, bold: true, color: { rgb: '065F46' } };
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
 * EXPORT SERVICE: Generates a styled Excel workbook with sheets for Applicable, Not Applicable, PAN Required, and Advance TDS
 */
export function exportTdsReport(
    results: TdsReconciliationResult[], 
    companyName: string = 'Company',
    advanceResults?: AdvanceTdsResult[]
) {
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

    if (advanceResults && advanceResults.length > 0) {
        const wsAdv = createAdvanceSheet(advanceResults, 'Advance Payment TDS Audit (Payment > Expense)', companyName);
        XLSX.utils.book_append_sheet(wb, wsAdv, 'Advance TDS (Payment > Expense)');
    }

    XLSX.writeFile(wb, `TDS_Reconciliation_${new Date().getTime()}.xlsx`);
}

export interface MultiLedgerPanInfo {
    pan: string;
    partyNames: string[];
    totalSpend: number;
    totalActualTds: number;
    tracesTaxable: number;
    tracesTds: number;
    sections: string[];
    ledgers: { partyName: string; spend: number; actualTds: number; section: string }[];
}

export function computeMultiLedgerPans(
    reconResults: TdsReconciliationResult[]
): MultiLedgerPanInfo[] {
    const panMap = new Map<string, MultiLedgerPanInfo>();

    for (const r of reconResults) {
        const pan = (r.panInBooks && r.panInBooks !== 'PAN-MISSING') ? r.panInBooks : (r.partyPan || '');
        if (!pan || pan === 'PAN-MISSING' || pan === '—' || pan.length !== 10) continue;

        if (!panMap.has(pan)) {
            panMap.set(pan, {
                pan,
                partyNames: [],
                totalSpend: 0,
                totalActualTds: 0,
                tracesTaxable: r.tracesTaxable || 0,
                tracesTds: r.tracesTds || 0,
                sections: [],
                ledgers: []
            });
        }

        const info = panMap.get(pan)!;
        if (r.partyName && !info.partyNames.includes(r.partyName)) {
            info.partyNames.push(r.partyName);
        }
        if (r.section && !info.sections.includes(r.section)) {
            info.sections.push(r.section);
        }
        info.totalSpend += r.booksSpend || 0;
        info.totalActualTds += r.booksActualTds || 0;
        if (r.tracesTaxable && !info.tracesTaxable) info.tracesTaxable = r.tracesTaxable;
        if (r.tracesTds && !info.tracesTds) info.tracesTds = r.tracesTds;

        info.ledgers.push({
            partyName: r.partyName,
            spend: r.booksSpend || 0,
            actualTds: r.booksActualTds || 0,
            section: r.section || ''
        });
    }

    return Array.from(panMap.values()).filter(p => p.partyNames.length > 1);
}

export function exportMultiLedgerPanWorkbook(
    multiLedgerPans: MultiLedgerPanInfo[],
    companyName: string = 'Company'
) {
    if (!multiLedgerPans || multiLedgerPans.length === 0) {
        toast.info("No Multi-Ledger PANs available to export.");
        return;
    }

    try {
        const wb = XLSX.utils.book_new();

        // 1. Data Rows setup
        const rows: any[][] = [];

        // Title row
        rows.push([`MULTI-LEDGER PAN AUDIT REPORT — ${companyName.toUpperCase()}`]);
        rows.push([`Generated on ${new Date().toLocaleDateString('en-IN')} | Total Multi-Ledger PANs Flagged: ${multiLedgerPans.length}`]);
        rows.push([]); // blank line

        // Table headers
        rows.push([
            'PAN Number',
            'Tally Party Name (Books)',
            'Section',
            'Ledger Spend (₹)',
            'Ledger Actual TDS (₹)',
            'Total PAN Spend (₹)',
            'Total PAN TDS (₹)',
            '26Q Taxable (₹)',
            '26Q TDS (₹)',
            'Match Status'
        ]);

        for (const panItem of multiLedgerPans) {
            for (let i = 0; i < panItem.ledgers.length; i++) {
                const l = panItem.ledgers[i];
                const isFirst = i === 0;

                rows.push([
                    isFirst ? panItem.pan : '',
                    l.partyName,
                    l.section,
                    l.spend,
                    l.actualTds,
                    isFirst ? panItem.totalSpend : '',
                    isFirst ? panItem.totalActualTds : '',
                    isFirst ? panItem.tracesTaxable : '',
                    isFirst ? panItem.tracesTds : '',
                    isFirst ? (Math.abs(panItem.totalActualTds - panItem.tracesTds) <= 1 ? 'Matched' : 'TDS Variance') : ''
                ]);
            }
        }

        const ws = XLSX.utils.aoa_to_sheet(rows);

        // Column widths
        ws['!cols'] = [
            { wch: 16 }, // PAN
            { wch: 35 }, // Party Name
            { wch: 12 }, // Section
            { wch: 20 }, // Ledger Spend
            { wch: 20 }, // Ledger Actual TDS
            { wch: 22 }, // Total PAN Spend
            { wch: 20 }, // Total PAN TDS
            { wch: 20 }, // 26Q Taxable
            { wch: 20 }, // 26Q TDS
            { wch: 16 }  // Match Status
        ];

        // Styling
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:J10');
        for (let R = 0; R <= range.e.r; R++) {
            for (let C = 0; C <= range.e.c; C++) {
                const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' };

                const isNumCol = [3, 4, 5, 6, 7, 8].includes(C);

                if (R === 0) {
                    ws[cellAddress].s = {
                        font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } },
                        fill: { fgColor: { rgb: '4338CA' } },
                        alignment: { horizontal: 'center', vertical: 'center' }
                    };
                } else if (R === 1) {
                    ws[cellAddress].s = {
                        font: { italic: true, sz: 10, color: { rgb: 'E0E7FF' } },
                        fill: { fgColor: { rgb: '312E81' } },
                        alignment: { horizontal: 'center', vertical: 'center' }
                    };
                } else if (R === 3) {
                    ws[cellAddress].s = {
                        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
                        fill: { fgColor: { rgb: '1E1B4B' } },
                        alignment: { horizontal: 'center', vertical: 'center' },
                        border: {
                            top: { style: 'medium', color: { rgb: '0F172A' } },
                            bottom: { style: 'medium', color: { rgb: '0F172A' } }
                        }
                    };
                } else if (R > 3) {
                    if (isNumCol && (ws[cellAddress].v !== '' && ws[cellAddress].v !== null)) {
                        ws[cellAddress].t = 'n';
                        ws[cellAddress].z = '#,##0.00';
                    }

                    ws[cellAddress].s = {
                        font: { sz: 9, color: { rgb: '0F172A' } },
                        fill: { fgColor: { rgb: R % 2 === 0 ? 'F8FAFC' : 'FFFFFF' } },
                        alignment: { horizontal: isNumCol ? 'right' : (C === 0 || C === 2 || C === 9 ? 'center' : 'left'), vertical: 'center' },
                        border: { bottom: { style: 'hair', color: { rgb: 'E2E8F0' } } }
                    };

                    if (C === 9 && ws[cellAddress].v) {
                        const st = String(ws[cellAddress].v);
                        if (st === 'Matched') {
                            ws[cellAddress].s.fill = { fgColor: { rgb: 'D1FAE5' } };
                            ws[cellAddress].s.font = { sz: 9, bold: true, color: { rgb: '065F46' } };
                        } else if (st === 'TDS Variance') {
                            ws[cellAddress].s.fill = { fgColor: { rgb: 'FEF3C7' } };
                            ws[cellAddress].s.font = { sz: 9, bold: true, color: { rgb: '92400E' } };
                        }
                    }
                }
            }
        }

        XLSX.utils.book_append_sheet(wb, ws, 'Multi-Ledger PAN Audit');
        const filename = `Multi_Ledger_PAN_Audit_Report_${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_FY25-26.xlsx`;
        XLSX.writeFile(wb, filename);
        toast.success(`Exported ${multiLedgerPans.length} Multi-Ledger PANs to Excel!`);
    } catch (err: any) {
        console.error("Export Multi-Ledger PAN error:", err);
        toast.error("Failed to export Multi-Ledger PAN report", { description: err.message });
    }
}