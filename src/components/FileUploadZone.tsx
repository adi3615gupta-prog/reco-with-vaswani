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
          ? 'border-sky-400 bg-sky-500/15 shadow-2xl shadow-sky-500/25 scale-[1.01]'
          : fileName
            ? 'border-emerald-500/40 bg-emerald-950/20 shadow-lg shadow-emerald-950/30'
            : cn('border-slate-800/80 bg-slate-900/40 hover:bg-slate-800/40', themeBorder, themeGlow),
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
              <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.2)] group-hover:scale-105 transition-transform">
                <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">{label}</p>
                <div className="inline-flex items-center gap-1.5 max-w-full px-3 py-1 rounded-full bg-slate-950/60 border border-emerald-500/30 text-emerald-300 font-mono text-xs font-bold truncate">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">{fileName}</span>
                </div>
              </div>
              <div className="pt-1">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-slate-800/60 border border-slate-700/60 text-slate-400 group-hover:text-white group-hover:border-slate-500 transition-colors">
                  <RefreshCw className="w-2.5 h-2.5 group-hover:rotate-180 transition-transform duration-500" />
                  Click or Drop to Replace
                </span>
              </div>
            </div>
          ) : (
            <div className={cn("space-y-4", compact ? "space-y-2.5" : "space-y-4")}>
              <div className={cn(
                "mx-auto w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center border border-slate-700/60 transition-all duration-300 group-hover:scale-110",
                themeIconBg
              )}>
                <Upload className="w-6 h-6 text-slate-400 transition-colors group-hover:text-current" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-white group-hover:text-slate-100 transition-colors">{label}</p>
                {!compact && (
                  <p className="text-xs text-slate-400 max-w-[220px] mx-auto leading-relaxed">{description}</p>
                )}
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider uppercase bg-slate-950/60 border border-slate-800 text-slate-400 group-hover:border-slate-700">
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
