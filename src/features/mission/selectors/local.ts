import { createSelector } from '@reduxjs/toolkit';
import * as TurfHelpers from '@turf/helpers';
import isNil from 'lodash-es/isNil';
import max from 'lodash-es/max';
import range from 'lodash-es/range';
import unary from 'lodash-es/unary';

import { GeofenceAction, isValidGeofenceAction } from '~/features/safety/model';
import { type Altitude, type GPSPosition } from '~/model/geography';
import {
  getAltitudeFromMissionItem,
  getAreaFromMissionItem,
  getCoordinateFromMissionItem,
  type MissionIndex,
  type MissionItem,
  type MissionItemType,
  MissionType,
} from '~/model/missions';
import type UAV from '~/model/uav';
import { type AppSelector } from '~/store/reducers';
import { rejectNullish } from '~/utils/arrays';
import {
  type Collection,
  type Identifier,
  selectOrdered,
} from '~/utils/collections';
import {
  type EasNor,
  FlatEarthCoordinateSystem,
  type LonLat,
  mapViewCoordinateFromLonLat,
  turfDistanceInMeters,
} from '~/utils/geography';
import { convexHull2D } from '~/utils/math';
import { findNearestNeighborsDistance } from '~/utils/nearestNeighbors';
import { type Nullable } from '~/utils/types';

import { type MissionSliceState } from '../slice';

/**
 * Key selector function for cached selectors that cache things by mission
 * index.
 */
export const selectMissionIndex: AppSelector<number, [number]> = (
  _state,
  missionIndex
) => missionIndex;

/**
 * Returns the type of the current mission.
 */
export const getMissionType: AppSelector<MissionType> = (state) =>
  state.mission.type ?? MissionType.UNKNOWN;

/**
 * Selector that returns a list of mission item IDs with a mapping from these
 * IDs to their stored representations.
 */
export const getMissionItemsAsCollection: AppSelector<
  Collection<MissionItem>
> = (state) => state.mission.items;

/**
 * Returns the IDs of the items in the current waypoint-based mission, in the
 * order they should appear on the UI.
 */
export const getMissionItemIds: AppSelector<Identifier[]> = (state) =>
  state.mission.items.order;

/**
 * Returns a mapping from IDs to the corresponding mission items.
 */
export const getMissionItemsById: AppSelector<
  Record<Identifier, MissionItem>
> = (state) => state.mission.items.byId;

/**
 * Returns a single mission item by its ID.
 */
export const getMissionItemById: AppSelector<
  MissionItem | undefined,
  [Identifier]
> = (state, itemId) => state.mission.items.byId[itemId];

/**
 * Returns the items in the current waypoint-based mission.
 */
export const getMissionItemsInOrder: AppSelector<MissionItem[]> =
  createSelector(getMissionItemsAsCollection, selectOrdered);

/**
 * Returns the items in the current waypoint-based mission annotated with their
 * order based indices.
 */
export const getMissionItemsInOrderWithIndices: AppSelector<
  Array<{ index: number; item: MissionItem }>
> = createSelector(getMissionItemsInOrder, (missionItems) =>
  missionItems.map((item, index) => ({ index, item }))
);

/**
 * Returns the list of items in the current waypoint-based mission that have the
 * given type, annotated with their order based indices.
 *
 * TODO: Improve typing to return a list specific to the given MissionItemType.
 */
export const getMissionItemsOfTypeWithIndices: AppSelector<
  Array<{ index: number; item: MissionItem }>,
  [MissionItemType]
> = createSelector(
  getMissionItemsInOrderWithIndices,
  ((_state, missionItemType) => missionItemType) satisfies AppSelector<
    MissionItemType,
    [MissionItemType]
  >,
  (itemsWithIndices, missionItemType) =>
    itemsWithIndices.filter(({ item: { type } }) => type === missionItemType)
);

/**
 * Returns the current list of home positions in the mission.
 */
export const getGPSBasedHomePositionsInMission: AppSelector<
  MissionSliceState['homePositions']
> = (state) => state.mission.homePositions;

/**
 * Returns the current list of non-null home positions in the mission.
 */
export const getNonNullGPSBasedHomePositionsInMission: AppSelector<
  GPSPosition[]
> = createSelector(getGPSBasedHomePositionsInMission, rejectNullish);

