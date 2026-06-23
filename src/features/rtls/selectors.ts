import { createSelector } from '@reduxjs/toolkit';

import { type AppSelector } from '~/store/reducers';
import {
  type Collection,
  type Identifier,
  selectOrdered,
} from '~/utils/collections';

import { type RtlsDeviceParamsState } from './slice';
import {
  getDeviceHealth,
  getOverallHealth,
  type RtlsHealth,
} from './stats-utils';
import {
  type RtlsDevice,
  type RtlsDeviceStats,
  type RtlsOtaJob,
} from './types';

/**
 * Selector that returns the collection of RTLS devices (IDs plus a mapping from
 * IDs to the information stored about them).
 */
export const getRtlsDevicesAsCollection: AppSelector<Collection<RtlsDevice>> = (
  state
) => state.rtls.devices;

/**
 * Selector that returns the list of all RTLS devices in display order.
 */
export const getRtlsDevicesInOrder: AppSelector<RtlsDevice[]> = createSelector(
  getRtlsDevicesAsCollection,
  selectOrdered
);

/**
 * Selector that returns the list of all known RTLS device IDs in display order.
 */
export const getRtlsDeviceIdList: AppSelector<Identifier[]> = (state) =>
  state.rtls.devices.order;

/**
 * Returns the display name of an RTLS device, falling back to its id.
 */
export const getRtlsDeviceDisplayName = (device: RtlsDevice): string =>
  device?.name ?? device?.id ?? 'Unnamed device';

/**
 * Selector that returns the live statistics keyed by device id.
 */
export const getRtlsStatsById: AppSelector<Record<string, RtlsDeviceStats>> = (
  state
) => state.rtls.stats.byId;

/**
 * Selector that returns the timestamp of the last statistics update.
 */
export const getRtlsStatsLastUpdatedAt: AppSelector<number | undefined> = (
  state
) => state.rtls.stats.lastUpdatedAt;

/**
 * Selector factory that returns the last known OTA job for a single device.
 */
export const getRtlsOtaJobForDevice: AppSelector<
  RtlsOtaJob | undefined,
  [Identifier]
> = (state, id) => state.rtls.otaJobs[id];

/**
 * Selector factory that returns the cached parameter-list state for a device.
 */
export const getRtlsParamsStateForDevice: AppSelector<
  RtlsDeviceParamsState | undefined,
  [Identifier]
> = (state, id) => state.rtls.paramsByDevice[id];

/** Selector that returns whether the parameter dialog is open. */
export const isRtlsParamDialogOpen: AppSelector<boolean> = (state) =>
  state.rtls.paramDialog.open;

/** Selector that returns the device id targeted by the parameter dialog. */
export const getRtlsParamDialogDeviceId: AppSelector<string | undefined> = (
  state
) => state.rtls.paramDialog.deviceId;

/** Selector that returns whether the OTA dialog is open. */
export const isRtlsOtaDialogOpen: AppSelector<boolean> = (state) =>
  state.rtls.otaDialog.open;

/** Selector that returns the device id targeted by the OTA dialog. */
export const getRtlsOtaDialogDeviceId: AppSelector<string | undefined> = (
  state
) => state.rtls.otaDialog.deviceId;

/**
 * Selector that returns the overall (worst-case) RTLS health across *all* known
 * RTLS devices. A discovered device that has not yet reported statistics
 * contributes an UNKNOWN health, so a fleet with a mix of healthy and
 * statless devices does not collapse to "healthy".
 */
export const getOverallRtlsHealth: AppSelector<RtlsHealth> = createSelector(
  getRtlsDevicesInOrder,
  getRtlsStatsById,
  (devices, byId) =>
    getOverallHealth(
      devices.map((device) => getDeviceHealth(byId[device.id], device))
    )
);
