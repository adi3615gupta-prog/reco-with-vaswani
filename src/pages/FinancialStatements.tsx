import { useState, useEffect, useMemo } from 'react';
import {
  Building2, BookOpen, Upload, Landmark, BarChart3, FileDown,
  ArrowRight, Search, ChevronDown, ChevronRight, Save, RotateCcw,
  AlertTriangle, CheckCircle2, Shield, Hash, FileText, Layers,
  Eye, Filter, X, Info, Briefcase, User, BadgeCheck, ScrollText
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  ClientSetup,
  MasterGroupCode,
  BalanceCheck,
} from '@/lib/finStatements.types';
import {
  getMasterGroupCodes,
  getClientSetup,
  saveClientSetup,
  getTrialBalance,
  computeBalanceCheck,
  countUnmappedEntries,
  aggregateNotes,
} from '@/lib/finStatements.storage';
import TBImportMapping from '@/components/finstatements/TBImportMapping';
import FixedAssetsRegister from '@/components/finstatements/FixedAssetsRegister';
import FinancialReports from '@/components/finstatements/FinancialReports';
import ExportPanel from '@/components/finstatements/ExportPanel';

// ===================================================================
// TYPES
// ===================================================================
type SidebarSection =
  | 'setup'
  | 'master'
  | 'tb-import'
  | 'assets'
  | 'reports'
  | 'export';

interface Props {
  onBack: () => void;
}

// ===================================================================
// SIDEBAR NAV ITEMS
// ===================================================================
const SIDEBAR_ITEMS: { key: SidebarSection; label: string; icon: React.ElementType; tag?: string }[] = [
  { key: 'setup',     label: 'Client Setup',      icon: Building2 },
  { key: 'master',    label: 'Master Data',        icon: BookOpen },
  { key: 'tb-import', label: 'TB Import & Mapping', icon: Upload },
  { key: 'assets',    label: 'Asset Block',         icon: Landmark },
  { key: 'reports',   label: 'Reports',             icon: BarChart3 },
  { key: 'export',    label: 'Export',              icon: FileDown },
];

