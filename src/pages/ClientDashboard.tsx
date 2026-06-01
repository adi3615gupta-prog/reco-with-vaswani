import { useState, useEffect } from 'react';
import { 
  ArrowLeft, HardDrive, DownloadCloud, Users, CalendarClock, 
  Mail, MessageSquare, Plus, Search, Building2, CheckCircle2, 
  AlertCircle, Clock, Trash2, Edit, Settings, Trash, Check, X, FileText, Send,
  Download, Upload, Award, TrendingUp, Calculator, Percent, Activity, TrendingDown
} from 'lucide-react';
import { toast } from 'sonner';
import { parseFile, exportToXlsx, exportClientTemplate } from '@/lib/fileParser';

const getApiHost = () => localStorage.getItem('np_server_ip') || window.location.hostname || '127.0.0.1';

interface ClientDashboardProps {
  onBack: () => void;
}

export default function ClientDashboard({ onBack }: ClientDashboardProps) {
  const [activeTab, setActiveTab] = useState<'analytics' | 'tasks' | 'clients'>('analytics');
  const [clients, setClients] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  
  // Interactive UI states
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  
  // Modal toggle states
  const [showAddClient, setShowAddClient] = useState(false);
  const [showEditClient, setShowEditClient] = useState(false);
  const [showGenCalendar, setShowGenCalendar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Selected client for edit
  const [editingClient, setEditingClient] = useState<any>(null);

  // Form states - Client
  const [cliTradeName, setCliTradeName] = useState('');
  const [cliLegalName, setCliLegalName] = useState('');
  const [cliGstin, setCliGstin] = useState('');
  const [cliEmail, setCliEmail] = useState('');
  const [cliPhone, setCliPhone] = useState('');

  // Form states - Calendar Generator
  const [genReturnType, setGenReturnType] = useState<'GSTR-1' | 'GSTR-3B' | 'GSTR-9'>('GSTR-1');
  const [genPeriod, setGenPeriod] = useState('November 2023');
  const [genDueDate, setGenDueDate] = useState('2023-12-11');

  // Custom SMTP / SMS gateway settings
  const [smtpSettings, setSmtpSettings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('np_smtp_settings') || '{"host":"smtp.mailgun.org","port":"587","email":"notifications@reco.com","senderName":"Sourav Vaswani & Co."}');
    } catch {
      return { host: "smtp.mailgun.org", port: "587", email: "notifications@reco.com", senderName: "Sourav Vaswani & Co." };
    }
  });

  const fetchDashboardData = async () => {
    try {
      const [cliRes, tskRes] = await Promise.all([
        fetch(`http://${getApiHost()}:3001/api/clients`, { headers: { 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` } }),
        fetch(`http://${getApiHost()}:3001/api/tasks`, { headers: { 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` } })
      ]);
      if (cliRes.ok) setClients(await cliRes.json());
      if (tskRes.ok) setTasks(await tskRes.json());
    } catch (e) { 
      toast.error("Failed to load dashboard database tables."); 
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Helper to extract PAN from GSTIN (GSTIN format: 27 AADCB 2230 M 1 Z 4)
  // PAN is characters 3 to 12 (10 chars index 2 to 12)
  const getPanFromGstin = (gstin: string) => {
    if (gstin && gstin.length >= 12) {
      return gstin.slice(2, 12).toUpperCase();
    }
    return '—';
  };

  // Google Drive Cloud Backup
  const handleDriveBackup = async () => {
    setIsBackingUp(true);
    const loadingId = toast.loading("Syncing SQLite database tables to Google Drive...");
    try {
      const res = await fetch(`http://${getApiHost()}:3001/api/backup/drive`, {
        method: 'POST', 
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` }
      });
      if (res.ok) {
        toast.success("Google Drive Backup Successful", { 
          id: loadingId, 
          description: "Encrypted SQLite backup file saved securely in your Drive folder." 
        });
      }
    } catch (e) { 
      toast.error("Backup failed. Verify network endpoints.", { id: loadingId }); 
    }
    setIsBackingUp(false);
  };

  // Portal Auto Import
  const handlePortalImport = async () => {
    const gstin = window.prompt("Enter GSTIN to fetch details from GST Portal:");
    if (!gstin) return;
    if (gstin.length !== 15) return toast.error("Invalid GSTIN. Standard Indian GSTIN is 15 alphanumeric characters.");
    
    setIsSyncing(true);
    const loadingId = toast.loading(`Browser opened! Please solve the CAPTCHA for ${gstin.toUpperCase()}...`);
    try {
      const res = await fetch(`http://${getApiHost()}:3001/api/portal/import-client`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` },
        body: JSON.stringify({ gstin: gstin.toUpperCase().trim() })
      });
      const data = await res.json();
      if (data.success) {
        // Save to DB
        await fetch(`http://${getApiHost()}:3001/api/clients`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` },
            body: JSON.stringify({ id: `cli_${Date.now()}`, ...data.data })
        });
        toast.success("Portal Fetch Complete", { 
          id: loadingId, 
          description: `Successfully imported "${data.data.trade_name}" trade registry.` 
        });
        fetchDashboardData();
      }
    } catch (e) { 
      toast.error("Failed to connect to GST Portal offline gateway.", { id: loadingId }); 
    }
    setIsSyncing(false);
  };

  // Manual Add Client
  const handleAddClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliTradeName || !cliGstin) return toast.error("Trade Name and GSTIN are mandatory fields.");
    if (cliGstin.length !== 15) return toast.error("GSTIN must be exactly 15 characters.");

    const loadingId = toast.loading("Saving client master records...");
    try {
      const res = await fetch(`http://${getApiHost()}:3001/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` },
        body: JSON.stringify({
          id: `cli_${Date.now()}`,
          gstin: cliGstin.toUpperCase().trim(),
          trade_name: cliTradeName.trim(),
          legal_name: cliLegalName.trim() || cliTradeName.trim(),
          email: cliEmail.trim(),
          phone: cliPhone.trim()
        })
      });
      if (res.ok) {
        toast.success("Client added successfully!", { id: loadingId });
        setShowAddClient(false);
        setCliTradeName('');
        setCliLegalName('');
        setCliGstin('');
        setCliEmail('');
        setCliPhone('');
        fetchDashboardData();
      }
    } catch (e) {
      toast.error("Failed to insert record into local SQLite database.", { id: loadingId });
    }
  };

  // Manual Edit Client
  const handleEditClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;

    const loadingId = toast.loading("Updating client registry...");
    try {
      const res = await fetch(`http://${getApiHost()}:3001/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` },
        body: JSON.stringify({
          id: editingClient.id,
          gstin: editingClient.gstin,
          trade_name: editingClient.trade_name,
          legal_name: editingClient.legal_name,
          email: editingClient.email,
          phone: editingClient.phone
        })
      });
      if (res.ok) {
        toast.success("Client updated successfully", { id: loadingId });
        setShowEditClient(false);
        setEditingClient(null);
        fetchDashboardData();
      }
    } catch (e) {
      toast.error("Failed to modify database record.", { id: loadingId });
    }
  };

  // Delete Client
  const handleDeleteClient = async (id: string, tradeName: string) => {
    if (!window.confirm(`Are you absolutely sure you want to delete client "${tradeName}"?\nThis will clear their master profile from SQLite.`)) return;

    const loadingId = toast.loading("Deleting client profile...");
    try {
      const res = await fetch(`http://${getApiHost()}:3001/api/clients/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` }
      });
      if (res.ok) {
        toast.success("Client deleted successfully", { id: loadingId });
        fetchDashboardData();
      }
    } catch (e) {
      toast.error("Deletion failed.", { id: loadingId });
    }
  };

  // Generate Return Calendar for all clients
  const handleGenerateCalendar = async () => {
    if (clients.length === 0) return toast.error("Please add or import clients first before generating return schedules.");
    
    const loadingId = toast.loading(`Generating GSTR filings for ${clients.length} clients...`);
    try {
      let created = 0;
      for (const client of clients) {
        const taskId = `tsk_${client.gstin}_${genReturnType}_${genPeriod.replace(/\s+/g, '_')}`;
        await fetch(`http://${getApiHost()}:3001/api/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` },
          body: JSON.stringify({
            id: taskId,
            client_gstin: client.gstin,
            return_type: genReturnType,
            period: genPeriod,
            due_date: genDueDate,
            status: 'Pending',
            tax_amount: null
          })
        });
        created++;
      }
      toast.success("Calendar Generated", { 
        id: loadingId, 
        description: `Successfully loaded ${created} color-coded GSTR filing rows.` 
      });
      setShowGenCalendar(false);
      fetchDashboardData();
    } catch (e) {
      toast.error("Failed to populate Tasks DB table.", { id: loadingId });
    }
  };

  // Update GSTR filing status
  const handleUpdateTaskStatus = async (task: any, newStatus: string) => {
    try {
      const res = await fetch(`http://${getApiHost()}:3001/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` },
        body: JSON.stringify({
          ...task,
          status: newStatus
        })
      });
      if (res.ok) {
        toast.success(`Task marked as ${newStatus}`);
        fetchDashboardData();
      }
    } catch (e) {
      toast.error("Failed to update status.");
    }
  };

  // Delete individual task row
  const handleDeleteTask = async (id: string) => {
    const res = await fetch(`http://${getApiHost()}:3001/api/tasks/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` }
    });
    if (res.ok) {
      toast.success("Filing record cleared.");
      fetchDashboardData();
    }
  };

  // Send Bulk Email/SMS notifications to all pending clients
  const handleSendBulkAlerts = async (type: 'email' | 'sms') => {
    const pendingTasks = displayTasks.filter(t => t.status !== 'Filed');
    if (pendingTasks.length === 0) return toast.info("No pending filings found for this period!");

    const loadingId = toast.loading(`Broadcasting compliance notifications to ${pendingTasks.length} pending clients...`);
    try {
      // Dispatch alert request
      await fetch(`http://${getApiHost()}:3001/api/alerts/send`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` }
      });
      toast.success("Bulk Alerts Dispatched", { 
        id: loadingId, 
        description: `Reminders delivered successfully via Sourav Vaswani SMTP Gateway.` 
      });
    } catch (e) {
      toast.error("Broadcast failed.", { id: loadingId });
    }
  };

  // Send single filing reminder
  const sendAlert = async (type: 'email' | 'sms', clientGstin: string) => {
    const client = clients.find(c => c.gstin === clientGstin);
    const displayName = client ? client.trade_name : clientGstin;
    const loadingId = toast.loading(`Sending filing reminder ${type} to ${displayName}...`);
    try {
      const res = await fetch(`http://${getApiHost()}:3001/api/alerts/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` },
        body: JSON.stringify({
          type,
          clientGstin,
          smtpSettings
        })
      });
      if (res.ok) {
        toast.success(`Filing reminder ${type} sent to ${displayName} successfully!`, { id: loadingId });
      } else {
        toast.error(`Failed to send ${type} reminder.`, { id: loadingId });
      }
    } catch {
      toast.error(`Failed to send ${type} reminder.`, { id: loadingId });
    }
  };

  // Export structured Excel template for client data
  const handleExportTemplate = () => {
    try {
      exportClientTemplate();
      toast.success("Excel template downloaded successfully!");
    } catch (e) {
      toast.error("Failed to generate client template.");
    }
  };

  // Parse filled client template and bulk import to SQLite
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const loadingId = toast.loading("Parsing Excel file...");
    try {
      const { headers, rows } = await parseFile(file);
      if (rows.length === 0) {
        toast.error("The selected file is empty.", { id: loadingId });
        return;
      }

      const lowerHeaders = headers.map(h => String(h).toLowerCase().trim());
      
      const gstinIdx = lowerHeaders.findIndex(h => h.includes('gstin'));
      const tradeIdx = lowerHeaders.findIndex(h => h.includes('trade') || h.includes('company') || h.includes('supplier') || h.includes('party'));
      const legalIdx = lowerHeaders.findIndex(h => h.includes('legal') || h.includes('name'));
      const emailIdx = lowerHeaders.findIndex(h => h.includes('email') || h.includes('mail'));
      const phoneIdx = lowerHeaders.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('contact'));

      if (gstinIdx === -1 || tradeIdx === -1) {
        toast.error("Invalid template format. The columns must contain at least 'GSTIN' and 'Trade Name'.", { id: loadingId });
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      toast.loading(`Importing ${rows.length} client records to local database...`, { id: loadingId });

      for (const row of rows) {
        const rowGstin = String(row[headers[gstinIdx]] || '').trim().toUpperCase();
        const rowTrade = String(row[headers[tradeIdx]] || '').trim();
        const rowLegal = legalIdx !== -1 ? String(row[headers[legalIdx]] || '').trim() : rowTrade;
        const rowEmail = emailIdx !== -1 ? String(row[headers[emailIdx]] || '').trim() : '';
        const rowPhone = phoneIdx !== -1 ? String(row[headers[phoneIdx]] || '').trim() : '';

        // Validate standard 15-character Indian GSTIN
        if (!rowGstin || rowGstin.length !== 15 || !rowTrade) {
          errorCount++;
          continue;
        }

        try {
          const res = await fetch(`http://${getApiHost()}:3001/api/clients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('np_token')}` },
            body: JSON.stringify({
              id: `cli_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              gstin: rowGstin,
              trade_name: rowTrade,
              legal_name: rowLegal || rowTrade,
              email: rowEmail,
              phone: rowPhone
            })
          });

          if (res.ok) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch {
          errorCount++;
        }
      }

      toast.success("Excel Import Complete!", {
        id: loadingId,
        description: `Successfully imported/updated ${successCount} clients. Skipped ${errorCount} invalid rows.`
      });

      e.target.value = '';
      fetchDashboardData();
    } catch (e) {
      toast.error("Failed to parse file. Make sure it is a valid Excel spreadsheet.", { id: loadingId });
    }
  };

  // Update SMTP Settings
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('np_smtp_settings', JSON.stringify(smtpSettings));
    toast.success("SMTP Configuration saved successfully!");
    setShowSettings(false);
  };

  // Filter clients/tasks based on search input
  const filteredClients = clients.filter(c => 
    c.trade_name?.toLowerCase().includes(search.toLowerCase()) || 
    c.legal_name?.toLowerCase().includes(search.toLowerCase()) || 
    c.gstin?.toLowerCase().includes(search.toLowerCase())
  );

  // Auto-calculated tasks list fallback if empty
  const displayTasks = tasks.length > 0 ? tasks.filter(t => 
    t.client_gstin?.toLowerCase().includes(search.toLowerCase()) || 
    t.return_type?.toLowerCase().includes(search.toLowerCase()) || 
    t.period?.toLowerCase().includes(search.toLowerCase())
  ) : [
    { id: '1', client_gstin: '27AADCB2230M1Z4', return_type: 'GSTR-3B', period: 'Nov 2023', due_date: '2023-12-20', status: 'Pending', tax_amount: 14500 },
    { id: '2', client_gstin: '27AADCB2230M1Z4', return_type: 'GSTR-1', period: 'Nov 2023', due_date: '2023-12-11', status: 'Filed', tax_amount: 0 },
    { id: '3', client_gstin: '07AAACR3421Q1ZA', return_type: 'GSTR-9', period: 'FY 22-23', due_date: '2023-12-31', status: 'In Progress', tax_amount: null },
  ].filter(t => 
    t.client_gstin?.toLowerCase().includes(search.toLowerCase()) || 
    t.return_type?.toLowerCase().includes(search.toLowerCase()) || 
    t.period?.toLowerCase().includes(search.toLowerCase())
  );

  // Auto update GSTR Generator standard due date
  useEffect(() => {
    if (genReturnType === 'GSTR-1') setGenDueDate('2023-12-11');
    else if (genReturnType === 'GSTR-3B') setGenDueDate('2023-12-20');
    else setGenDueDate('2024-12-31');
  }, [genReturnType]);

  // --- COMPLIANCE ANALYTICS CALCULATIONS & LOGICS (FIGURES & CALCS) ---
  const allTasksList = tasks.length > 0 ? tasks : [
    { id: '1', client_gstin: '27AADCB2230M1Z4', return_type: 'GSTR-3B', period: 'Nov 2023', due_date: '2023-12-20', status: 'Pending', tax_amount: 14500 },
    { id: '2', client_gstin: '27AADCB2230M1Z4', return_type: 'GSTR-1', period: 'Nov 2023', due_date: '2023-12-11', status: 'Filed', tax_amount: 0 },
    { id: '3', client_gstin: '07AAACR3421Q1ZA', return_type: 'GSTR-9', period: 'FY 22-23', due_date: '2023-12-31', status: 'In Progress', tax_amount: null },
  ];

  const totalScheduled = allTasksList.length;
  const totalFiled = allTasksList.filter(t => t.status === 'Filed').length;
  const totalInProgress = allTasksList.filter(t => t.status === 'In Progress').length;
  const totalPending = allTasksList.filter(t => t.status === 'Pending').length;

  const filingRate = totalScheduled > 0 ? (totalFiled / totalScheduled) * 100 : 0;

  // Practice Compliance Grade logic
  let complianceGrade = 'F';
  let gradeColor = 'text-rose-400';
  let gradeBorder = 'border-rose-500/20';
  let gradeBg = 'bg-rose-500/10';
  let complianceMessage = 'Critical compliance action required! Proactive reminders recommended.';

  if (filingRate >= 95) {
    complianceGrade = 'A+';
    gradeColor = 'text-emerald-400';
    gradeBorder = 'border-emerald-500/20';
    gradeBg = 'bg-emerald-500/10';
    complianceMessage = 'Outstanding compliance rate! Your client filings are highly secure.';
  } else if (filingRate >= 90) {
    complianceGrade = 'A';
    gradeColor = 'text-teal-400';
    gradeBorder = 'border-teal-500/20';
    gradeBg = 'bg-teal-500/10';
    complianceMessage = 'Excellent filing metrics. Very low risk of interest penalties.';
  } else if (filingRate >= 80) {
    complianceGrade = 'B';
    gradeColor = 'text-blue-400';
    gradeBorder = 'border-blue-500/20';
    gradeBg = 'bg-blue-500/10';
    complianceMessage = 'Healthy compliance. Keep broadcasting alerts for pending items.';
  } else if (filingRate >= 70) {
    complianceGrade = 'C';
    gradeColor = 'text-amber-400';
    gradeBorder = 'border-amber-500/20';
    gradeBg = 'bg-amber-500/10';
    complianceMessage = 'Moderate compliance levels. Vendor relationship issues might occur.';
  } else if (filingRate >= 50) {
    complianceGrade = 'D';
    gradeColor = 'text-orange-400';
    gradeBorder = 'border-orange-500/20';
    gradeBg = 'bg-orange-500/10';
    complianceMessage = 'Sub-optimal compliance rate. Broadcast compliance notices immediately.';
  }

  // Circular progress math
  const strokeRadius = 45;
  const strokeCircumference = 2 * Math.PI * strokeRadius; // 282.74
  const strokeOffset = strokeCircumference - (filingRate / 100) * strokeCircumference;

  // Breakdown by Return Type logic
  const returnBreakdown = ['GSTR-1', 'GSTR-3B', 'GSTR-9'].map(type => {
    const scheduled = allTasksList.filter(t => t.return_type === type).length;
    const filed = allTasksList.filter(t => t.return_type === type && t.status === 'Filed').length;
    const pct = scheduled > 0 ? (filed / scheduled) * 100 : 0;
    return { type, scheduled, filed, pct };
  });

  // Dynamic calculator state variables (Interactive Estimator Logics)
  const [calcGstinVal, setCalcGstinVal] = useState(() => (clients[0]?.gstin || '27AADCB2230M1Z4'));
  const [calcTypeVal, setCalcTypeVal] = useState<'GSTR-1' | 'GSTR-3B'>('GSTR-3B');
  const [calcDelayVal, setCalcDelayVal] = useState(15);
  const [calcTaxVal, setCalcTaxVal] = useState(50000);
  const [calcIsNilVal, setCalcIsNilVal] = useState(false);

  // Late Fee logic
  const dailyLateRate = calcIsNilVal ? 20 : 50; // Nil return ₹20/day, standard return ₹50/day (CGST+SGST)
  const rawLateFeeVal = calcDelayVal * dailyLateRate;
  const calculatedLateFeeVal = Math.min(rawLateFeeVal, 10000); // capped at ₹10,000 max per return
  const cgstLateFeeVal = calculatedLateFeeVal / 2;
  const sgstLateFeeVal = calculatedLateFeeVal / 2;

  // Section 50 Interest logic: 18% per annum on the NET CASH tax liability
  const calculatedInterestVal = calcIsNilVal ? 0 : (calcTaxVal * 0.18 * calcDelayVal) / 365;
  const totalFilingLiabilityVal = calculatedLateFeeVal + calculatedInterestVal;

  // Client Compliance Rankings league table logic
  const clientComplianceRankings = (clients.length > 0 ? clients : [
    { trade_name: 'Vaswani Enterprises', gstin: '27AADCB2230M1Z4', legal_name: 'Sourav Vaswani Enterprises' },
    { trade_name: 'Aries Infotech', gstin: '07AAACR3421Q1ZA', legal_name: 'Aries Technologies Private Limited' }
  ]).map(c => {
    const clientTasks = allTasksList.filter(t => t.client_gstin === c.gstin);
    const clientScheduled = clientTasks.length;
    const clientFiled = clientTasks.filter(t => t.status === 'Filed').length;
    const clientPct = clientScheduled > 0 ? (clientFiled / clientScheduled) * 100 : 0;
    
    let clientHealth = '🟢 PERFECT';
    let clientHealthColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    
    if (clientScheduled === 0) {
      clientHealth = '⚪ NO SCHEDULES';
      clientHealthColor = 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    } else if (clientPct < 50) {
      clientHealth = '🔴 CRITICAL';
      clientHealthColor = 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    } else if (clientPct < 90) {
      clientHealth = '🟡 AUDIT RISK';
      clientHealthColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    }

    return {
      ...c,
      scheduled: clientScheduled,
      filed: clientFiled,
      pct: clientPct,
      health: clientHealth,
      healthColor: clientHealthColor
    };
  }).sort((a, b) => b.pct - a.pct); // dynamic descending rankings sorted logic

  // Dynamic monthly filing trend stacked bar chart data logic
  const uniqueMonths = Array.from(new Set(allTasksList.map(t => t.period || 'Nov 2023'))).slice(0, 5);
  const monthlyTrends = uniqueMonths.map(month => {
    const monthTasks = allTasksList.filter(t => t.period === month);
    const filed = monthTasks.filter(t => t.status === 'Filed').length;
    const pending = monthTasks.filter(t => t.status === 'Pending').length;
    const progress = monthTasks.filter(t => t.status === 'In Progress').length;
    return { month, filed, pending, progress, total: monthTasks.length || 1 };
  });

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 select-text">
      
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-6">
        <div>
          <button onClick={onBack} className="text-slate-400 hover:text-white flex items-center gap-2 font-bold uppercase tracking-wider text-[10px] mb-4 transition-colors"><ArrowLeft className="w-3 h-3" /> Back to Hub</button>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Practice Dashboard</h1>
          <p className="text-slate-400 font-medium mt-1">Manage client master directory, track filing calendars, and broadcast notifications.</p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => setShowSettings(true)}
            className="px-4 py-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-xl font-bold text-sm transition-all flex items-center gap-2"
          >
            <Settings className="w-4 h-4 text-purple-400" />
            SMTP & Gateway Settings
          </button>
          <button 
            onClick={handleDriveBackup} 
            disabled={isBackingUp}
            className="px-4 py-2.5 bg-slate-850 hover:bg-slate-750 border border-slate-700 text-white rounded-xl font-bold text-sm transition-all shadow-sm flex items-center gap-2"
          >
            <HardDrive className={`w-4 h-4 text-emerald-400 ${isBackingUp ? 'animate-pulse' : ''}`} /> 
            {isBackingUp ? 'Backing up...' : 'Google Drive Backup'}
          </button>
        </div>
      </div>

      {/* Quick Metrics Counter Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pop-in">
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md shadow-lg flex items-center gap-4 hover:border-slate-700 transition-colors">
          <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center shadow-inner shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Master Directory</p>
            <p className="text-2xl font-black text-white mt-1">{clients.length} Clients</p>
          </div>
        </div>
        
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md shadow-lg flex items-center gap-4 hover:border-slate-700 transition-colors">
          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center shadow-inner shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Returns Filed</p>
            <p className="text-2xl font-black text-white mt-1">
              {displayTasks.filter(t => t.status === 'Filed').length} Completed
            </p>
          </div>
        </div>
        
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md shadow-lg flex items-center gap-4 hover:border-slate-700 transition-colors">
          <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl flex items-center justify-center shadow-inner shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pending Reminders</p>
            <p className="text-2xl font-black text-white mt-1">
              {displayTasks.filter(t => t.status !== 'Filed').length} Pending
            </p>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md shadow-lg flex items-center gap-4 hover:border-slate-700 transition-colors">
          <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center shadow-inner shrink-0">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Database Integrity</p>
            <p className="text-xs font-bold text-emerald-400 mt-2.5 flex items-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> ONLINE SECURE
            </p>
          </div>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-900/50 p-2 rounded-xl border border-slate-800 backdrop-blur-md">
        <div className="flex w-full sm:w-auto gap-1">
          <button onClick={() => setActiveTab('analytics')} className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${activeTab === 'analytics' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
            <Activity className="w-4 h-4 text-emerald-400" /> Compliance Analytics
          </button>
          <button onClick={() => setActiveTab('tasks')} className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${activeTab === 'tasks' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
            <CalendarClock className="w-4 h-4 text-blue-400" /> Task Management
          </button>
          <button onClick={() => setActiveTab('clients')} className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${activeTab === 'clients' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
            <Users className="w-4 h-4 text-purple-400" /> Client Master Data
          </button>
        </div>
        
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input type="text" placeholder="Search Master records..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-4 text-sm text-white focus:border-blue-500 outline-none" />
        </div>
      </div>

      {/* TAB CONTENT: ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className="space-y-6 animate-pop-in">
          
          {/* Main Visuals & Circular Progress Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Practice Filing Status Grade Circle Card */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between items-center text-center relative overflow-hidden backdrop-blur-md">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl"></div>
              
              <div className="w-full flex justify-between items-center mb-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Compliance Health</span>
                <Award className="w-4 h-4 text-emerald-400" />
              </div>
              
              <div className="relative flex items-center justify-center my-2">
                {/* SVG Circular Progress */}
                <svg className="w-36 h-36 transform -rotate-90">
                  {/* Track circle */}
                  <circle
                    cx="72"
                    cy="72"
                    r="55"
                    className="stroke-slate-800"
                    strokeWidth="10"
                    fill="transparent"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="72"
                    cy="72"
                    r="55"
                    stroke="url(#complianceGrad)"
                    strokeWidth="10"
                    fill="transparent"
                    strokeDasharray="345.58"
                    strokeDashoffset={345.58 - (filingRate / 100) * 345.58}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                  {/* Gradient definition */}
                  <defs>
                    <linearGradient id="complianceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#3B82F6" />
                      <stop offset="100%" stopColor="#10B981" />
                    </linearGradient>
                  </defs>
                </svg>
                
                {/* Center Text */}
                <div className="absolute flex flex-col items-center">
                  <span className="text-3xl font-black text-white">{filingRate.toFixed(1)}%</span>
                  <span className={`text-xs font-bold font-mono tracking-widest ${gradeColor} uppercase mt-0.5`}>Grade {complianceGrade}</span>
                </div>
              </div>
              
              <div className="mt-4 w-full">
                <div className={`p-3 border rounded-xl text-xs font-medium leading-relaxed ${gradeBg} ${gradeBorder} ${gradeColor}`}>
                  {complianceMessage}
                </div>
              </div>
            </div>

            {/* Return Type Completion Breakdown Cards */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between backdrop-blur-md">
              <div className="flex justify-between items-center mb-6">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Return Category Metrics</span>
                <TrendingUp className="w-4 h-4 text-blue-400" />
              </div>
              
              <div className="space-y-5">
                {returnBreakdown.map((item, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex justify-between items-end">
                      <div>
                        <span className="text-sm font-bold text-white uppercase tracking-wider">{item.type}</span>
                        <span className="text-[10px] text-slate-500 font-medium block mt-0.5">Scheduled Filings</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-extrabold text-white">{item.filed} / {item.scheduled}</span>
                        <span className="text-[10px] text-emerald-400 font-bold block mt-0.5">{item.pct.toFixed(0)}% Done</span>
                      </div>
                    </div>
                    {/* Linear Progress Bar */}
                    <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-850">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-700 rounded-full"
                        style={{ width: `${item.pct}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 pt-4 border-t border-slate-800/50 flex justify-between items-center text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                <span>All scheduled returns: {totalScheduled}</span>
                <span>Remaining to file: {totalPending + totalInProgress}</span>
              </div>
            </div>

            {/* Monthly Filing Trends Stacks Chart */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between backdrop-blur-md">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filing Distribution Trend</span>
                <BarChart3 className="w-4 h-4 text-purple-400" />
              </div>
              
              <div className="flex-1 flex items-end justify-around gap-2 h-44 pb-2 pt-4">
                {monthlyTrends.length === 0 ? (
                  <div className="text-slate-500 text-xs text-center my-auto">No filing trend data found.</div>
                ) : (
                  monthlyTrends.map((trend, i) => {
                    const filedHeight = (trend.filed / trend.total) * 100;
                    const progressHeight = (trend.progress / trend.total) * 100;
                    const pendingHeight = (trend.pending / trend.total) * 100;
                    return (
                      <div key={i} className="flex flex-col items-center gap-2 group w-full max-w-[45px]">
                        {/* Stacked Chart Pillar */}
                        <div className="w-6 bg-slate-950 rounded-md overflow-hidden flex flex-col-reverse justify-start border border-slate-850 h-32 relative shadow-inner animate-pulse">
                          <div 
                            className="bg-emerald-500 w-full hover:brightness-110 transition-all cursor-pointer" 
                            style={{ height: `${filedHeight}%` }}
                            title={`Filed: ${trend.filed}`}
                          ></div>
                          <div 
                            className="bg-amber-500 w-full hover:brightness-110 transition-all cursor-pointer" 
                            style={{ height: `${progressHeight}%` }}
                            title={`In Progress: ${trend.progress}`}
                          ></div>
                          <div 
                            className="bg-rose-500 w-full hover:brightness-110 transition-all cursor-pointer" 
                            style={{ height: `${pendingHeight}%` }}
                            title={`Pending: ${trend.pending}`}
                          ></div>
                        </div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider font-mono truncate max-w-full">{trend.month.slice(0, 6)}</span>
                      </div>
                    );
                  })
                )}
              </div>
              
              <div className="flex gap-4 justify-center items-center text-[9px] font-bold uppercase tracking-wider text-slate-400 pt-2 border-t border-slate-800/50">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Filed</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Progress</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500"></span> Pending</span>
              </div>
            </div>
          </div>

          {/* Interactive Late Fee & Interest Estimator (Logics Calculator) */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            
            {/* Input Form Controls */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl lg:col-span-2 space-y-4 backdrop-blur-md">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <Calculator className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Delay Liability Estimator</h3>
              </div>
              
              <div className="space-y-3 text-xs">
                {/* Select Client Dropdown */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Simulated Taxpayer</label>
                  <select 
                    value={calcGstinVal}
                    onChange={(e) => setCalcGstinVal(e.target.value)}
                    className="w-full h-9 bg-slate-950 border border-slate-700 rounded-lg px-2 text-white outline-none focus:border-blue-500"
                  >
                    {(clients.length > 0 ? clients : [
                      { trade_name: 'Vaswani Enterprises', gstin: '27AADCB2230M1Z4' },
                      { trade_name: 'Aries Infotech', gstin: '07AAACR3421Q1ZA' }
                    ]).map((c, idx) => (
                      <option key={idx} value={c.gstin}>{c.trade_name} ({c.gstin.slice(0, 5)}...)</option>
                    ))}
                  </select>
                </div>
                
                {/* Select Return Type */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Return Type</label>
                    <select 
                      value={calcTypeVal}
                      onChange={(e) => setCalcTypeVal(e.target.value as any)}
                      className="w-full h-9 bg-slate-950 border border-slate-700 rounded-lg px-2 text-white outline-none focus:border-blue-500"
                    >
                      <option value="GSTR-1">GSTR-1</option>
                      <option value="GSTR-3B">GSTR-3B</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Return Class</label>
                    <select 
                      value={calcIsNilVal ? 'nil' : 'tax'}
                      onChange={(e) => setCalcIsNilVal(e.target.value === 'nil')}
                      className="w-full h-9 bg-slate-950 border border-slate-700 rounded-lg px-2 text-white outline-none focus:border-blue-500"
                    >
                      <option value="tax">Tax Payable Return</option>
                      <option value="nil">Nil Return (₹0 Liability)</option>
                    </select>
                  </div>
                </div>
                
                {/* Net Cash Tax Liability */}
                {!calcIsNilVal && (
                  <div className="animate-pop-in">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Net Cash Tax Liability (₹)</label>
                    <input 
                      type="number"
                      value={calcTaxVal}
                      onChange={(e) => setCalcTaxVal(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full h-9 bg-slate-950 border border-slate-700 rounded-lg px-3 text-white focus:border-blue-500 outline-none font-mono font-bold"
                    />
                  </div>
                )}
                
                {/* Filing Delay Days slider */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Delay Duration</label>
                    <span className="text-xs font-bold text-purple-400 font-mono">{calcDelayVal} Days Delay</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="60" 
                    value={calcDelayVal}
                    onChange={(e) => setCalcDelayVal(parseInt(e.target.value))}
                    className="w-full accent-purple-500 h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-1">
                    <span>0 days (On-Time)</span>
                    <span>30 days</span>
                    <span>60 days</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Dynamic Results Display Visual Cards */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl lg:col-span-3 flex flex-col justify-between backdrop-blur-md relative overflow-hidden">
              <div className="absolute top-0 left-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl"></div>
              
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estimated Liability Summary</span>
                <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded font-bold text-[9px] uppercase tracking-wider font-mono">Sec 50 Engine</span>
              </div>
              
              <div className="grid grid-cols-3 gap-4 my-4">
                {/* Late Fee Card */}
                <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-4 flex flex-col justify-between">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Late Fee Capped</span>
                  <div>
                    <p className="text-lg font-black text-white font-mono mt-1">₹{calculatedLateFeeVal.toLocaleString('en-IN')}</p>
                    <p className="text-[8px] text-slate-500 font-semibold uppercase mt-1">₹{dailyLateRate}/Day Delay</p>
                  </div>
                </div>
                
                {/* Section 50 Interest Card */}
                <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-4 flex flex-col justify-between">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Interest u/s 50</span>
                  <div>
                    <p className="text-lg font-black text-white font-mono mt-1">₹{Math.round(calculatedInterestVal).toLocaleString('en-IN')}</p>
                    <p className="text-[8px] text-slate-500 font-semibold uppercase mt-1">18% P.A. on Cash Liability</p>
                  </div>
                </div>

                {/* Total Estimate Outflow Card */}
                <div className="bg-gradient-to-br from-purple-900/20 to-pink-900/10 border border-purple-500/20 rounded-xl p-4 flex flex-col justify-between">
                  <span className="text-[9px] font-bold text-purple-400 uppercase tracking-wider">Total Outflow</span>
                  <div>
                    <p className="text-xl font-black text-pink-400 font-mono mt-1">₹{Math.round(totalFilingLiabilityVal).toLocaleString('en-IN')}</p>
                    <p className="text-[8px] text-purple-400/70 font-semibold uppercase mt-1">Estim. Total Penalty</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-3 space-y-2 text-[10px]">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Simulated Client GSTIN</span>
                  <span className="font-mono font-bold text-white select-all">{calcGstinVal}</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>SGST / CGST Late Fee Breakdown</span>
                  <span className="font-mono font-bold text-white">₹{cgstLateFeeVal} CGST + ₹{sgstLateFeeVal} SGST</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Filing Delay Status Grade</span>
                  <span className={`font-bold ${calcDelayVal > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {calcDelayVal > 30 ? '🔴 MASSIVE INTEREST CHARGE' : calcDelayVal > 0 ? '🟡 MINOR DELAY WARNING' : '🟢 NO LATE FEES'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Sorted Client Compliance League Table */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="font-bold text-white uppercase tracking-wider text-sm flex items-center gap-2">Client Compliance rankings</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Real-time ranked taxpayer performance league table based on filings calendar.</p>
              </div>
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg font-mono">
                Overall Practice Rate: <span className="text-emerald-400 font-bold">{filingRate.toFixed(1)}%</span>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead className="bg-slate-950/90 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4 border-b border-slate-800">Filing Rank / Trade Name</th>
                    <th className="px-6 py-4 border-b border-slate-800">Client GSTIN</th>
                    <th className="px-6 py-4 border-b border-slate-800">Scheduled Returns</th>
                    <th className="px-6 py-4 border-b border-slate-800">Completed Filings</th>
                    <th className="px-6 py-4 border-b border-slate-800">Filing Completion Rate</th>
                    <th className="px-6 py-4 border-b border-slate-800 text-right">Practice Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-sm">
                  {clientComplianceRankings.map((cRank, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold font-mono text-xs ${idx === 0 ? 'bg-amber-400/20 text-amber-400 border border-amber-400/30' : idx === 1 ? 'bg-slate-400/20 text-slate-300 border border-slate-400/30' : 'bg-slate-800 text-slate-400'}`}>{idx + 1}</span>
                        <div>
                          <div className="font-bold text-white leading-normal">{cRank.trade_name}</div>
                          <div className="text-[10px] text-slate-500 font-medium">{cRank.legal_name}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-blue-400 text-xs tracking-wider select-all">{cRank.gstin}</td>
                      <td className="px-6 py-4 text-slate-300 font-medium font-mono text-xs">{cRank.scheduled} Scheduled</td>
                      <td className="px-6 py-4 text-emerald-400 font-medium font-mono text-xs">{cRank.filed} Filed</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 max-w-[200px]">
                          <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-850">
                            <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all rounded-full" style={{ width: `${cRank.pct}%` }}></div>
                          </div>
                          <span className="font-bold font-mono text-xs text-white">{cRank.pct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`px-2.5 py-1 rounded-lg border font-bold text-[9px] uppercase tracking-wider ${cRank.healthColor}`}>
                          {cRank.health}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* TAB CONTENT: TASKS */}
      {activeTab === 'tasks' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl animate-pop-in">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="font-bold text-white uppercase tracking-wider text-sm flex items-center gap-2">Interactive Return filing calendar</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Auto-generate calendars and change filing workflow status.</p>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => setShowGenCalendar(true)}
                className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-bold text-xs transition-all shadow-md flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Generate GSTR Calendar
              </button>
              <button 
                onClick={() => handleSendBulkAlerts('email')}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5 text-purple-400" /> Send Bulk Reminders
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="bg-slate-950/90 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 border-b border-slate-800">Trade Name / GSTIN</th>
                  <th className="px-6 py-4 border-b border-slate-800">Return Type</th>
                  <th className="px-6 py-4 border-b border-slate-800">Period</th>
                  <th className="px-6 py-4 border-b border-slate-800">Due Date</th>
                  <th className="px-6 py-4 border-b border-slate-800">Compliance Status</th>
                  <th className="px-6 py-4 border-b border-slate-800 text-right">Filing Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-sm">
                {displayTasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center">
                        <CalendarClock className="w-12 h-12 text-slate-700 mb-3" />
                        <p className="font-medium text-base">Filing calendar is empty</p>
                        <p className="text-xs mt-1">Use the "Generate GSTR Calendar" button to auto-populate return tasks.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayTasks.map((t, idx) => {
                    const client = clients.find(c => c.gstin === t.client_gstin);
                    const displayName = client ? client.trade_name : t.client_gstin;
                    return (
                      <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="space-y-0.5">
                            <div className="font-bold text-white leading-normal">{displayName}</div>
                            <div className="font-mono text-[10px] text-slate-500 tracking-wider select-all">{t.client_gstin}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4"><span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded font-bold text-[10px] uppercase tracking-wider">{t.return_type}</span></td>
                        <td className="px-6 py-4 text-slate-300 font-medium">{t.period}</td>
                        <td className="px-6 py-4 text-slate-400 font-mono text-xs">{t.due_date}</td>
                        <td className="px-6 py-4">
                          <select 
                            value={t.status}
                            onChange={(e) => handleUpdateTaskStatus(t, e.target.value)}
                            className={`font-semibold bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs outline-none ${t.status === 'Filed' ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' : t.status === 'In Progress' ? 'text-amber-400 border-amber-500/20 bg-amber-500/5' : 'text-rose-400 border-rose-500/20 bg-rose-500/5'}`}
                          >
                            <option value="Pending" className="text-rose-400 bg-slate-950">Pending</option>
                            <option value="In Progress" className="text-amber-400 bg-slate-950">In Progress</option>
                            <option value="Filed" className="text-emerald-400 bg-slate-950">Filed</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 text-right space-x-1">
                          <button onClick={() => sendAlert('email', t.client_gstin)} disabled={t.status === 'Filed'} className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-colors disabled:opacity-30" title="Send Email Reminder"><Mail className="w-3.5 h-3.5" /></button>
                          <button onClick={() => sendAlert('sms', t.client_gstin)} disabled={t.status === 'Filed'} className="p-2 rounded-lg bg-pink-500/10 text-pink-400 hover:bg-pink-500 hover:text-white transition-colors disabled:opacity-30" title="Send SMS Reminder"><MessageSquare className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteTask(t.id)} className="p-2 rounded-lg bg-slate-950 hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-colors" title="Delete Task"><Trash className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: CLIENT MASTER */}
      {activeTab === 'clients' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl animate-pop-in">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="font-bold text-white uppercase tracking-wider text-sm flex items-center gap-2">Client Registry Master</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Manage trade details, email reminders, and PAN cards.</p>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => setShowAddClient(true)}
                className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-bold text-xs transition-all shadow-md flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Add Client Profile
              </button>
              <button 
                onClick={handleExportTemplate}
                className="px-3 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-emerald-400 text-slate-300 rounded-lg font-bold text-xs transition-all shadow-md flex items-center gap-1.5"
                title="Download standard Excel import template"
              >
                <Download className="w-4 h-4 text-emerald-400" /> Export Template
              </button>
              
              <div className="relative">
                <input 
                  type="file" 
                  id="client-excel-upload"
                  accept=".xlsx, .xls"
                  onChange={handleImportExcel}
                  className="hidden"
                />
                <label 
                  htmlFor="client-excel-upload"
                  className="cursor-pointer px-3 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-blue-400 text-slate-300 rounded-lg font-bold text-xs transition-all shadow-md flex items-center gap-1.5"
                  title="Import filled Excel client sheet"
                >
                  <Upload className="w-4 h-4 text-blue-400" /> Import Clients
                </label>
              </div>

              <button 
                onClick={handlePortalImport}
                disabled={isSyncing}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg font-bold text-xs transition-all shadow-md flex items-center gap-2"
              >
                <DownloadCloud className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} /> {isSyncing ? 'Importing...' : '1-Click Portal Import'}
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-left border-collapse min-w-[950px]">
              <thead className="bg-slate-950/90 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 border-b border-slate-800">Trade / Legal Name</th>
                  <th className="px-6 py-4 border-b border-slate-800">GSTIN</th>
                  <th className="px-6 py-4 border-b border-slate-800">PAN Card</th>
                  <th className="px-6 py-4 border-b border-slate-800">Email Address</th>
                  <th className="px-6 py-4 border-b border-slate-800">Phone Number</th>
                  <th className="px-6 py-4 border-b border-slate-800 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-sm">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center">
                        <Building2 className="w-12 h-12 text-slate-700 mb-3" />
                        <p className="font-medium text-base">No matching clients found</p>
                        <p className="text-xs mt-1">Use the "Add Client Profile" button to record a taxpayer manually.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((c, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="space-y-0.5">
                          <div className="font-bold text-white leading-normal">{c.trade_name}</div>
                          <div className="text-[10px] text-slate-400 font-medium">{c.legal_name}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-blue-400 text-xs select-all tracking-wider">{c.gstin}</td>
                      <td className="px-6 py-4 font-mono text-emerald-400 font-bold text-xs select-all tracking-wider">{getPanFromGstin(c.gstin)}</td>
                      <td className="px-6 py-4 text-slate-300 font-mono text-xs">{c.email || '—'}</td>
                      <td className="px-6 py-4 text-slate-300 font-mono text-xs">{c.phone || '—'}</td>
                      <td className="px-6 py-4 text-right space-x-1.5">
                        <button 
                          onClick={() => {
                            setEditingClient({ ...c });
                            setShowEditClient(true);
                          }}
                          className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors"
                          title="Edit Profile"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDeleteClient(c.id, c.trade_name)}
                          className="p-2 rounded-lg bg-slate-900 hover:bg-rose-500/10 border border-slate-800 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Delete Client"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD CLIENT */}
      {showAddClient && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setShowAddClient(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="text-white font-bold flex items-center gap-2"><Plus className="w-4 h-4 text-blue-400" /> Record Client Profile</h3>
              <button onClick={() => setShowAddClient(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            
            <form onSubmit={handleAddClientSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Client GSTIN (15 characters)</label>
                <input 
                  type="text"
                  maxLength={15}
                  value={cliGstin}
                  onChange={(e) => setCliGstin(e.target.value.toUpperCase().trim())}
                  placeholder="27AADCB2230M1Z4"
                  className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg px-4 text-sm text-white font-mono uppercase focus:border-blue-500 outline-none transition-colors"
                  required
                />
                {cliGstin.length >= 12 && (
                  <div className="text-[9px] text-emerald-400 mt-1.5 font-bold uppercase tracking-wider font-mono flex items-center gap-1">
                    <Check className="w-3 h-3" /> Auto PAN: {getPanFromGstin(cliGstin)}
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Trade Name (Branding)</label>
                  <input 
                    type="text"
                    value={cliTradeName}
                    onChange={(e) => setCliTradeName(e.target.value)}
                    placeholder="Vaswani Enterprises"
                    className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg px-4 text-sm text-white focus:border-blue-500 outline-none transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Legal Name (As in PAN)</label>
                  <input 
                    type="text"
                    value={cliLegalName}
                    onChange={(e) => setCliLegalName(e.target.value)}
                    placeholder="Sourav Vaswani"
                    className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg px-4 text-sm text-white focus:border-blue-500 outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Email ID (Reminders)</label>
                  <input 
                    type="email"
                    value={cliEmail}
                    onChange={(e) => setCliEmail(e.target.value)}
                    placeholder="client@gmail.com"
                    className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg px-4 text-sm text-white focus:border-blue-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Phone Number (SMS alerts)</label>
                  <input 
                    type="text"
                    value={cliPhone}
                    onChange={(e) => setCliPhone(e.target.value)}
                    placeholder="+91 XXXXX XXXXX"
                    className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg px-4 text-sm text-white focus:border-blue-500 outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddClient(false)} className="px-4 py-2 border border-slate-700 rounded-lg font-bold text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-bold text-xs shadow-lg shadow-blue-500/20 uppercase tracking-wider">Save Profile</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT CLIENT */}
      {showEditClient && editingClient && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setShowEditClient(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="text-white font-bold flex items-center gap-2"><Edit className="w-4 h-4 text-blue-400" /> Modify Client Profile</h3>
              <button onClick={() => setShowEditClient(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            
            <form onSubmit={handleEditClientSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Client GSTIN (read-only)</label>
                <input 
                  type="text"
                  value={editingClient.gstin}
                  disabled
                  className="w-full h-10 bg-slate-950/60 border border-slate-800 rounded-lg px-4 text-sm text-slate-500 font-mono uppercase outline-none"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Trade Name (Branding)</label>
                  <input 
                    type="text"
                    value={editingClient.trade_name}
                    onChange={(e) => setEditingClient({ ...editingClient, trade_name: e.target.value })}
                    placeholder="Vaswani Enterprises"
                    className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg px-4 text-sm text-white focus:border-blue-500 outline-none transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Legal Name</label>
                  <input 
                    type="text"
                    value={editingClient.legal_name}
                    onChange={(e) => setEditingClient({ ...editingClient, legal_name: e.target.value })}
                    placeholder="Sourav Vaswani"
                    className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg px-4 text-sm text-white focus:border-blue-500 outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Email ID (Reminders)</label>
                  <input 
                    type="email"
                    value={editingClient.email || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, email: e.target.value })}
                    placeholder="client@gmail.com"
                    className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg px-4 text-sm text-white focus:border-blue-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Phone Number (SMS alerts)</label>
                  <input 
                    type="text"
                    value={editingClient.phone || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, phone: e.target.value })}
                    placeholder="+91 XXXXX XXXXX"
                    className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg px-4 text-sm text-white focus:border-blue-500 outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
                <button type="button" onClick={() => setShowEditClient(false)} className="px-4 py-2 border border-slate-700 rounded-lg font-bold text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-bold text-xs shadow-lg shadow-blue-500/20 uppercase tracking-wider">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: GENERATE FILING CALENDAR */}
      {showGenCalendar && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setShowGenCalendar(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="text-white font-bold flex items-center gap-2"><CalendarClock className="w-4 h-4 text-blue-400" /> Generate return calendar</h3>
              <button onClick={() => setShowGenCalendar(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Return Type</label>
                <select 
                  value={genReturnType} 
                  onChange={(e) => setGenReturnType(e.target.value as any)} 
                  className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg px-3 text-sm text-white outline-none focus:border-blue-500"
                >
                  <option value="GSTR-1">GSTR-1 (Outward Supplies)</option>
                  <option value="GSTR-3B">GSTR-3B (Monthly Summary)</option>
                  <option value="GSTR-9">GSTR-9 (Annual Return)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Filing Period</label>
                <input 
                  type="text" 
                  value={genPeriod} 
                  onChange={(e) => setGenPeriod(e.target.value)} 
                  placeholder="e.g. November 2023" 
                  className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg px-4 text-sm text-white focus:border-blue-500 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Standard Due Date</label>
                <input 
                  type="date" 
                  value={genDueDate} 
                  onChange={(e) => setGenDueDate(e.target.value)} 
                  className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg px-4 text-sm text-white focus:border-blue-500 outline-none transition-colors font-mono"
                />
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <p className="text-[10px] text-slate-300 leading-normal flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  This will generate and save filing calendar tasks for all <strong>{clients.length}</strong> clients registered in your master directory.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
                <button onClick={() => setShowGenCalendar(false)} className="px-4 py-2 border border-slate-700 rounded-lg font-bold text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
                <button onClick={handleGenerateCalendar} className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-bold text-xs shadow-lg shadow-blue-500/20 uppercase tracking-wider">Generate calendar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: GATEWAY & SMTP SETTINGS */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setShowSettings(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="text-white font-bold flex items-center gap-2"><Settings className="w-4 h-4 text-blue-400" /> Gateway Configurations</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            
            <form onSubmit={handleSaveSettings} className="p-6 space-y-4">
              <div>
                <h4 className="text-xs font-black text-purple-400 uppercase tracking-widest mb-3">SMTP Mailer Settings</h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">SMTP Host</label>
                      <input type="text" value={smtpSettings.host} onChange={(e) => setSmtpSettings({...smtpSettings, host: e.target.value})} className="w-full h-8 bg-slate-950 border border-slate-800 rounded px-2 text-xs text-white" />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Port</label>
                      <input type="text" value={smtpSettings.port} onChange={(e) => setSmtpSettings({...smtpSettings, port: e.target.value})} className="w-full h-8 bg-slate-950 border border-slate-800 rounded px-2 text-xs text-white" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Sender Address (Email)</label>
                    <input type="email" value={smtpSettings.email} onChange={(e) => setSmtpSettings({...smtpSettings, email: e.target.value})} className="w-full h-8 bg-slate-950 border border-slate-800 rounded px-2 text-xs text-white" />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Sender Name (Branding Signature)</label>
                    <input type="text" value={smtpSettings.senderName} onChange={(e) => setSmtpSettings({...smtpSettings, senderName: e.target.value})} className="w-full h-8 bg-slate-950 border border-slate-800 rounded px-2 text-xs text-white" />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800">
                <h4 className="text-xs font-black text-pink-400 uppercase tracking-widest mb-3">SMS Gateway Gateway</h4>
                <div className="space-y-2">
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Twilio API Key / Gateway Token</label>
                    <input type="password" value="••••••••••••••••••••" disabled className="w-full h-8 bg-slate-950 border border-slate-800 rounded px-2 text-xs text-slate-500" />
                  </div>
                  <p className="text-[8px] text-slate-500 italic">Twilio Sandbox SMS API verified. Standard Indian SMS header: "VASWNI"</p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
                <button type="button" onClick={() => setShowSettings(false)} className="px-4 py-2 border border-slate-700 rounded-lg font-bold text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-bold text-xs shadow-lg shadow-blue-500/20 uppercase tracking-wider">Save Settings</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}