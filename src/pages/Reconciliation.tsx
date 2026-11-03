import React from 'react';
import {
  ArrowRight, ArrowLeft, FileSpreadsheet, CheckCircle2, ShieldCheck, Plus,
  RotateCcw, CloudDownload, ChevronRight, ChevronDown, GitCompare, Database,
  Server, Settings, Activity, X, Star, Sparkles, Building2, Lightbulb,
  Cloud, History, UploadCloud, HardDrive, Receipt
} from 'lucide-react';
import { ModeSelector } from '../components/ModeSelector';
import { FileUploadZone } from '../components/FileUploadZone';
import { ColumnMapper } from '../components/ColumnMapper';
import { PartyWiseReport } from '../components/PartyWiseReport';
import { MonthlyBreakdown } from '../components/MonthlyBreakdown';
import { ModeSwitcher } from '../components/ModeSwitcher';
import { GSTVerification } from '../components/GSTVerification';
import { OutputDashboard } from '../components/OutputDashboard';
import { SummaryCards } from '../components/SummaryCards';
import { ResultsCategoryTabs } from '../components/ResultsCategoryTabs';
import { GDriveConnectModal } from '../components/GDriveConnectModal';
import { RecoHistoryModal } from '../components/RecoHistoryModal';
import { uploadRecoSnapshotToDrive, checkGDriveStatus, saveLocalRecoSnapshot, type RecoSnapshotPayload } from '../lib/gdrive';
import { getSummary } from '../lib/reconciliation';
import { cn, safeSetItem } from '../lib/utils';
import { toast } from 'sonner';
import { TERMS, getTerms, normalizeMode } from '../lib/mode';
import { motion } from 'framer-motion';

type Step = 'upload' | 'map' | 'review' | 'results';

