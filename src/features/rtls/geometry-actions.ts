/**
 * @file Thunks for the fleet geometry-consistency workflow (X-RTLS-GEO):
 * checking that every drone's tag carries the same cell geometry, and the
 * one-click repair that writes the reference geometry to the drifted tags
 * and reboots them so it takes effect.
 */

import { errorToString } from '~/error-handling';
import { showError, showNotification } from '~/features/snackbar/actions';
import messageHub from '~/message-hub';
import { type AppDispatch, type RootState } from '~/store/reducers';

import {
  adoptRtlsGeometry,
  checkRtlsGeometry,
  syncRtlsGeometry,
} from './messages';
import {
  rtlsGeometryCheckFailed,
  rtlsGeometryCheckStarted,
  rtlsGeometryCheckSucceeded,
  rtlsGeometrySyncFailed,
  rtlsGeometrySyncStarted,
  rtlsGeometrySyncSucceeded,
} from './slice';
import {
  type RtlsGeometryCheck,
  type RtlsGeometryCheckEntry,
  type RtlsGeometrySync,
  type RtlsGeometrySyncEntry,
} from './types';

/**
 * Runs an X-RTLS-GEO check and stores the fleet-consistency snapshot.
 * Errors (no reference tag, no RTLS extension, timeouts) land in the
 * snackbar; a silent variant is used for the automatic re-check after a
 * sync, where the sync outcome is already on screen.
 */
export function checkGeometryConsistency({ silent = false } = {}) {
  return async (dispatch: AppDispatch): Promise<void> => {
    dispatch(rtlsGeometryCheckStarted());
    try {
      const body = await checkRtlsGeometry(messageHub);
      dispatch(
        rtlsGeometryCheckSucceeded({
          cell: typeof body.cell === 'string' ? body.cell : undefined,
          consistent: Boolean(body.consistent),
          devices: (body.devices ?? {}) as Record<
            string,
            RtlsGeometryCheckEntry
          >,
          receivedAt: Date.now(),
        } satisfies RtlsGeometryCheck)
      );
    } catch (error) {
      dispatch(rtlsGeometryCheckFailed());
      if (!silent) {
        showError(`Geometry check failed: ${errorToString(error)}`);
      }
    }
  };
}

/**
 * Runs an X-RTLS-GEO sync — writes the reference geometry to the drifted
 * tags and reboots the rewritten ones — then re-checks the fleet so the
 * consistency snapshot reflects the repair. Summarizes the per-device
 * outcomes in the snackbar.
 */
export function syncGeometryToFleet({
  reboot = true,
  geometry,
}: {
  reboot?: boolean;
  /** Explicit geometry payload (the fit's apply path): written to EVERY
   * tag instead of a reference tag's geometry. */
  geometry?: Record<string, unknown>;
} = {}) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState
  ): Promise<'failed' | 'noop' | 'partial' | 'synced'> => {
    if (getState().rtls.geometry.syncing) {
      return 'failed';
    }

    dispatch(rtlsGeometrySyncStarted());
    let body;
    try {
      body = await syncRtlsGeometry(messageHub, { geometry, reboot });
    } catch (error) {
      dispatch(rtlsGeometrySyncFailed());
      showError(`Geometry sync failed: ${errorToString(error)}`);
      return 'failed';
    }

    const devices = (body.devices ?? {}) as Record<
      string,
      RtlsGeometrySyncEntry
    >;
    dispatch(
      rtlsGeometrySyncSucceeded({
        cell: typeof body.cell === 'string' ? body.cell : undefined,
        devices,
        receivedAt: Date.now(),
      } satisfies RtlsGeometrySync)
    );

    const entries = Object.entries(devices);
    const written = entries.filter(
      ([, entry]) => (entry.written?.length ?? 0) > 0
    ).length;
    const failedIds = entries
      .filter(([, entry]) => entry.status !== 'synced')
      .map(([id]) => id);
    const unrebootedIds = entries
      .filter(
        ([, entry]) =>
          entry.status === 'synced' &&
          (entry.written?.length ?? 0) > 0 &&
          entry.rebooted !== true
      )
      .map(([id]) => id);
    // a written-but-not-rebooted tag still flies on its OLD geometry, so
    // it must be called out in EVERY branch, not only the all-clean one
    const rebootNote =
      unrebootedIds.length > 0
        ? `; tag(s) ${unrebootedIds.join(', ')} written but not ` +
          `rebooted — the new geometry is inactive until they reboot`
        : '';

    if (failedIds.length > 0) {
      showError(
        `Geometry sync: ${failedIds.length} device(s) did not sync ` +
          `cleanly (${failedIds.join(', ')}) — re-run the sync` +
          rebootNote
      );
    } else if (written > 0) {
      showNotification(
        `Geometry written to ${written} tag(s)` +
          (rebootNote ||
            (reboot ? '; rewritten tags are rebooting' : ''))
      );
    } else {
      showNotification('Geometry already consistent — no changes');
    }

    // re-check so the consistency snapshot reflects the repair; silent, the
    // sync outcome is already on screen. Rebooted tags may be off the
    // network for a few seconds — that shows up as incomplete entries and
    // the operator can re-check from the toolbar.
    await dispatch(checkGeometryConsistency({ silent: true }));

    return failedIds.length > 0 ? 'partial' : written > 0 ? 'synced' : 'noop';
  };
}

/**
 * Adopts the fleet's geometry as the canonical one (unanimity-gated on
 * the server; NAK reasons — e.g. a disagreeing fleet — land in the
 * snackbar), then re-checks so the verdicts appear immediately.
 */
export function adoptGeometryFromFleet() {
  return async (dispatch: AppDispatch): Promise<void> => {
    try {
      const body = await adoptRtlsGeometry(messageHub);
      showNotification(
        `Adopted the geometry of tag ${body.reference} as canonical ` +
          `for cell '${body.cell}'`
      );
    } catch (error) {
      showError(`Adopt failed: ${errorToString(error)}`);
      return;
    }
    await dispatch(checkGeometryConsistency({ silent: true }));
  };
}
