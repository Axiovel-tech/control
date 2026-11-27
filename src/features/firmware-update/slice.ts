import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import {
  type FirmwareArtifactMetadata,
  type FirmwareUpdateError,
  type FirmwareUpdateJob,
  type FirmwareUpdateRun,
  type FirmwareUpdateTarget,
} from './types';

export type FirmwareUpdateSliceState = {
  artifact?: FirmwareArtifactMetadata;
  confirmed: boolean;
  lowBatteryAccepted: boolean;
  currentId?: string;
  dialogOpen: boolean;
  loadingTargets: boolean;
  managedSequence: boolean;
  order: string[];
  readingArtifact: boolean;
  running: boolean;
  runs: Record<string, FirmwareUpdateRun>;
  selectedIds: string[];
  targetError?: string;
  targetGeneration: number;
  targets: FirmwareUpdateTarget[];
};

const initialState: FirmwareUpdateSliceState = {
  confirmed: false,
  lowBatteryAccepted: false,
  dialogOpen: false,
  loadingTargets: false,
  managedSequence: false,
  order: [],
  readingArtifact: false,
  running: false,
  runs: {},
  selectedIds: [],
  targetGeneration: 0,
  targets: [],
};

const queuedRun = (id: string): FirmwareUpdateRun => ({
  id,
  cancellable: true,
  committed: false,
  phase: 'queued',
  status: 'running',
});

const terminalRun = (
  run: FirmwareUpdateRun,
  status: 'cancelled' | 'indeterminate',
  error?: FirmwareUpdateError
): FirmwareUpdateRun => ({
  ...run,
  cancellable: false,
  error,
  status,
});

// A transport loss also marks a run indeterminate, but without the server's
// 'complete' phase; a later status reply may still replace that guess.
const isFinalServerResult = (run: FirmwareUpdateRun | undefined): boolean =>
  run?.phase === 'complete' && run.status !== 'running';

const isStaleRunningUpdate = (
  run: FirmwareUpdateRun | undefined,
  update: FirmwareUpdateJob
): boolean =>
  update.status === 'running' &&
  run?.operationId === update.operationId &&
  isFinalServerResult(run);

