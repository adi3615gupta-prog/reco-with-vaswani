import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  Check,
  Building2,
  FileText,
  Clock,
  Layers,
  Sparkles,
  X,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';

export interface PushStepLog {
  id: string;
  timestamp: string;
  type: 'master' | 'voucher' | 'audit' | 'summary' | 'error';
  status: 'pending' | 'processing' | 'success' | 'warning' | 'error';
  title: string;
  details?: string;
  voucherNo?: string;
  invoiceNo?: string;
  supplierName?: string;
  supplierGstin?: string;
  state?: string;
  section?: string;
  amount?: number;
  tallyMessage?: string;
  legs?: { ledgerName: string; amount: number; isDebit: boolean }[];
}

export interface LivePushState {
  isActive: boolean;
  isCompleted: boolean;
  stage: 'idle' | 'masters' | 'vouchers' | 'audit' | 'done' | 'failed';
  stageTitle: string;
  stageSubtext: string;
  progressPercent: number; // 0 to 100
  totalVouchers: number;
  processedVouchers: number;
  totalMasters: number;
  processedMasters: number;
  createdVouchers: number;
  rejectedVouchers: number;
  currentVoucherInfo?: string;
  startTime?: number;
  endTime?: number;
  logs: PushStepLog[];
}

interface TallyLivePushMonitorProps {
  state: LivePushState;
  tallyCompany?: string;
  tallyPort?: number;
  onClose?: () => void;
  onViewHistory?: () => void;
}

