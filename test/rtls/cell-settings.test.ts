import { describe, expect, jest, test } from '@jest/globals';

// The message hub and the snackbar sit on heavy import chains.
jest.mock('~/message-hub', () => ({
  __esModule: true,
  default: { sendMessage: jest.fn() },
}));
jest.mock('~/features/snackbar/actions', () => ({
  __esModule: true,
  showError: jest.fn(),
  showNotification: jest.fn(),
}));
jest.mock('~/error-handling', () => ({
  errorToString: (error: unknown): string => String(error),
}));

import { cellProblemOf } from '~/features/rtls/CellSettingsIcon';
import { countCellDevicesNotOk } from '~/features/rtls/CellSettingsControl';
import { listCellProblems } from '~/features/rtls/RtlsCellSettingsDialog';
import {
  applyRtlsCellSettings,
  queryRtlsCellSettings,
} from '~/features/rtls/cell-actions';
import { mapCellSettings } from '~/features/rtls/cell-settings';
import {
  buildRtlsDeviceStatusMap,
  rtlsInformationActions,
} from '~/features/rtls/handlers';
import { setRtlsDeviceParameter } from '~/features/rtls/param-actions';
import {
  clearRtlsDevices,
  openRtlsCellDialog,
  setRtlsCellSettings,
  setRtlsDevicesFromStatus,
} from '~/features/rtls/slice';
import { showNotification } from '~/features/snackbar/actions';
import messageHub from '~/message-hub';

import { createRtlsTestStore, dispatchThunk, reply } from './rtls-test-store';

// eslint-disable-next-line @typescript-eslint/unbound-method -- a jest mock, never called through `this`
const sendMessage = jest.mocked(messageHub.sendMessage);

/** A0 (201) on 83 Hz; 202 still runs the old settings, the tag has not reported. */
const CELL = {
  rateHz: 83,
  blockMs: 12,
  txGain: 47,
  reference: 201,
  differ: [],
  restart: [202],
  unknown: [42],
};

const seedCell = () => {
  const store = createRtlsTestStore();
  store.dispatch(
    setRtlsDevicesFromStatus(
      buildRtlsDeviceStatusMap({
        '201': { online: true, role: 'anchor-initiator', cellSettings: 'ok' },
        '202': {
          online: true,
          role: 'anchor-responder',
          name: 'RTLS anchor A1',
          cellSettings: 'restart',
        },
        '203': {
          online: true,
          role: 'anchor-responder',
          name: 'RTLS anchor A2',
          cellSettings: 'differ',
          cellSettingsDetail: 'different TX level',
        },
        '42': { online: true, role: 'tag', name: 'RTLS tag 42' },
        '43': { online: false, role: 'tag', name: 'RTLS tag 43' },
      })
    )
  );
  store.dispatch(setRtlsCellSettings(mapCellSettings(CELL)!));
  return store;
};

describe('cell settings mapping', () => {
  test('maps the server shape with ids as keys', () => {
    expect(mapCellSettings(CELL)).toEqual({
      ...CELL,
      reference: '201',
      restart: ['202'],
      unknown: ['42'],
    });
  });

  test('a custom block and no A0 map to undefined fields', () => {
    expect(
      mapCellSettings({ ...CELL, rateHz: null, reference: null })
    ).toMatchObject({ rateHz: undefined, reference: undefined });
  });

  test('a server without cell settings reports none and leaves them alone', () => {
    expect(mapCellSettings(undefined)).toBe(undefined);
    expect(rtlsInformationActions({ status: {} })).toHaveLength(1);
    expect(
      rtlsInformationActions({ status: {}, cellSettings: CELL }).at(-1)
    ).toEqual(setRtlsCellSettings(mapCellSettings(CELL)!));
  });

  test('a device that drops its state loses the stale one', () => {
    const store = seedCell();
    store.dispatch(
      setRtlsDevicesFromStatus(
        buildRtlsDeviceStatusMap({ '202': { online: false } })
      )
    );
    expect(store.getState().rtls.devices.byId['202'].cellSettings).toBe(
      undefined
    );
  });

  test('the cell belongs to the server: dropped with the registry', () => {
    const store = seedCell();
    store.dispatch(openRtlsCellDialog());
    store.dispatch(clearRtlsDevices());
    expect(store.getState().rtls.cellSettings).toBe(undefined);
    expect(store.getState().rtls.cellDialogOpen).toBe(false);
  });
});

