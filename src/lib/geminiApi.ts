import { getApiBase } from './api';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface GeminiContext {
  clientName?: string;
  gstin?: string;
  fy?: string;
  module?: string;
}

export interface GeminiStatus {
  configured: boolean;
  origin?: 'cloud_office' | 'cloud_global' | 'local_manual' | 'env' | string | null;
}

export interface ChatMetaResponse {
  reply: string;
  fastPath?: boolean;
  matchedClients?: Array<{ gstin: string; name: string }>;
  target?: string;
  fy?: string;
  month?: string;
}

/**
 * Send user message with full metadata return (including instant fastPath flags).
 */
export async function sendChatMessageWithMeta(
  message: string,
  context: GeminiContext = {},
  history: ChatMessage[] = []
): Promise<ChatMetaResponse> {
  const res = await fetch(`${getApiBase()}/api/gemini/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context, history }),
  });

  const data = await res.json();
  if (!res.ok) {
    const errorMsg = data.error || `HTTP ${res.status}: Failed to get response from Sourav`;
    const err: any = new Error(errorMsg);
    err.unconfigured = data.unconfigured;
    err.status = res.status;
    throw err;
  }

  return {
    reply: (data.reply as string) || '',
    fastPath: Boolean(data.fastPath),
    matchedClients: data.matchedClients,
    target: data.target,
    fy: data.fy,
    month: data.month,
  };
}

/**
 * Send user message and conversation context to the backend Gemini chat API.
 */
export async function sendChatMessage(
  message: string,
  context: GeminiContext = {},
  history: ChatMessage[] = []
): Promise<string> {
  const meta = await sendChatMessageWithMeta(message, context, history);
  return meta.reply;
}

/**
 * Check if the Google Gemini API key has been configured in the backend and return origin telemetry.
 */
export async function getGeminiStatus(): Promise<GeminiStatus> {
  try {
    const res = await fetch(`${getApiBase()}/api/gemini/status`);
    if (!res.ok) return { configured: false, origin: null };
    return await res.json();
  } catch (err) {
    console.warn('[Gemini API] Failed to fetch status:', err);
    return { configured: false, origin: null };
  }
}

/**
 * Persist the Gemini API key in the backend SQLite app_config table locally.
 */
export async function saveGeminiApiKey(apiKey: string): Promise<{ ok: boolean; message?: string; origin?: string }> {
  const res = await fetch(`${getApiBase()}/api/gemini/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to save Gemini API key');
  }

  return data;
}

/**
 * Trigger immediate cloud synchronization of the Gemini API key from Firebase Firestore.
 */
export async function syncGeminiFromCloud(): Promise<{
  ok: boolean;
  configured: boolean;
  origin?: 'cloud_office' | 'cloud_global' | string;
  message?: string;
  error?: string;
}> {
  const res = await fetch(`${getApiBase()}/api/gemini/sync-cloud`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to sync Gemini API key from Cloud License');
  }

  return data;
}

/**
 * Push Gemini API key to Firebase Firestore for centralized office or global distribution.
 */
export async function pushGeminiToCloud(
  apiKey: string,
  scope: 'office' | 'global' = 'office'
): Promise<{ ok: boolean; origin?: string; message: string }> {
  const res = await fetch(`${getApiBase()}/api/gemini/push-cloud`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, scope }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to push Gemini API key to Cloud');
  }

  return data;
}

/**
 * Action target to human-readable label and navigation route mapping.
 */
export const ACTION_NAV_TARGETS: Record<string, { label: string; tabId?: string; route?: string }> = {
  reco: { label: 'Open 2B vs Books Reco', route: 'reco' },
  ims: { label: 'Open IMS Decision Hub', route: 'returns', tabId: 'ims' },
  '3b': { label: 'Open GSTR-3B Working Sheet', route: 'returns', tabId: 'gstr3b' },
  reversal: { label: 'Open GSTR-3B Table 4(B) Reversals & Allocations', route: 'returns', tabId: 'gstr3b' },
  reversals: { label: 'Open GSTR-3B Table 4(B) Reversals & Allocations', route: 'returns', tabId: 'gstr3b' },
  gstr1: { label: 'Open GSTR-1 Sales Console', route: 'returns', tabId: 'gstr1' },
  notices: { label: 'Open GST Notices & Orders Suite', route: 'notices' },
  tds: { label: 'Open TDS Consolidator', route: 'tds-reco' },
  tally: { label: 'Open Tally Direct Bridge', route: 'tally-direct' },
  incometax: { label: 'Open Income Tax Engine', route: 'income-tax' },
  cma: { label: 'Open Bank CMA Appraisal', route: 'bank-cma' },
  bankcma: { label: 'Open Bank CMA Appraisal', route: 'bank-cma' },
  finstatements: { label: 'Open Schedule III Financial Statements', route: 'fin-statements' },
  audit: { label: 'Open Statutory Audit Suite', route: 'audit' },
  clause44: { label: 'Open Tax Audit Clause 44', route: 'clause44' },
  settings: { label: 'Open Settings', route: 'settings' },
};

