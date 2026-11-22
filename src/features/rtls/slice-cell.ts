/**
 * @file The cell settings' part of the RTLS slice: the server's
 * `cellSettings` and whether the dialog is open. Spread into `slice.ts`.
 */

import { type PayloadAction } from '@reduxjs/toolkit';

import { type RtlsCellSettings } from './cell-settings';

export type RtlsCellSliceState = {
  /** `undefined` while the server has not reported cell settings. */
  cellSettings?: RtlsCellSettings;
  cellDialogOpen: boolean;
};

export const initialCellState: RtlsCellSliceState = {
  cellSettings: undefined,
  cellDialogOpen: false,
};

export const cellReducers = {
  setRtlsCellSettings(
    state: RtlsCellSliceState,
    { payload }: PayloadAction<RtlsCellSettings>
  ) {
    state.cellSettings = payload;
  },

  openRtlsCellDialog(state: RtlsCellSliceState) {
    state.cellDialogOpen = true;
  },

  closeRtlsCellDialog(state: RtlsCellSliceState) {
    state.cellDialogOpen = false;
  },
};

/** Forgets the cell of the server we are leaving and closes its dialog. */
export const clearCellState = (state: RtlsCellSliceState): void => {
  state.cellSettings = undefined;
  state.cellDialogOpen = false;
};
