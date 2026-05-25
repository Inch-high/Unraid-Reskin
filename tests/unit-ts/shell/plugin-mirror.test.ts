import { describe, it, expect } from 'vitest';
import { matchPlugin, type PluginEntry } from '../../../src/ts/shell/plugin-mirror';

const BOTTOM_REGISTRY: PluginEntry[] = [
  { name: 'dynamix.system.temp', selector: '.dynamix-system-temp', slot: 'cpu-temp', label: 'CPU temp' },
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
});
