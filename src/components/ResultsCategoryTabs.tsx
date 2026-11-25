import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  UserX,
  LayoutGrid,
  Receipt,
  ShieldAlert,
  Search,
  ListChecks,
} from 'lucide-react';
import { ResultsTable } from './ResultsTable';
import { exportToXlsx, exportWorkbookAsync } from '@/lib/fileParser';
import {
  reconcileDebitNotes,
  debitNoteRowsToReconciliationResults,
  exportDebitNoteReconciliation,
} from '@/lib/debitNoteEngine';
import type { ReconciliationResult, MatchStatus, ReconciliationSummary } from '@/lib/reconciliation';
import { cn } from '@/lib/utils';

export type CategoryKey =
  | 'all'
  | 'perfect'
  | 'valueMismatch'
  | 'invoiceMissing'
  | 'unmatchedVendor'
  | 'missingPR'
  | 'debitNotes'
  | 'taxTypeError'
  | 'wrongGstin'
  | 'booksInput'
  | 'portalInput';

interface ResultsCategoryTabsProps {
  results: ReconciliationResult[];
  summary: ReconciliationSummary;
  companyName: string;
  mode?: 'input' | 'output';
  debitNotes?: { pr?: any[]; twoB?: any[] };
  activeCategory?: CategoryKey;
  onCategoryChange?: (category: CategoryKey) => void;
  onResultsChange?: (newResults: ReconciliationResult[]) => void;
}

interface Category {
  key: CategoryKey;
  label: string;
  icon: React.ElementType;
  statuses: MatchStatus[];
  count: number;
  iconColor: string;
  alwaysVisible?: boolean;
}

