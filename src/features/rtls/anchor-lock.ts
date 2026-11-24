/**
 * @file The anchor lock command (X-RTLS-LOCK) and its feedback. The lock
 * state itself (`anchorLock`) arrives with X-RTLS-INF only (`handlers.ts`).
 * What a locked anchor refuses, and when it can be locked, is the
 * firmware's: see rtls-link-zephyr `docs/reference/anchor-power-path.md`,
 * "Lock".
 */

import { showConfirmationDialog } from '~/features/prompt/actions';
import { showError, showNotification } from '~/features/snackbar/actions';
import { type Message, type MessageBody } from '~/flockwave/types';
import i18n from '~/i18n';
import messageHub from '~/message-hub';
import { type AppThunk, type RootState } from '~/store/reducers';

import { getPossiblyArmedUavIds, getRtlsDeviceDisplayName } from './selectors';
import { type AnyRecord, isRecord, toText } from './wire-values';

/** An anchor that did not take a lock or unlock write. */
type RtlsLockFailure = { id: string; detail: string };

/** Outcome of an X-RTLS-LOCK request. */
type RtlsLockResult = {
  /**
   * `locked` / `unlocked` when every online anchor took the write,
   * `warnings` when a lock waits for its warnings to be acknowledged,
   * `refused` when the server will not lock (see `reason`), `incomplete`
   * when some or no anchors took it (see `failures` and `reason`).
   */
  result: 'locked' | 'unlocked' | 'warnings' | 'refused' | 'incomplete';
  /** Why the server refused, or why nothing was written. */
  reason?: string;
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
] as const;

/**
 * How long a lock waits: longer than the server's per-anchor write timeout
 * and its late-ack grace (5 + 1 s), so a silent anchor comes back named.
 */
const LOCK_TIMEOUT_SECONDS = 15;

/**
 * Locks or unlocks the anchors (X-RTLS-LOCK). Every answer is a normal
 * response with a `result`; only a NAK (e.g. a server without the RTLS
 * extension) rejects, with its reason. The aggregate lock in the reply is
 * not read: the next X-RTLS-INF reports it.
 */
async function sendRtlsLock(
  action: 'lock' | 'unlock',
  acknowledgeWarnings?: boolean
): Promise<RtlsLockResult> {
  const response: Message<MessageBody & AnyRecord> =
    await messageHub.sendMessage(
      {
        type: 'X-RTLS-LOCK',
        action,
        ...(acknowledgeWarnings === undefined ? {} : { acknowledgeWarnings }),
      },
      { timeout: LOCK_TIMEOUT_SECONDS }
    );
  const body = response.body;
  if (body?.type !== 'X-RTLS-LOCK') {
    throw new Error(
      toText(body?.reason) ??
        `Unexpected response to X-RTLS-LOCK (${String(body?.type)})`
    );
  }
  const warnings = Array.isArray(body.warnings) ? body.warnings : [];
  const results = isRecord(body.results) ? body.results : {};
  return {
    result: LOCK_RESULTS.find((value) => value === body.result) ?? 'incomplete',
    reason: toText(body.reason),
    // each warning is `{code, device, detail}`; its detail shows as is
    warnings: warnings
      .map((raw) => (isRecord(raw) ? toText(raw.detail) : undefined))
      .filter((text): text is string => text !== undefined),
    failures: Object.entries(results)
      .filter(([, entry]) => isRecord(entry) && entry.accepted !== true)
      .map(([id, entry]) => ({
        id,
        detail: (isRecord(entry) && toText(entry.detail)) || 'refused',
      })),
  };
}

/** A command's result with, unless it took effect or warnings wait, what went wrong. */
export type RtlsLockOutcome = RtlsLockResult & { error?: string };

/** A failure named by its anchor: "RTLS anchor A3: no answer". */
const describeFailure = (
  state: RootState,
  { detail, id }: RtlsLockFailure
): string => {
  const device = state.rtls.devices.byId[id];
  const name = device === undefined ? id : getRtlsDeviceDisplayName(device);
  return detail.startsWith(name) ? detail : `${name}: ${detail}`;
};

/**
 * Why a lock or unlock did not take effect, or `undefined` when it did: the
 * server's reason, then the anchors that did not take the write.
 */
const describeLockOutcome = (
  state: RootState,
  result: RtlsLockResult
): string | undefined => {
  if (result.result === 'locked' || result.result === 'unlocked') {
    return undefined;
  }
  const parts = [
    ...(result.reason === undefined ? [] : [result.reason]),
    ...result.failures.map((failure) => describeFailure(state, failure)),
  ];
  return parts.length > 0 ? parts.join('; ') : i18n.t('rtlsAnchorLock.notDone');
};

/**
 * Thunk that sends a lock or unlock. Without `acknowledgeWarnings` the
 * server answers a lock with `warnings` instead of locking, for the dialog
 * to list. Announces a success while `isCurrent` (the caller's attempt is
 * still the one on screen). Only the command's feedback comes from here: the
 * header and the show step wait for the reported lock.
 */
export const sendRtlsLockCommand =
  (
    action: 'lock' | 'unlock',
    acknowledgeWarnings?: boolean,
    isCurrent: () => boolean = () => true
  ): AppThunk<Promise<RtlsLockOutcome>> =>
  async (_dispatch, getState) => {
    const result = await sendRtlsLock(action, acknowledgeWarnings);
    if (result.result === 'warnings') {
      return result;
    }
    const error = describeLockOutcome(getState(), result);
    if (error === undefined && isCurrent()) {
      showNotification(
        result.result === 'locked'
          ? i18n.t('rtlsAnchorLock.notification.locked')
          : i18n.t('rtlsAnchorLock.notification.unlocked')
      );
    }
    return { ...result, error };
  };

/**
 * Thunk that unlocks the anchors after a one-line confirmation, worded more
 * strongly while any drone may be armed. An existing authorization and
 * start stay intact.
 */
export const unlockRtlsAnchors =
  (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const armed = getPossiblyArmedUavIds(getState()).length;
    const response = await dispatch(
      // one line on purpose: no title
      showConfirmationDialog(
        armed > 0
          ? i18n.t('rtlsAnchorLock.unlock.armedMessage', { count: armed })
          : i18n.t('rtlsAnchorLock.unlock.message')
      )
    );
    if (!response?.confirmed) {
      return;
    }

    try {
      const { error } = await dispatch(sendRtlsLockCommand('unlock'));
      if (error !== undefined) {
        showError(error);
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  };
