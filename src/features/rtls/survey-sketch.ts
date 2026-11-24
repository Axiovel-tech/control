/**
 * @file The operator's sketch of a cell for the anchor survey, and what the
 * page sends from it: the `frame` and the rough `placement` of X-RTLS-SURVEY.
 *
 * The sketch is a top-down drawing in metres, north up and east right like
 * the positions view, in whatever orientation the operator drew the venue.
 * The declared frame has the origin anchor at x = y = 0 and the +x anchor on
 * +x; the drawing is turned and shifted into it, never mirrored, so the side
 * an anchor was drawn on is the side it is sent on. Heights are never asked
 * in metres: the height groups, lowest first, say which anchors share one.
 */

import { type NePoint } from './pos-view-utils';

/** An online anchor as the survey page lists it. */
export type RtlsSurveyAnchor = {
  /** System id. */
  id: string;
  /** The device's display name. */
  name: string;
  /** Slot in its stored cell (A0 initiates); `undefined` when unknown. */
  slot?: number;
  cell?: string;
  /** The stored position (X-RTLS-INF `anchors[].ned`), as a plan point. */
  stored?: NePoint;
  /** Its live range to A0, metres. */
  initiatorDistanceM?: number;
};

export type RtlsSurveySketch = {
  /** Where the operator put each anchor, plan metres. */
  positions: Record<string, NePoint>;
  /** Names of the height groups above Lower (0) and Upper (1), lowest first. */
  groups: string[];
  /** Height group of each anchor: 0 Lower, 1 Upper, 2.. `groups`; absent = 0. */
  groupOf: Record<string, number>;
  /** The online anchors left out of the survey. */
  excluded: string[];
  origin?: string;
  xAxis?: string;
  /** Laid out by "Standard cell" and not touched since. */
  standard?: boolean;
};

export const EMPTY_SKETCH: RtlsSurveySketch = {
  positions: {},
  groups: [],
  groupOf: {},
  excluded: [],
};

/** A point in the declared frame, metres. */
export type FramePoint = { x: number; y: number };

/** The `frame` member of a start or a refit. */
export type RtlsSurveyFrame =
  | { preset: 'two-tiers' }
  | {
      origin: number;
      xAxis: number;
      heightGroups: number[][];
      upper: number[];
      yPositive?: number;
    };

/** The members of a start (and, without `anchors`, of a refit). */
export type RtlsSurveyTarget = {
  /** The group in slot order. */
  anchors: number[];
  frame: RtlsSurveyFrame;
  placement?: Record<string, FramePoint>;
};

const MIN_ANCHORS = 3;
const MAX_ANCHORS = 8;

/** Side of the standard cell drawn when A1 or A2 reports no range to A0. */
const STANDARD_SIDE_M = 5;

/** How far the upper tier is drawn from the lower one it stands above. */
const UPPER_TIER_OFFSET_M = 0.6;

const idOf = ({ id }: RtlsSurveyAnchor): number => Number(id);

const bySlot = (a: RtlsSurveyAnchor, b: RtlsSurveyAnchor): number =>
  (a.slot ?? Number.POSITIVE_INFINITY) - (b.slot ?? Number.POSITIVE_INFINITY) ||
  Number(a.id) - Number(b.id);

/** The anchors in slot order; an anchor without a slot comes last. */
export const inSlotOrder = (
  anchors: readonly RtlsSurveyAnchor[]
): RtlsSurveyAnchor[] => [...anchors].sort(bySlot);

/** The key the sketch of an anchor's cell is kept under. */
const DEFAULT_CELL = 'default';

/**
 * The cells the online anchors form, by sketch key. Anchors whose cell is
 * not known join the only known cell, or form one of their own.
 */
export function surveyCells(
  anchors: readonly RtlsSurveyAnchor[]
): Record<string, RtlsSurveyAnchor[]> {
  const known = new Set(
    anchors.flatMap(({ cell }) => (cell === undefined ? [] : [cell]))
  );
  const fallback = known.size === 1 ? [...known][0] : DEFAULT_CELL;
  const cells: Record<string, RtlsSurveyAnchor[]> = {};
  for (const anchor of inSlotOrder(anchors)) {
    (cells[anchor.cell ?? fallback] ??= []).push(anchor);
  }
  return cells;
}