/**
 * Returns the current list of landing positions in the mission.
 */
export const getGPSBasedLandingPositionsInMission: AppSelector<
  MissionSliceState['landingPositions']
> = (state) => state.mission.landingPositions;

/**
 * Returns the current list of non-null landing positions in the mission.
 */
export const getNonNullGPSBasedLandingPositionsInMission: AppSelector<
  GPSPosition[]
> = createSelector(getGPSBasedLandingPositionsInMission, rejectNullish);

/**
 * Returns the current list of takeoff headings in the mission.
 */
export const getTakeoffHeadingsInMission: AppSelector<
  MissionSliceState['takeoffHeadings']
> = (state) => state.mission.takeoffHeadings;

/**
 * Returns the current mapping from mission-specific slots to the corresponding
 * UAV identifiers.
 */
export const getMissionMapping: AppSelector<MissionSliceState['mapping']> = (
  state
) => state.mission.mapping;

/**
 * Returns the contents of a file that would encode the current mission mapping
 * as a string.
 *
 * WARN: This is not a pure selector as it encodes the current time in the file.
 */
export const getMissionMappingFileContents: AppSelector<string> = (state) => {
  const mapping = getMissionMapping(state);
  const length = mapping && Array.isArray(mapping) ? mapping.length : 0;
  const lines = [];

  lines.push(
    `# Mapping file generated at ${new Date().toISOString()}`,
    '#',
    '# showID droneID'
  );

  for (let i = 0; i < length; i++) {
    lines.push(`${i + 1}${isNil(mapping[i]) ? '' : ` ${String(mapping[i])}`}`);
  }

  lines.push('');
  return lines.join('\n');
};

/**
 * Returns a list containing the indices of all the empty mapping slots (i.e.
 * slots that have no assigned drone yet).
 */
export const getEmptyMappingSlotIndices: AppSelector<MissionIndex[]> =
  createSelector(getMissionMapping, (mapping) =>
    mapping
      ? range(mapping.length).filter((index) => isNil(mapping[index]))
      : []
  );

/**
 * Returns the index of the mapping slot being edited.
 */
export const getIndexOfMappingSlotBeingEdited: AppSelector<MissionIndex> = (
  state
) => state.mission.mappingEditor.indexBeingEdited;

/**
 * Returns the reverse mapping from UAV IDs to the corresponding mission IDs.
 */
export const getReverseMissionMapping: AppSelector<Record<UAV['id'], number>> =
  createSelector(getMissionMapping, (mapping) =>
    Object.fromEntries(
      mapping.flatMap((uavId, missionIndex) =>
        isNil(uavId) ? [] : [[uavId, missionIndex]]
      )
    )
  );

/**
 * Returns the ID of the UAV that is currently at the mapping slot being edited.
 */
export const getUAVIdForMappingSlotBeingEdited: AppSelector<
  Nullable<UAV['id']> | undefined
> = createSelector(
  getMissionMapping,
  getIndexOfMappingSlotBeingEdited,
  (mapping, index) => (index >= 0 ? mapping[index] : undefined)
);

/**
 * Returns a list of all the UAV IDs that participate in the mission, without
 * the null entries, sorted in ascending order by the UAV IDs.
 *
 * Note that this also includes the IDs of UAVs that are currently not seen
 * by the server but are nevertheless in the mapping.
 */
export const getUAVIdsParticipatingInMission: AppSelector<Array<UAV['id']>> =
  createSelector(getMissionMapping, (mapping) =>
    rejectNullish(mapping).toSorted()
  );

/**
 * Returns whether there is at least one non-empty mapping slot in the mapping.
 */
export const hasNonemptyMappingSlot: AppSelector<boolean> = createSelector(
  getMissionMapping,
  (mapping) => (mapping ? !mapping.every(isNil) : false)
);

/**
 * Returns the index of the communication channel that is currently used to
 * communicate with the UAVs.
 */
export const getPreferredCommunicationChannelIndex: AppSelector<number> = (
  state
) => state.mission.preferredChannelIndex;

/**
 * Returns whether we are broadcasting commands to the drones in the current
 * show from the large flight control panel.
 */
export const areFlightCommandsBroadcast: AppSelector<boolean> = (state) =>
  state.mission.commandsAreBroadcast;