// ===================================================================
// MAIN COMPONENT
// ===================================================================
export default function FinancialStatements({ onBack }: Props) {
  const [activeSection, setActiveSection] = useState<SidebarSection>('setup');
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [masterCodes, setMasterCodes] = useState<MasterGroupCode[]>([]);
  const [balanceCheck, setBalanceCheck] = useState<BalanceCheck>({
    total_assets: 0,
    total_equity_liabilities: 0,
    difference: 0,
    is_balanced: true,
  });
  const [unmappedCount, setUnmappedCount] = useState(0);
  const [tbCount, setTbCount] = useState(0);

  // Load data on mount
  useEffect(() => {
    setMasterCodes(getMasterGroupCodes());
    refreshDashboard();
  }, []);

  const refreshDashboard = () => {
    setBalanceCheck(computeBalanceCheck());
    setUnmappedCount(countUnmappedEntries());
    setTbCount(getTrialBalance().length);
  };

  return (
    <div className="w-full silk-reveal">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="text-slate-400 hover:text-white flex items-center gap-2 font-bold uppercase tracking-wider text-[10px] mb-4 transition-colors"
      >
        <ArrowRight className="w-3 h-3 transform rotate-180" /> Back to Hub
      </button>

      {/* Module Title */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <ScrollText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            Financial Statements
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold tracking-widest uppercase">
              Schedule III
            </span>
          </h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
            Companies Act, 2013 Compliant
          </p>
        </div>
      </div>

      {/* ── CONTROL DASHBOARD BANNER ── */}
      <ControlBanner
        balanceCheck={balanceCheck}
        unmappedCount={unmappedCount}
        tbCount={tbCount}
      />

      {/* ── MAIN LAYOUT: SIDEBAR + CONTENT ── */}
      <div className="flex gap-6 mt-6" style={{ minHeight: 'calc(100vh - 320px)' }}>
        {/* Sidebar */}
        <aside className={`shrink-0 rounded-2xl bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 overflow-hidden transition-all duration-300 flex flex-col ${
          isSidebarExpanded ? 'w-56' : 'w-16'
        }`}>
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            {isSidebarExpanded && (
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap">Navigation</p>
            )}
            <button 
              onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
              className="p-1 -m-1 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors mx-auto"
              title={isSidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
            >
              <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${isSidebarExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <nav className="p-2 space-y-0.5">
            {SIDEBAR_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveSection(item.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 group ${
                    isActive
                      ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_12px_rgba(6,182,212,0.1)]'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03] border border-transparent'
                  } ${!isSidebarExpanded ? 'justify-center' : ''}`}
                  title={!isSidebarExpanded ? item.label : undefined}
                >
                  <Icon className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} />
                  {isSidebarExpanded && (
                    <>
                      <span className="flex-1 text-left text-[10px] whitespace-nowrap overflow-hidden text-ellipsis">{item.label}</span>
                      {item.tag && (
                        <span className="text-[7px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 font-mono shrink-0">
                          {item.tag}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Sidebar Footer Stats */}
          {isSidebarExpanded && (
            <div className="p-4 mt-auto border-t border-white/5 whitespace-nowrap overflow-hidden">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-slate-500 uppercase tracking-wider font-bold">Master Codes</span>
                  <span className="text-cyan-400 font-mono font-bold">{masterCodes.length}</span>
                </div>
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-slate-500 uppercase tracking-wider font-bold">TB Ledgers</span>
                  <span className="text-slate-400 font-mono font-bold">{tbCount}</span>
                </div>
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-slate-500 uppercase tracking-wider font-bold">Unmapped</span>
                  <span className={`font-mono font-bold ${unmappedCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {unmappedCount}
                  </span>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {activeSection === 'setup' && (
            <ClientSetupForm onSaved={refreshDashboard} />
          )}
          {activeSection === 'master' && (
            <MasterDataViewer masterCodes={masterCodes} />
          )}
          {activeSection === 'tb-import' && <TBImportMapping onDataChanged={refreshDashboard} />}
          {activeSection === 'assets' && <FixedAssetsRegister onDataChanged={refreshDashboard} />}
          {activeSection === 'reports' && <FinancialReports />}
          {activeSection === 'export' && <ExportPanel />}
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// CONTROL DASHBOARD BANNER
// ===================================================================
function ControlBanner({
  balanceCheck,
  unmappedCount,
  tbCount,
}: {
  balanceCheck: BalanceCheck;
  unmappedCount: number;
  tbCount: number;
}) {
  const hasData = tbCount > 0;

  return (
    <div
      className={`rounded-2xl border p-4 backdrop-blur-xl transition-all duration-500 ${
        !hasData
          ? 'bg-slate-900/40 border-slate-800/60'
          : balanceCheck.is_balanced
          ? 'bg-emerald-950/30 border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.08)]'
          : 'bg-red-950/30 border-red-500/25 shadow-[0_0_30px_rgba(239,68,68,0.1)]'
      }`}
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Status Icon + Label */}
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              !hasData
                ? 'bg-slate-800 text-slate-500'
                : balanceCheck.is_balanced
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-red-500/15 text-red-400 animate-pulse'
            }`}
          >
            {!hasData ? (
              <Shield className="w-5 h-5" />
            ) : balanceCheck.is_balanced ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Control Dashboard
            </p>
            {!hasData ? (
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                No Trial Balance imported yet. Import data to see balance status.
              </p>
            ) : balanceCheck.is_balanced ? (
              <p className="text-xs text-emerald-400 font-bold mt-0.5">
                ✓ TRIAL BALANCE IS BALANCED
              </p>
            ) : (
              <p className="text-xs text-red-400 font-bold mt-0.5">
                ⚠ TRIAL BALANCE OUT OF BALANCE — Difference: ₹
                {Math.abs(balanceCheck.difference).toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                })}
              </p>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex items-center gap-5">
          <div className="text-center">
            <p className="text-lg font-black text-white font-mono">
              ₹{balanceCheck.total_assets.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
            </p>
            <p className="text-[8px] text-slate-500 uppercase tracking-widest font-bold">
              Total Assets
            </p>
          </div>
          <div className="w-px h-8 bg-slate-700/50" />
          <div className="text-center">
            <p className="text-lg font-black text-white font-mono">
              ₹{balanceCheck.total_equity_liabilities.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
            </p>
            <p className="text-[8px] text-slate-500 uppercase tracking-widest font-bold">
              Equity + Liabilities
            </p>
          </div>
          {hasData && (
            <>
              <div className="w-px h-8 bg-slate-700/50" />
              <div className="text-center">
                <p className={`text-lg font-black font-mono ${unmappedCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {unmappedCount}
                </p>
                <p className="text-[8px] text-slate-500 uppercase tracking-widest font-bold">
                  Unmapped
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// CLIENT SETUP FORM
// ===================================================================
function ClientSetupForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState<ClientSetup>(getClientSetup());
  const [saved, setSaved] = useState(false);

  const updateField = (field: keyof ClientSetup, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    if (!form.company_name.trim()) {
      toast.error('Company Name is required.');
      return;
    }
    saveClientSetup(form);
    setSaved(true);
    onSaved();
    toast.success('Client setup saved successfully!');
  };

  const handleReset = () => {
    setForm(getClientSetup());
    setSaved(false);
  };

  // Form field definition for clean rendering
  const sections: {
    title: string;
    icon: React.ElementType;
    iconColor: string;
    fields: { key: keyof ClientSetup; label: string; placeholder: string; span?: number }[];
  }[] = [
    {
      title: 'Company Information',
      icon: Building2,
      iconColor: 'text-cyan-400',
      fields: [
        { key: 'company_name', label: 'Company Name', placeholder: 'e.g. ABC Industries Private Limited', span: 2 },
        { key: 'cin_number', label: 'CIN Number', placeholder: 'e.g. U12345MH2020PTC123456' },
        { key: 'registered_address', label: 'Registered Address', placeholder: 'e.g. 101, Business Park, Mumbai 400001', span: 2 },
      ],
    },
    {
      title: 'Auditor Details',
      icon: BadgeCheck,
      iconColor: 'text-purple-400',
      fields: [
        { key: 'audit_firm_name', label: 'Audit Firm Name', placeholder: 'e.g. M/s Vaswani & Associates' },
        { key: 'firm_reg_no', label: 'Firm Registration No.', placeholder: 'e.g. 123456W' },
        { key: 'partner_name', label: 'Partner Name', placeholder: 'e.g. CA John Doe' },
        { key: 'membership_no', label: 'Membership No.', placeholder: 'e.g. 123456' },
        { key: 'udin', label: 'UDIN', placeholder: 'e.g. 23123456ABCDEF1234', span: 2 },
      ],
    },
    {
      title: 'Board of Directors',
      icon: User,
      iconColor: 'text-amber-400',
      fields: [
        { key: 'director_1_name', label: 'Director 1 Name', placeholder: 'e.g. Mr. Rajesh Patel' },
        { key: 'director_2_name', label: 'Director 2 Name', placeholder: 'e.g. Mrs. Priya Sharma' },
      ],
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-cyan-400" />
            Client Setup
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Company details and signatory information for report headers and footers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider transition-all hover:bg-slate-800"
          >
            <RotateCcw className="w-3 h-3 inline mr-1.5" />
            Reset
          </button>
          <button
            onClick={handleSave}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              saved
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                : 'bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white shadow-lg shadow-cyan-600/20 hover:scale-[1.02]'
            }`}
          >
            {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? 'Saved' : 'Save Setup'}
          </button>
        </div>
      </div>

      {/* Form Sections */}
      {sections.map((section) => {
        const SIcon = section.icon;
        return (
          <div
            key={section.title}
            className="rounded-2xl bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 overflow-hidden"
          >
            <div className="px-5 py-3.5 border-b border-white/5 flex items-center gap-2.5">
              <SIcon className={`w-4 h-4 ${section.iconColor}`} />
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-300">
                {section.title}
              </h3>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {section.fields.map((field) => (
                <div
                  key={field.key}
                  className={field.span === 2 ? 'md:col-span-2' : ''}
                >
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                    {field.label}
                  </label>
                  <input
                    type="text"
                    value={form[field.key]}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3.5 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500/50 focus:shadow-[0_0_12px_rgba(6,182,212,0.1)] outline-none transition-all"
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===================================================================
// MASTER DATA VIEWER
// ===================================================================
function MasterDataViewer({ masterCodes }: { masterCodes: MasterGroupCode[] }) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'BS' | 'PL'>('ALL');
  const [filterNote, setFilterNote] = useState<number | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());

  // Get unique notes for filter dropdown
  const uniqueNotes = useMemo(() => {
    const notes = [...new Set(masterCodes.map((c) => c.note_reference))].sort((a, b) => a - b);
    return notes.map((n) => {
      const first = masterCodes.find((c) => c.note_reference === n);
      return { note: n, label: first?.statement_category || `Note ${n}` };
    });
  }, [masterCodes]);

  // Filtered codes
  const filtered = useMemo(() => {
    let codes = masterCodes;
    if (filterType !== 'ALL') {
      codes = codes.filter((c) => c.statement_type === filterType);
    }
    if (filterNote !== null) {
      codes = codes.filter((c) => c.note_reference === filterNote);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      codes = codes.filter(
        (c) =>
          c.particulars.toLowerCase().includes(q) ||
          c.group_code.toString().includes(q) ||
          c.statement_category.toLowerCase().includes(q)
      );
    }
    return codes;
  }, [masterCodes, filterType, filterNote, search]);

  // Group by note_reference for tree view
  const grouped = useMemo(() => {
    const map = new Map<number, MasterGroupCode[]>();
    for (const code of filtered) {
      const arr = map.get(code.note_reference) || [];
      arr.push(code);
      map.set(code.note_reference, arr);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  const toggleNote = (noteRef: number) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(noteRef)) next.delete(noteRef);
      else next.add(noteRef);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedNotes(new Set(grouped.map(([n]) => n)));
  };

  const collapseAll = () => {
    setExpandedNotes(new Set());
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-cyan-400" />
            Master Group Codes
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Schedule III dictionary — {masterCodes.length} entries across {uniqueNotes.length} notes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-white text-[9px] font-bold uppercase tracking-wider transition-all hover:bg-slate-800"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-white text-[9px] font-bold uppercase tracking-wider transition-all hover:bg-slate-800"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code, or category..."
            className="w-full h-9 bg-slate-950/60 border border-slate-700/60 rounded-lg pl-9 pr-3 text-xs text-white placeholder:text-slate-600 focus:border-cyan-500/50 outline-none transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Type Filter */}
        <div className="flex items-center rounded-lg bg-slate-950/60 border border-slate-700/60 overflow-hidden">
          {(['ALL', 'BS', 'PL'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${
                filterType === t
                  ? 'bg-cyan-500/15 text-cyan-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t === 'ALL' ? 'All' : t}
            </button>
          ))}
        </div>

        {/* Note Filter */}
        <div className="relative">
          <select
            value={filterNote ?? ''}
            onChange={(e) => setFilterNote(e.target.value ? Number(e.target.value) : null)}
            className="h-9 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3 pr-8 text-xs text-white appearance-none cursor-pointer focus:border-cyan-500/50 outline-none transition-all"
          >
            <option value="">All Notes</option>
            {uniqueNotes.map((n) => (
              <option key={n.note} value={n.note}>
                Note {n.note}: {n.label}
              </option>
            ))}
          </select>
          <Filter className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center gap-2 text-[10px] text-slate-500">
        <Layers className="w-3.5 h-3.5" />
        <span>
          Showing <span className="text-cyan-400 font-bold">{filtered.length}</span> of{' '}
          {masterCodes.length} entries in{' '}
          <span className="text-cyan-400 font-bold">{grouped.length}</span> notes
        </span>
      </div>

      {/* Tree View */}
      <div className="space-y-2">
        {grouped.map(([noteRef, codes]) => {
          const isExpanded = expandedNotes.has(noteRef);
          const firstCode = codes[0];
          const statementBadge = firstCode.statement_type === 'BS' ? 'Balance Sheet' : 'Profit & Loss';
          const badgeColor =
            firstCode.statement_type === 'BS'
              ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
              : 'bg-purple-500/10 border-purple-500/20 text-purple-400';

          return (
            <div
              key={noteRef}
              className="rounded-xl bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 overflow-hidden transition-all duration-300"
            >
              {/* Note Header */}
              <button
                onClick={() => toggleNote(noteRef)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors group"
              >
                <div className="text-slate-500 transition-transform duration-200">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 group-hover:text-cyan-400" />
                  )}
                </div>
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 text-xs font-black">
                  {noteRef}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">
                    {firstCode.statement_category}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {codes.length} line item{codes.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <span
                  className={`text-[8px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-widest ${badgeColor}`}
                >
                  {statementBadge}
                </span>
              </button>

              {/* Expanded Line Items */}
              {isExpanded && (
                <div className="border-t border-white/5">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-950/40">
                        <th className="px-4 py-2 text-[9px] font-black text-slate-500 uppercase tracking-widest text-left w-24">
                          Code
                        </th>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-500 uppercase tracking-widest text-left">
                          Particulars
                        </th>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center w-20">
                          Note
                        </th>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center w-20">
                          Type
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {codes.map((code) => (
                        <tr
                          key={code.group_code}
                          className="hover:bg-white/[0.02] transition-colors border-t border-white/[0.03]"
                        >
                          <td className="px-4 py-2.5">
                            <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">
                              {code.group_code}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-300">
                            {code.particulars}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="text-[10px] text-slate-500 font-mono font-bold">
                              {code.note_reference}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span
                              className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${
                                code.statement_type === 'BS'
                                  ? 'bg-blue-500/10 text-blue-400'
                                  : 'bg-purple-500/10 text-purple-400'
                              }`}
                            >
                              {code.statement_type}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Search className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-500 font-medium">No matching entries found.</p>
          <p className="text-xs text-slate-600 mt-1">Try adjusting your search or filters.</p>
        </div>
      )}
    </div>
  );
}

// ===================================================================
// PLACEHOLDER PANEL (for future phases)
// ===================================================================
function PlaceholderPanel({
  phase,
  title,
  description,
}: {
  phase: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-20 h-20 rounded-2xl bg-slate-800/50 border border-slate-700/30 flex items-center justify-center mb-6">
        <Layers className="w-10 h-10 text-slate-600" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
      <p className="text-sm text-slate-500 max-w-md text-center leading-relaxed mb-4">
        {description}
      </p>
      <span className="px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
        Phase {phase} — Coming Soon
      </span>
    </div>
  );
}
