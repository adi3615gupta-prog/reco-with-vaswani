import { safeApiFetch } from './api';

// ─── CANONICAL MONTH NAMES & PERIOD RESOLUTION ──────────────────────────────

export const CANONICAL_MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * normalizeReturnPeriod: Converts all GST period variants ("042025", "04-2025", "Apr 2025", etc.)
 * into canonical "Month YYYY" (e.g. "April 2025").
 */
export function normalizeReturnPeriod(periodStr: string | null | undefined, idtFallback: string = ''): string {
    const raw = String(periodStr || '').trim();
    if (!raw) {
        if (!idtFallback) return '';
        const rawIdt = String(idtFallback).trim();
        const dmy = rawIdt.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (dmy) {
            const mm = parseInt(dmy[2], 10);
            const yyyy = dmy[3];
            if (mm >= 1 && mm <= 12) return `${CANONICAL_MONTH_NAMES[mm - 1]} ${yyyy}`;
        }
        return '';
    }

    // 1. "042025" -> MMYYYY (6 digits)
    const m6 = raw.match(/^(\d{2})(\d{4})$/);
    if (m6) {
        const mm = parseInt(m6[1], 10);
        const yyyy = m6[2];
        if (mm >= 1 && mm <= 12) return `${CANONICAL_MONTH_NAMES[mm - 1]} ${yyyy}`;
    }

    // 2. "04-2025" or "04/2025" or "4-2025"
    const mSep = raw.match(/^(\d{1,2})[-/](\d{4})$/);
    if (mSep) {
        const mm = parseInt(mSep[1], 10);
        const yyyy = mSep[2];
        if (mm >= 1 && mm <= 12) return `${CANONICAL_MONTH_NAMES[mm - 1]} ${yyyy}`;
    }

    // 3. "2025-04" or "2025/04"
    const mIso = raw.match(/^(\d{4})[-/](\d{1,2})$/);
    if (mIso) {
        const yyyy = mIso[1];
        const mm = parseInt(mIso[2], 10);
        if (mm >= 1 && mm <= 12) return `${CANONICAL_MONTH_NAMES[mm - 1]} ${yyyy}`;
    }

    // 4. "April, 2025", "Apr 2025", "APR-2025"
    const mWord = raw.match(/^([a-zA-Z]+)[\s,.-]+(\d{4})$/);
    if (mWord) {
        const prefix = mWord[1].substring(0, 3).toLowerCase();
        const yyyy = mWord[2];
        const idx = CANONICAL_MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(prefix));
        if (idx !== -1) return `${CANONICAL_MONTH_NAMES[idx]} ${yyyy}`;
    }

    // 5. "Apr-25" (2-digit year)
    const mShort = raw.match(/^([a-zA-Z]{3,9})[-/\s]+(\d{2})$/);
    if (mShort) {
        const prefix = mShort[1].substring(0, 3).toLowerCase();
        const yy = parseInt(mShort[2], 10);
        const yyyy = 2000 + yy;
        const idx = CANONICAL_MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(prefix));
        if (idx !== -1) return `${CANONICAL_MONTH_NAMES[idx]} ${yyyy}`;
    }

    return raw.replace(/,/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * resolvePeriodForMonth: Maps month name + FY string (e.g. "January" + "2025-26") to canonical period "January 2026".
 * Q4 months (Jan, Feb, Mar) map to endYear; Q1-Q3 months map to startYear.
 */
export function resolvePeriodForMonth(monthName: string, financialYear: string = '2026-27'): string {
    const rawMonth = String(monthName || '').trim();
    const startYear = parseInt(String(financialYear || '').match(/\d{4}/)?.[0] || '2026', 10);
    const endYear = startYear + 1;

    const lower = rawMonth.toLowerCase();
    const isQ4 = ['january', 'february', 'march', 'jan', 'feb', 'mar'].some(q => lower.startsWith(q));
    const yyyy = isQ4 ? endYear : startYear;

    const canonIdx = CANONICAL_MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(lower.substring(0, 3)));
    const fullMonth = canonIdx !== -1 ? CANONICAL_MONTH_NAMES[canonIdx] : rawMonth;
    return `${fullMonth} ${yyyy}`;
}

