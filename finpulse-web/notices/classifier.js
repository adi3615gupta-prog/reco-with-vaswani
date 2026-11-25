/**
 * Shared 64-Form GST & MVAT Notice/Order Classifier, Parameter Extractor & Read-Only Office Reader
 * Reuses existing pdf-parse, xlsx, and Node built-in zlib (no new npm dependencies).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Embedded Windows native OCR runner (WinRT Windows.Media.Ocr).
 * Runs completely offline on Windows 10/11 with zero external binary or npm installs.
 */
const WIN_OCR_POWERSHELL_SCRIPT = `
param([string[]]$Files)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
Function Await($WinRtOp, $ResultType) {
    $m = $asTaskGeneric.MakeGenericMethod($ResultType)
    $t = $m.Invoke($null, @($WinRtOp))
    $t.Wait()
    return $t.Result
}
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.FileAccessMode, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('en-US')) }
foreach ($f in $Files) {
    if (-not (Test-Path $f)) { continue }
    $sf = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($f)) ([Windows.Storage.StorageFile])
    $stream = Await ($sf.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $res = Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
    Write-Output "===PAGE==="
    Write-Output ($res.Lines | ForEach-Object { $_.Text })
    $stream.Dispose()
}
`;

function buildOcrPagePlan(totalPages = 0, maxSample = 12) {
    if (!totalPages || totalPages <= maxSample) return null; // render all pages
    const half = Math.floor(maxSample / 2);
    const pages = new Set();
    for (let i = 1; i <= half; i++) pages.add(i);
    for (let i = Math.max(1, totalPages - half + 1); i <= totalPages; i++) pages.add(i);
    return [...pages].sort((a, b) => a - b);
}

async function runTesseractFallback(imgPaths) {
    const out = [];
    for (const imgPath of imgPaths) {
        try {
            const res = await execFileAsync('tesseract', [imgPath, 'stdout', '-l', 'eng', '--psm', '6'], {
                maxBuffer: 5 * 1024 * 1024,
                timeout: 15000
            });
            const stdout = typeof res === 'string' ? res : (res?.stdout || '');
            if (stdout && stdout.trim()) out.push(stdout.trim());
        } catch {
            // tesseract binary not installed on host — degrade gracefully
            return '';
        }
    }
    return out.join('\n').trim();
}

export async function runLocalNativeOcrOnPdf(buffer, opts = {}) {
    const maxSample = Number(opts?.maxPages) > 0 ? Number(opts.maxPages) : 12;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'winocr_'));
    try {
        const pdfMod = await import('pdf-parse');
        const PDFParseClass = pdfMod.PDFParse || pdfMod.default?.PDFParse;
        if (!PDFParseClass) return '';
        const parser = new PDFParseClass({ data: buffer });

        let screenshotParams = { scale: 2 };
        if (Array.isArray(opts?.partial) && opts.partial.length > 0) {
            screenshotParams.partial = opts.partial;
        } else {
            try {
                const info = await parser.getInfo({ parsePageInfo: false });
                const plan = buildOcrPagePlan(info?.total || 0, maxSample);
                if (plan) screenshotParams.partial = plan;
            } catch {
                screenshotParams.first = maxSample;
            }
        }

        let shot = null;
        try {
            shot = await parser.getScreenshot(screenshotParams);
        } catch {
            return '';
        }
        const pages = shot?.pages || [];
        if (pages.length === 0) return '';

        const imgPaths = [];
        for (const p of pages) {
            if (!p.data) continue;
            const imgPath = path.join(tmpDir, `page_${p.pageNumber || imgPaths.length + 1}.png`);
            fs.writeFileSync(imgPath, p.data);
            imgPaths.push(imgPath);
        }
        if (imgPaths.length === 0) return '';

        // 1. Windows 10/11 built-in WinRT OCR engine (zero external installs)
        if (process.platform === 'win32') {
            try {
                const psPath = path.join(tmpDir, 'ocr_worker.ps1');
                fs.writeFileSync(psPath, WIN_OCR_POWERSHELL_SCRIPT, 'utf8');
                const psResult = await execFileAsync(
                    'powershell.exe',
                    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath, '-Files', ...imgPaths],
                    { maxBuffer: 15 * 1024 * 1024, timeout: 60000 }
                );
                const stdout = typeof psResult === 'string' ? psResult : (psResult?.stdout || '');
                const winOut = String(stdout || '').replace(/===PAGE===/g, '\n').trim();
                if (winOut.length > 0) return winOut;
            } catch {
                // Fall through to Tesseract CLI if available
            }
        }

        // 2. Cross-platform fallback: system tesseract CLI (Linux / macOS / custom Windows PATH)
        return await runTesseractFallback(imgPaths);
    } catch {
        return '';
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
}

