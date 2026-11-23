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
jest.mock('~/features/prompt/actions', () => ({
  __esModule: true,
  showConfirmationDialog: jest.fn(),
}));

import { cellProblemOf } from '~/features/rtls/CellSettingsIcon';
import { countCellDevicesNotOk } from '~/features/rtls/CellSettingsControl';
import {
  customRateText,
  listCellProblems,
} from '~/features/rtls/RtlsCellSettingsDialog';
import { applyRtlsCellSettings } from '~/features/rtls/cell-actions';
import {
  cellApplyRefusalKey,
  changedCellTarget,
  mapCellSettings,
} from '~/features/rtls/cell-settings';
import {
  buildRtlsDeviceStatusMap,
  rtlsInformationActions,
} from '~/features/rtls/handlers';
import {
  READ_ONLY_RTLS_PARAMS,
  setRtlsDeviceParameter,
} from '~/features/rtls/param-actions';
import {
  clearRtlsDevices,
  openRtlsCellDialog,
  setRtlsCellSettings,
  setRtlsDevicesFromStatus,
} from '~/features/rtls/slice';
import { showConfirmationDialog } from '~/features/prompt/actions';
import { showNotification } from '~/features/snackbar/actions';
import i18n from '~/i18n';
import messageHub from '~/message-hub';
import { UAVAge } from '~/model/uav';

import {
  answer,
  createRtlsTestStore,
  dispatchThunk,
  reply,
} from './rtls-test-store';

// eslint-disable-next-line @typescript-eslint/unbound-method -- a jest mock, never called through `this`
const sendMessage = jest.mocked(messageHub.sendMessage);
const confirm = jest.mocked(showConfirmationDialog);

/** A0 (201) on 83 Hz; 202 still runs the old settings, the tag has not reported. */
const CELL = {
  rateHz: 83,
  blockMs: 12,
  txGain: 47,
  reference: 201,
  differ: [202],
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
          cellSettings: 'differ',
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
      differ: ['202'],
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

  test('row warnings tell different settings from a different TX level', () => {
    const { byId } = seedCell().getState().rtls.devices;
    expect(cellProblemOf(byId['201'])).toBe(undefined);
    expect(cellProblemOf(byId['202'])).toBe('differ');
    expect(cellProblemOf(byId['203'])).toBe('tx');
    expect(cellProblemOf({ ...byId['202'], cellSettings: 'unknown' })).toBe(
      undefined
    );
  });

  test('the dialog lists differing, TX, unreported and offline devices', () => {
    const { rtls } = seedCell().getState();
    expect(
      listCellProblems(rtls.devices, rtls.cellSettings).map(
        ({ name, key }) => `${name}: ${key}`
      )
    ).toEqual([
      'RTLS tag 42: rtlsCellSettings.problem.unknown',
      'RTLS tag 43: rtlsCellSettings.problem.offline',
      'RTLS anchor A1: rtlsCellSettings.problem.differ',
      'RTLS anchor A2: rtlsCellSettings.problem.tx',
    ]);
  });
});

