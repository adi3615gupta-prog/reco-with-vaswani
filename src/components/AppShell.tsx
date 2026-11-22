import React, { useState, useEffect } from 'react';
import {
  Sparkles, Users, Database, FileSpreadsheet, CloudDownload,
  ShieldCheck, Landmark, FileCode2, RotateCcw, ShieldAlert,
  CalendarClock, ArrowRightLeft, Activity,
  Server, History, Cloud, BookOpen, LogOut,
  ChevronRight, ChevronDown, CheckCircle2,
  Layers, ArrowLeft, Settings, Pin, Bell, Calendar,
  Briefcase, Receipt, ArrowUpRight, Calculator, Table, Send,
  ClipboardCheck, Search, HelpCircle
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SettingsModal, SettingsTabKey } from '@/components/SettingsModal';
import { SouravChatbot } from '@/components/SouravChatbot';
import { HelpSupportWidget } from '@/components/HelpSupportWidget';
import { ACTION_NAV_TARGETS } from '@/lib/geminiApi';
import { getApiBase, safeApiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';

export type AppRoute =
  | 'hub'
  | 'reco'
  | 'tally'
  | 'tally-direct'
  | 'ledger-import'
  | 'consolidation'
  | 'dashboard'
  | 'returns'
  | 'tracker'
  | 'fin-statements'
  | 'gstin-scan'
  | 'tds-reco'
  | 'cma'
  | 'bank-cma'
  | 'depreciation'
  | 'audit'
  | 'monthly-audit'
  | 'income-tax'
  | 'clause44'
  | 'notices'
  | 'tally-xml'
  | 'voucher-reclass';

export type ReturnsTabKey = 'working3b' | 'matrix' | 'ims2b' | 'gstr2b_downloader' | 'gstr1_working' | 'gstr1_downloader' | 'returns_tracking';

interface AppShellProps {
  children: React.ReactNode;
  appRoute: AppRoute;
  setAppRoute: (route: AppRoute) => void;
  returnsTab?: ReturnsTabKey;
  setReturnsTab?: (tab: ReturnsTabKey) => void;
  companyName?: string;
  setCompanyName?: (name: string) => void;
  financialYear?: string;
  loginUser?: string;
  userName?: string;
  userDesignation?: string;
  userDepartment?: string;
  networkDiagnostics?: { status: string; latency: number };
  serverIpInfo?: { ip: string } | null;
  appMode?: string;
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
  onOpenHistory?: () => void;
  onOpenGDrive?: () => void;
  onOpenUserGuide?: () => void;
  onLogout?: () => void;
}

export interface ConsolidatedSuite {
  id: AppRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  activeBg: string;
  indicator: string;
  badge?: string;
  desc: string;
  routes: AppRoute[];
}

const CONSOLIDATED_SUITES: ConsolidatedSuite[] = [
  {
    id: 'reco',
    label: 'GST & TDS Reco',
    icon: Receipt,
    color: 'text-indigo-600 group-hover/item:text-indigo-700',
    activeBg: 'bg-indigo-50 text-indigo-900 border-indigo-200/80',
    indicator: 'bg-indigo-600',
    badge: 'Suite 01',
    desc: '2B vs Books reconciliation & 12M Consolidation',
    routes: ['reco', 'consolidation', 'gstin-scan', 'tds-reco']
  },
  {
    id: 'tally-direct',
    label: 'Tally Connectors',
    icon: Database,
    color: 'text-indigo-600 group-hover/item:text-indigo-700',
    activeBg: 'bg-indigo-50 text-indigo-900 border-indigo-200/80',
    indicator: 'bg-indigo-600',
    badge: 'Suite 02',
    desc: 'Direct Port 9000 & XML integration',
    routes: ['tally-direct', 'ledger-import', 'tally']
  },
  {
    id: 'returns',
    label: 'Returns & Filing',
    icon: Send,
    color: 'text-indigo-600 group-hover/item:text-indigo-700',
    activeBg: 'bg-indigo-50 text-indigo-900 border-indigo-200/80',
    indicator: 'bg-indigo-600',
    badge: 'Suite 03',
    desc: 'GSTR-3B Working, FY Matrix, IMS & Autopilot',
    routes: ['returns']
  },
  {
    id: 'audit',
    label: 'Statutory Audit',
    icon: ShieldCheck,
    color: 'text-indigo-600 group-hover/item:text-indigo-700',
    activeBg: 'bg-indigo-50 text-indigo-900 border-indigo-200/80',
    indicator: 'bg-indigo-600',
    badge: 'Suite 04',
    desc: 'Sampling, checklists, Clause 44 & depreciation',
    routes: ['audit', 'clause44', 'depreciation']
  },
  {
    id: 'income-tax',
    label: 'Income Tax',
    icon: Landmark,
    color: 'text-indigo-600 group-hover/item:text-indigo-700',
    activeBg: 'bg-indigo-50 text-indigo-900 border-indigo-200/80',
    indicator: 'bg-indigo-600',
    badge: 'Suite 05',
    desc: 'Old vs New regime computation sandbox',
    routes: ['income-tax']
  },
  {
    id: 'monthly-audit',
    label: 'Monthly Audit',
    icon: ClipboardCheck,
    color: 'text-indigo-600 group-hover/item:text-indigo-700',
    activeBg: 'bg-indigo-50 text-indigo-900 border-indigo-200/80',
    indicator: 'bg-indigo-600',
    badge: 'Suite 06',
    desc: 'Monthly working paper, maker-checker & client release',
    routes: ['monthly-audit']
  },
  {
    id: 'tally-xml',
    label: 'Tally Entries Maker',
    icon: Layers,
    color: 'text-indigo-600 group-hover/item:text-indigo-700',
    activeBg: 'bg-indigo-50 text-indigo-900 border-indigo-200/80',
    indicator: 'bg-indigo-600',
    badge: 'Suite 07',
    desc: 'Voucher ingestion, XML generator & Port 9000 bridge',
    routes: ['tally-xml']
  },
  {
    id: 'notices',
    label: 'GST Notices Hub',
    icon: ShieldAlert,
    color: 'text-indigo-600 group-hover/item:text-indigo-700',
    activeBg: 'bg-indigo-50 text-indigo-900 border-indigo-200/80',
    indicator: 'bg-indigo-600',
    badge: 'Shield',
    desc: 'Autonomous portal notices scanner & AI reply drafter',
    routes: ['notices']
  },
  {
    id: 'dashboard',
    label: 'Practice & WIP',
    icon: Briefcase,
    color: 'text-indigo-600 group-hover/item:text-indigo-700',
    activeBg: 'bg-indigo-50 text-indigo-900 border-indigo-200/80',
    indicator: 'bg-indigo-600',
    badge: 'Suite 08',
    desc: 'Practice control, WIP, Financials & Bank CMA Credit',
    routes: ['dashboard', 'tracker', 'fin-statements', 'cma', 'bank-cma', 'voucher-reclass']
  }
];

const RETURNS_SUBMODULES: { id: ReturnsTabKey; num: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'working3b', num: '01', label: 'GSTR-3B Working', icon: Calculator },
  { id: 'gstr1_working', num: '02', label: 'GSTR-1 Working', icon: ArrowUpRight },
  { id: 'ims2b', num: '03', label: 'Nexus IMS Hub', icon: Sparkles },
  { id: 'gstr2b_downloader', num: '04', label: 'Inward 2B Autopilot', icon: CloudDownload },
  { id: 'matrix', num: '05', label: '12M FY Matrix', icon: Table },
  { id: 'returns_tracking', num: '06', label: 'Returns Tracker', icon: CalendarClock },
  { id: 'gstr1_downloader', num: '07', label: 'GSTR-1 Autopilot', icon: CloudDownload }
];

