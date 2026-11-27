/**
 * @file The lock dialog's state from one open to the next: the opt-in
 * resurvey check, the attempt under way and what the server answered.
 */

import { type RtlsLockOutcome } from './anchor-lock';

export type LockDialogState = {
  resurvey: boolean;
  /** A lock is under way. */
  busy: boolean;
  /** The lock under way runs the resurvey check, which cannot be stopped. */
  measuring: boolean;
  /** The warnings the server answered the last lock with. */
  warnings: string[];
  acknowledged: boolean;
  error?: string;
};

export type LockDialogAction =
  | { type: 'opened' }
  | { type: 'resurvey'; checked: boolean }
  | { type: 'acknowledged'; checked: boolean }
  | { type: 'sent' }
  | { type: 'answered'; outcome?: RtlsLockOutcome; failure?: string };

export const LOCK_DIALOG_OPENED: LockDialogState = {
  resurvey: false,
  busy: false,
  measuring: false,
  warnings: [],
  acknowledged: false,
};

/** Whether a lock sent now runs the resurvey check: the first one only. */
export const runsResurveyCheck = (state: LockDialogState): boolean =>
  state.resurvey && state.warnings.length === 0;

export const lockDialogReducer = (
  state: LockDialogState,
  action: LockDialogAction
): LockDialogState => {
  switch (action.type) {
    case 'opened':
      return LOCK_DIALOG_OPENED;
    case 'resurvey':
      return { ...state, resurvey: action.checked };
    case 'acknowledged':
      return { ...state, acknowledged: action.checked };
    case 'sent':
      return {
        ...state,
        busy: true,
        measuring: runsResurveyCheck(state),
        error: undefined,
      };
    case 'answered': {
      const { failure, outcome } = action;
      const done = { ...state, busy: false, measuring: false };
      if (outcome?.result === 'locked') {
        return done;
      }
      if (outcome?.result === 'warnings') {
        return { ...done, warnings: outcome.warnings, acknowledged: false };
      }
      return { ...done, error: outcome?.error ?? failure };
    }
  }
};