export const TallyLivePushMonitor: React.FC<TallyLivePushMonitorProps> = ({
  state,
  tallyCompany = 'SOURAV',
  tallyPort = 9000,
  onClose,
  onViewHistory,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [filterType, setFilterType] = useState<'all' | 'vouchers' | 'masters' | 'errors'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userHasScrolledRef = useRef<boolean>(false);

  // Timer for elapsed seconds
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (state.isActive && state.startTime) {
      interval = setInterval(() => {
        const now = Date.now();
        setElapsedSeconds(Math.floor((now - state.startTime!) / 1000));
      }, 500);
    } else if (state.isCompleted && state.startTime && state.endTime) {
      setElapsedSeconds(Math.floor((state.endTime - state.startTime) / 1000));
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [state.isActive, state.isCompleted, state.startTime, state.endTime]);

  // Auto-scroll to bottom of log unless user manually scrolled up
  useEffect(() => {
    if (state.isActive && scrollRef.current && !userHasScrolledRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.logs.length, state.isActive]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    userHasScrolledRef.current = !isAtBottom;
  };

  const filteredLogs = state.logs.filter((log) => {
    if (filterType === 'vouchers' && log.type !== 'voucher') return false;
    if (filterType === 'masters' && log.type !== 'master') return false;
    if (filterType === 'errors' && log.status !== 'error') return false;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        log.title.toLowerCase().includes(q) ||
        (log.details && log.details.toLowerCase().includes(q)) ||
        (log.supplierName && log.supplierName.toLowerCase().includes(q)) ||
        (log.invoiceNo && log.invoiceNo.toLowerCase().includes(q)) ||
        (log.voucherNo && log.voucherNo.toLowerCase().includes(q)) ||
        (log.supplierGstin && log.supplierGstin.toLowerCase().includes(q)) ||
        (log.tallyMessage && log.tallyMessage.toLowerCase().includes(q))
      );
    }
    return true;
  });

  if (!state.isActive && !state.isCompleted && state.logs.length === 0) {
    return null;
  }

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}s`;
  };

  const isSuccess = state.isCompleted && state.rejectedVouchers === 0;
  const hasErrors = state.rejectedVouchers > 0;

  return (
    <div className="mb-5 bg-white border border-slate-200/90 rounded-2xl shadow-lg overflow-hidden transition-all duration-300">
      {/* ─── 1. TOP HEADER BAR ─── */}
      <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex items-center justify-center">
            {state.isActive ? (
              <span className="relative flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500"></span>
              </span>
            ) : isSuccess ? (
              <span className="h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                <Check className="w-2.5 h-2.5 stroke-[3]" />
              </span>
            ) : (
              <span className="h-4 w-4 rounded-full bg-amber-500 flex items-center justify-center text-white">
                <AlertTriangle className="w-2.5 h-2.5 stroke-[2.5]" />
              </span>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-300">
                {state.isActive ? 'LIVE TALLY INGESTION' : 'INGESTION FINISHED'}
              </span>
              <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-slate-300 border border-white/10">
                Company: <strong className="text-white">{tallyCompany}</strong> (Port {tallyPort})
              </span>
            </div>
            <p className="text-xs font-semibold text-white truncate mt-0.5">
              {state.stageTitle || 'Processing...'}
              {state.currentVoucherInfo && (
                <span className="text-slate-300 font-normal ml-2 text-[11px]">
                  — {state.currentVoucherInfo}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Header Right Actions & KPIs */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono bg-white/10 px-2.5 py-1 rounded-lg text-slate-200 border border-white/10">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{formatElapsed(elapsedSeconds)}</span>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all cursor-pointer"
            title={isExpanded ? 'Collapse activity log' : 'Expand activity log'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {state.isCompleted && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg bg-white/10 hover:bg-rose-500 text-slate-300 hover:text-white transition-all cursor-pointer"
              title="Close live monitor"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ─── 2. ANIMATED HORIZONTAL PROGRESS BAR ─── */}
      <div className="px-5 pt-4 pb-3 bg-slate-50/70 border-b border-slate-200/70">
        <div className="flex items-center justify-between text-xs mb-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">
              {Math.round(state.progressPercent)}% Completed
            </span>
            <span className="text-slate-400">|</span>
            <span className="text-[11px] text-slate-600 font-medium">{state.stageSubtext}</span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              <span>
                <strong>{state.processedVouchers}</strong> / {state.totalVouchers} Vouchers
              </span>
            </span>

            {state.createdVouchers > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-semibold border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>{state.createdVouchers} Accepted</span>
              </span>
            )}

            {state.rejectedVouchers > 0 && (
              <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md font-semibold border border-rose-200 animate-pulse">
                <XCircle className="w-3 h-3 text-rose-600" />
                <span>{state.rejectedVouchers} Rejected</span>
              </span>
            )}
          </div>
        </div>

        {/* High-tech animated horizontal bar container */}
        <div className="w-full bg-slate-200/90 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-300 shadow-inner relative">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden ${
              hasErrors
                ? 'bg-gradient-to-r from-blue-600 via-amber-500 to-rose-600'
                : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, state.progressPercent))}%` }}
          >
            {/* Shimmer pulse animation across bar */}
            {state.isActive && (
              <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.45)_50%,transparent_100%)] animate-shimmer" />
            )}
          </div>
        </div>

        {/* Compact Ticker & Expand Toggle */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/60 text-xs">
          <div className="flex items-center gap-2 text-slate-600 truncate min-w-0">
            {state.logs.length > 0 ? (
              (() => {
                const latestLog = state.logs[state.logs.length - 1];
                return (
                  <span className="truncate text-[11px] flex items-center gap-1.5">
                    {state.isActive && <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping shrink-0" />}
                    <strong className="text-slate-800 shrink-0">Latest:</strong>
                    <span className={latestLog.status === 'error' ? 'text-rose-600 font-semibold truncate' : 'text-slate-700 truncate'}>
                      {latestLog.title}
                    </span>
                    {latestLog.details && <span className="text-slate-400 truncate hidden md:inline">({latestLog.details})</span>}
                    {latestLog.status === 'success' && (
                      <span className="text-emerald-600 font-bold shrink-0">✓ Accepted</span>
                    )}
                    {latestLog.status === 'error' && (
                      <span className="text-rose-600 font-bold shrink-0">✗ Rejected</span>
                    )}
                  </span>
                );
              })()
            ) : (
              <span className="text-[11px] text-slate-400">Ready to ingest vouchers...</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-200/80 hover:bg-slate-300 text-slate-700 transition-all cursor-pointer shrink-0 ml-3"
            title={isExpanded ? 'Collapse activity log' : 'Expand full step-by-step telemetry'}
          >
            <span>{isExpanded ? 'Collapse Log' : `View Steps Log (${state.logs.length})`}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* ─── 3. THREE-STAGE PIPELINE INDICATORS (EXPANDED ONLY) ─── */}
        {isExpanded && (
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-200/60 text-[11px]">
            {/* Stage 1: Masters */}
            <div
              className={`p-2 rounded-xl border flex items-center gap-2 ${
                state.stage === 'masters'
                  ? 'bg-blue-50/80 border-blue-300 text-blue-900 font-semibold'
                  : state.processedMasters > 0 || state.stage !== 'idle'
                  ? 'bg-emerald-50/60 border-emerald-200 text-emerald-800'
                  : 'bg-white border-slate-200 text-slate-400'
              }`}
            >
              {state.stage === 'masters' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
              ) : state.processedMasters > 0 || state.stage !== 'idle' ? (
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <div className="min-w-0 truncate">
                <p className="truncate">1. Supplier & Tax Masters</p>
                <p className="text-[10px] opacity-80 truncate">
                  {state.processedMasters > 0
                    ? `${state.processedMasters} Ledgers Verified`
                    : 'Checks & alters GSTIN/State'}
                </p>
              </div>
            </div>

            {/* Stage 2: Vouchers */}
            <div
              className={`p-2 rounded-xl border flex items-center gap-2 ${
                state.stage === 'vouchers'
                  ? 'bg-indigo-50/80 border-indigo-300 text-indigo-900 font-semibold ring-1 ring-indigo-400'
                  : state.isCompleted
                  ? state.rejectedVouchers > 0
                    ? 'bg-amber-50/60 border-amber-200 text-amber-900'
                    : 'bg-emerald-50/60 border-emerald-200 text-emerald-800'
                  : 'bg-white border-slate-200 text-slate-400'
              }`}
            >
              {state.stage === 'vouchers' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600 shrink-0" />
              ) : state.isCompleted ? (
                state.rejectedVouchers > 0 ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                )
              ) : (
                <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <div className="min-w-0 truncate">
                <p className="truncate">2. Inward Voucher XML Push</p>
                <p className="text-[10px] opacity-80 truncate">
                  {state.processedVouchers} / {state.totalVouchers} Processed
                </p>
              </div>
            </div>

            {/* Stage 3: Audit Trail */}
            <div
              className={`p-2 rounded-xl border flex items-center gap-2 ${
                state.stage === 'audit'
                  ? 'bg-purple-50/80 border-purple-300 text-purple-900 font-semibold'
                  : state.isCompleted
                  ? 'bg-emerald-50/60 border-emerald-200 text-emerald-800'
                  : 'bg-white border-slate-200 text-slate-400'
              }`}
            >
              {state.stage === 'audit' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-600 shrink-0" />
              ) : state.isCompleted ? (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <div className="min-w-0 truncate">
                <p className="truncate">3. Audit Trail & SQLite</p>
                <p className="text-[10px] opacity-80 truncate">
                  {state.isCompleted ? 'Deduplication Recorded' : 'Prevents double-entry'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── 4. COLLAPSIBLE STEP-BY-STEP ACTIVITY LOG CONSOLE ─── */}
      {isExpanded && (
        <div className="flex flex-col">
          {/* Filter Bar */}
          <div className="px-5 py-2 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mr-1">
                Filter:
              </span>
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-slate-800 text-white shadow-2xs'
                    : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                All Steps ({state.logs.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('vouchers')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  filterType === 'vouchers'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                Vouchers ({state.logs.filter((l) => l.type === 'voucher').length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('masters')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  filterType === 'masters'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                Masters ({state.logs.filter((l) => l.type === 'master').length})
              </button>
              {state.rejectedVouchers > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterType('errors')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    filterType === 'errors'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                  }`}
                >
                  Rejections ({state.logs.filter((l) => l.status === 'error').length})
                </button>
              )}
            </div>

            {/* Search Input inside Log */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search entry, supplier, invoice..."
                className="w-full pl-8 pr-3 py-1 bg-white border border-slate-200 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            </div>
          </div>

          {/* Telemetry Stream Items Container */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="p-3 max-h-72 overflow-y-auto space-y-2 font-mono text-[11px] bg-slate-900 text-slate-100"
          >
            {filteredLogs.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No telemetry steps match the selected filter.
              </div>
            ) : (
              filteredLogs.map((log) => {
                const isError = log.status === 'error';
                const isVoucher = log.type === 'voucher';
                const isMaster = log.type === 'master';

                return (
                  <div
                    key={log.id}
                    className={`p-2.5 rounded-xl border transition-all ${
                      isError
                        ? 'bg-rose-950/40 border-rose-800 text-rose-200'
                        : isMaster
                        ? 'bg-slate-800/80 border-slate-700 text-slate-200'
                        : 'bg-slate-800/90 border-slate-700/90 text-slate-100'
                    }`}
                  >
                    {/* Log Item Header */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5 font-sans">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400 bg-black/40 px-1.5 py-0.5 rounded">
                          {log.timestamp}
                        </span>

                        {isMaster ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            MASTER LEDGER
                          </span>
                        ) : isVoucher ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {log.section || 'PURCHASE'} VOUCHER
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            AUDIT LOG
                          </span>
                        )}

                        <span className="font-semibold text-xs text-white">
                          {log.title}
                        </span>
                      </div>

                      {/* Status Badge */}
                      <div>
                        {log.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-700/60">
                            <Check className="w-3 h-3 stroke-[3]" />
                            <span>Accepted</span>
                          </span>
                        ) : isError ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-300 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-600">
                            <XCircle className="w-3 h-3" />
                            <span>Rejected</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-300 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-700/60">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Processing</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Master Details: GSTIN, State, Parent */}
                    {isMaster && log.supplierGstin && (
                      <div className="mt-1.5 text-[11px] text-slate-300 font-sans flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>GSTIN: <strong className="text-amber-300 font-mono">{log.supplierGstin}</strong></span>
                        {log.state && <span>State: <strong className="text-white">{log.state}</strong></span>}
                        <span>Group: <strong className="text-white">Sundry Creditors</strong></span>
                        <span className="text-slate-400">Bill-by-Bill: <strong className="text-emerald-400">Yes</strong></span>
                      </div>
                    )}

                    {/* Voucher Accounting Breakdown (Double-Entry: Kaise Entry Hui) */}
                    {isVoucher && log.legs && log.legs.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-700/80">
                        <div className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-1">
                          Double-Entry Accounting Split:
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px]">
                          {log.legs.map((leg, legIdx) => (
                            <div
                              key={legIdx}
                              className={`flex items-center justify-between px-2 py-0.5 rounded ${
                                leg.isDebit
                                  ? 'bg-blue-950/30 text-blue-200 border border-blue-900/40'
                                  : 'bg-emerald-950/30 text-emerald-200 border border-emerald-900/40'
                              }`}
                            >
                              <span className="truncate mr-2">
                                <strong className={leg.isDebit ? 'text-blue-400' : 'text-emerald-400'}>
                                  {leg.isDebit ? 'Dr.' : 'Cr.'}
                                </strong>{' '}
                                {leg.ledgerName}
                              </span>
                              <span className="font-mono font-semibold shrink-0">
                                ₹{Math.abs(leg.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Error / Tally Message detail */}
                    {log.tallyMessage && (
                      <div className="mt-2 p-1.5 rounded bg-black/40 text-[10px] text-rose-300 border border-rose-900/60 font-mono">
                        <strong>Tally Response:</strong> {log.tallyMessage}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer bar with View Audit Log / History link */}
          <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-slate-500 text-[11px]">
              {state.isActive
                ? 'Processing live stream... Entries are validated against Tally XML engine in real time.'
                : 'All posted transactions are saved with timestamps in SQLite and ready for GST audit reconciliation.'}
            </span>

            {onViewHistory && (
              <button
                type="button"
                onClick={onViewHistory}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
              >
                <span>Open Full Audit Log Hub</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

