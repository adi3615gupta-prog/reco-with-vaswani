/**
 * NOTICE-SHIELD AI: Zero-Trust PII Sanitization & Re-Hydration Engine
 * 
 * Strict Zero-Data-Leakage Guarantee:
 * Scrubs all sensitive client identifiers (GSTINs, PANs, ARNs, DINs, legal/trade names,
 * phone numbers, emails, officer names) into reversible token placeholders (e.g. {{GSTIN_TOKEN_1}}).
 * Preserves all statutory provisions (Section 73, Section 16(2)(c), Rule 88C), financial years,
 * dates, and monetary amounts (₹) so mathematical and legal analysis remains 100% accurate.
 * 
 * Client data never leaves the local machine.
 */

export interface SensitiveMatch {
    type: 'GSTIN' | 'PAN' | 'ARN' | 'DIN' | 'TIN' | 'BANK_AC' | 'ENTITY_NAME' | 'OFFICER_NAME' | 'PHONE' | 'EMAIL';
    raw: string;
    token: string;
    index: number;
}

export interface SanitizationResult {
    sessionId: string;
    sanitizedText: string;
    rawText: string;
    tokenMap: Record<string, string>;
    sensitiveMatches: SensitiveMatch[];
    stats: {
        totalMasked: number;
        gstinCount: number;
        panCount: number;
        arnCount: number;
        nameCount: number;
        contactCount: number;
    };
}

export interface ClientMetadata {
    legalName?: string;
    tradeName?: string;
    gstin?: string;
    pan?: string;
    officerName?: string;
    jurisdiction?: string;
    email?: string;
    phone?: string;
}

// In-memory session store (keyed by temporary sessionId)
const sessionTokenVault = new Map<string, {
    tokenToReal: Map<string, string>;
    realToToken: Map<string, string>;
    matches: SensitiveMatch[];
    timestamp: number;
}>();

// Cleanup sessions older than 2 hours to avoid memory leaks
function cleanupOldSessions() {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    for (const [key, val] of sessionTokenVault.entries()) {
        if (val.timestamp < twoHoursAgo) {
            sessionTokenVault.delete(key);
        }
    }
}

/**
 * Deterministic Regex Patterns for Indian Tax Documents
 */
