/**
 * Gstr2bDirectEntryTab.tsx — Suite 09: GSTR-2B Direct Inward Entry to TallyPrime.
 * 
 * Select client, FY, and period (month/full year) to transform GSTR-2B inward supplies
 * into rate-wise Tally Purchase & Debit Note vouchers, with SQLite audit tracking,
 * duplicate prevention, automatic master ingestion, and Port 9000 push.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layers,
  Search,
  CheckCircle2,
  AlertTriangle,
  Download,
  Send,
  History,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Filter,
  Calendar,
  Building2,
  Sparkles,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  ArrowRight,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { safeApiFetch } from '@/lib/api';
import {
  convert2bInvoicesToTallyVouchers,
  Gstr2bInvoiceRow,
  deriveGstRate,
  formatToTallyDate,
  parseTallyResponse,
  isPriorFyInvoice,
} from '@/lib/gstr2bTallyEngine';
import {
  generateMultiEntryXml,
  generateMasterLedgersXml,
  MultiEntryVoucher,
  MasterLedger,
  cleanNumericAmount,
} from '@/lib/tallyXmlEngine';
import { sendTallyRequest, TallyCompanyInfo } from '@/lib/tallyApi';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  TallyLivePushMonitor,
  LivePushState,
  PushStepLog,
} from '@/components/TallyLivePushMonitor';

interface ClientItem {
  id: string;
  gstin: string;
  trade_name?: string;
  legal_name?: string;
}

interface Gstr2bDirectEntryTabProps {
  tallyHost: string;
  tallyPort: number;
  isTallyConnected: boolean;
  tallyCompany: TallyCompanyInfo | null;
  onLoadIntoStudio: (vouchers: MultiEntryVoucher[], masters: MasterLedger[]) => void;
}

const CANONICAL_MONTHS = [
  'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March'
];

export const Gstr2bDirectEntryTab: React.FC<Gstr2bDirectEntryTabProps> = ({
  tallyHost,
  tallyPort,
  isTallyConnected,
  tallyCompany,
  onLoadIntoStudio,
}) => {
  // Selection states
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [selectedGstin, setSelectedGstin] = useState<string>('');
  const [financialYear, setFinancialYear] = useState<string>('2024-25');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('FULL_YEAR');

  // Data states
  const [invoices, setInvoices] = useState<Gstr2bInvoiceRow[]>([]);
  const [postedMap, setPostedMap] = useState<Record<string, any>>({});
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPushing, setIsPushing] = useState<boolean>(false);
  const [pushProgress, setPushProgress] = useState<string>('');
  const [livePushState, setLivePushState] = useState<LivePushState>({
    isActive: false,
    isCompleted: false,
    stage: 'idle',
    stageTitle: '',
    stageSubtext: '',
    progressPercent: 0,
    totalVouchers: 0,
    processedVouchers: 0,
    totalMasters: 0,
    processedMasters: 0,
    createdVouchers: 0,
    rejectedVouchers: 0,
    logs: [],
  });

  // Filtering states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterSection, setFilterSection] = useState<'ALL' | 'B2B' | 'CDNR'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'UNPOSTED' | 'POSTED'>('ALL');
  const [filterItc, setFilterItc] = useState<'ALL' | 'ELIGIBLE_ONLY'>('ALL');

  // Pagination states
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Configuration options
  const [voucherPrefix, setVoucherPrefix] = useState<string>('PUR-');
  const [bulkDate, setBulkDate] = useState<string>('');
  const [useExactDate, setUseExactDate] = useState<boolean>(true);
  const [snapToEduDates, setSnapToEduDates] = useState<boolean>(false);

  // History & Alert modals
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [historyTab, setHistoryTab] = useState<'success' | 'rejections'>('success');
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [rejectionRecords, setRejectionRecords] = useState<any[]>([]);
  const [eduAlertOpen, setEduAlertOpen] = useState<boolean>(false);
  const [duplicateConfirmOpen, setDuplicateConfirmOpen] = useState<boolean>(false);
  const [duplicateConfirmPayload, setDuplicateConfirmPayload] = useState<{
    unpostedOnly: Gstr2bInvoiceRow[];
    allSelected: Gstr2bInvoiceRow[];
    alreadyPostedCount: number;
  } | null>(null);
  const [priorFyConfirmOpen, setPriorFyConfirmOpen] = useState<boolean>(false);
  const [priorFyConfirmPayload, setPriorFyConfirmPayload] = useState<{
    priorInvoices: Gstr2bInvoiceRow[];
    currentFyOnly: Gstr2bInvoiceRow[];
    allInvoices: Gstr2bInvoiceRow[];
  } | null>(null);
  const [lastPushSummary, setLastPushSummary] = useState<{ created: number; errors: number; lineErrors: string[] } | null>(null);

  // 1. Load clients on mount
  useEffect(() => {
    async function loadClients() {
      try {
        const res = await safeApiFetch('/api/clients');
        const data = await res.json();
        const clientList: ClientItem[] = Array.isArray(data) ? data : (data.clients || []);
        setClients(clientList);
        if (clientList.length > 0 && !selectedGstin) {
          setSelectedGstin(clientList[0].gstin);
        }
      } catch (err: any) {
        console.error('Failed to load clients:', err);
      }
    }
    loadClients();
  }, []);

  // 2. Fetch 2B invoices and posted status whenever client/FY/period changes
  const fetchData = useCallback(async () => {
    if (!selectedGstin) return;
    setIsLoading(true);
    try {
      // A. Fetch 2B invoices
      const periodParam = selectedPeriod === 'FULL_YEAR' ? '' : selectedPeriod;
      const invUrl = `/api/gstr2b/invoices/${encodeURIComponent(selectedGstin)}?financialYear=${encodeURIComponent(financialYear)}${periodParam ? `&period=${encodeURIComponent(periodParam)}` : '&period=FULL_YEAR'}`;
      const invRes = await safeApiFetch(invUrl);
      const invData = await invRes.json();
      const rawInvoices: Gstr2bInvoiceRow[] = invData.invoices || [];
      setInvoices(rawInvoices);

      // B. Fetch already posted records
      const postUrl = `/api/gstr2b-tally/posted/${encodeURIComponent(selectedGstin)}?financialYear=${encodeURIComponent(financialYear)}${periodParam ? `&period=${encodeURIComponent(periodParam)}` : ''}`;
      const postRes = await safeApiFetch(postUrl);
      const postData = await postRes.json();
      const pMap = postData.postedMap || {};
      setPostedMap(pMap);

      // Auto-select UNPOSTED invoices by default
      const newSelected = new Set<string>();
      rawInvoices.forEach((inv) => {
        const key = `${inv.ctin}_${inv.inum}_${inv.idt}`.toUpperCase().trim();
        if (!pMap[key]) {
          newSelected.add(key);
        }
      });
      setSelectedKeys(newSelected);
      setPage(1);
    } catch (err: any) {
      toast.error(`Error loading GSTR-2B data: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedGstin, financialYear, selectedPeriod]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Unique Invoice Key Generator
  const getInvoiceKey = (inv: Gstr2bInvoiceRow) => {
    return `${inv.ctin}_${inv.inum}_${inv.idt}`.toUpperCase().trim();
  };

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const key = getInvoiceKey(inv);
      const isPosted = Boolean(postedMap[key]);

      // Status filter
      if (filterStatus === 'UNPOSTED' && isPosted) return false;
      if (filterStatus === 'POSTED' && !isPosted) return false;

      // Section filter
      const isCdnr = Boolean(
        (inv.section && inv.section.toUpperCase().includes('CDNR')) ||
        (inv.inv_typ && inv.inv_typ.toLowerCase().includes('credit'))
      );
      if (filterSection === 'B2B' && isCdnr) return false;
      if (filterSection === 'CDNR' && !isCdnr) return false;

      // ITC filter
      if (filterItc === 'ELIGIBLE_ONLY' && inv.itc_available === 'N') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          (inv.inum && inv.inum.toLowerCase().includes(q)) ||
          (inv.ctin && inv.ctin.toLowerCase().includes(q)) ||
          (inv.supplier_name && inv.supplier_name.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [invoices, postedMap, filterStatus, filterSection, filterItc, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    let unpostedCount = 0;
    let postedCount = 0;
    let totalTaxable = 0;
    let totalTax = 0;
    let totalVal = 0;

    invoices.forEach((inv) => {
      const key = getInvoiceKey(inv);
      if (postedMap[key]) {
        postedCount++;
      } else {
        unpostedCount++;
      }
      totalTaxable += cleanNumericAmount(inv.txval);
      totalTax += cleanNumericAmount(inv.igst) + cleanNumericAmount(inv.cgst) + cleanNumericAmount(inv.sgst) + cleanNumericAmount(inv.cess || 0);
      totalVal += cleanNumericAmount(inv.total_val || (inv.txval + inv.igst + inv.cgst + inv.sgst));
    });

    return {
      totalInvoices: invoices.length,
      unpostedCount,
      postedCount,
      totalTaxable: Math.round(totalTaxable * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalVal: Math.round(totalVal * 100) / 100,
    };
  }, [invoices, postedMap]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredInvoices.slice(start, start + pageSize);
  }, [filteredInvoices, currentPage, pageSize]);

  // Selection handlers
  const handleToggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      filteredInvoices.forEach((inv) => next.add(getInvoiceKey(inv)));
      return next;
    });
  };

  const handleSelectOnlyUnposted = () => {
    const next = new Set<string>();
    filteredInvoices.forEach((inv) => {
      const key = getInvoiceKey(inv);
      if (!postedMap[key]) next.add(key);
    });
    setSelectedKeys(next);
  };

  const handleDeselectAll = () => {
    setSelectedKeys(new Set());
  };

  // Convert selected invoices
  const getSelectedInvoicesList = () => {
    return invoices.filter((inv) => selectedKeys.has(getInvoiceKey(inv)));
  };

  // State for Tally Live Sync
  const [isSyncingWithTally, setIsSyncingWithTally] = useState<boolean>(false);

  // Sync Existing Vouchers from TallyPrime to detect any previously posted invoices
  const handleSyncWithTally = async () => {
    if (!isTallyConnected) {
      toast.error('Tally is not connected! Ensure Tally is running on Port 9000.');
      return;
    }
    const activeCompany = (tallyCompany && (tallyCompany.name || tallyCompany.companyName)) || 'Tally Company';
    setIsSyncingWithTally(true);
    const toastId = toast.loading('Reading existing vouchers from Tally to detect duplicates...');

    try {
      const exportXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>DayBookVouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>${activeCompany}</SVCURRENTCOMPANY>
        <SVFROMDATE>20200401</SVFROMDATE>
        <SVTODATE>20300331</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="DayBookVouchers">
            <TYPE>Voucher</TYPE>
            <METHOD>VOUCHERNUMBER : $VoucherNumber</METHOD>
            <METHOD>REFERENCE : $Reference</METHOD>
            <METHOD>DATE : $Date</METHOD>
            <METHOD>NARRATION : $Narration</METHOD>
            <METHOD>VOUCHERTYPENAME : $VoucherTypeName</METHOD>
            <FILTER>PurchaseOnly</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="PurchaseOnly">$VoucherTypeName = "Purchase"</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

      const rawResp = await sendTallyRequest(exportXml, { host: tallyHost, port: tallyPort });
      const vchRegex = /<VOUCHER\b[^>]*>([\s\S]*?)<\/VOUCHER>/gi;
      const tallyRefs = new Map<string, string>();
      let m;
      while ((m = vchRegex.exec(rawResp)) !== null) {
        const vBody = m[1];
        const refM = /<REFERENCE\b[^>]*>([^<]+)<\/REFERENCE>/i.exec(vBody);
        const vNoM = /<VOUCHERNUMBER\b[^>]*>([^<]+)<\/VOUCHERNUMBER>/i.exec(vBody);
        if (refM) {
          const ref = refM[1].trim().toUpperCase();
          const vNo = vNoM ? vNoM[1].trim() : '';
          tallyRefs.set(ref, vNo);
        }
      }

      // Check against current invoices
      const foundInTally: Gstr2bInvoiceRow[] = [];
      const updatedPostedMap: Record<string, any> = { ...postedMap };

      invoices.forEach((inv) => {
        const key = getInvoiceKey(inv);
        const cleanRef = (inv.inum || '').trim().toUpperCase();
        if (tallyRefs.has(cleanRef)) {
          foundInTally.push(inv);
          updatedPostedMap[key] = {
            supplier_gstin: inv.ctin,
            invoice_number: inv.inum,
            invoice_date: inv.idt,
            tally_voucher_no: tallyRefs.get(cleanRef) || '',
            posted_at: Date.now(),
            status: 'POSTED',
          };
        }
      });

      setPostedMap(updatedPostedMap);

      // Remove from selected keys
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        foundInTally.forEach((inv) => next.delete(getInvoiceKey(inv)));
        return next;
      });

      // Save to SQLite
      if (foundInTally.length > 0) {
        const entriesToRecord = foundInTally.map((inv) => ({
          supplier_gstin: inv.ctin,
          supplier_name: inv.supplier_name || '',
          invoice_number: inv.inum,
          invoice_date: inv.idt,
          section: inv.section || 'B2B',
          taxable_value: inv.txval,
          igst: inv.igst,
          cgst: inv.cgst,
          sgst: inv.sgst,
          cess: inv.cess || 0,
          total_value: inv.total_val,
          voucher_type: 'Purchase',
          tally_voucher_no: tallyRefs.get((inv.inum || '').trim().toUpperCase()) || '',
          status: 'POSTED',
        }));

        await safeApiFetch('/api/gstr2b-tally/mark-posted', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_gstin: selectedGstin,
            financial_year: financialYear,
            return_period: selectedPeriod,
            entries: entriesToRecord,
            tally_company: activeCompany,
          }),
        }).catch(() => {});
      }

      toast.dismiss(toastId);
      toast.success(`Synced with Tally: Found ${foundInTally.length} invoice(s) already in Tally! Marked as 'Already in Tally'.`);
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncingWithTally(false);
    }
  };

  // Action 1: Load into Universal Studio Grid
  const handleLoadIntoStudio = () => {
    const selected = getSelectedInvoicesList();
    if (selected.length === 0) {
      toast.warning('Please select at least one invoice to load.');
      return;
    }

    const { vouchers, masters } = convert2bInvoicesToTallyVouchers(selected, {
      voucherPrefix,
      financialYear,
      useExactInvoiceDate: useExactDate,
      bulkDate: useExactDate ? undefined : bulkDate,
      snapToEduDates,
    });

    onLoadIntoStudio(vouchers, masters);
    toast.success(`Loaded ${vouchers.length} vouchers and ${masters.length} supplier masters into Universal Studio.`);
  };

  // Action 2: Download XML
  const handleDownloadXml = () => {
    const selected = getSelectedInvoicesList();
    if (selected.length === 0) {
      toast.warning('Please select at least one invoice to export XML.');
      return;
    }

    const { vouchers, masters } = convert2bInvoicesToTallyVouchers(selected, {
      voucherPrefix,
      financialYear,
      useExactInvoiceDate: useExactDate,
      bulkDate: useExactDate ? undefined : bulkDate,
      snapToEduDates,
    });

    const activeCompany = (tallyCompany && (tallyCompany.name || tallyCompany.companyName)) || 'Tally Company';
    const vouchersXml = generateMultiEntryXml(vouchers, activeCompany);

    const blob = new Blob([vouchersXml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GSTR2B_Purchase_Vouchers_${selectedGstin}_${financialYear}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`Generated & downloaded ${vouchers.length} vouchers XML!`);
  };

  // Action 3: Push Directly to TallyPrime (Port 9000)
  const handlePushToTally = async () => {
    if (!isTallyConnected) {
      toast.error('TallyPrime is not connected! Ensure Tally is open and Server mode is enabled.');
      return;
    }

    const selected = getSelectedInvoicesList();
    if (selected.length === 0) {
      toast.warning('Please select at least one invoice to push.');
      return;
    }

    const unpostedOnly = selected.filter((inv) => !postedMap[getInvoiceKey(inv)]);
    const alreadyPostedCount = selected.length - unpostedOnly.length;

    // If some or all selected are already posted, prompt user to avoid accidental duplicates
    if (alreadyPostedCount > 0) {
      setDuplicateConfirmPayload({
        unpostedOnly,
        allSelected: selected,
        alreadyPostedCount,
      });
      setDuplicateConfirmOpen(true);
      return;
    }

    checkPriorFyAndPush(selected);
  };

  const checkPriorFyAndPush = (invoicesToPush: Gstr2bInvoiceRow[]) => {
    const priorInvoices = invoicesToPush.filter((inv) => isPriorFyInvoice(inv, financialYear));
    if (priorInvoices.length > 0) {
      setPriorFyConfirmPayload({
        priorInvoices,
        currentFyOnly: invoicesToPush.filter((inv) => !isPriorFyInvoice(inv, financialYear)),
        allInvoices: invoicesToPush,
      });
      setPriorFyConfirmOpen(true);
      return;
    }

    executePush(invoicesToPush, { snapPriorFy: true });
  };

  const executePush = async (invoicesToPush: Gstr2bInvoiceRow[], options?: { snapPriorFy?: boolean }) => {
    if (invoicesToPush.length === 0) {
      toast.warning('No invoices to push.');
      return;
    }

    const activeCompany = (tallyCompany && (tallyCompany.name || tallyCompany.companyName)) || 'SOURAV';
    setIsPushing(true);
    setPushProgress('Preparing vendor masters and vouchers...');

    const startTime = Date.now();
    const initialLogs: PushStepLog[] = [
      {
        id: `start-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'summary',
        status: 'processing',
        title: `Initiated Direct Tally Ingestion for ${invoicesToPush.length} Invoices`,
        details: `Target Company: ${activeCompany} (Port: ${tallyPort}) | Voucher Series: ${voucherPrefix} | FY: ${financialYear}`,
      },
    ];

    try {
      const { vouchers, masters } = convert2bInvoicesToTallyVouchers(invoicesToPush, {
        voucherPrefix,
        financialYear,
        snapPriorFyDates: options?.snapPriorFy !== false,
        useExactInvoiceDate: useExactDate,
        bulkDate: useExactDate ? undefined : bulkDate,
        snapToEduDates,
      });

      setLivePushState({
        isActive: true,
        isCompleted: false,
        stage: 'masters',
        stageTitle: 'Stage 1/3: Ingesting Supplier Masters & Tax Ledgers',
        stageSubtext: `Verifying & updating ${masters.length} statutory master ledgers in Tally...`,
        progressPercent: 5,
        totalVouchers: vouchers.length,
        processedVouchers: 0,
        totalMasters: masters.length,
        processedMasters: 0,
        createdVouchers: 0,
        rejectedVouchers: 0,
        startTime,
        logs: initialLogs,
      });

      // ─── STEP 1: PUSH MISSING VENDOR MASTERS & SYSTEM LEDGERS IN 50-CHUNKS ───
      if (masters.length > 0) {
        const MASTER_CHUNK = 50;
        const totalMasterChunks = Math.ceil(masters.length / MASTER_CHUNK);
        for (let m = 0; m < totalMasterChunks; m++) {
          const mChunk = masters.slice(m * MASTER_CHUNK, (m + 1) * MASTER_CHUNK);
          setPushProgress(`Step 1/2: Ingesting supplier masters batch ${m + 1}/${totalMasterChunks} (${mChunk.length} ledgers)...`);
          const mastersXml = generateMasterLedgersXml(mChunk, activeCompany);

          let masterBatchStatus: 'success' | 'warning' = 'success';
          let note = '';
          try {
            await sendTallyRequest(mastersXml, { host: tallyHost, port: tallyPort });
          } catch (mErr: any) {
            masterBatchStatus = 'warning';
            note = mErr.message;
            console.warn('[GSTR2B-Tally] Master push note:', mErr.message);
          }

          const newMasterLogs: PushStepLog[] = mChunk.map((ml) => ({
            id: `m-${ml.ledgerName}-${Date.now()}-${Math.random()}`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'master',
            status: masterBatchStatus,
            title: `Master: ${ml.ledgerName}`,
            details: `Group: ${ml.parentGroup} | GSTIN: ${ml.gstin || 'None'} | State: ${ml.state || 'None'}`,
            supplierName: ml.ledgerName,
            supplierGstin: ml.gstin,
            state: ml.state,
            tallyMessage: note || 'Verified & Synced in TallyPrime',
          }));

          const mProcessed = Math.min(masters.length, (m + 1) * MASTER_CHUNK);
          const mPercent = 5 + Math.round(((m + 1) / totalMasterChunks) * 10);

          setLivePushState((prev) => ({
            ...prev,
            processedMasters: mProcessed,
            progressPercent: mPercent,
            logs: [...prev.logs, ...newMasterLogs],
          }));
        }
      }

      // ─── STEP 2: PUSH VOUCHERS IN SMOOTH 25-BATCH CHUNKS WITH LIVE TELEMETRY ───
      const CHUNK_SIZE = 25;
      const totalChunks = Math.ceil(vouchers.length / CHUNK_SIZE);
      let totalCreated = 0;
      let totalErrors = 0;
      let lineErrors: string[] = [];
      let hadEduDateBlock = false;
      const succeededInvoices: typeof invoicesToPush = [];

      for (let i = 0; i < totalChunks; i++) {
        const chunk = vouchers.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const chunkInv = invoicesToPush.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const leadInv = chunkInv[0];
        const leadInfo = leadInv ? `Inv #${leadInv.inum} (${leadInv.supplier_name || leadInv.ctin})` : '';

        setPushProgress(`Step 2/2: Pushing vouchers batch ${i + 1}/${totalChunks} (${chunk.length} entries)...`);
        setLivePushState((prev) => ({
          ...prev,
          stage: 'vouchers',
          stageTitle: 'Stage 2/3: Pushing Inward Vouchers into Tally',
          stageSubtext: `Batch ${i + 1}/${totalChunks}: Processing ${chunk.length} vouchers...`,
          currentVoucherInfo: leadInfo,
        }));

        const chunkXml = generateMultiEntryXml(chunk, activeCompany);
        const rawResp = await sendTallyRequest(chunkXml, { host: tallyHost, port: tallyPort });

        const parsed = parseTallyResponse(rawResp);
        totalCreated += parsed.created;
        totalErrors += (parsed.errors + parsed.exceptions);
        if (parsed.isEduDateBlocked) hadEduDateBlock = true;
        if (parsed.lineErrors.length > 0) {
          lineErrors.push(...parsed.lineErrors);
        }

        const chunkErrorMsg = parsed.lineErrors.join(' | ') || (hadEduDateBlock ? 'Voucher date rejected by Tally Educational Mode (Allowed: 1st, 2nd, 31st only)' : 'Rejected by TallyPrime validation');

        // Telemetry logs for each voucher in this batch
        const newVchLogs: PushStepLog[] = chunkInv.map((inv, idx) => {
          const vch = chunk[idx];
          const isAccepted = idx < parsed.created;
          return {
            id: `vch-${inv.inum}-${Date.now()}-${idx}`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'voucher',
            status: isAccepted ? 'success' : 'error',
            title: `${vch.voucherType || 'Purchase'} ${vch.voucherNumber || ''} (Bill #${inv.inum})`,
            details: `${inv.supplier_name || inv.ctin} | Date: ${inv.idt || ''}`,
            voucherNo: vch.voucherNumber,
            invoiceNo: inv.inum,
            supplierName: inv.supplier_name || inv.ctin,
            supplierGstin: inv.ctin,
            section: inv.section || 'B2B',
            amount: inv.total_val,
            tallyMessage: isAccepted ? 'Accepted by TallyPrime' : chunkErrorMsg,
            legs: vch.legs.map((l) => ({
              ledgerName: l.ledgerName,
              amount: Math.abs(l.amount),
              isDebit: l.amount < 0,
            })),
          };
        });

        const vProcessed = Math.min(vouchers.length, (i + 1) * CHUNK_SIZE);
        const vPercent = 15 + Math.round(((i + 1) / totalChunks) * 75);

        setLivePushState((prev) => ({
          ...prev,
          processedVouchers: vProcessed,
          createdVouchers: totalCreated,
          rejectedVouchers: totalErrors,
          progressPercent: vPercent,
          logs: [...prev.logs, ...newVchLogs],
        }));

        if (parsed.created > 0) {
          const newlyCreatedInvoices = chunkInv.slice(0, parsed.created);
          succeededInvoices.push(...newlyCreatedInvoices);

          // INSTANT LOCAL STATE DEDUPLICATION: Mark posted immediately in state
          const newPostedKeys: Record<string, any> = {};
          newlyCreatedInvoices.forEach((inv) => {
            newPostedKeys[getInvoiceKey(inv)] = {
              supplier_gstin: inv.ctin,
              invoice_number: inv.inum,
              invoice_date: inv.idt,
              tally_voucher_no: '',
              posted_at: Date.now(),
              status: 'POSTED',
            };
          });
          setPostedMap((prev) => ({ ...prev, ...newPostedKeys }));
          setSelectedKeys((prev) => {
            const next = new Set(prev);
            newlyCreatedInvoices.forEach((inv) => next.delete(getInvoiceKey(inv)));
            return next;
          });
        }

        // RECORD REJECTIONS IN LOCAL SQLITE AUDIT LOG WITH EXACT REASONS & TIMESTAMP
        if (parsed.errors > 0 || parsed.exceptions > 0) {
          const rejectedInChunk = chunkInv.slice(parsed.created);
          const errorMsg = parsed.lineErrors.join(' | ') || (hadEduDateBlock ? 'Voucher date rejected by Tally Educational Mode (Allowed: 1st, 2nd, 31st only)' : 'Rejected by TallyPrime validation');

          const rejectionsToRecord = rejectedInChunk.map((inv) => ({
            supplier_gstin: inv.ctin,
            supplier_name: inv.supplier_name || '',
            invoice_number: inv.inum,
            invoice_date: inv.idt,
            section: inv.section || 'B2B',
            taxable_value: inv.txval,
            total_value: inv.total_val,
            voucher_type: inv.section?.includes('CDNR') ? 'Debit Note' : 'Purchase',
            rejection_reason: errorMsg,
          }));

          safeApiFetch('/api/gstr2b-tally/record-rejections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_gstin: selectedGstin,
              financial_year: financialYear,
              return_period: selectedPeriod,
              rejections: rejectionsToRecord,
              tally_company: activeCompany,
            }),
          }).catch(() => {});
        }
      }

      // ─── STEP 3: RECORD POSTED ENTRIES IN SQLITE DATABASE ───
      if (succeededInvoices.length > 0) {
        setPushProgress('Recording audit trail in local SQLite database...');
        setLivePushState((prev) => ({
          ...prev,
          stage: 'audit',
          stageTitle: 'Stage 3/3: Recording Audit Trail in SQLite Database',
          stageSubtext: `Saving ${succeededInvoices.length} posted records with deduplication timestamps...`,
          progressPercent: 95,
        }));

        const entriesToRecord = succeededInvoices.map((inv) => ({
          supplier_gstin: inv.ctin,
          supplier_name: inv.supplier_name || '',
          invoice_number: inv.inum,
          invoice_date: inv.idt,
          section: inv.section || 'B2B',
          taxable_value: inv.txval,
          igst: inv.igst,
          cgst: inv.cgst,
          sgst: inv.sgst,
          cess: inv.cess || 0,
          total_value: inv.total_val,
          voucher_type: inv.section?.includes('CDNR') ? 'Debit Note' : 'Purchase',
          tally_voucher_no: '',
          status: 'POSTED',
        }));

        await safeApiFetch('/api/gstr2b-tally/mark-posted', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_gstin: selectedGstin,
            financial_year: financialYear,
            return_period: selectedPeriod,
            entries: entriesToRecord,
            tally_company: activeCompany,
          }),
        }).catch((err) => console.warn('[GSTR2B-Tally] mark-posted fetch warning:', err));

        const auditLog: PushStepLog = {
          id: `audit-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          type: 'audit',
          status: 'success',
          title: 'SQLite Audit Trail Successfully Synced',
          details: `Recorded ${succeededInvoices.length} posted records in network_data.db table gstr2b_posted_vouchers`,
        };
        setLivePushState((prev) => ({
          ...prev,
          logs: [...prev.logs, auditLog],
        }));
      }

      const endTime = Date.now();
      setLivePushState((prev) => ({
        ...prev,
        isActive: false,
        isCompleted: true,
        stage: totalErrors === 0 ? 'done' : 'failed',
        stageTitle: totalErrors === 0 ? `Successfully Pushed All ${totalCreated} Vouchers!` : `Push Completed: ${totalCreated} Accepted, ${totalErrors} Rejected`,
        stageSubtext: `Total Duration: ${Math.floor((endTime - (prev.startTime || endTime)) / 1000)} seconds | Audit Trail Saved`,
        progressPercent: 100,
        endTime,
      }));

      setLastPushSummary({
        created: totalCreated,
        errors: totalErrors,
        lineErrors: Array.from(new Set(lineErrors)),
      });

      // Feedback to user
      if (totalCreated > 0 && totalErrors === 0) {
        toast.success(`Successfully pushed all ${totalCreated} vouchers directly into TallyPrime!`);
      } else if (totalCreated > 0 && totalErrors > 0) {
        toast.warning(`Pushed ${totalCreated} vouchers. ${totalErrors} vouchers rejected by Tally.`);
        if (hadEduDateBlock && !snapToEduDates) {
          setEduAlertOpen(true);
        }
      } else if (totalCreated === 0 && totalErrors > 0) {
        toast.error(`All vouchers were rejected by Tally (${totalErrors} errors).`);
        if (hadEduDateBlock && !snapToEduDates) {
          setEduAlertOpen(true);
        }
      } else {
        toast.info(`Tally response: ${totalCreated} created.`);
      }

      // Refresh status
      await fetchData();
    } catch (err: any) {
      toast.error(`Push failed: ${err.message || 'Error communicating with TallyPrime'}`);
      setLivePushState((prev) => ({
        ...prev,
        isActive: false,
        isCompleted: true,
        stage: 'failed',
        stageTitle: 'Push Operation Failed',
        stageSubtext: err.message || 'Error communicating with TallyPrime',
        progressPercent: 100,
        logs: [
          ...prev.logs,
          {
            id: `err-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'error',
            status: 'error',
            title: 'Fatal Push Exception',
            details: err.message || 'Cannot connect to TallyPrime Port 9000',
          },
        ],
      }));
    } finally {
      setIsPushing(false);
      setPushProgress('');
    }
  };

  // Open Posting History Modal
  const handleOpenHistory = async (initialTab: 'success' | 'rejections' = 'success') => {
    if (!selectedGstin) return;
    try {
      const res = await safeApiFetch(`/api/gstr2b-tally/history/${encodeURIComponent(selectedGstin)}`);
      const data = await res.json();
      setHistoryRecords(data.history || []);

      const rejRes = await safeApiFetch(`/api/gstr2b-tally/rejections/${encodeURIComponent(selectedGstin)}`);
      const rejData = await rejRes.json();
      setRejectionRecords(rejData.rejections || []);

      setHistoryTab(initialTab);
      setShowHistoryModal(true);
    } catch (err: any) {
      toast.error(`Failed to load history: ${err.message}`);
    }
  };

  // Reset / Clear posting history for active client
  const handleResetPostingHistory = async () => {
    if (!selectedGstin) return;
    if (!window.confirm(`Are you sure you want to reset all posted records for ${selectedGstin}? All invoices will return to "Pending" status.`)) {
      return;
    }
    try {
      await safeApiFetch(`/api/gstr2b-tally/posted/${encodeURIComponent(selectedGstin)}?financialYear=${encodeURIComponent(financialYear)}`, {
        method: 'DELETE',
      });
      setPostedMap({});
      setShowHistoryModal(false);
      toast.success('Posting history reset. All invoices marked as Pending.');
      await fetchData();
    } catch (err: any) {
      toast.error(`Reset failed: ${err.message}`);
    }
  };

  const selectedCount = selectedKeys.size;
  const currentClient = clients.find((c) => c.gstin.toUpperCase() === selectedGstin.toUpperCase());

  return (
    <div className="space-y-4">
      {/* 1. TOP SELECTORS & CONTROLS BAR */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:flex lg:flex-wrap items-center gap-2.5">
            {/* Client Selector */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs w-full sm:w-auto">
              <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="font-semibold text-slate-600 shrink-0">Client:</span>
              <select
                value={selectedGstin}
                onChange={(e) => setSelectedGstin(e.target.value)}
                className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer w-full sm:max-w-[220px] truncate"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.gstin}>
                    {c.trade_name || c.legal_name || c.gstin} ({c.gstin})
                  </option>
                ))}
              </select>
            </div>

            {/* Financial Year Selector */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs w-full sm:w-auto">
              <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="font-semibold text-slate-600 shrink-0">FY:</span>
              <select
                value={financialYear}
                onChange={(e) => setFinancialYear(e.target.value)}
                className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer w-full"
              >
                <option value="2026-27">2026-27</option>
                <option value="2025-26">2025-26</option>
                <option value="2024-25">2024-25</option>
                <option value="2023-24">2023-24</option>
              </select>
            </div>

            {/* Period Selector */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs w-full sm:w-auto">
              <span className="font-semibold text-slate-600 shrink-0">Period:</span>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer w-full sm:max-w-[180px] truncate"
              >
                <option value="FULL_YEAR">Full Year (12 Months)</option>
                {CANONICAL_MONTHS.map((m) => (
                  <option key={m} value={`${m} ${financialYear.slice(0, 4)}`}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={fetchData}
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer shadow-2xs shrink-0 inline-flex items-center justify-center w-8 h-8 sm:w-auto sm:h-auto"
              title="Refresh GSTR-2B Invoices"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto justify-start lg:justify-end pt-1 lg:pt-0">
            {/* Sync with Tally Live Button */}
            <button
              type="button"
              onClick={handleSyncWithTally}
              disabled={isSyncingWithTally || !isTallyConnected}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs border border-emerald-200 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
              title="Detect any vouchers already punched in Tally and mark them to prevent duplicates"
            >
              <ShieldCheck className={`w-3.5 h-3.5 text-emerald-600 ${isSyncingWithTally ? 'animate-spin' : ''}`} />
              <span>{isSyncingWithTally ? 'Checking Tally...' : 'Check Tally (Anti-Duplicate Sync)'}</span>
            </button>

            {/* Posting History Button */}
            <button
              type="button"
              onClick={() => handleOpenHistory('success')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 shadow-2xs transition-all cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-slate-500" />
              <span>Posting Audit Log</span>
            </button>
          </div>
        </div>

        {/* Quick Config Row */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span>Voucher Series:</span>
              <input
                type="text"
                value={voucherPrefix}
                onChange={(e) => setVoucherPrefix(e.target.value)}
                placeholder="PUR-"
                className="w-20 px-2 py-0.5 rounded border border-slate-200 bg-white font-mono text-slate-800 text-xs"
              />
            </div>

            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={useExactDate}
                onChange={(e) => setUseExactDate(e.target.checked)}
                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <span>Exact Bill Date as Voucher Date</span>
            </label>

            {!useExactDate && (
              <div className="flex items-center gap-1.5">
                <span>Bulk Date:</span>
                <input
                  type="text"
                  value={bulkDate}
                  onChange={(e) => setBulkDate(e.target.value)}
                  placeholder="YYYYMMDD"
                  className="w-24 px-2 py-0.5 rounded border border-slate-200 bg-white font-mono text-slate-800 text-xs"
                />
              </div>
            )}

            {/* Educational Mode Toggle */}
            <label className="inline-flex items-center gap-2 cursor-pointer bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 px-3 py-1 rounded-xl transition-all shadow-2xs font-semibold text-xs">
              <input
                type="checkbox"
                checked={snapToEduDates}
                onChange={(e) => setSnapToEduDates(e.target.checked)}
                className="rounded border-amber-400 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
              />
              <span>🟨 Edu Mode (Snap to 1st)</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">
              Selected Client: <strong className="text-slate-700">{currentClient?.trade_name || currentClient?.legal_name || selectedGstin}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Push Result Banner with Rejection Details Button */}
      {lastPushSummary && (lastPushSummary.created > 0 || lastPushSummary.errors > 0) && (
        <div
          className={`p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs ${
            lastPushSummary.errors > 0 ? 'bg-amber-50/90 border-amber-200 text-amber-900' : 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {lastPushSummary.errors > 0 ? (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            )}
            <div>
              <p className="font-bold text-xs">
                Last Push Result:{' '}
                <span className="text-emerald-700">{lastPushSummary.created} created in Tally</span>
                {lastPushSummary.errors > 0 && (
                  <span className="text-rose-700 ml-1.5">• {lastPushSummary.errors} rejected by Tally</span>
                )}
              </p>
              {lastPushSummary.errors > 0 && lastPushSummary.lineErrors.length > 0 && (
                <p className="text-[11px] text-amber-800/90 font-mono mt-0.5 max-w-2xl truncate">
                  Error: {lastPushSummary.lineErrors[0]}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {lastPushSummary.errors > 0 && (
              <button
                type="button"
                onClick={() => handleOpenHistory('rejections')}
                className="px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-2xs cursor-pointer"
              >
                View Rejection Reasons & Timestamps ({lastPushSummary.errors})
              </button>
            )}
            {lastPushSummary.errors > 0 && !snapToEduDates && (
              <button
                type="button"
                onClick={() => setEduAlertOpen(true)}
                className="px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-2xs cursor-pointer"
              >
                Why Tally rejected dates?
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. KPI SUMMARY METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Invoices in 2B</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">{stats.totalInvoices.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Downloaded from GST Portal</p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ready to Push (Pending)</p>
            <p className="text-xl font-bold text-blue-600 mt-0.5">{stats.unpostedCount.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-blue-600/80 mt-0.5 font-medium">Not yet posted to Tally</p>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Already in Tally</p>
            <p className="text-xl font-bold text-emerald-600 mt-0.5">{stats.postedCount.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-emerald-600/80 mt-0.5 font-medium">✓ Protected from double entry</p>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Purchase & Tax</p>
            <p className="text-xs font-mono font-bold text-slate-800 mt-0.5">
              Txval: ₹{stats.totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs font-mono font-bold text-slate-800">
              Total: ₹{stats.totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[10px] text-slate-400">Tax: ₹{stats.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. FILTER, SEARCH & SELECTION TOOLBAR */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search supplier, GSTIN, invoice..."
              className="pl-8 pr-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-rose-500 w-60 shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-[10px]"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value as any);
              setPage(1);
            }}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-700 font-semibold shadow-2xs"
          >
            <option value="ALL">All Invoices ({invoices.length})</option>
            <option value="UNPOSTED">Ready to Push ({stats.unpostedCount})</option>
            <option value="POSTED">Already in Tally ({stats.postedCount})</option>
          </select>

          {/* Section Filter */}
          <select
            value={filterSection}
            onChange={(e) => {
              setFilterSection(e.target.value as any);
              setPage(1);
            }}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-700 font-semibold shadow-2xs"
          >
            <option value="ALL">All Sections (B2B + CDNR)</option>
            <option value="B2B">B2B Purchase Only</option>
            <option value="CDNR">Credit Notes (CDNR) Only</option>
          </select>

          {/* ITC Filter Toggle */}
          <button
            type="button"
            onClick={() => setFilterItc((prev) => (prev === 'ALL' ? 'ELIGIBLE_ONLY' : 'ALL'))}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border shadow-2xs transition-all ${
              filterItc === 'ELIGIBLE_ONLY'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {filterItc === 'ELIGIBLE_ONLY' ? '✓ Eligible ITC Only' : 'All Invoices (Inc. Ineligible)'}
          </button>
        </div>

        {/* Quick Selection Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSelectOnlyUnposted}
            className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-[11px] border border-blue-200 transition-all cursor-pointer"
          >
            Select Unposted ({stats.unpostedCount})
          </button>
          <button
            type="button"
            onClick={handleSelectAllFiltered}
            className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold text-[11px] border border-slate-200 transition-all cursor-pointer"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={handleDeselectAll}
            className="px-2 py-1 rounded-lg text-slate-400 hover:text-slate-600 font-medium text-[11px] transition-all cursor-pointer"
          >
            Clear Selection
          </button>
        </div>
      </div>

      {/* 4. ACTION BAR DECK */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center font-bold text-rose-400 text-sm">
            {selectedCount}
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">
              {selectedCount} Invoice{selectedCount === 1 ? '' : 's'} Selected for Entry
            </h4>
            <p className="text-[11px] text-slate-300">
              Rate-wise Purchase Ledgers, Party Creditors, and Input GST will be mapped automatically.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Action 1: Load into Studio Grid */}
          <button
            type="button"
            onClick={handleLoadIntoStudio}
            disabled={selectedCount === 0 || isPushing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 shadow-2xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Load into Universal Studio table for manual review or custom adjustments"
          >
            <Copy className="w-4 h-4 text-blue-300" />
            <span>Load into Studio Grid</span>
          </button>

          {/* Action 2: Download Tally XML */}
          <button
            type="button"
            onClick={handleDownloadXml}
            disabled={selectedCount === 0 || isPushing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 shadow-2xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Download offline Tally XML file for manual import"
          >
            <Download className="w-4 h-4 text-emerald-300" />
            <span>Download Tally XML</span>
          </button>

          {/* Action 3: Push Directly to TallyPrime */}
          <button
            type="button"
            onClick={handlePushToTally}
            disabled={selectedCount === 0 || isPushing}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              isTallyConnected
                ? 'bg-rose-600 hover:bg-rose-500 text-white hover:scale-[1.02]'
                : 'bg-slate-700 text-slate-400'
            }`}
            title={isTallyConnected ? 'Push directly to open TallyPrime' : 'TallyPrime is offline'}
          >
            {isPushing ? (
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Send className="w-4 h-4 text-white" />
            )}
            <span>Push to TallyPrime (Port {tallyPort})</span>
          </button>
        </div>
      </div>

      {/* ─── LIVE PUSH STATUS & STEP-BY-STEP TELEMETRY MONITOR ─── */}
      <TallyLivePushMonitor
        state={livePushState}
        tallyCompany={(tallyCompany && (tallyCompany.name || tallyCompany.companyName)) || 'SOURAV'}
        tallyPort={tallyPort}
        onClose={() =>
          setLivePushState((prev) => ({
            ...prev,
            isActive: false,
            isCompleted: false,
            logs: [],
          }))
        }
        onViewHistory={() => handleOpenHistory(livePushState.rejectedVouchers > 0 ? 'rejections' : 'success')}
      />

      {/* 5. INVOICES DATA GRID */}
      {isLoading ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-2xs">
          <RefreshCw className="w-8 h-8 text-rose-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">Loading GSTR-2B Invoices...</p>
          <p className="text-xs text-slate-400 mt-1">Reading database records for {selectedGstin} ({financialYear})</p>
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-2xs">
          <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h3 className="text-base font-bold text-slate-800">No GSTR-2B Invoices Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            No inward invoices recorded for this client in {financialYear} ({selectedPeriod}). Download GSTR-2B from Suite 04 (Module 04) first.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 border-b border-slate-200 text-[11px] font-semibold shadow-2xs">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredInvoices.length > 0 && filteredInvoices.every((inv) => selectedKeys.has(getInvoiceKey(inv)))}
                      onChange={(e) => {
                        if (e.target.checked) handleSelectAllFiltered();
                        else handleDeselectAll();
                      }}
                      className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-2.5 px-3 w-12 text-center">#</th>
                  <th className="py-2.5 px-3">Invoice Details</th>
                  <th className="py-2.5 px-3">Supplier Name & GSTIN</th>
                  <th className="py-2.5 px-3 w-20 text-center">Section</th>
                  <th className="py-2.5 px-3 w-20 text-center">Rate</th>
                  <th className="py-2.5 px-3 w-28 text-right">Taxable (₹)</th>
                  <th className="py-2.5 px-3 w-28 text-right">Tax (₹)</th>
                  <th className="py-2.5 px-3 w-28 text-right">Total (₹)</th>
                  <th className="py-2.5 px-3 w-24 text-center">ITC</th>
                  <th className="py-2.5 px-3 w-32 text-center">Tally Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedInvoices.map((inv, idx) => {
                  const key = getInvoiceKey(inv);
                  const isPosted = Boolean(postedMap[key]);
                  const isSelected = selectedKeys.has(key);
                  const rate = deriveGstRate(inv.txval, inv.igst, inv.cgst, inv.sgst);
                  const isCdnr = Boolean(
                    (inv.section && inv.section.toUpperCase().includes('CDNR')) ||
                    (inv.inv_typ && inv.inv_typ.toLowerCase().includes('credit'))
                  );
                  const taxAmt = cleanNumericAmount(inv.igst) + cleanNumericAmount(inv.cgst) + cleanNumericAmount(inv.sgst) + cleanNumericAmount(inv.cess || 0);

                  return (
                    <tr
                      key={key}
                      onClick={() => handleToggleSelect(key)}
                      className={`hover:bg-slate-50/70 transition-colors cursor-pointer ${
                        isSelected ? 'bg-rose-50/30' : isPosted ? 'bg-slate-50/40 opacity-75' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(key)}
                          className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                          title={isPosted ? 'Already in Tally (Selecting allows XML export or re-pushing)' : 'Select for push'}
                        />
                      </td>

                      {/* Line Number */}
                      <td className="py-2.5 px-3 text-center font-mono text-slate-400 text-[11px]">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>

                      {/* Invoice Details */}
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800 font-mono text-xs">{inv.inum}</div>
                        <div className="text-[11px] text-slate-400">Date: {inv.idt || 'N/A'}</div>
                      </td>

                      {/* Supplier Name & GSTIN */}
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-800 truncate max-w-[220px]" title={inv.supplier_name || inv.ctin}>
                          {inv.supplier_name || 'Supplier'}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">{inv.ctin}</div>
                      </td>

                      {/* Section */}
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            isCdnr
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {isCdnr ? 'CDNR' : 'B2B'}
                        </span>
                      </td>

                      {/* Rate */}
                      <td className="py-2.5 px-3 text-center font-semibold text-slate-700">
                        {rate}%
                      </td>

                      {/* Taxable Value */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                        {inv.txval.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Tax Value */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        {taxAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        {inv.igst > 0 && <span className="block text-[10px] text-slate-400">IGST</span>}
                        {inv.cgst > 0 && <span className="block text-[10px] text-slate-400">CGST+SGST</span>}
                      </td>

                      {/* Total Value */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {(inv.total_val || (inv.txval + taxAmt)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* ITC Availability */}
                      <td className="py-2.5 px-3 text-center">
                        {inv.itc_available === 'N' ? (
                          <span
                            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200"
                            title={inv.itc_reason || 'Ineligible ITC / Blocked'}
                          >
                            Ineligible
                          </span>
                        ) : (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Eligible
                          </span>
                        )}
                      </td>

                      {/* Tally Posting Status */}
                      <td className="py-2.5 px-3 text-center">
                        {isPosted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>In Tally</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <span>Pending</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom Pagination */}
          {totalPages > 1 && (
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs text-slate-600">
              <div className="text-center sm:text-left text-slate-500">
                Showing <span className="font-semibold text-slate-700">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                <span className="font-semibold text-slate-700">{Math.min(currentPage * pageSize, filteredInvoices.length)}</span> of{' '}
                <span className="font-semibold text-slate-700">{filteredInvoices.length.toLocaleString('en-IN')}</span> invoices
              </div>

              <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Rows per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(parseInt(e.target.value, 10));
                      setPage(1);
                    }}
                    className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold cursor-pointer shadow-2xs"
                  >
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="250">250</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 font-semibold shadow-2xs inline-flex items-center gap-1 transition-all"
                    title="Previous page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Prev</span>
                  </button>

                  <span className="font-semibold text-slate-800 px-2.5 py-1 rounded-lg bg-white border border-slate-200 shadow-2xs text-[11px]">
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 font-semibold shadow-2xs inline-flex items-center gap-1 transition-all"
                    title="Next page"
                  >
                    <span className="text-[11px]">Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. POSTING AUDIT LOG MODAL WITH REJECTIONS AUDIT */}
      <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <DialogContent className="max-w-3xl bg-white rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
              <History className="w-5 h-5 text-rose-600" />
              <span>GSTR-2B to Tally Posting & Rejections Audit Log</span>
            </DialogTitle>
          </DialogHeader>

          {/* Sub-Tabs: Successful vs Rejections */}
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <button
              type="button"
              onClick={() => setHistoryTab('success')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                historyTab === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Successful Batches</span>
              <span className="px-1.5 py-0.2 rounded-full bg-white text-emerald-800 font-bold border border-emerald-200 text-[10px]">
                {historyRecords.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setHistoryTab('rejections')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                historyTab === 'rejections'
                  ? 'bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>Rejections & Failure Reasons</span>
              <span className="px-1.5 py-0.2 rounded-full bg-white text-rose-800 font-bold border border-rose-200 text-[10px]">
                {rejectionRecords.length}
              </span>
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto space-y-2 py-2">
            {historyTab === 'success' ? (
              historyRecords.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">No previous posting batches recorded for this client.</p>
              ) : (
                historyRecords.map((rec, rIdx) => {
                  const dateStr = rec.posted_at ? new Date(rec.posted_at).toLocaleString('en-IN') : 'Unknown';
                  return (
                    <div key={rIdx} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-slate-800">
                          {rec.total_vouchers} {rec.voucher_type || 'Purchase'} Vouchers Posted
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          FY: <strong>{rec.financial_year}</strong> | Period: <strong>{rec.return_period}</strong> | Tally Company: <strong>{rec.tally_company || 'Active'}</strong>
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Posted on: {dateStr}</p>
                      </div>
                      <div className="text-right font-mono">
                        <p className="font-bold text-slate-900">₹{Number(rec.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                        <p className="text-[10px] text-slate-400">Tax: ₹{Number(rec.total_tax || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  );
                })
              )
            ) : (
              rejectionRecords.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">Zero Rejections Recorded!</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">All vouchers pushed were successfully accepted by Tally.</p>
                </div>
              ) : (
                rejectionRecords.map((rej, rIdx) => {
                  const dateStr = rej.rejected_at ? new Date(rej.rejected_at).toLocaleString('en-IN') : 'Unknown';
                  return (
                    <div key={rIdx} className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/40 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-rose-900">
                            Invoice: <span className="font-mono">{rej.invoice_number}</span> (Dated: {rej.invoice_date})
                          </p>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            Supplier: <strong>{rej.supplier_name || rej.supplier_gstin}</strong> | Section: <strong>{rej.section || 'B2B'}</strong>
                          </p>
                        </div>
                        <div className="text-right font-mono">
                          <p className="font-bold text-slate-900">₹{Number(rej.total_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                          <p className="text-[10px] text-rose-700 font-semibold uppercase">REJECTED BY TALLY</p>
                        </div>
                      </div>

                      {/* Exact Rejection Reason Box */}
                      <div className="p-2.5 rounded-lg bg-white border border-rose-200/90 text-rose-900 font-mono text-[11px] leading-relaxed">
                        <strong className="text-rose-700">Tally Error:</strong> {rej.rejection_reason}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-rose-100">
                        <span>Logged on: {dateStr}</span>
                        <span>Target Tally Company: {rej.tally_company || 'Active'}</span>
                      </div>
                    </div>
                  );
                })
              )
            )}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
            <button
              type="button"
              onClick={handleResetPostingHistory}
              className="text-xs text-rose-600 hover:text-rose-700 hover:underline font-semibold"
            >
              Reset Client Posting History
            </button>
            <button
              type="button"
              onClick={() => setShowHistoryModal(false)}
              className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7. EDUCATIONAL MODE DATE EXPLANATION DIALOG */}
      <Dialog open={eduAlertOpen} onOpenChange={setEduAlertOpen}>
        <DialogContent className="max-w-lg bg-white rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-amber-900">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span>Tally Educational Mode Date Restriction</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs text-slate-600 leading-relaxed">
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 font-medium">
              TallyPrime Educational Mode strictly permits voucher dates only on the <strong>1st, 2nd, and 31st</strong> of each month. Vouchers on other dates (3rd to 30th) are rejected by Tally with <em>"Voucher date is missing"</em>.
            </div>
            <p>
              In full Licensed TallyPrime (Silver/Gold), all vouchers will post smoothly on their exact invoice dates without any restrictions.
            </p>
            <p>
              For testing in Educational Mode, you can enable <strong>"Edu Mode (Snap to 1st)"</strong>. This will set the Tally voucher date to the 1st of the invoice month while keeping the real bill date safely preserved in the Reference Date and Narration.
            </p>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
            <button
              type="button"
              onClick={() => setEduAlertOpen(false)}
              className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => {
                setSnapToEduDates(true);
                setEduAlertOpen(false);
                toast.info('Educational mode enabled (snapping dates to 1st). Click "Push to Tally" to retry.');
              }}
              className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs"
            >
              Enable Edu Mode & Retry
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 8. DUPLICATE PUSH CONFIRMATION DIALOG */}
      <Dialog open={duplicateConfirmOpen} onOpenChange={setDuplicateConfirmOpen}>
        <DialogContent className="max-w-md bg-white rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-amber-900">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span>Already in Tally Confirmation</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs text-slate-600 leading-relaxed">
            <p>
              You have selected <strong>{duplicateConfirmPayload?.allSelected.length}</strong> invoice(s), but{' '}
              <strong className="text-amber-700">{duplicateConfirmPayload?.alreadyPostedCount}</strong> of them are already marked as{' '}
              <span className="font-semibold text-emerald-700">"In Tally"</span>.
            </p>
            <p className="p-2.5 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 text-[11px]">
              Pushing them again may create duplicate vouchers in Tally unless you previously deleted them in Tally.
            </p>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => setDuplicateConfirmOpen(false)}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
            >
              Cancel
            </button>
            {duplicateConfirmPayload && duplicateConfirmPayload.unpostedOnly.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const list = duplicateConfirmPayload.unpostedOnly;
                  setDuplicateConfirmOpen(false);
                  checkPriorFyAndPush(list);
                }}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
              >
                Push Only Pending ({duplicateConfirmPayload.unpostedOnly.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const list = duplicateConfirmPayload?.allSelected || [];
                setDuplicateConfirmOpen(false);
                checkPriorFyAndPush(list);
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs"
            >
              Force Re-Push All ({duplicateConfirmPayload?.allSelected.length})
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 9. PRIOR FINANCIAL YEAR INVOICES CONFIRMATION DIALOG */}
      <Dialog open={priorFyConfirmOpen} onOpenChange={setPriorFyConfirmOpen}>
        <DialogContent className="max-w-lg bg-white rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-amber-900">
              <Calendar className="w-5 h-5 text-amber-600" />
              <span>Prior Financial Year Invoices Detected</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs text-slate-600 leading-relaxed">
            <p>
              We detected <strong className="text-amber-700 font-bold">{priorFyConfirmPayload?.priorInvoices.length}</strong> invoice(s) dated prior to Financial Year <strong>{financialYear}</strong> (dated in March or earlier).
            </p>
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 text-[11px] leading-relaxed">
              <strong>Tally Books Rule:</strong> Company books in Tally begin on <strong>01-Apr-{financialYear.slice(0, 4)}</strong>. Creating vouchers before this date will cause Tally to reject them with <em>"The date is Out of Range!"</em>.
            </div>

            {/* Invoices Preview */}
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 text-[11px]">
              {priorFyConfirmPayload?.priorInvoices.map((inv) => (
                <div key={getInvoiceKey(inv)} className="p-2 flex items-center justify-between gap-2 hover:bg-slate-50">
                  <div className="truncate max-w-[240px]">
                    <span className="font-mono font-semibold text-slate-800">{inv.inum}</span>
                    <span className="text-slate-400 ml-1.5 text-[10px]">({inv.supplier_name || inv.ctin})</span>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <span className="text-amber-800 font-semibold">{inv.idt}</span>
                    <span className="text-slate-400 mx-1">➔</span>
                    <span className="text-emerald-700 font-bold">01-Apr-{financialYear.slice(0, 4)}</span>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-slate-500 italic">
              * Original bill date is 100% preserved in Tally's Reference Date and Narration.
            </p>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => setPriorFyConfirmOpen(false)}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
            >
              Cancel
            </button>
            {priorFyConfirmPayload && priorFyConfirmPayload.currentFyOnly.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const list = priorFyConfirmPayload.currentFyOnly;
                  setPriorFyConfirmOpen(false);
                  executePush(list, { snapPriorFy: false });
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold"
              >
                Skip Prior FY ({priorFyConfirmPayload.currentFyOnly.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const list = priorFyConfirmPayload?.allInvoices || [];
                setPriorFyConfirmOpen(false);
                executePush(list, { snapPriorFy: true });
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs"
            >
              Adjust to 01-Apr & Push ({priorFyConfirmPayload?.allInvoices.length})
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

