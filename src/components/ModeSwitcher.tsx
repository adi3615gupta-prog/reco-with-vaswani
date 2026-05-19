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
        "flex items-center gap-2 px-3.5 py-1.5 rounded-full border transition-all duration-300 text-sm font-medium active:scale-95",
        "bg-background/80 text-foreground border-input hover:bg-background/95 dark:bg-white/15 dark:text-white dark:border-white/20 dark:hover:bg-white/25 backdrop-blur-sm shadow-[0_0_15px_rgba(0,0,0,0.08)] dark:shadow-[0_0_15px_rgba(255,255,255,0.08)] hover:shadow-[0_0_25px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_0_25px_rgba(255,255,255,0.12)] hover:scale-105"
      )}
      title={`Switch to ${TERMS[otherMode].title}`}
    >
      <Repeat className="w-4 h-4" />
      <span>{currentMode === 'input' ? 'Input' : 'Output'} Mode</span>
    </button>
  );
}