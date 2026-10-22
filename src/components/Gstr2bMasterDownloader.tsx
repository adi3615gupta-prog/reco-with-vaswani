import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Building2, Calendar, CheckCircle2, Clock, Download, ExternalLink,
  FileSpreadsheet, FileText, Filter, MessageSquare, RefreshCw,
  Search, Send, ShieldCheck, Sparkles, UploadCloud, Users, X,
  Check, AlertTriangle, ArrowUpDown, Eye, ArrowRight, Smartphone,
  Laptop, Globe, CheckCheck, FileJson, Key, EyeOff,
  Zap, Play, Pause, SkipForward, Square, FolderSearch, Loader2,
  DownloadCloud, Layers, ArrowDownToLine, Database
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiBase, safeApiFetch } from '@/lib/api';
import { GSTR3BMonthKey, GSTR3B_MONTHS } from '@/lib/gstr3bEngine';
import { exportGstr2bFullYearExcel } from '@/lib/gstr2bFullYearExport';
import * as XLSX from 'xlsx';

export interface Gstr2bInvoiceItem {
  id: string;
  batch_id?: string;
  client_gstin: string;
  return_period: string;
  section: string;
  ctin: string;
  supplier_name?: string;
  inum: string;
  idt: string;
  inv_typ?: string;
  pos?: string;
  rchrg?: string;
  itc_available?: string;
  itc_reason?: string;
  txval: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  total_val: number;
  source_period?: string;
  filing_date?: string;
  created_at?: number;
}

export interface Gstr2bClientBatch {
  id: string;
  gstin: string;
  trade_name: string;
  legal_name?: string;
  phone?: string;
  email?: string;
  hasCreds: boolean;
  portalUsername?: string;
  status: 'PENDING' | 'SYNCED' | 'PUSHED_TO_3B' | 'FAILED' | 'PARTIAL' | 'NIL_SYNCED';
  period: string;
  financialYear?: string;
  syncedMonths?: string[];
  nilMonths?: string[];
  pendingMonths?: string[];
  syncedCount?: number;
  totalMonths?: number;
  stats: {
    totalInvoices: number;
    b2bCount: number;
    b2baCount: number;
    cdnrCount: number;
    cdnraCount: number;
    isdCount: number;
    impgCount: number;
    eligibleItc: {
      igst: number;
      cgst: number;
      sgst: number;
      cess: number;
      total: number;
    };
    ineligibleTotal: number;
  };
  hasExcel: boolean;
  hasJson: boolean;
  excelPath?: string;
  jsonPath?: string;
  downloadedAt?: number;
  updatedAt?: number;
}

interface Gstr2bMasterDownloaderProps {
  selectedMonth: GSTR3BMonthKey;
  financialYear: string;
  onApplyTo3B?: (
    itc2b: { igst: number; cgst: number; sgst: number; cess?: number; total: number },
    rcmInward?: { igst: number; cgst: number; sgst: number; total: number },
    creditNotes?: { igst: number; cgst: number; sgst: number; total: number },
    importGoods?: { igst: number; total: number }
  ) => void;
  currentGstin?: string;
}

