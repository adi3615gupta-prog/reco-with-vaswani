import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, RefreshCw, FileCheck2, AlertTriangle, AlertCircle, Info, Layers } from 'lucide-react';
import type { ReconciliationResult } from '@/lib/reconciliation';
import { exportMonthlyComparison, type MonthlyComparisonRow, type DebitNoteRecord } from '@/lib/fileParser';
import { cn } from '@/lib/utils';
import type { GSTR3BDataBlock } from '@/lib/gstr3bParser';

interface MonthlyBreakdownProps {
  results: ReconciliationResult[];
  debitNotes?: { pr: DebitNoteRecord[]; twoB: DebitNoteRecord[] };
  companyName: string;
  gstr3bData?: GSTR3BDataBlock[] | null;
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

const GSTR3B_MONTH_MAP: Record<string, string> = {
  'Jan': 'January', 'Feb': 'February', 'Mar': 'March', 'Apr': 'April',
  'May': 'May', 'Jun': 'June', 'Jul': 'July', 'Aug': 'August',
  'Sep': 'September', 'Oct': 'October', 'Nov': 'November', 'Dec': 'December'
};

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function diffColor(diff: number) {
  if (Math.abs(diff) < 0.05) return 'text-muted-foreground';
  return diff > 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold';
}

function getMonthKey(dateStr: string | undefined, normalizedDate: Date | string | undefined): { label: string; sortKey: string } | null {
  let d: Date | null = null;
  if (normalizedDate instanceof Date) d = normalizedDate;
  else if (typeof normalizedDate === 'string') d = new Date(normalizedDate);
  else if (dateStr) d = new Date(dateStr);
  
  if (!d || isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = d.getMonth();
  return {
    label: `${MONTH_NAMES[m]} ${y}`,
    sortKey: `${y}-${String(m).padStart(2, '0')}`,
  };
}

export function MonthlyBreakdown({ results, debitNotes, companyName, gstr3bData }: MonthlyBreakdownProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'igst' | 'cgst' | 'sgst'>('all');

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
      if (r.status === 'Prior FY (Excluded)') continue;
      
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

  // Extract GSTR-3B Net ITC values for a month
  const getGSTR3BVal = (monthLabel: string, component: 'igst' | 'cgst' | 'sgst') => {
    if (!gstr3bData) return 0;
    const prefix = monthLabel.split(' ')[0];
    const gstr3bMonthName = GSTR3B_MONTH_MAP[prefix];
    if (!gstr3bMonthName) return 0;

    const netBlocks = gstr3bData.filter(b => 
      b.level1.toLowerCase().includes('net itc') || b.level1.toLowerCase().includes('(c)')
    );

    const compBlock = netBlocks.find(b => b.level3.toLowerCase().includes(component));
    return compBlock ? (compBlock.values[gstr3bMonthName as any] || 0) : 0;
  };

  const getTaxValuesForTab = (m: MonthData) => {
    let pr = 0;
    let twoB = 0;
    let gstr3b = 0;

    if (activeTab === 'all') {
      pr = m.prIgst + m.prCgst + m.prSgst;
      twoB = m.twoBIgst + m.twoBCgst + m.twoBSgst;
      gstr3b = getGSTR3BVal(m.month, 'igst') + getGSTR3BVal(m.month, 'cgst') + getGSTR3BVal(m.month, 'sgst');
    } else if (activeTab === 'igst') {
      pr = m.prIgst;
      twoB = m.twoBIgst;
      gstr3b = getGSTR3BVal(m.month, 'igst');
    } else if (activeTab === 'cgst') {
      pr = m.prCgst;
      twoB = m.twoBCgst;
      gstr3b = getGSTR3BVal(m.month, 'cgst');
    } else if (activeTab === 'sgst') {
      pr = m.prSgst;
      twoB = m.twoBSgst;
      gstr3b = getGSTR3BVal(m.month, 'sgst');
    }

    return { pr, twoB, gstr3b };
  };

  // Grand Totals calculation
  const totalRowCalculated = useMemo(() => {
    let prTotal = 0;
    let twoBTotal = 0;
    let gstr3bTotal = 0;

    monthlyData.forEach(m => {
      const vals = getTaxValuesForTab(m);
      prTotal += vals.pr;
      twoBTotal += vals.twoB;
      gstr3bTotal += vals.gstr3b;
    });

    return { pr: prTotal, twoB: twoBTotal, gstr3b: gstr3bTotal };
  }, [monthlyData, activeTab]);

  const handleExport = () => {
    try {
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
      toast.success('Monthly comparison exported successfully!');
    } catch (error) {
      console.error('Export error:', error);
      toast.error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="dash-card overflow-hidden rounded-2xl shadow-2xl border border-slate-800 silk-reveal w-full">
      
      {/* Premium Topbar with dynamic sub-tabs */}
      <div className="dash-topbar px-6 py-4 bg-slate-950/20 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
           <div className="dash-dots"><span style={{background:'#A87EE8'}}></span><span style={{background:'#38BDF8'}}></span></div>
           <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
             <Layers className="w-4 h-4 text-blue-400" />
             Monthly Reconciliation Suite
           </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="btn-np-outline gap-2 !py-1.5 text-[9px] uppercase tracking-widest font-bold">
            <Download className="w-3.5 h-3.5" /> Full Report
          </button>
        </div>
      </div>

      {/* Tax Head Segment Selectors */}
      <div className="flex bg-slate-950/40 p-1.5 border-b border-slate-800/80 gap-1.5">
        {[
          { id: 'all', label: 'All Taxes Combined' },
          { id: 'igst', label: 'IGST Only' },
          { id: 'cgst', label: 'CGST Only' },
          { id: 'sgst', label: 'SGST Only' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all ${
              activeTab === tab.id 
                ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/20'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Advice warning notice */}
      {gstr3bData ? (
        <div className="p-3.5 bg-blue-500/[0.02] border-b border-slate-800/60 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-[9.5px] text-slate-400 leading-relaxed font-mono">
            Comparing <span className="text-white">Books (PR)</span> vs <span className="text-white">Government (2B)</span> vs <span className="text-white">Claimed (3B)</span> month-wise. Variances indicate mismatch gaps.
          </div>
        </div>
      ) : (
        <div className="p-3.5 bg-slate-900/10 border-b border-slate-800/60 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <div className="text-[9.5px] text-slate-500 leading-relaxed">
            Upload a GSTR-3B Excel summary file in the upload zone to automatically populate the 3B-related comparison matrices!
          </div>
        </div>
      )}

      {/* Comparative Table */}
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            {/* Super header */}
            <tr className="bg-slate-900/60 text-[9px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <th className="px-4 py-3 font-black border-r border-slate-800/60">Period</th>
              <th className="px-4 py-3 text-right font-black">Books (PR)</th>
              <th className="px-4 py-3 text-right font-black border-r border-slate-800/60">Govt (2B)</th>
              {gstr3bData && <th className="px-4 py-3 text-right font-black border-r border-slate-800/60 text-blue-400">Claimed (3B)</th>}
              <th className={cn("px-4 py-3 text-right font-black", !gstr3bData && "text-rose-400")}>PR vs 2B</th>
              {gstr3bData && <th className="px-4 py-3 text-right font-black text-amber-400">2B vs 3B</th>}
              {gstr3bData && <th className="px-4 py-3 text-right font-black text-purple-400">PR vs 3B</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40 font-mono text-slate-300">
            {monthlyData.map(m => {
              const vals = getTaxValuesForTab(m);
              
              // Comp 1: Books vs 2B
              const prVs2B = vals.pr - vals.twoB;
              // Comp 2: 2B vs 3B
              const twoBVs3B = vals.twoB - vals.gstr3b;
              // Comp 3: Books vs 3B
              const prVs3B = vals.pr - vals.gstr3b;

              const isNegMonth = vals.pr < 0 || vals.twoB < 0 || vals.gstr3b < 0;

              return (
                <tr key={m.sortKey} className={cn("hover:bg-slate-900/20 transition-colors", isNegMonth && "bg-amber-500/[0.01]")}>
                  <td className="px-4 py-2.5 font-sans font-bold text-slate-200 border-r border-slate-800/40">
                    {m.month}
                  </td>
                  <td className="px-4 py-2.5 text-right">{fmt(vals.pr)}</td>
                  <td className="px-4 py-2.5 text-right border-r border-slate-800/40">{fmt(vals.twoB)}</td>
                  {gstr3bData && (
                    <td className="px-4 py-2.5 text-right font-bold text-blue-300 border-r border-slate-800/40">
                      {fmt(vals.gstr3b)}
                    </td>
                  )}
                  <td className={cn("px-4 py-2.5 text-right", diffColor(prVs2B))}>{fmt(prVs2B)}</td>
                  {gstr3bData && <td className={cn("px-4 py-2.5 text-right", diffColor(twoBVs3B))}>{fmt(twoBVs3B)}</td>}
                  {gstr3bData && <td className={cn("px-4 py-2.5 text-right", diffColor(prVs3B))}>{fmt(prVs3B)}</td>}
                </tr>
              );
            })}

            {/* Totals Row */}
            <tr className="bg-slate-900/60 font-bold border-t border-slate-800">
              <td className="px-4 py-3 font-sans font-extrabold text-slate-100 border-r border-slate-800/40">Grand Total</td>
              <td className="px-4 py-3 text-right">{fmt(totalRowCalculated.pr)}</td>
              <td className="px-4 py-3 text-right border-r border-slate-800/40">{fmt(totalRowCalculated.twoB)}</td>
              {gstr3bData && (
                <td className="px-4 py-3 text-right text-blue-400 font-extrabold border-r border-slate-800/40">
                  {fmt(totalRowCalculated.gstr3b)}
                </td>
              )}
              <td className={cn("px-4 py-3 text-right", diffColor(totalRowCalculated.pr - totalRowCalculated.twoB))}>
                {fmt(totalRowCalculated.pr - totalRowCalculated.twoB)}
              </td>
              {gstr3bData && (
                <td className={cn("px-4 py-3 text-right", diffColor(totalRowCalculated.twoB - totalRowCalculated.gstr3b))}>
                  {fmt(totalRowCalculated.twoB - totalRowCalculated.gstr3b)}
                </td>
              )}
              {gstr3bData && (
                <td className={cn("px-4 py-3 text-right", diffColor(totalRowCalculated.pr - totalRowCalculated.gstr3b))}>
                  {fmt(totalRowCalculated.pr - totalRowCalculated.gstr3b)}
                </td>
              )}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
