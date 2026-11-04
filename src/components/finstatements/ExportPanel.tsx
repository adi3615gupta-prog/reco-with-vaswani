import { useState, useEffect } from 'react';
import {
  Download,
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  Building2,
  Shield,
  Layers,
  Sparkles,
  Award,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getClientSetup,
  getTrialBalance,
  getFixedAssets,
  getPartnersCapital,
} from '@/lib/finStatements.storage';
import { exportFinancialStatementsExcel } from '@/lib/finStatementsExport';
import PrintableView from './PrintableView';

export default function ExportPanel() {
  const [isPrinting, setIsPrinting] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const client = getClientSetup();

  const handleExcelExport = () => {
    try {
      setIsExportingExcel(true);
      toast.info('Compiling Zero-Merge 8-Sheet Audit Workbook...');

      const tb = getTrialBalance();
      const fa = getFixedAssets();
      const partners = getPartnersCapital();

      let ratioReasons = {};
      let tpAging = [];
      let trAging = [];
      let cwipAging = [];

      try {
        const rr = localStorage.getItem('fs_mca_ratio_reasons_v2');
        if (rr) ratioReasons = JSON.parse(rr);
        const tp = localStorage.getItem('fs_mca_tp_aging_v2');
        if (tp) tpAging = JSON.parse(tp);
        const tr = localStorage.getItem('fs_mca_tr_aging_v2');
        if (tr) trAging = JSON.parse(tr);
        const cw = localStorage.getItem('fs_mca_cwip_aging_v2');
        if (cw) cwipAging = JSON.parse(cw);
      } catch (e) {
        console.warn('Auxiliary disclosures parse warning:', e);
      }

      exportFinancialStatementsExcel({
        clientSetup: client,
        tbEntries: tb,
        fixedAssets: fa,
        partnersCapital: partners,
        denomination: client.denomination || 'in_rupees',
        ratioReasons,
        tpAging,
        trAging,
        cwipAging,
      });

      toast.success('Zero-Merge Excel Workbook exported successfully!');
    } catch (error) {
      console.error(error);
      toast.error('Failed to generate Excel workbook');
    } finally {
      setIsExportingExcel(false);
    }
  };

  // PDF Export
  useEffect(() => {
    if (isPrinting) {
      const timer = setTimeout(() => {
        window.print();
        setIsPrinting(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isPrinting]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-cyan-400" />
            Financial Statement Export Suite
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Zero-Merge Multi-Tab Excel Workbook &bull; Print-Ready Statutory PDF &bull; Companies Act &amp; ICAI June 2022 Compliant
          </p>
        </div>
      </div>

      {/* Feature Guarantee Callout */}
      <div className="p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 backdrop-blur-xl flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              Strict Zero-Merge Architecture Guaranteed
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                ws['!merges'] = []
              </span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Exports contain zero merged cells. Full Excel sorting, filtering, formulas, and VLOOKUP/XLOOKUP operate smoothly without errors.
            </p>
          </div>
        </div>
        <div className="text-[11px] font-mono text-cyan-400 font-bold bg-slate-900/80 px-3 py-1.5 rounded-lg border border-cyan-500/20">
          8 Worksheets Included
        </div>
      </div>

      {/* Export Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Excel Card */}
        <div className="bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 rounded-2xl p-6 flex flex-col justify-between space-y-4 hover:bg-white/[0.02] transition-colors">
          <div>
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
              <FileSpreadsheet className="w-7 h-7 text-emerald-400" />
            </div>
            <h3 className="text-sm font-bold text-white">Consolidated Excel Workbook (.xlsx)</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Generates a master 8-sheet audit package including:
            </p>
            <ul className="mt-3 space-y-1 text-xs text-slate-300 font-mono">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Tab 1: Executive Summary &amp; KPI Dashboard</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Tab 2: Schedule III Balance Sheet</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Tab 3: Statement of Profit &amp; Loss</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Tab 4: AS-3 Indirect Cash Flow Statement</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Tab 5: Notes to Accounts (Notes 1 to 33)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Tab 6: MCA 2021 Ratios &amp; Aging Schedules</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Tab 7: Partner Capital Movement Schedule</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Tab 8: 35+ Preventive IFC Audit Checks</span>
              </li>
            </ul>
          </div>

          <button
            onClick={handleExcelExport}
            disabled={isExportingExcel}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            {isExportingExcel ? 'Compiling Workbook...' : 'Export Complete Excel Suite'}
          </button>
        </div>

        {/* PDF Card */}
        <div className="bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 rounded-2xl p-6 flex flex-col justify-between space-y-4 hover:bg-white/[0.02] transition-colors">
          <div>
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4">
              <FileText className="w-7 h-7 text-rose-400" />
            </div>
            <h3 className="text-sm font-bold text-white">Print-Ready Statutory PDF</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Generates an audit-ready, beautifully formatted statutory report designed for printing or signing:
            </p>
            <ul className="mt-3 space-y-1 text-xs text-slate-300 font-mono">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Formal Corporate Cover &amp; Title Blocks</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Schedule III Balance Sheet with Signatures</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Statement of Profit &amp; Loss</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Detailed Notes to Accounts</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Auditor UDIN &amp; Director Signatory Blocks</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => setIsPrinting(true)}
            disabled={isPrinting}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-rose-600/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <FileText className="w-4 h-4" />
            {isPrinting ? 'Preparing PDF...' : 'Print Statutory PDF'}
          </button>
        </div>
      </div>

      {/* Hidden Print View */}
      {isPrinting && <PrintableView />}
    </div>
  );
}
