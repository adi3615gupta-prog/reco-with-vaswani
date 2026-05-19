import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, FileText, UserX, ShieldAlert, BarChart3 } from 'lucide-react';
import type { ReconciliationSummary } from '@/lib/reconciliation';
import { cn } from '@/lib/utils';

interface SummaryCardsProps {
  summary: ReconciliationSummary;
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  const total = summary.total || 1; // prevent divide by zero
  
  const cards = [
    { label: 'Total Volume', value: summary.total, icon: BarChart3, color: 'var(--np-sky)', border: 'rgba(74,158,232,0.2)' },
    { label: 'Perfect Match', value: summary.perfectMatch, icon: CheckCircle2, color: 'var(--np-green)', border: 'rgba(61,204,142,0.2)' },
    { label: 'Value Mismatch', value: summary.valueMismatch, icon: AlertTriangle, color: '#F0A030', border: 'rgba(240,160,48,0.2)' },
    { label: 'Not in 2B/Govt', value: summary.invoiceMissing, icon: XCircle, color: 'var(--np-red)', border: 'rgba(232,90,90,0.2)' },
    { label: 'Unmatched Vendor', value: summary.unmatchedVendor, icon: UserX, color: 'var(--np-red)', border: 'rgba(232,90,90,0.2)' },
    { label: 'Not in Books', value: summary.missingInPR, icon: FileText, color: '#A87EE8', border: 'rgba(168,126,232,0.2)' },
    { label: 'Name Matches', value: (summary.nameMatched || 0), icon: HelpCircle, color: '#F0A030', border: 'rgba(240,160,48,0.2)' },
    { label: 'Wrong GSTIN', value: (summary.wrongGstin || 0), icon: ShieldAlert, color: 'var(--np-red)', border: 'rgba(232,90,90,0.2)' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((c, i) => {
        const pct = (c.value / total) * 100;
        return (
          <div
            key={c.label}
            className="dash-card group silk-reveal h-full flex flex-col"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="dash-topbar" style={{ background: `linear-gradient(90deg, ${c.border} 0%, transparent 100%)` }}>
              <span className="text-[10px] font-bold text-[var(--np-text3)] uppercase tracking-widest">{c.label}</span>
              <c.icon className="w-3.5 h-3.5" style={{ color: c.color }} />
            </div>
            
            <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
              <div>
                <div className="text-3xl font-extrabold text-white tracking-tight">
                  {c.value.toLocaleString('en-IN')}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: c.color }}>
                  {pct.toFixed(1)}% Contribution
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-bold text-[var(--np-text3)] uppercase tracking-widest">
                  <span>Relative Volume</span>
                  <span>{Math.round(pct)}%</span>
                </div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full transition-all duration-1000 ease-[var(--np-silk)]" 
                    style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: c.color }} 
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
