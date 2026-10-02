import { useState, useMemo } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, Search, Info, ChevronDown, ChevronUp, Plus, Eye, RotateCcw } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import type { ReconciliationResult, MatchStatus } from '@/lib/reconciliation';
import { exportToXlsx } from '@/lib/fileParser';
import { daysOldFrom, isLateFiler, deriveItcEligibility, taxRatePct, posCompliance, rule37Warning, actionableRemark } from '@/lib/compliance';
import { cn } from '@/lib/utils';

interface ResultsTableProps {
  results: ReconciliationResult[];
  companyName: string;
  mode?: 'input' | 'output';
  initialCollapsed?: boolean;
}

const ALL_STATUSES: MatchStatus[] = [
  'Perfect Match', 'Value Mismatch', 'Not in 2B', 'Unmatched Vendor', 'Not in Books',
];

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getRowAccent(status: MatchStatus): string {
  switch (status) {
    case 'Perfect Match':
    case 'Matched':
    case 'Matched (Rounded)':
    case 'Matched (Diff Date)':
      return '';
    case 'Value Mismatch':
    case 'Mismatch':
      return 'bg-yellow-500/10';
    case 'Not in 2B':
    case 'Missing in 2B':
      return 'bg-[var(--np-red)]/10';
    case 'Unmatched Vendor':
    case 'Wrong GSTIN':
      return 'bg-[var(--np-red)]/15';
    case 'Not in Books':
    case 'Missing in PR':
      return 'bg-indigo-400/10';
    case 'Name Matched (No GSTIN)':
    case 'Name Mismatch':
      return 'bg-yellow-500/10';
    default:
      return '';
  }
}

