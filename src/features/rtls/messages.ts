/**
 * @file Promise-based helpers for the X-RTLS-* Flockwave message family.
 *
 * These are kept inside the RTLS feature (rather than in the global
 * flockwave/queries + flockwave/operations modules) because the X-RTLS-*
 * messages are not part of the shared Flockwave spec and have their own,
 * simpler request/response shapes. Each helper takes the message hub as its
 * first argument, mirroring the convention used elsewhere.
 */

import { errorToString } from '~/error-handling';
import type MessageHub from '~/flockwave/messages';
import { type Message, type MessageBody } from '~/flockwave/types';

import {
  mapAnchorLock,
  mapLockIssues,
  type RtlsAnchorLock,
  type RtlsLockIssue,
} from './anchor-lock';
import {
  type RtlsOtaJob,
  type RtlsParam,
  type RtlsParamType,
  type RtlsParamValue,
} from './types';

type AnyMessageBody = MessageBody & Record<string, unknown>;

/**
 * Asserts that the response body has the expected type, throwing a descriptive
 * error (using the ACK-NAK reason if present) otherwise.
 */
function ensureResponseType(
  body: AnyMessageBody | undefined,
  expectedType: string
): AnyMessageBody {
  if (!body || typeof body !== 'object') {
    throw new Error(`Empty response, expected ${expectedType}`);
  }

  if (body.type !== expectedType) {
    const reason =
      typeof body.reason === 'string' ? body.reason : `got ${body.type}`;
    throw new Error(`Expected ${expectedType} response (${reason})`);
  }

  return body;
}

/**
 * Requests the current RTLS device inventory (an X-RTLS-INF status snapshot).
 * Returns the raw message body; servers without the RTLS extension make this
 * throw (ACK-NAK response).
 */
export async function queryRtlsInformation(
  hub: MessageHub
): Promise<AnyMessageBody> {
  const response: Message<AnyMessageBody> = await hub.sendMessage({
    type: 'X-RTLS-INF',
  });
  return ensureResponseType(response.body, 'X-RTLS-INF');
}

/**
 * Requests the full parameter list of a single RTLS device.
 */
export async function queryRtlsParameterList(
  hub: MessageHub,
  deviceId: string,
  { timeout }: { timeout?: number } = {}
): Promise<RtlsParam[]> {
  const response: Message<AnyMessageBody> = await hub.sendMessage(
    {
      type: 'X-RTLS-PARAM-LIST',
      id: deviceId,
      ...(timeout === undefined ? {} : { timeout }),
    },
    // The device may need to round-trip with the firmware, so allow a longer
    // wait than the default message timeout.
    { timeout: 30 }
  );
  const body = ensureResponseType(response.body, 'X-RTLS-PARAM-LIST');

  const params = body.params;
  if (!params || typeof params !== 'object') {
    return [];
  }

  const result: RtlsParam[] = [];
  for (const [name, raw] of Object.entries(
    params as Record<string, Record<string, unknown>>
  )) {
    result.push({
      name,
      value: raw.value as RtlsParamValue,
      type: raw.type as RtlsParamType,
      index: typeof raw.index === 'number' ? raw.index : undefined,
    });
  }

  // Order by the device-reported index when available, otherwise by name.
  result.sort((a, b) => {
    if (a.index !== undefined && b.index !== undefined) {
      return a.index - b.index;
    }

    return a.name.localeCompare(b.name);
  });

  return result;
}

/**
 * Reads the value of a single parameter from an RTLS device.
 */
export async function getRtlsParameter(
  hub: MessageHub,
  deviceId: string,
  name: string
): Promise<RtlsParamValue> {
  let response: Message<AnyMessageBody>;
  try {
    response = await hub.sendMessage({
      type: 'X-RTLS-PARAM-GET',
      id: deviceId,
      name,
    });
  } catch (error) {
    throw new Error(
      `Failed to read parameter ${name} of device ${deviceId}: ${errorToString(
        error
      )}`
    );
  }

  const body = ensureResponseType(response.body, 'X-RTLS-PARAM-GET');
  return body.value as RtlsParamValue;
}

