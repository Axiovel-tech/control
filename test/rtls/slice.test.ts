import { describe, expect, test } from '@jest/globals';

import reducer, {
  clearRtlsDevices,
  setRtlsDeviceState,
  setRtlsDevicesFromStatus,
  setRtlsOtaJob,
  setSelectedRtlsDeviceIds,
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

  test('setRtlsDeviceState creates a new device with defaults', () => {
    const state = reducer(
      initial(),
      setRtlsDeviceState({ id: '7', online: true, firmwareVersion: '1.2.3' })
    );
    expect(state.devices.order).toEqual(['7']);
    expect(state.devices.byId['7']).toEqual({
      id: '7',
      online: true,
      firmwareVersion: '1.2.3',
    });
  });

  test('setRtlsDeviceState merges into an existing device', () => {
    let state = reducer(
      initial(),
      setRtlsDeviceState({ id: '7', online: true, paramCount: 10 })
    );
    state = reducer(
      state,
      setRtlsDeviceState({ id: '7', online: false, firmwareVersion: '2.0.0' })
    );
    expect(state.devices.order).toEqual(['7']);
    expect(state.devices.byId['7']).toMatchObject({
      id: '7',
      online: false,
      paramCount: 10,
      firmwareVersion: '2.0.0',
    });
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

    state = reducer(
      state,
      setRtlsDevicesFromStatus({ '1': { online: true } })
    );
    expect(state.otaJobs['2']).toBeUndefined();
  });

  test('updateRtlsStats replaces the stats wholesale', () => {
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
    expect(state.stats.byId['3']).toBeUndefined();
    expect(state.stats.byId['4']).toBeDefined();
    expect(state.stats.lastUpdatedAt).toBe(200);
  });

  test('setSelectedRtlsDeviceIds replaces the selection', () => {
    let state = reducer(initial(), setSelectedRtlsDeviceIds(['1', '2']));
    expect(state.selectedIds).toEqual(['1', '2']);
    state = reducer(state, setSelectedRtlsDeviceIds(['3']));
    expect(state.selectedIds).toEqual(['3']);
  });

  test('setRtlsDevicesFromStatus prunes the selection of vanished devices', () => {
    let state = reducer(
      initial(),
      setRtlsDevicesFromStatus({ '1': { online: true }, '2': { online: true } })
    );
    state = reducer(state, setSelectedRtlsDeviceIds(['1', '2']));
    state = reducer(
      state,
      setRtlsDevicesFromStatus({ '1': { online: true } })
    );
    expect(state.selectedIds).toEqual(['1']);
  });

  test('setRtlsOtaJob records the latest job per device', () => {
    const state = reducer(
      initial(),
      setRtlsOtaJob({ id: '5', job: { status: 'success', progress: 1 } })
    );
    expect(state.otaJobs['5']).toEqual({ status: 'success', progress: 1 });
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

    state = reducer(state, setSelectedRtlsDeviceIds(['1']));

    state = reducer(state, clearRtlsDevices());
    expect(state.devices.order).toEqual([]);
    expect(state.devices.byId).toEqual({});
    expect(state.stats.byId).toEqual({});
    expect(state.otaJobs).toEqual({});
    expect(state.selectedIds).toEqual([]);
  });
});
