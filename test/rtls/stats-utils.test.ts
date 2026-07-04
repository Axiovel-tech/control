import { describe, expect, test } from '@jest/globals';

import {
  classifyRole,
  countAnchorsInMask,
  decodeAnchorMask,
  getAnchorHealth,
  getDeviceHealth,
  getDeviceHealthForRole,
  getOverallHealth,
  isAnchorRole,
  RtlsHealth,
  RtlsRole,
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

  describe('classifyRole', () => {
    test('maps numeric UWB_ROLE values', () => {
      expect(classifyRole(0)).toBe(RtlsRole.DISABLED);
      expect(classifyRole(1)).toBe(RtlsRole.TAG);
      expect(classifyRole(2)).toBe(RtlsRole.ANCHOR_INITIATOR);
      expect(classifyRole(3)).toBe(RtlsRole.ANCHOR_RESPONDER);
    });

    test('maps numeric strings and slug strings', () => {
      expect(classifyRole('2')).toBe(RtlsRole.ANCHOR_INITIATOR);
      expect(classifyRole('tag')).toBe(RtlsRole.TAG);
      expect(classifyRole('anchor-initiator')).toBe(RtlsRole.ANCHOR_INITIATOR);
      expect(classifyRole('anchor-responder')).toBe(RtlsRole.ANCHOR_RESPONDER);
    });

    test('unknown for undefined or unrecognised roles', () => {
      expect(classifyRole(undefined)).toBe(RtlsRole.UNKNOWN);
      expect(classifyRole(9)).toBe(RtlsRole.UNKNOWN);
      expect(classifyRole('beacon')).toBe(RtlsRole.UNKNOWN);
    });

    test('isAnchorRole is true only for the two anchor roles', () => {
      expect(isAnchorRole(RtlsRole.ANCHOR_INITIATOR)).toBe(true);
      expect(isAnchorRole(RtlsRole.ANCHOR_RESPONDER)).toBe(true);
      expect(isAnchorRole(RtlsRole.TAG)).toBe(false);
      expect(isAnchorRole(RtlsRole.DISABLED)).toBe(false);
      expect(isAnchorRole(RtlsRole.UNKNOWN)).toBe(false);
    });
  });

  describe('getAnchorHealth', () => {
    test('ok for an online, recently-seen anchor', () => {
      expect(getAnchorHealth({ online: true, age: 0.2 })).toBe(RtlsHealth.OK);
      expect(getAnchorHealth({ online: true })).toBe(RtlsHealth.OK);
    });

    test('error for an explicitly offline anchor', () => {
      expect(getAnchorHealth({ online: false, age: 0.1 })).toBe(
        RtlsHealth.ERROR
      );
    });

    test('error for a stale (never-recently-seen) anchor', () => {
      expect(getAnchorHealth({ online: true, age: 30 })).toBe(RtlsHealth.ERROR);
    });

    test('unknown when no liveness signal at all', () => {
      expect(getAnchorHealth(undefined)).toBe(RtlsHealth.UNKNOWN);
      expect(getAnchorHealth({})).toBe(RtlsHealth.UNKNOWN);
    });
  });

  describe('getDeviceHealthForRole', () => {
    test('anchors are judged by liveness, ignoring solve stats', () => {
      // An anchor never solves, so a zero solve rate must NOT mark it ERROR;
      // an online, fresh anchor is healthy regardless of stats.
      expect(
        getDeviceHealthForRole(
          RtlsRole.ANCHOR_RESPONDER,
          { id: '1', solveRateHz: 0 },
          { online: true, age: 0.5 }
        )
      ).toBe(RtlsHealth.OK);

      // An offline anchor is in error even if (stale) stats look fine.
      expect(
        getDeviceHealthForRole(
          RtlsRole.ANCHOR_INITIATOR,
          { id: '1', solveRateHz: 10, solvePct: 99, fixAgeMs: 10 },
          { online: false }
        )
      ).toBe(RtlsHealth.ERROR);
    });

    test('tags fall back to solve-statistics health', () => {
      expect(
        getDeviceHealthForRole(
          RtlsRole.TAG,
          { id: '1', solveRateHz: 10, solvePct: 95, fixAgeMs: 50 },
          { online: true }
        )
      ).toBe(RtlsHealth.OK);
      expect(
        getDeviceHealthForRole(
          RtlsRole.TAG,
          { id: '1', solveRateHz: 0 },
          { online: true }
        )
      ).toBe(RtlsHealth.ERROR);
    });

    test('a disabled device contributes no health signal', () => {
      expect(
        getDeviceHealthForRole(
          RtlsRole.DISABLED,
          { id: '1', solveRateHz: 0 },
          { online: false }
        )
      ).toBe(RtlsHealth.UNKNOWN);
    });

    test('unknown-role devices fall back to solve-statistics health', () => {
      expect(
        getDeviceHealthForRole(RtlsRole.UNKNOWN, undefined, undefined)
      ).toBe(RtlsHealth.UNKNOWN);
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
