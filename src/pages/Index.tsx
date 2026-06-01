import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ShieldCheck, ArrowRight, Plus, Sparkles, Building2, 
  FileSpreadsheet, RotateCcw, CloudDownload, Settings,
  Users, Database, FileCode2, Send, ImageIcon, 
  Lock, Key, Laptop, Activity, Server, AlertCircle, LogOut,
  ChevronRight, CalendarClock, ShieldAlert, GitCompare,
  Star, MessageSquare, X, Phone, Mail, MapPin, CheckCircle2, AlertTriangle, Lightbulb, Zap, Search
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
  exportMonthlyComparison, exportPartyWise, type MonthlyComparisonRow 
} from '@/lib/fileParser';
import { reconcile, getSummary, detectGstinIssues, type ReconciliationResult, type ReconciliationSummary, type GstinIssue } from '@/lib/reconciliation';
import { aggregateByParty } from '@/lib/partyWise';
import { cn } from '@/lib/utils';
import { GSTVerification } from '@/components/GSTVerification';

// Import compliance suites
import Splash from './Splash';
import AdminPanel from './AdminPanel';
import ClientDashboard from './ClientDashboard';
import Consolidation from './Consolidation';
import TallyConverter from './TallyConverter';
import TallyDirectImport from './TallyDirectImport';
import ReturnsDashboard from './ReturnsDashboard';
import ImageToExcel from './ImageToExcel';
import LandingPage from './LandingPage';
import GSTR2BTracker from './GSTR2BTracker';
import FinancialStatements from './FinancialStatements';

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
    background: #090d16;
  }
  .glass-card-np {
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.05);
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .glass-card-np:hover {
    border-color: var(--card-hover-border);
    box-shadow: 0 0 25px var(--card-glow);
    transform: translateY(-4px);
  }
  .neon-amber { --card-hover-border: rgba(245, 158, 11, 0.3); --card-glow: rgba(245, 158, 11, 0.15); }
  .neon-blue { --card-hover-border: rgba(59, 130, 246, 0.3); --card-glow: rgba(59, 130, 246, 0.15); }
  .neon-emerald { --card-hover-border: rgba(16, 185, 129, 0.3); --card-glow: rgba(16, 185, 129, 0.15); }
  .neon-pink { --card-hover-border: rgba(236, 72, 153, 0.3); --card-glow: rgba(236, 72, 153, 0.15); }
  .neon-purple { --card-hover-border: rgba(139, 92, 246, 0.3); --card-glow: rgba(139, 92, 246, 0.15); }
  .neon-yellow { --card-hover-border: rgba(234, 179, 8, 0.3); --card-glow: rgba(234, 179, 8, 0.15); }
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
  } catch(e) {}
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

  // --- 4. DASHBOARD ROUTER & SPLASH SCREEN LAYOUT STATES ---
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    return localStorage.getItem('np_splash_shown') !== 'true';
  });
  const [showFeedback, setShowFeedback] = useState(false);

  const [appRoute, setAppRoute] = useState<'hub' | 'reco' | 'tally' | 'tally-direct' | 'consolidation' | 'dashboard' | 'returns' | 'ocr' | 'tracker' | 'fin-statements'>(() => {
    return (safeGetItem('np_app_route') as any) || 'hub';
  });

  const [showAdmin, setShowAdmin] = useState(false);
  const [networkDiagnostics, setNetworkDiagnostics] = useState({ latency: 0, status: 'Online' });
  const [serverIpInput, setServerIpInput] = useState(() => getApiHost());
  const [showIpConfig, setShowIpConfig] = useState(false);

  // --- FEEDBACK SYSTEM STATES ---
  const [feedbackList, setFeedbackList] = useState<{name: string; rating: number; message: string; date: string}[]>(() => {
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
  const [twoBDnFile, setTwoBDnFile] = useState<File | null>(null);
  const [prDnHeaders, setPrDnHeaders] = useState<string[]>([]);
  const [twoBDnHeaders, setTwoBDnHeaders] = useState<string[]>([]);
  const [prDnMapping, setPrDnMapping] = useState<Partial<ColumnMapping>>({});
  const [twoBDnMapping, setTwoBDnMapping] = useState<Partial<ColumnMapping>>({});
  const [parsedDebitNotes, setParsedDebitNotes] = useState<{ pr: DebitNoteRecord[]; twoB: DebitNoteRecord[] }>(() => {
    try { return JSON.parse(safeGetItem('np_parsed_dn') || '{"pr":[],"twoB":[]}'); } catch { return { pr: [], twoB: [] }; }
  });

  // Auto-updater states
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [updateVersion, setUpdateVersion] = useState('');
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  const [appMode, setAppMode] = useState<'server' | 'client' | null>(null);
  const [appModeLoaded, setAppModeLoaded] = useState(false);
  const [serverIpInfo, setServerIpInfo] = useState<{ip: string, port: number, pcName: string} | null>(null);
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
        setAppMode(mode);
        if (mode) localStorage.setItem('np_app_mode', mode);
        else localStorage.removeItem('np_app_mode');
        setAppModeLoaded(true);
        if (mode === 'server') {
           fetch(`http://localhost:3001/api/network-info`).then(r => r.json()).then(data => setServerIpInfo(data)).catch(() => {});
        }
      }).catch(() => setAppModeLoaded(true));
    } else {
      setAppModeLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      const ping = () => {
        fetch(`http://${getApiHost()}:3001/api/heartbeat`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` }
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
        fetch(`http://${getApiHost()}:3001/api/usage`, {
          headers: { 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` }
        }).then(r => r.json()).then(data => {
          const config: Record<string, number> = {};
          if (Array.isArray(data)) data.forEach(d => { config[d.name] = d.is_enabled; });
          setModuleConfig(prev => JSON.stringify(prev) === JSON.stringify(config) ? prev : config);
        }).catch(() => {});
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
      fetch(`http://${getApiHost()}:3001/sessions`)
        .then(() => {
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
    setPrMapping({});
    setTwoBMapping({});
    setPrDnFile(null);
    setTwoBDnFile(null);
    setPrDnMapping({});
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

  const handlePrUpload = async (f: File) => {
    setPrFile(f);
    const { headers } = await parseFile(f);
    setPrHeaders(headers);
    setPrMapping(detectColumnMapping(headers));
  };

  const handleTwoBUpload = async (f: File) => {
    setTwoBFile(f);
    const { headers } = await parseFile(f);
    setTwoBHeaders(headers);
    setTwoBMapping(detectColumnMapping(headers));
  };

  const handleJournalUpload = async (files: File[]) => {
    const newJournals = await Promise.all(
      files.map(async (f) => {
        const { headers } = await parseFile(f);
        return { file: f, headers, mapping: detectColumnMapping(headers) };
      })
    );
    setJournals((prev) => [...prev, ...newJournals]);
  };

  const handlePrDnUpload = async (f: File) => {
    setPrDnFile(f);
    const { headers } = await parseFile(f);
    setPrDnHeaders(headers);
    setPrDnMapping(detectColumnMapping(headers));
  };

  const handleTwoBDnUpload = async (f: File) => {
    setTwoBDnFile(f);
    const { headers } = await parseFile(f);
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
        const data = await res.json();
        toast.error('Module Locked', { description: data.error || 'Usage limit reached' });
        return;
      }
    } catch (err) {
      toast.error('Connection Error', { description: 'Could not verify usage limits' });
      return;
    }
    setProcessing(true);
    setProgressValue(5);
    try {
      await new Promise((r) => setTimeout(r, 100)); // Yield to UI

      const prParsed = await parseFile(prFile!);
      const prRecs = mapToRecords(prParsed.rows, prMapping as ColumnMapping, 'PR', mode === 'input' ? 'Purchase Register' : 'Sales Register');
      setProgressValue(25);
      await new Promise((r) => setTimeout(r, 50));

      const twoBParsed = await parseFile(twoBFile!);
      const twoBRecs = mapToRecords(twoBParsed.rows, twoBMapping as ColumnMapping, '2B', mode === 'input' ? 'GSTR-2B' : 'GSTR-1');
      setProgressValue(45);
      await new Promise((r) => setTimeout(r, 50));

      for (const j of journals) {
        const jParsed = await parseFile(j.file);
        const jRecs = mapToRecords(jParsed.rows, j.mapping as ColumnMapping, 'PR', mode === 'input' ? 'Journal' : 'Sales Book');
        prRecs.push(...jRecs);
      }
      setProgressValue(60);
      await new Promise((r) => setTimeout(r, 50));
      
      const parsedPrDn: DebitNoteRecord[] = [];
      const parsedTwoBDn: DebitNoteRecord[] = [];
      if (prDnFile) {
        const parsed = await parseFile(prDnFile);
        const recs = mapToRecords(parsed.rows, prDnMapping as ColumnMapping, 'PR');
        parsedPrDn.push(...recs.map(r => ({ invoiceDate: r.invoiceDate, cgst: r.cgst, sgst: r.sgst, igst: r.igst })));
      }
      if (twoBDnFile) {
        const parsed = await parseFile(twoBDnFile);
        const recs = mapToRecords(parsed.rows, twoBDnMapping as ColumnMapping, '2B');
        parsedTwoBDn.push(...recs.map(r => ({ invoiceDate: r.invoiceDate, cgst: r.cgst, sgst: r.sgst, igst: r.igst })));
      }
      setParsedDebitNotes({ pr: parsedPrDn, twoB: parsedTwoBDn });
      setProgressValue(75);
      await new Promise((r) => setTimeout(r, 150));

      const res = reconcile(prRecs, twoBRecs, mode as 'input' | 'output', tolerance, 5);
      setProgressValue(95);
      await new Promise((r) => setTimeout(r, 150));

      setResults(res);
      setSummary(getSummary(res));
      const issues = detectGstinIssues(res);
      setGstIssues(issues);
      safeSetItem('np_reco_issues', JSON.stringify(issues));
      setAppliedGstins([]);
      safeSetItem('np_reco_applied_gstins', '[]');
      setProgressValue(100);
      await new Promise((r) => setTimeout(r, 200));

      setStep('review');
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      
      const newCount = parseInt(localStorage.getItem('np_usage_count') || '0') + 1;
      localStorage.setItem('np_usage_count', newCount.toString());
      if (newCount % 5 === 0) setShowFeedback(true);
      
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
        }).catch(() => {});
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
        dateTally: pr?.invoiceDate || '',
        partyCmp: tb?.supplierName || '',
        gstinCmp: tb?.gstin || '',
        invoiceCmp: tb?.invoiceNo || '',
        cgstCmp: tb?.cgst || 0,
        sgstCmp: tb?.sgst || 0,
        igstCmp: tb?.igst || 0,
        dateCmp: tb?.invoiceDate || '',
        status: r.status,
        totalDiff: (r.cgstDiff ?? 0) + (r.sgstDiff ?? 0) + (r.igstDiff ?? 0),
      };
    });
    exportMonthlyComparison(exportRows, 'Monthly_Comparison.xlsx', parsedDebitNotes, companyName);
  }, [results, parsedDebitNotes, companyName]);

  const handleExportParty = useCallback(() => {
    if (!results) return;
    exportPartyWise(aggregateByParty(results), 'Party_Wise_Report.xlsx', companyName);
  }, [results, companyName]);

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
          }).catch(() => {});
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
          }).catch(() => {});
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
    fetch(`http://${getApiHost()}:3001/api/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` }
    }).catch(() => {});

    sessionStorage.removeItem('np_token');
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

  // --- 9. CENTRAL RENDER MATCH ROTATION INTERFACE ---

  if (!appModeLoaded) {
    return (
      <div className="dark min-h-screen flex items-center justify-center bg-[#090d16]">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // LAYER 0.1: Mode Selection
  if (appMode === null) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: themeStyles }} />
        <div className="dark min-h-screen flex items-center justify-center p-6 bg-[#090d16]">
          <div className="relative z-10 w-full max-w-2xl bg-slate-900/60 border border-slate-800 rounded-3xl p-10 backdrop-blur-xl shadow-2xl animate-pop-in">
            <div className="text-center mb-10">
              <h1 className="text-3xl font-black text-white tracking-tight mb-2">Select Setup Mode</h1>
              <p className="text-sm text-slate-400">Choose how this computer will participate in the RECO network.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <button 
                onClick={async () => {
                  if ((window as any).electronAPI) await (window as any).electronAPI.invoke('set_app_mode', 'server');
                  localStorage.setItem('np_app_mode', 'server');
                  setAppMode('server');
                  toast.success("Mode set to Server.");
                }}
                className="group relative h-48 rounded-2xl border-2 border-slate-700 bg-slate-950/50 hover:border-purple-500 hover:bg-slate-900 transition-all flex flex-col items-center justify-center p-6 cursor-pointer overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <Server className="w-12 h-12 text-slate-400 group-hover:text-purple-400 mb-4 transition-colors" />
                <h3 className="text-lg font-bold text-white mb-2">Set up as Server</h3>
                <p className="text-xs text-slate-400 text-center">I am the main admin. I hold the Master Server Key.</p>
              </button>

              <button 
                onClick={async () => {
                  if ((window as any).electronAPI) await (window as any).electronAPI.invoke('set_app_mode', 'client');
                  localStorage.setItem('np_app_mode', 'client');
                  setAppMode('client');
                  toast.success("Mode set to Client.");
                }}
                className="group relative h-48 rounded-2xl border-2 border-slate-700 bg-slate-950/50 hover:border-blue-500 hover:bg-slate-900 transition-all flex flex-col items-center justify-center p-6 cursor-pointer overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <Laptop className="w-12 h-12 text-slate-400 group-hover:text-blue-400 mb-4 transition-colors" />
                <h3 className="text-lg font-bold text-white mb-2">Connect as Client</h3>
                <p className="text-xs text-slate-400 text-center">I am an employee connecting to the main server.</p>
              </button>
            </div>
          </div>
        </div>
      </>
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
             <div className="absolute bottom-[10%] right-[20%] w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] animate-pulse" style={{animationDelay: '2s'}}></div>
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
              <p className="text-xs text-slate-400 font-medium mt-2">Enter your active RECO WITH VASWANI serial key to authorize this machine.</p>

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
             <div className="absolute bottom-[20%] left-[10%] w-[450px] h-[450px] bg-emerald-600/5 rounded-full blur-[120px] animate-pulse" style={{animationDelay: '3s'}}></div>
          </div>
          
          <div className="relative z-10 w-full max-w-md bg-slate-900/60 border border-slate-800 rounded-3xl p-8 backdrop-blur-xl shadow-2xl animate-pop-in">
            <div className="flex justify-between w-full mb-6">
              <button 
                onClick={async () => {
                  if ((window as any).electronAPI) await (window as any).electronAPI.invoke('set_app_mode', null);
                  localStorage.removeItem('np_app_mode');
                  setAppMode(null);
                }} 
                className="text-slate-400 hover:text-white flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px] transition-colors"
              >
                 <ArrowRight className="w-3 h-3 transform rotate-180" /> Change Setup Mode
              </button>
              <button 
                onClick={async () => {
                  if(confirm('Are you sure you want to factory reset this installation? This will clear activation.')) {
                    localStorage.clear();
                    sessionStorage.clear();
                    if ((window as any).electronAPI) await (window as any).electronAPI.invoke('set_app_mode', null);
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
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">RECO WITH VASWANI</h1>
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
                    onChange={(e) => setRememberMe(e.checked)}
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

    // 4. Parse primary file to set headers and mappings
    try {
      const parsedPr = await parseFile(data.prFile);
      setPrHeaders(parsedPr.headers);
      setPrMapping(detectColumnMapping(parsedPr.headers));

      if (data.prDnFile) {
        const parsedDn = await parseFile(data.prDnFile);
        setPrDnHeaders(parsedDn.headers);
        setPrDnMapping(detectColumnMapping(parsedDn.headers));
      }

      if (data.journalFiles && data.journalFiles.length > 0) {
        const newJournals = await Promise.all(
          data.journalFiles.map(async (f) => {
            const parsedJ = await parseFile(f);
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

  // LAYER 5: Post-Login RECO WITH VASWANI Compliance Platform Home Suite Hub
  const handleSendToReco = (company: string) => {
    setCompanyName(company);
    setMode(null);
    setAppRoute('reco');
    setStep('upload');
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeStyles }} />
      <div className="min-h-screen bg-[#090d16] text-[#E4EEF8] transition-colors duration-500 relative overflow-hidden">
        
        {/* ROTATING AMBIENT GLOW BACKDROPS */}
        <div className="absolute inset-0 z-0 pointer-events-none">
           <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-blue-600/10 rounded-full blur-[140px] animate-pulse"></div>
           <div className="absolute bottom-[15%] right-[15%] w-[450px] h-[450px] bg-emerald-600/10 rounded-full blur-[140px] animate-pulse" style={{animationDelay: '3s'}}></div>
        </div>

        {/* TOP STATUS DIAGNOSTIC NAV BAR */}
        <nav className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-[#1E3050] bg-[#141920]/75 backdrop-blur-xl flex items-center justify-between px-6">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setAppRoute('hub')}>
            <div className="w-9 h-9 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden transition-all duration-300 group-hover:border-blue-500 group-hover:shadow-[0_0_12px_rgba(74,158,232,0.3)]">
               <img src="./logo.png" alt="Logo" className="w-6 h-6 object-contain" />
            </div>
            <div>
               <h1 className="text-md font-extrabold tracking-tight text-white flex items-center gap-1.5">RECO WITH VASWANI <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-bold tracking-widest uppercase">PRO</span></h1>
               <p className="text-[8px] text-slate-400 uppercase tracking-widest font-bold mt-0.5">Offline Enterprise Suite v1.4.1</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
             {/* Diagnostics Logs */}
             <div className="hidden md:flex items-center gap-3.5 px-4 py-1.5 rounded-full bg-slate-950/40 border border-slate-800/80 text-[10px] font-mono tracking-wide text-slate-400">
                <span className="flex items-center gap-1.5">
                   <Server className="w-3 h-3 text-slate-500" /> Host IP: 
                   <span className="text-slate-300">
                     {appMode === 'server' && serverIpInfo ? serverIpInfo.ip : getApiHost()}
                   </span>
                </span>
                <span className="w-px h-3 bg-slate-800"></span>
                <span className="flex items-center gap-1.5">
                   <Activity className="w-3 h-3 text-slate-500" /> Health: 
                   <span className={cn('font-bold', networkDiagnostics.status === 'Connected' ? 'text-emerald-400' : 'text-rose-400')}>
                      {networkDiagnostics.status === 'Connected' ? `Active (${networkDiagnostics.latency}ms)` : 'Offline'}
                   </span>
                </span>
                <span className="w-px h-3 bg-slate-800"></span>
                <span className="flex items-center gap-1.5">
                   <Users className="w-3 h-3 text-slate-500" /> User: <span className="text-blue-400 font-bold uppercase">{loginUser}</span>
                </span>
             </div>

             <div className="flex items-center gap-2">
                {isAdmin && (
                  <button 
                    onClick={() => setShowAdmin(!showAdmin)}
                    className="px-3.5 py-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                  >
                     Admin Panel
                  </button>
                )}
                
                <ThemeToggle />

                <button 
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-rose-400 bg-slate-900/50 hover:bg-rose-500/10 border border-slate-800 rounded-lg transition-colors"
                  title="Secure Session Logout"
                >
                   <LogOut className="w-4 h-4" />
                </button>
             </div>
          </div>
        </nav>

        {/* DYNAMIC COMPONENT LOADER WRAPPER */}
        <main className="container mx-auto px-6 pt-24 pb-12 relative z-10 min-h-[calc(100vh-4rem)] flex flex-col justify-start">
           
           {appRoute === 'hub' && (
              <div className="space-y-12 max-w-6xl mx-auto w-full animate-slow-reveal">
                 
                 {/* INTUITIVE GRAPHIC DESIGN HERO */}
                 <div className="text-center space-y-4 max-w-3xl mx-auto mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-widest">
                       <Sparkles className="w-3.5 h-3.5 text-blue-400" /> Interactive Compliance Hub
                    </div>
                    <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white">
                       Unified Workspace Suite
                    </h2>
                    <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
                       Access high-performance compliance modules directly from this command console. All local data is processed and kept strictly on-premise.
                    </p>
                 </div>

                 {/* 3x2 SYMMETRICAL COMPLIANCE TOOLS GRID */}
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    
                    {/* Card 1: Practice Dashboard (Amber Accent) */}
                    <div 
                      onClick={() => moduleConfig['Dashboard'] !== 0 && setAppRoute('dashboard')}
                      className={`glass-card-np neon-amber p-6 rounded-2xl ${moduleConfig['Dashboard'] !== 0 ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[220px] relative`}
                    >
                       {moduleConfig['Dashboard'] === 0 && <div className="absolute top-4 right-4"><Lock className="w-4 h-4 text-slate-500" /></div>}
                       <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                             <Users className="w-6 h-6" />
                          </div>
                          <span className="text-[10px] font-black text-slate-500 group-hover:text-amber-500 transition-colors uppercase tracking-widest">Control Suite</span>
                       </div>
                       <div className="mt-8">
                          <h3 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors">Practice Dashboard</h3>
                          <p className="text-xs text-slate-400 mt-2 leading-relaxed">Manage clients list, track filing due dates, and securely back up database tables to Google Drive.</p>
                       </div>
                    </div>

                    {/* Card 2: Consolidate Ledgers (Blue Accent) */}
                    <div 
                      onClick={() => moduleConfig['Consolidator'] !== 0 && setAppRoute('consolidation')}
                      className={`glass-card-np neon-blue p-6 rounded-2xl ${moduleConfig['Consolidator'] !== 0 ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[220px] relative`}
                    >
                       {moduleConfig['Consolidator'] === 0 && <div className="absolute top-4 right-4"><Lock className="w-4 h-4 text-slate-500" /></div>}
                       <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 text-blue-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                             <Database className="w-6 h-6" />
                          </div>
                          <span className="text-[10px] font-black text-slate-500 group-hover:text-blue-500 transition-colors uppercase tracking-widest">Organization</span>
                       </div>
                       <div className="mt-8">
                          <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">Consolidate Ledgers</h3>
                          <p className="text-xs text-slate-400 mt-2 leading-relaxed">Merge decentralized multi-branch sales or purchase ledgers into a clean consolidated sheet format.</p>
                       </div>
                    </div>

                    {/* Card 3: GST Reconciliation (Emerald Accent) */}
                    <div 
                      onClick={() => { if (moduleConfig['RecoEngine'] !== 0) { setAppRoute('reco'); setMode(null); setStep('upload'); } }}
                      className={`glass-card-np neon-emerald p-6 rounded-2xl ${moduleConfig['RecoEngine'] !== 0 ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[220px] relative`}
                    >
                       {moduleConfig['RecoEngine'] === 0 && <div className="absolute top-4 right-4"><Lock className="w-4 h-4 text-slate-500" /></div>}
                       <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                             <ShieldCheck className="w-6 h-6" />
                          </div>
                          <span className="text-[10px] font-black text-slate-500 group-hover:text-emerald-500 transition-colors uppercase tracking-widest">Audit Engine</span>
                       </div>
                       <div className="mt-8">
                          <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">GST Reconciliation</h3>
                          <p className="text-xs text-slate-400 mt-2 leading-relaxed">High-performance matching engine with custom thresholds, debit notes parsing, and automatic discrepancy alerts.</p>
                       </div>
                    </div>

                    {/* Card 4: Tally XML Converter (Pink Accent) */}
                    <div 
                      onClick={() => moduleConfig['TallyConverter'] !== 0 && setAppRoute('tally')}
                      className={`glass-card-np neon-pink p-6 rounded-2xl ${moduleConfig['TallyConverter'] !== 0 ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[220px] relative`}
                    >
                       {moduleConfig['TallyConverter'] === 0 && <div className="absolute top-4 right-4"><Lock className="w-4 h-4 text-slate-500" /></div>}
                       <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-pink-500/10 border border-pink-500/20 text-pink-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                             <FileCode2 className="w-6 h-6" />
                          </div>
                          <span className="text-[10px] font-black text-slate-500 group-hover:text-pink-500 transition-colors uppercase tracking-widest">Extraction</span>
                       </div>
                       <div className="mt-8">
                          <h3 className="text-lg font-bold text-white group-hover:text-pink-400 transition-colors">Tally XML Converter</h3>
                          <p className="text-xs text-slate-400 mt-2 leading-relaxed">Dual-engine parser that decodes raw Tally XML files into perfectly styled Excel books in 500ms.</p>
                       </div>
                    </div>

                    {/* Card 4b: Tally Direct Import (Teal Accent) */}
                    <div 
                      onClick={() => moduleConfig['TallyDirect'] !== 0 && setAppRoute('tally-direct')}
                      className={`glass-card-np neon-teal p-6 rounded-2xl ${moduleConfig['TallyDirect'] !== 0 ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[220px] relative`}
                    >
                       {moduleConfig['TallyDirect'] === 0 && <div className="absolute top-4 right-4"><Lock className="w-4 h-4 text-slate-500" /></div>}
                       <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-teal-500/10 border border-teal-500/20 text-teal-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                             <Server className="w-6 h-6" />
                          </div>
                          <span className="text-[10px] font-black text-slate-500 group-hover:text-teal-500 transition-colors uppercase tracking-widest">Live API</span>
                       </div>
                       <div className="mt-8">
                          <h3 className="text-lg font-bold text-white group-hover:text-teal-400 transition-colors">Tally Direct Import</h3>
                          <p className="text-xs text-slate-400 mt-2 leading-relaxed">Connect directly to TallyPrime via XML API. Auto-fetch purchase, sales, journal & credit/debit notes.</p>
                       </div>
                    </div>

                     {/* Card 4c: GSTR-2B & 3B Compliance Tracker (Yellow Accent) */}
                     <div 
                       onClick={() => moduleConfig['Tracker'] !== 0 && setAppRoute('tracker')}
                       className={`glass-card-np neon-yellow p-6 rounded-2xl ${moduleConfig['Tracker'] !== 0 ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[220px] relative`}
                     >
                        {moduleConfig['Tracker'] === 0 && <div className="absolute top-4 right-4"><Lock className="w-4 h-4 text-slate-500" /></div>}
                        <div className="flex justify-between items-start">
                           <div className="w-12 h-12 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                              <Search className="w-6 h-6" />
                           </div>
                           <span className="text-[10px] font-black text-slate-500 group-hover:text-yellow-500 transition-colors uppercase tracking-widest">ITC Suite</span>
                        </div>
                        <div className="mt-8">
                           <h3 className="text-lg font-bold text-white group-hover:text-yellow-400 transition-colors">GSTR-2B & 3B Tracker</h3>
                           <p className="text-xs text-slate-400 mt-2 leading-relaxed">Invoice-wise GSTR-2B matching & monthly GSTR-3B summary returns analysis for full financial year (April to March).</p>
                        </div>
                     </div>

                    {/* Card 5: Returns Prep & Filing (Purple Accent) */}
                    <div 
                      onClick={() => moduleConfig['Returns'] !== 0 && setAppRoute('returns')}
                      className={`glass-card-np neon-purple p-6 rounded-2xl ${moduleConfig['Returns'] !== 0 ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[220px] relative`}
                    >
                       {moduleConfig['Returns'] === 0 && <div className="absolute top-4 right-4"><Lock className="w-4 h-4 text-slate-500" /></div>}
                       <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/20 text-purple-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                             <Send className="w-6 h-6" />
                          </div>
                          <span className="text-[10px] font-black text-slate-500 group-hover:text-purple-500 transition-colors uppercase tracking-widest">Taxation Suite</span>
                       </div>
                       <div className="mt-8">
                          <h3 className="text-lg font-bold text-white group-hover:text-purple-400 transition-colors">Returns Preparation</h3>
                          <p className="text-xs text-slate-400 mt-2 leading-relaxed">Validate compliance registers offline, prepare draft filings, and auto-upload JSON returns safely.</p>
                       </div>
                    </div>

                    {/* Card 6: AI Vision OCR Engine (Yellow Accent) */}
                    <div 
                      onClick={() => moduleConfig['OCR'] !== 0 && setAppRoute('ocr')}
                      className={`glass-card-np neon-yellow p-6 rounded-2xl ${moduleConfig['OCR'] !== 0 ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[220px] relative`}
                    >
                       {moduleConfig['OCR'] === 0 && <div className="absolute top-4 right-4"><Lock className="w-4 h-4 text-slate-500" /></div>}
                       <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                             <ImageIcon className="w-6 h-6" />
                          </div>
                          <span className="text-[10px] font-black text-slate-500 group-hover:text-yellow-500 transition-colors uppercase tracking-widest">Intelligence</span>
                       </div>
                       <div className="mt-8">
                          <h3 className="text-lg font-bold text-white group-hover:text-yellow-400 transition-colors">AI Deep-Vision OCR</h3>
                          <p className="text-xs text-slate-400 mt-2 leading-relaxed">Upload raw invoice pictures or screenshot slices. Vision models extract and format tabular rows instantly.</p>
                       </div>
                    </div>

                     {/* Card 7: Financial Statements (Cyan Accent) */}
                     <div 
                       onClick={() => moduleConfig['FinStatements'] !== 0 && setAppRoute('fin-statements')}
                       className={`glass-card-np neon-blue p-6 rounded-2xl ${moduleConfig['FinStatements'] !== 0 ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[220px] relative`}
                       style={{ '--card-hover-border': 'rgba(6, 182, 212, 0.3)', '--card-glow': 'rgba(6, 182, 212, 0.15)' } as React.CSSProperties}
                     >
                        {moduleConfig['FinStatements'] === 0 && <div className="absolute top-4 right-4"><Lock className="w-4 h-4 text-slate-500" /></div>}
                        <div className="flex justify-between items-start">
                           <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-500/20 text-cyan-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                              <FileSpreadsheet className="w-6 h-6" />
                           </div>
                           <span className="text-[10px] font-black text-slate-500 group-hover:text-cyan-500 transition-colors uppercase tracking-widest">Schedule III</span>
                        </div>
                        <div className="mt-8">
                           <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors">Financial Statements</h3>
                           <p className="text-xs text-slate-400 mt-2 leading-relaxed">Automated BS, P&L, Cash Flow & Notes to Accounts compliant with the Companies Act, 2013.</p>
                        </div>
                     </div>

                 </div>

                 {/* FOOTER TEXT */}
                 <div className="text-center pt-8 border-t border-slate-800/80">
                    <p className="text-[9px] font-mono tracking-[0.3em] text-slate-500 uppercase">OFFLINE COMPLIANCE PLATFORM • RECO WITH VASWANI • ALL RIGHTS SECURED</p>
                 </div>
              </div>
           )}

           {appRoute === 'dashboard' && <ClientDashboard onBack={() => setAppRoute('hub')} />}
           
           {appRoute === 'consolidation' && <Consolidation onSendToReco={handleSendToReco} />}
           
           {appRoute === 'tally' && <TallyConverter onBack={() => setAppRoute('hub')} />}

           {appRoute === 'tally-direct' && <TallyDirectImport onBack={() => setAppRoute('hub')} onImportToReconciliation={handleDirectTallyImport} />}

           {appRoute === 'returns' && <ReturnsDashboard onBack={() => setAppRoute('hub')} />}

           {appRoute === 'ocr' && <ImageToExcel onBack={() => setAppRoute('hub')} />}

           {appRoute === 'tracker' && <GSTR2BTracker onBack={() => setAppRoute('hub')} companyName={companyName} />}

           {appRoute === 'fin-statements' && <FinancialStatements onBack={() => setAppRoute('hub')} />}

           {appRoute === 'reco' && (
              <div className="w-full silk-reveal">
                 
                 {/* Hub Navigation Bridge */}
                 <button 
                   onClick={() => { setAppRoute('hub'); setMode(null); }}
                   className="text-slate-400 hover:text-white flex items-center gap-2 font-bold uppercase tracking-wider text-[10px] mb-6 transition-colors"
                 >
                    <ArrowRight className="w-3 h-3 transform rotate-180" /> Back to Hub
                 </button>

                 {!mode ? (
                    <ModeSelector onSelect={setMode} />
                 ) : (
                   <div className="space-y-12">
                     <div className="border-b border-[#1E3050] bg-[#141920]/80 backdrop-blur-xl sticky top-16 z-30 -mx-6 px-6">
                       <div className="flex items-center justify-between gap-4 py-3">
                         <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{mode === 'input' ? 'Purchase Engine' : 'Sales Engine'}</span>
                         </div>
                         <div className="flex items-center gap-2">
                           {(['upload', 'map', 'review', 'results'] as Step[]).map((s, idx) => {
                             const isActive = s === step;
                             const isDone = (['upload', 'map', 'review', 'results'].indexOf(step)) > idx;
                             const stepName = s === 'upload' ? 'Source' : s === 'map' ? 'Pipeline' : s === 'review' ? 'Verify' : 'Dashboard';
                             return (
                               <button
                                 key={s}
                                 onClick={() => isDone && setStep(s)}
                                 className={cn(
                                   'px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all duration-300',
                                   isActive ? 'bg-[var(--np-sky)] text-white shadow-lg shadow-[var(--np-sky)]/20 scale-[1.05]' :
                                   isDone ? 'text-[var(--np-green)] hover:bg-[var(--np-green)]/10 bg-[var(--np-green)]/5' : 'text-slate-500 cursor-not-allowed opacity-50'
                                 )}
                               >
                                 <span className="mr-1.5 opacity-50">{idx + 1}</span> {stepName}
                               </button>
                             );
                           })}
                         </div>
                         <div className="flex items-center gap-2">
                           <button onClick={() => handleReset(false)} className="btn-np-outline !px-3 !py-1 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                             <RotateCcw className="w-3 h-3" /> Reset
                           </button>
                           <ModeSwitcher currentMode={mode} onSwitch={() => handleReset(true)} />
                         </div>
                       </div>
                     </div>

                     {step === 'upload' && (
                       <div className="space-y-12 max-w-6xl mx-auto w-full silk-reveal pt-4">
                         
                         {/* Config and Primary Upload grid */}
                         <div className="grid lg:grid-cols-12 gap-8">
                           <div className="lg:col-span-4 space-y-6">
                             
                             <div className="rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-2xl sticky top-32 shadow-2xl hover:border-white/10 transition-all duration-500 overflow-hidden">
                               <div className="px-6 py-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                                 <div className="flex items-center gap-2">
                                   <Settings className="w-4 h-4 text-blue-400" />
                                   <span className="text-sm font-semibold text-white tracking-wide">Configuration</span>
                                 </div>
                               </div>
                               <div className="p-6 space-y-6">
                                 <div>
                                   <label className="text-xs font-semibold text-slate-400 mb-2 block">Company Name</label>
                                   <div className="relative group">
                                     <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                                     <input
                                       type="text"
                                       placeholder="Organization branding"
                                       value={companyName}
                                       onChange={(e) => setCompanyName(e.target.value)}
                                       className="w-full h-11 bg-black/40 border border-white/5 rounded-xl pl-11 pr-4 text-sm text-white focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all placeholder:text-slate-600"
                                     />
                                   </div>
                                 </div>
                                 
                                 <div>
                                   <label className="text-xs font-semibold text-slate-400 mb-2 block">Match Tolerance</label>
                                   <div className="relative group">
                                     <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500 group-focus-within:text-blue-500 transition-colors">₹</div>
                                     <input
                                       type="number"
                                       min="0" step="0.5"
                                       value={tolerance}
                                       onChange={(e) => setTolerance(parseFloat(e.target.value) || 0)}
                                       className="w-full h-11 bg-black/40 border border-white/5 rounded-xl pl-10 pr-4 text-sm text-white focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all"
                                     />
                                   </div>
                                   <p className="text-xs text-slate-500 mt-2">Maximum allowed rounding discrepancy</p>
                                 </div>

                                 <div className="pt-6 border-t border-white/5">
                                   <div className="flex items-center justify-between mb-4">
                                     <label className="text-xs font-semibold text-slate-400">Secondary Ledgers</label>
                                     <label className="cursor-pointer text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors">
                                       <input type="file" accept=".csv,.xlsx,.xls" multiple onChange={(e) => { const files = e.target.files; if (files?.length) handleJournalUpload(Array.from(files)); e.target.value = ''; }} className="hidden" />
                                       + Attach File
                                     </label>
                                   </div>

                                   {journals.length > 0 ? (
                                     <div className="space-y-2">
                                       {journals.map((j, idx) => (
                                         <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5 group hover:border-emerald-500/30 transition-all">
                                           <div className="flex items-center gap-3 min-w-0">
                                             <FileSpreadsheet className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                             <span className="text-xs font-medium text-slate-300 truncate">{j.file.name}</span>
                                           </div>
                                           <button onClick={() => removeJournal(idx)} className="text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"><RotateCcw className="w-4 h-4" /></button>
                                         </div>
                                       ))}
                                     </div>
                                   ) : (
                                     <div className="p-4 rounded-xl bg-black/20 border border-dashed border-white/10">
                                       <p className="text-xs text-slate-500 text-center font-medium">Optional: Merge supplementary registers</p>
                                     </div>
                                   )}
                                 </div>

                               </div>
                             </div>

                           </div>

                           <div className="lg:col-span-2 space-y-6">
                             <div className="grid sm:grid-cols-2 gap-8">
                               <div className="relative group h-full">
                                 <div className="absolute -top-3 left-6 z-20 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-blue-500/30 text-blue-400 text-xs font-semibold shadow-lg">
                                    Primary Book
                                 </div>
                                 <FileUploadZone
                                   label={TERMS[mode].primaryBookLabel}
                                   description={TERMS[mode].primaryBookDesc}
                                   onFileSelect={handlePrUpload}
                                   fileName={prFile?.name}
                                   className="h-full min-h-[300px] pt-6"
                                 />
                               </div>
                               <div className="relative group h-full">
                                 <div className="absolute -top-3 left-6 z-20 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-emerald-500/30 text-emerald-400 text-xs font-semibold shadow-lg">
                                    Government Portal
                                 </div>
                                 <FileUploadZone
                                   label={TERMS[mode].govtLabel}
                                   description={TERMS[mode].govtDesc}
                                   onFileSelect={handleTwoBUpload}
                                   fileName={twoBFile?.name}
                                   className="h-full min-h-[300px] pt-6"
                                 />
                               </div>
                             </div>

                             {/* Debit notes optional adjust card */}
                             <div className="rounded-2xl border border-dashed border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40 transition-all duration-300">
                               <div className="px-6 py-4 border-b border-emerald-500/10 flex items-center justify-between">
                                 <span className="text-sm font-semibold text-emerald-400">Credit/Debit Note Adjustments</span>
                                 <Sparkles className="w-4 h-4 text-emerald-400" />
                               </div>
                               <div className="p-6">
                                 <p className="text-xs font-medium text-slate-400 mb-6 leading-relaxed max-w-xl">Optional: Provide credit/debit adjustment ledgers to fine-tune final monthly reports.</p>
                                 <div className="grid sm:grid-cols-2 gap-6">
                                   <FileUploadZone
                                     label="PR Debit Notes"
                                     description="Adjustment ledger"
                                     onFileSelect={handlePrDnUpload}
                                     fileName={prDnFile?.name}
                                     compact
                                   />
                                   <FileUploadZone
                                     label="2B Adjustments"
                                     description="Government adjustments"
                                     onFileSelect={handleTwoBDnUpload}
                                     fileName={twoBDnFile?.name}
                                     compact
                                   />
                                 </div>
                               </div>
                             </div>

                             {/* GSTR-3B Summary Return optional upload card */}
                             <div className="rounded-2xl border border-dashed border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40 transition-all duration-300">
                               <div className="px-6 py-4 border-b border-blue-500/10 flex items-center justify-between">
                                 <span className="text-sm font-semibold text-blue-400">GSTR-3B Month-wise ITC (claimed)</span>
                                 <FileSpreadsheet className="w-4 h-4 text-blue-400" />
                               </div>
                               <div className="p-6">
                                 <p className="text-xs font-medium text-slate-400 mb-6 leading-relaxed max-w-xl">Optional: Provide GSTR-3B summary (3B ITC.xlsx) to cross-reconcile Books vs GSTR-3B vs GSTR-2B month-wise.</p>
                                 <FileUploadZone
                                   label="Upload GSTR-3B Summary"
                                   description="3B ITC.xlsx spreadsheet"
                                   onFileSelect={handleGSTR3BUpload}
                                   fileName={gstr3bFile?.name}
                                   compact
                                 />
                               </div>
                             </div>

                             {/* Launch action trigger */}
                             {prFile && twoBFile && (
                               <div className="flex flex-col gap-3 pt-4 silk-reveal">
                                 <div className="h-px bg-gradient-to-r from-transparent via-slate-800 to-transparent"></div>
                                 <button 
                                   onClick={handleProceedToMap} 
                                   className="w-full btn-np-primary h-14 text-sm uppercase tracking-widest gap-2 flex items-center justify-center font-bold shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 hover:scale-[1.01] transition-all duration-300"
                                 >
                                   Configure Pipeline Mappings <ArrowRight className="w-4 h-4" />
                                 </button>
                               </div>
                             )}

                           </div>
                         </div>

                       </div>
                     )}

                     {step === 'map' && (
                       <div className="max-w-4xl mx-auto space-y-8 silk-reveal pt-4">
                         <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                            <h2 className="text-xl font-bold text-white">Reconciliation Mappings</h2>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Set fields mapping</div>
                         </div>

                         <div className="space-y-8">
                           <div className="dash-card">
                             <div className="dash-topbar">
                               <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{TERMS[mode].primaryBookLabel} Source</span>
                             </div>
                             <div className="p-2">
                               <ColumnMapper
                                 title={`${TERMS[mode].primaryBookLabel} Mapping`}
                                 headers={prHeaders}
                                 mapping={prMapping}
                                 onChange={setPrMapping}
                                 requireTaxable={mode === 'output'}
                                 labelOverrides={{ supplierName: TERMS[mode].partyLabel }}
                               />
                             </div>
                           </div>

                           {journals.map((j, idx) => (
                             <div key={idx} className="dash-card">
                               <div className="dash-topbar">
                                 <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Supplemental: {j.file.name}</span>
                               </div>
                               <div className="p-2">
                                 <ColumnMapper
                                   title={`Supplemental Ledger: ${j.file.name}`}
                                   headers={j.headers}
                                   mapping={j.mapping}
                                   onChange={(newMap) => {
                                     const newJ = [...journals];
                                     newJ[idx].mapping = newMap;
                                     setJournals(newJ);
                                   }}
                                   requireTaxable={mode === 'output'}
                                   labelOverrides={{ supplierName: TERMS[mode].partyLabel }}
                                 />
                               </div>
                             </div>
                           ))}

                           <div className="dash-card border-blue-500/20">
                             <div className="dash-topbar bg-blue-900/10">
                               <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{TERMS[mode].govtLabel} Source</span>
                             </div>
                             <div className="p-2">
                               <ColumnMapper
                                 title={`${TERMS[mode].govtLabel} Mapping`}
                                 headers={twoBHeaders}
                                 mapping={twoBMapping}
                                 onChange={setTwoBMapping}
                                 requireTaxable={mode === 'output'}
                                 labelOverrides={{ supplierName: TERMS[mode].partyLabel, filingStatus: 'Filing Period (optional)' }}
                               />
                             </div>
                           </div>

                           {prDnFile && (
                             <div className="dash-card">
                                <div className="dash-topbar"><span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{TERMS[mode].primaryShort} Debit Notes</span></div>
                                <div className="p-2">
                                   <ColumnMapper title={`${TERMS[mode].primaryShort} Debit Notes`} headers={prDnHeaders} mapping={prDnMapping} onChange={setPrDnMapping} requireTaxable={false} />
                                </div>
                             </div>
                           )}

                           {twoBDnFile && (
                             <div className="dash-card">
                                <div className="dash-topbar"><span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{TERMS[mode].govtShort} Adjustments</span></div>
                                <div className="p-2">
                                   <ColumnMapper title={`${TERMS[mode].govtShort} Adjustments`} headers={twoBDnHeaders} mapping={twoBDnMapping} onChange={setTwoBDnMapping} requireTaxable={false} />
                                </div>
                             </div>
                           )}

                         </div>

                         {/* Stick actions */}
                         <div className="sticky bottom-6 z-40 bg-slate-900/80 backdrop-blur-md border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-2xl mt-10 animate-in fade-in slide-in-from-bottom-3 duration-300">
                           <div className="space-y-1">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Pipeline status</p>
                              <p className="text-xs font-bold text-emerald-400">All configurations loaded successfully</p>
                           </div>
                           {processing ? (
                             <div className="w-56 space-y-2">
                               <div className="flex justify-between text-[9px] font-bold text-blue-400 uppercase tracking-widest">
                                 <span className="animate-pulse">Computing metrics...</span>
                                 <span>{progressValue}%</span>
                               </div>
                               <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                                 <div className="h-full bg-blue-500 transition-all duration-300" style={{width: `${progressValue}%`}} />
                               </div>
                             </div>
                           ) : (
                             <button
                               onClick={handleReconcile}
                               disabled={!isMappingComplete(prMapping, mode === 'output') || !isMappingComplete(twoBMapping, mode === 'output') || journals.some((j) => !isMappingComplete(j.mapping, mode === 'output'))}
                               className="btn-np-primary h-11 px-8 text-xs uppercase tracking-widest gap-2 flex items-center disabled:opacity-30 disabled:cursor-not-allowed"
                             >
                               Execute Match Engine <Sparkles className="w-4 h-4" />
                             </button>
                           )}
                         </div>

                       </div>
                     )}

                     {step === 'review' && gstIssues && (
                       <div className="max-w-5xl mx-auto space-y-8 silk-reveal pt-4">
                         <GSTVerification
                           issues={gstIssues}
                           onApply={(partyName, gstin) => {
                             if (!results) return;
                             const newResults = [...results];
                             let updated = 0;
                             for (const r of newResults) {
                               if (r.prRecord && r.prRecord.supplierName === partyName) {
                                 r.prRecord.gstin = gstin;
                                 updated++;
                               }
                             }
                             setResults(newResults);
                             
                             const s = gstIssues.suggested.find((x) => x.supplierName === partyName);
                             if (s) {
                               const newApplied = [
                                 ...appliedGstins,
                                 {
                                   partyName: s.supplierName,
                                   originalGstin: s.originalGstin || 'Missing',
                                   appliedGstin: gstin,
                                   status: s.issueType || 'Corrected',
                                 }
                               ];
                               setAppliedGstins(newApplied);
                               safeSetItem('np_reco_applied_gstins', JSON.stringify(newApplied));
                             }

                             const newIssues = {
                               ...gstIssues,
                               suggested: gstIssues.suggested.filter((s) => s.supplierName !== partyName)
                             };
                             setGstIssues(newIssues);
                             safeSetItem('np_reco_issues', JSON.stringify(newIssues));
                             safeSetItem('np_reco_results', JSON.stringify(newResults));
                             toast.success(`Applied GSTIN to ${updated} record(s) for ${partyName}`);
                           }}
                           onApplyAll={() => {
                             if (!results) return;
                             const newResults = [...results];
                             let updated = 0;
                             for (const s of gstIssues.suggested) {
                               for (const r of newResults) {
                                 if (r.prRecord && r.prRecord.supplierName === s.supplierName) {
                                   r.prRecord.gstin = s.suggestedGstin || '';
                                   updated++;
                                 }
                               }
                             }
                             setResults(newResults);

                             const newApplied = [
                               ...appliedGstins,
                               ...gstIssues.suggested.map((s) => ({
                                 partyName: s.supplierName,
                                 originalGstin: s.originalGstin || 'Missing',
                                 appliedGstin: s.suggestedGstin || '',
                                 status: s.issueType || 'Corrected',
                               }))
                             ];
                             setAppliedGstins(newApplied);
                             safeSetItem('np_reco_applied_gstins', JSON.stringify(newApplied));

                             const newIssues = { ...gstIssues, suggested: [] };
                             setGstIssues(newIssues);
                             safeSetItem('np_reco_issues', JSON.stringify(newIssues));
                             safeSetItem('np_reco_results', JSON.stringify(newResults));
                             toast.success(`Successfully applied all ${gstIssues.suggested.length} suggested GSTINs to ${updated} records!`);
                           }}
                           onProceed={() => {
                             setStep('results');
                             safeSetItem('np_reco_step', 'results');
                           }}
                         />
                       </div>
                     )}

                     {step === 'results' && results && summary && (
                       <motion.div 
                         initial={{ opacity: 0, y: 30 }}
                         animate={{ opacity: 1, y: 0 }}
                         transition={{ duration: 0.6, type: 'spring', bounce: 0.2 }}
                         className="space-y-10 silk-reveal pt-4 max-w-6xl mx-auto w-full"
                       >
                         
                         <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 pb-6 border-b border-slate-800">
                           <div className="space-y-2">
                             <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase tracking-wider">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Audit Complete
                             </div>
                             <h2 className="text-3xl font-black tracking-tight text-white">{companyName || 'Reconciliation Summary'}</h2>
                             <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">MATCH REPORT GENERATED</p>
                           </div>
                           
                           <div className="flex items-center gap-3 w-full md:w-auto">
                             <button onClick={handleExportMonthly} className="btn-np-outline flex-1 md:flex-none flex items-center justify-center gap-2 !py-2.5 !px-4 text-[10px] font-bold uppercase tracking-wider hover:border-emerald-500 hover:text-emerald-400 transition-all">
                               <CloudDownload className="w-3.5 h-3.5" /> Monthly Export
                             </button>
                             <button onClick={handleExportParty} className="btn-np-outline flex-1 md:flex-none flex items-center justify-center gap-2 !py-2.5 !px-4 text-[10px] font-bold uppercase tracking-wider hover:border-blue-500 hover:text-blue-400 transition-all">
                               <CloudDownload className="w-3.5 h-3.5" /> Party Export
                             </button>
                           </div>
                         </div>

                         {/* Summary card grids */}
                         <SummaryCards summary={summary} />

                         {/* Detailed results tabs */}
                         <div className="dash-card shadow-2xl">
                           <div className="dash-topbar bg-slate-950/20">
                             <div className="dash-dots"><span style={{background:'#4A9EE8'}}></span><span style={{background:'#7EC8F0'}}></span></div>
                             <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Reconciliation Audit Ledger</span>
                             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                           </div>
                           <div className="p-1">
                             <ResultsCategoryTabs results={results} summary={summary} companyName={companyName} mode={mode} />
                           </div>
                         </div>

                         {/* Breakdown grids */}
                         <div className="grid lg:grid-cols-3 gap-6">
                           <div className="lg:col-span-2">
                             <PartyWiseReport results={results} companyName={companyName} mode={mode} />
                           </div>
                           <div>
                             <MonthlyBreakdown results={results} debitNotes={parsedDebitNotes} companyName={companyName} gstr3bData={gstr3bData} />
                           </div>
                         </div>

                         {/* Mini stats cards footer */}
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                           <div className="p-5 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-blue-500/20 transition-all">
                             <div className="flex items-center gap-4">
                               <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400"><ShieldCheck className="w-5 h-5" /></div>
                               <div>
                                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Perfect Matches</p>
                                 <p className="text-xl font-black text-white mt-1">{summary.perfectMatch}</p>
                               </div>
                             </div>
                           </div>
                           <div className="p-5 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-rose-500/20 transition-all">
                             <div className="flex items-center gap-4">
                               <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400"><Plus className="w-5 h-5 transform rotate-45" /></div>
                               <div>
                                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Value Mismatches</p>
                                 <p className="text-xl font-black text-white mt-1">{summary.valueMismatch}</p>
                               </div>
                             </div>
                           </div>
                           <div className="p-5 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-emerald-500/20 transition-all">
                             <div className="flex items-center gap-4">
                               <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400"><ArrowRight className="w-5 h-5" /></div>
                               <div>
                                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Accuracy Ratio</p>
                                 <p className="text-xl font-black text-white mt-1">{summary.total > 0 ? ((summary.perfectMatch / summary.total) * 100).toFixed(1) : '0.0'}%</p>
                               </div>
                             </div>
                           </div>
                         </div>
                       </motion.div>
                     )}

                   </div>
                 )}

              </div>
           )}

        </main>
        
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

      </div>

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
