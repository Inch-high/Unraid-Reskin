import { describe, it, expect } from 'vitest';
import '../../../src/ts/main/components/md-main-capacity-hero';
import type { MdMainCapacityHero } from '../../../src/ts/main/components/md-main-capacity-hero';
import type { MainArray, MainDevice } from '../../../src/ts/main/types';

function device(over: Partial<MainDevice> = {}): MainDevice {
  return {
    name: 'disk1',
    role: 'data',
    deviceType: 'hdd',
    linuxDevice: 'sdk',
    model: 'M',
    serial: 'S',
    status: 'ok',
    spin: 'active',
    spunDown: false,
    tempC: 38,
    numReads: 0,
    numWrites: 0,
    numErrors: 0,
    fsType: 'xfs',
    encrypted: false,
    luksState: null,
    sizeBytes: 12e12,
    fsSizeBytes: 12e12,
    fsUsedBytes: 9e12,
    fsFreeBytes: 3e12,
    utilizationPct: 75,
    color: 'green-on',
    orb: 'green',
    smart: 'healthy',
    detailHref: '/Main/Device?name=disk1',
    ...over,
  };
}

async function mount(array: MainArray, isProtected: boolean): Promise<MdMainCapacityHero> {
  const el = document.createElement('md-main-capacity-hero') as MdMainCapacityHero;
  el.array = array;
  el.isProtected = isProtected;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('md-main-capacity-hero', () => {
  const array: MainArray = {
    devices: [
      device({ name: 'parity', role: 'parity' }),
      device({ name: 'disk1' }),
      device({ name: 'disk2', status: 'unmountable', smart: 'failed' }),
    ],
    sizeBytes: 24e12,
    usedBytes: 18e12,
    freeBytes: 6e12,
    utilizationPct: 75,
  };

  it('shows used/total/free, bar width, and derived counts', async () => {
    const el = await mount(array, true);
    const txt = el.shadowRoot!.textContent ?? '';
    expect(txt).toContain('used of');
    expect(txt).toContain('free');
    expect(txt).toContain('Valid'); // protected
    expect(txt).toContain('1 + 2'); // 1 parity + 2 data
    expect(txt).toContain('2 / 3'); // 2 healthy of 3 (disk2 failed)
    const bar = el.shadowRoot!.querySelector('.bar > span') as HTMLElement;
    expect(bar.getAttribute('style')).toContain('width:75%');
  });

  it('reads Unprotected when parity is invalid and tints the bar high', async () => {
    const el = await mount({ ...array, utilizationPct: 90 }, false);
    const txt = el.shadowRoot!.textContent ?? '';
    expect(txt).toContain('Unprotected');
    expect(
      (el.shadowRoot!.querySelector('.bar > span') as HTMLElement).classList.contains('high'),
    ).toBe(true);
  });
});
