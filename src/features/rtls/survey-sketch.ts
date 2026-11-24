/**
 * @file The operator's sketch of a cell for the anchor survey: a top-down
 * drawing in metres, north up and east right like the positions view, in
 * whatever orientation the operator drew the venue. Heights are never asked
 * in metres: the height groups, lowest first, say which anchors share one.
 * What the page sends from a sketch is in `survey-frame.ts`.
 */

import { type NePoint } from './pos-view-utils';

/** An anchor as the survey page lists it. */
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

/** The slots of a cell: A0..A7. */
const SLOTS = 8;

/** Side of the standard cell drawn when A1 or A2 reports no range to A0. */
const STANDARD_SIDE_M = 5;

/** How far the upper tier is drawn from the lower one it stands above. */
const UPPER_TIER_OFFSET_M = 0.6;

const bySlot = (a: RtlsSurveyAnchor, b: RtlsSurveyAnchor): number =>
  (a.slot ?? Number.POSITIVE_INFINITY) - (b.slot ?? Number.POSITIVE_INFINITY) ||
  Number(a.id) - Number(b.id);

/** The anchors in slot order; an anchor without a slot comes last. */
export const inSlotOrder = <Anchor extends RtlsSurveyAnchor>(
  anchors: readonly Anchor[]
): Anchor[] => [...anchors].sort(bySlot);

/** The anchor in the given slot. */
export const withSlot = (
  anchors: readonly RtlsSurveyAnchor[],
  slot: number
): RtlsSurveyAnchor | undefined =>
  anchors.find((anchor) => anchor.slot === slot);

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

/** To the centimetre; `+ 0` turns a rounded -0 into 0. */
export const roundCm = (value: number): number =>
  Math.round(value * 100) / 100 + 0;

/** What the standard cell says of each anchor that has a slot. */
function standardLayout(
  anchors: readonly RtlsSurveyAnchor[],
  north: number,
  east: number
): Pick<RtlsSurveySketch, 'positions' | 'groupOf' | 'origin' | 'xAxis'> {
  const positions: Record<string, NePoint> = {};
  const groupOf: Record<string, number> = {};
  for (const { id, slot } of anchors) {
    if (slot === undefined || slot >= SLOTS) {
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
    groupOf,
    origin: withSlot(anchors, 0)?.id,
    xAxis: withSlot(anchors, 1)?.id,
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
  return {
    ...standardLayout(
      anchors,
      withSlot(anchors, 1)?.initiatorDistanceM ?? STANDARD_SIDE_M,
      withSlot(anchors, 2)?.initiatorDistanceM ?? STANDARD_SIDE_M
    ),
    groups: previous.groups,
    excluded: previous.excluded,
    standard: true,
  };
}

/**
 * The sketch as the page shows and sends it. An untouched standard cell
 * follows the anchors: one that came online after "Standard cell" takes the
 * place and the height group of its slot, so the rows always say what the
 * `two-tiers` preset will make of them. A sketch edited by hand is as it is.
 */
export function resolveSketch(
  sketch: RtlsSurveySketch,
  anchors: readonly RtlsSurveyAnchor[]
): RtlsSurveySketch {
  if (!sketch.standard) {
    return sketch;
  }
  // the sides as drawn: A1 and A2 keep the place "Standard cell" gave them
  const drawn = (slot: number): NePoint | undefined =>
    sketch.positions[withSlot(anchors, slot)?.id ?? ''];
  const layout = standardLayout(
    anchors,
    drawn(1)?.north ?? STANDARD_SIDE_M,
    drawn(2)?.east ?? STANDARD_SIDE_M
  );
  return {
    ...sketch,
    ...layout,
    positions: { ...layout.positions, ...sketch.positions },
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
