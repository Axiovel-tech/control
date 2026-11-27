/**
 * @file Pure helpers for deriving health/summary information from RTLS device
 * statistics.
 *
 * This module is intentionally free of UI dependencies (e.g. the theme `Status`
 * enum) so it can be unit-tested in isolation. The mapping from {@link
 * RtlsHealth} to a theme `Status` lives in `health-status.ts`.
 */

import {
  type RtlsAnchor,
  type RtlsDevice,
  type RtlsDeviceStats,
  type RtlsPowerState,
  RtlsUwbStatus,
} from './types';

/** Overall health classification of an RTLS device, used to colour a light. */
export enum RtlsHealth {
  /** No statistics available at all. */
  UNKNOWN = 'unknown',
  /** Solving but with a stale fix or low rate. */
  WARNING = 'warning',
  /** Solving with a recent fix at a healthy rate. */
  OK = 'ok',
  /** Not solving / fix lost. */
  ERROR = 'error',
  /**
   * Deliberately not working: an anchor asleep, in standby or switched off.
   * Neutral on its own row; see {@link getOverallHealth} for a fleet.
   */
  IDLE = 'idle',
}

/**
 * Coarse role classification of an RTLS device, derived from the device's
 * reported `role` (the server projects this from the firmware `UWB_ROLE`
 * param: 0 disabled, 1 tag, 2 anchor-initiator, 3 anchor-responder). A tag is
 * judged by its solve performance; an anchor by its liveness and health stats.
 */
export enum RtlsRole {
  /** Role not reported / not recognised. */
  UNKNOWN = 'unknown',
  /** Device is configured but disabled (UWB_ROLE 0). */
  DISABLED = 'disabled',
  /** Position-solving tag (UWB_ROLE 1). */
  TAG = 'tag',
  /** Anchor acting as the TWR initiator (UWB_ROLE 2). */
  ANCHOR_INITIATOR = 'anchor-initiator',
  /** Anchor acting as a TWR responder (UWB_ROLE 3). */
  ANCHOR_RESPONDER = 'anchor-responder',
}

/**
 * Classifies a device's reported role. Accepts either the numeric `UWB_ROLE`
 * value (0..3, possibly rendered as a string) or one of the role slug strings
 * the server emits (`tag`, `anchor-initiator`, `anchor-responder`,
 * `disabled`). Anything unrecognised maps to {@link RtlsRole.UNKNOWN}.
 */
export function classifyRole(role: string | number | undefined): RtlsRole {
  if (role === undefined || role === null) {
    return RtlsRole.UNKNOWN;
  }

  if (typeof role === 'number' || /^\d+$/.test(role.trim())) {
    switch (Number(role)) {
      case 0:
        return RtlsRole.DISABLED;
      case 1:
        return RtlsRole.TAG;
      case 2:
        return RtlsRole.ANCHOR_INITIATOR;
      case 3:
        return RtlsRole.ANCHOR_RESPONDER;
      default:
        return RtlsRole.UNKNOWN;
    }
  }

  switch (role.trim().toLowerCase()) {
    case 'disabled':
      return RtlsRole.DISABLED;
    case 'tag':
      return RtlsRole.TAG;
    case 'anchor-initiator':
    case 'initiator':
      return RtlsRole.ANCHOR_INITIATOR;
    case 'anchor-responder':
    case 'responder':
    case 'anchor':
      return RtlsRole.ANCHOR_RESPONDER;
    default:
      return RtlsRole.UNKNOWN;
  }
}

/** Whether a classified role is one of the two anchor roles. */
export function isAnchorRole(role: RtlsRole): boolean {
  return (
    role === RtlsRole.ANCHOR_INITIATOR || role === RtlsRole.ANCHOR_RESPONDER
  );
}

/** Fixes older than this (ms) are considered stale. */
export const STALE_FIX_AGE_MS = 1000;

/** Solve rates below this (Hz) are considered degraded. */
const MIN_HEALTHY_SOLVE_RATE_HZ = 1;

/** Solve percentages below this are considered degraded. */
const MIN_HEALTHY_SOLVE_PCT = 50;

/** Anchors last heard from longer ago than this (s) are considered offline. */
export const STALE_ANCHOR_AGE_S = 5;

/**
 * Liveness of a device as reported in the X-RTLS-INF device snapshot.
 */
export type DeviceLiveness = {
  /** Whether the server currently considers the device online. */
  online?: boolean;
  /** Seconds since the device was last heard from, if known. */
  age?: number;
  /** The server's sleep latch (heartbeat STANDBY), when known. */
  sleeping?: boolean;
};

/**
 * Power states in which an anchor deliberately does not range: neutral, not
 * a fault. Booting and stopping are the transitions into and out of them.
 */
