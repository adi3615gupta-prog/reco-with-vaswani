import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Building2, Calendar, CheckCircle2, Clock, Download, ExternalLink,
  FileSpreadsheet, FileText, Filter, MessageSquare, RefreshCw,
  Search, Send, ShieldCheck, Sparkles, UploadCloud, Users, X,
  Check, AlertTriangle, ArrowUpDown, Eye, ArrowRight, Smartphone,
  Laptop, Globe, CheckCheck, FileJson, Key, EyeOff,
  Zap, Play, Pause, SkipForward, Square, FolderSearch, Loader2,
  DownloadCloud, Layers, ArrowDownToLine, Database, ArrowUpRight
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiBase, safeApiFetch } from '@/lib/api';
import { GSTR3BMonthKey, GSTR3B_MONTHS } from '@/lib/gstr3bEngine';
import { exportGstr1FullYearExcel } from '@/lib/gstr1FullYearExport';
import * as XLSX from 'xlsx';

export interface Gstr1InvoiceItem {
  id: string;
  batch_id?: string;
  client_gstin: string;
  return_period: string;
  section: string;
  ctin?: string;
  cname?: string;
  inum: string;
  idt: string;
  val?: number;
  pos?: string;
  rchrg?: string;
  inv_typ?: string;
  rt?: number;
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
  source_period?: string;
  created_at?: number;
}

export interface Gstr1MonthStatus {
  status: 'PENDING' | 'REQUESTED' | 'READY_TO_DOWNLOAD' | 'SYNCED' | string;
  invoices: number;
  taxable: number;
  tax: number;
  requestedAt: number | null;
  secondsLeft: number;
  isReady: boolean;
  excelPath?: string | null;
}

export interface Gstr1ClientBatch {
  id: string;
  gstin: string;
  trade_name: string;
  legal_name?: string;
  phone?: string;
  email?: string;
  hasCreds: boolean;
  portalUsername?: string;
  status: 'PENDING' | 'REQUESTED' | 'READY_TO_DOWNLOAD' | 'SYNCED' | 'PUSHED_TO_3B' | 'FAILED' | 'PARTIAL';
  period: string;
  financialYear?: string;
  syncedMonths?: string[];
  pendingMonths?: string[];
  syncedCount?: number;
  totalMonths?: number;
  totalInvoices: number;
  b2bCount: number;
  b2clCount: number;
  b2csCount: number;
  cdnrCount: number;
  expCount: number;
  totalTaxable: number;
  totalIgst: number;
  totalCgst: number;
  totalSgst: number;
  totalCess: number;
  totalTax: number;
  hasExcel: boolean;
  hasJson: boolean;
  excelPath?: string;
  jsonPath?: string;
  downloadedAt?: number;
  updatedAt?: number;
  requestedAt?: number | null;
  secondsLeft?: number;
  isReady?: boolean;
  months?: Record<string, Gstr1MonthStatus>;
}

interface Gstr1MasterDownloaderProps {
  selectedMonth: GSTR3BMonthKey;
  financialYear: string;
  onApplyTo3B?: (outward: { taxable: number; igst: number; cgst: number; sgst: number; cess: number; total: number }) => void;
  currentGstin?: string;
}

