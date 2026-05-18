import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Search, ArrowUpDown, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { aggregateByParty, type PartySummary } from '@/lib/partyWise';
import { exportPartyWise } from '@/lib/fileParser';
import type { ReconciliationResult } from '@/lib/reconciliation';

interface Props {
  results: ReconciliationResult[];
  companyName: string;
  mode?: 'input' | 'output';
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
  if (status === 'Perfect Match' || status === 'Matched' || status === 'Matched (Rounded)') return 'text-success';
  if (status === 'Value Mismatch' || status === 'Mismatch') return 'text-warning';
  if (status === 'Not in Books' || status === 'Missing in PR') return 'text-info';
  return 'text-destructive';
}

export function PartyWiseReport({ results, companyName, mode = 'input' }: Props) {
  const parties = useMemo(() => aggregateByParty(results, mode), [results, mode]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'diff'>('name');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = parties;
    if (q) {
      list = list.filter(
        (p) => p.partyName.toLowerCase().includes(q) || p.gstin.toLowerCase().includes(q)
      );
    }
    if (sortBy === 'diff') {
      list = [...list].sort((a, b) => b.totals.totalDiff - a.totals.totalDiff);
    } else {
      list = [...list].sort((a, b) => (a.partyName || a.key).localeCompare(b.partyName || b.key));
    }
    return list;
  }, [parties, search, sortBy]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by party name or GSTIN…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortBy(sortBy === 'name' ? 'diff' : 'name')}
            className="gap-2 shrink-0"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            Sort
          </Button>
          <Button onClick={() => exportPartyWise(parties, 'Party_Wise_Report.xlsx', companyName)} variant="outline" size="sm" className="gap-2 shrink-0">
            <Download className="w-4 h-4" /> Export
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? 'party' : 'parties'}
      </div>

      <div className="space-y-2">
        {filtered.map((p) => (
          <PartyCard key={p.key} party={p} />
        ))}
        {filtered.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">No parties match your search.</div>
        )}
      </div>
    </div>
  );
}

function PartyCard({ party }: { party: PartySummary }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-xl border border-white/10 bg-card/40 backdrop-blur-md overflow-hidden transition-all duration-500 hover:shadow-xl hover:border-primary/40 hover:-translate-y-0.5">
        <div className={cn('h-1 bg-gradient-to-r', statusStrip(party.overall))} />
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40 transition-colors text-left">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold truncate">{party.partyName || '— No name —'}</span>
                <span className="text-xs text-muted-foreground font-mono">{party.gstin || 'No GSTIN'}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className={cn('text-[10px]', statusBadge(party.overall))}>
                  {party.overall}
                </Badge>
                <span className="text-[11px] text-muted-foreground">{party.totals.count} invoices</span>
                {party.totals.perfectMatch > 0 && (
                  <span className="text-[11px] text-success">{party.totals.perfectMatch} matched</span>
                )}
                {party.totals.valueMismatch > 0 && (
                  <span className="text-[11px] text-warning">{party.totals.valueMismatch} mismatch</span>
                )}
                {(party.totals.invoiceMissing + party.totals.unmatchedVendor) > 0 && (
                  <span className="text-[11px] text-destructive">
                    {party.totals.invoiceMissing + party.totals.unmatchedVendor} missing in 2B
                  </span>
                )}
                {party.totals.missingInPR > 0 && (
                  <span className="text-[11px] text-info">{party.totals.missingInPR} not in books</span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Diff</div>
              <div className={cn(
                'font-mono font-semibold tabular-nums',
                party.totals.totalDiff > 1 ? 'text-warning' : 'text-success'
              )}>
                ₹{fmt(party.totals.totalDiff)}
              </div>
            </div>
            <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', open && 'rotate-180')} />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border bg-muted/20 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Inv (PR)</TableHead>
                  <TableHead className="text-xs">Inv (2B)</TableHead>
                  <TableHead className="text-xs">Date (PR)</TableHead>
                  <TableHead className="text-xs">Date (2B)</TableHead>
                  <TableHead className="text-xs text-right">IGST PR</TableHead>
                  <TableHead className="text-xs text-right">IGST 2B</TableHead>
                  <TableHead className="text-xs text-right">CGST PR</TableHead>
                  <TableHead className="text-xs text-right">CGST 2B</TableHead>
                  <TableHead className="text-xs text-right">SGST PR</TableHead>
                  <TableHead className="text-xs text-right">SGST 2B</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {party.invoices.map((inv, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{inv.invoiceNoPR || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{inv.invoiceNo2B || '—'}</TableCell>
                    <TableCell className="text-xs">{inv.invoiceDatePR || '—'}</TableCell>
                    <TableCell className="text-xs">{inv.invoiceDate2B || '—'}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs">{fmt(inv.igstPR)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs">{fmt(inv.igst2B)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs">{fmt(inv.cgstPR)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs">{fmt(inv.cgst2B)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs">{fmt(inv.sgstPR)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs">{fmt(inv.sgst2B)}</TableCell>
                    <TableCell className={cn('text-xs font-medium', rowStatusColor(inv.status))}>{inv.status}</TableCell>
                  </TableRow>
                ))}
                {/* Totals row */}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={4} className="text-xs">Totals</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs">{fmt(party.totals.igstPR)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs">{fmt(party.totals.igst2B)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs">{fmt(party.totals.cgstPR)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs">{fmt(party.totals.cgst2B)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs">{fmt(party.totals.sgstPR)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs">{fmt(party.totals.sgst2B)}</TableCell>
                  <TableCell className="text-xs">Diff ₹{fmt(party.totals.totalDiff)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