const RESTING_POWER_STATES: ReadonlySet<RtlsPowerState> = new Set([
  'booting',
  'preview',
  'standby',
  'asleep',
  'off',
  'stopping',
  'shutdown',
]);

/** Power states after which an anchor is expected to drop off the network. */
const POWERED_DOWN_STATES: ReadonlySet<RtlsPowerState> = new Set([
  'off',
  'stopping',
  'shutdown',
]);

/** Whether a lost anchor was last seen powering down (then gone is expected). */
export function wasPoweringDown(stats: RtlsDeviceStats | undefined): boolean {
  return (
    stats?.powerState !== undefined && POWERED_DOWN_STATES.has(stats.powerState)
  );
}

/** Whether an anchor rests deliberately (asleep, standby, off, booting...). */
export function isAnchorResting(
  stats: RtlsDeviceStats | undefined,
  sleeping: boolean | undefined
): boolean {
  const state = stats?.powerState;
  if (state === undefined || state === 'unknown') {
    // firmware without the power state: the heartbeat latch is all there is
    return sleeping === true;
  }
  return RESTING_POWER_STATES.has(state);
}

/**
 * An anchor warns while its live range to its initiator is farther than this
 * from the one its survey measured, metres, either sign. The firmware's own
 * bound (rtls-link-zephyr `docs/reference/anchor-health.md`, "Range check"),
 * which its ring shows and the server's Verify rule `anchors` applies.
 */
export const RANGE_DEVIATION_WARNING_M = 0.08;

/**
 * Beyond this the range check reads danger: the anchor stands elsewhere. The
 * firmware's second bound; still a warning the operator may lock through.
 */
export const RANGE_DEVIATION_DANGER_M = 0.2;

/** Whether an anchor's range check warns: it may stand elsewhere than surveyed. */
export const isRangeDeviating = (stats: RtlsDeviceStats | undefined): boolean =>
  stats?.rangeDeviationM !== undefined &&
  Math.abs(stats.rangeDeviationM) > RANGE_DEVIATION_WARNING_M;

/** Whether an anchor's range check reads danger. */
export const isRangeDanger = (stats: RtlsDeviceStats | undefined): boolean =>
  stats?.rangeDeviationM !== undefined &&
  Math.abs(stats.rangeDeviationM) > RANGE_DEVIATION_DANGER_M;

/**
 * Whether the survey the cell is on (`cellSurveyId`) is `planar`: every
 * anchor that advertises it now stores a position that declared all its
 * anchors at one height. A tag then solves on three of them. An anchor that
 * is offline, or on another survey, has no say: no tag uses it. The server's
 * set (its Verify rule `survey`).
 */
export const isSurveyPlanar = (
  cellSurveyId: number | undefined,
  anchors: readonly RtlsDevice[],
  statsById: Record<string, RtlsDeviceStats | undefined>,
  siteAnchors: readonly RtlsAnchor[]
): boolean => {
  const onAir = anchors.filter(({ id, online }) => {
    const stats = statsById[id];
    return (
      online &&
      stats?.surveyId !== undefined &&
      !stats.stale &&
      stats.surveyId === cellSurveyId
    );
  });
  return (
    onAir.length > 0 &&
    onAir.every(
      ({ id }) =>
        siteAnchors.find(({ systemId }) => String(systemId) === id)?.planar ===
        true
    )
  );
};

/** What a tag's position is judged by: the survey the cell is on. */
export type RtlsTagCell = {
  /** Its ID; absent while no anchor is on one. */
  surveyId?: number;
  /** Three anchors of it are enough (`isSurveyPlanar`). */
  planar: boolean;
};

/**
 * Whether a tag positions: it follows the survey ID of the cell and uses
 * four anchors of it, or three when the survey is planar. This is the
 * solver's own minimum (rtls-link-zephyr
 * `docs/reference/anchor-geometry.md`, "Enough") and the server's rule: a
 * tag that keeps its survey ID on fewer anchors solves nothing. `undefined`
 * while it does not report both how many anchors it uses and how many it
 * leaves out: what is missing is not known, and never good. Never read from
 * the show clock, which is valid in a cell with no survey at all.
 */
export const isTagPositioned = (
  stats: RtlsDeviceStats | undefined,
  { planar, surveyId }: RtlsTagCell
): boolean | undefined =>
  stats?.anchorsUsed === undefined || stats.anchorsExcluded === undefined
    ? undefined
    : surveyId !== undefined &&
      stats.surveyId === surveyId &&
      stats.anchorsUsed >= (planar ? 3 : 4);

