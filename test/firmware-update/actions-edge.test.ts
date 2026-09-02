import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockSendMessage =
  jest.fn<
    (
      request: Record<string, unknown>
    ) => Promise<{ body: Record<string, unknown> }>
  >();
jest.mock('~/message-hub', () => ({
  __esModule: true,
  default: {
    sendMessage: (request: Record<string, unknown>) => mockSendMessage(request),
  },
}));
jest.mock('~/error-handling', () => ({
  errorToString: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

import { configureStore } from '@reduxjs/toolkit';

import {
  beginFirmwareArtifactRead,
  cancelCurrentFirmwareUpdate,
  hideFirmwareUpdateDialog,
  prepareFirmwareArtifact,
  reconcileFirmwareUpdates,
  refreshFirmwareTargets,
  rejectFirmwareArtifact,
  runFirmwareUpdateSequence,
  showFirmwareUpdateDialog,
  startNewFirmwareUpdate,
} from '~/features/firmware-update/actions';
import reducer, {
  type FirmwareUpdateSliceState,
  firmwareArtifactPrepared,
  firmwareJobUpdated,
  firmwareSequenceStarted,
  firmwareTargetsLoaded,
  setFirmwareTargetSelected,
  setFirmwareUpdateConfirmed,
} from '~/features/firmware-update/slice';
import type {
  FirmwareUpdateJob,
  FirmwareUpdateRun,
  PreparedFirmwareArtifact,
} from '~/features/firmware-update/types';
import type { AppDispatch } from '~/store/reducers';

const ARTIFACT: PreparedFirmwareArtifact = {
  image: 'YXJkdXBpbG90',
  metadata: {
    boardId: 1177,
    boardName: 'AXIOLIGHT-REVB',
    fileName: 'arducopter.apj',
    fileSize: 12,
    firmwareSize: 3,
    gitHash: 'deadbeef',
    sha256: 'a'.repeat(64),
    version: '4.6.3',
  },
};

const makeJob = (
  id: string,
  status: FirmwareUpdateJob['status'] = 'running',
  phase: FirmwareUpdateJob['phase'] = 'staging'
): FirmwareUpdateJob => ({
  id,
  operationId: `operation-${id}`,
  phase,
  status,
  committed: status === 'success',
  cancellable: status === 'running',
});

const jobResponse = (
  op: 'start' | 'status' | 'cancel',
  job: FirmwareUpdateJob
) => ({ body: { type: 'X-AP-OTA', op, job } });

const targetResponse = {
  body: { type: 'X-AP-OTA', op: 'targets', targets: [] },
};

const makeStore = (state?: FirmwareUpdateSliceState) => {
  const store = configureStore({
    reducer: { firmwareUpdate: reducer },
    ...(state ? { preloadedState: { firmwareUpdate: state } } : {}),
  });
  return { store, dispatch: store.dispatch as AppDispatch };
};

const makePreparedStore = (ids = ['7', '8']) => {
  const result = makeStore();
  result.dispatch(
    firmwareTargetsLoaded({
      generation: 0,
      targets: ids.map((id) => ({ id, compatible: true, safety: {} })),
    })
  );
  for (const id of ids) {
    result.dispatch(setFirmwareTargetSelected({ id, selected: true }));
  }
  result.dispatch(prepareFirmwareArtifact(ARTIFACT));
  result.dispatch(setFirmwareUpdateConfirmed(true));
  return result;
};

describe('flight firmware update action edge cases', () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
  });

  test('owns artifact rejection and the dialog lifecycle', () => {
    mockSendMessage.mockResolvedValue(targetResponse);
    const { store, dispatch } = makePreparedStore();

    dispatch(showFirmwareUpdateDialog());
    expect(store.getState().firmwareUpdate.dialogOpen).toBe(true);
    expect(mockSendMessage).toHaveBeenCalledWith({
      type: 'X-AP-OTA',
      op: 'targets',
    });

    dispatch(hideFirmwareUpdateDialog());
    expect(store.getState().firmwareUpdate.dialogOpen).toBe(false);
    dispatch(rejectFirmwareArtifact());
    expect(store.getState().firmwareUpdate).toMatchObject({
      artifact: undefined,
      confirmed: false,
      readingArtifact: false,
    });
  });

  test('starts over without retaining the in-memory artifact', async () => {
    mockSendMessage.mockResolvedValue(targetResponse);
    const { store, dispatch } = makePreparedStore(['7']);

    dispatch(startNewFirmwareUpdate());
    expect(store.getState().firmwareUpdate.artifact).toBeUndefined();
    expect(mockSendMessage).toHaveBeenCalledTimes(1);

    dispatch(
      firmwareTargetsLoaded({
        generation: store.getState().firmwareUpdate.targetGeneration,
        targets: [{ id: '7', compatible: true, safety: {} }],
      })
    );
    dispatch(setFirmwareTargetSelected({ id: '7', selected: true }));
    dispatch(firmwareArtifactPrepared(ARTIFACT.metadata));
    dispatch(setFirmwareUpdateConfirmed(true));
    await dispatch(runFirmwareUpdateSequence());
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  test('reports a target refresh failure with its exact text', async () => {
    mockSendMessage.mockRejectedValue(new Error('targets unavailable'));
    const { store, dispatch } = makeStore();

    await dispatch(refreshFirmwareTargets());

    expect(store.getState().firmwareUpdate).toMatchObject({
      confirmed: false,
      loadingTargets: false,
      targetError: 'targets unavailable',
      targets: [],
    });
  });

  test.each([
    ['missing artifact', { artifact: undefined }],
    ['unconfirmed', { confirmed: false }],
    ['targets loading', { loadingTargets: true }],
    ['artifact reading', { readingArtifact: true }],
    ['sequence running', { running: true }],
  ])('does not start with %s', async (_name, override) => {
    const prepared = makePreparedStore(['7']);
    const state = { ...prepared.store.getState().firmwareUpdate, ...override };
    const { dispatch } = makeStore(state);

    await dispatch(runFirmwareUpdateSequence());
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  test('does not start when state metadata differs from the prepared bytes', async () => {
    const { dispatch } = makePreparedStore(['7']);
    dispatch(
      firmwareArtifactPrepared({
        ...ARTIFACT.metadata,
        sha256: 'b'.repeat(64),
      })
    );
    dispatch(setFirmwareUpdateConfirmed(true));

    await dispatch(runFirmwareUpdateSequence());
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  test('stores each polled update before accepting terminal success', async () => {
    jest.useFakeTimers();
    try {
      mockSendMessage
        .mockResolvedValueOnce(jobResponse('start', makeJob('7')))
        .mockResolvedValueOnce(
          jobResponse('status', makeJob('7', 'running', 'committing'))
        )
        .mockResolvedValueOnce(
          jobResponse('status', makeJob('7', 'success', 'complete'))
        );
      const { store, dispatch } = makePreparedStore(['7']);

      const sequence = dispatch(runFirmwareUpdateSequence());
      await jest.advanceTimersByTimeAsync(1000);
      expect(store.getState().firmwareUpdate.runs['7'].phase).toBe(
        'committing'
      );
      await jest.advanceTimersByTimeAsync(1000);
      await sequence;
      expect(store.getState().firmwareUpdate.runs['7'].status).toBe('success');
      expect(mockSendMessage).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  test('stops a sequence whose active operation is cancelled while polling', async () => {
    jest.useFakeTimers();
    try {
      mockSendMessage
        .mockResolvedValueOnce(jobResponse('start', makeJob('7')))
        .mockResolvedValueOnce(
          jobResponse('cancel', makeJob('7', 'cancelled'))
        );
      const { store, dispatch } = makePreparedStore();

      const sequence = dispatch(runFirmwareUpdateSequence());
      await jest.advanceTimersByTimeAsync(0);
      await dispatch(cancelCurrentFirmwareUpdate());
      await jest.advanceTimersByTimeAsync(1000);
      await sequence;

      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      expect(store.getState().firmwareUpdate.runs['7'].status).toBe(
        'cancelled'
      );
      expect(store.getState().firmwareUpdate.runs['8'].status).toBe(
        'cancelled'
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test.each([
    ['another operation', makeJob('7', 'success', 'complete')],
    ['a still-running job', makeJob('7')],
    [
      'a malformed queued terminal job',
      { ...makeJob('7', 'failed'), phase: 'queued' } as FirmwareUpdateRun,
    ],
  ])('does not accept a failed poll from %s', async (name, pushed) => {
    jest.useFakeTimers();
    try {
      let rejectStatus!: (reason: Error) => void;
      const pendingStatus = new Promise<{
        body: Record<string, unknown>;
      }>((_resolve, reject) => {
        rejectStatus = reject;
      });
      void pendingStatus.catch(() => undefined);
      const current =
        name === 'another operation'
          ? { ...pushed, operationId: 'operation-other' }
          : pushed;
      mockSendMessage
        .mockResolvedValueOnce(jobResponse('start', makeJob('7')))
        .mockReturnValueOnce(pendingStatus);
      const { store, dispatch } = makePreparedStore(['7']);

      const sequence = dispatch(runFirmwareUpdateSequence());
      await jest.advanceTimersByTimeAsync(1000);
      dispatch(firmwareJobUpdated(current as FirmwareUpdateJob));
      rejectStatus(new Error('status lost'));
      await sequence;

      expect(store.getState().firmwareUpdate.runs['7']).toMatchObject({
        status: 'indeterminate',
        error: { code: 'transport', detail: 'status lost' },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test('refuses every invalid cancellation state', async () => {
    const invalidRuns: Array<FirmwareUpdateRun | undefined> = [
      undefined,
      { ...makeJob('7'), operationId: undefined },
      { ...makeJob('7', 'failed'), cancellable: true },
      { ...makeJob('7'), committed: true },
      { ...makeJob('7'), cancellable: false },
    ];
    for (const run of invalidRuns) {
      mockSendMessage.mockClear();
      const base = makeStore().store.getState().firmwareUpdate;
      const runs: Record<string, FirmwareUpdateRun> = run ? { '7': run } : {};
      const state = {
        ...base,
        currentId: '7',
        runs,
      };
      const { dispatch } = makeStore(state);
      await dispatch(cancelCurrentFirmwareUpdate());
      expect(mockSendMessage).not.toHaveBeenCalled();
    }
  });

  test('reconciliation skips active, failed, and queued runs', async () => {
    const base = makeStore().store.getState().firmwareUpdate;
    mockSendMessage.mockResolvedValue(
      jobResponse('status', makeJob('7', 'success', 'complete'))
    );
    const active = makeStore({
      ...base,
      running: true,
      runs: { '7': { ...makeJob('7'), status: 'indeterminate' } },
    });
    await active.dispatch(reconcileFirmwareUpdates());

    const idle = makeStore({
      ...base,
      runs: {
        failed: makeJob('failed', 'failed'),
        queued: {
          id: 'queued',
          phase: 'queued',
          status: 'running',
          committed: false,
          cancellable: true,
        },
      },
    });
    await idle.dispatch(reconcileFirmwareUpdates());
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  test('reconciliation continues after terminal jobs and preserves query errors', async () => {
    const base = makeStore().store.getState().firmwareUpdate;
    const indeterminate = (id: string): FirmwareUpdateRun => ({
      ...makeJob(id),
      status: 'indeterminate',
      cancellable: false,
    });
    const { store, dispatch } = makeStore({
      ...base,
      runs: { '7': indeterminate('7'), '8': indeterminate('8') },
    });
    mockSendMessage
      .mockResolvedValueOnce(
        jobResponse('status', makeJob('7', 'success', 'complete'))
      )
      .mockRejectedValueOnce(new Error('still offline'));

    await dispatch(reconcileFirmwareUpdates());

    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    expect(store.getState().firmwareUpdate.runs['7'].status).toBe('success');
    expect(store.getState().firmwareUpdate.runs['8']).toEqual(
      indeterminate('8')
    );
  });

  test('reconciliation records a polling failure and clears running state', async () => {
    jest.useFakeTimers();
    try {
      const base = makeStore().store.getState().firmwareUpdate;
      const { store, dispatch } = makeStore({
        ...base,
        runs: { '7': { ...makeJob('7'), status: 'indeterminate' } },
      });
      mockSendMessage
        .mockResolvedValueOnce(jobResponse('status', makeJob('7')))
        .mockRejectedValueOnce(new Error('poll offline'));

      const reconciliation = dispatch(reconcileFirmwareUpdates());
      await jest.advanceTimersByTimeAsync(1000);
      await reconciliation;

      expect(store.getState().firmwareUpdate).toMatchObject({
        running: false,
        runs: {
          '7': {
            status: 'indeterminate',
            error: { code: 'transport', detail: 'poll offline' },
          },
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test('stale reconciliation errors cannot overwrite a newer cancellation', async () => {
    jest.useFakeTimers();
    try {
      let rejectPoll!: (reason: Error) => void;
      const pendingPoll = new Promise<{ body: Record<string, unknown> }>(
        (_resolve, reject) => {
          rejectPoll = reject;
        }
      );
      void pendingPoll.catch(() => undefined);
      const base = makeStore().store.getState().firmwareUpdate;
      const { store, dispatch } = makeStore({
        ...base,
        runs: { '7': { ...makeJob('7'), status: 'indeterminate' } },
      });
      mockSendMessage
        .mockResolvedValueOnce(jobResponse('status', makeJob('7')))
        .mockReturnValueOnce(pendingPoll)
        .mockResolvedValueOnce(jobResponse('cancel', makeJob('7')));

      const reconciliation = dispatch(reconcileFirmwareUpdates());
      await jest.advanceTimersByTimeAsync(1000);
      await dispatch(cancelCurrentFirmwareUpdate());
      rejectPoll(new Error('stale poll failed'));
      await reconciliation;

      expect(mockSendMessage).toHaveBeenCalledTimes(3);
      expect(store.getState().firmwareUpdate.runs['7']).toMatchObject({
        status: 'running',
        error: undefined,
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
