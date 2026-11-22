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

import { mapAnchorLock } from './anchor-lock';
import { mapCellSettings, mapCellState } from './cell-settings';
import {
  setRtlsAnchorLock,
  setRtlsCellSettings,
  setRtlsAnchors,
  setRtlsDevicesFromStatus,
  setRtlsOtaJob,
  updateRtlsPositions,
  updateRtlsStats,
} from './slice';
import { mapRtlsAnchorStats } from './handlers-anchor';
import {
  type RtlsAnchor,
  type RtlsDevice,
  type RtlsDeviceStats,
  type RtlsFlightController,
  type RtlsOtaJob,
  type RtlsPosEstimate,
  type RtlsTwrPeer,
} from './types';
import { type AnyRecord, toNumber, toText } from './wire-values';

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
      madM: toNumber(row.madM),
      count: toNumber(row.count),
    };
  });
};

const toSystemId = (value: unknown): number | undefined =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 255
    ? value
    : undefined;

/**
 * Maps the tag's flight-controller claim (X-RTLS-INF `flightController`). A
 * live or remembered claim needs a valid MAVLink system id; an ambiguous one
 * is kept without it. Anything else yields `undefined`.
 */
const mapFlightController = (
  value: unknown
): RtlsFlightController | undefined => {
  const { reason, state, systemId: rawSystemId } = (value ?? {}) as AnyRecord;
  const systemId = toSystemId(rawSystemId);
  if (state === 'ambiguous') {
    return { state, systemId, reason: toText(reason) };
  }
  if ((state === 'live' || state === 'remembered') && systemId !== undefined) {
    return { state, systemId };
  }
  return undefined;
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

  const name = toText(raw.name);
  if (name !== undefined) {
    result.name = name;
  }

  const role = toText(raw.role);
  if (role !== undefined) {
    result.role = role;
  }

  // Always assigned: the device update merges per-field, and a stale cell
  // would name a tag's flagged anchors from the wrong anchor table.
  result.cell = toText(raw.cell);

  const address = toText(raw.address);
  if (address !== undefined) {
    result.address = address;
  }

  const age = toNumber(raw.age);
  if (age !== undefined) {
    result.age = age;
  }

  const firmwareVersion = toText(raw.firmwareVersion);
  if (firmwareVersion !== undefined) {
    result.firmwareVersion = firmwareVersion;
  }

  const uptimeMs = toNumber(raw.uptimeMs);
  if (uptimeMs !== undefined) {
    result.uptimeMs = uptimeMs;
  }

  const paramCount = toNumber(raw.paramCount);
  if (paramCount !== undefined) {
    result.paramCount = paramCount;
  }

  const otaStatus = toText(raw.otaStatus);
  if (otaStatus !== undefined) {
    result.otaStatus = otaStatus;
  }

  // Always assigned (undefined when the server does not know): the device
  // update merges per-field, so omitting the key would let a stale
  // `sleeping: true` outlive a snapshot that no longer reports it.
  result.sleeping =
    typeof raw.sleeping === 'boolean' ? raw.sleeping : undefined;

  // Always assigned for the same reason: the server clears the tag's
  // flight-controller claim and the drone it names by dropping the keys, and
  // a stale pairing that outlives the snapshot would mis-attribute the tag.
  result.uav = toText(raw.uav);
  result.flightController = mapFlightController(raw.flightController);

  // Always assigned: a device that rebooted (or was rediscovered) must not
  // keep a pre-reboot measurement the server no longer reports.
  result.twr = mapTwrPeers(raw.twr);

  // Always assigned: the server drops both while the device is offline
  result.cellSettings = mapCellState(raw.cellSettings);
  result.cellSettingsDetail = toText(raw.cellSettingsDetail);

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
/**
 * Maps the server's site-level anchor list (X-RTLS-INF `anchors`) into the
 * shape stored in the Redux state. Entries without a stable id are dropped;
 * non-array input yields an empty list.
 */
export function mapRtlsAnchors(value: unknown): RtlsAnchor[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: RtlsAnchor[] = [];
  for (const raw of value) {
    const row = (raw ?? {}) as AnyRecord;
    const id = toText(row.id);
    if (id === undefined) {
      continue;
    }

    const ned = (row.ned ?? {}) as AnyRecord;
    result.push({
      id,
      cell: toText(row.cell),
      index: toNumber(row.index),
      mac: toNumber(row.mac),
      ned: {
        north: toNumber(ned.north),
        east: toNumber(ned.east),
        down: toNumber(ned.down),
      },
      active: typeof row.active === 'boolean' ? row.active : undefined,
      systemId: toNumber(row.systemId),
    });
  }

  return result;
}

type RtlsInformationAction = ReturnType<
  | typeof setRtlsDevicesFromStatus
  | typeof setRtlsAnchors
  | typeof setRtlsAnchorLock
  | typeof setRtlsCellSettings
>;

/**
 * The actions an X-RTLS-INF body (pushed, answered, or polled by the saga)
 * applies: the device registry wholesale, then the site anchor list and the
 * anchor lock when the body carries them.
 */
export function rtlsInformationActions(
  body: AnyRecord
): RtlsInformationAction[] {
  const status = body?.status as Record<string, AnyRecord> | undefined;
  const actions: RtlsInformationAction[] = [
    setRtlsDevicesFromStatus(buildRtlsDeviceStatusMap(status)),
  ];
  // Only an explicit anchor list may replace the stored one: an X-RTLS-INF
  // from a server that predates the anchors field must not wipe the
  // configured cell geometry off the debug position view.
  if (Array.isArray(body?.anchors)) {
    actions.push(setRtlsAnchors(mapRtlsAnchors(body.anchors)));
  }
  // Likewise only an explicit lock state replaces the stored one
  const lock = mapAnchorLock(body?.anchorLock);
  if (lock !== undefined) {
    actions.push(setRtlsAnchorLock(lock));
  }
  const cell = mapCellSettings(body?.cellSettings);
  if (cell !== undefined) {
    actions.push(setRtlsCellSettings(cell));
  }
  return actions;
}

export function handleRtlsInformationMessage(
  body: AnyRecord,
  dispatch: AppDispatch
): void {
  for (const action of rtlsInformationActions(body)) {
    dispatch(action);
  }
}

/**
 * Maps a single per-device stats object from the server into the shape stored
 * in the Redux state.
 */
export function mapRtlsDeviceStats(
  id: string,
  raw: AnyRecord
): RtlsDeviceStats {
  return {
    id,
    batteryVoltage: toNumber(raw.batteryVoltage),
    solveRateHz: toNumber(raw.solveRateHz),
    solvePct: toNumber(raw.solvePct),
    anchorsSeen: toNumber(raw.anchorsSeen),
    fixAgeMs: toNumber(raw.fixAgeMs),
    clockPpm: toNumber(raw.clockPpm),
    anchorMask: toNumber(raw.anchorMask),
    geometryState: toNumber(raw.geometryState),
    geometryReason: toNumber(raw.geometryReason),
    geometryResidualM: toNumber(raw.geometryResidualM),
    geometryDriftM: toNumber(raw.geometryDriftM),
    geometryDistancesM: Array.isArray(raw.geometryDistancesM)
      ? raw.geometryDistancesM.map((value: unknown) => toNumber(value) ?? null)
      : undefined,
    uwbRssiDbm: toNumber(raw.uwbRssiDbm),
    nlosMask: toNumber(raw.nlosMask),
    outvotedMask: toNumber(raw.outvotedMask),
    residualRmsM: toNumber(raw.residualRmsM),
    wifiRssiDbm: toNumber(raw.wifiRssiDbm),
    wifiDisconnects: toNumber(raw.wifiDisconnects),
    imuTemperaturesC: Array.isArray(raw.imuTemperaturesC)
      ? raw.imuTemperaturesC.map((value: unknown) => toNumber(value) ?? null)
      : undefined,
    ...mapRtlsAnchorStats(raw),
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

/**
 * Maps a single per-device position estimate from an X-RTLS-POS body into the
 * shape stored in the Redux state. `receivedAt` is stamped client-side from
 * `now`, corrected by the server-reported age of the estimate, so staleness
 * fading works for both live notifications and query responses answered from
 * the server's cache.
 */
export function mapRtlsPosEstimate(
  id: string,
  raw: AnyRecord,
  now: number
): RtlsPosEstimate {
  return {
    id,
    north: toNumber(raw.north),
    east: toNumber(raw.east),
    down: toNumber(raw.down),
    sigma: toNumber(raw.sigma),
    timeBootMs: toNumber(raw.timeBootMs),
    receivedAt: now - (toNumber(raw.ageMs) ?? 0),
  };
}

/**
 * Builds the position mapping consumed by `updateRtlsPositions` from the
 * `positions` field of an X-RTLS-POS message body.
 */
export function buildRtlsPositionsMap(
  positions: Record<string, AnyRecord> | undefined,
  now: number
): Record<string, RtlsPosEstimate> {
  const byId: Record<string, RtlsPosEstimate> = {};
  if (positions && typeof positions === 'object') {
    for (const [id, raw] of Object.entries(positions)) {
      byId[id] = mapRtlsPosEstimate(id, raw ?? {}, now);
    }
  }

  return byId;
}

/**
 * Handles an X-RTLS-POS message (response or notification) by merging the
 * carried position estimates into the per-device store.
 */
export function handleRtlsPositionMessage(
  body: AnyRecord,
  dispatch: AppDispatch
): void {
  const positions = body?.positions as Record<string, AnyRecord> | undefined;
  dispatch(
    updateRtlsPositions({
      byId: buildRtlsPositionsMap(positions, Date.now()),
    })
  );
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
    id: toText(raw.id),
    image: toText(raw.image),
    status: toText(raw.status),
    progress: toNumber(raw.progress),
    version: toText(raw.version),
    error: toText(raw.error),
    species: toText(raw.species),
    speciesSource: toText(raw.speciesSource),
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
  const id = toText(body?.id);
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
