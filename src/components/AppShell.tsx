import React, { useState, useEffect } from 'react';
import {
  Sparkles, Users, Database, FileSpreadsheet, CloudDownload,
  ShieldCheck, Landmark, FileCode2, RotateCcw, ShieldAlert,
  CalendarClock, ArrowRightLeft, Search, Activity,
  Server, History, Cloud, BookOpen, LogOut,
  ChevronRight, ChevronDown, CheckCircle2,
  Layers, ArrowLeft, Settings, Pin, Bell, Calendar,
  Briefcase, Receipt, ArrowUpRight, Calculator, Table, Send
} from 'lucide-react';
import { SettingsModal, SettingsTabKey } from '@/components/SettingsModal';
import { SouravChatbot } from '@/components/SouravChatbot';
import { ACTION_NAV_TARGETS } from '@/lib/geminiApi';
import { getApiBase } from '@/lib/api';
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
  | 'income-tax'
  | 'clause44'
  | 'notices'
  | 'voucher-reclass';

export type ReturnsTabKey = 'working3b' | 'matrix' | 'ims2b' | 'gstr2b_downloader' | 'gstr1_downloader' | 'returns_tracking';

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
    id: 'dashboard',
    label: 'Practice & WIP',
    icon: Briefcase,
    color: 'text-amber-500 group-hover/item:text-amber-600',
    activeBg: 'bg-amber-50 text-amber-800 border-amber-200/80',
    indicator: 'bg-amber-500',
    desc: 'Practice control, clients & WIP tracking',
    routes: ['dashboard', 'tracker', 'fin-statements', 'cma', 'voucher-reclass']
  },
  {
    id: 'reco',
    label: 'GST & TDS Reco',
    icon: Receipt,
    color: 'text-emerald-600 group-hover/item:text-emerald-700',
    activeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    indicator: 'bg-emerald-500',
    badge: 'Core',
    desc: '2B vs Books reconciliation & 12M Consolidation',
    routes: ['reco', 'consolidation', 'gstin-scan', 'tds-reco']
  },
  {
    id: 'tally-direct',
    label: 'Tally Connectors',
    icon: Database,
    color: 'text-pink-600 group-hover/item:text-pink-700',
    activeBg: 'bg-pink-50 text-pink-800 border-pink-200/80',
    indicator: 'bg-pink-500',
    badge: 'Live',
    desc: 'Direct Port 9000 & XML integration',
    routes: ['tally-direct', 'ledger-import', 'tally']
  },
  {
    id: 'returns',
    label: 'Returns & Filing',
    icon: Send,
    color: 'text-blue-600 group-hover/item:text-blue-700',
    activeBg: 'bg-blue-50 text-blue-800 border-blue-200/80',
    indicator: 'bg-blue-600',
    badge: 'Auto',
    desc: 'GSTR-3B Working, FY Matrix, IMS & Autopilot',
    routes: ['returns']
  },
  {
    id: 'audit',
    label: 'Statutory Audit',
    icon: ShieldCheck,
    color: 'text-indigo-600 group-hover/item:text-indigo-700',
    activeBg: 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
    indicator: 'bg-indigo-600',
    desc: 'Sampling, checklists, Clause 44 & depreciation',
    routes: ['audit', 'clause44', 'depreciation']
  },
  {
    id: 'income-tax',
    label: 'Income Tax',
    icon: Landmark,
    color: 'text-slate-800 group-hover/item:text-slate-900',
    activeBg: 'bg-slate-100 text-slate-900 border-slate-300',
    indicator: 'bg-slate-800',
    badge: 'New',
    desc: 'Old vs New regime computation sandbox',
    routes: ['income-tax']
  },
  {
    id: 'bank-cma',
    label: 'CMA Bank Credit',
    icon: Activity,
    color: 'text-cyan-600 group-hover/item:text-cyan-700',
    activeBg: 'bg-cyan-50 text-cyan-800 border-cyan-200/80',
    indicator: 'bg-cyan-600',
    desc: 'Bank appraisal, MPBF II & CMA projection',
    routes: ['bank-cma']
  },
  {
    id: 'notices',
    label: 'GST Notices Hub',
    icon: ShieldAlert,
    color: 'text-amber-600 group-hover/item:text-amber-700',
    activeBg: 'bg-amber-50 text-amber-800 border-amber-200/80',
    indicator: 'bg-amber-600',
    badge: 'Phase 12',
    desc: 'Autonomous portal notices scanner & AI reply drafter',
    routes: ['notices']
  }
];

