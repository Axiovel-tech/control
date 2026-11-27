/**
 * @file State slice for mirroring the current workbench layout.
 */

import { type IWorkbenchState, type Workbench } from 'react-flexible-workbench';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * How the workbench is laid out: `regular` is the arrangement the user works
 * with on a wide window, `compact` is the single stack of tabs that replaces
 * it while the window is too narrow for panels side by side.
 */
export type WorkbenchLayoutMode = 'regular' | 'compact';

type WorkbenchSliceState = {
  /** Stores whether the panel headers are hidden on the workbench */
  hideHeaders: boolean;

  /** The layout mode that `state` belongs to */
  layoutMode: WorkbenchLayoutMode;

  /**
   * The regular layout, set aside while the workbench is in compact mode so
   * it can be brought back unchanged when the window becomes wide again.
   */
  regularState?: IWorkbenchState;

  /** Stores whether the current workbench layout is fixed */
  isFixed: boolean;

  /**
   * Default workbench state is in src/workbench.js because the
   * Redux store only 'follows' the workbench state, it does not
   * define it in the usual sense (due to limitations in how
   * golden-layout works)
   */
  state?: IWorkbenchState;
};

const initialState: WorkbenchSliceState = {
  hideHeaders: false,
  layoutMode: 'regular',
  isFixed: false,
  state: undefined,
};

const { actions, reducer } = createSlice({
  name: 'workbench',
  initialState,
  reducers: {
    setWorkbenchHasHeaders(
      state,
      { payload: hasHeaders }: PayloadAction<boolean>
    ) {
      state.hideHeaders = !(hasHeaders ?? true);
    },

    setWorkbenchIsFixed(state, { payload: isFixed }: PayloadAction<boolean>) {
      state.isFixed = isFixed ?? false;
    },

    enterCompactLayout(
      state,
      { payload: regularState }: PayloadAction<IWorkbenchState | undefined>
    ) {
      state.layoutMode = 'compact';
      state.regularState = regularState;
    },

    leaveCompactLayout(state) {
      state.layoutMode = 'regular';
      state.regularState = undefined;
    },

    saveWorkbenchState: {
      prepare(workbench: Workbench) {
        return {
          payload: workbench.getState(),
        };
      },

      reducer(state, action: PayloadAction<IWorkbenchState>) {
        state.state = action.payload;
      },
    },
  },
});

export const {
  enterCompactLayout,
  leaveCompactLayout,
  setWorkbenchIsFixed,
  setWorkbenchHasHeaders,
  saveWorkbenchState,
} = actions;

export default reducer;