export const FORM_DEFINITIONS = [
    // Registration & Suspension (longest/specific patterns first)
    { code: 'REG-31', pattern: /\b(?:FORM\s*GST\s*)?REG-31\b|RULE\s*21A\s*\(2A\)/i, docType: 'NOTICE', stage: 'REVOCATION', deadlineDays: 30, section: 'Rule 21A(2A)' },
    { code: 'REG-23', pattern: /\b(?:FORM\s*GST\s*)?REG-23\b|REJECTION\s+OF\s+REVOCATION/i, docType: 'NOTICE', stage: 'REVOCATION', deadlineDays: 7, section: 'Rule 23(3)' },
    { code: 'REG-22', pattern: /\b(?:FORM\s*GST\s*)?REG-22\b|ORDER\s+FOR\s+REVOCATION/i, docType: 'ORDER', stage: 'DROPPED', deadlineDays: 0, section: 'Rule 23(2)' },
    { code: 'REG-21', pattern: /\b(?:FORM\s*GST\s*)?REG-21\b|APPLICATION\s+FOR\s+REVOCATION/i, docType: 'REPLY', stage: 'REVOCATION', deadlineDays: 90, section: 'Section 30' },
    { code: 'REG-20', pattern: /\b(?:FORM\s*GST\s*)?REG-20\b|DROP\s+CANCELLATION/i, docType: 'ORDER', stage: 'DROPPED', deadlineDays: 0, section: 'Rule 22(4)' },
    { code: 'REG-19', pattern: /\b(?:FORM\s*GST\s*)?REG-19\b|ORDER\s+FOR\s+CANCELLATION/i, docType: 'ORDER', stage: 'CANCELLED', deadlineDays: 90, section: 'Section 29 / Rule 22(3)' },
    { code: 'REG-17', pattern: /\b(?:FORM\s*GST\s*)?REG-17\b/i, docType: 'NOTICE', stage: 'CANCELLATION_SCN', deadlineDays: 7, section: 'Section 29(2) / Rule 22(1)' },
    { code: 'REG-05', pattern: /\b(?:FORM\s*GST\s*)?REG-05\b/i, docType: 'ORDER', stage: 'APPEAL', deadlineDays: 90, section: 'Section 107' },
    { code: 'REG-06', pattern: /\b(?:FORM\s*GST\s*)?REG-06\b/i, docType: 'ACKNOWLEDGMENT', stage: 'ACTIVE', deadlineDays: 0, section: 'Rule 10' },
    { code: 'REG-03', pattern: /\b(?:FORM\s*GST\s*)?REG-03\b/i, docType: 'NOTICE', stage: 'REG_QUERY', deadlineDays: 7, section: 'Rule 9' },

    // Section 128A Waiver Series
    { code: 'SPL-07', pattern: /\b(?:FORM\s*GST\s*)?SPL-07\b|RESTORATION\s+OF\s+APPEAL/i, docType: 'ORDER', stage: 'WAIVER_REJECTED', deadlineDays: 90, section: 'Section 128A / Rule 164(12)' },
    { code: 'SPL-05', pattern: /\b(?:FORM\s*GST\s*)?SPL-05\b|APPROVAL\s+ORDER.*128A/i, docType: 'ORDER', stage: 'WAIVER_APPROVED', deadlineDays: 0, section: 'Section 128A / Rule 164(10)' },
    { code: 'SPL-04', pattern: /\b(?:FORM\s*GST\s*)?SPL-04\b/i, docType: 'REPLY', stage: 'WAIVER_SCN_REPLY', deadlineDays: 30, section: 'Rule 164(9)' },
    { code: 'SPL-03', pattern: /\b(?:FORM\s*GST\s*)?SPL-03\b/i, docType: 'NOTICE', stage: 'WAIVER_SCN', deadlineDays: 30, section: 'Rule 164(8)' },
    { code: 'SPL-02', pattern: /\b(?:FORM\s*GST\s*)?SPL-02\b/i, docType: 'REPLY', stage: 'WAIVER_APPLIED', deadlineDays: 0, section: 'Section 128A / Rule 164(2)' },
    { code: 'SPL-01', pattern: /\b(?:FORM\s*GST\s*)?SPL-01\b/i, docType: 'REPLY', stage: 'WAIVER_APPLIED', deadlineDays: 0, section: 'Section 128A / Rule 164(1)' },

    // Outcome / Closure Orders (check before Pre-SCN/SCN references cited inside text)
    { code: 'DRC-05', pattern: /\b(?:FORM\s*GST\s*)?DRC-05\b|AMYDT_DRPRC|ADJDT_DRPRC|ORDER\s+OF\s+ACCEPTANCE\s+OF\s+REPLY|DROPPING\s+THE\s+PROCEEDINGS|PROCEEDING\s+IS\s+DROPPED/i, docType: 'ORDER', stage: 'DROPPED', deadlineDays: 0, section: 'Section 73(8)/74(8)/Rule 142(3)' },
    { code: 'ASMT-12', pattern: /\b(?:FORM\s*GST\s*)?ASMT-12\b|SR_DrpProcd/i, docType: 'ORDER', stage: 'DROPPED', deadlineDays: 0, section: 'Section 61(2) / Rule 99(3)' },
    { code: 'DRC-03A', pattern: /\b(?:FORM\s*GST\s*)?DRC-03A\b|RULE\s*142\s*\(2B\)/i, docType: 'PAYMENT', stage: 'DEMAND_ADJUSTED', deadlineDays: 0, section: 'Rule 142(2B)' },
    { code: 'DRC-03', pattern: /\b(?:FORM\s*GST\s*)?DRC-03\b/i, docType: 'PAYMENT', stage: 'VOLUNTARY_PAYMENT', deadlineDays: 0, section: 'Section 73/74 / Rule 142(2)' },
    { code: 'DRC-06', pattern: /\b(?:FORM\s*GST\s*)?DRC-06\b|RULE\s*142\s*\(4\)/i, docType: 'REPLY', stage: 'SCN_REPLIED', deadlineDays: 0, section: 'Rule 142(4)' },
    { code: 'DRC-07', pattern: /\b(?:FORM\s*GST\s*)?DRC-07\b|SUMMARY\s+OF\s+THE\s+ORDER/i, docType: 'ORDER', stage: 'DEMAND_ORDER', deadlineDays: 90, section: 'Section 73(9)/74(9)/74A' },
    { code: 'DRC-08', pattern: /\b(?:FORM\s*GST\s*)?DRC-08\b|RO_AddtnlInfo|NOTIFICATION\s*NO\.?\s*22\/2024|SPECIAL\s+PROCEDURE\s+FOR\s+RECTIFICATION/i, docType: 'ORDER', stage: 'RECTIFICATION', deadlineDays: 90, section: 'Section 148/161 / Notif 22/2024' },
    { code: 'DRC-01B', pattern: /\b(?:FORM\s*GST\s*)?DRC-01B\b|RULE\s*88C/i, docType: 'NOTICE', stage: 'RULE_88C_INTIMATION', deadlineDays: 7, section: 'Rule 88C / Section 75(12)' },
    { code: 'DRC-01C', pattern: /\b(?:FORM\s*GST\s*)?DRC-01C\b|RULE\s*88D/i, docType: 'NOTICE', stage: 'RULE_88D_INTIMATION', deadlineDays: 7, section: 'Rule 88D' },
    { code: 'DRC-01A', pattern: /\b(?:FORM\s*GST\s*)?DRC-01A\b|RULE\s*142\s*\(1A\)|INTIMATION\s+OF\s+(?:TAX\s+ASCERTAINED|LIABILITY)/i, docType: 'NOTICE', stage: 'PRE_SCN_INTIMATION', deadlineDays: 15, section: 'Section 73(5)/74(5)/Rule 142(1A)' },
    { code: 'DRC-01', pattern: /\b(?:FORM\s*GST\s*)?DRC-01\b|SHOW\s*CAUSE\s*NOTICE/i, docType: 'NOTICE', stage: 'SCN_ISSUED', deadlineDays: 30, section: 'Section 73/74/74A' },

    // Scrutiny, Audit & Non-Filer Notices
    { code: 'ASMT-10', pattern: /\b(?:FORM\s*GST\s*)?ASMT-10\b/i, docType: 'NOTICE', stage: 'SCRUTINY_NOTICE', deadlineDays: 30, section: 'Section 61(1) / Rule 99(1)' },
    { code: 'ASMT-11', pattern: /\b(?:FORM\s*GST\s*)?ASMT-11\b/i, docType: 'REPLY', stage: 'SCRUTINY_REPLIED', deadlineDays: 0, section: 'Section 61(2) / Rule 99(2)' },
    { code: 'ASMT-13', pattern: /\b(?:FORM\s*GST\s*)?ASMT-13\b/i, docType: 'ORDER', stage: 'BEST_JUDGMENT', deadlineDays: 30, section: 'Section 62(1) / Rule 100(1)' },
    { code: 'GSTR-3A', pattern: /\b(?:FORM\s*GST\s*)?GSTR-3A\b|GSTR3A/i, docType: 'NOTICE', stage: 'RETURN_DEFAULT', deadlineDays: 15, section: 'Section 46 / Rule 68' },
    { code: 'GSTR-10-NOTICE', pattern: /GSTR-10.*FINAL\s+RETURN|FINAL\s+RETURN.*SECTION\s*45|NON-FILING\s+OF\s+GSTR-10/i, docType: 'NOTICE', stage: 'FINAL_RETURN_DEFAULT', deadlineDays: 7, section: 'Section 45 / Rule 81' },
    { code: 'EWB-NIL-NOTICE', pattern: /E-?WAY\s*BILL.*NIL|NIL\s*(?:GSTR-1|GSTR-3B).*E-?WAY|CMD-08/i, docType: 'NOTICE', stage: 'SCRUTINY_NOTICE', deadlineDays: 7, section: 'Section 37 / Rule 59 / CMD-08' },
    { code: 'ADT-02', pattern: /\b(?:FORM\s*GST\s*)?ADT-02\b|FINAL\s+AUDIT\s+REPORT/i, docType: 'ORDER', stage: 'AUDIT_REPORT', deadlineDays: 30, section: 'Section 65(6) / Rule 101(5)' },
    { code: 'ADT-01', pattern: /\b(?:FORM\s*GST\s*)?ADT-01\b|RULE\s*101\s*\(4\)/i, docType: 'NOTICE', stage: 'AUDIT_NOTICE', deadlineDays: 30, section: 'Section 65(1) / Rule 101(1)/(4)' },

    // Appeals & Advance Ruling
    { code: 'APL-05', pattern: /\b(?:FORM\s*GST\s*)?APL-05\b|\bAPL-02A\b|TRADE\s+CIRCULAR\s*21T/i, docType: 'REPLY', stage: 'GSTAT_APPEAL', deadlineDays: 90, section: 'Section 112 / Rule 110(1)' },
    { code: 'APL-04', pattern: /\b(?:FORM\s*GST\s*)?APL-04\b/i, docType: 'ORDER', stage: 'APPEAL_ORDER', deadlineDays: 90, section: 'Section 107(11) / Rule 113(1)' },
    { code: 'APL-02', pattern: /\b(?:FORM\s*GST\s*)?APL-02\b/i, docType: 'ACKNOWLEDGMENT', stage: 'APPEAL_ADMITTED', deadlineDays: 0, section: 'Rule 108(3)' },
    { code: 'APL-01', pattern: /\b(?:FORM\s*GST\s*)?APL-01\b|APPEAL\s+TO\s+APPELLATE\s+AUTHORITY/i, docType: 'REPLY', stage: 'FIRST_APPEAL', deadlineDays: 90, section: 'Section 107(1) / Rule 108(1)' },
    { code: 'ARA-01', pattern: /\b(?:FORM\s*GST\s*)?ARA-01\b/i, docType: 'REPLY', stage: 'ADVANCE_RULING', deadlineDays: 0, section: 'Section 97 / Rule 98' },

    // Detention in Transit (Sec 129)
    { code: 'MOV-09', pattern: /\b(?:FORM\s*GST\s*)?MOV-09\b/i, docType: 'ORDER', stage: 'DETENTION_ORDER', deadlineDays: 90, section: 'Section 129(3)' },
    { code: 'MOV-07', pattern: /\b(?:FORM\s*GST\s*)?MOV-07\b/i, docType: 'NOTICE', stage: 'DETENTION_SCN', deadlineDays: 7, section: 'Section 129(3)' },
    { code: 'MOV-01', pattern: /\b(?:FORM\s*GST\s*)?MOV-0[1-6]\b/i, docType: 'EVIDENCE', stage: 'DETENTION_INSP', deadlineDays: 7, section: 'Section 68 / 129' },

    // Refunds & Re-Credit
    { code: 'RFD-09', pattern: /\b(?:FORM\s*GST\s*)?RFD-09\b|SCNReply/i, docType: 'REPLY', stage: 'REFUND_SCN_REPLIED', deadlineDays: 0, section: 'Rule 92(3)' },
    { code: 'RFD-08', pattern: /\b(?:FORM\s*GST\s*)?RFD-08\b/i, docType: 'NOTICE', stage: 'REFUND_SCN', deadlineDays: 15, section: 'Rule 92(3)' },
    { code: 'RFD-06', pattern: /\b(?:FORM\s*GST\s*)?RFD-06\b/i, docType: 'ORDER', stage: 'REFUND_ORDER', deadlineDays: 90, section: 'Section 54 / Rule 92(1)' },
    { code: 'RFD-03', pattern: /\b(?:FORM\s*GST\s*)?RFD-03\b|DEFICIENCY\s+MEMO/i, docType: 'NOTICE', stage: 'REFUND_DEFICIENT', deadlineDays: 0, section: 'Rule 90(3)' },
    { code: 'RFD-02', pattern: /\b(?:FORM\s*GST\s*)?RFD-02\b/i, docType: 'ACKNOWLEDGMENT', stage: 'REFUND_ACK', deadlineDays: 0, section: 'Rule 90(2)' },
    { code: 'RFD-01', pattern: /\b(?:FORM\s*GST\s*)?RFD-01\b/i, docType: 'REPLY', stage: 'REFUND_APPLIED', deadlineDays: 0, section: 'Section 54 / Rule 89' },
    { code: 'PMT-03', pattern: /\b(?:FORM\s*GST\s*)?PMT-03A?\b/i, docType: 'ORDER', stage: 'REFUND_RECREDIT', deadlineDays: 0, section: 'Rule 86(4) / 87(11)' },
    { code: 'PMT-06', pattern: /\b(?:FORM\s*GST\s*)?PMT-0[67]\b/i, docType: 'PAYMENT', stage: 'CHALLAN', deadlineDays: 0, section: 'Rule 87' },

    // Blocking, Standalone Interest & Penalty
    { code: 'RULE-86A', pattern: /RULE\s*86A|BLOCKED\s*CREDIT\s*LEDGER|BLOCKING.*CREDIT\s*LEDGER/i, docType: 'NOTICE', stage: 'CREDIT_BLOCKED', deadlineDays: 7, section: 'Rule 86A' },
    { code: 'SEC-50-ORDER', pattern: /SECTION\s*50\s*\(1\).*(?:75\s*\(12\)|79)|INTEREST\s+ORDER.*50/i, docType: 'ORDER', stage: 'DEMAND_ORDER', deadlineDays: 90, section: 'Section 50(1) r/w 75(12) & 79' },
    { code: 'PCT-05', pattern: /\b(?:FORM\s*GST\s*)?PCT-05\b|GSTPCT_5|AUTHORITY\s+LETTER|LETTER\s+OF\s+AUTHORITY|VAKALATNAMA/i, docType: 'TEMPLATE', stage: 'REPRESENTATION', deadlineDays: 0, section: 'Section 116 / Rule 83' },

    // MVAT Pre-GST & Settlement Act 2022
    { code: 'MVAT-SETTLEMENT', pattern: /SETTLEMENT\s+ACT.*2022|ORDER\s+OF\s+SETTLEMENT|\bFORM\s*(?:I|III|IV)\b.*MAHARASHTRA/i, docType: 'ORDER', stage: 'MVAT_SETTLEMENT', deadlineDays: 0, section: 'Mah Settlement Act 2022 Sec 12/13' },
    { code: 'MVAT-303', pattern: /FORM\s*303|MVAT\s*ACT|SECTION\s*23\s*\((?:2|5|6)\)|FORM\s*704|J1\s*[X*]\s*J2/i, docType: 'ORDER', stage: 'MVAT_ASSESSMENT', deadlineDays: 60, section: 'MVAT Sec 23 / 26 / Form 704' }
];

