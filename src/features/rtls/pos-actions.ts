/**
 * @file Wiring of the position-estimate debug stream controller to the
 * live message hub.
 *
 * The stream is gated device-side by the tag firmware's `POS_DBG_HZ`
 * parameter (0 = off, the default; otherwise the emit rate in Hz). All
 * enable/disable lifecycle logic — ownership, teardown, retry and the
 * unmount/remount races — lives in `PosStreamController`
 * (`pos-stream-guard.ts`); this module only supplies the real parameter
 * I/O and constructs the application-wide singleton. The controller must
 * be a singleton: stream ownership has to survive panel unmount/remount,
 * and its single FIFO queue is what serializes a new panel's enable behind
 * the previous panel's teardown.
 */

import messageHub from '~/message-hub';
import { showError } from '~/features/snackbar/actions';

import { getRtlsParameter, setRtlsParameter } from './messages';
import {
  PosStreamController,
  type PosStreamParamOps,
} from './pos-stream-guard';

/** Name of the firmware parameter gating the debug stream. */
export const POS_DEBUG_RATE_PARAM = 'POS_DBG_HZ';

/**
 * Emit rate (Hz) requested when the stream is enabled from the UI. The server
 * throttles its client broadcasts to 10 Hz per device anyway, so requesting
 * more would only load the management link.
 */
export const POS_DEBUG_DEFAULT_RATE_HZ = 10;

const paramOps: PosStreamParamOps = {
  async readRate(id) {
    const value = await getRtlsParameter(messageHub, id, POS_DEBUG_RATE_PARAM);
    const rate = Number(value);
    return Number.isFinite(rate) ? rate : 0;
  },

  async writeRate(id, rateHz) {
    const result = await setRtlsParameter(
      messageHub,
      id,
      POS_DEBUG_RATE_PARAM,
      rateHz,
      'uint8'
    );
    return result.accepted;
  },
};

/**
 * The application-wide debug-stream controller. The release-failure toast
 * is wired here (not in the panel) because a failing teardown outlives the
 * panel that triggered it.
 */
export const posStreamController = new PosStreamController(paramOps, {
  onReleaseFailure(ids) {
    const message =
      `Could not stop the position debug stream on tag(s) ` +
      `${ids.join(', ')}; set POS_DBG_HZ=0 from the Devices tab`;
    console.error(`rtls: ${message}`);
    showError(message);
  },
});
