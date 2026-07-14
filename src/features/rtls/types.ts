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
  /** Show-start synchronization health reported by the firmware. */
  showSync?: {
    /** Whether Anchor 0 currently has a stable analog LTC lock. */
    ltcLocked?: boolean;
    /** Whether this tag has a valid, fresh UWB show deadline. */
    deadlineValid?: boolean;
    /** Generation of the currently acquired UWB deadline. */
    generation?: number;
    /** Seconds remaining until the UWB deadline; negative after it passes. */
    secondsToStart?: number;
  };
};

/** Flight-controller show deadline state exposed by X-SHOW-SYNC. */
export type ShowSyncStatus = {
  source: 'none' | 'rc' | 'uwb-ltc';
  locked: boolean;
  committed: boolean;
  scheduled: boolean;
  secondsToStart?: number;
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
