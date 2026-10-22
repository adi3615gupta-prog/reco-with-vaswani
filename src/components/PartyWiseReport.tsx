// Party-wise Intelligence & Manual Match Studio component
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Search, ArrowUpDown, Download, Link, Unlink, Sparkles, CheckCircle2, ShieldCheck, Users, Plus, GitMerge, X, Check, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { aggregateByParty, type PartySummary, type PartyInvoiceRow } from '@/lib/partyWise';
import { exportPartyWise, exportDebitNotes21Col, exportWorkbookAsync } from '@/lib/fileParser';
import { reconcileDebitNotes } from '@/lib/debitNoteEngine';
import { BatchBadge } from '@/components/StatusBadge';
import type { ReconciliationResult, MatchStatus } from '@/lib/reconciliation';
import { toast } from 'sonner';
import { AuditJustificationModal } from '@/components/AuditJustificationModal';
import type { AuditActionType, AuditOverrideRecord } from '@/lib/auditTrailService';

interface Props {
  results: ReconciliationResult[];
  companyName: string;
  mode?: 'input' | 'output';
  debitNotes?: { pr?: any[]; twoB?: any[] };
  onResultsChange?: (newResults: ReconciliationResult[]) => void;
}

const fmt = (n: number) =>
  n === 0 ? '—' : new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function statusBadge(status: PartySummary['overall']) {
  if (status === 'All Matched') return 'bg-success/10 text-success border-success/20';
  if (status === 'Has Mismatches') return 'bg-warning/10 text-warning border-warning/20';
  return 'bg-destructive/10 text-destructive border-destructive/20';
}

function statusStrip(status: PartySummary['overall']) {
  if (status === 'All Matched') return 'from-success/40 via-success/20 to-transparent';
  if (status === 'Has Mismatches') return 'from-warning/40 via-warning/20 to-transparent';
  return 'from-destructive/40 via-destructive/20 to-transparent';
}

function rowStatusColor(status: string) {
  if (status.includes('Debit Note')) return 'text-amber-400 font-bold';
  if (status === 'Perfect Match' || status === 'Matched' || status === 'Matched (Rounded)' || status === 'Matched (Diff Date)') return 'text-[var(--np-green)]';
  if (status === 'Value Mismatch' || status === 'Mismatch') return 'text-yellow-500';
  if (status === 'Not in Books' || status === 'Missing in PR') return 'text-[#A87EE8]';
  return 'text-[var(--np-red)]';
}

export type PartySortOption = 'name_asc' | 'name_desc' | 'var_desc' | 'var_asc' | 'count_desc';
export type PartyStatusFilter = 'all' | 'missing' | 'mismatch' | 'matched' | 'debitNotes';

