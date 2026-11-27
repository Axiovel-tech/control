/**
 * @file Type definitions for the RTLS (real-time locating system) device
 * management and monitoring feature.
 *
 * RTLS devices are addressed by their MAVLink system id (an integer). In the
 * Redux state and in the server messages they are keyed by the numeric system
 * id rendered as a string.
 */

import { type Identifier } from '~/utils/collections';

import { type RtlsCellState } from './cell-settings';

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
  /**
   * Median absolute deviation of the distance over the anchor's last TWR
   * summary, metres (absent on legacy entries and once the summary is stale).
   */
  madM?: number;
  /** Measurements in that summary. */
  count?: number;
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

  /** The tag's cell (its `CELL_ID`); tags only. */
  cell?: string;

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
   * Device uptime in milliseconds (from the state advertisement, when the
   * firmware sends one); it goes backwards when the device rebooted.
   */
  uptimeMs?: number;

  /**
   * Inter-anchor TWR telemetry (anchors only), freshest first: one row per
   * peer anchor heard on the UWB ether. Absent for tags and for anchors that
   * are not yet hearing peers.
   */
  twr?: RtlsTwrPeer[];

  /**
   * Flockwave id of the UAV (drone) whose MAVLink system id the tag's
   * `flightController` claim names. Kept while the drone sleeps if the server
   * has heard from it; absent for anchors and spare tags.
   */
  uav?: string;

  /**
   * The flight controller the tag reports itself mounted with. Absent for
   * anchors, never-associated tags and older firmware.
   */
  flightController?: RtlsFlightController;

  /**
   * The device against the cell's settings (`X-RTLS-CELL`); absent offline
   * and from a server without them. `cellSettingsDetail` says why it differs
   * when that is its TX level.
   */
  cellSettings?: RtlsCellState;
  cellSettingsDetail?: string;
};

/**
 * A tag's claim of its flight controller, by MAVLink system id. The firmware
 * persists the id, so a drone whose flight controller is powered off still
 * names it.
 */