function getExportData(results: ReconciliationResult[]) {
  return results.map((r) => {
    const pr = r.prRecord;
    const tb = r.twoBRecord;
    const taxablePR = pr?.taxableValue ?? tb?.taxableValue;
    const taxable2B = tb?.taxableValue ?? pr?.taxableValue;
    const invoiceValuePR =
      taxablePR !== undefined
        ? taxablePR + (pr?.igst ?? tb?.igst ?? 0) + (pr?.cgst ?? tb?.cgst ?? 0) + (pr?.sgst ?? tb?.sgst ?? 0)
        : '';
    const invoiceValue2B =
      taxable2B !== undefined
        ? taxable2B + (tb?.igst ?? pr?.igst ?? 0) + (tb?.cgst ?? pr?.cgst ?? 0) + (tb?.sgst ?? pr?.sgst ?? 0)
        : '';
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

export function ResultsCategoryTabs({
  results,
  summary,
  companyName,
  mode = 'input',
  debitNotes,
  activeCategory,
  onCategoryChange,
  onResultsChange,
}: ResultsCategoryTabsProps) {
  const [internalActive, setInternalActive] = useState<CategoryKey>('all');
  const [search, setSearch] = useState('');
  const active = activeCategory ?? internalActive;
  const setActive = (cat: CategoryKey) => {
    if (onCategoryChange) onCategoryChange(cat);
    else setInternalActive(cat);
  };

  const rawBooksData = Array.from(
    new Map(
      results
        .filter((r) => r.prRecord)
        .map((r) => {
          const pr = r.prRecord!;
          const key = `${pr.gstin}_${pr.invoiceNo}_${pr.invoiceDate}_${pr.igst}_${pr.cgst}_${pr.sgst}`;
          return [
            key,
            {
              'Financial Year': pr.financialYear || '',
              'Supplier Name': pr.supplierName || '',
              GSTIN: pr.gstin || '',
              'Invoice No': pr.invoiceNo || '',
              'Invoice Date': pr.invoiceDate || '',
              'Taxable Value': pr.taxableValue ?? 0,
              IGST: pr.igst ?? 0,
              CGST: pr.cgst ?? 0,
              SGST: pr.sgst ?? 0,
              'Total Amount': (pr.taxableValue ?? 0) + (pr.igst ?? 0) + (pr.cgst ?? 0) + (pr.sgst ?? 0),
              'Voucher Type / Source': pr.sourceLabel || pr.source || 'Purchase Register & JV',
            },
          ];
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
          return [
            key,
            {
              'Financial Year': tb.financialYear || '',
              'Supplier Name': tb.supplierName || '',
              GSTIN: tb.gstin || '',
              'Invoice No': tb.invoiceNo || '',
              'Invoice Date': tb.invoiceDate || '',
              'Taxable Value': tb.taxableValue ?? 0,
              IGST: tb.igst ?? 0,
              CGST: tb.cgst ?? 0,
              SGST: tb.sgst ?? 0,
              'Total Amount': (tb.taxableValue ?? 0) + (tb.igst ?? 0) + (tb.cgst ?? 0) + (tb.sgst ?? 0),
              'Filing Status': tb.filingStatus || '',
              'Filing Date': tb.filingDate || '',
            },
          ];
        })
    ).values()
  );

  const isDebitNoteResult = (r: ReconciliationResult): boolean => {
    const pr = r.prRecord;
    const tb = r.twoBRecord;
    const status = String(r.status || '').toLowerCase();
    if (status.includes('debit note')) return true;
    if (
      r.remark?.toLowerCase().includes('debit note') ||
      r.remark?.toLowerCase().includes('cdnr') ||
      r.remark?.toLowerCase().includes('dn-books') ||
      r.remark?.toLowerCase().includes('dn-2b')
    )
      return true;
    if (pr?.sourceLabel?.toLowerCase().includes('debit') || pr?.sourceLabel?.toLowerCase().includes('dn')) return true;
    if (tb?.sourceLabel?.toLowerCase().includes('debit') || tb?.sourceLabel?.toLowerCase().includes('cdnr') || tb?.sourceLabel?.toLowerCase().includes('dn'))
      return true;

    const hasNegative =
      (pr?.igst ?? 0) < 0 ||
      (pr?.cgst ?? 0) < 0 ||
      (pr?.sgst ?? 0) < 0 ||
      (pr?.taxableValue ?? 0) < 0 ||
      (tb?.igst ?? 0) < 0 ||
      (tb?.cgst ?? 0) < 0 ||
      (tb?.sgst ?? 0) < 0 ||
      (tb?.taxableValue ?? 0) < 0;
    if (hasNegative) return true;

    const dnRegex = /(^|[\/\-_ ])(DN|DBN|DRN|CDNR|DEBIT)(\b|[\/\-_ 0-9])/i;
    if (pr?.invoiceNo && dnRegex.test(pr.invoiceNo)) return true;
    if (tb?.invoiceNo && dnRegex.test(tb.invoiceNo)) return true;

    return false;
  };

  const resultsDebitNotes = useMemo(() => results.filter(isDebitNoteResult), [results]);

  const dnEngineResult = useMemo(() => {
    if (!debitNotes || (!debitNotes.pr?.length && !debitNotes.twoB?.length)) return null;
    return reconcileDebitNotes(debitNotes.pr || [], debitNotes.twoB || []);
  }, [debitNotes]);

  const standaloneDebitNotes = useMemo(() => {
    if (!dnEngineResult) return [];
    return debitNoteRowsToReconciliationResults(dnEngineResult.reconciledRows);
  }, [dnEngineResult]);

  const allDebitNotes = useMemo(() => [...resultsDebitNotes, ...standaloneDebitNotes], [resultsDebitNotes, standaloneDebitNotes]);

  const primaryCategories: Category[] = [
    { key: 'all', label: 'All', icon: LayoutGrid, statuses: [], count: summary.total, iconColor: 'text-indigo-600', alwaysVisible: true },
    { key: 'perfect', label: 'Matched', icon: CheckCircle2, statuses: ['Perfect Match', 'Matched (Diff Date)'], count: summary.perfectMatch, iconColor: 'text-emerald-600', alwaysVisible: true },
    { key: 'valueMismatch', label: 'Value Mismatch', icon: AlertTriangle, statuses: ['Value Mismatch'], count: summary.valueMismatch, iconColor: 'text-amber-600', alwaysVisible: true },
    { key: 'invoiceMissing', label: 'Not in 2B', icon: XCircle, statuses: ['Not in 2B'], count: summary.invoiceMissing, iconColor: 'text-rose-600', alwaysVisible: true },
    { key: 'missingPR', label: 'Not in Books', icon: FileText, statuses: ['Not in Books', 'Missing in PR'], count: summary.missingInPR, iconColor: 'text-purple-600', alwaysVisible: true },
    { key: 'unmatchedVendor', label: 'Party Not in 2B', icon: UserX, statuses: ['Unmatched Vendor'], count: summary.unmatchedVendor, iconColor: 'text-pink-600' },
    { key: 'debitNotes', label: 'Debit Notes', icon: Receipt, statuses: [], count: allDebitNotes.length, iconColor: 'text-amber-600' },
    { key: 'taxTypeError', label: 'Tax Type Error', icon: AlertTriangle, statuses: ['Tax Type Error'], count: summary.taxTypeError || 0, iconColor: 'text-orange-600' },
    { key: 'wrongGstin', label: 'Wrong GSTIN', icon: ShieldAlert, statuses: ['Wrong GSTIN'], count: summary.wrongGstin || 0, iconColor: 'text-red-600' },
  ];

  // Show core categories always, plus any secondary category that has records or is currently active
  const visiblePills = primaryCategories.filter((c) => c.alwaysVisible || c.count > 0 || active === c.key);

  const filteredResults = useMemo(() => {
    if (active === 'all') return results;
    if (active === 'debitNotes') return allDebitNotes;
    if (active === 'booksInput') return results.filter((r) => r.prRecord !== undefined);
    if (active === 'portalInput') return results.filter((r) => r.twoBRecord !== undefined);
    if (active === 'wrongGstin') {
      return results.filter((r) => r.remark?.startsWith('Wrong GSTIN') || r.status === 'Wrong GSTIN');
    }
    const targetStatuses = primaryCategories.find((c) => c.key === active)?.statuses || [];
    return results.filter((r) => targetStatuses.includes(r.status));
  }, [active, results, allDebitNotes]);

  const handleExportCategory = () => {
    try {
      const cat = primaryCategories.find((c) => c.key === active);
      if (active === 'debitNotes' && dnEngineResult) {
        const fileName = 'Reconciled_Debit_Notes_GSTR2B_vs_Books.xlsx';
        exportDebitNoteReconciliation(dnEngineResult, fileName, companyName);
        toast.success('Exported Reconciled Debit Notes (GSTR-2B vs Books) successfully!');
        return;
      }
      const labelName =
        active === 'booksInput'
          ? 'Books_Register'
          : active === 'portalInput'
          ? 'Portal_2B'
          : cat?.label.replace(/[^a-zA-Z0-9]/g, '_') || 'All';
      const fileName = `GST_Reconciliation_${labelName}.xlsx`;
      exportWorkbookAsync({
        type: 'EXPORT_WORKBOOK',
        exportType: 'MASTER',
        payload: {
          results: getExportData(filteredResults),
          filename: fileName,
          companyName,
          debitNotes,
          rawBooksData,
          raw2bData,
        },
      }).catch((err) => {
        console.warn('Async worker export failed, falling back to synchronous:', err);
        exportToXlsx(getExportData(filteredResults), fileName, companyName, undefined, undefined, undefined, debitNotes, rawBooksData, raw2bData);
      });
    } catch (error) {
      console.error('Export error:', error);
      toast.error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden w-full">
      {/* Unified Ledger Toolbar */}
      <div className="p-4 bg-slate-50/70 border-b border-slate-200 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ListChecks className="w-4 h-4 text-indigo-600 shrink-0" />
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">Invoice Audit Ledger</h3>
              <p className="text-xs text-slate-500">Search any invoice, vendor, or GSTIN and inspect side-by-side tax differences.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search invoice, party or GSTIN..."
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 text-xs font-medium text-slate-900 placeholder:text-slate-400 outline-none"
              />
            </div>

            <select
              value={active === 'booksInput' || active === 'portalInput' ? active : 'reco'}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'booksInput' || v === 'portalInput') setActive(v);
                else setActive('all');
              }}
              aria-label="Source dataset view"
              className="h-9 px-3 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="reco">Reconciled View ({summary.total})</option>
              <option value="booksInput">Books Register Only ({rawBooksData.length})</option>
              <option value="portalInput">Portal GSTR-2B Only ({raw2bData.length})</option>
            </select>

            <button
              type="button"
              onClick={handleExportCategory}
              className="h-9 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex items-center gap-1.5 text-xs font-bold transition-all shadow-2xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export ({filteredResults.length.toLocaleString('en-IN')})</span>
            </button>
          </div>
        </div>

        {/* Clean Single-Row Status Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {visiblePills.map((cat) => {
            const isActive = active === cat.key;
            const Icon = cat.icon;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setActive(cat.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all border text-xs font-semibold cursor-pointer',
                  isActive
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs font-bold'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                )}
              >
                <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-white' : cat.iconColor)} />
                <span>{cat.label}</span>
                <span
                  className={cn(
                    'text-[10px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded-full',
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  )}
                >
                  {cat.count.toLocaleString('en-IN')}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Directly Embedded Virtualized Table (Zero Nested Card Chrome) */}
      {filteredResults.length > 0 ? (
        <ResultsTable
          results={filteredResults}
          companyName={companyName}
          mode={mode}
          embedded={true}
          externalSearch={search}
          onResultsChange={onResultsChange}
        />
      ) : (
        <div className="py-16 px-6 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center mx-auto text-indigo-600">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">No Invoices in This Category</h3>
          <p className="text-xs text-slate-500">Select &ldquo;All&rdquo; above to view all reconciled invoices.</p>
        </div>
      )}
    </div>
  );
}
