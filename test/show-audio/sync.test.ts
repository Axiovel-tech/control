import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { runSaga, stdChannel } from 'redux-saga';

jest.mock('~/message-hub', () => ({
  __esModule: true,
  default: { sendMessage: jest.fn() },
}));
jest.mock('~/features/servers/selectors', () => ({
  __esModule: true,
  isConnected: jest.fn(),
}));
jest.mock('~/features/servers/slice', () => {
  const type = 'servers/setCurrentServerConnectionState';
  return {
    __esModule: true,
    setCurrentServerConnectionState: Object.assign(
      (payload: string) => ({ type, payload }),
      { type }
    ),
  };
});
jest.mock('~/features/show/selectors', () => ({
  __esModule: true,
  getShowTitle: () => 'Untitled show',
  hasLoadedShowFile: (state: { show: { data?: unknown } }) =>
    Boolean(state.show.data),
}));
jest.mock('~/features/show/slice', () => {
  const type = 'show/loadingPromiseFulfilled';
  return {
    __esModule: true,
    loadingPromiseFulfilled: Object.assign(() => ({ type }), { type }),
  };
});

import { isConnected } from '~/features/servers/selectors';
import { setCurrentServerConnectionState } from '~/features/servers/slice';
import showAudioSaga, {
  synchronizeShowAudioWithServer,
  UPLOAD_CHUNK_SIZE,
} from '~/features/show-audio/saga';
import {
  setShowAudioServerStatus,
  setShowAudioSyncState,
} from '~/features/show-audio/slice';
import messageHub from '~/message-hub';
import { type ConnectionState } from '~/model/enums';

type Request = Record<string, unknown> & { type: string };
type Action = { type: string; payload?: unknown };

const sendMessage = (
  messageHub as unknown as {
    sendMessage: jest.Mock<(request: Request) => Promise<unknown>>;
  }
).sendMessage;

const AUDIO = Uint8Array.from(
  { length: 2 * UPLOAD_CHUNK_SIZE + 1000 },
  (_, index) => (index * 7) % 251
);
const AUDIO_SHA256 = createHash('sha256').update(AUDIO).digest('hex');

const showWithMusic = {
  show: {
    data: {
      media: {
        audio: {
          data: Buffer.from(AUDIO).toString('base64'),
          mediaType: 'audio/ogg',
          filename: 'click.ogg',
        },
      },
    },
  },
};
const showWithoutMusic = { show: { data: {} } };

/**
 * Minimal stand-in for the show_audio extension of the server that reassembles
 * uploaded chunks and loads the track once all bytes have arrived.
 */
function installFakeServer(track: Record<string, unknown> | null) {
  const server = {
    track,
    requests: [] as Request[],
    received: Buffer.alloc(0),
  };

  const respond = (request: Request) => {
    server.requests.push(request);

    switch (request.type) {
      case 'X-SHOW-AUDIO-INF':
        return {
          body: {
            type: 'X-SHOW-AUDIO-INF',
            track: server.track,
            state: 'idle',
            startTime: null,
            offsetMs: 40,
            device: 'default',
            error: null,
          },
        };

      case 'X-SHOW-AUDIO-UPLOAD': {
        const chunk = Buffer.from(request.data as string, 'base64');
        expect(request.offset).toBe(server.received.length);
        server.received = Buffer.concat([server.received, chunk]);
        if (server.received.length < (request.size as number)) {
          return { body: { type: 'X-SHOW-AUDIO-UPLOAD', result: 'partial' } };
        }

        const sha256 = createHash('sha256')
          .update(server.received)
          .digest('hex');
        expect(sha256).toBe(request.sha256);
        server.track = {
          sha256,
          name: request.name,
          mediaType: request.mediaType,
          duration: 70,
        };
        return { body: { type: 'X-SHOW-AUDIO-UPLOAD', result: 'loaded' } };
      }

      case 'X-SHOW-AUDIO-CLEAR':
        server.track = null;
        return { body: { type: 'ACK-ACK' } };

      default:
        return { body: { type: 'ACK-NAK', reason: 'No handler' } };
    }
  };

  sendMessage.mockImplementation((request: Request) =>
    Promise.resolve(respond(request))
  );

  return server;
}

