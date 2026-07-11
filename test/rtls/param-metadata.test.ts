import { describe, expect, test } from '@jest/globals';

import { getRtlsParamMetadata } from '~/features/rtls/param-metadata';

describe('getRtlsParamMetadata', () => {
  test('resolves exact entries', () => {
    expect(getRtlsParamMetadata('UWB_CHANNEL')).toMatchObject({
      min: 5,
      max: 9,
    });
    expect(getRtlsParamMetadata('WIFI_AP_CHAN')).toMatchObject({
      min: 1,
      max: 13,
    });
    expect(getRtlsParamMetadata('SIM_UWB_NLOS_PCT')).toMatchObject({
      unit: '%',
    });
    expect(getRtlsParamMetadata('FW_VERSION')?.description).toMatch(
      /firmware/i
    );
  });

  test('provides enum labels where the firmware value is an enum', () => {
    expect(getRtlsParamMetadata('UWB_ROLE')?.enumLabels).toEqual({
      0: 'disabled',
      1: 'tag',
      2: 'anchor-initiator',
      3: 'anchor-responder',
    });
    expect(getRtlsParamMetadata('WIFI_MODE')?.enumLabels?.[1]).toBe(
      'access point'
    );
    expect(getRtlsParamMetadata('SIM_SRC')?.enumLabels?.[2]).toBe(
      'live UWB ether'
    );
  });

  test('resolves every anchor-slot parameter through the pattern tier', () => {
    for (let slot = 0; slot <= 7; slot++) {
      for (const field of ['X', 'Y', 'Z', 'MAC', 'BIAS_M']) {
        const metadata = getRtlsParamMetadata(`UWB_AN${slot}_${field}`);
        expect(metadata).toBeDefined();
        expect(metadata!.description).toContain(`${slot}`);
      }
    }

    expect(getRtlsParamMetadata('UWB_AN3_X')).toMatchObject({
      description: 'Anchor 3 north position in the site frame',
      unit: 'm',
    });
    expect(getRtlsParamMetadata('UWB_AN7_BIAS_M')).toMatchObject({
      unit: 'm',
      min: -5,
      max: 5,
    });
  });

  test('does not match out-of-range or malformed anchor-slot names', () => {
    expect(getRtlsParamMetadata('UWB_AN8_X')).toBeUndefined();
    expect(getRtlsParamMetadata('UWB_ANX_X')).toBeUndefined();
    expect(getRtlsParamMetadata('UWB_AN0_W')).toBeUndefined();
    expect(getRtlsParamMetadata('UWB_AN0_BIAS')).toBeUndefined();
  });

  test('returns undefined for unknown parameters', () => {
    expect(getRtlsParamMetadata('TOTALLY_NEW_PARAM')).toBeUndefined();
    expect(getRtlsParamMetadata('')).toBeUndefined();
    expect(getRtlsParamMetadata('uwb_channel')).toBeUndefined();
  });
});
