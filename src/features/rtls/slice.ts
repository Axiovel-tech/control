/**
 * @file Slice of the state object that stores the last known states of the
 * RTLS devices reported by the server, together with their live statistics and
 * the in-flight OTA jobs.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import {
  clearOrderedCollection,
  type Collection,
  EMPTY_COLLECTION,
} from '~/utils/collections';

import {
  type RtlsDevice,
  type RtlsDeviceStats,
  type RtlsOtaJob,
  type RtlsParam,
} from './types';
import { updateStateOfRtlsDevice } from './utils';

/** Cached read-only parameter list for a single device. */
export type RtlsDeviceParamsState = {
  /** Fetch status of the parameter list. */
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Parameters in display order, populated once `status === 'ready'`. */
  params: RtlsParam[];
  /** Error message when `status === 'error'`. */
  error?: string;
  /** Timestamp of the last successful fetch. */
  lastFetchedAt?: number;
};

export type RtlsSliceState = {
  /** Registry of known RTLS devices keyed by system id (numeric string). */
  devices: Collection<RtlsDevice>;

  /**
   * IDs of the devices currently selected in the RTLS device list. RTLS
   * devices keep a local selection rather than joining the shared global map
   * selection model.
   */
  selectedIds: string[];

  /** Live statistics keyed by system id; replaced wholesale on each update. */
  stats: {
    byId: Record<string, RtlsDeviceStats>;
    lastUpdatedAt?: number;
  };

  /** Last known OTA job per device, keyed by system id. */
  otaJobs: Record<string, RtlsOtaJob>;

  /** Cached read-only parameter lists keyed by device id. */
  paramsByDevice: Record<string, RtlsDeviceParamsState>;

  /** State of the per-device parameter viewer/editor dialog. */
  paramDialog: {
    open: boolean;
    deviceId?: string;
  };

  /** State of the per-device OTA dialog. */
  otaDialog: {
    open: boolean;
    deviceId?: string;
  };
};

const initialState: RtlsSliceState = {
  devices: EMPTY_COLLECTION,
  selectedIds: [],
  stats: {
    byId: {},
    lastUpdatedAt: undefined,
  },
  otaJobs: {},
  paramsByDevice: {},
  paramDialog: {
    open: false,
    deviceId: undefined,
  },
  otaDialog: {
    open: false,
    deviceId: undefined,
  },
};

