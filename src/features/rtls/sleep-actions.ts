/**
 * @file The thunk action that puts RTLS drones and anchors to sleep or wakes
 * them through the message hub (X-RTLS-SLEEP).
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
import i18n from '~/i18n';
import messageHub from '~/message-hub';
import {
  type AppDispatch,
  type AppThunk,
  type RootState,
} from '~/store/reducers';

import { handleRtlsInformationMessage } from './handlers';
import { sendRtlsSleep } from './messages';
import {
  getPossiblyArmedUavIds,
  getRtlsAnchorDevices,
  getRtlsDevicesAsCollection,
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
import { isTagOrUnknownRtlsDevice } from './utils';

/**
 * How long Control waits for an anchor sleep/wake, in seconds: the server
 * waits for the anchor to report its new power state, and a transition may
 * reboot it (8-15 s).
 */
export const ANCHOR_SLEEP_TIMEOUT_S = 60;

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
 * The devices a panel's Sleep all / Wake all reaches. Tags: every known
 * drone; a device whose role has not arrived yet may be an anchor, so only
 * wake reaches it, and sleep skips offline drones (commanding them can only
 * fail, while a sleeping drone that aged out of the list should still get
 * its wake). Anchors: every online one not already in the target state; an
 * anchor that is off only starts with its button.
 */
const getAllSleepTargets = (
  state: RootState,
  kind: 'tags' | 'anchors',
  sleeping: boolean
): string[] => {
  if (kind === 'tags') {
    return getRtlsDevicesInOrder(state)
      .filter((device) =>
        sleeping
          ? classifyRole(device.role) === RtlsRole.TAG && device.online
          : isTagOrUnknownRtlsDevice(device)
      )
      .map((device) => device.id);
  }
  const statsById = getRtlsStatsById(state);
  return getRtlsAnchorDevices(state)
    .filter((device) => {
      const powerState = statsById[device.id]?.powerState;
      if (!device.online || powerState === 'off') {
        return false;
      }
      return sleeping
        ? powerState !== 'asleep' &&
            !(powerState === undefined && device.sleeping === true)
        : powerState !== 'operating';
    })
    .map((device) => device.id);
};

/**
 * Asks the operator to confirm sleeping anchors, worded more strongly while
 * any drone may be armed; resolves to whether to proceed.
 */
const confirmAnchorSleep = async (
  dispatch: AppDispatch,
  armedCount: number
): Promise<boolean> => {
  const response = await dispatch(
    showConfirmationDialog(
      armedCount > 0
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
 * Puts the given devices, or every tag or anchor of a panel, to sleep or
 * wakes them. Each call commits a fixed intent, deliberately NOT a toggle of
 * the current `sleeping` flag, which may have changed between paint and
 * click and would then invert the operator's intent (observed live on
 * 2026-07-21: a "sleep" click fired a wake).
 *
 * Devices with a transaction in flight are skipped: overlapping
 * X-RTLS-SLEEP transactions could settle out of order and re-invert the
 * state. Sleeping an anchor, or a device of unknown role, always asks first. The outcome, including
 * per-device refusals from the firmware's arming gate, goes to the snackbar.
 */
export const setRtlsSleeping =
  (
    targets: readonly string[] | 'tags' | 'anchors',
    sleeping: boolean
  ): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    const state = getState();
    const candidates =
      typeof targets === 'string'
        ? getAllSleepTargets(state, targets, sleeping)
        : targets;
    if (targets === 'anchors' && candidates.length === 0) {
      showNotification(
        sleeping
          ? i18n.t('rtlsDevice.bulk.noAnchorsToSleep')
          : i18n.t('rtlsDevice.bulk.noAnchorsToWake')
      );
      return;
    }

    const pending = getRtlsSleepPendingMap(state);
    const ids = candidates.filter((id) => !pending[id]);
    if (ids.length === 0) {
      if (candidates.length > 0) {
        showNotification(i18n.t('rtlsDevice.bulk.busy'));
      }
      return;
    }

    const devices = getRtlsDevicesAsCollection(state).byId;
    // a device whose role is unknown (or was just cleared) may be an anchor
    const anchors = ids.some(
      (id) => classifyRole(devices[id]?.role) !== RtlsRole.TAG
    );
    if (
      anchors &&
      sleeping &&
      !(await confirmAnchorSleep(
        dispatch,
        getPossiblyArmedUavIds(state).length
      ))
    ) {
      return;
    }

    const verb = sleeping ? 'sleep' : 'wake';
    dispatch(rtlsSleepTransactionStarted(ids));
    try {
      const result = await sendRtlsSleep(messageHub, ids, sleeping, {
        timeout: anchors ? ANCHOR_SLEEP_TIMEOUT_S : undefined,
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
      if (failures.length === 0) {
        showNotification(
          ids.length === 1
            ? `RTLS device ${ids[0]}: ${verb} ok`
            : `${ids.length} RTLS devices: ${verb} ok`
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
      dispatch(rtlsSleepTransactionEnded(ids));
    }

    // Only re-poll X-RTLS-INF after a sleep. A woken device reboots ~1.5 s
    // after acking the wake, so an immediate poll only returns the stale
    // pre-reboot STANDBY latch and would overwrite the authoritative
    // `sleeping: false` applied above; the periodic INF refresh catches up
    // once the device is back on the network. An anchor is never re-polled:
    // waking reboots it, and the server pins the result it verified (a
    // standby anchor goes to sleep in place, without a reboot).
    if (sleeping && !anchors) {
      await refreshRtlsDevices(dispatch);
    }
  };
