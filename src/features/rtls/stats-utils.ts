/**
 * @file Pure helpers for deriving health/summary information from RTLS device
 * statistics.
 *
 * This module is intentionally free of UI dependencies (e.g. the theme `Status`
 * enum) so it can be unit-tested in isolation. The mapping from {@link
 * RtlsHealth} to a theme `Status` lives in `health-status.ts`.
 */

import { type RtlsDevice, type RtlsDeviceStats } from './types';

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

/** Fixes older than this (ms) are considered stale. */
export const STALE_FIX_AGE_MS = 1000;

/** Solve rates below this (Hz) are considered degraded. */
const MIN_HEALTHY_SOLVE_RATE_HZ = 1;

/** Solve percentages below this are considered degraded. */
const MIN_HEALTHY_SOLVE_PCT = 50;

/**
 * Derives a coarse health classification for a single device from its stats.
 */
export function getDeviceHealth(
  stats: RtlsDeviceStats | undefined,
  device?: Pick<RtlsDevice, 'online' | 'role'>
): RtlsHealth {
  if (isAnchorRole(device?.role)) {
    return device?.online === false ? RtlsHealth.ERROR : RtlsHealth.OK;
  }

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
  const lowPct =
    solvePct !== undefined && solvePct < MIN_HEALTHY_SOLVE_PCT;

  if (stale || lowRate || lowPct) {
    return RtlsHealth.WARNING;
  }

  return RtlsHealth.OK;
}

export function isAnchorRole(role: string | undefined): boolean {
  return role === 'anchor-initiator' || role === 'anchor-responder';
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
  const bits = count ?? (intMask === 0 ? 0 : Math.floor(Math.log2(intMask)) + 1);

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
