import React from 'react';
import { ReconciliationMode } from '../lib/mode';

interface ModeSwitcherProps {
  currentMode: ReconciliationMode;
  onSwitch: (mode: ReconciliationMode) => void;
}

export const ModeSwitcher: React.FC<ModeSwitcherProps> = ({ currentMode, onSwitch }) => {
  return (
    <div className="flex items-center space-x-1 bg-slate-900/60 p-1 rounded-full border border-slate-800">
      <button
        className={`px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
          currentMode === 'input' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-transparent text-slate-400 hover:text-slate-200'
        }`}
        onClick={() => onSwitch('input')}
      >
        Input Reco
      </button>
      <button
        className={`px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
          currentMode === 'output' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'bg-transparent text-slate-400 hover:text-slate-200'
        }`}
        onClick={() => onSwitch('output')}
      >
        Output Reco
      </button>
    </div>
  );
};