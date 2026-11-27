/**
 * @file Saga that keeps the map on the venue.
 *
 * The map has no street map under it, only the venue grid around the map
 * origin. An origin or a view that is away from the anchors and the drones
 * therefore shows an empty map with nothing to find the way back by, so both
 * are brought to the venue when it becomes known or moves.
 */

import { all, delay, put, select, takeLatest } from 'redux-saga/effects';

import type { PayloadAction } from '@reduxjs/toolkit';

import { scrollToMapLocation } from '~/signals';
import type { RootState } from '~/store/reducers';
import {
  type Latitude,
  type Longitude,
  type LonLat,
  turfDistanceInMeters,
} from '~/utils/geography';

import { updateFlatEarthCoordinateSystem } from './origin';

/** Beyond this distance, in meters, a point is not part of the same venue. */
const VENUE_RADIUS = 500;

/** How often to look for the venue, in milliseconds. */
const POLL_INTERVAL = 1000;

const toLonLat = (position?: {
  lat?: number | null;
  lon?: number | null;
}): LonLat | undefined => {
  const { lat, lon } = position ?? {};
  return typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    // a drone without a position fix reports the null island
    (lat !== 0 || lon !== 0)
    ? [lon as Longitude, lat as Latitude]
    : undefined;
};

const positionsOf = (
  byId: Record<string, { position?: { lat?: number; lon?: number } }>
): LonLat[] =>
  Object.keys(byId)
    .sort()
    .map((id) => toLonLat(byId[id]?.position))
    .filter((position): position is LonLat => position !== undefined);

/**
 * Where the venue is: at its anchors, the first of which is the origin of
 * its cell, or at the drones while no anchor is known.
 */
const getVenuePositions = (state: RootState): LonLat[] => {
  const anchors = positionsOf(state.beacons.byId);
  return anchors.length > 0 ? anchors : positionsOf(state.uavs.byId);
};

const getMapOrigin = (state: RootState): LonLat => state.map.origin.position;
const getViewCenter = (state: RootState): LonLat => state.map.view.position;

const isAway = (point: LonLat, from: LonLat[]): boolean =>
  from.every((other) => turfDistanceInMeters(point, other) > VENUE_RADIUS);

/**
 * Brings the view to the map origin when the origin moves out of sight, as
 * it does when a show is adapted to the venue.
 */
function* followOrigin({
  payload,
}: PayloadAction<{ position?: LonLat }>): Generator {
  const { position } = payload;
  if (position === undefined) {
    return;
  }

  const center = (yield select(getViewCenter)) as LonLat;
  if (isAway(center, [position])) {
    scrollToMapLocation(position);
  }
}

/**
 * Brings the map to the venue when its anchors or drones show up: the origin
 * if they are nowhere near it, and the view if it looks elsewhere.
 */
function* findVenue(): Generator {
  let found = false;

  while (true) {
    yield delay(POLL_INTERVAL);

    const venue = (yield select(getVenuePositions)) as LonLat[];
    if (venue.length === 0 || found) {
      // looked for again after the server and its devices went away
      found = venue.length > 0;
      continue;
    }

    found = true;

    const origin = (yield select(getMapOrigin)) as LonLat;
    if (isAway(origin, venue)) {
      // moves the view as well, through followOrigin()
      yield put(updateFlatEarthCoordinateSystem({ position: venue[0] }));
    } else if (isAway((yield select(getViewCenter)) as LonLat, venue)) {
      scrollToMapLocation(origin);
    }
  }
}

export default function* venueSaga(): Generator {
  yield all([
    takeLatest(updateFlatEarthCoordinateSystem.type, followOrigin),
    findVenue(),
  ]);
}
