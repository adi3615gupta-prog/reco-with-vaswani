import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { normalizeReturnPeriod } from './db.js';
import { runGstr2bAutopilot } from './autopilot.js';

// ─── 1. PURE PERIOD FILTERING HELPERS ─────────────────────────────────────────

/**
 * filterTargetPeriods: Partitions FY periods based on optional filters (onlyPeriods, skipSynced).
 */
export function filterTargetPeriods(fyMonths, { onlyPeriods = null, skipSynced = false, syncedPeriodsSet = new Set() } = {}) {
    if (!Array.isArray(fyMonths)) return { targetMonths: [], skippedMonths: [] };

    let candidateMonths = fyMonths;
    if (Array.isArray(onlyPeriods) && onlyPeriods.length > 0) {
        const normOnly = new Set(onlyPeriods.map((p) => normalizeReturnPeriod(p)).filter(Boolean));
        candidateMonths = fyMonths.filter((m) => normOnly.has(normalizeReturnPeriod(m.period)));
    }

    if (!skipSynced) {
        return { targetMonths: candidateMonths, skippedMonths: [] };
    }

    const targetMonths = [];
    const skippedMonths = [];

    for (const m of candidateMonths) {
        const canon = normalizeReturnPeriod(m.period);
        if (syncedPeriodsSet.has(canon)) {
            skippedMonths.push(m);
        } else {
            targetMonths.push(m);
        }
    }

    return { targetMonths, skippedMonths };
}

/**
 * resolveTargetPeriods: Queries SQLite to identify cleanly synced months and calls filterTargetPeriods.
 */
export function resolveTargetPeriods(db, gstinUpper, fyMonths, { onlyPeriods = null, skipSynced = false } = {}) {
    return new Promise((resolve, reject) => {
        if (!skipSynced) {
            return resolve(filterTargetPeriods(fyMonths, { onlyPeriods, skipSynced: false }));
        }

        const query = `
            SELECT return_period, status, verify_status, updated_at
            FROM gstr2b_batches
            WHERE UPPER(TRIM(client_gstin)) = ?
            ORDER BY updated_at DESC
        `;

        db.all(query, [String(gstinUpper || '').trim().toUpperCase()], (err, rows) => {
            if (err) return reject(err);

            const syncedPeriodsSet = new Set();
            const seenMonths = new Set();

            for (const row of rows || []) {
                const canon = normalizeReturnPeriod(row.return_period);
                if (!seenMonths.has(canon)) {
                    seenMonths.add(canon);
                    const isSynced = (row.status === 'SYNCED' || row.status === 'PUSHED_TO_3B' || row.status === 'NIL_SYNCED');
                    const notPartial = (row.verify_status || 'UNVERIFIED') !== 'PARTIAL_VERIFY';
                    if (isSynced && notPartial) {
                        syncedPeriodsSet.add(canon);
                    }
                }
            }

            resolve(filterTargetPeriods(fyMonths, { onlyPeriods, skipSynced, syncedPeriodsSet }));
        });
    });
}

// ─── 2. SAFE BROWSER TERMINATION WITH PID FALLBACK ───────────────────────────

/**
 * killBrowserWithPidFallback: Closes Playwright browser and kills orphaned Windows child processes.
 */
export async function killBrowserWithPidFallback(browser) {
    if (!browser) return;
    const pid = typeof browser.process === 'function' ? browser.process()?.pid : null;
    try {
        await Promise.race([
            browser.close().catch(() => {}),
            new Promise((r) => setTimeout(r, 1500))
        ]);
    } catch (e) {}

    if (process.platform === 'win32' && Number.isInteger(pid) && pid > 0) {
        try {
            execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {});
        } catch (e) {}
    }
}

// ─── 3. JOB REGISTRY & EVENT BROADCASTER ──────────────────────────────────────

const jobs = new Map();
const activeJobsByGstin = new Map();
const JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_EVENTS = 200;

function pruneExpiredJobs() {
    const now = Date.now();
    for (const [id, j] of jobs.entries()) {
        if (j.status !== 'RUNNING' && j.completedAt && (now - j.completedAt > JOB_TTL_MS)) {
            jobs.delete(id);
            if (activeJobsByGstin.get(j.gstin) === j) {
                activeJobsByGstin.delete(j.gstin);
            }
        }
    }
}
setInterval(pruneExpiredJobs, 5 * 60 * 1000).unref();

