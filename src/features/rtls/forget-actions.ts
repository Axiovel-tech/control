/**
 * @file Thunk that asks the server to forget offline RTLS devices
 * (X-RTLS-FORGET). The server keeps a lost device listed, with its last
 * stats, until an operator forgets it; it then pushes an X-RTLS-INF without
 * it, which drops it here.
 */

import { errorToString } from '~/error-handling';
import { showError, showNotification } from '~/features/snackbar/actions';
import messageHub from '~/message-hub';
import { type AppThunk } from '~/store/reducers';

import { sendRtlsForget } from './messages';

/** Thunk that forgets the given offline devices, reporting the outcome. */
export const forgetRtlsDevices =
  (deviceIds: string[]): AppThunk<Promise<void>> =>
  async () => {
    if (deviceIds.length === 0) {
      return;
    }

    try {
      const result = await sendRtlsForget(messageHub, deviceIds);
      const refused = Object.entries(result).filter(
        ([, entry]) => !entry.forgotten
      );
      if (refused.length === 0) {
        showNotification(
          deviceIds.length === 1
            ? `RTLS device ${deviceIds[0]} forgotten`
            : `${deviceIds.length} RTLS devices forgotten`
        );
      } else {
        showError(
          `RTLS forget refused — ${refused
            .map(([id, entry]) => `${id}: ${entry.detail ?? 'refused'}`)
            .join('; ')}`
        );
      }
    } catch (error) {
      showError(`RTLS forget failed: ${errorToString(error)}`);
    }
  };
