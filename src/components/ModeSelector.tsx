import { Card } from '@/components/ui/card';
import { Inbox, Send, ArrowRight } from 'lucide-react';
import { TERMS, type ReconciliationMode } from '@/lib/mode';
import { cn } from '@/lib/utils';

interface Props {
  onSelect: (mode: ReconciliationMode) => void;
}

export function ModeSelector({ onSelect }: Props) {
  const modes: { mode: ReconciliationMode; icon: typeof Inbox; tint: string }[] = [
    { mode: 'input', icon: Inbox, tint: 'from-primary/15 to-info/10' },
    { mode: 'output', icon: Send, tint: 'from-success/15 to-primary/10' },
  ];
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-3">
        <h2 className="text-3xl font-bold tracking-tight">Choose Reconciliation Type</h2>
        <p className="text-muted-foreground">Select the workflow you want to begin with.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        {modes.map(({ mode, icon: Icon, tint }) => {
          const t = TERMS[mode];
          return (
            <button
              key={mode}
              onClick={() => onSelect(mode)}
              className="text-left group focus:outline-none"
            >
              <Card className={cn(
                'glass-card p-7 h-full border-2 hover:border-primary/40 transition-all duration-300',
                'hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10'
              )}>
                <div className={cn('w-14 h-14 rounded-2xl bg-gradient-to-br flex items-center justify-center ring-1 ring-border mb-5', tint)}>
                  <Icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-xl font-bold tracking-tight mb-1">{t.title}</h3>
                <p className="text-sm text-muted-foreground mb-4">{t.subtitle}</p>
                <p className="text-xs text-muted-foreground leading-relaxed mb-5">
                  {mode === 'input'
                    ? 'Match purchase invoices and journals against GSTR-2B to safeguard Input Tax Credit.'
                    : 'Match sales invoices against GSTR-1 to ensure tax liability is fully and correctly reported.'}
                </p>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:gap-2.5 transition-all">
                  Start {t.title} <ArrowRight className="w-4 h-4" />
                </span>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}
