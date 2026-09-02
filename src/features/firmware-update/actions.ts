import { errorToString } from '~/error-handling';
import messageHub from '~/message-hub';
import type { AppThunk } from '~/store/reducers';

import {
  cancelFirmwareUpdate,
  queryFirmwareUpdateStatus,
  queryFirmwareUpdateTargets,
  startFirmwareUpdate,
} from './messages';
import {
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
} from './slice';
import type {
  FirmwareUpdateError,
  FirmwareUpdateJob,
  PreparedFirmwareArtifact,
} from './types';

const STATUS_POLL_INTERVAL_MS = 1000;
let preparedArtifact: PreparedFirmwareArtifact | undefined;
let sequenceGeneration = 0;
let targetRefreshGeneration = 0;

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const transportError = (error: unknown): FirmwareUpdateError => ({
  code: 'transport',
  detail: errorToString(error),
});

const waitForTerminalJob = async (
  first: FirmwareUpdateJob,
  onUpdate: (job: FirmwareUpdateJob) => void,
  isCurrent: () => boolean
): Promise<FirmwareUpdateJob> => {
  let job = first;
  while (job.status === 'running' && isCurrent()) {
    await delay(STATUS_POLL_INTERVAL_MS);
    if (!isCurrent()) {
      break;
    }

    job = await queryFirmwareUpdateStatus(messageHub, job.id, job.operationId);
    onUpdate(job);
  }

  return job;
};

export const prepareFirmwareArtifact =
  (artifact: PreparedFirmwareArtifact): AppThunk =>
  (dispatch) => {
    preparedArtifact = artifact;
    dispatch(firmwareArtifactPrepared(artifact.metadata));
  };

export const beginFirmwareArtifactRead = (): AppThunk => (dispatch) => {
  preparedArtifact = undefined;
  dispatch(firmwareArtifactReadingStarted());
};

export const rejectFirmwareArtifact = (): AppThunk => (dispatch) => {
  preparedArtifact = undefined;
  dispatch(firmwareArtifactRejected());
};

export const refreshFirmwareTargets =
  (): AppThunk<Promise<void>> => async (dispatch) => {
    const generation = ++targetRefreshGeneration;
    dispatch(firmwareTargetsLoading(generation));
    try {
      dispatch(
        firmwareTargetsLoaded({
          generation,
          targets: await queryFirmwareUpdateTargets(messageHub),
        })
      );
    } catch (error) {
      dispatch(
        firmwareTargetsFailed({ error: errorToString(error), generation })
      );
    }
  };

export const showFirmwareUpdateDialog = (): AppThunk => (dispatch) => {
  dispatch(openFirmwareUpdateDialog());
  void dispatch(refreshFirmwareTargets());
};

export const hideFirmwareUpdateDialog = (): AppThunk => (dispatch) => {
  dispatch(closeFirmwareUpdateDialog());
};

export const startNewFirmwareUpdate = (): AppThunk => (dispatch) => {
  preparedArtifact = undefined;
  dispatch(resetFirmwareUpdate());
  void dispatch(refreshFirmwareTargets());
};

export const runFirmwareUpdateSequence =
  (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const {
      artifact,
      confirmed,
      loadingTargets,
      readingArtifact,
      running,
      selectedIds,
    } = getState().firmwareUpdate;
    const artifactForSequence = preparedArtifact
      ? {
          image: preparedArtifact.image,
          metadata: { ...preparedArtifact.metadata },
        }
      : undefined;
    if (
      !artifact ||
      !artifactForSequence ||
      artifactForSequence.metadata.sha256 !== artifact.sha256 ||
      !confirmed ||
      loadingTargets ||
      readingArtifact ||
      running ||
      selectedIds.length === 0
    ) {
      return;
    }

    const generation = ++sequenceGeneration;
    dispatch(firmwareSequenceStarted(selectedIds));

    for (const id of selectedIds) {
      if (generation !== sequenceGeneration) {
        break;
      }

      dispatch(firmwareCurrentTargetChanged(id));
      try {
        const first = await startFirmwareUpdate(
          messageHub,
          id,
          artifactForSequence
        );
        dispatch(firmwareJobUpdated(first));
        const terminal = await waitForTerminalJob(
          first,
          (job) => dispatch(firmwareJobUpdated(job)),
          () => generation === sequenceGeneration
        );
        if (terminal.status !== 'success') {
          break;
        }
      } catch (error) {
        dispatch(
          firmwareRunIndeterminate({ id, error: transportError(error) })
        );
        break;
      }
    }

    if (generation === sequenceGeneration) {
      dispatch(firmwareSequenceFinished());
    }
  };

export const cancelCurrentFirmwareUpdate =
  (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const { currentId, runs } = getState().firmwareUpdate;
    const run = currentId ? runs[currentId] : undefined;
    if (
      !run?.operationId ||
      run.status !== 'running' ||
      run.committed ||
      !run.cancellable
    ) {
      return;
    }

    sequenceGeneration++;
    try {
      dispatch(
        firmwareJobUpdated(
          await cancelFirmwareUpdate(messageHub, run.operationId)
        )
      );
    } catch (error) {
      dispatch(
        firmwareRunIndeterminate({ id: run.id, error: transportError(error) })
      );
    } finally {
      dispatch(firmwareSequenceFinished());
    }
  };

export const reconcileFirmwareUpdates =
  (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    if (getState().firmwareUpdate.running) {
      return;
    }

    const runs = Object.values(getState().firmwareUpdate.runs).filter(
      (run) =>
        run.status === 'indeterminate' ||
        (run.status === 'running' && run.phase !== 'queued')
    );
    for (const run of runs) {
      try {
        const reconciled = await queryFirmwareUpdateStatus(
          messageHub,
          run.id,
          run.operationId
        );
        dispatch(firmwareJobUpdated(reconciled));
        if (reconciled.status !== 'running') {
          continue;
        }

        const generation = ++sequenceGeneration;
        try {
          await waitForTerminalJob(
            reconciled,
            (job) => dispatch(firmwareJobUpdated(job)),
            () => generation === sequenceGeneration
          );
        } catch (error) {
          if (generation === sequenceGeneration) {
            dispatch(
              firmwareRunIndeterminate({
                id: reconciled.id,
                error: transportError(error),
              })
            );
          }
        } finally {
          if (generation === sequenceGeneration) {
            dispatch(firmwareSequenceFinished());
          }
        }
        return;
      } catch {
        // The current indeterminate state is more accurate than replacing it
        // with another transport error. A later reconnect can query again.
      }
    }
  };
