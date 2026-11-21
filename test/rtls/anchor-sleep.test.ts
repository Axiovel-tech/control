import { beforeEach, describe, expect, jest, test } from '@jest/globals';
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
import { type PromptResponse } from '~/features/prompt/types';
import { type Message } from '~/flockwave/types';
import messageHub from '~/message-hub';
import { UAVAge } from '~/model/uav';
import {
  type AppDispatch,
  type AppThunk,
  type RootState,
} from '~/store/reducers';

// eslint-disable-next-line @typescript-eslint/unbound-method -- a jest mock, never called through `this`
const sendMessage = jest.mocked(messageHub.sendMessage);
const confirm = jest.mocked(showConfirmationDialog);

/** A server reply carrying the given body. */
const reply = (body: { type: string } & Record<string, unknown>): Message => ({
  '$fw.version': '1.0',
  id: 'test-reply',
  body,
});

/** The operator's answer to the confirmation dialog (a prompt thunk). */
const answer =
  (confirmed: boolean): AppThunk<Promise<PromptResponse>> =>
  () =>
    Promise.resolve({ confirmed });

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
  return configureStore({
    reducer: { rtls: reducer, uavs: uavSlice.reducer },
  });
};
type Store = ReturnType<typeof createStore>;

/**
 * Runs an app thunk against the test store, which carries only the slices
 * the RTLS actions read; the real store's state has them all.
 */
const dispatchThunk = <R>(store: Store, thunk: AppThunk<R>) =>
  thunk(
    store.dispatch as AppDispatch,
    () => store.getState() as RootState,
    undefined
  );

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
  sendMessage.mockResolvedValueOnce(
    reply({
      type: 'X-RTLS-SLEEP',
      result: Object.fromEntries(
        ids.map((id) => [id, { accepted: true, sleeping }])
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
      { id: 'd1', age: UAVAge.ACTIVE, errors: [UAVErrorCode.DISARMED] },
      { id: 'd2', age: UAVAge.GONE, errors: [] },
    ]);
    seedAnchors(store, { '101': 'operating' });
    acceptAll(['101'], true);

    await dispatchThunk(store, sleepRtlsAnchors(['101']));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]).toEqual([
      'rtlsAnchor.sleep.confirm.message',
      { title: 'rtlsAnchor.sleep.confirm.title' },
    ]);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]).toEqual([
      { type: 'X-RTLS-SLEEP', ids: [101], sleeping: true },
      { timeout: ANCHOR_SLEEP_TIMEOUT_S },
    ]);
    // the anchor reboots: no immediate INF re-poll of the stale latch
    expect(store.getState().rtls.devices.byId['101'].sleeping).toBe(true);
  });

  test('asks more strongly while a drone may be armed, and stops on a no', async () => {
    const store = createStore([{ id: 'd1', age: UAVAge.ACTIVE, errors: [] }]);
    seedAnchors(store, { '101': 'operating' });
    confirm.mockReturnValueOnce(answer(false));

    await dispatchThunk(store, sleepRtlsAnchors(['101']));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]).toEqual([
      'rtlsAnchor.sleep.confirm.armedMessage',
      { title: 'rtlsAnchor.sleep.confirm.armedTitle' },
    ]);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('proceeds after a yes', async () => {
    const store = createStore([{ id: 'd1', age: UAVAge.ACTIVE, errors: [] }]);
    seedAnchors(store, { '101': 'operating' });
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

    expect(confirm.mock.calls[0][0]).toBe('rtlsAnchor.sleep.confirm.message');
  });

  test('a standby anchor sleeps in place: the answer needs no reboot', async () => {
    const store = createStore();
    seedAnchors(store, { '101': 'standby' });
    acceptAll(['101'], true);

    await dispatchThunk(store, sleepRtlsAnchors(['101']));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(store.getState().rtls.devices.byId['101'].sleeping).toBe(true);
    expect(store.getState().rtls.sleepPending).toEqual({});
  });

  test('sleep all asks too, and a no stops it', async () => {
    const store = createStore();
    seedAnchors(store, { '101': 'operating' });
    confirm.mockReturnValueOnce(answer(false));

    await dispatchThunk(store, sleepAllRtlsAnchors());

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
      'rtlsDevice.bulk.noAnchorsToWake'
    );
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
        name: 'MOT_TILT_DEG',
        value: 1,
        accepted: true,
      })
    );
    await dispatchThunk(
      store,
      setRtlsDeviceParameter('101', 'MOT_TILT_DEG', 1, 'real32')
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
