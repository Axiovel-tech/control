import { describe, expect, test } from '@jest/globals';

import { type ShowAudioStatus } from '~/features/show-audio/types';
import { applyOffsetDraft, canStopMusic } from '~/features/show-audio/utils';

const status = (changes: Partial<ShowAudioStatus>): ShowAudioStatus => ({
  track: null,
  state: 'idle',
  startTime: null,
  offsetMs: 0,
  device: null,
  error: null,
  ...changes,
});

const track = {
  sha256: 'ab12',
  name: 'click.ogg',
  mediaType: 'audio/ogg',
  duration: 70,
};

describe('canStopMusic', () => {
  test('music scheduled for a start can be stopped before it is armed', () => {
    // Committed at T-10 s, armed only at about T-5 s: still `idle` in between
    expect(canStopMusic(status({ track, startTime: 1_791_000_000 }))).toBe(
      true
    );
    expect(canStopMusic(status({ state: 'armed', track }))).toBe(true);
    expect(canStopMusic(status({ state: 'playing', track }))).toBe(true);
  });

  test('there is nothing to stop without a track or a start', () => {
    expect(canStopMusic(undefined)).toBe(false);
    expect(canStopMusic(status({ track }))).toBe(false);
    expect(canStopMusic(status({ startTime: 1_791_000_000 }))).toBe(false);
  });
});

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