/** The anchors of a cell the sketch does not leave out. */
export const surveyGroup = (
  sketch: RtlsSurveySketch,
  anchors: readonly RtlsSurveyAnchor[]
): RtlsSurveyAnchor[] =>
  anchors.filter(({ id }) => !sketch.excluded.includes(id));

/** Where an anchor is drawn. */
export type PlanMarker = {
  point: NePoint;
  /** Dragged by the operator, or stored by the anchor: known roughly. */
  known: boolean;
};

/**
 * Where each anchor is drawn: where the operator put it, else where it
 * stores itself, else parked in a row below the rest, to be dragged from.
 */
export function planMarkers(
  sketch: RtlsSurveySketch,
  anchors: readonly RtlsSurveyAnchor[]
): Record<string, PlanMarker> {
  const markers: Record<string, PlanMarker> = {};
  const parked: string[] = [];
  for (const anchor of anchors) {
    const point = sketch.positions[anchor.id] ?? anchor.stored;
    if (point === undefined) {
      parked.push(anchor.id);
    } else {
      markers[anchor.id] = { point, known: true };
    }
  }

  const known = Object.values(markers).map(({ point }) => point);
  const north =
    known.length === 0 ? 0 : Math.min(...known.map((p) => p.north)) - 1.5;
  const east = known.length === 0 ? 0 : Math.min(...known.map((p) => p.east));
  for (const [index, id] of parked.entries()) {
    markers[id] = { point: { north, east: east + index }, known: false };
  }
  return markers;
}

/**
 * How the drawing maps onto the declared frame: `origin` is the plan point of
 * the origin anchor and (`cos`, `sin`) the direction of +x on the plan.
 */
export type FrameTransform = { origin: NePoint; cos: number; sin: number };

const IDENTITY: FrameTransform = {
  origin: { north: 0, east: 0 },
  cos: 1,
  sin: 0,
};

/**
 * The turn and shift that put the sketch's origin anchor at 0 and its +x
 * anchor on +x. While either is not drawn (or both are on one spot) the
 * drawing is taken as it is: north is +x, east is +y.
 */
export function frameTransform(
  sketch: RtlsSurveySketch,
  anchors: readonly RtlsSurveyAnchor[]
): FrameTransform {
  const pointOf = (id: string | undefined): NePoint | undefined =>
    id === undefined
      ? undefined
      : (sketch.positions[id] ??
        anchors.find((anchor) => anchor.id === id)?.stored);
  const origin = pointOf(sketch.origin);
  const xAxis = pointOf(sketch.xAxis);
  if (origin === undefined || xAxis === undefined) {
    return IDENTITY;
  }
  const north = xAxis.north - origin.north;
  const east = xAxis.east - origin.east;
  const length = Math.hypot(north, east);
  return length < 1e-6
    ? IDENTITY
    : { origin, cos: north / length, sin: east / length };
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
  return sketch.origin === sketch.xAxis
    ? 'rtlsSurvey.problem.sameAnchor'
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
    ({ id, stored }) =>
      sketch.positions[id] !== undefined || stored !== undefined
  ).length;
  if (!sketch.standard && drawn > 0 && drawn < group.length) {
    hints.push('rtlsSurvey.hint.partialSketch');
  }
  return hints;
}

/** To the centimetre; `+ 0` turns a rounded -0 into 0. */
export const roundCm = (value: number): number =>
  Math.round(value * 100) / 100 + 0;