/**
 * Result of an X-RTLS-PARAM-SET request.
 *
 * A response with `accepted: false` is a normal "the device rejected this
 * value" outcome and is reported here rather than thrown; only transport
 * failures (timeouts, malformed responses, ACK-NAK) reject the promise.
 */
export type RtlsParameterSetResult = {
  name: string;
  value: RtlsParamValue;
  paramType?: RtlsParamType;
  result?: string;
  accepted: boolean;
};

/**
 * Sets the value of a single parameter on an RTLS device.
 */
export async function setRtlsParameter(
  hub: MessageHub,
  deviceId: string,
  name: string,
  value: RtlsParamValue,
  paramType?: RtlsParamType
): Promise<RtlsParameterSetResult> {
  let response: Message<AnyMessageBody>;
  try {
    response = await hub.sendMessage({
      type: 'X-RTLS-PARAM-SET',
      id: deviceId,
      name,
      value,
      ...(paramType === undefined ? {} : { paramType }),
    });
  } catch (error) {
    throw new Error(
      `Failed to set parameter ${name} on device ${deviceId}: ${errorToString(
        error
      )}`
    );
  }

  const body = ensureResponseType(response.body, 'X-RTLS-PARAM-SET');

  return {
    name: (body.name as string) ?? name,
    value: (body.value as RtlsParamValue) ?? value,
    paramType: body.paramType as RtlsParamType | undefined,
    result: typeof body.result === 'string' ? body.result : undefined,
    accepted: Boolean(body.accepted),
  };
}

/**
 * Per-device outcome of an X-RTLS-SLEEP request.
 *
 * `accepted: false` with a `detail` is a normal outcome (e.g. the firmware's
 * arming gate refused to sleep while the drone is armed); only transport
 * failures and malformed responses reject the promise.
 */
export type RtlsSleepResult = {
  requested?: boolean;
  accepted: boolean;
  sleeping?: boolean | null;
  detail?: string;
};

/**
 * Puts the given RTLS devices to sleep (`sleeping: true`) or wakes them.
 * Returns the per-device result map keyed by the device id as a string.
 */
export async function sendRtlsSleep(
  hub: MessageHub,
  deviceIds: Iterable<string>,
  sleeping: boolean,
  { timeout = 30 }: { timeout?: number } = {}
): Promise<Record<string, RtlsSleepResult>> {
  // Strict digits-only parsing: Number('') is 0 and Number('0x10') is 16,
  // either of which would silently command the wrong device.
  const requested = Array.from(deviceIds, (id) => String(id));
  const ids = requested
    .filter((id) => /^\d+$/.test(id))
    .map((id) => Number(id));
  if (ids.length === 0) {
    throw new Error('No valid RTLS device ids to command');
  }

  let response: Message<AnyMessageBody>;
  try {
    // The server verifies the sleep outcome on each device (including a
    // settle delay for the firmware's arming gate, or an anchor's reboot),
    // so allow a longer wait than the default message timeout.
    response = await hub.sendMessage(
      { type: 'X-RTLS-SLEEP', ids, sleeping },
      { timeout }
    );
  } catch (error) {
    throw new Error(
      `Failed to ${sleeping ? 'sleep' : 'wake'} RTLS devices: ${errorToString(
        error
      )}`
    );
  }

  const body = ensureResponseType(response.body, 'X-RTLS-SLEEP');
  const raw = body.result;
  const result = (raw && typeof raw === 'object' ? { ...raw } : {}) as Record<
    string,
    RtlsSleepResult
  >;

  // Every requested device must have an outcome: a dropped (non-numeric) id
  // or an entry the server omitted is a failure, not a silent success.
  for (const id of requested) {
    if (!(id in result)) {
      result[id] = {
        requested: sleeping,
        accepted: false,
        detail: /^\d+$/.test(id)
          ? 'no response from server for this device'
          : 'invalid device id',
      };
    }
  }

  return result;
}

