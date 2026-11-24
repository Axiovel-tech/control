import { describe, expect, test } from '@jest/globals';

import {
  mapRtlsDeviceStats,
  mapRtlsDeviceStatus,
  mapRtlsOtaJob,
} from '~/features/rtls/handlers';

describe('anchor health fields', () => {
  test('maps every anchor stat the server forwards', () => {
    expect(
      mapRtlsDeviceStats('101', {
        batteryVoltage: 3.92,
        batteryPercent: 81,
        batteryCurrentA: 0.12,
        batteryTemperatureC: 24.5,
        lowBattery: false,
        powerState: 'operating',
        powerInput: 'usb-3a',
        charging: 'cc',
        chargeBlock: 'none',
        uwbStatus: 1,
        rangingRateHz: 9.8,
        radioRestarts: 0,
        moved: true,
        tiltDeg: 0.7,
        knocks: 2,
        ethernetLink: true,
        ethernetDrops: 1,
        wifiRssiDbm: -61,
        wifiDisconnects: 0,
        wifiTxErrors: 3,
        bootCount: 12,
        resetCause: 2,
      })
    ).toEqual({
      id: '101',
      batteryVoltage: 3.92,
      batteryPercent: 81,
      batteryCurrentA: 0.12,
      batteryTemperatureC: 24.5,
      lowBattery: false,
      powerState: 'operating',
      powerInput: 'usb-3a',
      charging: 'cc',
      chargeBlock: 'none',
      uwbStatus: 1,
      rangingRateHz: 9.8,
      radioRestarts: 0,
      moved: true,
      tiltDeg: 0.7,
      knocks: 2,
      ethernetLink: true,
      ethernetDrops: 1,
      wifiRssiDbm: -61,
      wifiDisconnects: 0,
      wifiTxErrors: 3,
      bootCount: 12,
      resetCause: 2,
    });
  });

  test('omits what the server omits, so tags keep working', () => {
    const stats = mapRtlsDeviceStats('7', { solveRateHz: 10 });
    expect(stats.powerState).toBeUndefined();
    expect(stats.batteryPercent).toBeUndefined();
    expect(stats.lowBattery).toBeUndefined();
    expect(stats.solveRateHz).toBe(10);
  });

  test('maps a code newer than this client to unknown', () => {
    const stats = mapRtlsDeviceStats('101', {
      powerState: 'hibernating',
      powerInput: 'solar',
      charging: 'pulse',
      chargeBlock: 'moon-phase',
    });
    expect(stats).toMatchObject({
      powerState: 'unknown',
      powerInput: 'unknown',
      charging: 'unknown',
      chargeBlock: 'unknown',
    });
  });

  test('accepts 0/1 codes for flags and drops non-finite numbers', () => {
    const stats = mapRtlsDeviceStats('101', {
      moved: 1,
      lowBattery: 0,
      ethernetLink: 'yes',
      batteryPercent: Number.NaN,
    });
    expect(stats.moved).toBe(true);
    expect(stats.lowBattery).toBe(false);
    expect(stats.ethernetLink).toBeUndefined();
    expect(stats.batteryPercent).toBeUndefined();
  });

  test('maps the battery warning flag', () => {
    expect(
      mapRtlsDeviceStats('101', { batteryWarning: true }).batteryWarning
    ).toBe(true);
    expect(mapRtlsDeviceStats('7', {}).batteryWarning).toBe(undefined);
  });

  test('marks the retained snapshot of a lost device as stale', () => {
    expect(mapRtlsDeviceStats('101', { stale: true }).stale).toBe(true);
  });
});

describe('lost devices and TWR summaries in X-RTLS-INF', () => {
  test('keeps a lost device with its age since last heard', () => {
    const device = mapRtlsDeviceStatus('101', { online: false, age: 42.5 });
    expect(device.online).toBe(false);
    expect(device.age).toBe(42.5);
  });

  test('maps the spread and count of a TWR summary', () => {
    const device = mapRtlsDeviceStatus('102', {
      twr: [
        { peerMac: 1, distanceM: 14.1, ageMs: 200, madM: 0.02, count: 37 },
        { peerMac: 3, distanceM: 9.5, ageMs: 100 },
      ],
    });
    expect(device.twr).toEqual([
      { peerMac: 1, distanceM: 14.1, ageMs: 200, madM: 0.02, count: 37 },
      { peerMac: 3, distanceM: 9.5, ageMs: 100 },
    ]);
  });

  test('clears the TWR rows when the server omits them', () => {
    // a rediscovered (rebooted) anchor must not keep a pre-reboot distance
    expect(mapRtlsDeviceStatus('102', { online: true })).toHaveProperty(
      'twr',
      undefined
    );
  });
});

describe('OTA job species', () => {
  test('maps the species the server established and its source', () => {
    expect(
      mapRtlsOtaJob({
        status: 'running',
        species: 'anchor',
        speciesSource: 'receipt',
      })
    ).toMatchObject({ species: 'anchor', speciesSource: 'receipt' });
  });
});
