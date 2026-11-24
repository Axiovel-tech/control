import { describe, expect, test } from '@jest/globals';

import {
  EMPTY_SKETCH,
  frameTransform,
  fromFrame,
  planMarkers,
  type RtlsSurveyAnchor,
  type RtlsSurveySketch,
  sketchHintKeys,
  sketchProblemKey,
  standardCellSketch,
  surveyCells,
  surveyGroup,
  surveyTarget,
  toFrame,
  withAnchorGroup,
  withAnchorIncluded,
  withAnchorMoved,
  withGroupAdded,
  withOrigin,
  withXAxis,
} from '~/features/rtls/survey-sketch';

/** Anchors 100 + slot for the given slots, none storing a position. */
const anchorsAt = (...slots: number[]): RtlsSurveyAnchor[] =>
  slots.map((slot) => ({
    id: String(100 + slot),
    name: `RTLS anchor A${slot}`,
    slot,
    cell: 'hall',
  }));

const EIGHT = anchorsAt(0, 1, 2, 3, 4, 5, 6, 7);

/** A sketch by hand: an L of four anchors, drawn turned a quarter. */
const TURNED: RtlsSurveySketch = {
  ...EMPTY_SKETCH,
  positions: {
    '100': { north: 2, east: 1 },
    // +x points east on the drawing
    '101': { north: 2, east: 5 },
    // to the right of +x seen from above: south on the drawing
    '102': { north: -1, east: 1 },
    '103': { north: -1, east: 5 },
  },
  origin: '100',
  xAxis: '101',
};

describe('the standard cell', () => {
  test('lays out two tiers from the slots, with A0 and A1 as the frame', () => {
    const sketch = standardCellSketch(EIGHT);
    expect(sketch).toMatchObject({
      standard: true,
      origin: '100',
      xAxis: '101',
      groupOf: {
        '100': 0,
        '103': 0,
        '104': 1,
        '107': 1,
      },
    });
    // A1 along +x (north on the plan), A2 along +y (east), A3 across
    expect(sketch.positions['101']).toEqual({ north: 5, east: 0 });
    expect(sketch.positions['102']).toEqual({ north: 0, east: 5 });
    expect(sketch.positions['103']).toEqual({ north: 5, east: 5 });
    // the upper tier stands above the lower one, drawn beside it
    expect(sketch.positions['106']).toEqual({ north: 0.6, east: 5.6 });
  });

  test('takes its sides from the ranges A1 and A2 report to A0', () => {
    const anchors = anchorsAt(0, 1, 2, 3).map((anchor) => ({
      ...anchor,
      initiatorDistanceM:
        anchor.slot === 1 ? 7.5 : anchor.slot === 2 ? 4 : undefined,
    }));
    expect(standardCellSketch(anchors).positions['103']).toEqual({
      north: 7.5,
      east: 4,
    });
  });

  test('is sent as the preset, anchors in slot order, with no placement', () => {
    const shuffled = [
      EIGHT[5],
      EIGHT[0],
      ...EIGHT.slice(1, 5),
      ...EIGHT.slice(6),
    ];
    expect(surveyTarget(standardCellSketch(shuffled), shuffled)).toEqual({
      anchors: [100, 101, 102, 103, 104, 105, 106, 107],
      frame: { preset: 'two-tiers' },
    });
  });

  test('with a slot missing the frame is spelled out: the preset would shift the tiers', () => {
    const present = anchorsAt(0, 1, 2, 4, 5, 6, 7);
    expect(surveyTarget(standardCellSketch(present), present)).toEqual({
      anchors: [100, 101, 102, 104, 105, 106, 107],
      frame: {
        origin: 100,
        xAxis: 101,
        heightGroups: [
          [100, 101, 102],
          [104, 105, 106, 107],
        ],
        upper: [104, 105, 106, 107],
        yPositive: 102,
      },
    });
  });

  test('an anchor left out of an eight-anchor cell also spells it out', () => {
    const sketch = withAnchorIncluded(standardCellSketch(EIGHT), '103', false);
    const target = surveyTarget(sketch, surveyGroup(sketch, EIGHT));
    expect(target?.anchors).toEqual([100, 101, 102, 104, 105, 106, 107]);
    expect(target?.frame).toMatchObject({ origin: 100, yPositive: 102 });
    expect(target?.placement).toBeUndefined();
  });

  test("an edit by hand makes it the operator's sketch", () => {
    const standard = standardCellSketch(EIGHT);
    for (const edited of [
      withAnchorMoved(standard, '103', { north: 5, east: 6 }),
      withAnchorGroup(standard, '103', 1),
      withOrigin(standard, '102'),
      withXAxis(standard, '102'),
    ]) {
      expect(edited.standard).toBe(false);
      expect(surveyTarget(edited, EIGHT)?.frame).not.toHaveProperty('preset');
    }
    // who is surveyed is not the layout
    expect(withAnchorIncluded(standard, '107', false).standard).toBe(true);
  });
});

