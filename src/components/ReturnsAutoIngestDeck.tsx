import React, { useState, useRef, useEffect } from 'react';
import {
  Zap, UploadCloud, DownloadCloud, Sparkles, CheckCircle2,
  AlertCircle, FileJson, FileSpreadsheet, Eye, RotateCcw,
  RefreshCw, Check, ArrowRight, Layers, FileArchive, ChevronDown,
  Info, ShieldCheck, X, Save
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiBase } from '@/lib/api';
import {
  GSTR3BMonthKey,
  GSTR3BMonthData,
  GSTR3BAnnualWorking,
  TaxBreakdown
} from '@/lib/gstr3bEngine';
import {
  Gstr1IngestSummary,
  Gstr2bIngestSummary,
  parseAnyReturnsFile
} from '@/lib/gstrAutoIngest';

interface ReturnsAutoIngestDeckProps {
  selectedMonth: GSTR3BMonthKey;
  financialYear: string;
  onFinancialYearChange: (fy: string) => void;
  currentGstin: string;
  currentFirmName: string;
  currentMonthData: GSTR3BMonthData;
  workingData: GSTR3BAnnualWorking;
  onApplyIngestedReturns: (gstr1?: Gstr1IngestSummary | null, gstr2b?: Gstr2bIngestSummary | null) => void;
  onClearMonthIngestion: () => void;
  onSaveWorking?: () => void;
  isSavingWorking?: boolean;
}

const AVAILABLE_FYS = ['2025-26', '2026-27'];

