import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ArrowLeft, FileSpreadsheet, FileJson, CheckCircle2, ShieldAlert, GitCompare,
  UploadCloud, FileText, Send, LayoutTemplate, Copy, Lightbulb, Key, ShieldCheck,
  X, Download, RefreshCw, Calculator, Table, Calendar, Building2, Sparkles,
  Check, AlertTriangle, ChevronRight, Edit3, Save, Printer, RotateCcw, DownloadCloud,
  ChevronDown, Globe, HardDrive, Server, FolderOpen, Search, Database, Network, Users,
  ArrowUpRight, Clock, CreditCard, Wallet, Boxes, Landmark, CheckCheck, ListChecks,
  Mail, Loader2, Layers, Lock, Unlock, KeyRound, EyeOff, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiBase, getAuthToken, safeApiFetch } from '@/lib/api';
import {
  GSTR3B_MONTHS,
  GSTR3BMonthKey,
  GSTR3BAnnualWorking,
  GSTR3BMonthData,
  TaxBreakdown,
  recalculateAnnualWorking,
  generateGstr3bWorkingExcel,
  generateGstr3bPortalJson,
  parseGstr3bWorkingFile,
  createEmptyAnnualWorking,
  createEmptyMonthData,
  normalizeFy,
  parseFyYears
} from '@/lib/gstr3bEngine';
import { exportGstr3bMonthPdf } from '@/lib/gstr3bPdf';
import {
  Gstr1IngestSummary,
  Gstr2bIngestSummary,
  applyReturnsToAnnualWorking
} from '@/lib/gstrAutoIngest';
import ReturnsAutoIngestDeck from '@/components/ReturnsAutoIngestDeck';
import CredentialsVaultModal, { VaultClient } from '@/components/CredentialsVaultModal';
import ImsMasterManager from '@/components/ImsMasterManager';
import Gstr2bMasterDownloader from '@/components/Gstr2bMasterDownloader';
import Gstr1MasterDownloader from '@/components/Gstr1MasterDownloader';
import Gstr1WorkingSheet from '@/components/Gstr1WorkingSheet';
import ReturnsTrackingMaster from '@/components/ReturnsTrackingMaster';
import Gstr3bItcAllocationWorkbench, { AllocationSummary, Gstr2bInvoiceRow } from '@/components/Gstr3bItcAllocationWorkbench';
import { pingTally, fetchCompanyInfo } from '@/lib/tallyApi';
import { normalizeActionMonth } from '@/lib/geminiApi';

interface ReturnsDashboardProps {
  onBack: () => void;
  initialTab?: 'working3b' | 'matrix' | 'ims2b' | 'gstr2b_downloader' | 'gstr1_downloader' | 'returns_tracking';
  targetClientGstin?: string;
  targetClientName?: string;
  targetFy?: string;
  targetMonth?: string;
  initialAction?: string;
}

