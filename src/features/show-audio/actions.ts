import { showError } from '~/features/snackbar/actions';
import i18n from '~/i18n';
import messageHub from '~/message-hub';
import { type AppDispatch, type AppThunk } from '~/store/reducers';

import {
  queryShowAudioStatus,
  reasonOf,
  setShowAudioOffset,
  stopShowAudio,
} from './messages';
import { setShowAudioServerStatus } from './slice';

const refreshServerStatus = async (dispatch: AppDispatch): Promise<void> => {
  dispatch(setShowAudioServerStatus(await queryShowAudioStatus(messageHub)));
};

/**
 * Thunk that stops the music player of the server immediately.
 */
export const stopShowMusic =
  (): AppThunk<Promise<void>> => async (dispatch) => {
    try {
      await stopShowAudio(messageHub);
      await refreshServerStatus(dispatch);
    } catch (error) {
      showError(i18n.t('show.music.stopFailed', { error: reasonOf(error) }));
    }
  };

/**
 * Thunk that sets the playback offset of the music player of the server.
 * Resolves to whether the server accepted it.
 */
export const setShowMusicOffset =
  (offsetMs: number): AppThunk<Promise<boolean>> =>
  async (dispatch) => {
    try {
      await setShowAudioOffset(messageHub, offsetMs);
      await refreshServerStatus(dispatch);
      return true;
    } catch (error) {
      showError(i18n.t('show.music.offsetFailed', { error: reasonOf(error) }));
      return false;
    }
  };
