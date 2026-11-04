import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, query, where, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { Power, Key, ShieldCheck, Activity, Lock, Users, UserPlus, FileText, Download, Building, Plus, Laptop } from 'lucide-react';
import './index.css';

const firebaseConfig = {
  apiKey: "AIzaSyDfE2DBpfE5Oj5nwtErub8X0tvBfMsi9QA",
  authDomain: "reco-vaswani-license.firebaseapp.com",
  projectId: "reco-vaswani-license",
  storageBucket: "reco-vaswani-license.appspot.com",
  messagingSenderId: "594471668759",
  appId: "1:594471668759:web:fb9f997aa87bd7e866e052"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  
  const [offices, setOffices] = useState<any[]>([]);
  const [activeOffice, setActiveOffice] = useState<string>('');
  const [newOfficeName, setNewOfficeName] = useState('');

  const [modules, setModules] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [networkUsers, setNetworkUsers] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [recoHistory, setRecoHistory] = useState<any[]>([]);

  const [newName, setNewName] = useState('');
  const [newDesignation, setNewDesignation] = useState('');
  const [newDepartment, setNewDepartment] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');

  // 1. Fetch Offices
  useEffect(() => {
    if (!isAuthenticated) return;
    const unsub = onSnapshot(collection(db, 'offices'), (snap) => {
      const officeData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOffices(officeData);
      if (officeData.length > 0 && !activeOffice) {
        setActiveOffice(officeData[0].id);
      }
    });
    return () => unsub();
  }, [isAuthenticated]);

  // 2. Fetch Data for Active Office
  useEffect(() => {
    if (!isAuthenticated || !activeOffice) return;
    
    const defaultModules = ['TallyConverter', 'Consolidator', 'RecoEngine', 'OCR', 'Returns', 'Dashboard', 'TallyDirect', 'Tracker', 'FinStatements', 'Forensic'];
    const unsubModules = onSnapshot(query(collection(db, 'module_usage'), where('office_id', '==', activeOffice)), async (snap) => {
      const fetchedModules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setModules(fetchedModules);

      // Auto-initialize missing default modules for existing office
      const fetchedNames = new Set(fetchedModules.map((m: any) => m.name || m.module_name || m.id.split('_')[1]));
      for (const mod of defaultModules) {
        if (!fetchedNames.has(mod)) {
          try {
            await setDoc(doc(db, 'module_usage', `${activeOffice}_${mod}`), {
              name: mod,
              is_enabled: 1,
              usage_count: 0,
              office_id: activeOffice,
              module_name: mod
            });
            console.log(`Auto-initialized missing default module: ${mod} for office ${activeOffice}`);
          } catch (e) {
            console.error(`Failed to auto-initialize missing module ${mod}:`, e);
          }
        }
      }
    });
    const unsubKeys = onSnapshot(query(collection(db, 'serial_keys'), where('office_id', '==', activeOffice)), (snap) => {
      setKeys(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubUsers = onSnapshot(query(collection(db, 'network_users'), where('office_id', '==', activeOffice)), (snap) => {
      setNetworkUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubLogs = onSnapshot(query(collection(db, 'audit_logs'), where('office_id', '==', activeOffice)), (snap) => {
      setActivityLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubReco = onSnapshot(query(collection(db, 'reco_history'), where('office_id', '==', activeOffice)), (snap) => {
      setRecoHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubModules(); unsubKeys(); unsubUsers(); unsubLogs(); unsubReco(); };
  }, [isAuthenticated, activeOffice]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'Sourav@3615') setIsAuthenticated(true);
    else alert('Invalid Admin Password');
  };

  const createOffice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOfficeName) return;
    const officeId = newOfficeName.toUpperCase().replace(/\s+/g, '_');
    
    await setDoc(doc(db, 'offices', officeId), {
      name: newOfficeName.toUpperCase(),
      created_at: serverTimestamp()
    });

    // Initialize Server Key
    const serverKey = `${officeId}-${Math.random().toString(36).substring(2,8).toUpperCase()}-SRV`;
    await setDoc(doc(db, 'serial_keys', serverKey), { 
        key: serverKey, is_active: 1, key_type: 'server', device_id: null, office_id: officeId 
    });

    // Initialize Default Modules
    const defaultModules = ['TallyConverter', 'Consolidator', 'RecoEngine', 'OCR', 'Returns', 'Dashboard', 'TallyDirect', 'Tracker', 'FinStatements', 'Forensic'];
    for(const mod of defaultModules) {
        await setDoc(doc(db, 'module_usage', `${officeId}_${mod}`), { 
            name: mod, is_enabled: 1, usage_count: 0, office_id: officeId, module_name: mod
        });
    }

    setNewOfficeName('');
    setActiveOffice(officeId);
    alert(`New Office "${newOfficeName}" Created with default keys and modules!`);
  };

  const createNetworkAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword || !activeOffice) return;

    const finalName = newName.trim() || newUsername.trim();
    const finalDesignation = newDesignation.trim() || (newRole === 'Senior Auditor' ? 'Senior Auditor' : newRole === 'Admin' ? 'Administrator' : 'Article Assistant');
    const finalDepartment = newDepartment.trim() || 'Audit & Assurance';

    await addDoc(collection(db, 'network_users'), {
      name: finalName,
      designation: finalDesignation,
      department: finalDepartment,
      username: newUsername.toLowerCase().trim(),
      password: newPassword,
      role: newRole,
      created_at: serverTimestamp(),
      is_active: 1,
      office_id: activeOffice,
      device_id: null,
      current_device_id: null,
      status: 'offline'
    });
    setNewName('');
    setNewDesignation('');
    setNewDepartment('');
    setNewUsername('');
    setNewPassword('');
    setNewRole('user');
    alert(`User account created: "${finalName}" (${finalDesignation} • ${finalDepartment}) for Office: ${activeOffice}`);
  };

  const updateKeySeats = async (keyId: string, currentSeats: number, delta: number) => {
    const updated = Math.max(1, (Number(currentSeats) || 1) + delta);
    try {
      await updateDoc(doc(db, 'serial_keys', keyId), { max_devices: updated });
    } catch (err: any) {
      alert("Failed to update seat limit: " + err.message);
    }
  };

  const createMultiPcKey = async () => {
    if (!activeOffice) return;
    const seatsStr = prompt("Enter allowed number of PCs for this Serial Key:", "5");
    if (!seatsStr) return;
    const seats = Math.max(1, parseInt(seatsStr, 10) || 5);
    const newKey = `${activeOffice}-${Math.random().toString(36).substring(2, 8).toUpperCase()}-MULTI`;
    try {
      await setDoc(doc(db, 'serial_keys', newKey), {
        key: newKey,
        is_active: 1,
        key_type: 'client',
        device_id: null,
        bound_devices: [],
        max_devices: seats,
        office_id: activeOffice,
        created_at: serverTimestamp()
      });
      alert(`New Multi-PC Serial Key created: ${newKey} (${seats} PCs allowed)!`);
    } catch (err: any) {
      alert("Failed to create key: " + err.message);
    }
  };

  const toggleNetworkUser = async (userId: string, currentStatus: number) => {
    await updateDoc(doc(db, 'network_users', userId), { is_active: currentStatus === 1 ? 0 : 1 });
  };

  const unbindNetworkUser = async (userId: string) => {
    if (confirm("Release active session for this user? This will mark them offline and allow them to log in on any computer immediately.")) {
      await updateDoc(doc(db, 'network_users', userId), { device_id: null, current_device_id: null, status: 'offline' });
    }
  };

  const deleteNetworkUser = async (userId: string) => {
    if (confirm("WARNING: Are you sure you want to completely delete this user? This cannot be undone.")) {
      try {
        await deleteDoc(doc(db, 'network_users', userId));
        alert("User permanently deleted!");
      } catch (err: any) {
        alert("Failed to delete: " + err.message);
      }
    }
  };

  const deleteOffice = async (officeId: string) => {
    if (confirm(`WARNING: Are you sure you want to permanently delete Office: ${officeId}?\nThis will completely WIPE all associated keys, users, and usage limits across all networks!`)) {
      try {
        // Delete all keys for this office
        const keysSnap = await getDocs(query(collection(db, 'serial_keys'), where('office_id', '==', officeId)));
        keysSnap.forEach(async (d) => await deleteDoc(d.ref));
        
        // Delete all users for this office
        const usersSnap = await getDocs(query(collection(db, 'network_users'), where('office_id', '==', officeId)));
        usersSnap.forEach(async (d) => await deleteDoc(d.ref));

        // Delete all module usage tracking
        const modulesSnap = await getDocs(query(collection(db, 'module_usage'), where('office_id', '==', officeId)));
        modulesSnap.forEach(async (d) => await deleteDoc(d.ref));

        // Delete the office document
        await deleteDoc(doc(db, 'offices', officeId));
        if (activeOffice === officeId) setActiveOffice('');
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
          const keysSnap = await getDocs(query(collection(db, 'serial_keys'), where('office_id', '==', officeId), where('key_type', '==', 'server')));
          if (!keysSnap.empty) {
            await updateDoc(keysSnap.docs[0].ref, { kill_switch: true });
            alert("KILL SWITCH TRIGGERED. The client's software will be wiped within 5 seconds.");
          } else {
            alert("No server key found for this office to trigger.");
          }
        } catch (err: any) {
          alert("Failed to trigger Kill Switch: " + err.message);
        }
      }
    }
  };

  const toggleModule = async (moduleId: string, currentStatus: number) => {
    await updateDoc(doc(db, 'module_usage', moduleId), { is_enabled: currentStatus === 1 ? 0 : 1 });
  };
  
  const resetModule = async (moduleId: string) => {
    if (confirm(`Reset usage count for ${moduleId}?`)) {
      await updateDoc(doc(db, 'module_usage', moduleId), { usage_count: 0 });
    }
  };

  const unbindKey = async (keyId: string) => {
    if (confirm(`Are you sure you want to unbind all PCs from this key? This will clear all bound PCs and allow new computers to activate up to the seat limit.`)) {
      await updateDoc(doc(db, 'serial_keys', keyId), { device_id: null, bound_mac: null, bound_devices: [] });
    }
  };

  const toggleKey = async (keyId: string, currentStatus: number) => {
    await updateDoc(doc(db, 'serial_keys', keyId), { is_active: currentStatus === 1 ? 0 : 1 });
  };

  const clearActivityLogs = async () => {
    if (!activeOffice) return;
    if (confirm("Are you sure you want to clear all network activity logs for this office?")) {
      try {
        const logsSnap = await getDocs(query(collection(db, 'audit_logs'), where('office_id', '==', activeOffice)));
        const deletePromises = logsSnap.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);
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
    <div className="admin-container" style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '2rem', maxWidth: '1400px' }}>
      
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.5fr', gap: '1.5rem', alignItems: 'start' }}>
                
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

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {keys.map(keyData => {
                        const maxDevices = Number(keyData.max_devices) || 1;
                        const boundDevices = Array.isArray(keyData.bound_devices) 
                            ? keyData.bound_devices 
                            : (keyData.device_id ? [keyData.device_id] : []);
                        const activeCount = boundDevices.length;
                        const isLimitReached = activeCount >= maxDevices;

                        return (
                            <div key={keyData.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-card)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-card)', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxWidth: '65%' }}>
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
                                            onClick={() => unbindKey(keyData.id)} 
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
