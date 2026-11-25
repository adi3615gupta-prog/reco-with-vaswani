import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, HelpCircle } from 'lucide-react';

export interface ConfirmOptions {
  title?: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'destructive' | 'default' | 'warning';
}

export type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) {
    // Safe fallback when used outside ConfirmProvider (e.g. isolated test environments)
    return async (opts: ConfirmOptions | string) => {
      const message = typeof opts === 'string' ? opts : (typeof opts.description === 'string' ? opts.description : opts.title || 'Please confirm');
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        return window.confirm(String(message));
      }
      return true;
    };
  }
  return context;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ description: '' });
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    const normalized: ConfirmOptions = typeof opts === 'string' ? { description: opts } : opts;
    setOptions(normalized);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleCancel = () => {
    setOpen(false);
    resolverRef.current?.(false);
    resolverRef.current = null;
  };

  const handleConfirm = () => {
    setOpen(false);
    resolverRef.current?.(true);
    resolverRef.current = null;
  };

  const isDestructive = options.variant === 'destructive' || (!options.variant && (
    typeof options.description === 'string' && (
      options.description.toLowerCase().includes('delete') ||
      options.description.toLowerCase().includes('clear') ||
      options.description.toLowerCase().includes('reset') ||
      options.description.toLowerCase().includes('remove')
    )
  ));
  const isWarning = options.variant === 'warning';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel(); }}>
        <AlertDialogContent className="max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full shrink-0 ${
                isDestructive
                  ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                  : isWarning
                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                  : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400'
              }`}>
                {isDestructive || isWarning ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <HelpCircle className="w-5 h-5" />
                )}
              </div>
              <AlertDialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                {options.title || (isDestructive ? 'Confirm Destructive Action' : 'Please Confirm')}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed whitespace-pre-line text-left">
              {options.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex-row justify-end gap-2 sm:gap-2">
            <AlertDialogCancel
              onClick={handleCancel}
              className="mt-0 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium"
            >
              {options.cancelText || 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={
                isDestructive
                  ? 'bg-rose-600 hover:bg-rose-700 text-white font-medium'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white font-medium'
              }
            >
              {options.confirmText || (isDestructive ? 'Yes, Proceed' : 'Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
