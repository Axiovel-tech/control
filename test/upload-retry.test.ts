import { describe, expect, jest, test } from '@jest/globals';

jest.mock('~/error-handling', () => ({
  errorToString: (error: unknown, prefix?: string): string => {
    const text = error instanceof Error ? error.message : String(error);
    return prefix ? `${prefix}: ${text}` : text;
  },
  handleError: jest.fn(),
}));

// The saga's helpers pull in the message hub and the application store
jest.mock('~/utils/messaging', () => ({
  flashLightOnUAVsAndHideFailures: jest.fn(),
}));
jest.mock('~/features/upload/actions', () => ({
  recalculateEstimatedCompletionTime: () => ({ type: 'recalculate' }),
}));
jest.mock('~/features/upload/selectors', () => ({
  getCurrentUploadJob: jest.fn(),
  getNextDroneFromUploadQueue: jest.fn(),
  getUploadItemsBeingProcessed: jest.fn(),
  shouldFlashLightsOfFailedUploads: jest.fn(),
  shouldRetryFailedUploadsAutomatically: jest.fn(),
}));
jest.mock('~/features/settings/selectors', () => ({
  getMaximumConcurrentUploadTaskCount: jest.fn(),
}));

import {
  createUploadError,
  getNonRetryableErrorCode,
  isNonRetryableUploadError,
  NonRetryableUploadError,
} from '~/features/upload/errors';
import { runUploadWorker } from '~/features/upload/saga';
import type MessageHub from '~/flockwave/messages';
import { uploadDroneShow, uploadGdmShow } from '~/flockwave/operations';

const SLOT_REFUSAL =
  "E_SHOW_SLOT_UNSUPPORTED: This drone's firmware is too old: it has no SHOW_SLOT_VER parameter and does not load shows from /axio/show.bin; update the firmware.";
const NO_REPLY =
  'No reply from the drone when reading SHOW_SLOT_VER; check the link and try again.';

const failingHub = (message: string) =>
  ({
    sendCommandRequest: jest
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockRejectedValue(new Error(message)),
  }) as Pick<MessageHub, 'sendCommandRequest'> as MessageHub;

describe('non-retryable server errors', () => {
  test('are recognised by their E_ code', () => {
    expect(getNonRetryableErrorCode(SLOT_REFUSAL)).toBe(
      'E_SHOW_SLOT_UNSUPPORTED'
    );
    expect(
      getNonRetryableErrorCode(
        'Failed to upload show data to UAV 7: E_ARMED: The drone is armed; disarm it before uploading a show.'
      )
    ).toBe('E_ARMED');
    expect(getNonRetryableErrorCode('E_CRC: CRC is 0x1, header says 0x2')).toBe(
      'E_CRC'
    );
    expect(getNonRetryableErrorCode(NO_REPLY)).toBeUndefined();
    expect(getNonRetryableErrorCode('Timeout')).toBeUndefined();
  });

  test('become NonRetryableUploadError, other errors stay plain', () => {
    expect(isNonRetryableUploadError(createUploadError(SLOT_REFUSAL))).toBe(
      true
    );
    expect(isNonRetryableUploadError(createUploadError(NO_REPLY))).toBe(false);
  });

  test.each([
    ['.skyc', uploadDroneShow, { uavId: '7', data: '{}' }],
    [
      '.gdm',
      uploadGdmShow,
      { uavId: '7', gdmb: '', showHash: '00'.repeat(32), config: {} },
    ],
  ])('the %s upload operation marks refusals', async (_, operation, args) => {
    const call = operation as (
      hub: MessageHub,
      args: unknown,
      options: unknown
    ) => Promise<void>;

    await expect(
      call(failingHub(SLOT_REFUSAL), args, {})
    ).rejects.toBeInstanceOf(NonRetryableUploadError);

    const retryable = call(failingHub(NO_REPLY), args, {});
    await expect(retryable).rejects.toThrow(/No reply/);
    await expect(retryable).rejects.not.toBeInstanceOf(NonRetryableUploadError);
  });
});

/**
 * Runs one job through the upload worker saga, failing its executor with the
 * given error, and returns the UAVs the worker queued for an automatic retry.
 */
function runFailingJob(error: Error): string[] {
  const failed: string[] = [];
  const worker = runUploadWorker(undefined, failed);

  worker.next(); // take(chan)
  worker.next({ executor: jest.fn(), target: '7' }); // put(started)
  worker.next(); // call(executor)
  worker.throw(error); // the executor fails; the saga asks cancelled()

  // Not cancelled: the saga records the outcome and reports the failure
  let effect = worker.next(false);
  const effects = [];
  while (!effect.done && effects.length < 10) {
    effects.push(effect.value);
    if (JSON.stringify(effect.value).includes('"TAKE"')) {
      break; // waiting for the next job
    }

    effect = worker.next();
  }

  expect(JSON.stringify(effects)).toContain('upload/_notifyUploadOnUavFailed');
  return failed;
}

describe('upload worker saga', () => {
  test('does not retry a refusal that retrying cannot fix', () => {
    expect(runFailingJob(createUploadError(SLOT_REFUSAL))).toEqual([]);
  });

  test('retries other failures', () => {
    expect(runFailingJob(createUploadError(NO_REPLY))).toEqual(['7']);
  });
});
