import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, CheckCircle2, AlertTriangle, XCircle, FileText, UserX, LayoutGrid } from 'lucide-react';
import { ResultsTable } from './ResultsTable';
import { exportToXlsx } from '@/lib/fileParser';
import type { ReconciliationResult, MatchStatus, ReconciliationSummary } from '@/lib/reconciliation';
import { cn } from '@/lib/utils';

interface ResultsCategoryTabsProps {
  results: ReconciliationResult[];
  summary: ReconciliationSummary;
  companyName: string;
  mode?: 'input' | 'output';
}

type CategoryKey = 'all' | 'perfect' | 'valueMismatch' | 'invoiceMissing' | 'unmatchedVendor' | 'missingPR';

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
      'IGST (PR)': pr?.igst ?? '',
      'IGST (2B)': tb?.igst ?? '',
      'CGST (PR)': pr?.cgst ?? '',
      'CGST (2B)': tb?.cgst ?? '',
      'SGST (PR)': pr?.sgst ?? '',
      'SGST (2B)': tb?.sgst ?? '',
      'GST Diff': r.gstDiff ?? '',
      Remark: r.remark ?? '',
    };
  });
}

export function ResultsCategoryTabs({ results, summary, companyName, mode = 'input' }: ResultsCategoryTabsProps) {
  const [active, setActive] = useState<CategoryKey>('all');

  const categories: Category[] = [
    { key: 'all', label: 'All Records', icon: LayoutGrid, statuses: [], count: summary.total, color: 'text-[var(--np-sky)]', activeColor: 'active' },
    { key: 'perfect', label: 'Perfect Match', icon: CheckCircle2, statuses: ['Perfect Match', 'Matched (Diff Date)'], count: summary.perfectMatch, color: 'text-[var(--np-green)]', activeColor: 'active' },
    { key: 'valueMismatch', label: 'Value Mismatch', icon: AlertTriangle, statuses: ['Value Mismatch'], count: summary.valueMismatch, color: 'text-yellow-500', activeColor: 'active' },
    { key: 'invoiceMissing', label: 'Not in 2B/Govt', icon: XCircle, statuses: ['Not in 2B'], count: summary.invoiceMissing, color: 'text-[var(--np-red)]', activeColor: 'active' },
    { key: 'unmatchedVendor', label: 'Unmatched Vendor', icon: UserX, statuses: ['Unmatched Vendor'], count: summary.unmatchedVendor, color: 'text-[var(--np-red)]', activeColor: 'active' },
    { key: 'missingPR', label: 'Not in Books', icon: FileText, statuses: ['Not in Books', 'Missing in PR'], count: summary.missingInPR, color: 'text-[#A87EE8]', activeColor: 'active' },
  ];

  const filteredResults = active === 'all'
    ? results
    : results.filter((r) => categories.find((c) => c.key === active)?.statuses.includes(r.status));

  const handleExportCategory = () => {
    const cat = categories.find((c) => c.key === active);
    const fileName = `GST_Reconciliation_${cat?.label.replace(/\s/g, '_') || 'All'}.xlsx`;
    exportToXlsx(getExportData(filteredResults), fileName, companyName);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      {/* Sidebar Filters */}
      <div className="dash-card w-full lg:w-72 shrink-0 silk-reveal overflow-hidden">
        <div className="dash-topbar bg-[var(--np-bg3)]">
          <span className="text-[10px] font-bold text-[var(--np-text2)] uppercase tracking-widest">Audit Filters</span>
          <LayoutGrid className="w-3.5 h-3.5 text-[var(--np-sky)]" />
        </div>
        <div className="flex flex-col">
          {categories.map((cat) => {
            const isActive = active === cat.key;
            const Icon = cat.icon;
            return (
              <button
                key={cat.key}
                onClick={() => setActive(cat.key)}
                className={cn(
                  'flex items-center justify-between px-6 py-4 transition-all duration-300 border-b border-[var(--np-border)] last:border-0 group',
                  isActive ? 'bg-[var(--np-sky)]/10 text-[var(--np-sky)]' : 'text-[var(--np-text3)] hover:bg-white/[0.02] hover:text-[var(--np-text2)]'
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn('w-4 h-4 transition-transform duration-300 group-hover:scale-110', !isActive && cat.color)} />
                  <span className="text-[11px] font-bold uppercase tracking-wider">{cat.label}</span>
                </div>
                <span className={cn(
                  'text-[10px] font-bold tabular-nums px-2 py-0.5 rounded-md transition-all',
                  isActive ? 'bg-[var(--np-sky)] text-white shadow-[0_0_10px_rgba(74,158,232,0.5)]' : 'bg-white/5 text-[var(--np-text3)]'
                )}>
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="p-4 bg-[var(--np-bg3)]/50">
           <button onClick={handleExportCategory} className="btn-np-outline w-full gap-2 !py-2.5 text-[10px] uppercase tracking-widest font-bold">
              <Download className="w-3.5 h-3.5" /> Export List
           </button>
        </div>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 w-full silk-reveal" style={{ animationDelay: '200ms' }}>
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