const RETURNS_SUBMODULES: { id: ReturnsTabKey; num: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'working3b', num: '01', label: 'GSTR-3B Working', icon: Calculator },
  { id: 'matrix', num: '02', label: '12M FY Matrix', icon: Table },
  { id: 'ims2b', num: '03', label: 'Nexus IMS Hub', icon: Sparkles },
  { id: 'gstr2b_downloader', num: '04', label: 'Inward 2B Autopilot', icon: CloudDownload },
  { id: 'gstr1_downloader', num: '05', label: 'Outward GSTR-1', icon: ArrowUpRight },
  { id: 'returns_tracking', num: '06', label: 'Returns Tracker', icon: CalendarClock }
];

export function AppShell({
  children,
  appRoute,
  setAppRoute,
  returnsTab = 'working3b',
  setReturnsTab,
  companyName,
  setCompanyName,
  financialYear = '2024-25',
  loginUser = 'Admin',
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

  const togglePin = () => {
    setIsPinned(prev => {
      const next = !prev;
      try {
        localStorage.setItem('np_sidebar_pinned', String(next));
      } catch {}
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
        const targetMeta = ACTION_NAV_TARGETS[target] || { route: target };
        let matchedClientName: string | undefined;

        if (gstin) {
          try {
            const res = await fetch(`${getApiBase()}/api/clients`);
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
          else if (targetMeta.tabId === 'gstr1') setReturnsTab('gstr1_downloader');
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F8FAFC] text-slate-800 font-sans">
      {/* 1. SMART CONSOLIDATED COLLAPSIBLE INTERACTIVE SIDEBAR RAIL (1:1 STITCH BLUEPRINT) */}
      <aside
        id="smartSidebar"
        className={cn(
          "sidebar-rail fixed left-0 top-0 h-full z-50 flex flex-col bg-white border-r border-slate-200/90 pt-4 pb-2 group shadow-sm transition-all duration-300 overflow-hidden",
          isPinned ? "!w-[17rem] shadow-xl" : ""
        )}
      >
        {/* Brand Header */}
        <div className="px-3.5 mb-2 flex items-center justify-between min-h-12 flex-shrink-0">
          <div
            onClick={() => setAppRoute('hub')}
            className="flex items-center gap-3 overflow-hidden cursor-pointer"
            title="Vaswani Return Enterprise (Click to return to Central Hub)"
          >
            <div className="w-10 h-10 shrink-0 flex items-center justify-center p-0.5 rounded-lg bg-emerald-50/60 border border-emerald-100 shadow-2xs">
              <img
                src="/favicon.png"
                alt="Vaswani Return Official Logo"
                className="h-8 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                onError={(e: any) => { e.target.src = "./logo.png"; }}
              />
            </div>
            <div className={cn("expanded-content", isPinned && "!opacity-100 !max-w-[220px] !translate-x-0")}>
              <div className="font-bold text-slate-900 text-sm tracking-tight flex items-center gap-1.5 leading-none">
                Vaswani Return
                <span className="text-[9px] font-mono uppercase bg-slate-900 text-white px-1.5 py-0.5 rounded font-semibold tracking-wider">v4.8</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium tracking-wide mt-1">Enterprise Audit Suite</p>
            </div>
          </div>

          <button
            type="button"
            onClick={togglePin}
            className={cn(
              "expanded-content p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all flex items-center justify-center",
              isPinned ? "!opacity-100 !max-w-[220px] text-blue-600 bg-blue-50" : ""
            )}
            title={isPinned ? "Unpin Sidebar (Auto-collapse rail)" : "Pin Sidebar (Keep expanded)"}
          >
            <Pin className={cn("w-4 h-4 transition-transform", isPinned && "rotate-45 fill-blue-600 text-blue-600")} />
          </button>
        </div>

        {/* Consolidated Primary Suites Navigation Rail */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto overflow-x-hidden scrollbar-none mt-4">
          {CONSOLIDATED_SUITES.map(suite => {
            const Icon = suite.icon;
            const isSuiteActive = suite.routes.includes(appRoute);

            return (
              <div key={suite.id} className="space-y-1">
                <button
                  type="button"
                  onClick={() => setAppRoute(suite.id)}
                  className={cn(
                    "w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group/item relative border cursor-pointer",
                    isSuiteActive
                      ? "bg-blue-50/80 text-blue-700 border-blue-100/70 shadow-xs"
                      : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                  )}
                  title={suite.desc}
                >
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    <Icon className={cn("w-5 h-5 transition-transform group-hover/item:scale-110", isSuiteActive ? "text-blue-600" : suite.color)} />
                  </div>
                  <span className={cn(
                    "expanded-content text-xs font-semibold text-slate-700 group-hover/item:text-slate-900 truncate flex-1 text-left",
                    isPinned && "!opacity-100 !max-w-[220px] !translate-x-0"
                  )}>
                    {suite.label}
                  </span>
                  {suite.badge && (
                    <span className={cn(
                      "expanded-content text-[9px] px-1.5 py-0.2 rounded-full font-mono uppercase tracking-wider font-bold shrink-0",
                      isPinned && "!opacity-100 !max-w-[220px] !translate-x-0",
                      suite.badge === 'Live' ? 'bg-pink-50 text-pink-700 border border-pink-200' :
                      suite.badge === 'Core' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      'bg-blue-50 text-blue-700 border border-blue-200'
                    )}>
                      {suite.badge}
                    </span>
                  )}
                  {isSuiteActive && (
                    <span className={cn(
                      "expanded-content w-1.5 h-1.5 rounded-full shrink-0 bg-blue-600",
                      isPinned && "!opacity-100 !max-w-[220px] !translate-x-0"
                    )}></span>
                  )}
                </button>

                {/* If Returns & Filing is active, show the 5 standalone submodules */}
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
                              ? "bg-blue-100/80 text-blue-900 font-bold"
                              : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                          )}
                        >
                          <SubIcon className={cn("w-3 h-3 shrink-0", isSubActive ? "text-blue-700" : "text-slate-400")} />
                          <span className="truncate">{sub.num}. {sub.label}</span>
                          {isSubActive && <span className="w-1 h-1 rounded-full bg-blue-600 ml-auto shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div className="pt-2">
            <div className="border-t border-slate-100 mx-1" />
          </div>

          {/* Central Hub Quick Link */}
          <button
            type="button"
            onClick={() => setAppRoute('hub')}
            className={cn(
              "w-full flex items-center gap-3.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100/80 transition-all",
              appRoute === 'hub' ? "bg-slate-100 text-slate-900 font-bold" : ""
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
        <div className="p-2.5 sm:p-3 border-t border-slate-100 bg-slate-50/50 flex flex-col gap-2 flex-shrink-0 mt-auto">
          {/* User Profile Info */}
          <div className="flex items-center gap-3 min-w-[200px] px-1 py-0.5" title={loginUser || 'CA Vaswani'}>
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-xs">
              {getInitials(companyName || loginUser)}
            </div>
            <div className={cn("expanded-content overflow-hidden leading-tight", isPinned && "!opacity-100 !max-w-[220px] !translate-x-0")}>
              <div className="text-xs font-semibold text-slate-800 truncate">{loginUser || 'CA Vaswani'}</div>
              <div className="text-[10px] text-slate-400">Sr. Tax Partner</div>
            </div>
          </div>

          {/* Engine Sync Status */}
          <div className={cn("expanded-content pt-1 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-200/60", isPinned && "!opacity-100 !max-w-[220px] !translate-x-0")}>
            <span className="font-mono text-[10px]">Engine v4.8</span>
            <span className="flex items-center gap-1 text-emerald-600 font-medium text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Online</span>
            </span>
          </div>

          {/* Settings Trigger — Anchored at the very bottom */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-2.5 rounded-xl p-2 font-bold text-xs transition-all group border bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-blue-400 hover:shadow-xs cursor-pointer"
            title="System Settings (Data Path & Tally Bridge)"
          >
            <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 group-hover:rotate-45 transition-transform flex-shrink-0">
              <Settings className="w-3.5 h-3.5" />
            </div>
            <div className={cn("expanded-content flex flex-col text-left truncate", isPinned && "!opacity-100 !max-w-[220px] !translate-x-0")}>
              <span className="truncate leading-tight text-slate-900 font-bold">System Settings</span>
              <span className="text-[9px] text-slate-500 font-mono">Data Path &amp; Tally</span>
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
        {/* Standardized Top Header (Hidden on Returns to allow Elevated Floating Navbar) */}
        {appRoute !== 'returns' && (
          <header className="sticky top-0 z-40 bg-[#F8FAFC]/85 backdrop-blur-md border-b border-slate-200/60 px-6 py-2.5 flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {/* Omni-search Bar */}
              <div
                onClick={() => setCommandOpen(true)}
                className="relative flex items-center cursor-pointer group"
              >
                <Search className="absolute left-3 text-slate-400 group-hover:text-slate-600 w-4 h-4 transition-colors" />
                <input
                  type="text"
                  readOnly
                  placeholder="Omni-search clients, GSTIN, vouchers..."
                  className="w-56 sm:w-72 md:w-80 pl-9 pr-14 py-1.5 rounded-full bg-white text-xs font-medium text-slate-700 placeholder:text-slate-400 border border-slate-200 focus:outline-none group-hover:border-blue-400 transition-all shadow-xs cursor-pointer"
                />
                <kbd className="absolute right-2.5 text-[10px] text-slate-400 bg-slate-100 font-mono px-1.5 py-0.5 rounded border border-slate-200 shadow-xs">
                  ⌘K
                </kbd>
              </div>

              {/* Live Bridge Status Pill */}
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/60 text-[11px] font-medium text-emerald-700 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Tally Port 9000 Connected</span>
              </div>
            </div>

            {/* Right Header Controls */}
            <div className="flex items-center gap-2.5">
              {/* FY Badge Pill */}
              <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200/80 rounded-full text-xs font-medium text-slate-700 shadow-xs cursor-pointer hover:bg-slate-50 transition-colors">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono font-semibold">FY {financialYear || '2024-25'}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </div>

              {/* Notifications Bell */}
              <button
                type="button"
                className="relative w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-50 transition-colors shadow-xs"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
              </button>

              {/* Client Quick Switcher */}
              <div className="hidden md:flex items-center gap-2 pl-2 border-l border-slate-200">
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-900 truncate max-w-[160px]">
                    {companyName || 'DYP INFRAPROJECTS'}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    27AAGCD4105L1ZO
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                  {getInitials(companyName || 'DYP INFRAPROJECTS')}
                </div>
              </div>

              {/* Optional Utilities */}
              <div className="flex items-center gap-1 pl-1">
                {onOpenHistory && (
                  <button
                    type="button"
                    onClick={onOpenHistory}
                    className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                    title="History & Backups"
                  >
                    <History className="w-4 h-4" />
                  </button>
                )}

                {onOpenUserGuide && (
                  <button
                    type="button"
                    onClick={onOpenUserGuide}
                    className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                    title="User Guide"
                  >
                    <BookOpen className="w-4 h-4" />
                  </button>
                )}

                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors ml-1"
                    title="Logout"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </header>
        )}

        {/* Dynamic Module Content View */}
        <main className={cn(
          "flex-1 overflow-y-auto relative bg-[#F8FAFC]",
          appRoute === 'returns' ? "p-0" : "px-4 py-2 sm:px-6 sm:py-3"
        )}>
          <div className={cn(
            "w-full",
            appRoute === 'returns' ? "" : "max-w-[1720px] mx-auto"
          )}>
            {children}
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
      />

      {/* 5. SOURAV UNIVERSAL AI ASSISTANT CHATBOT */}
      <SouravChatbot
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
            else if (tabId === 'gstr1') setReturnsTab('gstr1_downloader');
            else if (tabId === '2b' || tabId === 'gstr2b') setReturnsTab('gstr2b_downloader');
            else setReturnsTab(tabId as any);
          }
        }}
      />
    </div>
  );
}
