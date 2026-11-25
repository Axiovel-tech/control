/**
 * @file The operator's sketch of a cell for the anchor survey: a top-down
 * drawing in metres, north up and east right like the positions view, in
 * whatever orientation the operator drew the venue. Heights are never asked
 * in metres: the height groups, lowest first, say which anchors stand at
 * about the same height. What the page sends from a sketch is in
 * `survey-frame.ts`.
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
  /** The stored position's down coordinate, metres (up is negative). */
  storedDown?: number;
  /** The survey ID it stores. */
  surveyId?: number;
  /** Its live range to A0, metres. */
  initiatorDistanceM?: number;
  /**
   * A survey of its cell cannot leave it out: it is online and reports no
   * power state other than operating.
   */
  operating?: boolean;
};

export type RtlsSurveySketch = {
  /** Where the operator put each anchor, plan metres. */
  positions: Record<string, NePoint>;
  /** Names of the height groups above Lower (0) and Upper (1), lowest first. */
  groups: string[];
  /** Height group of each anchor: 0 Lower, 1 Upper, 2.. `groups`; absent = 0. */
  groupOf: Record<string, number>;
  /**
   * Anchors the frame puts in no height group: their height is free. Each
   * has a level of its own in `groupOf`, which is how the list shows it and
   * how it is above or below the origin's group, but that level is not a
   * group and is not sent as one. Only a frame taken from the server names
   * any; choosing a group for an anchor takes it off this list.
   */
  ungrouped?: string[];
  /** The online anchors left out of the survey. */
  excluded: string[];
  origin?: string;
  xAxis?: string;
  /**
   * The anchor on the +y side, when it is declared rather than read off the
   * drawing: a sketch restored from the frame the server echoes.
   */
  yPositive?: string;
  /** Laid out by "Standard cell" and not touched since. */
  standard?: boolean;
};

/** The height groups every sketch has: Lower (0) and Upper (1). */
export const BUILT_IN_GROUPS = 2;

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
 * stores itself, else where `found` has it (the held fit, for a client that
 * has neither), else parked in a row below the rest, to be dragged from.
 */
