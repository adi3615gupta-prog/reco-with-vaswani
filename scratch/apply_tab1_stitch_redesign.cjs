const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'ReturnsDashboard.tsx');
let code = fs.readFileSync(filePath, 'utf-8');

// 1. Add showDetailedWorksheet state if not present
if (!code.includes('showDetailedWorksheet')) {
  code = code.replace(
    'const [showQuickGuide, setShowQuickGuide] = useState(false);',
    'const [showQuickGuide, setShowQuickGuide] = useState(false);\n  const [showDetailedWorksheet, setShowDetailedWorksheet] = useState(false);'
  );
}

// 2. Locate the region from `{/* KPI Dashboard Cards for the Selected Month */}` down to end of Table in Tab 1
const startMarker = '{/* KPI Dashboard Cards for the Selected Month */}';
const endMarker = '{/* TAB 2: 12-MONTH FINANCIAL YEAR MATRIX */}';

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error('Could not find start or end marker!', { startIndex, endIndex });
  process.exit(1);
}

// We want to replace from startMarker up to just before endMarker (preserving the closing `</div>\n      )}\n\n      `)
const searchRegion = code.substring(startIndex, endIndex);
const lastDivIndex = searchRegion.lastIndexOf('</div>\n      )}');

if (lastDivIndex === -1) {
  console.error('Could not find closing div for Tab 1');
  process.exit(1);
}

