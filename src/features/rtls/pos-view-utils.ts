/**
 * @file Pure geometry and staleness helpers for the "Debug Pos Estimates"
 * top-down view. Kept free of React/Redux so the projection math is
 * unit-testable.
 *
 * The view is a top-down plot of the anchor cell's NED frame: north points up
 * on the screen and east points right, so a point maps to
 * `x = east, y = -north` in a Y-down (SVG) coordinate system.
 */

import { type RtlsAnchor, type RtlsPosEstimate } from './types';

/** A 2D point in the cell's horizontal plane, metres. */
export type NePoint = {
  north: number;
  east: number;
};

/** Scene bounds in the cell frame, metres. */
export type SceneBounds = {
  minNorth: number;
  maxNorth: number;
  minEast: number;
  maxEast: number;
};

/** Staleness classification of a position estimate. */
export enum PosStaleness {
  /** Fresh: updated within the last couple of seconds. */
  LIVE = 'live',
  /** The stream has paused; the last estimate is shown faded. */
  STALE = 'stale',
  /** No update for a long time; the estimate should be dimmed out. */
  GONE = 'gone',
}

/** Age (ms) above which an estimate is considered stale. */
export const POS_STALE_AGE_MS = 2000;

/** Age (ms) above which an estimate is considered gone. */
export const POS_GONE_AGE_MS = 10_000;

/**
 * Returns the age of a position estimate in milliseconds, based on its
 * client-side arrival stamp, or `undefined` when the estimate has none.
 */
export const getPosEstimateAgeMs = (
  estimate: RtlsPosEstimate | undefined,
  now: number
): number | undefined =>
  estimate?.receivedAt === undefined
    ? undefined
    : Math.max(0, now - estimate.receivedAt);

/** Classifies the staleness of a position estimate at the given time. */
export const getPosStaleness = (
  estimate: RtlsPosEstimate | undefined,
  now: number
): PosStaleness => {
  const age = getPosEstimateAgeMs(estimate, now);
  if (age === undefined || age >= POS_GONE_AGE_MS) {
    return PosStaleness.GONE;
  }

  return age >= POS_STALE_AGE_MS ? PosStaleness.STALE : PosStaleness.LIVE;
};

/** Returns whether an estimate carries a plottable horizontal position. */
export const hasPlottablePosition = (
  estimate: RtlsPosEstimate | undefined
): estimate is RtlsPosEstimate & { north: number; east: number } =>
  estimate !== undefined &&
  typeof estimate.north === 'number' &&
  typeof estimate.east === 'number';

/** Returns whether an anchor carries a plottable horizontal position. */
export const hasPlottableAnchor = (
  anchor: RtlsAnchor
): anchor is RtlsAnchor & { ned: { north: number; east: number } } =>
  typeof anchor.ned?.north === 'number' && typeof anchor.ned?.east === 'number';

/**
 * Computes the bounds of the scene from the plottable anchors and position
 * estimates, expanded by a margin (metres, with a minimum span so a
 * single-point scene still renders sensibly). Returns `undefined` when there
 * is nothing to plot.
 */
export function computeSceneBounds(
  anchors: RtlsAnchor[],
  estimates: RtlsPosEstimate[],
  { margin = 1, minSpan = 4 }: { margin?: number; minSpan?: number } = {}
): SceneBounds | undefined {
  const points: NePoint[] = [];
  for (const anchor of anchors) {
    if (hasPlottableAnchor(anchor)) {
      points.push({ north: anchor.ned.north, east: anchor.ned.east });
    }
  }

  for (const estimate of estimates) {
    if (hasPlottablePosition(estimate)) {
      points.push({ north: estimate.north, east: estimate.east });
    }
  }

  if (points.length === 0) {
    return undefined;
  }

  let minNorth = Number.POSITIVE_INFINITY;
  let maxNorth = Number.NEGATIVE_INFINITY;
  let minEast = Number.POSITIVE_INFINITY;
  let maxEast = Number.NEGATIVE_INFINITY;
  for (const { north, east } of points) {
    minNorth = Math.min(minNorth, north);
    maxNorth = Math.max(maxNorth, north);
    minEast = Math.min(minEast, east);
    maxEast = Math.max(maxEast, east);
  }

  minNorth -= margin;
  maxNorth += margin;
  minEast -= margin;
  maxEast += margin;

  const padAxis = (min: number, max: number): [number, number] => {
    const span = max - min;
    if (span >= minSpan) {
      return [min, max];
    }

    const pad = (minSpan - span) / 2;
    return [min - pad, max + pad];
  };

  [minNorth, maxNorth] = padAxis(minNorth, maxNorth);
  [minEast, maxEast] = padAxis(minEast, maxEast);

  return { minNorth, maxNorth, minEast, maxEast };
}

/**
 * Returns whether every plottable estimate lies within the given bounds —
 * the cheap O(n) check that lets the view reuse its last computed scene
 * bounds (and skip `computeSceneBounds`) until a point actually leaves the
 * frame. Estimates without a plottable position are ignored.
 */
export function boundsContain(
  bounds: SceneBounds,
  estimates: RtlsPosEstimate[]
): boolean {
  for (const estimate of estimates) {
    if (!hasPlottablePosition(estimate)) {
      continue;
    }

    if (
      estimate.north < bounds.minNorth ||
      estimate.north > bounds.maxNorth ||
      estimate.east < bounds.minEast ||
      estimate.east > bounds.maxEast
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Picks a "nice" grid step (metres) for the given span so the view shows
 * roughly `maxLines` grid lines at most.
 */
export function getGridStep(span: number, maxLines = 12): number {
  const steps = [0.5, 1, 2, 5, 10, 20, 50, 100];
  for (const step of steps) {
    if (span / step <= maxLines) {
      return step;
    }
  }

  return steps[steps.length - 1];
}

/** Returns the grid line coordinates within [min, max] for the given step. */
export function getGridLines(min: number, max: number, step: number): number[] {
  const result: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) {
    // normalize -0 and floating point dust for stable rendering keys
    result.push(Math.round(v * 1000) / 1000);
  }

  return result;
}

/** A single trail sample of a tag. */
export type TrailPoint = NePoint & {
  /** Client-side arrival timestamp of the sample. */
  receivedAt: number;
};

/** Maximum number of samples kept in a tag's trail. */
export const MAX_TRAIL_LENGTH = 60;

/**
 * Appends a position estimate to a trail (in place), deduplicating by the
 * arrival stamp and capping the length. Returns the trail for convenience.
 */
export function appendToTrail(
  trail: TrailPoint[],
  estimate: RtlsPosEstimate,
  maxLength = MAX_TRAIL_LENGTH
): TrailPoint[] {
  if (!hasPlottablePosition(estimate) || estimate.receivedAt === undefined) {
    return trail;
  }

  const last = trail.at(-1);
  if (last && last.receivedAt >= estimate.receivedAt) {
    return trail;
  }

  trail.push({
    north: estimate.north,
    east: estimate.east,
    receivedAt: estimate.receivedAt,
  });
  if (trail.length > maxLength) {
    trail.splice(0, trail.length - maxLength);
  }

  return trail;
}
