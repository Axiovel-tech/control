import { describe, expect, jest, test } from '@jest/globals';

import {
  buildRtlsDeviceStatusMap,
  buildRtlsPositionsMap,
  buildRtlsStatsMap,
  handleRtlsInformationMessage,
  handleRtlsOtaMessage,
  handleRtlsPositionMessage,
  handleRtlsStatsMessage,
  mapRtlsAnchors,
  mapRtlsDeviceStats,
  mapRtlsDeviceStatus,
  mapRtlsOtaJob,
  mapRtlsPosEstimate,
} from '~/features/rtls/handlers';
import {
  setRtlsAnchors,
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
      // the key is present-but-undefined so a merge clears a stale flag
      const mapped = mapRtlsDeviceStatus('7', { age: 1 });
      expect(mapped.sleeping).toBeUndefined();
      expect('sleeping' in mapped).toBe(true);
    });

    test('maps the paired UAV id only when a string, always assigning the key', () => {
      expect(mapRtlsDeviceStatus('7', { age: 1, uav: '05' })).toMatchObject({
        uav: '05',
      });
      expect(mapRtlsDeviceStatus('7', { age: 1, uav: 5 }).uav).toBeUndefined();
      // the key is present-but-undefined so a merge clears a stale pairing
      const mapped = mapRtlsDeviceStatus('7', { age: 1 });
      expect(mapped.uav).toBeUndefined();
      expect('uav' in mapped).toBe(true);
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
      { type: 'X-RTLS-INF', status: { '1': { online: true } }, anchors: [] },
      dispatch
    );
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith(
      setRtlsDevicesFromStatus({ '1': { online: true } })
    );
    expect(dispatch).toHaveBeenCalledWith(setRtlsAnchors([]));
  });

  test('handleRtlsInformationMessage tolerates a missing status field', () => {
    const dispatch = createMockDispatch();
    handleRtlsInformationMessage({ type: 'X-RTLS-INF' }, dispatch);
    expect(dispatch).toHaveBeenCalledWith(setRtlsDevicesFromStatus({}));
  });

  test('an INF without an anchors field does not wipe the stored anchors', () => {
    // a server that predates the anchors field must not clear the
    // configured cell geometry off the debug position view
    const dispatch = createMockDispatch();
    handleRtlsInformationMessage({ type: 'X-RTLS-INF', status: {} }, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(setRtlsDevicesFromStatus({}));
  });

  test('handleRtlsInformationMessage dispatches the site anchor list', () => {
    const dispatch = createMockDispatch();
    handleRtlsInformationMessage(
      {
        type: 'X-RTLS-INF',
        status: {},
        anchors: [
          {
            id: 'rtls::default::anchor_0',
            cell: 'default',
            index: 0,
            mac: 1,
            position: { lat: 41.39, lon: 2.15, amsl: 10 },
            ned: { north: -10, east: -10, down: 0 },
            active: true,
          },
        ],
      },
      dispatch
    );
    expect(dispatch).toHaveBeenCalledWith(
      setRtlsAnchors([
        {
          id: 'rtls::default::anchor_0',
          cell: 'default',
          index: 0,
          mac: 1,
          ned: { north: -10, east: -10, down: 0 },
          active: true,
        },
      ])
    );
  });

  describe('anchors', () => {
    test('mapRtlsAnchors drops entries without a stable id', () => {
      expect(
        mapRtlsAnchors([
          { index: 0 },
          null,
          { id: 'rtls::c::anchor_1', index: 1 },
        ])
      ).toEqual([
        {
          id: 'rtls::c::anchor_1',
          cell: undefined,
          index: 1,
          mac: undefined,
          ned: { north: undefined, east: undefined, down: undefined },
          active: undefined,
        },
      ]);
    });

    test('mapRtlsAnchors yields an empty list for non-array input', () => {
      expect(mapRtlsAnchors(undefined)).toEqual([]);
      expect(mapRtlsAnchors({})).toEqual([]);
    });
  });

  describe('stats', () => {
    test('mapRtlsDeviceStats maps numeric fields', () => {
      expect(
        mapRtlsDeviceStats('3', {
          batteryVoltage: 11.7,
          solveRateHz: 12.5,
          solvePct: 99,
          anchorsSeen: 4,
          fixAgeMs: 30,
          clockPpm: -1.2,
          anchorMask: 0b1011,
        })
      ).toEqual({
        id: '3',
        batteryVoltage: 11.7,
        solveRateHz: 12.5,
        solvePct: 99,
        anchorsSeen: 4,
        fixAgeMs: 30,
        clockPpm: -1.2,
        anchorMask: 0b1011,
      });
    });

    test('mapRtlsDeviceStats leaves batteryVoltage undefined for old firmware', () => {
      // Boards without the VBAT divider (or pre-vbat firmware) never send the
      // field; the mapper must not invent a value the panel would render.
      expect(
        mapRtlsDeviceStats('3', { solveRateHz: 1 }).batteryVoltage
      ).toBeUndefined();
      expect(
        mapRtlsDeviceStats('3', { batteryVoltage: null, solveRateHz: 1 })
          .batteryVoltage
      ).toBeUndefined();
      expect(
        mapRtlsDeviceStats('3', { batteryVoltage: Number.NaN, solveRateHz: 1 })
          .batteryVoltage
      ).toBeUndefined();
      expect(
        mapRtlsDeviceStats('3', { batteryVoltage: '11.7', solveRateHz: 1 })
          .batteryVoltage
      ).toBeUndefined();
    });

    test('mapRtlsDeviceStats maps the automatic geometry fields', () => {
      const mapped = mapRtlsDeviceStats('3', {
        solveRateHz: 1,
        geometryState: 3,
        geometryResidualM: -0.075,
        geometryDriftM: 0.002,
        geometryDistancesM: [8.587, 9.224, 12.528, null, null, null, null],
      });
      expect(mapped).toMatchObject({
        geometryState: 3,
        geometryResidualM: -0.075,
        geometryDriftM: 0.002,
        geometryDistancesM: [8.587, 9.224, 12.528, null, null, null, null],
      });
      // firmware without automatic geometry sends none of them
      const legacy = mapRtlsDeviceStats('3', { solveRateHz: 1 });
      expect(legacy.geometryState).toBeUndefined();
      expect(legacy.geometryDistancesM).toBeUndefined();
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

  describe('position-estimate debug stream', () => {
    test('mapRtlsPosEstimate maps the fields and stamps receivedAt', () => {
      expect(
        mapRtlsPosEstimate(
          '42',
          {
            id: 42,
            north: 1.204,
            east: -0.351,
            down: -0.82,
            sigma: 0.12,
            timeBootMs: 123_456,
            ageMs: 40,
          },
          10_000
        )
      ).toEqual({
        id: '42',
        north: 1.204,
        east: -0.351,
        down: -0.82,
        sigma: 0.12,
        timeBootMs: 123_456,
        // arrival stamp corrected by the server-reported age
        receivedAt: 9960,
      });
    });

    test('mapRtlsPosEstimate omits an absent sigma', () => {
      const mapped = mapRtlsPosEstimate('1', { north: 1, east: 2 }, 1000);
      expect(mapped.sigma).toBeUndefined();
      expect(mapped.receivedAt).toBe(1000);
    });

    test('buildRtlsPositionsMap tolerates malformed input', () => {
      expect(buildRtlsPositionsMap(undefined, 0)).toEqual({});
      expect(buildRtlsPositionsMap({ '1': null as never }, 0)).toMatchObject({
        '1': { id: '1' },
      });
    });

    test('handleRtlsPositionMessage dispatches updateRtlsPositions', () => {
      const dispatch = createMockDispatch();
      handleRtlsPositionMessage(
        {
          type: 'X-RTLS-POS',
          positions: {
            '42': { id: 42, north: 1, east: 2, down: -0.5, ageMs: 0 },
          },
        },
        dispatch
      );
      expect(dispatch).toHaveBeenCalledTimes(1);
      const action = dispatch.mock.calls[0][0];
      expect(action.type).toBe('rtls/updateRtlsPositions');
      expect(action.payload.byId['42']).toMatchObject({
        id: '42',
        north: 1,
        east: 2,
        down: -0.5,
      });
      expect(typeof action.payload.byId['42'].receivedAt).toBe('number');
    });
  });
});
