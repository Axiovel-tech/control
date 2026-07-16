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

import { call, delay, put, select } from 'redux-saga/effects';

import { isConnected } from '~/features/servers/selectors';
import messageHub from '~/message-hub';

import { buildRtlsDeviceStatusMap } from './handlers';
import { queryRtlsInformation } from './messages';
import { setRtlsDevicesFromStatus } from './slice';

/**
 * How often to re-query the X-RTLS-INF device snapshot, in milliseconds.
 */
const INF_REFRESH_INTERVAL = 10 * 1000;

/**
 * Saga that periodically re-queries the X-RTLS-INF device snapshot and applies
 * it wholesale, exactly like the connect-time query does.
 */
export default function* rtlsSaga(): Generator {
  while (true) {
    yield delay(INF_REFRESH_INTERVAL);

    const connected = (yield select(isConnected)) as boolean;
    if (!connected) {
      continue;
    }

    let status: Record<string, Record<string, unknown>> | undefined;
    try {
      // `call` waits for the response before the next `delay`, so a slow
      // query postpones the next poll instead of piling up requests.
      const body = (yield call(queryRtlsInformation, messageHub)) as {
        status?: Record<string, Record<string, unknown>>;
      };
      status = body.status;
    } catch {
      /* RTLS extension not loaded on this server (or a transient failure);
       * try again on the next tick */
      continue;
    }

    // If the connection dropped while the query was in flight, the registry
    // was cleared on disconnection; do not repopulate it with a stale
    // snapshot.
    const stillConnected = (yield select(isConnected)) as boolean;
    if (stillConnected) {
      yield put(setRtlsDevicesFromStatus(buildRtlsDeviceStatusMap(status)));
    }
  }
}
