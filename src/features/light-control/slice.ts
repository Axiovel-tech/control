/**
 * @file Slice of the state object that stores the status of the light control
 * panel in the appplication.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Which drones the colours of the light control panel go to: the whole fleet,
 * as one colour that the server keeps sending, or the selected drones, each
 * with a colour of its own that takes precedence over the fleet's.
 */
export type LightControlTarget = 'all' | 'selected';

type LightControlSliceState = {
  active: boolean;
  /** The colour of the whole fleet. */
  color: string;
  /**
   * Whether the whole fleet shows that colour while the lights are controlled
   * from the GCS; released, the drones keep their own light program and only
   * the drones with a colour of their own are coloured.
   */
  fleetColorOn: boolean;
  /** The colour last given to the selected drones. */
  selectedColor: string;
  target: LightControlTarget;
};

const initialState: LightControlSliceState = {
  active: false,
  color: '#ffffff',
  fleetColorOn: true,
  selectedColor: '#ffffff',
  target: 'all',
};

// TODO: Remove unnecessary type checks and conversions!
const { actions, reducer } = createSlice({
  name: 'light-control',
  initialState,
  reducers: {
    // Internal action; do not use directly unless you know what you are
    // doing because chances are that you need a side effect that informs
    // the server about the change.
    setColor(state, action: PayloadAction<string>) {
      if (typeof action.payload === 'string') {
        state.color = action.payload;
      }
    },

    // Internal action; do not use directly unless you know what you are
    // doing because chances are that you need a side effect that informs
    // the server about the change.
    setLightControlActive(state, action: PayloadAction<boolean>) {
      state.active = Boolean(action.payload);
    },

    setFleetColorOn(state, action: PayloadAction<boolean>) {
      state.fleetColorOn = action.payload;
    },

    setSelectedColor(state, action: PayloadAction<string>) {
      state.selectedColor = action.payload;
    },

    setLightControlTarget(state, action: PayloadAction<LightControlTarget>) {
      state.target = action.payload;
    },
  },
});

export const {
  // Internal actions; do not use directly unless you know what you are
  // doing because chances are that you need a side effect that informs
  // the server about the change.
  setColor,
  setFleetColorOn,
  setLightControlActive,
  setLightControlTarget,
  setSelectedColor,
} = actions;

export default reducer;
