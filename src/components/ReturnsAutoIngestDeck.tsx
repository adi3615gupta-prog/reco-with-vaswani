import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Zap, UploadCloud, DownloadCloud, Sparkles, CheckCircle2,
  AlertCircle, FileJson, FileSpreadsheet, Eye, RotateCcw,
  RefreshCw, Check, ArrowRight, Layers, FileArchive, ChevronDown,
  Info, ShieldCheck, X, XCircle, Save, ArrowDownRight, ArrowUpRight, Clock, Edit3, Lock,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiBase, safeApiFetch } from '@/lib/api';
import {
  GSTR3BMonthKey,
  GSTR3BMonthData,
  GSTR3BAnnualWorking,
  TaxBreakdown,
  parseFyYears
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
  onClearGstr1?: () => void;
  onClearGstr2b?: () => void;
  onSaveWorking?: () => void;
  isSavingWorking?: boolean;
  compactMode?: boolean;
  isEditMode?: boolean;
  isLocked?: boolean;
  onUpdateField?: (
    section: 'outward' | 'inward' | 'settlement' | 'setoff',
    field: string,
    subKey: 'taxable' | 'cgst' | 'sgst' | 'igst',
    value: number
  ) => void;
}

const AVAILABLE_FYS = [
  '2026-27',
  '2025-26',
  '2024-25',
  '2023-24',
  '2022-23',
  '2021-22',
  '2020-21',
  '2019-20',
  '2018-19',
  '2017-18'
];

