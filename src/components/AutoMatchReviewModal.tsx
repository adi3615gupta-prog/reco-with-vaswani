import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  Search,
  Building2,
  Brain,
  Trash2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import type { PartyInvoiceRow } from '@/lib/partyWise';
import type { ReconciliationResult } from '@/lib/reconciliation';
import {
  getLearnedDismatchesCount,
  clearLearnedDismatches,
  saveLearnedDismatch,
} from '@/lib/recoLearnedMatches';
import { toast } from 'sonner';

export interface AutoMatchPairCandidate {
  id: string;
  partyKey: string;
  partyName: string;
  gstin: string;
  prRow: PartyInvoiceRow;
  twoBRow: PartyInvoiceRow;
  prRaw: ReconciliationResult;
  twoBRaw: ReconciliationResult;
  matchReason: string;
  taxableDiff: number;
  gstDiff: number;
}

export interface AutoMatchReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: AutoMatchPairCandidate[];
  onApplyMatches: (selectedIds: Set<string>, rejectedCandidates: AutoMatchPairCandidate[]) => void;
}

const fmtCurrency = (val: number | undefined) =>
  val == null ? '₹0.00' : `₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const AutoMatchReviewModal: React.FC<AutoMatchReviewModalProps> = ({
  isOpen,
  onClose,
  candidates,
  onApplyMatches,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(candidates.map((c) => c.id)));
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const [learnedCount, setLearnedCount] = useState<number>(() => getLearnedDismatchesCount());

  // Re-initialize selection whenever candidates change
  React.useEffect(() => {
    setSelectedIds(new Set(candidates.map((c) => c.id)));
    setDismissedIds(new Set());
    setLearnedCount(getLearnedDismatchesCount());
  }, [candidates, isOpen]);

  const filteredCandidates = useMemo(() => {
    if (!search.trim()) return candidates;
    const q = search.toLowerCase();
    return candidates.filter(
      (c) =>
        c.partyName.toLowerCase().includes(q) ||
        c.gstin.toLowerCase().includes(q) ||
        (c.prRow.invoiceNoPR || '').toLowerCase().includes(q) ||
        (c.twoBRow.invoiceNo2B || '').toLowerCase().includes(q)
    );
  }, [candidates, search]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredCandidates.filter((c) => !dismissedIds.has(c.id)).map((c) => c.id);
    const allSelected = visibleIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleInstantDismatch = (cand: AutoMatchPairCandidate) => {
    // Save to learning memory immediately
    saveLearnedDismatch(cand.gstin, cand.prRow.invoiceNoPR || '', cand.twoBRow.invoiceNo2B || '', {
      partyName: cand.partyName,
      prTaxable: cand.prRow.taxablePR,
      twoBTaxable: cand.twoBRow.taxable2B,
      reason: 'User marked as incorrect match during review',
    });

    setDismissedIds((prev) => new Set(prev).add(cand.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(cand.id);
      return next;
    });
    setLearnedCount(getLearnedDismatchesCount());
    toast.warning(`Learned: #${cand.prRow.invoiceNoPR || 'PR'} and #${cand.twoBRow.invoiceNo2B || '2B'} will never be auto-matched again.`);
  };

  const handleClearMemory = () => {
    if (confirm('Clear all learned dis-match rules? System will treat previously rejected pairs as eligible again.')) {
      clearLearnedDismatches();
      setLearnedCount(0);
      toast.info('Learned dis-match memory cleared.');
    }
  };

  const handleConfirm = () => {
    const rejected = candidates.filter((c) => !selectedIds.has(c.id) || dismissedIds.has(c.id));
    onApplyMatches(selectedIds, rejected);
    onClose();
  };

  const selectedCount = candidates.filter((c) => selectedIds.has(c.id) && !dismissedIds.has(c.id)).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-slate-50 border border-slate-200/90 shadow-2xl rounded-3xl p-0 overflow-hidden flex flex-col text-slate-900">
        {/* Top Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-300">
                  Step-by-Step Verification
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-white/10 text-slate-300 border border-white/15">
                  Safe Review
                </span>
              </div>
              <DialogTitle className="text-lg font-black tracking-tight text-white mt-0.5">
                Review Auto-Match Suggested Pairs
              </DialogTitle>
            </div>
          </div>

          {/* Learning memory status badge */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-slate-200 text-xs font-semibold">
              <Brain className="w-4 h-4 text-amber-300" />
              <span>{learnedCount} Learned Rejections Active</span>
            </div>
            {learnedCount > 0 && (
              <button
                type="button"
                onClick={handleClearMemory}
                title="Reset learned dis-matches"
                className="p-1.5 rounded-lg bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-200 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter & Selection Bar */}
        <div className="bg-white px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by party, GSTIN, or invoice #..."
              className="w-full h-8 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:bg-white transition-all font-medium"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              Toggle Select All
            </button>
            <div className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
              Selected: <span className="text-indigo-600">{selectedCount}</span> / {candidates.length}
            </div>
          </div>
        </div>

        {/* Candidates List Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {filteredCandidates.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <AlertTriangle className="w-8 h-8 mx-auto text-amber-400 mb-2 opacity-75" />
              <p className="text-xs font-bold">No suggested pairs match your filter.</p>
            </div>
          ) : (
            filteredCandidates.map((cand) => {
              const isDismissed = dismissedIds.has(cand.id);
              const isChecked = selectedIds.has(cand.id) && !isDismissed;
              const prGst = (cand.prRow.igstPR || 0) + (cand.prRow.cgstPR || 0) + (cand.prRow.sgstPR || 0);
              const twoBGst = (cand.twoBRow.igst2B || 0) + (cand.twoBRow.cgst2B || 0) + (cand.twoBRow.sgst2B || 0);

              return (
                <div
                  key={cand.id}
                  className={`border rounded-2xl p-4 transition-all ${
                    isDismissed
                      ? 'bg-rose-50/50 border-rose-200 opacity-60'
                      : isChecked
                      ? 'bg-white border-indigo-200 shadow-xs'
                      : 'bg-slate-100/70 border-slate-200 opacity-75'
                  }`}
                >
                  {/* Card Header: Party & Actions */}
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        disabled={isDismissed}
                        checked={isChecked}
                        onChange={() => toggleSelect(cand.id)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        id={`cb-${cand.id}`}
                      />
                      <label htmlFor={`cb-${cand.id}`} className="cursor-pointer flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs font-black text-slate-800">{cand.partyName}</span>
                        <span className="font-mono text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {cand.gstin || 'NO GSTIN'}
                        </span>
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border-indigo-200">
                        {cand.matchReason}
                      </Badge>
                      {!isDismissed ? (
                        <button
                          type="button"
                          onClick={() => handleInstantDismatch(cand)}
                          title="Reject pair and teach system never to match these two invoices again"
                          className="text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Dis-match & Learn</span>
                        </button>
                      ) : (
                        <span className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                          <Brain className="w-3.5 h-3.5" /> Learned Rejection
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Side-by-Side Comparison Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs">
                    {/* Books (PR) Record */}
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Books (Purchase Register)
                      </div>
                      <div className="font-mono font-bold text-slate-900 text-sm">
                        #{cand.prRow.invoiceNoPR || '—'}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Date: {cand.prRow.datePR || '—'}</div>
                      <div className="mt-2 flex justify-between text-[11px] font-semibold">
                        <span className="text-slate-600">Taxable:</span>
                        <span className="text-slate-900">{fmtCurrency(cand.prRow.taxablePR)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] font-semibold">
                        <span className="text-slate-600">Total Tax:</span>
                        <span className="text-slate-900">{fmtCurrency(prGst)}</span>
                      </div>
                    </div>

                    {/* Arrow / Variance Indicator */}
                    <div className="flex flex-col items-center justify-center px-2 py-1">
                      <ArrowRight className="w-4 h-4 text-indigo-400 hidden md:block" />
                      <div className="text-[10px] font-bold text-slate-500 mt-1 text-center">
                        <div>Tax Diff: {fmtCurrency(cand.gstDiff)}</div>
                        <div>Base Diff: {fmtCurrency(cand.taxableDiff)}</div>
                      </div>
                    </div>

                    {/* Portal (2B) Record */}
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Portal (GSTR-2B)
                      </div>
                      <div className="font-mono font-bold text-slate-900 text-sm">
                        #{cand.twoBRow.invoiceNo2B || '—'}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Date: {cand.twoBRow.date2B || '—'}</div>
                      <div className="mt-2 flex justify-between text-[11px] font-semibold">
                        <span className="text-slate-600">Taxable:</span>
                        <span className="text-slate-900">{fmtCurrency(cand.twoBRow.taxable2B)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] font-semibold">
                        <span className="text-slate-600">Total Tax:</span>
                        <span className="text-slate-900">{fmtCurrency(twoBGst)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-white px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-4">
          <div className="text-xs text-slate-500">
            Unchecked pairs will be automatically recorded in the rejection memory so they are never suggested again.
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="text-xs font-bold rounded-xl h-9 px-4"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={selectedCount === 0}
              className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-9 px-5 flex items-center gap-1.5 shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Apply Selected Matches ({selectedCount})</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
