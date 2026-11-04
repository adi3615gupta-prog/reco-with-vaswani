import React, { useState, useCallback, useRef } from 'react';
import {
  ArrowLeft, Download, RefreshCw, FileSpreadsheet,
  AlertCircle, CheckCircle2, Server, Settings, CalendarClock, ShieldAlert,
  Search, Info, Database, Lightbulb
} from 'lucide-react';
import { toast } from 'sonner';
import { pingTally, fetchCompanyInfo, fetchVouchers, type TallyCompanyInfo, type TallyFlatVoucher } from '@/lib/tallyApi';
import { parseFile, detectColumnMapping, mapToRecords, type ColumnMapping } from '@/lib/fileParser';
import { parseFileAsync } from '@/lib/asyncWorkerService';
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
      const { headers } = await parseFileAsync(f);
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
      const parsed = await parseFileAsync(twoBFile);
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
    <div className="w-full max-w-[1520px] mx-auto space-y-5 pb-16 select-text relative z-10 animate-fade-in font-sans text-slate-900">
      
      {/* ─── Top Elevated Header Bar ─── */}
      <header className="bg-white/95 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 border border-slate-200/80">
        <div className="flex items-center gap-3.5 min-w-0">
          <button 
            onClick={onBack} 
            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 transition shrink-0 cursor-pointer"
            title="Back to Central Command Hub"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200/70 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold tracking-wide uppercase text-slate-900 leading-tight">
                ITC Compliance &amp; 12M Return Tracker
              </h1>
              <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 font-bold uppercase tracking-wider shrink-0">
                Suite 01.3 · YTD Engine
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5 truncate max-w-xl">
              Verify GSTR-2B invoice-wise matches &amp; parse monthly GSTR-3B returns summary.
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2.5">
          {activeTab === '2b' && results && (
            <button 
              onClick={exportTrackerReport} 
              className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" /> Download Tracker Report
            </button>
          )}
        </div>
      </header>

      {/* ─── Collapsible Quick Guide ─── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 text-slate-700 shadow-2xs">
        <button
          onClick={() => setShowQuickGuide(!showQuickGuide)}
          className="flex items-center justify-between w-full text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-slate-800">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            Quick ITC Tracker User Guide
          </span>
          <span className="text-xs text-indigo-600 font-bold hover:underline">{showQuickGuide ? 'Hide Instructions' : 'Show Instructions'}</span>
        </button>
        {showQuickGuide && (
          <div className="mt-4 pt-4 border-t border-slate-200/80 text-xs text-slate-600 space-y-4 animate-in fade-in slide-in-from-top-1 duration-350">
            <p className="leading-relaxed"><strong>Overview:</strong> Track dynamic monthly ITC flows, analyze claimed vs available credits, and inspect GSTR-2B or GSTR-3B return summaries.</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="font-bold text-slate-800 mb-1.5">Step-by-step Guide:</p>
                <ol className="space-y-1.5 pl-4 list-decimal text-slate-600">
                  <li><strong>Choose Mode:</strong> Select GSTR-2B Full Year Tracker or GSTR-3B Summary tab.</li>
                  <li><strong>Fetch Books:</strong> Connect to Tally or define date ranges to fetch purchase entries.</li>
                  <li><strong>Upload Portal:</strong> Select and drag the GSTR-2B spreadsheet and confirm mappings.</li>
                  <li><strong>Execute:</strong> Click "Run ITC Tracker Analysis" to review Safe ITC, Missing ITC, and Missed claims.</li>
                </ol>
              </div>
              <div>
                <p className="font-bold text-slate-800 mb-1.5">Differences with normal Reco Engine:</p>
                <ul className="space-y-1.5 pl-4 list-disc text-slate-600">
                  <li>This tracker is optimized for year-to-date monthly summaries.</li>
                  <li>Supports direct GSTR-3B comparison tables to prevent over/under-claiming ITC in filed returns.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Tab Switcher ─── */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-2xs p-1.5 flex gap-2">
        <button
          onClick={() => setActiveTab('2b')}
          className={`flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === '2b'
              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
          }`}
        >
          <Search className="w-4 h-4 text-indigo-600" /> 
          <span>GSTR-2B Full Year ITC Tracker</span>
        </button>
        <button
          onClick={() => setActiveTab('3b')}
          className={`flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === '3b'
              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-indigo-600" /> 
          <span>GSTR-3B Month-wise ITC Summary</span>
        </button>
      </div>

      {activeTab === '3b' ? (
        <GSTR3BAnalyzer companyName={globalCompanyName} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left Col: Tally Data */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Server className="w-4 h-4 text-indigo-600" /> Step 1: Fetch Books (ITC Taken)
                </h3>
                <p className="text-xs text-slate-500 mt-1">Directly extract all purchase and journal entries where ITC was claimed.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">From Date</label>
                  <input 
                    type="date" 
                    value={fromDate} 
                    onChange={e => setFromDate(e.target.value)} 
                    className="w-full h-10 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl px-3 text-xs font-medium text-slate-900 focus:border-indigo-400 outline-none transition-all" 
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">To Date</label>
                  <input 
                    type="date" 
                    value={toDate} 
                    onChange={e => setToDate(e.target.value)} 
                    className="w-full h-10 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl px-3 text-xs font-medium text-slate-900 focus:border-indigo-400 outline-none transition-all" 
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={connectToTally} 
                  className="h-10 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-xs transition-colors flex items-center gap-2 shadow-2xs cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-600" /> Connect Tally
                </button>
                {connectionStatus === 'connected' && (
                  <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Connected ({companyInfo?.name})
                  </span>
                )}
              </div>

              <button
                onClick={handleFetchTally}
                disabled={connectionStatus !== 'connected' || isFetchingTally}
                className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                {isFetchingTally ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                Fetch ITC Taken from Tally
              </button>

              {tallyRecords.length > 0 && (
                <div className="p-3 bg-indigo-50 border border-indigo-200/80 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold text-indigo-900">{tallyRecords.length} tax-related vouchers loaded</span>
                  </div>
                </div>
              )}
            </div>

            {/* Right Col: 2B Data */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Step 2: GSTR-2B (ITC Available)
                </h3>
                <p className="text-xs text-slate-500 mt-1">Upload the GSTR-2B Excel file downloaded from the GST Portal.</p>
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
                  <button onClick={handleConfirm2BMapping} className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-xs cursor-pointer">
                    Confirm Column Mapping
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-900">{twoBFile.name} loaded</span>
                  </div>
                  <div className="text-xs text-emerald-700">
                    {twoBRecords.length} invoices mapped from GSTR-2B.
                  </div>
                  <button onClick={() => { setTwoBFile(null); setTwoBRecords([]); }} className="text-xs text-rose-600 hover:text-rose-700 font-semibold cursor-pointer underline">
                    Remove File
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Run Action */}
          <div className="flex justify-center py-2">
            <button
              onClick={handleRunTracker}
              disabled={tallyRecords.length === 0 || twoBRecords.length === 0 || isProcessing}
              className="h-12 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-xs flex items-center justify-center gap-2.5 cursor-pointer"
            >
              {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Run ITC Tracker Analysis
            </button>
          </div>

          {/* Results Summary */}
          {results && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-4">
              <div className="bg-white border border-slate-200/80 border-l-4 border-l-emerald-500 rounded-2xl p-5 shadow-xs">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">1. ITC Matched (Safe)</h4>
                <div className="text-3xl font-black text-slate-900 mt-2">
                  {results.filter(r => r.status === 'Perfect Match' || r.status === 'Matched (Diff Date)' || r.status === 'Value Mismatch').length}
                </div>
                <p className="text-xs text-emerald-700 font-semibold mt-1">ITC taken matches exactly with 2B.</p>
              </div>
              <div className="bg-white border border-slate-200/80 border-l-4 border-l-rose-500 rounded-2xl p-5 shadow-xs">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">2. ITC Taken but Missing in 2B</h4>
                <div className="text-3xl font-black text-slate-900 mt-2">
                  {results.filter(r => r.status === 'Not in 2B' || r.status === 'Unmatched Vendor').length}
                </div>
                <p className="text-xs text-rose-700 font-semibold mt-1">Risk: Vendors haven't filed GSTR-1.</p>
              </div>
              <div className="bg-white border border-slate-200/80 border-l-4 border-l-indigo-500 rounded-2xl p-5 shadow-xs">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">3. ITC Missed in Books</h4>
                <div className="text-3xl font-black text-slate-900 mt-2">
                  {results.filter(r => r.status === 'Not in Books' || r.status === 'Missing in PR').length}
                </div>
                <p className="text-xs text-indigo-700 font-semibold mt-1">Opportunity: Available in 2B but not claimed.</p>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}
