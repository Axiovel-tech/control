/**
 * @file A dependency-light error-to-string helper for the RTLS feature.
 *
 * This mirrors `~/error-handling`'s `errorToString` but avoids importing that
 * module (which transitively pulls in the snackbar/MUI/logging chain), keeping
 * the RTLS message helpers importable in isolation (e.g. from unit tests).
 */

export function rtlsErrorToString(error: unknown, prefix?: string): string {
  const base =
    error !== null &&
    error !== undefined &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
      ? (error as { message: string }).message
      : String(error);

  return prefix ? `${prefix}: ${base}` : base;
}
