import { describe, it, expect, vi, afterEach } from 'vitest';
import '../../../src/ts/main/components/md-main-operation-panel';
import '../../../src/ts/main/components/md-main-encryption-fields';
import type { MdMainOperationPanel } from '../../../src/ts/main/components/md-main-operation-panel';
import type { MdMainEncryptionFields } from '../../../src/ts/main/components/md-main-encryption-fields';
import type {
  MainPageState,
  OperationState,
  EncryptionState,
  EncryptionMode,
} from '../../../src/ts/main/types';

function enc(mode: EncryptionMode = 'none'): EncryptionState {
  return {
    required: mode !== 'none',
    mode,
    keyfilePresent: false,
    allowReformat: false,
    poolNames: ['cache'],
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
    busy: 0,
    ...over,
  };
}
function state(o: Partial<OperationState> = {}): MainPageState {
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
      errors: 0,
      corrected: null,
      last: null,
      scheduleEnabled: true,
    },
    operation: op(o),
    serverVersion: '7.3.1',
    csrfToken: 'CSRF',
  };
}

async function mount(s: MainPageState): Promise<MdMainOperationPanel> {
  const el = document.createElement('md-main-operation-panel') as MdMainOperationPanel;
  el.state = s;
  el.csrf = 'CSRF';
  document.body.appendChild(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return el;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('md-main-operation-panel', () => {
  it('Stopped + valid → Start enabled', async () => {
    const el = await mount(state({ fsState: 'Stopped', mdState: 'STOPPED' }));
    const btn = el.shadowRoot!.querySelector('button.action') as HTMLButtonElement;
    expect(btn.textContent?.trim()).toBe('Start');
    expect(btn.disabled).toBe(false);
  });

  it('Started → Stop button; clicking it confirms then POSTs cmdStop', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    const el = await mount(state({ fsState: 'Started', mdState: 'STARTED' }));
    const btn = el.shadowRoot!.querySelector('button.action.stop') as HTMLButtonElement;
    expect(btn.textContent?.trim()).toBe('Stop');
    btn.click();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalled();
    expect((fetchMock.mock.calls[0][1] as { body: string }).body).toContain('cmdStop=Stop');
  });

  it('DISABLE_DISK → Start disabled until confirm checkbox ticked', async () => {
    const el = await mount(state({ fsState: 'Stopped', mdState: 'DISABLE_DISK' }));
    let btn = el.shadowRoot!.querySelector('button.action') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    const cb = el.shadowRoot!.querySelector('.gate input[type="checkbox"]') as HTMLInputElement;
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    btn = el.shadowRoot!.querySelector('button.action') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('ERROR:NO_DATA_DISKS → Start hard-disabled (no override)', async () => {
    const el = await mount(state({ fsState: 'Stopped', mdState: 'ERROR:NO_DATA_DISKS' }));
    const btn = el.shadowRoot!.querySelector('button.action') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(el.shadowRoot!.querySelector('.gate')).toBeNull(); // no confirm gate offered
  });

  it('encrypted (missing-key) → Start disabled, encryption fields rendered', async () => {
    const el = await mount(
      state({ fsState: 'Stopped', mdState: 'STOPPED', encryption: enc('missing-key') }),
    );
    const btn = el.shadowRoot!.querySelector('button.action') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(el.shadowRoot!.querySelector('md-main-encryption-fields')).not.toBeNull();
  });
});

describe('md-main-encryption-fields — guarded reformat', () => {
  async function mountEnc(mode: EncryptionMode): Promise<MdMainEncryptionFields> {
    const el = document.createElement('md-main-encryption-fields') as MdMainEncryptionFields;
    el.encryption = enc(mode);
    document.body.appendChild(el);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    return el;
  }

  it('valid passphrase makes entry valid (missing-key, no reformat)', async () => {
    const el = await mountEnc('missing-key');
    const pass = el.shadowRoot!.querySelector('#enc-pass') as HTMLInputElement;
    pass.value = 'hunter2';
    pass.dispatchEvent(new Event('input'));
    expect(el.getKeyEntry().valid).toBe(true);
  });

  it('wrong-key reformat stays invalid until ack + matching retype', async () => {
    const el = await mountEnc('wrong-key');
    // tick permit-reformat
    const reformat = el.shadowRoot!.querySelector('.danger-ack input') as HTMLInputElement;
    reformat.checked = true;
    reformat.dispatchEvent(new Event('change'));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const pass = el.shadowRoot!.querySelector('#enc-pass') as HTMLInputElement;
    pass.value = 'secret';
    pass.dispatchEvent(new Event('input'));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const retype = el.shadowRoot!.querySelector('#enc-retype') as HTMLInputElement;
    retype.value = 'secret';
    retype.dispatchEvent(new Event('input'));
    // still invalid — no second acknowledgement yet
    expect(el.getKeyEntry().valid).toBe(false);
    // now acknowledge
    const acks = el.shadowRoot!.querySelectorAll('.danger-ack input');
    const ack = acks[acks.length - 1] as HTMLInputElement;
    ack.checked = true;
    ack.dispatchEvent(new Event('change'));
    const entry = el.getKeyEntry();
    expect(entry.reformat).toBe(true);
    expect(entry.valid).toBe(true);
  });
});
