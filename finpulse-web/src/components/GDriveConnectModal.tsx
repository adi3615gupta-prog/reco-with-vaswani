// Google Drive Admin Setup & Status Modal
// Only the admin needs to do a one-time setup. After that, all users auto-backup.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Cloud, Key, CheckCircle2, LogOut, ShieldCheck, X, ExternalLink, Sparkles, RefreshCw, Lock, Copy, ClipboardCheck } from 'lucide-react';
import {
  checkGDriveStatus,
  adminSetupGDrive,
  disconnectGoogleDrive,
  buildAdminOAuthUrl,
  getStoredAdminClientId,
  setStoredAdminClientId,
  getStoredAdminClientSecret,
  setStoredAdminClientSecret,
} from '@/lib/gdrive';
import { toast } from 'sonner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: () => void;
  isAdmin?: boolean;
}

export function GDriveConnectModal({ isOpen, onClose, onConnected, isAdmin = true }: Props) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [configuredAt, setConfiguredAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'check' | 'setup' | 'code' | 'done'>('check');
  const [oauthUrl, setOauthUrl] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setClientId(getStoredAdminClientId() || '');
      setClientSecret(getStoredAdminClientSecret() || '');
      setCopiedUrl(false);

      // Auto-detect auth code from URL query (Google redirects back with ?code=xxx)
      const urlParams = new URLSearchParams(window.location.search);
      const codeFromUrl = urlParams.get('code');
      if (codeFromUrl) {
        setAuthCode(codeFromUrl);
        // Clean the URL to remove the code parameter
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        setAuthCode('');
      }

      // Check if already configured
      checkGDriveStatus().then(status => {
        setIsConfigured(status.configured);
        setConfiguredAt(status.configured_at);
        if (status.configured) {
          setStep('done');
        } else if (codeFromUrl) {
          setStep('code');
        } else {
          setStep('setup');
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGenerateOAuthUrl = () => {
    if (!clientId.trim()) {
      toast.error('Please enter your Google Client ID');
      return;
    }
    if (!clientSecret.trim()) {
      toast.error('Please enter your Google Client Secret');
      return;
    }
    setStoredAdminClientId(clientId);
    setStoredAdminClientSecret(clientSecret);
    const url = buildAdminOAuthUrl(clientId);
    setOauthUrl(url);
    setStep('code');
    // Open the Google consent screen in a new tab
    window.open(url, '_blank');
  };

  const handleSubmitAuthCode = async () => {
    if (!authCode.trim()) {
      toast.error('Please paste the authorization code from Google');
      return;
    }
    setLoading(true);
    try {
      const result = await adminSetupGDrive(clientId, clientSecret, authCode.trim());
      if (result.success) {
        toast.success('Google Drive connected! All users can now auto-backup.');
        setIsConfigured(true);
        setConfiguredAt(new Date().toISOString());
        setStep('done');
        onConnected?.();
      } else {
        let detailMsg = result.error;
        if (result.details) {
          try {
            const parsed = typeof result.details === 'string' ? JSON.parse(result.details) : result.details;
            detailMsg = parsed.error_description || parsed.error || result.details;
          } catch (e) {
            detailMsg = result.details;
          }
        }
        toast.error(`Setup Failed: ${detailMsg || 'Failed to connect'}`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnectGoogleDrive();
    setIsConfigured(false);
    setConfiguredAt(null);
    setStep('setup');
    toast.info('Google Drive disconnected');
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(oauthUrl);
    setCopiedUrl(true);
    toast.success('OAuth URL copied to clipboard');
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[99999] bg-black/75 backdrop-blur-md" onClick={onClose} />
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto bg-slate-900 border border-sky-500/40 rounded-3xl shadow-2xl shadow-sky-500/20 w-full max-w-lg overflow-hidden animate-in zoom-in-95 fade-in duration-200">
          
          {/* Header */}
          <div className="bg-gradient-to-r from-sky-900/50 via-indigo-900/40 to-slate-900 px-6 py-5 flex items-center justify-between border-b border-sky-500/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center shadow-lg">
                <Cloud className="w-5 h-5 text-sky-300 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Google Drive Cloud Backup</h3>
                <p className="text-[10.5px] text-sky-200/70 mt-0.5">Central admin backup — no login required for users</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            
            {/* Status Card */}
            <div className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${
              isConfigured
                ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200'
                : 'bg-slate-950/60 border-slate-800 text-slate-300'
            }`}>
              <div className="flex items-center gap-3">
                {isConfigured ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0 animate-bounce" />
                ) : (
                  <ShieldCheck className="w-6 h-6 text-slate-500 flex-shrink-0" />
                )}
                <div>
                  <p className="text-xs font-black uppercase tracking-wider">
                    {isConfigured ? '☁️ Cloud Backup Active' : 'Cloud Backup Not Configured'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {isConfigured
                      ? `All reconciliations auto-save to admin's Google Drive${configuredAt ? ` • Since ${new Date(configuredAt).toLocaleDateString()}` : ''}`
                      : 'Admin needs to connect Google Drive once — then it works for everyone'}
                  </p>
                </div>
              </div>

              {isConfigured && isAdmin && (
                <button
                  onClick={handleDisconnect}
                  className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all"
                  title="Disconnect admin account"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              )}
            </div>

            {/* STEP: SETUP - Enter Client ID & Secret */}
            {step === 'setup' && isAdmin && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-[10.5px] font-black text-slate-300 uppercase tracking-wider flex items-center justify-between">
                    <span>Google OAuth Client ID</span>
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[9.5px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-bold lowercase transition-colors"
                    >
                      console.cloud.google.com <ExternalLink className="w-3 h-3" />
                    </a>
                  </label>
                  <div className="relative">
                    <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Enter Google Client ID"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full h-10 bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400 font-mono transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10.5px] font-black text-slate-300 uppercase tracking-wider">
                    Google OAuth Client Secret
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="password"
                      placeholder="Client secret from Google Cloud Console"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      className="w-full h-10 bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400 font-mono transition-all"
                    />
                  </div>
                </div>

                <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-xl space-y-2 text-[10px] text-amber-200/90 leading-relaxed">
                  <p className="font-bold text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Fix "Error 400: redirect_uri_mismatch":
                  </p>
                  <p className="text-[9.5px]">In Google Cloud Console → <strong>Credentials</strong> → click your <strong>OAuth Client</strong> → under <strong>Authorized redirect URIs</strong>, add this exact URL:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-1.5 bg-slate-950 border border-amber-500/40 rounded text-amber-300 text-[10px] font-mono select-all">
                      {typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.origin);
                        toast.success('Redirect URI copied!');
                      }}
                      className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-[9px] font-bold uppercase transition-all"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5 text-[10px] text-slate-400 leading-relaxed">
                  <p className="font-bold text-slate-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-sky-400" /> One-Time Admin Setup:
                  </p>
                  <ol className="list-decimal list-inside space-y-0.5 text-[9.5px] text-slate-400">
                    <li>Open your downloaded <code>credentials.json</code> file or Google Cloud Console.</li>
                    <li>Copy <strong>client_id</strong> and <strong>client_secret</strong>.</li>
                    <li>Paste them above and click <strong>Authorize Google Drive</strong>.</li>
                    <li>Sign in with YOUR Google account once → paste the authorization code.</li>
                    <li>After setup, <strong>all users auto-backup without any Google login!</strong></li>
                  </ol>
                </div>
              </div>
            )}

            {/* STEP: CODE - Paste authorization code */}
            {step === 'code' && isAdmin && (
              <div className="space-y-3">
                <div className="p-3 bg-sky-950/50 border border-sky-500/30 rounded-xl text-[10px] text-sky-200 leading-relaxed">
                  <p className="font-bold text-sky-300 mb-1">Step 2: Paste the Authorization Code</p>
                  <p>A Google sign-in window was opened. After you sign in and grant access, Google will redirect you to a page showing a <strong>code</strong>.</p>
                  <p className="mt-1">Copy that code and paste it below.</p>
                </div>

                {oauthUrl && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyUrl}
                      className="flex-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                    >
                      {copiedUrl ? <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedUrl ? 'Copied!' : 'Copy OAuth URL Again'}
                    </button>
                    <button
                      onClick={() => window.open(oauthUrl, '_blank')}
                      className="px-3 py-2 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open Again
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10.5px] font-black text-slate-300 uppercase tracking-wider">
                    Authorization Code from Google
                  </label>
                  <textarea
                    placeholder="Paste the authorization code here..."
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    className="w-full h-20 bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400 font-mono transition-all resize-none"
                  />
                </div>
              </div>
            )}

            {/* STEP: DONE - Already configured */}
            {step === 'done' && (
              <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl text-center space-y-2">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Cloud className="w-6 h-6 text-emerald-400" />
                </div>
                <p className="text-sm font-bold text-emerald-300">Cloud Backup is Active!</p>
                <p className="text-[10px] text-slate-400 leading-relaxed max-w-sm mx-auto">
                  Every reconciliation session is automatically backed up to the admin's Google Drive. 
                  No user on any PC needs to log into Google — it just works silently in the background.
                </p>
              </div>
            )}

          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between gap-3">
            {step === 'code' && (
              <button
                onClick={() => setStep('setup')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all"
              >
                ← Back
              </button>
            )}
            {step !== 'code' && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all"
              >
                Close
              </button>
            )}

            <div className="flex items-center gap-2">
              {step === 'setup' && isAdmin && (
                <button
                  onClick={handleGenerateOAuthUrl}
                  disabled={!clientId.trim() || !clientSecret.trim()}
                  className="px-6 py-2.5 bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-700 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-40 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-sky-500/20 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                >
                  <Cloud className="w-4 h-4" />
                  <span>Authorize Google Drive</span>
                </button>
              )}

              {step === 'code' && (
                <button
                  onClick={handleSubmitAuthCode}
                  disabled={loading || !authCode.trim()}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 via-green-600 to-emerald-700 hover:from-emerald-500 hover:to-green-500 disabled:opacity-40 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Complete Setup</span>
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </>,
    document.body
  );
}
