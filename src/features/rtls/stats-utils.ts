/**
 * @file Pure helpers for deriving health/summary information from RTLS device
 * statistics.
 *
 * This module is intentionally free of UI dependencies (e.g. the theme `Status`
 * enum) so it can be unit-tested in isolation. The mapping from {@link
 * RtlsHealth} to a theme `Status` lives in `health-status.ts`.
 */

import { type RtlsDeviceStats } from './types';

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
}

/**
 * Coarse role classification of an RTLS device, derived from the device's
 * reported `role` (the server projects this from the firmware `UWB_ROLE`
 * param: 0 disabled, 1 tag, 2 anchor-initiator, 3 anchor-responder). A tag is
 * judged by its solve performance; an anchor is judged by liveness only.
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
 * Liveness of a device as reported in the X-RTLS-INF device snapshot. This is
 * the only signal that matters for anchor health: an anchor neither solves nor
 * reports a solve rate, so it is judged purely by whether the server still
 * hears it.
 */
export type DeviceLiveness = {
  /** Whether the server currently considers the device online. */
  online?: boolean;
  /** Seconds since the device was last heard from, if known. */
  age?: number;
};

/**
 * Derives the health of an anchor device from its liveness alone. Anchors do
 * not solve, so solve-rate/solve-% are irrelevant; an anchor is healthy iff the
 * server still hears it within the freshness window.
 */
export function getAnchorHealth(
  liveness: DeviceLiveness | undefined
): RtlsHealth {
  if (!liveness) {
    return RtlsHealth.UNKNOWN;
  }

  const { online, age } = liveness;

  if (online === false) {
    return RtlsHealth.ERROR;
  }

  if (age !== undefined && Number.isFinite(age) && age > STALE_ANCHOR_AGE_S) {
    return RtlsHealth.ERROR;
  }

  if (online === undefined && age === undefined) {
    return RtlsHealth.UNKNOWN;
  }

  return RtlsHealth.OK;
}

/**
 * Role-aware health for a single device. Anchors are judged by liveness
 * (last-seen), tags by their solve statistics. A disabled device contributes no
 * health signal (UNKNOWN).
 */
export function getDeviceHealthForRole(
  role: RtlsRole,
  stats: RtlsDeviceStats | undefined,
  liveness: DeviceLiveness | undefined
): RtlsHealth {
  if (role === RtlsRole.DISABLED) {
    // deliberately out of service: contributes no health signal, not even
    // its offline-ness — alarming on a device someone disabled is noise
    return RtlsHealth.UNKNOWN;
  }

  if (liveness && !liveness.online) {
    // an offline device is never healthy, no matter how good its RETAINED
    // stats look — without this, a tag that dropped off the network kept
    // the overall (header) health green on its cached solve stats
    return RtlsHealth.ERROR;
  }

  if (isAnchorRole(role)) {
    return getAnchorHealth(liveness);
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
 * ERROR dominates WARNING dominates OK; UNKNOWN is only returned when every
 * device is unknown (or there are no devices).
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

  if (healths.includes(RtlsHealth.OK)) {
    return RtlsHealth.OK;
  }

  return RtlsHealth.UNKNOWN;
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
