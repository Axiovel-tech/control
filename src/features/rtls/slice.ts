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
  type RtlsAnchor,
  type RtlsDevice,
  type RtlsDeviceStats,
  type RtlsGeometryCheck,
  type RtlsGeometrySync,
  type RtlsVerifyResult,
  type RtlsOtaJob,
  type RtlsParam,
  type RtlsPosEstimate,
} from './types';
import { updateStateOfRtlsDevice } from './utils';

/**
 * How long an applied sleep/wake transaction result guards the device's
 * `sleeping` flag against contradicting X-RTLS-INF snapshot values, in
 * milliseconds. Matches the worst-case transaction round trip.
 */
export const SLEEP_RESULT_GUARD_MS = 30 * 1000;

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
   * Live statistics keyed by system id. The server broadcasts statistics one
   * device per message, so updates are merged per id; stale devices are pruned
   * from the X-RTLS-INF device snapshot rather than from the stats path.
   */
  stats: {
    byId: Record<string, RtlsDeviceStats>;
    lastUpdatedAt?: number;
  };

  /**
   * Live position-estimate debug stream (X-RTLS-POS) keyed by system id.
   * Present only while a tag's `POS_DBG_HZ` parameter is nonzero; merged per
   * id like the stats and pruned with the device from the X-RTLS-INF snapshot.
   */
  positions: {
    byId: Record<string, RtlsPosEstimate>;
  };

  /** Site-level anchor list from X-RTLS-INF (configured cell geometry). */
  anchors: RtlsAnchor[];

  /** Last known OTA job per device, keyed by system id. */
  otaJobs: Record<string, RtlsOtaJob>;

  /**
   * Devices with a sleep/wake transaction currently in flight (X-RTLS-SLEEP
   * round trip; can take up to ~30 s), keyed by system id. Used to render a
   * busy state on the device rows. Cleared deterministically when the
   * transaction settles, so it is not pruned with the X-RTLS-INF snapshot (a
   * waking device may drop out of the snapshot while it reboots).
   */
  sleepPending: Record<string, boolean>;

  /**
   * Authoritative per-device `sleeping` values recently applied from accepted
   * X-RTLS-SLEEP transaction results, with the time they were applied. While
   * an entry is fresh (`SLEEP_RESULT_GUARD_MS`), an X-RTLS-INF snapshot value
   * that contradicts it must not overwrite it: pushes/polls already in flight
   * — and older servers without the post-transaction sleep-state pin — may
   * still carry the stale pre-transition latch. A confirming snapshot value
   * (or expiry) clears the entry. Deliberately not pruned when a device drops
   * out of a snapshot: a waking device disappears while it reboots, and the
   * guard must still apply when it comes back.
   */
  recentSleepResults: Record<string, { sleeping: boolean; appliedAt: number }>;

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

  /** Fleet geometry-consistency state (X-RTLS-GEO check/sync). */
  geometry: {
    checking: boolean;
    syncing: boolean;
    lastCheck?: RtlsGeometryCheck;
    lastSync?: RtlsGeometrySync;
    /** Tags whose geometry was written but not (yet) rebooted: their
     * solver still runs on the OLD geometry until a reboot. Cleared when
     * a device's uptime is seen going backwards. */
    pendingReboot: Record<string, true>;
    /** Whether the sync confirmation dialog is open. */
    syncDialogOpen: boolean;
  };

  /** Fleet pre-flight verification state (X-RTLS-VERIFY). */
  verify: {
    running: boolean;
    lastResult?: RtlsVerifyResult;
    /** Whether the verification dialog is open. */
    dialogOpen: boolean;
  };
};

const initialState: RtlsSliceState = {
  devices: EMPTY_COLLECTION,
  stats: {
    byId: {},
    lastUpdatedAt: undefined,
  },
  positions: {
    byId: {},
  },
  anchors: [],
  otaJobs: {},
  sleepPending: {},
  recentSleepResults: {},
  paramsByDevice: {},
  paramDialog: {
    open: false,
    deviceId: undefined,
  },
  otaDialog: {
    open: false,
    deviceId: undefined,
  },
  geometry: {
    checking: false,
    syncing: false,
    lastCheck: undefined,
    lastSync: undefined,
    pendingReboot: {},
    syncDialogOpen: false,
  },
  verify: {
    running: false,
    lastResult: undefined,
    dialogOpen: false,
  },
};

