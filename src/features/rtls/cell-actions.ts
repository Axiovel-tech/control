/**
 * @file Thunks behind the cell settings (X-RTLS-CELL). The server writes the
 * settings to every online anchor and tag and reboots the running ones; the
 * states converge through X-RTLS-INF as the devices come back.
 */

import { showConfirmationDialog } from '~/features/prompt/actions';
import { showNotification } from '~/features/snackbar/actions';
import i18n from '~/i18n';
import messageHub from '~/message-hub';
import {
  type AppDispatch,
  type AppThunk,
  type RootState,
} from '~/store/reducers';

import {
  type RtlsCellFailure,
  type RtlsCellResult,
  type RtlsCellTarget,
  sendRtlsCell,
} from './cell-settings';
import { getPossiblyArmedUavIds, getRtlsDeviceDisplayName } from './selectors';
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
 * Asks the operator to confirm, worded for the drones that may be armed:
 * every running anchor and tag restarts. Resolves to whether to proceed.
 */
const confirmWhileArmed = async (
  dispatch: AppDispatch,
  armedCount: number
): Promise<boolean> => {
  if (armedCount === 0) {
    return true;
  }
  const response = await dispatch(
    showConfirmationDialog(
      i18n.t('rtlsCellSettings.confirm.armedMessage', { count: armedCount }),
      { title: i18n.t('rtlsCellSettings.confirm.title') }
    )
  );
  return Boolean(response?.confirmed);
};

/**
 * Applies what the operator changed of the ranging rate and the anchors' TX
 * level, after a confirmation while any drone may be armed. Resolves to the
 * result and, unless it was applied, the lines that say what went wrong;
 * `undefined` when the operator cancelled.
 */
export const applyRtlsCellSettings =
  (
    target: RtlsCellTarget
  ): AppThunk<Promise<(RtlsCellResult & { errors: string[] }) | undefined>> =>
  async (dispatch, getState) => {
    const armed = getPossiblyArmedUavIds(getState()).length;
    if (!(await confirmWhileArmed(dispatch, armed))) {
      return undefined;
    }
    const result = await sendRtlsCell(messageHub, target);
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
