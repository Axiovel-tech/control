import { type ShowAudioStatus } from './types';

/**
 * Whether the operator can stop the music of the server: while it plays or is
 * armed, and as long as a track is scheduled for a show start, which includes
 * the time after the music is committed to the show but not armed yet. Not
 * once an operator stop holds for that start.
 */
export const canStopMusic = (server?: ShowAudioStatus): boolean =>
  server?.state === 'armed' ||
  server?.state === 'playing' ||
  (server?.state !== 'stopped' &&
    Boolean(server?.track && server.startTime !== null));

/**
 * Applies an edited playback offset and returns the text the offset field
 * shows afterwards: the new value if the server accepted it, otherwise the
 * value the server confirmed last.
 */
export async function applyOffsetDraft(
  draft: string,
  confirmedOffsetMs: () => number,
  apply: (offsetMs: number) => Promise<boolean>
): Promise<string> {
  const offsetMs = Number(draft);
  if (
    draft.trim() === '' ||
    !Number.isInteger(offsetMs) ||
    offsetMs === confirmedOffsetMs()
  ) {
    return String(confirmedOffsetMs());
  }

  return (await apply(offsetMs))
    ? String(offsetMs)
    : String(confirmedOffsetMs());
}
