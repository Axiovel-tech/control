import { describe, expect, jest, test } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';

// `~/message-hub` pulls in the entire application store and the snackbar
// actions render toasts; both sit on heavy import chains, so they are stubbed
// with thin mocks (same approach as in saga.test.ts).
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

import { showError, showNotification } from '~/features/snackbar/actions';
import {
  setRtlsDevicesSleeping,
  sleepAllRtlsDevices,
  wakeAllRtlsDevices,
} from '~/features/rtls/sleep-actions';
import reducer, {
  rtlsSleepTransactionStarted,
  setRtlsDevicesFromStatus,
} from '~/features/rtls/slice';
import messageHub from '~/message-hub';

const sendMessage = (
  messageHub as unknown as {
    sendMessage: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
  }
).sendMessage;

const createStore = () => configureStore({ reducer: { rtls: reducer } });
type Store = ReturnType<typeof createStore>;

// The store below is typed without the thunk-aware AppDispatch of the real
// application store; a structural cast keeps the tests honest at runtime.
const dispatchThunk = async (store: Store, thunk: unknown): Promise<void> =>
  (store.dispatch as unknown as (action: unknown) => Promise<void>)(thunk);

const seedDevices = (store: Store, sleeping: boolean | undefined) => {
  store.dispatch(
    setRtlsDevicesFromStatus({
      '1': { online: true, sleeping },
      '2': { online: true, sleeping },
    })
  );
};

describe('setRtlsDevicesSleeping', () => {
  test('applies the authoritative result of an accepted wake to the store and skips the INF re-poll', async () => {
    const store = createStore();
    seedDevices(store, true);

    sendMessage.mockResolvedValueOnce({
      body: {
        type: 'X-RTLS-SLEEP',
        result: {
          '1': { accepted: true, sleeping: false },
          '2': { accepted: false, detail: 'no response' },
        },
      },
    });

    await dispatchThunk(store, setRtlsDevicesSleeping(['1', '2'], false));

    const { devices } = store.getState().rtls;
    // Accepted result is ground truth...
    expect(devices.byId['1'].sleeping).toBe(false);
    // ...while a refused device keeps its previous state.
    expect(devices.byId['2'].sleeping).toBe(true);

    // A wake must NOT re-poll X-RTLS-INF immediately: the device reboots
    // ~1.5 s after acking, so the instant poll would only read the stale
    // pre-reboot STANDBY latch and overwrite the truth applied above.
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect((sendMessage.mock.calls[0][0] as { type: string }).type).toBe(
      'X-RTLS-SLEEP'
    );
  });

  test('still refreshes the device list via X-RTLS-INF after a sleep', async () => {
    const store = createStore();
    seedDevices(store, false);

    sendMessage
      .mockResolvedValueOnce({
        body: {
          type: 'X-RTLS-SLEEP',
          result: {
            '1': { accepted: true, sleeping: true },
            '2': { accepted: true, sleeping: true },
          },
        },
      })
      .mockResolvedValueOnce({
        body: {
          type: 'X-RTLS-INF',
          status: {
            '1': { online: true, sleeping: true },
            '2': { online: true, sleeping: true },
          },
        },
      });

    await dispatchThunk(store, setRtlsDevicesSleeping(['1', '2'], true));

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect((sendMessage.mock.calls[1][0] as { type: string }).type).toBe(
      'X-RTLS-INF'
    );
    expect(store.getState().rtls.devices.byId['1'].sleeping).toBe(true);
  });

  test('marks the devices as pending while the transaction is in flight', async () => {
    const store = createStore();
    seedDevices(store, true);

    let resolveSend!: (value: unknown) => void;
    sendMessage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSend = resolve;
      })
    );

    const promise = dispatchThunk(store, setRtlsDevicesSleeping(['1'], false));

    // Pending is set synchronously when the transaction starts...
    expect(store.getState().rtls.sleepPending).toEqual({ '1': true });

    resolveSend({
      body: {
        type: 'X-RTLS-SLEEP',
        result: { '1': { accepted: true, sleeping: false } },
      },
    });
    await promise;

    // ...and cleared when it settles.
    expect(store.getState().rtls.sleepPending).toEqual({});
  });

  test('clears the pending markers even when the transport fails', async () => {
    const store = createStore();
    seedDevices(store, true);

    sendMessage.mockRejectedValueOnce(new Error('boom'));

    await dispatchThunk(store, setRtlsDevicesSleeping(['1', '2'], false));

    expect(store.getState().rtls.sleepPending).toEqual({});
    expect(showError).toHaveBeenCalled();
    // The devices keep their previous state: no authoritative result arrived.
    expect(store.getState().rtls.devices.byId['1'].sleeping).toBe(true);
  });
});

describe('bulk sleep/wake', () => {
  test('excludes devices with a transaction already in flight', async () => {
    const store = createStore();
    seedDevices(store, false);
    store.dispatch(rtlsSleepTransactionStarted(['1']));

    sendMessage
      .mockResolvedValueOnce({
        body: {
          type: 'X-RTLS-SLEEP',
          result: { '2': { accepted: true, sleeping: true } },
        },
      })
      .mockResolvedValueOnce({
        body: {
          type: 'X-RTLS-INF',
          status: {
            '1': { online: true, sleeping: false },
            '2': { online: true, sleeping: true },
          },
        },
      });

    await dispatchThunk(store, sleepAllRtlsDevices());

    // Device 1 is busy and must not be targeted by the bulk command.
    expect(sendMessage.mock.calls[0][0]).toEqual({
      type: 'X-RTLS-SLEEP',
      ids: [2],
      sleeping: true,
    });
  });

  test('is a no-op with a note when every device is busy', async () => {
    const store = createStore();
    seedDevices(store, true);
    store.dispatch(rtlsSleepTransactionStarted(['1', '2']));

    await dispatchThunk(store, wakeAllRtlsDevices());

    expect(sendMessage).not.toHaveBeenCalled();
    expect(showNotification).toHaveBeenCalledWith(
      expect.stringContaining('already in flight')
    );
  });
});