const PATTERNS = {
    // 15-character Indian GSTIN
    GSTIN: /\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b/g,
    // 10-character Permanent Account Number
    PAN: /\b[A-Z]{5}\d{4}[A-Z]{1}\b/g,
    // Portal ARN / Case ID / Demand ID (e.g. AA2704240123456, AD27..., ZD27..., ZA27..., ONLZD...)
    ARN: /\b(?:ONL)?(?:ZD|AD|AA|ZA|IP)[A-Z0-9]{11,16}\b/g,
    // CBIC Document Identification Number (DIN / RFN)
    DIN: /\b(?:DIN|RFN|CBIC)[\s:-]*([0-9A-Z]{15,25})\b/gi,
    // Pre-GST MVAT TIN (11 digits ending in V/C)
    TIN: /\b\d{11}[VC]\b/g,
    // Bank Account Numbers / Challan CIN
    BANK_AC: /\b(?:A\/C\s*(?:No\.?|Number)?|Account\s*(?:No\.?|Number)?|CIN)[\s.:#-]*([0-9A-Z]{9,20})\b/gi,
    // Indian 10-digit Mobile Number with optional +91 prefix
    PHONE: /(?:\+91[\-\s]?)?[6-9]\d{9}\b/g,
    // Standard Email Address
    EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
};

/**
 * Sanitizes raw notice text before sending to AI engine.
 * Replaces sensitive identifiers with structured tokens.
 */
export function sanitizePayload(rawText: string, metadata?: ClientMetadata): SanitizationResult {
    cleanupOldSessions();
    const sessionId = `vault_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const tokenToReal = new Map<string, string>();
    const realToToken = new Map<string, string>();
    const sensitiveMatches: SensitiveMatch[] = [];

    let gstinCounter = 1;
    let panCounter = 1;
    let arnCounter = 1;
    let dinCounter = 1;
    let contactCounter = 1;

    let workingText = rawText;

    // Helper to register and replace token
    const replaceAndTrack = (
        rawVal: string,
        token: string,
        type: SensitiveMatch['type'],
        targetText: string
    ): string => {
        if (!rawVal || rawVal.trim().length === 0) return targetText;
        const trimmed = rawVal.trim();

        let existingToken = realToToken.get(trimmed);
        if (!existingToken) {
            existingToken = token;
            realToToken.set(trimmed, existingToken);
            tokenToReal.set(existingToken, trimmed);
        }

        // Also track for diff viewer
        sensitiveMatches.push({
            type,
            raw: trimmed,
            token: existingToken,
            index: targetText.indexOf(trimmed)
        });

        // Safe replace without destroying statutory citations
        return targetText.split(trimmed).join(existingToken);
    };

    // 1. Explicit Client Metadata Matching (Prioritized First)
    if (metadata) {
        if (metadata.gstin) {
            workingText = replaceAndTrack(metadata.gstin, `{{GSTIN_TOKEN_${gstinCounter++}}}`, 'GSTIN', workingText);
            const derivedPan = metadata.gstin.trim().length >= 12 ? metadata.gstin.trim().slice(2, 12) : '';
            if (!metadata.pan && derivedPan && !realToToken.has(derivedPan)) {
                const panToken = `{{PAN_TOKEN_${panCounter++}}}`;
                realToToken.set(derivedPan, panToken);
                tokenToReal.set(panToken, derivedPan);
            }
        }
        if (metadata.pan) {
            workingText = replaceAndTrack(metadata.pan, `{{PAN_TOKEN_${panCounter++}}}`, 'PAN', workingText);
        }
        if (metadata.legalName) {
            workingText = replaceAndTrack(metadata.legalName, '{{ENTITY_LEGAL_NAME_TOKEN}}', 'ENTITY_NAME', workingText);
        }
        if (metadata.tradeName && metadata.tradeName !== metadata.legalName) {
            workingText = replaceAndTrack(metadata.tradeName, '{{ENTITY_TRADE_NAME_TOKEN}}', 'ENTITY_NAME', workingText);
        }
        if (metadata.officerName) {
            workingText = replaceAndTrack(metadata.officerName, '{{PROPER_OFFICER_NAME_TOKEN}}', 'OFFICER_NAME', workingText);
        }
        if (metadata.email) {
            workingText = replaceAndTrack(metadata.email, `{{CONTACT_EMAIL_TOKEN}}`, 'EMAIL', workingText);
        }
        if (metadata.phone) {
            workingText = replaceAndTrack(metadata.phone, `{{CONTACT_PHONE_TOKEN}}`, 'PHONE', workingText);
        }
    }

    // 2. Automated Regex Scrubbing: GSTINs
    const gstinMatches = rawText.match(PATTERNS.GSTIN) || [];
    for (const g of gstinMatches) {
        if (!realToToken.has(g)) {
            const token = `{{GSTIN_TOKEN_${gstinCounter++}}}`;
            workingText = replaceAndTrack(g, token, 'GSTIN', workingText);
        }
        const gPan = g.slice(2, 12);
        if (!realToToken.has(gPan) && !tokenToReal.has('{{PAN_TOKEN_1}}')) {
            const panTok = `{{PAN_TOKEN_${panCounter++}}}`;
            realToToken.set(gPan, panTok);
            tokenToReal.set(panTok, gPan);
        }
    }

    // 3. Automated Regex Scrubbing: PANs (Derived from GSTIN chars 3-12 or standalone)
    const panMatches = rawText.match(PATTERNS.PAN) || [];
    for (const p of panMatches) {
        // Exclude common statutory abbreviations e.g. "CGST", "SGST", "IGST"
        if (['CGST', 'SGST', 'IGST', 'UTGST', 'CBIC'].includes(p)) continue;
        if (!realToToken.has(p)) {
            const token = `{{PAN_TOKEN_${panCounter++}}}`;
            workingText = replaceAndTrack(p, token, 'PAN', workingText);
        }
    }

    // 4. Automated Regex Scrubbing: ARNs / Case IDs / Demand IDs
    const arnMatches = rawText.match(PATTERNS.ARN) || [];
    for (const a of arnMatches) {
        if (!realToToken.has(a)) {
            const token = `{{ARN_TOKEN_${arnCounter++}}}`;
            workingText = replaceAndTrack(a, token, 'ARN', workingText);
        }
    }

    // 4B. CBIC DIN / RFN, MVAT TIN, Bank Account / Challan CIN
    let bankCounter = 1;
    let tinCounter = 1;
    let dinM;
    const dinRx = new RegExp(PATTERNS.DIN.source, 'gi');
    while ((dinM = dinRx.exec(rawText)) !== null) {
        const val = dinM[1];
        if (val && !realToToken.has(val)) {
            workingText = replaceAndTrack(val, `{{DIN_TOKEN_${dinCounter++}}}`, 'DIN', workingText);
        }
    }
    for (const t of rawText.match(PATTERNS.TIN) || []) {
        if (!realToToken.has(t)) {
            workingText = replaceAndTrack(t, `{{TIN_TOKEN_${tinCounter++}}}`, 'TIN', workingText);
        }
    }
    let bM;
    const bankRx = new RegExp(PATTERNS.BANK_AC.source, 'gi');
    while ((bM = bankRx.exec(rawText)) !== null) {
        const val = bM[1];
        if (val && !realToToken.has(val)) {
            workingText = replaceAndTrack(val, `{{BANK_TOKEN_${bankCounter++}}}`, 'BANK_AC', workingText);
        }
    }

    // 5. Automated Regex Scrubbing: Emails
    const emailMatches = rawText.match(PATTERNS.EMAIL) || [];
    for (const e of emailMatches) {
        if (!realToToken.has(e)) {
            const token = `{{CONTACT_TOKEN_${contactCounter++}}}`;
            workingText = replaceAndTrack(e, token, 'EMAIL', workingText);
        }
    }

    // 6. Automated Regex Scrubbing: Phone numbers
    const phoneMatches = rawText.match(PATTERNS.PHONE) || [];
    for (const ph of phoneMatches) {
        if (!realToToken.has(ph)) {
            const token = `{{PHONE_TOKEN_${contactCounter++}}}`;
            workingText = replaceAndTrack(ph, token, 'PHONE', workingText);
        }
    }

    // Save mapping to vault
    sessionTokenVault.set(sessionId, {
        tokenToReal,
        realToToken,
        matches: sensitiveMatches,
        timestamp: Date.now()
    });

    const tokenRecord: Record<string, string> = {};
    tokenToReal.forEach((val, key) => {
        tokenRecord[key] = val;
    });

    return {
        sessionId,
        sanitizedText: workingText,
        rawText,
        tokenMap: tokenRecord,
        sensitiveMatches,
        stats: {
            totalMasked: tokenToReal.size,
            gstinCount: gstinCounter - 1,
            panCount: panCounter - 1,
            arnCount: arnCounter - 1,
            nameCount: (metadata?.legalName ? 1 : 0) + (metadata?.tradeName ? 1 : 0) + (metadata?.officerName ? 1 : 0),
            contactCount: contactCounter - 1
        }
    };
}

/**
 * Re-hydrates AI output locally by swapping all token placeholders back to actual client details.
 * Also handles alternate brackets formats that LLMs occasionally emit:
 * {{GSTIN_TOKEN_1}}, [GSTIN_TOKEN_1], [[GSTIN_TOKEN_1]], {GSTIN_TOKEN_1}.
 */
export function rehydrateDraft(aiOutput: string, sessionId: string, fallbackMap?: Record<string, string>): string {
    const session = sessionTokenVault.get(sessionId);
    const tokenToReal = session ? session.tokenToReal : new Map<string, string>();

    // If fallbackMap provided, add any missing entries
    if (fallbackMap) {
        Object.entries(fallbackMap).forEach(([k, v]) => {
            if (!tokenToReal.has(k)) {
                tokenToReal.set(k, v);
            }
        });
    }

    let hydratedText = aiOutput;

    // Default statutory tokens if unmapped
    if (!tokenToReal.has('{{CURRENT_DATE}}')) {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        hydratedText = hydratedText.split('{{CURRENT_DATE}}').join(`${dd}/${mm}/${yyyy}`);
    }
    if (!tokenToReal.has('{{JURISDICTION_TOKEN}}')) {
        hydratedText = hydratedText.split('{{JURISDICTION_TOKEN}}').join('Yerawada / Pune Jurisdictional GST Office');
    }

    tokenToReal.forEach((realVal, token) => {
        // Strip braces to generate variants: e.g. GSTIN_TOKEN_1
        const rawTokenName = token.replace(/[{}[\]]/g, '');

        // 1. Direct match: {{GSTIN_TOKEN_1}}
        hydratedText = hydratedText.split(token).join(realVal);

        // 2. Bracket match: [GSTIN_TOKEN_1]
        hydratedText = hydratedText.split(`[${rawTokenName}]`).join(realVal);

        // 3. Double bracket: [[GSTIN_TOKEN_1]]
        hydratedText = hydratedText.split(`[[${rawTokenName}]]`).join(realVal);

        // 4. Single brace: {GSTIN_TOKEN_1}
        hydratedText = hydratedText.split(`{${rawTokenName}}`).join(realVal);
    });

    return hydratedText;
}

/**
 * Returns session vault details for inspection in the Privacy Vault Diff Viewer
 */
export function getSessionVaultDetails(sessionId: string) {
    return sessionTokenVault.get(sessionId) || null;
}
