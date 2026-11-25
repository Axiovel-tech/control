import { describe, expect, test } from '@jest/globals';

import {
  fitSignature,
  frameTransform,
  fromFrame,
  heldFitTransform,
  PLAN_AS_FRAME,
  type RtlsSurveyFitBasis,
  sketchProblemKey,
  surveyTarget,
} from '~/features/rtls/survey-frame';
import {
  EMPTY_SKETCH,
  type RtlsSurveyAnchor,
  type RtlsSurveySketch,
  withAnchorMoved,
  withXAxis,
} from '~/features/rtls/survey-sketch';

const FOUR: RtlsSurveyAnchor[] = [0, 1, 2, 3].map((slot) => ({
  id: String(100 + slot),
  name: `RTLS anchor A${slot}`,
  slot,
}));

/** A 4 m by 3 m rectangle drawn as the frame: A0 origin, A1 on +x. */
const SQUARE: RtlsSurveySketch = {
  ...EMPTY_SKETCH,
  positions: {
    '100': { north: 0, east: 0 },
    '101': { north: 4, east: 0 },
    '102': { north: 0, east: 3 },
    '103': { north: 4, east: 3 },
  },
  origin: '100',
  xAxis: '101',
};

describe('the origin and +x anchors on one spot', () => {
  // the two stand above each other in the venue and were drawn so
  const stacked = withAnchorMoved(SQUARE, '101', { north: 0.02, east: 0 });

  test('is a problem the page names, and nothing is sent', () => {
    expect(sketchProblemKey(stacked, FOUR)).toBe(
      'rtlsSurvey.problem.drawApart'
    );
    expect(surveyTarget(stacked, FOUR)).toBeUndefined();
    expect(frameTransform(stacked, FOUR)).toBeUndefined();
  });

  test('ten centimetres apart is a direction', () => {
    const apart = withAnchorMoved(SQUARE, '101', { north: 0.1, east: 0 });
    expect(sketchProblemKey(apart, FOUR)).toBeUndefined();
    expect(surveyTarget(apart, FOUR)?.placement?.['101']).toEqual({
      x: 0.1,
      y: 0,
    });
  });

  test('a frame anchor not drawn yet gives no placement and no +y side', () => {
    // the origin waits to be placed; the rest is drawn away from the plan's 0
    const sketch: RtlsSurveySketch = {
      ...SQUARE,
      positions: {
        '101': { north: 14, east: 10 },
        '102': { north: 10, east: 13 },
        '103': { north: 14, east: 13 },
      },
    };
    expect(sketchProblemKey(sketch, FOUR)).toBeUndefined();
    const target = surveyTarget(sketch, FOUR);
    expect(target).toBeDefined();
    expect(target).not.toHaveProperty('placement');
    expect(target?.frame).not.toHaveProperty('yPositive');
  });
});

describe('the sketch a fit was made with', () => {
  const order = [100, 101, 102, 103];
  const explicit: RtlsSurveyFitBasis = {
    frame: {
      origin: 100,
      xAxis: 101,
      heightGroups: [[100, 101, 102, 103]],
      upper: [],
      yPositive: 102,
    },
  };

  test('the preset is the frame it stands for', () => {
    expect(fitSignature({ frame: { preset: 'two-tiers' } }, order)).toBe(
      fitSignature(explicit, order)
    );
    // eight anchors: the second four are the upper tier
    const eight = [...order, 104, 105, 106, 107];
    expect(fitSignature({ frame: { preset: 'two-tiers' } }, eight)).toBe(
      fitSignature(
        {
          frame: {
            origin: 100,
            xAxis: 101,
            heightGroups: [
              [107, 106, 105, 104],
              [103, 102, 101, 100],
            ],
            upper: [107, 104, 105, 106],
            yPositive: 102,
          },
        },
        eight
      )
    );
  });

  test('an empty placement is none; lengths compare to the centimetre', () => {
    expect(fitSignature({ ...explicit, placement: {} }, order)).toBe(
      fitSignature(explicit, order)
    );
    const placed = (x: number): RtlsSurveyFitBasis => ({
      ...explicit,
      placement: { '101': { x, y: 0 }, '100': { x: 0, y: 0 } },
    });
    expect(fitSignature(placed(4), order)).toBe(
      fitSignature(placed(4.0004), order)
    );
    expect(fitSignature(placed(4), order)).not.toBe(
      fitSignature(placed(4.02), order)
    );
    expect(fitSignature(placed(4), order)).not.toBe(
      fitSignature(explicit, order)
    );
  });

  test('another origin, +x, group or +y side is another sketch', () => {
    const frame = explicit.frame as Exclude<
      RtlsSurveyFitBasis['frame'],
      { preset: string }
    >;
    for (const change of [
      { origin: 103 },
      { xAxis: 102 },
      { heightGroups: [[100, 101, 102], [103]], upper: [103] },
      { yPositive: 103 },
    ]) {
      expect(fitSignature({ frame: { ...frame, ...change } }, order)).not.toBe(
        fitSignature(explicit, order)
      );
    }
  });
});

