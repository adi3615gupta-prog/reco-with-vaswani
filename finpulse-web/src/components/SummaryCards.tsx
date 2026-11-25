import { useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  UserX,
  ShieldAlert,
  BarChart3,
  Sparkles,
  ArrowUpRight,
  IndianRupee,
  Scale,
} from 'lucide-react';
import type { ReconciliationResult, ReconciliationSummary } from '@/lib/reconciliation';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface SummaryCardsProps {
  summary: ReconciliationSummary;
  results?: ReconciliationResult[];
  onFilterSelect?: (key: string) => void;
  activeFilter?: string;
}

function formatINR(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return `${value < 0 ? '-' : ''}₹${formatted}`;
}

function getRecordTax(rec?: { igst?: number; cgst?: number; sgst?: number }): number {
  if (!rec) return 0;
  return (rec.igst || 0) + (rec.cgst || 0) + (rec.sgst || 0);
}

export function SummaryCards({ summary, results, onFilterSelect, activeFilter }: SummaryCardsProps) {
  const total = summary.total || 1;
  const matchRate = (summary.perfectMatch / total) * 100;

  const financials = useMemo(() => {
    if (!results || results.length === 0) return null;

    let booksTax = 0;
    let booksTaxable = 0;
    let twoBTax = 0;
    let twoBTaxable = 0;
    let eligibleTax = 0;
    let atRiskTax = 0;
    let unclaimedTwoBTax = 0;

    const bucketTax = {
      all: 0,
      perfect: 0,
      valueMismatch: 0,
      invoiceMissing: 0,
      unmatchedVendor: 0,
      missingPR: 0,
      taxTypeError: 0,
      wrongGstin: 0,
    };

    for (const r of results) {
      if (r.status === 'Prior FY (Excluded)') continue;
      const prTax = getRecordTax(r.prRecord);
      const tbTax = getRecordTax(r.twoBRecord);

      if (r.prRecord) {
        booksTax += prTax;
        booksTaxable += r.prRecord.taxableValue || 0;
      }
      if (r.twoBRecord) {
        twoBTax += tbTax;
        twoBTaxable += r.twoBRecord.taxableValue || 0;
      }

      const refTax = r.prRecord ? prTax : tbTax;
      bucketTax.all += refTax;

      if (r.status === 'Perfect Match' || r.status === 'Matched (Diff Date)' || r.status === 'Matched' || r.status === 'Matched (Rounded)') {
        const matchedAmt = r.twoBRecord ? tbTax : prTax;
        eligibleTax += matchedAmt;
        bucketTax.perfect += matchedAmt;
      } else if (r.status === 'Value Mismatch' || r.status === 'Mismatch') {
        const diff = Math.abs(r.gstDiff ?? (prTax - tbTax));
        atRiskTax += diff;
        bucketTax.valueMismatch += diff;
      } else if (r.status === 'Not in 2B' || r.status === 'Missing in 2B') {
        atRiskTax += prTax;
        bucketTax.invoiceMissing += prTax;
      } else if (r.status === 'Unmatched Vendor') {
        atRiskTax += prTax;
        bucketTax.unmatchedVendor += prTax;
      } else if (r.status === 'Not in Books' || r.status === 'Missing in PR') {
        unclaimedTwoBTax += tbTax;
        bucketTax.missingPR += tbTax;
      } else if (r.status === 'Tax Type Error') {
        atRiskTax += refTax;
        bucketTax.taxTypeError += refTax;
      }

      if (r.remark?.startsWith('Wrong GSTIN') || r.status === 'Wrong GSTIN') {
        bucketTax.wrongGstin += refTax;
      }
    }

    return {
      booksTax,
      booksTaxable,
      twoBTax,
      twoBTaxable,
      netVariance: booksTax - twoBTax,
      eligibleTax,
      atRiskTax,
      unclaimedTwoBTax,
      bucketTax,
    };
  }, [results]);

  const cards = [
    {
      key: 'all',
      label: 'Total Volume',
      hint: 'All reconciled entries',
      value: summary.total,
      taxAmount: financials?.bucketTax.all,
      icon: BarChart3,
      color: '#4F46E5',
      hoverBorder: 'hover:border-indigo-400',
    },
    {
      key: 'perfect',
      label: 'Perfect Match',
      hint: 'Verified & ITC eligible',
      value: summary.perfectMatch,
      taxAmount: financials?.bucketTax.perfect,
      icon: CheckCircle2,
      color: '#059669',
      hoverBorder: 'hover:border-emerald-400',
    },
    {
      key: 'valueMismatch',
      label: 'Value Mismatch',
      hint: 'Tax diff > tolerance',
      value: summary.valueMismatch,
      taxAmount: financials?.bucketTax.valueMismatch,
      icon: AlertTriangle,
      color: '#D97706',
      hoverBorder: 'hover:border-amber-400',
    },
    {
      key: 'invoiceMissing',
      label: 'Not in 2B / Govt',
      hint: 'Missing on GST Portal',
      value: summary.invoiceMissing,
      taxAmount: financials?.bucketTax.invoiceMissing,
      icon: XCircle,
      color: '#DC2626',
      hoverBorder: 'hover:border-rose-400',
    },
    {
      key: 'unmatchedVendor',
      label: 'Party Not in 2B',
      hint: 'Supplier did not file',
      value: summary.unmatchedVendor,
      taxAmount: financials?.bucketTax.unmatchedVendor,
      icon: UserX,
      color: '#E11D48',
      hoverBorder: 'hover:border-pink-400',
    },
    {
      key: 'missingPR',
      label: 'Not in Books',
      hint: 'In 2B, unbooked in PR',
      value: summary.missingInPR,
      taxAmount: financials?.bucketTax.missingPR,
      icon: FileText,
      color: '#7C3AED',
      hoverBorder: 'hover:border-purple-400',
    },
    {
      key: 'taxTypeError',
      label: 'Tax Type Error',
      hint: 'IGST vs CGST/SGST mix',
      value: summary.taxTypeError || 0,
      taxAmount: financials?.bucketTax.taxTypeError,
      icon: AlertTriangle,
      color: '#EA580C',
      hoverBorder: 'hover:border-orange-400',
    },
    {
      key: 'wrongGstin',
      label: 'Wrong GSTIN',
      hint: 'Same PAN, diff state',
      value: summary.wrongGstin || 0,
      taxAmount: financials?.bucketTax.wrongGstin,
      icon: ShieldAlert,
      color: '#BE123C',
      hoverBorder: 'hover:border-red-400',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Row 1: Executive Financial Position Strip (Books vs Portal vs Variance + Health) */}
      {financials ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Books ITC Claimed */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 font-mono">
                  Books Total ITC (PR + JV)
                </span>
                <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-slate-100 tracking-tight mt-1">
                  {formatINR(financials.booksTax)}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <IndianRupee className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span>Taxable Value: <strong className="font-mono text-slate-800 dark:text-slate-200">{formatINR(financials.booksTaxable)}</strong></span>
              <span className="text-[11px] font-medium text-slate-500">As per Accounting Books</span>
            </div>
          </div>

          {/* Portal GSTR-2B ITC Available */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-mono">
                  Portal Available ITC (GSTR-2B)
                </span>
                <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-slate-100 tracking-tight mt-1">
                  {formatINR(financials.twoBTax)}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800/80 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span>Verified Matched ITC: <strong className="font-mono text-emerald-700 dark:text-emerald-400">{formatINR(financials.eligibleTax)}</strong></span>
              <span className="text-[11px] font-medium text-slate-500">Sec 16(2)(aa) Eligible</span>
            </div>
          </div>

          {/* Net Gap, Risk Exposure & Match Health */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400 font-mono">
                  Net Tax Gap &amp; Match Health
                </span>
                <div className="flex items-baseline gap-2.5 mt-1 flex-wrap">
                  <span
                    className={cn(
                      'text-2xl sm:text-3xl font-black font-mono tracking-tight',
                      Math.abs(financials.netVariance) < 10
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : financials.netVariance > 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-amber-700 dark:text-amber-400'
                    )}
                  >
                    {formatINR(financials.netVariance)}
                  </span>
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800/60 px-2 py-0.5 rounded-full">
                    {matchRate.toFixed(1)}% Matched
                  </span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-800/80 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <Scale className="w-5 h-5" />
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden border border-slate-200/80 dark:border-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-indigo-600 transition-all duration-700 rounded-full"
                  style={{ width: `${Math.max(matchRate, 2)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-600 dark:text-slate-400">
                <span>
                  At-Risk ITC: <strong className="font-mono text-rose-600 dark:text-rose-400">{formatINR(financials.atRiskTax)}</strong>
                </span>
                <span>
                  Unbooked 2B: <strong className="font-mono text-purple-700 dark:text-purple-400">{formatINR(financials.unclaimedTwoBTax)}</strong>
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Fallback compact Health Bar when results array isn't supplied */
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800/80 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px] block">
                Reconciliation Health
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">
                {matchRate.toFixed(1)}% Matched
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300 font-medium">
            <span className="font-mono text-xs">
              {summary.perfectMatch.toLocaleString('en-IN')} of {summary.total.toLocaleString('en-IN')} matched
            </span>
            <div className="w-36 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden border border-slate-200/80 dark:border-slate-700">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-indigo-600 transition-all duration-700 rounded-full"
                style={{ width: `${Math.max(matchRate, 2)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Row 2: 4x2 Readable Clickable Status Breakdown Cards */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { staggerChildren: 0.025 } },
        }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
      >
        {cards.map((c) => {
          const pct = (c.value / total) * 100;
          const isSelected = activeFilter === c.key;
          const Icon = c.icon;

          return (
            <motion.button
              key={c.key}
              type="button"
              variants={{
                hidden: { opacity: 0, scale: 0.97, y: 6 },
                show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 350, damping: 26 } },
              }}
              whileHover={{ y: -2, transition: { duration: 0.15 } }}
              onClick={() => onFilterSelect && onFilterSelect(c.key)}
              className={cn(
                'text-left bg-white dark:bg-slate-900 border rounded-2xl shadow-xs group flex flex-col justify-between overflow-hidden p-3.5 transition-all cursor-pointer',
                c.hoverBorder,
                isSelected
                  ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/20 dark:bg-indigo-950/30'
                  : 'border-slate-200/80 dark:border-slate-800 hover:shadow-sm'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider truncate">
                      {c.label}
                    </span>
                    {onFilterSelect && (
                      <ArrowUpRight className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{c.hint}</p>
                </div>
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70"
                  style={{ color: c.color }}
                >
                  <Icon className="w-4 h-4" />
                </div>
              </div>

              <div className="mt-3 flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-mono font-black text-slate-900 dark:text-slate-100 tracking-tight">
                    {c.value.toLocaleString('en-IN')}
                  </span>
                  <span className="text-[11px] font-mono font-bold" style={{ color: c.color }}>
                    {pct.toFixed(1)}%
                  </span>
                </div>
                {c.taxAmount !== undefined && (
                  <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                    {formatINR(c.taxAmount)}
                  </span>
                )}
              </div>

              <div className="mt-2.5 h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-700 ease-out rounded-full"
                  style={{ width: `${Math.max(pct, c.value > 0 ? 3 : 0)}%`, backgroundColor: c.color }}
                />
              </div>
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
}

export default SummaryCards;
