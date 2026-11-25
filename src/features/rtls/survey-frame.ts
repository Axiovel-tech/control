/**
 * @file What the survey page sends from a sketch: the `frame` and the rough
 * `placement` of X-RTLS-SURVEY, and how a fit made with them is drawn back
 * on the plan.
 *
 * The declared frame has the origin anchor at x = y = 0 and the +x anchor on
 * +x. The drawing is turned and shifted into it, never mirrored, so the side
 * an anchor was drawn on is the side it is sent on.
 */

import { type NePoint } from './pos-view-utils';
import {
  BUILT_IN_GROUPS,
  inSlotOrder,
  roundCm,
  type RtlsSurveyAnchor,
  type RtlsSurveySketch,
  withSlot,
} from './survey-sketch';

/** A point in the declared frame, metres. */
export type FramePoint = { x: number; y: number };

/** The `frame` member of a start or a refit, spelled out. */
export type RtlsSurveyExplicitFrame = {
  origin: number;
  xAxis: number;
  heightGroups: number[][];
  upper: number[];
  yPositive?: number;
};

/** The `frame` member of a start or a refit. */
export type RtlsSurveyFrame = { preset: 'two-tiers' } | RtlsSurveyExplicitFrame;

/** The frame and placement a fit is made with. */
export type RtlsSurveyFitBasis = {
  frame: RtlsSurveyFrame;
  placement?: Record<string, FramePoint>;
};

/** The members of a start (and, without `anchors`, of a refit). */
export type RtlsSurveyTarget = RtlsSurveyFitBasis & {
  /** The group in slot order. */
  anchors: number[];
};

const MIN_ANCHORS = 3;
const MAX_ANCHORS = 8;

/**
 * How far apart the origin and +x anchors must be drawn, metres: closer than
 * this the drawing gives the frame no direction.
 */
const FRAME_ANCHORS_APART_M = 0.1;

const idOf = ({ id }: RtlsSurveyAnchor): number => Number(id);

/**
 * How the drawing maps onto the declared frame: `origin` is the plan point of
 * the origin anchor and (`cos`, `sin`) the direction of +x on the plan.
 */
export type FrameTransform = { origin: NePoint; cos: number; sin: number };

/** The plan read as the frame: north is +x, east is +y. */
export const PLAN_AS_FRAME: FrameTransform = {
  origin: { north: 0, east: 0 },
  cos: 1,
  sin: 0,
};

/** The anchors a frame hangs on. */
type FrameAnchors = { origin?: string; xAxis?: string };

/** Where an anchor is drawn: where the operator put it, else where it stores itself. */
const drawnPoint = (
  sketch: RtlsSurveySketch,
  anchors: readonly RtlsSurveyAnchor[],
  id: string | undefined
): NePoint | undefined =>
  id === undefined
    ? undefined
    : (sketch.positions[id] ??
      anchors.find((anchor) => anchor.id === id)?.stored);

/**
 * The turn and shift that put the origin anchor at 0 and the +x anchor on +x,
 * for the sketch's own frame anchors or the given ones. `undefined` while
 * either is not drawn or both are drawn on one spot: the drawing then says
 * nothing about the frame.
 */
export function frameTransform(
  sketch: RtlsSurveySketch,
  anchors: readonly RtlsSurveyAnchor[],
  frameAnchors: FrameAnchors = sketch
): FrameTransform | undefined {
  const origin = drawnPoint(sketch, anchors, frameAnchors.origin);
  const xAxis = drawnPoint(sketch, anchors, frameAnchors.xAxis);
  if (origin === undefined || xAxis === undefined) {
    return undefined;
  }
  const north = xAxis.north - origin.north;
  const east = xAxis.east - origin.east;
  const gap = Math.hypot(north, east);
  return gap < FRAME_ANCHORS_APART_M
    ? undefined
    : { origin, cos: north / gap, sin: east / gap };
}

