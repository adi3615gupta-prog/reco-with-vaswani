import { safeApiFetch } from './api';
import { followAutopilotJob, type AutopilotJobSnapshot, type StartAutopilotOptions } from './gstr2bAutopilotClient';

export interface StartGstr1JobOptions extends Pick<StartAutopilotOptions, 'onEvent' | 'onSnapshot' | 'onStatusChange' | 'signal'> {
    gstin: string;
    returnPeriod?: string;
    financialYear?: string;
    isFullYear?: boolean;
    targetMonth?: string | null;
    isDownloadOnly?: boolean;
    downloadFormat?: 'JSON' | 'PDF';
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
    try {
        const j = await res.json();
        const err: any = new Error(j?.error || fallback);
        err.code = j?.code;
        err.activeJobId = j?.activeJobId;
        return err;
    } catch {
        return new Error(fallback);
    }
}

/** Starts a background GSTR-1 autopilot job and streams its progress (SSE with polling fallback). */
export async function startAndSubscribeGstr1Job(options: StartGstr1JobOptions): Promise<AutopilotJobSnapshot> {
    const { onEvent, onSnapshot, onStatusChange, signal, ...body } = options;
    const startRes = await safeApiFetch('/api/gstr1/jobs/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal
    });
    if (!startRes.ok) throw await errorFrom(startRes, 'Failed to start GSTR-1 Autopilot job');
    const { jobId } = await startRes.json();
    return followAutopilotJob('/api/gstr1', jobId, { onEvent, onSnapshot, onStatusChange, signal });
}

/** Downloads the 12-sheet GSTR1_SectionWiseSummary workbook with the auth header and saves it. */
export async function downloadGstr1FullYearExcelAuthenticated(
    gstin: string,
    financialYear: string = '2026-27',
    clientName: string = ''
): Promise<{ success: boolean; filename?: string; error?: string }> {
    try {
        const res = await safeApiFetch(
            `/api/gstr1/export-full-year/${encodeURIComponent(gstin)}?financialYear=${encodeURIComponent(financialYear)}`
        );
        if (!res.ok) throw await errorFrom(res, 'Failed to export 12-Month GSTR-1 Excel');

        const fromHeader = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1];
        const filename = fromHeader
            || `GSTR1_SectionWiseSummary_${(clientName || gstin.trim().toUpperCase()).replace(/[^a-zA-Z0-9_-]/g, '_')}_${financialYear.replace(/[^0-9]/g, '')}.xlsx`;
        const url = window.URL.createObjectURL(await res.blob());
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            a.remove();
            window.URL.revokeObjectURL(url);
        }, 1000);
        return { success: true, filename };
    } catch (err: any) {
        return { success: false, error: err.message || 'Download failed' };
    }
}

async function postJson(path: string, params: object): Promise<boolean> {
    try {
        const res = await safeApiFetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        return res.ok;
    } catch {
        return false;
    }
}

export const cancelGstr1Job = (params: { jobId?: string; gstin?: string }) => postJson('/api/gstr1/cancel', params);
export const bringGstr1BrowserToFront = (params: { jobId?: string; gstin?: string }) => postJson('/api/gstr1/bring-to-front', params);
