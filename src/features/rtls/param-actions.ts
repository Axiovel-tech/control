/**
 * @file Thunk actions that drive RTLS parameter reads and writes through the
 * message hub.
 */

import { errorToString } from '~/error-handling';
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
 * Anchor SLEEP states the UI never commands: off is left only with the
 * button, and plain standby is where an anchor on external power rests, not
 * something an operator puts it into. Sleep (1) and wake (0) are the remote
 * commands.
 */
const REFUSED_SLEEP_WRITES: Record<number, string> = {
  2:
    'SLEEP 2 (off) is not a remote command: only the button starts an ' +
    'anchor from off. Use 1 to sleep with remote wake.',
  3:
    'SLEEP 3 (standby) is not a remote command: an anchor on external ' +
    'power rests there by itself. Use 1 to sleep or 0 to wake.',
};

/**
 * Thunk that sets a single parameter on a device. The returned promise resolves
 * to the server's set result, including the `accepted` flag (a rejected value
 * resolves normally with `accepted: false`; only transport errors reject).
 *
 * On an accepted set the cached parameter value is updated optimistically.
 * `SLEEP` 2 (off) and 3 (plain standby) are refused before sending.
 */
export const setRtlsDeviceParameter =
  (
    deviceId: string,
    name: string,
    value: RtlsParamValue,
    paramType?: RtlsParamType
  ): AppThunk<Promise<RtlsParameterSetResult>> =>
  async (dispatch) => {
    const refusal =
      name === 'SLEEP' ? REFUSED_SLEEP_WRITES[Number(value)] : undefined;
    if (refusal !== undefined) {
      throw new Error(refusal);
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
