import { describe, expect, test } from '@jest/globals';

import { PosStreamGuard } from '~/features/rtls/pos-stream-guard';

describe('PosStreamGuard', () => {
  test('tracks only the devices whose enable was accepted', () => {
    const guard = new PosStreamGuard();
    guard.noteEnabled([
      { id: '1', accepted: true },
      { id: '2', accepted: false, error: 'timeout' },
      { id: '3', accepted: true },
    ]);
    expect(guard.size).toBe(2);
    expect(guard.takeForRelease().sort()).toEqual(['1', '3']);
  });

  test('an explicit accepted disable clears the debt for that device', () => {
    const guard = new PosStreamGuard();
    guard.noteEnabled([
      { id: '1', accepted: true },
      { id: '2', accepted: true },
    ]);
    // device 2 refuses the disable: it stays owed, so teardown retries it
    guard.noteDisabled([
      { id: '1', accepted: true },
      { id: '2', accepted: false, error: 'timeout' },
    ]);
    expect(guard.takeForRelease()).toEqual(['2']);
  });

  test('takeForRelease empties the guard (teardown owns the rest)', () => {
    const guard = new PosStreamGuard();
    guard.noteEnabled([{ id: '7', accepted: true }]);
    expect(guard.takeForRelease()).toEqual(['7']);
    expect(guard.size).toBe(0);
    // a second release (e.g. StrictMode double-unmount) is a no-op
    expect(guard.takeForRelease()).toEqual([]);
  });

  test('re-enabling is idempotent', () => {
    const guard = new PosStreamGuard();
    guard.noteEnabled([{ id: '1', accepted: true }]);
    guard.noteEnabled([{ id: '1', accepted: true }]);
    expect(guard.size).toBe(1);
  });

  test('a disable of a device the panel never enabled is ignored', () => {
    const guard = new PosStreamGuard();
    guard.noteDisabled([{ id: '9', accepted: true }]);
    expect(guard.size).toBe(0);
  });
});