export function sanitizeJobSnapshot(job) {
    if (!job) return null;
    return {
        jobId: job.jobId,
        gstin: job.gstin,
        mode: job.mode,
        financialYear: job.financialYear,
        returnPeriod: job.returnPeriod,
        onlyPeriods: job.onlyPeriods,
        skipSynced: job.skipSynced,
        phase: job.phase,
        status: job.status,
        currentPeriod: job.currentPeriod,
        currentMonthIndex: job.currentMonthIndex,
        totalTargetMonths: job.totalTargetMonths,
        events: job.events,
        months: job.months,
        result: job.result,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt
    };
}

export function emitJobEvent(job, eventName, payload = {}) {
    if (!job) return;
    job.updatedAt = Date.now();
    if (payload.phase) job.phase = payload.phase;
    if (payload.period) job.currentPeriod = payload.period;
    if (payload.currentMonthIndex !== undefined) job.currentMonthIndex = payload.currentMonthIndex;
    if (payload.totalTargetMonths !== undefined) job.totalTargetMonths = payload.totalTargetMonths;

    if (Array.isArray(payload.months)) {
        job.months = payload.months;
    } else if (payload.period) {
        const canonPeriod = normalizeReturnPeriod(payload.period);
        const existingIdx = job.months.findIndex(m => normalizeReturnPeriod(m.period) === canonPeriod);
        const monthObj = {
            period: canonPeriod,
            month: payload.month || canonPeriod.split(' ')[0],
            status: payload.status || (eventName === 'MONTH_START' ? 'SYNCING' : eventName === 'MONTH_SKIPPED' ? 'SKIPPED' : (eventName === 'MONTH_DONE' ? 'SYNCED' : eventName)),
            count: payload.count ?? (existingIdx !== -1 ? job.months[existingIdx].count : 0),
            verifyStatus: payload.verifyStatus || 'UNVERIFIED',
            verifyWarning: payload.verifyWarning || null,
            error: payload.error || null
        };
        if (existingIdx !== -1) {
            job.months[existingIdx] = { ...job.months[existingIdx], ...monthObj };
        } else {
            job.months.push(monthObj);
        }
    }

    const entry = {
        ts: Date.now(),
        event: eventName,
        level: payload.level || 'info',
        phase: payload.phase || job.phase,
        period: payload.period || job.currentPeriod || null,
        message: payload.message || '',
        data: payload.data || null
    };

    job.events.push(entry);
    if (job.events.length > MAX_EVENTS) {
        job.events.splice(0, job.events.length - MAX_EVENTS);
    }

    const fullPayload = { ...entry, job: sanitizeJobSnapshot(job) };
    const sseMessage = `event: ${eventName}\ndata: ${JSON.stringify(fullPayload)}\n\n`;

    for (const res of Array.from(job.listeners)) {
        if (!res.writableEnded && !res.destroyed) {
            try {
                res.write(sseMessage);
            } catch (e) {}
        }
    }
}

// ─── 4. JOB EXECUTION CONTROLLER ──────────────────────────────────────────────

