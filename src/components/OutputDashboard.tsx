import React, { useState } from 'react';
import { Download, LayoutDashboard, ChevronRight, Building2, Grid } from 'lucide-react';
import { OutputReconciliationResponse, TaxBreakdown, MonthlySummary, PartySummary } from '@/lib/outputReconciliationService';

interface OutputDashboardProps {
  results: OutputReconciliationResponse;
  onDownload: () => void;
}

export function OutputDashboard({ results, onDownload }: OutputDashboardProps) {
  const [viewMode, setViewMode] = useState<'matrix' | 'party'>('matrix');
  const summaries = results.monthlySummaries || [];
  const partySummaries = results.partySummaries || [];

  const formatCurrency = (val: number) => {
    if (!val) return '-';
    return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };
  
  const getVarColor = (val: number) => {
    if (Math.abs(val) < 10) return 'text-slate-400 font-normal';
    return val > 0 ? 'text-rose-400 font-bold' : 'text-orange-400 font-bold';
  };

  const getNetVarColor = (val: number) => {
    if (Math.abs(val) < 10) return 'text-emerald-400 font-black';
    return val > 0 ? 'text-rose-400 font-black' : 'text-orange-400 font-black';
  };

  const emptyTax: TaxBreakdown = { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 };
  
  const totals = summaries.reduce((acc, row) => {
    const add = (a: TaxBreakdown, b: TaxBreakdown) => ({
      taxable: a.taxable + b.taxable,
      igst: a.igst + b.igst,
      cgst: a.cgst + b.cgst,
      sgst: a.sgst + b.sgst,
      nilRated: a.nilRated + b.nilRated,
      nonTaxable: a.nonTaxable + b.nonTaxable,
    });
    return {
      booksSales: add(acc.booksSales, row.booksSales),
      booksCn: add(acc.booksCn, row.booksCn),
      booksNet: add(acc.booksNet, row.booksNet),
      portalB2b: add(acc.portalB2b, row.portalB2b),
      portalExport: add(acc.portalExport || emptyTax, row.portalExport || emptyTax),
      portalB2c: add(acc.portalB2c, row.portalB2c),
      portalCn: add(acc.portalCn, row.portalCn),
      portalNil: add(acc.portalNil, row.portalNil),
      portalNet: add(acc.portalNet, row.portalNet),
      variance: add(acc.variance, row.variance)
    };
  }, {
    booksSales: emptyTax, booksCn: emptyTax, booksNet: emptyTax,
    portalB2b: emptyTax, portalExport: emptyTax, portalB2c: emptyTax, portalCn: emptyTax, portalNil: emptyTax, portalNet: emptyTax,
    variance: emptyTax
  });

  const renderCols = (tax: TaxBreakdown, isNet = false, isVar = false) => (
    <>
      <td className={`px-4 py-3 text-right border-r border-slate-700/50 ${isNet ? 'bg-slate-800/40 font-bold text-white' : 'text-slate-300'} ${isVar ? getVarColor(tax.taxable) : ''}`}>{formatCurrency(tax.taxable)}</td>
      <td className={`px-4 py-3 text-right border-r border-slate-700/50 ${isNet ? 'bg-slate-800/40 font-bold text-white' : 'text-slate-400'} ${isVar ? getVarColor(tax.cgst) : ''}`}>{formatCurrency(tax.cgst)}</td>
      <td className={`px-4 py-3 text-right border-r border-slate-700/50 ${isNet ? 'bg-slate-800/40 font-bold text-white' : 'text-slate-400'} ${isVar ? getVarColor(tax.sgst) : ''}`}>{formatCurrency(tax.sgst)}</td>
      <td className={`px-4 py-3 text-right border-r border-slate-700/50 ${isNet ? 'bg-slate-800/40 font-bold text-white' : 'text-slate-400'} ${isVar ? getVarColor(tax.igst) : ''}`}>{formatCurrency(tax.igst)}</td>
      <td className={`px-4 py-3 text-right border-r border-slate-700/50 ${isNet ? 'bg-slate-800/40 font-bold text-white' : 'text-slate-300'} ${isVar ? getVarColor(tax.nilRated) : ''}`}>{formatCurrency(tax.nilRated)}</td>
      <td className={`px-4 py-3 text-right border-r border-slate-700 ${isNet ? 'bg-slate-800/40 font-bold text-white' : 'text-slate-300'} ${isVar ? getVarColor(tax.nonTaxable) : ''}`}>{formatCurrency(tax.nonTaxable)}</td>
    </>
  );

  const renderNetVarCols = (tax: TaxBreakdown) => (
    <>
      <td className={`px-4 py-3 text-right border-r border-slate-700/50 bg-slate-900/50 text-base ${getNetVarColor(tax.taxable)}`}>{formatCurrency(tax.taxable)}</td>
      <td className={`px-4 py-3 text-right border-r border-slate-700/50 bg-slate-900/50 text-base ${getNetVarColor(tax.cgst)}`}>{formatCurrency(tax.cgst)}</td>
      <td className={`px-4 py-3 text-right border-r border-slate-700/50 bg-slate-900/50 text-base ${getNetVarColor(tax.sgst)}`}>{formatCurrency(tax.sgst)}</td>
      <td className={`px-4 py-3 text-right border-r border-slate-700/50 bg-slate-900/50 text-base ${getNetVarColor(tax.igst)}`}>{formatCurrency(tax.igst)}</td>
      <td className={`px-4 py-3 text-right border-r border-slate-700/50 bg-slate-900/50 text-base ${getNetVarColor(tax.nilRated)}`}>{formatCurrency(tax.nilRated)}</td>
      <td className={`px-4 py-3 text-right border-r border-slate-700 bg-slate-900/50 text-base ${getNetVarColor(tax.nonTaxable)}`}>{formatCurrency(tax.nonTaxable)}</td>
    </>
  );

  return (
    <div className="space-y-8 fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header & Download */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
            <LayoutDashboard className="w-7 h-7 text-blue-400" />
            Consolidated Output Dashboard
          </h2>
          <p className="text-slate-400 text-sm mt-1">Comprehensive monthly matrix of Books vs Portal</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex p-1 bg-slate-900/50 rounded-lg border border-slate-800">
            <button 
              onClick={() => setViewMode('matrix')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${viewMode === 'matrix' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}
            >
              <Grid className="w-3.5 h-3.5" />
              Consolidated Matrix
            </button>
            <button 
              onClick={() => setViewMode('party')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${viewMode === 'party' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Party-Wise Working
            </button>
          </div>
          <button 
            onClick={onDownload}
            className="btn-np-primary h-11 px-6 text-xs uppercase tracking-widest gap-2 flex items-center shadow-[0_0_20px_rgba(56,189,248,0.2)] hover:shadow-[0_0_30px_rgba(56,189,248,0.4)] transition-all"
          >
            <Download className="w-4 h-4" />
            Export to Excel
          </button>
        </div>
      </div>

      {viewMode === 'matrix' && (
        <div className="dash-card p-0 border border-slate-700/50 rounded-xl overflow-hidden shadow-2xl relative">
          <div className="bg-slate-900/90 backdrop-blur border-b border-slate-700/50 px-6 py-4 flex items-center justify-between sticky left-0 z-30">
            <h3 className="font-black text-white tracking-wide flex items-center gap-2">
              Detailed Master Computation
              <ChevronRight className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-400 tracking-normal">Scroll horizontally to view all tax heads</span>
            </h3>
          </div>
          
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-xs text-left border-collapse min-w-[4200px]">
              <thead className="text-[10px] uppercase tracking-widest sticky top-0 z-20 shadow-sm">
                {/* GROUP HEADER ROW */}
                <tr className="bg-slate-950 text-slate-300">
                  <th className="px-6 py-3 border-r border-slate-700 font-black sticky left-0 bg-slate-950 z-30 shadow-[4px_0_10px_rgba(0,0,0,0.4)]" rowSpan={2}>Month</th>
                  
                  <th className="px-4 py-2 text-center border-r border-slate-700 bg-blue-950/40 text-blue-300 font-black" colSpan={6}>A1. Books Outward Supplies</th>
                  <th className="px-4 py-2 text-center border-r border-slate-700 bg-orange-950/40 text-orange-300 font-black" colSpan={6}>A2. Less: Books Credit Notes</th>
                  <th className="px-4 py-2 text-center border-r border-slate-700 bg-blue-900/40 text-blue-200 font-black" colSpan={6}>A. NET BOOKS DATA (A1 - A2)</th>
                  
                  <th className="px-4 py-2 text-center border-r border-slate-700 bg-emerald-950/40 text-emerald-300 font-black" colSpan={6}>B1. Portal B2B</th>
                  <th className="px-4 py-2 text-center border-r border-slate-700 bg-teal-950/40 text-teal-300 font-black" colSpan={6}>B2. Portal Exports</th>
                  <th className="px-4 py-2 text-center border-r border-slate-700 bg-purple-950/40 text-purple-300 font-black" colSpan={6}>B3. Portal B2C & B2CL</th>
                  <th className="px-4 py-2 text-center border-r border-slate-700 bg-slate-800 text-slate-300 font-black" colSpan={6}>B4. Portal Nil Rated</th>
                  <th className="px-4 py-2 text-center border-r border-slate-700 bg-rose-950/40 text-rose-300 font-black" colSpan={6}>B5. Less: Portal CN</th>
                  <th className="px-4 py-2 text-center border-r border-slate-700 bg-emerald-900/40 text-emerald-200 font-black" colSpan={6}>B. NET PORTAL DATA (B1+B2+B3+B4 - B5)</th>
                  
                  <th className="px-4 py-2 text-center border-r border-slate-700 bg-slate-900 text-white font-black" colSpan={6}>FINAL VARIANCE (A - B)</th>
                </tr>
                
                {/* SUB HEADER ROW */}
                <tr className="bg-slate-900 text-slate-400">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <React.Fragment key={i}>
                      <th className="px-4 py-2 text-center font-bold border-r border-slate-700/50">Taxable</th>
                      <th className="px-4 py-2 text-center font-bold border-r border-slate-700/50">CGST</th>
                      <th className="px-4 py-2 text-center font-bold border-r border-slate-700/50">SGST</th>
                      <th className="px-4 py-2 text-center font-bold border-r border-slate-700/50">IGST</th>
                      <th className="px-4 py-2 text-center font-bold border-r border-slate-700/50">Nil Rated</th>
                      <th className="px-4 py-2 text-center font-bold border-r border-slate-700">Non Taxable</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/30">
                {summaries.map((row) => (
                  <tr key={row.month} className="hover:bg-slate-800/50 transition-colors group">
                    <td className="px-6 py-4 font-black text-white border-r border-slate-700 sticky left-0 bg-slate-900 shadow-[4px_0_10px_rgba(0,0,0,0.2)] group-hover:bg-slate-800">{row.month}</td>
                    
                    {renderCols(row.booksSales)}
                    {renderCols(row.booksCn)}
                    {renderCols(row.booksNet, true)}
                    
                    {renderCols(row.portalB2b)}
                    {renderCols(row.portalExport || emptyTax)}
                    {renderCols(row.portalB2c)}
                    {renderCols(row.portalNil)}
                    {renderCols(row.portalCn)}
                    {renderCols(row.portalNet, true)}
                    
                    {renderNetVarCols(row.variance)}
                  </tr>
                ))}
                
                {/* Grand Totals Row */}
                {summaries.length > 0 && (
                  <tr className="bg-slate-800 shadow-[0_-5px_15px_rgba(0,0,0,0.3)] relative z-10">
                    <td className="px-6 py-5 font-black text-white border-r border-slate-700 uppercase tracking-widest sticky left-0 bg-slate-800 shadow-[4px_0_10px_rgba(0,0,0,0.4)]">Total</td>
                    
                    {renderCols(totals.booksSales)}
                    {renderCols(totals.booksCn)}
                    {renderCols(totals.booksNet, true)}
                    
                    {renderCols(totals.portalB2b)}
                    {renderCols(totals.portalExport)}
                    {renderCols(totals.portalB2c)}
                    {renderCols(totals.portalNil)}
                    {renderCols(totals.portalCn)}
                    {renderCols(totals.portalNet, true)}
                    
                    {renderNetVarCols(totals.variance)}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'party' && (
        <div className="space-y-8">
          {Array.from(new Set(partySummaries.map(s => s.month))).map(month => {
            const monthParties = partySummaries.filter(s => s.month === month);
            return (
              <div key={month} className="dash-card p-0 border border-slate-700/50 rounded-xl overflow-hidden shadow-2xl relative">
                <div className="bg-slate-900/90 backdrop-blur border-b border-slate-700/50 px-6 py-4 flex items-center justify-between sticky left-0 z-30">
                  <h3 className="font-black text-white tracking-wide flex items-center gap-2">
                    {month} Party-Wise Working
                  </h3>
                </div>
                
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-xs text-left border-collapse min-w-[2600px]">
                    <thead className="text-[10px] uppercase tracking-widest sticky top-0 z-20 shadow-sm bg-slate-950 text-slate-300">
                      <tr>
                        <th className="px-6 py-3 border-r border-slate-700 font-black sticky left-0 bg-slate-950 z-30 min-w-[150px]" rowSpan={2}>Party Name (Books)</th>
                        <th className="px-6 py-3 border-r border-slate-700 font-black bg-slate-950 z-30 min-w-[150px]" rowSpan={2}>Party Name (R1)</th>
                        <th className="px-6 py-3 border-r border-slate-700 font-black bg-slate-950 z-30" rowSpan={2}>GST No. (Books)</th>
                        <th className="px-6 py-3 border-r border-slate-700 font-black bg-slate-950 z-30" rowSpan={2}>GST No. (R1)</th>
                        <th className="px-4 py-2 text-center border-r border-slate-700 bg-blue-950/40 text-blue-300 font-black" colSpan={6}>Net Books (B2B + Export + B2C + Nil - CN)</th>
                        <th className="px-4 py-2 text-center border-r border-slate-700 bg-emerald-950/40 text-emerald-300 font-black" colSpan={6}>Net Portal (B2B + Export + B2C + Nil - CN)</th>
                        <th className="px-4 py-2 text-center border-r border-slate-700 bg-slate-900 text-white font-black" colSpan={6}>Final Variance</th>
                      </tr>
                      <tr className="bg-slate-900 text-slate-400">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <React.Fragment key={i}>
                            <th className="px-4 py-2 text-center font-bold border-r border-slate-700/50">Taxable</th>
                            <th className="px-4 py-2 text-center font-bold border-r border-slate-700/50">CGST</th>
                            <th className="px-4 py-2 text-center font-bold border-r border-slate-700/50">SGST</th>
                            <th className="px-4 py-2 text-center font-bold border-r border-slate-700/50">IGST</th>
                            <th className="px-4 py-2 text-center font-bold border-r border-slate-700/50">Nil Rated</th>
                            <th className="px-4 py-2 text-center font-bold border-r border-slate-700">Non Taxable</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/30">
                      {monthParties.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/50 transition-colors group">
                          <td className="px-6 py-4 font-black text-white border-r border-slate-700 sticky left-0 bg-slate-900 shadow-[4px_0_10px_rgba(0,0,0,0.2)] group-hover:bg-slate-800 max-w-xs truncate" title={row.booksPartyName}>{row.booksPartyName || '-'}</td>
                          <td className="px-6 py-4 font-black text-white border-r border-slate-700 max-w-xs truncate" title={row.portalPartyName}>{row.portalPartyName || '-'}</td>
                          <td className="px-6 py-4 font-black text-slate-300 border-r border-slate-700">{row.booksGstNo || '-'}</td>
                          <td className="px-6 py-4 font-black text-slate-300 border-r border-slate-700">{row.portalGstNo || '-'}</td>
                          
                          {/* NET BOOKS */}
                          <td className="px-4 py-3 text-right border-r border-slate-700/50 font-bold text-white">{formatCurrency(row.booksNet.taxable)}</td>
                          <td className="px-4 py-3 text-right border-r border-slate-700/50 font-bold text-slate-400">{formatCurrency(row.booksNet.cgst)}</td>
                          <td className="px-4 py-3 text-right border-r border-slate-700/50 font-bold text-slate-400">{formatCurrency(row.booksNet.sgst)}</td>
                          <td className="px-4 py-3 text-right border-r border-slate-700/50 font-bold text-slate-400">{formatCurrency(row.booksNet.igst)}</td>
                          <td className="px-4 py-3 text-right border-r border-slate-700/50 font-bold text-slate-400">{formatCurrency(row.booksNet.nilRated)}</td>
                          <td className="px-4 py-3 text-right border-r border-slate-700 font-bold text-slate-400">{formatCurrency(row.booksNet.nonTaxable)}</td>

                          {/* NET PORTAL */}
                          <td className="px-4 py-3 text-right border-r border-slate-700/50 font-bold text-white">{formatCurrency(row.portalNet.taxable)}</td>
                          <td className="px-4 py-3 text-right border-r border-slate-700/50 font-bold text-slate-400">{formatCurrency(row.portalNet.cgst)}</td>
                          <td className="px-4 py-3 text-right border-r border-slate-700/50 font-bold text-slate-400">{formatCurrency(row.portalNet.sgst)}</td>
                          <td className="px-4 py-3 text-right border-r border-slate-700/50 font-bold text-slate-400">{formatCurrency(row.portalNet.igst)}</td>
                          <td className="px-4 py-3 text-right border-r border-slate-700/50 font-bold text-slate-400">{formatCurrency(row.portalNet.nilRated)}</td>
                          <td className="px-4 py-3 text-right border-r border-slate-700 font-bold text-slate-400">{formatCurrency(row.portalNet.nonTaxable)}</td>

                          {/* VARIANCE */}
                          <td className={`px-4 py-3 text-right border-r border-slate-700/50 bg-slate-900/50 text-base ${getNetVarColor(row.variance.taxable)}`}>{formatCurrency(row.variance.taxable)}</td>
                          <td className={`px-4 py-3 text-right border-r border-slate-700/50 bg-slate-900/50 text-base ${getNetVarColor(row.variance.cgst)}`}>{formatCurrency(row.variance.cgst)}</td>
                          <td className={`px-4 py-3 text-right border-r border-slate-700/50 bg-slate-900/50 text-base ${getNetVarColor(row.variance.sgst)}`}>{formatCurrency(row.variance.sgst)}</td>
                          <td className={`px-4 py-3 text-right border-r border-slate-700/50 bg-slate-900/50 text-base ${getNetVarColor(row.variance.igst)}`}>{formatCurrency(row.variance.igst)}</td>
                          <td className={`px-4 py-3 text-right border-r border-slate-700/50 bg-slate-900/50 text-base ${getNetVarColor(row.variance.nilRated)}`}>{formatCurrency(row.variance.nilRated)}</td>
                          <td className={`px-4 py-3 text-right border-r border-slate-700 bg-slate-900/50 text-base ${getNetVarColor(row.variance.nonTaxable)}`}>{formatCurrency(row.variance.nonTaxable)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
