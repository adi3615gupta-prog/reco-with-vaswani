import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  RotateCcw,
  Sparkles,
  ArrowRight,
  HelpCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';
import type { IfcCheckItem } from '@/lib/finStatements.types';
import {
  getClientSetup,
  getTrialBalance,
  getFixedAssets,
  getPartnersCapital,
} from '@/lib/finStatements.storage';
import { evaluateIfcChecks, type IfcDiagnosticsResult } from '@/lib/ifcChecksEngine';
import { computeMcaFinancialRatios } from '@/lib/mcaRatiosEngine';

export default function IfcChecksDashboard() {
  const [result, setResult] = useState<IfcDiagnosticsResult | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'COMPLIANCE' | 'FLAG_ONLY'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    runDiagnostics();
  }, []);

  const runDiagnostics = () => {
    const client = getClientSetup();
    const tb = getTrialBalance();
    const fa = getFixedAssets();
    const partners = getPartnersCapital();
    const ratiosRes = computeMcaFinancialRatios(tb, client.denomination || 'in_rupees');

    // Load saved aging & ratio reasons from localStorage
    let tpAging = [];
    let trAging = [];
    let cwipAging = [];
    try {
      const tpRaw = localStorage.getItem('fs_mca_tp_aging_v2');
      if (tpRaw) tpAging = JSON.parse(tpRaw);
      const trRaw = localStorage.getItem('fs_mca_tr_aging_v2');
      if (trRaw) trAging = JSON.parse(trRaw);
      const cwipRaw = localStorage.getItem('fs_mca_cwip_aging_v2');
      if (cwipRaw) cwipAging = JSON.parse(cwipRaw);
      const reasonsRaw = localStorage.getItem('fs_mca_ratio_reasons_v2');
      if (reasonsRaw) {
        const reasons = JSON.parse(reasonsRaw);
        ratiosRes.ratios = ratiosRes.ratios.map((r) => ({
          ...r,
          variance_reason: reasons[r.id] || '',
        }));
      }
    } catch (e) {
      console.warn('Failed to parse auxiliary disclosures', e);
    }

    const diagnostics = evaluateIfcChecks({
      tbEntries: tb,
      clientSetup: client,
      denomination: client.denomination || 'in_rupees',
      fixedAssets: fa,
      partnersCapital: partners,
      ratios: ratiosRes.ratios,
      tpAging,
      trAging,
      cwipAging,
    });

    setResult(diagnostics);
  };

  const filteredChecks = (result?.checks || []).filter((c) => {
    if (filterType === 'FLAG_ONLY' && c.status !== 'FLAG') return false;
    if (filterType !== 'ALL' && filterType !== 'FLAG_ONLY' && c.check_type !== filterType) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        c.check_name.toLowerCase().includes(q) ||
        c.detail.toLowerCase().includes(q) ||
        c.action_guidance.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            35+ Internal Financial Controls (IFC) Real-Time Audit Engine
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Preventive Verification Suite &bull; Schedule III MCA 2021 Rules &bull; ICAI June 2022 Technical Guide
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              runDiagnostics();
              toast.success('IFC Diagnostics re-evaluated!');
            }}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
            Re-run Checks
          </button>
        </div>
      </div>

      {/* Control Banner Summary */}
      {result && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-xl border border-white/5 bg-[rgba(15,23,42,0.55)] backdrop-blur-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Checks</span>
            <p className="text-xl font-black font-mono text-white mt-1">{result.checks.length}</p>
            <span className="text-[9px] text-slate-500 font-mono">100% Evaluated</span>
          </div>

          <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Passed</span>
            <p className="text-xl font-black font-mono text-emerald-400 mt-1">{result.passedCount}</p>
            <span className="text-[9px] text-emerald-500/80 font-mono">
              {Math.round((result.passedCount / result.checks.length) * 100)}% Pass Rate
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 backdrop-blur-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">Critical Blockers</span>
            <p className="text-xl font-black font-mono text-red-400 mt-1">{result.criticalFailedCount}</p>
            <span className="text-[9px] text-red-400/80 font-mono">
              {result.criticalFailedCount === 0 ? '✓ Zero Blockers' : 'Action Required'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 backdrop-blur-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Warnings</span>
            <p className="text-xl font-black font-mono text-amber-400 mt-1">{result.warningCount}</p>
            <span className="text-[9px] text-amber-400/80 font-mono">Regrouping Alerts</span>
          </div>

          <div className="p-3.5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 backdrop-blur-xl col-span-2 md:col-span-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Status</span>
            <p className="text-sm font-black font-mono mt-1">
              {result.isAllClear ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> ALL CLEAR
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> ACTION REQ.
                </span>
              )}
            </p>
            <span className="text-[9px] text-slate-400 font-mono">Audit Confidence</span>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === 'ALL'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white bg-slate-900/60'
            }`}
          >
            All ({result?.checks.length || 0})
          </button>
          <button
            onClick={() => setFilterType('FLAG_ONLY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === 'FLAG_ONLY'
                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                : 'text-slate-400 hover:text-white bg-slate-900/60'
            }`}
          >
            Flagged Only ({((result?.criticalFailedCount || 0) + (result?.warningCount || 0))})
          </button>
          <button
            onClick={() => setFilterType('CRITICAL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === 'CRITICAL'
                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                : 'text-slate-400 hover:text-white bg-slate-900/60'
            }`}
          >
            Critical
          </button>
          <button
            onClick={() => setFilterType('WARNING')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === 'WARNING'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-white bg-slate-900/60'
            }`}
          >
            Warnings
          </button>
          <button
            onClick={() => setFilterType('COMPLIANCE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === 'COMPLIANCE'
                ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                : 'text-slate-400 hover:text-white bg-slate-900/60'
            }`}
          >
            Compliance
          </button>
        </div>

        <div className="relative min-w-[240px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search 35+ checks..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs bg-slate-900/90 border border-slate-700/60 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Checks Table */}
      <div className="rounded-xl border border-white/5 bg-[rgba(15,23,42,0.55)] backdrop-blur-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-900/80 border-b border-white/5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                <th className="py-3 px-3 w-16 text-center">Ref</th>
                <th className="py-3 px-3 min-w-[240px]">Verification Rule</th>
                <th className="py-3 px-3 w-28 text-center">Severity</th>
                <th className="py-3 px-3 min-w-[280px]">Diagnostic Findings</th>
                <th className="py-3 px-3 text-right w-24">Difference</th>
                <th className="py-3 px-3 w-24 text-center">Status</th>
                <th className="py-3 px-3 min-w-[260px]">Remediation Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-300">
              {filteredChecks.map((c) => {
                const isPass = c.status === 'OK';
                return (
                  <tr
                    key={c.id}
                    className={`hover:bg-white/[0.02] transition-colors ${
                      !isPass ? (c.check_type === 'CRITICAL' ? 'bg-red-500/[0.04]' : 'bg-amber-500/[0.03]') : ''
                    }`}
                  >
                    <td className="py-3 px-3 text-center font-mono font-bold text-slate-400 text-[11px]">
                      {c.id}
                    </td>
                    <td className="py-3 px-3 font-bold text-white">
                      {c.check_name}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          c.check_type === 'CRITICAL'
                            ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                            : c.check_type === 'WARNING'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                        }`}
                      >
                        {c.check_type}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 text-[11px] leading-relaxed">
                      {c.detail}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold">
                      {c.cy_diff !== 0 ? (
                        <span className={c.cy_diff > 1 ? 'text-red-400' : 'text-slate-400'}>
                          ₹{c.cy_diff.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${
                          isPass
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-red-500/15 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {isPass ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {isPass ? 'PASS' : 'FLAG'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 text-[11px] leading-relaxed font-sans">
                      {c.action_guidance}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
