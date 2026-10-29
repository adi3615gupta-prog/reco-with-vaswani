import React, { useState, useEffect, useRef } from 'react';
import {
  Settings, Database, Server, RefreshCw, Check, Copy, FolderOpen,
  X, CheckCircle2, AlertTriangle, HardDrive, Laptop, Sparkles, Sliders,
  Key, Mail, ShieldAlert, Send, Eye, EyeOff, Building2, Search, Download,
  FileSpreadsheet, ExternalLink, Trash2, ShieldCheck, CheckCheck, SlidersHorizontal,
  RotateCcw, Bot, CloudDownload, CloudUpload, Globe
} from 'lucide-react';
import { toast } from 'sonner';
import { pingTally, fetchCompanyInfo } from '@/lib/tallyApi';
import { safeApiFetch } from '@/lib/api';
import { parseCredentialsImportExcel, generateCredentialsTemplateExcel } from '@/lib/imsEngine';
import { getGeminiStatus, saveGeminiApiKey, sendChatMessage, syncGeminiFromCloud, pushGeminiToCloud } from '@/lib/geminiApi';
import { Switch } from '@/components/ui/switch';

export interface VaultClient {
  id: string;
  gstin: string;
  trade_name: string;
  legal_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  portal_username?: string;
  portal_password?: string;
}

export type SettingsTabKey = 'storage' | 'tally' | 'credentials' | 'reco' | 'gateway' | 'appearance' | 'ai';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTabKey;
}

