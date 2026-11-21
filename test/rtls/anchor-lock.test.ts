import { beforeEach, describe, expect, jest, test } from '@jest/globals';

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
import { handleRtlsInformationMessage } from '~/features/rtls/handlers';
import { newestBreaksFirst } from '~/features/rtls/lock-text';
import {
  fetchRtlsLockStatus,
  lockRtlsAnchors,
  unlockRtlsAnchors,
} from '~/features/rtls/lock-actions';
import { sendRtlsLock } from '~/features/rtls/messages';
import { setRtlsDeviceParameter } from '~/features/rtls/param-actions';
import {
  areRtlsAnchorsLocked,
  getRtlsLockedOutDeviceIds,
  getRtlsShowGateRefusal,
  isRtlsAnchorLockRequired,
} from '~/features/rtls/selectors';
import {
  sleepAllRtlsAnchors,
  sleepRtlsAnchors,
  wakeAllRtlsDevices,
  wakeRtlsAnchors,
} from '~/features/rtls/sleep-actions';
import {
  clearRtlsDevices,
  openRtlsLockDialog,
  setRtlsAnchorLock,
  setRtlsDevicesFromStatus,
} from '~/features/rtls/slice';
import { showConfirmationDialog } from '~/features/prompt/actions';
import { showError } from '~/features/snackbar/actions';
import messageHub from '~/message-hub';
import { UAVAge } from '~/model/uav';
import { type AppDispatch } from '~/store/reducers';

import {
  answer,
  createRtlsTestStore,
  dispatchThunk,
  reply,
  rootStateOf,
  type RtlsTestStore,
} from './rtls-test-store';

// eslint-disable-next-line @typescript-eslint/unbound-method -- a jest mock, never called through `this`
const sendMessage = jest.mocked(messageHub.sendMessage);
const confirm = jest.mocked(showConfirmationDialog);

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

const createStore = createRtlsTestStore;
type Store = RtlsTestStore;
const state = rootStateOf;

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

