/**
 * @file Handlers that translate incoming X-RTLS-* Flockwave messages (both
 * responses and pushed notifications) into Redux actions.
 *
 * These functions are deliberately pure with respect to the message body: they
 * take a raw message body and a dispatch function, and contain no I/O of their
 * own. This keeps them straightforward to unit-test.
 */

import isNil from 'lodash-es/isNil';

import { type AppDispatch } from '~/store/reducers';

import {
  setRtlsDevicesFromStatus,
  setRtlsOtaJob,
  replaceShowSyncStatus,
  updateRtlsStats,
  updateShowSyncStatus,
} from './slice';
import {
  type RtlsDevice,
  type RtlsDeviceStats,
  type RtlsOtaJob,
  type RtlsTwrPeer,
  type ShowSyncStatus,
} from './types';

type AnyRecord = Record<string, unknown>;

const toNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const toString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const toBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

/**
 * Maps the server's inter-anchor TWR list (X-RTLS-INF `twr`) into the device
 * shape. Each row is `{peerMac, distanceM, ageMs}`; non-array or empty input
 * yields `undefined` so the field is simply omitted.
 */
const mapTwrPeers = (value: unknown): RtlsTwrPeer[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  return value.map((raw) => {
    const row = (raw ?? {}) as AnyRecord;
    return {
      peerMac: toNumber(row.peerMac),
      distanceM: toNumber(row.distanceM),
      ageMs: toNumber(row.ageMs),
    };
  });
};

/**
 * Maps a single device status object from the server into the shape stored in
 * the Redux state. Unknown/absent fields are simply omitted.
 */
export function mapRtlsDeviceStatus(
  id: string,
  raw: AnyRecord
): Omit<RtlsDevice, 'id'> {
  const online =
    typeof raw.online === 'boolean'
      ? raw.online
      : // If the server does not provide an explicit `online` flag, treat a
        // small reported age as "online" when available.
        isNil(raw.age)
        ? true
        : Number(raw.age) < 30;

  const result: Omit<RtlsDevice, 'id'> = { online };

  const name = toString(raw.name);
  if (name !== undefined) {
    result.name = name;
  }

  const role = toString(raw.role);
  if (role !== undefined) {
    result.role = role;
  }

  const address = toString(raw.address);
  if (address !== undefined) {
    result.address = address;
  }

  const age = toNumber(raw.age);
  if (age !== undefined) {
    result.age = age;
  }

  const firmwareVersion = toString(raw.firmwareVersion);
  if (firmwareVersion !== undefined) {
    result.firmwareVersion = firmwareVersion;
  }

  const paramCount = toNumber(raw.paramCount);
  if (paramCount !== undefined) {
    result.paramCount = paramCount;
  }

  const otaStatus = toString(raw.otaStatus);
  if (otaStatus !== undefined) {
    result.otaStatus = otaStatus;
  }

  // Always assigned (undefined when the server does not know): the device
  // update merges per-field, so omitting the key would let a stale
  // `sleeping: true` outlive a snapshot that no longer reports it.
  result.sleeping =
    typeof raw.sleeping === 'boolean' ? raw.sleeping : undefined;

  const twr = mapTwrPeers(raw.twr);
  if (twr !== undefined) {
    result.twr = twr;
  }

  return result;
}

/**
 * Builds the device-status mapping consumed by `setRtlsDevicesFromStatus` from
 * the `status` field of an X-RTLS-INF message body.
 */
export function buildRtlsDeviceStatusMap(
  status: Record<string, AnyRecord> | undefined
): Record<string, Omit<RtlsDevice, 'id'>> {
  const result: Record<string, Omit<RtlsDevice, 'id'>> = {};
  if (status && typeof status === 'object') {
    for (const [id, raw] of Object.entries(status)) {
      result[id] = mapRtlsDeviceStatus(id, raw ?? {});
    }
  }

  return result;
}

/**
 * Handles an X-RTLS-INF message (response or notification) by updating the RTLS
 * device registry wholesale from the `status` mapping.
 */
export function handleRtlsInformationMessage(
  body: AnyRecord,
  dispatch: AppDispatch
): void {
  const status = body?.status as Record<string, AnyRecord> | undefined;
  dispatch(setRtlsDevicesFromStatus(buildRtlsDeviceStatusMap(status)));
}

/**
 * Maps a single per-device stats object from the server into the shape stored
 * in the Redux state.
 */
