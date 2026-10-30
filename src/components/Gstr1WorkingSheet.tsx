import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  UploadCloud, Download, FileSpreadsheet, FileJson, Save, FolderOpen,
  RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, ShieldAlert,
  Layers, Database, FileText, ArrowUpRight, Search, Filter, Sparkles,
  ChevronRight, ExternalLink, HardDrive, Check, Loader2, Table, Zap
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Gstr1ReturnData,
  Gstr1B2BInvoice,
  RawSalesRecord,
  classifyOutwardInvoices,
  parseAllInOneFlatRegister,
  generateGstr1PortalJson
} from '@/lib/gstr1Engine';
import {
  generateGstr1V22Workbook,
  generateGstr1SectionCsvs,
  exportCompareGstr3bWithGstr1Detailed,
  TaxLiabilityRow
} from '@/lib/gstr1V22Export';
import { fetchCompanyInfo, fetchTallyVouchers, TallyFlatVoucher } from '@/lib/tallyApi';
import * as XLSX from 'xlsx';

interface Gstr1WorkingSheetProps {
  currentGstin?: string;
  clientName?: string;
  financialYear: string;
  selectedMonth: string;
  gstr3bOutwardTaxable?: number;
  gstr3bOutwardTax?: number;
  onApplyTo3B?: (summary: { taxable: number; igst: number; cgst: number; sgst: number; cess: number; total: number }) => void;
}

