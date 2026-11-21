/**
 * @file Thunk actions that put RTLS drones and anchors to sleep or wake them
 * through the message hub (X-RTLS-SLEEP).
 *
 * Sleep is owned by the RTLS link firmware, not by ArduPilot: the drone cuts
 * its power rails (motors + flight controller, ELRS receiver, UWB module)
 * while keeping WiFi and the management link up, so it stays discoverable and
 * wakeable here. The firmware refuses to sleep while the flight controller is
 * armed; that refusal comes back as a normal per-device result and is
 * surfaced in the snackbar.
 *
 * An anchor sleeps with its UWB off and its network up; a transition may
 * reboot it (8-15 s), or happen in place (standby to asleep). Sleeping
 * anchors removes positioning for every drone, so it always asks for
 * confirmation, more strongly while any drone may be armed. Every command
 * is an explicit operator action; nothing here runs on its own.
 */

import { errorToString } from '~/error-handling';
import { showConfirmationDialog } from '~/features/prompt/actions';
import { showError, showNotification } from '~/features/snackbar/actions';
import { MessageSemantics } from '~/features/snackbar/types';
import i18n from '~/i18n';
import messageHub from '~/message-hub';
import { type AppDispatch, type AppThunk } from '~/store/reducers';

import { handleRtlsInformationMessage } from './handlers';
import { sendRtlsSleep } from './messages';
import {
  getPossiblyArmedUavIds,
  getRtlsAnchorDevices,
  getRtlsDevicesInOrder,
  getRtlsSleepPendingMap,
  getRtlsStatsById,
} from './selectors';
import {
  applyRtlsSleepResults,
  rtlsSleepTransactionEnded,
  rtlsSleepTransactionStarted,
} from './slice';
import { classifyRole, RtlsRole } from './stats-utils';
import { type RtlsDevice } from './types';
import { isTagOrUnknownRtlsDevice } from './utils';

/**
 * How long Control waits for an anchor sleep/wake, in seconds: the server
 * waits for the anchor's reboot (8-15 s) and checks its heartbeat state.
 */
export const ANCHOR_SLEEP_TIMEOUT_S = 60;

