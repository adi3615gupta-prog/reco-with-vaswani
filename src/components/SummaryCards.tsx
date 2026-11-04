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
    { key: 'all', label: 'Total Volume', value: summary.total, icon: BarChart3, color: '#4F46E5', bgIcon: 'bg-indigo-50 text-indigo-600', border: 'hover:border-indigo-400' },
    { key: 'perfect', label: 'Perfect Match', value: summary.perfectMatch, icon: CheckCircle2, color: '#059669', bgIcon: 'bg-emerald-50 text-emerald-600', border: 'hover:border-emerald-400' },
    { key: 'valueMismatch', label: 'Value Mismatch', value: summary.valueMismatch, icon: AlertTriangle, color: '#D97706', bgIcon: 'bg-amber-50 text-amber-600', border: 'hover:border-amber-400' },
    { key: 'invoiceMissing', label: 'Not in 2B/Govt', value: summary.invoiceMissing, icon: XCircle, color: '#DC2626', bgIcon: 'bg-rose-50 text-rose-600', border: 'hover:border-rose-400' },
    { key: 'unmatchedVendor', label: 'Party Not in 2B', value: summary.unmatchedVendor, icon: UserX, color: '#E11D48', bgIcon: 'bg-pink-50 text-pink-600', border: 'hover:border-pink-400' },
    { key: 'missingPR', label: 'Not in Books', value: summary.missingInPR, icon: FileText, color: '#7C3AED', bgIcon: 'bg-purple-50 text-purple-600', border: 'hover:border-purple-400' },
    { key: 'taxTypeError', label: 'Tax Type Error', value: (summary.taxTypeError || 0), icon: AlertTriangle, color: '#EA580C', bgIcon: 'bg-orange-50 text-orange-600', border: 'hover:border-orange-400' },
    { key: 'wrongGstin', label: 'Wrong GSTIN', value: (summary.wrongGstin || 0), icon: ShieldAlert, color: '#BE123C', bgIcon: 'bg-red-50 text-red-600', border: 'hover:border-red-400' },
  ];

  return (
    <div className="space-y-3">
      {/* Reconciliation Health Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] block">Reconciliation Health</span>
            <span className="text-emerald-600 font-extrabold text-sm">{matchRate.toFixed(1)}% Matched</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-slate-600 font-medium">
          <span className="font-mono text-xs">{summary.perfectMatch.toLocaleString('en-IN')} of {summary.total.toLocaleString('en-IN')} matched</span>
          <div className="w-36 h-2.5 rounded-full bg-slate-100 overflow-hidden border border-slate-200/80">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-indigo-600 transition-all duration-700 rounded-full"
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
                'bg-white border rounded-xl shadow-xs group flex flex-col justify-between overflow-hidden min-h-[96px] transition-all cursor-pointer',
                c.border,
                isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs bg-indigo-50/10' : 'border-slate-200/80 hover:shadow-xs'
              )}
            >
              <div className="py-2 px-3 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider truncate mr-1">{c.label}</span>
                <c.icon className="w-3.5 h-3.5 shrink-0" style={{ color: c.color }} />
              </div>
              
              <div className="p-3 pt-2 space-y-2 flex-1 flex flex-col justify-between">
                <div>
                  <div className="text-xl font-mono font-black text-slate-900 tracking-tight leading-none">
                    {c.value.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider mt-1" style={{ color: c.color }}>
                    {pct.toFixed(1)}%
                  </div>
                </div>
                
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                  <div 
                    className="h-full transition-all duration-700 ease-out rounded-full" 
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
