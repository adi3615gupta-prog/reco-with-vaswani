import { useMemo, useState, useDeferredValue, useEffect } from 'react';
import {
  Search,
  Download,
  Link,
  Unlink,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Users,
  Plus,
  GitMerge,
  X,
  Check,
  Copy,
  SlidersHorizontal,
  ChevronDown,
  Building2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { aggregateByParty, type PartySummary, type PartyInvoiceRow } from '@/lib/partyWise';
import { exportPartyWise, exportDebitNotes21Col, exportWorkbookAsync } from '@/lib/fileParser';
import { reconcileDebitNotes } from '@/lib/debitNoteEngine';
import { BatchBadge, StatusBadge } from '@/components/StatusBadge';
import type { ReconciliationResult, MatchStatus } from '@/lib/reconciliation';
import { toast } from 'sonner';
import { AuditJustificationModal } from '@/components/AuditJustificationModal';
import type { AuditActionType, AuditOverrideRecord } from '@/lib/auditTrailService';
import {
  type SmartMatchCandidate,
  findSmartMatchesForParty,
  findSmartMatchesForInvoice,
  findAllSmartMatches,
  applySmartMatch,
  applyBatchSmartMatches,
} from '@/lib/smartMismatchSolver';
import { AiSmartMatchModal } from '@/components/AiSmartMatchModal';

interface Props {
  results: ReconciliationResult[];
  companyName: string;
  mode?: 'input' | 'output';
  debitNotes?: { pr?: any[]; twoB?: any[] };
  onResultsChange?: (newResults: ReconciliationResult[]) => void;
  partyDisputes?: Record<string, any>;
  onPartyDisputesChange?: (disputes: Record<string, any>) => void;
}

export type PartySortOption = 'var_desc' | 'name_asc' | 'name_desc' | 'var_asc' | 'count_desc';
export type PartyStatusFilter = 'all' | 'missing' | 'mismatch' | 'matched' | 'debitNotes';

const fmt = (n: number) =>
  n === 0 ? '—' : `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;

const fmtExact = (n: number) =>
  n === 0 ? '—' : `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

function mergeInvoicePair(
  prRaw: ReconciliationResult,
  twoBRaw: ReconciliationResult,
  remark: string
): ReconciliationResult {
  const prRec = prRaw.prRecord;
  const tbRec = twoBRaw.twoBRecord;

  const igstDiff = +((prRec?.igst ?? 0) - (tbRec?.igst ?? 0)).toFixed(2);
  const cgstDiff = +((prRec?.cgst ?? 0) - (tbRec?.cgst ?? 0)).toFixed(2);
  const sgstDiff = +((prRec?.sgst ?? 0) - (tbRec?.sgst ?? 0)).toFixed(2);
  const gstDiff = +(Math.abs(igstDiff) + Math.abs(cgstDiff) + Math.abs(sgstDiff)).toFixed(2);
  const taxableDiff = +((prRec?.taxableValue ?? 0) - (tbRec?.taxableValue ?? 0)).toFixed(2);

  const matchStatus: MatchStatus = gstDiff === 0 && taxableDiff === 0 ? 'Perfect Match' : 'Value Mismatch';

  return {
    ...prRaw,
    prRecord: prRec,
    twoBRecord: tbRec,
    status: matchStatus,
    igstDiff,
    cgstDiff,
    sgstDiff,
    gstDiff,
    taxableDiff,
    matchMethod: 'Name (Exact)',
    remark,
  };
}

function overallBadgeClass(status: PartySummary['overall']) {
  if (status === 'All Matched') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Has Mismatches') return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

function overallDotClass(status: PartySummary['overall']) {
  if (status === 'All Matched') return 'bg-emerald-500';
  if (status === 'Has Mismatches') return 'bg-amber-500';
  return 'bg-rose-500';
}

function hasDebitNoteInvoice(p: PartySummary) {
  return p.invoices.some(
    (inv) =>
      String(inv.status || '').toLowerCase().includes('debit note') ||
      inv.invoiceNoPR?.toLowerCase().includes('dn') ||
      inv.invoiceNo2B?.toLowerCase().includes('dn') ||
      inv.remark?.toLowerCase().includes('debit note') ||
      (inv.taxablePR !== undefined && inv.taxablePR < 0) ||
      (inv.taxable2B !== undefined && inv.taxable2B < 0)
  );
}

export function PartyWiseReport({
  results,
  companyName,
  mode = 'input',
  debitNotes,
  onResultsChange,
  partyDisputes,
  onPartyDisputesChange,
}: Props) {
  const [internalDisputes, setInternalDisputes] = useState<Record<string, any>>({});
  const activeDisputes = partyDisputes || internalDisputes;
  const handleDisputesChange = onPartyDisputesChange || setInternalDisputes;

  const [groupBy, setGroupBy] = useState<'gstin' | 'name'>('gstin');
  const parties = useMemo(() => aggregateByParty(results, debitNotes, mode, groupBy), [results, debitNotes, mode, groupBy]);

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [sortBy, setSortBy] = useState<PartySortOption>('var_desc');
  const [statusFilter, setStatusFilter] = useState<PartyStatusFilter>('all');
  const [visiblePartiesCount, setVisiblePartiesCount] = useState<number>(80);
  const [selectedPartyKey, setSelectedPartyKey] = useState<string>('');

  // Detail inspector toggles
  const [showTaxSplit, setShowTaxSplit] = useState(false);
  const [pairMode, setPairMode] = useState(false);
  const [selectedPRIndex, setSelectedPRIndex] = useState<number | null>(null);
  const [selected2BIndex, setSelected2BIndex] = useState<number | null>(null);
  const [stagedPairs, setStagedPairs] = useState<Array<{ pr: PartyInvoiceRow; twoB: PartyInvoiceRow; prIndex: number; twoBIndex: number }>>([]);

  // Merge mode state
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedMergeKeys, setSelectedMergeKeys] = useState<Set<string>>(new Set());
  const [primaryMergeKey, setPrimaryMergeKey] = useState<string>('');

  // Modals
  const [smartMatchModalOpen, setSmartMatchModalOpen] = useState<boolean>(false);
  const [smartMatchCandidates, setSmartMatchCandidates] = useState<SmartMatchCandidate[]>([]);
  const [auditModalState, setAuditModalState] = useState<{
    isOpen: boolean;
    actionType: AuditActionType;
    targetStatus: string;
    originalStatus?: string;
    prRecord?: any;
    twoBRecord?: any;
    clientGstin?: string;
    taxableDiff?: number;
    gstDiff?: number;
    onConfirmOverride?: (justification: string, auditRecord: AuditOverrideRecord) => void;
  }>({
    isOpen: false,
    actionType: 'FORCE_MATCH',
    targetStatus: 'Perfect Match',
  });

  const statusCounts = useMemo(() => {
    let missing = 0;
    let mismatch = 0;
    let matched = 0;
    let dn = 0;
    for (const p of parties) {
      if (p.overall === 'Has Missing') missing++;
      else if (p.overall === 'Has Mismatches') mismatch++;
      else matched++;
      if (hasDebitNoteInvoice(p)) dn++;
    }
    return { all: parties.length, missing, mismatch, matched, dn };
  }, [parties]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    let list = parties;

    if (statusFilter !== 'all') {
      if (statusFilter === 'missing') list = list.filter((p) => p.overall === 'Has Missing');
      else if (statusFilter === 'mismatch') list = list.filter((p) => p.overall === 'Has Mismatches');
      else if (statusFilter === 'matched') list = list.filter((p) => p.overall === 'All Matched');
      else if (statusFilter === 'debitNotes') list = list.filter(hasDebitNoteInvoice);
    }

    if (q) {
      list = list.filter((p) => p.partyName.toLowerCase().includes(q) || p.gstin.toLowerCase().includes(q));
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'var_desc') return Math.abs(b.totals.totalDiff) - Math.abs(a.totals.totalDiff);
      if (sortBy === 'var_asc') return Math.abs(a.totals.totalDiff) - Math.abs(b.totals.totalDiff);
      if (sortBy === 'name_asc') return (a.partyName || a.key).localeCompare(b.partyName || b.key);
      if (sortBy === 'name_desc') return (b.partyName || b.key).localeCompare(a.partyName || a.key);
      if (sortBy === 'count_desc') return b.totals.count - a.totals.count;
      return 0;
    });
  }, [parties, deferredSearch, sortBy, statusFilter]);

  const activeParty = useMemo(() => {
    if (filtered.length === 0) return null;
    return filtered.find((p) => p.key === selectedPartyKey) || filtered[0];
  }, [filtered, selectedPartyKey]);

  // Reset inline pairing selection when switching parties
  useEffect(() => {
    setSelectedPRIndex(null);
    setSelected2BIndex(null);
    setStagedPairs([]);
    setPairMode(false);
  }, [activeParty?.key]);

  // Matching handlers
  const handleManualMatch = (prInvRow: PartyInvoiceRow, twoBInvRow: PartyInvoiceRow) => {
    if (!onResultsChange || !results) return;
    const prRaw = prInvRow.rawResult;
    const twoBRaw = twoBInvRow.rawResult;
    if (!prRaw || !twoBRaw) return;

    const newResults = results.filter((r) => r !== twoBRaw);
    const prIndex = newResults.findIndex((r) => r === prRaw);
    const merged = mergeInvoicePair(prRaw, twoBRaw, 'Manually Matched by User');

    if (prIndex !== -1) newResults[prIndex] = merged;
    else newResults.push(merged);

    onResultsChange(newResults);
    toast.success(`Matched #${prRaw.prRecord?.invoiceNo || 'Books'} with #${twoBRaw.twoBRecord?.invoiceNo || '2B'}`);
  };

  const handleBatchMatch = (pairs: Array<{ pr: PartyInvoiceRow; twoB: PartyInvoiceRow }>) => {
    if (!onResultsChange || !results || pairs.length === 0) return;
    let newResults = [...results];
    let matchCount = 0;

    for (const pair of pairs) {
      const prRaw = pair.pr.rawResult;
      const twoBRaw = pair.twoB.rawResult;
      if (!prRaw || !twoBRaw) continue;

      newResults = newResults.filter((r) => r !== twoBRaw);
      const prIndex = newResults.findIndex((r) => r === prRaw);
      if (prIndex !== -1) {
        newResults[prIndex] = mergeInvoicePair(prRaw, twoBRaw, 'Batch Matched by User');
        matchCount++;
      }
    }

    if (matchCount > 0) {
      onResultsChange(newResults);
      toast.success(`Batch matched ${matchCount} invoice pair(s)!`);
    }
  };

  const handleAutoMatchParty = (party: PartySummary) => {
    if (!onResultsChange || !results) return;
    const unmatchedPR = party.invoices.filter(
      (i) => (i.status === 'Not in 2B' || i.status === 'Missing in 2B' || i.status === 'Unmatched Vendor' || i.status === 'Debit Note (Books)') && i.rawResult?.prRecord
    );
    const unmatched2B = party.invoices.filter(
      (i) => (i.status === 'Not in Books' || i.status === 'Missing in PR' || i.status === 'Debit Note (Portal)') && i.rawResult?.twoBRecord
    );

    if (unmatchedPR.length === 0 || unmatched2B.length === 0) {
      toast.info('No unmatched Books & 2B invoice pairs available for this party');
      return;
    }

    let matchedCount = 0;
    let newResults = [...results];
    const used2B = new Set<ReconciliationResult>();

    for (const prRow of unmatchedPR) {
      const prRaw = prRow.rawResult!;
      const prGst = prRow.igstPR + prRow.cgstPR + prRow.sgstPR;
      const match2B = unmatched2B.find((bRow) => {
        if (used2B.has(bRow.rawResult!)) return false;
        const bGst = bRow.igst2B + bRow.cgst2B + bRow.sgst2B;
        const prNo = (prRow.invoiceNoPR || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const bNo = (bRow.invoiceNo2B || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const noMatch = prNo.length > 0 && bNo.length > 0 && (bNo.includes(prNo) || prNo.includes(bNo));
        return Math.abs(prGst - bGst) < 1 || Math.abs(prRow.taxablePR - bRow.taxable2B) < 1 || noMatch;
      });

      if (match2B?.rawResult) {
        used2B.add(match2B.rawResult);
        newResults = newResults.filter((r) => r !== match2B.rawResult);
        const prIndex = newResults.findIndex((r) => r === prRaw);
        const merged = mergeInvoicePair(prRaw, match2B.rawResult, 'Auto-Matched by System');
        if (prIndex !== -1) newResults[prIndex] = merged;
        else newResults.push(merged);
        matchedCount++;
      }
    }

    if (matchedCount > 0) {
      onResultsChange(newResults);
      toast.success(`Auto-matched ${matchedCount} pair(s) for ${party.partyName}`);
    } else {
      toast.info('No matching invoice pairs found for auto-matching');
    }
  };

  const handleAutoMatchAll = () => {
    if (!onResultsChange || !results) return;
    let totalMatched = 0;
    let newResults = [...results];

    for (const party of parties) {
      const unmatchedPR = party.invoices.filter(
        (i) => (i.status === 'Not in 2B' || i.status === 'Missing in 2B' || i.status === 'Unmatched Vendor') && i.rawResult?.prRecord
      );
      const unmatched2B = party.invoices.filter(
        (i) => (i.status === 'Not in Books' || i.status === 'Missing in PR') && i.rawResult?.twoBRecord
      );
      if (unmatchedPR.length === 0 || unmatched2B.length === 0) continue;

      const used2B = new Set<ReconciliationResult>();
      for (const prRow of unmatchedPR) {
        const prRaw = prRow.rawResult!;
        const prGst = prRow.igstPR + prRow.cgstPR + prRow.sgstPR;
        const match2B = unmatched2B.find((bRow) => {
          if (used2B.has(bRow.rawResult!)) return false;
          const bGst = bRow.igst2B + bRow.cgst2B + bRow.sgst2B;
          const prNo = (prRow.invoiceNoPR || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const bNo = (bRow.invoiceNo2B || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const noMatch = prNo.length > 0 && bNo.length > 0 && (bNo.includes(prNo) || prNo.includes(bNo));
          return Math.abs(prGst - bGst) < 1 || Math.abs(prRow.taxablePR - bRow.taxable2B) < 1 || noMatch;
        });
        if (match2B?.rawResult) {
          used2B.add(match2B.rawResult);
          newResults = newResults.filter((r) => r !== match2B.rawResult);
          const prIndex = newResults.findIndex((r) => r === prRaw);
          if (prIndex !== -1) {
            newResults[prIndex] = mergeInvoicePair(prRaw, match2B.rawResult, 'Auto-Matched by System');
            totalMatched++;
          }
        }
      }
    }

    if (totalMatched > 0) {
      onResultsChange(newResults);
      toast.success(`Auto-matched ${totalMatched} pair(s) across all parties!`);
    } else {
      toast.info('No remaining matching invoice pairs found');
    }
  };

  const handleForceMatch = (invRow: PartyInvoiceRow) => {
    if (!onResultsChange || !results || !invRow.rawResult) return;
    const raw = invRow.rawResult;
    setAuditModalState({
      isOpen: true,
      actionType: 'FORCE_MATCH',
      targetStatus: 'Perfect Match',
      originalStatus: invRow.status,
      prRecord: raw.prRecord || { invoiceNo: invRow.invoiceNoPR, taxableValue: invRow.taxablePR },
      twoBRecord: raw.twoBRecord || { invoiceNo: invRow.invoiceNo2B, taxableValue: invRow.taxable2B },
      clientGstin: raw.prRecord?.gstin || raw.twoBRecord?.gstin,
      taxableDiff: raw.taxableDiff ?? invRow.taxablePR - invRow.taxable2B,
      gstDiff: raw.gstDiff ?? (invRow.cgstPR + invRow.sgstPR + invRow.igstPR) - (invRow.cgst2B + invRow.sgst2B + invRow.igst2B),
      onConfirmOverride: (justification) => {
        const newResults = [...results];
        const idx = newResults.findIndex((r) => r === raw);
        const forced: ReconciliationResult = {
          ...raw,
          status: 'Perfect Match',
          gstDiff: 0,
          cgstDiff: 0,
          sgstDiff: 0,
          igstDiff: 0,
          taxableDiff: 0,
          remark: `Force Matched: ${justification}`,
        };
        if (idx !== -1) newResults[idx] = forced;
        else newResults.push(forced);
        onResultsChange(newResults);
        toast.success(`Overrode mismatch for #${invRow.invoiceNoPR || invRow.invoiceNo2B} as Perfect Match`);
      },
    });
  };

  const handleUnlinkMatch = (invRow: PartyInvoiceRow) => {
    if (!onResultsChange || !results || !invRow.rawResult?.prRecord || !invRow.rawResult?.twoBRecord) return;
    const raw = invRow.rawResult;
    setAuditModalState({
      isOpen: true,
      actionType: 'UNLINK',
      targetStatus: 'Not in 2B / Not in Books',
      originalStatus: invRow.status,
      prRecord: raw.prRecord,
      twoBRecord: raw.twoBRecord,
      clientGstin: raw.prRecord?.gstin || raw.twoBRecord?.gstin,
      taxableDiff: raw.taxableDiff,
      gstDiff: raw.gstDiff,
      onConfirmOverride: (justification) => {
        const newResults = results.filter((r) => r !== raw);
        newResults.push(
          {
            prRecord: raw.prRecord,
            status: 'Not in 2B',
            gstDiff: (raw.prRecord!.igst || 0) + (raw.prRecord!.cgst || 0) + (raw.prRecord!.sgst || 0),
            taxableDiff: raw.prRecord!.taxableValue || 0,
            remark: `Unlinked: ${justification}`,
          },
          {
            twoBRecord: raw.twoBRecord,
            status: 'Not in Books',
            gstDiff: -((raw.twoBRecord!.igst || 0) + (raw.twoBRecord!.cgst || 0) + (raw.twoBRecord!.sgst || 0)),
            taxableDiff: -(raw.twoBRecord!.taxableValue || 0),
            remark: `Unlinked: ${justification}`,
          }
        );
        onResultsChange(newResults);
        toast.info(`Unlinked #${raw.prRecord!.invoiceNo} from #${raw.twoBRecord!.invoiceNo}`);
      },
    });
  };

  // AI Smart Match
  const handleRunSmartMatchParty = (party: PartySummary) => {
    const candidates = findSmartMatchesForParty(party);
    if (candidates.length === 0) {
      toast.info(`No high-confidence AI smart matches found for ${party.partyName}`);
      return;
    }
    setSmartMatchCandidates(candidates);
    setSmartMatchModalOpen(true);
  };

  const handleRunSmartMatchInvoice = (targetRow: PartyInvoiceRow, party: PartySummary) => {
    const candidates = findSmartMatchesForInvoice(targetRow, party);
    if (candidates.length === 0) {
      toast.info(`No AI match candidate found for #${targetRow.invoiceNoPR || targetRow.invoiceNo2B || 'Invoice'}`);
      return;
    }
    setSmartMatchCandidates(candidates);
    setSmartMatchModalOpen(true);
  };

  const handleRunSmartMatchAll = () => {
    const candidates = findAllSmartMatches(parties);
    if (candidates.length === 0) {
      toast.info('No unmatched pairs qualify for AI Smart Matching');
      return;
    }
    setSmartMatchCandidates(candidates);
    setSmartMatchModalOpen(true);
  };

  const handleApplySingleSmartMatch = (candidate: SmartMatchCandidate) => {
    if (!onResultsChange || !results) return;
    onResultsChange(applySmartMatch(results, candidate));
    toast.success(`Matched #${candidate.metrics.prInvoiceNo} ↔ #${candidate.metrics.twoBInvoiceNo} (${candidate.confidence}%)`);
    setSmartMatchCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
  };

  const handleApplyBatchSmartMatches = (candidatesToApply: SmartMatchCandidate[]) => {
    if (!onResultsChange || !results || candidatesToApply.length === 0) return;
    const { newResults, appliedCount } = applyBatchSmartMatches(results, candidatesToApply);
    onResultsChange(newResults);
    toast.success(`AI Smart Match linked ${appliedCount} invoice pair(s)`);
    setSmartMatchCandidates((prev) => prev.filter((c) => !candidatesToApply.some((a) => a.id === c.id)));
  };

  // Merge helpers
  const selectedMergeParties = useMemo(
    () => parties.filter((p) => selectedMergeKeys.has(p.key)),
    [parties, selectedMergeKeys]
  );

  const activePrimaryMergeKey = useMemo(() => {
    if (primaryMergeKey && selectedMergeKeys.has(primaryMergeKey)) return primaryMergeKey;
    return selectedMergeParties[0]?.key || '';
  }, [primaryMergeKey, selectedMergeKeys, selectedMergeParties]);

  const handleMergeMultipleParties = () => {
    const targetKey = activePrimaryMergeKey;
    if (!onResultsChange || !results || selectedMergeKeys.size < 2 || !targetKey) return;
    const primaryParty = parties.find((p) => p.key === targetKey);
    if (!primaryParty) return;

    const targetName = primaryParty.partyName || primaryParty.partyNamePR || primaryParty.partyName2B;
    const targetGstin = primaryParty.gstin || primaryParty.gstinPR || primaryParty.gstin2B;

    const sourceKeys = new Set([...selectedMergeKeys].filter((k) => k !== targetKey));
    const sourceRawResults = new Set<ReconciliationResult>();
    for (const sp of parties.filter((p) => sourceKeys.has(p.key))) {
      for (const inv of sp.invoices) {
        if (inv.rawResult) sourceRawResults.add(inv.rawResult);
      }
    }

    const newResults = results.map((r) => {
      if (!sourceRawResults.has(r)) return r;
      const updated = { ...r };
      if (updated.prRecord) {
        updated.prRecord = {
          ...updated.prRecord,
          supplierName: targetName,
          ...(targetGstin && !targetGstin.includes('NO GSTIN') ? { gstin: targetGstin } : {}),
        };
      }
      if (updated.twoBRecord) {
        updated.twoBRecord = {
          ...updated.twoBRecord,
          supplierName: targetName,
          ...(targetGstin && !targetGstin.includes('NO GSTIN') ? { gstin: targetGstin } : {}),
        };
      }
      return updated;
    });

    onResultsChange(newResults);
    toast.success(`Merged ${selectedMergeKeys.size} ledgers into '${targetName}'`);
    setMergeMode(false);
    setSelectedMergeKeys(new Set());
    setPrimaryMergeKey('');
  };

  const toggleMergeSelection = (key: string) => {
    setSelectedMergeKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Exports
  const handleExportPartyWise = () => {
    try {
      const cleanComp = (companyName || 'GST').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanComp}_Party_Wise_Report.xlsx`;
      exportWorkbookAsync({
        type: 'EXPORT_WORKBOOK',
        exportType: 'PARTY_WISE',
        payload: { parties: filtered, filename, companyName },
      }).catch(() => exportPartyWise(filtered, filename, companyName));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to export Party-Wise Excel');
    }
  };

  const handleExport21ColDebitNotes = () => {
    try {
      const pr = debitNotes?.pr || [];
      const twoB = debitNotes?.twoB || [];
      if (pr.length === 0 && twoB.length === 0) {
        toast.error('No Debit/Credit Note records available to export.');
        return;
      }
      const dnResult = reconcileDebitNotes(pr, twoB);
      if (!dnResult.reconciledRows?.length) {
        toast.error('No reconciled debit note rows generated.');
        return;
      }
      const cleanComp = (companyName || 'GST').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanComp}_Reconciled_Debit_Notes_21Col.xlsx`;
      exportWorkbookAsync({
        type: 'EXPORT_WORKBOOK',
        exportType: 'DEBIT_NOTES',
        payload: { rows: dnResult.reconciledRows, filename, companyName },
      }).catch(() => exportDebitNotes21Col(dnResult.reconciledRows, filename, companyName));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to export Debit Notes Excel');
    }
  };

  const hasDebitNotesData = Boolean(debitNotes && ((debitNotes.pr && debitNotes.pr.length > 0) || (debitNotes.twoB && debitNotes.twoB.length > 0)));
  const activeHasUnmatchedPR = Boolean(
    activeParty?.invoices.some((i) => (i.status === 'Not in 2B' || i.status === 'Missing in 2B' || i.status === 'Unmatched Vendor') && i.rawResult?.prRecord)
  );
  const activeHasUnmatched2B = Boolean(
    activeParty?.invoices.some((i) => (i.status === 'Not in Books' || i.status === 'Missing in PR') && i.rawResult?.twoBRecord)
  );

  const booksTaxTotal = activeParty ? activeParty.totals.igstPR + activeParty.totals.cgstPR + activeParty.totals.sgstPR : 0;
  const twoBTaxTotal = activeParty ? activeParty.totals.igst2B + activeParty.totals.cgst2B + activeParty.totals.sgst2B : 0;

  return (
    <div className="space-y-4">
      {/* Clean Slim Top Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" />
              Party-Wise Intelligence
            </h3>
            <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
              {parties.length.toLocaleString('en-IN')} Counterparties
            </span>
            {statusCounts.missing + statusCounts.mismatch > 0 && (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800">
                {statusCounts.missing + statusCounts.mismatch} Need Review
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Pick a vendor on the left to inspect their invoices, match missing pairs, or copy a dispute notice.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Status Pills */}
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
            {([
              { key: 'all', label: 'All', count: statusCounts.all },
              { key: 'missing', label: 'Missing', count: statusCounts.missing },
              { key: 'mismatch', label: 'Mismatch', count: statusCounts.mismatch },
              { key: 'matched', label: 'Matched', count: statusCounts.matched },
              ...(statusCounts.dn > 0 ? [{ key: 'debitNotes' as const, label: 'Debit Notes', count: statusCounts.dn }] : []),
            ] as const).map((pill) => {
              const active = statusFilter === pill.key;
              return (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => setStatusFilter(pill.key)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5',
                    active ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <span>{pill.label}</span>
                  <span className={cn('text-[10px] font-mono', active ? 'text-indigo-600' : 'text-slate-400')}>
                    {pill.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Grouping Switch */}
          <div className="flex p-1 rounded-xl bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setGroupBy('gstin')}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer',
                groupBy === 'gstin' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              By GSTIN
            </button>
            <button
              type="button"
              onClick={() => setGroupBy('name')}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1',
                groupBy === 'name' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              )}
              title="Combine branch GSTINs under the same party name"
            >
              <Users className="w-3 h-3" />
              By Name
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportPartyWise}
            className="h-8 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            Export Excel
          </button>

          {!!onResultsChange && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-8 px-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Tools</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-white border-slate-200 text-slate-900 rounded-xl shadow-xl">
                <DropdownMenuItem onClick={handleRunSmartMatchAll} className="cursor-pointer gap-2 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  AI Smart Match All Parties
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleAutoMatchAll} className="cursor-pointer gap-2 text-xs font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Auto-Match Suggested Pairs
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    if (mergeMode) {
                      setMergeMode(false);
                      setSelectedMergeKeys(new Set());
                    } else {
                      setMergeMode(true);
                    }
                  }}
                  className="cursor-pointer gap-2 text-xs font-semibold"
                >
                  <GitMerge className="w-3.5 h-3.5 text-purple-600" />
                  {mergeMode ? 'Exit Merge Mode' : 'Merge Duplicate Parties'}
                </DropdownMenuItem>
                {hasDebitNotesData && (
                  <DropdownMenuItem onClick={handleExport21ColDebitNotes} className="cursor-pointer gap-2 text-xs font-semibold">
                    <Download className="w-3.5 h-3.5 text-amber-600" />
                    Export 21-Col Debit Notes
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Master-Detail Two-Pane Studio */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-4 items-start">
        {/* LEFT PANE: Clean Counterparty Directory */}
        <aside className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden flex flex-col">
          {/* Search + Sort Header */}
          <div className="p-3 bg-slate-50/80 border-b border-slate-200 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search party name or GSTIN..."
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 outline-none"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-500">
                Showing {Math.min(visiblePartiesCount, filtered.length)} of {filtered.length}
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as PartySortOption)}
                className="h-7 px-2 rounded-lg bg-white border border-slate-200 text-[11px] font-semibold text-slate-700 outline-none cursor-pointer"
                aria-label="Sort counterparties"
              >
                <option value="var_desc">Highest Variance First</option>
                <option value="name_asc">Name A → Z</option>
                <option value="name_desc">Name Z → A</option>
                <option value="count_desc">Most Invoices</option>
                <option value="var_asc">Lowest Variance First</option>
              </select>
            </div>
          </div>

          {/* Merge Mode Inline Helper */}
          {mergeMode && (
            <div className="p-3 bg-purple-50 border-b border-purple-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                  <GitMerge className="w-3.5 h-3.5 text-purple-600" />
                  Select 2+ parties to merge ({selectedMergeKeys.size})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setMergeMode(false);
                    setSelectedMergeKeys(new Set());
                  }}
                  className="text-xs font-bold text-purple-700 hover:text-purple-950 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
              {selectedMergeParties.length >= 2 && (
                <div className="space-y-1.5 pt-1">
                  <select
                    value={activePrimaryMergeKey}
                    onChange={(e) => setPrimaryMergeKey(e.target.value)}
                    className="w-full h-8 px-2 rounded-lg bg-white border border-purple-300 text-xs font-semibold text-slate-900"
                  >
                    {selectedMergeParties.map((sp) => (
                      <option key={sp.key} value={sp.key}>
                        Keep Primary: {sp.partyName || sp.key}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleMergeMultipleParties}
                    className="w-full h-8 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    Merge {selectedMergeKeys.size} Parties Now
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Directory Rows */}
          <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-100">
            {filtered.slice(0, visiblePartiesCount).map((p) => {
              const isSelected = activeParty?.key === p.key;
              const isMergeChecked = selectedMergeKeys.has(p.key);
              const disputeStatus = activeDisputes?.[p.key]?.status;

              return (
                <div
                  key={p.key}
                  className={cn(
                    'w-full px-3.5 py-3 transition-colors flex items-start gap-2.5',
                    isSelected ? 'bg-indigo-50/70 border-l-4 border-l-indigo-600' : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                  )}
                >
                  {mergeMode ? (
                    <input
                      type="checkbox"
                      checked={isMergeChecked}
                      onChange={() => toggleMergeSelection(p.key)}
                      className="w-4 h-4 mt-0.5 rounded border-slate-400 text-purple-600 accent-purple-600 shrink-0 cursor-pointer"
                      aria-label={`Select ${p.partyName} for merge`}
                    />
                  ) : (
                    <span className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', overallDotClass(p.overall))} />
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedPartyKey(p.key)}
                    className="min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={cn('text-xs font-bold truncate', isSelected ? 'text-indigo-950' : 'text-slate-900')}>
                        {p.partyName || '— Unnamed Counterparty —'}
                      </span>
                      <span
                        className={cn(
                          'text-xs font-mono font-bold shrink-0',
                          p.totals.totalDiff === 0
                            ? 'text-emerald-700'
                            : p.overall === 'Has Missing'
                            ? 'text-rose-600'
                            : 'text-amber-700'
                        )}
                      >
                        {p.totals.totalDiff === 0 ? 'Matched' : fmt(p.totals.totalDiff)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className="text-[11px] font-mono text-slate-500 truncate">{p.gstin || 'NO GSTIN'}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {disputeStatus && disputeStatus !== 'No Dispute' && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold uppercase">
                            {disputeStatus}
                          </span>
                        )}
                        <span className="text-[11px] font-medium text-slate-500">{p.totals.count} inv</span>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="p-10 text-center space-y-1">
                <p className="text-xs font-bold text-slate-700">No parties found</p>
                <p className="text-[11px] text-slate-500">Try clearing your search or changing status filter.</p>
              </div>
            )}

            {filtered.length > visiblePartiesCount && (
              <div className="p-3 text-center bg-slate-50">
                <button
                  type="button"
                  onClick={() => setVisiblePartiesCount((prev) => prev + 80)}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                >
                  Load More ({filtered.length - visiblePartiesCount} left)
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT PANE: Focused Party Inspector */}
        <section className="min-w-0 bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
          {activeParty ? (
            <>
              {/* Selected Party Summary Header */}
              <div className="p-5 bg-slate-50/70 border-b border-slate-200 space-y-4">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-lg font-extrabold text-slate-900 truncate">{activeParty.partyName || '— Unnamed Counterparty —'}</h4>
                      <span className={cn('px-2.5 py-0.5 rounded-full text-[11px] font-bold border', overallBadgeClass(activeParty.overall))}>
                        {activeParty.overall}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-600 font-mono flex-wrap">
                      <span>GSTIN: <strong className="text-slate-900">{activeParty.gstin || 'NO GSTIN'}</strong></span>
                      <span>·</span>
                      <span>{activeParty.totals.count} Total Invoices</span>
                      {activeParty.totals.perfectMatch > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-700 font-semibold">{activeParty.totals.perfectMatch} Matched</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Clean 3-Box Financial Strip for Selected Party */}
                  <div className="grid grid-cols-3 gap-2.5 shrink-0">
                    <div className="px-3.5 py-2 rounded-xl bg-white border border-slate-200">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Books Tax</div>
                      <div className="text-sm font-black font-mono text-slate-900 mt-0.5">{fmt(booksTaxTotal)}</div>
                    </div>
                    <div className="px-3.5 py-2 rounded-xl bg-white border border-slate-200">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Portal 2B Tax</div>
                      <div className="text-sm font-black font-mono text-slate-900 mt-0.5">{fmt(twoBTaxTotal)}</div>
                    </div>
                    <div className="px-3.5 py-2 rounded-xl bg-white border border-slate-200">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Variance</div>
                      <div className={cn('text-sm font-black font-mono mt-0.5', activeParty.totals.totalDiff === 0 ? 'text-emerald-700' : 'text-rose-600')}>
                        {activeParty.totals.totalDiff === 0 ? '₹0' : fmt(activeParty.totals.totalDiff)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contextual Party Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70">
                  <div className="flex flex-wrap items-center gap-2">
                    {onResultsChange && activeHasUnmatchedPR && activeHasUnmatched2B && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleRunSmartMatchParty(activeParty)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          AI Smart Match
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAutoMatchParty(activeParty)}
                          className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Auto-Match
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPairMode((v) => !v);
                            setSelectedPRIndex(null);
                            setSelected2BIndex(null);
                          }}
                          className={cn(
                            'px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors',
                            pairMode
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                          )}
                        >
                          <Link className="w-3.5 h-3.5" />
                          {pairMode ? 'Done Pairing' : 'Pair Manually'}
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowTaxSplit((v) => !v)}
                      className={cn(
                        'px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors',
                        showTaxSplit
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
                      )}
                    >
                      {showTaxSplit ? 'Hide IGST/CGST/SGST Split' : 'Show IGST/CGST/SGST Split'}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const missingCount = activeParty.invoices.filter((i) => i.status.includes('Missing') || i.status.includes('Not in')).length;
                      const text = `Notice to ${activeParty.partyName} (GSTIN: ${activeParty.gstin}): You have ${missingCount} invoice differences totalling ${fmtExact(activeParty.totals.totalDiff)} in GSTR-2B reconciliation. Kindly reconcile or amend in GSTR-1.`;
                      navigator.clipboard?.writeText(text);
                      const prev = activeDisputes?.[activeParty.key] || { note: '' };
                      handleDisputesChange({
                        ...activeDisputes,
                        [activeParty.key]: {
                          ...prev,
                          status: 'Notice Dispatched',
                          partyName: activeParty.partyName,
                          gstin: activeParty.gstin,
                          noticeDispatchedAt: new Date().toISOString(),
                          updatedAt: new Date().toISOString(),
                        },
                      });
                      toast.success(`Dispute notice copied for ${activeParty.partyName}!`);
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy Vendor Notice
                  </button>
                </div>
              </div>

              {/* Contextual Manual Pairing Bar (Only visible when Pair Manually is enabled) */}
              {pairMode && (
                <div className="px-5 py-3 bg-emerald-50/80 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-emerald-950 font-medium">
                    Select <strong>1 Books</strong> invoice and <strong>1 Portal 2B</strong> invoice using the radio buttons below to link them.
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedPRIndex !== null && selected2BIndex !== null && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const prInv = activeParty.invoices[selectedPRIndex];
                            const twoBInv = activeParty.invoices[selected2BIndex];
                            if (prInv && twoBInv) {
                              setStagedPairs([...stagedPairs, { pr: prInv, twoB: twoBInv, prIndex: selectedPRIndex, twoBIndex: selected2BIndex }]);
                              setSelectedPRIndex(null);
                              setSelected2BIndex(null);
                            }
                          }}
                          className="px-3 py-1.5 bg-white border border-emerald-300 text-emerald-800 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Stage Pair
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const prInv = activeParty.invoices[selectedPRIndex];
                            const twoBInv = activeParty.invoices[selected2BIndex];
                            if (prInv && twoBInv) {
                              handleManualMatch(prInv, twoBInv);
                              setSelectedPRIndex(null);
                              setSelected2BIndex(null);
                            }
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Link className="w-3.5 h-3.5" /> Match Now
                        </button>
                      </>
                    )}
                    {stagedPairs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          handleBatchMatch(stagedPairs.map((p) => ({ pr: p.pr, twoB: p.twoB })));
                          setStagedPairs([]);
                        }}
                        className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold cursor-pointer"
                      >
                        Apply {stagedPairs.length} Staged Pair(s)
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Clean, Focused Invoice Comparison Table */}
              <div className="overflow-x-auto max-h-[520px]">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-600 font-bold">
                    <tr>
                      {pairMode && <th className="py-2.5 px-3 text-center w-12">Pair</th>}
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Books Invoice</th>
                      <th className="py-2.5 px-3">Portal 2B Invoice</th>
                      <th className="py-2.5 px-3 text-right">Taxable (PR / 2B)</th>
                      {!showTaxSplit ? (
                        <th className="py-2.5 px-3 text-right">Tax (PR / 2B)</th>
                      ) : (
                        <>
                          <th className="py-2.5 px-2.5 text-right">IGST (PR / 2B)</th>
                          <th className="py-2.5 px-2.5 text-right">CGST (PR / 2B)</th>
                          <th className="py-2.5 px-2.5 text-right">SGST (PR / 2B)</th>
                        </>
                      )}
                      <th className="py-2.5 px-3 text-right">Tax Diff</th>
                      {onResultsChange && <th className="py-2.5 px-3 text-center">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {activeParty.invoices.map((inv, i) => {
                      const isUnmatchedPR = (inv.status === 'Not in 2B' || inv.status === 'Missing in 2B' || inv.status === 'Unmatched Vendor') && !!inv.rawResult?.prRecord;
                      const isUnmatched2B = (inv.status === 'Not in Books' || inv.status === 'Missing in PR') && !!inv.rawResult?.twoBRecord;
                      const isMatchedPair = !!inv.rawResult?.prRecord && !!inv.rawResult?.twoBRecord;
                      const isMismatchPair = isMatchedPair && inv.status === 'Value Mismatch';

                      const prTax = inv.igstPR + inv.cgstPR + inv.sgstPR;
                      const tbTax = inv.igst2B + inv.cgst2B + inv.sgst2B;
                      const taxDiff = prTax - tbTax;
                      const isBatchRow = inv.status?.includes('Consolidated Batch') || !!inv.batchLabel;
                      const isBatchLead = isBatchRow && !inv.isSubRow;
                      const isBatchSub = isBatchRow && !!inv.isSubRow;

                      const stagedIdx = stagedPairs.findIndex((p) => p.prIndex === i || p.twoBIndex === i);

                      return (
                        <tr
                          key={i}
                          className={cn(
                            'hover:bg-slate-50/80 transition-colors',
                            selectedPRIndex === i && 'bg-emerald-50/70',
                            selected2BIndex === i && 'bg-purple-50/70',
                            stagedIdx !== -1 && 'bg-emerald-50/50',
                            isBatchRow && 'border-l-4 border-l-amber-400 bg-amber-50/40'
                          )}
                        >
                          {pairMode && (
                            <td className="py-2.5 px-3 text-center">
                              {stagedIdx !== -1 ? (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                  #{stagedIdx + 1}
                                </span>
                              ) : isUnmatchedPR ? (
                                <input
                                  type="radio"
                                  name={`pr_${activeParty.key}`}
                                  checked={selectedPRIndex === i}
                                  onChange={() => setSelectedPRIndex(selectedPRIndex === i ? null : i)}
                                  className="accent-emerald-600 cursor-pointer"
                                  title="Select Books invoice"
                                />
                              ) : isUnmatched2B ? (
                                <input
                                  type="radio"
                                  name={`tb_${activeParty.key}`}
                                  checked={selected2BIndex === i}
                                  onChange={() => setSelected2BIndex(selected2BIndex === i ? null : i)}
                                  className="accent-purple-600 cursor-pointer"
                                  title="Select Portal 2B invoice"
                                />
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          )}

                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <StatusBadge status={inv.status as MatchStatus} />
                          </td>

                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {isBatchLead ? (
                              <div className="flex items-center gap-1.5 font-mono font-semibold text-slate-900">
                                <span>{inv.invoiceNoPR || '—'}</span>
                                <BatchBadge isLead={true} />
                              </div>
                            ) : isBatchSub ? (
                              <BatchBadge isSubRow={true} />
                            ) : (
                              <>
                                <div className="font-mono font-semibold text-slate-900">{inv.invoiceNoPR || '—'}</div>
                                <div className="text-[11px] text-slate-500">{inv.invoiceDatePR || ''}</div>
                              </>
                            )}
                          </td>

                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="font-mono font-semibold text-indigo-700">{inv.invoiceNo2B || '—'}</div>
                            <div className="text-[11px] text-slate-500">{inv.invoiceDate2B || ''}</div>
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                            <div className="text-slate-900 font-semibold">{fmt(inv.taxablePR)}</div>
                            <div className="text-[11px] text-slate-500">{fmt(inv.taxable2B)}</div>
                          </td>

                          {!showTaxSplit ? (
                            <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                              <div className="text-slate-900 font-semibold">{fmt(prTax)}</div>
                              <div className="text-[11px] text-slate-500">{fmt(tbTax)}</div>
                            </td>
                          ) : (
                            <>
                              <td className="py-2.5 px-2.5 text-right font-mono whitespace-nowrap">
                                <div className="text-slate-900">{fmt(inv.igstPR)}</div>
                                <div className="text-[11px] text-slate-500">{fmt(inv.igst2B)}</div>
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono whitespace-nowrap">
                                <div className="text-slate-900">{fmt(inv.cgstPR)}</div>
                                <div className="text-[11px] text-slate-500">{fmt(inv.cgst2B)}</div>
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono whitespace-nowrap">
                                <div className="text-slate-900">{fmt(inv.sgstPR)}</div>
                                <div className="text-[11px] text-slate-500">{fmt(inv.sgst2B)}</div>
                              </td>
                            </>
                          )}

                          <td
                            className={cn(
                              'py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap',
                              Math.abs(taxDiff) < 1 ? 'text-emerald-700' : taxDiff > 0 ? 'text-rose-600' : 'text-amber-700'
                            )}
                          >
                            {Math.abs(taxDiff) < 1 ? '₹0' : fmtExact(taxDiff)}
                          </td>

                          {onResultsChange && (
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              <div className="inline-flex items-center gap-1">
                                {(isUnmatchedPR || isUnmatched2B) && (
                                  <button
                                    type="button"
                                    onClick={() => handleRunSmartMatchInvoice(inv, activeParty)}
                                    className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                    title="Find AI match for this invoice"
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    AI
                                  </button>
                                )}
                                {isMismatchPair && (
                                  <button
                                    type="button"
                                    onClick={() => handleForceMatch(inv)}
                                    className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-pointer"
                                    title="Force Match with Audit Justification"
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {isMatchedPair && (
                                  <button
                                    type="button"
                                    onClick={() => handleUnlinkMatch(inv)}
                                    className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 cursor-pointer"
                                    title="Unlink matched pair"
                                  >
                                    <Unlink className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Compact Dispute & Resolution Note Bar */}
              <div className="p-4 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Dispute Status:</span>
                  <select
                    value={activeDisputes?.[activeParty.key]?.status || 'No Dispute'}
                    onChange={(e) => {
                      const prev = activeDisputes?.[activeParty.key] || { note: '' };
                      handleDisputesChange({
                        ...activeDisputes,
                        [activeParty.key]: {
                          ...prev,
                          status: e.target.value,
                          partyName: activeParty.partyName,
                          gstin: activeParty.gstin,
                          updatedAt: new Date().toISOString(),
                        },
                      });
                    }}
                    className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-800 outline-none cursor-pointer"
                  >
                    <option value="No Dispute">No Dispute</option>
                    <option value="Under Review">Under Review</option>
                    <option value="Dispute Raised">Dispute Raised</option>
                    <option value="Notice Dispatched">Notice Dispatched</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </div>
                <input
                  type="text"
                  placeholder="Add remark or vendor follow-up note..."
                  value={activeDisputes?.[activeParty.key]?.note || ''}
                  onChange={(e) => {
                    const prev = activeDisputes?.[activeParty.key] || { status: 'Under Review' };
                    handleDisputesChange({
                      ...activeDisputes,
                      [activeParty.key]: {
                        ...prev,
                        note: e.target.value,
                        partyName: activeParty.partyName,
                        gstin: activeParty.gstin,
                        updatedAt: new Date().toISOString(),
                      },
                    });
                  }}
                  className="flex-1 h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 outline-none"
                />
              </div>
            </>
          ) : (
            <div className="p-16 text-center space-y-2">
              <Building2 className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">No Party Selected</p>
              <p className="text-xs text-slate-500">Adjust your search or status filter on the left to view party details.</p>
            </div>
          )}
        </section>
      </div>

      {/* AI Smart Match Solver Modal */}
      <AiSmartMatchModal
        isOpen={smartMatchModalOpen}
        onClose={() => setSmartMatchModalOpen(false)}
        candidates={smartMatchCandidates}
        onApplyMatch={handleApplySingleSmartMatch}
        onApplyAllHighConfidence={handleApplyBatchSmartMatches}
      />

      {/* Statutory Override Justification Modal */}
      <AuditJustificationModal
        isOpen={auditModalState.isOpen}
        onClose={() => setAuditModalState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={(justification, auditRecord) => auditModalState.onConfirmOverride?.(justification, auditRecord)}
        actionType={auditModalState.actionType}
        targetStatus={auditModalState.targetStatus}
        originalStatus={auditModalState.originalStatus}
        prRecord={auditModalState.prRecord}
        twoBRecord={auditModalState.twoBRecord}
        companyName={companyName}
        clientGstin={auditModalState.clientGstin}
        taxableDiff={auditModalState.taxableDiff}
        gstDiff={auditModalState.gstDiff}
      />
    </div>
  );
}
