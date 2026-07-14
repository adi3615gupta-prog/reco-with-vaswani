import React from 'react';
import {
  ArrowRight, FileSpreadsheet, CheckCircle2, ShieldCheck, Plus,
  RotateCcw, CloudDownload, ChevronRight, GitCompare, Database,
  Server, Settings, Activity, X, Star, Sparkles, Building2, Lightbulb
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
import { cn, safeSetItem } from '../lib/utils';
import { toast } from 'sonner';
import { TERMS } from '../lib/mode';
import { motion } from 'framer-motion';

type Step = 'upload' | 'map' | 'review' | 'results';

export default function Reconciliation(props: any) {
  const [showQuickGuide, setShowQuickGuide] = React.useState(false);
  const {
    setAppRoute, mode, setMode, step, setStep, companyName, setCompanyName,
    tolerance, setTolerance, fuzzyStrictness, setFuzzyStrictness,
    processing, progressValue, results, setResults, summary, setSummary, parsedDebitNotes, gstr3bData,
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
    handleExportParty,
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

  return (
    <div className="w-full silk-reveal">


      {/* Hub Navigation Bridge */}
      <button
        onClick={() => { setAppRoute('hub'); setMode(null); }}
        className="text-slate-400 hover:text-white flex items-center gap-2 font-bold uppercase tracking-wider text-[10px] mb-6 transition-colors"
      >
        <ArrowRight className="w-3 h-3 transform rotate-180" /> Back to Hub
      </button>

      {/* Collapsible Quick Guide */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 text-slate-300 backdrop-blur-md shadow-lg max-w-6xl mb-8">
        <button
          onClick={() => setShowQuickGuide(!showQuickGuide)}
          className="flex items-center justify-between w-full text-slate-300 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
            <Lightbulb className="w-4 h-4 text-yellow-400" />
            Quick GST Reconciliation User Guide
          </span>
          <span className="text-xs text-blue-400 font-bold hover:underline">{showQuickGuide ? 'Hide' : 'Show Instructions'}</span>
        </button>
        {showQuickGuide && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 text-xs text-slate-400 space-y-4 animate-in fade-in slide-in-from-top-1 duration-350">
            <p><strong>Overview:</strong> Flawlessly audit your company accounting books against government filings (GSTR-2B or GSTR-1) to claim maximum Input Tax Credit (ITC) or verify sales liability.</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="font-bold text-slate-300 mb-1.5">Step-by-step Steps:</p>
                <ol className="space-y-1.5 pl-4 list-decimal">
                  <li><strong>Select Mode:</strong> Choose "Input Tax Credit" (PR vs 2B) or "Output Tax Liability" (SR vs GSTR-1).</li>
                  <li><strong>Drop Files:</strong> Upload your Books Register and Government Portal sheets. Select role names (Primary, Journal, etc.).</li>
                  <li><strong>Map Fields:</strong> Map document columns to core fields (CGST, SGST, GSTIN, Invoice number, Date).</li>
                  <li><strong>Audit & Export:</strong> Correct wrong GSTIN conflicts on-screen, then download summary reports or party-wise comparisons.</li>
                </ol>
              </div>
              <div>
                <p className="font-bold text-slate-300 mb-1.5">Settings & Tips:</p>
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
            <>
              <div className="w-full max-w-[85rem] mx-auto pt-4 pb-12 silk-reveal relative z-10">

                <div className="mb-4 text-center md:text-left md:px-4">
                  <div className="text-xs text-white/50 mb-2 tracking-widest uppercase font-semibold">// Pipeline Initialization</div>
                  <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white mb-2">
                    Data streams synchronized
                  </h2>
                  <p className="text-slate-600 dark:text-white/60 max-w-2xl text-xs font-medium">
                    Venture past standard compliance. Connect your internal books and government portal downloads to execute flawless, automated reconciliations.
                  </p>
                </div>

                {/* SESSION CONFIG TOP BAR */}
                <div className="w-full bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 rounded-2xl p-4 mb-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-4">
                  <div className="flex items-center gap-3 shrink-0 px-2">
                    <div className="w-10 h-10 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                      <Settings className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] text-slate-500 dark:text-white/50 uppercase tracking-widest font-bold">Session Configuration</p>
                      <p className="text-sm text-slate-900 dark:text-white font-bold leading-none mt-0.5">Audit Parameters</p>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col sm:flex-row items-center gap-4 w-full md:max-w-2xl px-2">
                    <div className="relative group flex-1 w-full">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-white/50 group-focus-within:text-purple-500 dark:group-focus-within:text-purple-400 transition-colors" />
                      <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Organization Name..." className="w-full h-10 bg-white dark:bg-black/40 border border-slate-300 dark:border-white/10 rounded-xl pl-9 pr-4 text-sm text-slate-900 dark:text-white outline-none focus:border-purple-500 transition-all placeholder:text-slate-400 dark:placeholder:text-white/30" />
                    </div>
                    <div className="relative group w-full sm:w-36 shrink-0">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 dark:text-white/40 group-focus-within:text-purple-500 dark:group-focus-within:text-purple-400 transition-colors">â‚¹</div>
                      <input type="number" min="0" step="0.5" value={tolerance} onChange={(e) => setTolerance(parseFloat(e.target.value) || 0)} className="w-full h-10 bg-white dark:bg-black/40 border border-slate-300 dark:border-white/10 rounded-xl pl-7 pr-3 text-sm font-mono text-slate-900 dark:text-white outline-none focus:border-purple-500 transition-all" title="Match Tolerance" />
                    </div>
                    <button
                      onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                      className="w-10 h-10 shrink-0 rounded-xl bg-slate-800/50 border border-white/10 hover:border-purple-500/50 flex items-center justify-center transition-all"
                      title="Advanced Matching Rules"
                    >
                      <Settings className={`w-4 h-4 text-slate-400 transition-transform ${showAdvancedOptions ? 'rotate-90 text-purple-400' : ''}`} />
                    </button>
                  </div>

                  <button
                    onClick={handlePreparePipeline}
                    disabled={isPreparingPipeline || !booksQueue.some(q => q.docType === 'primary') || (mode === 'input' ? !portalQueue.some(q => q.docType === 'primary') : !portalQueue.some(q => !!q.docType))}
                    className="h-10 px-8 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:hover:scale-100 text-slate-950 rounded-xl text-xs uppercase tracking-widest font-black flex items-center justify-center gap-2 transition-all duration-300 shadow-[0_0_20px_rgba(52,211,153,0.3)] hover:scale-105 shrink-0"
                  >
                    {isPreparingPipeline ? <Activity className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    Next Step
                  </button>
                </div>

                {/* ADVANCED FUZZY MATCHING SETTINGS */}
                {showAdvancedOptions && (
                  <div className="w-full bg-slate-900/40 border border-purple-500/30 rounded-2xl p-5 mb-6 shadow-inner animate-in fade-in slide-in-from-top-2">
                    <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-4 flex items-center gap-2"><GitCompare className="w-4 h-4" /> Fuzzy Matching Rules</h4>
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Algorithm Strictness</label>
                        <div className="flex gap-2">
                          {(['high', 'medium', 'low'] as const).map(level => (
                            <button key={level} onClick={() => setFuzzyStrictness(level)} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${fuzzyStrictness === level ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-black/20 border-white/5 text-slate-500 hover:border-white/20'}`}>
                              {level}
                            </button>
                          ))}
                        </div>
                        <p className="text-[9px] text-slate-500 mt-2">
                          {fuzzyStrictness === 'high' ? 'Exact matching only. No suffix ignorance.' : fuzzyStrictness === 'medium' ? 'Ignores "Pvt Ltd", "LLP", "Inc" suffixes.' : 'Aggressive matching. Extracts root words and ignores spacing/vowels.'}
                        </p>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Invoice Number Rules</label>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" checked={ignoreSpecialChars} onChange={(e) => setIgnoreSpecialChars(e.target.checked)} className="w-4 h-4 rounded bg-black/40 border-white/10 text-purple-500 focus:ring-purple-500 focus:ring-offset-slate-900" />
                          <span className="text-sm text-slate-300 font-medium">Strip special characters (- / \ _)</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" defaultChecked className="w-4 h-4 rounded bg-black/40 border-white/10 text-purple-500 focus:ring-purple-500 focus:ring-offset-slate-900" />
                          <span className="text-sm text-slate-300 font-medium">Ignore leading zeros (00123 → 123)</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2-COLUMN UPLOAD & MAP QUEUES */}
                <div className="grid lg:grid-cols-2 gap-6 pb-12">

                  {/* COL 1: Books */}
                  <div className="liquid-glass rounded-[1.5rem] p-5 flex flex-col gap-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl liquid-glass flex items-center justify-center">
                        <Database className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Internal Books</h3>
                        <p className="text-[11px] text-slate-500 dark:text-white/50 uppercase tracking-widest font-semibold">Primary Source</p>
                      </div>
                    </div>

                    {/* Dropzone */}
                    <label
                      onDragOver={handleBooksDragOver}
                      onDragLeave={handleBooksDragLeave}
                      onDrop={handleBooksDrop}
                      className={cn(
                        "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300 group",
                        booksDrag ? "border-emerald-400 bg-emerald-500/10 scale-[1.02]" : "border-white/10 hover:border-emerald-500/40 bg-black/20 hover:bg-emerald-500/5"
                      )}
                    >
                      <div className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-colors", booksDrag ? "bg-emerald-500/20" : "bg-white/5 group-hover:bg-emerald-500/10")}>
                        <CloudDownload className={cn("w-6 h-6 transition-colors", booksDrag ? "text-emerald-400" : "text-white/40 group-hover:text-emerald-400")} />
                      </div>
                      <span className="text-sm font-bold text-white/60 group-hover:text-white transition-colors">Drop multiple files or click to browse</span>
                      <input type="file" multiple accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => {
                        if (e.target.files) {
                          const newFiles = Array.from(e.target.files).map(f => ({ id: Math.random().toString(36).substring(2), file: f, docType: '' }));
                          setBooksQueue(prev => [...prev, ...newFiles]);
                          e.target.value = '';
                        }
                      }} />
                    </label>

                    {/* File Queue */}
                    <div className="space-y-2 mt-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                      {booksQueue.map(q => (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={q.id} className="bg-slate-900/60 border border-white/10 p-3 rounded-xl flex items-center gap-3 hover:border-emerald-500/30 transition-colors">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span className="text-xs font-medium text-white/90 flex-1 truncate" title={q.file.name}>{q.file.name}</span>
                          <select value={q.docType} onChange={e => {
                            setBooksQueue(prev => prev.map(item => item.id === q.id ? { ...item, docType: e.target.value } : item));
                          }} className="bg-black border border-white/10 text-xs text-white rounded-lg px-2 py-1.5 outline-none focus:border-emerald-500 w-[140px] shrink-0 cursor-pointer">
                            <option value="">Assign Role...</option>
                            <option value="primary">{TERMS[mode].primaryBookLabel}</option>
                            {mode === 'output' && <option value="credit_note">Credit Notes</option>}
                            {mode === 'input' && <option value="debit_note">Debit Notes</option>}
                            <option value="journal">Sub-Ledger / Journal</option>
                          </select>
                          <button onClick={() => setBooksQueue(prev => prev.filter(item => item.id !== q.id))} className="w-7 h-7 rounded bg-rose-500/10 flex items-center justify-center text-rose-400 hover:bg-rose-500 hover:text-white transition-colors shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* COL 2: Portal */}
                  <div className="liquid-glass rounded-[1.5rem] p-5 flex flex-col gap-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl liquid-glass flex items-center justify-center">
                        <Server className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black tracking-tight text-white">Government Portal</h3>
                        <p className="text-[11px] text-white/50 uppercase tracking-widest font-semibold">Compliance Target</p>
                      </div>
                    </div>

                    {/* Dropzone */}
                    <label
                      onDragOver={handlePortalDragOver}
                      onDragLeave={handlePortalDragLeave}
                      onDrop={handlePortalDrop}
                      className={cn(
                        "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300 group",
                        portalDrag ? "border-blue-400 bg-blue-500/10 scale-[1.02]" : "border-white/10 hover:border-blue-500/40 bg-black/20 hover:bg-blue-500/5"
                      )}
                    >
                      <div className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-colors", portalDrag ? "bg-blue-500/20" : "bg-white/5 group-hover:bg-blue-500/10")}>
                        <CloudDownload className={cn("w-6 h-6 transition-colors", portalDrag ? "text-blue-400" : "text-white/40 group-hover:text-blue-400")} />
                      </div>
                      <span className="text-sm font-bold text-white/60 group-hover:text-white transition-colors">Drop multiple files or click to browse</span>
                      <input type="file" multiple accept=".csv,.xlsx,.xls,.json" className="hidden" onChange={(e) => {
                        if (e.target.files) {
                          const newFiles = Array.from(e.target.files).map(f => ({ id: Math.random().toString(36).substring(2), file: f, docType: '' }));
                          setPortalQueue(prev => [...prev, ...newFiles]);
                          e.target.value = '';
                        }
                      }} />
                    </label>

                    {/* File Queue */}
                    <div className="space-y-2 mt-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                      {portalQueue.map(q => (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={q.id} className="bg-slate-900/60 border border-white/10 p-3 rounded-xl flex items-center gap-3 hover:border-blue-500/30 transition-colors">
                          <FileSpreadsheet className="w-4 h-4 text-blue-400 shrink-0" />
                          <span className="text-xs font-medium text-white/90 flex-1 truncate" title={q.file.name}>{q.file.name}</span>
                          <select value={q.docType} onChange={e => {
                            setPortalQueue(prev => prev.map(item => item.id === q.id ? { ...item, docType: e.target.value } : item));
                          }} className="bg-black border border-white/10 text-xs text-white rounded-lg px-2 py-1.5 outline-none focus:border-blue-500 w-[140px] shrink-0 cursor-pointer">
                            <option value="">Assign Role...</option>
                            {mode === 'input' ? (
                              <>
                                <option value="primary">{TERMS[mode].govtLabel}</option>
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
                          <button onClick={() => setPortalQueue(prev => prev.filter(item => item.id !== q.id))} className="w-7 h-7 rounded bg-rose-500/10 flex items-center justify-center text-rose-400 hover:bg-rose-500 hover:text-white transition-colors shrink-0">
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
                      onSaveDefault={() => {
                        safeSetItem('np_pr_mapping_template', JSON.stringify(prMapping));
                        toast.success(`${TERMS[mode].primaryBookLabel} layout saved as default!`);
                      }}
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
                        onSaveDefault={() => {
                          safeSetItem('np_journal_mapping_template', JSON.stringify(j.mapping));
                          toast.success(`Journal layout saved as default!`);
                        }}
                      />
                    </div>
                  </div>
                ))}

                {twoBFile && (
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
                        requireTaxable={false}
                        labelOverrides={{ supplierName: TERMS[mode].partyLabel, filingStatus: 'Filing Period (optional)' }}
                        onSaveDefault={() => {
                          safeSetItem('np_twob_mapping_template', JSON.stringify(twoBMapping));
                          toast.success(`${TERMS[mode].govtLabel} layout saved as default!`);
                        }}
                      />
                    </div>
                  </div>
                )}

                {prCnFile && (
                  <div className="dash-card">
                    <div className="dash-topbar"><span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{TERMS[mode].primaryShort} Credit Notes</span></div>
                    <div className="p-2">
                      <ColumnMapper
                        title={`${TERMS[mode].primaryShort} Credit Notes`}
                        headers={prCnHeaders}
                        mapping={prCnMapping}
                        onChange={setPrCnMapping}
                        requireTaxable={false}
                        onSaveDefault={() => {
                          safeSetItem('np_prcn_mapping_template', JSON.stringify(prCnMapping));
                          toast.success(`${TERMS[mode].primaryShort} Credit Notes layout saved as default!`);
                        }}
                      />
                    </div>
                  </div>
                )}

                {prDnFile && (
                  <div className="dash-card">
                    <div className="dash-topbar"><span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{TERMS[mode].primaryShort} Debit Notes</span></div>
                    <div className="p-2">
                      <ColumnMapper
                        title={`${TERMS[mode].primaryShort} Debit Notes`}
                        headers={prDnHeaders}
                        mapping={prDnMapping}
                        onChange={setPrDnMapping}
                        requireTaxable={false}
                        onSaveDefault={() => {
                          safeSetItem('np_prdn_mapping_template', JSON.stringify(prDnMapping));
                          toast.success(`${TERMS[mode].primaryShort} Debit Notes layout saved as default!`);
                        }}
                      />
                    </div>
                  </div>
                )}

                {twoBDnFile && (
                  <div className="dash-card">
                    <div className="dash-topbar"><span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{TERMS[mode].govtShort} Adjustments</span></div>
                    <div className="p-2">
                      <ColumnMapper
                        title={`${TERMS[mode].govtShort} Adjustments`}
                        headers={twoBDnHeaders}
                        mapping={twoBDnMapping}
                        onChange={setTwoBDnMapping}
                        requireTaxable={false}
                        onSaveDefault={() => {
                          safeSetItem('np_twobdn_mapping_template', JSON.stringify(twoBDnMapping));
                          toast.success(`${TERMS[mode].govtShort} Adjustments layout saved as default!`);
                        }}
                      />
                    </div>
                  </div>
                )}

              </div>

              {mode === 'output' && Object.keys(portalMappings).length > 0 && (
                <div className="mt-8 space-y-6">
                  <div className="flex items-center space-x-3 pb-2 border-b border-slate-800">
                    <div className="w-6 h-6 rounded-md bg-teal-500/20 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h3 className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">Portal Sheet Mappings</h3>
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
                        <div key={id} className="dash-card border-teal-500/20">
                          <div className="dash-topbar bg-teal-900/10">
                            <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest">{docTitle}</span>
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
              )}

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
                      <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progressValue}%` }} />
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleReconcile}
                    disabled={!isMappingComplete(prMapping, mode === 'output') || (mode === 'input' && !isMappingComplete(twoBMapping, false)) || (mode === 'output' && !!twoBFile && !isMappingComplete(twoBMapping, false)) || journals.some((j) => !isMappingComplete(j.mapping, mode === 'output'))}
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

          {step === 'results' && mode === 'output' && outputResults && (
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
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                toast.success("Detailed Output Report Downloaded!");
              }}
            />
          )}

          {step === 'results' && mode === 'input' && results && summary && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, type: 'spring', bounce: 0.2 }}
              className="space-y-10 silk-reveal pt-4 max-w-6xl mx-auto w-full"
            >
              <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 pb-6 border-b border-slate-800">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" /> Audit Complete
                  </div>
                  <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">{companyName || 'Reconciliation Summary'}</h2>
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
                  <div className="dash-dots"><span style={{ background: '#4A9EE8' }}></span><span style={{ background: '#7EC8F0' }}></span></div>
                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Reconciliation Audit Ledger</span>
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                </div>
                <div className="p-1">
                  <ResultsCategoryTabs results={results} summary={summary} companyName={companyName} mode={mode} debitNotes={parsedDebitNotes} />
                </div>
              </div>

              {/* Breakdown grids */}
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 min-w-0">
                  <PartyWiseReport results={results} companyName={companyName} mode={mode} debitNotes={parsedDebitNotes} />
                </div>
                <div className="min-w-0">
                  <MonthlyBreakdown results={results} debitNotes={parsedDebitNotes} companyName={companyName} gstr3bData={gstr3bData} />
                </div>
              </div>

              {/* Mini stats cards footer */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500/20 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400"><ShieldCheck className="w-5 h-5" /></div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Perfect Matches</p>
                      <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{summary.perfectMatch}</p>
                    </div>
                  </div>
                </div>
                <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 hover:border-rose-500 dark:hover:border-rose-500/20 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400"><Plus className="w-5 h-5 transform rotate-45" /></div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Value Mismatches</p>
                      <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{summary.valueMismatch}</p>
                    </div>
                  </div>
                </div>
                <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500/20 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400"><ArrowRight className="w-5 h-5" /></div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Accuracy Ratio</p>
                      <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{summary.total > 0 ? ((summary.perfectMatch / summary.total) * 100).toFixed(1) : '0.0'}%</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        </div>
      )}

    </div>
  );
}