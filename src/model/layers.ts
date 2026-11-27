/**
 * @file Functions and constants related to the different types of layers
 * that we use on the map.
 */

import Flight from '@mui/icons-material/Flight';
import Grid from '@mui/icons-material/GridOn';
import HelpOutline from '@mui/icons-material/HelpOutline';
import Image from '@mui/icons-material/Image';
import Info from '@mui/icons-material/Info';
import Streetview from '@mui/icons-material/Streetview';
import Timeline from '@mui/icons-material/Timeline';
import type BaseLayer from 'ol/layer/Base';
import type OLLayer from 'ol/layer/Layer';
import type OLMap from 'ol/Map';
import * as React from 'react';

import Antenna from '~/icons/Antenna';

/**
 * Enum containing constants for the various layer types that we support.
 */
export enum LayerType {
  BEACONS = 'beacons',
  FEATURES = 'features',
  IMAGE = 'image',

  // TODO: Left for backwards compatibility, rename at the next major version!
  MISSION_INFO = 'home',

  UAVS = 'uavs',
  UAV_TRACE = 'uavTrace',
  UNTYPED = 'untyped',
  VENUE_GRID = 'venueGrid',
}

export type Layer = {
  id: string;
  type: LayerType;
  label: string;
  visible: boolean;
  parameters: Record<string, unknown>;
};

/**
 * Constant containing all the layer types in the order preferred on the UI.
 */
export const LayerTypes: readonly LayerType[] = [
  LayerType.VENUE_GRID,
  LayerType.IMAGE,
  LayerType.FEATURES,
  LayerType.BEACONS,
  LayerType.MISSION_INFO,
  LayerType.UAVS,
  LayerType.UAV_TRACE,
] as const;

/**
 * Object mapping layer type constants to their properties.
 * (labels, icons, default parameters etc.)
 */
const propertiesForLayerTypes: Record<
  LayerType,
  {
    label: string;
    icon: React.ComponentType;
    parameters?: Record<string, unknown>;
    multiple?: boolean;
  }
> = {
  [LayerType.BEACONS]: {
    label: 'Anchors',
    icon: Antenna,
    parameters: {},
  },
  [LayerType.FEATURES]: {
    label: 'Features',
    icon: Streetview,
    parameters: {},
  },
  [LayerType.IMAGE]: {
    label: 'Image',
    icon: Image,
    parameters: {
      image: {
        data: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IiNmZmYiLz4KPHBhdGggZD0ibTAgMCAxMDAgMTAwIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iMXB4Ii8+CjxwYXRoIGQ9Ik0gMCwxMDAgMTAwLDAiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLXdpZHRoPSIxcHgiLz4KPC9zdmc+Cg==',
        name: '',
        dimensions: {},
      },
      transform: {
        position: undefined,
        angle: 0,
        scale: 1,
      },
    },
    multiple: true,
  },
  [LayerType.MISSION_INFO]: {
    label: 'Show info',
    icon: Info,
    parameters: {
      showConvexHull: true,
      showOrigin: true,
      showHomePositions: true,
      showLandingPositions: false,
      showTrajectoriesOfSelection: true,
      showMissionItems: true,
    },
  },
  [LayerType.UAVS]: {
    label: 'UAVs',
    icon: Flight,
    parameters: {},
  },
  [LayerType.UAV_TRACE]: {
    label: 'UAV trace',
    icon: Timeline,
    parameters: {
      trailLength: 10,
      trailWidth: 2,
      trailColor: { r: 0, g: 0, b: 0, a: 1 },
    },
  },
  [LayerType.UNTYPED]: {
    label: 'Untyped layer',
    icon: HelpOutline,
  },
  [LayerType.VENUE_GRID]: {
    label: 'Venue grid',
    icon: Grid,
    parameters: {
      // Distance from the origin to the edge of the grid, in meters
      halfExtent: 30,
    },
  },
} as const;

/**
 * Creates a new layer with the given unique identifier, name and type.
 *
 * @param id - The unique identifier of the layer
 * @param type - The type of the layer; must be one of the constants from
 *               the {@link LayerType} enum or undefined; the latter
 *               is replaced with <code>LayerType.UNTYPED</code>.
 * @param label - The label of the layer
 * @param parameters - The parameters of the layer
 * @returns A new layer object
 */
export const createNewLayer = (
  id: string,
  type: LayerType = LayerType.UNTYPED,
  label: string,
  parameters?: Record<string, unknown>
): Layer => ({
  id,
  type,
  label,
  visible: type !== LayerType.UNTYPED,
  parameters: parameters ?? defaultParametersForLayerType(type),
});

