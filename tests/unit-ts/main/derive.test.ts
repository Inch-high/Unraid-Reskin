import { describe, it, expect } from 'vitest';
import { deriveOperation } from '../../../src/ts/main/derive';
import type { OperationState, EncryptionState, EncryptionMode } from '../../../src/ts/main/types';

// OperationState literals per scenario. The var-*.ini fixtures (Task 1) cover
// the disks.ini/var.ini → OperationState mapping in the PHP main-state test;
// here we exhaustively test the pure derivation that turns that state into the
// Start/Stop verdict.
function enc(mode: EncryptionMode = 'none'): EncryptionState {
  return {
    required: mode !== 'none',
    mode,
    keyfilePresent: false,
    allowReformat: false,
    poolNames: [],
  };
}
function op(over: Partial<OperationState> = {}): OperationState {
  return {
    fsState: 'Stopped',
    mdState: 'STOPPED',
    mdColor: 'green-blink',
    protected: false,
    configValid: 'yes',
    startMode: 'Normal',
    counts: { disks: 14, disabled: 0, invalid: 0, missing: 0, new: 0 },
    unmountableMask: '',
    encryption: enc(),
    moverEnabled: true,
    ...over,
  };
}

describe('deriveOperation — Started / transitional', () => {
  it('Started → Stop enabled when idle', () => {
    const r = deriveOperation(op({ fsState: 'Started', mdState: 'STARTED', busy: 0 }));
    expect(r.label).toBe('Stop');
    expect(r.enabled).toBe(true);
  });
  it('Started + busy(parity) → Stop disabled with reason', () => {
    const r = deriveOperation(op({ fsState: 'Started', mdState: 'STARTED', busy: 1 }));
    expect(r.label).toBe('Stop');
    expect(r.enabled).toBe(false);
    expect(r.reason).toMatch(/parity/i);
  });
  it('busy mover / btrfs also disable Stop', () => {
    expect(deriveOperation(op({ fsState: 'Started', busy: 2 })).reason).toMatch(/mover/i);
    expect(deriveOperation(op({ fsState: 'Started', busy: 3 })).enabled).toBe(false);
  });
  it('Starting / Stopping / Formatting → disabled spinner labels', () => {
    expect(deriveOperation(op({ fsState: 'Starting' }))).toMatchObject({
      label: 'Starting…',
      enabled: false,
    });
    expect(deriveOperation(op({ fsState: 'Stopping' }))).toMatchObject({
      label: 'Stopping…',
      enabled: false,
    });
    expect(deriveOperation(op({ fsState: 'Formatting' }))).toMatchObject({
      label: 'Formatting…',
      enabled: false,
    });
  });
  it('Copying / Clearing → Cancel enabled', () => {
    expect(deriveOperation(op({ fsState: 'Copying' }))).toMatchObject({
      label: 'Cancel',
      enabled: true,
    });
    expect(deriveOperation(op({ fsState: 'Clearing' }))).toMatchObject({
      label: 'Cancel',
      enabled: true,
    });
  });
});

describe('deriveOperation — Stopped + configValid gates', () => {
  for (const [cv, rx] of [
    ['error', /registration/i],
    ['invalid', /devices/i],
    ['ineligible', /Unraid OS/i],
    ['nokeyserver', /key-server/i],
    ['withdrawn', /withdrawn/i],
  ] as const) {
    it(`configValid=${cv} → Start disabled with reason`, () => {
      const r = deriveOperation(op({ configValid: cv }));
      expect(r.label).toBe('Start');
      expect(r.enabled).toBe(false);
      expect(r.reason).toMatch(rx);
    });
  }
});

describe('deriveOperation — Stopped mdState machine', () => {
  it('STARTED/STOPPED → Start enabled, maintenance field offered', () => {
    expect(deriveOperation(op({ mdState: 'STARTED' }))).toMatchObject({
      label: 'Start',
      enabled: true,
      requiresMaintenanceField: true,
    });
    expect(deriveOperation(op({ mdState: 'STOPPED' }))).toMatchObject({
      label: 'Start',
      enabled: true,
      requiresConfirm: false,
    });
  });
  it('STOPPED + missing pool disk → confirm-gated, disabled until confirm', () => {
    const r = deriveOperation(op({ mdState: 'STOPPED' }), { missingPoolDisk: true });
    expect(r.enabled).toBe(false);
    expect(r.requiresConfirm).toBe(true);
    expect(r.reason).toMatch(/pool disk/i);
  });
  it('NEW_ARRAY → Start enabled with unprotected warning', () => {
    const r = deriveOperation(op({ mdState: 'NEW_ARRAY' }));
    expect(r.enabled).toBe(true);
    expect(r.reason).toMatch(/unprotected/i);
  });
  it('DISABLE_DISK → confirm-gated, disabled until confirm', () => {
    const r = deriveOperation(op({ mdState: 'DISABLE_DISK' }));
    expect(r.enabled).toBe(false);
    expect(r.requiresConfirm).toBe(true);
    expect(r.reason).toMatch(/disable the missing disk/i);
  });
  it('RECON_DISK → Start enabled (rebuild)', () => {
    expect(deriveOperation(op({ mdState: 'RECON_DISK' }))).toMatchObject({
      label: 'Start',
      enabled: true,
    });
  });
  it('SWAP_DSBL mid-copy → confirm-gated; complete → Start enabled', () => {
    expect(deriveOperation(op({ mdState: 'SWAP_DSBL' }))).toMatchObject({
      enabled: false,
      requiresConfirm: true,
    });
    expect(deriveOperation(op({ mdState: 'SWAP_DSBL' }), { swapCopyComplete: true })).toMatchObject(
      { enabled: true },
    );
  });
  for (const [md, rx] of [
    ['ERROR:INVALID_EXPANSION', /expansion/i],
    ['ERROR:NEW_DISK_TOO_SMALL', /bigger/i],
    ['ERROR:PARITY_NOT_BIGGEST', /parity slot/i],
    ['ERROR:TOO_MANY_MISSING_DISKS', /missing disks/i],
    ['ERROR:NO_DATA_DISKS', /data disks/i],
    ['ERROR:NO_DEVICES', /devices/i],
  ] as const) {
    it(`${md} → Start disabled with explanation`, () => {
      const r = deriveOperation(op({ mdState: md }));
      expect(r.enabled).toBe(false);
      expect(r.reason).toMatch(rx);
      expect(r.requiresMaintenanceField).toBe(false);
    });
  }
});

describe('deriveOperation — encryption gate', () => {
  for (const mode of ['enter-new', 'missing-key', 'wrong-key'] as const) {
    it(`${mode} → Start disabled until key supplied`, () => {
      const r = deriveOperation(op({ mdState: 'STOPPED', encryption: enc(mode) }));
      expect(r.enabled).toBe(false);
      expect(r.reason).toMatch(/key/i);
    });
  }
  it('unlocked → no extra gate (Start enabled)', () => {
    expect(deriveOperation(op({ mdState: 'STOPPED', encryption: enc('unlocked') })).enabled).toBe(
      true,
    );
  });
  it('encryption gate overrides even an otherwise-enabled RECON_DISK', () => {
    expect(
      deriveOperation(op({ mdState: 'RECON_DISK', encryption: enc('missing-key') })).enabled,
    ).toBe(false);
  });
});
