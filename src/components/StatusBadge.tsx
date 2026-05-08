import type { MatchStatus } from '@/lib/reconciliation';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<MatchStatus, { bg: string; text: string; dot: string }> = {
  'Perfect Match': { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success' },
  'Matched (Diff Date)': { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success/70' },
  'Value Mismatch': { bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning' },
  'Invoice Missing': { bg: 'bg-destructive/10', text: 'text-destructive', dot: 'bg-destructive' },
  'Unmatched Vendor': { bg: 'bg-destructive/10', text: 'text-destructive', dot: 'bg-destructive' },
  'Matched': { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success' },
  'Matched (Rounded)': { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success/70' },
  'Mismatch': { bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning' },
  'Missing in 2B': { bg: 'bg-destructive/10', text: 'text-destructive', dot: 'bg-destructive' },
  'Missing in PR': { bg: 'bg-info/10', text: 'text-info', dot: 'bg-info' },
  'Possible Match': { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  'Name Matched (No GSTIN)': { bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning/70' },
  'Wrong GSTIN': { bg: 'bg-destructive/10', text: 'text-destructive', dot: 'bg-destructive' },
  'Name Mismatch': { bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning' },
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
