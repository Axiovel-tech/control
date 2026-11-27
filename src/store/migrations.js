import config from 'config';

import { createNextState } from '@reduxjs/toolkit';
import isEqual from 'lodash-es/isEqual';
import { createMigrate } from 'redux-persist';

import { BatteryThresholdType } from '~/features/safety/model';
import {
  DEFAULT_BATTERY_CELL_COUNT,
  LIPO_CRITICAL_VOLTAGE_THRESHOLD,
  LIPO_FULL_CHARGE_VOLTAGE,
  LIPO_LOW_VOLTAGE_THRESHOLD,
} from '~/model/constants';
import { createNewLayer, LayerTypes } from '~/model/layers';

/** Layer types that the map can still render */
const SUPPORTED_LAYER_TYPES = new Set([...LayerTypes, 'untyped']);

const migrations = {
  2: createNextState((state) => {
    state.settings.uavs = {
      ...state.settings.uavs,
      defaultBatteryCellCount: DEFAULT_BATTERY_CELL_COUNT,
      fullChargeVoltage: LIPO_FULL_CHARGE_VOLTAGE,
      lowVoltageThreshold: LIPO_LOW_VOLTAGE_THRESHOLD,
      criticalVoltageThreshold: LIPO_CRITICAL_VOLTAGE_THRESHOLD,
    };
  }),
  3: createNextState((state) => {
    if (typeof state.safety.settings.lowBatteryVoltage === 'number') {
      state.safety.settings.lowBatteryThreshold = {
        type: BatteryThresholdType.VOLTAGE,
        value: state.safety.settings.lowBatteryVoltage,
      };
    }
  }),
  4: createNextState((state) => {
    // Slices of features that no longer exist
    for (const key of [
      'licenseInfo',
      'measurement',
      'rtk',
      'savedLocations',
      'versionCheck',
    ]) {
      delete state[key];
    }

    delete state.dialogs?.savedLocationEditor;

    // Saved panel arrangements may hold panels that no longer exist; start
    // again from the default layout
    delete state.workbench;
  }),
  5: createNextState((state) => {
    // Slices and fields of features that the redesign removed
    delete state.mapCaching;
    delete state.settings?.display?.altitudeSummaryType;
    delete state.settings?.display?.experimentalFeaturesEnabled;
    delete state.settings?.apiKeys;

    for (const key of [
      'editorPanel',
      'lastSuccessfulPlannerInvocationParameters',
      'name',
      'plannerDialog',
    ]) {
      delete state.mission?.[key];
    }

    // The map lost its street map and most of its layer types, and gained
    // the venue grid as its background
    const layers = state.map?.layers;
    if (layers?.byId && Array.isArray(layers.order)) {
      const removedLayerIds = layers.order.filter(
        (id) => !SUPPORTED_LAYER_TYPES.has(layers.byId[id]?.type)
      );
      for (const id of removedLayerIds) {
        delete layers.byId[id];
      }

      layers.order = layers.order.filter((id) => !removedLayerIds.includes(id));

      if (!layers.order.some((id) => layers.byId[id].type === 'venueGrid')) {
        const id = layers.byId.venueGrid ? 'venueGrid_migrated' : 'venueGrid';
        layers.byId[id] = createNewLayer(id, 'venueGrid', 'Venue grid');
        layers.order.unshift(id);
      }
    }

    // A map that still sits on the old factory defaults moves to the new ones
    const { origin, view } = state.map ?? {};
    if (origin && isEqual(origin.position, [19.0622, 47.4733])) {
      origin.position = config.map.origin.position;
      origin.angle = config.map.origin.angle;
    }

    if (view && isEqual(view.position, [19, 47.5]) && view.zoom === 11) {
      view.position = config.map.view.position;
      view.angle = config.map.view.angle;
      view.zoom = config.map.view.zoom;
    }

    // Battery settings still on the old 3S factory defaults follow the 2S
    // pack of the AxioLight
    const uavSettings = state.settings?.uavs;
    if (
      uavSettings?.defaultBatteryCellCount === 3 &&
      uavSettings.fullChargeVoltage === 4.2 &&
      uavSettings.lowVoltageThreshold === 3.6 &&
      uavSettings.criticalVoltageThreshold === 3.4
    ) {
      uavSettings.defaultBatteryCellCount = DEFAULT_BATTERY_CELL_COUNT;
      uavSettings.criticalVoltageThreshold = LIPO_CRITICAL_VOLTAGE_THRESHOLD;
    }

    // Saved panel arrangements predate the redesigned workbench (new panel
    // set, taller tab strips); start again from the default layout
    delete state.workbench;

    // The UAV list can no longer be sorted by GPS fix, nor by the altitudes
    // that mean nothing indoors (above sea level, above ground)
    const sortPreference = state.settings?.display?.uavListSortPreference;
    if (['agl', 'amsl', 'gpsFix'].includes(sortPreference?.key)) {
      sortPreference.key = 'default';
    }
  }),
};

export default createMigrate(migrations);