describe('where the held fit is drawn', () => {
  const made = surveyTarget(SQUARE, FOUR);
  if (made === undefined) {
    throw new Error('the square is a sketch that can be sent');
  }
  const remembered = {
    frame: made.frame,
    placement: made.placement,
    transform: frameTransform(SQUARE, FOUR) ?? PLAN_AS_FRAME,
  };
  /** The corner across, as the fit found it. */
  const across = { x: 4.1, y: 2.9 };

  test('changing +x after the fit does not turn the fit', () => {
    const edited = withXAxis(SQUARE, '102');
    const drawn = fromFrame(
      heldFitTransform({ sketch: edited, group: FOUR, remembered }),
      across
    );
    expect(drawn.north).toBeCloseTo(4.1);
    expect(drawn.east).toBeCloseTo(2.9);
    // the edited sketch's own frame would have turned it a quarter
    const turned = fromFrame(
      frameTransform(edited, FOUR) ?? PLAN_AS_FRAME,
      across
    );
    expect(turned.north).toBeCloseTo(-2.9);
    expect(turned.east).toBeCloseTo(4.1);
  });

  test('nor does dragging the origin marker move it', () => {
    const edited = withAnchorMoved(SQUARE, '100', { north: -1, east: -1 });
    expect(heldFitTransform({ sketch: edited, group: FOUR, remembered })).toBe(
      remembered.transform
    );
  });

  test('without a remembered request the fit hangs on the anchors its own frame names', () => {
    const echo = { frame: made.frame, placement: made.placement };
    const edited = withXAxis(SQUARE, '102');
    const drawn = fromFrame(
      heldFitTransform({ sketch: edited, group: FOUR, echo }),
      across
    );
    expect(drawn.north).toBeCloseTo(4.1);
    expect(drawn.east).toBeCloseTo(2.9);
    // a preset names A0 and A1
    const preset = fromFrame(
      heldFitTransform({
        sketch: edited,
        group: FOUR,
        echo: { frame: { preset: 'two-tiers' } },
      }),
      across
    );
    expect(preset.north).toBeCloseTo(4.1);
  });

  test("a fit another client asked for is not drawn with this client's request", () => {
    // the other client made +x the anchor this one has on +y
    const theirs = surveyTarget(withXAxis(SQUARE, '102'), FOUR);
    if (theirs === undefined) {
      throw new Error('their sketch can be sent');
    }
    const drawn = fromFrame(
      heldFitTransform({
        sketch: SQUARE,
        group: FOUR,
        echo: { frame: theirs.frame, placement: theirs.placement },
        remembered,
      }),
      { x: 3, y: 0 }
    );
    // their +x runs east on this plan
    expect(drawn.north).toBeCloseTo(0);
    expect(drawn.east).toBeCloseTo(3);
  });

  test("with nothing known of the fit, the sketch's frame is all there is", () => {
    expect(heldFitTransform({ sketch: EMPTY_SKETCH, group: FOUR })).toBe(
      PLAN_AS_FRAME
    );
    expect(heldFitTransform({ sketch: SQUARE, group: FOUR })).toEqual(
      frameTransform(SQUARE, FOUR)
    );
  });
});
