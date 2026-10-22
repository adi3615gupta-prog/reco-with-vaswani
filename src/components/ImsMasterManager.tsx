import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Building2, Calendar, CheckCircle2, Clock, Download, ExternalLink,
  FileSpreadsheet, FileText, Filter, MessageSquare, RefreshCw,
  Search, Send, ShieldCheck, Sparkles, UploadCloud, Users, X,
  Check, AlertTriangle, ArrowUpDown, Eye, ArrowRight, Smartphone,
  Laptop, Globe, CheckCheck, FileJson, Key, EyeOff,
  Zap, Play, Pause, SkipForward, Square, FolderSearch, Loader2, Mail,
  Copy, Receipt, MapPin, Percent
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiBase, safeApiFetch } from '@/lib/api';
import {
  ImsInvoice, ImsBatchSummary, ImsOverallStats,
  parseGstnImsJson, generateImsClientReviewExcel,
  parseReturnedClientExcel, calculate3BTable4FromIms,
  ClientCredentialRecord, generateCredentialsTemplateExcel,
  parseCredentialsImportExcel
} from '@/lib/imsEngine';
import { GSTR3BMonthKey, GSTR3B_MONTHS, GSTR3BAnnualWorking } from '@/lib/gstr3bEngine';

// ─── INDIAN GST STATE CODE MAPPING & INVOICE HELPERS ─────────────────────────
const GST_STATE_MAP: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory'
};

const getGstStateName = (pos?: string | number): string => {
  if (!pos) return 'N/A';
  const code = pos.toString().trim().padStart(2, '0');
  return GST_STATE_MAP[code] ? `${code} - ${GST_STATE_MAP[code]}` : `State ${code}`;
};

const getInvoiceTypeDetails = (typ?: string) => {
  const t = (typ || 'R').toUpperCase().trim();
  if (t === 'C' || t === 'CR' || t === 'CN') {
    return {
      label: 'Credit Note',
      sub: 'ITC Reversal',
      badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30'
    };
  }
  if (t === 'D' || t === 'DR' || t === 'DN') {
    return {
      label: 'Debit Note',
      sub: 'ITC Addition',
      badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30'
    };
  }
  if (t === 'SEZWP') {
    return {
      label: 'SEZ with Payment',
      sub: 'Import/SEZ ITC',
      badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30'
    };
  }
  if (t === 'SEZWOP') {
    return {
      label: 'SEZ without Payment',
      sub: 'Zero Rated',
      badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
    };
  }
  if (t === 'DE') {
    return {
      label: 'Deemed Export',
      sub: 'Deemed',
      badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    };
  }
  if (t === 'B2BA' || t === 'RN' || t === 'A') {
    return {
      label: 'Amended Invoice',
      sub: 'Amendment',
      badgeClass: 'bg-orange-500/15 text-orange-300 border-orange-500/30'
    };
  }
  return {
    label: 'Regular Tax Invoice',
    sub: 'B2B Standard',
    badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
  };
};

const formatSourcePeriod = (period?: string) => {
  if (!period) return '';
  const p = period.toString().trim();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (p.length === 6) {
    const m1 = parseInt(p.substring(0, 2), 10);
    const y1 = parseInt(p.substring(2, 6), 10);
    if (m1 >= 1 && m1 <= 12 && y1 > 2000) {
      return `${months[m1 - 1]} ${y1}`;
    }
    const y2 = parseInt(p.substring(0, 4), 10);
    const m2 = parseInt(p.substring(4, 6), 10);
    if (m2 >= 1 && m2 <= 12 && y2 > 2000) {
      return `${months[m2 - 1]} ${y2}`;
    }
  }
  return p;
};

interface ImsMasterManagerProps {
  selectedMonth: GSTR3BMonthKey;
  financialYear: string;
  onApplyTo3B?: (itc2b: { igst: number; cgst: number; sgst: number; cess: number; total: number }) => void;
  currentGstin?: string;
}

