import isObject from 'lodash-es/isObject';

import {
  type GeofenceConfiguration,
  type SafetyConfiguration,
} from '~/features/safety/model';
import { type Latitude, type Longitude, type LonLat } from '~/utils/geography';

import {
  type Altitude,
  type GPSPosition,
  type Heading,
  isAltitude,
  isHeading,
} from './geography';

export type MissionIndex = number;

/**
 * Enum representing valid marker type strings.
 */
export enum MarkerType {
  START = 'start',
  END = 'end',
}

export const isMarkerType = (type: unknown): type is MarkerType =>
  Object.values(MarkerType).includes(type as MarkerType);

/**
 * Enum representing the types of missions that we support.
 */
export enum MissionType {
  // Drone light show
  SHOW = 'show',

  // Waypoint mission
  WAYPOINT = 'waypoint',

  // Unknown mission type
  UNKNOWN = '',
}

/**
 * Enum representing known mission items in a waypoint mission.
 */
export enum MissionItemType {
  CHANGE_ALTITUDE = 'changeAltitude',
  CHANGE_FLIGHT_MODE = 'changeFlightMode',
  CHANGE_HEADING = 'changeHeading',
  CHANGE_SPEED = 'changeSpeed',
  GO_TO = 'goTo',
  HOVER = 'hover',
  LAND = 'land',
  MARKER = 'marker',
  RETURN_TO_HOME = 'returnToHome',
  SET_PARAMETER = 'setParameter',
  SET_PAYLOAD = 'setPayload',
  TAKEOFF = 'takeoff',
  UNKNOWN = '',
  UPDATE_FLIGHT_AREA = 'updateFlightArea',
  UPDATE_GEOFENCE = 'updateGeofence',
  UPDATE_SAFETY = 'updateSafety',
}

export const isMissionItemType = (type: unknown): type is MissionItemType =>
  Object.values(MissionItemType).includes(type as MissionItemType);

/**
 * Enum representing valid payload action strings.
 *
 * TODO: Make enum names and values consistent!
 * Also, maybe model this as a union, as certain members can have extra fields.
 */
export enum PayloadAction {
  TURN_ON = 'on',
  TURN_OFF = 'off',
  TRIGGER = 'trigger',
  TRIGGER_AT_INTERVAL = 'triggerInterval',
  TRIGGER_AT_DISTANCE = 'triggerDistance',
}

export const isPayloadAction = (action: unknown): action is PayloadAction =>
  Object.values(PayloadAction).includes(action as PayloadAction);

export type FlightAreaPolygon = {
  isInclusion: boolean;
  points: LonLat[];
};

export type FlightAreaConfiguration = {
  maxAltitude?: number;
  minAltitude?: number;
  polygons?: FlightAreaPolygon[];
};

/**
 * Type that defines the basic structure of a mission item.
 */
export type MissionItemLike = {
  id: string;
  type: MissionItemType;
  parameters: Record<string, unknown>;
};

export const isMissionItemLike = (item: unknown): item is MissionItemLike =>
  // prettier-ignore
  isObject(item)
  // `id` is a valid identifier
  && 'id' in item
  && typeof item.id === 'string'
  // `type` is a valid mission item type
  && 'type' in item
  && isMissionItemType(item.type)
  // `parameters` is a valid object
  && 'parameters' in item
  && isObject(item.parameters);

/**
 * Type specification for items in a waypoint mission.
 *
 * TODO: Keep this in sync with `server/src/flockwave/server/model/mission.py`!
 */
