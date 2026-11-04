import { useState, useEffect } from 'react';
import {
  Users,
  Building,
  Columns,
  Scale,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Award,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  PartnerCapitalEntry,
  LevelClassificationResult,
  TrialBalanceEntry,
  DenominationUnit,
} from '@/lib/finStatements.types';
import {
  getClientSetup,
  getTrialBalance,
  getPartnersCapital,
  savePartnersCapital,
  evaluateNonCorporateLevel,
} from '@/lib/finStatements.storage';
import { computeSchedule3Financials } from '@/lib/finStatementsEngine';

const DEFAULT_PARTNERS: PartnerCapitalEntry[] = [
  {
    id: 'p1',
    partner_name: 'Partner 1',
    profit_share_percent: 50,
    opening_capital: 1000000,
    additions_capital: 200000,
    withdrawals_drawings: 150000,
    interest_on_capital: 80000,
    partner_salary_remuneration: 360000,
    share_of_profit_loss: 500000,
    closing_capital: 1990000,
  },
  {
    id: 'p2',
    partner_name: 'Partner 2',
    profit_share_percent: 50,
    opening_capital: 800000,
    additions_capital: 100000,
    withdrawals_drawings: 120000,
    interest_on_capital: 64000,
    partner_salary_remuneration: 360000,
    share_of_profit_loss: 500000,
    closing_capital: 1704000,
  },
];

