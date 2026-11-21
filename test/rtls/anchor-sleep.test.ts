import { describe, expect, jest, test } from '@jest/globals';
import { configureStore, createSlice } from '@reduxjs/toolkit';

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
import { showNotification } from '~/features/snackbar/actions';
import UAVErrorCode from '~/flockwave/UAVErrorCode';
import { setRtlsDeviceParameter } from '~/features/rtls/param-actions';
import {
  ANCHOR_SLEEP_TIMEOUT_S,
  sleepAllRtlsAnchors,
  sleepRtlsAnchors,
  wakeAllRtlsAnchors,
} from '~/features/rtls/sleep-actions';
import reducer, {
  setRtlsDevicesFromStatus,
  updateRtlsStats,
} from '~/features/rtls/slice';
import { type RtlsDeviceStats } from '~/features/rtls/types';
import messageHub from '~/message-hub';
import { UAVAge } from '~/model/uav';

const sendMessage = (
  messageHub as unknown as {
    sendMessage: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
  }
).sendMessage;
const confirm = showConfirmationDialog as unknown as jest.Mock<
  (...args: unknown[]) => { type: string; response: unknown }
>;

type FakeUav = { id: string; age?: UAVAge; errors: UAVErrorCode[] };

/** A store with the RTLS slice and just enough of the UAV registry. */
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

const acceptAll = (ids: string[], sleeping: boolean) =>
  sendMessage.mockResolvedValueOnce({
    body: {
      type: 'X-RTLS-SLEEP',
      result: Object.fromEntries(
        ids.map((id) => [id, { accepted: true, sleeping }])
      ),
    },
  });

describe('anchor sleep and wake', () => {
  test('sleeps without asking while every drone is disarmed', async () => {
    const store = createStore([
      { id: 'd1', age: UAVAge.ACTIVE, errors: [UAVErrorCode.DISARMED] },
      { id: 'd2', age: UAVAge.GONE, errors: [] },
    ]);
    seedAnchors(store, { '101': 'operating' });
    acceptAll(['101'], true);

    await dispatchThunk(store, sleepRtlsAnchors(['101']));

    expect(confirm).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]).toEqual([
      { type: 'X-RTLS-SLEEP', ids: [101], sleeping: true },
      { timeout: ANCHOR_SLEEP_TIMEOUT_S },
    ]);
    // the anchor reboots: no immediate INF re-poll of the stale latch
    expect(store.getState().rtls.devices.byId['101'].sleeping).toBe(true);
  });

  test('asks first while a drone may be armed, and stops on a no', async () => {
    const store = createStore([{ id: 'd1', age: UAVAge.ACTIVE, errors: [] }]);
    seedAnchors(store, { '101': 'operating' });
    confirm.mockReturnValueOnce({
      type: 'test/prompt',
      response: { confirmed: false },
    });

    await dispatchThunk(store, sleepRtlsAnchors(['101']));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toBe('rtlsAnchor.sleep.confirm.message');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('proceeds after a yes', async () => {
    const store = createStore([{ id: 'd1', age: UAVAge.ACTIVE, errors: [] }]);
    seedAnchors(store, { '101': 'operating' });
    confirm.mockReturnValueOnce({
      type: 'test/prompt',
      response: { confirmed: true },
    });
    acceptAll(['101'], true);

    await dispatchThunk(store, sleepRtlsAnchors(['101']));

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  test('a sleeping drone does not count as armed', async () => {
    const store = createStore([
      { id: 'd1', age: UAVAge.ACTIVE, errors: [UAVErrorCode.SLEEPING] },
    ]);
    seedAnchors(store, { '101': 'operating' });
    acceptAll(['101'], true);

    await dispatchThunk(store, sleepRtlsAnchors(['101']));

    expect(confirm).not.toHaveBeenCalled();
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

    await dispatchThunk(store, sleepAllRtlsAnchors());

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

    await dispatchThunk(store, wakeAllRtlsAnchors());

    expect(sendMessage.mock.calls[0][0]).toEqual({
      type: 'X-RTLS-SLEEP',
      ids: [102, 104],
      sleeping: false,
    });
  });

  test('says so when there is nothing to wake', async () => {
    const store = createStore();
    seedAnchors(store, { '101': 'operating' });

    await dispatchThunk(store, wakeAllRtlsAnchors());

    expect(sendMessage).not.toHaveBeenCalled();
    expect(showNotification).toHaveBeenCalledWith(
      'No resting RTLS anchors to wake'
    );
  });
});

describe('SLEEP from the parameter dialog', () => {
  test('refuses SLEEP 2 (off): only the button starts an anchor again', async () => {
    const store = createStore();
    await expect(
      dispatchThunk(store, setRtlsDeviceParameter('101', 'SLEEP', 2, 'uint8'))
    ).rejects.toThrow(/not a remote command/);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