describe('a sketch by hand', () => {
  const FOUR = anchorsAt(0, 1, 2, 3);

  test('is turned and shifted into the declared frame, never mirrored', () => {
    const transform = frameTransform(TURNED, FOUR);
    expect(toFrame(transform, TURNED.positions['100'])).toEqual({ x: 0, y: 0 });
    const xAxis = toFrame(transform, TURNED.positions['101']);
    expect(xAxis.x).toBeCloseTo(4);
    expect(xAxis.y).toBeCloseTo(0);
    // drawn to the right of the +x direction: +y, as seen from above
    const right = toFrame(transform, TURNED.positions['102']);
    expect(right.x).toBeCloseTo(0);
    expect(right.y).toBeCloseTo(3);
  });

  test('a fitted position lands back on the drawing', () => {
    const transform = frameTransform(TURNED, FOUR);
    const back = fromFrame(transform, { x: 4, y: 3 });
    expect(back.north).toBeCloseTo(-1);
    expect(back.east).toBeCloseTo(5);
    // without both frame anchors drawn the plan is the frame: north is +x
    expect(
      fromFrame(frameTransform(EMPTY_SKETCH, FOUR), { x: 4, y: 3 })
    ).toEqual({ north: 4, east: 3 });
  });

  test('sends x and y of every anchor, the +y side, and no height', () => {
    expect(surveyTarget(TURNED, FOUR)).toEqual({
      anchors: [100, 101, 102, 103],
      frame: {
        origin: 100,
        xAxis: 101,
        heightGroups: [[100, 101, 102, 103]],
        upper: [],
        yPositive: 102,
      },
      placement: {
        '100': { x: 0, y: 0 },
        '101': { x: 4, y: 0 },
        '102': { x: 0, y: 3 },
        '103': { x: 4, y: 3 },
      },
    });
  });

  test("height groups: the origin's is z = 0 and `upper` is what stands above it", () => {
    const named = withGroupAdded(TURNED, ' Truss ');
    expect(named.groups).toEqual(['Truss']);
    // a blank or repeated name adds nothing
    expect(withGroupAdded(named, 'Truss')).toBe(named);
    expect(withGroupAdded(named, '  ')).toBe(named);

    const sketch = withAnchorGroup(withAnchorGroup(named, '102', 1), '103', 2);
    expect(surveyTarget(sketch, FOUR)?.frame).toMatchObject({
      heightGroups: [[100, 101], [102], [103]],
      upper: [102, 103],
    });
    expect(sketchHintKeys(sketch, FOUR)).toEqual([]);

    // with the origin in the middle nothing says what is below it
    const middle = withOrigin(withXAxis(sketch, '103'), '102');
    expect(surveyTarget(middle, FOUR)?.frame).toMatchObject({ upper: [103] });
    expect(sketchHintKeys(middle, FOUR)).toEqual([
      'rtlsSurvey.hint.originNotLowest',
    ]);
  });

  test('no anchor drawn on the +y side: none is named', () => {
    const sketch: RtlsSurveySketch = {
      ...TURNED,
      positions: {
        ...TURNED.positions,
        // both others to the left of +x
        '102': { north: 5, east: 1 },
        '103': { north: 5, east: 5 },
      },
    };
    expect(surveyTarget(sketch, FOUR)?.frame).not.toHaveProperty('yPositive');
  });

  test('stored positions start the plan; a placement is sent once one was dragged', () => {
    const stored = FOUR.map((anchor, index) => ({
      ...anchor,
      stored: { north: index % 2 === 1 ? 6 : 0, east: index >= 2 ? 4 : 0 },
    }));
    const sketch = { ...EMPTY_SKETCH, origin: '100', xAxis: '101' };
    expect(planMarkers(sketch, stored)['103']).toEqual({
      point: { north: 6, east: 4 },
      known: true,
    });
    // nothing dragged: the server starts from what the anchors store
    expect(surveyTarget(sketch, stored)).toEqual({
      anchors: [100, 101, 102, 103],
      frame: {
        origin: 100,
        xAxis: 101,
        heightGroups: [[100, 101, 102, 103]],
        upper: [],
        yPositive: 102,
      },
    });
    // one anchor moved: the whole sketch goes, the others where they store
    const moved = withAnchorMoved(sketch, '103', { north: 6.5, east: 3.5 });
    expect(surveyTarget(moved, stored)?.placement).toEqual({
      '100': { x: 0, y: 0 },
      '101': { x: 6, y: 0 },
      '102': { x: 0, y: 4 },
      '103': { x: 6.5, y: 3.5 },
    });
  });

  test('an anchor not placed yet is parked below the rest and left out of the placement', () => {
    const sketch: RtlsSurveySketch = {
      ...TURNED,
      positions: {
        '100': TURNED.positions['100'],
        '101': TURNED.positions['101'],
      },
    };
    const markers = planMarkers(sketch, FOUR);
    expect(markers['102']).toEqual({
      point: { north: 0.5, east: 1 },
      known: false,
    });
    expect(markers['103']).toEqual({
      point: { north: 0.5, east: 2 },
      known: false,
    });
    expect(Object.keys(surveyTarget(sketch, FOUR)?.placement ?? {})).toEqual([
      '100',
      '101',
    ]);
    expect(sketchHintKeys(sketch, FOUR)).toEqual([
      'rtlsSurvey.hint.partialSketch',
    ]);
    // nothing placed at all: a row from the plan's origin
    expect(planMarkers(EMPTY_SKETCH, FOUR)['103'].point).toEqual({
      north: 0,
      east: 3,
    });
  });
});

