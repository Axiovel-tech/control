/**
 * @file Thunk for the fleet cell-geometry agreement check (X-RTLS-GEOM).
 *
 * The tags fit the anchor table themselves at boot; the ground station
 * only verifies that the fleet converged on the same cell. There is no
 * geometry write path any more.
 */

import { errorToString } from '~/error-handling';
import i18n from '~/i18n';
import { showError, showNotification } from '~/features/snackbar/actions';
import { MessageSemantics } from '~/features/snackbar/types';
import messageHub from '~/message-hub';
import { type AppDispatch, type RootState } from '~/store/reducers';

import { describeGeometryAgreement } from './geometry-utils';
import { checkRtlsGeometryAgreement } from './messages';
import { getRtlsTagDevices } from './selectors';
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

    // A verdict certifies the fleet it was asked about. Capture that fleet
    // now: if a tag joins or leaves while the request is in flight, the
    // response must not become the verdict of the new fleet (the slice
    // voids the old one on an ID-set change) — drop it and ask again.
    const fleetAtRequest = tagIdSet(getState());
    dispatch(rtlsGeometryCheckStarted());
    try {
      const body = await checkRtlsGeometryAgreement(messageHub, { tolerance });
      if (tagIdSet(getState()) !== fleetAtRequest) {
        dispatch(rtlsGeometryCheckFailed());
        return dispatch(checkGeometryAgreement({ silent, tolerance }));
      }

      const result: RtlsGeometryAgreement = {
        tolerance: Number(body.tolerance),
        reference: Array.isArray(body.reference)
          ? (body.reference as Array<number | null>)
          : undefined,
        references: (body.references ?? undefined) as
          | Record<string, Array<number | null>>
          | undefined,
        consistent: Boolean(body.consistent),
        devices: (body.devices ?? {}) as Record<
          string,
          RtlsGeometryAgreementEntry
        >,
        receivedAt: Date.now(),
      };
      dispatch(rtlsGeometryCheckSucceeded(result));
      if (!silent) {
        const summary = describeGeometryAgreement(result);
        showNotification({
          message: i18n.t(summary.key, summary.values),
          semantics:
            summary.problems > 0
              ? MessageSemantics.WARNING
              : MessageSemantics.SUCCESS,
        });
      }

      return result;
    } catch (error) {
      dispatch(rtlsGeometryCheckFailed());
      showError(
        i18n.t('rtlsGeometry.checkFailed', { detail: errorToString(error) })
      );
      return undefined;
    }
  };
}

/** The tag ID set of the current fleet, as a comparable string. */
const tagIdSet = (state: RootState): string =>
  getRtlsTagDevices(state)
    .map((device) => device.id)
    .sort()
    .join(',');
