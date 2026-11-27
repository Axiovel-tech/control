import type React from 'react';

import { LayerType } from '~/model/layers';

import type { LayerProps } from './MapLayers';
import { VenueGridLayer } from './venue-grid';

export { MapLayers, type LayerConfig } from './MapLayers';

export type { LayerProps };

export const layerSettingsComponents = {};

export const layerComponents: Partial<
  Record<LayerType, React.ComponentType<LayerProps>>
> = {
  [LayerType.VENUE_GRID]: VenueGridLayer,
};