export function mapRtlsDeviceStats(
  id: string,
  raw: AnyRecord
): RtlsDeviceStats {
  const rawShowSync =
    raw.showSync && typeof raw.showSync === 'object'
      ? (raw.showSync as AnyRecord)
      : undefined;
  const showSync = rawShowSync
    ? {
        ltcLocked: toBoolean(rawShowSync.ltcLocked),
        deadlineValid: toBoolean(rawShowSync.deadlineValid),
        generation: toNumber(rawShowSync.generation),
        secondsToStart: toNumber(rawShowSync.secondsToStart),
      }
    : undefined;

  return {
    id,
    batteryVoltage: toNumber(raw.batteryVoltage),
    solveRateHz: toNumber(raw.solveRateHz),
    solvePct: toNumber(raw.solvePct),
    anchorsSeen: toNumber(raw.anchorsSeen),
    fixAgeMs: toNumber(raw.fixAgeMs),
    clockPpm: toNumber(raw.clockPpm),
    anchorMask: toNumber(raw.anchorMask),
    showSync,
  };
}

/**
 * Builds the stats mapping consumed by `updateRtlsStats` from the `stats` field
 * of an X-RTLS-STATS message body.
 */
export function buildRtlsStatsMap(
  stats: Record<string, AnyRecord> | undefined
): Record<string, RtlsDeviceStats> {
  const byId: Record<string, RtlsDeviceStats> = {};
  if (stats && typeof stats === 'object') {
    for (const [id, raw] of Object.entries(stats)) {
      byId[id] = mapRtlsDeviceStats(id, raw ?? {});
    }
  }

  return byId;
}

/**
 * Handles an X-RTLS-STATS message (response or notification) by replacing the
 * live statistics wholesale.
 */
export function handleRtlsStatsMessage(
  body: AnyRecord,
  dispatch: AppDispatch
): void {
  const stats = body?.stats as Record<string, AnyRecord> | undefined;
  dispatch(
    updateRtlsStats({
      byId: buildRtlsStatsMap(stats),
      lastUpdatedAt: Date.now(),
    })
  );
}

/** Handles an X-SHOW-SYNC query response or one-UAV notification. */
export function handleShowSyncMessage(
  body: AnyRecord,
  dispatch: AppDispatch,
  { replace = false }: { replace?: boolean } = {}
): void {
  const rawStatus = body?.status;
  if (!rawStatus || typeof rawStatus !== 'object') {
    return;
  }
  const byId: Record<string, ShowSyncStatus | null> = {};
  for (const [id, raw] of Object.entries(
    rawStatus as Record<string, AnyRecord | null>
  )) {
    if (raw === null) {
      byId[id] = null;
      continue;
    }
    if (typeof raw !== 'object') {
      continue;
    }
    const source = raw.source;
    if (source !== 'none' && source !== 'rc' && source !== 'uwb-ltc') {
      continue;
    }
    byId[id] = {
      source,
      locked: raw.locked === true,
      committed: raw.committed === true,
      scheduled: raw.scheduled === true,
      secondsToStart: toNumber(raw.secondsToStart),
    };
  }
  if (replace) {
    const snapshot = Object.fromEntries(
      Object.entries(byId).filter(
        (entry): entry is [string, ShowSyncStatus] => entry[1] !== null
      )
    );
    dispatch(replaceShowSyncStatus(snapshot));
  } else {
    dispatch(updateShowSyncStatus(byId));
  }
}

/**
 * Maps a single OTA job object from the server into the shape stored in the
 * Redux state.
 */
export function mapRtlsOtaJob(raw: AnyRecord | undefined): RtlsOtaJob {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  return {
    id: toString(raw.id),
    image: toString(raw.image),
    status: toString(raw.status),
    progress: toNumber(raw.progress),
    version: toString(raw.version),
    error: toString(raw.error),
  };
}

/**
 * Handles an X-RTLS-OTA message (response or notification) by recording the
 * latest OTA job state for the device named in the message body.
 */
export function handleRtlsOtaMessage(
  body: AnyRecord,
  dispatch: AppDispatch
): void {
  const id = toString(body?.id);
  if (id === undefined) {
    return;
  }

  dispatch(
    setRtlsOtaJob({
      id,
      job: mapRtlsOtaJob(body?.job as AnyRecord | undefined),
    })
  );
}
