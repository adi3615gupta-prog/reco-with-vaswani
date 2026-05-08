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
      GSTIN: pr?.gstin || tb?.gstin || '',
      'Supplier Name': pr?.supplierName || tb?.supplierName || '',
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

export function ResultsCategoryTabs({ results, summary }: ResultsCategoryTabsProps) {
  const [active, setActive] = useState<CategoryKey>('all');

  const categories: Category[] = [
    { key: 'all', label: 'All Records', icon: LayoutGrid, statuses: [], count: summary.total, color: 'text-primary', activeColor: 'bg-primary text-primary-foreground shadow-lg shadow-primary/25' },
    { key: 'perfect', label: 'Perfect Match', icon: CheckCircle2, statuses: ['Perfect Match'], count: summary.perfectMatch, color: 'text-success', activeColor: 'bg-success text-success-foreground shadow-lg shadow-success/25' },
    { key: 'valueMismatch', label: 'Value Mismatch', icon: AlertTriangle, statuses: ['Value Mismatch'], count: summary.valueMismatch, color: 'text-warning', activeColor: 'bg-warning text-warning-foreground shadow-lg shadow-warning/25' },
    { key: 'invoiceMissing', label: 'Invoice Missing', icon: XCircle, statuses: ['Invoice Missing'], count: summary.invoiceMissing, color: 'text-destructive', activeColor: 'bg-destructive text-destructive-foreground shadow-lg shadow-destructive/25' },
    { key: 'unmatchedVendor', label: 'Unmatched Vendor', icon: UserX, statuses: ['Unmatched Vendor'], count: summary.unmatchedVendor, color: 'text-destructive', activeColor: 'bg-destructive text-destructive-foreground shadow-lg shadow-destructive/25' },
    { key: 'missingPR', label: 'Missing in PR', icon: FileText, statuses: ['Missing in PR'], count: summary.missingInPR, color: 'text-info', activeColor: 'bg-info text-info-foreground shadow-lg shadow-info/25' },
  ];

  const filteredResults = active === 'all'
    ? results
    : results.filter((r) => categories.find((c) => c.key === active)?.statuses.includes(r.status));

  const handleExportCategory = () => {
    const cat = categories.find((c) => c.key === active);
    const fileName = `GST_Reconciliation_${cat?.label.replace(/\s/g, '_') || 'All'}.xlsx`;
    exportToXlsx(getExportData(filteredResults), fileName);
  };

  return (
    <div className="space-y-5">
      {/* Category buttons */}
      <Card className="glass-card overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Filter by Category</CardTitle>
            <Button onClick={handleExportCategory} variant="outline" size="sm" className="gap-2">
              <Download className="w-4 h-4" /> Export {categories.find(c => c.key === active)?.label}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => {
              const isActive = active === cat.key;
              const Icon = cat.icon;
              return (
                <button
                  key={cat.key}
                  onClick={() => setActive(cat.key)}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 border',
                    isActive
                      ? cn(cat.activeColor, 'border-transparent scale-[1.02]')
                      : 'bg-card border-border hover:bg-muted/60 hover:scale-[1.01]'
                  )}
                >
                  <Icon className={cn('w-4 h-4', !isActive && cat.color)} />
                  <span>{cat.label}</span>
                  <span className={cn(
                    'ml-1 px-2 py-0.5 rounded-full text-xs font-bold tabular-nums',
                    isActive ? 'bg-white/20' : 'bg-muted text-muted-foreground'
                  )}>
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Filtered results table */}
      {filteredResults.length > 0 ? (
        <ResultsTable results={filteredResults} />
      ) : (
        <Card className="glass-card">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <LayoutGrid className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground font-medium">No records in this category</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Select a different category to view records</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