export type MissionItem = MissionItemLike &
  (
    | {
        type: MissionItemType.CHANGE_ALTITUDE;
        parameters: { alt: Altitude; velocityZ?: number };
      }
    | { type: MissionItemType.CHANGE_FLIGHT_MODE; parameters: { mode: string } }
    | {
        type: MissionItemType.CHANGE_HEADING;
        parameters: { heading: Heading; rate?: number };
      }
    | {
        type: MissionItemType.CHANGE_SPEED;
        parameters: { velocityXY?: number; velocityZ?: number };
      }
    | {
        type: MissionItemType.GO_TO;
        parameters: {
          lat: Latitude;
          lon: Longitude;
          alt?: Altitude;
          velocityXY?: number;
          velocityZ?: number;
        };
      }
    | {
        type: MissionItemType.HOVER;
        parameters: { duration: number };
      }
    | {
        type: MissionItemType.LAND;
        parameters: { velocityZ?: number };
      }
    | {
        type: MissionItemType.MARKER;
        parameters: { marker: MarkerType; ratio: number };
      }
    | {
        type: MissionItemType.RETURN_TO_HOME;
        parameters: { velocityXY?: number; velocityZ?: number };
      }
    | {
        type: MissionItemType.SET_PARAMETER;
        parameters: { name: string; value: boolean | number | string };
      }
    | {
        type: MissionItemType.SET_PAYLOAD;
        parameters: { name: string; action: PayloadAction; value?: number };
      }
    | {
        type: MissionItemType.TAKEOFF;
        parameters: { alt: Altitude; velocityZ?: number };
      }
    | { type: MissionItemType.UNKNOWN }
    | {
        type: MissionItemType.UPDATE_FLIGHT_AREA;
        parameters: { flightArea: FlightAreaConfiguration };
      }
    | {
        type: MissionItemType.UPDATE_GEOFENCE;
        parameters: { geofence: GeofenceConfiguration };
      }
    | {
        type: MissionItemType.UPDATE_SAFETY;
        parameters: { safety: SafetyConfiguration };
      }
  );

/**
 * Returns whether the given mission item is valid.
 */

export const isMissionItemValid = (item: unknown): item is MissionItem => {
  if (!isMissionItemLike(item)) {
    return false;
  }

  switch (item.type) {
    case MissionItemType.CHANGE_ALTITUDE: {
      const { alt, velocityZ }: { alt?: unknown; velocityZ?: unknown } =
        item.parameters;

      return (
        isAltitude(alt) &&
        (velocityZ === undefined || Number.isFinite(velocityZ))
      );
    }

    case MissionItemType.CHANGE_FLIGHT_MODE: {
      const { mode }: { mode?: unknown } = item.parameters;

      return typeof mode === 'string';
    }

    case MissionItemType.CHANGE_HEADING: {
      const { heading, rate }: { heading?: unknown; rate?: unknown } =
        item.parameters;

      return (
        isHeading(heading) && (rate === undefined || Number.isFinite(rate))
      );
    }

    case MissionItemType.CHANGE_SPEED: {
      const {
        velocityXY,
        velocityZ,
      }: { velocityXY?: unknown; velocityZ?: unknown } = item.parameters;

      return (
        (velocityXY === undefined || Number.isFinite(velocityXY)) &&
        (velocityZ === undefined || Number.isFinite(velocityZ))
      );
    }

    case MissionItemType.GO_TO: {
      const {
        lat,
        lon,
        alt,
        velocityXY,
        velocityZ,
      }: {
        lon?: unknown;
        lat?: unknown;
        alt?: unknown;
        velocityXY?: unknown;
        velocityZ?: unknown;
      } = item.parameters;

      return (
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        (alt === undefined || isAltitude(alt)) &&
        (velocityXY === undefined || Number.isFinite(velocityXY)) &&
        (velocityZ === undefined || Number.isFinite(velocityZ))
      );
    }

    case MissionItemType.HOVER: {
      const { duration }: { duration?: unknown } = item.parameters;

      return Number.isFinite(duration);
    }

    case MissionItemType.LAND: {
      const { velocityZ }: { velocityZ?: unknown } = item.parameters;

      return velocityZ === undefined || Number.isFinite(velocityZ);
    }

    case MissionItemType.MARKER: {
      const { marker, ratio }: { marker?: unknown; ratio?: unknown } =
        item.parameters;

      return isMarkerType(marker) && Number.isFinite(ratio);
    }

    case MissionItemType.RETURN_TO_HOME: {
      const {
        velocityXY,
        velocityZ,
      }: { velocityXY?: unknown; velocityZ?: unknown } = item.parameters;

      return (
        (velocityXY === undefined || Number.isFinite(velocityXY)) &&
        (velocityZ === undefined || Number.isFinite(velocityZ))
      );
    }

    case MissionItemType.SET_PARAMETER: {
      const { name, value }: { name?: unknown; value?: unknown } =
        item.parameters;

      return (
        typeof name === 'string' &&
        (typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value)) ||
          typeof value === 'string')
      );
    }

    case MissionItemType.SET_PAYLOAD: {
      const {
        name,
        action,
        value,
      }: { name?: unknown; action?: unknown; value?: unknown } =
        item.parameters;

      return (
        typeof name === 'string' &&
        isPayloadAction(action) &&
        (value === undefined || Number.isFinite(value))
      );
    }

    case MissionItemType.TAKEOFF: {
      const { alt, velocityZ }: { alt?: unknown; velocityZ?: unknown } =
        item.parameters;

      return (
        isAltitude(alt) &&
        (velocityZ === undefined || Number.isFinite(velocityZ))
      );
    }

    case MissionItemType.UNKNOWN:
      return false; // TODO: Should unknown mission item be considered invalid?

    case MissionItemType.UPDATE_FLIGHT_AREA: {
      // TODO: "Update flight area" items need complex validation
      const { coordinateSystem }: { coordinateSystem?: unknown } =
        item.parameters;

      return (
        typeof coordinateSystem === 'string' && coordinateSystem === 'geodetic'
      );
    }

    case MissionItemType.UPDATE_GEOFENCE: {
      // TODO: "Update geofence" items need complex validation
      const { coordinateSystem }: { coordinateSystem?: unknown } =
        item.parameters;

      return (
        typeof coordinateSystem === 'string' && coordinateSystem === 'geodetic'
      );
    }

    case MissionItemType.UPDATE_SAFETY: {
      // TODO: "Update safety" items need complex validation
      const { safety }: { safety?: unknown } = item.parameters;

      return Boolean(safety);
    }
  }
};