const { actions, reducer } = createSlice({
  name: 'rtls',
  initialState,
  reducers: {
    /** Clears the entire RTLS device registry, stats and OTA jobs. */
    clearRtlsDevices(state) {
      clearOrderedCollection<RtlsDevice>(state.devices);
      state.selectedIds = [];
      state.stats = { byId: {}, lastUpdatedAt: undefined };
      state.otaJobs = {};
      state.paramsByDevice = {};
    },

    /** Marks the parameter list of a device as being loaded. */
    rtlsParamsFetchStarted(state, { payload: id }: PayloadAction<string>) {
      const existing = state.paramsByDevice[id];
      state.paramsByDevice[id] = {
        status: 'loading',
        params: existing?.params ?? [],
        error: undefined,
        lastFetchedAt: existing?.lastFetchedAt,
      };
    },

    /** Stores a freshly fetched parameter list for a device. */
    rtlsParamsFetchSucceeded(
      state,
      {
        payload: { id, params },
      }: PayloadAction<{ id: string; params: RtlsParam[] }>
    ) {
      state.paramsByDevice[id] = {
        status: 'ready',
        params,
        error: undefined,
        lastFetchedAt: Date.now(),
      };
    },

    /** Records a failure while fetching the parameter list of a device. */
    rtlsParamsFetchFailed(
      state,
      { payload: { id, error } }: PayloadAction<{ id: string; error: string }>
    ) {
      const existing = state.paramsByDevice[id];
      state.paramsByDevice[id] = {
        status: 'error',
        params: existing?.params ?? [],
        error,
        lastFetchedAt: existing?.lastFetchedAt,
      };
    },

    /**
     * Updates the cached value of a single parameter for a device (e.g. after a
     * successful X-RTLS-PARAM-SET), if that device's list has been loaded.
     */
    rtlsParamValueUpdated(
      state,
      {
        payload: { id, name, value },
      }: PayloadAction<{ id: string; name: string; value: RtlsParam['value'] }>
    ) {
      const entry = state.paramsByDevice[id];
      if (!entry) {
        return;
      }

      const param = entry.params.find((p) => p.name === name);
      if (param) {
        param.value = value;
      }
    },

    /** Sets the list of selected RTLS device IDs. */
    setSelectedRtlsDeviceIds(state, { payload }: PayloadAction<string[]>) {
      state.selectedIds = Array.isArray(payload) ? [...payload] : [];
    },

    /** Opens the parameter viewer/editor dialog for a device. */
    openRtlsParamDialog(state, { payload: deviceId }: PayloadAction<string>) {
      state.paramDialog = { open: true, deviceId };
    },

    /** Closes the parameter viewer/editor dialog. */
    closeRtlsParamDialog(state) {
      state.paramDialog = { open: false, deviceId: undefined };
    },

    /** Opens the OTA dialog for a device. */
    openRtlsOtaDialog(state, { payload: deviceId }: PayloadAction<string>) {
      state.otaDialog = { open: true, deviceId };
    },

    /** Closes the OTA dialog. */
    closeRtlsOtaDialog(state) {
      state.otaDialog = { open: false, deviceId: undefined };
    },

    /**
     * Updates the state of a single RTLS device, creating it if it does not
     * exist yet.
     */
    setRtlsDeviceState(
      state,
      { payload: { id, ...rest } }: PayloadAction<RtlsDevice>
    ) {
      updateStateOfRtlsDevice(state.devices, id, rest);
    },

    /**
     * Replaces the full set of RTLS devices with the supplied mapping. Devices
     * that are absent from the mapping are removed, mirroring the wholesale
     * semantics of an X-RTLS-INF status snapshot.
     */
    setRtlsDevicesFromStatus(
      state,
      { payload }: PayloadAction<Record<string, Omit<RtlsDevice, 'id'>>>
    ) {
      const ids = Object.keys(payload);

      // Drop devices that are no longer present in the snapshot.
      for (const existingId of [...state.devices.order]) {
        if (!ids.includes(existingId)) {
          delete state.devices.byId[existingId];
          delete state.otaJobs[existingId];
        }
      }
      state.devices.order = state.devices.order.filter((id) =>
        ids.includes(id)
      );

      // Keep the selection consistent with the surviving device set.
      state.selectedIds = state.selectedIds.filter((id) => ids.includes(id));

      for (const [id, device] of Object.entries(payload)) {
        updateStateOfRtlsDevice(state.devices, id, device);
      }
    },

    /**
     * Replaces the live statistics for all devices wholesale (mirroring the
     * RTK statistics update semantics).
     */
    updateRtlsStats(
      state,
      {
        payload,
      }: PayloadAction<{
        byId: Record<string, RtlsDeviceStats>;
        lastUpdatedAt?: number;
      }>
    ) {
      state.stats.byId = payload.byId;
      state.stats.lastUpdatedAt = payload.lastUpdatedAt ?? Date.now();
    },

    /** Records the latest OTA job state for a single device. */
    setRtlsOtaJob(
      state,
      {
        payload: { id, job },
      }: PayloadAction<{ id: string; job: RtlsOtaJob }>
    ) {
      state.otaJobs[id] = job;
    },
  },
});

export const {
  clearRtlsDevices,
  closeRtlsOtaDialog,
  closeRtlsParamDialog,
  openRtlsOtaDialog,
  openRtlsParamDialog,
  rtlsParamsFetchFailed,
  rtlsParamsFetchStarted,
  rtlsParamsFetchSucceeded,
  rtlsParamValueUpdated,
  setRtlsDeviceState,
  setRtlsDevicesFromStatus,
  setRtlsOtaJob,
  setSelectedRtlsDeviceIds,
  updateRtlsStats,
} = actions;

export default reducer;
