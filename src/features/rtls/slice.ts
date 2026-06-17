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
} from './types';
import { updateStateOfRtlsDevice } from './utils';

export type RtlsSliceState = {
  /** Registry of known RTLS devices keyed by system id (numeric string). */
  devices: Collection<RtlsDevice>;

  /** Live statistics keyed by system id; replaced wholesale on each update. */
  stats: {
    byId: Record<string, RtlsDeviceStats>;
    lastUpdatedAt?: number;
  };

  /** Last known OTA job per device, keyed by system id. */
  otaJobs: Record<string, RtlsOtaJob>;
};

const initialState: RtlsSliceState = {
  devices: EMPTY_COLLECTION,
  stats: {
    byId: {},
    lastUpdatedAt: undefined,
  },
  otaJobs: {},
};

const { actions, reducer } = createSlice({
  name: 'rtls',
  initialState,
  reducers: {
    /** Clears the entire RTLS device registry, stats and OTA jobs. */
    clearRtlsDevices(state) {
      clearOrderedCollection<RtlsDevice>(state.devices);
      state.stats = { byId: {}, lastUpdatedAt: undefined };
      state.otaJobs = {};
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
  setRtlsDeviceState,
  setRtlsDevicesFromStatus,
  setRtlsOtaJob,
  updateRtlsStats,
} = actions;

export default reducer;