export interface ParsedAction {
  target: string;
  label: string;
  gstin?: string;
  clientName?: string;
  fy?: string;
  month?: string;
}

/**
 * Standardize financial year strings (e.g. "26-27", "2026-27", "2627") to "2026-27".
 */
export function normalizeActionFy(input?: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  const m = trimmed.match(/^(?:20)?(\d{2})[-/]?(\d{2}|\d{4})$/);
  if (m) {
    const start = m[1];
    const end = m[2].length === 4 ? m[2].slice(-2) : m[2];
    return `20${start}-${end}`;
  }
  return trimmed;
}

/**
 * Standardize month names (e.g. "sept", "sep", "09", "september") to Titlecase "September".
 */
export function normalizeActionMonth(input?: string): string | undefined {
  if (!input) return undefined;
  const clean = input.trim().toLowerCase();
  const map: Record<string, string> = {
    jan: 'January', january: 'January', '01': 'January', '1': 'January',
    feb: 'February', february: 'February', '02': 'February', '2': 'February',
    mar: 'March', march: 'March', '03': 'March', '3': 'March',
    apr: 'April', april: 'April', '04': 'April', '4': 'April',
    may: 'May', '05': 'May', '5': 'May',
    jun: 'June', june: 'June', '06': 'June', '6': 'June',
    jul: 'July', july: 'July', '07': 'July', '7': 'July',
    aug: 'August', august: 'August', '08': 'August', '8': 'August',
    sep: 'September', sept: 'September', september: 'September', '09': 'September', '9': 'September',
    oct: 'October', october: 'October', '10': 'October',
    nov: 'November', november: 'November', '11': 'November',
    dec: 'December', december: 'December', '12': 'December',
  };
  return map[clean] || (clean.length > 0 ? clean.charAt(0).toUpperCase() + clean.slice(1) : undefined);
}

/**
 * Parse [ACTION:navigate:<target>] tags with optional :gstin, :fy, and :month parameters.
 * Examples:
 *   [ACTION:navigate:3b]
 *   [ACTION:navigate:3b:27AAGCD4105L1ZO]
 *   [ACTION:navigate:reversal:27AAGCD4105L1ZO:2026-27:September]
 *   [ACTION:navigate:reversal:27AAGCD4105L1ZO:26-27:sept]
 */
export function extractActionTags(rawText: string): {
  cleanText: string;
  actions: ParsedAction[];
} {
  const actions: ParsedAction[] = [];
  const regex = /\[ACTION:navigate:([^\]]+)\]/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawText)) !== null) {
    const rawContent = match[1].trim();
    const parts = rawContent.split(':').map(p => p.trim());
    if (parts.length === 0) continue;

    const targetKey = parts[0].toLowerCase();
    const targetInfo = ACTION_NAV_TARGETS[targetKey];
    if (!targetInfo) continue;

    let gstinParam: string | undefined;
    let fyParam: string | undefined;
    let monthParam: string | undefined;

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      // 1. Check if FY (e.g. 26-27, 2026-27, 2024-25)
      if (!fyParam && /^(?:20)?\d{2}[-/]?\d{2}$/.test(part)) {
        fyParam = normalizeActionFy(part);
        continue;
      }

      // 2. Check if Month (e.g. sept, sep, september, october, 09, etc.)
      const isMonthToken = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|0[1-9]|1[0-2])$/i.test(part);
      if (!monthParam && isMonthToken) {
        monthParam = normalizeActionMonth(part);
        continue;
      }

      // 3. Otherwise if length >= 8, treat as GSTIN/Client identifier
      if (!gstinParam && part.length >= 8) {
        gstinParam = part.toUpperCase();
        continue;
      }
    }

    const actionKey = [targetKey, gstinParam, fyParam, monthParam].filter(Boolean).join(':');
    if (!actions.some(a => [a.target, a.gstin, a.fy, a.month].filter(Boolean).join(':') === actionKey)) {
      let label = targetInfo.label;
      const contextTags: string[] = [];
      if (gstinParam) contextTags.push(gstinParam);
      if (monthParam) contextTags.push(monthParam);
      if (fyParam) contextTags.push(fyParam);

      if (contextTags.length > 0) {
        label = `${targetInfo.label} (${contextTags.join(' • ')})`;
      }

      actions.push({
        target: targetKey,
        label,
        gstin: gstinParam,
        fy: fyParam,
        month: monthParam,
      });
    }
  }

  // Remove the action tags from the display text for clean reading
  const cleanText = rawText.replace(regex, '').trim();

  return { cleanText, actions };
}
