import { useState } from 'react';
import { ArrowLeft, FileSpreadsheet, FileJson, CheckCircle2, ShieldAlert, GitCompare, UploadCloud, FileText, Send, LayoutTemplate, Copy } from 'lucide-react';
import { toast } from 'sonner';

const getApiHost = () => localStorage.getItem('np_server_ip') || window.location.hostname || '127.0.0.1';

interface ReturnsDashboardProps {
  onBack: () => void;
}

export default function ReturnsDashboard({ onBack }: ReturnsDashboardProps) {
  const [activeTab, setActiveTab] = useState<'import' | 'validate' | 'compare' | 'gstr1' | 'gstr3b'>('import');
  const [isProcessing, setIsProcessing] = useState(false);

  const triggerMockApi = async (endpoint: string, successMsg: string, loadingMsg: string) => {
    try {
      const uRes = await fetch(`http://${getApiHost()}:3001/api/usage/increment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` },
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
      const res = await fetch(`http://${getApiHost()}:3001/api/returns/${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` }
      });
      const data = await res.json();
      if (res.ok && data.success) toast.success("Success", { id, description: successMsg });
      else throw new Error("Failed");
    } catch (e) {
      toast.error("Operation Failed", { id, description: "Ensure the local server is running and authenticated." });
    }
    setIsProcessing(false);
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
            className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'
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

      {/* TAB CONTENT: GSTR-1 FILING */}
      {activeTab === 'gstr1' && (
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
      {activeTab === 'gstr3b' && (
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
    </div>
  );
}