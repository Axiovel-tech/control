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
  cancelCurrentFirmwareUpdate,
  prepareFirmwareArtifact,
  reconcileFirmwareUpdates,
  runFirmwareUpdateSequence,
} from '~/features/firmware-update/actions';
import reducer, {
  type FirmwareUpdateSliceState,
  firmwareJobUpdated,
  firmwareSequenceStarted,
  firmwareTargetsLoaded,
  setFirmwareTargetSelected,
  setFirmwareUpdateConfirmed,
} from '~/features/firmware-update/slice';
import type {
  FirmwareUpdateJob,
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

const makeStore = (state?: FirmwareUpdateSliceState) => {
  const store = configureStore({
    reducer: { firmwareUpdate: reducer },
    ...(state ? { preloadedState: { firmwareUpdate: state } } : {}),
  });
  return { store, dispatch: store.dispatch as AppDispatch };
};

const makePreparedStore = () => {
  const result = makeStore();
  result.dispatch(
    firmwareTargetsLoaded({
      generation: 0,
      targets: ['7', '8'].map((id) => ({
        id,
        compatible: true,
        safety: {},
      })),
    })
  );
  for (const id of ['7', '8']) {
    result.dispatch(setFirmwareTargetSelected({ id, selected: true }));
  }
  result.dispatch(prepareFirmwareArtifact(ARTIFACT));
  result.dispatch(setFirmwareUpdateConfirmed(true));
  return result;
};

const pendingResponse = () => {
  let reject!: (reason: Error) => void;
  const promise = new Promise<{ body: Record<string, unknown> }>(
    (_resolve, rejectPromise) => {
      reject = rejectPromise;
    }
  );
  void promise.catch(() => undefined);
  return { promise, reject };
};

const makeReconcilingStore = () => {
  const base = makeStore().store.getState().firmwareUpdate;
  return makeStore({
    ...base,
    runs: { '7': { ...makeJob('7'), status: 'indeterminate' } },
  });
};

describe('flight firmware update action concurrency', () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
  });

  test('an empty selection cannot erase prior run results', async () => {
    const prepared = makePreparedStore();
    const completed = makeJob('old', 'success', 'complete');
    const { store, dispatch } = makeStore({
      ...prepared.store.getState().firmwareUpdate,
      order: ['old'],
      runs: { old: completed },
      selectedIds: [],
    });

    await dispatch(runFirmwareUpdateSequence());

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(store.getState().firmwareUpdate.runs).toEqual({ old: completed });
  });

  test('a cancelled sequence cannot continue to its next target', async () => {
    jest.useFakeTimers();
    try {
      const poll = pendingResponse();
      mockSendMessage
        .mockResolvedValueOnce(jobResponse('start', makeJob('7')))
        .mockReturnValueOnce(poll.promise)
        .mockResolvedValueOnce(
          jobResponse('cancel', makeJob('7', 'success', 'complete'))
        );
      const { dispatch } = makePreparedStore();

      const sequence = dispatch(runFirmwareUpdateSequence());
      await jest.advanceTimersByTimeAsync(1000);
      await dispatch(cancelCurrentFirmwareUpdate());
      poll.reject(new Error('stale status failed'));
      await sequence;

      expect(mockSendMessage).toHaveBeenCalledTimes(3);
      expect(mockSendMessage.mock.calls.some(([body]) => body.id === '8')).toBe(
        false
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test('a stale sequence cannot finish a newer managed queue', async () => {
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
      dispatch(firmwareSequenceStarted(['new']));
      await jest.advanceTimersByTimeAsync(1000);
      await sequence;

      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      expect(store.getState().firmwareUpdate).toMatchObject({
        currentId: 'new',
        running: true,
        runs: { new: { phase: 'queued', status: 'running' } },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test('reconciliation includes an idle non-queued running job', async () => {
    const base = makeStore().store.getState().firmwareUpdate;
    const { store, dispatch } = makeStore({
      ...base,
      runs: { '7': makeJob('7') },
    });
    mockSendMessage.mockResolvedValueOnce(
      jobResponse('status', makeJob('7', 'success', 'complete'))
    );

    await dispatch(reconcileFirmwareUpdates());

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(store.getState().firmwareUpdate.runs['7'].status).toBe('success');
  });

  test('cancelling reconciliation prevents a later status poll', async () => {
    jest.useFakeTimers();
    try {
      mockSendMessage
        .mockResolvedValueOnce(jobResponse('status', makeJob('7')))
        .mockResolvedValueOnce(
          jobResponse('cancel', makeJob('7', 'cancelled'))
        );
      const { store, dispatch } = makeReconcilingStore();

      const reconciliation = dispatch(reconcileFirmwareUpdates());
      await jest.advanceTimersByTimeAsync(0);
      await dispatch(cancelCurrentFirmwareUpdate());
      await jest.advanceTimersByTimeAsync(1000);
      await reconciliation;

      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      expect(store.getState().firmwareUpdate.runs['7'].status).toBe(
        'cancelled'
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test('reconciliation preserves a terminal push when its poll fails', async () => {
    jest.useFakeTimers();
    try {
      const poll = pendingResponse();
      mockSendMessage
        .mockResolvedValueOnce(jobResponse('status', makeJob('7')))
        .mockReturnValueOnce(poll.promise);
      const { store, dispatch } = makeReconcilingStore();

      const reconciliation = dispatch(reconcileFirmwareUpdates());
      await jest.advanceTimersByTimeAsync(1000);
      dispatch(firmwareJobUpdated(makeJob('7', 'success', 'complete')));
      poll.reject(new Error('redundant status failed'));
      await reconciliation;

      expect(store.getState().firmwareUpdate.runs['7'].status).toBe('success');
    } finally {
      jest.useRealTimers();
    }
  });

  test('stale reconciliation cleanup cannot finish a newer queue', async () => {
    jest.useFakeTimers();
    try {
      const poll = pendingResponse();
      mockSendMessage
        .mockResolvedValueOnce(jobResponse('status', makeJob('7')))
        .mockReturnValueOnce(poll.promise)
        .mockResolvedValueOnce(jobResponse('cancel', makeJob('7')));
      const { store, dispatch } = makeReconcilingStore();

      const reconciliation = dispatch(reconcileFirmwareUpdates());
      await jest.advanceTimersByTimeAsync(1000);
      await dispatch(cancelCurrentFirmwareUpdate());
      dispatch(firmwareSequenceStarted(['7', 'new']));
      poll.reject(new Error('stale poll failed'));
      await reconciliation;

      expect(store.getState().firmwareUpdate).toMatchObject({
        currentId: '7',
        running: true,
        runs: {
          '7': { phase: 'queued', status: 'running' },
          new: { phase: 'queued', status: 'running' },
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
