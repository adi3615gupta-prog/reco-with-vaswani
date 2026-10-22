import React, { useState, useEffect } from 'react';
import {
  Sparkles, Users, Database, FileSpreadsheet, CloudDownload,
  ShieldCheck, Landmark, FileCode2, RotateCcw, ShieldAlert,
  CalendarClock, ArrowRightLeft, Search, ImageIcon, Activity,
  Server, History, Cloud, BookOpen, LogOut, PanelLeftClose,
  PanelLeftOpen, ChevronRight, CheckCircle2, Command as CommandIcon,
  Layers, ArrowLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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

  // GST Inward & Reco
  { id: 'reco', label: 'GST Reco Engine', suite: 'GST Inward & Reco', icon: Layers, badge: 'Core', desc: '6-pass 2B vs Books reconciliation with debit note solver' },
  { id: 'tracker', label: 'GSTR-2B Tracker', suite: 'GST Inward & Reco', icon: Activity, desc: 'Multi-month ITC availability & filing tracker' },
  { id: 'consolidation', label: '12M Consolidation', suite: 'GST Inward & Reco', icon: FileSpreadsheet, desc: 'Full-year multi-file books consolidator' },

  // Returns & Autopilot
  { id: 'returns', label: 'Returns Mission Control', suite: 'Returns & Autopilot', icon: CloudDownload, badge: 'Auto', desc: 'GSTR-2B 12M Autopilot, GSTR-1, IMS & 3B Matrix' },

  // Tally Prime & Data
  { id: 'tally-direct', label: 'Tally Direct (Port 9000)', suite: 'Tally Prime & Data', icon: Database, badge: 'Live', desc: 'Zero-export direct XML sync from Tally Prime' },
  { id: 'ledger-import', label: 'Tally Ledger Import', suite: 'Tally Prime & Data', icon: FileCode2, desc: 'Direct trial balance and ledger mapping' },
  { id: 'tally', label: 'XML Converter', suite: 'Tally Prime & Data', icon: RotateCcw, desc: 'Convert offline Tally XML exports' },

  // TDS, Tax & Statements
  { id: 'tds-reco', label: 'TDS Reco & TRACES', suite: 'TDS, Tax & Statements', icon: ShieldCheck, desc: 'Form 26AS & TRACES vs Books TDS reconciliation' },
  { id: 'income-tax', label: 'Income Tax Sandbox', suite: 'TDS, Tax & Statements', icon: Landmark, badge: 'New', desc: 'Old vs New regime computation & tax liability' },
  { id: 'fin-statements', label: 'Financial Statements', suite: 'TDS, Tax & Statements', icon: FileSpreadsheet, desc: 'Automated Balance Sheet & P&L generation' },

  // Audit & CMA Suite
  { id: 'bank-cma', label: 'Bank CMA Appraisal', suite: 'Audit & CMA Suite', icon: Landmark, desc: 'Tandon Committee MPBF, ratios & CMA projection' },
  { id: 'clause44', label: 'Tax Audit Clause 44', suite: 'Audit & CMA Suite', icon: ShieldAlert, desc: 'GST expenditure breakdown for Form 3CD' },
  { id: 'audit', label: 'Statutory Audit', suite: 'Audit & CMA Suite', icon: ShieldCheck, desc: 'Audit sampling, checklists & substantive testing' },
  { id: 'depreciation', label: 'Depreciation Engine', suite: 'Audit & CMA Suite', icon: CalendarClock, desc: 'Companies Act Schedule II vs IT Act WDV depreciation' },
  { id: 'voucher-reclass', label: 'Voucher Reclassifier', suite: 'Audit & CMA Suite', icon: ArrowRightLeft, desc: 'Batch classify and adjust ledger allocations' },
  { id: 'gstin-scan', label: 'GSTIN Scanner', suite: 'Audit & CMA Suite', icon: Search, desc: 'Multi-party GSTIN validation & status scanner' },
];

