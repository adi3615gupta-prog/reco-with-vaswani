import { describe, it, expect } from 'vitest';
import { extractActionTags, ACTION_NAV_TARGETS, normalizeActionFy, normalizeActionMonth } from '../lib/geminiApi';

describe('Desktop Copilot ("Loco Pilot") Actions & Navigation Target Mapping', () => {
  it('should map all major software targets to valid routes and tab identifiers', () => {
    expect(ACTION_NAV_TARGETS['3b']).toBeDefined();
    expect(ACTION_NAV_TARGETS['3b'].route).toBe('returns');
    expect(ACTION_NAV_TARGETS['3b'].tabId).toBe('gstr3b');

    expect(ACTION_NAV_TARGETS['reversal']).toBeDefined();
    expect(ACTION_NAV_TARGETS['reversal'].route).toBe('returns');
    expect(ACTION_NAV_TARGETS['reversal'].tabId).toBe('gstr3b');

    expect(ACTION_NAV_TARGETS['reversals']).toBeDefined();
    expect(ACTION_NAV_TARGETS['reversals'].route).toBe('returns');
    expect(ACTION_NAV_TARGETS['reversals'].tabId).toBe('gstr3b');

    expect(ACTION_NAV_TARGETS['ims']).toBeDefined();
    expect(ACTION_NAV_TARGETS['ims'].route).toBe('returns');
    expect(ACTION_NAV_TARGETS['ims'].tabId).toBe('ims');

    expect(ACTION_NAV_TARGETS['reco']).toBeDefined();
    expect(ACTION_NAV_TARGETS['reco'].route).toBe('reco');

    expect(ACTION_NAV_TARGETS['notices']).toBeDefined();
    expect(ACTION_NAV_TARGETS['notices'].route).toBe('notices');
  });

  it('should normalize financial year and month names correctly', () => {
    expect(normalizeActionFy('26-27')).toBe('2026-27');
    expect(normalizeActionFy('2026-27')).toBe('2026-27');
    expect(normalizeActionFy('24-25')).toBe('2024-25');

    expect(normalizeActionMonth('sept')).toBe('September');
    expect(normalizeActionMonth('sep')).toBe('September');
    expect(normalizeActionMonth('09')).toBe('September');
    expect(normalizeActionMonth('oct')).toBe('October');
    expect(normalizeActionMonth('April')).toBe('April');
  });

  it('should extract client-specific action tokens with GSTIN correctly', () => {
    const rawText = 'I am opening GSTR-3B for Siddha Perfect Systems.\n\n[ACTION:navigate:3b:27AAQCS1984G1ZT]';
    const { cleanText, actions } = extractActionTags(rawText);

    expect(cleanText).not.toContain('[ACTION:navigate:');
    expect(actions).toHaveLength(1);
    expect(actions[0].target).toBe('3b');
    expect(actions[0].gstin).toBe('27AAQCS1984G1ZT');
  });

  it('should extract deep-linked action tokens with GSTIN, FY, and Month for reversals', () => {
    const rawText = 'Opening Table 4(B) Reversals for DYP for September FY 2026-27:\n\n[ACTION:navigate:reversal:27AAGCD4105L1ZO:26-27:sept]';
    const { cleanText, actions } = extractActionTags(rawText);

    expect(cleanText).not.toContain('[ACTION:navigate:');
    expect(actions).toHaveLength(1);
    expect(actions[0].target).toBe('reversal');
    expect(actions[0].gstin).toBe('27AAGCD4105L1ZO');
    expect(actions[0].fy).toBe('2026-27');
    expect(actions[0].month).toBe('September');
    expect(actions[0].label).toContain('27AAGCD4105L1ZO');
    expect(actions[0].label).toContain('September');
    expect(actions[0].label).toContain('2026-27');
  });

  it('should extract multiple action buttons for multi-match queries', () => {
    const rawText = 'Multiple clients matched:\n[ACTION:navigate:reco:27AAQCS1984G1ZT]\n[ACTION:navigate:ims:27AZNPB4348J1Z4]';
    const { actions } = extractActionTags(rawText);

    expect(actions).toHaveLength(2);
    expect(actions[0].target).toBe('reco');
    expect(actions[0].gstin).toBe('27AAQCS1984G1ZT');
    expect(actions[1].target).toBe('ims');
    expect(actions[1].gstin).toBe('27AZNPB4348J1Z4');
  });
});
