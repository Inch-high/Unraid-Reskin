import { describe, it, expect } from 'vitest';
import '../../../src/ts/main/components/md-main-device-tile';
import type { MdMainDeviceTile } from '../../../src/ts/main/components/md-main-device-tile';
import type { MainDevice } from '../../../src/ts/main/types';

function device(over: Partial<MainDevice> = {}): MainDevice {
  return {
    name: 'disk1', role: 'data', deviceType: 'hdd', linuxDevice: 'sdk',
    model: 'ST12000VN0008-2YS101', serial: 'ZRT0Q2AK',
    status: 'ok', spin: 'active', spunDown: false, tempC: 38,
    numReads: 1611274, numWrites: 909, numErrors: 0,
    fsType: 'xfs', encrypted: false, luksState: null,
    sizeBytes: 12_000_138_571_776, fsSizeBytes: 11_997_984_796_672,
    fsUsedBytes: 9_000_020_344_832, fsFreeBytes: 2_997_964_451_840,
    utilizationPct: 75, color: 'green-on', orb: 'green', smart: 'healthy',
    detailHref: '/Main/Device?name=disk1', ...over,
  };
}

async function mount(d: MainDevice, util: 'bar' | 'ring' = 'bar'): Promise<MdMainDeviceTile> {
  const el = document.createElement('md-main-device-tile') as MdMainDeviceTile;
  el.device = d;
  el.util = util;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('md-main-device-tile', () => {
  it('renders name, model, type tag, and detail link', async () => {
    const el = await mount(device({ deviceType: 'nvme', name: 'cache', detailHref: '/Main/Device?name=cache' }));
    const txt = el.shadowRoot!.textContent ?? '';
    expect(txt).toContain('cache');
    expect(txt).toContain('ST12000VN0008-2YS101');
    expect(txt).toContain('NVMe');                       // type tag label
    expect(el.getAttribute('data-type')).toBe('nvme');   // host hook for accent icon
    expect(el.shadowRoot!.querySelector('a')?.getAttribute('href')).toBe('/Main/Device?name=cache');
  });

  it('dims and hides temperature when spun down', async () => {
    const el = await mount(device({ spunDown: true, spin: 'standby', tempC: null }));
    expect(el.hasAttribute('data-standby')).toBe(true);
    const txt = el.shadowRoot!.textContent ?? '';
    expect(txt).toContain('standby');
    expect(txt).toContain('—');                          // temp dash
  });

  it('flags a problem device (red border hook + red name)', async () => {
    const el = await mount(device({ status: 'unmountable' }));
    expect(el.hasAttribute('data-problem')).toBe(true);
    expect(el.hasAttribute('data-standby')).toBe(false); // problem takes precedence
    expect(el.shadowRoot!.querySelector('.state.s-problem')).not.toBeNull();
  });

  it('renders a bar with width in bar mode', async () => {
    const el = await mount(device({ utilizationPct: 75 }), 'bar');
    const span = el.shadowRoot!.querySelector('.bar > span') as HTMLElement;
    expect(span).not.toBeNull();
    expect(span.getAttribute('style')).toContain('width:75%');
    expect(el.shadowRoot!.querySelector('.cap-ring')).toBeNull();
  });

  it('renders a ring with conic --p in ring mode, and tints when high/full', async () => {
    const el = await mount(device({ utilizationPct: 95 }), 'ring');
    const ring = el.shadowRoot!.querySelector('.ring') as HTMLElement;
    expect(ring).not.toBeNull();
    expect(ring.getAttribute('style')).toContain('--p:95');
    expect(ring.classList.contains('full')).toBe(true);  // ≥95 → danger
    expect(el.shadowRoot!.querySelector('.bar')).toBeNull();
  });

  it('shows a no-filesystem caption for parity instead of a gauge', async () => {
    const el = await mount(device({ name: 'parity', role: 'parity', fsType: null, utilizationPct: null, fsSizeBytes: null, fsUsedBytes: null }));
    const txt = el.shadowRoot!.textContent ?? '';
    expect(txt).toContain('no filesystem');
    expect(el.shadowRoot!.querySelector('.bar')).toBeNull();
    expect(el.shadowRoot!.querySelector('.cap-ring')).toBeNull();
  });

  it('flags non-zero errors', async () => {
    const el = await mount(device({ numErrors: 5 }));
    expect(el.shadowRoot!.querySelector('.chip.err-bad')).not.toBeNull();
  });
});
