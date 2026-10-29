/**
 * @file Compares the geofence Control uploads with the `.gdm`'s own one.
 *
 * Control keeps uploading its computed geofence for `.gdm` shows, exactly as
 * for `.skyc`. The `.gdm` may carry the geofence that certification assumed
 * (`show.json` `geofence`). When Control's fence would allow a drone where
 * the `.gdm`'s does not, the operator is warned.
 */

import turfContains from '@turf/boolean-contains';
import { polygon as turfPolygon } from '@turf/helpers';

import type { GdmShowJson } from './types';

export type GdmGeofenceMismatch =
  | { reason: 'noPolygon' }
  | { reason: 'outside' }
  | { reason: 'ceiling'; maxAltitude: number; ceiling: number };

type Point2D = [number, number];

const closedRing = (points: Point2D[]): Point2D[] => [...points, points[0]];

/**
 * Returns how the geofence Control uploads differs from the `.gdm`'s own
 * geofence, or `undefined` if Control's fence lies within it (or the `.gdm`
 * has none).
 *
 * @param gdmGeofence    the `.gdm`'s geofence, in show coordinates
 * @param controlPolygon the polygon Control uploads, in show coordinates
 * @param maxAltitude    the altitude limit Control uploads, in metres
 */
export function compareWithGdmGeofence(
  gdmGeofence: GdmShowJson['geofence'] | undefined,
  controlPolygon: Array<[number, number]> | undefined,
  maxAltitude: number | undefined
): GdmGeofenceMismatch | undefined {
  if (!gdmGeofence || gdmGeofence.polygon.length < 3) {
    return undefined;
  }

  if (!controlPolygon || controlPolygon.length < 3) {
    return { reason: 'noPolygon' };
  }

  const gdm = turfPolygon([closedRing(gdmGeofence.polygon)]);
  const control = turfPolygon([
    closedRing(controlPolygon.map(([x, y]): Point2D => [x, y])),
  ]);
  if (!turfContains(gdm, control)) {
    return { reason: 'outside' };
  }

  if (
    maxAltitude !== undefined &&
    Number.isFinite(maxAltitude) &&
    maxAltitude > gdmGeofence.ceiling_m
  ) {
    return { reason: 'ceiling', maxAltitude, ceiling: gdmGeofence.ceiling_m };
  }

  return undefined;
}
