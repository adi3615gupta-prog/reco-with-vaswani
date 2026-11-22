import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { runGstr1Autopilot } from './autopilot.js';
import { emitJobEvent, sanitizeJobSnapshot, killBrowserWithPidFallback } from '../gstr2b/jobs.js';

export { emitJobEvent, sanitizeJobSnapshot };

// Separate registry from GSTR-2B so a 2B cancel/409 never touches a GSTR-1 job.
const jobs = new Map();
const activeJobsByGstin = new Map();
const JOB_TTL_MS = 30 * 60 * 1000;

function pruneExpiredJobs() {
    const now = Date.now();
    for (const [id, j] of jobs.entries()) {
        if (j.status !== 'RUNNING' && j.completedAt && now - j.completedAt > JOB_TTL_MS) jobs.delete(id);
    }
}
setInterval(pruneExpiredJobs, 5 * 60 * 1000).unref();

function findJob({ jobId, gstin } = {}) {
    return (jobId && jobs.get(jobId)) || (gstin && activeJobsByGstin.get(String(gstin).trim().toUpperCase())) || null;
}

export function getJob(jobId) {
    return sanitizeJobSnapshot(jobs.get(jobId));
}

export function getJobBrowser(params) {
    return findJob(params)?.browserRef?.current || null;
}

export function createAndRunAutopilotJob({
    db,
    gstin,
    returnPeriod,
    financialYear = '2026-27',
    isFullYear = false,
    targetMonth = null,
    isDownloadOnly = false,
    downloadFormat = 'JSON',
    runnerFn = runGstr1Autopilot
}) {
    pruneExpiredJobs();
    const gstinUpper = String(gstin || '').trim().toUpperCase();
    if (!gstinUpper) {
        const err = new Error('Client GSTIN is required');
        err.statusCode = 400;
        throw err;
    }
    const existing = activeJobsByGstin.get(gstinUpper);
    if (existing && existing.status === 'RUNNING') {
        const err = new Error(`A GSTR-1 autopilot job (${existing.jobId}) is already running for ${gstinUpper}`);
        err.statusCode = 409;
        err.code = 'JOB_ALREADY_RUNNING';
        err.activeJobId = existing.jobId;
        throw err;
    }

    const now = Date.now();
    const period = returnPeriod || `April ${financialYear.match(/\d{4}/)?.[0] || '2026'}`;
    const job = {
        jobId: randomUUID(),
        gstin: gstinUpper,
        mode: isFullYear ? 'FULL_YEAR' : 'MONTH',
        financialYear,
        returnPeriod: period,
        phase: 'QUEUED',
        status: 'RUNNING',
        currentPeriod: period,
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
        listeners: new Set()
    };
    jobs.set(job.jobId, job);
    activeJobsByGstin.set(gstinUpper, job);
    emitJobEvent(job, 'JOB_STARTED', { phase: 'INITIALIZING', message: `Starting GSTR-1 Autopilot for ${gstinUpper} (${job.mode})` });

    // runGstr1Autopilot answers via res.status().json(); this shim hands that body back as the return value.
    const resShim = { status: () => resShim, json: (body) => body };

    job.completionPromise = (async () => {
        try {
            const outcome = await runnerFn({
                db,
                gstin: gstinUpper,
                returnPeriod: period,
                financialYear,
                isFullYear,
                targetMonth,
                isDownloadOnly,
                downloadFormat,
                req: null,
                res: resShim,
                browserState: job.browserRef,
                onEvent: (evt, data) => emitJobEvent(job, evt, data)
            });
            if (job.status === 'CANCELLED') return outcome; // cancelAutopilotJob already finalized it
            job.completedAt = Date.now();
            job.result = outcome;
            if (outcome?.cancelled) job.status = 'CANCELLED';
            else if (outcome?.success === false) { job.status = 'FAILED'; job.error = outcome.error || 'Autopilot execution failed'; }
            else if (Array.isArray(outcome?.months) && outcome.months.some(m => m.status === 'FAILED')) job.status = 'PARTIAL';
            else job.status = 'COMPLETED';
            job.phase = job.status;
            emitJobEvent(job, job.status, { phase: job.phase, message: job.error || outcome?.message || `Autopilot finished: ${job.status}`, data: outcome });
            return outcome;
        } catch (err) {
            job.completedAt = Date.now();
            job.status = job.phase = 'FAILED';
            job.error = err.message;
            emitJobEvent(job, 'FAILED', { level: 'error', phase: 'FAILED', message: `Autopilot fatal error: ${err.message}` });
            return { success: false, error: err.message };
        } finally {
            if (activeJobsByGstin.get(gstinUpper) === job) activeJobsByGstin.delete(gstinUpper);
            for (const l of job.listeners) { try { l.end(); } catch (e) {} }
            job.listeners.clear();
        }
    })();

    return { jobId: job.jobId, job: sanitizeJobSnapshot(job) };
}

