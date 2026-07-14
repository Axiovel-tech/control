import { describe, expect, test } from '@jest/globals';

import {
  appendToTrail,
  boundsContain,
  computeSceneBounds,
  getGridLines,
  getGridStep,
  getPosEstimateAgeMs,
  getPosStaleness,
  MAX_TRAIL_LENGTH,
  POS_GONE_AGE_MS,
  POS_STALE_AGE_MS,
  PosStaleness,
  type TrailPoint,
} from '~/features/rtls/pos-view-utils';

describe('rtls pos-view-utils', () => {
  describe('staleness', () => {
    test('age is derived from the arrival stamp and clamped at zero', () => {
      expect(getPosEstimateAgeMs({ id: '1', receivedAt: 900 }, 1000)).toBe(100);
      expect(getPosEstimateAgeMs({ id: '1', receivedAt: 1100 }, 1000)).toBe(0);
      expect(getPosEstimateAgeMs({ id: '1' }, 1000)).toBeUndefined();
      expect(getPosEstimateAgeMs(undefined, 1000)).toBeUndefined();
    });

    test('classification follows the thresholds', () => {
      const at = (age: number) =>
        getPosStaleness({ id: '1', receivedAt: 0 }, age);
      expect(at(0)).toBe(PosStaleness.LIVE);
      expect(at(POS_STALE_AGE_MS - 1)).toBe(PosStaleness.LIVE);
      expect(at(POS_STALE_AGE_MS)).toBe(PosStaleness.STALE);
      expect(at(POS_GONE_AGE_MS)).toBe(PosStaleness.GONE);
      // an estimate with no arrival stamp is never considered live
      expect(getPosStaleness({ id: '1' }, 0)).toBe(PosStaleness.GONE);
    });
  });

  describe('computeSceneBounds', () => {
    test('returns undefined when there is nothing to plot', () => {
      expect(computeSceneBounds([], [])).toBeUndefined();
      // anchors without NED coordinates are not plottable
      expect(
        computeSceneBounds([{ id: 'a', ned: {} }], [{ id: '1' }])
      ).toBeUndefined();
    });

    test('covers anchors and estimates with a margin', () => {
      const bounds = computeSceneBounds(
        [
          { id: 'a0', ned: { north: -10, east: -10, down: 0 } },
          { id: 'a1', ned: { north: 10, east: 10, down: -4.8 } },
        ],
        [{ id: '1', north: 12, east: 0 }],
        { margin: 1 }
      );
      expect(bounds).toEqual({
        minNorth: -11,
        maxNorth: 13,
        minEast: -11,
        maxEast: 11,
      });
    });

    test('pads a degenerate (single-point) scene up to the minimum span', () => {
      const bounds = computeSceneBounds([], [{ id: '1', north: 0, east: 0 }], {
        margin: 1,
        minSpan: 4,
      });
      expect(bounds).toEqual({
        minNorth: -2,
        maxNorth: 2,
        minEast: -2,
        maxEast: 2,
      });
    });
  });

  describe('boundsContain', () => {
    const bounds = { minNorth: -2, maxNorth: 2, minEast: -3, maxEast: 3 };

    test('true when every plottable estimate is inside', () => {
      expect(
        boundsContain(bounds, [
          { id: '1', north: 0, east: 0 },
          { id: '2', north: -2, east: 3 }, // on the edge counts as inside
          { id: '3' }, // not plottable: ignored
        ])
      ).toBe(true);
      expect(boundsContain(bounds, [])).toBe(true);
    });

    test('false as soon as one estimate leaves the frame', () => {
      expect(boundsContain(bounds, [{ id: '1', north: 2.5, east: 0 }])).toBe(
        false
      );
      expect(boundsContain(bounds, [{ id: '1', north: 0, east: -3.5 }])).toBe(
        false
      );
    });
  });

  describe('grid', () => {
    test('picks a step that keeps the line count bounded', () => {
      expect(getGridStep(4)).toBe(0.5);
      expect(getGridStep(20)).toBe(2);
      expect(getGridStep(100)).toBe(10);
      // absurdly large spans saturate at the largest step
      expect(getGridStep(1e6)).toBe(100);
    });

    test('generates the lines within the range', () => {
      expect(getGridLines(-2.5, 2.5, 1)).toEqual([-2, -1, 0, 1, 2]);
      expect(getGridLines(0, 10, 5)).toEqual([0, 5, 10]);
    });
  });

  describe('appendToTrail', () => {
    test('appends plottable samples in arrival order, deduplicating', () => {
      const trail: TrailPoint[] = [];
      appendToTrail(trail, { id: '1', north: 1, east: 2, receivedAt: 100 });
      // same stamp: ignored
      appendToTrail(trail, { id: '1', north: 9, east: 9, receivedAt: 100 });
      appendToTrail(trail, { id: '1', north: 2, east: 3, receivedAt: 200 });
      // no coordinates or no stamp: ignored
      appendToTrail(trail, { id: '1', receivedAt: 300 });
      appendToTrail(trail, { id: '1', north: 4, east: 5 });

      expect(trail).toEqual([
        { north: 1, east: 2, receivedAt: 100 },
        { north: 2, east: 3, receivedAt: 200 },
      ]);
    });

    test('caps the trail length', () => {
      const trail: TrailPoint[] = [];
      for (let i = 0; i < MAX_TRAIL_LENGTH + 10; i++) {
        appendToTrail(trail, { id: '1', north: i, east: 0, receivedAt: i });
      }

      expect(trail).toHaveLength(MAX_TRAIL_LENGTH);
      expect(trail.at(-1)).toMatchObject({ north: MAX_TRAIL_LENGTH + 9 });
      expect(trail[0]).toMatchObject({ north: 10 });
    });
  });
});
