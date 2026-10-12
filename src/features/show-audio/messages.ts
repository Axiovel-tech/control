/**
 * @file Promise-based helpers for the X-SHOW-AUDIO-* message family handled by
 * the show_audio extension of the server. Like the X-RTLS-* helpers, these live
 * in the feature because the messages are not part of the Flockwave spec.
 */

import type MessageHub from '~/flockwave/messages';
import { ensureNotNAK } from '~/flockwave/parsing';
import { type MessageBody } from '~/flockwave/types';

import {
  type ShowAudioPlayerState,
  type ShowAudioStatus,
  type ShowAudioTrack,
} from './types';

type AnyMessageBody = MessageBody & Record<string, unknown>;

const PLAYER_STATES = new Set<string>([
  'idle',
  'armed',
  'playing',
  'finished',
  'stopped',
  'error',
]);

const isPlayerState = (value: unknown): value is ShowAudioPlayerState =>
  typeof value === 'string' && PLAYER_STATES.has(value);

const stringOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const finiteOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function parseTrack(value: unknown): ShowAudioTrack | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const { sha256, name, mediaType, duration } = value as Record<
    string,
    unknown
  >;
  if (typeof sha256 !== 'string') {
    return null;
  }

  return {
    sha256,
    name: typeof name === 'string' ? name : '',
    mediaType: typeof mediaType === 'string' ? mediaType : '',
    duration: finiteOrNull(duration) ?? 0,
  };
}

/**
 * Converts the body of an X-SHOW-AUDIO-INF response or notification into the
 * status object stored in the state store.
 */
export function parseShowAudioStatus(
  body: Record<string, unknown>
): ShowAudioStatus {
  return {
    track: parseTrack(body.track),
    state: isPlayerState(body.state) ? body.state : 'error',
    startTime: finiteOrNull(body.startTime),
    offsetMs: finiteOrNull(body.offsetMs) ?? 0,
    device: stringOrNull(body.device),
    error: stringOrNull(body.error),
  };
}

/**
 * Returns the human-readable reason of a failed X-SHOW-AUDIO-* request.
 */
export const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

async function send(
  hub: MessageHub,
  body: AnyMessageBody
): Promise<AnyMessageBody> {
  const response = ensureNotNAK(await hub.sendMessage<AnyMessageBody>(body));
  return response.body;
}

export async function queryShowAudioStatus(
  hub: MessageHub
): Promise<ShowAudioStatus> {
  const body = await send(hub, { type: 'X-SHOW-AUDIO-INF' });
  if (body.type !== 'X-SHOW-AUDIO-INF') {
    throw new Error(`Expected X-SHOW-AUDIO-INF response, got ${body.type}`);
  }

  return parseShowAudioStatus(body);
}

export type ShowAudioUploadChunk = {
  sha256: string;
  name: string;
  mediaType: string;
  size: number;
  offset: number;
  data: string;
};

/**
 * Sends a single chunk of a music track to the server. Resolves to `true` when
 * the server reports that the whole track has been received and loaded.
 */
export async function uploadShowAudioChunk(
  hub: MessageHub,
  chunk: ShowAudioUploadChunk
): Promise<boolean> {
  const { result } = await send(hub, {
    type: 'X-SHOW-AUDIO-UPLOAD',
    ...chunk,
  });

  if (result !== 'partial' && result !== 'loaded') {
    throw new Error(`Unexpected music upload result: ${String(result)}`);
  }

  return result === 'loaded';
}

export async function clearShowAudio(hub: MessageHub): Promise<void> {
  await send(hub, { type: 'X-SHOW-AUDIO-CLEAR' });
}

export async function stopShowAudio(hub: MessageHub): Promise<void> {
  await send(hub, { type: 'X-SHOW-AUDIO-STOP' });
}

export async function setShowAudioOffset(
  hub: MessageHub,
  offsetMs: number
): Promise<void> {
  await send(hub, { type: 'X-SHOW-AUDIO-SETCFG', offsetMs });
}