/**
 * Extracts a polygon from a mission item, corresponding to the area where the
 * item should appear on the map, or undefined if the mission item should not
 * be represented on the map.
 */
export function getAreaFromMissionItem(
  item: MissionItem
): { points: LonLat[] } | undefined {
  if (!isMissionItemValid(item)) {
    return undefined;
  }

  if (item.type === MissionItemType.UPDATE_FLIGHT_AREA) {
    const { flightArea } = item.parameters;
    return flightArea.polygons?.[0];
  }
}

/**
 * Extracts a GPS coordinate from a mission item, corresponding to the point
 * where the item should appear on the map, or undefined if the mission item
 * should not be represented on the map. GPS coordinates are represented with
 * keys `lon` and `lat`.
 */
export function getCoordinateFromMissionItem(
  item: MissionItem
): GPSPosition | undefined {
  if (!isMissionItemValid(item)) {
    return undefined;
  }

  if (item.type === MissionItemType.GO_TO) {
    const { lon, lat } = item.parameters;
    return { lon, lat };
  }
}

/**
 * Extracts an altitude object from a mission item, including the value and the
 * reference. The returned object will have two keys: `value` for the value of
 * the altitude and `reference` for the reference altitude (`home` for altitude
 * above home, `msl` for altitude above mean sea level and maybe `terrain`
 * for altitude above terrain in the future).
 */
export function getAltitudeFromMissionItem(
  item: MissionItem
): Altitude | undefined {
  if (!isMissionItemValid(item)) {
    return undefined;
  }

  if (
    item.type === MissionItemType.GO_TO ||
    item.type === MissionItemType.TAKEOFF ||
    item.type === MissionItemType.CHANGE_ALTITUDE
  ) {
    return item.parameters.alt;
  }
}