const PARAM_RULES = [
    { code: '0070', regex: /PARA(?:METER)?[\s:-]*0*70\b|GSTR-?3B.*LESS\s+THAN\s+GSTR-?1|OUTWARD.*3B.*GSTR-?1/i },
    { code: '0072', regex: /PARA(?:METER)?[\s:-]*0*72\b|GSTR\s*-?3B\s+Non-?filer/i },
    { code: '0073', regex: /PARA(?:METER)?[\s:-]*0*73\b|RFR-5\b|EXCESS\s+ITC.*2[AB]|TABLE\s*8A.*8[BC]|3B.*2A/i },
    { code: '0074', regex: /PARA(?:METER)?[\s:-]*0*74\b|NGTP|NON-GENUINE|RC\s*(?:IS\s+)?CANCELLED|CANCELLED\s+AB-?INITIO/i },
    { code: '0077', regex: /PARA(?:METER)?[\s:-]*0*77\b|LESS\s+RCM|REVERSE\s+CHARGE.*3\.1\s*\(d\)|4A\s*\((?:2|3)\)/i },
    { code: '0078', regex: /PARA(?:METER)?[\s:-]*0*78\b|SECTION\s*16\s*\((?:4|5|6)\)|BEYOND.*PRESCRIBED\s+TIME\s+LIMIT/i },
    { code: '0080', regex: /PARA(?:METER)?[\s:-]*0*80\b|SECTION\s*50\b|RULE\s*88B\b|INTEREST\s+FOR\s+LATE\s+PAYMENT/i },
    { code: '0103', regex: /PARA(?:METER)?[\s:-]*0*103\b|GSTR-?9.*ADDITIONAL\s+LIABILITY/i },
    { code: '0127', regex: /PARA(?:METER)?[\s:-]*0*127\b|GSTR-?9\s*TABLE\s*12|TABLE\s*4\s*\(B\)\s*\((?:1|2)\)/i },
    { code: '0219', regex: /PARA(?:METER)?[\s:-]*0*219\b|GSTR-?9C|TABLE\s*9S|TABLE\s*12F/i }
];

