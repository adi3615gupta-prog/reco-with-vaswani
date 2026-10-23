import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  CheckCircle2, AlertCircle, Clock, Search, ShieldCheck,
  Building2, Calendar, FileText, ArrowRight, Check, X,
  HelpCircle, RefreshCw, Send, CheckCheck, Sparkles, AlertTriangle
} from 'lucide-react';
import { getApiBase } from '@/lib/api';
import type { ImsInvoice, ImsAction } from '@/lib/imsEngine';

export default function ClientImsReview() {
  const { token } = useParams<{ token: string }>();

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [clientInfo, setClientInfo] = useState<{
    gstin: string;
    tradeName: string;
    legalName: string;
    period: string;
  } | null>(null);

  const [invoices, setInvoices] = useState<ImsInvoice[]>([]);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'NO_ACTION' | 'ACCEPT' | 'REJECT' | 'PENDING'>('ALL');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Fetch Review Data
  const fetchReviewData = async () => {
    if (!token) {
      setError('Review token is missing. Please use the link provided by your Chartered Accountant.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${getApiBase()}/api/ims/public/review/${token}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to load review data. Link may be expired.');
        setLoading(false);
        return;
      }

      setClientInfo(data.client);
      setInvoices(data.invoices || []);
    } catch (err: any) {
      setError('Network connection error. Please verify your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviewData();
  }, [token]);

  // Handle single invoice action change
  const handleSetAction = (invoiceId: string, action: ImsAction, remarks?: string) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id === invoiceId) {
        return {
          ...inv,
          action,
          client_remarks: remarks !== undefined ? remarks : inv.client_remarks
        };
      }
      return inv;
    }));
  };

  // Bulk Accept all unreviewed
  const handleBulkAcceptRemaining = () => {
    setInvoices(prev => prev.map(inv => {
      if (!inv.action || inv.action === 'NO_ACTION') {
        return { ...inv, action: 'ACCEPT' };
      }
      return inv;
    }));
  };

  // Submit decisions to CA
  const handleSubmitReview = async () => {
    if (!token) return;

    try {
      setSubmitting(true);
      const payload = {
        decisions: invoices.map(inv => ({
          id: inv.id,
          action: inv.action || 'NO_ACTION',
          remarks: inv.client_remarks || ''
        }))
      };

      const res = await fetch(`${getApiBase()}/api/ims/public/submit/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Submission failed. Please try again.');
        setSubmitting(false);
        return;
      }

      setSubmitted(true);
      setShowConfirmModal(false);
    } catch (err) {
      alert('Network error while submitting. Please check connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Derived metrics
  const stats = useMemo(() => {
    let accepted = 0;
    let rejected = 0;
    let pending = 0;
    let noAction = 0;
    let totalEligibleItc = 0;
    let totalTaxable = 0;

    invoices.forEach(inv => {
      totalTaxable += inv.txval || 0;
      const act = inv.action || 'NO_ACTION';
      if (act === 'ACCEPT') {
        accepted++;
        totalEligibleItc += (inv.igst || 0) + (inv.cgst || 0) + (inv.sgst || 0) + (inv.cess || 0);
      } else if (act === 'REJECT') {
        rejected++;
      } else if (act === 'PENDING') {
        pending++;
      } else {
        noAction++;
      }
    });

    return {
      total: invoices.length,
      accepted,
      rejected,
      pending,
      noAction,
      totalEligibleItc: Math.round(totalEligibleItc * 100) / 100,
      totalTaxable: Math.round(totalTaxable * 100) / 100,
      progressPercent: invoices.length > 0 ? Math.round(((invoices.length - noAction) / invoices.length) * 100) : 0
    };
  }, [invoices]);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      // Tab filter
      if (filterTab !== 'ALL') {
        const act = inv.action || 'NO_ACTION';
        if (filterTab === 'NO_ACTION' && act !== 'NO_ACTION') return false;
        if (filterTab !== 'NO_ACTION' && act !== filterTab) return false;
      }

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const ctin = (inv.ctin || '').toLowerCase();
        const name = (inv.supplier_name || '').toLowerCase();
        const inum = (inv.inum || '').toLowerCase();
        return ctin.includes(q) || name.includes(q) || inum.includes(q);
      }

      return true;
    });
  }, [invoices, filterTab, search]);

  // Format currency
  const fmt = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  // ─── ERROR STATE ─────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Review Link Unavailable</h2>
            <p className="text-sm text-slate-400">{error}</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs text-slate-400 leading-relaxed">
            Please contact your Chartered Accountant at <strong className="text-slate-200">Sourav Vaswani &amp; Co.</strong> to request an updated IMS review link.
          </div>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs tracking-wider transition-all"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // ─── LOADING STATE ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <RefreshCw className="w-10 h-10 animate-spin text-emerald-400 mx-auto" />
          <p className="text-sm font-medium text-slate-400">Loading your GST IMS Inward Supplies...</p>
        </div>
      </div>
    );
  }

  // ─── SUBMISSION CONFIRMATION SUCCESS SCREEN ──────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-emerald-500/30 rounded-3xl p-8 text-center space-y-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500" />
          <div className="w-20 h-20 mx-auto rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
            <CheckCheck className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-widest text-emerald-400 font-bold">Review Successfully Submitted</span>
            <h2 className="text-2xl font-black text-white">{clientInfo?.tradeName}</h2>
            <p className="text-xs text-slate-400">Return Period: {clientInfo?.period}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 p-4 rounded-2xl bg-slate-950/70 border border-slate-800 text-center">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Accepted</span>
              <p className="text-lg font-bold text-emerald-400">{stats.accepted}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Rejected</span>
              <p className="text-lg font-bold text-rose-400">{stats.rejected}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Pending</span>
              <p className="text-lg font-bold text-amber-400">{stats.pending}</p>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-slate-300 leading-relaxed text-left space-y-1">
            <p className="font-semibold text-emerald-400">What happens next?</p>
            <p className="text-[11px] text-slate-400">
              Your Chartered Accountant will synchronize your decisions directly with the GST Portal IMS dashboard. Your accepted invoices will automatically form your GSTR-2B Input Tax Credit for this month.
            </p>
          </div>
          <p className="text-[11px] text-slate-500">You may safely close this window.</p>
        </div>
      </div>
    );
  }

  // ─── MAIN INTERACTIVE REVIEW VIEW ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-32">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 shadow-xl">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                GST IMS Client Portal
              </span>
              <span className="text-xs text-slate-400 font-medium">Audited with Vaswani</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-400 shrink-0" />
              {clientInfo?.tradeName}
            </h1>
            <p className="text-xs text-slate-400 font-mono flex items-center gap-2">
              <span>GSTIN: <strong className="text-slate-200">{clientInfo?.gstin}</strong></span>
              <span>•</span>
              <span className="flex items-center gap-1 text-indigo-300 font-sans">
                <Calendar className="w-3.5 h-3.5" /> {clientInfo?.period}
              </span>
            </p>
          </div>

          {/* Quick Stat Pill in Header */}
          <div className="flex items-center gap-3 bg-slate-950/80 p-2.5 rounded-2xl border border-slate-800">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Eligible ITC (Accepted)</span>
              <span className="text-base font-black text-emerald-400">{fmt(stats.totalEligibleItc)}</span>
            </div>
            <div className="h-8 w-px bg-slate-800" />
            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Decided</span>
              <span className="text-base font-bold text-white">{invoices.length - stats.noAction} / {invoices.length}</span>
            </div>
          </div>
        </div>

        {/* Review Progress Bar */}
        <div className="w-full bg-slate-800/50 h-1.5 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500 transition-all duration-300"
            style={{ width: `${stats.progressPercent}%` }}
          />
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* KPI Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Invoices</span>
            <p className="text-xl font-black text-white">{stats.total}</p>
            <span className="text-[10px] text-slate-500 font-mono">Value: {fmt(stats.totalTaxable)}</span>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-1">
            <div className="flex items-center justify-between text-emerald-400">
              <span className="text-[10px] uppercase font-semibold">Accepted</span>
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <p className="text-xl font-black text-emerald-400">{stats.accepted}</p>
            <span className="text-[10px] text-emerald-500/80">Eligible in GSTR-2B</span>
          </div>

          <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-1">
            <div className="flex items-center justify-between text-rose-400">
              <span className="text-[10px] uppercase font-semibold">Rejected</span>
              <X className="w-4 h-4" />
            </div>
            <p className="text-xl font-black text-rose-400">{stats.rejected}</p>
            <span className="text-[10px] text-rose-500/80">Excluded from ITC</span>
          </div>

          <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-1">
            <div className="flex items-center justify-between text-amber-400">
              <span className="text-[10px] uppercase font-semibold">Pending</span>
              <Clock className="w-4 h-4" />
            </div>
            <p className="text-xl font-black text-amber-400">{stats.pending}</p>
            <span className="text-[10px] text-amber-500/80">Held for Future Month</span>
          </div>

          <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-1 col-span-2 md:col-span-1">
            <div className="flex items-center justify-between text-indigo-400">
              <span className="text-[10px] uppercase font-semibold">To Decide</span>
              <HelpCircle className="w-4 h-4" />
            </div>
            <p className="text-xl font-black text-indigo-400">{stats.noAction}</p>
            <span className="text-[10px] text-indigo-500/80">Needs Action</span>
          </div>
        </div>

        {/* Toolbar: Search, Filters & Bulk Action */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900 border border-slate-800">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by vendor name, GSTIN, or invoice number..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {[
              { id: 'ALL', label: `All (${invoices.length})` },
              { id: 'NO_ACTION', label: `Needs Action (${stats.noAction})` },
              { id: 'ACCEPT', label: `Accepted (${stats.accepted})` },
              { id: 'REJECT', label: `Rejected (${stats.rejected})` },
              { id: 'PENDING', label: `Pending (${stats.pending})` },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  filterTab === tab.id
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'bg-slate-950/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Bulk Accept Button */}
          {stats.noAction > 0 && (
            <button
              onClick={handleBulkAcceptRemaining}
              className="px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center justify-center gap-2 transition-all shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Accept All Remaining ({stats.noAction})
            </button>
          )}
        </div>

        {/* Invoice List (Excel Spreadsheet Grid View) */}
        <div className="border border-slate-700/80 rounded-2xl overflow-hidden bg-slate-950 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
              <thead className="sticky top-0 bg-slate-800 text-slate-200 z-10 shadow-sm border-b border-slate-700 select-none">
                <tr className="divide-x divide-slate-700/60 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-2 text-center w-8">#</th>
                  <th className="py-2.5 px-3">Supplier Name</th>
                  <th className="py-2.5 px-3">Supplier GSTIN</th>
                  <th className="py-2.5 px-2 text-center">Type</th>
                  <th className="py-2.5 px-3">Invoice No</th>
                  <th className="py-2.5 px-2.5 text-center">Date</th>
                  <th className="py-2.5 px-3 text-right font-mono">Taxable (₹)</th>
                  <th className="py-2.5 px-2.5 text-right font-mono">IGST (₹)</th>
                  <th className="py-2.5 px-2.5 text-right font-mono">CGST (₹)</th>
                  <th className="py-2.5 px-2.5 text-right font-mono">SGST (₹)</th>
                  <th className="py-2.5 px-2.5 text-right font-mono">Cess (₹)</th>
                  <th className="py-2.5 px-3 text-right font-mono text-emerald-400">Total GST (₹)</th>
                  <th className="py-2.5 px-3 text-right font-mono font-bold text-white">Invoice Val (₹)</th>
                  <th className="py-2.5 px-3 text-center">Your Decision</th>
                  <th className="py-2.5 px-3 min-w-[200px]">Remark / Reason for CA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="py-16 text-center text-slate-500">
                      <FileText className="w-8 h-8 text-slate-500 mx-auto mb-2 opacity-50" />
                      <p className="text-sm font-semibold text-slate-400">No invoices match your current filter</p>
                      <p className="text-xs text-slate-500">Try changing the search query or switching tabs above.</p>
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv, idx) => {
                    const currentAction = inv.action || 'NO_ACTION';
                    const igst = Number(inv.igst) || 0;
                    const cgst = Number(inv.cgst) || 0;
                    const sgst = Number(inv.sgst) || 0;
                    const cess = Number(inv.cess) || 0;
                    const totalTax = igst + cgst + sgst + cess;
                    const taxable = Number(inv.txval) || 0;
                    const totalBillVal = Number(inv.total_val) > 0 ? Number(inv.total_val) : (taxable + totalTax);

                    return (
                      <tr
                        key={inv.id || idx}
                        className={`divide-x divide-slate-800/60 transition-colors ${
                          currentAction === 'ACCEPT'
                            ? 'bg-emerald-950/20 hover:bg-emerald-950/30'
                            : currentAction === 'REJECT'
                            ? 'bg-rose-950/20 hover:bg-rose-950/30'
                            : currentAction === 'PENDING'
                            ? 'bg-amber-950/20 hover:bg-amber-950/30'
                            : 'hover:bg-slate-900/60'
                        }`}
                      >
                        <td className="py-2 px-2 text-center text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-2 px-3 font-semibold text-white max-w-[220px] truncate" title={inv.supplier_name}>
                          {inv.supplier_name || 'Vendor Details Pending'}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-300 select-all">
                          {inv.ctin}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            inv.inv_typ === 'C'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              : inv.inv_typ === 'D'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                              : 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/30'
                          }`}>
                            {inv.inv_typ === 'C' ? 'CR' : inv.inv_typ === 'D' ? 'DR' : 'INV'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-white select-all">
                          {inv.inum}
                        </td>
                        <td className="py-2 px-2.5 text-center font-mono text-slate-300">
                          {inv.idt}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-medium text-slate-200">
                          {fmt(taxable)}
                        </td>
                        <td className={`py-2 px-2.5 text-right font-mono ${igst > 0 ? 'text-indigo-300 font-bold' : 'text-slate-500'}`}>
                          {igst > 0 ? fmt(igst) : '-'}
                        </td>
                        <td className={`py-2 px-2.5 text-right font-mono ${cgst > 0 ? 'text-blue-300 font-bold' : 'text-slate-500'}`}>
                          {cgst > 0 ? fmt(cgst) : '-'}
                        </td>
                        <td className={`py-2 px-2.5 text-right font-mono ${sgst > 0 ? 'text-cyan-300 font-bold' : 'text-slate-500'}`}>
                          {sgst > 0 ? fmt(sgst) : '-'}
                        </td>
                        <td className={`py-2 px-2.5 text-right font-mono ${cess > 0 ? 'text-amber-300 font-bold' : 'text-slate-500'}`}>
                          {cess > 0 ? fmt(cess) : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">
                          {fmt(totalTax)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-white bg-slate-900/60">
                          {fmt(totalBillVal)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleSetAction(inv.id, 'ACCEPT')}
                              className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all ${
                                currentAction === 'ACCEPT'
                                  ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-sm shadow-emerald-500/40'
                                  : 'bg-slate-800 text-slate-400 hover:text-emerald-300 hover:bg-slate-700'
                              }`}
                              title="Accept invoice for ITC"
                            >
                              <Check className="w-3 h-3" />
                              <span>Accept</span>
                            </button>
                            <button
                              onClick={() => handleSetAction(inv.id, 'PENDING')}
                              className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all ${
                                currentAction === 'PENDING'
                                  ? 'bg-amber-500 text-slate-950 font-extrabold shadow-sm shadow-amber-500/40'
                                  : 'bg-slate-800 text-slate-400 hover:text-amber-300 hover:bg-slate-700'
                              }`}
                              title="Hold as pending"
                            >
                              <Clock className="w-3 h-3" />
                              <span>Hold</span>
                            </button>
                            <button
                              onClick={() => handleSetAction(inv.id, 'REJECT')}
                              className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all ${
                                currentAction === 'REJECT'
                                  ? 'bg-rose-500 text-white font-extrabold shadow-sm shadow-rose-500/40'
                                  : 'bg-slate-800 text-slate-400 hover:text-rose-300 hover:bg-slate-700'
                              }`}
                              title="Reject invoice"
                            >
                              <X className="w-3 h-3" />
                              <span>Reject</span>
                            </button>
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            placeholder="Add reason/note for CA..."
                            value={inv.client_remarks || ''}
                            onChange={e => handleSetAction(inv.id, currentAction, e.target.value)}
                            className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredInvoices.length > 0 && (
                <tfoot className="sticky bottom-0 bg-slate-900 border-t-2 border-slate-700 font-bold text-white z-10 text-xs font-mono">
                  <tr className="divide-x divide-slate-700/60">
                    <td colSpan={6} className="py-2.5 px-3 text-right font-sans uppercase font-bold text-slate-300">
                      Total ({filteredInvoices.length} Bills):
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-white">
                      {fmt(filteredInvoices.reduce((acc, i) => acc + (Number(i.txval) || 0), 0))}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-bold text-indigo-300">
                      {fmt(filteredInvoices.reduce((acc, i) => acc + (Number(i.igst) || 0), 0))}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-bold text-blue-300">
                      {fmt(filteredInvoices.reduce((acc, i) => acc + (Number(i.cgst) || 0), 0))}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-bold text-cyan-300">
                      {fmt(filteredInvoices.reduce((acc, i) => acc + (Number(i.sgst) || 0), 0))}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-bold text-amber-300">
                      {fmt(filteredInvoices.reduce((acc, i) => acc + (Number(i.cess) || 0), 0))}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                      {fmt(filteredInvoices.reduce((acc, i) => acc + (Number(i.igst) || 0) + (Number(i.cgst) || 0) + (Number(i.sgst) || 0) + (Number(i.cess) || 0), 0))}
                    </td>
                    <td className="py-2.5 px-3 text-right font-black text-white bg-slate-950">
                      {fmt(filteredInvoices.reduce((acc, i) => {
                        const gst = (Number(i.igst) || 0) + (Number(i.cgst) || 0) + (Number(i.sgst) || 0) + (Number(i.cess) || 0);
                        return acc + (Number(i.total_val) > 0 ? Number(i.total_val) : ((Number(i.txval) || 0) + gst));
                      }, 0))}
                    </td>
                    <td colSpan={2} className="py-2.5 px-3 text-center text-slate-300 font-sans text-[11px]">
                      Eligible 3B ITC: <strong className="text-emerald-400 font-mono text-xs">{fmt(stats.totalEligibleItc)}</strong>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </main>

      {/* Floating Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 p-4 shadow-2xl">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="space-y-0.5 text-center sm:text-left">
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <span className="text-xs text-slate-300 font-semibold">Review Progress:</span>
              <span className="text-xs font-mono font-bold text-white">
                {invoices.length - stats.noAction} of {invoices.length} Bills
              </span>
              {stats.noAction > 0 ? (
                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-bold">
                  {stats.noAction} to decide
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">
                  All Decided
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Eligible Input Tax Credit to claim: <strong className="text-emerald-400 font-mono">{fmt(stats.totalEligibleItc)}</strong>
            </p>
          </div>

          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={submitting}
            className="w-full sm:w-auto px-8 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold text-sm shadow-xl shadow-emerald-950/40 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            Submit Final Review to CA
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-white">Confirm Review Submission</h3>
              <p className="text-xs text-slate-400">
                You are about to submit your inward invoice decisions for <strong>{clientInfo?.period}</strong> to your Chartered Accountant.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Accepted Invoices:</span>
                <strong className="text-emerald-400">{stats.accepted} bills ({fmt(stats.totalEligibleItc)})</strong>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Rejected Invoices:</span>
                <strong className="text-rose-400">{stats.rejected} bills</strong>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Held as Pending:</span>
                <strong className="text-amber-400">{stats.pending} bills</strong>
              </div>
              {stats.noAction > 0 && (
                <div className="pt-2 border-t border-slate-800 flex justify-between text-amber-300 font-semibold">
                  <span>Undecided (Deemed Accepted):</span>
                  <span>{stats.noAction} bills</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
              >
                Back to Review
              </button>
              <button
                onClick={handleSubmitReview}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Confirm &amp; Send
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
