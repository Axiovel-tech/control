import { describe, expect, test } from '@jest/globals';

import { normalizeShowOrientation } from '~/features/show/orientation';

describe('normalizeShowOrientation', () => {
  test('maps negative angles into [0, 360)', () => {
    // The exact live-show failure of 2026-07-21: the fitting produced -1.4°,
    // which the firmware silently treats as "show not configured".
    expect(normalizeShowOrientation('-1.4')).toBe('358.6');
    expect(normalizeShowOrientation(-1.4)).toBe(358.6);
    expect(normalizeShowOrientation(-361)).toBe(359);
    expect(normalizeShowOrientation('-0.5')).toBe('359.5');
    // No floating-point noise on the wrapped result.
    expect(normalizeShowOrientation(-347.7)).toBe(12.3);
  });

  test('wraps angles at or above 360', () => {
    expect(normalizeShowOrientation(360)).toBe(0);
    expect(normalizeShowOrientation(370.5)).toBe(10.5);
    expect(normalizeShowOrientation('720')).toBe('0');
  });

  test('is idempotent for values already in [0, 360)', () => {
    expect(normalizeShowOrientation(0)).toBe(0);
    expect(normalizeShowOrientation(358.6)).toBe(358.6);
    expect(normalizeShowOrientation('358.6')).toBe('358.6');
    // The exact string representation is preserved, including trailing
    // zeros -- orientations are stored as strings to avoid rounding noise.
    expect(normalizeShowOrientation('12.30')).toBe('12.30');
    expect(normalizeShowOrientation('0')).toBe('0');
  });

  test('passes non-finite input through unchanged', () => {
    expect(normalizeShowOrientation('')).toBe('');
    expect(normalizeShowOrientation('foo')).toBe('foo');
    expect(normalizeShowOrientation(Number.NaN)).toBeNaN();
  });
});
