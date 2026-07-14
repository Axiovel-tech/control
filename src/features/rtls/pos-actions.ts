/**
 * @file Thunk actions for the position-estimate debug stream (X-RTLS-POS).
 *
 * The stream is gated device-side by the tag firmware's `POS_DBG_HZ`
 * parameter (0 = off, the default; otherwise the emit rate in Hz), so
 * enabling the "Debug Pos Estimates" view means writing that parameter on
 * every online tag. The parameter persists on the device, so whoever
 * enables it owns disabling it again (see `pos-stream-guard.ts`).
 */

import messageHub from '~/message-hub';
import { type AppThunk } from '~/store/reducers';

import { setRtlsParameter } from './messages';
import { getOnlineRtlsTags } from './selectors';

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
 * Writes the debug-stream rate parameter on the given devices. Individual
 * device failures are reported in the result rather than thrown, so one
 * unreachable tag does not abort the rest of the fleet.
 */
async function writePosDebugRate(
  ids: Iterable<string>,
  rateHz: number
): Promise<PosDebugStreamResult[]> {
  return Promise.all(
    Array.from(ids, async (id): Promise<PosDebugStreamResult> => {
      try {
        const result = await setRtlsParameter(
          messageHub,
          id,
          POS_DEBUG_RATE_PARAM,
          rateHz,
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
}

/**
 * Thunk that enables or disables the position-estimate debug stream on every
 * online tag by writing its `POS_DBG_HZ` parameter.
 */
export const setPosDebugStreamEnabled =
  (
    enabled: boolean,
    rateHz: number = POS_DEBUG_DEFAULT_RATE_HZ
  ): AppThunk<Promise<PosDebugStreamResult[]>> =>
  async (_dispatch, getState) => {
    const tags = getOnlineRtlsTags(getState());
    return writePosDebugRate(
      tags.map(({ id }) => id),
      enabled ? rateHz : 0
    );
  };

/**
 * Thunk that disables the position-estimate debug stream on an explicit set
 * of devices, best-effort and idempotent — the teardown path of the panel
 * (which must only touch the devices it enabled itself).
 */
export const disablePosDebugStreamOn =
  (ids: string[]): AppThunk<Promise<PosDebugStreamResult[]>> =>
  async () =>
    writePosDebugRate(ids, 0);
