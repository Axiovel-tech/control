import { describe, expect, jest, test } from '@jest/globals';

import {
  PosStreamController,
  type PosStreamParamOps,
} from '~/features/rtls/pos-stream-guard';

/** One controllable pending write. */
type PendingWrite = {
  id: string;
  rateHz: number;
  resolve: (accepted: boolean) => void;
  reject: (error: Error) => void;
};

/**
 * Fake parameter I/O. In auto mode writes resolve immediately; in manual
 * mode they queue in `pendingWrites` and the test steps them, which is how
 * the in-flight / remount races are reproduced deterministically.
 */
class FakeOps implements PosStreamParamOps {
  rates = new Map<string, number>();
  writeLog: Array<{ id: string; rateHz: number }> = [];
  pendingWrites: PendingWrite[] = [];
  manual = false;
  /** id -> number of times a write to it must still fail (accepted=false) */
  failuresLeft = new Map<string, number>();

  readRate(id: string): Promise<number> {
    return Promise.resolve(this.rates.get(id) ?? 0);
  }

  async writeRate(id: string, rateHz: number): Promise<boolean> {
    this.writeLog.push({ id, rateHz });
    if (this.manual) {
      return new Promise<boolean>((resolve, reject) => {
        this.pendingWrites.push({ id, rateHz, resolve, reject });
      });
    }

    const failures = this.failuresLeft.get(id) ?? 0;
    if (failures > 0) {
      this.failuresLeft.set(id, failures - 1);
      return false;
    }

    this.rates.set(id, rateHz);
    return true;
  }

  /** Resolves the oldest pending write. */
  step(accepted = true): void {
    const write = this.pendingWrites.shift();
    if (!write) {
      throw new Error('no pending write to step');
    }

    if (accepted) {
      this.rates.set(write.id, write.rateHz);
    }

    write.resolve(accepted);
  }
}

