/**
 * @file Ownership and lifecycle control of the position-estimate debug
 * stream for the "Debug Pos Estimates" panel.
 *
 * The stream is a per-device firmware parameter (`POS_DBG_HZ`, persistent on
 * the device), so whoever turns it on owns turning it off again. Getting
 * this right has three hard cases, all handled here rather than in React:
 *
 * - **In-flight enable vs. unmount**: an enable that resolves after the
 *   panel is gone must still be disabled. All operations run on one FIFO
 *   queue, so a teardown queued at unmount always executes after any
 *   in-flight enable and pays whatever debt it recorded — and an enable
 *   that only gets its turn after its issuing panel generation died is
 *   skipped outright (nothing is written that nobody would own).
 * - **Remount races**: a quickly re-opened panel acquires a new generation
 *   and its operations queue behind the previous generation's teardown, so
 *   an old teardown's `POS_DBG_HZ=0` can never land on top of the new
 *   panel's enable.
 * - **Shared streams**: a device already streaming (enabled by a bench
 *   script, another GCS, or a crashed session) is *used, not claimed*: the
 *   controller only takes ownership when it actually transitions a device
 *   from 0 to a nonzero rate, so teardown never yanks a stream from under
 *   another owner. (Read-then-write is not atomic; two clients enabling the
 *   same device in the same instant can still cross — acceptable for a
 *   debug feature.)
 *
 * Teardown is *confirmed*: ownership of a device is only released once the
 * device acknowledged `POS_DBG_HZ=0`; failed writes are retried with
 * exponential backoff a bounded number of times, and leftover debt is kept
 * (a later release retries it again) and surfaced through
 * `onReleaseFailure` so the operator learns the manual remedy.
 *
 * The class is used as a module-level singleton (constructed in
 * `pos-actions.ts`): ownership must survive panel unmount/remount, and a
 * single queue is what serializes the races above. Kept free of
 * React/Redux so all of it is unit-testable; the panel wires `acquire`/
 * `release` into a mount effect.
 */

/** Parameter I/O the controller needs, injected for testability. */
export type PosStreamParamOps = {
  /** Reads the device's current `POS_DBG_HZ` (0 = not streaming). */
  readRate: (id: string) => Promise<number>;
  /**
   * Writes `POS_DBG_HZ`; resolves `true` when the device acknowledged and
   * accepted the value. Expected to reject on transport errors.
   */
  writeRate: (id: string, rateHz: number) => Promise<boolean>;
};

/** A per-device failure of an enable or disable operation. */
export type PosStreamFailure = {
  id: string;
  error?: string;
};

/** Outcome of an enable operation. */
export type PosStreamEnableOutcome = {
  /** Devices this controller now owns (it transitioned them 0 -> rate). */
  enabled: string[];
  /** Devices already streaming for another owner: used, not claimed. */
  shared: string[];
  failed: PosStreamFailure[];
  /**
   * `false` when the enable got its queue turn only after its issuing
   * generation had been released/replaced: nothing was written.
   */
  ran: boolean;
};

/** Outcome of a disable/release operation. */
export type PosStreamDisableOutcome = {
  /** Devices confirmed off (ownership released). */
  disabled: string[];
  /** Devices still owed a disable (ownership retained for a retry). */
  failed: PosStreamFailure[];
};

export type PosStreamControllerOptions = {
  /** Disable retries beyond the first attempt (default 2). */
  retries?: number;
  /** Base backoff between disable attempts, doubled per retry (default 500 ms). */
  backoffMs?: number;
  /** Sleep implementation, injectable for tests. */
  delay?: (ms: number) => Promise<void>;
  /**
   * Called with the device ids whose disable could not be confirmed after
   * all retries. The debt is retained; a later release retries it.
   */
  onReleaseFailure?: (ids: string[]) => void;
};