export default function NonCorporateReports() {
  const [activeTab, setActiveTab] = useState<'partners' | 'bsh' | 'plh' | 'as_matrix'>('partners');
  const [partners, setPartners] = useState<PartnerCapitalEntry[]>([]);
  const [levelInfo, setLevelInfo] = useState<LevelClassificationResult | null>(null);
  const [tbEntries, setTbEntries] = useState<TrialBalanceEntry[]>([]);
  const [denomination, setDenomination] = useState<DenominationUnit>('in_rupees');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const client = getClientSetup();
    const tb = getTrialBalance();
    setTbEntries(tb);
    setDenomination(client.denomination || 'in_rupees');

    // Partners
    const savedPartners = getPartnersCapital();
    if (savedPartners && savedPartners.length > 0) {
      setPartners(savedPartners);
    } else {
      setPartners(DEFAULT_PARTNERS);
    }

    // ICAI Level
    const lvl = evaluateNonCorporateLevel(
      client.turnover_preceding_year || 0,
      client.borrowings_preceding_year || 0
    );
    setLevelInfo(lvl);
  };

  const handlePartnerChange = (index: number, field: keyof PartnerCapitalEntry, val: any) => {
    const updated = [...partners];
    const row = { ...updated[index], [field]: val };

    // Recompute closing capital:
    // Closing = Opening + Additions - Drawings + Interest + Salary + Share of Profit
    row.closing_capital =
      (Number(row.opening_capital) || 0) +
      (Number(row.additions_capital) || 0) -
      (Number(row.withdrawals_drawings) || 0) +
      (Number(row.interest_on_capital) || 0) +
      (Number(row.partner_salary_remuneration) || 0) +
      (Number(row.share_of_profit_loss) || 0);

    updated[index] = row;
    setPartners(updated);
  };

  const addPartner = () => {
    const newId = `p${Date.now()}`;
    const newPartner: PartnerCapitalEntry = {
      id: newId,
      partner_name: `Partner ${partners.length + 1}`,
      profit_share_percent: 0,
      opening_capital: 0,
      additions_capital: 0,
      withdrawals_drawings: 0,
      interest_on_capital: 0,
      partner_salary_remuneration: 0,
      share_of_profit_loss: 0,
      closing_capital: 0,
    };
    setPartners([...partners, newPartner]);
  };

  const removePartner = (index: number) => {
    if (partners.length <= 1) {
      toast.error('At least one partner/proprietor is required.');
      return;
    }
    const updated = partners.filter((_, i) => i !== index);
    setPartners(updated);
  };

  const savePartners = () => {
    savePartnersCapital(partners);
    toast.success('Partner Capital Schedule saved successfully!');
  };

  // Financial statements computation for T-format
  const fin = computeSchedule3Financials(tbEntries, denomination);
  const bs = fin.balanceSheet;
  const pl = fin.profitAndLoss;

  // Partner totals
  const totalOpening = partners.reduce((s, p) => s + (p.opening_capital || 0), 0);
  const totalAdditions = partners.reduce((s, p) => s + (p.additions_capital || 0), 0);
  const totalDrawings = partners.reduce((s, p) => s + (p.withdrawals_drawings || 0), 0);
  const totalInterest = partners.reduce((s, p) => s + (p.interest_on_capital || 0), 0);
  const totalSalary = partners.reduce((s, p) => s + (p.partner_salary_remuneration || 0), 0);
  const totalProfit = partners.reduce((s, p) => s + (p.share_of_profit_loss || 0), 0);
  const totalClosing = partners.reduce((s, p) => s + (p.closing_capital || 0), 0);
  const totalPsr = partners.reduce((s, p) => s + (p.profit_share_percent || 0), 0);

  // Groupings for Horizontal Balance Sheet
  const liabilitiesLeft = bs.equityAndLiabilities;
  const assetsRight = bs.assets;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-400" />
            Non-Corporate Financials &amp; Multi-Partner Accounts
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            ICAI June 2022 Technical Guide &bull; Horizontal T-Format (BS &amp; P&amp;L) &bull; Partner Capital Schedule (2-50 Partners)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {levelInfo && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold font-mono">
              <Award className="w-4 h-4 text-amber-400" />
              <span>{levelInfo.level}</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('partners')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'partners'
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Partner Capital Schedule ({partners.length})
        </button>

        <button
          onClick={() => setActiveTab('bsh')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'bsh'
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Columns className="w-3.5 h-3.5" />
          Horizontal Balance Sheet [BS(H)]
        </button>

        <button
          onClick={() => setActiveTab('plh')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'plh'
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          Horizontal Profit &amp; Loss [P&amp;L(H)]
        </button>

        <button
          onClick={() => setActiveTab('as_matrix')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'as_matrix'
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          ICAI AS Applicability Matrix
        </button>
      </div>

      {/* ── TAB 1: PARTNER CAPITAL SCHEDULE ── */}
      {activeTab === 'partners' && (
        <div className="space-y-4">
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Formula:</strong> Closing Capital = Opening + Additions &minus; Drawings + Interest on Capital + Remuneration &plusmn; Share of Profit/Loss
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={addPartner}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400" />
                Add Partner
              </button>
              <button
                onClick={savePartners}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1 transition-colors shadow-lg shadow-amber-600/20"
              >
                <Save className="w-3.5 h-3.5" />
                Save Schedule
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-[rgba(15,23,42,0.55)] backdrop-blur-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-900/80 border-b border-white/5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-3 min-w-[160px]">Partner Name</th>
                    <th className="py-3 px-3 text-right w-20">PSR %</th>
                    <th className="py-3 px-3 text-right w-28">Opening Capital</th>
                    <th className="py-3 px-3 text-right w-28">Additions</th>
                    <th className="py-3 px-3 text-right w-28">Drawings</th>
                    <th className="py-3 px-3 text-right w-28">Interest</th>
                    <th className="py-3 px-3 text-right w-28">Remuneration</th>
                    <th className="py-3 px-3 text-right w-28">Share of Profit</th>
                    <th className="py-3 px-3 text-right w-32 font-black text-white">Closing Capital</th>
                    <th className="py-3 px-3 w-12 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300 font-mono">
                  {partners.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-white/[0.02]">
                      <td className="py-1 px-2 font-sans">
                        <input
                          type="text"
                          value={p.partner_name}
                          onChange={(e) => handlePartnerChange(idx, 'partner_name', e.target.value)}
                          className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700/60 text-white font-bold focus:outline-none focus:border-amber-500 text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={p.profit_share_percent || ''}
                          onChange={(e) => handlePartnerChange(idx, 'profit_share_percent', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-amber-400 font-bold focus:outline-none focus:border-amber-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={p.opening_capital || ''}
                          onChange={(e) => handlePartnerChange(idx, 'opening_capital', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-amber-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={p.additions_capital || ''}
                          onChange={(e) => handlePartnerChange(idx, 'additions_capital', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-emerald-400 focus:outline-none focus:border-amber-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={p.withdrawals_drawings || ''}
                          onChange={(e) => handlePartnerChange(idx, 'withdrawals_drawings', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-red-400 focus:outline-none focus:border-amber-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={p.interest_on_capital || ''}
                          onChange={(e) => handlePartnerChange(idx, 'interest_on_capital', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-amber-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={p.partner_salary_remuneration || ''}
                          onChange={(e) => handlePartnerChange(idx, 'partner_salary_remuneration', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-amber-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          value={p.share_of_profit_loss || ''}
                          onChange={(e) => handlePartnerChange(idx, 'share_of_profit_loss', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right rounded bg-slate-900 border border-slate-700/60 text-white focus:outline-none focus:border-amber-500 font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-amber-400 text-sm">
                        ₹{p.closing_capital.toLocaleString()}
                      </td>
                      <td className="py-1 px-2 text-center">
                        <button
                          onClick={() => removePartner(idx)}
                          className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Remove Partner"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-900/90 font-black border-t-2 border-slate-700">
                    <td className="py-3 px-3 text-white uppercase tracking-wider font-sans">Total</td>
                    <td className={`py-3 px-3 text-right font-mono ${totalPsr === 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {totalPsr}%
                    </td>
                    <td className="py-3 px-3 text-right">₹{totalOpening.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right text-emerald-400">₹{totalAdditions.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right text-red-400">₹{totalDrawings.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right">₹{totalInterest.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right">₹{totalSalary.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right">₹{totalProfit.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right text-amber-300 font-mono text-sm underline decoration-double">
                      ₹{totalClosing.toLocaleString()}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: HORIZONTAL BALANCE SHEET [BS(H)] ── */}
      {activeTab === 'bsh' && (
        <div className="space-y-4">
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Columns className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Horizontal T-Format Balance Sheet:</strong> Capital &amp; Liabilities on the Left, Property &amp; Assets on the Right.
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span>Liabilities: <strong>₹{bs.totalEquityAndLiabilities.cy.toLocaleString()}</strong></span>
              <span>Assets: <strong>₹{bs.totalAssets.cy.toLocaleString()}</strong></span>
              {bs.isBalanced ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Balanced
                </span>
              ) : (
                <span className="text-red-400 font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Diff: ₹{Math.abs(bs.difference).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Left Column: Liabilities */}
            <div className="rounded-xl border border-white/5 bg-[rgba(15,23,42,0.55)] backdrop-blur-xl overflow-hidden shadow-xl">
              <div className="bg-slate-900/80 px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-amber-400">Capital &amp; Liabilities</h3>
                <span className="text-[10px] text-slate-500 font-mono">Amount (₹)</span>
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-2 px-3">Particulars</th>
                    <th className="py-2 px-3 text-right">CY</th>
                    <th className="py-2 px-3 text-right">PY</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {liabilitiesLeft.map((item, idx) => (
                    <tr key={idx} className={`hover:bg-white/[0.02] ${item.isHeader ? 'bg-white/[0.02] font-bold text-white font-sans' : 'text-slate-300'}`}>
                      <td className="py-2 px-3">{item.particulars}</td>
                      <td className="py-2 px-3 text-right font-medium">
                        {item.cyAmount !== 0 ? `₹${item.cyAmount.toLocaleString()}` : '—'}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">
                        {item.pyAmount !== 0 ? `₹${item.pyAmount.toLocaleString()}` : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-900/90 font-black border-t-2 border-slate-700">
                    <td className="py-3 px-3 text-white uppercase font-sans">Total Liabilities</td>
                    <td className="py-3 px-3 text-right text-amber-300 underline decoration-double">
                      ₹{bs.totalEquityAndLiabilities.cy.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400">
                      ₹{bs.totalEquityAndLiabilities.py.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Right Column: Assets */}
            <div className="rounded-xl border border-white/5 bg-[rgba(15,23,42,0.55)] backdrop-blur-xl overflow-hidden shadow-xl">
              <div className="bg-slate-900/80 px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-cyan-400">Property &amp; Assets</h3>
                <span className="text-[10px] text-slate-500 font-mono">Amount (₹)</span>
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-2 px-3">Particulars</th>
                    <th className="py-2 px-3 text-right">CY</th>
                    <th className="py-2 px-3 text-right">PY</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {assetsRight.map((item, idx) => (
                    <tr key={idx} className={`hover:bg-white/[0.02] ${item.isHeader ? 'bg-white/[0.02] font-bold text-white font-sans' : 'text-slate-300'}`}>
                      <td className="py-2 px-3">{item.particulars}</td>
                      <td className="py-2 px-3 text-right font-medium">
                        {item.cyAmount !== 0 ? `₹${item.cyAmount.toLocaleString()}` : '—'}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">
                        {item.pyAmount !== 0 ? `₹${item.pyAmount.toLocaleString()}` : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-900/90 font-black border-t-2 border-slate-700">
                    <td className="py-3 px-3 text-white uppercase font-sans">Total Assets</td>
                    <td className="py-3 px-3 text-right text-cyan-300 underline decoration-double">
                      ₹{bs.totalAssets.cy.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400">
                      ₹{bs.totalAssets.py.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: HORIZONTAL PROFIT & LOSS [P&L(H)] ── */}
      {activeTab === 'plh' && (
        <div className="space-y-4">
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Horizontal T-Format Profit &amp; Loss:</strong> Debit (Expenses &amp; Allocations) on Left, Credit (Revenue &amp; Income) on Right.
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span>Revenue: <strong>₹{pl.totalRevenue.cy.toLocaleString()}</strong></span>
              <span>Expenses: <strong>₹{pl.totalExpenses.cy.toLocaleString()}</strong></span>
              <span>PAT: <strong className="text-emerald-400">₹{pl.profitAfterTax.cy.toLocaleString()}</strong></span>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Left: Expenses */}
            <div className="rounded-xl border border-white/5 bg-[rgba(15,23,42,0.55)] backdrop-blur-xl overflow-hidden shadow-xl">
              <div className="bg-slate-900/80 px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-rose-400">Dr. (Expenses &amp; Allocations)</h3>
                <span className="text-[10px] text-slate-500 font-mono">Amount (₹)</span>
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-2 px-3">Particulars</th>
                    <th className="py-2 px-3 text-right">CY</th>
                    <th className="py-2 px-3 text-right">PY</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-slate-300">
                  {pl.expenses.map((e, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02]">
                      <td className="py-2 px-3 font-sans">{e.particulars}</td>
                      <td className="py-2 px-3 text-right font-medium">₹{e.cyAmount.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-slate-500">₹{e.pyAmount.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="bg-emerald-500/10 font-bold text-emerald-400">
                    <td className="py-2 px-3 font-sans">Net Profit Transferred to Partners</td>
                    <td className="py-2 px-3 text-right">₹{pl.profitAfterTax.cy.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right">₹{pl.profitAfterTax.py.toLocaleString()}</td>
                  </tr>
                  <tr className="bg-slate-900/90 font-black border-t-2 border-slate-700">
                    <td className="py-3 px-3 text-white uppercase font-sans">Total Debits</td>
                    <td className="py-3 px-3 text-right text-rose-300 underline decoration-double">
                      ₹{pl.totalRevenue.cy.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400">
                      ₹{pl.totalRevenue.py.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Right: Income */}
            <div className="rounded-xl border border-white/5 bg-[rgba(15,23,42,0.55)] backdrop-blur-xl overflow-hidden shadow-xl">
              <div className="bg-slate-900/80 px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-emerald-400">Cr. (Revenue &amp; Incomes)</h3>
                <span className="text-[10px] text-slate-500 font-mono">Amount (₹)</span>
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-2 px-3">Particulars</th>
                    <th className="py-2 px-3 text-right">CY</th>
                    <th className="py-2 px-3 text-right">PY</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-slate-300">
                  {pl.revenue.map((r, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02]">
                      <td className="py-2 px-3 font-sans">{r.particulars}</td>
                      <td className="py-2 px-3 text-right font-medium">₹{r.cyAmount.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-slate-500">₹{r.pyAmount.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-900/90 font-black border-t-2 border-slate-700">
                    <td className="py-3 px-3 text-white uppercase font-sans">Total Credits</td>
                    <td className="py-3 px-3 text-right text-emerald-300 underline decoration-double">
                      ₹{pl.totalRevenue.cy.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400">
                      ₹{pl.totalRevenue.py.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: ICAI AS APPLICABILITY MATRIX ── */}
      {activeTab === 'as_matrix' && levelInfo && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 backdrop-blur-xl">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-white">{levelInfo.summary}</h3>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 mt-3 text-xs">
              <div className="p-2.5 rounded bg-slate-900/60 border border-white/5">
                <span className="text-slate-400">AS 3 Cash Flow Statement:</span>
                <p className="font-bold font-mono mt-0.5 text-white">
                  {levelInfo.is_cash_flow_mandatory ? (
                    <span className="text-red-400">Mandatory (Level I)</span>
                  ) : (
                    <span className="text-emerald-400">Exempt</span>
                  )}
                </p>
              </div>
              <div className="p-2.5 rounded bg-slate-900/60 border border-white/5">
                <span className="text-slate-400">AS 17 Segment Reporting:</span>
                <p className="font-bold font-mono mt-0.5 text-white">
                  {levelInfo.is_segment_reporting_mandatory ? (
                    <span className="text-red-400">Mandatory (Level I)</span>
                  ) : (
                    <span className="text-emerald-400">Exempt</span>
                  )}
                </p>
              </div>
              <div className="p-2.5 rounded bg-slate-900/60 border border-white/5">
                <span className="text-slate-400">AS 22 Deferred Tax:</span>
                <p className="font-bold font-mono mt-0.5 text-white">
                  {levelInfo.is_deferred_tax_applicable ? (
                    <span className="text-cyan-400">Applicable</span>
                  ) : (
                    <span className="text-emerald-400">Exempt (Level IV)</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-[rgba(15,23,42,0.55)] backdrop-blur-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-900/80 border-b border-white/5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-3 w-24">Standard</th>
                    <th className="py-3 px-3 min-w-[220px]">Title</th>
                    <th className="py-3 px-3 w-40 text-center">Applicability</th>
                    <th className="py-3 px-3 min-w-[300px]">Exemptions &amp; Guidance (ICAI June 2022)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {levelInfo.standards.map((s) => (
                    <tr key={s.as_number} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3 font-mono font-bold text-amber-400">{s.as_number}</td>
                      <td className="py-2.5 px-3 font-bold text-white">{s.as_title}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            s.applicability === 'Applicable'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : s.applicability === 'Applicable with Exemptions'
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {s.applicability}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px] leading-relaxed">
                        {s.exemption_notes || 'Full standard applies.'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
