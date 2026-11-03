import { useState, useEffect, useMemo } from 'react';
import {
  Building2, BookOpen, Upload, Landmark, BarChart3, FileDown,
  ArrowRight, Search, ChevronDown, ChevronRight, Save, RotateCcw,
  AlertTriangle, CheckCircle2, Shield, Hash, FileText, Layers,
  Eye, Filter, X, Info, Briefcase, User, BadgeCheck, ScrollText, Lightbulb,
  Users, TrendingUp, ShieldCheck, Scale, Award
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  ClientSetup,
  MasterGroupCode,
  BalanceCheck,
  EntityClassificationMode,
  CorporateSubType,
  NonCorporateSubType,
  DenominationUnit,
  PresentationFormat,
} from '@/lib/finStatements.types';
import {
  getMasterGroupCodes,
  getClientSetup,
  saveClientSetup,
  getTrialBalance,
  computeBalanceCheck,
  countUnmappedEntries,
  evaluateNonCorporateLevel,
  saveWorkspaceToBackend,
  loadWorkspaceFromBackend,
} from '@/lib/finStatements.storage';
import TBImportMapping from '@/components/finstatements/TBImportMapping';
import FixedAssetsRegister from '@/components/finstatements/FixedAssetsRegister';
import FinancialReports from '@/components/finstatements/FinancialReports';
import NonCorporateReports from '@/components/finstatements/NonCorporateReports';
import RegulatoryDisclosures from '@/components/finstatements/RegulatoryDisclosures';
import IfcChecksDashboard from '@/components/finstatements/IfcChecksDashboard';
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
  | 'non-corporate'
  | 'ratios'
  | 'ifc-checks'
  | 'export';

interface Props {
  onBack: () => void;
}

// ===================================================================
// SIDEBAR NAV ITEMS
// ===================================================================
const SIDEBAR_ITEMS: { key: SidebarSection; label: string; icon: React.ElementType; tag?: string }[] = [
  { key: 'setup',         label: 'Client & Standards',   icon: Building2 },
  { key: 'master',        label: '4-Digit Taxonomy',     icon: BookOpen, tag: '130+' },
  { key: 'tb-import',     label: 'TB Import & Mapping',  icon: Upload },
  { key: 'assets',        label: 'Asset Block & Dep',    icon: Landmark },
  { key: 'reports',       label: 'Schedule III Reports', icon: BarChart3, tag: 'BS/PL/CFS' },
  { key: 'non-corporate', label: 'Non-Corporate & Partner', icon: Users, tag: 'ICAI 2022' },
  { key: 'ratios',        label: 'MCA 2021 Disclosures', icon: TrendingUp, tag: '11 Ratios' },
  { key: 'ifc-checks',    label: 'Preventive IFC Checks',icon: ShieldCheck, tag: '35+ Rules' },
  { key: 'export',        label: 'Zero-Merge Export',    icon: FileDown, tag: 'XLSX/PDF' },
];

