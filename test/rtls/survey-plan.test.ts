import { describe, expect, test } from '@jest/globals';

import { type SceneBounds } from '~/features/rtls/pos-view-utils';
import {
  type ElevationEntry,
  MAX_TIER,
  planAxes,
  surveyElevation,
  TIER_LABELS,
  tierOf,
  tierRadius,
} from '~/features/rtls/survey-plan';

const WIDE: SceneBounds = {
  minNorth: -100,
  maxNorth: 100,
  minEast: -100,
  maxEast: 100,
};

describe('a marker per height group', () => {
  test('the lowest group is a dot, each group above a wider ring', () => {
    expect([0, 1, 2, 3].map(tierOf)).toEqual([0, 1, 2, 3]);
    expect(tierRadius(0)).toBe(1);
    expect(tierRadius(1)).toBeGreaterThan(tierRadius(0));
    expect(tierRadius(2)).toBeGreaterThan(tierRadius(1));
    // more groups than markers: the highest share the last one
    expect(tierOf(7)).toBe(MAX_TIER);
  });

  test('every tier has a corner of its own for its label', () => {
    const corners = TIER_LABELS.map(
      ({ dx, dy }) => `${Math.sign(dx)},${Math.sign(dy)}`
    );
    expect(TIER_LABELS).toHaveLength(MAX_TIER + 1);
    expect(new Set(corners).size).toBe(TIER_LABELS.length);
  });
});

describe('the axes on the top view', () => {
  test('X runs from the origin anchor through the +x anchor', () => {
    const axes = planAxes(
      { north: 0, east: 0 },
      { north: 10, east: 0 },
      1,
      WIDE
    );
    expect(axes?.origin).toEqual({ north: 0, east: 0 });
    expect(axes?.xTip).toEqual({ north: 11, east: 0 });
  });

  test('Y is at a right angle, to the right of X seen from above', () => {
    // x north: y east, as in the frame the tags solve in (z down)
    const plain = planAxes(
      { north: 0, east: 0 },
      { north: 10, east: 0 },
      1,
      WIDE
    );
    expect(plain?.yTip.east).toBeCloseTo(5);
    expect(plain?.yTip.north).toBeCloseTo(0);
    // a sketch drawn turned a quarter: x east, so y points south
    const turned = planAxes(
      { north: 2, east: 1 },
      { north: 2, east: 5 },
      1,
      WIDE
    );
    expect(turned?.xTip).toEqual({ north: 2, east: 6 });
    expect(turned?.yTip.east).toBeCloseTo(1);
    expect(turned?.yTip.north).toBeCloseTo(0);
  });

  test('the arrows end inside the view, which is laid out around the anchors', () => {
    const tight: SceneBounds = {
      minNorth: -1.5,
      maxNorth: 11.5,
      minEast: -1.5,
      maxEast: 2,
    };
    const axes = planAxes(
      { north: 0, east: 0 },
      { north: 10, east: 0 },
      2,
      tight
    );
    // half the overshoot is kept clear of each edge
    expect(axes?.xTip).toEqual({ north: 10.5, east: 0 });
    expect(axes?.yTip.east).toBeCloseTo(1);
    expect(axes?.yTip.north).toBeCloseTo(0);
    // an origin on the edge has no room for an arrow outwards
    expect(
      planAxes({ north: 0, east: 2 }, { north: 10, east: 2 }, 2, tight)?.yTip
    ).toEqual({ north: 0, east: 2 });
  });

  test('none until both anchors are drawn, apart', () => {
    const point = { north: 1, east: 1 };
    expect(planAxes(undefined, point, 1, WIDE)).toBeUndefined();
    expect(planAxes(point, undefined, 1, WIDE)).toBeUndefined();
    expect(planAxes(point, { north: 1.05, east: 1 }, 1, WIDE)).toBeUndefined();
  });
});

describe('the side view', () => {
  /** Two tiers of four: 0..3 below, 4..7 right above them. */
  const twoTiers = (heights?: [number, number]): ElevationEntry[] =>
    [0, 1, 2, 3, 4, 5, 6, 7].map((slot) => ({
      id: `A${slot}`,
      east: slot % 4 >= 2 ? 11 : 0,
      level: slot >= 4 ? 1 : 0,
      heightM: heights?.[slot >= 4 ? 1 : 0],
    }));

  test('before a fit: one step per height group, lowest first', () => {
    const view = surveyElevation(twoTiers(), 0.5);
    expect(view.metric).toBe(false);
    expect(view.rows).toEqual([
      { level: 0, heightM: undefined },
      { level: 1, heightM: undefined },
    ]);
  });

  test('anchors behind each other are one mark with all their names', () => {
    const { marks } = surveyElevation(twoTiers(), 0.5);
    expect(marks).toEqual([
      { ids: ['A0', 'A1'], east: 0, row: 0 },
      { ids: ['A2', 'A3'], east: 11, row: 0 },
      { ids: ['A4', 'A5'], east: 0, row: 1 },
      { ids: ['A6', 'A7'], east: 11, row: 1 },
    ]);
    // the upper anchors never share a mark with the lower ones under them
    expect(
      marks.every(({ ids }) => new Set(ids.map((id) => id > 'A3')).size === 1)
    ).toBe(true);
  });

  test('with heights: to scale, each row with the mean height of its anchors', () => {
    const entries = twoTiers([0, 4.5]).map((entry) =>
      entry.id === 'A5' ? { ...entry, heightM: 4.52 } : entry
    );
    const view = surveyElevation(entries, 0.5);
    expect(view.metric).toBe(true);
    expect(view.rows[0]).toEqual({ level: 0, heightM: 0 });
    expect(view.rows[1].level).toBe(1);
    expect(view.rows[1].heightM).toBeCloseTo(4.505);
  });

  test('a row is named by its group only when it holds exactly that group', () => {
    // the anchors store two heights, but the sketch calls them all Lower
    const stored = twoTiers([0, 4.5]).map((entry) => ({ ...entry, level: 0 }));
    expect(surveyElevation(stored, 0.5).rows).toEqual([
      { level: undefined, heightM: 0 },
      { level: undefined, heightM: 4.5 },
    ]);
  });

  test('one height missing: back to steps', () => {
    const entries = twoTiers([0, 4.5]);
    entries[3] = { ...entries[3], heightM: undefined };
    expect(surveyElevation(entries, 0.5).metric).toBe(false);
  });

  test('nothing to draw without anchors', () => {
    expect(surveyElevation([], 0.5)).toEqual({
      metric: false,
      rows: [],
      marks: [],
    });
  });
});
