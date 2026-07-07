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
import { getRtlsDevicesInOrder } from './selectors';
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
    try {
      const result = await sendRtlsSleep(messageHub, deviceIds, sleeping);
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
    }

    await refreshRtlsDevices(dispatch);
  };

/**
 * Convenience action creator for the per-device list button: toggles a single
 * device into or out of sleep.
 */
export const toggleRtlsDeviceSleep = (
  deviceId: string,
  sleeping: boolean
): AppThunk<Promise<void>> => setRtlsDevicesSleeping([deviceId], sleeping);

/**
 * Thunk that puts every known drone (tag) to sleep.
 */
export const sleepAllRtlsDevices =
  (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const ids = getRtlsDevicesInOrder(getState())
      .filter(isSleepable)
      .map((device) => device.id);
    await dispatch(setRtlsDevicesSleeping(ids, true));
  };

/**
 * Thunk that wakes every known drone (tag).
 */
export const wakeAllRtlsDevices =
  (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const ids = getRtlsDevicesInOrder(getState())
      .filter(isSleepable)
      .map((device) => device.id);
    await dispatch(setRtlsDevicesSleeping(ids, false));
  };
