/**
 * @file Saga that keeps the music player of the server loaded with the music
 * of the currently loaded show.
 *
 * The music is (re)synchronized when a show is loaded and every time the
 * connection to the server is (re)established. The upload is skipped when the
 * server already holds a track with the same SHA-256 hash.
 */

import { Base64 } from 'js-base64';
import type { Task } from 'redux-saga';
import {
  call,
  cancel,
  fork,
  put,
  race,
  select,
  take,
} from 'redux-saga/effects';

import { isConnected } from '~/features/servers/selectors';
import { setCurrentServerConnectionState } from '~/features/servers/slice';
import { hasLoadedShowFile } from '~/features/show/selectors';
import { loadingPromiseFulfilled } from '~/features/show/slice';
import messageHub from '~/message-hub';

import {
  clearShowAudio,
  queryShowAudioStatus,
  reasonOf,
  uploadShowAudioChunk,
} from './messages';
import { getShowAudioName, getShowAudioSource } from './selectors';
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

function* uploadTrack(track: PreparedTrack): Generator {
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
  }

  if (!loaded) {
    throw new Error('The server did not load the uploaded music');
  }
}

/**
 * Makes the track of the music player of the server match the music of the
 * loaded show: uploads it if the server has a different track (or none), and
 * clears the player if the show has no music.
 *
 * Exported for testing only.
 */
export function* synchronizeShowAudioWithServer(): Generator {
  try {
    yield put(setShowAudioSyncState({ status: 'checking' }));

    const hasShow = (yield select(hasLoadedShowFile)) as boolean;
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
      status = (yield call(
        queryShowAudioStatus,
        messageHub
      )) as ShowAudioStatus;
    } catch (error) {
      // A server without a music player is a problem only for a show with music
      if (track) {
        throw error;
      }

      yield put(setShowAudioSyncState({ status: 'idle' }));
      return;
    }

    yield put(setShowAudioServerStatus(status));

    if (!hasShow) {
      yield put(setShowAudioSyncState({ status: 'idle' }));
      return;
    }

    if (track && status.track?.sha256 !== track.sha256) {
      yield call(uploadTrack, track);
    } else if (!track && status.track) {
      yield call(clearShowAudio, messageHub);
    } else {
      yield put(setShowAudioSyncState({ status: 'synced' }));
      return;
    }

    status = (yield call(queryShowAudioStatus, messageHub)) as ShowAudioStatus;
    yield put(setShowAudioServerStatus(status));
    yield put(setShowAudioSyncState({ status: 'synced' }));
  } catch (error) {
    yield put(
      setShowAudioSyncState({ status: 'error', error: reasonOf(error) })
    );
  }
}

/**
 * Synchronizes the music once, then again whenever a new show is loaded,
 * abandoning any synchronization still in progress for the previous show.
 */
function* synchronizeShowAudioWhileConnected(): Generator {
  let task = (yield fork(synchronizeShowAudioWithServer)) as Task;

  while (true) {
    yield take(loadingPromiseFulfilled.type);
    yield cancel(task);
    task = (yield fork(synchronizeShowAudioWithServer)) as Task;
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