/** Whether the UWB session refused to start (configuration or hardware). */
export function isUwbStartRefused(stats: RtlsDeviceStats | undefined): boolean {
  return (
    stats?.uwbStatus === RtlsUwbStatus.INVALID_CONFIG ||
    stats?.uwbStatus === RtlsUwbStatus.HARDWARE_FAILURE
  );
}

/**
 * What the responders of its cell say about an initiator's ranging. An
 * initiator's own rate counts its ranging rounds, which run on with every
 * responder asleep; a responder's rate counts valid A0 measurements, so it
 * is the evidence that A0 ranges with someone:
 * - `hearing`: an online responder of the cell reports a positive rate;
 * - `unheard`: responders of the cell are online but none reports one;
 * - `alone`: no responder of the cell is online.
 */
export type InitiatorEvidence = 'hearing' | 'unheard' | 'alone';

/** Whether an operating anchor's own telemetry says it ranges. */
export function isRangingByTelemetry(stats: RtlsDeviceStats): boolean {
  return (
    !isUwbStartRefused(stats) &&
    stats.uwbStatus !== RtlsUwbStatus.PENDING &&
    (stats.rangingRateHz ?? 0) > 0
  );
}

/**
 * Grades an anchor's liveness: `undefined` when it is live with fresh
 * telemetry, so that the telemetry decides.
 * - lost (offline, or not heard within the window): error, or idle when it
 *   was last seen powering down;
 * - no liveness signal: unknown;
 * - online but its stats snapshot is stale (no stats for a while while
 *   heartbeats continue): warning, telemetry unavailable; the cached values
 *   are not graded.
 */
function gradeAnchorLiveness(
  liveness: DeviceLiveness,
  stats: RtlsDeviceStats | undefined
): RtlsHealth | undefined {
  const { online, age } = liveness;
  const lost =
    online === false ||
    (age !== undefined && Number.isFinite(age) && age > STALE_ANCHOR_AGE_S);
  if (lost) {
    return wasPoweringDown(stats) ? RtlsHealth.IDLE : RtlsHealth.ERROR;
  }
  if (online === undefined && age === undefined) {
    return RtlsHealth.UNKNOWN;
  }
  return stats?.stale ? RtlsHealth.WARNING : undefined;
}

/**
 * Grades a live anchor's telemetry: errors first (fault, low battery, a
 * refused UWB start, a range check that reads danger), a pack below its
 * warning level, then rest (idle), then warnings (a range check that warns,
 * radio restarts, operating
 * without a measured ranging rate, an initiator its responders do not hear).
 */
function gradeAnchorTelemetry(
  stats: RtlsDeviceStats | undefined,
  sleeping: boolean | undefined,
  evidence: InitiatorEvidence | undefined
): RtlsHealth {
  if (stats?.powerState === 'fault' || stats?.lowBattery) {
    return RtlsHealth.ERROR;
  }
  if (stats?.batteryWarning) {
    // running from a pack below its warning level, asleep or not
    return RtlsHealth.WARNING;
  }
  if (isAnchorResting(stats, sleeping)) {
    return RtlsHealth.IDLE;
  }
  if (isUwbStartRefused(stats) || isRangeDanger(stats)) {
    return RtlsHealth.ERROR;
  }
  const operating = stats?.powerState === 'operating';
  const notRanging =
    operating &&
    (!isRangingByTelemetry(stats) ||
      (evidence !== undefined && evidence !== 'hearing'));
  return isRangeDeviating(stats) ||
    (stats?.radioRestarts ?? 0) > 0 ||
    notRanging
    ? RtlsHealth.WARNING
    : RtlsHealth.OK;
}

/**
 * Derives the health of an anchor from its liveness and health stats (see
 * {@link gradeAnchorLiveness} and {@link gradeAnchorTelemetry}).
 * `initiatorEvidence` is given for an initiator only.
 */
export function getAnchorHealth(
  liveness: DeviceLiveness | undefined,
  stats?: RtlsDeviceStats,
  initiatorEvidence?: InitiatorEvidence
): RtlsHealth {
  if (!liveness) {
    return RtlsHealth.UNKNOWN;
  }
  return (
    gradeAnchorLiveness(liveness, stats) ??
    gradeAnchorTelemetry(stats, liveness.sleeping, initiatorEvidence)
  );
}

/**
 * Role-aware health for a single device. Anchors are judged by liveness and
 * their health stats, tags by their solve statistics. A disabled device contributes no
 * health signal (UNKNOWN).
 */
