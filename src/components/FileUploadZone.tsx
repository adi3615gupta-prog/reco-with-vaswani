import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, Check, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadZoneProps {
  label: string;
  description: string;
  onFileSelect: (file: File) => void;
  accepted?: string;
  fileName?: string;
  className?: string;
  compact?: boolean;
}

export function FileUploadZone({
  label,
  description,
  onFileSelect,
  accepted = '.csv,.xlsx,.xls',
  fileName,
  className,
  compact
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect]
  );

  // Derive theme accents from label text
  const isPortal = label.toLowerCase().includes('2b') || label.toLowerCase().includes('portal') || label.toLowerCase().includes('govt');
  const isDebit = label.toLowerCase().includes('debit') || label.toLowerCase().includes('dn');

  const themeBorder = isDebit ? 'hover:border-amber-500/60' : isPortal ? 'hover:border-emerald-500/60' : 'hover:border-sky-500/60';
  const themeGlow = isDebit ? 'group-hover:shadow-[0_0_25px_rgba(245,158,11,0.15)]' : isPortal ? 'group-hover:shadow-[0_0_25px_rgba(16,185,129,0.15)]' : 'group-hover:shadow-[0_0_25px_rgba(74,158,232,0.15)]';
  const themeIconBg = isDebit ? 'group-hover:bg-amber-500/15 group-hover:text-amber-400' : isPortal ? 'group-hover:bg-emerald-500/15 group-hover:text-emerald-400' : 'group-hover:bg-sky-500/15 group-hover:text-sky-400';

  return (
    <div
      className={cn(
        'rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer flex flex-col relative overflow-hidden group select-none backdrop-blur-xl',
        isDragging
          ? 'border-indigo-500 bg-indigo-50/80 shadow-md scale-[1.01]'
          : fileName
            ? 'border-emerald-500/50 bg-emerald-50/80 shadow-xs'
            : cn('border-slate-300 hover:border-indigo-400 bg-slate-50/70 hover:bg-white shadow-2xs', themeGlow),
        className
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className={cn("p-6 flex flex-col items-center justify-center text-center relative z-10 w-full h-full", compact ? "py-5" : "py-10")}>
        <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center">
          <input type="file" accept={accepted} onChange={handleChange} className="hidden" />
          
          {fileName ? (
            <div className="space-y-3.5 w-full px-4">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-300 flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                <FileSpreadsheet className="w-6 h-6 text-emerald-700" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">{label}</p>
                <div className="inline-flex items-center gap-1.5 max-w-full px-3 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 font-mono text-xs font-bold truncate shadow-2xs">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="truncate">{fileName}</span>
                </div>
              </div>
              <div className="pt-1">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-white border border-slate-200 text-slate-600 group-hover:text-slate-900 group-hover:border-slate-300 transition-colors shadow-2xs">
                  <RefreshCw className="w-2.5 h-2.5 group-hover:rotate-180 transition-transform duration-500 text-indigo-600" />
                  Click or Drop to Replace
                </span>
              </div>
            </div>
          ) : (
            <div className={cn("space-y-4", compact ? "space-y-2.5" : "space-y-4")}>
              <div className={cn(
                "mx-auto w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-200 transition-all duration-300 group-hover:scale-110 shadow-2xs",
                themeIconBg
              )}>
                <Upload className="w-6 h-6 text-indigo-600 transition-colors group-hover:text-current" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{label}</p>
                {!compact && (
                  <p className="text-xs text-slate-500 max-w-[220px] mx-auto leading-relaxed">{description}</p>
                )}
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider uppercase bg-white border border-slate-200 text-slate-600 group-hover:border-slate-300 shadow-2xs">
                Drag & Drop or Click
              </span>
            </div>
          )}
        </label>
      </div>
    </div>
  );
}
export default FileUploadZone;
