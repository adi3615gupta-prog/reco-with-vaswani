import { useState, useMemo } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, Search, Info } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import type { ReconciliationResult, MatchStatus } from '@/lib/reconciliation';
import { exportToXlsx } from '@/lib/fileParser';
import { daysOldFrom, isLateFiler, deriveItcEligibility, taxRatePct, posCompliance, rule37Warning, actionableRemark } from '@/lib/compliance';
import { cn } from '@/lib/utils';

interface ResultsTableProps {
  results: ReconciliationResult[];
}

const ALL_STATUSES: MatchStatus[] = [
  'Perfect Match', 'Value Mismatch', 'Invoice Missing', 'Unmatched Vendor', 'Missing in PR',
];

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getRowAccent(status: MatchStatus): string {
  switch (status) {
    case 'Perfect Match':
    case 'Matched':
    case 'Matched (Rounded)':
      return '';
    case 'Value Mismatch':
    case 'Mismatch':
      return 'bg-warning/[0.04]';
    case 'Invoice Missing':
    case 'Missing in 2B':
      return 'bg-destructive/[0.04]';
    case 'Unmatched Vendor':
    case 'Wrong GSTIN':
      return 'bg-destructive/[0.05]';
    case 'Missing in PR':
      return 'bg-info/[0.03]';
    case 'Name Matched (No GSTIN)':
    case 'Name Mismatch':
      return 'bg-warning/[0.03]';
    default:
      return '';
  }
}

export function ResultsTable({ results }: ResultsTableProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let data = results;
    if (statusFilter !== 'all') {
      data = data.filter((r) => r.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter((r) => {
        const rec = r.prRecord || r.twoBRecord;
        return (
          rec?.gstin.toLowerCase().includes(q) ||
          rec?.invoiceNo.toLowerCase().includes(q) ||
          rec?.supplierName.toLowerCase().includes(q)
        );
      });
    }
    return data;
  }, [results, statusFilter, search]);

  const handleExport = () => {
    const exportData = filtered.map((r) => {
      const pr = r.prRecord;
      const tb = r.twoBRecord;
      const baseRec = pr || tb;
      const taxableForRate = pr?.taxableValue ?? tb?.taxableValue;
      const totalTax = (pr?.igst ?? tb?.igst ?? 0) + (pr?.cgst ?? tb?.cgst ?? 0) + (pr?.sgst ?? tb?.sgst ?? 0);
      const days = daysOldFrom(pr?.invoiceDate || tb?.invoiceDate);
      const lateFiler = isLateFiler(pr?.invoiceDate || tb?.invoiceDate, tb?.filingDate);
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
        'ITC Eligibility': deriveItcEligibility(baseRec?.supplierName),
        'GSTR-1 Status': tb?.filingStatus ?? '',
        'Filing Date': tb?.filingDate ?? '',
        'Days Old': days,
        'Tax Rate %': taxRatePct(taxableForRate, totalTax),
        'POS Compliance': posCompliance(pr || tb),
        'Rule 37 Warning': rule37Warning(r.status, days),
        'Remark': actionableRemark(r.status, r.remark, lateFiler),
      };
    });
    exportToXlsx(exportData, 'GST_Reconciliation.xlsx');
  };

  return (
    <TooltipProvider delayDuration={150}>
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <CardTitle className="text-base">Detailed Results</CardTitle>
          <div className="flex gap-2 items-center flex-1 sm:flex-none sm:justify-end">
            <div className="relative flex-1 sm:flex-none sm:w-56">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search GSTIN, Invoice, Supplier..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] h-9 text-sm">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleExport} variant="outline" size="sm" className="gap-2 shrink-0">
              <Download className="w-4 h-4" /> Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[180px] text-[11px] uppercase tracking-wider font-semibold">Status</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">GSTIN</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Supplier</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Invoice (PR)</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Invoice (2B)</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold">GST Diff</TableHead>
                <TableHead className="min-w-[200px] text-[11px] uppercase tracking-wider font-semibold">Remark</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No records found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.slice(0, 200).map((r, i) => {
                  const pr = r.prRecord;
                  const tb = r.twoBRecord;
                  const diffVal = r.gstDiff;
                  const diffColor = diffVal !== undefined && diffVal > 1
                    ? 'text-destructive font-semibold'
                    : diffVal !== undefined && diffVal === 0
                      ? 'text-success'
                      : 'text-muted-foreground';
                  const isMismatch = (r.status === 'Value Mismatch' || r.status === 'Mismatch') && pr && tb;
                  return (
                    <TableRow key={i} className={cn('transition-colors', getRowAccent(r.status))}>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="font-mono text-xs">{pr?.gstin || tb?.gstin || '—'}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-sm">{pr?.supplierName || tb?.supplierName}</TableCell>
                      <TableCell className="font-mono text-xs">{pr?.invoiceNo || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{tb?.invoiceNo || '—'}</TableCell>
                      <TableCell className={cn('text-right tabular-nums text-xs', diffColor)}>
                        {isMismatch ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button className={cn('inline-flex items-center gap-1 underline decoration-dotted underline-offset-2', diffColor)}>
                                {fmt(diffVal!)} <Info className="w-3 h-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs">
                              <div className="font-semibold mb-1.5">Tax Difference (PR − 2B)</div>
                              <div className="grid grid-cols-[auto,1fr,auto] gap-x-3 gap-y-0.5 tabular-nums">
                                <div className="text-muted-foreground">CGST</div>
                                <div className="text-right">{fmt(pr!.cgst)} − {fmt(tb!.cgst)}</div>
                                <div className={cn('text-right font-semibold', Math.abs(r.cgstDiff ?? 0) > 1 ? 'text-warning' : '')}>{fmt(r.cgstDiff ?? 0)}</div>
                                <div className="text-muted-foreground">SGST</div>
                                <div className="text-right">{fmt(pr!.sgst)} − {fmt(tb!.sgst)}</div>
                                <div className={cn('text-right font-semibold', Math.abs(r.sgstDiff ?? 0) > 1 ? 'text-warning' : '')}>{fmt(r.sgstDiff ?? 0)}</div>
                                <div className="text-muted-foreground">IGST</div>
                                <div className="text-right">{fmt(pr!.igst)} − {fmt(tb!.igst)}</div>
                                <div className={cn('text-right font-semibold', Math.abs(r.igstDiff ?? 0) > 1 ? 'text-warning' : '')}>{fmt(r.igstDiff ?? 0)}</div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          diffVal !== undefined ? fmt(diffVal) : '—'
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate" title={r.remark}>
                        {r.remark || '—'}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {filtered.length > 200 && (
          <div className="p-3 text-center text-xs text-muted-foreground border-t bg-muted/20">
            Showing 200 of {filtered.length} records. Export to see all.
          </div>
        )}
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}
