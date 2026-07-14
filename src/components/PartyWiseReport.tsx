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
  debitNotes?: { pr?: any[]; twoB?: any[] };
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

function statusBadgeClass(status: PartySummary['overall']) {
  if (status === 'All Matched') return 'np-badge-green';
  if (status === 'Has Mismatches') return 'np-badge-sky';
  return 'np-badge-red';
}

function rowStatusColor(status: string) {
  if (status === 'Perfect Match' || status === 'Matched' || status === 'Matched (Rounded)') return 'text-[var(--np-green)]';
  if (status === 'Value Mismatch' || status === 'Mismatch') return 'text-yellow-500';
  if (status === 'Not in Books' || status === 'Missing in PR') return 'text-[#A87EE8]';
  return 'text-[var(--np-red)]';
}

export function PartyWiseReport({ results, companyName, mode = 'input', debitNotes }: Props) {
  const parties = useMemo(() => aggregateByParty(results, debitNotes, mode), [results, debitNotes, mode]);
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
    <div className="dash-card overflow-hidden silk-reveal" style={{ animationDelay: '300ms' }}>
      <div className="dash-topbar">
        <div className="flex items-center gap-4">
           <div className="dash-dots"><span style={{background:'#3DCC8E'}}></span><span style={{background:'#F0A030'}}></span></div>
           <span className="text-[10px] font-bold text-[var(--np-text2)] uppercase tracking-widest">Party-wise Intelligence ({filtered.length})</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-48 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--np-text3)] group-focus-within:text-[var(--np-sky)] transition-colors" />
            <input
              placeholder="Search party..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 bg-[var(--np-bg3)]/50 border border-[var(--np-border2)] rounded-md pl-9 pr-4 text-[11px] text-[var(--np-text)] focus:outline-none focus:border-[var(--np-sky)] transition-all"
            />
          </div>
          <button onClick={() => setSortBy(sortBy === 'name' ? 'diff' : 'name')} className="btn-np-outline !py-1.5 !px-3">
            <ArrowUpDown className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="divide-y divide-[var(--np-border)]">
        {filtered.map((p) => (
          <PartyCard key={p.key} party={p} />
        ))}
        {filtered.length === 0 && (
          <div className="p-24 text-center text-[10px] font-bold text-[var(--np-text3)] uppercase tracking-widest italic">No matches in repository</div>
        )}
      </div>
    </div>
  );
}

function PartyCard({ party }: { party: PartySummary }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between gap-6 px-6 py-5 hover:bg-white/[0.02] transition-all group text-left">
          <div className="min-w-0 flex-1 flex items-center gap-6">
            <div className={cn("w-2 h-2 rounded-full", party.overall === 'All Matched' ? 'bg-[var(--np-green)]' : party.overall === 'Has Mismatches' ? 'bg-yellow-500' : 'bg-[var(--np-red)]')} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <span className="font-extrabold text-[13px] text-white truncate uppercase tracking-wide group-hover:text-[var(--np-sky)] transition-colors">{party.partyName || '— UNNAMED COUNTERPARTY —'}</span>
                <span className="np-badge np-badge-muted">{party.gstin || 'NO GSTIN'}</span>
              </div>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-[10px] font-bold text-[var(--np-text3)] uppercase tracking-widest">{party.totals.count} Invoices</span>
                {party.totals.totalDiff !== 0 && (
                  <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest">₹{fmt(party.totals.totalDiff)} Variance</span>
                )}
                <span className={cn("text-[9px] font-black uppercase tracking-[0.2em]", party.overall === 'All Matched' ? 'text-[var(--np-green)]' : party.overall === 'Has Mismatches' ? 'text-yellow-500' : 'text-[var(--np-red)]')}>
                  {party.overall}
                </span>
              </div>
            </div>
          </div>
          <ChevronDown className={cn('w-4 h-4 text-[var(--np-text3)] transition-transform duration-500 group-hover:text-[var(--np-sky)]', open && 'rotate-180')} />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="bg-[var(--np-bg3)]/30 border-t border-[var(--np-border)] p-1 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="np-table !bg-transparent border-none">
              <thead>
                <tr className="!bg-transparent border-none">
                  <th className="!py-2 !px-4 !text-[9px]">Invoice (PR)</th>
                  <th className="!py-2 !px-4 !text-[9px]">Invoice (2B)</th>
                  <th className="!py-2 !px-4 !text-[9px] text-right">IGST PR</th>
                  <th className="!py-2 !px-4 !text-[9px] text-right">IGST 2B</th>
                  <th className="!py-2 !px-4 !text-[9px] text-right">CGST PR</th>
                  <th className="!py-2 !px-4 !text-[9px] text-right">CGST 2B</th>
                  <th className="!py-2 !px-4 !text-[9px] text-right">SGST PR</th>
                  <th className="!py-2 !px-4 !text-[9px] text-right">SGST 2B</th>
                  <th className="!py-2 !px-4 !text-[9px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {party.invoices.map((inv, i) => (
                  <tr key={i} className="!bg-transparent border-none last:border-b-0">
                    <td className="!py-2 !px-4 font-mono !text-[10px]">{inv.invoiceNoPR || '—'}</td>
                    <td className="!py-2 !px-4 font-mono !text-[10px]">{inv.invoiceNo2B || '—'}</td>
                    <td className="!py-2 !px-4 text-right tabular-nums !text-[10px]">{fmt(inv.igstPR)}</td>
                    <td className="!py-2 !px-4 text-right tabular-nums !text-[10px]">{fmt(inv.igst2B)}</td>
                    <td className="!py-2 !px-4 text-right tabular-nums !text-[10px]">{fmt(inv.cgstPR)}</td>
                    <td className="!py-2 !px-4 text-right tabular-nums !text-[10px]">{fmt(inv.cgst2B)}</td>
                    <td className="!py-2 !px-4 text-right tabular-nums !text-[10px]">{fmt(inv.sgstPR)}</td>
                    <td className="!py-2 !px-4 text-right tabular-nums !text-[10px]">{fmt(inv.sgst2B)}</td>
                    <td className={cn('!py-2 !px-4 font-bold !text-[9px] uppercase tracking-widest', rowStatusColor(inv.status))}>{inv.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
