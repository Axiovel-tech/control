/**
 * @file Thunk actions for the position-estimate debug stream (X-RTLS-POS).
 *
 * The stream is gated device-side by the tag firmware's `POS_DBG_HZ`
 * parameter (0 = off, the default; otherwise the emit rate in Hz), so
 * enabling the "Debug Pos Estimates" view means writing that parameter on
 * every online tag.
 */

import messageHub from '~/message-hub';
import { type AppThunk } from '~/store/reducers';

import { setRtlsParameter } from './messages';
import { getRtlsDevicesInOrder } from './selectors';
import { classifyRole, RtlsRole } from './stats-utils';

/** Name of the firmware parameter gating the debug stream. */
export const POS_DEBUG_RATE_PARAM = 'POS_DBG_HZ';

/**
 * Emit rate (Hz) requested when the stream is enabled from the UI. The server
 * throttles its client broadcasts to 10 Hz per device anyway, so requesting
 * more would only load the management link.
 */
export const POS_DEBUG_DEFAULT_RATE_HZ = 10;

/** Per-device outcome of a debug-stream toggle. */
export type PosDebugStreamResult = {
  id: string;
  accepted: boolean;
  error?: string;
};

/**
 * Thunk that enables or disables the position-estimate debug stream on every
 * online tag by writing its `POS_DBG_HZ` parameter. Individual device
 * failures are reported in the result rather than thrown, so one unreachable
 * tag does not abort the rest of the fleet.
 */
export const setPosDebugStreamEnabled =
  (
    enabled: boolean,
    rateHz: number = POS_DEBUG_DEFAULT_RATE_HZ
  ): AppThunk<Promise<PosDebugStreamResult[]>> =>
  async (_dispatch, getState) => {
    const tags = getRtlsDevicesInOrder(getState()).filter(
      (device) => device.online && classifyRole(device.role) === RtlsRole.TAG
    );

    return Promise.all(
      tags.map(async ({ id }): Promise<PosDebugStreamResult> => {
        try {
          const result = await setRtlsParameter(
            messageHub,
            id,
            POS_DEBUG_RATE_PARAM,
            enabled ? rateHz : 0,
            'uint8'
          );
          return { id, accepted: result.accepted };
        } catch (error) {
          return {
            id,
            accepted: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );
  };
