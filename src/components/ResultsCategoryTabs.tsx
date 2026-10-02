import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, CheckCircle2, AlertTriangle, XCircle, FileText, UserX, LayoutGrid, BookOpen, Landmark } from 'lucide-react';
import { ResultsTable } from './ResultsTable';
import { exportToXlsx } from '@/lib/fileParser';
import type { ReconciliationResult, MatchStatus, ReconciliationSummary } from '@/lib/reconciliation';
import { cn } from '@/lib/utils';

interface ResultsCategoryTabsProps {
  results: ReconciliationResult[];
  summary: ReconciliationSummary;
  companyName: string;
  mode?: 'input' | 'output';
  debitNotes?: { pr?: any[]; twoB?: any[] };
}

type CategoryKey = 'all' | 'perfect' | 'valueMismatch' | 'invoiceMissing' | 'unmatchedVendor' | 'missingPR' | 'taxTypeError' | 'booksInput' | 'portalInput';

interface Category {
  key: CategoryKey;
  label: string;
  icon: React.ElementType;
  statuses: MatchStatus[];
  count: number;
  color: string;
  activeColor: string;
}

function getExportData(results: ReconciliationResult[]) {
  return results.map((r) => {
    const pr = r.prRecord;
    const tb = r.twoBRecord;
    const taxablePR = pr?.taxableValue ?? tb?.taxableValue;
    const taxable2B = tb?.taxableValue ?? pr?.taxableValue;
    const invoiceValuePR = taxablePR !== undefined ? taxablePR + (pr?.igst ?? tb?.igst ?? 0) + (pr?.cgst ?? tb?.cgst ?? 0) + (pr?.sgst ?? tb?.sgst ?? 0) : '';
    const invoiceValue2B = taxable2B !== undefined ? taxable2B + (tb?.igst ?? pr?.igst ?? 0) + (tb?.cgst ?? pr?.cgst ?? 0) + (tb?.sgst ?? pr?.sgst ?? 0) : '';
    return {
      Status: r.status,
      'GSTIN (PR)': pr?.gstin || '',
      'GSTIN (2B)': tb?.gstin || '',
      'Supplier Name (PR)': pr?.supplierName || '',
      'Supplier Name (2B)': tb?.supplierName || '',
      'Invoice No (PR)': pr?.invoiceNo || '',
      'Invoice No (2B)': tb?.invoiceNo || '',
      'Invoice Date (PR)': pr?.invoiceDate || '',
      'Invoice Date (2B)': tb?.invoiceDate || '',
      'Taxable Value (PR)': taxablePR ?? '',
      'Taxable Value (2B)': taxable2B ?? '',
      'Invoice Value (PR)': invoiceValuePR,
      'Invoice Value (2B)': invoiceValue2B,
      'IGST (PR)': pr?.igst ?? '',
      'IGST (2B)': tb?.igst ?? '',
      'CGST (PR)': pr?.cgst ?? '',
      'CGST (2B)': tb?.cgst ?? '',
      'SGST (PR)': pr?.sgst ?? '',
      'SGST (2B)': tb?.sgst ?? '',
      'GST Diff': r.gstDiff ?? '',
      Remark: r.remark ?? '',
      'Auditor Remark': '',
      'Accountant Remark': '',
    };
  });
}

