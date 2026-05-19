import { Inbox, Send, ArrowRight, Sparkles, ShieldCheck, Building2 } from 'lucide-react';
import { TERMS, type ReconciliationMode } from '@/lib/mode';

interface Props {
  onSelect: (mode: ReconciliationMode) => void;
}

export function ModeSelector({ onSelect }: Props) {
  const modes: { mode: ReconciliationMode; icon: typeof Inbox; color: string; border: string }[] = [
    { mode: 'input', icon: Inbox, color: 'var(--np-sky)', border: 'rgba(74,158,232,0.2)' },
    { mode: 'output', icon: Send, color: 'var(--np-green)', border: 'rgba(61,204,142,0.2)' },
  ];
  return (
    <div className="max-w-6xl mx-auto space-y-16 silk-reveal z-10">
      <div className="text-center space-y-6 mb-16 relative">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--np-sky)]/10 border border-[var(--np-sky)]/20 text-[var(--np-sky)] text-[10px] font-bold uppercase tracking-[0.2em] mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          Next-generation compliance engine
        </div>
        <h1 className="text-5xl md:text-8xl font-black tracking-tighter text-white leading-[0.9]">
          Finance that moves<br />
          <span className="text-[var(--np-sky)]">at your speed.</span>
        </h1>
        <p className="text-lg md:text-xl text-[var(--np-text2)] max-w-2xl mx-auto font-medium leading-relaxed">
          The modern reconciliation platform for businesses that refuse to wait. 
          Real-time analysis, intelligent matching, and enterprise-grade security.
        </p>
      </div>
      
      <div className="grid md:grid-cols-2 gap-10">
        {modes.map(({ mode, icon: Icon, color, border }, i) => {
          const t = TERMS[mode];
          return (
            <button
              key={mode}
              onClick={() => onSelect(mode)}
              className="text-left group focus:outline-none silk-reveal"
              style={{ animationDelay: `${i * 200}ms` }}
            >
              <div className="dash-card p-10 h-full flex flex-col group-hover:-translate-y-2 transition-all duration-500 ease-[var(--np-silk)] hover:shadow-[0_40px_100px_-20px_rgba(74,158,232,0.15)] relative overflow-hidden">
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--np-sky)]/5 blur-[100px] rounded-full -mr-32 -mt-32 pointer-events-none" />
                
                <div className="w-16 h-16 rounded-2xl bg-[var(--np-bg3)] border border-[var(--np-border2)] flex items-center justify-center mb-8 ring-1 ring-white/5 transition-all duration-500 group-hover:scale-110 group-hover:border-[var(--np-sky)]/50 group-hover:shadow-[0_0_30px_rgba(74,158,232,0.2)]">
                  <Icon className="w-8 h-8 text-white transition-transform duration-500 group-hover:rotate-6" style={{ color }} />
                </div>
                
                <h3 className="text-3xl font-extrabold tracking-tight mb-2 text-white">{t.title}</h3>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] mb-6" style={{ color }}>{t.subtitle}</p>
                
                <p className="text-sm text-[var(--np-text2)] leading-relaxed mb-10 flex-1">
                  {mode === 'input'
                    ? 'Automate the matching of purchase registers against GSTR-2B with intelligent fuzzy logic and Sec 170 rounding compliance.'
                    : 'Streamline sales reconciliation with GSTR-1 to ensure zero-risk liability reporting and proactive mismatch detection.'}
                </p>
                
                <div className="btn-np-primary !py-4 w-full flex items-center justify-center gap-2 group-hover:gap-4 transition-all">
                  <span className="text-[11px] font-bold uppercase tracking-widest">Open {t.title} Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="pt-12 flex justify-center opacity-30 grayscale contrast-125 gap-12">
        <div className="text-[10px] font-bold uppercase tracking-[0.3em] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> SECURE AUDIT
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.3em] flex items-center gap-2">
          <Building2 className="w-4 h-4" /> ENTERPRISE READY
        </div>
      </div>
    </div>
  );
}
