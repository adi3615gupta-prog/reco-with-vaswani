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
        'dash-card border-2 border-dashed transition-all duration-300 cursor-pointer group flex flex-col',
        isDragging
          ? 'border-[var(--np-sky)] bg-[var(--np-sky)]/5 shadow-2xl shadow-[var(--np-sky)]/10 scale-[1.01]'
          : fileName
            ? 'border-[var(--np-green)]/30 bg-[var(--np-green)]/5'
            : 'border-[var(--np-border2)] hover:border-[var(--np-sky)]/30',
        className
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className={cn("p-6 flex flex-col items-center justify-center text-center", compact ? "py-4" : "py-10")}>
        <label className="cursor-pointer w-full">
          <input type="file" accept={accepted} onChange={handleChange} className="hidden" />
          {fileName ? (
            <div className="space-y-3">
              <div className="mx-auto w-10 h-10 rounded-lg bg-[var(--np-green)]/10 flex items-center justify-center ring-1 ring-[var(--np-green)]/20 shadow-[0_0_15px_rgba(61,204,142,0.1)]">
                <Check className="w-5 h-5 text-[var(--np-green)]" />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-bold text-[var(--np-text)] uppercase tracking-widest">{label}</p>
                <p className="text-[10px] font-medium text-[var(--np-green)] truncate max-w-[180px] mx-auto opacity-80">{fileName}</p>
              </div>
              {!compact && <p className="text-[9px] font-bold text-[var(--np-text3)] uppercase tracking-[0.2em] mt-2 group-hover:text-[var(--np-sky)] transition-colors">Click to replace</p>}
            </div>
          ) : (
            <div className={cn("space-y-4", compact ? "space-y-2" : "space-y-4")}>
              <div className="mx-auto w-10 h-10 rounded-lg bg-[var(--np-sky)]/10 flex items-center justify-center ring-1 ring-[var(--np-sky)]/20 transition-all duration-300 group-hover:scale-110 group-hover:bg-[var(--np-sky)]/20 group-hover:shadow-[0_0_20px_rgba(74,158,232,0.2)]">
                <Upload className="w-5 h-5 text-[var(--np-sky)]" />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-bold text-[var(--np-text)] uppercase tracking-widest">{label}</p>
                {!compact && <p className="text-[10px] font-medium text-[var(--np-text3)]">{description}</p>}
              </div>
              {!compact && <p className="text-[9px] font-bold text-[var(--np-text3)] uppercase tracking-[0.2em] opacity-40">Drag & Drop or Click</p>}
            </div>
          )}
        </label>
      </div>
    </div>
  );
}
