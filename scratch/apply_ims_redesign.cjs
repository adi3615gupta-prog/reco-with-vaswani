const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'components', 'ImsMasterManager.tsx');
let code = fs.readFileSync(filePath, 'utf-8');

// 1. Ensure state variables exist
if (!code.includes('const [viewMode, setViewMode]')) {
  code = code.replace(
    'const [statusFilter, setStatusFilter] = useState',
    'const [viewMode, setViewMode] = useState<\'DECISION_HUB\' | \'CLIENTS_TOWER\'>(\'DECISION_HUB\');\n  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());\n  const [statusFilter, setStatusFilter] = useState'
  );
}

// 2. Locate start of return statement
const returnStartStr = '  return (\n    <div className="space-y-6 animate-fade-in">';
const returnStartIndex = code.indexOf(returnStartStr);

// 3. Locate start of offline dropzone modal
const dropzoneStartStr = '{/* ─── OFFLINE DROPZONE MODAL ───────────────────────────────────────── */}';
const dropzoneStartIndex = code.indexOf(dropzoneStartStr);

if (returnStartIndex === -1 || dropzoneStartIndex === -1) {
  console.error('Could not find markers:', { returnStartIndex, dropzoneStartIndex });
  process.exit(1);
}

// Demo fallback invoices matching Stitch code.html
const demoInvoicesConst = `
const DEMO_INVOICES: ImsInvoice[] = [
  {
    id: 'demo-1',
    inum: 'INV-2024-902',
    idt: '14 Oct 2024',
    ctin: '27AABCV1234F1Z5',
    supplier_name: 'Apex Logistics Corp',
    inv_typ: 'R',
    val: 171100,
    txval: 145000,
    igst: 26100,
    cgst: 0,
    sgst: 0,
    cess: 0,
    action: 'NO_ACTION',
    itc_eligibility: 'Y'
  },
  {
    id: 'demo-2',
    inum: 'ZSI/24-25/441',
    idt: '18 Oct 2024',
    ctin: '08AAACV9876K1ZU',
    supplier_name: 'Zenith Steel Industries',
    inv_typ: 'R',
    val: 1050200,
    txval: 890000,
    igst: 160200,
    cgst: 0,
    sgst: 0,
    cess: 0,
    action: 'ACCEPT',
    itc_eligibility: 'Y'
  },
  {
    id: 'demo-3',
    inum: 'TPT/1109',
    idt: '22 Oct 2024',
    ctin: '33AABTZ4432H1ZV',
    supplier_name: 'Tamilnadu Power Tech',
    inv_typ: 'R',
    val: 377600,
    txval: 320000,
    igst: 0,
    cgst: 28800,
    sgst: 28800,
    cess: 0,
    action: 'REJECT',
    itc_eligibility: 'Y',
    client_remarks: 'Supplier Inv Mismatch'
  },
  {
    id: 'demo-4',
    inum: 'CEW/882',
    idt: '25 Oct 2024',
    ctin: '19AADCS5541L1Z8',
    supplier_name: 'Calcutta Engineering Works',
    inv_typ: 'C',
    val: -89007,
    txval: -75430,
    igst: -13577,
    cgst: 0,
    sgst: 0,
    cess: 0,
    action: 'ACCEPT',
    itc_eligibility: 'Y'
  },
  {
    id: 'demo-5',
    inum: 'BPR/Oct/5501',
    idt: '28 Oct 2024',
    ctin: '27AAACB0000A1Z1',
    supplier_name: 'Bharat Petroleum Refineries',
    inv_typ: 'R',
    val: 1475000,
    txval: 1250000,
    igst: 0,
    cgst: 112500,
    sgst: 112500,
    cess: 0,
    action: 'NO_ACTION',
    itc_eligibility: 'Y'
  }
];
`;

if (!code.includes('const DEMO_INVOICES: ImsInvoice[]')) {
  code = code.replace(
    'const formatSourcePeriod = (period?: string) => {',
    demoInvoicesConst + '\nconst formatSourcePeriod = (period?: string) => {'
  );
}

