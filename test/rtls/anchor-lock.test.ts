import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { configureStore, createSlice } from '@reduxjs/toolkit';

// Same thin mocks as anchor-sleep.test.ts: the message hub and the snackbar
// sit on heavy import chains; the prompt is answered by the test.
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

import {
  getAnchorLockState,
  isLockBroken,
  mapAnchorLock,
} from '~/features/rtls/anchor-lock';
import { forgetRtlsDevices } from '~/features/rtls/forget-actions';
import {
  handleRtlsInformationMessage,
  handleRtlsLockMessage,
} from '~/features/rtls/handlers';
import {
  lockRtlsAnchors,
  unlockRtlsAnchors,
} from '~/features/rtls/lock-actions';
import { sendRtlsLock } from '~/features/rtls/messages';
import { setRtlsDeviceParameter } from '~/features/rtls/param-actions';
import {
  areRtlsAnchorsLocked,
  isRtlsAnchorLockRequired,
} from '~/features/rtls/selectors';
import {
  sleepAllRtlsAnchors,
  sleepRtlsAnchors,
  wakeRtlsAnchors,
} from '~/features/rtls/sleep-actions';
import reducer, {
  clearRtlsDevices,
  setRtlsAnchorLock,
  setRtlsDevicesFromStatus,
} from '~/features/rtls/slice';
import { showConfirmationDialog } from '~/features/prompt/actions';
import { showError } from '~/features/snackbar/actions';
import type UAVErrorCode from '~/flockwave/UAVErrorCode';
import type MessageHub from '~/flockwave/messages';
import messageHub from '~/message-hub';
import { UAVAge } from '~/model/uav';
import { type AppDispatch, type RootState } from '~/store/reducers';

const sendMessage = (
  messageHub as unknown as {
    sendMessage: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
  }
).sendMessage;
const confirm = showConfirmationDialog as unknown as jest.Mock<
  (...args: unknown[]) => { type: string; response: unknown }
>;

/** The server's X-RTLS-LOCK body of axio-server #63. */
const LOCKED_BODY = {
  type: 'X-RTLS-LOCK',
  action: 'lock',
  result: 'locked',
  warnings: [
    {
      code: 'low-battery',
      device: 205,
      detail: 'RTLS anchor A4: low battery (6.81 V)',
    },
  ],
  anchorLock: {
    locked: true,
    lockedAt: 1795290000.0,
    anchors: [201, 202],
    acknowledgedWarnings: [
      {
        code: 'low-battery',
        device: 205,
        detail: 'RTLS anchor A4: low battery (6.81 V)',
      },
    ],
    breaks: [],
  },
};

const BROKEN = {
  locked: true,
  lockedAt: 1795290000,
  acknowledgedWarnings: [],
  breaks: [
    {
      code: 'rebooted',
      device: 203,
      detail: 'RTLS anchor A2 rebooted',
      at: 1795290100.5,
    },
    { code: 'moved', device: null, detail: 'cell moved', at: 1795290200 },
  ],
};

type FakeUav = { id: string; age?: UAVAge; errors: UAVErrorCode[] };

const createStore = (uavs: FakeUav[] = []) => {
  const uavSlice = createSlice({
    name: 'uavs',
    initialState: {
      byId: Object.fromEntries(uavs.map((uav) => [uav.id, uav])),
      order: uavs.map((uav) => uav.id),
    },
    reducers: {},
  });
  // the prompt thunk is mocked as a plain action carrying its answer
  const promptAnswer =
    () =>
    (next: (action: unknown) => unknown) =>
    (action: unknown): unknown => {
      const { response } = (action ?? {}) as { response?: unknown };
      return response === undefined ? next(action) : Promise.resolve(response);
    };
  return configureStore({
    reducer: { rtls: reducer, uavs: uavSlice.reducer },
    middleware: (getDefault) => getDefault().prepend(promptAnswer),
  });
};
type Store = ReturnType<typeof createStore>;

const dispatchThunk = async (store: Store, thunk: unknown): Promise<unknown> =>
  (store.dispatch as unknown as (action: unknown) => Promise<unknown>)(thunk);

const state = (store: Store) => store.getState() as unknown as RootState;

const seedAnchorsAndTag = (store: Store) =>
  store.dispatch(
    setRtlsDevicesFromStatus({
      '101': { online: true, role: 'anchor-initiator' },
      '102': { online: true, role: 'anchor-responder' },
      '7': { online: true, role: 'tag', sleeping: false },
    })
  );

