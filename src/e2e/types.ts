/**
 * @file Public contract of the in-app E2E bridge.
 *
 * These types are the versioned interface between this application and the
 * out-of-repo `axio-e2e` harness. Treat every change here as a breaking change
 * to that consumer: bump `BRIDGE_PROTOCOL_VERSION` whenever the shape of an
 * existing member changes or a member is removed.
 */

/**
 * Version of the bridge contract. The harness refuses to drive an app whose
 * major version it does not recognize.
 */
export const BRIDGE_PROTOCOL_VERSION = 1;

/** Name of the global under which the bridge installs itself. */
export const BRIDGE_GLOBAL_NAME = '__AXIO_E2E__';

/** One recorded Flockwave message, in either direction. */
export type TappedMessage = {
  /** Monotonically increasing sequence number within the session. */
  seq: number;
  /** Milliseconds since the epoch, taken when the message was observed. */
  at: number;
  direction: 'out' | 'in';
  /**
   * Flockwave message type (`UAV-INF`, `X-RTLS-GEO`, ...) if one could be
   * determined from the body, otherwise `undefined`.
   */
  type?: string;
  /** The message body, deep-cloned so later mutation cannot rewrite history. */
  body: unknown;
};

/** Filter accepted by {@link E2EBridge.messages}. */
export type MessageFilter = {
  /** Only return messages of this Flockwave type. */
  type?: string;
  direction?: 'out' | 'in';
  /** Only return messages with `seq` strictly greater than this. */
  since?: number;
};

/** A single map feature as reported by the map probe. */
export type ProbedFeature = {
  /** OpenLayers feature id, e.g. `uav$01` or `home$01`. */
  id: string;
  /** Name of the layer the feature was found on. */
  layer: string;
  /** Longitude/latitude in WGS84 degrees, if the geometry has a center. */
  lonLat?: [number, number];
  /**
   * Position in CSS pixels relative to the map viewport's top-left corner.
   * Absent when the feature currently projects outside the viewport.
   */
  pixel?: [number, number];
  /** True when the feature's pixel lies inside the viewport rectangle. */
  visible: boolean;
};

/** Snapshot of the main map returned by {@link E2EBridge.mapProbe}. */
export type MapProbeResult = {
  /** Whether a map instance was mounted and reachable at all. */
  ready: boolean;
  /** Map viewport size in CSS pixels. */
  size?: [number, number];
  /** View center in WGS84 degrees. */
  center?: [number, number];
  /** OpenLayers zoom level. */
  zoom?: number;
  /** View rotation in degrees, clockwise-positive (UI convention). */
  rotation?: number;
  features: ProbedFeature[];
};

/**
 * The object installed on `window` when the bridge is enabled.
 *
 * Everything here is synchronous or promise-returning and JSON-serializable in
 * both directions, so a Playwright `page.evaluate` can call it directly.
 */
export type E2EBridge = {
  readonly version: number;

  /**
   * Returns a JSON-safe deep clone of the Redux state, or of the subtree at
   * `path` (a lodash-style path such as `uavs.byId`).
   */
  getState(path?: string): unknown;

  /**
   * Dispatches a plain Redux action. Thunks cannot cross the bridge, so only
   * serializable actions are accepted.
   */
  dispatch(action: { type: string; payload?: unknown }): void;

  /** Snapshot of the main map's view and features. */
  mapProbe(): MapProbeResult;

  /** Recorded Flockwave traffic, oldest first. */
  messages(filter?: MessageFilter): TappedMessage[];

  /** Drops every recorded message and resets the sequence counter. */
  clearMessages(): void;

  /**
   * Sends a raw Flockwave message through the app's own message hub and
   * resolves with the response body. Useful for arranging preconditions that
   * would otherwise need many UI steps.
   */
  sendMessage(body: Record<string, unknown>): Promise<unknown>;

  /** True once the app has finished restoring persisted state and mounted. */
  isReady(): boolean;
};