export default function ReturnsAutoIngestDeck({
  selectedMonth,
  financialYear,
  onFinancialYearChange,
  currentGstin,
  currentFirmName,
  currentMonthData,
  workingData,
  onApplyIngestedReturns,
  onClearMonthIngestion,
  onSaveWorking,
  isSavingWorking = false
}: ReturnsAutoIngestDeckProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isAutopilotRunning, setIsAutopilotRunning] = useState(false);
  const [autopilotStep, setAutopilotStep] = useState<string>('');
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);

  // Month-specific cached summaries
  const [activeGstr1, setActiveGstr1] = useState<Gstr1IngestSummary | null>(null);
  const [activeGstr2b, setActiveGstr2b] = useState<Gstr2bIngestSummary | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Format currency helper
  const fmt = (val: number | undefined | null) => {
    if (!val) return '₹ 0.00';
    return `₹ ${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Check if current month already has outward or inward data
  const hasOutwardData = (currentMonthData?.outward?.totalSaleWorking?.taxable || 0) > 0;
  const has2bData = (currentMonthData?.inward?.itc2b?.total || 0) > 0;

  // Auto-hydrate saved 2B/returns data from SQLite on mount or when client/month changes
  useEffect(() => {
    setActiveGstr1(null);
    setActiveGstr2b(null);

    if (!currentGstin || currentGstin === 'Not Specified' || currentGstin.length < 15) return;
    const targetPeriod = `${selectedMonth} ${currentMonthData?.year || '2025'}`;

    const loadSyncedReturnsFromDb = async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/gstr2b/invoices/${encodeURIComponent(currentGstin)}?period=${encodeURIComponent(targetPeriod)}`);
        const data = await res.json();
        if (data.success) {
          let found2bSummary: Gstr2bIngestSummary | null = null;
          let foundG1Summary: Gstr1IngestSummary | null = null;

          if (data.gstr1Summary) {
            foundG1Summary = {
              ...data.gstr1Summary,
              monthKey: selectedMonth
            };
          }
          setActiveGstr1(foundG1Summary);

          if (data.batch || (data.count && data.count > 0)) {
            const b = data.batch || {};
            const eligIgst = Number(b.eligible_itc_igst || 0);
            let eligCgst = Number(b.eligible_itc_cgst || 0);
            let eligSgst = Number(b.eligible_itc_sgst || 0);
            const eligTotal = Number(b.eligible_itc_total || (eligIgst + eligCgst + eligSgst));
            const totalInvs = Number(b.total_invoices || data.count || 0);

            // Safeguard against doubled ITC (if total was mistakenly populated into both CGST and SGST)
            if (eligTotal > 0 && eligIgst === 0 && Math.abs(eligCgst - eligTotal) < 0.05 && Math.abs(eligSgst - eligTotal) < 0.05) {
              eligCgst = Math.round((eligTotal / 2) * 100) / 100;
              eligSgst = Math.round((eligTotal / 2) * 100) / 100;
            }

            // Extract taxable values and breakdown from data.invoices if available
            const invs = Array.isArray(data.invoices) ? data.invoices : [];
            let calcEligTx = 0, calcRcmTx = 0, calcCdnrTx = 0, calcIneligTx = 0, calcIneligCgst = 0, calcIneligSgst = 0, calcIneligIgst = 0;
            invs.forEach((inv: any) => {
              const isRcm = String(inv.rchrg || 'N').toUpperCase() === 'Y';
              const itcAvl = String(inv.itc_available || 'Y').toUpperCase() === 'Y';
              const sec = String(inv.section || '').toUpperCase();
              const isCdnr = sec.includes('CDNR');
              const tx = Number(inv.txval || 0);
              if (isRcm) calcRcmTx += tx;
              else if (isCdnr) calcCdnrTx += tx;
              else if (itcAvl) calcEligTx += tx;
              else {
                calcIneligTx += tx;
                calcIneligCgst += Number(inv.cgst || 0);
                calcIneligSgst += Number(inv.sgst || 0);
                calcIneligIgst += Number(inv.igst || 0);
              }
            });

            const eligTxval = Number(b.eligible_itc_txval || calcEligTx || 0);
            const rcmTxval = Number(b.rcm_txval || calcRcmTx || 0);
            const cdnrTxval = Number(b.cdnr_txval || calcCdnrTx || 0);
            const ineligTxval = Number(b.ineligible_itc_txval || calcIneligTx || 0);

            const rcmIgst = Number(b.rcm_igst || 0);
            const rcmCgst = Number(b.rcm_cgst || 0);
            const rcmSgst = Number(b.rcm_sgst || 0);
            const rcmTotal = Number(b.rcm_total || (rcmIgst + rcmCgst + rcmSgst));

            const cdnrIgst = Number(b.cdnr_igst || 0);
            const cdnrCgst = Number(b.cdnr_cgst || 0);
            const cdnrSgst = Number(b.cdnr_sgst || 0);
            const cdnrTotal = Number(b.cdnr_total || (cdnrIgst + cdnrCgst + cdnrSgst));

            const impgIgst = Number(b.impg_igst || 0);
            const isdIgst = Number(b.isd_igst || 0);
            const isdCgst = Number(b.isd_cgst || 0);
            const isdSgst = Number(b.isd_sgst || 0);
            const ineligTotal = Number(b.ineligible_itc_total || (calcIneligCgst + calcIneligSgst + calcIneligIgst) || 0);

            if (eligTotal > 0 || totalInvs > 0) {
              found2bSummary = {
                gstin: currentGstin,
                period: targetPeriod,
                monthKey: selectedMonth,
                fileType: 'JSON',
                fileName: 'Saved_2B_Batch',
                counts: {
                  b2b: b.b2b_count || totalInvs,
                  b2ba: b.b2ba_count || 0,
                  cdnr: b.cdnr_count || 0,
                  isd: b.isd_count || 0,
                  impg: b.impg_count || 0,
                  totalInvoices: totalInvs
                },
                eligibleItc: {
                  taxable: eligTxval,
                  igst: eligIgst,
                  cgst: eligCgst,
                  sgst: eligSgst,
                  total: eligTotal
                },
                rcmInward: { taxable: rcmTxval, igst: rcmIgst, cgst: rcmCgst, sgst: rcmSgst, total: rcmTotal },
                creditNotes: { taxable: cdnrTxval, igst: cdnrIgst, cgst: cdnrCgst, sgst: cdnrSgst, total: cdnrTotal },
                debitNotes: { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 },
                importGoods: { taxable: 0, igst: impgIgst, cgst: 0, sgst: 0, total: impgIgst },
                isd: { taxable: 0, igst: isdIgst, cgst: isdCgst, sgst: isdSgst, total: isdIgst + isdCgst + isdSgst },
                ineligibleItc: { taxable: ineligTxval, igst: calcIneligIgst, cgst: calcIneligCgst, sgst: calcIneligSgst, total: ineligTotal },
                netEligibleTotal: Math.round((eligTotal + rcmTotal + impgIgst + (isdIgst + isdCgst + isdSgst) - cdnrTotal - ineligTotal) * 100) / 100
              };
            }
          }
          setActiveGstr2b(found2bSummary);

          // If current month Table 4 ITC or Table 3.1 is currently zero in the working sheet, auto-apply!
          const needs2b = (currentMonthData?.inward?.itc2b?.total || 0) === 0 && found2bSummary && found2bSummary.netEligibleTotal > 0;
          const needsG1 = (currentMonthData?.outward?.totalSaleWorking?.taxable || 0) === 0 && foundG1Summary && foundG1Summary.totalOutwardTaxable > 0;

          if (needs2b || needsG1) {
            onApplyIngestedReturns(needsG1 ? foundG1Summary : null, needs2b ? found2bSummary : null);
          }
        }
      } catch (e) {
        console.error('[ReturnsAutoIngestDeck] DB auto-hydrate error:', e);
      }
    };

    loadSyncedReturnsFromDb();
  }, [currentGstin, selectedMonth, currentMonthData?.year]);

  // ─── 1. FILE DROP & PICKER HANDLER ──────────────────────────────────────────
  const handleFilesChosen = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsProcessingFiles(true);
    const toastId = toast.loading(`Parsing ${files.length} returns file(s)...`);

    let parsedGstr1: Gstr1IngestSummary | null = null;
    let parsedGstr2b: Gstr2bIngestSummary | null = null;
    const errors: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const res = await parseAnyReturnsFile(file);
        if (res.error) {
          errors.push(res.error);
        } else {
          if (res.gstr1) parsedGstr1 = res.gstr1;
          if (res.gstr2b) parsedGstr2b = res.gstr2b;
        }
      }

      if (!parsedGstr1 && !parsedGstr2b) {
        throw new Error(errors[0] || 'No recognizable GSTR-1 or GSTR-2B data found in uploaded files.');
      }

      if (parsedGstr1) setActiveGstr1(parsedGstr1);
      if (parsedGstr2b) setActiveGstr2b(parsedGstr2b);

      // Apply directly to working sheet
      onApplyIngestedReturns(parsedGstr1, parsedGstr2b);

      let successMsg = 'Auto-Ingest Successful!';
      if (parsedGstr1 && parsedGstr2b) {
        successMsg = `Ingested GSTR-1 (₹${parsedGstr1.totalOutwardTaxable.toLocaleString('en-IN')} Sales) & GSTR-2B (₹${parsedGstr2b.netEligibleTotal.toLocaleString('en-IN')} ITC)!`;
      } else if (parsedGstr1) {
        successMsg = `Ingested GSTR-1: ₹${parsedGstr1.totalOutwardTaxable.toLocaleString('en-IN')} Outward Sales populated to Table 3.1!`;
      } else if (parsedGstr2b) {
        successMsg = `Ingested GSTR-2B: ₹${parsedGstr2b.netEligibleTotal.toLocaleString('en-IN')} Eligible ITC populated to Table 4!`;
      }

      toast.success(successMsg, {
        id: toastId,
        description: `Applied to ${selectedMonth} ${currentMonthData.year}. Rule 88A tax cascade recalculated automatically.`
      });
    } catch (err: any) {
      toast.error('File Ingestion Failed', {
        id: toastId,
        description: err?.message || 'Error parsing files.'
      });
    } finally {
      setIsProcessingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesChosen(e.dataTransfer.files);
    }
  };

  // ─── 2. AUTOPILOT PORTAL SYNC HANDLER ───────────────────────────────────────
  const handleAutopilotSync = async () => {
    if (!currentGstin || currentGstin === 'Not Specified' || currentGstin.length < 15) {
      return toast.error('Valid GSTIN Required', {
        description: 'Please specify the client GSTIN in the client card before running portal autopilot.'
      });
    }

    setIsAutopilotRunning(true);
    setAutopilotStep('Connecting to GST Portal via Playwright...');
    const toastId = toast.loading(`Starting Autopilot for ${selectedMonth} (${currentGstin})...`);

    try {
      setAutopilotStep('Launching browser & auto-logging in...');
      const targetPeriod = `${selectedMonth} ${currentMonthData.year}`;

      const res = await fetch(`${getApiBase()}/api/gstr2b/portal-sync-browser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: currentGstin,
          returnPeriod: targetPeriod,
          financialYear
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Autopilot portal sync failed.');
      }

      setAutopilotStep('Parsing downloaded return files...');

      // Construct summaries for both GSTR-1 (Outward) and GSTR-2B (ITC)
      const gstr1Data: Gstr1IngestSummary | null = data.gstr1Summary ? {
        ...data.gstr1Summary,
        monthKey: selectedMonth
      } : null;

      let gstr2bSummary: Gstr2bIngestSummary | null = null;
      if (data.metrics || (data.invoiceCount && data.invoiceCount > 0)) {
        const m = data.metrics || {};
        const elig = m.eligibleItc || m;
        const eligIgst = Number(elig.igst ?? m.eligible_igst ?? m.eligible_itc_igst ?? 0);
        let eligCgst = Number(elig.cgst ?? m.eligible_cgst ?? m.eligible_itc_cgst ?? 0);
        let eligSgst = Number(elig.sgst ?? m.eligible_sgst ?? m.eligible_itc_sgst ?? 0);
        const eligTotal = Number(elig.total ?? m.eligible_total ?? m.eligible_itc_total ?? (eligIgst + eligCgst + eligSgst));

        // Safeguard against doubled ITC
        if (eligTotal > 0 && eligIgst === 0 && Math.abs(eligCgst - eligTotal) < 0.05 && Math.abs(eligSgst - eligTotal) < 0.05) {
          eligCgst = Math.round((eligTotal / 2) * 100) / 100;
          eligSgst = Math.round((eligTotal / 2) * 100) / 100;
        }

        const eligTxval = Number(m.eligible_txval ?? m.eligible_itc_txval ?? elig.taxable ?? 0);

        const rcm = m.rcmInward || m;
        const rcmTxval = Number(m.rcm_txval ?? rcm.taxable ?? 0);
        const rcmIgst = Number(rcm.igst ?? m.rcm_igst ?? 0);
        const rcmCgst = Number(rcm.cgst ?? m.rcm_cgst ?? 0);
        const rcmSgst = Number(rcm.sgst ?? m.rcm_sgst ?? 0);
        const rcmTotal = Number(rcm.total ?? m.rcm_total ?? (rcmIgst + rcmCgst + rcmSgst));

        const cdnr = m.creditNotes || m;
        const cdnrTxval = Number(m.cdnr_txval ?? cdnr.taxable ?? 0);
        const cdnrIgst = Number(cdnr.igst ?? m.cdnr_igst ?? 0);
        const cdnrCgst = Number(cdnr.cgst ?? m.cdnr_cgst ?? 0);
        const cdnrSgst = Number(cdnr.sgst ?? m.cdnr_sgst ?? 0);
        const cdnrTotal = Number(cdnr.total ?? m.cdnr_total ?? (cdnrIgst + cdnrCgst + cdnrSgst));

        const inelig = m.ineligibleItc || m;
        const ineligTxval = Number(m.ineligible_txval ?? inelig.taxable ?? 0);
        const ineligTotal = Number(m.ineligibleTotal ?? m.ineligible_total ?? m.ineligible_itc_total ?? inelig.total ?? 0);

        const b2bCount = Number(m.b2bCount ?? m.b2b_count ?? data.invoiceCount ?? 0);
        const cdnrCount = Number(m.cdnrCount ?? m.cdnr_count ?? 0);

        gstr2bSummary = {
          gstin: currentGstin,
          period: targetPeriod,
          monthKey: selectedMonth,
          fileType: 'JSON',
          fileName: 'Portal_Autopilot_2B',
          counts: {
            b2b: b2bCount,
            b2ba: Number(m.b2ba_count || 0),
            cdnr: cdnrCount,
            isd: Number(m.isd_count || 0),
            impg: Number(m.impg_count || 0),
            totalInvoices: data.invoiceCount || (b2bCount + cdnrCount)
          },
          eligibleItc: {
            taxable: eligTxval,
            igst: eligIgst,
            cgst: eligCgst,
            sgst: eligSgst,
            total: eligTotal
          },
          rcmInward: {
            taxable: rcmTxval,
            igst: rcmIgst,
            cgst: rcmCgst,
            sgst: rcmSgst,
            total: rcmTotal
          },
          creditNotes: {
            taxable: cdnrTxval,
            igst: cdnrIgst,
            cgst: cdnrCgst,
            sgst: cdnrSgst,
            total: cdnrTotal
          },
          debitNotes: { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 },
          importGoods: { taxable: 0, igst: Number(m.impg_igst || 0), cgst: 0, sgst: 0, total: Number(m.impg_igst || 0) },
          isd: { taxable: 0, igst: Number(m.isd_igst || 0), cgst: Number(m.isd_cgst || 0), sgst: Number(m.isd_sgst || 0), total: Number(m.isd_total || 0) },
          ineligibleItc: {
            taxable: ineligTxval,
            igst: 0,
            cgst: 0,
            sgst: 0,
            total: ineligTotal
          },
          netEligibleTotal: Math.round((eligTotal + rcmTotal - cdnrTotal - ineligTotal) * 100) / 100
        };
      }

      if (gstr1Data) setActiveGstr1(gstr1Data);
      if (gstr2bSummary) setActiveGstr2b(gstr2bSummary);

      if (gstr1Data || gstr2bSummary) {
        onApplyIngestedReturns(gstr1Data, gstr2bSummary);

        if (gstr1Data && gstr2bSummary) {
          toast.success(`Autopilot Synced GSTR-1 & GSTR-2B!`, {
            id: toastId,
            description: `Table 3.1: ₹${gstr1Data.totalOutwardTaxable.toLocaleString('en-IN')} Sales | Table 4: ₹${gstr2bSummary.netEligibleTotal.toLocaleString('en-IN')} ITC for ${selectedMonth}!`
          });
        } else if (gstr1Data) {
          toast.success(`Autopilot Synced GSTR-1!`, {
            id: toastId,
            description: `Table 3.1 Outward: ₹${gstr1Data.totalOutwardTaxable.toLocaleString('en-IN')} Sales populated for ${selectedMonth}!`
          });
        } else if (gstr2bSummary) {
          toast.success(`Autopilot Synced GSTR-2B!`, {
            id: toastId,
            description: `Table 4 ITC: ₹${gstr2bSummary.netEligibleTotal.toLocaleString('en-IN')} populated for ${selectedMonth}!`
          });
        }
      } else {
        toast.info('Generation Dispatched', {
          id: toastId,
          description: data.message || 'Portal compiling returns. Download when ready or drag & drop files.'
        });
      }
    } catch (err: any) {
      toast.error('Autopilot Sync Interrupted', {
        id: toastId,
        description: err?.message || 'Check portal credentials or connection.'
      });
    } finally {
      setIsAutopilotRunning(false);
      setAutopilotStep('');
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur-xl space-y-4">
      {/* ─── TOP HEADER: FINANCIAL YEAR SELECTOR & AUTO-MODE BADGE ─── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold shadow-lg shadow-emerald-950/40">
            <Zap className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-extrabold text-white tracking-wide flex items-center gap-2">
                Returns Auto-Pilot & Ingestion Deck
              </h3>
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold uppercase tracking-wider animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Full Auto-Mode Active
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Auto-sync GSTR-1 (Outward) & GSTR-2B (ITC) from GST Portal via Autopilot or manual JSON/Excel drop.
            </p>
          </div>
        </div>

        {/* ─── FINANCIAL YEAR SELECTOR PILLS & DROPDOWN ─── */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-950/70 p-1.5 rounded-xl border border-slate-800">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 flex items-center gap-1">
            Financial Year:
          </span>
          {AVAILABLE_FYS.map(fy => (
            <button
              key={fy}
              onClick={() => onFinancialYearChange(fy)}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                financialYear === fy
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-950 ring-1 ring-blue-400/40 scale-105'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              {fy}
            </button>
          ))}
        </div>
      </div>

      {/* ─── TWO CORE ACTIONS: 1-CLICK AUTOPILOT & DRAG-AND-DROP DECK ─── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Left: 1-Click Portal Autopilot */}
        <div className="md:col-span-5 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/20 border border-emerald-500/20 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Channel 1: Portal Autopilot
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Playwright v1.60</span>
            </div>
            <p className="text-xs text-slate-300 font-medium mt-1.5">
              Auto-login to GSTN, search returns for <strong className="text-emerald-300">{selectedMonth} ({financialYear})</strong>, and download GSTR-1 & GSTR-2B directly into 3B working.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between gap-3">
            <div className="text-[11px] text-slate-400 font-mono truncate">
              <div>
                Target: <span className="text-white font-semibold">{currentGstin || 'No GSTIN'}</span>
                {currentFirmName && currentFirmName !== 'No Company Selected' && (
                  <span className="text-emerald-300 font-sans font-bold ml-1.5 truncate">({currentFirmName})</span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 font-sans mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                <span>Portal Credentials linked from Vault</span>
              </div>
            </div>
            <button
              onClick={handleAutopilotSync}
              disabled={isAutopilotRunning || !currentGstin || currentGstin === 'Not Specified'}
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/60 transition-all flex items-center gap-2 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAutopilotRunning ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{autopilotStep || 'Running...'}</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span>🚀 1-Click Autopilot Sync</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: Manual JSON / Excel / Zip Drag-and-Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`md:col-span-7 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all flex flex-col justify-between ${
            isDragging
              ? 'border-blue-400 bg-blue-500/10 scale-[1.01]'
              : 'border-slate-700/80 bg-slate-950/50 hover:border-slate-600 hover:bg-slate-950/80'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={e => e.target.files && handleFilesChosen(e.target.files)}
            multiple
            accept=".json,.xlsx,.xls,.zip"
            className="hidden"
          />

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                <UploadCloud className={`w-5 h-5 ${isProcessingFiles ? 'animate-bounce' : ''}`} />
              </div>
              <div>
                <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                  Channel 2: Drag & Drop Return Files
                </span>
                <p className="text-xs text-slate-300 font-medium mt-0.5">
                  Drop <strong className="text-white">GSTR-1 JSON</strong> or <strong className="text-white">GSTR-2B JSON/Excel/Zip</strong> (or drop both at once!).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="px-2 py-0.5 bg-slate-800 text-[10px] font-mono text-slate-300 rounded border border-slate-700">.JSON</span>
              <span className="px-2 py-0.5 bg-slate-800 text-[10px] font-mono text-slate-300 rounded border border-slate-700">.XLSX</span>
              <span className="px-2 py-0.5 bg-slate-800 text-[10px] font-mono text-slate-300 rounded border border-slate-700">.ZIP</span>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
            <span>✨ Auto-detects GSTR-1 vs GSTR-2B schema instantly</span>
            <span className="text-blue-400 font-bold hover:underline flex items-center gap-1">
              Browse Files <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* ─── STATUS BAR: LOADED METRICS & QUICK AUDIT ACTIONS ─── */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* GSTR-1 Status Pill */}
          <div className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
            hasOutwardData || activeGstr1
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}>
            <span className={`w-2 h-2 rounded-full ${hasOutwardData || activeGstr1 ? 'bg-emerald-400' : 'bg-slate-600'}`} />
            <span>Table 3.1 (GSTR-1 Outward):</span>
            <strong className="font-mono text-white">
              {fmt(currentMonthData?.outward?.totalSaleWorking?.taxable || activeGstr1?.totalOutwardTaxable)}
            </strong>
            {activeGstr1 && (
              <span className="text-[10px] text-emerald-400/80 font-mono">({activeGstr1.counts.totalDocs} docs)</span>
            )}
          </div>

          {/* GSTR-2B Status Pill */}
          <div className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
            has2bData || activeGstr2b
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}>
            <span className={`w-2 h-2 rounded-full ${has2bData || activeGstr2b ? 'bg-blue-400' : 'bg-slate-600'}`} />
            <span>Table 4 (GSTR-2B Eligible ITC):</span>
            <strong className="font-mono text-white">
              {fmt(currentMonthData?.inward?.itc2b?.total || activeGstr2b?.netEligibleTotal)}
            </strong>
            {activeGstr2b && (
              <span className="text-[10px] text-blue-400/80 font-mono">({activeGstr2b.counts.totalInvoices} invs)</span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {(activeGstr2b || activeGstr1) && (
            <button
              onClick={() => {
                onApplyIngestedReturns(activeGstr1, activeGstr2b);
                toast.success(`Applied figures for ${selectedMonth}!`, {
                  description: `Table 3.1: ${fmt(activeGstr1?.totalOutwardTaxable || 0)} | Table 4 ITC: ${fmt(activeGstr2b?.netEligibleTotal || 0)}`
                });
              }}
              className="px-3 py-1.5 bg-gradient-to-r from-emerald-600/30 to-teal-600/30 hover:from-emerald-600/50 hover:to-teal-600/50 text-emerald-300 text-xs font-bold rounded-lg border border-emerald-500/40 flex items-center gap-1.5 shadow-sm transition-all"
              title="Apply saved figures to Table 3.1 & Table 4"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-400" /> Apply Synced Figures
            </button>
          )}

          <button
            onClick={() => setShowBreakdownModal(true)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <Eye className="w-3.5 h-3.5 text-purple-400" /> Inspect Returns Ledger
          </button>

          <button
            onClick={onClearMonthIngestion}
            className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 text-xs font-bold rounded-lg border border-rose-500/30 flex items-center gap-1.5 transition-colors"
            title="Reset figures for active month"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Clear Month
          </button>

          {/* ─── SAVE 3B WORKING BUTTON ─── */}
          <button
            type="button"
            onClick={onSaveWorking}
            disabled={isSavingWorking}
            className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-extrabold rounded-lg shadow-md shadow-emerald-950/80 border border-emerald-400/50 flex items-center gap-2 transition-all hover:scale-[1.03] active:scale-[0.98] disabled:opacity-50"
            title="Save 3B Working Sheet to Central Server & Local Storage"
          >
            {isSavingWorking ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 text-emerald-100" />
                <span>Save 3B Working</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ─── AUDIT MODAL: INSPECT PARSED RETURN FIGURES ─── */}
      {showBreakdownModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-white font-bold text-sm flex items-center gap-2">
                  <Eye className="w-4 h-4 text-purple-400" />
                  Returns Audit Ledger — {selectedMonth.toUpperCase()} {currentMonthData.year}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Detailed breakdown of values mapped from GSTR-1 and GSTR-2B into statutory GSTR-3B tables.
                </p>
              </div>
              <button
                onClick={() => setShowBreakdownModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Table 3.1 Outward Breakdown */}
              <div>
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2.5 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Table 3.1: Outward Supplies (From GSTR-1)
                </h4>
                <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900/80 text-slate-400 font-bold border-b border-slate-800 text-[11px]">
                      <tr>
                        <th className="py-2 px-3">Head / Particulars</th>
                        <th className="py-2 px-3 text-right">Taxable Value</th>
                        <th className="py-2 px-3 text-right">CGST</th>
                        <th className="py-2 px-3 text-right">SGST</th>
                        <th className="py-2 px-3 text-right">IGST</th>
                        <th className="py-2 px-3 text-right">Total Tax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {[
                        { label: 'B2B Sales (Table 3.1(a))', row: currentMonthData.outward.b2b },
                        { label: 'B2C Sales (Table 3.1(a))', row: currentMonthData.outward.b2c },
                        { label: 'Zero-Rated / Exports (Table 3.1(b))', row: currentMonthData.outward.zeroRated },
                        { label: 'Nil Rated (Table 3.1(c))', row: currentMonthData.outward.nilRated },
                        { label: 'Exempted (Table 3.1(c))', row: currentMonthData.outward.exempt },
                        { label: '(-) Credit Notes', row: currentMonthData.outward.creditNote },
                        { label: 'Inward RCM Liability (Table 3.1(d))', row: currentMonthData.outward.rcmInward }
                      ].map(({ label, row }, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/40">
                          <td className="py-1.5 px-3 font-sans text-slate-300">{label}</td>
                          <td className="py-1.5 px-3 text-right">{fmt(row.taxable)}</td>
                          <td className="py-1.5 px-3 text-right text-emerald-400">{fmt(row.cgst)}</td>
                          <td className="py-1.5 px-3 text-right text-emerald-400">{fmt(row.sgst)}</td>
                          <td className="py-1.5 px-3 text-right text-emerald-400">{fmt(row.igst)}</td>
                          <td className="py-1.5 px-3 text-right font-bold text-white">{fmt(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table 4 Inward Breakdown */}
              <div>
                <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2.5 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Table 4: Eligible ITC & Reversals (From GSTR-2B)
                </h4>
                <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900/80 text-slate-400 font-bold border-b border-slate-800 text-[11px]">
                      <tr>
                        <th className="py-2 px-3">ITC Head</th>
                        <th className="py-2 px-3 text-right">CGST</th>
                        <th className="py-2 px-3 text-right">SGST</th>
                        <th className="py-2 px-3 text-right">IGST</th>
                        <th className="py-2 px-3 text-right">Total Eligible ITC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      <tr className="hover:bg-slate-900/40">
                        <td className="py-1.5 px-3 font-sans text-slate-300">4(A)(5) All Other ITC (2B B2B / B2BA Invoices)</td>
                        <td className="py-1.5 px-3 text-right text-blue-400">{fmt(currentMonthData.inward.itc2b.cgst)}</td>
                        <td className="py-1.5 px-3 text-right text-blue-400">{fmt(currentMonthData.inward.itc2b.sgst)}</td>
                        <td className="py-1.5 px-3 text-right text-blue-400">{fmt(currentMonthData.inward.itc2b.igst)}</td>
                        <td className="py-1.5 px-3 text-right font-bold text-white">{fmt(currentMonthData.inward.itc2b.total)}</td>
                      </tr>
                      <tr className="hover:bg-slate-900/40">
                        <td className="py-1.5 px-3 font-sans text-slate-300">4(A)(3) Inward Reverse Charge Supplies (RCM)</td>
                        <td className="py-1.5 px-3 text-right text-blue-400">{fmt(currentMonthData.inward.rcmPaid.cgst)}</td>
                        <td className="py-1.5 px-3 text-right text-blue-400">{fmt(currentMonthData.inward.rcmPaid.sgst)}</td>
                        <td className="py-1.5 px-3 text-right text-blue-400">{fmt(currentMonthData.inward.rcmPaid.igst)}</td>
                        <td className="py-1.5 px-3 text-right font-bold text-white">{fmt(currentMonthData.inward.rcmPaid.total)}</td>
                      </tr>
                      {(currentMonthData.inward.debitNotes?.total > 0 || (activeGstr2b?.creditNotes?.total || 0) > 0) && (
                        <tr className="hover:bg-slate-900/40 text-rose-300">
                          <td className="py-1.5 px-3 font-sans text-rose-400">(-) 2B Supplier Credit Notes (Row 38 Debit Notes)</td>
                          <td className="py-1.5 px-3 text-right">{fmt(currentMonthData.inward.debitNotes?.cgst || activeGstr2b?.creditNotes?.cgst)}</td>
                          <td className="py-1.5 px-3 text-right">{fmt(currentMonthData.inward.debitNotes?.sgst || activeGstr2b?.creditNotes?.sgst)}</td>
                          <td className="py-1.5 px-3 text-right">{fmt(currentMonthData.inward.debitNotes?.igst || activeGstr2b?.creditNotes?.igst)}</td>
                          <td className="py-1.5 px-3 text-right font-bold">-{fmt(currentMonthData.inward.debitNotes?.total || activeGstr2b?.creditNotes?.total)}</td>
                        </tr>
                      )}
                      {(currentMonthData.inward.creditNotes?.total > 0 || (activeGstr2b?.debitNotes?.total || 0) > 0) && (
                        <tr className="hover:bg-slate-900/40 text-emerald-300">
                          <td className="py-1.5 px-3 font-sans text-emerald-400">(+) 2B Supplier Debit Notes (Row 36 Credit Notes)</td>
                          <td className="py-1.5 px-3 text-right">{fmt(currentMonthData.inward.creditNotes?.cgst || activeGstr2b?.debitNotes?.cgst)}</td>
                          <td className="py-1.5 px-3 text-right">{fmt(currentMonthData.inward.creditNotes?.sgst || activeGstr2b?.debitNotes?.sgst)}</td>
                          <td className="py-1.5 px-3 text-right">{fmt(currentMonthData.inward.creditNotes?.igst || activeGstr2b?.debitNotes?.igst)}</td>
                          <td className="py-1.5 px-3 text-right font-bold">{fmt(currentMonthData.inward.creditNotes?.total || activeGstr2b?.debitNotes?.total)}</td>
                        </tr>
                      )}
                      {(currentMonthData.inward.importGoods?.total > 0 || (activeGstr2b?.importGoods?.total || 0) > 0) && (
                        <tr className="hover:bg-slate-900/40">
                          <td className="py-1.5 px-3 font-sans text-slate-300">4(A)(1) Import of Goods</td>
                          <td className="py-1.5 px-3 text-right text-blue-400">{fmt(0)}</td>
                          <td className="py-1.5 px-3 text-right text-blue-400">{fmt(0)}</td>
                          <td className="py-1.5 px-3 text-right text-blue-400">{fmt(currentMonthData.inward.importGoods?.igst || activeGstr2b?.importGoods?.igst)}</td>
                          <td className="py-1.5 px-3 text-right font-bold text-white">{fmt(currentMonthData.inward.importGoods?.total || activeGstr2b?.importGoods?.total)}</td>
                        </tr>
                      )}
                      <tr className="hover:bg-slate-900/40">
                        <td className="py-1.5 px-3 font-sans text-slate-300">Opening ITC Brought Forward</td>
                        <td className="py-1.5 px-3 text-right text-slate-400">{fmt(currentMonthData.inward.openingCreditBal.cgst)}</td>
                        <td className="py-1.5 px-3 text-right text-slate-400">{fmt(currentMonthData.inward.openingCreditBal.sgst)}</td>
                        <td className="py-1.5 px-3 text-right text-slate-400">{fmt(currentMonthData.inward.openingCreditBal.igst)}</td>
                        <td className="py-1.5 px-3 text-right font-bold text-slate-300">{fmt(currentMonthData.inward.openingCreditBal.total)}</td>
                      </tr>
                      <tr className="hover:bg-slate-900/60 font-bold bg-slate-900/30 text-white border-t border-slate-700">
                        <td className="py-2 px-3 font-sans text-teal-300">Total Net Available ITC for Set-off (Row 41)</td>
                        <td className="py-2 px-3 text-right text-teal-300">{fmt(currentMonthData.inward.totalItcAvailable.cgst)}</td>
                        <td className="py-2 px-3 text-right text-teal-300">{fmt(currentMonthData.inward.totalItcAvailable.sgst)}</td>
                        <td className="py-2 px-3 text-right text-teal-300">{fmt(currentMonthData.inward.totalItcAvailable.igst)}</td>
                        <td className="py-2 px-3 text-right text-teal-300">{fmt(currentMonthData.inward.totalItcAvailable.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Net Cash Impact Summary */}
              <div className="bg-gradient-to-r from-purple-950/40 to-slate-950 p-4 rounded-xl border border-purple-500/30 flex justify-between items-center">
                <div>
                  <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wider block">Rule 88A Net Outcome</span>
                  <span className="text-xs text-slate-400">Inter-head set-off computed with Section 49(4) RCM Cash isolation</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Total Cash Outflow:</span>
                  <span className="text-lg font-mono font-extrabold text-purple-300">
                    {fmt(currentMonthData.settlement.balancePayable.total)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowBreakdownModal(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