export interface SuiteCategory {
  title: string;
  suites: ConsolidatedSuite[];
}

const SUITE_CATEGORIES: SuiteCategory[] = [
  {
    title: 'Core GST & Filing',
    suites: [
      CONSOLIDATED_SUITES[0], // Suite 01: Reco
      CONSOLIDATED_SUITES[2], // Suite 03: Returns & Filing
      CONSOLIDATED_SUITES[7], // Shield: GST Notices Hub
    ]
  },
  {
    title: 'Audit & Assurance',
    suites: [
      CONSOLIDATED_SUITES[3], // Suite 04: Statutory Audit
      CONSOLIDATED_SUITES[5], // Suite 06: Monthly Audit
    ]
  },
  {
    title: 'Tally & Data Bridges',
    suites: [
      CONSOLIDATED_SUITES[1], // Suite 02: Tally Connectors
      CONSOLIDATED_SUITES[6], // Suite 07: Tally Entries Maker
    ]
  },
  {
    title: 'Practice & Advisory',
    suites: [
      CONSOLIDATED_SUITES[4], // Suite 05: Income Tax
      CONSOLIDATED_SUITES[8], // Suite 08: Practice & WIP
    ]
  }
];

class SuiteErrorBoundary extends React.Component<
  { children: React.ReactNode; suiteName: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; suiteName: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[SuiteErrorBoundary] Error in suite ${this.props.suiteName}:`, error, errorInfo);
  }

  componentDidUpdate(prevProps: { suiteName: string }) {
    if (prevProps.suiteName !== this.props.suiteName && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-2xl mx-auto my-12 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{this.props.suiteName} View Interrupted</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">An unexpected error occurred in this module. The rest of the application remains active.</p>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-rose-600 dark:text-rose-400">
            {this.state.error?.message || 'Unknown view exception'}
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer shadow-xs"
            >
              Retry Module
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function SuiteLoadingFallback({ suiteName }: { suiteName: string }) {
  return (
    <div className="min-h-[480px] w-full flex flex-col items-center justify-center p-12 animate-in fade-in duration-200">
      <div className="flex flex-col items-center gap-3.5 max-w-sm w-full p-8 rounded-2xl bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-sm text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Loading {suiteName || 'Compliance Suite'}...
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Initializing module engine and compliance components...</p>
        </div>
      </div>
    </div>
  );
}

export function AppShell({
  children,
  appRoute,
  setAppRoute,
  returnsTab = 'working3b',
  setReturnsTab,
  companyName,
  setCompanyName,
  financialYear = '2026-27',
  loginUser = 'Admin',
  userName,
  userDesignation,
  userDepartment,
  networkDiagnostics = { status: 'Connected', latency: 4 },
  serverIpInfo,
  appMode,
  isAdmin = false,
  onOpenAdmin,
  onOpenHistory,
  onOpenGDrive,
  onOpenUserGuide,
  onLogout,
}: AppShellProps) {
  // Collapsible sidebar state with local storage persistence (defaults to true for desktop audit suite)
  const [isPinned, setIsPinned] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('np_sidebar_pinned');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [commandOpen, setCommandOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsActiveTab, setSettingsActiveTab] = useState<SettingsTabKey>('storage');

  // Listen to global open-settings events from any module
  useEffect(() => {
    const handleOpenSettings = (e: any) => {
      if (e.detail?.tab) {
        setSettingsActiveTab(e.detail.tab);
      }
      setIsSettingsOpen(true);
    };
    window.addEventListener('open-settings', handleOpenSettings);
    return () => window.removeEventListener('open-settings', handleOpenSettings);
  }, []);

  // Listen for global client-selected and internal app-navigate events
  useEffect(() => {
    const handleGlobalNav = (e: any) => {
      const { route, tabId, clientName, trade_name, legal_name } = e.detail || {};
      if (route) setAppRoute(route as any);
      if (tabId && setReturnsTab) {
        if (tabId === 'ims') setReturnsTab('ims2b');
        else if (tabId === 'gstr3b') setReturnsTab('working3b');
        else if (tabId === 'matrix') setReturnsTab('matrix');
        else if (tabId === 'gstr1') setReturnsTab('gstr1_working');
        else if (tabId === '2b' || tabId === 'gstr2b') setReturnsTab('gstr2b_downloader');
        else setReturnsTab(tabId as any);
      }
      const name = trade_name || legal_name || clientName;
      if (name && setCompanyName) {
        setCompanyName(name);
      }
    };

    const handleClientSelected = (e: any) => {
      const { trade_name, legal_name, clientName } = e.detail || {};
      const name = trade_name || legal_name || clientName;
      if (name && setCompanyName) {
        setCompanyName(name);
      }
    };

    window.addEventListener('app-navigate', handleGlobalNav);
    window.addEventListener('client-selected', handleClientSelected);
    return () => {
      window.removeEventListener('app-navigate', handleGlobalNav);
      window.removeEventListener('client-selected', handleClientSelected);
    };
  }, [setAppRoute, setReturnsTab, setCompanyName]);

  const togglePin = () => {
    setIsPinned(prev => {
      const next = !prev;
      try {
        localStorage.setItem('np_sidebar_pinned', String(next));
      } catch { }
      return next;
    });
  };

  // Keyboard shortcut Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen(open => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen for navigation commands from Universal Desktop Copilot ("Loco Pilot")
  useEffect(() => {
    const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null;
    if (electronAPI?.onAppNavigate) {
      const cleanup = electronAPI.onAppNavigate(async ({ target, gstin, fy, month }: { target: string; gstin?: string; fy?: string; month?: string }) => {
        const targetMeta: { label?: string; tabId?: string; route?: string; isControl?: boolean } =
          ACTION_NAV_TARGETS[target] || { route: target };
        let matchedClientName: string | undefined;

        if (gstin) {
          try {
            const res = await safeApiFetch('/api/clients');
            if (res.ok) {
              const clients = await res.json();
              const matched = clients.find((c: any) => c.gstin?.toUpperCase() === gstin.toUpperCase());
              if (matched && (matched.trade_name || matched.legal_name)) {
                matchedClientName = matched.trade_name || matched.legal_name;
                if (setCompanyName) {
                  setCompanyName(matchedClientName);
                }
              }
            }
          } catch (e) {
            console.warn('[AppShell] Failed to lookup client by GSTIN:', e);
          }
        }

        if (targetMeta.route) setAppRoute(targetMeta.route as any);
        if (targetMeta.tabId && setReturnsTab) {
          if (targetMeta.tabId === 'ims') setReturnsTab('ims2b');
          else if (targetMeta.tabId === 'gstr3b') setReturnsTab('working3b');
          else if (targetMeta.tabId === 'matrix') setReturnsTab('matrix');
          else if (targetMeta.tabId === 'gstr1') setReturnsTab('gstr1_working');
          else if (targetMeta.tabId === '2b' || targetMeta.tabId === 'gstr2b') setReturnsTab('gstr2b_downloader');
          else setReturnsTab(targetMeta.tabId as any);
        }

        // Forward to mounted modules via global events
        window.dispatchEvent(
          new CustomEvent('app-navigate', {
            detail: {
              route: targetMeta.route,
              tabId: targetMeta.tabId,
              target,
              gstin,
              clientName: matchedClientName,
              fy,
              month,
            },
          })
        );

        if (gstin || fy || month) {
          window.dispatchEvent(
            new CustomEvent('gstr3b-select-client', {
              detail: {
                gstin,
                clientName: matchedClientName,
                tab: targetMeta.tabId === 'gstr3b' ? 'working3b' : targetMeta.tabId,
                target,
                fy,
                month,
              },
            })
          );
        }

        // Forward direct software control actions (Excel/PDF Export, Edit Mode, Locks)
        if (targetMeta.isControl || ['export_excel', 'export_pdf', 'toggle_edit', 'lock_sheet', 'view_allocations', 'reversal'].includes(target)) {
          window.dispatchEvent(
            new CustomEvent('software-action', {
              detail: {
                action: target,
                target,
                gstin,
                clientName: matchedClientName,
                fy,
                month,
              },
            })
          );
        }
      });
      return cleanup;
    }
  }, [setCompanyName, setAppRoute, setReturnsTab]);

  const getInitials = (name?: string) => {
    if (!name) return 'CV';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getBreadcrumbs = () => {
    const currentSuite = CONSOLIDATED_SUITES.find(s => s.routes.includes(appRoute));
    const suiteLabel = currentSuite?.label || (appRoute === 'hub' ? 'Command Hub' : 'Enterprise Suite');
    let categoryName = 'General';
    for (const cat of SUITE_CATEGORIES) {
      if (cat.suites.some(s => s.routes.includes(appRoute))) {
        categoryName = cat.title;
        break;
      }
    }
    let subLabel = '';
    if (appRoute === 'returns') {
      const sub = RETURNS_SUBMODULES.find(s => s.id === returnsTab);
      if (sub) subLabel = sub.label;
    } else if (appRoute === 'reco') {
      subLabel = '2B vs Books Reco';
    } else if (appRoute === 'tds-reco') {
      subLabel = 'TDS Reco';
    } else if (appRoute === 'bank-cma') {
      subLabel = 'Bank CMA Credit';
    } else if (appRoute === 'clause44') {
      subLabel = 'Tax Audit Clause 44';
    } else if (appRoute === 'fin-statements') {
      subLabel = 'Financial Statements';
    }
    return { categoryName, suiteLabel, subLabel };
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--np-bg)] text-[var(--np-text)] font-sans transition-colors duration-200">
      {/* 1. SMART CONSOLIDATED COLLAPSIBLE INTERACTIVE SIDEBAR RAIL (1:1 STITCH BLUEPRINT) */}
      <aside
        id="smartSidebar"
        className={cn(
          "sidebar-rail fixed left-0 top-0 h-full z-50 flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200/90 dark:border-slate-800 pt-4 pb-2 group shadow-sm transition-all duration-300 overflow-hidden",
          isPinned ? "!w-[17rem] shadow-xl" : ""
        )}
      >
        {/* Brand Header */}
        <div className="px-3.5 mb-2 flex items-center justify-between min-h-12 flex-shrink-0">
          <div
            onClick={() => setAppRoute('hub')}
            className="flex items-center gap-3 overflow-hidden cursor-pointer"
            title="Finpulse Consulting (Click to return to Central Hub)"
          >
            <div className="w-10 h-10 shrink-0 flex items-center justify-center p-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-2xs">
              <img
                src="./logo.png"
                alt="Finpulse Consulting Official Logo"
                className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className={cn("expanded-content", isPinned && "!opacity-100 !max-w-[220px] !translate-x-0")}>
              <div className="font-bold text-slate-900 dark:text-white text-sm tracking-tight flex items-center gap-1.5 leading-none">
                Finpulse Consulting
                <span className="text-[9px] font-mono uppercase bg-slate-900 dark:bg-slate-800 text-white px-1.5 py-0.5 rounded font-semibold tracking-wider">v4.8</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium tracking-wide mt-1">Enterprise Audit Suite</p>
            </div>
          </div>

          <button
            type="button"
            onClick={togglePin}
            className={cn(
              "expanded-content p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all flex items-center justify-center",
              isPinned ? "!opacity-100 !max-w-[220px] text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-400" : ""
            )}
            title={isPinned ? "Unpin Sidebar (Auto-collapse rail)" : "Pin Sidebar (Keep expanded)"}
          >
            <Pin className={cn("w-4 h-4 transition-transform", isPinned && "rotate-45 fill-indigo-600 text-indigo-600 dark:fill-indigo-400 dark:text-indigo-400")} />
          </button>
        </div>

        {/* Consolidated Primary Suites Navigation Rail - Categorized */}
        <nav className="flex-1 px-3 space-y-2 overflow-y-auto overflow-x-hidden scrollbar-none mt-2">
          {SUITE_CATEGORIES.map(category => (
            <div key={category.title} className="space-y-1">
              <div className={cn(
                "expanded-content px-3 pt-2 pb-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500",
                isPinned && "!opacity-100 !max-w-[220px] !translate-x-0"
              )}>
                {category.title}
              </div>
              {category.suites.map(suite => {
                const Icon = suite.icon;
                const isSuiteActive = suite.routes.includes(appRoute);

                return (
                  <div key={suite.id} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setAppRoute(suite.id)}
                      className={cn(
                        "w-full flex items-center gap-3.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all group/item relative border cursor-pointer",
                        isSuiteActive
                          ? "bg-indigo-50/90 text-indigo-900 border-indigo-200/80 shadow-xs dark:bg-indigo-950/70 dark:text-indigo-200 dark:border-indigo-800/80"
                          : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60"
                      )}
                      title={suite.desc}
                    >
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                        <Icon className={cn("w-5 h-5 transition-transform group-hover/item:scale-110", isSuiteActive ? "text-indigo-600 dark:text-indigo-400" : suite.color)} />
                      </div>
                      <span className={cn(
                        "expanded-content text-xs font-semibold text-slate-700 dark:text-slate-300 group-hover/item:text-slate-900 dark:group-hover/item:text-white truncate flex-1 text-left",
                        isPinned && "!opacity-100 !max-w-[220px] !translate-x-0"
                      )}>
                        {suite.label}
                      </span>
                      {suite.badge && (
                        <span className={cn(
                          "expanded-content text-[9px] px-1.5 py-0.2 rounded-full font-mono uppercase tracking-wider font-bold shrink-0",
                          isPinned && "!opacity-100 !max-w-[220px] !translate-x-0",
                          isSuiteActive ? 'bg-indigo-600 text-white dark:bg-indigo-500' : 'bg-indigo-50 text-indigo-700 border border-indigo-200/80 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800/60'
                        )}>
                          {suite.badge}
                        </span>
                      )}
                      {isSuiteActive && (
                        <span className={cn(
                          "expanded-content w-1.5 h-1.5 rounded-full shrink-0 bg-indigo-600 dark:bg-indigo-400",
                          isPinned && "!opacity-100 !max-w-[220px] !translate-x-0"
                        )}></span>
                      )}
                    </button>

                    {/* If Returns & Filing is active, show the standalone submodules */}
                    {suite.id === 'returns' && isSuiteActive && (
                      <div className={cn(
                        "max-h-0 opacity-0 overflow-hidden group-hover:max-h-96 group-hover:opacity-100 transition-all duration-300",
                        isPinned && "!max-h-96 !opacity-100",
                        "pl-8 pr-1 space-y-1"
                      )}>
                        {RETURNS_SUBMODULES.map(sub => {
                          const SubIcon = sub.icon;
                          const isSubActive = returnsTab === sub.id;
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (setReturnsTab) setReturnsTab(sub.id);
                              }}
                              className={cn(
                                "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] transition-all text-left truncate cursor-pointer",
                                isSubActive
                                  ? "bg-indigo-100/90 text-indigo-900 font-bold shadow-2xs dark:bg-indigo-950/80 dark:text-indigo-200"
                                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60"
                              )}
                            >
                              <SubIcon className={cn("w-3 h-3 shrink-0", isSubActive ? "text-indigo-700 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500")} />
                              <span className="truncate">{sub.num}. {sub.label}</span>
                              {isSubActive && <span className="w-1 h-1 rounded-full bg-indigo-600 dark:bg-indigo-400 ml-auto shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          <div className="pt-2">
            <div className="border-t border-slate-100 dark:border-slate-800 mx-1" />
          </div>

          {/* Central Hub Quick Link */}
          <button
            type="button"
            onClick={() => setAppRoute('hub')}
            className={cn(
              "w-full flex items-center gap-3.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100/80 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60 transition-all",
              appRoute === 'hub' ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold" : ""
            )}
            title="Return to Central Compliance Workspace"
          >
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-purple-500" />
            </div>
            <span className={cn(
              "whitespace-nowrap transition-opacity duration-200 truncate flex-1 text-left",
              isPinned ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"
            )}>
              Central Command Hub
            </span>
          </button>
        </nav>

        {/* Sidebar Footer / Diagnostics & Settings */}
        <div className="p-2.5 sm:p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 flex flex-col gap-2 flex-shrink-0 mt-auto">
          {/* User Profile Info */}
          <div className="flex items-center gap-3 min-w-[200px] px-1 py-0.5" title={`${userName || loginUser} (${userDesignation || 'User'}${userDepartment ? ` • ${userDepartment}` : ''})`}>
            <div className="w-8 h-8 rounded-full bg-slate-900 dark:bg-indigo-950 text-white dark:text-indigo-200 border border-transparent dark:border-indigo-800/80 flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-xs">
              {getInitials(userName || companyName || loginUser)}
            </div>
            <div className={cn("expanded-content overflow-hidden leading-tight", isPinned && "!opacity-100 !max-w-[220px] !translate-x-0")}>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{userName || loginUser || 'CA Vaswani'}</div>
              <div className="text-[10px] text-indigo-700 dark:text-indigo-400 font-semibold truncate">
                {userDesignation ? `${userDesignation}` : 'Staff Member'}
                {userDepartment ? ` • ${userDepartment}` : ''}
              </div>
            </div>
          </div>

          {/* Engine Sync Status */}
          <div className={cn("expanded-content pt-1 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-200/60 dark:border-slate-800", isPinned && "!opacity-100 !max-w-[220px] !translate-x-0")}>
            <span className="font-mono text-[10px]">Engine v4.8</span>
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Online</span>
            </span>
          </div>

          {/* Settings Trigger — Anchored at the very bottom */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-2.5 rounded-xl p-2 font-bold text-xs transition-all group border bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:shadow-xs cursor-pointer"
            title="System Settings (Data Path & Tally Bridge)"
          >
            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:rotate-45 transition-transform flex-shrink-0">
              <Settings className="w-3.5 h-3.5" />
            </div>
            <div className={cn("expanded-content flex flex-col text-left truncate", isPinned && "!opacity-100 !max-w-[220px] !translate-x-0")}>
              <span className="truncate leading-tight text-slate-900 dark:text-slate-100 font-bold">System Settings</span>
              <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono">Data Path &amp; Tally</span>
            </div>
            <span className={cn("expanded-content w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-auto shrink-0", isPinned && "!opacity-100 !max-w-[220px] !translate-x-0")}></span>
          </button>
        </div>
      </aside>

      {/* 2. MAIN APPLICATION WORKSPACE AREA */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 overflow-hidden relative transition-all duration-300",
        isPinned ? "pl-[17rem]" : "pl-[4.75rem]"
      )}>
        {/* UNIVERSAL AUDIT TOP HEADER */}
        <header className="h-12 border-b border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-40 transition-colors">
          {/* Left: Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
            <span
              onClick={() => setAppRoute('hub')}
              className="hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
            >
              Finpulse
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
            <span className="text-slate-600 dark:text-slate-300">{breadcrumbs.categoryName}</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
            <span className="font-semibold text-slate-900 dark:text-slate-100">{breadcrumbs.suiteLabel}</span>
            {breadcrumbs.subLabel && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
                <span className="font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded text-[11px]">
                  {breadcrumbs.subLabel}
                </span>
              </>
            )}
          </div>


          {/* Right: Quick actions, ThemeToggle, Search Pill, Health */}
          <div className="flex items-center gap-2.5">
            {/* Ctrl+K Search Pill */}
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 text-xs transition-colors cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">Quick search...</span>
              <kbd className="text-[9px] font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 text-slate-400">Ctrl K</kbd>
            </button>

            {/* Engine health */}
            <div className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-[10px] text-emerald-700 dark:text-emerald-300 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Engine v4.8</span>
            </div>

            {/* Help & Support Header Shortcut */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-help-support'))}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs transition-colors cursor-pointer"
              title="Help & Support Hub"
            >
              <HelpCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden xl:inline text-[11px] font-medium">Help</span>
            </button>

            {/* Sourav AI Header Shortcut */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-sourav-ai'))}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-300/60 dark:border-amber-700/60 text-amber-900 dark:text-amber-200 text-xs font-bold transition-all cursor-pointer shadow-2xs"
              title="Open Sourav AI Assistant"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline text-[11px]">Sourav AI</span>
            </button>

            {/* Dark / Light Theme Toggle */}
            <ThemeToggle />
          </div>
        </header>

        {/* Dynamic Module Content View */}
        <main className={cn(
          "flex-1 overflow-y-auto relative bg-[var(--np-bg)] text-[var(--np-text)] transition-colors",
          appRoute === 'returns' ? "p-0" : "px-3 py-1.5 sm:px-6 sm:py-2"
        )}>
          <div className={cn(
            "w-full",
            appRoute === 'returns' ? "" : "max-w-[1720px] mx-auto"
          )}>
            <SuiteErrorBoundary suiteName={breadcrumbs.suiteLabel}>
              <React.Suspense fallback={<SuiteLoadingFallback suiteName={breadcrumbs.suiteLabel} />}>
                {children}
              </React.Suspense>
            </SuiteErrorBoundary>
          </div>
        </main>
      </div>

      {/* 3. GLOBAL COMMAND PALETTE MODAL (Ctrl+K) */}
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Type a module name or action (e.g. Reco, 2B, Tally)..." />
        <CommandList className="max-h-[380px] overflow-y-auto">
          <CommandEmpty>No compliance module found.</CommandEmpty>
          <CommandGroup heading="Compliance Suites">
            {CONSOLIDATED_SUITES.map(suite => {
              const Icon = suite.icon;
              return (
                <CommandItem
                  key={suite.id}
                  onSelect={() => {
                    setAppRoute(suite.id);
                    setCommandOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                >
                  <Icon className={cn("w-4 h-4", suite.color)} />
                  <span className="font-semibold">{suite.label}</span>
                  <span className="text-xs text-slate-400 ml-auto">{suite.desc}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* 4. SETTINGS MODAL */}
      <SettingsModal
        isOpen={isSettingsOpen}
        initialTab={settingsActiveTab}
        onClose={() => setIsSettingsOpen(false)}
        onLogout={onLogout}
        loginUser={userName || loginUser}
      />

      {/* 5. UNIVERSAL TROUBLESHOOTING & SUPPORT HUB (Bottom Left) */}
      <HelpSupportWidget isPinned={isPinned} activeModule={appRoute} />

      {/* 6. UNIVERSAL AI ASSISTANT CHATBOT */}
      <SouravChatbot
        userName={userName || loginUser}
        loginUser={loginUser}
        clientName={companyName}
        financialYear={financialYear}
        activeModule={appRoute}
        onOpenSettings={(tab) => {
          if (tab) setSettingsActiveTab(tab as any);
          setIsSettingsOpen(true);
        }}
        onNavigate={(route, tabId, clientInfo) => {
          if (clientInfo?.clientName && setCompanyName) {
            setCompanyName(clientInfo.clientName);
          }
          if (route) setAppRoute(route as any);
          if (tabId && setReturnsTab) {
            if (tabId === 'ims') setReturnsTab('ims2b');
            else if (tabId === 'gstr3b') setReturnsTab('working3b');
            else if (tabId === 'matrix') setReturnsTab('matrix');
            else if (tabId === 'gstr1') setReturnsTab('gstr1_working');
            else if (tabId === '2b' || tabId === 'gstr2b') setReturnsTab('gstr2b_downloader');
            else setReturnsTab(tabId as any);
          }
        }}
      />
    </div>
  );
}
