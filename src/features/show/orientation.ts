/**
 * @file Normalization helper for the show orientation angle.
 *
 * Firmware contract (AC_DroneShowManager, AVCopter): the `SHOW_ORIENTATION`
 * parameter treats `orientation_deg >= 0` as "orientation set by the user"
 * and ANY negative value as the unset sentinel (-1 by convention, but the
 * check is `>= 0`; see `AC_DroneShowManager_Parameters.cpp:373-375`).
 * Writing a negative angle therefore silently marks the show as NOT
 * configured: `DroneShowPreflightCheck_ShowNotConfiguredYet` fires, the
 * drones pulse yellow and refuse to start — and since the low preflight bits
 * are masked out of the drone-show status packet, the GUI shows no reason.
 * This blocked a live show on 2026-07-21 when the show fitting produced a
 * perfectly valid orientation of -1.4°.
 *
 * Hence: every orientation angle sent towards the drones must be normalized
 * into [0, 360) first.
 */

/**
 * Normalizes a show orientation angle (in degrees, given as a number or a
 * numeric string) into the [0, 360) range.
 *
 * Values already in [0, 360) are returned unchanged (idempotent, preserving
 * the exact string representation); non-finite input is returned as-is so
 * the caller's own validation can deal with it.
 */
export function normalizeShowOrientation<T extends number | string>(
  orientation: T
): T | number | string {
  const value =
    typeof orientation === 'number'
      ? orientation
      : Number.parseFloat(orientation);
  if (!Number.isFinite(value)) {
    return orientation;
  }

  if (value >= 0 && value < 360) {
    // Already in range: idempotent, preserving the exact representation.
    return orientation;
  }

  // The double modulo may leave floating-point noise (e.g. -347.7 would
  // yield 12.300000000000011); rounding to 6 decimals keeps the result tidy
  // without losing meaningful precision. The rounding can land on 360
  // exactly for values just below a multiple of 360, hence the final wrap.
  const normalized = Number((((value % 360) + 360) % 360).toFixed(6)) % 360;

  return typeof orientation === 'number' ? normalized : String(normalized);
}