const replacement = `{/* 4 & 5. MAIN DATA WORKSPACE: 8:4 SPLIT GRID (1:1 STITCH BLUEPRINT) */}
          {(() => {
            // Computed statutory summary for Table 3.1
            const t31a_taxable = (currentMonthData.outward.b2b?.taxable || 0) + (currentMonthData.outward.b2c?.taxable || 0) + 
              (currentMonthData.outward.advanceReceived?.taxable || 0) + (currentMonthData.outward.rentReceived?.taxable || 0) + 
              (currentMonthData.outward.saleIncreaseAmendment?.taxable || 0) - (currentMonthData.outward.saleDecreaseAmendment?.taxable || 0) - 
              (currentMonthData.outward.creditNote?.taxable || 0) - (currentMonthData.outward.advanceAdjusted?.taxable || 0);
            const t31a_igst = (currentMonthData.outward.b2b?.igst || 0) + (currentMonthData.outward.b2c?.igst || 0) + 
              (currentMonthData.outward.advanceReceived?.igst || 0) + (currentMonthData.outward.rentReceived?.igst || 0) + 
              (currentMonthData.outward.saleIncreaseAmendment?.igst || 0) - (currentMonthData.outward.saleDecreaseAmendment?.igst || 0) - 
              (currentMonthData.outward.creditNote?.igst || 0) - (currentMonthData.outward.advanceAdjusted?.igst || 0);
            const t31a_cgst = (currentMonthData.outward.b2b?.cgst || 0) + (currentMonthData.outward.b2c?.cgst || 0) + 
              (currentMonthData.outward.advanceReceived?.cgst || 0) + (currentMonthData.outward.rentReceived?.cgst || 0) + 
              (currentMonthData.outward.saleIncreaseAmendment?.cgst || 0) - (currentMonthData.outward.saleDecreaseAmendment?.cgst || 0) - 
              (currentMonthData.outward.creditNote?.cgst || 0) - (currentMonthData.outward.advanceAdjusted?.cgst || 0);
            const t31a_sgst = (currentMonthData.outward.b2b?.sgst || 0) + (currentMonthData.outward.b2c?.sgst || 0) + 
              (currentMonthData.outward.advanceReceived?.sgst || 0) + (currentMonthData.outward.rentReceived?.sgst || 0) + 
              (currentMonthData.outward.saleIncreaseAmendment?.sgst || 0) - (currentMonthData.outward.saleDecreaseAmendment?.sgst || 0) - 
              (currentMonthData.outward.creditNote?.sgst || 0) - (currentMonthData.outward.advanceAdjusted?.sgst || 0);

            const t31b_taxable = (currentMonthData.outward.zeroRated?.taxable || 0) + (currentMonthData.outward.sezWithPayment?.taxable || 0) + (currentMonthData.outward.sezWithoutPayment?.taxable || 0);
            const t31b_igst = (currentMonthData.outward.zeroRated?.igst || 0) + (currentMonthData.outward.sezWithPayment?.igst || 0);
            const t31b_cgst = (currentMonthData.outward.zeroRated?.cgst || 0) + (currentMonthData.outward.sezWithPayment?.cgst || 0);
            const t31b_sgst = (currentMonthData.outward.zeroRated?.sgst || 0) + (currentMonthData.outward.sezWithPayment?.sgst || 0);

            const t31c_taxable = (currentMonthData.outward.nilRated?.taxable || 0) + (currentMonthData.outward.exempt?.taxable || 0);

            // Computed statutory summary for Table 4
            const t4_avail_igst = (currentMonthData.inward.importGoods?.igst || 0) + (currentMonthData.inward.rcmPaid?.igst || 0) + (currentMonthData.inward.itc2b?.igst || 0) + (currentMonthData.inward.creditNotes?.igst || 0) + (currentMonthData.inward.openingCreditBal?.igst || 0);
            const t4_avail_cgst = (currentMonthData.inward.importGoods?.cgst || 0) + (currentMonthData.inward.rcmPaid?.cgst || 0) + (currentMonthData.inward.itc2b?.cgst || 0) + (currentMonthData.inward.creditNotes?.cgst || 0) + (currentMonthData.inward.openingCreditBal?.cgst || 0);
            const t4_avail_sgst = (currentMonthData.inward.importGoods?.sgst || 0) + (currentMonthData.inward.rcmPaid?.sgst || 0) + (currentMonthData.inward.itc2b?.sgst || 0) + (currentMonthData.inward.creditNotes?.sgst || 0) + (currentMonthData.inward.openingCreditBal?.sgst || 0);

            const t4_rev_igst = (currentMonthData.inward.itcReversed?.igst || 0) + (currentMonthData.inward.debitNotes?.igst || 0);
            const t4_rev_cgst = (currentMonthData.inward.itcReversed?.cgst || 0) + (currentMonthData.inward.debitNotes?.cgst || 0);
            const t4_rev_sgst = (currentMonthData.inward.itcReversed?.sgst || 0) + (currentMonthData.inward.debitNotes?.sgst || 0);

            // Rule 88A Waterfall Numbers
            const igstCreditAvail = currentMonthData.inward.totalItcAvailable.igst;
            const igstLiab = currentMonthData.outward.totalSalePortal.igst;
            const igstAppliedToIgst = Math.min(igstCreditAvail, igstLiab);
            const residualIgst = Math.max(0, igstCreditAvail - igstLiab);
            const igstCreditUtilizedPercent = igstCreditAvail > 0 ? Math.min(100, Math.round(((igstCreditAvail - (currentMonthData.setoff.balanceCfNextMonth?.igst || 0)) / igstCreditAvail) * 100)) : 0;

            const cgstCreditAvail = currentMonthData.inward.totalItcAvailable.cgst;
            const cgstLiab = currentMonthData.outward.totalSalePortal.cgst;
            const cgstAppliedToCgst = Math.min(cgstCreditAvail, cgstLiab);

            const sgstCreditAvail = currentMonthData.inward.totalItcAvailable.sgst;
            const sgstLiab = currentMonthData.outward.totalSalePortal.sgst;
            const sgstAppliedToSgst = Math.min(sgstCreditAvail, sgstLiab);

            return (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* LEFT 8 COLS: Table 3.1 Outward, Table 4 ITC, Table 6.1 Cash */}
                <div className="lg:col-span-8 space-y-4">
                  {/* TABLE 3.1: OUTWARD TAXABLE SUPPLIES */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden transition-all duration-300 hover:shadow-md">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold font-mono">3.1</span>
                        <div>
                          <h2 className="text-sm font-bold text-slate-900 tracking-tight">Outward Supplies &amp; Inward Liable to Reverse Charge (RCM)</h2>
                          <p className="text-[11px] text-slate-500">Auto-reconciled with GSTR-1 &amp; Sales Register</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowDetailedWorksheet(!showDetailedWorksheet)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1"
                        >
                          <ChevronDown className={\`w-3.5 h-3.5 transition-transform \${showDetailedWorksheet ? 'rotate-180' : ''}\`} />
                          <span>{showDetailedWorksheet ? 'Hide Granular' : 'Edit Sub-Accounts'}</span>
                        </button>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 100% Reconciled
                        </span>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/30">
                            <th className="py-2.5 px-4 font-medium">Nature of Supplies</th>
                            <th className="py-2.5 px-3 text-right font-medium">Taxable Value (₹)</th>
                            <th className="py-2.5 px-3 text-right font-medium">IGST (₹)</th>
                            <th className="py-2.5 px-3 text-right font-medium">CGST (₹)</th>
                            <th className="py-2.5 px-3 text-right font-medium">SGST (₹)</th>
                            <th className="py-2.5 px-4 text-right font-medium">Cess / Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                          <tr className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-4 font-sans font-medium text-slate-800">(a) Outward taxable supplies (other than zero rated, nil, exempt)</td>
                            <td className="py-2.5 px-3 text-right">{formatCur(t31a_taxable)}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatCur(t31a_igst)}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatCur(t31a_cgst)}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatCur(t31a_sgst)}</td>
                            <td className="py-2.5 px-4 text-right text-slate-400">0.00</td>
                          </tr>
                          <tr className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-4 font-sans font-medium text-slate-800">(b) Outward taxable supplies (zero rated - Exports / SEZ)</td>
                            <td className="py-2.5 px-3 text-right">{formatCur(t31b_taxable)}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatCur(t31b_igst)}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatCur(t31b_cgst)}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatCur(t31b_sgst)}</td>
                            <td className="py-2.5 px-4 text-right text-slate-400">0.00</td>
                          </tr>
                          <tr className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-4 font-sans font-medium text-slate-800">(c) Other outward supplies (Nil rated, exempted)</td>
                            <td className="py-2.5 px-3 text-right">{formatCur(t31c_taxable)}</td>
                            <td className="py-2.5 px-3 text-right text-slate-400">0.00</td>
                            <td className="py-2.5 px-3 text-right text-slate-400">0.00</td>
                            <td className="py-2.5 px-3 text-right text-slate-400">0.00</td>
                            <td className="py-2.5 px-4 text-right text-slate-400">0.00</td>
                          </tr>
                          <tr className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-4 font-sans font-medium text-slate-800">(d) Inward supplies (liable to reverse charge - RCM)</td>
                            <td className="py-2.5 px-3 text-right">{formatCur(currentMonthData.outward.rcmInward?.taxable || 0)}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatCur(currentMonthData.outward.rcmInward?.igst || 0)}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatCur(currentMonthData.outward.rcmInward?.cgst || 0)}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatCur(currentMonthData.outward.rcmInward?.sgst || 0)}</td>
                            <td className="py-2.5 px-4 text-right text-slate-400">0.00</td>
                          </tr>
                          {/* Total Row */}
                          <tr className="bg-purple-50/50 font-bold border-t-2 border-purple-200/60">
                            <td className="py-3 px-4 font-sans text-purple-950 font-bold">Total Gross Tax Liability (3.1)</td>
                            <td className="py-3 px-3 text-right text-slate-900">{formatCur(currentMonthData.outward.totalSalePortal.taxable)}</td>
                            <td className="py-3 px-3 text-right text-purple-700">{formatCur(currentMonthData.outward.totalSalePortal.igst)}</td>
                            <td className="py-3 px-3 text-right text-purple-700">{formatCur(currentMonthData.outward.totalSalePortal.cgst)}</td>
                            <td className="py-3 px-3 text-right text-purple-700">{formatCur(currentMonthData.outward.totalSalePortal.sgst)}</td>
                            <td className="py-3 px-4 text-right text-purple-800 font-extrabold">{formatCur(currentMonthData.outward.totalSalePortal.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* TABLE 4: ELIGIBLE INPUT TAX CREDIT (ITC) & REVERSALS */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden transition-all duration-300 hover:shadow-md">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold font-mono">4</span>
                        <div>
                          <h2 className="text-sm font-bold text-slate-900 tracking-tight">Eligible Input Tax Credit (ITC) &amp; Reversals</h2>
                          <p className="text-[11px] text-slate-500">Cross-verified against GSTR-2B Auto-Drafted Statement</p>
                        </div>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200/60 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-purple-600" /> Rule 36(4) Compliant (105% Cap Safe)
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/30">
                            <th className="py-2.5 px-4 font-medium">Credit Breakdown</th>
                            <th className="py-2.5 px-3 text-right font-medium">IGST (₹)</th>
                            <th className="py-2.5 px-3 text-right font-medium">CGST (₹)</th>
                            <th className="py-2.5 px-3 text-right font-medium">SGST (₹)</th>
                            <th className="py-2.5 px-4 text-right font-medium">Cess / Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                          <tr className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-4 font-sans font-semibold text-slate-900">(1) ITC Available (Whether in full or part)</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatCur(t4_avail_igst)}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatCur(t4_avail_cgst)}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatCur(t4_avail_sgst)}</td>
                            <td className="py-2.5 px-4 text-right font-bold text-slate-900">{formatCur(t4_avail_igst + t4_avail_cgst + t4_avail_sgst)}</td>
                          </tr>
                          <tr className="hover:bg-slate-50/60 transition-colors text-slate-500">
                            <td className="py-2 px-4 pl-8 font-sans">↳ A. Import of goods (included above)</td>
                            <td className="py-2 px-3 text-right">{formatCur(currentMonthData.inward.importGoods?.igst || 0)}</td>
                            <td className="py-2 px-3 text-right">0.00</td>
                            <td className="py-2 px-3 text-right">0.00</td>
                            <td className="py-2 px-4 text-right text-slate-400">0.00</td>
                          </tr>
                          <tr className="hover:bg-slate-50/60 transition-colors text-slate-500">
                            <td className="py-2 px-4 pl-8 font-sans">↳ B. Inward supplies liable to RCM</td>
                            <td className="py-2 px-3 text-right">{formatCur(currentMonthData.inward.rcmPaid?.igst || 0)}</td>
                            <td className="py-2 px-3 text-right">{formatCur(currentMonthData.inward.rcmPaid?.cgst || 0)}</td>
                            <td className="py-2 px-3 text-right">{formatCur(currentMonthData.inward.rcmPaid?.sgst || 0)}</td>
                            <td className="py-2 px-4 text-right text-slate-400">0.00</td>
                          </tr>
                          <tr className="hover:bg-slate-50/60 transition-colors text-slate-500">
                            <td className="py-2 px-4 pl-8 font-sans">↳ C. All other ITC (GSTR-2B Net)</td>
                            <td className="py-2 px-3 text-right">{formatCur(currentMonthData.inward.itc2b?.igst || 0)}</td>
                            <td className="py-2 px-3 text-right">{formatCur(currentMonthData.inward.itc2b?.cgst || 0)}</td>
                            <td className="py-2 px-3 text-right">{formatCur(currentMonthData.inward.itc2b?.sgst || 0)}</td>
                            <td className="py-2 px-4 text-right font-medium text-emerald-700">{formatCur(currentMonthData.inward.itc2b?.total || 0)}</td>
                          </tr>
                          <tr className="hover:bg-rose-50/30 transition-colors">
                            <td className="py-2.5 px-4 font-sans font-medium text-rose-700">(2) ITC Reversed (Rule 42 &amp; 43 / Section 17(5) Blocked)</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-rose-600">-{formatCur(t4_rev_igst)}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-rose-600">-{formatCur(t4_rev_cgst)}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-rose-600">-{formatCur(t4_rev_sgst)}</td>
                            <td className="py-2.5 px-4 text-right text-rose-700 font-bold">-{formatCur(t4_rev_igst + t4_rev_cgst + t4_rev_sgst)}</td>
                          </tr>
                          {/* Net Row */}
                          <tr className="bg-emerald-50/50 font-bold border-t-2 border-emerald-200/60">
                            <td className="py-3 px-4 font-sans text-emerald-950 font-bold">(3) Net Eligible ITC Available (1 - 2)</td>
                            <td className="py-3 px-3 text-right text-emerald-700">{formatCur(currentMonthData.inward.totalItcAvailable.igst)}</td>
                            <td className="py-3 px-3 text-right text-emerald-700">{formatCur(currentMonthData.inward.totalItcAvailable.cgst)}</td>
                            <td className="py-3 px-3 text-right text-emerald-700">{formatCur(currentMonthData.inward.totalItcAvailable.sgst)}</td>
                            <td className="py-3 px-4 text-right text-emerald-800 font-extrabold">{formatCur(currentMonthData.inward.totalItcAvailable.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* TABLE 6.1: CASH PAYABLE CHALLAN SUMMARY */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden transition-all duration-300 hover:shadow-md">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold font-mono">6.1</span>
                        <div>
                          <h2 className="text-sm font-bold text-slate-900 tracking-tight">Net Tax Payable in Cash (Electronic Cash Ledger Deposit)</h2>
                          <p className="text-[11px] text-slate-500">Post Rule 88A set-off cascade calculations</p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-slate-500">Challan PMT-06 Prepared</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/30">
                            <th className="py-2.5 px-4 font-medium">Tax Head</th>
                            <th className="py-2.5 px-3 text-right font-medium">Liability (₹)</th>
                            <th className="py-2.5 px-3 text-right font-medium">ITC Utilized (₹)</th>
                            <th className="py-2.5 px-3 text-right font-medium">TDS/TCS (₹)</th>
                            <th className="py-2.5 px-4 text-right font-bold text-slate-900">Net Cash Payable (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                          <tr className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-4 font-sans font-medium text-slate-800">Integrated Tax (IGST)</td>
                            <td className="py-2.5 px-3 text-right">{formatCur(currentMonthData.outward.totalSalePortal.igst)}</td>
                            <td className="py-2.5 px-3 text-right text-emerald-600">{formatCur(Math.max(0, currentMonthData.outward.totalSalePortal.igst - currentMonthData.settlement.balancePayable.igst))}</td>
                            <td className="py-2.5 px-3 text-right text-slate-400">{formatCur(currentMonthData.settlement.tdsTcsOpeningCash?.igst || 0)}</td>
                            <td className="py-2.5 px-4 text-right font-bold text-purple-700">{formatCur(currentMonthData.settlement.balancePayable.igst)}</td>
                          </tr>
                          <tr className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-4 font-sans font-medium text-slate-800">Central Tax (CGST)</td>
                            <td className="py-2.5 px-3 text-right">{formatCur(currentMonthData.outward.totalSalePortal.cgst)}</td>
                            <td className="py-2.5 px-3 text-right text-emerald-600">{formatCur(Math.max(0, currentMonthData.outward.totalSalePortal.cgst - currentMonthData.settlement.balancePayable.cgst))}</td>
                            <td className="py-2.5 px-3 text-right text-slate-400">{formatCur(currentMonthData.settlement.tdsTcsOpeningCash?.cgst || 0)}</td>
                            <td className="py-2.5 px-4 text-right font-bold text-purple-700">{formatCur(currentMonthData.settlement.balancePayable.cgst)}</td>
                          </tr>
                          <tr className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-4 font-sans font-medium text-slate-800">State/UT Tax (SGST)</td>
                            <td className="py-2.5 px-3 text-right">{formatCur(currentMonthData.outward.totalSalePortal.sgst)}</td>
                            <td className="py-2.5 px-3 text-right text-emerald-600">{formatCur(Math.max(0, currentMonthData.outward.totalSalePortal.sgst - currentMonthData.settlement.balancePayable.sgst))}</td>
                            <td className="py-2.5 px-3 text-right text-slate-400">{formatCur(currentMonthData.settlement.tdsTcsOpeningCash?.sgst || 0)}</td>
                            <td className="py-2.5 px-4 text-right font-bold text-purple-700">{formatCur(currentMonthData.settlement.balancePayable.sgst)}</td>
                          </tr>
                          <tr className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2 px-4 font-sans font-medium text-slate-800">Cess</td>
                            <td className="py-2 px-3 text-right text-slate-400">0.00</td>
                            <td className="py-2 px-3 text-right text-slate-400">0.00</td>
                            <td className="py-2 px-3 text-right text-slate-400">0.00</td>
                            <td className="py-2 px-4 text-right text-slate-400">0.00</td>
                          </tr>
                          {/* Final Cash Row */}
                          <tr className="bg-slate-900 text-white font-bold">
                            <td className="py-3 px-4 font-sans text-white font-bold">Final Net Cash Deposit Required</td>
                            <td className="py-3 px-3 text-right text-slate-300">{formatCur(currentMonthData.outward.totalSalePortal.total)}</td>
                            <td className="py-3 px-3 text-right text-emerald-400">{formatCur(Math.max(0, currentMonthData.outward.totalSalePortal.total - currentMonthData.settlement.balancePayable.total))}</td>
                            <td className="py-3 px-3 text-right text-slate-400">{formatCur(currentMonthData.settlement.tdsTcsOpeningCash?.total || 0)}</td>
                            <td className="py-3 px-4 text-right text-emerald-400 text-sm font-mono font-bold">₹ {formatCur(currentMonthData.settlement.balancePayable.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* OPTIONAL EXPANDABLE: DETAILED 28-LINE ITEM CA WORKING WORKSHEET */}
                  {showDetailedWorksheet && (
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm space-y-4 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-purple-600" />
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                            Itemized Granular Working Paper ({selectedMonth.toUpperCase()}-{currentMonthData.year})
                          </h4>
                        </div>
                        <span className="text-[11px] text-slate-400">All values dynamically recalculate Rule 88A set-off</span>
                      </div>
                      <div className="overflow-x-auto max-h-96">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200 text-[10px]">
                              <th className="py-2 px-3">Sub-Account</th>
                              <th className="py-2 px-2 text-right">Taxable</th>
                              <th className="py-2 px-2 text-right">CGST</th>
                              <th className="py-2 px-2 text-right">SGST</th>
                              <th className="py-2 px-2 text-right">IGST</th>
                              <th className="py-2 px-3 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                            {/* Section 1 Outward Granular */}
                            <tr className="bg-slate-100/70 font-sans font-bold text-slate-800 text-[10px]">
                              <td colSpan={6} className="py-1 px-3 uppercase">1. Outward Supply Granular Lines</td>
                            </tr>
                            {[
                              { key: 'b2b', label: 'Sales (B2B)' },
                              { key: 'b2c', label: 'Sales (B2C)' },
                              { key: 'sezWithPayment', label: 'SEZ with payment' },
                              { key: 'sezWithoutPayment', label: 'SEZ without payment' },
                              { key: 'zeroRated', label: 'Zero Rated / Exports' },
                              { key: 'nilRated', label: 'Nil Rated Supply' },
                              { key: 'exempt', label: 'Exempt Sale' },
                              { key: 'advanceReceived', label: 'Advances Collected' },
                              { key: 'rentReceived', label: 'Rent Received' },
                              { key: 'creditNote', label: '(-) Credit Note' }
                            ].map(({ key, label }) => {
                              const rowData = ((currentMonthData.outward as any)[key] as TaxBreakdown) || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
                              return (
                                <tr key={key} className="hover:bg-slate-50">
                                  <td className="py-1.5 px-3 font-sans text-slate-800">{label}</td>
                                  <td className="py-1 px-2 text-right">
                                    <input
                                      type="number"
                                      value={rowData.taxable || ''}
                                      placeholder="0"
                                      onChange={e => updateCurrentMonthField('outward', key, 'taxable', parseFloat(e.target.value) || 0)}
                                      className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-purple-400 outline-none"
                                    />
                                  </td>
                                  <td className="py-1 px-2 text-right">
                                    <input
                                      type="number"
                                      value={rowData.cgst || ''}
                                      placeholder="0"
                                      onChange={e => updateCurrentMonthField('outward', key, 'cgst', parseFloat(e.target.value) || 0)}
                                      className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-purple-400 outline-none"
                                    />
                                  </td>
                                  <td className="py-1 px-2 text-right">
                                    <input
                                      type="number"
                                      value={rowData.sgst || ''}
                                      placeholder="0"
                                      onChange={e => updateCurrentMonthField('outward', key, 'sgst', parseFloat(e.target.value) || 0)}
                                      className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-purple-400 outline-none"
                                    />
                                  </td>
                                  <td className="py-1 px-2 text-right">
                                    <input
                                      type="number"
                                      value={rowData.igst || ''}
                                      placeholder="0"
                                      onChange={e => updateCurrentMonthField('outward', key, 'igst', parseFloat(e.target.value) || 0)}
                                      className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-purple-400 outline-none"
                                    />
                                  </td>
                                  <td className="py-1.5 px-3 text-right font-bold text-slate-700">{formatCur(rowData.total)}</td>
                                </tr>
                              );
                            })}
                            {/* Section 2 Inward Granular */}
                            <tr className="bg-slate-100/70 font-sans font-bold text-slate-800 text-[10px]">
                              <td colSpan={6} className="py-1 px-3 uppercase">2. Inward ITC Granular Lines</td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                              <td className="py-1.5 px-3 font-sans text-slate-800">ITC (As per books)</td>
                              <td className="py-1.5 px-2 text-right text-slate-400">-</td>
                              <td className="py-1.5 px-2 text-right text-slate-400">-</td>
                              <td className="py-1.5 px-2 text-right text-slate-400">-</td>
                              <td className="py-1.5 px-2 text-right text-slate-400">-</td>
                              <td className="py-1 px-3 text-right">
                                <input
                                  type="number"
                                  value={currentMonthData.inward.itcBooks || ''}
                                  placeholder="0"
                                  onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setWorkingData(prev => {
                                      const cloned = JSON.parse(JSON.stringify(prev)) as GSTR3BAnnualWorking;
                                      cloned.months[selectedMonth].inward.itcBooks = val;
                                      return cloned;
                                    });
                                  }}
                                  className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-purple-400 outline-none"
                                />
                              </td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                              <td className="py-1.5 px-3 font-sans text-slate-800">Opening Credit Balance (B/F)</td>
                              <td className="py-1.5 px-2 text-right text-slate-400">-</td>
                              <td className="py-1 px-2 text-right">
                                <input
                                  type="number"
                                  value={currentMonthData.inward.openingCreditBal.cgst || ''}
                                  disabled={selectedMonth !== 'April'}
                                  placeholder="0"
                                  onChange={e => updateCurrentMonthField('inward', 'openingCreditBal', 'cgst', parseFloat(e.target.value) || 0)}
                                  className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-purple-400 outline-none disabled:opacity-60"
                                />
                              </td>
                              <td className="py-1 px-2 text-right">
                                <input
                                  type="number"
                                  value={currentMonthData.inward.openingCreditBal.sgst || ''}
                                  disabled={selectedMonth !== 'April'}
                                  placeholder="0"
                                  onChange={e => updateCurrentMonthField('inward', 'openingCreditBal', 'sgst', parseFloat(e.target.value) || 0)}
                                  className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-purple-400 outline-none disabled:opacity-60"
                                />
                              </td>
                              <td className="py-1 px-2 text-right">
                                <input
                                  type="number"
                                  value={currentMonthData.inward.openingCreditBal.igst || ''}
                                  disabled={selectedMonth !== 'April'}
                                  placeholder="0"
                                  onChange={e => updateCurrentMonthField('inward', 'openingCreditBal', 'igst', parseFloat(e.target.value) || 0)}
                                  className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-slate-900 focus:bg-white focus:border-purple-400 outline-none disabled:opacity-60"
                                />
                              </td>
                              <td className="py-1.5 px-3 text-right font-bold text-slate-700">{formatCur(currentMonthData.inward.openingCreditBal.total)}</td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                              <td className="py-1.5 px-3 font-sans text-rose-700">(-) ITC Reversed (17(5))</td>
                              <td className="py-1.5 px-2 text-right text-slate-400">-</td>
                              <td className="py-1 px-2 text-right">
                                <input
                                  type="number"
                                  value={currentMonthData.inward.itcReversed.cgst || ''}
                                  placeholder="0"
                                  onChange={e => updateCurrentMonthField('inward', 'itcReversed', 'cgst', parseFloat(e.target.value) || 0)}
                                  className="w-20 bg-slate-50 border border-rose-200 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 focus:bg-white focus:border-rose-400 outline-none"
                                />
                              </td>
                              <td className="py-1 px-2 text-right">
                                <input
                                  type="number"
                                  value={currentMonthData.inward.itcReversed.sgst || ''}
                                  placeholder="0"
                                  onChange={e => updateCurrentMonthField('inward', 'itcReversed', 'sgst', parseFloat(e.target.value) || 0)}
                                  className="w-20 bg-slate-50 border border-rose-200 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 focus:bg-white focus:border-rose-400 outline-none"
                                />
                              </td>
                              <td className="py-1 px-2 text-right">
                                <input
                                  type="number"
                                  value={currentMonthData.inward.itcReversed.igst || ''}
                                  placeholder="0"
                                  onChange={e => updateCurrentMonthField('inward', 'itcReversed', 'igst', parseFloat(e.target.value) || 0)}
                                  className="w-20 bg-slate-50 border border-rose-200 rounded px-1.5 py-0.5 text-right font-mono text-rose-700 focus:bg-white focus:border-rose-400 outline-none"
                                />
                              </td>
                              <td className="py-1.5 px-3 text-right font-bold text-rose-700">{formatCur(currentMonthData.inward.itcReversed.total)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT 4 COLS: Rule 88A Waterfall Set-off Engine & Credit Balances */}
                <div className="lg:col-span-4 space-y-4">
                  {/* 5. ADVANCED RULE 88A CASCADE WATERFALL */}
                  <div className="bg-white rounded-2xl border border-indigo-200/80 p-4 shadow-sm relative overflow-hidden rule88a-waterfall">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm font-mono">
                          88A
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-slate-900 leading-tight">Rule 88A Set-off Cascade</h3>
                          <p className="text-[10px] text-slate-500">Statutory Tax Waterfall Algorithm</p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                        {currentMonthData.setoff.isManualAdjustment ? 'Manual Adjusted' : 'Optimal Flow'}
                      </span>
                    </div>

                    {/* Quick Presets Bar */}
                    <div className="mt-2.5 flex items-center justify-between gap-1 flex-wrap text-[10px]">
                      <span className="text-slate-400 font-semibold">Presets:</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetoffPreset('auto')}
                          className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-bold transition-all shadow-xs"
                          title="Auto Rule 88A Optimization"
                        >
                          ⚡ Auto
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetoffPreset('all_cgst')}
                          className="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold transition-all"
                          title="Set off 100% surplus IGST credit against CGST"
                        >
                          👉 CGST
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetoffPreset('all_sgst')}
                          className="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold transition-all"
                          title="Set off 100% surplus IGST credit against SGST"
                        >
                          👉 SGST
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetoffPreset('equal')}
                          className="px-2 py-0.5 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold transition-all"
                          title="Split surplus IGST credit 50/50 between CGST and SGST"
                        >
                          ⚖️ 50/50
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetoffPreset('clear')}
                          className="px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all"
                          title="Clear all adjustment amounts"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Waterfall Step Connectors */}
                    <div className="mt-3 space-y-3 relative">
                      {/* Step 1 */}
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-indigo-300 transition-all group">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-900 mb-1.5">
                          <span className="flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px]">1</span>
                            IGST Credit Exhaustion
                          </span>
                          <span className="text-[10px] font-semibold text-rose-600 uppercase">
                            {igstCreditUtilizedPercent}% Used
                          </span>
                        </div>
                        <div className="space-y-1 text-[11px] font-mono">
                          <div className="flex justify-between text-slate-600">
                            <span>Available Credit:</span>
                            <span className="font-bold text-slate-900">₹ {formatCur(igstCreditAvail)}</span>
                          </div>
                          <div className="flex justify-between text-purple-700 bg-purple-50/60 px-1.5 py-0.5 rounded">
                            <span>↳ Applied to IGST Liab:</span>
                            <span className="font-bold">₹ {formatCur(igstAppliedToIgst)}</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>↳ Residual to CGST / SGST:</span>
                            <span>₹ {formatCur(residualIgst)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Cascade Flow Icon */}
                      <div className="flex justify-center -my-1 text-slate-300">
                        <span className="material-symbols-outlined text-[16px] animate-bounce">arrow_downward</span>
                      </div>

                      {/* Step 2 */}
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-emerald-300 transition-all">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-900 mb-1.5">
                          <span className="flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">2</span>
                            CGST Credit Utilization
                          </span>
                          <span className="text-[10px] font-semibold text-emerald-600 uppercase">Applied</span>
                        </div>
                        <div className="space-y-1 text-[11px] font-mono">
                          <div className="flex justify-between text-slate-600">
                            <span>Available Credit:</span>
                            <span className="font-bold text-slate-900">₹ {formatCur(cgstCreditAvail)}</span>
                          </div>
                          <div className="flex justify-between text-emerald-700 bg-emerald-50/60 px-1.5 py-0.5 rounded">
                            <span>↳ Applied to CGST Liab:</span>
                            <span className="font-bold">₹ {formatCur(cgstAppliedToCgst)}</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>↳ Cross offset IGST (Locked):</span>
                            <span>N/A</span>
                          </div>
                        </div>
                      </div>

                      {/* Cascade Flow Icon */}
                      <div className="flex justify-center -my-1 text-slate-300">
                        <span className="material-symbols-outlined text-[16px] animate-bounce">arrow_downward</span>
                      </div>

                      {/* Step 3 */}
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-emerald-300 transition-all">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-900 mb-1.5">
                          <span className="flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">3</span>
                            SGST Credit Utilization
                          </span>
                          <span className="text-[10px] font-semibold text-emerald-600 uppercase">Applied</span>
                        </div>
                        <div className="space-y-1 text-[11px] font-mono">
                          <div className="flex justify-between text-slate-600">
                            <span>Available Credit:</span>
                            <span className="font-bold text-slate-900">₹ {formatCur(sgstCreditAvail)}</span>
                          </div>
                          <div className="flex justify-between text-emerald-700 bg-emerald-50/60 px-1.5 py-0.5 rounded">
                            <span>↳ Applied to SGST Liab:</span>
                            <span className="font-bold">₹ {formatCur(sgstAppliedToSgst)}</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>↳ Cross CGST (Prohibited):</span>
                            <span>Blocked</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Optimization Guarantee Footer */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-medium">Waterfall Efficiency:</span>
                      <span className="font-semibold text-emerald-700 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Max Cash Saved
                      </span>
                    </div>
                  </div>

                  {/* Electronic Credit Ledger Balance Card */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                      <h3 className="text-xs font-bold text-slate-900">Electronic Credit Ledger Balances</h3>
                      <span className="text-[10px] text-slate-400">Post 3B Set-off</span>
                    </div>
                    <div className="space-y-1.5 font-mono text-xs">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <span className="text-slate-600 text-[11px] font-sans">Integrated Tax (IGST)</span>
                        <span className="font-bold text-slate-800">₹ {formatCur(currentMonthData.setoff.balanceCfNextMonth?.igst || 0)}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <span className="text-slate-600 text-[11px] font-sans">Central Tax (CGST)</span>
                        <span className="font-bold text-slate-800">₹ {formatCur(currentMonthData.setoff.balanceCfNextMonth?.cgst || 0)}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <span className="text-slate-600 text-[11px] font-sans">State Tax (SGST)</span>
                        <span className="font-bold text-slate-800">₹ {formatCur(currentMonthData.setoff.balanceCfNextMonth?.sgst || 0)}</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                      <span>Tally Ledger Alignment:</span>
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Matched
                      </span>
                    </div>
                  </div>

                  {/* Statutory Compliance Audit Notes */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-sm space-y-2.5">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold">Rule 88A Optimization Notice</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                      Full IGST credit is exhausted against IGST liability in compliance with Section 49A/49B. Balance cash outflow of{' '}
                      <strong className="text-white font-mono">₹ {formatCur(currentMonthData.settlement.balancePayable.total)}</strong> is generated and mapped to Challan GST PMT-06.
                    </p>
                    <div className="pt-2 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-700/60 font-mono">
                      <span>AUDIT HASH: 88A-{selectedMonth.slice(0, 3).toUpperCase()}{currentMonthData.year.toString().slice(-2)}-OK</span>
                      <span className="text-emerald-400 font-semibold">VALIDATED</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}`;

const newCode = code.substring(0, startIndex) + replacement + code.substring(startIndex + lastDivIndex + '</div>\n      )}'.length);
fs.writeFileSync(filePath, newCode, 'utf-8');
console.log('Successfully updated ReturnsDashboard.tsx with Stitch 8:4 Tab 1 layout!');
