import {
  layerComponents,
  layerSettingsComponents,
} from '~/components/map/layers';
import { FeaturesLayer } from '~/components/map/layers/features';
import { LayerType } from '~/model/layers';

import { BeaconsLayer } from './beacons';
import { ImageLayer, ImageLayerSettings } from './image';
import { MissionInfoLayer, MissionInfoLayerSettings } from './mission-info';
import { UAVsLayer, UAVsLayerSettings } from './uavs';
import { UAVTraceLayer, UAVTraceLayerSettings } from './uavtrace';
import { UntypedLayer, UntypedLayerSettings } from './untyped';

export const LayerSettings = {
  ...layerSettingsComponents,
  [LayerType.IMAGE]: ImageLayerSettings,
  [LayerType.MISSION_INFO]: MissionInfoLayerSettings,
  [LayerType.UAVS]: UAVsLayerSettings,
  [LayerType.UAV_TRACE]: UAVTraceLayerSettings,
  [LayerType.UNTYPED]: UntypedLayerSettings,
};

export const stateObjectToLayerSettings = (layer, layerId) => {
  if (!(layer.type in LayerSettings)) {
    throw new Error(
      `Cannot render settings for nonexistent layer type (${layer.type}).`
    );
  }

  const CurrentLayerSettings = LayerSettings[layer.type];
  return (
    <CurrentLayerSettings
      key={`${layerId}_settings`}
      layer={layer}
      layerId={layerId}
    />
  );
};

export const Layers = {
  ...layerComponents,
  [LayerType.BEACONS]: BeaconsLayer,
  [LayerType.FEATURES]: FeaturesLayer,
  [LayerType.IMAGE]: ImageLayer,
  [LayerType.MISSION_INFO]: MissionInfoLayer,
  [LayerType.UAVS]: UAVsLayer,
  [LayerType.UAV_TRACE]: UAVTraceLayer,
  [LayerType.UNTYPED]: UntypedLayer,
};
