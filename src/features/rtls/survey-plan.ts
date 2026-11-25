/**
 * @file What the survey page draws besides the markers: the declared axes on
 * the top view, how a marker's shape and label depend on its height group,
 * and the side view. A cell usually has anchors standing right above other
 * anchors, which a top view prints on one spot; the page keeps them apart by
 * the marker of each tier, by where each tier's label goes, and by showing
 * the heights beside the plan. Pure, so it can be tested without rendering.
 */

import { type NePoint, type SceneBounds } from './pos-view-utils';

/** How many tiers get a marker of their own; higher groups share the last. */
export const MAX_TIER = 3;

/** The marker tier of a height group: 0 is a dot, each next one a wider ring. */
export const tierOf = (level: number): number =>
  Math.min(Math.max(level, 0), MAX_TIER);

/** The radius of a tier's marker, in dot radii. */
export const tierRadius = (tier: number): number => 1 + 0.8 * tier;

/**
 * Where a tier's label goes from its marker's centre, in dot radii, and how
 * the text is anchored: each tier has a corner of its own, so the labels of
 * anchors that stand above each other never print on one another.
 */
export const TIER_LABELS: ReadonlyArray<{
  dx: number;
  dy: number;
  anchor: 'start' | 'end';
}> = [
  { dx: 1.5, dy: 2.6, anchor: 'start' },
  { dx: 2.2, dy: -1.7, anchor: 'start' },
  { dx: -2.9, dy: -2.3, anchor: 'end' },
  { dx: -3.6, dy: 3.4, anchor: 'end' },
];

/** The declared axes as the top view draws them, plan points. */
export type PlanAxes = {
  origin: NePoint;
  /** The tip of the X arrow: past the +x anchor. */
  xTip: NePoint;
  /** The tip of the Y arrow: +y is to the right of +x, seen from above. */
  yTip: NePoint;
};

/**
 * The point on the way from `from` to `to` that is still inside `bounds`,
 * `inset` metres from its edge: `to` itself when it is.
 */
const keptInside = (
  from: NePoint,
  to: NePoint,
  bounds: SceneBounds,
  inset: number
): NePoint => {
  // how far along the way one coordinate may go: all of it while it stays
  // inside, none when it starts at the edge and heads out
  const reach = (start: number, end: number, min: number, max: number) => {
    if (end === start) {
      return 1;
    }
    const limit = end > start ? max - inset : min + inset;
    const beyond = end > start ? end > limit : end < limit;
    return beyond ? Math.max(0, (limit - start) / (end - start)) : 1;
  };
  const share = Math.max(
    0,
    Math.min(
      reach(from.north, to.north, bounds.minNorth, bounds.maxNorth),
      reach(from.east, to.east, bounds.minEast, bounds.maxEast)
    )
  );
  return {
    north: from.north + (to.north - from.north) * share,
    east: from.east + (to.east - from.east) * share,
  };
};

/**
 * The X and Y axes from the two chosen anchors as they are drawn: X from the
 * origin anchor through the +x anchor and `overshoot` metres past it, Y at a
 * right angle from the origin, half as long. The frame is never mirrored
 * (z is down), so +y lies clockwise of +x on a north-up plan. The arrows end
 * inside `bounds`: the view is laid out around the anchors and does not move
 * when another anchor is chosen. `undefined` while either anchor is not
 * drawn or both are on one spot.
 */
export function planAxes(
  origin: NePoint | undefined,
  xAxis: NePoint | undefined,
  overshoot: number,
  bounds: SceneBounds
): PlanAxes | undefined {
  if (origin === undefined || xAxis === undefined) {
    return undefined;
  }
  const north = xAxis.north - origin.north;
  const east = xAxis.east - origin.east;
  const gap = Math.hypot(north, east);
  if (gap < 0.1) {
    return undefined;
  }
  const cos = north / gap;
  const sin = east / gap;
  const xLength = gap + overshoot;
  const yLength = Math.max(gap / 2, overshoot * 2);
  const inset = overshoot / 2;
  return {
    origin,
    xTip: keptInside(
      origin,
      {
        north: origin.north + cos * xLength,
        east: origin.east + sin * xLength,
      },
      bounds,
      inset
    ),
    yTip: keptInside(
      origin,
      {
        north: origin.north - sin * yLength,
        east: origin.east + cos * yLength,
      },
      bounds,
      inset
    ),
  };
}

