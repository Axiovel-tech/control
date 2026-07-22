import { describe, expect, test } from '@jest/globals';

import { Status } from '~/components/semantics';
import {
  getRtlsDevicePairedToUav,
  getRtlsPairedUavStatuses,
} from '~/features/rtls/selectors';
import { type RootState } from '~/store/reducers';

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