describe('X-RTLS-CELL', () => {
  test('apply sends the target and notifies when applied', async () => {
    const store = createRtlsTestStore();
    sendMessage.mockResolvedValueOnce(
      reply({
        type: 'X-RTLS-CELL',
        result: 'applied',
        results: { '201': { written: 'changed' } },
        cellSettings: CELL,
      })
    );
    const result = await dispatchThunk(
      store,
      applyRtlsCellSettings({ rateHz: 83, txGain: 47 })
    );
    // the tags' writes, then the anchors': a silent device costs 5 s each
    expect(sendMessage.mock.calls[0]).toEqual([
      { type: 'X-RTLS-CELL', rateHz: 83, txGain: 47 },
      { timeout: 20 },
    ]);
    expect(result?.errors).toEqual([]);
    expect(showNotification).toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  test('apply asks first while a drone may be armed; no sends nothing', async () => {
    const store = createRtlsTestStore([
      { id: 'd1', age: UAVAge.ACTIVE, errors: [] },
    ]);
    confirm.mockReturnValueOnce(answer(false));
    const result = await dispatchThunk(
      store,
      applyRtlsCellSettings({ txGain: 20 })
    );
    expect(confirm.mock.calls[0]).toEqual([
      'rtlsCellSettings.confirm.armedMessage',
      { title: 'rtlsCellSettings.confirm.title' },
    ]);
    expect(result).toBe(undefined);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('an incomplete apply names the devices with the server detail', async () => {
    const store = seedCell();
    sendMessage.mockResolvedValueOnce(
      reply({
        type: 'X-RTLS-CELL',
        result: 'incomplete',
        reason: 'Not every anchor took the change',
        results: {
          '42': { written: 'changed' },
          '202': {
            written: 'failed',
            detail: 'RTLS anchor A1: no answer to UWB_BLOCK_MS=12',
          },
          '201': { written: 'changed' },
        },
      })
    );
    const result = await dispatchThunk(
      store,
      applyRtlsCellSettings({ rateHz: 83 })
    );
    expect(result?.errors).toEqual([
      'Not every anchor took the change',
      'RTLS anchor A1: no answer to UWB_BLOCK_MS=12',
    ]);
    expect(showNotification).not.toHaveBeenCalled();
  });

  test('a server refusal is shown with its reason', async () => {
    sendMessage.mockResolvedValueOnce(
      reply({
        type: 'X-RTLS-CELL',
        result: 'refused',
        reason: 'A show is authorized',
        results: {},
      })
    );
    const result = await dispatchThunk(
      createRtlsTestStore(),
      applyRtlsCellSettings({ rateHz: 83 })
    );
    expect(result?.result).toBe('refused');
    expect(result?.errors).toEqual(['A show is authorized']);
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

describe('the dialog', () => {
  const cell = mapCellSettings(CELL)!;

  test('sends only what the operator changed in the form', () => {
    const opened = { rateHz: 83, txGain: 47 };
    expect(changedCellTarget(opened, { rateHz: 83, txGain: 47 })).toEqual({});
    expect(changedCellTarget(opened, { rateHz: 83, txGain: 20 })).toEqual({
      txGain: 20,
    });
    // a custom rate and an unread TX level are never replaced by a default
    expect(changedCellTarget({}, { txGain: 20 })).toEqual({ txGain: 20 });
    expect(changedCellTarget({}, { rateHz: 50 })).toEqual({ rateHz: 50 });
  });

  test('a field left as it opened is not sent though the cell changed', () => {
    // opened at 50 Hz; another client applied 83 Hz; only TX was edited
    const opened = { rateHz: 50, txGain: 47 };
    expect(changedCellTarget(opened, { rateHz: 50, txGain: 20 })).toEqual({
      txGain: 20,
    });
  });

  test('says why Apply is unavailable from the live state', () => {
    const live = { lockedCount: 0, anyOnline: true };
    expect(cellApplyRefusalKey(live)).toBe(undefined);
    expect(cellApplyRefusalKey({ ...live, lockedCount: 2 })).toBe(
      'rtlsCellSettings.unlockFirst'
    );
    expect(cellApplyRefusalKey({ ...live, anyOnline: false })).toBe(
      'rtlsCellSettings.noDevices'
    );
  });

  test('the rate placeholder reads "—" without A0, not "Custom"', () => {
    const t = i18n.t.bind(i18n);
    expect(customRateText(undefined, t)).toBe('—');
    expect(customRateText({ ...cell, reference: undefined }, t)).toBe('—');
    expect(customRateText({ ...cell, blockMs: undefined }, t)).toBe(
      'rtlsCellSettings.custom'
    );
    expect(customRateText(cell, t)).toBe('rtlsCellSettings.customBlock');
  });
});

describe('cell parameters in the parameter dialog', () => {
  test('channel and session id are set with the CLI, the rest in Cell settings', () => {
    expect(READ_ONLY_RTLS_PARAMS.UWB_CHANNEL).toBe('rtlsParams.cellCliOnly');
    expect(READ_ONLY_RTLS_PARAMS.UWB_SESSION_ID).toBe('rtlsParams.cellCliOnly');
    expect(READ_ONLY_RTLS_PARAMS.UWB_TX_GAIN).toBe('rtlsParams.cellReadOnly');
  });

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