const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function hasValidGstinChecksum(g) {
    if (!g || g.length !== 15) return false;
    let sum = 0;
    for (let i = 0; i < 14; i++) {
        const idx = GSTIN_CHARSET.indexOf(g[i]);
        if (idx < 0) return false;
        const p = idx * (i % 2 === 0 ? 1 : 2);
        sum += Math.floor(p / 36) + (p % 36);
    }
    return GSTIN_CHARSET[(36 - (sum % 36)) % 36] === g[14];
}

function normalizeOcrGstin(rawGstin) {
    if (!rawGstin) return null;
    if (hasValidGstinChecksum(rawGstin)) return rawGstin;
    // Repair common OCR 1/I confusion at position 13 (entity code) if doing so yields exact GSTIN checksum match
    if (rawGstin[12] === 'I') {
        const candidate = `${rawGstin.slice(0, 12)}1${rawGstin.slice(13)}`;
        if (hasValidGstinChecksum(candidate)) return candidate;
    }
    return rawGstin;
}

export function normalizeFormText(input = '') {
    return String(input)
        .replace(/_/g, ' ')
        .replace(/([A-Z]{2,5})\s*[-–—]\s*([0-9IOl]{1,3}[A-Z]?)/gi, '$1-$2')
        .replace(/\b(ASMT|DRC|APL|SPL|REG|RFD|ADT|MOV|PMT|GSTR)-([0-9IOl]{1,2})([A-C]?)\b/gi, (_, pfx, num, suf) => {
            const digits = num.replace(/[IO]/g, (c) => (c === 'I' ? '1' : '0')).replace(/l/g, '1');
            return `${pfx.toUpperCase()}-${digits}${suf ? suf.toUpperCase() : ''}`;
        })
        .replace(/\s+/g, ' ');
}

