import { useState, useRef } from 'react';
import { ArrowLeft, ImageIcon, UploadCloud, CheckCircle2, FileSpreadsheet, X } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from "xlsx";
import XLSXStyle from "xlsx-js-style";

const getApiHost = () => localStorage.getItem('np_server_ip') || window.location.hostname || '127.0.0.1';

interface ImageToExcelProps {
  onBack: () => void;
}

export default function ImageToExcel({ onBack }: ImageToExcelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [parsedData, setParsedData] = useState<any[] | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);
    
    // Sort files alphabetically to ensure "Pg 1 (A)", "Pg 1 (B)", etc. are ordered correctly
    const sortedFiles = filesArray.sort((a, b) => a.name.localeCompare(b.name));
    setSelectedFiles(sortedFiles);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const processImages = async () => {
    if (selectedFiles.length === 0) {
      toast.error('Please upload at least one image.');
      return;
    }

    try {
      const res = await fetch(`http://${getApiHost()}:3001/api/usage/increment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` },
        body: JSON.stringify({ module_name: 'OCR' })
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
    
    setIsProcessing(true);
    try {
      // Convert all images to Base64
      const base64Images = await Promise.all(selectedFiles.map(file => convertToBase64(file)));
      
      // Send to Vision API backend
      const res = await fetch(`http://${getApiHost()}:3001/api/vision-extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` },
        body: JSON.stringify({ images: base64Images })
      });
      
      if (!res.ok) throw new Error("Failed to extract data from images.");
      
      const data = await res.json();
      
      if (data && Array.isArray(data.records) && data.records.length > 0) {
        setParsedData(data.records);
        toast.success("Extraction Complete", { description: `Extracted ${data.records.length} rows successfully.` });
      } else {
        throw new Error("No tabular data could be identified in the provided images.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Processing Failed", { description: err.message || "An error occurred during AI extraction." });
    } finally {
      setIsProcessing(false);
    }
  };

  const exportToExcel = () => {
    if (!parsedData || parsedData.length === 0) return;

    try {
      // 1. Extract dynamic headers from all JSON objects
      const headerSet = new Set<string>();
      parsedData.forEach(row => Object.keys(row).forEach(k => headerSet.add(k)));
      
      // Standardize ordering as requested
      const standardHeaders = ["Date", "Particulars", "Voucher Type", "Voucher No.", "Voucher Ref. No.", "GSTIN/UIN", "Narration", "Value", "Gross Total"];
      const dynamicHeaders = Array.from(headerSet).filter(h => !standardHeaders.some(sh => h.toLowerCase().includes(sh.toLowerCase())));
      const finalHeaders = [...standardHeaders, ...dynamicHeaders];

      const aoa: any[][] = [];
      
      // 2. Static Company Header Block
      aoa.push(["EXTRACTED COMPANY DATA PVT. LTD."]);
      aoa.push(["Automated Address Line 1"]);
      aoa.push(["Automated Address Line 2"]);
      aoa.push(["Automated Address Line 3"]);
      aoa.push(["Vision Extracted Journal Register"]);
      aoa.push(["Extracted Data Period"]);
      
      // 3. Bold Table Headers
      aoa.push(finalHeaders);

      // 4. Data Rows
      parsedData.forEach((row: any) => {
        const rowData = finalHeaders.map(header => {
            // Look for case-insensitive matches in the JSON object
            const keyMatch = Object.keys(row).find(k => k.toLowerCase() === header.toLowerCase());
            return keyMatch ? row[keyMatch] : "";
        });
        aoa.push(rowData);
      });

      // 5. Build Excel Sheet with XLSXStyle
      const ws = XLSXStyle.utils.aoa_to_sheet(aoa);
      ws["!freeze"] = { xSplit: 0, ySplit: 7 }; // Freeze top 7 rows

      // Apply Styles
      const maxCols = finalHeaders.length;
      const borderStyle = { top: { style: "thin", color: { rgb: "A6A6A6" } }, bottom: { style: "thin", color: { rgb: "A6A6A6" } }, left: { style: "thin", color: { rgb: "A6A6A6" } }, right: { style: "thin", color: { rgb: "A6A6A6" } } };
      const headerStyle = { font: { bold: true, color: { rgb: "000000" }, sz: 10, name: "Arial" }, fill: { patternType: "solid", fgColor: { rgb: "F2F2F2" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: borderStyle };
      const companyHeaderStyle = { font: { bold: true, sz: 12, name: "Arial" }, alignment: { horizontal: "center", vertical: "center" } };
      const companySubHeaderStyle = { font: { bold: true, sz: 10, name: "Arial" }, alignment: { horizontal: "center", vertical: "center" } };
      const dataStyle = { font: { name: "Arial", sz: 10 }, alignment: { vertical: "center" }, border: borderStyle };

      for (let R = 0; R < aoa.length; ++R) {
        for (let C = 0; C < maxCols; ++C) {
          const cellRef = XLSXStyle.utils.encode_cell({ r: R, c: C });
          if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
          
          if (R === 0) ws[cellRef].s = companyHeaderStyle;
          else if (R > 0 && R < 6) ws[cellRef].s = companySubHeaderStyle;
          else if (R === 6) ws[cellRef].s = headerStyle;
          else ws[cellRef].s = dataStyle;

          // Format numbers correctly
          if (R >= 7 && ws[cellRef].v) {
            let valStr = String(ws[cellRef].v).trim();
            const num = parseFloat(valStr.replace(/,/g, '').replace(/[^\d.-]/g, ''));
            if (!isNaN(num) && valStr !== "" && !finalHeaders[C].toLowerCase().includes("date") && !finalHeaders[C].toLowerCase().includes("no.") && !finalHeaders[C].toLowerCase().includes("gstin")) {
              ws[cellRef].t = 'n';
              ws[cellRef].v = num;
              ws[cellRef].z = '#,##0.00';
            }
          }
        }
      }

      // Auto-fit column widths
      const colWidths = finalHeaders.map(h => ({ wch: Math.max(12, h.length + 5) }));
      ws["!cols"] = colWidths;
      
      ws["!merges"] = [
        { s: {r:0, c:0}, e: {r:0, c:maxCols - 1} },
        { s: {r:1, c:0}, e: {r:1, c:maxCols - 1} },
        { s: {r:2, c:0}, e: {r:2, c:maxCols - 1} },
        { s: {r:3, c:0}, e: {r:3, c:maxCols - 1} },
        { s: {r:4, c:0}, e: {r:4, c:maxCols - 1} },
        { s: {r:5, c:0}, e: {r:5, c:maxCols - 1} },
      ];

      const wb = XLSXStyle.utils.book_new();
      XLSXStyle.utils.book_append_sheet(wb, ws, "Extracted Data");
      XLSXStyle.writeFile(wb, "Vision_Extracted_Register.xlsx");
      toast.success("Excel Downloaded", { description: "Data formatted successfully." });
    } catch (err: any) {
      console.error(err);
      toast.error("Export Failed", { description: "An error occurred during Excel generation." });
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-6">
        <div>
          <button onClick={onBack} className="text-slate-400 hover:text-white flex items-center gap-2 font-bold uppercase tracking-wider text-[10px] mb-4 transition-colors"><ArrowLeft className="w-3 h-3" /> Back to Hub</button>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3"><ImageIcon className="w-8 h-8 text-yellow-500" /> Image to Excel Engine</h1>
          <p className="text-slate-400 font-medium mt-1">Upload sliced screenshots of Tally registers (e.g. Pg 1A, Pg 1B). AI will stitch them into a single table.</p>
        </div>
      </div>

      <input type="file" ref={fileInputRef} className="hidden" accept="image/png, image/jpeg, image/jpg" multiple onChange={handleFileUpload} />

      {isProcessing ? (
        <div className="mt-8 border-2 border-slate-700 bg-slate-900/50 rounded-2xl p-16 flex flex-col items-center justify-center transition-all">
          <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-6"></div>
          <h3 className="text-xl font-bold text-white mb-2">Analyzing Images with Vision AI...</h3>
          <p className="text-slate-400 text-sm text-center max-w-md">The AI is currently stitching the images together and extracting tabular data. This may take up to 30 seconds.</p>
        </div>
      ) : !parsedData ? (
        <div className="space-y-6">
          <div onClick={() => fileInputRef.current?.click()} className="mt-8 border-2 border-dashed border-slate-700 hover:border-yellow-500 bg-slate-900/50 hover:bg-slate-800/50 rounded-2xl p-16 flex flex-col items-center justify-center cursor-pointer transition-all group">
            <div className="w-20 h-20 bg-yellow-500/10 text-yellow-500 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"><UploadCloud className="w-10 h-10" /></div>
            <h3 className="text-xl font-bold text-white mb-2">Select Image Slices</h3>
            <p className="text-slate-400 text-sm text-center max-w-md">Drop multiple JPG/PNG images here. They will be automatically sorted alphabetically before processing.</p>
          </div>
          
          {selectedFiles.length > 0 && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <div className="flex justify-between items-center mb-4"><h4 className="text-white font-bold text-sm">Queued Images ({selectedFiles.length})</h4><button onClick={processImages} className="bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">Start Extraction</button></div>
              <div className="flex flex-wrap gap-2">
                {selectedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-slate-800 text-slate-300 text-xs px-3 py-1.5 rounded-md border border-slate-700"><span className="truncate max-w-[150px]">{f.name}</span><button onClick={() => removeFile(i)} className="text-red-400 hover:text-red-300"><X className="w-3 h-3" /></button></div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 shadow-xl animate-pop-in mt-8 text-center">
          <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6"><CheckCircle2 className="w-10 h-10" /></div>
          <h3 className="text-2xl font-bold text-white mb-2">Extraction Complete</h3>
          <p className="text-slate-400 mb-8">Successfully stitched and extracted {parsedData.length} records.</p>
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => { setParsedData(null); setSelectedFiles([]); }} className="px-6 py-3 rounded-xl font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors">Upload More</button>
            <button onClick={exportToExcel} className="px-6 py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center gap-2 shadow-lg shadow-emerald-900/20"><FileSpreadsheet className="w-5 h-5" /> Download Excel</button>
          </div>
        </div>
      )}
    </div>
  );
}