export function ResultsCategoryTabs({ results, summary, companyName, mode = 'input', debitNotes }: ResultsCategoryTabsProps) {
  const [active, setActive] = useState<CategoryKey>('all');

  const rawBooksData = Array.from(
    new Map(
      results
        .filter((r) => r.prRecord)
        .map((r) => {
          const pr = r.prRecord!;
          const key = `${pr.gstin}_${pr.invoiceNo}_${pr.invoiceDate}_${pr.igst}_${pr.cgst}_${pr.sgst}`;
          return [key, {
            'Financial Year': pr.financialYear || '',
            'Supplier Name': pr.supplierName || '',
            'GSTIN': pr.gstin || '',
            'Invoice No': pr.invoiceNo || '',
            'Invoice Date': pr.invoiceDate || '',
            'Taxable Value': pr.taxableValue ?? 0,
            'IGST': pr.igst ?? 0,
            'CGST': pr.cgst ?? 0,
            'SGST': pr.sgst ?? 0,
            'Total Amount': (pr.taxableValue ?? 0) + (pr.igst ?? 0) + (pr.cgst ?? 0) + (pr.sgst ?? 0),
            'Voucher Type / Source': pr.sourceLabel || pr.source || 'Purchase Register & JV'
          }];
        })
    ).values()
  );

  const raw2bData = Array.from(
    new Map(
      results
        .filter((r) => r.twoBRecord)
        .map((r) => {
          const tb = r.twoBRecord!;
          const key = `${tb.gstin}_${tb.invoiceNo}_${tb.invoiceDate}_${tb.igst}_${tb.cgst}_${tb.sgst}`;
          return [key, {
            'Financial Year': tb.financialYear || '',
            'Supplier Name': tb.supplierName || '',
            'GSTIN': tb.gstin || '',
            'Invoice No': tb.invoiceNo || '',
            'Invoice Date': tb.invoiceDate || '',
            'Taxable Value': tb.taxableValue ?? 0,
            'IGST': tb.igst ?? 0,
            'CGST': tb.cgst ?? 0,
            'SGST': tb.sgst ?? 0,
            'Total Amount': (tb.taxableValue ?? 0) + (tb.igst ?? 0) + (tb.cgst ?? 0) + (tb.sgst ?? 0),
            'Filing Status': tb.filingStatus || '',
            'Filing Date': tb.filingDate || ''
          }];
        })
    ).values()
  );

  const categories: Category[] = [
    { key: 'all', label: 'All Records', icon: LayoutGrid, statuses: [], count: summary.total, color: 'text-[var(--np-sky)]', activeColor: 'active' },
    { key: 'perfect', label: 'Perfect Match', icon: CheckCircle2, statuses: ['Perfect Match', 'Matched (Diff Date)'], count: summary.perfectMatch, color: 'text-[var(--np-green)]', activeColor: 'active' },
    { key: 'valueMismatch', label: 'Value Mismatch', icon: AlertTriangle, statuses: ['Value Mismatch'], count: summary.valueMismatch, color: 'text-yellow-500', activeColor: 'active' },
    { key: 'invoiceMissing', label: 'Not in 2B/Govt', icon: XCircle, statuses: ['Not in 2B'], count: summary.invoiceMissing, color: 'text-[var(--np-red)]', activeColor: 'active' },
    { key: 'unmatchedVendor', label: 'Party Not in 2B', icon: UserX, statuses: ['Unmatched Vendor'], count: summary.unmatchedVendor, color: 'text-[var(--np-red)]', activeColor: 'active' },
    { key: 'missingPR', label: 'Not in Books', icon: FileText, statuses: ['Not in Books', 'Missing in PR'], count: summary.missingInPR, color: 'text-[#A87EE8]', activeColor: 'active' },
    { key: 'taxTypeError', label: 'Tax Type Error', icon: AlertTriangle, statuses: ['Tax Type Error'], count: summary.taxTypeError || 0, color: 'text-orange-500', activeColor: 'active' },
    { key: 'booksInput', label: 'Books Purchase & JV Data', icon: BookOpen, statuses: [], count: rawBooksData.length, color: 'text-cyan-400', activeColor: 'active' },
    { key: 'portalInput', label: 'Portal GSTR-2B Data', icon: Landmark, statuses: [], count: raw2bData.length, color: 'text-emerald-400', activeColor: 'active' },
  ];

  const filteredResults = active === 'all'
    ? results
    : active === 'booksInput'
    ? results.filter((r) => r.prRecord !== undefined)
    : active === 'portalInput'
    ? results.filter((r) => r.twoBRecord !== undefined)
    : results.filter((r) => categories.find((c) => c.key === active)?.statuses.includes(r.status));

  const handleExportCategory = () => {
    try {
      const cat = categories.find((c) => c.key === active);
      const fileName = `GST_Reconciliation_${cat?.label.replace(/\s+/g, '_') || 'All'}.xlsx`;
      exportToXlsx(getExportData(filteredResults), fileName, companyName, undefined, undefined, undefined, debitNotes, rawBooksData, raw2bData);
      toast.success(`Exported ${cat?.label || 'records'} successfully!`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Horizontal Audit Filters Bar */}
      <div className="dash-card w-full silk-reveal overflow-hidden">
        <div className="dash-topbar bg-[var(--np-bg3)] flex justify-between items-center px-4 py-2.5">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-3.5 h-3.5 text-[var(--np-sky)]" />
            <span className="text-[10px] font-bold text-[var(--np-text2)] uppercase tracking-widest">Audit Filters</span>
          </div>
          <button onClick={handleExportCategory} className="btn-np-outline gap-1.5 !py-1 !px-3 text-[9px] uppercase tracking-widest font-bold">
            <Download className="w-3 h-3" /> Export List
          </button>
        </div>

        <div className="p-3 flex flex-wrap items-center gap-2 overflow-x-auto">
          {categories.map((cat) => {
            const isActive = active === cat.key;
            const Icon = cat.icon;
            return (
              <button
                key={cat.key}
                onClick={() => setActive(cat.key)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 border group shrink-0',
                  isActive
                    ? 'bg-[var(--np-sky)]/15 border-[var(--np-sky)] text-[var(--np-sky)] shadow-[0_0_12px_rgba(74,158,232,0.2)]'
                    : 'bg-white/[0.02] border-white/10 text-[var(--np-text3)] hover:bg-white/[0.06] hover:text-[var(--np-text2)]'
                )}
              >
                <Icon className={cn('w-3.5 h-3.5 transition-transform group-hover:scale-110', !isActive && cat.color)} />
                <span className="text-[11px] font-bold uppercase tracking-wider">{cat.label}</span>
                <span className={cn(
                  'text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded transition-all ml-0.5',
                  isActive ? 'bg-[var(--np-sky)] text-white' : 'bg-white/10 text-[var(--np-text2)]'
                )}>
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 min-w-0 w-full silk-reveal" style={{ animationDelay: '200ms' }}>
        {filteredResults.length > 0 ? (
          <ResultsTable results={filteredResults} companyName={companyName} mode={mode} />
        ) : (
          <div className="dash-card py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-6 ring-1 ring-white/10">
              <LayoutGrid className="w-8 h-8 text-[var(--np-text3)] opacity-30" />
            </div>
            <h3 className="text-sm font-bold text-[var(--np-text2)] uppercase tracking-[0.2em]">No Audit Trails</h3>
            <p className="text-xs text-[var(--np-text3)] mt-2">No records match the selected audit filter.</p>
          </div>
        )}
      </div>
    </div>
  );
}
