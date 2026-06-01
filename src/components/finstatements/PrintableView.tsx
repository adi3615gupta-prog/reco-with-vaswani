import { useMemo } from 'react';
import {
  getClientSetup,
  aggregateNotes,
} from '@/lib/finStatements.storage';

const INR = (v: number) => {
  if (v === 0) return '-';
  const formatted = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return v < 0 ? `(${formatted})` : formatted;
};

export default function PrintableView() {
  const client = getClientSetup();
  const rawNotes = useMemo(() => aggregateNotes(true), []);

  const noteDisplayMap = useMemo(() => {
    const map = new Map<number, number>();
    let counter = 1;
    for (const n of rawNotes) {
      map.set(n.note_reference, counter++);
    }
    return map;
  }, [rawNotes]);

  const getNote = (staticRef: number) => {
    const note = rawNotes.find(n => n.note_reference === staticRef);
    if (!note) return { cy: 0, py: 0, displayNum: '' };
    return {
      cy: note.cy_grand_total,
      py: note.py_grand_total,
      displayNum: noteDisplayMap.get(staticRef)?.toString() || ''
    };
  };

  // Helper variables for BS & P&L (similar to FinancialReports)
  const sc = getNote(18); const res = getNote(19); const ltb = getNote(21); const dtl = getNote(22);
  const oncl = getNote(23); const ncp = getNote(24); const stb = getNote(25); const tp = getNote(26);
  const ocl = getNote(28); const ocfl = getNote(27); const cp = getNote(29);

  const eq = sc.cy + res.cy; const eqPy = sc.py + res.py;
  const ncl = ltb.cy + dtl.cy + oncl.cy + ncp.cy; const nclPy = ltb.py + dtl.py + oncl.py + ncp.py;
  const cl = stb.cy + tp.cy + ocl.cy + ocfl.cy + cp.cy; const clPy = stb.py + tp.py + ocl.py + ocfl.py + cp.py;
  const totEqLiab = eq + ncl + cl; const totEqLiabPy = eqPy + nclPy + clPy;

  const ppe = getNote(1); const intg = getNote(2); const cwip = getNote(3); const intgwip = getNote(4);
  const nci = getNote(5); const ltla = getNote(6); const onca = getNote(9); const onca2 = getNote(7); const dta = getNote(8);
  const inv = getNote(10); const tr = getNote(11); const cce = getNote(12); const stla = getNote(14);
  const oca = getNote(17); const oca2 = getNote(15); const cta = getNote(16); const oca3 = getNote(13);

  const nca = ppe.cy + intg.cy + cwip.cy + intgwip.cy + nci.cy + ltla.cy + onca.cy + onca2.cy + dta.cy;
  const ncaPy = ppe.py + intg.py + cwip.py + intgwip.py + nci.py + ltla.py + onca.py + onca2.py + dta.py;
  const ca = inv.cy + tr.cy + cce.cy + stla.cy + oca.cy + oca2.cy + cta.cy + oca3.cy;
  const caPy = inv.py + tr.py + cce.py + stla.py + oca.py + oca2.py + cta.py + oca3.py;
  const totAssets = nca + ca; const totAssetsPy = ncaPy + caPy;

  const rev = getNote(30); const oinc = getNote(31);
  const totInc = rev.cy + oinc.cy; const totIncPy = rev.py + oinc.py;
  
  const cmc = getNote(32); const pst = getNote(33); const cinv = getNote(34);
  const emp = getNote(35); const fin = getNote(36); const dep = getNote(37); const oex = getNote(38);
  const totExp = cmc.cy + pst.cy + cinv.cy + emp.cy + fin.cy + dep.cy + oex.cy;
  const totExpPy = cmc.py + pst.py + cinv.py + emp.py + fin.py + dep.py + oex.py;
  
  const pbt = totInc - totExp; const pbtPy = totIncPy - totExpPy;
  const tax = getNote(39);
  const pat = pbt - tax.cy; const patPy = pbtPy - tax.py;

  return (
    // This div sits on top of everything when printing and forces standard a4 styling
    <div className="fixed inset-0 z-[9999] bg-white text-black font-sans hidden print:block overflow-visible print:absolute print:w-full">
      <style>{`
        @page { size: A4 portrait; margin: 15mm; }
        @media print {
          body { background: white !important; margin: 0; padding: 0; -webkit-print-color-adjust: exact; }
          /* Hide the main app wrapper completely during print */
          #root > *:not(.print\\:block) { display: none !important; }
          .page-break { page-break-before: always; }
          .no-break { page-break-inside: avoid; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #000; padding: 4px 6px; font-size: 11px; }
          th { font-weight: bold; text-align: center; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .font-bold { font-weight: bold; }
          .header-title { font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 5px; text-transform: uppercase; }
          .sub-title { font-size: 12px; text-align: center; margin-bottom: 20px; text-transform: uppercase; }
          
          /* Signatory layout */
          .sign-box { display: flex; justify-content: space-between; margin-top: 60px; font-size: 11px; }
          .sign-col { width: 45%; }
        }
      `}</style>

      {/* --- BALANCE SHEET --- */}
      <div className="print-section">
        <div className="header-title">{client.company_name || 'COMPANY NAME'}</div>
        <div className="sub-title">Balance Sheet as at 31st March</div>

        <table>
          <thead>
            <tr>
              <th style={{ width: '60%' }}>Particulars</th>
              <th style={{ width: '10%' }}>Note No.</th>
              <th style={{ width: '15%' }}>Current Year (₹)</th>
              <th style={{ width: '15%' }}>Previous Year (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={4} className="font-bold">I. EQUITY AND LIABILITIES</td></tr>
            <tr><td colSpan={4} className="font-bold" style={{ paddingLeft: '15px' }}>1. Shareholders' funds</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(a) Share capital</td><td className="text-center">{sc.displayNum}</td><td className="text-right">{INR(sc.cy)}</td><td className="text-right">{INR(sc.py)}</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(b) Reserves and surplus</td><td className="text-center">{res.displayNum}</td><td className="text-right">{INR(res.cy)}</td><td className="text-right">{INR(res.py)}</td></tr>
            
            <tr><td colSpan={4} className="font-bold" style={{ paddingLeft: '15px' }}>2. Non-current liabilities</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(a) Long-term borrowings</td><td className="text-center">{ltb.displayNum}</td><td className="text-right">{INR(ltb.cy)}</td><td className="text-right">{INR(ltb.py)}</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(b) Deferred tax liabilities (Net)</td><td className="text-center">{dtl.displayNum}</td><td className="text-right">{INR(dtl.cy)}</td><td className="text-right">{INR(dtl.py)}</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(c) Long-term provisions</td><td className="text-center">{ncp.displayNum}</td><td className="text-right">{INR(ncp.cy)}</td><td className="text-right">{INR(ncp.py)}</td></tr>
            
            <tr><td colSpan={4} className="font-bold" style={{ paddingLeft: '15px' }}>3. Current liabilities</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(a) Short-term borrowings</td><td className="text-center">{stb.displayNum}</td><td className="text-right">{INR(stb.cy)}</td><td className="text-right">{INR(stb.py)}</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(b) Trade payables</td><td className="text-center">{tp.displayNum}</td><td className="text-right">{INR(tp.cy)}</td><td className="text-right">{INR(tp.py)}</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(c) Other current liabilities</td><td className="text-center">{ocl.displayNum}</td><td className="text-right">{INR(ocl.cy + ocfl.cy)}</td><td className="text-right">{INR(ocl.py + ocfl.py)}</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(d) Short-term provisions</td><td className="text-center">{cp.displayNum}</td><td className="text-right">{INR(cp.cy)}</td><td className="text-right">{INR(cp.py)}</td></tr>
            
            <tr><td colSpan={2} className="font-bold text-right">TOTAL EQUITY AND LIABILITIES</td><td className="font-bold text-right">{INR(totEqLiab)}</td><td className="font-bold text-right">{INR(totEqLiabPy)}</td></tr>

            <tr><td colSpan={4} style={{ border: 'none', height: '10px' }}></td></tr>
            
            <tr><td colSpan={4} className="font-bold">II. ASSETS</td></tr>
            <tr><td colSpan={4} className="font-bold" style={{ paddingLeft: '15px' }}>1. Non-current assets</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(a) Property, Plant and Equipment</td><td className="text-center">{ppe.displayNum}</td><td className="text-right">{INR(ppe.cy)}</td><td className="text-right">{INR(ppe.py)}</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(b) Intangible assets</td><td className="text-center">{intg.displayNum}</td><td className="text-right">{INR(intg.cy)}</td><td className="text-right">{INR(intg.py)}</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(c) Capital work-in-progress</td><td className="text-center">{cwip.displayNum}</td><td className="text-right">{INR(cwip.cy)}</td><td className="text-right">{INR(cwip.py)}</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(d) Non-current investments</td><td className="text-center">{nci.displayNum}</td><td className="text-right">{INR(nci.cy)}</td><td className="text-right">{INR(nci.py)}</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(e) Long-term loans and advances</td><td className="text-center">{ltla.displayNum}</td><td className="text-right">{INR(ltla.cy)}</td><td className="text-right">{INR(ltla.py)}</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(f) Other non-current assets</td><td className="text-center">{onca.displayNum}</td><td className="text-right">{INR(onca.cy + onca2.cy)}</td><td className="text-right">{INR(onca.py + onca2.py)}</td></tr>

            <tr><td colSpan={4} className="font-bold" style={{ paddingLeft: '15px' }}>2. Current assets</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(a) Inventories</td><td className="text-center">{inv.displayNum}</td><td className="text-right">{INR(inv.cy)}</td><td className="text-right">{INR(inv.py)}</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(b) Trade receivables</td><td className="text-center">{tr.displayNum}</td><td className="text-right">{INR(tr.cy)}</td><td className="text-right">{INR(tr.py)}</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(c) Cash and cash equivalents</td><td className="text-center">{cce.displayNum}</td><td className="text-right">{INR(cce.cy)}</td><td className="text-right">{INR(cce.py)}</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(d) Short-term loans and advances</td><td className="text-center">{stla.displayNum}</td><td className="text-right">{INR(stla.cy)}</td><td className="text-right">{INR(stla.py)}</td></tr>
            <tr><td style={{ paddingLeft: '30px' }}>(e) Other current assets</td><td className="text-center">{oca.displayNum}</td><td className="text-right">{INR(oca.cy + oca2.cy + cta.cy + oca3.cy)}</td><td className="text-right">{INR(oca.py + oca2.py + cta.py + oca3.py)}</td></tr>
            
            <tr><td colSpan={2} className="font-bold text-right">TOTAL ASSETS</td><td className="font-bold text-right">{INR(totAssets)}</td><td className="font-bold text-right">{INR(totAssetsPy)}</td></tr>
          </tbody>
        </table>

        {/* Signatures */}
        <div className="sign-box no-break">
          <div className="sign-col">
            <p>As per our report of even date</p>
            <br/><br/>
            <p className="font-bold">For {client.audit_firm_name || 'Auditor Firm Name'}</p>
            <p>Chartered Accountants</p>
            <p>FRN: {client.firm_reg_no || '______'}</p>
            <br/><br/>
            <p className="font-bold">{client.partner_name || 'Partner Name'}</p>
            <p>Partner</p>
            <p>M.No: {client.membership_no || '______'}</p>
            <p>UDIN: {client.udin || '______'}</p>
          </div>
          <div className="sign-col">
            <p>For and on behalf of the Board of Directors</p>
            <p className="font-bold">For {client.company_name || 'Company Name'}</p>
            <br/><br/><br/><br/>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <p className="font-bold">{client.director_1_name || 'Director 1'}</p>
                <p>Director</p>
              </div>
              <div>
                <p className="font-bold">{client.director_2_name || 'Director 2'}</p>
                <p>Director</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="page-break"></div>

      {/* --- PROFIT & LOSS --- */}
      <div className="print-section">
        <div className="header-title">{client.company_name || 'COMPANY NAME'}</div>
        <div className="sub-title">Statement of Profit & Loss for the year ended 31st March</div>

        <table>
          <thead>
            <tr>
              <th style={{ width: '60%' }}>Particulars</th>
              <th style={{ width: '10%' }}>Note No.</th>
              <th style={{ width: '15%' }}>Current Year (₹)</th>
              <th style={{ width: '15%' }}>Previous Year (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="font-bold">I. Revenue from operations</td><td className="text-center">{rev.displayNum}</td><td className="text-right">{INR(rev.cy)}</td><td className="text-right">{INR(rev.py)}</td></tr>
            <tr><td className="font-bold">II. Other income</td><td className="text-center">{oinc.displayNum}</td><td className="text-right">{INR(oinc.cy)}</td><td className="text-right">{INR(oinc.py)}</td></tr>
            <tr><td colSpan={2} className="font-bold text-right">III. Total Revenue (I + II)</td><td className="font-bold text-right">{INR(totInc)}</td><td className="font-bold text-right">{INR(totIncPy)}</td></tr>

            <tr><td colSpan={4} style={{ border: 'none', height: '10px' }}></td></tr>
            
            <tr><td colSpan={4} className="font-bold">IV. Expenses:</td></tr>
            <tr><td style={{ paddingLeft: '15px' }}>Cost of materials consumed</td><td className="text-center">{cmc.displayNum}</td><td className="text-right">{INR(cmc.cy)}</td><td className="text-right">{INR(cmc.py)}</td></tr>
            <tr><td style={{ paddingLeft: '15px' }}>Purchases of Stock-in-Trade</td><td className="text-center">{pst.displayNum}</td><td className="text-right">{INR(pst.cy)}</td><td className="text-right">{INR(pst.py)}</td></tr>
            <tr><td style={{ paddingLeft: '15px' }}>Changes in inventories</td><td className="text-center">{cinv.displayNum}</td><td className="text-right">{INR(cinv.cy)}</td><td className="text-right">{INR(cinv.py)}</td></tr>
            <tr><td style={{ paddingLeft: '15px' }}>Employee benefits expense</td><td className="text-center">{emp.displayNum}</td><td className="text-right">{INR(emp.cy)}</td><td className="text-right">{INR(emp.py)}</td></tr>
            <tr><td style={{ paddingLeft: '15px' }}>Finance costs</td><td className="text-center">{fin.displayNum}</td><td className="text-right">{INR(fin.cy)}</td><td className="text-right">{INR(fin.py)}</td></tr>
            <tr><td style={{ paddingLeft: '15px' }}>Depreciation and amortization expense</td><td className="text-center">{dep.displayNum}</td><td className="text-right">{INR(dep.cy)}</td><td className="text-right">{INR(dep.py)}</td></tr>
            <tr><td style={{ paddingLeft: '15px' }}>Other expenses</td><td className="text-center">{oex.displayNum}</td><td className="text-right">{INR(oex.cy)}</td><td className="text-right">{INR(oex.py)}</td></tr>
            
            <tr><td colSpan={2} className="font-bold text-right">Total expenses</td><td className="font-bold text-right">{INR(totExp)}</td><td className="font-bold text-right">{INR(totExpPy)}</td></tr>
            
            <tr><td colSpan={4} style={{ border: 'none', height: '10px' }}></td></tr>
            <tr><td colSpan={2} className="font-bold text-right">V. Profit before tax (III - IV)</td><td className="font-bold text-right">{INR(pbt)}</td><td className="font-bold text-right">{INR(pbtPy)}</td></tr>
            
            <tr><td colSpan={4} style={{ border: 'none', height: '10px' }}></td></tr>
            <tr><td colSpan={4} className="font-bold">VI. Tax expense:</td></tr>
            <tr><td style={{ paddingLeft: '15px' }}>(1) Current tax</td><td className="text-center">{tax.displayNum}</td><td className="text-right">{INR(tax.cy)}</td><td className="text-right">{INR(tax.py)}</td></tr>
            
            <tr><td colSpan={4} style={{ border: 'none', height: '10px' }}></td></tr>
            <tr><td colSpan={2} className="font-bold text-right">VII. Profit for the period (V - VI)</td><td className="font-bold text-right">{INR(pat)}</td><td className="font-bold text-right">{INR(patPy)}</td></tr>
          </tbody>
        </table>

        {/* Signatures */}
        <div className="sign-box no-break">
          <div className="sign-col">
            <p>As per our report of even date</p>
            <br/><br/>
            <p className="font-bold">For {client.audit_firm_name || 'Auditor Firm Name'}</p>
            <p>Chartered Accountants</p>
            <p>FRN: {client.firm_reg_no || '______'}</p>
            <br/><br/>
            <p className="font-bold">{client.partner_name || 'Partner Name'}</p>
            <p>Partner</p>
            <p>M.No: {client.membership_no || '______'}</p>
            <p>UDIN: {client.udin || '______'}</p>
          </div>
          <div className="sign-col">
            <p>For and on behalf of the Board of Directors</p>
            <p className="font-bold">For {client.company_name || 'Company Name'}</p>
            <br/><br/><br/><br/>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <p className="font-bold">{client.director_1_name || 'Director 1'}</p>
                <p>Director</p>
              </div>
              <div>
                <p className="font-bold">{client.director_2_name || 'Director 2'}</p>
                <p>Director</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {rawNotes.length > 0 && <div className="page-break"></div>}

      {/* --- NOTES TO ACCOUNTS --- */}
      {rawNotes.length > 0 && (
        <div className="print-section">
          <div className="header-title">{client.company_name || 'COMPANY NAME'}</div>
          <div className="sub-title">Notes forming part of the financial statements</div>

          {rawNotes.map((note) => (
            <div key={note.note_reference} className="no-break" style={{ marginBottom: '30px' }}>
              <div className="font-bold" style={{ fontSize: '13px', marginBottom: '5px' }}>
                Note {noteDisplayMap.get(note.note_reference)}: {note.note_title}
              </div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '60%' }}>Particulars</th>
                    <th style={{ width: '20%' }}>Current Year (₹)</th>
                    <th style={{ width: '20%' }}>Previous Year (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {note.line_items.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.particulars}</td>
                      <td className="text-right">{INR(item.cy_total)}</td>
                      <td className="text-right">{INR(item.py_total)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="font-bold text-right">Total</td>
                    <td className="font-bold text-right">{INR(note.cy_grand_total)}</td>
                    <td className="font-bold text-right">{INR(note.py_grand_total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