describe('what the panel shows', () => {
  test('the count covers every device that does not run the settings', () => {
    expect(countCellDevicesNotOk(mapCellSettings(CELL)!)).toBe(2);
  });

  test('row warnings tell a restart from different settings and TX', () => {
    const { byId } = seedCell().getState().rtls.devices;
    expect(cellProblemOf(byId['201'])).toBe(undefined);
    expect(cellProblemOf(byId['202'])).toBe('restart');
    expect(cellProblemOf(byId['203'])).toBe('tx');
    expect(
      cellProblemOf({ ...byId['203'], cellSettingsDetail: undefined })
    ).toBe('differ');
  });

  test('the dialog lists restart, TX, unreported and offline devices', () => {
    const { rtls } = seedCell().getState();
    expect(
      listCellProblems(rtls.devices, rtls.cellSettings).map(
        ({ name, key }) => `${name}: ${key}`
      )
    ).toEqual([
      'RTLS tag 42: rtlsCellSettings.problem.unknown',
      'RTLS tag 43: rtlsCellSettings.problem.offline',
      'RTLS anchor A1: rtlsCellSettings.problem.restart',
      'RTLS anchor A2: rtlsCellSettings.problem.tx',
    ]);
  });
});

describe('X-RTLS-CELL', () => {
  test('status stores the settings and returns the refusal', async () => {
    const store = createRtlsTestStore();
    sendMessage.mockResolvedValueOnce(
      reply({
        type: 'X-RTLS-CELL',
        result: 'status',
        reason: 'A show is authorized',
        results: {},
        cellSettings: CELL,
      })
    );
    const reason = await dispatchThunk(store, queryRtlsCellSettings());
    expect(sendMessage.mock.calls[0][0]).toEqual({
      type: 'X-RTLS-CELL',
      action: 'status',
    });
    expect(reason).toBe('A show is authorized');
    expect(store.getState().rtls.cellSettings?.rateHz).toBe(83);
  });

  test('apply sends the target and notifies when applied', async () => {
    const store = createRtlsTestStore();
    sendMessage.mockResolvedValueOnce(
      reply({
        type: 'X-RTLS-CELL',
        result: 'applied',
        results: { '201': { written: 'changed', restarted: true } },
        cellSettings: CELL,
      })
    );
    const result = await dispatchThunk(
      store,
      applyRtlsCellSettings({ rateHz: 83, txGain: 47 })
    );
    expect(sendMessage.mock.calls[0][0]).toEqual({
      type: 'X-RTLS-CELL',
      action: 'apply',
      rateHz: 83,
      txGain: 47,
    });
    expect(result.errors).toEqual([]);
    expect(showNotification).toHaveBeenCalled();
  });

  test('an incomplete apply names the devices with the server detail', async () => {
    const store = seedCell();
    sendMessage.mockResolvedValueOnce(
      reply({
        type: 'X-RTLS-CELL',
        result: 'incomplete',
        reason: 'Not every device took the change; nothing was restarted',
        results: {
          '42': {
            written: 'failed',
            restarted: false,
            detail: 'RTLS tag 42 refused UWB_BLOCK_MS=12',
          },
          '202': {
            written: 'unchanged',
            restarted: false,
            detail: 'rollback failed: no answer',
          },
          '201': { written: 'unchanged', restarted: false },
        },
      })
    );
    const result = await dispatchThunk(
      store,
      applyRtlsCellSettings({ rateHz: 83 })
    );
    expect(result.errors).toEqual([
      'Not every device took the change; nothing was restarted',
      'RTLS tag 42 refused UWB_BLOCK_MS=12',
      'RTLS anchor A1: rollback failed: no answer',
    ]);
    expect(showNotification).not.toHaveBeenCalled();
  });

  test('a NAK rejects with its reason', async () => {
    sendMessage.mockResolvedValueOnce(
      reply({ type: 'ACK-NAK', reason: 'Unknown ranging rate: 100' })
    );
    await expect(
      dispatchThunk(
        createRtlsTestStore(),
        applyRtlsCellSettings({ rateHz: 100 })
      )
    ).rejects.toThrow('Unknown ranging rate: 100');
  });
});

describe('cell parameters in the parameter dialog', () => {
  test.each([
    'UWB_BLOCK_MS',
    'UWB_SLOTS_RR',
    'UWB_SLOT_RSTU',
    'UWB_CHANNEL',
    'UWB_SESSION_ID',
    'UWB_TX_GAIN',
  ])('%s is never written per device', async (name) => {
    await expect(
      dispatchThunk(seedCell(), setRtlsDeviceParameter('202', name, 12))
    ).rejects.toThrow();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