// ─── AUTHENTICATED 12M EXCEL DOWNLOAD ───────────────────────────────────────

/**
 * downloadGstr2bFullYearExcelAuthenticated: Downloads the 12-Month SectionWiseSummary Excel workbook
 * with Authorization Bearer header, converting response to Blob and triggering browser save.
 */
export async function downloadGstr2bFullYearExcelAuthenticated(
    gstin: string,
    financialYear: string = '2026-27',
    clientName: string = ''
): Promise<{ success: boolean; filename?: string; error?: string }> {
    try {
        const res = await safeApiFetch(
            `/api/gstr2b/export-full-year/${encodeURIComponent(gstin)}?financialYear=${encodeURIComponent(financialYear)}`
        );
        if (!res.ok) {
            let errMsg = 'Failed to export 12-Month GSTR-2B Excel';
            try {
                const j = await res.json();
                if (j?.error) errMsg = j.error;
            } catch {}
            throw new Error(errMsg);
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;

        const cleanFy = financialYear.replace(/[^0-9]/g, '');
        const cleanGstin = gstin.trim().toUpperCase();
        const safeName = (clientName || cleanGstin).replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `GSTR2B_SectionWiseSummary_${safeName}_${cleanFy}.xlsx`;

        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 1000);

        return { success: true, filename };
    } catch (err: any) {
        console.error('[GSTR-2B Client] Excel download failed:', err);
        return { success: false, error: err.message || 'Download failed' };
    }
}

// ─── TYPES & INTERFACES FOR AUTOPILOT JOBS ──────────────────────────────────

export interface AutopilotJobMonth {
    period: string;
    month: string;
    status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'NIL_SYNCED' | 'FAILED' | 'SESSION_EXPIRED' | 'SKIPPED' | string;
    count: number;
    verifyStatus?: 'VERIFIED' | 'PARTIAL_VERIFY' | 'UNVERIFIED';
    verifyWarning?: string | null;
    error?: string | null;
}

export interface AutopilotJobEvent {
    ts: number;
    event: string;
    level: 'info' | 'warn' | 'error' | 'success';
    phase: string;
    period?: string | null;
    message: string;
    data?: any;
}

export interface AutopilotJobSnapshot {
    jobId: string;
    gstin: string;
    mode: 'MONTH' | 'FULL_YEAR';
    financialYear: string;
    returnPeriod: string;
    onlyPeriods?: string[] | null;
    skipSynced?: boolean;
    phase: string;
    status: 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'SESSION_EXPIRED' | 'CANCELLED' | 'FAILED';
    currentPeriod?: string | null;
    currentMonthIndex?: number;
    totalTargetMonths?: number;
    events: AutopilotJobEvent[];
    months: AutopilotJobMonth[];
    result?: any;
    error?: string | null;
    createdAt: number;
    updatedAt: number;
    completedAt?: number | null;
}

export interface StartAutopilotOptions {
    gstin: string;
    returnPeriod?: string;
    financialYear?: string;
    isFullYear?: boolean;
    onlyPeriods?: string[] | null;
    skipSynced?: boolean;
    portal_username?: string;
    portal_password?: string;
    forceRestart?: boolean;
    onEvent?: (event: AutopilotJobEvent, job: AutopilotJobSnapshot) => void;
    onSnapshot?: (job: AutopilotJobSnapshot) => void;
    onStatusChange?: (status: string, job: AutopilotJobSnapshot) => void;
    signal?: AbortSignal;
}

// ─── SSE STREAM CONSUMER & POLLING FALLBACK ─────────────────────────────────

