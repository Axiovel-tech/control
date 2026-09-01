import { describe, expect, test } from '@jest/globals';

import {
  isFirmwareRunCancellable,
  isFirmwareUpdateStartable,
} from '~/features/firmware-update/selectors';
import reducer, {
  firmwareCurrentTargetChanged,
  firmwareJobUpdated,
  firmwareRunIndeterminate,
  firmwareSequenceFinished,
  firmwareSequenceStarted,
  firmwareTargetsLoaded,
  firmwareTargetsLoading,
  setFirmwareTargetSelected,
  setFirmwareUpdateConfirmed,
} from '~/features/firmware-update/slice';
import type {
  FirmwareArtifactMetadata,
  FirmwareUpdateJob,
} from '~/features/firmware-update/types';

const ARTIFACT: FirmwareArtifactMetadata = {
  boardId: 1177,
  boardName: 'AXIOLIGHT-REVB',
  fileName: 'arducopter.apj',
  fileSize: 160,
  firmwareSize: 3,
  gitHash: 'deadbeef',
  sha256: 'a'.repeat(64),
  version: '4.6.3',
};

const JOB: FirmwareUpdateJob = {
  id: '7',
  operationId: 'operation-1',
  phase: 'staging',
  status: 'running',
  committed: false,
  cancellable: true,
};

const initial = () => reducer(undefined, { type: 'test/init' });

describe('flight firmware update state', () => {
  test('selects only compatible targets without duplicates and resets confirmation', () => {
    let state = reducer(
      initial(),
      firmwareTargetsLoaded([
        { id: '1', compatible: true, safety: {} },
        { id: '2', compatible: false, safety: {} },
        { id: '3', compatible: true, safety: {} },
      ])
    );
    state = reducer(state, setFirmwareUpdateConfirmed(true));
    state = reducer(
      state,
      setFirmwareTargetSelected({ id: 'missing', selected: true })
    );
    state = reducer(
      state,
      setFirmwareTargetSelected({ id: '2', selected: true })
    );
    expect(state.selectedIds).toEqual([]);
    expect(state.confirmed).toBe(true);

    state = reducer(
      state,
      setFirmwareTargetSelected({ id: '1', selected: true })
    );
    expect(state.selectedIds).toEqual(['1']);
    expect(state.confirmed).toBe(false);

    state = reducer(
      state,
      setFirmwareTargetSelected({ id: '1', selected: true })
    );
    expect(state.selectedIds).toEqual(['1']);

    state = reducer(
      state,
      setFirmwareTargetSelected({ id: '3', selected: true })
    );
    expect(state.selectedIds).toEqual(['1', '3']);

    state = reducer(state, setFirmwareUpdateConfirmed(true));
    state = reducer(
      state,
      setFirmwareTargetSelected({ id: '1', selected: false })
    );
    expect(state.selectedIds).toEqual(['3']);
    expect(state.confirmed).toBe(false);
  });

  test('sets confirmation to both explicit values', () => {
    let state = reducer(initial(), setFirmwareUpdateConfirmed(true));
    expect(state.confirmed).toBe(true);
    state = reducer(state, setFirmwareUpdateConfirmed(false));
    expect(state.confirmed).toBe(false);
  });

  test('invalidates confirmation while targets refresh', () => {
    let state = reducer(initial(), setFirmwareUpdateConfirmed(true));
    state = reducer(state, firmwareTargetsLoading());
    expect(state.loadingTargets).toBe(true);
    expect(state.confirmed).toBe(false);
  });

  test('creates the exact ordered queue and advances the current target', () => {
    let state = reducer(initial(), firmwareSequenceStarted(['7', '8']));
    expect(state).toMatchObject({
      currentId: '7',
      order: ['7', '8'],
      running: true,
      runs: {
        '7': {
          id: '7',
          cancellable: true,
          committed: false,
          phase: 'queued',
          status: 'running',
        },
        '8': {
          id: '8',
          cancellable: true,
          committed: false,
          phase: 'queued',
          status: 'running',
        },
      },
    });

    state = reducer(state, firmwareCurrentTargetChanged('8'));
    expect(state.currentId).toBe('8');
  });

  test('updates known jobs, appends unknown jobs once, and tracks only running jobs', () => {
    let state = reducer(initial(), firmwareSequenceStarted(['7']));
    state = reducer(state, firmwareCurrentTargetChanged('8'));
    state = reducer(state, firmwareJobUpdated(JOB));
    expect(state.order).toEqual(['7']);
    expect(state.currentId).toBe('7');
    expect(state.runs['7']).toEqual(JOB);

    const completed: FirmwareUpdateJob = {
      ...JOB,
      id: '8',
      operationId: 'operation-2',
      phase: 'complete',
      status: 'success',
      committed: true,
      cancellable: false,
    };
    state = reducer(state, firmwareJobUpdated(completed));
    expect(state.order).toEqual(['7', '8']);
    expect(state.currentId).toBe('7');
    expect(state.runs['8']).toEqual(completed);

    state = reducer(state, firmwareJobUpdated(completed));
    expect(state.order).toEqual(['7', '8']);
  });

  test('marks an existing run indeterminate while preserving server progress', () => {
    let state = reducer(initial(), firmwareSequenceStarted(['7']));
    state = reducer(
      state,
      firmwareJobUpdated({ ...JOB, committed: true, cancellable: false })
    );
    state = reducer(
      state,
      firmwareRunIndeterminate({
        id: '7',
        error: { code: 'connection_lost', detail: 'status unavailable' },
      })
    );

    expect(state.runs['7']).toEqual({
      ...JOB,
      committed: true,
      cancellable: false,
      status: 'indeterminate',
      error: { code: 'connection_lost', detail: 'status unavailable' },
    });
  });

  test('creates a safe indeterminate run when no server job was observed', () => {
    const state = reducer(
      initial(),
      firmwareRunIndeterminate({
        id: '7',
        error: { code: 'start_unknown' },
      })
    );

    expect(state.runs['7']).toEqual({
      id: '7',
      cancellable: false,
      committed: false,
      phase: 'queued',
      status: 'indeterminate',
      error: { code: 'start_unknown' },
    });
  });

  test('finishes the sequence and cancels only queued runs', () => {
    let state = reducer(initial(), firmwareSequenceStarted(['7', '8']));
    state = reducer(state, firmwareJobUpdated(JOB));
    state = reducer(state, firmwareSequenceFinished());
    expect(state.runs['7']).toEqual(JOB);
    expect(state.runs['8']).toEqual({
      id: '8',
      cancellable: false,
      committed: false,
      phase: 'queued',
      status: 'cancelled',
      error: undefined,
    });
    expect(state.currentId).toBeUndefined();
    expect(state.running).toBe(false);
  });

  test('finishing a stopped sequence cancels every unstarted run', () => {
    let state = reducer(initial(), firmwareSequenceStarted(['7', '8']));
    state = reducer(state, firmwareJobUpdated({ ...JOB, status: 'failed' }));
    state = reducer(state, firmwareSequenceFinished());

    expect(state.runs['7'].status).toBe('failed');
    expect(state.runs['8'].status).toBe('cancelled');
    expect(state.running).toBe(false);
  });
});

