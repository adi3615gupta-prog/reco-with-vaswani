import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Building2, UserX } from 'lucide-react';
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
      <div className="dash-card py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-6 ring-1 ring-green-500/20">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">All GSTINs Verified</h3>
        <p className="text-slate-400 mb-8 max-w-md mx-auto">
          No duplicate or mismatched GSTINs were detected in your data. You are good to proceed.
        </p>
        <button onClick={onProceed} className="btn-np-primary">
          Proceed to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-500" />
            GSTIN Verification Required
          </h2>
          <p className="text-slate-400 mt-1">
            We found {totalIssues} potential issue{totalIssues === 1 ? '' : 's'} with GSTIN mappings. Please review these before generating the final report.
          </p>
        </div>
        <button onClick={onProceed} className="btn-np-primary whitespace-nowrap">
          I've Reviewed, Proceed
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {suggested.length > 0 && (
          <div className="dash-card overflow-hidden">
            <div className="dash-topbar bg-yellow-500/10 border-b border-yellow-500/20 justify-between">
              <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5" />
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
                  className="px-3 py-1 bg-green-500 text-white rounded text-xs font-bold uppercase tracking-wider hover:bg-green-600 transition-colors shadow-lg shadow-green-500/20"
                >
                  Apply All
                </button>
              )}
            </div>
            <div className="p-4 bg-yellow-500/5 text-sm text-yellow-200/80 border-b border-yellow-500/10">
              These parties in your books have a missing or incorrect GSTIN, but we found a match in GSTR-2B. We recommend updating your books with these suggested GSTINs. You can also manually edit them in the inputs below.
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-[10px] uppercase tracking-wider text-slate-400 bg-slate-900/50">
                  <tr>
                    <th className="px-4 py-3 font-bold border-b border-slate-800">Party Name (Books)</th>
                    <th className="px-4 py-3 font-bold border-b border-slate-800">Current GSTIN</th>
                    <th className="px-4 py-3 font-bold border-b border-slate-800">GSTIN to Apply (Govt Data/Editable)</th>
                    <th className="px-4 py-3 font-bold border-b border-slate-800">2B Party Name</th>
                    {onApply && <th className="px-4 py-3 font-bold border-b border-slate-800 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {suggested.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-200 font-medium">{s.supplierName}</td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {s.originalGstin || <span className="text-slate-500 italic">Missing</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-green-400 font-bold bg-green-500/5">
                        <input
                          type="text"
                          value={getGstinValue(s)}
                          onChange={(e) => setManualGstins({ ...manualGstins, [s.id]: e.target.value.toUpperCase() })}
                          className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-green-400 font-mono focus:border-green-500 outline-none w-48 uppercase"
                          placeholder="Enter GSTIN manually..."
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-300 italic">{s.suggestedName || 'Unknown'}</td>
                      {onApply && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => onApply(s.supplierName, getGstinValue(s))}
                            className="px-3 py-1 bg-green-500/10 text-green-400 hover:bg-green-500/20 rounded transition-colors text-xs font-bold uppercase tracking-wider"
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
          <div className="dash-card overflow-hidden">
            <div className="dash-topbar bg-red-500/10 border-b border-red-500/20">
              <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest flex items-center gap-2">
                <UserX className="w-3.5 h-3.5" />
                Duplicate GSTIN Conflicts ({conflicts.length})
              </span>
            </div>
            <div className="p-4 bg-red-500/5 text-sm text-red-200/80 border-b border-red-500/10">
              The following GSTINs are mapped to multiple different party names across your books and GSTR-2B. This may indicate a vendor merger, name change, or data entry error.
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-[10px] uppercase tracking-wider text-slate-400 bg-slate-900/50">
                  <tr>
                    <th className="px-4 py-3 font-bold border-b border-slate-800">GSTIN</th>
                    <th className="px-4 py-3 font-bold border-b border-slate-800">Conflicting Party Names Found</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {conflicts.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-red-400 font-medium">
                        {c.originalGstin}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <div className="flex flex-wrap gap-2">
                          {c.relatedParties?.map((p, i) => (
                            <span key={i} className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs">
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

      <div className="flex justify-end pt-4">
        <button onClick={onProceed} className="btn-np-primary text-sm px-8 py-3">
          Proceed to Dashboard →
        </button>
      </div>
    </div>
  );
}
