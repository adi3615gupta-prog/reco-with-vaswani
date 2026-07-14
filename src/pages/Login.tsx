import React, { useState, useEffect } from 'react';
import { getApiBase, getApiHost } from '../lib/api';
import { Server, Laptop, Lock, AlertTriangle, ShieldCheck, DownloadCloud, ArrowRight, Key, Sparkles, AlertCircle, Users } from 'lucide-react';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import LandingPage from './LandingPage';

export default function Login(props: any) {
  const {
    appMode, setAppMode, isAuthenticated,
    visitedLanding, setVisitedLanding, isElectron,
    deviceId, isActivated, setIsActivated,
    serialKey, setSerialKey,
    handleLogin, isServerOffline,
    username, setUsername, password, setPassword,
    rememberMe, setRememberMe, activationInput, setActivationInput,
    activeServers, isLoadingServers, showIpConfig, setShowIpConfig,
    serverIpInput, setServerIpInput,
    handleActivateSubmit, handleLoginSubmit, themeStyles, feedbackList, setFeedbackList,
    serverIpInfo,
    ServerSelector
  } = props;

  const [adminSetupRequired, setAdminSetupRequired] = useState(false);
  const [setupPassword, setSetupPassword] = useState('');
  const [setupPasswordConfirm, setSetupPasswordConfirm] = useState('');

  useEffect(() => {
    let active = true;
    let retryCount = 0;
    const maxRetries = 3;

    const checkAdmin = () => {
      if (!appMode || (appMode === 'server' && !isActivated)) return;

      fetch(`${getApiBase()}/api/admin-exists`)
        .then(res => {
          if (!res.ok) {
            throw new Error(`Server returned ${res.status}`);
          }
          return res.json();
        })
        .then(data => {
          if (!active) return;
          if (data && data.exists === false) {
            setAdminSetupRequired(true);
          } else {
            setAdminSetupRequired(false);
          }
        })
        .catch(err => {
          console.error("Could not check admin status", err);
          if (active && retryCount < maxRetries) {
            retryCount++;
            setTimeout(checkAdmin, 500 * retryCount);
          }
        });
    };

    checkAdmin();

    return () => {
      active = false;
    };
  }, [appMode, isActivated]);

  const handleAdminSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (setupPassword !== setupPasswordConfirm) {
      toast.error("Passwords do not match!");
      return;
    }
    if (setupPassword.length < 5) {
      toast.error("Password must be at least 5 characters.");
      return;
    }
    try {
      const res = await fetch(`${getApiBase()}/api/setup-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: setupPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to setup admin');
      toast.success("Admin setup complete! Logging in...");
      setAdminSetupRequired(false);
      setUsername('admin');
      setPassword(setupPassword);
      // Auto trigger login submit
      setTimeout(() => {
         const form = document.getElementById('login-form') as HTMLFormElement;
         if (form) form.requestSubmit();
      }, 500);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // The layers are exactly as they were in Index.tsx
  
  if (appMode === null && !!(window as any).electronAPI) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: themeStyles }} />
        <div className="dark min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-slate-50 dark:cinematic-bg">
          {/* Cinematic Finance Background */}
          <div className="absolute inset-0 z-0 pointer-events-none w-screen h-screen overflow-hidden">
            <div className="absolute inset-0 finance-grid-bg dark:opacity-100 opacity-50"></div>
            <video src="./finance-bg.mp4" className="absolute inset-0 w-full h-full object-cover opacity-10 dark:opacity-40" autoPlay muted loop playsInline />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-50/50 dark:from-[#090d16]/50 via-slate-50/30 dark:via-[#090d16]/30 to-slate-50/90 dark:to-[#090d16]/90"></div>
          </div>
          
          <div className="relative z-10 w-full max-w-2xl bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-10 backdrop-blur-xl shadow-2xl animate-pop-in">
            <div className="text-center mb-10">
              <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-2">Select Setup Mode</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">Choose how this computer will participate in the RECO network.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <button 
                onClick={async () => {
                  if ((window as any).electronAPI) await (window as any).electronAPI.invoke('set_app_mode', 'server');
                  localStorage.setItem('np_app_mode', 'server');
                  setAppMode('server');
                  toast.success("Mode set to Server.");
                }}
                className="group relative h-48 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 hover:border-purple-500 hover:bg-white dark:hover:bg-slate-900 transition-all flex flex-col items-center justify-center p-6 cursor-pointer overflow-hidden shadow-sm dark:shadow-none"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <Server className="w-12 h-12 text-slate-500 dark:text-slate-400 group-hover:text-purple-500 dark:group-hover:text-purple-400 mb-4 transition-colors" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Set up as Server</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 text-center">I am the main admin. I hold the Master Server Key.</p>
              </button>

              <button 
                onClick={async () => {
                  if ((window as any).electronAPI) await (window as any).electronAPI.invoke('set_app_mode', 'client');
                  localStorage.setItem('np_app_mode', 'client');
                  setAppMode('client');
                  toast.success("Mode set to Client.");
                }}
                className="group relative h-48 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 hover:border-blue-500 hover:bg-white dark:hover:bg-slate-900 transition-all flex flex-col items-center justify-center p-6 cursor-pointer overflow-hidden shadow-sm dark:shadow-none"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <Laptop className="w-12 h-12 text-slate-500 dark:text-slate-400 group-hover:text-blue-500 dark:group-hover:text-blue-400 mb-4 transition-colors" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Connect as Client</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 text-center">I am an employee connecting to the main server.</p>
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // LAYER 0.2: Client Server Connection
  const needsServerSelection = !localStorage.getItem('np_server_ip');
  if (appMode === 'client' && needsServerSelection && !isAuthenticated) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: themeStyles }} />
        <div className="dark min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-slate-50 dark:cinematic-bg">
          {/* Cinematic Finance Background */}
          <div className="absolute inset-0 z-0 pointer-events-none w-screen h-screen overflow-hidden">
            <div className="absolute inset-0 finance-grid-bg dark:opacity-100 opacity-50"></div>
            <video src="./finance-bg.mp4" className="absolute inset-0 w-full h-full object-cover opacity-10 dark:opacity-40" autoPlay muted loop playsInline />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-50/50 dark:from-[#090d16]/50 via-slate-50/30 dark:via-[#090d16]/30 to-slate-50/90 dark:to-[#090d16]/90"></div>
          </div>
          
          <ServerSelector 
            onConnect={(ip) => {
              localStorage.setItem('np_server_ip', ip);
              toast.success("Server Connected! Proceeding to login.");
              setTimeout(() => window.location.reload(), 500);
            }}
            onCancel={(window as any).electronAPI ? async () => {
              await (window as any).electronAPI.invoke('set_app_mode', null);
              localStorage.removeItem('np_app_mode');
              setAppMode(null);
            } : undefined}
          />
        </div>
      </>
    );
  }

  // LAYER 1: Cinematic Landing Page
  if (!visitedLanding) {
    return (
      <LandingPage
        onNext={() => setVisitedLanding(true)}
        feedbackList={feedbackList}
        setFeedbackList={setFeedbackList}
      />
    );
  }

  // LAYER 2: License Activation Security Card (SERVER ONLY)
  if (appMode === 'server' && !isActivated) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: themeStyles }} />
        <div className="dark min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-slate-50 dark:cinematic-bg">
          {/* Cinematic Finance Background */}
          <div className="absolute inset-0 z-0 pointer-events-none w-screen h-screen overflow-hidden">
            <div className="absolute inset-0 finance-grid-bg dark:opacity-100 opacity-50"></div>
            <video src="./finance-bg.mp4" className="absolute inset-0 w-full h-full object-cover opacity-10 dark:opacity-40" autoPlay muted loop playsInline />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-50/50 dark:from-[#090d16]/50 via-slate-50/30 dark:via-[#090d16]/30 to-slate-50/90 dark:to-[#090d16]/90"></div>
          </div>
          
          <div className="relative z-10 w-full max-w-md bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 backdrop-blur-xl shadow-2xl animate-pop-in">
            
            {/* Back to product tour link */}
            <button 
              onClick={() => setVisitedLanding(false)} 
              className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px] mb-6 transition-colors"
            >
               <ArrowRight className="w-3 h-3 transform rotate-180" /> Product Tour
            </button>

            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-tr from-purple-500 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20 mb-4">
                <Key className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">License Verification</h1>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-2">Enter your active RECO WITH VASWANI serial key to authorize this machine.</p>

              {appMode === 'server' && serverIpInfo && (
                <div className="mt-4 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex flex-col items-center gap-1 animate-fade-in">
                  <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5"><Server className="w-3 h-3" /> Server Running on this PC</div>
                  <div className="text-sm font-mono text-slate-900 dark:text-white">IP: {serverIpInfo.ip} | Port: {serverIpInfo.port}</div>
                </div>
              )}
            </div>
            
            <form onSubmit={handleActivateSubmit} className="space-y-6">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 block">Software Serial Key</label>
                <div className="relative">
                  <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="text" 
                    value={activationInput}
                    onChange={(e) => setActivationInput(e.target.value)}
                    placeholder="XXXX-XXXX-XXXX"
                    className="w-full h-12 bg-slate-50 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-700 rounded-xl pl-11 pr-4 text-sm text-slate-900 dark:text-white font-mono uppercase focus:border-purple-500 outline-none transition-colors"
                    required
                  />
                </div>
                <div className="text-[9px] text-slate-500 mt-2 flex items-center gap-1.5 justify-center">
                   <Laptop className="w-3.5 h-3.5" /> ID: {deviceId}
                </div>
              </div>
              
              <button type="submit" className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm transition-all shadow-lg shadow-purple-600/20 hover:scale-[1.02] flex items-center justify-center gap-2 uppercase tracking-wider">
                 Activate Device <Sparkles className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  // LAYER 3: Secure Login Gateway Card
  if (!isAuthenticated) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: themeStyles }} />
        <div className="dark min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-slate-50 dark:cinematic-bg">
          {/* Cinematic Finance Background */}
          <div className="absolute inset-0 z-0 pointer-events-none w-screen h-screen overflow-hidden">
            <div className="absolute inset-0 finance-grid-bg dark:opacity-100 opacity-50"></div>
            <video src="./finance-bg.mp4" className="absolute inset-0 w-full h-full object-cover opacity-10 dark:opacity-40" autoPlay muted loop playsInline />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-50/50 dark:from-[#090d16]/50 via-slate-50/30 dark:via-[#090d16]/30 to-slate-50/90 dark:to-[#090d16]/90"></div>
          </div>
          
          <div className="relative z-10 w-full max-w-md bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 backdrop-blur-xl shadow-2xl animate-pop-in">
            <div className="flex justify-between w-full mb-6">
              {isElectron ? (
                <button 
                  onClick={async () => {
                    if ((window as any).electronAPI) await (window as any).electronAPI.invoke('set_app_mode', null);
                    localStorage.removeItem('np_app_mode');
                    setAppMode(null);
                  }} 
                  className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px] transition-colors"
                >
                   <ArrowRight className="w-3 h-3 transform rotate-180" /> Change Setup Mode
                </button>
              ) : (
                <button 
                  onClick={() => {
                    localStorage.removeItem('np_server_ip');
                    window.location.reload();
                  }} 
                  className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px] transition-colors"
                >
                   <ArrowRight className="w-3 h-3 transform rotate-180" /> Change Server
                </button>
              )}
              {isElectron && (
                <button 
                  onClick={async () => {
                    if(confirm('Are you sure you want to factory reset this installation? This will clear activation.')) {
                      // Reset backend state first (clears SQLite + in-memory flags)
                      try { await fetch(`${getApiBase()}/api/reset-license`, { method: 'POST' }); } catch(e) {}
                      localStorage.clear();
                      sessionStorage.clear();
                      if ((window as any).electronAPI) await (window as any).electronAPI.invoke('set_app_mode', null);
                      window.location.reload();
                    }
                  }} 
                  className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px] transition-colors"
                >
                   <Key className="w-3 h-3" /> Reset License
                </button>
              )}
            </div>
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-16 h-16 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-center overflow-hidden mb-4 shadow-sm dark:shadow-none">
                <img src="./logo.png" alt="Logo" className="w-10 h-10 object-contain dark:invert-0 invert" />
              </div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">RECO WITH VASWANI</h1>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-1">Enterprise-grade offline reporting deck.</p>
              
              {appMode === 'server' && serverIpInfo && (
                <div className="mt-4 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex flex-col items-center gap-1 animate-fade-in">
                  <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5"><Server className="w-3 h-3" /> Server Running on this PC</div>
                  <div className="text-sm font-mono text-slate-900 dark:text-white">IP: {serverIpInfo.ip} | Port: {serverIpInfo.port}</div>
                </div>
              )}
              {appMode === 'client' && (
                <div className={`mt-4 px-4 py-2 border rounded-lg flex flex-col items-center gap-1 animate-fade-in ${isServerOffline ? 'bg-rose-500/10 border-rose-200 dark:border-rose-500/20' : 'bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20'}`}>
                  <div className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${isServerOffline ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                     {isServerOffline ? <AlertCircle className="w-3 h-3" /> : <Server className="w-3 h-3" />}
                     {isServerOffline ? 'Server Offline (Check Connection)' : 'Server Online & Reachable'}
                  </div>
                  <div className="text-sm font-mono text-slate-900 dark:text-white">Target IP: {getApiHost()}</div>
                  {isServerOffline && getApiBase().startsWith('http') && (
                    <div className="flex flex-col items-center gap-1 mt-2 border-t border-slate-200 dark:border-slate-800 pt-2 w-full">
                      <a 
                        href={getApiBase()} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white rounded text-[10px] font-extrabold uppercase tracking-wider transition-colors text-center inline-flex items-center gap-1 shadow-sm"
                      >
                        Bypass Tunnel / SSL Warning
                      </a>
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 text-center max-w-[220px] leading-tight mt-0.5">
                        Click to open server in a new tab and click 'Continue' to authorize browser access.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {adminSetupRequired ? (
              <form onSubmit={handleAdminSetupSubmit} className="space-y-6">
                <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-xl mb-6">
                  <h3 className="text-purple-400 font-bold flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-5 h-5" /> First-Run Setup
                  </h3>
                  <p className="text-sm text-slate-300">
                    Welcome! No admin account exists yet. Please create a secure master password to protect this server.
                  </p>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 block">Master Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="password" 
                      value={setupPassword}
                      onChange={(e) => setSetupPassword(e.target.value)}
                      placeholder="Enter a secure password"
                      className="w-full h-12 bg-slate-50 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-700 rounded-xl pl-11 pr-4 text-sm text-slate-900 dark:text-white focus:border-purple-500 outline-none transition-colors"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 block">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="password" 
                      value={setupPasswordConfirm}
                      onChange={(e) => setSetupPasswordConfirm(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full h-12 bg-slate-50 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-700 rounded-xl pl-11 pr-4 text-sm text-slate-900 dark:text-white focus:border-purple-500 outline-none transition-colors"
                      required
                    />
                  </div>
                </div>
                <button type="submit" className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm transition-all shadow-lg shadow-purple-600/20 hover:scale-[1.02] flex items-center justify-center gap-2 uppercase tracking-wider">
                   Create Admin & Login <Sparkles className="w-4 h-4" />
                </button>
              </form>
            ) : (
            <form id="login-form" onSubmit={handleLoginSubmit} className="space-y-6">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 block">Username</label>
                <div className="relative">
                  <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    className="w-full h-12 bg-slate-50 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-700 rounded-xl pl-11 pr-4 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none transition-colors"
                    required
                  />
                </div>
              </div>
              
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 block">Security Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full h-12 bg-slate-50 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-700 rounded-xl pl-11 pr-4 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none transition-colors"
                    required
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={rememberMe} 
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-blue-500 focus:ring-blue-500 w-4 h-4"
                  />
                  Remember login key
                </label>
                <button 
                  type="button" 
                  onClick={() => setShowIpConfig(!showIpConfig)} 
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-bold uppercase tracking-wider"
                >
                  Configure Server
                </button>
              </div>

              {showIpConfig && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block">Select Global Server or Enter Custom IP</label>
                  
                  {activeServers.length > 0 && (
                    <div className="mb-2">
                      <select 
                        className="w-full h-9 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-xs text-slate-900 dark:text-white outline-none mb-2"
                        onChange={(e) => setServerIpInput(e.target.value)}
                        value={activeServers.find((s: any) => s.public_url === serverIpInput || s.ip === serverIpInput) ? serverIpInput : ""}
                      >
                        <option value="" disabled>Select a CA Office Server...</option>
                        {activeServers.map((s: any) => (
                          <option key={s.id} value={s.public_url || s.ip}>{s.office_id || s.office_name || s.id} - {s.public_url || s.ip}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {isLoadingServers && <div className="text-xs text-slate-500 mb-2 animate-pulse">Loading global servers...</div>}

                  <div className="flex gap-2">
                     <div className="relative flex-1">
                        <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                        <input 
                          type="text" 
                          value={serverIpInput}
                          onChange={(e) => setServerIpInput(e.target.value)}
                          placeholder="Or enter custom IP..."
                          className="w-full h-9 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg pl-9 pr-3 text-xs text-slate-900 dark:text-white outline-none"
                        />
                     </div>
                     <button 
                       type="button" 
                       onClick={() => { const safeSetItem = (window as any).safeSetItem || localStorage.setItem.bind(localStorage); safeSetItem('np_server_ip', serverIpInput.trim(), true); toast.success("Database IP updated!"); }}
                       className="px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg uppercase tracking-wider"
                     >
                       Save
                     </button>
                  </div>
                </div>
              )}
              
              <button type="submit" className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm transition-all shadow-lg shadow-blue-600/20 hover:scale-[1.02] flex items-center justify-center gap-2 uppercase tracking-wider">
                 Access Portal <ArrowRight className="w-4 h-4" />
              </button>
            </form>
            )}
          </div>
        </div>
      </>
    );
  }

  

  return null; // Should not reach here if props logic is sound, or fallback
}