/** A plan point in the declared frame. */
export const toFrame = (
  { origin, cos, sin }: FrameTransform,
  point: NePoint
): FramePoint => {
  const north = point.north - origin.north;
  const east = point.east - origin.east;
  return { x: cos * north + sin * east, y: cos * east - sin * north };
};

/** A point of the declared frame (a fitted position) on the plan. */
export const fromFrame = (
  { origin, cos, sin }: FrameTransform,
  { x, y }: FramePoint
): NePoint => ({
  north: origin.north + cos * x - sin * y,
  east: origin.east + sin * x + cos * y,
});

const levelOf = (sketch: RtlsSurveySketch, id: string): number =>
  sketch.groupOf[id] ?? 0;

/** Whether the group's slots are 0..n-1: what the server's preset assumes. */
const hasContiguousSlots = (group: readonly RtlsSurveyAnchor[]): boolean =>
  inSlotOrder(group).every((anchor, index) => anchor.slot === index);

/**
 * The i18n key of why the sketch cannot be surveyed or refitted as it is;
 * `undefined` when it can.
 */
export function sketchProblemKey(
  sketch: RtlsSurveySketch,
  group: readonly RtlsSurveyAnchor[]
): string | undefined {
  if (group.length < MIN_ANCHORS) {
    return 'rtlsSurvey.problem.tooFew';
  }
  if (group.length > MAX_ANCHORS) {
    return 'rtlsSurvey.problem.tooMany';
  }
  const ids = new Set(group.map(({ id }) => id));
  if (sketch.origin === undefined || !ids.has(sketch.origin)) {
    return 'rtlsSurvey.problem.pickOrigin';
  }
  if (sketch.xAxis === undefined || !ids.has(sketch.xAxis)) {
    return 'rtlsSurvey.problem.pickXAxis';
  }
  if (sketch.origin === sketch.xAxis) {
    return 'rtlsSurvey.problem.sameAnchor';
  }
  const bothDrawn =
    drawnPoint(sketch, group, sketch.origin) !== undefined &&
    drawnPoint(sketch, group, sketch.xAxis) !== undefined;
  return bothDrawn && frameTransform(sketch, group) === undefined
    ? 'rtlsSurvey.problem.drawApart'
    : undefined;
}

/**
 * The i18n keys of what the operator should know about a sketch that can be
 * sent: nothing the server refuses, but a fit it may not be able to settle.
 */
export function sketchHintKeys(
  sketch: RtlsSurveySketch,
  group: readonly RtlsSurveyAnchor[]
): string[] {
  const hints: string[] = [];
  const originLevel =
    sketch.origin === undefined ? 0 : levelOf(sketch, sketch.origin);
  // the frame can only say "above the origin": nothing settles what is below
  if (group.some(({ id }) => levelOf(sketch, id) < originLevel)) {
    hints.push('rtlsSurvey.hint.originNotLowest');
  }
  const drawn = group.filter(
    ({ id }) => drawnPoint(sketch, group, id) !== undefined
  ).length;
  if (!sketch.standard && drawn > 0 && drawn < group.length) {
    hints.push('rtlsSurvey.hint.partialSketch');
  }
  return hints;
}

/**
 * What a start or a refit of `group` sends. A standard cell with every slot
 * from A0 on goes as the server's `two-tiers` preset and needs no placement.
 * Otherwise the frame is spelled out: the origin and +x anchors, the height
 * groups, the anchors above the origin's group, and one anchor on the +y
 * side (A2 of a standard cell, else the one the sketch declares, else the one
 * drawn farthest to that side).
 * The placement is sent once the operator placed an anchor: every anchor
 * drawn, in frame coordinates. While the origin or the +x anchor is not
 * drawn the drawing has no frame: no placement and no +y side come from it.
 * `undefined` while `sketchProblemKey` finds a problem.
 */
