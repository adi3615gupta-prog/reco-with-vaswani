import { Card } from '@/components/ui/card';
import { Inbox, Send, ArrowRight, Sparkles } from 'lucide-react';
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
    <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700 z-10">
      <div className="text-center space-y-6 mb-16 relative">
        <div className="absolute left-1/2 -top-10 -translate-x-1/2 w-32 h-32 bg-primary/30 blur-[60px] rounded-full pointer-events-none" />
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-background/50 backdrop-blur-xl border border-primary/20 text-primary text-sm font-bold shadow-[0_0_20px_-5px_rgba(var(--primary),0.3)] animate-in fade-in slide-in-from-top-8 duration-700 hover:scale-105 transition-transform cursor-default">
          <Sparkles className="w-4 h-4 animate-pulse" />
          <span>Next-Generation GST Engine</span>
          <Sparkles className="w-4 h-4 animate-pulse" />
        </div>
        <h2 className="text-5xl md:text-7xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-foreground via-foreground/90 to-muted-foreground animate-in fade-in zoom-in-95 duration-1000 delay-150 drop-shadow-sm pb-2">
          Reconciliation, <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-info to-primary animate-pulse [animation-duration:4s]">Evolved.</span>
        </h2>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300 font-medium">
          Select a workflow to seamlessly sync your records, eliminate mismatches, and maximize compliance.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-8">
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
                'glass-card relative overflow-hidden p-8 md:p-10 h-full border-2 hover:border-primary/50 transition-all duration-700 ease-out flex flex-col shadow-xl',
                'hover:-translate-y-4 hover:scale-[1.02] hover:shadow-[0_40px_80px_-20px_rgba(var(--primary),0.4)] bg-card/40 backdrop-blur-2xl'
              )}>
                {/* Moving shimmer effect */}
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/10 to-transparent group-hover:translate-x-full transition-transform duration-[1500ms] ease-in-out z-0" />

                {/* Expanding Ambient inner glows */}
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-gradient-to-br from-primary/30 to-transparent rounded-full blur-3xl group-hover:bg-primary/40 group-hover:scale-150 transition-all duration-700" />
                <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-gradient-to-tr from-info/20 to-transparent rounded-full blur-3xl group-hover:bg-info/30 group-hover:scale-150 transition-all duration-700" />
                
                <div className={cn('w-16 h-16 rounded-2xl bg-gradient-to-br flex items-center justify-center ring-1 ring-border mb-8 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-lg transition-all duration-500 z-10', tint)}>
                  <Icon className="w-8 h-8 text-primary transition-transform duration-500 group-hover:scale-110" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight mb-2 z-10">{t.title}</h3>
                <p className="text-sm text-primary/80 font-medium mb-4 z-10">{t.subtitle}</p>
                <p className="text-sm text-muted-foreground leading-relaxed mb-8 flex-1 z-10">
                  {mode === 'input'
                    ? 'Match purchase invoices and journals against GSTR-2B to safeguard Input Tax Credit with precision.'
                    : 'Match sales invoices against GSTR-1 to ensure tax liability is fully and correctly reported.'}
                </p>
                <div className="mt-auto z-10">
                  <div className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-primary/10 text-primary font-bold tracking-wide ring-1 ring-primary/30 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-500 group-hover:shadow-[0_0_30px_-5px_rgba(var(--primary),0.6)]">
                    START {t.title.toUpperCase()} <ArrowRight className="w-5 h-5 group-hover:translate-x-1.5 transition-transform" />
                  </div>
                </div>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}