/**
 * Returns whether the mapping is currently being calculated or recalculated.
 */
export const isMappingBeingCalculated: AppSelector<boolean> = (state) =>
  Boolean(state.mission.mappingEditor.calculating);

/**
 * Returns whether it currently makes sense to enable the "augment mapping from
 * current drone positions automatically" button. This action makes sense only
 * if there is at least one spare drone, at least one empty slot in the mapping,
 * the home coordinates are set and we are not calculating a mapping.
 *
 * Note that right now we don't check whether there are spare drones as we would
 * need to reach out to another slice of the state store for that. This can be
 * added later.
 */
export const canAugmentMappingAutomaticallyFromSpareDrones: AppSelector<boolean> =
  createSelector(
    getEmptyMappingSlotIndices,
    getGPSBasedHomePositionsInMission,
    isMappingBeingCalculated,
    (emptySlots, homePositions, calculating) =>
      emptySlots.length > 0 &&
      homePositions.some((position) => !isNil(position)) &&
      !calculating
  );

/**
 * Returns whether the current mapping is editable at the moment.
 */
export const isMappingEditable: AppSelector<boolean> = (state) =>
  state.mission.mappingEditor.enabled;

/**
 * Gets the action to perform when the geofence is breached.
 */
export const getGeofenceAction: AppSelector<GeofenceAction> = (state) =>
  state.mission.geofenceAction || GeofenceAction.KEEP_CURRENT;

/**
 * Gets the action to perform when the geofence is breached, with validation.
 *
 * Throws an error if the geofence action in the state object is not valid.
 */
export const getGeofenceActionWithValidation: AppSelector<GeofenceAction> =
  createSelector(getGeofenceAction, (action) => {
    if (!isValidGeofenceAction(action)) {
      throw new Error('Invalid geofence action: ' + String(action));
    }

    return action;
  });

/**
 * Gets the ID of the polygon that is to be used as a geofence.
 */
export const getGeofencePolygonId: AppSelector<
  MissionSliceState['geofencePolygonId']
> = (state) => state.mission.geofencePolygonId;

// prettier-ignore
type StringLiteral<T> = T extends string ? string extends T ? never : T : never;

type MissionItemWithExtraField<Field extends PropertyKey, Type> = {
  id: MissionItem['id'];
  index: number;
  item: MissionItem;
} & Record<StringLiteral<Field>, Type>;

/**
 * Returns a filtered list of mission items which have a specific type of
 * information, annotated with an extra field that holds said information.
 */
const getMissionItemsWithExtraFieldInOrder = <Field extends PropertyKey, Type>(
  field: StringLiteral<Field>,
  getter: (item: MissionItem) => Type | undefined
): AppSelector<Array<MissionItemWithExtraField<Field, Type>>> =>
  createSelector(
    getMissionItemsInOrder,
    (items) =>
      items
        .map((item, index) => ({
          id: item.id,
          item,
          [field]: getter(item),
          index,
        }))
        .filter((mi) => !isNil(mi[field]))
    // NOTE: I gave up on trying to convince TypeScript to accept this,
    //       the type system seems to have some issues with generics.
    //       Maybe we should try again with Redux Toolkit v2?
  ) as unknown as AppSelector<Array<MissionItemWithExtraField<Field, Type>>>;

/**
 * Returns all the mission items that have areas associated to them. This is
 * used when drawing the mission info layer of the map and during automatic
 * geofence calculation.
 */
export const getMissionItemsWithAreasInOrder: AppSelector<
  Array<MissionItemWithExtraField<'area', { points: LonLat[] }>>
> = getMissionItemsWithExtraFieldInOrder('area', getAreaFromMissionItem);

/**
 * Returns a selector that converts the current list of mission items to a
 * list of objects containing the GPS coordinates where the items should
 * appear on the map, along with the original items themselves. This is used
 * by map views to show the mission items.
 *
 * The returned array will contain objects with the following keys:
 *
 * - id: maps to the ID of the mission item
 * - coordinate: maps to a latitude-longitude pair of the mission item (as an
 *   array of length 2)
 * - item: maps to the item itself
 * - index: the index of the item in the list of mission items
 *
 * Mission items for which no coordinate belongs are not returned.
 */
