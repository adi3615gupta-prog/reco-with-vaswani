import { useState } from 'react';
import { ArrowLeft, Search, AlertTriangle, CheckCircle2, Lightbulb, ShieldAlert } from 'lucide-react';
import { type GstinIssue } from '@/lib/reconciliation';

interface GstinScanProps {
  onBack: () => void;
  gstIssues: { suggested: GstinIssue[]; conflicts: GstinIssue[] } | null;
}

const summaryCard = (title: string, value: number, description: string) => (
  <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs hover:border-indigo-300 transition-all">
    <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">{title}</p>
    <p className="mt-3 text-3xl font-black text-slate-900">{value}</p>
    <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{description}</p>
  </div>
);

export default function GstinScan({ onBack, gstIssues }: GstinScanProps) {
  const [showQuickGuide, setShowQuickGuide] = useState(false);

  return (
    <div className="w-full max-w-[1520px] mx-auto space-y-5 pb-16 select-text relative z-10 animate-fade-in font-sans text-slate-900">
      
      {/* ─── Top Elevated Header Bar ─── */}
      <header className="bg-white/95 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 border border-slate-200/80">
        <div className="flex items-center gap-3.5 min-w-0">
          <button 
            onClick={onBack} 
            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 transition shrink-0 cursor-pointer"
            title="Back to Central Command Hub"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200/70 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs">
            <Search className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold tracking-wide uppercase text-slate-900 leading-tight">
                GSTIN Smart Scanner &amp; Conflict Auditor
              </h1>
              <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 font-bold uppercase tracking-wider shrink-0">
                Suite 01.2 · Mod-36
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5 truncate max-w-xl">
              Inspect duplicate GSTIN vendor accounts, wrong state codes, and fuzzy name correlation mismatches against GSTR-2B.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 shadow-2xs flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Checksum Rule Engine Active</span>
          </div>
        </div>
      </header>

      {/* ─── Collapsible Quick Guide ─── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 text-slate-700 shadow-2xs">
        <button 
          onClick={() => setShowQuickGuide(!showQuickGuide)} 
          className="flex items-center justify-between w-full text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-slate-800">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            Quick GSTIN Scan User Guide
          </span>
          <span className="text-xs text-indigo-600 font-bold hover:underline">{showQuickGuide ? 'Hide Instructions' : 'Show Instructions'}</span>
        </button>
        {showQuickGuide && (
          <div className="mt-4 pt-4 border-t border-slate-200/80 text-xs text-slate-600 space-y-4 animate-in fade-in slide-in-from-top-1 duration-350">
            <p className="leading-relaxed"><strong>Overview:</strong> Scan, detect, and resolve anomalies in client GSTIN registrations, including duplicate party listings in books and mismatched GSTIN numbers against GSTR-2B data.</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="font-bold text-slate-800 mb-1.5">Step-by-step Guide:</p>
                <ol className="space-y-1.5 pl-4 list-decimal text-slate-600">
                  <li><strong>Run Reconciliation:</strong> Ensure you run the GST Reconciliation flow first so that GSTIN issue analysis is generated.</li>
                  <li><strong>Review Duplicates:</strong> Examine duplicate GSTIN conflicts where one GSTIN is linked to multiple supplier names in books.</li>
                  <li><strong>Inspect Wrong GSTIN Suggestions:</strong> Check candidate book parties where names match GSTR-2B suppliers but GSTINs differ.</li>
                  <li><strong>Resolve Data Inconsistencies:</strong> Update client master data in your source ERP to avoid future mismatches.</li>
                </ol>
              </div>
              <div>
                <p className="font-bold text-slate-800 mb-1.5">Required Inputs &amp; Outputs:</p>
                <p className="mb-2 leading-relaxed"><strong>Required Inputs:</strong> Reconciled purchase register data and GSTR-2B transactions.</p>
                <p className="leading-relaxed"><strong>Outputs Produced:</strong> Duplicated name profiles, wrong/missing GSTIN warnings, and fuzzy name correlation suggestions.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── 3 KPI Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {summaryCard('Duplicate GSTIN Conflicts', gstIssues?.conflicts.length ?? 0, 'Same GSTIN appears under multiple party names in books.')}
        {summaryCard('Wrong GSTIN Matches', gstIssues?.suggested.filter((x) => x.issueType === 'Wrong GSTIN').length ?? 0, 'Party names matched, but GSTINs differ between books and portal.')}
        {summaryCard('Missing GSTIN Records', gstIssues?.suggested.filter((x) => x.issueType === 'Missing GSTIN').length ?? 0, 'Books entries without a GSTIN, but a valid 2B match exists.')}
      </div>

      {!gstIssues ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xs">
          <div className="flex items-center gap-3 text-amber-600 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-sm text-slate-900">No GSTIN issue data generated yet</h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
            Run the GST Reconciliation engine first by selecting <strong>Suite 02 · Reconciliation Engine</strong> from the hub.
            After reconciliation finishes, return here to view duplicate conflicts, wrong-GSTIN cross-state matches, and auto-suggested fixes.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Duplicate GSTIN Conflicts in Books</span>
            </h2>
            <p className="mt-1 text-xs text-slate-500">These are identical GSTIN numbers linked to multiple distinct party ledger names in accounting books.</p>
            <div className="mt-4 grid gap-3">
              {gstIssues.conflicts.slice(0, 5).map((issue) => (
                <div key={issue.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 hover:bg-white hover:border-indigo-300 transition-all shadow-2xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs font-bold font-mono text-indigo-700 select-all">{issue.originalGstin || issue.currentGstin}</p>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                      {issue.issueType}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-700 font-medium">Parties in Books: <span className="font-bold text-slate-900">{issue.relatedParties?.slice(0, 3).join(' • ') || 'Unknown'}</span></p>
                </div>
              ))}
              {gstIssues.conflicts.length === 0 && <p className="text-xs text-slate-500 italic">No duplicate GSTIN conflicts were detected in the active reconciliation batch.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Suggested GSTIN Corrections</span>
            </h2>
            <p className="mt-1 text-xs text-slate-500">Candidate vendor ledgers whose recorded GSTIN differs from the matched GSTR-2B portal supplier.</p>
            <div className="mt-4 grid gap-3">
              {gstIssues.suggested.slice(0, 8).map((issue) => (
                <div key={issue.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 hover:bg-white hover:border-indigo-300 transition-all shadow-2xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs font-bold text-slate-900">{issue.supplierName}</p>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                      {issue.issueType}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                    <p className="text-slate-600">Books GSTIN: <span className="font-bold text-slate-800">{issue.originalGstin || '—'}</span></p>
                    <p className="text-indigo-700">Suggested GSTIN: <span className="font-bold text-indigo-700">{issue.suggestedGstin || '—'}</span></p>
                  </div>
                </div>
              ))}
              {gstIssues.suggested.length === 0 && <p className="text-xs text-slate-500 italic">No wrong or missing GSTIN issues were detected.</p>}
            </div>
          </div>
        </div>
      )}

      {/* ─── Educational Note Card ─── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div className="flex items-center gap-2.5 text-slate-900 mb-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <h4 className="font-bold text-xs uppercase tracking-wider">Duplicate Invoice &amp; GSTIN Detection Logic</h4>
        </div>
        <ul className="text-xs text-slate-600 space-y-2 leading-relaxed">
          <li>• <strong>Duplicate GSTIN:</strong> Flagged when the same GSTIN number is linked to different normalized party ledger titles in accounting books.</li>
          <li>• <strong>Wrong GSTIN:</strong> Flagged when a book party name matches a GSTR-2B supplier name with fuzzy logic, but state codes or digits differ.</li>
          <li>• <strong>Threshold Standard:</strong> Antigravity matching engine uses a 90% confidence threshold to prevent false positives and prioritize PAN/GSTIN exact matches.</li>
        </ul>
      </div>
    </div>
  );
}
