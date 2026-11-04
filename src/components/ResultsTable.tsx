import { useState, useMemo, useRef, useDeferredValue } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, Search, Info, ChevronDown, ChevronUp, Plus, Eye, RotateCcw, ArrowUp, Zap } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { AuditJustificationModal } from '@/components/AuditJustificationModal';
import type { AuditActionType } from '@/lib/auditTrailService';
import { ShieldCheck } from 'lucide-react';
import type { ReconciliationResult, MatchStatus } from '@/lib/reconciliation';
import { exportToXlsx } from '@/lib/fileParser';
import { daysOldFrom, isLateFiler, deriveItcEligibility, taxRatePct, posCompliance, rule37Warning, actionableRemark } from '@/lib/compliance';
import { cn } from '@/lib/utils';

interface ResultsTableProps {
  results: ReconciliationResult[];
  companyName: string;
  mode?: 'input' | 'output';
  initialCollapsed?: boolean;
  onResultsChange?: (newResults: ReconciliationResult[]) => void;
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
      return 'hover:bg-slate-50/70';
    case 'Value Mismatch':
    case 'Mismatch':
      return 'bg-amber-50/40 hover:bg-amber-50/70';
    case 'Not in 2B':
    case 'Missing in 2B':
      return 'bg-rose-50/40 hover:bg-rose-50/70';
    case 'Unmatched Vendor':
    case 'Wrong GSTIN':
      return 'bg-rose-50/60 hover:bg-rose-50/80';
    case 'Not in Books':
    case 'Missing in PR':
      return 'bg-indigo-50/40 hover:bg-indigo-50/70';
    case 'Name Matched (No GSTIN)':
    case 'Name Mismatch':
      return 'bg-amber-50/40 hover:bg-amber-50/70';
    case 'Debit Note (Books)':
    case 'Debit Note (Portal)':
      return 'bg-amber-50/50 hover:bg-amber-50/80';
    default:
      return 'hover:bg-slate-50/70';
  }
}

