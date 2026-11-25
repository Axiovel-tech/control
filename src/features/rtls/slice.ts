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
  type RtlsAnchorLock,
  type RtlsDevice,
  type RtlsDeviceStats,
  type RtlsCellSurvey,
  type RtlsVerifyResult,
  type RtlsOtaJob,
  type RtlsParam,
  type RtlsPosEstimate,
} from './types';
import { classifyRole, isAnchorRole } from './stats-utils';
import { updateStateOfRtlsDevice } from './utils';
import { type RtlsCellSettings } from './cell-settings';

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
    /** When a tag's stats last arrived (the Tags panel's "updated" clock). */
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

  /** Site-level anchor list from X-RTLS-INF: every known anchor device. */
  anchors: RtlsAnchor[];

  /**
   * The survey the cell is on, from X-RTLS-INF only; `undefined` while the
   * server has reported none (a server whose tags still fit the cell
   * themselves).
   */
  cellSurvey?: RtlsCellSurvey;

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

  /**
   * When each anchor last accepted a sleep or wake (`Date.now()`), keyed by
   * system id, until it reports a new powerState: an anchor that drops off
   * the network meanwhile is rebooting into the new state, not lost
   * (`isAnchorSwitching`).
   */
  anchorPowerRequests: Record<string, number>;

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

  /**
   * The server's anchor lock, from X-RTLS-INF only; `undefined` while the
   * server has not reported one (a server without the lock feature).
   */
  anchorLock?: RtlsAnchorLock;

  /** Whether the lock dialog is open. */
  lockDialogOpen: boolean;

  /** The server's `cellSettings`; `undefined` while it has reported none. */
  cellSettings?: RtlsCellSettings;

  /** Whether the cell-settings dialog is open. */
  cellDialogOpen: boolean;

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
  cellSurvey: undefined,
  otaJobs: {},
  sleepPending: {},
  recentSleepResults: {},
  anchorPowerRequests: {},
  paramsByDevice: {},
  paramDialog: {
    open: false,
    deviceId: undefined,
  },
  otaDialog: {
    open: false,
    deviceId: undefined,
  },
  anchorLock: undefined,
  lockDialogOpen: false,
  cellSettings: undefined,
  cellDialogOpen: false,
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
      // the next server reports its own lock; a dialog about this one closes
      state.anchorLock = undefined;
      state.lockDialogOpen = false;
      state.cellSettings = undefined;
      state.cellDialogOpen = false;
      clearOrderedCollection<RtlsDevice>(state.devices);
      state.stats = { byId: {}, lastUpdatedAt: undefined };
      state.positions = { byId: {} };
      state.anchors = [];
      state.cellSurvey = undefined;
      state.otaJobs = {};
      state.sleepPending = {};
      state.recentSleepResults = {};
      state.anchorPowerRequests = {};
      state.paramsByDevice = {};
      state.verify.running = false;
      state.verify.lastResult = undefined;
    },

    /** An X-RTLS-VERIFY run left the client. The previous result is
     * dropped immediately: a failed re-run must never leave an obsolete
     * pass verdict on screen. */
    rtlsVerifyStarted(state) {
      state.verify.running = true;
      state.verify.lastResult = undefined;
    },

    /** An X-RTLS-VERIFY run failed or was NAKed. */
    rtlsVerifyFailed(state) {
      state.verify.running = false;
    },

    /** An X-RTLS-VERIFY run completed. */
    rtlsVerifySucceeded(state, { payload }: PayloadAction<RtlsVerifyResult>) {
      state.verify.running = false;
      state.verify.lastResult = payload;
    },

    /** Replaces the anchor lock with the server's latest report. */
    setRtlsAnchorLock(state, { payload }: PayloadAction<RtlsAnchorLock>) {
      state.anchorLock = payload;
    },

    openRtlsLockDialog(state) {
      state.lockDialogOpen = true;
    },

    closeRtlsLockDialog(state) {
      state.lockDialogOpen = false;
    },

    setRtlsCellSettings(state, { payload }: PayloadAction<RtlsCellSettings>) {
      state.cellSettings = payload;
    },

    openRtlsCellDialog(state) {
      state.cellDialogOpen = true;
    },

    closeRtlsCellDialog(state) {
      state.cellDialogOpen = false;
    },

    /** Opens the fleet-verification dialog. */
    openRtlsVerifyDialog(state) {
      state.verify.dialogOpen = true;
    },

    /** Closes the fleet-verification dialog. */
    closeRtlsVerifyDialog(state) {
      state.verify.dialogOpen = false;
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

    /** Records that the given anchors accepted a sleep or wake now. */
    rtlsAnchorPowerRequested(state, { payload: ids }: PayloadAction<string[]>) {
      const now = Date.now();
      for (const id of ids) {
        state.anchorPowerRequests[id] = now;
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
      // An anchor that reports a new powerState after its accepted sleep or
      // wake is no longer switching; `stopping` only announces the reboot.
      for (const [id, stats] of Object.entries(payload.byId)) {
        const before = state.stats.byId[id]?.powerState;
        const after = stats.powerState;
        if (after !== undefined && after !== before && after !== 'stopping') {
          delete state.anchorPowerRequests[id];
        }
      }
      Object.assign(state.stats.byId, payload.byId);
      // The Tags panel's "updated" clock: only tag stats move it (a device
      // whose role is not known yet counts as a tag, like on that panel)
      const tagUpdated = Object.keys(payload.byId).some(
        (id) => !isAnchorRole(classifyRole(state.devices.byId[id]?.role))
      );
      if (tagUpdated) {
        state.stats.lastUpdatedAt = payload.lastUpdatedAt ?? Date.now();
      }
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

    /** Replaces the cell's survey with the server's latest report. */
    setRtlsCellSurvey(state, { payload }: PayloadAction<RtlsCellSurvey>) {
      state.cellSurvey = payload;
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
  closeRtlsCellDialog,
  closeRtlsLockDialog,
  closeRtlsOtaDialog,
  closeRtlsParamDialog,
  closeRtlsVerifyDialog,
  openRtlsCellDialog,
  openRtlsLockDialog,
  openRtlsOtaDialog,
  openRtlsParamDialog,
  openRtlsVerifyDialog,
  rtlsVerifyFailed,
  rtlsVerifyStarted,
  rtlsVerifySucceeded,
  rtlsParamsFetchFailed,
  rtlsParamsFetchStarted,
  rtlsParamsFetchSucceeded,
  rtlsParamValueUpdated,
  rtlsAnchorPowerRequested,
  rtlsSleepTransactionEnded,
  rtlsSleepTransactionStarted,
  setRtlsAnchorLock,
  setRtlsAnchors,
  setRtlsCellSettings,
  setRtlsCellSurvey,
  setRtlsDevicesFromStatus,
  setRtlsOtaJob,
  updateRtlsPositions,
  updateRtlsStats,
} = actions;

export default reducer;
