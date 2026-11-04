import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CalendarClock, Calculator, Table, Sparkles, CloudDownload, ArrowUpRight,
  CheckCircle2, AlertTriangle, Clock, Search, Filter, Download, RefreshCw,
  FileSpreadsheet, Edit3, Plus, ChevronRight, Copy, Check, ExternalLink,
  ShieldCheck, Building2, Users, Layers, Calendar, ArrowRight, ArrowLeft, X, AlertCircle,
  FileText, ShieldAlert, CheckCheck, Landmark, Globe, CheckSquare, Square
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { removeAllMergesFromWorkbook } from '@/lib/gstr2bFullYearExport';
import { safeApiFetch } from '@/lib/api';
import { GSTR3BMonthKey, GSTR3B_MONTHS } from '@/lib/gstr3bEngine';

export interface ReturnTrackingMetrics {
  status: 'FILED_ON_TIME' | 'FILED_LATE' | 'PENDING' | 'OVERDUE' | 'DUE_SOON' | 'NIL_FILED' | 'READY_TO_FILE' | 'AVAILABLE' | 'NIL_AVAILABLE';
  arn: string | null;
  filingDate: string | null;
  dueDate: string;
  daysOverdue: number;
  lateFee: number;
  taxableAmount?: number;
  taxAmount?: number;
  invoiceCount?: number;
  interest?: number;
  taxLiability?: number;
  itcClaimed?: number;
  cashPaid?: number;
  eligibleItc?: number;
}

export interface ComplianceRecord {
  id: string;
  clientGstin: string;
  clientName: string;
  financialYear: string;
  month: GSTR3BMonthKey;
  periodCode: string;
  frequency: 'Monthly' | 'QRMP';
  gstr1: ReturnTrackingMetrics;
  gstr2b: {
    status: string;
    invoiceCount: number;
    eligibleItc: number;
  };
  gstr3b: ReturnTrackingMetrics;
  officeStage: 'NOT_STARTED' | 'DATA_RECEIVED' | 'RECONCILED' | 'CHALLAN_GENERATED' | 'FILED';
  remarks: string;
  hasWorkingPaper: boolean;
  hasCredentials: boolean;
  updatedAt: number;
}

const AVAILABLE_FINANCIAL_YEARS = [
  '2026-27',
  '2025-26',
  '2024-25',
  '2023-24',
  '2022-23',
  '2021-22',
  '2020-21',
  '2019-20',
  '2018-19',
  '2017-18'
];

interface ReturnsTrackingMasterProps {
  currentGstin?: string;
  financialYear?: string;
  onJumpToWorking?: (
    clientGstin: string,
    clientName: string,
    month: GSTR3BMonthKey,
    targetTab: 'working3b' | 'gstr2b_downloader' | 'gstr1_downloader'
  ) => void;
}

