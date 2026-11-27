import { getProposedIdForNewFeature } from '~/features/map-features/selectors';
import {
  addFeatureById,
  removeFeaturesByIds,
} from '~/features/map-features/slice';
import {
  getGeofencePolygonId,
  getMissionType,
} from '~/features/mission/selectors';
import { setGeofencePolygonId } from '~/features/mission/slice';
import { showError } from '~/features/snackbar/actions';
import { type Feature, FeatureType } from '~/model/features';
import { type AppThunk } from '~/store/reducers';
import { type LonLat } from '~/utils/geography';

import { getAutomaticGeofencePolygonForCurrentMissionType } from './selectors';

/**
 * Thunk that adds a geofence polygon with the given coordinates and owner.
 *
 * @returns whether the polygon was added
 */
export const addGeofencePolygon =
  (points: LonLat[], owner: string): AppThunk<boolean> =>
  (dispatch, getState) => {
    const state = getState();

    if (points.length < 3) {
      showError('Geofence to be added contains less than 3 points', {
        permanent: true,
      });
      return false;
    }

    const geofencePolygon: Feature = {
      type: FeatureType.POLYGON,
      points,
    };
    const geofencePolygonId = getProposedIdForNewFeature(
      state,
      geofencePolygon
    );
    dispatch(
      addFeatureById({
        id: geofencePolygonId,
        feature: geofencePolygon,
        properties: { owner },
      })
    );
    dispatch(setGeofencePolygonId(geofencePolygonId));
    return true;
  };

/**
 * Thunk that removes the current geofence polygon.
 */
export const removeGeofencePolygon = (): AppThunk => (dispatch, getState) => {
  const geofencePolygonId = getGeofencePolygonId(getState());
  if (geofencePolygonId !== undefined) {
    dispatch(removeFeaturesByIds([geofencePolygonId]));
  }
};

/**
 * Thunk that updates (adds if missing, replaces if present) the geofence
 * polygon based on the current mission type.
 *
 * @returns whether the polygon was updated
 */
export const updateGeofencePolygon =
  (): AppThunk<boolean> => (dispatch, getState) => {
    const state = getState();
    const missionType = getMissionType(state);
    const geofencePolygon =
      getAutomaticGeofencePolygonForCurrentMissionType(state);

    return geofencePolygon.match(
      (value) => {
        dispatch(removeGeofencePolygon());
        return dispatch(addGeofencePolygon(value, missionType));
      },
      (error) => {
        showError(`Could not update geofence: ${error}`, { permanent: true });
        return false;
      }
    );
  };
