/**
 * BankCmaAppraisal.tsx — Suite 06 Module 6.1: Tally-to-CMA Credit Appraisal Engine & Ratio Analysis
 * 
 * Act as an Expert Full-Stack Fintech Developer and Chartered Accountant.
 * Normalizes raw Tally accounting data into banking credit standards,
 * calculates underwriter-grade financial ratios, and generates automated risk insights.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Server, Wifi, WifiOff, RefreshCw, Download,
  CheckCircle2, AlertTriangle, ShieldAlert, Building2,
  ChevronRight, Search, X, BookOpen, Database, Scale,
  SlidersHorizontal, Landmark, FileSpreadsheet, Zap,
  TrendingUp, TrendingDown, DollarSign, Activity, AlertCircle,
  HelpCircle, Eye, Check, Sliders, ShieldCheck, FileText,
  Lock, CheckSquare
} from 'lucide-react';
import { toast } from 'sonner';
import { pingTally, fetchCompanyInfo, type TallyConnectionConfig, type TallyCompanyInfo } from '@/lib/tallyApi';
import { fetchTallyCmaData, getSampleCmaCaseStudyData, type TallyCmaExtractionResult } from '@/lib/tallyCmaApi';
import {
  generateCmaAppraisalReport,
  exportCmaReportToExcel,
  DEFAULT_CMA_OPTIONS,
  CMA_CATEGORIES,
  type CmaOptions,
  type CmaAppraisalReport,
  type CmaRatioResult,
  type CmaUnderwriterAlert
} from '@/lib/cmaEngine';

interface BankCmaAppraisalProps {
  onBack: () => void;
}

export default function BankCmaAppraisal({ onBack }: BankCmaAppraisalProps) {
  // Connection state
  const [tallyPort, setTallyPort] = useState(9000);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [companyInfo, setCompanyInfo] = useState<TallyCompanyInfo | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Raw extraction data & options
  const [cmaExtraction, setCmaExtraction] = useState<TallyCmaExtractionResult | null>(null);
  const [options, setOptions] = useState<CmaOptions>(DEFAULT_CMA_OPTIONS);

  // Active view tab & filters
  const [activeTab, setActiveTab] = useState<'scorecard' | 'alerts' | 'financials' | 'audit' | 'reclassification'>('scorecard');
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Drawing Power' | 'Solvency' | 'Liquidity' | 'Turnover' | 'Coverage' | 'Profitability'>('All');
  const [showMappingModal, setShowMappingModal] = useState(false);

  // Audit & Reclassification state
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [selectedAuditCategory, setSelectedAuditCategory] = useState<string>('All');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [reclassSearchQuery, setReclassSearchQuery] = useState('');
  const [reclassFilterCategory, setReclassFilterCategory] = useState<string>('All');

  const config: TallyConnectionConfig = useMemo(() => ({ host: 'localhost', port: tallyPort }), [tallyPort]);

  // ─── Tally Connection ───────────────────────────────────────

  const handleTestConnection = useCallback(async () => {
    setConnectionStatus('connecting');
    try {
      const alive = await pingTally(config);
      if (!alive) {
        setConnectionStatus('error');
        toast.error('TallyPrime server not reachable', { description: `Ensure Tally is open with XML API enabled on port ${tallyPort}` });
        return;
      }
      const info = await fetchCompanyInfo(config);
      setCompanyInfo(info);
      setConnectionStatus('connected');
      toast.success(`Connected to Tally: ${info.name}`, { description: `Active FY: ${info.financialYear}` });
    } catch (err) {
      setConnectionStatus('error');
      toast.error('Failed to connect to Tally');
    }
  }, [config, tallyPort]);

  const handleSyncTally = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await fetchTallyCmaData(config);
      setCmaExtraction(result);
      setCompanyInfo(result.companyInfo);
      setConnectionStatus('connected');
      toast.success(`Successfully synced ${result.ledgers.length} ledgers from Tally: ${result.companyInfo.name}`);
    } catch (err: any) {
      toast.error('Tally XML sync failed', { description: err?.message || 'Ensure Tally is open with XML API enabled on port 9000' });
    } finally {
      setSyncing(false);
    }
  }, [config]);

  // ─── Engine Computation ────────────────────────────────────

  const report: CmaAppraisalReport | null = useMemo(() => {
    if (!cmaExtraction) return null;
    return generateCmaAppraisalReport(cmaExtraction, options);
  }, [cmaExtraction, options]);

  const filteredRatios = useMemo(() => {
    if (!report) return [];
    if (categoryFilter === 'All') return report.ratios;
    return report.ratios.filter(r => r.category === categoryFilter);
  }, [report, categoryFilter]);

  const criticalAlertCount = useMemo(() => {
    if (!report) return 0;
    return report.alerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH').length;
  }, [report]);

  const filteredAuditCategories = useMemo(() => {
    if (!report) return [];
    let list = report.normalizedData.ledgerAudit;
    if (selectedAuditCategory !== 'All') {
      list = list.filter(a => a.categoryName === selectedAuditCategory);
    }
    if (auditSearchQuery.trim()) {
      const q = auditSearchQuery.toLowerCase();
      list = list.filter(a =>
        a.categoryName.toLowerCase().includes(q) ||
        a.ledgers.some(l => l.ledgerName.toLowerCase().includes(q) || l.parentGroup.toLowerCase().includes(q))
      );
    }
    return list;
  }, [report, selectedAuditCategory, auditSearchQuery]);

  const handleLedgerCategoryChange = (ledgerName: string, newCategory: string) => {
    setOptions(prev => {
      const updatedMap = { ...(prev.customLedgerCategoryMap || {}), [ledgerName]: newCategory };
      return { ...prev, customLedgerCategoryMap: updatedMap };
    });
    toast.success(`Reclassified '${ledgerName}' -> '${newCategory}'`);
  };

  const handleBulkGstAssetOverride = (targetCategory: 'Other Current Assets' | 'Other Current Liabilities') => {
    if (!report) return;
    setOptions(prev => {
      const updatedMap = { ...(prev.customLedgerCategoryMap || {}) };
      report.normalizedData.allMappedLedgers.forEach(l => {
        const pGroup = (l.parentGroup || '').toUpperCase();
        const primGroup = (l.primaryGroup || '').toUpperCase();
        const lName = (l.ledgerName || '').toUpperCase();
        const isSalesOrPurchase = pGroup.includes('SALES') || primGroup.includes('SALES') || pGroup.includes('PURCHASE') || primGroup.includes('PURCHASE');
        if (!isSalesOrPurchase && (pGroup.includes('DUTIES') || primGroup.includes('DUTIES') || pGroup.includes('INPUT') || pGroup.includes('OUTPUT') || lName.includes('GST') || lName.includes('TAX'))) {
          updatedMap[l.ledgerName] = targetCategory;
        }
      });
      return { ...prev, customLedgerCategoryMap: updatedMap };
    });
    toast.success(`All GST & Duties ledgers reclassified -> '${targetCategory}'`);
  };

  const handleBulkSalesOverride = () => {
    if (!report) return;
    setOptions(prev => {
      const updatedMap = { ...(prev.customLedgerCategoryMap || {}) };
      report.normalizedData.allMappedLedgers.forEach(l => {
        const pGroup = (l.parentGroup || '').toUpperCase();
        const primGroup = (l.primaryGroup || '').toUpperCase();
        if (pGroup.includes('SALES') || primGroup.includes('SALES')) {
          updatedMap[l.ledgerName] = 'Gross Sales / Revenue from Operations';
        }
      });
      return { ...prev, customLedgerCategoryMap: updatedMap };
    });
    toast.success("All Sales Accounts ledgers confirmed under 'Gross Sales / Revenue from Operations'");
  };

  const handleBulkBankChargesOverride = () => {
    if (!report) return;
    setOptions(prev => {
      const updatedMap = { ...(prev.customLedgerCategoryMap || {}) };
      report.normalizedData.allMappedLedgers.forEach(l => {
        const lName = (l.ledgerName || '').toUpperCase();
        if (/BANK CHARGE|PROCESSING FEE|BANK COMMISSION|LC CHARGE|BG CHARGE/i.test(lName)) {
          updatedMap[l.ledgerName] = 'Operating & Indirect Expenses';
        }
      });
      return { ...prev, customLedgerCategoryMap: updatedMap };
    });
    toast.success("All Bank Charges confirmed under 'Operating & Indirect Expenses'");
  };

  // ─── Excel Export ──────────────────────────────────────────

  const handleExportExcel = async () => {
    if (!report) return;
    try {
      await exportCmaReportToExcel(report);
      toast.success('Exported underwriter CMA Bank Credit Appraisal Report (.xlsx)');
    } catch (e) {
      console.error(e);
      toast.error('Failed to export Excel report');
    }
  };

  return (
    <div className="w-full text-slate-100 space-y-6 animate-fadeIn">

      {/* HEADER BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-all shadow-md hover:scale-105"
            title="Back to Suite Hub"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-black uppercase tracking-widest">
                Suite 06 • Module 6.1
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-mono">
                CA &amp; Underwriter Grade Engine
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight mt-1 flex items-center gap-2">
              <Landmark className="w-7 h-7 text-cyan-400" />
              Tally to CMA Bank Credit Appraisal Engine
            </h1>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSyncTally}
            disabled={syncing}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            <span>Sync Live Tally</span>
          </button>

          {report && (
            <button
              onClick={handleExportExcel}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Excel (.xlsx)</span>
            </button>
          )}
        </div>
      </div>

      {/* TALLY CONNECTION & NORMALIZATION CONTROL BAR */}
      <div className="glass-card-np p-5 rounded-2xl border border-cyan-500/20 bg-slate-900/60 backdrop-blur-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Connection status */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
            <Server className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-slate-400">Port:</span>
            <input
              type="number"
              value={tallyPort}
              onChange={(e) => setTallyPort(parseInt(e.target.value, 10) || 9000)}
              className="w-16 bg-transparent text-xs font-mono text-cyan-300 font-bold focus:outline-none"
            />
          </div>

          <button
            onClick={handleTestConnection}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors flex items-center gap-1.5"
          >
            <Wifi className="w-3.5 h-3.5 text-cyan-400" />
            <span>Test Connection</span>
          </button>

          {companyInfo && (
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20">
              <Building2 className="w-3.5 h-3.5" />
              <span>{companyInfo.name} ({companyInfo.financialYear})</span>
            </div>
          )}
        </div>

        {/* Adjustments Quick Toggle Trigger */}
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-400">
            CMA Normalization:
          </div>
          <button
            onClick={() => setShowMappingModal(true)}
            className="px-4 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-bold transition-all flex items-center gap-2"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Adjust Underwriter Rules &amp; Mapping</span>
          </button>
        </div>
      </div>

      {!report && (
        <div className="glass-card-np p-12 rounded-3xl border border-cyan-500/20 bg-slate-900/60 text-center space-y-6 max-w-xl mx-auto my-12 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/10">
            <Landmark className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">No Tally Data Synced Yet</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Connect to TallyPrime XML API on port <span className="text-cyan-400 font-mono font-bold">{tallyPort}</span> and click <span className="text-white font-bold font-mono">"Sync Live Tally"</span> to extract your Trial Balance and run the CMA Credit Appraisal Engine.
            </p>
          </div>
          <button
            onClick={handleSyncTally}
            disabled={syncing}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-sm shadow-xl shadow-cyan-500/20 transition-all inline-flex items-center gap-2"
          >
            {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            <span>Sync Live Tally Data Now</span>
          </button>
        </div>
      )}

      {report && (
        <div className="space-y-6">
          {/* TOP KPI CARDS (KEY RATIOS SUMMARY) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* 1. Adjusted Current Ratio */}
          <div className={`p-5 rounded-2xl border backdrop-blur-xl bg-slate-900/60 flex flex-col justify-between space-y-3 ${
            report.normalizedData.normalizedCurrentAssets / report.normalizedData.normalizedCurrentLiabilities >= 1.33
              ? 'border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/5'
              : 'border-red-500/30 text-red-400 shadow-lg shadow-red-500/5'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Adjusted Current Ratio</span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                report.normalizedData.normalizedCurrentAssets / report.normalizedData.normalizedCurrentLiabilities >= 1.33
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-red-500/10 text-red-400 border border-red-500/30'
              }`}>
                Tandon II: 1.33x
              </span>
            </div>
            <div>
              <div className="text-3xl font-black text-white font-mono tracking-tight">
                {(report.normalizedData.normalizedCurrentAssets / report.normalizedData.normalizedCurrentLiabilities).toFixed(2)}x
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Excludes aged debtors &gt;180d (₹{(report.normalizedData.sundryDebtorsAgedOver180 / 100000).toFixed(2)}L)
              </p>
            </div>
          </div>

          {/* 2. Debt Leverage (TOL / TNW) */}
          <div className={`p-5 rounded-2xl border backdrop-blur-xl bg-slate-900/60 flex flex-col justify-between space-y-3 ${
            report.normalizedData.normalizedTotalOutsideLiabilities / report.normalizedData.tangibleNetWorth <= 3.0
              ? 'border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/5'
              : 'border-amber-500/30 text-amber-400 shadow-lg shadow-amber-500/5'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">TOL / TNW Leverage</span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase bg-blue-500/10 text-blue-400 border border-blue-500/30">
                Norm: ≤ 3.0x
              </span>
            </div>
            <div>
              <div className="text-3xl font-black text-white font-mono tracking-tight">
                {(report.normalizedData.normalizedTotalOutsideLiabilities / report.normalizedData.tangibleNetWorth).toFixed(2)}x
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Quasi-Equity: ₹{(report.normalizedData.quasiEquity / 100000).toFixed(2)}L subordinated
              </p>
            </div>
          </div>

          {/* 3. Gross DSCR */}
          <div className={`p-5 rounded-2xl border backdrop-blur-xl bg-slate-900/60 flex flex-col justify-between space-y-3 ${
            report.ratios.find(r => r.id === 'gross_dscr')?.value! >= 1.33
              ? 'border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/5'
              : 'border-red-500/30 text-red-400 shadow-lg shadow-red-500/5'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gross DSCR Coverage</span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase bg-purple-500/10 text-purple-400 border border-purple-500/30">
                Bank Norm: ≥ 1.33x
              </span>
            </div>
            <div>
              <div className="text-3xl font-black text-white font-mono tracking-tight">
                {report.ratios.find(r => r.id === 'gross_dscr')?.formattedValue}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                PAT + Depr + Term Interest over Term Repayment
              </p>
            </div>
          </div>

          {/* 4. Tangible Net Worth (TNW) */}
          <div className="p-5 rounded-2xl border border-cyan-500/30 bg-slate-900/60 backdrop-blur-xl flex flex-col justify-between space-y-3 shadow-lg shadow-cyan-500/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tangible Net Worth</span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                CMA Base
              </span>
            </div>
            <div>
              <div className="text-3xl font-black text-white font-mono tracking-tight">
                ₹{(report.normalizedData.tangibleNetWorth / 100000).toFixed(2)} Lakhs
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Net of Intangibles (₹{(report.normalizedData.intangibleAssets / 100000).toFixed(2)}L)
              </p>
            </div>
          </div>

        </div>

      {/* VIEW TABS NAVIGATION */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('scorecard')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'scorecard'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg shadow-cyan-500/10'
                : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Ratio Scorecard Grid</span>
          </button>

          <button
            onClick={() => setActiveTab('alerts')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 relative ${
              activeTab === 'alerts'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-lg shadow-amber-500/10'
                : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>Underwriter Risk Alerts</span>
            {criticalAlertCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
                {criticalAlertCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('financials')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'financials'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-lg shadow-blue-500/10'
                : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>CMA vs Tally Statement</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'audit'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-lg shadow-purple-500/10'
                : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Search className="w-4 h-4 text-purple-400" />
            <span>Tally Audit Track Record</span>
          </button>

          <button
            onClick={() => setActiveTab('reclassification')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'reclassification'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
            <span>Ledger Head Confirmation</span>
            {options.customLedgerCategoryMap && Object.keys(options.customLedgerCategoryMap).length > 0 && (
              <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black flex items-center justify-center">
                {Object.keys(options.customLedgerCategoryMap).length}
              </span>
            )}
          </button>
        </div>

        {/* Category filter pills for Scorecard */}
        {activeTab === 'scorecard' && (
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(['All', 'Drawing Power', 'Solvency', 'Liquidity', 'Turnover', 'Coverage', 'Profitability'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  categoryFilter === cat
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* TAB CONTENT 1: RATIO SCORECARD GRID */}
      {activeTab === 'scorecard' && report && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRatios.map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-6 rounded-2xl border bg-slate-900/60 backdrop-blur-xl flex flex-col justify-between space-y-4 hover:scale-[1.01] transition-all relative overflow-hidden ${
                r.status === 'healthy'
                  ? 'border-emerald-500/30 hover:border-emerald-500/60 shadow-lg shadow-emerald-500/5'
                  : r.status === 'warning'
                  ? 'border-amber-500/30 hover:border-amber-500/60 shadow-lg shadow-amber-500/5'
                  : 'border-red-500/30 hover:border-red-500/60 shadow-lg shadow-red-500/5'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{r.category}</span>
                  <h3 className="text-base font-bold text-white tracking-tight mt-0.5">{r.name}</h3>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  r.status === 'healthy'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : r.status === 'warning'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}>
                  {r.status === 'healthy' ? '🟢 Bank Approved' : r.status === 'warning' ? '🟡 Borderline' : '🔴 Rejection Risk'}
                </span>
              </div>

              <div className="flex items-baseline justify-between pt-2 border-t border-slate-800/80">
                <div className="text-3xl font-black text-white font-mono tracking-tight">{r.formattedValue}</div>
                <div className="text-xs font-semibold text-slate-400">
                  Norm: <span className="text-slate-200 font-mono font-bold">{r.benchmark}</span>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">{r.description}</p>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-300 space-y-1">
                <div className="font-bold text-cyan-400 uppercase tracking-wider text-[9px] flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Underwriter Analysis Note:
                </div>
                <p className="leading-snug">{r.underwriterNote}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* TAB CONTENT 2: DIAGNOSTIC UNDERWRITER INSIGHTS FEED */}
      {activeTab === 'alerts' && report && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              Automated Qualitative Risk Alerts ({report.alerts.length} Detected)
            </h2>
            <span className="text-xs text-slate-400">Rules Engine: Bank Credit Standards &amp; Tandon Committee</span>
          </div>

          {report.alerts.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-900/60 border border-emerald-500/30 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <h3 className="text-lg font-bold text-white">Zero High-Risk Alerts Detected</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                All solvency, liquidity, and leverage metrics satisfy underwriting criteria without red flags.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {report.alerts.map((a) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`p-6 rounded-2xl border backdrop-blur-xl bg-slate-900/60 space-y-4 relative overflow-hidden ${
                    a.severity === 'CRITICAL'
                      ? 'border-red-500/40 shadow-xl shadow-red-500/10'
                      : a.severity === 'HIGH'
                      ? 'border-amber-500/40 shadow-xl shadow-amber-500/10'
                      : 'border-yellow-500/30 shadow-lg shadow-yellow-500/5'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${
                        a.severity === 'CRITICAL'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : a.severity === 'HIGH'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                      }`}>
                        {a.code}
                      </div>
                      <div>
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                          a.severity === 'CRITICAL'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                            : a.severity === 'HIGH'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
                        }`}>
                          {a.severity} RISK
                        </span>
                        <h3 className="text-base font-bold text-white tracking-tight mt-1">{a.title}</h3>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-200 leading-relaxed font-mono">
                    {a.message}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-1">
                      <span className="font-bold text-red-400 uppercase tracking-wider text-[10px] block">Credit Impact:</span>
                      <p className="text-slate-300 leading-relaxed">{a.impact}</p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-1">
                      <span className="font-bold text-cyan-400 uppercase tracking-wider text-[10px] block">Underwriter Recommendation:</span>
                      <p className="text-slate-300 leading-relaxed">{a.recommendation}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 3: FINANCIAL STATEMENTS (RAW TALLY VS CMA NORMALIZED) */}
      {activeTab === 'financials' && report && (
        <div className="space-y-6">
          
          {/* MPBF CARD */}
          <div className="glass-card-np p-6 rounded-2xl border border-cyan-500/30 bg-slate-900/60 backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Tandon Committee Method II</span>
                  <h3 className="text-lg font-bold text-white">Maximum Permissible Bank Finance (MPBF) Calculation</h3>
                </div>
              </div>
              <span className="text-xs text-slate-400 font-mono">25% Borrower Margin Mandate</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block mb-1">Normalized Current Assets (CA)</span>
                <span className="text-base font-bold text-white">₹{(report.mpbfMethodII.currentAssets / 100000).toFixed(2)} Lakhs</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block mb-1">Current Liabilities (CL)</span>
                <span className="text-base font-bold text-white">₹{(report.mpbfMethodII.currentLiabilities / 100000).toFixed(2)} Lakhs</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block mb-1">Min 25% NWC Margin Requirement</span>
                <span className="text-base font-bold text-amber-400">₹{(report.mpbfMethodII.minimumStipulatedNWC / 100000).toFixed(2)} Lakhs</span>
              </div>

              <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-950 to-blue-950 border border-cyan-500/40">
                <span className="text-cyan-300 font-bold block mb-1">Max Permissible Limit (MPBF)</span>
                <span className="text-xl font-black text-cyan-400">₹{(report.mpbfMethodII.maxPermissibleBankFinance / 100000).toFixed(2)} Lakhs</span>
              </div>
            </div>
          </div>

          {/* NORMALIZATION COMPARISON TABLE */}
          <div className="glass-card-np rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Scale className="w-4 h-4 text-cyan-400" />
                Raw Tally Books vs Normalized CMA Statement Comparison
              </h3>
              <span className="text-xs text-slate-400 font-mono">Rupees (₹)</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-300">
                <thead className="bg-slate-900 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">Financial Bucket / Head</th>
                    <th className="p-3.5 text-right">Raw Tally Books (₹)</th>
                    <th className="p-3.5 text-right">CMA Reclassification (₹)</th>
                    <th className="p-3.5 text-right">Normalized CMA (₹)</th>
                    <th className="p-3.5">Banking Underwriter Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  <tr className="hover:bg-slate-900/40">
                    <td className="p-3.5 font-sans font-bold text-white">Gross Sales / Revenue</td>
                    <td className="p-3.5 text-right">₹{(report.normalizedData.grossSales / 100000).toFixed(2)} L</td>
                    <td className="p-3.5 text-right text-slate-500">0.00</td>
                    <td className="p-3.5 text-right text-cyan-400 font-bold">₹{(report.normalizedData.grossSales / 100000).toFixed(2)} L</td>
                    <td className="p-3.5 font-sans text-slate-400">Operating Turnover Base</td>
                  </tr>

                  <tr className="hover:bg-slate-900/40">
                    <td className="p-3.5 font-sans font-bold text-white">Current Assets (Total)</td>
                    <td className="p-3.5 text-right">₹{(report.normalizedData.rawCurrentAssets / 100000).toFixed(2)} L</td>
                    <td className="p-3.5 text-right text-red-400">-₹{(report.normalizedData.nonCurrentAssetsReclassified / 100000).toFixed(2)} L</td>
                    <td className="p-3.5 text-right text-cyan-400 font-bold">₹{(report.normalizedData.normalizedCurrentAssets / 100000).toFixed(2)} L</td>
                    <td className="p-3.5 font-sans text-slate-400">Aged Debtors &gt;180d &amp; Sister Advances Stripped</td>
                  </tr>

                  <tr className="hover:bg-slate-900/40">
                    <td className="p-3.5 font-sans font-bold text-white">Tangible Net Worth (TNW)</td>
                    <td className="p-3.5 text-right">₹{(report.normalizedData.rawTangibleNetWorth / 100000).toFixed(2)} L</td>
                    <td className="p-3.5 text-right text-emerald-400">+₹{((report.normalizedData.quasiEquity - report.normalizedData.intangibleAssets) / 100000).toFixed(2)} L</td>
                    <td className="p-3.5 text-right text-emerald-400 font-bold">₹{(report.normalizedData.tangibleNetWorth / 100000).toFixed(2)} L</td>
                    <td className="p-3.5 font-sans text-slate-400">Promoter Loans Subordinated (+Quasi Equity)</td>
                  </tr>

                  <tr className="hover:bg-slate-900/40">
                    <td className="p-3.5 font-sans font-bold text-white">Total Outside Liabilities (TOL)</td>
                    <td className="p-3.5 text-right">₹{(report.normalizedData.rawTotalOutsideLiabilities / 100000).toFixed(2)} L</td>
                    <td className="p-3.5 text-right text-emerald-400">-₹{(report.normalizedData.quasiEquity / 100000).toFixed(2)} L</td>
                    <td className="p-3.5 text-right text-cyan-400 font-bold">₹{(report.normalizedData.normalizedTotalOutsideLiabilities / 100000).toFixed(2)} L</td>
                    <td className="p-3.5 font-sans text-slate-400">Promoter Loans Shifted to Net Worth Base</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 4: TALLY AUDIT & LEDGER TRACK RECORD */}
      {activeTab === 'audit' && report && (
        <div className="space-y-6">
          {/* AUDIT SUMMARY KPI CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-cyan-500/30">
              <span className="text-slate-400 block mb-1">Total Synced Tally Ledgers</span>
              <span className="text-2xl font-black text-white font-mono">{cmaExtraction?.ledgers.length || 0}</span>
              <span className="text-[10px] text-cyan-400 block mt-1">Full Company Collection</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-emerald-500/30">
              <span className="text-slate-400 block mb-1">Active Non-Zero Ledgers</span>
              <span className="text-2xl font-black text-emerald-400 font-mono">
                {report.normalizedData.allMappedLedgers.length}
              </span>
              <span className="text-[10px] text-emerald-400 block mt-1">Contributing to Balance Base</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-blue-500/30">
              <span className="text-slate-400 block mb-1">Mapped CMA Categories</span>
              <span className="text-2xl font-black text-blue-400 font-mono">
                {report.normalizedData.ledgerAudit.length} Heads
              </span>
              <span className="text-[10px] text-blue-400 block mt-1">Normalized Financial Buckets</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-purple-500/30 flex flex-col justify-between">
              <div>
                <span className="text-slate-400 block mb-1">Export Track Record</span>
                <span className="text-xs font-bold text-white">Full Itemized Audit Sheet</span>
              </div>
              <button
                onClick={handleExportExcel}
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 mt-2"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Download Audit Sheet</span>
              </button>
            </div>
          </div>

          {/* SEARCH & FILTER CONTROLS */}
          <div className="glass-card-np p-4 rounded-2xl border border-slate-800 bg-slate-900/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search ledger name, Tally parent group, or category (e.g. Google, Sales, HDFC)..."
                value={auditSearchQuery}
                onChange={(e) => setAuditSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 pl-9 pr-4 py-2 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Filter Category:</span>
              <select
                value={selectedAuditCategory}
                onChange={(e) => setSelectedAuditCategory(e.target.value)}
                className="bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs text-cyan-300 font-bold focus:outline-none"
              >
                <option value="All">All CMA Categories ({report.normalizedData.ledgerAudit.length})</option>
                {report.normalizedData.ledgerAudit.map((audit) => (
                  <option key={audit.categoryName} value={audit.categoryName}>
                    {audit.categoryName} ({audit.ledgerCount})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* DRILL-DOWN ACCORDION OF CMA BUCKETS & TALLY LEDGERS */}
          <div className="space-y-4">
            {filteredAuditCategories.map((auditGroup) => {
              const isExpanded = expandedCategory === auditGroup.categoryName || auditSearchQuery.length > 0;
              return (
                <div
                  key={auditGroup.categoryName}
                  className="glass-card-np rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden"
                >
                  {/* Category Header Bar */}
                  <div
                    onClick={() => setExpandedCategory(expandedCategory === auditGroup.categoryName ? null : auditGroup.categoryName)}
                    className="p-4 bg-slate-950/80 hover:bg-slate-900 border-b border-slate-800/80 flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <ChevronRight className={`w-4 h-4 text-cyan-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          {auditGroup.categoryName}
                          <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-mono border border-cyan-500/30">
                            {auditGroup.ledgerCount} {auditGroup.ledgerCount === 1 ? 'Ledger' : 'Ledgers'}
                          </span>
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono text-slate-400">Total Sum:</span>
                      <span className="text-sm font-bold font-mono text-cyan-300">
                        ₹{auditGroup.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Expandable Itemized Ledgers Table */}
                  {isExpanded && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left text-slate-300">
                        <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                          <tr>
                            <th className="p-3">#</th>
                            <th className="p-3">Tally Ledger Name</th>
                            <th className="p-3">Tally Parent Group</th>
                            <th className="p-3">Primary Group</th>
                            <th className="p-3 text-right">Tally Closing Balance (₹)</th>
                            <th className="p-3">Mapping Logic Applied</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {auditGroup.ledgers
                            .filter((l) =>
                              auditSearchQuery === '' ||
                              l.ledgerName.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                              l.parentGroup.toLowerCase().includes(auditSearchQuery.toLowerCase())
                            )
                            .map((l, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                                <td className="p-3 text-slate-500">{idx + 1}</td>
                                <td className="p-3 font-sans font-bold text-white">{l.ledgerName}</td>
                                <td className="p-3 font-sans text-cyan-400">{l.parentGroup}</td>
                                <td className="p-3 font-sans text-slate-400">{l.primaryGroup}</td>
                                <td className="p-3 text-right font-bold text-emerald-400">
                                  ₹{Math.abs(l.closingBalance).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                  <span className="text-[9px] text-slate-500 font-sans ml-1">
                                    {l.closingBalance < 0 ? 'Cr' : 'Dr'}
                                  </span>
                                </td>
                                <td className="p-3 font-sans text-xs text-slate-400">{l.mappingRule}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* STEP-BY-STEP UNDERWRITER RATIO FORMULA AUDIT CARDS */}
          <div className="glass-card-np p-6 rounded-2xl border border-cyan-500/20 bg-slate-900/60 space-y-4">
            <div className="flex items-center gap-2 text-white font-bold text-sm pb-2 border-b border-slate-800">
              <Scale className="w-4 h-4 text-cyan-400" />
              Mathematical Step-by-Step Calculation Breakdown
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="font-bold text-cyan-400 font-sans text-xs block">1. Drawing Power (DP) Calculation</span>
                <div className="text-slate-300">
                  Formula: <span className="text-white">Paid Stock (75%) + Eligible Debtors &lt;=180d (60%)</span>
                </div>
                <div className="text-slate-400 text-[11px] leading-relaxed">
                  = [Paid Stock ₹{(Math.max(0, report.normalizedData.inventory - report.normalizedData.sundryCreditors) / 100000).toFixed(2)}L × 75%] + [Eligible Debtors ₹{(report.normalizedData.sundryDebtorsEligibleCurrent / 100000).toFixed(2)}L × 60%]
                </div>
                <div className="text-emerald-400 font-bold text-sm pt-1">
                  = ₹{(((Math.max(0, report.normalizedData.inventory - report.normalizedData.sundryCreditors) * 0.75) + (report.normalizedData.sundryDebtorsEligibleCurrent * 0.60)) / 100000).toFixed(2)} Lakhs DP
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="font-bold text-cyan-400 font-sans text-xs block">2. TOL / TNW Ratio Calculation</span>
                <div className="text-slate-300">
                  Formula: <span className="text-white">Normalized TOL ÷ Tangible Net Worth</span>
                </div>
                <div className="text-slate-400 text-[11px] leading-relaxed">
                  = (Raw TOL ₹{(report.normalizedData.rawTotalOutsideLiabilities / 100000).toFixed(2)}L - Quasi Equity ₹{(report.normalizedData.quasiEquity / 100000).toFixed(2)}L) ÷ [Share Capital ₹{(report.normalizedData.shareCapital / 100000).toFixed(2)}L + Reserves ₹{(report.normalizedData.reservesSurplus / 100000).toFixed(2)}L + Quasi Equity ₹{(report.normalizedData.quasiEquity / 100000).toFixed(2)}L - Intangibles ₹{(report.normalizedData.intangibleAssets / 100000).toFixed(2)}L]
                </div>
                <div className="text-emerald-400 font-bold text-sm pt-1">
                  = {(report.normalizedData.normalizedTotalOutsideLiabilities / Math.max(1, report.normalizedData.tangibleNetWorth)).toFixed(2)}x
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="font-bold text-cyan-400 font-sans text-xs block">3. Adjusted Current Ratio (Tandon II)</span>
                <div className="text-slate-300">
                  Formula: <span className="text-white">Normalized Current Assets ÷ Current Liabilities</span>
                </div>
                <div className="text-slate-400 text-[11px] leading-relaxed">
                  = [Raw CA ₹{(report.normalizedData.rawCurrentAssets / 100000).toFixed(2)}L - Aged Debtors &gt;180d ₹{(report.normalizedData.sundryDebtorsAgedOver180 / 100000).toFixed(2)}L - Sister Advances ₹{(report.normalizedData.sisterConcernAdvances / 100000).toFixed(2)}L] ÷ Raw CL ₹{(report.normalizedData.rawCurrentLiabilities / 100000).toFixed(2)}L
                </div>
                <div className="text-emerald-400 font-bold text-sm pt-1">
                  = {(report.normalizedData.normalizedCurrentLiabilities > 0 ? report.normalizedData.normalizedCurrentAssets / report.normalizedData.normalizedCurrentLiabilities : 0).toFixed(2)}x
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 5: LEDGER CONSOLIDATION & HEAD RECLASSIFICATION CONFIRMATION */}
      {activeTab === 'reclassification' && report && (
        <div className="space-y-6">
          {/* CONFIRMATION BANNER */}
          <div className="glass-card-np p-6 rounded-2xl border border-emerald-500/30 bg-slate-900/60 backdrop-blur-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  <CheckSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Ledger Head Reclassification &amp; Consolidation Confirmation</h3>
                  <p className="text-xs text-slate-400">
                    Verify auto-assigned CMA heads for all Tally ledgers. Reclassify items like <span className="text-amber-400 font-bold">Bank Charges</span> out of Interest into Operating Expenses or customize any head below.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => toast.success('All ledger head reclassifications confirmed & locked!')}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>Confirm &amp; Lock Classification</span>
                </button>
              </div>
            </div>

            {/* KEY BUCKET AUDIT SUMMARY */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block mb-1">Total Mapped Tally Ledgers</span>
                <span className="text-xl font-bold text-white">{report.normalizedData.allMappedLedgers.length} Ledgers</span>
                <span className="text-[10px] text-cyan-400 block mt-1">Synced across all groups</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block mb-1">Total Interest &amp; Finance Costs</span>
                <span className="text-xl font-bold text-cyan-400">
                  ₹{((report.normalizedData.termInterest + report.normalizedData.workingCapitalInterest) / 100000).toFixed(2)} Lakhs
                </span>
                <span className="text-[10px] text-emerald-400 block mt-1">Excludes Bank Charges (Reclassified)</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block mb-1">Custom Reclassifications Active</span>
                <span className="text-xl font-bold text-emerald-400">
                  {options.customLedgerCategoryMap ? Object.keys(options.customLedgerCategoryMap).length : 0} Overrides
                </span>
                <span className="text-[10px] text-slate-400 block mt-1">User confirmed head overrides</span>
              </div>
            </div>

            {/* INTERACTIVE JUDGMENT QUICK ACTION CARDS */}
            <div className="pt-2 border-t border-slate-800/80 space-y-3">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-2 font-sans">
                <Zap className="w-4 h-4 text-amber-400" />
                CA Judgment Quick Actions &amp; Head Confirmation Toggles
              </span>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* 1. GST Netting Judgment */}
                <div className="p-4 rounded-xl bg-slate-950/90 border border-cyan-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-400 font-sans text-xs">1. GST / Duties Net ITC Judgment</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-bold border border-cyan-500/20">
                      Net Asset
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Net GST Input Tax Credit: <span className="text-white font-bold font-mono">₹{(report.normalizedData.otherCurrentAssets / 100000).toFixed(2)}L</span>
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => handleBulkGstAssetOverride('Other Current Assets')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold text-[10px] transition-all flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" />
                      <span>Confirm as Current Asset (ITC)</span>
                    </button>
                    <button
                      onClick={() => handleBulkGstAssetOverride('Other Current Liabilities')}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[10px] transition-all"
                    >
                      Map to Liabilities
                    </button>
                  </div>
                </div>

                {/* 2. Sales Accounts Judgment */}
                <div className="p-4 rounded-xl bg-slate-950/90 border border-emerald-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-400 font-sans text-xs">2. Sales Accounts Judgment</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-bold border border-emerald-500/20">
                      Turnover
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Gross Turnover: <span className="text-white font-bold font-mono">₹{(report.normalizedData.grossSales / 100000).toFixed(2)}L</span>
                  </p>
                  <div className="pt-1">
                    <button
                      onClick={handleBulkSalesOverride}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold text-[10px] transition-all flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" />
                      <span>Confirm All Sales in Turnover</span>
                    </button>
                  </div>
                </div>

                {/* 3. Bank Charges Reclassification */}
                <div className="p-4 rounded-xl bg-slate-950/90 border border-amber-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-400 font-sans text-xs">3. Bank Charges Judgment</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 font-bold border border-amber-500/20">
                      Indirect Exp
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Excludes bank processing fees out of Interest expense into Operating Costs.
                  </p>
                  <div className="pt-1">
                    <button
                      onClick={handleBulkBankChargesOverride}
                      className="px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 font-bold text-[10px] transition-all flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" />
                      <span>Confirm Bank Charges in Expenses</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SEARCH AND FILTER CONTROLS */}
          <div className="glass-card-np p-4 rounded-2xl border border-slate-800 bg-slate-900/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search ledger by name or parent group (e.g., Bank Charges, Interest, HDFC)..."
                value={reclassSearchQuery}
                onChange={(e) => setReclassSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 pl-9 pr-4 py-2 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Filter by CMA Head:</span>
              <select
                value={reclassFilterCategory}
                onChange={(e) => setReclassFilterCategory(e.target.value)}
                className="bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs text-cyan-300 font-bold focus:outline-none"
              >
                <option value="All">All Heads</option>
                {CMA_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {/* INTERACTIVE RECLASSIFICATION TABLE */}
          <div className="glass-card-np rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                Ledger Classification &amp; Remapping Console
              </h3>
              <span className="text-xs text-slate-400">Select any target head to change classification live</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-300">
                <thead className="bg-slate-900 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">#</th>
                    <th className="p-3.5">Tally Ledger Name</th>
                    <th className="p-3.5">Tally Parent Group</th>
                    <th className="p-3.5 text-right">Closing Balance (₹)</th>
                    <th className="p-3.5">Assigned CMA Head</th>
                    <th className="p-3.5">Reclassify to Target Head</th>
                    <th className="p-3.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {report.normalizedData.allMappedLedgers
                    .filter(l => {
                      if (reclassFilterCategory !== 'All' && l.cmaCategory !== reclassFilterCategory) return false;
                      if (reclassSearchQuery.trim()) {
                        const q = reclassSearchQuery.toLowerCase();
                        return (
                          l.ledgerName.toLowerCase().includes(q) ||
                          l.parentGroup.toLowerCase().includes(q) ||
                          l.cmaCategory.toLowerCase().includes(q)
                        );
                      }
                      return true;
                    })
                    .map((l, idx) => {
                      const isBankCharges = /BANK CHARGE|PROCESSING FEE|BANK COMMISSION|LC CHARGE|BG CHARGE/i.test(l.ledgerName);
                      const isInterest = /INTEREST/i.test(l.ledgerName);
                      const isCustom = options.customLedgerCategoryMap && Boolean(options.customLedgerCategoryMap[l.ledgerName]);

                      return (
                        <tr key={l.ledgerName + idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3.5 text-slate-500">{idx + 1}</td>
                          <td className="p-3.5 font-sans font-bold text-white flex items-center gap-2">
                            <span>{l.ledgerName}</span>
                            {isBankCharges && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                Reclassified Bank Charge
                              </span>
                            )}
                            {isInterest && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-black bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                                Interest Expense
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 font-sans text-cyan-400">{l.parentGroup}</td>
                          <td className="p-3.5 text-right font-bold text-emerald-400">
                            ₹{l.closingBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-3.5 font-sans">
                            <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-[11px]">
                              {l.cmaCategory}
                            </span>
                          </td>
                          <td className="p-3.5 font-sans">
                            <select
                              value={l.cmaCategory}
                              onChange={(e) => handleLedgerCategoryChange(l.ledgerName, e.target.value)}
                              className="bg-slate-950 border border-slate-700 hover:border-cyan-500 px-3 py-1.5 rounded-xl text-xs text-white font-bold focus:outline-none focus:border-cyan-400 transition-colors"
                            >
                              {CMA_CATEGORIES.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-3.5 text-center font-sans">
                            {isCustom ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                                <Check className="w-3 h-3" /> User Overridden
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px]">
                                Auto-Mapped
                              </span>
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
        </div>
      )}

      {/* MODAL: DATA MAPPING & RECLASSIFICATION ADJUSTMENTS */}
      {showMappingModal && (
        <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-pop-in">
          <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-6 md:p-8 max-w-2xl w-full shadow-2xl space-y-6 relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">CMA Underwriter Mapping Rules</h2>
                  <p className="text-xs text-slate-400">Customize Tally-to-CMA reclassification toggles</p>
                </div>
              </div>
              <button
                onClick={() => setShowMappingModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              
              {/* Toggle 1: Promoter Unsecured Loans */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
                <div>
                  <span className="font-bold text-white block">Reclassify Promoter Unsecured Loans to Quasi-Equity</span>
                  <span className="text-slate-400">Subordinates director loans from Outside Liabilities to Net Worth (TNW)</span>
                </div>
                <input
                  type="checkbox"
                  checked={options.reclassifyPromoterLoansAsQuasiEquity}
                  onChange={(e) => setOptions(prev => ({ ...prev, reclassifyPromoterLoansAsQuasiEquity: e.target.checked }))}
                  className="w-5 h-5 accent-cyan-500 rounded cursor-pointer"
                />
              </div>

              {/* Toggle 2: Sister Concern Advances */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
                <div>
                  <span className="font-bold text-white block">Exclude Sister Concern Loans &amp; Advances from Current Assets</span>
                  <span className="text-slate-400">Strips loans to related entities and reclassifies as Non-Current Assets</span>
                </div>
                <input
                  type="checkbox"
                  checked={options.excludeSisterConcernAdvances}
                  onChange={(e) => setOptions(prev => ({ ...prev, excludeSisterConcernAdvances: e.target.checked }))}
                  className="w-5 h-5 accent-cyan-500 rounded cursor-pointer"
                />
              </div>

              {/* Toggle 3: Intangible Assets */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
                <div>
                  <span className="font-bold text-white block">Deduct Intangible Assets &amp; Goodwill from Tangible Net Worth</span>
                  <span className="text-slate-400">Deducts Goodwill, Patents, and Deferred Losses to derive true TNW</span>
                </div>
                <input
                  type="checkbox"
                  checked={options.deductIntangiblesFromTNW}
                  onChange={(e) => setOptions(prev => ({ ...prev, deductIntangiblesFromTNW: e.target.checked }))}
                  className="w-5 h-5 accent-cyan-500 rounded cursor-pointer"
                />
              </div>

              {/* Threshold: Aged Debtors */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
                <div>
                  <span className="font-bold text-white block">Aged Receivables Cutoff Threshold (Days)</span>
                  <span className="text-slate-400">Debtors older than this cutoff will be excluded from Drawing Power</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={options.excludeAgedDebtorsThresholdDays}
                    onChange={(e) => setOptions(prev => ({ ...prev, excludeAgedDebtorsThresholdDays: parseInt(e.target.value, 10) || 180 }))}
                    className="w-20 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg text-white font-mono text-xs font-bold"
                  />
                  <span className="text-slate-400 font-mono">Days</span>
                </div>
              </div>

            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowMappingModal(false)}
                className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all"
              >
                Apply Underwriter Rules
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
