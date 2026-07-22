/**
 * @file Type definitions for the RTLS (real-time locating system) device
 * management and monitoring feature.
 *
 * RTLS devices are addressed by their MAVLink system id (an integer). In the
 * Redux state and in the server messages they are keyed by the numeric system
 * id rendered as a string.
 */

import { type Identifier } from '~/utils/collections';

/**
 * The parameter types supported by the RTLS firmware. These mirror the
 * MAV_PARAM_EXT_TYPE enum names, lowercased. Numeric parameters are carried as
 * JSON numbers; `custom` parameters are carried as strings.
 */
export type RtlsParamType =
  | 'uint8'
  | 'int8'
  | 'uint16'
  | 'int16'
  | 'uint32'
  | 'int32'
  | 'uint64'
  | 'int64'
  | 'real32'
  | 'real64'
  | 'custom';

/** A single RTLS parameter value: a number for numeric types, string for custom. */
export type RtlsParamValue = number | string;

/**
 * A single inter-anchor TWR measurement (anchors only). An anchor hears its
 * peers over the UWB ether and reports the measured distance to each peer; the
 * server surfaces these on the device's X-RTLS-INF status so the stats panel
 * can show "I can hear A0 at 14.10 m". Tags do not report these.
 */
export type RtlsTwrPeer = {
  /** MAC of the peer anchor this measurement refers to. */
  peerMac?: number;
  /** Measured inter-anchor distance to the peer, in metres. */
  distanceM?: number;
  /**
   * Age of the measurement, in milliseconds. A growing value means the peer
   * has gone quiet on the ether (stale telemetry).
   */
  ageMs?: number;
};

/**
 * A single RTLS device as tracked in the Redux state.
 *
 * Devices are keyed by their MAVLink system id rendered as a numeric string.
 */
export type RtlsDevice = {
  /** MAVLink system id rendered as a numeric string. */
  id: Identifier;

  /** Optional human-readable name; falls back to the id when absent. */
  name?: string;

  /** Optional role string reported by the device. */
  role?: string;

  /** Whether the device is currently considered online by the server. */
  online: boolean;

  /** Network address of the device, if known. */
  address?: string;

  /** Seconds since the device was last heard from, if known. */
  age?: number;

  /** Firmware version string reported by the device. */
  firmwareVersion?: string;

  /** Number of parameters exposed by the device. */
  paramCount?: number;

  /** Last known OTA status for the device. */
  otaStatus?: string;

  /**
   * Whether the drone is in sleep mode (power rails to the motors/flight
   * controller, ELRS receiver and UWB module cut; WiFi and the management
   * link still up). Live from the device heartbeat via X-RTLS-INF.
   */
  sleeping?: boolean;

  /**
   * Inter-anchor TWR telemetry (anchors only), freshest first: one row per
   * peer anchor heard on the UWB ether. Absent for tags and for anchors that
   * are not yet hearing peers.
   */
  twr?: RtlsTwrPeer[];

  /**
   * Flockwave id of the UAV (drone) associated with this device, derived by
   * the server from the network: the drone's flight-controller MAVLink
   * reaches the server through this tag's WiFi-UART bridge, so they share a
   * source IP. Absent for unassociated devices (anchors, spare tags).
   */
  uav?: string;
};

/**
 * A single parameter descriptor as returned by an X-RTLS-PARAM-LIST or
 * X-RTLS-PARAM-GET query.
 */
export type RtlsParam = {
  name: string;
  value: RtlsParamValue;
  type: RtlsParamType;
  index?: number;
};

/**
 * Live statistics for a single RTLS device, as reported by X-RTLS-STATS.
 */
export type RtlsDeviceStats = {
  id: Identifier;
  batteryVoltage?: number;
  solveRateHz?: number;
  solvePct?: number;
  anchorsSeen?: number;
  fixAgeMs?: number;
  clockPpm?: number;
  /** Bitmask of anchors that contributed to the most recent fix. */
  anchorMask?: number;
};

/**
 * A live position estimate of a single tag, as reported by X-RTLS-POS.
 *
 * The stream exists only while the tag's `POS_DBG_HZ` parameter is nonzero
 * (off by default); the server relays the solved NED position at up to 10 Hz
 * per device. Coordinates are metres in the anchor cell's NED frame -- the
 * same frame the anchors' `ned` coordinates are expressed in.
 */
export type RtlsPosEstimate = {
  /** MAVLink system id rendered as a numeric string. */
  id: Identifier;
  /** Solved position: north, metres in the cell frame. */
  north?: number;
  /** Solved position: east, metres in the cell frame. */
  east?: number;
  /** Solved position: down, metres in the cell frame (negative = above origin). */
  down?: number;
  /** Reported NE sigma of the solve, metres; absent when the solver had no covariance. */
  sigma?: number;
  /** Device-side timestamp of the estimate (ms since boot). */
  timeBootMs?: number;
  /**
   * Client-side arrival timestamp (`Date.now()` corrected by the server's
   * reported age), used to fade stale estimates when the stream stops.
   */
  receivedAt?: number;
};

/**
 * A single configured RTLS anchor from the site-level anchor list of
 * X-RTLS-INF (one entry per anchor in every known cell).
 */
export type RtlsAnchor = {
  /** Stable id of the anchor (`rtls::<cell>::anchor_<i>`). */
  id: string;
  /** Cell the anchor belongs to. */
  cell?: string;
  /** Index of the anchor within its cell. */
  index?: number;
  /** UWB MAC of the anchor. */
  mac?: number;
  /** Configured position in the cell's NED frame, metres. */
  ned?: {
    north?: number;
    east?: number;
    down?: number;
  };
  /** Whether a live anchor device with the matching MAC is online. */
  active?: boolean;
};

/**
 * Description of a single OTA job as reported by X-RTLS-OTA.
 */
export type RtlsOtaJob = {
  id?: string;
  image?: string;
  status?: string;
  /** Progress as a fraction in [0, 1] (0.0 at start, 1.0 on completion). */
  progress?: number;
  version?: string;
  error?: string;
};