const slice = createSlice({
  name: 'firmware-update',
  initialState,
  reducers: {
    closeFirmwareUpdateDialog(state) {
      state.dialogOpen = false;
    },

    /**
     * Opens the dialog. The optional payload is the UAVs to tick as targets
     * (the selection of the UAVs panel); it is ignored while a sequence runs
     * or its results are still shown. The target list that loads next drops
     * the ones the server does not offer as compatible.
     */
    openFirmwareUpdateDialog(
      state,
      { payload }: PayloadAction<string[] | undefined>
    ) {
      state.dialogOpen = true;
      if (payload?.length && !state.running && state.order.length === 0) {
        state.selectedIds = Array.from(new Set(payload));
        state.confirmed = false;
        state.lowBatteryAccepted = false;
      }
    },

    firmwareTargetsLoading(state, { payload }: PayloadAction<number>) {
      state.loadingTargets = true;
      state.confirmed = false;
      state.lowBatteryAccepted = false;
      state.targetGeneration = payload;
      state.targetError = undefined;
    },

    firmwareTargetsLoaded(
      state,
      {
        payload: { generation, targets },
      }: PayloadAction<{
        generation: number;
        targets: FirmwareUpdateTarget[];
      }>
    ) {
      if (generation !== state.targetGeneration) {
        return;
      }

      state.loadingTargets = false;
      state.confirmed = false;
      state.lowBatteryAccepted = false;
      state.targets = targets;
      const compatible = new Set(
        targets.filter((target) => target.compatible).map((target) => target.id)
      );
      state.selectedIds = state.selectedIds.filter((id) => compatible.has(id));
    },

    firmwareTargetsFailed(
      state,
      {
        payload: { error, generation },
      }: PayloadAction<{ error: string; generation: number }>
    ) {
      if (generation !== state.targetGeneration) {
        return;
      }

      state.loadingTargets = false;
      state.confirmed = false;
      state.lowBatteryAccepted = false;
      state.targetError = error;
      state.targets = [];
      state.selectedIds = [];
    },

    firmwareArtifactPrepared(
      state,
      { payload }: PayloadAction<FirmwareArtifactMetadata>
    ) {
      state.artifact = payload;
      state.confirmed = false;
      state.lowBatteryAccepted = false;
      state.order = [];
      state.readingArtifact = false;
      state.runs = {};
    },

    firmwareArtifactReadingStarted(state) {
      state.artifact = undefined;
      state.confirmed = false;
      state.lowBatteryAccepted = false;
      state.readingArtifact = true;
    },

    firmwareArtifactRejected(state) {
      state.artifact = undefined;
      state.confirmed = false;
      state.lowBatteryAccepted = false;
      state.readingArtifact = false;
    },

    setFirmwareTargetSelected(
      state,
      {
        payload: { id, selected },
      }: PayloadAction<{ id: string; selected: boolean }>
    ) {
      const target = state.targets.find((candidate) => candidate.id === id);
      if (!target?.compatible) {
        return;
      }

      state.selectedIds = selected
        ? Array.from(new Set([...state.selectedIds, id]))
        : state.selectedIds.filter((candidate) => candidate !== id);
      state.confirmed = false;
      state.lowBatteryAccepted = false;
    },

    setFirmwareUpdateConfirmed(state, { payload }: PayloadAction<boolean>) {
      state.confirmed =
        payload && !state.loadingTargets && !state.readingArtifact;
    },

    setFirmwareUpdateLowBatteryAccepted(
      state,
      { payload }: PayloadAction<boolean>
    ) {
      state.lowBatteryAccepted =
        payload && !state.loadingTargets && !state.readingArtifact;
    },

    firmwareSequenceStarted(state, { payload }: PayloadAction<string[]>) {
      state.currentId = payload[0];
      state.managedSequence = true;
      state.order = [...payload];
      state.running = true;
      state.runs = {};
      for (const id of payload) {
        state.runs[id] = queuedRun(id);
      }
    },

    firmwareCurrentTargetChanged(state, { payload }: PayloadAction<string>) {
      state.currentId = payload;
    },

    firmwareJobUpdated(state, { payload }: PayloadAction<FirmwareUpdateJob>) {
      if (isStaleRunningUpdate(state.runs[payload.id], payload)) {
        return;
      }

      if (!state.runs[payload.id]) {
        state.order.push(payload.id);
      }

      state.runs[payload.id] = payload;
      if (payload.status === 'running') {
        state.currentId = payload.id;
        state.running = true;
      } else if (!state.managedSequence && state.currentId === payload.id) {
        state.currentId = undefined;
        state.running = false;
      }
    },

    firmwareRunIndeterminate(
      state,
      {
        payload: { id, error },
      }: PayloadAction<{ id: string; error: FirmwareUpdateError }>
    ) {
      const run = state.runs[id] ?? queuedRun(id);
      state.runs[id] = terminalRun(run, 'indeterminate', error);
    },

    firmwareSequenceFinished(state) {
      for (const id of state.order) {
        const run = state.runs[id];
        if (run.status === 'running' && run.phase === 'queued') {
          state.runs[id] = terminalRun(run, 'cancelled');
        }
      }
      state.currentId = undefined;
      state.managedSequence = false;
      state.running = false;
    },

    resetFirmwareUpdate(state) {
      if (!state.running) {
        return { ...initialState, dialogOpen: state.dialogOpen };
      }
    },
  },
});

export const {
  closeFirmwareUpdateDialog,
  firmwareArtifactPrepared,
  firmwareArtifactReadingStarted,
  firmwareArtifactRejected,
  firmwareCurrentTargetChanged,
  firmwareJobUpdated,
  firmwareRunIndeterminate,
  firmwareSequenceFinished,
  firmwareSequenceStarted,
  firmwareTargetsFailed,
  firmwareTargetsLoaded,
  firmwareTargetsLoading,
  openFirmwareUpdateDialog,
  resetFirmwareUpdate,
  setFirmwareTargetSelected,
  setFirmwareUpdateConfirmed,
  setFirmwareUpdateLowBatteryAccepted,
} = slice.actions;

export default slice.reducer;