export default function Gstr2bMasterDownloader({
  selectedMonth,
  financialYear,
  onApplyTo3B,
  currentGstin
}: Gstr2bMasterDownloaderProps) {
  const startYear = (financialYear || '2025-26').match(/\d{4}/)?.[0] || '2025';
  const activePeriod = `${selectedMonth} ${startYear}`;

  // View Mode: Single filing month vs full 12-month FY consolidation
  const [viewMode, setViewMode] = useState<'MONTH' | 'FULL_YEAR'>('MONTH');

  // Data States
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Gstr2bClientBatch[]>([]);
  const [overview, setOverview] = useState({
    totalClients: 0,
    downloadedClients: 0,
    pendingClients: 0,
    totalEligibleItc: 0,
    totalInvoices: 0,
    fullySyncedClients: 0,
    partiallySyncedClients: 0
  });

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SYNCED' | 'PENDING' | 'CONFIGURED'>('ALL');
  const [selectedGstins, setSelectedGstins] = useState<Set<string>>(new Set());

  // Detail Modal States
  const [activeClientDetail, setActiveClientDetail] = useState<Gstr2bClientBatch | null>(null);
  const [detailInvoices, setDetailInvoices] = useState<Gstr2bInvoiceItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailSectionFilter, setDetailSectionFilter] = useState<string>('ALL');
  const [detailSearch, setDetailSearch] = useState('');

  // Dropzone & Single Portal Modal
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
  const batchAbortRef = useRef<AbortController | null>(null);

  // Single Autopilot Active Modal
  const [activeAutopilotClient, setActiveAutopilotClient] = useState<Gstr2bClientBatch | null>(null);
  const autopilotAbortRef = useRef<AbortController | null>(null);

  // Load clients & summary from backend
  const fetchSummary = async () => {
    setLoading(true);
    try {
      const endpoint = viewMode === 'FULL_YEAR'
        ? `/api/gstr2b/fy-summary?financialYear=${encodeURIComponent(financialYear)}`
        : `/api/gstr2b/summary?period=${encodeURIComponent(activePeriod)}`;
      const res = await safeApiFetch(endpoint);
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(text.startsWith('<') ? 'Server returned HTML instead of JSON. Ensure the backend server is running.' : text);
      }
      if (!res.ok) throw new Error('Failed fetching GSTR-2B summary');
      const data = await res.json();
      if (data.success) {
        setClients(data.clients || []);
        if (data.overview) {
          if (viewMode === 'FULL_YEAR') {
            setOverview({
              totalClients: data.overview.totalClients || 0,
              downloadedClients: data.overview.fullySyncedClients || 0,
              pendingClients: (data.overview.partiallySyncedClients || 0) + (data.overview.pendingClients || 0),
              totalEligibleItc: data.overview.total12mEligibleItc || 0,
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
      console.error('GSTR-2B summary error:', err);
      toast.error('Failed to load GSTR-2B data', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [activePeriod, viewMode, financialYear]);

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

  // ─── 1-CLICK SCAN DOWNLOADS FOLDER ──────────────────────────────────────────
  const handleScanDownloads = async () => {
    setIsScanningDownloads(true);
    toast.info('Scanning user Downloads for official GSTR-2B files...');
    try {
      const res = await safeApiFetch('/api/gstr2b/scan-downloads', {
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

  // ─── SINGLE CLIENT AUTOPILOT SYNC ───────────────────────────────────────────
  const handleBringToFront = async () => {
    try {
      await safeApiFetch('/api/gstr2b/bring-to-front', { method: 'POST' });
      toast.success('Focused browser window!');
    } catch {}
  };

  const handleRunAutopilot = async (client: Gstr2bClientBatch) => {
    setActiveAutopilotClient(client);
    const controller = new AbortController();
    autopilotAbortRef.current = controller;

    try {
      const res = await safeApiFetch('/api/gstr2b/portal-sync-browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          gstin: client.gstin,
          returnPeriod: activePeriod,
          financialYear,
          isFullYear: viewMode === 'FULL_YEAR'
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchSummary();
      } else {
        toast.error('2B Autopilot issue', { description: data.error });
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        toast.info('Autopilot session cancelled');
        safeApiFetch('/api/gstr2b/cancel', { method: 'POST' }).catch(() => {});
      } else {
        toast.error('2B Autopilot connection failed', { description: e.message });
      }
    } finally {
      setActiveAutopilotClient(null);
      autopilotAbortRef.current = null;
    }
  };

  // Direct download of consolidated 12M Excel workbook
  const handleDownload12mExcelDirect = (client: Gstr2bClientBatch) => {
    const url = `${getApiBase()}/api/gstr2b/export-full-year/${client.gstin}?financialYear=${encodeURIComponent(financialYear)}`;
    window.open(url, '_blank');
    toast.success(`Generating full-year GSTR-2B Excel for ${client.trade_name || client.gstin}...`);
  };

  // ─── BATCH MULTI-SYNC AUTOPILOT QUEUE ───────────────────────────────────────
  const handleStartBatchSync = (targetClients: Gstr2bClientBatch[]) => {
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
      toast.success('Batch 2B Autopilot sequence completed!');
      fetchSummary();
      return;
    }

    const item = queue[index];
    setCurrentBatchIndex(index);

    // Update status to CONNECTING
    setBatchQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'CONNECTING' } : q));

    try {
      const res = await safeApiFetch('/api/gstr2b/portal-sync-browser', {
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

    // Proceed to next client in queue
    runBatchQueue(queue, index + 1);
  };

  // ─── PUSH 2B ITC TO GSTR-3B TABLE 4 ─────────────────────────────────────────
  const handlePushTo3B = async (client: Gstr2bClientBatch) => {
    if (!client.stats.eligibleItc || client.stats.eligibleItc.total === 0) {
      return toast.error('No eligible 2B ITC recorded to push to 3B.');
    }

    try {
      const res = await safeApiFetch('/api/gstr2b/push-to-3b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gstin: client.gstin, period: activePeriod })
      });
      const data = await res.json();
      if (data.success) {
        if (onApplyTo3B) {
          onApplyTo3B(data.itc2b, data.rcmInward, data.creditNotes, data.importGoods);
        }
        toast.success(`Applied ${formatCur(data.itc2b.total)} 2B ITC to Table 4!`);
        fetchSummary();
      } else {
        toast.error('Failed pushing to 3B', { description: data.error });
      }
    } catch (e: any) {
      toast.error('Push error', { description: e.message });
    }
  };

  // ─── LINE ITEM INSPECTOR MODAL ──────────────────────────────────────────────
  const handleOpenClientDetails = async (client: Gstr2bClientBatch) => {
    setActiveClientDetail(client);
    setLoadingDetail(true);
    setDetailSectionFilter('ALL');
    setDetailSearch('');
    try {
      const endpoint = viewMode === 'FULL_YEAR'
        ? `/api/gstr2b/invoices/${client.gstin}?financialYear=${encodeURIComponent(financialYear)}`
        : `/api/gstr2b/invoices/${client.gstin}?period=${encodeURIComponent(activePeriod)}`;
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
        if (detailSectionFilter === 'INELIGIBLE') {
          if (inv.itc_available !== 'N') return false;
        } else {
          if (!inv.section.toUpperCase().includes(detailSectionFilter)) return false;
        }
      }
      if (detailSearch) {
        const q = detailSearch.toLowerCase().trim();
        const match =
          inv.ctin.toLowerCase().includes(q) ||
          (inv.supplier_name && inv.supplier_name.toLowerCase().includes(q)) ||
          inv.inum.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [detailInvoices, detailSectionFilter, detailSearch]);

  // Export line items to Excel
  const handleExportInvoicesExcel = () => {
    if (!activeClientDetail || detailInvoices.length === 0) return;

    if (viewMode === 'FULL_YEAR') {
      exportGstr2bFullYearExcel({
        clientInfo: {
          trade_name: activeClientDetail.trade_name,
          legal_name: activeClientDetail.legal_name,
          gstin: activeClientDetail.gstin
        },
        financialYear,
        invoices: detailInvoices
      });
      toast.success('Exported 12-Month Consolidated GSTR-2B Workbook (8 Sheets with Side-by-Side Matrices)!');
      return;
    }

    const wb = XLSX.utils.book_new();
    const rows = detailInvoices.map(i => ({
      Section: i.section,
      'Supplier GSTIN': i.ctin,
      'Supplier Name': i.supplier_name || '',
      'Invoice No': i.inum,
      'Invoice Date': i.idt,
      'Invoice Type': i.inv_typ || 'Regular',
      'Taxable Value': i.txval,
      IGST: i.igst,
      CGST: i.cgst,
      SGST: i.sgst,
      Cess: i.cess,
      'Total Value': i.total_val,
      'ITC Available': i.itc_available === 'Y' ? 'Yes' : 'No',
      'Reason / Note': i.itc_reason || '',
      'Filing Date': i.filing_date || ''
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, ws, '2B Invoices');
    XLSX.writeFile(wb, `GSTR2B_${activeClientDetail.gstin}_${activePeriod.replace(/\s+/g, '_')}.xlsx`);
    toast.success('Exported 2B Line Items to Excel!');
  };

  // ─── FILE DROPZONE UPLOAD ───────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    setShowDropzoneModal(false);

    let successCount = 0;
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const toastId = toast.loading(`Parsing & ingesting (${i + 1}/${fileList.length}) ${file.name}...`);
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const res = await safeApiFetch('/api/gstr2b/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            base64Content: base64,
            returnPeriod: activePeriod
          })
        });
        const data = await res.json();
        if (data.success) {
          toast.success(`[${i + 1}/${fileList.length}] Ingested ${file.name}`, { id: toastId });
          successCount++;
        } else {
          toast.error(`[${i + 1}/${fileList.length}] Failed ${file.name}`, { id: toastId, description: data.error });
        }
      } catch (err: any) {
        toast.error(`Error with ${file.name}`, { id: toastId, description: err.message });
      }
    }

    if (successCount > 0) {
      toast.success(`Successfully processed ${successCount} file(s)!`);
      fetchSummary();
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ─── 1. MASTER KPI CARDS ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="obsidian-card rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Total Clients</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white">{overview.totalClients}</div>
          <p className="text-[11px] text-slate-400 mt-1">Master Database</p>
        </div>

        <div className="bg-slate-900/80 border border-emerald-500/20 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>{viewMode === 'FULL_YEAR' ? '12M Fully Synced' : '2B Synced'}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-300">{overview.downloadedClients}</div>
          <p className="text-[11px] text-slate-400 mt-1">
            {viewMode === 'FULL_YEAR' ? 'All 12 Months Ingested' : '2B Data Available'}
          </p>
        </div>

        <div className="bg-slate-900/80 border border-amber-500/20 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>{viewMode === 'FULL_YEAR' ? 'Partial / Pending' : 'Pending 2B'}</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-300">{overview.pendingClients}</div>
          <p className="text-[11px] text-slate-400 mt-1">
            {viewMode === 'FULL_YEAR' ? 'Missing 1+ Months' : 'Ready for Autopilot'}
          </p>
        </div>

        <div className="bg-slate-900/80 border border-purple-500/20 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between text-purple-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Total 2B Invoices</span>
            <Database className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-purple-300">{overview.totalInvoices.toLocaleString('en-IN')}</div>
          <p className="text-[11px] text-slate-400 mt-1">B2B, CDNR, ISD, IMPG</p>
        </div>

        <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-cyan-950/40 via-slate-900/80 to-blue-950/40 border border-cyan-500/30 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Eligible 2B ITC</span>
            <Sparkles className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-cyan-300">{formatCur(overview.totalEligibleItc)}</div>
          <p className="text-[11px] text-slate-400 mt-1">Table 4 Ready</p>
        </div>
      </div>

      {/* ─── 2. CONTROL ACTION TOOLBAR ────────────────────────────────────────── */}
      <div className="obsidian-card rounded-2xl p-4 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shadow-xl">
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
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-all"
            title="Scan Windows Downloads folder for GSTR2B_*.xlsx or .json files"
          >
            <FolderSearch className={`w-4 h-4 text-cyan-400 ${isScanningDownloads ? 'animate-spin' : ''}`} />
            Scan Downloads
          </button>

          {/* Drop Files Manually */}
          <button
            onClick={() => setShowDropzoneModal(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-all"
          >
            <UploadCloud className="w-4 h-4 text-purple-400" />
            Drop 2B Files (.xlsx / .json)
          </button>

          {/* Single Portal Sync */}
          <button
            onClick={() => setShowSingleModal(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-all"
          >
            <Globe className="w-4 h-4 text-emerald-400" />
            Single Portal Sync
          </button>

          {/* Refresh */}
          <button
            onClick={fetchSummary}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors"
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

          <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3.5 py-2 rounded-xl text-xs font-mono">
            {viewMode === 'FULL_YEAR' ? (
              <>
                <Layers className="w-4 h-4 text-purple-400" />
                <span className="text-slate-400">Scope:</span>
                <strong className="text-white">FY {financialYear} (12M Clubbed)</strong>
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4 text-purple-400" />
                <span className="text-slate-400">Period:</span>
                <strong className="text-white">{activePeriod}</strong>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── 3. SEARCH & STATUS FILTER ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/50 p-3 rounded-2xl border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by Client Name, GSTIN, Phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:border-blue-500 outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto justify-end">
          {[
            { id: 'ALL', label: `All (${clients.length})` },
            { id: 'SYNCED', label: `Synced (${overview.downloadedClients})` },
            { id: 'PENDING', label: `Pending (${overview.pendingClients})` },
            { id: 'CONFIGURED', label: `Vault Creds (${clients.filter(c => c.hasCreds).length})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                statusFilter === tab.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-950'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── 4. CLIENT MASTER TABLE ──────────────────────────────────────────── */}
      <div className="obsidian-card rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/80 text-slate-400 font-bold border-b border-slate-800 uppercase tracking-wider">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedGstins.size > 0 && selectedGstins.size === filteredClients.length}
                    onChange={toggleSelectAll}
                    className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4">Client Name & GSTIN</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-center">Total Invoices</th>
                <th className="py-3 px-3 text-right">Eligible 2B ITC</th>
                <th className="py-3 px-3 text-right">Ineligible ITC</th>
                <th className="py-3 px-3 text-center">Files</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <p className="text-sm font-semibold">No clients match the criteria</p>
                    <p className="text-xs text-slate-600 mt-1">Try adjusting the search query or status filter.</p>
                  </td>
                </tr>
              ) : (
                filteredClients.map(client => {
                  const isSelected = selectedGstins.has(client.gstin);
                  const isSynced = client.status === 'SYNCED' || client.status === 'PUSHED_TO_3B';

                  return (
                    <tr
                      key={client.gstin}
                      className={`hover:bg-slate-800/40 transition-colors ${isSelected ? 'bg-blue-950/20' : ''}`}
                    >
                      <td className="py-3.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectClient(client.gstin)}
                          className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      <td className="py-3.5 px-4">
                        <div
                          onClick={() => handleOpenClientDetails(client)}
                          className="cursor-pointer group"
                        >
                          <div className="font-bold text-white group-hover:text-cyan-400 transition-colors text-[13px] flex items-center gap-1.5">
                            {client.trade_name}
                            <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-cyan-400" />
                          </div>
                          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 mt-0.5">
                            <span className="text-blue-400 font-semibold">{client.gstin}</span>
                            {client.portalUsername && (
                              <span className="text-slate-500">• User: {client.portalUsername}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-center">
                        {viewMode === 'FULL_YEAR' ? (
                          client.syncedCount === 12 ? (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-help"
                              title={`All 12 Months Synced\nSynced: ${client.syncedMonths?.join(', ') || '12 Months'}${client.nilMonths && client.nilMonths.length > 0 ? `\n(Includes Nil: ${client.nilMonths.join(', ')})` : ''}`}
                            >
                              <CheckCircle2 className="w-3 h-3" /> 12/12 Months
                            </span>
                          ) : (client.syncedCount || 0) > 0 ? (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-help"
                              title={`Synced (${client.syncedCount}/12): ${client.syncedMonths?.join(', ') || 'None'}${client.nilMonths && client.nilMonths.length > 0 ? `\n(Nil: ${client.nilMonths.join(', ')})` : ''}\nPending (${12 - (client.syncedCount || 0)}): ${client.pendingMonths?.join(', ') || 'None'}`}
                            >
                              <Clock className="w-3 h-3" /> {client.syncedCount}/12 Months
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 cursor-help"
                              title={`0/12 Months Synced\nPending: ${client.pendingMonths?.join(', ') || 'All 12 Months'}`}
                            >
                              <AlertTriangle className="w-3 h-3" /> 0/12 Months
                            </span>
                          )
                        ) : client.status === 'NIL_SYNCED' ? (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-500/10 text-slate-300 border border-slate-500/20"
                            title="Confirmed Nil Return: 0 inward supplies on GST Portal"
                          >
                            <CheckCircle2 className="w-3 h-3 text-slate-400" /> Nil Return (0 Inv)
                          </span>
                        ) : isSynced ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> Synced
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-center font-mono font-medium text-slate-300">
                        {client.stats.totalInvoices > 0 ? (
                          <div>
                            <span className="text-white font-bold">{client.stats.totalInvoices}</span>
                            <div className="text-[10px] text-slate-500">
                              B2B: {client.stats.b2bCount} | CDNR: {client.stats.cdnrCount}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-right font-mono font-bold text-cyan-300">
                        {client.stats.eligibleItc.total > 0 ? (
                          <div>
                            <span>{formatCur(client.stats.eligibleItc.total)}</span>
                            <div className="text-[10px] text-slate-500 font-normal">
                              IGST: {formatCur(client.stats.eligibleItc.igst)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-600">₹0</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-right font-mono text-rose-400/80">
                        {client.stats.ineligibleTotal > 0 ? (
                          formatCur(client.stats.ineligibleTotal)
                        ) : (
                          <span className="text-slate-600">₹0</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {client.hasExcel && (
                            <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-[10px] font-mono border border-emerald-500/30 font-bold" title="Excel file cached">
                              XLSX
                            </span>
                          )}
                          {client.hasJson && (
                            <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded text-[10px] font-mono border border-purple-500/30 font-bold" title="JSON file cached">
                              JSON
                            </span>
                          )}
                          {!client.hasExcel && !client.hasJson && (
                            <span className="text-slate-600 text-[11px]">—</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Autopilot Button */}
                          <button
                            onClick={() => handleRunAutopilot(client)}
                            className={`px-2.5 py-1 text-xs font-bold rounded-lg border flex items-center gap-1 transition-all ${
                              viewMode === 'FULL_YEAR'
                                ? 'bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white border-purple-500/30'
                                : 'bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border-blue-500/30'
                            }`}
                            title={viewMode === 'FULL_YEAR' ? 'Run 12-Month Autopilot Loop (April to March)' : 'Run Playwright Autopilot to download GSTR-2B'}
                          >
                            <Zap className="w-3 h-3 fill-current" />
                            {viewMode === 'FULL_YEAR' ? 'Download 12M' : 'Download'}
                          </button>

                          {/* 12-Month Consolidated Excel Export Button */}
                          {viewMode === 'FULL_YEAR' && (
                            <button
                              onClick={() => handleDownload12mExcelDirect(client)}
                              className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-lg text-xs font-bold border border-emerald-500/30 flex items-center gap-1 transition-all shadow-sm"
                              title="Download 8-sheet consolidated 12M Excel workbook matching official SectionWiseSummary"
                            >
                              <FileSpreadsheet className="w-3 h-3" /> 12M Excel
                            </button>
                          )}

                          {/* View Invoices */}
                          <button
                            onClick={() => handleOpenClientDetails(client)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-colors"
                            title={viewMode === 'FULL_YEAR' ? 'Inspect all 12-month line items' : 'Inspect 2B line items'}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Push to 3B */}
                          {isSynced && viewMode === 'MONTH' && (
                            <button
                              onClick={() => handlePushTo3B(client)}
                              className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-lg text-xs font-bold border border-emerald-500/30 flex items-center gap-1 transition-all"
                              title="Push eligible 2B ITC to Table 4 of GSTR-3B"
                            >
                              <ArrowRight className="w-3 h-3" /> Push 3B
                            </button>
                          )}
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

      {/* ─── 5. LINE-ITEM INSPECTOR DRILLDOWN MODAL ─────────────────────────── */}
      {activeClientDetail && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/60">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    {activeClientDetail.trade_name}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono border border-cyan-500/30">
                      GSTR-2B Line Items
                    </span>
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 font-mono">
                    <span className="text-blue-400 font-bold">{activeClientDetail.gstin}</span>
                    <span>•</span>
                    <span>Scope: {viewMode === 'FULL_YEAR' ? `Full FY ${financialYear} (12 Months)` : activePeriod}</span>
                    <span>•</span>
                    <span>Invoices: {detailInvoices.length}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleExportInvoicesExcel}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  {viewMode === 'FULL_YEAR' ? 'Export 12M Consolidated Excel' : 'Export Excel'}
                </button>
                <button
                  onClick={() => setActiveClientDetail(null)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Sub-header ITC summary cards */}
            <div className="p-4 bg-slate-950/40 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded-xl">
                <span className="text-[11px] text-slate-400 uppercase font-bold block">Eligible IGST</span>
                <span className="text-base font-black text-cyan-300 font-mono">
                  {formatCur(activeClientDetail.stats.eligibleItc.igst)}
                </span>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded-xl">
                <span className="text-[11px] text-slate-400 uppercase font-bold block">Eligible CGST + SGST</span>
                <span className="text-base font-black text-cyan-300 font-mono">
                  {formatCur(activeClientDetail.stats.eligibleItc.cgst + activeClientDetail.stats.eligibleItc.sgst)}
                </span>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded-xl">
                <span className="text-[11px] text-slate-400 uppercase font-bold block">Total 2B ITC</span>
                <span className="text-base font-black text-emerald-400 font-mono">
                  {formatCur(activeClientDetail.stats.eligibleItc.total)}
                </span>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded-xl">
                <span className="text-[11px] text-slate-400 uppercase font-bold block">Ineligible ITC</span>
                <span className="text-base font-black text-rose-400 font-mono">
                  {formatCur(activeClientDetail.stats.ineligibleTotal)}
                </span>
              </div>
            </div>

            {/* Filter toolbar inside modal */}
            <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'ALL', label: 'All Invoices' },
                  { id: 'B2B', label: 'B2B Supplies' },
                  { id: 'CDNR', label: 'Credit / Debit Notes' },
                  { id: 'ISD', label: 'ISD Credits' },
                  { id: 'IMPG', label: 'Import of Goods' },
                  { id: 'INELIGIBLE', label: 'Ineligible ITC' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setDetailSectionFilter(tab.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      detailSectionFilter === tab.id
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter supplier, GSTIN, invoice..."
                  value={detailSearch}
                  onChange={e => setDetailSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Modal Table Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingDetail ? (
                <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-cyan-400 mb-2" />
                  <p className="text-xs font-semibold">Loading line-item invoices...</p>
                </div>
              ) : filteredDetailInvoices.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                  <p className="text-sm font-semibold">No invoices found for this section</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800 uppercase tracking-wider">
                        <th className="py-2.5 px-3">Supplier GSTIN</th>
                        <th className="py-2.5 px-3">Supplier Name</th>
                        <th className="py-2.5 px-2 text-center">Type</th>
                        <th className="py-2.5 px-3">Invoice No</th>
                        <th className="py-2.5 px-2">Date</th>
                        <th className="py-2.5 px-3 text-right">Taxable</th>
                        <th className="py-2.5 px-2 text-right">IGST</th>
                        <th className="py-2.5 px-2 text-right">CGST</th>
                        <th className="py-2.5 px-2 text-right">SGST</th>
                        <th className="py-2.5 px-3 text-right">Total</th>
                        <th className="py-2.5 px-2 text-center">ITC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {filteredDetailInvoices.map((inv, idx) => (
                        <tr key={inv.id || idx} className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 font-mono font-semibold text-blue-400">{inv.ctin}</td>
                          <td className="py-2.5 px-3 text-white font-medium max-w-[200px] truncate" title={inv.supplier_name}>
                            {inv.supplier_name || '—'}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
                              {inv.section}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-300">{inv.inum}</td>
                          <td className="py-2.5 px-2 text-slate-400 font-mono whitespace-nowrap">{inv.idt}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">{formatCur(inv.txval)}</td>
                          <td className="py-2.5 px-2 text-right font-mono text-slate-300">{formatCur(inv.igst)}</td>
                          <td className="py-2.5 px-2 text-right font-mono text-slate-300">{formatCur(inv.cgst)}</td>
                          <td className="py-2.5 px-2 text-right font-mono text-slate-300">{formatCur(inv.sgst)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-white">{formatCur(inv.total_val)}</td>
                          <td className="py-2.5 px-2 text-center">
                            {inv.itc_available === 'Y' ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                                Eligible
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold" title={inv.itc_reason || 'Ineligible'}>
                                Ineligible
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── 6. BATCH MULTI-SYNC QUEUE MODAL ──────────────────────────────────── */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold">
                  <Zap className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">2B Autopilot Multi-Sync</h3>
                  <p className="text-xs text-slate-400">Processing {batchQueue.length} clients automatically</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsBatchRunning(false);
                  setShowBatchModal(false);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {batchQueue.map((item, idx) => (
                <div
                  key={item.gstin}
                  className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    idx === currentBatchIndex && isBatchRunning
                      ? 'bg-blue-950/30 border-blue-500/50 shadow-lg'
                      : item.status === 'SUCCESS'
                      ? 'bg-emerald-950/20 border-emerald-500/30'
                      : item.status === 'FAILED'
                      ? 'bg-rose-950/20 border-rose-500/30'
                      : 'bg-slate-950/40 border-slate-800/80'
                  }`}
                >
                  <div>
                    <h4 className="font-bold text-white text-xs">{item.trade_name}</h4>
                    <span className="text-[11px] font-mono text-slate-400">{item.gstin}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {idx === currentBatchIndex && isBatchRunning ? (
                      <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> In Progress...
                      </span>
                    ) : item.status === 'SUCCESS' ? (
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Synced ({item.invoiceCount} bills)
                      </span>
                    ) : item.status === 'FAILED' ? (
                      <span className="text-xs font-bold text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Failed
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-slate-500">Queued</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsBatchRunning(false);
                  setShowBatchModal(false);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 7. DROPZONE MODAL ────────────────────────────────────────────────── */}
      {showDropzoneModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="text-white font-extrabold text-base flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-purple-400" /> Drop Inward 2B File
              </h3>
              <button onClick={() => setShowDropzoneModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 text-center space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-purple-500 p-8 rounded-2xl cursor-pointer transition-colors bg-slate-950/50"
              >
                <FileSpreadsheet className="w-12 h-12 text-purple-400 mx-auto mb-3" />
                <h4 className="font-bold text-white text-sm">Click to select official GSTR-2B file(s)</h4>
                <p className="text-xs text-slate-400 mt-1">Supports selecting all 12 monthly .xlsx, .json, or .zip files at once</p>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".xlsx,.xls,.json,.zip"
                  multiple
                  className="hidden"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 8. SINGLE PORTAL SYNC MODAL ───────────────────────────────────────── */}
      {showSingleModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="text-white font-extrabold text-sm flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-400" /> Single Client 2B Autopilot
              </h3>
              <button onClick={() => setShowSingleModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Target GSTIN
                </label>
                <input
                  type="text"
                  value={targetSingleGstin}
                  onChange={e => setTargetSingleGstin(e.target.value.toUpperCase())}
                  placeholder="27AAAAAAAA0000A1Z5"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white font-mono uppercase focus:border-blue-500 outline-none"
                  maxLength={15}
                />
              </div>

              <button
                onClick={() => {
                  const match = clients.find(c => c.gstin === targetSingleGstin);
                  if (match) {
                    setShowSingleModal(false);
                    handleRunAutopilot(match);
                  } else {
                    setShowSingleModal(false);
                    handleRunAutopilot({
                      id: targetSingleGstin,
                      gstin: targetSingleGstin,
                      trade_name: targetSingleGstin,
                      hasCreds: false,
                      status: 'PENDING',
                      period: activePeriod,
                      stats: {
                        totalInvoices: 0,
                        b2bCount: 0,
                        b2baCount: 0,
                        cdnrCount: 0,
                        cdnraCount: 0,
                        isdCount: 0,
                        impgCount: 0,
                        eligibleItc: { igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 },
                        ineligibleTotal: 0
                      },
                      hasExcel: false,
                      hasJson: false
                    });
                  }
                }}
                disabled={targetSingleGstin.length !== 15}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all uppercase tracking-wider"
              >
                Launch Autopilot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 9. LIVE AUTOPILOT HUD MODAL ─────────────────────────────────────── */}
      {activeAutopilotClient && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-blue-500/30 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <Zap className="w-5 h-5 fill-current animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">2B Autopilot Active</h3>
                  <p className="text-xs text-blue-400 font-mono">{activeAutopilotClient.trade_name} ({activeAutopilotClient.gstin})</p>
                </div>
              </div>
              <button
                onClick={() => {
                  autopilotAbortRef.current?.abort();
                  safeApiFetch('/api/gstr2b/cancel', { method: 'POST' }).catch(() => {});
                  setActiveAutopilotClient(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-blue-950/30 border border-blue-500/20 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-300">
                  <Laptop className="w-4 h-4 text-blue-400" />
                  <span>Chromium Browser Launched on Desktop</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  The GST Portal login page is open. Portal credentials have been auto-filled from your Vault.
                </p>
                <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Step 1: Check taskbar for Chromium icon & switch to it</span>
                  </div>
                  <div className="flex items-center gap-2 text-amber-300 font-medium">
                    <Clock className="w-4 h-4 shrink-0 animate-spin" />
                    <span>Step 2: Enter visual CAPTCHA & click Login</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 font-medium">
                    <Sparkles className="w-4 h-4 shrink-0 text-cyan-400" />
                    <span>
                      {viewMode === 'FULL_YEAR'
                        ? 'Step 3: Autopilot autonomously downloads all 12 months (Apr–Mar) & builds consolidated Excel'
                        : 'Step 3: Autopilot automatically downloads & parses 2B'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleBringToFront}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-blue-950"
                >
                  <Laptop className="w-3.5 h-3.5" />
                  Bring Browser to Front
                </button>
                <button
                  onClick={() => {
                    autopilotAbortRef.current?.abort();
                    safeApiFetch('/api/gstr2b/cancel', { method: 'POST' }).catch(() => {});
                    setActiveAutopilotClient(null);
                  }}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
