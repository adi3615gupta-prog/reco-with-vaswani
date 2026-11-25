import React from 'react';
import { motion } from 'framer-motion';
import { ReconciliationMode } from '../lib/mode';
import { FileSpreadsheet, ArrowRight, Layers } from 'lucide-react';

interface ModeSelectorProps {
  onSelect: (mode: ReconciliationMode) => void;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({ onSelect }) => {
  return (
    <div className="flex flex-col lg:flex-row items-center lg:items-center justify-center gap-4 py-1 px-4 animate-fade-in">
      {/* Title styled like the page header */}
      <div className="text-center lg:text-left lg:w-56 shrink-0">
        <h1 className="text-lg sm:text-xl font-bold tracking-wide uppercase text-slate-900 leading-tight">
          Choose Reconciliation Mode
        </h1>
        <p className="text-xs font-mono text-slate-500 mt-1">
          Select inward or outward matching stream to initialize automated cross-verification.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl w-full">
        {/* Input Tax Credit Mode */}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          onClick={() => onSelect('input')}
          className="flex flex-col items-start text-left gap-2 p-4 bg-white hover:bg-indigo-50/30 rounded-2xl border-2 border-slate-200 hover:border-indigo-500 shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200/80 text-indigo-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-sm">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
              Input Tax Credit (ITC)
            </h2>
          </div>
          <p className="text-slate-700 text-xs leading-snug font-medium w-full">
            Cross-verify Purchase Register + Journals against GSTR-2B portal downloads. Detect invoice mismatches, missed ITC, and Section 16(2)(aa) risks.
          </p>
          <div className="mt-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-xs font-bold uppercase tracking-wider group-hover:bg-indigo-600 group-hover:text-white transition-all">
            <span>Launch Input Reco</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </motion.button>

        {/* Output Tax Liability Mode */}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2 }}
          onClick={() => onSelect('output')}
          className="flex flex-col items-start text-left gap-2 p-4 bg-white hover:bg-teal-50/30 rounded-2xl border-2 border-slate-200 hover:border-teal-500 shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-50 to-teal-100 border border-teal-200/80 text-teal-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-sm">
              <Layers className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-slate-900 group-hover:text-teal-600 transition-colors">
              Output Tax Liability
            </h2>
          </div>
          <p className="text-slate-700 text-xs leading-snug font-medium w-full">
            Reconcile Sales Register against filed GSTR-1 portal returns (B2B, B2CL, B2CS, CDNR, Export). Prevent under-reporting and tax liability interest.
          </p>
          <div className="mt-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-teal-50 text-teal-700 border border-teal-200/80 text-xs font-bold uppercase tracking-wider group-hover:bg-teal-600 group-hover:text-white transition-all">
            <span>Launch Output Reco</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </motion.button>
      </div>
    </div>
  );
};