describe('flight firmware update policy selectors', () => {
  test.each([
    [
      {
        artifact: ARTIFACT,
        confirmed: true,
        loadingTargets: false,
        running: false,
        selectedIds: ['7'],
      },
      true,
    ],
    [
      {
        artifact: undefined,
        confirmed: true,
        loadingTargets: false,
        running: false,
        selectedIds: ['7'],
      },
      false,
    ],
    [
      {
        artifact: ARTIFACT,
        confirmed: false,
        loadingTargets: false,
        running: false,
        selectedIds: ['7'],
      },
      false,
    ],
    [
      {
        artifact: ARTIFACT,
        confirmed: true,
        loadingTargets: false,
        running: true,
        selectedIds: ['7'],
      },
      false,
    ],
    [
      {
        artifact: ARTIFACT,
        confirmed: true,
        loadingTargets: false,
        running: false,
        selectedIds: [],
      },
      false,
    ],
    [
      {
        artifact: ARTIFACT,
        confirmed: true,
        loadingTargets: true,
        running: false,
        selectedIds: ['7'],
      },
      false,
    ],
  ])('evaluates start policy %#', (state, expected) => {
    expect(isFirmwareUpdateStartable(state)).toBe(expected);
  });

  test.each([
    [JOB, true],
    [undefined, false],
    [{ ...JOB, operationId: undefined }, false],
    [{ ...JOB, status: 'failed' as const }, false],
    [{ ...JOB, cancellable: false }, false],
    [{ ...JOB, committed: true }, false],
  ])('evaluates cancellation policy %#', (run, expected) => {
    expect(isFirmwareRunCancellable(run)).toBe(expected);
  });
});
