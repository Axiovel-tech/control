/**
 * @file Bookkeeping for the position-estimate debug stream ownership of the
 * "Debug Pos Estimates" panel.
 *
 * The stream is a per-device firmware parameter (`POS_DBG_HZ`, persistent on
 * the device), so a panel that enabled it MUST disable it again when it goes
 * away (tab switch, panel close) — otherwise every tag keeps emitting at
 * 10 Hz forever, silently defeating the off-by-default design and burning
 * the tag's WiFi TX budget. The guard tracks exactly which devices the panel
 * enabled, so teardown never touches devices that were streaming for some
 * other reason (e.g. a bench script or another operator).
 *
 * Kept free of React/Redux so the ownership semantics are unit-testable; the
 * panel wires it into an unmount effect.
 */

import { type PosDebugStreamResult } from './pos-actions';

export class PosStreamGuard {
  private readonly enabled = new Set<string>();

  /** Device ids currently owed a disable by the owner of this guard. */
  get size(): number {
    return this.enabled.size;
  }

  /**
   * Records the outcome of an enable request: devices that accepted the
   * write are now owed a disable on teardown. Idempotent.
   */
  noteEnabled(results: PosDebugStreamResult[]): void {
    for (const result of results) {
      if (result.accepted) {
        this.enabled.add(result.id);
      }
    }
  }

  /**
   * Records the outcome of an explicit disable request: devices that
   * accepted the write are no longer owed anything. Devices that failed the
   * disable stay tracked so teardown retries them.
   */
  noteDisabled(results: PosDebugStreamResult[]): void {
    for (const result of results) {
      if (result.accepted) {
        this.enabled.delete(result.id);
      }
    }
  }

  /**
   * Returns the device ids owed a disable and clears the guard — the caller
   * takes over the responsibility (used by the teardown path, which cannot
   * retry). Disabling is idempotent device-side, so a double release is
   * harmless.
   */
  takeForRelease(): string[] {
    const ids = [...this.enabled];
    this.enabled.clear();
    return ids;
  }
}
