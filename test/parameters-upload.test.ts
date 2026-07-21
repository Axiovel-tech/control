import { describe, expect, jest, test } from '@jest/globals';
import { call } from 'redux-saga/effects';

// `~/message-hub` pulls in the entire application store and the server
// selectors sit on a similarly heavy import chain; both are stubbed with thin
// mocks (same approach as in rtls/saga.test.ts).
jest.mock('~/message-hub', () => ({
  __esModule: true,
  default: {
    execute: {
      setParameter: jest.fn(),
      setParameters: jest.fn(),
      resetUAV: jest.fn(),
    },
  },
}));
jest.mock('~/features/servers/selectors', () => ({
  __esModule: true,
  getServerVersionValidator: jest.fn(() => () => true),
}));

import spec from '~/features/parameters/upload';
import messageHub from '~/message-hub';

const runUpload = (
  items: Array<{ name: string; value: number | string; uavId?: string }>,
  { bulk }: { bulk: boolean }
) => {
  const options = {};
  const generator = (
    spec.executor as (
      job: { uavId: string; payload: { items: unknown[] } },
      options: unknown
    ) => Generator
  )({ uavId: '1', payload: { items } }, options);

  // First effect: select(supportsBulkUpload); answer it with the bulk flag.
  generator.next();
  return { generator, next: generator.next(bulk), options };
};

describe('parameter upload marshalling', () => {
  test('normalizes a negative SHOW_ORIENTATION in the bulk upload path', () => {
    const { next, generator, options } = runUpload(
      [
        // The exact live-show failure of 2026-07-21: any negative value is
        // silently treated as "show not configured" by the firmware.
        { name: 'SHOW_ORIENTATION', value: -1.4 },
        { name: 'WPNAV_SPEED', value: 500 },
      ],
      { bulk: true }
    );

    expect(next.value).toEqual(
      call(
        messageHub.execute.setParameters,
        {
          uavId: '1',
          parameters: { SHOW_ORIENTATION: 358.6, WPNAV_SPEED: 500 },
        },
        options
      )
    );
    expect(generator.next().done).toBe(true);
  });

  test('normalizes SHOW_ORIENTATION in the legacy per-parameter path', () => {
    const { next, generator } = runUpload(
      [
        { name: 'SHOW_ORIENTATION', value: '-1.4' },
        { name: 'WPNAV_SPEED', value: 500 },
      ],
      { bulk: false }
    );

    expect(next.value).toEqual(
      call(messageHub.execute.setParameter, {
        uavId: '1',
        name: 'SHOW_ORIENTATION',
        value: '358.6',
      })
    );
    // Other parameters pass through untouched.
    expect(generator.next().value).toEqual(
      call(messageHub.execute.setParameter, {
        uavId: '1',
        name: 'WPNAV_SPEED',
        value: 500,
      })
    );
    expect(generator.next().done).toBe(true);
  });

  test('leaves an in-range SHOW_ORIENTATION unchanged', () => {
    const { next, options } = runUpload(
      [{ name: 'SHOW_ORIENTATION', value: 358.6 }],
      { bulk: true }
    );

    expect(next.value).toEqual(
      call(
        messageHub.execute.setParameters,
        { uavId: '1', parameters: { SHOW_ORIENTATION: 358.6 } },
        options
      )
    );
  });
});
