import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileUploadZone } from '@/components/FileUploadZone';
import { ColumnMapper, isMappingComplete } from '@/components/ColumnMapper';
import { SummaryCards } from '@/components/SummaryCards';
import { MonthlyBreakdown } from '@/components/MonthlyBreakdown';
import { ResultsCategoryTabs } from '@/components/ResultsCategoryTabs';
import { ThemeToggle } from '@/components/ThemeToggle';
import { parseFile, detectColumnMapping, mapToRecords, exportMonthlyComparison, exportPartyWise, type ColumnMapping, type MonthlyComparisonRow, type DebitNoteRecord } from '@/lib/fileParser';
import { reconcile, getSummary, type ReconciliationResult, type ReconciliationSummary } from '@/lib/reconciliation';
import { aggregateByParty } from '@/lib/partyWise';
import { PartyWiseReport } from '@/components/PartyWiseReport';
import { ArrowRight, RotateCcw, ShieldCheck, Sparkles, ChevronDown, FileSpreadsheet, Users, Plus, X, BookOpen, CheckCircle2, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { downloadUserGuide } from '@/lib/userGuide';
import { daysOldFrom, isLateFiler, deriveItcEligibility, taxRatePct, posCompliance, rule37Warning, actionableRemark } from '@/lib/compliance';
import { ModeSelector } from '@/components/ModeSelector';
import { TERMS, type ReconciliationMode } from '@/lib/mode';

type Step = 'upload' | 'map' | 'results';

export default function Index() {
  const [mode, setMode] = useState<ReconciliationMode | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [prFile, setPrFile] = useState<File | null>(null);
  const [twoBFile, setTwoBFile] = useState<File | null>(null);
  const [prHeaders, setPrHeaders] = useState<string[]>([]);
  const [twoBHeaders, setTwoBHeaders] = useState<string[]>([]);
  const [prRows, setPrRows] = useState<Record<string, unknown>[]>([]);
  const [twoBRows, setTwoBRows] = useState<Record<string, unknown>[]>([]);
  const [prMapping, setPrMapping] = useState<Partial<ColumnMapping>>({});
  const [twoBMapping, setTwoBMapping] = useState<Partial<ColumnMapping>>({});
  // Debit Notes (optional)
  const [prDnFile, setPrDnFile] = useState<File | null>(null);
  const [twoBDnFile, setTwoBDnFile] = useState<File | null>(null);
  const [prDnHeaders, setPrDnHeaders] = useState<string[]>([]);
  const [twoBDnHeaders, setTwoBDnHeaders] = useState<string[]>([]);
  const [prDnRows, setPrDnRows] = useState<Record<string, unknown>[]>([]);
  const [twoBDnRows, setTwoBDnRows] = useState<Record<string, unknown>[]>([]);
  const [prDnMapping, setPrDnMapping] = useState<Partial<ColumnMapping>>({});
  const [twoBDnMapping, setTwoBDnMapping] = useState<Partial<ColumnMapping>>({});
  // Journal Registers (multiple) — combined with PR for matching against 2B
  type JournalEntry = {
    id: string;
    file: File | null;
    headers: string[];
    rows: Record<string, unknown>[];
    mapping: Partial<ColumnMapping>;
  };
  const newJournal = (): JournalEntry => ({ id: Math.random().toString(36).slice(2), file: null, headers: [], rows: [], mapping: {} });
  const [journals, setJournals] = useState<JournalEntry[]>([newJournal()]);

  const handleJournalFile = useCallback(async (id: string, file: File) => {
    const { headers, rows } = await parseFile(file);
    setJournals((prev) => prev.map((j) => j.id === id ? { ...j, file, headers, rows, mapping: detectColumnMapping(headers) } : j));
  }, []);
  const updateJournalMapping = (id: string, mapping: Partial<ColumnMapping>) => {
    setJournals((prev) => prev.map((j) => j.id === id ? { ...j, mapping } : j));
  };
  const addJournal = () => setJournals((prev) => [...prev, newJournal()]);
  const removeJournal = (id: string) => setJournals((prev) => prev.filter((j) => j.id !== id));

  const [results, setResults] = useState<ReconciliationResult[]>([]);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showMonthly, setShowMonthly] = useState(false);
  const [showPartyWise, setShowPartyWise] = useState(false);

  const handlePrFile = useCallback(async (file: File) => {
    setPrFile(file);
    const { headers, rows } = await parseFile(file);
    setPrHeaders(headers);
    setPrRows(rows);
    setPrMapping(detectColumnMapping(headers));
  }, []);

  const handleTwoBFile = useCallback(async (file: File) => {
    setTwoBFile(file);
    const { headers, rows } = await parseFile(file);
    setTwoBHeaders(headers);
    setTwoBRows(rows);
    setTwoBMapping(detectColumnMapping(headers));
  }, []);

  const handlePrDnFile = useCallback(async (file: File) => {
    setPrDnFile(file);
    const { headers, rows } = await parseFile(file);
    setPrDnHeaders(headers);
    setPrDnRows(rows);
    setPrDnMapping(detectColumnMapping(headers));
  }, []);

  const handleTwoBDnFile = useCallback(async (file: File) => {
    setTwoBDnFile(file);
    const { headers, rows } = await parseFile(file);
    setTwoBDnHeaders(headers);
    setTwoBDnRows(rows);
    setTwoBDnMapping(detectColumnMapping(headers));
  }, []);

  const handleProceedToMap = () => {
    if (prFile && twoBFile) setStep('map');
  };

  const requireTaxable = mode === 'output';
  const handleReconcile = async () => {
    if (!isMappingComplete(prMapping, requireTaxable) || !isMappingComplete(twoBMapping, requireTaxable)) return;
    // Validate any uploaded journal mappings
    const activeJournals = journals.filter((j) => j.file);
    if (activeJournals.some((j) => !isMappingComplete(j.mapping, requireTaxable))) return;
    setProcessing(true);
    setTimeout(() => {
      const prRecords = mapToRecords(prRows, prMapping, 'PR', 'Purchase Register');
      const journalRecords = activeJournals.flatMap((j, idx) =>
        mapToRecords(j.rows, j.mapping as ColumnMapping, 'PR', j.file?.name || `Journal Register ${idx + 1}`)
      );
      const combinedPr = [...prRecords, ...journalRecords];
      const twoBRecords = mapToRecords(twoBRows, twoBMapping, '2B', 'GSTR-2B');
      const res = reconcile(combinedPr, twoBRecords);
      const sum = getSummary(res);
      setResults(res);
      setSummary(sum);
      setStep('results');
      setProcessing(false);
      toast.success('Reconciliation complete', {
        description: `${sum.total} records processed • ${sum.perfectMatch} perfect match • ${sum.invoiceMissing + sum.unmatchedVendor} at ITC risk`,
        icon: <CheckCircle2 className="w-4 h-4 text-success" />,
        duration: 5000,
      });
    }, 100);
  };

  const handleReset = () => {
    setStep('upload');
    setPrFile(null);
    setTwoBFile(null);
    setPrHeaders([]);
    setTwoBHeaders([]);
    setPrRows([]);
    setTwoBRows([]);
    setPrMapping({});
    setTwoBMapping({});
    setPrDnFile(null); setTwoBDnFile(null);
    setPrDnHeaders([]); setTwoBDnHeaders([]);
    setPrDnRows([]); setTwoBDnRows([]);
    setPrDnMapping({}); setTwoBDnMapping({});
    setJournals([newJournal()]);
    setResults([]);
    setSummary(null);
    setShowMonthly(false);
    setShowPartyWise(false);
  };

  return (
    <div className="min-h-screen bg-background transition-colors duration-500">
      {/* Ambient background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[40%] -left-[20%] w-[60%] h-[60%] rounded-full bg-primary/[0.03] blur-3xl" />
        <div className="absolute -bottom-[30%] -right-[20%] w-[50%] h-[50%] rounded-full bg-info/[0.03] blur-3xl" />
      </div>

      {/* Header */}
      <header className="gradient-header text-primary-foreground shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDE4YzAtOS45NC04LjA2LTE4LTE4LTE4UzAgOC4wNiAwIDE4YzAgOS45NCA4LjA2IDE4IDE4IDE4czE4LTguMDYgMTgtMTgiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-50" />
        <div className="container mx-auto px-4 py-5 flex items-center justify-between relative">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center ring-1 ring-white/20 shadow-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">GST Reconciliation</h1>
              <p className="text-xs opacity-70">Purchase Register ↔ GSTR-2B</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                downloadUserGuide();
                toast.success('User guide downloaded', {
                  description: 'Vaswani-Return-User-Guide.pdf saved to your downloads.',
                  duration: 4000,
                });
              }}
              className="gap-2 bg-white/15 text-white border-white/20 hover:bg-white/25 backdrop-blur-sm"
            >
              <BookOpen className="w-3.5 h-3.5" /> User Guide
            </Button>
            {step !== 'upload' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleReset}
                className="gap-2 bg-white/15 text-white border-white/20 hover:bg-white/25 backdrop-blur-sm"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Start Over
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Step indicators */}
      <div className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-30">
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
                      'w-10 h-0.5 mx-1 rounded-full transition-colors duration-500',
                      isDone ? 'bg-success' : 'bg-border'
                    )} />
                  )}
                  <div className={cn(
                    'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-500',
                    isActive ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20' :
                    isDone ? 'bg-success/10 text-success' : 'text-muted-foreground'
                  )}>
                    <span className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-500',
                      isActive ? 'bg-white/20' : isDone ? 'bg-success/20' : 'bg-muted'
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

      <main className="container mx-auto px-4 py-8 space-y-8 relative">
        {/* Upload */}
        {step === 'upload' && (
          <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-3">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Upload Your Files</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Upload your Purchase Register and GSTR-2B data to begin intelligent reconciliation
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              <FileUploadZone
                label="Purchase Register"
                description="Your books / Tally export"
                onFileSelect={handlePrFile}
                fileName={prFile?.name}
              />
              <FileUploadZone
                label="GSTR-2B Data"
                description="Downloaded from GST Portal"
                onFileSelect={handleTwoBFile}
                fileName={twoBFile?.name}
              />
              <FileUploadZone
                label="Upload PR Debit Notes"
                description="Optional — deducted from PR"
                onFileSelect={handlePrDnFile}
                fileName={prDnFile?.name}
              />
              <FileUploadZone
                label="Upload GSTR-2B Debit Notes"
                description="Optional — deducted from 2B"
                onFileSelect={handleTwoBDnFile}
                fileName={twoBDnFile?.name}
              />
            </div>

            {/* Journal Registers */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Journal Registers</h3>
                  <p className="text-xs text-muted-foreground">Optional — combined with Purchase Register and compared to GSTR-2B</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addJournal} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Add Journal Register
                </Button>
              </div>
              <div className="grid md:grid-cols-2 gap-5">
                {journals.map((j, idx) => (
                  <div key={j.id} className="relative">
                    <FileUploadZone
                      label={`Journal Register ${idx + 1}`}
                      description="e.g. Journal entries for purchases"
                      onFileSelect={(file) => handleJournalFile(j.id, file)}
                      fileName={j.file?.name}
                    />
                    {journals.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeJournal(j.id)}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
                        aria-label="Remove journal register"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {prFile && twoBFile && (
              <div className="flex justify-center animate-in fade-in zoom-in-95 duration-300">
                <Button onClick={handleProceedToMap} size="lg" className="gap-2 shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 transition-all duration-300 hover:scale-[1.02]">
                  Continue to Column Mapping <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            )}
            <Card className="bg-muted/30 border-dashed glass-card">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Expected columns:</strong> Supplier Name, GSTIN, Invoice No, Invoice Date, Invoice Value, Taxable Value, IGST, CGST, SGST.
                  The app auto-detects columns from your headers. You can adjust mapping in the next step.
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Column Mapping */}
        {step === 'map' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">Map Your Columns</h2>
              <p className="text-muted-foreground">
                Verify or adjust column mappings. Fields marked with * are required.
              </p>
            </div>
            <div className="grid gap-4">
              <ColumnMapper
                title={`Purchase Register — ${prRows.length} rows`}
                headers={prHeaders}
                mapping={prMapping}
                onChange={setPrMapping}
                labelOverrides={{ gstin: 'GST No.' }}
              />
              <ColumnMapper
                title={`GSTR-2B — ${twoBRows.length} rows`}
                headers={twoBHeaders}
                mapping={twoBMapping}
                onChange={setTwoBMapping}
                labelOverrides={{ supplierName: 'Trade / Legal Name' }}
              />
              {journals.filter((j) => j.file).map((j, idx) => (
                <ColumnMapper
                  key={j.id}
                  title={`Journal Register ${idx + 1} — ${j.rows.length} rows`}
                  headers={j.headers}
                  mapping={j.mapping}
                  onChange={(m) => updateJournalMapping(j.id, m)}
                  labelOverrides={{ gstin: 'GST No.' }}
                />
              ))}
              {prDnFile && (
                <ColumnMapper
                  title={`PR Debit Notes — ${prDnRows.length} rows`}
                  headers={prDnHeaders}
                  mapping={prDnMapping}
                  onChange={setPrDnMapping}
                />
              )}
              {twoBDnFile && (
                <ColumnMapper
                  title={`GSTR-2B Debit Notes — ${twoBDnRows.length} rows`}
                  headers={twoBDnHeaders}
                  mapping={twoBDnMapping}
                  onChange={setTwoBDnMapping}
                />
              )}
            </div>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
              <Button
                onClick={handleReconcile}
                disabled={!isMappingComplete(prMapping) || !isMappingComplete(twoBMapping) || journals.some((j) => j.file && !isMappingComplete(j.mapping)) || processing}
                className="gap-2 shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 transition-all duration-300 hover:scale-[1.02]"
              >
                {processing ? 'Processing...' : 'Run Reconciliation'} <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Results */}
        {step === 'results' && summary && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Reconciliation Results</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {summary.total} records processed • {summary.perfectMatch} perfect • {summary.valueMismatch} value mismatch • {summary.invoiceMissing + summary.unmatchedVendor} at ITC risk
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    const rows: MonthlyComparisonRow[] = results.map((r) => {
                      const pr = r.prRecord;
                      const tb = r.twoBRecord;
                      const totalDiff = (r.cgstDiff !== undefined || r.sgstDiff !== undefined || r.igstDiff !== undefined)
                        ? +(Math.abs(r.cgstDiff ?? 0) + Math.abs(r.sgstDiff ?? 0) + Math.abs(r.igstDiff ?? 0)).toFixed(2)
                        : '';
                      const baseRec = pr || tb;
                      const taxableForRate = pr?.taxableValue ?? tb?.taxableValue;
                      const totalTax = (pr?.igst ?? tb?.igst ?? 0) + (pr?.cgst ?? tb?.cgst ?? 0) + (pr?.sgst ?? tb?.sgst ?? 0);
                      const days = daysOldFrom(pr?.invoiceDate || tb?.invoiceDate);
                      const lateFiler = isLateFiler(pr?.invoiceDate || tb?.invoiceDate, tb?.filingDate);
                      return {
                        partyTally: pr?.supplierName || '',
                        gstinTally: pr?.gstin || '',
                        invoiceTally: pr?.invoiceNo || '',
                        cgstTally: pr?.cgst ?? '',
                        sgstTally: pr?.sgst ?? '',
                        igstTally: pr?.igst ?? '',
                        partyCmp: tb?.supplierName || '',
                        gstinCmp: tb?.gstin || '',
                        invoiceCmp: tb?.invoiceNo || '',
                        cgstCmp: tb?.cgst ?? '',
                        sgstCmp: tb?.sgst ?? '',
                        igstCmp: tb?.igst ?? '',
                        status: r.status,
                        totalDiff,
                        dateTally: pr?.invoiceDate || '',
                        dateCmp: tb?.invoiceDate || '',
                        itcEligibility: deriveItcEligibility(baseRec?.supplierName),
                        gstr1Status: tb?.filingStatus ?? '',
                        filingDate: tb?.filingDate ?? '',
                        daysOld: days,
                        taxRatePct: taxRatePct(taxableForRate, totalTax),
                        posCompliance: posCompliance(pr || tb),
                        rule37Warning: rule37Warning(r.status, days),
                        remark: actionableRemark(r.status, r.remark, lateFiler),
                      };
                    });
                    const toDN = (
                      rs: Record<string, unknown>[],
                      m: Partial<ColumnMapping>
                    ): DebitNoteRecord[] => rs.map((row) => ({
                      invoiceDate: m.invoiceDate ? String(row[m.invoiceDate] ?? '') : '',
                      cgst: m.cgst ? Number(row[m.cgst]) || 0 : 0,
                      sgst: m.sgst ? Number(row[m.sgst]) || 0 : 0,
                      igst: m.igst ? Number(row[m.igst]) || 0 : 0,
                    }));
                    const dn = {
                      pr: prDnRows.length ? toDN(prDnRows, prDnMapping) : undefined,
                      twoB: twoBDnRows.length ? toDN(twoBDnRows, twoBDnMapping) : undefined,
                    };
                    exportMonthlyComparison(rows, 'Monthly_Comparison_Report.xlsx', dn);
                    toast.success('Monthly comparison exported', { description: `${rows.length} rows • Excel workbook ready.` });
                  }}
                  size="sm"
                  className="gap-2 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Export Monthly Comparison Report
                </Button>
                <Button
                  onClick={() => {
                    exportPartyWise(aggregateByParty(results), 'Party_Wise_Report.xlsx');
                    toast.success('Party-wise report exported', { description: 'Excel workbook ready in your downloads.' });
                  }}
                  size="sm"
                  variant="secondary"
                  className="gap-2 shadow-lg"
                >
                  <Users className="w-4 h-4" /> Export Party-wise Report
                </Button>
              </div>
            </div>
            <SummaryCards summary={summary} />

            {/* Monthly toggle */}
            <button
              onClick={() => setShowMonthly(!showMonthly)}
              className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl bg-card border border-border hover:bg-muted/40 transition-all duration-300 group"
            >
              <span className="text-sm font-semibold">Month-wise Breakdown</span>
              <ChevronDown className={cn(
                'w-4 h-4 text-muted-foreground transition-transform duration-300',
                showMonthly && 'rotate-180'
              )} />
            </button>
            {showMonthly && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <MonthlyBreakdown results={results} />
              </div>
            )}

            {/* Party-wise toggle */}
            <button
              onClick={() => setShowPartyWise(!showPartyWise)}
              className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl bg-card border border-border hover:bg-muted/40 transition-all duration-300 group"
            >
              <span className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> Party-wise Reconciliation
              </span>
              <ChevronDown className={cn(
                'w-4 h-4 text-muted-foreground transition-transform duration-300',
                showPartyWise && 'rotate-180'
              )} />
            </button>
            {showPartyWise && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <PartyWiseReport results={results} />
              </div>
            )}

            <ResultsCategoryTabs results={results} summary={summary} />
          </div>
        )}
      </main>
    </div>
  );
}
