/**
 * @file Thunks behind the anchor lock (X-RTLS-LOCK). The lock lives in the
 * anchors' firmware; the server writes it to every online anchor on the
 * operator's request and reports it back.
 */

import { showConfirmationDialog } from '~/features/prompt/actions';
import { showError, showNotification } from '~/features/snackbar/actions';
import i18n from '~/i18n';
import messageHub from '~/message-hub';
import { type AppThunk, type RootState } from '~/store/reducers';

import {
  type RtlsLockFailure,
  type RtlsLockResult,
  sendRtlsLock,
} from './anchor-lock';
import {
  getPossiblyArmedUavIds,
  getRtlsDeviceDisplayName,
  isRtlsDeviceLockedOut,
} from './selectors';
import { setRtlsAnchorLock } from './slice';

/** A failure named by its anchor: "RTLS anchor A3: no answer". */
const describeFailure = (
  state: RootState,
  { detail, id }: RtlsLockFailure
): string => {
  const device = state.rtls.devices.byId[id];
  const name = device === undefined ? id : getRtlsDeviceDisplayName(device);
  return detail.startsWith(name) ? detail : `${name}: ${detail}`;
};

/**
 * Why a lock or unlock did not take effect, or `undefined` when it did: the
 * server's reason, then the anchors that did not take the write.
 */
export const describeLockOutcome = (
  state: RootState,
  result: RtlsLockResult
): string | undefined => {
  if (result.result === 'locked' || result.result === 'unlocked') {
    return undefined;
  }
  const parts = [
    ...(result.reason === undefined ? [] : [result.reason]),
    ...result.failures.map((failure) => describeFailure(state, failure)),
  ];
  return parts.length > 0 ? parts.join('; ') : i18n.t('rtlsAnchorLock.notDone');
};

/**
 * Thunk that locks the anchors. Without `acknowledgeWarnings` the server
 * answers `warnings` instead of locking, for the dialog to list; it answers
 * `refused` when an anchor is not operating. Resolves to the result and,
 * unless the anchors are locked or warnings wait, what went wrong.
 */
export const lockRtlsAnchors =
  (
    acknowledgeWarnings: boolean
  ): AppThunk<Promise<RtlsLockResult & { error?: string }>> =>
  async (dispatch, getState) => {
    const result = await sendRtlsLock(messageHub, 'lock', {
      acknowledgeWarnings,
    });
    if (result.lock !== undefined) {
      dispatch(setRtlsAnchorLock(result.lock));
    }
    if (result.result === 'locked') {
      showNotification(i18n.t('rtlsAnchorLock.notification.locked'));
    }
    return result.result === 'warnings'
      ? result
      : { ...result, error: describeLockOutcome(getState(), result) };
  };

/**
 * Thunk that unlocks the anchors after a one-line confirmation, worded more
 * strongly while any drone may be armed. An existing authorization and
 * start stay intact.
 */
export const unlockRtlsAnchors =
  (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const armed = getPossiblyArmedUavIds(getState()).length;
    const response = await dispatch(
      showConfirmationDialog(
        armed > 0
          ? i18n.t('rtlsAnchorLock.unlock.armedMessage', { count: armed })
          : i18n.t('rtlsAnchorLock.unlock.message')
      )
    );
    if (!response?.confirmed) {
      return;
    }

    try {
      const result = await sendRtlsLock(messageHub, 'unlock');
      if (result.lock !== undefined) {
        dispatch(setRtlsAnchorLock(result.lock));
      }
      const error = describeLockOutcome(getState(), result);
      if (error === undefined) {
        showNotification(i18n.t('rtlsAnchorLock.notification.unlocked'));
      } else {
        showError(error);
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  };

/**
 * Refuses a command (with a note) when one of its devices is locked. The
 * firmware refuses it anyway; this keeps the operator from waiting.
 */
export const refuseLockedDevices = (
  state: RootState,
  ids: readonly string[]
): boolean => {
  if (ids.some((id) => isRtlsDeviceLockedOut(state, id))) {
    showError(i18n.t('rtlsAnchorLock.locked'));
    return true;
  }
  return false;
};
