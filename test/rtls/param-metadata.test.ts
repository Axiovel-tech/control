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
      for (const field of ['X', 'Y', 'Z', 'MAC']) {
        const metadata = getRtlsParamMetadata(`UWB_AN${slot}_${field}`);
        expect(metadata).toBeDefined();
        expect(metadata!.description).toContain(`${slot}`);
      }
    }

    expect(getRtlsParamMetadata('UWB_AN3_X')).toMatchObject({
      description: 'Simulation: true north position of anchor 3',
      unit: 'm',
    });
  });

  test('no device holds a per-anchor bias, and a tag no anchor table', () => {
    for (let slot = 0; slot <= 7; slot++) {
      expect(getRtlsParamMetadata(`UWB_AN${slot}_BIAS_M`)).toBeUndefined();
    }
    // what is left describes an anchor's own table, not a tag's
    expect(getRtlsParamMetadata('UWB_AN_COUNT')?.description).toMatch(
      /a tag keeps no anchor table/
    );
    expect(getRtlsParamMetadata('UWB_AN2_MAC')?.description).toMatch(
      /this anchor's table/
    );
    expect(getRtlsParamMetadata('UWB_GEOM_MODE')).toBeUndefined();
    expect(getRtlsParamMetadata('UWB_GEOM_RECAL')).toBeUndefined();
  });

  test("describes the anchor's surveyed position", () => {
    expect(getRtlsParamMetadata('UWB_LOC')?.description).toMatch(/survey ID/);
    expect(getRtlsParamMetadata('UWB_SURVEY')?.description).toMatch(
      /nothing is stored/
    );
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

describe('anchor parameter hints', () => {
  test('describe SLEEP, BAT_PROFILE, BAT_NTC and the motion watch', () => {
    expect(getRtlsParamMetadata('SLEEP')?.enumLabels).toEqual({
      0: 'awake',
      1: 'asleep',
      2: 'standby (read-only)',
    });
    expect(getRtlsParamMetadata('SLEEP')?.max).toBe(2);
    expect(getRtlsParamMetadata('BAT_PROFILE')?.enumLabels?.[0]).toBe('none');
    expect(getRtlsParamMetadata('BAT_NTC')?.max).toBe(1);
    expect(getRtlsParamMetadata('MOT_TILT_DEG')).toMatchObject({
      unit: 'deg',
      min: 0.2,
      max: 10,
      defaultValue: 0.5,
    });
    expect(getRtlsParamMetadata('MOT_KNOCK_MG')).toMatchObject({
      unit: 'mg',
      max: 984,
      defaultValue: 250,
    });
  });
});
