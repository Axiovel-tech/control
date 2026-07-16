import { describe, expect, jest, test } from '@jest/globals';
import { call, delay, put, select } from 'redux-saga/effects';

// `~/message-hub` pulls in the entire application store, and
// `~/features/servers/selectors` and `~/error-handling` sit on similarly
// heavy import chains; the saga only needs their identities for effect
// creation, so all three are stubbed with thin mocks.
jest.mock('~/message-hub', () => ({
  __esModule: true,
  default: { sendMessage: jest.fn() },
}));
jest.mock('~/features/servers/selectors', () => ({
  __esModule: true,
  isConnected: jest.fn(),
}));
jest.mock('~/error-handling', () => ({
  errorToString: (error: unknown): string => String(error),
}));

import { buildRtlsDeviceStatusMap } from '~/features/rtls/handlers';
import { queryRtlsInformation } from '~/features/rtls/messages';
import rtlsSaga from '~/features/rtls/saga';
import { setRtlsDevicesFromStatus } from '~/features/rtls/slice';
import { isConnected } from '~/features/servers/selectors';
import messageHub from '~/message-hub';

const INF_REFRESH_INTERVAL = 10 * 1000;

const infQueryEffect = call(queryRtlsInformation, messageHub);

/**
 * Steps a fresh saga up to (and including) the `isConnected` check of the
 * first polling round.
 */
const startPollingRound = () => {
  const saga = rtlsSaga();
  expect(saga.next().value).toEqual(delay(INF_REFRESH_INTERVAL));
  expect(saga.next().value).toEqual(select(isConnected));
  return saga;
};

describe('rtls saga', () => {
  test('applies the X-RTLS-INF snapshot wholesale, then waits again', () => {
    const saga = startPollingRound();
    expect(saga.next(true).value).toEqual(infQueryEffect);

    const body = {
      type: 'X-RTLS-INF',
      status: {
        '7': { online: true, role: 'tag' },
        '12': { age: 45 },
      },
    };
    // The connection is re-checked after the round-trip...
    expect(saga.next(body).value).toEqual(select(isConnected));
    // ...and the snapshot is applied through the same mapping + wholesale
    // replace as the connect-time query
    expect(saga.next(true).value).toEqual(
      put(setRtlsDevicesFromStatus(buildRtlsDeviceStatusMap(body.status)))
    );
    expect(saga.next().value).toEqual(delay(INF_REFRESH_INTERVAL));
  });

  test('does not query while disconnected', () => {
    const saga = startPollingRound();
    // Not connected: straight back to the delay, no message is sent
    expect(saga.next(false).value).toEqual(delay(INF_REFRESH_INTERVAL));
  });

  test('keeps polling when the query fails or the server lacks RTLS', () => {
    const saga = startPollingRound();
    expect(saga.next(true).value).toEqual(infQueryEffect);
    // An ACK-NAK from a server without the RTLS extension surfaces as a
    // thrown error from the query helper
    expect(saga.throw(new Error('Expected X-RTLS-INF response')).value).toEqual(
      delay(INF_REFRESH_INTERVAL)
    );
  });

  test('drops a snapshot that arrives after disconnection', () => {
    const saga = startPollingRound();
    expect(saga.next(true).value).toEqual(infQueryEffect);

    const body = { type: 'X-RTLS-INF', status: { '7': { online: true } } };
    expect(saga.next(body).value).toEqual(select(isConnected));
    // Disconnected while the query was in flight: the registry was cleared,
    // so the stale snapshot must not repopulate it
    expect(saga.next(false).value).toEqual(delay(INF_REFRESH_INTERVAL));
  });
});
