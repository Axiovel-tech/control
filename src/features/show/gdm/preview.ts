/**
 * @file Converts a loaded `.gdm` into the `.skyc`-shaped show specification
 * that the rest of Control works with (map, 3D view, slot assignment,
 * takeoff and landing checks).
 *
 * The result is a preview only. What a drone flies is its certified `.gdmb`,
 * uploaded byte for byte; nothing here reaches a vehicle. The `.skyc`
 * trajectory player handles Bézier segments up to cubic, so FLAT segments and
 * maneuver `p̂` curves of degree 4 to 7 are approximated by cubic Hermite
 * pieces that keep the exact position and velocity at every piece boundary.
 * Yaw is not previewed.
 */

import { Base64 } from 'js-base64';

import type {
  DroneSpecification,
  ShowSpecification,
  TrajectorySegment,
} from '@skybrush/show-format';

import type { GdmContainer, GdmDrone, GdmShowInfo, GdmVector3 } from './types';

/** Upper bound on the duration of one cubic piece of a high-degree curve */
const MAX_PIECE_DURATION_SEC = 0.1;
const MAX_PIECES_PER_SEGMENT = 64;
const MIN_PIECES_PER_SEGMENT = 4;

type Axes = [number[], number[], number[]];

/** Value and first derivative (per unit s) of a Bézier curve at s. */
function evaluateBezier(points: number[], s: number): [number, number] {
  const n = points.length - 1;
  if (n === 0) {
    return [points[0], 0];
  }

  const work = [...points];
  // Run de Casteljau down to two points; their difference gives the
  // derivative and their interpolation the value
  for (let level = n; level > 1; level--) {
    for (let i = 0; i < level; i++) {
      work[i] = (1 - s) * work[i] + s * work[i + 1];
    }
  }

  return [(1 - s) * work[0] + s * work[1], n * (work[1] - work[0])];
}

/** Elevates a Bézier curve (all control points, P0 included) to `degree`. */
function elevateBezier(points: number[], degree: number): number[] {
  let current = points;
  while (current.length - 1 < degree) {
    const n = current.length; // new degree
    const next = [current[0]];
    for (let i = 1; i < n; i++) {
      next.push((i / n) * current[i - 1] + (1 - i / n) * current[i]);
    }

    next.push(current.at(-1)!);
    current = next;
  }

  return current;
}

/**
 * Appends one Bézier segment (per-axis control points `P_1 … P_n`, implicit
 * start `start`) to a `.skyc` keypoint list. Returns the end position.
 */
function appendSegment(
  keypoints: TrajectorySegment[],
  start: GdmVector3,
  axes: Axes,
  startTimeUs: number,
  durationUs: number
): GdmVector3 {
  const curves = axes.map((ctrl, k) => [start[k], ...ctrl]);
  const degree = Math.max(...curves.map((curve) => curve.length - 1));
  const endTimeSec = (startTimeUs + durationUs) / 1e6;
  const end = curves.map((curve) => curve.at(-1)!) as GdmVector3;

  if (degree <= 3) {
    // Exact: elevate every axis to the common degree
    const elevated = curves.map((curve) => elevateBezier(curve, degree));
    const control: GdmVector3[] = [];
    for (let i = 1; i < degree; i++) {
      control.push(elevated.map((curve) => curve[i]) as GdmVector3);
    }

    keypoints.push([endTimeSec, end, control]);
    return end;
  }

  const durationSec = durationUs / 1e6;
  const pieces = Math.min(
    MAX_PIECES_PER_SEGMENT,
    Math.max(
      MIN_PIECES_PER_SEGMENT,
      Math.ceil(durationSec / MAX_PIECE_DURATION_SEC)
    )
  );

  let previous = curves.map((curve) => evaluateBezier(curve, 0));
  for (let piece = 1; piece <= pieces; piece++) {
    const s = piece / pieces;
    const current =
      piece === pieces
        ? curves.map((curve): [number, number] => [
            curve.at(-1)!,
            evaluateBezier(curve, 1)[1],
          ])
        : curves.map((curve) => evaluateBezier(curve, s));
    // Cubic Hermite in Bézier form; derivatives are per unit s, so scale
    // them by the piece length in s
    const h = 1 / pieces / 3;
    const via1 = previous.map(([p, dp]) => p + dp * h) as GdmVector3;
    const via2 = current.map(([p, dp]) => p - dp * h) as GdmVector3;
    const point = current.map(([p]) => p) as GdmVector3;
    keypoints.push([
      (startTimeUs + (durationUs * piece) / pieces) / 1e6,
      piece === pieces ? end : point,
      [via1, via2],
    ]);
    previous = current;
  }

  // Keep the end time exact
  keypoints.at(-1)![0] = endTimeSec;
  return end;
}

