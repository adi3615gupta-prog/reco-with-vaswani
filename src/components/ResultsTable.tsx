import { useState, useMemo, useRef, useDeferredValue } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, Info, ChevronDown, ChevronUp, ArrowUp, ShieldCheck } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { AuditJustificationModal } from '@/components/AuditJustificationModal';
import type { AuditActionType } from '@/lib/auditTrailService';
import type { ReconciliationResult, MatchStatus } from '@/lib/reconciliation';
import { cn } from '@/lib/utils';

interface ResultsTableProps {
  results: ReconciliationResult[];
  companyName: string;
  mode?: 'input' | 'output';
  initialCollapsed?: boolean;
  hideCollapseToggle?: boolean;
  embedded?: boolean;
  externalSearch?: string;
  onResultsChange?: (newResults: ReconciliationResult[]) => void;
}

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(n?: number) {
  if (n === undefined || n === null) return '—';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function sumTax(rec?: { igst?: number; cgst?: number; sgst?: number }): number | undefined {
  if (!rec) return undefined;
  return (rec.igst || 0) + (rec.cgst || 0) + (rec.sgst || 0);
}

function getRowAccent(status: MatchStatus): string {
  switch (status) {
    case 'Perfect Match':
    case 'Matched':
    case 'Matched (Rounded)':
    case 'Matched (Diff Date)':
      return 'hover:bg-slate-50/80';
    case 'Value Mismatch':
    case 'Mismatch':
      return 'bg-amber-50/35 hover:bg-amber-50/65';
    case 'Not in 2B':
    case 'Missing in 2B':
    case 'Unmatched Vendor':
    case 'Wrong GSTIN':
      return 'bg-rose-50/35 hover:bg-rose-50/65';
    case 'Not in Books':
    case 'Missing in PR':
      return 'bg-indigo-50/35 hover:bg-indigo-50/65';
    case 'Debit Note (Books)':
    case 'Debit Note (Portal)':
      return 'bg-amber-50/40 hover:bg-amber-50/70';
    default:
      return 'hover:bg-slate-50/80';
  }
}

export function ResultsTable({
  results,
  companyName,
  initialCollapsed = true,
  hideCollapseToggle = false,
  embedded = false,
  externalSearch,
  onResultsChange,
}: ResultsTableProps) {
  const [internalSearch, setInternalSearch] = useState('');
  const search = externalSearch !== undefined ? externalSearch : internalSearch;
  const [isCollapsed, setIsCollapsed] = useState(embedded || hideCollapseToggle ? false : initialCollapsed);
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
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return results;
    return results.filter((r) => {
      const pr = r.prRecord;
      const tb = r.twoBRecord;
      return (
        pr?.gstin?.toLowerCase().includes(q) ||
        tb?.gstin?.toLowerCase().includes(q) ||
        pr?.invoiceNo?.toLowerCase().includes(q) ||
        tb?.invoiceNo?.toLowerCase().includes(q) ||
        pr?.supplierName?.toLowerCase().includes(q) ||
        tb?.supplierName?.toLowerCase().includes(q)
      );
    });
  }, [results, deferredSearch]);

  const filteredTotals = useMemo(() => {
    let prTax = 0;
    let tbTax = 0;
    for (const r of filtered) {
      prTax += sumTax(r.prRecord) ?? 0;
      tbTax += sumTax(r.twoBRecord) ?? 0;
    }
    return { prTax, tbTax, diff: prTax - tbTax };
  }, [filtered]);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 12,
  });

  const tableBody = (
    <>
      <div
        ref={parentRef}
        className="overflow-auto max-h-[580px] scrollbar-thin relative border-b border-slate-200"
      >
        <table className="w-full text-xs text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs text-slate-600 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-4">Status</th>
              <th className="py-2.5 px-3">Party &amp; GSTIN</th>
              <th className="py-2.5 px-3">Books Invoice (PR)</th>
              <th className="py-2.5 px-3">Portal Invoice (2B)</th>
              <th className="py-2.5 px-3 text-right">Tax (PR / 2B)</th>
              <th className="py-2.5 px-4 text-right">Tax Diff</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-16 text-slate-500 text-xs font-medium">
                  No invoices match your search or selected filter.
                </td>
              </tr>
            ) : (
              <>
                {rowVirtualizer.getVirtualItems().length > 0 && (
                  <tr style={{ height: `${rowVirtualizer.getVirtualItems()[0]?.start || 0}px` }}>
                    <td colSpan={6} className="p-0 border-0" />
                  </tr>
                )}

                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const r = filtered[virtualRow.index];
                  if (!r) return null;
                  const pr = r.prRecord;
                  const tb = r.twoBRecord;
                  const prTax = sumTax(pr);
                  const tbTax = sumTax(tb);
                  const diffVal = r.gstDiff;
                  const diffColor =
                    diffVal !== undefined && Math.abs(diffVal) > 1
                      ? diffVal > 0
                        ? 'text-rose-600'
                        : 'text-amber-700'
                      : diffVal !== undefined && diffVal === 0
                      ? 'text-emerald-700'
                      : 'text-slate-500';
                  const isMismatch = (r.status === 'Value Mismatch' || r.status === 'Mismatch') && pr && tb;
                  const partyName = pr?.supplierName || tb?.supplierName || '—';
                  const gstin = pr?.gstin || tb?.gstin || 'NO GSTIN';

                  return (
                    <tr
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className={cn('transition-colors', getRowAccent(r.status))}
                    >
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={r.status} />
                          {onResultsChange && isMismatch && (
                            <button
                              type="button"
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
                              title="Force Match with Statutory Justification"
                              className="p-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 max-w-[240px]">
                        <div className="font-bold text-slate-900 truncate" title={partyName}>
                          {partyName}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 truncate">{gstin}</div>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-mono font-semibold text-slate-800">{pr?.invoiceNo || '—'}</div>
                        {pr?.invoiceDate && <div className="text-[11px] text-slate-500">{pr.invoiceDate}</div>}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-mono font-semibold text-indigo-700">{tb?.invoiceNo || '—'}</div>
                        {tb?.invoiceDate && <div className="text-[11px] text-slate-500">{tb.invoiceDate}</div>}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{fmtShort(prTax)}</div>
                        <div className="text-[11px] text-slate-500">{fmtShort(tbTax)}</div>
                      </td>

                      <td className={cn('py-2.5 px-4 text-right tabular-nums text-xs font-bold font-mono whitespace-nowrap', diffColor)}>
                        {isMismatch ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className={cn('inline-flex items-center gap-1 underline decoration-dotted underline-offset-4 cursor-pointer', diffColor)}
                              >
                                {fmt(diffVal!)} <Info className="w-3 h-3 opacity-70" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="bg-slate-900 border-slate-800 p-4 shadow-2xl rounded-xl text-white">
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                                Tax Breakdown
                              </div>
                              <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-[11px] tabular-nums font-mono">
                                <span className="text-slate-400">Head</span>
                                <span className="text-right text-slate-400">Books</span>
                                <span className="text-right text-slate-400">Portal 2B</span>

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
                                <span className="text-sky-400 font-bold">DIFF</span>
                                <span className="col-span-2 text-right text-sky-400 font-bold">{fmt(diffVal!)}</span>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : diffVal !== undefined ? (
                          fmt(diffVal)
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}

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

      {/* Clean CA Totals Footer */}
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 text-xs">
        <div className="flex flex-wrap items-center gap-4 text-slate-600">
          <span className="font-bold text-slate-900">
            {filtered.length.toLocaleString('en-IN')} {filtered.length === 1 ? 'invoice' : 'invoices'}
          </span>
          <span className="hidden sm:inline text-slate-300">|</span>
          <span>
            Books Tax: <strong className="font-mono text-slate-900">{fmtShort(filteredTotals.prTax)}</strong>
          </span>
          <span>
            Portal 2B Tax: <strong className="font-mono text-slate-900">{fmtShort(filteredTotals.tbTax)}</strong>
          </span>
          <span>
            Net Diff:{' '}
            <strong
              className={cn(
                'font-mono',
                Math.abs(filteredTotals.diff) < 1 ? 'text-emerald-700' : 'text-rose-600'
              )}
            >
              {fmtShort(filteredTotals.diff)}
            </strong>
          </span>
        </div>

        {filtered.length > 20 && (
          <button
            type="button"
            onClick={() => parentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
          >
            <ArrowUp className="w-3 h-3 text-slate-500" />
            <span>Back to Top</span>
          </button>
        )}
      </div>
    </>
  );

  return (
    <TooltipProvider delayDuration={150}>
      {embedded ? (
        <div className="w-full">{tableBody}</div>
      ) : (
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
          <div
            className={cn(
              'bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 select-none py-3 px-4',
              !hideCollapseToggle && 'cursor-pointer'
            )}
            onClick={() => {
              if (!hideCollapseToggle) setIsCollapsed(!isCollapsed);
            }}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-indigo-600" />
              <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                Audit Trails ({filtered.length.toLocaleString('en-IN')})
              </span>
            </div>

            <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
              {!isCollapsed && externalSearch === undefined && (
                <div className="relative w-64 group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                  <input
                    placeholder="Search invoice, party or GSTIN..."
                    value={internalSearch}
                    onChange={(e) => setInternalSearch(e.target.value)}
                    className="w-full h-8 bg-white border border-slate-200 focus:border-indigo-500 rounded-lg pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all font-medium"
                  />
                </div>
              )}

              {!hideCollapseToggle && (
                <button
                  type="button"
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-all border cursor-pointer',
                    isCollapsed
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  )}
                >
                  {isCollapsed ? (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>Expand</span>
                    </>
                  ) : (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span>Collapse</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {!isCollapsed && tableBody}
        </div>
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
    </TooltipProvider>
  );
}
export default ResultsTable;
