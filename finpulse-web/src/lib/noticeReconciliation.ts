import * as XLSX from 'xlsx';
import { removeAllMergesFromWorkbook } from './excel/styles/zeroMergeGuard';
import { checkNoticeLimitation } from '../../notices/limitation.js';
export { removeAllMergesFromWorkbook, checkNoticeLimitation };

export interface DiscrepancyExplanation {
    category: 'TIMING_DIFFERENCE' | 'SECTION_16_5_RELIEF' | 'RCM_OFFSET' | 'CREDIT_NOTE_ADJUSTMENT' | 'CLERICAL_ERROR' | 'UNEXPLAINED';
    amount: number;
    invoicesCount: number;
    statutoryGround: string;
    legalRemarks: string;
    requiresFilingDateVerification?: boolean;
    invoices: Array<{
        invoiceNo: string;
        invoiceDate: string;
        supplierGstin: string;
        supplierName: string;
        taxableValue: number;
        igst: number;
        cgst: number;
        sgst: number;
        totalTax: number;
        twoBPeriod?: string;
        threeBPeriod?: string;
        classification: string;
        statutoryGround?: string;
    }>;
}

export interface NoticeReconciliationResult {
    noticeId: string;
    referenceNo: string;
    gstin: string;
    financialYear: string;
    totalDemanded: number;
    explainedAmount: number;
    unexplainedResidual: number;
    explanations: DiscrepancyExplanation[];
    invoiceLedger: Array<any>;
}

// removeAllMergesFromWorkbook & checkNoticeLimitation re-exported from shared canonical helpers above.

/**
 * Reconciles notice discrepancies against taxpayer's multi-period return datasets
 */