/**
 * startAndSubscribeGstr2bJob: Initiates an async GSTR-2B autopilot job and streams
 * real-time SSE progress events using safeApiFetch + ReadableStream reader.
 * Falls back to GET /api/gstr2b/job/:jobId polling if streaming is unavailable.
 */
export async function startAndSubscribeGstr2bJob(options: StartAutopilotOptions): Promise<AutopilotJobSnapshot> {
    const {
        gstin,
        returnPeriod,
        financialYear = '2026-27',
        isFullYear = false,
        onlyPeriods = null,
        skipSynced = false,
        portal_username,
        portal_password,
        forceRestart = false,
        onEvent,
        onSnapshot,
        onStatusChange,
        signal
    } = options;

    // 1. Start Job via POST /api/gstr2b/jobs/start
    const startRes = await safeApiFetch('/api/gstr2b/jobs/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            gstin,
            returnPeriod,
            financialYear,
            isFullYear,
            onlyPeriods,
            skipSynced,
            portal_username,
            portal_password,
            forceRestart
        }),
        signal
    });

    if (startRes.status === 409) {
        const conflict = await startRes.json();
        const err: any = new Error(conflict.error || 'An autopilot job is already active for this client');
        err.code = conflict.code || 'JOB_ALREADY_RUNNING';
        err.activeJobId = conflict.activeJobId;
        throw err;
    }

    if (startRes.status === 404) {
        // Fallback for running servers where /api/gstr2b/jobs/start is not yet reloaded
        console.warn('[GSTR-2B Client] /api/gstr2b/jobs/start returned 404, falling back to /api/gstr2b/portal-sync-browser');
        const legacyRes = await safeApiFetch('/api/gstr2b/portal-sync-browser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gstin,
                returnPeriod,
                financialYear,
                isFullYear,
                onlyPeriods,
                skipSynced,
                portal_username,
                portal_password,
                forceRestart
            }),
            signal
        });

        if (!legacyRes.ok) {
            let errText = 'Failed to execute GSTR-2B Autopilot';
            try {
                const j = await legacyRes.json();
                if (j.error) errText = j.error;
            } catch {}
            throw new Error(errText);
        }

        const legacyData = await legacyRes.json();
        const fakeSnapshot: AutopilotJobSnapshot = {
            jobId: 'legacy-sync',
            gstin,
            returnPeriod,
            financialYear,
            mode: isFullYear ? 'FULL_YEAR' : 'SINGLE_MONTH',
            status: legacyData.cancelled ? 'CANCELLED' : (legacyData.success ? 'COMPLETED' : 'FAILED'),
            step: 'DONE',
            message: legacyData.message || (legacyData.success ? 'Sync completed' : (legacyData.error || 'Sync failed')),
            progressPct: 100,
            error: legacyData.error || null,
            result: legacyData,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        onSnapshot?.(fakeSnapshot);
        onStatusChange?.(fakeSnapshot.status, fakeSnapshot);
        return fakeSnapshot;
    }

    if (!startRes.ok) {
        let errText = 'Failed to start GSTR-2B Autopilot job';
        try {
            const j = await startRes.json();
            if (j.error) errText = j.error;
        } catch {}
        throw new Error(errText);
    }

    const { jobId } = await startRes.json();
    return followAutopilotJob('/api/gstr2b', jobId, { onEvent, onSnapshot, onStatusChange, signal });
}

/**
 * followAutopilotJob: Streams SSE events for a started job at `${apiBase}/job-stream/:jobId`,
 * falling back to `${apiBase}/job/:jobId` polling. Shared by the GSTR-2B and GSTR-1 clients.
 */
