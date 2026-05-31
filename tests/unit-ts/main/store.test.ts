import { describe, it, expect, vi } from 'vitest';
import { createMainStore } from '../../../src/ts/main/store';
import type { MainPageState } from '../../../src/ts/main/types';

function fakeState(): MainPageState {
  return {
    array: { devices: [], sizeBytes: null, usedBytes: null, freeBytes: null, utilizationPct: null },
    pools: [],
    boot: null,
    parity: {
      action: null,
      correcting: false,
      running: false,
      paused: false,
      posBytes: null,
      sizeBytes: null,
      pct: null,
      speed: null,
      errors: null,
      corrected: null,
      last: null,
      scheduleEnabled: true,
    },
    operation: {
      fsState: 'Started',
      mdState: 'STARTED',
      mdColor: 'green-on',
      protected: true,
      configValid: 'yes',
      startMode: 'Normal',
      counts: { disks: 0, disabled: 0, invalid: 0, missing: 0, new: 0 },
      unmountableMask: '',
      encryption: {
        required: false,
        mode: 'none',
        keyfilePresent: false,
        allowReformat: false,
        poolNames: [],
      },
      moverEnabled: true,
    },
    serverVersion: '7.3.1',
    csrfToken: 'X',
  };
}

describe('main store', () => {
  it('starts loading with null state', () => {
    const s = createMainStore();
    expect(s.isLoading()).toBe(true);
    expect(s.getState()).toBeNull();
    expect(s.getBusy()).toBe(0);
  });

  it('setState clears loading, stores state, and notifies', () => {
    const s = createMainStore();
    const cb = vi.fn();
    s.subscribe(cb);
    s.setState(fakeState());
    expect(s.isLoading()).toBe(false);
    expect(s.getState()?.operation.mdState).toBe('STARTED');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('setState stamps the current busy onto operation', () => {
    const s = createMainStore();
    s.setBusy(1);
    s.setState(fakeState());
    expect(s.getState()?.operation.busy).toBe(1);
  });

  it('setBusy updates the live signal, dedupes, and rewrites operation.busy', () => {
    const s = createMainStore();
    s.setState(fakeState());
    const cb = vi.fn();
    s.subscribe(cb);
    s.setBusy(2);
    expect(s.getBusy()).toBe(2);
    expect(s.getState()?.operation.busy).toBe(2);
    expect(cb).toHaveBeenCalledTimes(1);
    s.setBusy(2); // same value → no notify
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops notifications', () => {
    const s = createMainStore();
    const cb = vi.fn();
    const unsub = s.subscribe(cb);
    unsub();
    s.setState(fakeState());
    expect(cb).not.toHaveBeenCalled();
  });
});
