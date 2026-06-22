/**
 * @file UI mapping from {@link RtlsHealth} to the shared theme `Status` enum.
 *
 * Kept separate from `stats-utils.ts` so the latter stays free of UI
 * dependencies and easy to unit-test.
 */

import { Status } from '@skybrush/app-theme-mui';

import { RtlsHealth } from './stats-utils';

/**
 * Maps a {@link RtlsHealth} value to a `Status` from the shared theme so it can
 * drive a StatusLight.
 */
export function getStatusForHealth(health: RtlsHealth): Status {
  switch (health) {
    case RtlsHealth.OK:
      return Status.SUCCESS;
    case RtlsHealth.WARNING:
      return Status.WARNING;
    case RtlsHealth.ERROR:
      return Status.ERROR;
    default:
      return Status.OFF;
  }
}