/**
 * What a start or a refit of `group` sends. A standard cell with every slot
 * from A0 on goes as the server's `two-tiers` preset and needs no placement.
 * Otherwise the frame is spelled out: the origin and +x anchors, the height
 * groups, the anchors above the origin's group, and one anchor on the +y
 * side (A2 of a standard cell, else the one drawn farthest to that side).
 * The placement is sent once the operator placed an anchor: every anchor
 * drawn, in frame coordinates. `undefined` while `sketchProblemKey` finds a
 * problem.
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
  const anchors = ordered.map(({ id }) => Number(id));
  if (sketch.standard && hasContiguousSlots(ordered)) {
    return { anchors, frame: { preset: 'two-tiers' } };
  }

  const transform = frameTransform(sketch, ordered);
  const framed: Record<string, FramePoint> = {};
  for (const { id, stored } of ordered) {
    const point = sketch.positions[id] ?? stored;
    if (point !== undefined) {
      framed[id] = toFrame(transform, point);
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
  const yPositive =
    (sketch.standard ? ordered.find(({ slot }) => slot === 2) : undefined) ??
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
    ...(placed
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

/**
 * Today's standard cell from the anchors' slots: A0 at the origin, A1 on +x,
 * A2 on +y, A3 across, and A4..A7 above them. The sides are A1's and A2's
 * ranges to A0 when they report them. Keeps who is left out.
 */
export function standardCellSketch(
  anchors: readonly RtlsSurveyAnchor[],
  previous: RtlsSurveySketch = EMPTY_SKETCH
): RtlsSurveySketch {
  const withSlot = (slot: number): RtlsSurveyAnchor | undefined =>
    anchors.find((anchor) => anchor.slot === slot);
  const north = withSlot(1)?.initiatorDistanceM ?? STANDARD_SIDE_M;
  const east = withSlot(2)?.initiatorDistanceM ?? STANDARD_SIDE_M;

  const positions: Record<string, NePoint> = {};
  const groupOf: Record<string, number> = {};
  for (const { id, slot } of anchors) {
    if (slot === undefined || slot >= MAX_ANCHORS) {
      continue;
    }
    const corner = slot % 4;
    const offset = slot >= 4 ? UPPER_TIER_OFFSET_M : 0;
    positions[id] = {
      north: (corner % 2 === 1 ? north : 0) + offset,
      east: (corner >= 2 ? east : 0) + offset,
    };
    groupOf[id] = slot >= 4 ? 1 : 0;
  }
  return {
    positions,
    groups: previous.groups,
    groupOf,
    excluded: previous.excluded,
    origin: withSlot(0)?.id,
    xAxis: withSlot(1)?.id,
    standard: true,
  };
}

/** The sketch after an edit by hand: no longer the untouched standard cell. */
const edited = (
  sketch: RtlsSurveySketch,
  change: Partial<RtlsSurveySketch>
): RtlsSurveySketch => ({ ...sketch, ...change, standard: false });

export const withAnchorMoved = (
  sketch: RtlsSurveySketch,
  id: string,
  point: NePoint
): RtlsSurveySketch =>
  edited(sketch, { positions: { ...sketch.positions, [id]: point } });

export const withAnchorGroup = (
  sketch: RtlsSurveySketch,
  id: string,
  level: number
): RtlsSurveySketch =>
  edited(sketch, { groupOf: { ...sketch.groupOf, [id]: level } });

export const withOrigin = (
  sketch: RtlsSurveySketch,
  id: string
): RtlsSurveySketch => edited(sketch, { origin: id });

export const withXAxis = (
  sketch: RtlsSurveySketch,
  id: string
): RtlsSurveySketch => edited(sketch, { xAxis: id });

/** Adds a named height group above the others; a blank or known name adds none. */
export const withGroupAdded = (
  sketch: RtlsSurveySketch,
  name: string
): RtlsSurveySketch => {
  const trimmed = name.trim();
  return trimmed === '' || sketch.groups.includes(trimmed)
    ? sketch
    : { ...sketch, groups: [...sketch.groups, trimmed] };
};

/** Takes an anchor into the survey or leaves it out. */
export const withAnchorIncluded = (
  sketch: RtlsSurveySketch,
  id: string,
  included: boolean
): RtlsSurveySketch => ({
  ...sketch,
  excluded: included
    ? sketch.excluded.filter((other) => other !== id)
    : [...new Set([...sketch.excluded, id])],
});
