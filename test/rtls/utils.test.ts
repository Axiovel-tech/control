import { describe, expect, test } from '@jest/globals';

import { getRtlsDeviceListStatus } from '~/features/rtls/utils';

describe('getRtlsDeviceListStatus', () => {
  test('offline devices are red regardless of sleep state', () => {
    expect(getRtlsDeviceListStatus({ id: '1', online: false })).toBe('error');
    expect(
      getRtlsDeviceListStatus({ id: '1', online: false, sleeping: false })
    ).toBe('error');
  });

  test('an online tag is green only with an explicit sleeping: false', () => {
    expect(
      getRtlsDeviceListStatus({
        id: '1',
        online: true,
        role: 'tag',
        sleeping: false,
      })
    ).toBe('success');
  });

  test('a sleeping tag is grey', () => {
    expect(
      getRtlsDeviceListStatus({
        id: '1',
        online: true,
        role: 'tag',
        sleeping: true,
      })
    ).toBe('off');
  });

  test('an unknown sleep state renders as unknown (grey), never as awake', () => {
    // The server-side sleep latch may be stale or missing; rendering such a
    // device green inverted user intent on a live show (2026-07-21).
    expect(
      getRtlsDeviceListStatus({ id: '1', online: true, role: 'tag' })
    ).toBe('off');
    // Devices without a role are treated as sleepable, too.
    expect(getRtlsDeviceListStatus({ id: '1', online: true })).toBe('off');
  });

  test('anchors have no sleep state and stay green while online', () => {
    expect(
      getRtlsDeviceListStatus({ id: '1', online: true, role: 'anchor' })
    ).toBe('success');
  });
});