/**
 * Returns whether the given layer can be added to the map more than once.
 *
 * @param layerType - The type of the layer; must be one of the
 *                    constants from the {@link LayerType} enum
 * @returns Whether the given layer can be added to the map more than once.
 */
export function areMultipleInstancesAllowedForLayerType(
  layerType: LayerType
): boolean {
  return propertiesForLayerTypes[layerType].multiple ?? false;
}

/**
 * Returns the default parameter settings for the given layer type.
 *
 * @param layerType - The type of the layer; must be one of the
 *                    constants from the {@link LayerType} enum
 * @returns The default parameter settings of the layer
 */
export function defaultParametersForLayerType(
  layerType: LayerType
): Record<string, unknown> {
  const props = propertiesForLayerTypes[layerType];
  const template = props?.parameters ?? {};
  return structuredClone(template);
}

/**
 * Returns all the visible editable layers from the given OpenLayers
 * map object.
 *
 * @param map - The OpenLayers map
 * @returns An array containing all the editable visible layers
 */
export function getVisibleEditableLayers(map: OLMap): BaseLayer[] {
  return map.getLayers().getArray().filter(isLayerVisibleAndEditable);
}

/**
 * Returns all the visible selectable layers from the given OpenLayers
 * map object.
 *
 * @param map - The OpenLayers map
 * @returns An array containing all the selectable visible layers
 */
export function getVisibleSelectableLayers(map: OLMap): BaseLayer[] {
  return map.getLayers().getArray().filter(isLayerVisibleAndSelectable);
}

/**
 * Returns a Material UI icon that can be used to represent the layer of
 * the given type on the user interface.
 *
 * @param layerType - The type of the layer; must be one of the
 *                    constants from the {@link LayerType} enum
 * @returns The Material UI icon that represents the layer
 */
export function iconForLayerType(layerType: LayerType): React.JSX.Element {
  return React.createElement(propertiesForLayerTypes[layerType].icon);
}

/**
 * Returns true if the features of the given layer are visible and may trigger
 * a tooltip to be displayed if the feature is close to the mouse cursor.
 *
 * @param layer - The layer to test
 * @returns Whether the given layer is visible and contains features that may
 *          trigger a tooltip if the feature is close to the mouse cursor.
 */
export function canLayerTriggerTooltip(layer: BaseLayer): boolean {
  return Boolean(layer?.getVisible?.() && layer.get('triggersTooltip'));
}

/**
 * Returns true if the given layer is visible and
 * contains features that may be edited by the user.
 *
 * @param layer - The layer to test
 * @returns Whether the given layer is visible and
 *          contains features that may be edited by the user
 */
export function isLayerVisibleAndEditable(layer: BaseLayer): boolean {
  return Boolean(layer?.getVisible?.() && layer.get('editable'));
}

/**
 * Returns true if the given layer is visible and
 * contains features that may be selected by the user.
 *
 * @param layer - The layer to test
 * @returns Whether the given layer is visible and
 *          contains features that may be selected by the user
 */
export function isLayerVisibleAndSelectable(layer: BaseLayer): boolean {
  return Boolean(layer?.getVisible?.() && layer.get('selectable'));
}

/**
 * Returns a human-readable label describing the given layer type on the
 * user interface.
 *
 * @param layerType - The type of the layer; must be one of the
 *                    constants from the {@link LayerType} enum
 * @returns A human-readable description of the layer type
 */
export function labelForLayerType(layerType: LayerType): string {
  return propertiesForLayerTypes[layerType].label;
}

/**
 * Sets whether the given layer is editable or not.
 *
 * @param layer - The layer to update
 * @param editable - Whether the layer should be editable
 */
export function setLayerEditable(layer: OLLayer, editable = true): void {
  layer.set('editable', editable);
}

/**
 * Sets whether the given layer is selectable or not.
 *
 * @param layer - The layer to update
 * @param selectable - Whether the layer should be selectable
 */
export function setLayerSelectable(layer: OLLayer, selectable = true): void {
  layer.set('selectable', selectable);
}

/**
 * Sets whether the features on the given layer close to the mouse cursor will
 * trigger a tooltip or not.
 *
 * @param layer - The layer to update
 * @param triggers - Whether the features of the layer should trigger a tooltip
 */
export function setLayerTriggersTooltip(layer: OLLayer, triggers = true): void {
  layer.set('triggersTooltip', triggers);
}
