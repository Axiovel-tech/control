/**
 * @file Thunk for the fleet pre-flight verification (X-RTLS-VERIFY).
 */

import { errorToString } from '~/error-handling';
import { showError } from '~/features/snackbar/actions';
import messageHub from '~/message-hub';
import { type AppDispatch, type RootState } from '~/store/reducers';

import { verifyRtlsFleet } from './messages';
import {
  rtlsVerifyFailed,
  rtlsVerifyStarted,
  rtlsVerifySucceeded,
} from './slice';
import { type RtlsVerifyResult, type RtlsVerifyRule } from './types';

/**
 * Runs the fleet verification rule set and stores the outcome. The dialog
 * renders the per-rule verdicts; only transport-level failures land in the
 * snackbar.
 */
export function runFleetVerification({ inDepth = false } = {}) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState
  ): Promise<void> => {
    if (getState().rtls.verify.running) {
      return;
    }

    dispatch(rtlsVerifyStarted());
    try {
      const body = await verifyRtlsFleet(messageHub, { inDepth });
      dispatch(
        rtlsVerifySucceeded({
          inDepth: Boolean(body.inDepth),
          passed: Boolean(body.passed),
          rules: (body.rules ?? []) as RtlsVerifyRule[],
          receivedAt: Date.now(),
        } satisfies RtlsVerifyResult)
      );
    } catch (error) {
      dispatch(rtlsVerifyFailed());
      showError(`Fleet verification failed: ${errorToString(error)}`);
    }
  };
}
