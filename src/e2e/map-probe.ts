/**
 * @file Data-level introspection of the main OpenLayers map.
 *
 * The map renders to a canvas, so a test cannot assert on it through the DOM.
 * Rather than pixel-diffing, the probe reports where each feature *is* — in
 * both geographic and viewport coordinates — and lets the harness assert on
 * numbers.
 */

import { getCenter } from 'ol/extent';
import type Map from 'ol/Map';
import type BaseLayer from 'ol/layer/Base';

import { lonLatFromMapViewCoordinate } from '~/utils/geography';
import { toDegrees } from '~/utils/math';
import { mapReferenceRequestSignal } from '~/signals';

import type { MapProbeResult, ProbedFeature } from './types';

/**
 * Returns the live OpenLayers map, or `undefined` when none is mounted.
 *
 * `mapReferenceRequestSignal` invokes its listeners synchronously, so the
 * reference is available by the time `dispatch()` returns.
 *
 * The handler that answers the signal is registered in a constructor and never
 * detached (`views/map/MapReferenceRequestHandler.ts`), so once a map has been
 * mounted the signal keeps handing out a reference to it even after the panel
 * is closed — the map view is detachable and closable. A detached map has no
 * target element and projects nothing, which would surface as a confidently
 * reported snapshot in which every feature is invisible. Checking the target
 * turns that into an honest "no map".
 */
const getMap = (): Map | undefined => {
  let map: Map | undefined;
  mapReferenceRequestSignal.dispatch((received: Map) => {
    if (received?.getTargetElement()) {
      map = received;
    }
  });
  return map;
};

/**
 * The slice of a feature the probe actually touches.
 *
 * Described structurally rather than via `ol`'s own generics: `VectorLayer`'s
 * source and feature type parameters have changed shape across OpenLayers
 * releases, and every one of them widens to `any` here, which defeats the
 * point of typing this file at all.
 */
type ProbeableFeature = {
  getId(): string | number | undefined;
  getGeometry(): { getExtent(): number[] } | undefined;
};

/**
 * The features of a layer that has an enumerable in-memory source, or none.
 *
 * Layer groups and tile layers have no `getSource`, or a source with no
 * `getFeatures`; both fall through to an empty list.
 */
const featuresOf = (layer: BaseLayer): ProbeableFeature[] => {
  const source = (layer as { getSource?: () => unknown }).getSource?.() as
    | { getFeatures?: () => ProbeableFeature[] }
    | null
    | undefined;

  return typeof source?.getFeatures === 'function' ? source.getFeatures() : [];
};

const probeFeaturesOfLayer = (
  map: Map,
  layer: BaseLayer,
  size: [number, number]
): ProbedFeature[] => {
  // OpenLayers has no canonical layer name and this app sets none — the only
  // `layer.set()` calls in the repo are editable/selectable/triggersTooltip —
  // so the class name is the best available, and is all the contract promises.
  const layerName = layer.constructor.name;
  const features: ProbedFeature[] = [];

  for (const feature of featuresOf(layer)) {
    const id = feature.getId();
    if (id === undefined) {
      // Unidentified features cannot be asserted on by name, and the map
      // carries many of them (grid lines, scale bars); skip them.
      continue;
    }

    const geometry = feature.getGeometry();
    const extent = geometry?.getExtent();
    const probed: ProbedFeature = {
      id: String(id),
      layer: layerName,
      visible: false,
    };

    if (extent && Number.isFinite(extent[0])) {
      const center = getCenter(extent);
      const lonLat = lonLatFromMapViewCoordinate(center);
      probed.lonLat = [lonLat[0], lonLat[1]];

      const pixel = map.getPixelFromCoordinate(center);
      if (pixel && Number.isFinite(pixel[0]) && Number.isFinite(pixel[1])) {
        probed.pixel = [Math.round(pixel[0]), Math.round(pixel[1])];
        probed.visible =
          pixel[0] >= 0 &&
          pixel[1] >= 0 &&
          pixel[0] <= size[0] &&
          pixel[1] <= size[1];
      }
    }

    features.push(probed);
  }

  return features;
};

/**
 * Takes a snapshot of the main map: its view parameters plus every identified
 * vector feature, with geographic and viewport coordinates.
 */
export const mapProbe = (): MapProbeResult => {
  const map = getMap();
  if (!map) {
    return { ready: false, features: [] };
  }

  const view = map.getView();
  const rawSize = map.getSize();
  const size: [number, number] = rawSize ? [rawSize[0], rawSize[1]] : [0, 0];

  const center = view.getCenter();
  const centerLonLat = center ? lonLatFromMapViewCoordinate(center) : undefined;

  const features: ProbedFeature[] = [];
  for (const layer of map.getLayers().getArray()) {
    features.push(...probeFeaturesOfLayer(map, layer, size));
  }

  return {
    ready: true,
    size,
    center: centerLonLat ? [centerLonLat[0], centerLonLat[1]] : undefined,
    zoom: view.getZoom(),
    // OpenLayers rotates counter-clockwise-positive in radians; the UI (and
    // every other part of this app) speaks clockwise-positive degrees.
    rotation: toDegrees(-view.getRotation()),
    features,
  };
};
