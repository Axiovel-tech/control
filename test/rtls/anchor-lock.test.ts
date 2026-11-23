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
  sendRtlsLockCommand,
  unlockRtlsAnchors,
} from '~/features/rtls/anchor-lock';
import {
  mapAnchorLock,
  rtlsInformationActions,
} from '~/features/rtls/handlers';
import { setRtlsDeviceParameter } from '~/features/rtls/param-actions';
import { getRtlsParamGroup } from '~/features/rtls/param-grouping';
import { getRtlsParamMetadata } from '~/features/rtls/param-metadata';
import {
  getRtlsLockedOutDeviceIds,
  isRtlsAnchorLockRequired,
  isRtlsShowGateRefused,
} from '~/features/rtls/selectors';
import { setRtlsSleeping } from '~/features/rtls/sleep-actions';
import {
  clearRtlsDevices,
  openRtlsLockDialog,
  setRtlsAnchorLock,
  setRtlsDevicesFromStatus,
  updateRtlsStats,
} from '~/features/rtls/slice';
import { showConfirmationDialog } from '~/features/prompt/actions';
import { showError, showNotification } from '~/features/snackbar/actions';
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
  showGate: { required: true, refused: false },
};

const createStore = createRtlsTestStore;
type Store = RtlsTestStore;
const state = rootStateOf;

const seedAnchorsAndTag = (store: Store) =>
  store.dispatch(
    setRtlsDevicesFromStatus({
      '101': {
        online: true,
        role: 'anchor-initiator',
        name: 'RTLS anchor A0',
      },
      '102': {
        online: true,
        role: 'anchor-responder',
        name: 'RTLS anchor A1',
      },
      '7': { online: true, role: 'tag', sleeping: false },
    })
  );

/** Every anchor reports its firmware lock on, and the server says so. */
const lockStore = (store: Store) => {
  store.dispatch(setRtlsAnchorLock(mapAnchorLock(LOCKED)!));
  store.dispatch(
    updateRtlsStats({
      byId: {
        '101': { id: '101', locked: true },
        '102': { id: '102', locked: true },
      },
    })
  );
};

/** The server answers the next X-RTLS-LOCK with this body. */
const answerLock = (body: Record<string, unknown>) =>
  sendMessage.mockResolvedValueOnce(
    reply({ type: 'X-RTLS-LOCK', warnings: [], ...body })
  );

describe('the lock state comes from X-RTLS-INF', () => {
  test('maps the server shape; an older server leaves it alone', () => {
    expect(
      rtlsInformationActions({
        status: {},
        anchorLock: {
          ...LOCKED,
          locked: false,
          lockedCount: 7,
          anchorCount: 8,
          showGate: { required: true, refused: true, reason: 'not locked' },
        },
      }).at(-1)
    ).toEqual(
      setRtlsAnchorLock({
        locked: false,
        lockedCount: 7,
        anchorCount: 8,
        showGate: { required: true, refused: true },
      })
    );
    expect(rtlsInformationActions({ status: {} })).toHaveLength(1);
    expect(mapAnchorLock({ lockedCount: 1 })).toBe(undefined);
  });

  test('dropped with the registry, with its dialog', () => {
    const store = createStore();
    lockStore(store);
    store.dispatch(openRtlsLockDialog());
    store.dispatch(clearRtlsDevices());
    expect(state(store).rtls.anchorLock).toBe(undefined);
    expect(state(store).rtls.lockDialogOpen).toBe(false);
  });
});