describe('what a sketch lacks', () => {
  const FOUR = anchorsAt(0, 1, 2, 3);

  test('three to eight anchors, an origin and a +x anchor among them', () => {
    expect(sketchProblemKey(TURNED, FOUR)).toBeUndefined();
    expect(sketchProblemKey(TURNED, FOUR.slice(0, 2))).toBe(
      'rtlsSurvey.problem.tooFew'
    );
    expect(sketchProblemKey(TURNED, [...EIGHT, ...anchorsAt(8)])).toBe(
      'rtlsSurvey.problem.tooMany'
    );
    expect(sketchProblemKey(EMPTY_SKETCH, FOUR)).toBe(
      'rtlsSurvey.problem.pickOrigin'
    );
    expect(sketchProblemKey({ ...TURNED, xAxis: undefined }, FOUR)).toBe(
      'rtlsSurvey.problem.pickXAxis'
    );
    expect(sketchProblemKey(withXAxis(TURNED, '100'), FOUR)).toBe(
      'rtlsSurvey.problem.sameAnchor'
    );
    // nothing is sent for a sketch with a problem
    expect(surveyTarget(EMPTY_SKETCH, FOUR)).toBeUndefined();
  });

  test('the origin left out of the survey is no origin', () => {
    const sketch = withAnchorIncluded(TURNED, '100', false);
    expect(sketchProblemKey(sketch, surveyGroup(sketch, EIGHT))).toBe(
      'rtlsSurvey.problem.pickOrigin'
    );
    expect(
      sketchProblemKey(
        withAnchorIncluded(sketch, '100', true),
        surveyGroup(withAnchorIncluded(sketch, '100', true), FOUR)
      )
    ).toBeUndefined();
  });
});

describe('the cells', () => {
  test('one cell: every online anchor, in slot order, the unknown last', () => {
    const stray: RtlsSurveyAnchor = { id: '9', name: 'RTLS anchor 9' };
    const cells = surveyCells([stray, ...anchorsAt(2, 0, 1)]);
    expect(Object.keys(cells)).toEqual(['hall']);
    expect(cells.hall.map(({ id }) => id)).toEqual(['100', '101', '102', '9']);
  });

  test('no cell known, or several: anchors without one keep to themselves', () => {
    expect(Object.keys(surveyCells([{ id: '9', name: '9' }]))).toEqual([
      'default',
    ]);
    const other = { ...anchorsAt(0)[0], id: '200', cell: 'stage' };
    const cells = surveyCells([
      ...anchorsAt(0, 1),
      other,
      { id: '9', name: '9' },
    ]);
    expect(Object.keys(cells).sort()).toEqual(['default', 'hall', 'stage']);
  });
});
