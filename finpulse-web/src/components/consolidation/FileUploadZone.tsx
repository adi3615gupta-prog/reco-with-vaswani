import { useCallback, useState } from "react";
import { Upload, FileSpreadsheet, AlertCircle } from "lucide-react";
import { parseFile, type ParsedFile } from "@/lib/gst-processor";

interface FileUploadZoneProps {
  onFileParsed: (results: ParsedFile[]) => void;
}

const ACCEPTED = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
];

export function FileUploadZone({ onFileParsed }: FileUploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      for (const file of files) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!ACCEPTED.includes(file.type) && !["xlsx", "xls", "csv"].includes(ext ?? "")) {
          setError(`Unsupported file: ${file.name}. Use .xlsx, .xls, or .csv`);
          return;
        }
      }
      setLoading(true);
      try {
        const results = await Promise.all(files.map(parseFile));
        onFileParsed(results);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to parse files.");
      } finally {
        setLoading(false);
      }
    },
    [onFileParsed]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) handleFiles(files);
    },
    [handleFiles]
  );

  return (
    <div className="w-full max-w-xl mx-auto">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.multiple = true;
          input.accept = ".xlsx,.xls,.csv";
          input.onchange = (e) => {
            const files = Array.from((e.target as HTMLInputElement).files ?? []);
            if (files.length) handleFiles(files);
          };
          input.click();
        }}
        className={`relative cursor-pointer border-2 border-dashed rounded-2xl p-16 text-center transition-all duration-200 ${
          dragging
            ? "border-primary bg-primary/5 scale-[1.02]"
            : "border-border hover:border-primary/50 hover:bg-card"
        }`}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-muted-foreground font-medium">Parsing files…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              {dragging ? (
                <FileSpreadsheet className="w-8 h-8 text-primary" />
              ) : (
                <Upload className="w-8 h-8 text-primary" />
              )}
            </div>
            <div>
              <p className="text-foreground font-semibold text-lg">
                Drop your Tally exports here
              </p>
              <p className="text-muted-foreground text-sm mt-1">
                Upload one or more files • .xlsx, .xls, .csv • all sheets consolidated
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 text-destructive bg-destructive/10 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