export function AppShell({
  children,
  appRoute,
  setAppRoute,
  companyName,
  financialYear = '2025-26',
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
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('np_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [commandOpen, setCommandOpen] = useState(false);

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('np_sidebar_collapsed', String(next));
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

  // Group nav items by suite
  const suites = Array.from(new Set(NAV_ITEMS.map(i => i.suite)));

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#090D16] text-[#E4EEF8]">
      {/* 1. PERSISTENT COLLAPSIBLE SIDEBAR */}
      <aside
        className={cn(
          'flex flex-col border-r border-[#1E293B] bg-[#0c1220]/90 backdrop-blur-2xl transition-all duration-300 z-30 select-none shrink-0',
          isCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Sidebar Brand Header */}
        <div className="flex h-16 items-center justify-between px-3.5 border-b border-[#1E293B]">
          <div
            onClick={() => setAppRoute('hub')}
            className={cn(
              'flex items-center gap-2.5 cursor-pointer overflow-hidden transition-all group',
              isCollapsed && 'justify-center w-full'
            )}
            title="AUDIT WITH VASWANI"
          >
            <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 group-hover:border-blue-500 group-hover:shadow-[0_0_12px_rgba(74,158,232,0.3)] transition-all">
              <img src="./logo.png" alt="Logo" className="w-5 h-5 object-contain" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-black tracking-tight text-white truncate flex items-center gap-1.5">
                  VASWANI <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-400 font-bold">PRO</span>
                </span>
                <span className="text-[8px] text-slate-400 font-mono tracking-widest uppercase">Compliance v1.4</span>
              </div>
            )}
          </div>

          {!isCollapsed && (
            <button
              onClick={toggleSidebar}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-lg transition-colors"
              title="Collapse Sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Sidebar Collapse Toggle Button (When Collapsed) */}
        {isCollapsed && (
          <div className="flex justify-center py-2 border-b border-[#1E293B]">
            <button
              onClick={toggleSidebar}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-lg transition-colors"
              title="Expand Sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Quick Search Shortcut Pill */}
        <div className="p-2.5 border-b border-[#1E293B]/60">
          <button
            onClick={() => setCommandOpen(true)}
            className={cn(
              'w-full flex items-center gap-2 rounded-xl bg-slate-900/80 border border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-blue-500/40 transition-all text-xs font-medium',
              isCollapsed ? 'justify-center p-2' : 'px-3 py-1.5'
            )}
            title="Search Modules (Ctrl+K)"
          >
            <Search className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            {!isCollapsed && (
              <span className="flex-1 text-left text-[11px] truncate text-slate-400">Search (Ctrl+K)</span>
            )}
            {!isCollapsed && (
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] font-mono text-slate-400 border border-slate-700/60">
                ⌘K
              </kbd>
            )}
          </button>
        </div>

        {/* Navigation Suites List */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 scrollbar-thin scrollbar-thumb-slate-800">
          {suites.map(suite => {
            const items = NAV_ITEMS.filter(item => item.suite === suite);
            return (
              <div key={suite} className="space-y-1">
                {!isCollapsed && (
                  <div className="px-2.5 py-1 text-[9px] font-mono tracking-widest text-slate-400 uppercase font-bold">
                    {suite}
                  </div>
                )}
                {items.map(item => {
                  const Icon = item.icon;
                  const isActive = appRoute === item.id;

                  const buttonContent = (
                    <button
                      key={item.id}
                      onClick={() => setAppRoute(item.id)}
                      className={cn(
                        'w-full flex items-center gap-2.5 rounded-xl text-xs font-medium transition-all group relative',
                        isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 text-left',
                        isActive
                          ? 'bg-blue-600/15 text-blue-400 font-semibold border border-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.15)]'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                      )}
                    >
                      <Icon className={cn('w-4 h-4 shrink-0 transition-transform group-hover:scale-110', isActive ? 'text-blue-400' : 'text-slate-400')} />
                      {!isCollapsed && (
                        <span className="flex-1 truncate">{item.label}</span>
                      )}
                      {!isCollapsed && item.badge && (
                        <span className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded-full font-mono uppercase tracking-wider font-bold',
                          item.badge === 'Live' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                          item.badge === 'Core' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' :
                          'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        )}>
                          {item.badge}
                        </span>
                      )}
                      {isActive && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-blue-500"></span>
                      )}
                    </button>
                  );

                  if (isCollapsed) {
                    return (
                      <Tooltip key={item.id} delayDuration={100}>
                        <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
                        <TooltipContent side="right" className="bg-slate-900 border-slate-700 text-xs">
                          <p className="font-bold text-white">{item.label}</p>
                          <p className="text-[10px] text-slate-400">{item.desc}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return buttonContent;
                })}
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer HUD */}
        <div className="p-3 border-t border-[#1E293B] bg-slate-950/40 space-y-2">
          {!isCollapsed ? (
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>SQLite Active</span>
              </span>
              <span className="text-slate-400 font-bold uppercase">{loginUser}</span>
            </div>
          ) : (
            <div className="flex justify-center" title="Local SQLite DB Active">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </div>
          )}
        </div>
      </aside>

      {/* 2. MAIN APPLICATION WORKSPACE AREA */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Command Bar */}
        <header className="h-16 border-b border-[#1E293B] bg-[#0c1220]/80 backdrop-blur-xl flex items-center justify-between px-6 z-20 shrink-0">
          {/* Breadcrumb & Navigation History */}
          <div className="flex items-center gap-3 min-w-0">
            {appRoute !== 'hub' && (
              <button
                onClick={() => setAppRoute('hub')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 border border-slate-800 transition-colors flex items-center gap-1 text-xs"
                title="Back to Command Hub"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Hub</span>
              </button>
            )}

            <div className="flex items-center gap-1.5 text-xs text-slate-400 truncate">
              <span className="text-slate-400 font-medium">{currentItem.suite}</span>
              <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
              <span className="text-white font-bold truncate flex items-center gap-1.5">
                {currentItem.label}
              </span>
            </div>

            {/* Active Client / FY Pill */}
            {companyName && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 font-medium truncate max-w-xs">
                <span className="font-bold text-white truncate">{companyName}</span>
                <span className="text-[10px] font-mono text-blue-400 font-bold px-1.5 py-0.2 rounded bg-blue-500/20">
                  FY {financialYear}
                </span>
              </div>
            )}
          </div>

          {/* Top Actions & System Health HUD */}
          <div className="flex items-center gap-3">
            {/* Live System Diagnostics */}
            <div className="hidden xl:flex items-center gap-3 px-3.5 py-1.5 rounded-full bg-slate-950/60 border border-slate-800/80 text-[10px] font-mono tracking-wide text-slate-400">
              <span className="flex items-center gap-1.5">
                <Server className="w-3 h-3 text-slate-500" /> Host:
                <span className="text-slate-300">
                  {appMode === 'server' && serverIpInfo ? serverIpInfo.ip : '127.0.0.1'}
                </span>
              </span>
              <span className="w-px h-3 bg-slate-800"></span>
              <span className="flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-slate-500" /> Ping:
                <span className={cn('font-bold', networkDiagnostics.status === 'Connected' ? 'text-emerald-400' : 'text-rose-400')}>
                  {networkDiagnostics.status === 'Connected' ? `${networkDiagnostics.latency}ms` : 'Offline'}
                </span>
              </span>
            </div>

            {/* History & Backups Button */}
            {onOpenHistory && (
              <button
                onClick={onOpenHistory}
                className="px-3 py-1.5 bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 border border-purple-500/20 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
                title="Local PC & Cloud History Backups"
              >
                <History className="w-3.5 h-3.5" /> <span className="hidden md:inline">Backups</span>
              </button>
            )}

            {/* Google Drive Button */}
            {onOpenGDrive && (
              <button
                onClick={onOpenGDrive}
                className="px-3 py-1.5 bg-sky-600/10 hover:bg-sky-600/20 text-sky-400 border border-sky-500/20 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
                title="Google Drive Cloud Storage"
              >
                <Cloud className="w-3.5 h-3.5" /> <span className="hidden md:inline">Drive</span>
              </button>
            )}

            {/* User Guide Button */}
            {onOpenUserGuide && (
              <button
                onClick={onOpenUserGuide}
                className="px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
                title="Open Help & User Guide"
              >
                <BookOpen className="w-3.5 h-3.5" /> <span className="hidden md:inline">Guide</span>
              </button>
            )}

            {/* Admin Panel Button */}
            {isAdmin && onOpenAdmin && (
              <button
                onClick={onOpenAdmin}
                className="px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all"
              >
                Admin
              </button>
            )}

            <ThemeToggle />

            {/* Logout Button */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-2 text-slate-400 hover:text-rose-400 bg-slate-900/50 hover:bg-rose-500/10 border border-slate-800 rounded-xl transition-colors"
                title="Secure Session Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Module Content View */}
        <main className="flex-1 overflow-y-auto relative p-6">
          <div className="max-w-[1700px] mx-auto w-full">
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
    </div>
  );
}
export default AppShell;
