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

/**
 * Send user message and conversation context to the backend Gemini chat API.
 */
export async function sendChatMessage(
  message: string,
  context: GeminiContext = {},
  history: ChatMessage[] = []
): Promise<string> {
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

  return (data.reply as string) || '';
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
  gstr1: { label: 'Open GSTR-1 Sales Console', route: 'returns', tabId: 'gstr1' },
  notices: { label: 'Open GST Notices & Orders Suite', route: 'notices' },
  tds: { label: 'Open TDS Consolidator', route: 'tds-reco' },
  tally: { label: 'Open Tally Direct Bridge', route: 'tally-direct' },
  incometax: { label: 'Open Income Tax Engine', route: 'income-tax' },
  cma: { label: 'Open Bank CMA Appraisal', route: 'cma-report' },
  finstatements: { label: 'Open Schedule III Financial Statements', route: 'fin-statements' },
  settings: { label: 'Open Settings', route: 'settings' },
};

/**
 * Parse [ACTION:navigate:<target>] tags from response text.
 */
export function extractActionTags(rawText: string): {
  cleanText: string;
  actions: Array<{ target: string; label: string }>;
} {
  const actions: Array<{ target: string; label: string }> = [];
  const regex = /\[ACTION:navigate:([a-z0-9_-]+)\]/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawText)) !== null) {
    const targetKey = match[1].toLowerCase();
    const targetInfo = ACTION_NAV_TARGETS[targetKey];
    if (targetInfo) {
      // Deduplicate identical action buttons in a single turn
      if (!actions.some(a => a.target === targetKey)) {
        actions.push({ target: targetKey, label: targetInfo.label });
      }
    }
  }

  // Remove the action tags from the display text for clean reading
  const cleanText = rawText.replace(regex, '').trim();

  return { cleanText, actions };
}