export default function Gstr1MasterDownloader({
  selectedMonth,
  financialYear,
  onApplyTo3B,
  currentGstin
}: Gstr1MasterDownloaderProps) {
  const startYear = (financialYear || '2025-26').match(/\d{4}/)?.[0] || '2025';
  const activePeriod = `${selectedMonth} ${startYear}`;

  // View Mode: Single filing month vs full 12-month FY consolidation
  const [viewMode, setViewMode] = useState<'MONTH' | 'FULL_YEAR'>('MONTH');

  // Data States
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Gstr1ClientBatch[]>([]);
  const [overview, setOverview] = useState({
    totalClients: 0,
    downloadedClients: 0,
    pendingClients: 0,
    totalOutwardTaxable: 0,
    totalOutwardTax: 0,
    totalInvoices: 0,
    fullySyncedClients: 0,
    partiallySyncedClients: 0
  });

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SYNCED' | 'PENDING' | 'CONFIGURED'>('ALL');
  const [selectedGstins, setSelectedGstins] = useState<Set<string>>(new Set());

  // Detail Modal States
  const [activeClientDetail, setActiveClientDetail] = useState<Gstr1ClientBatch | null>(null);
  const [detailInvoices, setDetailInvoices] = useState<Gstr1InvoiceItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailSectionFilter, setDetailSectionFilter] = useState<string>('ALL');
  const [detailSearch, setDetailSearch] = useState('');

  // Dropzone & Scanning
  const [showDropzoneModal, setShowDropzoneModal] = useState(false);
  const [showSingleModal, setShowSingleModal] = useState(false);
  const [targetSingleGstin, setTargetSingleGstin] = useState(currentGstin || '');
  useEffect(() => {
    if (currentGstin) {
      setTargetSingleGstin(currentGstin);
    }
  }, [currentGstin]);
  const [isScanningDownloads, setIsScanningDownloads] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── BATCH MULTI-SYNC AUTOPILOT STATE ───────────────────────────────────────
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchQueue, setBatchQueue] = useState<Array<{
    gstin: string;
    trade_name: string;
    hasCreds: boolean;
    status: 'PENDING' | 'CONNECTING' | 'WAITING_CAPTCHA' | 'DOWNLOADING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
    invoiceCount?: number;
    error?: string;
  }>>([]);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(-1);

  // Single Autopilot Active Modal
  const [activeAutopilotClient, setActiveAutopilotClient] = useState<Gstr1ClientBatch | null>(null);
  const autopilotAbortRef = useRef<AbortController | null>(null);

  // ─── LIVE COUNTDOWN TICKER & FY MONTH HELPERS ──────────────────────────────
  const [timerTick, setTimerTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimerTick(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fyMonthNames = useMemo(() => {
    const startYr = parseInt((financialYear || '2025-26').match(/\d{4}/)?.[0] || '2025', 10);
    const endYr = startYr + 1;
    return [
      { short: 'Apr', full: 'April', period: `April ${startYr}` },
      { short: 'May', full: 'May', period: `May ${startYr}` },
      { short: 'Jun', full: 'June', period: `June ${startYr}` },
      { short: 'Jul', full: 'July', period: `July ${startYr}` },
      { short: 'Aug', full: 'August', period: `August ${startYr}` },
      { short: 'Sep', full: 'September', period: `September ${startYr}` },
      { short: 'Oct', full: 'October', period: `October ${startYr}` },
      { short: 'Nov', full: 'November', period: `November ${startYr}` },
      { short: 'Dec', full: 'December', period: `December ${startYr}` },
      { short: 'Jan', full: 'January', period: `January ${endYr}` },
      { short: 'Feb', full: 'February', period: `February ${endYr}` },
      { short: 'Mar', full: 'March', period: `March ${endYr}` },
    ];
  }, [financialYear]);

  const getMonthTimer = (requestedAt?: number | null, batchStatus?: string) => {
    if (!requestedAt) return { secondsLeft: 0, isReady: false };
    const elapsed = Math.floor((Date.now() - requestedAt) / 1000);
    const remaining = Math.max(0, 1200 - elapsed);
    const isReady = (batchStatus === 'REQUESTED' || batchStatus === 'READY_TO_DOWNLOAD') && remaining === 0;
    return { secondsLeft: remaining, isReady };
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  // Load clients & summary from backend
  const fetchSummary = async () => {
    setLoading(true);
    try {
      const endpoint = viewMode === 'FULL_YEAR'
        ? `/api/gstr1/fy-summary?financialYear=${encodeURIComponent(financialYear)}`
        : `/api/gstr1/summary?period=${encodeURIComponent(activePeriod)}`;
      const res = await safeApiFetch(endpoint);
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(text.startsWith('<') ? 'Server returned HTML instead of JSON. Ensure backend is running.' : text);
      }
      if (!res.ok) throw new Error('Failed fetching GSTR-1 summary');
      const data = await res.json();
      if (data.success) {
        setClients(data.clients || []);
        if (data.overview) {
          if (viewMode === 'FULL_YEAR') {
            setOverview({
              totalClients: data.overview.totalClients || 0,
              downloadedClients: data.overview.fullySyncedClients || 0,
              pendingClients: (data.overview.partiallySyncedClients || 0) + (data.overview.pendingClients || 0),
              totalOutwardTaxable: data.overview.total12mTaxable || 0,
              totalOutwardTax: data.overview.total12mTax || 0,
              totalInvoices: data.overview.total12mInvoices || 0,
              fullySyncedClients: data.overview.fullySyncedClients || 0,
              partiallySyncedClients: data.overview.partiallySyncedClients || 0
            });
          } else {
            setOverview({
              ...data.overview,
              fullySyncedClients: data.overview.downloadedClients || 0,
              partiallySyncedClients: 0
            });
          }
        }
      }
    } catch (err: any) {
      console.error('GSTR-1 summary error:', err);
      toast.error('Failed to load GSTR-1 data', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [activePeriod, viewMode, financialYear]);

  // Periodic polling: auto-refresh summary every 4 seconds if any client is queued or autopilot is running
  useEffect(() => {
    const hasRequestedBatches = clients.some(c => {
      if (c.status === 'REQUESTED' || c.requestedAt) return true;
      if (c.months) {
        return Object.values(c.months).some(m => m.status === 'REQUESTED' || Boolean(m.requestedAt));
      }
      return false;
    });

    if (hasRequestedBatches || activeAutopilotClient || isBatchRunning) {
      const pollTimer = setInterval(() => {
        fetchSummary();
      }, 4000);
      return () => clearInterval(pollTimer);
    }
  }, [clients, activeAutopilotClient, isBatchRunning, activePeriod, viewMode, financialYear]);

  // Currency Formatter
  const formatCur = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  // Filtered Client List
  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const q = search.toLowerCase().trim();
      const matchSearch = !q ||
        c.trade_name.toLowerCase().includes(q) ||
        c.gstin.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.portalUsername && c.portalUsername.toLowerCase().includes(q));

      if (!matchSearch) return false;

      if (statusFilter === 'SYNCED') return c.status === 'SYNCED' || c.status === 'PUSHED_TO_3B';
      if (statusFilter === 'PENDING') return c.status === 'PENDING' || c.status === 'PARTIAL' || c.status === 'FAILED';
      if (statusFilter === 'CONFIGURED') return c.hasCreds;
      return true;
    });
  }, [clients, search, statusFilter]);

  // Toggle selection
  const toggleSelectAll = () => {
    if (selectedGstins.size === filteredClients.length) {
      setSelectedGstins(new Set());
    } else {
      setSelectedGstins(new Set(filteredClients.map(c => c.gstin)));
    }
  };

  const toggleSelectClient = (gstin: string) => {
    const next = new Set(selectedGstins);
    if (next.has(gstin)) next.delete(gstin);
    else next.add(gstin);
    setSelectedGstins(next);
  };

  // ─── READY FILES DETECTOR & BATCH DOWNLOADER ────────────────────────────────
  const readyMonthsList = useMemo(() => {
    const list: Array<{ client: Gstr1ClientBatch; month: { short: string; full: string; period: string } }> = [];
    for (const c of clients) {
      if (!c.hasCreds) continue;
      if (viewMode === 'FULL_YEAR') {
        for (const m of fyMonthNames) {
          const mData = c.months?.[m.period];
          const timer = getMonthTimer(mData?.requestedAt, mData?.status);
          if (timer.isReady || mData?.status === 'READY_TO_DOWNLOAD') {
            list.push({ client: c, month: m });
          }
        }
      } else {
        const timer = getMonthTimer(c.requestedAt, c.status);
        if (timer.isReady || c.status === 'READY_TO_DOWNLOAD') {
          list.push({ client: c, month: { short: selectedMonth.slice(0, 3), full: selectedMonth, period: activePeriod } });
        }
      }
    }
    return list;
  }, [clients, viewMode, fyMonthNames, activePeriod, selectedMonth, timerTick]);

  const handleDownloadAllReadyMonths = async () => {
    if (readyMonthsList.length === 0) {
      return toast.info('No files are currently ready to download.');
    }
    toast.info(`Downloading ${readyMonthsList.length} ready file(s)...`);
    for (const item of readyMonthsList) {
      await handleRunAutopilot(item.client, item.month.full, item.month.period, true);
    }
  };

  // ─── 1-CLICK SCAN DOWNLOADS FOLDER ──────────────────────────────────────────
  const handleScanDownloads = async () => {
    setIsScanningDownloads(true);
    toast.info('Scanning user Downloads for official GSTR-1 files...');
    try {
      const res = await safeApiFetch('/api/gstr1/scan-downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnPeriod: activePeriod })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchSummary();
      } else {
        toast.error('Scan failed', { description: data.error });
      }
    } catch (e: any) {
      toast.error('Scan error', { description: e.message });
    } finally {
      setIsScanningDownloads(false);
    }
  };

  // ─── CLIENT AUTOPILOT SYNC (12-MONTH LOOP OR TARGETED MONTH) ─────────────────
  const handleRunAutopilot = async (
    client: Gstr1ClientBatch,
    targetMonth?: string | null,
    periodOverride?: string | null,
    isDownloadOnly?: boolean
  ) => {
    setActiveAutopilotClient(client);
    const controller = new AbortController();
    autopilotAbortRef.current = controller;

    const effReturnPeriod = periodOverride || activePeriod;
    const effIsFullYear = (viewMode === 'FULL_YEAR' || !targetMonth) && !isDownloadOnly;

    try {
      const res = await safeApiFetch('/api/gstr1/portal-sync-browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          gstin: client.gstin,
          returnPeriod: effReturnPeriod,
          financialYear,
          isFullYear: effIsFullYear,
          targetMonth: targetMonth || null,
          isDownloadOnly: Boolean(isDownloadOnly)
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchSummary();
      } else {
        toast.error('GSTR-1 Autopilot issue', { description: data.error });
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        toast.info('Autopilot session cancelled');
      } else {
        toast.error('GSTR-1 Autopilot connection failed', { description: e.message });
      }
    } finally {
      setActiveAutopilotClient(null);
      autopilotAbortRef.current = null;
    }
  };

  // Direct download of consolidated 12M Excel workbook
  const handleDownload12mExcelDirect = (client: Gstr1ClientBatch) => {
    const url = `${getApiBase()}/api/gstr1/export-full-year/${client.gstin}?financialYear=${encodeURIComponent(financialYear)}`;
    window.open(url, '_blank');
    toast.success(`Generating full-year GSTR-1 Excel for ${client.trade_name || client.gstin}...`);
  };

  // ─── BATCH MULTI-SYNC AUTOPILOT QUEUE ───────────────────────────────────────
  const handleStartBatchSync = (targetClients: Gstr1ClientBatch[]) => {
    if (targetClients.length === 0) {
      return toast.error('No clients selected for Multi-Sync');
    }

    const queue = targetClients.map(c => ({
      gstin: c.gstin,
      trade_name: c.trade_name,
      hasCreds: c.hasCreds,
      status: 'PENDING' as const
    }));

    setBatchQueue(queue);
    setCurrentBatchIndex(0);
    setIsBatchRunning(true);
    setShowBatchModal(true);
    runBatchQueue(queue, 0);
  };

  const runBatchQueue = async (queue: typeof batchQueue, index: number) => {
    if (index >= queue.length) {
      setIsBatchRunning(false);
      toast.success('Batch GSTR-1 Autopilot sequence completed!');
      fetchSummary();
      return;
    }

    const item = queue[index];
    setCurrentBatchIndex(index);
    setBatchQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'CONNECTING' } : q));

    try {
      const res = await safeApiFetch('/api/gstr1/portal-sync-browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: item.gstin,
          returnPeriod: activePeriod,
          financialYear,
          isFullYear: viewMode === 'FULL_YEAR'
        })
      });
      const data = await res.json();

      if (data.success) {
        setBatchQueue(prev => prev.map((q, i) => i === index ? {
          ...q,
          status: 'SUCCESS',
          invoiceCount: data.invoiceCount || 0
        } : q));
      } else {
        setBatchQueue(prev => prev.map((q, i) => i === index ? {
          ...q,
          status: 'FAILED',
          error: data.error || 'Failed'
        } : q));
      }
    } catch (err: any) {
      setBatchQueue(prev => prev.map((q, i) => i === index ? {
        ...q,
        status: 'FAILED',
        error: err.message
      } : q));
    }

    runBatchQueue(queue, index + 1);
  };

  // ─── PUSH GSTR-1 OUTWARD TO GSTR-3B TABLE 3.1 ────────────────────────────────
  const handlePushTo3B = async (client: Gstr1ClientBatch) => {
    if (!client.totalTaxable && !client.totalTax) {
      return toast.error('No GSTR-1 outward sales recorded to push to 3B.');
    }

    try {
      const res = await safeApiFetch('/api/gstr1/push-to-3b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gstin: client.gstin, period: activePeriod })
      });
      const data = await res.json();
      if (data.success) {
        if (onApplyTo3B) {
          onApplyTo3B(data.outward31);
        }
        toast.success(`Applied ${formatCur(data.outward31.taxable)} Sales to Table 3.1!`);
        fetchSummary();
      } else {
        toast.error('Failed pushing to 3B', { description: data.error });
      }
    } catch (e: any) {
      toast.error('Push error', { description: e.message });
    }
  };

  // ─── LINE ITEM INSPECTOR MODAL ──────────────────────────────────────────────
  const handleOpenClientDetails = async (client: Gstr1ClientBatch) => {
    setActiveClientDetail(client);
    setLoadingDetail(true);
    setDetailSectionFilter('ALL');
    setDetailSearch('');
    try {
      const endpoint = viewMode === 'FULL_YEAR'
        ? `/api/gstr1/invoices/${client.gstin}?financialYear=${encodeURIComponent(financialYear)}`
        : `/api/gstr1/invoices/${client.gstin}?period=${encodeURIComponent(activePeriod)}`;
      const res = await safeApiFetch(endpoint);
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(text.startsWith('<') ? 'Server returned HTML instead of JSON' : text);
      }
      const data = await res.json();
      if (data.success) {
        setDetailInvoices(data.invoices || []);
      }
    } catch (e: any) {
      toast.error('Failed loading detail invoices', { description: e.message });
    } finally {
      setLoadingDetail(false);
    }
  };

  // Filtered detail invoices
  const filteredDetailInvoices = useMemo(() => {
    return detailInvoices.filter(inv => {
      if (detailSectionFilter !== 'ALL') {
        if (!inv.section.toUpperCase().includes(detailSectionFilter)) return false;
      }
      if (detailSearch) {
        const q = detailSearch.toLowerCase().trim();
        const match =
          (inv.ctin && inv.ctin.toLowerCase().includes(q)) ||
          (inv.cname && inv.cname.toLowerCase().includes(q)) ||
          (inv.inum && inv.inum.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [detailInvoices, detailSectionFilter, detailSearch]);

  // Export line items to Excel
  const handleExportInvoicesExcel = () => {
    if (!activeClientDetail || detailInvoices.length === 0) return;

    if (viewMode === 'FULL_YEAR') {
      exportGstr1FullYearExcel({
        clientInfo: {
          trade_name: activeClientDetail.trade_name,
          legal_name: activeClientDetail.legal_name,
          gstin: activeClientDetail.gstin
        },
        financialYear,
        invoices: detailInvoices
      });
      toast.success('Exported 12-Month Consolidated GSTR-1 Workbook (Zero-Merge Architecture)!');
      return;
    }

    const wb = XLSX.utils.book_new();
    const rows = detailInvoices.map(i => ({
      Section: i.section,
      'Recipient GSTIN': i.ctin || '',
      'Receiver Name': i.cname || '',
      'Invoice / Note No': i.inum,
      'Invoice Date': i.idt,
      'Invoice Type': i.inv_typ || 'Regular',
      'Place of Supply': i.pos || '',
      'Reverse Charge': i.rchrg || 'N',
      'Rate (%)': i.rt || 0,
      'Taxable Value': i.txval,
      'Integrated Tax': i.iamt,
      'Central Tax': i.camt,
      'State/UT Tax': i.samt,
      'Cess': i.csamt,
      'Total Value': i.val || (i.txval + i.iamt + i.camt + i.samt + i.csamt),
      'Return Period': i.return_period
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, ws, 'GSTR1 Outward Invoices');
    XLSX.writeFile(wb, `GSTR1_${activeClientDetail.gstin}_${activePeriod.replace(/\s+/g, '_')}.xlsx`);
    toast.success('Exported GSTR-1 Line Items to Excel!');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ─── 1. MASTER KPI CARDS ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Total Clients</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono tabular-nums">{overview.totalClients}</div>
          <p className="text-[11px] text-slate-400 mt-1">Master Database</p>
        </div>

        <div className="bg-emerald-50/50 border border-emerald-200 shadow-xs rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>{viewMode === 'FULL_YEAR' ? '12M Fully Synced' : 'GSTR-1 Synced'}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono tabular-nums">{overview.downloadedClients}</div>
          <p className="text-[11px] text-slate-400 mt-1">
            {viewMode === 'FULL_YEAR' ? 'All 12 Months Ingested' : 'Outward Data Available'}
          </p>
        </div>

        <div className="bg-amber-50/50 border border-amber-200 shadow-xs rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>{viewMode === 'FULL_YEAR' ? 'Partial / Pending' : 'Pending GSTR-1'}</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-700 font-mono tabular-nums">{overview.pendingClients}</div>
          <p className="text-[11px] text-slate-400 mt-1">
            {viewMode === 'FULL_YEAR' ? 'Missing 1+ Months' : 'Ready for Autopilot'}
          </p>
        </div>

        <div className="bg-purple-50/50 border border-purple-200 shadow-xs rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between text-purple-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Total Invoices</span>
            <Database className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-purple-700 font-mono tabular-nums">{overview.totalInvoices.toLocaleString('en-IN')}</div>
          <p className="text-[11px] text-slate-400 mt-1">B2B, B2CL, B2CS, CDNR, EXP</p>
        </div>

        <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-indigo-950/40 via-slate-900/80 to-blue-950/40 border border-indigo-500/30 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Total Outward Tax</span>
            <Sparkles className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-indigo-300">{formatCur(overview.totalOutwardTax)}</div>
          <p className="text-[11px] text-slate-400 mt-1">Table 3.1 Ready</p>
        </div>
      </div>

      {/* ─── 2. CONTROL ACTION TOOLBAR ────────────────────────────────────────── */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* 1-Click Multi-Sync Autopilot Button */}
          <button
            onClick={() => {
              const targets = selectedGstins.size > 0
                ? clients.filter(c => selectedGstins.has(c.gstin))
                : clients.filter(c => c.status !== 'SYNCED');
              handleStartBatchSync(targets);
            }}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-950 transition-all hover:scale-[1.02]"
          >
            <Zap className="w-4 h-4 fill-white" />
            {viewMode === 'FULL_YEAR'
              ? `1-Click 12M Multi-Sync (${selectedGstins.size > 0 ? selectedGstins.size : overview.pendingClients} Clients)`
              : `1-Click Multi-Sync (${selectedGstins.size > 0 ? selectedGstins.size : overview.pendingClients} Clients)`}
          </button>

          {/* Scan Downloads Folder */}
          <button
            onClick={handleScanDownloads}
            disabled={isScanningDownloads}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-xs rounded-xl text-xs font-bold flex items-center gap-2 transition-all"
            title="Scan Windows Downloads folder for GSTR1 JSON/Excel files"
          >
            <FolderSearch className={`w-4 h-4 text-cyan-400 ${isScanningDownloads ? 'animate-spin' : ''}`} />
            Scan Downloads
          </button>

          {/* Download Ready Files Button */}
          {readyMonthsList.length > 0 && (
            <button
              onClick={handleDownloadAllReadyMonths}
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-950 transition-all animate-bounce"
              title="Download all generated GSTR-1 files ready on GST Portal"
            >
              <Download className="w-4 h-4" />
              <span>Download Ready ({readyMonthsList.length})</span>
            </button>
          )}

          {/* Refresh */}
          <button
            onClick={fetchSummary}
            disabled={loading}
            className="p-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-200 shadow-xs transition-colors"
            title="Refresh summary"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* VIEW MODE TOGGLE & SCOPE BADGE */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setViewMode('MONTH')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'MONTH'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-950'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Monthly ({selectedMonth})
            </button>
            <button
              onClick={() => setViewMode('FULL_YEAR')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'FULL_YEAR'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-950'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-purple-200" />
              Full FY 12 Months ({financialYear})
            </button>
          </div>

          <div className="px-3 py-1.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {viewMode === 'FULL_YEAR' ? `FY ${financialYear}` : activePeriod}
          </div>
        </div>
      </div>

      {/* ─── 3. SEARCH & STATUS FILTER ────────────────────────────────────────── */}
      <div className="bg-slate-900/60 border border-slate-800/90 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by client trade name, GSTIN, username or phone..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'ALL', label: `All (${clients.length})` },
            { id: 'SYNCED', label: `Synced (${clients.filter(c => c.status === 'SYNCED' || c.status === 'PUSHED_TO_3B').length})` },
            { id: 'PENDING', label: `Pending (${clients.filter(c => c.status !== 'SYNCED' && c.status !== 'PUSHED_TO_3B').length})` },
            { id: 'CONFIGURED', label: `Vault Configured (${clients.filter(c => c.hasCreds).length})` }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                statusFilter === f.id
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-900'
                  : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── 4. CLIENT BATCHES TABLE ─────────────────────────────────────────── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/90 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800 text-[11px]">
                <th className="py-3 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={filteredClients.length > 0 && selectedGstins.size === filteredClients.length}
                    onChange={toggleSelectAll}
                    className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                  />
                </th>
                <th className="py-3 px-4">Client / Taxpayer</th>
                <th className="py-3 px-4">Vault Credentials</th>
                <th className="py-3 px-4 text-center">Status</th>
                {viewMode === 'FULL_YEAR' && (
                  <th className="py-3 px-4 text-center">12M Progress</th>
                )}
                <th className="py-3 px-4 text-center">Invoices</th>
                <th className="py-3 px-4 text-right">Taxable Outward</th>
                <th className="py-3 px-4 text-right">Total Outward Tax</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {loading ? (
                <tr>
                  <td colSpan={viewMode === 'FULL_YEAR' ? 9 : 8} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
                    <span>Loading GSTR-1 outward batches...</span>
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={viewMode === 'FULL_YEAR' ? 9 : 8} className="py-12 text-center text-slate-500">
                    No clients found matching the selected filter or search.
                  </td>
                </tr>
              ) : (
                filteredClients.map(c => {
                  const isSelected = selectedGstins.has(c.gstin);
                  const isFullySynced = (c.syncedCount || 0) >= 12;

                  return (
                    <tr
                      key={c.gstin}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-blue-50/80' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectClient(c.gstin)}
                          className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                        />
                      </td>

                      {/* Client / Taxpayer */}
                      <td className="py-3 px-4">
                        <div className="font-extrabold text-white text-xs hover:text-blue-400 cursor-pointer flex items-center gap-1.5"
                          onClick={() => handleOpenClientDetails(c)}
                        >
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[220px]" title={c.trade_name || c.legal_name}>
                            {c.trade_name || c.legal_name || 'Client Name'}
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span className="text-blue-300 font-semibold">{c.gstin}</span>
                          {c.phone && <span>• {c.phone}</span>}
                        </div>

                        {/* 12-Month Interactive Matrix & Live Timer Pills */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2.5 max-w-[480px]">
                          {fyMonthNames.map(m => {
                            const monthData = c.months?.[m.period] || (c.months ? Object.entries(c.months).find(([k]) => k.toLowerCase() === m.period.toLowerCase())?.[1] : null);
                            const mRequestedAt = monthData?.requestedAt || (m.period.toLowerCase() === activePeriod.toLowerCase() ? c.requestedAt : null);
                            const mStatus = monthData?.status || (m.period.toLowerCase() === activePeriod.toLowerCase() ? c.status : 'PENDING');
                            const timer = getMonthTimer(mRequestedAt, mStatus);
                            const isSynced = mStatus === 'SYNCED' || (monthData?.invoices || 0) > 0;
                            const isReady = timer.isReady || mStatus === 'READY_TO_DOWNLOAD';
                            const isRequested = (mStatus === 'REQUESTED' || Boolean(mRequestedAt)) && !isSynced && !isReady;

                            return (
                              <button
                                key={m.period}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRunAutopilot(c, m.full, m.period, true);
                                }}
                                disabled={!c.hasCreds}
                                className={`px-2 py-1 rounded-md text-[10px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                  isSynced
                                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                                    : isReady
                                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-extrabold border border-cyan-300 animate-bounce shadow-lg shadow-cyan-950/80 hover:scale-105'
                                    : isRequested
                                    ? 'bg-amber-500/25 border-2 border-amber-400 text-amber-200 font-extrabold shadow-md shadow-amber-950/60 hover:bg-amber-500/40 animate-pulse'
                                    : 'bg-slate-800/90 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-700'
                                } ${!c.hasCreds ? 'opacity-40 cursor-not-allowed' : ''}`}
                                title={
                                  isSynced
                                    ? `${m.full}: ${monthData?.invoices || 'Synced'} invoices downloaded. Click to re-download.`
                                    : isReady
                                    ? `${m.full}: File is ready on GST Portal! Click to download & ingest now!`
                                    : isRequested
                                    ? `${m.full}: Generating on Portal. ${formatSeconds(timer.secondsLeft)} remaining. Click to check/download.`
                                    : `${m.full}: Pending. Click to generate or download.`
                                }
                              >
                                {isSynced ? (
                                  <>
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                                    <span>{m.short}</span>
                                    {monthData?.invoices ? <span className="text-[9px] text-emerald-300 font-sans">({monthData.invoices})</span> : null}
                                  </>
                                ) : isReady ? (
                                  <>
                                    <Download className="w-2.5 h-2.5 text-white" />
                                    <span>{m.short} Ready!</span>
                                  </>
                                ) : isRequested ? (
                                  <>
                                    <Clock className="w-2.5 h-2.5 text-amber-300 animate-spin" />
                                    <span>{m.short} {formatSeconds(timer.secondsLeft)}</span>
                                  </>
                                ) : (
                                  <span>{m.short}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </td>

                      {/* Vault Credentials */}
                      <td className="py-3 px-4">
                        {c.hasCreds ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-mono">
                            <Key className="w-3 h-3 text-emerald-400" />
                            <span>{c.portalUsername || 'Configured'}</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400 text-[11px]">
                            <EyeOff className="w-3 h-3 text-slate-500" />
                            <span>Missing</span>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        {(() => {
                          const clientMonths = c.months ? Object.values(c.months) : [];
                          const clientRequestedMonths = clientMonths.filter(m => m.status === 'REQUESTED' || Boolean(m.requestedAt));
                          const clientReadyMonths = clientMonths.filter(m => {
                            const timer = getMonthTimer(m.requestedAt, m.status);
                            return timer.isReady || m.status === 'READY_TO_DOWNLOAD';
                          });

                          const singleTimer = getMonthTimer(c.requestedAt, c.status);
                          const isSingleReady = singleTimer.isReady || c.status === 'READY_TO_DOWNLOAD';
                          const isSingleRequested = (c.status === 'REQUESTED' || Boolean(c.requestedAt)) && c.status !== 'SYNCED' && !isSingleReady;

                          if (viewMode === 'FULL_YEAR' && clientReadyMonths.length > 0) {
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadAllReadyMonths();
                                }}
                                className="px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white border border-emerald-300 text-[10px] font-black uppercase inline-flex items-center gap-1 animate-bounce hover:scale-105 transition-all shadow-md shadow-emerald-950"
                                title="Download ready files now!"
                              >
                                <Download className="w-3 h-3 text-white" />
                                <span>{clientReadyMonths.length} Ready!</span>
                              </button>
                            );
                          }

                          if (viewMode === 'FULL_YEAR' && clientRequestedMonths.length > 0) {
                            const minSec = Math.min(...clientRequestedMonths.map(m => getMonthTimer(m.requestedAt, m.status).secondsLeft));
                            return (
                              <span className="px-2.5 py-1 rounded-full bg-amber-500/25 border-2 border-amber-400 text-amber-200 text-[10px] font-mono font-bold inline-flex items-center gap-1 shadow-md shadow-amber-950/60 animate-pulse">
                                <Clock className="w-3 h-3 text-amber-300 animate-spin" />
                                <span>⏱️ {clientRequestedMonths.length}M Queued ({formatSeconds(minSec)})</span>
                              </span>
                            );
                          }

                          if (viewMode === 'MONTH' && isSingleReady) {
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRunAutopilot(c, selectedMonth, activePeriod, true);
                                }}
                                className="px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-400 text-emerald-300 text-[10px] font-black uppercase inline-flex items-center gap-1 animate-pulse hover:scale-105 transition-all shadow-md shadow-emerald-950"
                                title="File generation completed on GST Portal! Click to download now."
                              >
                                <Download className="w-3 h-3 text-cyan-300 animate-bounce" />
                                <span>Download Ready!</span>
                              </button>
                            );
                          }

                          if (viewMode === 'MONTH' && isSingleRequested) {
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRunAutopilot(c, selectedMonth, activePeriod, true);
                                }}
                                className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-mono font-bold inline-flex items-center gap-1 hover:bg-amber-500/25 transition-colors"
                                title="File generation in progress on GST Portal. Click to return & download."
                              >
                                <Clock className="w-3 h-3 text-amber-400 animate-spin" />
                                <span>{formatSeconds(singleTimer.secondsLeft)}</span>
                              </button>
                            );
                          }

                          if (c.status === 'PUSHED_TO_3B') {
                            return (
                              <span className="px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[10px] font-bold uppercase inline-flex items-center gap-1">
                                <CheckCheck className="w-3 h-3 text-purple-400" /> Applied 3B
                              </span>
                            );
                          }

                          if (c.status === 'SYNCED' || (viewMode === 'FULL_YEAR' && isFullySynced)) {
                            return (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Synced
                              </span>
                            );
                          }

                          if (viewMode === 'FULL_YEAR' && (c.syncedCount || 0) > 0) {
                            return (
                              <span className="px-2.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold uppercase inline-flex items-center gap-1">
                                <Clock className="w-3 h-3 text-cyan-400" /> Partial
                              </span>
                            );
                          }

                          return (
                            <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold uppercase inline-flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-400" /> Pending
                            </span>
                          );
                        })()}
                      </td>

                      {/* 12M Progress Badge (Only in Full Year Mode) */}
                      {viewMode === 'FULL_YEAR' && (
                        <td className="py-3 px-4 text-center">
                          {(() => {
                            const clientMonths = c.months ? Object.values(c.months) : [];
                            const clientRequestedCount = clientMonths.filter(m => m.status === 'REQUESTED' || Boolean(m.requestedAt)).length;
                            return (
                              <div className="inline-flex flex-col items-center">
                                <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                                  isFullySynced
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : (c.syncedCount || 0) > 0
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                    : clientRequestedCount > 0
                                    ? 'bg-amber-500/25 text-amber-200 border-2 border-amber-400 animate-pulse'
                                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                                }`}>
                                  {isFullySynced
                                    ? '12 / 12 Months'
                                    : (c.syncedCount || 0) > 0
                                    ? `${c.syncedCount} / 12 Months`
                                    : clientRequestedCount > 0
                                    ? `⏱️ ${clientRequestedCount}/12 Queued`
                                    : '0 / 12 Months'}
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                      )}

                      {/* Invoices Count Breakdown */}
                      <td className="py-3 px-4 text-center">
                        <span className="font-mono font-bold text-white text-xs">
                          {c.totalInvoices || 0}
                        </span>
                        <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1.5 mt-0.5">
                          <span title="B2B">{c.b2bCount || 0} B2B</span>
                          <span>•</span>
                          <span title="B2CS">{c.b2csCount || 0} B2CS</span>
                          <span>•</span>
                          <span title="CDNR">{c.cdnrCount || 0} CDNR</span>
                        </div>
                      </td>

                      {/* Taxable Outward */}
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-200">
                        {formatCur(c.totalTaxable || 0)}
                      </td>

                      {/* Total Outward Tax */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-indigo-300">
                        {formatCur(c.totalTax || 0)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Autopilot Sync Button */}
                          <button
                            onClick={() => handleRunAutopilot(c)}
                            disabled={!c.hasCreds}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
                              c.hasCreds
                                ? 'bg-blue-600/90 hover:bg-blue-500 text-white shadow-sm shadow-blue-950'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                            title={
                              c.hasCreds
                                ? viewMode === 'FULL_YEAR'
                                  ? 'Launch 12-Month Autonomous GSTR-1 Downloader'
                                  : 'Launch Single-Month GSTR-1 Downloader'
                                : 'Set Portal Credentials in Vault first'
                            }
                          >
                            <Zap className="w-3 h-3" />
                            <span>{viewMode === 'FULL_YEAR' ? 'Sync 12M' : 'Download'}</span>
                          </button>

                          {/* 12M Excel Export Button */}
                          <button
                            onClick={() => handleDownload12mExcelDirect(c)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1 transition-colors"
                            title="Export Consolidated 12-Month GSTR-1 Excel Workbook"
                          >
                            <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                            <span>12M Excel</span>
                          </button>

                          {/* View Invoices / Details */}
                          <button
                            onClick={() => handleOpenClientDetails(c)}
                            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            title="View itemized outward invoices"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Push to 3B Table 3.1 */}
                          <button
                            onClick={() => handlePushTo3B(c)}
                            disabled={!c.totalTaxable && !c.totalTax}
                            className="px-2 py-1 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-[11px] font-bold flex items-center gap-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Push Outward Sales into GSTR-3B Table 3.1"
                          >
                            <ArrowUpRight className="w-3 h-3 text-purple-400" />
                            <span>To 3B</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── 5. ITEM INSPECTION DRILLDOWN MODAL ───────────────────────────────── */}
      {activeClientDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center font-bold">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    {activeClientDetail.trade_name || activeClientDetail.legal_name}
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-300">
                      {activeClientDetail.gstin}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {viewMode === 'FULL_YEAR' ? `Consolidated FY ${financialYear}` : activePeriod} Outward Supplies • {detailInvoices.length} Total Records
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportInvoicesExcel}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export to Excel</span>
                </button>
                <button
                  onClick={() => setActiveClientDetail(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Filters & Tabs */}
            <div className="p-3 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-1">
                {['ALL', 'B2B', 'B2CL', 'B2CS', 'CDNR', 'EXP'].map(sec => (
                  <button
                    key={sec}
                    onClick={() => setDetailSectionFilter(sec)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                      detailSectionFilter === sec
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800/70 text-slate-400 hover:text-white'
                    }`}
                  >
                    {sec}
                  </button>
                ))}
              </div>

              <div className="relative min-w-[240px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={detailSearch}
                  onChange={e => setDetailSearch(e.target.value)}
                  placeholder="Filter by recipient GSTIN, name, invoice..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Modal Table Content */}
            <div className="flex-1 overflow-auto p-4">
              {loadingDetail ? (
                <div className="py-20 text-center text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-400" />
                  <span>Loading itemized outward supplies...</span>
                </div>
              ) : filteredDetailInvoices.length === 0 ? (
                <div className="py-20 text-center text-slate-500">
                  No invoices found in this section.
                </div>
              ) : (
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/80 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800 text-[10px]">
                      <th className="py-2 px-3">Period</th>
                      <th className="py-2 px-3">Section</th>
                      <th className="py-2 px-3">Recipient GSTIN</th>
                      <th className="py-2 px-3">Receiver Name</th>
                      <th className="py-2 px-3">Invoice No</th>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3 text-right">Taxable</th>
                      <th className="py-2 px-3 text-right">IGST</th>
                      <th className="py-2 px-3 text-right">CGST</th>
                      <th className="py-2 px-3 text-right">SGST</th>
                      <th className="py-2 px-3 text-right">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 font-mono text-[11px]">
                    {filteredDetailInvoices.map((inv, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2 px-3 text-slate-400 font-sans">{inv.return_period}</td>
                        <td className="py-2 px-3 font-bold text-blue-400">{inv.section}</td>
                        <td className="py-2 px-3 text-slate-200">{inv.ctin || '-'}</td>
                        <td className="py-2 px-3 text-slate-300 font-sans truncate max-w-[150px]" title={inv.cname}>
                          {inv.cname || '-'}
                        </td>
                        <td className="py-2 px-3 text-white font-semibold">{inv.inum}</td>
                        <td className="py-2 px-3 text-slate-400">{inv.idt}</td>
                        <td className="py-2 px-3 text-right text-emerald-400">{formatCur(inv.txval)}</td>
                        <td className="py-2 px-3 text-right text-slate-300">{formatCur(inv.iamt)}</td>
                        <td className="py-2 px-3 text-right text-slate-300">{formatCur(inv.camt)}</td>
                        <td className="py-2 px-3 text-right text-slate-300">{formatCur(inv.samt)}</td>
                        <td className="py-2 px-3 text-right text-white font-bold">{formatCur(inv.val || (inv.txval + inv.iamt + inv.camt + inv.samt + inv.csamt))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── 6. BATCH MULTI-SYNC MODAL ───────────────────────────────────────── */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center">
                  <Zap className="w-4 h-4 fill-blue-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {viewMode === 'FULL_YEAR' ? 'Full-Year GSTR-1 Multi-Sync' : 'Monthly GSTR-1 Multi-Sync'}
                  </h3>
                  <p className="text-[11px] text-slate-400">Autonomous sequential download</p>
                </div>
              </div>
              <button
                onClick={() => setShowBatchModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {batchQueue.map((item, idx) => (
                <div
                  key={item.gstin}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                    idx === currentBatchIndex
                      ? 'bg-blue-950/40 border-blue-500/40 text-blue-300'
                      : item.status === 'SUCCESS'
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                      : item.status === 'FAILED'
                      ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate">{item.trade_name || item.gstin}</p>
                    <p className="font-mono text-[10px] text-slate-500">{item.gstin}</p>
                  </div>

                  <div>
                    {item.status === 'CONNECTING' ? (
                      <span className="flex items-center gap-1.5 text-blue-400 font-bold">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> In Progress
                      </span>
                    ) : item.status === 'SUCCESS' ? (
                      <span className="flex items-center gap-1 text-emerald-400 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Done
                      </span>
                    ) : item.status === 'FAILED' ? (
                      <span className="text-rose-400 font-bold">Failed</span>
                    ) : (
                      <span className="text-slate-500">Queued</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowBatchModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ─── 7. ACTIVE AUTOPILOT RUNNING FLOATING BANNER ────────────────────── */}
      {activeAutopilotClient && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border-2 border-blue-500 rounded-2xl p-4 shadow-2xl shadow-blue-950 flex items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
            <Zap className="w-5 h-5 fill-blue-400 animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <span>GSTR-1 Autopilot Active</span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-blue-950 text-blue-300 font-mono">
                {activeAutopilotClient.gstin}
              </span>
            </h4>
            <p className="text-xs text-slate-300 mt-0.5">
              Client: <strong className="text-white">{activeAutopilotClient.trade_name}</strong> • Browser active on GST Portal
            </p>
          </div>
          <button
            onClick={() => {
              autopilotAbortRef.current?.abort();
              toast.info('Autopilot cancellation requested...');
            }}
            className="ml-3 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
