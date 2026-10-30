import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  X,
  Minus,
  Send,
  Loader2,
  ExternalLink,
  RotateCcw,
  Bot,
  User,
  ArrowRight,
  ShieldCheck,
  Move
} from 'lucide-react';
import {
  sendChatMessage,
  getGeminiStatus,
  extractActionTags,
  ACTION_NAV_TARGETS,
  ChatMessage,
  GeminiContext
} from '../lib/geminiApi';

/**
 * Inline markdown formatter for chat bubbles in the desktop copilot
 */
function formatInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={match.index} className="font-semibold text-amber-200">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={match.index}
          className="px-1 py-0.5 mx-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[11px] border border-slate-700/60"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

const DesktopFormattedMessage: React.FC<{ content: string; isUser: boolean }> = ({ content, isUser }) => {
  if (isUser) {
    return <div className="leading-relaxed whitespace-pre-wrap">{content}</div>;
  }

  const lines = content.split('\n');

  return (
    <div className="space-y-1.5 leading-relaxed text-slate-200 text-xs">
      {lines.map((line, lIdx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={lIdx} className="h-1" />;
        }

        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={lIdx} className="font-bold text-amber-300 text-xs mt-2 mb-0.5">
              {formatInline(trimmed.replace(/^###\s+/, ''))}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={lIdx} className="font-bold text-amber-400 text-xs mt-2.5 mb-1">
              {formatInline(trimmed.replace(/^##\s+/, ''))}
            </h3>
          );
        }

        if (/^[\*\-]\s+/.test(trimmed)) {
          return (
            <div key={lIdx} className="flex items-start gap-1.5 pl-1.5 text-slate-300 text-[11px]">
              <span className="text-amber-400 select-none leading-4">•</span>
              <span className="flex-1">{formatInline(trimmed.replace(/^[\*\-]\s+/, ''))}</span>
            </div>
          );
        }

        if (/^\d+\.\s+/.test(trimmed)) {
          const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
          return (
            <div key={lIdx} className="flex items-start gap-1.5 pl-1.5 text-slate-300 text-[11px]">
              <span className="text-amber-400/90 font-mono text-[10px] select-none pt-0.5">
                {numMatch ? numMatch[1] : '1'}.
              </span>
              <span className="flex-1">{formatInline(numMatch ? numMatch[2] : trimmed)}</span>
            </div>
          );
        }

        return (
          <p key={lIdx} className="text-slate-200 leading-relaxed text-[11.5px]">
            {formatInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
};

export default function CopilotDesktop() {
  const [expanded, setExpanded] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [configured, setConfigured] = useState<boolean>(true);
  const [context, setContext] = useState<GeminiContext>({
    module: 'Desktop Copilot (Universal)'
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null;

  // Ensure transparent background on window body for transparent desktop overlay
  useEffect(() => {
    document.documentElement.classList.add('bg-transparent');
    document.body.classList.add('bg-transparent');
    document.body.style.backgroundColor = 'transparent';
    return () => {
      document.body.style.backgroundColor = '';
    };
  }, []);

  // Auto-focus input when expanded
  useEffect(() => {
    if (expanded) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [expanded]);

  // Listen for global shortcut or tray toggle events
  useEffect(() => {
    if (electronAPI?.onCopilotToggleState) {
      const cleanup = electronAPI.onCopilotToggleState(() => {
        handleToggleExpand();
      });
      return cleanup;
    }
  }, [expanded]);

  // Sync window bounds when expanded state changes
  const handleToggleExpand = (forceState?: boolean) => {
    const nextState = typeof forceState === 'boolean' ? forceState : !expanded;
    setExpanded(nextState);
    if (electronAPI?.resizeCopilot) {
      electronAPI.resizeCopilot(nextState);
    }
  };

  // Initial welcome message
  useEffect(() => {
    getGeminiStatus().then((s) => setConfigured(s.configured));

    setMessages([
      {
        role: 'model',
        text: '👋 **Namaste! I am Sourav, your Universal Desktop AI Copilot ("Loco Pilot").**\n\nI float over all your applications — Excel, Tally, Chrome, and Desktop.\n\nAsk me any GST or tax question, or tell me to open a client in **AUDIT WITH VASWANI** (e.g. *"open 3b working of siddha"*).'
      }
    ]);
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (expanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, expanded]);

  const handleSend = async (customText?: string) => {
    const textToSend = customText || input.trim();
    if (!textToSend || loading) return;

    setInput('');
    const userMsg: ChatMessage = { role: 'user', text: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const reply = await sendChatMessage(textToSend, context, messages);
      setMessages((prev) => [...prev, { role: 'model', text: reply }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: `⚠️ **Unable to complete request:** ${err.message || 'Check your Gemini API key in Settings.'}`
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleActionClick = (target: string, gstin?: string, fy?: string, month?: string) => {
    if (electronAPI?.navigateApp) {
      electronAPI.navigateApp({ target, gstin, fy, month });
    }
  };

  // Collapsed View: Floating Amber Glowing Orb (64x64)
  if (!expanded) {
    return (
      <div className="w-16 h-16 flex items-center justify-center select-none bg-transparent overflow-hidden">
        <button
          onClick={() => handleToggleExpand(true)}
          title="Click to open Sourav AI Copilot (Ctrl+Alt+S)"
          style={{ WebkitAppRegion: 'no-drag' } as any}
          className="relative group w-14 h-14 rounded-full bg-gradient-to-tr from-amber-600 via-amber-500 to-amber-400 p-0.5 shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer flex items-center justify-center border border-amber-300/40"
        >
          {/* Pulsing ring */}
          <span className="absolute inset-0 rounded-full bg-amber-400 animate-ping opacity-25" />
          
          <div className="w-full h-full rounded-full bg-slate-950 flex flex-col items-center justify-center relative z-10">
            <Sparkles className="w-6 h-6 text-amber-400 animate-pulse drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
            <span className="text-[9px] font-bold tracking-wider text-amber-300 mt-0.5">SOURAV</span>
          </div>
        </button>
      </div>
    );
  }

  // Expanded View: Obsidian Glass Floating Chat Console (410x630)
  return (
    <div className="w-[410px] h-[630px] flex flex-col bg-slate-950/95 backdrop-blur-2xl border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden text-slate-100 select-none">
      {/* Draggable Title Header */}
      <div
        style={{ WebkitAppRegion: 'drag' } as any}
        className="px-4 py-3 bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/40 border-b border-amber-500/20 flex items-center justify-between cursor-move"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="text-xs font-bold text-amber-200 flex items-center gap-1.5">
              <span>Sourav AI Copilot</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Loco Pilot
              </span>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Universal PC Assistant (Ctrl+Alt+S)</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div
          style={{ WebkitAppRegion: 'no-drag' } as any}
          className="flex items-center gap-1"
        >
          <button
            onClick={() => handleToggleExpand(false)}
            title="Minimize to Floating Orb"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleToggleExpand(false)}
            title="Close"
            className="p-1.5 rounded-lg hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-800">
        {messages.map((m, idx) => {
          const isUser = m.role === 'user';
          const { cleanText, actions } = extractActionTags(m.text);

          return (
            <div
              key={idx}
              className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-amber-400" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-xs shadow-md ${
                  isUser
                    ? 'bg-amber-600 text-white rounded-tr-none font-medium'
                    : 'bg-slate-900/90 border border-slate-800 text-slate-200 rounded-tl-none'
                }`}
              >
                <DesktopFormattedMessage content={cleanText} isUser={isUser} />

                {/* 1-Click Interactive Navigation Actions */}
                {!isUser && actions.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-800 space-y-1.5">
                    <div className="text-[10px] font-semibold tracking-wider text-amber-400/90 uppercase">
                      Direct App Controls (Loco Pilot):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {actions.map((act, aIdx) => {
                        const targetMeta = ACTION_NAV_TARGETS[act.target] || {
                          label: act.target.toUpperCase(),
                          desc: 'Launch Module'
                        };
                        return (
                          <button
                            key={aIdx}
                            onClick={() => handleActionClick(act.target, act.gstin, act.fy, act.month)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-[11px] font-medium transition-all shadow hover:shadow-amber-500/10 active:scale-95 cursor-pointer"
                          >
                            <span>{act.label}</span>
                            <ArrowRight className="w-3 h-3 text-amber-400" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {isUser && (
                <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-slate-300" />
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center gap-2 text-amber-400/80 text-xs px-2 py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Consulting statutory knowledge...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompts */}
      {messages.length <= 2 && (
        <div className="px-3 py-1.5 bg-slate-900/60 border-t border-slate-800/80 flex gap-1.5 overflow-x-auto text-[10px]">
          <button
            onClick={() => handleSend('open 3b working of siddha')}
            className="px-2 py-1 rounded bg-slate-800/80 hover:bg-amber-500/20 text-slate-300 hover:text-amber-200 border border-slate-700 whitespace-nowrap cursor-pointer transition-colors"
          >
            🚀 Open 3B of Siddha
          </button>
          <button
            onClick={() => handleSend('180 days rule in GST')}
            className="px-2 py-1 rounded bg-slate-800/80 hover:bg-amber-500/20 text-slate-300 hover:text-amber-200 border border-slate-700 whitespace-nowrap cursor-pointer transition-colors"
          >
            📜 180 Days Rule
          </button>
          <button
            onClick={() => handleSend('Section 115BAC slabs AY 2025-26')}
            className="px-2 py-1 rounded bg-slate-800/80 hover:bg-amber-500/20 text-slate-300 hover:text-amber-200 border border-slate-700 whitespace-nowrap cursor-pointer transition-colors"
          >
            💼 115BAC Slabs
          </button>
        </div>
      )}

      {/* Input Composer */}
      <div className="p-3 bg-slate-900/90 border-t border-slate-800 flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
          placeholder="Ask Sourav or instruct PC Loco Pilot..."
          className="flex-1 bg-slate-950 border border-slate-700/80 focus:border-amber-500/80 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none transition-colors"
        />
        <button
          onClick={() => handleSend()}
          disabled={!input.trim() || loading}
          className="p-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold transition-all active:scale-95 cursor-pointer shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
