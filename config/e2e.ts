/**
 * @file Deterministic browser configuration for standalone UI automation.
 *
 * The fixture server is intentionally local to this repository. Cross-repo
 * simulation and system orchestration belong in the external e2e harness.
 */

import { type ConfigOverrides } from 'config-overrides';

import baseline from './baseline';

const overrides: ConfigOverrides = {
  ephemeral: true,

  // Do not let a standalone UI test depend on a public tile provider.
  map: {
    layers: baseline.map.layers.filter((layer) => layer.id !== 'base'),
  },

  server: {
    connectAutomatically: true,
    hostName: 'localhost',
    isSecure: false,
    port: 15000,
    preventAutodetection: true,
    preventManualSetup: false,
    warnClockSkew: false,
  },
};

export default overrides;
