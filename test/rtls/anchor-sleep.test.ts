import { beforeEach, describe, expect, jest, test } from '@jest/globals';

// Same thin mocks as sleep-actions.test.ts: the message hub and the snackbar
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

import { showConfirmationDialog } from '~/features/prompt/actions';
import { showError, showNotification } from '~/features/snackbar/actions';
import UAVErrorCode from '~/flockwave/UAVErrorCode';
import { setRtlsDeviceParameter } from '~/features/rtls/param-actions';
import {
  ANCHOR_REBOOT_WINDOW_MS,
  isAnchorSwitching,
} from '~/features/rtls/anchor-utils';
import { setRtlsSleeping } from '~/features/rtls/sleep-actions';
import {
  setRtlsDevicesFromStatus,
  updateRtlsStats,
} from '~/features/rtls/slice';
import { type RtlsDeviceStats } from '~/features/rtls/types';
import messageHub from '~/message-hub';
import { UAVAge } from '~/model/uav';

import {
  answer,
  createRtlsTestStore,
  dispatchThunk,
  reply,
  type RtlsTestStore,
} from './rtls-test-store';

// eslint-disable-next-line @typescript-eslint/unbound-method -- a jest mock, never called through `this`
const sendMessage = jest.mocked(messageHub.sendMessage);
const confirm = jest.mocked(showConfirmationDialog);

const createStore = createRtlsTestStore;
type Store = RtlsTestStore;

const seedAnchors = (
  store: Store,
  powerStates: Record<string, RtlsDeviceStats['powerState']>
) => {
  store.dispatch(
    setRtlsDevicesFromStatus(
      Object.fromEntries(
        Object.keys(powerStates).map((id) => [
          id,
          { online: true, role: 'anchor-responder' },
        ])
      )
    )
  );
  store.dispatch(
    updateRtlsStats({
      byId: Object.fromEntries(
        Object.entries(powerStates).map(([id, powerState]) => [
          id,
          { id, powerState },
        ])
      ),
    })
  );
};

// an anchor's answer is its ack: `sleeping` is null, powerState says the rest
const acceptAll = (ids: string[], sleeping: boolean) =>
  sendMessage.mockResolvedValueOnce(
    reply({
      type: 'X-RTLS-SLEEP',
      result: Object.fromEntries(
        ids.map((id) => [
          id,
          { requested: sleeping, accepted: true, sleeping: null },
        ])
      ),
    })
  );

