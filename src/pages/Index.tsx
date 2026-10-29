import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck, ArrowRight, ArrowLeft, Plus, Sparkles, Building2,
  FileSpreadsheet, RotateCcw, CloudDownload, Settings, Cloud, History,
  Users, Database, FileCode2, Send, ImageIcon,
  Lock, Key, Laptop, Activity, Server, AlertCircle, LogOut,
  ChevronRight, CalendarClock, ShieldAlert, GitCompare,
  Star, MessageSquare, X, Phone, Mail, MapPin, CheckCircle2, AlertTriangle, Lightbulb, Zap, Search,
  BookOpen, Landmark, ArrowRightLeft, Calculator, Table, DownloadCloud, ArrowUpRight
} from 'lucide-react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { FileUploadZone } from '@/components/FileUploadZone';
import { Progress } from '@/components/ui/progress';
import { ColumnMapper, isMappingComplete } from '@/components/ColumnMapper';
import { ResultsCategoryTabs } from '@/components/ResultsCategoryTabs';
import { SummaryCards } from '@/components/SummaryCards';
import { MonthlyBreakdown } from '@/components/MonthlyBreakdown';
import { PartyWiseReport } from '@/components/PartyWiseReport';
import { ModeSelector } from '@/components/ModeSelector';
import { ModeSwitcher } from '@/components/ModeSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { parseGSTR3BFile, type GSTR3BDataBlock } from '@/lib/gstr3bParser';
import { TERMS, type ReconciliationMode } from '@/lib/mode';
import {
  parseFile, detectColumnMapping, mapToRecords,
  type ColumnMapping, type DebitNoteRecord,
  exportMonthlyComparison, exportMonthlyDiffSheets, exportPartyWise, type MonthlyComparisonRow
} from '@/lib/fileParser';
import { parseFileAsync, reconcileAsync } from '@/lib/asyncWorkerService';
import { reconcile, getSummary, detectGstinIssues, type ReconciliationResult, type ReconciliationSummary, type GstinIssue } from '@/lib/reconciliation';
import { aggregateByParty } from '@/lib/partyWise';
import { cn } from '@/lib/utils';
import { GSTVerification } from '@/components/GSTVerification';
import { executeOutputReconciliation } from '@/lib/outputReconciliationService';
import { reconcileDebitNotes, exportDebitNoteReconciliation } from '@/lib/debitNoteEngine';

// Import compliance suites
import Splash from './Splash';
import AdminPanel from './AdminPanel';
import ClientDashboard from './ClientDashboard';
import Consolidation from './Consolidation';
import TallyConverter from './TallyConverter';
import TallyDirectImport from './TallyDirectImport';
import TallyLedgerImport from './TallyLedgerImport';
import ReturnsDashboard from './ReturnsDashboard';
import LandingPage from './LandingPage';
import GSTR2BTracker from './GSTR2BTracker';
import FinancialStatements from './FinancialStatements';
import Reconciliation from './Reconciliation';
import TdsReconciliation from './TdsReconciliation';
import GstinScan from './GstinScan';
import CmaReport from './CmaReport';
import DepreciationModule from './DepreciationModule';
import AuditModule from './AuditModule';
import UserGuideCenter from '@/components/UserGuideCenter';
import { GDriveConnectModal } from '@/components/GDriveConnectModal';
import { RecoHistoryModal } from '@/components/RecoHistoryModal';
import IncomeTaxDashboard from './IncomeTaxDashboard';
import GstNoticesDashboard from './GstNoticesDashboard';
import TaxAuditClause44 from './TaxAuditClause44';
import VoucherReclassifier from './VoucherReclassifier';
import BankCmaAppraisal from './BankCmaAppraisal';
import { AppShell } from '@/components/AppShell';

