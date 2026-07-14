import React from 'react';
import { ReconciliationMode } from '../lib/mode';

interface ModeSelectorProps {
  onSelect: (mode: ReconciliationMode) => void;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({ onSelect }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-12 px-6 animate-pop-in">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-black text-white mb-3 tracking-tight">GST Reconciliation Engine</h1>
        <p className="text-sm font-medium text-slate-400">Please select a reconciliation mode to begin.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl w-full mx-auto">
        <button
          onClick={() => onSelect('input')}
          className="flex flex-col items-center justify-center p-10 bg-slate-900/60 rounded-3xl shadow-xl border border-slate-800 hover:border-blue-500/50 hover:bg-slate-900 transition-all cursor-pointer group backdrop-blur-md"
        >
          <h2 className="text-2xl font-black text-blue-400 mb-4 group-hover:scale-105 transition-transform">Input Reconciliation</h2>
          <p className="text-slate-400 text-center text-sm font-medium">
            Purchase Register + Journals vs GSTR-2B
          </p>
        </button>

        <button
          onClick={() => onSelect('output')}
          className="flex flex-col items-center justify-center p-10 bg-slate-900/60 rounded-3xl shadow-xl border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900 transition-all cursor-pointer group backdrop-blur-md"
        >
          <h2 className="text-2xl font-black text-emerald-400 mb-4 group-hover:scale-105 transition-transform">Output Reconciliation</h2>
          <p className="text-slate-400 text-center text-sm font-medium">
            Sales Register vs GSTR-1
          </p>
        </button>
      </div>
    </div>
  );
};