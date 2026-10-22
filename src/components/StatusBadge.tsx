import type { MatchStatus } from '@/lib/reconciliation';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<MatchStatus, { bg: string; text: string; dot: string }> = {
  'Perfect Match': { bg: 'bg-[var(--np-green)]/10', text: 'text-[var(--np-green)]', dot: 'bg-[var(--np-green)]' },
  'Matched (Diff Date)': { bg: 'bg-[var(--np-green)]/10', text: 'text-[var(--np-green)]', dot: 'bg-[var(--np-green)]/70' },
  'Value Mismatch': { bg: 'bg-yellow-500/10', text: 'text-yellow-500', dot: 'bg-yellow-500' },
  'Invoice Missing': { bg: 'bg-[var(--np-red)]/10', text: 'text-[var(--np-red)]', dot: 'bg-[var(--np-red)]' },
  'Not in 2B': { bg: 'bg-[var(--np-red)]/10', text: 'text-[var(--np-red)]', dot: 'bg-[var(--np-red)]' },
  'Not in Books': { bg: 'bg-indigo-400/10', text: 'text-indigo-400', dot: 'bg-indigo-400' },
  'Unmatched Vendor': { bg: 'bg-[var(--np-red)]/10', text: 'text-[var(--np-red)]', dot: 'bg-[var(--np-red)]' },
  'Matched': { bg: 'bg-[var(--np-green)]/10', text: 'text-[var(--np-green)]', dot: 'bg-[var(--np-green)]' },
  'Matched (Rounded)': { bg: 'bg-[var(--np-green)]/10', text: 'text-[var(--np-green)]', dot: 'bg-[var(--np-green)]/70' },
  'Mismatch': { bg: 'bg-yellow-500/10', text: 'text-yellow-500', dot: 'bg-yellow-500' },
  'Missing in 2B': { bg: 'bg-[var(--np-red)]/10', text: 'text-[var(--np-red)]', dot: 'bg-[var(--np-red)]' },
  'Missing in PR': { bg: 'bg-indigo-400/10', text: 'text-indigo-400', dot: 'bg-indigo-400' },
  'Possible Match': { bg: 'bg-[var(--np-bg4)]', text: 'text-[var(--np-text2)]', dot: 'bg-[var(--np-text3)]' },
  'Name Matched (No GSTIN)': { bg: 'bg-yellow-500/10', text: 'text-yellow-500', dot: 'bg-yellow-500/70' },
  'Wrong GSTIN': { bg: 'bg-[var(--np-red)]/10', text: 'text-[var(--np-red)]', dot: 'bg-[var(--np-red)]' },
  'Name Mismatch': { bg: 'bg-yellow-500/10', text: 'text-yellow-500', dot: 'bg-yellow-500' },
  'Debit Note (Books)': { bg: 'bg-amber-500/15 border border-amber-500/30', text: 'text-amber-400', dot: 'bg-amber-400' },
  'Debit Note (Portal)': { bg: 'bg-amber-500/15 border border-amber-500/30', text: 'text-amber-400', dot: 'bg-amber-400' },
  'Tax Type Error': { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-400' },
  'Prior FY (Excluded)': { bg: 'bg-slate-500/10', text: 'text-slate-400', dot: 'bg-slate-400' },
  'Reconciled (Exact Match)': { bg: 'bg-[var(--np-green)]/10', text: 'text-[var(--np-green)]', dot: 'bg-[var(--np-green)]' },
  'Reconciled (Rounding Diff)': { bg: 'bg-[var(--np-green)]/10', text: 'text-[var(--np-green)]', dot: 'bg-[var(--np-green)]/70' },
  'Reconciled (Consolidated Batch)': { bg: 'bg-purple-500/15 border border-purple-500/30', text: 'text-purple-400', dot: 'bg-purple-400' },
  'Reconciled (Value Match - DN)': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  'Reconciled (Exempt / Zero Tax)': { bg: 'bg-cyan-500/10', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  'Matched - Value Missing in Books': { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
  'Partially Matched (Value Diff)': { bg: 'bg-yellow-500/10', text: 'text-yellow-500', dot: 'bg-yellow-500' },
  'In GSTR-2B Only (Not in Books)': { bg: 'bg-indigo-400/10', text: 'text-indigo-400', dot: 'bg-indigo-400' },
  'In Books Only (Not in GSTR-2B)': { bg: 'bg-[var(--np-red)]/10', text: 'text-[var(--np-red)]', dot: 'bg-[var(--np-red)]' },
  'In Books Only (Zero-Value Seed Entry)': { bg: 'bg-slate-500/10', text: 'text-slate-400', dot: 'bg-slate-400' },
  'Reconciled (Exempt Seed Match)': { bg: 'bg-teal-500/10', text: 'text-teal-400', dot: 'bg-teal-400' },
  'In 2B Credit Notes Only (Not in Books)': { bg: 'bg-indigo-400/10', text: 'text-indigo-400', dot: 'bg-indigo-400' },
  'In 2B Supplier Debit Notes (ITC Claimable)': { bg: 'bg-blue-500/15 border border-blue-500/30', text: 'text-blue-400', dot: 'bg-blue-400' },
  'In Books Only - Taxable (Not in 2B)': { bg: 'bg-[var(--np-red)]/10', text: 'text-[var(--np-red)]', dot: 'bg-[var(--np-red)]' },
  'In Books Only - Nil-Rated Seed (Exempt)': { bg: 'bg-slate-500/10', text: 'text-slate-400', dot: 'bg-slate-400' },
};

export function StatusBadge({ status }: { status: MatchStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['Mismatch'];
  const displayLabel = status === 'Unmatched Vendor' ? 'Party Not in 2B' : status;
  return (
    <span className={cn('badge-chip border border-current/20 shadow-xs font-mono', cfg.bg, cfg.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
      <span className="truncate">{displayLabel}</span>
    </span>
  );
}

export function BatchBadge({ isLead, count, isSubRow }: { isLead?: boolean; count?: number; isSubRow?: boolean }) {
  if (isLead) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        Batch Lead{count ? `: ${count} notes` : ''}
      </span>
    );
  }
  if (isSubRow) {
    return (
      <span className="inline-flex items-center gap-1 text-[8.5px] font-medium text-slate-400 italic">
        ↳ [Grouped Sub-Row]
      </span>
    );
  }
  return null;
}
