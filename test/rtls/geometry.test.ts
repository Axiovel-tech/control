import { describe, expect, jest, test } from '@jest/globals';

jest.mock('~/error-handling', () => ({
  errorToString: (error: unknown): string =>
    error instanceof Error ? error.message : String(error),
}));

import {
  checkRtlsGeometry,
  syncRtlsGeometry,
} from '~/features/rtls/messages';
import {
  getRtlsGeometryDriftCount,
  isRtlsGeometryBusy,
} from '~/features/rtls/selectors';
import reducer, {
  clearRtlsDevices,
  setRtlsDevicesFromStatus,
  closeRtlsGeometrySyncDialog,
  openRtlsGeometrySyncDialog,
  rtlsGeometryCheckStarted,
  rtlsGeometryCheckSucceeded,
  rtlsGeometrySyncStarted,
  rtlsGeometrySyncSucceeded,
} from '~/features/rtls/slice';
import { type RtlsGeometryCheck } from '~/features/rtls/types';
import type MessageHub from '~/flockwave/messages';
import { type RootState } from '~/store/reducers';

const makeHub = (body: Record<string, unknown>) => {
  const sent: any[] = [];
  const hub = {
    sendMessage: jest.fn((request: unknown) => {
      sent.push(request);
      return Promise.resolve({ body });
    }),
  };
  return { hub: hub as unknown as MessageHub, sent };
};

const initial = () => reducer(undefined, { type: 'noop' });

const CHECK: RtlsGeometryCheck = {
  reference: 61,
  cell: 'default',
  consistent: false,
  devices: {
    '62': { status: 'consistent' },
    '63': {
      status: 'mismatch',
      deltas: { UWB_AN1_X: { expected: 10, actual: 10.5 } },
    },
    '64': { status: 'incomplete', missing: ['POS_YAW_DEG'] },
  },
  receivedAt: 123,
};

describe('X-RTLS-GEO message helpers', () => {
  test('check sends the op and returns the body', async () => {
    const { hub, sent } = makeHub({ type: 'X-RTLS-GEO', op: 'check' });
    const body = await checkRtlsGeometry(hub);
    expect(sent[0]).toEqual({ type: 'X-RTLS-GEO', op: 'check' });
    expect(body.op).toBe('check');
  });

  test('sync passes reboot=false through and NAKs become errors', async () => {
    const { hub, sent } = makeHub({ type: 'X-RTLS-GEO', op: 'sync' });
    await syncRtlsGeometry(hub, { reboot: false });
    expect(sent[0]).toEqual({
      type: 'X-RTLS-GEO',
      op: 'sync',
      reboot: false,
    });

    const nak = makeHub({ type: 'ACK-NAK', reason: 'no reference' });
    await expect(syncRtlsGeometry(nak.hub)).rejects.toThrow('no reference');
  });
});

describe('geometry slice state', () => {
  test('check lifecycle stores the snapshot', () => {
    let state = reducer(initial(), rtlsGeometryCheckStarted());
    expect(state.geometry.checking).toBe(true);
    state = reducer(state, rtlsGeometryCheckSucceeded(CHECK));
    expect(state.geometry.checking).toBe(false);
    expect(state.geometry.lastCheck?.devices['63']?.status).toBe('mismatch');
  });

  test('starting a sync closes the confirm dialog', () => {
    let state = reducer(initial(), openRtlsGeometrySyncDialog());
    expect(state.geometry.syncDialogOpen).toBe(true);
    state = reducer(state, rtlsGeometrySyncStarted());
    expect(state.geometry.syncDialogOpen).toBe(false);
    expect(state.geometry.syncing).toBe(true);
    state = reducer(state, closeRtlsGeometrySyncDialog());
    expect(state.geometry.syncDialogOpen).toBe(false);
  });

  test('sync results are stored', () => {
    const state = reducer(
      initial(),
      rtlsGeometrySyncSucceeded({
        reference: 61,
        devices: { '63': { status: 'synced', written: ['UWB_AN1_X'] } },
        receivedAt: 456,
      })
    );
    expect(state.geometry.lastSync?.devices['63']?.written).toEqual([
      'UWB_AN1_X',
    ]);
  });

  test('clearing the devices clears the consistency snapshot too', () => {
    let state = reducer(initial(), rtlsGeometryCheckSucceeded(CHECK));
    state = reducer(state, clearRtlsDevices());
    expect(state.geometry.lastCheck).toBeUndefined();
  });
});

