import isNil from 'lodash-es/isNil';
import { CANCEL } from 'redux-saga';

import {
  getGeofenceActionWithValidation,
  getReverseMissionMapping,
} from '~/features/mission/selectors';
import { GeofenceAction } from '~/features/safety/model';
import {
  getUserDefinedDistanceLimit,
  getUserDefinedHeightLimit,
} from '~/features/safety/selectors';
import { JobScope } from '~/features/upload/jobs';
import messageHub from '~/message-hub';

import { JOB_TYPE } from './constants';
import { createGdmUploadForSlot, isGdmUploadJobData } from './gdm/upload';
import { normalizeShowOrientation } from './orientation';
import {
  getCommonShowSettings,
  getDroneSwarmSpecification,
  getGdmShowInfo,
  getGeofencePolygonInShowCoordinates,
  getMeanSeaLevelReferenceOfShowCoordinatesOrNull,
  getOutdoorShowCoordinateSystem,
  getShowMetadata,
  isGdmShowLoaded,
  isShowOutdoor,
} from './selectors';

/**
 * Retrieves a complete geofence specification object that is to be used in
 * the show specification that is to be sent to the server during the upload
 * task.
 */
const getGeofenceSpecificationForShow = (state) => {
  const geofenceAction = getGeofenceActionWithValidation(state);
  const geofencePolygon = getGeofencePolygonInShowCoordinates(state);
  const geofence = {
    version: 1,
    enabled: true,
    polygons: geofencePolygon
      ? [
          {
            isInclusion: true,
            points: geofencePolygon,
          },
        ]
      : [],
    rallyPoints: [],
    maxAltitude: getUserDefinedHeightLimit(state),
    maxDistance: getUserDefinedDistanceLimit(state),
  };

  if (geofenceAction !== GeofenceAction.KEEP_CURRENT) {
    geofence.action = geofenceAction;
  }

  return geofence;
};

/**
 * Returns the show coordinate system to be sent to the server with a show
 * upload, validated and with its orientation normalized.
 */
const getShowCoordinateSystemForUpload = (state) => {
  const coordinateSystem = getOutdoorShowCoordinateSystem(state);
  if (
    isShowOutdoor(state) &&
    (typeof coordinateSystem !== 'object' ||
      !Array.isArray(coordinateSystem.origin))
  ) {
    throw new TypeError('Show coordinate system not specified');
  }

  // The orientation ends up in the drones' SHOW_ORIENTATION parameter,
  // whose firmware treats any negative angle as the "not configured"
  // sentinel (see ./orientation.ts) — normalize it into [0, 360).
  return coordinateSystem && typeof coordinateSystem === 'object'
    ? {
        ...coordinateSystem,
        orientation: normalizeShowOrientation(coordinateSystem.orientation),
      }
    : coordinateSystem;
};

/**
 * Returns the mission description sent to the server with a show upload.
 */
const getMissionInfoForUpload = (state, missionIndex, numDrones) => {
  const { id: missionId, title } = getShowMetadata(state);
  return {
    id: missionId,
    title,
    index: missionIndex,
    displayName: `${missionId || 'drone-show'} / ${missionIndex + 1}`,
    numDrones,
  };
};

/**
 * Selector that constructs the show description to be uploaded to a
 * drone with the given ID.
 */
export function createShowConfigurationForUav(state, uavId) {
  const reverseMapping = getReverseMissionMapping(state);
  const missionIndex = reverseMapping ? reverseMapping[uavId] : undefined;

  if (isNil(missionIndex)) {
    throw new Error(`UAV ${uavId} is not in the current mission`);
  }

  const coordinateSystem = getShowCoordinateSystemForUpload(state);
  const geofence = getGeofenceSpecificationForShow(state);

  const drones = getDroneSwarmSpecification(state);
  if (!drones || !Array.isArray(drones)) {
    throw new Error('Invalid show configuration in state store');
  }

  const droneSpec = drones[missionIndex];
  if (!droneSpec || typeof droneSpec !== 'object') {
    throw new Error(
      `No specification for UAV ${uavId} (index ${missionIndex})`
    );
  }

  const { settings } = droneSpec;
  if (typeof settings !== 'object') {
    throw new TypeError(
      `Invalid show configuration for UAV ${uavId} (index ${missionIndex}) in state store`
    );
  }

  const amslReference = getMeanSeaLevelReferenceOfShowCoordinatesOrNull(state);

  const result = {
    ...getCommonShowSettings(state),
    ...settings,
    amslReference,
    coordinateSystem,
    geofence,
    mission: getMissionInfoForUpload(state, missionIndex, drones.length),
  };

  return result;
}

/**
 * Selector that constructs the `.gdm` upload payload of the drone with the
 * given ID: its certified `.gdmb`, the show hash, and the same show-level
 * settings as a `.skyc` upload, without anything that comes from the show
 * file itself.
 */
export function createGdmShowUploadForUav(state, uavId) {
  const reverseMapping = getReverseMissionMapping(state);
  const missionIndex = reverseMapping ? reverseMapping[uavId] : undefined;
  if (isNil(missionIndex)) {
    throw new Error(`UAV ${uavId} is not in the current mission`);
  }

  const drones = getDroneSwarmSpecification(state);
  return createGdmUploadForSlot(getGdmShowInfo(state), uavId, missionIndex, {
    amslReference: getMeanSeaLevelReferenceOfShowCoordinatesOrNull(state),
    coordinateSystem: getShowCoordinateSystemForUpload(state),
    geofence: getGeofenceSpecificationForShow(state),
    mission: getMissionInfoForUpload(state, missionIndex, drones.length),
  });
}

/**
 * Handles a single trajectory upload to a drone. Returns a promise that resolves
 * when the trajectory is uploaded. The promise is extended with a cancellation
 * callback for Redux-saga.
 *
 * @param uavId    the ID of the UAV to upload the show trajectory to
 * @param data     the show specification, as selected from the state store,
 *                 or the `.gdm` upload payload when a `.gdm` show is loaded
 */
async function runSingleShowUpload({ uavId, data }) {
  // No need for a timeout here; it utilizes the message hub, which has its
  // own timeout for failed command executions (although it is quite long)
  const cancelToken = messageHub.createCancelToken();
  const promise = isGdmUploadJobData(data)
    ? messageHub.execute.uploadGdmShow(
        {
          uavId,
          gdmb: data.gdmb,
          showHash: data.showHash,
          config: data.config,
        },
        { cancelToken }
      )
    : messageHub.execute.uploadDroneShow({ uavId, data }, { cancelToken });
  promise[CANCEL] = () => cancelToken.cancel({ allowFailure: true });
  return promise;
}

const selectShowUploadForUav = (state, uavId) =>
  isGdmShowLoaded(state)
    ? createGdmShowUploadForUav(state, uavId)
    : createShowConfigurationForUav(state, uavId);

const spec = {
  executor: runSingleShowUpload,
  selector: selectShowUploadForUav,
  scope: JobScope.MISSION,
  title: 'Upload show data',
  type: JOB_TYPE,
};

export default spec;
