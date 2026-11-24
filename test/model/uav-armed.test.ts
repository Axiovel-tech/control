import { describe, expect, test } from '@jest/globals';

import UAVErrorCode from '~/flockwave/UAVErrorCode';
import UAV from '~/model/uav';

const status = (extra: Record<string, unknown>) => ({
  id: '17',
  timestamp: 1_000,
  ...extra,
});

describe("UAV-INF's armed", () => {
  test('is read beside the error codes, which keep their meaning', () => {
    const uav = new UAV('17');
    expect(uav.toJSON().armed).toBeUndefined();

    uav.handleUAVStatusInfo(
      status({ armed: true, errors: [UAVErrorCode.DISARMED] })
    );
    expect(uav.toJSON()).toMatchObject({
      armed: true,
      errors: [UAVErrorCode.DISARMED],
    });
  });

  test('follows each status, and a status without it is unknown', () => {
    const uav = new UAV('17');
    const seen = [false, true, false, undefined, 'yes', null].map((armed) => {
      uav.handleUAVStatusInfo(
        status(armed === undefined ? {} : { armed, errors: [] })
      );
      return uav.toJSON().armed;
    });
    expect(seen).toEqual([false, true, false, undefined, undefined, undefined]);
  });

  test('a change of armed alone is an update', () => {
    const uav = new UAV('17');
    uav.handleUAVStatusInfo(status({ armed: false, errors: [] }));
    expect(uav.handleUAVStatusInfo({ id: '17', armed: true } as never)).toBe(
      true
    );
    expect(uav.handleUAVStatusInfo({ id: '17', armed: true } as never)).toBe(
      false
    );
  });
});