export function subscribeToJobStream(jobId, req, res) {
    const job = jobs.get(jobId);
    if (!job) return res.status(404).json({ success: false, error: `Job ${jobId} not found` });

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    res.write(`event: SNAPSHOT\ndata: ${JSON.stringify(sanitizeJobSnapshot(job))}\n\n`);
    if (job.status !== 'RUNNING') {
        res.write(`event: ${job.status}\ndata: ${JSON.stringify({ event: job.status, message: job.error || job.phase, job: sanitizeJobSnapshot(job) })}\n\n`);
        return res.end();
    }

    job.listeners.add(res);
    const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(': heartbeat\n\n'); }, 15000);
    res.on('close', () => { clearInterval(heartbeat); job.listeners.delete(res); });
}

export async function cancelAutopilotJob({ jobId, gstin, reason = 'Cancelled by user' } = {}) {
    const job = findJob({ jobId, gstin });
    if (!job) return { success: false, notFound: true };

    job.status = job.phase = 'CANCELLED';
    job.error = reason;
    job.completedAt = Date.now();
    if (job.browserRef.current) {
        await killBrowserWithPidFallback(job.browserRef.current);
        job.browserRef.current = null;
    }
    emitJobEvent(job, 'CANCELLED', { level: 'warn', phase: 'CANCELLED', message: `Autopilot was cancelled: ${reason}` });
    if (activeJobsByGstin.get(job.gstin) === job) activeJobsByGstin.delete(job.gstin);
    return { success: true, jobId: job.jobId };
}

export async function bringJobBrowserToFront({ jobId, gstin } = {}) {
    const job = findJob({ jobId, gstin });
    const browser = job?.browserRef?.current;
    let pid = null;
    if (browser) {
        try {
            const cdp = await browser.newBrowserCDPSession();
            const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
            pid = processInfo.find(x => x.type === 'browser')?.id || null;
        } catch (e) {}
    }

    const bringPath = path.join(process.cwd(), 'scratch', 'bring_to_front.ps1');
    if (fs.existsSync(bringPath)) {
        const arg = pid ? `-TargetPid ${pid}` : '';
        exec(`powershell -ExecutionPolicy Bypass -File "${bringPath}" ${arg}`, { windowsHide: true }, () => {});
        return true;
    }

    try {
        let psParts = ['$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys(\'%\');'];
        if (pid) psParts.push(`$wshell.AppActivate(${pid});`);
        psParts.push(`$wshell.AppActivate('Goods & Services Tax');`);
        psParts.push(`$wshell.AppActivate('Goods and Services Tax');`);
        psParts.push(`$wshell.AppActivate('GST | Login');`);
        psParts.push(`$wshell.AppActivate('Login');`);
        psParts.push(`$wshell.AppActivate('Chrome');`);
        const psCmd = `powershell -NoProfile -Command "${psParts.join(' ')}"`;
        exec(psCmd, () => {});
        return true;
    } catch (e) {
        return false;
    }
}
