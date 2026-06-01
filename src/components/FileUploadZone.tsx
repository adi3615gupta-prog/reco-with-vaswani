import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, Check } from 'lucide-react';
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

export function FileUploadZone({ label, description, onFileSelect, accepted = '.csv,.xlsx,.xls', fileName, className, compact }: FileUploadZoneProps) {
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

  return (
    <div
      className={cn(
        'rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer flex flex-col relative overflow-hidden group',
        isDragging
          ? 'border-blue-500 bg-blue-500/10 shadow-2xl shadow-blue-500/20 scale-[1.02]'
          : fileName
            ? 'border-emerald-500/40 bg-emerald-500/10 shadow-lg'
            : 'border-slate-800 bg-slate-900/30 hover:bg-slate-800/50 hover:border-blue-500/40 shadow-sm',
        className
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className={cn("p-6 flex flex-col items-center justify-center text-center relative z-10 w-full h-full", compact ? "py-6" : "py-12")}>
        <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center">
          <input type="file" accept={accepted} onChange={handleChange} className="hidden" />
          {fileName ? (
            <div className="space-y-4 w-full px-4">
              <div className="mx-auto w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.15)] group-hover:scale-110 transition-transform">
                <Check className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-white/90">{label}</p>
                <p className="text-xs font-medium text-emerald-400/90 truncate w-full">{fileName}</p>
              </div>
              {!compact && <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mt-3 group-hover:text-blue-400 transition-colors">Click to replace file</p>}
            </div>
          ) : (
            <div className={cn("space-y-5", compact ? "space-y-3" : "space-y-5")}>
              <div className="mx-auto w-12 h-12 rounded-xl bg-slate-800/50 flex items-center justify-center border border-slate-700/50 transition-all duration-300 group-hover:scale-110 group-hover:bg-blue-500/20 group-hover:border-blue-500/30 group-hover:shadow-[0_0_25px_rgba(59,130,246,0.2)]">
                <Upload className="w-6 h-6 text-slate-400 group-hover:text-blue-400 transition-colors" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white/90 group-hover:text-white transition-colors">{label}</p>
                {!compact && <p className="text-xs font-medium text-slate-400 max-w-[200px] mx-auto leading-relaxed">{description}</p>}
              </div>
              {!compact && <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest opacity-60">Drag & Drop or Click</p>}
            </div>
          )}
        </label>
      </div>
    </div>
  );
}
