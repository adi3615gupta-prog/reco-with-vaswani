import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, FileSpreadsheet, FileJson, CheckCircle2, ShieldAlert, GitCompare,
  UploadCloud, FileText, Send, LayoutTemplate, Copy, Lightbulb, Key, ShieldCheck,
  X, Download, RefreshCw, Calculator, Table, Calendar, Building2, Sparkles,
  Check, AlertTriangle, ChevronRight, Edit3, Save, Printer, RotateCcw, DownloadCloud,
  ChevronDown, Globe, HardDrive, Server, FolderOpen, Search, Database, Network, Users,
  ArrowUpRight
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

interface ReturnsDashboardProps {
  onBack: () => void;
}

export default function ReturnsDashboard({ onBack }: ReturnsDashboardProps) {
  // Navigation & View States
  const [activeTab, setActiveTab] = useState<'working3b' | 'matrix' | 'ims2b' | 'gstr2b_downloader' | 'gstr1_downloader'>('working3b');
  const [selectedMonth, setSelectedMonth] = useState<GSTR3BMonthKey>('April');
  const [showQuickGuide, setShowQuickGuide] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Core Working Data State - Empty by default, no hardcoded practice data
  const [workingData, setWorkingData] = useState<GSTR3BAnnualWorking>(() => createEmptyAnnualWorking());
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

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
        portalJsonData = generateGstr3bPortalJson(currentMonthData, workingData.profile);
        const jsonBlob = new Blob([JSON.stringify(portalJsonData, null, 2)], { type: 'application/json' });
        const jsonUrl = URL.createObjectURL(jsonBlob);
        const jsonA = document.createElement('a');
        jsonA.href = jsonUrl;
        jsonA.download = `GSTR-3B_PORTAL_${safeFirm}_${selectedMonth.toUpperCase()}_${currentMonthData.year}_${dateTimeStamp}.json`;
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
    setWorkingData(prev => {
      return applyReturnsToAnnualWorking(prev, selectedMonth, gstr1, gstr2b);
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
    section: 'outward' | 'inward' | 'settlement',
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
      }

      return recalculateAnnualWorking(cloned);
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
    <div className="w-full max-w-7xl mx-auto space-y-4 pt-3 md:pt-4 pb-20 animate-fade-in">
      {/* Hidden file input for uploading CA Working .xlsx */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".xlsx,.xls"
        className="hidden"
      />

      {/* ─── 1. TOP HEADER (Right-shifted title with refined text size, Back button left) ─── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3 pt-1">
        <button
          onClick={onBack}
          className="text-slate-400 hover:text-white flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Hub
        </button>

        {/* Right-shifted Module Title with refined typography badge */}
        <div className="flex items-center gap-2.5 sm:ml-auto">
          <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold shrink-0">
            <Calculator className="w-4 h-4" />
          </div>
          <div className="text-left sm:text-right">
            <div className="flex items-center gap-2 justify-start sm:justify-end">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                04. Returns Preparation & Filing
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-medium border border-purple-500/30">
                GSTR-3B v2.0
              </span>
            </div>
            <p className="text-slate-400 text-[11px] font-medium hidden sm:block">
              Rule 88A set-off cascade, RCM cash liability & portal-ready filing
            </p>
          </div>
        </div>
      </div>

      {/* ─── 2. SERVER STORAGE & COMMAND CONTROL DECK ─── */}
      <div className="relative z-30 obsidian-card p-4 md:p-5 shadow-2xl backdrop-blur-md space-y-4">
        {/* Row A: Server Path (Top-Left) + Diagnostics (Top-Right) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs text-slate-400 pb-3 border-b border-slate-800/70">
          {/* Server Path Top Left */}
          <div className="flex items-center gap-2 min-w-0">
            <HardDrive className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="font-semibold text-slate-300 shrink-0">Server Storage:</span>
            <span
              className="font-mono text-[11px] text-slate-400 truncate max-w-xs sm:max-w-md select-all cursor-text bg-slate-950/80 px-2.5 py-0.5 rounded border border-slate-800"
              title={serverDataPath || 'Loading server path...'}
            >
              {serverDataPath || 'Loading server path...'}
            </span>
            <button
              type="button"
              onClick={() => {
                if (serverDataPath) {
                  navigator.clipboard.writeText(serverDataPath);
                  toast.success('Server path copied to clipboard!');
                }
              }}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Copy Server Path"
            >
              <Copy className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={handleOpenStorageFolder}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold transition-colors flex items-center gap-1"
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
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold transition-colors flex items-center gap-1"
              title="Change Server Data Path"
            >
              <Edit3 className="w-3 h-3 text-blue-400" /> Change
            </button>
          </div>

          {/* Diagnostics on Top Right */}
          <div className="flex items-center gap-3 text-[11px] font-mono shrink-0">
            <span className="flex items-center gap-1 text-slate-400">
              <Server className="w-3 h-3 text-purple-400" />
              {serverHost || 'localhost'}
              {serverIps.length > 0 && <span className="text-slate-500">({serverIps[0]})</span>}
            </span>
            <span>•</span>
            <span className="text-slate-300 font-semibold flex items-center gap-1">
              <Database className="w-3 h-3 text-cyan-400" />
              {storageStats.totalClientsWithData} on Disk
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
              LAN Active
            </span>
          </div>
        </div>

        {/* Row B: Client Selection (Top Left) & Vault/Launch/Upload Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Client Selection (Top Left) */}
          <div className="flex flex-wrap items-center gap-2 relative">
            {/* Universal Client Switcher Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsClientDropdownOpen(prev => !prev)}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-blue-950/40 hover:scale-[1.02]"
              >
                <Users className="w-3.5 h-3.5 text-blue-100" />
                <span>Switch Client ({clientsHub.length || vaultClients.length})</span>
                <ChevronDown className={`w-3.5 h-3.5 text-blue-200 transition-transform ${isClientDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Client Picker Dropdown Popover */}
              {isClientDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsClientDropdownOpen(false)}
                  />

                  <div className="absolute left-0 top-full mt-2 w-80 sm:w-96 bg-slate-950 border border-slate-700/80 rounded-2xl shadow-2xl p-3 z-50 animate-pop-in ring-1 ring-slate-700">
                    {/* Search box inside dropdown */}
                    <div className="relative mb-2">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={clientSearchQuery}
                        onChange={e => setClientSearchQuery(e.target.value)}
                        placeholder="Search client name or GSTIN..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500 transition-colors"
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
                                  ? 'bg-blue-600/15 border border-blue-500/40 text-blue-200'
                                  : 'hover:bg-slate-900 text-slate-300'
                              }`}
                            >
                              <div className="truncate min-w-0 flex-1">
                                <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
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

                    <div className="pt-2 mt-1 border-t border-slate-800/80 text-[11px] flex items-center justify-between">
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

            {/* Credentials Vault Button */}
            <button
              onClick={() => setShowCredentialsModal(true)}
              className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 transition-all hover:scale-[1.02]"
              title="Manage Portal Usernames & Passwords"
            >
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>Vault ({vaultClients.filter(c => c.portal_username && c.portal_password).length})</span>
            </button>

            {/* Launch Chrome & Fill Login Details Button */}
            <button
              onClick={handleLaunchPortalLogin}
              disabled={isLaunchingPortal}
              className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold flex items-center gap-1.5 transition-all hover:scale-[1.02] disabled:opacity-50"
              title="Launch visible Chrome & auto-fill GST Portal login credentials"
            >
              {isLaunchingPortal ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              ) : (
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
              )}
              <span>Launch Login</span>
            </button>

            {/* Upload Working .xlsx */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-slate-700 transition-all hover:scale-[1.02]"
              title="Upload external CA Excel working file"
            >
              <UploadCloud className="w-3.5 h-3.5 text-blue-400" /> Upload .xlsx
            </button>
          </div>

          {/* Server Sync Pill (Top-Right of row) */}
          <div className="flex items-center gap-2">
            {isSyncingToServer ? (
              <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[11px] font-semibold flex items-center gap-1.5 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin text-blue-400" /> Saving to Server...
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold flex items-center gap-1.5" title="All office PCs can open this client's latest saved data">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Synced to Server
              </span>
            )}
          </div>
        </div>

        {/* Row C: Selected Client Name (Prominently below client selection, as requested) */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2 px-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-blue-900/30 ring-2 ring-blue-500/20">
              <Building2 className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsClientDropdownOpen(prev => !prev)}
                  className="group text-base sm:text-lg font-extrabold text-white tracking-tight hover:text-blue-400 transition-colors flex items-center gap-2 text-left truncate max-w-full"
                  title="Click to Switch Client"
                >
                  <span className="truncate">
                    {workingData.profile.firmName || 'Select a Client to Begin'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-blue-400 shrink-0 transition-transform ${isClientDropdownOpen ? 'rotate-180 text-blue-300' : 'group-hover:translate-y-0.5'}`} />
                </button>

                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(true)}
                  className="text-slate-500 hover:text-slate-300 p-1 rounded-lg hover:bg-slate-800 transition-colors"
                  title="Edit client profile manually"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* GSTIN Pill */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5 font-medium">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-sans font-semibold">GSTIN:</span>
                <span className="font-mono text-blue-300 font-semibold">{workingData.profile.gstin || 'Not Specified'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Row D: Financial Year Selector & Save Working Button (Beside FY Selector, as requested) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          {/* Top-Left: FY Selector + SAVE BUTTON */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Financial Year Selector */}
            <div className="flex items-center gap-1 bg-slate-950/80 border border-slate-800 p-1 rounded-xl">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider px-2 font-sans font-semibold">FY:</span>
              {['2025-26', '2026-27'].map(fy => {
                const isSelected = normalizeFy(workingData.profile.financialYear || '2025-26') === fy;
                return (
                  <button
                    key={fy}
                    type="button"
                    onClick={() => handleFinancialYearChange(fy)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                      isSelected
                        ? 'bg-purple-600 text-white shadow-sm ring-1 ring-purple-400/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
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
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-950/50 transition-all hover:scale-[1.02] disabled:opacity-50 ring-1 ring-emerald-400/40"
              title="Save complete 3B Working Sheet to Server & Local Storage (Ctrl+S)"
            >
              {isSyncingToServer ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{isSyncingToServer ? 'Saving...' : 'Save Working'}</span>
              <kbd className="hidden sm:inline text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/60 font-mono text-emerald-200 border border-emerald-500/30">
                Ctrl+S
              </kbd>
            </button>
          </div>

          {/* Right: Export & Utility Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Export Excel */}
            <button
              onClick={handleExportExcel}
              className="px-3.5 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-950 transition-all hover:scale-[1.02]"
              title="Export complete 12-Month CA Working Sheet to Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
            </button>

            {/* Export PDF (Selected Month Working) */}
            <button
              onClick={handleExportPdf}
              className="px-3.5 py-1.5 bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-rose-950 transition-all hover:scale-[1.02]"
              title={`Export ${selectedMonth} ${currentMonthData.year} GSTR-3B Working to PDF`}
            >
              <FileText className="w-3.5 h-3.5" /> Export PDF ({selectedMonth.slice(0, 3)})
            </button>

            {/* Download JSON */}
            <button
              onClick={handleDownloadJson}
              className="px-3.5 py-1.5 bg-purple-600/90 hover:bg-purple-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-purple-950 transition-all hover:scale-[1.02]"
              title="Download GST Portal ready JSON file"
            >
              <Download className="w-3.5 h-3.5" /> Portal JSON
            </button>

            {/* Reset Sheet */}
            <button
              onClick={handleReset}
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 text-xs font-bold rounded-xl border border-rose-500/30 flex items-center gap-1.5 transition-all hover:scale-[1.02]"
              title="Clear all figures and reset sheet"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Sheet
            </button>
          </div>
        </div>
      </div>

      {/* Main Tab Bar */}
      <div className="flex flex-wrap gap-1.5 obsidian-card p-1.5 backdrop-blur-md shadow-lg">
        {[
          { id: 'working3b', label: '1. GSTR-3B Working Sheet', icon: Calculator },
          { id: 'matrix', label: '2. 12-Month FY Matrix', icon: Table },
          { id: 'ims2b', label: '3. GST IMS & 2B Manager (300+ Clients)', icon: Sparkles },
          { id: 'gstr2b_downloader', label: '4. GSTR-2B Downloader (Autopilot)', icon: DownloadCloud },
          { id: 'gstr1_downloader', label: '5. GSTR-1 Downloader (Autopilot)', icon: ArrowUpRight }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-900/40 ring-1 ring-blue-400/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-blue-200' : 'text-slate-400'}`} /> {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: GSTR-3B WORKING SHEET (THE CORE PRACTICE WORKSPACE) */}
      {activeTab === 'working3b' && (
        <div className="space-y-6 animate-pop-in">
          {/* Returns Auto-Pilot & Ingestion Deck (Full Auto-Mode) */}
          <ReturnsAutoIngestDeck
            selectedMonth={selectedMonth}
            financialYear={workingData.profile.financialYear || '2025-26'}
            onFinancialYearChange={handleFinancialYearChange}
            currentGstin={workingData.profile.gstin}
            currentFirmName={workingData.profile.firmName}
            currentMonthData={currentMonthData}
            workingData={workingData}
            onApplyIngestedReturns={handleApplyIngestedReturns}
            onClearMonthIngestion={handleClearMonthIngestion}
            onSaveWorking={handleManualSave}
            isSavingWorking={isSyncingToServer}
          />

          {/* Month Selector Pills */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider px-2">
              <Calendar className="w-4 h-4 text-purple-400" /> Select Filing Period:
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {GSTR3B_MONTHS.map(m => {
                const mData = workingData.months[m];
                const isSelected = selectedMonth === m;
                const hasCashPayable = mData.settlement.balancePayable.total > 0;
                const hasCreditCf = mData.setoff.balanceCfNextMonth.total > 0;

                return (
                  <button
                    key={m}
                    onClick={() => setSelectedMonth(m)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30 ring-2 ring-purple-400/30'
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {m.slice(0, 3)}
                    {hasCashPayable && (
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" title="Cash Tax Payable" />
                    )}
                    {hasCreditCf && !hasCashPayable && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" title="Credit Balance C/F" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* KPI Dashboard Cards for the Selected Month */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
            <div className="bg-slate-900/70 border border-slate-800/90 rounded-xl p-3.5 shadow-lg">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Gross Outward Sale</span>
              <p className="text-base md:text-lg font-extrabold text-white mt-1">
                {formatCur(currentMonthData.outward.totalSaleWorking.taxable)}
              </p>
              <span className="text-[10px] text-slate-400">Total Tax: {formatCur(currentMonthData.outward.totalSaleWorking.total)}</span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800/90 rounded-xl p-3.5 shadow-lg">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">2B Available ITC</span>
              <p className="text-base md:text-lg font-extrabold text-blue-300 mt-1">
                {formatCur(currentMonthData.inward.totalItcAvailable.total)}
              </p>
              <span className="text-[10px] text-slate-400">Opening B/F: {formatCur(currentMonthData.inward.openingCreditBal.total)}</span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800/90 rounded-xl p-3.5 shadow-lg">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Net Outward Tax</span>
              <p className="text-base md:text-lg font-extrabold text-amber-300 mt-1">
                {formatCur(currentMonthData.setoff.payableAfterAdjustment.total)}
              </p>
              <span className="text-[10px] text-slate-400">After ITC Set-off</span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800/90 rounded-xl p-3.5 shadow-lg">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Balance C/F Next Mo.</span>
              <p className="text-base md:text-lg font-extrabold text-emerald-300 mt-1">
                {formatCur(currentMonthData.setoff.balanceCfNextMonth.total)}
              </p>
              <span className="text-[10px] text-slate-400">Carried Forward Credit</span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800/90 rounded-xl p-3.5 shadow-lg">
              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">RCM Cash Liability</span>
              <p className="text-base md:text-lg font-extrabold text-rose-300 mt-1">
                {formatCur(currentMonthData.settlement.rcmPayable.total)}
              </p>
              <span className="text-[10px] text-rose-400/80">Sec 49(4) Cash Only</span>
            </div>

            <div className="bg-gradient-to-br from-slate-900 to-purple-950/40 border border-purple-500/30 rounded-xl p-3.5 shadow-lg">
              <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Total Cash Payable</span>
              <p className="text-base md:text-lg font-extrabold text-purple-200 mt-1">
                {formatCur(currentMonthData.settlement.balancePayable.total)}
              </p>
              <span className="text-[10px] text-purple-300/80">Final Cash Outflow</span>
            </div>
          </div>

          {/* THE MASTER GSTR-3B WORKING PAPER TABLE */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-400" />
                  GSTR-3B Working for the Month of {selectedMonth.toUpperCase()}-{currentMonthData.year}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Editable worksheet. All subtotals, inter-head set-off, and next-month forward balances recalculate automatically.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleExportPdf}
                  className="px-3 py-1.5 bg-gradient-to-r from-rose-600/30 to-pink-600/20 hover:from-rose-600/40 hover:to-pink-600/30 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-950/40 transition-all hover:scale-[1.02]"
                  title={`Export ${selectedMonth} ${currentMonthData.year} GSTR-3B Working to PDF`}
                >
                  <FileText className="w-3.5 h-3.5 text-rose-400" />
                  <span>Export {selectedMonth} Working (PDF)</span>
                </button>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Credit C/F</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> Cash Payable</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /> Portal Auto-Sum</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/90 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800 text-[11px]">
                    <th className="py-3 px-4 w-44">Section</th>
                    <th className="py-3 px-4">Particulars</th>
                    <th className="py-3 px-4 text-right w-36">Taxable Value</th>
                    <th className="py-3 px-4 text-right w-32">CGST</th>
                    <th className="py-3 px-4 text-right w-32">SGST</th>
                    <th className="py-3 px-4 text-right w-32">IGST</th>
                    <th className="py-3 px-4 text-right w-36">Total Tax</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {/* SECTION 1: OUTWARD SUPPLY */}
                  <tr className="bg-slate-950/40 font-sans font-bold text-blue-400">
                    <td colSpan={7} className="py-2.5 px-4 text-xs tracking-wider uppercase bg-blue-950/20 border-y border-blue-900/30">
                      1. Outward Supply (Table 3.1 & 3.2)
                    </td>
                  </tr>

                  {[
                    { key: 'b2b', label: 'Sales (B2B)' },
                    { key: 'b2c', label: 'Sales (B2C)' },
                    { key: 'sezWithPayment', label: 'SEZ supply with payment' },
                    { key: 'sezWithoutPayment', label: 'SEZ supply without-payment' },
                    { key: 'zeroRated', label: 'Zero Rated Supply/Export Sale' },
                    { key: 'nilRated', label: 'Nil Rated Supply' },
                    { key: 'exempt', label: 'Exempt Sale' },
                    { key: 'advanceReceived', label: 'Advances Collected for Services' },
                    { key: 'rentReceived', label: 'Rent Received' },
                    { key: 'saleIncreaseAmendment', label: 'Sale Increased through Amendment' },
                    { key: 'saleDecreaseAmendment', label: '(-) Sale Decreased through Amendment' },
                    { key: 'creditNote', label: '(-) Credit Note' },
                    { key: 'advanceAdjusted', label: '(-) Advances Settled Against Services' }
                  ].map(({ key, label }) => {
                    const rowData = ((currentMonthData.outward as any)[key] as TaxBreakdown) || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
                    return (
                      <tr key={key} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 px-4 text-slate-400 font-sans text-xs">Outward Supply</td>
                        <td className="py-2 px-4 text-white font-sans font-medium text-xs">{label}</td>
                        <td className="py-2 px-4 text-right">
                          <input
                            type="number"
                            value={rowData.taxable || ''}
                            placeholder="0"
                            onChange={e => updateCurrentMonthField('outward', key, 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-full bg-transparent text-right font-mono text-slate-300 hover:text-white focus:bg-slate-800 focus:text-white px-1.5 py-0.5 rounded outline-none"
                          />
                        </td>
                        <td className="py-2 px-4 text-right">
                          <input
                            type="number"
                            value={rowData.cgst || ''}
                            placeholder="0"
                            onChange={e => updateCurrentMonthField('outward', key, 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-full bg-transparent text-right font-mono text-slate-300 hover:text-white focus:bg-slate-800 focus:text-white px-1.5 py-0.5 rounded outline-none"
                          />
                        </td>
                        <td className="py-2 px-4 text-right">
                          <input
                            type="number"
                            value={rowData.sgst || ''}
                            placeholder="0"
                            onChange={e => updateCurrentMonthField('outward', key, 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-full bg-transparent text-right font-mono text-slate-300 hover:text-white focus:bg-slate-800 focus:text-white px-1.5 py-0.5 rounded outline-none"
                          />
                        </td>
                        <td className="py-2 px-4 text-right">
                          <input
                            type="number"
                            value={rowData.igst || ''}
                            placeholder="0"
                            onChange={e => updateCurrentMonthField('outward', key, 'igst', parseFloat(e.target.value) || 0)}
                            className="w-full bg-transparent text-right font-mono text-slate-300 hover:text-white focus:bg-slate-800 focus:text-white px-1.5 py-0.5 rounded outline-none"
                          />
                        </td>
                        <td className="py-2 px-4 text-right font-bold text-slate-200">
                          {formatCur(rowData.total)}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Total Sale as per Working */}
                  <tr className="bg-slate-800/80 font-bold border-y border-slate-700">
                    <td className="py-2.5 px-4 text-slate-400 font-sans">Subtotal</td>
                    <td className="py-2.5 px-4 text-white font-sans text-xs">Total Sale as per Working</td>
                    <td className="py-2.5 px-4 text-right text-emerald-400">{formatCur(currentMonthData.outward.totalSaleWorking.taxable)}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-400">{formatCur(currentMonthData.outward.totalSaleWorking.cgst)}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-400">{formatCur(currentMonthData.outward.totalSaleWorking.sgst)}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-400">{formatCur(currentMonthData.outward.totalSaleWorking.igst)}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-400 font-extrabold">{formatCur(currentMonthData.outward.totalSaleWorking.total)}</td>
                  </tr>

                  {/* 4-Part RCM Breakdown */}
                  {[
                    { key: 'rcmTransport', label: 'RCM on Transport Charges 5%' },
                    { key: 'rcmSecurity', label: 'RCM on Security Charges 18%' },
                    { key: 'rcmGuestHouse', label: 'RCM on Guest House Charges 18%' },
                    { key: 'rcmAdvocate', label: 'RCM on Advocate Charges 18%' },
                  ].map(({ key, label }) => {
                    const rowData = ((currentMonthData.outward as any)[key] as TaxBreakdown) || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
                    return (
                      <tr key={key} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 px-4 text-slate-400 font-sans text-xs">Inward RCM</td>
                        <td className="py-2 px-4 text-amber-200/90 font-sans font-medium text-xs pl-6">{label}</td>
                        <td className="py-2 px-4 text-right">
                          <input
                            type="number"
                            value={rowData.taxable || ''}
                            placeholder="0"
                            onChange={e => updateCurrentMonthField('outward', key, 'taxable', parseFloat(e.target.value) || 0)}
                            className="w-full bg-transparent text-right font-mono text-amber-200 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                          />
                        </td>
                        <td className="py-2 px-4 text-right">
                          <input
                            type="number"
                            value={rowData.cgst || ''}
                            placeholder="0"
                            onChange={e => updateCurrentMonthField('outward', key, 'cgst', parseFloat(e.target.value) || 0)}
                            className="w-full bg-transparent text-right font-mono text-amber-200 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                          />
                        </td>
                        <td className="py-2 px-4 text-right">
                          <input
                            type="number"
                            value={rowData.sgst || ''}
                            placeholder="0"
                            onChange={e => updateCurrentMonthField('outward', key, 'sgst', parseFloat(e.target.value) || 0)}
                            className="w-full bg-transparent text-right font-mono text-amber-200 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                          />
                        </td>
                        <td className="py-2 px-4 text-right">
                          <input
                            type="number"
                            value={rowData.igst || ''}
                            placeholder="0"
                            onChange={e => updateCurrentMonthField('outward', key, 'igst', parseFloat(e.target.value) || 0)}
                            className="w-full bg-transparent text-right font-mono text-amber-200 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                          />
                        </td>
                        <td className="py-2 px-4 text-right font-bold text-amber-200">
                          {formatCur(rowData.total)}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Reverse Charge on Inward Supplies Subtotal */}
                  <tr className="bg-amber-950/20 font-semibold border-y border-amber-900/40">
                    <td className="py-2 px-4 text-amber-400 font-sans text-xs">Inward RCM</td>
                    <td className="py-2 px-4 text-amber-300 font-sans font-bold text-xs">
                      Reverse Charge on Inward Supplies (Table 3.1(d))
                    </td>
                    <td className="py-2 px-4 text-right text-amber-300 font-mono font-bold">
                      {formatCur(currentMonthData.outward.rcmInward.taxable)}
                    </td>
                    <td className="py-2 px-4 text-right text-amber-300 font-mono font-bold">
                      {formatCur(currentMonthData.outward.rcmInward.cgst)}
                    </td>
                    <td className="py-2 px-4 text-right text-amber-300 font-mono font-bold">
                      {formatCur(currentMonthData.outward.rcmInward.sgst)}
                    </td>
                    <td className="py-2 px-4 text-right text-amber-300 font-mono font-bold">
                      {formatCur(currentMonthData.outward.rcmInward.igst)}
                    </td>
                    <td className="py-2 px-4 text-right font-extrabold text-amber-300">
                      {formatCur(currentMonthData.outward.rcmInward.total)}
                    </td>
                  </tr>

                  {/* (A) Total Sale as per Working including Reverse Charge */}
                  <tr className="bg-blue-950/30 font-bold border-b-2 border-blue-900/50">
                    <td className="py-2.5 px-4 text-blue-400 font-sans">Total (A)</td>
                    <td className="py-2.5 px-4 text-white font-sans text-xs">(A) Total Sale as per Working including Reverse Charge (Table 3.1)</td>
                    <td className="py-2.5 px-4 text-right text-blue-300">{formatCur(currentMonthData.outward.totalSalePortal.taxable)}</td>
                    <td className="py-2.5 px-4 text-right text-blue-300">{formatCur(currentMonthData.outward.totalSalePortal.cgst)}</td>
                    <td className="py-2.5 px-4 text-right text-blue-300">{formatCur(currentMonthData.outward.totalSalePortal.sgst)}</td>
                    <td className="py-2.5 px-4 text-right text-blue-300">{formatCur(currentMonthData.outward.totalSalePortal.igst)}</td>
                    <td className="py-2.5 px-4 text-right text-blue-300 font-extrabold">{formatCur(currentMonthData.outward.totalSalePortal.total)}</td>
                  </tr>

                  {/* SECTION 2: INWARD SUPPLIES & ITC */}
                  <tr className="bg-slate-950/40 font-sans font-bold text-emerald-400">
                    <td colSpan={7} className="py-2.5 px-4 text-xs tracking-wider uppercase bg-emerald-950/20 border-y border-emerald-900/30">
                      2. Inward Supplies & Input Tax Credit (Table 4)
                    </td>
                  </tr>

                  {/* ITC (As per books) */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-4 text-slate-400 font-sans text-xs">Books Register</td>
                    <td className="py-2 px-4 text-slate-300 font-sans font-medium text-xs">ITC (As per books)</td>
                    <td className="py-2 px-4 text-right text-slate-500">-</td>
                    <td className="py-2 px-4 text-right text-slate-500">-</td>
                    <td className="py-2 px-4 text-right text-slate-500">-</td>
                    <td className="py-2 px-4 text-right text-slate-500">-</td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.itcBooks || ''}
                        placeholder="0"
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0;
                          setWorkingData(prev => {
                            const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
                            cloned.months[selectedMonth].inward.itcBooks = val;
                            return cloned;
                          });
                        }}
                        className="w-full bg-transparent text-right font-mono text-slate-300 hover:text-white focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                  </tr>

                  {/* ITC as per GSTR 2B */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-4 text-slate-400 font-sans text-xs">GSTR-2B</td>
                    <td className="py-2 px-4 text-emerald-300 font-sans font-medium text-xs">ITC as per GSTR 2B (Table 4(A)(5))</td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.itc2b.taxable || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'itc2b', 'taxable', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-emerald-200 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.itc2b.cgst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'itc2b', 'cgst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-emerald-200 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.itc2b.sgst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'itc2b', 'sgst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-emerald-200 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.itc2b.igst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'itc2b', 'igst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-emerald-200 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right font-bold text-emerald-300">
                      {formatCur(currentMonthData.inward.itc2b.total)}
                    </td>
                  </tr>

                  {/* (+) Import purchase (Table 4(A)(1)) */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-4 text-slate-400 font-sans text-xs">Imports</td>
                    <td className="py-2 px-4 text-white font-sans font-medium text-xs">(+) Import purchase (Table 4(A)(1))</td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.importGoods?.taxable || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'importGoods', 'taxable', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-slate-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right text-slate-500">-</td>
                    <td className="py-2 px-4 text-right text-slate-500">-</td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.importGoods?.igst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'importGoods', 'igst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-slate-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right font-bold text-slate-200">
                      {formatCur(currentMonthData.inward.importGoods?.total || 0)}
                    </td>
                  </tr>

                  {/* (+) RCM paid on Inward Supplies */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-4 text-slate-400 font-sans text-xs">Eligible RCM</td>
                    <td className="py-2 px-4 text-white font-sans font-medium text-xs">(+) RCM paid on Inward Supplies (Table 4(A)(3))</td>
                    <td className="py-2 px-4 text-right text-slate-400">{formatCur(currentMonthData.inward.rcmPaid.taxable)}</td>
                    <td className="py-2 px-4 text-right text-slate-300">{formatCur(currentMonthData.inward.rcmPaid.cgst)}</td>
                    <td className="py-2 px-4 text-right text-slate-300">{formatCur(currentMonthData.inward.rcmPaid.sgst)}</td>
                    <td className="py-2 px-4 text-right text-slate-300">{formatCur(currentMonthData.inward.rcmPaid.igst)}</td>
                    <td className="py-2 px-4 text-right font-bold text-slate-200">{formatCur(currentMonthData.inward.rcmPaid.total)}</td>
                  </tr>

                  {/* (+) Credit Notes */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-4 text-slate-400 font-sans text-xs">Credit Notes</td>
                    <td className="py-2 px-4 text-white font-sans font-medium text-xs">(+) Credit Notes</td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.creditNotes?.taxable || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'creditNotes', 'taxable', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-slate-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.creditNotes?.cgst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'creditNotes', 'cgst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-slate-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.creditNotes?.sgst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'creditNotes', 'sgst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-slate-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.creditNotes?.igst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'creditNotes', 'igst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-slate-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right font-bold text-slate-200">
                      {formatCur(currentMonthData.inward.creditNotes?.total || 0)}
                    </td>
                  </tr>

                  {/* (+) Opening Credit Bal. */}
                  <tr className="bg-purple-950/20 font-medium">
                    <td className="py-2 px-4 text-purple-400 font-sans text-xs">Opening ITC</td>
                    <td className="py-2 px-4 text-purple-200 font-sans text-xs flex items-center gap-1.5">
                      (+) Opening Credit Balance (B/F from previous month)
                      {selectedMonth !== 'April' && (
                        <span className="text-[10px] text-purple-400 font-sans italic">(Auto-chained)</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right text-slate-500">-</td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.openingCreditBal.cgst || ''}
                        disabled={selectedMonth !== 'April'}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'openingCreditBal', 'cgst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-purple-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none disabled:opacity-80"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.openingCreditBal.sgst || ''}
                        disabled={selectedMonth !== 'April'}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'openingCreditBal', 'sgst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-purple-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none disabled:opacity-80"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.openingCreditBal.igst || ''}
                        disabled={selectedMonth !== 'April'}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'openingCreditBal', 'igst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-purple-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none disabled:opacity-80"
                      />
                    </td>
                    <td className="py-2 px-4 text-right font-bold text-purple-300">{formatCur(currentMonthData.inward.openingCreditBal.total)}</td>
                  </tr>

                  {/* (-) Debit Notes */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-4 text-slate-400 font-sans text-xs">Debit Notes</td>
                    <td className="py-2 px-4 text-white font-sans font-medium text-xs">(-) Debit Notes</td>
                    <td className="py-2 px-4 text-right text-slate-500">-</td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.debitNotes.cgst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'debitNotes', 'cgst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-slate-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.debitNotes.sgst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'debitNotes', 'sgst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-slate-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.debitNotes.igst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'debitNotes', 'igst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-slate-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right font-bold text-slate-300">{formatCur(currentMonthData.inward.debitNotes.total)}</td>
                  </tr>

                  {/* (-) ITC Reversed on Ineligible credit */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-4 text-slate-400 font-sans text-xs">Reversals</td>
                    <td className="py-2 px-4 text-rose-300 font-sans font-medium text-xs">
                      (-) ITC Reversed on Ineligible credit (Table 4(B) / 17(5))
                    </td>
                    <td className="py-2 px-4 text-right text-slate-500">-</td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.itcReversed.cgst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'itcReversed', 'cgst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-rose-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.itcReversed.sgst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'itcReversed', 'sgst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-rose-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.inward.itcReversed.igst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('inward', 'itcReversed', 'igst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-rose-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right font-bold text-rose-300">{formatCur(currentMonthData.inward.itcReversed.total)}</td>
                  </tr>

                  {/* Total ITC Available for Set off */}
                  <tr className="bg-emerald-950/30 font-bold border-b-2 border-emerald-900/50">
                    <td className="py-2.5 px-4 text-emerald-400 font-sans">Total (B)</td>
                    <td className="py-2.5 px-4 text-white font-sans text-xs">(B) Total ITC Available for Set off</td>
                    <td className="py-2.5 px-4 text-right text-slate-500">-</td>
                    <td className="py-2.5 px-4 text-right text-emerald-300">{formatCur(currentMonthData.inward.totalItcAvailable.cgst)}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-300">{formatCur(currentMonthData.inward.totalItcAvailable.sgst)}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-300">{formatCur(currentMonthData.inward.totalItcAvailable.igst)}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-300 font-extrabold">{formatCur(currentMonthData.inward.totalItcAvailable.total)}</td>
                  </tr>

                  {/* SECTION 3: SET-OFF & UTILIZATION */}
                  <tr className="bg-slate-950/40 font-sans font-bold text-amber-400">
                    <td colSpan={7} className="py-2.5 px-4 text-xs tracking-wider uppercase bg-amber-950/20 border-y border-amber-900/30">
                      3. Statutory Set-off & Utilization (Table 6.1)
                    </td>
                  </tr>

                  {/* Payable / Difference */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-4 text-slate-400 font-sans text-xs">Raw Set-off</td>
                    <td className="py-2 px-4 text-white font-sans font-medium text-xs">(A-B) Payable / (Surplus ITC)</td>
                    <td className="py-2 px-4 text-right text-slate-500">-</td>
                    <td className={`py-2 px-4 text-right ${currentMonthData.setoff.rawPayable.cgst > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                      {formatCur(currentMonthData.setoff.rawPayable.cgst)}
                    </td>
                    <td className={`py-2 px-4 text-right ${currentMonthData.setoff.rawPayable.sgst > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                      {formatCur(currentMonthData.setoff.rawPayable.sgst)}
                    </td>
                    <td className={`py-2 px-4 text-right ${currentMonthData.setoff.rawPayable.igst > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                      {formatCur(currentMonthData.setoff.rawPayable.igst)}
                    </td>
                    <td className={`py-2 px-4 text-right font-bold ${currentMonthData.setoff.rawPayable.total > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                      {formatCur(currentMonthData.setoff.rawPayable.total)}
                    </td>
                  </tr>

                  {/* (-) Adjustment */}
                  <tr className="bg-slate-950/30 hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-4 text-slate-400 font-sans text-xs">Inter-Head</td>
                    <td className="py-2 px-4 text-blue-300 font-sans font-medium text-xs">
                      (-) Adjustment (Rule 88A IGST set-off vs CGST/SGST)
                    </td>
                    <td className="py-2 px-4 text-right text-slate-500">-</td>
                    <td className="py-2 px-4 text-right text-blue-300">{formatCur(currentMonthData.setoff.adjustment.cgst)}</td>
                    <td className="py-2 px-4 text-right text-blue-300">{formatCur(currentMonthData.setoff.adjustment.sgst)}</td>
                    <td className="py-2 px-4 text-right text-blue-300">{formatCur(currentMonthData.setoff.adjustment.igst)}</td>
                    <td className="py-2 px-4 text-right text-blue-300 font-bold">{formatCur(currentMonthData.setoff.adjustment.total)}</td>
                  </tr>

                  {/* (-) GST TDS/TCS Opening Cash Balance */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-4 text-purple-400 font-sans text-xs">TDS/TCS Cash</td>
                    <td className="py-2 px-4 text-purple-300 font-sans font-medium text-xs">
                      (-) GST TDS/TCS Opening Cash Balance
                    </td>
                    <td className="py-2 px-4 text-right text-slate-500">-</td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.settlement.tdsTcsOpeningCash?.cgst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('settlement', 'tdsTcsOpeningCash', 'cgst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-purple-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.settlement.tdsTcsOpeningCash?.sgst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('settlement', 'tdsTcsOpeningCash', 'sgst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-purple-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.settlement.tdsTcsOpeningCash?.igst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('settlement', 'tdsTcsOpeningCash', 'igst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-purple-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right font-bold text-purple-300">
                      {formatCur(currentMonthData.settlement.tdsTcsOpeningCash?.total || 0)}
                    </td>
                  </tr>

                  {/* Final Liability Payable */}
                  <tr className="bg-amber-950/30 font-bold">
                    <td className="py-2.5 px-4 text-amber-400 font-sans">Outward Cash</td>
                    <td className="py-2.5 px-4 text-amber-200 font-sans text-xs">Final Liability Payable</td>
                    <td className="py-2.5 px-4 text-right text-slate-500">-</td>
                    <td className="py-2.5 px-4 text-right text-amber-300">{formatCur(currentMonthData.setoff.payableAfterAdjustment.cgst)}</td>
                    <td className="py-2.5 px-4 text-right text-amber-300">{formatCur(currentMonthData.setoff.payableAfterAdjustment.sgst)}</td>
                    <td className="py-2.5 px-4 text-right text-amber-300">{formatCur(currentMonthData.setoff.payableAfterAdjustment.igst)}</td>
                    <td className="py-2.5 px-4 text-right text-amber-300 font-extrabold">{formatCur(currentMonthData.setoff.payableAfterAdjustment.total)}</td>
                  </tr>

                  {/* Balance C/f to next month */}
                  <tr className="bg-emerald-950/20 font-bold border-b-2 border-emerald-900/40">
                    <td className="py-2.5 px-4 text-emerald-400 font-sans">Credit C/F</td>
                    <td className="py-2.5 px-4 text-emerald-300 font-sans text-xs">
                      Balance C/f to next month (Surplus ITC)
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-500">-</td>
                    <td className="py-2.5 px-4 text-right text-emerald-400">{formatCur(currentMonthData.setoff.balanceCfNextMonth.cgst)}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-400">{formatCur(currentMonthData.setoff.balanceCfNextMonth.sgst)}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-400">{formatCur(currentMonthData.setoff.balanceCfNextMonth.igst)}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-400 font-extrabold">{formatCur(currentMonthData.setoff.balanceCfNextMonth.total)}</td>
                  </tr>

                  {/* SECTION 4: CASH SETTLEMENT */}
                  <tr className="bg-slate-950/40 font-sans font-bold text-rose-400">
                    <td colSpan={7} className="py-2.5 px-4 text-xs tracking-wider uppercase bg-rose-950/20 border-y border-rose-900/30">
                      4. Mandatory Cash Payments & Final Balance
                    </td>
                  </tr>

                  {/* RCM Payable */}
                  <tr className="bg-rose-950/10 hover:bg-rose-950/20 transition-colors">
                    <td className="py-2 px-4 text-rose-400 font-sans text-xs">Sec 49(4)</td>
                    <td className="py-2 px-4 text-rose-300 font-sans font-medium text-xs">
                      RCM Payable (Cannot use ITC — Cash Payment Only)
                    </td>
                    <td className="py-2 px-4 text-right text-slate-500">-</td>
                    <td className="py-2 px-4 text-right text-rose-300">{formatCur(currentMonthData.settlement.rcmPayable.cgst)}</td>
                    <td className="py-2 px-4 text-right text-rose-300">{formatCur(currentMonthData.settlement.rcmPayable.sgst)}</td>
                    <td className="py-2 px-4 text-right text-rose-300">{formatCur(currentMonthData.settlement.rcmPayable.igst)}</td>
                    <td className="py-2 px-4 text-right font-bold text-rose-300">{formatCur(currentMonthData.settlement.rcmPayable.total)}</td>
                  </tr>

                  {/* Late Fees */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-4 text-slate-400 font-sans text-xs">Statutory</td>
                    <td className="py-2 px-4 text-slate-300 font-sans font-medium text-xs">Late Fees</td>
                    <td className="py-2 px-4 text-right text-slate-500">-</td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.settlement.lateFees.cgst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('settlement', 'lateFees', 'cgst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-slate-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.settlement.lateFees.sgst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('settlement', 'lateFees', 'sgst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-slate-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right text-slate-500">-</td>
                    <td className="py-2 px-4 text-right font-bold text-slate-300">{formatCur(currentMonthData.settlement.lateFees.total)}</td>
                  </tr>

                  {/* Interest */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-4 text-slate-400 font-sans text-xs">Statutory</td>
                    <td className="py-2 px-4 text-slate-300 font-sans font-medium text-xs">Interest (Sec 50)</td>
                    <td className="py-2 px-4 text-right text-slate-500">-</td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.settlement.interest.cgst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('settlement', 'interest', 'cgst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-slate-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.settlement.interest.sgst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('settlement', 'interest', 'sgst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-slate-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.settlement.interest.igst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('settlement', 'interest', 'igst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-slate-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right font-bold text-slate-300">{formatCur(currentMonthData.settlement.interest.total)}</td>
                  </tr>

                  {/* GST Paid through Cash (Challan) */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-4 text-slate-400 font-sans text-xs">Challan</td>
                    <td className="py-2 px-4 text-emerald-300 font-sans font-medium text-xs">(-) GST Paid through Cash (PMT-06 / Challan)</td>
                    <td className="py-2 px-4 text-right text-slate-500">-</td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.settlement.gstPaidThroughCash.cgst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('settlement', 'gstPaidThroughCash', 'cgst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-emerald-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.settlement.gstPaidThroughCash.sgst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('settlement', 'gstPaidThroughCash', 'sgst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-emerald-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={currentMonthData.settlement.gstPaidThroughCash.igst || ''}
                        placeholder="0"
                        onChange={e => updateCurrentMonthField('settlement', 'gstPaidThroughCash', 'igst', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-right font-mono text-emerald-300 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-right font-bold text-emerald-300">{formatCur(currentMonthData.settlement.gstPaidThroughCash.total)}</td>
                  </tr>

                  {/* FINAL BALANCE PAYABLE IF ANY */}
                  <tr className="bg-purple-950/50 font-bold text-white border-t-2 border-purple-500/60 text-sm">
                    <td className="py-3 px-4 text-purple-300 font-sans font-extrabold uppercase">Final Settlement</td>
                    <td className="py-3 px-4 text-purple-200 font-sans font-extrabold">
                      Balance Payable if any (Cash Outflow)
                    </td>
                    <td className="py-3 px-4 text-right text-slate-500">-</td>
                    <td className="py-3 px-4 text-right text-purple-200">{formatCur(currentMonthData.settlement.balancePayable.cgst)}</td>
                    <td className="py-3 px-4 text-right text-purple-200">{formatCur(currentMonthData.settlement.balancePayable.sgst)}</td>
                    <td className="py-3 px-4 text-right text-purple-200">{formatCur(currentMonthData.settlement.balancePayable.igst)}</td>
                    <td className="py-3 px-4 text-right text-purple-300 font-black text-base">{formatCur(currentMonthData.settlement.balancePayable.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: 12-MONTH FINANCIAL YEAR MATRIX */}
      {activeTab === 'matrix' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4 animate-pop-in">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Table className="w-5 h-5 text-emerald-400" />
                Annual 12-Month Cross-Table ({workingData.profile.financialYear})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Full-year breakdown showing monthly outward liabilities, ITC claimed, balance carried forward, and cash taxes.
              </p>
            </div>
            <button
              onClick={handleExportExcel}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-md shadow-emerald-950"
            >
              <FileSpreadsheet className="w-4 h-4" /> Export Complete 12-Month Workbook
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse font-mono">
              <thead>
                <tr className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
                  <th className="py-3 px-3 w-52 font-sans">Particulars</th>
                  {GSTR3B_MONTHS.map(m => (
                    <th key={m} className="py-3 px-2 text-right w-28 font-sans">{m.slice(0, 3)}</th>
                  ))}
                  <th className="py-3 px-3 text-right w-36 font-sans text-emerald-400">Total FY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {/* 1. Taxable Turnover */}
                <tr className="bg-slate-800/40 font-bold text-white">
                  <td className="py-2.5 px-3 font-sans">Gross Taxable Turnover</td>
                  {GSTR3B_MONTHS.map(m => (
                    <td key={m} className="py-2.5 px-2 text-right">
                      {formatCur(workingData.months[m].outward.totalSaleWorking.taxable)}
                    </td>
                  ))}
                  <td className="py-2.5 px-3 text-right text-emerald-400 font-extrabold">
                    {formatCur(GSTR3B_MONTHS.reduce((acc, m) => acc + workingData.months[m].outward.totalSaleWorking.taxable, 0))}
                  </td>
                </tr>

                {/* 2. Total Outward Tax */}
                <tr className="hover:bg-slate-800/30">
                  <td className="py-2 px-3 text-slate-300 font-sans">Outward Tax Liability</td>
                  {GSTR3B_MONTHS.map(m => (
                    <td key={m} className="py-2 px-2 text-right text-slate-200">
                      {formatCur(workingData?.months?.[m]?.outward?.totalSaleWorking?.total || 0)}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right text-slate-200 font-bold">
                    {formatCur(GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData?.months?.[m]?.outward?.totalSaleWorking?.total || 0), 0))}
                  </td>
                </tr>

                {/* 3. Total Available ITC */}
                <tr className="bg-blue-950/20 hover:bg-blue-950/30 font-medium">
                  <td className="py-2 px-3 text-blue-300 font-sans">Total Available ITC (Table 4)</td>
                  {GSTR3B_MONTHS.map(m => (
                    <td key={m} className="py-2 px-2 text-right text-blue-300">
                      {formatCur(workingData?.months?.[m]?.inward?.totalItcAvailable?.total || 0)}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right text-blue-300 font-bold">
                    {formatCur(GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData?.months?.[m]?.inward?.totalItcAvailable?.total || 0), 0))}
                  </td>
                </tr>

                {/* 4. Balance C/F to Next Month */}
                <tr className="bg-emerald-950/20 hover:bg-emerald-950/30 font-semibold text-emerald-300">
                  <td className="py-2 px-3 font-sans">Balance C/F (Surplus Credit)</td>
                  {GSTR3B_MONTHS.map(m => (
                    <td key={m} className="py-2 px-2 text-right">
                      {formatCur(workingData?.months?.[m]?.setoff?.balanceCfNextMonth?.total || 0)}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-bold text-emerald-400">
                    {/* Final closing balance of March */}
                    {formatCur(workingData?.months?.March?.setoff?.balanceCfNextMonth?.total || 0)} (Mar End)
                  </td>
                </tr>

                {/* 5. Net Outward Tax Paid via Cash */}
                <tr className="hover:bg-slate-800/30 text-amber-300">
                  <td className="py-2 px-3 font-sans">Outward Tax Paid via Cash</td>
                  {GSTR3B_MONTHS.map(m => (
                    <td key={m} className="py-2 px-2 text-right">
                      {formatCur(workingData?.months?.[m]?.setoff?.payableAfterAdjustment?.total || 0)}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-bold">
                    {formatCur(GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData?.months?.[m]?.setoff?.payableAfterAdjustment?.total || 0), 0))}
                  </td>
                </tr>

                {/* 6. RCM Cash Paid */}
                <tr className="hover:bg-slate-800/30 text-rose-300">
                  <td className="py-2 px-3 font-sans">RCM Cash Paid (Sec 49(4))</td>
                  {GSTR3B_MONTHS.map(m => (
                    <td key={m} className="py-2 px-2 text-right">
                      {formatCur(workingData?.months?.[m]?.settlement?.rcmPayable?.total || 0)}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-bold">
                    {formatCur(GSTR3B_MONTHS.reduce((acc, m) => acc + (workingData?.months?.[m]?.settlement?.rcmPayable?.total || 0), 0))}
                  </td>
                </tr>

                {/* 7. Total Cash Outflow */}
                <tr className="bg-purple-950/40 font-bold text-white text-xs border-t-2 border-purple-500/50">
                  <td className="py-3 px-3 font-sans text-purple-300 font-extrabold uppercase">Total Cash Outflow</td>
                  {GSTR3B_MONTHS.map(m => (
                    <td key={m} className="py-3 px-2 text-right text-purple-200">
                      {formatCur(workingData.months[m].settlement.balancePayable.total)}
                    </td>
                  ))}
                  <td className="py-3 px-3 text-right text-purple-300 font-black text-sm">
                    {formatCur(GSTR3B_MONTHS.reduce((acc, m) => acc + workingData.months[m].settlement.balancePayable.total, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: GST IMS & 2B MANAGER (300+ CLIENTS) */}
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
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
