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
 * Parameters the dialog shows but never writes, with the hint that says
 * where they are changed: `SLEEP` through the row's Sleep/Wake buttons
 * (which confirm and report each device's answer), `LOCK` through the
 * panel's Lock/Unlock (which check the anchors and list the server's
 * warnings), and the cell settings, which every device of the cell must
 * share: the rate and TX level through the anchors panel's cell settings
 * (which write them to every device and restart it), channel and session id
 * only with the CLI. An anchor's position is the survey's to write, from the
 * survey page, to every anchor at once with one survey ID.
 */
export const READ_ONLY_RTLS_PARAMS: Readonly<Record<string, string>> = {
  SLEEP: 'rtlsParams.sleepReadOnly',
  LOCK: 'rtlsParams.lockReadOnly',
  UWB_BLOCK_MS: 'rtlsParams.cellReadOnly',
  UWB_SLOT_RSTU: 'rtlsParams.cellReadOnly',
  UWB_SLOTS_RR: 'rtlsParams.cellReadOnly',
  UWB_TX_GAIN: 'rtlsParams.cellReadOnly',
  UWB_CHANNEL: 'rtlsParams.cellCliOnly',
  UWB_SESSION_ID: 'rtlsParams.cellCliOnly',
  UWB_LOC: 'rtlsParams.surveyReadOnly',
  UWB_SURVEY: 'rtlsParams.surveyReadOnly',
};

/**
 * Thunk that sets a single parameter on a device. The returned promise resolves
 * to the server's set result, including the `accepted` flag (a rejected value
 * resolves normally with `accepted: false`; only transport errors reject).
 *
 * On an accepted set the cached parameter value is updated optimistically.
 * `SLEEP`, `LOCK`, the cell settings and what the survey writes are refused
 * before sending (see {@link READ_ONLY_RTLS_PARAMS}).
 */
export const setRtlsDeviceParameter =
  (
    deviceId: string,
    name: string,
    value: RtlsParamValue,
    paramType?: RtlsParamType
  ): AppThunk<Promise<RtlsParameterSetResult>> =>
  async (dispatch) => {
    const readOnlyHint = READ_ONLY_RTLS_PARAMS[name];
    if (readOnlyHint !== undefined) {
      throw new Error(i18n.t(readOnlyHint));
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
