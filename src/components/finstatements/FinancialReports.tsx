import { useState, useMemo } from 'react';
import {
  BarChart3, Landmark, FileText, Download, TrendingUp, TrendingDown,
  Building2, Hash, Layers, PieChart, Activity
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getClientSetup,
  aggregateNotes,
  getFixedAssets,
  getMasterGroupCodes
} from '@/lib/finStatements.storage';
import type { NoteAggregate } from '@/lib/finStatements.types';

// ---- Formatter ----
const INR = (v: number) => {
  if (v === 0) return '-';
  const formatted = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return v < 0 ? `(${formatted})` : formatted;
};

export default function FinancialReports() {
  const [activeTab, setActiveTab] = useState<'bs' | 'pl' | 'notes'>('bs');

  const client = getClientSetup();
  const rawNotes = useMemo(() => aggregateNotes(true), []); // zero-suppressed
  
  // Create Dynamic Note Mapping
  const noteDisplayMap = useMemo(() => {
    const map = new Map<number, number>();
    let counter = 1;
    for (const n of rawNotes) {
      map.set(n.note_reference, counter++);
    }
    return map;
  }, [rawNotes]);

  // Helper to fetch a note by static reference, returns value and display number
  // Automatically applies credit-normal sign transformation so normal balances are displayed positive
  const getNote = (staticRef: number) => {
    const note = rawNotes.find(n => n.note_reference === staticRef);
    if (!note) return { cy: 0, py: 0, displayNum: '' };
    
    const lineItem = note.line_items[0];
    const isCreditNormal = lineItem ? (lineItem.group_code >= 2000 && lineItem.group_code < 4000) : false;
    const multiplier = isCreditNormal ? -1 : 1;

    return {
      cy: note.cy_grand_total * multiplier,
      py: note.py_grand_total * multiplier,
      displayNum: noteDisplayMap.get(staticRef)?.toString() || ''
    };
  };

  // ---- P&L GROUPS (Needed first to calculate Net Profit) ----
  const revOps = getNote(30);
  const otherInc = getNote(31);
  const totalIncome = revOps.cy + otherInc.cy;
  const totalIncomePY = revOps.py + otherInc.py;

  const costMat = getNote(32);
  const purchStock = getNote(33);
  const changeInv = getNote(34);
  const empBenefit = getNote(35);
  const finCost = getNote(36);
  const depAmort = getNote(37);
  const otherExp = getNote(38);
  
  const totalExpenses = costMat.cy + purchStock.cy + changeInv.cy + empBenefit.cy + finCost.cy + depAmort.cy + otherExp.cy;
  const totalExpensesPY = costMat.py + purchStock.py + changeInv.py + empBenefit.py + finCost.py + depAmort.py + otherExp.py;

  const pbt = totalIncome - totalExpenses;
  const pbtPY = totalIncomePY - totalExpensesPY;

  const tax = getNote(39);
  const pat = pbt - tax.cy;
  const patPY = pbtPY - tax.py;

  // ---- BALANCE SHEET GROUPS ----
  // Equity & Liab
  const shareCapital = getNote(18);
  const reserves = getNote(19);
  const otherEquity = getNote(20);
  const shareWarrants = { cy: 0, py: 0, displayNum: '' };

  const ltBorrowings = getNote(21);
  const defTaxLiab = getNote(22);
  const otherNcLiab = getNote(23);
  const ncProvisions = getNote(24);

  const stBorrowings = getNote(25);
  const tradePayables = getNote(26);
  const otherCurrLiab = getNote(27);
  const currProvisions = getNote(29);
  const otherCurrLiab2 = getNote(28); // 28 is Other Current Liabilities

  // Dynamically roll unclosed Current Year Profit/Loss into Reserves and Surplus
  const reservesAdjustedCY = reserves.cy + pat;
  const reservesAdjustedPY = reserves.py + patPY;

  const totalEquity = shareCapital.cy + reservesAdjustedCY + otherEquity.cy;
  const totalEquityPY = shareCapital.py + reservesAdjustedPY + otherEquity.py;

  const totalNcLiab = ltBorrowings.cy + defTaxLiab.cy + otherNcLiab.cy + ncProvisions.cy;
  const totalNcLiabPY = ltBorrowings.py + defTaxLiab.py + otherNcLiab.py + ncProvisions.py;

  const totalCurrLiab = stBorrowings.cy + tradePayables.cy + otherCurrLiab.cy + currProvisions.cy + otherCurrLiab2.cy;
  const totalCurrLiabPY = stBorrowings.py + tradePayables.py + otherCurrLiab.py + currProvisions.py + otherCurrLiab2.py;

  const totalEqLiab = totalEquity + totalNcLiab + totalCurrLiab;
  const totalEqLiabPY = totalEquityPY + totalNcLiabPY + totalCurrLiabPY;

  // Assets
  const ppe = getNote(1);
  const intangible = getNote(2);
  const cwip = getNote(3);
  const intangibleWip = getNote(4);
  const ncInvestments = getNote(5);
  const ncLoans = getNote(6);
  const otherNcAssets = getNote(7);
  const defTaxAssets = getNote(8);
  const otherNcAssets2 = getNote(9);

  const inventories = getNote(10);
  const tradeReceivables = getNote(11);
  const cash = getNote(12);
  const otherBank = getNote(13);
  const currLoans = getNote(14);
  const otherCurrAssets = getNote(15);
  const currTaxAssets = getNote(16);
  const otherCurrAssets2 = getNote(17);

  const totalNcAssets = ppe.cy + intangible.cy + cwip.cy + intangibleWip.cy + ncInvestments.cy + ncLoans.cy + otherNcAssets.cy + defTaxAssets.cy + otherNcAssets2.cy;
  const totalNcAssetsPY = ppe.py + intangible.py + cwip.py + intangibleWip.py + ncInvestments.py + ncLoans.py + otherNcAssets.py + defTaxAssets.py + otherNcAssets2.py;

  const totalCurrAssets = inventories.cy + tradeReceivables.cy + cash.cy + otherBank.cy + currLoans.cy + otherCurrAssets.cy + currTaxAssets.cy + otherCurrAssets2.cy;
  const totalCurrAssetsPY = inventories.py + tradeReceivables.py + cash.py + otherBank.py + currLoans.py + otherCurrAssets.py + currTaxAssets.py + otherCurrAssets2.py;

  const totalAssets = totalNcAssets + totalCurrAssets;
  const totalAssetsPY = totalNcAssetsPY + totalCurrAssetsPY;

  // ---- Ratio and Audit calculations ----
  const debtorDaysCY = revOps.cy > 0 ? (tradeReceivables.cy / revOps.cy) * 365 : 0;
  const debtorDaysPY = revOps.py > 0 ? (tradeReceivables.py / revOps.py) * 365 : 0;

  // Structural Working Capital Inversion Check
  const changeReceivablesPct = tradeReceivables.py > 0 ? ((tradeReceivables.cy - tradeReceivables.py) / tradeReceivables.py) * 100 : 0;
  const changeRevenuePct = revOps.py > 0 ? ((revOps.cy - revOps.py) / revOps.py) * 100 : 0;
  const isWorkingCapitalInverted = changeReceivablesPct >= 50 && changeRevenuePct <= 0;

  // Overhead Consumption Margin Variance
  const changeEmployeePct = empBenefit.py > 0 ? ((empBenefit.cy - empBenefit.py) / empBenefit.py) * 100 : 0;
  const changeMaterialPct = costMat.py > 0 ? ((costMat.cy - costMat.py) / costMat.py) * 100 : 0;
  const overheadVariancePct = changeEmployeePct - changeMaterialPct;

  // 25% Statutory Variance Exception Notes
  const varianceExceptions = useMemo(() => {
    const list: { noteName: string; noteNum: string; cy: number; py: number; variance: number; comment: string }[] = [];
    rawNotes.forEach(n => {
      const isCredit = n.line_items[0] ? (n.line_items[0].group_code >= 2000 && n.line_items[0].group_code < 4000) : false;
      const mult = isCredit ? -1 : 1;
      const cyVal = n.cy_grand_total * mult;
      const pyVal = n.py_grand_total * mult;
      
      if (pyVal !== 0 && cyVal !== 0) {
        const diffPct = ((cyVal - pyVal) / Math.abs(pyVal)) * 100;
        if (Math.abs(diffPct) >= 25) {
          let comment = '';
          const dir = diffPct > 0 ? 'increase' : 'decrease';
          if (n.note_reference === 11) {
            comment = `Statutory note: Trade receivables registered a significant ${dir} of ${Math.abs(diffPct).toFixed(1)}%. Requires review of debtor collection velocity and age-wise provisioning.`;
          } else if (n.note_reference === 30) {
            comment = `Statutory note: Revenue from operations registered a ${dir} of ${Math.abs(diffPct).toFixed(1)}%. Cross-reference with GSTR-1 and GSTR-3B filings for variance explanation.`;
          } else if (n.note_reference === 35) {
            comment = `Statutory note: Employee benefits expense showed a ${dir} of ${Math.abs(diffPct).toFixed(1)}%. Audit variance against PF/ESI statutory returns and payroll registers.`;
          } else {
            comment = `Statutory note: Balance under ${n.note_title} changed by ${diffPct.toFixed(1)}%, exceeding the 25% statutory variance threshold. Requires note disclosure explaining operational drivers.`;
          }
          list.push({
            noteName: n.note_title,
            noteNum: noteDisplayMap.get(n.note_reference)?.toString() || '',
            cy: cyVal,
            py: pyVal,
            variance: diffPct,
            comment
          });
        }
      }
    });
    return list;
  }, [rawNotes, noteDisplayMap]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-400" />
            Financial Reports
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Generated for <span className="text-cyan-400 font-bold">{client.company_name || 'Client'}</span>
          </p>
        </div>
      </div>

      {/* Live Checks Banner */}
      <div className="flex gap-4 p-4 rounded-xl bg-slate-900/60 border border-white/5 backdrop-blur-md">
        <button 
          onClick={() => {
            localStorage.setItem('tally_cross_nav_filter', JSON.stringify({ status: 'unmapped', ts: Date.now() }));
            toast.success('Jumped to Unmapped Ledgers');
          }}
          className="flex-1 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-all text-left group"
        >
          <div className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1 group-hover:text-amber-400">Unmapped Check</div>
          <div className="text-sm text-amber-400 font-bold">Unmapped Ledgers count</div>
        </button>

        <button 
          className={`flex-1 p-3 rounded-lg border transition-all text-left ${
            Math.abs(totalAssets - totalEqLiab) < 0.05 ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10 hover:bg-red-500/20 cursor-pointer'
          }`}
        >
          <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${Math.abs(totalAssets - totalEqLiab) < 0.05 ? 'text-emerald-500' : 'text-red-500'}`}>Balance Sheet Check</div>
          <div className={`text-sm ${Math.abs(totalAssets - totalEqLiab) < 0.05 ? 'text-emerald-400' : 'text-red-400'}`}>
            {Math.abs(totalAssets - totalEqLiab) < 0.05 ? 'Balanced' : `Diff: ₹${Math.abs(totalAssets - totalEqLiab).toLocaleString('en-IN')}`}
          </div>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/5 pb-2">
        <TabButton active={activeTab === 'bs'} onClick={() => setActiveTab('bs')} icon={Landmark} label="Balance Sheet" />
        <TabButton active={activeTab === 'pl'} onClick={() => setActiveTab('pl')} icon={Activity} label="Profit & Loss" />
        <TabButton active={activeTab === 'notes'} onClick={() => setActiveTab('notes')} icon={FileText} label="Notes to Accounts" />
        <TabButton active={activeTab === 'ratios' as any} onClick={() => setActiveTab('ratios' as any)} icon={TrendingUp} label="Compliance & Ratios Audit" />
      </div>

      {/* Content */}
      <div className="bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden p-6">
        
        {/* === BALANCE SHEET === */}
        {activeTab === 'bs' && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h3 className="text-lg font-black text-white uppercase tracking-widest">{client.company_name || 'COMPANY NAME'}</h3>
              <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Balance Sheet as at 31st March</p>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-white/10">
                  <th className="text-left py-2 text-slate-500 font-bold uppercase text-[10px] tracking-widest w-2/3">Particulars</th>
                  <th className="text-center py-2 text-slate-500 font-bold uppercase text-[10px] tracking-widest w-16">Note No.</th>
                  <th className="text-right py-2 text-slate-500 font-bold uppercase text-[10px] tracking-widest">Current Year (₹)</th>
                  <th className="text-right py-2 text-slate-500 font-bold uppercase text-[10px] tracking-widest">Previous Year (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                
                {/* I. EQUITY AND LIABILITIES */}
                <GroupHeader title="I. EQUITY AND LIABILITIES" />
                
                <SubHeader title="1. Shareholders' funds" />
                <Row title="(a) Share capital" note={shareCapital.displayNum} cy={shareCapital.cy} py={shareCapital.py} staticRef={18} />
                <Row title="(b) Reserves and surplus" note={reserves.displayNum} cy={reservesAdjustedCY} py={reservesAdjustedPY} staticRef={19} />
                <Row title="(c) Money received against share warrants" cy={0} py={0} />

                <SubHeader title="2. Share application money pending allotment" />
                
                <SubHeader title="3. Non-current liabilities" />
                <Row title="(a) Long-term borrowings" note={ltBorrowings.displayNum} cy={ltBorrowings.cy} py={ltBorrowings.py} staticRef={21} />
                <Row title="(b) Deferred tax liabilities (Net)" note={defTaxLiab.displayNum} cy={defTaxLiab.cy} py={defTaxLiab.py} staticRef={22} />
                <Row title="(c) Other Long term liabilities" note={otherNcLiab.displayNum} cy={otherNcLiab.cy} py={otherNcLiab.py} staticRef={23} />
                <Row title="(d) Long-term provisions" note={ncProvisions.displayNum} cy={ncProvisions.cy} py={ncProvisions.py} staticRef={24} />

                <SubHeader title="4. Current liabilities" />
                <Row title="(a) Short-term borrowings" note={stBorrowings.displayNum} cy={stBorrowings.cy} py={stBorrowings.py} staticRef={25} />
                <Row title="(b) Trade payables" note={tradePayables.displayNum} cy={tradePayables.cy} py={tradePayables.py} staticRef={26} />
                <Row title="(c) Other current liabilities" note={otherCurrLiab2.displayNum} cy={otherCurrLiab2.cy + otherCurrLiab.cy} py={otherCurrLiab2.py + otherCurrLiab.py} staticRef={28} />
                <Row title="(d) Short-term provisions" note={currProvisions.displayNum} cy={currProvisions.cy} py={currProvisions.py} staticRef={29} />

                <TotalRow title="TOTAL EQUITY AND LIABILITIES" cy={totalEqLiab} py={totalEqLiabPY} />

                {/* II. ASSETS */}
                <tr className="h-6"></tr>
                <GroupHeader title="II. ASSETS" />

                <SubHeader title="1. Non-current assets" />
                <Row title="(a) Property, Plant and Equipment" note={ppe.displayNum} cy={ppe.cy} py={ppe.py} indent={2} staticRef={1} />
                <Row title="(b) Intangible assets" note={intangible.displayNum} cy={intangible.cy} py={intangible.py} indent={2} staticRef={2} />
                <Row title="(c) Capital work-in-progress" note={cwip.displayNum} cy={cwip.cy} py={cwip.py} indent={2} staticRef={3} />
                <Row title="(d) Intangible assets under development" note={intangibleWip.displayNum} cy={intangibleWip.cy} py={intangibleWip.py} indent={2} staticRef={4} />
                <Row title="(e) Non-current investments" note={ncInvestments.displayNum} cy={ncInvestments.cy} py={ncInvestments.py} staticRef={5} />
                <Row title="(f) Deferred tax assets (net)" note={defTaxAssets.displayNum} cy={defTaxAssets.cy} py={defTaxAssets.py} staticRef={8} />
                <Row title="(g) Long-term loans and advances" note={ncLoans.displayNum} cy={ncLoans.cy} py={ncLoans.py} staticRef={6} />
                <Row title="(h) Other non-current assets" note={otherNcAssets.displayNum} cy={otherNcAssets.cy + otherNcAssets2.cy} py={otherNcAssets.py + otherNcAssets2.py} staticRef={7} />

                <SubHeader title="2. Current assets" />
                <Row title="(a) Current investments" cy={0} py={0} />
                <Row title="(b) Inventories" note={inventories.displayNum} cy={inventories.cy} py={inventories.py} staticRef={10} />
                <Row title="(c) Trade receivables" note={tradeReceivables.displayNum} cy={tradeReceivables.cy} py={tradeReceivables.py} staticRef={11} />
                <Row title="(d) Cash and cash equivalents" note={cash.displayNum} cy={cash.cy} py={cash.py} staticRef={12} />
                <Row title="(e) Short-term loans and advances" note={currLoans.displayNum} cy={currLoans.cy} py={currLoans.py} staticRef={14} />
                <Row title="(f) Other current assets" note={otherCurrAssets.displayNum} cy={otherCurrAssets.cy + otherCurrAssets2.cy + currTaxAssets.cy + otherBank.cy} py={otherCurrAssets.py + otherCurrAssets2.py + currTaxAssets.py + otherBank.py} staticRef={15} />

                <TotalRow title="TOTAL ASSETS" cy={totalAssets} py={totalAssetsPY} />
              </tbody>
            </table>
          </div>
        )}

        {/* === PROFIT & LOSS === */}
        {activeTab === 'pl' && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h3 className="text-lg font-black text-white uppercase tracking-widest">{client.company_name || 'COMPANY NAME'}</h3>
              <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Statement of Profit & Loss for the year ended 31st March</p>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-white/10">
                  <th className="text-left py-2 text-slate-500 font-bold uppercase text-[10px] tracking-widest w-2/3">Particulars</th>
                  <th className="text-center py-2 text-slate-500 font-bold uppercase text-[10px] tracking-widest w-16">Note No.</th>
                  <th className="text-right py-2 text-slate-500 font-bold uppercase text-[10px] tracking-widest">Current Year (₹)</th>
                  <th className="text-right py-2 text-slate-500 font-bold uppercase text-[10px] tracking-widest">Previous Year (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                <Row title="I. Revenue from operations" note={revOps.displayNum} cy={revOps.cy} py={revOps.py} bold staticRef={30} />
                <Row title="II. Other income" note={otherInc.displayNum} cy={otherInc.cy} py={otherInc.py} bold staticRef={31} />
                <TotalRow title="III. Total Revenue (I + II)" cy={totalIncome} py={totalIncomePY} />

                <tr className="h-4"></tr>
                <GroupHeader title="IV. Expenses:" />
                <Row title="Cost of materials consumed" note={costMat.displayNum} cy={costMat.cy} py={costMat.py} staticRef={32} />
                <Row title="Purchases of Stock-in-Trade" note={purchStock.displayNum} cy={purchStock.cy} py={purchStock.py} staticRef={33} />
                <Row title="Changes in inventories" note={changeInv.displayNum} cy={changeInv.cy} py={changeInv.py} staticRef={34} />
                <Row title="Employee benefits expense" note={empBenefit.displayNum} cy={empBenefit.cy} py={empBenefit.py} staticRef={35} />
                <Row title="Finance costs" note={finCost.displayNum} cy={finCost.cy} py={finCost.py} staticRef={36} />
                <Row title="Depreciation and amortization expense" note={depAmort.displayNum} cy={depAmort.cy} py={depAmort.py} staticRef={37} />
                <Row title="Other expenses" note={otherExp.displayNum} cy={otherExp.cy} py={otherExp.py} staticRef={38} />
                
                <TotalRow title="Total expenses" cy={totalExpenses} py={totalExpensesPY} />
                
                <tr className="h-4"></tr>
                <TotalRow title="V. Profit before tax (III - IV)" cy={pbt} py={pbtPY} />

                <tr className="h-4"></tr>
                <GroupHeader title="VI. Tax expense:" />
                <Row title="(1) Current tax" note={tax.displayNum} cy={tax.cy} py={tax.py} staticRef={39} />
                <Row title="(2) Deferred tax" cy={0} py={0} />

                <TotalRow title="VII. Profit for the period (V - VI)" cy={pat} py={patPY} highlight />

              </tbody>
            </table>
          </div>
        )}

        {/* === NOTES === */}
        {activeTab === 'notes' && (
          <div className="space-y-8">
            <div className="text-center mb-8">
              <h3 className="text-lg font-black text-white uppercase tracking-widest">{client.company_name || 'COMPANY NAME'}</h3>
              <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Notes forming part of the financial statements</p>
            </div>

            {rawNotes.length === 0 ? (
              <p className="text-center text-slate-500 py-10">No mapped data available for notes.</p>
            ) : (
              rawNotes.map((note) => (
                <div key={note.note_reference} className="break-inside-avoid">
                  <div className="flex items-end justify-between border-b-2 border-white/10 pb-2 mb-3">
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                      <span className="text-cyan-400 mr-2">Note {noteDisplayMap.get(note.note_reference)}:</span>
                      {note.note_title}
                    </h4>
                    <div className="flex gap-16 text-right">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest w-24">Current Year</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest w-24">Previous Year</span>
                    </div>
                  </div>
                  
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-white/[0.03]">
                      {note.line_items.map((item, idx) => {
                        const isCreditNormal = item.group_code >= 2000 && item.group_code < 4000;
                        const multiplier = isCreditNormal ? -1 : 1;
                        return (
                          <tr key={idx} className="hover:bg-white/[0.02]">
                            <td className="py-2 text-slate-300">{item.particulars}</td>
                            <td className="py-2 text-right text-slate-300 font-mono w-28">{INR(item.cy_total * multiplier)}</td>
                            <td className="py-2 text-right text-slate-400 font-mono w-28">{INR(item.py_total * multiplier)}</td>
                          </tr>
                        );
                      })}
                      {note.note_reference === 19 && (
                        <tr className="hover:bg-white/[0.02] text-cyan-400 font-medium">
                          <td className="py-2 pl-4">Add: Net Profit for the year (rolled forward)</td>
                          <td className="py-2 text-right font-mono w-28">{INR(pat)}</td>
                          <td className="py-2 text-right font-mono w-28">{INR(patPY)}</td>
                        </tr>
                      )}
                      <tr className="bg-white/[0.02] border-y border-white/10">
                        <td className="py-2 font-bold text-cyan-100 text-right pr-4">Total</td>
                        <td className="py-2 text-right font-bold text-cyan-300 font-mono border-t border-cyan-500/20">
                          {INR((note.cy_grand_total * (note.line_items[0]?.group_code >= 2000 && note.line_items[0]?.group_code < 4000 ? -1 : 1)) + (note.note_reference === 19 ? pat : 0))}
                        </td>
                        <td className="py-2 text-right font-bold text-slate-300 font-mono border-t border-cyan-500/20">
                          {INR((note.py_grand_total * (note.line_items[0]?.group_code >= 2000 && note.line_items[0]?.group_code < 4000 ? -1 : 1)) + (note.note_reference === 19 ? patPY : 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </div>
        )}

        {/* === COMPLIANCE & RATIOS AUDIT === */}
        {activeTab === 'ratios' as any && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h3 className="text-lg font-black text-white uppercase tracking-widest">{client.company_name || 'COMPANY NAME'}</h3>
              <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Compliance & Ratios Audit Report</p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {/* Ratio 1: Debtor Velocity */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Debtor Collection Velocity</div>
                <div className="text-2xl font-black text-white font-mono">{debtorDaysCY.toFixed(1)} Days</div>
                <div className="text-xs text-slate-500">Previous Year: <span className="font-mono">{debtorDaysPY.toFixed(1)} Days</span></div>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  {debtorDaysCY > debtorDaysPY 
                    ? `⚠️ Collection window has lengthened by ${(debtorDaysCY - debtorDaysPY).toFixed(1)} days, indicating potential collection inefficiency.`
                    : `✓ Collection window has shortened, showing improved cash velocity.`}
                </p>
              </div>

              {/* Ratio 2: WC Inversion */}
              <div className={`bg-slate-900/60 border rounded-xl p-4 space-y-2 ${isWorkingCapitalInverted ? 'border-red-500/30' : 'border-slate-800'}`}>
                <div className="text-xs font-bold text-purple-400 uppercase tracking-wider">Working Capital Inversion</div>
                <div className={`text-sm font-bold uppercase tracking-wider ${isWorkingCapitalInverted ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
                  {isWorkingCapitalInverted ? 'CRITICAL ALERT (Inverted)' : 'NORMAL'}
                </div>
                <div className="space-y-1 text-xs text-slate-500 mt-2">
                  <div>Δ Receivables: <span className={`font-mono ${changeReceivablesPct >= 50 ? 'text-amber-400 font-bold' : ''}`}>{changeReceivablesPct.toFixed(1)}%</span></div>
                  <div>Δ Revenue: <span className={`font-mono ${changeRevenuePct <= 0 ? 'text-red-400 font-bold' : ''}`}>{changeRevenuePct.toFixed(1)}%</span></div>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed mt-2">
                  {isWorkingCapitalInverted 
                    ? '⚠️ Warning: Receivables are expanding rapidly while revenue is flat or contracting, indicating cash is locked up in working capital.'
                    : '✓ Healthy relationship between sales volume growth and receivables growth.'}
                </p>
              </div>

              {/* Ratio 3: Overhead Margin */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="text-xs font-bold text-teal-400 uppercase tracking-wider">Overhead Variance</div>
                <div className="text-2xl font-black text-white font-mono">{overheadVariancePct.toFixed(1)}%</div>
                <div className="space-y-1 text-xs text-slate-500">
                  <div>Δ Employee Cost: <span className="font-mono">{changeEmployeePct.toFixed(1)}%</span></div>
                  <div>Δ Material Cost: <span className="font-mono">{changeMaterialPct.toFixed(1)}%</span></div>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed mt-2">
                  {overheadVariancePct > 0 
                    ? `⚠️ Administrative/payroll cost growth exceeds material cost variance. Overhead is consuming direct margins.`
                    : `✓ Overhead growth is aligned with direct cost changes.`}
                </p>
              </div>
            </div>

            {/* 25% Exceptions Section */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <h4 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Statutory 25% Variance Analysis Exceptions
              </h4>
              
              {varianceExceptions.length === 0 ? (
                <p className="text-xs text-slate-500 py-3">No note item registers a year-over-year change exceeding the statutory 25% threshold.</p>
              ) : (
                <div className="space-y-3">
                  {varianceExceptions.map((ex, idx) => (
                    <div key={idx} className="bg-slate-950/60 border border-white/5 rounded-lg p-3 space-y-1.5 animate-in slide-in-from-top-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-300">Note {ex.noteNum}: {ex.noteName}</span>
                        <span className={`font-mono font-bold ${ex.variance > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {ex.variance > 0 ? '+' : ''}{ex.variance.toFixed(1)}% YoY
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        Current: <span className="text-slate-300 font-mono">₹{ex.cy.toLocaleString('en-IN')}</span> | Previous: <span className="text-slate-400 font-mono">₹{ex.py.toLocaleString('en-IN')}</span>
                      </div>
                      <p className="text-[11px] text-amber-400/90 italic bg-amber-500/5 border border-amber-500/10 p-2 rounded mt-1">
                        {ex.comment}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ---- Sub Components ----

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}
function TabButton({ active, onClick, icon: Icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
        active
          ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_12px_rgba(6,182,212,0.1)]'
          : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03] border border-transparent'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function GroupHeader({ title }: { title: string }) {
  return (
    <tr>
      <td colSpan={4} className="py-3 text-sm font-black text-white tracking-widest">{title}</td>
    </tr>
  );
}

function SubHeader({ title }: { title: string }) {
  return (
    <tr>
      <td colSpan={4} className="py-2 pl-4 text-xs font-bold text-slate-200">{title}</td>
    </tr>
  );
}

interface RowProps {
  title: string;
  note?: string;
  cy: number;
  py: number;
  indent?: number;
  bold?: boolean;
  staticRef?: number;
}
function Row({ title, note, cy, py, indent = 1, bold = false, staticRef }: RowProps) {
  const plClass = indent === 1 ? 'pl-8' : indent === 2 ? 'pl-12' : '';
  const textClass = bold ? 'font-bold text-slate-200' : 'text-slate-300';
  
  const handleClick = () => {
    if (staticRef !== undefined) {
      localStorage.setItem('tally_cross_nav_filter', JSON.stringify({ note: staticRef, ts: Date.now() }));
      toast.success(`Jumped to mapping for ${title}`);
    }
  };

  return (
    <tr 
      onClick={handleClick}
      className={`transition-colors ${staticRef !== undefined ? 'hover:bg-cyan-500/10 cursor-pointer group' : 'hover:bg-white/[0.02]'}`}
    >
      <td className={`py-2 ${plClass} ${textClass} ${staticRef !== undefined ? 'group-hover:text-cyan-400' : ''}`}>
        {title}
      </td>
      <td className="py-2 text-center text-cyan-400/80 font-mono text-xs">{note}</td>
      <td className={`py-2 text-right font-mono ${bold ? 'text-slate-200 font-bold' : 'text-slate-300'}`}>{INR(cy)}</td>
      <td className={`py-2 text-right font-mono ${bold ? 'text-slate-300 font-bold' : 'text-slate-400'}`}>{INR(py)}</td>
    </tr>
  );
}

interface TotalRowProps {
  title: string;
  cy: number;
  py: number;
  highlight?: boolean;
}
function TotalRow({ title, cy, py, highlight = false }: TotalRowProps) {
  return (
    <tr className={highlight ? 'bg-cyan-500/10 border-y border-cyan-500/30' : 'border-t border-slate-700 bg-white/[0.02]'}>
      <td className={`py-3 text-right font-black uppercase tracking-wider pr-4 ${highlight ? 'text-cyan-300' : 'text-slate-200'}`}>{title}</td>
      <td></td>
      <td className={`py-3 text-right font-mono font-bold ${highlight ? 'text-cyan-300 text-base' : 'text-slate-200'}`}>{INR(cy)}</td>
      <td className={`py-3 text-right font-mono font-bold ${highlight ? 'text-cyan-400/80 text-base' : 'text-slate-300'}`}>{INR(py)}</td>
    </tr>
  );
}
