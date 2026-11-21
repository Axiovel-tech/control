/**
 * @file The anchor lock as the server reports it. The lock lives in the
 * anchors' firmware (a `LOCK` parameter): a locked anchor refuses every
 * remote change. The server derives `anchorLock` from the anchors' `locked`
 * stats: `{locked, lockedCount, anchorCount, unlocked, showGate}`. A lock
 * warning is `{code, device, detail}`.
 */

/** A warning the server raised before locking the anchors. */
export type RtlsLockIssue = {
  /** Machine-readable kind, e.g. `offline`, `moved`, `low-battery`. */
  code: string;
  /** System id of the anchor it concerns, when it concerns one. */
  device?: string;
  /** Human-readable text from the server; it names the anchor. */
  text: string;
};

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

/** A system id (a number on the wire, `null` for the cell) as a key. */
const toDevice = (value: unknown): string | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : undefined;

const mapList = <T>(value: unknown, map: (raw: unknown) => T | undefined) =>
  Array.isArray(value)
    ? value.map(map).filter((entry): entry is T => entry !== undefined)
    : [];

/** A warning: `{code, device, detail}`. */
const mapIssue = (raw: unknown): RtlsLockIssue | undefined => {
  if (!isRecord(raw)) {
    return undefined;
  }
  const code = toText(raw.code);
  const text = toText(raw.detail);
  return code === undefined || text === undefined
    ? undefined
    : { code, device: toDevice(raw.device), text };
};

/** Maps the warnings of a lock response. */
export const mapLockIssues = (value: unknown): RtlsLockIssue[] =>
  mapList(value, mapIssue);

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

/** The state of the lock, as the UI distinguishes it. */
export type AnchorLockState = 'unsupported' | 'unlocked' | 'locked';

export const getAnchorLockState = (
  lock: RtlsAnchorLock | undefined
): AnchorLockState =>
  lock === undefined ? 'unsupported' : lock.locked ? 'locked' : 'unlocked';
