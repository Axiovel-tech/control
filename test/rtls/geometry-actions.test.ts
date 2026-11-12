import { describe, expect, jest, test } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';

jest.mock('~/message-hub', () => ({
  __esModule: true,
  default: { sendMessage: jest.fn() },
}));
jest.mock('~/features/snackbar/actions', () => ({
  __esModule: true,
  showError: jest.fn(),
  showNotification: jest.fn(),
}));
// i18n resources are not loaded under test: render the key and its values
jest.mock('~/i18n', () => ({
  ...jest.requireActual<Record<string, unknown>>('~/i18n'),
  __esModule: true,
  default: {
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
  },
}));
jest.mock('~/error-handling', () => ({
  errorToString: (error: unknown): string => String(error),
}));

import { showError, showNotification } from '~/features/snackbar/actions';
import { recalibrateGeometry } from '~/features/rtls/geometry-actions';
import reducer, {
  rtlsGeometryCheckSucceeded,
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

const dispatchThunk = async (store: Store, thunk: unknown): Promise<void> =>
  (store.dispatch as unknown as (action: unknown) => Promise<void>)(thunk);

const paramSetAck = (id: string, accepted: boolean) => ({
  body: {
    type: 'X-RTLS-PARAM-SET',
    id,
    name: 'UWB_GEOM_RECAL',
    value: 1,
    result: accepted ? 'accepted' : 'failed',
    accepted,
  },
});

describe('recalibrateGeometry', () => {
  test('asks every awake tag to refit at once and voids the verdict', async () => {
    const store = createStore();
    store.dispatch(
      setRtlsDevicesFromStatus({
        '1': { online: true, sleeping: false, role: 'tag' },
        '2': { online: true, sleeping: false, role: 'tag' },
        '3': { online: true, sleeping: true, role: 'tag' },
        '4': { online: false, role: 'tag' },
        '101': { online: true, role: 'anchor-initiator' },
      })
    );
    store.dispatch(
      rtlsGeometryCheckSucceeded({
        tolerance: 0.05,
        consistent: false,
        devices: {},
        receivedAt: 0,
      })
    );
    const invalidations = store.getState().rtls.geometry.invalidations;
    sendMessage.mockImplementation((message) => {
      const { id } = message as { id: string };
      return Promise.resolve(paramSetAck(id, id === '1'));
    });

    await dispatchThunk(store, recalibrateGeometry());

    const sets = sendMessage.mock.calls.map(
      (call) => call[0] as { type: string; id: string; name: string }
    );
    expect(sets.map((m) => m.id).sort()).toEqual(['1', '2']);
    expect(sets.every((m) => m.type === 'X-RTLS-PARAM-SET')).toBe(true);
    expect(sets.every((m) => m.name === 'UWB_GEOM_RECAL')).toBe(true);
    expect(store.getState().rtls.geometry.lastCheck).toBeUndefined();
    expect(store.getState().rtls.geometry.invalidations).toBe(
      invalidations + 1
    );
    // tag 2 refused (armed): named in the error, tag 1 reported as started
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'rtlsGeometry.recalibrate.started {"count":1}',
      })
    );
    expect(showError).toHaveBeenCalledWith(
      expect.stringContaining('2: failed')
    );
  });
});