export function SettingsModal({ isOpen, onClose, initialTab = 'storage' }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabKey>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  // ─── 1. STORAGE / DATA PATH STATE ───
  const [currentDataPath, setCurrentDataPath] = useState<string>('');
  const [newPathInput, setNewPathInput] = useState<string>('');
  const [serverHost, setServerHost] = useState<string>('');
  const [serverIps, setServerIps] = useState<string[]>([]);
  const [storageStatus, setStorageStatus] = useState<{ exists?: boolean; isWritable?: boolean }>({});
  const [isLoadingStorage, setIsLoadingStorage] = useState(false);
  const [isSavingStorage, setIsSavingStorage] = useState(false);
  const [isBrowsingStorage, setIsBrowsingStorage] = useState(false);

  // ─── 2. TALLY BRIDGE STATE ───
  const [tallyHost, setTallyHost] = useState<string>('localhost');
  const [tallyPort, setTallyPort] = useState<number>(() => {
    const saved = localStorage.getItem('np_tally_port');
    return saved ? parseInt(saved, 10) : 9000;
  });
  const [isTestingTally, setIsTestingTally] = useState(false);
  const [tallyStatus, setTallyStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [tallyCompany, setTallyCompany] = useState<string>('');

  // ─── 3. CREDENTIALS VAULT STATE ───
  const [vaultClients, setVaultClients] = useState<VaultClient[]>([]);
  const [loadingVault, setLoadingVault] = useState(false);
  const [vaultSearch, setVaultSearch] = useState('');
  const [vaultFilter, setVaultFilter] = useState<'ALL' | 'CONFIGURED' | 'MISSING'>('ALL');
  const [editedCredentials, setEditedCredentials] = useState<Record<string, Partial<VaultClient>>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [savingGstin, setSavingGstin] = useState<string | null>(null);
  const [deletingGstin, setDeletingGstin] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── 4. RECO RULES & TOLERANCE STATE ───
  const [tolerance, setTolerance] = useState<number>(() => {
    const saved = localStorage.getItem('np_reco_tolerance');
    return saved ? parseFloat(saved) : 2;
  });
  const [fuzzyStrictness, setFuzzyStrictness] = useState<'high' | 'medium' | 'low'>(() => {
    const saved = localStorage.getItem('np_reco_fuzzy');
    return (saved as any) || 'high';
  });
  const [section164Cutoff, setSection164Cutoff] = useState<boolean>(() => {
    return localStorage.getItem('np_reco_sec164') !== 'false';
  });
  const [rule88aCascade, setRule88aCascade] = useState<boolean>(() => {
    return localStorage.getItem('np_reco_rule88a') !== 'false';
  });

  // ─── 5. SMTP & SMS GATEWAY STATE ───
  const [smtpSettings, setSmtpSettings] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem('np_smtp_settings') ||
        '{"host":"smtp.gmail.com","port":"587","email":"","senderName":"Vaswani & Associates CA"}'
      );
    } catch {
      return { host: "smtp.gmail.com", port: "587", email: "", senderName: "Vaswani & Associates CA" };
    }
  });
  const [appPassword, setAppPassword] = useState('');
  const [showAppPassword, setShowAppPassword] = useState(false);
  const [firmName, setFirmName] = useState('');
  const [caPhone, setCaPhone] = useState('');
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [isSavingSmtp, setIsSavingSmtp] = useState(false);
  const [isSmtpConfigured, setIsSmtpConfigured] = useState(false);
  const [twilioToken, setTwilioToken] = useState<string>(() => {
    return localStorage.getItem('np_twilio_token') || 'sk_live_twilio_sandbox_vaswani_token';
  });

  // ─── 6. SOURAV AI ASSISTANT (GEMINI) STATE ───
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [isGeminiConfigured, setIsGeminiConfigured] = useState<boolean | null>(null);
  const [geminiKeyOrigin, setGeminiKeyOrigin] = useState<string | null>(null);
  const [isSyncingGeminiCloud, setIsSyncingGeminiCloud] = useState(false);
  const [isPushingGeminiCloud, setIsPushingGeminiCloud] = useState(false);
  const [cloudPushScope, setCloudPushScope] = useState<'office' | 'global'>('office');
  const [isTestingGemini, setIsTestingGemini] = useState(false);
  const [isSavingGemini, setIsSavingGemini] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // ─── 7. WINDOWS AUTO-START & DESKTOP LOCO PILOT STATE ───
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [isUpdatingAutostart, setIsUpdatingAutostart] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null;
    if (electronAPI?.getStartupSettings) {
      electronAPI.getStartupSettings().then((res: any) => {
        if (res && typeof res.openAtLogin === 'boolean') {
          setOpenAtLogin(res.openAtLogin);
        }
      });
    }
  }, [isOpen]);

  const handleToggleAutostart = async (checked: boolean) => {
    const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null;
    if (!electronAPI?.setStartupSettings) return;

    setIsUpdatingAutostart(true);
    try {
      const res = await electronAPI.setStartupSettings(checked);
      if (res?.success) {
        setOpenAtLogin(checked);
        toast.success(
          checked
            ? 'AUDIT WITH VASWANI will now start automatically in the background on Windows boot.'
            : 'Windows auto-startup disabled.'
        );
      }
    } catch (e: any) {
      toast.error('Failed to update startup settings: ' + e.message);
    } finally {
      setIsUpdatingAutostart(false);
    }
  };

  // Fetch configs on open
  useEffect(() => {
    if (!isOpen) return;

    // 1. Fetch storage config
    const fetchStorageConfig = async () => {
      setIsLoadingStorage(true);
      try {
        const res = await safeApiFetch('/api/returns/storage-config');
        if (res.ok) {
          const data = await res.json();
          if (data && data.success) {
            setCurrentDataPath(data.dataPath || '');
            setNewPathInput(data.dataPath || '');
            setServerHost(data.serverHost || '');
            setServerIps(Array.isArray(data.serverIps) ? data.serverIps : []);
            setStorageStatus({
              exists: Boolean(data.exists),
              isWritable: Boolean(data.isWritable)
            });
          }
        }
      } catch (e) {
        console.warn('Failed fetching storage config:', e);
      } finally {
        setIsLoadingStorage(false);
      }
    };

    // 2. Fetch credentials vault
    const fetchVault = async () => {
      setLoadingVault(true);
      try {
        const res = await safeApiFetch('/api/ims/credentials');
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.clients)) {
            setVaultClients(data.clients);
          }
        }
      } catch (e) {
        console.warn('Failed fetching vault:', e);
      } finally {
        setLoadingVault(false);
      }
    };

    // 3. Fetch backend email / SMTP settings
    const fetchEmailSettings = async () => {
      try {
        const res = await safeApiFetch('/api/ims/email-settings');
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && data.settings) {
            setSmtpSettings(prev => ({
              ...prev,
              email: data.settings.sender_email || prev.email,
              senderName: data.settings.sender_name || prev.senderName,
              host: prev.host || 'smtp.gmail.com',
              port: prev.port || '587'
            }));
            setAppPassword(data.settings.app_password || '');
            setFirmName(data.settings.firm_name || '');
            setCaPhone(data.settings.ca_phone || '');
            setIsSmtpConfigured(Boolean(data.isConfigured));
          }
        }
      } catch (e) {
        console.warn('Failed fetching email settings:', e);
      }
    };

    // 4. Fetch Gemini AI status & origin
    const fetchGemini = async () => {
      try {
        const res = await getGeminiStatus();
        setIsGeminiConfigured(res.configured);
        setGeminiKeyOrigin(res.origin || null);
      } catch (e) {
        console.warn('Failed fetching Gemini status:', e);
      }
    };

    fetchStorageConfig();
    fetchVault();
    fetchEmailSettings();
    fetchGemini();
  }, [isOpen]);

  const handleSaveGeminiKey = async () => {
    const key = geminiApiKey.trim();
    if (!key) {
      toast.error('Please enter a valid Gemini API key');
      return;
    }
    setIsSavingGemini(true);
    try {
      await saveGeminiApiKey(key);
      setIsGeminiConfigured(true);
      setGeminiKeyOrigin('local_manual');
      setGeminiApiKey('');
      toast.success('Gemini API Key Saved', {
        description: 'Sourav AI Assistant is now activated and ready to assist.',
      });
    } catch (e: any) {
      toast.error('Failed to save Gemini API key', { description: e.message });
    } finally {
      setIsSavingGemini(false);
    }
  };

  const handleSyncGeminiFromCloud = async () => {
    setIsSyncingGeminiCloud(true);
    try {
      const res = await syncGeminiFromCloud();
      setIsGeminiConfigured(true);
      setGeminiKeyOrigin(res.origin || 'cloud_office');
      toast.success('Synced from Cloud License', {
        description: res.message || 'Gemini API key updated from cloud.',
      });
      // Automatically test connection after successful sync
      handleTestGemini();
    } catch (e: any) {
      toast.error('Cloud Sync Failed', { description: e.message });
    } finally {
      setIsSyncingGeminiCloud(false);
    }
  };

  const handlePushGeminiToCloud = async () => {
    const key = geminiApiKey.trim();
    if (!key) {
      toast.error('Enter an API key in the field above to push to Cloud');
      return;
    }
    setIsPushingGeminiCloud(true);
    try {
      const res = await pushGeminiToCloud(key, cloudPushScope);
      setIsGeminiConfigured(true);
      setGeminiKeyOrigin(cloudPushScope === 'office' ? 'cloud_office' : 'cloud_global');
      setGeminiApiKey('');
      toast.success('Pushed to Firebase Cloud', {
        description: res.message,
      });
    } catch (e: any) {
      toast.error('Failed to push to Cloud', { description: e.message });
    } finally {
      setIsPushingGeminiCloud(false);
    }
  };

  const handleTestGemini = async () => {
    setIsTestingGemini(true);
    setGeminiTestResult(null);
    try {
      const reply = await sendChatMessage('Say: "Connected to Vaswani Enterprise!" in one short sentence.');
      setGeminiTestResult({ success: true, message: reply });
      toast.success('Gemini AI Connected Successfully!');
    } catch (e: any) {
      setGeminiTestResult({ success: false, message: e.message || 'Connection test failed' });
      toast.error('Gemini Test Failed', { description: e.message });
    } finally {
      setIsTestingGemini(false);
    }
  };

  // Handle saving new data path
  const handleSaveDataPath = async () => {
    const cleanPath = newPathInput.trim().replace(/^["']|["']$/g, '').trim();
    if (!cleanPath) {
      toast.error('Data path cannot be empty');
      return;
    }
    setIsSavingStorage(true);
    try {
      const res = await safeApiFetch('/api/returns/storage-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataPath: cleanPath })
      });
      const data = await res.json();
      if (res.ok && data && data.success) {
        setCurrentDataPath(data.dataPath);
        setNewPathInput(data.dataPath);
        setStorageStatus({ exists: true, isWritable: true });
        window.dispatchEvent(new CustomEvent('storage-config-updated', { detail: { dataPath: data.dataPath } }));
        toast.success('Data Storage Path Updated', {
          description: `All client returns and batches will be stored in: ${data.dataPath}`
        });
      } else {
        toast.error('Failed to update data path', { description: data?.error || data?.message || 'Server error' });
      }
    } catch (e: any) {
      toast.error('Failed to save data path', { description: e.message });
    } finally {
      setIsSavingStorage(false);
    }
  };

  // Reset to default local folder
  const handleResetDefaultStorage = async () => {
    if (!window.confirm('Reset storage directory back to local application default folder?')) return;
    setIsSavingStorage(true);
    try {
      const res = await safeApiFetch('/api/returns/reset-default-storage', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data && data.success) {
        setCurrentDataPath(data.dataPath);
        setNewPathInput(data.dataPath);
        setStorageStatus({ exists: true, isWritable: true });
        window.dispatchEvent(new CustomEvent('storage-config-updated', { detail: { dataPath: data.dataPath } }));
        toast.success('Storage Path Reset', { description: 'Restored default local returns directory' });
      } else {
        toast.error('Failed to reset path', { description: data?.error || 'Server error' });
      }
    } catch (e: any) {
      toast.error('Reset failed', { description: e.message });
    } finally {
      setIsSavingStorage(false);
    }
  };

  // Browse folder using Electron native dialog or Windows FolderBrowserDialog
  const handleBrowseFolder = async () => {
    setIsBrowsingStorage(true);
    try {
      // 1. Electron Native Folder Browser Dialog
      if (typeof window !== 'undefined' && (window as any).electronAPI?.invoke) {
        const res = await (window as any).electronAPI.invoke('select_folder', currentDataPath || newPathInput);
        if (res && res.success && res.folderPath) {
          setNewPathInput(res.folderPath);
          toast.info('Folder Selected', { description: res.folderPath });
          return;
        } else if (res && res.canceled) {
          return;
        }
      }

      // 2. Server-side Windows Native Folder Browser
      const res = await safeApiFetch('/api/returns/browse-folder', { method: 'POST' });
      const data = await res.json();
      if (data && data.success && data.folderPath) {
        setNewPathInput(data.folderPath);
        toast.info('Folder Selected', { description: data.folderPath });
      } else if (data && !data.canceled) {
        toast.error('Could not open folder picker', { description: data?.error || 'Unknown error' });
      }
    } catch (e: any) {
      toast.error('Folder browse error', { description: e.message });
    } finally {
      setIsBrowsingStorage(false);
    }
  };

  // Open directory in Windows File Explorer
  const handleOpenStorageExplorer = async () => {
    try {
      const res = await safeApiFetch('/api/returns/open-folder', { method: 'POST' });
      const data = await res.json();
      if (data && data.success) {
        toast.success('Opened storage folder in File Explorer');
      } else {
        toast.error('Could not open folder', { description: data?.error || 'Server error' });
      }
    } catch (e: any) {
      toast.error('Could not open folder', { description: e.message });
    }
  };

  // Handle testing TallyPrime connection
  const handleTestTally = async () => {
    setIsTestingTally(true);
    setTallyStatus('unknown');
    setTallyCompany('');
    try {
      const config = { host: tallyHost, port: tallyPort };
      const isAlive = await pingTally(config);
      if (isAlive) {
        setTallyStatus('online');
        localStorage.setItem('np_tally_port', String(tallyPort));
        try {
          const info = await fetchCompanyInfo(config);
          if (info && info.name) {
            setTallyCompany(info.name);
          }
        } catch {}
        toast.success('TallyPrime Connected!', {
          description: `Tally XML Server active on ${tallyHost}:${tallyPort}`
        });
      } else {
        setTallyStatus('offline');
        toast.error('Tally Not Reachable', {
          description: `Ensure TallyPrime is open and acts as an XML Server on port ${tallyPort}.`
        });
      }
    } catch (e: any) {
      setTallyStatus('offline');
      toast.error('Connection failed', { description: e.message });
    } finally {
      setIsTestingTally(false);
    }
  };

  // Save single client credential
  const handleSaveVaultClient = async (gstin: string) => {
    const update = editedCredentials[gstin];
    if (!update) return;

    setSavingGstin(gstin);
    try {
      const res = await safeApiFetch('/api/ims/credentials/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin,
          portal_username: update.portal_username,
          portal_password: update.portal_password,
          phone: update.phone,
          trade_name: update.trade_name
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed saving credentials');

      setVaultClients(prev => prev.map(c => {
        if (c.gstin === gstin) {
          return {
            ...c,
            portal_username: update.portal_username !== undefined ? update.portal_username : c.portal_username,
            portal_password: update.portal_password !== undefined ? update.portal_password : c.portal_password,
            phone: update.phone !== undefined ? update.phone : c.phone
          };
        }
        return c;
      }));

      setEditedCredentials(prev => {
        const next = { ...prev };
        delete next[gstin];
        return next;
      });

      window.dispatchEvent(new CustomEvent('credentials-updated'));
      toast.success(`Saved credentials for ${gstin}`);
    } catch (err: any) {
      toast.error('Save failed', { description: err?.message });
    } finally {
      setSavingGstin(null);
    }
  };

  // Delete single client credential
  const handleDeleteVaultClient = async (gstin: string, tradeName: string) => {
    if (!window.confirm(`Delete credentials for "${tradeName || gstin}" (${gstin})?`)) return;

    setDeletingGstin(gstin);
    try {
      const res = await safeApiFetch(`/api/ims/clients/${encodeURIComponent(gstin)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed deleting client');

      setVaultClients(prev => prev.filter(c => c.gstin !== gstin));
      toast.success(`Deleted credentials for ${gstin}`);
    } catch (err: any) {
      toast.error('Delete failed', { description: err?.message });
    } finally {
      setDeletingGstin(null);
    }
  };

  // Download Excel template
  const handleDownloadVaultTemplate = async () => {
    try {
      const blob = await generateCredentialsTemplateExcel(vaultClients);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GST_Client_Credentials_Template_${new Date().getFullYear()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success('Downloaded Credentials Vault Template');
    } catch (err: any) {
      toast.error('Failed generating template', { description: err?.message });
    }
  };

  // Import Excel sheet
  const handleImportVaultExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading('Reading & Synchronizing Credentials Excel...');
    try {
      const records = await parseCredentialsImportExcel(file);
      if (!records || records.length === 0) {
        toast.error('No valid client credential rows found in Excel.', { id: toastId });
        return;
      }

      const res = await safeApiFetch('/api/ims/credentials/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clients: records, deleteMissing: false })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed synchronizing credentials');

      // Refresh clients
      const ref = await safeApiFetch('/api/ims/credentials');
      const refData = await ref.json();
      if (refData.success && Array.isArray(refData.clients)) {
        setVaultClients(refData.clients);
      }

      toast.success(`Synchronized ${data.importedCount || records.length} clients!`, { id: toastId });
    } catch (err: any) {
      toast.error('Import failed', { id: toastId, description: err?.message });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Filtered vault clients
  const filteredVaultClients = vaultClients.filter(c => {
    const q = vaultSearch.toLowerCase();
    const matchesSearch =
      (c.trade_name || '').toLowerCase().includes(q) ||
      (c.legal_name || '').toLowerCase().includes(q) ||
      c.gstin.toLowerCase().includes(q) ||
      (c.portal_username || '').toLowerCase().includes(q);

    if (!matchesSearch) return false;
    const isConfigured = Boolean(c.portal_username && c.portal_password);
    if (vaultFilter === 'CONFIGURED') return isConfigured;
    if (vaultFilter === 'MISSING') return !isConfigured;
    return true;
  });

  // Save Reco Rules
  const handleSaveRecoRules = () => {
    localStorage.setItem('np_reco_tolerance', String(tolerance));
    localStorage.setItem('np_reco_fuzzy', fuzzyStrictness);
    localStorage.setItem('np_reco_sec164', String(section164Cutoff));
    localStorage.setItem('np_reco_rule88a', String(rule88aCascade));
    toast.success('GST Reco Rules & Tolerance Saved', {
      description: `Tolerance set to ₹${tolerance} | Fuzzy mode: ${fuzzyStrictness.toUpperCase()}`
    });
  };

  // Save SMTP & Gateway
  const handleSaveGateway = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!smtpSettings.email || !smtpSettings.email.includes('@')) {
      toast.error('Please enter a valid Sender Email Address.');
      return;
    }
    if (!appPassword || !appPassword.trim()) {
      toast.error('Please enter your 16-character Google App Password.');
      return;
    }

    setIsSavingSmtp(true);
    try {
      // 1. Save to backend database (ims_email_settings)
      const res = await safeApiFetch('/api/ims/email-settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_name: smtpSettings.senderName,
          sender_email: smtpSettings.email.trim(),
          app_password: appPassword.replace(/\s+/g, '').trim(),
          firm_name: firmName || smtpSettings.senderName,
          ca_phone: caPhone
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // 2. Also save to localStorage for client-side templates
        localStorage.setItem('np_smtp_settings', JSON.stringify(smtpSettings));
        localStorage.setItem('np_twilio_token', twilioToken);
        setIsSmtpConfigured(true);
        toast.success('SMTP & Gateway Settings Saved Successfully!', {
          description: `Sender: ${smtpSettings.senderName} (${smtpSettings.email})`
        });
      } else {
        toast.error(data.error || 'Failed saving SMTP settings to database.');
      }
    } catch (err: any) {
      toast.error('Failed saving gateway settings: ' + err.message);
    } finally {
      setIsSavingSmtp(false);
    }
  };

  // Test SMTP Connection
  const handleTestSmtp = async () => {
    if (!smtpSettings.email || !appPassword) {
      toast.error('Please enter Sender Email and 16-character Google App Password first.');
      return;
    }
    setIsTestingSmtp(true);
    const toastId = toast.loading('Connecting to Gmail SMTP and sending test email...');
    try {
      const res = await safeApiFetch('/api/ims/email-settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_email: smtpSettings.email.trim(),
          app_password: appPassword.replace(/\s+/g, '').trim(),
          sender_name: smtpSettings.senderName || firmName,
          test_recipient: smtpSettings.email.trim()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'SMTP Verified! Test email delivered to your inbox.', { id: toastId });
        setIsSmtpConfigured(true);
      } else {
        toast.error(data.error || 'SMTP Connection failed.', { id: toastId, duration: 6000 });
      }
    } catch (err: any) {
      toast.error('SMTP test error: ' + err.message, { id: toastId });
    } finally {
      setIsTestingSmtp(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-4xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] transition-all transform animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Master Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 shadow-xs">
              <Settings className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                Enterprise System Settings
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  Global Control
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Centralized storage, live TallyPrime bridge, portal credentials vault, and statutory reconciliation rules.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-all"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Master Tab Strip (6 Consolidated Tabs) */}
        <div className="flex border-b border-slate-100 px-6 bg-slate-50/60 overflow-x-auto scrollbar-none gap-1 pt-1">
          {[
            { id: 'storage', label: 'Storage & LAN Path', icon: Database, color: 'border-blue-600 text-blue-700 bg-white' },
            { id: 'tally', label: 'Tally Port 9000', icon: Server, color: 'border-pink-600 text-pink-700 bg-white' },
            { id: 'credentials', label: 'Credentials Vault', icon: Key, color: 'border-amber-600 text-amber-700 bg-white', badge: vaultClients.filter(c => c.portal_username && c.portal_password).length },
            { id: 'reco', label: 'GST Reco Rules', icon: Sliders, color: 'border-emerald-600 text-emerald-700 bg-white' },
            { id: 'gateway', label: 'SMTP & Gateway', icon: Mail, color: 'border-purple-600 text-purple-700 bg-white' },
            { id: 'ai', label: 'Sourav AI (Gemini)', icon: Bot, color: 'border-amber-500 text-amber-700 bg-white', badge: isGeminiConfigured ? 'Active' : undefined },
            { id: 'appearance', label: 'Theme & System', icon: Sparkles, color: 'border-slate-800 text-slate-900 bg-white' },
          ].map(tab => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTabKey)}
                className={`py-2.5 px-3.5 font-bold text-xs border-b-2 flex items-center gap-2 rounded-t-xl transition-all whitespace-nowrap ${
                  isActive
                    ? `${tab.color} shadow-2xs`
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-white/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Modal Body Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-white">
          {/* ══════════════════════════════════════════════════════════════════════
              TAB 1: DATA STORAGE PATH & LAN
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'storage' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200/60 text-xs text-slate-700 space-y-1">
                <p className="font-bold text-blue-900 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-blue-600" />
                  Centralized Returns &amp; Client Database Storage Directory
                </p>
                <p className="text-[11px] leading-relaxed text-slate-600">
                  All GSTR-2B batches, GSTR-1 matrices, IMS client actions, and reconciliation workbooks are saved in this folder. Set a shared LAN network drive (e.g. <code className="font-mono bg-white px-1 py-0.5 rounded border border-blue-200">\\\\SERVER\\ReturnsData</code>) so all office PCs access identical client records in real time.
                </p>
              </div>

              {/* Current Active Path */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">
                    Current Active Storage Path
                  </label>
                  {isLoadingStorage ? (
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-bold flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Checking...
                    </span>
                  ) : storageStatus.isWritable ? (
                    <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Connected &amp; Writable
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-600" /> Inaccessible / Read-only
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 font-mono text-xs text-slate-800 truncate select-all">
                    {isLoadingStorage ? 'Loading server path...' : currentDataPath || 'Local application directory'}
                  </div>
                  <button
                    onClick={() => {
                      if (currentDataPath) {
                        navigator.clipboard.writeText(currentDataPath);
                        toast.success('Path copied to clipboard');
                      }
                    }}
                    className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 transition-all shadow-2xs"
                    title="Copy Path"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleOpenStorageExplorer}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:text-emerald-700 hover:border-emerald-300 font-semibold text-xs flex items-center gap-1.5 transition-all shadow-2xs"
                    title="Open Directory in Windows Explorer"
                  >
                    <FolderOpen className="w-4 h-4 text-emerald-600" />
                    <span>Open in Explorer</span>
                  </button>
                </div>
              </div>

              {/* Modify Path Input */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">
                    Update Server Storage Directory (Local Drive or Network Path)
                  </label>
                  <button
                    type="button"
                    onClick={handleResetDefaultStorage}
                    disabled={isSavingStorage}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 hover:underline"
                    title="Reset to local application folder"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset to Default
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPathInput}
                    onChange={(e) => setNewPathInput(e.target.value)}
                    placeholder="e.g. D:\VaswaniReturnsData or \\SERVER\SharedReturns"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    disabled={isBrowsingStorage || isSavingStorage}
                    className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs shadow-2xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                    title="Browse and select folder on disk or network"
                  >
                    {isBrowsingStorage ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" /> : <FolderOpen className="w-3.5 h-3.5 text-blue-600" />}
                    <span>Browse...</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDataPath}
                    disabled={isSavingStorage}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    {isSavingStorage ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    <span>Save Path</span>
                  </button>
                </div>
              </div>

              {/* Server Host & IPs */}
              {serverIps.length > 0 && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium flex items-center gap-1.5">
                    <Laptop className="w-4 h-4 text-slate-500" /> LAN Server IP Addresses:
                  </span>
                  <div className="flex gap-1.5 font-mono text-[11px] font-bold text-slate-800">
                    {serverIps.slice(0, 3).map((ip, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-white border border-slate-200">
                        {ip}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 2: TALLYPRIME LIVE BRIDGE (PORT 9000)
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'tally' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-pink-50/60 border border-pink-200/60 text-xs text-slate-700 space-y-1">
                <p className="font-bold text-pink-900 flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-pink-600" />
                  Real-Time TallyPrime Direct XML Integration (Port 9000)
                </p>
                <p className="text-[11px] leading-relaxed text-slate-600">
                  Connects directly to the TallyPrime XML Server running on this machine or LAN server to fetch Daybooks, Trial Balances, Purchase Registers, and TDS vouchers without manual export.
                </p>
              </div>

              {/* Host & Port Configuration */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700">Tally Host IP / Domain</label>
                  <input
                    type="text"
                    value={tallyHost}
                    onChange={(e) => setTallyHost(e.target.value)}
                    placeholder="localhost or 192.168.1.50"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">XML Server Port</label>
                  <input
                    type="number"
                    value={tallyPort}
                    onChange={(e) => setTallyPort(Number(e.target.value))}
                    placeholder="9000"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                  />
                </div>
              </div>

              {/* Connection Status Box */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">Bridge Status</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {tallyStatus === 'online' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        TallyPrime XML Server Online &amp; Ready
                      </span>
                    )}
                    {tallyStatus === 'offline' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                        Tally Server Unreachable
                      </span>
                    )}
                    {tallyStatus === 'unknown' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                        Status Unverified (Click Test Connection)
                      </span>
                    )}
                  </div>
                  {tallyCompany && (
                    <span className="text-[11px] text-slate-700 font-medium block mt-1">
                      Active Company: <strong className="text-slate-900 font-bold">{tallyCompany}</strong>
                    </span>
                  )}
                </div>

                <button
                  onClick={handleTestTally}
                  disabled={isTestingTally}
                  className="px-4 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingTally ? 'animate-spin' : ''}`} />
                  <span>Test Port {tallyPort}</span>
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 3: CREDENTIALS VAULT (PORTAL PASSWORDS & USERNAMES)
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'credentials' && (
            <div className="space-y-4 animate-fadeIn">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportVaultExcel}
                accept=".xlsx,.xls"
                className="hidden"
              />

              {/* Vault Actions Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={vaultSearch}
                    onChange={(e) => setVaultSearch(e.target.value)}
                    placeholder="Search client, GSTIN, username..."
                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Filter Pills */}
                  <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 text-xs">
                    {(['ALL', 'CONFIGURED', 'MISSING'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setVaultFilter(f)}
                        className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all ${
                          vaultFilter === f ? 'bg-amber-600 text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleDownloadVaultTemplate}
                    className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 shadow-2xs"
                    title="Download Excel Template"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-600" />
                    <span className="hidden sm:inline">Template</span>
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1 shadow-xs"
                    title="Import Client Credentials from Excel"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Import Excel</span>
                  </button>
                </div>
              </div>

              {/* Clients Credentials List */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[360px] overflow-y-auto divide-y divide-slate-100">
                {loadingVault ? (
                  <div className="p-8 text-center text-xs text-slate-400">Loading credentials vault...</div>
                ) : filteredVaultClients.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">No client credentials found matching filter.</div>
                ) : (
                  filteredVaultClients.map(c => {
                    const edit = editedCredentials[c.gstin] || {};
                    const currentUsername = edit.portal_username !== undefined ? edit.portal_username : (c.portal_username || '');
                    const currentPassword = edit.portal_password !== undefined ? edit.portal_password : (c.portal_password || '');
                    const isSaving = savingGstin === c.gstin;
                    const isDeleting = deletingGstin === c.gstin;
                    const isVisible = Boolean(showPasswords[c.gstin]);

                    return (
                      <div key={c.gstin} className="p-3.5 hover:bg-slate-50/60 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                        {/* Client Info */}
                        <div className="min-w-0 md:w-1/3">
                          <div className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="truncate">{c.trade_name || c.legal_name || 'Client'}</span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                            {c.gstin}
                          </div>
                        </div>

                        {/* Username & Password Inputs */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <input
                            type="text"
                            value={currentUsername}
                            placeholder="Portal Username"
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditedCredentials(prev => ({
                                ...prev,
                                [c.gstin]: { ...prev[c.gstin], portal_username: val }
                              }));
                            }}
                            className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 placeholder:text-slate-400 outline-none focus:border-amber-500"
                          />
                          <div className="relative flex-1">
                            <input
                              type={isVisible ? 'text' : 'password'}
                              value={currentPassword}
                              placeholder="Portal Password"
                              onChange={(e) => {
                                const val = e.target.value;
                                setEditedCredentials(prev => ({
                                  ...prev,
                                  [c.gstin]: { ...prev[c.gstin], portal_password: val }
                                }));
                              }}
                              className="w-full px-2.5 py-1.5 pr-8 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 placeholder:text-slate-400 outline-none focus:border-amber-500"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPasswords(prev => ({ ...prev, [c.gstin]: !prev[c.gstin] }))}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                            >
                              {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 shrink-0 justify-end">
                          <button
                            onClick={() => handleSaveVaultClient(c.gstin)}
                            disabled={isSaving}
                            className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-[11px] flex items-center gap-1 shadow-2xs disabled:opacity-50"
                          >
                            {isSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 text-emerald-400" />}
                            <span>Save</span>
                          </button>
                          <button
                            onClick={() => handleDeleteVaultClient(c.gstin, c.trade_name)}
                            disabled={isDeleting}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                            title="Delete Client"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 4: GST RECO RULES & TOLERANCE
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'reco' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/60 text-xs text-slate-700 space-y-1">
                <p className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
                  Section 16(2)(aa) Multi-Tier Reconciliation Matching Rules
                </p>
                <p className="text-[11px] leading-relaxed text-slate-600">
                  Configure maximum tax variance tolerance, alphanumeric cleaning strictness, and Section 16(4) outward cut-off tagging for automated 2B vs Books reconciliation.
                </p>
              </div>

              {/* Match Tolerance Settings */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Maximum Tax Difference Tolerance (₹)</span>
                    <span className="text-[11px] text-slate-500">Matched as "Value Mismatch" if variance is within this threshold</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 5, 10].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setTolerance(val)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all border ${
                          tolerance === val
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        ₹{val}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Fuzzy Invoice Strictness */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Fuzzy Invoice Matching Strictness</span>
                  <span className="text-[11px] text-slate-500">Controls how aggressive the engine strips invoice serial numbers and prefixes</span>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: 'high', title: 'High (Standard)', desc: 'Strips FY prefix & leading zeroes. Exact serial.' },
                    { id: 'medium', title: 'Medium (Balanced)', desc: 'Strips punctuation, hyphens, and legal suffixes (Pvt Ltd).' },
                    { id: 'low', title: 'Low (Aggressive)', desc: 'Fuzzy token extraction and phonetic alphanumeric matching.' }
                  ].map(lvl => (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => setFuzzyStrictness(lvl.id as any)}
                      className={`p-3 rounded-xl text-left border transition-all ${
                        fuzzyStrictness === lvl.id
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="font-bold text-xs block">{lvl.title}</span>
                      <span className="text-[10px] text-slate-500 leading-tight block mt-1">{lvl.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Statutory Switches */}
              <div className="space-y-2">
                <div className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Section 16(4) Inward Cut-off Tagging</span>
                    <span className="text-[11px] text-slate-500">Automatically flags invoices filed past 30th November as ineligible</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={section164Cutoff}
                    onChange={(e) => setSection164Cutoff(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Rule 88A Tax Set-off Cascade Priority</span>
                    <span className="text-[11px] text-slate-500">Exhausts IGST credit completely before utilizing CGST and SGST balances</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={rule88aCascade}
                    onChange={(e) => setRule88aCascade(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveRecoRules}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Save Reco Rules</span>
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 5: SMTP MAILER & NOTIFICATION GATEWAYS
          ══════════════════════════════════════════════ */}
          {activeTab === 'gateway' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200/60 text-xs text-slate-700 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-purple-900 flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-purple-600" />
                    Client Dispute Communication Mailer &amp; Gateway Configurations
                  </p>
                  {isSmtpConfigured ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Active &amp; Authenticated
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      App Password Required
                    </span>
                  )}
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600">
                  Configure your sender Gmail and 16-character Google App Password for dispatching GSTR-3B client summaries, IMS review sheets, and vendor mismatch notices.
                </p>
              </div>

              {/* SMTP Configurations */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Google Gmail SMTP Credentials</h4>
                
                {/* Email and App Password */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">
                      Sender Gmail Address <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={smtpSettings.email}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, email: e.target.value })}
                      placeholder="e.g. ca.office@gmail.com"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-purple-500 font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                      <span>Google 16-Character App Password <span className="text-rose-500">*</span></span>
                      <a
                        href="https://myaccount.google.com/apppasswords"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-purple-600 hover:text-purple-800 font-normal inline-flex items-center gap-0.5"
                      >
                        Generate on Google <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </label>
                    <div className="relative">
                      <input
                        type={showAppPassword ? "text" : "password"}
                        value={appPassword}
                        onChange={(e) => setAppPassword(e.target.value)}
                        placeholder="•••• •••• •••• ••••"
                        className="w-full pl-3 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-purple-500 font-mono tracking-wider"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAppPassword(!showAppPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        title={showAppPassword ? "Hide password" : "Show password"}
                      >
                        {showAppPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Branding and Firm Phone */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">Sender Name (Branding)</label>
                    <input
                      type="text"
                      value={smtpSettings.senderName}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, senderName: e.target.value })}
                      placeholder="Vaswani & Associates CA"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-purple-500 font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">CA Office Contact / Phone</label>
                    <input
                      type="text"
                      value={caPhone}
                      onChange={(e) => setCaPhone(e.target.value)}
                      placeholder="+91 98200 12345 (Included in email footer)"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* Host and Port */}
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div className="col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">SMTP Host</label>
                    <input
                      type="text"
                      value={smtpSettings.host}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, host: e.target.value })}
                      placeholder="smtp.gmail.com"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-purple-500 font-mono text-[11px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">Port</label>
                    <input
                      type="text"
                      value={smtpSettings.port}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, port: e.target.value })}
                      placeholder="587"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-purple-500 font-mono text-[11px]"
                    />
                  </div>
                </div>
              </div>

              {/* Twilio & WhatsApp Gateway */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">SMS / WhatsApp Gateway Token</h4>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">Twilio / SMS Gateway API Key</label>
                  <input
                    type="password"
                    value={twilioToken}
                    onChange={(e) => setTwilioToken(e.target.value)}
                    placeholder="sk_live_..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono outline-none focus:border-purple-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Default Indian DLT header registered: <strong>VASWNI</strong></p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleTestSmtp}
                  disabled={isTestingSmtp || !smtpSettings.email || !appPassword}
                  className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs rounded-xl border border-purple-200 shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                  title="Sends a test verification email to verify Google SMTP credentials"
                >
                  <Send className={`w-3.5 h-3.5 text-purple-600 ${isTestingSmtp ? 'animate-pulse' : ''}`} />
                  <span>{isTestingSmtp ? 'Sending Test...' : 'Test Connection'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveGateway}
                  disabled={isSavingSmtp}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isSavingSmtp ? 'Saving...' : 'Save Gateway Settings'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 6: SOURAV AI ASSISTANT (GOOGLE GEMINI)
          ══════════════════════════════════════════════ */}
          {activeTab === 'ai' && (
            <div className="space-y-5 animate-fadeIn">
              {/* Hero Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50/60 border border-amber-200/80 text-xs text-slate-800 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center text-slate-950 font-bold text-xs shadow-xs">
                      ✨
                    </span>
                    <span className="font-bold text-sm text-amber-950">
                      Sourav — Universal Gemini AI Assistant
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      gemini-2.0-flash
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Powered by Google Gemini 2.0 Flash with a 1-million token context window. Provides instant statutory answers for GST, GSTR-3B/1/2B mechanics, and 1-click deep-link action buttons across all 12 modules.
                  </p>
                </div>
                <div className="shrink-0 pt-0.5">
                  {isGeminiConfigured ? (
                    <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs flex items-center gap-1.5 shadow-2xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                      {geminiKeyOrigin === 'cloud_office' && 'Active (Office Cloud License)'}
                      {geminiKeyOrigin === 'cloud_global' && 'Active (Global Master)'}
                      {geminiKeyOrigin === 'local_manual' && 'Active (Custom Local Key)'}
                      {geminiKeyOrigin === 'env' && 'Active (Environment)'}
                      {!['cloud_office', 'cloud_global', 'local_manual', 'env'].includes(geminiKeyOrigin || '') && 'Active & Ready'}
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-bold text-xs flex items-center gap-1.5 shadow-2xs">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      Key Required
                    </span>
                  )}
                </div>
              </div>

              {/* API Key Configuration Card */}
              <div className="p-4 rounded-2xl border border-slate-200/80 bg-white space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Key className="w-4 h-4 text-amber-600" />
                    Google Gemini API Key
                  </label>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1 hover:underline"
                  >
                    <span>Get Free Key at Google AI Studio</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="relative">
                  <input
                    type={showGeminiKey ? 'text' : 'password'}
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder={isGeminiConfigured ? '•••••••••••••••••••••••••••••••••••••••• (Configured — enter new key to overwrite)' : 'Paste your Gemini API key (starts with AIzaSy...)'}
                    className="w-full pr-10 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 font-mono focus:bg-white focus:outline-none focus:border-amber-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                    title={showGeminiKey ? 'Hide key' : 'Show key'}
                  >
                    {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Stored securely in local SQLite <code className="font-mono text-slate-700">app_config</code>. Never leaked to frontend bundles.</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSyncGeminiFromCloud}
                      disabled={isSyncingGeminiCloud}
                      className="px-3.5 py-2 rounded-xl border border-sky-300 bg-sky-50 text-sky-800 font-bold text-xs hover:bg-sky-100 transition-all disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                      title="Fetch and sync latest Gemini API key from Office Cloud License"
                    >
                      <CloudDownload className={`w-3.5 h-3.5 text-sky-600 ${isSyncingGeminiCloud ? 'animate-bounce' : ''}`} />
                      <span>{isSyncingGeminiCloud ? 'Syncing...' : 'Sync from Cloud'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleTestGemini}
                      disabled={isTestingGemini || (!geminiApiKey.trim() && !isGeminiConfigured)}
                      className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-all disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                    >
                      {isTestingGemini ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" /> : <Send className="w-3.5 h-3.5 text-amber-600" />}
                      <span>{isTestingGemini ? 'Testing...' : 'Test Connection'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveGeminiKey}
                      disabled={isSavingGemini || !geminiApiKey.trim()}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-bold text-xs shadow-xs transition-all disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isSavingGemini ? 'Saving...' : 'Save Locally'}</span>
                    </button>
                  </div>
                </div>

                {/* Connection Test Result Feedback */}
                {geminiTestResult && (
                  <div className={`p-3 rounded-xl text-xs border ${
                    geminiTestResult.success
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50/70 border-rose-200 text-rose-900'
                  }`}>
                    <div className="flex items-center gap-1.5 font-bold mb-1">
                      {geminiTestResult.success ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Gemini API Test Passed</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                          <span>Connection Test Failed</span>
                        </>
                      )}
                    </div>
                    <p className="text-[11px] font-mono leading-relaxed pl-5">
                      {geminiTestResult.message}
                    </p>
                  </div>
                )}
              </div>

              {/* Central Office Cloud Distribution Card (Admin / Firebase) */}
              <div className="p-4 rounded-2xl border border-indigo-200/90 bg-gradient-to-br from-indigo-50/70 via-white to-sky-50/50 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0 mt-0.5">
                      <CloudUpload className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-2">
                        Central Office Cloud Distribution (Firebase Firestore)
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold">
                          Admin / Super User
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
                        Save the Gemini key into Firebase once. All team workstations in this office will automatically sync and activate Sourav AI without individual user configuration.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-indigo-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-4 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium">
                      <input
                        type="radio"
                        name="cloudPushScope"
                        value="office"
                        checked={cloudPushScope === 'office'}
                        onChange={() => setCloudPushScope('office')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>This Office License (<code className="font-mono text-indigo-900 font-bold">serial_keys</code>)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium">
                      <input
                        type="radio"
                        name="cloudPushScope"
                        value="global"
                        checked={cloudPushScope === 'global'}
                        onChange={() => setCloudPushScope('global')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Global Master Default (<code className="font-mono text-indigo-900 font-bold">system_config</code>)</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handlePushGeminiToCloud}
                    disabled={isPushingGeminiCloud || !geminiApiKey.trim()}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                    title="Upload entered key to Firebase Firestore for centralized multi-workstation sync"
                  >
                    <CloudUpload className={`w-3.5 h-3.5 ${isPushingGeminiCloud ? 'animate-bounce' : ''}`} />
                    <span>{isPushingGeminiCloud ? 'Pushing to Firebase...' : 'Push to Cloud'}</span>
                  </button>
                </div>
              </div>

              {/* Windows Background & PC Loco Pilot Controls */}
              <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <span>🚀 Windows Background Auto-Start (Loco Pilot Mode)</span>
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Silently launch AUDIT WITH VASWANI on Windows boot in System Tray so Express backend (Port 3001) and Sourav AI are always active.
                    </p>
                  </div>
                  <Switch
                    checked={openAtLogin}
                    onCheckedChange={handleToggleAutostart}
                    disabled={isUpdatingAutostart}
                  />
                </div>

                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                  <div className="text-slate-600">
                    <span className="font-semibold text-slate-800">Universal Global Hotkey:</span> Press anywhere in Windows to summon Sourav AI
                  </div>
                  <span className="px-2 py-0.5 rounded bg-slate-900 text-amber-300 font-mono text-[11px] font-bold border border-amber-500/30">
                    Ctrl + Alt + S
                  </span>
                </div>
              </div>

              {/* Feature Grid Card */}
              <div className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-2.5">
                <span className="text-xs font-bold text-slate-800 block">
                  Sourav AI Capabilities &amp; Built-In Domain Safeguards
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200/60">
                    <span className="font-semibold text-slate-900 block mb-0.5">⚖️ Statutory Authority</span>
                    Cites exact CGST Act sections (Sec 16(2)(aa), Sec 17(5), Sec 50 interest) and official CBIC circulars.
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200/60">
                    <span className="font-semibold text-slate-900 block mb-0.5">🧭 1-Click Navigation</span>
                    Emits deep-link action pills allowing instant navigation to IMS, 3B Working, Reco, or Notices.
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200/60">
                    <span className="font-semibold text-slate-900 block mb-0.5">🗣️ Adaptive Code-Switching</span>
                    Responds naturally in Hindi, Hinglish, or professional English based on your input style.
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200/60">
                    <span className="font-semibold text-slate-900 block mb-0.5">🏢 Context Grounding</span>
                    Automatically recognizes your active client name, GSTIN, and financial year without manual typing.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 7: THEME & SYSTEM ARCHITECTURE
          ══════════════════════════════════════════════ */}
          {activeTab === 'appearance' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/60 text-xs text-slate-700 space-y-1">
                <p className="font-bold text-amber-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  Luminous Fluid Corporate Architecture
                </p>
                <p className="text-[11px] leading-relaxed text-slate-600">
                  Clean Light Theme Enterprise palette, tabular monospaced currency tables, and strict zero-merge Excel exports.
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Zero-Merge Table Architecture</span>
                    <span className="text-[11px] text-slate-500">Strips all &lt;mergeCell&gt; tags from exports to ensure 100% sortable &amp; XLOOKUP safe workbooks</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold text-xs">
                    Strict Active
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Tabular Figures (JetBrains Mono)</span>
                    <span className="text-[11px] text-slate-500">Guarantees razor-sharp column alignment across all multi-currency amounts</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs">
                    Standard Locked
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Fluid 60 FPS Spring Animations</span>
                    <span className="text-[11px] text-slate-500">Smooth hover drawer expansion and floating modal transitions</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-bold text-xs">
                    Optimized
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Master Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <span className="text-[10px] font-mono text-slate-400">
            VASWANI RETURN ENTERPRISE v4.8 • ALL SETTINGS CONSOLIDATED &amp; PERSISTED
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-all shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