export type RtlsFlightController =
  | {
      /**
       * `live`: the tag hears this flight controller's heartbeats now;
       * `remembered`: the id the tag last confirmed, not heard now.
       */
      state: 'live' | 'remembered';
      systemId: number;
    }
  | {
      /**
       * The claim is unusable: several flight controllers heard, malformed
       * values, or another tag claims the same system id.
       */
      state: 'ambiguous';
      systemId?: number;
      /** Server explanation of the ambiguity. */
      reason?: string;
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
  /** Bitmask of the table rows that contributed to the most recent fix. */
  anchorMask?: number;
  /**
   * The survey ID a tag's table follows, or the one an anchor's session
   * advertises (`sid`); absent while it has none.
   */
  surveyId?: number;
  /** Rows of the tag's anchor table in use (`anuse`). */
  anchorsUsed?: number;
  /** Anchors the tag hears and leaves out (`anexc`). */
  anchorsExcluded?: number;
  /**
   * The anchors the tag tracks, rows in use first: bit i of `anchorMask`,
   * `nlosMask` and `outvotedMask` is the entry with `row` i. Empty while it
   * tracks none; absent while its firmware reports no table.
   */
  anchorTable?: RtlsAnchorTableEntry[];
  /**
   * Largest gap between a live initiator range and the distance between the
   * advertised positions, metres (`sdrift`).
   */
  surveyDriftM?: number;
  /**
   * An anchor's live range to its initiator minus the one its survey
   * measured, metres, signed (`rdev`); absent while it has no reading.
   */
  rangeDeviationM?: number;
  /** The weakest anchor's mean UWB RSSI over the tag's last report, dBm. */
  uwbRssiDbm?: number;
  /** Rows the chip flagged NLOS on most measurements of the tag's last report. */
  nlosMask?: number;
  /** Rows the tag's solver is outvoting as outliers. */
  outvotedMask?: number;
  /** The solver's mean residual RMS over the tag's last report, metres. */
  residualRmsM?: number;
  /** Signal strength of the tag's WiFi association, dBm. */
  wifiRssiDbm?: number;
  /** WiFi associations the tag lost since it booted. */
  wifiDisconnects?: number;
  /** Die temperature of each IMU of the tag's drone, °C (null: unknown). */
  imuTemperaturesC?: Array<number | null>;

  /**
   * The last snapshot of a lost device: the server keeps answering it, but
   * none of it is live.
   */
  stale?: boolean;

  /* --- Anchor health (firmware 1 Hz health stats); absent = unknown --- */
  /** Gauge state of charge, %; only while the gauge holds the cell profile. */
  batteryPercent?: number;
  /** Pack current, A, positive while discharging. */
  batteryCurrentA?: number;
  /** Gauge temperature, °C. */
  batteryTemperatureC?: number;
  /** The firmware's low-battery latch (a confirmed low pack): an error. */
  lowBattery?: boolean;
  /** The pack is below its warning level while the anchor runs from it. */
  batteryWarning?: boolean;
  /** The anchor's firmware lock: it refuses every remote change. */
  locked?: boolean;
  powerState?: RtlsPowerState;
  powerInput?: RtlsPowerInput;
  charging?: RtlsChargingState;
  /** Why charging is off; sent only while an external input is classified. */
  chargeBlock?: RtlsChargeBlock;
  /** UWB session start outcome (firmware `uwb::StartStatus`). */
  uwbStatus?: RtlsUwbStatus;
  /**
   * Ranging activity over the last report, per second: valid A0
   * measurements on a responder, ranging notifications on the initiator.
   */
  rangingRateHz?: number;
  /** UWB radio restarts since boot. */
  radioRestarts?: number;
  ethernetLink?: boolean;
  /** Ethernet link drops since boot. */
  ethernetDrops?: number;
  /** WiFi transmit errors since boot. */
  wifiTxErrors?: number;
  /** Reboots since the retained boot record was reset. */
  bootCount?: number;
  /** Zephyr hwinfo reset-cause bitmask of this boot. */
  resetCause?: number;
};

/** Anchor power state as the operator sees it (firmware `pwrst`). */
export type RtlsPowerState =
  | 'booting'
  | 'preview'
  | 'standby'
  | 'asleep'
  | 'off'
  | 'operating'
  | 'stopping'
  | 'shutdown'
  | 'fault'
  | 'unknown';

/** Classified input source of an anchor (firmware `pwrin`). */
export type RtlsPowerInput =
  | 'unknown'
  | 'battery'
  | 'usb'
  | 'usb-1.5a'
  | 'usb-3a'
  | 'poe';

/** Charger state of an anchor (firmware `chg`). */
export type RtlsChargingState =
  | 'off'
  | 'idle'
  | 'cc'
  | 'cv'
  | 'topoff'
  | 'unknown';

/** Why an anchor does not charge (firmware `chgblk`). */
export type RtlsChargeBlock =
  | 'none'
  | 'no-profile'
  | 'no-input'
  | 'charger'
  | 'gauge'
  | 'temperature'
  | 'gauge-inhibit'
  | 'pack-voltage'
  | 'charger-fault'
  | 'overcurrent'
  | 'stopping'
  | 'unknown';

/** Wire codes of the UWB session start outcome (`uwbst`). */
export enum RtlsUwbStatus {
  PENDING = 0,
  RUNNING = 1,
  DISABLED = 2,
  INVALID_CONFIG = 3,
  HARDWARE_FAILURE = 4,
}

/** How a tag holds an anchor it tracks (`X-RTLS-STATS.anchorTable[].state`). */
export type RtlsAnchorTableState =
  | 'in-use'
  | 'other-survey'
  | 'no-position'
  | 'unknown-layout'
  | 'table-full'
  | 'unknown';

