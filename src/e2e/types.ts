/**
 * @file Public contract of the in-app E2E bridge.
 *
 * These types are the versioned interface between this application and the
 * out-of-repo `axio-e2e` harness. Treat every change here as a breaking change
 * to that consumer: bump `BRIDGE_PROTOCOL_VERSION` whenever the shape of an
 * existing member changes or a member is removed.
 */

import type { FirmwareUpdateRun } from '~/features/firmware-update/types';

/**
 * Version of the bridge contract. The harness refuses to drive an app whose
 * major version it does not recognize.
 */
export const BRIDGE_PROTOCOL_VERSION = 3;

/** Name of the global under which the bridge installs itself. */
export const BRIDGE_GLOBAL_NAME = '__AXIO_E2E__';

/** One recorded Flockwave message, in either direction. */
export type TappedMessage = {
  /**
   * Monotonically increasing sequence number. Keeps counting across
   * `clearMessages()` so that it stays usable as a cursor.
   */
  seq: number;
  /** Milliseconds since the epoch, taken when the message was observed. */
  at: number;
  direction: 'out' | 'in';
  /**
   * Who sent it. `bridge` marks a message the harness injected through
   * {@link E2EBridge.sendMessage}, so a test cannot mistake its own setup
   * traffic for something the GUI did. Inbound messages are always `app`.
   */
  origin: 'app' | 'bridge';
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
  /** Only return messages the application (or the harness) sent. */
  origin?: 'app' | 'bridge';
  /** Only return messages with `seq` strictly greater than this. */
  since?: number;
};

/** A single map feature as reported by the map probe. */
export type ProbedFeature = {
  /** OpenLayers feature id, e.g. `uav$01` or `home$01`. */
  id: string;
  /**
   * Best-effort layer name. OpenLayers has no canonical one and this app does
   * not set any, so in practice this is the layer's class name — useful for
   * telling a vector layer from a tile layer, not for telling the UAV layer
   * from the mission-info layer. Identify features by their `id` prefix.
   */
  layer: string;
  /**
   * Longitude/latitude in WGS84 degrees, taken from the centre of the
   * geometry's bounding box.
   */
  lonLat?: [number, number];
  /**
   * Position in CSS pixels relative to the map viewport's top-left corner.
   * Present for anything that projects at all, including features far outside
   * the viewport, in which case the values are out of range. Absent only when
   * the map has no frame state. Use `visible`, not this, to test for
   * off-screen.
   */
  pixel?: [number, number];
  /** True when the feature's bounding-box centre lies within the viewport. */
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

/** Firmware state exposed without coupling the harness to Redux paths. */
export type FirmwareUpdateSnapshot = {
  artifactReady: boolean;
  loadingTargets: boolean;
  runs: Record<string, FirmwareUpdateRun>;
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

  /** Snapshot of the main map's view and features. */
  mapProbe(): MapProbeResult;

  /** Recorded Flockwave traffic, oldest first. */
  messages(filter?: MessageFilter): TappedMessage[];

  /** Drops every recorded message and resets the sequence counter. */
  clearMessages(): void;

  /** State needed to observe the flight-firmware workflow. */
  firmwareSnapshot(): FirmwareUpdateSnapshot;

  /**
   * Status of every show setup stage, exactly as the GUI's own stage list
   * computes it (`off`, `next`, `success`, `skipped`, `error`, ...). The
   * statuses are derived by a selector, so they are the one piece of GUI
   * truth not reachable through {@link E2EBridge.getState}.
   */
  getShowStageStatuses(): Record<string, string>;

  /**
   * Sends a raw Flockwave message through the app's own message hub and
   * resolves with the response body. Useful for arranging preconditions that
   * would otherwise need many UI steps.
   */
  sendMessage(body: Record<string, unknown>): Promise<unknown>;
};