// ===================================================================
// MAIN COMPONENT
// ===================================================================
export default function FinancialStatements({ onBack }: Props) {
  const [showQuickGuide, setShowQuickGuide] = useState(false);
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
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const clientGstin = useMemo(() => {
    try {
      return localStorage.getItem('last_active_gstin') ||
             localStorage.getItem('monthly_audit_selected_client') ||
             'DEFAULT_CLIENT';
    } catch {
      return 'DEFAULT_CLIENT';
    }
  }, []);

  const fy = useMemo(() => {
    try {
      return localStorage.getItem('last_active_fy') || '2026-27';
    } catch {
      return '2026-27';
    }
  }, []);

  // Load data on mount & attempt SQLite hydration
  useEffect(() => {
    setMasterCodes(getMasterGroupCodes());
    refreshDashboard();

    // Auto-load from central SQLite persistence if available
    if (clientGstin) {
      loadWorkspaceFromBackend(clientGstin, fy).then((loaded) => {
        if (loaded) {
          refreshDashboard();
          setLastSaved(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
        }
      }).catch(() => {
        // Non-blocking fallback to existing localStorage
      });
    }
  }, [clientGstin, fy]);

  const refreshDashboard = () => {
    setBalanceCheck(computeBalanceCheck());
    setUnmappedCount(countUnmappedEntries());
    setTbCount(getTrialBalance().length);
  };

  const handleSaveToDatabase = async () => {
    setIsSaving(true);
    try {
      const res = await saveWorkspaceToBackend(clientGstin, fy, 'company');
      if (res.success) {
        setLastSaved(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
        toast.success('Financial Statements workspace saved to central database!');
      } else {
        toast.error(res.message || 'Failed to save to central database');
      }
    } catch (err: any) {
      toast.error('Local database unreachable: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full silk-reveal">
      <header className="bg-slate-900/60 backdrop-blur-xl rounded-2xl border border-slate-800 shadow-md p-4 mb-6 flex items-center justify-between">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="text-slate-400 hover:text-white flex items-center gap-2 font-bold uppercase tracking-wider text-[10px] transition-colors"
        >
          <ArrowRight className="w-3.5 h-3.5 transform rotate-180" /> Back to Hub
        </button>

        <div className="flex items-center gap-3">
          {lastSaved && (
            <span className="text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              Last Saved: {lastSaved}
            </span>
          )}
          <button
            onClick={handleSaveToDatabase}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-cyan-500/10 disabled:opacity-50"
            title="Save entire financial statements workspace to central SQLite database"
          >
            <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
            {isSaving ? 'Saving...' : 'Save Financial Statements'}
          </button>
        </div>
      </header>

      {/* Module Title */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <ScrollText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            Financial Statements Engine
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold tracking-widest uppercase">
              Schedule III &amp; Non-Corporate
            </span>
          </h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
            Companies Act 2013 &bull; ICAI June 2022 Technical Guide &bull; MCA 2021 Regulatory Disclosures
          </p>
        </div>
      </div>

      {/* Collapsible Quick Guide */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 text-slate-300 backdrop-blur-md shadow-lg max-w-6xl mb-6">
        <header className="bg-[#F8FAFC] rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-4 mb-6 flex items-center justify-between"><button 
          onClick={() => setShowQuickGuide(!showQuickGuide)} 
          className="flex items-center justify-between w-full text-slate-300 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
            <Lightbulb className="w-4 h-4 text-yellow-400" />
            Comprehensive Financial Statements Architecture Guide
          </span>
          <span className="text-xs text-blue-400 font-bold hover:underline">{showQuickGuide ? 'Hide' : 'Show Instructions'}</span>
        </button></header>
        {showQuickGuide && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 text-xs text-slate-400 space-y-4 animate-in fade-in slide-in-from-top-1 duration-350">
            <p><strong>Overview:</strong> Prepare audited Corporate (Schedule III) and Non-Corporate (Proprietorship, Partnership, LLP) Financial Statements with automated AS-3 Cash Flow, MCA 2021 disclosures, 11 financial ratios, and 35+ preventive IFC checks.</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="font-bold text-slate-300 mb-1.5">End-to-End Workflow:</p>
                <ol className="space-y-1.5 pl-4 list-decimal">
                  <li><strong>Client Setup:</strong> Select Corporate vs Non-Corporate. Enter Turnover/Borrowings for automatic Level I–IV AS classification.</li>
                  <li><strong>TB Import:</strong> Upload raw Trial Balance from Excel or pull live from Tally Prime via direct HTTP Port 9000.</li>
                  <li><strong>4-Digit Taxonomy:</strong> Auto-map ledgers to Schedule III codes (1001–4902) using intelligent heuristics.</li>
                  <li><strong>Financial Reports:</strong> Inspect Balance Sheet, Profit &amp; Loss, and AS-3 Indirect Cash Flow Statement.</li>
                  <li><strong>Non-Corporate &amp; Partners:</strong> Manage multi-partner capital movements (Opening, Additions, Drawings, Interest, Salary, Profit).</li>
                  <li><strong>MCA 2021 Disclosures:</strong> Review 11 Statutory Ratios with &gt;25% variance checks, Trade Payables &amp; Receivables aging grids.</li>
                  <li><strong>Preventive IFC Checks:</strong> Run 35+ validation rules to ensure audit equilibrium and zero errors.</li>
                  <li><strong>Zero-Merge Export:</strong> Download an 8-sheet audit-grade Excel workbook guaranteed free of cell merges.</li>
                </ol>
              </div>
              <div>
                <p className="font-bold text-slate-300 mb-1.5">Key Compliance Guarantees:</p>
                <ul className="space-y-1.5 pl-4 list-disc">
                  <li><strong>Strict Zero-Merge (`ws['!merges'] = []`):</strong> All 8 Excel sheets preserve filtering, sorting, and XLOOKUP compatibility.</li>
                  <li><strong>Tax Calculations:</strong> Section 115BAA (25.168%), Regular 25%/30%, MAT u/s 115JB (17.472%), and Deferred Tax provisions.</li>
                  <li><strong>ICAI Technical Guide (June 2022):</strong> Exact criteria for Level I, II, III, and IV non-corporate entity exemptions.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
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
          isSidebarExpanded ? 'w-64' : 'w-16'
        }`}>
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            {isSidebarExpanded && (
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap">Navigation</p>
            )}
            <header className="bg-[#F8FAFC] rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-4 mb-6 flex items-center justify-between"><button 
              onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
              className="p-1 -m-1 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors mx-auto"
              title={isSidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
            >
              <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${isSidebarExpanded ? 'rotate-180' : ''}`} />
            </button></header>
          </div>
          <nav className="p-2 space-y-0.5">
            {SIDEBAR_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.key;
              return (
                <header className="bg-[#F8FAFC] rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-4 mb-6 flex items-center justify-between"><button
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
                </button></header>
              );
            })}
          </nav>

          {/* Sidebar Footer Stats */}
          {isSidebarExpanded && (
            <div className="p-4 mt-auto border-t border-white/5 whitespace-nowrap overflow-hidden">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-slate-500 uppercase tracking-wider font-bold">Taxonomy Codes</span>
                  <span className="text-cyan-400 font-mono font-bold">{masterCodes.length}</span>
                </div>
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-slate-500 uppercase tracking-wider font-bold">TB Accounts</span>
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
          {activeSection === 'non-corporate' && <NonCorporateReports />}
          {activeSection === 'ratios' && <RegulatoryDisclosures />}
          {activeSection === 'ifc-checks' && <IfcChecksDashboard />}
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
                ✓ FINANCIAL STATEMENTS IN EQUILIBRIUM (Assets = Liabilities)
              </p>
            ) : (
              <p className="text-xs text-red-400 font-bold mt-0.5">
                ⚠ BALANCE SHEET OUT OF BALANCE — Difference: ₹
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

  const updateField = (field: keyof ClientSetup, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    if (!form.company_name.trim()) {
      toast.error('Entity Name is required.');
      return;
    }
    saveClientSetup(form);
    setSaved(true);
    onSaved();
    toast.success('Client setup & standards saved successfully!');
  };

  const handleReset = () => {
    setForm(getClientSetup());
    setSaved(false);
  };

  const levelRes = evaluateNonCorporateLevel(
    form.turnover_preceding_year || 0,
    form.borrowings_preceding_year || 0
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-cyan-400" />
            Client Setup &amp; Reporting Standards
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Entity classification, ICAI June 2022 Technical Guide Level evaluation, and signatory credentials.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <header className="bg-[#F8FAFC] rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-4 mb-6 flex items-center justify-between"><button
            onClick={handleReset}
            className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider transition-all hover:bg-slate-800"
          >
            <RotateCcw className="w-3 h-3 inline mr-1.5" />
            Reset
          </button></header>
          <header className="bg-[#F8FAFC] rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-4 mb-6 flex items-center justify-between"><button
            onClick={handleSave}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              saved
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                : 'bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white shadow-lg shadow-cyan-600/20 hover:scale-[1.02]'
            }`}
          >
            {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? 'Saved' : 'Save Setup'}
          </button></header>
        </div>
      </div>

      {/* ── CARD 1: ENTITY CLASSIFICATION & LEVEL EVALUATION ── */}
      <div className="rounded-2xl bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Award className="w-4 h-4 text-cyan-400" />
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-300">
              Entity Classification &amp; ICAI June 2022 Level Matrix
            </h3>
          </div>
          {form.entity_type === 'non_corporate' && (
            <span className="text-[9px] px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold uppercase tracking-wider font-mono">
              {levelRes.level}
            </span>
          )}
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Entity Mode */}
            <div>
              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                Entity Mode
              </label>
              <select
                value={form.entity_type}
                onChange={(e) => updateField('entity_type', e.target.value as EntityClassificationMode)}
                className="w-full h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500 transition-all font-bold"
              >
                <option value="corporate">Corporate (Schedule III Division I)</option>
                <option value="non_corporate">Non-Corporate (ICAI June 2022 TG)</option>
              </select>
            </div>

            {/* Sub Type */}
            <div>
              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                {form.entity_type === 'corporate' ? 'Corporate Structure' : 'Non-Corporate Entity Type'}
              </label>
              {form.entity_type === 'corporate' ? (
                <select
                  value={form.corporate_sub_type || 'pvt_ltd'}
                  onChange={(e) => updateField('corporate_sub_type', e.target.value as CorporateSubType)}
                  className="w-full h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500 transition-all"
                >
                  <option value="pvt_ltd">Private Limited Company</option>
                  <option value="ltd">Public Limited Company</option>
                  <option value="opc">One Person Company (OPC)</option>
                  <option value="sec8">Section 8 Company</option>
                </select>
              ) : (
                <select
                  value={form.non_corporate_sub_type || 'partnership'}
                  onChange={(e) => updateField('non_corporate_sub_type', e.target.value as NonCorporateSubType)}
                  className="w-full h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3 text-xs text-white outline-none focus:border-amber-500 transition-all font-bold text-amber-300"
                >
                  <option value="partnership">Partnership Firm</option>
                  <option value="proprietorship">Sole Proprietorship</option>
                  <option value="llp">Limited Liability Partnership (LLP)</option>
                  <option value="trust">AOP / BOI / Trust</option>
                </select>
              )}
            </div>

            {/* Denomination */}
            <div>
              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                Statement Denomination
              </label>
              <select
                value={form.denomination}
                onChange={(e) => updateField('denomination', e.target.value as DenominationUnit)}
                className="w-full h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500 transition-all font-mono"
              >
                <option value="in_rupees">Exact (in ₹ Rupees)</option>
                <option value="hundreds">in Hundreds (₹ '00)</option>
                <option value="thousands">in Thousands (₹ '000)</option>
                <option value="lacs">in Lacs (₹ in Lakhs)</option>
                <option value="crores">in Crores (₹ in Crores)</option>
              </select>
            </div>
          </div>

          {/* Turnover & Borrowings for Level Classification */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/5">
            <div>
              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                Preceding Year Turnover (₹)
              </label>
              <input
                type="number"
                value={form.turnover_preceding_year || ''}
                onChange={(e) => updateField('turnover_preceding_year', parseFloat(e.target.value) || 0)}
                placeholder="e.g. 50000000"
                className="w-full h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3.5 text-sm text-white font-mono outline-none focus:border-cyan-500"
              />
              <span className="text-[9px] text-slate-500 mt-1 block">
                Turnover in Cr: ₹{((form.turnover_preceding_year || 0) / 10000000).toFixed(2)} Cr
              </span>
            </div>

            <div>
              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                Preceding Year Borrowings (₹)
              </label>
              <input
                type="number"
                value={form.borrowings_preceding_year || ''}
                onChange={(e) => updateField('borrowings_preceding_year', parseFloat(e.target.value) || 0)}
                placeholder="e.g. 10000000"
                className="w-full h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3.5 text-sm text-white font-mono outline-none focus:border-cyan-500"
              />
              <span className="text-[9px] text-slate-500 mt-1 block">
                Borrowings in Cr: ₹{((form.borrowings_preceding_year || 0) / 10000000).toFixed(2)} Cr
              </span>
            </div>
          </div>

          {/* Level Result Explanation Box */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="text-slate-300">
                <strong>ICAI Evaluation:</strong> {levelRes.summary}
              </span>
            </div>
            <span className="font-mono text-[10px] text-slate-400">
              AS 3 Cash Flow: <strong className={levelRes.is_cash_flow_mandatory ? 'text-red-400' : 'text-emerald-400'}>
                {levelRes.is_cash_flow_mandatory ? 'Mandatory' : 'Exempt'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* ── CARD 2: COMPANY INFORMATION ── */}
      <div className="rounded-2xl bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/5 flex items-center gap-2.5">
          <Building2 className="w-4 h-4 text-cyan-400" />
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-300">
            Entity &amp; Financial Year Information
          </h3>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
              Entity / Company Name *
            </label>
            <input
              type="text"
              value={form.company_name}
              onChange={(e) => updateField('company_name', e.target.value)}
              placeholder="e.g. ABC Industries Private Limited"
              className="w-full h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3.5 text-sm text-white font-bold outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
              CIN / LLPIN / Registration No.
            </label>
            <input
              type="text"
              value={form.cin_number}
              onChange={(e) => updateField('cin_number', e.target.value)}
              placeholder="e.g. U12345MH2020PTC123456"
              className="w-full h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3.5 text-sm text-white font-mono outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
              Financial Year
            </label>
            <input
              type="text"
              value={form.financial_year}
              onChange={(e) => updateField('financial_year', e.target.value)}
              placeholder="2024-25"
              className="w-full h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3.5 text-sm text-white font-mono outline-none focus:border-cyan-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
              Registered Office Address
            </label>
            <input
              type="text"
              value={form.registered_address}
              onChange={(e) => updateField('registered_address', e.target.value)}
              placeholder="e.g. 101, Business Park, Mumbai 400001"
              className="w-full h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3.5 text-sm text-white outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      </div>

      {/* ── CARD 3: AUDITOR DETAILS ── */}
      <div className="rounded-2xl bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/5 flex items-center gap-2.5">
          <BadgeCheck className="w-4 h-4 text-purple-400" />
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-300">
            Auditor Credentials &amp; Signing Information
          </h3>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
              Audit Firm Name
            </label>
            <input
              type="text"
              value={form.audit_firm_name}
              onChange={(e) => updateField('audit_firm_name', e.target.value)}
              placeholder="e.g. M/s Vaswani & Associates"
              className="w-full h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3.5 text-sm text-white outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
              Firm Registration Number (FRN)
            </label>
            <input
              type="text"
              value={form.firm_reg_no}
              onChange={(e) => updateField('firm_reg_no', e.target.value)}
              placeholder="e.g. 123456W"
              className="w-full h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3.5 text-sm text-white font-mono outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
              Signing Partner Name
            </label>
            <input
              type="text"
              value={form.partner_name}
              onChange={(e) => updateField('partner_name', e.target.value)}
              placeholder="e.g. CA Vipul Patel"
              className="w-full h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3.5 text-sm text-white outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
              Membership Number
            </label>
            <input
              type="text"
              value={form.membership_no}
              onChange={(e) => updateField('membership_no', e.target.value)}
              placeholder="e.g. 184754"
              className="w-full h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3.5 text-sm text-white font-mono outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
              UDIN
            </label>
            <input
              type="text"
              value={form.udin}
              onChange={(e) => updateField('udin', e.target.value)}
              placeholder="e.g. 25184754AAAAAA1234"
              className="w-full h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3.5 text-sm text-white font-mono outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
              Date &amp; Place of Signing
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.place_of_signature || ''}
                onChange={(e) => updateField('place_of_signature', e.target.value)}
                placeholder="Pune"
                className="w-1/2 h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3 text-sm text-white outline-none focus:border-cyan-500"
              />
              <input
                type="date"
                value={form.date_of_signature || ''}
                onChange={(e) => updateField('date_of_signature', e.target.value)}
                className="w-1/2 h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3 text-sm text-white outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── CARD 4: SIGNATORIES / DIRECTORS ── */}
      <div className="rounded-2xl bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/5 flex items-center gap-2.5">
          <User className="w-4 h-4 text-amber-400" />
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-300">
            Signatory Directors / Partners
          </h3>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
              Director / Partner 1 Name &amp; DIN
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.director_1_name}
                onChange={(e) => updateField('director_1_name', e.target.value)}
                placeholder="Mr. Om Ramchandani"
                className="w-2/3 h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3.5 text-sm text-white outline-none focus:border-cyan-500"
              />
              <input
                type="text"
                value={form.director_1_din || ''}
                onChange={(e) => updateField('director_1_din', e.target.value)}
                placeholder="DIN: 10598652"
                className="w-1/3 h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3 text-sm text-white font-mono outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
              Director / Partner 2 Name &amp; DIN
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.director_2_name}
                onChange={(e) => updateField('director_2_name', e.target.value)}
                placeholder="Mrs. Ragini Deshpande"
                className="w-2/3 h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3.5 text-sm text-white outline-none focus:border-cyan-500"
              />
              <input
                type="text"
                value={form.director_2_din || ''}
                onChange={(e) => updateField('director_2_din', e.target.value)}
                placeholder="DIN: 10598653"
                className="w-1/3 h-10 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3 text-sm text-white font-mono outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>
      </div>
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
            Master 4-Digit Taxonomy Dictionary
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Complete Schedule III taxonomy — {masterCodes.length} groups across {uniqueNotes.length} notes (Codes 1001 to 4902).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <header className="bg-[#F8FAFC] rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-4 mb-6 flex items-center justify-between"><button
            onClick={expandAll}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-white text-[9px] font-bold uppercase tracking-wider transition-all hover:bg-slate-800"
          >
            Expand All
          </button></header>
          <header className="bg-[#F8FAFC] rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-4 mb-6 flex items-center justify-between"><button
            onClick={collapseAll}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-white text-[9px] font-bold uppercase tracking-wider transition-all hover:bg-slate-800"
          >
            Collapse All
          </button></header>
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
            placeholder="Search by code (e.g. 1001, 2801), particulars, or category..."
            className="w-full h-9 bg-slate-950/60 border border-slate-700/60 rounded-lg pl-9 pr-3 text-xs text-white placeholder:text-slate-600 focus:border-cyan-500/50 outline-none transition-all"
          />
          {search && (
            <header className="bg-[#F8FAFC] rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-4 mb-6 flex items-center justify-between"><button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button></header>
          )}
        </div>

        {/* Type Filter */}
        <div className="flex items-center rounded-lg bg-slate-950/60 border border-slate-700/60 overflow-hidden">
          {(['ALL', 'BS', 'PL'] as const).map((t) => (
            <header className="bg-[#F8FAFC] rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-4 mb-6 flex items-center justify-between"><button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${
                filterType === t
                  ? 'bg-cyan-500/15 text-cyan-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t === 'ALL' ? 'All' : t}
            </button></header>
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
              <header className="bg-[#F8FAFC] rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-4 mb-6 flex items-center justify-between"><button
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
              </button></header>

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
          <p className="text-sm text-slate-500 font-medium">No matching taxonomy codes found.</p>
          <p className="text-xs text-slate-600 mt-1">Try adjusting your search or filters.</p>
        </div>
      )}
    </div>
  );
}
