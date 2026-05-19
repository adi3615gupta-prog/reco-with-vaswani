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
    { mode: 'output', icon: Send, tint: 'from-secondary/15 to-primary/10' },
  ];
  return (
    <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700 z-10">
      <div className="text-center space-y-6 mb-16 relative">
        <div className="absolute left-1/2 -top-10 -translate-x-1/2 w-32 h-32 bg-primary/30 blur-[60px] rounded-full pointer-events-none" />
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-background/85 backdrop-blur-xl border border-input text-primary text-sm font-semibold shadow-[0_0_30px_rgba(56,189,248,0.18)] animate-in fade-in slide-in-from-top-8 duration-700 hover:scale-105 transition-transform cursor-default">
          <Sparkles className="w-4 h-4 text-primary animate-pulse" />
          <span>Next-generation GST engine</span>
          <Sparkles className="w-4 h-4 text-primary animate-pulse" />
        </div>
        <h2 className="text-5xl md:text-7xl font-black tracking-tight text-foreground dark:text-white">
          Reconciliation, <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Evolved.</span>
        </h2>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-medium">
          A premium GST reconciliation workspace built for finance leaders, auditors, and CA firms who need clarity, speed, and zero-risk reporting.
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
                'glass-card relative overflow-hidden p-8 md:p-10 h-full border border-white/10 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.55)] transition-all duration-700 ease-out flex flex-col',
                'hover:-translate-y-4 hover:scale-[1.02] hover:shadow-[0_40px_90px_-30px_rgba(59,130,246,0.28)] bg-card/70 backdrop-blur-2xl'
              )}>
                <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.18),_transparent_28%)] transition-opacity duration-700" />
                <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 bg-[radial-gradient(circle_at_bottom_left,_rgba(192,132,252,0.18),_transparent_28%)] transition-opacity duration-700 delay-100" />
                <div className={cn('relative z-10 w-16 h-16 rounded-3xl bg-gradient-to-br flex items-center justify-center ring-1 ring-white/15 mb-8 transition-all duration-500', tint)}>
                  <Icon className="w-8 h-8 text-white transition-transform duration-500 group-hover:scale-110" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight mb-2 text-foreground z-10">{t.title}</h3>
                <p className="text-sm text-muted-foreground font-medium mb-4 z-10">{t.subtitle}</p>
                <p className="text-sm text-muted-foreground leading-relaxed mb-8 flex-1 z-10">
                  {mode === 'input'
                    ? 'Match purchase invoices and journals against GSTR-2B for faster ITC validation and audit-ready controls.'
                    : 'Compare sales entries with GSTR-1 to expose mismatches, secure liability accuracy, and close returns confidently.'}
                </p>
                <div className="mt-auto z-10">
                  <div className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold tracking-wide shadow-lg shadow-primary/20 transition-all duration-500 hover:scale-[1.01] hover:brightness-110">
                    START {t.title.toUpperCase()} <ArrowRight className="w-5 h-5" />
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
