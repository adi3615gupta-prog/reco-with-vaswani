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
    const rowCls = isTotal ? 'bg-[var(--np-bg3)] font-bold border-t-2 border-[var(--np-sky)]/30' : '';

    return (
      <tr key={isTotal ? 'total' : m.sortKey} className={rowCls}>
        <td className="font-bold text-white text-[12px]">{isTotal ? 'Grand Total' : m.month}</td>
        <td className={cCls}>{fmt(m.prIgst)}</td>
        <td className={cCls}>{fmt(m.twoBIgst)}</td>
        <td className={cn(cCls, 'font-bold', diffColor(igstDiff))}>{fmt(igstDiff)}</td>
        <td className={cCls}>{fmt(m.prCgst)}</td>
        <td className={cCls}>{fmt(m.twoBCgst)}</td>
        <td className={cn(cCls, 'font-bold', diffColor(cgstDiff))}>{fmt(cgstDiff)}</td>
        <td className={cCls}>{fmt(m.prSgst)}</td>
        <td className={cCls}>{fmt(m.twoBSgst)}</td>
        <td className={cn(cCls, 'font-bold', diffColor(sgstDiff))}>{fmt(sgstDiff)}</td>
        <td className={cn('text-center tabular-nums text-[12px]', countColor(m.matched, 'good'))}>{m.matched}</td>
        <td className={cn('text-center tabular-nums text-[12px]', countColor(m.mismatch, 'warn'))}>{m.mismatch || '—'}</td>
        <td className={cn('text-center tabular-nums text-[12px]', countColor(m.missingIn2B, 'bad'))}>{m.missingIn2B || '—'}</td>
        <td className={cn('text-center tabular-nums text-[12px]', countColor(m.missingInPR, 'info'))}>{m.missingInPR || '—'}</td>
      </tr>
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
    <div className="dash-card overflow-hidden silk-reveal" style={{ animationDelay: '400ms' }}>
      <div className="dash-topbar">
        <div className="flex items-center gap-4">
           <div className="dash-dots"><span style={{background:'#A87EE8'}}></span><span style={{background:'#7EC8F0'}}></span></div>
           <span className="text-[10px] font-bold text-[var(--np-text2)] uppercase tracking-widest">Monthly Variance Matrix</span>
        </div>
        <button onClick={handleExport} className="btn-np-outline gap-2 !py-1.5 text-[9px] uppercase tracking-widest font-bold">
          <Download className="w-3.5 h-3.5" /> Full Report
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="np-table">
          <thead>
            <tr>
              <th rowSpan={2} className="border-r border-[var(--np-border)]">Period</th>
              <th colSpan={3} className="text-center border-r border-[var(--np-border)] text-[var(--np-sky)]">IGST Matrix</th>
              <th colSpan={3} className="text-center border-r border-[var(--np-border)] text-[var(--np-green)]">CGST Matrix</th>
              <th colSpan={3} className="text-center border-r border-[var(--np-border)] text-[#A87EE8]">SGST Matrix</th>
              <th colSpan={4} className="text-center">Audit Counts</th>
            </tr>
            <tr>
              <th className="text-right">Books</th>
              <th className="text-right">Govt</th>
              <th className="text-right border-r border-[var(--np-border)]">Diff</th>
              <th className="text-right">Books</th>
              <th className="text-right">Govt</th>
              <th className="text-right border-r border-[var(--np-border)]">Diff</th>
              <th className="text-right">Books</th>
              <th className="text-right">Govt</th>
              <th className="text-right border-r border-[var(--np-border)]">Diff</th>
              <th className="text-center">✓</th>
              <th className="text-center">⚠</th>
              <th className="text-center">✗G</th>
              <th className="text-center">✗B</th>
            </tr>
          </thead>
          <tbody>
            {monthlyData.map((m) => renderRow(m))}
            {renderRow(totalRow, true)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
