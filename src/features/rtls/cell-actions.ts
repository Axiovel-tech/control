/**
 * @file Thunks behind the cell settings (X-RTLS-CELL). The server writes the
 * settings to every online anchor and tag and reboots the running ones; the
 * states converge through X-RTLS-INF as the devices come back.
 */

import { showNotification } from '~/features/snackbar/actions';
import i18n from '~/i18n';
import messageHub from '~/message-hub';
import { type AppThunk, type RootState } from '~/store/reducers';

import {
  type RtlsCellFailure,
  type RtlsCellResult,
  sendRtlsCell,
} from './cell-settings';
import { getRtlsDeviceDisplayName } from './selectors';
import { setRtlsCellSettings } from './slice';

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
 * Asks the server for the cell settings and why it would refuse an apply now
 * (locked anchors, an authorized show); resolves to that reason.
 */
export const queryRtlsCellSettings =
  (): AppThunk<Promise<string | undefined>> => async (dispatch) => {
    const result = await sendRtlsCell(messageHub, 'status');
    if (result.settings !== undefined) {
      dispatch(setRtlsCellSettings(result.settings));
    }
    return result.reason;
  };

/**
 * Applies a ranging rate and the anchors' TX level. Resolves to the result
 * and, unless it was applied, the lines that say what went wrong.
 */
export const applyRtlsCellSettings =
  (target: {
    rateHz: number;
    txGain?: number;
  }): AppThunk<Promise<RtlsCellResult & { errors: string[] }>> =>
  async (dispatch, getState) => {
    const result = await sendRtlsCell(messageHub, 'apply', target);
    if (result.settings !== undefined) {
      dispatch(setRtlsCellSettings(result.settings));
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
