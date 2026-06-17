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
 * The set of OTA (over-the-air firmware update) job statuses that the server
 * may report for a device or for an individual OTA job.
 */
export enum RtlsOtaStatus {
  IDLE = 'idle',
  PENDING = 'pending',
  IN_PROGRESS = 'inProgress',
  SUCCESS = 'success',
  ERROR = 'error',
}

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
  solveRateHz?: number;
  solvePct?: number;
  anchorsSeen?: number;
  fixAgeMs?: number;
  clockPpm?: number;
  /** Bitmask of anchors that contributed to the most recent fix. */
  anchorMask?: number;
};

/**
 * Description of a single OTA job as reported by X-RTLS-OTA.
 */
export type RtlsOtaJob = {
  id?: string;
  image?: string;
  status?: string;
  /** Progress as a fraction in [0, 1] or a percentage in [0, 100]. */
  progress?: number;
  version?: string;
  error?: string;
};
