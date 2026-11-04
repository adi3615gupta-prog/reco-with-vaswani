import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Building2, UserX, ArrowRight, ShieldCheck } from 'lucide-react';
import type { GstinIssue } from '@/lib/reconciliation';

interface GSTVerificationProps {
  issues: { suggested: GstinIssue[]; conflicts: GstinIssue[] };
  onApply?: (partyName: string, gstin: string) => void;
  onApplyAll?: (updates: Record<string, string>) => void;
  onProceed: () => void;
}

export function GSTVerification({ issues, onApply, onApplyAll, onProceed }: GSTVerificationProps) {
  const { suggested, conflicts } = issues;
  const totalIssues = suggested.length + conflicts.length;

  const [manualGstins, setManualGstins] = useState<Record<string, string>>({});

  const getGstinValue = (s: GstinIssue) => {
    if (manualGstins[s.id] !== undefined) return manualGstins[s.id];
    return s.suggestedGstin || '';
  };

  if (totalIssues === 0) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs py-20 px-6 text-center max-w-xl mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center mx-auto mb-5 text-emerald-600 shadow-2xs">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h3 className="text-2xl font-extrabold text-slate-900 mb-2">All GSTINs Verified</h3>
        <p className="text-slate-600 mb-8 text-sm leading-relaxed">
          No duplicate or mismatched GSTINs were detected in your data. You are ready to proceed to the reconciliation dashboard.
        </p>
        <button
          onClick={onProceed}
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-xs hover:shadow-md transition-all"
        >
          <span>Proceed to Dashboard</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/80 text-amber-700 text-[10px] font-bold uppercase tracking-wider mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Audit Pre-Check</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            GSTIN Verification Required
          </h2>
          <p className="text-slate-600 text-xs sm:text-sm mt-1">
            Found {totalIssues} potential issue{totalIssues === 1 ? '' : 's'} with GSTIN mappings. Review and correct them before generating final returns.
          </p>
        </div>
        <button
          onClick={onProceed}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-xs hover:shadow-md transition-all whitespace-nowrap shrink-0"
        >
          <span>Review Finished, Proceed</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {suggested.length > 0 && (
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 bg-amber-50/60 border-b border-amber-200/60 flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-600" />
                Missing or Mismatched GSTINs ({suggested.length})
              </span>
              {onApplyAll && (
                <button
                  onClick={() => {
                    const updates: Record<string, string> = {};
                    suggested.forEach((s) => {
                      updates[s.supplierName] = getGstinValue(s);
                    });
                    onApplyAll(updates);
                  }}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-2xs transition-all flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Apply All Suggestions</span>
                </button>
              )}
            </div>
            <div className="p-4 bg-amber-50/30 text-xs text-amber-900 border-b border-amber-100">
              These parties in your books have a missing or incorrect GSTIN, but matching records were found in GSTR-2B. You can accept the suggested GSTIN or edit them directly below.
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[10px] uppercase tracking-wider text-slate-600 bg-slate-50 border-b border-slate-200 font-bold">
                  <tr>
                    <th className="px-4 py-3">Party Name (Books)</th>
                    <th className="px-4 py-3">Current GSTIN</th>
                    <th className="px-4 py-3">GSTIN to Apply (Govt Data/Editable)</th>
                    <th className="px-4 py-3">2B Party Name</th>
                    {onApply && <th className="px-4 py-3 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {suggested.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 text-slate-900 font-bold">{s.supplierName}</td>
                      <td className="px-4 py-3 font-mono text-slate-500">
                        {s.originalGstin || <span className="text-rose-500 font-semibold italic">Missing</span>}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <input
                          type="text"
                          value={getGstinValue(s)}
                          onChange={(e) => setManualGstins({ ...manualGstins, [s.id]: e.target.value.toUpperCase() })}
                          className="bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 focus:border-indigo-500 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-mono font-bold outline-none w-48 uppercase shadow-2xs"
                          placeholder="Enter GSTIN manually..."
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-medium">{s.suggestedName || '—'}</td>
                      {onApply && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => onApply(s.supplierName, getGstinValue(s))}
                            className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg transition-colors text-xs font-bold uppercase tracking-wider"
                          >
                            Apply
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {conflicts.length > 0 && (
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 bg-rose-50/60 border-b border-rose-200/60">
              <span className="text-xs font-bold text-rose-900 uppercase tracking-wider flex items-center gap-2">
                <UserX className="w-4 h-4 text-rose-600" />
                Duplicate GSTIN Conflicts ({conflicts.length})
              </span>
            </div>
            <div className="p-4 bg-rose-50/30 text-xs text-rose-900 border-b border-rose-100">
              The following GSTINs are mapped to multiple different party names across your books and GSTR-2B. This may indicate a vendor merger, name change, or data entry error.
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[10px] uppercase tracking-wider text-slate-600 bg-slate-50 border-b border-slate-200 font-bold">
                  <tr>
                    <th className="px-4 py-3">GSTIN</th>
                    <th className="px-4 py-3">Conflicting Party Names Found</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {conflicts.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-mono text-rose-600 font-bold">
                        {c.originalGstin}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {c.relatedParties?.map((p, i) => (
                            <span key={i} className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800">
                              {p}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={onProceed}
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-xs hover:shadow-md transition-all"
        >
          <span>Proceed to Dashboard</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