export function surveyTarget(
  sketch: RtlsSurveySketch,
  group: readonly RtlsSurveyAnchor[]
): RtlsSurveyTarget | undefined {
  const { origin, xAxis } = sketch;
  if (
    origin === undefined ||
    xAxis === undefined ||
    sketchProblemKey(sketch, group) !== undefined
  ) {
    return undefined;
  }
  const ordered = inSlotOrder(group);
  const anchors = ordered.map(idOf);
  if (sketch.standard && hasContiguousSlots(ordered)) {
    return { anchors, frame: { preset: 'two-tiers' } };
  }

  const transform = frameTransform(sketch, ordered);
  const framed: Record<string, FramePoint> = {};
  if (transform !== undefined) {
    for (const { id } of ordered) {
      const point = drawnPoint(sketch, ordered, id);
      if (point !== undefined) {
        framed[id] = toFrame(transform, point);
      }
    }
  }

  const originLevel = levelOf(sketch, origin);
  const levels = [...new Set(ordered.map(({ id }) => levelOf(sketch, id)))];
  const members = (level: number): number[] =>
    ordered.filter(({ id }) => levelOf(sketch, id) === level).map(idOf);

  const farthest = ordered
    .filter(({ id }) => id !== origin && id !== xAxis && id in framed)
    .sort((a, b) => framed[b.id].y - framed[a.id].y)
    .at(0);
  const declared = ordered.find(
    ({ id }) => id === sketch.yPositive && id !== origin && id !== xAxis
  );
  const yPositive =
    (sketch.standard ? withSlot(ordered, 2) : undefined) ??
    declared ??
    (farthest !== undefined && framed[farthest.id].y > 0
      ? farthest
      : undefined);

  const placed =
    !sketch.standard && ordered.some(({ id }) => id in sketch.positions);
  return {
    anchors,
    frame: {
      origin: Number(origin),
      xAxis: Number(xAxis),
      heightGroups: levels.sort((a, b) => a - b).map(members),
      upper: ordered
        .filter(({ id }) => levelOf(sketch, id) > originLevel)
        .map(idOf),
      ...(yPositive === undefined ? {} : { yPositive: Number(yPositive.id) }),
    },
    ...(placed && transform !== undefined
      ? {
          placement: Object.fromEntries(
            Object.entries(framed).map(([id, { x, y }]) => [
              id,
              { x: roundCm(x), y: roundCm(y) },
            ])
          ),
        }
      : {}),
  };
}

/** The `two-tiers` preset spelled out for anchors in slot order. */
const presetFrame = (order: readonly number[]): RtlsSurveyExplicitFrame => ({
  origin: order[0],
  xAxis: order[1],
  heightGroups: [order.slice(0, 4), order.slice(4)],
  upper: order.slice(4),
  yPositive: order[2],
});

const ascending = (a: number, b: number): number => a - b;

/**
 * A frame and placement as one string, the same for the preset and for the
 * frame it stands for, whatever the order inside a group: two fits were made
 * with the same sketch exactly when these agree. `order` is the group in
 * slot order, which is what a preset means.
 */
export function fitSignature(
  { frame, placement }: RtlsSurveyFitBasis,
  order: readonly number[]
): string {
  const { origin, xAxis, heightGroups, upper, yPositive } =
    'preset' in frame ? presetFrame(order) : frame;
  return JSON.stringify({
    origin,
    xAxis,
    heightGroups: heightGroups
      .filter((group) => group.length > 0)
      .map((group) => [...group].sort(ascending))
      .sort((a, b) => a[0] - b[0]),
    upper: [...upper].sort(ascending),
    yPositive: yPositive ?? null,
    placement: Object.entries(placement ?? {})
      .map(([id, { x, y }]) => [Number(id), roundCm(x), roundCm(y)])
      .sort((a, b) => a[0] - b[0]),
  });
}

