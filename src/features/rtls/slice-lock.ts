/**
 * @file The anchor lock's part of the RTLS slice: the server's lock state and
 * whether the lock dialog is open. Spread into `slice.ts`.
 */

import { type PayloadAction } from '@reduxjs/toolkit';

import { type RtlsAnchorLock } from './anchor-lock';

export type RtlsLockSliceState = {
  /**
   * The server's anchor cell lock; `undefined` while the server has not
   * reported one (a server without the lock feature).
   */
  anchorLock?: RtlsAnchorLock;

  /** Whether the lock / re-seal dialog is open. */
  lockDialogOpen: boolean;
};

export const initialLockState: RtlsLockSliceState = {
  anchorLock: undefined,
  lockDialogOpen: false,
};

export const lockReducers = {
  /** Replaces the anchor lock state with the server's latest report. */
  setRtlsAnchorLock(
    state: RtlsLockSliceState,
    { payload }: PayloadAction<RtlsAnchorLock>
  ) {
    state.anchorLock = payload;
  },

  openRtlsLockDialog(state: RtlsLockSliceState) {
    state.lockDialogOpen = true;
  },

  closeRtlsLockDialog(state: RtlsLockSliceState) {
    state.lockDialogOpen = false;
  },
};

/**
 * Forgets the lock of the server we are leaving (the next one reports its
 * own), and closes a dialog about it so that it cannot act on the next one.
 */
export const clearLockState = (state: RtlsLockSliceState): void => {
  state.anchorLock = undefined;
  state.lockDialogOpen = false;
};
