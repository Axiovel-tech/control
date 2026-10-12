export type ShowAudioPlayerState =
  | 'idle'
  | 'armed'
  | 'playing'
  | 'finished'
  | 'stopped'
  | 'error';

export type ShowAudioTrack = {
  sha256: string;
  name: string;
  mediaType: string;
  /** Duration of the track, in seconds */
  duration: number;
};

/**
 * State of the music player of the server, as reported by X-SHOW-AUDIO-INF.
 */
export type ShowAudioStatus = {
  track: ShowAudioTrack | null;
  state: ShowAudioPlayerState;
  /** Scheduled start of the show (and of the music), as a UNIX timestamp */
  startTime: number | null;
  /** Playback offset in milliseconds; positive values delay the music */
  offsetMs: number;
  device: string | null;
  error: string | null;
};

/**
 * Music embedded in a show file, as found in `media.audio` of the show
 * specification.
 */
export type ShowAudioSource = {
  data: unknown;
  mediaType?: string;
  filename?: string;
};

export type ShowAudioSyncState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'uploading'; progress: number }
  | { status: 'synced' }
  | { status: 'error'; error: string };