/** Per-device outcome of an X-RTLS-FORGET request. */
export type RtlsForgetResult = { forgotten: boolean; detail?: string };

/**
 * Asks the server to drop offline devices (their X-RTLS-INF entry and stale
 * stats). A live device is not forgotten. Returns the per-device result map
 * keyed by the device id as a string; a device the server did not answer
 * for counts as not forgotten.
 */
export async function sendRtlsForget(
  hub: MessageHub,
  deviceIds: string[]
): Promise<Record<string, RtlsForgetResult>> {
  const ids = deviceIds.filter((id) => /^\d+$/.test(id)).map(Number);
  if (ids.length === 0) {
    throw new Error('No valid RTLS device ids to forget');
  }

  const response: Message<AnyMessageBody> = await hub.sendMessage({
    type: 'X-RTLS-FORGET',
    ids,
  });
  const body = ensureResponseType(response.body, 'X-RTLS-FORGET');
  const raw = (
    body.result && typeof body.result === 'object' ? body.result : {}
  ) as Record<string, Partial<RtlsForgetResult> | undefined>;

  const result: Record<string, RtlsForgetResult> = {};
  for (const id of deviceIds) {
    const entry = raw[id];
    result[id] = {
      forgotten: entry?.forgotten === true,
      detail:
        typeof entry?.detail === 'string'
          ? entry.detail
          : entry === undefined
            ? 'no response from server for this device'
            : undefined,
    };
  }
  return result;
}

/**
 * Queries the current OTA job (if any) for a single RTLS device.
 */
export async function queryRtlsOtaStatus(
  hub: MessageHub,
  deviceId: string
): Promise<RtlsOtaJob> {
  const response: Message<AnyMessageBody> = await hub.sendMessage({
    type: 'X-RTLS-OTA',
    id: deviceId,
  });
  const body = ensureResponseType(response.body, 'X-RTLS-OTA');
  return (body.job as RtlsOtaJob) ?? {};
}

/** The device species an RTLS firmware image is built for. */
export type RtlsImageSpecies = 'anchor' | 'tag';

/**
 * Asks the server which species an image's build receipt names (X-RTLS-OTA
 * with `inspect`, nothing is uploaded). Resolves to the species when the
 * receipt names it, `undefined` for an image without a receipt. Rejects with
 * the server's reason for a missing file or a bad or stale receipt (a server
 * without inspect also rejects).
 */
export async function inspectRtlsOtaImage(
  hub: MessageHub,
  image: string
): Promise<RtlsImageSpecies | undefined> {
  const response: Message<AnyMessageBody> = await hub.sendMessage({
    type: 'X-RTLS-OTA',
    inspect: true,
    image,
  });
  const body = response.body;
  if (body?.type !== 'X-RTLS-OTA') {
    throw new Error(
      typeof body?.reason === 'string' ? body.reason : 'image not inspected'
    );
  }
  return body.speciesSource === 'receipt' &&
    (body.species === 'anchor' || body.species === 'tag')
    ? body.species
    : undefined;
}

/**
 * Starts an OTA (over-the-air firmware update) job on an RTLS device using the
 * named image. `role` declares the species the image is built for; the server
 * uses it only for an image without a build receipt, NAKs one that
 * contradicts the receipt, and refuses a species that differs from the
 * device's UWB_ROLE (a tag image on an anchor, or the reverse, never rejoins
 * WiFi).
 */
