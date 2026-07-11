import { describe, expect, test } from '@jest/globals';

import { estimateShowCoordinateSystem } from '~/features/auto-fit/algorithm';
import type { CoordinateSystemFittingProblem } from '~/features/auto-fit/types';
import { OriginType } from '~/features/map/types';
import { FlatEarthCoordinateSystem, type LonLat } from '~/utils/geography';
import type { Coordinate2D } from '~/utils/math';

/** Ground truth show coordinate system used throughout the tests */
const TRUE_ORIGIN = [2.1734, 41.3851] as LonLat;
const TRUE_ORIENTATION = 37;

const trueCoordinateSystem = new FlatEarthCoordinateSystem({
  origin: TRUE_ORIGIN,
  orientation: TRUE_ORIENTATION,
  type: 'nwu',
});

/**
 * Creates a rectangular takeoff grid in show-local coordinates, centered
 * around a given offset.
 */
const createTakeoffGrid = (
  rows: number,
  columns: number,
  spacing: number,
  offset: Coordinate2D = [0, 0]
): Coordinate2D[] => {
  const result: Coordinate2D[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      result.push([
        row * spacing - ((rows - 1) * spacing) / 2 + offset[0],
        col * spacing - ((columns - 1) * spacing) / 2 + offset[1],
      ]);
    }
  }

  return result;
};

/**
 * Simple deterministic pseudo-random number generator (mulberry32) so the
 * tests are reproducible.
 */
const createRng = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = Math.trunc(state + 0x6d2b79f5);
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type ProblemOptions = {
  /** Standard deviation-ish position jitter, in meters */
  positionJitter?: number;
  /** Maximum absolute heading error, in degrees */
  headingJitter?: number;
  /** Constant offset added to every heading, in degrees */
  headingOffset?: number;
  /** Indices of takeoff positions that have no drone standing on them */
  missingDrones?: number[];
  seed?: number;
};

/**
 * Creates a fitting problem by placing a virtual drone on each takeoff
 * position of the grid (except the missing ones), converting the positions
 * to GPS coordinates with the ground truth coordinate system.
 */
const createProblem = (
  takeoffCoordinates: Coordinate2D[],
  options: ProblemOptions = {}
): CoordinateSystemFittingProblem => {
  const {
    positionJitter = 0,
    headingJitter = 0,
    headingOffset = 0,
    missingDrones = [],
    seed = 42,
  } = options;
  const rng = createRng(seed);

  const dronePositions = takeoffCoordinates.filter(
    (_coord, index) => !missingDrones.includes(index)
  );

  /* Shuffle the drones (Fisher-Yates) so the matching is not trivial */
  for (let i = dronePositions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [dronePositions[i], dronePositions[j]] = [
      dronePositions[j],
      dronePositions[i],
    ];
  }

  const uavGPSCoordinates = dronePositions.map((coord) =>
    trueCoordinateSystem.toLonLat([
      coord[0] + (rng() - 0.5) * 2 * positionJitter,
      coord[1] + (rng() - 0.5) * 2 * positionJitter,
    ])
  );
  const uavHeadings = dronePositions.map(
    () => TRUE_ORIENTATION + headingOffset + (rng() - 0.5) * 2 * headingJitter
  );

  return {
    uavIds: dronePositions.map((_coord, index) => String(index)),
    uavGPSCoordinates,
    uavHeadings,
    takeoffCoordinates,
  };
};

/** Returns the distance of the estimated origin from the true origin, in meters */
const originErrorInMeters = (estimatedOrigin: LonLat): number => {
  const [x, y] = trueCoordinateSystem.fromLonLat(estimatedOrigin);
  return Math.hypot(x, y);
};

/** Returns the (absolute) orientation error in degrees, handling wraparound */
const orientationErrorInDegrees = (estimatedOrientation: number): number => {
  const diff = (((estimatedOrientation - TRUE_ORIENTATION) % 360) + 360) % 360;
  return Math.min(diff, 360 - diff);
};

describe('estimateShowCoordinateSystem()', () => {
  const grid = createTakeoffGrid(3, 4, 2);

  test('recovers the coordinate system exactly for drones on their pads', () => {
    const estimate = estimateShowCoordinateSystem(createProblem(grid));

    expect(estimate.type).toBe(OriginType.NWU);
    expect(originErrorInMeters(estimate.origin)).toBeLessThan(0.05);
    expect(orientationErrorInDegrees(estimate.orientation)).toBeLessThan(0.1);
  });

  test('tolerates placement and heading noise', () => {
    const estimate = estimateShowCoordinateSystem(
      createProblem(grid, {
        positionJitter: 0.1,
        headingJitter: 5,
        seed: 1337,
      })
    );

    expect(originErrorInMeters(estimate.origin)).toBeLessThan(0.5);
    expect(orientationErrorInDegrees(estimate.orientation)).toBeLessThan(2);
  });

  test('recovers the orientation despite a constant compass bias', () => {
    /* All compasses are off by 20 degrees; the ICP refinement should
     * still snap the takeoff grid onto the real drone positions. The grid
     * is asymmetric (3x4 with 1x2 spacing) so the fit is unambiguous. */
    const asymmetricGrid = createTakeoffGrid(3, 4, 2).map(
      ([x, y]): Coordinate2D => [x, y * 0.5]
    );
    const estimate = estimateShowCoordinateSystem(
      createProblem(asymmetricGrid, { headingOffset: 20 })
    );

    expect(originErrorInMeters(estimate.origin)).toBeLessThan(0.1);
    expect(orientationErrorInDegrees(estimate.orientation)).toBeLessThan(0.5);
  });

  test('works when some takeoff positions have no drone', () => {
    const estimate = estimateShowCoordinateSystem(
      createProblem(grid, { missingDrones: [0, 5, 11] })
    );

    expect(originErrorInMeters(estimate.origin)).toBeLessThan(0.05);
    expect(orientationErrorInDegrees(estimate.orientation)).toBeLessThan(0.1);
  });

  test('works with a partially compass-less fleet', () => {
    const problem = createProblem(grid);
    problem.uavHeadings = problem.uavHeadings.map((heading, index) =>
      index % 2 === 0 ? heading : undefined
    );

    const estimate = estimateShowCoordinateSystem(problem);

    expect(originErrorInMeters(estimate.origin)).toBeLessThan(0.05);
    expect(orientationErrorInDegrees(estimate.orientation)).toBeLessThan(0.1);
  });

  test('throws when there are no drones with a GPS position', () => {
    const problem = createProblem(grid);
    problem.uavGPSCoordinates = [];
    problem.uavHeadings = [];
    problem.uavIds = [];

    expect(() => estimateShowCoordinateSystem(problem)).toThrow();
  });
});
