/**
 * @file Thunk that asks the server to forget offline RTLS devices
 * (X-RTLS-FORGET). The server keeps a lost device listed, with its last
 * stats, until an operator forgets it; it then pushes an X-RTLS-INF without
 * it, which drops it here.
 */

import { errorToString } from '~/error-handling';
import { showError, showNotification } from '~/features/snackbar/actions';
import i18n from '~/i18n';
import messageHub from '~/message-hub';
import { type AppThunk } from '~/store/reducers';

import { refuseLockedDevices } from './lock-actions';
import { sendRtlsForget } from './messages';

/** Thunk that forgets the given offline devices, reporting the outcome. */
export const forgetRtlsDevices =
  (deviceIds: string[]): AppThunk<Promise<void>> =>
  async (_dispatch, getState) => {
    if (deviceIds.length === 0) {
      return;
    }
    if (refuseLockedDevices(getState(), deviceIds)) {
      return;
    }

    try {
      const result = await sendRtlsForget(messageHub, deviceIds);
      const refused = Object.entries(result).filter(
        ([, entry]) => !entry.forgotten
      );
      if (refused.length === 0) {
        showNotification(
          i18n.t('rtlsDevice.forget.done', {
            count: deviceIds.length,
            id: deviceIds[0],
          })
        );
      } else {
        showError(
          i18n.t('rtlsDevice.forget.refused', {
            detail: refused
              .map(
                ([id, entry]) =>
                  `${id}: ${entry.detail ?? i18n.t('rtlsDevice.forget.noDetail')}`
              )
              .join('; '),
          })
        );
      }
    } catch (error) {
      showError(
        i18n.t('rtlsDevice.forget.failed', { reason: errorToString(error) })
      );
    }
  };
