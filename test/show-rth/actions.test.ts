import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { combineReducers, configureStore } from '@reduxjs/toolkit';

// `~/message-hub` and the selector modules pull in the entire application
// store; they are stubbed with thin mocks (same approach as in
// test/rtls/sleep-actions.test.ts).
jest.mock('~/message-hub', () => ({
  __esModule: true,
  default: {
    execute: { getShowRTHPlanHolders: jest.fn(), startShowRTH: jest.fn() },
  },
}));
jest.mock('~/features/snackbar/actions', () => ({
  __esModule: true,
  showError: jest.fn(),
}));
jest.mock('~/error-handling', () => ({
  errorToString: (error: unknown): string =>
    error instanceof Error ? error.message : String(error),
}));
jest.mock('~/features/mission/selectors', () => ({
  areFlightCommandsBroadcast: jest.fn(() => false),
}));
jest.mock('~/features/uavs/selectors', () => ({
  getSelectedUAVIds: jest.fn(() => ['02']),
}));

import { areFlightCommandsBroadcast } from '~/features/mission/selectors';
import { requestReturnToHome, sendShowRTH } from '~/features/show-rth/actions';
import reducer from '~/features/show-rth/slice';
import { showError } from '~/features/snackbar/actions';
import messageHub from '~/message-hub';

const { getShowRTHPlanHolders, startShowRTH } = (
  messageHub as unknown as {
    execute: Record<
      'getShowRTHPlanHolders' | 'startShowRTH',
      jest.Mock<(...args: unknown[]) => Promise<unknown>>
    >;
  }
).execute;

const createStore = () =>
  configureStore({
    reducer: { dialogs: combineReducers({ showRTH: reducer }) },
  });
type Store = ReturnType<typeof createStore>;

// The store below is typed without the thunk-aware AppDispatch of the real
// application store; a structural cast keeps the tests honest at runtime.
const dispatchThunk = async (store: Store, thunk: unknown): Promise<void> =>
  (store.dispatch as unknown as (action: unknown) => Promise<void>)(thunk);

let store: Store;

beforeEach(() => {
  store = createStore();
});

describe('requestReturnToHome', () => {
  test('opens the dialog when drones hold a plan', async () => {
    getShowRTHPlanHolders.mockResolvedValueOnce(['01', '02']);
    const fallback = jest.fn();

    await dispatchThunk(store, requestReturnToHome(fallback));

    const dialog = store.getState().dialogs.showRTH;
    expect(fallback).not.toHaveBeenCalled();
    expect(dialog.open).toBe(true);
    expect(dialog.planHolders).toEqual(['01', '02']);
    expect(dialog.initialSelection).toEqual({
      returnAll: false,
      selected: ['02'],
    });
  });

  test('starts with return all in broadcast mode', async () => {
    jest.mocked(areFlightCommandsBroadcast).mockReturnValueOnce(true);
    getShowRTHPlanHolders.mockResolvedValueOnce(['01', '02']);

    await dispatchThunk(store, requestReturnToHome(jest.fn()));

    expect(store.getState().dialogs.showRTH.initialSelection.returnAll).toBe(
      true
    );
  });

  test('runs the regular RTH when no drone holds a plan', async () => {
    getShowRTHPlanHolders.mockResolvedValueOnce([]);
    const fallback = jest.fn();

    await dispatchThunk(store, requestReturnToHome(fallback));

    expect(fallback).toHaveBeenCalledTimes(1);
    expect(store.getState().dialogs.showRTH.open).toBe(false);
  });

  test('sends nothing when the server cannot be asked', async () => {
    getShowRTHPlanHolders.mockRejectedValueOnce(new Error('timed out'));
    const fallback = jest.fn();

    await dispatchThunk(store, requestReturnToHome(fallback));

    expect(fallback).not.toHaveBeenCalled();
    expect(store.getState().dialogs.showRTH.open).toBe(false);
    expect(showError).toHaveBeenCalledTimes(1);
  });
});

describe('sendShowRTH', () => {
  test('records the outcome', async () => {
    const outcome = {
      branchTimeUs: 42_000_000,
      succeeded: ['01'],
      failures: { '02': 'show RTH signal not implemented yet' },
    };
    startShowRTH.mockResolvedValueOnce(outcome);

    await dispatchThunk(
      store,
      sendShowRTH({ returnAll: false, selected: ['01', '02'] })
    );

    expect(startShowRTH).toHaveBeenCalledWith({ ids: ['01', '02'] });
    expect(store.getState().dialogs.showRTH.status).toEqual({
      state: 'sent',
      ...outcome,
    });
  });

  test('records a refusal', async () => {
    startShowRTH.mockRejectedValueOnce(
      new Error('RTH refused: The show is not running')
    );

    await dispatchThunk(store, sendShowRTH({ returnAll: true, selected: [] }));

    expect(startShowRTH).toHaveBeenCalledWith({ all: true });
    expect(store.getState().dialogs.showRTH.status).toEqual({
      state: 'error',
      error: 'RTH refused: The show is not running',
    });
  });

  test('sends nothing without a selection', async () => {
    await dispatchThunk(store, sendShowRTH({ returnAll: false, selected: [] }));

    expect(startShowRTH).not.toHaveBeenCalled();
    expect(store.getState().dialogs.showRTH.status).toEqual({ state: 'idle' });
  });
});
