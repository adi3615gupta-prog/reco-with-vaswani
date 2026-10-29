import { describe, it, expect } from 'vitest';
import { extractActionTags, ACTION_NAV_TARGETS } from '../lib/geminiApi';

describe('Sourav AI Frontend — Action Parser & Navigation Mapping', () => {
  it('should extract single navigation action token and clean text', () => {
    const raw = 'Aap 2B vs Books match karne ke liye [ACTION:navigate:reco] par click karein.';
    const { cleanText, actions } = extractActionTags(raw);

    expect(cleanText).toBe('Aap 2B vs Books match karne ke liye  par click karein.');
    expect(actions).toHaveLength(1);
    expect(actions[0].target).toBe('reco');
    expect(actions[0].label).toBe('Open 2B vs Books Reco');
  });

  it('should extract multiple distinct action tokens and deduplicate', () => {
    const raw = `
      Maine reconciliation check kiya.
      1. IMS decision dekhne ke liye: [ACTION:navigate:ims]
      2. 3B computation sheet ke liye: [ACTION:navigate:3b]
      3. Dubara IMS dekhna ho toh: [ACTION:navigate:ims]
    `;
    const { actions } = extractActionTags(raw);

    expect(actions).toHaveLength(2);
    expect(actions.map(a => a.target)).toEqual(['ims', '3b']);
    expect(actions[0].label).toBe('Open IMS Decision Hub');
    expect(actions[1].label).toBe('Open GSTR-3B Working Sheet');
  });

  it('should ignore unregistered or malformed action tokens safely', () => {
    const raw = 'Invalid action [ACTION:navigate:non_existent_module] and [ACTION:other:foo].';
    const { actions, cleanText } = extractActionTags(raw);

    expect(actions).toHaveLength(0);
    // Malformed non-navigate tag is preserved or skipped safely
    expect(cleanText).toContain('[ACTION:other:foo]');
  });

  it('should have all 11 core module navigation targets defined and mapped to valid routes', () => {
    const expectedTargets = [
      'reco', 'ims', '3b', 'gstr1', 'notices', 'tds',
      'tally', 'incometax', 'cma', 'finstatements', 'settings'
    ];

    for (const target of expectedTargets) {
      expect(ACTION_NAV_TARGETS[target]).toBeDefined();
      expect(ACTION_NAV_TARGETS[target].label).toBeTruthy();
    }

    // Verify cma maps to valid AppRoute 'bank-cma'
    expect(ACTION_NAV_TARGETS['cma'].route).toBe('bank-cma');
    expect(ACTION_NAV_TARGETS['bankcma'].route).toBe('bank-cma');
  });

  it('should parse client-specific action tokens with GSTIN parameter', () => {
    const raw = 'Opening 3B working for Siddha: [ACTION:navigate:3b:27AAQCS1984G1ZT]';
    const { cleanText, actions } = extractActionTags(raw);

    expect(cleanText).toBe('Opening 3B working for Siddha:');
    expect(actions).toHaveLength(1);
    expect(actions[0].target).toBe('3b');
    expect(actions[0].gstin).toBe('27AAQCS1984G1ZT');
    expect(actions[0].label).toContain('27AAQCS1984G1ZT');
  });
});
