import { describe, expect, test } from '@jest/globals';

import { Status } from '~/components/semantics';
import {
  getRtlsDevicePairedToUav,
  getRtlsAnchorHealth,
  getRtlsPairedUavStatuses,
  getRtlsTagHealth,
} from '~/features/rtls/selectors';
import {
  setRtlsDevicesFromStatus,
  updateRtlsStats,
} from '~/features/rtls/slice';
import { RtlsHealth } from '~/features/rtls/stats-utils';
import { type RootState } from '~/store/reducers';

import { createRtlsTestStore, rootStateOf } from './rtls-test-store';

/**
 * Builds the minimal slice of the app state the pairing selectors read: the
 * RTLS device registry and the UAV registry.
 */
const makeState = (
  devices: Record<string, { uav?: string }>,
  uavIds: string[] = []
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
    uavs: {
      byId: Object.fromEntries(
        uavIds.map((id) => [id, { id, errors: [], position: undefined }])
      ),
    },
  }) as unknown as RootState;

describe('getRtlsPairedUavStatuses', () => {
  test('returns a status for each paired UAV, keyed by UAV id', () => {
    const state = makeState({ '42': { uav: '05' }, '43': {} }, ['05']);
    const statuses = getRtlsPairedUavStatuses(state);
    expect(Object.keys(statuses)).toEqual(['05']);
    expect(statuses['05']).toBe(Status.SUCCESS);
  });

  test('pairs to a UAV missing from the registry without a status', () => {
    const state = makeState({ '42': { uav: '07' } });
    expect(getRtlsPairedUavStatuses(state)).toEqual({ '07': undefined });
  });

  test('is empty without any pairing', () => {
    expect(getRtlsPairedUavStatuses(makeState({ '42': {} }))).toEqual({});
  });
});

describe('getRtlsDevicePairedToUav', () => {
  test('finds the device paired with a UAV', () => {
    const state = makeState({ '42': { uav: '05' }, '43': {} }, ['05']);
    expect(getRtlsDevicePairedToUav(state, '05')?.id).toBe('42');
  });

  test('returns undefined for a UAV without a paired device', () => {
    const state = makeState({ '42': { uav: '05' } }, ['05']);
    expect(getRtlsDevicePairedToUav(state, '06')).toBeUndefined();
  });
});

describe('role-scoped RTLS health', () => {
  test('tag fix loss does not mark the anchor calibration area unhealthy', () => {
    const state = {
      rtls: {
        devices: {
          byId: {
            '10': {
              id: '10',
              role: 'anchor-initiator',
              online: true,
              age: 0.2,
            },
            '11': {
              id: '11',
              role: 'anchor-responder',
              online: true,
              age: 0.2,
            },
            '20': { id: '20', role: 'tag', online: true },
          },
          order: ['10', '11', '20'],
        },
        anchors: [],
        stats: {
          byId: {
            '20': { id: '20', solveRateHz: 0, fixAgeMs: 20_000 },
          },
        },
      },
    } as unknown as RootState;

    expect(getRtlsAnchorHealth(state)).toBe(RtlsHealth.OK);
    expect(getRtlsTagHealth(state)).toBe(RtlsHealth.ERROR);
  });

  test('anchor loss does not degrade the tag solve health', () => {
    const state = {
      rtls: {
        devices: {
          byId: {
            '10': {
              id: '10',
              role: 'anchor-initiator',
              online: false,
            },
            '11': {
              id: '11',
              role: 'anchor-responder',
              online: true,
              // heard from too long ago -> stale, an ERROR for the anchors
              age: 12,
            },
            '20': { id: '20', role: 'tag', online: true },
          },
          order: ['10', '11', '20'],
        },
        anchors: [],
        stats: {
          byId: {
            '20': { id: '20', solveRateHz: 8, solvePct: 97, fixAgeMs: 120 },
          },
        },
      },
    } as unknown as RootState;

    expect(getRtlsAnchorHealth(state)).toBe(RtlsHealth.ERROR);
    expect(getRtlsTagHealth(state)).toBe(RtlsHealth.OK);
  });
});

describe('one initiator verdict for every light', () => {
  const stateWith = (responderRate: number | undefined): RootState => {
    const store = createRtlsTestStore();
    store.dispatch(
      setRtlsDevicesFromStatus({
        '10': { online: true, role: 'anchor-initiator' },
        ...(responderRate === undefined
          ? {}
          : { '11': { online: true, role: 'anchor-responder' } }),
      })
    );
    store.dispatch(
      updateRtlsStats({
        byId: {
          '10': {
            id: '10',
            powerState: 'operating',
            uwbStatus: 1,
            rangingRateHz: 50,
          },
          ...(responderRate === undefined
            ? {}
            : {
                '11': {
                  id: '11',
                  powerState: 'operating',
                  uwbStatus: 1,
                  rangingRateHz: responderRate,
                },
              }),
        },
      })
    );
    return rootStateOf(store);
  };

  test('a lone A0 is not "Anchors ready", whatever its own round rate', () => {
    expect(getRtlsAnchorHealth(stateWith(undefined))).toBe(RtlsHealth.WARNING);
  });

  test('A0 is ready once a responder hears it', () => {
    expect(getRtlsAnchorHealth(stateWith(9.8))).toBe(RtlsHealth.OK);
  });
});
