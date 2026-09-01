import type MessageHub from '~/flockwave/messages';
import { type Message, type MessageBody } from '~/flockwave/types';

import {
  SERVER_PHASES,
  type FirmwareJobStatus,
  type FirmwareUpdateJob,
  type FirmwareUpdateTarget,
  type PreparedFirmwareArtifact,
} from './types';

export const FLIGHT_FIRMWARE_MESSAGE_TYPE = 'X-AP-OTA';

type ResponseBody = MessageBody & Record<string, unknown>;
type RawObject = Record<string, unknown>;

const JOB_STATUSES = new Set<FirmwareJobStatus>([
  'running',
  'success',
  'failed',
  'cancelled',
  'indeterminate',
]);
const PHASES = new Set<string>(SERVER_PHASES);

const ensureResponse = (
  body: ResponseBody | undefined,
  operation: string
): ResponseBody => {
  if (body?.type !== FLIGHT_FIRMWARE_MESSAGE_TYPE || body.op !== operation) {
    const reason = typeof body?.reason === 'string' ? `: ${body.reason}` : '';
    throw new Error(
      `Invalid ${FLIGHT_FIRMWARE_MESSAGE_TYPE} response${reason}`
    );
  }

  return body;
};

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const optionalCount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;

const parseError = (value: unknown) => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const raw = value as RawObject;
  const code = optionalString(raw.code);
  return code ? { code, detail: optionalString(raw.detail) } : undefined;
};

const parseSafety = (value: unknown) => {
  const raw =
    typeof value === 'object' && value !== null ? (value as RawObject) : {};
  const boolean = (key: string): boolean | undefined =>
    typeof raw[key] === 'boolean' ? Boolean(raw[key]) : undefined;
  return {
    connected: boolean('connected'),
    disarmed: boolean('disarmed'),
    onGround: boolean('onGround'),
    powerSufficient: boolean('powerSufficient'),
  };
};

const parseTarget = (
  value: unknown,
  fallbackId?: string
): FirmwareUpdateTarget | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const raw = value as RawObject;
  const id = optionalString(raw.id) ?? fallbackId;
  if (!id) {
    return undefined;
  }

  return {
    id,
    compatible: raw.compatible === true,
    currentHash: optionalString(raw.currentHash),
    currentVersion: optionalString(raw.currentVersion),
    error: parseError(raw.error),
    label: optionalString(raw.label),
    safety: parseSafety(raw.safety),
  };
};

export const parseFirmwareJob = (
  value: unknown
): FirmwareUpdateJob | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const raw = value as RawObject;
  const id = optionalString(raw.id);
  const operationId = optionalString(raw.operationId);
  const phase = optionalString(raw.phase);
  const status = optionalString(raw.status) as FirmwareJobStatus | undefined;
  if (
    !id ||
    !operationId ||
    !phase ||
    !PHASES.has(phase) ||
    !status ||
    !JOB_STATUSES.has(status)
  ) {
    return undefined;
  }

  return {
    id,
    operationId,
    phase: phase as FirmwareUpdateJob['phase'],
    status,
    bytesTotal: optionalCount(raw.bytesTotal),
    bytesTransferred: optionalCount(raw.bytesTransferred),
    cancellable: raw.cancellable === true,
    committed: raw.committed === true,
    error: parseError(raw.error),
    expectedHash: optionalString(raw.expectedHash),
    expectedVersion: optionalString(raw.expectedVersion),
    observedHash: optionalString(raw.observedHash),
    observedVersion: optionalString(raw.observedVersion),
  };
};

const requireJob = (body: ResponseBody): FirmwareUpdateJob => {
  const job = parseFirmwareJob(body.job);
  if (!job) {
    throw new Error('Server returned an invalid firmware update job');
  }

  return job;
};

export async function queryFirmwareUpdateTargets(
  hub: MessageHub
): Promise<FirmwareUpdateTarget[]> {
  const response: Message<ResponseBody> = await hub.sendMessage({
    type: FLIGHT_FIRMWARE_MESSAGE_TYPE,
    op: 'targets',
  });
  const rawTargets = ensureResponse(response.body, 'targets').targets;
  if (Array.isArray(rawTargets)) {
    return rawTargets
      .map((target) => parseTarget(target))
      .filter((target): target is FirmwareUpdateTarget => Boolean(target));
  }

  if (typeof rawTargets === 'object' && rawTargets !== null) {
    return Object.entries(rawTargets)
      .map(([id, target]) => parseTarget(target, id))
      .filter((target): target is FirmwareUpdateTarget => Boolean(target));
  }

  return [];
}

export async function startFirmwareUpdate(
  hub: MessageHub,
  id: string,
  artifact: PreparedFirmwareArtifact
): Promise<FirmwareUpdateJob> {
  const response: Message<ResponseBody> = await hub.sendMessage(
    {
      type: FLIGHT_FIRMWARE_MESSAGE_TYPE,
      op: 'start',
      id,
      name: artifact.metadata.fileName,
      image: artifact.image,
      sha256: artifact.metadata.sha256,
    },
    { timeout: 120 }
  );
  return requireJob(ensureResponse(response.body, 'start'));
}

const sendJobRequest = async (
  hub: MessageHub,
  request: {
    id?: string;
    op: 'cancel' | 'status';
    operationId?: string;
  }
): Promise<FirmwareUpdateJob> => {
  const response: Message<ResponseBody> = await hub.sendMessage({
    type: FLIGHT_FIRMWARE_MESSAGE_TYPE,
    ...request,
  });
  return requireJob(ensureResponse(response.body, request.op));
};

export async function queryFirmwareUpdateStatus(
  hub: MessageHub,
  id: string,
  operationId?: string
): Promise<FirmwareUpdateJob> {
  return sendJobRequest(hub, {
    op: 'status',
    id,
    ...(operationId ? { operationId } : {}),
  });
}

export async function cancelFirmwareUpdate(
  hub: MessageHub,
  operationId: string
): Promise<FirmwareUpdateJob> {
  return sendJobRequest(hub, {
    op: 'cancel',
    operationId,
  });
}