export const getMissionItemsWithCoordinatesInOrder: AppSelector<
  Array<MissionItemWithExtraField<'coordinate', GPSPosition>>
> = getMissionItemsWithExtraFieldInOrder(
  'coordinate',
  getCoordinateFromMissionItem
);

/**
 * Returns a selector that converts the current list of mission items to a
 * list of objects containing the target altitudes which should be reached
 * during a mission, along with the original items themselves and their indices.
 *
 * The returned array will contain objects with the following keys:
 *
 * - id: maps to the ID of the mission item
 * - altitude: object with have two keys: `value` for the value of the altitude
 *                                   and `reference` for the reference altitude
 * - item: maps to the item itself
 * - index: the index of the item in the list of mission items
 *
 * Mission items for which no altitude belongs are not returned.
 */
export const getMissionItemsWithAltitudesInOrder: AppSelector<
  Array<MissionItemWithExtraField<'altitude', Altitude>>
> = getMissionItemsWithExtraFieldInOrder(
  'altitude',
  getAltitudeFromMissionItem
);

/**
 * Returns the coordinates of the convex hull of the currently loaded mission
 * in world coordinates.
 */
export const getConvexHullOfMissionInWorldCoordinates: AppSelector<LonLat[]> =
  createSelector(
    getGPSBasedHomePositionsInMission,
    getMissionItemsWithCoordinatesInOrder,
    getMissionItemsWithAreasInOrder,
    (homePositions, missionItemsWithCoorinates, missionItemsWithAreas) =>
      convexHull2D([
        ...rejectNullish(homePositions).map(
          ({ lon, lat }): LonLat => [lon, lat]
        ),
        ...missionItemsWithCoorinates.map(
          ({ coordinate: { lon, lat } }): LonLat => [lon, lat]
        ),
        ...missionItemsWithAreas.flatMap(({ area: { points } }) => points),
      ])
  );

/**
 * Returns the coordinates of the convex hull of the currently loaded mission
 * in the coordinate system of the map view.
 */
export const getConvexHullOfMissionInMapViewCoordinates: AppSelector<EasNor[]> =
  createSelector(
    getConvexHullOfMissionInWorldCoordinates,
    (convexHullOfHomePositionsAndMissionItemsInWorldCoordinates) =>
      convexHullOfHomePositionsAndMissionItemsInWorldCoordinates.map(
        unary<LonLat, EasNor>(mapViewCoordinateFromLonLat)
      )
  );

/**
 * Returns the maximum distance of any waypoint or flight area vertex in the
 * mission from the first home position in the UAV mapping.
 */
export const getMaximumHorizontalDistanceFromHomePositionInWaypointMission: AppSelector<
  number | undefined
> = createSelector(
  getGPSBasedHomePositionsInMission,
  getMissionItemsWithCoordinatesInOrder,
  getMissionItemsWithAreasInOrder,
  ([homePosition], missionItemsWithCoorinates, missionItemsWithAreas) => {
    if (!homePosition) {
      return;
    }

    const homePoint = TurfHelpers.point([homePosition.lon, homePosition.lat]);
    return max(
      [
        ...missionItemsWithCoorinates.map<[number, number]>(
          ({ coordinate: { lon, lat } }) => [lon, lat]
        ),
        ...missionItemsWithAreas.flatMap(({ area: { points } }) => points),
      ].map((point) =>
        turfDistanceInMeters(homePoint, TurfHelpers.point(point))
      )
    );
  }
);

/**
 * Returns the maximum target altitude that appears among the waypoints.
 */
export const getMaximumHeightOfWaypoints: AppSelector<number | undefined> =
  createSelector(
    getMissionItemsWithAltitudesInOrder,
    (missionItemsWithAltitude) =>
      // TODO: Handle different altitude references?
      max(missionItemsWithAltitude.map((mi) => mi.altitude.value))
  );

const getApproximateCenterOfGPSPositions = (
  points: GPSPosition[]
): LonLat | undefined => {
  const numPoints = points.length;

  if (numPoints > 0) {
    let lonSum = 0,
      latSum = 0;
    for (const { lon, lat } of points) {
      lonSum += lon;
      latSum += lat;
    }

    return [lonSum / numPoints, latSum / numPoints] as LonLat;
  }
};

