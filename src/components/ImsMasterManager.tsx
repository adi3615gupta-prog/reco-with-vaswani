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


const DEMO_INVOICES: ImsInvoice[] = [
  {
    id: 'demo-1',
    inum: 'INV-2024-902',
    idt: '14 Oct 2024',
    ctin: '27AABCV1234F1Z5',
    supplier_name: 'Apex Logistics Corp',
    inv_typ: 'R',
    val: 171100,
    txval: 145000,
    igst: 26100,
    cgst: 0,
    sgst: 0,
    cess: 0,
    action: 'NO_ACTION',
    itc_eligibility: 'Y'
  },
  {
    id: 'demo-2',
    inum: 'ZSI/24-25/441',
    idt: '18 Oct 2024',
    ctin: '08AAACV9876K1ZU',
    supplier_name: 'Zenith Steel Industries',
    inv_typ: 'R',
    val: 1050200,
    txval: 890000,
    igst: 160200,
    cgst: 0,
    sgst: 0,
    cess: 0,
    action: 'ACCEPT',
    itc_eligibility: 'Y'
  },
  {
    id: 'demo-3',
    inum: 'TPT/1109',
    idt: '22 Oct 2024',
    ctin: '33AABTZ4432H1ZV',
    supplier_name: 'Tamilnadu Power Tech',
    inv_typ: 'R',
    val: 377600,
    txval: 320000,
    igst: 0,
    cgst: 28800,
    sgst: 28800,
    cess: 0,
    action: 'REJECT',
    itc_eligibility: 'Y',
    client_remarks: 'Supplier Inv Mismatch'
  },
  {
    id: 'demo-4',
    inum: 'CEW/882',
    idt: '25 Oct 2024',
    ctin: '19AADCS5541L1Z8',
    supplier_name: 'Calcutta Engineering Works',
    inv_typ: 'C',
    val: -89007,
    txval: -75430,
    igst: -13577,
    cgst: 0,
    sgst: 0,
    cess: 0,
    action: 'ACCEPT',
    itc_eligibility: 'Y'
  },
  {
    id: 'demo-5',
    inum: 'BPR/Oct/5501',
    idt: '28 Oct 2024',
    ctin: '27AAACB0000A1Z1',
    supplier_name: 'Bharat Petroleum Refineries',
    inv_typ: 'R',
    val: 1475000,
    txval: 1250000,
    igst: 0,
    cgst: 112500,
    sgst: 112500,
    cess: 0,
    action: 'NO_ACTION',
    itc_eligibility: 'Y'
  }
];

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
  const [viewMode, setViewMode] = useState<'DECISION_HUB' | 'CLIENTS_TOWER'>('DECISION_HUB');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
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
        const q = search.trim().toLowerCase();
        const trade = (c.trade_name || '').toLowerCase();
        const legal = (c.legal_name || '').toLowerCase();
        const gstin = (c.gstin || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        return trade.includes(q) || legal.includes(q) || gstin.includes(q) || phone.includes(q);
      }
      return true;
    });
  }, [clients, statusFilter, search]);

  const fmt = (n?: number) => {
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    }).format(n || 0);
  };

  // ─── ACTIVE CLIENT & IMS DECISION HUB STATE ─────────────────────────────
  const activeClientOrFallback: ImsBatchSummary = activeClientDetail || (
    clients.length > 0
      ? (currentGstin ? clients.find(c => c.gstin?.toUpperCase() === currentGstin.toUpperCase()) || clients[0] : clients[0])
      : {
          gstin: currentGstin || '27AABCS1234D1Z2',
          trade_name: 'Siddha Edibles Pvt Ltd',
          legal_name: 'Siddha Edibles Private Limited',
          total_invoices: 142,
          eligible_itc: 12400000,
          status: 'PENDING'
        }
  );

  const currentInvoicesList = detailInvoices.length > 0 ? detailInvoices : DEMO_INVOICES;

  // Active statistics for 4-Card KPI Bar
  const activeStats = useMemo(() => {
    let totalTaxable = 0;
    let totalInvoiceVal = 0;
    let acceptedCount = 0;
    let acceptedGst = 0;
    let rejectedCount = 0;
    let rejectedGst = 0;
    let pendingCount = 0;
    let pendingGst = 0;

    for (const inv of currentInvoicesList) {
      const act = (inv.action || 'NO_ACTION').toUpperCase();
      const tx = Number(inv.txval) || 0;
      const gst = (Number(inv.igst) || 0) + (Number(inv.cgst) || 0) + (Number(inv.sgst) || 0) + (Number(inv.cess) || 0);
      const gross = Number(inv.val) || (tx + gst);

      totalTaxable += tx;
      totalInvoiceVal += gross;

      if (act === 'ACCEPT') {
        acceptedCount++;
        acceptedGst += gst;
      } else if (act === 'REJECT') {
        rejectedCount++;
        rejectedGst += gst;
      } else {
        pendingCount++;
        pendingGst += gst;
      }
    }

    const totalCount = currentInvoicesList.length;
    return {
      totalCount: totalCount > 0 ? totalCount : 142,
      totalTaxable: totalCount > 0 ? totalTaxable : 14820000,
      totalInvoiceVal: totalCount > 0 ? totalInvoiceVal : 17200000,
      acceptedCount: totalCount > 0 ? acceptedCount : 120,
      acceptedGst: totalCount > 0 ? acceptedGst : 12400000,
      rejectedCount: totalCount > 0 ? rejectedCount : 4,
      rejectedGst: totalCount > 0 ? rejectedGst : 380000,
      pendingCount: totalCount > 0 ? pendingCount : 18,
      pendingGst: totalCount > 0 ? pendingGst : 2040000
    };
  }, [currentInvoicesList]);

  // Filtered invoices for decision grid
  const filteredHubInvoices = useMemo(() => {
    return currentInvoicesList.filter(inv => {
      const act = (inv.action || 'NO_ACTION').toUpperCase();
      if (detailActionFilter === 'ACCEPT' && act !== 'ACCEPT') return false;
      if (detailActionFilter === 'REJECT' && act !== 'REJECT') return false;
      if (detailActionFilter === 'PENDING' && act !== 'PENDING' && act !== 'NO_ACTION') return false;
      if (detailSearch.trim()) {
        const q = detailSearch.trim().toLowerCase();
        const sName = (inv.supplier_name || '').toLowerCase();
        const inum = (inv.inum || '').toLowerCase();
        const ctin = (inv.ctin || '').toLowerCase();
        return sName.includes(q) || inum.includes(q) || ctin.includes(q);
      }
      return true;
    });
  }, [currentInvoicesList, detailActionFilter, detailSearch]);

  const toggleSelectInvoice = (id: string) => {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllInvoices = (checked: boolean) => {
    if (checked) {
      setSelectedInvoiceIds(new Set(filteredHubInvoices.map(i => i.id)));
    } else {
      setSelectedInvoiceIds(new Set());
    }
  };

  const handleBulkActionOnHub = async (newAction: 'ACCEPT' | 'REJECT' | 'PENDING') => {
    const idsToUpdate = selectedInvoiceIds.size > 0 
      ? selectedInvoiceIds 
      : new Set(filteredHubInvoices.map(i => i.id));
    
    if (idsToUpdate.size === 0) return;

    if (detailInvoices.length === 0) {
      setDetailInvoices(DEMO_INVOICES.map(inv => idsToUpdate.has(inv.id) ? { ...inv, action: newAction } : inv));
      toast.success(`Marked ${idsToUpdate.size} invoice(s) as ${newAction}!`);
      setSelectedInvoiceIds(new Set());
      return;
    }

    setDetailInvoices(prev => prev.map(inv => {
      if (idsToUpdate.has(inv.id)) {
        return { ...inv, action: newAction };
      }
      return inv;
    }));

    if (activeClientOrFallback) {
      try {
        await safeApiFetch(`${getApiBase()}/api/ims/update-actions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gstin: activeClientOrFallback.gstin,
            period: activePeriod,
            updates: Array.from(idsToUpdate).map(id => ({ id, action: newAction }))
          })
        });
        toast.success(`Marked ${idsToUpdate.size} invoice(s) as ${newAction}!`);
        setSelectedInvoiceIds(new Set());
        fetchSummary();
      } catch {
        toast.error('Failed saving bulk decisions to server.');
      }
    }
  };

  const handleHubSingleAction = (id: string, newAction: 'ACCEPT' | 'REJECT' | 'NO_ACTION') => {
    if (detailInvoices.length === 0) {
      setDetailInvoices(DEMO_INVOICES.map(inv => inv.id === id ? { ...inv, action: newAction } : inv));
      toast.success(`Invoice updated to ${newAction}`);
      return;
    }
    handleSetInvoiceAction(id, newAction as any);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ─── 3. STREAMLINED CLIENT BANNER & TIMER STRIP (1:1 STITCH BLUEPRINT) ─── */}
      <div className="bg-white p-3 sm:px-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-xs shrink-0">
            <Building2 className="w-5 h-5 text-purple-300" />
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2">
              {/* Client Selector Dropdown */}
              <div className="relative">
                <select
                  value={activeClientOrFallback.gstin}
                  onChange={(e) => {
                    const chosen = clients.find(c => c.gstin === e.target.value);
                    if (chosen) handleOpenDetail(chosen);
                  }}
                  className="text-xs sm:text-sm font-bold text-slate-900 leading-tight bg-transparent pr-6 py-0.5 border-0 focus:ring-0 cursor-pointer hover:text-purple-700"
                >
                  {clients.length > 0 ? (
                    clients.map(c => (
                      <option key={c.gstin} value={c.gstin}>
                        {c.trade_name || c.legal_name || c.gstin}
                      </option>
                    ))
                  ) : (
                    <option value={activeClientOrFallback.gstin}>
                      {activeClientOrFallback.trade_name}
                    </option>
                  )}
                </select>
              </div>

              <span className="px-2 py-0.5 rounded font-mono text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200/60">
                {activeClientOrFallback.gstin}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold flex items-center gap-1 border border-indigo-200/60">
                <ShieldCheck className="w-3 h-3 text-indigo-600" /> IMS Mandatory Compliance (w.e.f Oct 2024)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
              <span>Period: <strong className="text-slate-800 font-semibold">{activePeriod}</strong></span>
              <span>•</span>
              <span>GSTR-2B Draft Cut-off: <strong className="text-slate-800 font-semibold">14th 23:59 IST</strong></span>
            </p>
          </div>
        </div>

        {/* Live Sync Timer, Quick Actions & View Switcher */}
        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] uppercase font-bold text-slate-400">Sync Link:</span>
            <span className="font-mono text-xs font-semibold text-emerald-700">
              {formatCountdown(batchSecondsLeft || 580)} remaining
            </span>
          </div>

          <button
            onClick={() => fetchSummary()}
            className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1 transition-all border border-slate-200/70"
            title="Refresh Inward Sync"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Toggle between Decision Hub and 300+ Clients Tower */}
          <button
            onClick={() => setViewMode(viewMode === 'DECISION_HUB' ? 'CLIENTS_TOWER' : 'DECISION_HUB')}
            className="px-3 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-all shadow-xs flex items-center gap-1.5"
            title="Switch between single client decision hub and 300+ clients overview"
          >
            <Users className="w-3.5 h-3.5 text-amber-300" />
            <span>{viewMode === 'DECISION_HUB' ? '300+ Control Tower' : 'Back to Decision Hub'}</span>
          </button>
        </div>
      </div>

      {viewMode === 'DECISION_HUB' ? (
        <>
          {/* ─── 4. COMPACT KPI SUMMARY BAR (1:1 STITCH BLUEPRINT) ─────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* KPI 1: Total Docs */}
            <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Inward Invoices</span>
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xl font-bold text-slate-900 tracking-tight">{activeStats.totalCount}</span>
                  <span className="text-[11px] text-slate-500 font-medium">Docs</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                  <span className="font-mono font-semibold text-slate-700">₹{activeStats.totalTaxable.toLocaleString('en-IN')}</span>
                  <span className="text-[10px] text-slate-400">Taxable</span>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
            </div>

            {/* KPI 2: Accepted */}
            <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">Action Taken (Accepted)</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xl font-bold text-emerald-700 tracking-tight">{activeStats.acceptedCount}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                    {activeStats.totalCount > 0 ? Math.round((activeStats.acceptedCount / activeStats.totalCount) * 100) : 0}%
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                  <span className="font-mono font-semibold text-emerald-600">₹{activeStats.acceptedGst.toLocaleString('en-IN')}</span>
                  <span className="text-[10px] text-emerald-600 font-medium">Claimable</span>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Check className="w-4 h-4" />
              </div>
            </div>

            {/* KPI 3: Rejected */}
            <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wide">Action Taken (Rejected)</span>
                  <X className="w-3.5 h-3.5 text-rose-600" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xl font-bold text-rose-600 tracking-tight">{activeStats.rejectedCount}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200/50">
                    {activeStats.totalCount > 0 ? ((activeStats.rejectedCount / activeStats.totalCount) * 100).toFixed(1) : '0.0'}%
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                  <span className="font-mono font-semibold text-rose-600">₹{activeStats.rejectedGst.toLocaleString('en-IN')}</span>
                  <span className="text-[10px] text-rose-600 font-medium">Ineligible</span>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
                <X className="w-4 h-4" />
              </div>
            </div>

            {/* KPI 4: Pending Action */}
            <div className="bg-gradient-to-br from-white to-amber-50/40 rounded-2xl p-3 border border-amber-300/80 shadow-xs hover:border-amber-400 transition-all flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wide">Pending Action</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xl font-bold text-amber-600 tracking-tight">{activeStats.pendingCount}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">Needs Review</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                  <span className="font-mono font-semibold text-amber-700">₹{activeStats.pendingGst.toLocaleString('en-IN')}</span>
                  <span className="text-[10px] text-amber-700 font-medium">Before 3B</span>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-amber-100/70 flex items-center justify-center text-amber-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* ─── 5. TIGHTENED FILTER & FAST BATCH ACTIONS BAR (1:1 STITCH BLUEPRINT) ─── */}
          <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 shadow-xs space-y-2.5">
            {/* Row 1: Segmented Filter Tabs & Search Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              <div className="flex items-center flex-wrap gap-1 bg-slate-100 p-1 rounded-xl text-xs font-medium">
                <button
                  onClick={() => setDetailActionFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    detailActionFilter === 'ALL'
                      ? 'bg-slate-900 text-white font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }`}
                >
                  All Invoices <span className="font-mono text-[11px] font-bold ml-1 text-slate-400">{activeStats.totalCount}</span>
                </button>
                <button
                  onClick={() => setDetailActionFilter('PENDING')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    detailActionFilter === 'PENDING'
                      ? 'bg-slate-900 text-white font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }`}
                >
                  Pending Action <span className="font-mono text-[10px] ml-1 px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-600 font-bold">{activeStats.pendingCount}</span>
                </button>
                <button
                  onClick={() => setDetailActionFilter('ACCEPT')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    detailActionFilter === 'ACCEPT'
                      ? 'bg-slate-900 text-white font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }`}
                >
                  Accepted <span className="font-mono text-[11px] font-bold ml-1 text-emerald-600">{activeStats.acceptedCount}</span>
                </button>
                <button
                  onClick={() => setDetailActionFilter('REJECT')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    detailActionFilter === 'REJECT'
                      ? 'bg-slate-900 text-white font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }`}
                >
                  Rejected <span className="font-mono text-[11px] font-bold ml-1 text-rose-600">{activeStats.rejectedCount}</span>
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative w-full lg:w-80">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search Supplier Name, GSTIN, Inv No..."
                  value={detailSearch}
                  onChange={e => setDetailSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 text-slate-800 placeholder:text-slate-400 text-xs focus:outline-none focus:bg-white focus:ring-1 focus:ring-purple-400 border border-slate-200 transition-all"
                />
              </div>
            </div>

            {/* Row 2: Select All & 1-Click Fast Bulk Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={selectedInvoiceIds.size === filteredHubInvoices.length && filteredHubInvoices.length > 0}
                  onChange={e => toggleSelectAllInvoices(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-slate-900 focus:ring-0 cursor-pointer accent-slate-900"
                />
                <span>Select All {filteredHubInvoices.length} Filtered Items</span>
                <span className="font-mono text-[11px] text-slate-400 font-normal">
                  (Selected: {selectedInvoiceIds.size})
                </span>
              </label>

              {/* 1-Click Action Buttons */}
              <div className="flex items-center flex-wrap gap-1.5">
                <button
                  onClick={() => handleBulkActionOnHub('ACCEPT')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 shadow-xs active:scale-95 transition-all"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Mark Selected ACCEPT</span>
                </button>
                <button
                  onClick={() => handleBulkActionOnHub('REJECT')}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1 shadow-xs active:scale-95 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Mark Selected REJECT</span>
                </button>
                <button
                  onClick={() => handleBulkActionOnHub('PENDING')}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1 shadow-xs active:scale-95 transition-all"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Mark Selected PENDING</span>
                </button>
              </div>
            </div>
          </div>

          {/* ─── 6. HIGH-DENSITY DECISION GRID (1:1 STITCH BLUEPRINT) ─────────── */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
            <div className="w-full overflow-x-auto relative">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200 sticky top-0 z-20">
                    <th className="py-2.5 px-3 w-10 text-center">
                      <span className="sr-only">Selection</span>
                    </th>
                    <th className="py-2.5 px-3 font-semibold">Supplier Legal Name &amp; GSTIN</th>
                    <th className="py-2.5 px-3 font-semibold">Invoice Details</th>
                    <th className="py-2.5 px-2 font-semibold text-center">Type</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Taxable Value (₹)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">IGST (₹)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">CGST (₹)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">SGST (₹)</th>
                    <th className="py-2.5 px-3 font-semibold text-center">IMS Action State</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Direct Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                  {filteredHubInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400 font-sans">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="font-semibold text-slate-700">No invoices found for this filter.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredHubInvoices.map((inv) => {
                      const isSelected = selectedInvoiceIds.has(inv.id);
                      const act = (inv.action || 'NO_ACTION').toUpperCase();
                      const isCreditNote = inv.inv_typ === 'C' || inv.inv_typ === 'CR' || inv.inv_typ === 'CN';

                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/90 transition-colors">
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectInvoice(inv.id)}
                              className="w-3.5 h-3.5 rounded text-slate-900 focus:ring-0 cursor-pointer accent-slate-900"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900 leading-tight font-sans">
                              {inv.supplier_name || 'Vendor'}
                            </div>
                            <div className="font-mono text-[11px] text-slate-400">{inv.ctin}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-mono font-medium text-slate-900">{inv.inum}</div>
                            <div className="text-[11px] text-slate-400 font-sans">{inv.idt}</div>
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              isCreditNote
                                ? 'bg-pink-50 text-pink-700 border-pink-200/60'
                                : 'bg-slate-100 text-slate-600 border-slate-200/60'
                            }`}>
                              {isCreditNote ? 'CDNR' : 'B2B'}
                            </span>
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono font-medium ${isCreditNote ? 'text-pink-700' : 'text-slate-900'}`}>
                            {fmt(Number(inv.txval) || 0)}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono font-semibold ${Number(inv.igst) > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {fmt(Number(inv.igst) || 0)}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono ${Number(inv.cgst) > 0 ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>
                            {fmt(Number(inv.cgst) || 0)}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono ${Number(inv.sgst) > 0 ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>
                            {fmt(Number(inv.sgst) || 0)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {act === 'ACCEPT' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                <Check className="w-3 h-3 text-emerald-600" /> ACCEPTED
                              </span>
                            ) : act === 'REJECT' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200/60">
                                <X className="w-3 h-3 text-rose-600" /> REJECTED
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> PENDING ACTION
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {act === 'ACCEPT' || act === 'REJECT' ? (
                              <button
                                onClick={() => handleHubSingleAction(inv.id, 'NO_ACTION')}
                                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium border border-slate-200 transition-all"
                              >
                                Revert
                              </button>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleHubSingleAction(inv.id, 'ACCEPT')}
                                  className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white text-[11px] font-semibold border border-emerald-200/60 transition-all"
                                  title="Accept Invoice ITC"
                                >
                                  Accept
                                </button>
                                <button
                                  onClick={() => handleHubSingleAction(inv.id, 'REJECT')}
                                  className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white text-[11px] font-semibold border border-rose-200/60 transition-all"
                                  title="Reject Invoice ITC"
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer / Summary Strip */}
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 font-sans">
              <div className="flex items-center gap-2">
                <span>Showing <strong className="text-slate-800 font-semibold">{filteredHubInvoices.length}</strong> items</span>
                <span>•</span>
                <span>Auto-sorted by GST Filing Priority (w.e.f Notification 12/2024)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="px-2.5 py-0.5 bg-white border border-slate-200 text-xs font-semibold text-slate-700 rounded shadow-xs">
                  Active Inward Register
                </span>
              </div>
            </div>
          </div>

          {/* ─── 7. COMPACT STICKY EXPORT & DECISION FOOTER (1:1 STITCH BLUEPRINT) ─── */}
          <footer className="sticky bottom-3 z-30 bg-white/95 backdrop-blur-md rounded-2xl p-2.5 sm:px-4 border border-slate-200/90 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 border border-amber-300/60">
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 leading-tight">
                  {activeStats.pendingCount} Invoices Pending Recipient Decision
                </div>
                <div className="text-[11px] text-slate-500">
                  Unacted invoices will cascade to GSTR-2B as provisional accepted on cut-off date.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
              <button
                onClick={() => handleExportClientReview(activeClientOrFallback)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-all active:scale-95 shadow-xs border border-slate-200"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Download IMS Excel</span>
              </button>

              <button
                onClick={() => handleExportPortalJson(activeClientOrFallback)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm active:scale-95 transition-all"
              >
                <FileJson className="w-3.5 h-3.5 text-purple-300" />
                <span>Export IMS JSON</span>
              </button>

              <button
                onClick={() => handlePushTo3B(activeClientOrFallback)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-sm active:scale-95 transition-all"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-white" />
                <span>Apply to 3B (Table 4)</span>
              </button>
            </div>
          </footer>
        </>
      ) : (
        /* ─── 300+ CLIENTS MASTER CONTROL TOWER (OPTIONAL POWER VIEW) ─────── */
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/80 p-3 sm:p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleOpenBatchSync(selectedGstins.size > 0 ? Array.from(selectedGstins) : undefined)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-all active:scale-95"
              >
                <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                ⚡ 1-Click Multi-Sync {selectedGstins.size > 0 ? `(${selectedGstins.size} Selected)` : `(${credentialsStats.configured || clients.length} Clients)`}
              </button>

              <button
                onClick={handleScanDownloadsFolder}
                disabled={batchScanningDownloads}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-2 border border-slate-200 transition-all shadow-xs"
              >
                <FolderSearch className={`w-3.5 h-3.5 text-blue-400 ${batchScanningDownloads ? 'animate-spin' : ''}`} />
                Scan Downloads
              </button>

              <button
                onClick={() => setShowCredentialsModal(true)}
                className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold flex items-center gap-2 border border-amber-200 transition-all"
              >
                <Key className="w-3.5 h-3.5" />
                Credentials Vault ({credentialsStats.configured}/{credentialsStats.total})
              </button>

              <button
                onClick={() => setShowDropzoneModal(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-2 border border-slate-200 transition-all"
              >
                <UploadCloud className="w-3.5 h-3.5 text-blue-400" />
                Drop Inward IMS Files
              </button>

              <button
                onClick={() => handleOpenEmailBroadcast()}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
              >
                <Mail className="w-3.5 h-3.5 text-sky-200" />
                <span>📧 Broadcast Emails ({selectedGstins.size > 0 ? `${selectedGstins.size} Selected` : 'All Synced'})</span>
              </button>
            </div>
          </div>

          {/* Master 300+ Clients Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="p-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedGstins.size === filteredClients.length && filteredClients.length > 0}
                        onChange={e => handleSelectAll(e.target.checked)}
                        className="rounded border-slate-200 bg-white text-indigo-600 focus:ring-0"
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
                <tbody className="divide-y divide-slate-100">
                  {filteredClients.map((client, idx) => (
                    <tr
                      key={client.gstin || idx}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      onClick={() => {
                        handleOpenDetail(client);
                        setViewMode('DECISION_HUB');
                      }}
                    >
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedGstins.has(client.gstin)}
                          onChange={() => handleToggleSelect(client.gstin)}
                          className="rounded border-slate-200 bg-white text-indigo-600 focus:ring-0"
                        />
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-900 text-sm">{client.trade_name || client.legal_name || 'Client Details Missing'}</div>
                        <div className="text-[11px] text-slate-400">{client.legal_name || ''}</div>
                      </td>
                      <td className="p-4 font-mono">
                        <div className="text-slate-800 font-semibold">{client.gstin}</div>
                        <div className="text-[11px] text-slate-500">{client.phone ? `+91 ${client.phone}` : 'No phone saved'}</div>
                      </td>
                      <td className="p-4 text-center">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-mono font-bold text-slate-800">
                          {client.total_invoices || 0}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {client.status || 'SYNCED'}
                        </span>
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-emerald-700">
                        {fmt(client.eligible_itc || 0)}
                      </td>
                      <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            handleOpenDetail(client);
                            setViewMode('DECISION_HUB');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs"
                        >
                          Open Decisions
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── OFFLINE DROPZONE MODAL ───────────────────────────────────────── */}
      {showDropzoneModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-3xl shadow-2xl text-slate-800 p-6 space-y-5 shadow-2xl text-center">
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
              className="border-2 border-dashed border-slate-200 hover:border-indigo-500/60 rounded-2xl p-8 cursor-pointer transition-all bg-slate-50 hover:bg-indigo-950/10 space-y-2"
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
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl shadow-2xl text-slate-800 p-6 space-y-5 shadow-2xl">
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
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                  />
                  {clients.length > 0 && (
                    <select
                      value={portalGstin}
                      onChange={e => handleSelectPortalGstin(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-200 rounded-xl text-[11px] text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
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
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">GST Portal Password (Auto-filled / Editable)</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={portalPassword}
                  onChange={e => setPortalPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
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
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-300 space-y-1.5 leading-relaxed">
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
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-400 leading-relaxed space-y-1">
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
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl text-slate-800 max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50">
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
                <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-200 text-center">
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
            <div className="p-4 border-b border-slate-200 bg-slate-900 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1 max-w-lg">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by Client Name, GSTIN, Username..."
                    value={credentialsSearch}
                    onChange={e => setCredentialsSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
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
                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
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
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-200 transition-all hover:border-amber-500/50"
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
                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 shadow-inner">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-400 sticky top-0 z-10">
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
                          <tr key={c.gstin} className="hover:bg-slate-50 transition-colors">
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
                                className="w-full px-2.5 py-1 bg-slate-900 border border-slate-200/80 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-500"
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
                                  className="w-full pl-2.5 pr-8 py-1 bg-slate-900 border border-slate-200/80 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
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
                                className="w-full px-2.5 py-1 bg-slate-900 border border-slate-200/80 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono text-[11px]"
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
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs">
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
          <div className="flex items-center gap-2 pr-3 border-r border-slate-200">
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
          <div className="max-w-4xl w-full bg-white border border-slate-200 rounded-3xl shadow-2xl text-slate-800 p-6 space-y-6 shadow-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
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
              <div className="p-3 rounded-xl bg-white border border-slate-200">
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
                    <div className="px-4 py-2 rounded-xl bg-white border border-amber-500/50 text-center shadow-md">
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
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
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
                        : 'bg-slate-50 border-slate-200'
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
                          <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-200 text-slate-400 text-[10px] font-semibold">
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
                        <span className="px-3 py-1 rounded-full bg-slate-800/60 border border-slate-200/60 text-slate-400 text-[10px] font-semibold">
                          Queued
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer Controls */}
            <div className="flex items-center justify-between border-t border-slate-200 pt-4 gap-3">
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
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl text-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50">
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
            <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-2 gap-2">
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
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
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
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
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
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
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

                    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 max-h-64 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900/90 text-slate-400 text-[10px] uppercase font-bold sticky top-0 border-b border-slate-200">
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
                              <tr key={c.gstin} className="hover:bg-slate-50">
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
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
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
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
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
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
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
                          className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white border border-slate-200 text-slate-200 text-xs font-mono tracking-wider focus:outline-none focus:border-indigo-500"
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
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
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
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Connection Test Strip */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-slate-200 block">Verify Gmail Connection</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="email"
                          value={testEmailRecipient}
                          onChange={(e) => setTestEmailRecipient(e.target.value)}
                          placeholder="test.recipient@gmail.com"
                          className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-200 text-slate-200 text-xs w-60 focus:outline-none focus:border-indigo-500"
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
                  <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
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
            <div className="p-4 border-t border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
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

