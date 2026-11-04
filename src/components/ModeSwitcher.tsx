import React from 'react';
import { ReconciliationMode } from '../lib/mode';
import { cn } from '../lib/utils';

interface ModeSwitcherProps {
  currentMode: ReconciliationMode | null;
  onSwitch: (mode: ReconciliationMode) => void;
}

export const ModeSwitcher: React.FC<ModeSwitcherProps> = ({ currentMode, onSwitch }) => {
  return (
    <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200/90 shadow-2xs">
      <button
        type="button"
        className={cn(
          "px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5",
          currentMode === 'input'
            ? 'bg-indigo-600 text-white shadow-2xs'
            : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
        )}
        onClick={() => onSwitch('input')}
        title="Switch to Purchase Engine (Input Reco: 2B vs Books)"
      >
        <span className={cn("w-1.5 h-1.5 rounded-full", currentMode === 'input' ? 'bg-white' : 'bg-slate-400')} />
        Input Reco
      </button>
      <button
        type="button"
        className={cn(
          "px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5",
          currentMode === 'output'
            ? 'bg-emerald-600 text-white shadow-2xs'
            : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
        )}
        onClick={() => onSwitch('output')}
        title="Switch to Sales Engine (Output Reco: Sales vs GSTR-1)"
      >
        <span className={cn("w-1.5 h-1.5 rounded-full", currentMode === 'output' ? 'bg-white' : 'bg-slate-400')} />
        Output Reco
      </button>
    </div>
  );
};