/**
 * Returns an "approximate center" of the home positions of the mission.
 * This can be used as the origin of a flat Earth transformation that can
 * convert mission items from geodetic coordinates to Cartesian coordinates.
 */
const getApproximateCenterOfHomePositionsInMission: AppSelector<
  LonLat | undefined
> = createSelector(
  getNonNullGPSBasedHomePositionsInMission,
  getApproximateCenterOfGPSPositions
);

/**
 * Returns an "approximate center" of the landing positions of the mission.
 * This can be used as the origin of a flat Earth transformation that can
 * convert mission items from geodetic coordinates to Cartesian coordinates.
 */
const getApproximateCenterOfLandingPositionsInMission: AppSelector<
  LonLat | undefined
> = createSelector(
  getNonNullGPSBasedLandingPositionsInMission,
  getApproximateCenterOfGPSPositions
);

/**
 * Returns a flat Earth coordinate system that can be used to transform
 * GPS coordinates into a 2D Cartesian coordinate system, assuming that they
 * are sufficiently close to the home points in the mission (such that the
 * distortions of the transformation are negligible).
 */
const getFlatEarthCoordinateSystemForHomePositions: AppSelector<
  FlatEarthCoordinateSystem | undefined
> = createSelector(getApproximateCenterOfHomePositionsInMission, (origin) => {
  return origin ? new FlatEarthCoordinateSystem({ origin }) : undefined;
});

/**
 * Returns a flat Earth coordinate system that can be used to transform
 * GPS coordinates into a 2D Cartesian coordinate system, assuming that they
 * are sufficiently close to the landing points in the mission (such that the
 * distortions of the transformation are negligible).
 */
const getFlatEarthCoordinateSystemForLandingPositions: AppSelector<
  FlatEarthCoordinateSystem | undefined
> = createSelector(
  getApproximateCenterOfLandingPositionsInMission,
  (origin) => {
    return origin ? new FlatEarthCoordinateSystem({ origin }) : undefined;
  }
);

const mapGPSPositionToLonLat = (point: GPSPosition) => {
  const { lon, lat } = point;
  return [lon, lat] as LonLat;
};

const getMinimumDistanceBetweenGPSPositions = (
  points: GPSPosition[],
  flatEarth: FlatEarthCoordinateSystem | undefined
) =>
  flatEarth
    ? findNearestNeighborsDistance(
        points
          .map(mapGPSPositionToLonLat)
          .map((point) => flatEarth.fromLonLat(point))
      )
    : Infinity;

/**
 * Returns the minimum distance between any two home positions. The result of
 * this selector is `Infinity` if there are less than two home positions.
 */
export const getMinimumDistanceBetweenHomePositions = createSelector(
  getNonNullGPSBasedHomePositionsInMission,
  getFlatEarthCoordinateSystemForHomePositions,
  getMinimumDistanceBetweenGPSPositions
);

/**
 * Returns the minimum distance between any two landing positions. The result of
 * this selector is `Infinity` if there are less than two landing positions.
 */
export const getMinimumDistanceBetweenLandingPositions = createSelector(
  getNonNullGPSBasedLandingPositionsInMission,
  getFlatEarthCoordinateSystemForLandingPositions,
  getMinimumDistanceBetweenGPSPositions
);

/**
 * Selector that returns the id of the mission item that's currently being
 * executed.
 */
export const getCurrentMissionItemId: AppSelector<
  MissionItem['id'] | undefined
> = (state) => state.mission.progress.currentItemId;

/**
 * Selector that returns the index of the mission item that's currently being
 * executed.
 */
export const getCurrentMissionItemIndex: AppSelector<number | undefined> =
  createSelector(
    getMissionItemIds,
    getCurrentMissionItemId,
    (ids, currentId) =>
      currentId === undefined ? undefined : ids.indexOf(currentId)
  );

/**
 * Selector that returns the progress ratio of the mission item that's
 * currently being executed.
 */
export const getCurrentMissionItemRatio: AppSelector<number | undefined> = (
  state
) => state.mission.progress.currentItemRatio;

/**
 * Selector that returns whether mission progress information has been received.
 */
export const isProgressInformationAvailable: AppSelector<boolean> = (state) =>
  state.mission.progress.currentItemId !== undefined;