const lockStore = (store: Store) =>
  store.dispatch(setRtlsAnchorLock(mapAnchorLock(LOCKED_BODY.anchorLock)!));

const makeHub = (body: Record<string, unknown>) => {
  const sent: unknown[] = [];
  const hub = {
    sendMessage: jest.fn((request: unknown) => {
      sent.push(request);
      return Promise.resolve({ body });
    }),
  };
  return { hub: hub as unknown as MessageHub, sent };
};

describe('lock state mapping', () => {
  test('maps the server shape', () => {
    expect(mapAnchorLock(LOCKED_BODY.anchorLock)).toEqual({
      locked: true,
      lockedAt: 1795290000000,
      warnings: [
        {
          code: 'low-battery',
          device: '205',
          text: 'RTLS anchor A4: low battery (6.81 V)',
        },
      ],
      breaks: [],
    });
  });

  test('maps breaks with their time, and cell-wide ones without a device', () => {
    const lock = mapAnchorLock(BROKEN)!;
    expect(lock.breaks).toEqual([
      {
        reason: 'rebooted',
        device: '203',
        time: 1795290100500,
        text: 'RTLS anchor A2 rebooted',
      },
      {
        reason: 'moved',
        device: undefined,
        time: 1795290200000,
        text: 'cell moved',
      },
    ]);
    expect(isLockBroken(lock)).toBe(true);
    expect(getAnchorLockState(lock)).toBe('broken');
  });

  test('a server without the lock reports none', () => {
    expect(mapAnchorLock(undefined)).toBe(undefined);
    expect(mapAnchorLock({ breaks: [] })).toBe(undefined);
    expect(getAnchorLockState(undefined)).toBe('unsupported');
  });

  test('locked, unlocked', () => {
    expect(getAnchorLockState(mapAnchorLock(LOCKED_BODY.anchorLock))).toBe(
      'locked'
    );
    expect(getAnchorLockState(mapAnchorLock({ locked: false }))).toBe(
      'unlocked'
    );
  });
});

describe('X-RTLS-LOCK messages', () => {
  test('sends the request and reads the result', async () => {
    const { hub, sent } = makeHub(LOCKED_BODY);
    const result = await sendRtlsLock(hub, 'lock', {
      acknowledgeWarnings: true,
    });
    expect(sent[0]).toEqual({
      type: 'X-RTLS-LOCK',
      action: 'lock',
      acknowledgeWarnings: true,
    });
    expect(result.result).toBe('locked');
    expect(result.lock?.locked).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });

  test('a lock waiting for acknowledgement returns the warnings', async () => {
    const { hub } = makeHub({
      ...LOCKED_BODY,
      result: 'warnings',
      anchorLock: { locked: false, breaks: [] },
    });
    const result = await sendRtlsLock(hub, 'lock');
    expect(result.result).toBe('warnings');
    expect(result.lock?.locked).toBe(false);
    expect(result.warnings[0].code).toBe('low-battery');
  });

  test("a refusal rejects with the server's reason", async () => {
    const { hub } = makeHub({ type: 'ACK-NAK', reason: 'no RTLS extension' });
    await expect(sendRtlsLock(hub, 'unlock')).rejects.toThrow(
      'no RTLS extension'
    );
  });

  test('X-RTLS-INF and pushes carry the lock', () => {
    const dispatch = jest.fn();
    handleRtlsInformationMessage(
      { status: {}, anchorLock: BROKEN },
      dispatch as unknown as AppDispatch
    );
    expect(dispatch).toHaveBeenCalledWith(
      setRtlsAnchorLock(mapAnchorLock(BROKEN)!)
    );

    dispatch.mockClear();
    handleRtlsInformationMessage(
      { status: {} },
      dispatch as unknown as AppDispatch
    );
    // an older server without the lock leaves the stored state alone
    expect(dispatch).toHaveBeenCalledTimes(1);

    dispatch.mockClear();
    handleRtlsLockMessage(
      { type: 'X-RTLS-LOCK', anchorLock: { locked: false, breaks: [] } },
      dispatch as unknown as AppDispatch
    );
    expect(dispatch).toHaveBeenCalledWith(
      setRtlsAnchorLock({ locked: false, warnings: [], breaks: [] })
    );
  });

  test('the lock belongs to the server: dropped with the registry', () => {
    const store = createStore();
    lockStore(store);
    store.dispatch(clearRtlsDevices());
    expect(store.getState().rtls.anchorLock).toBe(undefined);
  });
});

