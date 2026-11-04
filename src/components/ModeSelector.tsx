import React from 'react';
import { ReconciliationMode } from '../lib/mode';
import { FileSpreadsheet, ArrowRight, Layers, ShieldCheck, GitCompare, Sparkles } from 'lucide-react';

interface ModeSelectorProps {
  onSelect: (mode: ReconciliationMode) => void;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({ onSelect }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[55vh] py-10 px-4 animate-fade-in">
      <div className="text-center mb-10 max-w-xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200/80 text-indigo-700 text-xs font-bold uppercase tracking-wider mb-4 shadow-2xs">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <span>GST Reco Engine · Suite 02</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Choose Reconciliation Mode
        </h1>
        <p className="text-sm font-medium text-slate-600 mt-2">
          Select inward or outward matching stream to initialize automated cross-verification.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl w-full mx-auto">
        {/* Input Tax Credit Mode */}
        <button
          onClick={() => onSelect('input')}
          className="flex flex-col items-center text-center p-8 bg-white hover:bg-indigo-50/30 rounded-2xl border-2 border-slate-200 hover:border-indigo-500 shadow-xs hover:shadow-md transition-all cursor-pointer group text-left relative overflow-hidden"
        >
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200/80 text-indigo-600 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform shadow-2xs">
            <FileSpreadsheet className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 mb-2 transition-colors">
            Input Tax Credit (ITC)
          </h2>
          <p className="text-slate-600 text-xs leading-relaxed font-medium mb-5">
            Cross-verify Purchase Register + Journals against GSTR-2B portal downloads. Detect invoice mismatches, missed ITC, and Section 16(2)(aa) risks.
          </p>
          <div className="mt-auto inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-xs font-bold uppercase tracking-wider group-hover:bg-indigo-600 group-hover:text-white transition-all">
            <span>Launch Input Reco</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>

        {/* Output Tax Liability Mode */}
        <button
          onClick={() => onSelect('output')}
          className="flex flex-col items-center text-center p-8 bg-white hover:bg-teal-50/30 rounded-2xl border-2 border-slate-200 hover:border-teal-500 shadow-xs hover:shadow-md transition-all cursor-pointer group text-left relative overflow-hidden"
        >
          <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-200/80 text-teal-600 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform shadow-2xs">
            <Layers className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 group-hover:text-teal-600 mb-2 transition-colors">
            Output Tax Liability
          </h2>
          <p className="text-slate-600 text-xs leading-relaxed font-medium mb-5">
            Reconcile Sales Register against filed GSTR-1 portal returns (B2B, B2CL, B2CS, CDNR, Export). Prevent under-reporting and tax liability interest.
          </p>
          <div className="mt-auto inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-teal-50 text-teal-700 border border-teal-200/80 text-xs font-bold uppercase tracking-wider group-hover:bg-teal-600 group-hover:text-white transition-all">
            <span>Launch Output Reco</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>
      </div>
    </div>
  );
};
