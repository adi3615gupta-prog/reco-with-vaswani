import React, { useState, useMemo } from 'react';
import {
  BarChart3, Landmark, FileText, Download, TrendingUp, TrendingDown,
  Building2, Hash, Layers, PieChart, Activity, ShieldCheck, AlertCircle,
  Calculator, CheckCircle2, ArrowRight
} from 'lucide-react';
import {
  getClientSetup,
  getTrialBalance,
  saveClientSetup
} from '@/lib/finStatements.storage';
import {
  computeSchedule3Financials,
  getDenominationDivisor,
  type StatementLineItem
} from '@/lib/finStatementsEngine';
import { computeCashFlowStatement } from '@/lib/cfsEngine';
import { computeCorporateTax } from '@/lib/corporateTaxEngine';
import type { DenominationUnit } from '@/lib/finStatements.types';

// Currency / Number Formatter
const formatNumber = (v: number) => {
  if (v === 0) return '-';
  const formatted = Math.abs(v).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return v < 0 ? `(${formatted})` : formatted;
};

export default function FinancialReports() {
  const [activeTab, setActiveTab] = useState<'bs' | 'pl' | 'cfs' | 'notes' | 'tax'>('bs');
  const [denomination, setDenomination] = useState<DenominationUnit>('in_rupees');
  const [chosenRegime, setChosenRegime] = useState<'115BAA' | '115BAB' | 'REGULAR'>('115BAA');

  const client = getClientSetup();
  const tbEntries = useMemo(() => getTrialBalance(), []);

  // Compute Core Financials
  const financials = useMemo(() => {
    return computeSchedule3Financials(tbEntries, denomination);
  }, [tbEntries, denomination]);

  // Compute Cash Flow Statement
  const cfs = useMemo(() => {
    return computeCashFlowStatement(tbEntries, denomination);
  }, [tbEntries, denomination]);

  // Compute Corporate Tax
  const taxComp = useMemo(() => {
    const pbt = financials.profitAndLoss.profitBeforeTax.cy * financials.denominationFactor;
    return computeCorporateTax({
      profitBeforeTax: Math.max(0, pbt),
      bookDepreciation: 50000,
      taxDepreciation: 60000,
      disallowanceSec37: 0,
      disallowanceSec40a: 0,
      disallowanceSec43b: 0,
      deductionsBroughtForwardLosses: 0,
      turnoverPrecedingYear: client.turnover_preceding_year || 50000000,
      chosenRegime,
    });
  }, [financials, client, chosenRegime]);

  const { isBalanced, difference } = financials.balanceSheet;

  return (
    <div className="space-y-6">
      {/* Top Banner: Client Header & Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 text-white shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase">
              {client.entity_type === 'corporate' ? 'Schedule III Corporate' : 'ICAI Non-Corporate'}
            </span>
            <span className="text-slate-400 text-xs font-mono">CIN: {client.cin_number || 'Unregistered'}</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">{client.company_name || 'Demo Enterprise'}</h2>
          <p className="text-xs text-slate-400">Financial Statements for the Year Ended 31st March 2025</p>
        </div>

        {/* Right HUD: Denomination Switcher & Balance Status */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/80">
            <span className="text-[11px] text-slate-400 font-medium">Unit:</span>
            <select
              value={denomination}
              onChange={(e) => setDenomination(e.target.value as DenominationUnit)}
              className="bg-transparent text-xs font-mono font-semibold text-cyan-300 focus:outline-none cursor-pointer"
            >
              <option value="in_rupees" className="bg-slate-900">In Rupees (₹)</option>
              <option value="hundreds" className="bg-slate-900">Rs in '00</option>
              <option value="thousands" className="bg-slate-900">Rs in '000</option>
              <option value="lacs" className="bg-slate-900">Rs in Lakhs</option>
              <option value="crores" className="bg-slate-900">Rs in Crores</option>
            </select>
          </div>

          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold ${
              isBalanced
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse'
            }`}
          >
            {isBalanced ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Tallied (Δ: ₹0.00)</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Diff: ₹{Math.abs(difference.cy).toLocaleString('en-IN')}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('bs')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'bs'
              ? 'border-cyan-600 text-cyan-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Landmark className="w-4 h-4" />
          <span>Balance Sheet (Part I)</span>
        </button>

        <button
          onClick={() => setActiveTab('pl')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'pl'
              ? 'border-cyan-600 text-cyan-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Statement of Profit & Loss (Part II)</span>
        </button>

        <button
          onClick={() => setActiveTab('cfs')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'cfs'
              ? 'border-cyan-600 text-cyan-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Cash Flow Statement (AS-3)</span>
          {cfs.is_tallied && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('tax')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'tax'
              ? 'border-cyan-600 text-cyan-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>Tax & Deferred Tax</span>
        </button>
      </div>

      {/* TAB 1: BALANCE SHEET */}
      {activeTab === 'bs' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden p-6">
          <div className="text-center mb-6">
            <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider">{client.company_name}</h3>
            <p className="text-xs text-slate-500">Balance Sheet as at 31st March 2025</p>
            <p className="text-[11px] font-mono text-cyan-700 mt-0.5">({financials.denominationLabel})</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-300 text-slate-600 text-left bg-slate-50/80">
                  <th className="py-2.5 px-4 font-bold">Particulars</th>
                  <th className="py-2.5 px-3 font-mono font-semibold text-center w-20">Note</th>
                  <th className="py-2.5 px-4 font-mono font-bold text-right w-36">31-Mar-2025 (CY)</th>
                  <th className="py-2.5 px-4 font-mono font-semibold text-right w-36 text-slate-500">31-Mar-2024 (PY)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Equity & Liabilities */}
                {financials.balanceSheet.equityAndLiabilities.map((item, idx) => (
                  <tr
                    key={`el-${idx}`}
                    className={`hover:bg-slate-50/60 transition-colors ${
                      item.isHeader ? 'bg-slate-50 font-bold text-slate-900' : 'text-slate-800'
                    }`}
                  >
                    <td className="py-1.5 px-4" style={{ paddingLeft: `${(item.indent || 0) * 16 + 16}px` }}>
                      {item.particulars}
                    </td>
                    <td className="py-1.5 px-3 font-mono text-center text-slate-500">
                      {item.noteNo || ''}
                    </td>
                    <td className="py-1.5 px-4 font-mono text-right font-medium">
                      {item.isHeader ? '' : formatNumber(item.cyAmount)}
                    </td>
                    <td className="py-1.5 px-4 font-mono text-right text-slate-500">
                      {item.isHeader ? '' : formatNumber(item.pyAmount)}
                    </td>
                  </tr>
                ))}

                {/* Total Equity & Liabilities */}
                <tr className="border-t-2 border-b-2 border-slate-900 font-bold text-slate-900 bg-slate-50">
                  <td className="py-2.5 px-4">TOTAL EQUITY AND LIABILITIES</td>
                  <td className="py-2.5 px-3"></td>
                  <td className="py-2.5 px-4 font-mono text-right underline decoration-double">
                    {formatNumber(financials.balanceSheet.totalEquityAndLiabilities.cy)}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-right underline decoration-double text-slate-700">
                    {formatNumber(financials.balanceSheet.totalEquityAndLiabilities.py)}
                  </td>
                </tr>

                {/* Assets */}
                {financials.balanceSheet.assets.map((item, idx) => (
                  <tr
                    key={`as-${idx}`}
                    className={`hover:bg-slate-50/60 transition-colors ${
                      item.isHeader ? 'bg-slate-50 font-bold text-slate-900' : 'text-slate-800'
                    }`}
                  >
                    <td className="py-1.5 px-4" style={{ paddingLeft: `${(item.indent || 0) * 16 + 16}px` }}>
                      {item.particulars}
                    </td>
                    <td className="py-1.5 px-3 font-mono text-center text-slate-500">
                      {item.noteNo || ''}
                    </td>
                    <td className="py-1.5 px-4 font-mono text-right font-medium">
                      {item.isHeader ? '' : formatNumber(item.cyAmount)}
                    </td>
                    <td className="py-1.5 px-4 font-mono text-right text-slate-500">
                      {item.isHeader ? '' : formatNumber(item.pyAmount)}
                    </td>
                  </tr>
                ))}

                {/* Total Assets */}
                <tr className="border-t-2 border-b-2 border-slate-900 font-bold text-slate-900 bg-slate-50">
                  <td className="py-2.5 px-4">TOTAL ASSETS</td>
                  <td className="py-2.5 px-3"></td>
                  <td className="py-2.5 px-4 font-mono text-right underline decoration-double">
                    {formatNumber(financials.balanceSheet.totalAssets.cy)}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-right underline decoration-double text-slate-700">
                    {formatNumber(financials.balanceSheet.totalAssets.py)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: STATEMENT OF PROFIT AND LOSS */}
      {activeTab === 'pl' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden p-6">
          <div className="text-center mb-6">
            <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider">{client.company_name}</h3>
            <p className="text-xs text-slate-500">Statement of Profit and Loss for the year ended 31st March 2025</p>
            <p className="text-[11px] font-mono text-cyan-700 mt-0.5">({financials.denominationLabel})</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-300 text-slate-600 text-left bg-slate-50/80">
                  <th className="py-2.5 px-4 font-bold">Particulars</th>
                  <th className="py-2.5 px-3 font-mono font-semibold text-center w-20">Note</th>
                  <th className="py-2.5 px-4 font-mono font-bold text-right w-36">31-Mar-2025 (CY)</th>
                  <th className="py-2.5 px-4 font-mono font-semibold text-right w-36 text-slate-500">31-Mar-2024 (PY)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Revenue */}
                {financials.profitAndLoss.revenue.map((item, idx) => (
                  <tr key={`rev-${idx}`} className="hover:bg-slate-50/60">
                    <td className="py-1.5 px-4 font-semibold text-slate-900">{item.particulars}</td>
                    <td className="py-1.5 px-3 font-mono text-center text-slate-500">{item.noteNo || ''}</td>
                    <td className="py-1.5 px-4 font-mono text-right font-medium">{formatNumber(item.cyAmount)}</td>
                    <td className="py-1.5 px-4 font-mono text-right text-slate-500">{formatNumber(item.pyAmount)}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-300 font-bold bg-slate-50 text-slate-900">
                  <td className="py-2 px-4">III. Total Revenue (I + II)</td>
                  <td className="py-2 px-3"></td>
                  <td className="py-2 px-4 font-mono text-right">{formatNumber(financials.profitAndLoss.totalRevenue.cy)}</td>
                  <td className="py-2 px-4 font-mono text-right text-slate-600">{formatNumber(financials.profitAndLoss.totalRevenue.py)}</td>
                </tr>

                {/* Expenses */}
                <tr className="bg-slate-50 font-bold text-slate-900">
                  <td className="py-2 px-4" colSpan={4}>IV. Expenses</td>
                </tr>
                {financials.profitAndLoss.expenses.map((item, idx) => (
                  <tr key={`exp-${idx}`} className="hover:bg-slate-50/60">
                    <td className="py-1.5 px-4 pl-8 text-slate-800">{item.particulars}</td>
                    <td className="py-1.5 px-3 font-mono text-center text-slate-500">{item.noteNo || ''}</td>
                    <td className="py-1.5 px-4 font-mono text-right font-medium">{formatNumber(item.cyAmount)}</td>
                    <td className="py-1.5 px-4 font-mono text-right text-slate-500">{formatNumber(item.pyAmount)}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-300 font-bold bg-slate-50 text-slate-900">
                  <td className="py-2 px-4">Total Expenses (IV)</td>
                  <td className="py-2 px-3"></td>
                  <td className="py-2 px-4 font-mono text-right">{formatNumber(financials.profitAndLoss.totalExpenses.cy)}</td>
                  <td className="py-2 px-4 font-mono text-right text-slate-600">{formatNumber(financials.profitAndLoss.totalExpenses.py)}</td>
                </tr>

                {/* PBT */}
                <tr className="border-t border-slate-400 font-bold bg-slate-100 text-slate-900">
                  <td className="py-2 px-4">V. Profit before tax (III - IV)</td>
                  <td className="py-2 px-3"></td>
                  <td className="py-2 px-4 font-mono text-right">{formatNumber(financials.profitAndLoss.profitBeforeTax.cy)}</td>
                  <td className="py-2 px-4 font-mono text-right text-slate-700">{formatNumber(financials.profitAndLoss.profitBeforeTax.py)}</td>
                </tr>

                {/* Tax Expense */}
                <tr className="bg-slate-50 font-bold text-slate-900">
                  <td className="py-2 px-4" colSpan={4}>VI. Tax expense</td>
                </tr>
                {financials.profitAndLoss.taxExpense.map((item, idx) => (
                  <tr key={`tax-${idx}`} className="hover:bg-slate-50/60">
                    <td className="py-1.5 px-4 pl-8 text-slate-800">{item.particulars}</td>
                    <td className="py-1.5 px-3"></td>
                    <td className="py-1.5 px-4 font-mono text-right font-medium">{formatNumber(item.cyAmount)}</td>
                    <td className="py-1.5 px-4 font-mono text-right text-slate-500">{formatNumber(item.pyAmount)}</td>
                  </tr>
                ))}

                {/* PAT */}
                <tr className="border-t-2 border-b-2 border-slate-900 font-bold text-slate-900 bg-cyan-50/50">
                  <td className="py-2.5 px-4">VII. Profit for the period (V - VI)</td>
                  <td className="py-2.5 px-3"></td>
                  <td className="py-2.5 px-4 font-mono text-right underline decoration-double font-bold text-cyan-900">
                    {formatNumber(financials.profitAndLoss.profitAfterTax.cy)}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-right underline decoration-double text-slate-700">
                    {formatNumber(financials.profitAndLoss.profitAfterTax.py)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CASH FLOW STATEMENT (AS-3) */}
      {activeTab === 'cfs' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden p-6 space-y-4">
          <div className="text-center mb-6">
            <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider">{client.company_name}</h3>
            <p className="text-xs text-slate-500">Cash Flow Statement for the year ended 31st March 2025 (Indirect Method)</p>
            <p className="text-[11px] font-mono text-cyan-700 mt-0.5">({financials.denominationLabel})</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-300 text-slate-600 text-left bg-slate-50/80">
                  <th className="py-2 px-4 font-bold">Particulars</th>
                  <th className="py-2 px-4 font-mono font-bold text-right w-44">31-Mar-2025 (CY)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* A. Operating Activities */}
                <tr className="bg-slate-100 font-bold text-slate-900">
                  <td className="py-2 px-4" colSpan={2}>A. CASH FLOW FROM OPERATING ACTIVITIES</td>
                </tr>
                <tr>
                  <td className="py-1.5 px-4 pl-8">Net Profit before tax</td>
                  <td className="py-1.5 px-4 font-mono text-right font-medium">{formatNumber(cfs.operating_activities.net_profit_before_tax)}</td>
                </tr>
                {cfs.operating_activities.adjustments_non_cash.map((item, idx) => (
                  <tr key={`nc-${idx}`}>
                    <td className="py-1.5 px-4 pl-12 text-slate-600">{item.label}</td>
                    <td className="py-1.5 px-4 font-mono text-right">{formatNumber(item.cy_amount)}</td>
                  </tr>
                ))}
                <tr className="font-semibold bg-slate-50">
                  <td className="py-2 px-4 pl-8">Operating Profit before working capital changes</td>
                  <td className="py-2 px-4 font-mono text-right">{formatNumber(cfs.operating_activities.operating_profit_before_wc)}</td>
                </tr>
                {cfs.operating_activities.working_capital_changes.map((item, idx) => (
                  <tr key={`wc-${idx}`}>
                    <td className="py-1.5 px-4 pl-12 text-slate-600">{item.label}</td>
                    <td className="py-1.5 px-4 font-mono text-right">{formatNumber(item.cy_amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1.5 px-4 pl-8 text-rose-700">Less: Direct taxes paid (Net)</td>
                  <td className="py-1.5 px-4 font-mono text-right text-rose-700">{formatNumber(-cfs.operating_activities.direct_taxes_paid)}</td>
                </tr>
                <tr className="font-bold bg-cyan-50/40 border-t border-slate-300">
                  <td className="py-2 px-4">Net Cash from Operating Activities (A)</td>
                  <td className="py-2 px-4 font-mono text-right text-cyan-900">{formatNumber(cfs.operating_activities.net_cash_from_operating)}</td>
                </tr>

                {/* B. Investing Activities */}
                <tr className="bg-slate-100 font-bold text-slate-900">
                  <td className="py-2 px-4" colSpan={2}>B. CASH FLOW FROM INVESTING ACTIVITIES</td>
                </tr>
                {cfs.investing_activities.items.map((item, idx) => (
                  <tr key={`inv-${idx}`}>
                    <td className="py-1.5 px-4 pl-8 text-slate-600">{item.label}</td>
                    <td className="py-1.5 px-4 font-mono text-right">{formatNumber(item.cy_amount)}</td>
                  </tr>
                ))}
                <tr className="font-bold bg-cyan-50/40 border-t border-slate-300">
                  <td className="py-2 px-4">Net Cash from Investing Activities (B)</td>
                  <td className="py-2 px-4 font-mono text-right text-cyan-900">{formatNumber(cfs.investing_activities.net_cash_from_investing)}</td>
                </tr>

                {/* C. Financing Activities */}
                <tr className="bg-slate-100 font-bold text-slate-900">
                  <td className="py-2 px-4" colSpan={2}>C. CASH FLOW FROM FINANCING ACTIVITIES</td>
                </tr>
                {cfs.financing_activities.items.map((item, idx) => (
                  <tr key={`fin-${idx}`}>
                    <td className="py-1.5 px-4 pl-8 text-slate-600">{item.label}</td>
                    <td className="py-1.5 px-4 font-mono text-right">{formatNumber(item.cy_amount)}</td>
                  </tr>
                ))}
                <tr className="font-bold bg-cyan-50/40 border-t border-slate-300">
                  <td className="py-2 px-4">Net Cash from Financing Activities (C)</td>
                  <td className="py-2 px-4 font-mono text-right text-cyan-900">{formatNumber(cfs.financing_activities.net_cash_from_financing)}</td>
                </tr>

                {/* Cash Reconciliation */}
                <tr className="border-t-2 border-slate-400 font-bold bg-slate-50">
                  <td className="py-2 px-4">Net Increase / (Decrease) in Cash and Cash Equivalents (A + B + C)</td>
                  <td className="py-2 px-4 font-mono text-right">{formatNumber(cfs.net_increase_decrease_cash)}</td>
                </tr>
                <tr>
                  <td className="py-1.5 px-4 pl-8 text-slate-700">Cash and Cash Equivalents at beginning of year</td>
                  <td className="py-1.5 px-4 font-mono text-right">{formatNumber(cfs.opening_cash_equivalents)}</td>
                </tr>
                <tr className="border-t-2 border-b-2 border-slate-900 font-bold text-slate-900 bg-emerald-50/50">
                  <td className="py-2.5 px-4">Cash and Cash Equivalents at end of year</td>
                  <td className="py-2.5 px-4 font-mono text-right underline decoration-double font-bold text-emerald-900">
                    {formatNumber(cfs.closing_cash_equivalents)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: TAX & DEFERRED TAX */}
      {activeTab === 'tax' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Tax Computation */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 text-sm">Income Tax Computation</h3>
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setChosenRegime('115BAA')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded cursor-pointer transition-colors ${
                    chosenRegime === '115BAA' ? 'bg-cyan-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sec 115BAA (22%)
                </button>
                <button
                  onClick={() => setChosenRegime('REGULAR')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded cursor-pointer transition-colors ${
                    chosenRegime === 'REGULAR' ? 'bg-cyan-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Regular (25%) / MAT
                </button>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">Accounting Profit Before Tax (PBT)</span>
                <span className="font-mono font-bold text-slate-900">₹{financials.profitAndLoss.profitBeforeTax.cy.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">Taxable Business Income (PGBP)</span>
                <span className="font-mono font-bold text-slate-900">₹{taxComp.pgbpIncome.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">Base Corporate Tax Rate</span>
                <span className="font-mono font-semibold text-slate-700">{taxComp.regularTax.baseRate}%</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">Effective Tax Rate (with Surcharge & Cess)</span>
                <span className="font-mono font-bold text-cyan-700">{taxComp.regularTax.effectiveRate}%</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">Total Tax Liability (Normal)</span>
                <span className="font-mono font-bold text-slate-900">₹{taxComp.regularTax.totalTaxLiability.toLocaleString('en-IN')}</span>
              </div>
              {taxComp.matTax && (
                <div className="flex justify-between py-1.5 border-b border-slate-100 bg-amber-50/50 p-2 rounded">
                  <span className="text-amber-900 font-medium">MAT u/s 115JB (15% on Book Profit)</span>
                  <span className="font-mono font-bold text-amber-900">₹{taxComp.matTax.matTaxAmount.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between py-2 pt-3 border-t-2 border-slate-900 font-bold text-sm">
                <span>Final Payable Tax</span>
                <span className="font-mono text-cyan-900">₹{taxComp.finalPayableTax.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Right: Deferred Tax Engine */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-sm pb-3 border-b border-slate-200">
              Deferred Tax Position (AS-22 / Ind AS 12)
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">Depreciation Timing Difference</span>
                <span className="font-mono font-semibold text-slate-800">₹{taxComp.deferredTax.timingDifferenceDepreciation.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">Section 43B Disallowance Timing Diff</span>
                <span className="font-mono font-semibold text-slate-800">₹{taxComp.deferredTax.timingDifference43B.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">Net Timing Difference</span>
                <span className="font-mono font-bold text-slate-900">₹{taxComp.deferredTax.totalTimingDifference.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">Applicable Tax Rate</span>
                <span className="font-mono font-semibold text-slate-700">{taxComp.deferredTax.taxRate}%</span>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 mt-4 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Resulting Position</span>
                  <div className="text-base font-bold text-slate-900">
                    {taxComp.deferredTax.deferredTaxAssetOrLiability === 'DTA'
                      ? 'Deferred Tax Asset (DTA)'
                      : 'Deferred Tax Liability (DTL)'}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Amount</span>
                  <div className="text-lg font-bold font-mono text-cyan-700">
                    ₹{taxComp.deferredTax.deferredTaxAmount.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
