import { describe, expect, test } from '@jest/globals';

import { parseShowAudioStatus } from '~/features/show-audio/messages';

describe('parseShowAudioStatus', () => {
  test('accepts an X-SHOW-AUDIO-INF body as specified by the server', () => {
    expect(
      parseShowAudioStatus({
        type: 'X-SHOW-AUDIO-INF',
        track: {
          sha256: 'ab12',
          name: 'click.ogg',
          mediaType: 'audio/ogg',
          duration: 70.5,
        },
        state: 'armed',
        startTime: 1_791_000_000.25,
        offsetMs: -15,
        device: 'default',
        error: null,
      })
    ).toEqual({
      track: {
        sha256: 'ab12',
        name: 'click.ogg',
        mediaType: 'audio/ogg',
        duration: 70.5,
      },
      state: 'armed',
      startTime: 1_791_000_000.25,
      offsetMs: -15,
      device: 'default',
      error: null,
    });
  });

  test('treats an unknown player state as an error and a missing track as none', () => {
    expect(
      parseShowAudioStatus({ track: null, state: 'exploded' })
    ).toMatchObject({ track: null, state: 'error', offsetMs: 0 });
  });
});
