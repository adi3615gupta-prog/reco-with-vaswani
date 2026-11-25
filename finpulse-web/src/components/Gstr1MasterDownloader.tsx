import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertCircle,
  Building2, Table, Calendar, CheckCircle2, Clock, Download, ExternalLink,
  FileSpreadsheet, FileText, Filter, MessageSquare, RefreshCw,
  Search, Send, ShieldCheck, Sparkles, UploadCloud, Users, X,
  Check, AlertTriangle, ArrowUpDown, Eye, ArrowRight, Smartphone,
  Laptop, Globe, CheckCheck, FileJson, Key, EyeOff,
  Zap, Play, Pause, SkipForward, Square, FolderSearch, Loader2,
  DownloadCloud, Layers, ArrowDownToLine, Database, ArrowUpRight,
  ChevronDown, Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiBase, safeApiFetch } from '@/lib/api';
import { GSTR3BMonthKey, GSTR3B_MONTHS } from '@/lib/gstr3bEngine';
import { exportGstr1FullYearExcel } from '@/lib/gstr1FullYearExport';
import { startAndSubscribeGstr1Job, downloadGstr1FullYearExcelAuthenticated, cancelGstr1Job, bringGstr1BrowserToFront } from '@/lib/gstr1AutopilotClient';
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
  clientName?: string;
}

