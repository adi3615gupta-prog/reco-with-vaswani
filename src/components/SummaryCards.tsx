import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, FileText, UserX, ShieldAlert, BarChart3 } from 'lucide-react';
import type { ReconciliationSummary } from '@/lib/reconciliation';
import { cn } from '@/lib/utils';

interface SummaryCardsProps {
  summary: ReconciliationSummary;
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  const cards = [
    { label: 'Total Records', value: summary.total, icon: BarChart3, iconColor: 'text-primary', bgAccent: 'bg-primary/10', borderAccent: 'border-l-primary', glowColor: 'hover:shadow-primary/10' },
    { label: 'Perfect Match', value: summary.perfectMatch, icon: CheckCircle2, iconColor: 'text-success', bgAccent: 'bg-success/10', borderAccent: 'border-l-success', glowColor: 'hover:shadow-success/10' },
    { label: 'Value Mismatch', value: summary.valueMismatch, icon: AlertTriangle, iconColor: 'text-warning', bgAccent: 'bg-warning/10', borderAccent: 'border-l-warning', glowColor: 'hover:shadow-warning/10' },
    { label: 'Invoice Missing', value: summary.invoiceMissing, icon: XCircle, iconColor: 'text-destructive', bgAccent: 'bg-destructive/10', borderAccent: 'border-l-destructive', glowColor: 'hover:shadow-destructive/10' },
    { label: 'Unmatched Vendor', value: summary.unmatchedVendor, icon: UserX, iconColor: 'text-destructive', bgAccent: 'bg-destructive/10', borderAccent: 'border-l-destructive', glowColor: 'hover:shadow-destructive/10' },
    { label: 'Missing in PR', value: summary.missingInPR, icon: FileText, iconColor: 'text-info', bgAccent: 'bg-info/10', borderAccent: 'border-l-info', glowColor: 'hover:shadow-info/10' },
    { label: 'Name-Matched Vendors', value: summary.nameMatched, icon: HelpCircle, iconColor: 'text-warning', bgAccent: 'bg-warning/10', borderAccent: 'border-l-warning', glowColor: 'hover:shadow-warning/10' },
    { label: 'Wrong GSTIN', value: summary.wrongGstin, icon: ShieldAlert, iconColor: 'text-destructive', bgAccent: 'bg-destructive/10', borderAccent: 'border-l-destructive', glowColor: 'hover:shadow-destructive/10' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c, i) => (
        <Card
          key={c.label}
          className={cn(
            'border-l-4 overflow-hidden transition-all duration-500 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] hover:-translate-y-1.5 hover:scale-[1.03] cursor-default group animate-in fade-in zoom-in-95 fill-mode-both bg-card/60 backdrop-blur-xl border-y border-r border-white/10',
            c.borderAccent, c.glowColor
          )}
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110',
                c.bgAccent
              )}>
                <c.icon className={cn('w-5 h-5', c.iconColor)} />
              </div>
              <p className="text-2xl font-extrabold tabular-nums tracking-tight">{c.value}</p>
            </div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{c.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
