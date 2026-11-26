/**
 * TallyLedgerImport.tsx — Module 3.3: Tally Ledger Voucher Import
 *
 * Connects to TallyPrime via XML API, lets user search and select
 * ledger names, fetches all vouchers/transactions for those ledgers,
 * displays them in a detailed table, and exports to styled Excel.
 *
 * ═══════════════════════════════════════════════════════════════
 * THIS FILE IS A COMPLETELY NEW MODULE.
 * IT DOES NOT MODIFY ANY EXISTING FILE.
 * ═══════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Server, Wifi, WifiOff, RefreshCw, Download,
  CheckCircle2, AlertTriangle, Loader2, Building2,
  ChevronRight, ChevronDown, Search, X, BookOpen,
  Database, ArrowUpDown, Filter, FileSpreadsheet, Zap
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx-js-style';
import {
  pingTally,
  fetchCompanyInfo,
  fetchAllLedgerNames,
  fetchLedgerVouchers,
  fetchLedgerBalances,
  type TallyConnectionConfig,
  type TallyCompanyInfo,
  type TallyLedgerListItem,
  type LedgerVoucherEntry,
  type LedgerBalanceSummary,
} from '@/lib/tallyApi';
import {
  buildLedgerImportWorkbook,
  formatSignedBalanceText,
  lookupLedgerBalance,
} from '@/lib/tallyLedgerExport';

// ─── Types ───────────────────────────────────────────────────

interface TallyLedgerImportProps {
  onBack: () => void;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type StepId = 'connect' | 'select' | 'results';
type SortField = 'date' | 'voucherNumber' | 'voucherType' | 'partyName' | 'debit' | 'credit' | 'ledgerName';
type SortDir = 'asc' | 'desc';

// ─── Component ───────────────────────────────────────────────

export default function TallyLedgerImport({ onBack }: TallyLedgerImportProps) {
  // Connection
  const [tallyPort, setTallyPort] = useState(9000);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [companyInfo, setCompanyInfo] = useState<TallyCompanyInfo | null>(null);

  // Step navigation
  const [currentStep, setCurrentStep] = useState<StepId>('connect');

  // Ledger selection
  const [allLedgers, setAllLedgers] = useState<TallyLedgerListItem[]>([]);
  const [selectedLedgers, setSelectedLedgers] = useState<Set<string>>(new Set());
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgersLoading, setLedgersLoading] = useState(false);
  const [groupFilter, setGroupFilter] = useState<string>('');

  // Date range
  const [fromDate, setFromDate] = useState('2026-04-01');
  const [toDate, setToDate] = useState('2027-03-31');

  // Results
  const [voucherEntries, setVoucherEntries] = useState<LedgerVoucherEntry[]>([]);
  const [ledgerBalances, setLedgerBalances] = useState<Map<string, LedgerBalanceSummary>>(new Map());
  const [fetchingVouchers, setFetchingVouchers] = useState(false);
  const [fetchProgress, setFetchProgress] = useState({ current: 0, total: 0, ledgerName: '' });

  // Table controls
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [entriesPage, setEntriesPage] = useState(1);
  const ENTRIES_PER_PAGE = 100;
  const [tableSearch, setTableSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [ledgerFilter, setLedgerFilter] = useState<string>('');

  const config: TallyConnectionConfig = { host: 'localhost', port: tallyPort };

  // ─── Connection ──────────────────────────────────────────

  const handleConnect = useCallback(async () => {
    setConnectionStatus('connecting');
    try {
      const alive = await pingTally(config);
      if (!alive) {
        setConnectionStatus('error');
        toast.error('Cannot reach TallyPrime', { description: `Ensure Tally is running on port ${tallyPort}` });
        return;
      }
      const info = await fetchCompanyInfo(config);
      setCompanyInfo(info);
      setConnectionStatus('connected');
      toast.success('Connected to TallyPrime', { description: info.name });

      // Auto-fetch ledger list
      setLedgersLoading(true);
      try {
        const ledgers = await fetchAllLedgerNames(config);
        setAllLedgers(ledgers);
        toast.success(`Loaded ${ledgers.length} ledgers`);
        setCurrentStep('select');
      } catch (err) {
        toast.error('Failed to fetch ledger list');
      } finally {
        setLedgersLoading(false);
      }
    } catch (err) {
      setConnectionStatus('error');
      toast.error('Connection failed');
    }
  }, [tallyPort]);

  // ─── Ledger Filtering ───────────────────────────────────

  const uniqueGroups = useMemo(() => {
    const groups = new Set<string>();
    allLedgers.forEach(l => { if (l.parent) groups.add(l.parent); });
    return Array.from(groups).sort();
  }, [allLedgers]);

  const filteredLedgers = useMemo(() => {
    let list = allLedgers;
    if (ledgerSearch) {
      const q = ledgerSearch.toLowerCase();
      list = list.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.parent.toLowerCase().includes(q)
      );
    }
    if (groupFilter) {
      list = list.filter(l => l.parent === groupFilter);
    }
    return list;
  }, [allLedgers, ledgerSearch, groupFilter]);

  const toggleLedger = (name: string) => {
    setSelectedLedgers(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedLedgers(prev => {
      const next = new Set(prev);
      filteredLedgers.forEach(l => next.add(l.name));
      return next;
    });
  };

  const clearAllSelected = () => setSelectedLedgers(new Set());

  // ─── Fetch Vouchers ──────────────────────────────────────

  const handleFetchVouchers = useCallback(async () => {
    const names = Array.from(selectedLedgers);
    if (names.length === 0) {
      toast.error('Select at least one ledger');
      return;
    }

    setFetchingVouchers(true);
    setVoucherEntries([]);
    setLedgerBalances(new Map());
    setEntriesPage(1);
    setLedgerFilter('');
    setTypeFilter('');
    setTableSearch('');
    setFetchProgress({ current: 1, total: names.length, ledgerName: 'Fetching vouchers & balances from Tally...' });

    try {
      const [allEntries, balances] = await Promise.all([
        fetchLedgerVouchers(names, fromDate, toDate, config),
        fetchLedgerBalances(names, fromDate, toDate, config, companyInfo?.financialYear),
      ]);
      setVoucherEntries(allEntries);
      setLedgerBalances(balances);
      setCurrentStep('results');
      toast.success(`Fetched ${allEntries.length} voucher entries & balances across ${names.length} ledgers`);
    } catch (err) {
      toast.error('Failed to fetch vouchers');
    } finally {
      setFetchingVouchers(false);
    }
  }, [selectedLedgers, fromDate, toDate, config, companyInfo?.financialYear]);

  // ─── Sorted & Filtered Results ───────────────────────────

  const processedEntries = useMemo(() => {
    let list = [...voucherEntries];

    // Text search
    if (tableSearch) {
      const q = tableSearch.toLowerCase();
      list = list.filter(e =>
        e.voucherNumber.toLowerCase().includes(q) ||
        e.partyName.toLowerCase().includes(q) ||
        e.narration.toLowerCase().includes(q) ||
        e.ledgerName.toLowerCase().includes(q) ||
        e.date.includes(q)
      );
    }

    // Type filter
    if (typeFilter) {
      list = list.filter(e => e.voucherType === typeFilter);
    }

    // Ledger filter
    if (ledgerFilter) {
      list = list.filter(e => e.ledgerName === ledgerFilter);
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'date': cmp = a.date.localeCompare(b.date); break;
        case 'voucherNumber': cmp = a.voucherNumber.localeCompare(b.voucherNumber); break;
        case 'voucherType': cmp = a.voucherType.localeCompare(b.voucherType); break;
        case 'partyName': cmp = a.partyName.localeCompare(b.partyName); break;
        case 'debit': cmp = a.debit - b.debit; break;
        case 'credit': cmp = a.credit - b.credit; break;
        case 'ledgerName': cmp = a.ledgerName.localeCompare(b.ledgerName); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [voucherEntries, tableSearch, typeFilter, ledgerFilter, sortField, sortDir]);

  const uniqueVoucherTypes = useMemo(() =>
    Array.from(new Set(voucherEntries.map(e => e.voucherType))).sort(),
    [voucherEntries]
  );

  const uniqueLedgerNames = useMemo(() => {
    const set = new Set<string>();
    selectedLedgers.forEach(l => set.add(l));
    ledgerBalances.forEach((_, k) => set.add(k));
    voucherEntries.forEach(e => set.add(e.ledgerName));
    return Array.from(set).sort();
  }, [selectedLedgers, ledgerBalances, voucherEntries]);

  const activeLedgerNames = useMemo(() => {
    if (ledgerFilter) return [ledgerFilter];
    return uniqueLedgerNames;
  }, [ledgerFilter, uniqueLedgerNames]);

  const totals = useMemo(() => ({
    debit: processedEntries.reduce((s, e) => s + e.debit, 0),
    credit: processedEntries.reduce((s, e) => s + e.credit, 0),
  }), [processedEntries]);

  const perLedgerSummaries = useMemo(() => {
    return uniqueLedgerNames.map(ln => {
      const bal = lookupLedgerBalance(ledgerBalances, ln);
      const op = bal?.openingBalance ?? 0;
      const cl = bal?.closingBalance ?? 0;
      const lEntries = voucherEntries.filter(e => e.ledgerName.toUpperCase() === ln.toUpperCase());
      const pDr = lEntries.reduce((s, e) => s + e.debit, 0);
      const pCr = lEntries.reduce((s, e) => s + e.credit, 0);
      const computedClosing = op + pDr - pCr;
      const isExactMatch = Math.abs(computedClosing - cl) < 0.05;
      return {
        ledgerName: ln,
        parent: bal?.parent || '',
        openingBalance: op,
        periodDebit: pDr,
        periodCredit: pCr,
        closingBalance: cl,
        voucherCount: lEntries.length,
        isExactMatch,
      };
    });
  }, [uniqueLedgerNames, ledgerBalances, voucherEntries]);

  const activeBalanceTotals = useMemo(() => {
    let openingSigned = 0;
    let closingSigned = 0;
    let openingDebit = 0;
    let openingCredit = 0;
    let closingDebit = 0;
    let closingCredit = 0;

    for (const ln of activeLedgerNames) {
      const bal = lookupLedgerBalance(ledgerBalances, ln);
      const op = bal?.openingBalance ?? 0;
      const cl = bal?.closingBalance ?? 0;
      openingSigned += op;
      closingSigned += cl;
      if (op > 0) openingDebit += op;
      else if (op < 0) openingCredit += Math.abs(op);
      if (cl > 0) closingDebit += cl;
      else if (cl < 0) closingCredit += Math.abs(cl);
    }

    return {
      openingSigned,
      closingSigned,
      openingDebit,
      openingCredit,
      closingDebit,
      closingCredit,
    };
  }, [activeLedgerNames, ledgerBalances]);

  const isSingleLedgerView = activeLedgerNames.length === 1;
  const showOpeningClosingRows = !tableSearch && !typeFilter;

  // ─── Sort handler ────────────────────────────────────────

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // ─── Export to Excel ─────────────────────────────────────

  const handleExport = useCallback(() => {
    if (processedEntries.length === 0 && ledgerBalances.size === 0) {
      toast.error('No data to export');
      return;
    }

    const wb = buildLedgerImportWorkbook({
      companyName: companyInfo?.name || 'Tally Company',
      fromDate,
      toDate,
      selectedLedgerNames: activeLedgerNames,
      entries: processedEntries,
      balances: ledgerBalances,
      isFilteredBySearchOrType: Boolean(tableSearch || typeFilter),
    });

    const fileName = `Ledger_Import_${companyInfo?.name?.replace(/[^A-Za-z0-9]/g, '_') || 'Tally'}_${fromDate}_to_${toDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success('Excel exported successfully', { description: fileName });
  }, [processedEntries, ledgerBalances, companyInfo, fromDate, toDate, activeLedgerNames, tableSearch, typeFilter]);

  // ─── Format helpers ──────────────────────────────────────

  const fmtAmount = (amt: number) => {
    if (!amt) return '—';
    return '₹ ' + amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtDate = (d: string) => {
    if (!d) return '';
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
  };

  // ─── Steps config ────────────────────────────────────────

  const steps: { id: StepId; label: string; icon: React.ReactNode }[] = [
    { id: 'connect', label: 'Connect to Tally', icon: <Server className="w-4 h-4" /> },
    { id: 'select', label: 'Select Ledgers', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'results', label: 'Voucher Results', icon: <Database className="w-4 h-4" /> },
  ];

  // ─── Render ──────────────────────────────────────────────

  return (
    <div className="w-full space-y-3.5 max-w-7xl mx-auto">

      {/* ─── TOP ELEVATED HEADER BAR (Suite 03 · Live) ─── */}
      <header className="mb-3 bg-white/95 backdrop-blur-xl shadow-xs rounded-2xl px-5 py-2.5 flex flex-wrap items-center justify-between gap-4 border border-slate-200/80">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-all shadow-2xs group"
            title="Return to Master Central Hub"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200/70 flex items-center justify-center text-orange-600 shrink-0 shadow-2xs">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-wide uppercase text-slate-900 leading-tight">
                Tally Ledger Voucher Import
              </h1>
              <span className="text-[10px] font-mono font-bold bg-orange-50 text-orange-700 px-2 py-0.5 rounded border border-orange-200 uppercase tracking-wider">
                Module 3.3 · Live
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono">
              Selective Ledger Extraction, Real-Time Voucher Query & Audit-Grade Excel Export
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold font-mono px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${
            connectionStatus === 'connected'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : connectionStatus === 'connecting'
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-rose-50 text-rose-700 border-rose-200'
          }`}>
            <span className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-400'}`} />
            {connectionStatus === 'connected' ? 'Port 9000 Online' : connectionStatus === 'connecting' ? 'Connecting...' : 'Port 9000 Offline'}
          </span>
        </div>
      </header>

      {/* STEP INDICATOR */}
      <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
        {steps.map((step, i) => {
          const isActive = currentStep === step.id;
          const isPast = steps.findIndex(s => s.id === currentStep) > i;
          return (
            <div key={step.id} className="flex items-center gap-2 flex-1">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                    : isPast
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'text-slate-500 border border-transparent'
                }`}
              >
                {isPast ? <CheckCircle2 className="w-3.5 h-3.5" /> : step.icon}
                <span className="hidden md:inline">{step.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-px ${isPast ? 'bg-emerald-500/30' : 'bg-slate-800'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* ═══════════ STEP 1: CONNECT ═══════════ */}
      {currentStep === 'connect' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 md:p-8 rounded-3xl bg-white border border-slate-200/80 shadow-xs backdrop-blur-xl space-y-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Connect to TallyPrime</h2>
              <p className="text-xs text-slate-600">Ensure TallyPrime is running with XML API enabled</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-slate-600 font-semibold uppercase tracking-wider">Tally Port</label>
              <input
                type="number"
                value={tallyPort}
                onChange={e => setTallyPort(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50/80 border border-slate-200 text-slate-900 text-sm focus:border-orange-500/50 focus:outline-none transition-colors"
                placeholder="9000"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-600 font-semibold uppercase tracking-wider">Status</label>
              <div className={`px-4 py-2.5 rounded-xl border text-sm font-semibold flex items-center gap-2 ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : connectionStatus === 'error'
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : connectionStatus === 'connecting'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-slate-50/80 border-slate-200 text-slate-500'
              }`}>
                {connectionStatus === 'connected' && <><Wifi className="w-4 h-4" /> Connected</>}
                {connectionStatus === 'error' && <><WifiOff className="w-4 h-4" /> Connection Failed</>}
                {connectionStatus === 'connecting' && <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>}
                {connectionStatus === 'disconnected' && <><WifiOff className="w-4 h-4" /> Disconnected</>}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-600 font-semibold uppercase tracking-wider">&nbsp;</label>
              <button
                onClick={handleConnect}
                disabled={connectionStatus === 'connecting'}
                className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-slate-900 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {connectionStatus === 'connecting' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>
                ) : ledgersLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Loading Ledgers...</>
                ) : (
                  <><Zap className="w-4 h-4" /> Connect & Load Ledgers</>
                )}
              </button>
            </div>
          </div>

          {companyInfo && (
            <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-3">
              <Building2 className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-sm font-bold text-emerald-300">{companyInfo.name}</p>
                <p className="text-[10px] text-slate-600">
                  {companyInfo.gstin && `GSTIN: ${companyInfo.gstin} • `}
                  {companyInfo.state && `State: ${companyInfo.state} • `}
                  {companyInfo.financialYear && `FY: ${companyInfo.financialYear}`}
                </p>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ═══════════ STEP 2: SELECT LEDGERS ═══════════ */}
      {currentStep === 'select' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Company info bar */}
          {companyInfo && (
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-3">
              <Building2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-bold text-emerald-300">{companyInfo.name}</span>
              <span className="text-xs text-slate-500">{allLedgers.length} ledgers available</span>
            </div>
          )}

          {/* Date range */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Filter className="w-4 h-4 text-orange-400" /> Date Range & Filters
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-200 text-slate-900 text-sm focus:border-orange-500/50 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-200 text-slate-900 text-sm focus:border-orange-500/50 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider">Filter by Group</label>
                <select
                  value={groupFilter}
                  onChange={e => setGroupFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-200 text-slate-900 text-sm focus:border-orange-500/50 focus:outline-none"
                >
                  <option value="">All Groups</option>
                  {uniqueGroups.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider">Search Ledger</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={ledgerSearch}
                    onChange={e => setLedgerSearch(e.target.value)}
                    placeholder="Type to search..."
                    className="w-full pl-9 pr-8 py-2 rounded-lg bg-slate-50/80 border border-slate-200 text-slate-900 text-sm focus:border-orange-500/50 focus:outline-none"
                  />
                  {ledgerSearch && (
                    <button onClick={() => setLedgerSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Selection controls */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <button
                onClick={selectAllVisible}
                className="px-3 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-bold uppercase tracking-wider hover:bg-orange-500/20 transition-all"
              >
                Select All Visible ({filteredLedgers.length})
              </button>
              {selectedLedgers.size > 0 && (
                <button
                  onClick={clearAllSelected}
                  className="px-3 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-wider hover:bg-red-500/20 transition-all"
                >
                  Clear All ({selectedLedgers.size})
                </button>
              )}
            </div>
            <span className="text-xs text-slate-600">
              {selectedLedgers.size} of {allLedgers.length} selected | Showing {filteredLedgers.length}
            </span>
          </div>

          {/* Ledger list */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs max-h-[420px] overflow-y-auto space-y-1 custom-scrollbar">
            {filteredLedgers.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                No ledgers match your search criteria
              </div>
            ) : (
              filteredLedgers.map(ledger => {
                const isSelected = selectedLedgers.has(ledger.name);
                return (
                  <div
                    key={ledger.name}
                    onClick={() => toggleLedger(ledger.name)}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-orange-500/10 border border-orange-500/30 text-orange-300'
                        : 'hover:bg-slate-100/40 border border-transparent text-slate-700'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? 'border-orange-500 bg-orange-500'
                        : 'border-slate-600'
                    }`}>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-slate-900" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{ledger.name}</p>
                    </div>
                    <span className="text-[10px] text-slate-500 px-2 py-0.5 rounded bg-slate-50/80 border border-slate-200/30 whitespace-nowrap">
                      {ledger.parent}
                    </span>
                    {ledger.closingBalance > 0 && (
                      <span className="text-xs text-slate-600 font-mono whitespace-nowrap">
                        ₹{ledger.closingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}{' '}
                        {ledger.signedClosingBalance !== undefined && ledger.signedClosingBalance !== 0 && (
                          <span className={ledger.signedClosingBalance > 0 ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                            {ledger.signedClosingBalance > 0 ? 'Dr' : 'Cr'}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentStep('connect')}
              className="px-4 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-100/60 border border-slate-200 text-slate-700 hover:text-slate-900 text-sm font-semibold transition-all flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={handleFetchVouchers}
              disabled={selectedLedgers.size === 0 || fetchingVouchers}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-slate-900 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {fetchingVouchers ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Fetching ({fetchProgress.current}/{fetchProgress.total})...
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  Fetch Vouchers for {selectedLedgers.size} Ledger{selectedLedgers.size > 1 ? 's' : ''}
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {/* Progress bar during fetch */}
          {fetchingVouchers && (
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-300 font-semibold">
                  Fetching: {fetchProgress.ledgerName}
                </span>
                <span className="text-slate-600">
                  {fetchProgress.current} / {fetchProgress.total}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-300"
                  style={{ width: `${(fetchProgress.current / fetchProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ═══════════ STEP 3: RESULTS ═══════════ */}
      {currentStep === 'results' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 space-y-1">
              <p className="text-[10px] text-blue-600 uppercase tracking-wider font-bold">
                {isSingleLedgerView ? 'Opening Balance' : 'Net Opening Balance'}
              </p>
              <p className="text-lg font-black text-blue-700 font-mono">
                {formatSignedBalanceText(activeBalanceTotals.openingSigned)}
              </p>
              <p className="text-[10px] text-slate-500 font-mono">As on {fmtDate(fromDate)}</p>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-1">
              <p className="text-[10px] text-emerald-600 uppercase tracking-wider font-bold">Period Debit</p>
              <p className="text-lg font-black text-emerald-700 font-mono">{fmtAmount(totals.debit)}</p>
              <p className="text-[10px] text-slate-500 font-mono">{processedEntries.length.toLocaleString()} entries</p>
            </div>
            <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/20 space-y-1">
              <p className="text-[10px] text-red-600 uppercase tracking-wider font-bold">Period Credit</p>
              <p className="text-lg font-black text-red-700 font-mono">{fmtAmount(totals.credit)}</p>
              <p className="text-[10px] text-slate-500 font-mono">{uniqueVoucherTypes.length} voucher types</p>
            </div>
            <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/30 space-y-1">
              <p className="text-[10px] text-teal-700 uppercase tracking-wider font-bold">
                {isSingleLedgerView ? 'Closing Balance' : 'Net Closing Balance'}
              </p>
              <p className="text-lg font-black text-teal-800 font-mono">
                {formatSignedBalanceText(activeBalanceTotals.closingSigned)}
              </p>
              <p className="text-[10px] text-slate-500 font-mono">As on {fmtDate(toDate)}</p>
            </div>
            <div className="p-4 rounded-2xl bg-orange-500/5 border border-orange-500/20 space-y-1">
              <p className="text-[10px] text-orange-600 uppercase tracking-wider font-bold">Ledgers</p>
              <p className="text-2xl font-black text-orange-700">{activeLedgerNames.length}</p>
              <p className="text-[10px] text-slate-500 font-mono">
                {ledgerFilter ? 'Filtered 1 ledger' : `${uniqueLedgerNames.length} selected`}
              </p>
            </div>
          </div>

          {/* Per-Ledger Opening & Closing Balances Summary */}
          {perLedgerSummaries.length > 0 && (
            <div className="rounded-2xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Ledger Opening &amp; Closing Balances (Tally Match)
                </span>
                {ledgerFilter && (
                  <button
                    onClick={() => { setLedgerFilter(''); setEntriesPage(1); }}
                    className="text-[11px] font-semibold text-orange-600 hover:text-orange-700"
                  >
                    Show All Ledgers
                  </button>
                )}
              </div>
              <div className="overflow-x-auto max-h-[200px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left font-bold text-slate-600 uppercase tracking-wider">Ledger Name</th>
                      <th className="px-4 py-2 text-left font-bold text-slate-600 uppercase tracking-wider">Group</th>
                      <th className="px-4 py-2 text-right font-bold text-blue-700 uppercase tracking-wider">Opening Balance</th>
                      <th className="px-4 py-2 text-right font-bold text-emerald-700 uppercase tracking-wider">Period Debit</th>
                      <th className="px-4 py-2 text-right font-bold text-red-700 uppercase tracking-wider">Period Credit</th>
                      <th className="px-4 py-2 text-right font-bold text-teal-700 uppercase tracking-wider">Closing Balance</th>
                      <th className="px-4 py-2 text-center font-bold text-slate-600 uppercase tracking-wider">Tally Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perLedgerSummaries.map(row => {
                      const isActive = ledgerFilter === row.ledgerName;
                      return (
                        <tr
                          key={row.ledgerName}
                          onClick={() => {
                            setLedgerFilter(isActive ? '' : row.ledgerName);
                            setEntriesPage(1);
                          }}
                          className={`border-b border-slate-100 cursor-pointer transition-colors ${
                            isActive ? 'bg-orange-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-4 py-2 font-semibold text-slate-900">{row.ledgerName}</td>
                          <td className="px-4 py-2 text-slate-500">{row.parent || '—'}</td>
                          <td className="px-4 py-2 text-right font-mono font-semibold text-blue-700">
                            {formatSignedBalanceText(row.openingBalance)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-emerald-700">
                            {row.periodDebit > 0 ? fmtAmount(row.periodDebit) : '—'}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-red-700">
                            {row.periodCredit > 0 ? fmtAmount(row.periodCredit) : '—'}
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-bold text-teal-800">
                            {formatSignedBalanceText(row.closingBalance)}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {row.isExactMatch ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                <CheckCircle2 className="w-3 h-3" /> Exact
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold" title="Opening + Debit - Credit differs slightly from Tally Closing">
                                <AlertTriangle className="w-3 h-3" /> Check
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
          )}

          {/* Table controls */}
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-white border border-slate-200/80 shadow-xs">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={tableSearch}
                onChange={e => { setTableSearch(e.target.value); setEntriesPage(1); }}
                placeholder="Search vouchers, parties, narration..."
                className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-50/80 border border-slate-200 text-slate-900 text-sm focus:border-orange-500/50 focus:outline-none"
              />
            </div>
            <select
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setEntriesPage(1); }}
              className="px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-200 text-slate-900 text-sm focus:border-orange-500/50 focus:outline-none"
            >
              <option value="">All Types</option>
              {uniqueVoucherTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={ledgerFilter}
              onChange={e => { setLedgerFilter(e.target.value); setEntriesPage(1); }}
              className="px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-200 text-slate-900 text-sm focus:border-orange-500/50 focus:outline-none"
            >
              <option value="">All Ledgers</option>
              {uniqueLedgerNames.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <button
              onClick={handleExport}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-900 text-sm font-bold flex items-center gap-2 transition-all"
            >
              <Download className="w-4 h-4" /> Export Excel
            </button>
          </div>

          {/* Data table */}
          <div className="rounded-2xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-white/95 border-b border-slate-200">
                    {[
                      { field: 'date' as SortField, label: 'Date', width: 'w-[100px]' },
                      { field: 'voucherNumber' as SortField, label: 'Voucher No.', width: '' },
                      { field: 'voucherType' as SortField, label: 'Type', width: '' },
                      { field: 'ledgerName' as SortField, label: 'Ledger', width: '' },
                      { field: 'partyName' as SortField, label: 'Party Name', width: '' },
                      { field: 'debit' as SortField, label: 'Debit (₹)', width: 'w-[130px]' },
                      { field: 'credit' as SortField, label: 'Credit (₹)', width: 'w-[130px]' },
                    ].map(col => (
                      <th
                        key={col.field}
                        onClick={() => handleSort(col.field)}
                        className={`px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider cursor-pointer hover:text-orange-400 transition-colors ${
                          col.width
                        } ${sortField === col.field ? 'text-orange-400' : 'text-slate-600'}`}
                      >
                        <span className="flex items-center gap-1">
                          {col.label}
                          <ArrowUpDown className="w-3 h-3" />
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-slate-600">
                      Narration
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {showOpeningClosingRows && entriesPage === 1 && isSingleLedgerView && (
                    <tr className="border-b border-blue-200 bg-blue-50/70">
                      <td className="px-4 py-2.5 text-blue-800 font-mono text-xs whitespace-nowrap font-semibold">
                        {fmtDate(fromDate)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 font-semibold text-xs">—</td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded-md bg-blue-100 border border-blue-200 text-blue-800 text-[10px] font-bold">
                          Opening Balance
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-blue-900 text-xs font-semibold max-w-[200px] truncate">
                        {activeLedgerNames[0]}
                      </td>
                      <td className="px-4 py-2.5 text-blue-900 text-xs font-bold">
                        Opening Balance
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs font-bold text-blue-800">
                        {activeBalanceTotals.openingSigned > 0
                          ? fmtAmount(activeBalanceTotals.openingSigned)
                          : activeBalanceTotals.openingSigned === 0
                          ? '₹ 0.00'
                          : ''}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs font-bold text-blue-800">
                        {activeBalanceTotals.openingSigned < 0
                          ? fmtAmount(Math.abs(activeBalanceTotals.openingSigned))
                          : ''}
                      </td>
                      <td className="px-4 py-2.5 text-blue-700 text-xs">
                        Opening balance as on {fmtDate(fromDate)}
                      </td>
                    </tr>
                  )}
                  {processedEntries.length === 0 ? (
                    !showOpeningClosingRows || !isSingleLedgerView ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                          No voucher entries found matching your filters
                        </td>
                      </tr>
                    ) : null
                  ) : (
                    processedEntries.slice((entriesPage - 1) * ENTRIES_PER_PAGE, entriesPage * ENTRIES_PER_PAGE).map((entry, idx) => (
                      <tr
                        key={`${entry.voucherNumber}-${entry.ledgerName}-${idx}`}
                        className="border-b border-slate-200/30 hover:bg-slate-100/20 transition-colors"
                      >
                        <td className="px-4 py-2.5 text-slate-700 font-mono text-xs whitespace-nowrap">
                          {fmtDate(entry.date)}
                        </td>
                        <td className="px-4 py-2.5 text-slate-900 font-semibold text-xs">
                          {entry.voucherNumber || '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 rounded-md bg-slate-800/60 border border-slate-200/30 text-slate-700 text-[10px] font-bold">
                            {entry.voucherType}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-orange-600 text-xs font-medium max-w-[200px] truncate" title={entry.ledgerName}>
                          {entry.ledgerName}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 text-xs max-w-[200px] truncate" title={entry.partyName}>
                          {entry.partyName || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          {entry.debit > 0 && (
                            <span className="text-emerald-600 font-medium">{fmtAmount(entry.debit)}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          {entry.credit > 0 && (
                            <span className="text-red-600 font-medium">{fmtAmount(entry.credit)}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs max-w-[250px] truncate" title={entry.narration}>
                          {entry.narration || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {(processedEntries.length > 0 || (showOpeningClosingRows && ledgerBalances.size > 0)) && (
                  <tfoot className="sticky bottom-0">
                    <tr className="bg-white/95 border-t-2 border-orange-500/30">
                      <td colSpan={5} className="px-4 py-2.5 text-right text-xs font-black text-slate-900 uppercase tracking-wider">
                        {showOpeningClosingRows ? `Current Total (${processedEntries.length} entries)` : `Total (${processedEntries.length} entries)`}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm font-black text-emerald-700">
                        {fmtAmount(totals.debit)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm font-black text-red-700">
                        {fmtAmount(totals.credit)}
                      </td>
                      <td className="px-4 py-2.5" />
                    </tr>
                    {showOpeningClosingRows && ledgerBalances.size > 0 && (
                      <>
                        {!isSingleLedgerView && (
                          <tr className="bg-blue-50/95 border-t border-blue-200">
                            <td colSpan={5} className="px-4 py-2 text-right text-xs font-bold text-blue-900 uppercase tracking-wider">
                              Opening Balance Total (All Selected)
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-xs font-bold text-blue-800">
                              {activeBalanceTotals.openingDebit > 0 ? fmtAmount(activeBalanceTotals.openingDebit) : '—'}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-xs font-bold text-blue-800">
                              {activeBalanceTotals.openingCredit > 0 ? fmtAmount(activeBalanceTotals.openingCredit) : '—'}
                            </td>
                            <td className="px-4 py-2 text-xs text-blue-700 font-mono">
                              Net: {formatSignedBalanceText(activeBalanceTotals.openingSigned)}
                            </td>
                          </tr>
                        )}
                        <tr className="bg-teal-50/95 border-t border-teal-200">
                          <td colSpan={5} className="px-4 py-2.5 text-right text-xs font-black text-teal-900 uppercase tracking-wider">
                            {isSingleLedgerView ? 'Closing Balance' : 'Net Closing Balance'} (
                            {activeBalanceTotals.closingSigned > 0 ? 'Dr' : activeBalanceTotals.closingSigned < 0 ? 'Cr' : 'Nil'})
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-sm font-black text-teal-800">
                            {activeBalanceTotals.closingSigned > 0
                              ? fmtAmount(activeBalanceTotals.closingSigned)
                              : activeBalanceTotals.closingSigned === 0
                              ? '₹ 0.00'
                              : ''}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-sm font-black text-teal-800">
                            {activeBalanceTotals.closingSigned < 0
                              ? fmtAmount(Math.abs(activeBalanceTotals.closingSigned))
                              : ''}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-teal-700 font-mono">
                            As on {fmtDate(toDate)}
                          </td>
                        </tr>
                      </>
                    )}
                  </tfoot>
                )}
              </table>
            </div>

            {Math.ceil(processedEntries.length / ENTRIES_PER_PAGE) > 1 && (
              <div className="flex items-center justify-between px-6 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-600">
                <span>
                  Showing {((entriesPage - 1) * ENTRIES_PER_PAGE) + 1} to {Math.min(entriesPage * ENTRIES_PER_PAGE, processedEntries.length)} of {processedEntries.length} entries
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={entriesPage <= 1}
                    onClick={() => setEntriesPage(p => Math.max(1, p - 1))}
                    className="px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-slate-700"
                  >
                    Previous
                  </button>
                  <span className="font-mono font-bold text-slate-800">
                    Page {entriesPage} of {Math.ceil(processedEntries.length / ENTRIES_PER_PAGE)}
                  </span>
                  <button
                    type="button"
                    disabled={entriesPage >= Math.ceil(processedEntries.length / ENTRIES_PER_PAGE)}
                    onClick={() => setEntriesPage(p => Math.min(Math.ceil(processedEntries.length / ENTRIES_PER_PAGE), p + 1))}
                    className="px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-slate-700"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentStep('select')}
              className="px-4 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-100/60 border border-slate-200 text-slate-700 hover:text-slate-900 text-sm font-semibold transition-all flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Change Ledgers
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExport}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-900 text-sm font-bold flex items-center gap-2 transition-all"
              >
                <FileSpreadsheet className="w-4 h-4" /> Export to Excel
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Custom scrollbar styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.3); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.2); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.4); }
      `}</style>
    </div>
  );
}