/** An anchor as the side view takes it. */
export type ElevationEntry = {
  id: string;
  /** Where it is across the plan, metres east. */
  east: number;
  /** Its height group. */
  level: number;
  /** Its height above the origin's group, metres, when known. */
  heightM?: number;
};

/** A height the side view draws a line for. */
export type ElevationRow = {
  /**
   * The height group whose anchors, all of them and no others, stand here;
   * absent when the anchors here are not exactly one group.
   */
  level?: number;
  /** The height, metres: the mean of the anchors here. Absent as steps. */
  heightM?: number;
};

/** The anchors of one row that the side view draws as one mark. */
export type ElevationMark = {
  ids: string[];
  east: number;
  /** Index into `rows`. */
  row: number;
};

export type Elevation = {
  /**
   * Every anchor has a height in metres: the rows are the heights the
   * anchors stand at, drawn to scale. Otherwise only the order of the height
   * groups is known and each group is a step.
   */
  metric: boolean;
  /** Lowest first. */
  rows: ElevationRow[];
  marks: ElevationMark[];
};

/** Heights farther apart than this are drawn as rows of their own, metres. */
const ROW_GAP_M = 0.5;

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/** The entries by row, lowest first: by height when known, else by group. */
const elevationRows = (
  entries: readonly ElevationEntry[],
  metric: boolean
): ElevationEntry[][] => {
  if (!metric) {
    const levels = [...new Set(entries.map(({ level }) => level))].sort(
      (a, b) => a - b
    );
    return levels.map((level) =>
      entries.filter((entry) => entry.level === level)
    );
  }
  // non-null: `metric` says every entry has a height
  const byHeight = [...entries].sort((a, b) => a.heightM! - b.heightM!);
  const rows: ElevationEntry[][] = [];
  for (const [index, entry] of byHeight.entries()) {
    if (
      index === 0 ||
      entry.heightM! - byHeight[index - 1].heightM! > ROW_GAP_M
    ) {
      rows.push([]);
    }
    rows.at(-1)!.push(entry); // non-null: a row was pushed for the first entry
  }
  return rows;
};

/**
 * The side view of a cell, seen from the bottom edge of the plan: the
 * heights the anchors stand at as rows and each anchor where it is across
 * the plan. Anchors of one row that stand behind each other (closer than
 * `mergeWithin` metres across) are one mark with all their names, so no
 * label prints on another. A row is named by its height group only when it
 * holds exactly that group: what the anchors store may not match what the
 * sketch says.
 */
export function surveyElevation(
  entries: readonly ElevationEntry[],
  mergeWithin: number
): Elevation {
  const metric =
    entries.length > 0 && entries.every(({ heightM }) => heightM !== undefined);
  const rows = elevationRows(entries, metric);
  const marks: ElevationMark[] = [];
  for (const [row, members] of rows.entries()) {
    for (const entry of [...members].sort((a, b) => a.east - b.east)) {
      const last = marks.at(-1);
      if (
        last !== undefined &&
        last.row === row &&
        entry.east - last.east <= mergeWithin
      ) {
        last.ids.push(entry.id);
      } else {
        marks.push({ ids: [entry.id], east: entry.east, row });
      }
    }
  }
  return {
    metric,
    rows: rows.map((members) => {
      const level = members[0].level;
      const whole =
        members.every((entry) => entry.level === level) &&
        entries.filter((entry) => entry.level === level).length ===
          members.length;
      return {
        level: whole ? level : undefined,
        // non-null: `metric` says every entry has a height
        heightM: metric
          ? mean(members.map(({ heightM }) => heightM!))
          : undefined,
      };
    }),
    marks,
  };
}
