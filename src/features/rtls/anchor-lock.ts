/**
 * @file The anchor cell lock as the server reports it: its types, the mapping
 * of the wire shape (X-RTLS-INF `anchorLock` and X-RTLS-LOCK responses) and
 * the questions the UI asks of it. `anchorLock` is `{locked, lockedAt (UNIX
 * s), anchors, acknowledgedWarnings, breaks, showGate}`; a warning is `{code,
 * device, detail}`, a break `{code, device, detail, at}`, `showGate`
 * `{required, refused, reason}`.
 */

/** A warning the server raised when the anchors were (or were about to be) locked. */
export type RtlsLockIssue = {
  /** Machine-readable kind, e.g. `offline`, `moved`, `low-battery`. */
  code: string;
  /** System id of the anchor it concerns, when it concerns one. */
  device?: string;
  /** Human-readable text from the server; it names the anchor. */
  text: string;
};

/**
 * One event that broke the anchor lock (integrity watch while locked): a
 * warning's fields, its `code` one of `offline`, `rebooted`, `param-changed`,
 * `firmware-changed`, `moved`, `left-operating`.
 */
export type RtlsLockBreak = RtlsLockIssue & {
  /** When it happened, ms since the epoch. */
  time?: number;
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

/**
 * The ground-side anchor cell lock, kept by axio-server so that every client
 * sees and honours the same lock. While locked, the server refuses every
 * command that would change an anchor, and it refuses new show
 * authorizations or changed authorized starts unless the anchors are locked
 * without breaks.
 */
export type RtlsAnchorLock = {
  locked: boolean;
  /** When the anchors were locked, ms since the epoch. */
  lockedAt?: number;
  /**
   * System ids of the sealed anchors: anchors for every lock check even
   * before their role arrives (a server restart rediscovers them).
   */
  anchors: string[];
  /** Warnings acknowledged at lock time. */
  warnings: RtlsLockIssue[];
  /** Events that broke the lock since it was sealed. */
  breaks: RtlsLockBreak[];
  /** The server's show-gate verdict; absent from older servers. */
  showGate?: RtlsShowGate;
};

type AnyRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is AnyRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toText = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/** A system id (a number on the wire, `null` for the cell) as a key. */
const toDevice = (value: unknown): string | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : undefined;

/** UNIX seconds (the server's `time.time()`) as ms since the epoch. */
const secondsToMs = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? value * 1000
    : undefined;

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

/** A break: a warning's fields and `at` (UNIX seconds). */
const mapBreak = (raw: unknown): RtlsLockBreak | undefined => {
  const issue = mapIssue(raw);
  return issue === undefined || !isRecord(raw)
    ? undefined
    : { ...issue, time: secondsToMs(raw.at) };
};

const mapList = <T>(value: unknown, map: (raw: unknown) => T | undefined) =>
  Array.isArray(value)
    ? value.map(map).filter((entry): entry is T => entry !== undefined)
    : [];

/** Maps the lock warnings of a lock response or state. */
export const mapLockIssues = (value: unknown): RtlsLockIssue[] =>
  mapList(value, mapIssue);

/**
 * Maps the server's lock state. `undefined` when the value carries no
 * `locked` flag: a server without the lock feature, whose clients show no
 * lock UI and no show gating.
 */
export function mapAnchorLock(value: unknown): RtlsAnchorLock | undefined {
  if (!isRecord(value) || typeof value.locked !== 'boolean') {
    return undefined;
  }
  return {
    locked: value.locked,
    lockedAt: value.locked ? secondsToMs(value.lockedAt) : undefined,
    anchors: value.locked ? mapList(value.anchors, (raw) => toDevice(raw)) : [],
    warnings: mapLockIssues(value.acknowledgedWarnings ?? value.warnings),
    breaks: mapList(value.breaks, mapBreak),
    showGate: mapShowGate(value.showGate),
  };
}

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

/** Whether the anchors are locked (anchor-changing commands are refused). */
export const isLocked = (lock: RtlsAnchorLock | undefined): boolean =>
  lock?.locked === true;

/** Whether the lock was broken since it was sealed. */
export const isLockBroken = (lock: RtlsAnchorLock | undefined): boolean =>
  isLocked(lock) && lock!.breaks.length > 0; // non-null: isLocked checked it

/** The state of the lock, as the UI distinguishes it. */
export type AnchorLockState = 'unsupported' | 'unlocked' | 'locked' | 'broken';

export const getAnchorLockState = (
  lock: RtlsAnchorLock | undefined
): AnchorLockState =>
  lock === undefined
    ? 'unsupported'
    : isLockBroken(lock)
      ? 'broken'
      : lock.locked
        ? 'locked'
        : 'unlocked';
