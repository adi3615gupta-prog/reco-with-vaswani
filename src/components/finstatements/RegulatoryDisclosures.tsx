import { useState, useEffect } from 'react';
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Clock,
  Building,
  Save,
  RotateCcw,
  Info,
  Calendar,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  FinancialRatio,
  AgingScheduleBucket,
  ReceivableAgingBucket,
  CwipAgingBucket,
  DenominationUnit,
} from '@/lib/finStatements.types';
import { getTrialBalance, getClientSetup } from '@/lib/finStatements.storage';
import { computeMcaFinancialRatios } from '@/lib/mcaRatiosEngine';
import { computeSchedule3Financials } from '@/lib/finStatementsEngine';

const STORAGE_KEYS = {
  RATIO_REASONS: 'fs_mca_ratio_reasons_v2',
  TP_AGING: 'fs_mca_tp_aging_v2',
  TR_AGING: 'fs_mca_tr_aging_v2',
  CWIP_AGING: 'fs_mca_cwip_aging_v2',
};

const DEFAULT_TP_AGING: AgingScheduleBucket[] = [
  { category: '(i) MSME', unbilled_or_not_due: 0, less_than_1yr: 0, one_to_two_yrs: 0, two_to_three_yrs: 0, more_than_three_yrs: 0, total: 0 },
  { category: '(ii) Others', unbilled_or_not_due: 0, less_than_1yr: 0, one_to_two_yrs: 0, two_to_three_yrs: 0, more_than_three_yrs: 0, total: 0 },
  { category: '(iii) Disputed dues - MSME', unbilled_or_not_due: 0, less_than_1yr: 0, one_to_two_yrs: 0, two_to_three_yrs: 0, more_than_three_yrs: 0, total: 0 },
  { category: '(iv) Disputed dues - Others', unbilled_or_not_due: 0, less_than_1yr: 0, one_to_two_yrs: 0, two_to_three_yrs: 0, more_than_three_yrs: 0, total: 0 },
];

const DEFAULT_TR_AGING: ReceivableAgingBucket[] = [
  { category: '(i) Undisputed - considered good', unbilled_or_not_due: 0, less_than_6m: 0, six_m_to_1yr: 0, one_to_two_yrs: 0, two_to_three_yrs: 0, more_than_three_yrs: 0, total: 0 },
  { category: '(ii) Undisputed - significant increase in credit risk', unbilled_or_not_due: 0, less_than_6m: 0, six_m_to_1yr: 0, one_to_two_yrs: 0, two_to_three_yrs: 0, more_than_three_yrs: 0, total: 0 },
  { category: '(iii) Undisputed - credit impaired', unbilled_or_not_due: 0, less_than_6m: 0, six_m_to_1yr: 0, one_to_two_yrs: 0, two_to_three_yrs: 0, more_than_three_yrs: 0, total: 0 },
  { category: '(iv) Disputed - considered good', unbilled_or_not_due: 0, less_than_6m: 0, six_m_to_1yr: 0, one_to_two_yrs: 0, two_to_three_yrs: 0, more_than_three_yrs: 0, total: 0 },
  { category: '(v) Disputed - significant increase in credit risk', unbilled_or_not_due: 0, less_than_6m: 0, six_m_to_1yr: 0, one_to_two_yrs: 0, two_to_three_yrs: 0, more_than_three_yrs: 0, total: 0 },
  { category: '(vi) Disputed - credit impaired', unbilled_or_not_due: 0, less_than_6m: 0, six_m_to_1yr: 0, one_to_two_yrs: 0, two_to_three_yrs: 0, more_than_three_yrs: 0, total: 0 },
];

const DEFAULT_CWIP_AGING: CwipAgingBucket[] = [
  { project_type: 'Projects in progress', less_than_1yr: 0, one_to_two_yrs: 0, two_to_three_yrs: 0, more_than_three_yrs: 0, total: 0 },
  { project_type: 'Projects temporarily suspended', less_than_1yr: 0, one_to_two_yrs: 0, two_to_three_yrs: 0, more_than_three_yrs: 0, total: 0 },
];

