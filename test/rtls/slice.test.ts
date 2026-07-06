import { describe, expect, test } from '@jest/globals';

import reducer, {
  clearRtlsDevices,
  closeRtlsParamDialog,
  openRtlsParamDialog,
  rtlsParamsFetchFailed,
  rtlsParamsFetchStarted,
  rtlsParamsFetchSucceeded,
  rtlsParamValueUpdated,
  setRtlsDevicesFromStatus,
  setRtlsOtaJob,
  setSelectedTabInRtlsPanel,
  updateRtlsStats,
} from '~/features/rtls/slice';

const initial = () => reducer(undefined, { type: '@@INIT' });

describe('rtls slice', () => {
  test('has a sensible initial state', () => {
    const state = initial();
    expect(state.devices.order).toEqual([]);
    expect(state.devices.byId).toEqual({});
    expect(state.stats.byId).toEqual({});
    expect(state.otaJobs).toEqual({});
  });

  test('setRtlsDevicesFromStatus replaces the registry wholesale', () => {
    let state = reducer(
      initial(),
      setRtlsDevicesFromStatus({
        '1': { online: true },
        '2': { online: false },
      })
    );
    expect(new Set(state.devices.order)).toEqual(new Set(['1', '2']));

    // Device 2 disappears from the next snapshot.
    state = reducer(
      state,
      setRtlsDevicesFromStatus({
        '1': { online: true, firmwareVersion: '9' },
      })
    );
    expect(state.devices.order).toEqual(['1']);
    expect(state.devices.byId['2']).toBeUndefined();
    expect(state.devices.byId['1']).toMatchObject({
      id: '1',
      firmwareVersion: '9',
    });
  });

  test('setRtlsDevicesFromStatus drops stale OTA jobs', () => {
    let state = reducer(
      initial(),
      setRtlsDevicesFromStatus({ '1': { online: true }, '2': { online: true } })
    );
    state = reducer(
      state,
      setRtlsOtaJob({ id: '2', job: { status: 'inProgress' } })
    );
    expect(state.otaJobs['2']).toBeDefined();

    state = reducer(state, setRtlsDevicesFromStatus({ '1': { online: true } }));
    expect(state.otaJobs['2']).toBeUndefined();
  });

  test('updateRtlsStats merges per device and keeps lastUpdatedAt fresh', () => {
    let state = reducer(
      initial(),
      updateRtlsStats({
        byId: { '3': { id: '3', solveRateHz: 10 } },
        lastUpdatedAt: 100,
      })
    );
    expect(state.stats.byId['3']).toMatchObject({ id: '3', solveRateHz: 10 });
    expect(state.stats.lastUpdatedAt).toBe(100);

    state = reducer(
      state,
      updateRtlsStats({ byId: { '4': { id: '4' } }, lastUpdatedAt: 200 })
    );
    // The earlier device's stats are preserved alongside the new device's.
    expect(state.stats.byId['3']).toMatchObject({ id: '3', solveRateHz: 10 });
    expect(state.stats.byId['4']).toBeDefined();
    expect(state.stats.lastUpdatedAt).toBe(200);
  });

  test("a device's stats survive a single-device stats broadcast for another device", () => {
    // Device A reports stats first.
    let state = reducer(
      initial(),
      updateRtlsStats({
        byId: { A: { id: 'A', solveRateHz: 8, solvePct: 90 } },
        lastUpdatedAt: 1,
      })
    );
    // The server then broadcasts ONLY device B (one device per message).
    state = reducer(
      state,
      updateRtlsStats({
        byId: { B: { id: 'B', solveRateHz: 4 } },
        lastUpdatedAt: 2,
      })
    );

    // Device A must NOT be clobbered by the device-B-only broadcast.
    expect(state.stats.byId['A']).toMatchObject({
      id: 'A',
      solveRateHz: 8,
      solvePct: 90,
    });
    expect(state.stats.byId['B']).toMatchObject({ id: 'B', solveRateHz: 4 });
  });

  test('setRtlsDevicesFromStatus prunes stats of vanished devices', () => {
    let state = reducer(
      initial(),
      setRtlsDevicesFromStatus({ '1': { online: true }, '2': { online: true } })
    );
    state = reducer(
      state,
      updateRtlsStats({
        byId: { '1': { id: '1' }, '2': { id: '2' } },
        lastUpdatedAt: 1,
      })
    );
    expect(state.stats.byId['2']).toBeDefined();

    // Device 2 disappears from the next inventory snapshot.
    state = reducer(state, setRtlsDevicesFromStatus({ '1': { online: true } }));
    expect(state.stats.byId['2']).toBeUndefined();
    expect(state.stats.byId['1']).toBeDefined();
  });

  test('setRtlsOtaJob records the latest job per device', () => {
    const state = reducer(
      initial(),
      setRtlsOtaJob({ id: '5', job: { status: 'success', progress: 1 } })
    );
    expect(state.otaJobs['5']).toEqual({ status: 'success', progress: 1 });
  });

  describe('parameter cache', () => {
    test('fetch lifecycle: started → succeeded', () => {
      let state = reducer(initial(), rtlsParamsFetchStarted('7'));
      expect(state.paramsByDevice['7']).toMatchObject({
        status: 'loading',
        params: [],
      });

      state = reducer(
        state,
        rtlsParamsFetchSucceeded({
          id: '7',
          params: [{ name: 'GAIN', value: 5, type: 'uint16', index: 0 }],
        })
      );
      expect(state.paramsByDevice['7'].status).toBe('ready');
      expect(state.paramsByDevice['7'].params).toHaveLength(1);
      expect(typeof state.paramsByDevice['7'].lastFetchedAt).toBe('number');
    });

    test('fetch failure keeps prior params and records the error', () => {
      let state = reducer(
        initial(),
        rtlsParamsFetchSucceeded({
          id: '7',
          params: [{ name: 'GAIN', value: 5, type: 'uint16' }],
        })
      );
      state = reducer(
        state,
        rtlsParamsFetchFailed({ id: '7', error: 'timeout' })
      );
      expect(state.paramsByDevice['7'].status).toBe('error');
      expect(state.paramsByDevice['7'].error).toBe('timeout');
      // Previously fetched params survive a later failure.
      expect(state.paramsByDevice['7'].params).toHaveLength(1);
    });

    test('rtlsParamValueUpdated mutates a cached value', () => {
      let state = reducer(
        initial(),
        rtlsParamsFetchSucceeded({
          id: '7',
          params: [{ name: 'GAIN', value: 5, type: 'uint16' }],
        })
      );
      state = reducer(
        state,
        rtlsParamValueUpdated({ id: '7', name: 'GAIN', value: 9 })
      );
      expect(state.paramsByDevice['7'].params[0].value).toBe(9);
    });

    test('rtlsParamValueUpdated is a no-op for an unloaded device', () => {
      const state = reducer(
        initial(),
        rtlsParamValueUpdated({ id: '7', name: 'GAIN', value: 9 })
      );
      expect(state.paramsByDevice['7']).toBeUndefined();
    });
  });

  describe('parameter dialog', () => {
    test('open and close', () => {
      let state = reducer(initial(), openRtlsParamDialog('7'));
      expect(state.paramDialog).toEqual({ open: true, deviceId: '7' });
      state = reducer(state, closeRtlsParamDialog());
      expect(state.paramDialog).toEqual({ open: false, deviceId: undefined });
    });
  });

  describe('panel tab', () => {
    test('defaults to the devices tab', () => {
      expect(initial().panel.selectedTab).toBe('devices');
    });

    test('setSelectedTabInRtlsPanel switches tabs', () => {
      let state = reducer(initial(), setSelectedTabInRtlsPanel('health'));
      expect(state.panel.selectedTab).toBe('health');
      state = reducer(state, setSelectedTabInRtlsPanel('devices'));
      expect(state.panel.selectedTab).toBe('devices');
    });
  });

  test('clearRtlsDevices resets everything', () => {
    let state = reducer(
      initial(),
      setRtlsDevicesFromStatus({ '1': { online: true } })
    );
    state = reducer(state, setRtlsOtaJob({ id: '1', job: { status: 'idle' } }));
    state = reducer(
      state,
      updateRtlsStats({ byId: { '1': { id: '1' } }, lastUpdatedAt: 1 })
    );

    state = reducer(state, rtlsParamsFetchSucceeded({ id: '1', params: [] }));

    state = reducer(state, clearRtlsDevices());
    expect(state.devices.order).toEqual([]);
    expect(state.devices.byId).toEqual({});
    expect(state.stats.byId).toEqual({});
    expect(state.otaJobs).toEqual({});
    expect(state.paramsByDevice).toEqual({});
  });
});
