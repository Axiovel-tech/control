/**
 * @file Thunk actions that drive RTLS parameter reads and writes through the
 * message hub.
 */

import { errorToString } from '~/error-handling';
import i18n from '~/i18n';
import messageHub from '~/message-hub';
import { type AppThunk } from '~/store/reducers';

import {
  queryRtlsParameterList,
  setRtlsParameter,
  type RtlsParameterSetResult,
} from './messages';
import {
  rtlsParamsFetchFailed,
  rtlsParamsFetchStarted,
  rtlsParamsFetchSucceeded,
  rtlsParamValueUpdated,
} from './slice';
import { areRtlsAnchorsLocked } from './selectors';
import { classifyRole, isAnchorRole } from './stats-utils';
import { type RtlsParamType, type RtlsParamValue } from './types';

/**
 * Thunk that fetches the parameter list for a single device and caches it in
 * the store, tracking loading/error state.
 */
export const fetchRtlsDeviceParameters =
  (deviceId: string): AppThunk<Promise<void>> =>
  async (dispatch) => {
    dispatch(rtlsParamsFetchStarted(deviceId));
    try {
      const params = await queryRtlsParameterList(messageHub, deviceId);
      dispatch(rtlsParamsFetchSucceeded({ id: deviceId, params }));
    } catch (error) {
      dispatch(
        rtlsParamsFetchFailed({ id: deviceId, error: errorToString(error) })
      );
    }
  };

/**
 * Parameters the dialog shows but never writes: `SLEEP` goes through the
 * row's Sleep/Wake buttons, which confirm (anchors), wait for the verified
 * result and never send off (2) or plain standby (3).
 */
export const READ_ONLY_RTLS_PARAMS: ReadonlySet<string> = new Set(['SLEEP']);

/**
 * Thunk that sets a single parameter on a device. The returned promise resolves
 * to the server's set result, including the `accepted` flag (a rejected value
 * resolves normally with `accepted: false`; only transport errors reject).
 *
 * On an accepted set the cached parameter value is updated optimistically.
 * `SLEEP` is refused before sending (see {@link READ_ONLY_RTLS_PARAMS}).
 */
export const setRtlsDeviceParameter =
  (
    deviceId: string,
    name: string,
    value: RtlsParamValue,
    paramType?: RtlsParamType
  ): AppThunk<Promise<RtlsParameterSetResult>> =>
  async (dispatch, getState) => {
    const device = getState().rtls.devices.byId[deviceId];
    if (
      device !== undefined &&
      isAnchorRole(classifyRole(device.role)) &&
      areRtlsAnchorsLocked(getState())
    ) {
      throw new Error(i18n.t('rtlsAnchorLock.lockedTooltip'));
    }
    if (READ_ONLY_RTLS_PARAMS.has(name)) {
      throw new Error(i18n.t('rtlsParams.sleepReadOnly'));
    }

    const result = await setRtlsParameter(
      messageHub,
      deviceId,
      name,
      value,
      paramType
    );

    if (result.accepted) {
      dispatch(
        rtlsParamValueUpdated({ id: deviceId, name, value: result.value })
      );
    }

    return result;
  };
