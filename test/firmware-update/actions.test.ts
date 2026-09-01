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
  firmwareJobUpdated,
  firmwareRunIndeterminate,
  firmwareSequenceFinished,
  firmwareSequenceStarted,
  firmwareTargetsLoaded,
  setFirmwareTargetSelected,
  setFirmwareUpdateConfirmed,
} from '~/features/firmware-update/slice';
import type { PreparedFirmwareArtifact } from '~/features/firmware-update/types';
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

const prepareStore = () => {
  const store = configureStore({ reducer: { firmwareUpdate: reducer } });
  const dispatch = store.dispatch as AppDispatch;
  dispatch(
    firmwareTargetsLoaded([
      { id: '7', compatible: true, safety: {} },
      { id: '8', compatible: true, safety: {} },
    ])
  );
  dispatch(setFirmwareTargetSelected({ id: '7', selected: true }));
  dispatch(setFirmwareTargetSelected({ id: '8', selected: true }));
  dispatch(prepareFirmwareArtifact(ARTIFACT));
  dispatch(setFirmwareUpdateConfirmed(true));
  return { store, dispatch };
};

const response = (
  id: string,
  status: 'success' | 'failed'
): { body: Record<string, unknown> } => ({
  body: {
    type: 'X-AP-OTA',
    op: 'start',
    job: {
      id,
      operationId: `operation-${id}`,
      phase: status === 'success' ? 'complete' : 'validating',
      status,
      committed: status === 'success',
      cancellable: false,
    },
  },
});

describe('sequential flight firmware updates', () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
  });

  test('starts the next UAV only after the previous UAV succeeds', async () => {
    mockSendMessage.mockImplementation((request) =>
      Promise.resolve(response(String(request.id), 'success'))
    );
    const { store, dispatch } = prepareStore();

    await dispatch(runFirmwareUpdateSequence());

    const starts = mockSendMessage.mock.calls.map(([request]) => request.id);
    expect(starts).toEqual(['7', '8']);
    expect(store.getState().firmwareUpdate.runs['7'].status).toBe('success');
    expect(store.getState().firmwareUpdate.runs['8'].status).toBe('success');
  });

  test('stops at the first failure and never retries it or starts the next UAV', async () => {
    mockSendMessage.mockResolvedValue(response('7', 'failed'));
    const { store, dispatch } = prepareStore();

    await dispatch(runFirmwareUpdateSequence());

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(store.getState().firmwareUpdate.runs['7'].status).toBe('failed');
    expect(store.getState().firmwareUpdate.runs['8'].status).toBe('cancelled');
  });

  test('marks a lost start response indeterminate and resolves it by UAV after reconnect', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('connection lost'));
    const { store, dispatch } = prepareStore();

    await dispatch(runFirmwareUpdateSequence());

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(store.getState().firmwareUpdate.runs['7'].status).toBe(
      'indeterminate'
    );
    expect(store.getState().firmwareUpdate.runs['8'].status).toBe('cancelled');

    mockSendMessage.mockResolvedValueOnce({
      body: {
        type: 'X-AP-OTA',
        op: 'status',
        job: {
          id: '7',
          operationId: 'operation-7',
          phase: 'complete',
          status: 'success',
          committed: true,
          cancellable: false,
          observedHash: 'deadbeef',
        },
      },
    });
    await dispatch(reconcileFirmwareUpdates());

    expect(mockSendMessage).toHaveBeenLastCalledWith({
      type: 'X-AP-OTA',
      op: 'status',
      id: '7',
    });
    expect(store.getState().firmwareUpdate.runs['7'].status).toBe('success');
  });

  test('resumes polling when reconciliation finds a running server job', async () => {
    jest.useFakeTimers();
    try {
      const { store, dispatch } = prepareStore();
      dispatch(firmwareSequenceStarted(['7']));
      dispatch(
        firmwareJobUpdated({
          id: '7',
          operationId: 'operation-7',
          phase: 'staging',
          status: 'running',
          committed: false,
          cancellable: true,
        })
      );
      dispatch(
        firmwareRunIndeterminate({
          id: '7',
          error: { code: 'transport', detail: 'connection lost' },
        })
      );
      dispatch(firmwareSequenceFinished());

      mockSendMessage
        .mockResolvedValueOnce({
          body: {
            type: 'X-AP-OTA',
            op: 'status',
            job: {
              id: '7',
              operationId: 'operation-7',
              phase: 'staging',
              status: 'running',
              committed: false,
              cancellable: true,
            },
          },
        })
        .mockResolvedValueOnce({
          body: {
            ...response('7', 'success').body,
            op: 'status',
          },
        });

      const reconciliation = dispatch(reconcileFirmwareUpdates());
      await jest.advanceTimersByTimeAsync(0);
      expect(store.getState().firmwareUpdate.running).toBe(true);
      await jest.advanceTimersByTimeAsync(1000);
      await reconciliation;

      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      expect(store.getState().firmwareUpdate.runs['7'].status).toBe('success');
      expect(store.getState().firmwareUpdate.running).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test('cancels the active pre-commit operation and all queued UAVs', async () => {
    const { store, dispatch } = prepareStore();
    dispatch(firmwareSequenceStarted(['7', '8']));
    dispatch(
      firmwareJobUpdated({
        id: '7',
        operationId: 'operation-7',
        phase: 'staging',
        status: 'running',
        committed: false,
        cancellable: true,
      })
    );
    mockSendMessage.mockResolvedValueOnce({
      body: {
        type: 'X-AP-OTA',
        op: 'cancel',
        job: {
          id: '7',
          operationId: 'operation-7',
          phase: 'staging',
          status: 'cancelled',
          committed: false,
          cancellable: false,
        },
      },
    });

    await dispatch(cancelCurrentFirmwareUpdate());

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: 'X-AP-OTA',
      op: 'cancel',
      operationId: 'operation-7',
    });
    expect(store.getState().firmwareUpdate.runs['7'].status).toBe('cancelled');
    expect(store.getState().firmwareUpdate.runs['8'].status).toBe('cancelled');
    expect(store.getState().firmwareUpdate.running).toBe(false);
  });

  test('refuses cancellation after the server commit boundary', async () => {
    const { store, dispatch } = prepareStore();
    dispatch(firmwareSequenceStarted(['7']));
    dispatch(
      firmwareJobUpdated({
        id: '7',
        operationId: 'operation-7',
        phase: 'committing',
        status: 'running',
        committed: true,
        cancellable: false,
      })
    );

    await dispatch(cancelCurrentFirmwareUpdate());

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(store.getState().firmwareUpdate.running).toBe(true);
  });

  test('marks cancellation indeterminate when the server response is lost', async () => {
    const { store, dispatch } = prepareStore();
    dispatch(firmwareSequenceStarted(['7']));
    dispatch(
      firmwareJobUpdated({
        id: '7',
        operationId: 'operation-7',
        phase: 'staging',
        status: 'running',
        committed: false,
        cancellable: true,
      })
    );
    mockSendMessage.mockRejectedValueOnce(new Error('connection lost'));

    await dispatch(cancelCurrentFirmwareUpdate());

    expect(store.getState().firmwareUpdate.runs['7'].status).toBe(
      'indeterminate'
    );
    expect(store.getState().firmwareUpdate.running).toBe(false);
  });
});
