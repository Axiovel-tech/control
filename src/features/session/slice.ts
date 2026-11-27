/**
 * @file Slice of the state object that handles the state of the user's session.
 * This slice is used to store ephemeral data that should not be persisted
 * between app restarts.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { type Identifier } from '~/utils/collections';

export type SessionSliceState = {
  /** Whether UAV commands should be broadcast */
  broadcast: boolean;

  /**
   * Whether developer mode is enabled. Dev mode may show additional menu items
   * or other UI elements that are useful for development only,
   */
  developerMode: boolean;

  /**
   * ID of the feature that is (or was) closest to the mouse cursor on the map view
   */
  featureIdForTooltip?: Identifier;
};

const initialState: SessionSliceState = {
  broadcast: false,
  developerMode: false,
  featureIdForTooltip: undefined,
};

const { actions, reducer } = createSlice({
  name: 'session',
  initialState,
  reducers: {
    setBroadcast(state, action: PayloadAction<boolean>) {
      state.broadcast = Boolean(action.payload);
    },

    setDeveloperMode(state, action: PayloadAction<boolean>) {
      state.developerMode = Boolean(action.payload);
    },

    setFeatureIdForTooltip(
      state,
      action: PayloadAction<Identifier | undefined>
    ) {
      state.featureIdForTooltip = action.payload;
    },
  },
});

export const { setBroadcast, setDeveloperMode, setFeatureIdForTooltip } =
  actions;

export default reducer;
