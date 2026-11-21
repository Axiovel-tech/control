/**
 * @file The anchor lock as Control sees it: the server's `anchorLock` (derived
 * from the anchors' `locked` stats) and the X-RTLS-LOCK request. What a
 * locked anchor refuses, and when it can be locked, is the firmware's: see
 * rtls-link-zephyr `docs/reference/anchor-power-path.md`, "Lock".
 */

import type MessageHub from '~/flockwave/messages';
import { type Message, type MessageBody } from '~/flockwave/types';

/**
 * The server's verdict on scheduling or authorizing a show now (the same
 * check SHOW-SETCFG applies): whether locked anchors are required, whether
 * it refuses now, and why.
 */
export type RtlsShowGate = {
  required: boolean;
  refused: boolean;
  reason?: string;
};

/** The anchor lock, derived by the server from the anchors' own lock. */
export type RtlsAnchorLock = {
  /** At least one anchor is known and every online anchor is locked. */
  locked: boolean;
  lockedCount: number;
  anchorCount: number;
  /** System ids of the online anchors that are not locked. */
  unlocked: string[];
  showGate?: RtlsShowGate;
};

type AnyRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is AnyRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toText = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const toCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** A system id (a number on the wire) as a key. */
const toDevice = (value: unknown): string | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : undefined;

const mapList = <T>(value: unknown, map: (raw: unknown) => T | undefined) =>
  Array.isArray(value)
    ? value.map(map).filter((entry): entry is T => entry !== undefined)
    : [];

const mapShowGate = (value: unknown): RtlsShowGate | undefined =>
  isRecord(value) &&
  typeof value.required === 'boolean' &&
  typeof value.refused === 'boolean'
    ? {
        required: value.required,
        refused: value.refused,
        reason: toText(value.reason),
      }
    : undefined;

/**
 * Maps the server's `anchorLock`. `undefined` when the value carries no
 * `locked` flag: a server without the lock, whose clients show no lock UI.
 */
export function mapAnchorLock(value: unknown): RtlsAnchorLock | undefined {
  if (!isRecord(value) || typeof value.locked !== 'boolean') {
    return undefined;
  }
  return {
    locked: value.locked,
    lockedCount: toCount(value.lockedCount),
    anchorCount: toCount(value.anchorCount),
    unlocked: mapList(value.unlocked, toDevice),
    showGate: mapShowGate(value.showGate),
  };
}

/** An anchor that did not take a lock or unlock write. */
export type RtlsLockFailure = { id: string; detail: string };

/** Outcome of an X-RTLS-LOCK request. */
export type RtlsLockResult = {
  /**
   * `locked` / `unlocked` when every online anchor took the write,
   * `warnings` when a lock waits for its warnings to be acknowledged,
   * `refused` when the server will not lock (see `reason`), `incomplete`
   * when some or no anchors took it (see `failures` and `reason`).
   */
  result:
    | 'locked'
    | 'unlocked'
    | 'warnings'
    | 'refused'
    | 'incomplete'
    | 'status'
    | 'unknown';
  /** Why the server refused, or why nothing was written. */
  reason?: string;
  /** The lock state after the request, when the server reported it. */
  lock?: RtlsAnchorLock;
  /** The warnings to acknowledge (`warnings` result): the server's texts. */
  warnings: string[];
  /** The anchors that did not take the write (`incomplete` result). */
  failures: RtlsLockFailure[];
};

const LOCK_RESULTS = [
  'locked',
  'unlocked',
  'warnings',
  'refused',
  'incomplete',
  'status',
] as const;

/** The warnings' texts (`{code, device, detail}` each). */
const mapWarnings = (value: unknown): string[] =>
  mapList(value, (raw) => (isRecord(raw) ? toText(raw.detail) : undefined));

/** The anchors that did not take the write, from `results`. */
const mapFailures = (value: unknown): RtlsLockFailure[] =>
  isRecord(value)
    ? Object.entries(value)
        .filter(([, entry]) => isRecord(entry) && entry.accepted !== true)
        .map(([id, entry]) => ({
          id,
          detail: (isRecord(entry) && toText(entry.detail)) || 'refused',
        }))
    : [];

/**
 * Locks, unlocks or queries the anchor lock (X-RTLS-LOCK). Every answer is a
 * normal response with a `result`; only a NAK (e.g. a server without the
 * RTLS extension) rejects, with its reason.
 */
export async function sendRtlsLock(
  hub: MessageHub,
  action: 'lock' | 'unlock' | 'status',
  { acknowledgeWarnings }: { acknowledgeWarnings?: boolean } = {}
): Promise<RtlsLockResult> {
  const response: Message<MessageBody & AnyRecord> = await hub.sendMessage({
    type: 'X-RTLS-LOCK',
    action,
    ...(acknowledgeWarnings === undefined ? {} : { acknowledgeWarnings }),
  });
  const body = response.body;
  if (body?.type !== 'X-RTLS-LOCK') {
    throw new Error(
      toText(body?.reason) ??
        `Unexpected response to X-RTLS-LOCK (${String(body?.type)})`
    );
  }
  return {
    result: LOCK_RESULTS.find((value) => value === body.result) ?? 'unknown',
    reason: toText(body.reason),
    lock: mapAnchorLock(body.anchorLock),
    warnings: mapWarnings(body.warnings),
    failures: mapFailures(body.results),
  };
}
