import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, FileText, UserX, ShieldAlert, BarChart3 } from 'lucide-react';
import type { ReconciliationSummary } from '@/lib/reconciliation';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

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
    { label: 'Party Not in 2B', value: summary.unmatchedVendor, icon: UserX, color: 'var(--np-red)', border: 'rgba(232,90,90,0.2)' },
    { label: 'Not in Books', value: summary.missingInPR, icon: FileText, color: '#A87EE8', border: 'rgba(168,126,232,0.2)' },
    { label: 'Name Matches', value: (summary.nameMatched || 0), icon: HelpCircle, color: '#F0A030', border: 'rgba(240,160,48,0.2)' },
    { label: 'Wrong GSTIN', value: (summary.wrongGstin || 0), icon: ShieldAlert, color: 'var(--np-red)', border: 'rgba(232,90,90,0.2)' },
  ];

  return (
    <motion.div 
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.05 } }
      }}
      className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3"
    >
      {cards.map((c) => {
        const pct = (c.value / total) * 100;
        return (
          <motion.div
            key={c.label}
            variants={{
              hidden: { opacity: 0, scale: 0.95, y: 10 },
              show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 350, damping: 25 } }
            }}
            whileHover={{ scale: 1.03, y: -2, transition: { type: 'spring', stiffness: 400, damping: 12 } }}
            className="dash-card group flex flex-col justify-between shadow-md cursor-default p-0 overflow-hidden min-h-[95px]"
          >
            <div className="dash-topbar py-1.5 px-3" style={{ background: `linear-gradient(90deg, ${c.border} 0%, transparent 100%)` }}>
              <span className="text-[9px] font-bold text-[var(--np-text3)] uppercase tracking-wider truncate mr-1">{c.label}</span>
              <c.icon className="w-3 h-3 shrink-0" style={{ color: c.color }} />
            </div>
            
            <div className="p-3 pt-2 space-y-2 flex-1 flex flex-col justify-between">
              <div>
                <div className="text-xl font-extrabold text-white tracking-tight leading-none">
                  {c.value.toLocaleString('en-IN')}
                </div>
                <div className="text-[9px] font-bold uppercase tracking-wider mt-1" style={{ color: c.color }}>
                  {pct.toFixed(1)}%
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full transition-all duration-700 ease-[var(--np-silk)]" 
                    style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: c.color }} 
                  />
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

