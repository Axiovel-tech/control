/**
 * @file Saga that keeps the RTLS device registry fresh while we are connected
 * to the server.
 *
 * The device inventory is queried once (X-RTLS-INF) right after the connection
 * is established (see `ServerConnectionManager`). Without a periodic refresh,
 * that snapshot goes stale forever: a device that drops out after the snapshot
 * keeps showing as online, and a device that was missing at connection time
 * but recovered later never appears. The server may also push X-RTLS-INF
 * notifications (handled in `message-hub`); this poll covers servers that do
 * not.
 */

import { call, delay, put, race, select, take } from 'redux-saga/effects';

import { isConnected } from '~/features/servers/selectors';
import { setCurrentServerConnectionState } from '~/features/servers/slice';
import messageHub from '~/message-hub';

import { buildRtlsDeviceStatusMap } from './handlers';
import { queryRtlsInformation } from './messages';
import { setRtlsDevicesFromStatus } from './slice';

/**
 * How often to re-query the X-RTLS-INF device snapshot, in milliseconds.
 */
const INF_REFRESH_INTERVAL = 10 * 1000;

/**
 * Polling loop that re-queries the X-RTLS-INF device snapshot every
 * `INF_REFRESH_INTERVAL` and applies it wholesale, exactly like the
 * connect-time query does. Runs scoped to a single connection: the root saga
 * below cancels it whenever the connection state changes.
 *
 * Exported for testing only.
 */
export function* pollRtlsInformation(): Generator {
  while (true) {
    yield delay(INF_REFRESH_INTERVAL);

    try {
      // `call` waits for the response before the next `delay`, so a slow
      // query postpones the next poll instead of piling up requests.
      const body = (yield call(queryRtlsInformation, messageHub)) as {
        status?: Record<string, Record<string, unknown>>;
      };
      yield put(
        setRtlsDevicesFromStatus(buildRtlsDeviceStatusMap(body.status))
      );
    } catch {
      /* RTLS extension not loaded on this server (or a transient failure);
       * try again on the next tick */
    }
  }
}

/**
 * Root saga of the RTLS feature: runs the X-RTLS-INF polling loop while we
 * are connected to the server.
 *
 * The poll task is raced against the next connection state change, so it is
 * cancelled -- including any in-flight X-RTLS-INF query -- the moment the
 * connection goes away. This is what scopes each query to the connection it
 * was sent on: without the cancellation, a slow response from the previous
 * connection could arrive after an automatic reconnect and clobber the
 * registry of the new connection with a stale snapshot.
 */
export default function* rtlsSaga(): Generator {
  while (true) {
    const connected = (yield select(isConnected)) as boolean;

    if (connected) {
      yield race({
        poll: call(pollRtlsInformation),
        connectionStateChanged: take(setCurrentServerConnectionState.type),
      });
    } else {
      yield take(setCurrentServerConnectionState.type);
    }
  }
}
