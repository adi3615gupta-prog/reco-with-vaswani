import { useState } from 'react';
import { ArrowLeft, FileSpreadsheet, FileJson, CheckCircle2, ShieldAlert, GitCompare, UploadCloud, FileText, Send, LayoutTemplate, Copy, Lightbulb, Key, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { getApiBase, getAuthToken } from '@/lib/api';

interface ReturnsDashboardProps {
  onBack: () => void;
}

export default function ReturnsDashboard({ onBack }: ReturnsDashboardProps) {
  const [showQuickGuide, setShowQuickGuide] = useState(false);
  const [activeTab, setActiveTab] = useState<'import' | 'validate' | 'compare' | 'gstr1' | 'gstr3b'>('import');
  const [isProcessing, setIsProcessing] = useState(false);

  // GSTN Portal Authentication States
  const [portalSessionActive, setPortalSessionActive] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [targetGstin, setTargetGstin] = useState('');
  const [gstinOtp, setGstinOtp] = useState('');

  const triggerMockApi = async (endpoint: string, successMsg: string, loadingMsg: string) => {
    try {
      const uRes = await fetch(`${getApiBase()}/api/usage/increment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ module_name: 'Returns' })
      });
      if (!uRes.ok) {
        const data = await uRes.json();
        toast.error('Module Locked', { description: data.error || 'Usage limit reached' });
        return;
      }
    } catch (err) {
      toast.error('Connection Error', { description: 'Could not verify usage limits' });
      return;
    }

    setIsProcessing(true);
    const id = toast.loading(loadingMsg);
    try {
      const res = await fetch(`${getApiBase()}/api/returns/${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      });
      const data = await res.json();
      if (res.ok && data.success) toast.success("Success", { id, description: successMsg });
      else throw new Error("Failed");
    } catch (e) {
      toast.error("Operation Failed", { id, description: "Ensure the local server is running and authenticated." });
    }
    setIsProcessing(false);
  };

  // Simulates requesting an OTP from the GSTN via GSP API
  const handleRequestPortalOtp = () => {
    if (!targetGstin || targetGstin.length !== 15) {
      return toast.error("Please enter a valid 15-character GSTIN.");
    }
    setIsProcessing(true);
    toast.promise(
      new Promise(resolve => setTimeout(resolve, 1500)),
      {
        loading: 'Connecting to GSTN via GSP Gateway...',
        success: () => {
          setIsProcessing(false);
          setShowOtpModal(true);
          return `OTP dispatched to registered mobile for ${targetGstin}`;
        },
        error: () => {
          setIsProcessing(false);
          return 'Failed to reach GSTN.';
        }
      }
    );
  };

  // Simulates verifying the OTP to establish an active session token
  const handleVerifyPortalOtp = () => {
    if (!gstinOtp || gstinOtp.length < 6) return toast.error("Enter a valid OTP.");
    setIsProcessing(true);

    toast.promise(
      new Promise(resolve => setTimeout(resolve, 1500)),
      {
        loading: 'Verifying OTP & negotiating encryption keys...',
        success: () => {
          setIsProcessing(false);
          setShowOtpModal(false);
          setPortalSessionActive(true);
          return 'Secure GST Portal Session Established! Valid for 6 hours.';
        },
        error: 'Invalid OTP.'
      }
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-6">
        <div>
          <button onClick={onBack} className="text-slate-400 hover:text-white flex items-center gap-2 font-bold uppercase tracking-wider text-[10px] mb-4 transition-colors">
            <ArrowLeft className="w-3 h-3" /> Back to Hub
          </button>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Returns Preparation & Filing</h1>
          <p className="text-slate-400 font-medium mt-1">Prepare, validate, compare, and file GSTR-1 & GSTR-3B strictly offline until upload.</p>
        </div>

        {/* Active Portal Session Badge */}
        <div className="flex items-center gap-3 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
          {portalSessionActive ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" /> Live GSTN Session Active
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4" /> No Active Session
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Quick Guide */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 text-slate-300 backdrop-blur-md shadow-lg max-w-7xl mx-auto">
        <button
          onClick={() => setShowQuickGuide(!showQuickGuide)}
          className="flex items-center justify-between w-full text-slate-300 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
            <Lightbulb className="w-4 h-4 text-yellow-400" />
            Quick Returns Preparation User Guide
          </span>
          <span className="text-xs text-blue-400 font-bold hover:underline">{showQuickGuide ? 'Hide' : 'Show Instructions'}</span>
        </button>
        {showQuickGuide && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 text-xs text-slate-400 space-y-4 animate-in fade-in slide-in-from-top-1 duration-350">
            <p><strong>Overview:</strong> Prepare, validate, compare, and generate portal-ready JSON files for GSTR-1 and GSTR-3B filed returns offline.</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="font-bold text-slate-300 mb-1.5">Step-by-step Steps:</p>
                <ol className="space-y-1.5 pl-4 list-decimal">
                  <li><strong>Import:</strong> Load books data from Excel spreadsheets or accounting software (Tally, Busy, Marg).</li>
                  <li><strong>Validate:</strong> Run offline diagnostic checks to catch structure errors (missing GSTIN, wrong HSN, tax rate errors).</li>
                  <li><strong>Compare:</strong> Cross-check GSTR-1 vs GSTR-3B to prevent mismatch notices.</li>
                  <li><strong>File Returns:</strong> Generate the JSON payload, review drafts, auto-upload to portal, and submit securely via OTP.</li>
                </ol>
              </div>
              <div>
                <p className="font-bold text-slate-300 mb-1.5">Inputs & Outputs:</p>
                <p className="mb-2"><strong>Required Inputs:</strong> Accounting ledger sales data, historical GSTR-1 entries, and portal credentials/API keys.</p>
                <p><strong>Outputs Produced:</strong> Portal JSON upload files, diagnostic error reports, and comparison sheets.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 bg-slate-900/50 p-2 rounded-xl border border-slate-800 backdrop-blur-md">
        {[
          { id: 'import', label: '1. Import Data', icon: UploadCloud },
          { id: 'validate', label: '2. Engine Validation', icon: ShieldAlert },
          { id: 'compare', label: '3. Data Compare', icon: GitCompare },
          { id: 'gstr1', label: '4. File GSTR-1', icon: Send },
          { id: 'gstr3b', label: '5. File GSTR-3B', icon: FileText }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT: IMPORT */}
      {activeTab === 'import' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pop-in">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl hover:border-blue-500/50 transition-colors cursor-pointer group">
            <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><LayoutTemplate className="w-6 h-6" /></div>
            <h3 className="text-lg font-bold text-white mb-2">Accounting Software</h3>
            <p className="text-xs text-slate-400 mb-4">Direct import from renowned templates.</p>
            <div className="flex gap-2 mt-auto">
              <span className="px-2 py-1 bg-slate-800 text-xs rounded text-slate-300 font-bold">Tally</span>
              <span className="px-2 py-1 bg-slate-800 text-xs rounded text-slate-300 font-bold">Marg</span>
              <span className="px-2 py-1 bg-slate-800 text-xs rounded text-slate-300 font-bold">Busy</span>
            </div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl hover:border-emerald-500/50 transition-colors cursor-pointer group">
            <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><FileSpreadsheet className="w-6 h-6" /></div>
            <h3 className="text-lg font-bold text-white mb-2">Excel / GST Template</h3>
            <p className="text-xs text-slate-400">Import standard GST offline tool templates or custom Excel sheets.</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl hover:border-amber-500/50 transition-colors cursor-pointer group">
            <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><FileJson className="w-6 h-6" /></div>
            <h3 className="text-lg font-bold text-white mb-2">JSON Payload</h3>
            <p className="text-xs text-slate-400">One-click preparation from existing GSTR-1/3B JSON files.</p>
          </div>
        </div>
      )}

      {/* TAB CONTENT: VALIDATE */}
      {activeTab === 'validate' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pop-in">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="w-12 h-12 bg-purple-500/20 text-purple-400 rounded-xl flex items-center justify-center mb-4"><ShieldAlert className="w-6 h-6" /></div>
            <h3 className="text-lg font-bold text-white mb-2">Strong Local Validation Engine</h3>
            <p className="text-sm text-slate-400 mb-6">Minimize errors before uploading. Validates HSN, Tax rates, Place of Supply, and Invoice formats offline.</p>
            <button className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold transition-colors">Run Offline Validation</button>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center mb-4"><CheckCircle2 className="w-6 h-6" /></div>
            <h3 className="text-lg font-bold text-white mb-2">Portal GSTIN Validation</h3>
            <p className="text-sm text-slate-400 mb-6">One-click validation directly from the GST Portal. Cross-checks all imported GSTINs against live government records.</p>
            <button
              onClick={() => triggerMockApi('validate-gstin', 'GSTINs Validated Successfully.', 'Connecting to Portal...')}
              disabled={isProcessing}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
            >
              1-Click Portal Check
            </button>
          </div>
        </div>
      )}

      {/* TAB CONTENT: COMPARE */}
      {activeTab === 'compare' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pop-in">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><GitCompare className="w-5 h-5 text-indigo-400" /> GSTR-1 vs GSTR-3B</h3>
            <p className="text-sm text-slate-400 mb-6">Find differences in Outward Supply before filing 3B to avoid mismatch notices.</p>
            <button className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-colors">Generate Compare Report</button>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><GitCompare className="w-5 h-5 text-amber-400" /> Software vs Portal</h3>
            <p className="text-sm text-slate-400 mb-6">Compare GSTR-1 software data with what is currently uploaded/saved on the GST portal.</p>
            <button className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition-colors">Fetch & Compare Portal Data</button>
          </div>
        </div>
      )}

      {/* GSTN SESSION GATEWAY - Required before GSTR-1 / 3B filing */}
      {(activeTab === 'gstr1' || activeTab === 'gstr3b') && !portalSessionActive && (
        <div className="bg-slate-900/60 border border-blue-500/30 rounded-2xl p-8 shadow-xl max-w-4xl mx-auto mb-6 flex flex-col items-center text-center animate-in fade-in slide-in-from-top-4">
          <div className="w-16 h-16 bg-blue-500/10 text-blue-400 rounded-full flex items-center justify-center mb-4">
            <Key className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Connect to GST Portal</h3>
          <p className="text-sm text-slate-400 max-w-lg mb-6">Before you can auto-upload payloads or file returns directly from the software, you must establish a secure, encrypted session with the GSTN portal using OTP.</p>

          <div className="flex w-full max-w-md gap-3">
            <input
              type="text"
              value={targetGstin}
              onChange={e => setTargetGstin(e.target.value.toUpperCase().trim())}
              placeholder="Enter 15-digit GSTIN"
              className="flex-1 h-12 bg-slate-950 border border-slate-700 rounded-xl px-4 text-white uppercase font-mono tracking-wider focus:border-blue-500 outline-none"
              maxLength={15}
            />
            <button
              onClick={handleRequestPortalOtp}
              disabled={isProcessing}
              className="h-12 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all disabled:opacity-50"
            >
              {isProcessing ? 'Connecting...' : 'Request OTP'}
            </button>
          </div>
        </div>
      )}

      {/* TAB CONTENT: GSTR-1 FILING */}
      {activeTab === 'gstr1' && portalSessionActive && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 shadow-xl animate-pop-in max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-6 border-b border-slate-800 pb-4">GSTR-1 Outward Supplies</h2>
          <div className="space-y-4">
            <button
              onClick={() => triggerMockApi('generate-json', 'JSON Generated', 'Preparing JSON...')}
              disabled={isProcessing}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-4 text-left"><FileJson className="w-6 h-6 text-emerald-400" /><div><p className="font-bold text-white">1. Generate JSON Payload</p><p className="text-xs text-slate-400">Prepare automatic GSTR-1 JSON file offline.</p></div></div>
            </button>
            <button
              onClick={() => triggerMockApi('upload', 'Uploaded to Portal', 'Uploading JSON without manual login...')}
              disabled={isProcessing}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-4 text-left"><UploadCloud className="w-6 h-6 text-blue-400" /><div><p className="font-bold text-white">2. Auto-Upload to Portal</p><p className="text-xs text-slate-400">Direct upload to portal without manual ID/Password login.</p></div></div>
            </button>
            <button
              onClick={() => triggerMockApi('draft-pdf', 'PDF Downloaded', 'Fetching Draft...')}
              disabled={isProcessing}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-4 text-left"><FileText className="w-6 h-6 text-rose-400" /><div><p className="font-bold text-white">3. View Draft PDF</p><p className="text-xs text-slate-400">View Draft PDF in Software directly before submitting.</p></div></div>
            </button>
            <button
              onClick={() => triggerMockApi('file', 'Return Filed Successfully', 'Initiating Filing Protocol...')}
              disabled={isProcessing}
              className="w-full flex items-center justify-between p-5 rounded-xl border-2 border-emerald-600/50 bg-emerald-600/10 hover:bg-emerald-600/20 transition-colors mt-6"
            >
              <div className="flex items-center gap-4 text-left"><Send className="w-6 h-6 text-emerald-400" /><div><p className="font-bold text-emerald-400 text-lg">4. Submit & File GSTR-1</p><p className="text-xs text-emerald-400/70">Finalize submission securely via OTP from within the software.</p></div></div>
            </button>
          </div>
        </div>
      )}

      {/* TAB CONTENT: GSTR-3B FILING */}
      {activeTab === 'gstr3b' && portalSessionActive && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 shadow-xl animate-pop-in max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-6 border-b border-slate-800 pb-4">GSTR-3B Summary Return</h2>
          <div className="space-y-4">
            <button className="w-full flex items-center justify-between p-4 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors mb-2">
              <div className="flex items-center gap-4 text-left"><Copy className="w-6 h-6 text-blue-400" /><div><p className="font-bold text-blue-400">1-Click Import from GSTR-1</p><p className="text-xs text-blue-400/70">Import Sales into GSTR-3B from GSTR-1 to avoid supply value mismatch.</p></div></div>
            </button>

            <button
              onClick={() => triggerMockApi('generate-json', 'JSON Generated', 'Preparing JSON...')}
              disabled={isProcessing}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-4 text-left"><FileJson className="w-6 h-6 text-emerald-400" /><div><p className="font-bold text-white">1. Generate JSON Payload</p><p className="text-xs text-slate-400">Prepare automatic GSTR-3B JSON file offline.</p></div></div>
            </button>
            <button
              onClick={() => triggerMockApi('upload', 'Uploaded to Portal', 'Uploading JSON without manual login...')}
              disabled={isProcessing}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-4 text-left"><UploadCloud className="w-6 h-6 text-blue-400" /><div><p className="font-bold text-white">2. Auto-Upload to Portal</p><p className="text-xs text-slate-400">Direct upload to portal without manual ID/Password login.</p></div></div>
            </button>
            <button
              onClick={() => triggerMockApi('draft-pdf', 'PDF Downloaded', 'Fetching Draft...')}
              disabled={isProcessing}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-4 text-left"><FileText className="w-6 h-6 text-rose-400" /><div><p className="font-bold text-white">3. View Draft PDF</p><p className="text-xs text-slate-400">View Draft PDF in Software directly before submitting.</p></div></div>
            </button>
            <button
              onClick={() => triggerMockApi('file', 'Return Filed Successfully', 'Initiating Filing Protocol...')}
              disabled={isProcessing}
              className="w-full flex items-center justify-between p-5 rounded-xl border-2 border-amber-600/50 bg-amber-600/10 hover:bg-amber-600/20 transition-colors mt-6"
            >
              <div className="flex items-center gap-4 text-left"><Send className="w-6 h-6 text-amber-400" /><div><p className="font-bold text-amber-400 text-lg">4. Submit & File GSTR-3B</p><p className="text-xs text-amber-400/70">Finalize submission securely via OTP from within the software.</p></div></div>
            </button>
          </div>
        </div>
      )}

      {/* OTP MODAL */}
      {showOtpModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-pop-in">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="text-white font-bold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Verify Portal OTP</h3>
              <button onClick={() => setShowOtpModal(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-400 text-center">An OTP has been sent to the registered mobile number for <strong className="text-white">{targetGstin}</strong>.</p>

              <div>
                <input
                  type="text"
                  value={gstinOtp}
                  onChange={e => setGstinOtp(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Enter 6-digit OTP"
                  className="w-full h-12 bg-slate-950 border border-slate-700 rounded-xl px-4 text-center text-xl text-white tracking-[0.5em] font-mono focus:border-emerald-500 outline-none"
                  maxLength={6}
                />
              </div>

              <button
                onClick={handleVerifyPortalOtp}
                disabled={isProcessing || gstinOtp.length !== 6}
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all disabled:opacity-50 mt-2"
              >
                {isProcessing ? 'Verifying...' : 'Establish Secure Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