export async function startRtlsOta(
  hub: MessageHub,
  deviceId: string,
  image: string,
  role?: RtlsImageSpecies
): Promise<RtlsOtaJob> {
  let response: Message<AnyMessageBody>;
  try {
    response = await hub.sendMessage(
      {
        type: 'X-RTLS-OTA',
        id: deviceId,
        image,
        ...(role === undefined ? {} : { role }),
      },
      { timeout: 30 }
    );
  } catch (error) {
    throw new Error(
      `Failed to start OTA on device ${deviceId}: ${errorToString(error)}`
    );
  }

  const body = ensureResponseType(response.body, 'X-RTLS-OTA');
  return (body.job as RtlsOtaJob) ?? {};
}

/**
 * Grades the fleet's self-fitted cell geometries against each other via
 * X-RTLS-GEOM (a pure function over the server's cached stats). Returns the
 * raw response body: tolerance, per-distance reference, the `consistent`
 * flag and per-tag verdicts.
 */
export async function checkRtlsGeometryAgreement(
  hub: MessageHub,
  options: { ids?: number[]; tolerance?: number } = {}
): Promise<AnyMessageBody> {
  const response: Message<AnyMessageBody> = await hub.sendMessage(
    {
      type: 'X-RTLS-GEOM',
      ...(options.ids === undefined ? {} : { ids: options.ids }),
      ...(options.tolerance === undefined
        ? {}
        : { tolerance: options.tolerance }),
    },
    { timeout: 15 }
  );
  return ensureResponseType(response.body, 'X-RTLS-GEOM');
}

/**
 * Runs the fleet pre-flight verification rule set (X-RTLS-VERIFY). The
 * in-depth pass reads the ArduPilot tuning set from every paired drone
 * over live MAVLink, hence the generous timeout.
 */
export async function verifyRtlsFleet(
  hub: MessageHub,
  options: { inDepth?: boolean } = {}
): Promise<AnyMessageBody> {
  const response: Message<AnyMessageBody> = await hub.sendMessage(
    {
      type: 'X-RTLS-VERIFY',
      ...(options.inDepth === undefined ? {} : { inDepth: options.inDepth }),
    },
    { timeout: 120 }
  );
  return ensureResponseType(response.body, 'X-RTLS-VERIFY');
}

/** Outcome of an X-RTLS-LOCK request. */
export type RtlsLockResult = {
  /**
   * `locked` / `unlocked` when the request took effect, `warnings` when a
   * lock (or re-seal) waits for the warnings or breaks to be acknowledged,
   * `status` for a query.
   */
  result: 'locked' | 'unlocked' | 'warnings' | 'status' | 'unknown';
  /** The lock state after the request, when the server reported it. */
  lock?: RtlsAnchorLock;
  /** The cell's warnings now: on a `warnings` result, the ones to acknowledge. */
  warnings: RtlsLockIssue[];
};

const LOCK_RESULTS = ['locked', 'unlocked', 'warnings', 'status'] as const;

/**
 * Locks, unlocks or queries the anchor cell lock (X-RTLS-LOCK). A lock with
 * warnings that are not acknowledged answers normally with `locked: false`
 * and the warnings; a refusal (NAK) rejects with the server's reason.
 */
export async function sendRtlsLock(
  hub: MessageHub,
  action: 'lock' | 'unlock' | 'status',
  { acknowledgeWarnings }: { acknowledgeWarnings?: boolean } = {}
): Promise<RtlsLockResult> {
  const response: Message<AnyMessageBody> = await hub.sendMessage({
    type: 'X-RTLS-LOCK',
    action,
    ...(acknowledgeWarnings === undefined ? {} : { acknowledgeWarnings }),
  });
  const body = response.body;
  if (body?.type !== 'X-RTLS-LOCK') {
    throw new Error(
      typeof body?.reason === 'string'
        ? body.reason
        : `Unexpected response to X-RTLS-LOCK (${String(body?.type)})`
    );
  }
  return {
    result: LOCK_RESULTS.find((value) => value === body.result) ?? 'unknown',
    lock: mapAnchorLock(body.anchorLock),
    warnings: mapLockIssues(body.warnings),
  };
}
