import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('~/error-handling', () => ({
  errorToString: (error: unknown): string =>
    error instanceof Error ? error.message : String(error),
}));

import type MessageHub from '~/flockwave/messages';
import { getShowRTHPlanHolders, startShowRTH } from '~/flockwave/operations';

const respond = (body: Record<string, unknown>) => ({
  '$fw.version': '1.0',
  id: 'response',
  body,
});

// The real hub imports ESM-only packages that the jest transform skips. The
// operations need only these two methods; the fake response processing
// follows the synchronous part of the real one (`result` and `error` maps).
type FakeResponse = { body: Record<string, unknown> };
const sendMessage =
  jest.fn<(body: unknown, options?: unknown) => Promise<FakeResponse>>();
const hub = {
  sendMessage,
  _processMultiAsyncOperationResponse({ body }: FakeResponse) {
    const results: Record<string, unknown> = {
      ...(body.result as Record<string, unknown>),
    };
    for (const [id, reason] of Object.entries(
      (body.error as Record<string, string> | undefined) ?? {}
    )) {
      results[id] = new Error(reason);
    }
    return Promise.resolve(results);
  },
} as unknown as MessageHub;

beforeEach(() => {
  sendMessage.mockReset();
});

describe('getShowRTHPlanHolders', () => {
  test('returns the drones that hold a plan', async () => {
    sendMessage.mockResolvedValueOnce(
      respond({ type: 'X-SHOW-RTH-INF', ids: ['01', '02'] })
    );

    await expect(getShowRTHPlanHolders(hub)).resolves.toEqual(['01', '02']);
    expect(sendMessage).toHaveBeenCalledWith(
      { type: 'X-SHOW-RTH-INF' },
      { timeout: 2 }
    );
  });

  test('treats a server that does not know the request as having no plan', async () => {
    sendMessage.mockResolvedValueOnce(
      respond({ type: 'ACK-NAK', reason: 'No handler' })
    );

    await expect(getShowRTHPlanHolders(hub)).resolves.toEqual([]);
  });

  test('rejects a malformed response', async () => {
    sendMessage.mockResolvedValueOnce(
      respond({ type: 'X-SHOW-RTH-INF', ids: [1] })
    );

    await expect(getShowRTHPlanHolders(hub)).rejects.toThrow('Invalid');
  });

  test('propagates a timeout', async () => {
    sendMessage.mockRejectedValueOnce(new Error('timed out'));

    await expect(getShowRTHPlanHolders(hub)).rejects.toThrow('timed out');
  });
});

describe('startShowRTH', () => {
  test('sends the target and splits per-drone results', async () => {
    sendMessage.mockResolvedValueOnce(
      respond({
        type: 'X-SHOW-RTH',
        branchTimeUs: 42_000_000,
        result: { '01': null, '02': null },
        error: { '03': 'No certified RTH plan on this drone' },
      })
    );

    await expect(
      startShowRTH(hub, { ids: ['01', '02', '03'] })
    ).resolves.toEqual({
      branchTimeUs: 42_000_000,
      succeeded: ['01', '02'],
      failures: { '03': 'No certified RTH plan on this drone' },
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'X-SHOW-RTH',
      ids: ['01', '02', '03'],
    });
  });

  test('sends return all', async () => {
    sendMessage.mockResolvedValueOnce(
      respond({ type: 'X-SHOW-RTH', branchTimeUs: 2_000_000, result: {} })
    );

    await startShowRTH(hub, { all: true });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'X-SHOW-RTH', all: true });
  });

  test('rejects with the reason when the server refuses', async () => {
    sendMessage.mockResolvedValueOnce(
      respond({ type: 'ACK-NAK', reason: 'The show is not running' })
    );

    await expect(startShowRTH(hub, { all: true })).rejects.toThrow(
      'RTH refused: The show is not running'
    );
  });

  test('rejects a response without an integer branch time', async () => {
    sendMessage.mockResolvedValueOnce(
      respond({ type: 'X-SHOW-RTH', branchTimeUs: 1.5, result: {} })
    );

    await expect(startShowRTH(hub, { all: true })).rejects.toThrow('Invalid');
  });
});
