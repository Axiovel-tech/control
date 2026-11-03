/**
 * @file Slice of the state object that stores the state of the music player of
 * the server and the synchronization of the music of the loaded show with it.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { noPayload } from '~/utils/redux';

import { type ShowAudioStatus, type ShowAudioSyncState } from './types';

type ShowAudioSliceState = {
  /** Last state of the music player reported by the server */
  server?: ShowAudioStatus;

  /** SHA-256 hash of the music of the loaded show, once computed */
  localSha256?: string;

  sync: ShowAudioSyncState;
};

const initialState: ShowAudioSliceState = {
  server: undefined,
  localSha256: undefined,
  sync: { status: 'idle' },
};

const { actions, reducer } = createSlice({
  name: 'showAudio',
  initialState,
  reducers: {
    clearShowAudioServerStatus: noPayload<ShowAudioSliceState>((state) => {
      state.server = undefined;
      state.sync = { status: 'idle' };
    }),

    setLocalShowAudioHash(state, action: PayloadAction<string | undefined>) {
      state.localSha256 = action.payload;
    },

    setShowAudioServerStatus(state, action: PayloadAction<ShowAudioStatus>) {
      state.server = action.payload;
    },

    setShowAudioSyncState(state, action: PayloadAction<ShowAudioSyncState>) {
      state.sync = action.payload;
    },
  },
});

export const {
  clearShowAudioServerStatus,
  setLocalShowAudioHash,
  setShowAudioServerStatus,
  setShowAudioSyncState,
} = actions;

export default reducer;
