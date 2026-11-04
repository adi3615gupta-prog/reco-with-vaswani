import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, RefreshCw, FileCheck2, AlertTriangle, AlertCircle, Info, Layers, ChevronDown } from 'lucide-react';
import { parseDate, type ReconciliationResult } from '@/lib/reconciliation';
import { exportMonthlyComparison, exportMonthlyDiffSheets, exportWorkbookAsync, type MonthlyComparisonRow, type DebitNoteRecord } from '@/lib/fileParser';
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
  return diff > 0 ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold';
}

function getMonthKey(dateStr: string | undefined, normalizedDate: Date | string | undefined): { label: string; sortKey: string } | null {
  let d: Date | null = null;
  if (normalizedDate instanceof Date) d = normalizedDate;
  else if (typeof normalizedDate === 'string') d = parseDate(normalizedDate) || new Date(normalizedDate);
  else if (dateStr) d = parseDate(dateStr) || new Date(dateStr);
  
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
  const [isCollapsed, setIsCollapsed] = useState(false);

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
          taxableTally: pr?.taxableValue || 0,
          dateTally: pr?.invoiceDate || '',
          partyCmp: tb?.supplierName || '',
          gstinCmp: tb?.gstin || '',
          invoiceCmp: tb?.invoiceNo || '',
          cgstCmp: tb?.cgst || 0,
          sgstCmp: tb?.sgst || 0,
          igstCmp: tb?.igst || 0,
          taxableCmp: tb?.taxableValue || 0,
          dateCmp: tb?.invoiceDate || '',
          status: r.status,
          totalDiff: (r.cgstDiff ?? 0) + (r.sgstDiff ?? 0) + (r.igstDiff ?? 0),
        };
      });
      exportWorkbookAsync({
        type: 'EXPORT_WORKBOOK',
        exportType: 'MONTHLY_COMPARISON',
        payload: {
          rows: exportRows,
          filename: 'Monthly_Tax_Comparison.xlsx',
          debitNotes,
          companyName
        }
      }).catch((err) => {
        console.warn('Async worker export failed, falling back to synchronous:', err);
        exportMonthlyComparison(exportRows, 'Monthly_Comparison.xlsx', debitNotes, companyName);
      });
    } catch (error) {
      console.error('Export error:', error);
      toast.error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleExportDiffSheets = () => {
    if (!rows || rows.length === 0) return;
    try {
      const exportRows: MonthlyComparisonRow[] = rows.map((r) => {
        const pr = r.prRecord;
        const tb = r.twoBRecord;
        return {
          partyTally: pr?.supplierName || '',
          gstinTally: pr?.gstin || '',
          invoiceTally: pr?.invoiceNo || '',
          cgstTally: pr?.cgst || 0,
          sgstTally: pr?.sgst || 0,
          igstTally: pr?.igst || 0,
          taxableTally: pr?.taxableValue || 0,
          dateTally: pr?.invoiceDate || '',
          partyCmp: tb?.supplierName || '',
          gstinCmp: tb?.gstin || '',
          invoiceCmp: tb?.invoiceNo || '',
          cgstCmp: tb?.cgst || 0,
          sgstCmp: tb?.sgst || 0,
          igstCmp: tb?.igst || 0,
          taxableCmp: tb?.taxableValue || 0,
          dateCmp: tb?.invoiceDate || '',
          status: r.status,
          totalDiff: (r.cgstDiff ?? 0) + (r.sgstDiff ?? 0) + (r.igstDiff ?? 0),
        };
      });
      exportWorkbookAsync({
        type: 'EXPORT_WORKBOOK',
        exportType: 'MONTHLY_DIFF',
        payload: {
          rows: exportRows,
          filename: 'Monthly_Difference_Sheets.xlsx',
          debitNotes,
          companyName
        }
      }).catch((err) => {
        console.warn('Async worker export failed, falling back to synchronous:', err);
        exportMonthlyDiffSheets(exportRows, 'Monthly_Difference_Sheets.xlsx', debitNotes, companyName);
      });
    } catch (error) {
      console.error('Export error:', error);
      toast.error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden w-full">
      
      {/* Premium Topbar with dynamic sub-tabs */}
      <div className="bg-slate-50/80 px-6 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
           <div className="dash-dots"><span style={{background:'#A87EE8'}}></span><span style={{background:'#38BDF8'}}></span></div>
           <span className="text-[11px] font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2 font-mono">
             <Layers className="w-4 h-4 text-indigo-600" />
             Monthly Reconciliation Suite
           </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-2xs transition-all">
            <Download className="w-3.5 h-3.5" /> Full Report
          </button>
          <button onClick={handleExportDiffSheets} className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-2xs transition-all">
            <Download className="w-3.5 h-3.5" /> Diff Sheets
          </button>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-2xs transition-all"
            title={isCollapsed ? "Expand Monthly Suite" : "Collapse Monthly Suite"}
          >
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-300", isCollapsed && "rotate-180")} />
            {isCollapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Tax Head Segment Selectors */}
          <div className="flex bg-slate-100/70 p-1.5 border-b border-slate-200 gap-1.5">
            {[
              { id: 'all', label: 'All Taxes Combined' },
              { id: 'igst', label: 'IGST Only' },
              { id: 'cgst', label: 'CGST Only' },
              { id: 'sgst', label: 'SGST Only' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                  activeTab === tab.id 
                    ? 'bg-white text-indigo-700 border border-slate-200 shadow-2xs' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Advice warning notice */}
          {gstr3bData ? (
            <div className="p-3.5 bg-indigo-50/40 border-b border-indigo-100 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-600 leading-relaxed">
                Comparing <strong className="text-slate-900 font-bold">Books (PR)</strong> vs <strong className="text-slate-900 font-bold">Government (2B)</strong> vs <strong className="text-slate-900 font-bold">Claimed (3B)</strong> month-wise. Variances indicate mismatch gaps.
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-start gap-2">
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
                <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-700 font-bold border-b border-slate-200">
                  <th className="px-4 py-3 font-bold border-r border-slate-200">Period</th>
                  <th className="px-4 py-3 text-right font-bold">Books (PR)</th>
                  <th className="px-4 py-3 text-right font-bold border-r border-slate-200">Govt (2B)</th>
                  {gstr3bData && <th className="px-4 py-3 text-right font-bold border-r border-slate-200 text-indigo-700">Claimed (3B)</th>}
                  <th className={cn("px-4 py-3 text-right font-bold", !gstr3bData && "text-rose-600")}>PR vs 2B</th>
                  {gstr3bData && <th className="px-4 py-3 text-right font-bold text-amber-600">2B vs 3B</th>}
                  {gstr3bData && <th className="px-4 py-3 text-right font-bold text-purple-600">PR vs 3B</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-slate-800">
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
                    <tr key={m.sortKey} className={cn("hover:bg-slate-50/80 transition-colors", isNegMonth && "bg-amber-50/30")}>
                      <td className="px-4 py-2.5 font-sans font-bold text-slate-900 border-r border-slate-200">
                        {m.month}
                      </td>
                      <td className="px-4 py-2.5 text-right">{fmt(vals.pr)}</td>
                      <td className="px-4 py-2.5 text-right border-r border-slate-200">{fmt(vals.twoB)}</td>
                      {gstr3bData && (
                        <td className="px-4 py-2.5 text-right font-bold text-indigo-700 border-r border-slate-200">
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
                <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
                  <td className="px-4 py-3 font-sans font-extrabold text-slate-900 border-r border-slate-200">Grand Total</td>
                  <td className="px-4 py-3 text-right">{fmt(totalRowCalculated.pr)}</td>
                  <td className="px-4 py-3 text-right border-r border-slate-200">{fmt(totalRowCalculated.twoB)}</td>
                  {gstr3bData && (
                    <td className="px-4 py-3 text-right text-indigo-700 font-extrabold border-r border-slate-200">
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
        </>
      )}
    </div>
  );
}

