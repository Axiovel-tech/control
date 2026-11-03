import { createSelector } from '@reduxjs/toolkit';

import { getUserDefinedHeightLimit } from '~/features/safety/selectors';

import {
  getGdmShowInfo,
  getGeofencePolygonInShowCoordinates,
} from '../selectors';

import { compareWithGdmGeofence } from './geofence';

/**
 * Returns how the geofence that Control uploads differs from the loaded
 * `.gdm`'s own geofence, or `undefined` if it does not (or no `.gdm` with a
 * geofence is loaded).
 */
export const selectGdmGeofenceMismatch = createSelector(
  getGdmShowInfo,
  getGeofencePolygonInShowCoordinates,
  getUserDefinedHeightLimit,
  (gdm, polygon, maxAltitude) =>
    gdm ? compareWithGdmGeofence(gdm.geofence, polygon, maxAltitude) : undefined
);
