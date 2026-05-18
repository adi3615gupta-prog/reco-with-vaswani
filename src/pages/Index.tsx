import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ShieldCheck, ArrowRight, Plus, Sparkles, Building2, FileSpreadsheet, RotateCcw } from 'lucide-react';
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
      electronAPI.onUpdateAvailable(() => {
        toast('A new update is available!', {
          description: 'Click below to start downloading the latest version.',
          action: {
            label: 'Download',
            onClick: () => electronAPI.downloadUpdate(),
          },
          duration: 10000,
        });
      });

      electronAPI.onUpdateDownloaded(() => {
        toast.success('Update Ready', {
          description: 'The app will restart to apply the new update.',
          action: {
            label: 'Restart Now',
            onClick: () => electronAPI.restartApp(),
          },
          duration: 100000,
        });
      });
    }
  }, []);

  const [mode, setMode] = useState<ReconciliationMode | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [processing, setProcessing] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [companyName, setCompanyName] = useState<string>('');

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

      const res = reconcile(prRecs, twoBRecs, mode as 'input' | 'output');
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
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
        {/* Dynamic Animated Background */}
        <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none -z-10">
          <div className="absolute inset-0 bg-background" />
          
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808025_1px,transparent_1px),linear-gradient(to_bottom,#80808025_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
          
          {/* Rich Violet/Fuchsia Floating Glowing Orbs */}
          <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-violet-600/40 dark:bg-violet-600/20 blur-[120px] animate-pulse [animation-duration:8s]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-fuchsia-600/40 dark:bg-fuchsia-600/20 blur-[140px] animate-pulse [animation-duration:12s]" />
          <div className="absolute top-[30%] left-[40%] w-[50vw] h-[50vw] rounded-full bg-blue-600/30 dark:bg-blue-600/15 blur-[120px] animate-pulse [animation-duration:10s]" />

          {/* Pulsing Stars */}
          <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-violet-500 rounded-full blur-[1px] animate-ping [animation-duration:3s]" />
          <div className="absolute top-1/3 right-1/4 w-3 h-3 bg-fuchsia-500 rounded-full blur-[2px] animate-ping [animation-duration:4s] [animation-delay:1s]" />
          <div className="absolute bottom-1/4 left-1/3 w-2.5 h-2.5 bg-blue-500 rounded-full blur-[1px] animate-ping [animation-duration:5s] [animation-delay:2s]" />
        </div>
        <div className="absolute top-6 right-6 z-50">
          <ThemeToggle />
        </div>
        <ModeSelector onSelect={setMode} />
      </div>
    );
  }

  const term = TERMS[mode];
  const requireTaxable = mode === 'output';

  return (
    <div className="min-h-screen bg-background transition-colors duration-500">
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10 bg-background">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808020_1px,transparent_1px),linear-gradient(to_bottom,#80808020_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        
        <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-violet-600/40 dark:bg-violet-600/20 blur-[120px] animate-pulse [animation-duration:7s]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-fuchsia-600/40 dark:bg-fuchsia-600/20 blur-[120px] animate-pulse [animation-duration:11s] [animation-delay:2s]" />
        <div className="absolute top-[30%] left-[40%] w-[40vw] h-[40vw] rounded-full bg-blue-600/30 dark:bg-blue-600/15 blur-[120px] animate-pulse [animation-duration:9s] [animation-delay:4s]" />
      </div>

      <header className="gradient-header text-primary-foreground shadow-lg relative overflow-hidden border-b border-white/10 animate-in fade-in slide-in-from-top-8 duration-700 ease-out">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDE4YzAtOS45NC04LjA2LTE4LTE4LTE4UzAgOC4wNiAwIDE4YzAgOS45NCA4LjA2IDE4IDE4IDE4czE4LTguMDYgMTgtMTgiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-50" />
        <div className="container mx-auto px-4 py-5 flex items-center justify-between relative">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center ring-1 ring-white/30 shadow-[0_0_20px_rgba(255,255,255,0.15)] overflow-hidden">
              <img 
                src="./icon.png" 
                alt="Logo" 
                className="w-8 h-8 object-contain drop-shadow-md hover:scale-105 transition-transform duration-300" 
                onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
              />
              <ShieldCheck className="w-6 h-6 hidden" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">GST Reconciliation</h1>
              <p className="text-xs opacity-70">{term.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => handleReset(false)} size="sm" className="gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm transition-all shadow-none">
              <RotateCcw className="w-4 h-4" /> Reset Files
            </Button>
            <ModeSwitcher currentMode={mode} onSwitch={() => handleReset(true)} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="border-b bg-background/80 backdrop-blur-xl sticky top-0 z-30 supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-1 py-2.5">
            {(['upload', 'map', 'results'] as Step[]).map((s, idx) => {
              const labels = ['Upload Files', 'Map Columns', 'View Results'];
              const isActive = s === step;
              const isDone = (['upload', 'map', 'results'].indexOf(step)) > idx;
              return (
                <div key={s} className="flex items-center gap-1">
                  {idx > 0 && (
                    <div className={cn(
                      'w-12 h-0.5 mx-2 rounded-full transition-colors duration-700',
                      isDone ? 'bg-success' : 'bg-border'
                    )} />
                  )}
                  <div className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-500',
                    isActive ? 'bg-primary text-primary-foreground shadow-[0_0_20px_-3px_rgba(var(--primary),0.4)] ring-2 ring-primary/30 ring-offset-2 ring-offset-background' :
                    isDone ? 'bg-success/15 text-success hover:bg-success/20 cursor-pointer' : 'text-muted-foreground hover:text-foreground cursor-pointer'
                  )}
                  onClick={() => isDone && setStep(s)}
                  >
                    <span className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-500',
                      isActive ? 'bg-white/25 text-white' : isDone ? 'bg-success/25 text-success-foreground' : 'bg-muted text-muted-foreground'
                    )}>
                      {isDone ? '✓' : idx + 1}
                    </span>
                    {labels[idx]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        {step === 'upload' && (
          <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-card/60 backdrop-blur-xl border border-white/10 shadow-lg rounded-2xl p-6 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-foreground text-lg tracking-tight">Company Details</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Enter the name of the company to automatically brand your exported professional reports.</p>
              <input
                type="text"
                placeholder="e.g. Acme Corporation Ltd."
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="flex h-11 w-full max-w-md rounded-xl border border-input bg-background/50 px-4 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <FileUploadZone
                label={term.primaryBookLabel}
                description={term.primaryBookDesc}
                onFileSelect={handlePrUpload}
                fileName={prFile?.name}
              />
              <FileUploadZone
                label={term.govtLabel}
                description={term.govtDesc}
                onFileSelect={handleTwoBUpload}
                fileName={twoBFile?.name}
              />
            </div>
            
            <div className="grid md:grid-cols-2 gap-6 pt-2">
              <FileUploadZone
                label={`Optional: ${term.primaryShort} Debit Notes`}
                description="Upload to adjust monthly totals"
                onFileSelect={handlePrDnUpload}
                fileName={prDnFile?.name}
              />
              <FileUploadZone
                label={`Optional: ${term.govtShort} Debit/Credit Notes`}
                description="Upload to adjust monthly totals"
                onFileSelect={handleTwoBDnUpload}
                fileName={twoBDnFile?.name}
              />
            </div>
            
            <div className="space-y-4 pt-4 border-t border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">{term.secondaryBookLabel}s</h3>
                  <p className="text-xs text-muted-foreground">{term.secondaryBookDesc}</p>
                </div>
                <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md transition-colors">
                  <input type="file" accept=".csv,.xlsx,.xls" multiple onChange={(e) => { const files = e.target.files; if (files?.length) handleJournalUpload(Array.from(files)); e.target.value = ''; }} className="hidden" />
                  <Plus className="w-3.5 h-3.5" /> Add {term.secondaryBookLabel}
                </label>
              </div>
              
              {journals.length > 0 && (
                <div className="grid gap-3">
                  {journals.map((j, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-lg border bg-card/50">
                      <span className="text-sm font-medium">{j.file.name}</span>
                      <Button variant="ghost" size="sm" onClick={() => removeJournal(idx)} className="text-destructive h-8 px-2">Remove</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {prFile && twoBFile && (
              <div className="flex justify-center pt-6 animate-in fade-in zoom-in-95 duration-300">
                <Button onClick={handleProceedToMap} size="lg" className="h-12 px-8 text-base font-semibold gap-2 shadow-[0_0_30px_-5px_rgba(var(--primary),0.4)] hover:shadow-[0_0_40px_-5px_rgba(var(--primary),0.6)] transition-all duration-300 hover:scale-[1.02]">
                  Continue to Column Mapping <ArrowRight className="w-5 h-5 ml-1" />
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
            <ColumnMapper
              title={`Map ${term.primaryBookLabel} Columns`}
              headers={prHeaders}
              mapping={prMapping}
              onChange={setPrMapping}
              requireTaxable={requireTaxable}
              labelOverrides={{ supplierName: term.partyLabel }}
            />
            
            {journals.map((j, idx) => (
              <ColumnMapper
                key={idx}
                title={`Map ${term.secondaryBookLabel} (${j.file.name}) Columns`}
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
            ))}

            <ColumnMapper
              title={`Map ${term.govtLabel} Columns`}
              headers={twoBHeaders}
              mapping={twoBMapping}
              onChange={setTwoBMapping}
              requireTaxable={requireTaxable}
              labelOverrides={{ supplierName: term.partyLabel, filingStatus: 'Filing Period (optional)' }}
            />

            {prDnFile && (
              <ColumnMapper
                title={`Map ${term.primaryShort} Debit Notes Columns`}
                headers={prDnHeaders}
                mapping={prDnMapping}
                onChange={setPrDnMapping}
                requireTaxable={false}
              />
            )}
            
            {twoBDnFile && (
              <ColumnMapper
                title={`Map ${term.govtShort} Debit Notes Columns`}
                headers={twoBDnHeaders}
                mapping={twoBDnMapping}
                onChange={setTwoBDnMapping}
                requireTaxable={false}
              />
            )}

            <div className="flex justify-end pt-6 border-t border-border/50">
              {(() => { const dnValid = (!prDnFile || isMappingComplete(prDnMapping, false)) && (!twoBDnFile || isMappingComplete(twoBDnMapping, false)); return (
                processing ? (
                  <div className="w-full sm:max-w-md ml-auto space-y-2 animate-in fade-in zoom-in-95 duration-300">
                    <div className="flex justify-between text-sm font-semibold text-primary px-1">
                      <span className="animate-pulse">Analyzing & Reconciling...</span>
                      <span className="tabular-nums">{progressValue}%</span>
                    </div>
                    <Progress value={progressValue} className="h-2.5 w-full bg-primary/20" />
                  </div>
                ) : (
                  <Button
                    onClick={handleReconcile}
                    disabled={!isMappingComplete(prMapping, requireTaxable) || !isMappingComplete(twoBMapping, requireTaxable) || journals.some((j) => !isMappingComplete(j.mapping, requireTaxable)) || !dnValid || processing}
                    className="h-12 px-8 text-base font-semibold gap-2 shadow-[0_0_30px_-5px_rgba(var(--primary),0.4)] hover:shadow-[0_0_40px_-5px_rgba(var(--primary),0.6)] transition-all duration-300 hover:scale-[1.02]"
                  >
                    Run Reconciliation <Sparkles className="w-5 h-5 ml-1" />
                  </Button>
                )
              ); })()}
            </div>
          </div>
        )}

        {step === 'results' && results && summary && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {companyName && (
              <div className="flex flex-col items-center justify-center pt-2 pb-6 border-b border-white/5 animate-in fade-in zoom-in-95 duration-700">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary mb-4 ring-1 ring-primary/20 shadow-inner">
                  <Building2 className="w-6 h-6" />
                </div>
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground text-center">{companyName}</h2>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mt-2">{term.title} Report</p>
              </div>
            )}
            
            <div className="flex flex-wrap items-center justify-center gap-4 mb-8 pt-2 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
              <Button onClick={handleExportMonthly} className="gap-2 shadow-lg shadow-primary/10 hover:shadow-xl hover:shadow-primary/20 transition-all hover:-translate-y-0.5 border border-primary/20 bg-card/60 backdrop-blur-md" variant="secondary" size="lg">
                <FileSpreadsheet className="w-5 h-5 text-success" /> Export Monthly Report
              </Button>
              <Button onClick={handleExportParty} className="gap-2 shadow-lg shadow-primary/10 hover:shadow-xl hover:shadow-primary/20 transition-all hover:-translate-y-0.5 border border-primary/20 bg-card/60 backdrop-blur-md" variant="secondary" size="lg">
                <FileSpreadsheet className="w-5 h-5 text-info" /> Export Party-wise Report
              </Button>
            </div>
            
            <SummaryCards summary={summary} />
            <ResultsCategoryTabs results={results} summary={summary} companyName={companyName} mode={mode as 'input' | 'output'} />
            <div className="grid lg:grid-cols-2 gap-6">
              <PartyWiseReport results={results} companyName={companyName} mode={mode as 'input' | 'output'} />
              <MonthlyBreakdown results={results} debitNotes={parsedDebitNotes} companyName={companyName} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}