/**
 * @file Implementation of the in-app E2E bridge.
 *
 * Installing the bridge exposes a small, explicitly versioned object on
 * `window` that the out-of-repo `axio-e2e` harness drives through
 * `page.evaluate`. Nothing here is imported by application code: the bridge
 * observes, it does not participate.
 */

import get from 'lodash-es/get';

import { getSetupStageStatuses } from '~/features/show/stages';
import messageHub from '~/message-hub';
import store from '~/store';
import type { RootState } from '~/store/reducers';

import { mapProbe } from './map-probe';
import {
  clearMessages,
  getMessages,
  installMessageTap,
  markBridgeOrigin,
} from './message-tap';
import {
  BRIDGE_GLOBAL_NAME,
  BRIDGE_PROTOCOL_VERSION,
  type E2EBridge,
  type FirmwareUpdateSnapshot,
} from './types';

/**
 * Converts an arbitrary value into something that survives the structured
 * clone across the Playwright boundary.
 *
 * The Redux state holds class instances, `undefined` holes and occasional
 * circular references (OpenLayers styles cached on feature objects), all of
 * which would make `page.evaluate` throw. Sanitizing here rather than at the
 * call site keeps failures descriptive instead of opaque.
 */
const toJsonSafe = (value: unknown): unknown => {
  // Only the value kinds this store can actually hold are handled. Sets and
  // Maps deliberately are not: no reducer builds one, and `enableMapSet()` is
  // never called, so Immer would throw on a drafted one long before the bridge
  // saw it. Anything genuinely unexpected still comes back as `__unserializable`
  // via the catch below rather than as a silent hole.
  //
  // Cycle detection has to track the chain of *ancestors*, not every object
  // ever visited. A "seen" set would report the second occurrence of any
  // repeated object as circular, and this store repeats objects constantly:
  // `EMPTY_COLLECTION` from utils/collections is the literal initial state of
  // the clocks, docks, connections and beacons slices, and none of them are
  // rehydrated into fresh objects. A test reading `state.docks.order.length`
  // would silently get 10 — the length of the string '[Circular]' — instead
  // of 0.
  //
  // The replacer is called with `this` bound to the object the value came
  // from, which is what lets the ancestor chain be unwound on the way back up.
  const ancestors: unknown[] = [];

  const replacer = function (
    this: unknown,
    _key: string,
    item: unknown
  ): unknown {
    if (typeof item === 'function') {
      return '[Function]';
    }

    if (typeof item === 'number' && !Number.isFinite(item)) {
      // JSON turns NaN and Infinity into null, which is indistinguishable from
      // a genuinely absent reading in telemetry.
      return `[${String(item)}]`;
    }

    if (typeof item !== 'object' || item === null) {
      return item;
    }

    while (ancestors.length > 0 && ancestors.at(-1) !== this) {
      ancestors.pop();
    }

    if (ancestors.includes(item)) {
      return '[Circular]';
    }

    ancestors.push(item);
    return item;
  };

  try {
    return JSON.parse(JSON.stringify(value, replacer) ?? 'null') as unknown;
  } catch (error) {
    // A throwing getter anywhere in the tree would otherwise reject the whole
    // getState() call with no indication of where the problem was.
    return {
      __unserializable: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * The store is declared in JavaScript, so it reaches this module untyped.
 * Binding it to the app's own state type here keeps the rest of the bridge
 * type-safe without casting.
 */
const typedStore: { getState(): RootState } = store;

const getFirmwareSnapshot = (): FirmwareUpdateSnapshot => {
  const { artifact, loadingTargets, runs } =
    typedStore.getState().firmwareUpdate;
  return {
    artifactReady: Boolean(artifact),
    loadingTargets,
    runs: Object.fromEntries(
      Object.entries(runs).map(([id, run]) => [
        id,
        { ...run, error: run.error ? { ...run.error } : undefined },
      ])
    ),
  };
};

const createBridge = (): E2EBridge => ({
  version: BRIDGE_PROTOCOL_VERSION,

  getState(path) {
    const state = typedStore.getState();
    return toJsonSafe(path ? get(state, path) : state);
  },

  mapProbe,

  messages: getMessages,

  clearMessages,

  firmwareSnapshot: getFirmwareSnapshot,

  getShowStageStatuses() {
    return getSetupStageStatuses(typedStore.getState());
  },

  async sendMessage(body) {
    const response = await messageHub.sendMessage(markBridgeOrigin(body));
    return toJsonSafe(response?.body);
  },
});

/**
 * Installs the bridge on `window` and starts recording Flockwave traffic.
 *
 * This module is only ever reached through the `~/e2e` webpack alias, which
 * resolves here when `AXIO_E2E=1` and to the no-op {@link ./disabled.ts}
 * otherwise — so there is no runtime guard, and a normal build never pulls the
 * store or the message hub in through this path.
 */
export const maybeInstallE2EBridge = (): void => {
  const target = globalThis as unknown as Record<string, unknown>;
  if (target[BRIDGE_GLOBAL_NAME]) {
    // Hot module reloading can re-run the entry point; a second tap would
    // double-record every message.
    return;
  }

  installMessageTap(messageHub);
  target[BRIDGE_GLOBAL_NAME] = createBridge();

  console.info(
    `axio-e2e bridge v${BRIDGE_PROTOCOL_VERSION} installed on window.${BRIDGE_GLOBAL_NAME}`
  );
};
