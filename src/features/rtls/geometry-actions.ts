/**
 * @file Thunk for the fleet cell-geometry agreement check (X-RTLS-GEOM).
 *
 * The tags fit the anchor table themselves at boot; the ground station
 * only verifies that the fleet converged on the same cell. There is no
 * geometry write path any more.
 */

import { errorToString } from '~/error-handling';
import { showError, showNotification } from '~/features/snackbar/actions';
import { MessageSemantics } from '~/features/snackbar/types';
import messageHub from '~/message-hub';
import { type AppDispatch, type RootState } from '~/store/reducers';

import { summarizeGeometryAgreement } from './geometry-utils';
import { checkRtlsGeometryAgreement } from './messages';
import {
  rtlsGeometryCheckFailed,
  rtlsGeometryCheckStarted,
  rtlsGeometryCheckSucceeded,
} from './slice';
import {
  type RtlsGeometryAgreement,
  type RtlsGeometryAgreementEntry,
} from './types';

/**
 * Runs the agreement check and stores the verdict; a snackbar summarizes
 * the outcome unless `silent`. Transport failures always land in the
 * snackbar.
 */
export function checkGeometryAgreement({
  silent = false,
  tolerance,
}: { silent?: boolean; tolerance?: number } = {}) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState
  ): Promise<RtlsGeometryAgreement | undefined> => {
    if (getState().rtls.geometry.checking) {
      return undefined;
    }

    dispatch(rtlsGeometryCheckStarted());
    try {
      const body = await checkRtlsGeometryAgreement(messageHub, { tolerance });
      const result: RtlsGeometryAgreement = {
        tolerance: Number(body.tolerance),
        reference: Array.isArray(body.reference)
          ? (body.reference as Array<number | null>)
          : undefined,
        consistent: Boolean(body.consistent),
        devices: (body.devices ?? {}) as Record<
          string,
          RtlsGeometryAgreementEntry
        >,
        receivedAt: Date.now(),
      };
      dispatch(rtlsGeometryCheckSucceeded(result));
      if (!silent) {
        const summary = summarizeGeometryAgreement(result);
        showNotification({
          message: summary.label,
          semantics:
            summary.problems > 0
              ? MessageSemantics.WARNING
              : MessageSemantics.SUCCESS,
        });
      }

      return result;
    } catch (error) {
      dispatch(rtlsGeometryCheckFailed());
      showError(`Geometry check failed: ${errorToString(error)}`);
      return undefined;
    }
  };
}