export function ResultsTable({ results, companyName, mode = 'input', initialCollapsed = true, onResultsChange }: ResultsTableProps) {
  const [search, setSearch] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const parentRef = useRef<HTMLDivElement>(null);
  const deferredSearch = useDeferredValue(search);

  const [auditModalState, setAuditModalState] = useState<{
    isOpen: boolean;
    actionType: AuditActionType;
    targetStatus: string;
    originalStatus?: string;
    prRecord?: any;
    twoBRecord?: any;
    clientGstin?: string;
    taxableDiff?: number;
    gstDiff?: number;
    targetResult?: ReconciliationResult;
  }>({
    isOpen: false,
    actionType: 'FORCE_MATCH',
    targetStatus: 'Perfect Match',
  });

  const filtered = useMemo(() => {
    let data = results;
    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase();
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
  }, [results, deferredSearch]);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 12,
  });

  const currentlyShowing = Math.min(visibleCount, filtered.length);

  return (
    <TooltipProvider delayDuration={150}>
    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
      <div 
        className="bg-slate-50/80 border-b border-slate-200 flex items-center justify-between cursor-pointer select-none py-3 px-4"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-3">
           <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></div>
           <span className="text-[11px] font-bold text-slate-800 uppercase tracking-widest font-mono">
             Audit Trails ({filtered.length.toLocaleString('en-IN')})
           </span>
        </div>
        
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          {!isCollapsed && (
            <div className="relative w-64 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
              <input
                placeholder="Search invoice or GSTIN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-8 bg-white border border-slate-200 focus:border-indigo-500 rounded-lg pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all shadow-2xs font-medium"
              />
            </div>
          )}
          
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-all border",
              isCollapsed
                ? "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 shadow-2xs"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
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
          <div
            ref={parentRef}
            className="overflow-auto max-h-[620px] scrollbar-thin relative border-b border-slate-200"
          >
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs text-slate-700 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200 shadow-2xs">
                <tr>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">GSTIN</th>
                  <th className="py-2.5 px-3">Counterparty</th>
                  <th className="py-2.5 px-3">Invoice (Books)</th>
                  <th className="py-2.5 px-3">Invoice (Govt)</th>
                  <th className="py-2.5 px-3 text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-20 text-slate-400 italic uppercase tracking-widest text-xs">
                      No matching audit trails found
                    </td>
                  </tr>
                ) : (
                  <>
                    {/* Virtual Top Spacer */}
                    {rowVirtualizer.getVirtualItems().length > 0 && (
                      <tr style={{ height: `${rowVirtualizer.getVirtualItems()[0]?.start || 0}px` }}>
                        <td colSpan={6} className="p-0 border-0" />
                      </tr>
                    )}

                    {/* Virtual Rows Rendering at 120 FPS */}
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const r = filtered[virtualRow.index];
                      if (!r) return null;
                      const pr = r.prRecord;
                      const tb = r.twoBRecord;
                      const diffVal = r.gstDiff;
                      const diffColor = diffVal !== undefined && Math.abs(diffVal) > 1
                        ? 'text-rose-600'
                        : diffVal !== undefined && diffVal === 0
                          ? 'text-emerald-600'
                          : 'text-slate-500';
                      const isMismatch = (r.status === 'Value Mismatch' || r.status === 'Mismatch') && pr && tb;

                      return (
                        <tr
                          key={virtualRow.key}
                          data-index={virtualRow.index}
                          ref={rowVirtualizer.measureElement}
                          className={cn('transition-colors', getRowAccent(r.status))}
                        >
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <StatusBadge status={r.status} />
                              {onResultsChange && isMismatch && (
                                <button
                                  onClick={() => {
                                    setAuditModalState({
                                      isOpen: true,
                                      actionType: 'FORCE_MATCH',
                                      targetStatus: 'Perfect Match',
                                      originalStatus: r.status,
                                      prRecord: pr,
                                      twoBRecord: tb,
                                      clientGstin: pr?.gstin || tb?.gstin,
                                      taxableDiff: r.taxableDiff,
                                      gstDiff: r.gstDiff,
                                      targetResult: r,
                                    });
                                  }}
                                  title="Statutory Force Match with Justification"
                                  className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 tracking-tight">{pr?.gstin || tb?.gstin || '—'}</td>
                          <td className="py-2.5 px-3 max-w-[200px] truncate font-bold text-slate-900">{pr?.supplierName || tb?.supplierName}</td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700">{pr?.invoiceNo || '—'}</td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700">{tb?.invoiceNo || '—'}</td>
                          <td className={cn('py-2.5 px-3 text-right tabular-nums text-xs font-bold font-mono', diffColor)}>
                            {isMismatch ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button className={cn('inline-flex items-center gap-1 underline decoration-dotted underline-offset-4 cursor-pointer', diffColor)}>
                                    {fmt(diffVal!)} <Info className="w-3 h-3 opacity-60" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="bg-slate-900 border-slate-800 p-4 shadow-2xl rounded-xl text-white">
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Variance Analysis</div>
                                  <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-[11px] tabular-nums font-mono">
                                    <span className="text-slate-400">Component</span>
                                    <span className="text-right text-slate-400">Books</span>
                                    <span className="text-right text-slate-400">Govt</span>
                                    
                                    <span className="text-white font-medium">IGST</span>
                                    <span className="text-right">{fmt(pr!.igst)}</span>
                                    <span className="text-right">{fmt(tb!.igst)}</span>
                                    
                                    <span className="text-white font-medium">CGST</span>
                                    <span className="text-right">{fmt(pr!.cgst)}</span>
                                    <span className="text-right">{fmt(tb!.cgst)}</span>
                                    
                                    <span className="text-white font-medium">SGST</span>
                                    <span className="text-right">{fmt(pr!.sgst)}</span>
                                    <span className="text-right">{fmt(tb!.sgst)}</span>
                                    
                                    <div className="col-span-3 h-[1px] bg-slate-800 my-1" />
                                    <span className="text-sky-400 font-bold">TOTAL</span>
                                    <span className="col-span-2 text-right text-sky-400 font-bold">{fmt(diffVal!)}</span>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              diffVal !== undefined ? fmt(diffVal) : '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Virtual Bottom Spacer */}
                    {rowVirtualizer.getVirtualItems().length > 0 && (
                      <tr
                        style={{
                          height: `${
                            rowVirtualizer.getTotalSize() -
                            (rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1]?.end || 0)
                          }px`,
                        }}
                      >
                        <td colSpan={6} className="p-0 border-0" />
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Virtual Performance Status Footer */}
          <div className="p-3 px-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/70 border-t border-slate-200">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[11px] font-bold text-slate-700 font-mono flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                Virtual Scrolling Active • {filtered.length.toLocaleString('en-IN')} Invoices Loaded
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-slate-500 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-2xs font-semibold">
                Rendering {rowVirtualizer.getVirtualItems().length} live DOM rows at 120 FPS
              </span>
              {filtered.length > 30 && (
                <button
                  type="button"
                  onClick={() => parentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
                  title="Scroll back to top"
                >
                  <ArrowUp className="w-3 h-3 text-slate-500" />
                  <span>Top</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <AuditJustificationModal
        isOpen={auditModalState.isOpen}
        onClose={() => setAuditModalState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={(justification) => {
          if (!onResultsChange || !auditModalState.targetResult) return;
          const target = auditModalState.targetResult;
          const updatedResults = results.map((item) => {
            if (item === target) {
              return {
                ...item,
                status: 'Perfect Match' as MatchStatus,
                gstDiff: 0,
                cgstDiff: 0,
                sgstDiff: 0,
                igstDiff: 0,
                taxableDiff: 0,
                remark: `Force Matched: ${justification}`,
              };
            }
            return item;
          });
          onResultsChange(updatedResults);
        }}
        actionType={auditModalState.actionType}
        targetStatus={auditModalState.targetStatus}
        originalStatus={auditModalState.originalStatus}
        prRecord={auditModalState.prRecord}
        twoBRecord={auditModalState.twoBRecord}
        companyName={companyName}
        clientGstin={auditModalState.clientGstin}
        taxableDiff={auditModalState.taxableDiff}
        gstDiff={auditModalState.gstDiff}
      />
    </div>
    </TooltipProvider>
  );
}
export default ResultsTable;
