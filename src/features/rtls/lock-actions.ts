/**
 * @file Thunks behind the anchor cell lock (X-RTLS-LOCK). The lock lives in
 * axio-server; Control only asks for it and shows it. It never acts on the
 * devices: it guards operator actions, and the server raises the alarms.
 */

import { showConfirmationDialog } from '~/features/prompt/actions';
import { showError, showNotification } from '~/features/snackbar/actions';
import i18n from '~/i18n';
import messageHub from '~/message-hub';
import { type AppThunk, type RootState } from '~/store/reducers';

import { type RtlsLockResult, sendRtlsLock } from './messages';
import { areRtlsAnchorsLocked, getPossiblyArmedUavIds } from './selectors';
import { setRtlsAnchorLock } from './slice';

/**
 * Thunk that locks the anchors, or re-seals a broken lock (a fresh snapshot
 * that clears the breaks). Without `acknowledgeWarnings` the server refuses
 * a cell with warnings and returns them, for the dialog to list. Rejects
 * with the server's reason when it refuses the request.
 */
export const lockRtlsAnchors =
  (acknowledgeWarnings: boolean): AppThunk<Promise<RtlsLockResult>> =>
  async (dispatch) => {
    const result = await sendRtlsLock(messageHub, 'lock', {
      acknowledgeWarnings,
    });
    if (result.lock !== undefined) {
      dispatch(setRtlsAnchorLock(result.lock));
    }
    if (result.result === 'locked') {
      showNotification(i18n.t('rtlsAnchorLock.notification.locked'));
    }
    return result;
  };

/**
 * Thunk that reads the lock state and the cell's current warnings (the
 * read-only `status` action), for a review before re-sealing.
 */
export const fetchRtlsLockStatus =
  (): AppThunk<Promise<RtlsLockResult>> => async (dispatch) => {
    const result = await sendRtlsLock(messageHub, 'status');
    if (result.lock !== undefined) {
      dispatch(setRtlsAnchorLock(result.lock));
    }
    return result;
  };

/**
 * Thunk that unlocks the anchors after a confirmation, worded more strongly
 * while any drone may be armed: unlocked anchors can be changed again, and a
 * scheduled or authorized show then fails its server-side check.
 */
export const unlockRtlsAnchors =
  (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const armed = getPossiblyArmedUavIds(getState()).length;
    const response = await dispatch(
      showConfirmationDialog(
        armed > 0
          ? i18n.t('rtlsAnchorLock.unlock.armedMessage', { count: armed })
          : i18n.t('rtlsAnchorLock.unlock.message'),
        {
          title: i18n.t(
            armed > 0
              ? 'rtlsAnchorLock.unlock.armedTitle'
              : 'rtlsAnchorLock.unlock.title'
          ),
        }
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
      showNotification(i18n.t('rtlsAnchorLock.notification.unlocked'));
    } catch (error) {
      showError(
        i18n.t('rtlsAnchorLock.notification.unlockFailed', {
          reason: error instanceof Error ? error.message : String(error),
        })
      );
    }
  };

/**
 * Whether an anchor command may go out: false (with a note) while the
 * anchors are locked. The server refuses such commands anyway; this keeps
 * the operator from waiting on a refusal.
 */
export const refuseWhileAnchorsLocked = (state: RootState): boolean => {
  if (areRtlsAnchorsLocked(state)) {
    showError(i18n.t('rtlsAnchorLock.lockedTooltip'));
    return true;
  }
  return false;
};