async function runSync(state: unknown) {
  const dispatched: Action[] = [];
  await runSaga(
    {
      dispatch: (action: Action) => dispatched.push(action),
      getState: () => state,
    },
    synchronizeShowAudioWithServer as () => Generator
  ).toPromise();
  return dispatched;
}

const lastSyncState = (dispatched: Action[]) =>
  dispatched.filter((a) => a.type === setShowAudioSyncState.type).at(-1)
    ?.payload;

const requestTypes = (requests: Request[]) => requests.map((r) => r.type);

async function waitUntil(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 1000 && !condition(); i++) {
    await new Promise(setImmediate);
  }
}

describe('show music synchronization', () => {
  beforeEach(() => {
    sendMessage.mockReset();
  });

  test('uploads the music in chunks of at most 256 KiB when the server track differs', async () => {
    const server = installFakeServer({ sha256: 'other', name: 'old.mp3' });

    const dispatched = await runSync(showWithMusic);

    const uploads = server.requests.filter(
      (r) => r.type === 'X-SHOW-AUDIO-UPLOAD'
    );
    expect(uploads.map((r) => r.offset)).toEqual([
      0,
      UPLOAD_CHUNK_SIZE,
      2 * UPLOAD_CHUNK_SIZE,
    ]);
    for (const upload of uploads) {
      expect(upload).toMatchObject({
        sha256: AUDIO_SHA256,
        name: 'click.ogg',
        mediaType: 'audio/ogg',
        size: AUDIO.length,
      });
      expect(
        Buffer.from(upload.data as string, 'base64').length
      ).toBeLessThanOrEqual(UPLOAD_CHUNK_SIZE);
    }

    expect(server.track).toMatchObject({ sha256: AUDIO_SHA256 });
    expect(lastSyncState(dispatched)).toEqual({ status: 'synced' });
    expect(
      dispatched.filter((a) => a.type === setShowAudioServerStatus.type).at(-1)
        ?.payload
    ).toMatchObject({ track: { sha256: AUDIO_SHA256 }, offsetMs: 40 });
  });

  test('does not upload when the server already has the same track', async () => {
    const server = installFakeServer({ sha256: AUDIO_SHA256, name: 'x' });

    const dispatched = await runSync(showWithMusic);

    expect(requestTypes(server.requests)).toEqual(['X-SHOW-AUDIO-INF']);
    expect(lastSyncState(dispatched)).toEqual({ status: 'synced' });
  });

  test('clears the player of the server when the show has no music', async () => {
    const server = installFakeServer({ sha256: AUDIO_SHA256, name: 'x' });

    await runSync(showWithoutMusic);

    expect(requestTypes(server.requests)).toEqual([
      'X-SHOW-AUDIO-INF',
      'X-SHOW-AUDIO-CLEAR',
      'X-SHOW-AUDIO-INF',
    ]);
    expect(server.track).toBeNull();
  });

  test('a server without a music player is an error only for a show with music', async () => {
    sendMessage.mockImplementation(() =>
      Promise.resolve({ body: { type: 'ACK-NAK', reason: 'No handler' } })
    );

    expect(lastSyncState(await runSync(showWithMusic))).toEqual({
      status: 'error',
      error: 'No handler',
    });
    expect(lastSyncState(await runSync(showWithoutMusic))).toEqual({
      status: 'idle',
    });
  });

  test('re-checks the track of the server after a reconnection', async () => {
    const server = installFakeServer({ sha256: AUDIO_SHA256, name: 'x' });
    const channel = stdChannel();
    let connected = true;
    (isConnected as jest.Mock).mockImplementation(() => connected);

    const task = runSaga(
      {
        channel,
        dispatch: (action: Action) => channel.put(action),
        getState: () => showWithMusic,
      },
      showAudioSaga as () => Generator
    );
    await waitUntil(() => server.requests.length >= 1);
    expect(requestTypes(server.requests)).toEqual(['X-SHOW-AUDIO-INF']);

    connected = false;
    channel.put(
      setCurrentServerConnectionState('disconnected' as ConnectionState)
    );
    connected = true;
    channel.put(
      setCurrentServerConnectionState('connected' as ConnectionState)
    );
    await waitUntil(() => server.requests.length >= 2);

    expect(requestTypes(server.requests)).toEqual([
      'X-SHOW-AUDIO-INF',
      'X-SHOW-AUDIO-INF',
    ]);
    task.cancel();
  });
});