describe('lock state mapping', () => {
  test('maps the server shape', () => {
    expect(mapAnchorLock(LOCKED_BODY.anchorLock)).toEqual({
      locked: true,
      lockedAt: 1795290000000,
      anchors: ['201', '202'],
      showGate: undefined,
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
        code: 'rebooted',
        device: '203',
        time: 1795290100500,
        text: 'RTLS anchor A2 rebooted',
      },
      {
        code: 'moved',
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
    sendMessage.mockResolvedValueOnce(reply(LOCKED_BODY));
    const result = await sendRtlsLock(messageHub, 'lock', {
      acknowledgeWarnings: true,
    });
    expect(sendMessage.mock.calls[0][0]).toEqual({
      type: 'X-RTLS-LOCK',
      action: 'lock',
      acknowledgeWarnings: true,
    });
    expect(result.result).toBe('locked');
    expect(result.lock?.locked).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });

  test('a lock waiting for acknowledgement returns the warnings', async () => {
    sendMessage.mockResolvedValueOnce(
      reply({
        ...LOCKED_BODY,
        result: 'warnings',
        anchorLock: { locked: false, breaks: [] },
      })
    );
    const result = await sendRtlsLock(messageHub, 'lock');
    expect(result.result).toBe('warnings');
    expect(result.lock?.locked).toBe(false);
    expect(result.warnings[0].code).toBe('low-battery');
  });

  test("a refusal rejects with the server's reason", async () => {
    sendMessage.mockResolvedValueOnce(
      reply({ type: 'ACK-NAK', reason: 'no RTLS extension' })
    );
    await expect(sendRtlsLock(messageHub, 'unlock')).rejects.toThrow(
      'no RTLS extension'
    );
  });

  test('X-RTLS-INF carries the lock', () => {
    const dispatch = jest.fn<AppDispatch>();
    handleRtlsInformationMessage({ status: {}, anchorLock: BROKEN }, dispatch);
    expect(dispatch).toHaveBeenCalledWith(
      setRtlsAnchorLock(mapAnchorLock(BROKEN)!)
    );

    dispatch.mockClear();
    handleRtlsInformationMessage({ status: {} }, dispatch);
    // an older server without the lock leaves the stored state alone
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  test('the lock belongs to the server: dropped with the registry', () => {
    const store = createStore();
    lockStore(store);
    store.dispatch(openRtlsLockDialog());
    store.dispatch(clearRtlsDevices());
    expect(store.getState().rtls.anchorLock).toBe(undefined);
    // a dialog about the old server must not act on the next one
    expect(store.getState().rtls.lockDialogOpen).toBe(false);
  });

  test('maps the show gate verdict', () => {
    expect(
      mapAnchorLock({
        locked: false,
        showGate: {
          required: true,
          refused: true,
          reason: 'the anchors are not locked',
        },
      })?.showGate
    ).toEqual({
      required: true,
      refused: true,
      reason: 'the anchors are not locked',
    });
  });

  test('status reads the current warnings without locking', async () => {
    const store = createStore();
    sendMessage.mockResolvedValueOnce(
      reply({ ...LOCKED_BODY, action: 'status', result: 'status' })
    );
    const result = await dispatchThunk(store, fetchRtlsLockStatus());
    expect(sendMessage.mock.calls[0][0]).toEqual({
      type: 'X-RTLS-LOCK',
      action: 'status',
    });
    expect(result.warnings[0].code).toBe('low-battery');
  });
});

describe('lock and unlock', () => {
  beforeEach(() => {
    confirm.mockReturnValue(answer(true));
  });

  test('locking stores the new state', async () => {
    const store = createStore();
    sendMessage.mockResolvedValueOnce(reply(LOCKED_BODY));
    await dispatchThunk(store, lockRtlsAnchors(true));
    expect(areRtlsAnchorsLocked(state(store))).toBe(true);
  });

  test('unlock asks plainly, then sends', async () => {
    const store = createStore();
    lockStore(store);
    sendMessage.mockResolvedValueOnce(
      reply({
        type: 'X-RTLS-LOCK',
        result: 'unlocked',
        warnings: [],
        anchorLock: { locked: false, breaks: [] },
      })
    );
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
    confirm.mockReturnValueOnce(answer(false));
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

    sendMessage.mockResolvedValueOnce(
      reply({
        type: 'X-RTLS-PARAM-SET',
        name: 'POS_DBG_HZ',
        value: 1,
        accepted: true,
      })
    );
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

    sendMessage.mockResolvedValueOnce(
      reply({ type: 'X-RTLS-FORGET', result: { '7': { forgotten: true } } })
    );
    await dispatchThunk(store, forgetRtlsDevices(['7']));
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe('show gating', () => {
  test('only the server verdict requires a lock', () => {
    const store = createStore();
    expect(isRtlsAnchorLockRequired(state(store))).toBe(false);

    // a lock without a verdict, even with anchors known, requires nothing
    seedAnchorsAndTag(store);
    store.dispatch(setRtlsAnchorLock(mapAnchorLock({ locked: false })!));
    expect(isRtlsAnchorLockRequired(state(store))).toBe(false);
  });
});

describe('sealed anchors', () => {
  test('a sealed id is locked out before its role arrives', () => {
    const store = createStore();
    store.dispatch(
      setRtlsDevicesFromStatus({
        '201': { online: true },
        '7': { online: true, role: 'tag', sleeping: true },
      })
    );
    lockStore(store);
    const lockedOut = getRtlsLockedOutDeviceIds(state(store));
    expect(lockedOut.has('201')).toBe(true);
    expect(lockedOut.has('7')).toBe(false);
  });

  test("the tags' Wake all leaves a sealed id out", async () => {
    const store = createStore();
    store.dispatch(
      setRtlsDevicesFromStatus({
        '201': { online: true },
        '7': { online: true, role: 'tag', sleeping: true },
      })
    );
    lockStore(store);
    sendMessage.mockResolvedValueOnce(
      reply({
        type: 'X-RTLS-SLEEP',
        result: { '7': { accepted: true, sleeping: false } },
      })
    );
    await dispatchThunk(store, wakeAllRtlsDevices());
    expect(sendMessage.mock.calls[0][0]).toEqual({
      type: 'X-RTLS-SLEEP',
      ids: [7],
      sleeping: false,
    });
  });

  test('a sealed id takes no parameter write', async () => {
    const store = createStore();
    store.dispatch(setRtlsDevicesFromStatus({ '201': { online: true } }));
    lockStore(store);
    await expect(
      dispatchThunk(
        store,
        setRtlsDeviceParameter('201', 'UWB_CHANNEL', 9, 'uint8')
      )
    ).rejects.toThrow('rtlsAnchorLock.lockedTooltip');
  });

  test('a lock taken while the sleep prompt was open stops the sleep', async () => {
    const store = createStore();
    seedAnchorsAndTag(store);
    confirm.mockReturnValueOnce(() => {
      // another client locks the anchors while the operator reads
      lockStore(store);
      return Promise.resolve({ confirmed: true });
    });
    await dispatchThunk(store, sleepRtlsAnchors(['101']));
    expect(sendMessage).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith('rtlsAnchorLock.lockedTooltip');
  });
});

describe("the server's show-gate verdict", () => {
  const withGate = (showGate: Record<string, unknown> | undefined) => {
    const store = createStore();
    seedAnchorsAndTag(store);
    store.dispatch(
      setRtlsAnchorLock(mapAnchorLock({ locked: false, showGate })!)
    );
    return state(store);
  };

  test('a refusal carries the server reason', () => {
    const root = withGate({
      required: true,
      refused: true,
      reason: 'the anchors are not locked',
    });
    expect(isRtlsAnchorLockRequired(root)).toBe(true);
    expect(getRtlsShowGateRefusal(root)).toEqual({
      required: true,
      refused: true,
      reason: 'the anchors are not locked',
    });
  });

  test('a gate the server turned off requires nothing', () => {
    const root = withGate({ required: false, refused: false });
    expect(isRtlsAnchorLockRequired(root)).toBe(false);
    expect(getRtlsShowGateRefusal(root)).toBe(undefined);
  });
});

describe('breaks for display', () => {
  test('newest first (the server appends them)', () => {
    const lock = mapAnchorLock(BROKEN)!;
    expect(newestBreaksFirst(lock.breaks).map((entry) => entry.code)).toEqual([
      'moved',
      'rebooted',
    ]);
  });
});