/** Yields to the microtask queue enough times for chained ops to settle. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

const immediateDelay = (): Promise<void> => Promise.resolve();

describe('PosStreamController', () => {
  test('claims only devices it transitioned from 0 (already-streaming stays foreign)', async () => {
    const ops = new FakeOps();
    ops.rates.set('2', 5); // already streaming for someone else
    const controller = new PosStreamController(ops, {
      delay: immediateDelay,
    });
    const generation = controller.acquire();

    const outcome = await controller.enable(generation, ['1', '2'], 10);
    expect(outcome).toMatchObject({
      enabled: ['1'],
      shared: ['2'],
      failed: [],
      ran: true,
    });
    // the foreign stream was neither claimed nor its rate clobbered
    expect(ops.writeLog).toEqual([{ id: '1', rateHz: 10 }]);
    expect(ops.rates.get('2')).toBe(5);

    // teardown pays only our own debt
    const released = await controller.release(generation);
    expect(released.disabled).toEqual(['1']);
    expect(ops.writeLog).toEqual([
      { id: '1', rateHz: 10 },
      { id: '1', rateHz: 0 },
    ]);
    expect(ops.rates.get('2')).toBe(5);
  });

  test('an enable in flight at unmount is still torn down (no leak)', async () => {
    const ops = new FakeOps();
    ops.manual = true;
    const controller = new PosStreamController(ops, {
      delay: immediateDelay,
    });
    const generation = controller.acquire();

    const enabling = controller.enable(generation, ['1'], 10);
    await settle(); // the enable is now awaiting its parameter write

    // the panel unmounts while the write is in flight
    const releasing = controller.release(generation);

    ops.step(true); // the enable's write resolves after the unmount
    const outcome = await enabling;
    expect(outcome.enabled).toEqual(['1']);

    await settle();
    ops.step(true); // the queued teardown's POS_DBG_HZ=0 write
    const released = await releasing;
    expect(released.disabled).toEqual(['1']);
    expect(controller.ownedIds).toEqual([]);
    expect(ops.writeLog).toEqual([
      { id: '1', rateHz: 10 },
      { id: '1', rateHz: 0 },
    ]);
  });

  test('remount serializes behind the previous teardown (no interleaving)', async () => {
    const ops = new FakeOps();
    ops.manual = true;
    const controller = new PosStreamController(ops, {
      delay: immediateDelay,
    });

    const gen1 = controller.acquire();
    const enabling1 = controller.enable(gen1, ['1'], 10);
    await settle();

    // unmount + immediate remount + new enable, all while gen1's write is
    // still in flight
    const releasing1 = controller.release(gen1);
    const gen2 = controller.acquire();
    const enabling2 = controller.enable(gen2, ['1'], 10);

    ops.step(true); // gen1 enable write resolves
    await enabling1;
    await settle();
    ops.step(true); // gen1 teardown write (rate 0)
    await releasing1;
    await settle();
    ops.step(true); // gen2 enable write
    const outcome2 = await enabling2;

    expect(outcome2.enabled).toEqual(['1']);
    expect(controller.ownedIds).toEqual(['1']);
    // strict order: enable(10), teardown(0), enable(10) — the old teardown
    // can never land on top of the new panel's stream
    expect(ops.writeLog).toEqual([
      { id: '1', rateHz: 10 },
      { id: '1', rateHz: 0 },
      { id: '1', rateHz: 10 },
    ]);
  });

  test('an enable that gets its turn after its generation died is skipped', async () => {
    const ops = new FakeOps();
    ops.manual = true;
    const controller = new PosStreamController(ops, {
      delay: immediateDelay,
    });

    const gen1 = controller.acquire();
    const enabling1 = controller.enable(gen1, ['1'], 10);
    await settle();
    const releasing1 = controller.release(gen1);
    controller.acquire(); // a new panel exists; gen1 is dead
    const staleEnable = controller.enable(gen1, ['2'], 10); // queued, stale

    ops.step(true); // gen1 enable
    await enabling1;
    await settle();
    ops.step(true); // gen1 teardown
    await releasing1;

    const outcome = await staleEnable;
    expect(outcome).toEqual({
      enabled: [],
      shared: [],
      failed: [],
      ran: false,
    });
    // device 2 was never written: nothing was started that nobody owns
    expect(ops.writeLog.filter(({ id }) => id === '2')).toEqual([]);
  });

  test('teardown keeps ownership until the disable is confirmed, with retries', async () => {
    const ops = new FakeOps();
    const delays: number[] = [];
    const controller = new PosStreamController(ops, {
      retries: 2,
      backoffMs: 100,
      delay(ms) {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    const generation = controller.acquire();
    await controller.enable(generation, ['1'], 10);

    ops.failuresLeft.set('1', 2); // first two disable attempts are rejected
    const released = await controller.release(generation);

    expect(released.disabled).toEqual(['1']);
    expect(released.failed).toEqual([]);
    expect(controller.ownedIds).toEqual([]);
    expect(delays).toEqual([100, 200]); // exponential backoff between attempts
  });

  test('exhausted disable retries retain the debt and surface the failure', async () => {
    const ops = new FakeOps();
    const onReleaseFailure = jest.fn();
    const controller = new PosStreamController(ops, {
      retries: 1,
      delay: immediateDelay,
      onReleaseFailure,
    });
    const generation = controller.acquire();
    await controller.enable(generation, ['1'], 10);

    ops.failuresLeft.set('1', 99);
    const released = await controller.release(generation);
    expect(released.disabled).toEqual([]);
    expect(released.failed).toMatchObject([{ id: '1' }]);
    expect(onReleaseFailure).toHaveBeenCalledWith(['1']);
    // the debt survives: a later release retries and can succeed
    expect(controller.ownedIds).toEqual(['1']);

    ops.failuresLeft.set('1', 0);
    const retried = await controller.release(generation);
    expect(retried.disabled).toEqual(['1']);
    expect(controller.ownedIds).toEqual([]);
  });

  test('re-enabling an owned device is idempotent (no duplicate write)', async () => {
    const ops = new FakeOps();
    const controller = new PosStreamController(ops, {
      delay: immediateDelay,
    });
    const generation = controller.acquire();
    await controller.enable(generation, ['1'], 10);
    const second = await controller.enable(generation, ['1'], 10);

    expect(second.enabled).toEqual(['1']);
    expect(ops.writeLog).toEqual([{ id: '1', rateHz: 10 }]);
  });

  test('explicit disable from a dead generation is a no-op', async () => {
    const ops = new FakeOps();
    const controller = new PosStreamController(ops, {
      delay: immediateDelay,
    });
    const gen1 = controller.acquire();
    await controller.enable(gen1, ['1'], 10);
    controller.acquire(); // gen1 is dead now

    const outcome = await controller.disable(gen1);
    expect(outcome).toEqual({ disabled: [], failed: [] });
    expect(controller.ownedIds).toEqual(['1']); // debt untouched
  });
});