describe('anchor sleep and wake', () => {
  beforeEach(() => {
    // the operator says yes unless a test says otherwise
    confirm.mockReturnValue(answer(true));
  });

  test('always asks, plainly while every drone is disarmed', async () => {
    const store = createStore([
      { id: 'd1', age: UAVAge.ACTIVE, armed: false, errors: [] },
      { id: 'd2', age: UAVAge.GONE, errors: [] },
    ]);
    seedAnchors(store, { '101': 'operating' });
    acceptAll(['101'], true);

    await dispatchThunk(store, setRtlsSleeping(['101'], true));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]).toEqual([
      'rtlsAnchor.sleep.confirm.message',
      { title: 'rtlsAnchor.sleep.confirm.title' },
    ]);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]).toEqual([
      { type: 'X-RTLS-SLEEP', ids: [101], sleeping: true },
      { timeout: 30 },
    ]);
  });

  test('asks for a device whose role is unknown: it may be an anchor', async () => {
    const store = createStore([]);
    store.dispatch(setRtlsDevicesFromStatus({ '101': { online: true } }));
    acceptAll(['101'], true);

    await dispatchThunk(store, setRtlsSleeping(['101'], true));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  test('asks more strongly while a drone may be armed, and stops on a no', async () => {
    const store = createStore([{ id: 'd1', age: UAVAge.ACTIVE, errors: [] }]);
    seedAnchors(store, { '101': 'operating' });
    confirm.mockReturnValueOnce(answer(false));

    await dispatchThunk(store, setRtlsSleeping(['101'], true));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]).toEqual([
      'rtlsAnchor.sleep.confirm.armedMessage',
      { title: 'rtlsAnchor.sleep.confirm.title' },
    ]);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('proceeds after a yes', async () => {
    const store = createStore([{ id: 'd1', age: UAVAge.ACTIVE, errors: [] }]);
    seedAnchors(store, { '101': 'operating' });
    acceptAll(['101'], true);

    await dispatchThunk(store, setRtlsSleeping(['101'], true));

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  test('the safety switch (DISARMED) is not a disarmed drone', async () => {
    const store = createStore([
      {
        id: 'd1',
        age: UAVAge.ACTIVE,
        armed: true,
        errors: [UAVErrorCode.DISARMED],
      },
    ]);
    seedAnchors(store, { '101': 'operating' });
    confirm.mockReturnValueOnce(answer(false));

    await dispatchThunk(store, setRtlsSleeping(['101'], true));

    expect(confirm.mock.calls[0][0]).toBe(
      'rtlsAnchor.sleep.confirm.armedMessage'
    );
  });

  test('a sleeping drone does not count as armed', async () => {
    const store = createStore([
      { id: 'd1', age: UAVAge.ACTIVE, errors: [UAVErrorCode.SLEEPING] },
    ]);
    seedAnchors(store, { '101': 'operating' });
    acceptAll(['101'], true);

    await dispatchThunk(store, setRtlsSleeping(['101'], true));

    expect(confirm.mock.calls[0][0]).toBe('rtlsAnchor.sleep.confirm.message');
  });

  test('an accepted anchor has no transaction; its powerState stays the state', async () => {
    const store = createStore();
    seedAnchors(store, { '101': 'operating' });
    acceptAll(['101'], true);

    const before = Date.now();
    await dispatchThunk(store, setRtlsSleeping(['101'], true));

    const { rtls } = store.getState();
    expect(sendMessage).toHaveBeenCalledTimes(1); // no INF re-poll
    expect(rtls.sleepPending).toEqual({});
    expect(rtls.devices.byId['101'].sleeping).not.toBe(true);
    expect(rtls.anchorPowerRequests['101']).toBeGreaterThanOrEqual(before);
    expect(showNotification).toHaveBeenCalledWith(
      'RTLS device 101: sleep accepted'
    );
  });

  test('a refusal is reported per anchor and records no request', async () => {
    const store = createStore();
    seedAnchors(store, { '101': 'operating', '102': 'operating' });
    sendMessage.mockResolvedValueOnce(
      reply({
        type: 'X-RTLS-SLEEP',
        result: {
          '101': { requested: true, accepted: true, sleeping: null },
          '102': {
            requested: true,
            accepted: false,
            sleeping: null,
            detail: 'RTLS anchor 102 is locked',
          },
        },
      })
    );

    await dispatchThunk(store, setRtlsSleeping(['101', '102'], true));

    expect(showError).toHaveBeenCalledWith(
      'RTLS sleep refused — 102: RTLS anchor 102 is locked (accepted: 101)'
    );
    expect(Object.keys(store.getState().rtls.anchorPowerRequests)).toEqual([
      '101',
    ]);
  });

  test('a second request is sent while the first anchor is switching', async () => {
    const store = createStore();
    seedAnchors(store, { '101': 'asleep' });
    acceptAll(['101'], false);
    acceptAll(['101'], false);

    await dispatchThunk(store, setRtlsSleeping(['101'], false));
    await dispatchThunk(store, setRtlsSleeping(['101'], false));

    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  test('sleep all asks too, and a no stops it', async () => {
    const store = createStore();
    seedAnchors(store, { '101': 'operating' });
    confirm.mockReturnValueOnce(answer(false));

    await dispatchThunk(store, setRtlsSleeping('anchors', true));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('sleep all skips anchors already asleep or off, and tags', async () => {
    const store = createStore();
    seedAnchors(store, {
      '101': 'operating',
      '102': 'asleep',
      '103': 'off',
      '104': 'standby',
    });
    store.dispatch(
      setRtlsDevicesFromStatus({
        ...Object.fromEntries(
          ['101', '102', '103', '104'].map((id) => [
            id,
            { online: true, role: 'anchor-responder' },
          ])
        ),
        '7': { online: true, role: 'tag', sleeping: false },
      })
    );
    acceptAll(['101', '104'], true);

    await dispatchThunk(store, setRtlsSleeping('anchors', true));

    expect(sendMessage.mock.calls[0][0]).toEqual({
      type: 'X-RTLS-SLEEP',
      ids: [101, 104],
      sleeping: true,
    });
  });

  test('wake all skips operating anchors and those off (button start only)', async () => {
    const store = createStore();
    seedAnchors(store, {
      '101': 'operating',
      '102': 'asleep',
      '103': 'off',
      '104': 'standby',
    });
    acceptAll(['102', '104'], false);

    await dispatchThunk(store, setRtlsSleeping('anchors', false));

    expect(sendMessage.mock.calls[0][0]).toEqual({
      type: 'X-RTLS-SLEEP',
      ids: [102, 104],
      sleeping: false,
    });
  });

  test('says so when there is nothing to wake', async () => {
    const store = createStore();
    seedAnchors(store, { '101': 'operating' });

    await dispatchThunk(store, setRtlsSleeping('anchors', false));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(showNotification).toHaveBeenCalledWith(
      'rtlsDevice.bulk.noAnchorsToWake'
    );
  });
});

describe('an anchor rebooting into an accepted state', () => {
  const anchor = (online: boolean) => ({
    id: '101',
    online,
    role: 'anchor-responder',
  });

  test('reads as switching while it is off the network', () => {
    expect(isAnchorSwitching(anchor(false), 1000, 1000 + 15_000)).toBe(true);
  });

  test('reads as lost once the reboot window has passed', () => {
    expect(
      isAnchorSwitching(anchor(false), 1000, 1000 + ANCHOR_REBOOT_WINDOW_MS)
    ).toBe(false);
  });

  test('reads its powerState while online, and lost without a request', () => {
    expect(isAnchorSwitching(anchor(true), 1000, 2000)).toBe(false);
    expect(isAnchorSwitching(anchor(false), undefined, 2000)).toBe(false);
  });
});

describe('the switching hint', () => {
  test('ends at the first new powerState, not at stopping', async () => {
    const store = createStore();
    seedAnchors(store, { '101': 'operating', '102': 'standby' });
    acceptAll(['101', '102'], true);

    await dispatchThunk(store, setRtlsSleeping(['101', '102'], true));
    store.dispatch(
      updateRtlsStats({
        byId: {
          '101': { id: '101', powerState: 'stopping' },
          '102': { id: '102', powerState: 'asleep' },
        },
      })
    );

    // 101 reboots next; 102 fell asleep in place, so a later disconnect is
    // a real one
    expect(Object.keys(store.getState().rtls.anchorPowerRequests)).toEqual([
      '101',
    ]);

    store.dispatch(
      updateRtlsStats({ byId: { '101': { id: '101', powerState: 'asleep' } } })
    );
    expect(store.getState().rtls.anchorPowerRequests).toEqual({});
  });
});

describe('SLEEP from the parameter dialog', () => {
  test('is never written: sleep and wake go through the row buttons', async () => {
    const store = createStore();
    for (const value of [0, 1, 2, 3]) {
      await expect(
        dispatchThunk(
          store,
          setRtlsDeviceParameter('101', 'SLEEP', value, 'uint8')
        )
      ).rejects.toThrow('rtlsParams.sleepReadOnly');
    }
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('other parameters still go out', async () => {
    const store = createStore();
    sendMessage.mockResolvedValueOnce(
      reply({
        type: 'X-RTLS-PARAM-SET',
        name: 'POS_YAW_DEG',
        value: 1,
        accepted: true,
      })
    );
    await dispatchThunk(
      store,
      setRtlsDeviceParameter('101', 'POS_YAW_DEG', 1, 'real32')
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
