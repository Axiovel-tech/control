/**
 * @file File for merging the default config with overrides from external files.
 */
import mergeWith from 'lodash-es/mergeWith.js';

import { type Config } from 'config';
import overrides from 'config-overrides';

import baseline from './baseline';

// Completely replace arrays in the configuration instead of merging them.
const customizer = <T>(
  defaultValue: unknown,
  overrideValue: T
): T | undefined => {
  if (Array.isArray(defaultValue) && Array.isArray(overrideValue)) {
    return overrideValue;
  }
};

/**
 * Port the E2E harness told this build to connect to, or `undefined` when it
 * gave no usable value.
 *
 * Validated rather than coerced: `Number('abc')` is `NaN`, which the onboarding
 * saga would silently resolve to the standard port.
 */
const e2eServerPort = ((): number | undefined => {
  const parsed = Number(process.env.AXIO_E2E_SERVER_PORT);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65_536
    ? parsed
    : undefined;
})();

/**
 * Points a test build at the endpoint the harness started, and only there.
 *
 * Applied after the variant overrides rather than inside the baseline, because
 * a variant may replace the whole `server` block: `light` points it at a public
 * MAVLink proxy and forbids manual setup, which would leave an E2E build
 * talking to a live server with no way to redirect it.
 *
 * Leaving the port unset is not enough to stay away either — `sagas/onboarding`
 * resolves a nil or unparseable port to 5000 whenever a hostname is configured,
 * and on a development bench that is the operator's live server. So an E2E
 * build with no usable port disables auto-connect outright and waits to be told
 * where to go.
 */
const applyE2EServerOverride = (config: Config): Config =>
  process.env.AXIO_E2E === '1'
    ? {
        ...config,
        server: {
          ...config.server,
          connectAutomatically: e2eServerPort !== undefined,
          preventAutodetection: false,
          preventManualSetup: false,
          hostName: 'localhost',
          port: e2eServerPort ?? null,
          isSecure: false,
        },
      }
    : config;

const merged: Config = applyE2EServerOverride(
  mergeWith(baseline, overrides, customizer)
);
export default merged;
