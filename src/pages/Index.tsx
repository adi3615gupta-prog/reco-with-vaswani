import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ShieldCheck, ArrowRight, Plus, Sparkles, Building2, FileSpreadsheet, RotateCcw, CloudDownload, Settings } from 'lucide-react';
import { toast } from 'sonner';
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
import { TERMS, type ReconciliationMode } from '@/lib/mode';
import { parseFile, detectColumnMapping, mapToRecords, type ColumnMapping, type DebitNoteRecord, exportMonthlyComparison, exportPartyWise, type MonthlyComparisonRow } from '@/lib/fileParser';
import { reconcile, getSummary, type ReconciliationResult, type ReconciliationSummary } from '@/lib/reconciliation';
import { aggregateByParty } from '@/lib/partyWise';
import { cn } from '@/lib/utils';

type Step = 'upload' | 'map' | 'results';

export default function Index() {
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

      electronAPI.onDownloadProgress((progressObj: any) => {
        if (progressObj?.percent != null) {
          setCheckingUpdates(true);
        }
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

  const [mode, setMode] = useState<ReconciliationMode | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [processing, setProcessing] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [companyName, setCompanyName] = useState<string>('');
  const [tolerance, setTolerance] = useState<number>(2);

  const [prFile, setPrFile] = useState<File | null>(null);
  const [twoBFile, setTwoBFile] = useState<File | null>(null);
  const [journals, setJournals] = useState<{ file: File; mapping: Partial<ColumnMapping>; headers: string[] }[]>([]);
  
  const [prDnFile, setPrDnFile] = useState<File | null>(null);
  const [twoBDnFile, setTwoBDnFile] = useState<File | null>(null);
  const [prDnHeaders, setPrDnHeaders] = useState<string[]>([]);
  const [twoBDnHeaders, setTwoBDnHeaders] = useState<string[]>([]);
  const [prDnMapping, setPrDnMapping] = useState<Partial<ColumnMapping>>({});
  const [twoBDnMapping, setTwoBDnMapping] = useState<Partial<ColumnMapping>>({});
  const [parsedDebitNotes, setParsedDebitNotes] = useState<{ pr: DebitNoteRecord[]; twoB: DebitNoteRecord[] }>({ pr: [], twoB: [] });

  const [prHeaders, setPrHeaders] = useState<string[]>([]);
  const [twoBHeaders, setTwoBHeaders] = useState<string[]>([]);

  const [prMapping, setPrMapping] = useState<Partial<ColumnMapping>>({});
  const [twoBMapping, setTwoBMapping] = useState<Partial<ColumnMapping>>({});

  const [results, setResults] = useState<ReconciliationResult[] | null>(null);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [updateVersion, setUpdateVersion] = useState('');
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  const handleReset = (full = false) => {
    if (full) setMode(null);
    setStep('upload');
    setPrFile(null);
    setTwoBFile(null);
    setJournals([]);
    setResults(null);
    setSummary(null);
    setPrMapping({});
    setTwoBMapping({});
    setPrDnFile(null);
    setTwoBDnFile(null);
    setPrDnMapping({});
    setTwoBDnMapping({});
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
      setProgressValue(100);
      await new Promise((r) => setTimeout(r, 200));

      setStep('results');
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

  if (!mode) {
    return (
      <div className="dark min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[var(--np-bg)]">
        {/* ANIMATED BACKGROUND */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-[var(--np-sky)]/10 rounded-full blur-3xl opacity-20 animate-pulse"></div>
          <div className="absolute bottom-20 right-1/4 w-80 h-80 bg-[var(--np-green)]/10 rounded-full blur-3xl opacity-20 animate-pulse" style={{animationDelay: '1s'}}></div>
        </div>
        <ModeSelector onSelect={setMode} />
      </div>
    );
  }

  const term = TERMS[mode];
  const requireTaxable = mode === 'output';

  return (
    <div className="min-h-screen bg-[var(--np-bg)] transition-colors duration-500 pt-24 pb-12">
      {/* GLASSY NAV */}
      <nav className="fixed top-9 left-0 right-0 z-50 h-16 border-b border-[var(--np-border)] bg-[var(--np-bg2)]/60 backdrop-blur-xl transition-all duration-300">
        <div className="container mx-auto h-full px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-lg bg-[var(--np-bg3)] border border-[var(--np-border2)] flex items-center justify-center overflow-hidden transition-all duration-300 group-hover:border-[var(--np-sky)] group-hover:shadow-[0_0_15px_rgba(74,158,232,0.3)]">
              <img 
                src="./icon.png" 
                alt="Logo" 
                className="w-7 h-7 object-contain" 
                onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
              />
              <ShieldCheck className="w-5 h-5 hidden text-[var(--np-sky)]" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-[var(--np-text)] leading-tight">NovaPay Reco</h1>
              <p className="text-[10px] text-[var(--np-text3)] uppercase tracking-[0.2em] font-medium leading-none mt-0.5">{mode === 'input' ? 'Purchase Engine' : 'Sales Engine'}</p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-1.5 p-1 rounded-full bg-[var(--np-bg3)]/50 border border-[var(--np-border)]">
            {(['upload', 'map', 'results'] as Step[]).map((s, idx) => {
              const labels = ['Source', 'Pipeline', 'Dashboard'];
              const isActive = s === step;
              const isDone = (['upload', 'map', 'results'].indexOf(step)) > idx;
              return (
                <button
                  key={s}
                  onClick={() => isDone && setStep(s)}
                  className={cn(
                    'px-5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-300',
                    isActive ? 'bg-[var(--np-sky)] text-white shadow-lg shadow-[var(--np-sky)]/20 scale-[1.05]' :
                    isDone ? 'text-[var(--np-green)] hover:bg-[var(--np-green)]/10' : 'text-[var(--np-text3)] cursor-not-allowed opacity-50'
                  )}
                >
                  <span className="mr-2 opacity-50">{idx + 1}</span> {labels[idx]}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => handleReset(false)} className="btn-np-outline !px-4 !py-1.5 text-[11px] uppercase tracking-wider flex items-center gap-2">
              <RotateCcw className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Reset</span>
            </button>
            <ModeSwitcher currentMode={mode} onSwitch={() => handleReset(true)} />
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-6 relative">
        {step === 'upload' && (
          <div className="space-y-16 silk-reveal pt-8">
            {/* ENHANCED HERO SECTION */}
            <div className="max-w-4xl mx-auto mb-20">
              <div className="rounded-3xl border border-[var(--np-border)] bg-[var(--np-bg2)] p-10 shadow-[0_24px_80px_rgba(0,0,0,0.16)]">
                <div className="text-center space-y-6">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--np-bg3)] border border-[var(--np-border)] text-[var(--np-text2)] text-[11px] font-semibold uppercase tracking-[0.2em]">
                    Professional reconciliation, built for finance teams
                  </div>
                  <h1 className="text-5xl lg:text-6xl font-bold tracking-tight text-[var(--np-text)]">
                    Enterprise-grade reconciliation with clarity and control
                  </h1>
                  <p className="text-base text-[var(--np-text2)] max-w-2xl mx-auto leading-relaxed">
                    {term.subtitle}. Upload data, validate mappings, and review a refined reconciliation dashboard with executive-ready insight.
                  </p>
                </div>
              </div>
            </div>

            {/* MAIN GRID LAYOUT */}
            <div className="grid lg:grid-cols-3 gap-8">
              {/* LEFT COLUMN: CONFIGURATION */}
              <div className="lg:col-span-1 space-y-6">
                {/* CONFIG CARD */}
                <div className="dash-card sticky top-32 shadow-2xl hover:shadow-[var(--np-sky)]/20 transition-shadow duration-300">
                  <div className="dash-topbar">
                    <div className="dash-dots"><span style={{background:'#E85A5A'}}></span><span style={{background:'#F0A030'}}></span><span style={{background:'#3DCC8E'}}></span></div>
                    <span className="text-[10px] font-bold text-[var(--np-text2)] uppercase tracking-widest">Configuration</span>
                    <Settings className="w-3.5 h-3.5 text-[var(--np-sky)]" />
                  </div>
                  <div className="p-6 space-y-6">
                    <div>
                      <label className="text-[11px] font-bold text-[var(--np-text3)] uppercase tracking-widest mb-3 block">Company Name</label>
                      <div className="relative group">
                        <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--np-text3)] group-focus-within:text-[var(--np-sky)] transition-colors" />
                        <input
                          type="text"
                          placeholder="Organization name"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          className="w-full h-12 bg-[var(--np-bg3)] border border-[var(--np-border2)] rounded-lg pl-11 pr-4 text-sm text-[var(--np-text)] focus:outline-none focus:border-[var(--np-sky)] focus:ring-1 focus:ring-[var(--np-sky)]/30 transition-all"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-[var(--np-text3)] uppercase tracking-widest mb-3 block">Tolerance</label>
                      <div className="relative group">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--np-text3)] group-focus-within:text-[var(--np-sky)] transition-colors">₹</div>
                        <input
                          type="number"
                          min="0" step="0.5"
                          value={tolerance}
                          onChange={(e) => setTolerance(parseFloat(e.target.value) || 0)}
                          className="w-full h-12 bg-[var(--np-bg3)] border border-[var(--np-border2)] rounded-lg pl-11 pr-4 text-sm text-[var(--np-text)] focus:outline-none focus:border-[var(--np-sky)] focus:ring-1 focus:ring-[var(--np-sky)]/30 transition-all"
                        />
                      </div>
                      <p className="text-[10px] text-[var(--np-text3)] mt-2">Tolerance in ₹</p>
                    </div>

                    <div className="pt-4 border-t border-[var(--np-border)]">
                      <div className="flex items-center justify-between mb-4">
                        <label className="text-[11px] font-bold text-[var(--np-text3)] uppercase tracking-widest">Secondary Journals</label>
                        <label className="cursor-pointer text-[10px] font-bold text-[var(--np-sky)] hover:text-[var(--np-sky2)] transition-colors uppercase tracking-widest">
                          <input type="file" accept=".csv,.xlsx,.xls" multiple onChange={(e) => { const files = e.target.files; if (files?.length) handleJournalUpload(Array.from(files)); e.target.value = ''; }} className="hidden" />
                          Attach
                        </label>
                      </div>

                      {journals.length > 0 ? (
                        <div className="space-y-2">
                          {journals.map((j, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-[var(--np-bg3)] border border-[var(--np-border2)] group hover:border-[var(--np-green)]/30 transition-all">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileSpreadsheet className="w-3.5 h-3.5 text-[var(--np-sky)] flex-shrink-0" />
                                <span className="text-[10px] font-medium text-[var(--np-text2)] truncate">{j.file.name}</span>
                              </div>
                              <button onClick={() => removeJournal(idx)} className="text-[var(--np-red)] opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"><RotateCcw className="w-3.5 h-3.5" /></button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3 rounded-lg bg-[var(--np-bg3)]/40 border border-dashed border-[var(--np-border)]">
                          <p className="text-[10px] text-[var(--np-text3)] italic">Optional: include additional ledgers for consolidated review</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMNS: UPLOAD ZONES */}
              <div className="lg:col-span-2 space-y-6">
                {/* PRIMARY UPLOADS */}
                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--np-sky)]/10 border border-[var(--np-sky)]/20 text-[var(--np-sky)] text-[9px] font-bold uppercase tracking-wider">
                      Primary Source
                    </div>
                    <FileUploadZone
                      label={term.primaryBookLabel}
                      description={term.primaryBookDesc}
                      onFileSelect={handlePrUpload}
                      fileName={prFile?.name}
                      className="h-full min-h-64"
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--np-green)]/10 border border-[var(--np-green)]/20 text-[var(--np-green)] text-[9px] font-bold uppercase tracking-wider">
                      Government Source
                    </div>
                    <FileUploadZone
                      label={term.govtLabel}
                      description={term.govtDesc}
                      onFileSelect={handleTwoBUpload}
                      fileName={twoBFile?.name}
                      className="h-full min-h-64"
                    />
                  </div>
                </div>

                {/* OPTIONAL ADJUSTMENTS CARD */}
                <div className="dash-card border-[var(--np-green)]/20 hover:border-[var(--np-green)]/40 transition-colors duration-300">
                  <div className="dash-topbar bg-gradient-to-r from-[var(--np-bg3)] to-[var(--np-bg2)]">
                    <div className="dash-dots"><span style={{background:'#3DCC8E'}}></span><span style={{background:'#4A9EE8'}}></span></div>
                    <span className="text-[10px] font-bold text-[var(--np-text2)] uppercase tracking-widest">Debit Note Adjustments</span>
                    <Sparkles className="w-3.5 h-3.5 text-[var(--np-green)]" />
                  </div>
                  <div className="p-6">
                    <p className="text-[11px] text-[var(--np-text3)] mb-6">Optional: Upload credit/debit notes to fine-tune tax calculations</p>
                    <div className="grid sm:grid-cols-2 gap-6">
                      <FileUploadZone
                        label="PR Debit Notes"
                        description="Tax adjustments"
                        onFileSelect={handlePrDnUpload}
                        fileName={prDnFile?.name}
                        compact
                      />
                      <FileUploadZone
                        label="2B Adjustments"
                        description="Credit/debit notes"
                        onFileSelect={handleTwoBDnUpload}
                        fileName={twoBDnFile?.name}
                        compact
                      />
                    </div>
                  </div>
                </div>

                {/* ACTION SECTION */}
                {prFile && twoBFile && (
                  <div className="flex flex-col gap-4 pt-6 silk-reveal">
                    <div className="h-0.5 bg-gradient-to-r from-transparent via-[var(--np-border)] to-transparent"></div>
                    <button onClick={handleProceedToMap} className="w-full btn-np-primary h-16 text-base uppercase tracking-widest gap-3 flex items-center justify-center font-black shadow-lg shadow-[var(--np-sky)]/20 hover:shadow-[var(--np-sky)]/40 hover:scale-105 transition-all duration-300">
                      <Sparkles className="w-5 h-5" /> Launch Reconciliation <ArrowRight className="w-5 h-5" />
                    </button>
                    <p className="text-center text-[10px] text-[var(--np-text3)] uppercase tracking-wider">Proceed to mapping and executive review</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 'map' && (
          <div className="max-w-4xl mx-auto space-y-8 silk-reveal">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-[var(--np-text)]">Reconciliation Mapping</h2>
              <div className="text-[11px] font-bold text-[var(--np-text3)] uppercase tracking-widest">Column mapping overview</div>
            </div>

            <div className="space-y-12">
              <div className="dash-card">
                <div className="dash-topbar bg-[var(--np-bg3)]">
                  <span className="text-[11px] font-bold text-[var(--np-text2)] uppercase tracking-widest">{term.primaryBookLabel} Source</span>
                </div>
                <div className="p-1">
                  <ColumnMapper
                    title={`${term.primaryBookLabel} Mapping`}
                    headers={prHeaders}
                    mapping={prMapping}
                    onChange={setPrMapping}
                    requireTaxable={requireTaxable}
                    labelOverrides={{ supplierName: term.partyLabel }}
                  />
                </div>
              </div>

              {journals.map((j, idx) => (
                <div key={idx} className="dash-card">
                  <div className="dash-topbar bg-[var(--np-bg3)]">
                    <span className="text-[11px] font-bold text-[var(--np-text2)] uppercase tracking-widest">Secondary Source: {j.file.name}</span>
                  </div>
                  <div className="p-1">
                    <ColumnMapper
                      title={`Secondary Source: ${j.file.name}`}
                      headers={j.headers}
                      mapping={j.mapping}
                      onChange={(newMap) => {
                        const newJ = [...journals];
                        newJ[idx].mapping = newMap;
                        setJournals(newJ);
                      }}
                      requireTaxable={requireTaxable}
                      labelOverrides={{ supplierName: term.partyLabel }}
                    />
                  </div>
                </div>
              ))}

              <div className="dash-card border-[var(--np-sky)]/30">
                <div className="dash-topbar bg-[var(--np-sky4)]/30 border-[var(--np-sky)]/20">
                  <span className="text-[11px] font-bold text-[var(--np-sky)] uppercase tracking-widest">{term.govtLabel} Source</span>
                </div>
                <div className="p-1">
                  <ColumnMapper
                    title={`${term.govtLabel} Mapping`}
                    headers={twoBHeaders}
                    mapping={twoBMapping}
                    onChange={setTwoBMapping}
                    requireTaxable={requireTaxable}
                    labelOverrides={{ supplierName: term.partyLabel, filingStatus: 'Filing Period' }}
                  />
                </div>
              </div>
            </div>

            <div className="sticky bottom-8 z-40 bg-[var(--np-bg2)]/80 backdrop-blur-xl border border-[var(--np-border)] p-6 rounded-2xl flex items-center justify-between shadow-2xl mt-12">
              <div className="space-y-1">
                  <p className="text-[10px] font-bold text-[var(--np-text3)] uppercase tracking-widest">Pipeline status</p>
                  <p className="text-sm font-bold text-[var(--np-green)]">Pipeline configured and ready</p>
              </div>
              {processing ? (
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-[10px] font-bold text-[var(--np-sky)] uppercase tracking-widest">
                    <span className="animate-pulse">Analyzing...</span>
                    <span>{progressValue}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-[var(--np-bg3)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--np-sky)] transition-all duration-300" style={{width: `${progressValue}%`}} />
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleReconcile}
                  disabled={!isMappingComplete(prMapping, requireTaxable) || !isMappingComplete(twoBMapping, requireTaxable) || journals.some((j) => !isMappingComplete(j.mapping, requireTaxable))}
                  className="btn-np-primary h-12 !px-10 text-[11px] uppercase tracking-[0.2em] gap-2 flex items-center disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Execute Reconciliation <Sparkles className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'results' && results && summary && (
          <div className="space-y-12 silk-reveal">
            {/* DASHBOARD HERO SECTION */}
            <div className="relative max-w-5xl mx-auto mb-12">
              <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-[var(--np-green)]/5 rounded-full blur-3xl opacity-30 pointer-events-none"></div>
              <div className="relative">
                <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-8 pb-8 border-b border-[var(--np-border)]">
                  <div className="space-y-4 flex-1">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--np-green)]/10 border border-[var(--np-green)]/20 text-[var(--np-green)] text-[10px] font-bold uppercase tracking-[0.2em]">
                      <span className="w-2 h-2 rounded-full bg-[var(--np-green)] animate-pulse" />
                      Reconciliation Complete
                    </div>
                    <h2 className="text-5xl lg:text-6xl font-black tracking-tight text-[var(--np-text)]">
                      {companyName || 'Reconciliation Dashboard'}
                    </h2>
                    <p className="text-[12px] text-[var(--np-text3)] uppercase tracking-[0.3em] font-bold">EXECUTIVE INSIGHT V3.1</p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                    <button onClick={handleExportMonthly} className="btn-np-outline flex items-center justify-center gap-2 !py-3 !px-4 text-[10px] font-bold uppercase tracking-widest hover:border-[var(--np-green)] hover:text-[var(--np-green)] transition-all">
                      <CloudDownload className="w-4 h-4" /> Monthly Export
                    </button>
                    <button onClick={handleExportParty} className="btn-np-outline flex items-center justify-center gap-2 !py-3 !px-4 text-[10px] font-bold uppercase tracking-widest hover:border-[var(--np-sky)] hover:text-[var(--np-sky)] transition-all">
                      <CloudDownload className="w-4 h-4" /> Party Export
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* SUMMARY CARDS WITH ENHANCED STYLING */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <SummaryCards summary={summary} />
            </div>

            {/* DETAILED RESULTS CARD */}
            <div className="dash-card shadow-2xl">
              <div className="dash-topbar">
                <div className="dash-dots"><span style={{background:'#4A9EE8'}}></span><span style={{background:'#7EC8F0'}}></span></div>
                <span className="text-[10px] font-bold text-[var(--np-text2)] uppercase tracking-widest">Detailed Reconciliation Report</span>
                <div className="w-2 h-2 rounded-full bg-[var(--np-green)] animate-pulse"></div>
              </div>
              <div className="p-1">
                <ResultsCategoryTabs results={results} summary={summary} companyName={companyName} mode={mode as 'input' | 'output'} />
              </div>
            </div>

            {/* ANALYTICS GRID */}
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <PartyWiseReport results={results} companyName={companyName} mode={mode as 'input' | 'output'} />
              </div>
              <div>
                <MonthlyBreakdown results={results} debitNotes={parsedDebitNotes} companyName={companyName} />
              </div>
            </div>

            {/* INSIGHTS SECTION */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8">
              <div className="p-6 rounded-xl bg-[var(--np-bg2)] border border-[var(--np-border)] hover:border-[var(--np-sky)]/30 transition-all">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-[var(--np-sky)]/10 border border-[var(--np-sky)]/20 flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6 text-[var(--np-sky)]" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[var(--np-text)] mb-2">Perfect Matches</div>
                    <div className="text-2xl font-black text-[var(--np-sky)]">{summary.perfectMatch}</div>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-xl bg-[var(--np-bg2)] border border-[var(--np-border)] hover:border-[var(--np-red)]/30 transition-all">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-[var(--np-red)]/10 border border-[var(--np-red)]/20 flex items-center justify-center">
                    <Plus className="w-6 h-6 text-[var(--np-red)] transform rotate-45" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[var(--np-text)] mb-2">Value Mismatches</div>
                    <div className="text-2xl font-black text-[var(--np-red)]">{summary.valueMismatch}</div>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-xl bg-[var(--np-bg2)] border border-[var(--np-border)] hover:border-[var(--np-green)]/30 transition-all">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-[var(--np-green)]/10 border border-[var(--np-green)]/20 flex items-center justify-center">
                    <ArrowRight className="w-6 h-6 text-[var(--np-green)]" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[var(--np-text)] mb-2">Accuracy Rate</div>
                    <div className="text-2xl font-black text-[var(--np-green)]">{summary.total > 0 ? ((summary.perfectMatch / summary.total) * 100).toFixed(1) : '0.0'}%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="container mx-auto px-6 mt-32 pt-16 border-t border-[var(--np-border)]">
        <div className="grid md:grid-cols-3 gap-12 mb-12">
          <div className="space-y-4">
            <div className="w-10 h-10 rounded-lg bg-[var(--np-sky)]/10 border border-[var(--np-sky)]/20 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-[var(--np-sky)]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--np-text)] mb-2">Enterprise Grade</h3>
              <p className="text-[11px] text-[var(--np-text3)]">Military-grade encryption and compliance standards for your data.</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="w-10 h-10 rounded-lg bg-[var(--np-green)]/10 border border-[var(--np-green)]/20 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-[var(--np-green)]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--np-text)] mb-2">High Velocity</h3>
              <p className="text-[11px] text-[var(--np-text3)]">Process large volumes with consistent accuracy and speed.</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="w-10 h-10 rounded-lg bg-[var(--np-sky2)]/10 border border-[var(--np-sky2)]/20 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-[var(--np-sky2)]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--np-text)] mb-2">Designed for Finance</h3>
              <p className="text-[11px] text-[var(--np-text3)]">Governance-ready interfaces for accounting and audit teams.</p>
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--np-border)] pt-8 text-center space-y-4 pb-8">
          <p className="text-[10px] font-bold text-[var(--np-text3)] uppercase tracking-[0.4em]">Reconciliation Intelligence • GST Compliance Engine • V3.1</p>
          <p className="text-[9px] text-[var(--np-text3)] opacity-60">Engineered for precision. Built for compliance. Designed for speed.</p>
        </div>
      </footer>
    </div>
  );
}