describe('lock and unlock', () => {
  beforeEach(() => {
    confirm.mockReturnValue({
      type: 'test/prompt',
      response: { confirmed: true },
    });
  });

  test('locking stores the new state', async () => {
    const store = createStore();
    sendMessage.mockResolvedValueOnce({ body: LOCKED_BODY });
    await dispatchThunk(store, lockRtlsAnchors(true));
    expect(areRtlsAnchorsLocked(state(store))).toBe(true);
  });

  test('unlock asks plainly, then sends', async () => {
    const store = createStore();
    lockStore(store);
    sendMessage.mockResolvedValueOnce({
      body: {
        type: 'X-RTLS-LOCK',
        result: 'unlocked',
        warnings: [],
        anchorLock: { locked: false, breaks: [] },
      },
    });
    await dispatchThunk(store, unlockRtlsAnchors());
    expect(confirm.mock.calls[0][0]).toBe('rtlsAnchorLock.unlock.message');
    expect(sendMessage.mock.calls[0][0]).toEqual({
      type: 'X-RTLS-LOCK',
      action: 'unlock',
    });
    expect(areRtlsAnchorsLocked(state(store))).toBe(false);
  });

  test('unlock asks more strongly while a drone may be armed; no stops it', async () => {
    const store = createStore([{ id: 'd1', age: UAVAge.ACTIVE, errors: [] }]);
    lockStore(store);
    confirm.mockReturnValueOnce({
      type: 'test/prompt',
      response: { confirmed: false },
    });
    await dispatchThunk(store, unlockRtlsAnchors());
    expect(confirm.mock.calls[0]).toEqual([
      'rtlsAnchorLock.unlock.armedMessage',
      { title: 'rtlsAnchorLock.unlock.armedTitle' },
    ]);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(areRtlsAnchorsLocked(state(store))).toBe(true);
  });
});

describe('while the anchors are locked', () => {
  test('anchor sleep, wake and sleep all go nowhere', async () => {
    const store = createStore();
    seedAnchorsAndTag(store);
    lockStore(store);

    await dispatchThunk(store, sleepRtlsAnchors(['101']));
    await dispatchThunk(store, wakeRtlsAnchors(['101']));
    await dispatchThunk(store, sleepAllRtlsAnchors());

    expect(sendMessage).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith('rtlsAnchorLock.lockedTooltip');
  });

  test('anchor parameter writes are refused, tag ones are not', async () => {
    const store = createStore();
    seedAnchorsAndTag(store);
    lockStore(store);

    await expect(
      dispatchThunk(
        store,
        setRtlsDeviceParameter('102', 'UWB_CHANNEL', 9, 'uint8')
      )
    ).rejects.toThrow('rtlsAnchorLock.lockedTooltip');

    sendMessage.mockResolvedValueOnce({
      body: {
        type: 'X-RTLS-PARAM-SET',
        name: 'POS_DBG_HZ',
        value: 1,
        accepted: true,
      },
    });
    await dispatchThunk(
      store,
      setRtlsDeviceParameter('7', 'POS_DBG_HZ', 1, 'uint8')
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  test('forgetting an anchor is refused; a lost tag can be forgotten', async () => {
    const store = createStore();
    seedAnchorsAndTag(store);
    lockStore(store);

    await dispatchThunk(store, forgetRtlsDevices(['102']));
    expect(sendMessage).not.toHaveBeenCalled();

    sendMessage.mockResolvedValueOnce({
      body: { type: 'X-RTLS-FORGET', result: { '7': { forgotten: true } } },
    });
    await dispatchThunk(store, forgetRtlsDevices(['7']));
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe('show gating', () => {
  test('a show needs the lock only when the server has one and knows anchors', () => {
    const store = createStore();
    expect(isRtlsAnchorLockRequired(state(store))).toBe(false);

    store.dispatch(
      setRtlsAnchorLock({ locked: false, warnings: [], breaks: [] })
    );
    expect(isRtlsAnchorLockRequired(state(store))).toBe(false);

    seedAnchorsAndTag(store);
    expect(isRtlsAnchorLockRequired(state(store))).toBe(true);
  });
});
