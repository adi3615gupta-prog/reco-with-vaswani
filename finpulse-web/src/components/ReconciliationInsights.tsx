import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  FileWarning,
  Layers,
  Receipt,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { parseDate, type ReconciliationResult, type ReconciliationSummary } from '@/lib/reconciliation';
import { aggregateByParty } from '@/lib/partyWise';
import type { GSTR3BDataBlock } from '@/lib/gstr3bParser';
import { cn } from '@/lib/utils';

interface ReconciliationInsightsProps {
  results: ReconciliationResult[];
  summary: ReconciliationSummary;
  debitNotes?: { pr?: any[]; twoB?: any[] };
  gstr3bData?: GSTR3BDataBlock[] | null;
  mode?: 'input' | 'output';
  onOpenLedger: (categoryKey?: string) => void;
  onOpenPartyStudio: () => void;
  onOpenMonthlyMatrix: () => void;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const GSTR3B_MONTH_MAP: Record<string, string> = {
  Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April',
  May: 'May', Jun: 'June', Jul: 'July', Aug: 'August',
  Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December',
};

function formatINRShort(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1e7) return `₹${(val / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `₹${(val / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `₹${(val / 1e3).toFixed(0)}K`;
  return `₹${Math.round(val)}`;
}

function formatINR(val: number): string {
  const abs = Math.abs(val);
  return `${val < 0 ? '-' : ''}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function resolveMonthKey(dateStr?: string, normalizedDate?: Date | string): { label: string; sortKey: string } | null {
  let d: Date | null = null;
  if (normalizedDate instanceof Date) d = normalizedDate;
  else if (typeof normalizedDate === 'string') d = parseDate(normalizedDate) || new Date(normalizedDate);
  else if (dateStr) d = parseDate(dateStr) || new Date(dateStr);

  if (!d || isNaN(d.getTime())) return null;
  return {
    label: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,
    sortKey: `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`,
  };
}

function sumTax(rec?: { igst?: number; cgst?: number; sgst?: number }): number {
  if (!rec) return 0;
  return (rec.igst || 0) + (rec.cgst || 0) + (rec.sgst || 0);
}

export function ReconciliationInsights({
  results,
  summary,
  debitNotes,
  gstr3bData,
  mode = 'input',
  onOpenLedger,
  onOpenPartyStudio,
  onOpenMonthlyMatrix,
}: ReconciliationInsightsProps) {
  const monthlyChartData = useMemo(() => {
    const map = new Map<string, { label: string; sortKey: string; books: number; portal: number; claimed3b: number }>();

    const ensure = (label: string, sortKey: string) => {
      let row = map.get(sortKey);
      if (!row) {
        row = { label, sortKey, books: 0, portal: 0, claimed3b: 0 };
        map.set(sortKey, row);
      }
      return row;
    };

    for (const r of results) {
      if (r.status === 'Prior FY (Excluded)') continue;
      if (r.prRecord) {
        const mk = resolveMonthKey(r.prRecord.invoiceDate, r.prRecord.normalizedDate);
        if (mk) ensure(mk.label, mk.sortKey).books += sumTax(r.prRecord);
      }
      if (r.twoBRecord) {
        const mk = resolveMonthKey(r.twoBRecord.invoiceDate, r.twoBRecord.normalizedDate);
        if (mk) ensure(mk.label, mk.sortKey).portal += sumTax(r.twoBRecord);
      }
    }

    if (gstr3bData && gstr3bData.length > 0) {
      const netBlocks = gstr3bData.filter(
        (b) => b.level1.toLowerCase().includes('net itc') || b.level1.toLowerCase().includes('(c)')
      );
      for (const row of map.values()) {
        const prefix = row.label.split(' ')[0];
        const mFull = GSTR3B_MONTH_MAP[prefix];
        if (!mFull) continue;
        row.claimed3b = netBlocks.reduce((acc, b) => {
          const comp = b.level3.toLowerCase();
          if (comp.includes('igst') || comp.includes('cgst') || comp.includes('sgst')) {
            return acc + (b.values[mFull as keyof typeof b.values] || 0);
          }
          return acc;
        }, 0);
      }
    }

    return Array.from(map.values())
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map((d) => ({
        ...d,
        books: Math.round(d.books),
        portal: Math.round(d.portal),
        claimed3b: Math.round(d.claimed3b),
      }));
  }, [results, gstr3bData]);

  const statusDistribution = useMemo(() => {
    const buckets = [
      { key: 'perfect', label: 'Perfect & Diff-Date Match', color: '#059669', bg: 'bg-emerald-500', count: 0, tax: 0 },
      { key: 'valueMismatch', label: 'Value Mismatch (> Tol)', color: '#D97706', bg: 'bg-amber-500', count: 0, tax: 0 },
      { key: 'invoiceMissing', label: 'Not in GSTR-2B / Portal', color: '#DC2626', bg: 'bg-rose-500', count: 0, tax: 0 },
      { key: 'missingPR', label: 'In 2B Only (Not in Books)', color: '#7C3AED', bg: 'bg-purple-500', count: 0, tax: 0 },
      { key: 'all', label: 'Other Exceptions / Excluded', color: '#64748B', bg: 'bg-slate-400', count: 0, tax: 0 },
    ];

    for (const r of results) {
      const prTax = sumTax(r.prRecord);
      const tbTax = sumTax(r.twoBRecord);
      if (r.status === 'Perfect Match' || r.status === 'Matched (Diff Date)' || r.status === 'Matched' || r.status === 'Matched (Rounded)') {
        buckets[0].count++;
        buckets[0].tax += r.twoBRecord ? tbTax : prTax;
      } else if (r.status === 'Value Mismatch' || r.status === 'Mismatch') {
        buckets[1].count++;
        buckets[1].tax += Math.abs(r.gstDiff ?? (prTax - tbTax));
      } else if (r.status === 'Not in 2B' || r.status === 'Missing in 2B' || r.status === 'Unmatched Vendor') {
        buckets[2].count++;
        buckets[2].tax += prTax;
      } else if (r.status === 'Not in Books' || r.status === 'Missing in PR') {
        buckets[3].count++;
        buckets[3].tax += tbTax;
      } else {
        buckets[4].count++;
        buckets[4].tax += r.prRecord ? prTax : tbTax;
      }
    }

    const totalCount = Math.max(results.length, 1);
    return buckets.map((b) => ({
      ...b,
      pct: (b.count / totalCount) * 100,
    }));
  }, [results]);

  const topPriorityParties = useMemo(() => {
    const parties = aggregateByParty(results, debitNotes, mode, 'gstin');
    return parties
      .filter((p) => p.overall !== 'All Matched')
      .sort((a, b) => Math.abs(b.totals.totalDiff) - Math.abs(a.totals.totalDiff))
      .slice(0, 6);
  }, [results, debitNotes, mode]);

  const complianceFindings = useMemo(() => {
    const items: {
      title: string;
      detail: string;
      action: string;
      tone: 'rose' | 'amber' | 'purple' | 'emerald' | 'slate';
      filterKey: string;
    }[] = [];

    const missingIn2BCount = summary.invoiceMissing + summary.unmatchedVendor;
    if (missingIn2BCount > 0) {
      const taxRisk = statusDistribution[2].tax;
      items.push({
        title: `${missingIn2BCount.toLocaleString('en-IN')} Books invoices missing in GSTR-2B`,
        detail: `Represents ${formatINR(taxRisk)} ITC not yet reflected in supplier GSTR-1.`,
        action: 'Hold GST payment or request vendor GSTR-1 filing under Sec 16(2)(aa).',
        tone: 'rose',
        filterKey: 'invoiceMissing',
      });
    }

    if (summary.valueMismatch > 0) {
      items.push({
        title: `${summary.valueMismatch.toLocaleString('en-IN')} invoices with tax value mismatch`,
        detail: `Combined tax difference of ${formatINR(statusDistribution[1].tax)} exceeds your match tolerance.`,
        action: 'Verify taxable value / GST components or force-match rounding differences.',
        tone: 'amber',
        filterKey: 'valueMismatch',
      });
    }

    if (summary.missingInPR > 0) {
      items.push({
        title: `${summary.missingInPR.toLocaleString('en-IN')} GSTR-2B credits missing in Books`,
        detail: `${formatINR(statusDistribution[3].tax)} ITC exists on portal but is unbooked in Tally/PR.`,
        action: 'Check for unrecorded vendor bills or eligible unclaimed ITC before GSTR-3B.',
        tone: 'purple',
        filterKey: 'missingPR',
      });
    }

    if ((summary.priorFyExcluded || 0) > 0) {
      items.push({
        title: `${summary.priorFyExcluded.toLocaleString('en-IN')} Prior FY records separated`,
        detail: 'Invoices belonging to previous financial years were excluded from current FY buckets.',
        action: 'Review under Section 16(4) time-limit rules if claiming late credit.',
        tone: 'slate',
        filterKey: 'all',
      });
    }

    if (items.length === 0) {
      items.push({
        title: '100% Books & Portal Alignment Achieved',
        detail: 'All uploaded Purchase Register invoices matched cleanly with GSTR-2B.',
        action: 'Proceed to export your audit working papers or save this run to SQLite.',
        tone: 'emerald',
        filterKey: 'perfect',
      });
    }

    return items;
  }, [summary, statusDistribution]);

  const has3B = Boolean(gstr3bData && gstr3bData.length > 0);

  return (
    <div className="space-y-6">
      {/* Row 1: Charts & Visual Mix */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left: Monthly Books vs Portal Bar Chart */}
        <div className="xl:col-span-7 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                  Month-Wise Tax Trajectory (Books vs GSTR-2B{has3B ? ' vs 3B' : ''})
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Compare monthly IGST + CGST + SGST recorded in Books against Portal availability to spot period timing gaps.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenMonthlyMatrix}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 text-xs font-bold transition-all cursor-pointer"
            >
              <span>Monthly Matrix</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {monthlyChartData.length > 0 ? (
            <div className="h-[260px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={260} minWidth={240}>
                <BarChart data={monthlyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={formatINRShort}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(99, 102, 241, 0.06)' }}
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                    }}
                    formatter={(val: number, name: string) => [formatINR(val), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                  <Bar dataKey="books" name="Books (PR + JV)" fill="#4F46E5" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="portal" name="Portal (GSTR-2B)" fill="#10B981" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  {has3B && (
                    <Bar dataKey="claimed3b" name="Claimed (GSTR-3B)" fill="#F59E0B" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[240px] flex flex-col items-center justify-center text-center bg-slate-50/70 rounded-xl border border-dashed border-slate-200 p-6">
              <Layers className="w-7 h-7 text-slate-400 mb-2" />
              <p className="text-xs font-bold text-slate-700">Monthly dates unavailable for charting</p>
              <p className="text-[11px] text-slate-500 mt-1">Ensure Invoice Date is mapped in Step 2 to plot monthly tax bars.</p>
            </div>
          )}
        </div>

        {/* Right: Status Distribution & Financial Mix */}
        <div className="xl:col-span-5 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                  Reconciliation Outcome Distribution
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Click any bucket to inspect those exact invoices in the Audit Ledger.
              </p>
            </div>
          </div>

          {/* Stacked Bar */}
          <div className="h-3.5 w-full rounded-full overflow-hidden flex bg-slate-100 border border-slate-200">
            {statusDistribution.map((b) =>
              b.pct > 0 ? (
                <div
                  key={b.label}
                  className={cn(b.bg, 'h-full transition-all duration-500')}
                  style={{ width: `${Math.max(b.pct, 1.5)}%` }}
                  title={`${b.label}: ${b.count} (${b.pct.toFixed(1)}%)`}
                />
              ) : null
            )}
          </div>

          {/* Structured Legend Table */}
          <div className="divide-y divide-slate-100">
            {statusDistribution.map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={() => onOpenLedger(b.key)}
                className="w-full py-2.5 px-2 -mx-2 rounded-xl hover:bg-slate-50 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', b.bg)} />
                  <span className="text-xs font-semibold text-slate-700 group-hover:text-indigo-700 truncate">
                    {b.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
                  <span className="text-slate-500">{b.count.toLocaleString('en-IN')} inv</span>
                  <span className="font-bold text-slate-900 w-24 text-right">{formatINR(b.tax)}</span>
                  <span className="text-[11px] font-bold text-slate-500 w-12 text-right">{b.pct.toFixed(1)}%</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Top Discrepancy Vendors + Statutory Action Checklist */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Top Priority Vendors */}
        <div className="xl:col-span-7 bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-600" />
                Priority Vendors by Tax Variance ({topPriorityParties.length})
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Counterparties with highest financial discrepancy requiring follow-up or manual pairing.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenPartyStudio}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition-all cursor-pointer shrink-0"
            >
              <span>Open Party Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {topPriorityParties.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {topPriorityParties.map((p) => {
                const isMissing = p.overall === 'Has Missing';
                return (
                  <div
                    key={p.key}
                    onClick={onOpenPartyStudio}
                    className="px-5 py-3 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-4 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-extrabold text-slate-900 truncate max-w-[260px]">
                          {p.partyName || 'Unnamed Counterparty'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 font-mono text-[11px] font-semibold text-slate-600">
                          {p.gstin || 'NO GSTIN'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500 font-medium">
                        <span>{p.totals.count} invoices</span>
                        <span
                          className={cn(
                            'font-bold',
                            isMissing ? 'text-rose-600' : 'text-amber-700'
                          )}
                        >
                          {p.overall}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-black font-mono text-rose-600">
                        {formatINR(p.totals.totalDiff)}
                      </div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                        Net Tax Variance
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center space-y-2 flex-1 flex flex-col items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <p className="text-sm font-bold text-slate-900">Zero Discrepancy Vendors</p>
              <p className="text-xs text-slate-500">All counterparties reconciled cleanly with zero tax variance.</p>
            </div>
          )}
        </div>

        {/* Statutory Action Checklist */}
        <div className="xl:col-span-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <FileWarning className="w-4 h-4 text-amber-600" />
                Actionable Compliance Briefing
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Plain-English audit summary &amp; recommended next steps.
              </p>
            </div>
          </div>

          <div className="p-4 space-y-3 flex-1">
            {complianceFindings.map((item, idx) => {
              const toneClasses = {
                rose: 'bg-rose-50/70 border-rose-200/80 text-rose-900',
                amber: 'bg-amber-50/70 border-amber-200/80 text-amber-900',
                purple: 'bg-purple-50/70 border-purple-200/80 text-purple-900',
                emerald: 'bg-emerald-50/70 border-emerald-200/80 text-emerald-900',
                slate: 'bg-slate-50 border-slate-200 text-slate-800',
              }[item.tone];

              const badgeColor = {
                rose: 'text-rose-600',
                amber: 'text-amber-600',
                purple: 'text-purple-600',
                emerald: 'text-emerald-600',
                slate: 'text-slate-600',
              }[item.tone];

              return (
                <div
                  key={idx}
                  onClick={() => onOpenLedger(item.filterKey)}
                  className={cn(
                    'p-3.5 rounded-xl border transition-all hover:shadow-xs cursor-pointer space-y-1',
                    toneClasses
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold flex items-center gap-1.5">
                      {item.tone === 'emerald' ? (
                        <CheckCircle2 className={cn('w-4 h-4 shrink-0', badgeColor)} />
                      ) : (
                        <AlertTriangle className={cn('w-4 h-4 shrink-0', badgeColor)} />
                      )}
                      {item.title}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 opacity-60 shrink-0" />
                  </div>
                  <p className="text-xs opacity-90">{item.detail}</p>
                  <p className="text-[11px] font-semibold opacity-80 pt-0.5">
                    Action: {item.action}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