export function createAndRunAutopilotJob({
    db,
    gstin,
    returnPeriod,
    financialYear,
    isFullYear = false,
    onlyPeriods = null,
    skipSynced = false,
    portal_username,
    portal_password,
    forceRestart = false,
    runnerFn = null
}) {
    pruneExpiredJobs();
    const gstinUpper = String(gstin || '').trim().toUpperCase();
    if (!gstinUpper) {
        const err = new Error('Client GSTIN is required');
        err.statusCode = 400;
        throw err;
    }

    const existingJob = activeJobsByGstin.get(gstinUpper);
    if (existingJob && existingJob.status === 'RUNNING') {
        if (!forceRestart) {
            const err = new Error(`An autopilot job (${existingJob.jobId}) is already running for ${gstinUpper}`);
            err.statusCode = 409;
            err.code = 'JOB_ALREADY_RUNNING';
            err.activeJobId = existingJob.jobId;
            throw err;
        }
        cancelAutopilotJob({ jobId: existingJob.jobId, gstin: gstinUpper, reason: 'Superseded by new run' }).catch(() => {});
    }

    const jobId = randomUUID();
    const canonicalPeriod = returnPeriod ? (normalizeReturnPeriod(returnPeriod) || returnPeriod) : `April ${(financialYear || '2026-27').match(/\d{4}/)?.[0] || '2026'}`;
    const now = Date.now();

    const job = {
        jobId,
        gstin: gstinUpper,
        mode: isFullYear ? 'FULL_YEAR' : 'MONTH',
        financialYear: financialYear || '2026-27',
        returnPeriod: canonicalPeriod,
        onlyPeriods: Array.isArray(onlyPeriods) ? onlyPeriods.map(p => normalizeReturnPeriod(p) || p) : null,
        skipSynced: Boolean(skipSynced),
        phase: 'QUEUED',
        status: 'RUNNING',
        currentPeriod: canonicalPeriod,
        currentMonthIndex: 0,
        totalTargetMonths: isFullYear ? 12 : 1,
        events: [],
        months: [],
        result: null,
        error: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        browserRef: { current: null },
        abortController: new AbortController(),
        listeners: new Set(),
        completionPromise: null
    };

    jobs.set(jobId, job);
    activeJobsByGstin.set(gstinUpper, job);

    emitJobEvent(job, 'JOB_QUEUED', {
        phase: 'QUEUED',
        message: `GSTR-2B Autopilot job queued for ${gstinUpper} (${job.mode})`
    });

    const completionPromise = (async () => {
        try {
            emitJobEvent(job, 'JOB_STARTED', {
                phase: 'INITIALIZING',
                message: `Starting GSTR-2B Autopilot for ${gstinUpper}`
            });

            const runner = runnerFn || runGstr2bAutopilot;
            const resOutcome = await runner({
                db,
                gstin: gstinUpper,
                returnPeriod: canonicalPeriod,
                financialYear: job.financialYear,
                isFullYear,
                onlyPeriods: job.onlyPeriods,
                skipSynced: job.skipSynced,
                portal_username,
                portal_password,
                req: null,
                res: null,
                jobId,
                browserState: job.browserRef,
                onEvent: (evtName, data) => emitJobEvent(job, evtName, data),
                abortSignal: job.abortController.signal
            });

            job.completedAt = Date.now();
            job.result = resOutcome;

            if (resOutcome?.cancelled || job.abortController.signal.aborted) {
                job.status = 'CANCELLED';
                job.phase = 'CANCELLED';
            } else if (resOutcome?.sessionExpired) {
                job.status = 'SESSION_EXPIRED';
                job.phase = 'SESSION_EXPIRED';
                job.error = resOutcome.error || 'GST Portal session expired mid-run';
            } else if (resOutcome?.success === false) {
                job.status = 'FAILED';
                job.phase = 'FAILED';
                job.error = resOutcome.error || 'Autopilot execution failed';
            } else if (resOutcome?.status === 'PARTIAL' || (Array.isArray(resOutcome?.months) && resOutcome.months.some(m => m.status === 'FAILED' || m.status === 'SESSION_EXPIRED'))) {
                job.status = 'PARTIAL';
                job.phase = 'PARTIAL';
            } else {
                job.status = 'COMPLETED';
                job.phase = 'COMPLETED';
            }

            emitJobEvent(job, job.status, {
                phase: job.phase,
                message: job.error || `Autopilot finished with status ${job.status}`,
                data: resOutcome
            });

            return resOutcome;
        } catch (err) {
            job.completedAt = Date.now();
            job.status = 'FAILED';
            job.phase = 'FAILED';
            job.error = err.message;
            emitJobEvent(job, 'JOB_FAILED', {
                level: 'error',
                phase: 'FAILED',
                message: `Autopilot encountered fatal error: ${err.message}`
            });
            return { success: false, error: err.message };
        } finally {
            if (activeJobsByGstin.get(gstinUpper) === job) {
                activeJobsByGstin.delete(gstinUpper);
            }
            // End all SSE listeners
            for (const listener of Array.from(job.listeners)) {
                try {
                    listener.end();
                } catch (e) {}
            }
            job.listeners.clear();
        }
    })();

    job.completionPromise = completionPromise;
    return {
        jobId,
        job: sanitizeJobSnapshot(job),
        completionPromise
    };
}

