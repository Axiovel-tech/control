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
  currentId?: string;
  dialogOpen: boolean;
  loadingTargets: boolean;
  managedSequence: boolean;
  order: string[];
  running: boolean;
  runs: Record<string, FirmwareUpdateRun>;
  selectedIds: string[];
  targetError?: string;
  targetGeneration: number;
  targets: FirmwareUpdateTarget[];
};

const initialState: FirmwareUpdateSliceState = {
  confirmed: false,
  dialogOpen: false,
  loadingTargets: false,
  managedSequence: false,
  order: [],
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

const slice = createSlice({
  name: 'firmware-update',
  initialState,
  reducers: {
    closeFirmwareUpdateDialog(state) {
      state.dialogOpen = false;
    },

    openFirmwareUpdateDialog(state) {
      state.dialogOpen = true;
    },

    firmwareTargetsLoading(state, { payload }: PayloadAction<number>) {
      state.loadingTargets = true;
      state.confirmed = false;
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
      state.order = [];
      state.runs = {};
    },

    firmwareArtifactRejected(state) {
      state.artifact = undefined;
      state.confirmed = false;
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
    },

    setFirmwareUpdateConfirmed(state, { payload }: PayloadAction<boolean>) {
      state.confirmed = payload && !state.loadingTargets;
    },

    firmwareSequenceStarted(state, { payload }: PayloadAction<string[]>) {
      state.currentId = payload[0];
      state.managedSequence = true;
      state.order = [...payload];
      state.running = true;
      state.runs = Object.fromEntries(payload.map((id) => [id, queuedRun(id)]));
    },

    firmwareCurrentTargetChanged(state, { payload }: PayloadAction<string>) {
      state.currentId = payload;
    },

    firmwareJobUpdated(state, { payload }: PayloadAction<FirmwareUpdateJob>) {
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
        Object.assign(state, initialState, { dialogOpen: state.dialogOpen });
      }
    },
  },
});

export const {
  closeFirmwareUpdateDialog,
  firmwareArtifactPrepared,
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
} = slice.actions;

export default slice.reducer;