export default function ReturnsTrackingMaster({
  currentGstin = '',
  financialYear = '2025-26',
  onJumpToWorking
}: ReturnsTrackingMasterProps) {
  // Step state: Step 1 (Client Directory Gateway) or Step 2 (Compliance Dashboard)
  const [trackingStep, setTrackingStep] = useState<'client_selection' | 'dashboard'>('client_selection');

  // Step 1: Directory Search & Filters
  const [directorySearch, setDirectorySearch] = useState<string>('');
  const [directoryFilter, setDirectoryFilter] = useState<'ALL' | 'SELECTED' | 'PENDING' | 'MONTHLY' | 'QRMP'>('ALL');

  // Navigation & View State (Step 2 Dashboard)
  const [viewMode, setViewMode] = useState<'cockpit' | 'timeline'>('cockpit');
  const [selectedFy, setSelectedFy] = useState<string>(financialYear || '2025-26');
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'ALL' | 'PENDING' | 'OVERDUE' | 'FILED'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedClientGstin, setSelectedClientGstin] = useState<string>(currentGstin);

  // Client Selection Scope: 'ALL' or specific GSTIN or 'CUSTOM_SELECTION' (Option A: Clean Slate)
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>('ALL');
  const [checkedGstins, setCheckedGstins] = useState<Set<string>>(new Set());

  // Data State
  const [records, setRecords] = useState<ComplianceRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncingPortal, setIsSyncingPortal] = useState<boolean>(false);
  const [copiedGstin, setCopiedGstin] = useState<string | null>(null);

  // Edit / Manual Override Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingRecord, setEditingRecord] = useState<Partial<ComplianceRecord> | null>(null);
  const [formReturnType, setFormReturnType] = useState<'GSTR-1' | 'GSTR-3B'>('GSTR-3B');
  const [formArn, setFormArn] = useState<string>('');
  const [formFilingDate, setFormFilingDate] = useState<string>('');
  const [formStatus, setFormStatus] = useState<string>('FILED_ON_TIME');
  const [formCashPaid, setFormCashPaid] = useState<number>(0);
  const [formOfficeStage, setFormOfficeStage] = useState<string>('NOT_STARTED');
  const [formRemarks, setFormRemarks] = useState<string>('');

  // Sync FY prop changes
  useEffect(() => {
    if (financialYear) setSelectedFy(financialYear);
  }, [financialYear]);

  // Sync currentGstin prop changes
  useEffect(() => {
    if (currentGstin && currentGstin.trim() !== '' && currentGstin !== 'Not Specified') {
      const clean = currentGstin.trim().toUpperCase();
      setSelectedClientGstin(clean);
      if (trackingStep === 'dashboard') {
        setSelectedClientFilter(clean);
      }
    }
  }, [currentGstin, trackingStep]);

  // Fetch Tracking Data from Backend
  const fetchTrackingData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await safeApiFetch(`/api/returns/tracking-data?fy=${encodeURIComponent(selectedFy)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.records)) {
          setRecords(data.records);
        }
      }
    } catch (err: any) {
      console.warn('[Returns Tracking] Error fetching data:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedFy]);

  useEffect(() => {
    fetchTrackingData();
  }, [fetchTrackingData]);

  // Copy GSTIN helper
  const handleCopyGstin = (gstin: string) => {
    navigator.clipboard.writeText(gstin);
    setCopiedGstin(gstin);
    toast.success(`Copied GSTIN: ${gstin}`);
    setTimeout(() => setCopiedGstin(null), 2000);
  };

  // Distinct clients list enriched with annual return compliance metrics
  const uniqueClients = useMemo(() => {
    const map = new Map<string, {
      gstin: string;
      name: string;
      frequency: 'Monthly' | 'QRMP';
      filedCount: number;
      pendingCount: number;
      overdueCount: number;
      totalDue: number;
      totalCashPaid: number;
    }>();

    records.forEach(r => {
      const g = r.clientGstin.toUpperCase();
      if (!map.has(g)) {
        map.set(g, {
          gstin: r.clientGstin,
          name: r.clientName,
          frequency: r.frequency,
          filedCount: 0,
          pendingCount: 0,
          overdueCount: 0,
          totalDue: 0,
          totalCashPaid: 0
        });
      }
      const entry = map.get(g)!;
      // GSTR-1
      entry.totalDue++;
      if (r.gstr1.status === 'FILED_ON_TIME' || r.gstr1.status === 'FILED_LATE') {
        entry.filedCount++;
      } else if (r.gstr1.status === 'OVERDUE') {
        entry.overdueCount++;
      } else {
        entry.pendingCount++;
      }
      // GSTR-3B
      entry.totalDue++;
      if (r.gstr3b.status === 'FILED_ON_TIME' || r.gstr3b.status === 'FILED_LATE') {
        entry.filedCount++;
      } else if (r.gstr3b.status === 'OVERDUE') {
        entry.overdueCount++;
      } else {
        entry.pendingCount++;
      }
      entry.totalCashPaid += (r.gstr3b.cashPaid || 0);
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  // Filtered clients for Step 1 Directory Gateway
  const filteredDirectoryClients = useMemo(() => {
    return uniqueClients.filter(c => {
      // Search filter
      if (directorySearch.trim()) {
        const q = directorySearch.toLowerCase().trim();
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesGstin = c.gstin.toLowerCase().includes(q);
        if (!matchesName && !matchesGstin) return false;
      }
      // Category tab filter
      if (directoryFilter === 'SELECTED') {
        return checkedGstins.has(c.gstin.toUpperCase());
      }
      if (directoryFilter === 'PENDING') {
        return c.pendingCount > 0 || c.overdueCount > 0;
      }
      if (directoryFilter === 'MONTHLY') {
        return c.frequency === 'Monthly';
      }
      if (directoryFilter === 'QRMP') {
        return c.frequency === 'QRMP';
      }
      return true;
    });
  }, [uniqueClients, directorySearch, directoryFilter, checkedGstins]);

  // Records filtered by selected client scope (or multi-checked clients)
  const scopeFilteredRecords = useMemo(() => {
    if (selectedClientFilter === 'CUSTOM_SELECTION') {
      if (checkedGstins.size === 0) return records;
      return records.filter(r => checkedGstins.has(r.clientGstin.toUpperCase()));
    }
    if (selectedClientFilter && selectedClientFilter !== 'ALL') {
      const targetUpper = selectedClientFilter.toUpperCase();
      return records.filter(r => r.clientGstin.toUpperCase() === targetUpper);
    }
    return records;
  }, [records, selectedClientFilter, checkedGstins]);

  // Filtered records for Mode A (Cockpit)
  const filteredCockpitRecords = useMemo(() => {
    return scopeFilteredRecords.filter(r => {
      // Period filter
      if (selectedPeriodFilter !== 'ALL' && r.month !== selectedPeriodFilter) {
        return false;
      }
      // Status filter
      if (selectedStatusFilter === 'PENDING') {
        const isG1Pending = r.gstr1.status === 'PENDING' || r.gstr1.status === 'DUE_SOON';
        const isG3Pending = r.gstr3b.status === 'PENDING' || r.gstr3b.status === 'DUE_SOON' || r.gstr3b.status === 'READY_TO_FILE';
        if (!isG1Pending && !isG3Pending) return false;
      } else if (selectedStatusFilter === 'OVERDUE') {
        const isG1Overdue = r.gstr1.status === 'OVERDUE';
        const isG3Overdue = r.gstr3b.status === 'OVERDUE';
        if (!isG1Overdue && !isG3Overdue) return false;
      } else if (selectedStatusFilter === 'FILED') {
        const isG1Filed = r.gstr1.status === 'FILED_ON_TIME' || r.gstr1.status === 'FILED_LATE';
        const isG3Filed = r.gstr3b.status === 'FILED_ON_TIME' || r.gstr3b.status === 'FILED_LATE';
        if (!isG1Filed || !isG3Filed) return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = r.clientName.toLowerCase().includes(q);
        const matchesGstin = r.clientGstin.toLowerCase().includes(q);
        if (!matchesName && !matchesGstin) return false;
      }
      return true;
    });
  }, [scopeFilteredRecords, selectedPeriodFilter, selectedStatusFilter, searchQuery]);

  // Filtered records for Mode B (Single-Client 12M Timeline)
  const clientTimelineRecords = useMemo(() => {
    const activeGstinUpper = (selectedClientGstin || currentGstin || uniqueClients[0]?.gstin || '').toUpperCase();
    return records
      .filter(r => r.clientGstin.toUpperCase() === activeGstinUpper)
      .sort((a, b) => {
        const idxA = GSTR3B_MONTHS.indexOf(a.month);
        const idxB = GSTR3B_MONTHS.indexOf(b.month);
        return idxA - idxB;
      });
  }, [records, selectedClientGstin, currentGstin, uniqueClients]);

  // Active client summary for timeline banner
  const activeTimelineClient = useMemo(() => {
    const activeGstinUpper = (selectedClientGstin || currentGstin || uniqueClients[0]?.gstin || '').toUpperCase();
    const found = uniqueClients.find(c => c.gstin.toUpperCase() === activeGstinUpper);
    if (!found) return null;

    const clientRows = records.filter(r => r.clientGstin.toUpperCase() === activeGstinUpper);
    const totalOutwardTax = clientRows.reduce((sum, r) => sum + (r.gstr3b.taxLiability || 0), 0);
    const totalItcClaimed = clientRows.reduce((sum, r) => sum + (r.gstr3b.itcClaimed || 0), 0);
    const totalCashPaid = clientRows.reduce((sum, r) => sum + (r.gstr3b.cashPaid || 0), 0);
    const totalLateFees = clientRows.reduce((sum, r) => sum + (r.gstr1.lateFee || 0) + (r.gstr3b.lateFee || 0), 0);

    return {
      gstin: found.gstin,
      name: found.name,
      totalOutwardTax,
      totalItcClaimed,
      totalCashPaid,
      totalLateFees,
      hasCredentials: clientRows.some(r => r.hasCredentials)
    };
  }, [uniqueClients, selectedClientGstin, currentGstin, records]);

  // 4 Top KPI Metrics Calculations (Respecting active client scope)
  const kpiMetrics = useMemo(() => {
    const targetSet = selectedPeriodFilter === 'ALL'
      ? scopeFilteredRecords
      : scopeFilteredRecords.filter(r => r.month === selectedPeriodFilter);

    const totalDue = targetSet.length * 2; // GSTR-1 and GSTR-3B per client

    let filedCount = 0;
    let overdueCount = 0;
    let pendingCount = 0;
    let totalLateFees = 0;
    let totalInterest = 0;

    targetSet.forEach(r => {
      // GSTR-1
      if (r.gstr1.status === 'FILED_ON_TIME' || r.gstr1.status === 'FILED_LATE') filedCount++;
      else if (r.gstr1.status === 'OVERDUE') overdueCount++;
      else pendingCount++;

      // GSTR-3B
      if (r.gstr3b.status === 'FILED_ON_TIME' || r.gstr3b.status === 'FILED_LATE') filedCount++;
      else if (r.gstr3b.status === 'OVERDUE') overdueCount++;
      else pendingCount++;

      totalLateFees += (r.gstr1.lateFee || 0) + (r.gstr3b.lateFee || 0);
      totalInterest += (r.gstr3b.interest || 0);
    });

    const complianceRate = totalDue > 0 ? Math.round((filedCount / totalDue) * 100) : 100;

    return {
      totalDue,
      filedCount,
      complianceRate,
      overdueCount,
      pendingCount,
      totalLateFees,
      totalInterest
    };
  }, [scopeFilteredRecords, selectedPeriodFilter]);

  // Contextual Scope Label for KPI Card 1 Subtitle
  const kpiScopeLabel = useMemo(() => {
    const periodLabel = selectedPeriodFilter === 'ALL' ? selectedFy : `${selectedPeriodFilter} ${selectedFy}`;
    if (selectedClientFilter === 'CUSTOM_SELECTION' && checkedGstins.size > 0) {
      return `${checkedGstins.size} Selected Clients • ${periodLabel}`;
    }
    if (selectedClientFilter && selectedClientFilter !== 'ALL') {
      const c = uniqueClients.find(x => x.gstin.toUpperCase() === selectedClientFilter.toUpperCase());
      return `${c ? c.name : selectedClientFilter} • ${periodLabel}`;
    }
    return `All ${uniqueClients.length || records.length / 12} Clients • ${periodLabel}`;
  }, [selectedClientFilter, checkedGstins, uniqueClients, records.length, selectedPeriodFilter, selectedFy]);

  // Next Statutory Deadline calculation
  const nextStatutoryDeadline = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Standard schedule check for current/upcoming month
    // Rule 59: GSTR-1 on 11th; Rule 61: GSTR-3B on 20th
    const currentMonthIdx = today.getMonth(); // 0 to 11
    const currentYear = today.getFullYear();
    const currentDay = today.getDate();

    let title = 'GSTR-3B';
    let targetDate = new Date(currentYear, currentMonthIdx, 20);

    if (currentDay <= 11) {
      title = 'GSTR-1 Outward Return';
      targetDate = new Date(currentYear, currentMonthIdx, 11);
    } else if (currentDay <= 20) {
      title = 'GSTR-3B Summary Return';
      targetDate = new Date(currentYear, currentMonthIdx, 20);
    } else {
      // Next month 11th
      title = 'GSTR-1 Outward Return';
      targetDate = new Date(currentYear, currentMonthIdx + 1, 11);
    }

    const diffDays = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const formattedDate = targetDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    return {
      title,
      dueDateStr: formattedDate,
      diffDays,
      isPassed: diffDays < 0
    };
  }, []);

  // Quick Launch Chrome & Auto-fill Login
  const handleQuickPortalLogin = async (overrideGstin?: string) => {
    let targetGstin = overrideGstin;
    if (!targetGstin) {
      if (selectedClientFilter && selectedClientFilter !== 'ALL' && selectedClientFilter !== 'CUSTOM_SELECTION') {
        targetGstin = selectedClientFilter;
      } else if (checkedGstins.size > 0) {
        targetGstin = Array.from(checkedGstins)[0];
      } else if (selectedClientGstin) {
        targetGstin = selectedClientGstin;
      } else if (currentGstin) {
        targetGstin = currentGstin;
      } else {
        targetGstin = uniqueClients[0]?.gstin;
      }
    }
    if (!targetGstin) {
      toast.error('Please select a client with a valid GSTIN first.');
      return;
    }
    const toastId = toast.loading(`Launching Chrome for ${targetGstin}...`, {
      description: 'Navigating to GST Portal and auto-filling login details from Vault.'
    });
    try {
      const res = await safeApiFetch('/api/returns/open-portal-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gstin: targetGstin })
      });
      const data = await res.json();
      if (data && data.success) {
        toast.success('Chrome launched & credentials auto-filled!', {
          id: toastId,
          description: data.message || 'Please enter CAPTCHA and click LOGIN on portal.'
        });
      } else {
        toast.error('Failed to launch portal', { id: toastId, description: data.error || 'Check credentials vault.' });
      }
    } catch (err: any) {
      toast.error('Launch error', { id: toastId, description: err.message });
    }
  };

  // Full Autopilot: Login -> Services -> Returns -> Track Return Status -> Scrape ARNs & Ingest
  const handleSyncPortal = async (overrideGstin?: string) => {
    let targetGstin = overrideGstin;
    if (!targetGstin) {
      if (selectedClientFilter && selectedClientFilter !== 'ALL' && selectedClientFilter !== 'CUSTOM_SELECTION') {
        targetGstin = selectedClientFilter;
      } else if (checkedGstins.size > 0) {
        targetGstin = Array.from(checkedGstins)[0];
      } else if (selectedClientGstin) {
        targetGstin = selectedClientGstin;
      } else if (currentGstin) {
        targetGstin = currentGstin;
      } else {
        targetGstin = uniqueClients[0]?.gstin;
      }
    }
    if (!targetGstin) {
      toast.error('Please select a client with a valid GSTIN first.');
      return;
    }

    setIsSyncingPortal(true);
    const toastId = toast.loading(`Track Return Status Autopilot: ${targetGstin}`, {
      description: 'Chrome launching... Login with CAPTCHA -> Autopilot will navigate to Services > Returns > Track Return Status and scrape all ARNs.'
    });

    try {
      const res = await safeApiFetch('/api/returns/sync-portal-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: targetGstin,
          financialYear: selectedFy,
          fy: selectedFy,
          period: selectedPeriodFilter !== 'ALL' ? selectedPeriodFilter : null
        })
      });
      const data = await res.json();
      if (data && data.success) {
        toast.success('Track Return Status Synced!', {
          id: toastId,
          description: data.message || `Tracked ${data.totalReturnsScraped || 0} returns with official portal ARNs.`
        });
        await fetchTrackingData();
      } else {
        toast.error('Portal Sync Error', {
          id: toastId,
          description: data.error || data.message || 'Could not complete returns tracking inquiry.'
        });
      }
    } catch (err: any) {
      toast.error('Sync Error', { id: toastId, description: err.message || 'Connection to backend interrupted.' });
    } finally {
      setIsSyncingPortal(false);
    }
  };

  // Open Edit Filing Dialog
  const handleOpenEditModal = (r: ComplianceRecord) => {
    setEditingRecord(r);
    setFormReturnType('GSTR-3B');
    setFormArn(r.gstr3b.arn || '');
    setFormFilingDate(r.gstr3b.filingDate || '');
    setFormStatus(r.gstr3b.status || 'FILED_ON_TIME');
    setFormCashPaid(r.gstr3b.cashPaid || 0);
    setFormOfficeStage(r.officeStage || 'NOT_STARTED');
    setFormRemarks(r.remarks || '');
    setIsEditModalOpen(true);
  };

  // Save Edit / Override Filing
  const handleSaveFiling = async () => {
    if (!editingRecord) return;
    const toastId = toast.loading('Saving compliance filing record...');

    try {
      const payload: any = {
        gstin: editingRecord.clientGstin,
        clientName: editingRecord.clientName,
        financialYear: editingRecord.financialYear,
        month: editingRecord.month,
        officeStage: formOfficeStage,
        remarks: formRemarks
      };

      if (formReturnType === 'GSTR-3B') {
        payload.gstr3bArn = formArn.trim() || null;
        payload.gstr3bFilingDate = formFilingDate || null;
        payload.gstr3bStatus = formStatus;
        payload.gstr3bCashPaid = Number(formCashPaid) || 0;
      } else {
        payload.gstr1Arn = formArn.trim() || null;
        payload.gstr1FilingDate = formFilingDate || null;
        payload.gstr1Status = formStatus;
      }

      const res = await safeApiFetch('/api/returns/save-tracking-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data && data.success) {
        toast.success('Filing Saved', {
          id: toastId,
          description: `Updated ${formReturnType} record for ${editingRecord.clientName} (${editingRecord.month}).`
        });
        setIsEditModalOpen(false);
        await fetchTrackingData();
      } else {
        throw new Error(data.error || 'Failed to save record');
      }
    } catch (err: any) {
      toast.error('Save Error', { id: toastId, description: err.message || 'Database update failed.' });
    }
  };

  // 1-Click Zero-Merge Excel Compliance Audit Sheet Export
  const handleExportComplianceExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Tab 1: Executive Summary
      const summaryRows = [
        ['VASWANI & ASSOCIATES - GST COMPLIANCE & FILING AUDIT CERTIFICATE'],
        [`Financial Year: ${selectedFy} | Report Generated: ${new Date().toLocaleString('en-IN')}`],
        [],
        ['COMPLIANCE KPI METRIC', 'VALUE', 'UNIT / BENCHMARK'],
        ['Total Return Obligations Monitored', kpiMetrics.totalDue, 'Filings (GSTR-1 + GSTR-3B)'],
        ['Successfully Filed Returns', kpiMetrics.filedCount, 'Filed Returns'],
        ['Statutory Compliance Ratio', `${kpiMetrics.complianceRate}%`, 'Target: 100%'],
        ['Pending Filings in Window', kpiMetrics.pendingCount, 'Action Required'],
        ['Statutory Overdue Filings', kpiMetrics.overdueCount, 'Late Fee Triggered'],
        ['Estimated Statutory Late Fees Accrued', kpiMetrics.totalLateFees, 'INR (₹50/day standard, ₹20/day NIL)'],
        ['Estimated Section 50 Cash Interest Accrued', kpiMetrics.totalInterest, 'INR (18% p.a. on unpaid net cash)']
      ];
      const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
      summaryWs['!cols'] = [{ wch: 45 }, { wch: 25 }, { wch: 45 }];
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Compliance_Summary');

      // Tab 2: Master Compliance Register (Zero-Merge Flat Architecture)
      const registerHeaders = [
        'Client Name',
        'GSTIN',
        'Period',
        'Frequency',
        'GSTR-1 Status',
        'GSTR-1 Due Date',
        'GSTR-1 Filing Date',
        'GSTR-1 ARN',
        'GSTR-1 Late Fee (₹)',
        'GSTR-2B Inward Recs',
        'GSTR-2B Net Eligible ITC (₹)',
        'GSTR-3B Status',
        'GSTR-3B Due Date',
        'GSTR-3B Filing Date',
        'GSTR-3B ARN',
        'GSTR-3B Cash Paid (₹)',
        'GSTR-3B Tax Liability (₹)',
        'GSTR-3B Late Fee (₹)',
        'GSTR-3B Sec 50 Interest (₹)',
        'Office Workflow Stage',
        'Audit Remarks'
      ];

      const registerDataRows = filteredCockpitRecords.map(r => [
        r.clientName,
        r.clientGstin,
        r.month,
        r.frequency,
        r.gstr1.status,
        r.gstr1.dueDate,
        r.gstr1.filingDate || '-',
        r.gstr1.arn || '-',
        r.gstr1.lateFee || 0,
        r.gstr2b.invoiceCount || 0,
        r.gstr2b.eligibleItc || 0,
        r.gstr3b.status,
        r.gstr3b.dueDate,
        r.gstr3b.filingDate || '-',
        r.gstr3b.arn || '-',
        r.gstr3b.cashPaid || 0,
        r.gstr3b.taxLiability || 0,
        r.gstr3b.lateFee || 0,
        r.gstr3b.interest || 0,
        r.officeStage,
        r.remarks || '-'
      ]);

      const registerWs = XLSX.utils.aoa_to_sheet([registerHeaders, ...registerDataRows]);
      registerWs['!cols'] = [
        { wch: 32 }, { wch: 18 }, { wch: 14 }, { wch: 12 },
        { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 16 },
        { wch: 16 }, { wch: 22 },
        { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 18 },
        { wch: 20 }, { wch: 30 }
      ];
      XLSX.utils.book_append_sheet(wb, registerWs, 'Master_Compliance_Register');

      // Tab 3: If Single Client Selected, add 12-Month Matrix
      if (activeTimelineClient) {
        const clientMatrixRows = [
          [`12-MONTH COMPLIANCE TIMELINE: ${activeTimelineClient.name} (${activeTimelineClient.gstin})`],
          [`Financial Year: ${selectedFy}`],
          [],
          [
            'Month', 'GSTR-1 Due Date', 'GSTR-1 Filed', 'GSTR-1 ARN', 'GSTR-1 Late Fee (₹)',
            'GSTR-2B Status', 'GSTR-2B ITC (₹)',
            'GSTR-3B Due Date', 'GSTR-3B Filed', 'GSTR-3B ARN', 'GSTR-3B Cash Paid (₹)', 'GSTR-3B Tax (₹)', 'Late Fee (₹)', 'Sec 50 Int (₹)',
            'Workflow Stage'
          ],
          ...clientTimelineRecords.map(r => [
            r.month,
            r.gstr1.dueDate,
            r.gstr1.filingDate || '-',
            r.gstr1.arn || '-',
            r.gstr1.lateFee || 0,
            r.gstr2b.status,
            r.gstr2b.eligibleItc || 0,
            r.gstr3b.dueDate,
            r.gstr3b.filingDate || '-',
            r.gstr3b.arn || '-',
            r.gstr3b.cashPaid || 0,
            r.gstr3b.taxLiability || 0,
            r.gstr3b.lateFee || 0,
            r.gstr3b.interest || 0,
            r.officeStage
          ])
        ];
        const clientWs = XLSX.utils.aoa_to_sheet(clientMatrixRows);
        clientWs['!cols'] = [
          { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 16 },
          { wch: 16 }, { wch: 18 },
          { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 16 },
          { wch: 20 }
        ];
        XLSX.utils.book_append_sheet(wb, clientWs, 'Client_12M_Timeline');
      }

      // STRICT ZERO-MERGE ENFORCEMENT
      removeAllMergesFromWorkbook(wb);

      // Serialize and download
      const fileName = `GST_RETURNS_COMPLIANCE_TRACKER_${selectedFy}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('Compliance Excel Exported', {
        description: 'Zero-Merge audit certificate ready with all client filing records.'
      });
    } catch (err: any) {
      toast.error('Export Error', { description: err.message || 'Could not export Excel workbook.' });
    }
  };

  // Render Status Badge
  const renderStatusBadge = (metrics: ReturnTrackingMetrics, label = '') => {
    const status = metrics.status;
    if (status === 'FILED_ON_TIME') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          {label ? `${label}: ` : ''}Filed On Time
        </span>
      );
    }
    if (status === 'FILED_LATE') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3 text-amber-600" />
          {label ? `${label}: ` : ''}Delay ({metrics.daysOverdue}d)
        </span>
      );
    }
    if (status === 'OVERDUE') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
          <AlertTriangle className="w-3 h-3 text-rose-600" />
          {label ? `${label}: ` : ''}Overdue ({metrics.daysOverdue}d)
        </span>
      );
    }
    if (status === 'DUE_SOON') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
          <Clock className="w-3 h-3 text-blue-600" />
          {label ? `${label}: ` : ''}Due Soon
        </span>
      );
    }
    if (status === 'READY_TO_FILE') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
          <Sparkles className="w-3 h-3 text-indigo-600" />
          {label ? `${label}: ` : ''}Ready to File
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
        <Clock className="w-3 h-3 text-slate-400" />
        {label ? `${label}: ` : ''}Pending
      </span>
    );
  };

  // Render Office Stage Badge
  const renderOfficeStageBadge = (stage: string) => {
    switch (stage) {
      case 'FILED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">5. Filed</span>;
      case 'CHALLAN_GENERATED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">4. Challan Gen</span>;
      case 'RECONCILED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">3. Reconciled</span>;
      case 'DATA_RECEIVED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">2. Data In</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">1. Not Started</span>;
    }
  };

  return (
    <div className="w-full space-y-5 animate-fade-in text-slate-900 pb-16">

      {/* ─── STEP 1: PRACTICE CLIENT SELECTION DIRECTORY GATEWAY ─── */}
      {trackingStep === 'client_selection' && (
        <div className="space-y-6 animate-fade-in text-slate-900 pb-20">
          {/* Step 1 Obsidian Glass Header */}
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white rounded-3xl p-6 md:p-8 border border-slate-800 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-1/3 -mb-16 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-black uppercase tracking-widest">
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  Step 1 of 2 • Client Selection Directory
                </div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-3">
                  Select Clients to Track &amp; Monitor
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {uniqueClients.length} Registered Clients
                  </span>
                </h1>
                <p className="text-xs md:text-sm text-slate-400 max-w-2xl leading-relaxed">
                  Choose which clients to monitor from your practice directory. The subsequent compliance dashboard, statutory KPIs, overdue tracking, and late fees will be calculated strictly for your selected clients.
                </p>
              </div>

              {/* Step 1 Actions */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Financial Year Selector */}
                <div className="flex items-center bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-1.5 gap-2">
                  <Calendar className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-xs text-slate-400 font-bold">FY:</span>
                  <select
                    value={selectedFy}
                    onChange={(e) => setSelectedFy(e.target.value)}
                    className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer"
                  >
                    {AVAILABLE_FINANCIAL_YEARS.map(fy => (
                      <option key={fy} value={fy} className="bg-slate-900 text-white">FY {fy}</option>
                    ))}
                  </select>
                </div>

                {/* Track All Firm Clients Button */}
                <button
                  type="button"
                  onClick={() => {
                    setCheckedGstins(new Set());
                    setSelectedClientFilter('ALL');
                    setTrackingStep('dashboard');
                    toast.info('Tracking All Practice Clients', {
                      description: `Monitoring all ${uniqueClients.length} clients in FY ${selectedFy}.`
                    });
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold border border-slate-700 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  Track All ({uniqueClients.length})
                </button>

                {/* Proceed Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (checkedGstins.size === 0) {
                      setSelectedClientFilter('ALL');
                      toast.info('Proceeding with All Clients', {
                        description: `No specific clients checked — displaying firm-wide records.`
                      });
                    } else {
                      setSelectedClientFilter('CUSTOM_SELECTION');
                    }
                    setTrackingStep('dashboard');
                  }}
                  className="px-5 py-2.5 bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black shadow-lg shadow-purple-500/25 transition-all cursor-pointer flex items-center gap-2"
                >
                  <span>
                    Proceed to Dashboard ({checkedGstins.size > 0 ? `${checkedGstins.size} Selected` : `All ${uniqueClients.length}`})
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Directory Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Practice Directory</div>
                <div className="text-2xl font-black text-slate-900 mt-1">{uniqueClients.length}</div>
                <div className="text-[11px] text-slate-400 font-semibold mt-0.5">Active Registered Clients</div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                <Building2 className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-purple-200/80 shadow-sm flex items-center justify-between bg-gradient-to-br from-white to-purple-50/40">
              <div>
                <div className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">Selected for Tracking</div>
                <div className="text-2xl font-black text-purple-900 mt-1">{checkedGstins.size}</div>
                <div className="text-[11px] text-purple-600 font-semibold mt-0.5">
                  {checkedGstins.size > 0 ? `${checkedGstins.size * 12} Annual Filings` : 'None selected (tracks all)'}
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700">
                <CheckSquare className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">With Pending / Overdue</div>
                <div className="text-2xl font-black text-amber-900 mt-1">
                  {uniqueClients.filter(c => c.pendingCount > 0 || c.overdueCount > 0).length}
                </div>
                <div className="text-[11px] text-amber-600 font-semibold mt-0.5">Clients Requiring Action</div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Fully Compliant</div>
                <div className="text-2xl font-black text-emerald-900 mt-1">
                  {uniqueClients.filter(c => c.pendingCount === 0 && c.overdueCount === 0 && c.filedCount > 0).length}
                </div>
                <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">100% Filed up-to-date</div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Directory Client Table Container */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Toolbar: Search, Filters, and Bulk Select Actions */}
            <div className="p-4 md:p-5 border-b border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-50/50">
              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setDirectoryFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    directoryFilter === 'ALL'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  All Clients ({uniqueClients.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDirectoryFilter('SELECTED')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                    directoryFilter === 'SELECTED'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <span>Selected ({checkedGstins.size})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDirectoryFilter('PENDING')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    directoryFilter === 'PENDING'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Pending ({uniqueClients.filter(c => c.pendingCount > 0 || c.overdueCount > 0).length})
                </button>
                <button
                  type="button"
                  onClick={() => setDirectoryFilter('MONTHLY')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    directoryFilter === 'MONTHLY'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Monthly ({uniqueClients.filter(c => c.frequency === 'Monthly').length})
                </button>
                <button
                  type="button"
                  onClick={() => setDirectoryFilter('QRMP')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    directoryFilter === 'QRMP'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  QRMP ({uniqueClients.filter(c => c.frequency === 'QRMP').length})
                </button>
              </div>

              {/* Right Tools: Search and Bulk Check Actions */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative min-w-[240px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by client name or GSTIN..."
                    value={directorySearch}
                    onChange={(e) => setDirectorySearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium placeholder-slate-400 focus:outline-none focus:border-purple-500"
                  />
                  {directorySearch && (
                    <button
                      type="button"
                      onClick={() => setDirectorySearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Bulk Select Buttons */}
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(checkedGstins);
                    filteredDirectoryClients.forEach(c => next.add(c.gstin.toUpperCase()));
                    setCheckedGstins(next);
                  }}
                  className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  title="Select all clients currently visible in list"
                >
                  Select Visible ({filteredDirectoryClients.length})
                </button>
                {checkedGstins.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setCheckedGstins(new Set())}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-3 w-16 text-center bg-slate-200/70 border-r border-slate-300">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <input
                          type="checkbox"
                          id="directory-select-all"
                          checked={
                            filteredDirectoryClients.length > 0 &&
                            filteredDirectoryClients.every(c => checkedGstins.has(c.gstin.toUpperCase()))
                          }
                          onChange={(e) => {
                            const next = new Set(checkedGstins);
                            if (e.target.checked) {
                              filteredDirectoryClients.forEach(c => next.add(c.gstin.toUpperCase()));
                            } else {
                              filteredDirectoryClients.forEach(c => next.delete(c.gstin.toUpperCase()));
                            }
                            setCheckedGstins(next);
                          }}
                          className="w-4 h-4 rounded border-slate-400 text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600 shadow-sm"
                          title="Select all visible clients"
                        />
                        <label htmlFor="directory-select-all" className="text-[8px] font-black text-purple-900 tracking-tighter cursor-pointer">
                          SELECT
                        </label>
                      </div>
                    </th>
                    <th className="py-3.5 px-2 w-10 text-center">#</th>
                    <th className="py-3.5 px-4 min-w-[260px]">Client / Entity Details</th>
                    <th className="py-3.5 px-3 min-w-[170px]">GSTIN &amp; State</th>
                    <th className="py-3.5 px-2 w-24 text-center">Filing Frequency</th>
                    <th className="py-3.5 px-4 min-w-[200px]">Compliance Health (FY {selectedFy})</th>
                    <th className="py-3.5 px-3 min-w-[120px] text-right">Cash Paid (₹)</th>
                    <th className="py-3.5 px-4 min-w-[160px] text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredDirectoryClients.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <div className="max-w-sm mx-auto space-y-2">
                          <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
                          <div className="font-bold text-slate-700">No Clients Found</div>
                          <p className="text-xs text-slate-400">
                            No clients matched your search "{directorySearch}". Try clearing the search.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredDirectoryClients.map((c, idx) => {
                      const isChecked = checkedGstins.has(c.gstin.toUpperCase());
                      return (
                        <tr
                          key={c.gstin}
                          onClick={() => {
                            const next = new Set(checkedGstins);
                            const g = c.gstin.toUpperCase();
                            if (next.has(g)) next.delete(g);
                            else next.add(g);
                            setCheckedGstins(next);
                          }}
                          className={`transition-colors cursor-pointer group ${
                            isChecked
                              ? 'bg-purple-50/80 hover:bg-purple-100/70 border-l-4 border-l-purple-600'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td
                            className="py-3 px-3 text-center bg-purple-50/20 border-r border-slate-200/60"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const next = new Set(checkedGstins);
                                const g = c.gstin.toUpperCase();
                                if (e.target.checked) next.add(g);
                                else next.delete(g);
                                setCheckedGstins(next);
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600"
                            />
                          </td>
                          <td className="py-3 px-2 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
                              {c.name}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Registered Taxpayer • Rule 59/61
                            </div>
                          </td>
                          <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5 font-mono text-xs text-slate-700 font-bold">
                              <span>{c.gstin}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyGstin(c.gstin)}
                                className="text-slate-400 hover:text-slate-700 cursor-pointer"
                                title="Copy GSTIN"
                              >
                                {copiedGstin === c.gstin ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                            <div className="text-[10px] text-slate-400 font-sans">
                              State Code: {c.gstin.slice(0, 2)}
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              c.frequency === 'QRMP'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}>
                              {c.frequency}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  {c.filedCount} / {c.totalDue} Filed
                                </span>
                                {(c.pendingCount > 0 || c.overdueCount > 0) && (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    c.overdueCount > 0
                                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}>
                                    {c.overdueCount > 0 ? `${c.overdueCount} Overdue` : `${c.pendingCount} Pending`}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-700">
                            ₹{c.totalCashPaid.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                setCheckedGstins(new Set([c.gstin.toUpperCase()]));
                                setSelectedClientFilter(c.gstin.toUpperCase());
                                setSelectedClientGstin(c.gstin.toUpperCase());
                                setTrackingStep('dashboard');
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-purple-50 text-purple-700 hover:bg-purple-600 hover:text-white border border-purple-200 transition-all cursor-pointer shadow-sm"
                            >
                              <span>Track Client</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sticky Bottom Bar for Step 1 */}
          <div className="sticky bottom-4 z-30 bg-slate-950/95 backdrop-blur-md text-white rounded-2xl p-4 border border-slate-800 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-300 font-bold text-base">
                {checkedGstins.size > 0 ? checkedGstins.size : uniqueClients.length}
              </div>
              <div>
                <div className="text-xs font-black text-white flex items-center gap-2">
                  <span>
                    {checkedGstins.size > 0
                      ? `${checkedGstins.size} Client${checkedGstins.size > 1 ? 's' : ''} Selected`
                      : `All ${uniqueClients.length} Practice Clients Selected`}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {checkedGstins.size > 0 ? `${checkedGstins.size * 12} Filings` : `${uniqueClients.length * 12} Filings`}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {checkedGstins.size > 0
                    ? `Click Proceed to calculate KPIs & display records strictly for these ${checkedGstins.size} clients.`
                    : `Proceeding will display all ${uniqueClients.length} clients across the firm.`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {checkedGstins.size > 0 && (
                <button
                  type="button"
                  onClick={() => setCheckedGstins(new Set())}
                  className="px-3.5 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                >
                  Clear Selection
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (checkedGstins.size === 0) {
                    setSelectedClientFilter('ALL');
                  } else {
                    setSelectedClientFilter('CUSTOM_SELECTION');
                  }
                  setTrackingStep('dashboard');
                }}
                className="px-6 py-2.5 text-xs font-black bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl shadow-lg shadow-purple-500/25 transition-all cursor-pointer flex items-center gap-2"
              >
                <span>Proceed to Compliance Dashboard →</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── STEP 2: STATUTORY COMPLIANCE COCKPIT & DASHBOARD ─── */}
      {trackingStep === 'dashboard' && (
        <div className="space-y-5 animate-fade-in">

      {/* ─── OBSIDIAN GLASS CORPORATE COMMAND HEADER (NO SLIDER - 2-TIER AESTHETIC) ─── */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white rounded-2xl p-4 md:p-5 border border-slate-800/90 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-3.5">
          {/* Top Row: Suite Identity & Primary Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Left: Suite Brand Pill */}
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-500/20 border border-purple-400/30 text-purple-200 text-xs font-black uppercase tracking-wider shadow-xs">
                <CalendarClock className="w-3.5 h-3.5 text-purple-400" />
                <span>Suite 04 • Returns Tracker</span>
              </div>
            </div>

            {/* Right: Primary Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleQuickPortalLogin()}
                disabled={isSyncingPortal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition-all shadow-xs cursor-pointer disabled:opacity-50"
                title="Launch visible Chrome & auto-fill GST Portal login credentials"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Login in Portal</span>
              </button>

              <button
                type="button"
                onClick={() => handleSyncPortal()}
                disabled={isSyncingPortal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white transition-all shadow-xs cursor-pointer disabled:opacity-50"
                title="Launch Chrome, solve CAPTCHA -> Autopilot will navigate to Services > Returns > Track Return Status and scrape all ARNs"
              >
                <CloudDownload className={`w-3.5 h-3.5 ${isSyncingPortal ? 'animate-spin' : ''}`} />
                <span>{isSyncingPortal ? 'Syncing...' : 'Sync Portal Status'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportComplianceExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs cursor-pointer"
                title="Export compliance data to Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export Excel</span>
              </button>

              <button
                type="button"
                onClick={fetchTrackingData}
                disabled={isLoading}
                title="Refresh compliance database"
                className="p-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700/80 cursor-pointer shadow-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-purple-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Bottom Row: Scope Selectors & Mode A / Mode B Tabs */}
          <div className="pt-2.5 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Left: Client Scope & FY Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTrackingStep('client_selection')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400/30 text-purple-200 hover:text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                title="Return to Step 1: Client Selection Directory"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-purple-300" />
                <span>Select Clients</span>
                <span className="px-1.5 py-0.2 rounded-md bg-purple-500/40 text-white text-[10px] font-mono">
                  {checkedGstins.size > 0 ? `${checkedGstins.size}` : 'All'}
                </span>
              </button>

              <select
                value={selectedFy}
                onChange={(e) => setSelectedFy(e.target.value)}
                className="bg-slate-800/90 border border-slate-700/80 text-white text-xs font-bold rounded-xl px-2.5 py-1.5 outline-none hover:bg-slate-750 cursor-pointer shadow-xs"
              >
                {AVAILABLE_FINANCIAL_YEARS.map(fy => (
                  <option key={fy} value={fy}>FY {fy}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  if (selectedClientFilter === 'CUSTOM_SELECTION') {
                    setSelectedClientFilter('ALL');
                  } else {
                    if (checkedGstins.size === 0) {
                      toast.info('No clients selected yet. Opening client selection directory...');
                      setTrackingStep('client_selection');
                      return;
                    }
                    setSelectedClientFilter('CUSTOM_SELECTION');
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer border ${
                  selectedClientFilter === 'CUSTOM_SELECTION'
                    ? 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400/50 shadow-purple-500/20'
                    : 'bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 border-slate-700/80 hover:text-white'
                }`}
                title={
                  selectedClientFilter === 'CUSTOM_SELECTION'
                    ? `Filtering by ${checkedGstins.size} checked clients. Click to toggle to All Clients (${uniqueClients.length})`
                    : `Showing All Clients (${uniqueClients.length}). Click to toggle to Checked Clients (${checkedGstins.size})`
                }
              >
                {selectedClientFilter === 'CUSTOM_SELECTION' ? (
                  <>
                    <CheckSquare className="w-3.5 h-3.5 text-purple-200" />
                    <span>Checked Clients ({checkedGstins.size})</span>
                  </>
                ) : (
                  <>
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>All Clients ({uniqueClients.length})</span>
                    {checkedGstins.size > 0 && (
                      <span className="text-[10px] font-mono bg-purple-600/30 text-purple-300 border border-purple-500/30 px-1.5 py-0.2 rounded">
                        {checkedGstins.size} checked
                      </span>
                    )}
                  </>
                )}
              </button>

              {/* Month Dropdown Menu */}
              <select
                value={selectedPeriodFilter}
                onChange={(e) => setSelectedPeriodFilter(e.target.value as GSTR3BMonthKey | 'ALL')}
                className="bg-slate-800/90 border border-slate-700/80 text-white text-xs font-bold rounded-xl px-2.5 py-1.5 outline-none hover:bg-slate-750 cursor-pointer shadow-xs"
                title="Filter by Return Period / Month"
              >
                <option value="ALL">📅 Full FY (12 Months)</option>
                {GSTR3B_MONTHS.map(m => (
                  <option key={m} value={m}>
                    🗓️ {m}
                  </option>
                ))}
              </select>

              {/* Status Dropdown Menu */}
              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value as 'ALL' | 'PENDING' | 'OVERDUE' | 'FILED')}
                className="bg-slate-800/90 border border-slate-700/80 text-white text-xs font-bold rounded-xl px-2.5 py-1.5 outline-none hover:bg-slate-750 cursor-pointer shadow-xs"
                title="Filter by Filing Status"
              >
                <option value="ALL">⚡ All Status</option>
                <option value="PENDING">⏳ Pending</option>
                <option value="OVERDUE">⚠️ Overdue</option>
                <option value="FILED">✅ Filed</option>
              </select>
            </div>

            {/* Right: View Mode Toggle Tabs */}
            <div className="flex items-center bg-slate-800/90 p-0.5 rounded-xl border border-slate-700/80 shadow-xs">
              <button
                type="button"
                onClick={() => setViewMode('cockpit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'cockpit'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Mode A: All Clients</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('timeline')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'timeline'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Mode B: 12M Matrix</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 4 HIGH-DENSITY KPI CARDS ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Returns Due */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Returns Due</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{kpiMetrics.totalDue}</div>
            <div className="text-[11px] text-blue-600 font-semibold mt-0.5 truncate max-w-[220px]" title={kpiScopeLabel}>
              {kpiScopeLabel}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <Calculator className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Successfully Filed */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Successfully Filed</div>
            <div className="text-2xl font-black text-emerald-600 mt-1">{kpiMetrics.filedCount}</div>
            <div className="text-[11px] text-emerald-700 font-semibold mt-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {kpiMetrics.complianceRate}% Compliance Rate
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Pending / Overdue */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pending / Overdue</div>
            <div className="text-2xl font-black text-rose-600 mt-1">
              {kpiMetrics.overdueCount} <span className="text-sm font-semibold text-slate-400">/ {kpiMetrics.pendingCount} pend</span>
            </div>
            <div className="text-[11px] text-rose-600 font-semibold mt-0.5">
              Accrued Fee: ₹{kpiMetrics.totalLateFees.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Next Statutory Deadline */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Next Deadline</div>
            <div className="text-base font-black text-purple-700 mt-1 truncate max-w-[160px]" title={nextStatutoryDeadline.title}>
              {nextStatutoryDeadline.title}
            </div>
            <div className="text-[11px] text-slate-600 font-semibold mt-0.5 flex items-center gap-1.5">
              <span>{nextStatutoryDeadline.dueDateStr}</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                nextStatutoryDeadline.diffDays <= 3 ? 'bg-rose-100 text-rose-700' : 'bg-purple-100 text-purple-700'
              }`}>
                {nextStatutoryDeadline.diffDays >= 0 ? `${nextStatutoryDeadline.diffDays}d left` : 'Passed'}
              </span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* ─── MODE A: ALL-CLIENTS MASTER COMPLIANCE COCKPIT ─── */}
      {viewMode === 'cockpit' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Cockpit Table Top Bar */}
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Returns Registry
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700 font-mono">
                {filteredCockpitRecords.length} records
              </span>
              {selectedPeriodFilter !== 'ALL' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                  {selectedPeriodFilter}
                </span>
              )}
              {selectedStatusFilter !== 'ALL' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  {selectedStatusFilter}
                </span>
              )}
            </div>

            {/* Search Box */}
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search client or GSTIN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium placeholder-slate-400 focus:outline-none focus:border-purple-500 shadow-2xs"
              />
            </div>
          </div>

          {/* Checked Clients Active Notification Bar */}
          {checkedGstins.size > 0 && (
            <div className="mx-4 my-3 p-3 bg-gradient-to-r from-purple-950 via-purple-900 to-indigo-950 text-white rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-lg border border-purple-500/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <div className="text-xs font-black text-white flex items-center gap-2">
                    <span>{checkedGstins.size} Clients Active</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {filteredCockpitRecords.length} Return Rows Scoped
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-200/80">
                    KPIs, overdue calculations, and return status are filtered strictly to these {checkedGstins.size} clients.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end md:self-auto">
                <button
                  type="button"
                  onClick={() => setTrackingStep('client_selection')}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Users className="w-3.5 h-3.5" />
                  Modify in Step 1
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCheckedGstins(new Set());
                    setSelectedClientFilter('ALL');
                  }}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-purple-200 hover:text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Clear (Show All {uniqueClients.length})
                </button>
              </div>
            </div>
          )}

          {/* Master Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-2 w-16 text-center bg-slate-200/70 border-r border-slate-300">
                    <div className="flex flex-col items-center justify-center gap-0.5">
                      <input
                        type="checkbox"
                        id="cockpit-table-select-all"
                        checked={
                          filteredCockpitRecords.length > 0 &&
                          filteredCockpitRecords.every(r => checkedGstins.has(r.clientGstin.toUpperCase()))
                        }
                        onChange={(e) => {
                          const next = new Set(checkedGstins);
                          if (e.target.checked) {
                            filteredCockpitRecords.forEach(r => next.add(r.clientGstin.toUpperCase()));
                            setCheckedGstins(next);
                            setSelectedClientFilter('CUSTOM_SELECTION');
                          } else {
                            filteredCockpitRecords.forEach(r => next.delete(r.clientGstin.toUpperCase()));
                            setCheckedGstins(next);
                            if (next.size === 0) setSelectedClientFilter('ALL');
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-400 text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600 shadow-sm"
                        title="Select all visible clients"
                      />
                      <label htmlFor="cockpit-table-select-all" className="text-[8px] font-black text-purple-900 tracking-tighter cursor-pointer">
                        SELECT
                      </label>
                    </div>
                  </th>
                  <th className="py-3 px-2 w-8 text-center">#</th>
                  <th className="py-3 px-3 min-w-[200px]">Client / Firm Details</th>
                  <th className="py-3 px-2 w-20 text-center">Period</th>
                  <th className="py-3 px-2 w-16 text-center">Freq</th>
                  <th className="py-3 px-3 min-w-[160px]">GSTR-1 Status</th>
                  <th className="py-3 px-3 min-w-[140px]">GSTR-2B Availability</th>
                  <th className="py-3 px-3 min-w-[170px]">GSTR-3B Status</th>
                  <th className="py-3 px-3 min-w-[100px] text-right">Cash Paid (₹)</th>
                  <th className="py-3 px-3 min-w-[110px] text-center">Office Stage</th>
                  <th className="py-3 px-3 min-w-[170px] text-right">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredCockpitRecords.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-400">
                      <div className="max-w-sm mx-auto space-y-2">
                        <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
                        <div className="font-bold text-slate-700">No Compliance Records Found</div>
                        <p className="text-xs text-slate-400">
                          No returns matching current filters. Click "Sync Portal" or select another period.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredCockpitRecords.map((r, idx) => {
                    const isChecked = checkedGstins.has(r.clientGstin.toUpperCase());
                    return (
                    <tr
                      key={r.id}
                      className={`transition-colors group ${
                        isChecked
                          ? 'bg-purple-50/80 hover:bg-purple-100/70 border-l-4 border-l-purple-600'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3 px-2 text-center bg-purple-50/20 border-r border-slate-200/50">
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const next = new Set(checkedGstins);
                              const g = r.clientGstin.toUpperCase();
                              if (e.target.checked) {
                                next.add(g);
                                setCheckedGstins(next);
                                setSelectedClientFilter('CUSTOM_SELECTION');
                              } else {
                                next.delete(g);
                                setCheckedGstins(next);
                                if (next.size === 0 && selectedClientFilter === 'CUSTOM_SELECTION') {
                                  setSelectedClientFilter('ALL');
                                }
                              }
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600"
                            title={`Select ${r.clientName}`}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 group-hover:text-purple-700 transition-colors truncate max-w-[220px]" title={r.clientName}>
                          {r.clientName}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono mt-0.5">
                          <span>{r.clientGstin}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyGstin(r.clientGstin)}
                            className="text-slate-400 hover:text-slate-700 transition-colors"
                            title="Copy GSTIN"
                          >
                            {copiedGstin === r.clientGstin ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center font-bold text-slate-700">
                        {r.month.slice(0, 3)}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          r.frequency === 'QRMP' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {r.frequency === 'QRMP' ? 'QRMP' : 'Mth'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <div>{renderStatusBadge(r.gstr1)}</div>
                          {r.gstr1.filingDate && (
                            <div className="text-[10px] text-slate-500 font-mono">
                              Filed: {r.gstr1.filingDate}
                            </div>
                          )}
                          {r.gstr1.arn && (
                            <div className="text-[9px] text-slate-400 font-mono truncate max-w-[130px]" title={r.gstr1.arn}>
                              ARN: {r.gstr1.arn}
                            </div>
                          )}
                          {r.gstr1.lateFee > 0 && (
                            <div className="text-[10px] text-rose-600 font-bold">
                              Late Fee: ₹{r.gstr1.lateFee}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.gstr2b.status === 'AVAILABLE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {r.gstr2b.status === 'AVAILABLE' ? 'Available' : 'Pending'}
                          </span>
                          <div className="text-[10px] text-slate-600 font-semibold">
                            Eligible ITC: <span className="font-bold text-slate-900">₹{(r.gstr2b.eligibleItc || 0).toLocaleString('en-IN')}</span>
                          </div>
                          {r.gstr2b.invoiceCount > 0 && (
                            <div className="text-[10px] text-slate-400">
                              {r.gstr2b.invoiceCount} Inward Records
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <div>{renderStatusBadge(r.gstr3b)}</div>
                          {r.gstr3b.filingDate && (
                            <div className="text-[10px] text-slate-500 font-mono">
                              Filed: {r.gstr3b.filingDate}
                            </div>
                          )}
                          {r.gstr3b.arn && (
                            <div className="text-[9px] text-slate-400 font-mono truncate max-w-[130px]" title={r.gstr3b.arn}>
                              ARN: {r.gstr3b.arn}
                            </div>
                          )}
                          {r.gstr3b.lateFee > 0 && (
                            <div className="text-[10px] text-rose-600 font-bold">
                              Late Fee: ₹{r.gstr3b.lateFee}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="font-bold text-slate-900">
                          ₹{(r.gstr3b.cashPaid || 0).toLocaleString('en-IN')}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Liab: ₹{(r.gstr3b.taxLiability || 0).toLocaleString('en-IN')}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {renderOfficeStageBadge(r.officeStage)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 1-Click Direct Jump into 3B Working Sheet */}
                          <button
                            type="button"
                            onClick={() => {
                              if (onJumpToWorking) {
                                onJumpToWorking(r.clientGstin, r.clientName, r.month, 'working3b');
                              }
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white transition-all border border-blue-200 cursor-pointer shadow-sm"
                            title="Jump directly to GSTR-3B Working Sheet"
                          >
                            <Calculator className="w-3 h-3" />
                            Working
                          </button>

                          {/* Jump to 2B Autopilot */}
                          <button
                            type="button"
                            onClick={() => {
                              if (onJumpToWorking) {
                                onJumpToWorking(r.clientGstin, r.clientName, r.month, 'gstr2b_downloader');
                              }
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-all cursor-pointer"
                            title="Jump to Inward 2B Autopilot"
                          >
                            <CloudDownload className="w-3.5 h-3.5" />
                          </button>

                          {/* Jump to GSTR-1 */}
                          <button
                            type="button"
                            onClick={() => {
                              if (onJumpToWorking) {
                                onJumpToWorking(r.clientGstin, r.clientName, r.month, 'gstr1_downloader');
                              }
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 transition-all cursor-pointer"
                            title="Jump to Outward GSTR-1"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit / Override */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(r)}
                            className="p-1 rounded-lg text-slate-400 hover:text-purple-700 hover:bg-purple-50 transition-all cursor-pointer"
                            title="Record ARN / Manual Status Override"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* Launch Chrome Portal for this Client */}
                          <button
                            type="button"
                            onClick={() => handleSyncPortal(r.clientGstin)}
                            disabled={isSyncingPortal}
                            className="p-1 rounded-lg text-slate-400 hover:text-sky-700 hover:bg-sky-50 transition-all cursor-pointer disabled:opacity-40"
                            title={`Launch Chrome & auto-fill GST Portal login for ${r.clientName}`}
                          >
                            <Globe className="w-3.5 h-3.5" />
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
      )}

      {/* ─── MODE B: SINGLE-CLIENT 12-MONTH TIMELINE MATRIX ─── */}
      {viewMode === 'timeline' && (
        <div className="space-y-4">
          {/* Client Selector & Overview Banner */}
          <div className="bg-white rounded-3xl p-5 md:p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 font-bold shadow-sm">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Select Taxpayer / Firm
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedClientGstin}
                    onChange={(e) => setSelectedClientGstin(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-purple-500 cursor-pointer min-w-[240px]"
                  >
                    {uniqueClients.map(c => (
                      <option key={c.gstin} value={c.gstin}>
                        {c.name} ({c.gstin})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleSyncPortal(selectedClientGstin)}
                    disabled={isSyncingPortal}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 transition-all cursor-pointer disabled:opacity-50"
                    title="Launch visible Chrome & auto-fill credentials for this client"
                  >
                    <Globe className={`w-3.5 h-3.5 text-sky-600 ${isSyncingPortal ? 'animate-spin' : ''}`} />
                    <span>Launch Portal</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Client 12M Financial Stats */}
            {activeTimelineClient && (
              <div className="flex flex-wrap items-center gap-5 text-xs">
                <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">12M Net Cash Paid</div>
                  <div className="text-sm font-black text-slate-900 mt-0.5">
                    ₹{activeTimelineClient.totalCashPaid.toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">12M Outward Tax</div>
                  <div className="text-sm font-black text-slate-900 mt-0.5">
                    ₹{activeTimelineClient.totalOutwardTax.toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">12M ITC Claimed</div>
                  <div className="text-sm font-black text-emerald-600 mt-0.5">
                    ₹{activeTimelineClient.totalItcClaimed.toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Late Fees Accrued</div>
                  <div className="text-sm font-black text-rose-600 mt-0.5">
                    ₹{activeTimelineClient.totalLateFees.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 12-Month Matrix Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4 min-w-[110px]">Month</th>
                    <th className="py-3 px-3 min-w-[130px]">GSTR-1 Due</th>
                    <th className="py-3 px-3 min-w-[150px]">GSTR-1 Filing</th>
                    <th className="py-3 px-3 min-w-[150px]">GSTR-2B Inward</th>
                    <th className="py-3 px-3 min-w-[130px]">GSTR-3B Due</th>
                    <th className="py-3 px-3 min-w-[170px]">GSTR-3B Filing &amp; ARN</th>
                    <th className="py-3 px-3 min-w-[110px] text-right">Cash Paid (₹)</th>
                    <th className="py-3 px-3 min-w-[100px] text-right">Late Fee (₹)</th>
                    <th className="py-3 px-3 min-w-[110px] text-center">Stage</th>
                    <th className="py-3 px-4 min-w-[140px] text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {clientTimelineRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-purple-600" />
                        {r.month}
                      </td>
                      <td className="py-3.5 px-3 text-slate-600 font-mono text-[11px]">
                        {r.gstr1.dueDate}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="space-y-1">
                          {renderStatusBadge(r.gstr1)}
                          {r.gstr1.filingDate && (
                            <div className="text-[10px] text-slate-500 font-mono">
                              Date: {r.gstr1.filingDate}
                            </div>
                          )}
                          {r.gstr1.arn && (
                            <div className="text-[9px] text-slate-400 font-mono truncate max-w-[120px]" title={r.gstr1.arn}>
                              ARN: {r.gstr1.arn}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="space-y-0.5">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            r.gstr2b.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {r.gstr2b.status}
                          </span>
                          <div className="text-[10px] text-slate-700 font-bold">
                            ₹{(r.gstr2b.eligibleItc || 0).toLocaleString('en-IN')}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-slate-600 font-mono text-[11px]">
                        {r.gstr3b.dueDate}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="space-y-1">
                          {renderStatusBadge(r.gstr3b)}
                          {r.gstr3b.filingDate && (
                            <div className="text-[10px] text-slate-500 font-mono">
                              Date: {r.gstr3b.filingDate}
                            </div>
                          )}
                          {r.gstr3b.arn && (
                            <div className="text-[9px] text-slate-400 font-mono truncate max-w-[130px]" title={r.gstr3b.arn}>
                              ARN: {r.gstr3b.arn}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-right font-bold text-slate-900">
                        ₹{(r.gstr3b.cashPaid || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-3 text-right font-bold text-rose-600">
                        ₹{((r.gstr1.lateFee || 0) + (r.gstr3b.lateFee || 0)).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        {renderOfficeStageBadge(r.officeStage)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (onJumpToWorking) {
                                onJumpToWorking(r.clientGstin, r.clientName, r.month, 'working3b');
                              }
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white transition-all border border-blue-200 cursor-pointer shadow-sm"
                          >
                            <Calculator className="w-3 h-3" />
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(r)}
                            className="p-1 rounded-lg text-slate-400 hover:text-purple-700 hover:bg-purple-50 transition-all cursor-pointer"
                            title="Edit / Record ARN"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
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

      </div>
      )}

      {/* ─── MANUAL EDIT / OVERRIDE FILING MODAL ─── */}
      {isEditModalOpen && editingRecord && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
            {/* Modal Header */}
            <div className="bg-slate-950 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Edit3 className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="font-bold text-sm">Record Compliance / Filing ARN</h3>
                  <p className="text-[11px] text-slate-400">
                    {editingRecord.clientName} • {editingRecord.month} ({editingRecord.financialYear})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form Body */}
            <div className="p-6 space-y-4">
              {/* Return Type Toggle */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Return Form</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['GSTR-3B', 'GSTR-1'] as const).map(rt => (
                    <button
                      key={rt}
                      type="button"
                      onClick={() => setFormReturnType(rt)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                        formReturnType === rt
                          ? 'bg-purple-50 border-purple-500 text-purple-700 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {rt === 'GSTR-3B' ? 'GSTR-3B (Tax Return)' : 'GSTR-1 (Outward Sales)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status Select */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Filing Status</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-purple-500"
                >
                  <option value="FILED_ON_TIME">Filed On Time</option>
                  <option value="FILED_LATE">Filed with Delay (Late Fee)</option>
                  <option value="PENDING">Pending (Not Filed)</option>
                  <option value="OVERDUE">Overdue (Past Statutory Due Date)</option>
                  <option value="READY_TO_FILE">Ready to File (Reconciled)</option>
                  <option value="NIL_FILED">NIL Return Filed</option>
                </select>
              </div>

              {/* ARN & Filing Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">ARN (15 Chars)</label>
                  <input
                    type="text"
                    placeholder="e.g. AA2709260012345"
                    value={formArn}
                    onChange={(e) => setFormArn(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono uppercase text-slate-900 outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Filing Date</label>
                  <input
                    type="date"
                    value={formFilingDate}
                    onChange={(e) => setFormFilingDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Cash Paid (for GSTR-3B) */}
              {formReturnType === 'GSTR-3B' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Net Cash Tax Paid (Form PMT-06 ₹)</label>
                  <input
                    type="number"
                    value={formCashPaid || ''}
                    onChange={(e) => setFormCashPaid(Number(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-purple-500"
                  />
                </div>
              )}

              {/* Office Workflow Stage */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Internal Office Workflow Stage</label>
                <select
                  value={formOfficeStage}
                  onChange={(e) => setFormOfficeStage(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-purple-500"
                >
                  <option value="NOT_STARTED">1. Not Started</option>
                  <option value="DATA_RECEIVED">2. Client Data Received</option>
                  <option value="RECONCILED">3. Reconciled &amp; Ready</option>
                  <option value="CHALLAN_GENERATED">4. Challan Generated / Paid</option>
                  <option value="FILED">5. Filed &amp; ARN Generated</option>
                </select>
              </div>

              {/* Remarks */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Auditor / CA Remarks</label>
                <textarea
                  rows={2}
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  placeholder="e.g. Challan payment made on 18th Oct, ARN received on WhatsApp"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 outline-none focus:border-purple-500 resize-none"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveFiling}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white transition-all shadow-md cursor-pointer"
              >
                Save Compliance Record
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
