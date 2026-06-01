import React, { useState } from 'react';
import { parseGSTR3BFile, type GSTR3BDataBlock } from '@/lib/gstr3bParser';
import { FileUploadZone } from '@/components/FileUploadZone';
import { 
  FileSpreadsheet, CheckCircle2, TrendingUp, DollarSign, BarChart3,
  Calendar, Layers, FileText, Download, Info
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx-js-style';

interface GSTR3BAnalyzerProps {
  companyName: string;
}

type MonthKey = 'April' | 'May' | 'June' | 'July' | 'August' | 'September' | 'October' | 'November' | 'December' | 'January' | 'February' | 'March' | 'Total';

export function GSTR3BAnalyzer({ companyName }: GSTR3BAnalyzerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<GSTR3BDataBlock[] | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<MonthKey>('Total');
  const [isProcessing, setIsProcessing] = useState(false);

  const months: MonthKey[] = [
    'Total', 'April', 'May', 'June', 'July', 'August', 'September', 
    'October', 'November', 'December', 'January', 'February', 'March'
  ];

  const handleFileUpload = async (f: File) => {
    setIsProcessing(true);
    setFile(f);
    try {
      const parsed = await parseGSTR3BFile(f);
      setData(parsed);
      toast.success('GSTR-3B Excel parsed successfully!', {
        description: `Extracted ${parsed.length} data blocks.`
      });
    } catch (err) {
      toast.error('Failed to parse GSTR-3B Excel', {
        description: String(err)
      });
      setFile(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper to extract specific Level 2 sub-category and its level 3 rows
  const getSubCategoryBlock = (level2Keyword: string, level1Keyword?: string) => {
    if (!data) return [];
    return data.filter(block => {
      const matchL2 = block.level2.toLowerCase().includes(level2Keyword.toLowerCase());
      if (level1Keyword) {
        const matchL1 = block.level1.toLowerCase().includes(level1Keyword.toLowerCase());
        return matchL2 && matchL1;
      }
      return matchL2;
    });
  };

  const getNetITCAvailableBlock = () => {
    if (!data) return [];
    return data.filter(block => block.level1.toLowerCase().includes('net itc available') || block.level1.toLowerCase().includes('(c)'));
  };

  // Summary Card stats calculations for currently selected Month/Total
  const getTaxTotals = (blocks: GSTR3BDataBlock[]) => {
    let igst = 0, cgst = 0, sgst = 0, cess = 0, total = 0;
    blocks.forEach(b => {
      const val = b.values[selectedMonth] || 0;
      const comp = b.level3.toLowerCase();
      if (comp.includes('igst')) igst += val;
      else if (comp.includes('cgst')) cgst += val;
      else if (comp.includes('sgst')) sgst += val;
      else if (comp.includes('cess')) cess += val;
      else if (comp.includes('total itc')) total += val;
    });
    return { igst, cgst, sgst, cess, total };
  };

  // Pre-filtered key sections
  const rcmBlocks = getSubCategoryBlock('(3)');
  const allOtherBlocks = getSubCategoryBlock('(5)');
  const reversedBlocks = getSubCategoryBlock('(2)', 'reversed');
  const netBlocks = getNetITCAvailableBlock();

  const rcmTotals = getTaxTotals(rcmBlocks);
  const allOtherTotals = getTaxTotals(allOtherBlocks);
  const reversedTotals = getTaxTotals(reversedBlocks);
  const netTotals = getTaxTotals(netBlocks);

  // Format currency
  const fmt = (val: number) => {
    const isNeg = val < 0;
    const absVal = Math.abs(val);
    const formatted = absVal.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return isNeg ? `- ₹ ${formatted}` : `₹ ${formatted}`;
  };

  const export3BReport = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    const rows = data.map(block => ({
      'Main Heading (Level 1)': block.level1,
      'Sub-Category (Level 2)': block.level2,
      'Component (Level 3)': block.level3,
      'April': block.values.April,
      'May': block.values.May,
      'June': block.values.June,
      'July': block.values.July,
      'August': block.values.August,
      'September': block.values.September,
      'October': block.values.October,
      'November': block.values.November,
      'December': block.values.December,
      'January': block.values.January,
      'February': block.values.February,
      'March': block.values.March,
      'Financial Year Total': block.values.Total,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    // Styling
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:P1');
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "0F172A" } },
      alignment: { horizontal: "center", vertical: "center" }
    };

    for (let C = range.s.c; C <= range.e.c; ++C) {
      const address = XLSX.utils.encode_col(C) + "1";
      if (ws[address]) ws[address].s = headerStyle;
    }

    XLSX.utils.book_append_sheet(wb, ws, "Parsed GSTR-3B ITC");
    XLSX.writeFile(wb, `${companyName || 'GST'}_GSTR3B_ITC_Summary_${new Date().getTime()}.xlsx`);
    toast.success('Spreadsheet exported successfully!');
  };

  return (
    <div className="space-y-6">
      {!file ? (
        <div className="glass-card-np p-12 rounded-2xl border border-slate-800 flex flex-col items-center justify-center space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <FileSpreadsheet className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Upload GSTR-3B ITC Summary File</h2>
            <p className="text-sm text-slate-400 mt-2 max-w-md">
              Drag and drop or select your "3B ITC.xlsx" file containing hierarchical month-wise input tax credit details.
            </p>
          </div>
          
          <FileUploadZone 
            onUpload={handleFileUpload} 
            title="Upload 3B ITC.xlsx (Excel)" 
            subtitle="Click to select file or drag & drop" 
          />

          <div className="text-left w-full max-w-xl p-4 bg-slate-950/50 border border-slate-800/80 rounded-xl space-y-2 text-xs text-slate-400 font-mono">
            <div className="font-bold text-blue-400 flex items-center gap-1.5 uppercase text-[10px] tracking-wider mb-2">
              <Info className="w-4 h-4" /> Expected File Layout Specifications:
            </div>
            <div>• Target Sheet: <span className="text-white">Sheet1</span></div>
            <div>• Headers Row: Row index 1 (<span className="text-white">Excel Row 2</span>)</div>
            <div>• Columns: Particulars, April, May, June, July, August, September, October, November, December, January, February, March, Total</div>
            <div>• Levels: Level 1 (Main Headings), Level 2 (Sub-Categories), Level 3 (IGST, CGST, SGST, Cess, Total rows)</div>
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          
          {/* Header Action Row */}
          <div className="glass-card-np p-5 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-sm font-bold text-white truncate max-w-xs md:max-w-md">{file.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Parsed GSTR-3B hierarchical layout successfully</p>
              </div>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button 
                onClick={() => { setFile(null); setData(null); }} 
                className="px-3.5 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg uppercase tracking-wider transition-colors"
              >
                Clear File
              </button>
              <button 
                onClick={export3BReport} 
                className="px-3.5 py-2 text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/10"
              >
                <Download className="w-3.5 h-3.5" /> Export Clean Sheet
              </button>
            </div>
          </div>

          {/* Month Selector Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto py-2 border-b border-slate-800 -mx-6 px-6 scrollbar-thin">
            {months.map(m => (
              <button
                key={m}
                onClick={() => setSelectedMonth(m)}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider shrink-0 transition-all ${
                  selectedMonth === m 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                {m === 'Total' ? '⚡ Full Year Total' : m}
              </button>
            ))}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="glass-card-np p-5 rounded-2xl border-l-4 border-l-cyan-500 bg-slate-900/20">
              <h4 className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                <TrendingUp className="w-3.5 h-3.5 text-cyan-400" /> RCM ITC (4A3)
              </h4>
              <div className="text-xl font-black text-white mt-3 font-mono">
                {fmt(rcmTotals.total || (rcmTotals.igst + rcmTotals.cgst + rcmTotals.sgst))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Inward supplies under Reverse Charge</p>
            </div>

            <div className="glass-card-np p-5 rounded-2xl border-l-4 border-l-emerald-500 bg-slate-900/20">
              <h4 className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> All Other ITC (4A5)
              </h4>
              <div className="text-xl font-black text-white mt-3 font-mono">
                {fmt(allOtherTotals.total || (allOtherTotals.igst + allOtherTotals.cgst + allOtherTotals.sgst))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Regular inward inputs credit</p>
            </div>

            <div className="glass-card-np p-5 rounded-2xl border-l-4 border-l-rose-500 bg-slate-900/20">
              <h4 className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                <Layers className="w-3.5 h-3.5 text-rose-400" /> ITC Reversed (4B2)
              </h4>
              <div className="text-xl font-black text-white mt-3 font-mono">
                {fmt(reversedTotals.total || (reversedTotals.igst + reversedTotals.cgst + reversedTotals.sgst))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Rule 38/42/43/Sec 17(5) Reversals</p>
            </div>

            <div className="glass-card-np p-5 rounded-2xl border-l-4 border-l-blue-500 bg-slate-900/20">
              <h4 className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                <DollarSign className="w-3.5 h-3.5 text-blue-400" /> Net Available (4C)
              </h4>
              <div className="text-xl font-black text-blue-300 mt-3 font-mono">
                {fmt(netTotals.total || (netTotals.igst + netTotals.cgst + netTotals.sgst))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Net ITC Available (A) - (B)</p>
            </div>
          </div>

          {/* Details Table */}
          <div className="glass-card-np rounded-2xl border border-slate-800 overflow-hidden">
            <div className="dash-topbar px-6 py-4 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-blue-400" /> Detailed GSTR-3B ITC Table ({selectedMonth === 'Total' ? 'Full Year' : selectedMonth})
              </span>
              {selectedMonth === 'February' && (
                <span className="text-[10px] bg-amber-500/10 text-amber-400 font-bold uppercase tracking-widest px-2.5 py-1 rounded-md border border-amber-500/20 animate-pulse">
                  ⚠ February contains negative CGST/SGST values
                </span>
              )}
            </div>
            
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/80 border-b border-slate-800">
                    <th className="px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">Particulars (Tax Hierarchy)</th>
                    <th className="px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">IGST Amount</th>
                    <th className="px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">CGST Amount</th>
                    <th className="px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">SGST Amount</th>
                    <th className="px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">Cess Amount</th>
                    <th className="px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">Total ITC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 text-sm">
                  {[
                    { title: '4(A) ITC Available (whether in full or part)', categories: ['(1) Import of goods', '(2) Import of services', '(3) Inward supplies liable to reverse charge (other than 1 & 2 above)', '(4) Inward supplies from ISD', '(5) All other ITC'] },
                    { title: '4(B) ITC Reversed', categories: ['(1) As per rules 38, 42 & 43 of CGST Rules and section 17(5)', '(2) Others'] },
                    { title: '(C) Net ITC Available (A) – (B)', categories: [] },
                    { title: '(D) Ineligible ITC', categories: [] }
                  ].map((sec, idx) => {
                    const isNet = sec.title.includes('(C)');
                    
                    return (
                      <React.Fragment key={idx}>
                        {/* Section Header */}
                        <tr className="bg-slate-900/30 font-bold text-slate-100">
                          <td colSpan={6} className="px-6 py-3 font-extrabold uppercase tracking-wide text-xs text-blue-400">
                            {sec.title}
                          </td>
                        </tr>

                        {/* If Net ITC Available (No Level 2 Categories) */}
                        {isNet && (
                          <tr className="hover:bg-slate-800/10 transition-colors font-semibold text-blue-200">
                            <td className="px-6 py-2.5 pl-10 text-xs italic">Combined Net ITC values</td>
                            <td className="px-6 py-2.5 text-right font-mono">{fmt(netTotals.igst)}</td>
                            <td className="px-6 py-2.5 text-right font-mono">{fmt(netTotals.cgst)}</td>
                            <td className="px-6 py-2.5 text-right font-mono">{fmt(netTotals.sgst)}</td>
                            <td className="px-6 py-2.5 text-right font-mono">{fmt(netTotals.cess)}</td>
                            <td className="px-6 py-2.5 text-right font-mono">{fmt(netTotals.total)}</td>
                          </tr>
                        )}

                        {/* Sub-categories */}
                        {sec.categories.map((cat, catIdx) => {
                          const catBlocks = getSubCategoryBlock(cat.slice(0, 15), sec.title.slice(0, 10));
                          const catTotals = getTaxTotals(catBlocks);
                          const hasNegVal = catTotals.cgst < 0 || catTotals.sgst < 0 || catTotals.igst < 0;

                          return (
                            <tr key={catIdx} className={`hover:bg-slate-800/10 transition-colors ${hasNegVal ? 'bg-amber-500/5' : ''}`}>
                              <td className="px-6 py-2.5 pl-10 text-xs text-slate-300">
                                {cat}
                                {hasNegVal && (
                                  <span className="ml-2 px-1.5 py-0.5 rounded text-[8px] bg-rose-500/20 text-rose-400 font-bold border border-rose-500/10">
                                    NEGATIVE VALUES
                                  </span>
                                )}
                              </td>
                              <td className={`px-6 py-2.5 text-right font-mono ${catTotals.igst < 0 ? 'text-rose-400 font-bold' : 'text-slate-300'}`}>
                                {fmt(catTotals.igst)}
                              </td>
                              <td className={`px-6 py-2.5 text-right font-mono ${catTotals.cgst < 0 ? 'text-rose-400 font-bold' : 'text-slate-300'}`}>
                                {fmt(catTotals.cgst)}
                              </td>
                              <td className={`px-6 py-2.5 text-right font-mono ${catTotals.sgst < 0 ? 'text-rose-400 font-bold' : 'text-slate-300'}`}>
                                {fmt(catTotals.sgst)}
                              </td>
                              <td className={`px-6 py-2.5 text-right font-mono ${catTotals.cess < 0 ? 'text-rose-400 font-bold' : 'text-slate-300'}`}>
                                {fmt(catTotals.cess)}
                              </td>
                              <td className={`px-6 py-2.5 text-right font-semibold font-mono ${catTotals.total < 0 ? 'text-rose-400 font-bold' : 'text-slate-200'}`}>
                                {fmt(catTotals.total || (catTotals.igst + catTotals.cgst + catTotals.sgst))}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
