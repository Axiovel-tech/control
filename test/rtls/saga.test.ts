import { describe, expect, jest, test } from '@jest/globals';
import { runSaga, stdChannel } from 'redux-saga';
import { call, delay, put, race, select, take } from 'redux-saga/effects';

// `~/message-hub` pulls in the entire application store; the modules below
// sit on similarly heavy import chains (`~/features/servers/slice` even reads
// `window.location` at import time). The saga only needs their identities for
// effect creation, so all of them are stubbed with thin mocks.
jest.mock('~/message-hub', () => ({
  __esModule: true,
  default: { sendMessage: jest.fn() },
}));
jest.mock('~/features/servers/selectors', () => ({
  __esModule: true,
  isConnected: jest.fn(),
}));
jest.mock('~/features/servers/slice', () => {
  const type = 'servers/setCurrentServerConnectionState';
  return {
    __esModule: true,
    setCurrentServerConnectionState: Object.assign(
      (payload: string) => ({ type, payload }),
      { type }
    ),
  };
});
jest.mock('~/error-handling', () => ({
  errorToString: (error: unknown): string => String(error),
}));

import { buildRtlsDeviceStatusMap } from '~/features/rtls/handlers';
import { queryRtlsInformation } from '~/features/rtls/messages';
import rtlsSaga, { pollRtlsInformation } from '~/features/rtls/saga';
import { setRtlsDevicesFromStatus } from '~/features/rtls/slice';
import { isConnected } from '~/features/servers/selectors';
import { setCurrentServerConnectionState } from '~/features/servers/slice';
import messageHub from '~/message-hub';
// Type-only import: erased at runtime, so it does not drag in the (heavy)
// module chain behind ~/model/enums
import { type ConnectionState } from '~/model/enums';

const CONNECTED = 'connected' as ConnectionState;
const DISCONNECTED = 'disconnected' as ConnectionState;

const INF_REFRESH_INTERVAL = 10 * 1000;

const infQueryEffect = call(queryRtlsInformation, messageHub);

// The mocked hub is a plain object (see the factory above); grabbing the mock
// through a structural cast keeps @typescript-eslint/unbound-method quiet.
const sendMessage = (messageHub as unknown as { sendMessage: jest.Mock })
  .sendMessage;

describe('rtls polling loop', () => {
  test('applies the X-RTLS-INF snapshot wholesale, then waits again', () => {
    const saga = pollRtlsInformation();
    expect(saga.next().value).toEqual(delay(INF_REFRESH_INTERVAL));
    expect(saga.next().value).toEqual(infQueryEffect);

    const body = {
      type: 'X-RTLS-INF',
      status: {
        '7': { online: true, role: 'tag' },
        '12': { age: 45 },
      },
    };
    // The snapshot is applied through the same mapping + wholesale replace as
    // the connect-time query
    expect(saga.next(body).value).toEqual(
      put(setRtlsDevicesFromStatus(buildRtlsDeviceStatusMap(body.status)))
    );
    expect(saga.next().value).toEqual(delay(INF_REFRESH_INTERVAL));
  });

  test('keeps polling when the query fails or the server lacks RTLS', () => {
    const saga = pollRtlsInformation();
    expect(saga.next().value).toEqual(delay(INF_REFRESH_INTERVAL));
    expect(saga.next().value).toEqual(infQueryEffect);
    // An ACK-NAK from a server without the RTLS extension surfaces as a
    // thrown error from the query helper
    expect(saga.throw(new Error('Expected X-RTLS-INF response')).value).toEqual(
      delay(INF_REFRESH_INTERVAL)
    );
  });
});

describe('rtls root saga', () => {
  test('while connected, races the poll loop against a state change', () => {
    const saga = rtlsSaga();
    expect(saga.next().value).toEqual(select(isConnected));
    expect(saga.next(true).value).toEqual(
      race({
        poll: call(pollRtlsInformation),
        connectionStateChanged: take(setCurrentServerConnectionState.type),
      })
    );
    // When the state changes, the connection is re-evaluated
    expect(saga.next({}).value).toEqual(select(isConnected));
  });

  test('while disconnected, waits for a state change without polling', () => {
    const saga = rtlsSaga();
    expect(saga.next().value).toEqual(select(isConnected));
    expect(saga.next(false).value).toEqual(
      take(setCurrentServerConnectionState.type)
    );
    expect(
      saga.next(setCurrentServerConnectionState(CONNECTED)).value
    ).toEqual(select(isConnected));
  });

  test('a stale response from the previous connection is not applied after a reconnect', async () => {
    jest.useFakeTimers();
    try {
      const channel = stdChannel();
      const dispatched: Array<{ type: string; payload?: unknown }> = [];

      let connected = true;
      (isConnected as jest.Mock).mockImplementation(() => connected);

      const pendingQueries: Array<(value: unknown) => void> = [];
      sendMessage.mockImplementation(
        () =>
          new Promise((resolve) => {
            pendingQueries.push(resolve);
          })
      );

      const task = runSaga(
        {
          channel,
          dispatch: (action: { type: string }) => {
            dispatched.push(action);
            channel.put(action);
          },
          getState: () => ({}),
        },
        rtlsSaga as () => Generator
      );

      // The first poll of connection A goes out after 10 s
      await jest.advanceTimersByTimeAsync(INF_REFRESH_INTERVAL);
      expect(sendMessage).toHaveBeenCalledTimes(1);

      // Connection A drops and connection B comes up while A's X-RTLS-INF
      // response is still in flight
      connected = false;
      channel.put(setCurrentServerConnectionState(DISCONNECTED));
      connected = true;
      channel.put(setCurrentServerConnectionState(CONNECTED));

      // A's response finally arrives; the poll task of A was cancelled, so
      // the stale snapshot must NOT be applied to B's registry
      pendingQueries[0]({
        body: { type: 'X-RTLS-INF', status: { '7': { online: true } } },
      });
      await jest.advanceTimersByTimeAsync(0);
      expect(
        dispatched.filter((a) => a.type === setRtlsDevicesFromStatus.type)
      ).toHaveLength(0);

      // ...while the poller is alive on connection B: its own query goes out
      // on schedule and its response is applied
      await jest.advanceTimersByTimeAsync(INF_REFRESH_INTERVAL);
      expect(sendMessage).toHaveBeenCalledTimes(2);
      pendingQueries[1]({
        body: { type: 'X-RTLS-INF', status: { '12': { online: true } } },
      });
      await jest.advanceTimersByTimeAsync(0);

      const applied = dispatched.filter(
        (a) => a.type === setRtlsDevicesFromStatus.type
      );
      expect(applied).toHaveLength(1);
      expect(applied[0].payload).toEqual(
        buildRtlsDeviceStatusMap({ '12': { online: true } })
      );

      task.cancel();
    } finally {
      jest.useRealTimers();
    }
  });
});
