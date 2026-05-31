import { describe, it, expect } from 'vitest';
import { matchPlugin, REGISTRY, type PluginEntry } from '../../../src/ts/shell/plugin-mirror';

const BOTTOM_REGISTRY: PluginEntry[] = [
  {
    name: 'dynamix.system.temp',
    selector: '.dynamix-system-temp',
    slot: 'cpu-temp',
    label: 'CPU temp',
  },
  { name: 'dynamix.ups', selector: '.nut_status', slot: 'ups', label: 'UPS' },
];

describe('matchPlugin', () => {
  it('matches a node against the first registry entry whose selector hits', () => {
    const div = document.createElement('div');
    div.className = 'dynamix-system-temp';
    expect(matchPlugin(div, BOTTOM_REGISTRY)?.name).toBe('dynamix.system.temp');
  });

  it('matches a node by descendant selector (the registry entry uses a child class)', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    child.className = 'nut_status';
    parent.appendChild(child);
    expect(matchPlugin(parent, BOTTOM_REGISTRY)?.name).toBe('dynamix.ups');
  });

  it('returns null when no registry entry matches', () => {
    const div = document.createElement('div');
    div.className = 'something-else';
    expect(matchPlugin(div, BOTTOM_REGISTRY)).toBeNull();
  });

  it('returns null for empty registry', () => {
    const div = document.createElement('div');
    div.className = 'dynamix-system-temp';
    expect(matchPlugin(div, [])).toBeNull();
  });

  it('swallows unsupported selector syntax instead of throwing', () => {
    const broken: PluginEntry[] = [
      { name: 'bad', selector: ':!!invalid' },
      { name: 'good', selector: '.real' },
    ];
    const div = document.createElement('div');
    div.className = 'real';
    expect(matchPlugin(div, broken)?.name).toBe('good');
  });
});

describe('REGISTRY bottom — Unraid 7.3 Vue footer shape', () => {
  // 7.3 renders <footer> with two halves; the right half contains bare <span>
  // elements with FontAwesome <i> children for temp / battery / power readings.
  function makeFooterRight(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'footer-right';
    wrap.innerHTML = `
      <span><i class="fa fa-thermometer"></i> 45°C 52°C</span>
      <span><i class="fa fa-battery-three-quarters"></i> 100%</span>
      <span><i class="fa fa-flash"></i> 87 W</span>
    `;
    return wrap;
  }

  it('matches the temp span by :has(i.fa-thermometer)', () => {
    const right = makeFooterRight();
    const tempSpan = right.querySelector('span:has(i.fa-thermometer)');
    expect(tempSpan).not.toBeNull();
    expect(matchPlugin(tempSpan!, REGISTRY.bottom)?.name).toBe('dynamix.system.temp');
  });

  it('matches the UPS span by :has(i.fa-battery-three-quarters)', () => {
    const right = makeFooterRight();
    const upsSpan = right.querySelector('span:has(i.fa-battery-three-quarters)');
    expect(upsSpan).not.toBeNull();
    expect(matchPlugin(upsSpan!, REGISTRY.bottom)?.name).toBe('dynamix.ups');
  });

  it('matches the power span by :has(i.fa-flash)', () => {
    const right = makeFooterRight();
    const powerSpan = right.querySelector('span:has(i.fa-flash)');
    expect(powerSpan).not.toBeNull();
    expect(matchPlugin(powerSpan!, REGISTRY.bottom)?.name).toBe('dynamix.system.stats');
  });

  it('still matches the legacy Dynamix class shape (pre-7.3 fallback)', () => {
    const span = document.createElement('span');
    span.className = 'dynamix-system-temp';
    expect(matchPlugin(span, REGISTRY.bottom)?.name).toBe('dynamix.system.temp');
  });

  it('still matches the legacy NUT class shape (pre-7.3 fallback)', () => {
    const span = document.createElement('span');
    span.className = 'nut_status';
    expect(matchPlugin(span, REGISTRY.bottom)?.name).toBe('dynamix.ups');
  });
});

describe('REGISTRY topbar — plugin button matching', () => {
  it('matches apcupsd by power-button class', () => {
    const a = document.createElement('a');
    a.className = 'apcupsd-power-button';
    expect(matchPlugin(a, REGISTRY.topbar)?.name).toBe('apcupsd');
  });

  it('matches apcupsd via href substring (covers 7.3 layouts that drop the class)', () => {
    const a = document.createElement('a');
    a.setAttribute('href', '/Settings/apcupsd');
    expect(matchPlugin(a, REGISTRY.topbar)?.name).toBe('apcupsd');
  });
});