export default function Gstr1WorkingSheet({
  currentGstin = '',
  clientName = '',
  financialYear,
  selectedMonth,
  gstr3bOutwardTaxable = 0,
  gstr3bOutwardTax = 0,
  onApplyTo3B
}: Gstr1WorkingSheetProps) {
  // Navigation Section Tab
  const [activeSection, setActiveSection] = useState<'b2b' | 'b2cl' | 'b2cs' | 'cdnr' | 'hsn' | 'docs' | 'eco'>('b2b');
  const [hsnTab, setHsnTab] = useState<'b2b' | 'b2c'>('b2b');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [tallyConnecting, setTallyConnecting] = useState(false);
  const [lastSavedFolder, setLastSavedFolder] = useState<string | null>(null);

  // Return Data State
  const [rawRecords, setRawRecords] = useState<RawSalesRecord[]>([]);

  // Format month to MMYYYY (e.g. "September" + "2026-27" -> "092026")
  const formatPeriodCode = useCallback((monthName: string, fy: string): string => {
    const monthMap: Record<string, string> = {
      'April': '04', 'May': '05', 'June': '06', 'July': '07', 'August': '08', 'September': '09',
      'October': '10', 'November': '11', 'December': '12', 'January': '01', 'February': '02', 'March': '03'
    };
    const mm = monthMap[monthName] || '09';
    const startYr = parseInt(fy.split('-')[0] || '2026', 10);
    const yr = ['January', 'February', 'March'].includes(monthName) ? startYr + 1 : startYr;
    return `${mm}${yr}`;
  }, []);

  const fpCode = useMemo(() => formatPeriodCode(selectedMonth, financialYear), [selectedMonth, financialYear, formatPeriodCode]);

  // Classify records into official GSTR-1 structures
  const returnData: Gstr1ReturnData = useMemo(() => {
    return classifyOutwardInvoices(rawRecords, fpCode, currentGstin, { clientState: 'Maharashtra' });
  }, [rawRecords, fpCode, currentGstin]);

  // Real-Time DRC-01B Difference Calculation
  const r1TotalTaxable = returnData.summary?.totalTaxable || 0;
  const r1TotalTax = returnData.summary?.totalTax || 0;
  const drc01bTaxDiff = Math.round((r1TotalTax - gstr3bOutwardTax) * 100) / 100;
  const drc01bTaxableDiff = Math.round((r1TotalTaxable - gstr3bOutwardTaxable) * 100) / 100;
  const drc01bVarPct = gstr3bOutwardTax > 0 
    ? Math.round(((r1TotalTax - gstr3bOutwardTax) / gstr3bOutwardTax) * 10000) / 100 
    : (r1TotalTax > 0 ? 100 : 0);
  const isDrc01bAlert = drc01bTaxDiff > 50000 && drc01bVarPct > 20;

  // 1-Click Fetch Outward Sales from Tally (Port 9000)
  const handleFetchTallySales = async () => {
    setTallyConnecting(true);
    try {
      const coInfo = await fetchCompanyInfo();
      toast.info(`Connecting to Tally: ${coInfo.name}`);
      const vouchers = await fetchTallyVouchers({ company: coInfo.name });
      const salesVouchers = vouchers.filter((v: TallyFlatVoucher) => 
        ['Sales', 'Credit Note', 'Debit Note'].includes(v.voucherType)
      );

      if (salesVouchers.length === 0) {
        toast.warning('No Sales or Credit/Debit notes found in active Tally company for this period.');
        setTallyConnecting(false);
        return;
      }

      const transformed: RawSalesRecord[] = salesVouchers.map((v: TallyFlatVoucher) => {
        const isNote = ['Credit Note', 'Debit Note'].includes(v.voucherType);
        const noteType = v.voucherType === 'Debit Note' ? 'D' : 'C';
        const isIntra = (v.cgst || 0) > 0 || (v.sgst || 0) > 0;
        const totalTax = (v.igst || 0) + (v.cgst || 0) + (v.sgst || 0);
        const rate = v.taxableValue > 0 ? Math.round((totalTax / v.taxableValue) * 100) : 18;

        return {
          gstin: v.gstin,
          buyerName: v.partyName,
          invoiceNo: v.invoiceNo || v.voucherNumber,
          invoiceDate: v.date,
          invoiceValue: v.totalAmount,
          taxRate: rate,
          taxableValue: v.taxableValue,
          igst: v.igst,
          cgst: v.cgst,
          sgst: v.sgst,
          isCreditDebitNote: isNote,
          noteType: isNote ? noteType : undefined
        };
      });

      setRawRecords(transformed);
      toast.success(`Successfully imported ${transformed.length} outward records from Tally Prime!`);
    } catch (err: any) {
      toast.error(`Tally Connection Error: ${err.message || 'Ensure Tally is running on Port 9000'}`);
    } finally {
      setTallyConnecting(false);
    }
  };

  // Drag and Drop Ingestion of All-In-One Flat Register (TaxPower GSTR1-AllInOne.xlsx format)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        
        let salesRows: any[] = [];
        let cdnRows: any[] = [];

        // Check for "Sales" or first sheet
        const salesSheetName = wb.SheetNames.find(n => /sales|b2b|outward/i.test(n)) || wb.SheetNames[0];
        if (salesSheetName) {
          salesRows = XLSX.utils.sheet_to_json(wb.Sheets[salesSheetName]);
        }
        // Check for "CDN" sheet
        const cdnSheetName = wb.SheetNames.find(n => /cdn|credit|debit/i.test(n));
        if (cdnSheetName && cdnSheetName !== salesSheetName) {
          cdnRows = XLSX.utils.sheet_to_json(wb.Sheets[cdnSheetName]);
        }

        const parsed = parseAllInOneFlatRegister(salesRows, cdnRows);
        if (parsed.length === 0) {
          toast.warning('No valid outward records found in file. Please verify column headers.');
          return;
        }

        setRawRecords(parsed);
        toast.success(`Loaded ${parsed.length} outward transactions from Excel register!`);
      } catch (err: any) {
        toast.error(`Excel Parsing Error: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Silent Auto-Save to <dataPath>/<Client>/<FY>/<Month>/1 Working/
  const handleSaveWorkingSheet = useCallback(async () => {
    setIsSaving(true);
    try {
      const portalJson = generateGstr1PortalJson(returnData);
      const v22Wb = generateGstr1V22Workbook(returnData, { companyName: clientName });
      const excelBase64 = XLSX.write(v22Wb, { bookType: 'xlsx', type: 'base64' });

      // Build DRC-01B comparative row
      const drcRows: TaxLiabilityRow[] = [{
        section: '3.1(a)',
        description: 'Outward taxable supplies',
        gstr3bTaxable: gstr3bOutwardTaxable,
        gstr3bIgst: Math.round(gstr3bOutwardTax * 0.5),
        gstr3bCgst: Math.round(gstr3bOutwardTax * 0.25),
        gstr3bSgst: Math.round(gstr3bOutwardTax * 0.25),
        gstr3bCess: 0,
        gstr1Taxable: returnData.summary?.totalTaxable || 0,
        gstr1Igst: returnData.summary?.totalIgst || 0,
        gstr1Cgst: returnData.summary?.totalCgst || 0,
        gstr1Sgst: returnData.summary?.totalSgst || 0,
        gstr1Cess: returnData.summary?.totalCess || 0
      }];
      const drcWb = exportCompareGstr3bWithGstr1Detailed(drcRows, {
        name: clientName,
        gstin: currentGstin,
        fp: fpCode
      });
      const drc01bBase64 = XLSX.write(drcWb, { bookType: 'xlsx', type: 'base64' });

      // Generate zipped CSVs
      const csvsZipBuffer = await generateGstr1SectionCsvs(returnData);
      const csvsZipBase64 = csvsZipBuffer.toString('base64');

      const res = await fetch('/api/returns/save-gstr1-bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: currentGstin,
          fy: financialYear,
          month: selectedMonth,
          clientName,
          returnData,
          portalJson,
          excelBase64,
          csvsZipBase64,
          drc01bBase64,
          timestamp: Date.now()
        })
      });

      const json = await res.json();
      if (json.success) {
        setLastSavedFolder(json.folderPath);
        toast.success('GSTR-1 Working Sheet Auto-Saved Successfully!', {
          description: `Assets saved in 1 Working folder: ${json.savedFiles?.join(', ')}`,
          action: {
            label: 'Open Folder',
            onClick: () => handleOpenFolder(json.folderPath)
          }
        });
      } else {
        toast.error(`Save failed: ${json.error}`);
      }
    } catch (err: any) {
      toast.error(`Auto-save error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  }, [returnData, clientName, currentGstin, financialYear, selectedMonth, gstr3bOutwardTaxable, gstr3bOutwardTax, fpCode]);

  // Open destination folder in Windows Explorer
  const handleOpenFolder = async (folderPath?: string) => {
    try {
      await fetch('/api/returns/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: folderPath || lastSavedFolder })
      });
    } catch (e) {}
  };

  // Download official JSON
  const handleDownloadJson = () => {
    const jsonStr = generateGstr1PortalJson(returnData, { pretty: true });
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentGstin || 'GSTR1'}_${fpCode}_R1.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded GSTR-1 Portal JSON!');
  };

  // Download official V2.2 32-sheet Excel
  const handleDownloadV22Excel = () => {
    const wb = generateGstr1V22Workbook(returnData, { companyName: clientName });
    XLSX.writeFile(wb, `${currentGstin || 'GSTR1'}_${fpCode}_V2.2.xlsx`);
    toast.success('Downloaded Official V2.2 32-Sheet Excel Workbook (Zero Merges)!');
  };

  // Download DRC-01B Detailed Comparison
  const handleDownloadDrc01bExcel = () => {
    const drcRows: TaxLiabilityRow[] = [{
      section: '3.1(a)',
      description: 'Outward taxable supplies',
      gstr3bTaxable: gstr3bOutwardTaxable,
      gstr3bIgst: Math.round(gstr3bOutwardTax * 0.5),
      gstr3bCgst: Math.round(gstr3bOutwardTax * 0.25),
      gstr3bSgst: Math.round(gstr3bOutwardTax * 0.25),
      gstr3bCess: 0,
      gstr1Taxable: returnData.summary?.totalTaxable || 0,
      gstr1Igst: returnData.summary?.totalIgst || 0,
      gstr1Cgst: returnData.summary?.totalCgst || 0,
      gstr1Sgst: returnData.summary?.totalSgst || 0,
      gstr1Cess: returnData.summary?.totalCess || 0
    }];
    const wb = exportCompareGstr3bWithGstr1Detailed(drcRows, {
      name: clientName,
      gstin: currentGstin,
      fp: fpCode
    });
    XLSX.writeFile(wb, `CompareGSTR3BWithGSTR1Detailed_${currentGstin}_${fpCode}.xlsx`);
    toast.success('Downloaded DRC-01B Outward Liability Comparison Workbook!');
  };

  // 1-Click Autonomous Upload to GST Portal Offline Screen
  const handleUploadDirectlyToPortal = async () => {
    if (!currentGstin) {
      toast.error('Client GSTIN is required for portal upload.');
      return;
    }
    setIsUploading(true);
    toast.info('Launching autonomous Playwright uploader for GSTR-1...', {
      description: 'Browser will open and navigate to GSTR-1 Prepare Offline screen.'
    });

    try {
      const portalJson = generateGstr1PortalJson(returnData);
      const res = await fetch('/api/returns/upload-1-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: currentGstin,
          month: selectedMonth,
          financialYear,
          portalJson
        })
      });

      const json = await res.json();
      if (json.success) {
        toast.success('GSTR-1 JSON Uploaded Directly to Portal Successfully!', {
          description: json.message
        });
      } else {
        toast.error(`Portal Upload Error: ${json.error}`);
      }
    } catch (err: any) {
      toast.error(`Autonomous Upload Error: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Hotkey listener for Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveWorkingSheet();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveWorkingSheet]);

  return (
    <div className="space-y-4">
      {/* ── Top Metric Cards & Hero HUD ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Taxable</p>
          <p className="text-lg font-bold text-white font-mono mt-0.5">₹{(returnData.summary?.totalTaxable || 0).toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-400">IGST Outward</p>
          <p className="text-lg font-bold text-blue-400 font-mono mt-0.5">₹{(returnData.summary?.totalIgst || 0).toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">CGST Outward</p>
          <p className="text-lg font-bold text-emerald-400 font-mono mt-0.5">₹{(returnData.summary?.totalCgst || 0).toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">SGST Outward</p>
          <p className="text-lg font-bold text-emerald-400 font-mono mt-0.5">₹{(returnData.summary?.totalSgst || 0).toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-400">Total Outward Tax</p>
          <p className="text-lg font-bold text-purple-400 font-mono mt-0.5">₹{(returnData.summary?.totalTax || 0).toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">B2B Invoices</p>
          <p className="text-lg font-bold text-amber-400 font-mono mt-0.5">{returnData.summary?.b2bCount || 0}</p>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Total Documents</p>
          <p className="text-lg font-bold text-slate-100 font-mono mt-0.5">{returnData.summary?.totalInvoices || 0}</p>
        </div>
      </div>

      {/* ── DRC-01B Real-Time Difference Guard Banner ── */}
      <div className={`p-3.5 rounded-xl border flex flex-col md:flex-row items-center justify-between gap-3 text-sm transition-all ${
        isDrc01bAlert
          ? 'bg-rose-950/40 border-rose-500/50 text-rose-200'
          : drc01bTaxDiff !== 0
          ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
          : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
      }`}>
        <div className="flex items-center gap-3">
          {isDrc01bAlert ? (
            <div className="p-2 bg-rose-500/20 text-rose-400 rounded-lg">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
          ) : drc01bTaxDiff !== 0 ? (
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
              <AlertTriangle className="w-5 h-5" />
            </div>
          ) : (
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
          )}
          <div>
            <div className="font-semibold flex items-center gap-2">
              <span>DRC-01B Difference Guard:</span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-black/40">
                GSTR-1 (₹{r1TotalTax.toLocaleString('en-IN')}) vs GSTR-3B 3.1(a) (₹{gstr3bOutwardTax.toLocaleString('en-IN')})
              </span>
            </div>
            <p className="text-xs opacity-80 mt-0.5">
              {isDrc01bAlert
                ? `⚠️ CRITICAL: Outward liability in GSTR-1 exceeds GSTR-3B by ₹${drc01bTaxDiff.toLocaleString('en-IN')} (${drc01bVarPct}%). Exceeds the statutory ₹50,000 / 20% limit for automatic DRC-01B notice!`
                : drc01bTaxDiff !== 0
                ? `Variance: ₹${Math.abs(drc01bTaxDiff).toLocaleString('en-IN')} (${drc01bVarPct}%). Ensure Table 3.1 is aligned before final submission.`
                : '✓ Outward liability between GSTR-1 and GSTR-3B is 100% matched. Zero DRC-01B scrutiny risk.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onApplyTo3B && r1TotalTaxable > 0 && (
            <button
              onClick={() => onApplyTo3B({
                taxable: returnData.summary?.totalTaxable || 0,
                igst: returnData.summary?.totalIgst || 0,
                cgst: returnData.summary?.totalCgst || 0,
                sgst: returnData.summary?.totalSgst || 0,
                cess: returnData.summary?.totalCess || 0,
                total: returnData.summary?.totalTax || 0
              })}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow"
            >
              <Zap className="w-3.5 h-3.5" /> Push R1 to 3B Table 3.1
            </button>
          )}
          <button
            onClick={handleDownloadDrc01bExcel}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> DRC-01B Statement (.xlsx)
          </button>
        </div>
      </div>

      {/* ── Ingestion Dropzone & Action Bar ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* Tally Port 9000 Button */}
          <button
            onClick={handleFetchTallySales}
            disabled={tallyConnecting}
            className="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-semibold text-xs rounded-lg flex items-center gap-2 shadow transition-all disabled:opacity-50"
          >
            {tallyConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4 text-amber-200" />}
            Fetch from Tally (Port 9000)
          </button>

          {/* Excel File Dropzone / Button */}
          <label className="cursor-pointer px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs rounded-lg flex items-center gap-2 transition-all">
            <UploadCloud className="w-4 h-4 text-cyan-400" />
            Import All-In-One Sales Register (.xlsx)
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
          </label>

          <span className="text-xs text-slate-500">
            {rawRecords.length > 0 ? `${rawRecords.length} records loaded` : 'No file loaded'}
          </span>
        </div>

        {/* Action Buttons Deck */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveWorkingSheet}
            disabled={isSaving}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow"
            title="Save working papers directly to client month directory (Ctrl+S)"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-blue-400" />}
            Save Working (Ctrl+S)
          </button>

          <button
            onClick={handleDownloadJson}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow"
          >
            <FileJson className="w-3.5 h-3.5 text-amber-400" />
            Download JSON
          </button>

          <button
            onClick={handleDownloadV22Excel}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            V2.2 Excel (32-Sheets)
          </button>

          {/* 1-Click Autonomous Upload Directly to GST Portal */}
          <button
            onClick={handleUploadDirectlyToPortal}
            disabled={isUploading}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-lg flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition-all disabled:opacity-50"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            Upload JSON directly to Portal
          </button>
        </div>
      </div>

      {/* ── Section Navigation Tabs ── */}
      <div className="border-b border-slate-800 flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveSection('b2b')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeSection === 'b2b'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            4. B2B, SEZ, DE
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
              {returnData.summary?.b2bCount || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveSection('b2cl')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeSection === 'b2cl'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            5. B2CL (Large &gt; ₹1L)
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
              {returnData.summary?.b2clCount || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveSection('b2cs')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeSection === 'b2cs'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            7. B2CS (Small)
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
              {returnData.summary?.b2csCount || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveSection('cdnr')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeSection === 'cdnr'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            9B. Credit / Debit Notes
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
              {(returnData.summary?.cdnrCount || 0) + (returnData.summary?.cdnurCount || 0)}
            </span>
          </button>

          <button
            onClick={() => setActiveSection('hsn')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeSection === 'hsn'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            12. HSN Summary
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
              {returnData.summary?.hsnCount || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveSection('docs')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeSection === 'docs'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            13. Documents Issued
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
              {returnData.summary?.docsCount || 0}
            </span>
          </button>
        </div>

        {/* Search Filter Input */}
        <div className="relative w-64 pb-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search invoice, GSTIN, party..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* ── Table Workspace ── */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {/* SECTION 4: B2B */}
        {activeSection === 'b2b' && (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 sticky top-0 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800 tracking-wider">
                <tr>
                  <th className="p-2.5">GSTIN of Recipient</th>
                  <th className="p-2.5">Receiver Name</th>
                  <th className="p-2.5">Invoice No</th>
                  <th className="p-2.5">Date</th>
                  <th className="p-2.5 text-right">Value (₹)</th>
                  <th className="p-2.5 text-center">POS</th>
                  <th className="p-2.5 text-center">Rate</th>
                  <th className="p-2.5 text-right">Taxable (₹)</th>
                  <th className="p-2.5 text-right">IGST (₹)</th>
                  <th className="p-2.5 text-right">CGST (₹)</th>
                  <th className="p-2.5 text-right">SGST (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-slate-300 font-mono">
                {returnData.b2b?.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-10 text-slate-500 font-sans">
                      No B2B invoices found. Import a sales register or fetch from Tally to prepare your return.
                    </td>
                  </tr>
                ) : (
                  returnData.b2b?.flatMap(g => 
                    g.inv.flatMap(inv => 
                      inv.itms.map((itm, itmIdx) => (
                        <tr key={`${g.ctin}-${inv.inum}-${itmIdx}`} className="hover:bg-slate-900/40">
                          <td className="p-2.5 text-blue-400 font-semibold">{g.ctin}</td>
                          <td className="p-2.5 font-sans truncate max-w-[180px]">{inv.buyerName || '-'}</td>
                          <td className="p-2.5 text-white font-bold">{inv.inum}</td>
                          <td className="p-2.5">{inv.idt}</td>
                          <td className="p-2.5 text-right">₹{inv.val.toLocaleString('en-IN')}</td>
                          <td className="p-2.5 text-center">{inv.pos}</td>
                          <td className="p-2.5 text-center">{itm.itm_det.rt}%</td>
                          <td className="p-2.5 text-right text-slate-200">₹{itm.itm_det.txval.toLocaleString('en-IN')}</td>
                          <td className="p-2.5 text-right text-blue-400">₹{(itm.itm_det.iamt || 0).toLocaleString('en-IN')}</td>
                          <td className="p-2.5 text-right text-emerald-400">₹{(itm.itm_det.camt || 0).toLocaleString('en-IN')}</td>
                          <td className="p-2.5 text-right text-emerald-400">₹{(itm.itm_det.samt || 0).toLocaleString('en-IN')}</td>
                        </tr>
                      ))
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* SECTION 5: B2CL */}
        {activeSection === 'b2cl' && (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 sticky top-0 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800 tracking-wider">
                <tr>
                  <th className="p-2.5">Invoice No</th>
                  <th className="p-2.5">Date</th>
                  <th className="p-2.5 text-right">Invoice Value (₹)</th>
                  <th className="p-2.5 text-center">Place of Supply</th>
                  <th className="p-2.5 text-center">Rate</th>
                  <th className="p-2.5 text-right">Taxable Value (₹)</th>
                  <th className="p-2.5 text-right">IGST (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-slate-300 font-mono">
                {returnData.b2cl?.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-500 font-sans">
                      No B2CL invoices (Inter-state unregistered &gt; ₹1,00,000) for this period.
                    </td>
                  </tr>
                ) : (
                  returnData.b2cl?.flatMap(g =>
                    g.inv.flatMap(inv =>
                      inv.itms.map((itm, itmIdx) => (
                        <tr key={`${inv.inum}-${itmIdx}`} className="hover:bg-slate-900/40">
                          <td className="p-2.5 text-white font-bold">{inv.inum}</td>
                          <td className="p-2.5">{inv.idt}</td>
                          <td className="p-2.5 text-right">₹{inv.val.toLocaleString('en-IN')}</td>
                          <td className="p-2.5 text-center">{g.pos}</td>
                          <td className="p-2.5 text-center">{itm.itm_det.rt}%</td>
                          <td className="p-2.5 text-right text-slate-200">₹{itm.itm_det.txval.toLocaleString('en-IN')}</td>
                          <td className="p-2.5 text-right text-blue-400">₹{(itm.itm_det.iamt || 0).toLocaleString('en-IN')}</td>
                        </tr>
                      ))
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* SECTION 7: B2CS */}
        {activeSection === 'b2cs' && (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 sticky top-0 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800 tracking-wider">
                <tr>
                  <th className="p-2.5">Type</th>
                  <th className="p-2.5 text-center">Place of Supply</th>
                  <th className="p-2.5 text-center">Rate</th>
                  <th className="p-2.5 text-right">Taxable Value (₹)</th>
                  <th className="p-2.5 text-right">IGST (₹)</th>
                  <th className="p-2.5 text-right">CGST (₹)</th>
                  <th className="p-2.5 text-right">SGST (₹)</th>
                  <th className="p-2.5 text-right">Cess (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-slate-300 font-mono">
                {returnData.b2cs?.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-slate-500 font-sans">
                      No B2CS consolidated records for this period.
                    </td>
                  </tr>
                ) : (
                  returnData.b2cs?.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/40">
                      <td className="p-2.5 font-sans font-semibold text-slate-200">{item.sply_ty} ({item.typ})</td>
                      <td className="p-2.5 text-center">{item.pos}</td>
                      <td className="p-2.5 text-center">{item.rt}%</td>
                      <td className="p-2.5 text-right text-white font-bold">₹{item.txval.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right text-blue-400">₹{(item.iamt || 0).toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right text-emerald-400">₹{(item.camt || 0).toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right text-emerald-400">₹{(item.samt || 0).toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right text-slate-400">₹{(item.csamt || 0).toLocaleString('en-IN')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* SECTION 9B: CDNR (Registered) & CDNUR (Unregistered) */}
        {activeSection === 'cdnr' && (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 sticky top-0 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800 tracking-wider">
                <tr>
                  <th className="p-2.5">GSTIN / Recipient</th>
                  <th className="p-2.5">Receiver Name</th>
                  <th className="p-2.5 text-center">Type</th>
                  <th className="p-2.5">Note No</th>
                  <th className="p-2.5">Note Date</th>
                  <th className="p-2.5 text-right">Note Value (₹)</th>
                  <th className="p-2.5 text-center">POS</th>
                  <th className="p-2.5 text-center">Rate</th>
                  <th className="p-2.5 text-right">Taxable (₹)</th>
                  <th className="p-2.5 text-right">IGST (₹)</th>
                  <th className="p-2.5 text-right">CGST (₹)</th>
                  <th className="p-2.5 text-right">SGST (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-slate-300 font-mono">
                {((returnData.cdnr?.length || 0) === 0 && (returnData.cdnur?.length || 0) === 0) ? (
                  <tr>
                    <td colSpan={12} className="text-center py-10 text-slate-500 font-sans">
                      No Credit or Debit notes found for this period.
                    </td>
                  </tr>
                ) : (
                  <>
                    {returnData.cdnr?.flatMap(g =>
                      g.nt.flatMap(n =>
                        n.itms.map((itm, itmIdx) => (
                          <tr key={`cdnr-${g.ctin}-${n.nt_num}-${itmIdx}`} className="hover:bg-slate-900/40">
                            <td className="p-2.5 text-blue-400 font-semibold">{g.ctin}</td>
                            <td className="p-2.5 font-sans truncate max-w-[180px]">{n.buyerName || '-'}</td>
                            <td className="p-2.5 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                n.ntty === 'C' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              }`}>
                                {n.ntty === 'C' ? 'Credit Note' : 'Debit Note'}
                              </span>
                            </td>
                            <td className="p-2.5 text-white font-bold">{n.nt_num}</td>
                            <td className="p-2.5">{n.nt_dt}</td>
                            <td className="p-2.5 text-right">₹{n.val.toLocaleString('en-IN')}</td>
                            <td className="p-2.5 text-center">{n.pos}</td>
                            <td className="p-2.5 text-center">{itm.itm_det.rt}%</td>
                            <td className="p-2.5 text-right text-slate-200">₹{itm.itm_det.txval.toLocaleString('en-IN')}</td>
                            <td className="p-2.5 text-right text-blue-400">₹{(itm.itm_det.iamt || 0).toLocaleString('en-IN')}</td>
                            <td className="p-2.5 text-right text-emerald-400">₹{(itm.itm_det.camt || 0).toLocaleString('en-IN')}</td>
                            <td className="p-2.5 text-right text-emerald-400">₹{(itm.itm_det.samt || 0).toLocaleString('en-IN')}</td>
                          </tr>
                        ))
                      )
                    )}
                    {returnData.cdnur?.flatMap(n =>
                      n.itms.map((itm, itmIdx) => (
                        <tr key={`cdnur-${n.nt_num}-${itmIdx}`} className="hover:bg-slate-900/40">
                          <td className="p-2.5 text-amber-400 font-semibold">URP ({n.typ})</td>
                          <td className="p-2.5 font-sans truncate max-w-[180px]">{n.buyerName || 'Unregistered'}</td>
                          <td className="p-2.5 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              n.ntty === 'C' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}>
                              {n.ntty === 'C' ? 'Credit Note' : 'Debit Note'}
                            </span>
                          </td>
                          <td className="p-2.5 text-white font-bold">{n.nt_num}</td>
                          <td className="p-2.5">{n.nt_dt}</td>
                          <td className="p-2.5 text-right">₹{n.val.toLocaleString('en-IN')}</td>
                          <td className="p-2.5 text-center">{n.pos}</td>
                          <td className="p-2.5 text-center">{itm.itm_det.rt}%</td>
                          <td className="p-2.5 text-right text-slate-200">₹{itm.itm_det.txval.toLocaleString('en-IN')}</td>
                          <td className="p-2.5 text-right text-blue-400">₹{(itm.itm_det.iamt || 0).toLocaleString('en-IN')}</td>
                          <td className="p-2.5 text-right text-emerald-400">₹{(itm.itm_det.camt || 0).toLocaleString('en-IN')}</td>
                          <td className="p-2.5 text-right text-emerald-400">₹{(itm.itm_det.samt || 0).toLocaleString('en-IN')}</td>
                        </tr>
                      ))
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* SECTION 12: HSN SUMMARY (BIFURCATED) */}
        {activeSection === 'hsn' && (
          <div>
            <div className="p-2.5 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHsnTab('b2b')}
                  className={`px-3 py-1 rounded text-xs font-semibold ${
                    hsnTab === 'b2b' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  HSN for B2B Supplies ({returnData.hsn?.hsn_b2b?.length || 0})
                </button>
                <button
                  onClick={() => setHsnTab('b2c')}
                  className={`px-3 py-1 rounded text-xs font-semibold ${
                    hsnTab === 'b2c' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  HSN for B2C Supplies ({returnData.hsn?.hsn_b2c?.length || 0})
                </button>
              </div>
              <span className="text-[11px] text-slate-400">
                Official Rule: Split into hsn_b2b and hsn_b2c w.e.f. Release 3.2.2+
              </span>
            </div>

            <div className="overflow-x-auto max-h-[460px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/90 sticky top-0 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800 tracking-wider">
                  <tr>
                    <th className="p-2.5">HSN Code</th>
                    <th className="p-2.5">Description</th>
                    <th className="p-2.5 text-center">UQC</th>
                    <th className="p-2.5 text-right">Quantity</th>
                    <th className="p-2.5 text-right">Total Value (₹)</th>
                    <th className="p-2.5 text-center">Rate</th>
                    <th className="p-2.5 text-right">Taxable (₹)</th>
                    <th className="p-2.5 text-right">IGST (₹)</th>
                    <th className="p-2.5 text-right">CGST (₹)</th>
                    <th className="p-2.5 text-right">SGST (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900 text-slate-300 font-mono">
                  {(hsnTab === 'b2b' ? returnData.hsn?.hsn_b2b : returnData.hsn?.hsn_b2c)?.map((h, i) => (
                    <tr key={i} className="hover:bg-slate-900/40">
                      <td className="p-2.5 text-amber-400 font-bold">{h.hsn_sc}</td>
                      <td className="p-2.5 font-sans truncate max-w-[200px]">{h.desc}</td>
                      <td className="p-2.5 text-center font-sans">{h.uqc}</td>
                      <td className="p-2.5 text-right">{h.qty}</td>
                      <td className="p-2.5 text-right">₹{h.val.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-center">{h.rt}%</td>
                      <td className="p-2.5 text-right text-white">₹{h.txval.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right text-blue-400">₹{h.iamt.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right text-emerald-400">₹{h.camt.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right text-emerald-400">₹{h.samt.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION 13: DOCUMENTS ISSUED */}
        {activeSection === 'docs' && (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 sticky top-0 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800 tracking-wider">
                <tr>
                  <th className="p-2.5">Nature of Document</th>
                  <th className="p-2.5">Sr. No. From</th>
                  <th className="p-2.5">Sr. No. To</th>
                  <th className="p-2.5 text-right">Total Number</th>
                  <th className="p-2.5 text-right text-rose-400">Cancelled</th>
                  <th className="p-2.5 text-right text-emerald-400">Net Issued</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-slate-300 font-mono">
                {returnData.doc_issue?.doc_det?.flatMap(g =>
                  g.docs.map((d, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/40">
                      <td className="p-2.5 font-sans font-semibold text-slate-200">{g.doc_typ}</td>
                      <td className="p-2.5 text-blue-400 font-bold">{d.from}</td>
                      <td className="p-2.5 text-blue-400 font-bold">{d.to}</td>
                      <td className="p-2.5 text-right">{d.totnum}</td>
                      <td className="p-2.5 text-right text-rose-400">{d.canc}</td>
                      <td className="p-2.5 text-right text-emerald-400 font-bold">{d.net_issue}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
