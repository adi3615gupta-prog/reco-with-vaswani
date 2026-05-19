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
};

export function StatusBadge({ status }: { status: MatchStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['Mismatch'];
  return (
    <span className={cn('status-pill', cfg.bg, cfg.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {status}
    </span>
  );
}
