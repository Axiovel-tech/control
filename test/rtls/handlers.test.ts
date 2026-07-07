import { describe, expect, jest, test } from '@jest/globals';

import {
  buildRtlsDeviceStatusMap,
  buildRtlsStatsMap,
  handleRtlsInformationMessage,
  handleRtlsOtaMessage,
  handleRtlsStatsMessage,
  mapRtlsDeviceStats,
  mapRtlsDeviceStatus,
  mapRtlsOtaJob,
} from '~/features/rtls/handlers';
import {
  setRtlsDevicesFromStatus,
  setRtlsOtaJob,
  updateRtlsStats,
} from '~/features/rtls/slice';
import { type AppDispatch } from '~/store/reducers';

type DispatchedAction = { type: string; payload: any };

/**
 * Creates a jest mock typed as a dispatcher of plain `{ type, payload }`
 * actions. This keeps both `tsc` and ESLint happy: the handlers accept it as an
 * {@link AppDispatch} (via the explicit signature below), and reading back the
 * recorded actions from `.mock.calls` yields a typed `DispatchedAction`.
 */
const createMockDispatch = () =>
  jest.fn<
    (action: DispatchedAction) => DispatchedAction
  >() as unknown as jest.Mock<(action: DispatchedAction) => DispatchedAction> &
    AppDispatch;

