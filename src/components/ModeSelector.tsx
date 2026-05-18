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
        <h2 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary via-primary/80 to-primary/50 animate-pulse [animation-duration:4s]">Choose Reconciliation Type</h2>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">Select the workflow you want to begin with to seamlessly sync your records.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        {modes.map(({ mode, icon: Icon, tint }, i) => {
          const t = TERMS[mode];
          return (
            <button
              key={mode}
              onClick={() => onSelect(mode)}
              className={cn("text-left group focus:outline-none animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-both")}
              style={{ animationDelay: `${i * 150}ms` }}
            >
              <Card className={cn(
                'glass-card relative overflow-hidden p-8 h-full border-2 hover:border-primary/50 transition-all duration-700 ease-out',
                'hover:-translate-y-2 hover:shadow-[0_30px_60px_-15px_rgba(var(--primary),0.3)] bg-card/50 backdrop-blur-xl'
              )}>
                <div className={cn('w-16 h-16 rounded-2xl bg-gradient-to-br flex items-center justify-center ring-1 ring-border mb-6 group-hover:scale-110 group-hover:-rotate-3 transition-all duration-500', tint)}>
                  <Icon className="w-8 h-8 text-primary transition-transform duration-500 group-hover:scale-110" />
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