// ─── 5. SSE SUBSCRIPTION & SNAPSHOT ACCESS ────────────────────────────────────

export function subscribeToJobStream(jobId, req, res) {
    const job = jobs.get(jobId);
    if (!job) {
        return res.status(404).json({ success: false, error: `Job ${jobId} not found` });
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    // 1. Immediate snapshot
    res.write(`event: SNAPSHOT\ndata: ${JSON.stringify(sanitizeJobSnapshot(job))}\n\n`);

    // If job already ended, emit terminal event and close
    if (job.status !== 'RUNNING') {
        res.write(`event: ${job.status}\ndata: ${JSON.stringify({ event: job.status, message: job.error || job.phase, job: sanitizeJobSnapshot(job) })}\n\n`);
        return res.end();
    }

    job.listeners.add(res);

    const heartbeatTimer = setInterval(() => {
        if (!res.writableEnded && !res.destroyed) {
            try {
                res.write(': heartbeat\n\n');
            } catch (e) {}
        }
    }, 15000);

    const cleanup = () => {
        clearInterval(heartbeatTimer);
        job.listeners.delete(res);
    };

    req.on('close', cleanup);
    res.on('close', cleanup);
}

export function getJobSnapshot(jobId) {
    const job = jobs.get(jobId);
    return sanitizeJobSnapshot(job);
}

export function getActiveJobForGstin(gstin) {
    const gUpper = String(gstin || '').trim().toUpperCase();
    const job = activeJobsByGstin.get(gUpper);
    return sanitizeJobSnapshot(job);
}

// ─── 6. CANCEL & BRING TO FRONT HELPERS ────────────────────────────────────────

export async function cancelAutopilotJob({ jobId, gstin, reason = 'Cancelled by user' } = {}) {
    let job = null;
    if (jobId) job = jobs.get(jobId);
    if (!job && gstin) job = activeJobsByGstin.get(String(gstin).trim().toUpperCase());

    if (!job) return { success: false, notFound: true };

    job.status = 'CANCELLED';
    job.phase = 'CANCELLED';
    job.error = reason;
    job.completedAt = Date.now();

    try {
        job.abortController.abort(reason);
    } catch (e) {}

    if (job.browserRef && job.browserRef.current) {
        await killBrowserWithPidFallback(job.browserRef.current);
        job.browserRef.current = null;
    }

    emitJobEvent(job, 'CANCELLED', {
        level: 'warn',
        phase: 'CANCELLED',
        message: `Autopilot was cancelled: ${reason}`
    });

    if (activeJobsByGstin.get(job.gstin) === job) {
        activeJobsByGstin.delete(job.gstin);
    }

    return { success: true, jobId: job.jobId };
}

export async function bringJobBrowserToFront({ jobId, gstin } = {}) {
    let job = null;
    if (jobId) job = jobs.get(jobId);
    if (!job && gstin) job = activeJobsByGstin.get(String(gstin).trim().toUpperCase());

    const browser = job?.browserRef?.current;
    const pid = typeof browser?.process === 'function' ? browser.process()?.pid : null;

    if (process.platform === 'win32' && Number.isInteger(pid) && pid > 0) {
        const psScript = `
            Add-Type @"
                using System;
                using System.Runtime.InteropServices;
                public class Win32 {
                    [DllImport("user32.dll")]
                    [return: MarshalAs(UnmanagedType.Bool)]
                    public static extern bool SetForegroundWindow(IntPtr hWnd);
                    [DllImport("user32.dll")]
                    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
                }
"@
            $proc = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
            if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) {
                [Win32]::ShowWindow($proc.MainWindowHandle, 9)
                [Win32]::SetForegroundWindow($proc.MainWindowHandle)
            }
        `;
        return new Promise((resolve) => {
            execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { windowsHide: true }, (err) => {
                resolve({ success: !err, pid });
            });
        });
    }

    return { success: false, error: 'No active browser process found' };
}
