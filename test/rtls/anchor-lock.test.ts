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

import { getAnchorLockState, mapAnchorLock } from '~/features/rtls/anchor-lock';
import { forgetRtlsDevices } from '~/features/rtls/forget-actions';
import { rtlsInformationActions } from '~/features/rtls/handlers';
import {
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
  wakeRtlsAnchors,
} from '~/features/rtls/sleep-actions';
import {
  clearRtlsDevices,
  openRtlsLockDialog,
  setRtlsAnchorLock,
  setRtlsDevicesFromStatus,
  updateRtlsStats,
} from '~/features/rtls/slice';
import { showConfirmationDialog } from '~/features/prompt/actions';
import { showError } from '~/features/snackbar/actions';
import messageHub from '~/message-hub';
import { UAVAge } from '~/model/uav';

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

/** `anchorLock` with every online anchor locked. */
const LOCKED = {
  locked: true,
  lockedCount: 2,
  anchorCount: 2,
  unlocked: [],
  showGate: { required: true, refused: false, reason: null },
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
  store.dispatch(setRtlsAnchorLock(mapAnchorLock(LOCKED)!));

describe('lock state mapping', () => {
  test('maps the server shape', () => {
    expect(
      mapAnchorLock({
        locked: false,
        lockedCount: 7,
        anchorCount: 8,
        unlocked: [204],
        showGate: {
          required: true,
          refused: true,
          reason: 'the anchors are not locked',
        },
      })
    ).toEqual({
      locked: false,
      lockedCount: 7,
      anchorCount: 8,
      unlocked: ['204'],
      showGate: {
        required: true,
        refused: true,
        reason: 'the anchors are not locked',
      },
    });
  });

  test('a server without the lock reports none', () => {
    expect(mapAnchorLock(undefined)).toBe(undefined);
    expect(mapAnchorLock({ lockedCount: 1 })).toBe(undefined);
    expect(getAnchorLockState(undefined)).toBe('unsupported');
  });

  test('locked, not locked', () => {
    expect(getAnchorLockState(mapAnchorLock(LOCKED))).toBe('locked');
    expect(getAnchorLockState(mapAnchorLock({ locked: false }))).toBe(
      'unlocked'
    );
  });

  test('X-RTLS-INF carries the lock; an older server leaves it alone', () => {
    expect(
      rtlsInformationActions({ status: {}, anchorLock: LOCKED }).at(-1)
    ).toEqual(setRtlsAnchorLock(mapAnchorLock(LOCKED)!));
    expect(rtlsInformationActions({ status: {} })).toHaveLength(1);
  });

  test('the lock belongs to the server: dropped with the registry', () => {
    const store = createStore();
    lockStore(store);
    store.dispatch(openRtlsLockDialog());
    store.dispatch(clearRtlsDevices());
    expect(store.getState().rtls.anchorLock).toBe(undefined);
    expect(store.getState().rtls.lockDialogOpen).toBe(false);
  });
});

describe('X-RTLS-LOCK messages', () => {
  test('sends the request and reads the result', async () => {
    sendMessage.mockResolvedValueOnce(
      reply({
        type: 'X-RTLS-LOCK',
        action: 'lock',
        result: 'locked',
        warnings: [],
        anchorLock: LOCKED,
      })
    );
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
  });

  test('a lock waiting for acknowledgement returns the warnings as sent', async () => {
    sendMessage.mockResolvedValueOnce(
      reply({
        type: 'X-RTLS-LOCK',
        result: 'warnings',
        warnings: [
          {
            code: 'not-operating',
            device: 203,
            detail: 'RTLS anchor A2 is asleep',
          },
        ],
      })
    );
    const result = await sendRtlsLock(messageHub, 'lock');
    expect(result.result).toBe('warnings');
    // an unknown code still shows the server's detail as is
    expect(result.warnings).toEqual([
      {
        code: 'not-operating',
        device: '203',
        text: 'RTLS anchor A2 is asleep',
      },
    ]);
  });

  test('a hard refusal carries the reason', async () => {
    sendMessage.mockResolvedValueOnce(
      reply({
        type: 'X-RTLS-LOCK',
        result: 'refused',
        reason: 'RTLS anchor A2 is asleep; wake it first',
      })
    );
    const result = await sendRtlsLock(messageHub, 'lock');
    expect(result).toMatchObject({
      result: 'refused',
      reason: 'RTLS anchor A2 is asleep; wake it first',
    });
  });

  test("a NAK rejects with the server's reason", async () => {
    sendMessage.mockResolvedValueOnce(
      reply({ type: 'ACK-NAK', reason: 'no RTLS extension' })
    );
    await expect(sendRtlsLock(messageHub, 'unlock')).rejects.toThrow(
      'no RTLS extension'
    );
  });
});

describe('lock and unlock', () => {
  beforeEach(() => {
    confirm.mockReturnValue(answer(true));
  });

  test('locking stores the new state', async () => {
    const store = createStore();
    sendMessage.mockResolvedValueOnce(
      reply({
        type: 'X-RTLS-LOCK',
        result: 'locked',
        warnings: [],
        anchorLock: LOCKED,
      })
    );
    await dispatchThunk(store, lockRtlsAnchors(true));
    expect(areRtlsAnchorsLocked(state(store))).toBe(true);
  });

  test('unlock asks in one line, then sends', async () => {
    const store = createStore();
    lockStore(store);
    sendMessage.mockResolvedValueOnce(
      reply({
        type: 'X-RTLS-LOCK',
        result: 'unlocked',
        warnings: [],
        anchorLock: { ...LOCKED, locked: false, lockedCount: 0 },
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
    expect(showError).toHaveBeenCalledWith('rtlsAnchorLock.locked');
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
    ).rejects.toThrow('rtlsAnchorLock.locked');

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

  test('an anchor whose own lock is on is frozen in a partly locked cell', () => {
    const store = createStore();
    seedAnchorsAndTag(store);
    store.dispatch(
      setRtlsAnchorLock(
        mapAnchorLock({
          locked: false,
          lockedCount: 1,
          anchorCount: 2,
          unlocked: [101],
        })!
      )
    );
    store.dispatch(
      updateRtlsStats({ byId: { '102': { id: '102', locked: true } } })
    );
    const lockedOut = getRtlsLockedOutDeviceIds(state(store));
    expect([...lockedOut]).toEqual(['102']);
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
    expect(showError).toHaveBeenCalledWith('rtlsAnchorLock.locked');
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

  test('no verdict, no requirement', () => {
    expect(isRtlsAnchorLockRequired(withGate(undefined))).toBe(false);
  });
});
