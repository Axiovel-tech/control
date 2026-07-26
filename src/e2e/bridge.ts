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
import { clearMessages, getMessages, installMessageTap } from './message-tap';
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
  const seen = new WeakSet<object>();
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) => {
      if (typeof item === 'function') {
        return '[Function]';
      }

      if (typeof item === 'bigint') {
        return item.toString();
      }

      if (typeof item === 'object' && item !== null) {
        if (seen.has(item)) {
          return '[Circular]';
        }

        seen.add(item);
      }

      return item;
    }) ?? 'null'
  ) as unknown;
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
    const response = await messageHub.sendMessage(body);
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
