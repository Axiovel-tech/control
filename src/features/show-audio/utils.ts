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
