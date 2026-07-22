/**
 * @file Thunk actions that put RTLS drones to sleep or wake them through the
 * message hub (X-RTLS-SLEEP).
 *
 * Sleep is owned by the RTLS link firmware, not by ArduPilot: the drone cuts
 * its power rails (motors + flight controller, ELRS receiver, UWB module)
 * while keeping WiFi and the management link up, so it stays discoverable and
 * wakeable here. The firmware refuses to sleep while the flight controller is
 * armed; that refusal comes back as a normal per-device result and is
 * surfaced in the snackbar.
 */

import { errorToString } from '~/error-handling';
import { showError, showNotification } from '~/features/snackbar/actions';
import messageHub from '~/message-hub';
import { type AppDispatch, type AppThunk } from '~/store/reducers';

import { handleRtlsInformationMessage } from './handlers';
import { sendRtlsSleep } from './messages';
import { getRtlsDevicesInOrder, getRtlsSleepPendingMap } from './selectors';
import {
  applyRtlsSleepResults,
  rtlsSleepTransactionEnded,
  rtlsSleepTransactionStarted,
} from './slice';
import { type RtlsDevice } from './types';

/**
 * Devices that can meaningfully sleep: drones (tags). Anchors have no power
 * rails to cut and no SLEEP parameter; commanding them would only produce
 * per-device error noise.
 */
const isSleepable = (device: RtlsDevice): boolean =>
  !device.role || device.role === 'tag';

/**
 * Re-queries X-RTLS-INF so the device list reflects the new sleep state
 * without waiting for the next reconnection. Best-effort.
 */
const refreshRtlsDevices = async (dispatch: AppDispatch): Promise<void> => {
  try {
    const response = await messageHub.sendMessage({ type: 'X-RTLS-INF' });
    const body = (response as { body?: { type?: string } }).body;
    if (body?.type === 'X-RTLS-INF') {
      handleRtlsInformationMessage(body, dispatch);
    }
  } catch {
    /* RTLS extension gone; the next INF poll will catch up */
  }
};

/**
 * Thunk that puts the given devices to sleep or wakes them, reporting the
 * outcome (including per-device refusals from the firmware's arming gate) in
 * the snackbar and refreshing the device list afterwards.
 */
export const setRtlsDevicesSleeping =
  (deviceIds: string[], sleeping: boolean): AppThunk<Promise<void>> =>
  async (dispatch) => {
    if (deviceIds.length === 0) {
      return;
    }

    const verb = sleeping ? 'sleep' : 'wake';
    dispatch(rtlsSleepTransactionStarted(deviceIds));
    try {
      const result = await sendRtlsSleep(messageHub, deviceIds, sleeping);

      // Each accepted per-device result carries the authoritative `sleeping`
      // value verified by the server; apply it to the store as ground truth
      // instead of relying on an INF re-poll (which may still read the stale
      // pre-transition latch, see below).
      const accepted: Record<string, boolean> = {};
      for (const [id, entry] of Object.entries(result)) {
        if (entry?.accepted && typeof entry.sleeping === 'boolean') {
          accepted[id] = entry.sleeping;
        }
      }
      dispatch(applyRtlsSleepResults(accepted));

      const failures = Object.entries(result).filter(
        ([, entry]) => !entry?.accepted
      );
      if (failures.length === 0) {
        showNotification(
          deviceIds.length === 1
            ? `RTLS device ${deviceIds[0]}: ${verb} ok`
            : `${deviceIds.length} RTLS devices: ${verb} ok`
        );
      } else {
        const detail = failures
          .map(([id, entry]) => `${id}: ${entry?.detail ?? 'failed'}`)
          .join('; ');
        showError(`RTLS ${verb} refused — ${detail}`);
      }
    } catch (error) {
      showError(`RTLS ${verb} failed: ${errorToString(error)}`);
    } finally {
      dispatch(rtlsSleepTransactionEnded(deviceIds));
    }

    // Only re-poll X-RTLS-INF after a sleep. A woken device reboots ~1.5 s
    // after acking the wake, so an immediate poll only returns the stale
    // pre-reboot STANDBY latch and would overwrite the authoritative
    // `sleeping: false` applied above; the periodic INF refresh catches up
    // once the device is back on the network.
    if (sleeping) {
      await refreshRtlsDevices(dispatch);
    }
  };

/**
 * Convenience action creators for the per-device list buttons. Each commits a
 * fixed intent — deliberately NOT a toggle of the current `sleeping` flag,
 * which may have changed between paint and click and would then invert the
 * user's intent (observed live on 2026-07-21: a "sleep" click fired a wake).
 */
export const sleepRtlsDevice = (deviceId: string): AppThunk<Promise<void>> =>
  setRtlsDevicesSleeping([deviceId], true);

export const wakeRtlsDevice = (deviceId: string): AppThunk<Promise<void>> =>
  setRtlsDevicesSleeping([deviceId], false);

/**
 * Drops the devices that already have a sleep/wake transaction in flight from
 * the given candidate list. Overlapping X-RTLS-SLEEP transactions targeting
 * the same device could settle out of order and re-invert the state; the
 * per-device buttons are hidden while pending, and the bulk actions filter
 * here. Shows a snackbar note (and returns an empty list) when every
 * candidate is busy.
 */
const withoutPendingDevices = (
  ids: string[],
  pending: Record<string, boolean>,
  verb: string
): string[] => {
  const result = ids.filter((id) => !pending[id]);
  if (result.length === 0 && ids.length > 0) {
    showNotification(
      `RTLS ${verb} skipped — a sleep/wake transaction is already in ` +
        `flight for every drone`
    );
  }

  return result;
};

/**
 * Thunk that puts every known drone (tag) to sleep.
 */
export const sleepAllRtlsDevices =
  (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const state = getState();
    // Offline drones are skipped: commanding them can only fail. Wake-all
    // deliberately keeps targeting everything, since a sleeping drone that
    // aged out of the list should still get its wake command.
    const ids = withoutPendingDevices(
      getRtlsDevicesInOrder(state)
        .filter((device) => isSleepable(device) && device.online)
        .map((device) => device.id),
      getRtlsSleepPendingMap(state),
      'sleep'
    );
    await dispatch(setRtlsDevicesSleeping(ids, true));
  };

/**
 * Thunk that wakes every known drone (tag).
 */
export const wakeAllRtlsDevices =
  (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const state = getState();
    const ids = withoutPendingDevices(
      getRtlsDevicesInOrder(state)
        .filter(isSleepable)
        .map((device) => device.id),
      getRtlsSleepPendingMap(state),
      'wake'
    );
    await dispatch(setRtlsDevicesSleeping(ids, false));
  };
