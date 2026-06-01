import { useState, useMemo } from "react";
import { Download, RotateCcw, ChevronLeft, ChevronRight, Database, CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type ProcessedRow, exportToExcel } from "@/lib/gst-processor";
import type { CompanyInfo } from "@/components/consolidation/CompanyInfoForm";
import { toast } from "sonner";

const getApiHost = () => localStorage.getItem('np_server_ip') || window.location.hostname || '127.0.0.1';

interface FileResult {
  fileName: string;
  rows: ProcessedRow[];
  category: string;
}

interface DataPreviewProps {
  files: FileResult[];
  company: CompanyInfo;
  onReset: () => void;
  onSendToReco?: () => void;
}

const PAGE_SIZE = 25;

const COLUMNS = [
  { key: "date", label: "Invoice Date", align: "left" },
  { key: "invoiceNo", label: "Invoice No.", align: "left" },
  { key: "partyName", label: "Party Name", align: "left" },
  { key: "gstNo", label: "GST No.", align: "left" },
  { key: "totalTaxable", label: "Total Taxable", align: "right" },
  { key: "totalCGST", label: "Total CGST", align: "right" },
  { key: "totalSGST", label: "Total SGST", align: "right" },
  { key: "totalIGST", label: "Total IGST", align: "right" },
  { key: "invoiceValue", label: "Invoice Value", align: "right" },
] as const;

function fmt(n: number) {
  return n === 0 ? "—" : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DataPreview({ files, company, onReset, onSendToReco }: DataPreviewProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSentToReco, setIsSentToReco] = useState(false);
  const [activeFile, setActiveFile] = useState(0);
  const [page, setPage] = useState(0);
  const rows = files[activeFile]?.rows ?? [];
  const allRows = useMemo(() => files.flatMap(f => f.rows.map(r => ({ ...r, sourceCategory: f.category }))), [files]);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = useMemo(
    () => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [rows, page]
  );

  const handleDownloadAll = () => {
    files.forEach((f) => {
      const outName = f.fileName.replace(/\.[^.]+$/, "") + "_GST_Report.xlsx";
      exportToExcel(f.rows, outName, company);
    });
  };

  const handleSaveToNetwork = async (): Promise<boolean> => {
    if (!company?.name) {
      toast.error('Missing Company Name', { description: 'Please go back and enter a company name before saving.' });
      return false;
    }

    setIsSaving(true);
    try {
      const payload = {
        id: `${company.name}_consolidated_${Date.now()}`,
        companyName: company.name,
        timestamp: Date.now(),
        records: allRows
      };

      const res = await fetch(`http://${getApiHost()}:3001/api/consolidations`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('np_token')}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned status ${res.status}`);
      }
      
      setIsSaved(true);
      toast.success('Saved to Network!', { description: `${allRows.length} total records saved to the centralized database.` });
      return true;
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error('Sync Failed', { description: err.message || 'Could not connect to the network server to save.' });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-5">
      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {files.length} file{files.length !== 1 ? "s" : ""} processed
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="w-4 h-4 mr-1.5" />
            Start Over
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadAll}>
            <Download className="w-4 h-4 mr-1.5" />
            Export {files.length > 1 ? `${files.length} Reports` : "Excel"}
          </Button>
          <Button 
            size="sm" 
            onClick={handleSaveToNetwork} 
            disabled={isSaving || isSaved}
            className={isSaved ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}
          >
            {isSaving ? <span className="animate-pulse">Saving...</span> : 
             isSaved ? <><CheckCircle className="w-4 h-4 mr-1.5" /> Saved Workspace</> : 
             <><Database className="w-4 h-4 mr-1.5" /> Save Workspace</>}
          </Button>
          
          {onSendToReco && (
            <>
              <Button 
                size="sm" 
                disabled={isSaving || isSentToReco}
                onClick={async () => {
                  if (!isSaved) {
                    const success = await handleSaveToNetwork();
                    if (!success) return;
                  }
                  setIsSentToReco(true);
                  toast.success("Ready for Reconciliation!", { description: "Data has been sent to the Reco Engine." });
                }} 
                className={isSentToReco ? "bg-slate-700 text-slate-400 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-900/20"}
              >
                {isSaving ? "Processing..." : isSentToReco ? "Sent to Reco" : "Send to Reco"}
              </Button>

              {isSentToReco && (
                <Button 
                  size="sm" 
                  onClick={onSendToReco} 
                  className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20 animate-pop-in"
                >
                  Go to GST Reconciliation <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {files.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <button
              key={i}
              onClick={() => {
                setActiveFile(i);
                setPage(0);
              }}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                i === activeFile
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-muted"
              }`}
            >
              {f.fileName} ({f.rows.length}) 
              <span className="ml-1 opacity-70 font-mono text-[10px]">[{f.category}]</span>
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider whitespace-nowrap ${
                      col.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 whitespace-nowrap">{row.date}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{row.invoiceNo}</td>
                  <td className="px-4 py-3 max-w-[200px] truncate">{row.partyName}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.gstNo?.trim() ? (
                      row.gstNo
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                        MISSING
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(row.totalTaxable)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(row.totalCGST)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(row.totalSGST)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(row.totalIGST)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{fmt(row.invoiceValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