/** An anchor a tag tracks, as its telemetry names it. */
export type RtlsAnchorTableEntry = {
  /** The tag's row of an anchor in use; absent for one it leaves out. */
  row?: number;
  mac: number;
  state: RtlsAnchorTableState;
  /** The anchor device with that MAC, when the server knows one. */
  systemId?: number;
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
 * An anchor of the site-level anchor list of X-RTLS-INF: one entry per known
 * anchor device, online or lost, with the position it stores itself.
 */
export type RtlsAnchor = {
  /** Stable id of the anchor (`rtls::<cell>::anchor_<i>`). */
  id: string;
  /** Cell the anchor belongs to. */
  cell?: string;
  /** The anchor's row in its own table (A0 initiates). */
  index?: number;
  /** UWB MAC of the anchor. */
  mac?: number;
  /**
   * The position the anchor stores (its survey's result) in the cell's NED
   * frame, metres; every member absent while it is not surveyed.
   */
  ned?: {
    north?: number;
    east?: number;
    down?: number;
  };
  /** The survey ID it stores; absent while it is not surveyed. */
  surveyId?: number;
  /** Its survey declared every anchor at one height. */
  planar?: boolean;
  /** Whether a live anchor device with the matching MAC is online. */
  active?: boolean;
  /** System id of that live anchor device, while one is online. */
  systemId?: number;
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
  /** The species the server established for the image. */
  species?: string;
  /** Where it came from: `receipt` (the build receipt) or `declared`. */
  speciesSource?: string;
};

/** An anchor a tag leaves out, in the fleet warning of X-RTLS-INF. */
export type RtlsExcludedAnchor = Omit<RtlsAnchorTableEntry, 'row'>;

/**
 * The survey the cell is on (X-RTLS-INF `survey`), as its online anchors and
 * tags report it. Ids are system ids as strings.
 */
export type RtlsCellSurvey = {
  /** The survey ID most online anchors are on; absent when none is on one. */
  id?: number;
  /** How many online anchors are on it. */
  anchors: number;
  /** Online anchors without a survey ID. */
  notSurveyed: string[];
  /** Online anchors on another survey ID. */
  otherSurvey: string[];
  /** Online anchors whose range check warns. */
  rangeDeviation: string[];
  /** Those of them beyond the danger bound. */
  rangeDanger: string[];
  /**
   * The anchors each tag leaves out, by tag; an empty list for a tag that
   * counts one out before its table names it.
   */
  excluding: Record<string, RtlsExcludedAnchor[]>;
};

/** One rule outcome of an X-RTLS-VERIFY run. */
export type RtlsVerifyRule = {
  id: string;
  label: string;
  severity: 'error' | 'warning';
  status: 'fail' | 'pass' | 'skipped';
  /** What the rule found; a rule may come without. */
  detail?: string;
  /** Per-drone findings of the yaw-source rule. */
  devices?: Record<string, Record<string, unknown>>;
  /** Per-parameter cross-drone differences of the in-depth rule. */
  diffs?: Record<string, Record<string, number>>;
};

/** Result of an X-RTLS-VERIFY run. */
export type RtlsVerifyResult = {
  inDepth: boolean;
  passed: boolean;
  rules: RtlsVerifyRule[];
  receivedAt: number;
};

/**
 * The server's verdict on scheduling or authorizing a show now (the same
 * check SHOW-SETCFG applies): whether locked anchors are required, and
 * whether it refuses now.
 */
export type RtlsShowGate = {
  required: boolean;
  refused: boolean;
};

/**
 * The anchor lock (X-RTLS-INF `anchorLock`), derived by the server from the
 * anchors' own lock.
 */
export type RtlsAnchorLock = {
  /** At least one anchor is known and every online anchor is locked. */
  locked: boolean;
  lockedCount: number;
  anchorCount: number;
  showGate?: RtlsShowGate;
};
