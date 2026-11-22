/**
 * @file Mapping of the anchor health fields of an X-RTLS-STATS entry (and the
 * `stale` flag of a retained snapshot) into the stored stats shape. Every
 * field is optional: absent means unknown, and tags simply lack them.
 */

import {
  type RtlsChargeBlock,
  type RtlsChargingState,
  type RtlsDeviceStats,
  type RtlsPowerInput,
  type RtlsPowerState,
} from './types';
import { type AnyRecord, toNumber } from './wire-values';

/** A flag: a boolean, or a 0/1 code as the firmware sends it. */
const toBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean'
    ? value
    : typeof value === 'number' && Number.isFinite(value)
      ? value !== 0
      : undefined;

const POWER_STATES: readonly RtlsPowerState[] = [
  'booting',
  'preview',
  'standby',
  'asleep',
  'off',
  'operating',
  'stopping',
  'shutdown',
  'fault',
];
const POWER_INPUTS: readonly RtlsPowerInput[] = [
  'battery',
  'usb',
  'usb-1.5a',
  'usb-3a',
  'poe',
];
const CHARGING_STATES: readonly RtlsChargingState[] = [
  'off',
  'idle',
  'cc',
  'cv',
  'topoff',
];
const CHARGE_BLOCKS: readonly RtlsChargeBlock[] = [
  'none',
  'no-profile',
  'no-input',
  'charger',
  'gauge',
  'temperature',
  'gauge-inhibit',
  'pack-voltage',
  'charger-fault',
  'overcurrent',
  'stopping',
];

/**
 * Maps a server enum string onto one of the known values; any other string
 * (a code newer than this client) is `unknown`, a missing one `undefined`.
 */
const toEnum = <T extends string>(
  value: unknown,
  known: readonly T[]
): T | 'unknown' | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  return known.find((entry) => entry === value) ?? 'unknown';
};

/** Maps the anchor health fields of a stats entry. */
export const mapRtlsAnchorStats = (
  raw: AnyRecord
): Partial<RtlsDeviceStats> => ({
  stale: toBoolean(raw.stale),
  batteryPercent: toNumber(raw.batteryPercent),
  batteryCurrentA: toNumber(raw.batteryCurrentA),
  batteryTemperatureC: toNumber(raw.batteryTemperatureC),
  lowBattery: toBoolean(raw.lowBattery),
  batteryWarning: toBoolean(raw.batteryWarning),
  locked: toBoolean(raw.locked),
  powerState: toEnum(raw.powerState, POWER_STATES),
  powerInput: toEnum(raw.powerInput, POWER_INPUTS),
  charging: toEnum(raw.charging, CHARGING_STATES),
  chargeBlock: toEnum(raw.chargeBlock, CHARGE_BLOCKS),
  uwbStatus: toNumber(raw.uwbStatus),
  rangingRateHz: toNumber(raw.rangingRateHz),
  radioRestarts: toNumber(raw.radioRestarts),
  moved: toBoolean(raw.moved),
  tiltDeg: toNumber(raw.tiltDeg),
  knocks: toNumber(raw.knocks),
  ethernetLink: toBoolean(raw.ethernetLink),
  ethernetDrops: toNumber(raw.ethernetDrops),
  wifiTxErrors: toNumber(raw.wifiTxErrors),
  bootCount: toNumber(raw.bootCount),
  resetCause: toNumber(raw.resetCause),
});
