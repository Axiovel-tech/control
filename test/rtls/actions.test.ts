import { describe, expect, jest, test } from '@jest/globals';

import { refreshRtlsDevices, refreshRtlsStats } from '~/features/rtls/actions';
import {
  setRtlsDevicesFromStatus,
  updateRtlsStats,
} from '~/features/rtls/slice';

type DispatchedAction = { type: string; payload: any };
type MockDispatch = jest.Mock<(action: DispatchedAction) => DispatchedAction>;

/** Builds a hub stub whose `sendMessage` resolves to a fixed response body. */
const createHubStub = (body: Record<string, unknown>) => ({
  sendMessage: jest.fn<(b: unknown) => Promise<{ body: typeof body }>>(() =>
    Promise.resolve({ body })
  ),
});

const createDispatch = (): MockDispatch =>
  jest.fn<(action: DispatchedAction) => DispatchedAction>();

const getState: jest.Mock<() => unknown> = jest.fn();

/**
 * Runs a thunk (a function of dispatch/getState/extra) against the supplied
 * mock dispatch, sidestepping the strict ThunkDispatch typing in tests.
 */
const runThunk = (
  thunk: (
    dispatch: MockDispatch,
    getState: jest.Mock<() => unknown>,
    extra: undefined
  ) => Promise<void>,
  dispatch: MockDispatch
): Promise<void> => thunk(dispatch, getState, undefined);

describe('rtls actions', () => {
  test('refreshRtlsDevices queries the server and dispatches the device map', async () => {
    const dispatch = createDispatch();
    const hub = createHubStub({
      type: 'X-RTLS-INF',
      status: { '1': { online: true } },
    });

    await runThunk(refreshRtlsDevices(hub) as never, dispatch);

    expect(hub.sendMessage).toHaveBeenCalledWith({ type: 'X-RTLS-INF' });
    expect(dispatch).toHaveBeenCalledWith(
      setRtlsDevicesFromStatus({ '1': { online: true } })
    );
  });

  test('refreshRtlsStats queries the server and dispatches the stats map', async () => {
    const dispatch = createDispatch();
    const hub = createHubStub({
      type: 'X-RTLS-STATS',
      stats: { '3': { solveRateHz: 5 } },
    });

    await runThunk(refreshRtlsStats(hub) as never, dispatch);

    expect(hub.sendMessage).toHaveBeenCalledWith({ type: 'X-RTLS-STATS' });
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe(updateRtlsStats.type);
    expect(action.payload.byId['3']).toMatchObject({ id: '3', solveRateHz: 5 });
  });
});
