import { describe, expect, test } from '@jest/globals';

import {
  countAnchorsInMask,
  decodeAnchorMask,
  getDeviceHealth,
  getOverallHealth,
  RtlsHealth,
} from '~/features/rtls/stats-utils';

describe('rtls stats-utils', () => {
  describe('getDeviceHealth', () => {
    test('unknown when no stats at all', () => {
      expect(getDeviceHealth(undefined)).toBe(RtlsHealth.UNKNOWN);
      expect(getDeviceHealth({ id: '1' })).toBe(RtlsHealth.UNKNOWN);
    });

    test('ok for a fast, fresh, high-percentage fix', () => {
      expect(
        getDeviceHealth({
          id: '1',
          solveRateHz: 10,
          solvePct: 95,
          fixAgeMs: 50,
        })
      ).toBe(RtlsHealth.OK);
    });

    test('warning for a stale fix', () => {
      expect(
        getDeviceHealth({
          id: '1',
          solveRateHz: 10,
          solvePct: 95,
          fixAgeMs: 2000,
        })
      ).toBe(RtlsHealth.WARNING);
    });

    test('warning for a low solve rate or percentage', () => {
      expect(
        getDeviceHealth({ id: '1', solveRateHz: 0.5, fixAgeMs: 10 })
      ).toBe(RtlsHealth.WARNING);
      expect(getDeviceHealth({ id: '1', solvePct: 20, fixAgeMs: 10 })).toBe(
        RtlsHealth.WARNING
      );
    });

    test('error for a zero solve rate or a very stale fix', () => {
      expect(getDeviceHealth({ id: '1', solveRateHz: 0 })).toBe(
        RtlsHealth.ERROR
      );
      expect(getDeviceHealth({ id: '1', fixAgeMs: 60000 })).toBe(
        RtlsHealth.ERROR
      );
    });
  });

  describe('getOverallHealth', () => {
    test('unknown for an empty list', () => {
      expect(getOverallHealth([])).toBe(RtlsHealth.UNKNOWN);
    });

    test('worst case dominates', () => {
      expect(getOverallHealth([RtlsHealth.OK, RtlsHealth.WARNING])).toBe(
        RtlsHealth.WARNING
      );
      expect(
        getOverallHealth([RtlsHealth.OK, RtlsHealth.WARNING, RtlsHealth.ERROR])
      ).toBe(RtlsHealth.ERROR);
      expect(getOverallHealth([RtlsHealth.OK, RtlsHealth.OK])).toBe(
        RtlsHealth.OK
      );
      expect(getOverallHealth([RtlsHealth.UNKNOWN])).toBe(RtlsHealth.UNKNOWN);
    });
  });

  describe('decodeAnchorMask', () => {
    test('decodes bits LSB-first', () => {
      // 0b1011 = anchors 0, 1, 3 present
      expect(decodeAnchorMask(0b1011)).toEqual([true, true, false, true]);
    });

    test('respects an explicit count', () => {
      expect(decodeAnchorMask(0b1, 4)).toEqual([true, false, false, false]);
    });

    test('returns an empty array for undefined/invalid masks', () => {
      expect(decodeAnchorMask(undefined)).toEqual([]);
      expect(decodeAnchorMask(-1)).toEqual([]);
      expect(decodeAnchorMask(0)).toEqual([]);
    });
  });

  describe('countAnchorsInMask', () => {
    test('counts set bits', () => {
      expect(countAnchorsInMask(0b1011)).toBe(3);
      expect(countAnchorsInMask(0)).toBe(0);
      expect(countAnchorsInMask(undefined)).toBe(0);
    });
  });
});
