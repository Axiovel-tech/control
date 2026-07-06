import { describe, expect, test } from '@jest/globals';

import {
  getRtlsParamGroup,
  getRtlsParamGroupLabel,
  groupRtlsParams,
  matchesRtlsParamFilter,
} from '~/features/rtls/param-grouping';
import { type RtlsParam } from '~/features/rtls/types';

const param = (name: string): RtlsParam => ({
  name,
  value: 0,
  type: 'uint8',
});

describe('getRtlsParamGroup', () => {
  test('takes the token before the first underscore', () => {
    expect(getRtlsParamGroup('UWB_CHANNEL')).toBe('UWB');
    expect(getRtlsParamGroup('WIFI_STA_SSID')).toBe('WIFI');
    expect(getRtlsParamGroup('ORIGIN_LAT_E7')).toBe('ORIGIN');
  });

  test('keeps multi-token names in the first-token group', () => {
    // Not 'UWB_AN' / 'SIM_UWB' — grouping splits on the FIRST underscore.
    expect(getRtlsParamGroup('UWB_AN_COUNT')).toBe('UWB');
    expect(getRtlsParamGroup('UWB_AN0_X')).toBe('UWB');
    expect(getRtlsParamGroup('SIM_UWB_DROP_PCT')).toBe('SIM');
  });

  test('names without an underscore group under themselves', () => {
    expect(getRtlsParamGroup('WEIRD')).toBe('WEIRD');
    expect(getRtlsParamGroup('_LEADING')).toBe('_LEADING');
  });
});

describe('getRtlsParamGroupLabel', () => {
  test('labels known groups and falls back to the raw prefix', () => {
    expect(getRtlsParamGroupLabel('UWB')).toBe('UWB ranging');
    expect(getRtlsParamGroupLabel('SIM')).toBe('Simulation');
    expect(getRtlsParamGroupLabel('NEWGRP')).toBe('NEWGRP');
  });
});

describe('groupRtlsParams', () => {
  test('orders known groups by the fixed order, unknown ones last', () => {
    const groups = groupRtlsParams([
      param('SIM_LAT_MS'),
      param('ZED_THING'),
      param('WIFI_MODE'),
      param('UWB_CHANNEL'),
      param('ALPHA_THING'),
      param('MAV_SYS_ID'),
    ]);
    expect(groups.map((g) => g.key)).toEqual([
      'UWB',
      'WIFI',
      'MAV',
      'SIM',
      'ALPHA',
      'ZED',
    ]);
  });

  test('preserves device order within a group', () => {
    const groups = groupRtlsParams([
      param('UWB_MAC'),
      param('WIFI_MODE'),
      param('UWB_CHANNEL'),
      param('UWB_AN0_X'),
    ]);
    expect(groups[0]!.params.map((p) => p.name)).toEqual([
      'UWB_MAC',
      'UWB_CHANNEL',
      'UWB_AN0_X',
    ]);
  });

  test('returns an empty list for no parameters', () => {
    expect(groupRtlsParams([])).toEqual([]);
  });
});

describe('matchesRtlsParamFilter', () => {
  test('matches the name case-insensitively', () => {
    expect(matchesRtlsParamFilter(param('UWB_CHANNEL'), 'chan')).toBe(true);
    expect(matchesRtlsParamFilter(param('UWB_CHANNEL'), 'CHAN')).toBe(true);
    expect(matchesRtlsParamFilter(param('UWB_CHANNEL'), 'wifi')).toBe(false);
  });

  test('matches the static metadata description', () => {
    // 'passphrase' appears only in WIFI_AP_PSK's description, not its name.
    expect(matchesRtlsParamFilter(param('WIFI_AP_PSK'), 'passphrase')).toBe(
      true
    );
    expect(matchesRtlsParamFilter(param('UWB_CHANNEL'), 'passphrase')).toBe(
      false
    );
  });

  test('unknown params match on name only, without crashing', () => {
    expect(matchesRtlsParamFilter(param('NEW_PARAM'), 'new')).toBe(true);
    expect(matchesRtlsParamFilter(param('NEW_PARAM'), 'zzz')).toBe(false);
  });

  test('empty or whitespace-only queries match everything', () => {
    expect(matchesRtlsParamFilter(param('UWB_CHANNEL'), '')).toBe(true);
    expect(matchesRtlsParamFilter(param('UWB_CHANNEL'), '   ')).toBe(true);
  });
});
