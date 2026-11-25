import { useState, useEffect, useCallback } from 'react';
import { Power, Key, ShieldCheck, Activity, Lock, Users, UserPlus, FileText, Download, Building, Plus, Laptop, Ban, WifiOff, Trash2, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import './index.css';

const GATEWAY_SUPER_ADMIN_URL = 'https://vaswani-license-gateway.vercel.app/superAdmin';

function App() {
  const [adminToken, setAdminToken] = useState<string>(() => sessionStorage.getItem('vaswani_sa_token') || '');
  const isAuthenticated = Boolean(adminToken);
  const [password, setPassword] = useState('');
  
  const [offices, setOffices] = useState<any[]>([]);
  const [activeOffice, setActiveOffice] = useState<string>('');
  const [newOfficeName, setNewOfficeName] = useState('');

  const [modules, setModules] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [collapsedKeys, setCollapsedKeys] = useState<Record<string, boolean>>({});
  const [networkUsers, setNetworkUsers] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [recoHistory, setRecoHistory] = useState<any[]>([]);

  const [newName, setNewName] = useState('');
  const [newDesignation, setNewDesignation] = useState('');
  const [newDepartment, setNewDepartment] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');

  const callSuperAdmin = useCallback(async (subAction: string, payload: Record<string, any> = {}, overrideToken?: string) => {
    const tok = overrideToken ?? adminToken;
    const res = await fetch(GATEWAY_SUPER_ADMIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(tok ? { 'x-super-admin-token': tok } : {})
      },
      body: JSON.stringify({ subAction, ...payload })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && subAction !== 'login') {
      sessionStorage.removeItem('vaswani_sa_token');
      setAdminToken('');
      throw new Error(data.error || 'Session expired. Please log in again.');
    }
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }, [adminToken]);

  const refreshOffices = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await callSuperAdmin('listOffices');
      const officeData = Array.isArray(data.offices) ? data.offices : [];
      setOffices(officeData);
      if (officeData.length > 0 && !activeOffice) {
        setActiveOffice(officeData[0].id);
      }
    } catch (err) {
      console.error('Failed to load offices:', err);
    }
  }, [isAuthenticated, activeOffice, callSuperAdmin]);

  const refreshOfficeData = useCallback(async () => {
    if (!isAuthenticated || !activeOffice) return;
    try {
      const data = await callSuperAdmin('getOfficeData', { officeId: activeOffice });
      setModules(Array.isArray(data.modules) ? data.modules : []);
      setKeys(Array.isArray(data.keys) ? data.keys : []);
      setNetworkUsers(Array.isArray(data.networkUsers) ? data.networkUsers : []);
      setActivityLogs(Array.isArray(data.activityLogs) ? data.activityLogs : []);
      setRecoHistory(Array.isArray(data.recoHistory) ? data.recoHistory : []);
    } catch (err) {
      console.error('Failed to load office data:', err);
    }
  }, [isAuthenticated, activeOffice, callSuperAdmin]);

  // 1. Fetch Offices & Poll
  useEffect(() => {
    if (!isAuthenticated) return;
    refreshOffices();
    const timer = setInterval(refreshOffices, 15000);
    return () => clearInterval(timer);
  }, [isAuthenticated, refreshOffices]);

  // 2. Fetch Data for Active Office & Poll
  useEffect(() => {
    if (!isAuthenticated || !activeOffice) return;
    refreshOfficeData();
    const timer = setInterval(refreshOfficeData, 10000);
    return () => clearInterval(timer);
  }, [isAuthenticated, activeOffice, refreshOfficeData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await callSuperAdmin('login', { password }, '');
      if (data.token) {
        sessionStorage.setItem('vaswani_sa_token', data.token);
        setAdminToken(data.token);
        setPassword('');
      }
    } catch (err: any) {
      alert(err.message || 'Invalid Admin Password');
    }
  };

  const createOffice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOfficeName) return;
    try {
      const res = await callSuperAdmin('createOffice', { name: newOfficeName });
      const createdName = newOfficeName;
      setNewOfficeName('');
      await refreshOffices();
      setActiveOffice(res.officeId);
      alert(`New Office "${createdName}" Created with default keys and modules!`);
    } catch (err: any) {
      alert('Failed to create office: ' + err.message);
    }
  };

  const createNetworkAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword || !activeOffice) return;

    const cleanUsername = newUsername.toLowerCase().trim();
    if (networkUsers.some((u: any) => String(u.username || '').toLowerCase().trim() === cleanUsername)) {
      alert(`User ID "@${cleanUsername}" already exists in ${activeOffice}.`);
      return;
    }

    const finalName = newName.trim() || newUsername.trim();
    const finalDesignation = newDesignation.trim() || (newRole === 'Senior Auditor' ? 'Senior Auditor' : newRole === 'Admin' ? 'Administrator' : 'Article Assistant');
    const finalDepartment = newDepartment.trim() || 'Audit & Assurance';

    try {
      await callSuperAdmin('createUser', {
        officeId: activeOffice,
        name: finalName,
        designation: finalDesignation,
        department: finalDepartment,
        username: cleanUsername,
        password: newPassword,
        role: newRole
      });
      setNewName('');
      setNewDesignation('');
      setNewDepartment('');
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      await refreshOfficeData();
      alert(`User account created: "${finalName}" (${finalDesignation} • ${finalDepartment}) for Office: ${activeOffice}`);
    } catch (err: any) {
      alert('Failed to create user: ' + err.message);
    }
  };

  const updateKeySeats = async (keyId: string, currentSeats: number, delta: number) => {
    const updated = Math.max(1, (Number(currentSeats) || 1) + delta);
    try {
      await callSuperAdmin('updateKeySeats', { officeId: activeOffice, keyId, maxDevices: updated });
      await refreshOfficeData();
    } catch (err: any) {
      alert("Failed to update seat limit: " + err.message);
    }
  };

  const createMultiPcKey = async () => {
    if (!activeOffice) return;
    const seatsStr = prompt("Enter allowed number of PCs for this Serial Key:", "5");
    if (!seatsStr) return;
    const seats = Math.max(1, parseInt(seatsStr, 10) || 5);
    try {
      const res = await callSuperAdmin('createMultiPcKey', { officeId: activeOffice, seats });
      await refreshOfficeData();
      alert(`New Multi-PC Serial Key created: ${res.key} (${seats} PCs allowed)!`);
    } catch (err: any) {
      alert("Failed to create key: " + err.message);
    }
  };

  const toggleNetworkUser = async (userId: string, currentStatus: number) => {
    await callSuperAdmin('toggleUser', { officeId: activeOffice, userId, currentStatus });
    await refreshOfficeData();
  };

  const unbindNetworkUser = async (userId: string) => {
    if (confirm("Release active session for this user? This will mark them offline and allow them to log in on any computer immediately.")) {
      await callSuperAdmin('unbindUser', { officeId: activeOffice, userId });
      await refreshOfficeData();
    }
  };

  const deleteNetworkUser = async (userId: string) => {
    if (confirm("WARNING: Are you sure you want to completely delete this user? This cannot be undone.")) {
      try {
        await callSuperAdmin('deleteUser', { officeId: activeOffice, userId });
        await refreshOfficeData();
        alert("User permanently deleted!");
      } catch (err: any) {
        alert("Failed to delete: " + err.message);
      }
    }
  };

  const deleteOffice = async (officeId: string) => {
    if (confirm(`WARNING: Are you sure you want to permanently delete Office: ${officeId}?\nThis will completely WIPE all associated keys, users, and usage limits across all networks!`)) {
      try {
        await callSuperAdmin('deleteOffice', { officeId });
        if (activeOffice === officeId) setActiveOffice('');
        await refreshOffices();
        alert("Office permanently deleted. All connected PCs will factory reset within 60 seconds.");
      } catch (err: any) {
        alert("Failed to delete: " + err.message);
      }
    }
  };

  const triggerKillSwitch = async (officeId: string) => {
    if (confirm(`CRITICAL WARNING: Are you sure you want to trigger the KILL SWITCH for ${officeId}?\nThis will permanently wipe their software directory and all databases. This CANNOT be undone.`)) {
      if (prompt("Type 'WIPE' to confirm:") === 'WIPE') {
        try {
          await callSuperAdmin('triggerKillSwitch', { officeId });
          alert("KILL SWITCH TRIGGERED. The client's software will be wiped within 5 seconds.");
        } catch (err: any) {
          alert("Failed to trigger Kill Switch: " + err.message);
        }
      }
    }
  };

  const toggleModule = async (moduleId: string, currentStatus: number) => {
    await callSuperAdmin('toggleModule', { officeId: activeOffice, moduleId, currentStatus });
    await refreshOfficeData();
  };
  
  const resetModule = async (moduleId: string) => {
    if (confirm(`Reset usage count for ${moduleId}?`)) {
      await callSuperAdmin('resetModule', { officeId: activeOffice, moduleId });
      await refreshOfficeData();
    }
  };

  const getBoundDeviceIds = (keyData: any): string[] => {
    if (Array.isArray(keyData?.bound_devices)) return keyData.bound_devices;
    return keyData?.device_id ? [keyData.device_id] : [];
  };

  const removeDeviceFromKey = async (keyData: any, deviceId: string) => {
    const label = keyData.devices_info?.[deviceId]?.pc_name || deviceId;
    if (!confirm(`Remove PC "${label}" from Serial Key ${keyData.key}?\n\nThis will unbind this computer and free 1 PC seat immediately.`)) return;

    try {
      await callSuperAdmin('removeDeviceFromKey', { officeId: activeOffice, keyId: keyData.id, deviceId });
      await refreshOfficeData();
    } catch (err: any) {
      alert("Failed to remove PC: " + err.message);
    }
  };

  const toggleRestrictDevice = async (keyData: any, deviceId: string, currentlyRestricted: boolean) => {
    const label = keyData.devices_info?.[deviceId]?.pc_name || deviceId;
    const actionWord = currentlyRestricted ? 'Unrestrict (Allow)' : 'Restrict (Block)';
    if (!confirm(`${actionWord} PC "${label}" on Serial Key ${keyData.key}?`)) return;

    try {
      await callSuperAdmin('toggleRestrictDevice', {
        officeId: activeOffice,
        keyId: keyData.id,
        deviceId,
        nextRestricted: !currentlyRestricted
      });
      await refreshOfficeData();
    } catch (err: any) {
      alert("Failed to update PC restriction: " + err.message);
    }
  };

  const makeDeviceOffline = async (keyData: any, deviceId: string) => {
    const label = keyData.devices_info?.[deviceId]?.pc_name || deviceId;
    if (!confirm(`Make PC "${label}" Offline?\n\nThis will end its active session and log out any active user on this PC without removing its license seat.`)) return;

    try {
      await callSuperAdmin('makeDeviceOffline', { officeId: activeOffice, keyId: keyData.id, deviceId });
      await refreshOfficeData();
    } catch (err: any) {
      alert("Failed to make PC offline: " + err.message);
    }
  };

  const unbindKey = async (keyData: any) => {
    if (confirm(`Are you sure you want to unbind all PCs from this key? This will clear all bound PCs and allow new computers to activate up to the seat limit.`)) {
      await callSuperAdmin('unbindKey', { officeId: activeOffice, keyId: keyData.id });
      await refreshOfficeData();
    }
  };

  const toggleKey = async (keyId: string, currentStatus: number) => {
    await callSuperAdmin('toggleKey', { officeId: activeOffice, keyId, currentStatus });
    await refreshOfficeData();
  };

  const clearActivityLogs = async () => {
    if (!activeOffice) return;
    if (confirm("Are you sure you want to clear all network activity logs for this office?")) {
      try {
        await callSuperAdmin('clearActivityLogs', { officeId: activeOffice });
        await refreshOfficeData();
        alert("Network activity logs cleared successfully.");
      } catch (err: any) {
        alert("Failed to clear logs: " + err.message);
      }
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="login-wrap">
        <div className="shield-icon">
          <ShieldCheck size={64} color="#3B82F6" />
        </div>
        <div className="panel login-panel">
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>Super Admin Access</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>Enter master credentials</p>
          </div>
          <form onSubmit={handleLogin}>
             <div style={{ position: 'relative' }}>
               <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '1rem' }} />
               <input 
                 type="password" 
                 placeholder="Password" 
                 className="input-field"
                 style={{ paddingLeft: '2.5rem' }}
                 value={password} 
                 onChange={e => setPassword(e.target.value)} 
               />
             </div>
             <button type="submit" className="btn-blue">
               Authenticate
             </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container" style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '2rem', maxWidth: '1560px' }}>
      
      {/* LEFT SIDEBAR (TENANT SELECTOR) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div className="shield-icon" style={{ width: '48px', height: '48px' }}>
            <ShieldCheck size={24} color="#3B82F6" />
            </div>
            <div>
                <h1 style={{ fontSize: '1rem', fontWeight: 800, color: 'white' }}>SAAS ADMIN</h1>
                <p style={{ fontSize: '0.65rem', color: 'var(--accent-green)' }}>SUPERUSER PORTAL</p>
            </div>
        </div>

        <div className="panel" style={{ margin: 0, padding: '1rem' }}>
            <div className="panel-header" style={{ marginBottom: '1rem' }}>
              <Building size={16} color="var(--accent-blue)" />
              <span style={{ fontSize: '0.85rem' }}>CA OFFICES</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {offices.map(off => (
                    <button 
                        key={off.id}
                        onClick={() => setActiveOffice(off.id)}
                        style={{ 
                            padding: '0.75rem', 
                            textAlign: 'left',
                            backgroundColor: activeOffice === off.id ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-panel)',
                            border: `1px solid ${activeOffice === off.id ? 'var(--accent-blue)' : 'var(--border-panel)'}`,
                            color: activeOffice === off.id ? 'white' : 'var(--text-muted)',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: 'pointer'
                        }}
                    >
                        {off.name}
                    </button>
                ))}
                {offices.length === 0 && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No offices created yet.</p>}
            </div>

            <form onSubmit={createOffice} style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                    type="text" 
                    placeholder="New Office Name" 
                    className="input-field"
                    style={{ marginBottom: 0, padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}
                    value={newOfficeName} 
                    onChange={e => setNewOfficeName(e.target.value)} 
                />
                <button type="submit" className="btn-blue" style={{ width: 'auto', padding: '0 0.75rem' }}>
                    <Plus size={16} />
                </button>
            </form>
        </div>
      </div>

      {/* RIGHT MAIN CONTENT (TENANT DATA) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        <div style={{ backgroundColor: 'var(--bg-card)', padding: '1rem 1.5rem', borderRadius: '8px', border: '1px solid var(--border-card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {activeOffice || 'NO OFFICE SELECTED'}
                  {activeOffice && (
                    <>
                      <button onClick={() => deleteOffice(activeOffice)} style={{ padding: '0.25rem 0.5rem', backgroundColor: 'var(--accent-red)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', marginLeft: '1rem' }}>
                        Delete Office
                      </button>
                      <button onClick={() => triggerKillSwitch(activeOffice)} style={{ padding: '0.25rem 0.5rem', backgroundColor: '#ef4444', color: 'white', border: '2px solid white', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 900, cursor: 'pointer', marginLeft: '0.5rem' }}>
                        ⚡ TRIGGER KILL SWITCH
                      </button>
                    </>
                  )}
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Viewing isolated data for this CA Office</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
                 <div style={{ textAlign: 'center', backgroundColor: 'var(--bg-panel)', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--border-panel)' }}>
                     <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700 }}>ACTIVE CONNECTIONS</div>
                     <div style={{ fontSize: '1.25rem', color: 'var(--accent-green)', fontWeight: 800 }}>{networkUsers.filter(u => u.status === 'online').length || 0}</div>
                 </div>
            </div>
        </div>

        {activeOffice && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(420px, 1.35fr) 2fr', gap: '1.5rem', alignItems: 'start' }}>
                
                {/* LEFT COLUMN */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                {/* ACCESS CONTROL */}
                <div className="panel" style={{ margin: 0 }}>
                    <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white' }}>Access Control</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>Create network accounts</p>
                    </div>
                    <form onSubmit={createNetworkAccount}>
                    <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Full Name</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Rahul Sharma" 
                          className="input-field"
                          style={{ marginBottom: 0 }}
                          value={newName} 
                          onChange={e => setNewName(e.target.value)} 
                        />
                    </div>
                    <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Designation</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Article Assistant / Senior Auditor / Manager" 
                          className="input-field"
                          style={{ marginBottom: 0 }}
                          value={newDesignation} 
                          onChange={e => setNewDesignation(e.target.value)} 
                        />
                    </div>
                    <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Department</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Statutory Audit / GST Compliance / Direct Tax" 
                          className="input-field"
                          style={{ marginBottom: 0 }}
                          value={newDepartment} 
                          onChange={e => setNewDepartment(e.target.value)} 
                        />
                    </div>
                    <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                        <Users size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '0.85rem' }} />
                        <input 
                          type="text" 
                          placeholder="User ID / Username" 
                          className="input-field"
                          style={{ paddingLeft: '2.5rem', marginBottom: 0 }}
                          value={newUsername} 
                          onChange={e => setNewUsername(e.target.value)} 
                          required
                        />
                    </div>
                    <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                        <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '0.85rem' }} />
                        <input 
                          type="password" 
                          placeholder="Password" 
                          className="input-field"
                          style={{ paddingLeft: '2.5rem', marginBottom: 0 }}
                          value={newPassword} 
                          onChange={e => setNewPassword(e.target.value)} 
                          required
                        />
                    </div>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Assign Role</label>
                        <select 
                          value={newRole} 
                          onChange={e => setNewRole(e.target.value)}
                          className="input-field"
                          style={{ width: '100%', height: '40px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-panel)', borderRadius: '8px', color: 'white', padding: '0 0.75rem', fontSize: '0.85rem', outline: 'none' }}
                        >
                          <option value="user" style={{ backgroundColor: '#0f172a' }}>Standard User (Junior Article)</option>
                          <option value="Senior Auditor" style={{ backgroundColor: '#0f172a' }}>Senior Auditor / Reviewer</option>
                          <option value="Admin" style={{ backgroundColor: '#0f172a' }}>Administrator / Partner</option>
                        </select>
                    </div>
                    <button type="submit" className="btn-blue" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', padding: '0.65rem' }}>
                        Create User Account <UserPlus size={16} />
                    </button>
                    </form>

                    <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-panel)', paddingTop: '1rem' }}>
                        <h3 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Created Users</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                            {networkUsers.map((user) => (
                                <div key={user.id} style={{ padding: '0.6rem 0.75rem', backgroundColor: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-panel)', borderRadius: '8px', fontSize: '0.8rem', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{user.name || user.username}</span>
                                            <span style={{ fontSize: '0.7rem', color: '#93c5fd', fontWeight: 500 }}>
                                                {user.designation || user.role || 'Article Assistant'} • <span style={{ color: 'var(--text-muted)' }}>{user.department || 'Audit'}</span>
                                            </span>
                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>ID: @{user.username}</span>
                                        </div>
                                        <span style={{ fontSize: '0.6rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', backgroundColor: user.status === 'online' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.1)', color: user.status === 'online' ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                                            {user.status === 'online' ? '● ONLINE' : '○ OFFLINE'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                        {(user.current_device_id || user.device_id || user.status === 'online') && (
                                            <button onClick={() => unbindNetworkUser(user.id)} title="Release active PC session" style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', backgroundColor: 'transparent', border: '1px solid var(--accent-yellow)', color: 'var(--accent-yellow)', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
                                                RELEASE SESSION
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => toggleNetworkUser(user.id, user.is_active)}
                                            style={{ 
                                                padding: '0.25rem 0.5rem', 
                                                fontSize: '0.65rem', 
                                                backgroundColor: user.is_active === 0 ? 'var(--accent-green)' : 'var(--accent-red)', 
                                                border: 'none', 
                                                color: 'white', 
                                                borderRadius: '4px', 
                                                cursor: 'pointer',
                                                fontWeight: 600
                                            }}
                                        >
                                            {user.is_active === 0 ? 'ACTIVATE' : 'RESTRICT'}
                                        </button>
                                        <button 
                                            onClick={() => deleteNetworkUser(user.id)}
                                            style={{ 
                                                padding: '0.25rem 0.5rem', 
                                                fontSize: '0.65rem', 
                                                backgroundColor: 'transparent', 
                                                border: '1px solid var(--accent-red)', 
                                                color: 'var(--accent-red)', 
                                                borderRadius: '4px', 
                                                cursor: 'pointer' 
                                            }}
                                        >
                                            DELETE
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {networkUsers.length === 0 && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No accounts created yet.</p>}
                        </div>
                    </div>
                </div>

                {/* LICENSE MANAGEMENT (MULTI-PC SEAT CAPACITY) */}
                <div className="panel" style={{ margin: 0 }}>
                    <div className="panel-header" style={{ marginBottom: '0.5rem', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Key size={16} color="var(--accent-yellow)" />
                            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>SERIAL KEYS &amp; MULTI-PC SEATS</span>
                        </div>
                        <button 
                            onClick={createMultiPcKey} 
                            style={{ fontSize: '0.7rem', padding: '0.25rem 0.6rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                            <Plus size={12} /> New Key
                        </button>
                    </div>
                    <p style={{ color: 'var(--accent-green)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '1rem', textTransform: 'uppercase' }}>
                        POLICY: 1 SERIAL KEY &rarr; MULTIPLE PCS (FLEXIBLE SEATS)
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {keys.map(keyData => {
                        const maxDevices = Number(keyData.max_devices) || 1;
                        const boundDevices = getBoundDeviceIds(keyData);
                        const devicesInfoMap: Record<string, any> =
                            keyData.devices_info && typeof keyData.devices_info === 'object'
                                ? keyData.devices_info
                                : {};
                        const devicesListArr: any[] = Array.isArray(keyData.devices_list) ? keyData.devices_list : [];

                        const pcRows = boundDevices.map((devId: string) => {
                            const info = devicesInfoMap[devId] || devicesListArr.find((d: any) => d?.device_id === devId) || {};
                            const activeUserOnPc = networkUsers.find(
                                (u: any) =>
                                    u.status === 'online' &&
                                    (u.current_device_id === devId || u.device_id === devId)
                            );
                            const isRestricted = Boolean(info.is_restricted || info.status === 'RESTRICTED');
                            const lastSeenMs = Number(info.last_seen_ms) || 0;
                            const isOnlineFresh = Boolean(activeUserOnPc) || (info.status === 'ONLINE' && (!lastSeenMs || (Date.now() - lastSeenMs < 300000)));
                            const derivedStatus = isRestricted
                                ? 'RESTRICTED'
                                : (isOnlineFresh ? 'ONLINE' : (info.status === 'OFFLINE' ? 'OFFLINE' : 'ACTIVE'));

                            return {
                                device_id: devId,
                                pc_name: info.pc_name || `PC (${devId.slice(0, 12)})`,
                                os_user: info.os_user || 'Unknown User',
                                ip: info.ip || 'N/A',
                                activated_at: info.activated_at || '-',
                                last_seen: info.last_seen || '-',
                                is_restricted: isRestricted,
                                status: derivedStatus,
                                current_user: activeUserOnPc?.username || info.current_user || null
                            };
                        });

                        const activeCount = boundDevices.length;
                        const isLimitReached = activeCount >= maxDevices;
                        const isCollapsed = Boolean(collapsedKeys[keyData.id]);

                        return (
                            <div key={keyData.id} style={{ display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-card)', overflow: 'hidden' }}>
                                {/* KEY HEADER */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxWidth: '68%' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-main)', fontSize: '0.75rem', wordBreak: 'break-all' }}>{keyData.key}</span>
                                            <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '0.1rem 0.35rem', backgroundColor: 'var(--bg-panel)', color: 'var(--text-muted)', borderRadius: '4px', border: '1px solid var(--border-panel)' }}>
                                                {(keyData.key_type || 'CLIENT').toUpperCase()}
                                            </span>
                                            <span style={{ fontSize: '0.55rem', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: keyData.is_active === 1 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: keyData.is_active === 1 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                                {keyData.is_active === 1 ? 'ACTIVE' : 'REVOKED'}
                                            </span>
                                        </div>

                                        {/* PC Seat Controls */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                                            <span style={{ fontSize: '0.7rem', color: isLimitReached ? '#f87171' : '#38bdf8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                <Laptop size={12} />
                                                {activeCount} / {maxDevices} PCs Used
                                            </span>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.1rem 0.3rem', borderRadius: '4px', border: '1px solid var(--border-panel)' }}>
                                                <button
                                                    onClick={() => updateKeySeats(keyData.id, maxDevices, -1)}
                                                    title="Decrease allowed PCs"
                                                    style={{ border: 'none', background: 'transparent', color: 'white', cursor: 'pointer', padding: '0.1rem 0.3rem', fontSize: '0.7rem', fontWeight: 700 }}
                                                >
                                                    -
                                                </button>
                                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent-yellow)', minWidth: '16px', textAlign: 'center' }}>
                                                    {maxDevices}
                                                </span>
                                                <button
                                                    onClick={() => updateKeySeats(keyData.id, maxDevices, 1)}
                                                    title="Increase allowed PCs"
                                                    style={{ border: 'none', background: 'transparent', color: 'white', cursor: 'pointer', padding: '0.1rem 0.3rem', fontSize: '0.7rem', fontWeight: 700 }}
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                        {activeCount > 0 && (
                                            <button
                                                onClick={() => unbindKey(keyData)}
                                                title="Unbind all registered PCs from this key"
                                                className="btn-reset"
                                                style={{ padding: '0.35rem 0.5rem', fontSize: '0.65rem', fontWeight: 600, color: 'var(--accent-yellow)', borderColor: 'var(--accent-yellow)' }}
                                            >
                                                RESET PCS
                                            </button>
                                        )}
                                        <button
                                            onClick={() => toggleKey(keyData.id, keyData.is_active)}
                                            className={`btn-power ${keyData.is_active === 1 ? 'enabled' : ''}`}
                                            style={{ width: '28px', height: '28px' }}
                                            title={keyData.is_active === 1 ? 'Revoke Key' : 'Activate Key'}
                                        >
                                            <Power size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* BOUND / ACTIVE PCS LIST */}
                                <div style={{ borderTop: '1px solid var(--border-panel)', backgroundColor: 'rgba(0, 0, 0, 0.22)', padding: '0.6rem 0.75rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: !isCollapsed && pcRows.length > 0 ? '0.5rem' : 0 }}>
                                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                            Registered Workstations ({pcRows.length})
                                        </span>
                                        {pcRows.length > 0 && (
                                            <button
                                                onClick={() => setCollapsedKeys(prev => ({ ...prev, [keyData.id]: !prev[keyData.id] }))}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.65rem', color: '#93c5fd', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                                            >
                                                {isCollapsed ? (<>Show <ChevronDown size={12} /></>) : (<>Hide <ChevronUp size={12} /></>)}
                                            </button>
                                        )}
                                    </div>

                                    {pcRows.length === 0 ? (
                                        <p style={{ fontSize: '0.7rem', color: 'var(--text-dark)', fontStyle: 'italic', marginTop: '0.25rem' }}>
                                            No PCs bound to this serial key yet.
                                        </p>
                                    ) : !isCollapsed && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {pcRows.map((dev) => {
                                                const badgeColors =
                                                    dev.status === 'RESTRICTED'
                                                        ? { bg: 'rgba(239, 68, 68, 0.18)', text: '#f87171', border: 'rgba(239, 68, 68, 0.35)', label: 'RESTRICTED' }
                                                        : dev.status === 'ONLINE'
                                                            ? { bg: 'rgba(34, 197, 94, 0.16)', text: '#4ade80', border: 'rgba(34, 197, 94, 0.3)', label: '● ONLINE' }
                                                            : dev.status === 'OFFLINE'
                                                                ? { bg: 'rgba(148, 163, 184, 0.12)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.25)', label: '○ OFFLINE' }
                                                                : { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: 'rgba(56, 189, 248, 0.25)', label: '● ACTIVE' };

                                                return (
                                                    <div
                                                        key={dev.device_id}
                                                        style={{
                                                            padding: '0.55rem 0.65rem',
                                                            borderRadius: '6px',
                                                            backgroundColor: 'rgba(15, 23, 42, 0.65)',
                                                            border: `1px solid ${dev.is_restricted ? 'rgba(239, 68, 68, 0.45)' : 'var(--border-panel)'}`,
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '0.35rem'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                <Laptop size={13} color={badgeColors.text} />
                                                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'white' }}>{dev.pc_name}</span>
                                                            </div>
                                                            <span style={{ fontSize: '0.58rem', fontWeight: 800, padding: '0.12rem 0.42rem', borderRadius: '4px', backgroundColor: badgeColors.bg, color: badgeColors.text, border: `1px solid ${badgeColors.border}` }}>
                                                                {badgeColors.label}
                                                            </span>
                                                        </div>

                                                        <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                                                            <span>Win: <strong style={{ color: '#e2e8f0' }}>{dev.os_user}</strong></span>
                                                            <span>• IP: <strong style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{dev.ip}</strong></span>
                                                            {dev.current_user && (
                                                                <span style={{ color: '#60a5fa', fontWeight: 700 }}>• @{dev.current_user}</span>
                                                            )}
                                                        </div>

                                                        <div style={{ fontSize: '0.62rem', color: 'var(--text-dark)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                                            Last seen: {dev.last_seen} • ID: {dev.device_id}
                                                        </div>

                                                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                                                            <button
                                                                onClick={() => toggleRestrictDevice(keyData, dev.device_id, dev.is_restricted)}
                                                                title={dev.is_restricted ? 'Allow this PC again' : 'Block/Restrict this PC'}
                                                                style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                                                    padding: '0.22rem 0.5rem', fontSize: '0.63rem', fontWeight: 700, borderRadius: '4px', cursor: 'pointer',
                                                                    backgroundColor: dev.is_restricted ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.12)',
                                                                    border: `1px solid ${dev.is_restricted ? 'var(--accent-green)' : 'var(--accent-red)'}`,
                                                                    color: dev.is_restricted ? '#4ade80' : '#f87171'
                                                                }}
                                                            >
                                                                {dev.is_restricted ? <CheckCircle2 size={11} /> : <Ban size={11} />}
                                                                {dev.is_restricted ? 'Unrestrict' : 'Restrict'}
                                                            </button>

                                                            <button
                                                                onClick={() => makeDeviceOffline(keyData, dev.device_id)}
                                                                disabled={dev.is_restricted}
                                                                title="Force this PC offline / end active session"
                                                                style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                                                    padding: '0.22rem 0.5rem', fontSize: '0.63rem', fontWeight: 700, borderRadius: '4px',
                                                                    cursor: dev.is_restricted ? 'not-allowed' : 'pointer',
                                                                    opacity: dev.is_restricted ? 0.45 : 1,
                                                                    backgroundColor: 'rgba(234, 179, 8, 0.12)',
                                                                    border: '1px solid var(--accent-yellow)',
                                                                    color: '#facc15'
                                                                }}
                                                            >
                                                                <WifiOff size={11} />
                                                                Make Offline
                                                            </button>

                                                            <button
                                                                onClick={() => removeDeviceFromKey(keyData, dev.device_id)}
                                                                title="Remove PC and free 1 license seat"
                                                                style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                                                    padding: '0.22rem 0.5rem', fontSize: '0.63rem', fontWeight: 700, borderRadius: '4px', cursor: 'pointer',
                                                                    backgroundColor: 'transparent',
                                                                    border: '1px solid rgba(239, 68, 68, 0.65)',
                                                                    color: '#f87171'
                                                                }}
                                                            >
                                                                <Trash2 size={11} />
                                                                Remove
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    </div>
                </div>

                </div>

                {/* RIGHT COLUMN */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                {/* NETWORK ACTIVITY MONITOR */}
                <div className="panel" style={{ margin: 0 }}>
                    <div className="panel-header" style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Activity size={18} color="var(--accent-blue)" />
                            <span>NETWORK ACTIVITY MONITOR</span>
                        </div>
                        <button onClick={clearActivityLogs} className="btn-reset" style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'transparent', border: '1px solid var(--border-card)' }}>
                            <FileText size={14} /> Clear Logs
                        </button>
                    </div>
                    
                    <div className="table-container">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-panel)' }}>
                            <th style={{ textAlign: 'left', padding: '1rem', color: 'var(--text-dark)' }}>USER</th>
                            <th style={{ textAlign: 'left', padding: '1rem', color: 'var(--text-dark)' }}>IP ADDRESS</th>
                            <th style={{ textAlign: 'left', padding: '1rem', color: 'var(--text-dark)' }}>SYSTEM / LOCATION</th>
                            <th style={{ textAlign: 'left', padding: '1rem', color: 'var(--text-dark)' }}>USAGE TIME</th>
                            <th style={{ textAlign: 'left', padding: '1rem', color: 'var(--text-dark)' }}>ACTION</th>
                        </tr>
                        </thead>
                        <tbody>
                        {activityLogs.length === 0 ? (
                            <tr>
                            <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dark)', fontStyle: 'italic' }}>
                                No external users currently connected.
                            </td>
                            </tr>
                        ) : (
                            activityLogs.map(log => (
                            <tr key={log.id} style={{ borderBottom: '1px solid var(--border-panel)' }}>
                                <td style={{ padding: '1rem' }}>{log.username}</td>
                                <td style={{ padding: '1rem' }}>{log.ip}</td>
                                <td style={{ padding: '1rem' }}>{log.system}</td>
                                <td style={{ padding: '1rem' }}>{log.time}</td>
                                <td style={{ padding: '1rem', color: 'var(--accent-green)' }}>{log.action}</td>
                            </tr>
                            ))
                        )}
                        </tbody>
                    </table>
                    </div>
                </div>

                {/* RECONCILIATION HISTORY */}
                <div className="panel" style={{ margin: 0 }}>
                    <div className="panel-header" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <FileText size={18} color="#A855F7" />
                        <span>RECONCILIATION HISTORY</span>
                    </div>
                    <button className="btn-reset" style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'transparent', border: '1px solid var(--border-card)' }}>
                        <Download size={14} /> EXPORT LOG
                    </button>
                    </div>
                    
                    <div className="table-container">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-panel)' }}>
                            <th style={{ textAlign: 'left', padding: '1rem', color: 'var(--text-dark)' }}>TIME</th>
                            <th style={{ textAlign: 'left', padding: '1rem', color: 'var(--text-dark)' }}>USER</th>
                            <th style={{ textAlign: 'left', padding: '1rem', color: 'var(--text-dark)' }}>COMPANY</th>
                            <th style={{ textAlign: 'left', padding: '1rem', color: 'var(--text-dark)' }}>TYPE</th>
                            <th style={{ textAlign: 'left', padding: '1rem', color: 'var(--text-dark)' }}>RECORDS PROCESSED</th>
                            <th style={{ textAlign: 'left', padding: '1rem', color: 'var(--text-dark)' }}>ISSUES FOUND</th>
                        </tr>
                        </thead>
                        <tbody>
                        {recoHistory.length === 0 ? (
                            <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dark)', fontStyle: 'italic' }}>
                                No reconciliation activity recorded yet.
                            </td>
                            </tr>
                        ) : (
                            recoHistory.map(rec => (
                            <tr key={rec.id} style={{ borderBottom: '1px solid var(--border-panel)' }}>
                                <td style={{ padding: '1rem' }}>{rec.time}</td>
                                <td style={{ padding: '1rem' }}>{rec.user}</td>
                                <td style={{ padding: '1rem' }}>{rec.company}</td>
                                <td style={{ padding: '1rem' }}>{rec.type}</td>
                                <td style={{ padding: '1rem' }}>{rec.records}</td>
                                <td style={{ padding: '1rem', color: 'var(--accent-red)' }}>{rec.issues}</td>
                            </tr>
                            ))
                        )}
                        </tbody>
                    </table>
                    </div>
                </div>

                {/* MODULE USAGE LIMITS */}
                <div className="panel" style={{ margin: 0 }}>
                    <div className="panel-header">
                    <Activity size={18} color="var(--accent-yellow)" />
                    <span>MODULE USAGE LIMITS (25 MAX)</span>
                    </div>
                    
                    <div className="module-grid">
                    {modules.map(mod => (
                        <div key={mod.id} className="module-card">
                        <div className="module-top">
                            <span className="module-title">{mod.name || mod.id.replace(`${activeOffice}_`, '')}</span>
                            <span className="module-usage" style={{ color: mod.usage_count >= 25 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                            {mod.usage_count || 0} / 25
                            </span>
                        </div>
                        <div className="module-bottom">
                            <button onClick={() => resetModule(mod.id)} className="btn-reset">
                            RESET LIMIT
                            </button>
                            <button 
                            onClick={() => toggleModule(mod.id, mod.is_enabled)} 
                            className={`btn-power ${mod.is_enabled === 1 ? 'enabled' : ''}`}
                            >
                            <Power size={18} />
                            </button>
                        </div>
                        </div>
                    ))}
                    {modules.length === 0 && <p style={{ color: 'var(--text-dark)', gridColumn: '1 / -1' }}>No modules connected yet.</p>}
                    </div>
                </div>

                </div>
            </div>
        )}
      </div>

    </div>
  );
}

export default App;
