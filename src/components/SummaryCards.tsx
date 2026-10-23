import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, FileText, UserX, ShieldAlert, BarChart3, TrendingUp, Sparkles } from 'lucide-react';
import type { ReconciliationSummary } from '@/lib/reconciliation';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface SummaryCardsProps {
  summary: ReconciliationSummary;
  onFilterSelect?: (key: string) => void;
  activeFilter?: string;
}

export function SummaryCards({ summary, onFilterSelect, activeFilter }: SummaryCardsProps) {
  const total = summary.total || 1; // prevent divide by zero
  const matchRate = ((summary.perfectMatch / total) * 100);

  const cards = [
    { key: 'all', label: 'Total Volume', value: summary.total, icon: BarChart3, color: '#4A9EE8', border: 'rgba(74,158,232,0.3)', bgHover: 'hover:border-sky-500/50' },
    { key: 'perfect', label: 'Perfect Match', value: summary.perfectMatch, icon: CheckCircle2, color: '#10B981', border: 'rgba(16,185,129,0.3)', bgHover: 'hover:border-emerald-500/50' },
    { key: 'valueMismatch', label: 'Value Mismatch', value: summary.valueMismatch, icon: AlertTriangle, color: '#F59E0B', border: 'rgba(245,158,11,0.3)', bgHover: 'hover:border-amber-500/50' },
    { key: 'invoiceMissing', label: 'Not in 2B/Govt', value: summary.invoiceMissing, icon: XCircle, color: '#EF4444', border: 'rgba(239,68,68,0.3)', bgHover: 'hover:border-rose-500/50' },
    { key: 'unmatchedVendor', label: 'Party Not in 2B', value: summary.unmatchedVendor, icon: UserX, color: '#F43F5E', border: 'rgba(244,63,94,0.3)', bgHover: 'hover:border-rose-500/50' },
    { key: 'missingPR', label: 'Not in Books', value: summary.missingInPR, icon: FileText, color: '#8B5CF6', border: 'rgba(139,92,246,0.3)', bgHover: 'hover:border-purple-500/50' },
    { key: 'taxTypeError', label: 'Tax Type Error', value: (summary.taxTypeError || 0), icon: AlertTriangle, color: '#FB923C', border: 'rgba(251,146,60,0.3)', bgHover: 'hover:border-orange-500/50' },
    { key: 'wrongGstin', label: 'Wrong GSTIN', value: (summary.wrongGstin || 0), icon: ShieldAlert, color: '#E11D48', border: 'rgba(225,29,72,0.3)', bgHover: 'hover:border-rose-600/50' },
  ];

  return (
    <div className="space-y-3">
      {/* Mini Match Rate Health Bar */}
      <div className="obsidian-card px-4 py-2.5 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span className="font-bold text-slate-700 uppercase tracking-wider">Reconciliation Health:</span>
          <span className="text-emerald-400 font-extrabold text-sm">{matchRate.toFixed(1)}% Matched</span>
        </div>
        <div className="flex items-center gap-3 text-slate-400">
          <span>{summary.perfectMatch} of {summary.total} matched</span>
          <div className="w-32 h-2 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-all duration-700"
              style={{ width: `${Math.max(matchRate, 2)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Grid of 8 High-Density KPI Cards */}
      <motion.div 
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { staggerChildren: 0.03 } }
        }}
        className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5"
      >
        {cards.map((c) => {
          const pct = (c.value / total) * 100;
          const isSelected = activeFilter === c.key;

          return (
            <motion.div
              key={c.label}
              variants={{
                hidden: { opacity: 0, scale: 0.95, y: 8 },
                show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 350, damping: 25 } }
              }}
              whileHover={{ scale: 1.02, y: -2, transition: { type: 'spring', stiffness: 400, damping: 15 } }}
              onClick={() => onFilterSelect && onFilterSelect(c.key)}
              className={cn(
                'obsidian-card group flex flex-col justify-between shadow-md p-0 overflow-hidden min-h-[92px] transition-all cursor-pointer',
                c.bgHover,
                isSelected && 'ring-2 ring-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.25)]'
              )}
            >
              <div
                className="py-1.5 px-3 flex items-center justify-between border-b border-white/[0.04]"
                style={{ background: `linear-gradient(90deg, ${c.border} 0%, transparent 100%)` }}
              >
                <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider truncate mr-1">{c.label}</span>
                <c.icon className="w-3 h-3 shrink-0" style={{ color: c.color }} />
              </div>
              
              <div className="p-3 pt-2 space-y-1.5 flex-1 flex flex-col justify-between">
                <div>
                  <div className="text-xl font-mono font-black text-slate-900 tracking-tight leading-none">
                    {c.value.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[9px] font-mono font-bold uppercase tracking-wider mt-1" style={{ color: c.color }}>
                    {pct.toFixed(1)}%
                  </div>
                </div>
                
                <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/40">
                  <div 
                    className="h-full transition-all duration-700 ease-out" 
                    style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: c.color }} 
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
export default SummaryCards;