// Helper to format currency
const fmt = (val: number | undefined | null) => {
  if (val === undefined || val === null || isNaN(val)) return '₹ 0.00';
  return `₹ ${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Compact cell formatter (renders 0 as '—' so non-zero amounts pop out cleanly)
const fmtCell = (val: number | undefined | null, isNeg: boolean = false) => {
  if (val === undefined || val === null || isNaN(val) || Math.abs(val) < 0.005) {
    return '—';
  }
  const prefix = isNeg ? '-' : '';
  return `${prefix}₹${Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Dedicated summary total formatter
const fmtTotalCell = (val: number | undefined | null) => {
  if (val === undefined || val === null || isNaN(val) || Math.abs(val) < 0.005) {
    return '₹0.00';
  }
  return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Dedicated return period resolver ensuring consistent Month + 4-digit Year mapping
const getTargetPeriod = (month: GSTR3BMonthKey, fy?: string, monthData?: GSTR3BMonthData): string => {
  if (monthData?.year && /^\d{4}$/.test(String(monthData.year))) {
    return `${month} ${monthData.year}`;
  }
  const cleanFy = (fy || '2025-26').trim();
  const { startYear, endYear } = parseFyYears(cleanFy);
  const isNextYear = ['January', 'February', 'March'].includes(month);
  return `${month} ${isNextYear ? endYear : startYear}`;
};

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
  onClearGstr1,
  onClearGstr2b,
  onSaveWorking,
  isSavingWorking = false,
  compactMode = false,
  isEditMode = false,
  isLocked = false,
  onUpdateField
}: ReturnsAutoIngestDeckProps) {
  // Local edit states for side deck cards
  const [isG1LocalEdit, setIsG1LocalEdit] = useState(false);
  const [isG2bLocalEdit, setIsG2bLocalEdit] = useState(false);
  const isG1Editable = !isLocked && Boolean(isEditMode || isG1LocalEdit);
  const isG2bEditable = !isLocked && Boolean(isEditMode || isG2bLocalEdit);

  // Helper to render deck cell input in edit mode or formatted cell
  const renderDeckInput = (
    val: number | undefined | null,
    section: 'outward' | 'inward',
    field: string,
    subKey: 'taxable' | 'cgst' | 'sgst' | 'igst',
    colorText = 'text-white',
    isNeg = false
  ) => {
    if (!isLocked && (section === 'outward' ? isG1Editable : isG2bEditable) && onUpdateField) {
      return (
        <input
          type="number"
          value={val || ''}
          onChange={e => onUpdateField(section, field, subKey, parseFloat(e.target.value) || 0)}
          className={`w-14 sm:w-16 bg-slate-900 border border-slate-700 focus:border-indigo-400 rounded px-1 py-0.5 text-right font-mono text-[10px] ${colorText} outline-none`}
          placeholder="0"
        />
      );
    }
    return fmtCell(val, isNeg);
  };
  // GSTR-1 State
  const [activeGstr1, setActiveGstr1] = useState<Gstr1IngestSummary | null>(null);
  const [isGstr1Dragging, setIsGstr1Dragging] = useState(false);
  const [isProcessingGstr1, setIsProcessingGstr1] = useState(false);
  const [isGstr1AutopilotRunning, setIsGstr1AutopilotRunning] = useState(false);
  const [gstr1AutopilotStep, setGstr1AutopilotStep] = useState<string>('');
  const [isGstr1PdfAutopilotRunning, setIsGstr1PdfAutopilotRunning] = useState(false);
  const [gstr1PdfAutopilotStep, setGstr1PdfAutopilotStep] = useState<string>('');
  const [gstr1BatchStatus, setGstr1BatchStatus] = useState<string>('PENDING');
  const [gstr1RequestedAt, setGstr1RequestedAt] = useState<number | null>(null);
  const [timerTick, setTimerTick] = useState(0);
  const gstr1FileInputRef = useRef<HTMLInputElement>(null);
  const gstr1PdfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => setTimerTick(prev => prev + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const gstr1SecondsLeft = gstr1RequestedAt ? Math.max(0, 1200 - Math.floor((Date.now() - gstr1RequestedAt) / 1000)) : 0;
  const isGstr1ReadyToDownload = (gstr1BatchStatus === 'REQUESTED' || gstr1BatchStatus === 'READY_TO_DOWNLOAD') && gstr1SecondsLeft === 0;

  // GSTR-2B State
  const [activeGstr2b, setActiveGstr2b] = useState<Gstr2bIngestSummary | null>(null);
  const [isGstr2bDragging, setIsGstr2bDragging] = useState(false);
  const [isProcessingGstr2b, setIsProcessingGstr2b] = useState(false);
  const [isGstr2bAutopilotRunning, setIsGstr2bAutopilotRunning] = useState(false);
  const [gstr2bAutopilotStep, setGstr2bAutopilotStep] = useState<string>('');
  const gstr2bFileInputRef = useRef<HTMLInputElement>(null);

  // Combined Autopilot State
  const [isCombinedAutopilotRunning, setIsCombinedAutopilotRunning] = useState(false);

  // Panel collapse state
  const [gstr1Collapsed, setGstr1Collapsed] = useState(false);
  const [gstr2bCollapsed, setGstr2bCollapsed] = useState(false);
  const [showG1RcmBreakdown, setShowG1RcmBreakdown] = useState(true);
  const [showG2bRcmBreakdown, setShowG2bRcmBreakdown] = useState(true);

  // Modals
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    mode: 'GSTR1' | 'GSTR2B' | 'BOTH';
    gstr1?: Gstr1IngestSummary | null;
    gstr2b?: Gstr2bIngestSummary | null;
  }>({
    isOpen: false,
    mode: 'GSTR1',
    gstr1: null,
    gstr2b: null
  });

  // Check if current month already has outward or inward data in working sheet
  const hasOutwardData = (currentMonthData?.outward?.totalSaleWorking?.taxable || 0) > 0;
  const has2bData = (currentMonthData?.inward?.itc2b?.total || 0) > 0;

  // ─── AUTO-HYDRATE BOTH RETURNS FROM DB ─────────────────────────────────────────
  useEffect(() => {
    setActiveGstr1(null);
    setActiveGstr2b(null);

    if (!currentGstin || currentGstin === 'Not Specified' || currentGstin.length < 15) return;
    const targetPeriod = getTargetPeriod(selectedMonth, financialYear, currentMonthData);

    const hydrateFromDb = async () => {
      // 1. Hydrate GSTR-2B from DB
      try {
        const res2b = await safeApiFetch(
          `/api/gstr2b/invoices/${encodeURIComponent(currentGstin)}?period=${encodeURIComponent(targetPeriod)}`
        );
        const data2b = await res2b.json();
        if (data2b.success) {
          if (data2b.batch || (data2b.count && data2b.count > 0)) {
            const b = data2b.batch || {};
            let eligIgst = Number(b.eligible_itc_igst || 0);
            let eligCgst = Number(b.eligible_itc_cgst || 0);
            let eligSgst = Number(b.eligible_itc_sgst || 0);
            let eligTotal = Number(b.eligible_itc_total || (eligIgst + eligCgst + eligSgst));
            const totalInvs = Number(b.total_invoices || data2b.count || 0);

            // Safeguard against doubled ITC
            if (eligTotal > 0 && eligIgst === 0 && Math.abs(eligCgst - eligTotal) < 0.05 && Math.abs(eligSgst - eligTotal) < 0.05) {
              eligCgst = Math.round((eligTotal / 2) * 100) / 100;
              eligSgst = Math.round((eligTotal / 2) * 100) / 100;
            }

            // Extract taxable values and breakdown from data2b.invoices if available
            const invs = Array.isArray(data2b.invoices) ? data2b.invoices : [];
            let calcEligTx = 0, calcRcmTx = 0, calcCdnrTx = 0, calcIneligTx = 0;
            let calcIneligCgst = 0, calcIneligSgst = 0, calcIneligIgst = 0;
            let calcEligCgst = 0, calcEligSgst = 0, calcEligIgst = 0;
            let calcRcmCgst = 0, calcRcmSgst = 0, calcRcmIgst = 0;
            let calcCdnrCgst = 0, calcCdnrSgst = 0, calcCdnrIgst = 0;

            invs.forEach((inv: any) => {
              const isRcm = String(inv.rchrg || 'N').toUpperCase() === 'Y';
              const itcAvl = String(inv.itc_available || 'Y').toUpperCase() === 'Y';
              const sec = String(inv.section || '').toUpperCase();
              const isCdnr = sec.includes('CDNR');
              const tx = Number(inv.txval || 0);
              const cg = Number(inv.cgst || 0);
              const sg = Number(inv.sgst || 0);
              const ig = Number(inv.igst || 0);

              if (isRcm) {
                calcRcmTx += tx;
                calcRcmCgst += cg;
                calcRcmSgst += sg;
                calcRcmIgst += ig;
              } else if (isCdnr) {
                calcCdnrTx += tx;
                calcCdnrCgst += cg;
                calcCdnrSgst += sg;
                calcCdnrIgst += ig;
              } else if (itcAvl) {
                calcEligTx += tx;
                calcEligCgst += cg;
                calcEligSgst += sg;
                calcEligIgst += ig;
              } else {
                calcIneligTx += tx;
                calcIneligCgst += cg;
                calcIneligSgst += sg;
                calcIneligIgst += ig;
              }
            });

            if (calcEligIgst > 0 && !eligIgst) eligIgst = Math.round(calcEligIgst * 100) / 100;
            if (calcEligCgst > 0 && !eligCgst) eligCgst = Math.round(calcEligCgst * 100) / 100;
            if (calcEligSgst > 0 && !eligSgst) eligSgst = Math.round(calcEligSgst * 100) / 100;
            eligTotal = Math.round((eligCgst + eligSgst + eligIgst) * 100) / 100;

            const eligTxval = Number(b.eligible_itc_txval || calcEligTx || 0);
            const rcmTxval = Number(b.rcm_txval || calcRcmTx || 0);
            const cdnrTxval = Number(b.cdnr_txval || calcCdnrTx || 0);
            const ineligTxval = Number(b.ineligible_itc_txval || calcIneligTx || 0);
            const ineligIgst = Number(b.ineligible_itc_igst || calcIneligIgst || 0);
            const ineligCgst = Number(b.ineligible_itc_cgst || calcIneligCgst || 0);
            const ineligSgst = Number(b.ineligible_itc_sgst || calcIneligSgst || 0);
            const ineligTotal = Number(b.ineligible_itc_total || (ineligIgst + ineligCgst + ineligSgst) || 0);

            const rcmIgst = Number(b.rcm_igst || calcRcmIgst || 0);
            const rcmCgst = Number(b.rcm_cgst || calcRcmCgst || 0);
            const rcmSgst = Number(b.rcm_sgst || calcRcmSgst || 0);
            const rcmTotal = Number(b.rcm_total || (rcmIgst + rcmCgst + rcmSgst));

            const cdnrIgst = Number(b.cdnr_igst || calcCdnrIgst || 0);
            const cdnrCgst = Number(b.cdnr_cgst || calcCdnrCgst || 0);
            const cdnrSgst = Number(b.cdnr_sgst || calcCdnrSgst || 0);
            const cdnrTotal = Number(b.cdnr_total || (cdnrIgst + cdnrCgst + cdnrSgst));

            const impgIgst = Number(b.impg_igst || 0);
            const isdIgst = Number(b.isd_igst || 0);
            const isdCgst = Number(b.isd_cgst || 0);
            const isdSgst = Number(b.isd_sgst || 0);

            if (eligTotal > 0 || totalInvs > 0) {
              const summary2b: Gstr2bIngestSummary = {
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
                ineligibleItc: { taxable: ineligTxval, igst: ineligIgst, cgst: ineligCgst, sgst: ineligSgst, total: ineligTotal },
                netEligibleTotal: Math.round((eligTotal + rcmTotal + impgIgst + (isdIgst + isdCgst + isdSgst) - cdnrTotal - ineligTotal) * 100) / 100
              };
              setActiveGstr2b(summary2b);
            }
          }
        }
      } catch (e) {
        console.error('[ReturnsAutoIngestDeck] GSTR-2B DB hydrate error:', e);
      }

      // 2. Hydrate GSTR-1 from DB
      try {
        const resG1 = await safeApiFetch(
          `/api/gstr1/invoices/${encodeURIComponent(currentGstin)}?period=${encodeURIComponent(targetPeriod)}`
        );
        const dataG1 = await resG1.json();
        if (dataG1.success) {
          const invs = Array.isArray(dataG1.invoices) ? dataG1.invoices : [];
          const b = dataG1.batch || {};
          setGstr1BatchStatus(b?.status || 'PENDING');
          setGstr1RequestedAt(b?.requested_at || null);

          if (invs.length > 0 || (b && (b.total_taxable > 0 || b.total_invoices > 0))) {
            const breakdowns = {
              b2b: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
              b2c: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
              zeroRated: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
              nilRated: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
              exempt: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
              creditNote: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
              advanceReceived: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
              advanceAdjusted: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
              rcmOutward: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }
            };
            let b2bCount = 0, b2csCount = 0, cdnrCount = 0, expCount = 0;

            for (const inv of invs) {
              const sec = String(inv.section || 'B2B').toUpperCase();
              const tx = Number(inv.txval || 0);
              const cg = Number(inv.camt || 0);
              const sg = Number(inv.samt || 0);
              const ig = Number(inv.iamt || 0);
              const tot = cg + sg + ig;

              if (sec.includes('CDNR')) {
                cdnrCount++;
                breakdowns.creditNote.taxable += tx;
                breakdowns.creditNote.cgst += cg;
                breakdowns.creditNote.sgst += sg;
                breakdowns.creditNote.igst += ig;
                breakdowns.creditNote.total += tot;
              } else if (sec.includes('B2CS') || sec.includes('B2C')) {
                b2csCount++;
                breakdowns.b2c.taxable += tx;
                breakdowns.b2c.cgst += cg;
                breakdowns.b2c.sgst += sg;
                breakdowns.b2c.igst += ig;
                breakdowns.b2c.total += tot;
              } else if (sec.includes('EXP')) {
                expCount++;
                breakdowns.zeroRated.taxable += tx;
                breakdowns.zeroRated.cgst += cg;
                breakdowns.zeroRated.sgst += sg;
                breakdowns.zeroRated.igst += ig;
                breakdowns.zeroRated.total += tot;
              } else if (sec.includes('NIL')) {
                breakdowns.nilRated.taxable += tx;
              } else if (sec.includes('EXEMP')) {
                breakdowns.exempt.taxable += tx;
              } else {
                b2bCount++;
                breakdowns.b2b.taxable += tx;
                breakdowns.b2b.cgst += cg;
                breakdowns.b2b.sgst += sg;
                breakdowns.b2b.igst += ig;
                breakdowns.b2b.total += tot;
              }
            }

            const totalTaxable = b?.total_taxable != null && Number(b.total_taxable) > 0
              ? Number(b.total_taxable)
              : breakdowns.b2b.taxable + breakdowns.b2c.taxable + breakdowns.zeroRated.taxable - breakdowns.creditNote.taxable;

            const totalTax = b?.total_tax != null && Number(b.total_tax) > 0
              ? Number(b.total_tax)
              : breakdowns.b2b.total + breakdowns.b2c.total + breakdowns.zeroRated.total - breakdowns.creditNote.total;

            const summaryG1: Gstr1IngestSummary = {
              gstin: currentGstin,
              period: targetPeriod,
              monthKey: selectedMonth,
              fileType: 'JSON',
              fileName: 'Saved_GSTR1_Batch',
              counts: {
                b2b: b?.b2b_count || b2bCount,
                b2cl: b?.b2cl_count || 0,
                b2cs: b?.b2cs_count || b2csCount,
                exp: b?.exp_count || expCount,
                nil: 0,
                cdnr: b?.cdnr_count || cdnrCount,
                at: 0,
                totalDocs: (b?.total_invoices || invs.length)
              },
              breakdowns,
              totalOutwardTaxable: Math.round(totalTaxable * 100) / 100,
              totalOutwardTax: Math.round(totalTax * 100) / 100
            };
            setActiveGstr1(summaryG1);
          }
        }
      } catch (e) {
        console.error('[ReturnsAutoIngestDeck] GSTR-1 DB hydrate error:', e);
      }
    };

    hydrateFromDb();
  }, [currentGstin, selectedMonth, financialYear, currentMonthData?.year]);

  // ─── GSTR-1 AUTOPILOT HANDLER ────────────────────────────────────────────────
  const handleGstr1AutopilotSync = async () => {
    if (!currentGstin || currentGstin === 'Not Specified' || currentGstin.length < 15) {
      return toast.error('Valid GSTIN Required', {
        description: 'Please specify the client GSTIN in the client card before running GSTR-1 autopilot.'
      });
    }

    setIsGstr1AutopilotRunning(true);
    setGstr1AutopilotStep('Connecting to GST Portal...');
    const toastId = toast.loading(`Starting GSTR-1 Autopilot for ${selectedMonth} (${currentGstin})...`);

    try {
      setGstr1AutopilotStep('Launching Chrome & navigating to GSTR-1...');
      const targetPeriod = getTargetPeriod(selectedMonth, financialYear, currentMonthData);

      const res = await safeApiFetch('/api/gstr1/portal-sync-browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: currentGstin,
          returnPeriod: targetPeriod,
          financialYear,
          targetMonth: selectedMonth
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'GSTR-1 Autopilot sync failed.');
      }

      setGstr1AutopilotStep('Parsing downloaded GSTR-1 data...');

      // Re-hydrate GSTR-1 from DB
      const resG1 = await safeApiFetch(
        `/api/gstr1/invoices/${encodeURIComponent(currentGstin)}?period=${encodeURIComponent(targetPeriod)}`
      );
      const dataG1 = await resG1.json();
      let newlyFoundG1: Gstr1IngestSummary | null = null;

      if (dataG1.success && Array.isArray(dataG1.invoices)) {
        const invs = dataG1.invoices;
        const b = dataG1.batch || {};
        const breakdowns = {
          b2b: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
          b2c: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
          zeroRated: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
          nilRated: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
          exempt: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
          creditNote: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
          advanceReceived: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
          advanceAdjusted: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
          rcmOutward: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }
        };
        let b2bCount = 0, b2csCount = 0, cdnrCount = 0, expCount = 0;

        for (const inv of invs) {
          const sec = String(inv.section || 'B2B').toUpperCase();
          const tx = Number(inv.txval || 0);
          const cg = Number(inv.camt || 0);
          const sg = Number(inv.samt || 0);
          const ig = Number(inv.iamt || 0);
          const tot = cg + sg + ig;

          if (sec.includes('CDNR')) {
            cdnrCount++;
            breakdowns.creditNote.taxable += tx;
            breakdowns.creditNote.cgst += cg;
            breakdowns.creditNote.sgst += sg;
            breakdowns.creditNote.igst += ig;
            breakdowns.creditNote.total += tot;
          } else if (sec.includes('B2CS') || sec.includes('B2C')) {
            b2csCount++;
            breakdowns.b2c.taxable += tx;
            breakdowns.b2c.cgst += cg;
            breakdowns.b2c.sgst += sg;
            breakdowns.b2c.igst += ig;
            breakdowns.b2c.total += tot;
          } else if (sec.includes('EXP')) {
            expCount++;
            breakdowns.zeroRated.taxable += tx;
            breakdowns.zeroRated.cgst += cg;
            breakdowns.zeroRated.sgst += sg;
            breakdowns.zeroRated.igst += ig;
            breakdowns.zeroRated.total += tot;
          } else {
            b2bCount++;
            breakdowns.b2b.taxable += tx;
            breakdowns.b2b.cgst += cg;
            breakdowns.b2b.sgst += sg;
            breakdowns.b2b.igst += ig;
            breakdowns.b2b.total += tot;
          }
        }

        const totalTaxable = b?.total_taxable != null && Number(b.total_taxable) > 0
          ? Number(b.total_taxable)
          : breakdowns.b2b.taxable + breakdowns.b2c.taxable + breakdowns.zeroRated.taxable - breakdowns.creditNote.taxable;

        const totalTax = b?.total_tax != null && Number(b.total_tax) > 0
          ? Number(b.total_tax)
          : breakdowns.b2b.total + breakdowns.b2c.total + breakdowns.zeroRated.total - breakdowns.creditNote.total;

        newlyFoundG1 = {
          gstin: currentGstin,
          period: targetPeriod,
          monthKey: selectedMonth,
          fileType: 'JSON',
          fileName: 'Portal_Autopilot_GSTR1',
          counts: {
            b2b: b?.b2b_count || b2bCount,
            b2cl: b?.b2cl_count || 0,
            b2cs: b?.b2cs_count || b2csCount,
            exp: b?.exp_count || expCount,
            nil: 0,
            cdnr: b?.cdnr_count || cdnrCount,
            at: 0,
            totalDocs: (b?.total_invoices || invs.length)
          },
          breakdowns,
          totalOutwardTaxable: Math.round(totalTaxable * 100) / 100,
          totalOutwardTax: Math.round(totalTax * 100) / 100
        };
      }

      if (newlyFoundG1) {
        setGstr1BatchStatus('SYNCED');
        setActiveGstr1(newlyFoundG1);
        onApplyIngestedReturns(newlyFoundG1, null);
        toast.success(`GSTR-1 Autopilot Download Complete & Injected!`, {
          id: toastId,
          description: `Downloaded & applied ${newlyFoundG1.counts.totalDocs} documents for ${newlyFoundG1.monthKey || selectedMonth} (${fmt(newlyFoundG1.totalOutwardTaxable)} Sales) into Table 3.1.`
        });
      } else {
        if (data.status === 'REQUESTED') {
          setGstr1BatchStatus('REQUESTED');
          setGstr1RequestedAt(data.requestedAt || Date.now());
        }
        toast.info(data.status === 'REQUESTED' ? 'GSTR-1 Generation Requested (20-Min Wait)' : 'GSTR-1 Sync Dispatched', {
          id: toastId,
          description: data.message || 'Generation request sent. Autopilot will automatically download when ready in 20 minutes.'
        });
      }
    } catch (err: any) {
      toast.error('GSTR-1 Autopilot Failed', {
        id: toastId,
        description: err?.message || 'Check portal credentials or connection.'
      });
    } finally {
      setIsGstr1AutopilotRunning(false);
      setGstr1AutopilotStep('');
    }
  };

  // ─── GSTR-1 PDF AUTOPILOT HANDLER (PORTAL DOWNLOAD & INJECT) ────────────────
  const handleGstr1PdfAutopilotSync = async () => {
    if (!currentGstin || currentGstin === 'Not Specified' || currentGstin.length < 15) {
      return toast.error('Valid GSTIN Required', {
        description: 'Please specify the client GSTIN in the client card before running GSTR-1 PDF autopilot.'
      });
    }

    setIsGstr1PdfAutopilotRunning(true);
    setGstr1PdfAutopilotStep('Connecting to GST Portal...');
    const toastId = toast.loading(`Starting GSTR-1 PDF Autopilot for ${selectedMonth} (${currentGstin})...`);

    try {
      setGstr1PdfAutopilotStep('Launching Chrome & navigating to GSTR-1...');
      const targetPeriod = getTargetPeriod(selectedMonth, financialYear, currentMonthData);

      const res = await safeApiFetch('/api/gstr1/portal-sync-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: currentGstin,
          returnPeriod: targetPeriod,
          financialYear,
          targetMonth: selectedMonth
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'GSTR-1 PDF portal automation failed.');
      }

      setGstr1PdfAutopilotStep('Extracting outward supplies from PDF...');

      if (data.gstr1) {
        setActiveGstr1(data.gstr1);
        onApplyIngestedReturns(data.gstr1, null);
        toast.success(`GSTR-1 PDF Downloaded & Injected!`, {
          id: toastId,
          description: `Extracted ₹${fmt(data.gstr1.totalOutwardTaxable)} Sales (Tax: ₹${fmt(data.gstr1.totalOutwardTax)}) into Table 3.1 for ${data.gstr1.monthKey || selectedMonth}.`
        });
      } else {
        // Fallback: Re-hydrate GSTR-1 from DB
        const resG1 = await safeApiFetch(
          `/api/gstr1/invoices/${encodeURIComponent(currentGstin)}?period=${encodeURIComponent(targetPeriod)}`
        );
        const dataG1 = await resG1.json();
        if (dataG1.success && dataG1.batch) {
          toast.info(data.message || 'GSTR-1 PDF download request completed.', { id: toastId });
        } else {
          toast.info('GSTR-1 PDF automation completed.', { id: toastId, description: data.message });
        }
      }
    } catch (err: any) {
      toast.error('GSTR-1 PDF Autopilot Failed', {
        id: toastId,
        description: err?.message || 'Check portal credentials or connection.'
      });
    } finally {
      setIsGstr1PdfAutopilotRunning(false);
      setGstr1PdfAutopilotStep('');
    }
  };

  // ─── CANCEL GSTR-1 AUTOPILOT & AUTO-DOWNLOAD ────────────────────────────────
  const handleCancelGstr1 = async () => {
    try {
      const targetPeriod = getTargetPeriod(selectedMonth, financialYear, currentMonthData);

      hasAutoTriggeredGstr1.current = false;
      setIsGstr1AutopilotRunning(false);
      setGstr1AutopilotStep('');
      setIsGstr1PdfAutopilotRunning(false);
      setGstr1PdfAutopilotStep('');
      setGstr1BatchStatus('IDLE');
      setGstr1RequestedAt(null);

      await safeApiFetch('/api/gstr1/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: currentGstin,
          returnPeriod: targetPeriod,
          month: selectedMonth,
          financialYear
        })
      });

      toast.info('GSTR-1 Automatic Download Cancelled', {
        description: `Stopped automatic download countdown and reset GSTR-1 queue for ${selectedMonth}.`
      });
    } catch (err: any) {
      console.warn('[GSTR-1 Cancel error]:', err);
      toast.info('GSTR-1 Cancel signal dispatched');
    }
  };

  // ─── CANCEL GSTR-2B AUTOPILOT ────────────────────────────────────────────────
  const handleCancelGstr2b = async () => {
    try {
      const targetPeriod = getTargetPeriod(selectedMonth, financialYear, currentMonthData);

      setIsGstr2bAutopilotRunning(false);
      setGstr2bAutopilotStep('');

      await safeApiFetch('/api/gstr2b/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: currentGstin,
          returnPeriod: targetPeriod,
          month: selectedMonth,
          financialYear
        })
      });

      toast.info('GSTR-2B Autopilot Cancelled', {
        description: `Cancelled GSTR-2B autopilot browser session.`
      });
    } catch (err: any) {
      console.warn('[GSTR-2B Cancel error]:', err);
      toast.info('GSTR-2B Cancel signal dispatched');
    }
  };

  // ─── AUTOMATIC DOWNLOAD TRIGGER ON 20-MIN TIMER COMPLETION ─────────────────
  const hasAutoTriggeredGstr1 = useRef(false);

  useEffect(() => {
    // Reset auto-trigger ref if status changes away from REQUESTED/READY_TO_DOWNLOAD
    if (gstr1BatchStatus !== 'REQUESTED' && gstr1BatchStatus !== 'READY_TO_DOWNLOAD') {
      hasAutoTriggeredGstr1.current = false;
      return;
    }

    // When timer expires (gstr1SecondsLeft === 0) and batch was requested, automatically trigger download!
    if (
      (gstr1BatchStatus === 'REQUESTED' || gstr1BatchStatus === 'READY_TO_DOWNLOAD') &&
      gstr1RequestedAt != null &&
      gstr1SecondsLeft === 0 &&
      !isGstr1AutopilotRunning &&
      !hasAutoTriggeredGstr1.current &&
      currentGstin &&
      currentGstin !== 'Not Specified' &&
      currentGstin.length >= 15
    ) {
      hasAutoTriggeredGstr1.current = true;
      console.log(`[ReturnsAutoIngestDeck] ⏱️ 20-minute timer completed for ${selectedMonth}! Automatically launching GSTR-1 download...`);
      toast.info('⏱️ 20-Minute Timer Completed!', {
        description: `Automatically launching GSTR-1 download for ${selectedMonth}...`
      });
      handleGstr1AutopilotSync();
    }
  }, [gstr1SecondsLeft, gstr1BatchStatus, gstr1RequestedAt, isGstr1AutopilotRunning, currentGstin, selectedMonth]);

  // Periodic polling every 12 seconds while in REQUESTED status to keep DB in sync
  useEffect(() => {
    if (gstr1BatchStatus !== 'REQUESTED' || !currentGstin || isGstr1AutopilotRunning) return;
    const interval = setInterval(async () => {
      try {
        const targetPeriod = getTargetPeriod(selectedMonth, financialYear, currentMonthData);
        const resG1 = await safeApiFetch(
          `/api/gstr1/invoices/${encodeURIComponent(currentGstin)}?period=${encodeURIComponent(targetPeriod)}`
        );
        const dataG1 = await resG1.json();
        if (dataG1.success && dataG1.batch) {
          if (dataG1.batch.status) setGstr1BatchStatus(dataG1.batch.status);
          if (dataG1.batch.requested_at) setGstr1RequestedAt(dataG1.batch.requested_at);
        }
      } catch (e) {}
    }, 12000);
    return () => clearInterval(interval);
  }, [gstr1BatchStatus, currentGstin, selectedMonth, currentMonthData?.year, financialYear, isGstr1AutopilotRunning]);

  // ─── GSTR-2B AUTOPILOT HANDLER ────────────────────────────────────────────────
  const handleGstr2bAutopilotSync = async () => {
    if (!currentGstin || currentGstin === 'Not Specified' || currentGstin.length < 15) {
      return toast.error('Valid GSTIN Required', {
        description: 'Please specify the client GSTIN in the client card before running GSTR-2B autopilot.'
      });
    }

    setIsGstr2bAutopilotRunning(true);
    setGstr2bAutopilotStep('Connecting to GST Portal...');
    const toastId = toast.loading(`Starting GSTR-2B Autopilot for ${selectedMonth} (${currentGstin})...`);

    try {
      setGstr2bAutopilotStep('Launching Chrome & navigating to GSTR-2B...');
      const targetPeriod = getTargetPeriod(selectedMonth, financialYear, currentMonthData);

      const res = await safeApiFetch('/api/gstr2b/portal-sync-browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin: currentGstin,
          returnPeriod: targetPeriod,
          financialYear,
          targetMonth: selectedMonth
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'GSTR-2B Autopilot sync failed.');
      }

      setGstr2bAutopilotStep('Parsing downloaded GSTR-2B data...');

      // Re-hydrate GSTR-2B from DB
      const res2b = await safeApiFetch(
        `/api/gstr2b/invoices/${encodeURIComponent(currentGstin)}?period=${encodeURIComponent(targetPeriod)}`
      );
      const data2b = await res2b.json();
      let newlyFound2b: Gstr2bIngestSummary | null = null;

      if (data2b.success && (data2b.batch || (data2b.count && data2b.count > 0))) {
        const b = data2b.batch || {};
        let eligIgst = Number(b.eligible_itc_igst || 0);
        let eligCgst = Number(b.eligible_itc_cgst || 0);
        let eligSgst = Number(b.eligible_itc_sgst || 0);
        let eligTotal = Number(b.eligible_itc_total || (eligIgst + eligCgst + eligSgst));
        const totalInvs = Number(b.total_invoices || data2b.count || 0);

        if (eligTotal > 0 && eligIgst === 0 && Math.abs(eligCgst - eligTotal) < 0.05 && Math.abs(eligSgst - eligTotal) < 0.05) {
          eligCgst = Math.round((eligTotal / 2) * 100) / 100;
          eligSgst = Math.round((eligTotal / 2) * 100) / 100;
        }

        const invs = Array.isArray(data2b.invoices) ? data2b.invoices : [];
        let calcEligTx = 0, calcRcmTx = 0, calcCdnrTx = 0, calcIneligTx = 0;
        let calcIneligCgst = 0, calcIneligSgst = 0, calcIneligIgst = 0;
        let calcEligCgst = 0, calcEligSgst = 0, calcEligIgst = 0;
        let calcRcmCgst = 0, calcRcmSgst = 0, calcRcmIgst = 0;
        let calcCdnrCgst = 0, calcCdnrSgst = 0, calcCdnrIgst = 0;

        invs.forEach((inv: any) => {
          const isRcm = String(inv.rchrg || 'N').toUpperCase() === 'Y';
          const itcAvl = String(inv.itc_available || 'Y').toUpperCase() === 'Y';
          const sec = String(inv.section || '').toUpperCase();
          const isCdnr = sec.includes('CDNR');
          const tx = Number(inv.txval || 0);
          const cg = Number(inv.cgst || 0);
          const sg = Number(inv.sgst || 0);
          const ig = Number(inv.igst || 0);

          if (isRcm) {
            calcRcmTx += tx;
            calcRcmCgst += cg;
            calcRcmSgst += sg;
            calcRcmIgst += ig;
          } else if (isCdnr) {
            calcCdnrTx += tx;
            calcCdnrCgst += cg;
            calcCdnrSgst += sg;
            calcCdnrIgst += ig;
          } else if (itcAvl) {
            calcEligTx += tx;
            calcEligCgst += cg;
            calcEligSgst += sg;
            calcEligIgst += ig;
          } else {
            calcIneligTx += tx;
            calcIneligCgst += cg;
            calcIneligSgst += sg;
            calcIneligIgst += ig;
          }
        });

        if (calcEligIgst > 0 && !eligIgst) eligIgst = Math.round(calcEligIgst * 100) / 100;
        if (calcEligCgst > 0 && !eligCgst) eligCgst = Math.round(calcEligCgst * 100) / 100;
        if (calcEligSgst > 0 && !eligSgst) eligSgst = Math.round(calcEligSgst * 100) / 100;
        eligTotal = Math.round((eligCgst + eligSgst + eligIgst) * 100) / 100;

        const eligTxval = Number(b.eligible_itc_txval || calcEligTx || 0);
        const rcmTxval = Number(b.rcm_txval || calcRcmTx || 0);
        const cdnrTxval = Number(b.cdnr_txval || calcCdnrTx || 0);
        const ineligTxval = Number(b.ineligible_itc_txval || calcIneligTx || 0);
        const ineligIgst = Number(b.ineligible_itc_igst || calcIneligIgst || 0);
        const ineligCgst = Number(b.ineligible_itc_cgst || calcIneligCgst || 0);
        const ineligSgst = Number(b.ineligible_itc_sgst || calcIneligSgst || 0);
        const ineligTotal = Number(b.ineligible_itc_total || (ineligIgst + ineligCgst + ineligSgst) || 0);

        const rcmIgst = Number(b.rcm_igst || calcRcmIgst || 0);
        const rcmCgst = Number(b.rcm_cgst || calcRcmCgst || 0);
        const rcmSgst = Number(b.rcm_sgst || calcRcmSgst || 0);
        const rcmTotal = Number(b.rcm_total || (rcmIgst + rcmCgst + rcmSgst));

        const cdnrIgst = Number(b.cdnr_igst || calcCdnrIgst || 0);
        const cdnrCgst = Number(b.cdnr_cgst || calcCdnrCgst || 0);
        const cdnrSgst = Number(b.cdnr_sgst || calcCdnrSgst || 0);
        const cdnrTotal = Number(b.cdnr_total || (cdnrIgst + cdnrCgst + cdnrSgst));

        const impgIgst = Number(b.impg_igst || 0);
        const isdIgst = Number(b.isd_igst || 0);
        const isdCgst = Number(b.isd_cgst || 0);
        const isdSgst = Number(b.isd_sgst || 0);

        newlyFound2b = {
          gstin: currentGstin,
          period: targetPeriod,
          monthKey: selectedMonth,
          fileType: 'JSON',
          fileName: 'Portal_Autopilot_2B',
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
          ineligibleItc: { taxable: ineligTxval, igst: ineligIgst, cgst: ineligCgst, sgst: ineligSgst, total: ineligTotal },
          netEligibleTotal: Math.round((eligTotal + rcmTotal + impgIgst + (isdIgst + isdCgst + isdSgst) - cdnrTotal - ineligTotal) * 100) / 100
        };
      }

      if (newlyFound2b) {
        setActiveGstr2b(newlyFound2b);
        onApplyIngestedReturns(null, newlyFound2b);
        toast.success(`GSTR-2B Autopilot Download Complete & Injected!`, {
          id: toastId,
          description: `Downloaded & applied ${newlyFound2b.counts.totalInvoices} invoices for ${newlyFound2b.monthKey || selectedMonth} (${fmt(newlyFound2b.netEligibleTotal)} Net ITC) into Table 4.`
        });
      } else {
        toast.info('GSTR-2B Sync Dispatched', {
          id: toastId,
          description: data.message || 'GSTR-2B sync completed.'
        });
      }
    } catch (err: any) {
      toast.error('GSTR-2B Autopilot Failed', {
        id: toastId,
        description: err?.message || 'Check portal credentials or connection.'
      });
    } finally {
      setIsGstr2bAutopilotRunning(false);
      setGstr2bAutopilotStep('');
    }
  };

  // ─── SEQUENTIAL COMBINED AUTOPILOT ───────────────────────────────────────────
  const handleSyncBothAutopilot = async () => {
    setIsCombinedAutopilotRunning(true);
    const toastId = toast.loading(`Starting Sequential Autopilot (GSTR-1 then GSTR-2B)...`);
    try {
      await handleGstr1AutopilotSync();
      await handleGstr2bAutopilotSync();
      toast.success('Sequential Autopilot Finished!', { id: toastId });
    } catch (err: any) {
      toast.error('Sequential Autopilot Interrupted', { id: toastId, description: err?.message });
    } finally {
      setIsCombinedAutopilotRunning(false);
    }
  };

  // ─── FILE UPLOAD HANDLERS ───────────────────────────────────────────────────
  const handleGstr1FilesChosen = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsProcessingGstr1(true);
    const toastId = toast.loading(`Parsing GSTR-1 file(s)...`);

    try {
      let parsedG1: Gstr1IngestSummary | null = null;
      for (let i = 0; i < files.length; i++) {
        const res = await parseAnyReturnsFile(files[i]);
        if (res.error) throw new Error(res.error);
        if (res.gstr1) parsedG1 = res.gstr1;
        if (res.gstr2b && !res.gstr1) {
          toast.warning(`Note: Uploaded file contains GSTR-2B data. Routed to 2B deck.`);
          setActiveGstr2b(res.gstr2b);
        }
      }

      if (!parsedG1) throw new Error('No valid GSTR-1 data found in uploaded file.');

      setActiveGstr1(parsedG1);
      onApplyIngestedReturns(parsedG1, null);
      toast.success(`GSTR-1 Parsed & Injected!`, {
        id: toastId,
        description: `Applied ${fmt(parsedG1.totalOutwardTaxable)} Sales into Table 3.1 for ${parsedG1.monthKey || selectedMonth}.`
      });
    } catch (err: any) {
      toast.error('GSTR-1 File Parse Error', { id: toastId, description: err?.message });
    } finally {
      setIsProcessingGstr1(false);
      if (gstr1FileInputRef.current) gstr1FileInputRef.current.value = '';
    }
  };

  const handleGstr1PdfFileChosen = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsProcessingGstr1(true);
    const toastId = toast.loading(`Parsing GSTR-1 PDF & auto-injecting into Table 3.1...`);

    try {
      const file = files[0];
      const res = await parseAnyReturnsFile(file);
      if (res.error) throw new Error(res.error);
      if (!res.gstr1) throw new Error('No valid GSTR-1 data found in uploaded PDF.');

      setActiveGstr1(res.gstr1);
      onApplyIngestedReturns(res.gstr1, null);
      toast.success(`GSTR-1 PDF Injected into Table 3.1!`, {
        id: toastId,
        description: `Applied ₹${fmt(res.gstr1.totalOutwardTaxable)} Sales (Tax: ₹${fmt(res.gstr1.totalOutwardTax)}) to ${res.gstr1.monthKey || selectedMonth} Table 3.1. Rule 88A set-off updated.`
      });
    } catch (err: any) {
      toast.error('GSTR-1 PDF Extraction Error', { id: toastId, description: err?.message });
    } finally {
      setIsProcessingGstr1(false);
      if (gstr1PdfInputRef.current) gstr1PdfInputRef.current.value = '';
    }
  };

  const handleGstr2bFilesChosen = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsProcessingGstr2b(true);
    const toastId = toast.loading(`Parsing GSTR-2B file(s)...`);

    try {
      let parsed2b: Gstr2bIngestSummary | null = null;
      for (let i = 0; i < files.length; i++) {
        const res = await parseAnyReturnsFile(files[i]);
        if (res.error) throw new Error(res.error);
        if (res.gstr2b) parsed2b = res.gstr2b;
        if (res.gstr1 && !res.gstr2b) {
          toast.warning(`Note: Uploaded file contains GSTR-1 data. Routed to GSTR-1 deck.`);
          setActiveGstr1(res.gstr1);
          onApplyIngestedReturns(res.gstr1, null);
        }
      }

      if (!parsed2b) throw new Error('No valid GSTR-2B data found in uploaded file.');

      setActiveGstr2b(parsed2b);
      onApplyIngestedReturns(null, parsed2b);
      toast.success(`GSTR-2B Parsed & Injected!`, {
        id: toastId,
        description: `Applied ${fmt(parsed2b.netEligibleTotal)} Net ITC into Table 4 for ${parsed2b.monthKey || selectedMonth}.`
      });
    } catch (err: any) {
      toast.error('GSTR-2B File Parse Error', { id: toastId, description: err?.message });
    } finally {
      setIsProcessingGstr2b(false);
      if (gstr2bFileInputRef.current) gstr2bFileInputRef.current.value = '';
    }
  };

  // ─── CONFIRMATION MODAL INJECTION EXECUTION ─────────────────────────────────
  const executeConfirmedInjection = () => {
    const { mode, gstr1, gstr2b } = confirmModal;
    const targetG1 = mode === 'GSTR1' || mode === 'BOTH' ? (gstr1 || activeGstr1) : null;
    const target2b = mode === 'GSTR2B' || mode === 'BOTH' ? (gstr2b || activeGstr2b) : null;

    onApplyIngestedReturns(targetG1, target2b);

    if (mode === 'GSTR1' && targetG1) {
      toast.success(`Table 3.1 Updated Successfully!`, {
        description: `Injected GSTR-1 Outward Sales: ${fmt(targetG1.totalOutwardTaxable)} (Tax: ${fmt(targetG1.totalOutwardTax)}) into ${selectedMonth}.`
      });
    } else if (mode === 'GSTR2B' && target2b) {
      toast.success(`Table 4 Updated Successfully!`, {
        description: `Injected GSTR-2B Net Available ITC: ${fmt(target2b.netEligibleTotal)} into ${selectedMonth}.`
      });
    } else if (mode === 'BOTH') {
      toast.success(`Table 3.1 & Table 4 Updated Successfully!`, {
        description: `GSTR-1 Sales & GSTR-2B ITC populated for ${selectedMonth}. Rule 88A tax cascade recalculated.`
      });
    }

    setConfirmModal({ isOpen: false, mode: 'GSTR1', gstr1: null, gstr2b: null });
  };

  // ─── GSTR-1 BIFURCATED MATRIX DATA ───
  const g1B2b = activeGstr1?.breakdowns?.b2b || currentMonthData?.outward?.b2b;
  const g1B2c = activeGstr1?.breakdowns?.b2c || currentMonthData?.outward?.b2c;
  const g1Zero = activeGstr1?.breakdowns?.zeroRated || currentMonthData?.outward?.zeroRated;
  const g1Cdnr = activeGstr1?.breakdowns?.creditNote || currentMonthData?.outward?.creditNote;
  const g1NilTaxable = ((activeGstr1?.breakdowns?.nilRated?.taxable || 0) + (activeGstr1?.breakdowns?.exempt?.taxable || 0)) ||
    ((currentMonthData?.outward?.nilRated?.taxable || 0) + (currentMonthData?.outward?.exempt?.taxable || 0));
  // Inward RCM is Table 3.1(d) in GSTR-3B (matches Table 4(A)(3) of GSTR-2B)
  const g1Rcm = ((activeGstr1?.breakdowns?.rcmOutward?.total || 0) > 0 || (activeGstr1?.breakdowns?.rcmOutward?.taxable || 0) > 0)
    ? activeGstr1.breakdowns.rcmOutward
    : (activeGstr2b?.rcmInward && ((activeGstr2b.rcmInward.total || 0) > 0 || (activeGstr2b.rcmInward.taxable || 0) > 0)
        ? activeGstr2b.rcmInward
        : (currentMonthData?.outward?.rcmInward || currentMonthData?.inward?.rcmPaid));

  // Shared RCM Categories across both side cockpits and computation sheet
  const rcmTransport = currentMonthData?.outward?.rcmTransport ||
    (g1Rcm && (g1Rcm.taxable || g1Rcm.total) ? g1Rcm : { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });
  const rcmSecurity = currentMonthData?.outward?.rcmSecurity || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
  const rcmGuestHouse = currentMonthData?.outward?.rcmGuestHouse || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
  const rcmAdvocate = currentMonthData?.outward?.rcmAdvocate || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };

  // GSTR-1 Totals
  const g1TotalTaxable = activeGstr1?.totalOutwardTaxable || currentMonthData?.outward?.totalSaleWorking?.taxable || 0;
  const g1TotalCgst = currentMonthData?.outward?.totalSaleWorking?.cgst ??
    Math.round(((g1B2b?.cgst || 0) + (g1B2c?.cgst || 0) + (g1Zero?.cgst || 0) - (g1Cdnr?.cgst || 0)) * 100) / 100;
  const g1TotalSgst = currentMonthData?.outward?.totalSaleWorking?.sgst ??
    Math.round(((g1B2b?.sgst || 0) + (g1B2c?.sgst || 0) + (g1Zero?.sgst || 0) - (g1Cdnr?.sgst || 0)) * 100) / 100;
  const g1TotalIgst = currentMonthData?.outward?.totalSaleWorking?.igst ??
    Math.round(((g1B2b?.igst || 0) + (g1B2c?.igst || 0) + (g1Zero?.igst || 0) - (g1Cdnr?.igst || 0)) * 100) / 100;
  const g1TotalTax = activeGstr1?.totalOutwardTax || currentMonthData?.outward?.totalSaleWorking?.total ||
    Math.round((g1TotalCgst + g1TotalSgst + g1TotalIgst) * 100) / 100;

  // ─── GSTR-2B BIFURCATED MATRIX DATA ───
  const g2bItc2b = activeGstr2b?.eligibleItc || currentMonthData?.inward?.itc2b;
  const g2bRcm = (activeGstr2b?.rcmInward && ((activeGstr2b.rcmInward.total || 0) > 0 || (activeGstr2b.rcmInward.taxable || 0) > 0))
    ? activeGstr2b.rcmInward
    : (currentMonthData?.inward?.rcmPaid || currentMonthData?.outward?.rcmInward || g1Rcm);
  const g2bImpg = activeGstr2b?.importGoods || currentMonthData?.inward?.importGoods;
  const g2bDebitNotes = activeGstr2b?.debitNotes || currentMonthData?.inward?.creditNotes; // (+) Row 36
  const g2bCreditNotes = activeGstr2b?.creditNotes || currentMonthData?.inward?.debitNotes; // (-) Row 38
  const g2bInelig = activeGstr2b?.ineligibleItc || currentMonthData?.inward?.itcReversed;   // (-) Row 39 / 4(B)

  // GSTR-2B Net Available Totals (Row 41 / Table 4(C))
  const g2bNetCgst = currentMonthData?.inward?.totalItcAvailable?.cgst ??
    Math.round(((g2bItc2b?.cgst || 0) + (g2bRcm?.cgst || 0) + (g2bDebitNotes?.cgst || 0) - (g2bCreditNotes?.cgst || 0) - (g2bInelig?.cgst || 0)) * 100) / 100;
  const g2bNetSgst = currentMonthData?.inward?.totalItcAvailable?.sgst ??
    Math.round(((g2bItc2b?.sgst || 0) + (g2bRcm?.sgst || 0) + (g2bDebitNotes?.sgst || 0) - (g2bCreditNotes?.sgst || 0) - (g2bInelig?.sgst || 0)) * 100) / 100;
  const g2bNetIgst = currentMonthData?.inward?.totalItcAvailable?.igst ??
    Math.round(((g2bItc2b?.igst || 0) + (g2bRcm?.igst || 0) + (g2bImpg?.igst || 0) + (g2bDebitNotes?.igst || 0) - (g2bCreditNotes?.igst || 0) - (g2bInelig?.igst || 0)) * 100) / 100;
  const g2bNetTotal = activeGstr2b?.netEligibleTotal || currentMonthData?.inward?.totalItcAvailable?.total ||
    Math.round((g2bNetCgst + g2bNetSgst + g2bNetIgst) * 100) / 100;

  return (
    <div className={compactMode ? "space-y-4" : "bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-xl space-y-4"}>
      {/* ─── COCKPIT LOCKED BANNER NOTIFICATION ─── */}
      {isLocked && (
        <div className="bg-rose-950/50 border border-rose-500/50 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-rose-200 text-xs shadow-inner">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center justify-center shrink-0">
              <Lock className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold uppercase tracking-wide">{selectedMonth} Cockpit & Autopilot Locked</span>
              <span className="text-rose-300 text-[11px] block sm:inline sm:ml-2">
                — Autopilot downloading, file uploads, sub-table edits, and return injections for {selectedMonth} are locked in Read-Only mode.
              </span>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 font-mono text-[10px] font-bold uppercase border border-rose-500/30 shrink-0">
            🔒 {selectedMonth} Protected
          </span>
        </div>
      )}

      {/* ─── TOP MASTER BAR: Render only when NOT in compactMode (since full sheet already has FY & Save buttons) ─── */}
      {!compactMode && (
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 via-blue-500/20 to-emerald-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center font-bold shadow-md shadow-indigo-950/40">
            <Layers className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                Returns Auto-Pilot & Ingestion Deck
              </h3>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" /> Split Cockpits Active
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Independent GSTR-1 Outward Sales & GSTR-2B Inward ITC Cockpits with Rule 88A Cash Cascade Recalculation.
            </p>
          </div>
        </div>

        {/* Global Toolbar: FY Selector & Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Financial Year Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950/70 p-1.5 rounded-xl border border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1.5">
              FY:
            </span>
            {AVAILABLE_FYS.map(fy => (
              <button
                key={fy}
                onClick={() => onFinancialYearChange(fy)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                  financialYear === fy
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-950 ring-1 ring-blue-400/40'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                {fy}
              </button>
            ))}
          </div>

          {/* Sequential Both Autopilot Button */}
          <button
            onClick={() => {
              if (isLocked) {
                toast.error('Cockpit is Locked', { description: 'Unlock 3B Working Sheet with password to run autopilot.' });
                return;
              }
              handleSyncBothAutopilot();
            }}
            disabled={isLocked || isCombinedAutopilotRunning || isGstr1AutopilotRunning || isGstr2bAutopilotRunning || !currentGstin || currentGstin === 'Not Specified'}
            className="px-3.5 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-md border border-purple-400/30 flex items-center gap-1.5 transition-all disabled:opacity-50"
            title={isLocked ? 'Cockpit is locked' : 'Download GSTR-1 and GSTR-2B sequentially in one go'}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Sync Both Autopilot</span>
          </button>

          {/* Cancel Autopilot Button (if any autopilot is running) */}
          {(isGstr1AutopilotRunning || isGstr2bAutopilotRunning || isCombinedAutopilotRunning) && (
            <button
              onClick={() => {
                if (isGstr1AutopilotRunning || isCombinedAutopilotRunning) handleCancelGstr1();
                if (isGstr2bAutopilotRunning || isCombinedAutopilotRunning) handleCancelGstr2b();
              }}
              className="px-3.5 py-1.5 bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer animate-pulse shadow-sm"
              title="Cleanly abort and cancel active autopilot session"
            >
              <XCircle className="w-3.5 h-3.5 text-rose-300" />
              <span>Cancel Autopilot</span>
            </button>
          )}

          {/* Inspect Returns Ledger */}
          <button
            onClick={() => setShowBreakdownModal(true)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <Eye className="w-3.5 h-3.5 text-purple-400" />
            <span>Ledger</span>
          </button>

          {/* Clear Active Month */}
          <button
            onClick={() => {
              if (isLocked) {
                toast.error('Cockpit is Locked', { description: 'Unlock 3B Working Sheet with password to clear figures.' });
                return;
              }
              onClearMonthIngestion();
            }}
            disabled={isLocked}
            className={`px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 text-xs font-bold rounded-xl border border-rose-500/30 flex items-center gap-1.5 transition-colors ${
              isLocked ? 'opacity-40 cursor-not-allowed' : ''
            }`}
            title={isLocked ? 'Cockpit is locked' : 'Reset figures for active month'}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>

          {/* Save 3B Working */}
          <button
            type="button"
            onClick={() => {
              if (isLocked) {
                toast.error('Cockpit is Locked', { description: 'Unlock 3B Working Sheet with password before saving.' });
                return;
              }
              onSaveWorking?.();
            }}
            disabled={isLocked || isSavingWorking}
            className={`px-4 py-1.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-extrabold rounded-xl shadow-md border border-emerald-400/50 flex items-center gap-2 transition-all ${
              isLocked ? 'opacity-40 cursor-not-allowed' : 'disabled:opacity-50'
            }`}
            title={isLocked ? 'Cockpit is locked' : 'Save 3B Working Sheet to Central Server & Local Storage'}
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
      )}

      {/* ─── TWO DISTINCT OPERATIONAL COCKPITS (SIDE-BY-SIDE 2-COLUMN GRID) ─── */}
      <div className="flex flex-col lg:flex-row gap-4 transition-all duration-300">
        {/* ========================================================================= */}
        {/* CARD 1: GSTR-1 OUTWARD SALES DECK (BLUE / INDIGO THEME)                    */}
        {/* ========================================================================= */}
        <div className={`bg-gradient-to-b from-slate-950 via-slate-900 to-blue-950/20 border border-slate-800 hover:border-blue-500/40 rounded-2xl p-3 sm:p-4 flex flex-col justify-between shadow-md transition-all duration-300 ease-in-out min-w-0 ${
          gstr1Collapsed
            ? 'lg:w-14 w-full overflow-hidden'
            : gstr2bCollapsed
              ? 'lg:flex-1 w-full'
              : 'lg:flex-1 w-full'
        } space-y-3.5`}>
          <div>
            {/* Header: Title & Status Badge */}
            <div className={`flex items-center justify-between pb-2.5 border-b border-slate-800/80 ${gstr1Collapsed ? 'lg:flex-col lg:gap-3' : ''}`}>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center font-bold shrink-0">
                  <ArrowUpRight className="w-3.5 h-3.5 text-blue-400" />
                </div>
                {!gstr1Collapsed && (
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-wide">
                      GSTR-1 Outward Sales
                    </h4>
                    <span className="text-[10px] text-blue-300/80 font-mono">Targets GSTR-3B Table 3.1</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Small Countdown Timer Badge for GSTR-1 */}
                {!gstr1Collapsed && (gstr1BatchStatus === 'REQUESTED' || gstr1BatchStatus === 'READY_TO_DOWNLOAD') && (
                  gstr1SecondsLeft > 0 ? (
                    <div className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-mono font-bold flex items-center gap-1.5 shadow-xs shadow-amber-950/40">
                      <Clock className="w-3 h-3 text-amber-400 animate-spin" style={{ animationDuration: '4s' }} />
                      <span>⏱️ <strong>{Math.floor(gstr1SecondsLeft / 60)}:{String(gstr1SecondsLeft % 60).padStart(2, '0')}</strong></span>
                      <span className="text-[8px] bg-amber-500/30 text-amber-200 px-1 py-0.2 rounded font-sans uppercase font-bold">Auto-DL</span>
                    </div>
                  ) : (
                    <div className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-bold flex items-center gap-1.5 animate-pulse shadow-xs shadow-emerald-950/40">
                      <Zap className="w-3 h-3 text-emerald-400" />
                      <span>⚡ Ready: Auto-Downloading</span>
                    </div>
                  )
                )}

                {/* Status Pill — hidden when collapsed */}
                {!gstr1Collapsed && (
                  <div className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold flex items-center gap-1.5 ${
                    hasOutwardData || activeGstr1
                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${hasOutwardData || activeGstr1 ? 'bg-blue-400' : 'bg-slate-600'}`} />
                    <span>{hasOutwardData ? 'Table 3.1 Filled' : activeGstr1 ? 'Data Ready' : 'Pending'}</span>
                  </div>
                )}

                {/* Edit Toggle for Card 1 */}
                {!gstr1Collapsed && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isLocked) {
                        toast.error('Cockpit is Locked', { description: 'Unlock 3B sheet to edit figures.' });
                        return;
                      }
                      setIsG1LocalEdit(v => !v);
                    }}
                    disabled={isLocked}
                    title={isLocked ? 'Cockpit is locked' : isG1Editable ? 'Lock GSTR-1 figures' : 'Edit GSTR-1 figures'}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                      isLocked
                        ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500 border border-slate-700'
                        : isG1Editable
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                          : 'bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300'
                    }`}
                  >
                    <Edit3 className="w-3 h-3 text-amber-300" />
                    <span>{isG1Editable ? 'Lock' : 'Edit'}</span>
                  </button>
                )}

                {/* Collapse toggle button */}
                <button
                  onClick={() => setGstr1Collapsed(c => !c)}
                  title={gstr1Collapsed ? 'Expand GSTR-1 panel' : 'Collapse GSTR-1 panel'}
                  className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition-all shrink-0 cursor-pointer"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${
                    gstr1Collapsed ? '-rotate-90' : 'rotate-0'
                  }`} />
                </button>
              </div>
            </div>

            {/* Collapsible body: Live Metrics + Dropzone */}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
              gstr1Collapsed ? 'max-h-0 opacity-0 mt-0' : 'max-h-[9999px] opacity-100 mt-0'
            }`}>
            {/* Dedicated Timer Notification Banner if GSTR-1 is currently in generation request stage */}
            {(gstr1BatchStatus === 'REQUESTED' || gstr1BatchStatus === 'READY_TO_DOWNLOAD') && (
              <div className={`mt-2.5 p-2.5 rounded-xl border flex items-center justify-between gap-3 shadow-md ${
                gstr1SecondsLeft > 0
                  ? 'bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/20 border-amber-500/40 shadow-amber-950/20'
                  : 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-emerald-950/20 border-emerald-500/40 shadow-emerald-950/20'
              }`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                    gstr1SecondsLeft > 0 ? 'bg-amber-500/20 border-amber-500/40' : 'bg-emerald-500/20 border-emerald-500/40'
                  }`}>
                    {gstr1SecondsLeft > 0 ? (
                      <Clock className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
                    ) : (
                      <Zap className="w-4 h-4 text-emerald-400 animate-pulse" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white tracking-wide">
                        {gstr1SecondsLeft > 0 ? 'GSTR-1 File Generation in Progress' : '⚡ GSTR-1 File Ready!'}
                      </span>
                      {gstr1SecondsLeft > 0 ? (
                        <span className="font-mono text-amber-300 font-extrabold bg-amber-500/25 border border-amber-500/40 px-2 py-0.5 rounded-md text-[11px]">
                          ⏱️ {Math.floor(gstr1SecondsLeft / 60)}m {String(gstr1SecondsLeft % 60).padStart(2, '0')}s remaining
                        </span>
                      ) : (
                        <span className="font-mono text-emerald-300 font-extrabold bg-emerald-500/25 border border-emerald-500/40 px-2 py-0.5 rounded-md text-[11px] animate-pulse">
                          Auto-Downloading...
                        </span>
                      )}
                    </div>
                    <p className="text-[10.5px] text-slate-300 mt-0.5">
                      {gstr1SecondsLeft > 0 ? (
                        <>GST Portal generation request active for <strong>{selectedMonth}</strong>. Autopilot will <strong>automatically trigger download</strong> when 20-min wait finishes.</>
                      ) : (
                        <>20-minute waiting window passed. Autopilot is retrieving the file to populate Table 3.1.</>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleGstr1AutopilotSync()}
                    disabled={isGstr1AutopilotRunning}
                    className={`px-3 py-1.5 border rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ${
                      gstr1SecondsLeft > 0
                        ? 'bg-amber-600/25 hover:bg-amber-600/40 text-amber-200 border-amber-500/50'
                        : 'bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border-emerald-500/50 animate-pulse'
                    }`}
                    title="Trigger download immediately without waiting"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300" />
                    <span>{gstr1SecondsLeft > 0 ? 'Download Now' : 'Fetch Now'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelGstr1}
                    className="px-2.5 py-1.5 bg-rose-600/25 hover:bg-rose-600/45 text-rose-200 border border-rose-500/50 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                    title="Cancel GSTR-1 automatic download timer and reset request"
                  >
                    <XCircle className="w-3.5 h-3.5 text-rose-300" />
                    <span>Cancel Auto-Download</span>
                  </button>
                </div>
              </div>
            )}
            {/* Live Metrics Bifurcation Matrix (Table 3.1) */}
            <div className="mt-3 bg-slate-950/80 rounded-xl border border-blue-500/20 overflow-hidden shadow-inner">
              <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700">
                <table className="w-full text-left text-xs min-w-0">
                  <thead className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-800 text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="py-1.5 px-2 text-left whitespace-nowrap">Head / Particulars</th>
                      <th className="py-1.5 px-1.5 text-right whitespace-nowrap">Taxable</th>
                      <th className="py-1.5 px-1.5 text-right whitespace-nowrap">CGST</th>
                      <th className="py-1.5 px-1.5 text-right whitespace-nowrap">SGST</th>
                      <th className="py-1.5 px-1.5 text-right whitespace-nowrap">IGST</th>
                      <th className="py-1.5 px-2 text-right whitespace-nowrap">Total Tax</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 font-mono text-[10.5px]">
                    {/* B2B Registered Sales */}
                    <tr className="hover:bg-blue-950/20 transition-colors">
                      <td className="py-1 px-2 font-sans font-medium text-slate-200 whitespace-nowrap">
                        B2B Registered (3.1a)
                      </td>
                      <td className="py-1 px-1.5 text-right text-slate-300 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g1B2b?.taxable, 'outward', 'b2b', 'taxable', 'text-slate-200')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-blue-400 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g1B2b?.cgst, 'outward', 'b2b', 'cgst', 'text-blue-300')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-blue-400 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g1B2b?.sgst, 'outward', 'b2b', 'sgst', 'text-blue-300')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-blue-400 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g1B2b?.igst, 'outward', 'b2b', 'igst', 'text-blue-300')}
                      </td>
                      <td className="py-1 px-2 text-right font-bold text-white tabular-nums whitespace-nowrap">{fmtCell(g1B2b?.total)}</td>
                    </tr>

                    {/* B2C Consumer Sales */}
                    <tr className="hover:bg-blue-950/20 transition-colors">
                      <td className="py-1 px-2 font-sans font-medium text-slate-200 whitespace-nowrap">
                        B2C Consumer (3.1a)
                      </td>
                      <td className="py-1 px-1.5 text-right text-slate-300 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g1B2c?.taxable, 'outward', 'b2c', 'taxable', 'text-slate-200')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-blue-400 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g1B2c?.cgst, 'outward', 'b2c', 'cgst', 'text-blue-300')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-blue-400 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g1B2c?.sgst, 'outward', 'b2c', 'sgst', 'text-blue-300')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-blue-400 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g1B2c?.igst, 'outward', 'b2c', 'igst', 'text-blue-300')}
                      </td>
                      <td className="py-1 px-2 text-right font-bold text-white tabular-nums whitespace-nowrap">{fmtCell(g1B2c?.total)}</td>
                    </tr>

                    {/* Zero-Rated / Exports */}
                    <tr className="hover:bg-blue-950/20 transition-colors">
                      <td className="py-1 px-2 font-sans font-medium text-slate-200 whitespace-nowrap">
                        Zero-Rated / Exp (3.1b)
                      </td>
                      <td className="py-1 px-1.5 text-right text-slate-300 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g1Zero?.taxable, 'outward', 'zeroRated', 'taxable', 'text-slate-200')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-blue-400 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g1Zero?.cgst, 'outward', 'zeroRated', 'cgst', 'text-blue-300')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-blue-400 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g1Zero?.sgst, 'outward', 'zeroRated', 'sgst', 'text-blue-300')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-blue-400 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g1Zero?.igst, 'outward', 'zeroRated', 'igst', 'text-blue-300')}
                      </td>
                      <td className="py-1 px-2 text-right font-bold text-white tabular-nums whitespace-nowrap">{fmtCell(g1Zero?.total)}</td>
                    </tr>

                    {/* (-) Credit Notes / CDNR */}
                    <tr className="hover:bg-rose-950/20 bg-rose-950/10 transition-colors text-rose-300">
                      <td className="py-1 px-2 font-sans font-medium text-rose-400 whitespace-nowrap">
                        <span>(-) Credit Notes (CDNR)</span>
                      </td>
                      <td className="py-1 px-1.5 text-right tabular-nums whitespace-nowrap">
                        {renderDeckInput(g1Cdnr?.taxable, 'outward', 'creditNote', 'taxable', 'text-rose-300', true)}
                      </td>
                      <td className="py-1 px-1.5 text-right tabular-nums whitespace-nowrap">
                        {renderDeckInput(g1Cdnr?.cgst, 'outward', 'creditNote', 'cgst', 'text-rose-300', true)}
                      </td>
                      <td className="py-1 px-1.5 text-right tabular-nums whitespace-nowrap">
                        {renderDeckInput(g1Cdnr?.sgst, 'outward', 'creditNote', 'sgst', 'text-rose-300', true)}
                      </td>
                      <td className="py-1 px-1.5 text-right tabular-nums whitespace-nowrap">
                        {renderDeckInput(g1Cdnr?.igst, 'outward', 'creditNote', 'igst', 'text-rose-300', true)}
                      </td>
                      <td className="py-1 px-2 text-right font-bold tabular-nums whitespace-nowrap">{fmtCell(g1Cdnr?.total, true)}</td>
                    </tr>

                    {/* Nil Rated / Exempt */}
                    <tr className="hover:bg-blue-950/20 transition-colors">
                      <td className="py-1 px-2 font-sans font-medium text-slate-400 whitespace-nowrap">
                        Nil / Exempt (3.1c)
                      </td>
                      <td className="py-1 px-1.5 text-right text-slate-400 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g1NilTaxable, 'outward', 'nilRated', 'taxable', 'text-slate-300')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-slate-600">—</td>
                      <td className="py-1 px-1.5 text-right text-slate-600">—</td>
                      <td className="py-1 px-1.5 text-right text-slate-600">—</td>
                      <td className="py-1 px-2 text-right text-slate-600">—</td>
                    </tr>

                    {/* Inward RCM Liability Header */}
                    <tr className="hover:bg-purple-950/20 bg-purple-950/10 transition-colors">
                      <td className="py-1 px-2 font-sans font-medium text-purple-300 whitespace-nowrap flex items-center justify-between">
                        <span>Inward RCM (3.1d)</span>
                        <button
                          type="button"
                          onClick={() => setShowG1RcmBreakdown(v => !v)}
                          className="text-[9px] bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 px-1 py-0.2 rounded font-mono cursor-pointer transition-all ml-1"
                          title="Toggle RCM categories breakdown"
                        >
                          {showG1RcmBreakdown ? 'Categories ▴' : 'Categories ▾'}
                        </button>
                      </td>
                      <td className="py-1 px-1.5 text-right text-slate-300 tabular-nums whitespace-nowrap font-semibold">
                        {renderDeckInput(g1Rcm?.taxable, 'outward', 'rcmInward', 'taxable', 'text-purple-300')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-purple-400 tabular-nums whitespace-nowrap font-semibold">
                        {renderDeckInput(g1Rcm?.cgst, 'outward', 'rcmInward', 'cgst', 'text-purple-300')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-purple-400 tabular-nums whitespace-nowrap font-semibold">
                        {renderDeckInput(g1Rcm?.sgst, 'outward', 'rcmInward', 'sgst', 'text-purple-300')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-purple-400 tabular-nums whitespace-nowrap font-semibold">
                        {renderDeckInput(g1Rcm?.igst, 'outward', 'rcmInward', 'igst', 'text-purple-300')}
                      </td>
                      <td className="py-1 px-2 text-right font-bold text-purple-200 tabular-nums whitespace-nowrap">{fmtCell(g1Rcm?.total)}</td>
                    </tr>

                    {/* RCM Subcategories in Table 3.1 */}
                    {showG1RcmBreakdown && (
                      <>
                        <tr className="hover:bg-purple-950/20 bg-purple-950/5 text-[10px] transition-colors border-t border-purple-900/30">
                          <td className="py-0.5 px-2 pl-4 text-purple-300/80 font-sans whitespace-nowrap flex items-center gap-1">
                            <span>↳</span>
                            <span>RCM on Transport</span>
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-slate-400 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmTransport?.taxable, 'outward', 'rcmTransport', 'taxable', 'text-purple-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-purple-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmTransport?.cgst, 'outward', 'rcmTransport', 'cgst', 'text-purple-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-purple-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmTransport?.sgst, 'outward', 'rcmTransport', 'sgst', 'text-purple-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-purple-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmTransport?.igst, 'outward', 'rcmTransport', 'igst', 'text-purple-300')}
                          </td>
                          <td className="py-0.5 px-2 text-right text-purple-300/90 tabular-nums whitespace-nowrap">{fmtCell(rcmTransport?.total)}</td>
                        </tr>
                        <tr className="hover:bg-purple-950/20 bg-purple-950/5 text-[10px] transition-colors">
                          <td className="py-0.5 px-2 pl-4 text-purple-300/80 font-sans whitespace-nowrap flex items-center gap-1">
                            <span>↳</span>
                            <span>RCM on Security</span>
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-slate-400 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmSecurity?.taxable, 'outward', 'rcmSecurity', 'taxable', 'text-purple-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-purple-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmSecurity?.cgst, 'outward', 'rcmSecurity', 'cgst', 'text-purple-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-purple-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmSecurity?.sgst, 'outward', 'rcmSecurity', 'sgst', 'text-purple-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-purple-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmSecurity?.igst, 'outward', 'rcmSecurity', 'igst', 'text-purple-300')}
                          </td>
                          <td className="py-0.5 px-2 text-right text-purple-300/90 tabular-nums whitespace-nowrap">{fmtCell(rcmSecurity?.total)}</td>
                        </tr>
                        <tr className="hover:bg-purple-950/20 bg-purple-950/5 text-[10px] transition-colors">
                          <td className="py-0.5 px-2 pl-4 text-purple-300/80 font-sans whitespace-nowrap flex items-center gap-1">
                            <span>↳</span>
                            <span>RCM on Guest House</span>
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-slate-400 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmGuestHouse?.taxable, 'outward', 'rcmGuestHouse', 'taxable', 'text-purple-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-purple-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmGuestHouse?.cgst, 'outward', 'rcmGuestHouse', 'cgst', 'text-purple-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-purple-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmGuestHouse?.sgst, 'outward', 'rcmGuestHouse', 'sgst', 'text-purple-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-purple-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmGuestHouse?.igst, 'outward', 'rcmGuestHouse', 'igst', 'text-purple-300')}
                          </td>
                          <td className="py-0.5 px-2 text-right text-purple-300/90 tabular-nums whitespace-nowrap">{fmtCell(rcmGuestHouse?.total)}</td>
                        </tr>
                        <tr className="hover:bg-purple-950/20 bg-purple-950/5 text-[10px] transition-colors">
                          <td className="py-0.5 px-2 pl-4 text-purple-300/80 font-sans whitespace-nowrap flex items-center gap-1">
                            <span>↳</span>
                            <span>RCM on Advocate</span>
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-slate-400 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmAdvocate?.taxable, 'outward', 'rcmAdvocate', 'taxable', 'text-purple-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-purple-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmAdvocate?.cgst, 'outward', 'rcmAdvocate', 'cgst', 'text-purple-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-purple-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmAdvocate?.sgst, 'outward', 'rcmAdvocate', 'sgst', 'text-purple-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-purple-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmAdvocate?.igst, 'outward', 'rcmAdvocate', 'igst', 'text-purple-300')}
                          </td>
                          <td className="py-0.5 px-2 text-right text-purple-300/90 tabular-nums whitespace-nowrap">{fmtCell(rcmAdvocate?.total)}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                  {/* Summary Footer Row */}
                  <tfoot className="bg-blue-950/40 border-t-2 border-blue-500/40 font-mono text-[10.5px] font-bold">
                    <tr>
                      <td className="py-1.5 px-2 font-sans text-blue-200 uppercase tracking-wide whitespace-nowrap">
                        Total Outward (3.1)
                      </td>
                      <td className="py-1.5 px-1.5 text-right text-white font-extrabold tabular-nums whitespace-nowrap">{fmtTotalCell(g1TotalTaxable)}</td>
                      <td className="py-1.5 px-1.5 text-right text-blue-300 tabular-nums whitespace-nowrap">{fmtTotalCell(g1TotalCgst)}</td>
                      <td className="py-1.5 px-1.5 text-right text-blue-300 tabular-nums whitespace-nowrap">{fmtTotalCell(g1TotalSgst)}</td>
                      <td className="py-1.5 px-1.5 text-right text-blue-300 tabular-nums whitespace-nowrap">{fmtTotalCell(g1TotalIgst)}</td>
                      <td className="py-1.5 px-2 text-right text-emerald-400 font-extrabold text-[11px] tabular-nums whitespace-nowrap">{fmtTotalCell(g1TotalTax)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Quick GSTR-1 Doc Stats Badges */}
            {(activeGstr1?.counts?.totalDocs || 0) > 0 && (
              <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-slate-400 font-mono">
                <span>Docs: <strong className="text-blue-300">{activeGstr1?.counts?.totalDocs}</strong></span>
                <span>• B2B: <strong className="text-slate-300">{activeGstr1?.counts?.b2b}</strong></span>
                <span>• B2C: <strong className="text-slate-300">{(activeGstr1?.counts?.b2cs || 0) + (activeGstr1?.counts?.b2cl || 0)}</strong></span>
                <span>• CDNR: <strong className="text-rose-300">{activeGstr1?.counts?.cdnr}</strong></span>
              </div>
            )}

            {/* Drag & Drop Dropzone for GSTR-1 */}
            <div
              onDragOver={e => {
                if (isLocked) return;
                e.preventDefault();
                setIsGstr1Dragging(true);
              }}
              onDragLeave={e => { e.preventDefault(); setIsGstr1Dragging(false); }}
              onDrop={e => {
                e.preventDefault();
                setIsGstr1Dragging(false);
                if (isLocked) {
                  toast.error('Cockpit is Locked', { description: 'Unlock 3B sheet before importing files.' });
                  return;
                }
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  handleGstr1FilesChosen(e.dataTransfer.files);
                }
              }}
              onClick={() => {
                if (isLocked) {
                  toast.error('Cockpit is Locked', { description: 'Unlock 3B sheet before importing files.' });
                  return;
                }
                gstr1FileInputRef.current?.click();
              }}
              className={`mt-3 border-2 border-dashed rounded-xl p-3 transition-all flex items-center justify-between ${
                isLocked
                  ? 'border-slate-800/50 bg-slate-950/20 opacity-50 cursor-not-allowed'
                  : isGstr1Dragging
                    ? 'border-blue-400 bg-blue-500/10 scale-[1.01] cursor-pointer'
                    : 'border-slate-800 bg-slate-950/40 hover:border-blue-500/50 hover:bg-slate-950/70 cursor-pointer'
              }`}
            >
              <input
                type="file"
                ref={gstr1FileInputRef}
                onChange={e => e.target.files && handleGstr1FilesChosen(e.target.files)}
                accept=".json,.xlsx,.xls,.zip,.pdf"
                disabled={isLocked}
                className="hidden"
              />
              <div className="flex items-center gap-2.5">
                <UploadCloud className={`w-4 h-4 text-blue-400 ${isProcessingGstr1 ? 'animate-bounce' : ''}`} />
                <div>
                  <p className="text-xs text-slate-200 font-semibold">Drop GSTR-1 File (.json, .xlsx, .zip, .pdf)</p>
                  <p className="text-[10px] text-slate-400">Or click to browse from system</p>
                </div>
              </div>
              <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                Browse
              </span>
            </div>
          </div>{/* end collapsible body */}
          </div>

          {/* Action Deck: Autopilot & Table 3.1 Injection Trigger — hidden when collapsed */}
          {!gstr1Collapsed && (
          <>
          <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => {
                  if (isLocked) {
                    toast.error('Cockpit is Locked', { description: 'Unlock 3B sheet to sync GSTR-1.' });
                    return;
                  }
                  handleGstr1AutopilotSync();
                }}
                disabled={isLocked || isGstr1AutopilotRunning || !currentGstin || currentGstin === 'Not Specified'}
                className={`px-3 py-1.5 font-semibold text-xs rounded-xl border transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                  isGstr1ReadyToDownload
                    ? 'bg-emerald-950/50 hover:bg-emerald-900/70 text-emerald-300 border-emerald-500/50 shadow-xs'
                    : (gstr1BatchStatus === 'REQUESTED' && gstr1SecondsLeft > 0)
                      ? 'bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border-amber-500/40'
                      : 'bg-slate-800/90 hover:bg-slate-700/90 text-blue-300 border-slate-700 hover:border-blue-500/40'
                }`}
                title={
                  isLocked
                    ? 'Cockpit is locked'
                    : isGstr1ReadyToDownload
                      ? '20 minutes elapsed! Click to download generated GSTR-1 JSON'
                      : (gstr1BatchStatus === 'REQUESTED' && gstr1SecondsLeft > 0)
                        ? `Generation in progress. ${Math.floor(gstr1SecondsLeft / 60)}m ${gstr1SecondsLeft % 60}s remaining.`
                        : 'Click to sync and download GSTR-1 JSON from GST Portal'
                }
              >
                {isGstr1AutopilotRunning ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                    <span>{gstr1AutopilotStep || 'Syncing JSON...'}</span>
                  </>
                ) : isGstr1ReadyToDownload ? (
                  <>
                    <Zap className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                    <span className="font-bold">⚡ Ready: Download GSTR-1 JSON</span>
                  </>
                ) : (gstr1BatchStatus === 'REQUESTED' && gstr1SecondsLeft > 0) ? (
                  <>
                    <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                    <span>⏱️ Requested ({Math.floor(gstr1SecondsLeft / 60)}m {gstr1SecondsLeft % 60}s)</span>
                  </>
                ) : (
                  <>
                    <FileJson className="w-3.5 h-3.5 text-blue-400" />
                    <span>🚀 Download GSTR-1 JSON</span>
                  </>
                )}
              </button>

              {/* Dedicated GSTR-1 PDF Autopilot Downloader & Injector */}
              <button
                type="button"
                onClick={() => {
                  if (isLocked) {
                    toast.error('Cockpit is Locked', { description: 'Unlock 3B sheet to inject GSTR-1 PDF.' });
                    return;
                  }
                  handleGstr1PdfAutopilotSync();
                }}
                disabled={isLocked || isGstr1PdfAutopilotRunning || isGstr1AutopilotRunning || isProcessingGstr1}
                className="px-3 py-1.5 font-semibold text-xs rounded-xl border transition-all flex items-center gap-1.5 bg-gradient-to-r from-purple-950/60 to-indigo-950/60 hover:from-purple-900/80 hover:to-indigo-900/80 text-purple-200 border-purple-500/40 hover:border-purple-400/70 shadow-xs cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Launch GST Portal Autopilot to download official GSTR-1 PDF and auto-inject into Table 3.1"
              >
                {isGstr1PdfAutopilotRunning ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-300" />
                    <span>{gstr1PdfAutopilotStep || 'Downloading PDF...'}</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5 text-purple-300" />
                    <span>📄 Download &amp; Inject GSTR-1 PDF</span>
                  </>
                )}
              </button>

              {/* Secondary Local File Picker fallback for PDF */}
              <input
                type="file"
                ref={gstr1PdfInputRef}
                onChange={e => e.target.files && handleGstr1PdfFileChosen(e.target.files)}
                accept=".pdf"
                disabled={isLocked}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => {
                  if (isLocked) {
                    toast.error('Cockpit is Locked');
                    return;
                  }
                  gstr1PdfInputRef.current?.click();
                }}
                disabled={isLocked || isProcessingGstr1 || isGstr1PdfAutopilotRunning}
                className="px-2 py-1.5 text-xs text-slate-400 hover:text-purple-300 border border-slate-800 hover:border-purple-500/30 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                title="Or choose an existing GSTR-1 PDF already saved on your computer"
              >
                <UploadCloud className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[11px]">Browse Local PDF</span>
              </button>

              {/* Cancel GSTR-1 Autopilot / Auto-Download Button */}
              {(isGstr1AutopilotRunning || isGstr1PdfAutopilotRunning || (gstr1BatchStatus === 'REQUESTED' && gstr1SecondsLeft > 0) || isGstr1ReadyToDownload) && (
                <button
                  type="button"
                  onClick={handleCancelGstr1}
                  className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 border border-rose-500/40 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs animate-pulse"
                  title="Cancel GSTR-1 automatic download or running autopilot session"
                >
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>Cancel {isGstr1AutopilotRunning || isGstr1PdfAutopilotRunning ? 'Sync' : 'Auto-Download'}</span>
                </button>
              )}

              {/* Clear GSTR-1 Ingested Data */}
              {(activeGstr1 || hasOutwardData) && (
                <button
                  type="button"
                  onClick={() => {
                    if (isLocked) {
                      toast.error('Cockpit is Locked');
                      return;
                    }
                    if (window.confirm(`Clear GSTR-1 outward sales figures for ${selectedMonth}?`)) {
                      setActiveGstr1(null);
                      if (onClearGstr1) {
                        onClearGstr1();
                      }
                      toast.success(`Cleared GSTR-1 data for ${selectedMonth}`);
                    }
                  }}
                  disabled={isLocked}
                  className={`px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold text-xs rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                    isLocked ? 'opacity-40 cursor-not-allowed' : ''
                  }`}
                  title={isLocked ? 'Cockpit is locked' : 'Clear GSTR-1 figures from Table 3.1'}
                >
                  <RotateCcw className="w-3 h-3 text-rose-400" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            <button
              onClick={() => {
                if (isLocked) {
                  toast.error('Cockpit is Locked', { description: 'Unlock 3B sheet before injecting data.' });
                  return;
                }
                if (!activeGstr1) {
                  return toast.error('No GSTR-1 Data Loaded', {
                    description: 'Please run GSTR-1 Autopilot or drop a GSTR-1 file first.'
                  });
                }
                onApplyIngestedReturns(activeGstr1, null);
                toast.success(`Injected into Table 3.1!`, {
                  description: `Applied ${fmt(activeGstr1.totalOutwardTaxable)} Sales to ${activeGstr1.monthKey || selectedMonth}. Table 6.1 Set-off updated.`
                });
              }}
              disabled={isLocked || !activeGstr1}
              className={`px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                isLocked || !activeGstr1 ? 'opacity-40 cursor-not-allowed' : ''
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-200" />
              <span>Inject into Table 3.1</span>
            </button>
          </div>
          </>
          )}{/* end action deck */}
        </div>

        {/* ========================================================================= */}
        {/* CARD 2: GSTR-2B INWARD ITC DECK (EMERALD / TEAL THEME)                     */}
        {/* ========================================================================= */}
        <div className={`bg-gradient-to-b from-slate-950 via-slate-900 to-emerald-950/20 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-3 sm:p-4 flex flex-col justify-between shadow-md transition-all duration-300 ease-in-out min-w-0 ${
          gstr2bCollapsed
            ? 'lg:w-14 w-full overflow-hidden'
            : gstr1Collapsed
              ? 'lg:flex-1 w-full'
              : 'lg:flex-1 w-full'
        } space-y-3.5`}>
          <div>
            {/* Header: Title & Status Badge */}
            <div className={`flex items-center justify-between pb-2.5 border-b border-slate-800/80 ${gstr2bCollapsed ? 'lg:flex-col lg:gap-3' : ''}`}>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold shrink-0">
                  <ArrowDownRight className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                {!gstr2bCollapsed && (
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-wide">
                      GSTR-2B Inward ITC
                    </h4>
                    <span className="text-[10px] text-emerald-300/80 font-mono">Targets GSTR-3B Table 4</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Status Pill — hidden when collapsed */}
                {!gstr2bCollapsed && (
                  <div className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold flex items-center gap-1.5 ${
                    has2bData || activeGstr2b
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${has2bData || activeGstr2b ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <span>{has2bData ? 'Table 4 Filled' : activeGstr2b ? 'Data Ready' : 'Pending'}</span>
                  </div>
                )}

                {/* Local Edit Toggle */}
                {!gstr2bCollapsed && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isLocked) {
                        toast.error('Cockpit is Locked', { description: 'Unlock 3B sheet to edit figures.' });
                        return;
                      }
                      setIsG2bLocalEdit(v => !v);
                    }}
                    disabled={isLocked}
                    title={isLocked ? 'Cockpit is locked' : isG2bEditable ? 'Lock GSTR-2B figures' : 'Edit GSTR-2B figures'}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                      isLocked
                        ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500 border border-slate-700'
                        : isG2bEditable
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                          : 'bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300'
                    }`}
                  >
                    <Edit3 className="w-3 h-3 text-amber-300" />
                    <span>{isG2bEditable ? 'Lock' : 'Edit'}</span>
                  </button>
                )}

                {/* Collapse toggle button */}
                <button
                  onClick={() => setGstr2bCollapsed(c => !c)}
                  title={gstr2bCollapsed ? 'Expand GSTR-2B panel' : 'Collapse GSTR-2B panel'}
                  className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition-all shrink-0 cursor-pointer"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${
                    gstr2bCollapsed ? 'rotate-90' : 'rotate-0'
                  }`} />
                </button>
              </div>
            </div>

            {/* Collapsible body: Live Metrics + Dropzone */}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
              gstr2bCollapsed ? 'max-h-0 opacity-0 mt-0' : 'max-h-[9999px] opacity-100 mt-0'
            }`}>
            {/* Live Metrics Bifurcation Matrix (Table 4) */}
            <div className="mt-3 bg-slate-950/80 rounded-xl border border-emerald-500/20 overflow-hidden shadow-inner">
              <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700">
                <table className="w-full text-left text-xs min-w-0">
                  <thead className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-800 text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="py-1.5 px-2 text-left whitespace-nowrap">ITC Head / Particulars</th>
                      <th className="py-1.5 px-1.5 text-right whitespace-nowrap">Taxable</th>
                      <th className="py-1.5 px-1.5 text-right whitespace-nowrap">CGST</th>
                      <th className="py-1.5 px-1.5 text-right whitespace-nowrap">SGST</th>
                      <th className="py-1.5 px-1.5 text-right whitespace-nowrap">IGST</th>
                      <th className="py-1.5 px-2 text-right whitespace-nowrap">Total ITC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 font-mono text-[10.5px]">
                    {/* Table 4(A)(5) All Other ITC */}
                    <tr className="hover:bg-emerald-950/20 transition-colors">
                      <td className="py-1 px-2 font-sans font-medium text-slate-200 whitespace-nowrap">
                        4(A)(5) All Other ITC
                      </td>
                      <td className="py-1 px-1.5 text-right text-slate-300 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g2bItc2b?.taxable, 'inward', 'itc2b', 'taxable', 'text-slate-200')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-emerald-400 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g2bItc2b?.cgst, 'inward', 'itc2b', 'cgst', 'text-emerald-300')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-emerald-400 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g2bItc2b?.sgst, 'inward', 'itc2b', 'sgst', 'text-emerald-300')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-emerald-400 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g2bItc2b?.igst, 'inward', 'itc2b', 'igst', 'text-emerald-300')}
                      </td>
                      <td className="py-1 px-2 text-right font-bold text-white tabular-nums whitespace-nowrap">{fmtCell(g2bItc2b?.total)}</td>
                    </tr>

                    {/* Table 4(A)(3) Inward Reverse Charge Supplies */}
                    <tr className="hover:bg-emerald-950/20 bg-emerald-950/10 transition-colors">
                      <td className="py-1 px-2 font-sans font-medium text-slate-200 whitespace-nowrap flex items-center justify-between">
                        <span>4(A)(3) Inward RCM ITC</span>
                        <button
                          type="button"
                          onClick={() => setShowG2bRcmBreakdown(v => !v)}
                          className="text-[9px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 px-1 py-0.2 rounded font-mono cursor-pointer transition-all ml-1"
                          title="Toggle RCM categories breakdown"
                        >
                          {showG2bRcmBreakdown ? 'Categories ▴' : 'Categories ▾'}
                        </button>
                      </td>
                      <td className="py-1 px-1.5 text-right text-slate-300 tabular-nums whitespace-nowrap font-semibold">
                        {renderDeckInput(g2bRcm?.taxable, 'inward', 'rcmPaid', 'taxable', 'text-slate-200')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-emerald-400 tabular-nums whitespace-nowrap font-semibold">
                        {renderDeckInput(g2bRcm?.cgst, 'inward', 'rcmPaid', 'cgst', 'text-emerald-300')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-emerald-400 tabular-nums whitespace-nowrap font-semibold">
                        {renderDeckInput(g2bRcm?.sgst, 'inward', 'rcmPaid', 'sgst', 'text-emerald-300')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-emerald-400 tabular-nums whitespace-nowrap font-semibold">
                        {renderDeckInput(g2bRcm?.igst, 'inward', 'rcmPaid', 'igst', 'text-emerald-300')}
                      </td>
                      <td className="py-1 px-2 text-right font-bold text-white tabular-nums whitespace-nowrap">{fmtCell(g2bRcm?.total)}</td>
                    </tr>

                    {/* RCM Subcategories in Table 4 */}
                    {showG2bRcmBreakdown && (
                      <>
                        <tr className="hover:bg-emerald-950/20 bg-emerald-950/5 text-[10px] transition-colors border-t border-emerald-900/30">
                          <td className="py-0.5 px-2 pl-4 text-emerald-300/80 font-sans whitespace-nowrap flex items-center gap-1">
                            <span>↳</span>
                            <span>RCM on Transport</span>
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-slate-400 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmTransport?.taxable, 'outward', 'rcmTransport', 'taxable', 'text-emerald-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-emerald-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmTransport?.cgst, 'outward', 'rcmTransport', 'cgst', 'text-emerald-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-emerald-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmTransport?.sgst, 'outward', 'rcmTransport', 'sgst', 'text-emerald-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-emerald-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmTransport?.igst, 'outward', 'rcmTransport', 'igst', 'text-emerald-300')}
                          </td>
                          <td className="py-0.5 px-2 text-right text-emerald-300/90 tabular-nums whitespace-nowrap">{fmtCell(rcmTransport?.total)}</td>
                        </tr>
                        <tr className="hover:bg-emerald-950/20 bg-emerald-950/5 text-[10px] transition-colors">
                          <td className="py-0.5 px-2 pl-4 text-emerald-300/80 font-sans whitespace-nowrap flex items-center gap-1">
                            <span>↳</span>
                            <span>RCM on Security</span>
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-slate-400 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmSecurity?.taxable, 'outward', 'rcmSecurity', 'taxable', 'text-emerald-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-emerald-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmSecurity?.cgst, 'outward', 'rcmSecurity', 'cgst', 'text-emerald-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-emerald-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmSecurity?.sgst, 'outward', 'rcmSecurity', 'sgst', 'text-emerald-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-emerald-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmSecurity?.igst, 'outward', 'rcmSecurity', 'igst', 'text-emerald-300')}
                          </td>
                          <td className="py-0.5 px-2 text-right text-emerald-300/90 tabular-nums whitespace-nowrap">{fmtCell(rcmSecurity?.total)}</td>
                        </tr>
                        <tr className="hover:bg-emerald-950/20 bg-emerald-950/5 text-[10px] transition-colors">
                          <td className="py-0.5 px-2 pl-4 text-emerald-300/80 font-sans whitespace-nowrap flex items-center gap-1">
                            <span>↳</span>
                            <span>RCM on Guest House</span>
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-slate-400 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmGuestHouse?.taxable, 'outward', 'rcmGuestHouse', 'taxable', 'text-emerald-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-emerald-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmGuestHouse?.cgst, 'outward', 'rcmGuestHouse', 'cgst', 'text-emerald-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-emerald-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmGuestHouse?.sgst, 'outward', 'rcmGuestHouse', 'sgst', 'text-emerald-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-emerald-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmGuestHouse?.igst, 'outward', 'rcmGuestHouse', 'igst', 'text-emerald-300')}
                          </td>
                          <td className="py-0.5 px-2 text-right text-emerald-300/90 tabular-nums whitespace-nowrap">{fmtCell(rcmGuestHouse?.total)}</td>
                        </tr>
                        <tr className="hover:bg-emerald-950/20 bg-emerald-950/5 text-[10px] transition-colors">
                          <td className="py-0.5 px-2 pl-4 text-emerald-300/80 font-sans whitespace-nowrap flex items-center gap-1">
                            <span>↳</span>
                            <span>RCM on Advocate</span>
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-slate-400 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmAdvocate?.taxable, 'outward', 'rcmAdvocate', 'taxable', 'text-emerald-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-emerald-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmAdvocate?.cgst, 'outward', 'rcmAdvocate', 'cgst', 'text-emerald-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-emerald-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmAdvocate?.sgst, 'outward', 'rcmAdvocate', 'sgst', 'text-emerald-300')}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-emerald-400/80 tabular-nums whitespace-nowrap">
                            {renderDeckInput(rcmAdvocate?.igst, 'outward', 'rcmAdvocate', 'igst', 'text-emerald-300')}
                          </td>
                          <td className="py-0.5 px-2 text-right text-emerald-300/90 tabular-nums whitespace-nowrap">{fmtCell(rcmAdvocate?.total)}</td>
                        </tr>
                      </>
                    )}

                    {/* Table 4(A)(1) Import of Goods */}
                    <tr className="hover:bg-emerald-950/20 transition-colors">
                      <td className="py-1 px-2 font-sans font-medium text-slate-200 whitespace-nowrap">
                        4(A)(1) Import of Goods
                      </td>
                      <td className="py-1 px-1.5 text-right text-slate-300 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g2bImpg?.taxable, 'inward', 'importGoods', 'taxable', 'text-slate-200')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-slate-600">—</td>
                      <td className="py-1 px-1.5 text-right text-slate-600">—</td>
                      <td className="py-1 px-1.5 text-right text-emerald-400 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g2bImpg?.igst, 'inward', 'importGoods', 'igst', 'text-emerald-300')}
                      </td>
                      <td className="py-1 px-2 text-right font-bold text-white tabular-nums whitespace-nowrap">{fmtCell(g2bImpg?.total)}</td>
                    </tr>

                    {/* (+) 2B Supplier Debit Notes (Row 36) */}
                    <tr className="hover:bg-emerald-950/30 bg-emerald-950/10 transition-colors text-emerald-300">
                      <td className="py-1 px-2 font-sans font-medium text-emerald-400 whitespace-nowrap">
                        (+) Debit Notes (Row 36)
                      </td>
                      <td className="py-1 px-1.5 text-right text-emerald-300 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g2bDebitNotes?.taxable, 'inward', 'creditNotes', 'taxable', 'text-emerald-300')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-emerald-400 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g2bDebitNotes?.cgst, 'inward', 'creditNotes', 'cgst', 'text-emerald-300')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-emerald-400 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g2bDebitNotes?.sgst, 'inward', 'creditNotes', 'sgst', 'text-emerald-300')}
                      </td>
                      <td className="py-1 px-1.5 text-right text-emerald-400 tabular-nums whitespace-nowrap">
                        {renderDeckInput(g2bDebitNotes?.igst, 'inward', 'creditNotes', 'igst', 'text-emerald-300')}
                      </td>
                      <td className="py-1 px-2 text-right font-bold text-emerald-300 tabular-nums whitespace-nowrap">{fmtCell(g2bDebitNotes?.total)}</td>
                    </tr>

                    {/* (-) 2B Supplier Credit Notes (Row 38) */}
                    <tr className="hover:bg-rose-950/20 bg-rose-950/10 transition-colors text-rose-300">
                      <td className="py-1 px-2 font-sans font-medium text-rose-400 whitespace-nowrap">
                        (-) Credit Notes (Row 38)
                      </td>
                      <td className="py-1 px-1.5 text-right tabular-nums whitespace-nowrap">
                        {renderDeckInput(g2bCreditNotes?.taxable, 'inward', 'debitNotes', 'taxable', 'text-rose-300', true)}
                      </td>
                      <td className="py-1 px-1.5 text-right tabular-nums whitespace-nowrap">
                        {renderDeckInput(g2bCreditNotes?.cgst, 'inward', 'debitNotes', 'cgst', 'text-rose-300', true)}
                      </td>
                      <td className="py-1 px-1.5 text-right tabular-nums whitespace-nowrap">
                        {renderDeckInput(g2bCreditNotes?.sgst, 'inward', 'debitNotes', 'sgst', 'text-rose-300', true)}
                      </td>
                      <td className="py-1 px-1.5 text-right tabular-nums whitespace-nowrap">
                        {renderDeckInput(g2bCreditNotes?.igst, 'inward', 'debitNotes', 'igst', 'text-rose-300', true)}
                      </td>
                      <td className="py-1 px-2 text-right font-bold tabular-nums whitespace-nowrap">{fmtCell(g2bCreditNotes?.total, true)}</td>
                    </tr>

                    {/* (-) Table 4(B) ITC Reversals / Ineligible (Row 39) */}
                    <tr className="hover:bg-rose-950/20 bg-rose-950/10 transition-colors text-rose-300">
                      <td className="py-1 px-2 font-sans font-medium text-rose-400 whitespace-nowrap">
                        (-) 4(B) Reversals (Row 39)
                      </td>
                      <td className="py-1 px-1.5 text-right tabular-nums whitespace-nowrap">
                        {renderDeckInput(g2bInelig?.taxable, 'inward', 'itcReversed', 'taxable', 'text-rose-300', true)}
                      </td>
                      <td className="py-1 px-1.5 text-right tabular-nums whitespace-nowrap">
                        {renderDeckInput(g2bInelig?.cgst, 'inward', 'itcReversed', 'cgst', 'text-rose-300', true)}
                      </td>
                      <td className="py-1 px-1.5 text-right tabular-nums whitespace-nowrap">
                        {renderDeckInput(g2bInelig?.sgst, 'inward', 'itcReversed', 'sgst', 'text-rose-300', true)}
                      </td>
                      <td className="py-1 px-1.5 text-right tabular-nums whitespace-nowrap">
                        {renderDeckInput(g2bInelig?.igst, 'inward', 'itcReversed', 'igst', 'text-rose-300', true)}
                      </td>
                      <td className="py-1 px-2 text-right font-bold tabular-nums whitespace-nowrap">{fmtCell(g2bInelig?.total, true)}</td>
                    </tr>
                  </tbody>
                  {/* Summary Footer Row */}
                  <tfoot className="bg-emerald-950/40 border-t-2 border-emerald-500/40 font-mono text-[10.5px] font-bold">
                    <tr>
                      <td className="py-1.5 px-2 font-sans text-emerald-200 uppercase tracking-wide whitespace-nowrap">
                        Net Available ITC (4C)
                      </td>
                      <td className="py-1.5 px-1.5 text-right text-slate-500 whitespace-nowrap">—</td>
                      <td className="py-1.5 px-1.5 text-right text-emerald-300 tabular-nums whitespace-nowrap">{fmtTotalCell(g2bNetCgst)}</td>
                      <td className="py-1.5 px-1.5 text-right text-emerald-300 tabular-nums whitespace-nowrap">{fmtTotalCell(g2bNetSgst)}</td>
                      <td className="py-1.5 px-1.5 text-right text-emerald-300 tabular-nums whitespace-nowrap">{fmtTotalCell(g2bNetIgst)}</td>
                      <td className="py-1.5 px-2 text-right text-teal-300 font-extrabold text-[11px] tabular-nums whitespace-nowrap">{fmtTotalCell(g2bNetTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Quick GSTR-2B Invoice Stats Badges */}
            {(activeGstr2b?.counts?.totalInvoices || 0) > 0 && (
              <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-slate-400 font-mono">
                <span>Invoices: <strong className="text-emerald-300">{activeGstr2b?.counts?.totalInvoices}</strong></span>
                <span>• B2B: <strong className="text-slate-300">{activeGstr2b?.counts?.b2b}</strong></span>
                <span>• CDNR: <strong className="text-rose-300">{activeGstr2b?.counts?.cdnr}</strong></span>
                <span>• ISD/Imp: <strong className="text-slate-300">{(activeGstr2b?.counts?.isd || 0) + (activeGstr2b?.counts?.impg || 0)}</strong></span>
              </div>
            )}

            {/* Drag & Drop Dropzone for GSTR-2B */}
            <div
              onDragOver={e => {
                if (isLocked) return;
                e.preventDefault();
                setIsGstr2bDragging(true);
              }}
              onDragLeave={e => { e.preventDefault(); setIsGstr2bDragging(false); }}
              onDrop={e => {
                e.preventDefault();
                setIsGstr2bDragging(false);
                if (isLocked) {
                  toast.error('Cockpit is Locked', { description: 'Unlock 3B sheet before importing files.' });
                  return;
                }
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  handleGstr2bFilesChosen(e.dataTransfer.files);
                }
              }}
              onClick={() => {
                if (isLocked) {
                  toast.error('Cockpit is Locked', { description: 'Unlock 3B sheet before importing files.' });
                  return;
                }
                gstr2bFileInputRef.current?.click();
              }}
              className={`mt-3 border-2 border-dashed rounded-xl p-3 transition-all flex items-center justify-between ${
                isLocked
                  ? 'border-slate-800/50 bg-slate-950/20 opacity-50 cursor-not-allowed'
                  : isGstr2bDragging
                    ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01] cursor-pointer'
                    : 'border-slate-800 bg-slate-950/40 hover:border-emerald-500/50 hover:bg-slate-950/70 cursor-pointer'
              }`}
            >
              <input
                type="file"
                ref={gstr2bFileInputRef}
                onChange={e => e.target.files && handleGstr2bFilesChosen(e.target.files)}
                accept=".json,.xlsx,.xls,.zip"
                disabled={isLocked}
                className="hidden"
              />
              <div className="flex items-center gap-2.5">
                <UploadCloud className={`w-4 h-4 text-emerald-400 ${isProcessingGstr2b ? 'animate-bounce' : ''}`} />
                <div>
                  <p className="text-xs text-slate-200 font-semibold">Drop GSTR-2B File (.json, .xlsx, .zip)</p>
                  <p className="text-[10px] text-slate-400">Or click to browse from system</p>
                </div>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Browse
              </span>
            </div>
          </div>{/* end collapsible body */}
          </div>

          {/* Action Deck: Autopilot & Table 4 Injection Trigger — hidden when collapsed */}
          {!gstr2bCollapsed && (
          <>
          <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  if (isLocked) {
                    toast.error('Cockpit is Locked', { description: 'Unlock 3B sheet to sync GSTR-2B.' });
                    return;
                  }
                  handleGstr2bAutopilotSync();
                }}
                disabled={isLocked || isGstr2bAutopilotRunning || !currentGstin || currentGstin === 'Not Specified'}
                className={`px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700/90 text-emerald-300 font-semibold text-xs rounded-xl border border-slate-700 hover:border-emerald-500/40 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                  isLocked ? 'opacity-40 cursor-not-allowed' : ''
                }`}
                title={isLocked ? 'Cockpit is locked' : 'Click to run GSTR-2B Autopilot'}
              >
                {isGstr2bAutopilotRunning ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    <span>{gstr2bAutopilotStep || 'Syncing...'}</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                    <span>🚀 Sync GSTR-2B Autopilot</span>
                  </>
                )}
              </button>

              {/* Cancel GSTR-2B Autopilot Button */}
              {isGstr2bAutopilotRunning && (
                <button
                  type="button"
                  onClick={handleCancelGstr2b}
                  className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 border border-rose-500/40 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs animate-pulse"
                  title="Cancel GSTR-2B autopilot session"
                >
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>Cancel Sync</span>
                </button>
              )}

              {/* Clear GSTR-2B Ingested Data */}
              {(activeGstr2b || has2bData) && (
                <button
                  type="button"
                  onClick={() => {
                    if (isLocked) {
                      toast.error('Cockpit is Locked');
                      return;
                    }
                    if (window.confirm(`Clear GSTR-2B inward ITC figures for ${selectedMonth}?`)) {
                      setActiveGstr2b(null);
                      if (onClearGstr2b) {
                        onClearGstr2b();
                      }
                      toast.success(`Cleared GSTR-2B data for ${selectedMonth}`);
                    }
                  }}
                  disabled={isLocked}
                  className={`px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold text-xs rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                    isLocked ? 'opacity-40 cursor-not-allowed' : ''
                  }`}
                  title={isLocked ? 'Cockpit is locked' : 'Clear GSTR-2B figures from Table 4'}
                >
                  <RotateCcw className="w-3 h-3 text-rose-400" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            <button
              onClick={() => {
                if (isLocked) {
                  toast.error('Cockpit is Locked', { description: 'Unlock 3B sheet before injecting data.' });
                  return;
                }
                if (!activeGstr2b) {
                  return toast.error('No GSTR-2B Data Loaded', {
                    description: 'Please run GSTR-2B Autopilot or drop a GSTR-2B file first.'
                  });
                }
                onApplyIngestedReturns(null, activeGstr2b);
                toast.success(`Injected into Table 4!`, {
                  description: `Applied ${fmt(activeGstr2b.netEligibleTotal)} Net ITC to ${activeGstr2b.monthKey || selectedMonth}. Table 6.1 Set-off updated.`
                });
              }}
              disabled={isLocked || !activeGstr2b}
              className={`px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                isLocked || !activeGstr2b ? 'opacity-40 cursor-not-allowed' : ''
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />
              <span>Inject into Table 4</span>
            </button>
          </div>
          </>
          )}{/* end action deck */}
        </div>
      </div>

      {/* ─── CONFIRMATION MODAL BEFORE INJECTION (USER DECISION D-02) ─── */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  confirmModal.mode === 'GSTR1' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}>
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">
                    {confirmModal.mode === 'GSTR1' && 'Confirm GSTR-1 Outward Sales Injection'}
                    {confirmModal.mode === 'GSTR2B' && 'Confirm GSTR-2B Inward ITC Injection'}
                    {confirmModal.mode === 'BOTH' && 'Confirm Combined GSTR-1 & GSTR-2B Injection'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Filing Period: <strong className="text-white">{selectedMonth} {currentMonthData.year}</strong> ({currentGstin})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setConfirmModal({ isOpen: false, mode: 'GSTR1', gstr1: null, gstr2b: null })}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200">
                  This action will populate statutory figures into GSTR-3B for <strong className="text-white">{selectedMonth} {currentMonthData.year}</strong>. Existing values in the target table will be updated, and Rule 88A set-off cascade will recompute automatically.
                </p>
              </div>

              {/* Data Breakdown Preview Table */}
              <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-900/80 text-slate-400 font-bold border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="py-2 px-3">Target Table Head</th>
                      <th className="py-2 px-3 text-right">Taxable</th>
                      <th className="py-2 px-3 text-right">CGST</th>
                      <th className="py-2 px-3 text-right">SGST</th>
                      <th className="py-2 px-3 text-right">IGST</th>
                      <th className="py-2 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {(confirmModal.mode === 'GSTR1' || confirmModal.mode === 'BOTH') && (
                      <>
                        <tr className="hover:bg-slate-900/40">
                          <td className="py-1.5 px-3 font-sans text-blue-300">Table 3.1: Sales (B2B)</td>
                          <td className="py-1.5 px-3 text-right">{fmt(confirmModal.gstr1?.breakdowns?.b2b?.taxable)}</td>
                          <td className="py-1.5 px-3 text-right text-blue-400">{fmt(confirmModal.gstr1?.breakdowns?.b2b?.cgst)}</td>
                          <td className="py-1.5 px-3 text-right text-blue-400">{fmt(confirmModal.gstr1?.breakdowns?.b2b?.sgst)}</td>
                          <td className="py-1.5 px-3 text-right text-blue-400">{fmt(confirmModal.gstr1?.breakdowns?.b2b?.igst)}</td>
                          <td className="py-1.5 px-3 text-right font-bold text-white">{fmt(confirmModal.gstr1?.breakdowns?.b2b?.total)}</td>
                        </tr>
                        <tr className="hover:bg-slate-900/40">
                          <td className="py-1.5 px-3 font-sans text-blue-300">Table 3.1: Sales (B2C)</td>
                          <td className="py-1.5 px-3 text-right">{fmt(confirmModal.gstr1?.breakdowns?.b2c?.taxable)}</td>
                          <td className="py-1.5 px-3 text-right text-blue-400">{fmt(confirmModal.gstr1?.breakdowns?.b2c?.cgst)}</td>
                          <td className="py-1.5 px-3 text-right text-blue-400">{fmt(confirmModal.gstr1?.breakdowns?.b2c?.sgst)}</td>
                          <td className="py-1.5 px-3 text-right text-blue-400">{fmt(confirmModal.gstr1?.breakdowns?.b2c?.igst)}</td>
                          <td className="py-1.5 px-3 text-right font-bold text-white">{fmt(confirmModal.gstr1?.breakdowns?.b2c?.total)}</td>
                        </tr>
                        {((confirmModal.gstr1?.breakdowns?.creditNote?.total || 0) > 0 || (confirmModal.gstr1?.breakdowns?.creditNote?.taxable || 0) > 0) && (
                          <tr className="hover:bg-rose-950/20 text-rose-300">
                            <td className="py-1.5 px-3 font-sans text-rose-400">(-) Table 3.1: Credit Notes (CDNR)</td>
                            <td className="py-1.5 px-3 text-right">-{fmt(confirmModal.gstr1?.breakdowns?.creditNote?.taxable)}</td>
                            <td className="py-1.5 px-3 text-right">-{fmt(confirmModal.gstr1?.breakdowns?.creditNote?.cgst)}</td>
                            <td className="py-1.5 px-3 text-right">-{fmt(confirmModal.gstr1?.breakdowns?.creditNote?.sgst)}</td>
                            <td className="py-1.5 px-3 text-right">-{fmt(confirmModal.gstr1?.breakdowns?.creditNote?.igst)}</td>
                            <td className="py-1.5 px-3 text-right font-bold">-{fmt(confirmModal.gstr1?.breakdowns?.creditNote?.total)}</td>
                          </tr>
                        )}
                        {((confirmModal.gstr1?.breakdowns?.rcmOutward?.total || 0) > 0 || (confirmModal.gstr1?.breakdowns?.rcmOutward?.taxable || 0) > 0) && (
                          <tr className="hover:bg-purple-950/20 text-purple-300">
                            <td className="py-1.5 px-3 font-sans text-purple-400">Inward RCM Liability (3.1(d))</td>
                            <td className="py-1.5 px-3 text-right">{fmt(confirmModal.gstr1?.breakdowns?.rcmOutward?.taxable)}</td>
                            <td className="py-1.5 px-3 text-right">{fmt(confirmModal.gstr1?.breakdowns?.rcmOutward?.cgst)}</td>
                            <td className="py-1.5 px-3 text-right">{fmt(confirmModal.gstr1?.breakdowns?.rcmOutward?.sgst)}</td>
                            <td className="py-1.5 px-3 text-right">{fmt(confirmModal.gstr1?.breakdowns?.rcmOutward?.igst)}</td>
                            <td className="py-1.5 px-3 text-right font-bold">{fmt(confirmModal.gstr1?.breakdowns?.rcmOutward?.total)}</td>
                          </tr>
                        )}
                        <tr className="bg-blue-950/30 font-bold border-t border-slate-700">
                          <td className="py-2 px-3 font-sans text-blue-200">Total Outward Sales (Row 22)</td>
                          <td className="py-2 px-3 text-right text-blue-200">{fmt(confirmModal.gstr1?.totalOutwardTaxable)}</td>
                          <td className="py-2 px-3 text-right text-blue-200" colSpan={3}>—</td>
                          <td className="py-2 px-3 text-right text-emerald-400">{fmt(confirmModal.gstr1?.totalOutwardTax)}</td>
                        </tr>
                      </>
                    )}

                    {(confirmModal.mode === 'GSTR2B' || confirmModal.mode === 'BOTH') && (
                      <>
                        <tr className="hover:bg-slate-900/40">
                          <td className="py-1.5 px-3 font-sans text-emerald-300">Table 4: 4(A)(5) All Other ITC</td>
                          <td className="py-1.5 px-3 text-right">{fmt(confirmModal.gstr2b?.eligibleItc?.taxable)}</td>
                          <td className="py-1.5 px-3 text-right text-emerald-400">{fmt(confirmModal.gstr2b?.eligibleItc?.cgst)}</td>
                          <td className="py-1.5 px-3 text-right text-emerald-400">{fmt(confirmModal.gstr2b?.eligibleItc?.sgst)}</td>
                          <td className="py-1.5 px-3 text-right text-emerald-400">{fmt(confirmModal.gstr2b?.eligibleItc?.igst)}</td>
                          <td className="py-1.5 px-3 text-right font-bold text-white">{fmt(confirmModal.gstr2b?.eligibleItc?.total)}</td>
                        </tr>
                        <tr className="hover:bg-slate-900/40">
                          <td className="py-1.5 px-3 font-sans text-emerald-300">Table 4: 4(A)(3) Inward RCM</td>
                          <td className="py-1.5 px-3 text-right">{fmt(confirmModal.gstr2b?.rcmInward?.taxable)}</td>
                          <td className="py-1.5 px-3 text-right text-emerald-400">{fmt(confirmModal.gstr2b?.rcmInward?.cgst)}</td>
                          <td className="py-1.5 px-3 text-right text-emerald-400">{fmt(confirmModal.gstr2b?.rcmInward?.sgst)}</td>
                          <td className="py-1.5 px-3 text-right text-emerald-400">{fmt(confirmModal.gstr2b?.rcmInward?.igst)}</td>
                          <td className="py-1.5 px-3 text-right font-bold text-white">{fmt(confirmModal.gstr2b?.rcmInward?.total)}</td>
                        </tr>
                        {((confirmModal.gstr2b?.debitNotes?.total || 0) > 0 || (confirmModal.gstr2b?.debitNotes?.taxable || 0) > 0) && (
                          <tr className="hover:bg-emerald-950/20 text-emerald-300">
                            <td className="py-1.5 px-3 font-sans text-emerald-400">(+) 2B Supplier Debit Notes (Row 36)</td>
                            <td className="py-1.5 px-3 text-right">{fmt(confirmModal.gstr2b?.debitNotes?.taxable)}</td>
                            <td className="py-1.5 px-3 text-right">{fmt(confirmModal.gstr2b?.debitNotes?.cgst)}</td>
                            <td className="py-1.5 px-3 text-right">{fmt(confirmModal.gstr2b?.debitNotes?.sgst)}</td>
                            <td className="py-1.5 px-3 text-right">{fmt(confirmModal.gstr2b?.debitNotes?.igst)}</td>
                            <td className="py-1.5 px-3 text-right font-bold">{fmt(confirmModal.gstr2b?.debitNotes?.total)}</td>
                          </tr>
                        )}
                        {((confirmModal.gstr2b?.creditNotes?.total || 0) > 0 || (confirmModal.gstr2b?.creditNotes?.taxable || 0) > 0) && (
                          <tr className="hover:bg-rose-950/20 text-rose-300">
                            <td className="py-1.5 px-3 font-sans text-rose-400">(-) 2B Supplier Credit Notes (Row 38)</td>
                            <td className="py-1.5 px-3 text-right">-{fmt(confirmModal.gstr2b?.creditNotes?.taxable)}</td>
                            <td className="py-1.5 px-3 text-right">-{fmt(confirmModal.gstr2b?.creditNotes?.cgst)}</td>
                            <td className="py-1.5 px-3 text-right">-{fmt(confirmModal.gstr2b?.creditNotes?.sgst)}</td>
                            <td className="py-1.5 px-3 text-right">-{fmt(confirmModal.gstr2b?.creditNotes?.igst)}</td>
                            <td className="py-1.5 px-3 text-right font-bold">-{fmt(confirmModal.gstr2b?.creditNotes?.total)}</td>
                          </tr>
                        )}
                        {((confirmModal.gstr2b?.ineligibleItc?.total || 0) > 0 || (confirmModal.gstr2b?.ineligibleItc?.taxable || 0) > 0) && (
                          <tr className="hover:bg-rose-950/20 text-rose-300">
                            <td className="py-1.5 px-3 font-sans text-rose-400">(-) Table 4(B) ITC Reversals (Row 39)</td>
                            <td className="py-1.5 px-3 text-right">-{fmt(confirmModal.gstr2b?.ineligibleItc?.taxable)}</td>
                            <td className="py-1.5 px-3 text-right">-{fmt(confirmModal.gstr2b?.ineligibleItc?.cgst)}</td>
                            <td className="py-1.5 px-3 text-right">-{fmt(confirmModal.gstr2b?.ineligibleItc?.sgst)}</td>
                            <td className="py-1.5 px-3 text-right">-{fmt(confirmModal.gstr2b?.ineligibleItc?.igst)}</td>
                            <td className="py-1.5 px-3 text-right font-bold">-{fmt(confirmModal.gstr2b?.ineligibleItc?.total)}</td>
                          </tr>
                        )}
                        <tr className="bg-emerald-950/30 font-bold border-t border-slate-700">
                          <td className="py-2 px-3 font-sans text-emerald-200">Net Eligible ITC Available (Row 41)</td>
                          <td className="py-2 px-3 text-right text-emerald-200">—</td>
                          <td className="py-2 px-3 text-right text-emerald-200" colSpan={3}>—</td>
                          <td className="py-2 px-3 text-right text-teal-300">{fmt(confirmModal.gstr2b?.netEligibleTotal)}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal({ isOpen: false, mode: 'GSTR1', gstr1: null, gstr2b: null })}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeConfirmedInjection}
                className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-950/60 transition-all flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Confirm & Inject Data</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
                <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2.5 flex items-center gap-2">
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
                          <td className="py-1.5 px-3 text-right text-blue-400">{fmt(row.cgst)}</td>
                          <td className="py-1.5 px-3 text-right text-blue-400">{fmt(row.sgst)}</td>
                          <td className="py-1.5 px-3 text-right text-blue-400">{fmt(row.igst)}</td>
                          <td className="py-1.5 px-3 text-right font-bold text-white">{fmt(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table 4 Inward Breakdown */}
              <div>
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2.5 flex items-center gap-2">
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
                        <td className="py-1.5 px-3 text-right text-emerald-400">{fmt(currentMonthData.inward.itc2b.cgst)}</td>
                        <td className="py-1.5 px-3 text-right text-emerald-400">{fmt(currentMonthData.inward.itc2b.sgst)}</td>
                        <td className="py-1.5 px-3 text-right text-emerald-400">{fmt(currentMonthData.inward.itc2b.igst)}</td>
                        <td className="py-1.5 px-3 text-right font-bold text-white">{fmt(currentMonthData.inward.itc2b.total)}</td>
                      </tr>
                      <tr className="hover:bg-slate-900/40">
                        <td className="py-1.5 px-3 font-sans text-slate-300">4(A)(3) Inward Reverse Charge Supplies (RCM)</td>
                        <td className="py-1.5 px-3 text-right text-emerald-400">{fmt(currentMonthData.inward.rcmPaid.cgst)}</td>
                        <td className="py-1.5 px-3 text-right text-emerald-400">{fmt(currentMonthData.inward.rcmPaid.sgst)}</td>
                        <td className="py-1.5 px-3 text-right text-emerald-400">{fmt(currentMonthData.inward.rcmPaid.igst)}</td>
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
                          <td className="py-1.5 px-3 text-right text-emerald-400">{fmt(0)}</td>
                          <td className="py-1.5 px-3 text-right text-emerald-400">{fmt(0)}</td>
                          <td className="py-1.5 px-3 text-right text-emerald-400">{fmt(currentMonthData.inward.importGoods?.igst || activeGstr2b?.importGoods?.igst)}</td>
                          <td className="py-1.5 px-3 text-right font-bold text-white">{fmt(currentMonthData.inward.importGoods?.total || activeGstr2b?.importGoods?.total)}</td>
                        </tr>
                      )}
                      {(currentMonthData.inward.itcReversed?.total > 0 || (activeGstr2b?.ineligibleItc?.total || 0) > 0) && (
                        <tr className="hover:bg-slate-900/40 text-rose-300">
                          <td className="py-1.5 px-3 font-sans text-rose-400">(-) Table 4(B) ITC Reversals / Ineligible (Row 39)</td>
                          <td className="py-1.5 px-3 text-right">{fmt(currentMonthData.inward.itcReversed?.cgst || activeGstr2b?.ineligibleItc?.cgst)}</td>
                          <td className="py-1.5 px-3 text-right">{fmt(currentMonthData.inward.itcReversed?.sgst || activeGstr2b?.ineligibleItc?.sgst)}</td>
                          <td className="py-1.5 px-3 text-right">{fmt(currentMonthData.inward.itcReversed?.igst || activeGstr2b?.ineligibleItc?.igst)}</td>
                          <td className="py-1.5 px-3 text-right font-bold">-{fmt(currentMonthData.inward.itcReversed?.total || activeGstr2b?.ineligibleItc?.total)}</td>
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
