import { describe, expect, jest, test } from '@jest/globals';

import {
  cancelFirmwareUpdate,
  parseFirmwareJob,
  queryFirmwareUpdateStatus,
  queryFirmwareUpdateTargets,
  startFirmwareUpdate,
} from '~/features/firmware-update/messages';
import type { PreparedFirmwareArtifact } from '~/features/firmware-update/types';
import type MessageHub from '~/flockwave/messages';

const JOB = {
  id: '7',
  operationId: 'operation-1',
  phase: 'staging',
  status: 'running',
  committed: false,
  cancellable: true,
};

const makeHub = (response: Record<string, unknown>) => {
  const sendMessage = jest.fn<
    (
      request: unknown,
      options?: unknown
    ) => Promise<{ body: Record<string, unknown> }>
  >((_request, _options) =>
    Promise.resolve({ body: { type: 'X-AP-OTA', ...response } })
  );
  return { hub: { sendMessage } as unknown as MessageHub, sendMessage };
};

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

describe('X-AP-OTA messages', () => {
  test('parses every structured job field without changing its meaning', () => {
    expect(
      parseFirmwareJob({
        id: '7',
        operationId: 'operation-1',
        phase: 'staging',
        status: 'running',
        bytesTotal: 0,
        bytesTransferred: 12,
        cancellable: true,
        committed: false,
        error: { code: 'upload_failed', detail: 'link lost' },
        expectedHash: 'expected-hash',
        expectedVersion: '4.6.3',
        observedHash: 'observed-hash',
        observedVersion: '4.6.2',
      })
    ).toEqual({
      id: '7',
      operationId: 'operation-1',
      phase: 'staging',
      status: 'running',
      bytesTotal: 0,
      bytesTransferred: 12,
      cancellable: true,
      committed: false,
      error: { code: 'upload_failed', detail: 'link lost' },
      expectedHash: 'expected-hash',
      expectedVersion: '4.6.3',
      observedHash: 'observed-hash',
      observedVersion: '4.6.2',
    });
  });

  test.each([undefined, null, 7, 'job', [], {}])(
    'rejects a non-job value %p',
    (value) => {
      expect(parseFirmwareJob(value)).toBeUndefined();
    }
  );

  test.each([
    ['id', undefined],
    ['id', ''],
    ['operationId', undefined],
    ['operationId', ''],
    ['phase', undefined],
    ['phase', ''],
    ['phase', 'unknown'],
    ['status', undefined],
    ['status', ''],
    ['status', 'unknown'],
  ])('rejects required job field %s=%p', (key, value) => {
    expect(parseFirmwareJob({ ...JOB, [key]: value })).toBeUndefined();
  });

  test.each([
    'validating',
    'staging',
    'committing',
    'rebooting',
    'reconnecting',
    'verifyingInstalled',
    'complete',
  ])('accepts server phase %s', (phase) => {
    expect(parseFirmwareJob({ ...JOB, phase })).toMatchObject({ phase });
  });

  test.each(['running', 'success', 'failed', 'cancelled', 'indeterminate'])(
    'accepts server status %s',
    (status) => {
      expect(parseFirmwareJob({ ...JOB, status })).toMatchObject({ status });
    }
  );

  test.each([
    ['bytesTotal', -1],
    ['bytesTotal', Number.NaN],
    ['bytesTotal', Number.POSITIVE_INFINITY],
    ['bytesTotal', '12'],
    ['bytesTransferred', -1],
    ['bytesTransferred', Number.NaN],
    ['bytesTransferred', Number.POSITIVE_INFINITY],
    ['bytesTransferred', '12'],
  ])('drops invalid optional count %s=%p', (key, value) => {
    expect(parseFirmwareJob({ ...JOB, [key]: value })).toMatchObject({
      [key]: undefined,
    });
  });

  test.each([
    'expectedHash',
    'expectedVersion',
    'observedHash',
    'observedVersion',
  ])('drops an empty or non-string optional field %s', (key) => {
    expect(parseFirmwareJob({ ...JOB, [key]: '' })).toMatchObject({
      [key]: undefined,
    });
    expect(parseFirmwareJob({ ...JOB, [key]: 7 })).toMatchObject({
      [key]: undefined,
    });
  });

  test.each([null, 7, 'error', [], {}, { code: '' }, { code: 7 }])(
    'drops invalid structured error %p',
    (error) => {
      expect(parseFirmwareJob({ ...JOB, error })).toMatchObject({
        error: undefined,
      });
    }
  );

  test('only accepts literal true for server booleans', () => {
    expect(
      parseFirmwareJob({ ...JOB, cancellable: false, committed: true })
    ).toMatchObject({ cancellable: false, committed: true });
    expect(
      parseFirmwareJob({ ...JOB, cancellable: 1, committed: 'true' })
    ).toMatchObject({ cancellable: false, committed: false });
  });

  test('normalizes an object target map with server safety facts', async () => {
    const { hub } = makeHub({
      op: 'targets',
      targets: {
        '7': {
          compatible: true,
          currentVersion: '4.6.2',
          safety: { connected: true, disarmed: true },
        },
      },
    });

    await expect(queryFirmwareUpdateTargets(hub)).resolves.toEqual([
      {
        id: '7',
        compatible: true,
        currentVersion: '4.6.2',
        currentHash: undefined,
        error: undefined,
        label: undefined,
        safety: {
          connected: true,
          disarmed: true,
          onGround: undefined,
          powerSufficient: undefined,
        },
      },
    ]);
  });

  test('starts exactly one target with the APJ bytes and digest', async () => {
    const { hub, sendMessage } = makeHub({ op: 'start', job: JOB });
    await startFirmwareUpdate(hub, '7', ARTIFACT);

    expect(sendMessage).toHaveBeenCalledWith(
      {
        type: 'X-AP-OTA',
        op: 'start',
        id: '7',
        name: 'arducopter.apj',
        image: ARTIFACT.image,
        sha256: ARTIFACT.metadata.sha256,
      },
      { timeout: 120 }
    );
  });

  test('status and cancellation address the server operation', async () => {
    const statusHub = makeHub({ op: 'status', job: JOB });
    await queryFirmwareUpdateStatus(statusHub.hub, '7', 'operation-1');
    expect(statusHub.sendMessage).toHaveBeenCalledWith({
      type: 'X-AP-OTA',
      op: 'status',
      id: '7',
      operationId: 'operation-1',
    });

    const cancelHub = makeHub({
      op: 'cancel',
      job: { ...JOB, status: 'cancelled' },
    });
    await cancelFirmwareUpdate(cancelHub.hub, 'operation-1');
    expect(cancelHub.sendMessage).toHaveBeenCalledWith({
      type: 'X-AP-OTA',
      op: 'cancel',
      operationId: 'operation-1',
    });
  });
});
