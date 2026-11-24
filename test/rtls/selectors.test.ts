import { describe, expect, test } from '@jest/globals';

import { Status } from '~/components/semantics';
import { cellApplyRefusalKey } from '~/features/rtls/cell-settings';
import {
  getPossiblyArmedUavIds,
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
import UAVErrorCode from '~/flockwave/UAVErrorCode';
import { UAVAge } from '~/model/uav';
import { type RootState } from '~/store/reducers';

import {
  createRtlsTestStore,
  type FakeUav,
  rootStateOf,
} from './rtls-test-store';

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

describe('getPossiblyArmedUavIds', () => {
  const armedIds = (...uavs: FakeUav[]) =>
    getPossiblyArmedUavIds(rootStateOf(createRtlsTestStore(uavs)));
  const applyRefusal = (...uavs: FakeUav[]) =>
    cellApplyRefusalKey({
      lockedCount: 0,
      armedCount: armedIds(...uavs).length,
      anyOnline: true,
    });

  // D17, 2026-11-24: a disarmed heartbeat in Stabilize with MOTOR_OUTPUTS
  // enabled (no safety switch): the server reports ON_GROUND, no DISARMED
  const d17: FakeUav = {
    id: '17',
    age: UAVAge.ACTIVE,
    armed: false,
    errors: [UAVErrorCode.ON_GROUND, UAVErrorCode.PREARM_CHECK_IN_PROGRESS],
  };

  test('armed decides when the safety switch disagrees', () => {
    // disarmed, safety switch off: no DISARMED, Apply allowed
    expect(armedIds(d17)).toEqual([]);
    expect(applyRefusal(d17)).toBe(undefined);

    // armed with the safety switch engaged: DISARMED, still armed
    const armedOnSafety = {
      ...d17,
      armed: true,
      errors: [UAVErrorCode.DISARMED, UAVErrorCode.ON_GROUND],
    };
    expect(armedIds(armedOnSafety)).toEqual(['17']);
    expect(applyRefusal(armedOnSafety)).toBe('rtlsCellSettings.disarmFirst');
  });

  test('disarmed -> armed -> disarmed', () => {
    const states = [false, true, false].map((armed) =>
      applyRefusal({ ...d17, armed })
    );
    expect(states).toEqual([
      undefined,
      'rtlsCellSettings.disarmFirst',
      undefined,
    ]);
  });

  test('no operator error code proves a drone disarmed', () => {
    const unknown = { id: '17', age: UAVAge.ACTIVE };
    expect(
      armedIds(
        { ...unknown, id: 'safety', errors: [UAVErrorCode.DISARMED] },
        { ...unknown, id: 'ground', errors: [UAVErrorCode.ON_GROUND] },
        { ...unknown, id: 'none', errors: [] }
      )
    ).toEqual(['safety', 'ground', 'none']);
  });

  test('armed: false counts only in a current status', () => {
    expect(
      armedIds(
        { ...d17, id: 'stale', age: UAVAge.INACTIVE },
        { ...d17, id: 'no-age', age: undefined }
      )
    ).toEqual(['stale', 'no-age']);
  });

  test('a server without armed blocks Apply (an older server)', () => {
    const { armed: _, ...olderServer } = d17;
    expect(armedIds(olderServer)).toEqual(['17']);
    expect(applyRefusal(olderServer)).toBe('rtlsCellSettings.disarmFirst');
  });

  test('asleep or gone does not count', () => {
    expect(
      armedIds(
        { id: 'asleep', age: UAVAge.INACTIVE, errors: [UAVErrorCode.SLEEPING] },
        { id: 'gone', age: UAVAge.GONE, armed: true, errors: [] },
        { id: 'forgotten', age: UAVAge.FORGOTTEN, errors: [] }
      )
    ).toEqual([]);
  });
});
