/**
 * @file Implementation of the in-app E2E bridge.
 *
 * Installing the bridge exposes a small, explicitly versioned object on
 * `window` that the out-of-repo `axio-e2e` harness drives through
 * `page.evaluate`. Nothing here is imported by application code: the bridge
 * observes, it does not participate.
 */

import get from 'lodash-es/get';

import messageHub from '~/message-hub';
import store, { waitUntilStateRestored } from '~/store';
import type { AppDispatch, RootState } from '~/store/reducers';

import { mapProbe } from './map-probe';
import {
  asBridgeOrigin,
  clearMessages,
  getMessages,
  installMessageTap,
} from './message-tap';
import {
  BRIDGE_GLOBAL_NAME,
  BRIDGE_PROTOCOL_VERSION,
  type E2EBridge,
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

    if (typeof item === 'bigint') {
      return item.toString();
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

    // Sets and Maps have to join the ancestor chain like anything else, and
    // before being converted. Converting first and returning early would leave
    // a set that (however indirectly) contains itself undetected, and the
    // recursion would run to a stack overflow.
    const replacement =
      item instanceof Set
        ? [...item]
        : item instanceof Map
          ? Object.fromEntries(item)
          : item;

    ancestors.push(item);
    if (replacement !== item) {
      // Children of a converted value arrive with `this` bound to the
      // replacement, so that is what the unwinding above will look for.
      ancestors.push(replacement);
    }

    return replacement;
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

let stateRestored = false;

/**
 * The store is declared in JavaScript, so it reaches this module untyped.
 * Binding it to the app's own state and dispatch types here keeps the rest of
 * the bridge type-safe without casting.
 */
const typedStore: {
  getState(): RootState;
  dispatch: AppDispatch;
} = store;

const createBridge = (): E2EBridge => ({
  version: BRIDGE_PROTOCOL_VERSION,

  getState(path) {
    const state = typedStore.getState();
    return toJsonSafe(path ? get(state, path) : state);
  },

  dispatch(action) {
    typedStore.dispatch(action);
  },

  mapProbe,

  messages: getMessages,

  clearMessages,

  async sendMessage(body) {
    // asBridgeOrigin returns the pending promise; the await happens outside it
    // so the attribution flag is not held for the whole round trip.
    const response = await asBridgeOrigin(() => messageHub.sendMessage(body));
    return toJsonSafe(response?.body);
  },

  isReady() {
    return stateRestored;
  },
});

/**
 * Installs the bridge on `window` and starts recording Flockwave traffic.
 *
 * Only ever called from the `AXIO_E2E` guard in {@link ./index.ts}.
 */
export const installBridge = (): void => {
  const target = globalThis as unknown as Record<string, unknown>;
  if (target[BRIDGE_GLOBAL_NAME]) {
    // Hot module reloading can re-run the entry point; a second tap would
    // double-record every message.
    return;
  }

  installMessageTap(messageHub);
  target[BRIDGE_GLOBAL_NAME] = createBridge();

  void waitUntilStateRestored().then(() => {
    stateRestored = true;
  });

  console.info(
    `axio-e2e bridge v${BRIDGE_PROTOCOL_VERSION} installed on window.${BRIDGE_GLOBAL_NAME}`
  );
};
