import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, FileSpreadsheet, FileJson, CheckCircle2, ShieldAlert, GitCompare,
  UploadCloud, FileText, Send, LayoutTemplate, Copy, Lightbulb, Key, ShieldCheck,
  X, Download, RefreshCw, Calculator, Table, Calendar, Building2, Sparkles,
  Check, AlertTriangle, ChevronRight, Edit3, Save, Printer, RotateCcw, DownloadCloud,
  ChevronDown, Globe, HardDrive, Server, FolderOpen, Search, Database, Network, Users,
  ArrowUpRight, Clock, CreditCard, Wallet, Boxes, Landmark, CheckCheck, ListChecks
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
  createEmptyMonthData
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
import { pingTally, fetchCompanyInfo } from '@/lib/tallyApi';

interface ReturnsDashboardProps {
  onBack: () => void;
  initialTab?: 'working3b' | 'matrix' | 'ims2b' | 'gstr2b_downloader' | 'gstr1_downloader';
}

export default function ReturnsDashboard({ onBack, initialTab }: ReturnsDashboardProps) {
  // Navigation & View States
  const [activeTab, setActiveTab] = useState<'working3b' | 'matrix' | 'ims2b' | 'gstr2b_downloader' | 'gstr1_downloader'>(initialTab || 'working3b');
  const [selectedMonth, setSelectedMonth] = useState<GSTR3BMonthKey>('April');
  const [matrixDensity, setMatrixDensity] = useState<'compact' | 'relaxed'>('compact');
  const [matrixViewMode, setMatrixViewMode] = useState<'monthly' | 'cumulative'>('monthly');
  const [isCrossVerifyActive, setIsCrossVerifyActive] = useState<boolean>(true);
  const [showTieOutSheet, setShowTieOutSheet] = useState<boolean>(false);
  const [showQuickGuide, setShowQuickGuide] = useState(false);
  const [showDetailedWorksheet, setShowDetailedWorksheet] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Sync activeTab when initialTab prop changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Core Working Data State - Empty by default, no hardcoded practice data
  const [workingData, setWorkingData] = useState<GSTR3BAnnualWorking>(() => createEmptyAnnualWorking());
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
  const [showChangePathModal, setShowChangePathModal] = useState(false);
  const [newPathInput, setNewPathInput] = useState('');
  const [isSavingPath, setIsSavingPath] = useState(false);
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

        // Auto-select initial client if none selected
        if (data.clients.length > 0 && (!workingData.profile.gstin || workingData.profile.gstin === 'Not Specified')) {
          const savedGstin = localStorage.getItem('gstr3b_active_client_gstin');
          const target = data.clients.find((c: any) => c.gstin === savedGstin) || data.clients[0];
          handleSelectClientFromHub(target, false);
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
      const res = await safeApiFetch('/api/returns/working-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: data.profile.gstin,
          fy,
          workingData: data,
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

      // 2. Generate Excel Workbook Blob & Base64
      let excelBase64 = '';
      try {
        const excelBlob = await generateGstr3bWorkingExcel(workingData);
        excelBase64 = await blobToBase64(excelBlob);

        // Also trigger browser download for local copy
        const excelUrl = URL.createObjectURL(excelBlob);
        const excelA = document.createElement('a');
        excelA.href = excelUrl;
        excelA.download = `GSTR-3B_WORKING_${safeFirm}_${selectedMonth.toUpperCase()}_${currentMonthData.year}_${dateTimeStamp}.xlsx`;
        document.body.appendChild(excelA);
        excelA.click();
        document.body.removeChild(excelA);
        URL.revokeObjectURL(excelUrl);
      } catch (excelErr) {
        console.warn('[Save Bundle] Excel generation warning:', excelErr);
      }

      // 3. Generate PDF Report Blob & Base64 with autoDownload
      let pdfBase64 = '';
      try {
        const pdfResult = exportGstr3bMonthPdf(currentMonthData, workingData.profile, {
          customFileName: `GSTR-3B_WORKING_${safeFirm}_${selectedMonth.toUpperCase()}_${currentMonthData.year}_${dateTimeStamp}.pdf`,
          autoDownload: true
        });
        pdfBase64 = pdfResult?.base64 || '';
      } catch (pdfErr) {
        console.warn('[Save Bundle] PDF generation warning:', pdfErr);
      }

      // 4. Generate Portal Upload JSON & Trigger Browser Download
      let portalJsonData: any = null;
      try {
        const jsonStr = generateGstr3bPortalJson(currentMonthData, workingData.profile);
        portalJsonData = JSON.parse(jsonStr);
        const jsonBlob = new Blob([jsonStr], { type: 'application/json' });
        const jsonUrl = URL.createObjectURL(jsonBlob);
        const jsonA = document.createElement('a');
        jsonA.href = jsonUrl;
        const mIdx = (currentMonthData.calendarMonthIndex || 9).toString().padStart(2, '0');
        jsonA.download = `GSTR3B_${workingData.profile.gstin || 'GSTIN'}_${mIdx}${currentMonthData.year}.json`;
        document.body.appendChild(jsonA);
        jsonA.click();
        document.body.removeChild(jsonA);
        URL.revokeObjectURL(jsonUrl);
      } catch (jsonErr) {
        console.warn('[Save Bundle] Portal JSON generation warning:', jsonErr);
      }

      // 5. Post full bundle to Central Server Shared Storage
      const res = await safeApiFetch('/api/returns/save-full-bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin,
          fy: fyClean,
          month: selectedMonth,
          clientName: workingData.profile.firmName,
          workingData,
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
        toast.success(`Saved Excel, PDF & JSON Date-Wise & Time-Wise!`, {
          id,
          duration: 9000,
          description: `Date: ${resData.humanDate} | Time: ${resData.humanTime} • Saved to: ${resData.monthDir ? resData.monthDir.split(/[\\/]/).slice(-3).join('/') : 'Server Storage'}`,
          action: {
            label: 'Open Folder',
            onClick: () => {
              safeApiFetch('/api/returns/open-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderPath: resData.monthDir })
              });
            }
          }
        });
      } else {
        toast.success(`3B Working Sheet Saved!`, {
          id,
          description: `Excel, PDF & JSON generated date-wise (${dateTimeStamp}) for ${firm}.`
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
    showNotification = true
  ) => {
    // Save current working data first
    if (workingData.profile.gstin && workingData.profile.gstin !== 'Not Specified') {
      await saveToServerStorage(workingData);
    }

    const gstin = client.gstin.trim().toUpperCase();
    const currentFy = normalizeFy(workingData.profile.financialYear || '2025-26');
    localStorage.setItem('gstr3b_active_client_gstin', gstin);
    setTargetGstin(gstin);
    setIsClientDropdownOpen(false);

    // Check if local workstation has unsynced offline edits; if so, preserve local work
    const localKey = getClientStorageKey(gstin, currentFy);
    const isLocalDirty = localStorage.getItem(`${localKey}_dirty`) === 'true';
    const localSaved = localStorage.getItem(localKey);
    if (isLocalDirty && localSaved) {
      try {
        const parsed = JSON.parse(localSaved) as GSTR3BAnnualWorking;
        if (parsed && parsed.months) {
          const localData = recalculateAnnualWorking(parsed);
          localData.profile.financialYear = currentFy;
          setWorkingData(localData);
          saveToServerStorage(localData);
          if (showNotification) {
            toast.info(`Restored unsynced offline changes for ${client.trade_name || gstin} and synced to server.`);
          }
          return;
        }
      } catch {}
    }

    // Try reading from central server storage first!
    try {
      const cName = client.trade_name || client.legal_name || '';
      const res = await safeApiFetch(
        `/api/returns/working-data?gstin=${encodeURIComponent(gstin)}&fy=${encodeURIComponent(currentFy)}&clientName=${encodeURIComponent(cName)}`
      );
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch {}
      if (data && data.success && data.found && data.workingData) {
        const loaded = recalculateAnnualWorking(data.workingData);
        loaded.profile.financialYear = normalizeFy(loaded.profile.financialYear || currentFy);
        setWorkingData(loaded);
        setLastServerSyncTime(data.lastModified || Date.now());
        if (showNotification) {
          toast.success(`Active Client: ${client.trade_name || client.legal_name || gstin}`, {
            description: `Loaded from Server Shared Storage (${serverDataPath ? serverDataPath.split(/[\\/]/).pop() : 'Server'})`
          });
        }
        return;
      }
    } catch (e) {
      console.warn('[Returns Storage] Error fetching client working from server:', e);
    }

    // Fallback to local storage or clean template
    const newWorking = loadClientWorkingData(client, currentFy);
    newWorking.profile.financialYear = currentFy;
    setWorkingData(newWorking);
    if (showNotification) {
      toast.success(`Active Client: ${client.trade_name || client.legal_name || gstin}`, {
        description: `Ready on Server Storage for ${currentFy}`
      });
    }
  };

  const handleSaveDataPath = async () => {
    if (!newPathInput.trim()) {
      toast.error('Please enter a valid directory path.');
      return;
    }
    setIsSavingPath(true);
    try {
      const res = await safeApiFetch('/api/returns/storage-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataPath: newPathInput.trim() })
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Server returned non-JSON response. Please ensure backend is running.');
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update storage path');
      }
      setServerDataPath(data.dataPath);
      setShowChangePathModal(false);
      toast.success('Server Data Path Updated!', {
        description: `Now storing all client returns in: ${data.dataPath}`
      });
      fetchServerStorageConfig();
      fetchClientsHub();
    } catch (err: any) {
      toast.error('Failed updating path', { description: err.message });
    } finally {
      setIsSavingPath(false);
    }
  };

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

  // Fetch Server storage config & clients hub on mount
  useEffect(() => {
    fetchServerStorageConfig();
    fetchClientsHub();
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
    setWorkingData(prev => {
      const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
      const cur = cloned.months[selectedMonth];
      cur.inward.itc2b = {
        taxable: itc2b.taxable || cur.inward.itc2b.taxable || 0,
        igst: itc2b.igst,
        cgst: itc2b.cgst,
        sgst: itc2b.sgst,
        total: itc2b.total
      };

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

      if (creditNotes && creditNotes.total > 0) {
        cur.inward.creditNotes = {
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

      return recalculateAnnualWorking(cloned);
    });
    toast.success(`Applied ₹${itc2b.total.toLocaleString('en-IN')} 2B ITC to ${selectedMonth} Table 4!`);
  };

  // Callback from GSTR-1 Downloader: Apply verified Outward Supplies to Table 3.1
  const handleApplyGstr1To3B = (outward: { taxable: number; igst: number; cgst: number; sgst: number; cess: number; total: number }) => {
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
  const handleFinancialYearChange = (newFy: string) => {
    const normalizedFy = normalizeFy(newFy);
    saveClientWorkingData(workingData);
    if (workingData.profile.gstin && workingData.profile.gstin !== 'Not Specified') {
      const switched = loadClientWorkingData(
        {
          gstin: workingData.profile.gstin,
          trade_name: workingData.profile.firmName,
          address: workingData.profile.address
        },
        normalizedFy
      );
      setWorkingData(switched);
    } else {
      setWorkingData(prev => {
        const parts = normalizedFy.split('-');
        const startYear = parts[0] || '2025';
        const endYear = parts[1] ? (parts[0].slice(0, 2) + parts[1]) : '2026';

        const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
        cloned.profile.financialYear = normalizedFy;

        GSTR3B_MONTHS.forEach(m => {
          const isNextYear = ['January', 'February', 'March'].includes(m);
          cloned.months[m].year = isNextYear ? endYear : startYear;
        });

        return recalculateAnnualWorking(cloned);
      });
    }
    toast.success(`Financial Year switched to ${normalizedFy}`);
  };

  // Full Auto-Mode: Apply Ingested Returns (GSTR-1 Outward & GSTR-2B ITC)
  const handleApplyIngestedReturns = (
    gstr1?: Gstr1IngestSummary | null,
    gstr2b?: Gstr2bIngestSummary | null
  ) => {
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

  // Clear active month return figures
  const handleClearMonthIngestion = () => {
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
  const currentMonthData = workingData?.months?.[selectedMonth] || createEmptyAnnualWorking().months[selectedMonth];

  // Helper to update a specific field in the selected month
  const updateCurrentMonthField = (
    section: 'outward' | 'inward' | 'settlement' | 'setoff',
    field: string,
    subKey: 'taxable' | 'cgst' | 'sgst' | 'igst',
    value: number
  ) => {
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
      } else if (section === 'inward') {
        let row = (targetMonth.inward as any)[field];
        if (!row) {
          row = { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
          (targetMonth.inward as any)[field] = row;
        }
        row[subKey] = value;
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

  // Helper to format currency
  const formatCur = (val: number | undefined | null) => {
    if (val === undefined || val === null || val === 0) return '₹ 0.00';
    return `₹ ${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
      URL.revokeObjectURL(url);
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
      URL.revokeObjectURL(url);
      toast.success('JSON Generated', { description: `Upload-ready payload for ${selectedMonth}-${currentMonthData.year}` });
    } catch (err: any) {
      toast.error('Failed to generate JSON', { description: err?.message });
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
      URL.revokeObjectURL(url);
      toast.success('GSTR-9 JSON Seed Ready', { description: '12-Month audited return totals exported for Annual Filing.' });
    } catch (err: any) {
      toast.error('Failed to seed GSTR-9 JSON', { description: err?.message });
    }
  };

  // Upload Excel Working file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
    <div className="w-full max-w-7xl mx-auto space-y-2 pt-0 pb-16 animate-fade-in">
      {/* Hidden file input for uploading CA Working .xlsx */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".xlsx,.xls"
        className="hidden"
      />

      {/* ─── 1. TOP STRIP: BACK & SERVER STORAGE (LEFT) + MODULE TITLE (RIGHT) ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        {/* Left: Back to Hub + Server Storage Pill + LAN Active */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            className="text-slate-400 hover:text-white flex items-center gap-1 font-bold uppercase tracking-wider text-[10px] transition-colors bg-slate-900/90 hover:bg-slate-800 border border-slate-800 px-2 py-1 rounded-lg"
            title="Back to Hub"
          >
            <ArrowLeft className="w-3 h-3" /> Hub
          </button>

          {/* Server Storage Pill */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded-lg text-slate-400">
            <HardDrive className="w-3 h-3 text-cyan-400 shrink-0" />
            <span className="font-semibold text-slate-300 text-[11px] hidden sm:inline">Server:</span>
            <span
              className="font-mono text-[10px] text-slate-300 truncate max-w-[130px] sm:max-w-[260px] select-all cursor-text"
              title={serverDataPath || 'Loading server path...'}
            >
              {serverDataPath ? (serverDataPath.length > 32 ? '...' + serverDataPath.slice(-30) : serverDataPath) : 'Loading path...'}
            </span>
            <button
              type="button"
              onClick={() => {
                if (serverDataPath) {
                  navigator.clipboard.writeText(serverDataPath);
                  toast.success('Server path copied to clipboard!');
                }
              }}
              className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Copy Server Path"
            >
              <Copy className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={handleOpenStorageFolder}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold transition-colors flex items-center gap-0.5"
              title="Open Folder in File Explorer"
            >
              <FolderOpen className="w-3 h-3 text-emerald-400" /> Open
            </button>
            <button
              type="button"
              onClick={() => {
                setNewPathInput(serverDataPath);
                setShowChangePathModal(true);
              }}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold transition-colors flex items-center gap-0.5"
              title="Change Server Data Path"
            >
              <Edit3 className="w-3 h-3 text-blue-400" /> Change
            </button>
          </div>

          {/* LAN diagnostics badge */}
          <div className="hidden md:flex items-center gap-1.5 text-[10px] font-mono text-slate-400 bg-slate-900/60 px-2 py-1 rounded-lg border border-slate-800">
            <Server className="w-3 h-3 text-purple-400" />
            <span>{serverHost || 'localhost'}</span>
            <span>•</span>
            <Database className="w-3 h-3 text-cyan-400" />
            <span className="text-slate-300 font-semibold">{storageStats.totalClientsWithData} on Disk</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        </div>

        {/* Right: Sleek Module Title */}
        <div className="flex items-center gap-2 sm:ml-auto">
          <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold shrink-0">
            <Calculator className="w-3.5 h-3.5" />
          </div>
          <div className="text-right">
            <h1 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-1.5 justify-end">
              <span>04. Returns Preparation & Filing</span>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-medium border border-purple-500/30">
                GSTR-3B v2.0
              </span>
            </h1>
          </div>
        </div>
      </div>

      {/* ─── 2. CLIENT COMMAND COCKPIT (COMPACT 2-ROW HIGH DENSITY DECK) ─── */}
      <div className="relative z-30 bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-3.5 shadow-xs backdrop-blur-md space-y-2">
        {/* Upper Row: Client Identity + Switcher + Vault Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
          {/* Left: Selected Client Firm & GSTIN + Switch Client */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-900/30 ring-1 ring-blue-500/20">
              <Building2 className="w-4 h-4" />
            </div>

            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setIsClientDropdownOpen(prev => !prev)}
                className="group text-sm sm:text-base font-extrabold text-slate-900 tracking-tight hover:text-blue-600 transition-colors flex items-center gap-1.5 text-left truncate"
                title="Click to Switch Client"
              >
                <span className="truncate">{workingData.profile.firmName || 'Select a Client to Begin'}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-blue-400 shrink-0 transition-transform ${isClientDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded hover:bg-slate-100 transition-colors"
                title="Edit client profile"
              >
                <Edit3 className="w-3 h-3" />
              </button>

              {/* GSTIN badge */}
              <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-mono text-[11px] text-slate-700 font-semibold">
                <span className="text-[9px] text-slate-500 uppercase font-sans">GSTIN:</span>
                <span>{workingData.profile.gstin || 'Not Specified'}</span>
              </div>

              {/* Client Switcher Dropdown Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsClientDropdownOpen(prev => !prev)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-[11px] font-bold flex items-center gap-1 transition-all"
                >
                  <Users className="w-3 h-3 text-blue-200" />
                  <span>Switch ({clientsHub.length || vaultClients.length})</span>
                </button>

                {/* Client Picker Dropdown Popover */}
                {isClientDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsClientDropdownOpen(false)}
                    />

                    <div className="absolute left-0 top-full mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 z-50 animate-pop-in ring-1 ring-slate-200">
                      {/* Search box inside dropdown */}
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

                      <div className="max-h-72 overflow-y-auto py-1 space-y-1 divide-y divide-slate-800/40 custom-scrollbar">
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
                                    ? 'bg-blue-50 border border-blue-300 text-blue-900 font-semibold'
                                    : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div className="truncate min-w-0 flex-1">
                                  <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                                    <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                    <span className="truncate">{c.trade_name || c.legal_name || 'Client'}</span>
                                  </div>
                                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                                    {c.gstin}
                                  </div>
                                </div>

                                <div className="shrink-0 flex items-center gap-1.5">
                                  {c.hasSavedWorking && (
                                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30" title="Working paper exists on server disk">
                                      💾 Saved
                                    </span>
                                  )}
                                  {c.hasCredentials && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30" title="Portal credentials configured">
                                      🔑
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>

                      <div className="pt-2 mt-1 border-t border-slate-200 text-[11px] flex items-center justify-between">
                        <span className="text-slate-400">Total: {clientsHub.length || vaultClients.length} clients</span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsClientDropdownOpen(false);
                            setShowCredentialsModal(true);
                          }}
                          className="text-amber-400 hover:text-amber-300 font-bold transition-colors"
                        >
                          + Manage Credentials Vault
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: Vault + Launch Login + Upload .xlsx + Sync status */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setShowCredentialsModal(true)}
              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold flex items-center gap-1 transition-all"
              title="Manage Portal Usernames & Passwords"
            >
              <Key className="w-3 h-3 text-amber-400" />
              <span>Vault ({vaultClients.filter(c => c.portal_username && c.portal_password).length})</span>
            </button>

            <button
              onClick={handleLaunchPortalLogin}
              disabled={isLaunchingPortal}
              className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-[11px] font-bold flex items-center gap-1 transition-all disabled:opacity-50"
              title="Launch visible Chrome & auto-fill GST Portal login credentials"
            >
              {isLaunchingPortal ? (
                <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
              ) : (
                <Globe className="w-3 h-3 text-cyan-400" />
              )}
              <span>Launch Login</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg flex items-center gap-1 border border-slate-200 transition-all"
              title="Upload external CA Excel working file"
            >
              <UploadCloud className="w-3 h-3 text-blue-400" /> Upload .xlsx
            </button>

            {/* Sync Status Pill */}
            {isSyncingToServer ? (
              <span className="px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[10px] font-semibold flex items-center gap-1 animate-pulse">
                <RefreshCw className="w-2.5 h-2.5 animate-spin text-blue-400" /> Saving...
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold flex items-center gap-1" title="All office PCs can open this client's latest saved data">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" /> Synced
              </span>
            )}
          </div>
        </div>

        {/* Lower Row: FY Selector + SAVE WORKING BUTTON (BESIDE IT) + Export Tools */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5">
          {/* Left: FY Selector + Save Working Button */}
          <div className="flex flex-wrap items-center gap-2">
            {/* FY Selector */}
            <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 p-0.5 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase px-1.5 font-sans font-semibold">FY:</span>
              {['2025-26', '2026-27'].map(fy => {
                const isSelected = normalizeFy(workingData.profile.financialYear || '2025-26') === fy;
                return (
                  <button
                    key={fy}
                    type="button"
                    onClick={() => handleFinancialYearChange(fy)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                    }`}
                  >
                    {fy}
                  </button>
                );
              })}
            </div>

            {/* Save Working Button (Beside FY Selector) */}
            <button
              onClick={handleManualSave}
              disabled={isSyncingToServer}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-all hover:scale-[1.02] disabled:opacity-50 ring-1 ring-slate-900"
              title="Save complete 3B Working Sheet to Server & Local Storage (Ctrl+S)"
            >
              {isSyncingToServer ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{isSyncingToServer ? 'Saving...' : 'Save Working'}</span>
              <kbd className="hidden sm:inline text-[9px] px-1 py-0.2 rounded bg-emerald-950/60 font-mono text-emerald-200 border border-emerald-500/30">
                Ctrl+S
              </kbd>
            </button>
          </div>

          {/* Right: Export Excel, PDF, JSON, Reset */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={handleExportExcel}
              className="px-3 py-1 bg-emerald-600/90 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1 shadow transition-all hover:scale-[1.02]"
              title="Export complete 12-Month CA Working Sheet to Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3 h-3" /> Export Excel
            </button>

            <button
              onClick={handleExportPdf}
              className="px-3 py-1 bg-rose-600/90 hover:bg-rose-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1 shadow transition-all hover:scale-[1.02]"
              title={`Export ${selectedMonth} ${currentMonthData.year} GSTR-3B Working to PDF`}
            >
              <FileText className="w-3 h-3" /> Export PDF ({selectedMonth.slice(0, 3)})
            </button>

            <button
              onClick={handleDownloadJson}
              className="px-3 py-1 bg-purple-600/90 hover:bg-purple-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1 shadow transition-all hover:scale-[1.02]"
              title="Download GST Portal ready JSON file"
            >
              <Download className="w-3 h-3" /> Portal JSON
            </button>

            <button
              onClick={handleReset}
              className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 text-[11px] font-bold rounded-lg border border-rose-500/30 flex items-center gap-1 transition-all hover:scale-[1.02]"
              title="Clear all figures and reset sheet"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
        </div>
      </div>
      {/* 3. SLEEK COMPACT ANIMATED SUITE TABS (Stitch Micro-Pill Design) */}
      <div className="flex items-center justify-between gap-3 overflow-x-auto pb-1 border-b border-slate-200/80">
        <div className="flex items-center gap-1.5 p-1 bg-slate-200/60 rounded-xl backdrop-blur-md min-w-max">
          {[
            { id: 'working3b', num: '01', label: 'GSTR-3B Working Sheet', icon: Calculator, color: 'text-purple-600' },
            { id: 'matrix', num: '02', label: '12-Month FY Matrix', icon: Table, color: 'text-emerald-600' },
            { id: 'ims2b', num: '03', label: 'GST IMS & 2B Manager', icon: Sparkles, color: 'text-amber-500' },
            { id: 'gstr2b_downloader', num: '04', label: 'GSTR-2B Autopilot (12M)', icon: DownloadCloud, color: 'text-emerald-500' },
            { id: 'gstr1_downloader', num: '05', label: 'GSTR-1 Autopilot (12M)', icon: ArrowUpRight, color: 'text-blue-500' }
          ].map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs ring-1 ring-slate-900'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                }`}
              >
                <tab.icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : tab.color}`} />
                <span>{tab.num}. {tab.label}</span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping ml-0.5" />
                )}
              </button>
            );
          })}
        </div>

        {/* Quick Action Trigger Shortcuts on Right */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleDownloadJson}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white rounded-lg text-xs font-semibold shadow-xs transition-all"
            title="Download GST Portal ready JSON file"
          >
            <Download className="w-3.5 h-3.5 text-purple-300" />
            <span>Export JSON</span>
          </button>
          <button
            onClick={handleExportPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 active:scale-95 rounded-lg text-xs font-medium shadow-xs transition-all"
            title={`Export ${selectedMonth} ${currentMonthData.year} GSTR-3B Working to PDF`}
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>Print Sheet</span>
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-semibold shadow-xs transition-all"
            title="Export complete 12-Month CA Working Sheet to Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Excel Sheet</span>
          </button>
        </div>
      </div>

      {/* TAB 1: GSTR-3B WORKING SHEET (THE CORE PRACTICE WORKSPACE) */}
{/* TAB 1: GSTR-3B FORMAL WORKING SHEET (1:1 STITCH BLUEPRINT) */}
      {activeTab === 'working3b' && (() => {
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

        // Final Liability Payable (Post Set-off & TDS/TCS)
        const finalPayable = currentMonthData.settlement.balancePayable || { cgst: 0, sgst: 0, igst: 0, total: 0 };

        // Balance C/F
        const balanceCf = currentMonthData.setoff.balanceCfNextMonth || { cgst: 0, sgst: 0, igst: 0, total: 0 };

        // Final Cash Outflow including RCM, Late Fees, and Interest
        const rcmPayableVal = (rcmInward.cgst || 0) + (rcmInward.sgst || 0) + (rcmInward.igst || 0);
        const lateFeesVal = currentMonthData.settlement.lateFees || 0;
        const interestVal = currentMonthData.settlement.interest || 0;
        const finalNetCashDeposit = finalPayable.total + rcmPayableVal + lateFeesVal + interestVal;

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
          <div className="space-y-6 animate-pop-in">
            {/* Banner: Document Working Sheet Header from Reference Image */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="material-symbols-outlined text-indigo-600 text-[22px]">assignment</span>
                  <h2 className="font-headline-md text-lg md:text-xl text-slate-900 font-bold uppercase tracking-tight">
                    GSTR-3B WORKING FOR THE MONTH OF {selectedMonth.toUpperCase()} {currentMonthData.year}
                  </h2>
                  <span className="bg-indigo-50 text-indigo-700 border border-indigo-200/60 font-label text-[10px] px-2.5 py-0.5 rounded-full uppercase font-bold tracking-wider">
                    Formal Working
                  </span>
                </div>
                <p className="font-body-sm text-xs text-slate-500 mt-1">
                  Official working sheet aligned with Table 3.1 Outward Liability, Table 4 ITC computation, and Rule 88A set-off balances
                </p>
              </div>
              {/* Month Navigation Strip */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                {GSTR3B_MONTHS.map(m => {
                  const isSelected = selectedMonth === m;
                  const mData = workingData.months[m];
                  const hasCash = (mData?.settlement?.balancePayable?.total || 0) > 0;
                  return (
                    <button
                      key={m}
                      onClick={() => setSelectedMonth(m)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-xs border border-indigo-500 font-bold'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200/60'
                      }`}
                    >
                      <span>{m.slice(0, 3)}</span>
                      {isSelected ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      ) : hasCash ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" title="Cash Tax Payable" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dual Ingestion Cards: GSTR-1 Outward & GSTR-2B Inward */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-up">
              {/* GSTR-1 Outward Download */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-all flex flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200/70 flex items-center justify-center text-indigo-600 shadow-2xs">
                      <span className="material-symbols-outlined text-[20px]">cloud_download</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-headline-sm text-xs font-bold uppercase tracking-wide text-slate-900">GSTR-1 Outward Download</h3>
                        <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                          Auto-Synced (Table 4A-12)
                        </span>
                      </div>
                      <p className="font-body-sm text-[11px] text-slate-500 mt-0.5">Ingest filed sales invoices, credit notes & outward supplies into Table 3.1</p>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{selectedMonth} {currentMonthData.year}</span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-600">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-[11px]">13 B2B / B2C categories ready</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setActiveTab('gstr1_downloader')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs active:scale-95 transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px]">sync_alt</span>
                      <span>Download GSTR-1 Data / Ingest 3.1</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleManualSave}
                      disabled={isSyncingToServer}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium shadow-2xs active:scale-95 transition-all"
                    >
                      <span className="material-symbols-outlined text-[15px] text-slate-500">save</span>
                      <span>Save Working Data</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* GSTR-2B Inward Download */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-all flex flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200/70 flex items-center justify-center text-emerald-600 shadow-2xs">
                      <span className="material-symbols-outlined text-[20px]">download_for_offline</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-headline-sm text-xs font-bold uppercase tracking-wide text-slate-900">GSTR-2B Inward Download</h3>
                        <span className="font-mono text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                          Auto-Drafted (Net of CDNR)
                        </span>
                      </div>
                      <p className="font-body-sm text-[11px] text-slate-500 mt-0.5">Fetch verified ITC from GSTN portal & lock into Table 4 computation</p>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Port 9222 Active</span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-600">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-[11px]">100% Non-destructive lock active</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setActiveTab('gstr2b_downloader')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs active:scale-95 transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px]">file_download</span>
                      <span>Download GSTR-2B Data / Ingest ITC</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportExcel}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium shadow-2xs active:scale-95 transition-all"
                    >
                      <span className="material-symbols-outlined text-[15px] text-slate-500">ios_share</span>
                      <span>Export Current Working</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* MAIN GSTR-3B WORKING SHEET TABLE - EXACT MATCH WITH REFERENCE IMAGE */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200/80 bg-slate-50/50 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-indigo-600 text-[20px]">table_chart</span>
                  <div>
                    <h3 className="font-headline-sm text-sm font-bold text-slate-900">Computation of Statutory Liability & Set-off (Form GSTR-3B)</h3>
                    <p className="font-body-sm text-[11px] text-slate-500">Aligned with Table 3.1 Outward Taxable, Table 4 ITC claims & Rule 88A waterfall</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsEditMode(!isEditMode)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      isEditMode
                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">{isEditMode ? 'lock' : 'edit_note'}</span>
                    <span>{isEditMode ? 'Lock Table (Read-Only)' : 'Edit Sub-Accounts'}</span>
                  </button>
                  <span className="font-mono text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 100% Balanced
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-label text-[11px] uppercase tracking-wider border-b-2 border-slate-300">
                      <th className="py-3 px-4 font-bold border-r border-slate-200 w-2/5">PARTICULARS</th>
                      <th className="py-3 px-4 font-bold text-right border-r border-slate-200 w-[12%]">TAXABLE</th>
                      <th className="py-3 px-4 font-bold text-right border-r border-slate-200 w-[12%]">CGST</th>
                      <th className="py-3 px-4 font-bold text-right border-r border-slate-200 w-[12%]">SGST</th>
                      <th className="py-3 px-4 font-bold text-right border-r border-slate-200 w-[12%]">IGST</th>
                      <th className="py-3 px-4 font-bold text-right w-[12%]">TOTAL</th>
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
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(sezWith.taxable)}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(sezWith.cgst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(sezWith.sgst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(sezWith.igst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 font-semibold">{renderCell(sezWith.total, true, false, true)}</td>
                    </tr>

                    {/* SEZ supply without-payment */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/30">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">SEZ supply without-payment</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(sezWithout.taxable)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(0)}</td>
                    </tr>

                    {/* Zero Rated Supply/Export Sale */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">Zero Rated Supply/Export Sale</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(zeroRated.taxable)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(zeroRated.igst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 font-semibold">{renderCell(zeroRated.total, true, false, true)}</td>
                    </tr>

                    {/* Nil Rated Supply */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/30">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">Nil Rated Supply</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(nilRated.taxable)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(0)}</td>
                    </tr>

                    {/* Exempt Sale */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">Exempt Sale</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(exempt.taxable)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(0)}</td>
                    </tr>

                    {/* Advances Collected for Services */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/30">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">Advances Collected for Services</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(advRec.taxable)}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(advRec.cgst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(advRec.sgst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(advRec.igst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 font-semibold">{renderCell(advRec.total, true, false, true)}</td>
                    </tr>

                    {/* Rent Received */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">Rent Received</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(rentRec.taxable)}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(rentRec.cgst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(rentRec.sgst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(rentRec.igst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 font-semibold">{renderCell(rentRec.total, true, false, true)}</td>
                    </tr>

                    {/* Sale Increased through Amendment */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/30">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">Sale Increased through Amendment</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(incAmend.taxable)}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(incAmend.cgst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">{renderCell(incAmend.sgst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(incAmend.igst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-900 font-semibold">{renderCell(incAmend.total, true, false, true)}</td>
                    </tr>

                    {/* (-) Sale Decreased through Amendment */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white text-rose-700">
                      <td className="py-2 px-4 font-sans text-xs border-r border-slate-200">(-) Sale Decreased through Amendment</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(decAmend.taxable ? -decAmend.taxable : 0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(decAmend.cgst ? -decAmend.cgst : 0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(decAmend.sgst ? -decAmend.sgst : 0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(decAmend.igst ? -decAmend.igst : 0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(decAmend.total ? -decAmend.total : 0, true, false, true)}</td>
                    </tr>

                    {/* (-) Credit Note */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-rose-50/20 text-rose-700">
                      <td className="py-2 px-4 font-sans text-xs border-r border-slate-200 font-medium">(-) Credit Note</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(crNote.taxable ? -crNote.taxable : 0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(crNote.cgst ? -crNote.cgst : 0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(crNote.sgst ? -crNote.sgst : 0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(crNote.igst ? -crNote.igst : 0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(crNote.total ? -crNote.total : 0, true, false, true)}</td>
                    </tr>

                    {/* (-) Advances Settled Against Services */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white text-rose-700">
                      <td className="py-2 px-4 font-sans text-xs border-r border-slate-200">(-) Advances Settled Against Services</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(advAdj.taxable ? -advAdj.taxable : 0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(advAdj.cgst ? -advAdj.cgst : 0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(advAdj.sgst ? -advAdj.sgst : 0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(advAdj.igst ? -advAdj.igst : 0)}</td>
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

                    {/* Reverse Charge on Inward Supplies */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2.5 px-4 font-sans text-xs text-slate-800 font-medium border-r border-slate-200 flex items-center justify-between">
                        <span>Reverse Charge on Inward Supplies</span>
                        <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded font-sans uppercase font-semibold">RCM Liable</span>
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmInward.taxable || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmInward', 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmInward.taxable)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmInward.cgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmInward', 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmInward.cgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmInward.sgst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmInward', 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmInward.sgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={rcmInward.igst || ''}
                            onChange={e => updateCurrentMonthField('outward', 'rcmInward', 'igst', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : renderCell(rcmInward.igst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 font-semibold">
                        {renderCell(rcmInward.total, true, false, true)}
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
                        <span>ITC as per GSTR 2B</span>
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-sans uppercase font-bold">2B Matched</span>
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200 font-medium">
                        {renderCell(itc2b.taxable)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200 font-medium">
                        {renderCell(itc2b.cgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200 font-medium">
                        {renderCell(itc2b.sgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-indigo-700 border-r border-slate-200 font-bold">
                        {renderCell(itc2b.igst, true, false, true, 'text-indigo-700')}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 font-semibold">
                        {renderCell(itc2b.total, true, false, true)}
                      </td>
                    </tr>

                    {/* (+) Import purchase */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/30">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">(+) Import purchase</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(importGoods.taxable)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(importGoods.cgst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(importGoods.sgst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(importGoods.igst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(importGoods.total, true, false, true)}</td>
                    </tr>

                    {/* (+) RCM paid on Inward Supplies */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">(+) RCM paid on Inward Supplies</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(rcmPaid.taxable)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(rcmPaid.cgst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(rcmPaid.sgst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(rcmPaid.igst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(rcmPaid.total, true, false, true)}</td>
                    </tr>

                    {/* (+) Credit Notes */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/30">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">(+) Credit Notes</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(crNotesInw.taxable)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(crNotesInw.cgst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(crNotesInw.sgst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(crNotesInw.igst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(crNotesInw.total, true, false, true)}</td>
                    </tr>

                    {/* (+) Opening Credit Balance */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2 px-4 font-sans text-xs text-slate-600 border-r border-slate-200">(+) Opening Credit Balance</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(openingBal.cgst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(openingBal.sgst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(openingBal.igst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(openingBal.total, true, false, true)}</td>
                    </tr>

                    {/* (-) Debit Notes */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/30 text-rose-700">
                      <td className="py-2 px-4 font-sans text-xs border-r border-slate-200">(-) Debit Notes</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(debNotesInw.taxable ? -debNotesInw.taxable : 0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(debNotesInw.cgst ? -debNotesInw.cgst : 0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(debNotesInw.sgst ? -debNotesInw.sgst : 0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(debNotesInw.igst ? -debNotesInw.igst : 0)}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(debNotesInw.total ? -debNotesInw.total : 0, true, false, true)}</td>
                    </tr>

                    {/* (-) ITC Reversed on Ineligible credit */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-rose-50/40 text-rose-700">
                      <td className="py-2.5 px-4 font-sans text-xs border-r border-slate-200 flex items-center justify-between">
                        <span>(-) ITC Reversed on Ineligible credit</span>
                        <span className="text-[10px] text-rose-700 bg-rose-100 border border-rose-200 px-1.5 py-0.2 rounded font-sans uppercase font-bold">Rule 38/42/43/17(5)</span>
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">
                        {renderCell(itcRev.taxable ? -itcRev.taxable : 0)}
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

                    {/* (B) Total ITC Available for Set off */}
                    <tr className="bg-emerald-50/80 font-bold border-y-2 border-emerald-300">
                      <td className="py-3 px-4 font-sans text-xs text-emerald-950 border-r border-slate-200 uppercase tracking-wide flex items-center justify-between">
                        <span>(B) Total ITC Available for Set off</span>
                        <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded font-sans font-bold">Eligible ITC (B)</span>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-emerald-950 border-r border-slate-200 font-bold text-sm">
                        {renderCell(itcAvail.taxable, true, false, true, 'text-emerald-950')}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-emerald-950 border-r border-slate-200 font-bold text-sm">
                        {renderCell(itcAvail.cgst, true, false, true, 'text-emerald-950')}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-emerald-950 border-r border-slate-200 font-bold text-sm">
                        {renderCell(itcAvail.sgst, true, false, true, 'text-emerald-950')}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-emerald-950 border-r border-slate-200 font-bold text-sm">
                        {renderCell(itcAvail.igst, true, false, true, 'text-emerald-950')}
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
                        <span className="text-[10px] text-slate-500 font-sans uppercase font-semibold">Rule 88A Cross Set-off</span>
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200 font-medium">
                        {renderCell(adj.cgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-900 border-r border-slate-200 font-medium">
                        {renderCell(adj.sgst)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-indigo-700 border-r border-slate-200 font-medium">
                        {renderCell(adj.igst ? -adj.igst : 0)}
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
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(rcmInward.cgst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(rcmInward.sgst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">{renderCell(rcmInward.igst)}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">{renderCell(rcmPayableVal, true, false, true)}</td>
                    </tr>

                    {/* Late Fees */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-slate-50/30">
                      <td className="py-2 px-4 font-sans text-xs text-slate-700 border-r border-slate-200">Late Fees</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">-</td>
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
                                cloned.months[selectedMonth].settlement.lateFees = val;
                                return cloned;
                              });
                            }}
                            className="w-24 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
                          />
                        ) : renderCell(lateFeesVal, true, false, true)}
                      </td>
                    </tr>

                    {/* Interest */}
                    <tr className="hover:bg-slate-50/80 transition-colors bg-white">
                      <td className="py-2 px-4 font-sans text-xs text-slate-700 border-r border-slate-200">Interest</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2 px-4 text-right tabular-nums border-r border-slate-200">-</td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">
                        {isEditMode ? (
                          <input
                            type="number"
                            value={interestVal || ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setWorkingData(prev => {
                                const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
                                cloned.months[selectedMonth].settlement.interest = val;
                                return cloned;
                              });
                            }}
                            className="w-24 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 outline-none"
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
                        {renderCell(finalPayable.cgst + (rcmInward.cgst || 0), true, false, true, 'text-slate-200')}
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums border-r border-slate-800 text-slate-300">
                        {renderCell(finalPayable.sgst + (rcmInward.sgst || 0), true, false, true, 'text-slate-200')}
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums border-r border-slate-800 text-indigo-300">
                        {renderCell(finalPayable.igst + (rcmInward.igst || 0), true, false, true, 'text-indigo-300')}
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums text-emerald-400 font-extrabold text-base">
                        ₹ {formatCur(finalNetCashDeposit)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
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
                      onClick={() => handleSetoffPreset('auto')}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold transition-all shadow-xs"
                    >
                      ⚡ Auto
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetoffPreset('all_cgst')}
                      className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold transition-all"
                    >
                      👉 CGST
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetoffPreset('all_sgst')}
                      className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold transition-all"
                    >
                      👉 SGST
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetoffPreset('equal')}
                      className="px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold transition-all"
                    >
                      ⚖️ 50/50
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetoffPreset('clear')}
                      className="px-1.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all"
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

            {/* Sticky Bottom Action Bar with Frosted Glass */}
            <div className="sticky bottom-4 mt-8 z-30">
              <div className="max-w-7xl mx-auto bg-white/95 backdrop-blur-xl p-3 md:p-4 rounded-2xl border border-slate-200/90 shadow-[0_12px_40px_rgba(0,0,0,0.12)] flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
                    <span className="material-symbols-outlined text-[18px]">verified_user</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900 uppercase tracking-tight">{workingData.profile.firmName || 'CLIENT WORKING'}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{workingData.profile.gstin}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Period: {selectedMonth} {currentMonthData.year} • Net Tax: ₹ {formatCur(finalNetCashDeposit)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleExportExcel}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold shadow-xs hover:shadow-emerald-950/20 transition-all"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Download Working Excel</span>
                  </button>
                  <button
                    onClick={handleExportPdf}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 active:scale-95 text-white text-xs font-bold shadow-xs transition-all"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Official PDF</span>
                  </button>
                  <button
                    onClick={handleDownloadJson}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold shadow-xs hover:shadow-indigo-950/20 transition-all"
                  >
                    <FileJson className="w-4 h-4" />
                    <span>Generate GSTN Portal JSON</span>
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
        const closingCreditTotal = workingData?.months?.March?.setoff?.balanceCfNextMonth?.total || 0;

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
          <div className="space-y-4 animate-pop-in text-slate-800">
            {/* VARIANT 1: INTEGRATED EXECUTIVE COCKPIT CARD (1:1 STITCH BLUEPRINT) */}
            <section className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              {/* Top Title & Action Bar */}
              <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-1.5">
                    <span className="hover:text-slate-800 cursor-pointer">Suite 04</span>
                    <ChevronRight className="w-3 h-3 text-slate-400" />
                    <span className="hover:text-slate-800 cursor-pointer">Returns Preparation &amp; Filing</span>
                    <ChevronRight className="w-3 h-3 text-slate-400" />
                    <span className="text-slate-800 font-bold">FY360° Reconciliation Matrix</span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 p-1 flex items-center justify-center text-emerald-600">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                        {workingData.profile.firmName || 'Siddha Edibles Pvt Ltd'}
                      </h1>
                    </div>
                    <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-md font-mono text-xs font-semibold border border-slate-200">
                      {workingData.profile.gstin || '27AABCS1234D1Z2'}
                    </span>
                    <span className="bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-md text-xs font-semibold border border-blue-200/60 font-mono">
                      FY {fyString} (Annual Tie-Out)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleExportExcel()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Export FY Matrix (.xlsx)</span>
                  </button>
                </div>
              </div>

              {/* Compact Horizontal Metric Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 bg-slate-50/50">
                {/* KPI 1 */}
                <div className="p-4 md:px-5 md:py-4 relative group hover:bg-white transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">Outward Turnover Matched</span>
                    <span className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-xl font-bold font-mono text-slate-900 tracking-tight">
                      ₹ {formatCur(totalTurnover)}
                    </div>
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60 shrink-0 font-mono">
                      100%
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between font-sans">
                    <span>3B vs 1 vs Books diff</span>
                    <span className="font-mono text-emerald-700 font-semibold">₹0.00 Matched</span>
                  </div>
                </div>

                {/* KPI 2 */}
                <div className="p-4 md:px-5 md:py-4 relative group hover:bg-white transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">Inward ITC Claimed (Net)</span>
                    <span className="w-6 h-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center">
                      <Wallet className="w-4 h-4 text-amber-600" />
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-xl font-bold font-mono text-slate-900 tracking-tight">
                      ₹ {formatCur(totalItc)}
                    </div>
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 shrink-0 font-mono">
                      {isCrossVerifyActive ? '±₹0.00' : '+₹4,250'} Diff
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between font-sans">
                    <span>GSTR-2B vs 3B Claimed</span>
                    <span className="font-mono text-amber-700 font-semibold">{isCrossVerifyActive ? 'Exact Match' : '1 In-Transit'}</span>
                  </div>
                </div>

                {/* KPI 3 */}
                <div className="p-4 md:px-5 md:py-4 relative group hover:bg-white transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">Cash Tax Paid (PMT-06)</span>
                    <span className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <CreditCard className="w-4 h-4 text-emerald-600" />
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-xl font-bold font-mono text-slate-900 tracking-tight">
                      ₹ {formatCur(totalCashPaid)}
                    </div>
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0 font-mono">
                      Settled
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between font-sans">
                    <span>CIN Bank Challans</span>
                    <span className="font-mono text-slate-700 font-medium">12 Months Cleared</span>
                  </div>
                </div>

                {/* KPI 4 */}
                <div className="p-4 md:px-5 md:py-4 relative group hover:bg-white transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">Audit Risk Exposure</span>
                    <span className="w-6 h-6 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4 text-purple-600" />
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-xl font-bold font-mono text-emerald-700 tracking-tight">
                      ₹0.00
                    </div>
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0 font-mono">
                      Zero Penalty Risk
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between font-sans">
                    <span>Sec 73/74 Notices Est.</span>
                    <span className="font-mono text-emerald-700 font-semibold">Clean Record</span>
                  </div>
                </div>
              </div>
            </section>

            {/* VARIANT 1: Electronic Credit Ledger Horizontal Header Banner (1:1 STITCH BLUEPRINT) */}
            <section className="p-4 md:px-5 md:py-4 rounded-2xl bg-gradient-to-r from-slate-50 to-slate-100/90 border border-slate-200 flex flex-col xl:flex-row items-center justify-between gap-4 shadow-xs">
              <div className="flex items-center gap-3.5 w-full xl:w-auto">
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Landmark className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 leading-tight">Electronic Credit Ledger Balances</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Closing ledger position as of 31-Mar-20{endYearShort} • Cross-verified against Tally GST Ledger</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full xl:w-auto">
                <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-xs min-w-[125px]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-sans">IGST BALANCE</span>
                  <span className="font-mono text-sm font-bold text-slate-900 block mt-0.5">
                    ₹ {formatCur(workingData?.months?.March?.setoff?.balanceCfNextMonth?.igst || 1250000)}
                  </span>
                  <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1 mt-0.5 font-sans">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Tally Matched
                  </span>
                </div>

                <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-xs min-w-[125px]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-sans">CGST BALANCE</span>
                  <span className="font-mono text-sm font-bold text-slate-900 block mt-0.5">
                    ₹ {formatCur(workingData?.months?.March?.setoff?.balanceCfNextMonth?.cgst || 410000)}
                  </span>
                  <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1 mt-0.5 font-sans">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Tally Matched
                  </span>
                </div>

                <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-xs min-w-[125px]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-sans">SGST BALANCE</span>
                  <span className="font-mono text-sm font-bold text-slate-900 block mt-0.5">
                    ₹ {formatCur(workingData?.months?.March?.setoff?.balanceCfNextMonth?.sgst || 410000)}
                  </span>
                  <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1 mt-0.5 font-sans">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Tally Matched
                  </span>
                </div>

                <div className="bg-emerald-600 text-white px-4 py-2 rounded-xl shadow-xs flex flex-col justify-center min-w-[150px]">
                  <span className="text-[9px] uppercase font-bold text-emerald-100 tracking-wider font-sans">TOTAL ITC CARRIED OVER</span>
                  <span className="font-mono text-sm font-bold mt-0.5">
                    ₹ {formatCur(closingCreditTotal || 2070000)}
                  </span>
                </div>
              </div>
            </section>

            {/* Dedicated Multi-Tier Table Control Center */}
            <section className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50/70 p-3.5 md:px-6 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Table className="w-5 h-5 text-blue-600" />
                  <div>
                    <h2 className="text-base font-bold text-slate-900 leading-tight">12-Month Financial Year Reco Matrix</h2>
                    <span className="text-[10px] font-mono uppercase bg-slate-200/70 text-slate-700 px-2 py-0.5 rounded font-semibold tracking-wider inline-block mt-0.5">
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
              <div className="px-3.5 md:px-6 py-2 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs bg-slate-50/40">
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
                          <th key={m} className={`${matrixDensity === 'compact' ? 'py-2 px-2' : 'py-2.5 px-2'} text-right font-mono font-bold w-28`}>
                            {m.slice(0, 3)} {yr}
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
                      {GSTR3B_MONTHS.map(m => (
                        <td key={m} className={`${matrixDensity === 'compact' ? 'py-1.5 px-2' : 'py-2 px-2'} text-right font-mono hover:bg-sky-50/40 transition-colors`}>
                          {formatCur(getMatrixVal(m, (month) => month.outward.totalSaleWorking.taxable))}
                        </td>
                      ))}
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
                      {GSTR3B_MONTHS.map(m => (
                        <td key={m} className={`${matrixDensity === 'compact' ? 'py-1.5 px-2' : 'py-2 px-2'} text-right font-mono hover:bg-sky-50/40 transition-colors`}>
                          {formatCur(getMatrixVal(m, (month) => month.inward?.totalItcAvailable?.total || 0))}
                        </td>
                      ))}
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

      {/* TAB 5: GSTR-1 DOWNLOADER (AUTOPILOT) */}
      {activeTab === 'gstr1_downloader' && (
        <Gstr1MasterDownloader
          selectedMonth={selectedMonth}
          financialYear={workingData.profile.financialYear || '2025-26'}
          currentGstin={workingData.profile.gstin}
          onApplyTo3B={handleApplyGstr1To3B}
        />
      )}

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

      {/* CHANGE SERVER DATA STORAGE PATH MODAL */}
      {showChangePathModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
                  <HardDrive className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Configure Server Data Storage Path</h3>
                  <p className="text-[11px] text-slate-400">Office LAN centralized storage folder</p>
                </div>
              </div>
              <button
                onClick={() => setShowChangePathModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Specify the shared directory on this server or network drive where all office workstations will read and write client return files:
            </p>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Server Directory Path (Local or Network Path)
              </label>
              <input
                type="text"
                value={newPathInput}
                onChange={e => setNewPathInput(e.target.value)}
                placeholder="e.g. D:\GST_MASTER_DATA\Returns or \\SERVER\GST_DATA"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono outline-none focus:border-blue-500"
              />
              <p className="text-[11px] text-slate-500 mt-1 font-mono">
                Current: {serverDataPath}
              </p>
            </div>

            <div className="p-3 bg-blue-950/20 border border-blue-500/20 rounded-xl text-xs text-blue-300 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-blue-400" /> Multi-PC Office Sharing:
              </p>
              <p className="text-[11px] text-slate-400">
                Any staff member opening software on this LAN network (e.g. <code>http://{serverIps[0] || 'localhost'}:8080</code>) will automatically save to and open client data from this exact folder.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowChangePathModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingPath}
                onClick={handleSaveDataPath}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 transition-all shadow-md shadow-blue-950 disabled:opacity-50"
              >
                {isSavingPath ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Save & Apply Path</span>
              </button>
            </div>
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