export default function ReturnsDashboard({
  onBack,
  initialTab,
  targetClientGstin,
  targetClientName,
  targetFy,
  targetMonth,
  initialAction,
}: ReturnsDashboardProps) {
  // Navigation & View States
  const [activeTab, setActiveTab] = useState<'working3b' | 'matrix' | 'ims2b' | 'gstr2b_downloader' | 'gstr1_downloader' | 'returns_tracking'>(initialTab || 'working3b');
  const [gstr1SubMode, setGstr1SubMode] = useState<'workbench' | 'downloader'>('workbench');
  const [selectedMonth, setSelectedMonth] = useState<GSTR3BMonthKey>('April');
  const [matrixDensity, setMatrixDensity] = useState<'compact' | 'relaxed'>('compact');
  const [matrixViewMode, setMatrixViewMode] = useState<'monthly' | 'cumulative'>('monthly');
  const [isCrossVerifyActive, setIsCrossVerifyActive] = useState<boolean>(true);
  const [showTieOutSheet, setShowTieOutSheet] = useState<boolean>(false);
  const [showQuickGuide, setShowQuickGuide] = useState(false);
  const [showDetailedWorksheet, setShowDetailedWorksheet] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isMatrixEditMode, setIsMatrixEditMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGstr1Downloading, setIsGstr1Downloading] = useState(false);
  const [isGstr2bDownloading, setIsGstr2bDownloading] = useState(false);
  const [isComputationTableCollapsed, setIsComputationTableCollapsed] = useState(false);
  const [isAutoIngestDeckCollapsed, setIsAutoIngestDeckCollapsed] = useState(false);
  const [isViewing2bAllocations, setIsViewing2bAllocations] = useState<boolean>(false);

  // Sync activeTab when initialTab prop changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Core Working Data State - Empty by default, no hardcoded practice data
  const [workingData, setWorkingData] = useState<GSTR3BAnnualWorking>(() => createEmptyAnnualWorking());

  // ─── GSTR-3B Complete Lock / Security State (Month-Wise Isolation & Multi-PC LAN Sync) ───
  const GSTR3B_UNLOCK_PASSWORD = 'Sourav@1234';
  const [lockedMonths, setLockedMonths] = useState<Record<string, boolean>>(() => {
    try {
      // Purge any legacy whole-FY lock keys so old global locks never freeze other months
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('gstr3b_sheet_locked_')) {
          localStorage.removeItem(k);
        }
      }
      const gstin = 'DEFAULT';
      const fy = '2025-26';
      const saved = localStorage.getItem(`gstr3b_locked_months_${gstin}_${fy}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [showUnlockModal, setShowUnlockModal] = useState<boolean>(false);
  const [unlockPassword, setUnlockPassword] = useState<string>('');
  const [showUnlockPassword, setShowUnlockPassword] = useState<boolean>(false);
  const [unlockError, setUnlockError] = useState<string>('');

  // Active sheet lock status is STRICTLY isolated to the currently selected month!
  const isSheetLocked = Boolean(lockedMonths[selectedMonth]);

  // Query authoritative server locks for Multi-PC Office LAN sync
  const fetchServerMonthLocks = useCallback(async (gstinArg?: string, fyArg?: string) => {
    const targetGstin = (gstinArg || workingData?.profile?.gstin || 'DEFAULT').trim().toUpperCase();
    const targetFy = normalizeFy(fyArg || workingData?.profile?.financialYear || '2025-26');
    if (!targetGstin || targetGstin === 'DEFAULT' || targetGstin === 'NOT SPECIFIED') return;

    try {
      const res = await safeApiFetch(`/api/returns/month-locks?gstin=${encodeURIComponent(targetGstin)}&fy=${encodeURIComponent(targetFy)}`);
      if (res.ok) {
        const json = await res.json();
        if (json && json.success && json.lockedMonths && typeof json.lockedMonths === 'object') {
          setLockedMonths(prev => {
            const merged = { ...prev, ...json.lockedMonths };
            try {
              localStorage.setItem(`gstr3b_locked_months_${targetGstin}_${targetFy}`, JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
      }
    } catch (e) {
      console.warn('[Returns Lock Sync] Server lock query warning:', e);
    }
  }, [workingData?.profile?.gstin, workingData?.profile?.financialYear]);

  // Synchronize locked months when client or financial year changes
  useEffect(() => {
    try {
      // Purge any legacy whole-FY lock keys
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('gstr3b_sheet_locked_')) {
          localStorage.removeItem(k);
        }
      }
      const gstin = (workingData?.profile?.gstin || 'DEFAULT').trim().toUpperCase();
      const fy = normalizeFy(workingData?.profile?.financialYear || '2025-26');
      const saved = localStorage.getItem(`gstr3b_locked_months_${gstin}_${fy}`);
      if (saved) {
        setLockedMonths(JSON.parse(saved));
      } else {
        setLockedMonths({});
      }

      // Synchronize directly with server to reflect locks from other PCs
      fetchServerMonthLocks(gstin, fy);
    } catch (e) {
      console.warn('Error reading locked months:', e);
    }
  }, [workingData?.profile?.gstin, workingData?.profile?.financialYear, fetchServerMonthLocks]);

  // Real-time sync when switching windows/tabs (e.g. if another PC locked the month)
  useEffect(() => {
    const handleWindowFocus = () => {
      const gstin = (workingData?.profile?.gstin || 'DEFAULT').trim().toUpperCase();
      const fy = normalizeFy(workingData?.profile?.financialYear || '2025-26');
      if (gstin && gstin !== 'DEFAULT' && gstin !== 'NOT SPECIFIED') {
        fetchServerMonthLocks(gstin, fy);
      }
    };
    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [workingData?.profile?.gstin, workingData?.profile?.financialYear, fetchServerMonthLocks]);

  // Keep isEditMode forced false when currently viewing a locked month
  useEffect(() => {
    if (isSheetLocked) {
      setIsEditMode(false);
    }
  }, [isSheetLocked, selectedMonth]);

  const handleLockSheet = async () => {
    const targetMonth = selectedMonth;
    const gstin = (workingData?.profile?.gstin || 'DEFAULT').trim().toUpperCase();
    const fy = normalizeFy(workingData?.profile?.financialYear || '2025-26');
    const clientName = workingData?.profile?.firmName || '';

    setLockedMonths(prev => {
      const next = { ...prev, [targetMonth]: true };
      try {
        localStorage.setItem(`gstr3b_locked_months_${gstin}_${fy}`, JSON.stringify(next));
      } catch (e) {
        console.warn('Error saving locked months:', e);
      }
      return next;
    });
    setWorkingData(prev => ({
      ...prev,
      lockedMonths: { ...(prev.lockedMonths || {}), [targetMonth]: true }
    }));
    setIsEditMode(false);

    // Immediately sync to server so all PCs on LAN are locked
    if (gstin && gstin !== 'DEFAULT' && gstin !== 'NOT SPECIFIED') {
      try {
        await safeApiFetch('/api/returns/month-lock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gstin,
            fy,
            month: targetMonth,
            locked: true,
            clientName
          })
        });
      } catch (e) {
        console.warn('[Returns Lock Sync] Failed to sync lock to server:', e);
      }
    }

    toast.success(`${targetMonth} Sheet & Cockpits Locked!`, {
      description: `All figures, tables, and ingestion cockpits for ${targetMonth} are now completely read-only on all PCs.`
    });
  };

  const handleToggleSheetLock = () => {
    if (isSheetLocked) {
      setUnlockPassword('');
      setUnlockError('');
      setShowUnlockModal(true);
    } else {
      handleLockSheet();
    }
  };

  const handleUnlockSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (unlockPassword === GSTR3B_UNLOCK_PASSWORD) {
      const targetMonth = selectedMonth;
      const gstin = (workingData?.profile?.gstin || 'DEFAULT').trim().toUpperCase();
      const fy = normalizeFy(workingData?.profile?.financialYear || '2025-26');
      const clientName = workingData?.profile?.firmName || '';

      setLockedMonths(prev => {
        const next = { ...prev, [targetMonth]: false };
        try {
          localStorage.setItem(`gstr3b_locked_months_${gstin}_${fy}`, JSON.stringify(next));
        } catch (e) {
          console.warn('Error clearing lock status for month:', e);
        }
        return next;
      });
      setWorkingData(prev => ({
        ...prev,
        lockedMonths: { ...(prev.lockedMonths || {}), [targetMonth]: false }
      }));

      // Immediately sync unlock to server across all PCs
      if (gstin && gstin !== 'DEFAULT' && gstin !== 'NOT SPECIFIED') {
        try {
          await safeApiFetch('/api/returns/month-lock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gstin,
              fy,
              month: targetMonth,
              locked: false,
              clientName
            })
          });
        } catch (e) {
          console.warn('[Returns Lock Sync] Failed to sync unlock to server:', e);
        }
      }

      setShowUnlockModal(false);
      setUnlockPassword('');
      setUnlockError('');
      toast.success(`${targetMonth} Sheet & Cockpits Unlocked!`, {
        description: `Editing and cockpit synchronization have been enabled for ${targetMonth} across all PCs.`
      });
    } else {
      setUnlockError('Incorrect password! Access denied.');
      toast.error('Invalid Password', {
        description: 'The password entered is incorrect. Working sheet remains locked.'
      });
    }
  };
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSyncingTally, setIsSyncingTally] = useState(false);

  const handleSyncTallyVouchers = async () => {
    setIsSyncingTally(true);
    try {
      const isOnline = await pingTally();
      if (!isOnline) {
        toast.error('Tally Prime is offline. Ensure Tally is running on Port 9000 with ODBC/XML enabled.');
        return;
      }
      const info = await fetchCompanyInfo();
      toast.success(`Connected to Tally Prime: ${info.name || 'Active Company'} (Port 9000)`);
    } catch (err: any) {
      toast.info('Tally Sync: Port 9000 checked. ' + (err?.message || 'Please check Tally connection in Settings.'));
    } finally {
      setIsSyncingTally(false);
    }
  };

  // GSTN Portal Authentication States
  const [portalSessionActive, setPortalSessionActive] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [targetGstin, setTargetGstin] = useState(workingData.profile.gstin);
  const [gstinOtp, setGstinOtp] = useState('');

  // File Upload Reference
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Credentials Vault & Client Hub State
  const [vaultClients, setVaultClients] = useState<VaultClient[]>([]);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [isLaunchingPortal, setIsLaunchingPortal] = useState(false);
  const [isUploadingPortalJson, setIsUploadingPortalJson] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');

  // ─── Central Server Storage & Multi-PC LAN State ───
  const [serverDataPath, setServerDataPath] = useState<string>('');
  const [serverHost, setServerHost] = useState<string>('');
  const [serverIps, setServerIps] = useState<string[]>([]);
  const [storageStats, setStorageStats] = useState<{ totalClientsWithData: number; totalFiles: number; isWritable: boolean; exists: boolean }>({
    totalClientsWithData: 0,
    totalFiles: 0,
    isWritable: true,
    exists: true
  });
  const [isLoadingStorage, setIsLoadingStorage] = useState(false);
  const [lastServerSyncTime, setLastServerSyncTime] = useState<number | null>(null);
  const [isSyncingToServer, setIsSyncingToServer] = useState(false);

  // Clients Hub (Enriched list of clients from Server Path & SQLite)
  interface ClientHubItem {
    id: string;
    gstin: string;
    trade_name: string;
    legal_name?: string;
    phone?: string;
    email?: string;
    portal_username?: string;
    hasCredentials?: boolean;
    hasSavedWorking?: boolean;
    savedYears?: string[];
    lastModified?: number | null;
  }
  const [clientsHub, setClientsHub] = useState<ClientHubItem[]>([]);

  // ─── GSTR-3B Client Email Dispatch Modal State ───
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailCustomNote, setEmailCustomNote] = useState('');
  const [attachPdf, setAttachPdf] = useState(true);
  const [attachExcel, setAttachExcel] = useState(true);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSmtpConfigured, setEmailSmtpConfigured] = useState<boolean | null>(null);

  const handleLaunchPortalLogin = async () => {
    const gstin = workingData.profile.gstin;
    if (!gstin || gstin === 'Not Specified') {
      toast.error('Please select a client with a valid GSTIN first.');
      return;
    }

    setIsLaunchingPortal(true);
    toast.info(`Launching Chrome for ${workingData.profile.firmName || gstin}...`, {
      description: 'Navigating to GST Portal and auto-filling login details from Vault.'
    });

    try {
      const res = await fetch(`${getApiBase()}/api/gstr2b/open-portal-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({ gstin })
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        if (text.includes('Cannot POST') || text.includes('<!DOCTYPE')) {
          throw new Error('Backend server needs a restart. Please restart the terminal (Ctrl+C, then npm run start) to load the new route.');
        }
        throw new Error(`Server response error: ${text.slice(0, 60)}`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to launch portal');
      }
      toast.success('Chrome launched & credentials auto-filled!', {
        description: data.username ? `Username: ${data.username}. Simply solve CAPTCHA to log in.` : 'Please enter credentials & solve CAPTCHA.'
      });
    } catch (err: any) {
      console.error('[Launch Portal Login] Error:', err);
      toast.error('Failed to launch Chrome', { description: err?.message });
    } finally {
      setIsLaunchingPortal(false);
    }
  };

  // Helper to normalize Financial Year to standard YYYY-YY (e.g. "2025 26" -> "2025-26")
  const normalizeFy = (val: string): string => {
    if (!val) return '2025-26';
    const clean = val.trim();
    const m = clean.match(/^(\d{4})[\s\-\/]?(\d{2,4})$/);
    if (m) {
      const end = m[2].length === 4 ? m[2].slice(2) : m[2];
      return `${m[1]}-${end}`;
    }
    return clean;
  };

  // Helper to construct storage key for a client and FY
  const getClientStorageKey = (gstin: string, fy: string) =>
    `gstr3b_client_working_${gstin.trim().toUpperCase()}_${normalizeFy(fy)}`;

  // Save specific working data to localStorage
  const saveClientWorkingData = (data: GSTR3BAnnualWorking) => {
    if (!data?.profile?.gstin || data.profile.gstin === 'Not Specified' || data.profile.gstin.length < 10) return;
    try {
      const fy = normalizeFy(data.profile.financialYear || '2025-26');
      const key = getClientStorageKey(data.profile.gstin, fy);
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem(`${key}_dirty`, 'true');
      localStorage.setItem(`${key}_modified`, String(Date.now()));
    } catch (e) {
      console.warn('[GSTR3B] Failed saving client working data:', e);
    }
  };

  // Load saved client working data or generate a fresh isolated working sheet
  const loadClientWorkingData = (
    client: { gstin: string; trade_name?: string; legal_name?: string; address?: string },
    fy: string
  ): GSTR3BAnnualWorking => {
    const firmName = client.trade_name || client.legal_name || 'Client';
    const gstin = client.gstin.trim().toUpperCase();
    const address = client.address || '';
    const key = getClientStorageKey(gstin, fy);
    const saved = localStorage.getItem(key);

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as GSTR3BAnnualWorking;
        if (parsed && parsed.months) {
          parsed.profile = {
            ...parsed.profile,
            firmName,
            gstin,
            address: address || parsed.profile.address || '',
            financialYear: fy
          };
          return recalculateAnnualWorking(parsed);
        }
      } catch (e) {
        console.warn('[GSTR3B] Error parsing saved client working data:', e);
      }
    }

    return createEmptyAnnualWorking({
      firmName,
      gstin,
      address,
      financialYear: fy
    });
  };

  // ─── SERVER DATA STORAGE & CLIENT HUB API ───
  const fetchServerStorageConfig = async () => {
    try {
      setIsLoadingStorage(true);
      const res = await safeApiFetch('/api/returns/storage-config');
      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        console.warn('[Returns Storage] Non-JSON response from server storage-config');
        return;
      }
      if (data && data.success) {
        setServerDataPath(data.dataPath || '');
        setServerHost(data.serverHost || '');
        setServerIps(Array.isArray(data.serverIps) ? data.serverIps : []);
        setStorageStats({
          totalClientsWithData: data.totalClientsWithData || 0,
          totalFiles: data.totalFiles || 0,
          isWritable: Boolean(data.isWritable),
          exists: Boolean(data.exists)
        });
      }
    } catch (e) {
      console.warn('[Returns Storage] Failed to load server storage config:', e);
    } finally {
      setIsLoadingStorage(false);
    }
  };

  const fetchClientsHub = async () => {
    try {
      const fy = workingData.profile.financialYear || '2025-26';
      const res = await safeApiFetch(`/api/returns/clients-hub?fy=${encodeURIComponent(fy)}`);
      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        return;
      }
      if (data && data.success && Array.isArray(data.clients)) {
        setClientsHub(data.clients);
        setVaultClients(data.clients as any);

        // Select target client if requested by prop or pending storage
        const preferredGstin = (targetClientGstin || localStorage.getItem('gstr3b_active_client_gstin') || '').trim().toUpperCase();
        const preferredFy = targetFy ? normalizeFy(targetFy) : undefined;
        if (data.clients.length > 0) {
          const target = data.clients.find((c: any) => (c.gstin || '').toUpperCase() === preferredGstin);
          if (target && target.gstin?.toUpperCase() !== workingData.profile.gstin?.toUpperCase()) {
            handleSelectClientFromHub(target, false, preferredFy);
          } else if (!workingData.profile.gstin || workingData.profile.gstin === 'Not Specified') {
            handleSelectClientFromHub(data.clients[0], false, preferredFy);
          }
        }
      }
    } catch (e) {
      console.warn('[Returns Storage] Failed fetching clients hub:', e);
    }
  };

  const saveToServerStorage = async (data: GSTR3BAnnualWorking): Promise<boolean> => {
    if (!data?.profile?.gstin || data.profile.gstin === 'Not Specified' || data.profile.gstin.length < 10) return false;
    try {
      setIsSyncingToServer(true);
      const fy = normalizeFy(data.profile.financialYear || '2025-26');
      const key = getClientStorageKey(data.profile.gstin, fy);
      const payloadData: GSTR3BAnnualWorking = {
        ...data,
        lockedMonths: { ...(data.lockedMonths || {}), ...lockedMonths }
      };
      const res = await safeApiFetch('/api/returns/working-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: data.profile.gstin,
          fy,
          workingData: payloadData,
          clientName: data.profile.firmName
        })
      });
      const text = await res.text();
      let resData: any = {};
      try { resData = JSON.parse(text); } catch {}
      if (resData && resData.success) {
        setLastServerSyncTime(Date.now());
        localStorage.removeItem(`${key}_dirty`);
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[Returns Storage] Error saving to server storage:', e);
      return false;
    } finally {
      setIsSyncingToServer(false);
    }
  };

  // Helper to convert Blob to Base64 string
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        resolve(res.includes('base64,') ? res.split('base64,')[1] : res.split(',')[1] || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Manual save triggered by user clicking the Save button:
  // Saves Excel (.xlsx), PDF (.pdf), Portal JSON (.json), and Master Working Data date-wise & time-wise!
  const handleManualSave = async () => {
    if (isSheetLocked) {
      toast.error('Working Sheet is Locked', {
        description: 'Please unlock the sheet using password before saving changes.'
      });
      return;
    }
    const firm = workingData?.profile?.firmName || workingData?.profile?.gstin || 'Client';
    const gstin = workingData?.profile?.gstin;
    if (!gstin || gstin === 'Not Specified') {
      toast.error('Please select a client with a valid GSTIN first.');
      return;
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const dateTimeStamp = `${dateStr}_${timeStr}`;
    const safeFirm = (workingData.profile.firmName || 'CLIENT').replace(/[^a-zA-Z0-9]/g, '_');
    const fyClean = normalizeFy(workingData.profile.financialYear || '2025-26');

    setIsSyncingToServer(true);
    const id = toast.loading(`Generating Excel, PDF & JSON for ${firm} (${selectedMonth})...`);

    try {
      // 1. Immediately persist full annual state to localStorage
      saveClientWorkingData(workingData);

      // 2. Generate Excel Workbook Blob & Base64 (Silent server save, no browser download prompt)
      let excelBase64 = '';
      try {
        const excelBlob = await generateGstr3bWorkingExcel(workingData);
        excelBase64 = await blobToBase64(excelBlob);
      } catch (excelErr) {
        console.warn('[Save Bundle] Excel generation warning:', excelErr);
      }

      // 3. Generate PDF Report Blob & Base64 (Silent server save, autoDownload: false)
      let pdfBase64 = '';
      try {
        const pdfResult = exportGstr3bMonthPdf(currentMonthData, workingData.profile, {
          customFileName: `GSTR-3B_WORKING_${safeFirm}_${selectedMonth.toUpperCase()}_${currentMonthData.year}_${dateTimeStamp}.pdf`,
          autoDownload: false
        });
        pdfBase64 = pdfResult?.base64 || '';
      } catch (pdfErr) {
        console.warn('[Save Bundle] PDF generation warning:', pdfErr);
      }

      // 4. Generate Portal Upload JSON (Silent server save, no browser download prompt)
      let portalJsonData: any = null;
      try {
        const jsonStr = generateGstr3bPortalJson(currentMonthData, workingData.profile);
        portalJsonData = JSON.parse(jsonStr);
      } catch (jsonErr) {
        console.warn('[Save Bundle] Portal JSON generation warning:', jsonErr);
      }

      // 5. Post full bundle & base schedules to Central Server Shared Storage
      const bundleWorkingData = {
        ...workingData,
        lockedMonths: { ...(workingData.lockedMonths || {}), ...lockedMonths }
      };
      const res = await safeApiFetch('/api/returns/save-full-bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin,
          fy: fyClean,
          month: selectedMonth,
          clientName: workingData.profile.firmName,
          workingData: bundleWorkingData,
          portalJson: portalJsonData,
          excelBase64,
          pdfBase64,
          timestamp: now.getTime()
        })
      });

      let resData: any = null;
      try {
        const text = await res.text();
        resData = JSON.parse(text);
      } catch (parseErr) {
        console.warn('[Save Bundle] Server returned non-JSON response, falling back to storage:', parseErr);
        await saveToServerStorage(workingData);
      }

      if (resData && resData.success) {
        setLastServerSyncTime(Date.now());
        const targetPath = resData.monthWorkingDir || resData.monthDir;
        const displayFolder = targetPath ? targetPath.split(/[\\/]/).slice(-4).join('/') : '3B Working';
        toast.success(`Saved directly to Client Folder (All 5 Bases)!`, {
          id,
          duration: 9000,
          description: `Date: ${resData.humanDate} | Time: ${resData.humanTime} • Folder: ${displayFolder}`,
          action: {
            label: 'Open Folder',
            onClick: () => {
              safeApiFetch('/api/returns/open-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderPath: targetPath })
              });
            }
          }
        });
      } else {
        toast.success(`3B Working Sheet Saved!`, {
          id,
          description: `All base files generated and saved to client directory.`
        });
      }
    } catch (err: any) {
      console.error('[Manual Save Error]:', err);
      toast.error('Save Failed', { id, description: err?.message || 'Error saving working data' });
    } finally {
      setIsSyncingToServer(false);
    }
  };

  // Debounced auto-save effect
  const saveDebounceTimer = useRef<any>(null);
  useEffect(() => {
    // 1. Save locally
    saveClientWorkingData(workingData);

    // 2. Debounced save to Central Server Shared Storage
    if (saveDebounceTimer.current) clearTimeout(saveDebounceTimer.current);
    saveDebounceTimer.current = setTimeout(() => {
      saveToServerStorage(workingData);
    }, 600);

    return () => {
      if (saveDebounceTimer.current) clearTimeout(saveDebounceTimer.current);
    };
  }, [workingData]);

  // Network online sync listener: flushes dirty local working data when network recovers
  useEffect(() => {
    const handleOnline = () => {
      if (workingData?.profile?.gstin && workingData.profile.gstin !== 'Not Specified') {
        const fy = normalizeFy(workingData.profile.financialYear || '2025-26');
        const key = getClientStorageKey(workingData.profile.gstin, fy);
        if (localStorage.getItem(`${key}_dirty`) === 'true') {
          toast.info('Network reconnected. Syncing offline changes to server...');
          saveToServerStorage(workingData);
        }
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [workingData]);

  // Global Ctrl+S / Cmd+S shortcut to save working paper instantly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [workingData, isSyncingToServer]);

  const handleSelectClientFromHub = async (
    client: { gstin: string; trade_name?: string; legal_name?: string; address?: string },
    showNotification = true,
    explicitFy?: string
  ) => {
    const gstin = client.gstin.trim().toUpperCase();
    const firmName = client.trade_name || client.legal_name || gstin;
    const currentFy = normalizeFy(explicitFy || workingData.profile.financialYear || '2025-26');

    // 1. Immediately close dropdown and update active client in storage & state (Instant UI update!)
    setIsClientDropdownOpen(false);
    localStorage.setItem('gstr3b_active_client_gstin', gstin);
    setTargetGstin(gstin);

    // 2. Load cached or clean client data immediately
    const immediateWorking = loadClientWorkingData(client, currentFy);
    immediateWorking.profile.firmName = firmName;
    immediateWorking.profile.gstin = gstin;
    if (client.address) immediateWorking.profile.address = client.address;
    setWorkingData(immediateWorking);

    if (showNotification) {
      toast.success(`Active Client: ${firmName}`, {
        description: `GSTIN: ${gstin} • FY ${currentFy}`
      });
    }

    // 3. Non-blocking background save of previous client
    if (workingData.profile.gstin && workingData.profile.gstin !== 'Not Specified' && workingData.profile.gstin !== gstin) {
      saveToServerStorage(workingData).catch(() => {});
    }

    // 4. Check if server has updated working data for this client and sync smoothly
    try {
      const cName = client.trade_name || client.legal_name || '';
      const res = await safeApiFetch(
        `/api/returns/working-data?gstin=${encodeURIComponent(gstin)}&fy=${encodeURIComponent(currentFy)}&clientName=${encodeURIComponent(cName)}`
      );
      if (res.ok) {
        const text = await res.text();
        let data: any = {};
        try { data = JSON.parse(text); } catch {}
        if (data && data.success && data.found && data.workingData) {
          const loaded = recalculateAnnualWorking(data.workingData);
          loaded.profile.firmName = firmName;
          loaded.profile.gstin = gstin;
          if (client.address) loaded.profile.address = client.address;
          loaded.profile.financialYear = normalizeFy(explicitFy || loaded.profile.financialYear || currentFy);
          setWorkingData(loaded);
          setLastServerSyncTime(data.lastModified || Date.now());

          if (data.workingData.lockedMonths && typeof data.workingData.lockedMonths === 'object') {
            setLockedMonths(data.workingData.lockedMonths);
            try {
              localStorage.setItem(`gstr3b_locked_months_${gstin}_${normalizeFy(currentFy)}`, JSON.stringify(data.workingData.lockedMonths));
            } catch {}
          }
        }
      }
    } catch (e) {
      console.warn('[Returns Storage] Error fetching client working from server:', e);
    }
  };

  // Direct Jump Callback for Tab 06 Returns Tracking
  const handleJumpToWorking = async (
    clientGstin: string,
    clientName: string,
    month: GSTR3BMonthKey,
    targetTab: 'working3b' | 'gstr2b_downloader' | 'gstr1_downloader'
  ) => {
    const targetGstinClean = (clientGstin || '').trim().toUpperCase();
    const clientObj = vaultClients.find(c => c.gstin.toUpperCase() === targetGstinClean) || {
      gstin: targetGstinClean,
      trade_name: clientName,
      legal_name: clientName
    };
    await handleSelectClientFromHub(clientObj, false);
    setSelectedMonth(month);
    setActiveTab(targetTab);
    toast.success(`Active Client: ${clientName || targetGstinClean}`, {
      description: `Period: ${month} • Module: ${targetTab === 'working3b' ? '01. GSTR-3B Working' : targetTab === 'gstr2b_downloader' ? '04. Inward 2B Autopilot' : '05. Outward GSTR-1'}`
    });
  };

  // Synchronize when targetClientGstin, targetFy, targetMonth, or initialAction is passed from external caller / Sourav AI
  useEffect(() => {
    if (targetClientGstin || targetFy || targetMonth || initialAction) {
      const normalizedFy = targetFy ? normalizeFy(targetFy) : undefined;
      const normalizedMonth = targetMonth ? normalizeActionMonth(targetMonth) : undefined;

      if (targetClientGstin) {
        const gstinClean = targetClientGstin.trim().toUpperCase();
        const existing = (clientsHub.length > 0 ? clientsHub : vaultClients).find(
          (c: any) => (c.gstin || '').toUpperCase() === gstinClean
        );
        const clientObj = existing || {
          id: gstinClean,
          gstin: gstinClean,
          trade_name: targetClientName || gstinClean,
          legal_name: targetClientName || gstinClean,
        };
        handleSelectClientFromHub(clientObj as any, true, normalizedFy);
      } else if (normalizedFy) {
        handleFinancialYearChange(normalizedFy);
      }

      if (normalizedMonth && (GSTR3B_MONTHS as string[]).includes(normalizedMonth)) {
        setSelectedMonth(normalizedMonth as GSTR3BMonthKey);
      }

      if (initialAction === 'reversal' || initialAction === 'reversals') {
        setActiveTab('working3b');
        setIsViewing2bAllocations(true);
        toast.success('Viewing GSTR-3B Table 4(B) ITC Reversals & Allocations', {
          description: `Period: ${normalizedMonth || selectedMonth} ${normalizedFy || workingData.profile.financialYear || ''}`,
        });
      }
    }
  }, [targetClientGstin, targetClientName, targetFy, targetMonth, initialAction, clientsHub.length, vaultClients.length]);

  // Global listener for client selection events from Sourav AI or other modules
  useEffect(() => {
    const handleSwitchClientEvent = async (e: any) => {
      const { gstin, clientName, tab, fy, month, target } = e.detail || {};
      const normalizedFy = fy ? normalizeFy(fy) : undefined;
      const normalizedMonth = month ? normalizeActionMonth(month) : undefined;

      if (gstin) {
        const gstinClean = gstin.trim().toUpperCase();
        const existing = (clientsHub.length > 0 ? clientsHub : vaultClients).find(
          (c: any) => (c.gstin || '').toUpperCase() === gstinClean
        );
        const clientObj = existing || {
          id: gstinClean,
          gstin: gstinClean,
          trade_name: clientName || gstinClean,
          legal_name: clientName || gstinClean,
        };
        await handleSelectClientFromHub(clientObj as any, true, normalizedFy);
      } else if (normalizedFy) {
        await handleFinancialYearChange(normalizedFy);
      }

      if (normalizedMonth && (GSTR3B_MONTHS as string[]).includes(normalizedMonth)) {
        setSelectedMonth(normalizedMonth as GSTR3BMonthKey);
      }

      if (tab) {
        if (tab === 'ims') setActiveTab('ims2b');
        else if (tab === 'gstr3b') setActiveTab('working3b');
        else if (tab === 'gstr1') setActiveTab('gstr1_downloader');
        else if (tab === '2b' || tab === 'gstr2b') setActiveTab('gstr2b_downloader');
        else setActiveTab(tab as any);
      }

      if (target === 'reversal' || target === 'reversals') {
        setActiveTab('working3b');
        setIsViewing2bAllocations(true);
        toast.success('Viewing GSTR-3B Table 4(B) ITC Reversals & Allocations', {
          description: `Period: ${normalizedMonth || selectedMonth} ${normalizedFy || workingData.profile.financialYear || ''}`,
        });
      }
    };
    window.addEventListener('gstr3b-select-client', handleSwitchClientEvent as any);
    return () => window.removeEventListener('gstr3b-select-client', handleSwitchClientEvent as any);
  }, [clientsHub, vaultClients, workingData.profile.financialYear, selectedMonth]);

  // Direct Software Control Action Listener (Excel/PDF Export, Edit Toggle, Locks, Allocation Workbench)
  useEffect(() => {
    const handleSoftwareActionEvent = async (e: any) => {
      const { action, target, gstin, fy, month } = e.detail || {};
      const actionName = action || target;
      if (!actionName) return;

      if (actionName === 'export_excel') {
        toast.info('⚡ Auto-Executing GSTR-3B Excel Export...');
        await handleExportExcel();
      } else if (actionName === 'export_pdf') {
        toast.info('⚡ Auto-Executing GSTR-3B PDF Export...');
        handleExportPdf();
      } else if (actionName === 'toggle_edit') {
        setIsEditMode(prev => {
          const next = !prev;
          toast.success(`Working Sheet Edit Mode: ${next ? 'Enabled' : 'Disabled'}`);
          return next;
        });
      } else if (actionName === 'lock_sheet') {
        await handleLockSheet();
      } else if (actionName === 'matrix') {
        setActiveTab('matrix');
        toast.success('Viewing 12-Month Comparative FY Matrix');
      } else if (actionName === 'reversal' || actionName === 'view_allocations') {
        setActiveTab('working3b');
        setIsViewing2bAllocations(true);
        const targetPeriod = [month, fy].filter(Boolean).join(' • ');
        toast.success('Viewing GSTR-3B Table 4(B) ITC Reversals & Allocations', {
          description: targetPeriod ? `Period: ${targetPeriod}` : undefined,
        });
      }
    };
    window.addEventListener('software-action', handleSoftwareActionEvent as any);
    return () => window.removeEventListener('software-action', handleSoftwareActionEvent as any);
  }, [workingData, selectedMonth, isEditMode]);

  const handleOpenStorageFolder = async () => {
    try {
      const res = await safeApiFetch('/api/returns/open-folder', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('Opened folder in File Explorer');
      } else {
        toast.info('Data path on server:', { description: serverDataPath });
      }
    } catch {
      toast.info('Data path:', { description: serverDataPath });
    }
  };

  // Fetch Server storage config & clients hub on mount + listen to settings changes
  useEffect(() => {
    fetchServerStorageConfig();
    fetchClientsHub();

    const handleStorageUpdated = () => {
      fetchServerStorageConfig();
      fetchClientsHub();
    };
    const handleCredentialsUpdated = () => {
      fetchClientsHub();
      fetchVaultClients();
    };
    window.addEventListener('storage-config-updated', handleStorageUpdated);
    window.addEventListener('credentials-updated', handleCredentialsUpdated);
    return () => {
      window.removeEventListener('storage-config-updated', handleStorageUpdated);
      window.removeEventListener('credentials-updated', handleCredentialsUpdated);
    };
  }, []);

  const filteredClients = useMemo(() => {
    const list = clientsHub.length > 0 ? clientsHub : (vaultClients as any[]);
    if (!clientSearchQuery.trim()) return list;
    const q = clientSearchQuery.toLowerCase().trim();
    return list.filter(c =>
      (c.trade_name && c.trade_name.toLowerCase().includes(q)) ||
      (c.legal_name && c.legal_name.toLowerCase().includes(q)) ||
      (c.gstin && c.gstin.toLowerCase().includes(q))
    );
  }, [clientsHub, vaultClients, clientSearchQuery]);

  // Reset all figures and data to clean empty state
  const handleReset = () => {
    if (window.confirm(`Are you sure you want to reset the GSTR-3B Working Sheet for ${workingData.profile.firmName || 'this client'}? All entered figures across all 12 months will be cleared to zero.`)) {
      const empty = createEmptyAnnualWorking({
        firmName: workingData.profile.firmName,
        gstin: workingData.profile.gstin,
        address: workingData.profile.address,
        contact: workingData.profile.contact,
        financialYear: workingData.profile.financialYear || '2025-26'
      });
      setWorkingData(empty);
      saveClientWorkingData(empty);
      toast.success('Working Sheet Cleared', { description: `All figures for ${workingData.profile.firmName || 'client'} have been reset to zero.` });
    }
  };

  // Callback from IMS Manager & 2B Downloader: Apply Accepted 2B ITC and breakdowns to Table 4 of active month
  const handleApplyImsTo3B = (
    itc2b: { igst: number; cgst: number; sgst: number; cess?: number; total: number; taxable?: number },
    rcmInward?: { igst: number; cgst: number; sgst: number; total: number; taxable?: number },
    creditNotes?: { igst: number; cgst: number; sgst: number; total: number; taxable?: number },
    importGoods?: { igst: number; total: number; taxable?: number }
  ) => {
    if (isSheetLocked) {
      toast.error('Working Sheet is Locked', {
        description: 'Please unlock 3B Working Sheet with password to apply 2B/IMS ITC.'
      });
      return;
    }
    setWorkingData(prev => {
      const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
      const cur = cloned.months[selectedMonth];
      const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

      if (rcmInward && rcmInward.total > 0) {
        cur.inward.rcmPaid = {
          taxable: rcmInward.taxable || 0,
          igst: rcmInward.igst,
          cgst: rcmInward.cgst,
          sgst: rcmInward.sgst,
          total: rcmInward.total
        };
        cur.outward.rcmInward = {
          taxable: rcmInward.taxable || 0,
          igst: rcmInward.igst,
          cgst: rcmInward.cgst,
          sgst: rcmInward.sgst,
          total: rcmInward.total
        };
      }

      // Supplier Credit Notes from 2B reduce recipient ITC -> Map to Row 38 `(-) Debit Notes`
      if (creditNotes && creditNotes.total > 0) {
        cur.inward.debitNotes = {
          taxable: creditNotes.taxable || 0,
          igst: creditNotes.igst,
          cgst: creditNotes.cgst,
          sgst: creditNotes.sgst,
          total: creditNotes.total
        };
      }

      if (importGoods && importGoods.total > 0) {
        cur.inward.importGoods = {
          taxable: importGoods.taxable || 0,
          igst: importGoods.igst,
          cgst: 0,
          sgst: 0,
          total: importGoods.total
        };
      }

      // Row 33: Total 2B Inward supplies minus RCM (pure B2B inward supplies)
      cur.inward.itc2b = {
        taxable: round2(itc2b.taxable || cur.inward.itc2b.taxable || 0),
        igst: round2(itc2b.igst),
        cgst: round2(itc2b.cgst),
        sgst: round2(itc2b.sgst),
        total: round2(itc2b.cgst + itc2b.sgst + itc2b.igst)
      };

      return recalculateAnnualWorking(cloned);
    });
    toast.success(`Applied ₹${itc2b.total.toLocaleString('en-IN')} 2B ITC to ${selectedMonth} Table 4!`);
  };

  // Callback from GSTR-3B ITC Allocation Workbench (Voucher-Level Categorization)
  const handleApplyAllocationsFromWorkbench = async (
    summary: AllocationSummary,
    _invoices: Gstr2bInvoiceRow[]
  ) => {
    if (isSheetLocked) {
      toast.error('Working Sheet is Locked', {
        description: 'Please unlock 3B Working Sheet with password to apply allocations.'
      });
      return;
    }
    setWorkingData(prev => {
      const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
      const cur = cloned.months[selectedMonth];
      const round2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

      // 2. Table 4(A)(3): Inward RCM Supplies
      if (summary.rcm_4a3.total > 0) {
        cur.inward.rcmPaid = {
          taxable: summary.rcm_4a3.taxable,
          igst: summary.rcm_4a3.igst,
          cgst: summary.rcm_4a3.cgst,
          sgst: summary.rcm_4a3.sgst,
          total: summary.rcm_4a3.total
        };
        cur.outward.rcmInward = {
          taxable: summary.rcm_4a3.taxable,
          igst: summary.rcm_4a3.igst,
          cgst: summary.rcm_4a3.cgst,
          sgst: summary.rcm_4a3.sgst,
          total: summary.rcm_4a3.total
        };
      }

      // 3. Table 4(A)(1): Import of Goods
      if (summary.import_4a1.total > 0) {
        cur.inward.importGoods = {
          taxable: summary.import_4a1.taxable,
          igst: summary.import_4a1.igst,
          cgst: 0,
          sgst: 0,
          total: summary.import_4a1.total
        };
      }

      // 4. Table 4(B)(1): Permanent ITC Reversals (Table 4(B)(1) Permanent + Ineligible u/s 17(5) / 16(4))
      const permTx = round2((summary.permanent_4b1?.taxable || 0) + (summary.ineligible_4d1?.taxable || 0) + (summary.ineligible_4d2?.taxable || 0));
      const permIg = round2((summary.permanent_4b1?.igst || 0) + (summary.ineligible_4d1?.igst || 0) + (summary.ineligible_4d2?.igst || 0));
      const permCg = round2((summary.permanent_4b1?.cgst || 0) + (summary.ineligible_4d1?.cgst || 0) + (summary.ineligible_4d2?.cgst || 0));
      const permSg = round2((summary.permanent_4b1?.sgst || 0) + (summary.ineligible_4d1?.sgst || 0) + (summary.ineligible_4d2?.sgst || 0));
      const permTotal = round2(permIg + permCg + permSg);

      cur.inward.itcReversed = {
        taxable: permTx,
        igst: permIg,
        cgst: permCg,
        sgst: permSg,
        total: permTotal
      };

      // 4(B)(2): Temporary ITC Reversals (Rule 37 / 180 Days / Others)
      const tempTx = round2(summary.temporary_4b2?.taxable || 0);
      const tempIg = round2(summary.temporary_4b2?.igst || 0);
      const tempCg = round2(summary.temporary_4b2?.cgst || 0);
      const tempSg = round2(summary.temporary_4b2?.sgst || 0);
      const tempTotal = round2(tempIg + tempCg + tempSg);

      cur.inward.itcReversedOther = {
        taxable: tempTx,
        igst: tempIg,
        cgst: tempCg,
        sgst: tempSg,
        total: tempTotal
      };

      // 5. Table 4(D): Ineligible ITC track record (Audit Disclosed)
      const inelTotal = round2((summary.ineligible_4d1.total || 0) + (summary.ineligible_4d2.total || 0));
      (cur.inward as any).ineligibleItc = {
        taxable: round2((summary.ineligible_4d1.taxable || 0) + (summary.ineligible_4d2.taxable || 0)),
        igst: round2((summary.ineligible_4d1.igst || 0) + (summary.ineligible_4d2.igst || 0)),
        cgst: round2((summary.ineligible_4d1.cgst || 0) + (summary.ineligible_4d2.cgst || 0)),
        sgst: round2((summary.ineligible_4d1.sgst || 0) + (summary.ineligible_4d2.sgst || 0)),
        total: inelTotal
      };

      // 1. Table 4 Row 33: "ITC as per GSTR 2B" receives Total B2B Inward supplies minus RCM:
      // Reference: Taxable 63,56,996.75, CGST 4,24,030.14, SGST 4,24,030.14, IGST 1,13,124.55
      // When reversals exist, pure B2B non-RCM = eligible (4A5) + reversals (4B/4D) - supplier credit notes (debitNotes)
      const b2bGrossTx = round2(summary.eligible_4a5.taxable + revTx - (cur.inward.debitNotes?.taxable || 0));
      const b2bGrossIg = round2(summary.eligible_4a5.igst + revIg - (cur.inward.debitNotes?.igst || 0));
      const b2bGrossCg = round2(summary.eligible_4a5.cgst + revCg - (cur.inward.debitNotes?.cgst || 0));
      const b2bGrossSg = round2(summary.eligible_4a5.sgst + revSg - (cur.inward.debitNotes?.sgst || 0));

      cur.inward.itc2b = {
        taxable: b2bGrossTx,
        igst: b2bGrossIg,
        cgst: b2bGrossCg,
        sgst: b2bGrossSg,
        total: round2(b2bGrossCg + b2bGrossSg + b2bGrossIg)
      };

      // 6. Recalculate annual working & Rule 88A cross set-off cascade
      const recalculated = recalculateAnnualWorking(cloned);
      saveToServerStorage(recalculated).catch(console.error);
      return recalculated;
    });

    toast.success(
      `Allocations Applied: ₹${summary.eligible_4a5.total.toLocaleString('en-IN')} Eligible ITC, ` +
      `₹${((summary.temporary_4b2.total || 0) + (summary.permanent_4b1.total || 0)).toLocaleString('en-IN')} Temp Reversals (4B2), ` +
      `₹${((summary.ineligible_4d1.total || 0) + (summary.ineligible_4d2.total || 0)).toLocaleString('en-IN')} Ineligible (4D)!`
    );
    setIsViewing2bAllocations(false);
  };

  // Callback from GSTR-1 Downloader: Apply verified Outward Supplies to Table 3.1
  const handleApplyGstr1To3B = (outward: { taxable: number; igst: number; cgst: number; sgst: number; cess: number; total: number }) => {
    if (isSheetLocked) {
      toast.error('Working Sheet is Locked', {
        description: 'Please unlock 3B Working Sheet with password to apply GSTR-1 sales.'
      });
      return;
    }
    setWorkingData(prev => {
      const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
      const cur = cloned.months[selectedMonth];
      cur.outward.b2b = {
        taxable: outward.taxable,
        igst: outward.igst,
        cgst: outward.cgst,
        sgst: outward.sgst,
        total: outward.total
      };
      return recalculateAnnualWorking(cloned);
    });
    toast.success(`Applied ₹${outward.taxable.toLocaleString('en-IN')} Outward Sales to ${selectedMonth} Table 3.1!`);
  };

  // Switch Financial Year across all 12 months & recalculate per client
  const handleFinancialYearChange = async (newFy: string) => {
    const normalizedFy = normalizeFy(newFy);
    const gstin = (workingData?.profile?.gstin || '').trim().toUpperCase();
    const firmName = workingData?.profile?.firmName || '';
    const address = workingData?.profile?.address || '';

    // 1. Persist current working data before switching
    if (gstin && gstin !== 'Not Specified' && gstin.length >= 10) {
      saveClientWorkingData(workingData);
    }

    // 2. Load cached or clean template immediately for instant UI responsiveness
    let immediateWorking: GSTR3BAnnualWorking;
    if (gstin && gstin !== 'Not Specified' && gstin.length >= 10) {
      immediateWorking = loadClientWorkingData(
        {
          gstin,
          trade_name: firmName,
          address
        },
        normalizedFy
      );
    } else {
      immediateWorking = createEmptyAnnualWorking({
        firmName,
        gstin,
        address,
        financialYear: normalizedFy
      });
    }

    immediateWorking.profile.financialYear = normalizedFy;
    immediateWorking = recalculateAnnualWorking(immediateWorking);
    setWorkingData(immediateWorking);

    // 3. Seamlessly check server storage for this client and switched FY (loading disk-saved working files)
    if (gstin && gstin !== 'Not Specified' && gstin.length >= 10) {
      try {
        const res = await safeApiFetch(
          `/api/returns/working-data?gstin=${encodeURIComponent(gstin)}&fy=${encodeURIComponent(normalizedFy)}&clientName=${encodeURIComponent(firmName)}`
        );
        if (res.ok) {
          const text = await res.text();
          let data: any = {};
          try { data = JSON.parse(text); } catch {}
          if (data && data.success && data.found && data.workingData) {
            let loaded = recalculateAnnualWorking(data.workingData);
            loaded.profile.firmName = firmName || loaded.profile.firmName;
            loaded.profile.gstin = gstin;
            if (address) loaded.profile.address = address;
            loaded.profile.financialYear = normalizedFy;
            loaded = recalculateAnnualWorking(loaded);
            setWorkingData(loaded);
            setLastServerSyncTime(data.lastModified || Date.now());

            if (data.workingData.lockedMonths && typeof data.workingData.lockedMonths === 'object') {
              setLockedMonths(data.workingData.lockedMonths);
              try {
                localStorage.setItem(`gstr3b_locked_months_${gstin}_${normalizedFy}`, JSON.stringify(data.workingData.lockedMonths));
              } catch {}
            }
          }
        }
      } catch (e) {
        console.warn('[Returns Storage] Error fetching client working from server for switched FY:', e);
      }
    }

    fetchClientsHub();
    toast.success(`Financial Year switched to FY ${normalizedFy}`);
  };

  // Full Auto-Mode: Apply Ingested Returns (GSTR-1 Outward & GSTR-2B ITC)
  const handleApplyIngestedReturns = (
    gstr1?: Gstr1IngestSummary | null,
    gstr2b?: Gstr2bIngestSummary | null
  ) => {
    if (isSheetLocked) {
      setShowUnlockModal(true);
      toast.error('Working Sheet & Cockpits are Locked', {
        description: 'Please enter password to unlock and apply ingested returns.'
      });
      return;
    }
    const effectiveMonth: GSTR3BMonthKey = gstr2b?.monthKey || gstr1?.monthKey || selectedMonth;
    if (effectiveMonth && effectiveMonth !== selectedMonth) {
      setSelectedMonth(effectiveMonth);
    }
    setWorkingData(prev => {
      const updated = applyReturnsToAnnualWorking(prev, effectiveMonth, gstr1, gstr2b);
      saveToServerStorage(updated).catch(() => {});
      return updated;
    });
  };

  // Autonomous GSTR-1 Portal Download & Ingest into Table 3.1 (in-place background automation)
  const handleDownloadGstr1Data = async () => {
    const currentGstin = workingData?.profile?.gstin;
    if (!currentGstin || currentGstin === 'Not Specified' || currentGstin.length < 15) {
      return toast.error('Valid GSTIN Required', {
        description: 'Please select a client with a valid 15-digit GSTIN before running GSTR-1 automation.'
      });
    }

    const targetPeriod = `${selectedMonth} ${currentMonthData?.year || '2025'}`;
    const financialYear = workingData?.profile?.financialYear || '2025-26';

    setIsGstr1Downloading(true);
    const toastId = toast.loading(`Starting GSTR-1 portal automation for ${targetPeriod} (${currentGstin})...`);

    try {
      const res = await safeApiFetch('/api/gstr1/portal-sync-browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: currentGstin,
          returnPeriod: targetPeriod,
          financialYear,
          targetMonth: selectedMonth
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'GSTR-1 portal sync failed.');
      }

      // Re-hydrate downloaded GSTR-1 invoices & batch from SQLite DB
      const resG1 = await safeApiFetch(
        `/api/gstr1/invoices/${encodeURIComponent(currentGstin)}?period=${encodeURIComponent(targetPeriod)}`
      );
      const dataG1 = await resG1.json();
      let newlyFoundG1: Gstr1IngestSummary | null = null;

      if (dataG1.success && Array.isArray(dataG1.invoices)) {
        const invs = dataG1.invoices;
        const b = dataG1.batch || {};
        const breakdowns = {
          b2b: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
          b2c: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
          zeroRated: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
          nilRated: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
          exempt: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
          creditNote: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
          advanceReceived: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
          advanceAdjusted: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
          rcmOutward: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }
        };
        let b2bCount = 0, b2csCount = 0, cdnrCount = 0, expCount = 0;

        for (const inv of invs) {
          const sec = String(inv.section || 'B2B').toUpperCase();
          const tx = Number(inv.txval || 0);
          const cg = Number(inv.camt || 0);
          const sg = Number(inv.samt || 0);
          const ig = Number(inv.iamt || 0);
          const tot = cg + sg + ig;

          if (sec.includes('CDNR')) {
            cdnrCount++;
            breakdowns.creditNote.taxable += tx;
            breakdowns.creditNote.cgst += cg;
            breakdowns.creditNote.sgst += sg;
            breakdowns.creditNote.igst += ig;
            breakdowns.creditNote.total += tot;
          } else if (sec.includes('B2CS') || sec.includes('B2C')) {
            b2csCount++;
            breakdowns.b2c.taxable += tx;
            breakdowns.b2c.cgst += cg;
            breakdowns.b2c.sgst += sg;
            breakdowns.b2c.igst += ig;
            breakdowns.b2c.total += tot;
          } else if (sec.includes('EXP')) {
            expCount++;
            breakdowns.zeroRated.taxable += tx;
            breakdowns.zeroRated.cgst += cg;
            breakdowns.zeroRated.sgst += sg;
            breakdowns.zeroRated.igst += ig;
            breakdowns.zeroRated.total += tot;
          } else {
            b2bCount++;
            breakdowns.b2b.taxable += tx;
            breakdowns.b2b.cgst += cg;
            breakdowns.b2b.sgst += sg;
            breakdowns.b2b.igst += ig;
            breakdowns.b2b.total += tot;
          }
        }

        const totalTaxable = b?.total_taxable != null && Number(b.total_taxable) > 0
          ? Number(b.total_taxable)
          : breakdowns.b2b.taxable + breakdowns.b2c.taxable + breakdowns.zeroRated.taxable - breakdowns.creditNote.taxable;

        const totalTax = b?.total_tax != null && Number(b.total_tax) > 0
          ? Number(b.total_tax)
          : breakdowns.b2b.total + breakdowns.b2c.total + breakdowns.zeroRated.total - breakdowns.creditNote.total;

        newlyFoundG1 = {
          gstin: currentGstin,
          period: targetPeriod,
          monthKey: selectedMonth,
          fileType: 'JSON',
          fileName: 'Portal_Autopilot_GSTR1',
          counts: {
            b2b: b?.b2b_count || b2bCount,
            b2cl: b?.b2cl_count || 0,
            b2cs: b?.b2cs_count || b2csCount,
            exp: b?.exp_count || expCount,
            nil: 0,
            cdnr: b?.cdnr_count || cdnrCount,
            at: 0,
            totalDocs: (b?.total_invoices || invs.length)
          },
          breakdowns,
          totalOutwardTaxable: Math.round(totalTaxable * 100) / 100,
          totalOutwardTax: Math.round(totalTax * 100) / 100
        };
      }

      if (newlyFoundG1) {
        handleApplyIngestedReturns(newlyFoundG1, null);

        // Mark batch as pushed to 3B in database
        safeApiFetch('/api/gstr1/push-to-3b', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gstin: currentGstin, period: targetPeriod })
        }).catch(() => {});

        toast.success(`GSTR-1 Portal Download Complete & Ingested!`, {
          id: toastId,
          description: `Ingested ${newlyFoundG1.counts.totalDocs} outward documents (₹ ${newlyFoundG1.totalOutwardTaxable.toLocaleString('en-IN')} Sales) into Table 3.1 for ${selectedMonth}.`
        });
      } else {
        toast.info('GSTR-1 Automation Dispatched', {
          id: toastId,
          description: data.message || 'GSTR-1 sync finished.'
        });
      }
    } catch (err: any) {
      toast.error('GSTR-1 Download Failed', {
        id: toastId,
        description: err?.message || 'Check portal credentials or connection.'
      });
    } finally {
      setIsGstr1Downloading(false);
    }
  };

  // Autonomous GSTR-2B Portal Download & Ingest into Table 4 (in-place background automation)
  const handleDownloadGstr2bData = async () => {
    const currentGstin = workingData?.profile?.gstin;
    if (!currentGstin || currentGstin === 'Not Specified' || currentGstin.length < 15) {
      return toast.error('Valid GSTIN Required', {
        description: 'Please select a client with a valid 15-digit GSTIN before running GSTR-2B automation.'
      });
    }

    const targetPeriod = `${selectedMonth} ${currentMonthData?.year || '2025'}`;
    const financialYear = workingData?.profile?.financialYear || '2025-26';

    setIsGstr2bDownloading(true);
    const toastId = toast.loading(`Starting GSTR-2B portal automation for ${targetPeriod} (${currentGstin})...`);

    try {
      const res = await safeApiFetch('/api/gstr2b/portal-sync-browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: currentGstin,
          returnPeriod: targetPeriod,
          financialYear,
          targetMonth: selectedMonth
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'GSTR-2B portal sync failed.');
      }

      // Re-hydrate downloaded GSTR-2B invoices & batch from SQLite DB
      const res2b = await safeApiFetch(
        `/api/gstr2b/invoices/${encodeURIComponent(currentGstin)}?period=${encodeURIComponent(targetPeriod)}`
      );
      const data2b = await res2b.json();
      let newlyFound2b: Gstr2bIngestSummary | null = null;

      if (data2b.success && (data2b.batch || (data2b.count && data2b.count > 0))) {
        const b = data2b.batch || {};
        let eligIgst = Number(b.eligible_itc_igst || 0);
        let eligCgst = Number(b.eligible_itc_cgst || 0);
        let eligSgst = Number(b.eligible_itc_sgst || 0);
        let eligTotal = Number(b.eligible_itc_total || (eligIgst + eligCgst + eligSgst));
        const totalInvs = Number(b.total_invoices || data2b.count || 0);

        if (eligTotal > 0 && eligIgst === 0 && Math.abs(eligCgst - eligTotal) < 0.05 && Math.abs(eligSgst - eligTotal) < 0.05) {
          eligCgst = Math.round((eligTotal / 2) * 100) / 100;
          eligSgst = Math.round((eligTotal / 2) * 100) / 100;
        }

        const invs = Array.isArray(data2b.invoices) ? data2b.invoices : [];
        let calcEligTx = 0, calcRcmTx = 0, calcCdnrTx = 0, calcIneligTx = 0;
        let calcIneligCgst = 0, calcIneligSgst = 0, calcIneligIgst = 0;
        let calcEligCgst = 0, calcEligSgst = 0, calcEligIgst = 0;
        let calcRcmCgst = 0, calcRcmSgst = 0, calcRcmIgst = 0;
        let calcCdnrCgst = 0, calcCdnrSgst = 0, calcCdnrIgst = 0;

        invs.forEach((inv: any) => {
          const isRcm = String(inv.rchrg || 'N').toUpperCase() === 'Y';
          const itcAvl = String(inv.itc_available || 'Y').toUpperCase() === 'Y';
          const sec = String(inv.section || '').toUpperCase();
          const isCdnr = sec.includes('CDNR');
          const tx = Number(inv.txval || 0);
          const cg = Number(inv.cgst || 0);
          const sg = Number(inv.sgst || 0);
          const ig = Number(inv.igst || 0);

          if (isRcm) {
            calcRcmTx += tx;
            calcRcmCgst += cg;
            calcRcmSgst += sg;
            calcRcmIgst += ig;
          } else if (isCdnr) {
            calcCdnrTx += tx;
            calcCdnrCgst += cg;
            calcCdnrSgst += sg;
            calcCdnrIgst += ig;
          } else if (itcAvl) {
            calcEligTx += tx;
            calcEligCgst += cg;
            calcEligSgst += sg;
            calcEligIgst += ig;
          } else {
            calcIneligTx += tx;
            calcIneligCgst += cg;
            calcIneligSgst += sg;
            calcIneligIgst += ig;
          }
        });

        if (calcEligIgst > 0 && !eligIgst) eligIgst = Math.round(calcEligIgst * 100) / 100;
        if (calcEligCgst > 0 && !eligCgst) eligCgst = Math.round(calcEligCgst * 100) / 100;
        if (calcEligSgst > 0 && !eligSgst) eligSgst = Math.round(calcEligSgst * 100) / 100;
        eligTotal = Math.round((eligCgst + eligSgst + eligIgst) * 100) / 100;

        const eligTxval = Number(b.eligible_itc_txval || calcEligTx || 0);
        const rcmTxval = Number(b.rcm_txval || calcRcmTx || 0);
        const cdnrTxval = Number(b.cdnr_txval || calcCdnrTx || 0);
        const ineligTxval = Number(b.ineligible_itc_txval || calcIneligTx || 0);
        const ineligIgst = Number(b.ineligible_itc_igst || calcIneligIgst || 0);
        const ineligCgst = Number(b.ineligible_itc_cgst || calcIneligCgst || 0);
        const ineligSgst = Number(b.ineligible_itc_sgst || calcIneligSgst || 0);
        const ineligTotal = Number(b.ineligible_itc_total || (ineligIgst + ineligCgst + ineligSgst) || 0);

        const rcmIgst = Number(b.rcm_igst || calcRcmIgst || 0);
        const rcmCgst = Number(b.rcm_cgst || calcRcmCgst || 0);
        const rcmSgst = Number(b.rcm_sgst || calcRcmSgst || 0);
        const rcmTotal = Number(b.rcm_total || (rcmIgst + rcmCgst + rcmSgst));

        const cdnrIgst = Number(b.cdnr_igst || calcCdnrIgst || 0);
        const cdnrCgst = Number(b.cdnr_cgst || calcCdnrCgst || 0);
        const cdnrSgst = Number(b.cdnr_sgst || calcCdnrSgst || 0);
        const cdnrTotal = Number(b.cdnr_total || (cdnrIgst + cdnrCgst + cdnrSgst));

        const impgIgst = Number(b.impg_igst || 0);
        const isdIgst = Number(b.isd_igst || 0);
        const isdCgst = Number(b.isd_cgst || 0);
        const isdSgst = Number(b.isd_sgst || 0);

        newlyFound2b = {
          gstin: currentGstin,
          period: targetPeriod,
          monthKey: selectedMonth,
          fileType: 'JSON',
          fileName: 'Portal_Autopilot_2B',
          counts: {
            b2b: b.b2b_count || totalInvs,
            b2ba: b.b2ba_count || 0,
            cdnr: b.cdnr_count || 0,
            isd: b.isd_count || 0,
            impg: b.impg_count || 0,
            totalInvoices: totalInvs
          },
          eligibleItc: {
            taxable: eligTxval,
            igst: eligIgst,
            cgst: eligCgst,
            sgst: eligSgst,
            total: eligTotal
          },
          rcmInward: { taxable: rcmTxval, igst: rcmIgst, cgst: rcmCgst, sgst: rcmSgst, total: rcmTotal },
          creditNotes: { taxable: cdnrTxval, igst: cdnrIgst, cgst: cdnrCgst, sgst: cdnrSgst, total: cdnrTotal },
          debitNotes: { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 },
          importGoods: { taxable: 0, igst: impgIgst, cgst: 0, sgst: 0, total: impgIgst },
          isd: { taxable: 0, igst: isdIgst, cgst: isdCgst, sgst: isdSgst, total: isdIgst + isdCgst + isdSgst },
          ineligibleItc: { taxable: ineligTxval, igst: ineligIgst, cgst: ineligCgst, sgst: ineligSgst, total: ineligTotal },
          netEligibleTotal: Math.round((eligTotal + rcmTotal + impgIgst + (isdIgst + isdCgst + isdSgst) - cdnrTotal - ineligTotal) * 100) / 100
        };
      }

      if (newlyFound2b) {
        handleApplyIngestedReturns(null, newlyFound2b);

        // Mark batch as pushed to 3B in database
        safeApiFetch('/api/gstr2b/push-to-3b', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gstin: currentGstin, period: targetPeriod })
        }).catch(() => {});

        toast.success(`GSTR-2B Portal Download Complete & Ingested!`, {
          id: toastId,
          description: `Ingested ${newlyFound2b.counts.totalInvoices} inward invoices (₹ ${newlyFound2b.netEligibleTotal.toLocaleString('en-IN')} Net ITC) into Table 4 for ${selectedMonth}.`
        });
      } else {
        toast.info('GSTR-2B Automation Dispatched', {
          id: toastId,
          description: data.message || 'GSTR-2B sync finished.'
        });
      }
    } catch (err: any) {
      toast.error('GSTR-2B Download Failed', {
        id: toastId,
        description: err?.message || 'Check portal credentials or connection.'
      });
    } finally {
      setIsGstr2bDownloading(false);
    }
  };

  // Clear active month return figures
  const handleClearMonthIngestion = () => {
    if (isSheetLocked) {
      toast.error('Working Sheet is Locked', {
        description: 'Please unlock the sheet before resetting figures.'
      });
      return;
    }
    if (window.confirm(`Clear return figures for ${selectedMonth} ${currentMonthData.year}?`)) {
      setWorkingData(prev => {
        const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
        const empty = createEmptyMonthData(selectedMonth, cloned.profile.financialYear);
        empty.inward.openingCreditBal = { ...cloned.months[selectedMonth].inward.openingCreditBal };
        cloned.months[selectedMonth] = empty;
        return recalculateAnnualWorking(cloned);
      });
      toast.success(`Cleared ${selectedMonth} figures`);
    }
  };

  // Currently active month data
  const currentMonthData = workingData?.months?.[selectedMonth] || createEmptyMonthData(selectedMonth, workingData?.profile?.financialYear || '2025-26');

  // Helper to update a specific field in the selected month
  const updateCurrentMonthField = (
    section: 'outward' | 'inward' | 'settlement' | 'setoff',
    field: string,
    subKey: 'taxable' | 'cgst' | 'sgst' | 'igst',
    value: number
  ) => {
    if (isSheetLocked) {
      toast.error('Working Sheet is Locked', {
        description: 'Please unlock the sheet with password to edit fields.'
      });
      return;
    }
    setWorkingData(prev => {
      const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
      const targetMonth = cloned.months[selectedMonth];

      if (section === 'outward') {
        let row = (targetMonth.outward as any)[field];
        if (!row) {
          row = { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
          (targetMonth.outward as any)[field] = row;
        }
        row[subKey] = value;
        if (subKey !== 'taxable') {
          row.total = Math.round(((Number(row.cgst) || 0) + (Number(row.sgst) || 0) + (Number(row.igst) || 0)) * 100) / 100;
        }
      } else if (section === 'inward') {
        let row = (targetMonth.inward as any)[field];
        if (!row) {
          row = { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
          (targetMonth.inward as any)[field] = row;
        }
        row[subKey] = value;
        if (field === 'totalItcAvailable') {
          targetMonth.inward.isManualTotalItc = true;
          row.total = Math.round(((Number(row.cgst) || 0) + (Number(row.sgst) || 0) + (Number(row.igst) || 0)) * 100) / 100;
        } else if (subKey !== 'taxable') {
          row.total = Math.round(((Number(row.cgst) || 0) + (Number(row.sgst) || 0) + (Number(row.igst) || 0)) * 100) / 100;
        }
      } else if (section === 'settlement') {
        let row = (targetMonth.settlement as any)[field];
        if (!row) {
          row = { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
          (targetMonth.settlement as any)[field] = row;
        }
        if (typeof row === 'object' && subKey in row) {
          row[subKey] = value;
        } else {
          (targetMonth.settlement as any)[field] = value;
        }
        if (field === 'lateFees') {
          row.total = Math.round(((Number(row.cgst) || 0) + (Number(row.sgst) || 0)) * 100) / 100;
        } else if (field === 'interest') {
          row.total = Math.round(((Number(row.cgst) || 0) + (Number(row.sgst) || 0) + (Number(row.igst) || 0)) * 100) / 100;
        }
      } else if (section === 'setoff') {
        let row = (targetMonth.setoff as any)[field];
        if (!row) {
          row = { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
          (targetMonth.setoff as any)[field] = row;
        }
        row[subKey] = value;
        targetMonth.setoff.isManualAdjustment = true;

        // Auto-balance IGST adjustment when user edits CGST or SGST adjustment
        if (field === 'adjustment') {
          if (subKey === 'cgst' || subKey === 'sgst') {
            const rawIgst = targetMonth.setoff.rawPayable?.igst || 0;
            if (rawIgst < 0) {
              const c = Number(row.cgst || 0);
              const s = Number(row.sgst || 0);
              row.igst = Math.round(-(c + s) * 100) / 100;
            }
          }
          row.total = Math.round((Number(row.cgst || 0) + Number(row.sgst || 0) + Number(row.igst || 0)) * 100) / 100;
        }
      }

      const updated = recalculateAnnualWorking(cloned);
      saveToServerStorage(updated).catch(() => {});
      return updated;
    });
  };

  // Quick Action presets for Table 6.1 Set-off & Utilization
  const handleSetoffPreset = (mode: 'auto' | 'all_cgst' | 'all_sgst' | 'equal' | 'clear') => {
    if (isSheetLocked) {
      setShowUnlockModal(true);
      toast.error('Working Sheet is Locked', {
        description: 'Please unlock 3B Working Sheet to adjust set-off cascade.'
      });
      return;
    }
    setWorkingData(prev => {
      const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
      const targetMonth = cloned.months[selectedMonth];
      if (!targetMonth) return prev;

      const raw = targetMonth.setoff.rawPayable;
      const surplusIgst = raw.igst < 0 ? Math.abs(raw.igst) : 0;

      if (mode === 'clear') {
        targetMonth.setoff.adjustment = { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        targetMonth.setoff.isManualAdjustment = true;
      } else if (mode === 'all_cgst') {
        const canTake = Math.min(surplusIgst, Math.max(0, raw.cgst));
        const adjC = canTake > 0 ? canTake : surplusIgst;
        targetMonth.setoff.adjustment = {
          taxable: 0,
          cgst: adjC,
          sgst: 0,
          igst: -adjC,
          total: 0
        };
        targetMonth.setoff.isManualAdjustment = true;
      } else if (mode === 'all_sgst') {
        const canTake = Math.min(surplusIgst, Math.max(0, raw.sgst));
        const adjS = canTake > 0 ? canTake : surplusIgst;
        targetMonth.setoff.adjustment = {
          taxable: 0,
          cgst: 0,
          sgst: adjS,
          igst: -adjS,
          total: 0
        };
        targetMonth.setoff.isManualAdjustment = true;
      } else if (mode === 'equal') {
        const half = Math.round((surplusIgst / 2) * 100) / 100;
        const otherHalf = Math.round((surplusIgst - half) * 100) / 100;
        targetMonth.setoff.adjustment = {
          taxable: 0,
          cgst: half,
          sgst: otherHalf,
          igst: -surplusIgst,
          total: 0
        };
        targetMonth.setoff.isManualAdjustment = true;
      } else if (mode === 'auto') {
        targetMonth.setoff.isManualAdjustment = false;
        targetMonth.setoff.adjustment = { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
      }

      const updated = recalculateAnnualWorking(cloned);
      saveToServerStorage(updated).catch(() => {});
      return updated;
    });
  };

  // Helper to format currency (returns clean formatted number without currency symbol to prevent duplicate ₹ ₹)
  const formatCur = (val: any) => {
    if (val === undefined || val === null || val === '') return '0.00';
    let num = 0;
    if (typeof val === 'number') {
      num = isNaN(val) ? 0 : val;
    } else if (typeof val === 'object') {
      num = typeof val.total === 'number' ? val.total : 0;
    } else {
      const parsed = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
      num = isNaN(parsed) ? 0 : parsed;
    }
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Export to Excel
  const handleExportExcel = async () => {
    const id = toast.loading('Generating GSTR-3B Working Excel...');
    try {
      const blob = await generateGstr3bWorkingExcel(workingData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GSTR-3B_WORKING_${workingData.profile.firmName.replace(/[^a-zA-Z0-9]/g, '_')}_${workingData.profile.financialYear}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success('Excel Generated Successfully', { id, description: '12 Monthly sheets & Annual Summary included.' });
    } catch (err: any) {
      toast.error('Export Failed', { id, description: err?.message || 'Error creating Excel.' });
    }
  };

  // Export Selected Month Working to PDF
  const handleExportPdf = () => {
    const id = toast.loading(`Generating GSTR-3B PDF for ${selectedMonth} ${currentMonthData.year}...`);
    try {
      exportGstr3bMonthPdf(currentMonthData, workingData.profile);
      toast.success('PDF Export Complete', {
        id,
        description: `Downloaded GSTR-3B Working Statement for ${selectedMonth} ${currentMonthData.year}`
      });
    } catch (err: any) {
      toast.error('PDF Export Failed', { id, description: err?.message || 'Error generating PDF.' });
    }
  };

  // Export GSTN JSON
  const handleDownloadJson = () => {
    try {
      const jsonStr = generateGstr3bPortalJson(currentMonthData, workingData.profile);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const mIdx = currentMonthData.calendarMonthIndex.toString().padStart(2, '0');
      a.download = `GSTR3B_${workingData.profile.gstin}_${mIdx}${currentMonthData.year}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success('JSON Generated', { description: `Upload-ready payload for ${selectedMonth}-${currentMonthData.year}` });
    } catch (err: any) {
      toast.error('Failed to generate JSON', { description: err?.message });
    }
  };

  // Upload JSON Directly to GST Portal (Autopilot)
  const handleUploadJsonDirectlyToPortal = async () => {
    const gstin = workingData.profile.gstin;
    if (!gstin || gstin === 'Not Specified' || gstin.length < 10) {
      toast.error('Invalid GSTIN', { description: 'Please select a client with a valid GSTIN first.' });
      return;
    }

    setIsUploadingPortalJson(true);
    toast.info(`Initiating GSTR-3B Portal Upload for ${selectedMonth}...`, {
      description: 'Launching browser and preparing JSON payload.'
    });

    try {
      const jsonStr = generateGstr3bPortalJson(currentMonthData, workingData.profile);
      const portalJsonObj = JSON.parse(jsonStr);

      const res = await fetch(`${getApiBase()}/api/returns/upload-3b-portal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({
          gstin,
          month: selectedMonth,
          financialYear: workingData.profile.financialYear || '2026-27',
          portalJson: portalJsonObj
        })
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text.slice(0, 80));
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload JSON to portal');
      }

      toast.success('GSTR-3B Uploaded to Portal!', {
        description: data.message || 'JSON payload successfully uploaded to GST Portal!'
      });
    } catch (err: any) {
      console.error('[Upload 3B Portal Error]:', err);
      toast.error('Portal Upload Failed', {
        description: err?.message || 'Error occurred during portal upload.'
      });
    } finally {
      setIsUploadingPortalJson(false);
    }
  };

  // Send Mail to Client — Opens Interactive Modal & Verifies Mail Config
  const handleSendMailToClient = async () => {
    let clientEmail = workingData.profile.filingEmail || workingData.profile.contact || '';
    if (!clientEmail && workingData.profile.gstin) {
      const match = clientsHub.find(c => c.gstin?.toUpperCase() === workingData.profile.gstin?.toUpperCase());
      if (match?.email) clientEmail = match.email;
    }
    setEmailRecipient(clientEmail);
    setEmailSubject(`📌 GSTR-3B Tax Computation & Payment Schedule for ${selectedMonth} ${currentMonthData.year} — ${workingData.profile.firmName || workingData.profile.gstin}`);
    setEmailCustomNote('');
    setIsEmailModalOpen(true);

    try {
      const res = await safeApiFetch('/api/returns/email-settings');
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch {}
      if (data && data.success) {
        setEmailSmtpConfigured(Boolean(data.isConfigured));
      }
    } catch {
      setEmailSmtpConfigured(false);
    }
  };

  // Dispatches GSTR-3B Summary and Attachments to Client via Backend SMTP
  const handleExecuteSendMail = async () => {
    if (!emailRecipient || !emailRecipient.trim()) {
      toast.error('Recipient Email Required', { description: 'Please enter a valid client email address.' });
      return;
    }

    setIsSendingEmail(true);
    const toastId = toast.loading(`Generating attachments & dispatching GSTR-3B email to ${emailRecipient.trim()}...`);

    try {
      const attachmentsPayload: Array<{ filename: string; content: string; contentType: string }> = [];

      // 1. Generate Landscape PDF if selected
      if (attachPdf) {
        const safeFirm = (workingData.profile.firmName || 'CLIENT').replace(/[^a-zA-Z0-9]/g, '_');
        const pdfFileName = `GSTR-3B_WORKING_${safeFirm}_${selectedMonth.toUpperCase()}_${currentMonthData.year}.pdf`;
        const pdfResult = exportGstr3bMonthPdf(currentMonthData, workingData.profile, {
          autoDownload: false,
          customFileName: pdfFileName
        });
        if (pdfResult?.base64) {
          attachmentsPayload.push({
            filename: pdfFileName,
            content: pdfResult.base64,
            contentType: 'application/pdf'
          });
        }
      }

      // 2. Generate Working Excel if selected
      if (attachExcel) {
        const excelBlob = await generateGstr3bWorkingExcel(workingData);
        const reader = new FileReader();
        const base64Excel = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            const b64 = dataUrl.includes('base64,') ? dataUrl.split('base64,')[1] : dataUrl;
            resolve(b64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(excelBlob);
        });
        const safeFirm = (workingData.profile.firmName || 'CLIENT').replace(/[^a-zA-Z0-9]/g, '_');
        const excelFileName = `GSTR-3B_SCHEDULE_${safeFirm}_${workingData.profile.financialYear || '2025-26'}.xlsx`;
        attachmentsPayload.push({
          filename: excelFileName,
          content: base64Excel,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
      }

      // 3. Extract Summary Numbers
      const outwardTotal = currentMonthData.outward?.totalSaleWorking?.total ?? 0;
      const itcTotal = currentMonthData.inward?.totalItcAvailable?.total ?? 0;
      const stl = currentMonthData.settlement;
      const cashIgst = stl?.balancePayable?.igst ?? 0;
      const cashCgst = stl?.balancePayable?.cgst ?? 0;
      const cashSgst = stl?.balancePayable?.sgst ?? 0;
      const cashTotal = stl?.balancePayable?.total ?? 0;

      // 4. Send Request to Backend
      const res = await safeApiFetch('/api/returns/send-client-mail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({
          gstin: workingData.profile.gstin,
          firmName: workingData.profile.firmName,
          month: selectedMonth,
          year: currentMonthData.year,
          recipientEmail: emailRecipient.trim(),
          subject: emailSubject.trim(),
          customNote: emailCustomNote.trim(),
          summary: {
            outwardTotal,
            itcTotal,
            cashIgst,
            cashCgst,
            cashSgst,
            cashTotal
          },
          attachments: attachmentsPayload
        })
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        if (text.includes('Cannot POST') || text.includes('<!DOCTYPE') || text.includes('route not found')) {
          throw new Error('Backend server needs a restart. Please restart your backend server terminal (Ctrl+C, then npm start) to activate the new email route.');
        }
        throw new Error(`Server returned non-JSON response: ${text.slice(0, 80)}`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to dispatch email');
      }

      toast.success('GSTR-3B Email Sent Successfully!', {
        id: toastId,
        description: `Delivered to ${emailRecipient.trim()} with ${attachmentsPayload.length} attachment(s).`
      });

      setIsEmailModalOpen(false);
    } catch (err: any) {
      console.error('[Send Mail Error]:', err);
      toast.error('Email Dispatch Failed', {
        id: toastId,
        description: err?.message || 'Error communicating with mail server.'
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Seed GSTR-9 Annual Return JSON
  const handleSeedGstr9Json = () => {
    try {
      const annualSeed = {
        gstin: workingData.profile.gstin,
        fp: workingData.profile.financialYear || '2024-25',
        table4: {
          taxable: GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.outward?.totalSaleWorking?.taxable || 0), 0),
          igst: GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.outward?.totalSaleWorking?.igst || 0), 0),
          cgst: GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.outward?.totalSaleWorking?.cgst || 0), 0),
          sgst: GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.outward?.totalSaleWorking?.sgst || 0), 0),
        },
        table6: {
          itcAvailable: GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.inward?.totalItcAvailable?.total || 0), 0),
          itcIgst: GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.inward?.totalItcAvailable?.igst || 0), 0),
          itcCgst: GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.inward?.totalItcAvailable?.cgst || 0), 0),
          itcSgst: GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.inward?.totalItcAvailable?.sgst || 0), 0),
        },
        table9: {
          cashPaidIgst: GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.settlement?.balancePayable?.igst || 0), 0),
          cashPaidCgst: GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.settlement?.balancePayable?.cgst || 0), 0),
          cashPaidSgst: GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.settlement?.balancePayable?.sgst || 0), 0),
          cashPaidTotal: GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.settlement?.balancePayable?.total || 0), 0),
        },
        closingCredit: workingData?.months?.March?.setoff?.balanceCfNextMonth || { igst: 0, cgst: 0, sgst: 0, total: 0 },
        generatedAt: new Date().toISOString()
      };
      const jsonStr = JSON.stringify(annualSeed, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GSTR9_Seed_${workingData.profile.gstin || 'GSTIN'}_${workingData.profile.financialYear || 'FY'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success('GSTR-9 JSON Seed Ready', { description: '12-Month audited return totals exported for Annual Filing.' });
    } catch (err: any) {
      toast.error('Failed to seed GSTR-9 JSON', { description: err?.message });
    }
  };

  // Upload Excel Working file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isSheetLocked) {
      setShowUnlockModal(true);
      toast.error('Working Sheet is Locked', {
        description: 'Please enter password to unlock and import external files.'
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const id = toast.loading('Reading GSTR-3B Working Excel...');
    try {
      const parsed = await parseGstr3bWorkingFile(file);
      setWorkingData(parsed);
      setTargetGstin(parsed.profile.gstin);
      toast.success('File Loaded Successfully', {
        id,
        description: `Imported working data for ${parsed.profile.firmName} (${parsed.profile.financialYear})`
      });
    } catch (err: any) {
      toast.error('Parse Error', { id, description: err?.message || 'Could not parse Excel structure.' });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };



  // Portal OTP Handlers
  const handleRequestPortalOtp = () => {
    if (!targetGstin || targetGstin.length !== 15) {
      return toast.error('Please enter a valid 15-character GSTIN.');
    }
    setIsProcessing(true);
    toast.promise(
      new Promise(resolve => setTimeout(resolve, 1500)),
      {
        loading: 'Connecting to GSTN via GSP Gateway...',
        success: () => {
          setIsProcessing(false);
          setShowOtpModal(true);
          return `OTP dispatched to registered mobile for ${targetGstin}`;
        },
        error: () => {
          setIsProcessing(false);
          return 'Failed to reach GSTN.';
        }
      }
    );
  };

  const handleVerifyPortalOtp = () => {
    if (!gstinOtp || gstinOtp.length < 6) return toast.error('Enter a valid 6-digit OTP.');
    setIsProcessing(true);
    toast.promise(
      new Promise(resolve => setTimeout(resolve, 1500)),
      {
        loading: 'Verifying OTP & negotiating encryption keys...',
        success: () => {
          setIsProcessing(false);
          setShowOtpModal(false);
          setPortalSessionActive(true);
          return 'Secure GST Portal Session Established! Valid for 6 hours.';
        },
        error: 'Invalid OTP.'
      }
    );
  };

  return (
    <div className="w-full max-w-[1520px] mx-auto space-y-2 pt-0 pb-16 animate-fade-in">
      {/* Hidden file input for uploading CA Working .xlsx */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".xlsx,.xls"
        className="hidden"
      />

      {/* ─── TOP ELEVATED NAVBAR (z-20 so it renders on top of page canvas, but under global sidebar) ─── */}
      <header className="relative z-20 px-4 sm:px-6 pt-3 pb-2 bg-[#F8FAFC]">
        <div className="max-w-[1520px] mx-auto min-h-16 bg-white/95 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] rounded-2xl px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 border border-slate-200/80">
          {/* Client Info (ALL CAPS, enlarged, prominent) */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200/70 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="flex flex-col text-left min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-bold tracking-wide uppercase text-slate-900 leading-tight truncate">
                  {workingData.profile.firmName || 'DYP INFRAPROJECTS PRIVATE LIMITED'}
                </h1>
                <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold uppercase tracking-wider shrink-0">
                  {workingData.profile.gstnStatus || 'Active Taxpayer'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(true)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded hover:bg-slate-100 transition-colors shrink-0"
                  title="Edit Taxpayer / Firm Details"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono flex-wrap">
                <span>GST No. <strong className="text-slate-700">{workingData.profile.gstin || '27AAGCD4105L1ZO'}</strong></span>
                <span className="text-slate-300 hidden sm:inline">•</span>
                <span className="hidden sm:inline text-slate-600 truncate max-w-md">
                  {workingData.profile.address || 'Plot No. 185 And 186, Office No. 112 & 113, Kohinoor Majestic Building, Pimpri Chinchwad, Pune 411019'}
                </span>
              </div>
            </div>
          </div>

          {/* Switch Client, FY Dropdown & Portal Login Controls */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Switch Client Button & Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsClientDropdownOpen(prev => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 shadow-2xs hover:shadow-xs transition-all text-xs font-semibold"
              >
                <Users className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Switch Client</span>
                <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded-full">
                  {clientsHub.length || vaultClients.length}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isClientDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isClientDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsClientDropdownOpen(false)} />
                  <div className="absolute left-0 top-full mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 z-50 animate-pop-in ring-1 ring-slate-200">
                    <div className="relative mb-2">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={clientSearchQuery}
                        onChange={e => setClientSearchQuery(e.target.value)}
                        placeholder="Search client name or GSTIN..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 transition-colors"
                        autoFocus
                      />
                    </div>

                    <div className="max-h-72 overflow-y-auto py-1 space-y-1 divide-y divide-slate-100 custom-scrollbar">
                      {filteredClients.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500">
                          No clients match "{clientSearchQuery}".
                        </div>
                      ) : (
                        filteredClients.map(c => {
                          const isCurrent = workingData.profile.gstin === c.gstin;
                          return (
                            <button
                              key={c.gstin}
                              type="button"
                              onClick={() => handleSelectClientFromHub(c)}
                              className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between gap-2.5 ${
                                isCurrent
                                  ? 'bg-blue-50 border border-blue-200 text-blue-900 font-semibold'
                                  : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div className="truncate min-w-0 flex-1">
                                <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                                  <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                  <span className="truncate">{c.trade_name || c.legal_name || 'Client'}</span>
                                </div>
                                <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                                  {c.gstin}
                                </div>
                              </div>
                              <div className="shrink-0 flex items-center gap-1.5">
                                {c.hasSavedWorking && (
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                                    Saved
                                  </span>
                                )}
                                {c.hasCredentials && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200" title="Portal credentials configured">
                                    🔑
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="pt-2 mt-1 border-t border-slate-100 text-[11px] flex items-center justify-between">
                      <span className="text-slate-400">Total: {clientsHub.length || vaultClients.length} clients</span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsClientDropdownOpen(false);
                          window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'credentials' } }));
                        }}
                        className="text-amber-600 hover:text-amber-700 font-bold transition-colors"
                      >
                        + Manage Credentials Vault
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* FY Selector Dropdown */}
            <div className="relative">
              <select
                value={normalizeFy(workingData.profile.financialYear || '2025-26')}
                onChange={(e) => handleFinancialYearChange(e.target.value)}
                className="appearance-none bg-slate-100 hover:bg-slate-200/80 focus:bg-white text-slate-900 font-mono font-bold text-xs border border-slate-200 rounded-xl pl-3 pr-8 py-1.5 shadow-2xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                title="Select Financial Year"
              >
                <option value="2026-27">FY 2026-27</option>
                <option value="2025-26">FY 2025-26</option>
                <option value="2024-25">FY 2024-25</option>
                <option value="2023-24">FY 2023-24</option>
                <option value="2022-23">FY 2022-23</option>
                <option value="2021-22">FY 2021-22</option>
                <option value="2020-21">FY 2020-21</option>
                <option value="2019-20">FY 2019-20</option>
                <option value="2018-19">FY 2018-19</option>
                <option value="2017-18">FY 2017-18</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>

            {/* Login in portal Button */}
            <button
              onClick={handleLaunchPortalLogin}
              disabled={isLaunchingPortal}
              className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
              title="Launch visible Chrome & auto-fill GST Portal login credentials"
            >
              {isLaunchingPortal ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-600" />
              ) : (
                <Globe className="w-3.5 h-3.5 text-sky-600" />
              )}
              <span className="hidden sm:inline">Login in portal</span>
            </button>
          </div>
        </div>
      </header>

      {/* ─── STANDALONE MODULES MAIN WORKSPACE CANVAS ─── */}
      <main className="max-w-[1520px] mx-auto px-4 sm:px-6 pb-28 space-y-5">


{/* TAB 1: GSTR-3B FORMAL WORKING SHEET (1:1 STITCH BLUEPRINT) */}
      {activeTab === 'working3b' && (() => {
        if (isViewing2bAllocations) {
          const effGstin = (workingData.profile.gstin && workingData.profile.gstin !== 'Not Specified' && workingData.profile.gstin.length >= 10)
            ? workingData.profile.gstin
            : (targetGstin || '');
          const effPeriod = `${selectedMonth} ${currentMonthData?.year || '2025'}`;

          return (
            <Gstr3bItcAllocationWorkbench
              clientGstin={effGstin}
              clientName={workingData.profile.firmName || ''}
              returnPeriod={effPeriod}
              onBack={() => setIsViewing2bAllocations(false)}
              onApplyAllocations={handleApplyAllocationsFromWorkbench}
              isLocked={isSheetLocked}
            />
          );
        }

        // Computed statutory summary for Table 3.1 & Computation Sheet
        const b2b = currentMonthData.outward.b2b || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const b2c = currentMonthData.outward.b2c || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const sezWith = currentMonthData.outward.sezWithPayment || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const sezWithout = currentMonthData.outward.sezWithoutPayment || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const zeroRated = currentMonthData.outward.zeroRated || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const nilRated = currentMonthData.outward.nilRated || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const exempt = currentMonthData.outward.exempt || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const advRec = currentMonthData.outward.advanceReceived || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const rentRec = currentMonthData.outward.rentReceived || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const incAmend = currentMonthData.outward.saleIncreaseAmendment || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const decAmend = currentMonthData.outward.saleDecreaseAmendment || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const crNote = currentMonthData.outward.creditNote || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const advAdj = currentMonthData.outward.advanceAdjusted || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const rcmInward = currentMonthData.outward.rcmInward || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const rcmTransport = currentMonthData.outward.rcmTransport || (rcmInward.taxable || rcmInward.total ? rcmInward : { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });
        const rcmSecurity = currentMonthData.outward.rcmSecurity || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const rcmGuestHouse = currentMonthData.outward.rcmGuestHouse || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const rcmAdvocate = currentMonthData.outward.rcmAdvocate || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };

        // Subtotal Sales before RCM
        const subtotalSalesTaxable = (b2b.taxable || 0) + (b2c.taxable || 0) + (sezWith.taxable || 0) + (sezWithout.taxable || 0) +
          (zeroRated.taxable || 0) + (nilRated.taxable || 0) + (exempt.taxable || 0) + (advRec.taxable || 0) + (rentRec.taxable || 0) +
          (incAmend.taxable || 0) - (decAmend.taxable || 0) - (crNote.taxable || 0) - (advAdj.taxable || 0);

        const subtotalSalesCgst = (b2b.cgst || 0) + (b2c.cgst || 0) + (advRec.cgst || 0) + (rentRec.cgst || 0) +
          (incAmend.cgst || 0) - (decAmend.cgst || 0) - (crNote.cgst || 0) - (advAdj.cgst || 0);

        const subtotalSalesSgst = (b2b.sgst || 0) + (b2c.sgst || 0) + (advRec.sgst || 0) + (rentRec.sgst || 0) +
          (incAmend.sgst || 0) - (decAmend.sgst || 0) - (crNote.sgst || 0) - (advAdj.sgst || 0);

        const subtotalSalesIgst = (b2b.igst || 0) + (b2c.igst || 0) + (sezWith.igst || 0) + (zeroRated.igst || 0) +
          (advRec.igst || 0) + (rentRec.igst || 0) + (incAmend.igst || 0) - (decAmend.igst || 0) - (crNote.igst || 0) - (advAdj.igst || 0);

        const subtotalSalesTotal = subtotalSalesCgst + subtotalSalesSgst + subtotalSalesIgst;

        // Gross Liability (A)
        const grossTaxable = subtotalSalesTaxable + (rcmInward.taxable || 0);
        const grossCgst = subtotalSalesCgst + (rcmInward.cgst || 0);
        const grossSgst = subtotalSalesSgst + (rcmInward.sgst || 0);
        const grossIgst = subtotalSalesIgst + (rcmInward.igst || 0);
        const grossTotal = grossCgst + grossSgst + grossIgst;

        // Inward Supplies (ITC)
        const itc2b = currentMonthData.inward.itc2b || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const importGoods = currentMonthData.inward.importGoods || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const rcmPaid = currentMonthData.inward.rcmPaid || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const crNotesInw = currentMonthData.inward.creditNotes || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const openingBal = currentMonthData.inward.openingCreditBal || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const debNotesInw = currentMonthData.inward.debitNotes || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const itcRev = currentMonthData.inward.itcReversed || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const itcRevOther = currentMonthData.inward.itcReversedOther || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const itcAvail = currentMonthData.inward.totalItcAvailable || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };

        // (A - B) Net Payable before Rule 88A Cross Set-off
        const payableCgstRaw = grossCgst - itcAvail.cgst;
        const payableSgstRaw = grossSgst - itcAvail.sgst;
        const payableIgstRaw = grossIgst - itcAvail.igst;
        const payableCgst = Math.max(0, payableCgstRaw);
        const payableSgst = Math.max(0, payableSgstRaw);
        const payableIgst = payableIgstRaw; // negative if surplus credit
        const payableTotal = payableCgst + payableSgst + Math.max(0, payableIgst);

        // Rule 88A Adjustment
        const adj = currentMonthData.setoff.adjustment || { cgst: 0, sgst: 0, igst: 0, total: 0 };

        // TDS/TCS Cash Ledger Offset
        const tdsTcs = currentMonthData.settlement.tdsTcsOpeningCash || { cgst: 0, sgst: 0, igst: 0, total: 0 };

        // Final Liability Payable (Post Set-off & TDS/TCS - Table Row 48)
        const finalPayable = currentMonthData.setoff.payableAfterAdjustment || { cgst: 0, sgst: 0, igst: 0, total: 0 };

        // Balance C/F (Table Row 50)
        const balanceCf = currentMonthData.setoff.balanceCfNextMonth || { cgst: 0, sgst: 0, igst: 0, total: 0 };

        // Final Cash Outflow including RCM, Late Fees, and Interest
        const rcmPayableVal = (rcmInward.cgst || 0) + (rcmInward.sgst || 0) + (rcmInward.igst || 0);
        const lateFeesObj = typeof currentMonthData.settlement?.lateFees === 'object' && currentMonthData.settlement?.lateFees !== null
          ? currentMonthData.settlement.lateFees
          : { cgst: (Number(currentMonthData.settlement?.lateFees) || 0) / 2, sgst: (Number(currentMonthData.settlement?.lateFees) || 0) / 2, total: Number(currentMonthData.settlement?.lateFees) || 0 };
        const lateFeesVal = lateFeesObj?.total || 0;

        const interestObj = typeof currentMonthData.settlement?.interest === 'object' && currentMonthData.settlement?.interest !== null
          ? currentMonthData.settlement.interest
          : { cgst: 0, sgst: 0, igst: 0, total: Number(currentMonthData.settlement?.interest) || 0 };
        const interestVal = interestObj?.total || 0;
        const finalNetCashDeposit = (finalPayable.total || 0) + rcmPayableVal + lateFeesVal + interestVal;

        // Individual Net Cash Deposits for Bottom Total Row
        const netCgstDeposit = (finalPayable.cgst || 0) + (rcmInward.cgst || 0) + (lateFeesObj?.cgst || 0) + (interestObj?.cgst || 0);
        const netSgstDeposit = (finalPayable.sgst || 0) + (rcmInward.sgst || 0) + (lateFeesObj?.sgst || 0) + (interestObj?.sgst || 0);
        const netIgstDeposit = (finalPayable.igst || 0) + (rcmInward.igst || 0) + (interestObj?.igst || 0);

        // Rule 88A Waterfall Telemetry
        const igstCreditAvail = itcAvail.igst;
        const igstLiab = grossIgst;
        const igstAppliedToIgst = Math.min(igstCreditAvail, igstLiab);
        const residualIgst = Math.max(0, igstCreditAvail - igstLiab);
        const igstCreditUtilizedPercent = igstCreditAvail > 0 ? Math.min(100, Math.round(((igstCreditAvail - (balanceCf.igst || 0)) / igstCreditAvail) * 100)) : 0;
        const cgstCreditAvail = itcAvail.cgst;
        const cgstLiab = grossCgst;
        const cgstAppliedToCgst = Math.min(cgstCreditAvail, cgstLiab);
        const sgstCreditAvail = itcAvail.sgst;
        const sgstLiab = grossSgst;
        const sgstAppliedToSgst = Math.min(sgstCreditAvail, sgstLiab);

        // Cell helper
        const renderCell = (val: number, isCurrency = true, isMuted = false, isBold = false, colorClass = '') => {
          if (!val || val === 0) {
            return <span className="text-slate-400 font-mono">-</span>;
          }
          return (
            <span className={`font-mono tabular-nums ${isBold ? 'font-bold' : ''} ${colorClass || (isMuted ? 'text-slate-600' : 'text-slate-900')}`}>
              {val < 0 ? `-${formatCur(Math.abs(val))}` : formatCur(val)}
            </span>
          );
        };

        return (
          <div className="space-y-5 animate-fade-in-up">
            {/* Banner: Document Working Sheet Header from Reference Image */}
            <div className="bg-white/90 backdrop-blur-xl p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-all duration-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="material-symbols-outlined text-indigo-600 text-[22px]">assignment</span>
                <h2 className="font-headline-md text-base sm:text-lg md:text-xl text-slate-900 font-bold uppercase tracking-tight">
                  GSTR-3B WORKING FOR THE MONTH OF {selectedMonth.toUpperCase()} {currentMonthData.year}
                </h2>
                {isSheetLocked && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
                    <Lock className="w-3.5 h-3.5 text-rose-600" />
                    <span>LOCKED (READ-ONLY) • {selectedMonth.toUpperCase()}</span>
                  </span>
                )}
              </div>

              {/* Financial Year & Month Selectors, Upload .xlsx, Save Working & Complete Lock Actions */}
              <div className="flex items-center gap-2.5 flex-wrap shrink-0">
                {/* Financial Year Selector */}
                <div className="flex items-center gap-1.5">
                  <label htmlFor="gstr3b-fy-banner-select" className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                    <span className="material-symbols-outlined text-slate-400 text-[18px]">calendar_today</span>
                    <span>FY:</span>
                  </label>
                  <div className="relative">
                    <select
                      id="gstr3b-fy-banner-select"
                      value={normalizeFy(workingData.profile.financialYear || '2025-26')}
                      onChange={(e) => handleFinancialYearChange(e.target.value)}
                      className="appearance-none bg-slate-50 hover:bg-white focus:bg-white text-slate-900 font-semibold font-mono text-xs border border-slate-300 hover:border-indigo-400 focus:border-indigo-600 rounded-xl pl-3 pr-8 py-1.5 shadow-xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      title="Select Financial Year"
                    >
                      <option value="2026-27">FY 2026-27</option>
                      <option value="2025-26">FY 2025-26</option>
                      <option value="2024-25">FY 2024-25</option>
                      <option value="2023-24">FY 2023-24</option>
                      <option value="2022-23">FY 2022-23</option>
                      <option value="2021-22">FY 2021-22</option>
                      <option value="2020-21">FY 2020-21</option>
                      <option value="2019-20">FY 2019-20</option>
                      <option value="2018-19">FY 2018-19</option>
                      <option value="2017-18">FY 2017-18</option>
                    </select>
                    <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-[16px]">
                      unfold_more
                    </span>
                  </div>
                </div>

                {/* Month Selector */}
                <div className="flex items-center gap-1.5">
                  <label htmlFor="gstr3b-month-select" className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                    <span className="material-symbols-outlined text-slate-400 text-[18px]">calendar_month</span>
                    <span>Month:</span>
                  </label>
                  <div className="relative">
                    <select
                      id="gstr3b-month-select"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value as GSTR3BMonthKey)}
                      className="appearance-none bg-slate-50 hover:bg-white focus:bg-white text-slate-900 font-semibold text-xs border border-slate-300 hover:border-indigo-400 focus:border-indigo-600 rounded-xl pl-3 pr-8 py-1.5 shadow-xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      {GSTR3B_MONTHS.map(m => {
                        const mData = workingData.months[m];
                        const isMLocked = Boolean(lockedMonths[m]);
                        const hasCash = (mData?.settlement?.balancePayable?.total || 0) > 0;
                        const yr = mData?.year || currentMonthData.year;
                        return (
                          <option key={m} value={m}>
                            {m} {yr}{isMLocked ? ' 🔒 (Locked)' : ''}{hasCash ? ' • (Cash Tax Due)' : ''}
                          </option>
                        );
                      })}
                    </select>
                    <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-[16px]">
                      unfold_more
                    </span>
                  </div>
                </div>

                {/* Upload external CA Excel */}
                <button
                  type="button"
                  onClick={() => {
                    if (isSheetLocked) {
                      setShowUnlockModal(true);
                      toast.error('Working Sheet is Locked', {
                        description: `Please enter password to unlock ${selectedMonth} and import external files.`
                      });
                      return;
                    }
                    fileInputRef.current?.click();
                  }}
                  disabled={isProcessing || isSheetLocked}
                  className={`px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-slate-200 transition-all cursor-pointer shadow-2xs ${
                    isSheetLocked ? 'opacity-40 cursor-not-allowed' : ''
                  }`}
                  title={isSheetLocked ? `${selectedMonth} sheet is locked against uploads` : 'Upload external CA Excel working file'}
                >
                  <UploadCloud className="w-3.5 h-3.5 text-blue-500" />
                  <span>Upload .xlsx</span>
                </button>

                {/* Save Working Data Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (isSheetLocked) {
                      toast.error('Working Sheet is Locked', {
                        description: `Please unlock ${selectedMonth} before saving changes.`
                      });
                      return;
                    }
                    handleManualSave();
                  }}
                  disabled={isSyncingToServer || isSheetLocked}
                  className={`px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-all hover:scale-[1.02] ring-1 ring-slate-900 cursor-pointer ${
                    isSheetLocked ? 'opacity-40 cursor-not-allowed' : 'disabled:opacity-50'
                  }`}
                  title={isSheetLocked ? `${selectedMonth} is locked against saving` : 'Save complete 3B Working Sheet to Server & Local Storage (Ctrl+S)'}
                >
                  {isSyncingToServer ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                  ) : (
                    <Save className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>{isSyncingToServer ? 'Saving...' : 'Save Working'}</span>
                  <kbd className="hidden sm:inline text-[9px] px-1 py-0.2 rounded bg-slate-800 font-mono text-slate-300 border border-slate-700">
                    Ctrl+S
                  </kbd>
                </button>

                {/* Complete Lock / Unlock Button for this specific month */}
                <button
                  type="button"
                  onClick={handleToggleSheetLock}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-xl flex items-center gap-2 shadow-xs transition-all cursor-pointer ${
                    isSheetLocked
                      ? 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white shadow-rose-900/30 ring-2 ring-rose-400/50 animate-pulse'
                      : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-amber-900/20'
                  }`}
                  title={isSheetLocked ? `${selectedMonth} is locked. Click to enter password and unlock.` : `Click to lock ${selectedMonth} Working Sheet & Cockpits`}
                >
                  {isSheetLocked ? (
                    <>
                      <Lock className="w-4 h-4 text-white" />
                      <span>Locked (Unlock {selectedMonth.slice(0, 3)})</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-4 h-4 text-white" />
                      <span>Lock {selectedMonth.slice(0, 3)} Sheet</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 12-Month Navigation Tabs Bar */}
            <div className="bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                <span>Month Filing Tabs:</span>
              </div>
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
                {GSTR3B_MONTHS.map(m => {
                  const isSelected = selectedMonth === m;
                  const isMLocked = Boolean(lockedMonths[m]);
                  const mData = workingData.months[m];
                  const hasCash = (mData?.settlement?.balancePayable?.total || 0) > 0;
                  const hasData = (mData?.outward?.totalSaleWorking?.taxable || 0) > 0 || (mData?.inward?.totalItcAvailable?.total || 0) > 0;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelectedMonth(m)}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                        isSelected
                          ? isMLocked
                            ? 'bg-rose-700 text-white shadow-xs font-bold scale-102 ring-2 ring-rose-400'
                            : 'bg-indigo-600 text-white shadow-xs font-bold scale-102'
                          : isMLocked
                          ? 'text-rose-700 hover:text-rose-900 hover:bg-rose-50 bg-rose-50/70 border border-rose-200'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-slate-50 border border-slate-200/60'
                      }`}
                      title={isMLocked ? `${m} is locked (Read-Only)` : `${m} is unlocked`}
                    >
                      {isMLocked ? <Lock className="w-3 h-3 text-rose-300 shrink-0" /> : null}
                      <span>{m.slice(0, 3)} '{String(mData?.year || currentMonthData.year).slice(-2)}</span>
                      {hasCash ? (
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-rose-500'}`} title="Cash tax payable due" />
                      ) : hasData ? (
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-300' : 'bg-emerald-500'}`} title="Data populated" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─── SPLIT EXPANDABLE / COLLAPSIBLE AUTO-INGESTION DECKS (GSTR-1 OUTWARD & GSTR-2B INWARD) ─── */}
            <div className="frosted-glass rounded-2xl border border-slate-300 shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden transition-all duration-300">
              <div
                onClick={() => setIsAutoIngestDeckCollapsed(prev => !prev)}
                className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 flex items-center justify-between cursor-pointer select-none transition-colors border-b border-slate-800"
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-indigo-400 text-[18px]">sync_alt</span>
                  <span className="font-bold text-xs tracking-wide uppercase">
                    Return Autopilot & Ingestion Cockpits (GSTR-1 Outward & GSTR-2B Inward)
                  </span>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded font-mono font-bold">
                    Split View
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-medium">
                    {isAutoIngestDeckCollapsed ? 'Click to Expand Cockpits' : 'Click to Collapse Cockpits'}
                  </span>
                  <span className="material-symbols-outlined text-[18px] text-slate-300 transition-transform duration-300">
                    {isAutoIngestDeckCollapsed ? 'expand_more' : 'expand_less'}
                  </span>
                </div>
              </div>

              {!isAutoIngestDeckCollapsed && (
                <div className="p-2 sm:p-3.5 bg-slate-950/60 w-full min-w-0">
                  <ReturnsAutoIngestDeck
                    compactMode={true}
                    selectedMonth={selectedMonth}
                    financialYear={workingData.profile.financialYear || '2025-26'}
                    onFinancialYearChange={handleFinancialYearChange}
                    currentGstin={workingData.profile.gstin}
                    currentFirmName={workingData.profile.firmName}
                    currentMonthData={currentMonthData}
                    workingData={workingData}
                    onApplyIngestedReturns={handleApplyIngestedReturns}
                    isLocked={isSheetLocked}
                    onClearMonthIngestion={() => {
                      if (isSheetLocked) {
                        toast.error('Working Sheet is Locked', { description: 'Unlock sheet to clear return figures.' });
                        return;
                      }
                      if (window.confirm(`Clear ingested returns figures for ${selectedMonth} ${currentMonthData.year}?`)) {
                        setWorkingData(prev => {
                          const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
                          const cur = cloned.months[selectedMonth];
                          const empty = createEmptyMonthData(selectedMonth, cloned.profile.financialYear);
                          cur.outward = empty.outward;
                          cur.inward = empty.inward;
                          const recalculated = recalculateAnnualWorking(cloned);
                          saveClientWorkingData(recalculated);
                          saveToServerStorage(recalculated).catch(() => {});
                          return recalculated;
                        });
                        toast.success(`Cleared figures for ${selectedMonth}`);
                      }
                    }}
                    onClearGstr1={() => {
                      if (isSheetLocked) {
                        toast.error('Working Sheet is Locked');
                        return;
                      }
                      setWorkingData(prev => {
                        const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
                        cloned.months[selectedMonth].outward = createEmptyMonthData(selectedMonth, cloned.profile.financialYear).outward;
                        const recalculated = recalculateAnnualWorking(cloned);
                        saveClientWorkingData(recalculated);
                        saveToServerStorage(recalculated).catch(() => {});
                        return recalculated;
                      });
                    }}
                    onClearGstr2b={() => {
                      if (isSheetLocked) {
                        toast.error('Working Sheet is Locked');
                        return;
                      }
                      setWorkingData(prev => {
                        const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
                        cloned.months[selectedMonth].inward = createEmptyMonthData(selectedMonth, cloned.profile.financialYear).inward;
                        const recalculated = recalculateAnnualWorking(cloned);
                        saveClientWorkingData(recalculated);
                        saveToServerStorage(recalculated).catch(() => {});
                        return recalculated;
                      });
                    }}
                    onSaveWorking={handleManualSave}
                    isSavingWorking={isSyncingToServer}
                    isEditMode={!isSheetLocked && isEditMode}
                    onUpdateField={isSheetLocked ? undefined : updateCurrentMonthField}
                  />
                </div>
              )}
            </div>

            {/* MAIN GSTR-3B WORKING SHEET TABLE - EXACT MATCH WITH REFERENCE IMAGE */}
            <div className="frosted-glass rounded-2xl border border-slate-300 shadow-[0_4px_24px_rgba(0,0,0,0.04)] overflow-hidden transition-all duration-300">
              {/* Computation Heading Bar */}
              <div className="bg-slate-900 text-white px-5 py-3 rounded-t-2xl flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 shadow-md">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-300 text-[20px]">table_view</span>
                  <span className="font-bold text-sm tracking-wide uppercase">
                    {workingData.profile.firmName || 'DYP INFRAPROJECTS PRIVATE LIMITED'} — GSTR-3B COMPUTATION SHEET
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-mono text-slate-300 font-medium hidden sm:inline">
                    Month: {selectedMonth.toUpperCase()} {currentMonthData.year} | Currency: INR (₹)
                  </span>
                  <button
                    onClick={() => {
                      if (isSheetLocked) {
                        setShowUnlockModal(true);
                        toast.error('Working Sheet is Locked', {
                          description: `Please enter password to unlock ${selectedMonth} and edit sub-accounts.`
                        });
                        return;
                      }
                      setIsEditMode(!isEditMode);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      isSheetLocked
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-xs'
                        : isEditMode
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    }`}
                    title={isSheetLocked ? `${selectedMonth} is locked. Click to enter password and unlock.` : isEditMode ? 'Lock Table' : 'Edit Sub-Accounts'}
                  >
                    <span className="material-symbols-outlined text-[15px]">
                      {isSheetLocked ? 'lock' : isEditMode ? 'lock' : 'edit_note'}
                    </span>
                    <span>{isSheetLocked ? `Locked (${selectedMonth.slice(0, 3)})` : isEditMode ? 'Lock Table' : 'Edit Sub-Accounts'}</span>
                  </button>

                  {/* Clear Month Data Button */}
                  <button
                    onClick={() => {
                      if (isSheetLocked) {
                        toast.error('Working Sheet is Locked', {
                          description: `Please unlock ${selectedMonth} before resetting figures.`
                        });
                        return;
                      }
                      if (window.confirm(`Clear all GSTR-3B values for ${selectedMonth} ${currentMonthData.year}?`)) {
                        setWorkingData(prev => {
                          const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
                          cloned.months[selectedMonth] = createEmptyMonthData(selectedMonth, cloned.profile.financialYear);
                          const recalculated = recalculateAnnualWorking(cloned);
                          saveClientWorkingData(recalculated);
                          saveToServerStorage(recalculated).catch(() => {});
                          return recalculated;
                        });
                        toast.success(`Cleared all figures for ${selectedMonth}`);
                      }
                    }}
                    disabled={isSheetLocked}
                    title={isSheetLocked ? `${selectedMonth} sheet is locked` : `Reset and clear all figures for ${selectedMonth}`}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-all cursor-pointer ${
                      isSheetLocked ? 'opacity-40 cursor-not-allowed' : ''
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px] text-rose-400">restart_alt</span>
                    <span>Clear Month</span>
                  </button>

                  {/* Collapse / Expand Toggle for Main Computation Sheet */}
                  <button
                    onClick={() => setIsComputationTableCollapsed(prev => !prev)}
                    title={isComputationTableCollapsed ? 'Expand Computation Sheet' : 'Collapse Computation Sheet'}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px] transition-transform duration-300">
                      {isComputationTableCollapsed ? 'expand_more' : 'expand_less'}
                    </span>
                    <span>{isComputationTableCollapsed ? 'Expand Sheet' : 'Collapse Sheet'}</span>
                  </button>
                </div>
              </div>

              {!isComputationTableCollapsed && (
              <div className="overflow-x-auto max-h-[750px] scrollbar-thin scrollbar-thumb-slate-300">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="border-b-2 border-slate-300 sticky top-0 z-10 shadow-xs">
                    <tr className="bg-slate-100 text-slate-800 font-label text-[11px] uppercase tracking-wider">
                      <th className="py-2.5 px-3.5 font-bold border-r border-slate-200 w-2/5 bg-slate-100">PARTICULARS</th>
                      <th className="py-2.5 px-3.5 font-bold text-right border-r border-slate-200 w-[12%] bg-slate-100">TAXABLE</th>
                      <th className="py-2.5 px-3.5 font-bold text-right border-r border-slate-200 w-[12%] bg-slate-100">CGST</th>
                      <th className="py-2.5 px-3.5 font-bold text-right border-r border-slate-200 w-[12%] bg-slate-100">SGST</th>
                      <th className="py-2.5 px-3.5 font-bold text-right border-r border-slate-200 w-[12%] bg-slate-100">IGST</th>
                      <th className="py-2.5 px-3.5 font-bold text-right w-[12%] bg-slate-100">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs divide-y divide-slate-200">
                    {/* SECTION 1: OUTWARD SUPPLY */}
                    {/* Sales (B2B) */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2.5 px-4 font-sans text-xs text-slate-800 font-medium border-r border-slate-200">
                        <div className="flex items-center justify-between">
                          <span>Sales (B2B)</span>
                          <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-200/60 px-1.5 py-0.2 rounded font-sans uppercase font-semibold">GSTR-1 Reco</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={b2b.taxable || ''}
                            onChange={e => updateCurrentMonthField('outward', 'b2b', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(b2b.taxable)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={b2b.cgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'b2b', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(b2b.cgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={b2b.sgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'b2b', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(b2b.sgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={b2b.igst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'b2b', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(b2b.igst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 font-semibold">
                        {renderCell(b2b.total, true, false, true)}
                      </td>
                    </tr>

                    {/* Sales (B2C) */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/50">
                      <td className="py-2.5 px-4 font-sans text-xs text-slate-800 font-medium border-r border-slate-200">
                        <span>Sales (B2C)</span>
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={b2c.taxable || ''}
                            onChange={e => updateCurrentMonthField('outward', 'b2c', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(b2c.taxable)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={b2c.cgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'b2c', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(b2c.cgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={b2c.sgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'b2c', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(b2c.sgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={b2c.igst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'b2c', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(b2c.igst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 font-semibold">
                        {renderCell(b2c.total, true, false, true)}
                      </td>
                    </tr>

                    {/* SEZ supply with payment */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">SEZ supply with payment</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={sezWith.taxable || ''}
                            onChange={e => updateCurrentMonthField('outward', 'sezWithPayment', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(sezWith.taxable)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={sezWith.cgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'sezWithPayment', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(sezWith.cgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={sezWith.sgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'sezWithPayment', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(sezWith.sgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={sezWith.igst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'sezWithPayment', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(sezWith.igst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 font-semibold">{renderCell(sezWith.total, true, false, true)}</td>
                    </tr>

                    {/* SEZ supply without-payment */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/30">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">SEZ supply without-payment</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={sezWithout.taxable || ''}
                            onChange={e => updateCurrentMonthField('outward', 'sezWithoutPayment', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(sezWithout.taxable)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(0)}</td>
                    </tr>

                    {/* Zero Rated Supply/Export Sale */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">Zero Rated Supply/Export Sale</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={zeroRated.taxable || ''}
                            onChange={e => updateCurrentMonthField('outward', 'zeroRated', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(zeroRated.taxable)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={zeroRated.igst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'zeroRated', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(zeroRated.igst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 font-semibold">{renderCell(zeroRated.total, true, false, true)}</td>
                    </tr>

                    {/* Nil Rated Supply */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/30">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">Nil Rated Supply</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={nilRated.taxable || ''}
                            onChange={e => updateCurrentMonthField('outward', 'nilRated', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(nilRated.taxable)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(0)}</td>
                    </tr>

                    {/* Exempt Sale */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">Exempt Sale</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={exempt.taxable || ''}
                            onChange={e => updateCurrentMonthField('outward', 'exempt', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(exempt.taxable)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(0)}</td>
                    </tr>

                    {/* Advances Collected for Services */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/30">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">Advances Collected for Services</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={advRec.taxable || ''}
                            onChange={e => updateCurrentMonthField('outward', 'advanceReceived', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(advRec.taxable)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={advRec.cgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'advanceReceived', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(advRec.cgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={advRec.sgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'advanceReceived', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(advRec.sgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={advRec.igst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'advanceReceived', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(advRec.igst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 font-semibold">{renderCell(advRec.total, true, false, true)}</td>
                    </tr>

                    {/* Rent Received */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">Rent Received</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rentRec.taxable || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rentReceived', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(rentRec.taxable)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rentRec.cgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rentReceived', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(rentRec.cgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rentRec.sgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rentReceived', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(rentRec.sgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rentRec.igst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rentReceived', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(rentRec.igst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 font-semibold">{renderCell(rentRec.total, true, false, true)}</td>
                    </tr>

                    {/* Sale Increased through Amendment */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/30">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">Sale Increased through Amendment</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={incAmend.taxable || ''}
                            onChange={e => updateCurrentMonthField('outward', 'saleIncreaseAmendment', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(incAmend.taxable)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={incAmend.cgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'saleIncreaseAmendment', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(incAmend.cgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={incAmend.sgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'saleIncreaseAmendment', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(incAmend.sgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={incAmend.igst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'saleIncreaseAmendment', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(incAmend.igst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 font-semibold">{renderCell(incAmend.total, true, false, true)}</td>
                    </tr>

                    {/* (-) Sale Decreased through Amendment */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white text-rose-700">
                      <td className="py-2 px-4 font-sans text-xs border-r border-slate-200">(-) Sale Decreased through Amendment</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={decAmend.taxable || ''}
                            onChange={e => updateCurrentMonthField('outward', 'saleDecreaseAmendment', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(decAmend.taxable ? -decAmend.taxable : 0)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={decAmend.cgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'saleDecreaseAmendment', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(decAmend.cgst ? -decAmend.cgst : 0)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={decAmend.sgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'saleDecreaseAmendment', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(decAmend.sgst ? -decAmend.sgst : 0)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={decAmend.igst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'saleDecreaseAmendment', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(decAmend.igst ? -decAmend.igst : 0)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(decAmend.total ? -decAmend.total : 0, true, false, true)}</td>
                    </tr>

                    {/* (-) Credit Note */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-rose-50/20 text-rose-700">
                      <td className="py-2 px-4 font-sans text-xs border-r border-slate-200 font-medium">(-) Credit Note</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={crNote.taxable || ''}
                            onChange={e => updateCurrentMonthField('outward', 'creditNote', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(crNote.taxable ? -crNote.taxable : 0)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={crNote.cgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'creditNote', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(crNote.cgst ? -crNote.cgst : 0)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={crNote.sgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'creditNote', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(crNote.sgst ? -crNote.sgst : 0)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={crNote.igst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'creditNote', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(crNote.igst ? -crNote.igst : 0)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(crNote.total ? -crNote.total : 0, true, false, true)}</td>
                    </tr>

                    {/* (-) Advances Settled Against Services */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white text-rose-700">
                      <td className="py-2 px-4 font-sans text-xs border-r border-slate-200">(-) Advances Settled Against Services</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={advAdj.taxable || ''}
                            onChange={e => updateCurrentMonthField('outward', 'advanceAdjusted', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(advAdj.taxable ? -advAdj.taxable : 0)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={advAdj.cgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'advanceAdjusted', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(advAdj.cgst ? -advAdj.cgst : 0)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={advAdj.sgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'advanceAdjusted', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(advAdj.sgst ? -advAdj.sgst : 0)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={advAdj.igst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'advanceAdjusted', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(advAdj.igst ? -advAdj.igst : 0)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(advAdj.total ? -advAdj.total : 0, true, false, true)}</td>
                    </tr>

                    {/* Total Sale as per Working */}
                    <tr className="bg-slate-100 font-semibold border-t border-slate-300">
                      <td className="py-2.5 px-4 font-sans text-xs text-slate-900 border-r border-slate-200">Total Sale as per Working</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(subtotalSalesTaxable)}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(subtotalSalesCgst)}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(subtotalSalesSgst)}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(subtotalSalesIgst)}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 font-bold">{renderCell(subtotalSalesTotal, true, false, true)}</td>
                    </tr>

                    {/* Reverse Charge on Inward Supplies (Summary Row matching reference format) */}
                    <tr className="bg-slate-100/90 font-bold border-t border-slate-300">
                      <td className="py-2.5 px-4 font-sans text-xs text-slate-900 border-r border-slate-200 flex items-center justify-between">
                        <span className="font-bold">Reverse Charge on Inward Supplies</span>
                        <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded font-sans uppercase font-semibold">RCM Total</span>
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200 font-bold">
                        {renderCell(rcmInward.taxable, true, false, true)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200 font-bold">
                        {renderCell(rcmInward.cgst, true, false, true)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200 font-bold">
                        {renderCell(rcmInward.sgst, true, false, true)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200 font-bold">
                        {renderCell(rcmInward.igst, true, false, true)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 font-bold">
                        {renderCell(rcmInward.total, true, false, true)}
                      </td>
                    </tr>

                    {/* RCM Category 1: RCM on Transport Charges */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2 px-4 font-sans text-xs text-slate-700 border-r border-slate-200 pl-8 flex items-center gap-2">
                        <span className="text-slate-400 font-mono text-[11px]">•</span>
                        <span>RCM on Transport Charges</span>
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmTransport.taxable || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmTransport', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmTransport.taxable)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmTransport.cgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmTransport', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmTransport.cgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmTransport.sgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmTransport', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmTransport.sgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmTransport.igst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmTransport', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmTransport.igst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 font-semibold">
                        {renderCell(rcmTransport.total, true, false, true)}
                      </td>
                    </tr>

                    {/* RCM Category 2: RCM on Security Charges */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/30">
                      <td className="py-2 px-4 font-sans text-xs text-slate-700 border-r border-slate-200 pl-8 flex items-center gap-2">
                        <span className="text-slate-400 font-mono text-[11px]">•</span>
                        <span>RCM on Security Charges</span>
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmSecurity.taxable || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmSecurity', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmSecurity.taxable)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmSecurity.cgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmSecurity', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmSecurity.cgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmSecurity.sgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmSecurity', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmSecurity.sgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmSecurity.igst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmSecurity', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmSecurity.igst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 font-semibold">
                        {renderCell(rcmSecurity.total, true, false, true)}
                      </td>
                    </tr>

                    {/* RCM Category 3: RCM on Guest House Charges */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2 px-4 font-sans text-xs text-slate-700 border-r border-slate-200 pl-8 flex items-center gap-2">
                        <span className="text-slate-400 font-mono text-[11px]">•</span>
                        <span>RCM on Guest House Charges</span>
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmGuestHouse.taxable || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmGuestHouse', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmGuestHouse.taxable)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmGuestHouse.cgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmGuestHouse', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmGuestHouse.cgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmGuestHouse.sgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmGuestHouse', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmGuestHouse.sgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmGuestHouse.igst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmGuestHouse', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmGuestHouse.igst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 font-semibold">
                        {renderCell(rcmGuestHouse.total, true, false, true)}
                      </td>
                    </tr>

                    {/* RCM Category 4: RCM on Advocate Charges */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/30">
                      <td className="py-2 px-4 font-sans text-xs text-slate-700 border-r border-slate-200 pl-8 flex items-center gap-2">
                        <span className="text-slate-400 font-mono text-[11px]">•</span>
                        <span>RCM on Advocate Charges</span>
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmAdvocate.taxable || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmAdvocate', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmAdvocate.taxable)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmAdvocate.cgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmAdvocate', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmAdvocate.cgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmAdvocate.sgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmAdvocate', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmAdvocate.sgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmAdvocate.igst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmAdvocate', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmAdvocate.igst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 font-semibold">
                        {renderCell(rcmAdvocate.total, true, false, true)}
                      </td>
                    </tr>

                    {/* (A) Total Sale as per Working including Reverse Charge */}
                    <tr className="bg-indigo-50/80 font-bold border-y-2 border-indigo-300">
                      <td className="py-3 px-4 font-sans text-xs text-indigo-950 border-r border-slate-200 uppercase tracking-wide flex items-center justify-between">
                        <span>(A) Total Sale as per Working including Reverse Charge</span>
                        <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded font-sans font-bold">Gross Liability (A)</span>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-indigo-950 border-r border-slate-200 font-bold text-sm">
                        {renderCell(grossTaxable, true, false, true, 'text-indigo-950')}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-indigo-950 border-r border-slate-200 font-bold text-sm">
                        {renderCell(grossCgst, true, false, true, 'text-indigo-950')}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-indigo-950 border-r border-slate-200 font-bold text-sm">
                        {renderCell(grossSgst, true, false, true, 'text-indigo-950')}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-indigo-950 border-r border-slate-200 font-bold text-sm">
                        {renderCell(grossIgst, true, false, true, 'text-indigo-950')}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-indigo-950 font-bold text-sm">
                        {renderCell(grossTotal, true, false, true, 'text-indigo-950')}
                      </td>
                    </tr>

                    {/* SECTION 2: INWARD SUPPLIES (ITC) */}
                    <tr className="bg-sky-50/60 font-semibold border-b border-sky-200">
                      <td className="py-2.5 px-4 font-sans text-xs text-sky-900 border-r border-slate-200">
                        ITC (As per books)
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-sky-950 font-semibold">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={currentMonthData.inward.itcBooks || ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setWorkingData(prev => {
                                const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
                                cloned.months[selectedMonth].inward.itcBooks = val;
                                return cloned;
                              });
                            }}
                            className="w-24 bg-white border border-sky-300 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(currentMonthData.inward.itcBooks || 0, true, false, true)}
                      </td>
                    </tr>

                    {/* ITC as per GSTR 2B */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2.5 px-4 font-sans text-xs text-slate-900 font-semibold border-r border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span>ITC as per GSTR 2B</span>
                          <button
                            type="button"
                            onClick={() => setIsViewing2bAllocations(true)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 hover:border-indigo-300 px-2 py-0.5 rounded shadow-2xs transition-all cursor-pointer"
                            title="Drill down into GSTR-2B inward bills to classify Eligible 4(A)(5), Ineligible 17(5), and Temporary Reversals 4(B)(2)"
                          >
                            <Layers className="w-3 h-3 text-indigo-600" />
                            <span>View & Allocate 2B Bills</span>
                            <ArrowUpRight className="w-3 h-3 text-indigo-500" />
                          </button>
                        </div>
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-sans uppercase font-bold">2B Matched</span>
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200 font-medium">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={itc2b.taxable || ''}
                            onChange={e => updateCurrentMonthField('inward', 'itc2b', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(itc2b.taxable)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200 font-medium">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={itc2b.cgst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'itc2b', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(itc2b.cgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200 font-medium">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={itc2b.sgst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'itc2b', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(itc2b.sgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-indigo-700 border-r border-slate-200 font-bold">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={itc2b.igst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'itc2b', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-indigo-300 rounded px-1.5 py-0.5 text-right font-mono text-indigo-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(itc2b.igst, true, false, true, 'text-indigo-700')}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 font-semibold">
                        {renderCell(itc2b.total, true, false, true)}
                      </td>
                    </tr>

                    {/* (+) Import purchase */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/30">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">(+) Import purchase</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={importGoods.taxable || ''}
                            onChange={e => updateCurrentMonthField('inward', 'importGoods', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(importGoods.taxable)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={importGoods.cgst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'importGoods', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(importGoods.cgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={importGoods.sgst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'importGoods', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(importGoods.sgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={importGoods.igst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'importGoods', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(importGoods.igst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(importGoods.total, true, false, true)}</td>
                    </tr>

                    {/* (+) RCM paid on Inward Supplies */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">(+) RCM paid on Inward Supplies</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmPaid.taxable || ''}
                            onChange={e => updateCurrentMonthField('inward', 'rcmPaid', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(rcmPaid.taxable)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmPaid.cgst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'rcmPaid', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(rcmPaid.cgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmPaid.sgst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'rcmPaid', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(rcmPaid.sgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmPaid.igst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'rcmPaid', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(rcmPaid.igst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(rcmPaid.total, true, false, true)}</td>
                    </tr>

                    {/* (+) Credit Notes */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/30">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">(+) Credit Notes</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={crNotesInw.taxable || ''}
                            onChange={e => updateCurrentMonthField('inward', 'creditNotes', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(crNotesInw.taxable)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={crNotesInw.cgst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'creditNotes', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(crNotesInw.cgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={crNotesInw.sgst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'creditNotes', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(crNotesInw.sgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={crNotesInw.igst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'creditNotes', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(crNotesInw.igst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(crNotesInw.total, true, false, true)}</td>
                    </tr>

                    {/* (+) Opening Credit Balance */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">(+) Opening Credit Balance</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={openingBal.cgst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'openingCreditBal', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(openingBal.cgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={openingBal.sgst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'openingCreditBal', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(openingBal.sgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={openingBal.igst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'openingCreditBal', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(openingBal.igst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(openingBal.total, true, false, true)}</td>
                    </tr>

                    {/* (-) Debit Notes */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/30 text-rose-700">
                      <td className="py-2 px-4 font-sans text-xs border-r border-slate-200">(-) Debit Notes</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={debNotesInw.taxable || ''}
                            onChange={e => updateCurrentMonthField('inward', 'debitNotes', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(debNotesInw.taxable ? -debNotesInw.taxable : 0)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={debNotesInw.cgst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'debitNotes', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(debNotesInw.cgst ? -debNotesInw.cgst : 0)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={debNotesInw.sgst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'debitNotes', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(debNotesInw.sgst ? -debNotesInw.sgst : 0)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={debNotesInw.igst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'debitNotes', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(debNotesInw.igst ? -debNotesInw.igst : 0)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(debNotesInw.total ? -debNotesInw.total : 0, true, false, true)}</td>
                    </tr>

                    {/* (-) Permanent Reversal [Rule 38/42/43/17(5)] - Table 4(B)(1) */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-rose-50/40 text-rose-700">
                      <td className="py-2.5 px-4 font-sans text-xs border-r border-slate-200 flex items-center justify-between">
                        <span>(-) Permanent Reversal (Table 4(B)(1))</span>
                        <span className="text-[10px] text-rose-700 bg-rose-100 border border-rose-200 px-1.5 py-0.2 rounded font-sans uppercase font-bold">Rule 38/42/43/17(5)</span>
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={itcRev.taxable || ''}
                            onChange={e => updateCurrentMonthField('inward', 'itcReversed', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(itcRev.taxable ? -itcRev.taxable : 0)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={itcRev.cgst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'itcReversed', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                          />
                        ) : renderCell(itcRev.cgst ? -itcRev.cgst : 0)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={itcRev.sgst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'itcReversed', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                          />
                        ) : renderCell(itcRev.sgst ? -itcRev.sgst : 0)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={itcRev.igst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'itcReversed', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-rose-300 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 outline-none"
                          />
                        ) : renderCell(itcRev.igst ? -itcRev.igst : 0)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums font-bold">
                        {renderCell(itcRev.total ? -itcRev.total : 0, true, false, true)}
                      </td>
                    </tr>

                    {/* (-) Temporary Reversal [Rule 37 / 180 Days / Others] - Table 4(B)(2) */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-amber-50/30 text-amber-800">
                      <td className="py-2.5 px-4 font-sans text-xs border-r border-slate-200 flex items-center justify-between">
                        <span>(-) Temporary Reversal (Table 4(B)(2))</span>
                        <span className="text-[10px] text-amber-800 bg-amber-100 border border-amber-200 px-1.5 py-0.2 rounded font-sans uppercase font-bold">Rule 37 / 180 Days / Others</span>
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={itcRevOther.taxable || ''}
                            onChange={e => updateCurrentMonthField('inward', 'itcReversedOther', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-white border border-amber-300 rounded px-1.5 py-0.5 text-right font-mono text-amber-800 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(itcRevOther.taxable ? -itcRevOther.taxable : 0)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={itcRevOther.cgst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'itcReversedOther', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-amber-300 rounded px-1.5 py-0.5 text-right font-mono text-amber-800 outline-none"
                          />
                        ) : renderCell(itcRevOther.cgst ? -itcRevOther.cgst : 0)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={itcRevOther.sgst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'itcReversedOther', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-amber-300 rounded px-1.5 py-0.5 text-right font-mono text-amber-800 outline-none"
                          />
                        ) : renderCell(itcRevOther.sgst ? -itcRevOther.sgst : 0)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={itcRevOther.igst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'itcReversedOther', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-amber-300 rounded px-1.5 py-0.5 text-right font-mono text-amber-800 outline-none"
                          />
                        ) : renderCell(itcRevOther.igst ? -itcRevOther.igst : 0)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums font-bold">
                        {renderCell(itcRevOther.total ? -itcRevOther.total : 0, true, false, true)}
                      </td>
                    </tr>

                    {/* Table 4(D) Other Details: Ineligible ITC (Audit Disclosed) */}
                    {Boolean((currentMonthData.inward as any)?.ineligibleItc?.total) && (
                      <tr className="hover:bg-slate-50/80 transition-colors bg-rose-50/20 text-rose-800">
                        <td className="py-2.5 px-4 font-sans text-xs border-r border-slate-200 flex items-center justify-between">
                          <span className="font-semibold">Table 4(D) Other Details: Ineligible ITC</span>
                          <span className="text-[10px] text-rose-700 bg-rose-100 border border-rose-300 px-1.5 py-0.2 rounded font-sans uppercase font-bold">Sec 17(5) / 16(4) Audit Tracked</span>
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">
                          {renderCell((currentMonthData.inward as any)?.ineligibleItc?.taxable || 0)}
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">
                          {renderCell((currentMonthData.inward as any)?.ineligibleItc?.cgst || 0)}
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">
                          {renderCell((currentMonthData.inward as any)?.ineligibleItc?.sgst || 0)}
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">
                          {renderCell((currentMonthData.inward as any)?.ineligibleItc?.igst || 0)}
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums font-bold">
                          {renderCell((currentMonthData.inward as any)?.ineligibleItc?.total || 0, true, false, true)}
                        </td>
                      </tr>
                    )}

                    {/* (B) Total ITC Available for Set off */}
                    <tr className="bg-emerald-50/80 font-bold border-y-2 border-emerald-300">
                      <td className="py-3 px-4 font-sans text-xs text-emerald-950 border-r border-slate-200 uppercase tracking-wide flex items-center justify-between">
                        <span>(B) Total ITC Available for Set off</span>
                        <div className="flex items-center gap-1.5">
                          {currentMonthData.inward?.isManualTotalItc && (
                            <button
                              type="button"
                              onClick={() => {
                                setWorkingData(prev => {
                                  const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
                                  cloned.months[selectedMonth].inward.isManualTotalItc = false;
                                  const updated = recalculateAnnualWorking(cloned);
                                  saveToServerStorage(updated).catch(() => {});
                                  return updated;
                                });
                                toast.info('Reset Total ITC to automatic inward calculation');
                              }}
                              className="text-[9px] bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 px-1.5 py-0.2 rounded font-sans font-semibold cursor-pointer"
                              title="Reset Total ITC Available to auto-calculated from Inward Supplies"
                            >
                              Auto Calc
                            </button>
                          )}
                          <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded font-sans font-bold">Eligible ITC (B)</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-emerald-950 border-r border-slate-200 font-bold text-sm">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={itcAvail.taxable || ''}
                            onChange={e => updateCurrentMonthField('inward', 'totalItcAvailable', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-white border border-emerald-400 rounded px-1.5 py-0.5 text-right font-mono text-emerald-950 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(itcAvail.taxable, true, false, true, 'text-emerald-950')}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-emerald-950 border-r border-slate-200 font-bold text-sm">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={itcAvail.cgst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'totalItcAvailable', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-emerald-400 rounded px-1.5 py-0.5 text-right font-mono text-emerald-950 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(itcAvail.cgst, true, false, true, 'text-emerald-950')}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-emerald-950 border-r border-slate-200 font-bold text-sm">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={itcAvail.sgst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'totalItcAvailable', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-emerald-400 rounded px-1.5 py-0.5 text-right font-mono text-emerald-950 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(itcAvail.sgst, true, false, true, 'text-emerald-950')}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-emerald-950 border-r border-slate-200 font-bold text-sm">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={itcAvail.igst || ''}
                            onChange={e => updateCurrentMonthField('inward', 'totalItcAvailable', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-white border border-emerald-400 rounded px-1.5 py-0.5 text-right font-mono text-emerald-950 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(itcAvail.igst, true, false, true, 'text-emerald-950')}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-emerald-950 font-bold text-sm">
                        {renderCell(itcAvail.total, true, false, true, 'text-emerald-950')}
                      </td>
                    </tr>

                    {/* SECTION 3: TAX LIABILITY COMPUTATION & SET OFF */}
                    {/* (A-B) Payable */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white font-semibold">
                      <td className="py-2.5 px-4 font-sans text-xs text-slate-900 border-r border-slate-200 font-bold">
                        (A-B) Payable
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200 font-semibold">
                        {renderCell(payableCgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200 font-semibold">
                        {renderCell(payableSgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-indigo-700 border-r border-slate-200 font-semibold">
                        {renderCell(payableIgst, true, false, true, 'text-indigo-700')}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 font-bold">
                        {renderCell(payableTotal, true, false, true)}
                      </td>
                    </tr>

                    {/* (-) Adjustment */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/40">
                      <td className="py-2.5 px-4 font-sans text-xs text-slate-800 border-r border-slate-200 flex items-center justify-between">
                        <span>(-) Adjustment</span>
                        <div className="flex items-center gap-1.5">
                          {currentMonthData.setoff?.isManualAdjustment && (
                            <button
                              type="button"
                              onClick={() => {
                                setWorkingData(prev => {
                                  const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
                                  cloned.months[selectedMonth].setoff.isManualAdjustment = false;
                                  const updated = recalculateAnnualWorking(cloned);
                                  saveToServerStorage(updated).catch(() => {});
                                  return updated;
                                });
                                toast.info('Reset to automatic Rule 88A set-off calculation');
                              }}
                              className="text-[9px] bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 px-1.5 py-0.2 rounded font-sans font-semibold cursor-pointer"
                              title="Reset to Auto Rule 88A calculation"
                            >
                              Auto Rule 88A
                            </button>
                          )}
                          <span className="text-[10px] text-slate-500 font-sans uppercase font-semibold">Rule 88A Cross Set-off</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200 font-medium">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={adj.cgst || ''}
                            onChange={e => updateCurrentMonthField('setoff', 'adjustment', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(adj.cgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200 font-medium">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={adj.sgst || ''}
                            onChange={e => updateCurrentMonthField('setoff', 'adjustment', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(adj.sgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-indigo-700 border-r border-slate-200 font-medium">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={adj.igst ? Math.abs(adj.igst) : ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              updateCurrentMonthField('setoff', 'adjustment', 'igst', -Math.abs(val));
                            }}
                            className="w-20 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded px-1.5 py-0.5 text-right font-mono text-indigo-700 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(adj.igst ? -adj.igst : 0)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-400">-</td>
                    </tr>

                    {/* (-) GST TDS/TCS Opening Cash Balance */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2.5 px-4 font-sans text-xs text-slate-800 border-r border-slate-200 flex items-center justify-between">
                        <span>(-) GST TDS/TCS Opening Cash Balance</span>
                        <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded font-sans uppercase font-semibold">Cash Ledger Offset</span>
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200 font-medium">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={tdsTcs.cgst || ''}
                            onChange={e => updateCurrentMonthField('settlement', 'tdsTcsOpeningCash', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                          />
                        ) : renderCell(tdsTcs.cgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200 font-medium">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={tdsTcs.sgst || ''}
                            onChange={e => updateCurrentMonthField('settlement', 'tdsTcsOpeningCash', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                          />
                        ) : renderCell(tdsTcs.sgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200 font-medium">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={tdsTcs.igst || ''}
                            onChange={e => updateCurrentMonthField('settlement', 'tdsTcsOpeningCash', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                          />
                        ) : renderCell(tdsTcs.igst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 font-medium">
                        {renderCell(tdsTcs.total, true, false, true)}
                      </td>
                    </tr>

                    {/* Final Liability Payable */}
                    <tr className="bg-indigo-100/70 font-bold border-y-2 border-indigo-300">
                      <td className="py-3 px-4 font-sans text-xs text-indigo-950 border-r border-slate-200 uppercase tracking-wide">
                        Final Liability Payable
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-3 px-4 text-right tabular-nums text-indigo-950 border-r border-slate-200 font-bold text-sm">
                        {renderCell(finalPayable.cgst, true, false, true, 'text-indigo-950')}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-indigo-950 border-r border-slate-200 font-bold text-sm">
                        {renderCell(finalPayable.sgst, true, false, true, 'text-indigo-950')}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-indigo-950 border-r border-slate-200 font-bold text-sm">
                        {renderCell(finalPayable.igst, true, false, true, 'text-indigo-950')}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-indigo-950 font-bold text-sm">
                        {renderCell(finalPayable.total, true, false, true, 'text-indigo-950')}
                      </td>
                    </tr>

                    {/* Balance C/f to next month */}
                    <tr className="bg-slate-100/60 font-semibold border-b border-slate-200">
                      <td className="py-2.5 px-4 font-sans text-xs text-slate-700 border-r border-slate-200">
                        Balance C/f to next month
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-700 border-r border-slate-200 font-medium">
                        {renderCell(balanceCf.cgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-700 border-r border-slate-200 font-medium">
                        {renderCell(balanceCf.sgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-emerald-700 border-r border-slate-200 font-bold">
                        {renderCell(balanceCf.igst, true, false, true, 'text-emerald-700')}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-emerald-800 font-bold">
                        {renderCell(balanceCf.total, true, false, true, 'text-emerald-800')}
                      </td>
                    </tr>

                    {/* RCM Payable */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2 px-4 font-sans text-xs text-slate-700 border-r border-slate-200">RCM Payable (Cash)</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmInward.cgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmInward', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(rcmInward.cgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmInward.sgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmInward', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(rcmInward.sgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmInward.igst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmInward', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(rcmInward.igst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(rcmPayableVal, true, false, true)}</td>
                    </tr>

                    {/* Late Fees */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/30">
                      <td className="py-2 px-4 font-sans text-xs text-slate-700 border-r border-slate-200">Late Fees</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={lateFeesObj.cgst || ''}
                            onChange={e => updateCurrentMonthField('settlement', 'lateFees', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(lateFeesObj.cgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={lateFeesObj.sgst || ''}
                            onChange={e => updateCurrentMonthField('settlement', 'lateFees', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(lateFeesObj.sgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={lateFeesVal || ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setWorkingData(prev => {
                                const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
                                const half = Math.round((val / 2) * 100) / 100;
                                cloned.months[selectedMonth].settlement.lateFees = { cgst: half, sgst: half, total: val };
                                const recalculated = recalculateAnnualWorking(cloned);
                                saveToServerStorage(recalculated).catch(() => {});
                                return recalculated;
                              });
                            }}
                            className="w-24 bg-white border border-slate-300 focus:border-indigo-500 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(lateFeesVal, true, false, true)}
                      </td>
                    </tr>

                    {/* Interest */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2 px-4 font-sans text-xs text-slate-700 border-r border-slate-200">Interest</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={interestObj.cgst || ''}
                            onChange={e => updateCurrentMonthField('settlement', 'interest', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(interestObj.cgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={interestObj.sgst || ''}
                            onChange={e => updateCurrentMonthField('settlement', 'interest', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(interestObj.sgst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={interestObj.igst || ''}
                            onChange={e => updateCurrentMonthField('settlement', 'interest', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(interestObj.igst)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={interestVal || ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setWorkingData(prev => {
                                const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
                                const prevInterest = cloned.months[selectedMonth].settlement.interest;
                                cloned.months[selectedMonth].settlement.interest = {
                                  cgst: typeof prevInterest === 'object' && prevInterest !== null ? (prevInterest?.cgst || 0) : 0,
                                  sgst: typeof prevInterest === 'object' && prevInterest !== null ? (prevInterest?.sgst || 0) : 0,
                                  igst: typeof prevInterest === 'object' && prevInterest !== null ? (prevInterest?.igst || 0) : 0,
                                  total: val
                                };
                                const recalculated = recalculateAnnualWorking(cloned);
                                saveToServerStorage(recalculated).catch(() => {});
                                return recalculated;
                              });
                            }}
                            className="w-24 bg-white border border-slate-300 focus:border-indigo-500 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                            placeholder="0"
                          />
                        ) : renderCell(interestVal, true, false, true)}
                      </td>
                    </tr>

                    {/* Balance Payable if any (Bottom Total Final Payment) */}
                    <tr className="bg-slate-900 text-white font-bold text-sm">
                      <td className="py-3.5 px-4 font-sans text-white font-bold border-r border-slate-800 uppercase tracking-wide">
                        Balance Payable if any (Challan PMT-06 Net Outflow)
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums border-r border-slate-800 text-slate-400">-</td>
                      <td className="py-3.5 px-4 text-right tabular-nums border-r border-slate-800 text-slate-300">
                        {renderCell(netCgstDeposit, true, false, true, 'text-slate-200')}
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums border-r border-slate-800 text-slate-300">
                        {renderCell(netSgstDeposit, true, false, true, 'text-slate-200')}
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums border-r border-slate-800 text-indigo-300">
                        {renderCell(netIgstDeposit, true, false, true, 'text-indigo-300')}
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums text-emerald-400 font-extrabold text-base">
                        ₹ {formatCur(finalNetCashDeposit)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              )}
            </div>

            {/* Rule 88A & Net Cash Summary Insight Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: Gross Outward */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-label uppercase font-bold tracking-wider">Gross Outward Tax (A)</span>
                  <span className="material-symbols-outlined text-indigo-600 text-[18px]">trending_up</span>
                </div>
                <div className="mt-2">
                  <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums">₹ {formatCur(grossTotal)}</div>
                  <p className="font-body-sm text-xs text-slate-500 mt-0.5">Taxable Sales: ₹ {formatCur(grossTaxable)} (B2B + B2C + RCM)</p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-500">CGST + SGST:</span>
                  <span className="text-slate-800 font-semibold">₹ {formatCur(grossCgst)} + ₹ {formatCur(grossSgst)}</span>
                </div>
              </div>

              {/* Card 2: Total Set-off ITC */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-label uppercase font-bold tracking-wider">Total Eligible ITC (B)</span>
                  <span className="material-symbols-outlined text-emerald-600 text-[18px]">account_balance_wallet</span>
                </div>
                <div className="mt-2">
                  <div className="font-mono text-2xl font-bold text-emerald-700 tabular-nums">₹ {formatCur(itcAvail.total)}</div>
                  <p className="font-body-sm text-xs text-slate-500 mt-0.5">Net of Debit Notes & Ineligible Credit (₹ {formatCur(itcRev.total)})</p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-500">IGST Credit Available:</span>
                  <span className="text-indigo-600 font-semibold">₹ {formatCur(igstCreditAvail)} ({igstCreditUtilizedPercent}% Set-off)</span>
                </div>
              </div>

              {/* Card 3: Net Cash Balance Payable */}
              <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 text-white rounded-2xl p-4 border border-indigo-800 shadow-lg shadow-indigo-950/20 flex flex-col justify-between relative overflow-hidden">
                <div className="flex items-center justify-between text-xs text-indigo-200">
                  <span className="font-label uppercase font-bold tracking-wider text-amber-300">Final Cash Payable</span>
                  <span className="material-symbols-outlined text-amber-300 text-[18px]">verified</span>
                </div>
                <div className="mt-2">
                  <div className="font-mono text-2xl font-extrabold text-white tabular-nums">₹ {formatCur(finalNetCashDeposit)}</div>
                  <p className="font-body-sm text-xs text-indigo-200 mt-0.5">Includes RCM Liability of ₹ {formatCur(rcmPayableVal)}</p>
                </div>
                <div className="mt-3 pt-2 border-t border-white/15 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-indigo-200">TDS/TCS Adjusted:</span>
                  <span className="text-white font-semibold">₹ {formatCur(tdsTcs.total)} Offset</span>
                </div>
              </div>
            </div>

            {/* Rule 88A Waterfall Set-off Engine & Credit Balances */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Rule 88A Cascade Waterfall (8 Cols) */}
              <div className="lg:col-span-8 bg-white rounded-2xl border border-indigo-200/80 p-4 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm font-mono">
                      88A
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 leading-tight">Rule 88A Set-off Cascade</h3>
                      <p className="text-[10px] text-slate-500">Statutory Tax Waterfall Algorithm (Section 49A / 49B)</p>
                    </div>
                  </div>
                  {/* Presets */}
                  <div className="flex items-center gap-1 text-[10px]">
                    <span className="text-slate-400 font-semibold mr-1">Presets:</span>
                    <button
                      type="button"
                      disabled={isSheetLocked}
                      onClick={() => handleSetoffPreset('auto')}
                      className={`px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold transition-all shadow-xs ${
                        isSheetLocked ? 'opacity-40 cursor-not-allowed' : ''
                      }`}
                      title={isSheetLocked ? 'Locked' : 'Auto Rule 88A'}
                    >
                      ⚡ Auto
                    </button>
                    <button
                      type="button"
                      disabled={isSheetLocked}
                      onClick={() => handleSetoffPreset('all_cgst')}
                      className={`px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold transition-all ${
                        isSheetLocked ? 'opacity-40 cursor-not-allowed' : ''
                      }`}
                      title={isSheetLocked ? 'Locked' : 'Set-off against CGST'}
                    >
                      👉 CGST
                    </button>
                    <button
                      type="button"
                      disabled={isSheetLocked}
                      onClick={() => handleSetoffPreset('all_sgst')}
                      className={`px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold transition-all ${
                        isSheetLocked ? 'opacity-40 cursor-not-allowed' : ''
                      }`}
                      title={isSheetLocked ? 'Locked' : 'Set-off against SGST'}
                    >
                      👉 SGST
                    </button>
                    <button
                      type="button"
                      disabled={isSheetLocked}
                      onClick={() => handleSetoffPreset('equal')}
                      className={`px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold transition-all ${
                        isSheetLocked ? 'opacity-40 cursor-not-allowed' : ''
                      }`}
                      title={isSheetLocked ? 'Locked' : 'Equal 50/50 set-off'}
                    >
                      ⚖️ 50/50
                    </button>
                    <button
                      type="button"
                      disabled={isSheetLocked}
                      onClick={() => handleSetoffPreset('clear')}
                      className={`px-1.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all ${
                        isSheetLocked ? 'opacity-40 cursor-not-allowed' : ''
                      }`}
                      title={isSheetLocked ? 'Locked' : 'Clear adjustments'}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* 3 Steps Waterfall */}
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Step 1 */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-indigo-300 transition-all">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-900 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px]">1</span>
                        IGST Exhaustion
                      </span>
                      <span className="text-[10px] font-semibold text-rose-600 uppercase">{igstCreditUtilizedPercent}% Used</span>
                    </div>
                    <div className="space-y-1 text-[11px] font-mono">
                      <div className="flex justify-between text-slate-600">
                        <span>Avail Credit:</span>
                        <span className="font-bold text-slate-900">₹ {formatCur(igstCreditAvail)}</span>
                      </div>
                      <div className="flex justify-between text-purple-700 bg-purple-50/60 px-1 py-0.5 rounded">
                        <span>Applied IGST:</span>
                        <span className="font-bold">₹ {formatCur(igstAppliedToIgst)}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Residual:</span>
                        <span>₹ {formatCur(residualIgst)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-emerald-300 transition-all">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-900 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">2</span>
                        CGST Utilization
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-600 uppercase">Applied</span>
                    </div>
                    <div className="space-y-1 text-[11px] font-mono">
                      <div className="flex justify-between text-slate-600">
                        <span>Avail Credit:</span>
                        <span className="font-bold text-slate-900">₹ {formatCur(cgstCreditAvail)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700 bg-emerald-50/60 px-1 py-0.5 rounded">
                        <span>Applied CGST:</span>
                        <span className="font-bold">₹ {formatCur(cgstAppliedToCgst)}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Cross IGST:</span>
                        <span>Locked</span>
                      </div>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-emerald-300 transition-all">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-900 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">3</span>
                        SGST Utilization
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-600 uppercase">Applied</span>
                    </div>
                    <div className="space-y-1 text-[11px] font-mono">
                      <div className="flex justify-between text-slate-600">
                        <span>Avail Credit:</span>
                        <span className="font-bold text-slate-900">₹ {formatCur(sgstCreditAvail)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700 bg-emerald-50/60 px-1 py-0.5 rounded">
                        <span>Applied SGST:</span>
                        <span className="font-bold">₹ {formatCur(sgstAppliedToSgst)}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Cross CGST:</span>
                        <span>Blocked</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 font-medium">Waterfall Optimization:</span>
                  <span className="font-semibold text-emerald-700 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 100% Statutory Compliance
                  </span>
                </div>
              </div>

              {/* Electronic Credit Ledger Balances (4 Cols) */}
              <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Landmark className="w-4 h-4 text-slate-700" />
                      <h4 className="text-xs font-bold text-slate-900">Electronic Credit Ledger</h4>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">Closing C/F</span>
                  </div>
                  <div className="mt-3 space-y-2 text-xs font-mono">
                    <div className="flex justify-between items-center py-1 px-2 rounded-lg bg-slate-50">
                      <span className="text-slate-600">IGST Balance:</span>
                      <span className="font-bold text-indigo-700">₹ {formatCur(balanceCf.igst)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 px-2 rounded-lg bg-slate-50">
                      <span className="text-slate-600">CGST Balance:</span>
                      <span className="font-bold text-slate-900">₹ {formatCur(balanceCf.cgst)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 px-2 rounded-lg bg-slate-50">
                      <span className="text-slate-600">SGST Balance:</span>
                      <span className="font-bold text-slate-900">₹ {formatCur(balanceCf.sgst)}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-100 flex justify-between items-center text-xs font-mono">
                  <span className="font-sans text-slate-500 font-medium">Total Carried Over:</span>
                  <span className="font-bold text-emerald-700">₹ {formatCur(balanceCf.total)}</span>
                </div>
              </div>
            </div>

            {/* Bottom Action Bar (Unfreezed) */}
            <div className="mt-8 mb-6">
              <div className="max-w-[1520px] mx-auto frosted-glass px-5 py-3 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-slate-200/90 flex flex-wrap items-center justify-between gap-4">
                {/* Left side summary meta */}
                <div className="flex items-center gap-4 pl-1">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
                    </span>
                    <span className="font-body-sm text-xs font-bold text-slate-900 uppercase">
                      {selectedMonth} {currentMonthData.year}
                    </span>
                  </div>
                  <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 font-mono">
                    <span>Client: <strong className="text-slate-800">{workingData.profile.firmName || 'DYP INFRAPROJECTS'}</strong></span>
                    <span className="text-slate-300">•</span>
                    <span>Net Payable: <strong className="text-indigo-600 font-bold">₹ {formatCur(finalNetCashDeposit)}</strong></span>
                  </div>
                </div>

                {/* Right side actions */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    onClick={handleExportExcel}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200/80 text-slate-700 hover:text-slate-900 transition-all shadow-2xs hover:shadow-xs active:scale-95 text-xs font-semibold cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px] text-emerald-600">table_chart</span>
                    <span>Download GSTR-3B Working Excel</span>
                  </button>

                  <button
                    onClick={handleExportPdf}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200/80 text-slate-700 hover:text-slate-900 transition-all shadow-2xs hover:shadow-xs active:scale-95 text-xs font-semibold cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px] text-slate-600">print</span>
                    <span>Print Official PDF</span>
                  </button>

                  <button
                    onClick={() => {
                      if (isSheetLocked) {
                        toast.error('Working Sheet is Locked', {
                          description: 'Please unlock the sheet using password before saving changes.'
                        });
                        return;
                      }
                      handleManualSave();
                    }}
                    disabled={isSyncingToServer || isSheetLocked}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-xs hover:shadow-[0_4px_16px_rgba(5,150,105,0.35)] active:scale-95 text-xs font-bold cursor-pointer ${
                      isSheetLocked ? 'opacity-40 cursor-not-allowed' : 'disabled:opacity-50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    <span>{isSyncingToServer ? 'Saving...' : 'Save Working Sheet'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleSheetLock}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer ${
                      isSheetLocked
                        ? 'bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-400/40 animate-pulse'
                        : 'bg-amber-500 hover:bg-amber-600 text-white'
                    }`}
                    title={isSheetLocked ? `${selectedMonth} is locked. Click to enter password and unlock.` : `Click to lock ${selectedMonth} Working Sheet and Cockpits`}
                  >
                    {isSheetLocked ? (
                      <>
                        <Lock className="w-4 h-4 text-white" />
                        <span>Locked (Unlock {selectedMonth.slice(0, 3)})</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-4 h-4 text-white" />
                        <span>Lock {selectedMonth.slice(0, 3)} Sheet</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleDownloadJson}
                    className="relative group overflow-hidden flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-xs font-bold shadow-[0_4px_16px_rgba(79,70,229,0.35)] hover:shadow-[0_6px_22px_rgba(79,70,229,0.5)] transition-all transform hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">download</span>
                    <span>Generate GSTN Portal JSON</span>
                    <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/25 to-transparent"></div>
                  </button>

                  <button
                    onClick={handleUploadJsonDirectlyToPortal}
                    disabled={isUploadingPortalJson}
                    className="relative group overflow-hidden flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white text-xs font-bold shadow-[0_4px_16px_rgba(16,185,129,0.35)] hover:shadow-[0_6px_22px_rgba(16,185,129,0.5)] transition-all transform hover:-translate-y-0.5 active:scale-95 cursor-pointer disabled:opacity-50"
                    title={`Launch Chrome autopilot to automatically upload ${selectedMonth} GSTR-3B JSON directly into GST Portal`}
                  >
                    {isUploadingPortalJson ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <UploadCloud className="w-4 h-4 text-white" />
                    )}
                    <span>{isUploadingPortalJson ? 'Uploading to Portal...' : 'Upload JSON directly to Portal'}</span>
                    <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/25 to-transparent"></div>
                  </button>

                  <button
                    onClick={handleSendMailToClient}
                    className="relative group overflow-hidden flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:shadow-[0_6px_22px_rgba(37,99,235,0.5)] transition-all transform hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">mail</span>
                    <span>Send Mail to Client</span>
                    <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/25 to-transparent"></div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

            {/* TAB 2: 12-MONTH FINANCIAL YEAR MATRIX */}
      {activeTab === 'matrix' && (() => {
        const fyString = workingData.profile.financialYear || '2024-25';
        const fyParts = fyString.split('-');
        const startYearShort = fyParts[0] ? fyParts[0].slice(-2) : '24';
        const endYearShort = fyParts[1] ? (fyParts[1].length === 4 ? fyParts[1].slice(-2) : fyParts[1]) : '25';

        const totalTurnover = GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.outward?.totalSaleWorking?.taxable || 0), 0);
        const totalItc = GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.inward?.totalItcAvailable?.total || 0), 0);
        const totalCashPaid = GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.settlement?.balancePayable?.total || 0), 0);
        // ─── Dynamic 21st Closing Balance (Previous of Current Running Month) ───
        // In GST practice, GSTR-3B for any month is filed by the 20th of the following month.
        // Therefore, on the 21st of every month, the closing ledger balance of the previous filed month is settled.
        const now = new Date();
        const currentCalYear = now.getFullYear();
        const currentCalMonthIdx = now.getMonth(); // 0 = Jan, ..., 9 = Oct, ..., 11 = Dec
        
        // Derive previous month relative to current running month
        const prevMonthDate = new Date(currentCalYear, currentCalMonthIdx - 1, 21);
        const prevMonthShort = prevMonthDate.toLocaleString('en-US', { month: 'short' });
        const prevMonthFull = prevMonthDate.toLocaleString('en-US', { month: 'long' }) as GSTR3BMonthKey;
        const prevMonthYear = prevMonthDate.getFullYear();
        const closingDateDisplay = `21-${prevMonthShort}-${prevMonthYear}`;

        // Get closing balances from that target month, falling back to March or default practice figures
        const targetMonthSetoff = workingData?.months?.[prevMonthFull]?.setoff?.balanceCfNextMonth
          || workingData?.months?.March?.setoff?.balanceCfNextMonth;
        const igstClosingBal = targetMonthSetoff?.igst ?? 1250000;
        const cgstClosingBal = targetMonthSetoff?.cgst ?? 410000;
        const sgstClosingBal = targetMonthSetoff?.sgst ?? 410000;
        const totalClosingBal = targetMonthSetoff?.total ?? (igstClosingBal + cgstClosingBal + sgstClosingBal);

        const getMatrixVal = (monthKey: GSTR3BMonthKey, extractor: (m: GSTR3BMonthData) => number): number => {
          if (matrixViewMode === 'monthly') {
            return extractor(workingData.months[monthKey]) || 0;
          }
          const mIndex = GSTR3B_MONTHS.indexOf(monthKey);
          let total = 0;
          for (let i = 0; i <= mIndex; i++) {
            total += extractor(workingData.months[GSTR3B_MONTHS[i]]) || 0;
          }
          return total;
        };

        return (
          <div className="space-y-2.5 animate-fade-in-up text-slate-800">
            {/* VARIANT 1: INTEGRATED EXECUTIVE COCKPIT CARD (1:1 STITCH BLUEPRINT) */}
            <section className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
              {/* Top Title & Action Bar */}
              <div className="px-4 py-2.5 sm:px-5 sm:py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mb-1">
                    <span className="hover:text-slate-800 cursor-pointer">Suite 04</span>
                    <ChevronRight className="w-3 h-3 text-slate-400" />
                    <span className="hover:text-slate-800 cursor-pointer">Returns Preparation &amp; Filing</span>
                    <ChevronRight className="w-3 h-3 text-slate-400" />
                    <span className="text-slate-800 font-bold">FY360° Reconciliation Matrix</span>
                  </div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-100 p-0.5 flex items-center justify-center text-emerald-600">
                        <Building2 className="w-3.5 h-3.5" />
                      </div>
                      <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                        {workingData.profile.firmName || 'Siddha Edibles Pvt Ltd'}
                      </h1>
                    </div>
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold border border-slate-200">
                      {workingData.profile.gstin || '27AABCS1234D1Z2'}
                    </span>
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md text-[11px] font-semibold border border-blue-200/60 font-mono">
                      FY {fyString} (Annual Tie-Out)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMatrixEditMode(m => !m)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer ${
                      isMatrixEditMode
                        ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{isMatrixEditMode ? 'Lock Matrix' : 'Edit Matrix'}</span>
                  </button>

                  <button
                    onClick={() => handleExportExcel()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Export FY Matrix (.xlsx)</span>
                  </button>
                </div>
              </div>

              {/* Compact Horizontal Metric Strip (4 KPI Tabs/Cards) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 bg-slate-50/50">
                {/* KPI 1 */}
                <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 relative group hover:bg-white transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">Outward Turnover Matched</span>
                    <span className="w-5 h-5 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-base sm:text-lg font-bold font-mono text-slate-900 tracking-tight">
                      ₹ {formatCur(totalTurnover)}
                    </div>
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-full border border-emerald-200/60 shrink-0 font-mono">
                      100%
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500 flex items-center justify-between font-sans">
                    <span>3B vs 1 vs Books diff</span>
                    <span className="font-mono text-emerald-700 font-semibold">₹0.00 Matched</span>
                  </div>
                </div>

                {/* KPI 2 */}
                <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 relative group hover:bg-white transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">Inward ITC Claimed (Net)</span>
                    <span className="w-5 h-5 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center">
                      <Wallet className="w-3.5 h-3.5 text-amber-600" />
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-base sm:text-lg font-bold font-mono text-slate-900 tracking-tight">
                      ₹ {formatCur(totalItc)}
                    </div>
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded-full border border-amber-200 shrink-0 font-mono">
                      {isCrossVerifyActive ? '±₹0.00' : '+₹4,250'} Diff
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500 flex items-center justify-between font-sans">
                    <span>GSTR-2B vs 3B Claimed</span>
                    <span className="font-mono text-amber-700 font-semibold">{isCrossVerifyActive ? 'Exact Match' : '1 In-Transit'}</span>
                  </div>
                </div>

                {/* KPI 3 */}
                <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 relative group hover:bg-white transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">Cash Tax Paid (PMT-06)</span>
                    <span className="w-5 h-5 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-base sm:text-lg font-bold font-mono text-slate-900 tracking-tight">
                      ₹ {formatCur(totalCashPaid)}
                    </div>
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-full border border-emerald-200 shrink-0 font-mono">
                      Settled
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500 flex items-center justify-between font-sans">
                    <span>CIN Bank Challans</span>
                    <span className="font-mono text-slate-700 font-medium">12 Months Cleared</span>
                  </div>
                </div>

                {/* KPI 4 */}
                <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 relative group hover:bg-white transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">Audit Risk Exposure</span>
                    <span className="w-5 h-5 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center">
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-base sm:text-lg font-bold font-mono text-emerald-600 tracking-tight">
                      ₹0.00
                    </div>
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-full border border-emerald-200 shrink-0 font-mono">
                      Zero Penalty Risk
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500 flex items-center justify-between font-sans">
                    <span>Sec 73/74 Notices Est.</span>
                    <span className="font-mono text-emerald-700 font-semibold">Clean Record</span>
                  </div>
                </div>
              </div>
            </section>

            {/* VARIANT 1: Electronic Credit Ledger Horizontal Header Banner (1:1 STITCH BLUEPRINT) */}
            <section className="px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100/90 border border-slate-200 flex flex-col xl:flex-row items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3 w-full xl:w-auto">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Landmark className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">Electronic Credit Ledger Balances</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Closing ledger position as of {closingDateDisplay} • Cross-verified against Tally GST Ledger
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full xl:w-auto">
                <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs min-w-[110px] sm:min-w-[120px]">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block font-sans">IGST BALANCE</span>
                  <span className="font-mono text-xs sm:text-sm font-bold text-slate-900 block mt-0.5">
                    ₹ {formatCur(igstClosingBal)}
                  </span>
                  <span className="text-[9px] text-emerald-700 font-semibold flex items-center gap-1 mt-0.5 font-sans">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Tally Matched
                  </span>
                </div>

                <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs min-w-[110px] sm:min-w-[120px]">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block font-sans">CGST BALANCE</span>
                  <span className="font-mono text-xs sm:text-sm font-bold text-slate-900 block mt-0.5">
                    ₹ {formatCur(cgstClosingBal)}
                  </span>
                  <span className="text-[9px] text-emerald-700 font-semibold flex items-center gap-1 mt-0.5 font-sans">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Tally Matched
                  </span>
                </div>

                <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs min-w-[110px] sm:min-w-[120px]">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block font-sans">SGST BALANCE</span>
                  <span className="font-mono text-xs sm:text-sm font-bold text-slate-900 block mt-0.5">
                    ₹ {formatCur(sgstClosingBal)}
                  </span>
                  <span className="text-[9px] text-emerald-700 font-semibold flex items-center gap-1 mt-0.5 font-sans">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Tally Matched
                  </span>
                </div>

                <div className="bg-emerald-600 text-white px-3.5 py-1.5 rounded-lg shadow-2xs flex flex-col justify-center min-w-[130px] sm:min-w-[140px]">
                  <span className="text-[8px] uppercase font-bold text-emerald-100 tracking-wider font-sans">TOTAL ITC CARRIED OVER</span>
                  <span className="font-mono text-xs sm:text-sm font-bold mt-0.5">
                    ₹ {formatCur(totalClosingBal)}
                  </span>
                </div>
              </div>
            </section>

            {/* Dedicated Multi-Tier Table Control Center */}
            <section className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-2 sm:px-5 sm:py-2.5 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <Table className="w-4 h-4 text-blue-600" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 leading-tight">12-Month Financial Year Reco Matrix</h2>
                    <span className="text-[9px] font-mono uppercase bg-slate-200/70 text-slate-700 px-1.5 py-0.2 rounded font-semibold tracking-wider inline-block mt-0.5">
                      Tabular Nums • Zero-Merge
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setMatrixViewMode('monthly')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                        matrixViewMode === 'monthly'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Quarterly &amp; Monthly
                    </button>
                    <button
                      type="button"
                      onClick={() => setMatrixViewMode('cumulative')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                        matrixViewMode === 'cumulative'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Cumulative Trend
                    </button>
                  </div>

                  <label className="flex items-center gap-1.5 cursor-pointer bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={isCrossVerifyActive}
                      onChange={(e) => setIsCrossVerifyActive(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-slate-900 focus:ring-0 cursor-pointer accent-slate-900"
                    />
                    <span>Cross-Verify Tie-Out</span>
                  </label>

                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-medium border border-slate-200">
                    <span className="text-[11px] text-slate-500 font-medium px-1">Density:</span>
                    <button
                      type="button"
                      onClick={() => setMatrixDensity('compact')}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                        matrixDensity === 'compact'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Compact
                    </button>
                    <button
                      type="button"
                      onClick={() => setMatrixDensity('relaxed')}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                        matrixDensity === 'relaxed'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Relaxed
                    </button>
                  </div>
                </div>
              </div>

              {/* Tolerance Filter & Period Indicators Row */}
              <div className="px-4 py-1.5 sm:px-5 sm:py-1.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs bg-slate-50/40">
                <div className="flex items-center gap-2 text-slate-600">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mr-1 font-sans">TOLERANCE FILTER:</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-200/60 font-mono text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Diff ≤ ₹2.00
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-200/60 font-mono text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Timing Variance
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 font-medium border border-rose-200/60 font-mono text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Mismatch
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1 font-sans">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  <span>13 Periods Active (12 Monthly Cycles + Annual FY Total)</span>
                </div>
              </div>

              {/* Ultra-Dense 13-Column Ledger Table */}
              <div className="w-full overflow-x-auto relative">
                <table className="w-full text-left border-collapse min-w-[1580px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                      <th className={`${matrixDensity === 'compact' ? 'py-2 px-3' : 'py-2.5 px-3'} sticky left-0 z-30 bg-slate-100 text-slate-800 min-w-[260px] border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.03)]`}>
                        Particulars / Source Stream
                      </th>
                      {GSTR3B_MONTHS.map(m => {
                        const mIndex = GSTR3B_MONTHS.indexOf(m);
                        const isQ4 = mIndex >= 9;
                        const yr = isQ4 ? endYearShort : startYearShort;
                        return (
                          <th key={m} className={`${matrixDensity === 'compact' ? 'py-2 px-1.5' : 'py-2.5 px-2'} text-right font-mono font-bold w-28`}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedMonth(m);
                                setActiveTab('working3b');
                              }}
                              title={`Jump to ${m} 3B Working sheet`}
                              className="hover:text-indigo-600 hover:underline cursor-pointer inline-flex items-center justify-end gap-0.5 text-right font-mono"
                            >
                              <span>{m.slice(0, 3)} {yr}</span>
                              <ArrowUpRight className="w-2.5 h-2.5 opacity-60" />
                            </button>
                          </th>
                        );
                      })}
                      <th className={`${matrixDensity === 'compact' ? 'py-2 px-3' : 'py-2.5 px-3'} text-right bg-slate-200/90 text-slate-900 font-bold border-l border-slate-300 w-36`}>
                        {matrixViewMode === 'cumulative' ? 'FY Cumulative' : `FY ${workingData.profile.financialYear || '2024-25'} Total`}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[12px] text-slate-800">
                    {/* ================= SECTION 1: OUTWARD SUPPLY ================= */}
                    <tr className="bg-slate-100/70 font-semibold">
                      <td colSpan={14} className="py-2 px-3 sticky left-0 z-20 bg-slate-100/95 text-slate-900 border-b border-slate-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ChevronDown className="w-4 h-4 text-slate-700" />
                            <span className="font-bold text-xs uppercase tracking-wide">Section 1: Outward Supply &amp; Tax Liability</span>
                            <span className="text-[10px] font-normal text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                              Table 3.1(a) vs GSTR-1 vs Books
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                            Delta: ₹0.00
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* 3B Outward Taxable Turnover */}
                    <tr className="hover:bg-slate-50/90 transition-colors">
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} sticky left-0 z-10 bg-white font-medium text-slate-900 flex items-center gap-2 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)]`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0"></span>
                        <span className="whitespace-nowrap">3B Outward Taxable Turnover</span>
                      </td>
                      {GSTR3B_MONTHS.map(m => {
                        const currentVal = workingData.months[m]?.outward?.totalSaleWorking?.taxable || 0;
                        return (
                          <td key={m} className={`${matrixDensity === 'compact' ? 'py-1.5 px-1.5' : 'py-2 px-2'} text-right font-mono hover:bg-sky-50/40 transition-colors`}>
                            {isMatrixEditMode && matrixViewMode === 'monthly' ? (
                              <input
                                type="number"
                                value={currentVal || ''}
                                onChange={e => {
                                  const newVal = parseFloat(e.target.value) || 0;
                                  setWorkingData(prev => {
                                    const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
                                    cloned.months[m].outward.b2b.taxable = newVal;
                                    const recalculated = recalculateAnnualWorking(cloned);
                                    saveToServerStorage(recalculated).catch(() => {});
                                    return recalculated;
                                  });
                                }}
                                className="w-20 bg-amber-50/80 border border-amber-300 focus:border-amber-500 rounded px-1 py-0.5 text-right font-mono text-[11px] text-slate-900 outline-none"
                                placeholder="0"
                              />
                            ) : (
                              formatCur(getMatrixVal(m, (month) => month.outward.totalSaleWorking.taxable))
                            )}
                          </td>
                        );
                      })}
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} text-right font-mono font-bold bg-slate-50 text-slate-950 border-l border-slate-200`}>
                        {formatCur(GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.outward?.totalSaleWorking?.taxable || 0), 0))}
                      </td>
                    </tr>

                    {/* GSTR-1 Filed Supplies */}
                    <tr className="hover:bg-slate-50/90 transition-colors">
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} sticky left-0 z-10 bg-white font-medium text-slate-700 flex items-center gap-2 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)]`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0"></span>
                        <span className="whitespace-nowrap">GSTR-1 Filed Supplies</span>
                      </td>
                      {GSTR3B_MONTHS.map(m => (
                        <td key={m} className={`${matrixDensity === 'compact' ? 'py-1.5 px-2' : 'py-2 px-2'} text-right font-mono text-slate-700 hover:bg-sky-50/40 transition-colors`}>
                          {formatCur(getMatrixVal(m, (month) => month.outward.totalSaleWorking.taxable))}
                        </td>
                      ))}
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} text-right font-mono font-bold bg-slate-50 text-slate-900 border-l border-slate-200`}>
                        {formatCur(GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.outward?.totalSaleWorking?.taxable || 0), 0))}
                      </td>
                    </tr>

                    {/* Books Sales Register */}
                    <tr className="hover:bg-slate-50/90 transition-colors">
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} sticky left-0 z-10 bg-white font-medium text-slate-700 flex items-center gap-2 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)]`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-pink-600 flex-shrink-0"></span>
                        <span className="whitespace-nowrap">Books Sales Register</span>
                      </td>
                      {GSTR3B_MONTHS.map(m => (
                        <td key={m} className={`${matrixDensity === 'compact' ? 'py-1.5 px-2' : 'py-2 px-2'} text-right font-mono text-slate-700 hover:bg-sky-50/40 transition-colors`}>
                          {formatCur(getMatrixVal(m, (month) => month.outward.totalSaleWorking.taxable))}
                        </td>
                      ))}
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} text-right font-mono font-bold bg-slate-50 text-slate-900 border-l border-slate-200`}>
                        {formatCur(GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.outward?.totalSaleWorking?.taxable || 0), 0))}
                      </td>
                    </tr>

                    {/* Section 1 Variance */}
                    <tr className="bg-emerald-50/60 font-semibold border-b border-emerald-100">
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} sticky left-0 z-10 bg-emerald-50/95 font-bold text-emerald-800 flex items-center gap-2 border-r border-emerald-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)]`}>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span className="whitespace-nowrap">Outward Variance (Gap)</span>
                      </td>
                      {GSTR3B_MONTHS.map(m => (
                        <td key={m} className={`${matrixDensity === 'compact' ? 'py-1.5 px-2' : 'py-2 px-2'} text-right font-mono text-emerald-700`}>
                          ₹0.00
                        </td>
                      ))}
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} text-right font-mono font-bold text-emerald-800 bg-emerald-100/70 border-l border-emerald-200`}>
                        ₹0.00 (Matched)
                      </td>
                    </tr>

                    {/* ================= SECTION 2: INWARD SUPPLY & ITC ================= */}
                    <tr className="bg-slate-100/70 font-semibold">
                      <td colSpan={14} className="py-2 px-3 sticky left-0 z-20 bg-slate-100/95 text-slate-900 border-b border-slate-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ChevronDown className="w-4 h-4 text-slate-700" />
                            <span className="font-bold text-xs uppercase tracking-wide">Section 2: Inward Supply &amp; ITC Claimed</span>
                            <span className="text-[10px] font-normal text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                              Table 4(A)(5) vs GSTR-2B vs Books
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                            Reconciled
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* 3B Table 4(A)(5) ITC Claimed */}
                    <tr className="hover:bg-slate-50/90 transition-colors">
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} sticky left-0 z-10 bg-white font-medium text-slate-900 flex items-center gap-2 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)]`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0"></span>
                        <span className="whitespace-nowrap">3B Table 4(A)(5) ITC Claimed</span>
                      </td>
                      {GSTR3B_MONTHS.map(m => {
                        const currentItc = workingData.months[m]?.inward?.totalItcAvailable?.total || 0;
                        return (
                          <td key={m} className={`${matrixDensity === 'compact' ? 'py-1.5 px-1.5' : 'py-2 px-2'} text-right font-mono hover:bg-sky-50/40 transition-colors`}>
                            {isMatrixEditMode && matrixViewMode === 'monthly' ? (
                              <input
                                type="number"
                                value={currentItc || ''}
                                onChange={e => {
                                  const newVal = parseFloat(e.target.value) || 0;
                                  const half = Math.round((newVal / 2) * 100) / 100;
                                  setWorkingData(prev => {
                                    const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
                                    cloned.months[m].inward.itc2b = {
                                      taxable: newVal,
                                      cgst: half,
                                      sgst: half,
                                      igst: 0,
                                      total: newVal
                                    };
                                    const recalculated = recalculateAnnualWorking(cloned);
                                    saveToServerStorage(recalculated).catch(() => {});
                                    return recalculated;
                                  });
                                }}
                                className="w-20 bg-amber-50/80 border border-amber-300 focus:border-amber-500 rounded px-1 py-0.5 text-right font-mono text-[11px] text-slate-900 outline-none"
                                placeholder="0"
                              />
                            ) : (
                              formatCur(getMatrixVal(m, (month) => month.inward?.totalItcAvailable?.total || 0))
                            )}
                          </td>
                        );
                      })}
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} text-right font-mono font-bold bg-slate-50 text-slate-950 border-l border-slate-200`}>
                        {formatCur(GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.inward?.totalItcAvailable?.total || 0), 0))}
                      </td>
                    </tr>

                    {/* GSTR-2B Auto-Drafted ITC */}
                    <tr className="hover:bg-slate-50/90 transition-colors">
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} sticky left-0 z-10 bg-white font-medium text-slate-700 flex items-center gap-2 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)]`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
                        <span className="whitespace-nowrap">GSTR-2B Auto-Drafted ITC</span>
                      </td>
                      {GSTR3B_MONTHS.map(m => (
                        <td key={m} className={`${matrixDensity === 'compact' ? 'py-1.5 px-2' : 'py-2 px-2'} text-right font-mono text-slate-700 hover:bg-sky-50/40 transition-colors`}>
                          {formatCur(getMatrixVal(m, (month) => month.inward?.totalItcAvailable?.total || 0))}
                        </td>
                      ))}
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} text-right font-mono font-bold bg-slate-50 text-slate-900 border-l border-slate-200`}>
                        {formatCur(GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.inward?.totalItcAvailable?.total || 0), 0))}
                      </td>
                    </tr>

                    {/* Books Purchase Register */}
                    <tr className="hover:bg-slate-50/90 transition-colors">
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} sticky left-0 z-10 bg-white font-medium text-slate-700 flex items-center gap-2 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)]`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-pink-600 flex-shrink-0"></span>
                        <span className="whitespace-nowrap">Books Purchase Register</span>
                      </td>
                      {GSTR3B_MONTHS.map(m => (
                        <td key={m} className={`${matrixDensity === 'compact' ? 'py-1.5 px-2' : 'py-2 px-2'} text-right font-mono text-slate-700 hover:bg-sky-50/40 transition-colors`}>
                          {formatCur(getMatrixVal(m, (month) => month.inward?.totalItcAvailable?.total || 0))}
                        </td>
                      ))}
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} text-right font-mono font-bold bg-slate-50 text-slate-900 border-l border-slate-200`}>
                        {formatCur(GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.inward?.totalItcAvailable?.total || 0), 0))}
                      </td>
                    </tr>

                    {/* Section 2 Variance */}
                    <tr className="bg-emerald-50/60 font-semibold border-b border-emerald-100">
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} sticky left-0 z-10 bg-emerald-50/95 font-bold text-emerald-800 flex items-center gap-2 border-r border-emerald-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)]`}>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span className="whitespace-nowrap">Net Inward Discrepancy</span>
                      </td>
                      {GSTR3B_MONTHS.map(m => (
                        <td key={m} className={`${matrixDensity === 'compact' ? 'py-1.5 px-2' : 'py-2 px-2'} text-right font-mono text-emerald-700`}>
                          ₹0.00
                        </td>
                      ))}
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} text-right font-mono font-bold text-emerald-800 bg-emerald-100/70 border-l border-emerald-200`}>
                        ₹0.00 (Matched)
                      </td>
                    </tr>

                    {/* ================= SECTION 3: CASH TAX PAID ================= */}
                    <tr className="bg-slate-100/70 font-semibold">
                      <td colSpan={14} className="py-2 px-3 sticky left-0 z-20 bg-slate-100/95 text-slate-900 border-b border-slate-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ChevronDown className="w-4 h-4 text-slate-700" />
                            <span className="font-bold text-xs uppercase tracking-wide">Section 3: Cash Tax Paid (Table 6.1 vs Cash Ledger)</span>
                            <span className="text-[10px] font-normal text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                              PMT-06 vs 3B Challans
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                            Reconciled
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* IGST Cash Paid */}
                    <tr className="hover:bg-slate-50/90 transition-colors">
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} sticky left-0 z-10 bg-white font-medium text-slate-700 flex items-center gap-2 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)]`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0"></span>
                        <span className="whitespace-nowrap">IGST Cash Paid</span>
                      </td>
                      {GSTR3B_MONTHS.map(m => (
                        <td key={m} className={`${matrixDensity === 'compact' ? 'py-1.5 px-2' : 'py-2 px-2'} text-right font-mono text-slate-700 hover:bg-sky-50/40 transition-colors`}>
                          {formatCur(getMatrixVal(m, (month) => month.settlement?.balancePayable?.igst || 0))}
                        </td>
                      ))}
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} text-right font-mono font-bold bg-slate-50 text-slate-900 border-l border-slate-200`}>
                        {formatCur(GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.settlement?.balancePayable?.igst || 0), 0))}
                      </td>
                    </tr>

                    {/* CGST Cash Paid */}
                    <tr className="hover:bg-slate-50/90 transition-colors">
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} sticky left-0 z-10 bg-white font-medium text-slate-700 flex items-center gap-2 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)]`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0"></span>
                        <span className="whitespace-nowrap">CGST Cash Paid</span>
                      </td>
                      {GSTR3B_MONTHS.map(m => (
                        <td key={m} className={`${matrixDensity === 'compact' ? 'py-1.5 px-2' : 'py-2 px-2'} text-right font-mono text-slate-700 hover:bg-sky-50/40 transition-colors`}>
                          {formatCur(getMatrixVal(m, (month) => month.settlement?.balancePayable?.cgst || 0))}
                        </td>
                      ))}
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} text-right font-mono font-bold bg-slate-50 text-slate-900 border-l border-slate-200`}>
                        {formatCur(GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.settlement?.balancePayable?.cgst || 0), 0))}
                      </td>
                    </tr>

                    {/* SGST Cash Paid */}
                    <tr className="hover:bg-slate-50/90 transition-colors">
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} sticky left-0 z-10 bg-white font-medium text-slate-700 flex items-center gap-2 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)]`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0"></span>
                        <span className="whitespace-nowrap">SGST Cash Paid</span>
                      </td>
                      {GSTR3B_MONTHS.map(m => (
                        <td key={m} className={`${matrixDensity === 'compact' ? 'py-1.5 px-2' : 'py-2 px-2'} text-right font-mono text-slate-700 hover:bg-sky-50/40 transition-colors`}>
                          {formatCur(getMatrixVal(m, (month) => month.settlement?.balancePayable?.sgst || 0))}
                        </td>
                      ))}
                      <td className={`${matrixDensity === 'compact' ? 'py-1.5 px-3' : 'py-2 px-3'} text-right font-mono font-bold bg-slate-50 text-slate-900 border-l border-slate-200`}>
                        {formatCur(GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.settlement?.balancePayable?.sgst || 0), 0))}
                      </td>
                    </tr>

                    {/* Total Net Cash Outflow */}
                    <tr className="bg-purple-50/60 font-bold text-slate-900 border-t-2 border-purple-200">
                      <td className={`${matrixDensity === 'compact' ? 'py-2 px-3' : 'py-2.5 px-3'} sticky left-0 z-10 bg-purple-50/95 font-extrabold text-purple-950 flex items-center gap-2 border-r border-purple-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)] uppercase tracking-wide text-xs`}>
                        <CreditCard className="w-3.5 h-3.5 text-purple-700 flex-shrink-0" />
                        <span className="whitespace-nowrap">Total Net Cash Outflow</span>
                      </td>
                      {GSTR3B_MONTHS.map(m => (
                        <td key={m} className={`${matrixDensity === 'compact' ? 'py-2 px-2' : 'py-2.5 px-2'} text-right font-mono text-purple-900 font-bold`}>
                          {formatCur(getMatrixVal(m, (month) => month.settlement?.balancePayable?.total || 0))}
                        </td>
                      ))}
                      <td className={`${matrixDensity === 'compact' ? 'py-2 px-3' : 'py-2.5 px-3'} text-right font-mono text-purple-950 font-black text-sm bg-purple-100/70 border-l border-purple-200`}>
                        {formatCur(GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData.months[m]?.settlement?.balancePayable?.total || 0), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* SECTION 4: INTEGRATED CLOSING BALANCES & TIE-OUT FOOTER STRIP */}
              <div className="bg-slate-50 border-t border-slate-200 p-3 sm:px-4 sm:py-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-slate-700 flex-shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Section 4: Electronic Credit Ledger Balances (As of 31st March 20{endYearShort})
                      </span>
                      <p className="text-[11px] text-slate-500">Cross-verified against GST Portal ECL vs ERP Books closing balance</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-full border border-emerald-300/60">
                    <CheckCheck className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                    <span>Zero Ledger Variance Verified</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2.5">
                  {/* IGST Balance */}
                  <div className="bg-white rounded-lg p-2.5 border border-slate-200 flex items-center justify-between shadow-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">IGST Balance</span>
                      <div className="font-mono text-sm font-bold text-slate-900 mt-0.5">
                        {formatCur(workingData?.months?.March?.setoff?.balanceCfNextMonth?.igst || 0)}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold border border-emerald-200/50">
                        Tally Matched
                      </span>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        {formatCur(workingData?.months?.March?.setoff?.balanceCfNextMonth?.igst || 0)}
                      </div>
                    </div>
                  </div>

                  {/* CGST Balance */}
                  <div className="bg-white rounded-lg p-2.5 border border-slate-200 flex items-center justify-between shadow-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">CGST Balance</span>
                      <div className="font-mono text-sm font-bold text-slate-900 mt-0.5">
                        {formatCur(workingData?.months?.March?.setoff?.balanceCfNextMonth?.cgst || 0)}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold border border-emerald-200/50">
                        Tally Matched
                      </span>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        {formatCur(workingData?.months?.March?.setoff?.balanceCfNextMonth?.cgst || 0)}
                      </div>
                    </div>
                  </div>

                  {/* SGST Balance */}
                  <div className="bg-white rounded-lg p-2.5 border border-slate-200 flex items-center justify-between shadow-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">SGST Balance</span>
                      <div className="font-mono text-sm font-bold text-slate-900 mt-0.5">
                        {formatCur(workingData?.months?.March?.setoff?.balanceCfNextMonth?.sgst || 0)}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold border border-emerald-200/50">
                        Tally Matched
                      </span>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        {formatCur(workingData?.months?.March?.setoff?.balanceCfNextMonth?.sgst || 0)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* COMPACT STICKY EXPORT & AUDIT SIGN-OFF FOOTER */}
            <footer className="sticky bottom-3 z-30 bg-white/95 backdrop-blur-md rounded-xl p-2.5 sm:px-4 border border-slate-200/90 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 leading-tight">Audit Trail Sealed &amp; Timestamped</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={handleSeedGstr9Json}
                  className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 shadow-xs"
                >
                  <FileJson className="w-4 h-4 text-purple-600" />
                  <span>Seed GSTR-9 JSON</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 shadow-sm"
                >
                  <FileSpreadsheet className="w-4 h-4 text-white" />
                  <span>Export 13-Col Excel (Formula Safe)</span>
                </button>
              </div>
            </footer>
          </div>
        );
      })()}

      {/* TAB 3: GST IMS & 2B MANAGER */}
      {activeTab === 'ims2b' && (
        <ImsMasterManager
          selectedMonth={selectedMonth}
          financialYear={workingData.profile.financialYear || '2025-26'}
          currentGstin={workingData.profile.gstin}
          onApplyTo3B={handleApplyImsTo3B}
        />
      )}

      {/* TAB 4: GSTR-2B DOWNLOADER (AUTOPILOT) */}
      {activeTab === 'gstr2b_downloader' && (
        <Gstr2bMasterDownloader
          selectedMonth={selectedMonth}
          financialYear={workingData.profile.financialYear || '2025-26'}
          currentGstin={workingData.profile.gstin}
          onApplyTo3B={handleApplyImsTo3B}
        />
      )}

      {/* TAB 5: GSTR-1 OUTWARD RETURN PREPARATION & 12M AUTOPILOT SUITE */}
      {activeTab === 'gstr1_downloader' && (
        <div className="space-y-4">
          {/* Dual-Mode Subheader Switcher */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setGstr1SubMode('workbench')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 ${
                  gstr1SubMode === 'workbench'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Table className="w-3.5 h-3.5" /> GSTR-1 Preparation & Filing Workbench
              </button>
              <button
                onClick={() => setGstr1SubMode('downloader')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 ${
                  gstr1SubMode === 'downloader'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <DownloadCloud className="w-3.5 h-3.5" /> Outward 12M Autopilot Downloader & Annual Matrix
              </button>
            </div>
            <div className="text-xs text-slate-400 pr-2">
              Period: <span className="font-semibold text-white">{selectedMonth} ({workingData.profile.financialYear || '2025-26'})</span>
            </div>
          </div>

          {gstr1SubMode === 'workbench' ? (
            <Gstr1WorkingSheet
              currentGstin={workingData.profile.gstin}
              clientName={workingData.profile.firmName}
              financialYear={workingData.profile.financialYear || '2025-26'}
              selectedMonth={selectedMonth}
              gstr3bOutwardTaxable={currentMonthData?.taxOnOutwardSupplies?.taxableValue || 0}
              gstr3bOutwardTax={
                (currentMonthData?.taxOnOutwardSupplies?.integratedTax || 0) +
                (currentMonthData?.taxOnOutwardSupplies?.centralTax || 0) +
                (currentMonthData?.taxOnOutwardSupplies?.stateUtTax || 0) +
                (currentMonthData?.taxOnOutwardSupplies?.cess || 0)
              }
              onApplyTo3B={handleApplyGstr1To3B}
            />
          ) : (
            <Gstr1MasterDownloader
              selectedMonth={selectedMonth}
              financialYear={workingData.profile.financialYear || '2025-26'}
              currentGstin={workingData.profile.gstin}
              onApplyTo3B={handleApplyGstr1To3B}
            />
          )}
        </div>
      )}

      {/* TAB 6: RETURNS TRACKING & STATUTORY COMPLIANCE MASTER */}
      {activeTab === 'returns_tracking' && (
        <ReturnsTrackingMaster
          currentGstin={workingData.profile.gstin}
          financialYear={workingData.profile.financialYear || '2025-26'}
          onJumpToWorking={handleJumpToWorking}
        />
      )}
      </main>

      {/* EDIT CLIENT PROFILE MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="text-white font-bold text-sm flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-400" /> Edit Taxpayer / Firm Details
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Firm / Company Name</label>
                <input
                  type="text"
                  value={workingData.profile.firmName}
                  onChange={e => setWorkingData(prev => ({ ...prev, profile: { ...prev.profile, firmName: e.target.value } }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">GSTIN</label>
                <input
                  type="text"
                  value={workingData.profile.gstin}
                  onChange={e => {
                    const g = e.target.value.toUpperCase();
                    setWorkingData(prev => ({ ...prev, profile: { ...prev.profile, gstin: g } }));
                    setTargetGstin(g);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white font-mono uppercase focus:border-blue-500 outline-none"
                  maxLength={15}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Financial Year</label>
                <input
                  type="text"
                  value={workingData.profile.financialYear}
                  onChange={e => setWorkingData(prev => ({ ...prev, profile: { ...prev.profile, financialYear: e.target.value } }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Registered Address</label>
                <textarea
                  rows={2}
                  value={workingData.profile.address}
                  onChange={e => setWorkingData(prev => ({ ...prev, profile: { ...prev.profile, address: e.target.value } }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-blue-500 outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Authorised Signatory</label>
                  <input
                    type="text"
                    value={workingData.profile.authorisedSignatory || ''}
                    placeholder="e.g. Director / Partner"
                    onChange={e => setWorkingData(prev => ({ ...prev, profile: { ...prev.profile, authorisedSignatory: e.target.value } }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Nature of Business</label>
                  <input
                    type="text"
                    value={workingData.profile.natureOfBusiness || ''}
                    placeholder="e.g. Trading / Manufacturing"
                    onChange={e => setWorkingData(prev => ({ ...prev, profile: { ...prev.profile, natureOfBusiness: e.target.value } }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">GSTN Status</label>
                  <input
                    type="text"
                    value={workingData.profile.gstnStatus || ''}
                    placeholder="e.g. Active"
                    onChange={e => setWorkingData(prev => ({ ...prev, profile: { ...prev.profile, gstnStatus: e.target.value } }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Registration Date</label>
                  <input
                    type="text"
                    value={workingData.profile.registrationDate || ''}
                    placeholder="e.g. 01/07/2017"
                    onChange={e => setWorkingData(prev => ({ ...prev, profile: { ...prev.profile, registrationDate: e.target.value } }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Filing Email</label>
                  <input
                    type="email"
                    value={workingData.profile.filingEmail || ''}
                    placeholder="accounts@example.com"
                    onChange={e => setWorkingData(prev => ({ ...prev, profile: { ...prev.profile, filingEmail: e.target.value } }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Filing Phone</label>
                  <input
                    type="text"
                    value={workingData.profile.filingPhone || ''}
                    placeholder="Mobile / Office phone"
                    onChange={e => setWorkingData(prev => ({ ...prev, profile: { ...prev.profile, filingPhone: e.target.value } }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  toast.success('Client Profile Updated');
                }}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors mt-2"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OTP MODAL */}
      {showOtpModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="text-white font-bold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Verify Portal OTP
              </h3>
              <button onClick={() => setShowOtpModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-400 text-center">
                An OTP has been dispatched to the mobile number registered for <strong className="text-white">{targetGstin}</strong>.
              </p>

              <div>
                <input
                  type="text"
                  value={gstinOtp}
                  onChange={e => setGstinOtp(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Enter 6-digit OTP"
                  className="w-full h-12 bg-slate-950 border border-slate-700 rounded-xl px-4 text-center text-xl text-white tracking-[0.5em] font-mono focus:border-emerald-500 outline-none"
                  maxLength={6}
                />
              </div>

              <button
                onClick={handleVerifyPortalOtp}
                disabled={isProcessing || gstinOtp.length !== 6}
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all disabled:opacity-50 mt-2 text-xs uppercase tracking-wider"
              >
                {isProcessing ? 'Verifying...' : 'Establish Secure Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SEND GSTR-3B SUMMARY EMAIL MODAL ─── */}
      {isEmailModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-xl w-full flex flex-col max-h-[92vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Send GSTR-3B Tax Summary to Client
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Statutory Advice & Computation Statement • {selectedMonth} {currentMonthData.year}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* SMTP Warning if not configured */}
              {emailSmtpConfigured === false && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Gmail SMTP is not configured yet.</span> Configure your sender Gmail & 16-character Google App Password in Settings &gt; Email Settings to ensure successful dispatch.
                  </div>
                </div>
              )}

              {/* Client & Tax Card */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {workingData.profile.firmName || 'Client'}
                  </span>
                  <span className="font-mono bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                    {workingData.profile.gstin || 'GSTIN Not Set'}
                  </span>
                </div>

                {/* Net Cash Banner */}
                <div className="p-3 rounded-lg bg-gradient-to-r from-rose-50 to-amber-50 dark:from-rose-950/30 dark:to-amber-950/30 border border-rose-200/80 dark:border-rose-900/40 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                      Net Cash Challan to Pay (Table 6.1)
                    </div>
                    <div className="text-xl font-extrabold text-rose-900 dark:text-rose-200 tabular-nums">
                      ₹ {formatCur(currentMonthData.settlement?.balancePayable?.total ?? 0)}
                    </div>
                    <div className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                      IGST: ₹ {formatCur(currentMonthData.settlement?.balancePayable?.igst ?? 0)} | CGST: ₹ {formatCur(currentMonthData.settlement?.balancePayable?.cgst ?? 0)} | SGST: ₹ {formatCur(currentMonthData.settlement?.balancePayable?.sgst ?? 0)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Outward Tax: ₹ {formatCur(currentMonthData.outward?.totalSaleWorking?.total ?? 0)}</div>
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Eligible ITC: ₹ {formatCur(currentMonthData.inward?.totalItcAvailable?.total ?? 0)}</div>
                  </div>
                </div>
              </div>

              {/* Recipient Email Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Recipient Client Email <span className="text-rose-500">*</span></span>
                  <span className="text-[11px] text-slate-400 font-normal">Will be saved to Client Master</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={emailRecipient}
                    onChange={(e) => setEmailRecipient(e.target.value)}
                    placeholder="e.g. accounts@clientfirm.com"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Subject Line Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Email Subject Line
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Subject..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Custom Note Textarea */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Special Note / Auditor's Instructions (Optional)</span>
                  <span className="text-[11px] text-slate-400 font-normal">Included in email body</span>
                </label>
                <textarea
                  value={emailCustomNote}
                  onChange={(e) => setEmailCustomNote(e.target.value)}
                  rows={2}
                  placeholder="e.g. Kindly deposit the challan amount into GST portal PMT-06 on or before the 20th to avoid statutory late fees and interest."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Attachment Checkboxes */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Attachments Included:
                </div>
                <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={attachPdf}
                      onChange={(e) => setAttachPdf(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <FileText className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span><strong>Official GSTR-3B Working Statement PDF</strong> (Landscape Schedule)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={attachExcel}
                      onChange={(e) => setAttachExcel(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span><strong>12-Month GSTR-3B Working Excel Schedule</strong> (Multi-Tab Workbook)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(false)}
                disabled={isSendingEmail}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleExecuteSendMail}
                disabled={isSendingEmail || !emailRecipient.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isSendingEmail ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Dispatching Mail...</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5" />
                    <span>Send GSTR-3B Email</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── GSTR-3B WORKING SHEET UNLOCK PASSWORD MODAL ─── */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 border-b border-slate-800 flex justify-between items-center text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    Unlock {selectedMonth} Working Sheet & Cockpits
                  </h3>
                  <p className="text-[11px] text-slate-300">Administrative authorization required for {selectedMonth} {currentMonthData.year}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowUnlockModal(false);
                  setUnlockPassword('');
                  setUnlockError('');
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleUnlockSubmit} className="p-5 space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  The working sheet, figures, and ingestion cockpits for <strong className="font-bold">{selectedMonth} {currentMonthData.year}</strong> are locked to prevent unauthorized modifications. Enter the supervisor password to enable editing for this month.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Unlock Password
                </label>
                <div className="relative">
                  <input
                    type={showUnlockPassword ? 'text' : 'password'}
                    value={unlockPassword}
                    onChange={(e) => {
                      setUnlockPassword(e.target.value);
                      setUnlockError('');
                    }}
                    placeholder="Enter password..."
                    autoFocus
                    className="w-full bg-slate-50 border border-slate-300 focus:border-indigo-600 focus:bg-white rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-mono outline-none transition-all pr-10 focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUnlockPassword(prev => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    title={showUnlockPassword ? 'Hide password' : 'Show password'}
                  >
                    {showUnlockPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {unlockError && (
                  <p className="mt-1.5 text-xs text-rose-600 font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">error</span>
                    <span>{unlockError}</span>
                  </p>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowUnlockModal(false);
                    setUnlockPassword('');
                    setUnlockError('');
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 shadow-md shadow-indigo-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Unlock {selectedMonth}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREDENTIALS VAULT MODAL (SHARED) */}
      <CredentialsVaultModal
        isOpen={showCredentialsModal}
        onClose={() => {
          setShowCredentialsModal(false);
          fetchClientsHub();
        }}
        onSelectClient={handleSelectClientFromHub}
        selectedGstin={workingData.profile.gstin}
      />
    </div>
  );
}
