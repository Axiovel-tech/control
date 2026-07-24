import { createSelector } from '@reduxjs/toolkit';

import { type Status } from '~/components/semantics';
import {
  getSingleUAVStatusSummary,
  getUAVIdToStateMapping,
} from '~/features/uavs/selectors';
import { type AppSelector } from '~/store/reducers';
import {
  type Collection,
  type Identifier,
  selectOrdered,
} from '~/utils/collections';

import { type RtlsDeviceParamsState } from './slice';
import {
  classifyRole,
  getDeviceHealthForRole,
  getOverallHealth,
  isAnchorRole,
  type RtlsHealth,
  RtlsRole,
} from './stats-utils';
import {
  type RtlsAnchor,
  type RtlsDevice,
  type RtlsDeviceStats,
  type RtlsGeometryCheck,
  type RtlsOtaJob,
  type RtlsPosEstimate,
} from './types';

/**
 * Selector that returns the mapping of device ids whose sleep/wake
 * transaction is currently in flight.
 */
export const getRtlsSleepPendingMap: AppSelector<Record<string, boolean>> = (
  state
) => state.rtls.sleepPending;

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
 * Selector that returns the online tag devices in display order — the devices
 * the position-estimate debug stream can be toggled on. Shared by the
 * "Debug Pos Estimates" toolbar and the stream-toggle thunk so they agree on
 * the target set.
 */
export const getOnlineRtlsTags: AppSelector<RtlsDevice[]> = createSelector(
  getRtlsDevicesInOrder,
  (devices) =>
    devices.filter(
      (device) => device.online && classifyRole(device.role) === RtlsRole.TAG
    )
);

/**
 * Selector that returns every non-anchor device, online or not, for the
 * "RTLS Tags" panel. Devices whose role is not yet known are included: a tag
 * whose UWB_ROLE param has not arrived must not vanish from the UI.
 */
export const getRtlsTagDevices: AppSelector<RtlsDevice[]> = createSelector(
  getRtlsDevicesInOrder,
  (devices) =>
    devices.filter((device) => !isAnchorRole(classifyRole(device.role)))
);

/**
 * Selector that returns every anchor device (initiator or responder), online
 * or not, for the "RTLS Anchors" panel.
 */
export const getRtlsAnchorDevices: AppSelector<RtlsDevice[]> = createSelector(
  getRtlsDevicesInOrder,
  (devices) =>
    devices.filter((device) => isAnchorRole(classifyRole(device.role)))
);

/**
 * Selector that returns the status of each UAV paired with an RTLS device,
 * keyed by UAV id — the same status semantics the UAV list colors its
 * avatars with, so the paired-drone pill on a device row stays visually
 * consistent with the UAV list.
 */
export const getRtlsPairedUavStatuses: AppSelector<
  Record<string, Status | undefined>
> = createSelector(
  getRtlsDevicesInOrder,
  getUAVIdToStateMapping,
  (devices, uavsById) => {
    const result: Record<string, Status | undefined> = {};
    for (const device of devices) {
      if (device.uav !== undefined && !(device.uav in result)) {
        result[device.uav] = getSingleUAVStatusSummary(
          uavsById[device.uav]
        ).status;
      }
    }

    return result;
  }
);

/**
 * Selector that returns the RTLS device that is paired with the given UAV
 * (the tag whose WiFi-UART bridge carries the UAV's MAVLink), or `undefined`
 * when there is none.
 */
export const getRtlsDevicePairedToUav: AppSelector<
  RtlsDevice | undefined,
  [Identifier]
> = (state, uavId) => {
  const devices = state.rtls.devices;
  const id = devices.order.find(
    (deviceId) => devices.byId[deviceId]?.uav === uavId
  );
  return id === undefined ? undefined : devices.byId[id];
};

/**
 * Selector that returns the live position estimates (the X-RTLS-POS debug
 * stream) keyed by device id.
 */
export const getRtlsPositionsById: AppSelector<
  Record<string, RtlsPosEstimate>
> = (state) => state.rtls.positions.byId;

/**
 * Selector that returns the site-level anchor list (configured cell geometry
 * from X-RTLS-INF).
 */
export const getRtlsAnchors: AppSelector<RtlsAnchor[]> = (state) =>
  state.rtls.anchors;

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
 * RTLS devices. Health is role-aware: anchors are judged by liveness
 * (online/last-seen), tags by their solve statistics. A discovered device that
 * has not yet reported the signal relevant to its role contributes an UNKNOWN
 * health, so a fleet with a mix of healthy and statless devices does not
 * collapse to "healthy".
 */
export const getOverallRtlsHealth: AppSelector<RtlsHealth> = createSelector(
  getRtlsDevicesAsCollection,
  getRtlsStatsById,
  (devices, byId) =>
    getOverallHealth(
      devices.order.map((id) => {
        const device = devices.byId[id];
        return getDeviceHealthForRole(
          classifyRole(device?.role),
          byId[id],
          device ? { online: device.online, age: device.age } : undefined
        );
      })
    )
);

/** Selector that returns the last X-RTLS-GEO consistency snapshot, if any. */
export const getRtlsGeometryCheck: AppSelector<
  RtlsGeometryCheck | undefined
> = (state) => state.rtls.geometry.lastCheck;

/** Selector that returns whether a geometry check or sync is in flight. */
export const isRtlsGeometryBusy: AppSelector<boolean> = (state) =>
  state.rtls.geometry.checking || state.rtls.geometry.syncing;

/** Selector that returns whether a geometry sync is in flight. */
export const isRtlsGeometrySyncing: AppSelector<boolean> = (state) =>
  state.rtls.geometry.syncing;

/** Selector that returns whether the sync confirmation dialog is open. */
export const isRtlsGeometrySyncDialogOpen: AppSelector<boolean> = (state) =>
  state.rtls.geometry.syncDialogOpen;

/**
 * Selector that returns the number of devices the last consistency check
 * found out of sync (mismatched, incomplete or erroring); 0 with no check.
 */
export const getRtlsGeometryDriftCount: AppSelector<number> = createSelector(
  getRtlsGeometryCheck,
  (check) =>
    check
      ? Object.values(check.devices).filter(
          (entry) => entry.status !== 'consistent'
        ).length
      : 0
);

/** Selector: tags whose geometry was written but not rebooted yet. */
export const getRtlsGeometryPendingReboot: AppSelector<
  Record<string, true>
> = (state) => state.rtls.geometry.pendingReboot;