export function reconcileNoticeDiscrepancy(
    input: {
        noticeId?: string;
        referenceNo?: string;
        gstin: string;
        financialYear: string;
        taxPeriod?: string;
        totalDemanded: number;
        allegedInvoices?: Array<{
            invoiceNo: string;
            invoiceDate: string;
            supplierGstin: string;
            supplierName?: string;
            taxableValue?: number;
            totalTax: number;
            gstr3bFilingDate?: string;
        }>;
    },
    localReturnsData: {
        twoBInvoices?: Array<any>;
        oneInvoices?: Array<any>;
        threeBReturns?: Array<any>;
    }
): NoticeReconciliationResult {
    const totalDemanded = Math.round(Number(input.totalDemanded) || 0);
    const allegedInvoices = input.allegedInvoices || [];
    const twoBInvoices = localReturnsData.twoBInvoices || [];

    const timingInvoices: any[] = [];
    const sec16Invoices: any[] = [];
    const rcmInvoices: any[] = [];
    const unexplainedInvoices: any[] = [];

    let timingAmount = 0;
    let sec16Amount = 0;
    let rcmAmount = 0;
    let sec16RequiresVerification = false;

    // Is the notice for a FY protected by retrospective Section 16(5)/(6)?
    const isRetrospectiveFy = ['2017-18', '2018-19', '2019-20', '2020-21'].includes(input.financialYear);

    for (const inv of allegedInvoices) {
        const invTax = Math.round(Number(inv.totalTax) || 0);
        const invNoClean = (inv.invoiceNo || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const suppGstin = (inv.supplierGstin || '').trim().toUpperCase();

        // 1. Search in subsequent periods of 2B for timing difference
        const match2B = twoBInvoices.find(t => {
            const tNoClean = (t.inum || t.invoiceNo || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            const tGstin = (t.ctin || t.supplierGstin || '').trim().toUpperCase();
            return tGstin === suppGstin && tNoClean === invNoClean;
        });

        if (match2B) {
            timingAmount += invTax;
            timingInvoices.push({
                invoiceNo: inv.invoiceNo,
                invoiceDate: inv.invoiceDate,
                supplierGstin: suppGstin,
                supplierName: inv.supplierName || match2B.supplier_name || 'Vendor',
                taxableValue: inv.taxableValue || match2B.txval || 0,
                igst: match2B.igst || 0,
                cgst: match2B.cgst || 0,
                sgst: match2B.sgst || 0,
                totalTax: invTax,
                twoBPeriod: match2B.return_period || 'Subsequent Period',
                threeBPeriod: input.taxPeriod || input.financialYear,
                classification: 'Supplier Late Filing (Timing Difference)',
                statutoryGround: 'Section 16(2) read with Rule 88D/88C'
            });
        } else if (isRetrospectiveFy) {
            // Check Section 16(5)/(6) relief against 30-Nov-2021 statutory cut-off
            const filingDate = inv.gstr3bFilingDate || (localReturnsData.threeBReturns?.find((r: any) => r.return_period === input.taxPeriod)?.filing_date);

            if (filingDate && filingDate > '2021-11-30') {
                // Reject Sec 16(5) if GSTR-3B was filed after 30-Nov-2021
                unexplainedInvoices.push({
                    invoiceNo: inv.invoiceNo,
                    invoiceDate: inv.invoiceDate,
                    supplierGstin: suppGstin,
                    supplierName: inv.supplierName || 'Vendor',
                    taxableValue: inv.taxableValue || 0,
                    igst: 0,
                    cgst: 0,
                    sgst: 0,
                    totalTax: invTax,
                    twoBPeriod: 'GSTR-3B filed after 30-Nov-2021',
                    threeBPeriod: input.taxPeriod || input.financialYear,
                    classification: 'Ineligible under Sec 16(5) — GSTR-3B filed after 30-Nov-2021',
                    statutoryGround: 'GSTR-3B filed after statutory cut-off of 30-Nov-2021 (Sec 16(5) condition not satisfied)'
                });
            } else {
                const isConditional = !filingDate;
                if (isConditional) sec16RequiresVerification = true;
                sec16Amount += invTax;
                sec16Invoices.push({
                    invoiceNo: inv.invoiceNo,
                    invoiceDate: inv.invoiceDate,
                    supplierGstin: suppGstin,
                    supplierName: inv.supplierName || 'Vendor',
                    taxableValue: inv.taxableValue || 0,
                    igst: 0,
                    cgst: 0,
                    sgst: 0,
                    totalTax: invTax,
                    twoBPeriod: isConditional ? 'Subject to 30-Nov-2021 filing verification' : 'Availed in GSTR-3B before 30-Nov-2021',
                    threeBPeriod: input.taxPeriod || input.financialYear,
                    classification: isConditional
                        ? 'Protected by Section 16(5) (subject to 30-Nov-2021 GSTR-3B filing verification)'
                        : 'Protected by Section 16(5) (Finance Act 2024)',
                    statutoryGround: 'Section 16(5) & Section 16(6) inserted retrospectively by Finance (No. 2) Act, 2024 & Circular 211/2024-GST'
                });
            }
        } else {
            unexplainedInvoices.push({
                invoiceNo: inv.invoiceNo,
                invoiceDate: inv.invoiceDate,
                supplierGstin: suppGstin,
                supplierName: inv.supplierName || 'Vendor',
                taxableValue: inv.taxableValue || 0,
                igst: 0,
                cgst: 0,
                sgst: 0,
                totalTax: invTax,
                twoBPeriod: 'Not in 2B',
                threeBPeriod: input.taxPeriod || input.financialYear,
                classification: 'Unexplained / Vendor Non-filing',
                statutoryGround: 'Subject to Reconciliation / DRC-03 Partial Discharge'
            });
        }
    }

    // If no individual invoices were parsed but total demand exists:
    // Only retrospective FY gets Sec 16(5); NEVER fabricate 70% timing differences without invoice evidence!
    if (allegedInvoices.length === 0 && totalDemanded > 0) {
        if (isRetrospectiveFy) {
            sec16Amount = totalDemanded;
            sec16RequiresVerification = true;
        }
    }

    const explainedAmount = Math.min(timingAmount + sec16Amount + rcmAmount, totalDemanded);
    const unexplainedResidual = Math.max(0, totalDemanded - explainedAmount);

    const explanations: DiscrepancyExplanation[] = [];

    if (timingAmount > 0) {
        explanations.push({
            category: 'TIMING_DIFFERENCE',
            amount: timingAmount,
            invoicesCount: timingInvoices.length,
            statutoryGround: 'Section 16(2) read with Rule 88D/88C',
            legalRemarks: 'Input tax credit was claimed legitimately upon receipt of tax invoice and goods; the supplier reported the invoice in their GSTR-1 in a subsequent filing period.',
            invoices: timingInvoices
        });
    }

    if (sec16Amount > 0) {
        explanations.push({
            category: 'SECTION_16_5_RELIEF',
            amount: sec16Amount,
            invoicesCount: sec16Invoices.length,
            statutoryGround: 'Section 16(5) & Section 16(6) inserted retrospectively by Finance (No. 2) Act, 2024 & Circular 211/2024-GST',
            legalRemarks: sec16RequiresVerification
                ? 'In respect of invoices for FY 2017-18 to 2020-21, ITC availment time limit is extended retrospectively to 30th November 2021 (subject to 30-Nov-2021 GSTR-3B filing verification).'
                : 'In respect of invoices for FY 2017-18 to 2020-21, the time limit for availment of ITC has been extended retrospectively to 30th November 2021. The disputed credit falls within this statutory window.',
            requiresFilingDateVerification: sec16RequiresVerification,
            invoices: sec16Invoices
        });
    }

    if (unexplainedResidual > 0) {
        explanations.push({
            category: 'UNEXPLAINED',
            amount: unexplainedResidual,
            invoicesCount: unexplainedInvoices.length,
            statutoryGround: 'Subject to Reconciliation / DRC-03 Partial Discharge',
            legalRemarks: allegedInvoices.length === 0
                ? 'Notice demand cited without invoice-level breakdown. Full amount flagged as unexplained pending itemized verification.'
                : 'Discrepancy attributable to supplier non-filing or pending voucher clarification.',
            invoices: unexplainedInvoices
        });
    }

    return {
        noticeId: input.noticeId || '',
        referenceNo: input.referenceNo || 'UNKNOWN-REF',
        gstin: input.gstin,
        financialYear: input.financialYear,
        totalDemanded,
        explainedAmount,
        unexplainedResidual,
        explanations,
        invoiceLedger: [...timingInvoices, ...sec16Invoices, ...unexplainedInvoices]
    };
}

/**
 * Generates an analytical Excel reconciliation annexure with STRICT ZERO-MERGES.
 */
export function generateNoticeAnnexureExcel(
    reco: NoticeReconciliationResult,
    meta: { companyName?: string; officerName?: string } = {}
): any {
    const wb = XLSX.utils.book_new();
    const rows: any[][] = [];

    // Row 1: Corporate Header (Col A plain text, strictly NO merge)
    rows.push([`${meta.companyName || 'TAXPAYER'} — GST NOTICE RECONCILIATION ANNEXURE`]);
    // Row 2: Notice Reference & DIN (Col A plain text, strictly NO merge)
    rows.push([`Notice Ref: ${reco.referenceNo} | GSTIN: ${reco.gstin} | FY: ${reco.financialYear}`]);
    rows.push([]);

    // Summary KPI Block
    rows.push(['SUMMARY OF RECONCILIATION AND STATUTORY DEFENSE']);
    rows.push(['Parameter', 'Amount (₹)', 'Statutory Defense Basis']);
    rows.push(['Total Demanded Amount', reco.totalDemanded, 'As per Notice / SCN']);
    rows.push(['Total Verified & Explained', reco.explainedAmount, 'Mathematical proof established']);
    rows.push(['Unexplained / Residual Variance', reco.unexplainedResidual, 'Under verification / DRC-03']);
    rows.push([]);

    // Detailed Invoice Ledger
    rows.push(['DETAILED INVOICE-WISE RECONCILIATION LEDGER']);
    rows.push([
        'S.No', 'Supplier GSTIN', 'Supplier Name', 'Invoice No', 'Invoice Date',
        'Taxable Value (₹)', 'IGST (₹)', 'CGST (₹)', 'SGST (₹)', 'Total Tax (₹)',
        '2B Period', '3B Period', 'Discrepancy Classification', 'Statutory Ground'
    ]);

    let sNo = 1;
    for (const inv of reco.invoiceLedger) {
        rows.push([
            sNo++,
            inv.supplierGstin || '',
            inv.supplierName || '',
            inv.invoiceNo || '',
            inv.invoiceDate || '',
            inv.taxableValue || 0,
            inv.igst || 0,
            inv.cgst || 0,
            inv.sgst || 0,
            inv.totalTax || 0,
            inv.twoBPeriod || '',
            inv.threeBPeriod || '',
            inv.classification || '',
            inv.statutoryGround || ''
        ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Enforce Zero-Merge on worksheet
    ws['!merges'] = [];

    XLSX.utils.book_append_sheet(wb, ws, 'Notice_Annexure');

    // Double-check with workbook helper
    removeAllMergesFromWorkbook(wb);

    return wb;
}

// ─── DOMAIN WORKING PAPER CALCULATORS (946-EXCEL CORPUS SCHEMAS) ─────────────

export interface Rule88BPeriodRow {
    period: string;
    dueDate: string;
    filingDate: string;
    challanDate?: string; // PMT-06 advance deposit date
    grossTaxPayable: number;
    itcOffset: number;
    cashTaxPaid: number;
    wronglyAvailedItc?: number;
    minEcrlBalanceMaintained?: number; // Section 50(3) unutilized credit shield
    utilizedItcAmount?: number;
    ratePct?: number; // default 18
}

/**
 * Param 0080 / Rule 88B & Section 50(3) Interest Shield Calculator.
 * Applies 18% ONLY on net cash debited (proviso to Sec 50(1)), credits PMT-06 challan deposit dates,
 * and limits Sec 50(3) interest solely to utilized ITC exceeding minimum ECrL balance.
 */
export function computeRule88BInterest(rows: Rule88BPeriodRow[]) {
    const parseIso = (s?: string) => {
        if (!s) return null;
        if (s.includes('/')) {
            const p = s.split('/');
            return p.length === 3 ? new Date(`${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}T00:00:00Z`) : null;
        }
        return new Date(`${s.split('T')[0]}T00:00:00Z`);
    };

    const details = rows.map((r) => {
        const due = parseIso(r.dueDate);
        const effPay = parseIso(r.challanDate || r.filingDate) || parseIso(r.filingDate);
        const delayDays = due && effPay ? Math.max(0, Math.round((effPay.getTime() - due.getTime()) / 86400000)) : 0;
        const rate = (r.ratePct ?? 18) / 100;

        // Departmental over-claim typically applies 18% on gross tax or total availed ITC
        const grossBase = (r.grossTaxPayable || 0) + (r.wronglyAvailedItc || 0);
        const deptInterestClaimed = Math.round(grossBase * rate * (delayDays / 365));

        // Lawful Cash-Only Tax + Sec 50(3) only on actually utilized slice of wrongly availed ITC
        const unutilizedShield = r.wronglyAvailedItc && r.minEcrlBalanceMaintained != null
            ? Math.max(0, Math.min(r.wronglyAvailedItc, r.minEcrlBalanceMaintained))
            : 0;
        const sec50_3Taxable = r.utilizedItcAmount != null
            ? r.utilizedItcAmount
            : Math.max(0, (r.wronglyAvailedItc || 0) - unutilizedShield);

        const lawfulCashInterest = Math.round((r.cashTaxPaid || 0) * rate * (delayDays / 365));
        const lawfulItcInterest = Math.round(sec50_3Taxable * rate * (delayDays / 365));
        const lawfulTotalInterest = lawfulCashInterest + lawfulItcInterest;

        return {
            period: r.period,
            delayDays,
            deptInterestClaimed,
            lawfulCashInterest,
            lawfulItcInterest,
            lawfulTotalInterest,
            interestSaving: Math.max(0, deptInterestClaimed - lawfulTotalInterest),
            sec50_3ProtectedCredit: unutilizedShield
        };
    });

    return {
        details,
        totalDeptClaimed: details.reduce((s, d) => s + d.deptInterestClaimed, 0),
        totalLawfulInterest: details.reduce((s, d) => s + d.lawfulTotalInterest, 0),
        totalSaving: details.reduce((s, d) => s + d.interestSaving, 0)
    };
}

/**
 * Param 0073 4-Subhead Breakdown + Prior/Next FY Spillover + Circular 183/15/2022 Vendor Bucketing.
 */
export function computeParam0073FourSubheadReco(input: {
    table4A1_3B: number; icegateBoe: number;
    table4A2_3_3B: number; rcm3_1dPaid: number;
    table4A4_3B: number; isd6A: number;
    table4A5_3B: number; b2b2B: number;
    priorFyInCurr3B?: number; currFyInNext3B?: number;
    unreconciledVendors?: Array<{ gstin: string; name?: string; taxDiff: number }>;
}) {
    const importsDiff = (input.table4A1_3B || 0) - (input.icegateBoe || 0);
    const rcmDiff = (input.table4A2_3_3B || 0) - (input.rcm3_1dPaid || 0);
    const isdDiff = (input.table4A4_3B || 0) - (input.isd6A || 0);
    const net3B4A5 = (input.table4A5_3B || 0) - (input.priorFyInCurr3B || 0) + (input.currFyInNext3B || 0);
    const b2bDiff = net3B4A5 - (input.b2b2B || 0);

    const vendors = input.unreconciledVendors || [];
    const caCertVendors = vendors.filter((v) => Math.abs(v.taxDiff) > 500000);
    const supplierDeclVendors = vendors.filter((v) => Math.abs(v.taxDiff) <= 500000);

    return {
        subheads: { importsDiff, rcmDiff, isdDiff, b2bDiff },
        netUnexplainedItcDiff: importsDiff + rcmDiff + isdDiff + b2bDiff,
        circular183: {
            caUdinCertRequired: caCertVendors, // > ₹5 Lakh tax diff per supplier
            supplierSelfDeclRequired: supplierDeclVendors // <= ₹5 Lakh tax diff per supplier
        }
    };
}

/**
 * Param 0074 NGTP / RC-Cancelled Date Validity Test.
 */
export function checkParam0074DateValidity(
    invoices: Array<{ invoiceNo: string; invoiceDate: string; supplierGstin: string; supplierRcCancelledDate?: string; taxAmount: number; hasEwb?: boolean; hasLr?: boolean; hasBankPay?: boolean }>
) {
    const toMs = (s?: string) => {
        if (!s) return NaN;
        if (s.includes('/')) {
            const p = s.split('/');
            return p.length === 3 ? Date.parse(`${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`) : NaN;
        }
        return Date.parse(s);
    };

    const bonaFidePriorToCancellation: typeof invoices = [];
    const postCancellationExposure: typeof invoices = [];

    for (const inv of invoices) {
        const invMs = toMs(inv.invoiceDate);
        const cancMs = toMs(inv.supplierRcCancelledDate);
        if (!Number.isNaN(invMs) && !Number.isNaN(cancMs) && invMs > cancMs) {
            postCancellationExposure.push(inv);
        } else {
            bonaFidePriorToCancellation.push(inv);
        }
    }

    return {
        bonaFidePriorToCancellation,
        postCancellationExposure,
        bonaFideTaxProtected: bonaFidePriorToCancellation.reduce((s, i) => s + (i.taxAmount || 0), 0),
        postCancellationTaxAtRisk: postCancellationExposure.reduce((s, i) => s + (i.taxAmount || 0), 0),
        precedent: 'M/s Solvi Enterprises v. Addl. Commr. [2025:AHC:42270] & CBIC Circular 183/15/2022'
    };
}

/**
 * Param 0219 vs Param 0070/0073 Double-Count Guard (GSTR-9C Table 9S / 12F).
 */
export function detectParam0219DoubleCount(issues: Array<{ paramCode: string; taxDemanded: number }>) {
    const has0070 = issues.some((i) => i.paramCode === '0070' && i.taxDemanded > 0);
    const has0073 = issues.some((i) => i.paramCode === '0073' && i.taxDemanded > 0);
    const p219 = issues.find((i) => i.paramCode === '0219' && i.taxDemanded > 0);
    const warnings: string[] = [];
    if (p219 && has0070) warnings.push('Param 0219 (GSTR-9C Table 9S) likely double-counts Outward Tax demand already included under Param 0070.');
    if (p219 && has0073) warnings.push('Param 0219 (GSTR-9C Table 12F) likely double-counts Excess ITC demand already included under Param 0073.');
    return { hasDoubleCountRisk: warnings.length > 0, warnings };
}

/**
 * Section 16(5) Retrospective Eligibility (30.11.2021) + Section 128A (SPL-02) Trap Validator.
 */
export function evaluateSec16And128A(input: {
    financialYear: string;
    section: string;
    gstr3bFilingDate?: string;
    lateFeePaid?: boolean;
    paramCodes?: string[];
    confirmed16_4Demand?: number;
}) {
    const fy = (input.financialYear || '').trim();
    const eligibleFys16_5 = ['2017-18', '2018-19', '2019-20', '2020-21'];
    const parseDateMs = (d?: string): number => {
        if (!d) return NaN;
        const s = d.trim();
        if (s.includes('/')) {
            const p = s.split('/');
            return p.length === 3 ? Date.parse(`${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}T00:00:00Z`) : NaN;
        }
        return Date.parse(`${s.split('T')[0]}T00:00:00Z`);
    };
    const filingMs = parseDateMs(input.gstr3bFilingDate);
    const filedUpToCutoff = !Number.isNaN(filingMs) && filingMs <= Date.parse('2021-11-30T23:59:59Z');
    const sec16_5Eligible = eligibleFys16_5.includes(fy) && filedUpToCutoff;

    const splEligibleFys = ['2017-18', '2018-19', '2019-20'];
    const isSec73 = !String(input.section || '').includes('74');
    const splTraps: string[] = [];
    if (input.lateFeePaid === false) {
        splTraps.push('SPL-03 Rejection Trap: Unpaid GSTR-3B/GSTR-9 Late Fee must be discharged before SPL-02 approval.');
    }
    if ((input.paramCodes || []).some((p) => p === '0070' || p === '0080')) {
        splTraps.push('Sec 75(12) Exclusion Trap: Self-assessed Para 0070/0080 interest outside Sec 73 triggers SPL-03 partial/full rejection.');
    }

    return {
        sec16_5Eligible,
        notif22_2024Eligible: sec16_5Eligible && (input.confirmed16_4Demand || 0) > 0,
        spl128AEligible: splEligibleFys.includes(fy) && isSec73,
        splTraps
    };
}

export interface HeadAmounts { igst: number; cgst: number; sgst: number; cess?: number }

/**
 * Head-Wise Pre-Deposit Calculator (10% APL-01, 12.5% Notif 53, 20% APL-05, 25% Sec 129) + RFD-01 ASSORD Refund Delta.
 */
export function computePreDepositAndAssordRefund(
    demandTax: HeadAmounts,
    alreadyPaidOrRecovered: HeadAmounts,
    track: 'APL_01' | 'NOTIF_53' | 'APL_05' | 'SEC_129',
    admittedTax: HeadAmounts = { igst: 0, cgst: 0, sgst: 0 }
) {
    const pct = track === 'SEC_129' ? 0.25 : track === 'APL_05' ? 0.20 : track === 'NOTIF_53' ? 0.125 : 0.10;
    const heads = ['igst', 'cgst', 'sgst'] as const;
    const required: HeadAmounts = { igst: 0, cgst: 0, sgst: 0 };
    const netPayable: HeadAmounts = { igst: 0, cgst: 0, sgst: 0 };
    const refundableAssord: HeadAmounts = { igst: 0, cgst: 0, sgst: 0 };

    for (const h of heads) {
        const cap = h === 'igst' ? 500000000 : 250000000;
        const disputed = Math.max(0, (demandTax[h] || 0) - (admittedTax[h] || 0));
        const pre = Math.min(cap, Math.round(disputed * pct));
        const totalReq = (admittedTax[h] || 0) + pre;
        const paid = alreadyPaidOrRecovered[h] || 0;
        required[h] = totalReq;
        netPayable[h] = Math.max(0, totalReq - paid);
        refundableAssord[h] = Math.max(0, paid - totalReq);
    }

    const totalRequired = required.igst + required.cgst + required.sgst;
    return {
        track,
        preDepositPct: pct * 100,
        notif53MinCash2_5Pct: track === 'NOTIF_53' ? Math.round(((demandTax.igst + demandTax.cgst + demandTax.sgst) - (admittedTax.igst + admittedTax.cgst + admittedTax.sgst)) * 0.025) : 0,
        required,
        netPayable,
        refundableAssord,
        totalRequired,
        totalRefundableAssord: refundableAssord.igst + refundableAssord.cgst + refundableAssord.sgst
    };
}

/**
 * Rule 37 (180-Day Ageing), Rule 42 (D1/D2 Common Credit) & Rule 89(4)/(5) Refund Calculators.
 */
export function computeRule37And42AndRefund89(input: {
    unpaidInvoicesOver180DaysTax?: number;
    commonItcC2?: number; exemptTurnoverE?: number; totalTurnoverF?: number;
    exportZeroRatedTurnover?: number; adjTotalTurnover?: number; netItcExports?: number;
    invertedTurnover?: number; netItcInputsOnly?: number; totalItcInputsAndServices?: number; taxPayableOnInverted?: number;
}) {
    const rule37Reversal = Math.round(input.unpaidInvoicesOver180DaysTax || 0);
    const totalF = input.totalTurnoverF || 0;
    const rule42D1 = totalF > 0 ? Math.round((input.commonItcC2 || 0) * ((input.exemptTurnoverE || 0) / totalF)) : 0;
    const rule42D2 = Math.round((input.commonItcC2 || 0) * 0.05);

    const adjTo = input.adjTotalTurnover || 0;
    const exportRefund89_4 = adjTo > 0 ? Math.round(((input.exportZeroRatedTurnover || 0) * (input.netItcExports || 0)) / adjTo) : 0;

    const totalItcAll = (input.totalItcInputsAndServices || 0) > 0 ? input.totalItcInputsAndServices! : (input.netItcInputsOnly || 1);
    const invertedMax89_5 = adjTo > 0
        ? Math.max(0, Math.round((((input.invertedTurnover || 0) * (input.netItcInputsOnly || 0)) / adjTo) - ((input.taxPayableOnInverted || 0) * ((input.netItcInputsOnly || 0) / totalItcAll))))
        : 0;

    return { rule37Reversal, rule42D1, rule42D2, rule42Total: rule42D1 + rule42D2, exportRefund89_4, invertedMax89_5 };
}

/**
 * Exports a 7-Tab Strict Zero-Merge Defense Workbook (ws['!merges'] = [] on all tabs).
 */
export function generateDefenseWorkbook(bundle: {
    clientName: string;
    gstin: string;
    financialYear: string;
    caseRef: string;
    reco?: NoticeReconciliationResult;
    issues?: Array<{ paramCode: string; issueTitle: string; taxDemanded: number; interestDemanded: number; penaltyDemanded: number; strategy: string }>;
    rule88B?: ReturnType<typeof computeRule88BInterest>;
    payments?: Array<{ form: string; refNo: string; date: string; via: string; tax: number; interest: number; penalty: number; drc03a: boolean }>;
    sec16And128A?: ReturnType<typeof evaluateSec16And128A>;
    rule37_42_89?: ReturnType<typeof computeRule37And42AndRefund89>;
    checklist?: Array<{ item: string; status: string; remarks: string }>;
}) {
    const wb = XLSX.utils.book_new();
    const addTab = (name: string, rows: any[][]) => {
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!merges'] = [];
        XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    };

    const issues = bundle.issues || [];
    addTab('Case_Summary', [
        [`${bundle.clientName} — GST DEFENSE & WORKING PAPER WORKBOOK`],
        [`GSTIN: ${bundle.gstin} | FY: ${bundle.financialYear} | Case/Ref: ${bundle.caseRef}`],
        [],
        ['Parameter Count', issues.length],
        ['Total Tax Demanded (₹)', issues.reduce((s, i) => s + i.taxDemanded, 0)],
        ['Total Interest Demanded (₹)', issues.reduce((s, i) => s + i.interestDemanded, 0)],
        ['Rule 88B Interest Saving (₹)', bundle.rule88B?.totalSaving || 0]
    ]);

    addTab('Param_Breakdown', [
        ['Param Code', 'Issue Title', 'Tax (₹)', 'Interest (₹)', 'Penalty (₹)', 'Defense Strategy'],
        ...issues.map((i) => [i.paramCode, i.issueTitle, i.taxDemanded, i.interestDemanded, i.penaltyDemanded, i.strategy])
    ]);

    const ledger = bundle.reco?.invoiceLedger || [];
    addTab('8Col_2A_2B_3B', [
        ['S.No', 'Supplier GSTIN', 'Supplier Name', 'Invoice No', 'Invoice Date', 'Total Tax (₹)', 'Classification', 'Statutory Ground'],
        ...ledger.map((inv: any, idx: number) => [idx + 1, inv.supplierGstin || '', inv.supplierName || '', inv.invoiceNo || '', inv.invoiceDate || '', inv.totalTax || 0, inv.classification || '', inv.statutoryGround || ''])
    ]);

    addTab('Rule_88B_Interest', [
        ['Period', 'Delay Days', 'Dept Claimed (₹)', 'Lawful Cash Int (₹)', 'Lawful ITC Int (₹)', 'Total Lawful (₹)', 'Saving (₹)'],
        ...(bundle.rule88B?.details || []).map((d) => [d.period, d.delayDays, d.deptInterestClaimed, d.lawfulCashInterest, d.lawfulItcInterest, d.lawfulTotalInterest, d.interestSaving])
    ]);

    addTab('DRC03_PreDeposit', [
        ['Form', 'ARN / Ref No', 'Date', 'Mode (Cash/ITC)', 'Tax (₹)', 'Interest (₹)', 'Penalty (₹)', 'DRC-03A Linked'],
        ...(bundle.payments || []).map((p) => [p.form, p.refNo, p.date, p.via, p.tax, p.interest, p.penalty, p.drc03a ? 'YES' : 'NO'])
    ]);

    addTab('Sec16_Rule37_42_RFD', [
        ['Statutory Parameter', 'Value / Amount (₹)', 'Remarks'],
        ['Sec 16(5) Retrospective Eligible (<= 30.11.2021)', bundle.sec16And128A?.sec16_5Eligible ? 'YES' : 'NO', 'FY 2017-18 to 2020-21'],
        ['Notif 22/2024 Sec 148 Rectification Eligible', bundle.sec16And128A?.notif22_2024Eligible ? 'YES' : 'NO', 'Use Annexure-A Proforma'],
        ['Sec 128A SPL-01/02 Amnesty Eligible', bundle.sec16And128A?.spl128AEligible ? 'YES' : 'NO', (bundle.sec16And128A?.splTraps || []).join(' | ') || 'No traps detected'],
        ['Rule 37 Reversal (>180d Unpaid)', bundle.rule37_42_89?.rule37Reversal || 0, 'Reclaim allowed post vendor payment'],
        ['Rule 42 D1/D2 Total Reversal', bundle.rule37_42_89?.rule42Total || 0, 'Exempt vs Total Turnover ratio'],
        ['Rule 89(4) Export WOP Max Refund', bundle.rule37_42_89?.exportRefund89_4 || 0, 'LUT Shipping Bill + BRC matched'],
        ['Rule 89(5) Inverted Duty Max Refund', bundle.rule37_42_89?.invertedMax89_5 || 0, 'Net ITC Inputs only']
    ]);

    addTab('Filing_Checklist', [
        ['Document / Annex', 'Status', 'Remarks'],
        ...(bundle.checklist || [
            { item: 'Written Submission / Reply (DRC-06 / ASMT-11 / APL-01)', status: 'READY', remarks: 'Signed PDF' },
            { item: 'Authority Letter / FORM GST PCT-05 / Vakalatnama', status: 'READY', remarks: 'Signed by Director/Partner' },
            { item: 'Circular 183/15/2022 Certificate (<=5L Supplier / >5L CA UDIN)', status: 'CHECK', remarks: 'Attach sample invoices + EWB + Bank proof' },
            { item: 'DRC-03 / DRC-03A Payment Proof & ECrL Extract', status: 'CHECK', remarks: 'Verify Cash vs ITC offset' }
        ]).map((c) => [c.item, c.status, c.remarks])
    ]);

    removeAllMergesFromWorkbook(wb);
    return wb;
}
