import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Building2,
  Check,
  ChevronRight,
  ChevronLeft,
  Zap,
  ListFilter,
  CheckCheck,
} from 'lucide-react';
import type { SmartMatchCandidate } from '@/lib/smartMismatchSolver';
import { cn } from '@/lib/utils';

export interface AiSmartMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: SmartMatchCandidate[];
  onApplyMatch: (candidate: SmartMatchCandidate) => void;
  onApplyAllHighConfidence: (candidates: SmartMatchCandidate[]) => void;
}

export const AiSmartMatchModal: React.FC<AiSmartMatchModalProps> = ({
  isOpen,
  onClose,
  candidates,
  onApplyMatch,
  onApplyAllHighConfidence,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset or initialize selection when candidates change
  React.useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      // Pre-select all high-confidence candidates (>= 88%)
      const preSelected = new Set(
        candidates.filter((c) => c.confidence >= 88).map((c) => c.id)
      );
      setSelectedIds(preSelected);
    }
  }, [isOpen, candidates]);

  if (!candidates || candidates.length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md bg-white border border-slate-200 shadow-2xl rounded-2xl p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto mb-3">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <DialogTitle className="text-base font-extrabold text-slate-900">
            AI Smart Match Solver
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-2">
            No probable unmatched pairs were detected with high confidence in the current selection.
          </p>
          <div className="mt-5">
            <Button
              onClick={onClose}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-5 py-2 rounded-xl"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const current = candidates[currentIndex] || candidates[0];
  const highConfidenceList = candidates.filter((c) => c.confidence >= 90);

  const handleNext = () => {
    if (currentIndex < candidates.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSingleConfirm = () => {
    if (!current) return;
    onApplyMatch(current);
    if (candidates.length <= 1) {
      onClose();
    } else if (currentIndex >= candidates.length - 1) {
      setCurrentIndex(Math.max(0, candidates.length - 2));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === candidates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(candidates.map((c) => c.id)));
    }
  };

  const handleBatchSelected = () => {
    const toApply = candidates.filter((c) => selectedIds.has(c.id));
    if (toApply.length > 0) {
      onApplyAllHighConfidence(toApply);
      onClose();
    }
  };

  const fmtCurrency = (n: number) =>
    (n || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl bg-slate-50 border border-slate-200/90 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] rounded-3xl p-0 overflow-hidden text-slate-900">
        {/* Modal Top Banner */}
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-amber-300 shadow-inner">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-indigo-200">
                  Autonomous Match Solver
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-400/20 text-amber-200 border border-amber-300/30">
                  100% Offline AI
                </span>
              </div>
              <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2 mt-0.5">
                AI Smart Mismatch Solver
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'card' ? 'table' : 'card')}
              className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 flex items-center gap-1.5 transition-all"
            >
              <ListFilter className="w-3.5 h-3.5" />
              {viewMode === 'card' ? 'Review All List' : 'Card View'}
            </button>
          </div>
        </div>

        {/* Counterparty Header Bar */}
        <div className="bg-white px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
              {current.partyName || 'Counterparty'}
            </span>
            <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
              {current.gstin || 'NO GSTIN'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500">
              Candidate{' '}
              <span className="text-indigo-600 font-black">
                {currentIndex + 1}
              </span>{' '}
              of {candidates.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentIndex === 0}
                onClick={handlePrev}
                className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                disabled={currentIndex >= candidates.length - 1}
                onClick={handleNext}
                className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="p-6">
          {viewMode === 'card' ? (
            <div className="space-y-5">
              {/* The Famous Prompt Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-300/80 shadow-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 flex-shrink-0">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-emerald-950 flex items-center gap-2">
                      <span>Ye {current.confidence}% wahi bill hai!</span>
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                        {current.matchGrade} CONFIDENCE
                      </span>
                    </h3>
                    <p className="text-xs text-emerald-800/90 mt-0.5 font-medium leading-relaxed">
                      {current.explanationHinglish}
                    </p>
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <div className="text-2xl font-black text-emerald-600 font-mono tracking-tight">
                    {current.confidence}%
                  </div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                    Confidence
                  </div>
                </div>
              </div>

              {/* Side-by-Side Invoices Comparison Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left: Books / Purchase Register (PR) */}
                <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:border-indigo-300 transition-all">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      In Your Books (PR / Tally)
                    </span>
                    <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-[10px] font-mono font-bold">
                      Books Record
                    </Badge>
                  </div>

                  <div className="space-y-3 font-mono">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans uppercase font-bold tracking-wider">
                        Invoice Number
                      </span>
                      <span className="text-base font-black text-sky-600">
                        #{current.metrics.prInvoiceNo || '—'}
                      </span>
                      {current.metrics.corePrInvoiceNo && (
                        <span className="ml-2 text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          Serial: #{current.metrics.corePrInvoiceNo}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans uppercase font-bold tracking-wider">
                          Date
                        </span>
                        <span className="font-bold text-slate-700 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {current.metrics.prDate || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans uppercase font-bold tracking-wider">
                          Taxable Value
                        </span>
                        <span className="font-bold text-slate-800">
                          ₹{fmtCurrency(current.metrics.prTaxable)}
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-500 block font-sans uppercase font-bold tracking-wider mb-0.5">
                        Total GST Amount (IGST+CGST+SGST)
                      </span>
                      <span className="text-sm font-black text-slate-900">
                        ₹{fmtCurrency(current.metrics.prTax)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: GSTR-2B Portal */}
                <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:border-purple-300 transition-all">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      On GST Portal (GSTR-2B)
                    </span>
                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] font-mono font-bold">
                      Portal 2B Record
                    </Badge>
                  </div>

                  <div className="space-y-3 font-mono">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans uppercase font-bold tracking-wider">
                        Invoice Number
                      </span>
                      <span className="text-base font-black text-purple-600">
                        #{current.metrics.twoBInvoiceNo || '—'}
                      </span>
                      {current.metrics.coreTwoBInvoiceNo && (
                        <span className="ml-2 text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          Serial: #{current.metrics.coreTwoBInvoiceNo}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans uppercase font-bold tracking-wider">
                          Date
                        </span>
                        <span className="font-bold text-slate-700 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {current.metrics.twoBDate || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans uppercase font-bold tracking-wider">
                          Taxable Value
                        </span>
                        <span className="font-bold text-slate-800">
                          ₹{fmtCurrency(current.metrics.twoBTaxable)}
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-500 block font-sans uppercase font-bold tracking-wider mb-0.5">
                        Total GST Amount (IGST+CGST+SGST)
                      </span>
                      <span className="text-sm font-black text-slate-900">
                        ₹{fmtCurrency(current.metrics.twoBTax)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Match Factors Breakdown */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                  Key Verification Signals
                </span>
                <div className="flex flex-wrap gap-2">
                  {current.reasons.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-semibold border border-emerald-200"
                    >
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span>{r}</span>
                    </div>
                  ))}
                  {current.metrics.taxDiff === 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 text-[11px] font-semibold border border-indigo-200">
                      <ShieldCheck className="w-3 h-3 text-indigo-600" />
                      <span>Zero Tax Discrepancy</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Table Review View */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  Select candidate pairs to match in bulk:
                </span>
                <button
                  onClick={toggleSelectAll}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                  {selectedIds.size === candidates.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="max-h-[380px] overflow-y-auto border border-slate-200 rounded-xl bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 sticky top-0">
                    <tr>
                      <th className="p-2 text-center w-8">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === candidates.length && candidates.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded accent-indigo-600 cursor-pointer"
                        />
                      </th>
                      <th className="p-2">Party</th>
                      <th className="p-2">Books (PR) Inv</th>
                      <th className="p-2">Portal (2B) Inv</th>
                      <th className="p-2 text-right">Tax (PR)</th>
                      <th className="p-2 text-right">Tax (2B)</th>
                      <th className="p-2 text-center">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {candidates.map((cand) => {
                      const isChecked = selectedIds.has(cand.id);
                      return (
                        <tr
                          key={cand.id}
                          onClick={() => toggleSelect(cand.id)}
                          className={cn(
                            'hover:bg-slate-50 cursor-pointer transition-colors',
                            isChecked && 'bg-indigo-50/60'
                          )}
                        >
                          <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelect(cand.id)}
                              className="rounded accent-indigo-600 cursor-pointer"
                            />
                          </td>
                          <td className="p-2 font-sans font-bold text-slate-800 truncate max-w-[150px]">
                            {cand.partyName}
                          </td>
                          <td className="p-2 text-sky-600 font-bold">
                            #{cand.metrics.prInvoiceNo}
                          </td>
                          <td className="p-2 text-purple-600 font-bold">
                            #{cand.metrics.twoBInvoiceNo}
                          </td>
                          <td className="p-2 text-right">
                            ₹{fmtCurrency(cand.metrics.prTax)}
                          </td>
                          <td className="p-2 text-right">
                            ₹{fmtCurrency(cand.metrics.twoBTax)}
                          </td>
                          <td className="p-2 text-center">
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[10px] font-black',
                                cand.confidence >= 90
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              )}
                            >
                              {cand.confidence}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="bg-slate-100 px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="border-slate-300 text-slate-700 hover:bg-slate-200 text-xs font-bold rounded-xl"
            >
              Cancel / Close
            </Button>

            {highConfidenceList.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  onApplyAllHighConfidence(highConfidenceList);
                  onClose();
                }}
                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-2xs"
              >
                <Zap className="w-3.5 h-3.5 text-indigo-600" />
                Match All &gt;90% Confident ({highConfidenceList.length})
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {viewMode === 'card' ? (
              <>
                {candidates.length > 1 && (
                  <Button
                    variant="ghost"
                    onClick={handleNext}
                    className="text-slate-600 hover:text-slate-900 text-xs font-bold"
                  >
                    Skip to Next ⏭️
                  </Button>
                )}
                <Button
                  onClick={handleSingleConfirm}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-emerald-600/25 flex items-center gap-2 transition-all hover:scale-[1.02]"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  Haan, Match Kar Do
                </Button>
              </>
            ) : (
              <Button
                disabled={selectedIds.size === 0}
                onClick={handleBatchSelected}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-emerald-600/25 flex items-center gap-2 disabled:opacity-40"
              >
                <CheckCheck className="w-4 h-4" />
                Apply Selected ({selectedIds.size}) Matches
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

