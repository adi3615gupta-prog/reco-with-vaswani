import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileUploadZone } from '@/components/FileUploadZone';
import { ColumnMapper, isMappingComplete } from '@/components/ColumnMapper';
import { SummaryCards } from '@/components/SummaryCards';
import { MonthlyBreakdown } from '@/components/MonthlyBreakdown';
import { ResultsCategoryTabs } from '@/components/ResultsCategoryTabs';
import { ThemeToggle } from '@/components/ThemeToggle';
import { parseFile, detectColumnMapping, mapToRecords, exportMonthlyComparison, exportPartyWise, type ColumnMapping, type MonthlyComparisonRow } from '@/lib/fileParser';
import { reconcile, getSummary, type ReconciliationResult, type ReconciliationSummary } from '@/lib/reconciliation';
import { aggregateByParty } from '@/lib/partyWise';
import { PartyWiseReport } from '@/components/PartyWiseReport';
import { ArrowRight, RotateCcw, ShieldCheck, ChevronDown, FileSpreadsheet, Users, Upload, Map as MapIcon, BarChart3, FileText, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = 'upload' | 'map' | 'results';

export default function Index() {
  const [step, setStep] = useState<Step>('upload');
  const [prFile, setPrFile] = useState<File | null>(null);
  const [twoBFile, setTwoBFile] = useState<File | null>(null);
  const [prHeaders, setPrHeaders] = useState<string[]>([]);
  const [twoBHeaders, setTwoBHeaders] = useState<string[]>([]);
  const [prRows, setPrRows] = useState<Record<string, unknown>[]>([]);
  const [twoBRows, setTwoBRows] = useState<Record<string, unknown>[]>([]);
  const [prMapping, setPrMapping] = useState<Partial<ColumnMapping>>({});
  const [twoBMapping, setTwoBMapping] = useState<Partial<ColumnMapping>>({});
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

  const handleProceedToMap = () => {
    if (prFile && twoBFile) setStep('map');
  };

  const handleReconcile = async () => {
    if (!isMappingComplete(prMapping) || !isMappingComplete(twoBMapping)) return;
    setProcessing(true);
    setTimeout(() => {
      const prRecords = mapToRecords(prRows, prMapping, 'PR');
      const twoBRecords = mapToRecords(twoBRows, twoBMapping, '2B');
      const res = reconcile(prRecords, twoBRecords);
      setResults(res);
      setSummary(getSummary(res));
      setStep('results');
      setProcessing(false);
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
    setResults([]);
    setSummary(null);
    setShowMonthly(false);
    setShowPartyWise(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 transition-colors duration-500">
      {/* Subtle grid pattern background */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.02]" 
        style={{ 
          backgroundImage: 'linear-gradient(#64748b 1px, transparent 1px), linear-gradient(90deg, #64748b 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} 
      />
      
      <div className="flex min-h-screen relative">
        {/* Modern Sidebar */}
        <aside className="w-72 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-slate-200/60 dark:border-slate-800/60 flex flex-col sticky top-0 h-screen">
          {/* Logo Area */}
          <div className="p-6 border-b border-slate-200/60 dark:border-slate-800/60">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">RECO WITH</h1>
                <p className="text-sm font-medium text-primary">VASWANI</p>
              </div>
            </div>
          </div>

          {/* Navigation Steps */}
          <nav className="flex-1 p-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-3">Progress</p>
              {(['upload', 'map', 'results'] as Step[]).map((s, idx) => {
                const labels = ['Upload Files', 'Map Columns', 'View Results'];
                const icons = [Upload, MapIcon, BarChart3];
                const Icon = icons[idx];
                const isActive = s === step;
                const isDone = (['upload', 'map', 'results'].indexOf(step)) > idx;
                
                return (
                  <button
                    key={s}
                    disabled={!isDone && !isActive}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-300',
                      isActive 
                        ? 'bg-primary/10 text-primary shadow-sm' 
                        : isDone 
                          ? 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                          : 'text-slate-400 cursor-not-allowed'
                    )}
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300',
                      isActive 
                        ? 'bg-primary text-white shadow-md' 
                        : isDone 
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    )}>
                      {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                    </div>
                    <span className="flex-1 text-left">{labels[idx]}</span>
                    {isDone && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Footer Actions */}
          <div className="p-4 border-t border-slate-200/60 dark:border-slate-800/60 space-y-2">
            <ThemeToggle />
            {step !== 'upload' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="w-full gap-2 text-slate-600 dark:text-slate-400"
              >
                <RotateCcw className="w-4 h-4" /> Start Over
              </Button>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8 overflow-auto">
        {/* Upload */}
        {step === 'upload' && (
          <div className="max-w-4xl animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Header */}
            <div className="mb-8">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">Upload Files</h2>
              <p className="text-slate-500 dark:text-slate-400">
                Upload your Purchase Register and GSTR-2B data to begin reconciliation
              </p>
            </div>

            {/* Upload Cards */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <FileUploadZone
                label="Purchase Register"
                description="Upload your books or Tally export"
                onFileSelect={handlePrFile}
                fileName={prFile?.name}
              />
              <FileUploadZone
                label="GSTR-2B Data"
                description="Downloaded from GST Portal"
                onFileSelect={handleTwoBFile}
                fileName={twoBFile?.name}
              />
            </div>

            {/* Info Card */}
            <Card className="bg-white/60 dark:bg-slate-800/60 backdrop-blur border-slate-200/60 dark:border-slate-700/60 mb-8">
              <CardContent className="p-5 flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-white mb-1">Expected Columns</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Supplier Name, GSTIN, Invoice No, Invoice Date, Invoice Value, Taxable Value, IGST, CGST, SGST. 
                    The app auto-detects columns from your headers.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Action Button */}
            {prFile && twoBFile && (
              <div className="flex justify-end animate-in fade-in zoom-in-95 duration-300">
                <Button 
                  onClick={handleProceedToMap} 
                  size="lg" 
                  className="gap-2 px-8 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
                >
                  Continue to Mapping <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Column Mapping */}
        {step === 'map' && (
          <div className="max-w-4xl animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Header */}
            <div className="mb-8">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">Map Columns</h2>
              <p className="text-slate-500 dark:text-slate-400">
                Verify or adjust column mappings. Fields marked with * are required.
              </p>
            </div>

            {/* Mappers */}
            <div className="space-y-6 mb-8">
              <ColumnMapper
                title={`Purchase Register — ${prRows.length} rows`}
                headers={prHeaders}
                mapping={prMapping}
                onChange={setPrMapping}
              />
              <ColumnMapper
                title={`GSTR-2B — ${twoBRows.length} rows`}
                headers={twoBHeaders}
                mapping={twoBMapping}
                onChange={setTwoBMapping}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center pt-4 border-t border-slate-200 dark:border-slate-800">
              <Button variant="ghost" onClick={() => setStep('upload')} className="text-slate-600 dark:text-slate-400">
                ← Back to Upload
              </Button>
              <Button
                onClick={handleReconcile}
                disabled={!isMappingComplete(prMapping) || !isMappingComplete(twoBMapping) || processing}
                size="lg"
                className="gap-2 px-8 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
              >
                {processing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Run Reconciliation <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Results */}
        {step === 'results' && summary && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Header */}
            <div className="mb-8">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">Results</h2>
                  <p className="text-slate-500 dark:text-slate-400">
                    {summary.total} records processed • {summary.perfectMatch} perfect matches • {summary.valueMismatch} value mismatches • {summary.invoiceMissing + summary.unmatchedVendor} at ITC risk
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => {
                      const rows: MonthlyComparisonRow[] = results.map((r) => {
                        const pr = r.prRecord;
                        const tb = r.twoBRecord;
                        const totalDiff = (r.cgstDiff !== undefined || r.sgstDiff !== undefined || r.igstDiff !== undefined)
                          ? +(Math.abs(r.cgstDiff ?? 0) + Math.abs(r.sgstDiff ?? 0) + Math.abs(r.igstDiff ?? 0)).toFixed(2)
                          : '';
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
                        };
                      });
                      exportMonthlyComparison(rows, 'Monthly_Comparison_Report.xlsx');
                    }}
                    variant="outline"
                    className="gap-2 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <FileSpreadsheet className="w-4 h-4" /> Export Monthly
                  </Button>
                  <Button
                    onClick={() => exportPartyWise(aggregateByParty(results), 'Party_Wise_Report.xlsx')}
                    variant="outline"
                    className="gap-2 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Users className="w-4 h-4" /> Export Party-wise
                  </Button>
                </div>
              </div>
            </div>

            <SummaryCards summary={summary} />

            {/* Expandable Sections */}
            <div className="space-y-4 mt-8">
              {/* Monthly toggle */}
              <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur rounded-xl border border-slate-200/60 dark:border-slate-700/60 overflow-hidden">
                <button
                  onClick={() => setShowMonthly(!showMonthly)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all duration-300"
                >
                  <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary" /> Month-wise Breakdown
                  </span>
                  <ChevronDown className={cn(
                    'w-5 h-5 text-slate-400 transition-transform duration-300',
                    showMonthly && 'rotate-180'
                  )} />
                </button>
                {showMonthly && (
                  <div className="border-t border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="p-5">
                      <MonthlyBreakdown results={results} />
                    </div>
                  </div>
                )}
              </div>

              {/* Party-wise toggle */}
              <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur rounded-xl border border-slate-200/60 dark:border-slate-700/60 overflow-hidden">
                <button
                  onClick={() => setShowPartyWise(!showPartyWise)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all duration-300"
                >
                  <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" /> Party-wise Reconciliation
                  </span>
                  <ChevronDown className={cn(
                    'w-5 h-5 text-slate-400 transition-transform duration-300',
                    showPartyWise && 'rotate-180'
                  )} />
                </button>
                {showPartyWise && (
                  <div className="border-t border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="p-5">
                      <PartyWiseReport results={results} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Results Tabs */}
            <div className="mt-8">
              <ResultsCategoryTabs results={results} summary={summary} />
            </div>
          </div>
        )}
        </main>
      </div>
    </div>
  );
}
