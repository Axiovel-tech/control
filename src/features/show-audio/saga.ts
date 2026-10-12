/**
 * @file Saga that keeps the music player of the server loaded with the music
 * of the currently loaded show.
 *
 * The music is (re)synchronized when a show is loaded and every time the
 * connection to the server is (re)established. The upload is skipped when the
 * server already holds a track with the same SHA-256 hash.
 */

import { Base64 } from 'js-base64';
import type { Action } from 'redux';
import { buffers, type Channel } from 'redux-saga';
import {
  actionChannel,
  call,
  put,
  race,
  select,
  take,
} from 'redux-saga/effects';

import { isConnected } from '~/features/servers/selectors';
import { setCurrentServerConnectionState } from '~/features/servers/slice';
import { loadingPromiseFulfilled } from '~/features/show/slice';
import messageHub from '~/message-hub';

import {
  clearShowAudio,
  queryShowAudioStatus,
  reasonOf,
  uploadShowAudioChunk,
} from './messages';
import {
  getLoadedShow,
  getShowAudioName,
  getShowAudioSource,
} from './selectors';
import {
  clearShowAudioServerStatus,
  setLocalShowAudioHash,
  setShowAudioServerStatus,
  setShowAudioSyncState,
} from './slice';
import { type ShowAudioSource, type ShowAudioStatus } from './types';

/** Maximum number of decoded bytes sent in a single upload message */
export const UPLOAD_CHUNK_SIZE = 256 * 1024;

type PreparedTrack = {
  bytes: Uint8Array;
  sha256: string;
  name: string;
  mediaType: string;
};

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

async function prepareTrack(
  source: ShowAudioSource,
  name: string
): Promise<PreparedTrack> {
  if (typeof source.data !== 'string') {
    throw new TypeError('The music of the show is not embedded in base64');
  }

  const bytes = Uint8Array.from(Base64.toUint8Array(source.data));
  return {
    bytes,
    sha256: await sha256Hex(bytes),
    name,
    mediaType: source.mediaType ?? 'audio/mpeg',
  };
}

/**
 * One pass of making the track of the music player of the server match the
 * music of the loaded show: uploads it if the server has a different track (or
 * none), and clears the player if the show has no music.
 *
 * Every request is awaited until the server answers it. When another show was
 * loaded in the meantime, the pass stops there and returns `false` so the
 * caller reconciles again against the new show; abandoning a request instead
 * would let a track still decoding on the server replace the music of the
 * new show after it was checked.
 */
function* reconcileWithLoadedShow(): Generator {
  yield put(setShowAudioSyncState({ status: 'checking' }));

  const show = yield select(getLoadedShow);
  const source = (yield select(getShowAudioSource)) as
    | ShowAudioSource
    | undefined;
  let track: PreparedTrack | undefined;
  if (source) {
    const name = (yield select(getShowAudioName)) as string;
    track = (yield call(prepareTrack, source, name)) as PreparedTrack;
  }

  yield put(setLocalShowAudioHash(track?.sha256));

  let status: ShowAudioStatus;
  try {
    status = (yield call(queryShowAudioStatus, messageHub)) as ShowAudioStatus;
  } catch (error) {
    // A server without a music player is a problem only for a show with music
    if (track) {
      throw error;
    }

    yield put(setShowAudioSyncState({ status: 'idle' }));
    return true;
  }

  yield put(setShowAudioServerStatus(status));

  if ((yield select(getLoadedShow)) !== show) {
    return false;
  }

  if (!show) {
    yield put(setShowAudioSyncState({ status: 'idle' }));
    return true;
  }

  if (track && status.track?.sha256 !== track.sha256) {
    const { bytes, ...header } = track;
    const size = bytes.length;
    let loaded = false;

    for (let offset = 0; offset < size; offset += UPLOAD_CHUNK_SIZE) {
      yield put(
        setShowAudioSyncState({ status: 'uploading', progress: offset / size })
      );
      loaded = (yield call(uploadShowAudioChunk, messageHub, {
        ...header,
        size,
        offset,
        data: Base64.fromUint8Array(
          bytes.subarray(offset, offset + UPLOAD_CHUNK_SIZE)
        ),
      })) as boolean;

      if ((yield select(getLoadedShow)) !== show) {
        return false;
      }
    }

    if (!loaded) {
      throw new Error('The server did not load the uploaded music');
    }
  } else if (!track && status.track) {
    yield call(clearShowAudio, messageHub);

    if ((yield select(getLoadedShow)) !== show) {
      return false;
    }
  } else {
    yield put(setShowAudioSyncState({ status: 'synced' }));
    return true;
  }

  status = (yield call(queryShowAudioStatus, messageHub)) as ShowAudioStatus;
  yield put(setShowAudioServerStatus(status));
  yield put(setShowAudioSyncState({ status: 'synced' }));
  return true;
}

/**
 * Makes the track of the music player of the server match the music of the
 * loaded show, following any show loaded while it works.
 *
 * Exported for testing only.
 */
export function* synchronizeShowAudioWithServer(): Generator {
  try {
    let done = false;
    while (!done) {
      done = (yield call(reconcileWithLoadedShow)) as boolean;
    }
  } catch (error) {
    yield put(
      setShowAudioSyncState({ status: 'error', error: reasonOf(error) })
    );
  }
}

/**
 * Synchronizes the music once, then again whenever a new show is loaded. A
 * single worker does it, so requests for different shows never overlap.
 */
function* synchronizeShowAudioWhileConnected(): Generator {
  const showLoaded = yield actionChannel(
    loadingPromiseFulfilled.type,
    buffers.sliding(1)
  );

  while (true) {
    yield call(synchronizeShowAudioWithServer);
    yield take(showLoaded as Channel<Action>);
  }
}

/**
 * Root saga of the show music feature. The synchronization is scoped to a
 * single connection so a reconnect re-checks the track of the server.
 */
export default function* showAudioSaga(): Generator {
  while (true) {
    const connected = (yield select(isConnected)) as boolean;

    if (connected) {
      yield race({
        sync: call(synchronizeShowAudioWhileConnected),
        connectionStateChanged: take(setCurrentServerConnectionState.type),
      });
    } else {
      yield put(clearShowAudioServerStatus());
      yield take(setCurrentServerConnectionState.type);
    }
  }
}