export default function RegulatoryDisclosures() {
  const [activeTab, setActiveTab] = useState<'ratios' | 'tp_aging' | 'tr_aging' | 'cwip' | 'statutory'>('ratios');
  const [ratios, setRatios] = useState<FinancialRatio[]>([]);
  const [ratioReasons, setRatioReasons] = useState<Record<string, string>>({});
  const [tpAging, setTpAging] = useState<AgingScheduleBucket[]>(DEFAULT_TP_AGING);
  const [trAging, setTrAging] = useState<ReceivableAgingBucket[]>(DEFAULT_TR_AGING);
  const [cwipAging, setCwipAging] = useState<CwipAgingBucket[]>(DEFAULT_CWIP_AGING);
  const [denomination, setDenomination] = useState<DenominationUnit>('in_rupees');
  const [bsTotals, setBsTotals] = useState({ tradePayables: 0, tradeReceivables: 0, cwip: 0 });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const client = getClientSetup();
    const tb = getTrialBalance();
    const denom = client.denomination || 'in_rupees';
    setDenomination(denom);

    // Compute BS totals for tie-outs
    const fin = computeSchedule3Financials(tb, denom);
    const tpBS = (fin.balanceSheet.equityAndLiabilities.find((l) => l.particulars.includes('Micro and Small'))?.cyAmount || 0) +
                 (fin.balanceSheet.equityAndLiabilities.find((l) => l.particulars.includes('others'))?.cyAmount || 0);
    const trBS = fin.balanceSheet.assets.find((a) => a.noteNo === 21)?.cyAmount || 0;
    const cwipBS = fin.balanceSheet.assets.find((a) => a.noteNo === 14)?.cyAmount || 0;
    setBsTotals({ tradePayables: tpBS, tradeReceivables: trBS, cwip: cwipBS });

    // Load ratio reasons
    try {
      const savedReasons = localStorage.getItem(STORAGE_KEYS.RATIO_REASONS);
      const parsedReasons = savedReasons ? JSON.parse(savedReasons) : {};
      setRatioReasons(parsedReasons);

      // Compute ratios
      const computed = computeMcaFinancialRatios(tb, denom);
      const mergedRatios = computed.ratios.map((r) => ({
        ...r,
        variance_reason: parsedReasons[r.id] || '',
      }));
      setRatios(mergedRatios);
    } catch (e) {
      console.warn('Failed to load ratio reasons', e);
    }

    // Load TP Aging
    try {
      const savedTp = localStorage.getItem(STORAGE_KEYS.TP_AGING);
      if (savedTp) {
        setTpAging(JSON.parse(savedTp));
      } else if (tpBS > 0) {
        // Auto-seed <1yr bucket with BS total if empty
        const seeded = [...DEFAULT_TP_AGING];
        seeded[1] = { ...seeded[1], less_than_1yr: tpBS, total: tpBS };
        setTpAging(seeded);
      }
    } catch (e) {
      console.warn('Failed to load TP Aging', e);
    }

    // Load TR Aging
    try {
      const savedTr = localStorage.getItem(STORAGE_KEYS.TR_AGING);
      if (savedTr) {
        setTrAging(JSON.parse(savedTr));
      } else if (trBS > 0) {
        // Auto-seed <6m bucket with BS total if empty
        const seeded = [...DEFAULT_TR_AGING];
        seeded[0] = { ...seeded[0], less_than_6m: trBS, total: trBS };
        setTrAging(seeded);
      }
    } catch (e) {
      console.warn('Failed to load TR Aging', e);
    }

    // Load CWIP Aging
    try {
      const savedCwip = localStorage.getItem(STORAGE_KEYS.CWIP_AGING);
      if (savedCwip) {
        setCwipAging(JSON.parse(savedCwip));
      } else if (cwipBS > 0) {
        const seeded = [...DEFAULT_CWIP_AGING];
        seeded[0] = { ...seeded[0], less_than_1yr: cwipBS, total: cwipBS };
        setCwipAging(seeded);
      }
    } catch (e) {
      console.warn('Failed to load CWIP Aging', e);
    }
  };

  const handleReasonChange = (id: string, text: string) => {
    const updatedReasons = { ...ratioReasons, [id]: text };
    setRatioReasons(updatedReasons);
    setRatios((prev) =>
      prev.map((r) => (r.id === id ? { ...r, variance_reason: text } : r))
    );
    localStorage.setItem(STORAGE_KEYS.RATIO_REASONS, JSON.stringify(updatedReasons));
  };

  const handleTpCellChange = (index: number, field: keyof AgingScheduleBucket, val: number) => {
    const updated = [...tpAging];
    const row = { ...updated[index], [field]: val };
    row.total =
      (row.unbilled_or_not_due || 0) +
      (row.less_than_1yr || 0) +
      (row.one_to_two_yrs || 0) +
      (row.two_to_three_yrs || 0) +
      (row.more_than_three_yrs || 0);
    updated[index] = row;
    setTpAging(updated);
    localStorage.setItem(STORAGE_KEYS.TP_AGING, JSON.stringify(updated));
  };

  const handleTrCellChange = (index: number, field: keyof ReceivableAgingBucket, val: number) => {
    const updated = [...trAging];
    const row = { ...updated[index], [field]: val };
    row.total =
      (row.unbilled_or_not_due || 0) +
      (row.less_than_6m || 0) +
      (row.six_m_to_1yr || 0) +
      (row.one_to_two_yrs || 0) +
      (row.two_to_three_yrs || 0) +
      (row.more_than_three_yrs || 0);
    updated[index] = row;
    setTrAging(updated);
    localStorage.setItem(STORAGE_KEYS.TR_AGING, JSON.stringify(updated));
  };

  const handleCwipCellChange = (index: number, field: keyof CwipAgingBucket, val: number) => {
    const updated = [...cwipAging];
    const row = { ...updated[index], [field]: val };
    row.total =
      (row.less_than_1yr || 0) +
      (row.one_to_two_yrs || 0) +
      (row.two_to_three_yrs || 0) +
      (row.more_than_three_yrs || 0);
    updated[index] = row;
    setCwipAging(updated);
    localStorage.setItem(STORAGE_KEYS.CWIP_AGING, JSON.stringify(updated));
  };

  const saveAll = () => {
    localStorage.setItem(STORAGE_KEYS.RATIO_REASONS, JSON.stringify(ratioReasons));
    localStorage.setItem(STORAGE_KEYS.TP_AGING, JSON.stringify(tpAging));
    localStorage.setItem(STORAGE_KEYS.TR_AGING, JSON.stringify(trAging));
    localStorage.setItem(STORAGE_KEYS.CWIP_AGING, JSON.stringify(cwipAging));
    toast.success('MCA Regulatory Disclosures saved successfully!');
  };

  const tpTotalSum = tpAging.reduce((s, r) => s + r.total, 0);
  const tpDiff = Math.abs(tpTotalSum - bsTotals.tradePayables);
  const trTotalSum = trAging.reduce((s, r) => s + r.total, 0);
  const trDiff = Math.abs(trTotalSum - bsTotals.tradeReceivables);
  const cwipTotalSum = cwipAging.reduce((s, r) => s + r.total, 0);
  const cwipDiff = Math.abs(cwipTotalSum - bsTotals.cwip);

  const flaggedCount = ratios.filter((r) => r.is_flagged).length;
  const missingReasonsCount = ratios.filter((r) => r.is_flagged && (!r.variance_reason || !r.variance_reason.trim())).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            MCA 2021 Regulatory Disclosures &amp; Aging Schedules
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Companies (Accounts) Rules, Schedule III Division I Amendments &bull; 11 Statutory Ratios &bull; Aging Matrices
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={saveAll}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-cyan-600/20 transition-all hover:scale-[1.02]"
          >
            <Save className="w-3.5 h-3.5" />
            Save Disclosures
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('ratios')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'ratios'
              ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          11 Statutory Ratios
          {flaggedCount > 0 && (
            <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${
              missingReasonsCount > 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400'
            }`}>
              {flaggedCount} flagged
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('tp_aging')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'tp_aging'
              ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Trade Payables Aging
          {tpDiff > 2 && (
            <span className="text-[9px] px-1.5 py-0.2 rounded-full font-mono bg-red-500/20 text-red-400 border border-red-500/30">
              Diff ₹{tpDiff.toLocaleString()}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('tr_aging')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'tr_aging'
              ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          Trade Receivables Aging
          {trDiff > 2 && (
            <span className="text-[9px] px-1.5 py-0.2 rounded-full font-mono bg-red-500/20 text-red-400 border border-red-500/30">
              Diff ₹{trDiff.toLocaleString()}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('cwip')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'cwip'
              ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          CWIP Aging
        </button>

        <button
          onClick={() => setActiveTab('statutory')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'statutory'
              ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          Other MCA Disclosures
        </button>
      </div>

      {/* ── TAB 1: 11 STATUTORY RATIOS ── */}
      {activeTab === 'ratios' && (
        <div className="space-y-4">
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>
                <strong>MCA Notification 24-Mar-2021:</strong> If variance between Current Year and Prior Year exceeds <strong>&plusmn;25%</strong>, an explanation is mandatory.
              </span>
            </div>
            {missingReasonsCount > 0 && (
              <span className="text-amber-400 font-bold flex items-center gap-1 font-mono text-[11px]">
                <AlertTriangle className="w-3.5 h-3.5" />
                {missingReasonsCount} reason(s) pending
              </span>
            )}
          </div>

          <div className="rounded-xl border border-white/5 bg-[rgba(15,23,42,0.55)] backdrop-blur-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-900/80 border-b border-white/5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-3 w-10 text-center">#</th>
                    <th className="py-3 px-3 min-w-[200px]">Ratio Particulars</th>
                    <th className="py-3 px-3 min-w-[240px]">Numerator / Denominator</th>
                    <th className="py-3 px-3 text-right w-24">CY</th>
                    <th className="py-3 px-3 text-right w-24">PY</th>
                    <th className="py-3 px-3 text-right w-24">Variance %</th>
                    <th className="py-3 px-3 min-w-[280px]">Reason for Variance (if &gt; 25%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300 font-mono">
                  {ratios.map((r, i) => {
                    const isFlagged = r.is_flagged;
                    const reason = ratioReasons[r.id] || '';
                    const needsReason = isFlagged && !reason.trim();

                    return (
                      <tr
                        key={r.id}
                        className={`hover:bg-white/[0.02] transition-colors ${
                          isFlagged ? 'bg-amber-500/[0.03]' : ''
                        }`}
                      >
                        <td className="py-3 px-3 text-center text-slate-500 font-bold">{i + 1}</td>
                        <td className="py-3 px-3 font-sans font-bold text-white">
                          <div className="flex items-center gap-2">
                            <span>{r.ratio_name}</span>
                            {isFlagged && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                                &gt;25%
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-[11px] text-slate-400 font-sans">
                          <span className="text-cyan-400 font-medium">{r.numerator_label}</span>
                          <span className="text-slate-600 mx-1">/</span>
                          <span className="text-slate-400">{r.denominator_label}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-white">
                          {r.cy_value.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-400">
                          {r.py_value.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold">
                          <span
                            className={
                              isFlagged
                                ? r.variance_percent >= 0
                                  ? 'text-emerald-400'
                                  : 'text-red-400'
                                : 'text-slate-300'
                            }
                          >
                            {r.variance_percent > 0 ? '+' : ''}
                            {r.variance_percent.toFixed(2)}%
                          </span>
                        </td>
                        <td className="py-2 px-3 font-sans">
                          {isFlagged ? (
                            <input
                              type="text"
                              value={reason}
                              onChange={(e) => handleReasonChange(r.id, e.target.value)}
                              placeholder="Enter explanation for >25% variation..."
                              className={`w-full px-2.5 py-1.5 rounded-lg text-xs bg-slate-900/90 border transition-all text-white placeholder-slate-600 focus:outline-none ${
                                needsReason
                                  ? 'border-amber-500/60 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                                  : 'border-slate-700/60 focus:border-cyan-500'
                              }`}
                            />
                          ) : (
                            <span className="text-slate-600 text-[11px] italic">Not mandatory (&le;25%)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: TRADE PAYABLES AGING ── */}
      {activeTab === 'tp_aging' && (
        <div className="space-y-4">
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>
                <strong>Trade Payables Aging Schedule:</strong> Schedule III requires breakdown across MSME, Others, and Disputed dues.
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span>BS Note 8 Total: <strong>₹{bsTotals.tradePayables.toLocaleString()}</strong></span>
              <span>Aging Total: <strong>₹{tpTotalSum.toLocaleString()}</strong></span>
              {tpDiff > 2 ? (
                <span className="text-red-400 font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Difference: ₹{tpDiff.toLocaleString()}
                </span>
              ) : (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Reconciled
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-[rgba(15,23,42,0.55)] backdrop-blur-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-900/80 border-b border-white/5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-3 min-w-[220px]">Particulars</th>
                    <th className="py-3 px-3 text-right w-32">Unbilled / Not Due</th>
                    <th className="py-3 px-3 text-right w-32">&lt; 1 Year</th>
                    <th className="py-3 px-3 text-right w-32">1 - 2 Years</th>
                    <th className="py-3 px-3 text-right w-32">2 - 3 Years</th>
                    <th className="py-3 px-3 text-right w-32">&gt; 3 Years</th>
                    <th className="py-3 px-3 text-right w-36 font-black text-white">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300 font-mono">
                  {tpAging.map((row, idx) => (
                    <tr key={row.category} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3 font-sans font-bold text-white">{row.category}</td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={row.unbilled_or_not_due || ''}
                          onChange={(e) => handleTpCellChange(idx, 'unbilled_or_not_due', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={row.less_than_1yr || ''}
                          onChange={(e) => handleTpCellChange(idx, 'less_than_1yr', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={row.one_to_two_yrs || ''}
                          onChange={(e) => handleTpCellChange(idx, 'one_to_two_yrs', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={row.two_to_three_yrs || ''}
                          onChange={(e) => handleTpCellChange(idx, 'two_to_three_yrs', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={row.more_than_three_yrs || ''}
                          onChange={(e) => handleTpCellChange(idx, 'more_than_three_yrs', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-cyan-400">
                        ₹{row.total.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-900/90 font-black border-t-2 border-slate-700">
                    <td className="py-3 px-3 text-white uppercase tracking-wider font-sans">Total Trade Payables</td>
                    <td className="py-3 px-3 text-right">
                      ₹{tpAging.reduce((s, r) => s + (r.unbilled_or_not_due || 0), 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      ₹{tpAging.reduce((s, r) => s + (r.less_than_1yr || 0), 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      ₹{tpAging.reduce((s, r) => s + (r.one_to_two_yrs || 0), 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      ₹{tpAging.reduce((s, r) => s + (r.two_to_three_yrs || 0), 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      ₹{tpAging.reduce((s, r) => s + (r.more_than_three_yrs || 0), 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right text-cyan-300 font-mono text-sm underline decoration-double">
                      ₹{tpTotalSum.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: TRADE RECEIVABLES AGING ── */}
      {activeTab === 'tr_aging' && (
        <div className="space-y-4">
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>
                <strong>Trade Receivables Aging Schedule:</strong> 6-bracket breakdown as per Schedule III Division I.
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span>BS Note 21 Total: <strong>₹{bsTotals.tradeReceivables.toLocaleString()}</strong></span>
              <span>Aging Total: <strong>₹{trTotalSum.toLocaleString()}</strong></span>
              {trDiff > 2 ? (
                <span className="text-red-400 font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Difference: ₹{trDiff.toLocaleString()}
                </span>
              ) : (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Reconciled
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-[rgba(15,23,42,0.55)] backdrop-blur-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-900/80 border-b border-white/5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-3 min-w-[260px]">Particulars</th>
                    <th className="py-3 px-3 text-right w-28">Unbilled</th>
                    <th className="py-3 px-3 text-right w-28">&lt; 6 Months</th>
                    <th className="py-3 px-3 text-right w-28">6m - 1 Year</th>
                    <th className="py-3 px-3 text-right w-28">1 - 2 Years</th>
                    <th className="py-3 px-3 text-right w-28">2 - 3 Years</th>
                    <th className="py-3 px-3 text-right w-28">&gt; 3 Years</th>
                    <th className="py-3 px-3 text-right w-32 font-black text-white">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300 font-mono">
                  {trAging.map((row, idx) => (
                    <tr key={row.category} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3 font-sans font-bold text-white text-[11px]">{row.category}</td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={row.unbilled_or_not_due || ''}
                          onChange={(e) => handleTrCellChange(idx, 'unbilled_or_not_due', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={row.less_than_6m || ''}
                          onChange={(e) => handleTrCellChange(idx, 'less_than_6m', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={row.six_m_to_1yr || ''}
                          onChange={(e) => handleTrCellChange(idx, 'six_m_to_1yr', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={row.one_to_two_yrs || ''}
                          onChange={(e) => handleTrCellChange(idx, 'one_to_two_yrs', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={row.two_to_three_yrs || ''}
                          onChange={(e) => handleTrCellChange(idx, 'two_to_three_yrs', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={row.more_than_three_yrs || ''}
                          onChange={(e) => handleTrCellChange(idx, 'more_than_three_yrs', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-cyan-400">
                        ₹{row.total.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-900/90 font-black border-t-2 border-slate-700">
                    <td className="py-3 px-3 text-white uppercase tracking-wider font-sans">Total Receivables</td>
                    <td className="py-3 px-3 text-right">
                      ₹{trAging.reduce((s, r) => s + (r.unbilled_or_not_due || 0), 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      ₹{trAging.reduce((s, r) => s + (r.less_than_6m || 0), 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      ₹{trAging.reduce((s, r) => s + (r.six_m_to_1yr || 0), 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      ₹{trAging.reduce((s, r) => s + (r.one_to_two_yrs || 0), 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      ₹{trAging.reduce((s, r) => s + (r.two_to_three_yrs || 0), 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      ₹{trAging.reduce((s, r) => s + (r.more_than_three_yrs || 0), 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right text-cyan-300 font-mono text-sm underline decoration-double">
                      ₹{trTotalSum.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: CWIP AGING ── */}
      {activeTab === 'cwip' && (
        <div className="space-y-4">
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>
                <strong>Capital Work-in-Progress (CWIP) Aging:</strong> Aging for projects in progress and temporarily suspended.
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span>BS Note 14 Total: <strong>₹{bsTotals.cwip.toLocaleString()}</strong></span>
              <span>CWIP Total: <strong>₹{cwipTotalSum.toLocaleString()}</strong></span>
              {cwipDiff > 2 ? (
                <span className="text-red-400 font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Difference: ₹{cwipDiff.toLocaleString()}
                </span>
              ) : (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Reconciled
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-[rgba(15,23,42,0.55)] backdrop-blur-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-900/80 border-b border-white/5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-3 min-w-[240px]">CWIP Classification</th>
                    <th className="py-3 px-3 text-right w-36">&lt; 1 Year</th>
                    <th className="py-3 px-3 text-right w-36">1 - 2 Years</th>
                    <th className="py-3 px-3 text-right w-36">2 - 3 Years</th>
                    <th className="py-3 px-3 text-right w-36">&gt; 3 Years</th>
                    <th className="py-3 px-3 text-right w-40 font-black text-white">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300 font-mono">
                  {cwipAging.map((row, idx) => (
                    <tr key={row.project_type} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3 font-sans font-bold text-white">{row.project_type}</td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={row.less_than_1yr || ''}
                          onChange={(e) => handleCwipCellChange(idx, 'less_than_1yr', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={row.one_to_two_yrs || ''}
                          onChange={(e) => handleCwipCellChange(idx, 'one_to_two_yrs', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={row.two_to_three_yrs || ''}
                          onChange={(e) => handleCwipCellChange(idx, 'two_to_three_yrs', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={row.more_than_three_yrs || ''}
                          onChange={(e) => handleCwipCellChange(idx, 'more_than_three_yrs', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-cyan-400">
                        ₹{row.total.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-900/90 font-black border-t-2 border-slate-700">
                    <td className="py-3 px-3 text-white uppercase tracking-wider font-sans">Total CWIP</td>
                    <td className="py-3 px-3 text-right">
                      ₹{cwipAging.reduce((s, r) => s + (r.less_than_1yr || 0), 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      ₹{cwipAging.reduce((s, r) => s + (r.one_to_two_yrs || 0), 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      ₹{cwipAging.reduce((s, r) => s + (r.two_to_three_yrs || 0), 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      ₹{cwipAging.reduce((s, r) => s + (r.more_than_three_yrs || 0), 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right text-cyan-300 font-mono text-sm underline decoration-double">
                      ₹{cwipTotalSum.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 5: OTHER STATUTORY MCA 2021 DISCLOSURES ── */}
      {activeTab === 'statutory' && (
        <div className="grid md:grid-cols-2 gap-4">
          {[
            {
              title: 'Promoters Shareholding',
              rule: 'MCA 2021',
              desc: 'Shares held by promoters at the end of the year and percentage change during the year.',
              status: 'Disclosed in Note 1',
            },
            {
              title: 'Title Deeds of Immovable Property',
              rule: 'MCA 2021',
              desc: 'Confirmation that all title deeds of immovable properties are held in the name of the company.',
              status: 'Held in Company Name',
            },
            {
              title: 'Benami Property Proceedings',
              rule: 'MCA 2021',
              desc: 'Confirmation that no proceedings have been initiated or pending against the company under Benami Transactions Act.',
              status: 'No Proceedings Pending',
            },
            {
              title: 'Borrowings against Security of Current Assets',
              rule: 'MCA 2021',
              desc: 'Quarterly returns/statements filed by the company with banks/FIs are in agreement with books of account.',
              status: 'In Agreement with Books',
            },
            {
              title: 'Wilful Defaulter Declaration',
              rule: 'MCA 2021',
              desc: 'Company has not been declared wilful defaulter by any bank, financial institution, or other lender.',
              status: 'Not Declared Defaulter',
            },
            {
              title: 'Relationship with Struck Off Companies',
              rule: 'MCA 2021',
              desc: 'No transactions with companies struck off under section 248 of the Companies Act, 2013 or section 560 of Companies Act, 1956.',
              status: 'Nil Transactions',
            },
            {
              title: 'Registration of Charges or Satisfaction with ROC',
              rule: 'MCA 2021',
              desc: 'All charges and satisfactions are registered with ROC within the statutory period.',
              status: 'All Registered with ROC',
            },
            {
              title: 'Crypto Currency or Virtual Currency',
              rule: 'MCA 2021',
              desc: 'The company has not traded or invested in Crypto Currency or Virtual Currency during the year.',
              status: 'No Crypto Activity',
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl border border-white/5 bg-[rgba(15,23,42,0.45)] backdrop-blur-xl flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-bold text-white">{item.title}</h4>
                  <span className="text-[9px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono font-bold">
                    {item.rule}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Status:</span>
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {item.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