export default function Reconciliation(props: any) {
  const [showQuickGuide, setShowQuickGuide] = React.useState(false);
  const [auditLedgerCollapsed, setAuditLedgerCollapsed] = React.useState(false);
  const [isGDriveConnectOpen, setIsGDriveConnectOpen] = React.useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [partyDisputes, setPartyDisputes] = React.useState<Record<string, any>>({});
  const [isSavingRun, setIsSavingRun] = React.useState(false);
  const [lastSavedRun, setLastSavedRun] = React.useState<string | null>(null);
  const {
    setAppRoute, mode, setMode, step, setStep, companyName, setCompanyName,
    tolerance, setTolerance, fuzzyStrictness, setFuzzyStrictness,
    processing, progressValue, results, setResults, summary, setSummary, parsedDebitNotes, setParsedDebitNotes, gstr3bData,
    handleFileUpload, handleProcess, handleExport, handleBack,
    gstr2bMapping, prMapping, gstr1Mapping, srMapping, b2bMapping, b2cMapping, b2clMapping, cnMapping, nilMapping,
    setGstr2bMapping, setPrMapping, setGstr1Mapping, setSrMapping, setB2bMapping, setB2cMapping, setB2clMapping, setCnMapping, setNilMapping,
    prFile, prDnFile, prCnFile, gstr2bFile, srFile, gstr1File,
    isMappingComplete,

    // Missing states and utilities passed from Index
    twoBHeaders, setTwoBHeaders,
    twoBMapping, setTwoBMapping,
    prDnHeaders, setPrDnHeaders,
    prCnHeaders, setPrCnHeaders,
    prDnMapping, setPrDnMapping,
    prCnMapping, setPrCnMapping,
    twoBDnFile, setTwoBDnFile,
    twoBDnHeaders, setTwoBDnHeaders,
    twoBDnMapping, setTwoBDnMapping,
    portalMappings, setPortalMappings,
    portalQueue, setPortalQueue,
    booksQueue, setBooksQueue,
    journals, setJournals,
    gstIssues, setGstIssues,
    appliedGstins, setAppliedGstins,
    outputResults, setOutputResults,
    prHeaders, setPrHeaders,
    gstr3bFile, setGstr3bFile,
    isPreparingPipeline, setIsPreparingPipeline,
    booksDrag, setBooksDrag,
    portalDrag, setPortalDrag,
    showAdvancedOptions, setShowAdvancedOptions,
    ignoreSpecialChars, setIgnoreSpecialChars,
    handleReconcile,
    handleExportMonthly,
    handleExportMonthlyDiff,
    handleExportParty,
    handleExportDebitNotes,
    handleReset,
    handlePreparePipeline,
    handleBooksDragOver,
    handleBooksDragLeave,
    handleBooksDrop,
    handlePortalDragOver,
    handlePortalDragLeave,
    handlePortalDrop,
    twoBFile
  } = props;

  const modeTerms = getTerms(mode);

  const handleSaveToDrive = async () => {
    if (!results || !summary) return;
    try {
      // Check if admin has configured GDrive on the backend
      const status = await checkGDriveStatus();
      if (!status.configured) {
        setIsGDriveConnectOpen(true);
        toast.info('Google Drive cloud backup not configured yet. Admin setup required.');
        return;
      }
      toast.loading('Uploading snapshot to Google Drive...');
      const meta = await uploadRecoSnapshotToDrive({
        version: '1.0',
        timestamp: new Date().toISOString(),
        companyName: companyName || 'Company',
        financialYear: 'FY 2024-25',
        mode: mode || 'input',
        results,
        debitNotes: parsedDebitNotes,
        summary,
      });
      toast.dismiss();
      toast.success(`Saved snapshot '${meta.name}' to Google Drive!`);
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || 'Failed to upload snapshot to Google Drive');
    }
  };

  const getRecoClientGstin = () => {
    return localStorage.getItem('last_active_gstin') || localStorage.getItem('monthly_audit_selected_client') || (companyName ? companyName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase() : 'DEFAULT_CLIENT');
  };

  const getRecoFy = () => {
    const fyStart = new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear();
    return `${fyStart}-${(fyStart + 1).toString().slice(-2)}`;
  };

  const handleSaveReconciliationRun = async () => {
    if (!results || !summary) {
      toast.warning('No reconciliation results available to save.');
      return;
    }
    setIsSavingRun(true);
    try {
      const client_gstin = getRecoClientGstin();
      const fy = getRecoFy();
      const run_id = `reco_${client_gstin}_${fy}_${Date.now()}`;

      // 1. Central SQLite Persistence (Suite 02 unified storage)
      const res = await fetch('/api/audit-storage/reco-runs/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_gstin,
          fy,
          run_id,
          summary,
          matched_records: results,
          vendor_disputes: partyDisputes,
          metadata: {
            companyName: companyName || 'Company',
            mode: mode || 'input',
            tolerance,
            fuzzyStrictness,
            debitNotes: parsedDebitNotes,
            outputResults: outputResults || null,
            totalInvoices: results.length,
            savedAt: new Date().toISOString()
          }
        })
      });
      const data = await res.json();

      // 2. Local PC snapshot fallback
      try {
        await saveLocalRecoSnapshot({
          version: '1.0',
          timestamp: new Date().toISOString(),
          companyName: companyName || 'Company',
          financialYear: `FY ${fy}`,
          mode: mode || 'input',
          moduleType: 'gst-reco',
          moduleName: 'GST 2B Reco',
          results,
          debitNotes: parsedDebitNotes,
          summary,
        });
      } catch (localErr) {
        console.warn('Local snapshot fallback skipped:', localErr);
      }

      if (data.success) {
        const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        setLastSavedRun(timeStr);
        toast.success(`Reconciliation run & vendor disputes saved to SQLite database successfully!`);
      } else {
        toast.warning(`Database save note: ${data.error || 'Saved locally'}`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save reconciliation run');
    } finally {
      setIsSavingRun(false);
    }
  };

  const handleSaveToLocal = handleSaveReconciliationRun;

  const handleSwitchMode = (targetMode: 'input' | 'output') => {
    if (mode === targetMode) return;
    setMode(targetMode);
    safeSetItem('np_reco_mode', targetMode);
    setStep('upload');
    safeSetItem('np_reco_step', 'upload');
    toast.success(targetMode === 'input' 
      ? 'Switched to Purchase Engine (Input Reco: 2B vs Books)' 
      : 'Switched to Sales Engine (Output Reco: Sales vs GSTR-1)'
    );
  };

  const handleRestoreSession = (payload: any) => {
    if (payload.mode) {
      setMode(payload.mode);
      safeSetItem('np_reco_mode', payload.mode);
    }
    if (payload.companyName) {
      setCompanyName(payload.companyName);
      safeSetItem('np_reco_company', payload.companyName);
    }
    if (payload.results) {
      setResults(payload.results);
      safeSetItem('np_reco_results', JSON.stringify(payload.results));
    }
    if (payload.outputResults && setOutputResults) {
      setOutputResults(payload.outputResults);
    }
    if (payload.summary) {
      setSummary(payload.summary);
      safeSetItem('np_reco_summary', JSON.stringify(payload.summary));
    }
    if (payload.debitNotes && setParsedDebitNotes) {
      setParsedDebitNotes(payload.debitNotes);
    }
    if (payload.vendorDisputes) {
      setPartyDisputes(payload.vendorDisputes);
    }
    setStep('results');
    safeSetItem('np_reco_step', 'results');
    setLastSavedRun(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    toast.success(`Restored session: ${payload.companyName || 'Snapshot'} (${payload.mode === 'output' ? 'Sales Engine' : 'Purchase Engine'})`);
  };

  return (
    <div className="w-full silk-reveal">


      {/* Hub Navigation Bridge */}
      {/* ─── TOP ELEVATED HEADER BAR (Suite 02 · Live) ─── */}
      <header className="mb-3 bg-white/95 backdrop-blur-xl shadow-xs rounded-2xl px-5 py-2.5 flex flex-wrap items-center justify-between gap-4 border border-slate-200/80">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setAppRoute('hub'); setMode(null); }}
            className="w-10 h-10 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-all shadow-2xs group"
            title="Return to Master Central Hub"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200/70 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs">
            <GitCompare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-wide uppercase text-slate-900 leading-tight">
                GST Reconciliation Engine
              </h1>
              <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 uppercase tracking-wider">
                Suite 02 · Live
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono">
              Purchase Register & Journals vs GSTR-2B · Section 16(2)(aa) Multi-Tier Audit Engine
            </p>
          </div>
        </div>

        {mode && (
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xs font-bold font-mono px-3 py-1.5 rounded-xl border",
              mode === 'input'
                ? "bg-indigo-50 text-indigo-700 border-indigo-200/80"
                : "bg-emerald-50 text-emerald-700 border-emerald-200/80"
            )}>
              {mode === 'input' ? 'Input Reco (2B vs Books)' : 'Output Reco (Sales vs GSTR-1)'}
            </span>
            <button
              type="button"
              onClick={() => {
                setMode(null);
                safeRemoveItem('np_reco_mode');
                toast.info('Returned to Mode Selection.');
              }}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
              title="Return to Mode Selection Screen"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" /> Change Stream
            </button>
          </div>
        )}
      </header>

      {/* Collapsible Quick Guide */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 text-slate-700 shadow-xs max-w-6xl mb-6">
        <button
          onClick={() => setShowQuickGuide(!showQuickGuide)}
          className="flex items-center justify-between w-full text-slate-800 hover:text-slate-900 transition-colors"
        >
          <span className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-slate-800">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            Quick GST Reconciliation User Guide
          </span>
          <span className="text-xs text-indigo-600 font-bold hover:underline">{showQuickGuide ? 'Hide' : 'Show Instructions'}</span>
        </button>
        {showQuickGuide && (
          <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-600 space-y-4 animate-in fade-in slide-in-from-top-1 duration-350">
            <p><strong>Overview:</strong> Flawlessly audit your company accounting books against government filings (GSTR-2B or GSTR-1) to claim maximum Input Tax Credit (ITC) or verify sales liability.</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="font-bold text-slate-800 mb-1.5">Step-by-step Steps:</p>
                <ol className="space-y-1.5 pl-4 list-decimal">
                  <li><strong>Select Mode:</strong> Choose "Input Tax Credit" (PR vs 2B) or "Output Tax Liability" (SR vs GSTR-1).</li>
                  <li><strong>Drop Files:</strong> Upload your Books Register and Government Portal sheets. Select role names (Primary, Journal, etc.).</li>
                  <li><strong>Map Fields:</strong> Map document columns to core fields (CGST, SGST, GSTIN, Invoice number, Date).</li>
                  <li><strong>Audit & Export:</strong> Correct wrong GSTIN conflicts on-screen, then download summary reports or party-wise comparisons.</li>
                </ol>
              </div>
              <div>
                <p className="font-bold text-slate-800 mb-1.5">Settings & Tips:</p>
                <ul className="space-y-1.5 pl-4 list-disc">
                  <li><strong>Fuzzy strictness:</strong> High checks exact values; Medium ignores corporate suffixes; Low uses vowel/space root parsing.</li>
                  <li><strong>Debit Notes & Journals:</strong> Include supplemental books in Step 1 to deduct adjustment values and record journal entries.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {!mode ? (
        <ModeSelector onSelect={setMode} />
      ) : (
        <div className="space-y-12">
          <div className="relative bg-white border border-slate-200/80 rounded-2xl shadow-xs px-5 py-3 mb-6">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              {/* Left: Engine Mode Badge & Stream Switcher */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  "text-xs font-bold uppercase tracking-widest font-mono px-3 py-1.5 rounded-xl border",
                  mode === 'input'
                    ? "bg-indigo-50 text-indigo-700 border-indigo-200/80"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                )}>
                  {mode === 'input' ? 'Purchase Engine' : 'Sales Engine'}
                </span>
                <ModeSwitcher currentMode={mode} onSwitch={handleSwitchMode} />
              </div>

              {/* Center: 4 Stepper Navigation Pills */}
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
                {(['upload', 'map', 'review', 'results'] as Step[]).map((s, idx) => {
                  const isActive = s === step;
                  const stepName = s === 'upload' ? 'Source' : s === 'map' ? 'Pipeline' : s === 'review' ? 'Verify' : 'Dashboard';
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setStep(s);
                        safeSetItem('np_reco_step', s);
                      }}
                      className={cn(
                        'px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-1.5 shadow-2xs',
                        isActive
                          ? (mode === 'output' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-indigo-600 text-white shadow-xs')
                          : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300'
                      )}
                    >
                      <span className={cn(
                        "w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-mono font-bold",
                        isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                      )}>
                        {idx + 1}
                      </span>
                      <span>{stepName}</span>
                    </button>
                  );
                })}
              </div>

              {/* Right: Cloud History, Google Drive, and Reset Actions */}
              <div className="flex items-center justify-end gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(true)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-purple-50 border border-slate-200 hover:border-purple-200 text-slate-700 hover:text-purple-700 shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                  title="View & restore past reconciliation sessions from Google Drive or Local PC"
                >
                  <History className="w-3.5 h-3.5 text-purple-600" /> Cloud History
                </button>
                <button
                  type="button"
                  onClick={() => setIsGDriveConnectOpen(true)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-200 text-slate-700 hover:text-sky-700 shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Configure Google Drive Cloud Storage Settings"
                >
                  <Cloud className="w-3.5 h-3.5 text-sky-600" /> Google Drive
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleReset(false);
                    toast.info('Session reset to Source step.');
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-700 hover:text-rose-600 shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Clear loaded session and reset to initial upload step"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-500" /> Reset
                </button>
              </div>
            </div>
          </div>

          {step === 'upload' && (
            <>
              <div className="w-full max-w-[85rem] mx-auto pt-4 pb-12 silk-reveal relative z-10">

                <div className="mb-4 text-center md:text-left md:px-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-bold uppercase tracking-wider mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Pipeline Initialization</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-2">
                    Synchronize Data Streams
                  </h2>
                  <p className="text-slate-600 max-w-2xl text-xs sm:text-sm font-medium">
                    Connect your internal books and government portal downloads to execute automated, high-precision reconciliation.
                  </p>
                </div>

                {/* SESSION CONFIG TOP BAR */}
                <div className="w-full bg-white border border-slate-200/80 rounded-2xl p-4 mb-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xs">
                  <div className="flex items-center gap-3 shrink-0 px-2">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-600">
                      <Settings className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Session Configuration</p>
                      <p className="text-sm text-slate-900 font-bold leading-none mt-0.5">Audit Parameters</p>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col sm:flex-row items-center gap-4 w-full md:max-w-2xl px-2">
                    <div className="relative group flex-1 w-full">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                      <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Organization Name..." className="w-full h-10 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl pl-9 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400" />
                    </div>
                    <div className="relative group w-full sm:w-36 shrink-0">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 group-focus-within:text-indigo-600 transition-colors font-bold">₹</div>
                      <input type="number" min="0" step="0.5" value={tolerance} onChange={(e) => setTolerance(parseFloat(e.target.value) || 0)} className="w-full h-10 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl pl-7 pr-3 text-sm font-mono text-slate-900 outline-none transition-all" title="Match Tolerance (Amount Difference in ₹)" />
                    </div>
                    <button
                      onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                      className="w-10 h-10 shrink-0 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center transition-all shadow-2xs"
                      title="Advanced Matching Rules"
                    >
                      <Settings className={`w-4 h-4 text-slate-600 transition-transform ${showAdvancedOptions ? 'rotate-90 text-indigo-600' : ''}`} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handlePreparePipeline}
                    disabled={isPreparingPipeline}
                    className="h-10 px-8 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition-all shadow-xs shrink-0 cursor-pointer"
                  >
                    {isPreparingPipeline ? <Activity className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    Next Step: Pipeline
                  </button>
                </div>

                {/* ADVANCED FUZZY MATCHING SETTINGS */}
                {showAdvancedOptions && (
                  <div className="w-full bg-indigo-50/30 border border-indigo-200/80 rounded-2xl p-5 mb-6 shadow-xs animate-in fade-in slide-in-from-top-2">
                    <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-widest mb-4 flex items-center gap-2"><GitCompare className="w-4 h-4" /> Fuzzy Matching Rules</h4>
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest block mb-2">Algorithm Strictness</label>
                        <div className="flex gap-2">
                          {(['high', 'medium', 'low'] as const).map(level => (
                            <button key={level} onClick={() => setFuzzyStrictness(level)} className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${fuzzyStrictness === level ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                              {level}
                            </button>
                          ))}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2 font-medium">
                          {fuzzyStrictness === 'high' ? 'Exact matching only. No suffix ignorance.' : fuzzyStrictness === 'medium' ? 'Ignores "Pvt Ltd", "LLP", "Inc" suffixes.' : 'Aggressive matching. Extracts root words and ignores spacing/vowels.'}
                        </p>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest block mb-2">Invoice Number Rules</label>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" checked={ignoreSpecialChars} onChange={(e) => setIgnoreSpecialChars(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                          <span className="text-xs text-slate-700 font-semibold">Strip special characters (- / \\ _)</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                          <span className="text-xs text-slate-700 font-semibold">Ignore leading zeros (00123 → 123)</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2-COLUMN UPLOAD & MAP QUEUES */}
                <div className="grid lg:grid-cols-2 gap-6 pb-12">

                  {/* COL 1: Books */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col gap-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 shadow-2xs">
                        <Database className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold tracking-tight text-slate-900">Internal Books</h3>
                        <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold font-mono">Primary Source</p>
                      </div>
                    </div>

                    {/* Dropzone */}
                    <label
                      onDragOver={handleBooksDragOver}
                      onDragLeave={handleBooksDragLeave}
                      onDrop={handleBooksDrop}
                      className={cn(
                        "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300 group",
                        booksDrag ? "border-emerald-500 bg-emerald-50/50 scale-[1.01]" : "border-slate-300 hover:border-emerald-500 bg-slate-50/50 hover:bg-emerald-50/20"
                      )}
                    >
                      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-2xs", booksDrag ? "bg-emerald-100 text-emerald-700" : "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100")}>
                        <CloudDownload className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-bold text-slate-700 group-hover:text-emerald-700 transition-colors">Drop multiple files or click to browse</span>
                      <input type="file" multiple accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => {
                        if (e.target.files) {
                          const newFiles = Array.from(e.target.files).map((f, i) => ({
                            id: Math.random().toString(36).substring(2),
                            file: f,
                            docType: (i === 0 && booksQueue.length === 0) ? 'primary' : ''
                          }));
                          setBooksQueue(prev => [...prev, ...newFiles]);
                          e.target.value = '';
                        }
                      }} />
                    </label>

                    {/* File Queue */}
                    <div className="space-y-2 mt-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                      {booksQueue.map(q => (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={q.id} className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl flex items-center gap-3 hover:border-emerald-300 transition-colors shadow-2xs">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="text-xs font-semibold text-slate-800 flex-1 truncate" title={q.file.name}>{q.file.name}</span>
                          <select value={q.docType} onChange={e => {
                            setBooksQueue(prev => prev.map(item => item.id === q.id ? { ...item, docType: e.target.value } : item));
                          }} className="bg-white border border-slate-300 text-xs text-slate-800 font-medium rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-500 w-[140px] shrink-0 cursor-pointer shadow-2xs">
                            <option value="">Assign Role...</option>
                            <option value="primary">{modeTerms.primaryBookLabel}</option>
                            {normalizeMode(mode) === 'output' && <option value="credit_note">Credit Notes</option>}
                            {normalizeMode(mode) === 'input' && <option value="debit_note">Debit Notes</option>}
                            <option value="journal">Sub-Ledger / Journal</option>
                          </select>
                          <button onClick={() => setBooksQueue(prev => prev.filter(item => item.id !== q.id))} className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 hover:bg-rose-100 transition-colors shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* COL 2: Portal */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col gap-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-600 shadow-2xs">
                        <Server className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold tracking-tight text-slate-900">Government Portal</h3>
                        <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold font-mono">Compliance Target</p>
                      </div>
                    </div>

                    {/* Dropzone */}
                    <label
                      onDragOver={handlePortalDragOver}
                      onDragLeave={handlePortalDragLeave}
                      onDrop={handlePortalDrop}
                      className={cn(
                        "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300 group",
                        portalDrag ? "border-indigo-500 bg-indigo-50/50 scale-[1.01]" : "border-slate-300 hover:border-indigo-500 bg-slate-50/50 hover:bg-indigo-50/20"
                      )}
                    >
                      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-2xs", portalDrag ? "bg-indigo-100 text-indigo-700" : "bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100")}>
                        <CloudDownload className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-700 transition-colors">Drop multiple files or click to browse</span>
                      <input type="file" multiple accept=".csv,.xlsx,.xls,.json" className="hidden" onChange={(e) => {
                        if (e.target.files) {
                          const newFiles = Array.from(e.target.files).map((f, i) => ({
                            id: Math.random().toString(36).substring(2),
                            file: f,
                            docType: (i === 0 && portalQueue.length === 0) ? (mode === 'output' ? 'b2b' : 'primary') : ''
                          }));
                          setPortalQueue(prev => [...prev, ...newFiles]);
                          e.target.value = '';
                        }
                      }} />
                    </label>

                    {/* File Queue */}
                    <div className="space-y-2 mt-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                      {portalQueue.map(q => (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={q.id} className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl flex items-center gap-3 hover:border-indigo-300 transition-colors shadow-2xs">
                          <FileSpreadsheet className="w-4 h-4 text-indigo-600 shrink-0" />
                          <span className="text-xs font-semibold text-slate-800 flex-1 truncate" title={q.file.name}>{q.file.name}</span>
                          <select value={q.docType} onChange={e => {
                            setPortalQueue(prev => prev.map(item => item.id === q.id ? { ...item, docType: e.target.value } : item));
                          }} className="bg-white border border-slate-300 text-xs text-slate-800 font-medium rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500 w-[140px] shrink-0 cursor-pointer shadow-2xs">
                            <option value="">Assign Role...</option>
                            {normalizeMode(mode) === 'input' ? (
                              <>
                                <option value="primary">{modeTerms.govtLabel}</option>
                                <option value="gstr3b">GSTR-3B Summary</option>
                                <option value="debit_note">Portal Adjustments</option>
                              </>
                            ) : (
                              <>
                                <option value="b2b">B2B</option>
                                <option value="exp">Export (EXP)</option>
                                <option value="b2c">B2C</option>
                                <option value="b2cl">B2CL</option>
                                <option value="cn">Credit Note (CDNR)</option>
                                <option value="nil">Nil Rated</option>
                              </>
                            )}
                          </select>
                          <button onClick={() => setPortalQueue(prev => prev.filter(item => item.id !== q.id))} className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 hover:bg-rose-100 transition-colors shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 'map' && (
            <div className="max-w-4xl mx-auto space-y-8 silk-reveal pt-4">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <h2 className="text-xl font-extrabold text-slate-900">Reconciliation Mappings</h2>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Set fields mapping</div>
              </div>

              <div className="space-y-8">
                <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
                  <div className="bg-slate-50/80 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{modeTerms.primaryBookLabel} Source</span>
                  </div>
                  <div className="p-2">
                    <ColumnMapper
                      title={`${modeTerms.primaryBookLabel} Mapping`}
                      headers={prHeaders}
                      mapping={prMapping}
                      onChange={setPrMapping}
                      requireTaxable={normalizeMode(mode) === 'output'}
                      labelOverrides={{ supplierName: modeTerms.partyLabel }}
                      onSaveDefault={() => {
                        safeSetItem('np_pr_mapping_template', JSON.stringify(prMapping));
                        toast.success(`${modeTerms.primaryBookLabel} layout saved as default!`);
                      }}
                    />
                  </div>
                </div>

                {journals.map((j, idx) => (
                  <div key={idx} className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
                    <div className="bg-slate-50/80 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
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
                        requireTaxable={normalizeMode(mode) === 'output'}
                        labelOverrides={{ supplierName: modeTerms.partyLabel }}
                        onSaveDefault={() => {
                          safeSetItem('np_journal_mapping_template', JSON.stringify(j.mapping));
                          toast.success(`Journal layout saved as default!`);
                        }}
                      />
                    </div>
                  </div>
                ))}

                {twoBFile && (
                  <div className="bg-white border border-indigo-200/80 rounded-2xl shadow-xs overflow-hidden">
                    <div className="bg-indigo-50/60 border-b border-indigo-200/60 px-4 py-2.5 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{modeTerms.govtLabel} Source</span>
                    </div>
                    <div className="p-2">
                      <ColumnMapper
                        title={`${modeTerms.govtLabel} Mapping`}
                        headers={twoBHeaders}
                        mapping={twoBMapping}
                        onChange={setTwoBMapping}
                        requireTaxable={false}
                        labelOverrides={{ supplierName: modeTerms.partyLabel, filingStatus: 'Filing Period (optional)' }}
                        onSaveDefault={() => {
                          safeSetItem('np_twob_mapping_template', JSON.stringify(twoBMapping));
                          toast.success(`${modeTerms.govtLabel} layout saved as default!`);
                        }}
                      />
                    </div>
                  </div>
                )}

                {prCnFile && (
                  <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
                    <div className="bg-slate-50/80 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between"><span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{modeTerms.primaryShort} Credit Notes</span></div>
                    <div className="p-2">
                      <ColumnMapper
                        title={`${modeTerms.primaryShort} Credit Notes`}
                        headers={prCnHeaders}
                        mapping={prCnMapping}
                        onChange={setPrCnMapping}
                        requireTaxable={false}
                        onSaveDefault={() => {
                          safeSetItem('np_prcn_mapping_template', JSON.stringify(prCnMapping));
                          toast.success(`${modeTerms.primaryShort} Credit Notes layout saved as default!`);
                        }}
                      />
                    </div>
                  </div>
                )}

                {prDnFile && (
                  <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
                    <div className="bg-slate-50/80 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between"><span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{modeTerms.primaryShort} Debit Notes</span></div>
                    <div className="p-2">
                      <ColumnMapper
                        title={`${modeTerms.primaryShort} Debit Notes`}
                        headers={prDnHeaders}
                        mapping={prDnMapping}
                        onChange={setPrDnMapping}
                        requireTaxable={false}
                        onSaveDefault={() => {
                          safeSetItem('np_prdn_mapping_template', JSON.stringify(prDnMapping));
                          toast.success(`${modeTerms.primaryShort} Debit Notes layout saved as default!`);
                        }}
                      />
                    </div>
                  </div>
                )}

                {twoBDnFile && (
                  <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
                    <div className="bg-slate-50/80 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between"><span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{modeTerms.govtShort} Adjustments</span></div>
                    <div className="p-2">
                      <ColumnMapper
                        title={`${modeTerms.govtShort} Adjustments`}
                        headers={twoBDnHeaders}
                        mapping={twoBDnMapping}
                        onChange={setTwoBDnMapping}
                        requireTaxable={false}
                        onSaveDefault={() => {
                          safeSetItem('np_twobdn_mapping_template', JSON.stringify(twoBDnMapping));
                          toast.success(`${modeTerms.govtShort} Adjustments layout saved as default!`);
                        }}
                      />
                    </div>
                  </div>
                )}

              </div>

              {mode === 'output' && (
                Object.keys(portalMappings || {}).length > 0 ? (
                  <div className="mt-8 space-y-6">
                    <div className="flex items-center space-x-3 pb-2 border-b border-slate-200">
                      <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600 shadow-2xs">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest font-mono">GSTR-1 Portal Sheet Mappings</h3>
                    </div>

                    <div className="grid grid-cols-1 gap-6 max-w-4xl">
                      {Object.entries(portalMappings as Record<string, any>).map(([id, pMap]) => {
                        const file = portalQueue.find(q => q.id === id);
                        if (!file) return null;
                        const docTitle = `PORTAL ${pMap.docType.toUpperCase()}`;

                        let vFields: any[] | undefined = undefined;
                        if (pMap.docType === 'b2b') vFields = ['supplierName', 'gstin', 'pos', 'invoiceNo', 'invoiceDate', 'taxableValue', 'igst', 'cgst', 'sgst'];
                        else if (pMap.docType === 'b2cl') vFields = ['pos', 'invoiceNo', 'invoiceDate', 'taxableValue', 'igst'];
                        else if (pMap.docType === 'b2c') vFields = ['returnPeriod', 'pos', 'taxableValue', 'igst', 'cgst', 'sgst'];
                        else if (pMap.docType === 'cn') vFields = ['supplierName', 'gstin', 'invoiceNo', 'invoiceDate', 'taxableValue', 'igst', 'cgst', 'sgst'];
                        else if (pMap.docType === 'nil') vFields = ['returnPeriod', 'nilRated'];

                        return (
                          <div key={id} className="bg-white border border-teal-200/80 rounded-2xl shadow-xs overflow-hidden">
                            <div className="bg-teal-50/60 border-b border-teal-200/60 px-4 py-2.5 flex items-center justify-between">
                              <span className="text-[10px] font-bold text-teal-700 uppercase tracking-widest font-mono">{docTitle}</span>
                            </div>
                            <div className="p-2">
                              <ColumnMapper
                                headers={pMap.headers}
                                mapping={pMap.mapping}
                                onChange={(newMap) => setPortalMappings(prev => ({ ...prev, [id]: { ...prev[id], mapping: newMap } }))}
                                title={file.file.name}
                                requireTaxable={false}
                                visibleFields={vFields}
                                onSaveDefault={() => {
                                  safeSetItem(`np_portal_${pMap.docType}_mapping_template`, JSON.stringify(pMap.mapping));
                                  toast.success(`${docTitle} layout saved as default!`);
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-8 bg-slate-50 border border-slate-200/80 rounded-2xl p-6 text-center space-y-3 shadow-xs">
                    <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 text-teal-600 flex items-center justify-center mx-auto shadow-2xs">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800">No Portal Return Files Configured Yet</h3>
                    <p className="text-xs text-slate-600 max-w-md mx-auto">
                      In Step 1 Source, upload your GSTR-1 files (B2B, B2C, EXP, or Credit Notes) to map columns here.
                    </p>
                    <button
                      type="button"
                      onClick={() => setStep('upload')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Return to Step 1: Upload Source Files
                    </button>
                  </div>
                )
              )}

              {/* Stick actions */}
              <div className="relative bg-white border border-slate-200/80 p-5 rounded-2xl flex items-center justify-between shadow-xs mt-8">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Pipeline status</p>
                  <p className="text-xs font-bold text-emerald-600">All configurations loaded successfully</p>
                </div>
                {processing ? (
                  <div className="w-56 space-y-2">
                    <div className="flex justify-between text-[10px] font-bold text-indigo-600 uppercase tracking-widest font-mono">
                      <span className="animate-pulse">Computing metrics...</span>
                      <span>{progressValue}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      <div className="h-full bg-indigo-600 transition-all duration-300 rounded-full" style={{ width: `${progressValue}%` }} />
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const prValid = isMappingComplete(prMapping, false);
                      const twoBValid = mode === 'input' ? isMappingComplete(twoBMapping, false) : true;
                      const portalValid = mode === 'output'
                        ? (portalMappings && Object.keys(portalMappings).length > 0 && Object.entries(portalMappings as Record<string, any>).every(([_, pMap]) => isMappingComplete(pMap.mapping, false, pMap.docType)))
                        : true;
                      const journalsValid = journals.every((j: any) => isMappingComplete(j.mapping, false));

                      if (!prValid) {
                        toast.warning(`Please map the required columns (Invoice Number, GSTIN) for ${modeTerms.primaryBookLabel}.`);
                        return;
                      }
                      if (!twoBValid) {
                        toast.warning('Please map the required columns (Invoice Number, GSTIN) for GSTR-2B.');
                        return;
                      }
                      if (!portalValid) {
                        toast.warning('Please ensure GSTR-1 Portal files are uploaded and required columns mapped.');
                        return;
                      }
                      if (!journalsValid) {
                        toast.warning('Please map all columns for Supplemental Ledgers.');
                        return;
                      }
                      handleReconcile();
                    }}
                    className="h-11 px-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs uppercase tracking-widest font-bold gap-2 flex items-center transition-all shadow-xs cursor-pointer"
                  >
                    <span>Execute Match Engine</span>
                    <Sparkles className="w-4 h-4" />
                  </button>
                )}
              </div>

            </div>
          )}

          {step === 'review' && (
            <div className="max-w-5xl mx-auto space-y-8 silk-reveal pt-4">
              {gstIssues && (gstIssues.suggested?.length > 0 || gstIssues.conflicts?.length > 0) ? (
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
            ) : (
              <div className="bg-white border border-slate-200/80 rounded-3xl p-8 shadow-xs text-center space-y-5 max-w-2xl mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-2">
                    Verification Clean · 100% Validated
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">No GSTIN Conflicts or Format Errors</h3>
                  <p className="text-xs text-slate-600 mt-2 max-w-md mx-auto leading-relaxed">
                    All party GSTINs, state codes, and invoice tax structures in your uploaded files have passed validation. There are no pending conflicts requiring manual correction.
                  </p>
                </div>

                {appliedGstins && appliedGstins.length > 0 && (
                  <div className="text-left bg-slate-50 border border-slate-200 rounded-2xl p-4 max-h-48 overflow-y-auto">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 font-mono">
                      Previously Applied Corrections ({appliedGstins.length})
                    </p>
                    <div className="space-y-1.5 text-xs text-slate-700">
                      {appliedGstins.map((item: any, i: number) => (
                        <div key={i} className="flex justify-between items-center py-1 border-b border-slate-100 last:border-0 font-mono text-[11px]">
                          <span className="font-semibold text-slate-800">{item.partyName}</span>
                          <span className="text-emerald-600 font-bold">{item.appliedGstin}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('map')}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
                  >
                    ← Back to Pipeline
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('results');
                      safeSetItem('np_reco_step', 'results');
                    }}
                    className="px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <span>Proceed to 4 Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            </div>
          )}

          {step === 'results' && mode === 'output' && (
            outputResults ? (
              <OutputDashboard
              results={outputResults}
              onDownload={() => {
                const blob = new Blob([outputResults.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = "GSTR1_Reconciliation_Output.xlsx";
                document.body.appendChild(a);
                a.click();
                setTimeout(() => window.URL.revokeObjectURL(url), 60000);
                document.body.removeChild(a);
                toast.success("Detailed Output Report Downloaded!");
              }}
            />
            ) : (
              <div className="bg-white border border-slate-200/80 rounded-3xl p-10 shadow-xs text-center space-y-5 max-w-xl mx-auto my-8">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
                  <GitCompare className="w-8 h-8" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-2">
                    Sales Engine · Standby
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">No Sales Reconciliation Results Yet</h3>
                  <p className="text-xs text-slate-600 mt-2 max-w-md mx-auto leading-relaxed">
                    Upload your Sales Register and GSTR-1 files in Step 1 (Source) and click "Execute Match Engine" in Step 2 (Pipeline), or restore an existing snapshot from Cloud History.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('upload')}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <CloudDownload className="w-4 h-4" /> Go to 1 Source
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsHistoryOpen(true)}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <History className="w-4 h-4 text-purple-600" /> Cloud History
                  </button>
                </div>
              </div>
            )
          )}

          {step === 'results' && mode === 'input' && (
            (results && summary) ? (
              <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, type: 'spring', bounce: 0.2 }}
              className="space-y-10 silk-reveal pt-4 max-w-6xl mx-auto w-full"
            >
              <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 pb-6 border-b border-slate-200">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Audit Complete
                  </div>
                  <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{companyName || 'Reconciliation Summary'}</h2>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-mono">MATCH REPORT GENERATED</p>
                </div>

                <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
                  {lastSavedRun && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Saved {lastSavedRun}
                    </span>
                  )}
                  <button
                    onClick={handleSaveReconciliationRun}
                    disabled={isSavingRun}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    title="Save current reconciliation session to SQLite database with vendor disputes"
                  >
                    <HardDrive className="w-3.5 h-3.5" /> {isSavingRun ? 'Saving...' : 'Save Reco Run'}
                  </button>
                  <button
                    onClick={() => setIsHistoryOpen(true)}
                    className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-2xs transition-all cursor-pointer"
                    title="View & restore past reconciliation snapshots (SQLite DB, Local PC & Cloud)"
                  >
                    <History className="w-3.5 h-3.5 text-purple-600" /> Saved Reco History
                  </button>
                  <button
                    onClick={handleSaveToDrive}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                    title="Save current reconciliation snapshot directly to Google Drive"
                  >
                    <UploadCloud className="w-3.5 h-3.5" /> Save to Drive
                  </button>
                  <button onClick={handleExportMonthly} className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-2xs transition-all">
                    <CloudDownload className="w-3.5 h-3.5 text-indigo-600" /> Monthly
                  </button>
                  <button onClick={handleExportMonthlyDiff} className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-2xs transition-all">
                    <CloudDownload className="w-3.5 h-3.5 text-amber-600" /> Diff Sheets
                  </button>
                  <button onClick={handleExportParty} className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-2xs transition-all">
                    <CloudDownload className="w-3.5 h-3.5 text-blue-600" /> Party-Wise
                  </button>
                  <button onClick={handleExportDebitNotes} className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-2xs transition-all" title="Download 5-Sheet Reconciled Debit Notes (GSTR-2B vs Books) Report">
                    <Receipt className="w-3.5 h-3.5 text-orange-600" /> Debit Notes
                  </button>
                </div>
              </div>

              {/* Summary card grids */}
              <SummaryCards summary={summary} />

              {/* Detailed results tabs */}
              <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
                <div className="bg-slate-50/80 flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></div>
                    <span className="text-[11px] font-bold text-slate-800 uppercase tracking-widest font-mono">Reconciliation Audit Ledger</span>
                  </div>
                  <button
                    onClick={() => setAuditLedgerCollapsed(!auditLedgerCollapsed)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-all border bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-2xs"
                    title={auditLedgerCollapsed ? "Expand Audit Ledger" : "Collapse Audit Ledger"}
                  >
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-300", auditLedgerCollapsed && "rotate-180")} />
                    {auditLedgerCollapsed ? "Expand" : "Collapse"}
                  </button>
                </div>
                {!auditLedgerCollapsed && (
                  <div className="p-3">
                    <ResultsCategoryTabs results={results} summary={summary} companyName={companyName} mode={mode} debitNotes={parsedDebitNotes} />
                  </div>
                )}
              </div>

              {/* Breakdown sections - Full Width for Party-wise Intelligence & Monthly Suite */}
              <div className="space-y-6">
                <div className="w-full min-w-0">
                  <PartyWiseReport
                    results={results}
                    companyName={companyName}
                    mode={mode}
                    debitNotes={parsedDebitNotes}
                    partyDisputes={partyDisputes}
                    onPartyDisputesChange={setPartyDisputes}
                    onResultsChange={(newRes) => {
                      setResults(newRes);
                      setSummary(getSummary(newRes));
                      safeSetItem('np_reco_results', JSON.stringify(newRes));
                    }}
                  />
                </div>
                <div className="w-full min-w-0">
                  <MonthlyBreakdown results={results} debitNotes={parsedDebitNotes} companyName={companyName} gstr3bData={gstr3bData} />
                </div>
              </div>

              {/* Mini stats cards footer */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-indigo-300 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-600 shadow-2xs"><ShieldCheck className="w-5 h-5" /></div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Perfect Matches</p>
                      <p className="text-2xl font-black font-mono text-slate-900 mt-0.5">{summary.perfectMatch.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                </div>
                <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-rose-300 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-600 shadow-2xs"><Plus className="w-5 h-5 transform rotate-45" /></div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Value Mismatches</p>
                      <p className="text-2xl font-black font-mono text-slate-900 mt-0.5">{summary.valueMismatch.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                </div>
                <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-emerald-300 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 shadow-2xs"><CheckCircle2 className="w-5 h-5" /></div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Accuracy Ratio</p>
                      <p className="text-2xl font-black font-mono text-slate-900 mt-0.5">{summary.total > 0 ? ((summary.perfectMatch / summary.total) * 100).toFixed(1) : '0.0'}%</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
            ) : (
              <div className="bg-white border border-slate-200/80 rounded-3xl p-10 shadow-xs text-center space-y-5 max-w-xl mx-auto my-8">
                <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
                  <GitCompare className="w-8 h-8" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold uppercase tracking-wider mb-2">
                    Purchase Engine · Standby
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">No Purchase Reconciliation Results Yet</h3>
                  <p className="text-xs text-slate-600 mt-2 max-w-md mx-auto leading-relaxed">
                    Upload your Purchase Register and GSTR-2B in Step 1 (Source) and execute the match engine in Step 2 (Pipeline), or load a saved session from Cloud History.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('upload')}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <CloudDownload className="w-4 h-4" /> Go to 1 Source
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsHistoryOpen(true)}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <History className="w-4 h-4 text-purple-600" /> Cloud History
                  </button>
                </div>
              </div>
            )
          )}

        </div>
      )}

      {/* Google Drive Connection & Settings Modal */}
      <GDriveConnectModal
        isOpen={isGDriveConnectOpen}
        onClose={() => setIsGDriveConnectOpen(false)}
        onConnected={() => setIsHistoryOpen(true)}
      />

      {/* Cloud & SQLite History Restorer Modal */}
      <RecoHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onRestoreSession={handleRestoreSession}
        onOpenConnectModal={() => setIsGDriveConnectOpen(true)}
        clientGstin={getRecoClientGstin()}
        fy={getRecoFy()}
      />

    </div>
  );
}