export function planMarkers(
  sketch: RtlsSurveySketch,
  anchors: readonly RtlsSurveyAnchor[],
  found: Record<string, NePoint> = {}
): Record<string, PlanMarker> {
  const markers: Record<string, PlanMarker> = {};
  const parked: string[] = [];
  for (const anchor of anchors) {
    const point =
      sketch.positions[anchor.id] ?? anchor.stored ?? found[anchor.id];
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
    // the upper tier stands right above the lower one: the plan tells the
    // two apart by their markers, not by moving them
    const corner = slot % 4;
    positions[id] = {
      north: corner % 2 === 1 ? north : 0,
      east: corner >= 2 ? east : 0,
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

/** A drawing that changed says again which side +y is on. */
export const withAnchorMoved = (
  sketch: RtlsSurveySketch,
  id: string,
  point: NePoint
): RtlsSurveySketch =>
  edited(sketch, {
    positions: { ...sketch.positions, [id]: point },
    yPositive: undefined,
  });

/** How many anchors the sketch puts in a height group. */
export const groupSize = (sketch: RtlsSurveySketch, level: number): number =>
  Object.values(sketch.groupOf).filter((other) => other === level).length;

/**
 * Removes a named height group (`level` 2 and up): its anchors go back to
 * Lower and the groups above it move down one. Lower and Upper stay.
 */
export const withGroupRemoved = (
  sketch: RtlsSurveySketch,
  level: number
): RtlsSurveySketch => {
  const index = level - BUILT_IN_GROUPS;
  if (index < 0 || index >= sketch.groups.length) {
    return sketch;
  }
  return edited(sketch, {
    groups: sketch.groups.filter((_, other) => other !== index),
    // its anchors are put in Lower: that is a group chosen for them
    ungrouped: sketch.ungrouped?.filter((id) => sketch.groupOf[id] !== level),
    groupOf: Object.fromEntries(
      Object.entries(sketch.groupOf).map(([id, other]) => [
        id,
        other === level ? 0 : other > level ? other - 1 : other,
      ])
    ),
  });
};

/**
 * Puts an anchor in a height group. A named group that loses its last
 * anchor this way goes away by itself.
 */
export const withAnchorGroup = (
  sketch: RtlsSurveySketch,
  id: string,
  level: number
): RtlsSurveySketch => {
  const before = sketch.groupOf[id] ?? 0;
  const moved = edited(sketch, {
    groupOf: { ...sketch.groupOf, [id]: level },
    ungrouped: sketch.ungrouped?.filter((other) => other !== id),
  });
  return before >= BUILT_IN_GROUPS &&
    before !== level &&
    groupSize(moved, before) === 0
    ? withGroupRemoved(moved, before)
    : moved;
};

export const withOrigin = (
  sketch: RtlsSurveySketch,
  id: string
): RtlsSurveySketch => edited(sketch, { origin: id, yPositive: undefined });

export const withXAxis = (
  sketch: RtlsSurveySketch,
  id: string
): RtlsSurveySketch => edited(sketch, { xAxis: id, yPositive: undefined });

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

/**
 * The operating anchors of the cell the sketch leaves out. The server
 * refuses such a survey ("Include RTLS anchor A6 in the survey, or put it
 * to sleep"): an anchor left ranging beside a survey restarts its radio at
 * every step and keeps the old survey ID after the commit.
 */
export const leftOutOperating = (
  sketch: RtlsSurveySketch,
  anchors: readonly RtlsSurveyAnchor[]
): RtlsSurveyAnchor[] =>
  anchors.filter(
    ({ id, operating }) => operating === true && sketch.excluded.includes(id)
  );

/** Whether nothing of a frame was sketched: no frame anchor and no position. */
export const isBlankSketch = (sketch: RtlsSurveySketch | undefined): boolean =>
  sketch === undefined ||
  (!sketch.standard &&
    sketch.origin === undefined &&
    sketch.xAxis === undefined &&
    Object.keys(sketch.positions).length === 0);

/** Stored heights farther apart than this are different height groups, metres. */
const HEIGHT_GROUP_GAP_M = 0.5;

/** A stored coordinate this close to zero is zero: the anchors store millimetres. */
const STORED_ZERO_M = 0.0005;

const isZero = (value: number | undefined): boolean =>
  value !== undefined && Math.abs(value) <= STORED_ZERO_M;

/** The height groups the anchors' stored heights fall into, lowest first. */
function groupsFromStored(
  anchors: readonly RtlsSurveyAnchor[]
): Record<string, number> {
  // down is positive towards the floor: the largest is the lowest anchor
  const byHeight = anchors
    .flatMap(({ id, storedDown }) =>
      storedDown === undefined ? [] : [{ id, down: storedDown }]
    )
    .sort((a, b) => b.down - a.down);
  const groupOf: Record<string, number> = {};
  let level = 0;
  for (const [index, { id, down }] of byHeight.entries()) {
    if (index > 0 && byHeight[index - 1].down - down > HEIGHT_GROUP_GAP_M) {
      level += 1;
    }
    groupOf[id] = level;
  }
  return groupOf;
}

/** The one anchor of `candidates`, or none when they are not exactly one. */
const only = (candidates: readonly RtlsSurveyAnchor[]): string | undefined =>
  candidates.length === 1 ? candidates[0].id : undefined;

/**
 * The frame the stored positions were committed in: the origin anchor is the
 * one stored at x = y = 0 (of several above each other, the one at height
 * 0), and the +x anchor the one of its height group stored at y = 0. Either
 * is left open when the positions do not single one out.
 */
function frameFromStored(
  anchors: readonly RtlsSurveyAnchor[],
  groupOf: Record<string, number>
): Pick<RtlsSurveySketch, 'origin' | 'xAxis'> {
  const atZero = anchors.filter(
    ({ stored }) => isZero(stored?.north) && isZero(stored?.east)
  );
  const origin =
    only(atZero) ?? only(atZero.filter((anchor) => isZero(anchor.storedDown)));
  if (origin === undefined) {
    return {};
  }
  return {
    origin,
    xAxis: only(
      anchors.filter(
        ({ id, stored }) =>
          id !== origin &&
          (groupOf[id] ?? 0) === (groupOf[origin] ?? 0) &&
          isZero(stored?.east) &&
          (stored?.north ?? 0) > 0.1
      )
    ),
  };
}

/**
 * A sketch starts from what the anchors store, as its plan does: one that
 * names no height group takes the groups their stored heights fall into,
 * and one in which nothing of a frame was chosen or drawn takes the frame
 * their positions were committed in. A cell that was surveyed before can so
 * be surveyed again, from any browser, without being described again; what
 * the operator chose stays as it is.
 */
export function withStoredAsDefault(
  sketch: RtlsSurveySketch,
  anchors: readonly RtlsSurveyAnchor[]
): RtlsSurveySketch {
  if (sketch.standard || Object.keys(sketch.groupOf).length > 0) {
    return sketch;
  }
  const groupOf = groupsFromStored(anchors);
  const levels = Math.max(0, ...Object.values(groupOf)) + 1;
  const unnamed = levels - BUILT_IN_GROUPS - sketch.groups.length;
  return {
    ...sketch,
    ...(isBlankSketch(sketch) ? frameFromStored(anchors, groupOf) : {}),
    groupOf,
    groups: [
      ...sketch.groups,
      ...Array.from({ length: Math.max(0, unnamed) }, () => ''),
    ],
  };
}

/**
 * The sketch of a cell once a commit wrote the fit to its anchors: where
 * they are is now what they store, so what was drawn of `committed` goes.
 * The height groups and the frame anchors stay, for the next survey.
 */
export const withPositionsCommitted = (
  sketch: RtlsSurveySketch,
  committed: readonly string[]
): RtlsSurveySketch =>
  committed.some((id) => id in sketch.positions) || sketch.standard
    ? {
        ...sketch,
        positions: Object.fromEntries(
          Object.entries(sketch.positions).filter(
            ([id]) => !committed.includes(id)
          )
        ),
        standard: false,
      }
    : sketch;

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