export async function followAutopilotJob(
    apiBase: string,
    jobId: string,
    { onEvent, onSnapshot, onStatusChange, signal }: Pick<StartAutopilotOptions, 'onEvent' | 'onSnapshot' | 'onStatusChange' | 'signal'>
): Promise<AutopilotJobSnapshot> {
    // Helper to run polling fallback
    const runPollingFallback = async (): Promise<AutopilotJobSnapshot> => {
        while (!signal?.aborted) {
            await new Promise(r => setTimeout(r, 2000));
            if (signal?.aborted) break;

            try {
                const pollRes = await safeApiFetch(`${apiBase}/job/${encodeURIComponent(jobId)}`, { signal });
                if (pollRes.ok) {
                    const { job } = await pollRes.json();
                    if (job) {
                        onSnapshot?.(job);
                        if (job.status !== 'RUNNING') {
                            onStatusChange?.(job.status, job);
                            return job;
                        }
                    }
                }
            } catch (e: any) {
                if (signal?.aborted) break;
            }
        }
        throw new Error('Autopilot polling terminated or aborted');
    };

    // 2. Subscribe to SSE Stream via GET /api/gstr2b/job-stream/:jobId
    try {
        const streamRes = await safeApiFetch(`${apiBase}/job-stream/${encodeURIComponent(jobId)}`, {
            headers: { 'Accept': 'text/event-stream' },
            signal
        });

        if (!streamRes.ok || !streamRes.body) {
            console.warn('[GSTR-2B Client] SSE stream rejected or unsupported. Falling back to polling.');
            return await runPollingFallback();
        }

        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let latestJob: AutopilotJobSnapshot | null = null;

        while (!signal?.aborted) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split('\n\n');
            buffer = frames.pop() || '';

            for (const frame of frames) {
                const trimmed = frame.trim();
                if (!trimmed || trimmed.startsWith(':')) continue; // Heartbeats

                let eventType = 'message';
                let dataStr = '';

                const lines = trimmed.split('\n');
                for (const line of lines) {
                    if (line.startsWith('event:')) {
                        eventType = line.replace('event:', '').trim();
                    } else if (line.startsWith('data:')) {
                        dataStr = line.replace('data:', '').trim();
                    }
                }

                if (!dataStr) continue;

                try {
                    const parsed = JSON.parse(dataStr);
                    const job = parsed.job || (parsed.jobId ? parsed : null);

                    if (job) {
                        latestJob = job;
                        onSnapshot?.(job);
                        if (job.status && job.status !== 'RUNNING') {
                            onStatusChange?.(job.status, job);
                        }
                    }

                    if (parsed.event && onEvent) {
                        onEvent(parsed, job || latestJob);
                    }

                    if (['COMPLETED', 'PARTIAL', 'CANCELLED', 'FAILED', 'SESSION_EXPIRED'].includes(eventType)) {
                        return latestJob || (job as AutopilotJobSnapshot);
                    }
                } catch (e) {
                    console.warn('[GSTR-2B Client] Error parsing SSE payload:', e);
                }
            }
        }

        if (latestJob) return latestJob;
        return await runPollingFallback();
    } catch (streamErr: any) {
        if (signal?.aborted) {
            throw new Error('Autopilot session was aborted by user');
        }
        console.warn('[GSTR-2B Client] SSE connection error, switching to polling:', streamErr.message);
        return await runPollingFallback();
    }
}

/**
 * cancelGstr2bJob: Cancels an active or running autopilot job by ID or GSTIN.
 */
export async function cancelGstr2bJob(params: { jobId?: string; gstin?: string; reason?: string }): Promise<boolean> {
    try {
        const res = await safeApiFetch('/api/gstr2b/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        return res.ok;
    } catch (e) {
        console.error('[GSTR-2B Client] Failed to cancel job:', e);
        return false;
    }
}

/**
 * bringGstr2bBrowserToFront: Triggers window activation for active Playwright Chrome instance.
 */
export async function bringGstr2bBrowserToFront(params: { jobId?: string; gstin?: string }): Promise<boolean> {
    try {
        const res = await safeApiFetch('/api/gstr2b/bring-to-front', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        return res.ok;
    } catch (e) {
        console.error('[GSTR-2B Client] Failed to bring browser to front:', e);
        return false;
    }
}

