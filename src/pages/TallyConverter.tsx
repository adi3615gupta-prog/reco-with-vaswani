import { useState, useRef } from 'react';
import { ArrowLeft, FileCode2, UploadCloud, CheckCircle2, FileSpreadsheet, FileText, X, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from "xlsx";
import XLSXStyle from "xlsx-js-style";
import { getApiBase } from '@/lib/api';

const extractHeadersFromHTML = (chunkText: string) => {
  try {
    const startIdx = chunkText.indexOf('Particulars');
    const endIdx = chunkText.indexOf('Gross Total');

    if (startIdx === -1 || endIdx === -1) return [];

    // Find the master TR that wraps these words
    const trStart = Math.max(chunkText.lastIndexOf('<TR', startIdx), chunkText.lastIndexOf('<tr', startIdx));
    const trEnd = Math.max(chunkText.indexOf('</TR>', endIdx), chunkText.indexOf('</tr>', endIdx));

    const headerRowHtml = chunkText.substring(trStart, trEnd + 5);

    // Split by <TD> to get every cell manually
    const tds = headerRowHtml.split(/<td/i).slice(1);
    const cleanNames: string[] = [];

    for (const td of tds) {
      if (td.toLowerCase().includes('<table')) continue; // Skip Tally's nested wrapper tables

      const closingBracket = td.indexOf('>');
      const endingTag = td.toLowerCase().indexOf('</td');

      if (closingBracket !== -1 && endingTag !== -1) {
        let text = td.substring(closingBracket + 1, endingTag);

        // Strip HTML tags and Tally's hidden formatting spaces
        text = text.replace(/<[^>]*>?/gm, '');
        text = text.replace(/(&#160;|&nbsp;|\u00A0|\s|\n|\r|\t)+/g, ' ').trim();

        if (text.length > 0) cleanNames.push(text);
      }
    }

    const baseColumns = [
      "date", "particulars", "voucher type", "voucher no.", "voucher no",
      "voucher ref. no.", "voucher ref no", "voucher ref. date", "voucher ref date", "gstin/uin",
      "value", "gross total", "supplier invoice no.", "supplier invoice no", "supplier date",
      "addl cost", "addl. cost", "addi. cost", "additional cost"
    ];
    return cleanNames.filter(n => !baseColumns.includes(n.toLowerCase()));

  } catch (error) {
    console.error("String parser failed:", error);
    return [];
  }
};

const extractCompanyInfoFromHTML = (chunkText: string) => {
  const lines: string[] = [];
  try {
    const lowerChunk = chunkText.toLowerCase();
    const tableStart = lowerChunk.indexOf('<table');
    if (tableStart !== -1) {
      let currentPos = tableStart;
      for (let i = 0; i < 15; i++) {
        const trStart = lowerChunk.indexOf('<tr', currentPos);
        if (trStart === -1) break;
        const trEnd = lowerChunk.indexOf('</tr', trStart);
        if (trEnd === -1) break;

        const trHtml = chunkText.substring(trStart, trEnd);
        let text = trHtml.replace(/<[^>]*>?/gm, ' ').replace(/(&#160;|&nbsp;|\u00A0|\s|\n|\r|\t)+/g, ' ').trim();
        if (text) {
          // Ignore headers row
          if (!text.toLowerCase().includes('particulars') && !text.toLowerCase().includes('gross total')) {
            lines.push(text);
          }
        }
        currentPos = trEnd + 4;
        if (lines.length >= 6) break;
      }
    }
  } catch (err) {
    console.error("Failed to extract company info from HTML", err);
  }

  while (lines.length < 6) lines.push("");
  return lines.slice(0, 6);
};

interface TallyConverterProps {
  onBack: () => void;
}

export default function TallyConverter({ onBack }: TallyConverterProps) {
  const [showQuickGuide, setShowQuickGuide] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [exportFileName, setExportFileName] = useState("Dual_Engine_Journal_Register");
  const [activeTab, setActiveTab] = useState<'purchase' | 'sales' | 'journal'>('purchase');

  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [htmlFile, setHtmlFile] = useState<File | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    let newXml = xmlFile;
    let newHtml = htmlFile;
    let newFileName = exportFileName;

    for (const file of files) {
      const name = file.name.toLowerCase();
      if (name.endsWith('.xml')) {
        newXml = file;
        newFileName = file.name.replace(/\.[^/.]+$/, "");
      }
      if (name.endsWith('.htm') || name.endsWith('.html')) {
        newHtml = file;
        if (!newXml) {
          newFileName = file.name.replace(/\.[^/.]+$/, "");
        }
      }
    }

    if (files.length > 0 && !newXml && !newHtml) {
      toast.error("Invalid File Type", { description: "Please upload a Tally XML and HTML file." });
    }

    setXmlFile(newXml);
    setHtmlFile(newHtml);
    setExportFileName(newFileName);
  };

  const processTallyData = async (xmlTarget: File, htmlTarget: File) => {
    try {
      const res = await fetch(`${getApiBase()}/api/usage/increment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_name: 'TallyConverter' })
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
    setProgress(5);
    setStatusText("Reading files...");
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // --- STAGE 1: READ & PARSE HTML STRUCTURE MAP ---
      // Do NOT read the whole file. Slice the first 500KB as a Blob.
      const CHUNK_SIZE = 500 * 1024; // 500 KB
      const htmlChunkBlob = htmlTarget.slice(0, CHUNK_SIZE);

      // Only read this tiny, memory-safe chunk into text
      const chunkText = await htmlChunkBlob.text();

      setProgress(15);
      setStatusText("Extracting Ledger Map from HTML...");
      await new Promise(resolve => setTimeout(resolve, 50));

      let cleanLedgerNames = extractHeadersFromHTML(chunkText);
      let companyInfoLines = extractCompanyInfoFromHTML(chunkText);

      setProgress(30);
      setStatusText("Reading XML Core File...");
      await new Promise(resolve => setTimeout(resolve, 50));

      // --- STAGE 2: READ & PARSE XML CORE ENGINE ---
      const xmlBuffer = await xmlTarget.arrayBuffer();
      const view = new Uint8Array(xmlBuffer.slice(0, 2));
      let xmlTextStr = "";

      // Auto-detect UTF-16 LE/BE which Tally frequently uses
      if ((view[0] === 0xFF && view[1] === 0xFE) || (view[0] !== 0x3C && view[1] === 0x00)) {
        xmlTextStr = new TextDecoder('utf-16le').decode(xmlBuffer);
      } else if (view[0] === 0xFE && view[1] === 0xFF) {
        xmlTextStr = new TextDecoder('utf-16be').decode(xmlBuffer);
      } else {
        xmlTextStr = new TextDecoder('utf-8').decode(xmlBuffer);
      }

      setProgress(40);
      setStatusText("Parsing XML Documents...");
      await new Promise(resolve => setTimeout(resolve, 50));

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlTextStr, "text/xml");

      const parseError = xmlDoc.querySelector("parsererror");
      if (parseError) throw new Error("Invalid XML format. Please ensure it is a valid Tally export.");

      const getFieldValue = (parent: Document | Element, tagName: string) => {
        const all = parent.getElementsByTagName("*");
        for (let i = 0; i < all.length; i++) {
          if (all[i].localName === tagName || all[i].nodeName.split(':').pop() === tagName) {
            return all[i].textContent || "";
          }
        }
        return "";
      };

      const getFieldValues = (parent: Document | Element, tagName: string) => {
        const all = parent.getElementsByTagName("*");
        const results: string[] = [];
        for (let i = 0; i < all.length; i++) {
          const el = all[i];
          if (el.localName === tagName || el.nodeName.split(':').pop() === tagName) {
            results.push(el.textContent || "");
          }
        }
        return results;
      };

      const allTags = xmlDoc.getElementsByTagName("*");
      const dbcfixedTags: Element[] = [];

      setProgress(50);
      setStatusText("Scanning data rows...");
      await new Promise(resolve => setTimeout(resolve, 50));

      for (let i = 0; i < allTags.length; i++) {
        const el = allTags[i];
        const name = el.localName || el.nodeName.split(':').pop();

        if (name === "DBCFIXED") dbcfixedTags.push(el);

        if (i > 0 && i % 100000 === 0) {
          setProgress(50 + Math.floor((i / allTags.length) * 10));
          await new Promise(r => setTimeout(r, 0));
        }
      }

      if (dbcfixedTags.length === 0) {
        throw new Error("No valid DBCFIXED data rows found in XML.");
      }

      const parsedRows: any[][] = [];
      let minDate: Date | null = null;
      let maxDate: Date | null = null;
      let lastDate = "";
      let maxXmlLedgerWidth = 0;

      setProgress(60);
      setStatusText("Extracting & Mapping Vouchers...");
      await new Promise(resolve => setTimeout(resolve, 50));

      const cleanVal = (valStr: string) => {
        if (!valStr || valStr.trim() === "") return "";

        const lowerStr = valStr.toLowerCase();
        const isCr = lowerStr.includes('cr');
        const isDr = lowerStr.includes('dr');

        const num = parseFloat(valStr.replace(/,/g, '').replace(/[^\d.-]/g, ''));
        if (isNaN(num)) return "";

        const isSales = activeTab === 'sales';
        const absNum = Math.abs(num);

        if (isCr) {
          return isSales ? absNum : -absNum;
        } else if (isDr) {
          return isSales ? -absNum : absNum;
        }

        // In Tally XML natively: Negative (-) = Debit, Positive (+) = Credit.
        if (num === 0) return 0;
        return isSales ? num : -num;
      };

      for (let i = 0; i < dbcfixedTags.length; i++) {
        const fixedEl = dbcfixedTags[i];
        let date = getFieldValue(fixedEl, "DBCDATE");
        const particulars = getFieldValue(fixedEl, "DBCPARTY");

        let vchType = "", vchNo = "", vchRef = "", gstin = "", narration = "", value = "", grossTotal = "";
        let ledAmts: string[] = [];

        const parent = fixedEl.parentElement;
        const fixedInParent = parent ? Array.from(parent.children).filter(c => c.localName === "DBCFIXED" || c.nodeName.split(':').pop() === "DBCFIXED") : [];

        if (parent && fixedInParent.length === 1) {
          vchType = getFieldValue(parent, "DBCVCHTYPE");
          vchNo = getFieldValue(parent, "DBCVCHNO");
          vchRef = getFieldValue(parent, "DBCVCHREF");
          gstin = getFieldValue(parent, "DBCGSTIN");
          narration = getFieldValue(parent, "DBCNARRATION");
          value = getFieldValue(parent, "DBCAMOUNT");
          grossTotal = getFieldValue(parent, "DBCGROSSAMT");
          ledAmts = getFieldValues(parent, "DBCLEDAMT");
        } else {
          let sibling = fixedEl.nextElementSibling;
          while (sibling && sibling.localName !== "DBCFIXED" && sibling.nodeName.split(':').pop() !== "DBCFIXED") {
            const name = sibling.localName || sibling.nodeName.split(':').pop() || "";
            const text = sibling.textContent || "";

            if (name === "DBCVCHTYPE") vchType = text;
            else if (name === "DBCVCHNO") vchNo = text;
            else if (name === "DBCVCHREF") vchRef = text;
            else if (name === "DBCGSTIN") gstin = text;
            else if (name === "DBCNARRATION") narration = text;
            else if (name === "DBCAMOUNT") value = text;
            else if (name === "DBCGROSSAMT") grossTotal = text;
            else if (name === "DBCLEDAMT") ledAmts.push(text);
            else {
              const nested = getFieldValues(sibling, "DBCLEDAMT");
              if (nested.length) ledAmts.push(...nested);
              if (!vchNo) vchNo = getFieldValue(sibling, "DBCVCHNO");
              if (!value) value = getFieldValue(sibling, "DBCAMOUNT");
              if (!grossTotal) grossTotal = getFieldValue(sibling, "DBCGROSSAMT");
            }
            sibling = sibling.nextElementSibling;
          }
        }

        if (date) {
          lastDate = date;
          const d = new Date(date);
          if (!isNaN(d.getTime())) {
            if (!minDate || d < minDate) minDate = d;
            if (!maxDate || d > maxDate) maxDate = d;
          }
        } else if (lastDate) {
          date = lastDate;
        }

        if (!date && !particulars && !vchNo && !value && !ledAmts.length) continue;

        const xmlDate = date;
        const xmlParticulars = particulars;
        const xmlVoucherType = vchType;
        const xmlVoucherNo = vchNo;
        const xmlVoucherRef = vchRef;
        const xmlGstin = gstin;
        const xmlNarration = narration;
        const xmlValue = cleanVal(value);
        const xmlGrossTotal = cleanVal(grossTotal);

        const xmlLedgerAmounts = ledAmts.map(amtStr => cleanVal(amtStr));
        if (xmlLedgerAmounts.length > maxXmlLedgerWidth) maxXmlLedgerWidth = xmlLedgerAmounts.length;

        const dataRow = [
          xmlDate, // A
          xmlParticulars, // B
          xmlVoucherType, // C
          xmlVoucherNo, // D
          xmlVoucherRef, // E
          xmlGstin, // F
          xmlNarration, // G
          xmlGrossTotal, // H
          ...xmlLedgerAmounts // I, J, K, L... (Data from XML)
        ];

        parsedRows.push(dataRow);

        if (i > 0 && i % 5000 === 0) {
          setProgress(60 + Math.floor((i / dbcfixedTags.length) * 20));
          await new Promise(r => setTimeout(r, 0));
        }
      }

      setProgress(85);
      setStatusText("Generating Excel Workbook...");
      await new Promise(resolve => setTimeout(resolve, 50));

      if (cleanLedgerNames.length === 0 && maxXmlLedgerWidth > 0) {
        // Failsafe: Generate generic names based on the XML data width
        cleanLedgerNames = Array.from({ length: maxXmlLedgerWidth }).map((_, index) => `Ledger ${index + 1}`);
      }

      // --- STAGE 3: EXCEL GENERATION & LAYOUT (Synchronous) ---
      const excelHeaderRow = [
        "Date", // A
        "Particulars", // B
        "Voucher Type", // C
        "Voucher No.", // D
        "Voucher Ref. No.", // E
        "GSTIN/UIN", // F
        "Narration", // G
        "Gross Total", // H
        ...cleanLedgerNames // I, J, K, L... (Headers from HTML)
      ];

      const maxCols = excelHeaderRow.length;

      // Sheet 1: Main Data
      const sheet1Data: any[][] = [];
      sheet1Data.push(excelHeaderRow); // Row 0 is headers

      parsedRows.forEach((r: any[]) => {
        const rowData = [...r];
        while (rowData.length < maxCols) rowData.push("");
        sheet1Data.push(rowData);
      });

      const ws1 = XLSXStyle.utils.aoa_to_sheet(sheet1Data);
      ws1["!freeze"] = { xSplit: 0, ySplit: 1 };

      // Sheet 2: Company Info
      const sheet2Data: any[][] = [];
      companyInfoLines.forEach(line => {
        if (line) sheet2Data.push([line]);
      });

      const ws2 = XLSXStyle.utils.aoa_to_sheet(sheet2Data);

      setProgress(95);
      setStatusText("Applying Styles...");
      await new Promise(resolve => setTimeout(resolve, 50));

      // Styles
      const borderStyle = { top: { style: "thin", color: { rgb: "A6A6A6" } }, bottom: { style: "thin", color: { rgb: "A6A6A6" } }, left: { style: "thin", color: { rgb: "A6A6A6" } }, right: { style: "thin", color: { rgb: "A6A6A6" } } };
      const headerStyle = { font: { bold: true, color: { rgb: "000000" }, sz: 10, name: "Arial" }, fill: { patternType: "solid", fgColor: { rgb: "F2F2F2" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: borderStyle };
      const dataStyle = { font: { name: "Arial", sz: 10 }, alignment: { vertical: "center" }, border: borderStyle };

      const companyHeaderStyle = { font: { bold: true, sz: 12, name: "Arial" }, alignment: { horizontal: "left", vertical: "center" } };
      const companySubHeaderStyle = { font: { bold: true, sz: 10, name: "Arial" }, alignment: { horizontal: "left", vertical: "center" } };

      // Apply styles to Sheet 1 (Data)
      const colWidths1 = Array.from({ length: maxCols }).map((_, i) => ({ wch: Math.max(10, String(excelHeaderRow[i] || "").length + 2) }));
      for (let R = 0; R < sheet1Data.length; ++R) {
        for (let C = 0; C < maxCols; ++C) {
          const cellRef = XLSXStyle.utils.encode_cell({ r: R, c: C });
          if (!ws1[cellRef]) ws1[cellRef] = { t: 's', v: '' };

          if (R === 0) {
            ws1[cellRef].s = headerStyle;
          } else {
            ws1[cellRef].s = dataStyle;
            if (typeof ws1[cellRef].v === 'number') {
              ws1[cellRef].t = 'n';
              ws1[cellRef].z = '#,##0.00';
            } else if (ws1[cellRef].v === null || ws1[cellRef].v === "") {
              ws1[cellRef].v = '';
            }

            const valStr = String(ws1[cellRef].v);
            if (valStr.length + 2 > colWidths1[C].wch) {
              colWidths1[C].wch = Math.min(valStr.length + 2, 60);
            }
          }
        }
      }
      ws1["!cols"] = colWidths1;

      // Apply styles to Sheet 2 (Company Info)
      ws2["!cols"] = [{ wch: 60 }];
      for (let R = 0; R < sheet2Data.length; ++R) {
        const cellRef = XLSXStyle.utils.encode_cell({ r: R, c: 0 });
        if (!ws2[cellRef]) continue;
        ws2[cellRef].s = R === 0 ? companyHeaderStyle : companySubHeaderStyle;
      }

      const wb = XLSXStyle.utils.book_new();
      const sheetName = activeTab === 'sales' ? "Sales Register Data" : activeTab === 'purchase' ? "Purchase Register Data" : "Journal Register Data";
      XLSXStyle.utils.book_append_sheet(wb, ws1, sheetName);
      XLSXStyle.utils.book_append_sheet(wb, ws2, "Company Info");

      const finalFileName = exportFileName.trim().endsWith('.xlsx') ? exportFileName.trim() : `${exportFileName.trim() || 'Journal_Register'}.xlsx`;
      XLSXStyle.writeFile(wb, finalFileName);

      setProgress(100);
      setStatusText("Done!");
      toast.success("Excel Downloaded", { description: "Your Tally data has been mapped and formatted successfully." });

      // Reset state
      setTimeout(() => {
        setXmlFile(null);
        setHtmlFile(null);
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }, 2000);
    } catch (err: any) {
      console.error("Export Error:", err);
      toast.error("Export Failed", { description: err.message || "An error occurred during Excel generation." });
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-6">
        <div>
          <button onClick={onBack} className="text-slate-400 hover:text-white flex items-center gap-2 font-bold uppercase tracking-wider text-[10px] mb-4 transition-colors"><ArrowLeft className="w-3 h-3" /> Back to Hub</button>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3"><FileCode2 className="w-8 h-8 text-blue-500" /> Tally Dual-Engine Converter</h1>
          <p className="text-slate-400 font-medium mt-1">Convert Tally exports securely. Uses HTML for structure mapping and XML for core data.</p>
        </div>
      </div>

      {/* Collapsible Quick Guide */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 text-slate-300 backdrop-blur-md shadow-lg">
        <button
          onClick={() => setShowQuickGuide(!showQuickGuide)}
          className="flex items-center justify-between w-full text-slate-300 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
            <Lightbulb className="w-4 h-4 text-yellow-400" />
            Quick Tally Converter User Guide
          </span>
          <span className="text-xs text-blue-400 font-bold hover:underline">{showQuickGuide ? 'Hide' : 'Show Instructions'}</span>
        </button>
        {showQuickGuide && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 text-xs text-slate-400 space-y-4 animate-in fade-in slide-in-from-top-1 duration-350">
            <p><strong>Overview:</strong> Convert raw Tally XML register documents into beautifully styled Excel files using a dual XML-HTML structural map.</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="font-bold text-slate-300 mb-1.5">Step-by-step Steps:</p>
                <ol className="space-y-1.5 pl-4 list-decimal">
                  <li><strong>Register Type:</strong> Select the register tab (Purchase, Sales, or Journal) at the top of the card.</li>
                  <li><strong>Tally Export:</strong> Get the XML export from TallyPrime. Also export/print the identical view as HTML.</li>
                  <li><strong>File Upload:</strong> Click the upload zone to upload both files (XML + HTML/HTM) together.</li>
                  <li><strong>Download:</strong> Verify the loaded status, enter custom export name, and click "Generate Excel Report".</li>
                </ol>
              </div>
              <div>
                <p className="font-bold text-slate-300 mb-1.5">How to Export from TallyPrime:</p>
                <ul className="space-y-1.5 pl-4 list-disc text-slate-400">
                  <li>Open Account Register in Tally.</li>
                  <li>Press <strong>Alt + E</strong> (Export) → choose <strong>XML</strong>. Set encoding to UTF-16.</li>
                  <li>To get the HTML layout, press <strong>Alt + E</strong> or Print to file as <strong>HTML</strong>.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {!isProcessing && (
        <div className="flex gap-3 mb-6 bg-slate-900/50 p-2 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveTab('purchase')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all text-sm ${activeTab === 'purchase' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            Purchase
          </button>
          <button
            onClick={() => setActiveTab('sales')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all text-sm ${activeTab === 'sales' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            Sales
          </button>
          <button
            onClick={() => setActiveTab('journal')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all text-sm ${activeTab === 'journal' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            Journal
          </button>
        </div>
      )}

      <input type="file" ref={fileInputRef} className="hidden" accept=".xml,.htm,.html" multiple onChange={handleFileUpload} />

      {isProcessing ? (
        <div className="mt-8 border-2 border-slate-700 bg-slate-900/50 rounded-2xl p-16 flex flex-col items-center justify-center transition-all">
          <div className="w-full max-w-md space-y-4">
            <div className="flex justify-between text-sm font-bold uppercase tracking-wider">
              <span className="text-blue-400 animate-pulse">{statusText || "Processing..."}</span>
              <span className="text-slate-300">{progress}%</span>
            </div>
            <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden shadow-inner">
              <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
          <p className="text-slate-400 text-sm text-center max-w-md mt-8">Do not close the window. The dual-file engine is mapping and extracting your data securely offline.</p>
        </div>
      ) : (
        <div className="mt-8">
          <div className="flex flex-col gap-4 max-w-md mx-auto mb-8">
            <div className={`p-4 rounded-xl border ${xmlFile ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800/50 border-slate-700 text-slate-500'} flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                {xmlFile ? <CheckCircle2 className="w-5 h-5" /> : <FileCode2 className="w-5 h-5" />}
                <span className="font-bold">{xmlFile ? 'XML Data File Loaded Successfully' : 'Waiting for XML File...'}</span>
              </div>
              {xmlFile && <button onClick={() => setXmlFile(null)} className="text-emerald-400 hover:text-emerald-300"><X className="w-4 h-4" /></button>}
            </div>
            <div className={`p-4 rounded-xl border ${htmlFile ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800/50 border-slate-700 text-slate-500'} flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                {htmlFile ? <CheckCircle2 className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                <span className="font-bold">{htmlFile ? 'HTML Structure Map Loaded Successfully' : 'Waiting for HTML File...'}</span>
              </div>
              {htmlFile && <button onClick={() => setHtmlFile(null)} className="text-emerald-400 hover:text-emerald-300"><X className="w-4 h-4" /></button>}
            </div>
          </div>

          {(!xmlFile || !htmlFile) && (
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-700 hover:border-blue-500 bg-slate-900/50 hover:bg-slate-800/50 rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all group">
              <div className="w-16 h-16 bg-blue-500/10 text-blue-500 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><UploadCloud className="w-8 h-8" /></div>
              <h3 className="text-lg font-bold text-white mb-2">Upload Files</h3>
              <p className="text-slate-400 text-sm text-center">Select both the XML and HTML exports.</p>
            </div>
          )}

          {xmlFile && htmlFile && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 shadow-xl animate-pop-in text-center">
              <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6"><CheckCircle2 className="w-10 h-10" /></div>
              <h3 className="text-2xl font-bold text-white mb-2">Ready to Process</h3>
              <p className="text-slate-400 mb-6">Both core files have been loaded. You can now generate your Excel report.</p>

              <div className="mb-8 max-w-sm mx-auto text-left">
                <label className="block text-slate-400 text-sm font-bold mb-2 uppercase tracking-wider">Export File Name</label>
                <input
                  type="text"
                  value={exportFileName}
                  onChange={(e) => setExportFileName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="Enter file name..."
                />
              </div>

              <div className="flex items-center justify-center gap-4">
                <button onClick={() => processTallyData(xmlFile, htmlFile)} className="px-6 py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center gap-2 shadow-lg shadow-emerald-900/20"><FileSpreadsheet className="w-5 h-5" /> Generate Excel Report</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