export function getDeviceHealthForRole(
  role: RtlsRole,
  stats: RtlsDeviceStats | undefined,
  liveness: DeviceLiveness | undefined,
  initiatorEvidence?: InitiatorEvidence
): RtlsHealth {
  if (role === RtlsRole.DISABLED) {
    // deliberately out of service: contributes no health signal, not even
    // its offline-ness — alarming on a device someone disabled is noise
    return RtlsHealth.UNKNOWN;
  }

  if (isAnchorRole(role)) {
    return getAnchorHealth(
      liveness,
      stats,
      role === RtlsRole.ANCHOR_INITIATOR ? initiatorEvidence : undefined
    );
  }

  if (liveness && !liveness.online) {
    // an offline device is never healthy, no matter how good its RETAINED
    // stats look — without this, a tag that dropped off the network kept
    // the overall (header) health green on its cached solve stats. The
    // server keeps lost devices listed until forgotten, so a drone powered
    // down asleep contributes nothing and any other lost tag only warns:
    // neither may hold the header red until the operator forgets it.
    return liveness.sleeping === true ? RtlsHealth.UNKNOWN : RtlsHealth.WARNING;
  }

  if (stats?.stale) {
    // online, but its stats stopped: telemetry unavailable, and the cached
    // solve figures must not read as green
    return RtlsHealth.WARNING;
  }

  return getDeviceHealth(stats);
}

/**
 * Derives a coarse health classification for a single device from its stats.
 */
export function getDeviceHealth(
  stats: RtlsDeviceStats | undefined
): RtlsHealth {
  if (!stats) {
    return RtlsHealth.UNKNOWN;
  }

  const { solveRateHz, solvePct, fixAgeMs } = stats;

  if (
    solveRateHz === undefined &&
    solvePct === undefined &&
    fixAgeMs === undefined
  ) {
    return RtlsHealth.UNKNOWN;
  }

  // A clearly absent fix (zero rate or very stale) is an error.
  if (
    (solveRateHz !== undefined && solveRateHz <= 0) ||
    (fixAgeMs !== undefined && fixAgeMs > 10 * STALE_FIX_AGE_MS)
  ) {
    return RtlsHealth.ERROR;
  }

  const stale = fixAgeMs !== undefined && fixAgeMs > STALE_FIX_AGE_MS;
  const lowRate =
    solveRateHz !== undefined && solveRateHz < MIN_HEALTHY_SOLVE_RATE_HZ;
  const lowPct = solvePct !== undefined && solvePct < MIN_HEALTHY_SOLVE_PCT;

  if (stale || lowRate || lowPct) {
    return RtlsHealth.WARNING;
  }

  return RtlsHealth.OK;
}

/**
 * Combines per-device health values into a single worst-case overall health.
 * ERROR dominates WARNING dominates OK; a mix of OK and IDLE devices is a
 * WARNING (part of the anchor set is asleep, so coverage is reduced), IDLE
 * alone stays IDLE. UNKNOWN is only returned when every device is unknown
 * (or there are no devices).
 */
export function getOverallHealth(healths: RtlsHealth[]): RtlsHealth {
  if (healths.length === 0) {
    return RtlsHealth.UNKNOWN;
  }

  if (healths.includes(RtlsHealth.ERROR)) {
    return RtlsHealth.ERROR;
  }

  if (healths.includes(RtlsHealth.WARNING)) {
    return RtlsHealth.WARNING;
  }

  const idle = healths.includes(RtlsHealth.IDLE);
  if (healths.includes(RtlsHealth.OK)) {
    return idle ? RtlsHealth.WARNING : RtlsHealth.OK;
  }

  return idle ? RtlsHealth.IDLE : RtlsHealth.UNKNOWN;
}

/**
 * Decodes an anchor bitmask into an array of per-anchor booleans, one entry per
 * bit, least-significant bit first (anchor 0).
 *
 * @param mask - The anchor bitmask.
 * @param count - Number of anchors to report; when omitted, the highest set bit
 *        determines the length.
 */
export function decodeAnchorMask(
  mask: number | undefined,
  count?: number
): boolean[] {
  if (mask === undefined || !Number.isFinite(mask) || mask < 0) {
    return [];
  }

  const intMask = Math.trunc(mask);
  const bits =
    count ?? (intMask === 0 ? 0 : Math.floor(Math.log2(intMask)) + 1);

  const result: boolean[] = [];
  for (let i = 0; i < bits; i++) {
    result.push((intMask & (1 << i)) !== 0);
  }

  return result;
}

/**
 * Counts the number of set bits (anchors present) in an anchor bitmask.
 */
export function countAnchorsInMask(mask: number | undefined): number {
  if (mask === undefined || !Number.isFinite(mask) || mask < 0) {
    return 0;
  }

  let count = 0;
  let intMask = Math.trunc(mask);
  while (intMask > 0) {
    count += intMask & 1;
    intMask >>>= 1;
  }

  return count;
}
