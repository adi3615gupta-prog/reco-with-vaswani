import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface FileUploadZoneProps {
  label: string;
  description: string;
  onFileSelect: (file: File) => void;
  accepted?: string;
  fileName?: string;
}

export function FileUploadZone({ label, description, onFileSelect, accepted = '.csv,.xlsx,.xls', fileName }: FileUploadZoneProps) {
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
    <Card
      className={cn(
        'border-2 border-dashed transition-all duration-500 cursor-pointer group hover:-translate-y-1',
        isDragging
          ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10 scale-[1.02]'
          : fileName
            ? 'border-success/40 bg-success/5 hover:border-success/60'
            : 'border-border hover:border-primary/40 hover:bg-primary/[0.02] hover:shadow-sm'
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <CardContent className="flex flex-col items-center justify-center py-10 px-4">
        <label className="cursor-pointer text-center w-full">
          <input type="file" accept={accepted} onChange={handleChange} className="hidden" />
          {fileName ? (
            <>
              <div className="mx-auto w-14 h-14 rounded-xl bg-success/10 flex items-center justify-center mb-3 ring-1 ring-success/20">
                <Check className="w-7 h-7 text-success animate-in zoom-in duration-300" />
              </div>
              <p className="font-semibold text-foreground">{label}</p>
              <div className="flex items-center gap-2 justify-center mt-2 text-sm text-muted-foreground">
                <FileSpreadsheet className="w-4 h-4 text-success/70" />
                <span className="truncate max-w-[200px]">{fileName}</span>
              </div>
              <p className="text-xs text-muted-foreground/60 mt-2">Click to replace</p>
            </>
          ) : (
            <>
              <div className="mx-auto w-14 h-14 rounded-xl bg-primary/8 flex items-center justify-center mb-3 ring-1 ring-primary/10 group-hover:ring-primary/30 transition-all duration-500 group-hover:scale-110 group-hover:-translate-y-1 group-hover:shadow-lg shadow-primary/20">
                <Upload className="w-7 h-7 text-primary/70 transition-all duration-500 group-hover:text-primary group-hover:animate-bounce" />
              </div>
              <p className="font-semibold text-foreground">{label}</p>
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
              <p className="text-xs text-muted-foreground/60 mt-3">CSV or XLSX • Drag & drop or click</p>
            </>
          )}
        </label>
      </CardContent>
    </Card>
  );
}
