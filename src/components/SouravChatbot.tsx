import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Key,
  ExternalLink,
  RotateCcw,
  Bot,
  User,
  ArrowRight,
  ShieldCheck,
  ChevronDown
} from 'lucide-react';
import {
  sendChatMessage,
  getGeminiStatus,
  saveGeminiApiKey,
  syncGeminiFromCloud,
  extractActionTags,
  ACTION_NAV_TARGETS,
  ChatMessage,
  GeminiContext
} from '../lib/geminiApi';
import { toast } from 'sonner';

interface SouravChatbotProps {
  clientName?: string;
  gstin?: string;
  financialYear?: string;
  activeModule?: string;
  onNavigate?: (route: string, tabId?: string) => void;
  onOpenSettings?: (tab?: string) => void;
}

export const SouravChatbot: React.FC<SouravChatbotProps> = ({
  clientName = '',
  gstin = '',
  financialYear = '2024-25',
  activeModule = 'General Dashboard',
  onNavigate,
  onOpenSettings,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);

  // Quick API key setup banner state
  const [quickApiKey, setQuickApiKey] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initial status check on mount
  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    const res = await getGeminiStatus();
    setIsConfigured(res.configured);
  };

  // Auto-scroll on message updates or drawer open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        inputRef.current?.focus();
      }, 150);
    }
  }, [isOpen, messages, isLoading]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const prompt = input.trim();
    if (!prompt || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', text: prompt };
    const updatedHistory = [...messages, userMessage];

    setMessages(updatedHistory);
    setInput('');
    setIsLoading(true);

    const context: GeminiContext = {
      clientName: clientName || undefined,
      gstin: gstin || undefined,
      fy: financialYear,
      module: activeModule,
    };

    try {
      const replyText = await sendChatMessage(prompt, context, messages);
      setMessages([...updatedHistory, { role: 'model', text: replyText }]);
    } catch (err: any) {
      console.error('[SouravChatbot Error]:', err);
      let errorResponse = 'An error occurred while connecting to Sourav. Please check your internet or API key.';
      if (err.unconfigured || err.message?.includes('not configured')) {
        setIsConfigured(false);
        setShowKeyInput(true);
        errorResponse = '⚠️ **Google Gemini API Key is required.** Please enter your free API key below or in Settings → AI Assistant.';
      } else if (err.message?.includes('quota') || err.status === 429) {
        errorResponse = '⏳ **Quota Reached:** Google Gemini free tier limit reached (15 requests/min). Please wait a moment and try again.';
      } else if (err.message) {
        errorResponse = `⚠️ ${err.message}`;
      }

      setMessages([...updatedHistory, { role: 'model', text: errorResponse }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveQuickKey = async () => {
    const key = quickApiKey.trim();
    if (!key) return;
    setIsSavingKey(true);
    try {
      await saveGeminiApiKey(key);
      setIsConfigured(true);
      setShowKeyInput(false);
      setQuickApiKey('');
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: '✨ **Gemini API Key activated successfully!** I am ready. How can I assist you with your GST compliance or audit today?',
        },
      ]);
    } catch (err: any) {
      alert(`Failed to save API key: ${err.message || err}`);
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleSyncFromOfficeLicense = async () => {
    setIsSyncingCloud(true);
    try {
      const res = await syncGeminiFromCloud();
      setIsConfigured(true);
      setShowKeyInput(false);
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: `✨ **Gemini API Key synced from ${res.origin === 'cloud_office' ? 'Office Cloud License' : 'Global Master Settings'}!** Sourav AI is now active and ready to assist you.`,
        },
      ]);
      toast.success('Synced from Cloud License', {
        description: res.message || 'Gemini API key configured successfully.',
      });
    } catch (err: any) {
      toast.error('Cloud Sync Failed', {
        description: err.message || 'No Gemini key found in cloud license. Please paste your key below.',
      });
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleActionClick = (target: string) => {
    const targetInfo = ACTION_NAV_TARGETS[target];
    if (!targetInfo) return;

    if (target === 'settings') {
      if (onOpenSettings) onOpenSettings('ai');
      return;
    }

    if (onNavigate) {
      onNavigate(targetInfo.route || 'reco', targetInfo.tabId);
    } else {
      // Global event fallback
      window.dispatchEvent(
        new CustomEvent('app-navigate', {
          detail: { route: targetInfo.route, tabId: targetInfo.tabId },
        })
      );
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  return (
    <>
      {/* 1. Floating Action Bubble (Bottom-Right) */}
      <div className="fixed bottom-6 right-6 z-50">
        {!isOpen ? (
          <button
            onClick={() => setIsOpen(true)}
            aria-label="Open Sourav AI Assistant"
            className="group relative flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 text-slate-950 font-semibold shadow-xl shadow-amber-500/25 border border-amber-300/60 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
          >
            <div className="relative">
              <Sparkles className="w-5 h-5 text-slate-950 animate-spin-slow" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-600 ring-2 ring-white animate-pulse" />
            </div>
            <span className="text-sm tracking-tight font-bold">✨ Sourav AI</span>
          </button>
        ) : null}
      </div>

      {/* 2. Slide-In Chat Drawer Panel */}
      {isOpen && (
        <div
          className="fixed bottom-6 right-6 z-50 w-[410px] max-w-[calc(100vw-2rem)] h-[580px] max-h-[calc(100vh-5rem)] bg-[#0d1117] text-slate-100 border border-slate-800 shadow-2xl rounded-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-200"
          style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75), 0 0 30px rgba(245, 158, 11, 0.15)' }}
        >
          {/* Header */}
          <div className="px-4 py-3.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-slate-950 font-bold text-sm shadow-sm">
                <Sparkles className="w-4 h-4 fill-slate-950 text-slate-950" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-100 tracking-tight">Sourav · AI Copilot</span>
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      isConfigured ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                    }`}
                    title={isConfigured ? 'Gemini API Active' : 'API Key Required'}
                  />
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Powered by Gemini 2.0 Flash
                </div>
              </div>
            </div>

            {/* Header controls */}
            <div className="flex items-center gap-1 text-slate-400">
              {messages.length > 0 && (
                <button
                  onClick={handleClearChat}
                  title="Clear Chat History"
                  className="p-1.5 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              {onOpenSettings && (
                <button
                  onClick={() => onOpenSettings('ai')}
                  title="AI Settings"
                  className="p-1.5 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <Key className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                title="Close Assistant"
                className="p-1.5 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Active Context Bar */}
          <div className="px-3.5 py-1.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto text-[10px] text-slate-400 scrollbar-none shrink-0">
            <span className="shrink-0 text-slate-500 font-semibold uppercase tracking-wider text-[9px]">Context:</span>
            {clientName ? (
              <span className="px-2 py-0.5 rounded bg-slate-800/80 text-amber-300 font-medium truncate max-w-[150px]">
                {clientName}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-slate-800/50 text-slate-400">No client selected</span>
            )}
            <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 font-mono">
              FY {financialYear}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 truncate max-w-[120px]">
              {activeModule}
            </span>
          </div>

          {/* Inline Quick API Key Setup Banner (if unconfigured or toggled) */}
          {(isConfigured === false || showKeyInput) && (
            <div className="p-3 bg-amber-950/40 border-b border-amber-700/50 text-amber-200 shrink-0 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  Google Gemini API Key Required
                </span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-amber-300 underline hover:text-amber-100 flex items-center gap-1"
                >
                  Get free key <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>

              {/* 1-Click Sync Button */}
              <button
                type="button"
                onClick={handleSyncFromOfficeLicense}
                disabled={isSyncingCloud}
                className="w-full py-1.5 px-3 rounded-lg bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Automatically fetch the Gemini API key configured in your office license"
              >
                <Sparkles className={`w-3.5 h-3.5 fill-slate-950 ${isSyncingCloud ? 'animate-spin' : ''}`} />
                <span>{isSyncingCloud ? 'Syncing with Office License...' : '⚡ 1-Click Sync from Office License'}</span>
              </button>

              <div className="flex items-center gap-2 pt-1 border-t border-amber-800/40">
                <input
                  type="password"
                  value={quickApiKey}
                  onChange={(e) => setQuickApiKey(e.target.value)}
                  placeholder="Or paste API key manually (AIzaSy...)"
                  className="flex-1 bg-slate-900 border border-amber-500/40 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
                <button
                  onClick={handleSaveQuickKey}
                  disabled={isSavingKey || !quickApiKey.trim()}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-600/50 font-semibold rounded text-xs transition-colors disabled:opacity-50"
                >
                  {isSavingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {/* Welcome banner if no messages */}
            {messages.length === 0 && (
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2.5 text-slate-300">
                <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                  <Sparkles className="w-4 h-4" />
                  <span>Welcome to Sourav AI!</span>
                </div>
                <p className="leading-relaxed">
                  I'm your intelligent compliance co-pilot. I know all statutory GST laws, return rules, and the 12 modules in this software.
                </p>
                <div className="pt-2 border-t border-slate-800/60 space-y-1.5 text-[11px]">
                  <div className="text-slate-400 font-medium">Try asking:</div>
                  <div className="space-y-1">
                    <button
                      onClick={() => setInput('What are the conditions to claim ITC under Section 16(2)(aa)?')}
                      className="w-full text-left p-1.5 rounded bg-slate-800/50 hover:bg-slate-800 text-amber-200/90 transition-colors truncate"
                    >
                      • What are the conditions to claim ITC under Sec 16(2)(aa)?
                    </button>
                    <button
                      onClick={() => setInput('GSTR-2B me mismatch aa raha hai, kaise reconcile karein?')}
                      className="w-full text-left p-1.5 rounded bg-slate-800/50 hover:bg-slate-800 text-amber-200/90 transition-colors truncate"
                    >
                      • 2B me mismatch aa raha hai, kaise reconcile karein?
                    </button>
                    <button
                      onClick={() => setInput('Show me the IMS Decision Hub')}
                      className="w-full text-left p-1.5 rounded bg-slate-800/50 hover:bg-slate-800 text-amber-200/90 transition-colors truncate"
                    >
                      • Take me to the IMS Decision Hub
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Conversation turns */}
            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const { cleanText, actions } = isUser
                ? { cleanText: msg.text, actions: [] }
                : extractActionTags(msg.text);

              return (
                <div
                  key={idx}
                  className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 font-bold flex items-center justify-center shrink-0 mt-0.5 text-[11px]">
                      S
                    </div>
                  )}

                  <div className={`space-y-2 max-w-[85%]`}>
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? 'bg-amber-600 text-white rounded-tr-xs shadow-md shadow-amber-600/20'
                          : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-xs'
                      }`}
                    >
                      {cleanText}
                    </div>

                    {/* Interactive Action Buttons (Pills) */}
                    {actions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {actions.map((act, aIdx) => (
                          <button
                            key={aIdx}
                            onClick={() => handleActionClick(act.target)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-medium transition-all cursor-pointer hover:border-amber-400"
                          >
                            <span>{act.label}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {isUser && (
                    <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center shrink-0 mt-0.5 text-[10px]">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 font-bold flex items-center justify-center shrink-0 mt-0.5 text-[11px]">
                  S
                </div>
                <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-xs bg-slate-900 border border-slate-800 text-slate-400 flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-[11px] text-slate-400">Sourav is thinking...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input */}
          <form
            onSubmit={handleSend}
            className="p-3 bg-slate-900/90 border-t border-slate-800 flex items-center gap-2 shrink-0 backdrop-blur-md"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about GST, 2B vs Books, or tasks..."
              disabled={isLoading}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/70 transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="p-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-amber-500/20 cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
              ) : (
                <Send className="w-4 h-4 text-slate-950" />
              )}
            </button>
          </form>
        </div>
      )}
    </>
  );
};
