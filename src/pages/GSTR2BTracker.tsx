import React, { useState, useCallback, useRef } from 'react';
import {
  ArrowLeft, Download, RefreshCw, FileSpreadsheet,
  AlertCircle, CheckCircle2, Server, Settings, CalendarClock, ShieldAlert,
  Search, Info, Database, Lightbulb
} from 'lucide-react';
import { toast } from 'sonner';
import { pingTally, fetchCompanyInfo, fetchVouchers, type TallyCompanyInfo, type TallyFlatVoucher } from '@/lib/tallyApi';
import { parseFile, detectColumnMapping, mapToRecords, type ColumnMapping } from '@/lib/fileParser';
import { reconcile, type ReconciliationResult, type MatchStatus, type InvoiceRecord } from '@/lib/reconciliation';
import * as XLSX from 'xlsx-js-style';
import { FileUploadZone } from '@/components/FileUploadZone';
import { ColumnMapper } from '@/components/ColumnMapper';
import { GSTR3BAnalyzer } from '@/components/GSTR3BAnalyzer';

interface GSTR2BTrackerProps {
  onBack: () => void;
  companyName: string;
}

export default function GSTR2BTracker({ onBack, companyName: globalCompanyName }: GSTR2BTrackerProps) {
  const [showQuickGuide, setShowQuickGuide] = useState(false);
  // Tab control
  const [activeTab, setActiveTab] = useState<'2b' | '3b'>('2b');

  // Connection
  const [tallyPort, setTallyPort] = useState(9000);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [companyInfo, setCompanyInfo] = useState<TallyCompanyInfo | null>(null);

  // Date range
  const today = new Date();
  const fyStart = today.getMonth() >= 3
    ? `${today.getFullYear()}-04-01`
    : `${today.getFullYear() - 1}-04-01`;
  const [fromDate, setFromDate] = useState(fyStart);
  const [toDate, setToDate] = useState(today.toISOString().slice(0, 10));

  // Tally Data
  const [isFetchingTally, setIsFetchingTally] = useState(false);
  const [tallyRecords, setTallyRecords] = useState<InvoiceRecord[]>([]);
  const [customTaxLedgers, setCustomTaxLedgers] = useState<{ name: string, category: 'CGST' | 'SGST' | 'IGST', type: 'Input' | 'Output' | 'RCM' }[]>([]);

  // 2B Data
  const [twoBFile, setTwoBFile] = useState<File | null>(null);
  const [twoBHeaders, setTwoBHeaders] = useState<string[]>([]);
  const [twoBMapping, setTwoBMapping] = useState<Partial<ColumnMapping>>({});
  const [twoBRecords, setTwoBRecords] = useState<InvoiceRecord[]>([]);
  const [isMapping2B, setIsMapping2B] = useState(false);

  // Reconciliation Results
  const [results, setResults] = useState<ReconciliationResult[] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const connectToTally = async () => {
    setConnectionStatus('connecting');
    try {
      const alive = await pingTally({ host: 'localhost', port: tallyPort });
      if (!alive) {
        setConnectionStatus('error');
        toast.error('Cannot reach Tally');
        return;
      }
      const info = await fetchCompanyInfo({ host: 'localhost', port: tallyPort });
      setCompanyInfo(info);
      setConnectionStatus('connected');

      try {
        const storedTax = localStorage.getItem(`tallyCustomTaxLedgers_${info.name}`);
        if (storedTax) {
          setCustomTaxLedgers(JSON.parse(storedTax));
        } else {
          const fallbackTax = localStorage.getItem('tallyCustomTaxLedgers');
          if (fallbackTax) {
            setCustomTaxLedgers(JSON.parse(fallbackTax));
            localStorage.setItem(`tallyCustomTaxLedgers_${info.name}`, fallbackTax);
          } else {
            setCustomTaxLedgers([]);
          }
        }
      } catch (e) { }

      toast.success('Connected to Tally!', {
        description: `Company: ${info.name} (Mappings loaded)`
      });
    } catch (err) {
      setConnectionStatus('error');
      toast.error('Connection failed');
    }
  };

  const handleFetchTally = async () => {
    setIsFetchingTally(true);
    setTallyRecords([]);
    try {
      const config = { host: 'localhost', port: tallyPort };

      const purchaseData = await fetchVouchers('Purchase', ['Purchase'], fromDate, toDate, config, ['ITC'], ['OUTPUT'], customTaxLedgers);
      const creditNoteData = await fetchVouchers('Credit Note', ['Credit Note'], fromDate, toDate, config, ['ITC'], ['OUTPUT'], customTaxLedgers);
      const debitNoteData = await fetchVouchers('Debit Note', ['Debit Note'], fromDate, toDate, config, ['ITC'], ['OUTPUT'], customTaxLedgers);
      const journalData = await fetchVouchers('Journal', ['Journal'], fromDate, toDate, config, ['ITC'], ['OUTPUT'], customTaxLedgers);

      const allData = [...purchaseData, ...creditNoteData, ...debitNoteData, ...journalData];

      const records: InvoiceRecord[] = allData.map(v => {
        return {
          supplierName: v.partyName || v.voucherType,
          gstin: v.gstin,
          invoiceNo: v.invoiceNo || v.voucherNumber,
          invoiceDate: v.date,
          igst: v.igst,
          cgst: v.cgst,
          sgst: v.sgst,
          source: 'PR' as const,
          taxableValue: v.taxableValue
        };
      }).filter(r => r.igst > 0 || r.cgst > 0 || r.sgst > 0);

      setTallyRecords(records);
      toast.success(`Fetched ${records.length} tax-related vouchers from Tally!`);
    } catch (err) {
      toast.error('Fetch failed', { description: String(err) });
    } finally {
      setIsFetchingTally(false);
    }
  };

  const handleTwoBUpload = async (f: File) => {
    setTwoBFile(f);
    try {
      const { headers } = await parseFile(f);
      setTwoBHeaders(headers);
      setTwoBMapping(detectColumnMapping(headers));
      setIsMapping2B(true);
    } catch (err) {
      toast.error('Failed to parse 2B file');
    }
  };

  const handleConfirm2BMapping = async () => {
    if (!twoBFile) return;
    try {
      const parsed = await parseFile(twoBFile);
      const recs = mapToRecords(parsed.rows, twoBMapping as ColumnMapping, '2B', 'GSTR-2B');
      setTwoBRecords(recs);
      setIsMapping2B(false);
      toast.success(`Parsed ${recs.length} invoices from GSTR-2B`);
    } catch (err) {
      toast.error('Mapping failed');
    }
  };

  const handleRunTracker = async () => {
    if (tallyRecords.length === 0 || twoBRecords.length === 0) {
      toast.error("Need both Tally data and 2B data");
      return;
    }

    setIsProcessing(true);
    try {
      await new Promise(r => setTimeout(r, 100)); // yield
      const res = reconcile(tallyRecords, twoBRecords, 'input', 2, 5);
      setResults(res);
      toast.success('Tracker analysis complete!');
    } catch (e) {
      toast.error('Error during reconciliation');
    } finally {
      setIsProcessing(false);
    }
  };

  const exportTrackerReport = () => {
    if (!results) return;

    // Categorize
    const itcTakenMatched = results.filter(r => r.status === 'Perfect Match' || r.status === 'Matched (Diff Date)' || r.status === 'Value Mismatch');
    const itcTakenMissing2B = results.filter(r => r.status === 'Not in 2B' || r.status === 'Unmatched Vendor');
    const itcMissedInBooks = results.filter(r => r.status === 'Not in Books' || r.status === 'Missing in PR');

    const wb = XLSX.utils.book_new();

    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "0F172A" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    };

    const createSheet = (data: ReconciliationResult[], title: string, desc: string) => {
      const rows = data.map(r => {
        const pr = r.prRecord;
        const tb = r.twoBRecord;
        return {
          'Status': r.status,
          'Party Name (Tally)': pr?.supplierName || '',
          'Party Name (2B)': tb?.supplierName || '',
          'GSTIN': pr?.gstin || tb?.gstin || '',
          'Invoice No (Tally)': pr?.invoiceNo || '',
          'Invoice No (2B)': tb?.invoiceNo || '',
          'Invoice Date (Tally)': pr?.invoiceDate || '',
          'Invoice Date (2B)': tb?.invoiceDate || '',
          'IGST (Tally)': pr?.igst || 0,
          'CGST (Tally)': pr?.cgst || 0,
          'SGST (Tally)': pr?.sgst || 0,
          'IGST (2B)': tb?.igst || 0,
          'CGST (2B)': tb?.cgst || 0,
          'SGST (2B)': tb?.sgst || 0,
          'Diff IGST': r.igstDiff || 0,
          'Diff CGST': r.cgstDiff || 0,
          'Diff SGST': r.sgstDiff || 0,
          'Remarks': r.remark || ''
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);

      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const address = XLSX.utils.encode_col(C) + "1";
        if (!ws[address]) continue;
        ws[address].s = headerStyle;
      }
      return ws;
    };

    XLSX.utils.book_append_sheet(wb, createSheet(itcTakenMatched, 'Matched', 'ITC taken matches with 2B'), "1. ITC Matched");
    XLSX.utils.book_append_sheet(wb, createSheet(itcTakenMissing2B, 'Missing 2B', 'ITC taken but not in 2B'), "2. ITC Taken but Missing in 2B");
    XLSX.utils.book_append_sheet(wb, createSheet(itcMissedInBooks, 'Missed Books', 'In 2B but ITC not taken'), "3. ITC Missed in Books");

    XLSX.writeFile(wb, `GSTR2B_ITC_Tracker_${new Date().getTime()}.xlsx`);
    toast.success('Excel report downloaded successfully!');
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between glass-card-np p-6 rounded-2xl border border-blue-500/20 shadow-[0_0_30px_rgba(59,130,246,0.1)]">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
              <ArrowLeft className="w-5 h-5 text-blue-400" />
            </button>
            <div>
              <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
                ITC Compliance Tracker
              </h1>
              <p className="text-sm text-slate-400 font-medium">Verify GSTR-2B invoice-wise matches & parse monthly GSTR-3B returns summary.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {activeTab === '2b' && results && (
              <button onClick={exportTrackerReport} className="h-10 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2">
                <Download className="w-4 h-4" /> Download Tracker Report
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Quick Guide */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 text-slate-300 backdrop-blur-md shadow-lg max-w-6xl mx-auto">
          <button
            onClick={() => setShowQuickGuide(!showQuickGuide)}
            className="flex items-center justify-between w-full text-slate-300 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
              <Lightbulb className="w-4 h-4 text-yellow-400" />
              Quick ITC Tracker User Guide
            </span>
            <span className="text-xs text-blue-400 font-bold hover:underline">{showQuickGuide ? 'Hide' : 'Show Instructions'}</span>
          </button>
          {showQuickGuide && (
            <div className="mt-4 pt-4 border-t border-slate-800/80 text-xs text-slate-400 space-y-4 animate-in fade-in slide-in-from-top-1 duration-350">
              <p><strong>Overview:</strong> Track dynamic monthly ITC flows, analyze claimed vs available credits, and inspect GSTR-2B or GSTR-3B return summaries.</p>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="font-bold text-slate-300 mb-1.5">Step-by-step Steps:</p>
                  <ol className="space-y-1.5 pl-4 list-decimal">
                    <li><strong>Choose Mode:</strong> Select GSTR-2B Full Year Tracker or GSTR-3B Summary tab.</li>
                    <li><strong>Fetch Books:</strong> Connect to Tally or define date ranges to fetch purchase entries.</li>
                    <li><strong>Upload Portal:</strong> Select and drag the GSTR-2B spreadsheet and confirm mappings.</li>
                    <li><strong>Execute:</strong> Click "Run ITC Tracker Analysis" to review Safe ITC, Missing ITC, and Missed claims.</li>
                  </ol>
                </div>
                <div>
                  <p className="font-bold text-slate-300 mb-1.5">Differences with normal Reco Engine:</p>
                  <ul className="space-y-1.5 pl-4 list-disc text-slate-400">
                    <li>This tracker is optimized for year-to-date monthly summaries.</li>
                    <li>Supports direct GSTR-3B comparison tables to prevent over/under-claiming ITC in filed returns.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 bg-slate-900/60 p-1.5 rounded-2xl border border-slate-800 backdrop-blur-md">
          <button
            onClick={() => setActiveTab('2b')}
            className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === '2b'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
          >
            <Search className="w-4 h-4" /> GSTR-2B Full Year ITC Tracker
          </button>
          <button
            onClick={() => setActiveTab('3b')}
            className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === '3b'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
          >
            <FileSpreadsheet className="w-4 h-4" /> GSTR-3B Month-wise ITC Summary
          </button>
        </div>

        {activeTab === '3b' ? (
          <GSTR3BAnalyzer companyName={globalCompanyName} />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Col: Tally Data */}
              <div className="glass-card-np p-6 rounded-2xl border border-slate-800 space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                  <Database className="w-24 h-24 text-blue-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Server className="w-5 h-5 text-blue-400" /> Step 1: Fetch Books (ITC Taken)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">Directly extract all purchase and journal entries where ITC was claimed.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">From Date</label>
                    <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full h-10 bg-slate-900/80 border border-slate-700 rounded-lg px-3 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">To Date</label>
                    <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full h-10 bg-slate-900/80 border border-slate-700 rounded-lg px-3 text-sm" />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={connectToTally} className="h-10 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-sm transition-colors border border-slate-700 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" /> Connect Tally
                  </button>
                  {connectionStatus === 'connected' && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" /> Connected ({companyInfo?.name})
                    </span>
                  )}
                </div>

                <button
                  onClick={handleFetchTally}
                  disabled={connectionStatus !== 'connected' || isFetchingTally}
                  className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                  {isFetchingTally ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                  Fetch ITC Taken from Tally
                </button>

                {tallyRecords.length > 0 && (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-medium text-blue-100">{tallyRecords.length} tax-related vouchers loaded</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Col: 2B Data */}
              <div className="glass-card-np p-6 rounded-2xl border border-slate-800 space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                  <FileSpreadsheet className="w-24 h-24 text-emerald-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-400" /> Step 2: GSTR-2B (ITC Available)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">Upload the GSTR-2B Excel file downloaded from the GST Portal.</p>
                </div>

                {!twoBFile ? (
                  <FileUploadZone
                    onFileSelect={handleTwoBUpload}
                    label="Upload GSTR-2B (Excel)"
                    description="Drag & drop or click to browse"
                  />
                ) : isMapping2B ? (
                  <div className="space-y-4">
                    <ColumnMapper
                      title="GSTR-2B Mapping"
                      headers={twoBHeaders}
                      mapping={twoBMapping}
                      onChange={setTwoBMapping}
                    />
                    <button onClick={handleConfirm2BMapping} className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold text-sm">
                      Confirm Column Mapping
                    </button>
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <span className="text-sm font-bold text-emerald-100">{twoBFile.name} loaded</span>
                    </div>
                    <div className="text-xs text-emerald-200/70">
                      {twoBRecords.length} invoices mapped from GSTR-2B.
                    </div>
                    <button onClick={() => { setTwoBFile(null); setTwoBRecords([]); }} className="text-xs text-red-400 hover:text-red-300 font-medium">
                      Remove File
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Run Action */}
            <div className="flex justify-center py-4">
              <button
                onClick={handleRunTracker}
                disabled={tallyRecords.length === 0 || twoBRecords.length === 0 || isProcessing}
                className="h-14 px-8 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 disabled:grayscale text-white font-black text-lg transition-all shadow-[0_0_40px_rgba(139,92,246,0.3)] hover:scale-105 flex items-center justify-center gap-3 tracking-wide"
              >
                {isProcessing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                Run ITC Tracker Analysis
              </button>
            </div>

            {/* Results Summary */}
            {results && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-4">
                <div className="glass-card-np p-5 rounded-2xl border-l-4 border-l-emerald-500">
                  <h4 className="text-sm font-bold text-slate-400">1. ITC Matched (Safe)</h4>
                  <div className="text-3xl font-black text-white mt-2">
                    {results.filter(r => r.status === 'Perfect Match' || r.status === 'Matched (Diff Date)' || r.status === 'Value Mismatch').length}
                  </div>
                  <p className="text-xs text-emerald-400 mt-1">ITC taken matches exactly with 2B.</p>
                </div>
                <div className="glass-card-np p-5 rounded-2xl border-l-4 border-l-red-500">
                  <h4 className="text-sm font-bold text-slate-400">2. ITC Taken but Missing in 2B</h4>
                  <div className="text-3xl font-black text-white mt-2">
                    {results.filter(r => r.status === 'Not in 2B' || r.status === 'Unmatched Vendor').length}
                  </div>
                  <p className="text-xs text-red-400 mt-1">Risk: Vendors haven't filed GSTR-1.</p>
                </div>
                <div className="glass-card-np p-5 rounded-2xl border-l-4 border-l-blue-500">
                  <h4 className="text-sm font-bold text-slate-400">3. ITC Missed in Books</h4>
                  <div className="text-3xl font-black text-white mt-2">
                    {results.filter(r => r.status === 'Not in Books' || r.status === 'Missing in PR').length}
                  </div>
                  <p className="text-xs text-blue-400 mt-1">Opportunity: Available in 2B but not claimed.</p>
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
