import { describe, it, expect } from 'vitest';
import { extractActionTags, ACTION_NAV_TARGETS } from '../lib/geminiApi';

describe('Desktop Copilot ("Loco Pilot") Actions & Navigation Target Mapping', () => {
  it('should map all major software targets to valid routes and tab identifiers', () => {
    expect(ACTION_NAV_TARGETS['3b']).toBeDefined();
    expect(ACTION_NAV_TARGETS['3b'].route).toBe('returns');
    expect(ACTION_NAV_TARGETS['3b'].tabId).toBe('gstr3b');

    expect(ACTION_NAV_TARGETS['ims']).toBeDefined();
    expect(ACTION_NAV_TARGETS['ims'].route).toBe('returns');
    expect(ACTION_NAV_TARGETS['ims'].tabId).toBe('ims');

    expect(ACTION_NAV_TARGETS['reco']).toBeDefined();
    expect(ACTION_NAV_TARGETS['reco'].route).toBe('reco');

    expect(ACTION_NAV_TARGETS['notices']).toBeDefined();
    expect(ACTION_NAV_TARGETS['notices'].route).toBe('notices');
  });

  it('should extract client-specific action tokens with GSTIN correctly', () => {
    const rawText = 'I am opening GSTR-3B for Siddha Perfect Systems.\n\n[ACTION:navigate:3b:27AAQCS1984G1ZT]';
    const { cleanText, actions } = extractActionTags(rawText);

    expect(cleanText).not.toContain('[ACTION:navigate:');
    expect(actions).toHaveLength(1);
    expect(actions[0].target).toBe('3b');
    expect(actions[0].gstin).toBe('27AAQCS1984G1ZT');
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
