import { useState, useEffect } from 'react';
import { ShieldCheck, Plus, User, Lock, EyeOff, Eye, ShieldBan, ShieldAlert, Trash2, Activity, Network, MonitorSmartphone, Globe, Clock, Video, MonitorPlay, MessageSquare, FileSearch, CloudDownload, LogOut, X, ArrowRight, Key, Unlock, Zap, Power, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
const getApiHost = () => localStorage.getItem('np_server_ip') || window.location.hostname || '127.0.0.1';

export interface ActiveSession {
  id: string;
  username: string;
  ip: string;
  userAgent: string;
  location?: string;
  loginTime: number;
  lastSeen: number;
}

interface AdminPanelProps {
  handleLogout: () => void;
  setIsAdmin: (isAdmin: boolean) => void;
  setShowHome: (show: boolean) => void;
  themeStyles: string;
}

export default function AdminPanel({ handleLogout, setIsAdmin, setShowHome, themeStyles }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'network' | 'audit' | 'analytics'>('network');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [managedUsers, setManagedUsers] = useState<{id: number, username: string, role: string}[]>([]);
  const [serialKeys, setSerialKeys] = useState<{id: number, key: string, is_active: number, device_id: string | null, key_type: string}[]>([]);
  const [activeSessionsList, setActiveSessionsList] = useState<ActiveSession[]>([]);
  const [bannedUsers, setBannedUsers] = useState<Record<string, boolean>>({});
  const [anydeskIds, setAnydeskIds] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('np_anydesk_ids') || '{}'); } catch { return {}; }
  });
  const [viewingUser, setViewingUser] = useState<string | null>(null);
  const [screenFrame, setScreenFrame] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [moduleUsage, setModuleUsage] = useState<{module_name: string, usage_count: number, is_enabled: number}[]>([]);
  const [isServerOffline, setIsServerOffline] = useState(false);

  const checkServerHealth = () => {
    fetch(`http://${getApiHost()}:3001/api/network-info`, { method: 'GET', signal: AbortSignal.timeout(3000) })
      .then(res => {
         if (res.ok) setIsServerOffline(false);
         else setIsServerOffline(true);
      })
      .catch(() => setIsServerOffline(true));
  };

  const fetchDynamicData = () => {
    fetch(`http://${getApiHost()}:3001/sessions`)
      .then(res => res.json())
      .then(data => {
        setActiveSessionsList(data.sessions || []);
        setBannedUsers(data.banned || {});
      }).catch(() => {});

    fetch(`http://${getApiHost()}:3001/audit`)
      .then(res => res.json())
      .then(data => setAuditLogs(Array.isArray(data) ? data : [])).catch(() => {});

    fetch(`http://${getApiHost()}:3001/api/usage`)
      .then(res => res.json())
      .then(data => setModuleUsage(Array.isArray(data) ? data : [])).catch(() => {});
  };

  const fetchStaticData = () => {
    fetch(`http://${getApiHost()}:3001/api/users`, {
      headers: { 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` }
    })
      .then(res => res.json())
      .then(data => setManagedUsers(Array.isArray(data) ? data : [])).catch(() => {});
      
    fetch(`http://${getApiHost()}:3001/api/keys`, {
      headers: { 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` }
    })
      .then(res => res.json())
      .then(data => setSerialKeys(Array.isArray(data) ? data : [])).catch(() => {});
  };

  useEffect(() => {
    fetchStaticData();
    fetchDynamicData();
    checkServerHealth();
    const interval = setInterval(() => {
       fetchDynamicData();
       checkServerHealth();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let viewerInt: NodeJS.Timeout;
    if (viewingUser) {
       viewerInt = setInterval(() => {
          fetch(`http://${getApiHost()}:3001/screen/view/${viewingUser}`)
          .then(res => res.json())
          .then(data => setScreenFrame(data.image)).catch(() => {});
       }, 1500);
    } else {
       setScreenFrame(null);
    }
    return () => clearInterval(viewerInt);
  }, [viewingUser]);

  const formatUptime = (loginTime: number) => {
    const diff = Math.floor((Date.now() - loginTime) / 1000);
    if (diff < 60) return `${diff} sec`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const parseDevice = (ua: string) => {
    if (ua.includes('Windows')) return 'Windows PC';
    if (ua.includes('Mac')) return 'Mac / Apple';
    return 'Unknown Device';
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const uname = newUsername.toLowerCase().trim();
    if (!uname || !newPassword) return;
    
    try {
      const res = await fetch(`http://${getApiHost()}:3001/api/users`, {
        method: 'POST', 
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('np_token')}`
        },
        body: JSON.stringify({ username: uname, password: newPassword, role: 'user' })
      });
      
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to create user');
        return;
      }

      setNewUsername('');
      setNewPassword('');
      toast.success(`User '${uname}' created successfully!`);
      // Refresh user list immediately
      const res2 = await fetch(`http://${getApiHost()}:3001/api/users`, { headers: { 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` } });
      const updatedUsers = await res2.json();
      if (!res2.ok) {
        toast.error(updatedUsers.error || 'Failed to fetch updated users');
      } else {
        setManagedUsers(Array.isArray(updatedUsers) ? updatedUsers : []);
      }
    } catch (err) {
      toast.error('Network error creating user');
    }
  };

  const handleToggleKey = async (key: string, currentStatus: number) => {
    const newStatus = currentStatus === 1 ? 0 : 1;
    try {
      await fetch(`http://${getApiHost()}:3001/api/keys/${key}`, { 
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` },
        body: JSON.stringify({ is_active: newStatus })
      });
      setSerialKeys(prev => prev.map(k => k.key === key ? { ...k, is_active: newStatus } : k));
      toast.success(`Key ${newStatus === 1 ? 'activated' : 'revoked'}.`);
    } catch (err) { toast.error('Failed to update key status'); }
  };

  const handleUnbindKey = async (key: string) => {
    try {
      await fetch(`http://${getApiHost()}:3001/api/keys/${key}/unbind`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` } });
      setSerialKeys(prev => prev.map(k => k.key === key ? { ...k, device_id: null } : k));
      toast.success(`Key unbound. It can now be used on a new PC.`);
    } catch (err) { toast.error('Failed to unbind key'); }
  };

  const handleRemoveUser = async (uname: string) => {
    try {
      await fetch(`http://${getApiHost()}:3001/api/users/${uname}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` }
      });
      setManagedUsers(prev => prev.filter(u => u.username !== uname));
      toast.success(`User '${uname}' removed successfully!`);
    } catch (err) {
      toast.error('Failed to remove user');
    }
  };

  const handleBanToggle = (uname: string, currentlyBanned: boolean) => {
    const willBan = !currentlyBanned;
    fetch(`http://${getApiHost()}:3001/ban`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: uname, isBanned: willBan })
    }).then(() => {
      setBannedUsers(prev => { const updated = { ...prev }; if (willBan) updated[uname] = true; else delete updated[uname]; return updated; });
      toast.success(`User ${uname} has been ${willBan ? 'restricted' : 'unrestricted'}.`);
    }).catch(console.error);
  };

  const handleAnyDeskAccess = (username: string) => {
    const savedId = anydeskIds[username] || '';
    const anydeskId = window.prompt(`Enter 9-digit AnyDesk ID or Alias for ${username}:`, savedId);
    if (!anydeskId) return;
    if (anydeskId !== savedId) {
      const newIds = { ...anydeskIds, [username]: anydeskId };
      setAnydeskIds(newIds);
      localStorage.setItem('np_anydesk_ids', JSON.stringify(newIds));
    }
    fetch(`http://${getApiHost()}:3001/launch-anydesk`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: anydeskId })
    }).then(() => toast.success(`Launching AnyDesk...`, { description: `Connecting to ${anydeskId}` }))
      .catch(() => toast.error('Failed to launch AnyDesk.'));
  };

  const handleViewScreen = (username: string) => {
    fetch(`http://${getApiHost()}:3001/screen/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    }).then(() => { setViewingUser(username); toast.info(`Requesting screen from ${username}...`); }).catch(console.error);
  };

  const handleSendMessage = (username: string) => {
    const message = window.prompt(`Enter the message to send to ${username}:`);
    if (!message || message.trim() === '') return;
    fetch(`http://${getApiHost()}:3001/message/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, message })
    }).then(res => { if (res.ok) toast.success(`Message sent to ${username}.`); else throw new Error('Error.'); })
      .catch(() => toast.error('Failed to send message.'));
  };

  const handleExportAuditHistory = () => {
    if (auditLogs.length === 0) return toast.error('No activity to export.');
    let csv = "Date/Time,User,Company Name,Reconciliation Type,Records Processed,Issues Found\n";
    auditLogs.forEach(log => {
      const time = new Date(log.timestamp).toLocaleString().replace(/,/g, '');
      csv += `${time},"${log.username}","${log.companyName}",${log.mode === 'input' ? 'Purchase' : 'Sales'},${log.records || 0},${log.issues || 0}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reconciliation_Audit_Log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Audit history exported successfully!');
  };

  const handleResetUsage = async (module_name: string) => {
    try {
      await fetch(`http://${getApiHost()}:3001/api/usage/reset`, { 
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` },
        body: JSON.stringify({ module_name })
      });
      fetchDynamicData();
      toast.success(`Reset usage for ${module_name}`);
    } catch (err) { toast.error('Failed to reset'); }
  };

  const handleToggleModule = async (module_name: string, current_enabled: number) => {
    try {
      await fetch(`http://${getApiHost()}:3001/api/usage/toggle`, { 
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` },
        body: JSON.stringify({ module_name, is_enabled: current_enabled === 1 ? 0 : 1 })
      });
      fetchDynamicData();
      toast.success(`Module ${current_enabled === 1 ? 'Disabled' : 'Enabled'}: ${module_name}`);
    } catch (err) { toast.error('Failed to toggle module'); }
  };

  // Compute Analytics Data
  const userActivity = auditLogs.reduce((acc, log) => {
    acc[log.username] = (acc[log.username] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const mostActiveUsersData = Object.entries(userActivity).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);

  const moduleDistribution = auditLogs.reduce((acc, log) => {
    const modName = log.mode === 'input' ? 'Purchase' : log.mode === 'output' ? 'Sales' : log.mode || 'Other';
    acc[modName] = (acc[modName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const moduleDistributionData = Object.entries(moduleDistribution).map(([name, value]) => ({ name, value }));
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

  const peakTimes = auditLogs.reduce((acc, log) => {
    const hour = new Date(log.timestamp).getHours();
    acc[hour] = (acc[hour] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  const peakUsageData = Array.from({ length: 24 }).map((_, i) => ({
    time: `${i.toString().padStart(2, '0')}:00`,
    activity: peakTimes[i] || 0
  }));

  return (
    <>
    <style dangerouslySetInnerHTML={{__html: themeStyles}} />
    <div className="dark min-h-screen flex flex-col items-center justify-center p-6 text-slate-100 font-sans antialiased relative overflow-hidden global-bg">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none"></div>
      
      <button onClick={handleLogout} className="absolute top-8 right-8 text-slate-400 hover:text-white flex items-center gap-2 font-bold uppercase tracking-wider text-xs transition-colors z-50">
        Log Out <LogOut className="w-4 h-4" />
      </button>
      <div className="z-10 w-full max-w-6xl flex flex-col items-center animate-slow-reveal">
        <div className="mb-2 flex flex-col items-center justify-center">
          <ShieldCheck className="w-16 h-16 text-blue-500 drop-shadow-xl mb-4" />
          <div className={`px-4 py-1.5 rounded-full border flex items-center gap-2 transition-colors ${isServerOffline ? 'bg-rose-500/10 border-rose-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
             {isServerOffline ? <AlertCircle className="w-4 h-4 text-rose-400" /> : <Server className="w-4 h-4 text-emerald-400" />}
             <span className={`text-[10px] font-bold uppercase tracking-widest ${isServerOffline ? 'text-rose-400' : 'text-emerald-400'}`}>
                {isServerOffline ? 'System Offline (Check Host)' : 'System Online & Healthy'}
             </span>
          </div>
        </div>
        <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
          <div className="lg:col-span-1 space-y-6">
            <form onSubmit={handleAddUser} className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-xl shadow-2xl">
              <div className="text-center mb-6"><h2 className="text-xl font-bold text-white mb-1 tracking-tight">Access Control</h2><p className="text-xs text-slate-400 font-medium">Create network accounts</p></div>
              <div className="space-y-4 mb-6">
                <div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" /><input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Username" className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 text-sm text-white focus:border-blue-500 outline-none" required /></div>
                <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" /><input type={showNewPass ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Password" className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-10 text-sm text-white focus:border-blue-500 outline-none" required /><button type="button" onClick={() => setShowNewPass(!showNewPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">{showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div>
              </div>
              <button type="submit" className="w-full h-10 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2">Create Account <Plus className="w-4 h-4" /></button>
            </form>
            {managedUsers.length > 0 && (
              <div className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-xl shadow-2xl">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Managed Users</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {managedUsers.map(({ username: uname, role }) => (
                    <div key={uname} className="flex items-center justify-between bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/50"><span className="text-sm font-bold text-slate-200">{uname}</span><div className="flex items-center gap-2"><button onClick={() => handleBanToggle(uname, !!bannedUsers[uname])} className={`p-1.5 rounded-md transition-colors ${bannedUsers[uname] ? 'text-rose-400 bg-rose-500/10 hover:bg-rose-500/20' : 'text-slate-500 hover:text-amber-400 hover:bg-amber-500/10'}`} title={bannedUsers[uname] ? "Unrestrict User" : "Restrict User"}>{bannedUsers[uname] ? <ShieldBan className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}</button><button onClick={() => handleRemoveUser(uname)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors" title="Delete User"><Trash2 className="w-4 h-4" /></button></div></div>
                  ))}
                </div>
              </div>
            )}
            
            {/* LICENSE MANAGEMENT CARD */}
            <div className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-xl shadow-2xl mt-6">
              <div className="text-center mb-5">
                 <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center justify-center gap-2">
                    <Key className="w-4 h-4 text-amber-400" /> License Management
                 </h3>
                 <p className="text-[10px] text-rose-400 font-bold uppercase tracking-widest mt-1.5">Strict Limit: 1 Server, 5 Clients</p>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {serialKeys.map(({ key, is_active, device_id, key_type }) => (
                  <div key={key} className="flex items-center justify-between bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/50">
                     <span className={`text-xs font-mono font-bold tracking-wider flex items-center gap-2 ${is_active ? 'text-emerald-400' : 'text-slate-500 line-through'}`}>
                       <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase">{key_type}</span>
                       {key}
                       {device_id && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 uppercase tracking-widest">In Use</span>}
                     </span>
                     <div className="flex items-center gap-2">
                        {device_id && <button onClick={() => handleUnbindKey(key)} className="p-1.5 rounded-md transition-colors text-blue-400 hover:bg-blue-500/10" title="Unbind PC"><Unlock className="w-3.5 h-3.5" /></button>}
                        <button onClick={() => handleToggleKey(key, is_active)} className={`p-1.5 rounded-md transition-colors ${is_active ? 'text-amber-400 hover:bg-amber-500/10' : 'text-emerald-400 hover:bg-emerald-500/10'}`} title={is_active ? "Revoke Key" : "Activate Key"}>{is_active ? <ShieldBan className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}</button>
                     </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SOFTWARE UPDATES CARD */}
            <div className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-xl shadow-2xl mt-6">
              <div className="text-center mb-4">
                 <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 text-purple-400" /> Software Updates
                 </h3>
                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1.5">Current Version: v1.4.33</p>
              </div>
              <button 
                type="button" 
                onClick={async () => {
                  if ((window as any).electronAPI) {
                    toast.info("Scanning for updates...", { description: "Checking for new releases on GitHub." });
                    const res = await (window as any).electronAPI.invoke('check_for_updates');
                    if (res) {
                      toast.success("Scanning complete.", { description: "An update check has been triggered." });
                    } else {
                      toast.info("Up to Date", { description: "You are running the latest version." });
                    }
                  } else {
                    toast.error("Updates are only supported in desktop mode.");
                  }
                }}
                className="w-full h-10 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                Scan & Install Updates <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-2 gap-4">
               <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-center gap-4"><div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center"><Activity className="w-6 h-6" /></div><div><p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Active Connections</p><p className="text-3xl font-black text-white">{activeSessionsList.length}</p></div></div>
               <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-center gap-4"><div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center"><ShieldBan className="w-6 h-6" /></div><div><p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Restricted Users</p><p className="text-3xl font-black text-white">{Object.keys(bannedUsers).length}</p></div></div>
            </div>
            
            {/* TABS CONTAINER */}
            <div className="w-full flex gap-2 mb-4 bg-slate-900/60 p-1 rounded-xl backdrop-blur-xl border border-slate-800">
               <button onClick={() => setActiveTab('network')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'network' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}><Network className="w-4 h-4" /> Network Monitor</button>
               <button onClick={() => setActiveTab('audit')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'audit' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}><FileSearch className="w-4 h-4" /> Audit Trail</button>
               <button onClick={() => setActiveTab('analytics')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'analytics' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}><Activity className="w-4 h-4" /> Dashboard Analytics</button>
            </div>

            {activeTab === 'network' && (
              <div className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl animate-pop-in">
                 <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/30"><h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2"><Network className="w-4 h-4 text-blue-400" /> Network Activity Monitor</h3></div>
                 <div className="overflow-x-auto">
                    <table className="w-full text-left"><thead className="bg-slate-950/50 text-xs font-bold text-slate-400 uppercase tracking-wider"><tr><th className="px-5 py-3">User</th><th className="px-5 py-3">IP Address</th><th className="px-5 py-3">System / Location</th><th className="px-5 py-3">Usage Time</th><th className="px-5 py-3">Action</th></tr></thead>
                       <tbody className="divide-y divide-slate-800/50 text-sm">
                          {activeSessionsList.length === 0 ? (<tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500 italic">No external users currently connected.</td></tr>) : (activeSessionsList.map(session => (
                             <tr key={session.id} className="hover:bg-slate-800/30 transition-colors"><td className="px-5 py-4 font-bold text-white flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> {session.username}</td><td className="px-5 py-4 text-blue-300 font-mono text-xs">{session.ip}</td><td className="px-5 py-4"><div className="flex flex-col gap-1"><span className="flex items-center gap-1.5 text-slate-300 text-xs"><MonitorSmartphone className="w-3 h-3 text-slate-500" /> {parseDevice(session.userAgent)}</span><span className="flex items-center gap-1.5 text-slate-500 text-[10px]"><Globe className="w-3 h-3 shrink-0" /> {session.location || 'Local Network (VPN)'}</span></div></td><td className="px-5 py-4 text-emerald-400 font-medium text-xs flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {formatUptime(session.loginTime)}</td><td className="px-5 py-4 flex items-center gap-2"><button onClick={() => handleViewScreen(session.username)} className="px-3 py-1.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500 hover:text-white transition-colors text-xs font-bold tracking-wider uppercase flex items-center gap-1.5" title="View Live Screen"><Video className="w-3.5 h-3.5" /> View</button><button onClick={() => handleAnyDeskAccess(session.username)} className="px-3 py-1.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500 hover:text-white transition-colors text-xs font-bold tracking-wider uppercase flex items-center gap-1.5" title="Full Remote Control"><MonitorPlay className="w-3.5 h-3.5" /> Control</button><button onClick={() => handleSendMessage(session.username)} className="px-3 py-1.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500 hover:text-white transition-colors text-xs font-bold tracking-wider uppercase flex items-center gap-1.5" title="Send a popup message"><MessageSquare className="w-3.5 h-3.5" /> Message</button><button onClick={() => handleBanToggle(session.username, false)} className="px-3 py-1.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-colors text-xs font-bold tracking-wider uppercase">Disconnect</button></td></tr>
                          )))}
                       </tbody></table>
                 </div>
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl animate-pop-in">
                 <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/30"><h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2"><FileSearch className="w-4 h-4 text-purple-400" /> Reconciliation History</h3><button onClick={handleExportAuditHistory} className="px-3 py-1.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500 hover:text-white transition-colors text-xs font-bold tracking-wider uppercase flex items-center gap-1.5" title="Export to CSV"><CloudDownload className="w-3.5 h-3.5" /> Export Log</button></div>
                 <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-left"><thead className="sticky top-0 bg-slate-950/90 backdrop-blur-md z-10 text-xs font-bold text-slate-400 uppercase tracking-wider"><tr><th className="px-5 py-3">Time</th><th className="px-5 py-3">User</th><th className="px-5 py-3">Company</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Records Processed</th><th className="px-5 py-3">Issues Found</th></tr></thead>
                       <tbody className="divide-y divide-slate-800/50 text-sm">
                          {auditLogs.length === 0 ? (<tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500 italic">No reconciliation activity recorded yet.</td></tr>) : (auditLogs.map(log => (<tr key={log.id} className="hover:bg-slate-800/30 transition-colors"><td className="px-5 py-3 text-xs text-slate-400">{new Date(log.timestamp).toLocaleString()}</td><td className="px-5 py-3 font-bold text-white flex items-center gap-2"><User className="w-3.5 h-3.5 text-slate-500"/> {log.username}</td><td className="px-5 py-3 text-blue-300 font-medium">{log.companyName}</td><td className="px-5 py-3"><span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 uppercase tracking-widest">{log.mode === 'input' ? 'Purchase' : log.mode === 'output' ? 'Sales' : log.mode}</span></td><td className="px-5 py-3 text-slate-300 font-mono">{log.records}</td><td className="px-5 py-3 text-rose-400 font-mono font-medium">{log.issues}</td></tr>)))}
                       </tbody></table>
                 </div>
              </div>
            )}

            {activeTab === 'analytics' && (
              <div className="w-full space-y-6 animate-pop-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Module Distribution */}
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-xl shadow-2xl hover:scale-[1.02] transition-transform duration-300">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4"><PieChart className="w-4 h-4 text-emerald-400" /> Module Usage</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={moduleDistributionData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                            {moduleDistributionData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                          </Pie>
                          <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff' }} itemStyle={{ color: '#fff' }} />
                          <Legend wrapperStyle={{ fontSize: '12px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Most Active Users */}
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-xl shadow-2xl hover:scale-[1.02] transition-transform duration-300">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4"><User className="w-4 h-4 text-blue-400" /> Top Users</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={mostActiveUsersData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                          <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                          <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} width={80} />
                          <RechartsTooltip cursor={{fill: '#1e293b'}} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff' }} />
                          <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Peak Usage Times */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-xl shadow-2xl hover:scale-[1.02] transition-transform duration-300">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4"><Clock className="w-4 h-4 text-amber-400" /> Peak Usage Times (24h)</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={peakUsageData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickMargin={10} minTickGap={30} />
                        <YAxis stroke="#94a3b8" fontSize={12} />
                        <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff' }} />
                        <Line type="monotone" dataKey="activity" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#0f172a', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
            
            <div className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl mt-6">
                 <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/30">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-400" /> Module Usage Limits (25 Max)</h3>
                 </div>
                 <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {['TallyConverter', 'Consolidator', 'RecoEngine', 'OCR', 'Returns'].map(mod => {
                       const usageObj = moduleUsage.find(u => u.module_name === mod);
                       const usage = usageObj?.usage_count || 0;
                       const isEnabled = usageObj?.is_enabled !== undefined ? usageObj.is_enabled : 1;
                       const pct = Math.min((usage / 25) * 100, 100);
                       return (
                          <div key={mod} className={`bg-slate-950/50 border ${isEnabled ? 'border-slate-800/50' : 'border-rose-900/50'} p-4 rounded-xl relative overflow-hidden transition-colors`}>
                             <div className="flex justify-between items-center mb-2">
                                <span className={`font-bold text-sm ${isEnabled ? 'text-slate-200' : 'text-slate-500 line-through'}`}>{mod}</span>
                                <div className="flex items-center gap-2">
                                   {!isEnabled && <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 uppercase tracking-widest font-bold">Disabled</span>}
                                   <span className={`text-xs font-mono font-bold ${usage >= 25 ? 'text-rose-400' : 'text-emerald-400'}`}>{usage} / 25</span>
                                </div>
                             </div>
                             <div className={`w-full h-1.5 rounded-full overflow-hidden mb-3 ${isEnabled ? 'bg-slate-800' : 'bg-slate-900'}`}>
                                <div className={`h-full ${usage >= 25 ? 'bg-rose-500' : (isEnabled ? 'bg-emerald-500' : 'bg-slate-600')}`} style={{ width: `${pct}%` }}></div>
                             </div>
                             <div className="flex gap-2">
                                <button onClick={() => handleToggleModule(mod, isEnabled)} className={`w-full py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${isEnabled ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white'}`}>
                                   <Power className="w-3.5 h-3.5" />
                                   <span className="text-[10px] font-bold uppercase tracking-wider">{isEnabled ? 'Disable Module' : 'Enable Module'}</span>
                                </button>
                             </div>
                          </div>
                       )
                    })}
                 </div>
             </div>

          </div>
        </div>
      </div>
      {viewingUser && (
        <div className="fixed inset-0 z-[200] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6"><div className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden w-full max-w-6xl shadow-2xl flex flex-col animate-pop-in"><div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950"><h3 className="text-white font-bold flex items-center gap-3"><Video className="w-5 h-5 text-blue-400" /> Live Screen Viewer: <span className="text-blue-400">{viewingUser}</span></h3><button onClick={() => setViewingUser(null)} className="text-slate-400 hover:text-white p-1 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"><X className="w-5 h-5" /></button></div><div className="bg-black flex-1 min-h-[70vh] flex items-center justify-center relative overflow-hidden">{screenFrame ? (<img src={screenFrame} alt="Live Screen" className="w-full h-full object-contain" />) : (<div className="text-slate-400 flex flex-col items-center gap-4"><div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div><p className="font-medium animate-pulse">Waiting for {viewingUser} to accept screen share prompt...</p><p className="text-xs text-slate-600">They will see a browser pop-up asking to share their screen.</p></div>)}</div></div></div>
      )}
      <button type="button" onClick={() => { setIsAdmin(false); setShowHome(true); }} className="mt-8 text-sm text-blue-400 hover:text-blue-300 transition-colors font-bold uppercase tracking-wider flex items-center gap-2">Proceed to Application <ArrowRight className="w-4 h-4" /></button>
    </div>
    </>
  );
}