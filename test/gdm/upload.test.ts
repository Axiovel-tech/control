import { describe, expect, jest, test } from '@jest/globals';

// `~/message-hub` pulls in the entire application store; stub it (same
// approach as in parameters-upload.test.ts).
jest.mock('~/message-hub', () => ({
  __esModule: true,
  default: {
    createCancelToken: jest.fn(() => ({ cancel: jest.fn() })),
    execute: {
      uploadDroneShow: jest
        .fn<(...args: unknown[]) => Promise<void>>()
        .mockResolvedValue(undefined),
      uploadGdmShow: jest
        .fn<(...args: unknown[]) => Promise<void>>()
        .mockResolvedValue(undefined),
    },
  },
}));

jest.mock('~/error-handling', () => ({
  errorToString: (error: unknown): string =>
    error instanceof Error ? error.message : String(error),
}));

import spec from '~/features/show/upload';
import type MessageHub from '~/flockwave/messages';
import { uploadGdmShow } from '~/flockwave/operations';
import messageHub from '~/message-hub';

const config = {
  coordinateSystem: { type: 'nwu', orientation: '0' },
  amslReference: null,
  geofence: { version: 1, enabled: true, polygons: [], rallyPoints: [] },
};

describe('show upload job', () => {
  const executor = spec.executor as (job: {
    uavId: string;
    data: unknown;
  }) => Promise<unknown>;

  test('sends a .gdm payload with __gdm_upload', async () => {
    await executor({
      uavId: '7',
      data: {
        format: 'gdm',
        gdmb: 'R0RNQg==',
        showHash: 'ab'.repeat(32),
        config,
      },
    });

    expect(messageHub.execute.uploadGdmShow).toHaveBeenCalledWith(
      { uavId: '7', gdmb: 'R0RNQg==', showHash: 'ab'.repeat(32), config },
      expect.anything()
    );
    expect(messageHub.execute.uploadDroneShow).not.toHaveBeenCalled();
  });

  test('keeps sending .skyc show specifications with __show_upload', async () => {
    const data = { trajectory: { version: 1, points: [] }, ...config };
    await executor({ uavId: '7', data });

    // The operation's declared type predates object payloads, so compare
    // the recorded call instead of matching against that signature
    expect(
      jest.mocked(messageHub.execute.uploadDroneShow).mock.calls[0]?.[0]
    ).toEqual({
      uavId: '7',
      data,
    });
    expect(messageHub.execute.uploadGdmShow).not.toHaveBeenCalled();
  });
});

describe('uploadGdmShow', () => {
  test('issues OBJ-CMD __gdm_upload with the payload, hash and config', async () => {
    const sendCommandRequest = jest.fn<(...args: unknown[]) => Promise<void>>();
    const hub = { sendCommandRequest } as Pick<
      MessageHub,
      'sendCommandRequest'
    > as MessageHub;

    await uploadGdmShow(
      hub,
      { uavId: '7', gdmb: 'R0RNQg==', showHash: 'cd'.repeat(32), config },
      {}
    );

    expect(sendCommandRequest).toHaveBeenCalledWith(
      {
        uavId: '7',
        command: '__gdm_upload',
        kwds: { gdmb: 'R0RNQg==', showHash: 'cd'.repeat(32), config },
      },
      expect.objectContaining({ timeout: 300 })
    );
  });

  test('reports which UAV failed', async () => {
    const hub = {
      sendCommandRequest: jest
        .fn<(...args: unknown[]) => Promise<void>>()
        .mockRejectedValue(
          new Error('E_SHOW_HASH: the file belongs to a different show')
        ),
    } as Pick<MessageHub, 'sendCommandRequest'> as MessageHub;

    await expect(
      uploadGdmShow(
        hub,
        { uavId: '7', gdmb: '', showHash: '00'.repeat(32), config },
        {}
      )
    ).rejects.toThrow(/E_SHOW_HASH/);
  });
});