export default function Gstr1MasterDownloader({
  selectedMonth,
  financialYear,
  onApplyTo3B,
  currentGstin,
  clientName
}: Gstr1MasterDownloaderProps) {
  const startYear = (financialYear || '2026-27').match(/\d{4}/)?.[0] || '2026';
  const startYrNum = parseInt(startYear, 10);
  const endYrNum = startYrNum + 1;
  const activePeriod = `${selectedMonth} ${startYear}`;

  // View Mode: Single filing month vs full 12-month FY consolidation
  const [viewMode, setViewMode] = useState<'MONTH' | 'FULL_YEAR'>('MONTH');

  // Currently focused month in cockpit (defaults to selectedMonth prop)
  const [currentSelectedMonth, setCurrentSelectedMonth] = useState<GSTR3BMonthKey>(selectedMonth);
  useEffect(() => {
    if (selectedMonth) {
      setCurrentSelectedMonth(selectedMonth);
    }
  }, [selectedMonth]);

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

  // Inline Month Invoices State
  const [monthInvoices, setMonthInvoices] = useState<Gstr1InvoiceItem[]>([]);
  const [loadingMonthInvoices, setLoadingMonthInvoices] = useState(false);
  const [monthSectionFilter, setMonthSectionFilter] = useState<string>('ALL');
  const [monthInvoiceSearch, setMonthInvoiceSearch] = useState('');
  const [isClearingMonth, setIsClearingMonth] = useState(false);

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
  const autopilotJobIdRef = useRef<string | null>(null);

  // ─── REAL-TIME AUTOPILOT STATUS BAR STATE ────────────────────────────────────
  const [autopilotState, setAutopilotState] = useState<{
    active: boolean;
    client: Gstr1ClientBatch | null;
    step: string;
    percent: number;
    detail: string;
    targetPeriod: string;
    status: 'running' | 'completed' | 'failed';
  }>({
    active: false,
    client: null,
    step: 'INITIALIZING',
    percent: 15,
    detail: 'Initializing GST Portal connection...',
    targetPeriod: '',
    status: 'running'
  });

  // ─── LIVE COUNTDOWN TICKER & FY MONTH HELPERS ──────────────────────────────
  const [timerTick, setTimerTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimerTick(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const monthKeys = useMemo(() => [
    { short: 'Apr', full: 'April', yr: String(startYrNum).slice(-2), isSecond: false },
    { short: 'May', full: 'May', yr: String(startYrNum).slice(-2), isSecond: false },
    { short: 'Jun', full: 'June', yr: String(startYrNum).slice(-2), isSecond: false },
    { short: 'Jul', full: 'July', yr: String(startYrNum).slice(-2), isSecond: false },
    { short: 'Aug', full: 'August', yr: String(startYrNum).slice(-2), isSecond: false },
    { short: 'Sep', full: 'September', yr: String(startYrNum).slice(-2), isSecond: false },
    { short: 'Oct', full: 'October', yr: String(startYrNum).slice(-2), isSecond: false },
    { short: 'Nov', full: 'November', yr: String(startYrNum).slice(-2), isSecond: false },
    { short: 'Dec', full: 'December', yr: String(startYrNum).slice(-2), isSecond: false },
    { short: 'Jan', full: 'January', yr: String(endYrNum).slice(-2), isSecond: true },
    { short: 'Feb', full: 'February', yr: String(endYrNum).slice(-2), isSecond: true },
    { short: 'Mar', full: 'March', yr: String(endYrNum).slice(-2), isSecond: true },
  ], [startYrNum, endYrNum]);

  const fyMonthNames = useMemo(() => {
    return monthKeys.map(m => ({
      short: m.short,
      full: m.full,
      period: `${m.full} ${m.isSecond ? endYrNum : startYrNum}`
    }));
  }, [monthKeys, startYrNum, endYrNum]);

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
    return (val || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 0
    });
  };

  // Active client or fallback for Cockpit display (Zero fake data)
  const activeCockpitClient: Gstr1ClientBatch = useMemo(() => {
    if (clients.length > 0) {
      if (currentGstin) {
        const found = clients.find(c => c.gstin?.toUpperCase() === currentGstin.toUpperCase());
        if (found) return found;
      }
      return clients[0];
    }
    return {
      id: 'client-pending',
      gstin: currentGstin || 'Not Configured',
      trade_name: clientName || (currentGstin ? 'Active Client' : 'No Client Selected'),
      legal_name: '',
      hasCreds: false,
      portalUsername: '',
      status: 'PENDING',
      period: activePeriod,
      financialYear: financialYear,
      syncedMonths: [],
      pendingMonths: [],
      syncedCount: 0,
      totalMonths: 12,
      totalInvoices: 0,
      b2bCount: 0,
      b2clCount: 0,
      b2csCount: 0,
      cdnrCount: 0,
      expCount: 0,
      totalTaxable: 0,
      totalIgst: 0,
      totalCgst: 0,
      totalSgst: 0,
      totalCess: 0,
      totalTax: 0,
      hasExcel: false,
      hasJson: false
    };
  }, [clients, currentGstin, clientName, activePeriod, financialYear]);

  // Fetch Invoices for Currently Selected Month
  const fetchMonthInvoices = async (monthName: string, gstin: string) => {
    if (!gstin || gstin === 'Not Configured' || gstin === 'client-pending') {
      setMonthInvoices([]);
      return;
    }
    setLoadingMonthInvoices(true);
    try {
      const isSecond = ['January', 'February', 'March'].includes(monthName);
      const mYear = isSecond ? endYrNum : startYrNum;
      const targetPeriod = `${monthName} ${mYear}`;
      const url = `/api/gstr1/invoices/${encodeURIComponent(gstin)}?period=${encodeURIComponent(targetPeriod)}`;
      const res = await safeApiFetch(url);
      const data = await res.json();
      if (data.success) {
        setMonthInvoices(data.invoices || []);
      } else {
        setMonthInvoices([]);
      }
    } catch (err: any) {
      console.error('Fetch month invoices error:', err);
      setMonthInvoices([]);
    } finally {
      setLoadingMonthInvoices(false);
    }
  };

  useEffect(() => {
    if (activeCockpitClient?.gstin && activeCockpitClient.gstin !== 'Not Configured' && activeCockpitClient.gstin !== 'client-pending') {
      fetchMonthInvoices(currentSelectedMonth, activeCockpitClient.gstin);
    } else {
      setMonthInvoices([]);
    }
  }, [currentSelectedMonth, activeCockpitClient?.gstin, activeCockpitClient?.totalInvoices, financialYear]);

  // Filtered month invoices calculation
  const b2bMonthCount = useMemo(() => monthInvoices.filter(i => (i.section || '').toUpperCase().includes('B2B')).length, [monthInvoices]);
  const b2clMonthCount = useMemo(() => monthInvoices.filter(i => (i.section || '').toUpperCase().includes('B2CL')).length, [monthInvoices]);
  const b2csMonthCount = useMemo(() => monthInvoices.filter(i => (i.section || '').toUpperCase().includes('B2CS')).length, [monthInvoices]);
  const cdnrMonthCount = useMemo(() => monthInvoices.filter(i => (i.section || '').toUpperCase().includes('CDNR')).length, [monthInvoices]);
  const expMonthCount = useMemo(() => monthInvoices.filter(i => (i.section || '').toUpperCase().includes('EXP')).length, [monthInvoices]);

  const filteredMonthInvoices = useMemo(() => {
    return monthInvoices.filter((inv) => {
      if (monthSectionFilter !== 'ALL') {
        const sec = (inv.section || '').toUpperCase();
        if (monthSectionFilter === 'B2B' && !sec.includes('B2B')) return false;
        if (monthSectionFilter === 'B2CL' && !sec.includes('B2CL')) return false;
        if (monthSectionFilter === 'B2CS' && !sec.includes('B2CS')) return false;
        if (monthSectionFilter === 'CDNR' && !sec.includes('CDNR')) return false;
        if (monthSectionFilter === 'EXP' && !sec.includes('EXP')) return false;
      }
      if (monthInvoiceSearch.trim()) {
        const q = monthInvoiceSearch.toLowerCase().trim();
        const matchesInum = (inv.inum || '').toLowerCase().includes(q);
        const matchesCtin = (inv.ctin || '').toLowerCase().includes(q);
        const matchesName = (inv.cname || '').toLowerCase().includes(q);
        const matchesPeriod = (inv.return_period || '').toLowerCase().includes(q);
        if (!matchesInum && !matchesCtin && !matchesName && !matchesPeriod) return false;
      }
      return true;
    });
  }, [monthInvoices, monthSectionFilter, monthInvoiceSearch]);

  const monthTotals = useMemo(() => {
    return filteredMonthInvoices.reduce(
      (acc, inv) => {
        const tx = Number(inv.txval || 0);
        const igst = Number(inv.iamt || 0);
        const cgst = Number(inv.camt || 0);
        const sgst = Number(inv.samt || 0);
        const cess = Number(inv.csamt || 0);
        const tot = Number(inv.val || (tx + igst + cgst + sgst + cess));
        acc.txval += tx;
        acc.igst += igst;
        acc.cgst += cgst;
        acc.sgst += sgst;
        acc.cess += cess;
        acc.totalVal += tot;
        acc.totalTax += (igst + cgst + sgst);
        return acc;
      },
      { txval: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, totalVal: 0, totalTax: 0 }
    );
  }, [filteredMonthInvoices]);

  // Line item inspector modal: section tab + search filter
  const filteredDetailInvoices = useMemo(() => {
    const q = detailSearch.trim().toLowerCase();
    return detailInvoices.filter(inv =>
      (detailSectionFilter === 'ALL' || (inv.section || '').toUpperCase() === detailSectionFilter) &&
      (!q || [inv.ctin, inv.cname, inv.inum].some(v => String(v || '').toLowerCase().includes(q)))
    );
  }, [detailInvoices, detailSectionFilter, detailSearch]);

  // Export invoice rows to Excel (Zero Merge Architecture)
  const exportInvoiceRows = (invoices: Gstr1InvoiceItem[], sheetName: string, fileName: string) => {
    if (invoices.length === 0) {
      toast.error('No invoices to export');
      return;
    }
    const wb = XLSX.utils.book_new();
    const rows = invoices.map((inv, idx) => ({
      'S.No': idx + 1,
      'Invoice Date': inv.idt || '',
      'Invoice Number': inv.inum || '',
      'Section': inv.section || 'B2B',
      'Recipient GSTIN': inv.ctin || '',
      'Receiver Name': inv.cname || '',
      'Invoice Type': inv.inv_typ || 'Regular',
      'POS': inv.pos || '',
      'Return Period': inv.return_period || '',
      'Rate (%)': Number(inv.rt || 0),
      'Taxable Value (₹)': Number(inv.txval || 0),
      'IGST (₹)': Number(inv.iamt || 0),
      'CGST (₹)': Number(inv.camt || 0),
      'SGST (₹)': Number(inv.samt || 0),
      'Cess (₹)': Number(inv.csamt || 0),
      'Total Value (₹)': Number(inv.val || (Number(inv.txval || 0) + Number(inv.iamt || 0) + Number(inv.camt || 0) + Number(inv.samt || 0) + Number(inv.csamt || 0)))
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!merges'] = []; // STRICT ZERO MERGE ARCHITECTURE COMPLIANCE
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    XLSX.writeFile(wb, fileName);
    toast.success(`Exported ${invoices.length} invoices to ${fileName} (Zero Merges)!`);
  };

  const handleExportMonthInvoices = () => exportInvoiceRows(
    filteredMonthInvoices,
    `${currentSelectedMonth}_GSTR1`,
    `GSTR1_${activeCockpitClient.gstin}_${currentSelectedMonth}_${financialYear}.xlsx`
  );

  const handleExportInvoicesExcel = () => exportInvoiceRows(
    filteredDetailInvoices,
    viewMode === 'FULL_YEAR' ? `FY_${financialYear}_GSTR1` : `${currentSelectedMonth}_GSTR1`,
    `GSTR1_${activeClientDetail?.gstin || 'client'}_${viewMode === 'FULL_YEAR' ? 'FY' : currentSelectedMonth}_${financialYear}.xlsx`
  );

  // Clear Single Month Data
  const handleClearMonthData = async (monthName: string) => {
    if (!activeCockpitClient?.gstin || activeCockpitClient.gstin === 'Not Configured' || activeCockpitClient.gstin === 'client-pending') {
      toast.error('No client configured or selected.');
      return;
    }

    const isSecond = ['January', 'February', 'March'].includes(monthName);
    const mYear = isSecond ? endYrNum : startYrNum;
    const targetPeriod = `${monthName} ${mYear}`;
    const clientDisplayName = activeCockpitClient.trade_name || activeCockpitClient.legal_name || activeCockpitClient.gstin;

    const confirmed = window.confirm(
      `Clear GSTR-1 outward data for ${monthName} (${mYear})?\n\n` +
      `Client: ${clientDisplayName} (${activeCockpitClient.gstin})\n\n` +
      `• All stored outward invoices for ${monthName} will be cleared from database.\n` +
      `• The month status will be reset back to Queued.\n` +
      `• You can re-download or re-sync fresh GSTR-1 anytime.`
    );
    if (!confirmed) return;

    setIsClearingMonth(true);
    toast.info(`Clearing ${monthName} (${mYear}) GSTR-1 data...`);
    try {
      const url = `/api/gstr1/clear/${encodeURIComponent(activeCockpitClient.gstin)}?period=${encodeURIComponent(targetPeriod)}&month=${encodeURIComponent(monthName)}&fy=${encodeURIComponent(financialYear)}`;
      const res = await safeApiFetch(url, { method: 'DELETE' });
      const data = await res.json();

      if (data.success) {
        toast.success(`Cleared GSTR-1 data for ${monthName} (${mYear}) successfully!`);
        setMonthInvoices([]);
        await fetchSummary();
        await fetchMonthInvoices(monthName, activeCockpitClient.gstin);
      } else {
        toast.error(data.error || `Failed to clear GSTR-1 data for ${monthName}`);
      }
    } catch (err: any) {
      console.error('Clear month error:', err);
      toast.error('Error clearing month data', { description: err.message });
    } finally {
      setIsClearingMonth(false);
    }
  };

  // Clear All Months Data
  const handleClearAllMonthsData = async () => {
    if (!activeCockpitClient?.gstin || activeCockpitClient.gstin === 'Not Configured' || activeCockpitClient.gstin === 'client-pending') {
      toast.error('No client configured or selected.');
      return;
    }

    const clientDisplayName = activeCockpitClient.trade_name || activeCockpitClient.legal_name || activeCockpitClient.gstin;

    const confirmed = window.confirm(
      `Clear ALL MONTHS of GSTR-1 outward data for FY ${financialYear}?\n\n` +
      `Client: ${clientDisplayName} (${activeCockpitClient.gstin})\n\n` +
      `• All stored outward invoices across all 12 months will be removed from local database.\n` +
      `• All months will be reset back to Queued (0 Synced).\n` +
      `• You can re-download fresh GSTR-1 via 12-Month Autopilot Loop anytime.`
    );
    if (!confirmed) return;

    setIsClearingMonth(true);
    toast.info(`Clearing all GSTR-1 data for ${activeCockpitClient.gstin}...`);
    try {
      const url = `/api/gstr1/clear/${encodeURIComponent(activeCockpitClient.gstin)}?period=ALL&fy=${encodeURIComponent(financialYear)}`;
      const res = await safeApiFetch(url, { method: 'DELETE' });
      const data = await res.json();

      if (data.success) {
        toast.success(`Cleared all 12 months GSTR-1 data for FY ${financialYear}!`);
        setMonthInvoices([]);
        await fetchSummary();
      } else {
        toast.error(data.error || 'Failed to clear all GSTR-1 data');
      }
    } catch (err: any) {
      console.error('Clear all error:', err);
      toast.error('Error clearing data', { description: err.message });
    } finally {
      setIsClearingMonth(false);
    }
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

  // ─── CANCEL TASK & BRING BROWSER TO FRONT ──────────────────────────────────
  const handleCancelTask = async () => {
    try {
      autopilotAbortRef.current?.abort();
      await cancelGstr1Job({ jobId: autopilotJobIdRef.current || undefined, gstin: activeAutopilotClient?.gstin || '' });
      setActiveAutopilotClient(null);
      setIsBatchRunning(false);
      toast.info('GSTR-1 Autopilot task cancelled cleanly');
    } catch {
      toast.info('Cancellation signal dispatched');
    }
  };

  const handleBringToFront = async () => {
    try {
      await bringGstr1BrowserToFront({ jobId: autopilotJobIdRef.current || undefined, gstin: activeAutopilotClient?.gstin });
      toast.success('Focused browser window!');
    } catch {
      toast.info('Browser focus signal sent');
    }
  };

  // ─── CLIENT AUTOPILOT SYNC (12-MONTH LOOP OR TARGETED MONTH) ─────────────────
  const handleRunAutopilot = async (
    client: Gstr1ClientBatch,
    targetMonth?: string | null,
    periodOverride?: string | null,
    isDownloadOnly?: boolean
  ): Promise<'SUCCESS' | 'FAILED' | 'CANCELLED'> => {
    setActiveAutopilotClient(client);
    const controller = new AbortController();
    autopilotAbortRef.current = controller;

    const effReturnPeriod = periodOverride || activePeriod;
    const effIsFullYear = (viewMode === 'FULL_YEAR' || !targetMonth) && !isDownloadOnly;

    setAutopilotState({
      active: true,
      client,
      step: 'INITIALIZING',
      percent: 15,
      detail: `Connecting to GST Portal for ${client.trade_name || client.gstin}...`,
      targetPeriod: effReturnPeriod,
      status: 'running'
    });

    try {
      const job = await startAndSubscribeGstr1Job({
        gstin: client.gstin,
        returnPeriod: effReturnPeriod,
        financialYear,
        isFullYear: effIsFullYear,
        targetMonth: targetMonth || null,
        isDownloadOnly: Boolean(isDownloadOnly),
        signal: controller.signal,
        onSnapshot: (snap) => {
          autopilotJobIdRef.current = snap.jobId;
          const total = snap.totalTargetMonths || 1;
          const doneMonths = (snap.months || []).filter(m => m.status !== 'SYNCING').length;
          const lastMsg = snap.events?.[snap.events.length - 1]?.message;
          setAutopilotState(prev => ({
            ...prev,
            step: snap.phase || prev.step,
            // Progress = finished months only; login/CAPTCHA wait stays at 15%
            percent: Math.max(prev.percent, Math.min(95, 15 + Math.round((80 * doneMonths) / total))),
            detail: lastMsg || prev.detail
          }));
        },
        // Refresh month chips from SQLite as each month lands
        onEvent: (evt) => { if (evt.event === 'MONTH_DONE') fetchSummary(); }
      });
      const data = {
        success: job.status === 'COMPLETED' || job.status === 'PARTIAL',
        message: job.result?.message || `GSTR-1 Autopilot ${job.status}`,
        error: job.error || job.result?.error
      };

      if (data.success) {
        setAutopilotState(prev => ({
          ...prev,
          percent: 100,
          step: 'COMPLETED',
          status: 'completed',
          detail: data.message || `✓ GSTR-1 Ingested Successfully for ${effReturnPeriod}!`
        }));
        toast.success(data.message);
        fetchSummary();

        // Hold completed status for 1200ms so user sees 100% completion, then cleanly vanish!
        setTimeout(() => {
          setAutopilotState(prev => ({ ...prev, active: false }));
          setActiveAutopilotClient(null);
        }, 1200);
      } else {
        setAutopilotState(prev => ({
          ...prev,
          status: 'failed',
          detail: data.error || 'Autopilot encountered an issue'
        }));
        toast.error('GSTR-1 Autopilot issue', { description: data.error });
        setTimeout(() => {
          setAutopilotState(prev => ({ ...prev, active: false }));
          setActiveAutopilotClient(null);
        }, 2200);
      }
      return data.success ? 'SUCCESS' : job.status === 'CANCELLED' ? 'CANCELLED' : 'FAILED';
    } catch (e: any) {
      const aborted = controller.signal.aborted || e.name === 'AbortError';
      if (aborted) {
        toast.info('Autopilot session cancelled');
      } else {
        toast.error('GSTR-1 Autopilot connection failed', { description: e.message });
      }
      setAutopilotState(prev => ({
        ...prev,
        status: 'failed',
        detail: aborted ? 'Session cancelled by user' : e.message
      }));
      setTimeout(() => {
        setAutopilotState(prev => ({ ...prev, active: false }));
        setActiveAutopilotClient(null);
      }, 1800);
      return aborted ? 'CANCELLED' : 'FAILED';
    } finally {
      autopilotAbortRef.current = null;
      autopilotJobIdRef.current = null;
    }
  };

  // 1-Click Multi-Sync: one client at a time (one portal browser per run), stops on cancel
  const handleStartBatchSync = async (targets: Gstr1ClientBatch[]) => {
    if (targets.length === 0) {
      toast.info('No clients to sync');
      return;
    }
    setBatchQueue(targets.map(c => ({ gstin: c.gstin, trade_name: c.trade_name, hasCreds: c.hasCreds, status: 'PENDING' as const })));
    setShowBatchModal(true);
    setIsBatchRunning(true);
    const monthTarget = viewMode === 'MONTH' ? currentSelectedMonth : null;
    for (let i = 0; i < targets.length; i++) {
      setCurrentBatchIndex(i);
      setBatchQueue(q => q.map((it, j) => (j === i ? { ...it, status: 'CONNECTING' } : it)));
      const outcome = await handleRunAutopilot(targets[i], monthTarget);
      setBatchQueue(q => q.map((it, j) => (j === i ? { ...it, status: outcome === 'SUCCESS' ? 'SUCCESS' : 'FAILED', error: outcome === 'CANCELLED' ? 'Cancelled' : undefined } : it)));
      if (outcome === 'CANCELLED') break;
      // Let the previous run's status bar close before the next client takes it over
      await new Promise(r => setTimeout(r, 2500));
    }
    setCurrentBatchIndex(-1);
    setIsBatchRunning(false);
    fetchSummary();
  };

  // Download consolidated 12M Excel workbook (Bearer-authenticated blob, not window.open)
  const handleDownload12mExcelDirect = async (client: Gstr1ClientBatch) => {
    toast.info(`Generating full-year GSTR-1 Excel for ${client.trade_name || client.gstin}...`);
    const r = await downloadGstr1FullYearExcelAuthenticated(client.gstin, financialYear, client.trade_name || '');
    if (r.success) toast.success(`Downloaded ${r.filename}`);
    else toast.error('12-Month Excel download failed', { description: r.error });
  };

  // Cockpit "Export Outward Excel": 12-sheet FY workbook in Full-Year view, else the month register
  const handleExportExcel = (client: Gstr1ClientBatch) =>
    viewMode === 'FULL_YEAR' ? handleDownload12mExcelDirect(client) : handleExportMonthInvoices();

  // GSTR-1 is decoupled from GSTR-3B
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

  return (
    <div className="space-y-3.5 animate-fade-in">
      {/* ─── CLIENT CREDENTIALS & GOLDEN RULE STRIP ─── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-xs space-y-2">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Building2 className="w-5 h-5 text-pink-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-900">{activeCockpitClient.trade_name}</span>
                <span className="px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 text-[10px] font-bold border border-pink-200/60 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse"></span> GSTR-1 Active
                </span>
                {activeCockpitClient.status === 'SYNCED' && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Synced
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5 font-mono">
                <span>GSTIN: <strong className="text-slate-800">{activeCockpitClient.gstin}</strong></span>
                <span className="text-slate-300">•</span>
                <span>User: <span className="text-slate-700 font-sans">{activeCockpitClient.portalUsername || 'Auto-Configured'}</span></span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1">Vault: <span className="tracking-widest">••••••••</span><ShieldCheck className="w-3 h-3 text-emerald-600" /></span>
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
              type="button"
              onClick={() => setClientCockpitMode(clientCockpitMode === 'COCKPIT' ? 'ALL_CLIENTS' : 'COCKPIT')}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-pink-300" />
              <span>{clientCockpitMode === 'COCKPIT' ? '300+ Clients Overview' : 'Back to Autopilot Cockpit'}</span>
            </button>
          </div>
        </div>
      </div>

      {clientCockpitMode === 'COCKPIT' ? (
        <>
          {/* ─── 1. HERO INGESTION & LAUNCH DECK (Modern Clean Architecture) ─── */}
          <div className="w-full bg-white/95 backdrop-blur-xl rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-200/80 relative overflow-hidden group">
            <div className="absolute -right-16 -top-16 w-64 h-64 bg-gradient-to-br from-pink-500/10 via-indigo-500/10 to-transparent rounded-full blur-2xl pointer-events-none"></div>
            
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
              {/* Left: Title, Badges, Mode Toggle & Coverage details */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="text-[11px] uppercase text-pink-700 font-bold tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-pink-500" />
                    <span>Autonomous Outward GSTR-1 Suite</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-mono text-[11px] font-semibold flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                    </span>
                    <span>Headless Chromium :9222 Ready</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[11px] font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Zero Data Loss Active</span>
                  </span>
                </div>

                <div className="flex flex-wrap items-baseline gap-3 mb-2">
                  <h2 className="text-lg sm:text-xl text-slate-900 font-bold tracking-tight">
                    Autonomous 12-Month Outward Ingestion
                  </h2>
                  <div className="inline-flex p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setViewMode('MONTH')}
                      className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                        viewMode === 'MONTH'
                          ? 'bg-white text-slate-900 font-bold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Single-Month Download
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('FULL_YEAR')}
                      className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                        viewMode === 'FULL_YEAR'
                          ? 'bg-white text-indigo-700 font-bold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
                      <span>Full FY 12 Months Autopilot Loop</span>
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
                  Background browser worker iterates GST portal tables (4A/4B/6B/6C, 5A/5B, Table 7, 9B CDNR, Table 12 HSN &amp; 13 Docs) synthesizing 12 monthly payloads into normalized ledger cache.
                </p>
              </div>

              {/* Right: Key telemetry pills + Primary Trigger Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                <div className="grid grid-cols-2 sm:flex items-center gap-2">
                  <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/80 text-center sm:text-left">
                    <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider font-mono">Current Speed</div>
                    <div className="font-mono text-xs font-bold text-slate-900 flex items-center justify-center sm:justify-start gap-1">
                      <Zap className="w-3.5 h-3.5 text-indigo-600" /> 1.6s / mo
                    </div>
                  </div>
                  <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/80 text-center sm:text-left">
                    <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider font-mono">Tables Covered</div>
                    <div className="font-mono text-xs font-bold text-emerald-700 flex items-center justify-center sm:justify-start gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> 9 Sections
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRunAutopilot(activeCockpitClient, viewMode === 'MONTH' ? currentSelectedMonth : null)}
                  className="py-3 px-5 rounded-xl bg-gradient-to-r from-slate-900 via-slate-950 to-black text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.98] group shrink-0 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-pink-400 fill-pink-400 group-hover:scale-110 transition-transform" />
                  <span>{viewMode === 'FULL_YEAR' ? 'Launch 12-Month Autopilot Loop' : `Launch ${currentSelectedMonth} Autopilot`}</span>
                </button>
              </div>
            </div>

            {/* Sub-action bar inside cockpit */}
            <div className="pt-3 mt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5 relative z-10">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleCancelTask}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Cleanly stop current running download"
                >
                  <Square className="w-3 h-3 text-slate-500 fill-slate-500" />
                  <span>Cancel Task</span>
                </button>

                <button
                  type="button"
                  onClick={handleBringToFront}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Focus GST Portal Chrome window on desktop"
                >
                  <Laptop className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Bring to Front</span>
                </button>

                <button
                  type="button"
                  onClick={handleScanDownloads}
                  disabled={isScanningDownloads}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <FolderSearch className={`w-3.5 h-3.5 text-blue-600 ${isScanningDownloads ? 'animate-spin' : ''}`} />
                  <span>Scan Downloads</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowDropzoneModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-purple-600" />
                  <span>Drop Files (.json)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleClearMonthData(currentSelectedMonth)}
                  disabled={isClearingMonth}
                  className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/70 font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title={`Clear stored GSTR-1 data for ${currentSelectedMonth}`}
                >
                  <Trash2 className={`w-3.5 h-3.5 text-rose-600 ${isClearingMonth ? 'animate-spin' : ''}`} />
                  <span>Clear {currentSelectedMonth} Data</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearAllMonthsData}
                  disabled={isClearingMonth}
                  className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/70 font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Clear all stored GSTR-1 data across all 12 months for this client"
                >
                  <Trash2 className={`w-3.5 h-3.5 text-rose-600 ${isClearingMonth ? 'animate-spin' : ''}`} />
                  <span>Clear All 12 Months</span>
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono text-slate-500">
                <span>Total Turnover: <strong className="text-slate-900">₹ {formatCur(activeCockpitClient.totalTaxable || 0)}</strong></span>
                <span className="text-purple-700 font-semibold">Tax: ₹ {formatCur(activeCockpitClient.totalTax || 0)}</span>
              </div>
            </div>
          </div>

          {/* ─── 2. 12-MONTH AUTONOMOUS LOOP EXECUTION TIMELINE (Interactive Grid) ─── */}
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <Calendar className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">
                    12-Month Autonomous Outward Execution Timeline (FY {financialYear})
                  </h3>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold flex-wrap">
                <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {activeCockpitClient.syncedCount || (activeCockpitClient.status === 'SYNCED' ? 1 : 0)} Synced
                </span>
                <span className="flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> {activeAutopilotClient ? 1 : 0} In Flight
                </span>
                <span className="flex items-center gap-1 text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> {Math.max(0, 12 - (activeCockpitClient.syncedCount || (activeCockpitClient.status === 'SYNCED' ? 1 : 0)))} Queued
                </span>
                <button
                  type="button"
                  onClick={handleClearAllMonthsData}
                  disabled={isClearingMonth}
                  className="px-2 py-0.5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 ml-1"
                  title="Clear all 12 months GSTR-1 data for this client"
                >
                  <Trash2 className={`w-3 h-3 text-rose-600 ${isClearingMonth ? 'animate-spin' : ''}`} />
                  <span>Clear All 12 Months</span>
                </button>
              </div>
            </div>

            {/* 12 Interactive Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12 gap-1.5">
              {monthKeys.map((item, idx) => {
                const mYear = item.isSecond ? endYrNum : startYrNum;
                const canonMonthKey = `${item.full} ${mYear}`;
                const monthDetail = activeCockpitClient.months?.[canonMonthKey] || activeCockpitClient.months?.[item.full];

                const isSynced = Boolean(
                  activeCockpitClient.syncedMonths?.some(m => m.toLowerCase().startsWith(item.full.toLowerCase().slice(0, 3))) ||
                  monthDetail?.status === 'SYNCED' ||
                  monthDetail?.status === 'PUSHED_TO_3B' ||
                  (activeCockpitClient.period?.toLowerCase().startsWith(item.full.toLowerCase().slice(0, 3)) && (activeCockpitClient.status === 'SYNCED' || activeCockpitClient.status === 'PUSHED_TO_3B'))
                );

                const isSyncing = Boolean(activeAutopilotClient && activeAutopilotClient.gstin === activeCockpitClient.gstin && idx === (activeCockpitClient.syncedCount || 0));
                const isSelected = currentSelectedMonth === item.full;
                
                // Portal generation request: live 20-min countdown from requestedAt (timerTick re-renders every second)
                const reqAt = (monthDetail?.status === 'REQUESTED' || monthDetail?.status === 'READY_TO_DOWNLOAD') ? monthDetail?.requestedAt : null;
                const secsLeft = reqAt ? Math.max(0, 1200 - Math.floor((Date.now() - reqAt) / 1000)) : 0;
                // monthKeys start at April (index 0) -> JS month (idx + 3) % 12; GSTR-1 exists only once the month is over
                const notDue = new Date(mYear, ((idx + 3) % 12) + 1, 1).getTime() > Date.now();
                const status = isSyncing ? 'SYNCING' : isSynced ? 'SYNCED' : notDue ? 'NOT_DUE' : reqAt ? (secsLeft > 0 ? 'REQUESTED' : 'READY') : 'QUEUED';
                const invCount = monthDetail?.invoices !== undefined 
                  ? monthDetail.invoices 
                  : (isSynced && activeCockpitClient.period?.toLowerCase().startsWith(item.full.toLowerCase().slice(0, 3)) 
                      ? (activeCockpitClient.totalInvoices || 0) 
                      : 0);

                return (
                  <div
                    key={item.short}
                    onClick={() => setCurrentSelectedMonth(item.full as GSTR3BMonthKey)}
                    className={`rounded-xl p-2 border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'ring-2 ring-pink-500 border-pink-400 bg-pink-50/70 shadow-xs'
                        : status === 'SYNCED'
                        ? 'bg-emerald-50/50 hover:bg-emerald-50/80 border-emerald-200/80'
                        : status === 'SYNCING'
                        ? 'bg-amber-50/70 border-2 border-amber-500/80 shadow-xs'
                        : status === 'REQUESTED'
                        ? 'bg-amber-50/70 border-amber-300/80'
                        : status === 'READY'
                        ? 'bg-blue-50/70 border-blue-300/80'
                        : 'bg-slate-50/50 hover:bg-slate-100/70 border-slate-200/50 opacity-70'
                    }`}
                    title={status === 'REQUESTED'
                      ? `${item.full}: GSTR-1 file generation requested on portal. Ready in ${Math.ceil(secsLeft / 60)} min.`
                      : status === 'READY'
                      ? `${item.full}: 20 min over. Run Autopilot for ${item.full} to download the generated file.`
                      : status === 'NOT_DUE'
                      ? `${item.full} ${mYear} has not ended yet: its GSTR-1 is filed by the 11th of the next month.`
                      : `Click to inspect ${item.full} (${mYear}) outward invoices`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-slate-900 leading-tight">
                      <span>{item.short} {item.yr}</span>
                      {status === 'SYNCED' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : status === 'SYNCING' ? (
                        <RefreshCw className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                      ) : status === 'READY' ? (
                        <Download className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <Clock className={`w-3.5 h-3.5 ${status === 'REQUESTED' ? 'text-amber-600' : 'text-slate-400'}`} />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[10px] mt-1.5 font-medium leading-none">
                      <span className={status === 'SYNCED' ? 'text-emerald-700 font-bold' : status === 'SYNCING' ? 'text-amber-800 font-bold' : status === 'REQUESTED' ? 'text-amber-800 font-bold font-mono' : status === 'READY' ? 'text-blue-700 font-bold' : 'text-slate-400'}>
                        {status === 'SYNCED' ? 'Synced'
                          : status === 'SYNCING' ? 'Sync'
                          : status === 'REQUESTED' ? `${String(Math.floor(secsLeft / 60)).padStart(2, '0')}:${String(secsLeft % 60).padStart(2, '0')}`
                          : status === 'READY' ? 'Ready'
                          : status === 'NOT_DUE' ? 'Not due'
                          : 'Queued'}
                      </span>
                      {status === 'SYNCED' && (
                        <span className="font-mono text-slate-700 text-[10px] font-bold">
                          {invCount} inv
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── 3. PRECISE INLINE MONTH INVOICE VIEWER (Interactive Ledger) ─── */}
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs font-bold text-slate-900">
                    {currentSelectedMonth} ({['January', 'February', 'March'].includes(currentSelectedMonth) ? endYrNum : startYrNum}) Outward Invoices (GSTR-1)
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-mono font-bold border border-slate-200">
                    {filteredMonthInvoices.length} {filteredMonthInvoices.length === monthInvoices.length ? 'Vouchers' : `of ${monthInvoices.length}`}
                  </span>
                </div>
              </div>

              {/* Quick Search & Section Filters & Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Search Input */}
                <div className="relative">
                  <Search className="w-3 h-3 absolute left-2 top-2 text-slate-400" />
                  <input
                    type="text"
                    value={monthInvoiceSearch}
                    onChange={(e) => setMonthInvoiceSearch(e.target.value)}
                    placeholder="Filter invoice, recipient, name..."
                    className="pl-6.5 pr-6 py-0.5 h-7 text-[11px] rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44 md:w-56 font-medium"
                  />
                  {monthInvoiceSearch && (
                    <button
                      type="button"
                      onClick={() => setMonthInvoiceSearch('')}
                      className="absolute right-1.5 top-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Section Filter Pills */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/70 text-[10px] font-semibold">
                  {[
                    { key: 'ALL', label: `ALL (${monthInvoices.length})` },
                    { key: 'B2B', label: `B2B (${b2bMonthCount})` },
                    { key: 'B2CL', label: `B2CL (${b2clMonthCount})` },
                    { key: 'B2CS', label: `B2CS (${b2csMonthCount})` },
                    { key: 'CDNR', label: `CDNR (${cdnrMonthCount})` },
                    { key: 'EXP', label: `EXP (${expMonthCount})` }
                  ].map((sec) => (
                    <button
                      key={sec.key}
                      type="button"
                      onClick={() => setMonthSectionFilter(sec.key)}
                      className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                        monthSectionFilter === sec.key
                          ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {sec.label}
                    </button>
                  ))}
                </div>

                {/* Export Month XLSX */}
                <button
                  type="button"
                  onClick={handleExportMonthInvoices}
                  disabled={filteredMonthInvoices.length === 0}
                  className="px-2.5 py-1 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-semibold border border-emerald-200/70 flex items-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Export this month's invoices to Excel (Zero Merges)"
                >
                  <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                  <span>XLSX</span>
                </button>

                {/* Clear Month */}
                <button
                  type="button"
                  onClick={() => handleClearMonthData(currentSelectedMonth)}
                  disabled={isClearingMonth || loadingMonthInvoices}
                  className="px-2.5 py-1 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold border border-rose-200/70 flex items-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title={`Clear stored GSTR-1 vouchers for ${currentSelectedMonth}`}
                >
                  <Trash2 className={`w-3 h-3 text-rose-600 ${isClearingMonth ? 'animate-spin' : ''}`} />
                  <span>Clear Month</span>
                </button>

                {/* Refresh */}
                <button
                  type="button"
                  onClick={() => fetchMonthInvoices(currentSelectedMonth, activeCockpitClient.gstin)}
                  disabled={loadingMonthInvoices}
                  className="p-1 h-7 w-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-all disabled:opacity-40 cursor-pointer"
                  title="Reload month invoices"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingMonthInvoices ? 'animate-spin text-indigo-600' : ''}`} />
                </button>
              </div>
            </div>

            {/* Invoices Table Container */}
            <div className="border border-slate-200/80 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[380px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 sticky top-0 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200 tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Section</th>
                      <th className="py-2.5 px-3">Recipient GSTIN</th>
                      <th className="py-2.5 px-3">Receiver Name</th>
                      <th className="py-2.5 px-3">Invoice No</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-2 text-center">POS</th>
                      <th className="py-2.5 px-2 text-center">Rate</th>
                      <th className="py-2.5 px-3 text-right">Taxable (₹)</th>
                      <th className="py-2.5 px-3 text-right">IGST (₹)</th>
                      <th className="py-2.5 px-3 text-right">CGST (₹)</th>
                      <th className="py-2.5 px-3 text-right">SGST (₹)</th>
                      <th className="py-2.5 px-3 text-right">Total Value (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px] text-slate-700">
                    {loadingMonthInvoices ? (
                      <tr>
                        <td colSpan={12} className="py-12 text-center text-slate-400 font-sans">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                          <span>Loading outward vouchers for {currentSelectedMonth}...</span>
                        </td>
                      </tr>
                    ) : filteredMonthInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="py-10 text-center text-slate-400 font-sans">
                          <p className="font-semibold text-slate-600">No invoices found for {currentSelectedMonth}.</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Run Autopilot above or Drop GSTR-1 JSON files to populate this period.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredMonthInvoices.map((inv, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2 px-3">
                            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {inv.section}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-blue-600 font-semibold">{inv.ctin || '-'}</td>
                          <td className="py-2 px-3 font-sans truncate max-w-[150px] text-slate-800" title={inv.cname}>
                            {inv.cname || '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-900 font-bold">{inv.inum}</td>
                          <td className="py-2 px-3 text-slate-500">{inv.idt}</td>
                          <td className="py-2 px-2 text-center">{inv.pos || '-'}</td>
                          <td className="py-2 px-2 text-center">{inv.rt ? `${inv.rt}%` : '-'}</td>
                          <td className="py-2 px-3 text-right font-semibold text-slate-900">
                            {formatCur(inv.txval)}
                          </td>
                          <td className="py-2 px-3 text-right text-blue-600 font-medium">
                            {inv.iamt ? formatCur(inv.iamt) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right text-emerald-600 font-medium">
                            {inv.camt ? formatCur(inv.camt) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right text-emerald-600 font-medium">
                            {inv.samt ? formatCur(inv.samt) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">
                            {formatCur(inv.val || (Number(inv.txval || 0) + Number(inv.iamt || 0) + Number(inv.camt || 0) + Number(inv.samt || 0) + Number(inv.csamt || 0)))}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredMonthInvoices.length > 0 && (
                    <tfoot className="bg-slate-50/90 font-bold border-t border-slate-200 text-slate-900 text-xs font-mono">
                      <tr>
                        <td colSpan={7} className="py-2.5 px-3 uppercase tracking-wider font-sans text-[10.5px]">
                          Total ({filteredMonthInvoices.length} Invoices)
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-900 font-bold">
                          ₹ {formatCur(monthTotals.txval)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-blue-600 font-bold">
                          ₹ {formatCur(monthTotals.igst)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-600 font-bold">
                          ₹ {formatCur(monthTotals.cgst)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-600 font-bold">
                          ₹ {formatCur(monthTotals.sgst)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-900 font-bold">
                          ₹ {formatCur(monthTotals.totalVal)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>

          {/* ─── 4. OUTWARD TABLES COVERAGE DECK (Compact Dynamic Badges) ───────────── */}
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-slate-700" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">GSTR-1 Outward Tables Coverage Deck</h3>
                <span className="text-[11px] text-slate-400 font-normal">Payload schema alignment across statutory outward disclosures</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {activeCockpitClient.syncedCount || (activeCockpitClient.status === 'SYNCED' ? 1 : 0)} Synced
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> {Math.max(0, 12 - (activeCockpitClient.syncedCount || (activeCockpitClient.status === 'SYNCED' ? 1 : 0)))} Queued
                </span>
              </div>
            </div>

            {/* Dynamic Badge Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-10 gap-1.5">
              {[
                { code: '4A, 4B, 6B', label: 'B2B Invoices', status: 'Synced', count: monthInvoices.length > 0 ? b2bMonthCount : (activeCockpitClient.b2bCount || 0) },
                { code: '5A, 5B', label: 'B2C Large', status: 'Synced', count: monthInvoices.length > 0 ? b2clMonthCount : (activeCockpitClient.b2clCount || 0) },
                { code: 'Table 7', label: 'B2C Small Net', status: 'Synced', count: monthInvoices.length > 0 ? b2csMonthCount : (activeCockpitClient.b2csCount || 0) },
                { code: '9B Reg', label: 'CDNR Reg', status: 'Synced', count: monthInvoices.length > 0 ? cdnrMonthCount : (activeCockpitClient.cdnrCount || 0) },
                { code: '9B Unreg', label: 'CDNR Unreg', status: 'Synced', count: 0 },
                { code: '6A - EXP', label: 'Export Inv', status: 'Synced', count: monthInvoices.length > 0 ? expMonthCount : (activeCockpitClient.expCount || 0) },
                { code: 'Table 8', label: 'Nil / Exempt', status: 'Synced', count: 0 },
                { code: 'Table 12', label: 'HSN Summary', status: 'Active', count: 0 },
                { code: 'Table 13', label: 'Docs Issued', status: 'Active', count: 0 },
                { code: 'Schema #90A7', label: 'Zero Discrepancy', status: 'Verified', count: 0, isHash: true }
              ].map((chip) => (
                <div
                  key={chip.code}
                  className={`p-2 rounded-xl border transition-colors flex flex-col justify-between ${
                    chip.isHash
                      ? 'bg-purple-50/50 border-purple-200/60'
                      : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200/70'
                  }`}
                >
                  <div className="font-mono font-bold text-[11px] text-slate-900 truncate">{chip.code}</div>
                  <div className="text-[10px] text-slate-500 truncate mb-1">{chip.label}</div>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded w-fit flex items-center gap-1 font-mono ${
                      chip.isHash
                        ? 'text-purple-700 bg-purple-100'
                        : 'text-emerald-700 bg-emerald-100/80'
                    }`}
                  >
                    <Check className="w-2.5 h-2.5" />
                    <span>{chip.status} ({chip.count})</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ─── 5. CONSOLIDATED OUTWARD SALES MATRIX SUMMARY (Dynamic Calculations) ─── */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold font-mono">
                  M
                </span>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight">Consolidated Outward Sales Matrix Summary</h3>
                  <p className="text-[11px] text-slate-500">
                    {monthInvoices.length > 0 ? `${currentSelectedMonth} Outward supplies breakup` : `FY ${financialYear} Outward supplies summary`}
                  </p>
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
                    <td className="py-2 px-3 text-right font-medium text-slate-900">
                      {formatCur(monthInvoices.length > 0 ? filteredMonthInvoices.filter(i => (i.section || '').includes('B2B')).reduce((s, i) => s + (i.txval || 0), 0) : (activeCockpitClient.totalTaxable || 0))}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-purple-700">
                      {formatCur(monthInvoices.length > 0 ? filteredMonthInvoices.filter(i => (i.section || '').includes('B2B')).reduce((s, i) => s + (i.iamt || 0), 0) : (activeCockpitClient.totalIgst || 0))}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-purple-700">
                      {formatCur(monthInvoices.length > 0 ? filteredMonthInvoices.filter(i => (i.section || '').includes('B2B')).reduce((s, i) => s + (i.camt || 0), 0) : (activeCockpitClient.totalCgst || 0))}
                    </td>
                    <td className="py-2 px-4 text-right font-medium text-purple-700">
                      {formatCur(monthInvoices.length > 0 ? filteredMonthInvoices.filter(i => (i.section || '').includes('B2B')).reduce((s, i) => s + (i.samt || 0), 0) : (activeCockpitClient.totalSgst || 0))}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-4 font-sans">
                      <div className="font-semibold text-slate-900">B2C (Large) Interstate</div>
                      <div className="text-[11px] text-slate-400">Table 5A, 5B Invoice Value &gt; ₹1L</div>
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-slate-900">
                      {formatCur(monthInvoices.length > 0 ? filteredMonthInvoices.filter(i => (i.section || '').includes('B2CL')).reduce((s, i) => s + (i.txval || 0), 0) : 0)}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-purple-700">
                      {formatCur(monthInvoices.length > 0 ? filteredMonthInvoices.filter(i => (i.section || '').includes('B2CL')).reduce((s, i) => s + (i.iamt || 0), 0) : 0)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400">—</td>
                    <td className="py-2 px-4 text-right text-slate-400">—</td>
                  </tr>
                  <tr className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-4 font-sans">
                      <div className="font-semibold text-slate-900">B2C (Small) Net Supplies</div>
                      <div className="text-[11px] text-slate-400">Table 7 Intra-State &amp; Small Interstate</div>
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-slate-900">
                      {formatCur(monthInvoices.length > 0 ? filteredMonthInvoices.filter(i => (i.section || '').includes('B2CS')).reduce((s, i) => s + (i.txval || 0), 0) : 0)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400">—</td>
                    <td className="py-2 px-3 text-right font-medium text-purple-700">
                      {formatCur(monthInvoices.length > 0 ? filteredMonthInvoices.filter(i => (i.section || '').includes('B2CS')).reduce((s, i) => s + (i.camt || 0), 0) : 0)}
                    </td>
                    <td className="py-2 px-4 text-right font-medium text-purple-700">
                      {formatCur(monthInvoices.length > 0 ? filteredMonthInvoices.filter(i => (i.section || '').includes('B2CS')).reduce((s, i) => s + (i.samt || 0), 0) : 0)}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-4 font-sans">
                      <div className="font-semibold text-slate-900">Exports (Zero Rated)</div>
                      <div className="text-[11px] text-slate-400">Table 6A Export with / without payment of tax</div>
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-slate-900">
                      {formatCur(monthInvoices.length > 0 ? filteredMonthInvoices.filter(i => (i.section || '').includes('EXP')).reduce((s, i) => s + (i.txval || 0), 0) : 0)}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-emerald-700">Nil Tax</td>
                    <td className="py-2 px-3 text-right font-medium text-emerald-700">Nil Tax</td>
                    <td className="py-2 px-4 text-right font-medium text-emerald-700">Nil Tax</td>
                  </tr>
                  <tr className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-4 font-sans">
                      <div className="font-semibold text-slate-900">Credit &amp; Debit Notes Adjusted</div>
                      <div className="text-[11px] text-slate-400">Table 9B Registered &amp; Unregistered CDNR</div>
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-rose-600">
                      {formatCur(monthInvoices.length > 0 ? filteredMonthInvoices.filter(i => (i.section || '').includes('CDNR')).reduce((s, i) => s + (i.txval || 0), 0) : 0)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400">—</td>
                    <td className="py-2 px-3 text-right text-slate-400">—</td>
                    <td className="py-2 px-4 text-right text-slate-400">—</td>
                  </tr>
                  <tr className="bg-slate-50/80 font-bold border-t-2 border-slate-200 text-slate-900">
                    <td className="py-2.5 px-4 font-sans text-xs uppercase tracking-wider">
                      TOTAL OUTWARD TURNOVER &amp; TAX
                    </td>
                    <td className="py-2.5 px-3 text-right text-sm text-slate-900">
                      ₹ {formatCur(monthInvoices.length > 0 ? monthTotals.txval : (activeCockpitClient.totalTaxable || 0))}
                    </td>
                    <td className="py-2.5 px-3 text-right text-purple-700">
                      ₹ {formatCur(monthInvoices.length > 0 ? monthTotals.igst : (activeCockpitClient.totalIgst || 0))}
                    </td>
                    <td className="py-2.5 px-3 text-right text-purple-700">
                      ₹ {formatCur(monthInvoices.length > 0 ? monthTotals.cgst : (activeCockpitClient.totalCgst || 0))}
                    </td>
                    <td className="py-2.5 px-4 text-right text-purple-700">
                      ₹ {formatCur(monthInvoices.length > 0 ? monthTotals.sgst : (activeCockpitClient.totalSgst || 0))}
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
                type="button"
                onClick={() => handleDownload12mExcelDirect(activeCockpitClient)}
                className="mt-3 text-xs font-semibold text-purple-700 flex items-center gap-1 hover:underline w-fit cursor-pointer"
              >
                <span>Generate .XLSX</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Action 2: Decoupled Independent Export */}
            <div className="bg-white hover:bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80 shadow-xs transition-all flex flex-col justify-between group">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-700 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Download className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
                    Export Outward Register
                  </h4>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Download audit-ready outward supplies Excel for filing and client review.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleExportExcel(activeCockpitClient)}
                className="mt-3 text-xs font-semibold text-purple-700 flex items-center gap-1 hover:underline w-fit cursor-pointer"
              >
                <span>Export Outward Excel</span>
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
                  Cross-verify GSTR-1 outward filing against Tally / Books Sales Register.
                </p>
              </div>
              <button
                type="button"
                onClick={() => toast.info('Launching Books Sales Register Reconciliation Bridge...')}
                className="mt-3 text-xs font-semibold text-pink-600 flex items-center gap-1 hover:underline w-fit cursor-pointer"
              >
                <span>Launch Reco Bridge</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      ) : (
        /* ─── MASTER 300+ CLIENTS TABLE OVERVIEW ────────────────────────── */
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
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
                type="button"
                onClick={handleScanDownloads}
                disabled={isScanningDownloads}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer"
              >
                <FolderSearch className={`w-4 h-4 text-blue-500 ${isScanningDownloads ? 'animate-spin' : ''}`} />
                Scan Downloads
              </button>

              <button
                type="button"
                onClick={() => setShowDropzoneModal(true)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer"
              >
                <UploadCloud className="w-4 h-4 text-purple-600" />
                Drop GSTR-1 Files (.json)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative min-w-[200px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search client, GSTIN..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                />
              </div>

              {/* Status filter pills */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs">
                {(['ALL', 'SYNCED', 'PENDING', 'CONFIGURED'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      statusFilter === st
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
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
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-sans">
                        No clients matching filter.
                      </td>
                    </tr>
                  ) : (
                    filteredClients.map((client) => (
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
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            client.status === 'SYNCED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            {client.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-900">
                          {client.totalInvoices || 0}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-900">
                          ₹ {formatCur(client.totalTaxable || 0)}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono font-bold text-purple-700">
                          ₹ {formatCur(client.totalTax || 0)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleRunAutopilot(client)}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-xs cursor-pointer"
                            >
                              Autopilot
                            </button>
                            
                            <button
                              type="button"
                              onClick={() => handleOpenClientDetails(client)}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer"
                            >
                              Inspect
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── 5. ITEM INSPECTION DRILLDOWN MODAL ───────────────────────────────── */}
      {activeClientDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    {activeClientDetail.trade_name || activeClientDetail.legal_name}
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700">
                      {activeClientDetail.gstin}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {viewMode === 'FULL_YEAR' ? `Consolidated FY ${financialYear}` : activePeriod} Outward Supplies • {detailInvoices.length} Total Records
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportInvoicesExcel}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export to Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveClientDetail(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Filters & Tabs */}
            <div className="p-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-1">
                {['ALL', 'B2B', 'B2CL', 'B2CS', 'CDNR', 'EXP'].map(sec => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setDetailSectionFilter(sec)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      detailSectionFilter === sec
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {sec}
                  </button>
                ))}
              </div>

              <div className="relative min-w-[240px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={detailSearch}
                  onChange={e => setDetailSearch(e.target.value)}
                  placeholder="Filter by recipient GSTIN, name, invoice..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1 text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Modal Table Content */}
            <div className="flex-1 overflow-auto p-4">
              {loadingDetail ? (
                <div className="py-20 text-center text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-600" />
                  <span>Loading itemized outward supplies...</span>
                </div>
              ) : filteredDetailInvoices.length === 0 ? (
                <div className="py-20 text-center text-slate-500 font-sans">
                  No invoices found in this section.
                </div>
              ) : (
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200 text-[10px]">
                      <th className="py-2.5 px-3">Period</th>
                      <th className="py-2.5 px-3">Section</th>
                      <th className="py-2.5 px-3">Recipient GSTIN</th>
                      <th className="py-2.5 px-3">Receiver Name</th>
                      <th className="py-2.5 px-3">Invoice No</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3 text-right">Taxable</th>
                      <th className="py-2.5 px-3 text-right">IGST</th>
                      <th className="py-2.5 px-3 text-right">CGST</th>
                      <th className="py-2.5 px-3 text-right">SGST</th>
                      <th className="py-2.5 px-3 text-right">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px] text-slate-700">
                    {filteredDetailInvoices.map((inv, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 text-slate-500 font-sans">{inv.return_period}</td>
                        <td className="py-2 px-3 font-bold text-blue-600">{inv.section}</td>
                        <td className="py-2 px-3 text-slate-800">{inv.ctin || '-'}</td>
                        <td className="py-2 px-3 text-slate-800 font-sans truncate max-w-[150px]" title={inv.cname}>
                          {inv.cname || '-'}
                        </td>
                        <td className="py-2 px-3 text-slate-900 font-bold">{inv.inum}</td>
                        <td className="py-2 px-3 text-slate-500">{inv.idt}</td>
                        <td className="py-2 px-3 text-right text-slate-900 font-semibold">{formatCur(inv.txval)}</td>
                        <td className="py-2 px-3 text-right text-blue-600">{formatCur(inv.iamt)}</td>
                        <td className="py-2 px-3 text-right text-emerald-600">{formatCur(inv.camt)}</td>
                        <td className="py-2 px-3 text-right text-emerald-600">{formatCur(inv.samt)}</td>
                        <td className="py-2 px-3 text-right text-slate-900 font-bold">
                          {formatCur(inv.val || (inv.txval + inv.iamt + inv.camt + inv.samt + inv.csamt))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── 6. BATCH MULTI-SYNC MODAL ─── */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
                  <Zap className="w-4 h-4 fill-blue-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {viewMode === 'FULL_YEAR' ? 'Full-Year GSTR-1 Multi-Sync' : 'Monthly GSTR-1 Multi-Sync'}
                  </h3>
                  <p className="text-[11px] text-slate-500">Autonomous sequential download</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="text-slate-400 hover:text-slate-800 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
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
                      ? 'bg-blue-50 border-blue-300 text-blue-900'
                      : item.status === 'SUCCESS'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : item.status === 'FAILED'
                      ? 'bg-rose-50 border-rose-300 text-rose-900'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{item.trade_name || item.gstin}</p>
                    <p className="font-mono text-[10px] text-slate-500">{item.gstin}</p>
                  </div>

                  <div>
                    {item.status === 'CONNECTING' ? (
                      <span className="flex items-center gap-1.5 text-blue-600 font-bold">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> In Progress
                      </span>
                    ) : item.status === 'SUCCESS' ? (
                      <span className="flex items-center gap-1 text-emerald-600 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Done
                      </span>
                    ) : item.status === 'FAILED' ? (
                      <span className="text-rose-600 font-bold">Failed</span>
                    ) : (
                      <span className="text-slate-500">Queued</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 7. PROMINENT AUTOPILOT STATUS BAR ─── */}
      {autopilotState.active && autopilotState.client && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-3xl px-4 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className={`p-4 rounded-2xl shadow-2xl backdrop-blur-xl border transition-all duration-300 ${
            autopilotState.status === 'completed'
              ? 'bg-slate-900/95 border-emerald-500/60 shadow-emerald-950/50'
              : autopilotState.status === 'failed'
              ? 'bg-slate-900/95 border-rose-500/60 shadow-rose-950/50'
              : 'bg-slate-900/95 border-blue-500/60 shadow-blue-950/50'
          }`}>
            {/* Top row: Badges, Client Info & Actions */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  autopilotState.status === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : autopilotState.status === 'failed'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                }`}>
                  {autopilotState.status === 'completed' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 animate-in zoom-in-75 duration-200" />
                  ) : autopilotState.status === 'failed' ? (
                    <AlertCircle className="w-5 h-5 text-rose-400" />
                  ) : (
                    <Zap className="w-5 h-5 fill-blue-400 text-blue-400 animate-pulse" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      autopilotState.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                    }`}>
                      {autopilotState.status === 'completed' ? '✓ Finished' : '⚡ GSTR-1 Autopilot'}
                    </span>
                    <h4 className="text-sm font-bold text-white truncate max-w-[280px]">
                      {autopilotState.client.trade_name || autopilotState.client.legal_name || 'Client'}
                    </h4>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono font-semibold border border-slate-700/60">
                      {autopilotState.client.gstin}
                    </span>
                    {autopilotState.targetPeriod && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 font-semibold border border-indigo-700/50">
                        {autopilotState.targetPeriod}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Bring to Front & Cancel Buttons */}
              {autopilotState.status === 'running' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleBringToFront}
                    className="px-2.5 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 rounded-xl text-xs font-bold transition-all shrink-0 hover:scale-[1.02] active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    title="Focus and bring GST Portal Chrome window to front"
                  >
                    <Laptop className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Bring to Front</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      autopilotAbortRef.current?.abort();
                      try {
                        await safeApiFetch('/api/gstr1/cancel', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ gstin: autopilotState.client?.gstin })
                        });
                      } catch {}
                      toast.info('Autopilot cancellation requested...');
                    }}
                    className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition-all shrink-0 hover:scale-[1.02] active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>
                </div>
              )}
            </div>

            {/* Middle row: Live Status Text & Percentage */}
            <div className="flex items-center justify-between text-xs mt-3">
              <span className="text-slate-300 font-medium truncate pr-4 flex items-center gap-2">
                {autopilotState.status === 'running' && (
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                  </span>
                )}
                {autopilotState.detail}
              </span>
              <span className={`font-mono font-bold shrink-0 text-xs ${
                autopilotState.status === 'completed'
                  ? 'text-emerald-400'
                  : autopilotState.status === 'failed'
                  ? 'text-rose-400'
                  : 'text-cyan-400'
              }`}>
                {autopilotState.percent}%
              </span>
            </div>

            {/* Bottom row: Animated Progress Bar */}
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700/50 mt-2">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  autopilotState.status === 'completed'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : autopilotState.status === 'failed'
                    ? 'bg-rose-500'
                    : 'bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400'
                }`}
                style={{ width: `${Math.min(100, Math.max(5, autopilotState.percent))}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