export function normalizeFy(raw) {
    if (!raw) return null;
    const clean = String(raw).replace('/', '-').trim();
    if (/^20\d{2}-20\d{2}$/.test(clean)) return `${clean.slice(0, 4)}-${clean.slice(7, 9)}`;
    if (/^20\d{2}-\d{2}$/.test(clean)) return clean;
    return null;
}

export function classifyNoticeDocument(fileName = '', rawText = '', relPath = '') {
    const normName = normalizeFormText(fileName);
    const normPath = normalizeFormText(relPath);
    const strippedMarkers = String(rawText || '').replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '').trim();
    const isScannedImagePdf = /\.pdf$/i.test(fileName) && strippedMarkers.length < 30;
    const normBody = normalizeFormText(rawText.slice(0, 30000));
    const headerZone = normalizeFormText(rawText.slice(0, 1400));
    const haystack = `${normName}\n${normBody}\n${normPath}`;

    let matched = null;

    // 1. Prioritize Document Identity from Header Zone & File Name before deep cross-references
    const isDropOrderHeader = /\b(?:FORM\s*GST\s*)?(?:DRC-05|ASMT-12)\b|DROPPING\s+THE\s+PROCEEDINGS|PROCEEDINGS?\s+(?:INITIATED\s+)?(?:ARE|IS)\s+DROPPED|TECHNICAL\s+PURPOSE\s+TO\s+DROP/i.test(headerZone + ' ' + normName);
    const isAppealHeader = /\bFORM\s*GST\s*APL\s*[-–]?\s*05\b/i.test(headerZone + ' ' + normName)
        ? 'APL-05'
        : (/\bFORM\s*GST\s*APL\s*[-–]?\s*01\b|APPEAL\s+TO\s+APPELLATE\s+AUTHORITY/i.test(headerZone + ' ' + normName) ? 'APL-01' : null);
    const isAdjudicationOrderHeader = /\bAdjudication\s+Order\b|\[\s*U\/s\s*Section\s*7[34]A?\s*\(\s*9\s*\)|\b(?:FORM\s*GST\s*)?DRC-07\b|SUMMARY\s+OF\s+THE\s+ORDER/i.test(headerZone + ' ' + normName);
    const isPortalNoticePartA = /\bFORM\s*GST\s*DRC-01A\b[\s\S]{0,160}\bPart\s*A\b|\bIntimation\s+of\s+tax\s+ascertained\s+as\s+being\s+payable\b|\bSummary\s+of\s+Show\s+Cause\s+Notice\b|\bnot\s+filed\s+reply\b/i.test(headerZone);
    const isReplyDocHeader = !isPortalNoticePartA && /(?:^|\b)(?:Subject:\s*Reply|Reply\s+to\s+(?:GST\s+)?(?:Scrutiny|Intimation|Form\s*GST|ASMT-10|DRC-01A?|SCN)|Written\s+Submission|Clarification\s*&\s*Submission|GST\s*REPLY|REPLY\s*LETTER)\b/i.test(headerZone + ' ' + normName);

    if (isDropOrderHeader) {
        matched = FORM_DEFINITIONS.find((d) => d.code === 'ASMT-12' && /ASMT-12/i.test(headerZone + ' ' + normName))
            || FORM_DEFINITIONS.find((d) => d.code === 'DRC-05');
    } else if (isAppealHeader) {
        matched = FORM_DEFINITIONS.find((d) => d.code === isAppealHeader);
    } else if (isReplyDocHeader) {
        if (/DRC-01A/i.test(headerZone)) {
            matched = { code: 'DRC-01A (Part B)', docType: 'REPLY', stage: 'PRE_SCN_REPLIED', deadlineDays: 0, section: 'Section 73(5)/74(5)/Rule 142(1A)' };
        } else if (/ASMT-10|ASMT-11/i.test(headerZone)) {
            matched = FORM_DEFINITIONS.find((d) => d.code === 'ASMT-11');
        } else {
            matched = FORM_DEFINITIONS.find((d) => d.code === 'DRC-06');
        }
    } else if (isAdjudicationOrderHeader) {
        matched = FORM_DEFINITIONS.find((d) => d.code === 'DRC-07');
    } else if (/^\s*FORM\s*GST\s*DRC\s*[-–]?\s*01\b(?!\s*[ABC])/i.test(headerZone) || /\bFORM\s*GST\s*DRC-01\b(?!\s*[ABC])/i.test(headerZone.slice(0, 350))) {
        matched = FORM_DEFINITIONS.find((d) => d.code === 'DRC-01');
    }

    // 2. Fallback: headerZone definitions -> fileName definitions -> full body definitions
    if (!matched) {
        for (const def of FORM_DEFINITIONS) {
            if (def.pattern.test(headerZone)) {
                matched = { ...def };
                break;
            }
        }
    }
    if (!matched) {
        for (const def of FORM_DEFINITIONS) {
            if (def.pattern.test(normName)) {
                matched = { ...def };
                break;
            }
        }
    }
    if (!matched) {
        for (const def of FORM_DEFINITIONS) {
            if (def.pattern.test(normBody)) {
                matched = { ...def };
                break;
            }
        }
    } else {
        matched = { ...matched };
    }

    // Refine DRC-01 vs Sec 125 7-day Penalty SCN (must actually invoke Sec 125 or General Penalty, not mere Rule 100(2) header)
    if (matched?.code === 'DRC-01' && (/SECTION\s*125\b|GENERAL\s+PENALTY/i.test(haystack) || (/RULE\s*100\s*\(2\)/i.test(haystack) && !/SECTION\s*7[34]/i.test(haystack)))) {
        matched = { ...matched, code: 'DRC-01 (Sec 125)', deadlineDays: 7, section: 'Section 125 / Rule 100(2)' };
    }
    if (!matched) {
        matched = { code: 'OTHER', docType: 'EVIDENCE', stage: 'SUPPORTING', deadlineDays: 30, section: '' };
    }

    // Parameter codes detected
    const paramCodes = [];
    for (const pr of PARAM_RULES) {
        if (pr.regex.test(haystack)) paramCodes.push(pr.code);
    }

    // Identifiers (includes OCR tolerance for position-13 'I' -> '1' inside Z-penultimate GSTIN)
    const rawGstinMatch = headerZone.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/)
        || haystack.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/);
    const ocrGstinFixMatch = !rawGstinMatch ? haystack.match(/\b(\d{2}[A-Z]{5}\d{4}[A-Z])([1-9A-Z])Z([0-9A-Z])\b/) : null;
    const gstinResolved = normalizeOcrGstin(rawGstinMatch ? rawGstinMatch[0] : (ocrGstinFixMatch ? `${ocrGstinFixMatch[1]}${ocrGstinFixMatch[2] === 'I' ? '1' : ocrGstinFixMatch[2]}Z${ocrGstinFixMatch[3]}` : null));
    const portalRefMatch = haystack.match(/\b(?:ZD|AD|AA|ZA)[A-Z0-9]{11,15}\b/);
    const genericRefMatch = haystack.match(/\b(?:Reference\s*(?:No\.?)?|Ref\s*(?:No\.?)?|Order\s*(?:No\.?)?|SCN\s*Ref\s*No\.?)[\s:-]*([A-Z0-9\/_-]{6,35})/i);
    const dinMatch = haystack.match(/\bDIN[\s:-]*(20\d{2}[A-Z0-9]{10,20})\b/i);

    // Prefer explicit tax period / FY declaration over stray order-issue FY (e.g. FY-2019-20 order passed in 2025-26)
    const explicitFyMatch = haystack.match(/(?:F\.?Y\.?\s*(?:From)?|Financial\s*Year|Tax\s*Period[^\n]{0,40}?(?:F\.?Y\.?)?)[\s.:=-]*(20(?:1[7-9]|2[0-9])\s*[-/]\s*(?:20)?(?:1[8-9]|2[0-9]|3[0-5]))/i)
        || haystack.match(/\b(?:01[\/.]04[\/.]|APR\s*)(20\d{2})\s*(?:to|-)\s*(?:31[\/.]03[\/.]|MAR\s*)(20\d{2})\b/i);
    let financialYear = null;
    if (explicitFyMatch) {
        financialYear = explicitFyMatch[2]
            ? `${explicitFyMatch[1]}-${explicitFyMatch[2].slice(2)}`
            : normalizeFy(explicitFyMatch[1]);
    }
    if (!financialYear) {
        const fyMatch = haystack.match(/\b(20(?:1[7-9]|2[0-9])\s*[-/]\s*(?:20)?(?:1[8-9]|2[0-9]|3[0-5]))\b/);
        financialYear = normalizeFy(fyMatch?.[1] || normPath.match(/\b(20\d{2}[-/]\d{2,4})\b/)?.[1] || null);
    }

    const fmtDate = (d) => {
        if (!d) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { const [y, m, dy] = d.split('-'); return `${dy}/${m}/${y}`; }
        return d.replace(/[.-]/g, '/');
    };
    const dateMatch = headerZone.match(/\bOrder\s*(?:No\.?[^0-9\n]{0,60})?Dated?[\s.:-]*(\d{2}[\/.-]\d{2}[\/.-]20\d{2}|20\d{2}-\d{2}-\d{2})\b/i)
        || headerZone.match(/\b(?:Order\s*Date|Reference\s*No\.?[^\n]{0,40}Date|Date|Dated|Dt\.?)[\s:-]*(\d{2}[\/.-]\d{2}[\/.-]20\d{2}|20\d{2}-\d{2}-\d{2})\b/i)
        || haystack.match(/\b(?:Date|Dated|Dt\.?)[\s:-]*(\d{2}[\/.-]\d{2}[\/.-]20\d{2}|20\d{2}-\d{2}-\d{2})\b/i)
        || haystack.match(/\b(\d{2}[\/.-]\d{2}[\/.-]20\d{2}|20\d{2}-\d{2}-\d{2})\b/);
    const dueMatch = haystack.match(/\b(?:by|within|before|due\s*date|submit.*?by)[\s:-]*(\d{2}[\/.-]\d{2}[\/.-]20\d{2}|20\d{2}-\d{2}-\d{2})\b/i);

    const legalNameMatch = headerZone.match(/(?:Legal\s*Name|Name)\s*[:=-]+\s*([A-Z0-9\s.&()-]{3,60}?)(?=\s+(?:Trade\s*Name|Address|GSTIN|Tax\s*Period|$))/i);
    const officerMatch = haystack.match(/\b((?:Deputy|Dy\.?|Asst\.?|Assistant|Joint|Additional|State\s*Tax)\s+Commissioner(?:\s+of\s+State\s+Tax)?|(?:State|Central)\s+Tax\s+Officer)\b/i);
    const jurisMatch = haystack.match(/\b([A-Z]{2,8}[_-](?:LTU|INV|NOD|APP)[_-][A-Z0-9_-]{1,18}|[A-Z]+_\d{3}:[A-Z0-9_:-]+)\b/);

    let sectionInvoked = matched.section;
    if (/\b74A\b/i.test(headerZone)) sectionInvoked = 'Section 74A';
    else if (/\b74\b/i.test(headerZone) && (matched.code.startsWith('DRC-') || matched.code.startsWith('APL-'))) sectionInvoked = 'Section 74';
    else if (/\b73\b/i.test(headerZone) && (matched.code.startsWith('DRC-') || matched.code.startsWith('APL-'))) sectionInvoked = 'Section 73';
    else if (/\b74\b/i.test(haystack) && matched.code.startsWith('DRC-')) sectionInvoked = 'Section 74';
    else if (/\b73\b/i.test(haystack) && matched.code.startsWith('DRC-')) sectionInvoked = 'Section 73';

    return {
        formCode: matched.code,
        documentType: matched.docType,
        stage: matched.stage,
        deadlineDays: matched.deadlineDays,
        sectionCited: sectionInvoked,
        paramCodes,
        gstin: gstinResolved,
        portalRefNo: portalRefMatch ? portalRefMatch[0] : (genericRefMatch ? genericRefMatch[1].trim() : null),
        din: dinMatch ? dinMatch[1] : null,
        financialYear,
        issueDate: fmtDate(dateMatch?.[1]),
        explicitDueDate: fmtDate(dueMatch?.[1]),
        legalName: legalNameMatch ? legalNameMatch[1].replace(/^[-:\s]+/, '').trim() : null,
        issuingOfficer: officerMatch ? officerMatch[1].trim() : null,
        issuingJurisdiction: jurisMatch ? jurisMatch[1].trim() : null,
        isScannedImagePdf
    };
}