const defaultDelay = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export class PosStreamController {
  private generation = 0;
  private readonly owned = new Set<string>();
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly ops: PosStreamParamOps,
    private readonly options: PosStreamControllerOptions = {}
  ) {}

  /** Device ids currently owed a disable by this controller. */
  get ownedIds(): string[] {
    return [...this.owned];
  }

  /**
   * Registers a new panel instance and returns its generation token. Every
   * `enable`/`disable` call must pass the token; operations from an older
   * generation are skipped when they get their queue turn.
   */
  acquire(): number {
    return ++this.generation;
  }

  /**
   * Enables the stream on the given devices at the given rate, claiming
   * ownership only of the devices actually transitioned from 0. Serialized
   * behind any pending operation (in particular a previous generation's
   * teardown).
   */
  async enable(
    generation: number,
    ids: string[],
    rateHz: number
  ): Promise<PosStreamEnableOutcome> {
    return this.run(async () => {
      if (generation !== this.generation) {
        // The issuing panel died (or was replaced) before this operation
        // got its turn; enabling now would start streams nobody owns.
        return { enabled: [], shared: [], failed: [], ran: false };
      }

      const outcome: PosStreamEnableOutcome = {
        enabled: [],
        shared: [],
        failed: [],
        ran: true,
      };
      await Promise.all(
        ids.map(async (id) => {
          try {
            if (this.owned.has(id)) {
              // already ours from an earlier enable; idempotent
              outcome.enabled.push(id);
              return;
            }

            const current = await this.ops.readRate(id);
            if (current > 0) {
              // Already streaming for another owner: use it, do not claim
              // it (and do not clobber its rate).
              outcome.shared.push(id);
              return;
            }

            const accepted = await this.ops.writeRate(id, rateHz);
            if (accepted) {
              this.owned.add(id);
              outcome.enabled.push(id);
            } else {
              outcome.failed.push({
                id,
                error: 'device rejected the parameter write',
              });
            }
          } catch (error) {
            outcome.failed.push({ id, error: errorMessage(error) });
          }
        })
      );
      return outcome;
    });
  }

  /**
   * Explicitly disables the streams this controller owns (never shared
   * ones). Ownership is released per device only once the device confirmed
   * the write.
   */
  async disable(generation: number): Promise<PosStreamDisableOutcome> {
    return this.run(async () => {
      if (generation !== this.generation) {
        return { disabled: [], failed: [] };
      }

      return this.disableOwnedConfirmed();
    });
  }

  /**
   * Teardown for a panel generation: pays the whole ownership debt,
   * whatever generation recorded it (the debt is generation-independent,
   * and FIFO ordering guarantees a newer generation's operations queue
   * after this). Failures keep their debt for a later retry and are
   * surfaced through `onReleaseFailure`.
   */
  async release(_generation: number): Promise<PosStreamDisableOutcome> {
    return this.run(async () => {
      const outcome = await this.disableOwnedConfirmed();
      if (outcome.failed.length > 0) {
        this.options.onReleaseFailure?.(outcome.failed.map(({ id }) => id));
      }

      return outcome;
    });
  }

  /** Appends a task to the FIFO queue shared by all operations. */
  private async run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  /**
   * Writes `POS_DBG_HZ=0` to every owned device, releasing ownership only
   * on a confirmed accept, with bounded exponential-backoff retries for
   * the rest.
   */
  private async disableOwnedConfirmed(): Promise<PosStreamDisableOutcome> {
    const retries = this.options.retries ?? 2;
    const backoffMs = this.options.backoffMs ?? 500;
    const delay = this.options.delay ?? defaultDelay;

    const disabled: string[] = [];
    const errors = new Map<string, string | undefined>();
    let pending = [...this.owned];

    for (let attempt = 0; attempt <= retries && pending.length > 0; attempt++) {
      if (attempt > 0) {
        await delay(backoffMs * 2 ** (attempt - 1));
      }

      const stillPending: string[] = [];
      await Promise.all(
        pending.map(async (id) => {
          try {
            const accepted = await this.ops.writeRate(id, 0);
            if (accepted) {
              this.owned.delete(id);
              disabled.push(id);
            } else {
              errors.set(id, 'device rejected the parameter write');
              stillPending.push(id);
            }
          } catch (error) {
            errors.set(id, errorMessage(error));
            stillPending.push(id);
          }
        })
      );
      pending = stillPending;
    }

    return {
      disabled,
      failed: pending.map((id) => ({ id, error: errors.get(id) })),
    };
  }
}
