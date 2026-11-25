import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  UploadCloud, Download, FileSpreadsheet, FileJson, Save, FolderOpen,
  RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, ShieldAlert,
  Layers, Database, FileText, ArrowUpRight, Search, Filter, Sparkles,
  ChevronRight, ExternalLink, HardDrive, Check, Loader2, Table, Zap, X
} from 'lucide-react';
import { toast } from 'sonner';
import { safeApiFetch } from '@/lib/api';
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
  gstr3bOutwardIgst?: number;
  gstr3bOutwardCgst?: number;
  gstr3bOutwardSgst?: number;
  gstr3bOutwardCess?: number;
  onApplyTo3B?: (summary: { taxable: number; igst: number; cgst: number; sgst: number; cess: number; total: number }) => void;
}

export default function Gstr1WorkingSheet({
  currentGstin = '',
  clientName = '',
  financialYear,
  selectedMonth,
  gstr3bOutwardTaxable = 0,
  gstr3bOutwardTax = 0,
  gstr3bOutwardIgst,
  gstr3bOutwardCgst,
  gstr3bOutwardSgst,
  gstr3bOutwardCess,
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
  const eff3bIgst = gstr3bOutwardIgst !== undefined ? gstr3bOutwardIgst : Math.round(gstr3bOutwardTax * 0.5);
  const eff3bCgst = gstr3bOutwardCgst !== undefined ? gstr3bOutwardCgst : Math.round(gstr3bOutwardTax * 0.25);
  const eff3bSgst = gstr3bOutwardSgst !== undefined ? gstr3bOutwardSgst : Math.round(gstr3bOutwardTax * 0.25);
  const eff3bCess = gstr3bOutwardCess !== undefined ? gstr3bOutwardCess : 0;

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
        gstr3bIgst: eff3bIgst,
        gstr3bCgst: eff3bCgst,
        gstr3bSgst: eff3bSgst,
        gstr3bCess: eff3bCess,
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

      const res = await safeApiFetch('/api/returns/save-gstr1-bundle', {
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
  }, [returnData, clientName, currentGstin, financialYear, selectedMonth, gstr3bOutwardTaxable, eff3bIgst, eff3bCgst, eff3bSgst, eff3bCess, fpCode]);

  // Open destination folder in Windows Explorer
  const handleOpenFolder = async (folderPath?: string) => {
    try {
      await safeApiFetch('/api/returns/open-folder', {
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
      gstr3bIgst: eff3bIgst,
      gstr3bCgst: eff3bCgst,
      gstr3bSgst: eff3bSgst,
      gstr3bCess: eff3bCess,
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
      const res = await safeApiFetch('/api/returns/upload-1-portal', {
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

  // Filtered B2B Rows with live search
  const filteredB2BRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!returnData.b2b) return [];
    return returnData.b2b.flatMap(g =>
      g.inv.flatMap(inv =>
        inv.itms.map((itm, itmIdx) => ({
          ctin: g.ctin,
          buyerName: inv.buyerName || '',
          inum: inv.inum,
          idt: inv.idt,
          val: inv.val,
          pos: inv.pos,
          rt: itm.itm_det.rt,
          txval: itm.itm_det.txval,
          iamt: itm.itm_det.iamt || 0,
          camt: itm.itm_det.camt || 0,
          samt: itm.itm_det.samt || 0,
          csamt: itm.itm_det.csamt || 0,
          key: `${g.ctin}-${inv.inum}-${itmIdx}`
        }))
      )
    ).filter(r => {
      if (!q) return true;
      return (
        r.ctin.toLowerCase().includes(q) ||
        r.buyerName.toLowerCase().includes(q) ||
        r.inum.toLowerCase().includes(q)
      );
    });
  }, [returnData.b2b, searchQuery]);

  return (
    <div className="space-y-3.5 animate-fade-in">
      {/* ── Top Metric Cards & Hero HUD (Modern Crisp Architecture) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-xs">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">Total Taxable</p>
          <p className="text-base sm:text-lg font-bold text-slate-900 font-mono mt-0.5 truncate">
            ₹{(returnData.summary?.totalTaxable || 0).toLocaleString('en-IN')}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-xs">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-blue-600">IGST Outward</p>
          <p className="text-base sm:text-lg font-bold text-blue-600 font-mono mt-0.5 truncate">
            ₹{(returnData.summary?.totalIgst || 0).toLocaleString('en-IN')}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-xs">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-600">CGST Outward</p>
          <p className="text-base sm:text-lg font-bold text-emerald-600 font-mono mt-0.5 truncate">
            ₹{(returnData.summary?.totalCgst || 0).toLocaleString('en-IN')}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-xs">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-600">SGST Outward</p>
          <p className="text-base sm:text-lg font-bold text-emerald-600 font-mono mt-0.5 truncate">
            ₹{(returnData.summary?.totalSgst || 0).toLocaleString('en-IN')}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-xs">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-purple-700">Total Outward Tax</p>
          <p className="text-base sm:text-lg font-bold text-purple-700 font-mono mt-0.5 truncate">
            ₹{(returnData.summary?.totalTax || 0).toLocaleString('en-IN')}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-xs">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-amber-600">B2B Invoices</p>
          <p className="text-base sm:text-lg font-bold text-amber-600 font-mono mt-0.5 truncate">
            {returnData.summary?.b2bCount || 0}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-xs">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-700">Total Documents</p>
          <p className="text-base sm:text-lg font-bold text-slate-900 font-mono mt-0.5 truncate">
            {returnData.summary?.totalInvoices || 0}
          </p>
        </div>
      </div>

      {/* ── DRC-01B Real-Time Difference Guard Banner ── */}
      <div className={`p-3.5 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-3 text-xs transition-all shadow-xs ${
        isDrc01bAlert
          ? 'bg-rose-50 border-rose-200 text-rose-900'
          : drc01bTaxDiff !== 0
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
      }`}>
        <div className="flex items-center gap-3">
          {isDrc01bAlert ? (
            <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
          ) : drc01bTaxDiff !== 0 ? (
            <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </div>
          ) : (
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
          )}
          <div>
            <div className="font-bold flex items-center gap-2 flex-wrap">
              <span>DRC-01B Difference Guard:</span>
              <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-white/80 border border-current">
                GSTR-1 (₹{r1TotalTax.toLocaleString('en-IN')}) vs GSTR-3B 3.1(a) (₹{gstr3bOutwardTax.toLocaleString('en-IN')})
              </span>
            </div>
            <p className="text-xs opacity-90 mt-0.5 leading-snug">
              {isDrc01bAlert
                ? `⚠️ CRITICAL: Outward liability in GSTR-1 exceeds GSTR-3B by ₹${drc01bTaxDiff.toLocaleString('en-IN')} (${drc01bVarPct}%). Exceeds the statutory ₹50,000 / 20% limit for automatic DRC-01B notice!`
                : drc01bTaxDiff !== 0
                ? `Variance: ₹${Math.abs(drc01bTaxDiff).toLocaleString('en-IN')} (${drc01bVarPct}%). Ensure Table 3.1 is aligned before final submission.`
                : '✓ Outward liability between GSTR-1 and GSTR-3B is 100% matched. Zero DRC-01B scrutiny risk.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {onApplyTo3B && r1TotalTaxable > 0 && (
            <button
              type="button"
              onClick={() => onApplyTo3B({
                taxable: returnData.summary?.totalTaxable || 0,
                igst: returnData.summary?.totalIgst || 0,
                cgst: returnData.summary?.totalCgst || 0,
                sgst: returnData.summary?.totalSgst || 0,
                cess: returnData.summary?.totalCess || 0,
                total: returnData.summary?.totalTax || 0
              })}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" /> Push R1 to 3B Table 3.1
            </button>
          )}
          <button
            type="button"
            onClick={handleDownloadDrc01bExcel}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> DRC-01B Statement (.xlsx)
          </button>
        </div>
      </div>

      {/* ── Ingestion Dropzone & Action Bar ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Tally Port 9000 Button */}
          <button
            type="button"
            onClick={handleFetchTallySales}
            disabled={tallyConnecting}
            className="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {tallyConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4 text-amber-200" />}
            <span>Fetch from Tally (Port 9000)</span>
          </button>

          {/* Excel File Dropzone / Button */}
          <label className="cursor-pointer px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-bold text-xs rounded-xl flex items-center gap-2 transition-all shadow-2xs active:scale-95">
            <UploadCloud className="w-4 h-4 text-cyan-600" />
            <span>Import All-In-One Sales Register (.xlsx)</span>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
          </label>

          <span className="text-xs text-slate-500 font-mono">
            {rawRecords.length > 0 ? `${rawRecords.length} records loaded` : 'No file loaded'}
          </span>
        </div>

        {/* Action Buttons Deck */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSaveWorkingSheet}
            disabled={isSaving}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            title="Save working papers directly to client month directory (Ctrl+S)"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-blue-600" />}
            <span>Save Working (Ctrl+S)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadJson}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
          >
            <FileJson className="w-3.5 h-3.5 text-amber-600" />
            <span>Download JSON</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadV22Excel}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>V2.2 Excel (32-Sheets)</span>
          </button>

          {/* 1-Click Autonomous Upload Directly to GST Portal */}
          <button
            type="button"
            onClick={handleUploadDirectlyToPortal}
            disabled={isUploading}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            <span>Upload JSON directly to Portal</span>
          </button>
        </div>
      </div>

      {/* ── Section Navigation Tabs ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-2 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 flex-wrap overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSection('b2b')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSection === 'b2b'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>4. B2B, SEZ, DE</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${activeSection === 'b2b' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {returnData.summary?.b2bCount || 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('b2cl')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSection === 'b2cl'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>5. B2CL (&gt; ₹1L)</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${activeSection === 'b2cl' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {returnData.summary?.b2clCount || 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('b2cs')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSection === 'b2cs'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>7. B2CS (Small)</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${activeSection === 'b2cs' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {returnData.summary?.b2csCount || 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('cdnr')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSection === 'cdnr'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>9B. Credit / Debit Notes</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${activeSection === 'cdnr' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {(returnData.summary?.cdnrCount || 0) + (returnData.summary?.cdnurCount || 0)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('hsn')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSection === 'hsn'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>12. HSN Summary</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${activeSection === 'hsn' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {returnData.summary?.hsnCount || 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('docs')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSection === 'docs'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>13. Documents Issued</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${activeSection === 'docs' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {returnData.summary?.docsCount || 0}
            </span>
          </button>
        </div>

        {/* Search Filter Input with live reset */}
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Filter invoice, GSTIN, party..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-7 py-1.5 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Table Workspace (High-Contrast Slate Architecture) ── */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
        {/* SECTION 4: B2B */}
        {activeSection === 'b2b' && (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 sticky top-0 text-slate-600 uppercase text-[10.5px] font-bold border-b border-slate-200 tracking-wider">
                <tr>
                  <th className="p-3">GSTIN of Recipient</th>
                  <th className="p-3">Receiver Name</th>
                  <th className="p-3">Invoice No</th>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Value (₹)</th>
                  <th className="p-3 text-center">POS</th>
                  <th className="p-3 text-center">Rate</th>
                  <th className="p-3 text-right">Taxable (₹)</th>
                  <th className="p-3 text-right">IGST (₹)</th>
                  <th className="p-3 text-right">CGST (₹)</th>
                  <th className="p-3 text-right">SGST (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                {filteredB2BRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-slate-400 font-sans">
                      <Table className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold text-slate-600">No B2B invoices found for {selectedMonth}.</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Import an outward sales register (.xlsx) or click "Fetch from Tally (Port 9000)" to load records.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredB2BRows.map((r) => (
                    <tr key={r.key} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-blue-600 font-bold">{r.ctin}</td>
                      <td className="p-3 font-sans truncate max-w-[180px] text-slate-800 font-medium">{r.buyerName || '-'}</td>
                      <td className="p-3 text-slate-900 font-bold">{r.inum}</td>
                      <td className="p-3 text-slate-500">{r.idt}</td>
                      <td className="p-3 text-right font-bold text-slate-900">₹{r.val.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-center">{r.pos}</td>
                      <td className="p-3 text-center">{r.rt}%</td>
                      <td className="p-3 text-right text-slate-800 font-semibold">₹{r.txval.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right text-blue-600">₹{r.iamt.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right text-emerald-600">₹{r.camt.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right text-emerald-600">₹{r.samt.toLocaleString('en-IN')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* SECTION 5: B2CL */}
        {activeSection === 'b2cl' && (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 sticky top-0 text-slate-600 uppercase text-[10.5px] font-bold border-b border-slate-200 tracking-wider">
                <tr>
                  <th className="p-3">Invoice No</th>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Invoice Value (₹)</th>
                  <th className="p-3 text-center">Place of Supply</th>
                  <th className="p-3 text-center">Rate</th>
                  <th className="p-3 text-right">Taxable Value (₹)</th>
                  <th className="p-3 text-right">IGST (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                {returnData.b2cl?.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400 font-sans">
                      <p className="font-semibold text-slate-600">No B2CL invoices found.</p>
                      <p className="text-xs text-slate-400 mt-1">Inter-state unregistered supplies &gt; ₹1,00,000 will be classified here automatically.</p>
                    </td>
                  </tr>
                ) : (
                  returnData.b2cl?.flatMap(g =>
                    g.inv.flatMap(inv =>
                      inv.itms.map((itm, itmIdx) => (
                        <tr key={`${inv.inum}-${itmIdx}`} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 text-slate-900 font-bold">{inv.inum}</td>
                          <td className="p-3 text-slate-500">{inv.idt}</td>
                          <td className="p-3 text-right font-bold text-slate-900">₹{inv.val.toLocaleString('en-IN')}</td>
                          <td className="p-3 text-center">{g.pos}</td>
                          <td className="p-3 text-center">{itm.itm_det.rt}%</td>
                          <td className="p-3 text-right text-slate-800 font-semibold">₹{itm.itm_det.txval.toLocaleString('en-IN')}</td>
                          <td className="p-3 text-right text-blue-600">₹{(itm.itm_det.iamt || 0).toLocaleString('en-IN')}</td>
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
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 sticky top-0 text-slate-600 uppercase text-[10.5px] font-bold border-b border-slate-200 tracking-wider">
                <tr>
                  <th className="p-3">Type</th>
                  <th className="p-3 text-center">Place of Supply</th>
                  <th className="p-3 text-center">Rate</th>
                  <th className="p-3 text-right">Taxable Value (₹)</th>
                  <th className="p-3 text-right">IGST (₹)</th>
                  <th className="p-3 text-right">CGST (₹)</th>
                  <th className="p-3 text-right">SGST (₹)</th>
                  <th className="p-3 text-right">Cess (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                {returnData.b2cs?.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400 font-sans">
                      <p className="font-semibold text-slate-600">No B2CS consolidated records for this period.</p>
                      <p className="text-xs text-slate-400 mt-1">Intra-state and small inter-state unregistered supplies will aggregate here.</p>
                    </td>
                  </tr>
                ) : (
                  returnData.b2cs?.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-sans font-semibold text-slate-800">{item.sply_ty} ({item.typ})</td>
                      <td className="p-3 text-center">{item.pos}</td>
                      <td className="p-3 text-center">{item.rt}%</td>
                      <td className="p-3 text-right text-slate-900 font-bold">₹{item.txval.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right text-blue-600">₹{(item.iamt || 0).toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right text-emerald-600">₹{(item.camt || 0).toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right text-emerald-600">₹{(item.samt || 0).toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right text-slate-500">₹{(item.csamt || 0).toLocaleString('en-IN')}</td>
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
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 sticky top-0 text-slate-600 uppercase text-[10.5px] font-bold border-b border-slate-200 tracking-wider">
                <tr>
                  <th className="p-3">GSTIN / Recipient</th>
                  <th className="p-3">Receiver Name</th>
                  <th className="p-3 text-center">Type</th>
                  <th className="p-3">Note No</th>
                  <th className="p-3">Note Date</th>
                  <th className="p-3 text-right">Note Value (₹)</th>
                  <th className="p-3 text-center">POS</th>
                  <th className="p-3 text-center">Rate</th>
                  <th className="p-3 text-right">Taxable (₹)</th>
                  <th className="p-3 text-right">IGST (₹)</th>
                  <th className="p-3 text-right">CGST (₹)</th>
                  <th className="p-3 text-right">SGST (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                {((returnData.cdnr?.length || 0) === 0 && (returnData.cdnur?.length || 0) === 0) ? (
                  <tr>
                    <td colSpan={12} className="text-center py-12 text-slate-400 font-sans">
                      <p className="font-semibold text-slate-600">No Credit or Debit notes found for this period.</p>
                      <p className="text-xs text-slate-400 mt-1">Outward credit notes and debit notes will be categorized here.</p>
                    </td>
                  </tr>
                ) : (
                  <>
                    {returnData.cdnr?.flatMap(g =>
                      g.nt.flatMap(n =>
                        n.itms.map((itm, itmIdx) => (
                          <tr key={`cdnr-${g.ctin}-${n.nt_num}-${itmIdx}`} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3 text-blue-600 font-bold">{g.ctin}</td>
                            <td className="p-3 font-sans truncate max-w-[180px] text-slate-800 font-medium">{n.buyerName || '-'}</td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                n.ntty === 'C' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}>
                                {n.ntty === 'C' ? 'Credit Note' : 'Debit Note'}
                              </span>
                            </td>
                            <td className="p-3 text-slate-900 font-bold">{n.nt_num}</td>
                            <td className="p-3 text-slate-500">{n.nt_dt}</td>
                            <td className="p-3 text-right font-bold text-slate-900">₹{n.val.toLocaleString('en-IN')}</td>
                            <td className="p-3 text-center">{n.pos}</td>
                            <td className="p-3 text-center">{itm.itm_det.rt}%</td>
                            <td className="p-3 text-right text-slate-800 font-semibold">₹{itm.itm_det.txval.toLocaleString('en-IN')}</td>
                            <td className="p-3 text-right text-blue-600">₹{(itm.itm_det.iamt || 0).toLocaleString('en-IN')}</td>
                            <td className="p-3 text-right text-emerald-600">₹{(itm.itm_det.camt || 0).toLocaleString('en-IN')}</td>
                            <td className="p-3 text-right text-emerald-600">₹{(itm.itm_det.samt || 0).toLocaleString('en-IN')}</td>
                          </tr>
                        ))
                      )
                    )}
                    {returnData.cdnur?.flatMap(n =>
                      n.itms.map((itm, itmIdx) => (
                        <tr key={`cdnur-${n.nt_num}-${itmIdx}`} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 text-amber-700 font-bold">URP ({n.typ})</td>
                          <td className="p-3 font-sans truncate max-w-[180px] text-slate-800 font-medium">{n.buyerName || 'Unregistered'}</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              n.ntty === 'C' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              {n.ntty === 'C' ? 'Credit Note' : 'Debit Note'}
                            </span>
                          </td>
                          <td className="p-3 text-slate-900 font-bold">{n.nt_num}</td>
                          <td className="p-3 text-slate-500">{n.nt_dt}</td>
                          <td className="p-3 text-right font-bold text-slate-900">₹{n.val.toLocaleString('en-IN')}</td>
                          <td className="p-3 text-center">{n.pos}</td>
                          <td className="p-3 text-center">{itm.itm_det.rt}%</td>
                          <td className="p-3 text-right text-slate-800 font-semibold">₹{itm.itm_det.txval.toLocaleString('en-IN')}</td>
                          <td className="p-3 text-right text-blue-600">₹{(itm.itm_det.iamt || 0).toLocaleString('en-IN')}</td>
                          <td className="p-3 text-right text-emerald-600">₹{(itm.itm_det.camt || 0).toLocaleString('en-IN')}</td>
                          <td className="p-3 text-right text-emerald-600">₹{(itm.itm_det.samt || 0).toLocaleString('en-IN')}</td>
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
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHsnTab('b2b')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    hsnTab === 'b2b' ? 'bg-slate-900 text-white shadow-xs' : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                  }`}
                >
                  HSN for B2B Supplies ({returnData.hsn?.hsn_b2b?.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setHsnTab('b2c')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    hsnTab === 'b2c' ? 'bg-slate-900 text-white shadow-xs' : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                  }`}
                >
                  HSN for B2C Supplies ({returnData.hsn?.hsn_b2c?.length || 0})
                </button>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                Official Rule: Split into hsn_b2b and hsn_b2c w.e.f. Release 3.2.2+
              </span>
            </div>

            <div className="overflow-x-auto max-h-[460px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 sticky top-0 text-slate-600 uppercase text-[10.5px] font-bold border-b border-slate-200 tracking-wider">
                  <tr>
                    <th className="p-3">HSN Code</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-center">UQC</th>
                    <th className="p-3 text-right">Quantity</th>
                    <th className="p-3 text-right">Total Value (₹)</th>
                    <th className="p-3 text-center">Rate</th>
                    <th className="p-3 text-right">Taxable (₹)</th>
                    <th className="p-3 text-right">IGST (₹)</th>
                    <th className="p-3 text-right">CGST (₹)</th>
                    <th className="p-3 text-right">SGST (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                  {(hsnTab === 'b2b' ? returnData.hsn?.hsn_b2b : returnData.hsn?.hsn_b2c)?.map((h, i) => (
                    <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-amber-700 font-bold">{h.hsn_sc}</td>
                      <td className="p-3 font-sans truncate max-w-[200px] text-slate-800 font-medium">{h.desc}</td>
                      <td className="p-3 text-center font-sans">{h.uqc}</td>
                      <td className="p-3 text-right">{h.qty}</td>
                      <td className="p-3 text-right font-bold text-slate-900">₹{h.val.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-center">{h.rt}%</td>
                      <td className="p-3 text-right text-slate-800 font-semibold">₹{h.txval.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right text-blue-600">₹{h.iamt.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right text-emerald-600">₹{h.camt.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right text-emerald-600">₹{h.samt.toLocaleString('en-IN')}</td>
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
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 sticky top-0 text-slate-600 uppercase text-[10.5px] font-bold border-b border-slate-200 tracking-wider">
                <tr>
                  <th className="p-3">Nature of Document</th>
                  <th className="p-3">Sr. No. From</th>
                  <th className="p-3">Sr. No. To</th>
                  <th className="p-3 text-right">Total Number</th>
                  <th className="p-3 text-right text-rose-600">Cancelled</th>
                  <th className="p-3 text-right text-emerald-600">Net Issued</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                {returnData.doc_issue?.doc_det?.flatMap(g =>
                  g.docs.map((d, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-sans font-semibold text-slate-800">{g.doc_typ}</td>
                      <td className="p-3 text-blue-600 font-bold">{d.from}</td>
                      <td className="p-3 text-blue-600 font-bold">{d.to}</td>
                      <td className="p-3 text-right font-bold text-slate-900">{d.totnum}</td>
                      <td className="p-3 text-right text-rose-600">{d.canc}</td>
                      <td className="p-3 text-right text-emerald-600 font-bold">{d.net_issue}</td>
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
