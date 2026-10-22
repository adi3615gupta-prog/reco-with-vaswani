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
  type TallyConnectionConfig,
  type TallyCompanyInfo,
  type TallyLedgerListItem,
  type LedgerVoucherEntry,
} from '@/lib/tallyApi';

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
  const [fromDate, setFromDate] = useState('2025-04-01');
  const [toDate, setToDate] = useState('2026-03-31');

  // Results
  const [voucherEntries, setVoucherEntries] = useState<LedgerVoucherEntry[]>([]);
  const [fetchingVouchers, setFetchingVouchers] = useState(false);
  const [fetchProgress, setFetchProgress] = useState({ current: 0, total: 0, ledgerName: '' });

  // Table controls
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
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
    setFetchProgress({ current: 1, total: names.length, ledgerName: 'Fetching from Tally...' });

    try {
      const allEntries = await fetchLedgerVouchers(names, fromDate, toDate, config);
      setVoucherEntries(allEntries);
      setCurrentStep('results');
      toast.success(`Fetched ${allEntries.length} voucher entries across ${names.length} ledgers`);
    } catch (err) {
      toast.error('Failed to fetch vouchers');
    } finally {
      setFetchingVouchers(false);
    }
  }, [selectedLedgers, fromDate, toDate, config]);

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

  const uniqueLedgerNames = useMemo(() =>
    Array.from(new Set(voucherEntries.map(e => e.ledgerName))).sort(),
    [voucherEntries]
  );

  const totals = useMemo(() => ({
    debit: processedEntries.reduce((s, e) => s + e.debit, 0),
    credit: processedEntries.reduce((s, e) => s + e.credit, 0),
  }), [processedEntries]);

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
    if (processedEntries.length === 0) {
      toast.error('No data to export');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Header style
    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      fill: { fgColor: { rgb: '1E3A5F' } },
      alignment: { horizontal: 'center' as const, vertical: 'center' as const },
      border: {
        top: { style: 'thin' as const, color: { rgb: '999999' } },
        bottom: { style: 'thin' as const, color: { rgb: '999999' } },
        left: { style: 'thin' as const, color: { rgb: '999999' } },
        right: { style: 'thin' as const, color: { rgb: '999999' } },
      }
    };

    const cellBorder = {
      top: { style: 'thin' as const, color: { rgb: 'DDDDDD' } },
      bottom: { style: 'thin' as const, color: { rgb: 'DDDDDD' } },
      left: { style: 'thin' as const, color: { rgb: 'DDDDDD' } },
      right: { style: 'thin' as const, color: { rgb: 'DDDDDD' } },
    };

    const numFmt = '#,##0.00';

    // Build data
    const headers = ['Date', 'Voucher No.', 'Voucher Type', 'Ledger Name', 'Party Name', 'Debit (₹)', 'Credit (₹)', 'Narration'];
    const rows = processedEntries.map(e => [
      e.date, e.voucherNumber, e.voucherType, e.ledgerName, e.partyName,
      e.debit || '', e.credit || '', e.narration
    ]);

    // Add totals row
    rows.push(['', '', '', '', 'TOTAL', totals.debit, totals.credit, '']);

    const ws = XLSX.utils.aoa_to_sheet([
      [`Ledger Voucher Import — ${companyInfo?.name || 'Tally Company'}`],
      [`Period: ${fromDate} to ${toDate} | Ledgers: ${Array.from(selectedLedgers).join(', ')}`],
      [],
      headers,
      ...rows
    ]);

    // Merge title cells
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
    ];

    // Title style
    if (ws['A1']) ws['A1'].s = { font: { bold: true, sz: 14, color: { rgb: '1E3A5F' } }, alignment: { horizontal: 'center' } };
    if (ws['A2']) ws['A2'].s = { font: { sz: 10, color: { rgb: '666666' } }, alignment: { horizontal: 'center' } };

    // Header row styles
    const headerRowIdx = 3;
    headers.forEach((_, ci) => {
      const cellRef = XLSX.utils.encode_cell({ r: headerRowIdx, c: ci });
      if (ws[cellRef]) ws[cellRef].s = headerStyle;
    });

    // Data cell styles
    for (let ri = 0; ri < rows.length; ri++) {
      const isTotal = ri === rows.length - 1;
      for (let ci = 0; ci < headers.length; ci++) {
        const cellRef = XLSX.utils.encode_cell({ r: headerRowIdx + 1 + ri, c: ci });
        if (ws[cellRef]) {
          const style: any = { border: cellBorder };
          if (isTotal) {
            style.font = { bold: true, sz: 11 };
            style.fill = { fgColor: { rgb: 'F0F4F8' } };
          }
          if (ci === 5 || ci === 6) {
            style.numFmt = numFmt;
            if (typeof ws[cellRef].v === 'number') {
              style.alignment = { horizontal: 'right' };
            }
          }
          ws[cellRef].s = { ...ws[cellRef].s, ...style };
        }
      }
    }

    // Column widths
    ws['!cols'] = [
      { wch: 12 }, // Date
      { wch: 16 }, // Voucher No
      { wch: 16 }, // Voucher Type
      { wch: 30 }, // Ledger Name
      { wch: 30 }, // Party Name
      { wch: 15 }, // Debit
      { wch: 15 }, // Credit
      { wch: 40 }, // Narration
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Ledger Vouchers');

    // Per-ledger sheets
    const ledgerNames = Array.from(new Set(processedEntries.map(e => e.ledgerName)));
    for (const ln of ledgerNames) {
      const lEntries = processedEntries.filter(e => e.ledgerName === ln);
      if (lEntries.length === 0) continue;

      const lHeaders = ['Date', 'Voucher No.', 'Voucher Type', 'Party Name', 'Debit (₹)', 'Credit (₹)', 'Narration'];
      const lRows = lEntries.map(e => [
        e.date, e.voucherNumber, e.voucherType, e.partyName,
        e.debit || '', e.credit || '', e.narration
      ]);
      const lTotalDebit = lEntries.reduce((s, e) => s + e.debit, 0);
      const lTotalCredit = lEntries.reduce((s, e) => s + e.credit, 0);
      lRows.push(['', '', '', 'TOTAL', lTotalDebit, lTotalCredit, '']);

      const lws = XLSX.utils.aoa_to_sheet([
        [`${ln} — Voucher Details`],
        [],
        lHeaders,
        ...lRows
      ]);

      lws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
      if (lws['A1']) lws['A1'].s = { font: { bold: true, sz: 13, color: { rgb: '1E3A5F' } } };

      const lHeaderRowIdx = 2;
      lHeaders.forEach((_, ci) => {
        const cellRef = XLSX.utils.encode_cell({ r: lHeaderRowIdx, c: ci });
        if (lws[cellRef]) lws[cellRef].s = headerStyle;
      });

      lws['!cols'] = [
        { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 40 },
      ];

      // Sanitize sheet name (max 31 chars, no special chars)
      const sheetName = ln.replace(/[\\/*?[\]:]/g, '').substring(0, 31) || 'Ledger';
      XLSX.utils.book_append_sheet(wb, lws, sheetName);
    }

    const fileName = `Ledger_Import_${companyInfo?.name?.replace(/[^A-Za-z0-9]/g, '_') || 'Tally'}_${fromDate}_to_${toDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success('Excel exported successfully', { description: fileName });
  }, [processedEntries, companyInfo, fromDate, toDate, selectedLedgers, totals]);

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
    <div className="w-full space-y-6 max-w-7xl mx-auto">

      {/* HEADER */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 text-slate-300 hover:text-white text-sm font-semibold transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> ← Back to All Suites
        </button>
        <div className="flex-1" />
        <span className="px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[10px] font-black uppercase tracking-widest">
          Module 3.3
        </span>
      </div>

      {/* TITLE */}
      <div className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
            <BookOpen className="w-6 h-6" />
          </div>
          Tally Ledger Voucher Import
        </h1>
        <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
          Connect to TallyPrime, select specific ledgers, and import all their vouchers with full transaction details. Export to styled Excel workbooks.
        </p>
      </div>

      {/* STEP INDICATOR */}
      <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900/60 border border-slate-800/50">
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
          className="p-6 md:p-8 rounded-3xl bg-slate-900/60 border border-slate-800/50 backdrop-blur-xl space-y-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Connect to TallyPrime</h2>
              <p className="text-xs text-slate-400">Ensure TallyPrime is running with XML API enabled</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Tally Port</label>
              <input
                type="number"
                value={tallyPort}
                onChange={e => setTallyPort(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-700/50 text-white text-sm focus:border-orange-500/50 focus:outline-none transition-colors"
                placeholder="9000"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Status</label>
              <div className={`px-4 py-2.5 rounded-xl border text-sm font-semibold flex items-center gap-2 ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : connectionStatus === 'error'
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : connectionStatus === 'connecting'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-slate-950/60 border-slate-700/50 text-slate-500'
              }`}>
                {connectionStatus === 'connected' && <><Wifi className="w-4 h-4" /> Connected</>}
                {connectionStatus === 'error' && <><WifiOff className="w-4 h-4" /> Connection Failed</>}
                {connectionStatus === 'connecting' && <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>}
                {connectionStatus === 'disconnected' && <><WifiOff className="w-4 h-4" /> Disconnected</>}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">&nbsp;</label>
              <button
                onClick={handleConnect}
                disabled={connectionStatus === 'connecting'}
                className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                <p className="text-[10px] text-slate-400">
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
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/50 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Filter className="w-4 h-4 text-orange-400" /> Date Range & Filters
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700/50 text-white text-sm focus:border-orange-500/50 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700/50 text-white text-sm focus:border-orange-500/50 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Filter by Group</label>
                <select
                  value={groupFilter}
                  onChange={e => setGroupFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700/50 text-white text-sm focus:border-orange-500/50 focus:outline-none"
                >
                  <option value="">All Groups</option>
                  {uniqueGroups.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Search Ledger</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={ledgerSearch}
                    onChange={e => setLedgerSearch(e.target.value)}
                    placeholder="Type to search..."
                    className="w-full pl-9 pr-8 py-2 rounded-lg bg-slate-950/60 border border-slate-700/50 text-white text-sm focus:border-orange-500/50 focus:outline-none"
                  />
                  {ledgerSearch && (
                    <button onClick={() => setLedgerSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
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
            <span className="text-xs text-slate-400">
              {selectedLedgers.size} of {allLedgers.length} selected | Showing {filteredLedgers.length}
            </span>
          </div>

          {/* Ledger list */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/50 max-h-[420px] overflow-y-auto space-y-1 custom-scrollbar">
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
                        : 'hover:bg-slate-800/40 border border-transparent text-slate-300'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? 'border-orange-500 bg-orange-500'
                        : 'border-slate-600'
                    }`}>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{ledger.name}</p>
                    </div>
                    <span className="text-[10px] text-slate-500 px-2 py-0.5 rounded bg-slate-950/60 border border-slate-700/30 whitespace-nowrap">
                      {ledger.parent}
                    </span>
                    {ledger.closingBalance > 0 && (
                      <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
                        ₹{ledger.closingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
              className="px-4 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 text-slate-300 hover:text-white text-sm font-semibold transition-all flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={handleFetchVouchers}
              disabled={selectedLedgers.size === 0 || fetchingVouchers}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                <span className="text-slate-400">
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
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/50 space-y-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Total Entries</p>
              <p className="text-2xl font-black text-white">{processedEntries.length.toLocaleString()}</p>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-1">
              <p className="text-[10px] text-emerald-500 uppercase tracking-wider font-bold">Total Debit</p>
              <p className="text-lg font-black text-emerald-300">{fmtAmount(totals.debit)}</p>
            </div>
            <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/20 space-y-1">
              <p className="text-[10px] text-red-500 uppercase tracking-wider font-bold">Total Credit</p>
              <p className="text-lg font-black text-red-300">{fmtAmount(totals.credit)}</p>
            </div>
            <div className="p-4 rounded-2xl bg-orange-500/5 border border-orange-500/20 space-y-1">
              <p className="text-[10px] text-orange-500 uppercase tracking-wider font-bold">Ledgers</p>
              <p className="text-2xl font-black text-orange-300">{uniqueLedgerNames.length}</p>
            </div>
            <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 space-y-1">
              <p className="text-[10px] text-blue-500 uppercase tracking-wider font-bold">Voucher Types</p>
              <p className="text-2xl font-black text-blue-300">{uniqueVoucherTypes.length}</p>
            </div>
          </div>

          {/* Table controls */}
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800/50">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={tableSearch}
                onChange={e => setTableSearch(e.target.value)}
                placeholder="Search vouchers, parties, narration..."
                className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-950/60 border border-slate-700/50 text-white text-sm focus:border-orange-500/50 focus:outline-none"
              />
            </div>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700/50 text-white text-sm focus:border-orange-500/50 focus:outline-none"
            >
              <option value="">All Types</option>
              {uniqueVoucherTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={ledgerFilter}
              onChange={e => setLedgerFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700/50 text-white text-sm focus:border-orange-500/50 focus:outline-none"
            >
              <option value="">All Ledgers</option>
              {uniqueLedgerNames.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <button
              onClick={handleExport}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-bold flex items-center gap-2 transition-all"
            >
              <Download className="w-4 h-4" /> Export Excel
            </button>
          </div>

          {/* Data table */}
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800/50 overflow-hidden">
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900/95 border-b border-slate-700/50">
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
                        } ${sortField === col.field ? 'text-orange-400' : 'text-slate-400'}`}
                      >
                        <span className="flex items-center gap-1">
                          {col.label}
                          <ArrowUpDown className="w-3 h-3" />
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Narration
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {processedEntries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                        No entries found matching your filters
                      </td>
                    </tr>
                  ) : (
                    processedEntries.map((entry, idx) => (
                      <tr
                        key={`${entry.voucherNumber}-${entry.ledgerName}-${idx}`}
                        className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors"
                      >
                        <td className="px-4 py-2.5 text-slate-300 font-mono text-xs whitespace-nowrap">
                          {fmtDate(entry.date)}
                        </td>
                        <td className="px-4 py-2.5 text-white font-semibold text-xs">
                          {entry.voucherNumber || '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 rounded-md bg-slate-800/60 border border-slate-700/30 text-slate-300 text-[10px] font-bold">
                            {entry.voucherType}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-orange-300 text-xs font-medium max-w-[200px] truncate" title={entry.ledgerName}>
                          {entry.ledgerName}
                        </td>
                        <td className="px-4 py-2.5 text-slate-300 text-xs max-w-[200px] truncate" title={entry.partyName}>
                          {entry.partyName || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          {entry.debit > 0 && (
                            <span className="text-emerald-400">{fmtAmount(entry.debit)}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          {entry.credit > 0 && (
                            <span className="text-red-400">{fmtAmount(entry.credit)}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs max-w-[250px] truncate" title={entry.narration}>
                          {entry.narration || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {processedEntries.length > 0 && (
                  <tfoot className="sticky bottom-0">
                    <tr className="bg-slate-900/95 border-t-2 border-orange-500/30">
                      <td colSpan={5} className="px-4 py-3 text-right text-xs font-black text-white uppercase tracking-wider">
                        Total ({processedEntries.length} entries)
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-black text-emerald-400">
                        {fmtAmount(totals.debit)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-black text-red-400">
                        {fmtAmount(totals.credit)}
                      </td>
                      <td className="px-4 py-3" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Bottom actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentStep('select')}
              className="px-4 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 text-slate-300 hover:text-white text-sm font-semibold transition-all flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Change Ledgers
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExport}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-bold flex items-center gap-2 transition-all"
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