/**
 * The sketch a frame and placement stand for: what a client that never drew
 * this cell shows of a survey another client started, so that it can refit
 * it and survey again. `measured` are the anchors the survey ranged.
 *
 * The height groups come back lowest first as far as the frame says: the
 * groups it does not call upper, the origin's, then the upper ones. An
 * anchor in no group stands in one of its own. Groups past Upper get no
 * name. The placement is drawn with the plan as the frame, and the +y side
 * is the one the frame declares.
 */
export function sketchFromBasis(
  { frame: echoed, placement }: RtlsSurveyFitBasis,
  measured: readonly RtlsSurveyAnchor[]
): RtlsSurveySketch {
  const order = inSlotOrder(measured).map(idOf);
  const frame = 'preset' in echoed ? presetFrame(order) : echoed;
  const upper = new Set(frame.upper);
  const grouped = new Set(frame.heightGroups.flat());
  const rank = (group: readonly number[]): number =>
    group.includes(frame.origin)
      ? 1
      : group.some((id) => upper.has(id))
        ? 2
        : 0;
  const groups = [
    ...frame.heightGroups.filter((group) => group.length > 0),
    ...order.filter((id) => !grouped.has(id)).map((id) => [id]),
  ]
    .map((group, index) => ({ group, index }))
    .sort((a, b) => rank(a.group) - rank(b.group) || a.index - b.index);

  const groupOf: Record<string, number> = {};
  for (const [level, { group }] of groups.entries()) {
    for (const id of group) {
      groupOf[String(id)] = level;
    }
  }
  return {
    positions: Object.fromEntries(
      Object.entries(placement ?? {}).map(([id, point]) => [
        id,
        fromFrame(PLAN_AS_FRAME, point),
      ])
    ),
    groups: Array.from(
      { length: Math.max(0, groups.length - BUILT_IN_GROUPS) },
      () => ''
    ),
    groupOf,
    excluded: [],
    origin: String(frame.origin),
    xAxis: String(frame.xAxis),
    yPositive:
      frame.yPositive === undefined ? undefined : String(frame.yPositive),
  };
}

/** The anchors the frame of a fit hangs on. */
const frameAnchorsOf = (
  frame: RtlsSurveyFrame,
  group: readonly RtlsSurveyAnchor[]
): FrameAnchors => {
  const ordered = inSlotOrder(group);
  return 'preset' in frame
    ? { origin: ordered.at(0)?.id, xAxis: ordered.at(1)?.id }
    : { origin: String(frame.origin), xAxis: String(frame.xAxis) };
};

/** A request this client had accepted, with how the plan drew its frame then. */
export type RtlsSurveyRememberedFit = RtlsSurveyFitBasis & {
  transform: FrameTransform;
};

/**
 * How the held fit is drawn on the plan: with the turn and shift it was
 * calculated under, so that it stays where it is while the operator edits
 * the sketch. That is the transform this client remembered with its request,
 * as long as the server's echo does not name another request. Without one (a
 * reload, a fit another client asked for) the fit hangs on the anchors its
 * own frame names, as they are drawn now; `echo` is the frame and placement
 * the server reports for the fit and `group` the anchors it measured.
 * A committed fit is what the anchors store, and the plan shows stored
 * positions as the frame: north is +x.
 */
export function heldFitTransform({
  sketch,
  group,
  echo,
  remembered,
  committed = false,
}: {
  sketch: RtlsSurveySketch;
  group: readonly RtlsSurveyAnchor[];
  echo?: RtlsSurveyFitBasis;
  remembered?: RtlsSurveyRememberedFit;
  committed?: boolean;
}): FrameTransform {
  if (committed) {
    return PLAN_AS_FRAME;
  }
  const order = inSlotOrder(group).map(idOf);
  if (
    remembered !== undefined &&
    (echo === undefined ||
      fitSignature(echo, order) === fitSignature(remembered, order))
  ) {
    return remembered.transform;
  }
  return (
    frameTransform(
      sketch,
      group,
      echo === undefined ? sketch : frameAnchorsOf(echo.frame, group)
    ) ?? PLAN_AS_FRAME
  );
}
