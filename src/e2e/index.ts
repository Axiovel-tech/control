/**
 * @file Entry point of the in-app E2E bridge.
 *
 * The bridge is compiled in only when the bundle is built with `AXIO_E2E=1`.
 * `webpack.EnvironmentPlugin` substitutes a literal for `process.env.AXIO_E2E`,
 * so in a normal build the guard below collapses to `'0' === '1'` and the
 * minifier drops both the branch and everything it references.
 */

import { installBridge } from './bridge';

export {
  BRIDGE_GLOBAL_NAME,
  BRIDGE_PROTOCOL_VERSION,
  type E2EBridge,
  type MapProbeResult,
  type MessageFilter,
  type ProbedFeature,
  type TappedMessage,
} from './types';

/**
 * Installs the E2E bridge if this bundle was built for testing; otherwise does
 * nothing at all.
 */
export const maybeInstallE2EBridge = (): void => {
  if (process.env.AXIO_E2E === '1') {
    installBridge();
  }
};
