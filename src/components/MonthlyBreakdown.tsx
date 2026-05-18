import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import type { ReconciliationResult } from '@/lib/reconciliation';
import { exportMonthlyComparison, type MonthlyComparisonRow, type DebitNoteRecord } from '@/lib/fileParser';
import { cn } from '@/lib/utils';

interface MonthlyBreakdownProps {
  results: ReconciliationResult[];
  debitNotes?: { pr: DebitNoteRecord[]; twoB: DebitNoteRecord[] };
  companyName: string;
}

interface MonthData {
  month: string;
  sortKey: string;
  prTaxable: number;
  twoBTaxable: number;
  prIgst: number;
  prCgst: number;
  prSgst: number;
  twoBIgst: number;
  twoBCgst: number;
  twoBSgst: number;
  matched: number;
  mismatch: number;
  missingIn2B: number;
  missingInPR: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getMonthKey(dateStr: string | undefined, normalizedDate: Date | undefined): { label: string; sortKey: string } | null {
  const d = normalizedDate || (dateStr ? new Date(dateStr) : null);
  if (!d || isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = d.getMonth();
  return {
    label: `${MONTH_NAMES[m]} ${y}`,
    sortKey: `${y}-${String(m).padStart(2, '0')}`,
  };
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function diffColor(diff: number) {
  if (diff === 0) return 'text-muted-foreground';
  return diff > 0 ? 'text-success' : 'text-destructive';
}

function countColor(val: number, type: 'good' | 'warn' | 'bad' | 'info') {
  if (val === 0) return 'text-muted-foreground/40';
  switch (type) {
    case 'good': return 'text-success font-semibold';
    case 'warn': return 'text-warning font-semibold';
    case 'bad': return 'text-destructive font-semibold';
    case 'info': return 'text-info font-semibold';
  }
}

const hCls = "text-right text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap";
const cCls = "text-right tabular-nums text-xs";

export function MonthlyBreakdown({ results, debitNotes, companyName }: MonthlyBreakdownProps) {
  const monthlyData = useMemo(() => {
    const map = new Map<string, MonthData>();

    const getOrCreate = (label: string, sortKey: string): MonthData => {
      if (!map.has(sortKey)) {
        map.set(sortKey, {
          month: label, sortKey,
          prTaxable: 0, twoBTaxable: 0,
          prIgst: 0, prCgst: 0, prSgst: 0,
          twoBIgst: 0, twoBCgst: 0, twoBSgst: 0,
          matched: 0, mismatch: 0, missingIn2B: 0, missingInPR: 0,
        });
      }
      return map.get(sortKey)!;
    };

    for (const r of results) {
      if (r.prRecord) {
        const mk = getMonthKey(r.prRecord.invoiceDate, r.prRecord.normalizedDate);
        if (mk) {
          const entry = getOrCreate(mk.label, mk.sortKey);
          entry.prIgst += r.prRecord.igst;
          entry.prCgst += r.prRecord.cgst;
          entry.prSgst += r.prRecord.sgst;
        }
      }

      if (r.twoBRecord) {
        const mk = getMonthKey(r.twoBRecord.invoiceDate, r.twoBRecord.normalizedDate);
        if (mk) {
          const entry = getOrCreate(mk.label, mk.sortKey);
          entry.twoBIgst += r.twoBRecord.igst;
          entry.twoBCgst += r.twoBRecord.cgst;
          entry.twoBSgst += r.twoBRecord.sgst;
        }
      }

      const statusRec = r.prRecord || r.twoBRecord;
      if (statusRec) {
        const mk = getMonthKey(statusRec.invoiceDate, statusRec.normalizedDate);
        if (mk) {
          const entry = getOrCreate(mk.label, mk.sortKey);
          if (r.status === 'Perfect Match' || r.status === 'Matched' || r.status === 'Matched (Rounded)') entry.matched++;
          else if (r.status === 'Value Mismatch' || r.status === 'Mismatch') entry.mismatch++;
          else if (r.status === 'Not in 2B' || r.status === 'Unmatched Vendor' || r.status === 'Missing in 2B') entry.missingIn2B++;
          else if (r.status === 'Not in Books' || r.status === 'Missing in PR') entry.missingInPR++;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [results]);

  if (monthlyData.length === 0) return null;

  const totals = monthlyData.reduce(
    (acc, m) => ({
      prIgst: acc.prIgst + m.prIgst,
      prCgst: acc.prCgst + m.prCgst,
      prSgst: acc.prSgst + m.prSgst,
      twoBIgst: acc.twoBIgst + m.twoBIgst,
      twoBCgst: acc.twoBCgst + m.twoBCgst,
      twoBSgst: acc.twoBSgst + m.twoBSgst,
      matched: acc.matched + m.matched,
      mismatch: acc.mismatch + m.mismatch,
      missingIn2B: acc.missingIn2B + m.missingIn2B,
      missingInPR: acc.missingInPR + m.missingInPR,
    }),
    { prIgst: 0, prCgst: 0, prSgst: 0, twoBIgst: 0, twoBCgst: 0, twoBSgst: 0, matched: 0, mismatch: 0, missingIn2B: 0, missingInPR: 0 }
  );

  const renderRow = (m: MonthData, isTotal = false) => {
    const igstDiff = m.prIgst - m.twoBIgst;
    const cgstDiff = m.prCgst - m.twoBCgst;
    const sgstDiff = m.prSgst - m.twoBSgst;
    const rowCls = isTotal ? 'bg-muted/30 hover:bg-muted/30 font-semibold border-t-2 border-border' : 'hover:bg-muted/20';

    return (
      <TableRow key={isTotal ? 'total' : m.sortKey} className={rowCls}>
        <TableCell className="font-medium text-sm sticky left-0 bg-inherit z-10">{isTotal ? 'Total' : m.month}</TableCell>
        {/* IGST */}
        <TableCell className={cCls}>{fmt(m.prIgst)}</TableCell>
        <TableCell className={cCls}>{fmt(m.twoBIgst)}</TableCell>
        <TableCell className={cn(cCls, 'font-semibold', diffColor(igstDiff))}>{fmt(igstDiff)}</TableCell>
        {/* CGST */}
        <TableCell className={cCls}>{fmt(m.prCgst)}</TableCell>
        <TableCell className={cCls}>{fmt(m.twoBCgst)}</TableCell>
        <TableCell className={cn(cCls, 'font-semibold', diffColor(cgstDiff))}>{fmt(cgstDiff)}</TableCell>
        {/* SGST */}
        <TableCell className={cCls}>{fmt(m.prSgst)}</TableCell>
        <TableCell className={cCls}>{fmt(m.twoBSgst)}</TableCell>
        <TableCell className={cn(cCls, 'font-semibold', diffColor(sgstDiff))}>{fmt(sgstDiff)}</TableCell>
        {/* Counts */}
        <TableCell className={cn('text-center tabular-nums text-xs', countColor(m.matched, 'good'))}>{m.matched}</TableCell>
        <TableCell className={cn('text-center tabular-nums text-xs', countColor(m.mismatch, 'warn'))}>{m.mismatch || '—'}</TableCell>
        <TableCell className={cn('text-center tabular-nums text-xs', countColor(m.missingIn2B, 'bad'))}>{m.missingIn2B || '—'}</TableCell>
        <TableCell className={cn('text-center tabular-nums text-xs', countColor(m.missingInPR, 'info'))}>{m.missingInPR || '—'}</TableCell>
      </TableRow>
    );
  };

  const totalRow = { ...totals, month: 'Total', sortKey: 'zzz',
    prIgst: totals.prIgst, prCgst: totals.prCgst, prSgst: totals.prSgst,
    twoBIgst: totals.twoBIgst, twoBCgst: totals.twoBCgst, twoBSgst: totals.twoBSgst,
  } as MonthData;

  const handleExport = () => {
    const exportRows: MonthlyComparisonRow[] = results.map((r) => {
      const pr = r.prRecord;
      const tb = r.twoBRecord;
      return {
        partyTally: pr?.supplierName || '',
        gstinTally: pr?.gstin || '',
        invoiceTally: pr?.invoiceNo || '',
        cgstTally: pr?.cgst || 0,
        sgstTally: pr?.sgst || 0,
        igstTally: pr?.igst || 0,
        dateTally: pr?.invoiceDate || '',
        partyCmp: tb?.supplierName || '',
        gstinCmp: tb?.gstin || '',
        invoiceCmp: tb?.invoiceNo || '',
        cgstCmp: tb?.cgst || 0,
        sgstCmp: tb?.sgst || 0,
        igstCmp: tb?.igst || 0,
        dateCmp: tb?.invoiceDate || '',
        status: r.status,
        totalDiff: (r.cgstDiff ?? 0) + (r.sgstDiff ?? 0) + (r.igstDiff ?? 0),
      };
    });
    exportMonthlyComparison(exportRows, 'Monthly_Comparison.xlsx', debitNotes, companyName);
  };

  return (
    <Card className="glass-card bg-card/60 backdrop-blur-xl border-white/10 shadow-2xl overflow-hidden">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base">Month-wise Breakdown</CardTitle>
        <Button onClick={handleExport} variant="outline" size="sm" className="gap-2">
          <Download className="w-4 h-4" /> Export Report
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
      <TableHeader>
              {/* Group header row */}
              <TableRow className="bg-muted/50 hover:bg-muted/50 border-b-0">
                <TableHead rowSpan={2} className="text-[10px] uppercase tracking-wider font-semibold align-bottom border-r border-border">Month</TableHead>
                <TableHead colSpan={3} className="text-center text-[10px] uppercase tracking-wider font-semibold border-r border-border text-orange-500 dark:text-orange-400">IGST</TableHead>
                <TableHead colSpan={3} className="text-center text-[10px] uppercase tracking-wider font-semibold border-r border-border text-blue-500 dark:text-blue-400">CGST</TableHead>
                <TableHead colSpan={3} className="text-center text-[10px] uppercase tracking-wider font-semibold border-r border-border text-violet-500 dark:text-violet-400">SGST</TableHead>
                <TableHead colSpan={4} className="text-center text-[10px] uppercase tracking-wider font-semibold">Status Counts</TableHead>
              </TableRow>
              {/* Sub-header row */}
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className={hCls}>PR</TableHead>
                <TableHead className={hCls}>2B</TableHead>
                <TableHead className={cn(hCls, 'border-r border-border')}>Diff</TableHead>
                <TableHead className={hCls}>PR</TableHead>
                <TableHead className={hCls}>2B</TableHead>
                <TableHead className={cn(hCls, 'border-r border-border')}>Diff</TableHead>
                <TableHead className={hCls}>PR</TableHead>
                <TableHead className={hCls}>2B</TableHead>
                <TableHead className={cn(hCls, 'border-r border-border')}>Diff</TableHead>
                <TableHead className="text-center text-[10px] uppercase tracking-wider font-semibold">✓</TableHead>
                <TableHead className="text-center text-[10px] uppercase tracking-wider font-semibold">⚠</TableHead>
                <TableHead className="text-center text-[10px] uppercase tracking-wider font-semibold">✗2B</TableHead>
                <TableHead className="text-center text-[10px] uppercase tracking-wider font-semibold">✗PR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthlyData.map((m) => renderRow(m))}
              {renderRow(totalRow, true)}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
