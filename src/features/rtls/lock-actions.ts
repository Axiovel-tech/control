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

import { type RtlsLockResult, sendRtlsLock } from './messages';
import { areRtlsAnchorsLocked, getPossiblyArmedUavIds } from './selectors';
import { setRtlsAnchorLock } from './slice';

/**
 * Thunk that locks the anchors. Without `acknowledgeWarnings` the server
 * returns the cell's warnings instead of locking, for the dialog to list.
 * An anchor that is not operating makes it refuse (`refused` and a reason,
 * or a rejection with the reason).
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
 * Thunk that unlocks the anchors after a confirmation, worded more strongly
 * while any drone may be armed. An existing authorization and start stay
 * intact.
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
      if (result.failures.length > 0) {
        showError(result.failures.join('; '));
      } else {
        showNotification(i18n.t('rtlsAnchorLock.notification.unlocked'));
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  };

/**
 * Refuses an anchor command (with a note) while the anchors are locked. The
 * firmware refuses it anyway; this keeps the operator from waiting.
 */
export const refuseWhileAnchorsLocked = (state: RootState): boolean => {
  if (areRtlsAnchorsLocked(state)) {
    showError(i18n.t('rtlsAnchorLock.locked'));
    return true;
  }
  return false;
};
