import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  GitMerge,
  Info,
  Search,
  ShieldCheck,
  Sparkles,
  UserX,
} from 'lucide-react';
import type { GstinIssue } from '@/lib/reconciliation';
import { cn } from '@/lib/utils';

export interface AppliedGstinLogItem {
  partyName: string;
  originalGstin: string;
  appliedGstin: string;
  status: string;
}

interface GSTVerificationProps {
  issues: { suggested: GstinIssue[]; conflicts: GstinIssue[] };
  onApply?: (partyName: string, gstin: string) => void;
  onApplyAll?: (updates: Record<string, string>) => void;
  onProceed: () => void;
  onBack?: () => void;
  appliedGstins?: AppliedGstinLogItem[];
  totalRecords?: number;
  uniqueGstinsCount?: number;
  hasResults?: boolean;
  mode?: 'input' | 'output' | null;
}

type IssueFilter = 'all' | 'missing' | 'wrong' | 'conflicts';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function isValidGstinFormat(value: string): boolean {
  return GSTIN_REGEX.test(value.trim().toUpperCase());
}

function getPan(gstin?: string): string {
  const clean = (gstin || '').trim().toUpperCase();
  return clean.length >= 12 ? clean.slice(2, 12) : '';
}

export function GSTVerification({
  issues,
  onApply,
  onApplyAll,
  onProceed,
  onBack,
  appliedGstins = [],
  totalRecords,
  uniqueGstinsCount,
  hasResults = true,
  mode = 'input',
}: GSTVerificationProps) {
  const { suggested, conflicts } = issues;
  const totalIssues = suggested.length + conflicts.length;

  const [manualGstins, setManualGstins] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<IssueFilter>('all');

  const getGstinValue = (s: GstinIssue) => {
    if (manualGstins[s.id] !== undefined) return manualGstins[s.id];
    return s.suggestedGstin || '';
  };

  const missingCount = useMemo(
    () => suggested.filter((s) => s.issueType === 'Missing GSTIN' || !s.originalGstin).length,
    [suggested]
  );
  const wrongCount = suggested.length - missingCount;

  const filteredSuggested = useMemo(() => {
    if (filter === 'conflicts') return [];
    const q = search.trim().toLowerCase();
    return suggested.filter((s) => {
      const isMissing = s.issueType === 'Missing GSTIN' || !s.originalGstin;
      if (filter === 'missing' && !isMissing) return false;
      if (filter === 'wrong' && isMissing) return false;
      if (!q) return true;
      return (
        s.supplierName.toLowerCase().includes(q) ||
        (s.suggestedName || '').toLowerCase().includes(q) ||
        (s.originalGstin || '').toLowerCase().includes(q) ||
        getGstinValue(s).toLowerCase().includes(q)
      );
    });
  }, [suggested, filter, search, manualGstins]);

  const filteredConflicts = useMemo(() => {
    if (filter === 'missing' || filter === 'wrong') return [];
    const q = search.trim().toLowerCase();
    return conflicts.filter((c) => {
      if (!q) return true;
      return (
        (c.originalGstin || '').toLowerCase().includes(q) ||
        c.supplierName.toLowerCase().includes(q) ||
        (c.relatedParties || []).some((p) => p.toLowerCase().includes(q))
      );
    });
  }, [conflicts, filter, search]);

  const portalSideLabel = mode === 'output' ? 'Portal GSTR-1' : 'Portal GSTR-2B';

  // State 0: User jumped to Step 3 directly before executing Step 2
  if (!hasResults) {
    return (
      <div className="w-full max-w-[1560px] mx-auto px-2 sm:px-4 pt-4 pb-8 silk-reveal">
        <div className="bg-white border border-slate-200/80 rounded-3xl p-8 sm:p-10 shadow-xs max-w-2xl mx-auto text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-bold uppercase tracking-widest">
              Step 3 · Pre-Dashboard Gate
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Run Match Engine First to Verify GSTINs
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              Step 3 inspects your reconciled records for missing GSTINs, cross-state branch mismatches, and duplicate party ledgers before opening the Dashboard.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-1">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-xs transition-all cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Go to Step 2: Pipeline</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // State 1: Zero pending issues — Clean Verification Summary
  if (totalIssues === 0) {
    return (
      <div className="w-full max-w-[1560px] mx-auto px-2 sm:px-4 pt-4 pb-6 space-y-6 silk-reveal">
        {/* Clean Hero Verification Banner */}
        <div className="bg-white border border-emerald-200/80 rounded-3xl p-6 sm:p-8 shadow-xs relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500" />
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0 shadow-2xs">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold uppercase tracking-widest">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verification Clean · 100% Validated
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  All Party GSTINs &amp; State Mappings Verified
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
                  Every supplier GSTIN, 10-character PAN root, and ledger mapping passed pre-dashboard checks. Your reconciliation data is ready for executive reporting and Excel export.
                </p>
              </div>
            </div>

            {(totalRecords !== undefined || appliedGstins.length > 0) && (
              <div className="flex items-center gap-3 shrink-0 flex-wrap">
                {totalRecords !== undefined && (
                  <div className="px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-left">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono">Records Checked</div>
                    <div className="text-lg font-black font-mono text-slate-900">{totalRecords.toLocaleString('en-IN')}</div>
                  </div>
                )}
                {uniqueGstinsCount !== undefined && (
                  <div className="px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-left">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono">Unique GSTINs</div>
                    <div className="text-lg font-black font-mono text-slate-900">{uniqueGstinsCount.toLocaleString('en-IN')}</div>
                  </div>
                )}
                {appliedGstins.length > 0 && (
                  <div className="px-4 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-left">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 font-mono">Fixes Applied</div>
                    <div className="text-lg font-black font-mono text-emerald-700">{appliedGstins.length}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3-Pillar Hygiene Confirmation Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100">
            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">1. GSTIN Presence &amp; Format</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Passed</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                No missing Books GSTINs matched against {portalSideLabel} entries remain unresolved.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">2. PAN &amp; State Code Check</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Passed</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                No cross-state branch GSTIN discrepancies detected between Books and {portalSideLabel}.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">3. Ledger Uniqueness</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Passed</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Zero duplicate GSTINs split across conflicting supplier names in your Books register.
              </p>
            </div>
          </div>
        </div>

        {/* Previously Applied Corrections Log */}
        {appliedGstins.length > 0 && (
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-700 font-mono flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Applied GSTIN Corrections ({appliedGstins.length})
              </span>
              <span className="text-[11px] text-slate-500 font-medium">Saved into active session</span>
            </div>
            <div className="overflow-x-auto max-h-60">
              <table className="w-full text-xs text-left">
                <thead className="text-[10px] uppercase tracking-wider text-slate-600 bg-slate-50 border-b border-slate-200 font-bold">
                  <tr>
                    <th className="px-4 py-2.5">Party Name</th>
                    <th className="px-4 py-2.5">Previous GSTIN</th>
                    <th className="px-4 py-2.5">Applied GSTIN</th>
                    <th className="px-4 py-2.5 text-right">Issue Resolved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {appliedGstins.map((item, i) => (
                    <tr key={`${item.partyName}-${i}`} className="hover:bg-slate-50/80">
                      <td className="px-4 py-2.5 font-bold text-slate-900">{item.partyName}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-500">{item.originalGstin || 'Missing'}</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-emerald-700">{item.appliedGstin}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Sticky Bottom Navigation Bar (Consistent with Step 2 Pipeline) */}
        <div className="sticky bottom-0 z-20 bg-white/95 backdrop-blur border border-slate-200/80 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-md">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-4 h-11 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Pipeline
            </button>
          ) : (
            <div />
          )}

          <div className="flex-1 max-w-md space-y-1.5 hidden sm:block">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest font-mono">
              <span className="text-slate-500">Verification Gate</span>
              <span className="text-emerald-600">100% Clean · Ready</span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              <div className="h-full w-full bg-emerald-500 rounded-full" />
            </div>
          </div>

          <button
            type="button"
            onClick={onProceed}
            className="h-11 px-7 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs uppercase tracking-widest font-bold gap-2 flex items-center transition-all shadow-xs cursor-pointer"
          >
            <span>Proceed to Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // State 2: Active Verification Workspace when suggested fixes or conflicts exist
  const totalFixed = appliedGstins.length;
  const progressPct = totalFixed + suggested.length > 0
    ? Math.round((totalFixed / (totalFixed + suggested.length)) * 100)
    : 100;

  return (
    <div className="w-full max-w-[1560px] mx-auto px-2 sm:px-4 pt-4 pb-6 space-y-6 silk-reveal">
      {/* Top Understanding Header & Quick Telemetry */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/80 text-amber-800 text-[10px] font-bold uppercase tracking-widest">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Step 3 · Pre-Dashboard GSTIN Hygiene Check</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Review &amp; Resolve GSTIN Discrepancies
            </h2>
            <p className="text-slate-600 text-xs sm:text-sm max-w-3xl leading-relaxed">
              We detected <strong className="text-slate-900">{totalIssues} potential GSTIN {totalIssues === 1 ? 'issue' : 'issues'}</strong> between your Books and {portalSideLabel}. Fixing missing or wrong-state GSTINs here keeps vendor totals unified in your Dashboard.
            </p>
          </div>

          {/* Summary Telemetry Tiles */}
          <div className="grid grid-cols-3 gap-2.5 shrink-0">
            <div className="px-3.5 py-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 font-mono">To Fix</div>
              <div className="text-xl font-black font-mono text-amber-900 leading-tight mt-0.5">{suggested.length}</div>
            </div>
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-50/70 border border-rose-200/80">
              <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700 font-mono">Conflicts</div>
              <div className="text-xl font-black font-mono text-rose-900 leading-tight mt-0.5">{conflicts.length}</div>
            </div>
            <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 font-mono">Applied</div>
              <div className="text-xl font-black font-mono text-emerald-900 leading-tight mt-0.5">{appliedGstins.length}</div>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              { key: 'all', label: 'All Issues', count: totalIssues },
              { key: 'missing', label: 'Missing GSTIN', count: missingCount },
              { key: 'wrong', label: 'Wrong / Branch GSTIN', count: wrongCount },
              { key: 'conflicts', label: 'Duplicate Conflicts', count: conflicts.length },
            ] as const).map((tab) => {
              const active = filter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer',
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                  )}
                >
                  <span>{tab.label}</span>
                  <span className={cn(
                    'px-1.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums',
                    active ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-700'
                  )}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search party or GSTIN..."
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* Main Master-Detail Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        {/* Left: Actionable Verification Queues */}
        <div className="min-w-0 space-y-6">
          {filteredSuggested.length > 0 && (
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
              <div className="px-5 py-3.5 bg-amber-50/70 border-b border-amber-200/70 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <span className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-amber-600" />
                    Missing or Mismatched GSTINs ({filteredSuggested.length})
                  </span>
                  <p className="text-[11px] text-amber-800/90 mt-0.5">
                    Matched by party name or PAN against {portalSideLabel}. Edit or accept the suggested 15-digit GSTIN below.
                  </p>
                </div>
                {onApplyAll && suggested.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const updates: Record<string, string> = {};
                      suggested.forEach((s) => {
                        const val = getGstinValue(s).trim().toUpperCase();
                        updates[s.id] = val;
                        updates[s.supplierName] = val;
                      });
                      onApplyAll(updates);
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Apply All Suggestions ({suggested.length})</span>
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-[10px] uppercase tracking-wider text-slate-600 bg-slate-50 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="px-4 py-3">Issue &amp; Party (Books)</th>
                      <th className="px-4 py-3">Current Books GSTIN</th>
                      <th className="px-4 py-3">GSTIN to Apply (Editable)</th>
                      <th className="px-4 py-3">{portalSideLabel} Counterparty</th>
                      {onApply && <th className="px-4 py-3 text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSuggested.map((s) => {
                      const val = getGstinValue(s).trim().toUpperCase();
                      const validFormat = val.length > 0 && isValidGstinFormat(val);
                      const isMissing = s.issueType === 'Missing GSTIN' || !s.originalGstin;
                      const panOrig = getPan(s.originalGstin);
                      const panTarget = getPan(val);
                      const samePan = Boolean(panOrig && panTarget && panOrig === panTarget);

                      return (
                        <tr key={s.id} className="hover:bg-slate-50/80 transition-colors align-top">
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-slate-900">{s.supplierName}</div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              <span
                                className={cn(
                                  'px-2 py-0.5 rounded-full text-[10px] font-bold border',
                                  isMissing
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                                )}
                              >
                                {isMissing ? 'Missing GSTIN' : 'Wrong / Branch GSTIN'}
                              </span>
                              {samePan && s.originalGstin && val && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Same PAN · State {s.originalGstin.slice(0, 2)} → {val.slice(0, 2)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 font-mono">
                            {s.originalGstin ? (
                              <span className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-semibold">
                                {s.originalGstin}
                              </span>
                            ) : (
                              <span className="px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 font-semibold italic">
                                Missing
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 font-mono">
                            <div className="space-y-1">
                              <input
                                type="text"
                                maxLength={15}
                                value={getGstinValue(s)}
                                onChange={(e) => setManualGstins({ ...manualGstins, [s.id]: e.target.value.toUpperCase() })}
                                className={cn(
                                  'bg-slate-50 hover:bg-white focus:bg-white border rounded-xl px-3 py-1.5 text-xs text-slate-900 font-mono font-bold outline-none w-48 uppercase shadow-2xs transition-colors',
                                  validFormat
                                    ? 'border-emerald-400 focus:border-emerald-500'
                                    : 'border-slate-300 focus:border-indigo-500'
                                )}
                                placeholder="Enter 15-char GSTIN..."
                              />
                              <div className="text-[10px] font-sans font-semibold">
                                {validFormat ? (
                                  <span className="text-emerald-700 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Valid 15-char GSTIN (State {val.slice(0, 2)})
                                  </span>
                                ) : val.length > 0 ? (
                                  <span className="text-amber-700">Check 15-character GSTIN format</span>
                                ) : (
                                  <span className="text-slate-400">Awaiting GSTIN</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="text-slate-700 font-semibold">{s.suggestedName || '—'}</div>
                            {s.suggestedGstin && (
                              <div className="text-[11px] font-mono text-slate-500 mt-0.5">Portal: {s.suggestedGstin}</div>
                            )}
                          </td>
                          {onApply && (
                            <td className="px-4 py-3.5 text-right">
                              <button
                                type="button"
                                disabled={!val}
                                onClick={() => onApply(s.supplierName, val)}
                                className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-indigo-600 disabled:opacity-40 rounded-xl transition-all text-xs font-bold uppercase tracking-wider cursor-pointer"
                              >
                                Apply
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {filteredConflicts.length > 0 && (
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
              <div className="px-5 py-3.5 bg-rose-50/70 border-b border-rose-200/70 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-rose-950 uppercase tracking-wider flex items-center gap-2">
                    <UserX className="w-4 h-4 text-rose-600" />
                    Duplicate GSTIN Conflicts ({filteredConflicts.length})
                  </span>
                  <p className="text-[11px] text-rose-800/90 mt-0.5">
                    Same GSTIN appears under multiple ledger names in your Books. Use <strong>By GSTIN</strong> or <strong>Merge Parties</strong> in Step 4 Party Studio to consolidate them.
                  </p>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {filteredConflicts.map((c) => (
                  <div key={c.id} className="p-4 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 font-mono text-xs font-bold text-rose-700">
                          {c.originalGstin}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                          PAN {getPan(c.originalGstin) || '—'} · {(c.relatedParties || []).length} Ledger Names
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {c.relatedParties?.map((p, i) => (
                          <span key={i} className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-3 py-1.5 rounded-xl shrink-0">
                      <GitMerge className="w-3.5 h-3.5" />
                      Auto-groups by GSTIN in Dashboard
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredSuggested.length === 0 && filteredConflicts.length === 0 && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-10 text-center space-y-2 shadow-xs">
              <Search className="w-7 h-7 text-slate-400 mx-auto" />
              <h3 className="text-sm font-bold text-slate-900">No Matching Issues</h3>
              <p className="text-xs text-slate-500">Adjust your search query or switch the issue filter tab above.</p>
            </div>
          )}
        </div>

        {/* Right Sticky Guide & Applied Corrections Rail */}
        <aside className="space-y-4 lg:sticky lg:top-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-3">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
              <Info className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">How Step 3 Helps You</h3>
            </div>
            <ul className="space-y-2.5 text-xs text-slate-600 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                <span><strong className="text-slate-900">Apply Fixes:</strong> Updates missing or branch GSTINs on your Books rows in-memory immediately.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                <span><strong className="text-slate-900">Resolve Conflicts Later:</strong> Duplicate ledger names sharing one GSTIN can be merged inside Step 4 Party Studio.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                <span><strong className="text-slate-900">Non-Blocking Gate:</strong> You can proceed to Step 4 Dashboard anytime, even if you prefer reviewing conflicts later.</span>
              </li>
            </ul>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-700 font-mono">
                Applied Corrections Log
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold font-mono">
                {appliedGstins.length}
              </span>
            </div>
            {appliedGstins.length > 0 ? (
              <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                {appliedGstins.map((item, idx) => (
                  <div key={`${item.partyName}-${idx}`} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1">
                    <div className="font-bold text-slate-900 truncate" title={item.partyName}>{item.partyName}</div>
                    <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                      <span className="text-slate-500 truncate">{item.originalGstin || 'Missing'}</span>
                      <span className="text-slate-400">→</span>
                      <span className="text-emerald-700 font-bold">{item.appliedGstin}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-xs text-slate-500 text-center">
                No fixes applied yet. Click <strong>Apply</strong> on any row to record a fix here.
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Sticky Execution Bar (Consistent with Step 2 Pipeline) */}
      <div className="sticky bottom-0 z-20 bg-white/95 backdrop-blur border border-slate-200/80 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-md">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-4 h-11 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Pipeline
          </button>
        ) : (
          <div />
        )}

        <div className="flex-1 max-w-md space-y-1.5 hidden sm:block">
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest font-mono">
            <span className="text-slate-500">Verification Progress</span>
            <span className={suggested.length === 0 ? 'text-emerald-600' : 'text-amber-600'}>
              {totalFixed} applied · {suggested.length} pending
            </span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                suggested.length === 0 ? 'bg-emerald-500' : 'bg-amber-400'
              )}
              style={{ width: `${Math.max(progressPct, 6)}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onProceed}
          className="h-11 px-7 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs uppercase tracking-widest font-bold gap-2 flex items-center transition-all shadow-xs cursor-pointer"
        >
          <span>{suggested.length === 0 ? 'Proceed to Dashboard' : 'Skip / Proceed to Dashboard'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
