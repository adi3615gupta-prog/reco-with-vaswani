import type { MatchStatus } from '@/lib/reconciliation';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<MatchStatus, { bg: string; text: string; dot: string }> = {
  'Perfect Match': { bg: 'bg-emerald-50 dark:bg-emerald-950/50', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-600' },
  'Matched (Diff Date)': { bg: 'bg-emerald-50 dark:bg-emerald-950/50', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  'Value Mismatch': { bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-amber-800 dark:text-amber-300', dot: 'bg-amber-600' },
  'Timing Difference (Next Period)': { bg: 'bg-blue-50 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-600' },
  'Not in 2B': { bg: 'bg-rose-50 dark:bg-rose-950/50', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-600' },
  'Not in Books': { bg: 'bg-indigo-50 dark:bg-indigo-950/50', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-600' },
  'Unmatched Vendor': { bg: 'bg-rose-50 dark:bg-rose-950/50', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-600' },
  'Matched': { bg: 'bg-emerald-50 dark:bg-emerald-950/50', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-600' },
  'Matched (Rounded)': { bg: 'bg-emerald-50 dark:bg-emerald-950/50', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  'Mismatch': { bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-amber-800 dark:text-amber-300', dot: 'bg-amber-600' },
  'Missing in 2B': { bg: 'bg-rose-50 dark:bg-rose-950/50', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-600' },
  'Missing in PR': { bg: 'bg-indigo-50 dark:bg-indigo-950/50', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-600' },
  'Possible Match': { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300', dot: 'bg-slate-500' },
  'Name Matched (No GSTIN)': { bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-amber-800 dark:text-amber-300', dot: 'bg-amber-500' },
  'Wrong GSTIN': { bg: 'bg-rose-50 dark:bg-rose-950/50', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-600' },
  'Name Mismatch': { bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-amber-800 dark:text-amber-300', dot: 'bg-amber-600' },
  'Debit Note (Books)': { bg: 'bg-amber-50 border-amber-300 dark:bg-amber-950/50', text: 'text-amber-800 dark:text-amber-300', dot: 'bg-amber-600' },
  'Debit Note (Portal)': { bg: 'bg-amber-50 border-amber-300 dark:bg-amber-950/50', text: 'text-amber-800 dark:text-amber-300', dot: 'bg-amber-600' },
  'Tax Type Error': { bg: 'bg-orange-50 dark:bg-orange-950/50', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-600' },
  'Prior FY (Excluded)': { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300', dot: 'bg-slate-500' },
  'Reconciled (Exact Match)': { bg: 'bg-emerald-50 dark:bg-emerald-950/50', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-600' },
  'Reconciled (Rounding Diff)': { bg: 'bg-emerald-50 dark:bg-emerald-950/50', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  'Reconciled (Consolidated Batch)': { bg: 'bg-purple-50 border-purple-200 dark:bg-purple-950/50', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-600' },
  'Reconciled (Value Match - DN)': { bg: 'bg-emerald-50 dark:bg-emerald-950/50', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-600' },
  'Reconciled (Exempt / Zero Tax)': { bg: 'bg-cyan-50 dark:bg-cyan-950/50', text: 'text-cyan-700 dark:text-cyan-300', dot: 'bg-cyan-600' },
  'Matched - Value Missing in Books': { bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-amber-800 dark:text-amber-300', dot: 'bg-amber-600' },
  'Partially Matched (Value Diff)': { bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-amber-800 dark:text-amber-300', dot: 'bg-amber-600' },
  'In GSTR-2B Only (Not in Books)': { bg: 'bg-indigo-50 dark:bg-indigo-950/50', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-600' },
  'In Books Only (Not in GSTR-2B)': { bg: 'bg-rose-50 dark:bg-rose-950/50', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-600' },
  'In Books Only (Zero-Value Seed Entry)': { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300', dot: 'bg-slate-500' },
  'Reconciled (Exempt Seed Match)': { bg: 'bg-teal-50 dark:bg-teal-950/50', text: 'text-teal-700 dark:text-teal-300', dot: 'bg-teal-600' },
  'In 2B Credit Notes Only (Not in Books)': { bg: 'bg-indigo-50 dark:bg-indigo-950/50', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-600' },
  'In 2B Supplier Debit Notes (ITC Claimable)': { bg: 'bg-blue-50 border-blue-200 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-600' },
  'In Books Only - Taxable (Not in 2B)': { bg: 'bg-rose-50 dark:bg-rose-950/50', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-600' },
  'In Books Only - Nil-Rated Seed (Exempt)': { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300', dot: 'bg-slate-500' },
};

export function StatusBadge({ status }: { status: MatchStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['Mismatch'];
  const displayLabel = status === 'Unmatched Vendor' ? 'Party Not in 2B' : status;
  return (
    <span className={cn('badge-chip border border-current/20 shadow-2xs font-mono', cfg.bg, cfg.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
      <span className="truncate">{displayLabel}</span>
    </span>
  );
}

export function BatchBadge({ isLead, count, isSubRow }: { isLead?: boolean; count?: number; isSubRow?: boolean }) {
  if (isLead) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
        Batch Lead{count ? `: ${count} notes` : ''}
      </span>
    );
  }
  if (isSubRow) {
    return (
      <span className="inline-flex items-center gap-1 text-[9.5px] font-medium text-slate-500 italic">
        ↳ [Grouped Sub-Row]
      </span>
    );
  }
  return null;
}