export function PartyWiseReport({ results, companyName, mode = 'input', debitNotes, onResultsChange }: Props) {
  const [groupBy, setGroupBy] = useState<'gstin' | 'name'>('gstin');
  const parties = useMemo(() => aggregateByParty(results, debitNotes, mode, groupBy), [results, debitNotes, mode, groupBy]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<PartySortOption>('name_asc');
  const [statusFilter, setStatusFilter] = useState<PartyStatusFilter>('all');

  // Merge mode state: multi-select parties via checkboxes
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedMergeKeys, setSelectedMergeKeys] = useState<Set<string>>(new Set());
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [primaryMergeKey, setPrimaryMergeKey] = useState<string>('');
  const [visiblePartiesCount, setVisiblePartiesCount] = useState<number>(50);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = parties;

    if (statusFilter !== 'all') {
      if (statusFilter === 'missing') list = list.filter((p) => p.overall === 'Has Missing');
      else if (statusFilter === 'mismatch') list = list.filter((p) => p.overall === 'Has Mismatches');
      else if (statusFilter === 'matched') list = list.filter((p) => p.overall === 'All Matched');
      else if (statusFilter === 'debitNotes') {
        list = list.filter((p) =>
          p.invoices.some(
            (inv) =>
              String(inv.status || '').toLowerCase().includes('debit note') ||
              inv.invoiceNoPR?.toLowerCase().includes('dn') ||
              inv.invoiceNo2B?.toLowerCase().includes('dn') ||
              inv.remark?.toLowerCase().includes('debit note') ||
              (inv.taxablePR !== undefined && inv.taxablePR < 0) ||
              (inv.taxable2B !== undefined && inv.taxable2B < 0) ||
              (inv.invoiceValuePR !== undefined && inv.invoiceValuePR < 0) ||
              (inv.invoiceValue2B !== undefined && inv.invoiceValue2B < 0)
          )
        );
      }
    }

    if (q) {
      list = list.filter(
        (p) => p.partyName.toLowerCase().includes(q) || p.gstin.toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      if (sortBy === 'name_asc') {
        return (a.partyName || a.key).localeCompare(b.partyName || b.key);
      }
      if (sortBy === 'name_desc') {
        return (b.partyName || b.key).localeCompare(a.partyName || a.key);
      }
      if (sortBy === 'var_desc') {
        return b.totals.totalDiff - a.totals.totalDiff;
      }
      if (sortBy === 'var_asc') {
        return a.totals.totalDiff - b.totals.totalDiff;
      }
      if (sortBy === 'count_desc') {
        return b.totals.count - a.totals.count;
      }
      return 0;
    });

    return list;
  }, [parties, search, sortBy, statusFilter]);

  const handleManualMatch = (prInvRow: PartyInvoiceRow, twoBInvRow: PartyInvoiceRow) => {
    if (!onResultsChange || !results) return;

    const prRaw = prInvRow.rawResult;
    const twoBRaw = twoBInvRow.rawResult;
    if (!prRaw || !twoBRaw) return;

    const newResults = results.filter((r) => r !== twoBRaw);
    const prIndex = newResults.findIndex((r) => r === prRaw);

    if (prIndex !== -1) {
      const prRec = prRaw.prRecord;
      const tbRec = twoBRaw.twoBRecord;

      const prIgst = prRec?.igst ?? 0;
      const tbIgst = tbRec?.igst ?? 0;
      const prCgst = prRec?.cgst ?? 0;
      const tbCgst = tbRec?.cgst ?? 0;
      const prSgst = prRec?.sgst ?? 0;
      const tbSgst = tbRec?.sgst ?? 0;
      const prTaxable = prRec?.taxableValue ?? 0;
      const tbTaxable = tbRec?.taxableValue ?? 0;

      const igstDiff = +(prIgst - tbIgst).toFixed(2);
      const cgstDiff = +(prCgst - tbCgst).toFixed(2);
      const sgstDiff = +(prSgst - tbSgst).toFixed(2);
      const gstDiff = +(Math.abs(igstDiff) + Math.abs(cgstDiff) + Math.abs(sgstDiff)).toFixed(2);
      const taxableDiff = +(prTaxable - tbTaxable).toFixed(2);

      const matchStatus: MatchStatus = gstDiff === 0 && taxableDiff === 0 ? 'Perfect Match' : 'Value Mismatch';

      const mergedResult = {
        ...prRaw,
        prRecord: prRec,
        twoBRecord: tbRec,
        status: matchStatus,
        igstDiff,
        cgstDiff,
        sgstDiff,
        gstDiff,
        taxableDiff,
        matchMethod: 'Name (Exact)' as const,
        remark: 'Manually Matched by User',
      };

      if (prIndex !== -1) {
        newResults[prIndex] = mergedResult;
      } else {
        newResults.push(mergedResult);
      }

      onResultsChange(newResults);
      toast.success(`Matched PR invoice #${prRec?.invoiceNo || 'N/A'} with 2B invoice #${tbRec?.invoiceNo || 'N/A'}`);
    } else {
      const prRec = prRaw.prRecord;
      const tbRec = twoBRaw.twoBRecord;
      const prIgst = prRec?.igst ?? 0;
      const tbIgst = tbRec?.igst ?? 0;
      const prCgst = prRec?.cgst ?? 0;
      const tbCgst = tbRec?.cgst ?? 0;
      const prSgst = prRec?.sgst ?? 0;
      const tbSgst = tbRec?.sgst ?? 0;
      const prTaxable = prRec?.taxableValue ?? 0;
      const tbTaxable = tbRec?.taxableValue ?? 0;

      const igstDiff = +(prIgst - tbIgst).toFixed(2);
      const cgstDiff = +(prCgst - tbCgst).toFixed(2);
      const sgstDiff = +(prSgst - tbSgst).toFixed(2);
      const gstDiff = +(Math.abs(igstDiff) + Math.abs(cgstDiff) + Math.abs(sgstDiff)).toFixed(2);
      const taxableDiff = +(prTaxable - tbTaxable).toFixed(2);
      const matchStatus: MatchStatus = gstDiff === 0 && taxableDiff === 0 ? 'Perfect Match' : 'Value Mismatch';

      newResults.push({
        ...prRaw,
        prRecord: prRec,
        twoBRecord: tbRec,
        status: matchStatus,
        igstDiff,
        cgstDiff,
        sgstDiff,
        gstDiff,
        taxableDiff,
        matchMethod: 'Name (Exact)' as const,
        remark: 'Manually Matched by User',
      });
      onResultsChange(newResults);
      toast.success(`Matched PR invoice #${prRec?.invoiceNo || 'N/A'} with 2B invoice #${tbRec?.invoiceNo || 'N/A'}`);
    }
  };

  const handleForceMatch = (invRow: PartyInvoiceRow) => {
    if (!onResultsChange || !results) return;
    const raw = invRow.rawResult;
    if (!raw) return;

    setAuditModalState({
      isOpen: true,
      actionType: 'FORCE_MATCH',
      targetStatus: 'Perfect Match',
      originalStatus: invRow.status,
      prRecord: raw.prRecord || { invoiceNo: invRow.invoiceNoPR, taxableValue: invRow.taxablePR },
      twoBRecord: raw.twoBRecord || { invoiceNo: invRow.invoiceNo2B, taxableValue: invRow.taxable2B },
      clientGstin: raw.prRecord?.gstin || raw.twoBRecord?.gstin,
      taxableDiff: invRow.taxableDiff,
      gstDiff: invRow.totalDiff,
      onConfirmOverride: (justification) => {
        const newResults = [...results];
        const idx = newResults.findIndex((r) => r === raw);
        const forceMatchedItem = {
          ...raw,
          status: 'Perfect Match' as MatchStatus,
          gstDiff: 0,
          cgstDiff: 0,
          sgstDiff: 0,
          igstDiff: 0,
          taxableDiff: 0,
          remark: `Force Matched: ${justification}`,
        };
        if (idx !== -1) {
          newResults[idx] = forceMatchedItem;
        } else {
          newResults.push(forceMatchedItem);
        }
        onResultsChange(newResults);
        toast.success(`Overrode mismatch for invoice #${invRow.invoiceNoPR || invRow.invoiceNo2B} as Perfect Match`);
      },
    });
  };

  const handleUnlinkMatch = (invRow: PartyInvoiceRow) => {
    if (!onResultsChange || !results) return;
    const raw = invRow.rawResult;
    if (!raw || !raw.prRecord || !raw.twoBRecord) return;

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
        const prRes: ReconciliationResult = {
          prRecord: raw.prRecord,
          status: 'Not in 2B',
          gstDiff: (raw.prRecord.igst || 0) + (raw.prRecord.cgst || 0) + (raw.prRecord.sgst || 0),
          taxableDiff: raw.prRecord.taxableValue || 0,
          remark: `Unlinked: ${justification}`,
        };
        const twoBRes: ReconciliationResult = {
          twoBRecord: raw.twoBRecord,
          status: 'Not in Books',
          gstDiff: -((raw.twoBRecord.igst || 0) + (raw.twoBRecord.cgst || 0) + (raw.twoBRecord.sgst || 0)),
          taxableDiff: -(raw.twoBRecord.taxableValue || 0),
          remark: `Unlinked: ${justification}`,
        };

        newResults.push(prRes, twoBRes);
        onResultsChange(newResults);
        toast.info(`Unlinked invoice #${raw.prRecord.invoiceNo} from 2B invoice #${raw.twoBRecord.invoiceNo}`);
      },
    });
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
      toast.info('No unmatched PR & 2B invoice pairs available to auto-match');
      return;
    }

    let matchedCount = 0;
    let newResults = [...results];
    const used2B = new Set<ReconciliationResult>();

    for (const prRow of unmatchedPR) {
      const prRaw = prRow.rawResult!;
      const prGst = prRow.igstPR + prRow.cgstPR + prRow.sgstPR;
      const prTaxable = prRow.taxablePR;

      const match2B = unmatched2B.find((bRow) => {
        if (used2B.has(bRow.rawResult!)) return false;
        const bGst = bRow.igst2B + bRow.cgst2B + bRow.sgst2B;
        const bTaxable = bRow.taxable2B;
        const prNo = (prRow.invoiceNoPR || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const bNo = (bRow.invoiceNo2B || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const noMatch = prNo.length > 0 && bNo.length > 0 && (bNo.includes(prNo) || prNo.includes(bNo));
        return Math.abs(prGst - bGst) < 1 || Math.abs(prTaxable - bTaxable) < 1 || noMatch;
      });

      if (match2B && match2B.rawResult) {
        used2B.add(match2B.rawResult);
        newResults = newResults.filter((r) => r !== match2B.rawResult);
        const prIndex = newResults.findIndex((r) => r === prRaw);

        const prRec = prRaw.prRecord;
        const tbRec = match2B.rawResult.twoBRecord;

        const igstDiff = +((prRec?.igst ?? 0) - (tbRec?.igst ?? 0)).toFixed(2);
        const cgstDiff = +((prRec?.cgst ?? 0) - (tbRec?.cgst ?? 0)).toFixed(2);
        const sgstDiff = +((prRec?.sgst ?? 0) - (tbRec?.sgst ?? 0)).toFixed(2);
        const gstDiff = +(Math.abs(igstDiff) + Math.abs(cgstDiff) + Math.abs(sgstDiff)).toFixed(2);
        const taxableDiff = +((prRec?.taxableValue ?? 0) - (tbRec?.taxableValue ?? 0)).toFixed(2);

        const matchStatus: MatchStatus = gstDiff === 0 && taxableDiff === 0 ? 'Perfect Match' : 'Value Mismatch';

        const mergedAutoRes = {
          ...prRaw,
          prRecord: prRec,
          twoBRecord: tbRec,
          status: matchStatus,
          igstDiff,
          cgstDiff,
          sgstDiff,
          gstDiff,
          taxableDiff,
          matchMethod: 'Name (Exact)' as const,
          remark: 'Auto-Matched by System',
        };

        if (prIndex !== -1) {
          newResults[prIndex] = mergedAutoRes;
        } else {
          newResults.push(mergedAutoRes);
        }
        matchedCount++;
      }
    }

    if (matchedCount > 0) {
      onResultsChange(newResults);
      toast.success(`Auto-matched ${matchedCount} invoice pair(s) for ${party.partyName}`);
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
        const prTaxable = prRow.taxablePR;

        const match2B = unmatched2B.find((bRow) => {
          if (used2B.has(bRow.rawResult!)) return false;
          const bGst = bRow.igst2B + bRow.cgst2B + bRow.sgst2B;
          const bTaxable = bRow.taxable2B;
          const prNo = (prRow.invoiceNoPR || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const bNo = (bRow.invoiceNo2B || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const noMatch = prNo.length > 0 && bNo.length > 0 && (bNo.includes(prNo) || prNo.includes(bNo));
          return Math.abs(prGst - bGst) < 1 || Math.abs(prTaxable - bTaxable) < 1 || noMatch;
        });

        if (match2B && match2B.rawResult) {
          used2B.add(match2B.rawResult);
          newResults = newResults.filter((r) => r !== match2B.rawResult);
          const prIndex = newResults.findIndex((r) => r === prRaw);

          if (prIndex !== -1) {
            const prRec = prRaw.prRecord;
            const tbRec = match2B.rawResult.twoBRecord;

            const igstDiff = +((prRec?.igst ?? 0) - (tbRec?.igst ?? 0)).toFixed(2);
            const cgstDiff = +((prRec?.cgst ?? 0) - (tbRec?.cgst ?? 0)).toFixed(2);
            const sgstDiff = +((prRec?.sgst ?? 0) - (tbRec?.sgst ?? 0)).toFixed(2);
            const gstDiff = +(Math.abs(igstDiff) + Math.abs(cgstDiff) + Math.abs(sgstDiff)).toFixed(2);
            const taxableDiff = +((prRec?.taxableValue ?? 0) - (tbRec?.taxableValue ?? 0)).toFixed(2);

            const matchStatus: MatchStatus = gstDiff === 0 && taxableDiff === 0 ? 'Perfect Match' : 'Value Mismatch';

            newResults[prIndex] = {
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
              remark: 'Auto-Matched by System',
            };
            totalMatched++;
          }
        }
      }
    }

    if (totalMatched > 0) {
      onResultsChange(newResults);
      toast.success(`Auto-matched ${totalMatched} invoice pair(s) across all counterparties!`);
    } else {
      toast.info('No remaining matching invoice pairs found across any party');
    }
  };

  const handleBatchMatch = (stagedPairs: Array<{ pr: PartyInvoiceRow; twoB: PartyInvoiceRow }>) => {
    if (!onResultsChange || !results || stagedPairs.length === 0) return;

    let newResults = [...results];
    let matchCount = 0;

    for (const pair of stagedPairs) {
      const prRaw = pair.pr.rawResult;
      const twoBRaw = pair.twoB.rawResult;
      if (!prRaw || !twoBRaw) continue;

      newResults = newResults.filter((r) => r !== twoBRaw);
      const prIndex = newResults.findIndex((r) => r === prRaw);

      if (prIndex !== -1) {
        const prRec = prRaw.prRecord;
        const tbRec = twoBRaw.twoBRecord;

        const prIgst = prRec?.igst ?? 0;
        const tbIgst = tbRec?.igst ?? 0;
        const prCgst = prRec?.cgst ?? 0;
        const tbCgst = tbRec?.cgst ?? 0;
        const prSgst = prRec?.sgst ?? 0;
        const tbSgst = tbRec?.sgst ?? 0;
        const prTaxable = prRec?.taxableValue ?? 0;
        const tbTaxable = tbRec?.taxableValue ?? 0;

        const igstDiff = +(prIgst - tbIgst).toFixed(2);
        const cgstDiff = +(prCgst - tbCgst).toFixed(2);
        const sgstDiff = +(prSgst - tbSgst).toFixed(2);
        const gstDiff = +(Math.abs(igstDiff) + Math.abs(cgstDiff) + Math.abs(sgstDiff)).toFixed(2);
        const taxableDiff = +(prTaxable - tbTaxable).toFixed(2);

        const matchStatus: MatchStatus = gstDiff === 0 && taxableDiff === 0 ? 'Perfect Match' : 'Value Mismatch';

        newResults[prIndex] = {
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
          remark: 'Batch Matched by User',
        };
        matchCount++;
      }
    }

    if (matchCount > 0) {
      onResultsChange(newResults);
      toast.success(`Batch matched ${matchCount} invoice pair(s) successfully!`);
    }
  };

  const handleMergeParties = (sourceParty: PartySummary, targetPartyKey: string) => {
    if (!onResultsChange || !results) return;
    const targetParty = parties.find((p) => p.key === targetPartyKey);
    if (!targetParty) return;

    const targetName = targetParty.partyName || targetParty.partyNamePR || targetParty.partyName2B;
    const targetGstin = targetParty.gstin || targetParty.gstinPR || targetParty.gstin2B;

    const sourceRawResults = new Set(
      sourceParty.invoices.map((inv) => inv.rawResult).filter((r): r is ReconciliationResult => Boolean(r))
    );

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
    toast.success(`Merged '${sourceParty.partyName}' into '${targetName}' successfully!`);
  };

  const selectedMergeParties = useMemo(
    () => parties.filter((p) => selectedMergeKeys.has(p.key)),
    [parties, selectedMergeKeys]
  );

  const activePrimaryMergeKey = useMemo(() => {
    if (primaryMergeKey && selectedMergeKeys.has(primaryMergeKey)) {
      return primaryMergeKey;
    }
    return selectedMergeParties[0]?.key || '';
  }, [primaryMergeKey, selectedMergeKeys, selectedMergeParties]);

  /** Merge multiple selected parties into the chosen primary party */
  const handleMergeMultipleParties = () => {
    const targetKey = activePrimaryMergeKey;
    if (!onResultsChange || !results || selectedMergeKeys.size < 2 || !targetKey) return;
    const primaryParty = parties.find((p) => p.key === targetKey);
    if (!primaryParty) return;

    const targetName = primaryParty.partyName || primaryParty.partyNamePR || primaryParty.partyName2B;
    const targetGstin = primaryParty.gstin || primaryParty.gstinPR || primaryParty.gstin2B;

    // Collect all raw results from non-primary selected parties
    const sourceKeys = new Set([...selectedMergeKeys].filter((k) => k !== targetKey));
    const sourceParties = parties.filter((p) => sourceKeys.has(p.key));
    const sourceRawResults = new Set<ReconciliationResult>();
    const mergedNames: string[] = [];
    for (const sp of sourceParties) {
      mergedNames.push(sp.partyName || sp.key);
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
    toast.success(`Merged ${mergedNames.join(', ')} → '${targetName}' (${sourceRawResults.size} invoices reassigned)`);

    // Reset merge state
    setMergeMode(false);
    setSelectedMergeKeys(new Set());
    setShowMergeConfirm(false);
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

  const handleExport21ColDebitNotes = () => {
    try {
      const pr = debitNotes?.pr || [];
      const twoB = debitNotes?.twoB || [];
      if (pr.length === 0 && twoB.length === 0) {
        toast.error('No Debit/Credit Note records available to export.');
        return;
      }
      const dnResult = reconcileDebitNotes(pr, twoB);
      if (!dnResult.reconciledRows || dnResult.reconciledRows.length === 0) {
        toast.error('No reconciled debit note rows generated.');
        return;
      }
      const cleanComp = (companyName || 'GST').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanComp}_Reconciled_Debit_Notes_21Col.xlsx`;
      exportWorkbookAsync({
        type: 'EXPORT_WORKBOOK',
        exportType: 'DEBIT_NOTES',
        payload: {
          rows: dnResult.reconciledRows,
          filename,
          companyName
        }
      }).catch((err) => {
        console.warn('Async worker export failed, falling back to synchronous:', err);
        exportDebitNotes21Col(dnResult.reconciledRows, filename, companyName);
      });
    } catch (err: any) {
      console.error('Failed to export 21-col debit notes:', err);
      toast.error(err?.message || 'Failed to export 21-col Debit Notes Excel');
    }
  };

  const handleExportPartyWise = () => {
    try {
      const cleanComp = (companyName || 'GST').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanComp}_Party_Wise_Report.xlsx`;
      exportWorkbookAsync({
        type: 'EXPORT_WORKBOOK',
        exportType: 'PARTY_WISE',
        payload: {
          parties: filtered,
          filename,
          companyName
        }
      }).catch((err) => {
        console.warn('Async worker export failed, falling back to synchronous:', err);
        exportPartyWise(filtered, filename, companyName);
      });
    } catch (err: any) {
      console.error('Failed to export party-wise report:', err);
      toast.error(err?.message || 'Failed to export Party-Wise Excel');
    }
  };

  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <div className="dash-card overflow-hidden silk-reveal" style={{ animationDelay: '300ms' }}>
      <div className="dash-topbar flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="dash-dots"><span style={{ background: '#3DCC8E' }}></span><span style={{ background: '#F0A030' }}></span></div>
          <span className="text-[10px] font-bold text-[var(--np-text2)] uppercase tracking-widest">Party-wise Intelligence ({filtered.length})</span>

          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/80 p-0.5 rounded-md text-[10px] font-bold">
            <button
              onClick={() => setGroupBy('gstin')}
              className={cn(
                "px-2.5 py-0.5 rounded text-[9.5px] uppercase tracking-wider transition-all",
                groupBy === 'gstin' ? "bg-sky-600 text-white font-bold shadow-sm" : "text-slate-400 hover:text-slate-200"
              )}
              title="Group strictly by 15-digit GSTIN"
            >
              By GSTIN
            </button>
            <button
              onClick={() => setGroupBy('name')}
              className={cn(
                "px-2.5 py-0.5 rounded text-[9.5px] uppercase tracking-wider transition-all flex items-center gap-1",
                groupBy === 'name' ? "bg-purple-600 text-white font-bold shadow-sm" : "text-slate-400 hover:text-slate-200"
              )}
              title="Merge branch GSTINs by Party Name / PAN (Combines SANA RCC PRODUCTS cards into 1)"
            >
              <Users className="w-3 h-3 text-purple-300" />
              By Party Name (Merge Branches)
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!!onResultsChange && (
            <>
              <button
                  onClick={() => {
                    if (mergeMode) {
                      setMergeMode(false);
                      setSelectedMergeKeys(new Set());
                    } else {
                      setMergeMode(true);
                    }
                  }}
                  className={cn(
                    "px-3 py-1 rounded font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow transition-all",
                    mergeMode
                      ? "bg-rose-600/90 hover:bg-rose-500 text-white ring-1 ring-rose-400/50"
                      : "bg-purple-700/80 hover:bg-purple-600 text-white"
                  )}
                  title={mergeMode ? "Exit merge mode" : "Select parties to merge"}
                >
                  {mergeMode ? (
                    <>
                      <X className="w-3.5 h-3.5" />
                      Exit Merge Mode
                    </>
                  ) : (
                    <>
                      <GitMerge className="w-3.5 h-3.5 text-purple-200" />
                      Merge Parties
                    </>
                  )}
                </button>

              <button
                onClick={handleAutoMatchAll}
                className="px-3 py-1 bg-sky-600/90 hover:bg-sky-500 text-white rounded font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow transition-all"
                title="Auto-match all matching invoice pairs across all parties in 1 click"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                Auto-Match All Parties
              </button>
            </>
          )}
          <button
            onClick={handleExportPartyWise}
            className="px-3 py-1 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow transition-all"
            title="Export full Party-Wise Intelligence Report Excel"
          >
            <Download className="w-3.5 h-3.5 text-emerald-200" />
            Export Party Report
          </button>
          {debitNotes && ((debitNotes.pr && debitNotes.pr.length > 0) || (debitNotes.twoB && debitNotes.twoB.length > 0)) && (
            <button
              onClick={handleExport21ColDebitNotes}
              className="px-3 py-1 bg-amber-600/90 hover:bg-amber-500 text-white rounded font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow transition-all"
              title="Export 21-Column Zero-Merge Debit Note Reconciliation Excel"
            >
              <Download className="w-3.5 h-3.5 text-amber-200" />
              Export 21-Col Debit Notes
            </button>
          )}
          <div className="relative w-44 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-sky-400 transition-colors" />
            <input
              placeholder="Search party..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 bg-slate-900 border border-slate-700 rounded-md pl-9 pr-3 text-[11px] font-bold text-white placeholder:text-slate-400 focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 transition-all shadow-sm"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PartyStatusFilter)}
            className="h-8 bg-slate-900 border border-slate-700 rounded-md px-2.5 text-[10.5px] font-bold text-white focus:outline-none focus:border-sky-400 cursor-pointer transition-all uppercase tracking-wider shadow-sm"
            title="Filter parties by status"
          >
            <option value="all" className="bg-slate-900 text-white font-bold">All Statuses</option>
            <option value="missing" className="bg-slate-900 text-white font-bold">Has Missing</option>
            <option value="mismatch" className="bg-slate-900 text-white font-bold">Has Mismatches</option>
            <option value="matched" className="bg-slate-900 text-white font-bold">All Matched</option>
            <option value="debitNotes" className="bg-slate-900 text-amber-400 font-bold">Has Debit Notes</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as PartySortOption)}
            className="h-8 bg-slate-900 border border-slate-700 rounded-md px-2.5 text-[10.5px] font-bold text-white focus:outline-none focus:border-sky-400 cursor-pointer transition-all uppercase tracking-wider shadow-sm"
            title="Sort parties by Name, Variance, or Invoice Count"
          >
            <option value="name_asc" className="bg-slate-900 text-white font-bold">Party A → Z</option>
            <option value="name_desc" className="bg-slate-900 text-white font-bold">Party Z → A</option>
            <option value="var_desc" className="bg-slate-900 text-white font-bold">Variance: High → Low</option>
            <option value="var_asc" className="bg-slate-900 text-white font-bold">Variance: Low → High</option>
            <option value="count_desc" className="bg-slate-900 text-white font-bold">Invoices: High → Low</option>
          </select>
        </div>
      </div>

      {/* Merge mode info banner */}
      {mergeMode && (
        <div className="mx-4 mt-3 mb-1 p-3 bg-purple-950/60 border border-purple-500/30 rounded-lg flex items-center gap-3">
          <GitMerge className="w-5 h-5 text-purple-400 animate-pulse flex-shrink-0" />
          <div>
            <p className="text-[11px] font-bold text-purple-200">MERGE MODE ACTIVE — Select 2 or more party cards to merge</p>
            <p className="text-[10px] text-purple-400/80 mt-0.5">Click the checkboxes next to party names below, then pick which party to keep as primary.</p>
          </div>
          <span className="ml-auto text-[11px] font-mono font-bold text-purple-300 bg-purple-900/60 px-2.5 py-0.5 rounded-full">
            {selectedMergeKeys.size} selected
          </span>
        </div>
      )}

      <div className="divide-y divide-[var(--np-border)]">
        {filtered.slice(0, visiblePartiesCount).map((p) => (
          <PartyCard
            key={p.key}
            party={p}
            isOpen={expandedKey === p.key}
            onToggle={() => setExpandedKey(expandedKey === p.key ? null : p.key)}
            onManualMatch={handleManualMatch}
            onBatchMatch={handleBatchMatch}
            onForceMatch={handleForceMatch}
            onUnlinkMatch={handleUnlinkMatch}
            onAutoMatchParty={handleAutoMatchParty}
            onMergeParties={handleMergeParties}
            allParties={parties}
            canEdit={!!onResultsChange}
            groupBy={groupBy}
            onSetGroupBy={setGroupBy}
            mergeMode={mergeMode}
            isMergeSelected={selectedMergeKeys.has(p.key)}
            onToggleMergeSelect={() => toggleMergeSelection(p.key)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="p-24 text-center text-[10px] font-bold text-[var(--np-text3)] uppercase tracking-widest italic">No matches in repository</div>
        )}
        {filtered.length > visiblePartiesCount && (
          <div className="p-4 text-center bg-slate-900/40 border-t border-slate-800">
            <button
              onClick={() => setVisiblePartiesCount(prev => prev + 100)}
              className="px-6 py-2 rounded-xl bg-purple-600/80 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg hover:scale-105"
            >
              Load More Counterparties (Showing {visiblePartiesCount} of {filtered.length})
            </button>
          </div>
        )}
      </div>

      {/* Screen-Fixed Left Side Margin Floating Merge Controller (Rendered via React Portal into document.body to break out of transformed parent containers) */}
      {mergeMode &&
        createPortal(
          <div className="fixed left-4 top-1/2 -translate-y-1/2 z-[9999] w-56 bg-slate-900/95 border-2 border-purple-500/60 rounded-2xl shadow-[0_0_35px_rgba(168,85,247,0.35)] backdrop-blur-xl p-3.5 flex flex-col gap-3 animate-in slide-in-from-left duration-300 pointer-events-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-purple-500/30 pb-2">
              <div className="flex items-center gap-2">
                <GitMerge className="w-4 h-4 text-purple-300 animate-pulse flex-shrink-0" />
                <span className="text-[11px] font-black text-white uppercase tracking-wider">Merge Panel</span>
              </div>
              <button
                onClick={() => {
                  setMergeMode(false);
                  setSelectedMergeKeys(new Set());
                }}
                className="w-5 h-5 rounded-full hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 flex items-center justify-center transition-colors"
                title="Exit merge mode"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Selection counter & Party list pills */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9.5px] font-bold uppercase tracking-wider text-purple-300">
                  {selectedMergeKeys.size} {selectedMergeKeys.size === 1 ? 'Party' : 'Parties'} Selected
                </span>
                {selectedMergeKeys.size > 0 && (
                  <button
                    onClick={() => setSelectedMergeKeys(new Set())}
                    className="text-[9px] font-bold text-slate-400 hover:text-rose-400 underline transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              {selectedMergeParties.length > 0 ? (
                <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                  {selectedMergeParties.map((sp) => (
                    <div
                      key={sp.key}
                      className="flex items-center justify-between gap-1 px-2.5 py-1 rounded-lg bg-purple-950/70 border border-purple-500/30 text-[10px] text-purple-200 font-bold shadow-sm"
                    >
                      <span className="truncate" title={sp.partyName || sp.key}>{sp.partyName || sp.key}</span>
                      <button
                        onClick={() => toggleMergeSelection(sp.key)}
                        className="text-purple-400 hover:text-rose-400 font-bold text-xs p-0.5 leading-none flex-shrink-0"
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[9.5px] text-slate-400 leading-snug italic bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                  Check boxes next to parties to merge them.
                </p>
              )}
            </div>

            {/* Dynamic Primary Party Selection & Immediate Merge Button right here in Left Panel */}
            {selectedMergeKeys.size >= 2 ? (
              <div className="flex flex-col gap-2 pt-2 border-t border-purple-500/30">
                <span className="text-[9.5px] font-black text-purple-300 uppercase tracking-wider">
                  Select Primary Name:
                </span>
                <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                  {selectedMergeParties.map((sp) => {
                    const activePrimary = activePrimaryMergeKey === sp.key;
                    return (
                      <button
                        key={sp.key}
                        onClick={() => setPrimaryMergeKey(sp.key)}
                        className={cn(
                          "w-full text-left p-2 rounded-lg border text-[10px] transition-all flex items-center gap-2",
                          activePrimary
                            ? "bg-purple-600/30 border-purple-400 text-purple-100 font-black ring-1 ring-purple-400/40 shadow-sm"
                            : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                        )}
                      >
                        <div className={cn(
                          "w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all",
                          activePrimary ? "border-purple-300 bg-purple-500" : "border-slate-600"
                        )}>
                          {activePrimary && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold" title={sp.partyName || sp.key}>{sp.partyName || sp.key}</p>
                          <p className="text-[8.5px] text-slate-400 font-mono">{sp.totals.count} inv {sp.gstin && sp.gstin !== 'NO GSTIN' ? `• ${sp.gstin}` : ''}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={handleMergeMultipleParties}
                  className="w-full py-2.5 px-3 mt-1 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-black text-[11px] uppercase tracking-wider shadow-[0_0_20px_rgba(168,85,247,0.5)] flex items-center justify-center gap-1.5 border border-purple-300/40 transition-all hover:scale-105 active:scale-95"
                >
                  <GitMerge className="w-4 h-4 text-purple-200 animate-pulse" />
                  <span>CONFIRM & MERGE NOW</span>
                </button>
              </div>
            ) : (
              <div className="w-full py-2 px-2 bg-purple-950/40 border border-purple-500/20 rounded-xl text-center">
                <span className="text-[9.5px] font-bold text-purple-300/80">
                  Select {selectedMergeKeys.size === 0 ? '2' : '1 more'} party to merge
                </span>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

function PartyCard({
  party,
  isOpen,
  onToggle,
  onManualMatch,
  onBatchMatch,
  onForceMatch,
  onUnlinkMatch,
  onAutoMatchParty,
  onMergeParties,
  allParties,
  canEdit,
  groupBy,
  onSetGroupBy,
  mergeMode,
  isMergeSelected,
  onToggleMergeSelect,
}: {
  party: PartySummary;
  isOpen: boolean;
  onToggle: () => void;
  onManualMatch: (pr: PartyInvoiceRow, tb: PartyInvoiceRow) => void;
  onBatchMatch: (stagedPairs: Array<{ pr: PartyInvoiceRow; twoB: PartyInvoiceRow }>) => void;
  onForceMatch: (inv: PartyInvoiceRow) => void;
  onUnlinkMatch: (inv: PartyInvoiceRow) => void;
  onAutoMatchParty: (p: PartySummary) => void;
  onMergeParties?: (source: PartySummary, targetKey: string) => void;
  allParties?: PartySummary[];
  canEdit: boolean;
  groupBy?: 'gstin' | 'name';
  onSetGroupBy?: (gb: 'gstin' | 'name') => void;
  mergeMode?: boolean;
  isMergeSelected?: boolean;
  onToggleMergeSelect?: () => void;
}) {
  const [selectedPRIndex, setSelectedPRIndex] = useState<number | null>(null);
  const [selected2BIndex, setSelected2BIndex] = useState<number | null>(null);
  const [stagedPairs, setStagedPairs] = useState<Array<{ pr: PartyInvoiceRow; twoB: PartyInvoiceRow; prIndex: number; twoBIndex: number }>>([]);

  const isPRStaged = (index: number) => stagedPairs.some((p) => p.prIndex === index);
  const is2BStaged = (index: number) => stagedPairs.some((p) => p.twoBIndex === index);
  const getStagedPairLabel = (prIndex?: number, twoBIndex?: number) => {
    const foundIdx = stagedPairs.findIndex((p) => p.prIndex === prIndex || p.twoBIndex === twoBIndex);
    return foundIdx !== -1 ? `Pair #${foundIdx + 1}` : null;
  };

  const hasUnmatchedPR = party.invoices.some((i) => (i.status === 'Not in 2B' || i.status === 'Missing in 2B' || i.status === 'Unmatched Vendor') && i.rawResult?.prRecord);
  const hasUnmatched2B = party.invoices.some((i) => (i.status === 'Not in Books' || i.status === 'Missing in PR') && i.rawResult?.twoBRecord);

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button className={cn(
          "w-full flex items-center justify-between gap-6 px-6 py-5 hover:bg-white/[0.02] transition-all group text-left",
          mergeMode && isMergeSelected && "bg-purple-950/30 ring-1 ring-purple-500/30"
        )}>
          <div className="min-w-0 flex-1 flex items-center gap-6">
            {/* Merge checkbox */}
            {mergeMode && (
              <div
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleMergeSelect?.(); }}
                className={cn(
                  "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 cursor-pointer transition-all",
                  isMergeSelected
                    ? "bg-purple-500 border-purple-400 shadow-sm shadow-purple-500/30"
                    : "border-slate-600 hover:border-purple-400"
                )}
              >
                {isMergeSelected && <Check className="w-3 h-3 text-white" />}
              </div>
            )}
            <div className={cn("w-2 h-2 rounded-full", party.overall === 'All Matched' ? 'bg-[var(--np-green)]' : party.overall === 'Has Mismatches' ? 'bg-yellow-500' : 'bg-[var(--np-red)]')} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-extrabold text-[13px] text-white truncate uppercase tracking-wide group-hover:text-[var(--np-sky)] transition-colors">{party.partyName || '— UNNAMED COUNTERPARTY —'}</span>
                <span className="np-badge np-badge-muted">{party.gstin || 'NO GSTIN'}</span>
              </div>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-[10px] font-bold text-[var(--np-text3)] uppercase tracking-widest">{party.totals.count} Invoices</span>
                {party.totals.totalDiff !== 0 && (
                  <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest">₹{fmt(party.totals.totalDiff)} Variance</span>
                )}
                <span className={cn("text-[9px] font-black uppercase tracking-[0.2em]", party.overall === 'All Matched' ? 'text-[var(--np-green)]' : party.overall === 'Has Mismatches' ? 'text-yellow-500' : 'text-[var(--np-red)]')}>
                  {party.overall}
                </span>
              </div>
            </div>
          </div>
          <ChevronDown className={cn('w-4 h-4 text-[var(--np-text3)] transition-transform duration-500 group-hover:text-[var(--np-sky)]', isOpen && 'rotate-180')} />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="bg-[var(--np-bg3)]/30 border-t border-[var(--np-border)] p-2 overflow-hidden">
          {canEdit && (hasUnmatchedPR || hasUnmatched2B) && (
            <div className="mb-3 p-3 bg-slate-900/90 border border-slate-800 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-400 animate-pulse" />
                <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">Manual Match Studio</span>
                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                  (Select 1 Books & 1 2B invoice, add to batch, then click Apply All)
                </span>
              </div>

              <div className="flex items-center gap-2">
                {selectedPRIndex !== null && selected2BIndex !== null && (
                  <>
                    <button
                      onClick={() => {
                        const prInv = party.invoices[selectedPRIndex];
                        const twoBInv = party.invoices[selected2BIndex];
                        if (prInv && twoBInv) {
                          setStagedPairs([
                            ...stagedPairs,
                            { pr: prInv, twoB: twoBInv, prIndex: selectedPRIndex, twoBIndex: selected2BIndex },
                          ]);
                          setSelectedPRIndex(null);
                          setSelected2BIndex(null);
                          toast.success(`Staged Pair #${stagedPairs.length + 1}: #${prInv.invoiceNoPR || 'PR'} ↔ #${twoBInv.invoiceNo2B || '2B'}`);
                        }
                      }}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Pair to Batch Queue
                    </button>
                    <button
                      onClick={() => {
                        const prInv = party.invoices[selectedPRIndex];
                        const twoBInv = party.invoices[selected2BIndex];
                        if (prInv && twoBInv) {
                          onManualMatch(prInv, twoBInv);
                          setSelectedPRIndex(null);
                          setSelected2BIndex(null);
                        }
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow transition-all"
                    >
                      <Link className="w-3.5 h-3.5" />
                      Match Immediately
                    </button>
                  </>
                )}
                {hasUnmatchedPR && hasUnmatched2B && (
                  <button
                    onClick={() => onAutoMatchParty(party)}
                    className="px-3 py-1.5 bg-sky-600/80 hover:bg-sky-500 text-white rounded font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    Auto-Match Suggested Pairs
                  </button>
                )}
              </div>
            </div>
          )}

          {stagedPairs.length > 0 && (
            <div className="mb-3 p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-lg flex flex-col gap-2 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span className="font-bold text-emerald-200 text-xs uppercase tracking-wider">
                    Batch Queue ({stagedPairs.length} pair{stagedPairs.length > 1 ? 's' : ''} staged)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStagedPairs([])}
                    className="px-2.5 py-1 text-[10px] text-slate-400 hover:text-white uppercase font-bold transition-colors"
                  >
                    Clear Queue
                  </button>
                  <button
                    onClick={() => {
                      onBatchMatch(stagedPairs.map((p) => ({ pr: p.pr, twoB: p.twoB })));
                      setStagedPairs([]);
                    }}
                    className="px-4 py-1.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded font-black text-[10.5px] uppercase tracking-wider shadow-lg flex items-center gap-1.5 transition-all animate-bounce"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Apply & Match All Mapped Pairs ({stagedPairs.length})
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1 border-t border-emerald-900/60">
                {stagedPairs.map((pair, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 border border-emerald-500/40 rounded text-[10px] text-slate-200 font-mono shadow-sm">
                    <span className="text-emerald-400 font-bold">Pair #{idx + 1}:</span>
                    <span className="text-sky-400">{pair.pr.invoiceNoPR || 'Books'}</span>
                    <span className="text-slate-500">↔</span>
                    <span className="text-purple-400">{pair.twoB.invoiceNo2B || '2B'}</span>
                    <button
                      onClick={() => setStagedPairs(stagedPairs.filter((_, i) => i !== idx))}
                      className="ml-1 text-slate-500 hover:text-rose-400 font-bold text-[12px]"
                      title="Remove pair from queue"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="w-full max-w-full overflow-x-auto">
            <table className="w-full !bg-transparent border-none text-left border-collapse">
              <thead>
                <tr className="!bg-transparent border-b border-[var(--np-border)]">
                  {canEdit && <th className="!py-2 !px-1 !text-[8.5px] font-bold text-slate-400 uppercase text-center w-8">Match</th>}
                  <th className="!py-2 !px-1.5 !text-[8.5px] font-bold text-slate-400 uppercase whitespace-nowrap">Date</th>
                  <th className="!py-2 !px-1.5 !text-[8.5px] font-bold text-slate-400 uppercase whitespace-nowrap">Month / FY</th>
                  <th className="!py-2 !px-1.5 !text-[8.5px] font-bold text-slate-400 uppercase whitespace-nowrap">GSTIN</th>
                  <th className="!py-2 !px-1.5 !text-[8.5px] font-bold text-slate-400 uppercase whitespace-nowrap">Party Name</th>
                  <th className="!py-2 !px-1.5 !text-[8.5px] font-bold text-slate-400 uppercase whitespace-nowrap">Inv (PR)</th>
                  <th className="!py-2 !px-1.5 !text-[8.5px] font-bold text-slate-400 uppercase whitespace-nowrap">Inv (2B)</th>
                  <th className="!py-2 !px-1.5 !text-[8.5px] font-bold text-slate-400 uppercase text-right whitespace-nowrap">Taxable (PR)</th>
                  <th className="!py-2 !px-1.5 !text-[8.5px] font-bold text-slate-400 uppercase text-right whitespace-nowrap">Taxable (2B)</th>
                  <th className="!py-2 !px-1.5 !text-[8.5px] font-bold text-slate-400 uppercase text-right whitespace-nowrap">CGST PR</th>
                  <th className="!py-2 !px-1.5 !text-[8.5px] font-bold text-slate-400 uppercase text-right whitespace-nowrap">CGST 2B</th>
                  <th className="!py-2 !px-1.5 !text-[8.5px] font-bold text-slate-400 uppercase text-right whitespace-nowrap">SGST PR</th>
                  <th className="!py-2 !px-1.5 !text-[8.5px] font-bold text-slate-400 uppercase text-right whitespace-nowrap">SGST 2B</th>
                  <th className="!py-2 !px-1.5 !text-[8.5px] font-bold text-slate-400 uppercase text-right whitespace-nowrap">IGST PR</th>
                  <th className="!py-2 !px-1.5 !text-[8.5px] font-bold text-slate-400 uppercase text-right whitespace-nowrap">IGST 2B</th>
                  <th className="!py-2 !px-1.5 !text-[8.5px] font-bold text-slate-400 uppercase text-right whitespace-nowrap">Val (PR)</th>
                  <th className="!py-2 !px-1.5 !text-[8.5px] font-bold text-slate-400 uppercase text-right whitespace-nowrap">Val (2B)</th>
                  <th className="!py-2 !px-1.5 !text-[8.5px] font-bold text-slate-400 uppercase whitespace-nowrap">Status</th>
                  {canEdit && <th className="!py-2 !px-1 !text-[8.5px] font-bold text-slate-400 uppercase text-center whitespace-nowrap">Action</th>}
                </tr>
              </thead>
              <tbody>
                {party.invoices.map((inv, i) => {
                  const isUnmatchedPR = (inv.status === 'Not in 2B' || inv.status === 'Missing in 2B' || inv.status === 'Unmatched Vendor') && !!inv.rawResult?.prRecord;
                  const isUnmatched2B = (inv.status === 'Not in Books' || inv.status === 'Missing in PR') && !!inv.rawResult?.twoBRecord;
                  const isMatchedPair = !!inv.rawResult?.prRecord && !!inv.rawResult?.twoBRecord;
                  const isMismatchPair = isMatchedPair && inv.status === 'Value Mismatch';

                  const isBatchRow = inv.status?.includes('Consolidated Batch') || !!inv.batchLabel;
                  const isBatchLead = isBatchRow && !inv.isSubRow;
                  const isBatchSub = isBatchRow && !!inv.isSubRow;

                  const prStaged = isPRStaged(i);
                  const tbStaged = is2BStaged(i);
                  const stagedLabel = getStagedPairLabel(i, i);

                  const dateVal = inv.invoiceDatePR || inv.invoiceDate2B || '—';
                  const gstinVal = inv.rawResult?.prRecord?.gstin || inv.rawResult?.twoBRecord?.gstin || party.gstin || '—';
                  const partyNameVal = inv.rawResult?.prRecord?.supplierName || inv.rawResult?.twoBRecord?.supplierName || party.partyName || '—';

                  return (
                    <tr
                      key={i}
                      className={cn(
                        '!bg-transparent border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors',
                        isBatchRow && 'border-l-4 border-l-amber-500/80 bg-amber-950/15',
                        isBatchSub && 'opacity-90',
                        selectedPRIndex === i && 'bg-emerald-950/40 border-emerald-500/50',
                        selected2BIndex === i && 'bg-purple-950/40 border-purple-500/50',
                        (prStaged || tbStaged) && 'bg-emerald-950/30 border-emerald-500/30'
                      )}
                    >
                      {canEdit && (
                        <td className="!py-1.5 !px-1 text-center">
                          {prStaged || tbStaged ? (
                            <span className="px-1 bg-emerald-500/20 text-emerald-400 text-[8px] rounded font-mono font-bold" title="Staged in batch queue">
                              {stagedLabel}
                            </span>
                          ) : isUnmatchedPR ? (
                            <input
                              type="radio"
                              name={`pr_select_${party.key}`}
                              checked={selectedPRIndex === i}
                              onChange={() => setSelectedPRIndex(selectedPRIndex === i ? null : i)}
                              className="accent-emerald-500 cursor-pointer w-3.5 h-3.5"
                              title="Select PR Invoice for manual match"
                            />
                          ) : isUnmatched2B ? (
                            <input
                              type="radio"
                              name={`2b_select_${party.key}`}
                              checked={selected2BIndex === i}
                              onChange={() => setSelected2BIndex(selected2BIndex === i ? null : i)}
                              className="accent-purple-500 cursor-pointer w-3.5 h-3.5"
                              title="Select 2B Invoice for manual match"
                            />
                          ) : (
                            <span className="text-[9px] text-slate-600">—</span>
                          )}
                        </td>
                      )}
                      <td className="!py-1.5 !px-1.5 font-mono !text-[9px] text-slate-300 whitespace-nowrap">{dateVal}</td>
                      <td className="!py-1.5 !px-1.5 font-mono !text-[9px] text-slate-400 whitespace-nowrap">{inv.financialYear}</td>
                      <td className="!py-1.5 !px-1.5 font-mono !text-[9px] text-slate-300 whitespace-nowrap">{gstinVal}</td>
                      <td className="!py-1.5 !px-1.5 font-semibold !text-[9px] text-white truncate max-w-[130px]" title={partyNameVal}>{partyNameVal}</td>
                      <td className="!py-1.5 !px-1.5 font-mono !text-[9px] text-sky-400 whitespace-nowrap">
                        {isBatchLead ? (
                          <div className="flex items-center gap-1.5">
                            <span>{inv.invoiceNoPR || '—'}</span>
                            <BatchBadge isLead={true} />
                          </div>
                        ) : isBatchSub ? (
                          <div className="flex items-center gap-1 pl-2 text-slate-500">
                            <BatchBadge isSubRow={true} />
                          </div>
                        ) : (
                          inv.invoiceNoPR || '—'
                        )}
                      </td>
                      <td className="!py-1.5 !px-1.5 font-mono !text-[9px] text-purple-400 whitespace-nowrap">{inv.invoiceNo2B || '—'}</td>
                      <td className={cn("!py-1.5 !px-1.5 text-right tabular-nums !text-[9px] font-mono", isBatchSub ? "text-slate-500/60" : "text-slate-300")}>{fmt(inv.taxablePR)}</td>
                      <td className="!py-1.5 !px-1.5 text-right tabular-nums !text-[9px] font-mono text-slate-300">{fmt(inv.taxable2B)}</td>
                      <td className={cn("!py-1.5 !px-1.5 text-right tabular-nums !text-[9px] font-mono", isBatchSub ? "text-slate-500/60" : "text-slate-300")}>{fmt(inv.cgstPR)}</td>
                      <td className="!py-1.5 !px-1.5 text-right tabular-nums !text-[9px] font-mono text-slate-300">{fmt(inv.cgst2B)}</td>
                      <td className={cn("!py-1.5 !px-1.5 text-right tabular-nums !text-[9px] font-mono", isBatchSub ? "text-slate-500/60" : "text-slate-300")}>{fmt(inv.sgstPR)}</td>
                      <td className="!py-1.5 !px-1.5 text-right tabular-nums !text-[9px] font-mono text-slate-300">{fmt(inv.sgst2B)}</td>
                      <td className={cn("!py-1.5 !px-1.5 text-right tabular-nums !text-[9px] font-mono", isBatchSub ? "text-slate-500/60" : "text-slate-300")}>{fmt(inv.igstPR)}</td>
                      <td className="!py-1.5 !px-1.5 text-right tabular-nums !text-[9px] font-mono text-slate-300">{fmt(inv.igst2B)}</td>
                      <td className={cn("!py-1.5 !px-1.5 text-right tabular-nums !text-[9px] font-bold font-mono", isBatchSub ? "text-slate-500/60" : "text-slate-200")}>{fmt(inv.invoiceValuePR)}</td>
                      <td className="!py-1.5 !px-1.5 text-right tabular-nums !text-[9px] font-bold font-mono text-slate-200">{fmt(inv.invoiceValue2B)}</td>
                      <td className={cn('!py-1.5 !px-1.5 font-bold !text-[8.5px] uppercase tracking-wider whitespace-nowrap', rowStatusColor(inv.status))}>{inv.status}</td>
                      {canEdit && (
                        <td className="!py-1.5 !px-1 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {isMismatchPair && (
                              <button
                                onClick={() => onForceMatch(inv)}
                                className="p-0.5 hover:bg-emerald-500/20 text-emerald-400 rounded transition-colors"
                                title="Force Perfect Match (Override Difference)"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isMatchedPair && (
                              <button
                                onClick={() => onUnlinkMatch(inv)}
                                className="p-0.5 hover:bg-rose-500/20 text-rose-400 rounded transition-colors"
                                title="Unlink this matched invoice pair"
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
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

