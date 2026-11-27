/**
 * @file Saga that keeps the configured solve rate of the RTLS tags known.
 *
 * Kept apart from the device-registry saga in `saga.ts`: that one is scoped
 * to a single server connection, this one simply follows the registry.
 */

import { call, put, select, take } from 'redux-saga/effects';

import messageHub from '~/message-hub';

import { getRtlsParameter } from './messages';
import { getOnlineRtlsTags, getRtlsSolveRateTargets } from './selectors';
import { rtlsSolveRateTargetRead, setRtlsDevicesFromStatus } from './slice';
import { SOLVE_RATE_PARAM } from './stats-utils';
import type { RtlsDevice } from './types';

/**
 * How long to leave a tag alone after it failed to answer for its configured
 * solve rate, in milliseconds. The management link of a tag is shared with
 * the server's own polling, so a tag that does not answer is not asked again
 * on every device snapshot.
 */
const SOLVE_RATE_RETRY_INTERVAL = 60 * 1000;

/**
 * Keeps the configured solve rate of the tags known, so the tags panel can
 * show the measured rate against it.
 *
 * The rate is a tag parameter, not part of the statistics the tags stream, so
 * it is read once per tag: whenever a device snapshot shows an online, awake
 * tag whose rate is not known. The slice forgets the rate of a tag that
 * rebooted or left, which makes it be read again here; a change made in the
 * parameter dialog updates it directly. Tags are asked one at a time.
 */
export default function* solveRateTargetSaga(): Generator {
  const lastFailureAt = new Map<string, number>();

  while (true) {
    yield take(setRtlsDevicesFromStatus.type);

    const tags = (yield select(getOnlineRtlsTags)) as RtlsDevice[];
    const known = (yield select(getRtlsSolveRateTargets)) as Record<
      string,
      number
    >;

    for (const { id, sleeping } of tags) {
      const failedAt = lastFailureAt.get(id);
      if (
        sleeping ||
        id in known ||
        (failedAt !== undefined &&
          Date.now() - failedAt < SOLVE_RATE_RETRY_INTERVAL)
      ) {
        continue;
      }

      try {
        const value = yield call(
          getRtlsParameter,
          messageHub,
          id,
          SOLVE_RATE_PARAM
        );
        if (typeof value === 'number') {
          lastFailureAt.delete(id);
          yield put(rtlsSolveRateTargetRead({ id, value }));
        }
      } catch {
        /* The tag did not answer, or its firmware has no such parameter;
         * the panel shows the measured rate alone until it does */
        lastFailureAt.set(id, Date.now());
      }
    }
  }
}
