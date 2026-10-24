import React, { useState, useEffect } from 'react';
import {
  Sparkles, Users, Database, FileSpreadsheet, CloudDownload,
  ShieldCheck, Landmark, FileCode2, RotateCcw, ShieldAlert,
  CalendarClock, ArrowRightLeft, Search, Activity,
  Server, History, Cloud, BookOpen, LogOut,
  ChevronRight, ChevronDown, CheckCircle2,
  Layers, ArrowLeft, Settings, Pin, Bell, Calendar
} from 'lucide-react';
import { SettingsModal } from '@/components/SettingsModal';
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
  | 'voucher-reclass';

interface AppShellProps {
  children: React.ReactNode;
  appRoute: AppRoute;
  setAppRoute: (route: AppRoute) => void;
  companyName?: string;
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

interface NavItem {
  id: AppRoute;
  label: string;
  suite: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  desc: string;
}

const NAV_ITEMS: NavItem[] = [
  // Overview
  { id: 'hub', label: 'Command Hub', suite: 'Overview', icon: Sparkles, desc: 'Central workspace & compliance launcher' },
  { id: 'dashboard', label: 'Client Dashboard', suite: 'Overview', icon: Users, desc: 'Client portfolio and filings overview' },

  // Practice & WIP
  { id: 'tracker', label: 'GSTR-2B Tracker', suite: 'Practice & WIP', icon: Activity, desc: 'Multi-month ITC availability & filing tracker' },
  { id: 'fin-statements', label: 'Financial Statements', suite: 'Practice & WIP', icon: FileSpreadsheet, desc: 'Automated Balance Sheet & P&L generation' },
  { id: 'cma', label: 'CMA Project Report', suite: 'Practice & WIP', icon: Landmark, desc: 'Term loan feasibility, CapEx & debt amortization' },
  { id: 'voucher-reclass', label: 'Voucher Reclassifier', suite: 'Practice & WIP', icon: ArrowRightLeft, desc: 'Batch classify and adjust ledger allocations' },

  // GST Inward & Reco
  { id: 'reco', label: 'GST Reco Engine', suite: 'GST Inward & Reco', icon: Layers, badge: 'Core', desc: '6-pass 2B vs Books reconciliation with debit note solver' },
  { id: 'consolidation', label: '12M Consolidation', suite: 'GST Inward & Reco', icon: FileSpreadsheet, desc: 'Full-year multi-file books consolidator' },
  { id: 'gstin-scan', label: 'GSTIN Scanner', suite: 'GST Inward & Reco', icon: Search, desc: 'Multi-party GSTIN validation & status scanner' },

  // Returns & Filing
  { id: 'returns', label: 'Returns Mission Control', suite: 'Returns & Filing', icon: CloudDownload, badge: 'Auto', desc: 'GSTR-2B 12M Autopilot, GSTR-1, IMS & 3B Matrix' },

  // Tally Connectors
  { id: 'tally-direct', label: 'Tally Direct (Port 9000)', suite: 'Tally Connectors', icon: Database, badge: 'Live', desc: 'Zero-export direct XML sync from Tally Prime' },
  { id: 'ledger-import', label: 'Tally Ledger Import', suite: 'Tally Connectors', icon: FileCode2, desc: 'Direct trial balance and ledger mapping' },
  { id: 'tally', label: 'XML Converter', suite: 'Tally Connectors', icon: RotateCcw, desc: 'Convert offline Tally XML exports' },

  // Statutory Audit
  { id: 'audit', label: 'Statutory Audit', suite: 'Statutory Audit', icon: ShieldCheck, desc: 'Audit sampling, checklists & substantive testing' },
  { id: 'clause44', label: 'Tax Audit Clause 44', suite: 'Statutory Audit', icon: ShieldAlert, desc: 'GST expenditure breakdown for Form 3CD' },
  { id: 'depreciation', label: 'Depreciation Engine', suite: 'Statutory Audit', icon: CalendarClock, desc: 'Companies Act Schedule II vs IT Act WDV depreciation' },

  // Income Tax Suite
  { id: 'income-tax', label: 'Income Tax Sandbox', suite: 'Income Tax Suite', icon: Landmark, badge: 'New', desc: 'Old vs New regime computation & tax liability' },
  { id: 'tds-reco', label: 'TDS Reco & TRACES', suite: 'Income Tax Suite', icon: ShieldCheck, desc: 'Form 26AS & TRACES vs Books TDS reconciliation' },
  { id: 'bank-cma', label: 'Bank CMA Appraisal', suite: 'Income Tax Suite', icon: Landmark, desc: 'Tandon Committee MPBF, ratios & CMA projection' },
];

export function AppShell({
  children,
  appRoute,
  setAppRoute,
  companyName,
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
  // Collapsible sidebar state with local storage persistence
  const [isPinned, setIsPinned] = useState<boolean>(() => {
    try {
      return localStorage.getItem('np_sidebar_pinned') === 'true';
    } catch {
      return false;
    }
  });

  const [commandOpen, setCommandOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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

  const currentItem = NAV_ITEMS.find(item => item.id === appRoute) || NAV_ITEMS[0];
  const suites = Array.from(new Set(NAV_ITEMS.map(i => i.suite)));

  const getSuiteAccent = (suite: string) => {
    switch (suite) {
      case 'Practice & WIP':
        return {
          iconColor: 'text-amber-500 group-hover/item:text-amber-600',
          activeBg: 'bg-amber-50 text-amber-800 border-amber-200/70',
          indicator: 'bg-amber-500'
        };
      case 'GST Inward & Reco':
        return {
          iconColor: 'text-emerald-600 group-hover/item:text-emerald-700',
          activeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200/70',
          indicator: 'bg-emerald-500'
        };
      case 'Tally Connectors':
        return {
          iconColor: 'text-pink-600 group-hover/item:text-pink-700',
          activeBg: 'bg-pink-50 text-pink-800 border-pink-200/70',
          indicator: 'bg-pink-500'
        };
      case 'Returns & Filing':
        return {
          iconColor: 'text-blue-600 group-hover/item:text-blue-700',
          activeBg: 'bg-blue-50 text-blue-800 border-blue-200/70',
          indicator: 'bg-blue-600'
        };
      case 'Statutory Audit':
        return {
          iconColor: 'text-indigo-600 group-hover/item:text-indigo-700',
          activeBg: 'bg-indigo-50 text-indigo-800 border-indigo-200/70',
          indicator: 'bg-indigo-600'
        };
      case 'Income Tax Suite':
        return {
          iconColor: 'text-slate-800 group-hover/item:text-slate-900',
          activeBg: 'bg-slate-100 text-slate-900 border-slate-300',
          indicator: 'bg-slate-800'
        };
      default:
        return {
          iconColor: 'text-slate-600 group-hover/item:text-slate-900',
          activeBg: 'bg-slate-100 text-slate-900 border-slate-200',
          indicator: 'bg-slate-900'
        };
    }
  };

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
      {/* 1. SMART COLLAPSIBLE INTERACTIVE SIDEBAR */}
      <aside
        id="smartSidebar"
        className={cn(
          "fixed left-0 top-0 h-full z-50 flex flex-col bg-white/95 backdrop-blur-xl border-r border-slate-200/80 shadow-[2px_0_20px_rgba(0,0,0,0.03)] transition-all duration-300 ease-in-out overflow-hidden",
          isPinned ? "w-64" : "w-16 hover:w-64 group/sidebar"
        )}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-3.5 border-b border-slate-100 flex-shrink-0 relative overflow-hidden">
          <div
            onClick={() => setAppRoute('hub')}
            className="flex items-center gap-3 overflow-hidden cursor-pointer"
            title="Vaswani Return Enterprise"
          >
            <div className="w-9 h-9 flex items-center justify-center flex-shrink-0 rounded-lg p-0.5 bg-slate-50 border border-slate-100">
              <img
                src="./logo.png"
                alt="Vaswani Logo"
                className="h-7 w-auto object-contain transition-transform duration-300 group-hover/sidebar:scale-105"
              />
            </div>
            <div className={cn("transition-opacity duration-200 whitespace-nowrap overflow-hidden", isPinned ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100")}>
              <h1 className="text-sm font-bold tracking-tight text-slate-900 leading-tight">Vaswani Return</h1>
              <p className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">Enterprise Audit v4.8</p>
            </div>
          </div>

          <button
            type="button"
            onClick={togglePin}
            className={cn(
              "p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all flex items-center justify-center",
              isPinned ? "text-blue-600 bg-blue-50 opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"
            )}
            title={isPinned ? "Unpin Sidebar (Auto-collapse rail)" : "Pin Sidebar (Keep expanded)"}
          >
            <Pin className={cn("w-4 h-4 transition-transform", isPinned && "rotate-45 fill-blue-600 text-blue-600")} />
          </button>
        </div>

        {/* Navigation Rail Items */}
        <nav className="flex-1 px-2.5 py-3 space-y-3 overflow-y-auto overflow-x-hidden scrollbar-none">
          {suites.map(suite => {
            const items = NAV_ITEMS.filter(item => item.suite === suite);
            const accent = getSuiteAccent(suite);

            return (
              <div key={suite} className="space-y-1">
                <div className={cn(
                  "px-2.5 py-1 text-[9px] font-mono tracking-widest text-slate-400 uppercase font-bold transition-opacity duration-200 truncate",
                  isPinned ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"
                )}>
                  {suite}
                </div>

                {items.map(item => {
                  const Icon = item.icon;
                  const isActive = appRoute === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => setAppRoute(item.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-xs font-medium transition-all group/item relative",
                        isActive
                          ? cn(accent.activeBg, "shadow-xs font-semibold")
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                      )}
                      title={item.label}
                    >
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                        <Icon className={cn("w-4 h-4 transition-transform group-hover/item:scale-110", isActive ? accent.iconColor : "text-slate-500")} />
                      </div>
                      <span className={cn(
                        "whitespace-nowrap transition-opacity duration-200 truncate flex-1 text-left",
                        isPinned ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"
                      )}>
                        {item.label}
                      </span>
                      {item.badge && (
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.2 rounded-full font-mono uppercase tracking-wider font-bold shrink-0 transition-opacity duration-200",
                          isPinned ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100",
                          item.badge === 'Live' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          item.badge === 'Core' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          'bg-amber-50 text-amber-700 border border-amber-200'
                        )}>
                          {item.badge}
                        </span>
                      )}
                      {isActive && (
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0 transition-opacity duration-200",
                          accent.indicator,
                          isPinned ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"
                        )}></span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer / Status & Profile Preview */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex flex-col gap-2 flex-shrink-0">
          {/* Bottom-Left Settings Tab Trigger */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-2.5 rounded-xl p-2 font-bold text-xs transition-all group border bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-blue-400 hover:shadow-xs"
            title="System Settings (Data Path & Tally Bridge)"
          >
            <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 group-hover:rotate-45 transition-transform flex-shrink-0">
              <Settings className="w-3.5 h-3.5" />
            </div>
            <div className={cn("flex flex-col text-left truncate transition-opacity duration-200", isPinned ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100")}>
              <span className="truncate leading-tight text-slate-900 font-bold">System Settings</span>
              <span className="text-[9px] text-slate-500 font-mono">Data Path &amp; Tally</span>
            </div>
            <span className={cn("w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-auto shrink-0 transition-opacity duration-200", isPinned ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100")}></span>
          </button>

          {/* User Profile Info */}
          <div className="flex items-center gap-3 min-w-[200px] pt-1">
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-xs">
              {getInitials(companyName || loginUser)}
            </div>
            <div className={cn("transition-opacity duration-200 overflow-hidden leading-tight", isPinned ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100")}>
              <div className="text-xs font-semibold text-slate-800 truncate">{loginUser || 'CA Vaswani'}</div>
              <div className="text-[10px] text-slate-400">Sr. Tax Partner</div>
            </div>
          </div>

          {/* Engine Sync Status */}
          <div className={cn("pt-1 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-200/60 transition-opacity duration-200", isPinned ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100")}>
            <span className="font-mono text-[10px]">Engine v4.8</span>
            <span className="flex items-center gap-1 text-emerald-600 font-medium text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Sync OK</span>
            </span>
          </div>
        </div>
      </aside>

      {/* 2. MAIN APPLICATION WORKSPACE AREA */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 overflow-hidden relative transition-all duration-300",
        isPinned ? "pl-64" : "pl-16"
      )}>
        {/* Standardized Top Header */}
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
                  {companyName || 'Reliance Digital Logistics'}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  27AABCV96041Z25
                </div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                {getInitials(companyName || 'Reliance Digital Logistics')}
              </div>
            </div>

            {/* Optional Utilities: Backups, Guide, Admin, Logout */}
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

        {/* Dynamic Module Content View */}
        <main className="flex-1 overflow-y-auto relative px-4 py-2 sm:px-6 sm:py-3 bg-[#F8FAFC]">
          <div className="max-w-[1720px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>

      {/* 3. GLOBAL COMMAND PALETTE MODAL (Ctrl+K) */}
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Type a module name or action (e.g. Reco, 2B, Tally)..." />
        <CommandList className="max-h-[380px] overflow-y-auto">
          <CommandEmpty>No compliance module found.</CommandEmpty>
          {suites.map(suite => (
            <CommandGroup key={suite} heading={suite}>
              {NAV_ITEMS.filter(i => i.suite === suite).map(item => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.id}
                    onSelect={() => {
                      setAppRoute(item.id);
                      setCommandOpen(false);
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer rounded-lg aria-selected:bg-blue-600/20 aria-selected:text-white"
                  >
                    <Icon className="w-4 h-4 text-blue-400 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-xs text-white">{item.label}</span>
                      <span className="text-[10px] text-slate-400 truncate">{item.desc}</span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
export default AppShell;