function droneToSpecification(drone: GdmDrone): DroneSpecification {
  const { json } = drone;
  const keypoints: TrajectorySegment[] = [[0, [...json.start.p], []]];
  let position: GdmVector3 = [...json.start.p];
  let time = 0;

  for (const segment of json.segments) {
    const axes: Axes =
      segment.regime === 'flat'
        ? [segment.x, segment.y, segment.z]
        : [segment.p_hat.x, segment.p_hat.y, segment.p_hat.z];
    position = appendSegment(
      keypoints,
      position,
      axes,
      time,
      segment.duration_us
    );
    time += segment.duration_us;
  }

  return {
    type: 'generic',
    settings: {
      name: drone.name ?? drone.id,
      home: [...json.home],
      ...(json.land_at ? { landAt: [...json.land_at] } : {}),
      // Keypoint times are show times. `.skyc` keypoint times are relative
      // to `takeoffTime`, so it is left out (zero) rather than set from the
      // informative `takeoff_us`.
      trajectory: {
        version: 1,
        points: keypoints as [TrajectorySegment, ...TrajectorySegment[]],
      },
      ...(json.lights ? { lights: { ...json.lights } } : {}),
    },
  };
}

/**
 * Builds the `.skyc`-shaped preview specification of a loaded `.gdm`.
 */
export function gdmToShowSpecification(
  container: GdmContainer,
  fallbackTitle?: string
): ShowSpecification {
  const { show } = container;
  const limits = show.limits ?? {};
  const title =
    typeof show.meta?.title === 'string' ? show.meta.title : undefined;
  const id = typeof show.meta?.id === 'string' ? show.meta.id : undefined;

  return {
    version: 1,
    environment: {
      type: show.environment,
    } as ShowSpecification['environment'],
    meta: {
      ...((title ?? fallbackTitle) ? { title: title ?? fallbackTitle } : {}),
      ...(id ? { id } : {}),
    },
    settings: {
      cues: {
        version: 1,
        items: (show.markers ?? []).map(({ name, t_us }) => ({
          name,
          time: t_us / 1e6,
        })),
      },
      validation: {
        maxAltitude: limits.max_altitude_m,
        maxVelocityXY: limits.max_velocity_xy_mps,
        maxVelocityZ: limits.max_velocity_z_down_mps,
        maxVelocityZUp: limits.max_velocity_z_up_mps,
        minDistance: limits.min_distance_m,
      },
    },
    swarm: {
      drones: container.drones.map(droneToSpecification) as [
        DroneSpecification,
        ...DroneSpecification[],
      ],
    },
  };
}

/**
 * Extracts what the Redux store keeps about a `.gdm` show: the show hash,
 * the certification status and each slot's certified `.gdmb`.
 */
export function gdmToShowInfo(container: GdmContainer): GdmShowInfo {
  const { certification, manifest } = container;
  return {
    showHash: container.showHash,
    generator: { ...manifest.generator },
    certification: {
      status: certification.status,
      ...(certification.certifier
        ? { certifier: { ...certification.certifier } }
        : {}),
    },
    drones: container.drones.map(({ id, gdmb, certified }) => ({
      id,
      gdmb: Base64.fromUint8Array(gdmb),
      certified,
    })),
  };
}
