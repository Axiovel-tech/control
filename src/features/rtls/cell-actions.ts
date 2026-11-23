/**
 * @file Thunks behind the cell settings (X-RTLS-CELL). The server writes the
 * settings to every online tag, then anchor, and each applies them at once
 * (its ranging restarts for a moment); the states follow through X-RTLS-INF.
 */

import { showNotification } from '~/features/snackbar/actions';
import i18n from '~/i18n';
import messageHub from '~/message-hub';
import { type AppThunk, type RootState } from '~/store/reducers';

import {
  type RtlsCellFailure,
  type RtlsCellResult,
  type RtlsCellTarget,
  sendRtlsCell,
} from './cell-settings';
import { getRtlsDeviceDisplayName } from './selectors';

/** "RTLS tag 222: RTLS tag 222 refused UWB_BLOCK_MS=12" stays one name. */
const describeFailure = (
  state: RootState,
  { detail, id }: RtlsCellFailure
): string => {
  const device = state.rtls.devices.byId[id];
  const name = device === undefined ? id : getRtlsDeviceDisplayName(device);
  return detail.startsWith(name) ? detail : `${name}: ${detail}`;
};

/**
 * Applies what the operator changed of the ranging rate and the anchors' TX
 * level (the dialog offers it only while no drone may be armed). Resolves to
 * the result and, unless it was applied, the lines that say what went wrong;
 * `undefined`, announcing nothing, once `isCurrent` says the caller's attempt
 * is no longer the one on screen. The cell's settings follow through
 * X-RTLS-INF only.
 */
export const applyRtlsCellSettings =
  (
    target: RtlsCellTarget,
    isCurrent: () => boolean = () => true
  ): AppThunk<Promise<(RtlsCellResult & { errors: string[] }) | undefined>> =>
  async (_dispatch, getState) => {
    let result: RtlsCellResult;
    try {
      result = await sendRtlsCell(messageHub, target);
    } catch (error) {
      if (!isCurrent()) {
        return undefined;
      }
      throw error;
    }
    if (!isCurrent()) {
      return undefined;
    }
    if (result.result === 'applied') {
      showNotification(i18n.t('rtlsCellSettings.applied'));
      return { ...result, errors: [] };
    }
    const errors = [
      ...(result.reason === undefined ? [] : [result.reason]),
      ...result.failures.map((failure) => describeFailure(getState(), failure)),
    ];
    return { ...result, errors };
  };