const { actions, reducer } = createSlice({
  name: 'rtls',
  initialState,
  reducers: {
    /** Clears the entire RTLS device registry, stats and OTA jobs. */
    clearRtlsDevices(state) {
      clearOrderedCollection<RtlsDevice>(state.devices);
      state.stats = { byId: {}, lastUpdatedAt: undefined };
      state.positions = { byId: {} };
      state.anchors = [];
      state.otaJobs = {};
      state.sleepPending = {};
      state.recentSleepResults = {};
      state.paramsByDevice = {};
      // a consistency snapshot describes the fleet we just dropped
      state.geometry.checking = false;
      state.geometry.syncing = false;
      state.geometry.lastCheck = undefined;
      state.geometry.lastSync = undefined;
      state.geometry.pendingReboot = {};
      state.geometry.syncDialogOpen = false;
      state.verify.running = false;
      state.verify.lastResult = undefined;
    },

    /** An X-RTLS-VERIFY run left the client. */
    rtlsVerifyStarted(state) {
      state.verify.running = true;
    },

    /** An X-RTLS-VERIFY run failed or was NAKed. */
    rtlsVerifyFailed(state) {
      state.verify.running = false;
    },

    /** An X-RTLS-VERIFY run completed. */
    rtlsVerifySucceeded(
      state,
      { payload }: PayloadAction<RtlsVerifyResult>
    ) {
      state.verify.running = false;
      state.verify.lastResult = payload;
    },

    /** Opens the fleet-verification dialog. */
    openRtlsVerifyDialog(state) {
      state.verify.dialogOpen = true;
    },

    /** Closes the fleet-verification dialog. */
    closeRtlsVerifyDialog(state) {
      state.verify.dialogOpen = false;
    },

    /** An X-RTLS-GEO check left the client. */
    rtlsGeometryCheckStarted(state) {
      state.geometry.checking = true;
    },

    /** An X-RTLS-GEO check failed or was NAKed. */
    rtlsGeometryCheckFailed(state) {
      state.geometry.checking = false;
    },

    /** An X-RTLS-GEO check completed; stores the fleet snapshot. */
    rtlsGeometryCheckSucceeded(
      state,
      { payload }: PayloadAction<RtlsGeometryCheck>
    ) {
      state.geometry.checking = false;
      state.geometry.lastCheck = payload;
    },

    /** An X-RTLS-GEO sync left the client (closes the confirm dialog). */
    rtlsGeometrySyncStarted(state) {
      state.geometry.syncing = true;
      state.geometry.syncDialogOpen = false;
    },

    /** An X-RTLS-GEO sync failed or was NAKed. */
    rtlsGeometrySyncFailed(state) {
      state.geometry.syncing = false;
    },

    /** An X-RTLS-GEO sync completed; stores the per-device outcomes and
     * marks written-but-not-rebooted tags as pending a reboot. */
    rtlsGeometrySyncSucceeded(
      state,
      { payload }: PayloadAction<RtlsGeometrySync>
    ) {
      state.geometry.syncing = false;
      state.geometry.lastSync = payload;
      for (const [id, entry] of Object.entries(payload.devices)) {
        if (
          entry.status === 'synced' &&
          (entry.written?.length ?? 0) > 0 &&
          entry.rebooted !== true
        ) {
          state.geometry.pendingReboot[id] = true;
        }
      }
    },

    /** Opens the geometry-sync confirmation dialog. */
    openRtlsGeometrySyncDialog(state) {
      state.geometry.syncDialogOpen = true;
    },

    /** Closes the geometry-sync confirmation dialog. */
    closeRtlsGeometrySyncDialog(state) {
      state.geometry.syncDialogOpen = false;
    },

    /**
     * Applies the authoritative per-device `sleeping` values carried by the
     * accepted results of an X-RTLS-SLEEP transaction. Unlike an X-RTLS-INF
     * snapshot this touches only the devices listed; ids that are not in the
     * registry are ignored rather than created.
     */
    applyRtlsSleepResults(
      state,
      { payload }: PayloadAction<Record<string, boolean>>
    ) {
      const now = Date.now();
      for (const [id, sleeping] of Object.entries(payload)) {
        const device = state.devices.byId[id];
        if (device) {
          device.sleeping = sleeping;
        }

        // Recorded even when the device is not in the registry right now: a
        // woken device may have aged out of the snapshot and must still be
        // guarded against the stale latch when it reappears.
        state.recentSleepResults[id] = { sleeping, appliedAt: now };
      }
    },

    /** Marks a sleep/wake transaction as in flight for the given devices. */
    rtlsSleepTransactionStarted(
      state,
      { payload: ids }: PayloadAction<string[]>
    ) {
      for (const id of ids) {
        state.sleepPending[id] = true;
      }
    },

    /** Marks the sleep/wake transaction of the given devices as settled. */
    rtlsSleepTransactionEnded(
      state,
      { payload: ids }: PayloadAction<string[]>
    ) {
      for (const id of ids) {
        delete state.sleepPending[id];
      }
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
     * Replaces the full set of RTLS devices with the supplied mapping. Devices
     * that are absent from the mapping are removed, mirroring the wholesale
     * semantics of an X-RTLS-INF status snapshot.
     */
    setRtlsDevicesFromStatus(
      state,
      { payload }: PayloadAction<Record<string, Omit<RtlsDevice, 'id'>>>
    ) {
      const ids = Object.keys(payload);

      // A consistency snapshot certifies a specific fleet: when the device
      // ID SET changes (a tag joined or left), the certification is void —
      // keeping a green "consistent" verdict over a fleet it never saw
      // would be a false pre-flight pass.
      if (
        state.geometry.lastCheck &&
        (ids.length !== state.devices.order.length ||
          ids.some((id) => !state.devices.byId[id]))
      ) {
        state.geometry.lastCheck = undefined;
      }

      // A rewritten-but-not-rebooted tag still flies on its OLD geometry;
      // the pending-reboot mark clears when the device is seen to have
      // rebooted (its uptime went backwards).
      for (const id of ids) {
        const uptime = payload[id]?.uptimeMs;
        const previous = state.devices.byId[id]?.uptimeMs;
        if (
          uptime !== undefined &&
          previous !== undefined &&
          uptime < previous
        ) {
          delete state.geometry.pendingReboot[id];
        }
      }

      // Drop devices that are no longer present in the snapshot, along with
      // their now-stale stats and OTA jobs. Device disappearance is the single
      // source of truth for pruning stats (the per-device stats broadcasts
      // never remove anything).
      for (const existingId of [...state.devices.order]) {
        if (!ids.includes(existingId)) {
          delete state.devices.byId[existingId];
          delete state.otaJobs[existingId];
          delete state.stats.byId[existingId];
          delete state.positions.byId[existingId];
        }
      }
      state.devices.order = state.devices.order.filter((id) =>
        ids.includes(id)
      );

      const now = Date.now();
      for (const [id, device] of Object.entries(payload)) {
        updateStateOfRtlsDevice(state.devices, id, device);

        // Recent-result guard: while a sleep/wake transaction result applied
        // for this device is fresh, a snapshot value that contradicts it (or
        // reports unknown) must not overwrite it — the snapshot may still
        // carry the stale pre-transition latch. A confirming value retires
        // the guard, as does expiry.
        const recent = state.recentSleepResults[id];
        if (recent) {
          if (now - recent.appliedAt > SLEEP_RESULT_GUARD_MS) {
            delete state.recentSleepResults[id];
          } else if (device.sleeping === recent.sleeping) {
            delete state.recentSleepResults[id];
          } else {
            state.devices.byId[id].sleeping = recent.sleeping;
          }
        }
      }
    },

    /**
     * Merges live statistics into the per-device store. The server broadcasts
     * statistics one device per message, so each update must be merged into the
     * existing map rather than replacing it wholesale; otherwise every
     * broadcast would clobber every other device's stats. Stale devices are
     * pruned from the X-RTLS-INF snapshot in `setRtlsDevicesFromStatus`, not
     * here.
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
      Object.assign(state.stats.byId, payload.byId);
      state.stats.lastUpdatedAt = payload.lastUpdatedAt ?? Date.now();
    },

    /**
     * Merges live position estimates into the per-device store. Like the
     * stats, the server broadcasts one device per X-RTLS-POS notification, so
     * updates merge per id; stale devices are pruned from the X-RTLS-INF
     * snapshot in `setRtlsDevicesFromStatus`.
     */
    updateRtlsPositions(
      state,
      {
        payload,
      }: PayloadAction<{
        byId: Record<string, RtlsPosEstimate>;
      }>
    ) {
      Object.assign(state.positions.byId, payload.byId);
    },

    /** Replaces the site-level anchor list (from an X-RTLS-INF snapshot). */
    setRtlsAnchors(state, { payload }: PayloadAction<RtlsAnchor[]>) {
      state.anchors = payload;
    },

    /** Records the latest OTA job state for a single device. */
    setRtlsOtaJob(
      state,
      { payload: { id, job } }: PayloadAction<{ id: string; job: RtlsOtaJob }>
    ) {
      state.otaJobs[id] = job;
    },
  },
});

export const {
  applyRtlsSleepResults,
  clearRtlsDevices,
  closeRtlsGeometrySyncDialog,
  closeRtlsOtaDialog,
  closeRtlsParamDialog,
  closeRtlsVerifyDialog,
  openRtlsGeometrySyncDialog,
  openRtlsOtaDialog,
  openRtlsParamDialog,
  openRtlsVerifyDialog,
  rtlsVerifyFailed,
  rtlsVerifyStarted,
  rtlsVerifySucceeded,
  rtlsGeometryCheckFailed,
  rtlsGeometryCheckStarted,
  rtlsGeometryCheckSucceeded,
  rtlsGeometrySyncFailed,
  rtlsGeometrySyncStarted,
  rtlsGeometrySyncSucceeded,
  rtlsParamsFetchFailed,
  rtlsParamsFetchStarted,
  rtlsParamsFetchSucceeded,
  rtlsParamValueUpdated,
  rtlsSleepTransactionEnded,
  rtlsSleepTransactionStarted,
  setRtlsAnchors,
  setRtlsDevicesFromStatus,
  setRtlsOtaJob,
  updateRtlsPositions,
  updateRtlsStats,
} = actions;

export default reducer;
