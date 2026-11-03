import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { ShowRTHOutcome } from '~/flockwave/operations';

import type { ShowRTHSelection } from './selection';

export type ShowRTHStatus =
  | { state: 'idle' }
  | { state: 'sending' }
  | ({ state: 'sent' } & ShowRTHOutcome)
  | { state: 'error'; error: string };

export type ShowRTHDialogState = {
  open: boolean;

  /**
   * The drones that hold a certified RTH plan, as reported by the server when
   * the dialog was opened.
   */
  planHolders: string[];

  /**
   * The selection that the dialog starts with.
   */
  initialSelection: ShowRTHSelection;

  status: ShowRTHStatus;
};

const initialState: ShowRTHDialogState = {
  open: false,
  planHolders: [],
  initialSelection: { returnAll: true, selected: [] },
  status: { state: 'idle' },
};

const { reducer, actions } = createSlice({
  name: 'show-rth',
  initialState,
  reducers: {
    /**
     * Opens the dialog with the given plan holders and initial selection.
     */
    openShowRTHDialog(
      _state,
      action: PayloadAction<{
        planHolders: string[];
        initialSelection: ShowRTHSelection;
      }>
    ) {
      return { ...initialState, open: true, ...action.payload };
    },

    /**
     * Closes the dialog and completely resets its state.
     */
    closeShowRTHDialog() {
      return initialState;
    },

    setShowRTHStatus(state, action: PayloadAction<ShowRTHStatus>) {
      state.status = action.payload;
    },
  },
});

export const { closeShowRTHDialog, openShowRTHDialog, setShowRTHStatus } =
  actions;

export default reducer;