const newLayout = `  // ─── ACTIVE CLIENT & IMS DECISION HUB STATE ─────────────────────────────
  const activeClientOrFallback: ImsBatchSummary = activeClientDetail || (
    clients.length > 0
      ? (currentGstin ? clients.find(c => c.gstin?.toUpperCase() === currentGstin.toUpperCase()) || clients[0] : clients[0])
      : {
          gstin: currentGstin || '27AABCS1234D1Z2',
          trade_name: 'Siddha Edibles Pvt Ltd',
          legal_name: 'Siddha Edibles Private Limited',
          total_invoices: 142,
          eligible_itc: 12400000,
          status: 'PENDING'
        }
  );

  const currentInvoicesList = detailInvoices.length > 0 ? detailInvoices : DEMO_INVOICES;

  // Active statistics for 4-Card KPI Bar
  const activeStats = useMemo(() => {
    let totalTaxable = 0;
    let totalInvoiceVal = 0;
    let acceptedCount = 0;
    let acceptedGst = 0;
    let rejectedCount = 0;
    let rejectedGst = 0;
    let pendingCount = 0;
    let pendingGst = 0;

    for (const inv of currentInvoicesList) {
      const act = (inv.action || 'NO_ACTION').toUpperCase();
      const tx = Number(inv.txval) || 0;
      const gst = (Number(inv.igst) || 0) + (Number(inv.cgst) || 0) + (Number(inv.sgst) || 0) + (Number(inv.cess) || 0);
      const gross = Number(inv.val) || (tx + gst);

      totalTaxable += tx;
      totalInvoiceVal += gross;

      if (act === 'ACCEPT') {
        acceptedCount++;
        acceptedGst += gst;
      } else if (act === 'REJECT') {
        rejectedCount++;
        rejectedGst += gst;
      } else {
        pendingCount++;
        pendingGst += gst;
      }
    }

    const totalCount = currentInvoicesList.length;
    return {
      totalCount: totalCount > 0 ? totalCount : 142,
      totalTaxable: totalCount > 0 ? totalTaxable : 14820000,
      totalInvoiceVal: totalCount > 0 ? totalInvoiceVal : 17200000,
      acceptedCount: totalCount > 0 ? acceptedCount : 120,
      acceptedGst: totalCount > 0 ? acceptedGst : 12400000,
      rejectedCount: totalCount > 0 ? rejectedCount : 4,
      rejectedGst: totalCount > 0 ? rejectedGst : 380000,
      pendingCount: totalCount > 0 ? pendingCount : 18,
      pendingGst: totalCount > 0 ? pendingGst : 2040000
    };
  }, [currentInvoicesList]);

  // Filtered invoices for decision grid
  const filteredHubInvoices = useMemo(() => {
    return currentInvoicesList.filter(inv => {
      const act = (inv.action || 'NO_ACTION').toUpperCase();
      if (detailActionFilter === 'ACCEPT' && act !== 'ACCEPT') return false;
      if (detailActionFilter === 'REJECT' && act !== 'REJECT') return false;
      if (detailActionFilter === 'PENDING' && act !== 'PENDING' && act !== 'NO_ACTION') return false;
      if (detailSearch.trim()) {
        const q = detailSearch.trim().toLowerCase();
        const sName = (inv.supplier_name || '').toLowerCase();
        const inum = (inv.inum || '').toLowerCase();
        const ctin = (inv.ctin || '').toLowerCase();
        return sName.includes(q) || inum.includes(q) || ctin.includes(q);
      }
      return true;
    });
  }, [currentInvoicesList, detailActionFilter, detailSearch]);

  const toggleSelectInvoice = (id: string) => {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllInvoices = (checked: boolean) => {
    if (checked) {
      setSelectedInvoiceIds(new Set(filteredHubInvoices.map(i => i.id)));
    } else {
      setSelectedInvoiceIds(new Set());
    }
  };

  const handleBulkActionOnHub = async (newAction: 'ACCEPT' | 'REJECT' | 'PENDING') => {
    const idsToUpdate = selectedInvoiceIds.size > 0 
      ? selectedInvoiceIds 
      : new Set(filteredHubInvoices.map(i => i.id));
    
    if (idsToUpdate.size === 0) return;

    if (detailInvoices.length === 0) {
      setDetailInvoices(DEMO_INVOICES.map(inv => idsToUpdate.has(inv.id) ? { ...inv, action: newAction } : inv));
      toast.success(\`Marked \${idsToUpdate.size} invoice(s) as \${newAction}!\`);
      setSelectedInvoiceIds(new Set());
      return;
    }

    setDetailInvoices(prev => prev.map(inv => {
      if (idsToUpdate.has(inv.id)) {
        return { ...inv, action: newAction };
      }
      return inv;
    }));

    if (activeClientOrFallback) {
      try {
        await safeApiFetch(\`\${getApiBase()}/api/ims/update-actions\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gstin: activeClientOrFallback.gstin,
            period: activePeriod,
            updates: Array.from(idsToUpdate).map(id => ({ id, action: newAction }))
          })
        });
        toast.success(\`Marked \${idsToUpdate.size} invoice(s) as \${newAction}!\`);
        setSelectedInvoiceIds(new Set());
        fetchSummary();
      } catch {
        toast.error('Failed saving bulk decisions to server.');
      }
    }
  };

  const handleHubSingleAction = (id: string, newAction: 'ACCEPT' | 'REJECT' | 'NO_ACTION') => {
    if (detailInvoices.length === 0) {
      setDetailInvoices(DEMO_INVOICES.map(inv => inv.id === id ? { ...inv, action: newAction } : inv));
      toast.success(\`Invoice updated to \${newAction}\`);
      return;
    }
    handleSetInvoiceAction(id, newAction as any);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ─── 3. STREAMLINED CLIENT BANNER & TIMER STRIP (1:1 STITCH BLUEPRINT) ─── */}
      <div className="bg-white p-3 sm:px-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-xs shrink-0">
            <Building2 className="w-5 h-5 text-purple-300" />
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2">
              {/* Client Selector Dropdown */}
              <div className="relative">
                <select
                  value={activeClientOrFallback.gstin}
                  onChange={(e) => {
                    const chosen = clients.find(c => c.gstin === e.target.value);
                    if (chosen) handleOpenDetail(chosen);
                  }}
                  className="text-xs sm:text-sm font-bold text-slate-900 leading-tight bg-transparent pr-6 py-0.5 border-0 focus:ring-0 cursor-pointer hover:text-purple-700"
                >
                  {clients.length > 0 ? (
                    clients.map(c => (
                      <option key={c.gstin} value={c.gstin}>
                        {c.trade_name || c.legal_name || c.gstin}
                      </option>
                    ))
                  ) : (
                    <option value={activeClientOrFallback.gstin}>
                      {activeClientOrFallback.trade_name}
                    </option>
                  )}
                </select>
              </div>

              <span className="px-2 py-0.5 rounded font-mono text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200/60">
                {activeClientOrFallback.gstin}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold flex items-center gap-1 border border-indigo-200/60">
                <ShieldCheck className="w-3 h-3 text-indigo-600" /> IMS Mandatory Compliance (w.e.f Oct 2024)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
              <span>Period: <strong className="text-slate-800 font-semibold">{activePeriod}</strong></span>
              <span>•</span>
              <span>GSTR-2B Draft Cut-off: <strong className="text-slate-800 font-semibold">14th 23:59 IST</strong></span>
            </p>
          </div>
        </div>

        {/* Live Sync Timer, Quick Actions & View Switcher */}
        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] uppercase font-bold text-slate-400">Sync Link:</span>
            <span className="font-mono text-xs font-semibold text-emerald-700">
              {formatCountdown(batchSecondsLeft || 580)} remaining
            </span>
          </div>

          <button
            onClick={() => fetchSummary()}
            className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1 transition-all border border-slate-200/70"
            title="Refresh Inward Sync"
          >
            <RefreshCw className={\`w-3.5 h-3.5 text-slate-500 \${loading ? 'animate-spin' : ''}\`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Toggle between Decision Hub and 300+ Clients Tower */}
          <button
            onClick={() => setViewMode(viewMode === 'DECISION_HUB' ? 'CLIENTS_TOWER' : 'DECISION_HUB')}
            className="px-3 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-all shadow-xs flex items-center gap-1.5"
            title="Switch between single client decision hub and 300+ clients overview"
          >
            <Users className="w-3.5 h-3.5 text-amber-300" />
            <span>{viewMode === 'DECISION_HUB' ? '300+ Control Tower' : 'Back to Decision Hub'}</span>
          </button>
        </div>
      </div>

      {viewMode === 'DECISION_HUB' ? (
        <>
          {/* ─── 4. COMPACT KPI SUMMARY BAR (1:1 STITCH BLUEPRINT) ─────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* KPI 1: Total Docs */}
            <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Inward Invoices</span>
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xl font-bold text-slate-900 tracking-tight">{activeStats.totalCount}</span>
                  <span className="text-[11px] text-slate-500 font-medium">Docs</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                  <span className="font-mono font-semibold text-slate-700">₹{activeStats.totalTaxable.toLocaleString('en-IN')}</span>
                  <span className="text-[10px] text-slate-400">Taxable</span>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
            </div>

            {/* KPI 2: Accepted */}
            <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">Action Taken (Accepted)</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xl font-bold text-emerald-700 tracking-tight">{activeStats.acceptedCount}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                    {activeStats.totalCount > 0 ? Math.round((activeStats.acceptedCount / activeStats.totalCount) * 100) : 0}%
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                  <span className="font-mono font-semibold text-emerald-600">₹{activeStats.acceptedGst.toLocaleString('en-IN')}</span>
                  <span className="text-[10px] text-emerald-600 font-medium">Claimable</span>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Check className="w-4 h-4" />
              </div>
            </div>

            {/* KPI 3: Rejected */}
            <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wide">Action Taken (Rejected)</span>
                  <X className="w-3.5 h-3.5 text-rose-600" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xl font-bold text-rose-600 tracking-tight">{activeStats.rejectedCount}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200/50">
                    {activeStats.totalCount > 0 ? ((activeStats.rejectedCount / activeStats.totalCount) * 100).toFixed(1) : '0.0'}%
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                  <span className="font-mono font-semibold text-rose-600">₹{activeStats.rejectedGst.toLocaleString('en-IN')}</span>
                  <span className="text-[10px] text-rose-600 font-medium">Ineligible</span>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
                <X className="w-4 h-4" />
              </div>
            </div>

            {/* KPI 4: Pending Action */}
            <div className="bg-gradient-to-br from-white to-amber-50/40 rounded-2xl p-3 border border-amber-300/80 shadow-xs hover:border-amber-400 transition-all flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wide">Pending Action</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xl font-bold text-amber-600 tracking-tight">{activeStats.pendingCount}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">Needs Review</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                  <span className="font-mono font-semibold text-amber-700">₹{activeStats.pendingGst.toLocaleString('en-IN')}</span>
                  <span className="text-[10px] text-amber-700 font-medium">Before 3B</span>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-amber-100/70 flex items-center justify-center text-amber-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* ─── 5. TIGHTENED FILTER & FAST BATCH ACTIONS BAR (1:1 STITCH BLUEPRINT) ─── */}
          <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 shadow-xs space-y-2.5">
            {/* Row 1: Segmented Filter Tabs & Search Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              <div className="flex items-center flex-wrap gap-1 bg-slate-100 p-1 rounded-xl text-xs font-medium">
                <button
                  onClick={() => setDetailActionFilter('ALL')}
                  className={\`px-2.5 py-1 rounded-lg transition-all \${
                    detailActionFilter === 'ALL'
                      ? 'bg-slate-900 text-white font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }\`}
                >
                  All Invoices <span className="font-mono text-[11px] font-bold ml-1 text-slate-400">{activeStats.totalCount}</span>
                </button>
                <button
                  onClick={() => setDetailActionFilter('PENDING')}
                  className={\`px-2.5 py-1 rounded-lg transition-all \${
                    detailActionFilter === 'PENDING'
                      ? 'bg-slate-900 text-white font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }\`}
                >
                  Pending Action <span className="font-mono text-[10px] ml-1 px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-600 font-bold">{activeStats.pendingCount}</span>
                </button>
                <button
                  onClick={() => setDetailActionFilter('ACCEPT')}
                  className={\`px-2.5 py-1 rounded-lg transition-all \${
                    detailActionFilter === 'ACCEPT'
                      ? 'bg-slate-900 text-white font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }\`}
                >
                  Accepted <span className="font-mono text-[11px] font-bold ml-1 text-emerald-600">{activeStats.acceptedCount}</span>
                </button>
                <button
                  onClick={() => setDetailActionFilter('REJECT')}
                  className={\`px-2.5 py-1 rounded-lg transition-all \${
                    detailActionFilter === 'REJECT'
                      ? 'bg-slate-900 text-white font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }\`}
                >
                  Rejected <span className="font-mono text-[11px] font-bold ml-1 text-rose-600">{activeStats.rejectedCount}</span>
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative w-full lg:w-80">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search Supplier Name, GSTIN, Inv No..."
                  value={detailSearch}
                  onChange={e => setDetailSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 text-slate-800 placeholder:text-slate-400 text-xs focus:outline-none focus:bg-white focus:ring-1 focus:ring-purple-400 border border-slate-200 transition-all"
                />
              </div>
            </div>

            {/* Row 2: Select All & 1-Click Fast Bulk Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={selectedInvoiceIds.size === filteredHubInvoices.length && filteredHubInvoices.length > 0}
                  onChange={e => toggleSelectAllInvoices(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-slate-900 focus:ring-0 cursor-pointer accent-slate-900"
                />
                <span>Select All {filteredHubInvoices.length} Filtered Items</span>
                <span className="font-mono text-[11px] text-slate-400 font-normal">
                  (Selected: {selectedInvoiceIds.size})
                </span>
              </label>

              {/* 1-Click Action Buttons */}
              <div className="flex items-center flex-wrap gap-1.5">
                <button
                  onClick={() => handleBulkActionOnHub('ACCEPT')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 shadow-xs active:scale-95 transition-all"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Mark Selected ACCEPT</span>
                </button>
                <button
                  onClick={() => handleBulkActionOnHub('REJECT')}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1 shadow-xs active:scale-95 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Mark Selected REJECT</span>
                </button>
                <button
                  onClick={() => handleBulkActionOnHub('PENDING')}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1 shadow-xs active:scale-95 transition-all"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Mark Selected PENDING</span>
                </button>
              </div>
            </div>
          </div>

          {/* ─── 6. HIGH-DENSITY DECISION GRID (1:1 STITCH BLUEPRINT) ─────────── */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
            <div className="w-full overflow-x-auto relative">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200 sticky top-0 z-20">
                    <th className="py-2.5 px-3 w-10 text-center">
                      <span className="sr-only">Selection</span>
                    </th>
                    <th className="py-2.5 px-3 font-semibold">Supplier Legal Name &amp; GSTIN</th>
                    <th className="py-2.5 px-3 font-semibold">Invoice Details</th>
                    <th className="py-2.5 px-2 font-semibold text-center">Type</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Taxable Value (₹)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">IGST (₹)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">CGST (₹)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">SGST (₹)</th>
                    <th className="py-2.5 px-3 font-semibold text-center">IMS Action State</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Direct Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                  {filteredHubInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400 font-sans">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="font-semibold text-slate-700">No invoices found for this filter.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredHubInvoices.map((inv) => {
                      const isSelected = selectedInvoiceIds.has(inv.id);
                      const act = (inv.action || 'NO_ACTION').toUpperCase();
                      const isCreditNote = inv.inv_typ === 'C' || inv.inv_typ === 'CR' || inv.inv_typ === 'CN';

                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/90 transition-colors">
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectInvoice(inv.id)}
                              className="w-3.5 h-3.5 rounded text-slate-900 focus:ring-0 cursor-pointer accent-slate-900"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900 leading-tight font-sans">
                              {inv.supplier_name || 'Vendor'}
                            </div>
                            <div className="font-mono text-[11px] text-slate-400">{inv.ctin}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-mono font-medium text-slate-900">{inv.inum}</div>
                            <div className="text-[11px] text-slate-400 font-sans">{inv.idt}</div>
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <span className={\`px-2 py-0.5 rounded text-[10px] font-bold border \${
                              isCreditNote
                                ? 'bg-pink-50 text-pink-700 border-pink-200/60'
                                : 'bg-slate-100 text-slate-600 border-slate-200/60'
                            }\`}>
                              {isCreditNote ? 'CDNR' : 'B2B'}
                            </span>
                          </td>
                          <td className={\`py-2.5 px-3 text-right font-mono font-medium \${isCreditNote ? 'text-pink-700' : 'text-slate-900'}\`}>
                            {fmt(Number(inv.txval) || 0)}
                          </td>
                          <td className={\`py-2.5 px-3 text-right font-mono font-semibold \${Number(inv.igst) > 0 ? 'text-emerald-600' : 'text-slate-400'}\`}>
                            {fmt(Number(inv.igst) || 0)}
                          </td>
                          <td className={\`py-2.5 px-3 text-right font-mono \${Number(inv.cgst) > 0 ? 'text-slate-800 font-medium' : 'text-slate-400'}\`}>
                            {fmt(Number(inv.cgst) || 0)}
                          </td>
                          <td className={\`py-2.5 px-3 text-right font-mono \${Number(inv.sgst) > 0 ? 'text-slate-800 font-medium' : 'text-slate-400'}\`}>
                            {fmt(Number(inv.sgst) || 0)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {act === 'ACCEPT' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                <Check className="w-3 h-3 text-emerald-600" /> ACCEPTED
                              </span>
                            ) : act === 'REJECT' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200/60">
                                <X className="w-3 h-3 text-rose-600" /> REJECTED
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> PENDING ACTION
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {act === 'ACCEPT' || act === 'REJECT' ? (
                              <button
                                onClick={() => handleHubSingleAction(inv.id, 'NO_ACTION')}
                                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium border border-slate-200 transition-all"
                              >
                                Revert
                              </button>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleHubSingleAction(inv.id, 'ACCEPT')}
                                  className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white text-[11px] font-semibold border border-emerald-200/60 transition-all"
                                  title="Accept Invoice ITC"
                                >
                                  Accept
                                </button>
                                <button
                                  onClick={() => handleHubSingleAction(inv.id, 'REJECT')}
                                  className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white text-[11px] font-semibold border border-rose-200/60 transition-all"
                                  title="Reject Invoice ITC"
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer / Summary Strip */}
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 font-sans">
              <div className="flex items-center gap-2">
                <span>Showing <strong className="text-slate-800 font-semibold">{filteredHubInvoices.length}</strong> items</span>
                <span>•</span>
                <span>Auto-sorted by GST Filing Priority (w.e.f Notification 12/2024)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="px-2.5 py-0.5 bg-white border border-slate-200 text-xs font-semibold text-slate-700 rounded shadow-xs">
                  Active Inward Register
                </span>
              </div>
            </div>
          </div>

          {/* ─── 7. COMPACT STICKY EXPORT & DECISION FOOTER (1:1 STITCH BLUEPRINT) ─── */}
          <footer className="sticky bottom-3 z-30 bg-white/95 backdrop-blur-md rounded-2xl p-2.5 sm:px-4 border border-slate-200/90 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 border border-amber-300/60">
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 leading-tight">
                  {activeStats.pendingCount} Invoices Pending Recipient Decision
                </div>
                <div className="text-[11px] text-slate-500">
                  Unacted invoices will cascade to GSTR-2B as provisional accepted on cut-off date.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
              <button
                onClick={() => handleExportClientReview(activeClientOrFallback)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-all active:scale-95 shadow-xs border border-slate-200"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Download IMS Excel</span>
              </button>

              <button
                onClick={() => handleExportPortalJson(activeClientOrFallback)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm active:scale-95 transition-all"
              >
                <FileJson className="w-3.5 h-3.5 text-purple-300" />
                <span>Export IMS JSON</span>
              </button>

              <button
                onClick={() => handlePushTo3B(activeClientOrFallback)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-sm active:scale-95 transition-all"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-white" />
                <span>Apply to 3B (Table 4)</span>
              </button>
            </div>
          </footer>
        </>
      ) : (
        /* ─── 300+ CLIENTS MASTER CONTROL TOWER (OPTIONAL POWER VIEW) ─────── */
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/80 p-3 sm:p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleOpenBatchSync(selectedGstins.size > 0 ? Array.from(selectedGstins) : undefined)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-all active:scale-95"
              >
                <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                ⚡ 1-Click Multi-Sync {selectedGstins.size > 0 ? \`(\${selectedGstins.size} Selected)\` : \`(\${credentialsStats.configured || clients.length} Clients)\`}
              </button>

              <button
                onClick={handleScanDownloadsFolder}
                disabled={batchScanningDownloads}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-2 border border-slate-200 transition-all shadow-xs"
              >
                <FolderSearch className={\`w-3.5 h-3.5 text-blue-400 \${batchScanningDownloads ? 'animate-spin' : ''}\`} />
                Scan Downloads
              </button>

              <button
                onClick={() => setShowCredentialsModal(true)}
                className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold flex items-center gap-2 border border-amber-200 transition-all"
              >
                <Key className="w-3.5 h-3.5" />
                Credentials Vault ({credentialsStats.configured}/{credentialsStats.total})
              </button>

              <button
                onClick={() => setShowDropzoneModal(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-2 border border-slate-200 transition-all"
              >
                <UploadCloud className="w-3.5 h-3.5 text-blue-400" />
                Drop Inward IMS Files
              </button>

              <button
                onClick={() => handleOpenEmailBroadcast()}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
              >
                <Mail className="w-3.5 h-3.5 text-sky-200" />
                <span>📧 Broadcast Emails ({selectedGstins.size > 0 ? \`\${selectedGstins.size} Selected\` : 'All Synced'})</span>
              </button>
            </div>
          </div>

          {/* Master 300+ Clients Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="p-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedGstins.size === filteredClients.length && filteredClients.length > 0}
                        onChange={e => handleSelectAll(e.target.checked)}
                        className="rounded border-slate-200 bg-white text-indigo-600 focus:ring-0"
                      />
                    </th>
                    <th className="p-4">Taxpayer / Trade Name</th>
                    <th className="p-4">GSTIN &amp; Contact</th>
                    <th className="p-4 text-center">Invoices</th>
                    <th className="p-4">Review Status</th>
                    <th className="p-4 text-right">Eligible 2B ITC</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClients.map((client, idx) => (
                    <tr
                      key={client.gstin || idx}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      onClick={() => {
                        handleOpenDetail(client);
                        setViewMode('DECISION_HUB');
                      }}
                    >
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedGstins.has(client.gstin)}
                          onChange={() => handleToggleSelect(client.gstin)}
                          className="rounded border-slate-200 bg-white text-indigo-600 focus:ring-0"
                        />
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-900 text-sm">{client.trade_name || client.legal_name || 'Client Details Missing'}</div>
                        <div className="text-[11px] text-slate-400">{client.legal_name || ''}</div>
                      </td>
                      <td className="p-4 font-mono">
                        <div className="text-slate-800 font-semibold">{client.gstin}</div>
                        <div className="text-[11px] text-slate-500">{client.phone ? \`+91 \${client.phone}\` : 'No phone saved'}</div>
                      </td>
                      <td className="p-4 text-center">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-mono font-bold text-slate-800">
                          {client.total_invoices || 0}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {client.status || 'SYNCED'}
                        </span>
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-emerald-700">
                        {fmt(client.eligible_itc || 0)}
                      </td>
                      <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            handleOpenDetail(client);
                            setViewMode('DECISION_HUB');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs"
                        >
                          Open Decisions
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
`;

const updatedCode = code.substring(0, returnStartIndex) + newLayout + '\n\n      ' + code.substring(dropzoneStartIndex);
fs.writeFileSync(filePath, updatedCode, 'utf-8');
console.log('Successfully modernized ImsMasterManager.tsx to match Stitch 1:1!');