export default function ImsMasterManager({
  selectedMonth,
  financialYear,
  onApplyTo3B,
  currentGstin
}: ImsMasterManagerProps) {
  // Return Period Format - Extract 4-digit start year regardless of hyphen/space in FY (e.g. 2025-26 or 2025 26)
  const startYear = (financialYear || '2025-26').match(/\d{4}/)?.[0] || '2025';
  const activePeriod = `${selectedMonth} ${startYear}`;

  // State
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<ImsBatchSummary[]>([]);
  const [stats, setStats] = useState<ImsOverallStats>({
    totalClients: 0,
    syncedClients: 0,
    reviewedClients: 0,
    pendingClients: 0,
    pushedClients: 0,
    totalEligibleItc: 0
  });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'REVIEWED' | 'PUSHED' | 'NOT_SYNCED'>('ALL');
  const [selectedGstins, setSelectedGstins] = useState<Set<string>>(new Set());

  // Detail Modal State
  const [activeClientDetail, setActiveClientDetail] = useState<ImsBatchSummary | null>(null);
  const [detailInvoices, setDetailInvoices] = useState<ImsInvoice[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailActionFilter, setDetailActionFilter] = useState<'ALL' | 'ACCEPT' | 'REJECT' | 'PENDING' | 'NO_ACTION'>('ALL');
  const [detailSearch, setDetailSearch] = useState('');
  const [copiedGstin, setCopiedGstin] = useState<string | null>(null);
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [remarkInput, setRemarkInput] = useState('');

  // File Dropzone & Portal Modals
  const [showDropzoneModal, setShowDropzoneModal] = useState(false);
  const [showPortalModal, setShowPortalModal] = useState(false);
  const [portalGstin, setPortalGstin] = useState(currentGstin || '');
  const [portalUsername, setPortalUsername] = useState('');
  const [portalPassword, setPortalPassword] = useState('');
  const [portalConnecting, setPortalConnecting] = useState(false);
  const portalAbortRef = useRef<AbortController | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkExcelInputRef = useRef<HTMLInputElement>(null);

  // Credentials Vault State
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credentialsList, setCredentialsList] = useState<ClientCredentialRecord[]>([]);
  const [credentialsStats, setCredentialsStats] = useState({ total: 0, configured: 0, missing: 0 });
  const [credentialsSearch, setCredentialsSearch] = useState('');
  const [credentialsFilter, setCredentialsFilter] = useState<'ALL' | 'CONFIGURED' | 'MISSING'>('ALL');
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [editedCredentials, setEditedCredentials] = useState<Record<string, { portal_username: string; portal_password: string; phone?: string; trade_name?: string }>>({});
  const credentialsExcelInputRef = useRef<HTMLInputElement>(null);

  // Sync portalGstin & credentials when currentGstin changes from parent
  useEffect(() => {
    if (currentGstin) {
      setPortalGstin(currentGstin);
      const match = credentialsList.find(c => c.gstin.toUpperCase() === currentGstin.toUpperCase());
      if (match) {
        if (match.portal_username) setPortalUsername(match.portal_username);
        if (match.portal_password) setPortalPassword(match.portal_password);
      }
    }
  }, [currentGstin, credentialsList]);

  // ─── BATCH MULTI-SYNC QUEUE STATE ───────────────────────────────────────────
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchQueue, setBatchQueue] = useState<Array<{
    gstin: string;
    trade_name: string;
    legal_name?: string;
    hasCreds: boolean;
    status: 'PENDING' | 'CONNECTING' | 'WAITING_CAPTCHA' | 'REQUESTED' | 'DOWNLOADING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
    invoiceCount?: number;
    error?: string;
    requestedAt?: number;
  }>>([]);
  const [batchPhase, setBatchPhase] = useState<'PHASE_1' | 'WAITING_20_MIN' | 'PHASE_2' | 'COMPLETE'>('PHASE_1');
  const [phase2CountdownSeconds, setPhase2CountdownSeconds] = useState<number | null>(null);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(-1);
  const [batchCountdown, setBatchCountdown] = useState<number | null>(null);
  const batchAbortRef = useRef<AbortController | null>(null);
  const [batchScanningDownloads, setBatchScanningDownloads] = useState(false);

  // ─── EMAIL BROADCAST & GMAIL SETTINGS STATE ──────────────────────────────────
  const [showEmailBroadcastModal, setShowEmailBroadcastModal] = useState(false);
  const [emailModalTab, setEmailModalTab] = useState<'BROADCAST' | 'GMAIL_CONFIG'>('BROADCAST');
  const [emailSettings, setEmailSettings] = useState({
    sender_name: '',
    sender_email: '',
    app_password: '',
    subject_template: 'Action Required: GST IMS Inward Invoices Review for {period} - {client_name}',
    firm_name: '',
    ca_phone: '',
    public_base_url: '',
    isConfigured: false
  });
  const [showAppPassword, setShowAppPassword] = useState(false);
  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [broadcastNote, setBroadcastNote] = useState('');
  const [broadcastTargetGstins, setBroadcastTargetGstins] = useState<string[]>([]);
  const [broadcastRunning, setBroadcastRunning] = useState(false);
  const [broadcastProgress, setBroadcastProgress] = useState<{
    total: number;
    sent: number;
    failed: number;
    missingEmail: number;
    noInvoices: number;
    results: Array<{ gstin: string; tradeName: string; email: string; invoiceCount?: number; status: string; error?: string }>;
  } | null>(null);
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [savingEmailSettings, setSavingEmailSettings] = useState(false);
  const [inlineEmailEdits, setInlineEmailEdits] = useState<Record<string, string>>({});

  // Real-time 1-second ticker for persistent timers across whole module
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format MM:SS countdown helper
  const formatCountdown = (totalSeconds: number | null) => {
    if (totalSeconds === null || totalSeconds <= 0) return '00:00';
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Dynamic calculation of remaining seconds out of 20 minutes (1200 seconds) based on true requestedAt
  const getClientWaitSecondsLeft = (requestedAt?: number): number => {
    if (!requestedAt) return 0;
    const elapsedMs = currentTime - requestedAt;
    const TOTAL_WAIT_MS = 20 * 60 * 1000;
    return Math.max(0, Math.ceil((TOTAL_WAIT_MS - elapsedMs) / 1000));
  };

  // Active waiting clients derived from live database and state
  const waitingClients = useMemo(() => {
    return clients.filter(c => c.status === 'REQUESTED_WAITING' || c.generation_status === 'REQUESTED');
  }, [clients]);

  const activeWaitingClients = useMemo(() => {
    return waitingClients.map(c => {
      const secLeft = getClientWaitSecondsLeft(c.generation_requested_at);
      return {
        ...c,
        secLeft,
        isReady: secLeft <= 0
      };
    });
  }, [waitingClients, currentTime]);

  const batchSecondsLeft = useMemo(() => {
    const pending = activeWaitingClients.filter(c => !c.isReady);
    if (pending.length === 0) return 0;
    return Math.max(...pending.map(c => c.secLeft));
  }, [activeWaitingClients]);

  const readyToDownloadCount = useMemo(() => {
    return activeWaitingClients.filter(c => c.isReady).length;
  }, [activeWaitingClients]);

  const stillWaitingCount = useMemo(() => {
    return activeWaitingClients.filter(c => !c.isReady).length;
  }, [activeWaitingClients]);

  // localStorage Queue Persistence Helpers
  const getStorageKey = (key: string) => `ims_${key}_${activePeriod.replace(/\s+/g, '_')}`;

  const saveBatchQueueToStorage = (queue: typeof batchQueue, phase: string) => {
    try {
      localStorage.setItem(getStorageKey('queue'), JSON.stringify(queue));
      localStorage.setItem(getStorageKey('phase'), phase);
    } catch {}
  };

  const loadBatchQueueFromStorage = () => {
    try {
      const rawQueue = localStorage.getItem(getStorageKey('queue'));
      const rawPhase = localStorage.getItem(getStorageKey('phase'));
      return {
        queue: rawQueue ? JSON.parse(rawQueue) : null,
        phase: rawPhase || null
      };
    } catch {
      return { queue: null, phase: null };
    }
  };

  // Persist queue and phase to localStorage whenever they change
  useEffect(() => {
    if (batchQueue.length > 0) {
      saveBatchQueueToStorage(batchQueue, batchPhase);
    }
  }, [batchQueue, batchPhase, activePeriod]);

  // ─── 1. FETCH MASTER SUMMARY ACROSS ALL 300+ CLIENTS ────────────────────────
  const fetchSummary = async () => {
    try {
      setLoading(true);
      const res = await safeApiFetch(`/api/ims/summary?period=${encodeURIComponent(activePeriod)}`);
      const data = await res.json();

      if (res.ok && data.success) {
        const fetchedClients: ImsBatchSummary[] = data.clients || [];
        setClients(fetchedClients);
        setStats(data.stats || {
          totalClients: fetchedClients.length,
          syncedClients: 0,
          reviewedClients: 0,
          pendingClients: 0,
          pushedClients: 0,
          totalEligibleItc: 0
        });

        // Reconcile saved batch queue from localStorage with DB state
        const { queue: savedQueue, phase: savedPhase } = loadBatchQueueFromStorage();
        const hasRequestedClients = fetchedClients.some(c => c.status === 'REQUESTED_WAITING' || c.generation_status === 'REQUESTED');

        if (hasRequestedClients && !isBatchRunning) {
          setBatchPhase('WAITING_20_MIN');
        } else if (savedPhase && !isBatchRunning) {
          setBatchPhase(savedPhase as any);
        }

        if (savedQueue && savedQueue.length > 0 && !isBatchRunning) {
          setBatchQueue(savedQueue.map((q: any) => {
            const matched = fetchedClients.find(c => c.gstin.toUpperCase() === q.gstin.toUpperCase());
            if (matched) {
              if (matched.status === 'SYNCED' || matched.status === 'REVIEWED' || matched.status === 'PUSHED_TO_3B') {
                return { ...q, status: 'SUCCESS', invoiceCount: matched.total_invoices || q.invoiceCount };
              } else if (matched.status === 'REQUESTED_WAITING' || matched.generation_status === 'REQUESTED') {
                return { ...q, status: 'REQUESTED', requestedAt: matched.generation_requested_at || q.requestedAt };
              }
            }
            return q;
          }));
        }
      }
    } catch (err) {
      toast.error('Failed to load IMS summary across clients.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    fetchCredentials();
    fetchEmailSettings();
  }, [activePeriod]);

  // Fetch Credentials Vault
  const fetchCredentials = async () => {
    try {
      const res = await safeApiFetch('/api/ims/credentials');
      const data = await res.json();
      if (res.ok && data.success) {
        setCredentialsList(data.clients || []);
        setCredentialsStats({
          total: data.total || 0,
          configured: data.configured || 0,
          missing: data.missing || 0
        });
      }
    } catch {
      // ignore
    }
  };

  // Download Excel Template pre-populated with existing clients
  const handleDownloadCredentialsTemplate = async () => {
    try {
      const toastId = toast.loading('Generating 300+ Clients Credentials Template...');
      const blob = await generateCredentialsTemplateExcel(credentialsList);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GST_Client_Credentials_Template_${financialYear}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Credentials Template Downloaded! Fill in usernames & passwords and import back.', { id: toastId });
    } catch {
      toast.error('Failed generating credentials template');
    }
  };

  // Import Credentials Excel
  const handleImportCredentialsExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading('Parsing credentials Excel file...');
    try {
      const records = await parseCredentialsImportExcel(file);
      if (records.length === 0) {
        toast.error('No valid client credential rows found.', { id: toastId });
        return;
      }

      const res = await safeApiFetch('/api/ims/credentials/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clients: records, deleteMissing: true })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.deletedCount > 0) {
          toast.success(`Synchronized ${data.importedCount} clients (${data.deletedCount} deleted, ${data.addedCount || 0} added, ${data.updatedCount || 0} updated)!`, { id: toastId });
        } else {
          toast.success(`Successfully saved credentials for ${data.importedCount} clients!`, { id: toastId });
        }
        fetchCredentials();
        fetchSummary();
      } else {
        toast.error(data.error || 'Failed importing credentials', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'Error parsing credentials Excel file', { id: toastId });
    } finally {
      if (credentialsExcelInputRef.current) credentialsExcelInputRef.current.value = '';
    }
  };

  // Save single client credential
  const handleSaveClientCredential = async (gstin: string) => {
    const edited = editedCredentials[gstin];
    if (!edited) return;

    try {
      const res = await safeApiFetch(`${getApiBase()}/api/ims/credentials/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin,
          portal_username: edited.portal_username,
          portal_password: edited.portal_password,
          phone: edited.phone,
          trade_name: edited.trade_name
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Saved credentials for ${gstin}`);
        setEditedCredentials(prev => {
          const next = { ...prev };
          delete next[gstin];
          return next;
        });
        fetchCredentials();
      }
    } catch {
      toast.error('Failed saving credential');
    }
  };

  // Auto-fill portal credentials when portalGstin changes
  const handleSelectPortalGstin = (gstin: string) => {
    setPortalGstin(gstin);
    const match = credentialsList.find(c => c.gstin.toUpperCase() === gstin.toUpperCase());
    if (match) {
      if (match.portal_username) setPortalUsername(match.portal_username);
      if (match.portal_password) setPortalPassword(match.portal_password);
    }
  };

  // ─── 2. SELECTION HELPERS ────────────────────────────────────────────────────
  const handleToggleSelect = (gstin: string) => {
    setSelectedGstins(prev => {
      const next = new Set(prev);
      if (next.has(gstin)) next.delete(gstin);
      else next.add(gstin);
      return next;
    });
  };

  const handleSelectAll = (selectAll: boolean) => {
    if (selectAll) {
      setSelectedGstins(new Set(filteredClients.map(c => c.gstin)));
    } else {
      setSelectedGstins(new Set());
    }
  };

  // ─── 3. FETCH INVOICE DETAILS FOR A CLIENT ──────────────────────────────────
  const handleOpenDetail = async (client: ImsBatchSummary) => {
    setActiveClientDetail(client);
    setDetailActionFilter('ALL');
    setDetailSearch('');
    setLoadingDetail(true);
    try {
      const res = await safeApiFetch(`${getApiBase()}/api/ims/invoices/${client.gstin}?period=${encodeURIComponent(activePeriod)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setDetailInvoices(data.invoices || []);
      }
    } catch {
      toast.error('Failed to load invoices for client.');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Instant single invoice action update (Accept, Reject, Pending, No Action)
  const handleSetInvoiceAction = async (invoiceId: string, newAction: 'ACCEPT' | 'REJECT' | 'PENDING' | 'NO_ACTION', remarks?: string) => {
    if (!activeClientDetail) return;
    setDetailInvoices(prev => prev.map(inv => {
      if (inv.id === invoiceId) {
        return { 
          ...inv, 
          action: newAction,
          client_remarks: remarks !== undefined ? remarks : inv.client_remarks
        };
      }
      return inv;
    }));

    try {
      await safeApiFetch(`${getApiBase()}/api/ims/update-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: activeClientDetail.gstin,
          period: activePeriod,
          updates: [{ id: invoiceId, action: newAction, remarks }]
        })
      });
      fetchSummary();
    } catch {
      toast.error('Failed saving decision to database.');
    }
  };

  // Save CA / Client inline invoice note/remark
  const handleSaveInvoiceRemark = async (invoiceId: string, remarkText: string) => {
    if (!activeClientDetail) return;
    const target = detailInvoices.find(i => i.id === invoiceId);
    const cleaned = remarkText.trim();

    setDetailInvoices(prev => prev.map(inv => {
      if (inv.id === invoiceId) {
        return { ...inv, client_remarks: cleaned };
      }
      return inv;
    }));
    setEditingRemarkId(null);

    try {
      await safeApiFetch(`${getApiBase()}/api/ims/update-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: activeClientDetail.gstin,
          period: activePeriod,
          updates: [{ id: invoiceId, action: target?.action || 'NO_ACTION', remarks: cleaned }]
        })
      });
      toast.success('Remark saved successfully');
      fetchSummary();
    } catch {
      toast.error('Failed saving remark');
    }
  };

  // 1-Click Copy GSTIN helper with visual feedback
  const handleCopyGstin = (gstinText: string) => {
    navigator.clipboard.writeText(gstinText);
    setCopiedGstin(gstinText);
    toast.success(`Copied GSTIN: ${gstinText}`);
    setTimeout(() => setCopiedGstin(null), 2000);
  };

  // Bulk set action for all currently filtered invoices
  const handleBulkSetFilteredAction = async (newAction: 'ACCEPT' | 'REJECT' | 'PENDING' | 'NO_ACTION') => {
    if (!activeClientDetail || filteredDetailInvoices.length === 0) return;
    const idsToUpdate = new Set(filteredDetailInvoices.map(i => i.id));
    setDetailInvoices(prev => prev.map(inv => {
      if (idsToUpdate.has(inv.id)) {
        return { ...inv, action: newAction };
      }
      return inv;
    }));

    try {
      await safeApiFetch(`${getApiBase()}/api/ims/update-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: activeClientDetail.gstin,
          period: activePeriod,
          updates: Array.from(idsToUpdate).map(id => ({ id, action: newAction }))
        })
      });
      toast.success(`Updated ${idsToUpdate.size} invoices to ${newAction}!`);
      fetchSummary();
    } catch {
      toast.error('Failed saving decisions in bulk.');
    }
  };

  const loadClientDetailByGstin = async (gstin: string) => {
    setLoadingDetail(true);
    try {
      const res = await safeApiFetch(`${getApiBase()}/api/ims/invoices/${gstin}?period=${encodeURIComponent(activePeriod)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setDetailInvoices(data.invoices || []);
        const matched = clients.find(c => c.gstin.toUpperCase() === gstin.toUpperCase());
        setActiveClientDetail(matched || ({
          client_gstin: gstin,
          gstin: gstin,
          trade_name: gstin,
          return_period: activePeriod,
          total_invoices: data.invoices?.length || 0,
          accepted_count: data.invoices?.filter((i: any) => i.action === 'ACCEPT').length || 0,
          rejected_count: data.invoices?.filter((i: any) => i.action === 'REJECT').length || 0,
          pending_count: data.invoices?.filter((i: any) => i.action === 'PENDING').length || 0,
          no_action_count: data.invoices?.filter((i: any) => i.action === 'NO_ACTION').length || 0,
          eligible_itc_total: 0,
          status: 'SYNCED'
        } as unknown as ImsBatchSummary));
      }
    } catch {
      toast.error('Failed to load invoices for client.');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Compute breakdown stats for active client modal with full gross invoice values
  const modalStats = useMemo(() => {
    let totalTaxable = 0, totalGst = 0, totalInvoiceVal = 0;
    let acceptedCount = 0, acceptedGst = 0, acceptedVal = 0;
    let rejectedCount = 0, rejectedGst = 0, rejectedVal = 0;
    let pendingCount = 0, pendingGst = 0, pendingVal = 0;
    let noActionCount = 0, noActionGst = 0, noActionVal = 0;

    for (const inv of detailInvoices) {
      const igst = Number(inv.igst) || 0;
      const cgst = Number(inv.cgst) || 0;
      const sgst = Number(inv.sgst) || 0;
      const cess = Number(inv.cess) || 0;
      const gst = igst + cgst + sgst + cess;
      const tx = Number(inv.txval) || 0;
      const gross = Number(inv.total_val) > 0 ? Number(inv.total_val) : (tx + gst);

      const isCdn = (inv.inv_typ || '').toUpperCase() === 'C' || (inv.inv_typ || '').toUpperCase() === 'CR' || (inv.source || '').toUpperCase().includes('CDNR');

      totalTaxable += tx;
      totalGst += gst;
      totalInvoiceVal += gross;

      const act = (inv.action || 'NO_ACTION').toUpperCase();
      if (act === 'ACCEPT') {
        acceptedCount++;
        if (isCdn) {
          acceptedGst = Math.max(0, acceptedGst - gst);
          acceptedVal -= gross;
        } else {
          acceptedGst += gst;
          acceptedVal += gross;
        }
      } else if (act === 'REJECT') {
        rejectedCount++;
        rejectedGst += gst;
        rejectedVal += gross;
      } else if (act === 'PENDING') {
        pendingCount++;
        pendingGst += gst;
        pendingVal += gross;
      } else {
        noActionCount++;
        noActionGst += gst;
        noActionVal += gross;
      }
    }

    const decidedCount = acceptedCount + rejectedCount + pendingCount;
    const progressPct = detailInvoices.length > 0 ? Math.round((decidedCount / detailInvoices.length) * 100) : 0;

    return {
      totalCount: detailInvoices.length,
      totalTaxable,
      totalGst,
      totalInvoiceVal,
      acceptedCount,
      acceptedGst,
      acceptedVal,
      rejectedCount,
      rejectedGst,
      rejectedVal,
      pendingCount,
      pendingGst,
      pendingVal,
      noActionCount,
      noActionGst,
      noActionVal,
      decidedCount,
      progressPct
    };
  }, [detailInvoices]);

  // Filter detail invoices by action tab and search term across all details
  const filteredDetailInvoices = useMemo(() => {
    return detailInvoices.filter(inv => {
      const act = (inv.action || 'NO_ACTION').toUpperCase();
      if (detailActionFilter !== 'ALL' && act !== detailActionFilter) return false;
      if (detailSearch.trim()) {
        const q = detailSearch.trim().toLowerCase();
        const sName = (inv.supplier_name || '').toLowerCase();
        const inum = (inv.inum || '').toLowerCase();
        const ctin = (inv.ctin || '').toLowerCase();
        const pos = (inv.pos || '').toLowerCase();
        const txval = (inv.txval || '').toString();
        const remarks = (inv.client_remarks || '').toLowerCase();
        return sName.includes(q) || inum.includes(q) || ctin.includes(q) || pos.includes(q) || txval.includes(q) || remarks.includes(q);
      }
      return true;
    });
  }, [detailInvoices, detailActionFilter, detailSearch]);

  // ─── 4. GENERATE & BROADCAST REVIEW LINKS ───────────────────────────────────
  const handleGenerateReviewLinks = async (targetGstins?: string[]) => {
    const list = targetGstins || (selectedGstins.size > 0 ? Array.from(selectedGstins) : clients.map(c => c.gstin));
    if (list.length === 0) {
      toast.error('No clients selected.');
      return;
    }

    const toastId = toast.loading(`Generating secure review links for ${list.length} clients...`);
    try {
      const res = await safeApiFetch(`${getApiBase()}/api/ims/generate-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period: activePeriod,
          gstins: list
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Generated ${data.count} secure review links!`, { id: toastId });
        fetchSummary();
        return data.tokens;
      } else {
        toast.error(data.error || 'Failed to generate review links', { id: toastId });
      }
    } catch {
      toast.error('Network error generating tokens', { id: toastId });
    }
  };

  // Dispatch via WhatsApp Web
  const handleSendWhatsApp = (client: ImsBatchSummary) => {
    const token = client.active_token;
    const phone = client.phone ? client.phone.replace(/[^0-9]/g, '') : '';
    const formattedPhone = phone.startsWith('91') ? phone : `91${phone}`;

    const reviewUrl = `${window.location.origin}/#/ims-review/${token}`;
    const msg = encodeURIComponent(
      `Dear ${client.trade_name || 'Taxpayer'},\n\n` +
      `Your GST Inward Invoices for ${activePeriod} (${client.total_invoices || 0} bills, Eligible ITC: ₹${Math.round(client.eligible_itc_total || 0).toLocaleString('en-IN')}) are ready for your review in the Invoice Management System (IMS).\n\n` +
      `Please click the link below to mark your decisions (Accept, Reject, or Pending) before the 13th:\n` +
      `${reviewUrl}\n\n` +
      `— Sourav Vaswani & Co.`
    );

    const waUrl = phone.length >= 10
      ? `https://wa.me/${formattedPhone}?text=${msg}`
      : `https://web.whatsapp.com/send?text=${msg}`;

    window.open(waUrl, '_blank');
  };

  // ─── 4B. EMAIL BROADCAST & GMAIL AUTOMATION HANDLERS ─────────────────────────
  const fetchEmailSettings = async () => {
    try {
      const res = await safeApiFetch(`${getApiBase()}/api/ims/email-settings`);
      const data = await res.json();
      if (res.ok && data.success) {
        setEmailSettings({
          ...data.settings,
          isConfigured: data.isConfigured
        });
        if (data.settings?.sender_email && !testEmailRecipient) {
          setTestEmailRecipient(data.settings.sender_email);
        }
      }
    } catch {}
  };

  const handleSaveEmailSettings = async () => {
    if (!emailSettings.sender_email?.includes('@')) {
      toast.error('Please enter a valid Gmail address.');
      return;
    }
    if (!emailSettings.app_password?.trim()) {
      toast.error('Please enter your 16-character Google App Password.');
      return;
    }

    setSavingEmailSettings(true);
    try {
      const res = await safeApiFetch(`${getApiBase()}/api/ims/email-settings/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailSettings)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Gmail SMTP settings saved successfully!');
        setEmailSettings(prev => ({ ...prev, isConfigured: true }));
      } else {
        toast.error(data.error || 'Failed saving settings');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving settings');
    } finally {
      setSavingEmailSettings(false);
    }
  };

  const handleTestEmailConnection = async () => {
    if (!emailSettings.sender_email || !emailSettings.app_password) {
      toast.error('Please provide Sender Gmail and 16-character App Password first.');
      return;
    }

    setIsTestingEmail(true);
    const toastId = toast.loading('Testing connection to Google Gmail SMTP...');
    try {
      const res = await safeApiFetch(`${getApiBase()}/api/ims/email-settings/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_email: emailSettings.sender_email,
          app_password: emailSettings.app_password,
          sender_name: emailSettings.sender_name || emailSettings.firm_name,
          test_recipient: testEmailRecipient || emailSettings.sender_email
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Gmail SMTP connected & test email delivered!', { id: toastId });
        setEmailSettings(prev => ({ ...prev, isConfigured: true }));
      } else {
        toast.error(data.error || 'Connection failed', { id: toastId, duration: 6000 });
      }
    } catch (err: any) {
      toast.error(err.message || 'SMTP connection error', { id: toastId });
    } finally {
      setIsTestingEmail(false);
    }
  };

  const handleQuickUpdateClientEmail = async (gstin: string, newEmail: string) => {
    if (!newEmail?.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    try {
      const res = await safeApiFetch(`${getApiBase()}/api/ims/client-email/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gstin, email: newEmail })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Updated email for ${gstin}`);
        setClients(prev => prev.map(c => c.gstin === gstin ? { ...c, email: newEmail } : c));
        setInlineEmailEdits(prev => {
          const next = { ...prev };
          delete next[gstin];
          return next;
        });
      } else {
        toast.error(data.error || 'Failed updating email');
      }
    } catch {
      toast.error('Network error updating email');
    }
  };

  const handleOpenEmailBroadcast = (targetGstins?: string[]) => {
    fetchEmailSettings();
    const list = targetGstins || (selectedGstins.size > 0 ? Array.from(selectedGstins) : []);
    setBroadcastTargetGstins(list);
    setBroadcastSubject(`Action Required: GST IMS Inward Invoices Review for ${activePeriod} - {client_name}`);
    setBroadcastProgress(null);
    setShowEmailBroadcastModal(true);
    if (!emailSettings.isConfigured) {
      setEmailModalTab('GMAIL_CONFIG');
    } else {
      setEmailModalTab('BROADCAST');
    }
  };

  const handleRunEmailBroadcast = async () => {
    if (!emailSettings.isConfigured && (!emailSettings.sender_email || !emailSettings.app_password)) {
      toast.error('Please configure your Gmail account and Google App Password in the Settings tab first.');
      setEmailModalTab('GMAIL_CONFIG');
      return;
    }

    setBroadcastRunning(true);
    const toastId = toast.loading(`Dispatching IMS Review Emails with Excel sheets for ${activePeriod}...`);
    try {
      const res = await safeApiFetch(`${getApiBase()}/api/ims/broadcast-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period: activePeriod,
          gstins: broadcastTargetGstins.length > 0 ? broadcastTargetGstins : undefined,
          customSubject: broadcastSubject || undefined,
          customNote: broadcastNote || undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || `Broadcast completed! Sent ${data.sent} email(s).`, { id: toastId });
        setBroadcastProgress(data);
        fetchSummary();
      } else {
        toast.error(data.error || 'Broadcast failed', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'Network error during broadcast', { id: toastId });
    } finally {
      setBroadcastRunning(false);
    }
  };

  const handleOpenSingleClientEmail = (client: ImsBatchSummary) => {
    handleOpenEmailBroadcast([client.gstin]);
  };

  // ─── 5. EXPORT CLIENT REVIEW EXCEL (SINGLE OR BATCH) ────────────────────────
  const handleExportClientExcel = async (client: ImsBatchSummary) => {
    try {
      const toastId = toast.loading(`Generating Excel Review Sheet for ${client.trade_name}...`);
      const res = await safeApiFetch(`${getApiBase()}/api/ims/invoices/${client.gstin}?period=${encodeURIComponent(activePeriod)}`);
      const data = await res.json();

      if (!res.ok || !data.success || !data.invoices || data.invoices.length === 0) {
        toast.error('No invoice records found for this client to export.', { id: toastId });
        return;
      }

      const blob = await generateImsClientReviewExcel(
        { gstin: client.gstin, tradeName: client.trade_name, period: activePeriod },
        data.invoices
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IMS_Review_${client.gstin}_${activePeriod.replace(/\s+/g, '_')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel Review Sheet Exported!', { id: toastId });
    } catch {
      toast.error('Failed to export Excel.');
    }
  };

  // ─── 6. IMPORT RETURNED CLIENT EXCEL ────────────────────────────────────────
  const handleImportReturnedExcel = async (e: React.ChangeEvent<HTMLInputElement>, targetClient?: ImsBatchSummary) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading('Parsing client Excel review decisions...');
    try {
      const decisions = await parseReturnedClientExcel(file);
      if (decisions.length === 0) {
        toast.error('No decisions found in the Excel sheet.', { id: toastId });
        return;
      }

      const clientGstin = targetClient?.gstin || decisions[0].ctin || currentGstin;
      if (!clientGstin) {
        toast.error('Could not identify target client GSTIN for this file.', { id: toastId });
        return;
      }

      // Fetch existing invoices to match IDs
      const invRes = await safeApiFetch(`${getApiBase()}/api/ims/invoices/${clientGstin}?period=${encodeURIComponent(activePeriod)}`);
      const invData = await invRes.json();
      const existingInvoices: ImsInvoice[] = invData.invoices || [];

      const updates: { id: string; action: string; remarks: string }[] = [];
      decisions.forEach(d => {
        const match = existingInvoices.find(ex => ex.inum === d.inum);
        if (match) {
          updates.push({
            id: match.id,
            action: d.action,
            remarks: d.remarks
          });
        }
      });

      if (updates.length === 0) {
        toast.error('No matching invoice numbers found in this client batch.', { id: toastId });
        return;
      }

      // Post updates
      const updateRes = await safeApiFetch(`${getApiBase()}/api/ims/update-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: clientGstin,
          period: activePeriod,
          updates
        })
      });

      const updateData = await updateRes.json();
      if (updateRes.ok && updateData.success) {
        toast.success(`Successfully imported ${updates.length} client decisions!`, { id: toastId });
        fetchSummary();
        if (activeClientDetail) handleOpenDetail(activeClientDetail);
      } else {
        toast.error(updateData.error || 'Failed to update decisions', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'Error parsing Excel sheet', { id: toastId });
    } finally {
      if (bulkExcelInputRef.current) bulkExcelInputRef.current.value = '';
    }
  };

  // ─── 7. OFFLINE FILE DROPZONE (ZIP / EXCEL / JSON UPLOAD) ───────────────────
  const handleDropzoneUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const toastId = toast.loading(`Parsing ${files.length} IMS file(s)...`);
    try {
      const clientsData: { gstin: string; invoices: ImsInvoice[] }[] = [];
      const uploadedGstins: string[] = [];
      let successCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const lower = file.name.toLowerCase();

        if (lower.endsWith('.zip') || lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
          // Direct archive upload (ZIP or Excel)
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const res = reader.result as string;
              resolve(res.split(',')[1] || res);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          const fileBase64 = await base64Promise;
          const detectedGstin = (file.name.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/) || [])[0] || currentGstin || '';

          const res = await safeApiFetch(`${getApiBase()}/api/ims/upload-archive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileBase64,
              fileName: file.name,
              gstin: detectedGstin,
              period: activePeriod
            })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            successCount++;
            if (data.gstin && !uploadedGstins.includes(data.gstin)) uploadedGstins.push(data.gstin);
          } else {
            toast.error(`Error in ${file.name}: ${data.error || 'Failed'}`);
          }
        } else if (lower.endsWith('.json')) {
          const text = await file.text();
          const json = JSON.parse(text);
          const gstin = json.gstin || (file.name.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/) || [])[0] || currentGstin || '';
          if (gstin) {
            const parsed = parseGstnImsJson(json, gstin, activePeriod);
            clientsData.push({ gstin, invoices: parsed });
            if (!uploadedGstins.includes(gstin)) uploadedGstins.push(gstin);
          }
        }
      }

      if (clientsData.length > 0) {
        const res = await safeApiFetch(`${getApiBase()}/api/ims/batch-ingest-multi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            period: activePeriod,
            clientsData
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          successCount += clientsData.length;
        } else {
          toast.error(data.error || 'Failed bulk ingestion', { id: toastId });
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully loaded ${successCount} IMS file(s) into system!`, { id: toastId });
        setShowDropzoneModal(false);
        await fetchSummary();
        if (uploadedGstins.length === 1) {
          loadClientDetailByGstin(uploadedGstins[0]);
        }
      } else {
        toast.error('No valid records were imported from the selected files.', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'Error reading files', { id: toastId });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ─── 8. PUSH APPROVED 2B ITC TO GSTR-3B TABLE 4 ─────────────────────────────
  const handlePushTo3B = async (client: ImsBatchSummary) => {
    try {
      const toastId = toast.loading(`Pushing Eligible ITC to GSTR-3B Table 4 for ${client.trade_name}...`);
      const res = await safeApiFetch(`${getApiBase()}/api/ims/push-to-3b`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: client.gstin,
          period: activePeriod
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Pushed ₹${data.itc2b.total.toLocaleString('en-IN')} net ITC to 3B Table 4!`, { id: toastId });
        if (onApplyTo3B) {
          onApplyTo3B(data.itc2b, data.rcmInward, data.creditNotes, data.importGoods);
        }
        fetchSummary();
      } else {
        toast.error(data.error || 'Failed pushing to 3B', { id: toastId });
      }
    } catch {
      toast.error('Network error updating 3B Table 4.');
    }
  };

  // ─── 9. EXPORT OFFICIAL GSTN IMS ACTION JSON ────────────────────────────────
  const handleExportPortalJson = async (client: ImsBatchSummary) => {
    try {
      const toastId = toast.loading('Generating GSTN IMS Action payload...');
      const res = await safeApiFetch(`/api/ims/portal-action-payload/${client.gstin}?period=${encodeURIComponent(activePeriod)}`);
      const data = await res.json();

      let payload = data.payload;
      if (!payload || !payload.invdata) {
        payload = {
          rtin: client.gstin,
          reqtyp: 'SAVE',
          invdata: {
            b2b: detailInvoices.map(inv => {
              let act = 'N';
              const a = (inv.action || '').toUpperCase();
              if (a === 'ACCEPT' || a === 'A') act = 'A';
              else if (a === 'REJECT' || a === 'R') act = 'R';
              else if (a === 'PENDING' || a === 'P') act = 'P';
              const rec: any = {
                stin: inv.ctin,
                inum: String(inv.inum || ''),
                inv_typ: inv.inv_typ || 'R',
                idt: String(inv.idt || '').replace(/\//g, '-'),
                val: Math.round(Number(inv.total_val || 0) * 100) / 100,
                action: act,
                pos: String(inv.pos || '27'),
                txval: Math.round(Number(inv.txval || 0) * 100) / 100,
                iamt: Math.round(Number(inv.igst || 0) * 100) / 100,
                camt: Math.round(Number(inv.cgst || 0) * 100) / 100,
                samt: Math.round(Number(inv.sgst || 0) * 100) / 100,
                cess: Math.round(Number(inv.cess || 0) * 100) / 100,
                srcform: inv.source || 'R1',
                rtnprd: String(inv.source_period || '092026'),
                srcfilstatus: 'Filed',
                ispendactblocked: 'N',
                isRemarksBlocked: 'N'
              };
              if (inv.isEdit === 'Y') rec.isEdit = 'Y';
              if (inv.client_remarks && inv.client_remarks !== 'NA') rec.remarks = inv.client_remarks;
              return rec;
            })
          }
        };
      }

      if (res.ok && (data.success || payload)) {
        const jsonStr = JSON.stringify(payload, null, 3);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename || `IMS_Output_JSON.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Official IMS JSON exported with ${detailInvoices.length} decisions!`, { id: toastId });
      } else {
        toast.error(data.error || 'Failed generating action payload', { id: toastId });
      }
    } catch {
      toast.error('Error generating portal JSON.');
    }
  };

  // ─── 10. ASSISTED GST PORTAL IMS DOWNLOAD (LIVE PLAYWRIGHT) ───────────────────
  const handleLaunchPortalLogin = async () => {
    if (!portalGstin) {
      toast.error('Please enter or select a GSTIN.');
      return;
    }

    const controller = new AbortController();
    portalAbortRef.current = controller;
    setPortalConnecting(true);

    const toastId = toast.loading('Opening Chrome / Chromium for GST Portal IMS...', {
      description: 'Auto-filled credentials. Click Chrome on taskbar if minimized. Enter visual CAPTCHA & hit Login.'
    });

    try {
      const targetClient = clients.find(c => c.gstin.toUpperCase() === portalGstin.toUpperCase());
      const isTargetPhase2 = targetClient?.status === 'REQUESTED_WAITING' || targetClient?.generation_status === 'REQUESTED';

      const res = await safeApiFetch(`${getApiBase()}/api/ims/portal-sync-browser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          gstin: portalGstin,
          username: portalUsername,
          password: portalPassword,
          period: activePeriod,
          fy: financialYear,
          phase: isTargetPhase2 ? 'PHASE_2' : 'PHASE_1'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.phaseResult === 'REQUESTED') {
          const reqTime = data.requestedAt || Date.now();
          toast.info(`⏳ File generation requested for ${portalGstin}! The GST Portal takes ~20 minutes. Status & countdown saved to dashboard.`, { id: toastId });
          setClients(prev => prev.map(c => c.gstin.toUpperCase() === portalGstin.toUpperCase() ? {
            ...c,
            status: 'REQUESTED_WAITING',
            generation_status: 'REQUESTED',
            generation_requested_at: reqTime
          } : c));
          setBatchPhase('WAITING_20_MIN');
        } else if (data.phaseResult === 'NO_RECORDS' || data.noRecordsWarning || data.warning) {
          toast.warning(data.message || 'The JSON file cannot be generated as no records are available in IMS to download.', { id: toastId, duration: 8000 });
        } else {
          toast.success(data.message || `Successfully synced ${data.invoiceCount} invoices for ${portalGstin}!`, { id: toastId });
        }
        setShowPortalModal(false);
        fetchSummary();
        if (portalGstin) {
          loadClientDetailByGstin(portalGstin);
        }
      } else {
        toast.error(data.error || 'Failed to sync from GST Portal.', { id: toastId });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        toast.info('Browser session cancelled.', { id: toastId });
      } else {
        toast.error(err.message || 'Network error communicating with portal automation service.', { id: toastId });
      }
    } finally {
      setPortalConnecting(false);
      portalAbortRef.current = null;
    }
  };

  const handleOpenPortalSync = async (gstin: string, forcePhase?: 'PHASE_1' | 'PHASE_2', forceFresh: boolean = false) => {
    const client = clients.find(c => c.gstin.toUpperCase() === gstin.toUpperCase());
    const cred = credentialsList.find(c => c.gstin.toUpperCase() === gstin.toUpperCase());
    const username = cred?.portal_username || '';
    const password = cred?.portal_password || '';
    const isPhase2 = forcePhase === 'PHASE_2' || (!forcePhase && !forceFresh && (client?.status === 'REQUESTED_WAITING' || client?.generation_status === 'REQUESTED'));

    const controller = new AbortController();
    portalAbortRef.current = controller;
    setPortalConnecting(true);

    const toastId = toast.loading(
      isPhase2 
        ? `[Phase 2] Collecting ready IMS download for ${client?.trade_name || gstin}...` 
        : `[Phase 1] Opening Chrome for fresh generation request: ${client?.trade_name || gstin}...`,
      { description: 'Auto-filled credentials. Enter visual CAPTCHA & hit Login.' }
    );

    try {
      const res = await safeApiFetch(`${getApiBase()}/api/ims/portal-sync-browser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          gstin,
          username,
          password,
          period: activePeriod,
          fy: financialYear,
          phase: isPhase2 ? 'PHASE_2' : 'PHASE_1',
          forceFresh: Boolean(forceFresh || forcePhase === 'PHASE_1')
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.phaseResult === 'REQUESTED') {
          const reqTime = data.requestedAt || Date.now();
          toast.info(`⏳ File generation requested for ${client?.trade_name || gstin}! Countdown active (~20 mins).`, { id: toastId });
          setClients(prev => prev.map(c => c.gstin.toUpperCase() === gstin.toUpperCase() ? {
            ...c,
            status: 'REQUESTED_WAITING',
            generation_status: 'REQUESTED',
            generation_requested_at: reqTime
          } : c));
          setBatchPhase('WAITING_20_MIN');
        } else if (data.phaseResult === 'NO_RECORDS' || data.noRecordsWarning || data.warning) {
          toast.warning(data.message || 'The JSON file cannot be generated as no records are available in IMS to download.', { id: toastId, duration: 8000 });
        } else {
          toast.success(data.message || `Successfully synced ${data.invoiceCount} invoices for ${client?.trade_name || gstin}!`, { id: toastId });
        }
        fetchSummary();
        loadClientDetailByGstin(gstin);
      } else {
        toast.error(data.error || 'Failed to sync from GST Portal.', { id: toastId });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        toast.info('Browser session cancelled.', { id: toastId });
      } else {
        toast.error(err.message || 'Network error communicating with portal automation service.', { id: toastId });
      }
    } finally {
      setPortalConnecting(false);
      portalAbortRef.current = null;
    }
  };

  const handleCancelPortalLogin = () => {
    if (portalAbortRef.current) {
      portalAbortRef.current.abort();
      portalAbortRef.current = null;
    }
    setPortalConnecting(false);
  };

  // ─── 11. 1-CLICK MULTI-SYNC QUEUE RUNNER ──────────────────────────────────
  const handleOpenBatchSync = (targetGstins?: string[]) => {
    let listToQueue: ImsBatchSummary[] = [];

    if (targetGstins && targetGstins.length > 0) {
      listToQueue = clients.filter(c => targetGstins.includes(c.gstin));
      if (listToQueue.length === 0) {
        listToQueue = credentialsList
          .filter(c => targetGstins.includes(c.gstin))
          .map(c => ({
            gstin: c.gstin,
            trade_name: c.trade_name,
            legal_name: c.legal_name,
            status: 'NOT_SYNCED',
            total_invoices: 0,
            accepted_count: 0,
            rejected_count: 0,
            pending_count: 0,
            no_action_count: 0,
            eligible_itc_igst: 0,
            eligible_itc_cgst: 0,
            eligible_itc_sgst: 0,
            eligible_itc_cess: 0,
            eligible_itc_total: 0
          }));
      }
    } else {
      // Prioritize clients with credentials configured, or all clients
      const configuredGstins = new Set(
        credentialsList.filter(c => c.portal_username && c.portal_password).map(c => c.gstin.toUpperCase())
      );
      listToQueue = clients.filter(c => configuredGstins.has(c.gstin.toUpperCase()));
      if (listToQueue.length === 0) {
        listToQueue = clients;
      }
    }

    const configuredSet = new Set(
      credentialsList.filter(c => c.portal_username && c.portal_password).map(c => c.gstin.toUpperCase())
    );

    // Non-destructive hydration: check saved queue from localStorage or state
    const { queue: savedQueue, phase: savedPhase } = loadBatchQueueFromStorage();
    const existingQueueMap = new Map((savedQueue || batchQueue).map((q: any) => [q.gstin.toUpperCase(), q]));

    const initialQueue = listToQueue.map(c => {
      const existing: any = existingQueueMap.get(c.gstin.toUpperCase());
      const isRequestedInDb = c.status === 'REQUESTED_WAITING' || c.generation_status === 'REQUESTED';
      const isSyncedInDb = c.status === 'SYNCED' || c.status === 'REVIEWED' || c.status === 'PUSHED_TO_3B';

      let status: any = 'PENDING';
      let requestedAt: number | undefined = undefined;

      if (isSyncedInDb) {
        status = 'SUCCESS';
      } else if (isRequestedInDb || existing?.status === 'REQUESTED') {
        status = 'REQUESTED';
        requestedAt = c.generation_requested_at || existing?.requestedAt || Date.now();
      } else if (existing?.status && existing.status !== 'CONNECTING' && existing.status !== 'DOWNLOADING' && existing.status !== 'SKIPPED') {
        status = existing.status;
        requestedAt = existing.requestedAt;
      }

      return {
        gstin: c.gstin,
        trade_name: c.trade_name || c.legal_name || c.gstin,
        legal_name: c.legal_name,
        hasCreds: configuredSet.has(c.gstin.toUpperCase()),
        status,
        requestedAt,
        invoiceCount: existing?.invoiceCount || c.total_invoices || 0,
        error: existing?.error
      };
    });

    setBatchQueue(initialQueue);
    setCurrentBatchIndex(-1);
    setIsBatchRunning(false);

    // Determine phase from live status
    const anyRequested = initialQueue.some(q => q.status === 'REQUESTED');
    const allDone = initialQueue.length > 0 && initialQueue.every(q => q.status === 'SUCCESS');

    if (anyRequested) {
      setBatchPhase('WAITING_20_MIN');
    } else if (allDone) {
      setBatchPhase('COMPLETE');
    } else if (savedPhase && savedPhase !== 'WAITING_20_MIN') {
      setBatchPhase(savedPhase as any);
    } else {
      setBatchPhase('PHASE_1');
    }

    setShowBatchModal(true);
  };

  const handleRunBatchSync = async (forceAll: boolean = false) => {
    if (isBatchRunning || batchQueue.length === 0) return;

    let updatedQueue = [...batchQueue];
    if (forceAll) {
      updatedQueue = updatedQueue.map(q => ({ ...q, status: 'PENDING' as const, error: undefined }));
      setBatchQueue(updatedQueue);
      saveBatchQueueToStorage(updatedQueue, 'PHASE_1');
      toast.info(`🔄 Starting fresh re-sync for all ${updatedQueue.length} clients...`);
    } else {
      const itemsToProcess = updatedQueue.filter(q => q.status !== 'SUCCESS');
      if (itemsToProcess.length === 0) {
        toast.info('All clients in queue are already synced! Use "Force Fresh Re-Sync" to re-download.');
        return;
      }
    }

    setIsBatchRunning(true);
    setBatchPhase('PHASE_1');

    for (let i = 0; i < updatedQueue.length; i++) {
      const item = updatedQueue[i];
      if (!forceAll && item.status === 'SUCCESS') continue; // Only skip already SUCCESS items if not forcing fresh!

      setCurrentBatchIndex(i);
      setBatchQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'CONNECTING', error: undefined } : q));

      const controller = new AbortController();
      batchAbortRef.current = controller;

      const toastId = toast.loading(`[Phase 1: ${i + 1}/${batchQueue.length}] Opening Chrome for ${item.trade_name}...`, {
        description: 'Auto-filled credentials. Click Chrome on taskbar if minimized. Enter visual CAPTCHA & hit Login.'
      });

      try {
        const cred = credentialsList.find(c => c.gstin.toUpperCase() === item.gstin.toUpperCase());
        const username = cred?.portal_username || '';
        const password = cred?.portal_password || '';

        const res = await safeApiFetch(`${getApiBase()}/api/ims/portal-sync-browser`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            gstin: item.gstin,
            username,
            password,
            period: activePeriod,
            fy: financialYear,
            phase: 'PHASE_1',
            forceFresh: forceAll
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          if (data.phaseResult === 'REQUESTED') {
            const reqTime = data.requestedAt || Date.now();
            updatedQueue[i] = { ...updatedQueue[i], status: 'REQUESTED', requestedAt: reqTime };
            setBatchQueue(prev => prev.map((q, idx) => idx === i ? {
              ...q,
              status: 'REQUESTED',
              requestedAt: reqTime
            } : q));
            toast.info(`⏳ File generation requested for ${item.trade_name} (~20m wait on GST Portal). Advancing to next client...`, { id: toastId });
          } else {
            updatedQueue[i] = { ...updatedQueue[i], status: 'SUCCESS', invoiceCount: data.invoiceCount || 0 };
            setBatchQueue(prev => prev.map((q, idx) => idx === i ? {
              ...q,
              status: 'SUCCESS',
              invoiceCount: data.invoiceCount || 0
            } : q));
            if (data.phaseResult === 'NO_RECORDS' || data.noRecordsWarning || data.warning) {
              toast.warning(`Notice for ${item.trade_name}: ${data.message || 'The JSON file cannot be generated as no records are available in IMS to download.'}`, { id: toastId, duration: 8000 });
            } else {
              toast.success(`✓ Synced ${item.trade_name} (${data.invoiceCount || 0} invoices)!`, { id: toastId });
            }
          }
          fetchSummary();
        } else {
          updatedQueue[i] = { ...updatedQueue[i], status: 'FAILED', error: data.error || 'Failed' };
          setBatchQueue(prev => prev.map((q, idx) => idx === i ? {
            ...q,
            status: 'FAILED',
            error: data.error || 'Failed'
          } : q));
          toast.error(`Error syncing ${item.trade_name}: ${data.error || 'Failed'}`, { id: toastId });
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          updatedQueue[i] = { ...updatedQueue[i], status: 'SKIPPED', error: 'Skipped by user' };
          setBatchQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'SKIPPED', error: 'Skipped by user' } : q));
          toast.info(`Skipped ${item.trade_name}.`, { id: toastId });
        } else {
          updatedQueue[i] = { ...updatedQueue[i], status: 'FAILED', error: err.message || 'Network error' };
          setBatchQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'FAILED', error: err.message || 'Network error' } : q));
        }
      } finally {
        batchAbortRef.current = null;
      }

      // Transition countdown before next client
      if (i < batchQueue.length - 1) {
        setBatchCountdown(2);
        await new Promise(r => setTimeout(r, 1000));
        setBatchCountdown(1);
        await new Promise(r => setTimeout(r, 1000));
        setBatchCountdown(null);
      }
    }

    setIsBatchRunning(false);
    setCurrentBatchIndex(-1);

    // Evaluate Phase 1 results
    const requestedClients = updatedQueue.filter(q => q.status === 'REQUESTED');
    if (requestedClients.length > 0) {
      setBatchPhase('WAITING_20_MIN');
      saveBatchQueueToStorage(updatedQueue, 'WAITING_20_MIN');
      toast.success(`🎉 Phase 1 Complete! All ${requestedClients.length} generation requests submitted. 20-minute countdown active for Phase 2!`);
    } else {
      setBatchPhase('COMPLETE');
      saveBatchQueueToStorage(updatedQueue, 'COMPLETE');
      toast.success('🎉 Batch sync queue complete! Master grid updated.');
    }
    fetchSummary();
  };

  const handleRunPhase2Queue = async () => {
    if (isBatchRunning) return;

    // Ensure queueToUse contains requested clients even if modal wasn't opened prior
    let queueToUse = [...batchQueue];
    if (queueToUse.length === 0 || !queueToUse.some(q => q.status === 'REQUESTED')) {
      const waiting = clients.filter(c => c.status === 'REQUESTED_WAITING' || c.generation_status === 'REQUESTED');
      if (waiting.length > 0) {
        queueToUse = waiting.map(c => ({
          gstin: c.gstin,
          trade_name: c.trade_name || c.legal_name || c.gstin,
          legal_name: c.legal_name,
          hasCreds: Boolean(credentialsList.find(cr => cr.gstin.toUpperCase() === c.gstin.toUpperCase())?.portal_password),
          status: 'REQUESTED' as const,
          requestedAt: c.generation_requested_at || Date.now()
        }));
        setBatchQueue(queueToUse);
      }
    }

    const requestedIndices = queueToUse
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item.status === 'REQUESTED');

    if (requestedIndices.length === 0) {
      setBatchPhase('COMPLETE');
      toast.success('🎉 All clients are already synced!');
      return;
    }

    setBatchPhase('PHASE_2');
    setIsBatchRunning(true);
    setShowBatchModal(true);

    toast.info(`🚀 Starting Phase 2: Grabbing generated files for ${requestedIndices.length} clients!`);

    for (const { item, idx } of requestedIndices) {
      setCurrentBatchIndex(idx);
      setBatchQueue(prev => prev.map((q, i) => i === idx ? { ...q, status: 'DOWNLOADING', error: undefined } : q));

      const controller = new AbortController();
      batchAbortRef.current = controller;

      const toastId = toast.loading(`[Phase 2] Collecting IMS download for ${item.trade_name}...`, {
        description: 'Auto-filled credentials. Click Chrome on taskbar if minimized. Enter visual CAPTCHA & hit Login.'
      });

      try {
        const cred = credentialsList.find(c => c.gstin.toUpperCase() === item.gstin.toUpperCase());
        const username = cred?.portal_username || '';
        const password = cred?.portal_password || '';

        const res = await safeApiFetch(`${getApiBase()}/api/ims/portal-sync-browser`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            gstin: item.gstin,
            username,
            password,
            period: activePeriod,
            fy: financialYear,
            phase: 'PHASE_2'
          })
        });

        const data = await res.json();
        if (res.ok && data.success && (data.phaseResult === 'DOWNLOADED' || data.phaseResult === 'NO_RECORDS' || data.invoiceCount >= 0)) {
          setBatchQueue(prev => prev.map((q, i) => i === idx ? {
            ...q,
            status: 'SUCCESS',
            invoiceCount: data.invoiceCount || 0
          } : q));
          if (data.phaseResult === 'NO_RECORDS' || data.noRecordsWarning || data.warning) {
            toast.warning(`Notice for ${item.trade_name}: ${data.message || 'The JSON file cannot be generated as no records are available in IMS to download.'}`, { id: toastId, duration: 8000 });
          } else {
            toast.success(`✓ Downloaded ${item.trade_name} (${data.invoiceCount || 0} invoices)!`, { id: toastId });
          }
          fetchSummary();
        } else if (res.ok && data.success && data.phaseResult === 'REQUESTED') {
          toast.warning(`GST portal still processing for ${item.trade_name}. You can retry shortly.`, { id: toastId });
        } else {
          setBatchQueue(prev => prev.map((q, i) => i === idx ? {
            ...q,
            status: 'FAILED',
            error: data.error || 'Failed'
          } : q));
          toast.error(`Error downloading ${item.trade_name}: ${data.error || 'Failed'}`, { id: toastId });
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setBatchQueue(prev => prev.map((q, i) => i === idx ? { ...q, status: 'SKIPPED', error: 'Skipped by user' } : q));
        } else {
          setBatchQueue(prev => prev.map((q, i) => i === idx ? { ...q, status: 'FAILED', error: err.message || 'Network error' } : q));
        }
      } finally {
        batchAbortRef.current = null;
      }

      await new Promise(r => setTimeout(r, 1500));
    }

    setIsBatchRunning(false);
    setCurrentBatchIndex(-1);
    setBatchPhase('COMPLETE');
    toast.success('🎉 Phase 2 Complete! All ready client files collected.');
    fetchSummary();
  };

  // ─── AUTO-LAUNCH PHASE 2 WHEN 20-MIN COUNTDOWN COMPLETES ────────────────────
  const phase2AutoLaunchedRef = useRef<boolean>(false);

  useEffect(() => {
    if (
      waitingClients.length > 0 &&
      stillWaitingCount === 0 &&
      !isBatchRunning &&
      !portalConnecting &&
      !phase2AutoLaunchedRef.current
    ) {
      phase2AutoLaunchedRef.current = true;
      toast.info('⏱️ 20-Minute waiting completed! Automatically launching Phase 2 to collect files...', {
        duration: 8000,
        description: 'Auto-launching Chromium window to download prepared IMS packages from GST Portal.'
      });
      handleRunPhase2Queue();
    }

    if (waitingClients.length === 0 || stillWaitingCount > 0) {
      phase2AutoLaunchedRef.current = false;
    }
  }, [waitingClients.length, stillWaitingCount, isBatchRunning, portalConnecting]);

  const handleResetWaiting = async (targetGstin?: string) => {
    try {
      const res = await safeApiFetch(`${getApiBase()}/api/ims/reset-generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period: activePeriod,
          gstin: targetGstin,
          all: !targetGstin
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        try {
          localStorage.removeItem(getStorageKey('queue'));
          localStorage.removeItem(getStorageKey('phase'));
        } catch {}
        setBatchQueue([]);
        setBatchPhase('PHASE_1');
        toast.success(targetGstin ? `Reset waiting status for ${targetGstin}` : 'Reset waiting status for all clients');
        fetchSummary();
      } else {
        toast.error(data.error || 'Failed to reset generation status');
      }
    } catch {
      toast.error('Network error resetting generation status');
    }
  };

  const handleSkipCurrentBatchItem = () => {
    if (batchAbortRef.current) {
      batchAbortRef.current.abort();
      batchAbortRef.current = null;
    }
  };

  const handleStopBatchQueue = () => {
    if (batchAbortRef.current) {
      batchAbortRef.current.abort();
      batchAbortRef.current = null;
    }
    setIsBatchRunning(false);
    setCurrentBatchIndex(-1);
  };

  // ─── 12. 1-CLICK AUTO-SCAN & INGEST ALL FROM DOWNLOADS ──────────────────────
  const handleScanDownloadsFolder = async () => {
    setBatchScanningDownloads(true);
    const toastId = toast.loading('⚡ Scanning Downloads folder for all client IMS files...');
    try {
      const res = await safeApiFetch(`${getApiBase()}/api/ims/scan-downloads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: activePeriod })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.results && data.results.length > 0) {
          toast.success(`🎉 1-Click Ingest Complete: Ingested ${data.clientsCount} clients (${data.totalInvoices} total invoices)!`, { id: toastId });
          await fetchSummary();
          setShowBatchModal(false);
        } else {
          toast.info('No matching IMS ZIP or JSON files found in Downloads folder.', { id: toastId });
        }
      } else {
        toast.error(data.error || 'Failed scanning downloads folder', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'Network error scanning downloads folder', { id: toastId });
    } finally {
      setBatchScanningDownloads(false);
    }
  };

  // ─── FILTERED CLIENT ROWS ───────────────────────────────────────────────────
  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      // Status filter
      if (statusFilter === 'PENDING' && c.status !== 'DISPATCHED' && c.status !== 'PARTIALLY_REVIEWED' && c.status !== 'SYNCED') return false;
      if (statusFilter === 'REVIEWED' && c.status !== 'REVIEWED') return false;
      if (statusFilter === 'PUSHED' && c.status !== 'PUSHED_TO_3B') return false;
      if (statusFilter === 'NOT_SYNCED' && c.status !== 'NOT_SYNCED') return false;

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const trade = (c.trade_name || '').toLowerCase();
        const legal = (c.legal_name || '').toLowerCase();
        const gstin = (c.gstin || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        return trade.includes(q) || legal.includes(q) || gstin.includes(q) || phone.includes(q);
      }

      return true;
    });
  }, [clients, statusFilter, search]);

  // ─── FILTERED CREDENTIALS ROWS ──────────────────────────────────────────────
  const filteredCredentials = useMemo(() => {
    return credentialsList.filter(c => {
      const hasCreds = Boolean(c.portal_username && c.portal_password);
      if (credentialsFilter === 'CONFIGURED' && !hasCreds) return false;
      if (credentialsFilter === 'MISSING' && hasCreds) return false;

      if (credentialsSearch.trim()) {
        const q = credentialsSearch.toLowerCase();
        const trade = (c.trade_name || '').toLowerCase();
        const gstin = (c.gstin || '').toLowerCase();
        const user = (c.portal_username || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        return trade.includes(q) || gstin.includes(q) || user.includes(q) || phone.includes(q);
      }
      return true;
    });
  }, [credentialsList, credentialsFilter, credentialsSearch]);

  const fmt = (n: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(n || 0);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ─── MASTER KPI CONTROL TOWER BAR ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">Total Clients</span>
            <Users className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-white">{stats.totalClients}</p>
          <span className="text-[10px] text-slate-500 font-mono">Master Database</span>
        </div>

        <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 space-y-1">
          <div className="flex items-center justify-between text-blue-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">IMS Synced</span>
            <RefreshCw className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-blue-400">{stats.syncedClients}</p>
          <span className="text-[10px] text-blue-500/80">Inward Data Available</span>
        </div>

        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-1">
          <div className="flex items-center justify-between text-amber-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">Awaiting Client</span>
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-amber-400">{stats.pendingClients}</p>
          <span className="text-[10px] text-amber-500/80">Links Sent / Reviewing</span>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-1">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">Client Approved</span>
            <CheckCheck className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-emerald-400">{stats.reviewedClients}</p>
          <span className="text-[10px] text-emerald-500/80">Ready to Push</span>
        </div>

        <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/20 space-y-1">
          <div className="flex items-center justify-between text-purple-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">3B Table 4 Ready</span>
            <ShieldCheck className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-purple-400">{stats.pushedClients}</p>
          <span className="text-[10px] text-purple-500/80">ITC Locked in 3B</span>
        </div>

        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/40 to-slate-900 border border-emerald-500/30 space-y-1 col-span-2 md:col-span-1 shadow-lg shadow-emerald-950/20">
          <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider block">Net Eligible 2B ITC</span>
          <p className="text-xl md:text-2xl font-black text-white font-mono">{fmt(stats.totalEligibleItc)}</p>
          <span className="text-[10px] text-emerald-300/80">Across Accepted Bills</span>
        </div>
      </div>

      {/* ─── PERSISTENT 20-MIN IMS GENERATION & COUNTDOWN MONITOR BANNER ─── */}
      {waitingClients.length > 0 && (
        <div className={`p-4 md:p-5 rounded-2xl border transition-all shadow-xl backdrop-blur-md ${
          stillWaitingCount === 0
            ? 'bg-gradient-to-r from-emerald-950/70 via-slate-900 to-emerald-950/70 border-emerald-500/40 shadow-emerald-950/30'
            : 'bg-gradient-to-r from-amber-950/60 via-slate-900/90 to-indigo-950/60 border-amber-500/40 shadow-amber-950/20'
        }`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Left: Info & Badges */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
                  stillWaitingCount === 0
                    ? 'bg-emerald-500 text-slate-950 animate-pulse'
                    : 'bg-amber-500 text-slate-950'
                }`}>
                  <Clock className="w-3 h-3" />
                  {stillWaitingCount === 0 ? 'Downloads Ready' : 'Phase 1 Complete (Waiting Period)'}
                </span>

                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
                  GST Portal Generating IMS Files ({waitingClients.length} Client{waitingClients.length > 1 ? 's' : ''})
                </span>
              </div>

              <p className="text-xs text-slate-300">
                {stillWaitingCount > 0 ? (
                  <>
                    GST Portal requires ~20 minutes to compile JSON downloads. Active for:{' '}
                    <strong className="text-amber-200">
                      {waitingClients.slice(0, 3).map(c => c.trade_name || c.gstin).join(', ')}
                      {waitingClients.length > 3 ? ` +${waitingClients.length - 3} more` : ''}
                    </strong>
                    . Stored in memory &mdash; safe to close dialogs, navigate, or refresh!
                  </>
                ) : (
                  <>
                    🎉 20-minute waiting period has completed for all <strong className="text-emerald-300">{waitingClients.length} clients</strong>! Prepared files are ready to be fetched from GST Portal.
                  </>
                )}
              </p>

              {/* Mini visual progress bar */}
              <div className="w-full max-w-md bg-slate-950/80 rounded-full h-2 border border-slate-800 overflow-hidden mt-1">
                <div
                  className={`h-full transition-all duration-1000 ${
                    stillWaitingCount === 0
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : 'bg-gradient-to-r from-amber-500 via-indigo-500 to-purple-500'
                  }`}
                  style={{
                    width: `${stillWaitingCount === 0 ? 100 : Math.min(100, Math.max(5, Math.round(((1200 - (batchSecondsLeft || 0)) / 1200) * 100)))}%`
                  }}
                />
              </div>
            </div>

            {/* Right: Digital Countdown Clock & Actions */}
            <div className="flex flex-wrap items-center gap-3">
              {stillWaitingCount > 0 ? (
                <div className="px-4 py-2 rounded-xl bg-slate-950/90 border border-amber-500/50 text-center shadow-lg">
                  <span className="text-[10px] text-amber-400/90 font-bold block uppercase tracking-wider">
                    Phase 2 Auto-Ready In
                  </span>
                  <span className="text-2xl md:text-3xl font-black font-mono text-amber-300 tracking-tight">
                    {formatCountdown(batchSecondsLeft)}
                  </span>
                </div>
              ) : (
                <div className="px-4 py-2 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-center shadow-lg">
                  <span className="text-[10px] text-emerald-400 font-bold block uppercase tracking-wider">
                    Portal Status
                  </span>
                  <span className="text-lg font-black text-emerald-300">
                    Ready to Fetch
                  </span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  onClick={handleRunPhase2Queue}
                  className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg transition-all hover:scale-[1.02] ${
                    stillWaitingCount === 0
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-950 animate-bounce'
                      : 'bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white shadow-emerald-950'
                  }`}
                >
                  <Zap className="w-4 h-4 fill-current text-amber-300" />
                  {stillWaitingCount === 0 ? '📥 Download Prepared Files Now' : '⚡ Collect Ready Downloads (Skip Wait)'}
                </button>

                <button
                  onClick={() => handleOpenBatchSync()}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                >
                  <Eye className="w-3.5 h-3.5 text-indigo-400" />
                  View Queue Modal
                </button>

                <button
                  onClick={() => handleResetWaiting()}
                  className="px-2.5 py-2.5 rounded-xl bg-slate-900/80 hover:bg-rose-950/50 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-500/40 text-xs font-bold transition-all"
                  title="Reset 20-minute waiting timer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ACTION COMMAND BAR ───────────────────────────────────────────── */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xl backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          {/* ⚡ 1-Click Multi-Sync Queue */}
          <button
            onClick={() => handleOpenBatchSync(selectedGstins.size > 0 ? Array.from(selectedGstins) : undefined)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-indigo-950 transition-all hover:scale-[1.03] border border-indigo-400/40 animate-pulse hover:animate-none"
            title="1-Click Automated Sequential Sync across multiple or all clients"
          >
            <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
            ⚡ 1-Click Multi-Sync {selectedGstins.size > 0 ? `(${selectedGstins.size} Selected)` : `(${credentialsStats.configured || clients.length} Clients)`}
          </button>

          {/* ⚡ 1-Click Scan Downloads Folder */}
          <button
            onClick={handleScanDownloadsFolder}
            disabled={batchScanningDownloads}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-300 text-xs font-bold flex items-center gap-2 border border-blue-500/30 transition-all shadow-md"
            title="1-Click Auto-Ingest: Scans Downloads folder for all client IMS ZIP/JSON files"
          >
            <FolderSearch className={`w-3.5 h-3.5 text-blue-400 ${batchScanningDownloads ? 'animate-spin' : ''}`} />
            Scan Downloads
          </button>

          {/* Assisted Portal Login */}
          <button
            onClick={() => setShowPortalModal(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-2 border border-slate-700 transition-all"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
            Single Portal Sync
          </button>

          {/* Client Credentials Vault */}
          <button
            onClick={() => setShowCredentialsModal(true)}
            className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-amber-950 transition-all hover:scale-[1.02]"
            title="Manage Portal Usernames & Passwords for 300+ Clients"
          >
            <Key className="w-3.5 h-3.5" />
            Credentials Vault ({credentialsStats.configured}/{credentialsStats.total})
          </button>

          {/* Bulk Dropzone */}
          <button
            onClick={() => setShowDropzoneModal(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 border border-slate-700 transition-all"
          >
            <UploadCloud className="w-3.5 h-3.5 text-blue-400" />
            Drop Inward IMS Files
          </button>

          {/* 📧 Broadcast Reviews via Gmail (Email + Sheets) */}
          <button
            onClick={() => handleOpenEmailBroadcast()}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-sky-950 transition-all hover:scale-[1.02] border border-sky-400/40"
            title="Auto-send personalized IMS Excel spreadsheets & 1-click review portals to client inboxes"
          >
            <Mail className="w-3.5 h-3.5 text-sky-200" />
            <span>📧 Broadcast Emails ({selectedGstins.size > 0 ? `${selectedGstins.size} Selected` : 'All Synced'})</span>
            {emailSettings.isConfigured ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/80 inline-block" title="Gmail Connected" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" title="Setup Gmail" />
            )}
          </button>

          {/* Bulk Broadcast Review Links */}
          <button
            onClick={() => handleGenerateReviewLinks()}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-emerald-950 transition-all hover:scale-[1.02]"
          >
            <Smartphone className="w-3.5 h-3.5" />
            Broadcast Review Links ({selectedGstins.size > 0 ? selectedGstins.size : 'All'})
          </button>

          {/* Import Returned Excel */}
          <button
            onClick={() => bulkExcelInputRef.current?.click()}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-2 border border-slate-700 transition-all"
            title="Import Excel returned by a client"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            Import Returned Excel
          </button>
          <input
            type="file"
            ref={bulkExcelInputRef}
            onChange={(e) => handleImportReturnedExcel(e)}
            accept=".xlsx,.xls"
            className="hidden"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchSummary}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
            title="Refresh Grid"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* ─── SEARCH & FILTER TOOLBAR ──────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search across 300+ clients by Name, GSTIN, or Phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {[
            { id: 'ALL', label: `All (${clients.length})` },
            { id: 'PENDING', label: `Awaiting Client (${stats.pendingClients})` },
            { id: 'REVIEWED', label: `Approved (${stats.reviewedClients})` },
            { id: 'PUSHED', label: `3B Ready (${stats.pushedClients})` },
            { id: 'NOT_SYNCED', label: `Not Synced (${clients.filter(c => c.status === 'NOT_SYNCED').length})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                statusFilter === tab.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── MASTER CLIENT GRID (300+ ROWS) ───────────────────────────────── */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-20 bg-slate-900 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="p-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedGstins.size === filteredClients.length && filteredClients.length > 0}
                    onChange={e => handleSelectAll(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0"
                  />
                </th>
                <th className="p-4">Taxpayer / Trade Name</th>
                <th className="p-4">GSTIN &amp; Contact</th>
                <th className="p-4 text-center">Invoices</th>
                <th className="p-4">Review Status</th>
                <th className="p-4 text-right">Eligible 2B ITC</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-semibold text-slate-400">No client records match the current filter</p>
                    <p className="text-[11px] text-slate-500 mt-1">Try switching tabs or resetting the search query.</p>
                  </td>
                </tr>
              ) : (
                filteredClients.map((client, idx) => {
                  const isSelected = selectedGstins.has(client.gstin);
                  const isApproved = client.status === 'REVIEWED' || client.status === 'PUSHED_TO_3B';

                  return (
                    <tr
                      key={client.gstin || idx}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isSelected ? 'bg-indigo-950/20' : ''
                      }`}
                    >
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(client.gstin)}
                          className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0"
                        />
                      </td>

                      {/* Client Name */}
                      <td
                        className="p-4 cursor-pointer group"
                        onClick={() => handleOpenDetail(client)}
                        title="🔍 Click to open full client details & line-item invoices"
                      >
                        <div className="font-bold text-white text-sm group-hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                          <span className="group-hover:underline underline-offset-2">{client.trade_name || client.legal_name || 'Client Details Missing'}</span>
                          <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-all text-indigo-400 shrink-0" />
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">
                          {client.legal_name && client.legal_name !== client.trade_name ? client.legal_name : ''}
                        </div>
                      </td>

                      {/* GSTIN & Phone */}
                      <td className="p-4 font-mono">
                        <div className="text-slate-200 font-semibold">{client.gstin}</div>
                        <div className="text-[11px] text-slate-500">
                          {client.phone ? `+91 ${client.phone}` : 'No phone saved'}
                        </div>
                      </td>

                      {/* Invoices Count */}
                      <td className="p-4 text-center">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 font-mono font-bold text-slate-200">
                          {client.total_invoices || 0}
                        </span>
                      </td>

                      {/* Review Status Badge */}
                      <td className="p-4">
                        {client.status === 'PUSHED_TO_3B' ? (
                          <span className="px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 font-bold text-[10px] flex items-center gap-1.5 w-fit">
                            <CheckCheck className="w-3 h-3 text-purple-400" />
                            Pushed to 3B Table 4
                          </span>
                        ) : client.status === 'REVIEWED' ? (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-[10px] flex items-center gap-1.5 w-fit">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            Approved ({client.accepted_count}/{client.total_invoices})
                          </span>
                        ) : client.status === 'PARTIALLY_REVIEWED' ? (
                          <span className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-[10px] flex items-center gap-1.5 w-fit">
                            <Clock className="w-3 h-3 text-amber-400" />
                            Partially Reviewed
                          </span>
                        ) : client.status === 'DISPATCHED' ? (
                          <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-bold text-[10px] flex items-center gap-1.5 w-fit">
                            <Send className="w-3 h-3 text-indigo-400" />
                            Review Link Sent
                          </span>
                        ) : client.status === 'SYNCED' ? (
                          <span className="px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 font-bold text-[10px] flex items-center gap-1.5 w-fit">
                            <Clock className="w-3 h-3 text-blue-400" />
                            Ready for Review
                          </span>
                        ) : client.status === 'REQUESTED_WAITING' || client.generation_status === 'REQUESTED' ? (() => {
                          const secLeft = getClientWaitSecondsLeft(client.generation_requested_at);
                          if (secLeft > 0) {
                            return (
                              <span className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold text-[10px] flex items-center gap-1.5 w-fit animate-pulse font-mono">
                                <Clock className="w-3 h-3 text-amber-400" />
                                Generating ({formatCountdown(secLeft)} left)
                              </span>
                            );
                          } else {
                            return (
                              <button
                                onClick={() => handleOpenPortalSync(client.gstin, 'PHASE_2')}
                                className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500 hover:text-white font-bold text-[10px] flex items-center gap-1.5 w-fit shadow-sm transition-all"
                              >
                                <Download className="w-3 h-3 text-emerald-400" />
                                📥 Download Ready — Fetch
                              </button>
                            );
                          }
                        })() : (
                          <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-semibold text-[10px] flex items-center gap-1.5 w-fit">
                            Not Synced
                          </span>
                        )}
                      </td>

                      {/* Eligible 2B ITC */}
                      <td className="p-4 text-right font-mono font-bold text-sm">
                        {isApproved ? (
                          <span className="text-emerald-400">{fmt(client.eligible_itc_total)}</span>
                        ) : (
                          <span className="text-slate-500">Pending Review</span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 1-Click Sync for this Client */}
                          <button
                            onClick={() => handleOpenBatchSync([client.gstin])}
                            className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-colors"
                            title="⚡ 1-Click Sync IMS for this Client"
                          >
                            <Zap className="w-3.5 h-3.5 text-amber-400" />
                          </button>

                          {/* Send WhatsApp Review Link */}
                          <button
                            onClick={() => {
                              if (!client.active_token) {
                                handleGenerateReviewLinks([client.gstin]).then(() => handleSendWhatsApp(client));
                              } else {
                                handleSendWhatsApp(client);
                              }
                            }}
                            className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors"
                            title="Send Review Link on WhatsApp"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>

                          {/* Send Review Email with Excel Sheet */}
                          <button
                            onClick={() => handleOpenSingleClientEmail(client)}
                            className="p-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 transition-colors"
                            title="📧 Send Review Email with Attached Excel Sheet (.xlsx)"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>

                          {/* Export Excel */}
                          <button
                            onClick={() => handleExportClientExcel(client)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                            title="Export Client Review Excel (.xlsx)"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400" />
                          </button>

                          {/* View Invoices */}
                          <button
                            onClick={() => handleOpenDetail(client)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                            title="Inspect Bills in Detail"
                          >
                            <Eye className="w-3.5 h-3.5 text-indigo-400" />
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

      {/* ─── CLIENT INVOICE DETAIL INSPECTOR MODAL (EXCEL SPREADSHEET VIEW) ─────────────────────────── */}
      {activeClientDetail && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm overflow-y-auto p-2 sm:p-4 md:p-6 animate-fade-in">
          <div className="w-full max-w-[99vw] 2xl:max-w-[1600px] bg-slate-900 border border-slate-700/90 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xl mx-auto my-3">
            {/* Modal Header: Client Details & Quick Actions */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20">
                    Client IMS Working &amp; Decision Hub
                  </span>
                  <span className="text-[10px] font-mono text-slate-300 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">
                    Period: <strong className="text-white">{activePeriod}</strong>
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                    activeClientDetail.status === 'REVIEWED' || activeClientDetail.status === 'PUSHED_TO_3B'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : activeClientDetail.status === 'SYNCED'
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {activeClientDetail.status === 'PUSHED_TO_3B' ? 'Pushed to 3B' : activeClientDetail.status || 'SYNCED'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg md:text-xl font-black text-white flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-indigo-400 shrink-0" />
                    <span>{activeClientDetail.trade_name || activeClientDetail.legal_name || 'Client Invoices'}</span>
                  </h3>

                  <div className="flex items-center gap-1.5 bg-slate-800/90 px-2.5 py-0.5 rounded-lg border border-slate-700 text-xs font-mono">
                    <span className="text-slate-400">GSTIN:</span>
                    <strong className="text-white select-all">{activeClientDetail.gstin}</strong>
                    <button
                      onClick={() => handleCopyGstin(activeClientDetail.gstin)}
                      className="text-slate-400 hover:text-white transition-colors"
                      title="Copy Client GSTIN"
                    >
                      {copiedGstin === activeClientDetail.gstin ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>

                  {activeClientDetail.phone && (
                    <span className="text-xs text-slate-400 font-mono">Phone: +91 {activeClientDetail.phone}</span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleExportClientExcel(activeClientDetail)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-colors shadow-sm"
                  title="Export Client Review Excel (.xlsx)"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400" />
                  <span>Export Excel</span>
                </button>

                <button
                  onClick={() => {
                    if (!activeClientDetail.active_token) {
                      handleGenerateReviewLinks([activeClientDetail.gstin]).then(() => handleSendWhatsApp(activeClientDetail));
                    } else {
                      handleSendWhatsApp(activeClientDetail);
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-bold flex items-center gap-1.5 border border-emerald-500/30 transition-colors"
                  title="Send 1-Click Review Link on WhatsApp"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                  <span>WhatsApp Link</span>
                </button>

                <button
                  onClick={() => handleOpenSingleClientEmail(activeClientDetail)}
                  className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-sky-950 transition-colors"
                  title="Send Review Email with Attached Excel Sheet (.xlsx)"
                >
                  <Mail className="w-3.5 h-3.5 text-sky-200" />
                  <span>Email Review &amp; Sheet</span>
                </button>

                <button
                  onClick={() => handleExportPortalJson(activeClientDetail)}
                  className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-purple-950 transition-colors"
                  title="Export Official GST Portal Action JSON Payload"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  <span>Portal JSON</span>
                </button>

                <button
                  onClick={() => setActiveClientDetail(null)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700"
                  title="Close Inspector"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Excel-Style Simplified Status Strip & Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-950/90 p-2.5 rounded-xl border border-slate-800">
              {/* Quick Status Filter Tabs with Excel Counts */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setDetailActionFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                    detailActionFilter === 'ALL'
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span>All Invoices</span>
                  <span className="px-1.5 py-0.5 rounded bg-black/30 font-mono text-[11px] font-bold">
                    {modalStats.totalCount}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono font-normal">
                    ({fmt(modalStats.totalInvoiceVal)})
                  </span>
                </button>

                <button
                  onClick={() => setDetailActionFilter('ACCEPT')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                    detailActionFilter === 'ACCEPT'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Accepted</span>
                  <span className="px-1.5 py-0.5 rounded bg-black/20 font-mono text-[11px] font-bold">
                    {modalStats.acceptedCount}
                  </span>
                  <span className="text-[10px] font-mono font-semibold">
                    ({fmt(modalStats.acceptedGst)} ITC)
                  </span>
                </button>

                <button
                  onClick={() => setDetailActionFilter('REJECT')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                    detailActionFilter === 'REJECT'
                      ? 'bg-rose-500 text-white border-rose-400 shadow-sm'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                  }`}
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Rejected</span>
                  <span className="px-1.5 py-0.5 rounded bg-black/20 font-mono text-[11px] font-bold">
                    {modalStats.rejectedCount}
                  </span>
                </button>

                <button
                  onClick={() => setDetailActionFilter('PENDING')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                    detailActionFilter === 'PENDING'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Pending (Hold)</span>
                  <span className="px-1.5 py-0.5 rounded bg-black/20 font-mono text-[11px] font-bold">
                    {modalStats.pendingCount}
                  </span>
                </button>

                <button
                  onClick={() => setDetailActionFilter('NO_ACTION')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                    detailActionFilter === 'NO_ACTION'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                      : 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>No Action</span>
                  <span className="px-1.5 py-0.5 rounded bg-black/20 font-mono text-[11px] font-bold">
                    {modalStats.noActionCount}
                  </span>
                </button>
              </div>

              {/* Right: Search & Bulk Action Shortcuts */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={detailSearch}
                    onChange={e => setDetailSearch(e.target.value)}
                    placeholder="Search vendor, bill no, GSTIN, amount..."
                    className="w-48 sm:w-60 pl-8 pr-7 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  {detailSearch && (
                    <button
                      onClick={() => setDetailSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>

                {filteredDetailInvoices.length > 0 && (
                  <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
                    <button
                      onClick={() => handleBulkSetFilteredAction('ACCEPT')}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-bold border border-emerald-500/30 transition-colors flex items-center gap-1"
                      title="Accept all currently filtered invoices"
                    >
                      <Check className="w-3 h-3" />
                      <span>Accept All</span>
                    </button>
                    <button
                      onClick={() => handleBulkSetFilteredAction('REJECT')}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-bold border border-rose-500/30 transition-colors flex items-center gap-1"
                      title="Reject all currently filtered invoices"
                    >
                      <X className="w-3 h-3" />
                      <span>Reject All</span>
                    </button>
                    <button
                      onClick={() => handleBulkSetFilteredAction('PENDING')}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-bold border border-amber-500/30 transition-colors flex items-center gap-1"
                      title="Hold all currently filtered invoices as Pending"
                    >
                      <Clock className="w-3 h-3" />
                      <span>Hold All</span>
                    </button>
                    <button
                      onClick={() => handleBulkSetFilteredAction('NO_ACTION')}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-bold border border-slate-700 transition-colors"
                      title="Reset all currently filtered invoices to No Action"
                    >
                      ↺ Reset
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ─── EXCEL SPREADSHEET TABLE GRID (WHOLE SCREEN SCROLLS NATURALLY) ─────────────────── */}
            <div className="border border-slate-700/80 rounded-xl overflow-hidden bg-slate-950 shadow-inner">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead className="sticky top-0 bg-slate-800 text-slate-200 z-10 shadow-sm border-b border-slate-700 select-none">
                    <tr className="divide-x divide-slate-700/60 text-[11px] font-bold uppercase tracking-wider">
                      <th className="py-2.5 px-2 text-center w-8">#</th>
                      <th className="py-2.5 px-3">Supplier Name</th>
                      <th className="py-2.5 px-3">Supplier GSTIN</th>
                      <th className="py-2.5 px-2 text-center">Type</th>
                      <th className="py-2.5 px-3">Invoice No</th>
                      <th className="py-2.5 px-2.5 text-center">Date</th>
                      <th className="py-2.5 px-2 text-center">POS</th>
                      <th className="py-2.5 px-2 text-center">RCM</th>
                      <th className="py-2.5 px-3 text-right font-mono">Taxable (₹)</th>
                      <th className="py-2.5 px-2.5 text-right font-mono">IGST (₹)</th>
                      <th className="py-2.5 px-2.5 text-right font-mono">CGST (₹)</th>
                      <th className="py-2.5 px-2.5 text-right font-mono">SGST (₹)</th>
                      <th className="py-2.5 px-2.5 text-right font-mono">Cess (₹)</th>
                      <th className="py-2.5 px-3 text-right font-mono text-emerald-400">Total GST (₹)</th>
                      <th className="py-2.5 px-3 text-right font-mono font-black text-indigo-300">Invoice Val (₹)</th>
                      <th className="py-2.5 px-3 text-center">Decision / Action</th>
                      <th className="py-2.5 px-3">Remarks / Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-200">
                    {loadingDetail ? (
                      <tr>
                        <td colSpan={17} className="py-16 text-center text-slate-400">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400 mb-2" />
                          <span>Loading invoice details...</span>
                        </td>
                      </tr>
                    ) : filteredDetailInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={17} className="py-16 text-center text-slate-500">
                          <FileText className="w-8 h-8 mx-auto text-slate-600 opacity-40 mb-1" />
                          <span className="font-bold text-slate-400">No invoices match the selected filter</span>
                        </td>
                      </tr>
                    ) : (
                      filteredDetailInvoices.map((inv, i) => {
                        const act = (inv.action || 'NO_ACTION').toUpperCase();
                        const igst = Number(inv.igst) || 0;
                        const cgst = Number(inv.cgst) || 0;
                        const sgst = Number(inv.sgst) || 0;
                        const cess = Number(inv.cess) || 0;
                        const totalGst = igst + cgst + sgst + cess;
                        const taxable = Number(inv.txval) || 0;
                        const totalBillVal = Number(inv.total_val) > 0 ? Number(inv.total_val) : (taxable + totalGst);
                        const typeInfo = getInvoiceTypeDetails(inv.inv_typ);
                        const stateName = getGstStateName(inv.pos);

                        return (
                          <tr
                            key={inv.id || i}
                            className={`divide-x divide-slate-800/60 transition-colors ${
                              act === 'ACCEPT'
                                ? 'bg-emerald-950/20 hover:bg-emerald-950/30'
                                : act === 'REJECT'
                                ? 'bg-rose-950/20 hover:bg-rose-950/30'
                                : act === 'PENDING'
                                ? 'bg-amber-950/20 hover:bg-amber-950/30'
                                : 'hover:bg-slate-800/50'
                            }`}
                          >
                            <td className="py-2 px-2 text-center text-slate-500 font-mono text-[11px]">{i + 1}</td>
                            <td className="py-2 px-3 font-semibold text-white max-w-[220px] truncate" title={inv.supplier_name}>
                              {inv.supplier_name || 'Vendor Details Pending'}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-300">
                              <div className="flex items-center gap-1.5">
                                <span className="select-all">{inv.ctin}</span>
                                <button
                                  onClick={() => handleCopyGstin(inv.ctin)}
                                  className="text-slate-500 hover:text-white transition-colors"
                                  title="Copy GSTIN"
                                >
                                  {copiedGstin === inv.ctin ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                </button>
                              </div>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${typeInfo.badgeClass}`}>
                                {inv.inv_typ || 'R'}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-white select-all">
                              {inv.inum}
                            </td>
                            <td className="py-2 px-2.5 text-center font-mono text-slate-300">
                              {inv.idt}
                            </td>
                            <td className="py-2 px-2 text-center font-mono text-slate-300" title={stateName}>
                              {inv.pos || '-'}
                            </td>
                            <td className="py-2 px-2 text-center font-mono">
                              {inv.rchrg === 'Y' ? (
                                <span className="px-1 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">Y</span>
                              ) : (
                                <span className="text-slate-500">N</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-medium text-slate-200">
                              {fmt(taxable)}
                            </td>
                            <td className={`py-2 px-2.5 text-right font-mono ${igst > 0 ? 'text-indigo-300 font-bold' : 'text-slate-500'}`}>
                              {igst > 0 ? fmt(igst) : '-'}
                            </td>
                            <td className={`py-2 px-2.5 text-right font-mono ${cgst > 0 ? 'text-blue-300 font-bold' : 'text-slate-500'}`}>
                              {cgst > 0 ? fmt(cgst) : '-'}
                            </td>
                            <td className={`py-2 px-2.5 text-right font-mono ${sgst > 0 ? 'text-cyan-300 font-bold' : 'text-slate-500'}`}>
                              {sgst > 0 ? fmt(sgst) : '-'}
                            </td>
                            <td className={`py-2 px-2.5 text-right font-mono ${cess > 0 ? 'text-amber-300 font-bold' : 'text-slate-500'}`}>
                              {cess > 0 ? fmt(cess) : '-'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">
                              {fmt(totalGst)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-white bg-slate-900/60">
                              {fmt(totalBillVal)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleSetInvoiceAction(inv.id, 'ACCEPT')}
                                  className={`px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 ${
                                    act === 'ACCEPT'
                                      ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-sm shadow-emerald-500/40'
                                      : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-800'
                                  }`}
                                  title="Accept invoice for ITC"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Accept</span>
                                </button>
                                <button
                                  onClick={() => handleSetInvoiceAction(inv.id, 'REJECT')}
                                  className={`px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 ${
                                    act === 'REJECT'
                                      ? 'bg-rose-500 text-white font-extrabold shadow-sm shadow-rose-500/40'
                                      : 'text-slate-400 hover:text-rose-300 hover:bg-slate-800'
                                  }`}
                                  title="Reject disputed invoice"
                                >
                                  <X className="w-3 h-3" />
                                  <span>Reject</span>
                                </button>
                                <button
                                  onClick={() => handleSetInvoiceAction(inv.id, 'PENDING')}
                                  className={`px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 ${
                                    act === 'PENDING'
                                      ? 'bg-amber-500 text-slate-950 font-extrabold shadow-sm shadow-amber-500/40'
                                      : 'text-slate-400 hover:text-amber-300 hover:bg-slate-800'
                                  }`}
                                  title="Mark pending (in transit)"
                                >
                                  <Clock className="w-3 h-3" />
                                  <span>Hold</span>
                                </button>
                                {act !== 'NO_ACTION' && (
                                  <button
                                    onClick={() => handleSetInvoiceAction(inv.id, 'NO_ACTION')}
                                    className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
                                    title="Reset to No Action"
                                  >
                                    ↺
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              {editingRemarkId === inv.id ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={remarkInput}
                                    onChange={e => setRemarkInput(e.target.value)}
                                    placeholder="Note..."
                                    className="px-2 py-0.5 bg-slate-950 border border-indigo-500 rounded text-xs text-white w-32 focus:outline-none"
                                    autoFocus
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleSaveInvoiceRemark(inv.id, remarkInput);
                                      if (e.key === 'Escape') setEditingRemarkId(null);
                                    }}
                                  />
                                  <button onClick={() => handleSaveInvoiceRemark(inv.id, remarkInput)} className="px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-500 rounded text-[10px] text-white font-bold">✓</button>
                                  <button onClick={() => setEditingRemarkId(null)} className="px-1 py-0.5 bg-slate-800 rounded text-[10px] text-slate-400">✕</button>
                                </div>
                              ) : inv.client_remarks ? (
                                <div
                                  onClick={() => {
                                    setEditingRemarkId(inv.id);
                                    setRemarkInput(inv.client_remarks || '');
                                  }}
                                  className="cursor-pointer text-amber-300 truncate max-w-[140px] text-[11px] flex items-center gap-1 hover:underline"
                                  title={inv.client_remarks}
                                >
                                  <MessageSquare className="w-2.5 h-2.5 shrink-0 text-amber-400" />
                                  <span>{inv.client_remarks}</span>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingRemarkId(inv.id);
                                    setRemarkInput('');
                                  }}
                                  className="text-[11px] text-slate-500 hover:text-slate-300 hover:underline"
                                >
                                  + Note
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {/* Excel Summary Total Footer */}
                  {filteredDetailInvoices.length > 0 && (
                    <tfoot className="sticky bottom-0 bg-slate-900 border-t-2 border-slate-700 font-bold text-white z-10 text-xs font-mono">
                      <tr className="divide-x divide-slate-700/60">
                        <td colSpan={8} className="py-2.5 px-3 text-right font-sans uppercase font-bold text-slate-300">
                          Total ({filteredDetailInvoices.length} Bills):
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-white">
                          {fmt(filteredDetailInvoices.reduce((acc, i) => acc + (Number(i.txval) || 0), 0))}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-bold text-indigo-300">
                          {fmt(filteredDetailInvoices.reduce((acc, i) => acc + (Number(i.igst) || 0), 0))}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-bold text-blue-300">
                          {fmt(filteredDetailInvoices.reduce((acc, i) => acc + (Number(i.cgst) || 0), 0))}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-bold text-cyan-300">
                          {fmt(filteredDetailInvoices.reduce((acc, i) => acc + (Number(i.sgst) || 0), 0))}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-bold text-amber-300">
                          {fmt(filteredDetailInvoices.reduce((acc, i) => acc + (Number(i.cess) || 0), 0))}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                          {fmt(filteredDetailInvoices.reduce((acc, i) => acc + (Number(i.igst) || 0) + (Number(i.cgst) || 0) + (Number(i.sgst) || 0) + (Number(i.cess) || 0), 0))}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-white bg-slate-950">
                          {fmt(filteredDetailInvoices.reduce((acc, i) => {
                            const gst = (Number(i.igst) || 0) + (Number(i.cgst) || 0) + (Number(i.sgst) || 0) + (Number(i.cess) || 0);
                            return acc + (Number(i.total_val) > 0 ? Number(i.total_val) : ((Number(i.txval) || 0) + gst));
                          }, 0))}
                        </td>
                        <td colSpan={2} className="py-2.5 px-3 text-center text-slate-300 font-sans text-[11px]">
                          Accepted Net ITC: <strong className="text-emerald-400 font-mono text-xs">{fmt(modalStats.acceptedGst)}</strong>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Modal Footer: Net 2B ITC & Apply to 3B */}
            <div className="border-t border-slate-800 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-4 text-slate-400">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Net Eligible 2B ITC (Accepted):{' '}
                  <strong className="text-emerald-400 font-mono text-sm">{fmt(modalStats.acceptedGst)}</strong>
                </span>
                <span>•</span>
                <span>
                  Gross Bill Value (Accepted): <strong className="text-white font-mono">{fmt(modalStats.acceptedVal)}</strong>
                </span>
                <span>•</span>
                <span>
                  Total Invoices: <strong className="text-white">{detailInvoices.length}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveClientDetail(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-colors border border-slate-700"
                >
                  Close
                </button>

                <button
                  onClick={() => {
                    handlePushTo3B(activeClientDetail);
                    setActiveClientDetail(null);
                  }}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold flex items-center gap-2 shadow-lg shadow-purple-950 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Apply to GSTR-3B Table 4</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── OFFLINE DROPZONE MODAL ───────────────────────────────────────── */}
      {showDropzoneModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-700 rounded-3xl p-6 space-y-5 shadow-2xl text-center">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <UploadCloud className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">Drop Official GST Portal IMS Files</h3>
              <p className="text-xs text-slate-400">
                Upload single or multiple GSTN IMS Inward JSON/Excel files downloaded for your 300+ clients.
              </p>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-indigo-500/60 rounded-2xl p-8 cursor-pointer transition-all bg-slate-950/40 hover:bg-indigo-950/10 space-y-2"
            >
              <FileJson className="w-8 h-8 text-indigo-400 mx-auto" />
              <p className="text-xs font-bold text-slate-300">Click to Browse or Drag Files Here</p>
              <p className="text-[10px] text-slate-500">Supports official GST Portal .zip, .xlsx, .json files</p>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleDropzoneUpload}
              multiple
              accept=".zip,.xlsx,.xls,.json"
              className="hidden"
            />

            <button
              onClick={() => setShowDropzoneModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ─── ASSISTED GST PORTAL LOGIN MODAL ──────────────────────────────── */}
      {/* ─── ASSISTED GST PORTAL LOGIN MODAL ──────────────────────────────── */}
      {showPortalModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Globe className="w-7 h-7" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-white">Assisted GST Portal IMS Sync</h3>
              <p className="text-xs text-slate-400">
                Launches a Chromium window to log in to <strong>services.gst.gov.in</strong> and download inward IMS records automatically.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Target GSTIN</label>
                  {credentialsStats.configured > 0 && (
                    <span className="text-[10px] text-amber-400 font-semibold">
                      {credentialsStats.configured} saved in Vault
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    placeholder="Enter or select GSTIN (e.g. 27AAACS1234A1Z1)"
                    value={portalGstin}
                    onChange={e => handleSelectPortalGstin(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                  />
                  {clients.length > 0 && (
                    <select
                      value={portalGstin}
                      onChange={e => handleSelectPortalGstin(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-[11px] text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="">-- Or Choose From Client List ({clients.length}) --</option>
                      {clients.map(c => {
                        const cred = credentialsList.find(x => x.gstin.toUpperCase() === c.gstin.toUpperCase());
                        const hasCred = Boolean(cred?.portal_username && cred?.portal_password);
                        return (
                          <option key={c.gstin} value={c.gstin}>
                            {hasCred ? '🔑 ' : '○ '}{c.trade_name} ({c.gstin})
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              </div>

              {/* Status banner for credentials found / missing */}
              {(() => {
                const cred = credentialsList.find(c => c.gstin.toUpperCase() === portalGstin.toUpperCase());
                if (cred && cred.portal_username && cred.portal_password) {
                  return (
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 flex items-center justify-between gap-1.5">
                      <span className="flex items-center gap-1.5 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                        Credentials loaded from Vault ({cred.portal_username})
                      </span>
                      <button
                        onClick={() => {
                          setShowPortalModal(false);
                          setShowCredentialsModal(true);
                        }}
                        className="text-[10px] text-emerald-300 underline font-semibold hover:text-white"
                      >
                        Edit
                      </button>
                    </div>
                  );
                } else if (portalGstin) {
                  return (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400 flex items-center justify-between gap-1.5">
                      <span className="flex items-center gap-1 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        No credentials saved in Vault for this GSTIN
                      </span>
                      <button
                        onClick={() => {
                          setShowPortalModal(false);
                          setShowCredentialsModal(true);
                        }}
                        className="text-[10px] text-amber-300 underline font-bold hover:text-white"
                      >
                        Open Vault
                      </button>
                    </div>
                  );
                }
                return null;
              })()}

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">GST Portal Username (Auto-filled / Editable)</label>
                <input
                  type="text"
                  placeholder="Username"
                  value={portalUsername}
                  onChange={e => setPortalUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">GST Portal Password (Auto-filled / Editable)</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={portalPassword}
                  onChange={e => setPortalPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {portalConnecting ? (
              <div className="p-4 rounded-2xl bg-indigo-950/50 border border-indigo-500/40 text-[12px] space-y-3 shadow-lg">
                <div className="flex items-center gap-2.5 text-indigo-300 font-bold">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <span>Browser Launched & Active!</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 space-y-1.5 leading-relaxed">
                  <p className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    Action Required on Desktop:
                  </p>
                  <p>
                    1. Check your Windows taskbar for <strong>Google Chrome / Chromium</strong> window.
                  </p>
                  <p>
                    2. Username &amp; Password have been <strong>auto-filled</strong>. Enter the <strong>6-character CAPTCHA</strong> and click <strong>Login</strong>.
                  </p>
                  <p className="text-emerald-400 font-medium">
                    ⚡ Antigravity will auto-detect your login and sync IMS Inward supplies automatically!
                  </p>
                </div>
                <button
                  onClick={handleCancelPortalLogin}
                  className="w-full py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel / Close Browser
                </button>
              </div>
            ) : (
              <>
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 leading-relaxed space-y-1">
                  <span className="text-amber-400 font-bold block flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    Browser CAPTCHA Prompt
                  </span>
                  <span>A visible browser will open. Complete the visual 6-character CAPTCHA and OTP. The tool will auto-navigate to IMS and download the inward payload.</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPortalModal(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLaunchPortalLogin}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    Launch Portal Login
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── CLIENT CREDENTIALS VAULT MODAL (300+ CLIENTS) ─────────────────── */}
      {showCredentialsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 md:p-6 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-950/40">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-inner">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
                    Client Credentials Vault
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      300+ Scale
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Store official GST Portal Usernames & Passwords for automated IMS fetching.
                  </p>
                </div>
              </div>

              {/* KPI Badges */}
              <div className="hidden sm:flex items-center gap-2">
                <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-center">
                  <span className="text-[10px] text-slate-400 block font-semibold">Total</span>
                  <span className="text-xs font-bold text-white">{credentialsStats.total}</span>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <span className="text-[10px] text-emerald-400 block font-semibold">Configured</span>
                  <span className="text-xs font-bold text-emerald-300">{credentialsStats.configured}</span>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                  <span className="text-[10px] text-amber-400 block font-semibold">Missing</span>
                  <span className="text-xs font-bold text-amber-300">{credentialsStats.missing}</span>
                </div>
                <button
                  onClick={() => setShowCredentialsModal(false)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors ml-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile Close Button */}
              <button
                onClick={() => setShowCredentialsModal(false)}
                className="sm:hidden p-2 rounded-xl bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Action & Filter Toolbar */}
            <div className="p-4 border-b border-slate-800 bg-slate-900 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1 max-w-lg">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by Client Name, GSTIN, Username..."
                    value={credentialsSearch}
                    onChange={e => setCredentialsSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  {credentialsSearch && (
                    <button
                      onClick={() => setCredentialsSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setCredentialsFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                      credentialsFilter === 'ALL' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All ({credentialsStats.total})
                  </button>
                  <button
                    onClick={() => setCredentialsFilter('CONFIGURED')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                      credentialsFilter === 'CONFIGURED' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Configured ({credentialsStats.configured})
                  </button>
                  <button
                    onClick={() => setCredentialsFilter('MISSING')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                      credentialsFilter === 'MISSING' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Missing ({credentialsStats.missing})
                  </button>
                </div>
              </div>

              {/* Bulk Importer / Exporter Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadCredentialsTemplate}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-all hover:border-amber-500/50"
                  title="Download Excel with all clients pre-populated to fill passwords in bulk"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  Download 300+ Template
                </button>

                <button
                  onClick={() => credentialsExcelInputRef.current?.click()}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-950 transition-all hover:scale-[1.02]"
                  title="Upload completed Excel sheet with usernames & passwords"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Import Credentials Excel
                </button>
                <input
                  type="file"
                  ref={credentialsExcelInputRef}
                  onChange={handleImportCredentialsExcel}
                  accept=".xlsx,.xls"
                  className="hidden"
                />
              </div>
            </div>

            {/* Quick Instruction Banner */}
            <div className="px-5 py-2.5 bg-amber-500/5 border-b border-amber-500/10 flex items-center justify-between text-[11px] text-amber-300">
              <span className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                <strong>Bulk Tip for 300+ Clients:</strong> Click &quot;Download 300+ Template&quot;, copy-paste your Portal Usernames and Passwords into the Excel sheet, and click &quot;Import Credentials Excel&quot; to configure all clients in seconds.
              </span>
              <span className="font-mono text-[10px] text-slate-400 hidden md:inline">
                Showing {filteredCredentials.length} of {credentialsList.length} clients
              </span>
            </div>

            {/* Credentials Table */}
            <div className="flex-1 overflow-y-auto max-h-[50vh] p-4">
              {filteredCredentials.length === 0 ? (
                <div className="text-center py-12 text-slate-500 space-y-2">
                  <Key className="w-10 h-10 mx-auto text-slate-600" />
                  <p className="text-sm font-semibold">No clients match the current search or filter.</p>
                </div>
              ) : (
                <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60 shadow-inner">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400 sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">#</th>
                        <th className="py-2.5 px-3 min-w-[180px]">Client / Trade Name</th>
                        <th className="py-2.5 px-3 min-w-[150px]">GSTIN</th>
                        <th className="py-2.5 px-3 min-w-[180px]">GST Portal Username</th>
                        <th className="py-2.5 px-3 min-w-[200px]">GST Portal Password</th>
                        <th className="py-2.5 px-3 min-w-[130px]">WhatsApp / Phone</th>
                        <th className="py-2.5 px-3 text-center w-28">Status / Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredCredentials.map((c, i) => {
                        const edited = editedCredentials[c.gstin];
                        const currentUsername = edited?.portal_username !== undefined ? edited.portal_username : (c.portal_username || '');
                        const currentPassword = edited?.portal_password !== undefined ? edited.portal_password : (c.portal_password || '');
                        const currentPhone = edited?.phone !== undefined ? edited.phone : (c.phone || '');
                        const isEdited = Boolean(edited);
                        const isConfigured = Boolean(currentUsername && currentPassword);
                        const isPasswordVisible = Boolean(showPasswords[c.gstin]);

                        return (
                          <tr key={c.gstin} className="hover:bg-slate-900/60 transition-colors">
                            <td className="py-2.5 px-3 text-center text-slate-500 font-mono text-[11px]">{i + 1}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-200">
                              <div className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                                <span className="truncate max-w-[180px]" title={c.trade_name}>{c.trade_name}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px] font-bold">
                              {c.gstin}
                            </td>
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                placeholder="Enter Username"
                                value={currentUsername}
                                onChange={e => {
                                  const val = e.target.value;
                                  setEditedCredentials(prev => ({
                                    ...prev,
                                    [c.gstin]: {
                                      portal_username: val,
                                      portal_password: prev[c.gstin]?.portal_password !== undefined ? prev[c.gstin].portal_password : (c.portal_password || ''),
                                      phone: prev[c.gstin]?.phone !== undefined ? prev[c.gstin].phone : (c.phone || ''),
                                      trade_name: c.trade_name
                                    }
                                  }));
                                }}
                                className="w-full px-2.5 py-1 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                              />
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="relative">
                                <input
                                  type={isPasswordVisible ? 'text' : 'password'}
                                  placeholder="Enter Password"
                                  value={currentPassword}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setEditedCredentials(prev => ({
                                      ...prev,
                                      [c.gstin]: {
                                        portal_username: prev[c.gstin]?.portal_username !== undefined ? prev[c.gstin].portal_username : (c.portal_username || ''),
                                        portal_password: val,
                                        phone: prev[c.gstin]?.phone !== undefined ? prev[c.gstin].phone : (c.phone || ''),
                                        trade_name: c.trade_name
                                      }
                                    }));
                                  }}
                                  className="w-full pl-2.5 pr-8 py-1 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPasswords(prev => ({ ...prev, [c.gstin]: !prev[c.gstin] }))}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                  title={isPasswordVisible ? 'Hide password' : 'Show password'}
                                >
                                  {isPasswordVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                placeholder="98200XXXXX"
                                value={currentPhone}
                                onChange={e => {
                                  const val = e.target.value;
                                  setEditedCredentials(prev => ({
                                    ...prev,
                                    [c.gstin]: {
                                      portal_username: prev[c.gstin]?.portal_username !== undefined ? prev[c.gstin].portal_username : (c.portal_username || ''),
                                      portal_password: prev[c.gstin]?.portal_password !== undefined ? prev[c.gstin].portal_password : (c.portal_password || ''),
                                      phone: val,
                                      trade_name: c.trade_name
                                    }
                                  }));
                                }}
                                className="w-full px-2.5 py-1 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono text-[11px]"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {isEdited ? (
                                <button
                                  onClick={() => handleSaveClientCredential(c.gstin)}
                                  className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold shadow-md shadow-amber-950 transition-all hover:scale-[1.03]"
                                >
                                  Save
                                </button>
                              ) : isConfigured ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  Configured
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20">
                                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                                  Missing
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>
                  <strong>Strict Local Storage:</strong> All credentials are saved strictly in your local SQLite database on this machine. They are never transmitted to external cloud servers.
                </span>
              </div>
              <button
                onClick={() => setShowCredentialsModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition-all ml-auto"
              >
                Close Vault
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── FLOATING MULTI-CLIENT SELECTION DOCK ──────────────────────────── */}
      {selectedGstins.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border border-indigo-500/50 shadow-2xl shadow-indigo-950/80 rounded-2xl px-6 py-3 flex items-center gap-4 backdrop-blur-xl animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2 pr-3 border-r border-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping" />
            <span className="text-white font-bold text-xs">
              {selectedGstins.size} Client{selectedGstins.size > 1 ? 's' : ''} Selected
            </span>
          </div>

          <button
            onClick={() => handleOpenBatchSync(Array.from(selectedGstins))}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-900/40 hover:scale-105 transition-all"
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            ⚡ 1-Click Multi-Sync Selected ({selectedGstins.size})
          </button>

          <button
            onClick={() => handleGenerateReviewLinks(Array.from(selectedGstins))}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all hover:scale-105"
          >
            <Smartphone className="w-3.5 h-3.5" />
            Broadcast Links ({selectedGstins.size})
          </button>

          <button
            onClick={() => setSelectedGstins(new Set())}
            className="text-xs text-slate-400 hover:text-white px-2 py-1 transition-colors"
          >
            Clear Selection
          </button>
        </div>
      )}

      {/* ─── BATCH MULTI-SYNC RUNNER MODAL ─────────────────────────────────── */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-4xl w-full bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 space-y-6 shadow-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Zap className="w-5 h-5 text-indigo-400" />
                  </span>
                  <div>
                    <h3 className="text-xl font-black text-white flex items-center gap-2">
                      1-Click Multi-Client IMS Auto-Sync
                    </h3>
                    <p className="text-xs text-slate-400">
                      Automated sequential sync across {batchQueue.length} clients with pre-filled Vault credentials
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  if (isBatchRunning) handleStopBatchQueue();
                  setShowBatchModal(false);
                  if (batchPhase === 'WAITING_20_MIN' || waitingClients.length > 0) {
                    toast.info('⏳ 20-minute waiting timer is active in the background. Track it on the top dashboard banner.', {
                      duration: 4000
                    });
                  }
                }}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                title="Close modal (timers continue in background)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Top Stats Banner */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total in Queue</span>
                <p className="text-xl font-black text-white">{batchQueue.length}</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <span className="text-[10px] uppercase font-bold text-amber-400">Vault Configured</span>
                <p className="text-xl font-black text-amber-300">
                  {batchQueue.filter(q => q.hasCreds).length} / {batchQueue.length}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                <span className="text-[10px] uppercase font-bold text-purple-400">Requested (20m Wait)</span>
                <p className="text-xl font-black text-purple-300">
                  {batchQueue.filter(q => q.status === 'REQUESTED').length}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-[10px] uppercase font-bold text-emerald-400">Synced Successfully</span>
                <p className="text-xl font-black text-emerald-300">
                  {batchQueue.filter(q => q.status === 'SUCCESS').length}
                </p>
              </div>
            </div>

            {/* Active Status & Instructions Callout */}
            {batchPhase === 'WAITING_20_MIN' ? (
              <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-indigo-950/40 to-slate-900 border border-amber-500/40 space-y-3 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-wider">
                        Phase 1 Complete
                      </span>
                      <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-amber-400" />
                        GST Portal Preparing Files (~20 min processing)
                      </h4>
                    </div>
                    <p className="text-xs text-slate-300">
                      Requests submitted for {batchQueue.filter(q => q.status === 'REQUESTED').length} client{batchQueue.filter(q => q.status === 'REQUESTED').length > 1 ? 's' : ''}. Phase 2 auto-starts when timer expires.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="px-4 py-2 rounded-xl bg-slate-950 border border-amber-500/50 text-center shadow-md">
                      <span className="text-[10px] text-amber-400/80 font-bold block uppercase">Phase 2 Starts In</span>
                      <span className="text-2xl font-black font-mono text-amber-300">
                        {formatCountdown(batchSecondsLeft)}
                      </span>
                    </div>

                    <button
                      onClick={handleRunPhase2Queue}
                      className="px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-emerald-950 hover:scale-[1.02] transition-all whitespace-nowrap"
                    >
                      <Zap className="w-4 h-4 fill-current text-amber-300" />
                      ⚡ Collect Ready Downloads Now (Skip Wait)
                    </button>
                  </div>
                </div>
              </div>
            ) : isBatchRunning ? (
              <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/40 space-y-2 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                    <span className="text-xs font-bold text-indigo-200">
                      {batchPhase === 'PHASE_2' ? 'Phase 2: Grabbing Download for ' : 'Phase 1: Processing Client '}
                      {currentBatchIndex + 1} of {batchQueue.length}:{' '}
                      <strong className="text-white">{batchQueue[currentBatchIndex]?.trade_name}</strong>
                    </span>
                  </div>
                  {batchCountdown !== null && (
                    <span className="text-xs font-mono text-amber-400 font-bold">
                      Next client in {batchCountdown}s...
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-indigo-300/80">
                  Chrome is active with auto-filled credentials. Please type the 6-character visual CAPTCHA &amp; click Login. Autopilot will take care of the rest!
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Smart 2-Phase Multi-Sync:
                  </p>
                  <p className="text-[11px] text-slate-400">
                    <strong>Phase 1:</strong> Auto-submits file generation requests for all clients without waiting 20 minutes between each.
                    <br />
                    <strong>Phase 2:</strong> Re-opens portal after 20 minutes to download all prepared files in one go!
                  </p>
                </div>
                <button
                  onClick={handleScanDownloadsFolder}
                  disabled={batchScanningDownloads}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-400 border border-blue-500/30 text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all shadow-md"
                >
                  <FolderSearch className={`w-4 h-4 ${batchScanningDownloads ? 'animate-spin' : ''}`} />
                  ⚡ 1-Click Scan Downloads
                </button>
              </div>
            )}

            {/* Queue List */}
            <div className="flex-1 overflow-y-auto space-y-2 max-h-[340px] pr-1">
              {batchQueue.map((item, idx) => {
                const isCurrent = idx === currentBatchIndex;
                return (
                  <div
                    key={item.gstin}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isCurrent
                        ? 'bg-indigo-950/30 border-indigo-500 shadow-md shadow-indigo-950'
                        : item.status === 'SUCCESS'
                        ? 'bg-emerald-950/10 border-emerald-500/30'
                        : item.status === 'REQUESTED'
                        ? 'bg-amber-950/10 border-amber-500/30'
                        : item.status === 'FAILED'
                        ? 'bg-rose-950/10 border-rose-500/30'
                        : 'bg-slate-950/50 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold font-mono ${
                        item.status === 'SUCCESS'
                          ? 'bg-emerald-500 text-white'
                          : item.status === 'REQUESTED'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : isCurrent
                          ? 'bg-indigo-600 text-white animate-bounce'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {item.status === 'SUCCESS' ? '✓' : idx + 1}
                      </span>
                      <div>
                        <div className="font-bold text-white text-xs flex items-center gap-2">
                          {item.trade_name}
                          {item.hasCreds ? (
                            <span className="text-[10px] text-emerald-400 font-normal">
                              ✓ Credentials Ready
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-400 font-normal">
                              ⚠ Missing Credentials
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">{item.gstin}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.status === 'SUCCESS' ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            Synced ({item.invoiceCount || 0} Invoices)
                          </span>
                          <button
                            onClick={() => {
                              setShowBatchModal(false);
                              handleOpenPortalSync(item.gstin, 'PHASE_1', true);
                            }}
                            disabled={isBatchRunning}
                            className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold flex items-center gap-1 transition-all shadow-sm"
                            title="Clear old IMS data and request fresh JSON generation from GST Portal"
                          >
                            <RefreshCw className="w-2.5 h-2.5" /> Fresh Download
                          </button>
                        </div>
                      ) : item.status === 'REQUESTED' ? (() => {
                        const secLeft = getClientWaitSecondsLeft(item.requestedAt);
                        return secLeft > 0 ? (
                          <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-bold flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3 text-amber-400" />
                            Generating ({formatCountdown(secLeft)} left)
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold flex items-center gap-1 font-mono">
                            <Check className="w-3 h-3 text-emerald-400" />
                            Download Ready
                          </span>
                        );
                      })() : isCurrent ? (
                        <span className="px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-[10px] font-bold flex items-center gap-1 animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          {batchPhase === 'PHASE_2' ? 'Downloading...' : 'Requesting...'}
                        </span>
                      ) : item.status === 'DOWNLOADING' ? (
                        <span className="px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-[10px] font-bold flex items-center gap-1 animate-pulse">
                          <Download className="w-3 h-3 animate-bounce" />
                          Grabbing File...
                        </span>
                      ) : item.status === 'FAILED' ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px] font-bold flex items-center gap-1" title={item.error}>
                            <AlertTriangle className="w-3 h-3" />
                            Failed
                          </span>
                          <button
                            onClick={() => handleOpenPortalSync(item.gstin)}
                            className="px-2 py-0.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 text-[10px] font-bold flex items-center gap-1 transition-colors"
                            title="Retry sync for this client"
                          >
                            <Play className="w-2.5 h-2.5 fill-current" /> Retry
                          </button>
                        </div>
                      ) : item.status === 'SKIPPED' ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-[10px] font-semibold">
                            Skipped
                          </span>
                          <button
                            onClick={() => handleOpenPortalSync(item.gstin)}
                            className="px-2 py-0.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 transition-colors"
                            title="Start sync for this client"
                          >
                            <Play className="w-2.5 h-2.5 fill-current text-emerald-400" /> Run Now
                          </button>
                        </div>
                      ) : (
                        <span className="px-3 py-1 rounded-full bg-slate-800/60 border border-slate-700/60 text-slate-400 text-[10px] font-semibold">
                          Queued
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer Controls */}
            <div className="flex items-center justify-between border-t border-slate-800 pt-4 gap-3">
              <div className="text-xs text-slate-500">
                Period: <strong className="text-slate-300">{activePeriod}</strong>
              </div>

              <div className="flex items-center gap-2">
                {isBatchRunning ? (
                  <>
                    <button
                      onClick={handleSkipCurrentBatchItem}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-all"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                      Skip Client
                    </button>
                    <button
                      onClick={handleStopBatchQueue}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-rose-950"
                    >
                      <Square className="w-3.5 h-3.5" />
                      Stop Queue
                    </button>
                  </>
                ) : batchPhase === 'WAITING_20_MIN' ? (
                  <>
                    <button
                      onClick={() => setShowBatchModal(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
                    >
                      Close (Track on Dashboard)
                    </button>
                    <button
                      onClick={handleRunPhase2Queue}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-emerald-950 hover:scale-[1.02] transition-all"
                    >
                      <Zap className="w-4 h-4 fill-current text-amber-300" />
                      ⚡ Collect Ready Downloads ({batchQueue.filter(q => q.status === 'REQUESTED').length} Clients)
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setShowBatchModal(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
                    >
                      Close
                    </button>
                    {batchQueue.filter(q => q.status !== 'SUCCESS').length === 0 ? (
                      <button
                        onClick={() => handleRunBatchSync(true)}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-indigo-950 hover:scale-[1.02] transition-all"
                      >
                        <RefreshCw className="w-4 h-4" />
                        🔄 Force Fresh Re-Sync (All {batchQueue.length} Clients)
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleRunBatchSync(true)}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/20 text-xs font-bold flex items-center gap-1.5 transition-all"
                          title="Ignore previous sync and re-run all clients fresh"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Re-Sync All Fresh
                        </button>
                        <button
                          onClick={() => handleRunBatchSync(false)}
                          disabled={batchQueue.length === 0}
                          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-emerald-950 hover:scale-[1.02] transition-all"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          ▶ Start Sync ({batchQueue.filter(q => q.status !== 'SUCCESS').length} Remaining Client{batchQueue.filter(q => q.status !== 'SUCCESS').length > 1 ? 's' : ''})
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 📧 EMAIL BROADCAST & GMAIL INTEGRATION MODAL ───────────────────────── */}
      {showEmailBroadcastModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-md">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    IMS Review Broadcast & Gmail Automation
                    {emailSettings.isConfigured ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/40">
                        ● Gmail Ready
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/40">
                        ⚠ Setup Required
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Auto-deliver personalized itemized Excel sheets (.xlsx) + 1-Click mobile review portals to client inboxes
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowEmailBroadcastModal(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Switcher */}
            <div className="flex border-b border-slate-800 bg-slate-950/40 px-5 pt-2 gap-2">
              <button
                onClick={() => setEmailModalTab('BROADCAST')}
                className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-b-2 ${
                  emailModalTab === 'BROADCAST'
                    ? 'border-sky-500 text-sky-400 bg-slate-900/80 shadow-sm'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>📧 Broadcast & Dispatch ({broadcastTargetGstins.length > 0 ? broadcastTargetGstins.length : clients.filter(c => (c.total_invoices || 0) > 0).length || clients.length} Clients)</span>
              </button>

              <button
                onClick={() => setEmailModalTab('GMAIL_CONFIG')}
                className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-b-2 ${
                  emailModalTab === 'GMAIL_CONFIG'
                    ? 'border-indigo-500 text-indigo-400 bg-slate-900/80 shadow-sm'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>⚙️ Gmail SMTP Settings</span>
                {emailSettings.isConfigured ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                )}
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {emailModalTab === 'BROADCAST' ? (
                <>
                  {/* Status Banner */}
                  {!emailSettings.isConfigured ? (
                    <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-amber-200">Gmail SMTP Not Configured</p>
                          <p className="text-[11px] text-amber-300/80">
                            Configure your firm's Gmail and 16-character Google App Password to enable automated email dispatch.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setEmailModalTab('GMAIL_CONFIG')}
                        className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shrink-0 transition-colors"
                      >
                        Setup in 1 Min →
                      </button>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 text-xs text-slate-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>
                          Sender: <strong className="text-white">{emailSettings.sender_name || 'GST Team'}</strong> &lt;<strong className="text-sky-300">{emailSettings.sender_email}</strong>&gt;
                        </span>
                      </div>
                      <button
                        onClick={() => setEmailModalTab('GMAIL_CONFIG')}
                        className="text-[11px] font-bold text-slate-400 hover:text-indigo-400 transition-colors"
                      >
                        Edit Settings ⚙️
                      </button>
                    </div>
                  )}

                  {/* Broadcast Parameters */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Subject Line */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                        <span>Email Subject</span>
                        <span className="text-[10px] text-slate-500">Variables: {'{period}'}, {'{client_name}'}</span>
                      </label>
                      <input
                        type="text"
                        value={broadcastSubject}
                        onChange={(e) => setBroadcastSubject(e.target.value)}
                        placeholder="Action Required: GST IMS Inward Invoices Review..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    {/* CA Note / Instructions */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                        <span>Notice from CA Office (Optional)</span>
                        <span className="text-[10px] text-slate-500">Appears highlighted in email</span>
                      </label>
                      <input
                        type="text"
                        value={broadcastNote}
                        onChange={(e) => setBroadcastNote(e.target.value)}
                        placeholder="e.g. Kindly review all invoices before 11th 5:00 PM..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  {/* Attachment Callout */}
                  <div className="p-3.5 rounded-2xl bg-sky-950/20 border border-sky-500/30 flex items-center gap-3">
                    <FileSpreadsheet className="w-5 h-5 text-sky-400 shrink-0" />
                    <div className="text-xs text-slate-300">
                      <strong className="text-sky-300">Automatic Excel Attachment (.xlsx):</strong> Every client email automatically attaches an itemized Excel workbook with formula sums and interactive status dropdowns (<code className="text-sky-200 font-mono">ACCEPT, REJECT, PENDING</code>) for that specific client!
                    </div>
                  </div>

                  {/* Client List Preview & Inline Email Editor */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                      <span>Target Clients ({broadcastTargetGstins.length > 0 ? broadcastTargetGstins.length : clients.filter(c => (c.total_invoices || 0) > 0).length || clients.length})</span>
                      <span className="text-[11px] text-slate-500">Verify email addresses before dispatching</span>
                    </div>

                    <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60 max-h-64 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900/90 text-slate-400 text-[10px] uppercase font-bold sticky top-0 border-b border-slate-800">
                          <tr>
                            <th className="p-3">Client</th>
                            <th className="p-3">GSTIN</th>
                            <th className="p-3 text-center">Bills</th>
                            <th className="p-3">Email Address</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-300">
                          {(broadcastTargetGstins.length > 0
                            ? clients.filter(c => broadcastTargetGstins.includes(c.gstin))
                            : (clients.filter(c => (c.total_invoices || 0) > 0).length > 0 ? clients.filter(c => (c.total_invoices || 0) > 0) : clients)
                          ).map(c => {
                            const currentEmail = c.email || '';
                            const isEditing = inlineEmailEdits[c.gstin] !== undefined;
                            const emailValue = isEditing ? inlineEmailEdits[c.gstin] : currentEmail;

                            return (
                              <tr key={c.gstin} className="hover:bg-slate-900/40">
                                <td className="p-3 font-semibold text-white max-w-[180px] truncate">
                                  {c.trade_name || c.legal_name || c.gstin}
                                </td>
                                <td className="p-3 font-mono text-[11px] text-slate-400">{c.gstin}</td>
                                <td className="p-3 text-center font-bold text-sky-400">{c.total_invoices || 0}</td>
                                <td className="p-3">
                                  {isEditing ? (
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="email"
                                        value={emailValue}
                                        onChange={(e) => setInlineEmailEdits(prev => ({ ...prev, [c.gstin]: e.target.value }))}
                                        placeholder="client@example.com"
                                        className="px-2 py-1 rounded-lg bg-slate-900 border border-indigo-500 text-white text-xs w-56 focus:outline-none"
                                        autoFocus
                                      />
                                      <button
                                        onClick={() => handleQuickUpdateClientEmail(c.gstin, emailValue)}
                                        className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold transition-colors"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={() => setInlineEmailEdits(prev => {
                                          const next = { ...prev };
                                          delete next[c.gstin];
                                          return next;
                                        })}
                                        className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ) : currentEmail ? (
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-cyan-300 font-mono text-[11px] truncate max-w-[220px]">
                                        {currentEmail}
                                      </span>
                                      <button
                                        onClick={() => setInlineEmailEdits(prev => ({ ...prev, [c.gstin]: currentEmail }))}
                                        className="text-[10px] text-slate-500 hover:text-slate-300 underline"
                                      >
                                        Edit
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <span className="text-amber-400 text-[11px] font-medium flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" /> No email
                                      </span>
                                      <button
                                        onClick={() => setInlineEmailEdits(prev => ({ ...prev, [c.gstin]: '' }))}
                                        className="px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 text-[10px] font-bold transition-colors"
                                      >
                                        + Add Email
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Broadcast Execution Results (if available) */}
                  {broadcastProgress && (
                    <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          Broadcast Results
                        </span>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 font-bold">
                            Sent: {broadcastProgress.sent}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 font-bold">
                            Failed: {broadcastProgress.failed}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 font-bold">
                            Missing Email: {broadcastProgress.missingEmail}
                          </span>
                        </div>
                      </div>

                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                        {broadcastProgress.results?.map(r => (
                          <div
                            key={r.gstin}
                            className={`p-2 rounded-xl text-xs flex items-center justify-between gap-2 ${
                              r.status === 'SENT'
                                ? 'bg-emerald-950/20 text-emerald-300 border border-emerald-500/20'
                                : r.status === 'MISSING_EMAIL'
                                ? 'bg-amber-950/20 text-amber-300 border border-amber-500/20'
                                : 'bg-rose-950/20 text-rose-300 border border-rose-500/20'
                            }`}
                          >
                            <span className="font-bold truncate max-w-[200px]">{r.tradeName || r.gstin}</span>
                            <span className="font-mono text-[11px] text-slate-400 truncate max-w-[180px]">{r.email || 'No Email'}</span>
                            <span className="font-bold text-[10px] uppercase">
                              {r.status === 'SENT' ? '✓ Delivered' : r.status === 'MISSING_EMAIL' ? '⚠ No Email' : `✗ ${r.error || 'Failed'}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* ─── TAB 2: GMAIL CONFIGURATION ─── */
                <div className="space-y-5">
                  <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 space-y-1">
                    <h4 className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                      <Key className="w-4 h-4" />
                      Connect Firm Gmail or Google Workspace Account
                    </h4>
                    <p className="text-[11px] text-slate-300">
                      Emails are dispatched securely using Google's official SMTP servers (<code className="text-indigo-200">smtp.gmail.com</code>). Sent emails will appear directly in your firm's Gmail "Sent" folder, and client replies route to your inbox.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Firm / Sender Name */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300">CA Firm / Sender Name</label>
                      <input
                        type="text"
                        value={emailSettings.sender_name}
                        onChange={(e) => setEmailSettings(prev => ({ ...prev, sender_name: e.target.value }))}
                        placeholder="e.g. Sourav Vaswani & Co."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Sender Gmail Address */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300">Sender Gmail Address</label>
                      <input
                        type="email"
                        value={emailSettings.sender_email}
                        onChange={(e) => setEmailSettings(prev => ({ ...prev, sender_email: e.target.value }))}
                        placeholder="yourname@gmail.com"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* 16-Character App Password */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                        <span>16-Character Google App Password</span>
                        <a
                          href="https://myaccount.google.com/apppasswords"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-sky-400 hover:underline flex items-center gap-0.5"
                        >
                          Generate on Google <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </label>
                      <div className="relative">
                        <input
                          type={showAppPassword ? 'text' : 'password'}
                          value={emailSettings.app_password}
                          onChange={(e) => setEmailSettings(prev => ({ ...prev, app_password: e.target.value }))}
                          placeholder="abcd efgh ijkl mnop"
                          className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono tracking-wider focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAppPassword(!showAppPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                        >
                          {showAppPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-500 block">
                        Spaces will be ignored automatically. NOT your regular Gmail password.
                      </span>
                    </div>

                    {/* CA Helpdesk Phone */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300">CA Office Contact / Phone</label>
                      <input
                        type="text"
                        value={emailSettings.ca_phone}
                        onChange={(e) => setEmailSettings(prev => ({ ...prev, ca_phone: e.target.value }))}
                        placeholder="+91 98765 43210"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Public URL field */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                      <span>Public Base URL for 1-Click Review Links (Optional)</span>
                      <span className="text-[10px] text-slate-500">Defaults to localtunnel or current server host</span>
                    </label>
                    <input
                      type="text"
                      value={emailSettings.public_base_url}
                      onChange={(e) => setEmailSettings(prev => ({ ...prev, public_base_url: e.target.value }))}
                      placeholder="https://reco-vaswani-server.loca.lt"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Connection Test Strip */}
                  <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-slate-200 block">Verify Gmail Connection</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="email"
                          value={testEmailRecipient}
                          onChange={(e) => setTestEmailRecipient(e.target.value)}
                          placeholder="test.recipient@gmail.com"
                          className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs w-60 focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          onClick={handleTestEmailConnection}
                          disabled={isTestingEmail}
                          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-950"
                        >
                          {isTestingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-300" />}
                          Send Test Email
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={handleSaveEmailSettings}
                      disabled={savingEmailSettings}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-950"
                    >
                      {savingEmailSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Save Gmail Settings
                    </button>
                  </div>

                  {/* 60-Second Setup Guide */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <h5 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      How to get your 16-Character Google App Password in 60 seconds:
                    </h5>
                    <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside leading-relaxed">
                      <li>Log in to your Google Account and visit <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">myaccount.google.com/security</a>.</li>
                      <li>Make sure <strong className="text-slate-200">2-Step Verification</strong> is switched <strong className="text-emerald-400">ON</strong>.</li>
                      <li>Go directly to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">myaccount.google.com/apppasswords</a>.</li>
                      <li>Enter App Name as <strong className="text-slate-200">GST IMS Hub</strong>, click <strong className="text-slate-200">Create</strong>, copy the yellow 16-character code, and paste it in the box above!</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 border-t border-slate-800 flex items-center justify-between gap-3 bg-slate-950/60">
              <div className="text-xs text-slate-500">
                Period: <strong className="text-slate-300">{activePeriod}</strong>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowEmailBroadcastModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
                >
                  Close
                </button>

                {emailModalTab === 'BROADCAST' && (
                  <button
                    onClick={handleRunEmailBroadcast}
                    disabled={broadcastRunning}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-sky-950 hover:scale-[1.02] transition-all"
                  >
                    {broadcastRunning ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Dispatching Emails with Excel Sheets...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 text-sky-200" />
                        🚀 Dispatch Broadcast Emails Now ({broadcastTargetGstins.length > 0 ? broadcastTargetGstins.length : clients.filter(c => (c.total_invoices || 0) > 0).length || clients.length} Clients)
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