/**
 * Extracts Tax, Interest, Penalty & Late Fee amounts genuinely present in text (no synthetic estimation).
 */
export function extractDemandBreakdown(rawText = '') {
    // Strip statutory Act years ("Act, 2017", "Act of 2017") and PIN codes before parsing rupee figures
    const txt = String(rawText || '')
        .replace(/\bAct(?:,?\s*(?:of\s*)?)?(?:20\d{2}|19\d{2})\b/gi, 'Act')
        .replace(/\s+/g, ' ');
    const parseNum = (s) => {
        const n = parseFloat(String(s || '0').replace(/,/g, '').replace(/\/-$/, ''));
        return Number.isFinite(n) ? n : 0;
    };

    let igst = 0;
    let cgst = 0;
    let sgst = 0;
    let tax = 0;
    let interest = 0;
    let penalty = 0;
    let lateFee = 0;

    // 1. Try GST Adjudication Order / DRC-07 Final Summary Table ("All issues TAX 53733 310550 310549 674833 INTEREST ... PENALTY ...")
    const allIssuesBlock = txt.match(/All\s+issues\s+TAX\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+INTEREST\s+[\d,.]+\s+[\d,.]+\s+[\d,.]+\s+([\d,]+(?:\.\d{1,2})?)\s+PENALTY\s+[\d,.]+\s+[\d,.]+\s+[\d,.]+\s+([\d,]+(?:\.\d{1,2})?)/i)
        || txt.match(/TOTAL\s+Tax\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+Interest\s+[\d,.]+\s+[\d,.]+\s+[\d,.]+\s+([\d,]+(?:\.\d{1,2})?)\s+Penalty\s+[\d,.]+\s+[\d,.]+\s+[\d,.]+\s+([\d,]+(?:\.\d{1,2})?)/i);
    if (allIssuesBlock) {
        igst = parseNum(allIssuesBlock[1]);
        cgst = parseNum(allIssuesBlock[2]);
        sgst = parseNum(allIssuesBlock[3]);
        tax = parseNum(allIssuesBlock[4]);
        interest = parseNum(allIssuesBlock[5]);
        penalty = parseNum(allIssuesBlock[6]);
    }

    // 2. Try DRC-01A Summary Table ("TAX 618318 618318 0 0 INTEREST 393745 409187 0 0 PENALTY 61832 61832 0 0 TOTAL 2163231" or "Total 2257606 1163440 0 0 0 3421046")
    if (tax === 0 && interest === 0) {
        const drc01aActWiseTotal = txt.match(/Total\s+(?:\(Act\s*wise\)[\s\S]{0,160}?)?\bTotal\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)/i);
        if (drc01aActWiseTotal) {
            tax = parseNum(drc01aActWiseTotal[1]);
            interest = parseNum(drc01aActWiseTotal[2]);
            penalty = parseNum(drc01aActWiseTotal[3]);
            lateFee = parseNum(drc01aActWiseTotal[4]);
        }
    }

    // 3. Try DRC-01 Portal Demand Table row ("APR 2022 MAR 2023 IGST Maharashtra 1,50,503.00 0.00 0.00 0.00 0.00 1,50,503.00" or "Total 0.00 29,281.00 0.00 0.00 0.00 29,281.00")
    if (tax === 0 && interest === 0) {
        const drc01PortalRow = txt.match(/\b(IGST|CGST|SGST)\s+(?:Maharashtra|Karnataka|Gujarat|Delhi|NA|[A-Z][a-z]+)\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+[\d,.]+\s+([\d,]+(?:\.\d{1,2})?)/i);
        const portalTotalRow = txt.match(/Demand\s*Details[\s\S]{0,600}?\bTotal\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+[\d,.]+\s+([\d,]+(?:\.\d{1,2})?)/i);
        if (portalTotalRow) {
            tax = parseNum(portalTotalRow[1]);
            interest = parseNum(portalTotalRow[2]);
            penalty = parseNum(portalTotalRow[3]);
            lateFee = parseNum(portalTotalRow[4]);
        } else if (drc01PortalRow) {
            const act = drc01PortalRow[1].toUpperCase();
            const rowTax = parseNum(drc01PortalRow[2]);
            if (act === 'IGST') igst = rowTax;
            else if (act === 'CGST') cgst = rowTax;
            else if (act === 'SGST') sgst = rowTax;
            tax = rowTax;
            interest = parseNum(drc01PortalRow[3]);
            penalty = parseNum(drc01PortalRow[4]);
            lateFee = parseNum(drc01PortalRow[5]);
        }
    }

    // 4. General inline fallback when structured tables were absent
    if (tax === 0 && interest === 0 && penalty === 0) {
        igst = parseNum(txt.match(/\bIGST\b[^A-Za-z0-9]{0,6}(?:(?:Rs\.?|₹|INR)\s*)?([\d,]+(?:\.\d{1,2})?)/i)?.[1]);
        cgst = parseNum(txt.match(/\b(?:CGST|Central\s*Tax)\b[^A-Za-z0-9]{0,6}(?:(?:Rs\.?|₹|INR)\s*)?([\d,]+(?:\.\d{1,2})?)/i)?.[1]);
        sgst = parseNum(txt.match(/\b(?:SGST|State\/UT\s*Tax)\b[^A-Za-z0-9]{0,6}(?:(?:Rs\.?|₹|INR)\s*)?([\d,]+(?:\.\d{1,2})?)/i)?.[1]);
        tax = igst + cgst + sgst;
        if (tax === 0) {
            const directTax = txt.match(/(?:PROPOSED\s+TAX\s+LIABILITY|excess\s+ITC|payment\s+of\s+ITC\s+of|amount(?:ing)?\s+to|Tax\/Cess|Total\s*Tax|basic\s*Tax\s*liability|at)\s*(?:of\s+)?(?:Rs\.?|₹|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i);
            if (directTax) tax = parseNum(directTax[1]);
        }
        interest = parseNum(txt.match(/\b(?:applicable\s+)?Interest\b[^0-9]{0,25}(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1]
            || txt.match(/\bInterest\s*[:=-]\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1]);
        penalty = parseNum(txt.match(/\bPenalty\b[^0-9]{0,25}(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1]
            || txt.match(/\bPenalty\s*[:=-]\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1]);
        lateFee = parseNum(txt.match(/\bLate\s*Fee\b[^0-9]{0,25}(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1]);
    }

    return {
        igst,
        cgst,
        sgst,
        taxDemanded: Math.round(tax * 100) / 100,
        interestDemanded: Math.round(interest * 100) / 100,
        penaltyDemanded: Math.round(penalty * 100) / 100,
        lateFeeDemanded: Math.round(lateFee * 100) / 100,
        totalDemanded: Math.round((tax + interest + penalty + lateFee) * 100) / 100
    };
}

/**
 * Lightweight ZIP entry reader using Node built-in zlib (STORE=0 / DEFLATE=8 only).
 * shortcut: built-in zlib reader handles STORE/DEFLATE only; upgrade to yauzl only if Deflate64 zips appear.
 */
export function readZipEntries(buffer, filterFn = () => true) {
    const out = [];
    // Locate End of Central Directory (PK\x05\x06) scanning backwards from tail
    let eocd = -1;
    const minOff = Math.max(0, buffer.length - 65557);
    for (let i = buffer.length - 22; i >= minOff; i--) {
        if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return out;
    const cdCount = buffer.readUInt16LE(eocd + 10);
    let ptr = buffer.readUInt32LE(eocd + 16);

    for (let i = 0; i < cdCount && ptr + 46 <= buffer.length; i++) {
        if (buffer.readUInt32LE(ptr) !== 0x02014b50) break;
        const method = buffer.readUInt16LE(ptr + 10);
        const compSize = buffer.readUInt32LE(ptr + 20);
        const uncompSize = buffer.readUInt32LE(ptr + 24);
        const nameLen = buffer.readUInt16LE(ptr + 28);
        const extraLen = buffer.readUInt16LE(ptr + 30);
        const commentLen = buffer.readUInt16LE(ptr + 32);
        const localHdrOff = buffer.readUInt32LE(ptr + 42);
        const name = buffer.slice(ptr + 46, ptr + 46 + nameLen).toString('utf8');
        ptr += 46 + nameLen + extraLen + commentLen;

        const MAX_ZIP_ENTRY_BYTES = 15 * 1024 * 1024;
        if (!filterFn(name) || uncompSize > MAX_ZIP_ENTRY_BYTES || compSize > MAX_ZIP_ENTRY_BYTES || localHdrOff + 30 > buffer.length || buffer.readUInt32LE(localHdrOff) !== 0x04034b50) continue;
        const lNameLen = buffer.readUInt16LE(localHdrOff + 26);
        const lExtraLen = buffer.readUInt16LE(localHdrOff + 28);
        const dataStart = localHdrOff + 30 + lNameLen + lExtraLen;
        const comp = buffer.slice(dataStart, dataStart + compSize);
        try {
            const raw = method === 0 ? comp : (method === 8 ? zlib.inflateRawSync(comp, { maxOutputLength: MAX_ZIP_ENTRY_BYTES }) : null);
            if (raw && raw.length <= MAX_ZIP_ENTRY_BYTES) out.push({ name, data: raw });
        } catch {
            // Encrypted, oversized (ZIP bomb), or unsupported compression skipped gracefully
        }
    }
    return out;
}

export async function extractTextFromBuffer(buffer, fileName = '') {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.pdf')) {
        let extractedText = '';
        try {
            const pdfMod = await import('pdf-parse');
            const PDFParseClass = pdfMod.PDFParse || pdfMod.default?.PDFParse;
            if (PDFParseClass) {
                const parser = new PDFParseClass({ data: buffer });
                const res = await parser.getText();
                extractedText = typeof res === 'string' ? res : (res?.text || '');
            } else if (typeof pdfMod.default === 'function') {
                const parsed = await pdfMod.default(buffer);
                extractedText = parsed?.text || '';
            }
        } catch {
            extractedText = '';
        }

        // Automatic Local OCR Fallback for scanned image PDFs (WinRT on Windows, Tesseract CLI elsewhere)
        const stripped = String(extractedText || '').replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '').trim();
        if (stripped.length < 35) {
            try {
                const ocrText = await runLocalNativeOcrOnPdf(buffer);
                if (ocrText && ocrText.trim().length > 30) {
                    return ocrText;
                }
            } catch {
                // If local OCR fails or binary unavailable, return original text
            }
        }
        return extractedText;
    }
    if (lower.endsWith('.docx')) {
        const entries = readZipEntries(buffer, (n) => n === 'word/document.xml' || /^word\/(header|footer)\d*\.xml$/.test(n));
        return entries
            .map((e) => e.data.toString('utf8').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))
            .join('\n')
            .trim();
    }
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
        try {
            const xlsxMod = await import('xlsx');
            const XLSX = xlsxMod.default || xlsxMod;
            const wb = XLSX.read(buffer, { type: 'buffer' });
            return wb.SheetNames.slice(0, 6).map((s) => `[${s}]\n${XLSX.utils.sheet_to_csv(wb.Sheets[s]).slice(0, 6000)}`).join('\n');
        } catch {
            return '';
        }
    }
    if (lower.endsWith('.txt') || lower.endsWith('.json')) {
        return buffer.toString('utf8').slice(0, 30000);
    }
    return '';
}

export function isSkippableScrutinyFile(fileName = '') {
    const lower = fileName.toLowerCase();
    return /\.(tsf|900|1800|500|bak|rar|exe|dll|zip\.tmp)$/i.test(lower)
        || /^(thumbs\.db|desktop\.ini|~\$)/i.test(path.basename(lower));
}
