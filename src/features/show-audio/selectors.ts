import { createSelector } from '@reduxjs/toolkit';
import type { ShowSpecification } from '@skybrush/show-format';

import { getShowTitle } from '~/features/show/selectors';
import type { AppSelector } from '~/store/reducers';

import {
  type ShowAudioSource,
  type ShowAudioStatus,
  type ShowAudioSyncState,
  type ShowAudioTrack,
} from './types';

/**
 * Returns the specification of the currently loaded show, if any.
 */
export const getLoadedShow: AppSelector<ShowSpecification | undefined> = (
  state
) => state.show.data;

/**
 * Returns the music embedded in the currently loaded show, if any.
 */
export const getShowAudioSource: AppSelector<ShowAudioSource | undefined> = (
  state
) => state.show.data?.media?.audio;

/**
 * Returns the name under which the music of the loaded show is uploaded to the
 * server, or `undefined` if the show has no music.
 */
export const getShowAudioName: AppSelector<string | undefined> = (state) => {
  const source = getShowAudioSource(state);
  return source ? (source.filename ?? getShowTitle(state)) : undefined;
};

export const getShowAudioServerStatus: AppSelector<
  ShowAudioStatus | undefined
> = (state) => state.showAudio.server;

export const getShowAudioSyncState: AppSelector<ShowAudioSyncState> = (state) =>
  state.showAudio.sync;

/**
 * Returns the track loaded in the music player of the server if it is the
 * music of the currently loaded show.
 */
export const getServerTrackOfLoadedShow: AppSelector<
  ShowAudioTrack | undefined
> = createSelector(
  getShowAudioServerStatus,
  (state) => state.showAudio.localSha256,
  (server, localSha256) =>
    server?.track && localSha256 && server.track.sha256 === localSha256
      ? server.track
      : undefined
);
