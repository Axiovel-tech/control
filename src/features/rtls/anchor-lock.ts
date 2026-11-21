/**
 * @file The anchor cell lock as the server reports it (axio-server #63):
 * its types, the mapping of the wire shape — X-RTLS-INF `anchorLock`,
 * X-RTLS-LOCK responses and pushes — and the questions the UI asks of it.
 * `anchorLock` is `{locked, lockedAt (UNIX s), anchors, acknowledgedWarnings,
 * breaks, showGate}`; a warning is `{code, device, detail}`, a break `{code,
 * device, detail, at}`, `showGate` `{required, refused, reason}`.
 */

/** A warning the server raised when the anchors were (or were about to be) locked. */
export type RtlsLockIssue = {
  /** Machine-readable kind, e.g. `offline`, `moved`, `low-battery`. */
  code?: string;
  /** System id of the anchor it concerns, when it concerns one. */
  device?: string;
  /** Human-readable text from the server; it names the anchor. */
  text: string;
};

/** One event that broke the anchor lock (integrity watch while locked). */
export type RtlsLockBreak = {
  /** Machine-readable kind, e.g. `offline`, `rebooted`, `param-changed`. */
  reason: string;
  /** System id of the anchor it concerns, when it concerns one. */
  device?: string;
  /** When it happened, ms since the epoch. */
  time?: number;
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
  typeof value === 'string' && value.length > 0 ? value : undefined;

const toDevice = (value: unknown): string | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : toText(value);

/**
 * A wire timestamp in ms since the epoch: a number in seconds (the server's
 * `time.time()`) or in ms, or an ISO string.
 */
export const toEpochMs = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
};

const mapIssue = (raw: unknown): RtlsLockIssue | undefined => {
  if (typeof raw === 'string') {
    return { text: raw };
  }
  if (!isRecord(raw)) {
    return undefined;
  }
  const code = toText(raw.code) ?? toText(raw.kind) ?? toText(raw.reason);
  const text =
    toText(raw.message) ?? toText(raw.detail) ?? toText(raw.text) ?? code;
  return text === undefined
    ? undefined
    : {
        code,
        device: toDevice(raw.device ?? raw.id ?? raw.systemId),
        text,
      };
};

const mapBreak = (raw: unknown): RtlsLockBreak | undefined => {
  const issue = mapIssue(raw);
  if (issue === undefined) {
    return undefined;
  }
  return {
    reason: issue.code ?? 'unknown',
    device: issue.device,
    time: isRecord(raw)
      ? toEpochMs(raw.at ?? raw.time ?? raw.timestamp)
      : undefined,
    text: issue.text,
  };
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
    lockedAt: value.locked ? toEpochMs(value.lockedAt) : undefined,
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
