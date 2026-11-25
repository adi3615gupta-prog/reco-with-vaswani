import { Monitor, ArrowLeft } from 'lucide-react';

interface DesktopOnlyNoticeProps {
  onBack: () => void;
  title?: string;
}

/**
 * Shown in the web build instead of a suite that needs the desktop app
 * (Tally, GST portal automation, local saved data).
 */
export const DesktopOnlyNotice = ({ onBack, title }: DesktopOnlyNoticeProps) => (
  <div className="min-h-[480px] w-full flex items-center justify-center p-12">
    <div className="flex flex-col items-center gap-4 max-w-md w-full p-8 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm text-center">
      <Monitor className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
      <div className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
        {title ? `${title} — ` : ''}Desktop app mein available
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Yeh suite Tally, GST portal ya local data se judi hai, isliye browser version mein nahi chalta.
        Desktop app download karke use karein.
      </p>
      <button
        onClick={onBack}
        className="mt-2 inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider"
      >
        <ArrowLeft className="w-4 h-4" /> Wapas hub par
      </button>
    </div>
  </div>
);
