import { useState, useCallback, useEffect } from "react";
import { Stepper } from "@/components/consolidation/Stepper";
import { FileUploadZone } from "@/components/consolidation/FileUploadZone";
import { ColumnMapper } from "@/components/consolidation/ColumnMapper";
import { DataPreview } from "@/components/consolidation/DataPreview";
import { CompanyInfoForm, type CompanyInfo } from "@/components/consolidation/CompanyInfoForm";
import { Database, Trash2, Building2, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import {
  type ParsedFile,
  type ColumnMapping,
  type ProcessedRow,
  processData,
} from "@/lib/gst-processor";
import { getApiBase, getAuthToken } from '@/lib/api';

interface ConsolidationProps {
  onSendToReco?: (companyName: string) => void;
}

export default function Consolidation({ onSendToReco }: ConsolidationProps = {}) {
  const [showQuickGuide, setShowQuickGuide] = useState(false);
  const [step, setStep] = useState(0);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [fileIndex, setFileIndex] = useState(0);
  const [processedByFile, setProcessedByFile] = useState<ProcessedRow[][]>([]);
  const [fileCategories, setFileCategories] = useState<string[]>([]);
  const [networkConsolidations, setNetworkConsolidations] = useState<{id: string, company_name: string, timestamp: number}[]>([]);

  useEffect(() => {
    fetch(`${getApiBase()}/api/consolidations`, {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    })
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data)) setNetworkConsolidations(data);
    })
    .catch(() => {});
  }, []);

  const handleCompany = useCallback(async (info: CompanyInfo) => {
    try {
      const res = await fetch(`${getApiBase()}/api/usage/increment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_name: 'Consolidator' })
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error('Module Locked', { description: data.error || 'Usage limit reached' });
        return;
      }
    } catch (err) {
      toast.error('Connection Error', { description: 'Could not verify usage limits' });
      return;
    }
    setCompany(info);
    setStep(1);
  }, []);

  const handleFileParsed = useCallback((results: ParsedFile[]) => {
    setParsedFiles(results);
    setProcessedByFile([]);
    setFileCategories([]);
    setFileIndex(0);
    setStep(2);
  }, []);

  const handleMapping = useCallback(
    (mapping: ColumnMapping, category: string) => {
      const current = parsedFiles[fileIndex];
      if (!current) return;
      const rows = processData(current.data, mapping);
      
      // Fallback extraction to guarantee Party Name and GSTIN are captured 
      // even if the underlying processor file is outdated
      const patchedRows = rows.map((row, idx) => {
         const originalData = current.data[idx] as Record<string, any>;
         let pName = (row as any).partyName;
         let gNo = (row as any).gstNo;
         
         const mapParty = (mapping as any).partyName;
         const mapGst = (mapping as any).gstNo;

         if (!pName || pName.trim() === "") {
            pName = String(
              (mapParty && originalData[mapParty]) || 
              originalData["Party Name"] || originalData["Particulars"] || originalData["particulars"] || originalData["Supplier Name"] || ""
            );
         }
         
         if (!gNo || gNo.trim() === "") {
            gNo = String(
              (mapGst && originalData[mapGst]) || 
              originalData["GSTIN/UIN"] || originalData["gstin/uin"] || originalData["GSTIN"] || originalData["GST No."] || ""
            );
         }
         
         return { ...row, partyName: pName, gstNo: gNo };
      });

      const next = [...processedByFile];
      next[fileIndex] = patchedRows;
      setProcessedByFile(next);
      setFileCategories(prev => {
        const nextCat = [...prev];
        nextCat[fileIndex] = category;
        return nextCat;
      });
      if (fileIndex + 1 < parsedFiles.length) {
        setFileIndex(fileIndex + 1);
      } else {
        setStep(3);
      }
    },
    [parsedFiles, fileIndex, processedByFile]
  );

  const handleLoadWorkspace = async (c: {id: string, company_name: string}) => {
    const toastId = toast.loading("Loading workspace...");
    try {
      const res = await fetch(`${getApiBase()}/api/consolidations/${c.id}`, {
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      
      // Group the loaded rows back into their original category tabs!
      const categories = Array.from(new Set(data.map((r: any) => r.sourceCategory || 'PR'))) as string[];
      const newParsedFiles: ParsedFile[] = [];
      const newProcessed: ProcessedRow[][] = [];
      const newFileCats: string[] = [];

      categories.forEach(cat => {
          const catRows = data.filter((r: any) => (r.sourceCategory || 'PR') === cat);
          newParsedFiles.push({ fileName: `Saved ${cat} Data`, headers: [], data: [] });
          newProcessed.push(catRows);
          newFileCats.push(cat);
      });

      // Set the states and skip straight to the Preview step
      setCompany({ name: c.company_name });
      setParsedFiles(newParsedFiles);
      setProcessedByFile(newProcessed);
      setFileCategories(newFileCats);
      setStep(3);
      
      toast.success("Workspace loaded successfully!", { id: toastId });
    } catch (err) {
      toast.error("Failed to load workspace", { id: toastId });
    }
  };

  const reset = useCallback(() => {
    setParsedFiles([]);
    setFileIndex(0);
    setProcessedByFile([]);
    setFileCategories([]);
    setCompany(null);
    setStep(0);
  }, []);

  return (
    <div className="relative min-h-screen py-12 px-4 overflow-hidden">
      <div className="max-w-6xl mx-auto relative">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
            GST Data <span className="text-blue-400">Consolidator</span>
          </h1>
          <p className="text-slate-400 mt-4 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
            Enter company details, upload your Tally exports, map the tax ledger columns, and download a clean consolidated GST report.
          </p>
        </div>

        {/* Collapsible Quick Guide */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 text-slate-300 backdrop-blur-md shadow-lg max-w-4xl mx-auto mb-8">
          <button 
            onClick={() => setShowQuickGuide(!showQuickGuide)} 
            className="flex items-center justify-between w-full text-slate-300 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
              <Lightbulb className="w-4 h-4 text-yellow-400" />
              Quick Consolidator User Guide
            </span>
            <span className="text-xs text-blue-400 font-bold hover:underline">{showQuickGuide ? 'Hide' : 'Show Instructions'}</span>
          </button>
          {showQuickGuide && (
            <div className="mt-4 pt-4 border-t border-slate-800/80 text-xs text-slate-400 space-y-4 animate-in fade-in slide-in-from-top-1 duration-350">
              <p><strong>Overview:</strong> Merge multi-branch purchase or sales ledgers exported from Tally/ERP into a unified, consolidated sheet.</p>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="font-bold text-slate-300 mb-1.5">Step-by-step Steps:</p>
                  <ol className="space-y-1.5 pl-4 list-decimal">
                    <li><strong>Company Info:</strong> Enter the target company name, GSTIN (15 characters), and date ranges.</li>
                    <li><strong>Upload Ledgers:</strong> Drag and drop your multiple ledger spreadsheets.</li>
                    <li><strong>Map Ledgers:</strong> Verify column mappings for each ledger (particulars, GSTIN, CGST/SGST/IGST).</li>
                    <li><strong>Preview & Export:</strong> Review the consolidated preview and download the Excel output.</li>
                  </ol>
                </div>
                <div>
                  <p className="font-bold text-slate-300 mb-1.5">Inputs & Outputs:</p>
                  <p className="mb-2"><strong>Required Inputs:</strong> Organization details, and at least two Excel files (purchase/sales registers) containing supplier details and transaction amounts.</p>
                  <p><strong>Outputs Produced:</strong> Unified consolidated registers and raw SQLite tables saved to the server database.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <Stepper currentStep={step} />

        {step === 0 && (
          <div className="space-y-16">
            <CompanyInfoForm initial={company ?? undefined} onContinue={handleCompany} />
            
            {networkConsolidations.length > 0 && (
              <div className="w-full max-w-4xl mx-auto animate-slow-reveal" style={{ animationDelay: '0.2s' }}>
                <div className="flex items-center justify-center gap-3 mb-8 px-2">
                  <Database className="w-5 h-5 text-purple-500" />
                  <h3 className="text-lg font-bold text-white tracking-tight">Saved Consolidations</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-2">
                  {networkConsolidations.map(c => (
                    <div key={c.id} onClick={() => handleLoadWorkspace(c)} className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl shadow-lg p-5 cursor-pointer hover:border-blue-500/50 hover:bg-slate-800/50 transition-all group relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={async (e) => {
                          e.stopPropagation();
                          if (window.confirm("Delete this workspace permanently from the server?")) {
                            try {
                              await fetch(`${getApiBase()}/api/consolidations/${c.id}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
                              });
                              setNetworkConsolidations(prev => prev.filter(item => item.id !== c.id));
                              toast.success("Consolidation deleted from server");
                            } catch (err) { toast.error("Failed to delete workspace"); }
                          }
                        }} className="text-red-400 hover:text-red-300 hover:scale-110 transition-transform p-2">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-3 mb-3">
                        <Building2 className="w-5 h-5 text-purple-400" />
                        <h4 className="font-semibold text-slate-100 truncate pr-8">{c.company_name}</h4>
                      </div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-4">
                        Consolidated Workspace
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>{new Date(c.timestamp).toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 1 && <FileUploadZone onFileParsed={handleFileParsed} />}

        {step === 2 && parsedFiles[fileIndex] && (
          <div className="space-y-4">
            <div className="max-w-2xl mx-auto bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-sm">
              <span className="font-semibold text-blue-400">
                File {fileIndex + 1} of {parsedFiles.length}:
              </span>{" "}
              <span className="text-white">{parsedFiles[fileIndex].fileName}</span>
            </div>
            <ColumnMapper
              key={fileIndex}
              headers={parsedFiles[fileIndex].headers}
              onConfirm={handleMapping}
              onBack={() => {
                if (fileIndex === 0) setStep(1);
                else setFileIndex(fileIndex - 1);
              }}
            />
          </div>
        )}

        {step === 3 && company && (
          <DataPreview files={parsedFiles.map((f, i) => ({ fileName: f.fileName, rows: processedByFile[i] ?? [], category: fileCategories[i] || 'PR' }))} company={company} onReset={reset} onSendToReco={() => onSendToReco?.(company.name)} />
        )}
      </div>
    </div>
  );
}
