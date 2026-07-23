import { describe, expect, jest, test } from '@jest/globals';

import reducer, {
  applyRtlsSleepResults,
  SLEEP_RESULT_GUARD_MS,
  clearRtlsDevices,
  closeRtlsParamDialog,
  openRtlsParamDialog,
  rtlsParamsFetchFailed,
  rtlsParamsFetchStarted,
  rtlsParamsFetchSucceeded,
  rtlsParamValueUpdated,
  rtlsSleepTransactionEnded,
  rtlsSleepTransactionStarted,
  setRtlsAnchors,
  setRtlsDevicesFromStatus,
  setRtlsOtaJob,
  updateRtlsPositions,
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

  test('setRtlsDevicesFromStatus updates and clears the tag<->drone pairing', () => {
    let state = reducer(
      initial(),
      setRtlsDevicesFromStatus({ '42': { online: true, uav: '05' } })
    );
    expect(state.devices.byId['42'].uav).toBe('05');

    // the update merges per-field, so the handler always assigns the key;
    // a snapshot without a pairing must clear the stale one
    state = reducer(
      state,
      setRtlsDevicesFromStatus({ '42': { online: true, uav: undefined } })
    );
    expect(state.devices.byId['42'].uav).toBeUndefined();
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

  describe('position-estimate debug stream', () => {
    test('updateRtlsPositions merges per device', () => {
      let state = reducer(
        initial(),
        updateRtlsPositions({
          byId: { '1': { id: '1', north: 1, east: 2, down: -0.5 } },
        })
      );
      state = reducer(
        state,
        updateRtlsPositions({
          byId: { '2': { id: '2', north: -1, east: 0, down: 0 } },
        })
      );

      // a single-device broadcast must not clobber the other device
      expect(Object.keys(state.positions.byId).sort()).toEqual(['1', '2']);

      state = reducer(
        state,
        updateRtlsPositions({
          byId: { '1': { id: '1', north: 1.5, east: 2.5, down: -0.6 } },
        })
      );
      expect(state.positions.byId['1']).toMatchObject({ north: 1.5 });
      expect(state.positions.byId['2']).toMatchObject({ north: -1 });
    });

    test('setRtlsDevicesFromStatus prunes positions of vanished devices', () => {
      let state = reducer(
        initial(),
        setRtlsDevicesFromStatus({
          '1': { online: true },
          '2': { online: true },
        })
      );
      state = reducer(
        state,
        updateRtlsPositions({
          byId: {
            '1': { id: '1', north: 1, east: 2 },
            '2': { id: '2', north: 3, east: 4 },
          },
        })
      );

      state = reducer(
        state,
        setRtlsDevicesFromStatus({ '1': { online: true } })
      );
      expect(Object.keys(state.positions.byId)).toEqual(['1']);
    });

    test('setRtlsAnchors replaces the anchor list wholesale', () => {
      let state = reducer(
        initial(),
        setRtlsAnchors([
          { id: 'rtls::default::anchor_0', index: 0, active: true },
          { id: 'rtls::default::anchor_1', index: 1, active: false },
        ])
      );
      expect(state.anchors).toHaveLength(2);

      state = reducer(
        state,
        setRtlsAnchors([{ id: 'rtls::default::anchor_0', index: 0 }])
      );
      expect(state.anchors).toHaveLength(1);
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
    state = reducer(
      state,
      updateRtlsPositions({ byId: { '1': { id: '1', north: 1, east: 2 } } })
    );
    state = reducer(state, setRtlsAnchors([{ id: 'rtls::default::anchor_0' }]));

    state = reducer(state, rtlsParamsFetchSucceeded({ id: '1', params: [] }));

    state = reducer(state, clearRtlsDevices());
    expect(state.devices.order).toEqual([]);
    expect(state.devices.byId).toEqual({});
    expect(state.stats.byId).toEqual({});
    expect(state.positions.byId).toEqual({});
    expect(state.anchors).toEqual([]);
    expect(state.otaJobs).toEqual({});
    expect(state.paramsByDevice).toEqual({});
  });

  test('applyRtlsSleepResults updates only the devices that exist', () => {
    let state = reducer(
      initial(),
      setRtlsDevicesFromStatus({
        '1': { online: true, sleeping: true },
        '2': { online: true, sleeping: true },
      })
    );

    state = reducer(state, applyRtlsSleepResults({ '1': false, '99': false }));

    expect(state.devices.byId['1'].sleeping).toBe(false);
    expect(state.devices.byId['2'].sleeping).toBe(true);
    // Ids that are not in the registry are ignored, not created.
    expect(state.devices.byId['99']).toBeUndefined();
    expect(state.devices.order).toEqual(['1', '2']);
  });

  test('sleep transaction markers track the in-flight devices', () => {
    let state = reducer(initial(), rtlsSleepTransactionStarted(['1', '2']));
    expect(state.sleepPending).toEqual({ '1': true, '2': true });

    // The pending map survives an INF snapshot that drops a device (a waking
    // device may fall out of the snapshot while it reboots).
    state = reducer(state, setRtlsDevicesFromStatus({ '1': { online: true } }));
    expect(state.sleepPending).toEqual({ '1': true, '2': true });

    state = reducer(state, rtlsSleepTransactionEnded(['1', '2']));
    expect(state.sleepPending).toEqual({});

    state = reducer(state, rtlsSleepTransactionStarted(['1']));
    state = reducer(state, clearRtlsDevices());
    expect(state.sleepPending).toEqual({});
  });

  test('a fresh sleep result guards against contradicting snapshot values', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    try {
      nowSpy.mockReturnValue(1000);
      let state = reducer(
        initial(),
        setRtlsDevicesFromStatus({ '1': { online: true, sleeping: true } })
      );
      state = reducer(state, applyRtlsSleepResults({ '1': false }));
      expect(state.devices.byId['1'].sleeping).toBe(false);

      // A snapshot still carrying the stale pre-transition latch arrives
      // within the guard window: it must not overwrite the applied result.
      nowSpy.mockReturnValue(1000 + 5000);
      state = reducer(
        state,
        setRtlsDevicesFromStatus({ '1': { online: true, sleeping: true } })
      );
      expect(state.devices.byId['1'].sleeping).toBe(false);

      // Neither may an "unknown" snapshot value.
      state = reducer(
        state,
        setRtlsDevicesFromStatus({ '1': { online: true, sleeping: undefined } })
      );
      expect(state.devices.byId['1'].sleeping).toBe(false);

      // A confirming snapshot retires the guard...
      state = reducer(
        state,
        setRtlsDevicesFromStatus({ '1': { online: true, sleeping: false } })
      );
      // ...after which the snapshot is authoritative again.
      state = reducer(
        state,
        setRtlsDevicesFromStatus({ '1': { online: true, sleeping: true } })
      );
      expect(state.devices.byId['1'].sleeping).toBe(true);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test('the sleep-result guard expires after its window', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    try {
      nowSpy.mockReturnValue(1000);
      let state = reducer(
        initial(),
        setRtlsDevicesFromStatus({ '1': { online: true, sleeping: true } })
      );
      state = reducer(state, applyRtlsSleepResults({ '1': false }));

      nowSpy.mockReturnValue(1000 + SLEEP_RESULT_GUARD_MS + 1);
      state = reducer(
        state,
        setRtlsDevicesFromStatus({ '1': { online: true, sleeping: true } })
      );
      expect(state.devices.byId['1'].sleeping).toBe(true);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test('the sleep-result guard survives the device dropping out of a snapshot', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    try {
      nowSpy.mockReturnValue(1000);
      let state = reducer(
        initial(),
        setRtlsDevicesFromStatus({ '1': { online: true, sleeping: true } })
      );
      state = reducer(state, applyRtlsSleepResults({ '1': false }));

      // The waking device drops out of the snapshot while it reboots...
      nowSpy.mockReturnValue(1000 + 5000);
      state = reducer(state, setRtlsDevicesFromStatus({}));
      expect(state.devices.byId['1']).toBeUndefined();

      // ...and reappears within the window still reporting the stale latch:
      // the guard must still hold.
      nowSpy.mockReturnValue(1000 + 10_000);
      state = reducer(
        state,
        setRtlsDevicesFromStatus({ '1': { online: true, sleeping: true } })
      );
      expect(state.devices.byId['1'].sleeping).toBe(false);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