describe('rtls handlers', () => {
  describe('mapRtlsDeviceStatus', () => {
    test('maps the known fields and omits absent ones', () => {
      const mapped = mapRtlsDeviceStatus('7', {
        id: 7,
        address: '10.0.0.7',
        age: 1.2,
        firmwareVersion: '1.0.0',
        paramCount: 42,
        otaStatus: 'idle',
      });
      expect(mapped).toEqual({
        online: true,
        address: '10.0.0.7',
        age: 1.2,
        firmwareVersion: '1.0.0',
        paramCount: 42,
        otaStatus: 'idle',
      });
    });

    test('respects an explicit online flag', () => {
      expect(mapRtlsDeviceStatus('1', { online: false, age: 0 })).toMatchObject(
        {
          online: false,
        }
      );
    });

    test('infers offline from a large age when no online flag is present', () => {
      expect(mapRtlsDeviceStatus('1', { age: 120 })).toMatchObject({
        online: false,
      });
      expect(mapRtlsDeviceStatus('1', { age: 1 })).toMatchObject({
        online: true,
      });
    });

    test('ignores non-finite or wrongly-typed values', () => {
      const mapped = mapRtlsDeviceStatus('1', {
        age: Number.NaN,
        paramCount: 'not-a-number',
        firmwareVersion: 5,
      });
      expect(mapped.age).toBeUndefined();
      expect(mapped.paramCount).toBeUndefined();
      expect(mapped.firmwareVersion).toBeUndefined();
    });

    test('maps the inter-anchor TWR list from the device status', () => {
      const mapped = mapRtlsDeviceStatus('5', {
        role: 'anchor-responder',
        twr: [
          { peerMac: 0x0001, distanceM: 14.1, ageMs: 120 },
          { peerMac: 0x0002, distanceM: 9.5, ageMs: 0 },
        ],
      });
      expect(mapped.twr).toEqual([
        { peerMac: 0x0001, distanceM: 14.1, ageMs: 120 },
        { peerMac: 0x0002, distanceM: 9.5, ageMs: 0 },
      ]);
    });

    test('maps the sleeping flag only when boolean', () => {
      expect(
        mapRtlsDeviceStatus('7', { age: 1, sleeping: true })
      ).toMatchObject({ sleeping: true });
      expect(
        mapRtlsDeviceStatus('7', { age: 1, sleeping: false })
      ).toMatchObject({ sleeping: false });
      expect(
        mapRtlsDeviceStatus('7', { age: 1, sleeping: 'yes' }).sleeping
      ).toBeUndefined();
      expect(mapRtlsDeviceStatus('7', { age: 1 }).sleeping).toBeUndefined();
    });

    test('omits TWR when absent or not a non-empty array', () => {
      expect(mapRtlsDeviceStatus('5', {}).twr).toBeUndefined();
      expect(mapRtlsDeviceStatus('5', { twr: [] }).twr).toBeUndefined();
      expect(mapRtlsDeviceStatus('5', { twr: 'nope' }).twr).toBeUndefined();
    });
  });

  test('buildRtlsDeviceStatusMap maps every device', () => {
    const result = buildRtlsDeviceStatusMap({
      '1': { online: true },
      '2': { online: false, age: 50 },
    });
    expect(Object.keys(result)).toEqual(['1', '2']);
    expect(result['1']).toMatchObject({ online: true });
    expect(result['2']).toMatchObject({ online: false });
  });

  test('handleRtlsInformationMessage dispatches setRtlsDevicesFromStatus', () => {
    const dispatch = createMockDispatch();
    handleRtlsInformationMessage(
      { type: 'X-RTLS-INF', status: { '1': { online: true } } },
      dispatch
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      setRtlsDevicesFromStatus({ '1': { online: true } })
    );
  });

  test('handleRtlsInformationMessage tolerates a missing status field', () => {
    const dispatch = createMockDispatch();
    handleRtlsInformationMessage({ type: 'X-RTLS-INF' }, dispatch);
    expect(dispatch).toHaveBeenCalledWith(setRtlsDevicesFromStatus({}));
  });

  describe('stats', () => {
    test('mapRtlsDeviceStats maps numeric fields', () => {
      expect(
        mapRtlsDeviceStats('3', {
          solveRateHz: 12.5,
          solvePct: 99,
          anchorsSeen: 4,
          fixAgeMs: 30,
          clockPpm: -1.2,
          anchorMask: 0b1011,
        })
      ).toEqual({
        id: '3',
        solveRateHz: 12.5,
        solvePct: 99,
        anchorsSeen: 4,
        fixAgeMs: 30,
        clockPpm: -1.2,
        anchorMask: 0b1011,
      });
    });

    test('mapRtlsDeviceStats ignores inter-anchor TWR (it rides on X-RTLS-INF)', () => {
      // TWR is now surfaced on the device status (INF), not on the stats path;
      // the stats mapper must not invent twr* fields from a stats body.
      const mapped = mapRtlsDeviceStats('5', { solveRateHz: 1 });
      expect(mapped).not.toHaveProperty('twrPeerMac');
      expect(mapped).not.toHaveProperty('twrDistanceM');
      expect(mapped).not.toHaveProperty('twrAgeMs');
    });

    test('buildRtlsStatsMap maps every device', () => {
      const byId = buildRtlsStatsMap({ '3': { solveRateHz: 1 } });
      expect(byId['3']).toMatchObject({ id: '3', solveRateHz: 1 });
    });

    test('handleRtlsStatsMessage dispatches updateRtlsStats', () => {
      const dispatch = createMockDispatch();
      handleRtlsStatsMessage(
        { type: 'X-RTLS-STATS', stats: { '3': { solveRateHz: 1 } } },
        dispatch
      );
      expect(dispatch).toHaveBeenCalledTimes(1);
      const action = dispatch.mock.calls[0][0];
      expect(action.type).toBe(updateRtlsStats.type);
      expect(action.payload.byId['3']).toMatchObject({ id: '3' });
      expect(typeof action.payload.lastUpdatedAt).toBe('number');
    });
  });

  describe('ota', () => {
    test('mapRtlsOtaJob maps the job fields', () => {
      expect(
        mapRtlsOtaJob({
          id: 'job-1',
          image: 'fw.bin',
          status: 'inProgress',
          progress: 0.5,
          version: '2.0.0',
          error: undefined,
        })
      ).toEqual({
        id: 'job-1',
        image: 'fw.bin',
        status: 'inProgress',
        progress: 0.5,
        version: '2.0.0',
        error: undefined,
      });
    });

    test('mapRtlsOtaJob returns an empty object for missing job', () => {
      expect(mapRtlsOtaJob(undefined)).toEqual({});
    });

    test('handleRtlsOtaMessage dispatches setRtlsOtaJob for a known id', () => {
      const dispatch = createMockDispatch();
      handleRtlsOtaMessage(
        { type: 'X-RTLS-OTA', id: '7', job: { status: 'pending' } },
        dispatch
      );
      expect(dispatch).toHaveBeenCalledWith(
        setRtlsOtaJob({ id: '7', job: mapRtlsOtaJob({ status: 'pending' }) })
      );
    });

    test('handleRtlsOtaMessage ignores a message without an id', () => {
      const dispatch = createMockDispatch();
      handleRtlsOtaMessage({ type: 'X-RTLS-OTA' }, dispatch);
      expect(dispatch).not.toHaveBeenCalled();
    });
  });
});