type SleepOptions = {
  /** How long to wait for the server's verified result, in seconds. */
  timeout?: number;
  /** Whether to re-query X-RTLS-INF after a sleep. */
  refreshAfterSleep?: boolean;
};

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
  (
    deviceIds: string[],
    sleeping: boolean,
    { timeout, refreshAfterSleep = true }: SleepOptions = {}
  ): AppThunk<Promise<void>> =>
  async (dispatch) => {
    if (deviceIds.length === 0) {
      return;
    }

    const verb = sleeping ? 'sleep' : 'wake';
    dispatch(rtlsSleepTransactionStarted(deviceIds));
    try {
      const result = await sendRtlsSleep(messageHub, deviceIds, sleeping, {
        timeout,
      });

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
      // accepted but not verified (firmware without the power state): the
      // server says why; that is not "ok"
      const unverified = Object.entries(result).filter(
        ([, entry]) => entry?.accepted && typeof entry.sleeping !== 'boolean'
      );
      if (failures.length === 0 && unverified.length > 0) {
        showNotification({
          message: i18n.t('rtlsDevice.bulk.unverified', {
            detail: unverified
              .map(([id, entry]) => `${id}: ${entry?.detail ?? '—'}`)
              .join('; '),
          }),
          semantics: MessageSemantics.WARNING,
        });
      } else if (failures.length === 0) {
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
    // once the device is back on the network. An anchor is never re-polled:
    // waking reboots it, and the server pins the result it verified (a
    // standby anchor goes to sleep in place, without a reboot).
    if (sleeping && refreshAfterSleep) {
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
  pending: Record<string, boolean>
): string[] => {
  const result = ids.filter((id) => !pending[id]);
  if (result.length === 0 && ids.length > 0) {
    showNotification(i18n.t('rtlsDevice.bulk.busy'));
  }

  return result;
};

/** A device whose role says it is a tag; an unknown role may be an anchor. */
const isKnownTag = (device: RtlsDevice): boolean =>
  classifyRole(device.role) === RtlsRole.TAG;

/**
 * Thunk that puts every known drone (tag) to sleep. A device whose role has
 * not arrived yet is left out: it may be an anchor, which sleeps only through
 * the anchor actions and their armed-drone confirmation.
 */
export const sleepAllRtlsDevices =
  (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const state = getState();
    // Offline drones are skipped: commanding them can only fail. Wake-all
    // deliberately keeps targeting everything, since a sleeping drone that
    // aged out of the list should still get its wake command.
    const ids = withoutPendingDevices(
      getRtlsDevicesInOrder(state)
        .filter((device) => isKnownTag(device) && device.online)
        .map((device) => device.id),
      getRtlsSleepPendingMap(state)
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
        .filter(isTagOrUnknownRtlsDevice)
        .map((device) => device.id),
      getRtlsSleepPendingMap(state)
    );
    await dispatch(setRtlsDevicesSleeping(ids, false));
  };

const ANCHOR_SLEEP_OPTIONS: SleepOptions = {
  timeout: ANCHOR_SLEEP_TIMEOUT_S,
  refreshAfterSleep: false,
};

/**
 * Asks the operator to confirm sleeping anchors while any drone may be
 * armed; resolves to whether to proceed.
 */
const confirmAnchorSleep = async (
  dispatch: AppDispatch,
  armedCount: number
): Promise<boolean> => {
  const armed = armedCount > 0;
  const response = await dispatch(
    showConfirmationDialog(
      armed
        ? i18n.t('rtlsAnchor.sleep.confirm.armedMessage', {
            count: armedCount,
          })
        : i18n.t('rtlsAnchor.sleep.confirm.message'),
      { title: i18n.t('rtlsAnchor.sleep.confirm.title') }
    )
  );
  return Boolean(response?.confirmed);
};

/**
 * Thunk that puts the given anchors to sleep after a confirmation, worded
 * more strongly while any drone may be armed. Anchors with a transaction in
 * flight are skipped.
 */
export const sleepRtlsAnchors =
  (deviceIds: string[]): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    const state = getState();
    const ids = withoutPendingDevices(deviceIds, getRtlsSleepPendingMap(state));
    if (ids.length === 0) {
      return;
    }
    const armed = getPossiblyArmedUavIds(state).length;
    if (!(await confirmAnchorSleep(dispatch, armed))) {
      return;
    }
    await dispatch(setRtlsDevicesSleeping(ids, true, ANCHOR_SLEEP_OPTIONS));
  };

/** Thunk that wakes the given anchors into operation. */
export const wakeRtlsAnchors =
  (deviceIds: string[]): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    const ids = withoutPendingDevices(
      deviceIds,
      getRtlsSleepPendingMap(getState())
    );
    await dispatch(setRtlsDevicesSleeping(ids, false, ANCHOR_SLEEP_OPTIONS));
  };

/**
 * Thunk that puts every online anchor that is not already asleep or off to
 * sleep.
 */
export const sleepAllRtlsAnchors =
  (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const state = getState();
    const statsById = getRtlsStatsById(state);
    const ids = getRtlsAnchorDevices(state)
      .filter((device) => {
        const powerState = statsById[device.id]?.powerState;
        return (
          device.online &&
          powerState !== 'asleep' &&
          powerState !== 'off' &&
          !(powerState === undefined && device.sleeping === true)
        );
      })
      .map((device) => device.id);
    if (ids.length === 0) {
      showNotification(i18n.t('rtlsDevice.bulk.noAnchorsToSleep'));
      return;
    }
    await dispatch(sleepRtlsAnchors(ids));
  };

/**
 * Thunk that wakes every online anchor that is not already operating. An
 * anchor that is off only starts with its button, so it is left alone.
 */
export const wakeAllRtlsAnchors =
  (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const state = getState();
    const statsById = getRtlsStatsById(state);
    const ids = getRtlsAnchorDevices(state)
      .filter((device) => {
        const powerState = statsById[device.id]?.powerState;
        return (
          device.online && powerState !== 'operating' && powerState !== 'off'
        );
      })
      .map((device) => device.id);
    if (ids.length === 0) {
      showNotification(i18n.t('rtlsDevice.bulk.noAnchorsToWake'));
      return;
    }
    await dispatch(wakeRtlsAnchors(ids));
  };