export function ResultsTable({ results, companyName, mode = 'input', initialCollapsed = true }: ResultsTableProps) {
  const [search, setSearch] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [visibleCount, setVisibleCount] = useState<number>(150);

  const filtered = useMemo(() => {
    let data = results;
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter((r) => {
        const rec = r.prRecord || r.twoBRecord;
        return (
          rec?.gstin.toLowerCase().includes(q) ||
          rec?.invoiceNo.toLowerCase().includes(q) ||
          rec?.supplierName.toLowerCase().includes(q)
        );
      });
    }
    return data;
  }, [results, search]);

  const currentlyShowing = Math.min(visibleCount, filtered.length);

  return (
    <TooltipProvider delayDuration={150}>
    <div className="dash-card overflow-hidden">
      <div 
        className="dash-topbar flex items-center justify-between cursor-pointer select-none py-3 px-4"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-4">
           <div className="dash-dots"><span style={{background:'#4A9EE8'}}></span><span style={{background:'#3DCC8E'}}></span></div>
           <span className="text-[10px] font-bold text-[var(--np-text2)] uppercase tracking-widest">
             Audit Trails ({filtered.length})
           </span>
        </div>
        
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          {!isCollapsed && (
            <div className="relative w-64 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--np-text3)] group-focus-within:text-[var(--np-sky)] transition-colors" />
              <input
                placeholder="Search records..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-8 bg-[var(--np-bg3)]/50 border border-[var(--np-border2)] rounded-md pl-9 pr-4 text-[11px] text-[var(--np-text)] focus:outline-none focus:border-[var(--np-sky)] transition-all"
              />
            </div>
          )}
          
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-all border",
              isCollapsed
                ? "bg-[var(--np-sky)]/10 text-[var(--np-sky)] border-[var(--np-sky)]/30 hover:bg-[var(--np-sky)]/20 shadow-[0_0_10px_rgba(74,158,232,0.2)]"
                : "bg-white/5 text-[var(--np-text2)] border-white/10 hover:bg-white/10"
            )}
          >
            {isCollapsed ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Expand Audit Trails</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </div>
      
      {!isCollapsed && (
        <>
          <div className="overflow-x-auto">
            <table className="np-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>GSTIN</th>
                  <th>Counterparty</th>
                  <th>Invoice (Books)</th>
                  <th>Invoice (Govt)</th>
                  <th className="text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-24 text-[var(--np-text3)] italic uppercase tracking-widest text-[10px]">
                      No matching audit trails found
                    </td>
                  </tr>
                ) : (
                  filtered.slice(0, visibleCount).map((r, i) => {
                    const pr = r.prRecord;
                    const tb = r.twoBRecord;
                    const diffVal = r.gstDiff;
                    const diffColor = diffVal !== undefined && Math.abs(diffVal) > 1
                      ? 'text-[var(--np-red)]'
                      : diffVal !== undefined && diffVal === 0
                        ? 'text-[var(--np-green)]'
                        : 'text-[var(--np-text3)]';
                    const isMismatch = (r.status === 'Value Mismatch' || r.status === 'Mismatch') && pr && tb;
                    
                    return (
                      <tr key={i} className={cn('group', getRowAccent(r.status))}>
                        <td><StatusBadge status={r.status} /></td>
                        <td className="font-mono text-[11px] tracking-tight">{pr?.gstin || tb?.gstin || '—'}</td>
                        <td className="max-w-[180px] truncate font-bold text-[12px] text-[var(--np-text)]">{pr?.supplierName || tb?.supplierName}</td>
                        <td className="font-mono text-[11px]">{pr?.invoiceNo || '—'}</td>
                        <td className="font-mono text-[11px]">{tb?.invoiceNo || '—'}</td>
                        <td className={cn('text-right tabular-nums text-[12px] font-bold', diffColor)}>
                          {isMismatch ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button className={cn('inline-flex items-center gap-1 underline decoration-dotted underline-offset-4', diffColor)}>
                                  {fmt(diffVal!)} <Info className="w-3 h-3 opacity-50" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="bg-[var(--np-bg2)] border-[var(--np-border)] p-4 shadow-2xl rounded-xl">
                                <div className="text-[10px] font-bold text-[var(--np-text3)] uppercase tracking-widest mb-3">Variance Analysis</div>
                                <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-[11px] tabular-nums">
                                  <span className="text-[var(--np-text3)]">Component</span>
                                  <span className="text-right text-[var(--np-text3)]">Books</span>
                                  <span className="text-right text-[var(--np-text3)]">Govt</span>
                                  
                                  <span className="text-white font-medium">IGST</span>
                                  <span className="text-right">{fmt(pr!.igst)}</span>
                                  <span className="text-right">{fmt(tb!.igst)}</span>
                                  
                                  <span className="text-white font-medium">CGST</span>
                                  <span className="text-right">{fmt(pr!.cgst)}</span>
                                  <span className="text-right">{fmt(tb!.cgst)}</span>
                                  
                                  <span className="text-white font-medium">SGST</span>
                                  <span className="text-right">{fmt(pr!.sgst)}</span>
                                  <span className="text-right">{fmt(tb!.sgst)}</span>
                                  
                                  <div className="col-span-3 h-[1px] bg-white/5 my-1" />
                                  <span className="text-[var(--np-sky)] font-bold">TOTAL</span>
                                  <span className="col-span-2 text-right text-[var(--np-sky)] font-bold">{fmt(diffVal!)}</span>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            diffVal !== undefined ? fmt(diffVal) : '—'
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[var(--np-border)] bg-[var(--np-bg3)]/30">
            <p className="text-[10px] font-bold text-[var(--np-text3)] uppercase tracking-[0.15em]">
              Viewing {currentlyShowing} of {filtered.length} audit entries
            </p>

            <div className="flex items-center gap-2">
              {currentlyShowing < filtered.length && (
                <>
                  <button
                    onClick={() => setVisibleCount((prev) => prev + 150)}
                    className="btn-np-outline flex items-center gap-1.5 !py-1.5 !px-3 text-[10px] uppercase tracking-widest font-bold text-[var(--np-sky)] border-[var(--np-sky)]/30 hover:bg-[var(--np-sky)]/10"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Load 150 More</span>
                  </button>

                  <button
                    onClick={() => setVisibleCount(filtered.length)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-all bg-[var(--np-sky)] text-white hover:bg-[var(--np-sky)]/80 shadow-[0_0_10px_rgba(74,158,232,0.3)]"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Show All ({filtered.length})</span>
                  </button>
                </>
              )}

              {visibleCount > 150 && (
                <button
                  onClick={() => setVisibleCount(150)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-all bg-white/5 text-[var(--np-text3)] hover:bg-white/10 hover:text-white border border-white/10"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset to 150</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
    </TooltipProvider>
  );
}