describe('the lock command', () => {
  beforeEach(() => {
    confirm.mockReturnValue(answer(true));
  });

  test('a lock is announced; the header waits for the reported state', async () => {
    const store = createStore();
    answerLock({ result: 'locked', anchorLock: LOCKED });
    const result = await dispatchThunk(
      store,
      sendRtlsLockCommand('lock', true)
    );
    expect(sendMessage.mock.calls[0]).toEqual([
      {
        type: 'X-RTLS-LOCK',
        action: 'lock',
        acknowledgeWarnings: true,
      },
      // longer than the server's 5 s per anchor + 1 s grace
      { timeout: 15 },
    ]);
    expect(result).toMatchObject({ result: 'locked', error: undefined });
    expect(showNotification).toHaveBeenCalledWith(
      'rtlsAnchorLock.notification.locked'
    );
    expect(state(store).rtls.anchorLock).toBe(undefined);
  });

  test('a lock from an attempt no longer on screen is not announced', async () => {
    answerLock({ result: 'locked' });
    const result = await dispatchThunk(
      createStore(),
      sendRtlsLockCommand('lock', true, () => false)
    );
    expect(result.result).toBe('locked');
    expect(showNotification).not.toHaveBeenCalled();
  });

  test('warnings come back as sent, with nothing announced', async () => {
    answerLock({
      result: 'warnings',
      warnings: [
        {
          code: 'not-operating',
          device: 203,
          detail: 'RTLS anchor A2 is asleep',
        },
      ],
    });
    const result = await dispatchThunk(
      createStore(),
      sendRtlsLockCommand('lock', false)
    );
    expect(result.result).toBe('warnings');
    expect(result.warnings).toEqual(['RTLS anchor A2 is asleep']);
    expect(showNotification).not.toHaveBeenCalled();
  });

  test('a hard refusal carries the reason', async () => {
    answerLock({
      result: 'refused',
      reason: 'RTLS anchor A2 is asleep; wake it first',
    });
    const result = await dispatchThunk(
      createStore(),
      sendRtlsLockCommand('lock', true)
    );
    expect(result.error).toBe('RTLS anchor A2 is asleep; wake it first');
  });

  test('a partial lock names the anchors that did not take it', async () => {
    const store = createStore();
    seedAnchorsAndTag(store);
    answerLock({
      result: 'incomplete',
      reason: null,
      results: {
        '101': { accepted: false, detail: 'no answer' },
        '102': { accepted: false, detail: 'RTLS anchor A1 refused LOCK=1' },
        '103': { accepted: true },
      },
    });
    const result = await dispatchThunk(
      store,
      sendRtlsLockCommand('lock', true)
    );
    expect(result.error).toBe(
      'RTLS anchor A0: no answer; RTLS anchor A1 refused LOCK=1'
    );
    expect(showNotification).not.toHaveBeenCalled();
  });

  test("a NAK rejects with the server's reason", async () => {
    sendMessage.mockResolvedValueOnce(
      reply({ type: 'ACK-NAK', reason: 'no RTLS extension' })
    );
    await expect(
      dispatchThunk(createStore(), sendRtlsLockCommand('lock', false))
    ).rejects.toThrow('no RTLS extension');
  });

  test('unlock asks in one line, then sends', async () => {
    const store = createStore();
    lockStore(store);
    answerLock({ result: 'unlocked' });
    await dispatchThunk(store, unlockRtlsAnchors());
    expect(confirm.mock.calls[0]).toEqual(['rtlsAnchorLock.unlock.message']);
    expect(sendMessage.mock.calls[0][0]).toEqual({
      type: 'X-RTLS-LOCK',
      action: 'unlock',
    });
    expect(showNotification).toHaveBeenCalledWith(
      'rtlsAnchorLock.notification.unlocked'
    );
  });

  test('unlock asks more strongly while a drone may be armed; no stops it', async () => {
    const store = createStore([{ id: 'd1', age: UAVAge.ACTIVE, errors: [] }]);
    lockStore(store);
    confirm.mockReturnValueOnce(answer(false));
    await dispatchThunk(store, unlockRtlsAnchors());
    expect(confirm.mock.calls[0]).toEqual([
      'rtlsAnchorLock.unlock.armedMessage',
    ]);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('an unlock that reaches no anchor is reported, not announced', async () => {
    const store = createStore();
    lockStore(store);
    answerLock({ result: 'incomplete', reason: 'No online anchors' });
    await dispatchThunk(store, unlockRtlsAnchors());
    expect(showError).toHaveBeenCalledWith('No online anchors');
    expect(showNotification).not.toHaveBeenCalled();
  });
});

describe('locked anchors', () => {
  test('only fresh lock stats freeze an anchor', () => {
    const store = createStore();
    seedAnchorsAndTag(store);
    store.dispatch(
      updateRtlsStats({
        byId: {
          '101': { id: '101', locked: true, stale: true },
          '102': { id: '102', locked: true },
        },
      })
    );
    expect([...getRtlsLockedOutDeviceIds(state(store))]).toEqual(['102']);
  });

  test('a lock taken while the sleep prompt was open stops the sleep', async () => {
    const store = createStore();
    seedAnchorsAndTag(store);
    confirm.mockReturnValueOnce(() => {
      // another client locks the anchors while the operator reads
      lockStore(store);
      return Promise.resolve({ confirmed: true });
    });
    await dispatchThunk(store, setRtlsSleeping(['101'], true));
    expect(sendMessage).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith('rtlsAnchorLock.locked');
  });
});

describe("the server's show-gate verdict", () => {
  const withGate = (showGate: Record<string, unknown> | undefined) => {
    const store = createStore();
    store.dispatch(
      setRtlsAnchorLock(mapAnchorLock({ locked: false, showGate })!)
    );
    return state(store);
  };

  test('a refusal while the lock is required', () => {
    const root = withGate({ required: true, refused: true });
    expect(isRtlsAnchorLockRequired(root)).toBe(true);
    expect(isRtlsShowGateRefused(root)).toBe(true);
  });

  test('a gate the server turned off requires nothing', () => {
    const root = withGate({ required: false, refused: false });
    expect(isRtlsAnchorLockRequired(root)).toBe(false);
    expect(isRtlsShowGateRefused(root)).toBe(false);
    expect(isRtlsAnchorLockRequired(withGate(undefined))).toBe(false);
  });
});

describe('the LOCK parameter', () => {
  test('is never written from the parameter dialog', async () => {
    const store = createStore();
    seedAnchorsAndTag(store);
    await expect(
      dispatchThunk(store, setRtlsDeviceParameter('101', 'LOCK', 1, 'uint8'))
    ).rejects.toThrow('rtlsParams.lockReadOnly');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('is described and filed under Power', () => {
    expect(getRtlsParamMetadata('LOCK')?.description).toBe(
      "Anchor lock: use the panel's Lock/Unlock"
    );
    expect(getRtlsParamGroup('LOCK')).toBe('PWR');
  });
});
