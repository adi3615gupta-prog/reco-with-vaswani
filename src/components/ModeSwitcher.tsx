import { Repeat } from 'lucide-react';
import type { ReconciliationMode } from '@/lib/mode';
import { TERMS } from '@/lib/mode';
import { cn } from '@/lib/utils';

interface ModeSwitcherProps {
  currentMode: ReconciliationMode;
  onSwitch: () => void;
}

export function ModeSwitcher({ currentMode, onSwitch }: ModeSwitcherProps) {
  const otherMode = currentMode === 'input' ? 'output' : 'input';
  
  return (
    <button
      onClick={onSwitch}
      className={cn(
        "flex items-center gap-2 px-3.5 py-1.5 rounded-full border transition-all duration-300",
        "bg-white/15 text-white border-white/20 hover:bg-white/25 backdrop-blur-sm shadow-[0_0_15px_rgba(255,255,255,0.1)]",
        "hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] hover:scale-105 active:scale-95 text-sm font-medium"
      )}
      title={`Switch to ${TERMS[otherMode].title}`}
    >
      <Repeat className="w-4 h-4" />
      <span>{currentMode === 'input' ? 'Input' : 'Output'} Mode</span>
    </button>
  );
}