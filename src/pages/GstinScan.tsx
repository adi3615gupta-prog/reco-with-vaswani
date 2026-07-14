import { useState } from 'react';
import { ArrowRight, Search, AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type GstinIssue } from '@/lib/reconciliation';

interface GstinScanProps {
  onBack: () => void;
  gstIssues: { suggested: GstinIssue[]; conflicts: GstinIssue[] } | null;
}

const summaryCard = (title: string, value: number, description: string) => (
  <div className="bg-slate-900/70 border border-slate-700 rounded-3xl p-6 shadow-xl shadow-slate-950/20">
    <p className="text-xs uppercase tracking-[0.25em] text-slate-500 font-bold">{title}</p>
    <p className="mt-4 text-4xl font-black text-white">{value}</p>
    <p className="mt-2 text-sm text-slate-400">{description}</p>
  </div>
);

export default function GstinScan({ onBack, gstIssues }: GstinScanProps) {
  const [showQuickGuide, setShowQuickGuide] = useState(false);
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button variant="secondary" size="sm" onClick={onBack} className="inline-flex items-center gap-2">
            <ArrowRight className="w-4 h-4 rotate-180" /> Back to Hub
          </Button>
          <h1 className="mt-4 text-3xl font-black text-white">GSTIN Scan</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400 leading-relaxed">
            Use this page to review duplicate GSTIN conflicts and wrong-GSTIN suggestions produced by the reconciliation engine.
            If you have already run the GST reconciliation flow, the latest issues will be shown below.
          </p>
        </div>
        <div className="rounded-3xl bg-slate-900/70 border border-slate-700 p-5 flex items-center gap-3 max-w-sm">
          <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-300">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Duplicate logic</p>
            <p className="text-sm text-slate-200">Same GSTIN under different parties in books or fuzzy name mismatch against 2B.</p>
          </div>
        </div>
      </div>

      {/* Collapsible Quick Guide */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 text-slate-300 backdrop-blur-md shadow-lg max-w-full">
        <button 
          onClick={() => setShowQuickGuide(!showQuickGuide)} 
          className="flex items-center justify-between w-full text-slate-300 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
            <Lightbulb className="w-4 h-4 text-yellow-400" />
            Quick GSTIN Scan User Guide
          </span>
          <span className="text-xs text-blue-400 font-bold hover:underline">{showQuickGuide ? 'Hide' : 'Show Instructions'}</span>
        </button>
        {showQuickGuide && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 text-xs text-slate-400 space-y-4 animate-in fade-in slide-in-from-top-1 duration-350">
            <p><strong>Overview:</strong> Scan, detect, and resolve anomalies in client GSTIN registrations, including duplicate party listings in books and mismatched GSTIN numbers against GSTR-2B data.</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="font-bold text-slate-300 mb-1.5">Step-by-step Steps:</p>
                <ol className="space-y-1.5 pl-4 list-decimal">
                  <li><strong>Run Reconciliation:</strong> Ensure you run the GST Reconciliation flow first so that GSTIN issue analysis is generated.</li>
                  <li><strong>Review Duplicates:</strong> Examine duplicate GSTIN conflicts where one GSTIN is linked to multiple supplier names in books.</li>
                  <li><strong>Inspect Wrong GSTIN Suggestions:</strong> Check candidate book parties where names match GSTR-2B suppliers but GSTINs differ.</li>
                  <li><strong>Resolve Data Inconsistencies:</strong> Update client master data in your source ERP to avoid future mismatches.</li>
                </ol>
              </div>
              <div>
                <p className="font-bold text-slate-300 mb-1.5">Inputs & Outputs:</p>
                <p className="mb-2"><strong>Required Inputs:</strong> Reconciled purchase register data and GSTR-2B transactions.</p>
                <p><strong>Outputs Produced:</strong> Duplicated name profiles, wrong/missing GSTIN warnings, and fuzzy name correlation suggestions.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {summaryCard('Duplicate GSTIN', gstIssues?.conflicts.length ?? 0, 'Same GSTIN appears under multiple party names in books.')}
        {summaryCard('Wrong GSTIN', gstIssues?.suggested.filter((x) => x.issueType === 'Wrong GSTIN').length ?? 0, 'Party names matched, but GSTINs differ between books and 2B.')}
        {summaryCard('Missing GSTIN', gstIssues?.suggested.filter((x) => x.issueType === 'Missing GSTIN').length ?? 0, 'Books entries without a GSTIN, but a 2B match exists.')}
      </div>

      {!gstIssues ? (
        <div className="rounded-3xl border border-slate-700 bg-slate-950/80 p-8">
          <div className="flex items-center gap-3 text-yellow-300 mb-4">
            <AlertTriangle className="w-5 h-5" />
            <p className="font-semibold">No GSTIN issue data found yet.</p>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">
            Run the GST Reconciliation module first by selecting <strong>GST Reconciliation</strong> from the hub.
            After reconciliation completes, return here to view duplicate/wrong-GSTIN findings.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
            <h2 className="text-xl font-bold text-white">Top duplicate GSTIN conflicts</h2>
            <p className="mt-2 text-sm text-slate-400">These are GSTIN values linked to more than one party name in books.</p>
            <div className="mt-4 grid gap-4">
              {gstIssues.conflicts.slice(0, 5).map((issue) => (
                <div key={issue.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <p className="text-sm font-semibold text-white">{issue.originalGstin || issue.currentGstin}</p>
                  <p className="mt-1 text-sm text-slate-400">Parties: {issue.relatedParties?.slice(0, 3).join(' • ') || 'Unknown'}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">{issue.issueType}</p>
                </div>
              ))}
              {gstIssues.conflicts.length === 0 && <p className="text-sm text-slate-400">No duplicate conflicts were detected.</p>}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
            <h2 className="text-xl font-bold text-white">Top wrong-GSTIN suggestions</h2>
            <p className="mt-2 text-sm text-slate-400">These are candidate book parties whose GSTIN differs from the likely 2B match.</p>
            <div className="mt-4 grid gap-4">
              {gstIssues.suggested.slice(0, 8).map((issue) => (
                <div key={issue.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <p className="text-sm font-semibold text-white">{issue.supplierName}</p>
                  <p className="mt-1 text-sm text-slate-400">Book GSTIN: {issue.originalGstin || '—'}</p>
                  <p className="text-sm text-slate-400">Suggested GSTIN: {issue.suggestedGstin || '—'}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">{issue.issueType}</p>
                </div>
              ))}
              {gstIssues.suggested.length === 0 && <p className="text-sm text-slate-400">No wrong or missing GSTIN issues were detected.</p>}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-slate-700 bg-slate-950/80 p-6">
        <div className="flex items-center gap-3 text-slate-300 mb-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <p className="font-semibold">Duplicate invoice logic explained</p>
        </div>
        <ul className="text-sm text-slate-400 space-y-3">
          <li>• Duplicate GSTINs are flagged when the same GSTIN appears under different normalized party names in books.</li>
          <li>• Wrong GSTIN is flagged when a book party name matches a 2B supplier name with fuzzy logic, but the GSTIN differs.</li>
          <li>• Use a fuzzy threshold of around 85–90 for high-confidence name matches, and prefer PAN/GSTIN exact matches when available.</li>
        </ul>
      </div>
    </div>
  );
}
