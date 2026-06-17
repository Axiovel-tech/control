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
 * Requests the current RTLS device inventory from the server.
 *
 * Returns the raw `status` mapping keyed by system id, which callers typically
 * forward to {@link handleRtlsInformationMessage}.
 */
export async function queryRtlsDevices(
  hub: MessageHub
): Promise<Record<string, Record<string, unknown>>> {
  const response: Message<AnyMessageBody> = await hub.sendMessage({
    type: 'X-RTLS-INF',
  });
  const body = ensureResponseType(response.body, 'X-RTLS-INF');
  const status = body.status;
  return status && typeof status === 'object'
    ? (status as Record<string, Record<string, unknown>>)
    : {};
}

/**
 * Requests the live RTLS statistics from the server, returning the raw `stats`
 * mapping keyed by system id.
 */
export async function queryRtlsStats(
  hub: MessageHub
): Promise<Record<string, Record<string, unknown>>> {
  const response: Message<AnyMessageBody> = await hub.sendMessage({
    type: 'X-RTLS-STATS',
  });
  const body = ensureResponseType(response.body, 'X-RTLS-STATS');
  const stats = body.stats;
  return stats && typeof stats === 'object'
    ? (stats as Record<string, Record<string, unknown>>)
    : {};
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
export async function queryRtlsParameter(
  hub: MessageHub,
  deviceId: string,
  name: string
): Promise<RtlsParam> {
  const response: Message<AnyMessageBody> = await hub.sendMessage({
    type: 'X-RTLS-PARAM-GET',
    id: deviceId,
    name,
  });
  const body = ensureResponseType(response.body, 'X-RTLS-PARAM-GET');

  return {
    name: (body.name as string) ?? name,
    value: body.value as RtlsParamValue,
    type: body.paramType as RtlsParamType,
  };
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

/**
 * Starts an OTA (over-the-air firmware update) job on an RTLS device using the
 * named image.
 */
export async function startRtlsOta(
  hub: MessageHub,
  deviceId: string,
  image: string
): Promise<RtlsOtaJob> {
  let response: Message<AnyMessageBody>;
  try {
    response = await hub.sendMessage(
      {
        type: 'X-RTLS-OTA',
        id: deviceId,
        image,
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
