import { describe, expect, test } from '@jest/globals';

import {
  getRtlsAnchorDevices,
  getRtlsTagDevices,
} from '~/features/rtls/selectors';
import { type RtlsDevice } from '~/features/rtls/types';
import { type RootState } from '~/store/reducers';
import { getRowStatus } from '~/views/rtls/DeviceStatsRow';

/** Builds the minimal state slice the role selectors read. */
const makeState = (
  devices: Record<string, { role?: string; online?: boolean }>
): RootState =>
  ({
    rtls: {
      devices: {
        byId: Object.fromEntries(
          Object.entries(devices).map(([id, extra]) => [
            id,
            { id, online: true, ...extra },
          ])
        ),
        order: Object.keys(devices),
      },
    },
  }) as unknown as RootState;

describe('role-filtered device selectors', () => {
  const state = makeState({
    '41': { role: 'tag' },
    '42': {}, // role not yet known: must show up with the tags, not vanish
    '43': { role: 'anchor-initiator' },
    '44': { role: 'anchor-responder', online: false },
    '45': { role: 'disabled' },
  });

  test('getRtlsTagDevices returns every non-anchor device', () => {
    expect(getRtlsTagDevices(state).map((d) => d.id)).toEqual([
      '41',
      '42',
      '45',
    ]);
  });

  test('getRtlsAnchorDevices returns anchors regardless of liveness', () => {
    expect(getRtlsAnchorDevices(state).map((d) => d.id)).toEqual(['43', '44']);
  });
});

describe('getRowStatus', () => {
  test('offline devices are red regardless of anything else', () => {
    expect(
      getRowStatus({ id: '1', online: false } as RtlsDevice, undefined)
    ).toBe('error');
  });

  test('a tag with unknown sleep state never renders green', () => {
    // the invariant from the 2026-07-21 live show: an unknown sleep latch
    // must render grey, or a sleeping drone can look awake
    expect(
      getRowStatus({ id: '1', online: true, role: 'tag' } as RtlsDevice, undefined)
    ).toBe('off');
  });
});