describe('geometry selectors', () => {
  const asRoot = (rtls: unknown): RootState =>
    ({ rtls }) as unknown as RootState;

  test('drift count counts every non-consistent verdict', () => {
    const state = asRoot({
      geometry: { checking: false, syncing: false, lastCheck: CHECK },
    });
    expect(getRtlsGeometryDriftCount(state)).toBe(2);
  });

  test('busy while checking or syncing', () => {
    expect(
      isRtlsGeometryBusy(
        asRoot({ geometry: { checking: true, syncing: false } })
      )
    ).toBe(true);
    expect(
      isRtlsGeometryBusy(
        asRoot({ geometry: { checking: false, syncing: true } })
      )
    ).toBe(true);
    expect(
      isRtlsGeometryBusy(
        asRoot({ geometry: { checking: false, syncing: false } })
      )
    ).toBe(false);
  });
});

describe('geometry certification lifecycle (audit)', () => {
  test('write-only sync marks tags pending reboot; a reboot clears it', () => {
    let state = reducer(
      initial(),
      rtlsGeometrySyncSucceeded({
        reference: 61,
        devices: {
          '63': { status: 'synced', written: ['UWB_AN1_X'], rebooted: false },
          '62': { status: 'synced', written: [], skipped: ['UWB_AN1_X'] },
        },
        receivedAt: 1,
      })
    );
    expect(state.geometry.pendingReboot).toEqual({ '63': true });

    // the device is seen with a LOWER uptime -> it rebooted
    state = reducer(
      state,
      setRtlsDevicesFromStatus({ '63': { online: true, uptimeMs: 100_000 } })
    );
    state = reducer(
      state,
      setRtlsDevicesFromStatus({ '63': { online: true, uptimeMs: 5000 } })
    );
    expect(state.geometry.pendingReboot).toEqual({});
  });

  test('a new tag joining voids the certification', () => {
    let state = reducer(
      initial(),
      setRtlsDevicesFromStatus({ '61': { online: true } })
    );
    state = reducer(state, rtlsGeometryCheckSucceeded(CHECK));
    expect(state.geometry.lastCheck).toBeDefined();
    // same set again: certification survives
    state = reducer(
      state,
      setRtlsDevicesFromStatus({ '61': { online: true } })
    );
    expect(state.geometry.lastCheck).toBeDefined();
    // a new tag joins: certification void
    state = reducer(
      state,
      setRtlsDevicesFromStatus({
        '61': { online: true },
        '99': { online: true },
      })
    );
    expect(state.geometry.lastCheck).toBeUndefined();
  });
});

describe('fleet verification state', () => {
  test('verify lifecycle stores the result', () => {
    const {
      rtlsVerifyStarted,
      rtlsVerifySucceeded,
      openRtlsVerifyDialog,
      closeRtlsVerifyDialog,
    } = require('~/features/rtls/slice');
    let state = reducer(initial(), openRtlsVerifyDialog());
    expect(state.verify.dialogOpen).toBe(true);
    state = reducer(state, rtlsVerifyStarted());
    expect(state.verify.running).toBe(true);
    state = reducer(
      state,
      rtlsVerifySucceeded({
        inDepth: false,
        passed: false,
        rules: [
          {
            id: 'geometry',
            label: 'Cell geometry consistency',
            severity: 'error',
            status: 'fail',
            detail: '1 tag(s) disagree',
          },
        ],
        receivedAt: 1,
      })
    );
    expect(state.verify.running).toBe(false);
    expect(state.verify.lastResult?.passed).toBe(false);
    state = reducer(state, closeRtlsVerifyDialog());
    expect(state.verify.dialogOpen).toBe(false);
    // disconnecting clears the verdict
    state = reducer(state, clearRtlsDevices());
    expect(state.verify.lastResult).toBeUndefined();
  });
});
