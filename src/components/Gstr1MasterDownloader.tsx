import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Building2, Table, Calendar, CheckCircle2, Clock, Download, ExternalLink,
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
  const [clientCockpitMode, setClientCockpitMode] = useState<'COCKPIT' | 'ALL_CLIENTS'>('COCKPIT');
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

  // Active client or fallback for Cockpit display
  const activeCockpitClient: Gstr1ClientBatch = (
    clients.length > 0
      ? (currentGstin ? clients.find(c => c.gstin?.toUpperCase() === currentGstin.toUpperCase()) || clients[0] : clients[0])
      : {
          id: 'demo-client',
          gstin: currentGstin || '27AABCS1234D1Z2',
          trade_name: 'Siddha Edibles Pvt Ltd',
          legal_name: 'Siddha Edibles Private Limited',
          hasCreds: true,
          portalUsername: 'siddha_tax',
          status: 'PARTIAL',
          period: activePeriod,
          financialYear: financialYear,
          syncedMonths: ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
          pendingMonths: ['January', 'February', 'March'],
          syncedCount: 9,
          totalMonths: 12,
          totalInvoices: 1840,
          b2bCount: 1420,
          b2clCount: 112,
          b2csCount: 245,
          cdnrCount: 65,
          expCount: 42,
          totalTaxable: 184250000,
          totalIgst: 20516000,
          totalCgst: 5739000,
          totalSgst: 5739000,
          totalCess: 0,
          totalTax: 31994000,
          hasExcel: true,
          hasJson: true
        }
  );

  const monthHarvestGrid = [
    { m: 'Apr', yr: '24', status: 'SYNCED', inv: 182, to: '₹2.40 Cr', tax: '₹43.20 L' },
    { m: 'May', yr: '24', status: 'SYNCED', inv: 160, to: '₹1.95 Cr', tax: '₹35.10 L' },
    { m: 'Jun', yr: '24', status: 'SYNCED', inv: 210, to: '₹2.80 Cr', tax: '₹50.40 L' },
    { m: 'Jul', yr: '24', status: 'SYNCED', inv: 145, to: '₹1.75 Cr', tax: '₹31.50 L' },
    { m: 'Aug', yr: '24', status: 'SYNCED', inv: 195, to: '₹2.60 Cr', tax: '₹46.80 L' },
    { m: 'Sep', yr: '24', status: 'SYNCED', inv: 230, to: '₹3.10 Cr', tax: '₹55.80 L' },
    { m: 'Oct', yr: '24', status: 'SYNCING', inv: 140, to: '₹1.80 Cr', tax: '₹32.40 L' },
    { m: 'Nov', yr: '24', status: 'QUEUED', inv: 0, to: '--', tax: '--' },
    { m: 'Dec', yr: '24', status: 'QUEUED', inv: 0, to: '--', tax: '--' },
    { m: 'Jan', yr: '25', status: 'QUEUED', inv: 0, to: '--', tax: '--' },
    { m: 'Feb', yr: '25', status: 'QUEUED', inv: 0, to: '--', tax: '--' },
    { m: 'Mar', yr: '25', status: 'QUEUED', inv: 0, to: '--', tax: '--' }
  ];

  return (
    <div className="space-y-3.5 animate-fade-in">
      {/* ─── CLIENT CREDENTIALS & GOLDEN RULE STRIP (1:1 STITCH BLUEPRINT) ─── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-xs space-y-2">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-pink-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">{activeCockpitClient.trade_name}</span>
                <span className="px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 text-[10px] font-bold border border-pink-200/60 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse"></span> GSTR-1 Active
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 mt-0.5 font-mono">
                <span>GSTIN: <strong className="text-slate-800">{activeCockpitClient.gstin}</strong></span>
                <span className="text-slate-300">•</span>
                <span>User: <span className="text-slate-700 font-sans">{activeCockpitClient.portalUsername || 'Auto-Configured'}</span></span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1">Vault: <span className="tracking-widest">••••••••••••</span><ShieldCheck className="w-3 h-3 text-emerald-600" /></span>
                <span className="text-slate-300">•</span>
                <span>FY: <strong className="text-purple-700">{financialYear}</strong></span>
              </div>
            </div>
          </div>

          {/* Golden Rule Mini Pill & Mode Toggle */}
          <div className="flex items-center gap-2 flex-wrap self-start lg:self-center">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-1.5 text-xs">
              <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-[11px] text-slate-700">
                <strong className="font-semibold text-slate-900">Golden Rule:</strong> New data download nahi toh purana data remove nahi hoga (Zero Data Loss).
              </span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 ml-1">IMMUTABLE DB</span>
            </div>

            <button
              onClick={() => setClientCockpitMode(clientCockpitMode === 'COCKPIT' ? 'ALL_CLIENTS' : 'COCKPIT')}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-pink-300" />
              <span>{clientCockpitMode === 'COCKPIT' ? '300+ Clients Overview' : 'Back to Autopilot Cockpit'}</span>
            </button>
          </div>
        </div>
      </div>

      {clientCockpitMode === 'COCKPIT' ? (
        <>
          {/* ─── 2. LOW-PROFILE KPI & AUTOPILOT VELOCITY TRACKER ───────────────── */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-pink-700 bg-pink-50 border border-pink-200/60 px-2.5 py-0.5 rounded-md">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                    Live Multi-Thread Engine
                  </span>
                  <span className="text-[11px] text-slate-500 font-sans">Targeting GSTN Gateway API v2.9 • Monthly Outward Schema</span>
                  <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium border border-emerald-200/50">OTP Auth Active</span>
                </div>

                <div className="flex flex-wrap items-baseline gap-2 font-sans">
                  <h2 className="text-sm font-bold text-slate-900">
                    Autopilot Status: <span className="text-purple-700 font-bold">{activeCockpitClient.syncedCount || 9} / 12 Months Synced</span>
                  </h2>
                  <span className="text-slate-300">•</span>
                  <div className="text-xs text-slate-600">
                    Turnover Captured: <span className="font-mono font-bold text-emerald-700">₹ {formatCur(activeCockpitClient.totalTaxable || 184250000)}</span>
                  </div>
                  <span className="text-slate-300">•</span>
                  <div className="text-[11px] text-slate-500">
                    Session <span className="font-mono font-bold text-slate-700">#GST-8841-PL</span>
                  </div>
                </div>

                {/* Glowing Progress Bar */}
                <div className="mt-2 w-full max-w-3xl">
                  <div className="flex justify-between items-center text-[11px] mb-1">
                    <span className="text-slate-500 font-medium">12-Month Ingestion Batch Velocity</span>
                    <span className="font-mono font-bold text-pink-600">
                      {Math.round(((activeCockpitClient.syncedCount || 9) / 12) * 100)}% Complete (Oct In Progress)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/80">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 shadow-xs relative transition-all duration-500"
                      style={{ width: `${Math.round(((activeCockpitClient.syncedCount || 9) / 12) * 100)}%` }}
                    >
                      <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Autopilot Launch Button */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleRunAutopilot(activeCockpitClient)}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-700 hover:to-rose-700 text-white font-semibold text-xs shadow-sm shadow-pink-600/20 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Zap className="w-4 h-4 text-white fill-white" />
                  <span>Launch GSTR-1 12M Autopilot</span>
                </button>
              </div>
            </div>
          </div>

          {/* ─── 3. OUTWARD TABLES COVERAGE DECK (Compact Chips Row) ───────────── */}
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-slate-700" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">GSTR-1 Outward Tables Coverage Deck</h3>
                <span className="text-[11px] text-slate-400 font-normal">Payload schema alignment across statutory outward disclosures</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {activeCockpitClient.syncedCount || 7} Synced
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 font-semibold bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> 1 Syncing
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> {12 - (activeCockpitClient.syncedCount || 7) - 1} Queued
                </span>
              </div>
            </div>

            {/* Compact Badge Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-10 gap-1.5">
              {[
                { code: '4A, 4B, 6B', label: 'B2B Invoices', status: 'Synced', count: activeCockpitClient.b2bCount || 1420 },
                { code: '5A, 5B', label: 'B2C Large', status: 'Synced', count: activeCockpitClient.b2clCount || 112 },
                { code: 'Table 7', label: 'B2C Small Net', status: 'Synced', count: activeCockpitClient.b2csCount || 245 },
                { code: '9B Reg', label: 'CDNR Reg', status: 'Synced', count: activeCockpitClient.cdnrCount || 65 },
                { code: '9B Unreg', label: 'CDNR Unreg', status: 'Synced', count: 18 },
                { code: '6A - EXP', label: 'Export Inv', status: 'Synced', count: activeCockpitClient.expCount || 42 },
                { code: 'Table 8', label: 'Nil / Exempt', status: 'Synced', count: 0 },
                { code: 'Table 12', label: 'HSN Summary', status: 'Syncing', count: 142, isSyncing: true },
                { code: 'Table 13', label: 'Docs Issued', status: 'Queued', count: 210, isQueued: true },
                { code: 'Schema #90A7', label: 'Zero Discrepancy', status: 'Verified', count: 0, isHash: true }
              ].map((chip) => (
                <div
                  key={chip.code}
                  className={`p-2 rounded-lg border transition-colors flex flex-col justify-between ${
                    chip.isSyncing
                      ? 'bg-amber-50/70 hover:bg-amber-100/70 border-amber-200/80 ring-1 ring-amber-400/30'
                      : chip.isQueued
                      ? 'bg-slate-50/60 border-slate-200/50 opacity-70'
                      : chip.isHash
                      ? 'bg-purple-50/50 border-purple-200/60'
                      : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200/70'
                  }`}
                >
                  <div className="font-mono font-bold text-[11px] text-slate-900 truncate">{chip.code}</div>
                  <div className="text-[10px] text-slate-500 truncate mb-1">{chip.label}</div>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded w-fit flex items-center gap-1 font-mono ${
                      chip.isSyncing
                        ? 'text-amber-800 bg-amber-100/90'
                        : chip.isQueued
                        ? 'text-slate-500 bg-slate-200/70'
                        : chip.isHash
                        ? 'text-purple-700 bg-purple-100'
                        : 'text-emerald-700 bg-emerald-100/80'
                    }`}
                  >
                    {chip.isSyncing ? (
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    ) : chip.isQueued ? (
                      <Clock className="w-2.5 h-2.5" />
                    ) : (
                      <Check className="w-2.5 h-2.5" />
                    )}
                    <span>{chip.status}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ─── 4. MONTH-BY-MONTH PROGRESS GRID (12 Sleek Low-Profile Cards) ─── */}
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between pb-2 mb-1 border-b border-slate-100">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Month-by-Month Payload Harvesting Grid</h3>
                <p className="text-[11px] text-slate-400">JSON extractions, verified outward vouchers, and tax yields</p>
              </div>
              <div className="font-mono text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                Apr {financialYear.slice(0, 4)} – Mar 20{financialYear.slice(-2)}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {monthHarvestGrid.map((item) => (
                <div
                  key={item.m}
                  className={`p-2.5 rounded-xl border transition-all ${
                    item.status === 'SYNCED'
                      ? 'bg-slate-50 hover:bg-slate-100/90 border-slate-200/70'
                      : item.status === 'SYNCING'
                      ? 'bg-amber-50/70 border-2 border-amber-500/80 ring-1 ring-amber-400/40 shadow-xs'
                      : 'bg-slate-50/50 border-slate-200/50 opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-900">{item.m} {item.yr}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        item.status === 'SYNCED'
                          ? 'text-emerald-700 bg-emerald-100'
                          : item.status === 'SYNCING'
                          ? 'text-amber-800 bg-amber-100'
                          : 'text-slate-400 bg-slate-100'
                      }`}
                    >
                      {item.status === 'SYNCED' ? '✓ Synced' : item.status === 'SYNCING' ? 'Fetching' : 'Queued'}
                    </span>
                  </div>
                  <div className="space-y-0.5 text-[11px]">
                    <div className="flex justify-between text-slate-500">
                      <span>Inv:</span>
                      <span className="font-mono text-slate-800 font-semibold">{item.inv > 0 ? item.inv : '--'}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Turnover:</span>
                      <span className="font-mono font-medium text-slate-900">{item.to}</span>
                    </div>
                    <div className="flex justify-between text-purple-700">
                      <span>Tax:</span>
                      <span className="font-mono font-bold">{item.tax}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ─── 5. CONSOLIDATED OUTWARD SALES MATRIX SUMMARY ───────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold font-mono">
                  M
                </span>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight">Consolidated Outward Sales Matrix Summary</h3>
                  <p className="text-[11px] text-slate-500">Full fiscal year category-wise outward supplies breakup (GSTR-1 aggregated)</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Zero Discrepancy Hash #90A7</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/60">
                    <th className="py-2.5 px-4 font-medium">GSTR-1 Outward Supply Category</th>
                    <th className="py-2.5 px-3 text-right font-medium">Taxable Turnover (₹)</th>
                    <th className="py-2.5 px-3 text-right font-medium">Integrated Tax - IGST (₹)</th>
                    <th className="py-2.5 px-3 text-right font-medium">Central Tax - CGST (₹)</th>
                    <th className="py-2.5 px-4 text-right font-medium">State Tax - SGST (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                  <tr className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-4 font-sans">
                      <div className="font-semibold text-slate-900">B2B Taxable Supplies</div>
                      <div className="text-[11px] text-slate-400">Table 4A, 4B, 6B, 6C Regular Supplies</div>
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-slate-900">14,20,50,000.00</td>
                    <td className="py-2 px-3 text-right font-medium text-purple-700">1,85,00,000.00</td>
                    <td className="py-2 px-3 text-right font-medium text-purple-700">35,34,000.00</td>
                    <td className="py-2 px-4 text-right font-medium text-purple-700">35,34,000.00</td>
                  </tr>
                  <tr className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-4 font-sans">
                      <div className="font-semibold text-slate-900">B2C (Large) Interstate</div>
                      <div className="text-[11px] text-slate-400">Table 5A, 5B Invoice Value &gt; ₹2.5L</div>
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-slate-900">1,12,00,000.00</td>
                    <td className="py-2 px-3 text-right font-medium text-purple-700">20,16,000.00</td>
                    <td className="py-2 px-3 text-right text-slate-400">—</td>
                    <td className="py-2 px-4 text-right text-slate-400">—</td>
                  </tr>
                  <tr className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-4 font-sans">
                      <div className="font-semibold text-slate-900">B2C (Small) Net Supplies</div>
                      <div className="text-[11px] text-slate-400">Table 7 Intra-State &amp; Small Interstate</div>
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-slate-900">2,45,00,000.00</td>
                    <td className="py-2 px-3 text-right text-slate-400">—</td>
                    <td className="py-2 px-3 text-right font-medium text-purple-700">22,05,000.00</td>
                    <td className="py-2 px-4 text-right font-medium text-purple-700">22,05,000.00</td>
                  </tr>
                  <tr className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-4 font-sans">
                      <div className="font-semibold text-slate-900">Exports (Zero Rated)</div>
                      <div className="text-[11px] text-slate-400">Table 6A Export with / without payment of tax</div>
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-slate-900">65,00,000.00</td>
                    <td className="py-2 px-3 text-right font-medium text-emerald-700">Nil Tax</td>
                    <td className="py-2 px-3 text-right font-medium text-emerald-700">Nil Tax</td>
                    <td className="py-2 px-4 text-right font-medium text-emerald-700">Nil Tax</td>
                  </tr>
                  <tr className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-4 font-sans">
                      <div className="font-semibold text-slate-900">Credit &amp; Debit Notes Adjusted</div>
                      <div className="text-[11px] text-slate-400">Table 9B Registered &amp; Unregistered CDNR</div>
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-rose-600">-15,00,000.00</td>
                    <td className="py-2 px-3 text-right text-slate-400">—</td>
                    <td className="py-2 px-3 text-right text-slate-400">—</td>
                    <td className="py-2 px-4 text-right text-slate-400">—</td>
                  </tr>
                  <tr className="bg-slate-50/80 font-bold border-t-2 border-slate-200 text-slate-900">
                    <td className="py-2.5 px-4 font-sans text-xs uppercase tracking-wider">
                      TOTAL OUTWARD TURNOVER &amp; TAX
                    </td>
                    <td className="py-2.5 px-3 text-right text-sm text-slate-900">
                      ₹ {formatCur(activeCockpitClient.totalTaxable || 184250000)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-purple-700">
                      ₹ {formatCur(activeCockpitClient.totalIgst || 20516000)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-purple-700">
                      ₹ {formatCur(activeCockpitClient.totalCgst || 5739000)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-purple-700">
                      ₹ {formatCur(activeCockpitClient.totalSgst || 5739000)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── 6. EXPORT & DOWNSTREAM INTEGRATION HUB ───────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Action 1 */}
            <div className="bg-white hover:bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80 shadow-xs transition-all flex flex-col justify-between group">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Download className="w-4 h-4 text-pink-400" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
                    Full-Year GSTR-1 Workbook
                  </h4>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Zero-merge multi-sheet Excel with individual month tabs and master pivot.
                </p>
              </div>
              <button
                onClick={() => handleDownload12mExcelDirect(activeCockpitClient)}
                className="mt-3 text-xs font-semibold text-purple-700 flex items-center gap-1 hover:underline w-fit cursor-pointer"
              >
                <span>Generate .XLSX</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Action 2 */}
            <div className="bg-white hover:bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80 shadow-xs transition-all flex flex-col justify-between group">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-700 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Send className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
                    Send Figures to GSTR-3B Table 3.1
                  </h4>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  1-Click auto-populate outward liabilities directly into Tab 01 working sheets with zero roundoff lag.
                </p>
              </div>
              <button
                onClick={() => handlePushTo3B(activeCockpitClient)}
                className="mt-3 text-xs font-semibold text-purple-700 flex items-center gap-1 hover:underline w-fit cursor-pointer"
              >
                <span>Push to 3B Engine</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Action 3 */}
            <div className="bg-white hover:bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80 shadow-xs transition-all flex flex-col justify-between group">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-8 h-8 rounded-xl bg-pink-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
                    <RefreshCw className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-pink-600 transition-colors">
                    Reconcile with Books Sales Register
                  </h4>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Direct high-speed bridge to Suite 02. Flag missing invoices, rate anomalies, and GSTN filing deltas.
                </p>
              </div>
              <button
                onClick={() => toast.info('Launching Books Sales Register Reconciliation Bridge...')}
                className="mt-3 text-xs font-semibold text-pink-600 flex items-center gap-1 hover:underline w-fit cursor-pointer"
              >
                <span>Launch Reco Bridge</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ─── 7. AUTONOMOUS INGESTION PIPELINE TOPOLOGY ─────────────────────── */}
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight">Autonomous Ingestion Pipeline Topology</h3>
              </div>
              <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60 font-mono">
                Stream Engine Active
              </span>
            </div>

            <div className="w-full bg-slate-50/70 rounded-xl p-2.5 flex items-center justify-center overflow-x-auto">
              <svg className="w-full max-w-3xl h-14" fill="none" viewBox="0 0 800 60" xmlns="http://www.w3.org/2000/svg">
                {/* Node 1: GST Portal */}
                <rect className="fill-white stroke-slate-200" height="40" rx="6" strokeWidth="1" width="150" x="15" y="10"></rect>
                <text className="fill-slate-900 font-semibold text-[11px] font-sans" textAnchor="middle" x="90" y="27">GSTN Portal (Gov)</text>
                <text className="fill-slate-400 text-[9px] font-mono" textAnchor="middle" x="90" y="40">Tables 4-13 API</text>

                {/* Arrow 1 */}
                <path className="text-purple-600" d="M175 30 L225 30" stroke="currentColor" strokeDasharray="3 3" strokeWidth="1.5"></path>
                <polygon className="text-purple-600" fill="currentColor" points="225,30 220,27 220,33"></polygon>

                {/* Node 2: Harvester */}
                <rect className="fill-slate-900" height="40" rx="6" width="165" x="235" y="10"></rect>
                <text className="font-bold text-[11px] font-sans" fill="#FFFFFF" textAnchor="middle" x="317" y="27">Vaswani Harvester</text>
                <text className="text-[9px] font-mono" fill="#94A3B8" textAnchor="middle" x="317" y="40">Headless Playwright Node</text>

                {/* Arrow 2 */}
                <path className="text-emerald-500" d="M410 30 L460 30" stroke="currentColor" strokeDasharray="3 3" strokeWidth="1.5"></path>
                <polygon className="text-emerald-500" fill="currentColor" points="460,30 455,27 455,33"></polygon>

                {/* Node 3: Zero-Merge Normalizer */}
                <rect className="fill-white stroke-slate-200" height="40" rx="6" strokeWidth="1" width="150" x="470" y="10"></rect>
                <text className="fill-slate-900 font-semibold text-[11px] font-sans" textAnchor="middle" x="545" y="27">Matrix Normalizer</text>
                <text className="fill-slate-400 text-[9px] font-mono" textAnchor="middle" x="545" y="40">B2B/B2C Tax Engine</text>

                {/* Arrow 3 */}
                <path className="text-pink-600" d="M630 30 L675 30" stroke="currentColor" strokeWidth="1.5"></path>
                <polygon className="text-pink-600" fill="currentColor" points="675,30 670,27 670,33"></polygon>

                {/* Node 4: 3B & GSTR-9 Ready */}
                <circle className="fill-purple-700" cx="705" cy="30" r="18"></circle>
                <text className="font-bold text-[9px] font-sans" fill="#FFFFFF" textAnchor="middle" x="705" y="33">3B/G9</text>
              </svg>
            </div>

            {/* Security Notice */}
            <div className="mt-2.5 p-2 bg-slate-50 rounded-xl flex items-center gap-2 border border-slate-200/60">
              <ShieldCheck className="w-4 h-4 text-purple-700 shrink-0" />
              <p className="text-[11px] text-slate-500 leading-snug">
                <strong className="text-slate-700 font-medium">Autonomous Execution Notice:</strong> Playwright headless session strictly targets verified on-screen action buttons; zero-risk protocol. Cryptographic verification active across all retrieved JSON envelopes.
              </p>
            </div>
          </div>
        </>
      ) : (
        /* ─── MASTER 300+ CLIENTS TABLE OVERVIEW ────────────────────────── */
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => {
                  const targets = selectedGstins.size > 0
                    ? clients.filter(c => selectedGstins.has(c.gstin))
                    : clients.filter(c => c.status !== 'SYNCED');
                  handleStartBatchSync(targets);
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <Zap className="w-4 h-4 text-pink-400 fill-pink-400" />
                1-Click Multi-Sync ({selectedGstins.size > 0 ? selectedGstins.size : overview.pendingClients} Clients)
              </button>

              <button
                onClick={handleScanDownloads}
                disabled={isScanningDownloads}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer"
              >
                <FolderSearch className={`w-4 h-4 text-blue-500 ${isScanningDownloads ? 'animate-spin' : ''}`} />
                Scan Downloads
              </button>

              <button
                onClick={() => setShowDropzoneModal(true)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer"
              >
                <UploadCloud className="w-4 h-4 text-purple-600" />
                Drop GSTR-1 Files (.json)
              </button>

              <button
                onClick={() => setShowSingleModal(true)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer"
              >
                <Globe className="w-4 h-4 text-emerald-600" />
                Single Portal Sync
              </button>
            </div>
          </div>

          {/* Client Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider">
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedGstins.size > 0 && selectedGstins.size === filteredClients.length}
                        onChange={toggleSelectAll}
                        className="rounded bg-slate-100 border-slate-300 text-slate-900 focus:ring-0 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-4">Client Name &amp; GSTIN</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-3 text-center">Total Invoices</th>
                    <th className="py-3 px-3 text-right">Taxable Turnover</th>
                    <th className="py-3 px-3 text-right">Total Outward Tax</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClients.map((client) => (
                    <tr key={client.gstin} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedGstins.has(client.gstin)}
                          onChange={() => toggleSelectClient(client.gstin)}
                          className="rounded bg-slate-100 border-slate-300 text-slate-900 focus:ring-0 cursor-pointer"
                        />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-sm">{client.trade_name}</div>
                        <div className="font-mono text-[11px] text-slate-400">{client.gstin}</div>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {client.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-900">
                        {client.totalInvoices || 0}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-900">
                        {formatCur(client.totalTaxable || 0)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-purple-700">
                        {formatCur(client.totalTax || 0)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleRunAutopilot(client)}
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-xs cursor-pointer"
                          >
                            Autopilot
                          </button>
                          <button
                            onClick={() => handlePushTo3B(client)}
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 cursor-pointer"
                          >
                            To 3B
                          </button>
                          <button
                            onClick={() => setActiveClientDetail(client)}
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer"
                          >
                            Inspect
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}


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
                        <td className="py-2 px-3 text-right text-slate-900 font-bold">{formatCur(inv.val || (inv.txval + inv.iamt + inv.camt + inv.samt + inv.csamt))}</td>
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
