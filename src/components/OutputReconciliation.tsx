import React, { useState } from 'react';
import { parseMultipleGSTR1Files, parseFile, detectColumnMapping, mapToRecords, type ColumnMapping } from '../lib/fileParser';
import { reconcile, getSummary, type ReconciliationResult, type ReconciliationSummary } from '../lib/reconciliation';
import { cn } from '../lib/utils';
import { ColumnMapper, isMappingComplete } from './ColumnMapper';
import { FileUploadZone } from './FileUploadZone';
import { FileSpreadsheet, CheckCircle2, UploadCloud, X, RefreshCw } from 'lucide-react';
import { getApiBase } from '@/lib/api';

type PortalFileType = 'b2b' | 'b2c' | 'b2cl' | 'cn' | 'nil' | null;

interface PortalFile {
  file: File;
  type: PortalFileType;
}

export default function OutputReconciliation() {
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [salesHeaders, setSalesHeaders] = useState<string[]>([]);
  const [salesRawRows, setSalesRawRows] = useState<Record<string, unknown>[]>([]);
  const [salesMapping, setSalesMapping] = useState<Partial<ColumnMapping>>({});
  const [isMappingSales, setIsMappingSales] = useState(false);

  const [portalFiles, setPortalFiles] = useState<PortalFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ReconciliationResult[] | null>(null);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSalesFile = async (file: File | null) => {
    setSalesFile(file);
    setResults(null);
    setSummary(null);
    setError(null);

    if (file) {
      try {
        const { headers, rows } = await parseFile(file);
        setSalesHeaders(headers);
        setSalesRawRows(rows);
        setSalesMapping(detectColumnMapping(headers));
        setIsMappingSales(true);
      } catch (err) {
        setError("Failed to parse Sales Register file.");
      }
    } else {
      setIsMappingSales(false);
    }
  };

  const handleGstr1FilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPortalFiles(files.map(f => ({ file: f, type: null })));
    // Clear previous results when new files are uploaded
    setResults(null);
    setSummary(null);
    setError(null);
  };

  const updatePortalFileType = (index: number, type: PortalFileType) => {
    setPortalFiles(prev => prev.map((pf, i) => i === index ? { ...pf, type } : pf));
  };

  const handleReconcile = async () => {
    if (!salesFile || portalFiles.length === 0) {
      setError('Please upload both the Sales Register and Portal Data files.');
      return;
    }

    const allPortalAssigned = portalFiles.every(pf => pf.type !== null);
    if (!allPortalAssigned) {
      setError('Please assign a type to all uploaded Portal Data files.');
      return;
    }

    if (!isMappingComplete(salesMapping, true)) {
      setError('Please complete the column mapping for the Sales Register.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // 1. Normalize Sales Register columns using mapped values so the backend understands them
      const normalizedSales = salesRawRows.map(row => ({
        ...row,
        'Invoice No.': row[salesMapping.invoiceNo as string],
        'Invoice Date': row[salesMapping.invoiceDate as string],
        'GST No.': row[salesMapping.gstin as string],
        'Party': row[salesMapping.supplierName as string],
        'Taxable': row[salesMapping.taxableValue as string],
        'IGST': row[salesMapping.igst as string],
        'CGST': row[salesMapping.cgst as string],
        'SGST': row[salesMapping.sgst as string],
      }));

      // 2. Categorize and extract raw JSON from Portal Files based on manual types
      const portalB2B: any[] = [];
      const portalB2C: any[] = [];
      const portalB2CL: any[] = [];
      const portalCN: any[] = [];
      const portalNil: any[] = [];

      for (const pf of portalFiles) {
        const raw = await parseFile(pf.file);
        
        if (pf.type === 'b2b') portalB2B.push(...raw.rows);
        else if (pf.type === 'b2c') portalB2C.push(...raw.rows);
        else if (pf.type === 'b2cl') portalB2CL.push(...raw.rows);
        else if (pf.type === 'cn') portalCN.push(...raw.rows);
        else if (pf.type === 'nil') portalNil.push(...raw.rows);
      }

      // 3. Send the raw data payloads to the Node.js Backend Engine
      const response = await fetch(`${getApiBase()}/api/reconcile-output`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booksSales: normalizedSales,
          booksReturns: [], // Assuming returns are contained within the sales register or can be added later
          portalB2B,
          portalB2C,
          portalB2CL,
          portalCN,
          portalNil
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Server error during reconciliation');
      }

      // 4. Handle the file stream response and trigger an automatic download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "GSTR1_Reconciliation_Output.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Dummy summary visually confirming process success
      setSummary({ total: salesRawRows.length, perfectMatch: 0, valueMismatch: 0, missingIn2B: 0, missingInPR: 0, wrongGstin: 0, priorFyExcluded: 0 } as any);
    } catch (err: any) {
      console.error('Reconciliation error:', err);
      setError(err.message || 'An error occurred during reconciliation.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-black text-white tracking-tight">Output Reconciliation</h1>
        <p className="text-slate-400 font-medium">Compare your internal Sales Register against your downloaded Portal Data.</p>
      </div>

      {error && (
        <div className="bg-rose-500/10 border-l-4 border-rose-500 p-4 text-rose-400 rounded-r-xl">
          <p className="font-bold uppercase tracking-wider text-[10px]">Error</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Sales Register Upload */}
        <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col h-full">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            1. Sales Register (Books)
          </h2>
          <FileUploadZone 
            label="Upload Sales Register"
            description="Drag & drop your internal sales books (Excel/CSV)"
            onFileSelect={handleSalesFile}
            fileName={salesFile?.name}
          />

          {isMappingSales && (
            <div className="mt-6 animate-in fade-in slide-in-from-top-4 flex-1">
              <ColumnMapper 
                title="Map Sales Columns"
                headers={salesHeaders}
                mapping={salesMapping}
                onChange={setSalesMapping}
                requireTaxable={true}
                labelOverrides={{ supplierName: 'Customer Name' }}
              />
            </div>
          )}
        </div>

        {/* Portal Data Upload */}
        <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col h-full">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            2. Portal Data
          </h2>
          {!portalFiles.length ? (
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-xl cursor-pointer bg-slate-900/50 hover:bg-slate-800/50 transition-all group">
              <UploadCloud className="w-8 h-8 text-slate-500 group-hover:text-emerald-400 mb-2 transition-colors" />
              <p className="text-sm font-semibold text-slate-300 group-hover:text-white">Upload Portal Files</p>
              <p className="text-xs text-slate-500">Select multiple Govt CSVs/XLSX</p>
              <input type="file" multiple accept=".xlsx,.csv" className="hidden" onChange={handleGstr1FilesChange} />
            </label>
          ) : (
            <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl animate-in fade-in slide-in-from-top-4 flex-1">
              <div className="flex items-center gap-2 mb-4 border-b border-emerald-500/20 pb-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-emerald-400">{portalFiles.length} File(s) Loaded</h3>
              </div>
              <div className="flex flex-col gap-3">
                 {portalFiles.map((pf, i) => (
                   <div key={i} className="flex items-center justify-between p-3 bg-slate-900 border border-slate-700 rounded-lg">
                     <span className="text-xs font-medium text-slate-300 truncate max-w-[150px]" title={pf.file.name}>{pf.file.name}</span>
                     <select 
                       value={pf.type || ""} 
                       onChange={(e) => updatePortalFileType(i, e.target.value as PortalFileType)}
                       className="bg-slate-800 text-xs text-white border border-slate-600 rounded p-1.5 focus:outline-none focus:border-emerald-500 transition-colors"
                     >
                       <option value="" disabled>Select Type...</option>
                       <option value="b2b">B2B</option>
                       <option value="b2c">B2C</option>
                       <option value="b2cl">B2CL</option>
                       <option value="cn">Credit Note (CDNR)</option>
                       <option value="nil">Nil Rated</option>
                     </select>
                   </div>
                 ))}
              </div>
              <button onClick={() => setPortalFiles([])} className="mt-4 text-[10px] font-bold text-rose-400 uppercase tracking-wider hover:text-rose-300 flex items-center gap-1">
                <X className="w-3 h-3" /> Clear Files
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end sticky bottom-6 z-40 bg-slate-900/80 backdrop-blur-md border border-slate-800 p-5 rounded-2xl shadow-2xl">
        <button
          onClick={handleReconcile}
          disabled={isProcessing || !salesFile || portalFiles.length === 0 || !isMappingComplete(salesMapping, true) || !portalFiles.every(pf => pf.type !== null)}
          className={cn(
            "px-8 py-3.5 font-black uppercase tracking-widest text-xs rounded-xl transition-all flex items-center gap-2 shadow-lg",
            isProcessing || !salesFile || portalFiles.length === 0 || !isMappingComplete(salesMapping, true) || !portalFiles.every(pf => pf.type !== null)
              ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
              : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-500/20 hover:scale-[1.02]"
          )}
        >
          {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
          {isProcessing ? 'Processing Output...' : 'Run Output Reconciliation'}
        </button>
      </div>

      {summary && (
        <div className="bg-slate-900/60 p-6 rounded-2xl shadow-xl border border-slate-800 mt-8 space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-3">Reconciliation Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard title="Total Records" count={summary.total} color="text-blue-400 bg-blue-500/10 border-blue-500/20" />
            <SummaryCard title="Perfect Matches" count={summary.perfectMatch} color="text-emerald-400 bg-emerald-500/10 border-emerald-500/20" />
            <SummaryCard title="Value Mismatches" count={summary.valueMismatch} color="text-amber-400 bg-amber-500/10 border-amber-500/20" />
            <SummaryCard title="Missing in GSTR-1" count={summary.missingIn2B} color="text-rose-400 bg-rose-500/10 border-rose-500/20" />
            <SummaryCard title="Missing in Sales" count={summary.missingInPR} color="text-indigo-400 bg-indigo-500/10 border-indigo-500/20" />
            <SummaryCard title="Wrong GSTINs" count={summary.wrongGstin} color="text-red-400 bg-red-500/10 border-red-500/20" />
            <SummaryCard title="Prior FY" count={summary.priorFyExcluded} color="text-slate-400 bg-slate-500/10 border-slate-500/20" />
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, count, color }: { title: string, count: number, color: string }) {
  return (
    <div className={cn("p-5 rounded-xl border flex flex-col items-center justify-center text-center", color)}>
      <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">{title}</span>
      <span className="text-3xl font-black mt-2 font-mono">{count}</span>
    </div>
  );
}