// CSS theme styles passed down for splash screen and visual presentations
const themeStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Inter:wght@400;600;800;900&display=swap');
  
  .particle {
    position: absolute;
    bottom: -10px;
    background: rgba(255, 255, 255, 0.4);
    border-radius: 50%;
    animation: float-up infinite linear;
  }
  @keyframes float-up {
    0% { transform: translateY(0) scale(1); opacity: 0; }
    10% { opacity: 0.4; }
    90% { opacity: 0.4; }
    100% { transform: translateY(-105vh) scale(0.4); opacity: 0; }
  }
  .global-bg {
    background: #F8FAFC;
  }
  .glass-card-np {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 1.5rem;
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .glass-card-np:hover {
    border-color: var(--card-hover-border);
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.07), 0 8px 10px -6px rgba(0, 0, 0, 0.04);
    transform: translateY(-4px);
  }
  .neon-amber { --card-hover-border: #F59E0B; --card-glow: rgba(245, 158, 11, 0.12); }
  .neon-blue { --card-hover-border: #2563EB; --card-glow: rgba(37, 99, 235, 0.12); }
  .neon-emerald { --card-hover-border: #059669; --card-glow: rgba(5, 150, 105, 0.12); }
  .neon-pink { --card-hover-border: #DB2777; --card-glow: rgba(219, 39, 119, 0.12); }
  .neon-purple { --card-hover-border: #7C3AED; --card-glow: rgba(124, 58, 237, 0.12); }
  .neon-yellow { --card-hover-border: #D97706; --card-glow: rgba(217, 119, 6, 0.12); }
  .neon-indigo { --card-hover-border: #4F46E5; --card-glow: rgba(79, 70, 229, 0.12); }
`;

// Safe storage utilities wrapped in try-catch to prevent Electron security violations
const safeGetItem = (key: string, isLocal = false) => {
  try {
    const storage = isLocal ? window.localStorage : window.sessionStorage;
    return storage.getItem(key);
  } catch (e) {
    console.warn(`Storage access denied for key "${key}":`, e);
    return null;
  }
};

const safeSetItem = (key: string, value: string, isLocal = false) => {
  try {
    const storage = isLocal ? window.localStorage : window.sessionStorage;
    storage.setItem(key, value);
  } catch (e) {
    console.warn(`Storage write failed for key "${key}":`, e);
  }
};

const safeRemoveItem = (key: string, isLocal = false) => {
  try {
    const storage = isLocal ? window.localStorage : window.sessionStorage;
    storage.removeItem(key);
  } catch (e) {
    console.warn(`Storage deletion failed for key "${key}":`, e);
  }
};

const getApiHost = () => {
  try {
    const mode = localStorage.getItem('np_app_mode');
    if (mode === 'server') return 'localhost';
  } catch (e) { }
  return safeGetItem('np_server_ip', true) || window.location.hostname || '127.0.0.1';
};

type Step = 'upload' | 'map' | 'review' | 'results';

export default function Index() {
  // --- 1. ENTRY HOMEPAGE VISITATION STATE ---
  const [visitedLanding, setVisitedLanding] = useState<boolean>(() => {
    return safeGetItem('np_visited_landing') === 'true';
  });

  // --- 2. DEVICE & LICENSE ACTIVATION LAYOUT STATES ---
  const [deviceId] = useState<string>(() => {
    let dId = safeGetItem('np_device_id', true);
    if (!dId) {
      dId = 'dev_' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
      safeSetItem('np_device_id', dId, true);
    }
    return dId;
  });

  const [isActivated, setIsActivated] = useState<boolean>(() => {
    return safeGetItem('np_is_activated', true) === 'true';
  });

  const [serialKey, setSerialKey] = useState<string>(() => {
    return safeGetItem('np_serial_key', true) || '';
  });

  const [activationInput, setActivationInput] = useState('');

  // --- 3. AUTHENTICATION & LOCK LAYOUT STATES ---
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return safeGetItem('np_auth') === 'true' || safeGetItem('np_auth', true) === 'true';
  });

  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return safeGetItem('np_admin') === 'true' || safeGetItem('np_admin', true) === 'true';
  });

  const [loginUser, setLoginUser] = useState<string>(() => {
    return safeGetItem('np_user') || safeGetItem('np_user', true) || '';
  });

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isServerOffline, setIsServerOffline] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // --- ADMIN FIRST-RUN SETUP STATES ---
  const [adminSetupRequired, setAdminSetupRequired] = useState(false);
  const [setupPassword, setSetupPassword] = useState('');
  const [setupPasswordConfirm, setSetupPasswordConfirm] = useState('');

  // --- 4. DASHBOARD ROUTER & SPLASH SCREEN LAYOUT STATES ---
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    return localStorage.getItem('np_splash_shown') !== 'true';
  });
  const [showFeedback, setShowFeedback] = useState(false);
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [guideActiveModule, setGuideActiveModule] = useState<string>('intro');
  const [isGDriveConnectOpen, setIsGDriveConnectOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [appRoute, setAppRoute] = useState<'hub' | 'reco' | 'tally' | 'tally-direct' | 'ledger-import' | 'consolidation' | 'dashboard' | 'returns' | 'tracker' | 'fin-statements' | 'gstin-scan' | 'tds-reco' | 'cma' | 'bank-cma' | 'depreciation' | 'audit' | 'income-tax' | 'clause44' | 'voucher-reclass'>(() => {
    return (safeGetItem('np_app_route') as any) || 'hub';
  });

  const [activeCategoryCard, setActiveCategoryCard] = useState<'returns' | 'wip' | 'reco' | 'collector' | 'audit' | 'tax' | 'cma-bank' | null>(null);
  const [returnsInitialTab, setReturnsInitialTab] = useState<'working3b' | 'matrix' | 'ims2b' | 'gstr2b_downloader' | 'gstr1_downloader' | 'returns_tracking'>('working3b');
  const [returnsTargetClient, setReturnsTargetClient] = useState<{ gstin?: string; clientName?: string } | null>(null);

    const [showAdmin, setShowAdmin] = useState(false);
    const [networkDiagnostics, setNetworkDiagnostics] = useState({ latency: 0, status: 'Online' });
    const [serverIpInput, setServerIpInput] = useState(() => getApiHost());
    const [showIpConfig, setShowIpConfig] = useState(false);

    // --- FEEDBACK SYSTEM STATES ---
    const [feedbackList, setFeedbackList] = useState<{ name: string; rating: number; message: string; date: string }[]>(() => {
      try { return JSON.parse(safeGetItem('np_feedback_list', true) || '[]'); } catch { return []; }
    });

    // --- 5. RECONCILIATION ENGINE WORKSPACE STATES ---
    const [mode, setMode] = useState<ReconciliationMode | null>(() => {
      return (safeGetItem('np_reco_mode') as ReconciliationMode | null) || null;
    });

    const [step, setStep] = useState<Step>(() => {
      return (safeGetItem('np_reco_step') as Step) || 'upload';
    });

    const [processing, setProcessing] = useState(false);
    const [progressValue, setProgressValue] = useState(0);
    const [progressStage, setProgressStage] = useState('');
    const [companyName, setCompanyName] = useState<string>(() => {
      return safeGetItem('np_reco_company') || '';
    });

    const [tolerance, setTolerance] = useState<number>(() => {
      return parseFloat(safeGetItem('np_reco_tolerance') || '2');
    });

    // Re-parsed mapping/files states retrieved on reload
    const [prHeaders, setPrHeaders] = useState<string[]>(() => {
      try { return JSON.parse(safeGetItem('np_pr_headers') || '[]'); } catch { return []; }
    });
    const [twoBHeaders, setTwoBHeaders] = useState<string[]>(() => {
      try { return JSON.parse(safeGetItem('np_twob_headers') || '[]'); } catch { return []; }
    });

    const [prMapping, setPrMapping] = useState<Partial<ColumnMapping>>(() => {
      try { return JSON.parse(safeGetItem('np_pr_mapping') || '{}'); } catch { return {}; }
    });
    const [twoBMapping, setTwoBMapping] = useState<Partial<ColumnMapping>>(() => {
      try { return JSON.parse(safeGetItem('np_twob_mapping') || '{}'); } catch { return {}; }
    });

    const [results, setResults] = useState<ReconciliationResult[] | null>(() => {
      try { return JSON.parse(safeGetItem('np_reco_results') || 'null'); } catch { return null; }
    });
    const [summary, setSummary] = useState<ReconciliationSummary | null>(() => {
      try { return JSON.parse(safeGetItem('np_reco_summary') || 'null'); } catch { return null; }
    });

    const [gstIssues, setGstIssues] = useState<{ suggested: GstinIssue[]; conflicts: GstinIssue[] } | null>(() => {
      try { return JSON.parse(safeGetItem('np_reco_issues') || 'null'); } catch { return null; }
    });

    const [appliedGstins, setAppliedGstins] = useState<{ partyName: string; originalGstin: string; appliedGstin: string; status: string; }[]>(() => {
      try { return JSON.parse(safeGetItem('np_reco_applied_gstins') || '[]'); } catch { return []; }
    });

    // Supporting file objects (which can't be serialized, requiring re-upload or using state arrays)
    const [prFile, setPrFile] = useState<File | null>(null);
    const [twoBFile, setTwoBFile] = useState<File | null>(null);
    const [gstr3bFile, setGstr3bFile] = useState<File | null>(null);
    const [gstr3bData, setGstr3bData] = useState<GSTR3BDataBlock[] | null>(null);

    const [fuzzyStrictness, setFuzzyStrictness] = useState<'high' | 'medium' | 'low'>(() => {
      return (safeGetItem('np_reco_fuzzy') as 'high' | 'medium' | 'low') || 'medium';
    });
    const [ignoreSpecialChars, setIgnoreSpecialChars] = useState<boolean>(() => {
      return safeGetItem('np_reco_chars') !== 'false';
    });
    const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

    const [booksQueue, setBooksQueue] = useState<{ id: string; file: File; docType: string; }[]>([]);
    const [portalQueue, setPortalQueue] = useState<{ id: string; file: File; docType: string; }[]>([]);
    const [portalMappings, setPortalMappings] = useState<Record<string, { mapping: Partial<ColumnMapping>, headers: string[], docType: string }>>({});
    const [isPreparingPipeline, setIsPreparingPipeline] = useState(false);
    const [booksDrag, setBooksDrag] = useState(false);
    const [portalDrag, setPortalDrag] = useState(false);
    const [outputResults, setOutputResults] = useState<any | null>(null);

    const handleGSTR3BUpload = async (f: File) => {
      setGstr3bFile(f);
      try {
        const parsed = await parseGSTR3BFile(f);
        setGstr3bData(parsed);
        toast.success('GSTR-3B parsed successfully for Monthly Comparison!');
      } catch (err) {
        toast.error('Failed to parse GSTR-3B summary return.', {
          description: String(err)
        });
        setGstr3bFile(null);
      }
    };
    const [journals, setJournals] = useState<{ file: File; mapping: Partial<ColumnMapping>; headers: string[] }[]>([]);

    const [prDnFile, setPrDnFile] = useState<File | null>(null);
    const [prCnFile, setPrCnFile] = useState<File | null>(null);
    const [twoBDnFile, setTwoBDnFile] = useState<File | null>(null);
    const [prDnHeaders, setPrDnHeaders] = useState<string[]>([]);
    const [prCnHeaders, setPrCnHeaders] = useState<string[]>([]);
    const [twoBDnHeaders, setTwoBDnHeaders] = useState<string[]>([]);
    const [prDnMapping, setPrDnMapping] = useState<Partial<ColumnMapping>>({});
    const [prCnMapping, setPrCnMapping] = useState<Partial<ColumnMapping>>({});
    const [twoBDnMapping, setTwoBDnMapping] = useState<Partial<ColumnMapping>>({});
    const [parsedDebitNotes, setParsedDebitNotes] = useState<{ pr: DebitNoteRecord[]; twoB: DebitNoteRecord[] }>(() => {
      try { return JSON.parse(safeGetItem('np_parsed_dn') || '{"pr":[],"twoB":[]}'); } catch { return { pr: [], twoB: [] }; }
    });

    // Auto-updater states
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [updateDownloaded, setUpdateDownloaded] = useState(false);
    const [updateVersion, setUpdateVersion] = useState('');
    const [checkingUpdates, setCheckingUpdates] = useState(false);

    const [appMode, setAppMode] = useState<'server' | 'client'>('server');
    const [appModeLoaded, setAppModeLoaded] = useState(false);
    const [serverIpInfo, setServerIpInfo] = useState<{ ip: string, port: number, pcName: string } | null>(null);
    const [isScanningNetwork, setIsScanningNetwork] = useState(false);
    const [moduleConfig, setModuleConfig] = useState<Record<string, number>>({});

    // LAYER 3.5: Splash Screen handler (MUST BE ABOVE EARLY RETURNS)
    const handleSplashComplete = useCallback(() => {
      setShowSplash(false);
      safeSetItem('np_splash_shown', 'true');
    }, []);

    useEffect(() => {
      if ((window as any).electronAPI && (window as any).electronAPI.invoke) {
        (window as any).electronAPI.invoke('get_app_mode').then((mode: any) => {
          const finalMode = mode || 'server';
          setAppMode(finalMode);
          localStorage.setItem('np_app_mode', finalMode);
          setAppModeLoaded(true);
          if (finalMode === 'server') {
            fetch(`http://localhost:3001/api/network-info`).then(r => r.json()).then(data => setServerIpInfo(data)).catch(() => { });
          }
        }).catch(() => {
          setAppMode('server');
          setAppModeLoaded(true);
        });
      } else {
        setAppMode('server');
        setAppModeLoaded(true);
      }
    }, []);

    useEffect(() => {
      if (isAuthenticated) {
        const ping = () => {
          const token = safeGetItem('np_token') || safeGetItem('np_token', true);
          if (!token || token === 'null' || token === 'undefined') return;

          fetch(`http://${getApiHost()}:3001/api/heartbeat`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          }).then(async (res) => {
            setIsServerOffline(false);
            if (res.status === 410) {
              localStorage.clear();
              sessionStorage.clear();
              if ((window as any).electronAPI) await (window as any).electronAPI.invoke('set_app_mode', null);
              window.location.reload();
              return;
            }
            if (res.status === 403) {
              handleLogout();
              toast.error("Session terminated by Administrator.");
            }
          }).catch(() => {
            setIsServerOffline(true);
          });
          fetchModules();
        };

        const fetchModules = () => {
          const token = safeGetItem('np_token') || safeGetItem('np_token', true);
          if (!token || token === 'null' || token === 'undefined') return;

          fetch(`http://${getApiHost()}:3001/api/usage`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }).then(r => r.json()).then(data => {
            const config: Record<string, number> = {};
            if (Array.isArray(data)) data.forEach(d => { config[d.name] = d.is_enabled; });
            sessionStorage.setItem('np_module_config', JSON.stringify(config));
            setModuleConfig(prev => JSON.stringify(prev) === JSON.stringify(config) ? prev : config);
          }).catch(() => { });
        };

        ping(); // Ping immediately on auth
        const interval = setInterval(ping, 2000); // Ping every 2s (real-time sync)

        return () => clearInterval(interval);
      }
    }, [isAuthenticated]);

    // --- 6. WORKSPACE PROGRESS STORAGE MIRRORING HOOKS (EFFECTS) ---
    useEffect(() => {
      safeSetItem('np_visited_landing', visitedLanding ? 'true' : 'false');
    }, [visitedLanding]);

    useEffect(() => {
      safeSetItem('np_app_route', appRoute);
    }, [appRoute]);

    useEffect(() => {
      safeSetItem('np_reco_mode', mode || '');
    }, [mode]);

    useEffect(() => {
      safeSetItem('np_reco_step', step);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [step]);

    useEffect(() => {
      safeSetItem('np_reco_company', companyName);
    }, [companyName]);

    // Global listener for unified module and client navigation (e.g. from Sourav AI Assistant)
    useEffect(() => {
      const handleAppNavigate = (e: any) => {
        const { route, tabId, gstin, clientName } = e.detail || {};
        if (clientName) {
          setCompanyName(clientName);
          try {
            localStorage.setItem('np_reco_company', clientName);
            localStorage.setItem('np_company_name', clientName);
          } catch {}
        }
        if (gstin) {
          try {
            localStorage.setItem('gstr3b_active_client_gstin', gstin);
          } catch {}
          setReturnsTargetClient({ gstin, clientName });
        }
        if (route) {
          setAppRoute(route as any);
        }
        if (tabId && (route === 'returns' || !route)) {
          if (tabId === 'ims') setReturnsInitialTab('ims2b');
          else if (tabId === 'gstr3b') setReturnsInitialTab('working3b');
          else if (tabId === 'gstr1') setReturnsInitialTab('gstr1_downloader');
          else if (tabId === '2b' || tabId === 'gstr2b') setReturnsInitialTab('gstr2b_downloader');
          else setReturnsInitialTab(tabId as any);
        }
      };
      window.addEventListener('app-navigate', handleAppNavigate as any);
      return () => window.removeEventListener('app-navigate', handleAppNavigate as any);
    }, []);

    useEffect(() => {
      safeSetItem('np_reco_company', companyName);
    }, [companyName]);

    useEffect(() => {
      safeSetItem('np_reco_tolerance', tolerance.toString());
    }, [tolerance]);

    useEffect(() => {
      safeSetItem('np_pr_headers', JSON.stringify(prHeaders));
    }, [prHeaders]);

    useEffect(() => {
      safeSetItem('np_twob_headers', JSON.stringify(twoBHeaders));
    }, [twoBHeaders]);

    useEffect(() => {
      safeSetItem('np_pr_mapping', JSON.stringify(prMapping));
    }, [prMapping]);

    useEffect(() => {
      safeSetItem('np_twob_mapping', JSON.stringify(twoBMapping));
    }, [twoBMapping]);

    useEffect(() => {
      if (results) safeSetItem('np_reco_results', JSON.stringify(results));
      else safeRemoveItem('np_reco_results');
    }, [results]);

    useEffect(() => {
      if (summary) safeSetItem('np_reco_summary', JSON.stringify(summary));
      else safeRemoveItem('np_reco_summary');
    }, [summary]);

    useEffect(() => {
      safeSetItem('np_parsed_dn', JSON.stringify(parsedDebitNotes));
    }, [parsedDebitNotes]);

    // Persist feedback list
    useEffect(() => {
      safeSetItem('np_feedback_list', JSON.stringify(feedbackList), true);
    }, [feedbackList]);

    // Network diagnostics ping to local server
    useEffect(() => {
      if (!isAuthenticated) return;
      const checkServer = () => {
        const start = Date.now();
        fetch(`http://${getApiHost()}:3001/api/ping`)
          .then((res) => {
            if (!res.ok) throw new Error('Server returned non-200');
            setNetworkDiagnostics({
              latency: Date.now() - start,
              status: 'Connected'
            });
          })
          .catch(() => {
            setNetworkDiagnostics({
              latency: 0,
              status: 'Offline'
            });
          });
      };
      checkServer();
      const timer = setInterval(checkServer, 10000);
      return () => clearInterval(timer);
    }, [isAuthenticated]);

    // Auto-updater event listeners
    useEffect(() => {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI) {
        electronAPI.onUpdateAvailable((info: any) => {
          setCheckingUpdates(false);
          setUpdateAvailable(true);
          setUpdateVersion(info?.version || '');
          toast('A new update is available!', {
            description: `Version ${info?.version || ''} will download automatically.`,
            duration: 10000,
          });
        });

        electronAPI.onUpdateDownloaded((info: any) => {
          setUpdateDownloaded(true);
          setUpdateVersion(info?.version || '');
          toast.success('Update Ready', {
            description: `Version ${info?.version || ''} is ready to install.`,
            action: {
              label: 'Install',
              onClick: () => electronAPI.restartApp(),
            },
            duration: 100000,
          });
        });

        electronAPI.onDownloadProgress(() => {
          setCheckingUpdates(true);
        });
      }
    }, []);

    const handleCheckForUpdates = () => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI) return;
      setCheckingUpdates(true);
      electronAPI.checkForUpdates();
      toast('Checking for updates...', {
        description: 'Looking for the latest app version from GitHub.',
        duration: 5000,
      });
    };

    const handleInstallUpdate = () => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI) return;
      electronAPI.restartApp();
    };

    // --- 7. ACTION & COMPLIANCE TRANSACTION METHODS ---
    const handleReset = (full = false) => {
      if (full) setMode(null);
      setStep('upload');
      setPrFile(null);
      setTwoBFile(null);
      setGstr3bFile(null);
      setGstr3bData(null);
      setJournals([]);
      setResults(null);
      setSummary(null);
      setOutputResults(null);
      setBooksQueue([]);
      setPortalQueue([]);
      setPortalMappings({});
      setPrMapping({});
      setTwoBMapping({});
      setPrDnFile(null);
      setPrCnFile(null);
      setTwoBDnFile(null);
      setPrDnMapping({});
      setPrCnMapping({});
      setTwoBDnMapping({});
      setParsedDebitNotes({ pr: [], twoB: [] });

      // Clear storage references
      safeRemoveItem('np_reco_mode');
      safeRemoveItem('np_reco_step');
      safeRemoveItem('np_pr_headers');
      safeRemoveItem('np_twob_headers');
      safeRemoveItem('np_pr_mapping');
      safeRemoveItem('np_twob_mapping');
      safeRemoveItem('np_reco_results');
      safeRemoveItem('np_reco_summary');
      safeRemoveItem('np_parsed_dn');
    };

    const handlePrUpload = async (f: File, headersOnly = false) => {
      setPrFile(f);
      const { headers } = await parseFileAsync(f, { headersOnly }, (stage, pct) => { setProgressStage(stage); setProgressValue(pct); });
      setPrHeaders(headers);
      setPrMapping(detectColumnMapping(headers));
    };

    const handleTwoBUpload = async (f: File, headersOnly = false) => {
      setTwoBFile(f);
      const { headers } = await parseFileAsync(f, { headersOnly, docType: mode === 'input' ? '2b' : 'b2b' }, (stage, pct) => { setProgressStage(stage); setProgressValue(pct); });
      setTwoBHeaders(headers);
      setTwoBMapping(detectColumnMapping(headers));
    };

    const handleJournalUpload = async (files: File[], headersOnly = false) => {
      const newJournals = await Promise.all(
        files.map(async (f) => {
          const { headers } = await parseFileAsync(f, { headersOnly }, (stage, pct) => { setProgressStage(stage); setProgressValue(pct); });
          return { file: f, headers, mapping: detectColumnMapping(headers) };
        })
      );
      setJournals((prev) => [...prev, ...newJournals]);
    };

    const handlePrDnUpload = async (f: File, headersOnly = false) => {
      setPrDnFile(f);
      const { headers } = await parseFileAsync(f, { headersOnly, findHeader: true, sheetName: 'Sheet2' }, (stage, pct) => { setProgressStage(stage); setProgressValue(pct); });
      setPrDnHeaders(headers);
      setPrDnMapping(detectColumnMapping(headers));
    };

    const handlePrCnUpload = async (f: File, headersOnly = false) => {
      setPrCnFile(f);
      const { headers } = await parseFileAsync(f, { headersOnly, findHeader: true }, (stage, pct) => { setProgressStage(stage); setProgressValue(pct); });
      setPrCnHeaders(headers);
      setPrCnMapping(detectColumnMapping(headers));
    };

    const handleTwoBDnUpload = async (f: File, headersOnly = false) => {
      setTwoBDnFile(f);
      const { headers } = await parseFileAsync(f, { headersOnly, findHeader: true, docType: 'cn', sheetName: 'CDNR' }, (stage, pct) => { setProgressStage(stage); setProgressValue(pct); });
      setTwoBDnHeaders(headers);
      setTwoBDnMapping(detectColumnMapping(headers));
    };

    const removeJournal = (idx: number) => {
      setJournals((prev) => prev.filter((_, i) => i !== idx));
    };

    const handleProceedToMap = () => {
      if (prFile && twoBFile) setStep('map');
    };

    const handleReconcile = async () => {
      try {
        const res = await fetch(`http://${window.location.hostname || '127.0.0.1'}:3001/api/usage/increment`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module_name: 'RecoEngine' })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 403) {
            toast.error('Module Locked', { description: data.error || 'Usage limit reached' });
            return;
          }
        }
      } catch (err) {
        console.warn('Usage limit server unavailable, continuing offline match engine execution.');
      }
      setProcessing(true);
      setProgressValue(5);
      try {
        await new Promise((r) => setTimeout(r, 100)); // Yield to UI

        const primaryBookFile = prFile || booksQueue.find(q => q.docType === 'primary')?.file || booksQueue[0]?.file;
        const primaryPortalFile = twoBFile || portalQueue.find(q => q.docType === 'primary' || q.docType === 'b2b')?.file || portalQueue[0]?.file;

        if (!primaryBookFile) {
          toast.error('Primary Books File Missing', { description: 'Please assign a Primary role to your Books file in Step 1.' });
          setProcessing(false);
          return;
        }

        const prParsed = await parseFileAsync(primaryBookFile, undefined, (stage, pct) => { setProgressStage(stage); setProgressValue(Math.round(pct * 0.25)); });
        const prRecs = mapToRecords(prParsed.rows, prMapping as ColumnMapping, 'PR', mode === 'input' ? 'Purchase Register' : 'Sales Register');
        setProgressValue(25);
        await new Promise((r) => setTimeout(r, 50));

        let twoBParsed: any = { rows: [], headers: [] };
        let twoBRecs: any[] = [];
        if (primaryPortalFile) {
          twoBParsed = await parseFileAsync(primaryPortalFile, { findHeader: true, docType: mode === 'input' ? '2b' : 'b2b' }, (stage, pct) => { setProgressStage(stage); setProgressValue(25 + Math.round(pct * 0.2)); });
          twoBRecs = mapToRecords(twoBParsed.rows, twoBMapping as ColumnMapping, '2B', mode === 'input' ? 'GSTR-2B' : 'GSTR-1');
        }
        setProgressValue(45);
        await new Promise((r) => setTimeout(r, 50));

        for (const j of journals) {
          const jParsed = await parseFileAsync(j.file);
          const jRecs = mapToRecords(jParsed.rows, j.mapping as ColumnMapping, 'PR', mode === 'input' ? 'Journal' : 'Sales Book');
          prRecs.push(...jRecs);
        }
        setProgressValue(60);
        await new Promise((r) => setTimeout(r, 50));

        if (mode === 'output' && portalMappings) {
          for (const [id, pMap] of Object.entries(portalMappings as Record<string, any>)) {
            const q = portalQueue.find(x => x.id === id);
            if (q && q.file === primaryPortalFile && (q.docType === 'b2b' || q.docType === 'primary')) continue;
            if (q && q.docType !== 'primary' && q.docType !== 'b2b' && q.docType !== 'debit_note' && q.docType !== 'gstr3b') {
              const pParsed = await parseFileAsync(q.file, { findHeader: true, docType: q.docType });
              const pRecs = mapToRecords(pParsed.rows, pMap.mapping as ColumnMapping, '2B', q.docType);
              twoBRecs.push(...pRecs);
            }
          }
        }

        const parsedPrDn: DebitNoteRecord[] = [];
        const parsedTwoBDn: DebitNoteRecord[] = [];
        if (prDnFile) {
          const parsed = await parseFileAsync(prDnFile, { findHeader: true, sheetName: 'Sheet2' });
          const effectivePrDnMapping = { ...detectColumnMapping(parsed.headers), ...(prDnMapping && Object.keys(prDnMapping).length > 0 ? prDnMapping : {}) } as ColumnMapping;
          const recs = mapToRecords(parsed.rows, effectivePrDnMapping, 'PR', 'Purchase Return');
          parsedPrDn.push(...recs.map((r, idx) => ({
            invoiceDate: r.invoiceDate,
            cgst: r.cgst,
            sgst: r.sgst,
            igst: r.igst,
            gstin: r.gstin || '',
            supplierName: r.supplierName || '',
            invoiceNo: r.invoiceNo || '',
            taxableValue: r.taxableValue,
            invoiceValue: r.invoiceValue,
            raw: parsed.rows[idx] || (r as any).raw || r
          })));
        } else if (prFile && mode === 'input') {
          try {
            const parsed = await parseFileAsync(prFile, { findHeader: true, sheetName: 'Sheet2' });
            if (parsed && parsed.rows && parsed.rows.length > 0) {
              const effectivePrDnMapping = { ...detectColumnMapping(parsed.headers), ...(prDnMapping && Object.keys(prDnMapping).length > 0 ? prDnMapping : {}) } as ColumnMapping;
              const recs = mapToRecords(parsed.rows, effectivePrDnMapping, 'PR', 'Purchase Return');
              parsedPrDn.push(...recs.map((r, idx) => ({
                invoiceDate: r.invoiceDate,
                cgst: r.cgst,
                sgst: r.sgst,
                igst: r.igst,
                gstin: r.gstin || '',
                supplierName: r.supplierName || '',
                invoiceNo: r.invoiceNo || '',
                taxableValue: r.taxableValue,
                invoiceValue: r.invoiceValue,
                raw: parsed.rows[idx] || (r as any).raw || r
              })));
            }
          } catch (e) {
            // Ignore if no Sheet2
          }
        }
        if (twoBDnFile) {
          const parsed = await parseFileAsync(twoBDnFile, { findHeader: true, docType: 'cn', sheetName: 'CDNR' });
          const effectiveTwoBDnMapping = { ...detectColumnMapping(parsed.headers), ...(twoBDnMapping && Object.keys(twoBDnMapping).length > 0 ? twoBDnMapping : {}) } as ColumnMapping;
          const recs = mapToRecords(parsed.rows, effectiveTwoBDnMapping, '2B', 'cn');
          parsedTwoBDn.push(...recs.map((r, idx) => ({
            invoiceDate: r.invoiceDate,
            cgst: r.cgst,
            sgst: r.sgst,
            igst: r.igst,
            gstin: r.gstin || '',
            supplierName: r.supplierName || '',
            invoiceNo: r.invoiceNo || '',
            taxableValue: r.taxableValue,
            invoiceValue: r.invoiceValue,
            raw: parsed.rows[idx] || (r as any).raw || r
          })));
        } else if (primaryPortalFile && mode === 'input') {
          try {
            const parsed = await parseFileAsync(primaryPortalFile, { findHeader: true, docType: 'cn', sheetName: 'CDNR' });
            if (parsed && parsed.rows && parsed.rows.length > 0) {
              const effectiveTwoBDnMapping = { ...detectColumnMapping(parsed.headers), ...(twoBDnMapping && Object.keys(twoBDnMapping).length > 0 ? twoBDnMapping : {}) } as ColumnMapping;
              const recs = mapToRecords(parsed.rows, effectiveTwoBDnMapping, '2B', 'cn');
              parsedTwoBDn.push(...recs.map((r, idx) => ({
                invoiceDate: r.invoiceDate,
                cgst: r.cgst,
                sgst: r.sgst,
                igst: r.igst,
                gstin: r.gstin || '',
                supplierName: r.supplierName || '',
                invoiceNo: r.invoiceNo || '',
                taxableValue: r.taxableValue,
                invoiceValue: r.invoiceValue,
                raw: parsed.rows[idx] || (r as any).raw || r
              })));
            }
          } catch (e) {
            // Ignore if no CDNR sheet
          }
        }
        setParsedDebitNotes({ pr: parsedPrDn, twoB: parsedTwoBDn });
        setProgressValue(75);
        await new Promise((r) => setTimeout(r, 150));

        if (mode === 'output') {
          const getVal = (r: any, keys: string[]) => {
            if (!r) return undefined;
            for (const k of keys) {
              if (k && r[k] !== undefined && r[k] !== '') return r[k];
            }
            const normKeys: Record<string, any> = {};
            for (const origKey of Object.keys(r)) {
              normKeys[origKey.trim().toLowerCase()] = r[origKey];
            }
            for (const k of keys) {
              if (!k) continue;
              const normK = k.trim().toLowerCase();
              if (normKeys[normK] !== undefined && normKeys[normK] !== '') return normKeys[normK];
            }
            return undefined;
          };

          const applyMap = (rows: any[], mapping: any) => (rows || []).map(r => {
            const m = mapping || {};
            return {
              'Invoice No.': getVal(r, [m.invoiceNo, 'Invoice No.', 'Note No.', 'Invoice No', 'Note No', 'Invoice Number']) || '',
              'Invoice Date': getVal(r, [m.invoiceDate, 'Invoice Date', 'Note Date', 'Date']) || '',
              'Month': getVal(r, [m.filingStatus, m.returnPeriod, 'Month', 'Return Period', 'Filing Period']) || '',
              'Party': getVal(r, [m.supplierName, 'Party', 'Receiver Name', 'Party Name', 'Customer Name', 'Particulars']) || '',
              'GST No.': getVal(r, [m.gstin, 'GST No.', 'GSTIN', 'GST No']) || '',
              'Taxable Value': getVal(r, [m.taxableValue, 'Taxable', 'Taxable Value', 'Taxable Amount']) || 0,
              'CGST': getVal(r, [m.cgst, 'CGST']) || 0,
              'SGST': getVal(r, [m.sgst, 'SGST']) || 0,
              'IGST': getVal(r, [m.igst, 'IGST']) || 0,
              'POS': getVal(r, [m.pos, 'POS', 'Place of Supply']) || '',
              'Nil Rated': getVal(r, [m.nilRated, 'Nil Rated', 'Nil Rated Supplies']) || 0,
              'Non Taxable': getVal(r, [m.nonTaxable, 'Non Taxable', 'Non-GST', 'Non-GST Supplies', 'Exempted', 'Exempted Supplies', 'Exempt']) || 0,
              'Voucher Type': getVal(r, ['Voucher Type', 'Voucher Type Name', 'Vch Type', 'Note Type']) || ''
            };
          });

          const booksSales = applyMap(prParsed.rows, prMapping);
          for (const j of journals) {
            const jp = await parseFileAsync(j.file);
            booksSales.push(...applyMap(jp.rows, j.mapping));
          }

          const prDnParsed = prDnFile ? await parseFileAsync(prDnFile, { findHeader: true, sheetName: 'Sheet2' }) : null;
          const prCnParsed = prCnFile ? await parseFileAsync(prCnFile) : null;

          const booksReturns = prDnParsed ? applyMap(prDnParsed.rows, prDnMapping) : [];
          const booksCreditNotes = prCnParsed ? applyMap(prCnParsed.rows, prCnMapping) : [];
          const booksDebitNotes = prDnParsed ? applyMap(prDnParsed.rows, prDnMapping) : [];
          const portalB2B: any[] = [];
          const portalCN: any[] = [];
          const portalB2C: any[] = [];
          const portalB2CL: any[] = [];
          const portalNil: any[] = [];
          const portalExport: any[] = [];

          const processedPortalFileKeys = new Set<string>();

          if (portalMappings && Object.keys(portalMappings).length > 0) {
            for (const [id, pMap] of Object.entries(portalMappings as Record<string, any>)) {
              const q = portalQueue.find(x => x.id === id);
              if (q) {
                const docCategory = (q.docType === 'b2b' || q.docType === 'primary') ? 'b2b' : q.docType;
                const fileKey = `${q.file.name}_${q.file.size}_${docCategory}`;
                if (processedPortalFileKeys.has(fileKey)) continue;
                processedPortalFileKeys.add(fileKey);

                const p = (q.file === primaryPortalFile && (q.docType === 'b2b' || q.docType === 'primary') && twoBParsed && twoBParsed.rows && twoBParsed.rows.length > 0)
                  ? twoBParsed
                  : await parseFileAsync(q.file, { findHeader: true, docType: q.docType });
                const mapped = applyMap(p.rows, pMap.mapping);
                if (q.docType === 'b2b' || q.docType === 'primary') portalB2B.push(...mapped);
                else if (q.docType === 'exp') portalExport.push(...mapped);
                else if (q.docType === 'b2c') portalB2C.push(...mapped);
                else if (q.docType === 'b2cl') portalB2CL.push(...mapped);
                else if (q.docType === 'cn') portalCN.push(...mapped);
                else if (q.docType === 'nil') portalNil.push(...mapped);
              }
            }
          }
          if (primaryPortalFile) {
            const fileKey = `${primaryPortalFile.name}_${primaryPortalFile.size}_b2b`;
            if (!processedPortalFileKeys.has(fileKey)) {
              processedPortalFileKeys.add(fileKey);
              const p = (twoBParsed && twoBParsed.rows && twoBParsed.rows.length > 0)
                ? twoBParsed
                : await parseFileAsync(primaryPortalFile, { findHeader: true, docType: 'b2b' });
              portalB2B.push(...applyMap(p.rows, twoBMapping));
            }
          }
          if (twoBDnFile) {
            const fileKey = `${twoBDnFile.name}_${twoBDnFile.size}_cn`;
            if (!processedPortalFileKeys.has(fileKey)) {
              processedPortalFileKeys.add(fileKey);
              const p = await parseFileAsync(twoBDnFile, { findHeader: true, docType: 'cn', sheetName: 'CDNR' });
              portalCN.push(...applyMap(p.rows, twoBDnMapping));
            }
          }

          const raw3bData = localStorage.getItem('np_gstr3b_data');
          const resolved3bData = raw3bData ? JSON.parse(raw3bData) : null;

          // DEBUG: Trace data being passed to output reconciliation


          setOutputResults(executeOutputReconciliation({ 
            booksSales, 
            booksReturns,
            booksCreditNotes,
            portalB2B, 
            portalExport,
            portalB2C, 
            portalB2CL, 
            portalCN, 
            portalNil,
            gstr3bData: resolved3bData
          }));
        }

        const filteredPrRecs = mode === 'output' ? prRecs.filter(r => r.gstin && r.gstin.trim().length >= 10) : prRecs;
        const filteredTwoBRecs = mode === 'output' ? twoBRecs.filter(r => r.gstin && r.gstin.trim().length >= 10) : twoBRecs;

        const res = await reconcileAsync(filteredPrRecs, filteredTwoBRecs, { mode: mode as 'input' | 'output', dateTolerance: tolerance, toleranceDays: 5 }, (stage, pct) => {
          setProgressStage(stage);
          setProgressValue(pct);
        });
        setProgressValue(95);
        await new Promise((r) => setTimeout(r, 150));

        setResults(res);
        setSummary(getSummary(res));
        const issues = detectGstinIssues(res);
        setGstIssues(issues);

        try {
          safeSetItem('np_reco_issues', JSON.stringify(issues));
          safeSetItem('np_reco_applied_gstins', '[]');
          safeSetItem('np_reco_results', JSON.stringify(res));
        } catch (e) {
          console.warn('Storage save skipped for large result payload:', e);
        }

        setProgressValue(100);
        await new Promise((r) => setTimeout(r, 150));

        // Advance to review step (GST verification) if issues exist, or directly to results dashboard if 0 issues
        const hasGstIssues = issues.suggested.length > 0 || issues.conflicts.length > 0;
        const targetStep = hasGstIssues ? 'review' : 'results';
        setStep(targetStep);
        safeSetItem('np_reco_step', targetStep);
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

        try {
          const newCount = parseInt(localStorage.getItem('np_usage_count') || '0') + 1;
          localStorage.setItem('np_usage_count', newCount.toString());
          if (newCount % 5 === 0) setShowFeedback(true);
        } catch (e) {}

        // Audit log registration on successful reconciliation
        if (isAuthenticated) {
          fetch(`http://${getApiHost()}:3001/audit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: loginUser,
              companyName: companyName || 'Unnamed Firm',
              mode,
              records: res.length,
              issues: res.filter(x => x.status !== 'Perfect Match').length
            })
          }).catch(() => { });
        }

      } catch (err) {
        console.error(err);
        toast.error('Reconciliation failed', { description: 'An error occurred while processing the files.' });
      } finally {
        setProcessing(false);
        setProgressValue(0);
      }
    };

    const handleExportMonthly = useCallback(() => {
      if (!results) return;
      try {
        const exportRows: MonthlyComparisonRow[] = results.map((r) => {
          const pr = r.prRecord;
          const tb = r.twoBRecord;
          return {
            partyTally: pr?.supplierName || '',
            gstinTally: pr?.gstin || '',
            invoiceTally: pr?.invoiceNo || '',
            cgstTally: pr?.cgst || 0,
            sgstTally: pr?.sgst || 0,
            igstTally: pr?.igst || 0,
            taxableTally: pr?.taxableValue || 0,
            dateTally: pr?.invoiceDate || '',
            partyCmp: tb?.supplierName || '',
            gstinCmp: tb?.gstin || '',
            invoiceCmp: tb?.invoiceNo || '',
            cgstCmp: tb?.cgst || 0,
            sgstCmp: tb?.sgst || 0,
            igstCmp: tb?.igst || 0,
            taxableCmp: tb?.taxableValue || 0,
            dateCmp: tb?.invoiceDate || '',
            status: r.status,
            totalDiff: (r.cgstDiff ?? 0) + (r.sgstDiff ?? 0) + (r.igstDiff ?? 0),
          };
        });
        exportMonthlyComparison(exportRows, 'Monthly_Comparison.xlsx', parsedDebitNotes, companyName);
        toast.success('Monthly comparison exported successfully!');
      } catch (err) {
        console.error('Monthly export error:', err);
        toast.error(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }, [results, parsedDebitNotes, companyName]);

    const handleExportMonthlyDiff = useCallback(() => {
      if (!results) return;
      try {
        const exportRows: MonthlyComparisonRow[] = results.map((r) => {
          const pr = r.prRecord;
          const tb = r.twoBRecord;
          return {
            partyTally: pr?.supplierName || '',
            gstinTally: pr?.gstin || '',
            invoiceTally: pr?.invoiceNo || '',
            cgstTally: pr?.cgst || 0,
            sgstTally: pr?.sgst || 0,
            igstTally: pr?.igst || 0,
            taxableTally: pr?.taxableValue || 0,
            dateTally: pr?.invoiceDate || '',
            partyCmp: tb?.supplierName || '',
            gstinCmp: tb?.gstin || '',
            invoiceCmp: tb?.invoiceNo || '',
            cgstCmp: tb?.cgst || 0,
            sgstCmp: tb?.sgst || 0,
            igstCmp: tb?.igst || 0,
            taxableCmp: tb?.taxableValue || 0,
            dateCmp: tb?.invoiceDate || '',
            status: r.status,
            totalDiff: (r.cgstDiff ?? 0) + (r.sgstDiff ?? 0) + (r.igstDiff ?? 0),
          };
        });
        exportMonthlyDiffSheets(exportRows, 'Monthly_Difference_Sheets.xlsx', parsedDebitNotes, companyName);
        toast.success('Monthly difference sheets exported successfully!');
      } catch (err) {
        console.error('Monthly diff export error:', err);
        toast.error(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }, [results, parsedDebitNotes, companyName]);

    const handleExportParty = useCallback(() => {
      if (!results) return;
      try {
        exportPartyWise(aggregateByParty(results, parsedDebitNotes), 'Party_Wise_Report.xlsx', companyName);
        toast.success('Party-wise report exported successfully!');
      } catch (err) {
        console.error('Party export error:', err);
        toast.error(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }, [results, parsedDebitNotes, companyName]);

    const handleExportDebitNotes = useCallback(() => {
      try {
        if (!parsedDebitNotes || (!parsedDebitNotes.pr?.length && !parsedDebitNotes.twoB?.length)) {
          toast.error('No Debit Notes data found to export.');
          return;
        }
        const dnResult = reconcileDebitNotes(parsedDebitNotes.pr || [], parsedDebitNotes.twoB || []);
        const fileName = companyName?.toUpperCase().includes('GOYAL') || companyName?.toUpperCase().includes('GTC') || !companyName
          ? 'GTC_Reconciled_Purchase_Return_vs_GSTR2B_25-26.xlsx'
          : `${companyName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Reconciled_Purchase_Return_vs_GSTR2B_25-26.xlsx`;
        exportDebitNoteReconciliation(dnResult, fileName, companyName || 'M/S GOYAL TRADING COMPANY');
        toast.success(`Reconciled Debit Notes report (${fileName}) downloaded successfully!`);
      } catch (err) {
        console.error('Debit notes export error:', err);
        toast.error(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }, [parsedDebitNotes, companyName]);

    // --- CHECK IF ADMIN ACCOUNT EXISTS (FIRST-RUN SETUP) ---
    useEffect(() => {
      let active = true;
      let retryCount = 0;
      const maxRetries = 3;

      const checkAdmin = () => {
        if (!appMode || (appMode === 'server' && !isActivated)) return;

        fetch(`http://${getApiHost()}:3001/api/admin-exists`)
          .then(res => {
            if (!res.ok) throw new Error(`Server returned ${res.status}`);
            return res.json();
          })
          .then(data => {
            if (!active) return;
            if (data && data.exists === false) {
              setAdminSetupRequired(true);
            } else {
              setAdminSetupRequired(false);
            }
          })
          .catch(err => {
            console.error('Could not check admin status', err);
            if (active && retryCount < maxRetries) {
              retryCount++;
              setTimeout(checkAdmin, 500 * retryCount);
            }
          });
      };

      checkAdmin();
      return () => { active = false; };
    }, [appMode, isActivated]);

    const handleAdminSetupSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (setupPassword !== setupPasswordConfirm) {
        toast.error('Passwords do not match!');
        return;
      }
      if (setupPassword.length < 5) {
        toast.error('Password must be at least 5 characters.');
        return;
      }
      const loadingId = toast.loading('Creating admin account...');
      try {
        const res = await fetch(`http://${getApiHost()}:3001/api/setup-admin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: setupPassword })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to setup admin');
        toast.success('Admin account created! You can now login with username "admin".', { id: loadingId });
        setAdminSetupRequired(false);
        setUsername('admin');
        setPassword(setupPassword);
      } catch (err: any) {
        toast.error(err.message, { id: loadingId });
      }
    };

    // --- 8. AUTHENTICATION LIFECYCLE HANDLERS ---
    const handleActivateSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!activationInput.trim()) return toast.error("Please enter a valid serial key.");

      const loadingId = toast.loading("Connecting to licensing server...");
      try {
        const res = await fetch(`http://${getApiHost()}:3001/api/activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serialKey: activationInput.trim().toUpperCase(), deviceId })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          safeSetItem('np_is_activated', 'true', true);
          safeSetItem('np_serial_key', activationInput.trim().toUpperCase(), true);
          setIsActivated(true);
          setSerialKey(activationInput.trim().toUpperCase());

          // Write activation/dissolve script locally
          if ((window as any).electronAPI) {
            (window as any).electronAPI.invoke('save_activation_info', {
              serial_key: activationInput.trim().toUpperCase(),
              device_id: deviceId
            }).catch(() => { });
          }

          toast.success("Software Activated Successfully!", { id: loadingId });
        } else {
          toast.error(data.error || "Activation failed. Check server connection.", { id: loadingId });
        }
      } catch (e) {
        toast.error("License server not responding. Verify local network.", { id: loadingId });
      }
    };

    const handleLoginSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!username.trim() || !password) return toast.error("All credentials required.");

      const loadingId = toast.loading("Authenticating secure session...");
      try {
        const res = await fetch(`http://${getApiHost()}:3001/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, deviceId })
        });
        const data = await res.json();
        if (res.ok && data.token) {
          sessionStorage.setItem('np_token', data.token);
          safeSetItem('np_token', data.token, true);

          safeSetItem('np_auth', 'true');
          safeSetItem('np_user', data.username);
          if (data.role === 'admin') safeSetItem('np_admin', 'true');

          if (rememberMe) {
            safeSetItem('np_auth', 'true', true);
            safeSetItem('np_user', data.username, true);
            if (data.role === 'admin') safeSetItem('np_admin', 'true', true);
          }

          // Write activation/dissolve script locally including user information
          if ((window as any).electronAPI) {
            const currentSerial = localStorage.getItem('np_serial_key') || '';
            (window as any).electronAPI.invoke('save_activation_info', {
              serial_key: currentSerial,
              device_id: deviceId,
              username: data.username,
              user_doc_id: data.userDocId
            }).catch(() => { });
          }

          setIsAuthenticated(true);
          setIsAdmin(data.role === 'admin');
          setLoginUser(data.username);
          setAppRoute('hub');
          toast.success("Filing session authenticated successfully!", { id: loadingId });
        } else {
          toast.error(data.error || "Login rejected.", { id: loadingId });
        }
      } catch (e) {
        toast.error("Offline security endpoint unavailable.", { id: loadingId });
      }
    };

    const handleLogout = () => {
      const token = safeGetItem('np_token') || safeGetItem('np_token', true);
      if (token && token !== 'null' && token !== 'undefined') {
        fetch(`http://${getApiHost()}:3001/api/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => { });
      }

      sessionStorage.removeItem('np_token');
      safeRemoveItem('np_token', true);
      safeRemoveItem('np_auth');
      safeRemoveItem('np_admin');
      safeRemoveItem('np_user');
      safeRemoveItem('np_app_route');
      safeRemoveItem('np_visited_landing');

      safeRemoveItem('np_auth', true);
      safeRemoveItem('np_admin', true);
      safeRemoveItem('np_user', true);

      setIsAuthenticated(false);
      setIsAdmin(false);
      setLoginUser('');
      setAppRoute('hub');
      setVisitedLanding(false);
      setShowAdmin(false);

      // Reset splash screen so it runs on the next login
      setShowSplash(true);
      safeRemoveItem('np_splash_shown');

      toast.info("Session securely ended.");
    };

    const handlePreparePipeline = async () => {
      if (!mode) return;
      const primaryBook = booksQueue.find(q => q.docType === 'primary');
      const primaryPortal = portalQueue.find(q => q.docType === 'primary' || (mode === 'output' && q.docType === 'b2b'));

      if (!primaryBook) return toast.error(`Please assign a ${TERMS[mode].primaryBookLabel} in Books.`);
      if (mode === 'input' && !primaryPortal) return toast.error(`Please assign a ${TERMS[mode].govtLabel} in Portal.`);
      if (mode === 'output' && portalQueue.every(q => !q.docType)) return toast.error(`Please assign at least one Portal Data type.`);

      setIsPreparingPipeline(true);
      const loadingId = toast.loading("Parsing source files and initializing pipeline...");
      await new Promise((r) => setTimeout(r, 40)); // Yield to allow DOM toast paint

      try {
        // Fast header-only parsing for instant pipeline initialization
        await handlePrUpload(primaryBook.file, true);
        if (primaryPortal) {
          await handleTwoBUpload(primaryPortal.file, true);
        } else {
          setTwoBFile(null);
          setTwoBHeaders([]);
          setTwoBMapping({});
        }

        if (mode === 'output') {
          const pMaps: any = {};
          const portalEntries = portalQueue.filter(q => q.docType && q.docType !== 'primary' && q.docType !== 'debit_note' && q.docType !== 'gstr3b');
          await Promise.all(portalEntries.map(async (q) => {
            const parsed = await parseFileAsync(q.file, { headersOnly: true, docType: q.docType });
            pMaps[q.id] = { mapping: detectColumnMapping(parsed.headers), headers: parsed.headers, docType: q.docType };
          }));
          setPortalMappings(pMaps);
        }

        const bDn = booksQueue.find(q => q.docType === 'debit_note');
        if (bDn) {
          await handlePrDnUpload(bDn.file, true);
        } else setPrDnFile(null);

        const bCn = booksQueue.find(q => q.docType === 'credit_note');
        if (bCn) {
          await handlePrCnUpload(bCn.file, true);
        } else setPrCnFile(null);

        const jFiles = booksQueue.filter(q => q.docType === 'journal').map(q => q.file);
        setJournals([]);
        if (jFiles.length > 0) {
          await handleJournalUpload(jFiles, true);
        }

        const pDn = portalQueue.find(q => q.docType === 'debit_note');
        if (pDn) {
          await handleTwoBDnUpload(pDn.file, true);
        } else setTwoBDnFile(null);

        const g3b = portalQueue.find(q => q.docType === 'gstr3b');
        if (g3b) await handleGSTR3BUpload(g3b.file);
        else { setGstr3bFile(null); setGstr3bData(null); }

        toast.success("Pipeline Ready", { id: loadingId });
        setStep('map');
      } catch (err: any) {
        console.error("Pipeline preparation error:", err);
        toast.error("Failed to parse files.", { id: loadingId, description: err?.message || 'Check file format' });
      } finally {
        setIsPreparingPipeline(false);
      }
    };

    const handleBooksDragOver = (e: any) => { e.preventDefault(); setBooksDrag(true); };
    const handleBooksDragLeave = () => setBooksDrag(false);
    const handleBooksDrop = (e: any) => {
      e.preventDefault(); setBooksDrag(false);
      if (e.dataTransfer.files) {
        const newFiles = Array.from(e.dataTransfer.files).map((f: any) => ({ id: Math.random().toString(36).substring(2), file: f as File, docType: '' }));
        setBooksQueue(prev => [...prev, ...newFiles]);
      }
    };
    const handlePortalDragOver = (e: any) => { e.preventDefault(); setPortalDrag(true); };
    const handlePortalDragLeave = () => setPortalDrag(false);
    const handlePortalDrop = (e: any) => {
      e.preventDefault(); setPortalDrag(false);
      if (e.dataTransfer.files) {
        const newFiles = Array.from(e.dataTransfer.files).map((f: any) => ({ id: Math.random().toString(36).substring(2), file: f as File, docType: '' }));
        setPortalQueue(prev => [...prev, ...newFiles]);
      }
    };

    // --- 9. CENTRAL RENDER MATCH ROTATION INTERFACE ---


    if (!appModeLoaded) {
      return (
        <div className="dark min-h-screen flex items-center justify-center bg-[#090d16]">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      );
    }



    // LAYER 0.2: Client Server Connection
    const isDefaultIp = getApiHost() === '127.0.0.1' || getApiHost() === 'localhost';
    if (appMode === 'client' && isDefaultIp && !isAuthenticated) {
      return (
        <>
          <style dangerouslySetInnerHTML={{ __html: themeStyles }} />
          <div className="dark min-h-screen flex items-center justify-center p-6 bg-[#090d16]">
            <div className="relative z-10 w-full max-w-md bg-slate-900/60 border border-slate-800 rounded-3xl p-8 backdrop-blur-xl shadow-2xl animate-pop-in">
              <button
                onClick={async () => {
                  if ((window as any).electronAPI) await (window as any).electronAPI.invoke('set_app_mode', null);
                  localStorage.removeItem('np_app_mode');
                  setAppMode(null);
                }}
                className="text-slate-400 hover:text-white flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px] mb-6 transition-colors"
              >
                <ArrowRight className="w-3 h-3 transform rotate-180" /> Change Mode
              </button>
              <div className="text-center mb-8">
                <h1 className="text-2xl font-black text-white tracking-tight">Connect to Server</h1>
                <p className="text-xs text-slate-400 mt-2">Enter the IP address of the main server or scan the local network.</p>
              </div>

              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={serverIpInput === '127.0.0.1' ? '' : serverIpInput}
                    onChange={(e) => setServerIpInput(e.target.value)}
                    placeholder="e.g. 192.168.1.100"
                    className="flex-1 h-12 bg-slate-950/80 border border-slate-700 rounded-xl px-4 text-sm text-white focus:border-blue-500 outline-none transition-colors"
                  />
                  <button
                    onClick={() => {
                      localStorage.setItem('np_server_ip', serverIpInput);
                      toast.success("Server IP saved. Proceeding to login.");
                      setTimeout(() => window.location.reload(), 500);
                    }}
                    className="h-12 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider transition-colors"
                  >
                    Connect
                  </button>
                </div>

                <div className="relative flex items-center justify-center py-2">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
                  <div className="relative px-4 bg-slate-900 text-[10px] font-bold text-slate-500 uppercase tracking-widest">OR</div>
                </div>

                <button
                  onClick={async () => {
                    setIsScanningNetwork(true);
                    if ((window as any).electronAPI) {
                      const server = await (window as any).electronAPI.invoke('scan_network');
                      if (server) {
                        setServerIpInput(server.ip);
                        localStorage.setItem('np_server_ip', server.ip);
                        toast.success(`Found Server: ${server.pcName} at ${server.ip}!`);
                        setTimeout(() => window.location.reload(), 1500);
                      } else {
                        toast.error("No active servers found on the local network.");
                      }
                    }
                    setIsScanningNetwork(false);
                  }}
                  disabled={isScanningNetwork}
                  className={`w-full h-12 rounded-xl border-2 ${isScanningNetwork ? 'border-purple-500 bg-purple-500/10 text-purple-400' : 'border-slate-700 bg-slate-950 hover:bg-slate-800 text-slate-300'} font-bold text-sm transition-all flex items-center justify-center gap-2`}
                >
                  {isScanningNetwork ? (
                    <><div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div> Scanning LAN...</>
                  ) : (
                    <><Search className="w-4 h-4" /> Scan Network Automatically</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      );
    }

    // LAYER 1: Cinematic Landing Page
    if (!visitedLanding) {
      return (
        <LandingPage
          onNext={() => setVisitedLanding(true)}
          feedbackList={feedbackList}
          setFeedbackList={setFeedbackList}
        />
      );
    }

    // LAYER 2: License Activation Security Card (SERVER ONLY)
    if (appMode === 'server' && !isActivated) {
      return (
        <>
          <style dangerouslySetInnerHTML={{ __html: themeStyles }} />
          <div className="dark min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-[#090d16]">
            {/* Animated Glow backdrops */}
            <div className="absolute inset-0 z-0">
              <div className="absolute top-[10%] left-[20%] w-96 h-96 bg-purple-500/10 rounded-full blur-[100px] animate-pulse"></div>
              <div className="absolute bottom-[10%] right-[20%] w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }}></div>
            </div>

            <div className="relative z-10 w-full max-w-md bg-slate-900/60 border border-slate-800 rounded-3xl p-8 backdrop-blur-xl shadow-2xl animate-pop-in">

              {/* Back to product tour link */}
              <button
                onClick={() => setVisitedLanding(false)}
                className="text-slate-400 hover:text-white flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px] mb-6 transition-colors"
              >
                <ArrowRight className="w-3 h-3 transform rotate-180" /> Product Tour
              </button>

              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-16 h-16 bg-gradient-to-tr from-purple-500 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20 mb-4">
                  <Key className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-black text-white tracking-tight">License Verification</h1>
                <p className="text-xs text-slate-400 font-medium mt-2">Enter your active AUDIT WITH VASWANI serial key to authorize this machine.</p>

                {appMode === 'server' && serverIpInfo && (
                  <div className="mt-4 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex flex-col items-center gap-1 animate-fade-in">
                    <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5"><Server className="w-3 h-3" /> Server Running on this PC</div>
                    <div className="text-sm font-mono text-white">IP: {serverIpInfo.ip} | Port: {serverIpInfo.port}</div>
                  </div>
                )}
              </div>

              <form onSubmit={handleActivateSubmit} className="space-y-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 block">Software Serial Key</label>
                  <div className="relative">
                    <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={activationInput}
                      onChange={(e) => setActivationInput(e.target.value)}
                      placeholder="XXXX-XXXX-XXXX"
                      className="w-full h-12 bg-slate-950/80 border border-slate-700 rounded-xl pl-11 pr-4 text-sm text-white font-mono uppercase focus:border-purple-500 outline-none transition-colors"
                      required
                    />
                  </div>
                  <div className="text-[9px] text-slate-500 mt-2 flex items-center gap-1.5 justify-center">
                    <Laptop className="w-3.5 h-3.5" /> ID: {deviceId}
                  </div>
                </div>

                <button type="submit" className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm transition-all shadow-lg shadow-purple-600/20 hover:scale-[1.02] flex items-center justify-center gap-2 uppercase tracking-wider">
                  Activate Device <Sparkles className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </>
      );
    }

    // LAYER 3: Secure Login Gateway Card
    if (!isAuthenticated) {
      return (
        <>
          <style dangerouslySetInnerHTML={{ __html: themeStyles }} />
          <div className="dark min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-[#090d16]">
            {/* Ambient Mesh Spots */}
            <div className="absolute inset-0 z-0">
              <div className="absolute top-[20%] right-[10%] w-[450px] h-[450px] bg-blue-600/5 rounded-full blur-[120px] animate-pulse"></div>
              <div className="absolute bottom-[20%] left-[10%] w-[450px] h-[450px] bg-emerald-600/5 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '3s' }}></div>
            </div>

            <div className="relative z-10 w-full max-w-md bg-slate-900/60 border border-slate-800 rounded-3xl p-8 backdrop-blur-xl shadow-2xl animate-pop-in">
              <div className="flex justify-end w-full mb-6">
                <button
                  onClick={async () => {
                    if (confirm('Are you sure you want to factory reset this installation? This will clear activation.')) {
                      localStorage.clear();
                      sessionStorage.clear();
                      if ((window as any).electronAPI) await (window as any).electronAPI.invoke('set_app_mode', 'server');
                      window.location.reload();
                    }
                  }}
                  className="text-red-400 hover:text-red-300 flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px] transition-colors"
                >
                  <Key className="w-3 h-3" /> Reset License
                </button>
              </div>
              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-16 h-16 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-center overflow-hidden mb-4">
                  <img src="./logo.png" alt="Logo" className="w-10 h-10 object-contain" />
                </div>
                <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">AUDIT WITH VASWANI</h1>
                <p className="text-xs text-slate-400 font-medium mt-1">Enterprise-grade offline reporting deck.</p>

                {appMode === 'server' && serverIpInfo && (
                  <div className="mt-4 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex flex-col items-center gap-1 animate-fade-in">
                    <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5"><Server className="w-3 h-3" /> Server Running on this PC</div>
                    <div className="text-sm font-mono text-white">IP: {serverIpInfo.ip} | Port: {serverIpInfo.port}</div>
                  </div>
                )}
                {appMode === 'client' && (
                  <div className={`mt-4 px-4 py-2 border rounded-lg flex flex-col items-center gap-1 animate-fade-in ${isServerOffline ? 'bg-rose-500/10 border-rose-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                    <div className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${isServerOffline ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {isServerOffline ? <AlertCircle className="w-3 h-3" /> : <Server className="w-3 h-3" />}
                      {isServerOffline ? 'Server Offline (Check Connection)' : 'Server Online & Reachable'}
                    </div>
                    <div className="text-sm font-mono text-white">Target IP: {getApiHost()}</div>
                  </div>
                )}
              </div>

              {adminSetupRequired ? (
                <form onSubmit={handleAdminSetupSubmit} className="space-y-6">
                  <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-xl mb-2">
                    <h3 className="text-purple-400 font-bold flex items-center gap-2 mb-2">
                      <ShieldCheck className="w-5 h-5" /> First-Run Setup
                    </h3>
                    <p className="text-sm text-slate-300">
                      Welcome! No admin account exists yet. Create a secure master password to protect this server.
                    </p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 block">Master Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="password"
                        value={setupPassword}
                        onChange={(e) => setSetupPassword(e.target.value)}
                        placeholder="Enter a secure password"
                        className="w-full h-12 bg-slate-950/80 border border-slate-700 rounded-xl pl-11 pr-4 text-sm text-white focus:border-purple-500 outline-none transition-colors"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 block">Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="password"
                        value={setupPasswordConfirm}
                        onChange={(e) => setSetupPasswordConfirm(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full h-12 bg-slate-950/80 border border-slate-700 rounded-xl pl-11 pr-4 text-sm text-white focus:border-purple-500 outline-none transition-colors"
                        required
                      />
                    </div>
                  </div>
                  <button type="submit" className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm transition-all shadow-lg shadow-purple-600/20 hover:scale-[1.02] flex items-center justify-center gap-2 uppercase tracking-wider">
                    Create Admin & Login <Sparkles className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleLoginSubmit} className="space-y-6">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 block">Username</label>
                    <div className="relative">
                      <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter username"
                        className="w-full h-12 bg-slate-950/80 border border-slate-700 rounded-xl pl-11 pr-4 text-sm text-white focus:border-blue-500 outline-none transition-colors"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 block">Security Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        className="w-full h-12 bg-slate-950/80 border border-slate-700 rounded-xl pl-11 pr-4 text-sm text-white focus:border-blue-500 outline-none transition-colors"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-950 text-blue-500 focus:ring-blue-500 w-4 h-4"
                      />
                      Remember login key
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowIpConfig(!showIpConfig)}
                      className="text-xs text-blue-400 hover:text-blue-300 font-bold uppercase tracking-wider"
                    >
                      Configure Server
                    </button>
                  </div>

                  {showIpConfig && (
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Offline Database Server IP</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                          <input
                            type="text"
                            value={serverIpInput}
                            onChange={(e) => setServerIpInput(e.target.value)}
                            className="w-full h-9 bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 text-xs text-white outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => { safeSetItem('np_server_ip', serverIpInput.trim(), true); toast.success("Database IP updated!"); }}
                          className="px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg uppercase tracking-wider"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}

                  <button type="submit" className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm transition-all shadow-lg shadow-blue-600/20 hover:scale-[1.02] flex items-center justify-center gap-2 uppercase tracking-wider">
                    Access Portal <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          </div>
        </>
      );
    }

    // LAYER 3.5: Splash Screen (Displays AFTER successful login)
    if (showSplash) {
      return <Splash themeStyles={themeStyles} onComplete={handleSplashComplete} />;
    }

    // LAYER 4: Admin Security Dashboard Console (Only if admin requests)
    if (isAdmin && showAdmin) {
      return (
        <AdminPanel
          handleLogout={handleLogout}
          setIsAdmin={setIsAdmin}
          setShowHome={(show) => { setShowAdmin(!show); setAppRoute('hub'); }}
          themeStyles={themeStyles}
        />
      );
    }

    const handleDirectTallyImport = async (data: {
      prFile: File;
      prDnFile?: File;
      journalFiles?: File[];
      companyName?: string;
    }) => {
      // 1. Clear previous reconciliation states first
      handleReset(true);

      // 2. Set the uploaded files in state
      setPrFile(data.prFile);
      if (data.prDnFile) setPrDnFile(data.prDnFile);

      // 3. Set the company name
      if (data.companyName) {
        setCompanyName(data.companyName);
        localStorage.setItem('np_company_name', data.companyName);
      }

      // 4. Parse primary file asynchronously to set headers and mappings
      try {
        const parsedPr = await parseFileAsync(data.prFile);
        setPrHeaders(parsedPr.headers);
        setPrMapping(detectColumnMapping(parsedPr.headers));

        if (data.prDnFile) {
          const parsedDn = await parseFileAsync(data.prDnFile, { findHeader: true, sheetName: 'Sheet2' });
          setPrDnHeaders(parsedDn.headers);
          setPrDnMapping(detectColumnMapping(parsedDn.headers));
        }

        if (data.journalFiles && data.journalFiles.length > 0) {
          const newJournals = await Promise.all(
            data.journalFiles.map(async (f) => {
              const parsedJ = await parseFileAsync(f);
              return { file: f, headers: parsedJ.headers, mapping: detectColumnMapping(parsedJ.headers) };
            })
          );
          setJournals(newJournals);
        }

        // 5. Set mode to 'input' and navigate
        setMode('input');
        localStorage.setItem('np_reco_mode', 'input');
        setAppRoute('reco');
        setStep('upload');

        toast.success("Tally registers imported directly! Now drop your GSTR-2B file to start.");
      } catch (error) {
        console.error(error);
        toast.error("Failed to parse directly imported Tally files");
      }
    };

    // LAYER 5: Post-Login AUDIT WITH VASWANI Compliance Platform Home Suite Hub
    const handleSendToReco = (company: string) => {
      setCompanyName(company);
      setMode(null);
      setAppRoute('reco');
      setStep('upload');
    };

    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: themeStyles }} />
        <AppShell
          appRoute={appRoute}
          setAppRoute={setAppRoute}
          returnsTab={returnsInitialTab}
          setReturnsTab={setReturnsInitialTab}
          companyName={companyName}
          setCompanyName={setCompanyName}
          loginUser={loginUser}
          networkDiagnostics={networkDiagnostics}
          serverIpInfo={serverIpInfo}
          appMode={appMode}
          isAdmin={isAdmin}
          onOpenAdmin={() => setShowAdmin(!showAdmin)}
          onOpenHistory={() => setIsHistoryOpen(true)}
          onOpenGDrive={() => setIsGDriveConnectOpen(true)}
          onOpenUserGuide={() => {
            let targetModule = 'intro';
            if (appRoute === 'dashboard') targetModule = 'dashboard';
            else if (appRoute === 'consolidation') targetModule = 'consolidation';
            else if (appRoute === 'reco') targetModule = 'reco';
            else if (appRoute === 'tally') targetModule = 'tally';
            else if (appRoute === 'tally-direct') targetModule = 'tally-direct';
            else if (appRoute === 'tracker') targetModule = 'tracker';
            else if (appRoute === 'returns') targetModule = 'returns';
            else if (appRoute === 'fin-statements') targetModule = 'fin-statements';
            else if (appRoute === 'gstin-scan') targetModule = 'gstin-scan';
            else if (appRoute === 'tds-reco') targetModule = 'tds-reco';
            else if (appRoute === 'cma') targetModule = 'cma';
            else if (appRoute === 'voucher-reclass') targetModule = 'voucher-reclass';
            else if (appRoute === 'depreciation') targetModule = 'depreciation';

            setGuideActiveModule(targetModule);
            setShowUserGuide(true);
          }}
          onLogout={handleLogout}
        >
          <div className="relative">
            {/* ROTATING AMBIENT GLOW BACKDROPS */}
            <div className="absolute inset-0 z-0 pointer-events-none">
              <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-blue-600/10 rounded-full blur-[140px] animate-pulse"></div>
              <div className="absolute bottom-[15%] right-[15%] w-[450px] h-[450px] bg-emerald-600/10 rounded-full blur-[140px] animate-pulse" style={{ animationDelay: '3s' }}></div>
            </div>

            {appRoute === 'hub' && (
              <div className="space-y-6 max-w-7xl mx-auto w-full animate-slow-reveal relative">

                {/* Ambient Luminous Gradient Mesh */}
                <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[920px] h-[320px] bg-gradient-to-b from-blue-100/40 via-slate-100/30 to-transparent blur-3xl pointer-events-none -z-10 rounded-full opacity-70" />

                {activeCategoryCard === null ? (
                  <>
                    {/* 1. Executive Welcome & Operational KPI Strip (1:1 Stitch Blueprint) */}
                    <section className="p-5 rounded-xl bg-white border border-slate-200/90 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-5">
                      {/* Left: Greeting */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h1 className="text-[20px] font-bold text-slate-900 tracking-tight leading-none">
                            Welcome back, {loginUser || 'CA Vipul Patel'}
                          </h1>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[11px] font-semibold">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>verified</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 text-[13px] flex-wrap">
                          <span className="font-medium text-slate-800">Partner</span>
                          <span>·</span>
                          <span>VCAN &amp; Associates LLP, CAs</span>
                          <span className="text-slate-300">|</span>
                          <span className="text-[12px] font-mono text-blue-600 font-medium">Firm Reg: 104522W</span>
                        </div>
                      </div>

                      {/* Right: 3 Operational KPI Pills */}
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Amber: IMS Actions */}
                        <div 
                          onClick={() => { setReturnsInitialTab('ims2b'); setAppRoute('returns'); }}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50/70 border border-amber-200/70 hover:bg-amber-100/70 transition-colors cursor-pointer"
                          title="Open GST IMS Actions"
                        >
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase tracking-wider text-amber-700/80 font-semibold leading-none">IMS Actions</span>
                            <span className="text-[12px] font-mono font-semibold text-amber-700 leading-tight">18 Pending Review</span>
                          </div>
                        </div>

                        {/* Rose: GSTR-3B Deadlines */}
                        <div 
                          onClick={() => { setReturnsInitialTab('working3b'); setAppRoute('returns'); }}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-pink-50/70 border border-pink-200/70 hover:bg-pink-100/70 transition-colors cursor-pointer"
                          title="Open GSTR-3B Working Sheet"
                        >
                          <CalendarClock className="w-4 h-4 text-pink-600" />
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase tracking-wider text-pink-700/80 font-semibold leading-none">GSTR-3B Deadlines</span>
                            <span className="text-[12px] font-mono font-semibold text-pink-600 leading-tight">28 Due (7 Days)</span>
                          </div>
                        </div>

                        {/* Emerald: Tally LAN Sync */}
                        <div 
                          onClick={() => setAppRoute('tally-direct')}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50/70 border border-emerald-200/70 hover:bg-emerald-100/70 transition-colors cursor-pointer"
                          title="Tally Port 9000 Status"
                        >
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                          </span>
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase tracking-wider text-emerald-800/80 font-semibold leading-none">Tally LAN Sync</span>
                            <span className="text-[12px] font-mono font-semibold text-emerald-700 leading-tight">Port 9000 Online</span>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* 2. Primary Compliance Operations Header Strip */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-600"></div>
                          <h2 className="text-[16px] font-bold text-slate-900 tracking-tight uppercase">Primary Compliance Operations</h2>
                          <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60 text-[10px] font-semibold uppercase tracking-wider">
                            High Frequency Workflows
                          </span>
                        </div>
                        <div className="text-slate-500 text-[12px] font-mono flex items-center gap-1.5">
                          <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                          <span>Real-Time GSTN Engine Connected</span>
                        </div>
                      </div>

                      {/* Top 2 Flagship Suites in 2-Column Wide Grid */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                        {/* Suite 04: Returns Preparation & Filing (Purple Theme) */}
                        <article 
                          onClick={() => setActiveCategoryCard('returns')}
                          className="relative rounded-xl bg-white p-6 border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group cursor-pointer"
                        >
                          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500"></div>
                          <div>
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                                  <Send className="w-6 h-6" />
                                </div>
                                <div>
                                  <span className="font-mono text-indigo-600 text-[10px] block uppercase tracking-wider font-semibold">SUITE 04</span>
                                  <h3 className="text-[18px] text-slate-900 font-bold leading-tight group-hover:text-indigo-600 transition-colors">
                                    Returns Preparation &amp; Filing
                                  </h3>
                                </div>
                              </div>
                              <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200/80 text-indigo-700 text-[11px] font-semibold uppercase tracking-wider">
                                5 Modules
                              </span>
                            </div>

                            {/* Subtext */}
                            <p className="text-slate-600 text-[13px] mb-5 leading-relaxed">
                              Autonomous 12-month return cycles, Rule 88A set-off cascade, and Invoice Management System hub.
                            </p>

                            {/* 5 Clickable Module Rows */}
                            <div className="flex flex-col gap-2 mb-6">
                              <div 
                                onClick={(e) => { e.stopPropagation(); setReturnsInitialTab('working3b'); setAppRoute('returns'); }}
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100/90 border border-slate-200/70 transition-colors cursor-pointer group/item"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                                  <span className="text-[13px] text-slate-800 font-medium group-hover/item:text-indigo-700 transition-colors">GSTR-3B Working Sheet &amp; Rule 88A</span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-white text-indigo-700 border border-slate-200 font-semibold shadow-2xs">Ready</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setReturnsInitialTab('matrix'); setAppRoute('returns'); }}
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100/90 border border-slate-200/70 transition-colors cursor-pointer group/item"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                  <span className="text-[13px] text-slate-800 font-medium group-hover/item:text-indigo-700 transition-colors">12-Month FY Comparative Matrix</span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-white text-slate-700 border border-slate-200 font-medium shadow-2xs">13-Cols Aligned</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setReturnsInitialTab('ims2b'); setAppRoute('returns'); }}
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-50/50 hover:bg-amber-50 border border-amber-200/70 transition-colors cursor-pointer group/item"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                  <span className="text-[13px] text-slate-800 font-medium group-hover/item:text-amber-800 transition-colors">GST IMS &amp; 2B Recipient Decision Hub</span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-amber-100/80 text-amber-800 border border-amber-300/60 font-semibold shadow-2xs">18 Pending</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setReturnsInitialTab('gstr2b_downloader'); setAppRoute('returns'); }}
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100/90 border border-slate-200/70 transition-colors cursor-pointer group/item"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                  <span className="text-[13px] text-slate-800 font-medium group-hover/item:text-indigo-700 transition-colors">GSTR-2B 12-Month Inward Autopilot</span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-white text-slate-700 border border-slate-200 font-medium shadow-2xs">8 Sheets Sync</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setReturnsInitialTab('gstr1_downloader'); setAppRoute('returns'); }}
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100/90 border border-slate-200/70 transition-colors cursor-pointer group/item"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                  <span className="text-[13px] text-slate-800 font-medium group-hover/item:text-emerald-700 transition-colors">GSTR-1 Outward Harvester &amp; Table 12</span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold shadow-2xs">Zero-Merge</span>
                              </div>
                            </div>
                          </div>

                          {/* Footer CTA */}
                          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[11px] text-slate-400">Suite 04 · /returns-hub</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setAppRoute('returns'); }}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 transition-colors shadow-xs group-hover:translate-x-0.5"
                            >
                              <span>Launch Returns Workspace</span>
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        </article>

                        {/* Suite 02: Core GST & TDS Reco Engine (Emerald Theme) */}
                        <article 
                          onClick={() => setActiveCategoryCard('reco')}
                          className="relative rounded-xl bg-white p-6 border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group cursor-pointer"
                        >
                          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-600"></div>
                          <div>
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                                  <ShieldCheck className="w-6 h-6" />
                                </div>
                                <div>
                                  <span className="font-mono text-emerald-700 text-[10px] block uppercase tracking-wider font-semibold">SUITE 02</span>
                                  <h3 className="text-[18px] text-slate-900 font-bold leading-tight group-hover:text-emerald-700 transition-colors">
                                    GST &amp; TDS Reconciliation Engine
                                  </h3>
                                </div>
                              </div>
                              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-[11px] font-semibold uppercase tracking-wider">
                                3 Modules
                              </span>
                            </div>

                            {/* Subtext */}
                            <p className="text-slate-600 text-[13px] mb-5 leading-relaxed">
                              Purchase Register vs GSTR-2B matching with ±₹2 tolerance, CDNR pairing, and Form 26Q matching.
                            </p>

                            {/* 4 Clickable Module Rows */}
                            <div className="flex flex-col gap-2 mb-6">
                              <div 
                                onClick={(e) => { e.stopPropagation(); setMode('2b-to-pr'); setAppRoute('reco'); }}
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-200/70 transition-colors cursor-pointer group/item"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                  <span className="text-[13px] text-slate-800 font-medium group-hover/item:text-emerald-700 transition-colors">GST Multi-Pass Reco (PR vs 2B)</span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-emerald-100/90 text-emerald-800 border border-emerald-300/60 font-semibold shadow-2xs">±₹2.00 Tol</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setMode('2b-to-pr'); setAppRoute('reco'); }}
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100/90 border border-slate-200/70 transition-colors cursor-pointer group/item"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                  <span className="text-[13px] text-slate-800 font-medium group-hover/item:text-slate-900 transition-colors">Party-Wise Vendor Dispute Center</span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-white text-slate-700 border border-slate-200 font-medium shadow-2xs">WhatsApp / Mail Dispatch</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('tds-reco'); }}
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100/90 border border-slate-200/70 transition-colors cursor-pointer group/item"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                  <span className="text-[13px] text-slate-800 font-medium group-hover/item:text-amber-800 transition-colors">TRACES Form 26Q TDS Consolidator</span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-white text-amber-700 border border-slate-200 font-medium shadow-2xs">194C/J/I/Q Auto-Tiers</span>
                              </div>

                              <div 
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100/90 border border-slate-200/70 transition-colors group/item"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                  <span className="text-[13px] text-slate-800 font-medium">Zero-Merge Corporate 12-Tab Excel</span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-white text-emerald-700 border border-slate-200 font-semibold shadow-2xs">100% Sort Safe</span>
                              </div>
                            </div>
                          </div>

                          {/* Footer CTA */}
                          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[11px] text-slate-400">Suite 02 · /reconciliation</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setMode('2b-to-pr'); setAppRoute('reco'); }}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-[13px] font-semibold hover:bg-emerald-700 transition-colors shadow-xs group-hover:translate-x-0.5"
                            >
                              <span>Open Reco Workspace</span>
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        </article>

                      </div>
                    </div>

                    {/* 3. Secondary Compliance & Advisory Suites (4-Column Clean Grid) */}
                    <section>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Secondary Compliance &amp; Advisory Suites</span>
                          <span className="text-slate-300">|</span>
                          <span className="font-mono text-[11px] text-slate-400">Firm Operations &amp; Diagnostic Modules</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">

                        {/* Suite 01: Work In Progress & Practice Hub (Amber Theme) */}
                        <article 
                          onClick={() => setActiveCategoryCard('wip')}
                          className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                                <Zap className="w-5 h-5" />
                              </div>
                              <span className="font-mono text-[10px] font-semibold text-amber-700 uppercase">SUITE 01</span>
                            </div>
                            <h3 className="text-[15px] font-bold text-slate-900 leading-snug mb-1 group-hover:text-amber-700 transition-colors">
                              Work In Progress &amp; Practice Hub
                            </h3>
                            <p className="text-slate-500 text-[12px] mb-4">Practice management, roster metrics, and checksum validators.</p>
                            
                            <ul className="flex flex-col gap-1.5 mb-5 text-[12px]">
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('dashboard'); }}
                                className="flex items-center justify-between text-slate-700 py-1 border-b border-slate-100 hover:text-amber-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">Practice Dashboard</span>
                                <span className="font-mono text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">342 Clients</span>
                              </li>
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('gstin-scan'); }}
                                className="flex items-center justify-between text-slate-700 py-1 border-b border-slate-100 hover:text-amber-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">GSTIN Smart Scanner</span>
                                <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">Mod-36</span>
                              </li>
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('tracker'); }}
                                className="flex items-center justify-between text-slate-700 py-1 hover:text-emerald-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">12M Filing Tracker</span>
                                <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">96.4% Filed</span>
                              </li>
                            </ul>
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-slate-400">/dashboard</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setAppRoute('dashboard'); }}
                              className="inline-flex items-center gap-1 text-amber-600 font-semibold text-[12px] group-hover:translate-x-0.5 transition-transform"
                            >
                              <span>Open Hub</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </article>

                        {/* Suite 03: Tally Connectors & XML Bridge (Pink Theme) */}
                        <article 
                          onClick={() => setActiveCategoryCard('collector')}
                          className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="w-9 h-9 rounded-lg bg-pink-50 border border-pink-100 text-pink-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                                <Server className="w-5 h-5" />
                              </div>
                              <span className="font-mono text-[10px] font-semibold text-pink-700 uppercase">SUITE 03</span>
                            </div>
                            <h3 className="text-[15px] font-bold text-slate-900 leading-snug mb-1 group-hover:text-pink-700 transition-colors">
                              Tally Connectors &amp; XML Bridge
                            </h3>
                            <p className="text-slate-500 text-[12px] mb-4">Direct HTTP Port 9000 connector and real-time XML parsers.</p>
                            
                            <ul className="flex flex-col gap-1.5 mb-5 text-[12px]">
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('tally-direct'); }}
                                className="flex items-center justify-between text-slate-700 py-1 border-b border-slate-100 hover:text-pink-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">Direct HTTP Port 9000 Link</span>
                                <span className="font-mono text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Connected</span>
                              </li>
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('tally'); }}
                                className="flex items-center justify-between text-slate-700 py-1 border-b border-slate-100 hover:text-pink-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">Daybook &amp; TB XML Converter</span>
                                <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">Fast Ingest</span>
                              </li>
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('ledger-import'); }}
                                className="flex items-center justify-between text-slate-700 py-1 hover:text-pink-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">Active Company Auto-Detect</span>
                                <span className="font-mono text-[10px] text-pink-700 bg-pink-50 px-1.5 py-0.5 rounded">Auto-Detect</span>
                              </li>
                            </ul>
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-slate-400">/tally-bridge</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setAppRoute('tally'); }}
                              className="inline-flex items-center gap-1 text-pink-600 font-semibold text-[12px] group-hover:translate-x-0.5 transition-transform"
                            >
                              <span>Launch Bridge</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </article>

                        {/* Suite 05: Statutory & Tax Audit Suite (Indigo Theme) */}
                        <article 
                          onClick={() => setActiveCategoryCard('audit')}
                          className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                                <Landmark className="w-5 h-5" />
                              </div>
                              <span className="font-mono text-[10px] font-semibold text-indigo-700 uppercase">SUITE 05</span>
                            </div>
                            <h3 className="text-[15px] font-bold text-slate-900 leading-snug mb-1 group-hover:text-indigo-700 transition-colors">
                              Statutory &amp; Tax Audit Suite
                            </h3>
                            <p className="text-slate-500 text-[12px] mb-4">Statutory audit sampling, 3CD reporting, and tax balance schedules.</p>
                            
                            <ul className="flex flex-col gap-1.5 mb-5 text-[12px]">
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('audit'); }}
                                className="flex items-center justify-between text-slate-700 py-1 border-b border-slate-100 hover:text-indigo-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">SA 530 Monetary Unit Sampling</span>
                                <span className="font-mono text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">SA 530</span>
                              </li>
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('clause44'); }}
                                className="flex items-center justify-between text-slate-700 py-1 border-b border-slate-100 hover:text-indigo-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">Form 3CD Clause 44 Spend</span>
                                <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">Reg vs Unreg</span>
                              </li>
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('depreciation'); }}
                                className="flex items-center justify-between text-slate-700 py-1 hover:text-indigo-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">Dual Depreciation &amp; DTA/DTL</span>
                                <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">Co Act vs IT</span>
                              </li>
                            </ul>
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-slate-400">/stat-audit</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setAppRoute('audit'); }}
                              className="inline-flex items-center gap-1 text-indigo-600 font-semibold text-[12px] group-hover:translate-x-0.5 transition-transform"
                            >
                              <span>Open Audit</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </article>

                        {/* Suite 06 & 07: Taxation & Bank CMA Credit (Blue/Cyan Theme) */}
                        <article 
                          onClick={() => setActiveCategoryCard('cma-bank')}
                          className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-100 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                                <Calculator className="w-5 h-5" />
                              </div>
                              <span className="font-mono text-[10px] font-semibold text-blue-700 uppercase">SUITE 06 &amp; 07</span>
                            </div>
                            <h3 className="text-[15px] font-bold text-slate-900 leading-snug mb-1 group-hover:text-blue-700 transition-colors">
                              Taxation &amp; Bank CMA Credit
                            </h3>
                            <p className="text-slate-500 text-[12px] mb-4">Direct tax regime optimizer, working capital MPBF, and ratios.</p>
                            
                            <ul className="flex flex-col gap-1.5 mb-5 text-[12px]">
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('income-tax'); }}
                                className="flex items-center justify-between text-slate-700 py-1 border-b border-slate-100 hover:text-blue-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">IT Regime Optimizer (115BAC)</span>
                                <span className="font-mono text-[10px] font-semibold text-blue-700 bg-sky-50 px-1.5 py-0.5 rounded">AY 25-26</span>
                              </li>
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('bank-cma'); }}
                                className="flex items-center justify-between text-slate-700 py-1 border-b border-slate-100 hover:text-blue-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">Bank CMA Credit MPBF Method II</span>
                                <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">Method II</span>
                              </li>
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('cma'); }}
                                className="flex items-center justify-between text-slate-700 py-1 hover:text-emerald-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">10 Financial Ratios</span>
                                <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">DSCR 1.84x</span>
                              </li>
                            </ul>
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-slate-400">/cma-advisory</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setAppRoute('bank-cma'); }}
                              className="inline-flex items-center gap-1 text-blue-600 font-semibold text-[12px] group-hover:translate-x-0.5 transition-transform"
                            >
                              <span>Launch Advisory</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </article>

                      </div>
                    </section>

                    {/* 4. Docked Bottom Operational Telemetry Status Bar */}
                    <div className="bg-white/90 backdrop-blur-md border border-slate-200/90 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-600 gap-3 shadow-xs">
                      <div className="flex items-center gap-4 flex-wrap">
                        <span className="flex items-center gap-1.5 font-medium">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          SQLite LAN Active (342 Clients Loaded)
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="flex items-center gap-1.5 font-medium">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          Zero-Merge Architecture Guaranteed
                        </span>
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
                        <span>Core Daemon v2.4.0</span>
                        <span>•</span>
                        <span className="text-slate-700 font-semibold">Vaswani &amp; Associates</span>
                      </div>
                    </div>
                  </>
                ) : (
                  /* SELECTED CATEGORY CARD DRILL-DOWN VIEW */
                  <div className="space-y-6 animate-fadeIn">
                    
                    {/* BACK NAVIGATION BAR */}
                    <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                      <button
                        onClick={() => setActiveCategoryCard(null)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all border border-slate-200 shadow-xs hover:scale-[1.02]"
                      >
                        <ArrowLeft className="w-4 h-4 text-blue-600" />
                        <span>← Back to All Suites</span>
                      </button>

                      <div className="text-xs text-slate-500 font-mono">
                        Active Suite: <span className="text-blue-700 font-bold uppercase">{activeCategoryCard}</span>
                      </div>
                    </div>

                    {/* RETURNS PREPARATION & FILING SUITE DRILL-DOWN (5 DEDICATED CARDS) */}
                    {activeCategoryCard === 'returns' && (
                      <div className="glass-card-np neon-purple p-6 md:p-8 rounded-3xl border border-purple-500/20 bg-slate-900/60 backdrop-blur-xl relative overflow-hidden space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-purple-500/20">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-lg shadow-purple-500/10">
                              <Send className="w-6 h-6" />
                            </div>
                            <div>
                              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/40 text-purple-300 text-[10px] font-black uppercase tracking-widest">
                                Core Returns Suite • 6 Modules
                              </div>
                              <h3 className="text-2xl font-black text-white tracking-tight mt-1">Returns Preparation &amp; Filing</h3>
                            </div>
                          </div>
                          <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                            Comprehensive filing suite: GSTR-3B tax computation, Rule 88A set-off, multi-period comparative matrix, IMS invoice actions &amp; automated portal downloads.
                          </p>
                        </div>

                        {/* 5 Distinct Interactive Module Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">

                          {/* Card 1: 01. GSTR-3B Working Sheet */}
                          <div
                            onClick={() => {
                              setReturnsInitialTab('working3b');
                              setAppRoute('returns');
                            }}
                            className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200 hover:border-blue-400 hover:bg-white transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[190px] shadow-lg relative overflow-hidden"
                          >
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Calculator className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">
                                Module 4.1
                              </span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                                01. GSTR-3B Working Sheet <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-blue-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                                Master monthly tax computation, auto-pilot ingestion deck, Table 3.1 &amp; Table 4 set-off cascade, and official GSTN portal JSON.
                              </p>
                            </div>
                            <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between text-blue-400 text-[11px] font-bold">
                              <span>Open Working Sheet</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </div>
                          </div>

                          {/* Card 2: 02. 12-Month FY Matrix */}
                          <div
                            onClick={() => {
                              setReturnsInitialTab('matrix');
                              setAppRoute('returns');
                            }}
                            className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200 hover:border-teal-400 hover:bg-white transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[190px] shadow-lg relative overflow-hidden"
                          >
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Table className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-teal-400 uppercase tracking-widest px-2 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/20">
                                Module 4.2
                              </span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-slate-900 group-hover:text-teal-600 transition-colors flex items-center gap-1.5">
                                02. 12-Month FY Matrix <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-teal-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                                Full-year April–March comparative tax matrix, annual tax liability trends, ITC claims, and monthly cash outflow analysis.
                              </p>
                            </div>
                            <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between text-teal-400 text-[11px] font-bold">
                              <span>Open FY Matrix</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </div>
                          </div>

                          {/* Card 3: 03. GST IMS & 2B Manager */}
                          <div
                            onClick={() => {
                              setReturnsInitialTab('ims2b');
                              setAppRoute('returns');
                            }}
                            className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200 hover:border-amber-400 hover:bg-white transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[190px] shadow-lg relative overflow-hidden"
                          >
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Sparkles className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                                Module 4.3
                              </span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-slate-900 group-hover:text-amber-600 transition-colors flex items-center gap-1.5">
                                03. GST IMS &amp; 2B Manager <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-amber-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                                Multi-client Inward Supplies action portal: Accept, Reject, or mark Pending inward B2B invoices &amp; CDNR with 300+ client selector.
                              </p>
                            </div>
                            <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between text-amber-400 text-[11px] font-bold">
                              <span>Open IMS Manager</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </div>
                          </div>

                          {/* Card 4: 04. GSTR-2B Downloader (Autopilot) */}
                          <div
                            onClick={() => {
                              setReturnsInitialTab('gstr2b_downloader');
                              setAppRoute('returns');
                            }}
                            className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200 hover:border-emerald-400 hover:bg-white transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[190px] shadow-lg relative overflow-hidden"
                          >
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <DownloadCloud className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                Module 4.4
                              </span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-slate-900 group-hover:text-emerald-600 transition-colors flex items-center gap-1.5">
                                04. GSTR-2B Downloader <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-emerald-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                                1-Login 12-month autonomous loop download, non-blocking resilience, multi-period ingestion, and local SQLite persistence.
                              </p>
                            </div>
                            <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between text-emerald-400 text-[11px] font-bold">
                              <span>Launch 2B Autopilot</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </div>
                          </div>

                          {/* Card 5: 05. GSTR-1 Downloader (Autopilot) */}
                          <div
                            onClick={() => {
                              setReturnsInitialTab('gstr1_downloader');
                              setAppRoute('returns');
                            }}
                            className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200 hover:border-indigo-400 hover:bg-white transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[190px] shadow-lg relative overflow-hidden"
                          >
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <ArrowUpRight className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20">
                                Module 4.5
                              </span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center gap-1.5">
                                05. GSTR-1 Downloader <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-indigo-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                                Single-login 12-month GSTR-1 outward sales autonomous downloader, multi-period parsing, and full-year consolidated Excel.
                              </p>
                            </div>
                            <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between text-indigo-400 text-[11px] font-bold">
                              <span>Launch GSTR-1 Autopilot</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </div>
                          </div>

                          {/* Card 6: 06. Returns Tracking */}
                          <div
                            onClick={() => {
                              setReturnsInitialTab('returns_tracking');
                              setAppRoute('returns');
                            }}
                            className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200 hover:border-purple-400 hover:bg-white transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[190px] shadow-lg relative overflow-hidden"
                          >
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <CalendarClock className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20">
                                Module 4.6
                              </span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-slate-900 group-hover:text-purple-600 transition-colors flex items-center gap-1.5">
                                06. Returns Tracker <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-purple-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                                High-density compliance cockpit, statutory filing matrix, deadline alerts, late fees &amp; 1-click jump into working.
                              </p>
                            </div>
                            <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between text-purple-500 text-[11px] font-bold">
                              <span>Open Returns Tracker</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </div>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* CARD 1 DRILL-DOWN: WIP SUITE */}
                    {activeCategoryCard === 'wip' && (
                      <div className="glass-card-np neon-amber p-6 md:p-8 rounded-3xl border border-amber-500/20 bg-slate-900/60 backdrop-blur-xl relative overflow-hidden space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-amber-500/20">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/5">
                              <Zap className="w-6 h-6" />
                            </div>
                            <div>
                              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-black uppercase tracking-widest">
                                Suite 01 • 6 Modules
                              </div>
                              <h3 className="text-2xl font-black text-white tracking-tight mt-1">Work In Progress (WIP) Suite</h3>
                            </div>
                          </div>
                          <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                            Comprehensive practice control, GSTIN auditing, returns tracking, AI vision OCR &amp; financial reports.
                          </p>
                        </div>

                        {/* Modules inside Card 1 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                          {/* 01. Practice Dashboard */}
                          <div
                            onClick={() => moduleConfig['Dashboard'] !== 0 && setAppRoute('dashboard')}
                            className={`p-5 rounded-2xl bg-slate-950/60 border border-amber-500/20 hover:border-amber-500/50 transition-all group ${moduleConfig['Dashboard'] !== 0 ? 'cursor-pointer hover:scale-[1.02]' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[170px] relative`}
                          >
                            {moduleConfig['Dashboard'] === 0 && <div className="absolute top-3 right-3"><Lock className="w-3.5 h-3.5 text-slate-500" /></div>}
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Users className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-amber-500/80 uppercase tracking-widest">Module 1.1</span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-white group-hover:text-amber-400 transition-colors flex items-center gap-1.5">
                                01. Practice Dashboard <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-amber-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">Manage client lists, track filing due dates, and back up database tables.</p>
                            </div>
                          </div>

                          {/* 02. GSTIN Smart Scanner */}
                          <div
                            onClick={() => setAppRoute('gstin-scan')}
                            className="p-5 rounded-2xl bg-slate-950/60 border border-emerald-500/20 hover:border-emerald-500/50 transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[170px]"
                          >
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Search className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-emerald-500/80 uppercase tracking-widest">Module 1.2</span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                                02. GSTIN Smart Scanner <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-emerald-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">Run duplicate &amp; wrong-GSTIN checks and review matching rules.</p>
                            </div>
                          </div>

                          {/* 03. GSTR-2B & 3B Tracker */}
                          <div
                            onClick={() => moduleConfig['Tracker'] !== 0 && setAppRoute('tracker')}
                            className={`p-5 rounded-2xl bg-slate-950/60 border border-yellow-500/20 hover:border-yellow-500/50 transition-all group ${moduleConfig['Tracker'] !== 0 ? 'cursor-pointer hover:scale-[1.02]' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[170px] relative`}
                          >
                            {moduleConfig['Tracker'] === 0 && <div className="absolute top-3 right-3"><Lock className="w-3.5 h-3.5 text-slate-500" /></div>}
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Search className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-yellow-500/80 uppercase tracking-widest">Module 1.3</span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-white group-hover:text-yellow-400 transition-colors flex items-center gap-1.5">
                                03. GSTR-2B &amp; 3B Tracker <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-yellow-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">Invoice-wise 2B matching &amp; monthly GSTR-3B summary analysis.</p>
                            </div>
                          </div>

                          {/* 06. Financial Statements */}
                          <div
                            onClick={() => moduleConfig['FinStatements'] !== 0 && setAppRoute('fin-statements')}
                            className={`p-5 rounded-2xl bg-slate-950/60 border border-cyan-500/20 hover:border-cyan-500/50 transition-all group ${moduleConfig['FinStatements'] !== 0 ? 'cursor-pointer hover:scale-[1.02]' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[170px] relative`}
                          >
                            {moduleConfig['FinStatements'] === 0 && <div className="absolute top-3 right-3"><Lock className="w-3.5 h-3.5 text-slate-500" /></div>}
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <FileSpreadsheet className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-cyan-500/80 uppercase tracking-widest">Module 1.6</span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-white group-hover:text-cyan-400 transition-colors flex items-center gap-1.5">
                                06. Financial Statements Engine <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-cyan-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">Automated BS, P&amp;L, Cash Flow compliant with Companies Act.</p>
                            </div>
                          </div>

                          {/* 07. CMA Data & Project Report */}
                          <div
                            onClick={() => setAppRoute('cma')}
                            className="p-5 rounded-2xl bg-slate-950/60 border border-blue-500/20 hover:border-blue-500/50 transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[170px]"
                          >
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <FileSpreadsheet className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-blue-500/80 uppercase tracking-widest">Module 1.7</span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
                                07. CMA Data &amp; Project Report <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-blue-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">Credit monitoring arrangement reports &amp; amortization schedules.</p>
                            </div>
                          </div>

                          {/* 08. Voucher Re-classifier */}
                          <div
                            onClick={() => setAppRoute('voucher-reclass')}
                            className="p-5 rounded-2xl bg-slate-950/60 border border-indigo-500/20 hover:border-indigo-500/50 transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[170px]"
                          >
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <ArrowRightLeft className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-indigo-500/80 uppercase tracking-widest">Module 1.8</span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-white group-hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                                08. Voucher Re-classifier <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-indigo-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">Batch reclassify Tally voucher entries from one ledger to another in one click.</p>
                            </div>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* CARD 2 DRILL-DOWN: RECONCILIATION HUB */}
                    {activeCategoryCard === 'reco' && (
                      <div className="glass-card-np neon-emerald p-6 md:p-8 rounded-3xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl relative overflow-hidden space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-emerald-500/20">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/5">
                              <ShieldCheck className="w-6 h-6" />
                            </div>
                            <div>
                              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                                Suite 02 • 3 Modules
                              </div>
                              <h3 className="text-2xl font-black text-white tracking-tight mt-1">Reconciliation Engine Hub</h3>
                            </div>
                          </div>
                          <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                            High-performance matching engines for GST ledgers, debit note parsing &amp; Form 26Q TDS reconciliation.
                          </p>
                        </div>

                        {/* Sub-groups inside Card 2 */}
                        <div className="space-y-4">
                          <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span> 2.1 — GST Ledger Reconciliation
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                            {/* 01. GST Data Consolidator */}
                            <div
                              onClick={() => moduleConfig['Consolidator'] !== 0 && setAppRoute('consolidation')}
                              className={`p-5 rounded-2xl bg-slate-950/60 border border-blue-500/20 hover:border-blue-500/50 transition-all group ${moduleConfig['Consolidator'] !== 0 ? 'cursor-pointer hover:scale-[1.02]' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[160px] relative`}
                            >
                              {moduleConfig['Consolidator'] === 0 && <div className="absolute top-3 right-3"><Lock className="w-3.5 h-3.5 text-slate-500" /></div>}
                              <div className="flex items-center justify-between">
                                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                  <Database className="w-5 h-5" />
                                </div>
                                <span className="text-[9px] font-black text-blue-500/80 uppercase tracking-widest">Module 2.1.1</span>
                              </div>
                              <div className="mt-4">
                                <h4 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
                                  01. GST Data Consolidator <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-blue-400" />
                                </h4>
                                <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">Merge decentralized multi-branch sales/purchase ledgers into a clean format.</p>
                              </div>
                            </div>

                            {/* 02. GST Reconciliation Engine */}
                            <div
                              onClick={() => { if (moduleConfig['RecoEngine'] !== 0) { setAppRoute('reco'); setMode(null); setStep('upload'); } }}
                              className={`p-5 rounded-2xl bg-slate-950/60 border border-emerald-500/20 hover:border-emerald-500/50 transition-all group ${moduleConfig['RecoEngine'] !== 0 ? 'cursor-pointer hover:scale-[1.02]' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[160px] relative`}
                            >
                              {moduleConfig['RecoEngine'] === 0 && <div className="absolute top-3 right-3"><Lock className="w-3.5 h-3.5 text-slate-500" /></div>}
                              <div className="flex items-center justify-between">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                  <ShieldCheck className="w-5 h-5" />
                                </div>
                                <span className="text-[9px] font-black text-emerald-500/80 uppercase tracking-widest">Module 2.1.2</span>
                              </div>
                              <div className="mt-4">
                                <h4 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                                  02. GST Reconciliation Engine <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-emerald-400" />
                                </h4>
                                <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">High-performance matching engine with custom thresholds &amp; debit note parsing.</p>
                              </div>
                            </div>

                          </div>

                          <div className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2 pt-2">
                            <span className="w-2 h-2 rounded-full bg-purple-400"></span> 2.2 — TDS Deductions Audit
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                            {/* 03. TDS Reconciliation */}
                            <div
                              onClick={() => setAppRoute('tds-reco')}
                              className="p-5 rounded-2xl bg-slate-950/60 border border-purple-500/20 hover:border-purple-500/50 transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[160px]"
                            >
                              <div className="flex items-center justify-between">
                                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                  <FileSpreadsheet className="w-5 h-5" />
                                </div>
                                <span className="text-[9px] font-black text-purple-500/80 uppercase tracking-widest">Module 2.2.1</span>
                              </div>
                              <div className="mt-4">
                                <h4 className="text-base font-bold text-white group-hover:text-purple-400 transition-colors flex items-center gap-1.5">
                                  03. TDS Form 26Q Reconciliation <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-purple-400" />
                                </h4>
                                <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">Match Tally Books against Form 26Q &amp; detect short deductions automatically.</p>
                              </div>
                            </div>

                          </div>
                        </div>
                      </div>
                    )}

                    {/* CARD 3 DRILL-DOWN: DATA COLLECTOR */}
                    {activeCategoryCard === 'collector' && (
                      <div className="glass-card-np neon-pink p-6 md:p-8 rounded-3xl border border-pink-500/20 bg-slate-900/60 backdrop-blur-xl relative overflow-hidden space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-pink-500/20">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 shadow-lg shadow-pink-500/5">
                              <Server className="w-6 h-6" />
                            </div>
                            <div>
                              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-pink-500/10 border border-pink-500/30 text-pink-400 text-[10px] font-black uppercase tracking-widest">
                                Suite 03 • 3 Modules
                              </div>
                              <h3 className="text-2xl font-black text-white tracking-tight mt-1">Data Collector &amp; Connectors</h3>
                            </div>
                          </div>
                          <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                            Fast XML parsing &amp; real-time TallyPrime XML API direct data extractions.
                          </p>
                        </div>

                        {/* Modules inside Card 3 */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                          {/* 01. Tally Dual-Engine Converter */}
                          <div
                            onClick={() => moduleConfig['TallyConverter'] !== 0 && setAppRoute('tally')}
                            className={`p-5 rounded-2xl bg-slate-950/60 border border-pink-500/20 hover:border-pink-500/50 transition-all group ${moduleConfig['TallyConverter'] !== 0 ? 'cursor-pointer hover:scale-[1.02]' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[160px] relative`}
                          >
                            {moduleConfig['TallyConverter'] === 0 && <div className="absolute top-3 right-3"><Lock className="w-3.5 h-3.5 text-slate-500" /></div>}
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <FileCode2 className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-pink-500/80 uppercase tracking-widest">Module 3.1</span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-white group-hover:text-pink-400 transition-colors flex items-center gap-1.5">
                                01. Tally Dual-Engine XML Converter <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-pink-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">Decode raw Tally XML files into styled Excel workbooks in 500ms.</p>
                            </div>
                          </div>

                          {/* 02. Tally Direct Import */}
                          <div
                            onClick={() => moduleConfig['TallyDirect'] !== 0 && setAppRoute('tally-direct')}
                            className={`p-5 rounded-2xl bg-slate-950/60 border border-teal-500/20 hover:border-teal-500/50 transition-all group ${moduleConfig['TallyDirect'] !== 0 ? 'cursor-pointer hover:scale-[1.02]' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[160px] relative`}
                          >
                            {moduleConfig['TallyDirect'] === 0 && <div className="absolute top-3 right-3"><Lock className="w-3.5 h-3.5 text-slate-500" /></div>}
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Server className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-teal-500/80 uppercase tracking-widest">Module 3.2</span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-white group-hover:text-teal-400 transition-colors flex items-center gap-1.5">
                                02. Tally Direct XML API Import <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-teal-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">Connect directly to TallyPrime via XML API to auto-fetch ledgers &amp; vouchers.</p>
                            </div>
                          </div>

                          {/* 03. Tally Ledger Voucher Import */}
                          <div
                            onClick={() => setAppRoute('ledger-import')}
                            className="p-5 rounded-2xl bg-slate-950/60 border border-purple-500/20 hover:border-purple-500/50 transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[160px] relative"
                          >
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <BookOpen className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-purple-500/80 uppercase tracking-widest">Module 3.3</span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-white group-hover:text-purple-400 transition-colors flex items-center gap-1.5">
                                03. Tally Ledger Voucher Import <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-purple-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">Select specific Tally ledgers &amp; import complete transaction details &amp; entries.</p>
                            </div>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* CARD 4 DRILL-DOWN: STATUTORY AUDIT */}
                    {activeCategoryCard === 'audit' && (
                      <div className="glass-card-np neon-indigo p-6 md:p-8 rounded-3xl border border-indigo-500/20 bg-slate-900/60 backdrop-blur-xl relative overflow-hidden space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-indigo-500/20">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-500/5">
                              <ShieldAlert className="w-6 h-6" />
                            </div>
                            <div>
                              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[10px] font-black uppercase tracking-widest">
                                Suite 04 • 3 Modules
                              </div>
                              <h3 className="text-2xl font-black text-white tracking-tight mt-1">Statutory Audit Modules</h3>
                            </div>
                          </div>
                          <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                            Dual depreciation (Schedule II &amp; Sec 32), Form 3CD Clause 44 &amp; analytical audit sampling.
                          </p>
                        </div>

                        {/* Modules inside Card 4 */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                          {/* 01. Dual Depreciation */}
                          <div
                            onClick={() => setAppRoute('depreciation')}
                            className="p-5 rounded-2xl bg-slate-950/60 border border-emerald-500/20 hover:border-emerald-500/50 transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[160px]"
                          >
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <FileSpreadsheet className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-emerald-500/80 uppercase tracking-widest">Module 4.1</span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                                01. Dual Depreciation Engine <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-emerald-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">Automate Companies Act (Schedule II) &amp; Income Tax (Sec 32) depreciation.</p>
                            </div>
                          </div>

                          {/* 02. Tax Audit Clause 44 */}
                          <div
                            onClick={() => setAppRoute('clause44')}
                            className="p-5 rounded-2xl bg-slate-950/60 border border-violet-500/20 hover:border-violet-500/50 transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[160px]"
                          >
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <ShieldCheck className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-violet-500/80 uppercase tracking-widest">Module 4.2</span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-white group-hover:text-violet-400 transition-colors flex items-center gap-1.5">
                                02. Tax Audit — Clause 44 Parser <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-violet-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">Bifurcate expenses into GST &amp; Non-GST buckets for Winman Form 3CD.</p>
                            </div>
                          </div>

                          {/* 03. Analytical Audit Module */}
                          <div
                            onClick={() => setAppRoute('audit')}
                            className="p-5 rounded-2xl bg-slate-950/60 border border-indigo-500/20 hover:border-indigo-500/50 transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[160px]"
                          >
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <ShieldAlert className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-indigo-500/80 uppercase tracking-widest">Module 4.3</span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-white group-hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                                03. Analytical Audit &amp; Sampling <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-indigo-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">Integrated analytical audits, FIFO ageing &amp; SA 530 audit sampling.</p>
                            </div>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* CARD 5 DRILL-DOWN: TAXATION */}
                    {activeCategoryCard === 'tax' && (
                      <div className="glass-card-np neon-blue p-6 md:p-8 rounded-3xl border border-blue-500/20 bg-slate-900/60 backdrop-blur-xl relative overflow-hidden space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-blue-500/20">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-lg shadow-blue-500/5">
                              <Landmark className="w-6 h-6" />
                            </div>
                            <div>
                              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-widest">
                                Suite 05 • 1 Module
                              </div>
                              <h3 className="text-2xl font-black text-white tracking-tight mt-1">Taxation &amp; Calculator Suite</h3>
                            </div>
                          </div>
                          <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                            Tax liability calculation for FY 2025-26 &amp; FY 2026-27 with Old vs New regime optimization.
                          </p>
                        </div>

                        {/* Modules inside Card 5 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                          {/* 01. Income Tax Calculator */}
                          <div
                            onClick={() => setAppRoute('income-tax')}
                            className="p-5 rounded-2xl bg-slate-950/60 border border-blue-500/20 hover:border-blue-500/50 transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[160px]"
                          >
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Landmark className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-blue-500/80 uppercase tracking-widest">Module 5.1</span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
                                01. Income Tax Calculator <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-blue-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">Compare Old vs New regimes, optimize deductions &amp; compute surcharge with marginal relief.</p>
                            </div>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* CARD 6 DRILL-DOWN: BANK CMA SUITE */}
                    {activeCategoryCard === 'cma-bank' && (
                      <div className="glass-card-np neon-emerald p-6 md:p-8 rounded-3xl border border-cyan-500/20 bg-slate-900/60 backdrop-blur-xl relative overflow-hidden space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-cyan-500/20">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/5">
                              <Landmark className="w-6 h-6" />
                            </div>
                            <div>
                              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-black uppercase tracking-widest">
                                Suite 06 • 1 Module
                              </div>
                              <h3 className="text-2xl font-black text-white tracking-tight mt-1">Bank Ratio Analysis &amp; CMA Credit Suite</h3>
                            </div>
                          </div>
                          <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                            Underwriter-grade ratio analysis, Tally XML normalization, Tandon Committee Method II MPBF &amp; automated qualitative alerts.
                          </p>
                        </div>

                        {/* Modules inside Card 6 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                          {/* 01. CMA Bank Credit & Ratio Engine */}
                          <div
                            onClick={() => setAppRoute('bank-cma')}
                            className="p-5 rounded-2xl bg-slate-950/60 border border-cyan-500/20 hover:border-cyan-500/50 transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[160px]"
                          >
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Landmark className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-black text-cyan-500/80 uppercase tracking-widest">Module 6.1</span>
                            </div>
                            <div className="mt-4">
                              <h4 className="text-base font-bold text-white group-hover:text-cyan-400 transition-colors flex items-center gap-1.5">
                                01. CMA Bank Credit &amp; Ratio Engine <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-cyan-400" />
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">Extract Tally TB, normalize to CMA standards, calculate 10 ratios &amp; generate qualitative risk warnings.</p>
                            </div>
                          </div>

                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* FOOTER TEXT */}
                <div className="text-center pt-8 border-t border-slate-200/80">
                  <p className="text-[9px] font-mono tracking-[0.3em] text-slate-500 uppercase">OFFLINE COMPLIANCE PLATFORM • AUDIT WITH VASWANI • ALL RIGHTS SECURED</p>
                </div>
              </div>
            )}

            {appRoute === 'dashboard' && <ClientDashboard onBack={() => setAppRoute('hub')} />}

            {appRoute === 'consolidation' && <Consolidation onSendToReco={handleSendToReco} />}

            {appRoute === 'tally' && <TallyConverter onBack={() => setAppRoute('hub')} />}

            {appRoute === 'tally-direct' && <TallyDirectImport onBack={() => setAppRoute('hub')} onImportToReconciliation={handleDirectTallyImport} />}

            {appRoute === 'ledger-import' && <TallyLedgerImport onBack={() => setAppRoute('hub')} />}

            {appRoute === 'returns' && (
              <ReturnsDashboard
                onBack={() => setAppRoute('hub')}
                initialTab={returnsInitialTab}
                targetClientGstin={returnsTargetClient?.gstin}
                targetClientName={returnsTargetClient?.clientName}
              />
            )}

            

            {appRoute === 'tracker' && <GSTR2BTracker onBack={() => setAppRoute('hub')} companyName={companyName} />}

            {appRoute === 'fin-statements' && <FinancialStatements onBack={() => setAppRoute('hub')} />}

            {appRoute === 'gstin-scan' && <GstinScan onBack={() => setAppRoute('hub')} gstIssues={gstIssues} />}

            {appRoute === 'tds-reco' && <TdsReconciliation onBack={() => setAppRoute('hub')} />}

            {appRoute === 'cma' && <CmaReport onBack={() => setAppRoute('hub')} />}

            {appRoute === 'bank-cma' && <BankCmaAppraisal onBack={() => setAppRoute('hub')} />}

            {appRoute === 'voucher-reclass' && <VoucherReclassifier onBack={() => setAppRoute('hub')} />}

            {appRoute === 'depreciation' && <DepreciationModule onBack={() => setAppRoute('hub')} />}

            {appRoute === 'audit' && <AuditModule onBack={() => setAppRoute('hub')} />}

            {appRoute === 'income-tax' && <IncomeTaxDashboard onBack={() => setAppRoute('hub')} />}

            {appRoute === 'clause44' && <TaxAuditClause44 onBack={() => setAppRoute('hub')} />}

            {appRoute === 'notices' && <GstNoticesDashboard />}

            {appRoute === 'reco' && <Reconciliation
              setAppRoute={setAppRoute} mode={mode} setMode={setMode} step={step} setStep={setStep}
              companyName={companyName} setCompanyName={setCompanyName} tolerance={tolerance} setTolerance={setTolerance}
              fuzzyStrictness={fuzzyStrictness} setFuzzyStrictness={setFuzzyStrictness} processing={processing}
              progressValue={progressValue} results={results} setResults={setResults} summary={summary} setSummary={setSummary} parsedDebitNotes={parsedDebitNotes}
              gstr3bData={gstr3bData}
              handleProcess={handleReconcile} handleExport={null} handleBack={() => { setAppRoute('hub'); setMode(null); }}
              prMapping={prMapping}
              setPrMapping={setPrMapping}
              prFile={prFile} prDnFile={prDnFile} prCnFile={prCnFile}
              isMappingComplete={isMappingComplete}
              twoBHeaders={twoBHeaders} setTwoBHeaders={setTwoBHeaders}
              twoBMapping={twoBMapping} setTwoBMapping={setTwoBMapping}
              prDnHeaders={prDnHeaders} setPrDnHeaders={setPrDnHeaders}
              prCnHeaders={prCnHeaders} setPrCnHeaders={setPrCnHeaders}
              prDnMapping={prDnMapping} setPrDnMapping={setPrDnMapping}
              prCnMapping={prCnMapping} setPrCnMapping={setPrCnMapping}
              twoBDnFile={twoBDnFile} setTwoBDnFile={setTwoBDnFile}
              twoBDnHeaders={twoBDnHeaders} setTwoBDnHeaders={setTwoBDnHeaders}
              twoBDnMapping={twoBDnMapping} setTwoBDnMapping={setTwoBDnMapping}
              portalMappings={portalMappings} setPortalMappings={setPortalMappings}
              portalQueue={portalQueue} setPortalQueue={setPortalQueue}
              booksQueue={booksQueue} setBooksQueue={setBooksQueue}
              journals={journals} setJournals={setJournals}
              gstIssues={gstIssues} setGstIssues={setGstIssues}
              appliedGstins={appliedGstins} setAppliedGstins={setAppliedGstins}
              outputResults={outputResults} setOutputResults={setOutputResults}
              prHeaders={prHeaders} setPrHeaders={setPrHeaders}
              gstr3bFile={gstr3bFile} setGstr3bFile={setGstr3bFile}
              isPreparingPipeline={isPreparingPipeline} setIsPreparingPipeline={setIsPreparingPipeline}
              booksDrag={booksDrag} setBooksDrag={setBooksDrag}
              portalDrag={portalDrag} setPortalDrag={setPortalDrag}
              showAdvancedOptions={showAdvancedOptions} setShowAdvancedOptions={setShowAdvancedOptions}
              ignoreSpecialChars={ignoreSpecialChars} setIgnoreSpecialChars={setIgnoreSpecialChars}
              handleReconcile={handleReconcile}
              handleExportMonthly={handleExportMonthly}
              handleExportMonthlyDiff={handleExportMonthlyDiff}
              handleExportParty={handleExportParty}
              handleExportDebitNotes={handleExportDebitNotes}
              handleReset={handleReset}
              handlePreparePipeline={handlePreparePipeline}
              handleBooksDragOver={handleBooksDragOver}
              handleBooksDragLeave={handleBooksDragLeave}
              handleBooksDrop={handleBooksDrop}
              handlePortalDragOver={handlePortalDragOver}
              handlePortalDragLeave={handlePortalDragLeave}
              handlePortalDrop={handlePortalDrop}
              twoBFile={twoBFile}
            />}

          </div>
        </AppShell>

          {/* FEEDBACK MODAL */}
          {showFeedback && (
            <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-pop-in">
              <div className="bg-slate-900 border border-blue-500/30 rounded-2xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
                <button onClick={() => setShowFeedback(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6 border border-blue-500/20"><Star className="w-8 h-8 text-yellow-400 fill-yellow-400" /></div>
                <h2 className="text-2xl font-bold text-white mb-2">How's it going?</h2>
                <p className="text-slate-400 text-sm mb-6">You've successfully used our modules multiple times! We'd love to hear your feedback to help us improve.</p>
                <textarea className="w-full h-24 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-colors resize-none" placeholder="Share your thoughts..."></textarea>
                <div className="flex items-center gap-3 mt-6">
                  <button onClick={() => setShowFeedback(false)} className="flex-1 py-3 rounded-xl font-bold text-slate-400 hover:bg-slate-800 transition-colors">Skip</button>
                  <button onClick={() => { setShowFeedback(false); toast.success('Thank you for your feedback!'); }} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-colors">Submit</button>
                </div>
              </div>
            </div>
          )}

        

        <UserGuideCenter
          isOpen={showUserGuide}
          onClose={() => setShowUserGuide(false)}
          initialModule={guideActiveModule}
        />

        <GDriveConnectModal
          isOpen={isGDriveConnectOpen}
          onClose={() => setIsGDriveConnectOpen(false)}
        />

        <RecoHistoryModal
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          onRestoreSession={(payload) => {
            if (payload.results) {
              setResults(payload.results);
              safeSetItem('np_reco_results', JSON.stringify(payload.results));
            }
            if (payload.summary) {
              setSummary(payload.summary);
              safeSetItem('np_reco_summary', JSON.stringify(payload.summary));
            }
            if (payload.companyName) {
              setCompanyName(payload.companyName);
              safeSetItem('np_reco_company', payload.companyName);
            }
            setStep('results');
            safeSetItem('np_reco_step', 'results');

            const modName = payload.moduleName || (payload.moduleType === 'tds-reco' ? 'TDS Audit & Reco' : 'GST 2B Reco');
            toast.success(`Restored ${modName}: ${payload.companyName || 'Company'} (${payload.financialYear || '2024-25'})`);
            
            if (payload.moduleType === 'tds-reco') {
              setAppRoute('tds-reco');
            } else if (payload.moduleType === 'consolidation') {
              setAppRoute('consolidation');
            } else if (payload.moduleType === 'cma') {
              setAppRoute('cma');
            } else if (payload.moduleType === 'returns') {
              setAppRoute('returns');
            } else {
              setAppRoute('reco');
            }
          }}
          onOpenConnectModal={() => setIsGDriveConnectOpen(true)}
        />

        {/* SERVER OFFLINE BLOCKER */}
        {isAuthenticated && isServerOffline && (
          <div className="fixed inset-0 z-[999999] bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-4">
            <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mb-6 animate-pulse">
              <ShieldCheck className="w-12 h-12 text-red-500" />
            </div>
            <h2 className="text-3xl font-black text-white tracking-tight mb-3 text-center">Host Server Offline</h2>
            <p className="text-slate-400 text-center max-w-md mb-8 leading-relaxed">
              Connection to the background engine has been lost. The software is temporarily locked to protect your data. It will automatically unlock as soon as the server comes back online.
            </p>
            <div className="flex items-center gap-3 bg-slate-900 px-6 py-3 rounded-full border border-slate-800">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
              <span className="text-sm font-semibold text-slate-300">Attempting to reconnect...</span>
            </div>
          </div>
        )}
      </>
    );
  }
