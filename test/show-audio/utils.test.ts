import { describe, expect, test } from '@jest/globals';

import { applyOffsetDraft } from '~/features/show-audio/utils';

describe('applyOffsetDraft', () => {
  test('a rejected offset gives way to the value the server confirmed', async () => {
    expect(
      await applyOffsetDraft(
        '10001',
        () => 40,
        () => Promise.resolve(false)
      )
    ).toBe('40');
  });

  test('an accepted offset stays', async () => {
    expect(
      await applyOffsetDraft(
        '250',
        () => 40,
        () => Promise.resolve(true)
      )
    ).toBe('250');
  });

  test('an unusable or unchanged draft is not sent', async () => {
    const apply = (): Promise<boolean> =>
      Promise.reject(new Error('must not be called'));
    expect(await applyOffsetDraft('', () => 40, apply)).toBe('40');
    expect(await applyOffsetDraft('12.5', () => 40, apply)).toBe('40');
    expect(await applyOffsetDraft('40', () => 40, apply)).toBe('40');
  });
});
